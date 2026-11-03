import { Body, Controller, Delete, Get, Injectable, Module, Param, Patch, Post } from '@nestjs/common';
import { StaffRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { StaffOnly } from '../../common/auth';
import { PrismaService } from '../../prisma/prisma.service';

class CreateStaffDto {
  @IsString() @MinLength(2) name: string;
  @IsEmail() email: string;
  @IsString() @MinLength(6) password: string;
  @IsEnum(StaffRole) role: StaffRole;
}

class UpdateStaffDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEnum(StaffRole) role?: StaffRole;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsString() @MinLength(6) password?: string;
}

const select = { id: true, name: true, email: true, role: true, active: true, createdAt: true };

@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.staff.findMany({ select, orderBy: [{ role: 'asc' }, { name: 'asc' }] });
  }

  async create(dto: CreateStaffDto) {
    return this.prisma.staff.create({
      data: {
        name: dto.name,
        email: dto.email.toLowerCase(),
        role: dto.role,
        passwordHash: await bcrypt.hash(dto.password, 10),
      },
      select,
    });
  }

  async update(id: string, dto: UpdateStaffDto) {
    const { password, ...rest } = dto;
    return this.prisma.staff.update({
      where: { id },
      data: { ...rest, ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}) },
      select,
    });
  }

  deactivate(id: string) {
    return this.prisma.staff.update({ where: { id }, data: { active: false }, select });
  }
}

@Controller('staff')
@StaffOnly(StaffRole.MANAGER)
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get() list() {
    return this.staff.list();
  }

  @Post() create(@Body() dto: CreateStaffDto) {
    return this.staff.create(dto);
  }

  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateStaffDto) {
    return this.staff.update(id, dto);
  }

  @Delete(':id') remove(@Param('id') id: string) {
    return this.staff.deactivate(id);
  }
}

@Module({ controllers: [StaffController], providers: [StaffService] })
export class StaffModule {}
