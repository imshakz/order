import { CanActivate, ExecutionContext, Global, Injectable, Module, NotFoundException, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

/**
 * Feature modules a restaurant can switch on or off with ENABLED_MODULES.
 * A small cafe might run "menu,orders,payments"; a fine-dining venue might enable everything.
 */
export const ALL_FEATURES = [
  'tables',
  'menu',
  'specials',
  'orders',
  'payments',
  'loyalty',
  'reservations',
  'stats',
  'kitchen',
] as const;

export type Feature = (typeof ALL_FEATURES)[number];

export function enabledFeatures(): Set<Feature> {
  const raw = process.env.ENABLED_MODULES;
  if (!raw || !raw.trim()) return new Set(ALL_FEATURES);
  const wanted = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is Feature => (ALL_FEATURES as readonly string[]).includes(s));
  const set = new Set<Feature>(wanted);
  // Ordering always needs a menu.
  if (set.has('orders')) set.add('menu');
  return set;
}

@Injectable()
export class FeaturesService {
  private readonly enabled = enabledFeatures();

  isEnabled(feature: Feature): boolean {
    return this.enabled.has(feature);
  }

  list(): Feature[] {
    return ALL_FEATURES.filter((f) => this.enabled.has(f));
  }
}

export const FEATURE_KEY = 'feature';
/** Marks a controller or route as belonging to a feature module. Disabled features return 404. */
export const RequiresFeature = (feature: Feature) => SetMetadata(FEATURE_KEY, feature);

@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly features: FeaturesService,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const feature = this.reflector.getAllAndOverride<Feature | undefined>(FEATURE_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (feature && !this.features.isEnabled(feature)) {
      throw new NotFoundException(`The "${feature}" module is not enabled for this restaurant`);
    }
    return true;
  }
}

@Global()
@Module({
  providers: [FeaturesService],
  exports: [FeaturesService],
})
export class FeaturesModule {}
