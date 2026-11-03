import { Controller, Get, Module } from '@nestjs/common';
import { FeaturesService } from '../../config/features';

/** Public restaurant settings the web app needs before anyone signs in. */
@Controller()
export class SettingsController {
  constructor(private readonly features: FeaturesService) {}

  @Get('settings')
  settings() {
    return {
      name: process.env.RESTAURANT_NAME || 'Ember & Oak',
      currency: (process.env.CURRENCY || 'aud').toUpperCase(),
      taxRate: Number(process.env.TAX_RATE ?? 0.1),
      taxInclusive: (process.env.TAX_INCLUSIVE ?? 'true') !== 'false',
      timezone: process.env.RESTAURANT_TZ || 'Australia/Melbourne',
      features: this.features.list(),
    };
  }

  @Get('health')
  health() {
    return { ok: true, time: new Date().toISOString() };
  }
}

@Module({ controllers: [SettingsController] })
export class SettingsModule {}
