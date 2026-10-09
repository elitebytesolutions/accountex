import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { env } from '../../../../infrastructure/config/env.js';
import { validBuyerTaxId } from '../domain/retry.js';
import { FbrGateway, type FbrConnection, type FbrDocument, type FbrHealth, type FbrSendResult } from '../application/fbr-gateway.js';

const TIMEOUT_MS = 20_000;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** The PRAL Digital Invoicing request body for a document. */
function diPayload(doc: FbrDocument, sandbox: boolean) {
  return {
    invoiceType: doc.kind === 'CREDIT_NOTE' ? 'Debit Note' : 'Sale Invoice',
    invoiceDate: doc.date,
    sellerNTNCNIC: doc.seller.ntn.replace(/-/g, ''),
    sellerBusinessName: doc.seller.name,
    sellerProvince: doc.seller.province ?? '',
    sellerAddress: doc.seller.address ?? '',
    buyerNTNCNIC: (doc.buyer.ntnCnic ?? '').replace(/-/g, ''),
    buyerBusinessName: doc.buyer.name ?? '',
    buyerProvince: doc.buyer.province ?? '',
    buyerAddress: doc.buyer.address ?? '',
    buyerRegistrationType: doc.buyer.registered ? 'Registered' : 'Unregistered',
    invoiceRefNo: doc.kind === 'CREDIT_NOTE' ? (doc.originalFbrInvoiceNo ?? '') : doc.documentNo,
    ...(sandbox && { scenarioId: doc.buyer.registered ? 'SN001' : 'SN002' }),
    items: doc.lines.map((l) => ({
      hsCode: l.hsCode ?? '',
      productDescription: l.description,
      rate: l.rate === null ? 'Exempt' : `${r2(l.rate)}%`,
      uoM: l.uom,
      quantity: l.quantity,
      totalValues: r2(l.total),
      valueSalesExcludingST: r2(l.valueExclTax),
      fixedNotifiedValueOrRetailPrice: 0,
      salesTaxApplicable: r2(l.salesTax),
      salesTaxWithheldAtSource: 0,
      extraTax: 0,
      furtherTax: r2(l.furtherTax),
      sroScheduleNo: '',
      fedPayable: 0,
      discount: r2(l.discount),
      saleType: 'Goods at standard rate (default)',
      sroItemSerialNo: '',
    })),
  };
}

/** PRAL Digital Invoicing over HTTPS (sandbox / production URL from env), bearer token from the company's settings. */
@Injectable()
export class HttpFbrGateway extends FbrGateway {
  async send(conn: FbrConnection, doc: FbrDocument): Promise<FbrSendResult> {
    const sandbox = conn.environment !== 'PRODUCTION';
    const request = diPayload(doc, sandbox);
    const started = Date.now();
    try {
      const res = await fetch(sandbox ? env.FBR_DI_URL_SANDBOX : env.FBR_DI_URL_PRODUCTION, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${conn.token ?? ''}` },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const latencyMs = Date.now() - started;
      const text = await res.text();
      let body: Record<string, unknown> | null = null;
      try {
        body = JSON.parse(text) as Record<string, unknown>;
      } catch {
        body = null;
      }
      const vr = (body?.validationResponse ?? {}) as { statusCode?: string; status?: string; error?: string; invoiceStatuses?: { error?: string }[] };
      const invoiceNo = typeof body?.invoiceNumber === 'string' && body.invoiceNumber ? body.invoiceNumber : null;
      if (res.ok && vr.statusCode === '00' && invoiceNo) {
        return { accepted: true, fbrInvoiceNo: invoiceNo, responseCode: vr.statusCode, message: vr.status ?? 'Valid', latencyMs, transient: false, request, response: body };
      }
      const message = vr.error || vr.invoiceStatuses?.find((s) => s.error)?.error || (res.status === 401 ? 'FBR rejected the API token' : `FBR responded ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`);
      return { accepted: false, fbrInvoiceNo: null, responseCode: vr.statusCode ?? String(res.status), message, latencyMs, transient: res.status >= 500 || res.status === 429, request, response: body ?? text.slice(0, 2000) };
    } catch (e) {
      const timeout = (e as Error).name === 'TimeoutError' || (e as Error).name === 'AbortError';
      return { accepted: false, fbrInvoiceNo: null, responseCode: timeout ? 'TIMEOUT' : 'NETWORK', message: timeout ? 'FBR did not respond in time' : `Could not reach FBR: ${(e as Error).message}`, latencyMs: Date.now() - started, transient: true, request, response: null };
    }
  }

  simulated() {
    return false;
  }

  /** Calls a reference API with the token: proves the endpoint is reachable and the token is accepted. */
  async health(conn: FbrConnection): Promise<FbrHealth> {
    const started = Date.now();
    try {
      const res = await fetch(env.FBR_REFERENCE_URL, { headers: { Authorization: `Bearer ${conn.token ?? ''}` }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      const latencyMs = Date.now() - started;
      if (res.ok) return { ok: true, latencyMs, message: `FBR responded in ${latencyMs} ms` };
      return { ok: false, latencyMs, message: res.status === 401 || res.status === 403 ? 'FBR rejected the API token' : `FBR responded ${res.status}` };
    } catch (e) {
      return { ok: false, latencyMs: null, message: `Could not reach FBR: ${(e as Error).message}` };
    }
  }
}

/**
 * Local stand-in for FBR, used only for companies listed in FBR_SIMULATE_TENANTS (tests). Accepts valid documents with
 * an invoice number starting "SIM-" (never mistaken for a real FBR number) and rejects a malformed buyer NTN / CNIC,
 * like FBR does.
 */
@Injectable()
export class SimulatedFbrGateway extends FbrGateway {
  async send(conn: FbrConnection, doc: FbrDocument): Promise<FbrSendResult> {
    const request = diPayload(doc, true);
    const latencyMs = 40 + Math.floor(Math.random() * 60);
    if (!validBuyerTaxId(doc.buyer.ntnCnic)) {
      return { accepted: false, fbrInvoiceNo: null, responseCode: '01', message: 'Invalid CNIC format', latencyMs, transient: false, request, response: { simulated: true, validationResponse: { statusCode: '01', status: 'Invalid', error: 'Invalid CNIC format' } } };
    }
    if (doc.kind === 'CREDIT_NOTE' && !doc.originalFbrInvoiceNo) {
      return { accepted: false, fbrInvoiceNo: null, responseCode: '01', message: 'The original invoice is not reported to FBR yet', latencyMs, transient: true, request, response: { simulated: true } };
    }
    const digits = BigInt(`0x${createHash('sha256').update(`${conn.posId}|${doc.documentNo}`).digest('hex').slice(0, 15)}`).toString().padStart(18, '0').slice(0, 18);
    const fbrInvoiceNo = `SIM-${conn.posId}-${digits}`;
    return { accepted: true, fbrInvoiceNo, responseCode: '00', message: 'Valid (simulated)', latencyMs, transient: false, request, response: { simulated: true, invoiceNumber: fbrInvoiceNo, validationResponse: { statusCode: '00', status: 'Valid' } } };
  }

  async health(): Promise<FbrHealth> {
    return { ok: true, latencyMs: 12, message: 'Simulator responded in 12 ms (test company)' };
  }

  simulated() {
    return true;
  }
}

/** Picks the simulator for test companies, otherwise PRAL over HTTPS. */
@Injectable()
export class RoutingFbrGateway extends FbrGateway {
  constructor(private readonly http: HttpFbrGateway, private readonly sim: SimulatedFbrGateway) {
    super();
  }

  simulated(tenantCode: string) {
    return env.FBR_SIMULATE_TENANTS.includes(tenantCode.toLowerCase());
  }

  send(conn: FbrConnection, doc: FbrDocument) {
    return this.simulated(conn.tenantCode) ? this.sim.send(conn, doc) : this.http.send(conn, doc);
  }

  health(conn: FbrConnection) {
    return this.simulated(conn.tenantCode) ? this.sim.health() : this.http.health(conn);
  }
}
