/** A sales invoice or credit note as FBR Digital Invoicing needs it. */
export type FbrDocument = {
  kind: 'INVOICE' | 'CREDIT_NOTE';
  documentNo: string;
  date: string;
  posId: string;
  seller: { ntn: string; name: string; address: string | null; province: string | null };
  buyer: { ntnCnic: string | null; name: string | null; address: string | null; province: string | null; registered: boolean };
  /** For a credit note: the FBR invoice number of the original invoice. */
  originalFbrInvoiceNo: string | null;
  lines: {
    hsCode: string | null; description: string; uom: string; quantity: number; rate: number | null;
    valueExclTax: number; salesTax: number; furtherTax: number; discount: number; total: number;
  }[];
  total: number;
};

export type FbrConnection = {
  authority: string;
  environment: string;
  posId: string;
  ntn: string;
  token: string | null;
  /** The company's code: test companies (FBR_SIMULATE_TENANTS) use the local simulator. */
  tenantCode: string;
};

export type FbrSendResult = {
  accepted: boolean;
  fbrInvoiceNo: string | null;
  responseCode: string | null;
  message: string | null;
  latencyMs: number;
  /** Timeout / network / 5xx: try again later; otherwise FBR rejected the data. */
  transient: boolean;
  request: unknown;
  response: unknown;
};

export type FbrHealth = { ok: boolean; latencyMs: number | null; message: string };

/** Port: sends documents to FBR / PRA. Adapters: HTTP (PRAL Digital Invoicing) and a simulator for tests. */
export abstract class FbrGateway {
  abstract send(conn: FbrConnection, doc: FbrDocument): Promise<FbrSendResult>;
  abstract health(conn: FbrConnection): Promise<FbrHealth>;
  /** Whether this company is served by the simulator (tests) rather than FBR. */
  abstract simulated(tenantCode: string): boolean;
}
