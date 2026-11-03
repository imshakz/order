import { Body, Controller, Get, Injectable, Module, Param, Patch, Query } from '@nestjs/common';
import { Prisma, StaffRole, Tier } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { StaffOnly } from '../../common/auth';
import { PrismaService } from '../../prisma/prisma.service';

class UpdateCustomerDto {
  @IsOptional() @IsEnum(Tier) tier?: Tier;
  @IsOptional() @IsInt() pointsAdjustment?: number;
  @IsOptional() @IsString() phone?: string;
}

const SORTS: Record<string, Prisma.CustomerOrderByWithRelationInput> = {
  spend: { lifetimeSpend: 'desc' },
  visits: { visits: 'desc' },
  recent: { lastVisitAt: { sort: 'desc', nulls: 'last' } },
  newest: { createdAt: 'desc' },
  name: { name: 'asc' },
};

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  list(search?: string, tier?: Tier, sort = 'spend') {
    const where: Prisma.CustomerWhereInput = {
      ...(tier ? { tier } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search } },
            ],
          }
        : {}),
    };
    return this.prisma.customer.findMany({
      where,
      orderBy: SORTS[sort] ?? SORTS.spend,
      take: 200,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        tier: true,
        points: true,
        lifetimePoints: true,
        lifetimeSpend: true,
        visits: true,
        lastVisitAt: true,
        createdAt: true,
      },
    });
  }

  async detail(id: string) {
    const customer = await this.prisma.customer.findUniqueOrThrow({
      where: { id },
      include: {
        orders: { orderBy: { createdAt: 'desc' }, take: 20, include: { items: true, table: { select: { label: true } } } },
        ledger: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    const { passwordHash, ...rest } = customer;
    const favourites = await this.prisma.orderItem.groupBy({
      by: ['name'],
      where: { order: { customerId: id, status: { not: 'CANCELLED' } } },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 5,
    });
    return { ...rest, hasAccount: !!passwordHash, favourites: favourites.map((f) => ({ name: f.name, count: f._sum.quantity ?? 0 })) };
  }

  async update(id: string, dto: UpdateCustomerDto) {
    return this.prisma.$transaction(async (tx) => {
      if (dto.pointsAdjustment) {
        await tx.pointsLedger.create({ data: { customerId: id, delta: dto.pointsAdjustment, reason: 'Manual adjustment by manager' } });
      }
      return tx.customer.update({
        where: { id },
        data: {
          tier: dto.tier,
          phone: dto.phone,
          ...(dto.pointsAdjustment ? { points: { increment: dto.pointsAdjustment } } : {}),
        },
      });
    });
  }
}

@Controller('customers')
@StaffOnly(StaffRole.HOST, StaffRole.SERVER)
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  list(@Query('search') search?: string, @Query('tier') tier?: Tier, @Query('sort') sort?: string) {
    return this.customers.list(search, tier && Object.values(Tier).includes(tier) ? tier : undefined, sort);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.customers.detail(id);
  }

  @Patch(':id')
  @StaffOnly(StaffRole.MANAGER)
  async update(@Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    const { passwordHash, ...c } = await this.customers.update(id, dto);
    return c;
  }
}

@Module({ controllers: [CustomersController], providers: [CustomersService] })
export class CustomersModule {}
