import {
  Body,
  ConflictException,
  Controller,
  Get,
  Injectable,
  Module,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { AuthUser, CurrentUser } from '../../common/auth';
import { PrismaService } from '../../prisma/prisma.service';

class LoginDto {
  @IsEmail() email: string;
  @IsString() @MinLength(4) password: string;
}

class RegisterDto {
  @IsString() @MinLength(2) name: string;
  @IsEmail() email: string;
  @IsString() @MinLength(6) password: string;
  @IsOptional() @IsString() phone?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private sign(user: AuthUser) {
    return this.jwt.sign(user);
  }

  async staffLogin(dto: LoginDto) {
    const staff = await this.prisma.staff.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (!staff || !staff.active || !(await bcrypt.compare(dto.password, staff.passwordHash))) {
      throw new UnauthorizedException('Email or password is incorrect');
    }
    const user: AuthUser = { sub: staff.id, kind: 'staff', role: staff.role, name: staff.name };
    return { token: this.sign(user), user: { id: staff.id, name: staff.name, email: staff.email, role: staff.role } };
  }

  async customerRegister(dto: RegisterDto) {
    const email = dto.email.toLowerCase();
    const existing = await this.prisma.customer.findUnique({ where: { email } });
    if (existing?.passwordHash) throw new ConflictException('An account with this email already exists');
    const passwordHash = await bcrypt.hash(dto.password, 10);
    // A guest who ordered before with this email keeps their history when they sign up.
    const customer = existing
      ? await this.prisma.customer.update({ where: { email }, data: { passwordHash, name: dto.name, phone: dto.phone } })
      : await this.prisma.customer.create({ data: { name: dto.name, email, phone: dto.phone, passwordHash } });
    return this.customerSession(customer.id);
  }

  async customerLogin(dto: LoginDto) {
    const customer = await this.prisma.customer.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (!customer?.passwordHash || !(await bcrypt.compare(dto.password, customer.passwordHash))) {
      throw new UnauthorizedException('Email or password is incorrect');
    }
    return this.customerSession(customer.id);
  }

  private async customerSession(id: string) {
    const c = await this.prisma.customer.findUniqueOrThrow({ where: { id } });
    const user: AuthUser = { sub: c.id, kind: 'customer', name: c.name };
    return { token: this.sign(user), user: this.publicCustomer(c) };
  }

  publicCustomer(c: { id: string; name: string; email: string; tier: string; points: number; lifetimePoints: number }) {
    return { id: c.id, name: c.name, email: c.email, tier: c.tier, points: c.points, lifetimePoints: c.lifetimePoints };
  }

  async me(user: AuthUser) {
    if (user.kind === 'staff') {
      const s = await this.prisma.staff.findUnique({ where: { id: user.sub } });
      if (!s) throw new UnauthorizedException();
      return { kind: 'staff', id: s.id, name: s.name, email: s.email, role: s.role };
    }
    const c = await this.prisma.customer.findUnique({ where: { id: user.sub } });
    if (!c) throw new UnauthorizedException();
    return { kind: 'customer', ...this.publicCustomer(c) };
  }
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('staff/login')
  staffLogin(@Body() dto: LoginDto) {
    return this.auth.staffLogin(dto);
  }

  @Post('customer/register')
  register(@Body() dto: RegisterDto) {
    return this.auth.customerRegister(dto);
  }

  @Post('customer/login')
  customerLogin(@Body() dto: LoginDto) {
    return this.auth.customerLogin(dto);
  }

  @Get('me')
  me(@CurrentUser() user?: AuthUser) {
    if (!user) throw new UnauthorizedException('Please sign in');
    return this.auth.me(user);
  }
}

@Module({
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
