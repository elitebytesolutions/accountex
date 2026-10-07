import { Module } from '@nestjs/common';
import { LookupsReader } from './application/lookups-reader.js';
import { PrismaLookupsReader } from './infrastructure/prisma-lookups.reader.js';
import { LookupsController } from './presentation/lookups.controller.js';

/** Fixed lists (Lookups.Lookups) for the UI's selects. */
@Module({
  controllers: [LookupsController],
  providers: [{ provide: LookupsReader, useClass: PrismaLookupsReader }],
})
export class LookupsModule {}
