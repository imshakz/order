import { Body, Controller, Get, Injectable, Module, Param, ParseEnumPipe, Put } from '@nestjs/common';
import { Prisma, StaffRole, Tier, TierRule } from '@prisma/client';
import { ArrayMaxSize, IsArray, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { AuthUser, CurrentUser, CustomerOnly, StaffOnly } from '../../common/auth';
import { num, round2 } from '../../common/money';
import { FeaturesService, RequiresFeature } from '../../config/features';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

/** Value of one point when redeemed, in dollars (100 points = $5). */
export const POINT_VALUE = 0.05;
const TIER_ORDER: Tier[] = [Tier.MEMBER, Tier.SILVER, Tier.GOLD];

class UpdateTierRuleDto {
  @IsOptional() @IsInt() @Min(0) minLifetimePoints?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(50) discountPercent?: number;
  @IsOptional() @IsNumber() @Min(1) @Max(5) pointsMultiplier?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) perks?: string[];
  @IsOptional() @IsString() color?: string;
}

export interface LoyaltyQuote {
  tier: Tier;
  discountPercent: number;
  tierDiscount: number;
  pointsRedeemed: number;
  pointsDiscount: number;
}

@Injectable()
export class LoyaltyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly features: FeaturesService,
    private readonly realtime: RealtimeGateway,
  ) {}

  get enabled() {
    return this.features.isEnabled('loyalty');
  }

  async rules(): Promise<TierRule[]> {
    const rules = await this.prisma.tierRule.findMany();
    return rules.sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier));
  }

  updateRule(tier: Tier, dto: UpdateTierRuleDto) {
    return this.prisma.tierRule.update({ where: { tier }, data: dto });
  }

  tierRank(tier: Tier) {
    return TIER_ORDER.indexOf(tier);
  }

  /** Work out tier discount and points redemption for a customer's order. */
  async quote(customerId: string | null | undefined, subtotal: number, requestedPoints = 0): Promise<LoyaltyQuote> {
    const none: LoyaltyQuote = { tier: Tier.MEMBER, discountPercent: 0, tierDiscount: 0, pointsRedeemed: 0, pointsDiscount: 0 };
    if (!this.enabled || !customerId) return none;
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) return none;
    const rule = await this.prisma.tierRule.findUnique({ where: { tier: customer.tier } });
    const discountPercent = num(rule?.discountPercent);
    const tierDiscount = round2((subtotal * discountPercent) / 100);
    const remaining = Math.max(0, subtotal - tierDiscount);
    const maxPointsByValue = Math.floor(remaining / POINT_VALUE);
    const pointsRedeemed = Math.max(0, Math.min(Math.floor(requestedPoints), customer.points, maxPointsByValue));
    return {
      tier: customer.tier,
      discountPercent,
      tierDiscount,
      pointsRedeemed,
      pointsDiscount: round2(pointsRedeemed * POINT_VALUE),
    };
  }

  /** Called inside the order transaction when a customer spends points. */
  async spendPoints(tx: Prisma.TransactionClient, customerId: string, orderId: string, points: number) {
    if (points <= 0) return;
    await tx.customer.update({ where: { id: customerId }, data: { points: { decrement: points } } });
    await tx.pointsLedger.create({ data: { customerId, orderId, delta: -points, reason: 'Redeemed on order' } });
  }

  /** Give back points if an unpaid order is cancelled. */
  async refundPoints(customerId: string, orderId: string, points: number) {
    if (points <= 0) return;
    await this.prisma.$transaction([
      this.prisma.customer.update({ where: { id: customerId }, data: { points: { increment: points } } }),
      this.prisma.pointsLedger.create({ data: { customerId, orderId, delta: points, reason: 'Order cancelled, points returned' } }),
    ]);
  }

  /** Award points after payment, update visit stats and move the customer up a tier if they qualify. */
  async recordVisit(customerId: string, orderId: string, amountSpent: number) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) return;
    const rules = await this.rules();
    const current = rules.find((r) => r.tier === customer.tier);
    const multiplier = this.enabled ? num(current?.pointsMultiplier) || 1 : 0;
    const earned = Math.floor(amountSpent * multiplier);
    const lifetimePoints = customer.lifetimePoints + earned;

    let tier = customer.tier;
    if (this.enabled) {
      for (const r of rules) {
        if (lifetimePoints >= r.minLifetimePoints && this.tierRank(r.tier) > this.tierRank(tier)) tier = r.tier;
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (earned > 0) {
        await tx.pointsLedger.create({ data: { customerId, orderId, delta: earned, reason: `Earned (${multiplier}x)` } });
      }
      return tx.customer.update({
        where: { id: customerId },
        data: {
          points: { increment: earned },
          lifetimePoints,
          lifetimeSpend: { increment: amountSpent },
          visits: { increment: 1 },
          lastVisitAt: new Date(),
          tier,
        },
      });
    });

    if (tier !== customer.tier) {
      this.realtime.toStaff('customer.tierUp', { customerId, name: customer.name, from: customer.tier, to: tier });
      this.realtime.toOrder(orderId, 'customer.tierUp', { from: customer.tier, to: tier });
    }
    return { earned, tier: updated.tier, tierChanged: tier !== customer.tier };
  }

  async status(customerId: string) {
    const [customer, rules, ledger] = await Promise.all([
      this.prisma.customer.findUniqueOrThrow({ where: { id: customerId } }),
      this.rules(),
      this.prisma.pointsLedger.findMany({ where: { customerId }, orderBy: { createdAt: 'desc' }, take: 20 }),
    ]);
    const next = rules.find((r) => this.tierRank(r.tier) === this.tierRank(customer.tier) + 1);
    return {
      tier: customer.tier,
      points: customer.points,
      pointsValue: round2(customer.points * POINT_VALUE),
      lifetimePoints: customer.lifetimePoints,
      visits: customer.visits,
      currentRule: rules.find((r) => r.tier === customer.tier),
      nextTier: next
        ? { tier: next.tier, pointsNeeded: Math.max(0, next.minLifetimePoints - customer.lifetimePoints), minLifetimePoints: next.minLifetimePoints }
        : null,
      ledger,
    };
  }
}

@Controller('loyalty')
@RequiresFeature('loyalty')
export class LoyaltyController {
  constructor(private readonly loyalty: LoyaltyService) {}

  @Get('tiers')
  tiers() {
    return this.loyalty.rules().then((rules) => ({ pointValue: POINT_VALUE, rules }));
  }

  @Get('me')
  @CustomerOnly()
  me(@CurrentUser() user: AuthUser) {
    return this.loyalty.status(user.sub);
  }

  @Put('tiers/:tier')
  @StaffOnly(StaffRole.MANAGER)
  update(@Param('tier', new ParseEnumPipe(Tier)) tier: Tier, @Body() dto: UpdateTierRuleDto) {
    return this.loyalty.updateRule(tier, dto);
  }
}

@Module({
  controllers: [LoyaltyController],
  providers: [LoyaltyService],
  exports: [LoyaltyService],
})
export class LoyaltyModule {}
