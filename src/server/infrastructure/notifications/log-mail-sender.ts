import { Injectable, Logger } from '@nestjs/common';
import { MailSender, type OutgoingMail } from '../../core/application/ports/mail-sender.js';

/** Until an email provider is configured: logs the recipient and subject only (the body may carry a sign-in link). */
@Injectable()
export class LogMailSender extends MailSender {
  readonly delivers = false;
  private readonly log = new Logger('Mail');

  async send(mail: OutgoingMail) {
    this.log.log(`not sent (no email provider): "${mail.subject}" to ${mail.to.replace(/^(.).*(@.*)$/, '$1***$2')}`);
  }
}
