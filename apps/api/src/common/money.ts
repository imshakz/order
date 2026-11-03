import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { map, Observable } from 'rxjs';

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const num = (v: Prisma.Decimal | number | string | null | undefined) => (v == null ? 0 : Number(v));

function isDecimal(v: unknown): v is Prisma.Decimal {
  return v instanceof Prisma.Decimal || (Prisma.Decimal as any).isDecimal?.(v) === true;
}

function toPlain(value: unknown): unknown {
  if (value == null) return value;
  if (isDecimal(value)) return value.toNumber();
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(toPlain);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = toPlain(v);
    return out;
  }
  return value;
}

/** Sends money fields to clients as plain numbers instead of Decimal strings. */
@Injectable()
export class DecimalInterceptor implements NestInterceptor {
  intercept(_: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map(toPlain));
  }
}
