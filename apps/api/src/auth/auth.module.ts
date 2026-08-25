import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { LoginVenueUserUseCase } from './login-venue-user.usecase';
import { VenueAuthGuard } from './venue-auth.guard';
import { VenueTokenService } from './venue-token.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [LoginVenueUserUseCase, VenueTokenService, VenueAuthGuard],
  exports: [VenueTokenService, VenueAuthGuard],
})
export class AuthModule {}
