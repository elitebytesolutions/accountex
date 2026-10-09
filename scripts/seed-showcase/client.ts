/** Minimal cookie-based API client for the showcase seeder: one instance per signed-in user. */
export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string | null, readonly body: unknown, readonly path: string) {
    super(`${status} ${code ?? ''} ${path}: ${typeof body === 'string' ? body : JSON.stringify(body)}`.slice(0, 1500));
  }
}

export class Api {
  private cookie = '';
  calls = 0;

  constructor(readonly base: string, readonly label: string) {}

  /** Signs in and keeps the session cookies (tenant users: /auth/login; Super Admin: /admin/auth/login). */
  async login(path: string, body: Record<string, unknown>): Promise<unknown> {
    let res: Response, text: string;
    for (let attempt = 1; ; attempt++) {
      try {
        res = await fetch(this.base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      } catch (e) {
        if (attempt < 40) { await sleep(3000); continue; } // server restarting (watch mode)
        throw e;
      }
      text = await res.text();
      // Sign-in is rate limited; several seeder processes may log in at once.
      if (res.status === 429 && attempt < 60) { await sleep(10_000); continue; }
      break;
    }
    if (!res.ok) throw new ApiError(res.status, null, text, path);
    const cookies = res.headers.getSetCookie().map((c) => c.split(';')[0]);
    if (!cookies.length) throw new Error(`${this.label}: login returned no session cookie`);
    this.cookie = cookies.join('; ');
    return text ? JSON.parse(text) : null;
  }

  async req<T = any>(method: string, path: string, body?: unknown): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      this.calls++;
      let res: Response;
      try {
        res = await fetch(this.base + path, {
          method,
          headers: { cookie: this.cookie, 'x-seed': 'showcase', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch (e) {
        if (attempt < 40) { await sleep(3000); continue; } // server restarting (watch mode)
        throw e;
      }
      const text = await res.text();
      const json = text ? safeJson(text) : null;
      if (res.ok) return json as T;
      if (res.status === 429 && attempt < 12) { await sleep(6000); continue; }
      if (res.status >= 500 && attempt < 3) { await sleep(1500 * attempt); continue; }
      throw new ApiError(res.status, (json as any)?.error?.code ?? null, (json as any)?.error ?? text, `${method} ${path}`);
    }
  }

  get = <T = any>(path: string) => this.req<T>('GET', path);
  post = <T = any>(path: string, body: unknown = {}) => this.req<T>('POST', path, body);
  put = <T = any>(path: string, body: unknown = {}) => this.req<T>('PUT', path, body);
  patch = <T = any>(path: string, body: unknown = {}) => this.req<T>('PATCH', path, body);
  del = <T = any>(path: string) => this.req<T>('DELETE', path);

  /** All rows of a paged list endpoint (`{ items, total }` or a plain array). */
  async all<T = any>(path: string, pageSize = 100): Promise<T[]> {
    const out: T[] = [];
    for (let page = 1; page < 500; page++) {
      const sep = path.includes('?') ? '&' : '?';
      const r: any = await this.get(`${path}${sep}page=${page}&pageSize=${pageSize}`);
      const items: T[] = Array.isArray(r) ? r : (r?.items ?? r?.rows ?? []);
      out.push(...items);
      if (Array.isArray(r) || items.length < pageSize || (r?.total != null && out.length >= r.total)) break;
    }
    return out;
  }
}

const safeJson = (t: string) => { try { return JSON.parse(t); } catch { return t; } };
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
