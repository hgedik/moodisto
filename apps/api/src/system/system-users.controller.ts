import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import type { CreatedSystemUserDto, PasswordResetDto, SystemUserDto } from '@moodisto/shared-types';
import {
  createSystemUserSchema,
  cuidSchema,
  updateSystemUserSchema,
  type CreateSystemUserInput,
  type UpdateSystemUserInput,
} from '@moodisto/validation';
import type { AuthenticatedSystemUser } from '../auth/authenticated-request';
import { CurrentSystemUser } from '../auth/current-user.decorator';
import { SystemAuthGuard } from '../auth/system-auth.guard';
import { zodBody } from '../common/zod-validation.pipe';
import { SystemUsersService } from './system-users.service';

/** The operators of this installation. Whoever is signed in is also whoever can be locked out. */
@Controller('system/users')
@UseGuards(SystemAuthGuard)
export class SystemUsersController {
  constructor(private readonly operators: SystemUsersService) {}

  @Get()
  list(): Promise<readonly SystemUserDto[]> {
    return this.operators.list();
  }

  @Post()
  create(
    @Body(zodBody(createSystemUserSchema)) body: CreateSystemUserInput,
  ): Promise<CreatedSystemUserDto> {
    return this.operators.create(body);
  }

  @Patch(':userId')
  update(
    @CurrentSystemUser() actor: AuthenticatedSystemUser,
    @Param('userId', zodBody(cuidSchema)) userId: string,
    @Body(zodBody(updateSystemUserSchema)) body: UpdateSystemUserInput,
  ): Promise<SystemUserDto> {
    return this.operators.update(actor.id, userId, body);
  }

  @Post(':userId/password')
  resetPassword(@Param('userId', zodBody(cuidSchema)) userId: string): Promise<PasswordResetDto> {
    return this.operators.resetPassword(userId);
  }
}
