import { Injectable } from '@nestjs/common';
import { env } from '../../../../infrastructure/config/env.js';
import { RespondentSecret } from '../application/engagement-actions.service.js';

/** The pulse respondent hash is keyed with the server's JWT secret, so it can't be recomputed outside the server. */
@Injectable()
export class EnvRespondentSecret extends RespondentSecret {
  value() {
    return env.JWT_SECRET;
  }
}
