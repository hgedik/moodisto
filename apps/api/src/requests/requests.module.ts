import { Module } from '@nestjs/common';
import { PlayerModule } from '../player/player.module';
import { CreateSongRequestUseCase } from './create-song-request.usecase';
import { ModerateSongRequestUseCase } from './moderate-song-request.usecase';
import { RequestsController } from './requests.controller';

@Module({
  imports: [PlayerModule],
  controllers: [RequestsController],
  providers: [CreateSongRequestUseCase, ModerateSongRequestUseCase],
  exports: [ModerateSongRequestUseCase, CreateSongRequestUseCase],
})
export class RequestsModule {}
