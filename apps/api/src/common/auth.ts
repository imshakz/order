import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { StaffRole } from '@prisma/client';

export interface AuthUser {
  sub: string;
  kind: 'staff' | 'customer';
  role?: StaffRole;
  name: string;
}

type Access = { kind: 'staff'; roles: StaffRole[] } | { kind: 'customer' };

const ACCESS_KEY = 'access';

/** Staff only. Pass roles to narrow it down; managers can always get in. */
export const StaffOnly = (...roles: StaffRole[]) => SetMetadata(ACCESS_KEY, { kind: 'staff', roles } as Access);
/** Signed-in customers only. */
export const CustomerOnly = () => SetMetadata(ACCESS_KEY, { kind: 'customer' } as Access);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser | undefined => {
  return ctx.switchToHttp().getRequest().user;
});

/**
 * Reads the bearer token on every request (if present) and enforces @StaffOnly / @CustomerOnly.
 * Routes without either decorator are public, but still see req.user when a token is sent.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers?.authorization;
    if (header?.startsWith('Bearer ')) {
      try {
        req.user = this.jwt.verify<AuthUser>(header.slice(7));
      } catch {
        req.user = undefined;
      }
    }

    const access = this.reflector.getAllAndOverride<Access | undefined>(ACCESS_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!access) return true;

    const user: AuthUser | undefined = req.user;
    if (!user) throw new UnauthorizedException('Please sign in');

    if (access.kind === 'customer') {
      if (user.kind !== 'customer') throw new ForbiddenException('Customer account required');
      return true;
    }

    if (user.kind !== 'staff') throw new ForbiddenException('Staff account required');
    if (user.role === StaffRole.MANAGER || access.roles.length === 0) return true;
    if (!user.role || !access.roles.includes(user.role)) {
      throw new ForbiddenException('Your role does not have access to this');
    }
    return true;
  }
}
