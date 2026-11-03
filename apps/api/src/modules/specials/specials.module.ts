import { Body, Controller, Delete, Get, Injectable, Module, Param, Patch, Post } from '@nestjs/common';
import { ChefSpecial, MenuItem, StaffRole, Tier } from '@prisma/client';
import { IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { StaffOnly } from '../../common/auth';
import { FeaturesService, RequiresFeature } from '../../config/features';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

class CreateSpecialDto {
  @IsString() menuItemId: string;
  @IsString() @MinLength(2) headline: string;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsNumber() @Min(0) specialPrice?: number;
  @IsOptional() @IsEnum(Tier) minTier?: Tier;
  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional() @IsDateString() endsAt?: string;
}

class UpdateSpecialDto {
  @IsOptional() @IsString() headline?: string;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsNumber() @Min(0) specialPrice?: number | null;
  @IsOptional() @IsEnum(Tier) minTier?: Tier;
  @IsOptional() @IsDateString() endsAt?: string | null;
  @IsOptional() @IsBoolean() active?: boolean;
}

const TIER_RANK: Record<Tier, number> = { MEMBER: 0, SILVER: 1, GOLD: 2 };
export const tierAllows = (viewer: Tier, required: Tier) => TIER_RANK[viewer] >= TIER_RANK[required];

@Injectable()
export class SpecialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly features: FeaturesService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /** Specials running right now. Empty when the module is switched off. */
  async live(): Promise<(ChefSpecial & { menuItem: MenuItem })[]> {
    if (!this.features.isEnabled('specials')) return [];
    const now = new Date();
    return this.prisma.chefSpecial.findMany({
      where: { active: true, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }], menuItem: { available: true } },
      include: { menuItem: true },
      orderBy: { startsAt: 'desc' },
    });
  }

  all() {
    return this.prisma.chefSpecial.findMany({ include: { menuItem: true }, orderBy: { startsAt: 'desc' } });
  }

  async create(dto: CreateSpecialDto) {
    const s = await this.prisma.chefSpecial.create({
      data: {
        ...dto,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
      },
    });
    this.realtime.toStaff('menu.changed', {});
    return s;
  }

  async update(id: string, dto: UpdateSpecialDto) {
    const s = await this.prisma.chefSpecial.update({
      where: { id },
      data: { ...dto, endsAt: dto.endsAt === undefined ? undefined : dto.endsAt ? new Date(dto.endsAt) : null },
    });
    this.realtime.toStaff('menu.changed', {});
    return s;
  }

  async remove(id: string) {
    await this.prisma.chefSpecial.delete({ where: { id } });
    this.realtime.toStaff('menu.changed', {});
    return { ok: true };
  }
}

@Controller('specials')
@RequiresFeature('specials')
@StaffOnly(StaffRole.MANAGER, StaffRole.KITCHEN)
export class SpecialsController {
  constructor(private readonly specials: SpecialsService) {}

  @Get() all() {
    return this.specials.all();
  }

  @Post() create(@Body() dto: CreateSpecialDto) {
    return this.specials.create(dto);
  }

  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateSpecialDto) {
    return this.specials.update(id, dto);
  }

  @Delete(':id') remove(@Param('id') id: string) {
    return this.specials.remove(id);
  }
}

@Module({
  controllers: [SpecialsController],
  providers: [SpecialsService],
  exports: [SpecialsService],
})
export class SpecialsModule {}
