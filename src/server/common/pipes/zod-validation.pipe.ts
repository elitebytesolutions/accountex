import { Injectable, PipeTransform } from '@nestjs/common';
import { z, type ZodType } from 'zod';
import { ValidationError } from '../../core/domain/errors.js';

/**
 * Validates and parses input with a schema from src/shared.
 * Usage: @Body(new ZodValidationPipe(LoginSchema)) input: LoginInput
 */
@Injectable()
export class ZodValidationPipe<T extends ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const { fieldErrors } = z.flattenError(result.error);
      throw new ValidationError('Invalid request', fieldErrors as Record<string, string[]>);
    }
    return result.data;
  }
}
