import { BadRequestException, Body, Controller, Get, Injectable, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { ReservationStatus, StaffRole } from '@prisma/client';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { AuthUser, CurrentUser, StaffOnly } from '../../common/auth';
import { RequiresFeature } from '../../config/features';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { TablesModule, TablesService } from '../tables/tables.module';

class CreateReservationDto {
  @IsString() @MinLength(2) name: string;
  @IsOptional() @IsString() phone?: string;
  @IsInt() @Min(1) @Max(40) partySize: number;
  @IsDateString() time: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() tableId?: string;
}

class UpdateReservationDto {
  @IsOptional() @IsEnum(ReservationStatus) status?: ReservationStatus;
  @IsOptional() @IsString() tableId?: string;
  @IsOptional() @IsDateString() time?: string;
  @IsOptional() @IsInt() @Min(1) partySize?: number;
}

@Injectable()
export class ReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly tables: TablesService,
  ) {}

  forDay(date?: string) {
    const day = date ? new Date(date) : new Date();
    if (isNaN(day.getTime())) throw new BadRequestException('Invalid date');
    const start = new Date(day);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return this.prisma.reservation.findMany({
      where: { time: { gte: start, lt: end } },
      orderBy: { time: 'asc' },
      include: { table: { select: { id: true, label: true } }, customer: { select: { id: true, tier: true } } },
    });
  }

  async create(dto: CreateReservationDto, user?: AuthUser) {
    const customerId = user?.kind === 'customer' ? user.sub : undefined;
    const tableId = user?.kind === 'staff' ? dto.tableId : undefined; // only staff assign tables
    const r = await this.prisma.reservation.create({ data: { ...dto, tableId, time: new Date(dto.time), customerId } });
    this.realtime.toStaff('reservation.updated', r);
    return r;
  }

  async update(id: string, dto: UpdateReservationDto) {
    const r = await this.prisma.reservation.update({
      where: { id },
      data: { ...dto, time: dto.time ? new Date(dto.time) : undefined },
    });
    if (dto.status === ReservationStatus.SEATED && r.tableId) {
      await this.tables.seat(r.tableId, r.partySize);
    }
    this.realtime.toStaff('reservation.updated', r);
    return r;
  }
}

@Controller('reservations')
@RequiresFeature('reservations')
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Get()
  @StaffOnly()
  list(@Query('date') date?: string) {
    return this.reservations.forDay(date);
  }

  /** Public so customers can book; linked to their account if signed in. */
  @Post()
  create(@Body() dto: CreateReservationDto, @CurrentUser() user?: AuthUser) {
    return this.reservations.create(dto, user);
  }

  @Patch(':id')
  @StaffOnly(StaffRole.HOST, StaffRole.SERVER)
  update(@Param('id') id: string, @Body() dto: UpdateReservationDto) {
    return this.reservations.update(id, dto);
  }
}

@Module({
  imports: [TablesModule],
  controllers: [ReservationsController],
  providers: [ReservationsService],
})
export class ReservationsModule {}
