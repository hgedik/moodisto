import { Global, Module } from '@nestjs/common';
import { DATABASE } from '../application/ports';
import { PrismaDatabase } from '../infrastructure/prisma-database';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService, { provide: DATABASE, useClass: PrismaDatabase }],
  exports: [PrismaService, DATABASE],
})
export class PrismaModule {}
