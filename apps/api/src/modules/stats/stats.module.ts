import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { OrderStatus, Prisma, StaffRole } from '@prisma/client';
import { StaffOnly } from '../../common/auth';
import { num, round2 } from '../../common/money';
import { RequiresFeature } from '../../config/features';
import { PrismaService } from '../../prisma/prisma.service';
import { OPEN_STATUSES } from '../tables/tables.module';

const TZ = process.env.RESTAURANT_TZ || 'Australia/Melbourne';
const n = (v: unknown) => Number(v ?? 0);

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  private startOfLocalDay(daysAgo = 0) {
    // Midnight in the restaurant's time zone, as a UTC Date.
    const now = new Date();
    const local = new Date(now.toLocaleString('en-US', { timeZone: TZ }));
    const offset = now.getTime() - local.getTime();
    local.setHours(0, 0, 0, 0);
    local.setDate(local.getDate() - daysAgo);
    return new Date(local.getTime() + offset);
  }

  async overview(rangeDays: number) {
    const today = this.startOfLocalDay(0);
    const since = this.startOfLocalDay(rangeDays - 1);
    const prevSince = this.startOfLocalDay(rangeDays * 2 - 1);
    const paid = { status: OrderStatus.PAID };

    const [todayAgg, rangeAgg, prevAgg, openOrders, tables, tips] = await Promise.all([
      this.prisma.order.aggregate({ where: { ...paid, paidAt: { gte: today } }, _sum: { total: true }, _count: true, _avg: { total: true } }),
      this.prisma.order.aggregate({ where: { ...paid, paidAt: { gte: since } }, _sum: { total: true }, _count: true, _avg: { total: true } }),
      this.prisma.order.aggregate({ where: { ...paid, paidAt: { gte: prevSince, lt: since } }, _sum: { total: true }, _count: true }),
      this.prisma.order.count({ where: { status: { in: OPEN_STATUSES } } }),
      this.prisma.table.groupBy({ by: ['status'], where: { active: true }, _count: true, _sum: { guests: true } }),
      this.prisma.order.aggregate({ where: { ...paid, paidAt: { gte: since } }, _sum: { tip: true } }),
    ]);

    const revenueByDay = await this.prisma.$queryRaw<{ day: Date; revenue: unknown; orders: unknown }[]>(Prisma.sql`
      SELECT date_trunc('day', ("paidAt" AT TIME ZONE 'UTC') AT TIME ZONE ${TZ}) AS day,
             SUM(total) AS revenue, COUNT(*) AS orders
      FROM "Order"
      WHERE status = 'PAID' AND "paidAt" >= ${since}
      GROUP BY 1 ORDER BY 1`);

    const byHour = await this.prisma.$queryRaw<{ hour: number; orders: unknown }[]>(Prisma.sql`
      SELECT EXTRACT(HOUR FROM ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${TZ})::int AS hour, COUNT(*) AS orders
      FROM "Order"
      WHERE status <> 'CANCELLED' AND "createdAt" >= ${since}
      GROUP BY 1 ORDER BY 1`);

    const topItems = await this.prisma.orderItem.groupBy({
      by: ['name'],
      where: { order: { status: OrderStatus.PAID, paidAt: { gte: since } } },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 8,
    });

    const itemRevenue = await this.prisma.$queryRaw<{ name: string; revenue: unknown }[]>(Prisma.sql`
      SELECT oi.name, SUM(oi."unitPrice" * oi.quantity) AS revenue
      FROM "OrderItem" oi JOIN "Order" o ON o.id = oi."orderId"
      WHERE o.status = 'PAID' AND o."paidAt" >= ${since}
      GROUP BY oi.name`);
    const revenueByName = new Map(itemRevenue.map((r) => [r.name, n(r.revenue)]));

    const paymentMix = await this.prisma.payment.groupBy({
      by: ['method'],
      where: { status: 'SUCCEEDED', createdAt: { gte: since } },
      _sum: { amount: true },
      _count: true,
    });

    const sources = await this.prisma.order.groupBy({
      by: ['source'],
      where: { createdAt: { gte: since }, status: { not: OrderStatus.CANCELLED } },
      _count: true,
    });

    // Fill in empty days so the chart has no gaps.
    const days: { date: string; revenue: number; orders: number }[] = [];
    const byKey = new Map(revenueByDay.map((r) => [new Date(r.day).toISOString().slice(0, 10), r]));
    for (let i = rangeDays - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400_000).toLocaleDateString('en-CA', { timeZone: TZ });
      const row = byKey.get(d);
      days.push({ date: d, revenue: round2(n(row?.revenue)), orders: n(row?.orders) });
    }

    const tableCounts = Object.fromEntries(tables.map((t) => [t.status, t._count]));
    const totalTables = tables.reduce((s, t) => s + t._count, 0);
    const busy = totalTables - (tableCounts.AVAILABLE ?? 0) - (tableCounts.RESERVED ?? 0) - (tableCounts.CLEANING ?? 0);
    const revenue = num(rangeAgg._sum.total);
    const prevRevenue = num(prevAgg._sum.total);

    return {
      rangeDays,
      today: {
        revenue: round2(num(todayAgg._sum.total)),
        orders: todayAgg._count,
        avgTicket: round2(num(todayAgg._avg.total)),
      },
      range: {
        revenue: round2(revenue),
        orders: rangeAgg._count,
        avgTicket: round2(num(rangeAgg._avg.total)),
        tips: round2(num(tips._sum.tip)),
        revenueChange: prevRevenue > 0 ? round2(((revenue - prevRevenue) / prevRevenue) * 100) : null,
      },
      live: {
        openOrders,
        tablesBusy: busy,
        tablesTotal: totalTables,
        guestsSeated: tables.reduce((s, t) => s + (t._sum.guests ?? 0), 0),
        tableStatus: tableCounts,
      },
      revenueByDay: days,
      ordersByHour: Array.from({ length: 24 }, (_, h) => ({ hour: h, orders: n(byHour.find((b) => b.hour === h)?.orders) })),
      topItems: topItems.map((t) => ({ name: t.name, quantity: t._sum.quantity ?? 0, revenue: round2(revenueByName.get(t.name) ?? 0) })),
      paymentMix: paymentMix.map((p) => ({ method: p.method, count: p._count, amount: round2(num(p._sum.amount)) })),
      orderSources: sources.map((s) => ({ source: s.source, count: s._count })),
    };
  }

  async customers(rangeDays: number) {
    const since = this.startOfLocalDay(rangeDays - 1);
    const [total, newCustomers, returning, byTier, top, active] = await Promise.all([
      this.prisma.customer.count(),
      this.prisma.customer.count({ where: { createdAt: { gte: since } } }),
      this.prisma.customer.count({ where: { visits: { gt: 1 } } }),
      this.prisma.customer.groupBy({ by: ['tier'], _count: true, _sum: { lifetimeSpend: true, points: true } }),
      this.prisma.customer.findMany({
        orderBy: { lifetimeSpend: 'desc' },
        take: 10,
        select: { id: true, name: true, email: true, tier: true, lifetimeSpend: true, visits: true, lastVisitAt: true, points: true },
      }),
      this.prisma.order.findMany({
        where: { status: OrderStatus.PAID, paidAt: { gte: since }, customerId: { not: null } },
        distinct: ['customerId'],
        select: { customerId: true },
      }),
    ]);

    const tierRevenue = await this.prisma.$queryRaw<{ tier: string; revenue: unknown; orders: unknown }[]>(Prisma.sql`
      SELECT COALESCE(c.tier::text, 'GUEST') AS tier, SUM(o.total) AS revenue, COUNT(*) AS orders
      FROM "Order" o LEFT JOIN "Customer" c ON c.id = o."customerId"
      WHERE o.status = 'PAID' AND o."paidAt" >= ${since}
      GROUP BY 1`);

    const visitsWithSpend = await this.prisma.customer.aggregate({ where: { visits: { gt: 0 } }, _avg: { lifetimeSpend: true, visits: true }, _count: true });
    const visited = visitsWithSpend._count;

    return {
      rangeDays,
      totals: {
        customers: total,
        newCustomers,
        activeInRange: active.length,
        returningRate: visited ? round2((returning / visited) * 100) : 0,
        avgLifetimeSpend: round2(num(visitsWithSpend._avg.lifetimeSpend)),
        avgVisits: round2(num(visitsWithSpend._avg.visits)),
      },
      tiers: byTier.map((t) => ({
        tier: t.tier,
        customers: t._count,
        lifetimeSpend: round2(num(t._sum.lifetimeSpend)),
        outstandingPoints: t._sum.points ?? 0,
      })),
      revenueByTier: tierRevenue.map((r) => ({ tier: r.tier, revenue: round2(n(r.revenue)), orders: n(r.orders) })),
      topCustomers: top,
    };
  }
}

@Controller('stats')
@RequiresFeature('stats')
@StaffOnly(StaffRole.MANAGER)
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  private range(r?: string) {
    const d = Number(r);
    return [1, 7, 14, 30, 90].includes(d) ? d : 7;
  }

  @Get('overview')
  overview(@Query('range') range?: string) {
    return this.stats.overview(this.range(range));
  }

  @Get('customers')
  customers(@Query('range') range?: string) {
    return this.stats.customers(this.range(range));
  }
}

@Module({ controllers: [StatsController], providers: [StatsService] })
export class StatsModule {}
