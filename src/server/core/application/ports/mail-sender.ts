export type OutgoingMail = { to: string; subject: string; text: string };

/**
 * Port: sends an email. No provider is connected yet (Phase 44): the adapter only records that a message would have
 * been sent, never its body (it may hold a one-time link). A real provider plugs in here without touching the flows.
 */
export abstract class MailSender {
  /** True when messages actually leave the system. */
  abstract readonly delivers: boolean;
  abstract send(mail: OutgoingMail): Promise<void>;
}
