import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ItemStatus, OrderSource, OrderStatus, OrderType, Prisma, StaffRole, TableStatus, Tier } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { AuthUser, CurrentUser, CustomerOnly, StaffOnly } from '../../common/auth';
import { num, round2 } from '../../common/money';
import { FeaturesService, RequiresFeature } from '../../config/features';
import { PrismaService } from '../../prisma/prisma.service';
import { LoyaltyModule, LoyaltyService, POINT_VALUE } from '../loyalty/loyalty.module';
import { MenuModule, MenuService } from '../menu/menu.module';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { OPEN_STATUSES, TablesModule, TablesService } from '../tables/tables.module';

class OrderLineDto {
  @IsString() menuItemId: string;
  @IsInt() @Min(1) @Max(50) quantity: number;
  @IsOptional() @IsString() @MaxLength(200) notes?: string;
}

class CreateOrderDto {
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => OrderLineDto) items: OrderLineDto[];
  @IsOptional() @IsEnum(OrderType) type?: OrderType;
  /** Customers ordering from the table QR code send the code. */
  @IsOptional() @IsString() tableCode?: string;
  /** Staff taking an order send the table id. */
  @IsOptional() @IsString() tableId?: string;
  /** Staff can attach a known customer so they earn points. */
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() @MaxLength(80) guestName?: string;
  /** Guests can leave an email to be recognised next visit. */
  @IsOptional() @IsEmail() guestEmail?: string;
  @IsOptional() @IsString() @MaxLength(300) notes?: string;
  @IsOptional() @IsInt() @Min(0) redeemPoints?: number;
}

class AddItemsDto {
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => OrderLineDto) items: OrderLineDto[];
}

class StatusDto {
  @IsEnum(OrderStatus) status: OrderStatus;
}

class ItemStatusDto {
  @IsEnum(ItemStatus) status: ItemStatus;
}

// Which status changes staff can make by hand. PAID only happens through the payments module.
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PLACED: [OrderStatus.PREPARING, OrderStatus.READY, OrderStatus.SERVED, OrderStatus.CANCELLED],
  PREPARING: [OrderStatus.READY, OrderStatus.SERVED, OrderStatus.CANCELLED],
  READY: [OrderStatus.SERVED, OrderStatus.PREPARING],
  SERVED: [OrderStatus.READY],
  PAID: [],
  CANCELLED: [],
};

export const ORDER_INCLUDE = {
  items: { orderBy: { id: 'asc' } },
  table: { select: { id: true, label: true, code: true } },
  customer: { select: { id: true, name: true, tier: true, email: true } },
  staff: { select: { id: true, name: true } },
  payments: { select: { id: true, amount: true, tip: true, method: true, status: true, createdAt: true } },
} satisfies Prisma.OrderInclude;

export type FullOrder = Prisma.OrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

@Injectable()
export class OrdersService {
  readonly taxRate = Number(process.env.TAX_RATE ?? 0.1);
  readonly taxInclusive = (process.env.TAX_INCLUSIVE ?? 'true') !== 'false';

  constructor(
    private readonly prisma: PrismaService,
    private readonly menu: MenuService,
    private readonly loyalty: LoyaltyService,
    private readonly tables: TablesService,
    private readonly realtime: RealtimeGateway,
    private readonly features: FeaturesService,
  ) {}

  /** Tax and total from a discounted subtotal. Prices are GST-inclusive by default. */
  private totals(subtotal: number, discount: number) {
    const net = round2(Math.max(0, subtotal - discount));
    const tax = this.taxInclusive ? round2((net * this.taxRate) / (1 + this.taxRate)) : round2(net * this.taxRate);
    const total = this.taxInclusive ? net : round2(net + tax);
    return { tax, total };
  }

  private async resolveCustomer(dto: CreateOrderDto, user?: AuthUser): Promise<string | null> {
    if (user?.kind === 'customer') return user.sub;
    if (user?.kind === 'staff' && dto.customerId) {
      const c = await this.prisma.customer.findUnique({ where: { id: dto.customerId } });
      if (!c) throw new BadRequestException('Customer not found');
      return c.id;
    }
    if (dto.guestEmail) {
      // Guests are tracked by email so returning visitors build history (and can claim it by signing up).
      const email = dto.guestEmail.toLowerCase();
      const c = await this.prisma.customer.upsert({
        where: { email },
        update: {},
        create: { email, name: dto.guestName || email.split('@')[0] },
      });
      return c.id;
    }
    return null;
  }

  async create(dto: CreateOrderDto, user?: AuthUser): Promise<FullOrder> {
    const isStaff = user?.kind === 'staff';
    let tableId: string | null = null;
    if (this.features.isEnabled('tables')) {
      if (dto.tableCode) {
        tableId = (await this.tables.byCode(dto.tableCode)).id;
      } else if (dto.tableId && isStaff) {
        tableId = dto.tableId;
      }
    }
    const type = dto.type ?? (tableId ? OrderType.DINE_IN : OrderType.TAKEAWAY);
    if (type === OrderType.DINE_IN && this.features.isEnabled('tables') && !tableId) {
      throw new BadRequestException('Choose a table for dine-in orders');
    }

    const customerId = await this.resolveCustomer(dto, user);
    const tier = customerId
      ? ((await this.prisma.customer.findUnique({ where: { id: customerId }, select: { tier: true } }))?.tier ?? Tier.MEMBER)
      : Tier.MEMBER;

    const priced = await this.menu.priceItems([...new Set(dto.items.map((i) => i.menuItemId))], tier);
    const lines = dto.items.map((l) => {
      const p = priced.get(l.menuItemId)!;
      return { menuItemId: p.id, name: p.name, unitPrice: p.unitPrice, quantity: l.quantity, notes: l.notes };
    });
    const subtotal = round2(lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0));
    // Points can only be redeemed by the signed-in customer themselves.
    const quote = await this.loyalty.quote(customerId, subtotal, user?.kind === 'customer' ? (dto.redeemPoints ?? 0) : 0);
    const discount = round2(quote.tierDiscount + quote.pointsDiscount);
    const { tax, total } = this.totals(subtotal, discount);

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          type,
          source: isStaff ? OrderSource.STAFF : OrderSource.CUSTOMER,
          tableId,
          customerId,
          staffId: isStaff ? user!.sub : null,
          guestName: dto.guestName,
          notes: dto.notes,
          subtotal,
          discount,
          tax,
          total,
          pointsRedeemed: quote.pointsRedeemed,
          items: { create: lines },
        },
      });
      if (customerId && quote.pointsRedeemed > 0) {
        await this.loyalty.spendPoints(tx, customerId, created.id, quote.pointsRedeemed);
      }
      return created;
    });

    if (tableId) await this.tables.syncFromOrders(tableId);
    const full = await this.get(order.id);
    this.realtime.toStaff('order.created', full);
    return full;
  }

  /** Add more dishes to an open order (another round of drinks, dessert). */
  async addItems(id: string, dto: AddItemsDto, user?: AuthUser) {
    const order = await this.get(id);
    this.assertCanTouch(order, user);
    if (order.status === OrderStatus.PAID || order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('This order is closed. Start a new one.');
    }
    const priced = await this.menu.priceItems([...new Set(dto.items.map((i) => i.menuItemId))], order.customer?.tier ?? Tier.MEMBER);
    await this.prisma.orderItem.createMany({
      data: dto.items.map((l) => {
        const p = priced.get(l.menuItemId)!;
        return { orderId: id, menuItemId: p.id, name: p.name, unitPrice: p.unitPrice, quantity: l.quantity, notes: l.notes };
      }),
    });
    await this.recalculate(id);
    // New food goes back to the kitchen.
    await this.prisma.order.update({ where: { id }, data: { status: OrderStatus.PLACED } });
    if (order.tableId) await this.tables.syncFromOrders(order.tableId);
    return this.emit(id, 'order.updated');
  }

  private async recalculate(id: string) {
    const order = await this.prisma.order.findUniqueOrThrow({ where: { id }, include: { items: true } });
    const subtotal = round2(order.items.reduce((s, i) => s + num(i.unitPrice) * i.quantity, 0));
    const quote = await this.loyalty.quote(order.customerId, subtotal, 0);
    const discount = round2(quote.tierDiscount + order.pointsRedeemed * POINT_VALUE);
    const { tax, total } = this.totals(subtotal, discount);
    await this.prisma.order.update({ where: { id }, data: { subtotal, discount, tax, total } });
  }

  async get(id: string): Promise<FullOrder> {
    const order = await this.prisma.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  /** Anyone holding the order id can view it (it's unguessable); only its customer or staff can change it. */
  private assertCanTouch(order: FullOrder, user?: AuthUser) {
    if (user?.kind === 'staff') return;
    if (order.customerId && user?.kind === 'customer' && user.sub === order.customerId) return;
    if (!order.customerId && order.source === OrderSource.CUSTOMER) return; // guest at the table
    throw new ForbiddenException('You cannot change this order');
  }

  list(q: { status?: string; tableId?: string; active?: string; from?: string; to?: string; take?: string }) {
    const where: Prisma.OrderWhereInput = {};
    if (q.active === '1') where.status = { in: OPEN_STATUSES };
    else if (q.status && (Object.values(OrderStatus) as string[]).includes(q.status)) where.status = q.status as OrderStatus;
    if (q.tableId) where.tableId = q.tableId;
    if (q.from || q.to) {
      where.createdAt = {
        ...(q.from ? { gte: new Date(q.from) } : {}),
        ...(q.to ? { lte: new Date(q.to) } : {}),
      };
    }
    return this.prisma.order.findMany({
      where,
      include: ORDER_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(q.take) || 100, 500),
    });
  }

  mine(customerId: string) {
    return this.prisma.order.findMany({
      where: { customerId },
      include: ORDER_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async setStatus(id: string, status: OrderStatus) {
    const order = await this.get(id);
    if (!TRANSITIONS[order.status].includes(status)) {
      throw new BadRequestException(`Can't move an order from ${order.status} to ${status}`);
    }
    await this.prisma.order.update({ where: { id }, data: { status } });
    if (status === OrderStatus.READY) {
      await this.prisma.orderItem.updateMany({ where: { orderId: id }, data: { status: ItemStatus.DONE } });
    }
    if (status === OrderStatus.CANCELLED && order.customerId && order.pointsRedeemed > 0) {
      await this.loyalty.refundPoints(order.customerId, id, order.pointsRedeemed);
    }
    if (order.tableId) await this.tables.syncFromOrders(order.tableId);
    return this.emit(id, 'order.updated');
  }

  /** Kitchen moves single dishes along; the order status follows automatically. */
  async setItemStatus(itemId: string, status: ItemStatus) {
    const item = await this.prisma.orderItem.update({ where: { id: itemId }, data: { status } });
    const order = await this.prisma.order.findUniqueOrThrow({ where: { id: item.orderId }, include: { items: true } });
    let next: OrderStatus = order.status;
    if (order.items.every((i) => i.status === ItemStatus.DONE)) next = OrderStatus.READY;
    else if (order.items.some((i) => i.status !== ItemStatus.QUEUED)) next = OrderStatus.PREPARING;
    if (next !== order.status && (order.status === OrderStatus.PLACED || order.status === OrderStatus.PREPARING || order.status === OrderStatus.READY)) {
      await this.prisma.order.update({ where: { id: order.id }, data: { status: next } });
      if (order.tableId) await this.tables.syncFromOrders(order.tableId);
    }
    return this.emit(order.id, 'order.updated');
  }

  /** Called by the payments module once money is received. */
  async markPaid(id: string, tip: number) {
    const order = await this.get(id);
    if (order.status === OrderStatus.PAID) return order;
    await this.prisma.order.update({
      where: { id },
      data: { status: OrderStatus.PAID, paidAt: new Date(), tip: round2(tip) },
    });
    if (order.customerId) await this.loyalty.recordVisit(order.customerId, id, num(order.total));
    if (order.tableId) {
      await this.tables.syncFromOrders(order.tableId);
      const stillOpen = await this.prisma.order.count({ where: { tableId: order.tableId, status: { in: OPEN_STATUSES } } });
      if (!stillOpen) await this.tables.setStatus(order.tableId, TableStatus.CLEANING);
    }
    return this.emit(id, 'order.updated');
  }

  kitchenQueue() {
    return this.prisma.order.findMany({
      where: { status: { in: [OrderStatus.PLACED, OrderStatus.PREPARING, OrderStatus.READY] } },
      include: ORDER_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
  }

  private async emit(id: string, event: string) {
    const full = await this.get(id);
    this.realtime.toStaff(event, full);
    this.realtime.toOrder(id, event, full);
    if (full.table?.code) this.realtime.toTable(full.table.code, event, { id: full.id, status: full.status });
    return full;
  }
}

@Controller('orders')
@RequiresFeature('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  create(@Body() dto: CreateOrderDto, @CurrentUser() user?: AuthUser) {
    return this.orders.create(dto, user);
  }

  @Get()
  @StaffOnly()
  list(@Query() q: Record<string, string>) {
    return this.orders.list(q);
  }

  @Get('mine')
  @CustomerOnly()
  mine(@CurrentUser() user: AuthUser) {
    return this.orders.mine(user.sub);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.orders.get(id);
  }

  @Post(':id/items')
  addItems(@Param('id') id: string, @Body() dto: AddItemsDto, @CurrentUser() user?: AuthUser) {
    return this.orders.addItems(id, dto, user);
  }

  @Patch(':id/status')
  @StaffOnly(StaffRole.SERVER, StaffRole.HOST, StaffRole.KITCHEN)
  status(@Param('id') id: string, @Body() dto: StatusDto) {
    return this.orders.setStatus(id, dto.status);
  }
}

@Controller('kitchen')
@RequiresFeature('kitchen')
@StaffOnly(StaffRole.KITCHEN, StaffRole.SERVER)
export class KitchenController {
  constructor(private readonly orders: OrdersService) {}

  @Get('tickets')
  tickets() {
    return this.orders.kitchenQueue();
  }

  @Patch('items/:id')
  item(@Param('id') id: string, @Body() dto: ItemStatusDto) {
    return this.orders.setItemStatus(id, dto.status);
  }
}

@Module({
  imports: [MenuModule, LoyaltyModule, TablesModule],
  controllers: [OrdersController, KitchenController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
