import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ErrorCatalogue, type ErrorCodeInfo } from '../../core/application/ports/errors.js';
import { PrismaService } from '../prisma/prisma.service.js';

type Row = ErrorCodeInfo & { sqlState: string | null };

/** Platform.ErrorCodes, loaded once at startup (the catalogue changes only with a phase's SQL). */
@Injectable()
export class PrismaErrorCatalogue extends ErrorCatalogue implements OnModuleInit {
  private readonly logger = new Logger('ErrorCatalogue');
  private byCode = new Map<string, ErrorCodeInfo>();
  private bySql = new Map<string, ErrorCodeInfo>();

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async onModuleInit() {
    const rows = await this.prisma.$queryRaw<Row[]>`
      select "code", "httpStatus", "category", "userMessage", "isLogged", "sqlState"
      from "Platform"."ErrorCodes" where "isActive"`;
    this.byCode = new Map(rows.map((r) => [r.code, r]));
    this.bySql = new Map(rows.filter((r) => r.sqlState).map((r) => [r.sqlState!, r]));
    if (!this.byCode.has('INTERNAL_ERROR')) throw new Error('Platform.ErrorCodes has no INTERNAL_ERROR; run npm run db:sql');
    this.logger.log(`Loaded ${rows.length} error codes`);
  }

  get(code: string) {
    return this.byCode.get(code);
  }

  bySqlState(sqlState: string) {
    return this.bySql.get(sqlState);
  }
}
