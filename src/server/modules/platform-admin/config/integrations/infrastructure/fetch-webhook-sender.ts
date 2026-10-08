import { Injectable } from '@nestjs/common';
import { WebhookSender } from '../application/integration-store.js';

/** Sends webhooks with the platform fetch (Node 24): a POST with a hard timeout; redirects are not followed. */
@Injectable()
export class FetchWebhookSender extends WebhookSender {
  async post(url: string, body: string, headers: Record<string, string>, timeoutMs: number) {
    const started = performance.now();
    try {
      const res = await fetch(url, { method: 'POST', body, headers, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
      const text = await res.text().catch(() => '');
      return { responseCode: res.status >= 100 && res.status <= 599 ? res.status : null, responseBody: text.slice(0, 2000), latencyMs: Math.round(performance.now() - started), timedOut: false, error: null };
    } catch (e) {
      const timedOut = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
      const cause = e instanceof Error && e.cause instanceof Error ? `: ${e.cause.message}` : '';
      return {
        responseCode: null, responseBody: null, latencyMs: Math.round(performance.now() - started), timedOut,
        error: timedOut ? `No response within ${timeoutMs / 1000} s` : `${e instanceof Error ? e.message : String(e)}${cause}`,
      };
    }
  }
}
