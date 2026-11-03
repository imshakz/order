import { Global, Logger, Module } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import type { AuthUser } from '../../common/auth';

/**
 * Live updates. Clients join rooms:
 *  - "staff"          floor, kitchen and manager screens
 *  - "order:<id>"     a customer watching their own order
 *  - "table:<code>"   a customer device sitting at a table
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class RealtimeGateway {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(private readonly jwt: JwtService) {}

  /** The staff room carries customer details, so it needs a valid staff token. */
  @SubscribeMessage('join')
  join(@ConnectedSocket() socket: Socket, @MessageBody() body: { room?: string; token?: string }) {
    const room = body?.room;
    if (typeof room !== 'string' || !/^(staff|order:[\w-]+|table:[\w-]+)$/.test(room)) return { ok: false };
    if (room === 'staff') {
      try {
        const user = this.jwt.verify<AuthUser>(body.token ?? '');
        if (user.kind !== 'staff') return { ok: false };
      } catch {
        return { ok: false };
      }
    }
    socket.join(room);
    return { ok: true, room };
  }

  toStaff(event: string, payload: unknown) {
    this.server?.to('staff').emit(event, payload);
  }

  toOrder(orderId: string, event: string, payload: unknown) {
    this.server?.to(`order:${orderId}`).emit(event, payload);
  }

  toTable(code: string, event: string, payload: unknown) {
    this.server?.to(`table:${code}`).emit(event, payload);
  }

  afterInit() {
    this.logger.log('Realtime gateway ready');
  }
}

@Global()
@Module({
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
