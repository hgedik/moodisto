import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { LoginSystemUserUseCase } from './login-system-user.usecase';
import { LoginVenueUserUseCase } from './login-venue-user.usecase';
import { SystemAuthController } from './system-auth.controller';
import { SystemAuthGuard } from './system-auth.guard';
import { SystemTokenService } from './system-token.service';
import { VenueAuthGuard } from './venue-auth.guard';
import { VenueTokenService } from './venue-token.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController, SystemAuthController],
  providers: [
    LoginVenueUserUseCase,
    VenueTokenService,
    VenueAuthGuard,
    LoginSystemUserUseCase,
    SystemTokenService,
    SystemAuthGuard,
  ],
  exports: [VenueTokenService, VenueAuthGuard, SystemTokenService, SystemAuthGuard],
})
export class AuthModule {}
