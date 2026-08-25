import { Module } from '@nestjs/common';
import { CreateSongRequestUseCase } from './create-song-request.usecase';
import { ModerateSongRequestUseCase } from './moderate-song-request.usecase';
import { RequestsController } from './requests.controller';

@Module({
  controllers: [RequestsController],
  providers: [CreateSongRequestUseCase, ModerateSongRequestUseCase],
  exports: [ModerateSongRequestUseCase, CreateSongRequestUseCase],
})
export class RequestsModule {}
