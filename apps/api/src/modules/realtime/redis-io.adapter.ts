import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { ServerOptions } from 'socket.io';

/**
 * Shares socket.io events across API replicas through Redis,
 * so `docker compose up --scale api=3` keeps every screen in sync.
 */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter> | undefined;
  private readonly logger = new Logger('RedisIoAdapter');

  constructor(app: INestApplicationContext) {
    super(app);
  }

  async connectToRedis(url: string): Promise<void> {
    const pubClient = createClient({ url });
    const subClient = pubClient.duplicate();
    pubClient.on('error', (e) => this.logger.error(`Redis pub: ${e.message}`));
    subClient.on('error', (e) => this.logger.error(`Redis sub: ${e.message}`));
    await Promise.all([pubClient.connect(), subClient.connect()]);
    this.adapterConstructor = createAdapter(pubClient, subClient);
    this.logger.log('Socket.io is using Redis for multi-instance fan-out');
  }

  createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) server.adapter(this.adapterConstructor);
    return server;
  }
}
