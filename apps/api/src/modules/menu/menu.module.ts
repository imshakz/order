import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { StaffRole, Tier } from '@prisma/client';
import { IsArray, IsBoolean, IsInt, IsNumber, IsOptional, IsString, IsUrl, Min, MinLength } from 'class-validator';
import { AuthUser, CurrentUser, StaffOnly } from '../../common/auth';
import { num } from '../../common/money';
import { RequiresFeature } from '../../config/features';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { SpecialsModule, SpecialsService, tierAllows } from '../specials/specials.module';

class CategoryDto {
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsInt() sortOrder?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

class CreateItemDto {
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsString() description?: string;
  @IsNumber() @Min(0) price: number;
  @IsString() categoryId: string;
  @IsOptional() @IsUrl() imageUrl?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsInt() @Min(0) prepMinutes?: number;
  @IsOptional() @IsInt() sortOrder?: number;
}

class UpdateItemDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsNumber() @Min(0) price?: number;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsUrl() imageUrl?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsInt() @Min(0) prepMinutes?: number;
  @IsOptional() @IsInt() sortOrder?: number;
  @IsOptional() @IsBoolean() available?: boolean;
}

export interface PricedItem {
  id: string;
  name: string;
  unitPrice: number;
  basePrice: number;
  special: boolean;
}

@Injectable()
export class MenuService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly specials: SpecialsService,
    private readonly realtime: RealtimeGateway,
  ) {}

  private async viewerTier(user?: AuthUser): Promise<Tier> {
    if (user?.kind !== 'customer') return Tier.MEMBER;
    const c = await this.prisma.customer.findUnique({ where: { id: user.sub }, select: { tier: true } });
    return c?.tier ?? Tier.MEMBER;
  }

  /** The customer-facing menu, with chef specials the viewer's tier can see. */
  async publicMenu(user?: AuthUser, includeUnavailable = false) {
    const tier = await this.viewerTier(user);
    const isStaff = user?.kind === 'staff';
    const [categories, live] = await Promise.all([
      this.prisma.category.findMany({
        where: { active: true },
        orderBy: { sortOrder: 'asc' },
        include: {
          items: {
            where: includeUnavailable ? {} : { available: true },
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          },
        },
      }),
      this.specials.live(),
    ]);

    const specials = live.map((s) => ({
      id: s.id,
      headline: s.headline,
      note: s.note,
      minTier: s.minTier,
      endsAt: s.endsAt,
      specialPrice: s.specialPrice == null ? null : num(s.specialPrice),
      unlocked: isStaff || tierAllows(tier, s.minTier),
      item: { ...s.menuItem, price: num(s.menuItem.price) },
    }));

    return { viewerTier: tier, specials, categories };
  }

  /** Server-side prices for an order. Applies special prices the customer's tier unlocks. */
  async priceItems(itemIds: string[], tier: Tier): Promise<Map<string, PricedItem>> {
    const items = await this.prisma.menuItem.findMany({ where: { id: { in: itemIds } } });
    const live = await this.specials.live();
    const map = new Map<string, PricedItem>();
    for (const item of items) {
      if (!item.available) throw new BadRequestException(`${item.name} is not available right now`);
      const base = num(item.price);
      const special = live.find((s) => s.menuItemId === item.id && s.specialPrice != null && tierAllows(tier, s.minTier));
      map.set(item.id, {
        id: item.id,
        name: item.name,
        basePrice: base,
        unitPrice: special ? Math.min(base, num(special.specialPrice)) : base,
        special: !!special,
      });
    }
    for (const id of itemIds) if (!map.has(id)) throw new BadRequestException('One of the items is no longer on the menu');
    return map;
  }

  // ---- admin ----
  categories() {
    return this.prisma.category.findMany({ orderBy: { sortOrder: 'asc' }, include: { _count: { select: { items: true } } } });
  }
  createCategory(dto: CategoryDto) {
    return this.changed(this.prisma.category.create({ data: dto }));
  }
  updateCategory(id: string, dto: Partial<CategoryDto>) {
    return this.changed(this.prisma.category.update({ where: { id }, data: dto }));
  }
  createItem(dto: CreateItemDto) {
    return this.changed(this.prisma.menuItem.create({ data: dto }));
  }
  updateItem(id: string, dto: UpdateItemDto) {
    return this.changed(this.prisma.menuItem.update({ where: { id }, data: dto }));
  }
  /** Items stay in the database for order history; removing just hides them. */
  hideItem(id: string) {
    return this.changed(this.prisma.menuItem.update({ where: { id }, data: { available: false, sortOrder: 9999 } }));
  }

  private async changed<T>(p: Promise<T>): Promise<T> {
    const result = await p;
    this.realtime.toStaff('menu.changed', {});
    return result;
  }
}

@Controller('menu')
@RequiresFeature('menu')
export class MenuController {
  constructor(private readonly menu: MenuService) {}

  @Get()
  get(@CurrentUser() user?: AuthUser, @Query('all') all?: string) {
    return this.menu.publicMenu(user, user?.kind === 'staff' && all === '1');
  }

  @Get('categories')
  @StaffOnly()
  categories() {
    return this.menu.categories();
  }

  @Post('categories')
  @StaffOnly(StaffRole.MANAGER)
  createCategory(@Body() dto: CategoryDto) {
    return this.menu.createCategory(dto);
  }

  @Patch('categories/:id')
  @StaffOnly(StaffRole.MANAGER)
  updateCategory(@Param('id') id: string, @Body() dto: CategoryDto) {
    return this.menu.updateCategory(id, dto);
  }

  @Post('items')
  @StaffOnly(StaffRole.MANAGER)
  createItem(@Body() dto: CreateItemDto) {
    return this.menu.createItem(dto);
  }

  /** Servers and kitchen can mark an item sold out; managers can edit everything. */
  @Patch('items/:id')
  @StaffOnly(StaffRole.KITCHEN, StaffRole.SERVER)
  updateItem(@Param('id') id: string, @Body() dto: UpdateItemDto, @CurrentUser() user: AuthUser) {
    if (user.role !== StaffRole.MANAGER) {
      return this.menu.updateItem(id, { available: dto.available });
    }
    return this.menu.updateItem(id, dto);
  }

  @Delete('items/:id')
  @StaffOnly(StaffRole.MANAGER)
  hide(@Param('id') id: string) {
    return this.menu.hideItem(id);
  }
}

@Module({
  imports: [SpecialsModule],
  controllers: [MenuController],
  providers: [MenuService],
  exports: [MenuService],
})
export class MenuModule {}
