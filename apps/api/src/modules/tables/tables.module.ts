import { Body, Controller, Delete, Get, Injectable, Module, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { OrderStatus, StaffRole, TableShape, TableStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsInt, IsOptional, IsString, Max, Min, MinLength, ValidateNested } from 'class-validator';
import { randomBytes } from 'crypto';
import { StaffOnly } from '../../common/auth';
import { RequiresFeature } from '../../config/features';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

export const OPEN_STATUSES: OrderStatus[] = [OrderStatus.PLACED, OrderStatus.PREPARING, OrderStatus.READY, OrderStatus.SERVED];

class CreateTableDto {
  @IsString() @MinLength(1) label: string;
  @IsInt() @Min(1) @Max(40) seats: number;
  @IsOptional() @IsString() section?: string;
  @IsOptional() @IsEnum(TableShape) shape?: TableShape;
  @IsOptional() @IsInt() @Min(0) posX?: number;
  @IsOptional() @IsInt() @Min(0) posY?: number;
}

class UpdateTableDto {
  @IsOptional() @IsString() label?: string;
  @IsOptional() @IsInt() @Min(1) @Max(40) seats?: number;
  @IsOptional() @IsString() section?: string;
  @IsOptional() @IsEnum(TableShape) shape?: TableShape;
  @IsOptional() @IsInt() @Min(0) posX?: number;
  @IsOptional() @IsInt() @Min(0) posY?: number;
}

class StatusDto {
  @IsEnum(TableStatus) status: TableStatus;
}

class SeatDto {
  @IsInt() @Min(1) @Max(40) guests: number;
}

class LayoutItem {
  @IsString() id: string;
  @IsInt() @Min(0) posX: number;
  @IsInt() @Min(0) posY: number;
}

class LayoutDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => LayoutItem) tables: LayoutItem[];
}

const newCode = () => randomBytes(4).toString('hex');

@Injectable()
export class TablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /** Floor view: every table with its open orders and running total. */
  async floor() {
    const tables = await this.prisma.table.findMany({
      where: { active: true },
      orderBy: [{ section: 'asc' }, { label: 'asc' }],
      include: {
        orders: {
          where: { status: { in: OPEN_STATUSES } },
          select: { id: true, number: true, status: true, total: true, createdAt: true, customer: { select: { name: true, tier: true } } },
          orderBy: { createdAt: 'asc' },
        },
        reservations: {
          where: { status: 'BOOKED', time: { gte: new Date(Date.now() - 30 * 60_000), lte: new Date(Date.now() + 3 * 3600_000) } },
          select: { id: true, name: true, time: true, partySize: true },
          orderBy: { time: 'asc' },
          take: 1,
        },
      },
    });
    return tables;
  }

  async byCode(code: string) {
    const table = await this.prisma.table.findUnique({
      where: { code },
      select: { id: true, label: true, seats: true, section: true, code: true, active: true },
    });
    if (!table || !table.active) throw new NotFoundException('Table not found');
    return table;
  }

  create(dto: CreateTableDto) {
    return this.prisma.table.create({ data: { ...dto, code: newCode() } }).then((t) => this.broadcast(t.id));
  }

  update(id: string, dto: UpdateTableDto) {
    return this.prisma.table.update({ where: { id }, data: dto }).then((t) => this.broadcast(t.id));
  }

  async saveLayout(dto: LayoutDto) {
    await this.prisma.$transaction(
      dto.tables.map((t) => this.prisma.table.update({ where: { id: t.id }, data: { posX: t.posX, posY: t.posY } })),
    );
    this.realtime.toStaff('floor.changed', {});
    return { ok: true };
  }

  async setStatus(id: string, status: TableStatus) {
    const clearing = status === TableStatus.AVAILABLE || status === TableStatus.CLEANING;
    await this.prisma.table.update({
      where: { id },
      data: { status, ...(clearing ? { guests: null, seatedAt: null } : {}) },
    });
    return this.broadcast(id);
  }

  async seat(id: string, guests: number) {
    await this.prisma.table.update({
      where: { id },
      data: { status: TableStatus.SEATED, guests, seatedAt: new Date() },
    });
    return this.broadcast(id);
  }

  /** New QR code, e.g. if a printed code has been misused. */
  async rotateCode(id: string) {
    await this.prisma.table.update({ where: { id }, data: { code: newCode() } });
    return this.broadcast(id);
  }

  async remove(id: string) {
    await this.prisma.table.update({ where: { id }, data: { active: false } });
    this.realtime.toStaff('floor.changed', {});
    return { ok: true };
  }

  /** Keeps a table's status in step with its orders. Called by the orders module. */
  async syncFromOrders(tableId: string) {
    const table = await this.prisma.table.findUnique({ where: { id: tableId } });
    if (!table) return;
    const open = await this.prisma.order.findMany({ where: { tableId, status: { in: OPEN_STATUSES } }, select: { status: true } });
    let status: TableStatus = table.status;
    if (open.some((o) => o.status === OrderStatus.READY)) status = TableStatus.NEEDS_ATTENTION;
    else if (open.length > 0) status = TableStatus.ORDERED;
    else if (table.status === TableStatus.ORDERED || table.status === TableStatus.NEEDS_ATTENTION) status = TableStatus.CLEANING;
    if (status !== table.status) {
      await this.prisma.table.update({
        where: { id: tableId },
        data: { status, ...(status === TableStatus.ORDERED && !table.seatedAt ? { seatedAt: new Date() } : {}) },
      });
    }
    await this.broadcast(tableId);
  }

  private async broadcast(id: string) {
    const table = await this.prisma.table.findUnique({ where: { id } });
    this.realtime.toStaff('table.updated', table);
    return table;
  }
}

@Controller('tables')
@RequiresFeature('tables')
export class TablesController {
  constructor(private readonly tables: TablesService) {}

  /** Public: the customer ordering page looks up its table from the QR code. */
  @Get('code/:code')
  byCode(@Param('code') code: string) {
    return this.tables.byCode(code);
  }

  @Get()
  @StaffOnly()
  floor() {
    return this.tables.floor();
  }

  @Post()
  @StaffOnly(StaffRole.MANAGER)
  create(@Body() dto: CreateTableDto) {
    return this.tables.create(dto);
  }

  @Patch('layout')
  @StaffOnly(StaffRole.MANAGER)
  layout(@Body() dto: LayoutDto) {
    return this.tables.saveLayout(dto);
  }

  @Patch(':id')
  @StaffOnly(StaffRole.MANAGER)
  update(@Param('id') id: string, @Body() dto: UpdateTableDto) {
    return this.tables.update(id, dto);
  }

  @Patch(':id/status')
  @StaffOnly(StaffRole.HOST, StaffRole.SERVER)
  status(@Param('id') id: string, @Body() dto: StatusDto) {
    return this.tables.setStatus(id, dto.status);
  }

  @Post(':id/seat')
  @StaffOnly(StaffRole.HOST, StaffRole.SERVER)
  seat(@Param('id') id: string, @Body() dto: SeatDto) {
    return this.tables.seat(id, dto.guests);
  }

  @Post(':id/rotate-code')
  @StaffOnly(StaffRole.MANAGER)
  rotate(@Param('id') id: string) {
    return this.tables.rotateCode(id);
  }

  @Delete(':id')
  @StaffOnly(StaffRole.MANAGER)
  remove(@Param('id') id: string) {
    return this.tables.remove(id);
  }
}

@Module({
  controllers: [TablesController],
  providers: [TablesService],
  exports: [TablesService],
})
export class TablesModule {}
