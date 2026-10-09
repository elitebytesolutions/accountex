/**
 * When a failed FBR submission is tried again. A transient failure (timeout, 5xx, network) backs off 1, 2, 4 … up to
 * 60 minutes; a rejection by FBR (invalid data) waits for a person to fix the document and retry.
 */
export function nextRetryAt(attempts: number, transient: boolean, now = new Date()): Date | null {
  if (!transient) return null;
  const minutes = Math.min(60, 2 ** Math.max(0, attempts - 1));
  return new Date(now.getTime() + minutes * 60_000);
}

/** Whether a company's sync is due: `intervalMinutes` after its last sync (never synced = due). */
export function syncDue(lastSyncAt: Date | null, intervalMinutes: number, now = new Date()) {
  return !lastSyncAt || now.getTime() - lastSyncAt.getTime() >= Math.max(1, intervalMinutes) * 60_000 - 5_000;
}

/** NTN (7–9 digits, optional check digit after a dash) or CNIC (13 digits, dashes optional). */
export function validBuyerTaxId(v: string | null) {
  if (!v) return true;
  const d = v.replace(/-/g, '');
  return /^\d{7,9}$/.test(d) || /^\d{13}$/.test(d);
}
