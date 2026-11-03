import { DynamicModule, Module, Type } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthGuard } from './common/auth';
import { DecimalInterceptor } from './common/money';
import { enabledFeatures, Feature, FeatureGuard, FeaturesModule } from './config/features';
import { PrismaModule } from './prisma/prisma.service';
import { AuthModule } from './modules/auth/auth.module';
import { CustomersModule } from './modules/customers/customers.module';
import { LoyaltyModule } from './modules/loyalty/loyalty.module';
import { MenuModule } from './modules/menu/menu.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { RealtimeModule } from './modules/realtime/realtime.gateway';
import { ReservationsModule } from './modules/reservations/reservations.module';
import { SettingsModule } from './modules/settings/settings.module';
import { SpecialsModule } from './modules/specials/specials.module';
import { StaffModule } from './modules/staff/staff.module';
import { StatsModule } from './modules/stats/stats.module';
import { TablesModule } from './modules/tables/tables.module';

/**
 * Feature modules are loaded from ENABLED_MODULES. A module another module depends on
 * (e.g. tables for orders) is still loaded, but its routes return 404 when switched off.
 */
const FEATURE_MODULES: Record<Feature, Type<unknown>> = {
  tables: TablesModule,
  menu: MenuModule,
  specials: SpecialsModule,
  orders: OrdersModule,
  payments: PaymentsModule,
  loyalty: LoyaltyModule,
  reservations: ReservationsModule,
  stats: StatsModule,
  kitchen: OrdersModule, // kitchen screen lives with orders
};

@Module({})
export class AppModule {
  static register(): DynamicModule {
    const features = enabledFeatures();
    const featureModules = [...new Set([...features].map((f) => FEATURE_MODULES[f]))];

    if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'change-me-to-a-long-random-string') {
      // eslint-disable-next-line no-console
      console.warn('[security] JWT_SECRET is not set to a unique value. Set it before going live.');
    }

    return {
      module: AppModule,
      imports: [
        JwtModule.register({
          global: true,
          secret: process.env.JWT_SECRET || 'dev-secret-change-me',
          signOptions: { expiresIn: '12h' },
        }),
        PrismaModule,
        FeaturesModule,
        RealtimeModule,
        SettingsModule,
        AuthModule,
        StaffModule,
        CustomersModule,
        LoyaltyModule, // core: other modules use it for pricing; its routes still respect the flag
        ...featureModules,
      ],
      providers: [
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_GUARD, useClass: FeatureGuard },
        { provide: APP_INTERCEPTOR, useClass: DecimalInterceptor },
      ],
    };
  }
}
