import { Global, Module } from '@nestjs/common';
import { ErrorCatalogue, ErrorLog } from '../../core/application/ports/errors.js';
import { PrismaErrorCatalogue } from './prisma-error-catalogue.js';
import { PrismaErrorLog } from './prisma-error-log.js';

/** Binds the error catalogue and error log ports to their database implementations. */
@Global()
@Module({
  providers: [
    { provide: ErrorCatalogue, useClass: PrismaErrorCatalogue },
    { provide: ErrorLog, useClass: PrismaErrorLog },
  ],
  exports: [ErrorCatalogue, ErrorLog],
})
export class ErrorsModule {}
