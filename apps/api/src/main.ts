import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { RedisIoAdapter } from './modules/realtime/redis-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule.register(), { rawBody: true });
  const logger = new Logger('Bootstrap');

  app.setGlobalPrefix('api');
  app.enableCors({ origin: true, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }));
  app.enableShutdownHooks();

  if (process.env.REDIS_URL) {
    const adapter = new RedisIoAdapter(app);
    try {
      await adapter.connectToRedis(process.env.REDIS_URL);
      app.useWebSocketAdapter(adapter);
    } catch (e) {
      logger.warn(`Redis unavailable (${e.message}); live updates will work on a single instance only`);
    }
  }

  const port = Number(process.env.PORT) || 4000;
  await app.listen(port, '0.0.0.0');
  logger.log(`API listening on :${port}`);
}

bootstrap();
