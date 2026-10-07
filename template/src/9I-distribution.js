/* =====================================================================
   9I-distribution.js : Distribution operations (Wholesale & Distribution)
   - app/wholesale/load-sheet  Load Sheets (run builder, consolidated pick list, capacity, gate pass, dispatch)
   - app/wholesale/settlement  Route Settlement (per-shop grid, returns, cash denomination count, van stock, journal post)
   - app/wholesale/recovery    Recovery Sheet (ageing, collection inputs, bulk receipts, print, WhatsApp reminder)
   - app/wholesale/routes      Routes & Salesmen (route cards, SVG map, drag-drop shop board, targets & commission)
   Shells in 4E-distribution.html, styles in 1I-distribution.css. Prefix: ds-
   ===================================================================== */
(function () {
  'use strict';
  const FS = window.FS;
  const D = window.FS_DATA || {};
  if (!FS) return;

  /* ================================================================ helpers */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const RM = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n, d = 0) => FS.fmt(n, d);
  const money = (n, dec = 0) => FS.money(n, { dec });
  const sleep = (ms) => new Promise((r) => setTimeout(r, RM() ? Math.min(ms, 60) : ms));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const hash = (s) => Array.from(String(s)).reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const initials = (n) => String(n).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const avCls = (n) => ['', 'c2', 'c3', 'c4', 'c5', 'c6'][hash(n) % 6];
  const icons = (r) => { try { FS.icons(r); } catch (e) { /* cosmetic */ } };
  const toast = (m, o) => FS.toast(m, o || {});
  const celebrate = (el, label) => { try { FS.celebrate(el, label); } catch (e) { /* cosmetic */ } };
  const tickRs = (el, v) => el && FS.tick(el, Math.round(v), { dec: 0, prefix: 'Rs ' });
  const tickN = (el, v, suffix = '', dec = 0) => el && FS.tick(el, v, { dec, prefix: '', suffix });
  const compact = (n) => { const a = Math.abs(n); if (a >= 1e7) return (n / 1e7).toFixed(2) + ' Cr'; if (a >= 1e5) return (n / 1e5).toFixed(a >= 1e6 ? 1 : 2) + ' L'; if (a >= 1e3) return Math.round(n / 1e3) + 'k'; return String(Math.round(n)); };
  const r10 = (n) => Math.round(n / 10) * 10;
  const prng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dayOf = (iso) => DOW[new Date(iso + 'T00:00:00').getDay()];
  const nice = (iso) => { if (!iso) return '—'; const d = new Date(iso + 'T00:00:00'); return `${String(d.getDate()).padStart(2, '0')} ${MON[d.getMonth()]} ${d.getFullYear()}`; };
  const niceShort = (iso) => { const d = new Date(iso + 'T00:00:00'); return `${String(d.getDate()).padStart(2, '0')} ${MON[d.getMonth()]}`; };
  const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const TODAY = '2026-10-01';
  const CO = D.company || { name: 'Al-Noor Enterprises (Pvt) Ltd', address: 'Lahore', phone: '', ntn: '' };
  const busy = (btn, label) => { if (!btn) return () => {}; const html = btn.innerHTML; btn.disabled = true; btn.classList.add('ds-busy'); btn.innerHTML = `<span class="ds-spin"></span>${label}`; return (next) => { btn.classList.remove('ds-busy'); btn.disabled = false; btn.innerHTML = next != null ? next : html; icons(btn); }; };
  const flash = (el, cls = 'ds-flash') => { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
  const ctnpcs = (pcs, ctn) => { if (ctn <= 1) return `${fmt(pcs)} pcs`; const c = Math.floor(pcs / ctn), p = pcs % ctn; return `${c} ctn${p ? ` + ${p}` : ''}`; };

  /* ================================================================ shared demo model */
  const ITEM = {};
  (D.items || []).forEach((i) => { ITEM[i.sku] = i; });
  // kg per piece (carton weight = wt × ctn)
  const WT = { 'PK-1001': 0.62, 'PK-1003': 0.26, 'PK-1004': 2.1, 'OF-2002': 2.5, 'OF-2003': 0.62, 'IN-3001': 0.9, 'IN-3002': 0.48, 'EL-4001': 3.4, 'FD-5001': 0.072, 'FD-5002': 0.98, 'FD-5003': 0.56, 'FD-5004': 1.04, 'IT-6001': 0.11 };
  const POOL = ['FD-5001', 'FD-5002', 'FD-5003', 'FD-5004', 'PK-1003', 'OF-2002', 'IN-3001', 'FD-5002', 'FD-5003', 'PK-1001', 'OF-2003', 'EL-4001', 'IN-3002'].filter((s) => ITEM[s]);
  const ROUTES = clone(D.routes || []);
  const SHOPS = clone(D.shops || []);
  const SHOP = {};
  SHOPS.forEach((s) => { SHOP[s.code] = s; });
  const TIER = D.priceTiers || { Retailer: 1, Wholesaler: 0.95, Distributor: 0.9 };
  const VANS = {
    'LES-4471': { model: 'Hyundai Shehzore', ctn: 80, kg: 1000 },
    'LEA-2290': { model: 'Suzuki Ravi', ctn: 70, kg: 850 },
    'LEB-8812': { model: 'Isuzu NKR 3-ton', ctn: 110, kg: 1600 },
    'LEC-1907': { model: 'Suzuki Ravi (spare)', ctn: 50, kg: 600 },
  };
  const DRIVERS = (D.salesTeam && D.salesTeam.deliverymen) || ['Ali Haider', 'Rafiq Shah', 'Salman Butt'];
  const BOOKERS = (D.salesTeam && D.salesTeam.bookers) || ['Bilal Khan'];
  const SALESMEN = Array.from(new Set(ROUTES.map((r) => r.salesman).concat((D.salesTeam && D.salesTeam.salesmen) || [])));
  const routeOf = (code) => ROUTES.find((r) => r.code === code) || ROUTES[0];
  const unitPrice = (sku, shop) => Math.round((ITEM[sku].wprice || ITEM[sku].price) * (TIER[shop.tier] || 1));

  // deterministic open invoices for a route (about 12)
  const INV_BASE = { 'RT-01': 1180, 'RT-02': 1240, 'RT-03': 1300 };
  function invoicesFor(route, n = 12) {
    const shops = SHOPS.filter((s) => s.route === route);
    if (!shops.length) return [];
    const rnd = prng(hash(route) + 17);
    const base = INV_BASE[route] || 1400 + ROUTES.findIndex((r) => r.code === route) * 60;
    const out = [];
    for (let i = 0; i < n; i++) {
      const shop = shops[i % shops.length];
      const nl = 2 + Math.floor(rnd() * 3);
      const picks = [];
      while (picks.length < nl) { const s = POOL[Math.floor(rnd() * POOL.length)]; if (!picks.includes(s)) picks.push(s); }
      const lines = picks.map((sku) => {
        const it = ITEM[sku], c = it.ctn || 1;
        const cq = c >= 36 ? 1 : 1 + Math.floor(rnd() * (c <= 6 ? 2 : 3));
        const loose = c > 1 && rnd() < 0.45 ? 1 + Math.floor(rnd() * Math.min(c - 1, 11)) : 0;
        const pcs = cq * c + loose, price = unitPrice(sku, shop);
        return { sku, pcs, price, amt: pcs * price };
      });
      const amt = r10(lines.reduce((a, l) => a + l.amt, 0));
      const ctn = lines.reduce((a, l) => a + l.pcs / (ITEM[l.sku].ctn || 1), 0);
      out.push({ no: 'INV-2026-00' + (base + i), date: addDays(TODAY, -(i % 3)), shop: shop.code, lines, amt, ctn });
    }
    return out;
  }
  function consolidate(invs) {
    const map = {};
    invs.forEach((inv) => inv.lines.forEach((l) => {
      const m = map[l.sku] || (map[l.sku] = { sku: l.sku, pcs: 0, value: 0 });
      m.pcs += l.pcs; m.value += l.amt;
    }));
    return Object.values(map).map((m) => {
      const it = ITEM[m.sku], c = it.ctn || 1;
      return Object.assign(m, { name: it.name, brand: it.brand, shelf: it.shelf, ctn: c, c: Math.floor(m.pcs / c), p: m.pcs % c, eq: m.pcs / c, kg: m.pcs * (WT[m.sku] || 0.5) });
    }).sort((a, b) => (a.shelf + a.sku).localeCompare(b.shelf + b.sku));
  }
  const loadTotals = (lines) => lines.reduce((t, l) => ({ c: t.c + l.c, p: t.p + l.p, pcs: t.pcs + l.pcs, eq: t.eq + l.eq, kg: t.kg + l.kg, value: t.value + l.value }), { c: 0, p: 0, pcs: 0, eq: 0, kg: 0, value: 0 });

  // runs register (shared by load sheet + settlement)
  const RUNS = [];
  (function seedRuns() {
    const inv12 = invoicesFor('RT-01');
    const inv = inv12.slice(0, 10);
    const t = loadTotals(consolidate(inv));
    RUNS.push({ no: 'RUN-2026-0412', route: 'RT-01', van: 'LES-4471', driver: 'Ali Haider', date: TODAY, dep: '08:40', invoices: inv, inv: inv.length, ctn: t.eq, value: inv.reduce((a, i) => a + i.amt, 0), status: 'Dispatched' });
    RUNS.push({ no: 'RUN-2026-0413', route: 'RT-02', van: 'LEA-2290', driver: 'Rafiq Shah', date: TODAY, dep: '11:30', inv: 0, ctn: 0, value: 0, status: 'Loading', draft: true });
    [['RUN-2026-0414', 'RT-02', 'LEA-2290', 'Rafiq Shah', '2026-10-02', '08:30', 11, 52, 1162400],
      ['RUN-2026-0415', 'RT-03', 'LEB-8812', 'Salman Butt', '2026-10-03', '08:15', 14, 81, 1748900],
      ['RUN-2026-0416', 'RT-01', 'LES-4471', 'Ali Haider', '2026-10-05', '08:40', 12, 63, 1394200]].forEach((r) => RUNS.push({ no: r[0], route: r[1], van: r[2], driver: r[3], date: r[4], dep: r[5], inv: r[6], ctn: r[7], value: r[8], status: 'Scheduled' }));
    [['RUN-2026-0411', 'RT-03', 'LEB-8812', 'Salman Butt', '2026-09-30', '08:20', 13, 77, 1655300],
      ['RUN-2026-0410', 'RT-02', 'LEA-2290', 'Rafiq Shah', '2026-09-29', '08:35', 10, 49, 1048700],
      ['RUN-2026-0409', 'RT-01', 'LES-4471', 'Ali Haider', '2026-09-28', '08:45', 12, 66, 1421800],
      ['RUN-2026-0408', 'RT-01', 'LES-4471', 'Ali Haider', '2026-09-24', '08:40', 11, 58, 1276500]].forEach((r) => RUNS.push({ no: r[0], route: r[1], van: r[2], driver: r[3], date: r[4], dep: r[5], inv: r[6], ctn: r[7], value: r[8], status: 'Settled' }));
  })();
  const runOf = (no) => RUNS.find((r) => r.no === no);
  const STATUS_TONE = { Loading: 'warn', Dispatched: 'info', Scheduled: 'neutral', Settled: 'good' };
  const statusPill = (s) => `<span class="badge dot ${STATUS_TONE[s] || 'neutral'}">${s}</span>`;

  const paperHead = (title, sub) => `
    <div class="paper-head"><div><h2>${esc(CO.name)}</h2><div class="muted small">${esc(CO.address)}<br>${esc(CO.phone || '')} · NTN ${esc(CO.ntn || '')}</div></div>
    <div class="right"><h2>${title}</h2><div class="muted small">${sub}</div></div></div>`;
  const signLines = (labels) => `<div class="ds-signs">${labels.map((l) => `<div><span></span><small>${l}</small></div>`).join('')}</div>`;

  /* ================================================================ 1. LOAD SHEETS */
  let lsRunId = 'RUN-2026-0413';
  const lsCurrentRun = () => runOf(lsRunId);
  const once = (sec, key, fn) => { if (sec.dataset['ds' + key]) return; sec.dataset['ds' + key] = '1'; fn(sec); };
  const LS = { route: 'RT-02', van: 'LEA-2290', driver: 'Rafiq Shah', date: TODAY, dep: '11:30', invoices: [], sel: new Set(), picked: new Set(), prev: {}, runTab: 'today', overShown: false };
  
  function lsSetRoute(code, keepVan) {
    const r = routeOf(code);
    LS.route = r.code;
    if (!keepVan) { LS.van = r.van; LS.driver = r.driver; }
    LS.invoices = invoicesFor(r.code);
    LS.sel = new Set(LS.invoices.slice(0, 9).map((i) => i.no));
    LS.picked = new Set();
    LS.prev = {};
  }

  function renderLoadSheet(sec) {
    sec.innerHTML = `
      <div class="page-head">
        <div><div class="eyebrow">Wholesale &amp; Distribution / Distribution</div><h1>Load Sheets</h1>
          <p>Consolidate the day's invoices into a van-ready pick list, watch the van fill up, print the gate pass and send it on its beat.</p></div>
        <div class="head-actions"><span class="tagline">Load right, ride light</span>
          <a class="btn secondary" href="#/app/wholesale/settlement"><i data-lucide="handshake"></i>Route settlement</a>
          <button class="btn primary" data-ds="ls-newrun"><i data-lucide="plus"></i>New run</button></div>
      </div>
      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-top"><span>Today's runs</span><span class="icon-well"><i data-lucide="truck"></i></span></div><strong data-k="runs">0</strong><small data-k="runs-sub">1 on the road · 1 loading</small></div>
        <div class="kpi teal"><div class="kpi-top"><span>Invoices loaded</span><span class="icon-well"><i data-lucide="receipt-text"></i></span></div><strong data-k="inv">0</strong><small data-k="inv-sub">across 2 vans</small></div>
        <div class="kpi blue"><div class="kpi-top"><span>Cartons loaded</span><span class="icon-well"><i data-lucide="package"></i></span></div><strong data-k="ctn">0</strong><small data-k="ctn-sub">equivalent cartons</small></div>
        <div class="kpi violet"><div class="kpi-top"><span>Load value</span><span class="icon-well"><i data-lucide="banknote"></i></span></div><strong data-k="val">Rs 0</strong><small class="up" data-k="val-sub">▲ 6.4% vs last Thursday</small></div>
      </div>

      <div class="ds-ls-top">
        <div class="panel ds-builder">
          <div class="panel-head"><div><h3 class="row" style="gap:10px">Run builder <span class="ds-runno">${lsRunId}</span><span data-ds="ls-status">${statusPill('Loading')}</span></h3><p>Pick a route and vehicle, then tick the invoices going on this run.</p></div>
            <div class="panel-actions"><button class="btn ghost sm" data-ds="ls-reset"><i data-lucide="rotate-ccw"></i>Reset</button></div></div>
          <div class="form-grid ds-runform">
            <label><span>Route</span><select data-f="route"></select></label>
            <label><span>Vehicle (van no)</span><select data-f="van"></select></label>
            <label><span>Driver</span><select data-f="driver">${DRIVERS.map((d) => `<option>${esc(d)}</option>`).join('')}</select></label>
            <label><span>Date</span><input type="date" data-f="date" value="${LS.date}"></label>
            <label><span>Departure</span><input type="time" data-f="dep" value="${LS.dep}"></label>
          </div>
          <div class="ds-routemeta" data-ds="ls-meta"></div>
          <div class="ds-picker-head">
            <div><b>Open invoices</b> <span class="muted small" data-ds="ls-selcount"></span></div>
            <div class="row"><button class="btn ghost sm" data-ds="ls-all"><i data-lucide="list-checks"></i>Select all</button><button class="btn ghost sm" data-ds="ls-none"><i data-lucide="list-x"></i>Clear</button></div>
          </div>
          <div class="table-wrap ds-picker"><table class="tbl ds-tbl" data-plain>
            <thead><tr><th style="width:36px"></th><th>Invoice</th><th>Shop</th><th class="num">Lines</th><th class="num">CTN</th><th class="num">Amount</th></tr></thead>
            <tbody data-ds="ls-inv"></tbody></table></div>
        </div>

        <div class="panel ds-capacity" data-ds="ls-cap">
          <div class="panel-head"><div><h3>Van capacity</h3><p data-ds="ls-vanname">—</p></div><span class="badge good" data-ds="ls-capbadge">Fits</span></div>
          <div class="ds-van-wrap">
            <svg class="ds-van" viewBox="0 0 250 118" aria-hidden="true">
              <defs><clipPath id="ds-van-clip"><rect x="8" y="12" width="156" height="70" rx="9"/></clipPath></defs>
              <rect class="ds-van-box" x="8" y="12" width="156" height="70" rx="9"/>
              <g clip-path="url(#ds-van-clip)"><rect class="ds-van-fill" x="8" y="12" width="156" height="70"/>
                <g class="ds-van-crates">${Array.from({ length: 9 }, (_, i) => `<line x1="${8 + (i + 1) * 15.6}" y1="12" x2="${8 + (i + 1) * 15.6}" y2="82"/>`).join('')}<line x1="8" y1="47" x2="164" y2="47"/></g></g>
              <path class="ds-van-cab" d="M168 30 h40 q8 0 13 7 l17 22 q4 5 4 12 v11 h-74 z"/>
              <path class="ds-van-win" d="M176 37 h28 q4 0 7 4 l12 16 h-47 z"/>
              <rect class="ds-van-chassis" x="6" y="82" width="238" height="8" rx="4"/>
              <g class="ds-wheel"><circle cx="48" cy="94" r="14"/><circle class="hub" cx="48" cy="94" r="5"/></g>
              <g class="ds-wheel"><circle cx="203" cy="94" r="14"/><circle class="hub" cx="203" cy="94" r="5"/></g>
              <text class="ds-van-plate" x="225" y="80" text-anchor="middle" data-ds="ls-plate">LEA</text>
            </svg>
            <div class="ds-van-pct"><b data-ds="ls-pct">0%</b><small>of carton space</small></div>
          </div>
          <div class="ds-meter" data-m="ctn"><div class="ds-meter-top"><span><i data-lucide="package"></i>Cartons</span><b><span data-v>0</span> <small>/ <span data-cap>0</span></small></b></div><div class="ds-track"><i></i><em></em></div></div>
          <div class="ds-meter" data-m="kg"><div class="ds-meter-top"><span><i data-lucide="weight"></i>Weight (kg)</span><b><span data-v>0</span> <small>/ <span data-cap>0</span></small></b></div><div class="ds-track"><i></i><em></em></div></div>
          <div class="ds-over" data-ds="ls-over" hidden><i data-lucide="triangle-alert"></i><div><b>Over capacity</b><small data-ds="ls-overtxt"></small></div></div>
          <div class="ds-capstats">
            <div><small>Invoices</small><b data-ds="ls-s-inv">0</b></div><div><small>Shops</small><b data-ds="ls-s-shops">0</b></div>
            <div><small>SKU lines</small><b data-ds="ls-s-sku">0</b></div><div><small>Value</small><b data-ds="ls-s-val">Rs 0</b></div>
          </div>
          <div class="ds-capactions">
            <button class="btn secondary" data-ds="ls-print"><i data-lucide="printer"></i>Print load sheet</button>
            <button class="btn secondary" data-ds="ls-gate"><i data-lucide="qr-code"></i>Gate pass</button>
            <button class="btn primary lg block" data-ds="ls-dispatch"><i data-lucide="send"></i>Dispatch van</button>
          </div>
        </div>
      </div>

      <div class="panel flush">
        <div class="panel-head"><div><h3>Consolidated load list</h3><p>Every SKU across the selected invoices, broken into cartons and loose pieces for the store keeper.</p></div>
          <div class="panel-actions ds-pickprog"><div class="ds-pickbar"><i data-ds="ls-pickfill"></i></div><span class="small muted" data-ds="ls-picktxt">0 of 0 picked</span><button class="btn secondary sm" data-ds="ls-pickall"><i data-lucide="check-check"></i>Mark all picked</button></div></div>
        <div class="table-wrap"><table class="tbl ds-tbl ds-loadtbl" data-plain>
          <thead><tr><th style="width:44px">✓</th><th>SKU</th><th>Product</th><th class="num">CTN</th><th class="num">PCS</th><th class="num">Total pcs</th><th class="num">Weight</th><th class="num">Value</th></tr></thead>
          <tbody data-ds="ls-lines"></tbody>
          <tfoot><tr><td></td><td colspan="2">Total · <span data-ds="ls-t-sku">0</span> SKUs</td><td class="num" data-ds="ls-t-c">0</td><td class="num" data-ds="ls-t-p">0</td><td class="num" data-ds="ls-t-pcs">0</td><td class="num" data-ds="ls-t-kg">0</td><td class="num" data-ds="ls-t-val">Rs 0</td></tr></tfoot>
        </table></div>
      </div>

      <div class="panel flush">
        <div class="panel-head"><div><h3>Runs</h3><p>Every van trip with its load, departure and settlement status.</p></div>
          <div class="seg" data-ds="ls-runtabs"><button class="active" data-t="today">Today</button><button data-t="scheduled">Scheduled</button><button data-t="completed">Completed</button></div></div>
        <div class="table-wrap"><table class="tbl ds-tbl" data-plain>
          <thead><tr><th>Run</th><th>Route</th><th>Van · Driver</th><th>Date</th><th>Departs</th><th class="num">Invoices</th><th class="num">CTN</th><th class="num">Value</th><th>Status</th><th></th></tr></thead>
          <tbody data-ds="ls-runs"></tbody></table></div>
      </div>`;
    lsFillSelects(sec);
    lsRenderAll(sec, true);
    once(sec, 'Bound', lsBind);
  }

  function lsFillSelects(sec) {
    const rSel = $('[data-f="route"]', sec), vSel = $('[data-f="van"]', sec), dSel = $('[data-f="driver"]', sec);
    rSel.innerHTML = ROUTES.map((r) => `<option value="${r.code}">${r.code} · ${esc(r.name)}</option>`).join('');
    vSel.innerHTML = Object.keys(VANS).map((v) => `<option value="${v}">${v} · ${VANS[v].model}</option>`).join('');
    rSel.value = LS.route; vSel.value = LS.van; dSel.value = LS.driver;
  }

  function lsRenderAll(sec, first) {
    lsRenderMeta(sec);
    lsRenderInvoices(sec);
    lsRecalc(sec, first);
    lsRenderRuns(sec);
    lsLock(sec);
  }

  function lsRenderMeta(sec) {
    const r = routeOf(LS.route), d = dayOf(LS.date);
    const onBeat = r.days.includes(d);
    $('[data-ds="ls-meta"]', sec).innerHTML = `
      <span class="pill"><i data-lucide="user-round"></i>Booker <b>${esc(r.booker)}</b></span>
      <span class="pill"><i data-lucide="badge-check"></i>Salesman <b>${esc(r.salesman)}</b></span>
      <span class="ds-days">${WEEK.map((w) => `<i class="${r.days.includes(w) ? 'on' : ''} ${w === d ? 'today' : ''}">${w[0]}${w[1]}</i>`).join('')}</span>
      <span class="badge ${onBeat ? 'good' : 'warn'} dot">${onBeat ? 'On-beat day' : `Off-beat · visits ${r.days.join('/')}`}</span>`;
    icons($('[data-ds="ls-meta"]', sec));
  }

  function lsRenderInvoices(sec) {
    const tb = $('[data-ds="ls-inv"]', sec);
    if (!LS.invoices.length) { tb.innerHTML = `<tr><td colspan="6"><div class="ds-empty"><i data-lucide="inbox"></i><b>No open invoices</b><small>This route has no shops assigned. Move shops onto it in Routes &amp; Salesmen.</small></div></td></tr>`; icons(tb); return; }
    tb.innerHTML = LS.invoices.map((inv, i) => {
      const s = SHOP[inv.shop], on = LS.sel.has(inv.no);
      return `<tr class="ds-pick ${on ? 'on' : ''}" data-inv="${inv.no}" style="--i:${i}">
        <td><input type="checkbox" ${on ? 'checked' : ''} aria-label="Load ${inv.no}"></td>
        <td><b>${inv.no}</b><small>${niceShort(inv.date)} · ${inv.lines.length} SKUs</small></td>
        <td><b>${esc(s.name)}</b><small>${esc(s.area)} · ${s.tier}</small></td>
        <td class="num">${inv.lines.length}</td>
        <td class="num">${inv.ctn.toFixed(1)}</td>
        <td class="num"><b>${money(inv.amt)}</b></td></tr>`;
    }).join('');
  }

  function lsRecalc(sec, first) {
    const invs = LS.invoices.filter((i) => LS.sel.has(i.no));
    const lines = consolidate(invs), t = loadTotals(lines);
    const van = VANS[LS.van] || { ctn: 60, kg: 700, model: '' };
    // consolidated list
    const tb = $('[data-ds="ls-lines"]', sec);
    if (!lines.length) {
      tb.innerHTML = `<tr><td colspan="8"><div class="ds-empty"><i data-lucide="package-open"></i><b>Nothing to load yet</b><small>Tick invoices in the run builder and the pick list builds itself.</small></div></td></tr>`;
    } else {
      tb.innerHTML = lines.map((l, i) => {
        const prev = LS.prev[l.sku], pk = LS.picked.has(l.sku);
        const cls = prev == null ? (first ? '' : 'ds-rowin') : (prev !== l.pcs ? 'row-flash' : '');
        return `<tr class="${cls} ${pk ? 'ds-picked' : ''}" data-sku="${l.sku}" style="--i:${i}">
          <td><label class="ds-check"><input type="checkbox" ${pk ? 'checked' : ''} aria-label="Picked ${l.sku}"><span><i data-lucide="check"></i></span></label></td>
          <td><span class="ds-sku">${l.sku}</span><small>Shelf ${l.shelf}</small></td>
          <td><b>${esc(l.name)}</b><small>${esc(l.brand)} · ${l.ctn > 1 ? `${l.ctn} per ctn` : 'single'}</small></td>
          <td class="num"><b>${l.c}</b></td><td class="num">${l.p || '<span class="zero">—</span>'}</td>
          <td class="num">${fmt(l.pcs)}</td><td class="num">${fmt(l.kg, 1)} kg</td><td class="num">${money(l.value)}</td></tr>`;
      }).join('');
    }
    icons(tb);
    LS.prev = {}; lines.forEach((l) => { LS.prev[l.sku] = l.pcs; });
    // drop stale picks
    LS.picked.forEach((s) => { if (!lines.find((l) => l.sku === s)) LS.picked.delete(s); });
    tickN($('[data-ds="ls-t-sku"]', sec), lines.length);
    tickN($('[data-ds="ls-t-c"]', sec), t.c); tickN($('[data-ds="ls-t-p"]', sec), t.p); tickN($('[data-ds="ls-t-pcs"]', sec), t.pcs);
    tickN($('[data-ds="ls-t-kg"]', sec), t.kg, ' kg', 1); tickRs($('[data-ds="ls-t-val"]', sec), t.value);
    lsPickProgress(sec, lines.length);
    // selection count
    $('[data-ds="ls-selcount"]', sec).textContent = `· ${LS.sel.size} of ${LS.invoices.length} selected · ${routeOf(LS.route).code}`;
    // capacity
    const pc = van.ctn ? (t.eq / van.ctn) * 100 : 0, pk = van.kg ? (t.kg / van.kg) * 100 : 0, worst = Math.max(pc, pk);
    $('[data-ds="ls-vanname"]', sec).textContent = `${LS.van} · ${van.model} · ${van.ctn} ctn / ${fmt(van.kg)} kg`;
    $('[data-ds="ls-plate"]', sec).textContent = LS.van.split('-')[0];
    const setMeter = (key, val, cap, pct, dec) => {
      const m = $(`.ds-meter[data-m="${key}"]`, sec);
      tickN($('[data-v]', m), val, '', dec); $('[data-cap]', m).textContent = fmt(cap);
      $('.ds-track>i', m).style.width = Math.min(100, pct) + '%';
      $('.ds-track>em', m).style.width = pct > 100 ? Math.min(40, pct - 100) + '%' : '0%';
      m.classList.toggle('warn', pct >= 85 && pct <= 100); m.classList.toggle('over', pct > 100);
    };
    setMeter('ctn', Math.round(t.eq), van.ctn, pc, 0); setMeter('kg', t.kg, van.kg, pk, 0);
    const cap = $('[data-ds="ls-cap"]', sec);
    const fill = $('.ds-van-fill', sec);
    fill.style.transform = `scaleX(${Math.min(1, worst / 100)})`;
    cap.classList.toggle('warn', worst >= 85 && worst <= 100);
    const wasOver = cap.classList.contains('over');
    cap.classList.toggle('over', worst > 100);
    tickN($('[data-ds="ls-pct"]', sec), Math.round(pc), '%');
    const badge = $('[data-ds="ls-capbadge"]', sec);
    badge.className = 'badge ' + (worst > 100 ? 'danger' : worst >= 85 ? 'warn' : 'good');
    badge.textContent = worst > 100 ? 'Over capacity' : worst >= 85 ? 'Nearly full' : 'Fits';
    const over = $('[data-ds="ls-over"]', sec);
    over.hidden = worst <= 100;
    if (worst > 100) {
      const exC = t.eq - van.ctn, exK = t.kg - van.kg;
      $('[data-ds="ls-overtxt"]', sec).textContent = `${exC > 0 ? `${exC.toFixed(1)} cartons` : ''}${exC > 0 && exK > 0 ? ' and ' : ''}${exK > 0 ? `${fmt(exK)} kg` : ''} over ${LS.van}. Drop an invoice or switch to a bigger van.`;
      if (!wasOver && !first) { flash(cap, 'ds-shake'); toast(`${LS.van} is over capacity, check the load before dispatch`, { tone: 'warn' }); }
    }
    // stats
    tickN($('[data-ds="ls-s-inv"]', sec), invs.length);
    tickN($('[data-ds="ls-s-shops"]', sec), new Set(invs.map((i) => i.shop)).size);
    tickN($('[data-ds="ls-s-sku"]', sec), lines.length);
    $('[data-ds="ls-s-val"]', sec).innerHTML = 'Rs ' + compact(t.value);
    // update draft run + KPIs
    const run = lsCurrentRun();
    if (run && run.status === 'Loading') {
      Object.assign(run, { route: LS.route, van: LS.van, driver: LS.driver, date: LS.date, dep: LS.dep, inv: invs.length, ctn: t.eq, value: invs.reduce((a, i) => a + i.amt, 0), invoices: invs });
    }
    lsKpis(sec);
    LS.cur = { invs, lines, t, van, worst };
  }

  function lsPickProgress(sec, n) {
    const k = LS.picked.size;
    $('[data-ds="ls-pickfill"]', sec).style.width = n ? (k / n) * 100 + '%' : '0%';
    $('[data-ds="ls-picktxt"]', sec).textContent = `${k} of ${n} picked`;
  }

  function lsKpis(sec) {
    const today = RUNS.filter((r) => r.date === TODAY && r.status !== 'Scheduled');
    const loaded = today.filter((r) => r.inv > 0);
    tickN($('[data-k="runs"]', sec), today.length);
    const road = today.filter((r) => r.status === 'Dispatched').length, loading = today.filter((r) => r.status === 'Loading').length, done = today.filter((r) => r.status === 'Settled').length;
    $('[data-k="runs-sub"]', sec).textContent = [road && `${road} on the road`, loading && `${loading} loading`, done && `${done} settled`].filter(Boolean).join(' · ') || 'No runs yet';
    tickN($('[data-k="inv"]', sec), loaded.reduce((a, r) => a + r.inv, 0));
    $('[data-k="inv-sub"]', sec).textContent = `across ${new Set(loaded.map((r) => r.van)).size} vans`;
    tickN($('[data-k="ctn"]', sec), Math.round(loaded.reduce((a, r) => a + r.ctn, 0)));
    tickRs($('[data-k="val"]', sec), loaded.reduce((a, r) => a + r.value, 0));
  }

  function lsRenderRuns(sec) {
    const tab = LS.runTab;
    const rows = RUNS.filter((r) => tab === 'today' ? r.date === TODAY && r.status !== 'Settled' : tab === 'scheduled' ? r.status === 'Scheduled' : r.status === 'Settled');
    const tb = $('[data-ds="ls-runs"]', sec);
    tb.innerHTML = rows.length ? rows.map((r, i) => {
      const rt = routeOf(r.route);
      const act = r.status === 'Dispatched' ? `<a class="btn secondary sm" href="#/app/wholesale/settlement" data-settle="${r.no}"><i data-lucide="handshake"></i>Settle</a>`
        : r.status === 'Loading' ? `<button class="btn ghost sm" data-ds="ls-tobuilder"><i data-lucide="arrow-up"></i>Builder</button>`
          : `<button class="btn ghost sm" data-runinfo="${r.no}"><i data-lucide="eye"></i>View</button>`;
      return `<tr class="ds-rowin" style="--i:${i}"><td><b>${r.no}</b><small>${r.draft ? 'Draft in builder' : 'Load sheet LS-' + r.no.slice(-4)}</small></td>
        <td><span class="ds-rt">${rt.code}</span> ${esc(rt.name)}</td><td><b>${r.van}</b><small>${esc(r.driver)}</small></td>
        <td>${nice(r.date)}<small>${dayOf(r.date)}</small></td><td>${r.dep}</td><td class="num">${r.inv}</td><td class="num">${r.ctn ? r.ctn.toFixed(0) : '—'}</td>
        <td class="num">${r.value ? money(r.value) : '<span class="zero">—</span>'}</td><td>${statusPill(r.status)}</td><td class="actions">${act}</td></tr>`;
    }).join('') : `<tr><td colspan="10"><div class="ds-empty"><i data-lucide="calendar-x"></i><b>No runs here</b><small>Runs show up as you schedule and dispatch them.</small></div></td></tr>`;
    icons(tb);
  }

  function lsLock(sec) {
    const run = lsCurrentRun(), locked = run && run.status !== 'Loading';
    $$('.ds-runform select, .ds-runform input, [data-ds="ls-inv"] input', sec).forEach((el) => { el.disabled = !!locked; });
    $('.ds-builder', sec).classList.toggle('ds-locked', !!locked);
    ['ls-all', 'ls-none', 'ls-reset'].forEach((k) => { const b = $(`[data-ds="${k}"]`, sec); if (b) b.disabled = !!locked; });
    $('[data-ds="ls-status"]', sec).innerHTML = statusPill(run ? run.status : 'Loading');
    const d = $('[data-ds="ls-dispatch"]', sec);
    if (locked) { d.disabled = true; d.innerHTML = `<i data-lucide="circle-check"></i>Dispatched ${run.dispatchedAt || ''}`; icons(d); }
  }

  function lsBind(sec) {
    sec.addEventListener('change', (e) => {
      const f = e.target.dataset.f;
      if (f === 'route') { lsSetRoute(e.target.value); lsFillSelects(sec); FS.skeleton($('.ds-picker', sec), 420); lsRenderMeta(sec); lsRenderInvoices(sec); lsRecalc(sec); lsRenderRuns(sec); }
      else if (f === 'van') { LS.van = e.target.value; lsRecalc(sec); lsRenderRuns(sec); }
      else if (f === 'driver') { LS.driver = e.target.value; lsRecalc(sec); lsRenderRuns(sec); }
      else if (f === 'date') { LS.date = e.target.value || TODAY; lsRenderMeta(sec); lsRecalc(sec); lsRenderRuns(sec); }
      else if (f === 'dep') { LS.dep = e.target.value; lsRecalc(sec); lsRenderRuns(sec); }
      else if (e.target.closest('[data-ds="ls-inv"]')) {
        const tr = e.target.closest('tr'); const no = tr.dataset.inv;
        if (e.target.checked) LS.sel.add(no); else LS.sel.delete(no);
        tr.classList.toggle('on', e.target.checked); lsRecalc(sec);
      } else if (e.target.closest('[data-ds="ls-lines"]')) {
        const tr = e.target.closest('tr'); const sku = tr.dataset.sku;
        if (e.target.checked) LS.picked.add(sku); else LS.picked.delete(sku);
        tr.classList.toggle('ds-picked', e.target.checked);
        lsPickProgress(sec, $$('[data-ds="ls-lines"] tr[data-sku]', sec).length);
      }
    });
    sec.addEventListener('click', (e) => {
      // whole-row toggle in invoice picker
      const pr = e.target.closest('[data-ds="ls-inv"] tr[data-inv]');
      if (pr && !e.target.closest('input') && !pr.querySelector('input').disabled) { const cb = pr.querySelector('input'); cb.checked = !cb.checked; cb.dispatchEvent(new Event('change', { bubbles: true })); return; }
      const tabBtn = e.target.closest('[data-ds="ls-runtabs"] button');
      if (tabBtn) { LS.runTab = tabBtn.dataset.t; lsRenderRuns(sec); return; }
      const st = e.target.closest('[data-settle]');
      if (st) { ST.pending = st.dataset.settle; return; }
      const ri = e.target.closest('[data-runinfo]');
      if (ri) { runInfo(runOf(ri.dataset.runinfo)); return; }
      const b = e.target.closest('[data-ds]');
      if (!b) return;
      const k = b.dataset.ds;
      if (k === 'ls-all') { LS.invoices.forEach((i) => LS.sel.add(i.no)); lsRenderInvoices(sec); lsRecalc(sec); }
      else if (k === 'ls-none') { LS.sel.clear(); lsRenderInvoices(sec); lsRecalc(sec); }
      else if (k === 'ls-reset') { lsSetRoute(LS.route); lsFillSelects(sec); lsRenderInvoices(sec); lsRecalc(sec); toast('Run builder reset to route defaults', { tone: 'info' }); }
      else if (k === 'ls-pickall') { $$('[data-ds="ls-lines"] tr[data-sku]', sec).forEach((tr, i) => { LS.picked.add(tr.dataset.sku); setTimeout(() => { tr.classList.add('ds-picked'); tr.querySelector('input').checked = true; }, RM() ? 0 : i * 45); }); lsPickProgress(sec, $$('[data-ds="ls-lines"] tr[data-sku]', sec).length); }
      else if (k === 'ls-print') lsPrint();
      else if (k === 'ls-gate') lsGate();
      else if (k === 'ls-dispatch') lsDispatch(sec, b);
      else if (k === 'ls-tobuilder') $('.ds-builder', sec).scrollIntoView({ behavior: RM() ? 'auto' : 'smooth', block: 'start' });
      else if (k === 'ls-newrun') lsNewRun(sec);
    });
  }

  function lsNewRun(sec) {
    const run = lsCurrentRun();
    if (run.status === 'Loading') { $('.ds-builder', sec).scrollIntoView({ behavior: RM() ? 'auto' : 'smooth', block: 'start' }); flash($('.ds-builder', sec), 'ds-glow'); toast(`${run.no} is still loading, finish it first`, { tone: 'info' }); return; }
    // start a fresh run number
    const nextNo = 'RUN-2026-0' + (Math.max(...RUNS.map((r) => +r.no.slice(-4))) + 1);
    run.draft = false;
    const fresh = { no: nextNo, route: LS.route, van: LS.van, driver: LS.driver, date: TODAY, dep: '14:00', inv: 0, ctn: 0, value: 0, status: 'Loading', draft: true };
    RUNS.splice(RUNS.indexOf(run) + 1, 0, fresh);
    lsRunId = nextNo;
    lsSetRoute(LS.route); LS.dep = '14:00';
    $('.ds-runno', sec).textContent = nextNo;
    $('[data-f="dep"]', sec).value = LS.dep;
    const d = $('[data-ds="ls-dispatch"]', sec); d.disabled = false; d.innerHTML = '<i data-lucide="send"></i>Dispatch van'; icons(d);
    lsRenderAll(sec);
    flash($('.ds-builder', sec), 'ds-glow');
    toast(`${nextNo} started`, { tone: 'good' });
  }

  function runInfo(r) {
    if (!r) return;
    const rt = routeOf(r.route);
    FS.drawer({ title: r.no, subtitle: `${rt.code} · ${rt.name}`, html: `
      <div class="ds-runinfo"><span class="icon-tile ${r.status === 'Settled' ? '' : 'blue'}"><i data-lucide="truck"></i></span><div><b>${r.van} · ${VANS[r.van] ? VANS[r.van].model : ''}</b><small>${esc(r.driver)} · departs ${r.dep}</small></div>${statusPill(r.status)}</div>
      <div class="dl qv-dl">
        <div><span>Date</span><b>${nice(r.date)} (${dayOf(r.date)})</b></div><div><span>Booker</span><b>${esc(rt.booker)}</b></div>
        <div><span>Salesman</span><b>${esc(rt.salesman)}</b></div><div><span>Invoices</span><b>${r.inv}</b></div>
        <div><span>Cartons</span><b>${Math.round(r.ctn)}</b></div><div><span>Load value</span><b>${money(r.value, 2)}</b></div>
      </div>`, foot: `<button class="btn secondary" data-close>Close</button>` });
  }

  function lsPaperTable(lines, t, picked) {
    return `<table class="tbl"><thead><tr><th>#</th><th>SKU</th><th>Product</th><th class="num">CTN</th><th class="num">PCS</th><th class="num">Total</th><th class="num">Kg</th><th class="num">Value</th><th>✓</th></tr></thead><tbody>
      ${lines.map((l, i) => `<tr><td>${i + 1}</td><td>${l.sku}</td><td>${esc(l.name)}</td><td class="num"><b>${l.c}</b></td><td class="num">${l.p || '—'}</td><td class="num">${fmt(l.pcs)}</td><td class="num">${fmt(l.kg, 1)}</td><td class="num">${fmt(l.value)}</td><td>${picked && picked.has(l.sku) ? '☑' : '☐'}</td></tr>`).join('')}
      <tr class="total"><td></td><td colspan="2">Total</td><td class="num">${t.c}</td><td class="num">${t.p}</td><td class="num">${fmt(t.pcs)}</td><td class="num">${fmt(t.kg, 1)}</td><td class="num">${fmt(t.value)}</td><td></td></tr></tbody></table>`;
  }

  function lsPrint() {
    const c = LS.cur, run = lsCurrentRun(), rt = routeOf(LS.route);
    if (!c || !c.lines.length) { toast('Select at least one invoice to print a load sheet', { tone: 'warn' }); return; }
    FS.drawer({ wide: true, title: 'Load sheet preview', subtitle: `${run.no} · ${rt.code} ${rt.name}`, html: `
      <div class="paper ds-paper">${paperHead('LOAD SHEET', `LS-${run.no.slice(-4)} · ${nice(LS.date)}`)}
        <div class="paper-meta">
          <div><small>Run</small><b>${run.no}</b></div><div><small>Route</small><b>${rt.code} · ${esc(rt.name)}</b></div>
          <div><small>Vehicle</small><b>${LS.van} · ${VANS[LS.van].model}</b></div><div><small>Driver</small><b>${esc(LS.driver)}</b></div>
          <div><small>Salesman</small><b>${esc(rt.salesman)}</b></div><div><small>Departure</small><b>${nice(LS.date)} · ${LS.dep}</b></div>
        </div>
        ${lsPaperTable(c.lines, c.t, LS.picked)}
        <div class="ds-paper-invs"><small>Invoices on this run (${c.invs.length})</small><div>${c.invs.map((i) => `<span>${i.no} · ${esc(SHOP[i.shop].name)}</span>`).join('')}</div></div>
        ${signLines(['Prepared by (Store)', 'Checked by (Supervisor)', 'Driver', 'Security / Gate'])}
        <div class="paper-foot"><span>Printed by Sana Javed · ${nice(TODAY)}</span><span>Finsoft · ${esc(CO.short || CO.name)}</span></div>
      </div>`, foot: `<button class="btn secondary" data-close>Close</button><button class="btn secondary" data-toast="PDF saved to Downloads"><i data-lucide="file-down"></i>PDF</button><button class="btn primary" data-toast="Load sheet sent to printer"><i data-lucide="printer"></i>Print</button>` });
  }

  function qrSvg(text, size = 25) {
    const rnd = prng(hash(text));
    const cells = [];
    const finder = (x, y) => { for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) { const edge = i === 0 || i === 6 || j === 0 || j === 6, core = i >= 2 && i <= 4 && j >= 2 && j <= 4; if (edge || core) cells.push([x + i, y + j]); } };
    const inFinder = (x, y) => (x < 8 && y < 8) || (x >= size - 8 && y < 8) || (x < 8 && y >= size - 8);
    finder(0, 0); finder(size - 7, 0); finder(0, size - 7);
    for (let x = 0; x < size; x++) for (let y = 0; y < size; y++) if (!inFinder(x, y) && rnd() < 0.48) cells.push([x, y]);
    return `<svg class="ds-qr" viewBox="-2 -2 ${size + 4} ${size + 4}" shape-rendering="crispEdges"><rect x="-2" y="-2" width="${size + 4}" height="${size + 4}" fill="#fff"/>${cells.map(([x, y]) => `<rect x="${x}" y="${y}" width="1" height="1"/>`).join('')}</svg>`;
  }

  function lsGate() {
    const c = LS.cur, run = lsCurrentRun(), rt = routeOf(LS.route);
    if (!c || !c.lines.length) { toast('Nothing loaded yet, select invoices first', { tone: 'warn' }); return; }
    const gp = 'GP-2026-0' + run.no.slice(-3);
    FS.drawer({ title: 'Gate pass', subtitle: `${gp} · ${run.no}`, html: `
      <div class="paper ds-paper ds-gate">
        ${paperHead('GATE PASS', `${gp} · Outward`)}
        <div class="ds-gate-body">
          <div class="ds-gate-qr">${qrSvg(gp + run.no + LS.van)}<small>Scan at gate to verify</small></div>
          <div class="paper-meta ds-gate-meta">
            <div><small>Vehicle</small><b>${LS.van}</b></div><div><small>Model</small><b>${VANS[LS.van].model}</b></div>
            <div><small>Driver</small><b>${esc(LS.driver)}</b></div><div><small>Route</small><b>${rt.code} · ${esc(rt.name)}</b></div>
            <div><small>Cartons</small><b>${c.t.c} ctn + ${c.t.p} pcs</b></div><div><small>Weight</small><b>${fmt(c.t.kg)} kg</b></div>
            <div><small>Invoices</small><b>${c.invs.length}</b></div><div><small>Seal no</small><b>SL-${String(hash(run.no) % 90000 + 10000)}</b></div>
            <div><small>Out date · time</small><b>${nice(LS.date)} · ${LS.dep}</b></div><div><small>Value</small><b>${money(c.t.value, 0)}</b></div>
          </div>
        </div>
        <p class="small muted">Goods listed on load sheet LS-${run.no.slice(-4)} are allowed out of Lahore HQ Warehouse. Returnable crates: 0. This pass is valid for one exit only.</p>
        ${signLines(['Store keeper', 'Driver', 'Security guard'])}
      </div>`, foot: `<button class="btn secondary" data-close>Close</button><button class="btn primary" data-toast="Gate pass sent to printer"><i data-lucide="printer"></i>Print gate pass</button>` });
  }

  async function lsDispatch(sec, btn) {
    const c = LS.cur, run = lsCurrentRun();
    if (!c || !c.invs.length) { toast('Select invoices to load before dispatching', { tone: 'warn' }); return; }
    if (c.worst > 100) { flash($('[data-ds="ls-cap"]', sec), 'ds-shake'); toast(`${LS.van} is over capacity. Drop an invoice or pick a bigger van.`, { tone: 'danger' }); return; }
    const unpicked = c.lines.length - LS.picked.size;
    const ok = await FS.confirm({ title: `Dispatch ${LS.van}?`, icon: 'truck', okLabel: 'Dispatch',
      text: `${c.invs.length} invoices · ${c.t.c} ctn + ${c.t.p} pcs · ${fmt(c.t.kg)} kg for ${routeOf(LS.route).name}.${unpicked > 0 ? ` <b>${unpicked} line${unpicked > 1 ? 's are' : ' is'} not ticked as picked.</b>` : ''}` });
    if (!ok) return;
    const done = busy(btn, 'Dispatching…');
    await sleep(1100);
    run.status = 'Dispatched'; run.draft = false; run.dispatchedAt = LS.dep;
    Object.assign(run, { invoices: c.invs.slice() });
    done();
    lsLock(sec); lsRenderRuns(sec); lsKpis(sec);
    flash($('[data-ds="ls-cap"]', sec), 'ds-drive');
    celebrate(btn, 'Dispatched');
    toast(`${LS.van} dispatched on ${routeOf(LS.route).code} with ${c.invs.length} invoices`, { tone: 'good', action: { label: 'Settle later', fn: () => { ST.pending = run.no; FS.go('app/wholesale/settlement'); } } });
  }

  /* ================================================================ 2. ROUTE SETTLEMENT */
  const ST = { run: 'RUN-2026-0412', data: {}, pending: null };
  const DEN = [5000, 1000, 500, 100, 50, 20, 10];
  const BANKS = ['HBL', 'Meezan', 'UBL', 'MCB', 'Bank Alfalah', 'Allied Bank'];
  const REASONS = ['Damaged in transit', 'Expired / near expiry', 'Shop refused', 'Wrong item', 'Excess supplied'];
  const lineRetPcs = (row, li) => (row.state === 'none' ? row.inv.lines[li].pcs : (row.ret[li] ? row.ret[li].qty : 0));
  const rowRetVal = (row) => row.inv.lines.reduce((a, l, li) => a + lineRetPcs(row, li) * l.price, 0);
  const rowRetPcs = (row) => row.inv.lines.reduce((a, l, li) => a + lineRetPcs(row, li), 0);
  const rowNet = (row) => Math.max(0, row.inv.amt - rowRetVal(row));
  const rowDiff = (row) => rowNet(row) - row.cash - row.chq - row.credit;

  function stBuild(run) {
    const invs = run.invoices || [];
    const rows = invs.map((inv, i) => ({ inv, state: 'full', ret: {}, cash: 0, chq: 0, chqNo: '', bank: '', credit: 0 }));
    rows.forEach((row, i) => {
      if (i === 2 && row.inv.lines[0]) { row.state = 'partial'; row.ret[0] = { qty: Math.min(6, row.inv.lines[0].pcs), reason: REASONS[0] }; }
      if (i === 5) { row.state = 'none'; row.why = 'Shop closed'; }
      const net = rowNet(row);
      if (i === 5) return;
      if (i === 1) { row.chq = net; row.chqNo = '004127'; row.bank = 'HBL'; }
      else if (i === 6) { row.chq = net; row.chqNo = '771903'; row.bank = 'Meezan'; }
      else if (i === 3) row.credit = net;
      else if (i === 7) row.cash = r10(net - 1250);
      else if (i === 8) { row.cash = r10(net * 0.5); row.credit = net - row.cash; }
      else { row.cash = Math.floor(net / 10) * 10; row.credit += net - row.cash; }
    });
    const expected = rows.reduce((a, r) => a + r.cash, 0);
    // a realistic note mix, deliberately Rs 500 short so the count needs one tap
    let rem = expected - 500; const counts = {};
    const share = { 5000: 0.62, 1000: 0.6, 500: 0.55, 100: 0.7, 50: 0.6, 20: 0.5, 10: 1 };
    DEN.forEach((d) => { const n = d === 10 ? Math.floor(rem / 10) : Math.floor((rem * share[d]) / d); counts[d] = Math.max(0, n); rem -= counts[d] * d; });
    // stock counted in van
    const counted = {};
    const agg = stStock(rows);
    agg.forEach((s, i) => { counted[s.sku] = s.expected; });
    const firstRet = agg.find((s) => s.ret > 0 && s.retPartial);
    if (firstRet) counted[firstRet.sku] = Math.max(0, firstRet.expected - 1);
    return { rows, counts, counted, status: 'Open' };
  }
  function stStock(rows) {
    const map = {};
    rows.forEach((row) => row.inv.lines.forEach((l, li) => {
      const m = map[l.sku] || (map[l.sku] = { sku: l.sku, loaded: 0, ret: 0, retPartial: false, cost: ITEM[l.sku].cost, price: l.price });
      m.loaded += l.pcs; const rp = lineRetPcs(row, li); m.ret += rp; if (rp && row.state === 'partial') m.retPartial = true;
    }));
    return Object.values(map).map((m) => Object.assign(m, { delivered: m.loaded - m.ret, expected: m.ret, ctn: ITEM[m.sku].ctn || 1, name: ITEM[m.sku].name })).sort((a, b) => a.sku.localeCompare(b.sku));
  }
  const stCur = () => ST.data[ST.run];

  function renderSettlement(sec) {
    if (ST.pending && runOf(ST.pending) && runOf(ST.pending).invoices) { ST.run = ST.pending; }
    ST.pending = null;
    const run = runOf(ST.run);
    if (!ST.data[run.no]) ST.data[run.no] = stBuild(run);
    const S = ST.data[run.no], rt = routeOf(run.route);
    const runOpts = RUNS.filter((r) => r.invoices && (r.status === 'Dispatched' || ST.data[r.no]));
    sec.innerHTML = `
      <div class="page-head">
        <div><div class="eyebrow">Wholesale &amp; Distribution / Distribution</div><h1>Route Settlement</h1>
          <p>Close the van's day: what was delivered, what came back, what was collected, and whether the cash bag and the van tally.</p></div>
        <div class="head-actions">
          <label class="ds-runpick"><i data-lucide="truck"></i><select data-ds="st-run">${runOpts.map((r) => `<option value="${r.no}" ${r.no === run.no ? 'selected' : ''}>${r.no} · ${r.route} · ${r.van}</option>`).join('')}</select></label>
          <button class="btn primary" data-ds="st-post"><i data-lucide="book-check"></i>Post settlement</button></div>
      </div>
      <div class="ds-runstrip">
        <div class="ds-rs-main"><span class="ds-rs-ic"><i data-lucide="truck"></i></span><div><small>${run.no} · ${statusPill(S.status === 'Settled' ? 'Settled' : run.status)}</small><b>${rt.code} · ${esc(rt.name)}</b></div></div>
        <div><small>Van</small><b>${run.van}</b></div><div><small>Driver</small><b>${esc(run.driver)}</b></div><div><small>Salesman</small><b>${esc(rt.salesman)}</b></div>
        <div><small>Out → In</small><b>${run.dep} → 17:10</b></div><div><small>Shops</small><b>${new Set(S.rows.map((r) => r.inv.shop)).size}</b></div>
        <div><small>Load value</small><b>${money(S.rows.reduce((a, r) => a + r.inv.amt, 0))}</b></div>
      </div>
      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-top"><span>Collected</span><span class="icon-well"><i data-lucide="hand-coins"></i></span></div><strong data-k="coll">Rs 0</strong><small data-k="coll-sub">cash + cheque</small></div>
        <div class="kpi yellow"><div class="kpi-top"><span>Returns</span><span class="icon-well"><i data-lucide="undo-2"></i></span></div><strong data-k="ret">Rs 0</strong><small data-k="ret-sub">0 pcs back in van</small></div>
        <div class="kpi blue"><div class="kpi-top"><span>Credit on account</span><span class="icon-well"><i data-lucide="notebook-pen"></i></span></div><strong data-k="cred">Rs 0</strong><small data-k="cred-sub">0 shops</small></div>
        <div class="kpi red"><div class="kpi-top"><span>Unexplained</span><span class="icon-well"><i data-lucide="scale"></i></span></div><strong data-k="diff">Rs 0</strong><small data-k="diff-sub">all rows tally</small></div>
      </div>
      <div class="panel flush">
        <div class="panel-head"><div><h3>Shop settlement</h3><p>Tap the delivery chip to cycle Full / Partial / Not delivered. Click a difference to book it as credit.</p></div>
          <div class="panel-actions"><button class="btn ghost sm" data-ds="st-autocash"><i data-lucide="wand-sparkles"></i>Fill cash = net</button></div></div>
        <div class="table-wrap"><table class="tbl ds-tbl ds-stgrid" data-plain>
          <thead><tr><th>Shop · invoice</th><th class="num">Invoice</th><th>Delivered</th><th>Returns</th><th class="num">Cash</th><th class="num">Cheque</th><th class="num">Credit</th><th class="num">Difference</th></tr></thead>
          <tbody data-ds="st-rows"></tbody>
          <tfoot><tr><td>Total · <span data-ds="st-t-n">0</span> invoices</td><td class="num" data-ds="st-t-inv">0</td><td></td><td data-ds="st-t-ret">0</td><td class="num" data-ds="st-t-cash">0</td><td class="num" data-ds="st-t-chq">0</td><td class="num" data-ds="st-t-cred">0</td><td class="num" data-ds="st-t-diff">0</td></tr></tfoot>
        </table></div>
      </div>
      <div class="ds-st-bottom">
        <div class="panel ds-cash">
          <div class="panel-head"><div><h3>Cash count</h3><p>Count the salesman's bag by denomination.</p></div><span class="badge" data-ds="st-cashbadge">—</span></div>
          <div class="ds-dens" data-ds="st-dens"></div>
          <div class="ds-cashsum">
            <div><small>Expected cash</small><b data-ds="st-exp">Rs 0</b></div>
            <div><small>Counted</small><b data-ds="st-cnt">Rs 0</b></div>
            <div class="ds-cs-diff"><small data-ds="st-sxlbl">Short / excess</small><b data-ds="st-sx">Rs 0</b></div>
          </div>
          <div class="ds-diverge" data-ds="st-bar"><span class="l">Short</span><div class="ds-dv-track"><i class="mid"></i><b></b></div><span class="r">Excess</span></div>
        </div>
        <div class="panel flush ds-vanstock">
          <div class="panel-head"><div><h3>Van stock reconciliation</h3><p>Loaded vs delivered vs returned, against a physical count of what's still in the van.</p></div><span class="badge" data-ds="st-stockbadge">—</span></div>
          <div class="table-wrap"><table class="tbl ds-tbl" data-plain>
            <thead><tr><th>Product</th><th class="num">Loaded</th><th class="num">Delivered</th><th class="num">Returned</th><th class="num">Counted in van</th><th class="num">Variance</th></tr></thead>
            <tbody data-ds="st-stock"></tbody></table></div>
        </div>
      </div>`;
    stRenderRows(sec, true);
    stRenderDens(sec);
    stRecalc(sec, true);
    once(sec, 'Bound', stBind);
    stLock(sec);
  }

  function stRenderRows(sec, first) {
    const S = stCur();
    const tb = $('[data-ds="st-rows"]', sec);
    tb.innerHTML = S.rows.map((row, i) => stRowHtml(row, i, first)).join('');
    icons(tb);
  }
  function stRowHtml(row, i) {
    const s = SHOP[row.inv.shop], rp = rowRetPcs(row), rv = rowRetVal(row);
    const st = { full: ['good', 'circle-check', 'Full'], partial: ['warn', 'circle-dot-dashed', 'Partial'], none: ['danger', 'circle-x', 'Not delivered'] }[row.state];
    const dis = row.state === 'none' ? 'disabled' : '';
    return `<tr data-row="${i}" class="ds-st-${row.state}" style="--i:${i}">
      <td><div class="ds-shopcell"><span class="avatar sm ${avCls(s.name)}">${initials(s.name)}</span><div><b>${esc(s.name)}</b><small>${row.inv.no} · ${esc(s.area)}</small></div></div></td>
      <td class="num"><b>${fmt(row.inv.amt)}</b>${rv ? `<small>net ${fmt(rowNet(row))}</small>` : ''}</td>
      <td><button class="ds-deliv ${st[0]}" data-act="deliv" title="Cycle delivery status"><i data-lucide="${st[1]}"></i>${st[2]}</button>${row.why ? `<small>${esc(row.why)}</small>` : ''}</td>
      <td><button class="ds-retbtn ${rp ? 'has' : ''}" data-act="ret" ${row.state === 'none' ? 'disabled' : ''}><i data-lucide="undo-2"></i>${rp ? `${rp} pcs · ${fmt(rv)}` : 'None'}</button></td>
      <td class="num"><input class="cell-input ds-amt" inputmode="numeric" data-k="cash" value="${row.cash || ''}" placeholder="0" ${dis}></td>
      <td class="num"><div class="ds-chq"><input class="cell-input ds-amt" inputmode="numeric" data-k="chq" value="${row.chq || ''}" placeholder="0" ${dis}><button class="icon-btn-sm" data-act="chq" data-menu="off" title="Cheque details" ${dis}><i data-lucide="${row.chqNo ? 'file-check-2' : 'file-plus-2'}"></i></button></div>${row.chqNo ? `<small>#${esc(row.chqNo)} · ${esc(row.bank)}</small>` : ''}</td>
      <td class="num"><input class="cell-input ds-amt" inputmode="numeric" data-k="credit" value="${row.credit || ''}" placeholder="0" ${dis}><small class="ds-climit" data-climit></small></td>
      <td class="num"><button class="ds-diffchip" data-act="diff"></button></td></tr>`;
  }

  function stRenderDens(sec) {
    const S = stCur();
    $('[data-ds="st-dens"]', sec).innerHTML = DEN.map((d, i) => `
      <div class="ds-den" data-den="${d}" style="--i:${i}"><span class="ds-note n${d}">${fmt(d)}</span>
        <div class="ds-step"><button data-step="-1" aria-label="One less Rs ${d} note"><i data-lucide="minus"></i></button><input inputmode="numeric" value="${S.counts[d]}" aria-label="Rs ${d} notes"><button data-step="1" aria-label="One more Rs ${d} note"><i data-lucide="plus"></i></button></div>
        <b class="ds-den-sub" data-sub>${fmt(S.counts[d] * d)}</b></div>`).join('');
    icons($('[data-ds="st-dens"]', sec));
  }

  function stRecalc(sec, first) {
    const S = stCur(), rows = S.rows;
    // per-row cells
    rows.forEach((row, i) => {
      const tr = $(`tr[data-row="${i}"]`, sec); if (!tr) return;
      const d = rowDiff(row), chip = $('.ds-diffchip', tr);
      chip.className = 'ds-diffchip ' + (Math.abs(d) < 1 ? 'ok' : d > 0 ? 'short' : 'excess');
      chip.innerHTML = Math.abs(d) < 1 ? '<i data-lucide="check"></i>Tallied' : `${d > 0 ? 'Short' : 'Excess'} ${fmt(Math.abs(d))}`;
      chip.title = Math.abs(d) < 1 ? '' : d > 0 ? 'Book this as credit on account' : 'Reduce cash to match';
      const s = SHOP[row.inv.shop], cl = $('[data-climit]', tr);
      if (row.credit > 0) { const room = s.limit - s.balance; cl.textContent = row.credit > room ? `over limit by ${fmt(row.credit - room)}` : `limit ok · ${compact(room)} room`; cl.className = 'ds-climit ' + (row.credit > room ? 'bad' : ''); }
      else cl.textContent = '';
    });
    icons($('[data-ds="st-rows"]', sec));
    const sum = (f) => rows.reduce((a, r) => a + f(r), 0);
    const tInv = sum((r) => r.inv.amt), tCash = sum((r) => r.cash), tChq = sum((r) => r.chq), tCred = sum((r) => r.credit), tRet = sum(rowRetVal), tRetP = sum(rowRetPcs);
    const tDiff = sum((r) => Math.max(0, rowDiff(r))), tEx = sum((r) => Math.max(0, -rowDiff(r)));
    tickN($('[data-ds="st-t-n"]', sec), rows.length);
    tickN($('[data-ds="st-t-inv"]', sec), tInv); tickN($('[data-ds="st-t-cash"]', sec), tCash); tickN($('[data-ds="st-t-chq"]', sec), tChq); tickN($('[data-ds="st-t-cred"]', sec), tCred);
    $('[data-ds="st-t-ret"]', sec).textContent = tRetP ? `${tRetP} pcs · ${fmt(tRet)}` : '—';
    const td = $('[data-ds="st-t-diff"]', sec); tickN(td, tDiff - tEx); td.className = 'num ' + (Math.abs(tDiff - tEx) < 1 ? 'zero' : 'neg');
    tickRs($('[data-k="coll"]', sec), tCash + tChq);
    $('[data-k="coll-sub"]', sec).textContent = `${fmt(tCash)} cash · ${fmt(tChq)} cheque`;
    tickRs($('[data-k="ret"]', sec), tRet);
    $('[data-k="ret-sub"]', sec).textContent = `${tRetP} pcs back in van`;
    tickRs($('[data-k="cred"]', sec), tCred);
    $('[data-k="cred-sub"]', sec).textContent = `${rows.filter((r) => r.credit > 0).length} shops on account`;
    tickRs($('[data-k="diff"]', sec), tDiff + tEx);
    const ds = $('[data-k="diff-sub"]', sec), nd = rows.filter((r) => Math.abs(rowDiff(r)) >= 1).length;
    ds.textContent = nd ? `${nd} row${nd > 1 ? 's' : ''} to resolve` : 'all rows tally'; ds.className = nd ? 'down' : 'up';
    // cash count
    const counted = DEN.reduce((a, d) => a + (S.counts[d] || 0) * d, 0);
    const sx = counted - tCash;
    tickRs($('[data-ds="st-exp"]', sec), tCash); tickRs($('[data-ds="st-cnt"]', sec), counted);
    const sxEl = $('[data-ds="st-sx"]', sec); tickRs(sxEl, Math.abs(sx));
    $('[data-ds="st-sxlbl"]', sec).textContent = Math.abs(sx) < 1 ? 'Tallied' : sx < 0 ? 'Short' : 'Excess';
    $('.ds-cs-diff', sec).className = 'ds-cs-diff ' + (Math.abs(sx) < 1 ? 'ok' : sx < 0 ? 'short' : 'excess');
    const bar = $('[data-ds="st-bar"]', sec), mag = Math.min(50, (Math.abs(sx) / Math.max(1000, tCash * 0.01)) * 50);
    const b = $('.ds-dv-track>b', bar);
    b.style.left = sx < 0 ? 50 - mag + '%' : '50%'; b.style.width = (Math.abs(sx) < 1 ? 0 : Math.max(2, mag)) + '%';
    bar.className = 'ds-diverge ' + (Math.abs(sx) < 1 ? 'ok' : sx < 0 ? 'short' : 'excess');
    const cb = $('[data-ds="st-cashbadge"]', sec);
    const wasOk = cb.classList.contains('good');
    cb.className = 'badge dot ' + (Math.abs(sx) < 1 ? 'good' : sx < 0 ? 'danger' : 'warn');
    cb.textContent = Math.abs(sx) < 1 ? 'Cash tallied' : `${sx < 0 ? 'Short' : 'Excess'} Rs ${fmt(Math.abs(sx))}`;
    if (!first && !wasOk && Math.abs(sx) < 1 && S.status !== 'Settled') { flash($('.ds-cash', sec), 'ds-glow'); toast('Cash bag tallies with the sheet', { tone: 'good', ms: 2200 }); }
    // van stock
    const stock = stStock(rows);
    const stb = $('[data-ds="st-stock"]', sec);
    let nVar = 0, varVal = 0;
    stb.innerHTML = stock.map((s, i) => {
      if (S.counted[s.sku] == null) S.counted[s.sku] = s.expected;
      const c = S.counted[s.sku], v = c - s.expected; if (v) { nVar++; varVal += v * s.cost; }
      return `<tr data-sku="${s.sku}" class="${v ? 'ds-var' : ''}"><td><b>${esc(s.name)}</b><small>${s.sku} · ${s.ctn > 1 ? s.ctn + '/ctn' : 'single'}</small></td>
        <td class="num">${fmt(s.loaded)}<small>${ctnpcs(s.loaded, s.ctn)}</small></td><td class="num">${fmt(s.delivered)}</td><td class="num">${s.ret ? fmt(s.ret) : '<span class="zero">—</span>'}</td>
        <td class="num"><div class="ds-step sm"><button data-vstep="-1" aria-label="Less"><i data-lucide="minus"></i></button><input inputmode="numeric" value="${c}" aria-label="Counted ${s.sku}"><button data-vstep="1" aria-label="More"><i data-lucide="plus"></i></button></div></td>
        <td class="num"><span class="ds-varchip ${v < 0 ? 'neg' : v > 0 ? 'pos' : ''}">${v === 0 ? '<i data-lucide="check"></i>0' : (v > 0 ? '+' : '−') + Math.abs(v)}</span></td></tr>`;
    }).join('');
    icons(stb);
    const sb = $('[data-ds="st-stockbadge"]', sec);
    sb.className = 'badge dot ' + (nVar ? 'danger' : 'good'); sb.textContent = nVar ? `${nVar} variance · ${money(Math.abs(varVal))}` : 'Van tallies';
    ST.calc = { tInv, tCash, tChq, tCred, tRet, tRetP, tDiff, tEx, counted, sx, stock, varVal };
  }

  function stLock(sec) {
    const S = stCur(), locked = S.status === 'Settled';
    sec.classList.toggle('ds-settled', locked);
    $$('.ds-stgrid input, .ds-stgrid button, .ds-dens input, .ds-dens button, .ds-vanstock input, .ds-vanstock button, [data-ds="st-autocash"]', sec).forEach((el) => { if (locked) el.disabled = true; });
    const p = $('[data-ds="st-post"]', sec);
    if (locked) { p.disabled = true; p.innerHTML = '<i data-lucide="circle-check"></i>Settled'; icons(p); }
  }

  function stBind(sec) {
    sec.addEventListener('change', (e) => {
      if (e.target.matches('[data-ds="st-run"]')) { ST.run = e.target.value; renderSettlement(sec); FS.enhance(sec); icons(sec); FS.skeleton($('.ds-stgrid', sec).closest('.panel'), 450); }
    });
    sec.addEventListener('input', (e) => {
      const S = stCur(); if (!S) return;
      const inp = e.target;
      if (inp.matches('.ds-amt')) {
        const row = S.rows[+inp.closest('tr').dataset.row];
        row[inp.dataset.k] = Math.max(0, Math.round(+inp.value.replace(/[^\d.]/g, '') || 0));
        stRecalc(sec);
      } else if (inp.closest('.ds-den')) {
        const d = +inp.closest('.ds-den').dataset.den; S.counts[d] = Math.max(0, parseInt(inp.value, 10) || 0);
        $('[data-sub]', inp.closest('.ds-den')).textContent = fmt(S.counts[d] * d); stRecalc(sec);
      } else if (inp.closest('[data-ds="st-stock"]')) {
        const sku = inp.closest('tr').dataset.sku; S.counted[sku] = Math.max(0, parseInt(inp.value, 10) || 0);
        clearTimeout(ST._t); ST._t = setTimeout(() => stRecalc(sec), 500);
      }
    });
    sec.addEventListener('click', (e) => {
      const S = stCur(); if (!S || S.status === 'Settled') return;
      const step = e.target.closest('[data-step]');
      if (step) {
        const den = step.closest('.ds-den'), d = +den.dataset.den, inp = $('input', den);
        S.counts[d] = Math.max(0, (S.counts[d] || 0) + +step.dataset.step); inp.value = S.counts[d];
        const sub = $('[data-sub]', den); sub.textContent = fmt(S.counts[d] * d); flash(sub, 'ds-pop');
        stRecalc(sec); return;
      }
      const vs = e.target.closest('[data-vstep]');
      if (vs) { const sku = vs.closest('tr').dataset.sku; S.counted[sku] = Math.max(0, (S.counted[sku] || 0) + +vs.dataset.vstep); stRecalc(sec); const tr = $(`[data-ds="st-stock"] tr[data-sku="${sku}"]`, sec); flash(tr && $('.ds-varchip', tr), 'ds-pop'); return; }
      const a = e.target.closest('[data-act]');
      if (a) {
        const tr = a.closest('tr'), i = +tr.dataset.row, row = S.rows[i];
        if (a.dataset.act === 'deliv') {
          row.state = { full: 'partial', partial: 'none', none: 'full' }[row.state];
          if (row.state === 'none') { row.cash = 0; row.chq = 0; row.credit = 0; row.chqNo = ''; row.why = 'Shop closed'; }
          if (row.state === 'full') { row.ret = {}; row.why = ''; row.cash = rowNet(row); }
          if (row.state === 'partial') row.why = '';
          stReplaceRow(sec, i);
          if (row.state === 'partial' && !rowRetPcs(row)) stReturns(sec, i);
        } else if (a.dataset.act === 'ret') stReturns(sec, i);
        else if (a.dataset.act === 'chq') stCheque(sec, i);
        else if (a.dataset.act === 'diff') {
          const d = rowDiff(row); if (Math.abs(d) < 1) return;
          const before = { cash: row.cash, credit: row.credit };
          if (d > 0) row.credit += d; else row.cash = Math.max(0, row.cash + d);
          stReplaceRow(sec, i);
          toast(d > 0 ? `Rs ${fmt(d)} booked as credit for ${SHOP[row.inv.shop].name}` : `Cash reduced by Rs ${fmt(-d)}`, { tone: 'info', undo: () => { Object.assign(row, before); stReplaceRow(sec, i); } });
        }
        return;
      }
      const b = e.target.closest('[data-ds]');
      if (!b) return;
      if (b.dataset.ds === 'st-autocash') {
        S.rows.forEach((r, i) => { if (r.state !== 'none' && !r.chq && !r.credit) r.cash = rowNet(r); });
        stRenderRows(sec); stRecalc(sec); toast('Cash set to net amount on cash rows', { tone: 'info' });
      } else if (b.dataset.ds === 'st-post') stPostPreview(sec, b);
    });
  }
  function stReplaceRow(sec, i) {
    const S = stCur(), tr = $(`tr[data-row="${i}"]`, sec);
    const tmp = document.createElement('tbody'); tmp.innerHTML = stRowHtml(S.rows[i], i);
    const n = tmp.firstElementChild; tr.replaceWith(n); icons(n); flash(n, 'row-flash');
    stRecalc(sec);
  }

  function stReturns(sec, i) {
    const S = stCur(), row = S.rows[i], s = SHOP[row.inv.shop];
    const sh = FS.sheet({ title: 'Returns', subtitle: `${s.name} · ${row.inv.no}`, html: `
      <div class="ds-retlist">${row.inv.lines.map((l, li) => { const r = row.ret[li] || { qty: 0, reason: REASONS[0] }; const it = ITEM[l.sku]; return `
        <div class="ds-retline" data-li="${li}"><div class="ds-rl-name"><b>${esc(it.name)}</b><small>${l.sku} · supplied ${fmt(l.pcs)} ${it.loose || 'pcs'} (${ctnpcs(l.pcs, it.ctn)}) · Rs ${fmt(l.price)}/pc</small></div>
          <div class="ds-step sm"><button data-rstep="-1" aria-label="Less"><i data-lucide="minus"></i></button><input inputmode="numeric" value="${r.qty}" data-max="${l.pcs}" aria-label="Return qty"><button data-rstep="1" aria-label="More"><i data-lucide="plus"></i></button></div>
          <select class="cell-input">${REASONS.map((x) => `<option ${x === r.reason ? 'selected' : ''}>${x}</option>`).join('')}</select></div>`; }).join('')}</div>
      <div class="ds-retsum"><span>Return value</span><b data-rv>Rs 0</b></div>`,
      foot: `<button class="btn secondary" data-close>Cancel</button><button class="btn primary" data-ds-save><i data-lucide="check"></i>Save returns</button>` });
    const upd = () => { let v = 0; $$('.ds-retline', sh).forEach((el) => { const l = row.inv.lines[+el.dataset.li]; v += (parseInt($('input', el).value, 10) || 0) * l.price; }); tickRs($('[data-rv]', sh), v); };
    sh.addEventListener('click', (e) => {
      const st = e.target.closest('[data-rstep]');
      if (st) { const inp = $('input', st.parentNode); inp.value = Math.min(+inp.dataset.max, Math.max(0, (parseInt(inp.value, 10) || 0) + +st.dataset.rstep)); upd(); return; }
      if (e.target.closest('[data-ds-save]')) {
        row.ret = {};
        $$('.ds-retline', sh).forEach((el) => { const q = Math.min(+$('input', el).dataset.max, parseInt($('input', el).value, 10) || 0); if (q > 0) row.ret[+el.dataset.li] = { qty: q, reason: $('select', el).value }; });
        if (!rowRetPcs(row) && row.state === 'partial') row.state = 'full';
        else if (rowRetPcs(row) && row.state === 'full') row.state = 'partial';
        // keep the row tallied: cash absorbs the change on cash rows
        if (!row.chq) { row.cash = Math.max(0, rowNet(row) - row.credit); }
        FS.closeOverlay(sh.closest('.overlay'));
        stReplaceRow(sec, i);
        toast(rowRetPcs(row) ? `${rowRetPcs(row)} pcs returned from ${s.name}` : 'Returns cleared', { tone: 'info' });
      }
    });
    sh.addEventListener('input', upd);
    upd();
  }

  function stCheque(sec, i) {
    const S = stCur(), row = S.rows[i], s = SHOP[row.inv.shop];
    const sh = FS.sheet({ title: 'Cheque details', subtitle: `${s.name} · ${row.inv.no}`, html: `
      <div class="form-grid"><label><span>Cheque no</span><input data-c="no" value="${esc(row.chqNo)}" placeholder="e.g. 004127"></label>
        <label><span>Bank</span><select data-c="bank">${BANKS.map((b) => `<option ${b === row.bank ? 'selected' : ''}>${b}</option>`).join('')}</select></label>
        <label><span>Amount</span><input data-c="amt" inputmode="numeric" value="${row.chq || rowNet(row)}"></label>
        <label><span>Cheque date</span><input type="date" data-c="date" value="${TODAY}"></label></div>
      <p class="small muted" style="margin-top:12px">Post-dated cheques sit in Cheques in Hand until deposited.</p>`,
      foot: `<button class="btn secondary" data-close>Cancel</button><button class="btn primary" data-ds-save><i data-lucide="check"></i>Save cheque</button>` });
    sh.addEventListener('click', (e) => {
      if (!e.target.closest('[data-ds-save]')) return;
      const no = $('[data-c="no"]', sh).value.trim();
      if (!no) { $('[data-c="no"]', sh).focus(); flash($('[data-c="no"]', sh), 'ds-shake'); return; }
      row.chqNo = no; row.bank = $('[data-c="bank"]', sh).value; row.chq = Math.max(0, parseInt($('[data-c="amt"]', sh).value, 10) || 0);
      if (row.cash + row.chq > rowNet(row)) row.cash = Math.max(0, rowNet(row) - row.chq - row.credit);
      FS.closeOverlay(sh.closest('.overlay')); stReplaceRow(sec, i);
      toast(`Cheque #${no} (${row.bank}) recorded`, { tone: 'good' });
    });
  }

  function stJournal() {
    const c = ST.calc, run = runOf(ST.run), rt = routeOf(run.route);
    const retCost = stCur().rows.reduce((a, r) => a + r.inv.lines.reduce((b, l, li) => b + lineRetPcs(r, li) * ITEM[l.sku].cost, 0), 0);
    const short = Math.max(0, c.tCash - c.counted), over = Math.max(0, c.counted - c.tCash);
    const J = [];
    const add = (grp, acc, name, dr, cr) => { if (dr > 0.5 || cr > 0.5) J.push({ grp, acc, name, dr: Math.round(dr), cr: Math.round(cr) }); };
    add('Receipts', '1110-01', 'Cash in Hand — Lahore HQ', c.counted, 0);
    add('Receipts', '1130-02', 'Cheques in Hand', c.tChq, 0);
    add('Receipts', '1140-01', `Trade Debtors — ${rt.code} shops`, 0, c.tCash + c.tChq);
    add('Returns', '4100-03', 'Sales Returns & Allowances', c.tRet, 0);
    add('Returns', '1140-01', `Trade Debtors — ${rt.code} shops`, 0, c.tRet);
    add('Returns', '1310-01', 'Stock in Hand — Lahore HQ Warehouse', retCost, 0);
    add('Returns', '5100-01', 'Cost of Goods Sold', 0, retCost);
    add('Cash short', '1150-07', `Salesman Receivable — ${rt.salesman}`, short, 0);
    add('Cash short', '4900-02', 'Cash Over / Short', 0, over);
    if (c.varVal < 0) { add('Stock variance', '1150-07', `Salesman Receivable — ${rt.salesman}`, -c.varVal, 0); add('Stock variance', '1310-01', 'Stock in Hand — Van', 0, -c.varVal); }
    if (c.varVal > 0) { add('Stock variance', '1310-01', 'Stock in Hand — Van', c.varVal, 0); add('Stock variance', '4900-03', 'Stock Gain', 0, c.varVal); }
    // balance cash short/over rounding: Dr = Cr by construction
    return { J, short, over, retCost };
  }

  function stPostPreview(sec, btn) {
    const c = ST.calc, run = runOf(ST.run), { J, short, over } = stJournal();
    const dr = J.reduce((a, l) => a + l.dr, 0), cr = J.reduce((a, l) => a + l.cr, 0);
    const credRows = stCur().rows.filter((r) => r.credit > 0);
    const groups = ['Receipts', 'Returns', 'Cash short', 'Stock variance'];
    const html = `
      ${c.tDiff + c.tEx >= 1 ? `<div class="banner warn ds-banner"><i data-lucide="triangle-alert"></i><div><b>Rs ${fmt(c.tDiff + c.tEx)} unexplained on the grid</b><small>Short rows stay in debtors as unallocated balance. Resolve them first if you can.</small></div></div>` : ''}
      <div class="ds-jsum"><div><small>Receipts</small><b>${money(c.tCash + c.tChq)}</b></div><div><small>Returns</small><b>${money(c.tRet)}</b></div><div><small>Credit sales</small><b>${money(c.tCred)}</b></div><div><small>Cash ${short ? 'short' : over ? 'over' : 'difference'}</small><b class="${short ? 'neg' : ''}">${money(short || over)}</b></div></div>
      <div class="table-wrap"><table class="tbl ds-tbl ds-jtbl" data-plain><thead><tr><th>Account</th><th class="num">Debit</th><th class="num">Credit</th></tr></thead><tbody>
      ${groups.map((g) => { const ls = J.filter((l) => l.grp === g); if (!ls.length) return ''; return `<tr class="group"><td colspan="3">${g}</td></tr>` + ls.map((l) => `<tr><td><b>${esc(l.name)}</b><small>${l.acc}</small></td><td class="num ${l.dr ? 'dr' : 'zero'}">${l.dr ? fmt(l.dr) : '—'}</td><td class="num ${l.cr ? 'cr' : 'zero'}">${l.cr ? fmt(l.cr) : '—'}</td></tr>`).join(''); }).join('')}
      <tr class="group"><td colspan="3">Credit sales (memo, no posting)</td></tr>
      ${credRows.length ? credRows.map((r) => `<tr><td><b>${esc(SHOP[r.inv.shop].name)}</b><small>${r.inv.no} · stays in debtors, ageing from ${niceShort(TODAY)}</small></td><td class="num zero">—</td><td class="num zero">${fmt(r.credit)}</td></tr>`).join('') : '<tr><td colspan="3" class="zero">No credit given on this run</td></tr>'}
      </tbody><tfoot><tr><td>Total</td><td class="num">${fmt(dr)}</td><td class="num">${fmt(cr)}</td></tr></tfoot></table></div>
      <div class="ds-balanced ${Math.abs(dr - cr) < 1 ? 'ok' : ''}"><i data-lucide="${Math.abs(dr - cr) < 1 ? 'scale' : 'triangle-alert'}"></i>${Math.abs(dr - cr) < 1 ? 'Balanced · JV-2026-000' + (300 + (hash(run.no) % 90)) + ' will be posted' : 'Not balanced'}</div>
      <div class="ds-steps" hidden></div>`;
    const dw = FS.drawer({ wide: true, title: 'Post settlement', subtitle: `${run.no} · journal preview`, html, foot: `<button class="btn secondary" data-close>Cancel</button><button class="btn primary" data-ds-confirm><i data-lucide="book-check"></i>Post settlement</button>` });
    dw.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-ds-confirm]'); if (!b) return;
      const ok = await FS.confirm({ title: `Post ${run.no}?`, text: `Receipts, returns and adjustments will be posted to the ledger and the run will be marked Settled. This can't be edited afterwards.`, okLabel: 'Post now', icon: 'book-check' });
      if (!ok) return;
      const done = busy(b, 'Posting…');
      const steps = $('.ds-steps', dw); steps.hidden = false;
      const base = 900 + (hash(run.no) % 50);
      const list = [
        [`Receipts RCPT-2026-000${base}…${base + stCur().rows.filter((r) => r.cash + r.chq > 0).length - 1}`, 'hand-coins'],
        [`Sales returns SRN-2026-00${410 + (hash(run.no) % 30)}`, 'undo-2'],
        ['Returned stock back to Lahore HQ Warehouse', 'warehouse'],
        [`Journal JV-2026-000${300 + (hash(run.no) % 90)}`, 'book-check'],
        [`${run.no} closed`, 'flag'],
      ];
      steps.innerHTML = list.map((s, i) => `<div class="ds-stepline" data-i="${i}"><span class="ds-sdot"><i data-lucide="${s[1]}"></i></span><b>${s[0]}</b><em>Queued</em></div>`).join('');
      icons(steps); steps.scrollIntoView({ behavior: RM() ? 'auto' : 'smooth', block: 'nearest' });
      for (let i = 0; i < list.length; i++) {
        const ln = $(`[data-i="${i}"]`, steps); ln.classList.add('run'); $('em', ln).textContent = 'Posting…';
        await sleep(420);
        ln.classList.remove('run'); ln.classList.add('done'); $('em', ln).textContent = 'Done';
      }
      done('<i data-lucide="circle-check"></i>Posted');
      b.disabled = true;
      stCur().status = 'Settled'; run.status = 'Settled';
      celebrate(b, 'Settled');
      setTimeout(() => {
        FS.closeOverlay(dw.closest('.overlay'));
        renderSettlement(sec); FS.enhance(sec); icons(sec);
        celebrate($('.ds-runstrip', sec));
        toast(`${run.no} settled and posted`, { tone: 'good', action: { label: 'View journal', fn: () => FS.go('app/accounting/vouchers/view') } });
      }, RM() ? 100 : 900);
    });
  }

  /* ================================================================ 3. RECOVERY SHEET */
  const RC = { salesman: 'Imran Siddiqui', route: 'RT-01', date: TODAY, filter: 'all', q: '', state: {}, rcpt: 871 };
  // ageing buckets, last payment and a target per shop (deterministic)
  SHOPS.forEach((s, i) => {
    const out = s.balance, od = s.overdueDays;
    const b3 = i % 4 === 0 ? Math.round(out * 0.22) : 0;
    const b2 = od > 60 ? Math.round(out * 0.28) : (i % 5 === 1 ? Math.round(out * 0.12) : 0);
    const b1 = od > 30 ? Math.round(out * 0.3) : 0;
    s.age = [out - b1 - b2 - b3, b1, b2, b3];
    s.last = { date: addDays(TODAY, -(3 + ((i * 7) % 38))), amt: r10(Math.max(2500, out * (0.1 + ((i * 3) % 7) / 40))) };
    s.target = r10(out * 0.42);
  });
  // two receipts already posted earlier today
  RC.state['SHP-004'] = { amt: 18000, mode: 'JazzCash', rem: 'Paid via JazzCash 09:12', ptp: '', posted: 'RCPT-2026-000869' };
  RC.state['SHP-010'] = { amt: 25000, mode: 'Cash', rem: '', ptp: '', posted: 'RCPT-2026-000870' };
  const rcState = (code) => RC.state[code] || (RC.state[code] = { amt: 0, mode: 'Cash', rem: '', ptp: '', posted: null });
  function rcAlloc(s, amt) { // FIFO: oldest bucket first
    let left = amt; for (let k = 3; k >= 0 && left > 0; k--) { const t = Math.min(s.age[k], left); s.age[k] -= t; left -= t; }
    s.balance = Math.max(0, s.balance - amt);
  }
  // apply the two pre-posted receipts
  Object.keys(RC.state).forEach((c) => { if (SHOP[c]) rcAlloc(SHOP[c], RC.state[c].amt); });

  function rcShops() {
    return SHOPS.filter((s) => (RC.route === 'all' || s.route === RC.route)
      && (RC.salesman === 'all' || routeOf(s.route).salesman === RC.salesman)
      && (!RC.q || (s.name + ' ' + s.area + ' ' + s.code).toLowerCase().includes(RC.q))
      && (RC.filter === 'all' || (RC.filter === '60' && s.age[2] + s.age[3] > 0) || (RC.filter === '90' && s.age[3] > 0) || (RC.filter === 'open' && !rcState(s.code).posted && !(rcState(s.code).amt > 0))));
  }

  function renderRecovery(sec) {
    sec.innerHTML = `
      <div class="page-head">
        <div><div class="eyebrow">Wholesale &amp; Distribution / Distribution</div><h1>Recovery Sheet</h1>
          <p>The salesman's collection round: who owes what and for how long, what came in today, and who promised to pay when.</p></div>
        <div class="head-actions"><span class="tagline">Every rupee home</span>
          <button class="btn secondary" data-ds="rc-print"><i data-lucide="printer"></i>Print sheet</button>
          <button class="btn primary" data-ds="rc-post"><i data-lucide="send-to-back"></i>Post receipts in bulk <span class="ds-count" data-ds="rc-postn">0</span></button></div>
      </div>
      <div class="panel ds-rc-filters">
        <label><span>Salesman</span><select data-rf="salesman"><option value="all">All salesmen</option>${SALESMEN.map((s) => `<option ${s === RC.salesman ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
        <label><span>Route</span><select data-rf="route"><option value="all">All routes</option>${ROUTES.map((r) => `<option value="${r.code}" ${r.code === RC.route ? 'selected' : ''}>${r.code} · ${esc(r.name)}</option>`).join('')}</select></label>
        <label><span>Date</span><input type="date" data-rf="date" value="${RC.date}"></label>
        <label class="ds-rc-search"><span>Search</span><div class="ds-search"><i data-lucide="search"></i><input data-rf="q" placeholder="Shop, area or code" value="${esc(RC.q)}"></div></label>
        <div class="chips" data-ds="rc-chips"><button class="${RC.filter === 'all' ? 'active' : ''}" data-f="all">All</button><button class="${RC.filter === '60' ? 'active' : ''}" data-f="60">61+ days</button><button class="${RC.filter === '90' ? 'active' : ''}" data-f="90">90+ days</button><button class="${RC.filter === 'open' ? 'active' : ''}" data-f="open">Not collected</button></div>
      </div>
      <div class="ds-rc-top">
        <div class="panel ds-ring-card">
          <div class="ds-ring"><svg viewBox="0 0 120 120"><circle class="trk" cx="60" cy="60" r="50"/><circle class="a1" cx="60" cy="60" r="50" pathLength="100"/><circle class="a2" cx="60" cy="60" r="50" pathLength="100"/></svg>
            <div class="ds-ring-c"><b data-ds="rc-pct">0%</b><small>of target</small></div></div>
          <div class="ds-ring-leg">
            <div><i class="t"></i><span>Target</span><b data-ds="rc-target">Rs 0</b></div>
            <div><i class="a1"></i><span>Posted today</span><b data-ds="rc-posted">Rs 0</b></div>
            <div><i class="a2"></i><span>Entered, not posted</span><b data-ds="rc-pend">Rs 0</b></div>
            <div><i class="r"></i><span>Still to collect</span><b data-ds="rc-left">Rs 0</b></div>
          </div>
        </div>
        <div class="kpi-grid c2 ds-rc-kpis">
          <div class="kpi"><div class="kpi-top"><span>Outstanding</span><span class="icon-well"><i data-lucide="wallet"></i></span></div><strong data-k="out">Rs 0</strong><small data-k="out-sub">0 shops</small></div>
          <div class="kpi red"><div class="kpi-top"><span>90+ days</span><span class="icon-well"><i data-lucide="alarm-clock"></i></span></div><strong data-k="b90">Rs 0</strong><small data-k="b90-sub">0 shops</small></div>
          <div class="kpi teal"><div class="kpi-top"><span>Shops collected</span><span class="icon-well"><i data-lucide="store"></i></span></div><strong data-k="hit">0</strong><small data-k="hit-sub">of 0 on the sheet</small></div>
          <div class="kpi yellow"><div class="kpi-top"><span>Promises to pay</span><span class="icon-well"><i data-lucide="calendar-clock"></i></span></div><strong data-k="ptp">0</strong><small data-k="ptp-sub">Rs 0 promised</small></div>
        </div>
      </div>
      <div class="panel flush">
        <div class="panel-head"><div><h3>Collection sheet</h3><p data-ds="rc-sub">—</p></div>
          <div class="panel-actions ds-agelegend"><span class="b0">0–30</span><span class="b1">31–60</span><span class="b2">61–90</span><span class="b3">90+</span></div></div>
        <div class="table-wrap"><table class="tbl ds-tbl ds-rctbl" data-plain>
          <thead><tr><th>Shop</th><th>Contact</th><th class="num">Outstanding</th><th>Ageing</th><th>Last payment</th><th class="num">Collected</th><th>Mode</th><th>Remarks</th><th>Promise to pay</th><th>Status</th></tr></thead>
          <tbody data-ds="rc-rows"></tbody>
          <tfoot><tr><td>Total · <span data-ds="rc-t-n">0</span> shops</td><td></td><td class="num" data-ds="rc-t-out">0</td><td data-ds="rc-t-age"></td><td></td><td class="num" data-ds="rc-t-coll">0</td><td colspan="4"></td></tr></tfoot>
        </table></div>
      </div>`;
    rcRender(sec, true);
    once(sec, 'Bound', rcBind);
  }

  const ageChips = (s) => `<div class="ds-age">${s.age.map((v, k) => `<span class="b${k} ${v ? '' : 'nil'}" title="${['0–30', '31–60', '61–90', '90+'][k]} days">${v ? compact(v) : '—'}</span>`).join('')}</div>`;

  function rcRowHtml(s, i) {
    const st = rcState(s.code), posted = !!st.posted, dis = posted ? 'disabled' : '';
    const over = st.amt > s.balance && !posted;
    return `<tr data-shop="${s.code}" class="${posted ? 'ds-posted' : ''}" style="--i:${i}">
      <td><div class="ds-shopcell"><span class="avatar sm ${avCls(s.name)}">${initials(s.name)}</span><div><b>${esc(s.name)}</b><small>${s.code} · ${esc(s.area)} · ${routeOf(s.route).code}</small></div></div></td>
      <td><div class="ds-contact"><span>${esc(s.phone)}</span><a class="icon-btn-sm ds-call" href="tel:${s.phone.replace(/-/g, '')}" title="Call ${esc(s.name)}" aria-label="Call"><i data-lucide="phone"></i></a><button class="icon-btn-sm ds-wa" data-act="wa" data-menu="off" title="WhatsApp reminder" aria-label="WhatsApp reminder"><i data-lucide="message-circle"></i></button>${st.reminded ? '<span class="ds-dotsent" title="Reminder sent"></span>' : ''}</div></td>
      <td class="num"><b data-out>${fmt(s.balance)}</b><small>limit ${compact(s.limit)}</small></td>
      <td>${ageChips(s)}</td>
      <td>${nice(s.last.date)}<small>${money(s.last.amt)}</small></td>
      <td class="num"><input class="cell-input ds-amt ${over ? 'bad' : ''}" inputmode="numeric" data-k="amt" value="${st.amt || ''}" placeholder="0" ${dis} aria-label="Collected from ${esc(s.name)}"></td>
      <td><select class="cell-input ds-mode" data-k="mode" ${dis}>${['Cash', 'Cheque', 'Online', 'JazzCash'].map((m) => `<option ${m === st.mode ? 'selected' : ''}>${m}</option>`).join('')}</select></td>
      <td><input class="cell-input ds-rem" data-k="rem" value="${esc(st.rem)}" placeholder="${st.mode === 'Cheque' ? 'Chq no / bank' : st.mode === 'Online' || st.mode === 'JazzCash' ? 'Txn ID' : 'Note'}" ${dis}></td>
      <td><input class="cell-input ds-ptp" type="date" data-k="ptp" value="${st.ptp}" ${dis} aria-label="Promise to pay"></td>
      <td data-status>${posted ? `<span class="badge good"><i data-lucide="circle-check"></i>${st.posted}</span>` : st.amt > 0 ? '<span class="badge info dot">Ready</span>' : st.ptp ? '<span class="badge warn dot">Promised</span>' : '<span class="badge neutral">Pending</span>'}</td></tr>`;
  }

  function rcRender(sec, first) {
    const rows = rcShops();
    const tb = $('[data-ds="rc-rows"]', sec);
    tb.innerHTML = rows.length ? rows.map(rcRowHtml).join('') : `<tr><td colspan="10"><div class="ds-empty"><i data-lucide="search-x"></i><b>No shops match</b><small>Try another salesman, route or filter.</small></div></td></tr>`;
    icons(tb);
    const rt = RC.route === 'all' ? 'All routes' : routeOf(RC.route).code + ' · ' + routeOf(RC.route).name;
    $('[data-ds="rc-sub"]', sec).textContent = `${RC.salesman === 'all' ? 'All salesmen' : RC.salesman} · ${rt} · ${nice(RC.date)} (${dayOf(RC.date)})`;
    rcTotals(sec);
  }

  function rcTotals(sec) {
    const rows = rcShops();
    const sum = (f) => rows.reduce((a, s) => a + f(s), 0);
    const out = sum((s) => s.balance), b90 = sum((s) => s.age[3]);
    const posted = sum((s) => (rcState(s.code).posted ? rcState(s.code).amt : 0));
    const pend = sum((s) => (!rcState(s.code).posted ? rcState(s.code).amt || 0 : 0));
    const target = Math.max(1, sum((s) => s.target));
    tickN($('[data-ds="rc-t-n"]', sec), rows.length);
    tickN($('[data-ds="rc-t-out"]', sec), out);
    tickN($('[data-ds="rc-t-coll"]', sec), posted + pend);
    const ageT = [0, 1, 2, 3].map((k) => sum((s) => s.age[k]));
    $('[data-ds="rc-t-age"]', sec).innerHTML = `<div class="ds-age">${ageT.map((v, k) => `<span class="b${k} ${v ? '' : 'nil'}">${v ? compact(v) : '—'}</span>`).join('')}</div>`;
    tickRs($('[data-k="out"]', sec), out); $('[data-k="out-sub"]', sec).textContent = `${rows.length} shops on the sheet`;
    tickRs($('[data-k="b90"]', sec), b90); $('[data-k="b90-sub"]', sec).textContent = `${rows.filter((s) => s.age[3] > 0).length} shops need a visit`;
    const hit = rows.filter((s) => rcState(s.code).amt > 0).length;
    tickN($('[data-k="hit"]', sec), hit); $('[data-k="hit-sub"]', sec).textContent = `of ${rows.length} on the sheet`;
    const ptp = rows.filter((s) => rcState(s.code).ptp);
    tickN($('[data-k="ptp"]', sec), ptp.length); $('[data-k="ptp-sub"]', sec).textContent = ptp.length ? `next ${nice(ptp.map((s) => rcState(s.code).ptp).sort()[0])}` : 'none recorded';
    // ring
    const p1 = Math.min(100, (posted / target) * 100), p2 = Math.min(100 - p1, (pend / target) * 100);
    const ring = $('.ds-ring', sec);
    $('.a1', ring).style.strokeDasharray = `${p1} 100`;
    $('.a2', ring).style.strokeDasharray = `${p2} 100`; $('.a2', ring).style.strokeDashoffset = `${-p1}`;
    tickN($('[data-ds="rc-pct"]', sec), Math.round(((posted + pend) / target) * 100), '%');
    ring.classList.toggle('hit', posted + pend >= target);
    tickRs($('[data-ds="rc-target"]', sec), target); tickRs($('[data-ds="rc-posted"]', sec), posted); tickRs($('[data-ds="rc-pend"]', sec), pend); tickRs($('[data-ds="rc-left"]', sec), Math.max(0, target - posted - pend));
    const n = rows.filter((s) => !rcState(s.code).posted && rcState(s.code).amt > 0).length;
    const pn = $('[data-ds="rc-postn"]', sec); if (pn) { pn.textContent = n; pn.classList.toggle('on', n > 0); }
  }

  function rcStatusCell(tr, s) {
    const st = rcState(s.code), cell = $('[data-status]', tr);
    cell.innerHTML = st.posted ? `<span class="badge good"><i data-lucide="circle-check"></i>${st.posted}</span>` : st.amt > 0 ? '<span class="badge info dot">Ready</span>' : st.ptp ? '<span class="badge warn dot">Promised</span>' : '<span class="badge neutral">Pending</span>';
    icons(cell);
  }

  function rcBind(sec) {
    sec.addEventListener('input', (e) => {
      const t = e.target;
      if (t.dataset.rf === 'q') { RC.q = t.value.trim().toLowerCase(); rcRender(sec); return; }
      const tr = t.closest('tr[data-shop]'); if (!tr) return;
      const s = SHOP[tr.dataset.shop], st = rcState(s.code);
      if (t.dataset.k === 'amt') { st.amt = Math.max(0, parseInt(t.value.replace(/[^\d]/g, ''), 10) || 0); t.classList.toggle('bad', st.amt > s.balance); t.title = st.amt > s.balance ? 'More than the outstanding balance' : ''; rcStatusCell(tr, s); rcTotals(sec); }
      else if (t.dataset.k === 'rem') st.rem = t.value;
    });
    sec.addEventListener('change', (e) => {
      const t = e.target;
      if (t.dataset.rf === 'salesman') {
        RC.salesman = t.value;
        if (t.value !== 'all') { const r = ROUTES.find((x) => x.salesman === t.value); RC.route = r ? r.code : 'all'; $('[data-rf="route"]', sec).value = RC.route; }
        FS.skeleton($('.ds-rctbl', sec).closest('.panel'), 380); rcRender(sec); return;
      }
      if (t.dataset.rf === 'route') { RC.route = t.value; if (t.value !== 'all') { RC.salesman = routeOf(t.value).salesman; $('[data-rf="salesman"]', sec).value = RC.salesman; } FS.skeleton($('.ds-rctbl', sec).closest('.panel'), 380); rcRender(sec); return; }
      if (t.dataset.rf === 'date') { RC.date = t.value || TODAY; rcRender(sec); return; }
      const tr = t.closest('tr[data-shop]'); if (!tr) return;
      const s = SHOP[tr.dataset.shop], st = rcState(s.code);
      if (t.dataset.k === 'mode') { st.mode = t.value; const rem = $('.ds-rem', tr); rem.placeholder = t.value === 'Cheque' ? 'Chq no / bank' : t.value === 'Cash' ? 'Note' : 'Txn ID'; }
      if (t.dataset.k === 'ptp') { st.ptp = t.value; rcStatusCell(tr, s); rcTotals(sec); if (t.value) toast(`${s.name} promised to pay on ${nice(t.value)}`, { tone: 'info', ms: 2400 }); }
    });
    sec.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-ds="rc-chips"] button');
      if (chip) { RC.filter = chip.dataset.f; rcRender(sec); return; }
      const wa = e.target.closest('[data-act="wa"]');
      if (wa) { rcWhatsApp(sec, SHOP[wa.closest('tr').dataset.shop]); return; }
      const b = e.target.closest('[data-ds]'); if (!b) return;
      if (b.dataset.ds === 'rc-post') rcPost(sec, b);
      if (b.dataset.ds === 'rc-print') rcPrint();
    });
  }

  async function rcPost(sec, btn) {
    const rows = rcShops().filter((s) => !rcState(s.code).posted && rcState(s.code).amt > 0);
    if (!rows.length) { toast('Enter a collected amount against at least one shop', { tone: 'warn' }); flash($('.ds-rctbl .ds-amt:not(:disabled)', sec), 'ds-shake'); return; }
    const bad = rows.filter((s) => rcState(s.code).amt > s.balance);
    if (bad.length) { toast(`${bad[0].name}: collected is more than outstanding`, { tone: 'danger' }); const tr = $(`tr[data-shop="${bad[0].code}"]`, sec); flash(tr && $('.ds-amt', tr), 'ds-shake'); return; }
    const total = rows.reduce((a, s) => a + rcState(s.code).amt, 0);
    const ok = await FS.confirm({ title: `Post ${rows.length} receipt${rows.length > 1 ? 's' : ''}?`, text: `Rs ${fmt(total)} will be posted against ${rows.length} shop${rows.length > 1 ? 's' : ''} and allocated to the oldest invoices first.`, okLabel: 'Post receipts', icon: 'hand-coins' });
    if (!ok) return;
    const done = busy(btn, `Posting 0/${rows.length}…`);
    for (let i = 0; i < rows.length; i++) {
      const s = rows[i], st = rcState(s.code), tr = $(`tr[data-shop="${s.code}"]`, sec);
      btn.innerHTML = `<span class="ds-spin"></span>Posting ${i + 1}/${rows.length}…`;
      if (tr) { $('[data-status]', tr).innerHTML = '<span class="badge info"><span class="ds-spin sm"></span>Posting</span>'; tr.scrollIntoView({ block: 'nearest', behavior: RM() ? 'auto' : 'smooth' }); }
      await sleep(380);
      RC.rcpt += 1; st.posted = 'RCPT-2026-000' + RC.rcpt;
      rcAlloc(s, st.amt);
      s.last = { date: RC.date, amt: st.amt };
      if (tr) {
        const tmp = document.createElement('tbody'); tmp.innerHTML = rcRowHtml(s, i);
        const n = tmp.firstElementChild; tr.replaceWith(n); icons(n); flash(n, 'row-flash');
      }
      rcTotals(sec);
    }
    done(); rcTotals(sec);
    celebrate(btn, 'Receipts posted');
    toast(`${rows.length} receipts posted · Rs ${fmt(total)}`, { tone: 'good', action: { label: 'View receipts', fn: () => FS.go('app/receivables/receipts') } });
  }

  function rcPrint() {
    const rows = rcShops(), rt = RC.route === 'all' ? null : routeOf(RC.route);
    const tot = rows.reduce((a, s) => a + s.balance, 0);
    FS.drawer({ wide: true, title: 'Recovery sheet', subtitle: 'Print for the salesman', html: `
      <div class="paper ds-paper ds-rcpaper">${paperHead('RECOVERY SHEET', `${nice(RC.date)} · ${dayOf(RC.date)}`)}
        <div class="paper-meta"><div><small>Salesman</small><b>${esc(RC.salesman === 'all' ? 'All salesmen' : RC.salesman)}</b></div><div><small>Route</small><b>${rt ? rt.code + ' · ' + esc(rt.name) : 'All routes'}</b></div>
          <div><small>Shops</small><b>${rows.length}</b></div><div><small>Outstanding</small><b>${money(tot)}</b></div></div>
        <table class="tbl"><thead><tr><th>#</th><th>Shop</th><th>Phone</th><th class="num">Outstanding</th><th class="num">0–30</th><th class="num">31–60</th><th class="num">61–90</th><th class="num">90+</th><th>Collected</th><th>Mode</th><th>PTP date</th><th>Shop sign</th></tr></thead><tbody>
        ${rows.map((s, i) => `<tr><td>${i + 1}</td><td><b>${esc(s.name)}</b><small>${esc(s.area)}</small></td><td>${esc(s.phone)}</td><td class="num">${fmt(s.balance)}</td>${s.age.map((v) => `<td class="num">${v ? fmt(v) : '—'}</td>`).join('')}<td class="ds-blank"></td><td class="ds-blank sm"></td><td class="ds-blank sm"></td><td class="ds-blank"></td></tr>`).join('')}
        <tr class="total"><td></td><td colspan="2">Total</td><td class="num">${fmt(tot)}</td>${[0, 1, 2, 3].map((k) => `<td class="num">${fmt(rows.reduce((a, s) => a + s.age[k], 0))}</td>`).join('')}<td class="ds-blank"></td><td colspan="3"></td></tr></tbody></table>
        ${signLines(['Salesman', 'Cashier (cash received)', 'Accounts'])}
        <div class="paper-foot"><span>Cash Rs ________ · Cheques ____ · Online ____</span><span>Printed ${nice(TODAY)} · Finsoft</span></div>
      </div>`, foot: `<button class="btn secondary" data-close>Close</button><button class="btn primary" data-toast="Recovery sheet sent to printer"><i data-lucide="printer"></i>Print</button>` });
  }

  function rcWhatsApp(sec, s) {
    const st = rcState(s.code);
    const oldest = s.age[3] ? '90+' : s.age[2] ? '61–90' : s.age[1] ? '31–60' : '0–30';
    const msgs = {
      en: `Assalam-o-Alaikum ${s.name},\n\nThis is a gentle reminder from ${CO.short || CO.name}. Your outstanding balance is *Rs ${fmt(s.balance)}*${s.age[3] ? `, of which Rs ${fmt(s.age[3])} is over 90 days old` : ''}.\n\nOur salesman ${routeOf(s.route).salesman} will visit on ${routeOf(s.route).days.join('/')}. You can also pay via JazzCash or bank transfer to Meezan 0123.\n\nJazakAllah,\nAccounts · ${CO.phone || ''}`,
      ur: `السلام علیکم ${s.name}،\n\n${CO.short || CO.name} کی طرف سے یاد دہانی۔ آپ کے ذمہ واجب الادا رقم *${fmt(s.balance)} روپے* ہے${s.age[3] ? `، جس میں سے ${fmt(s.age[3])} روپے 90 دن سے زائد پرانے ہیں` : ''}۔\n\nہمارے سیلزمین ${routeOf(s.route).salesman} اگلے دورے پر تشریف لائیں گے۔ آپ جاز کیش یا میزان بینک 0123 میں بھی ادائیگی کر سکتے ہیں۔\n\nجزاک اللہ\nشعبہ اکاؤنٹس`,
    };
    let lang = 'en';
    const sh = FS.sheet({ title: 'WhatsApp reminder', subtitle: `${s.name} · ${s.phone}`, html: `
      <div class="ds-wa-top"><div class="seg" data-ds="wa-lang"><button class="active" data-l="en">English</button><button data-l="ur">اردو</button></div>
        <span class="pill"><i data-lucide="clock"></i>Oldest bucket <b>${oldest}</b></span></div>
      <div class="ds-wa-phone"><div class="ds-wa-bar"><span class="avatar sm ${avCls(s.name)}">${initials(s.name)}</span><div><b>${esc(s.name)}</b><small>${esc(s.phone)}</small></div></div>
        <div class="ds-wa-chat"><div class="ds-wa-bubble" data-ds="wa-msg"></div></div></div>
      <label class="ds-wa-edit"><span class="small muted">Edit before sending</span><textarea class="cell-input" rows="4" data-ds="wa-text"></textarea></label>`,
      foot: `<button class="btn secondary" data-ds-copy><i data-lucide="copy"></i>Copy</button><button class="btn primary" data-ds-send><i data-lucide="send"></i>Send on WhatsApp</button>` });
    const fmtMsg = (t) => esc(t).replace(/\*([^*]+)\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
    const paint = () => {
      const t = $('[data-ds="wa-text"]', sh).value, m = $('[data-ds="wa-msg"]', sh);
      m.innerHTML = fmtMsg(t) + `<small>${new Date().getHours()}:${String(new Date().getMinutes()).padStart(2, '0')} <i data-lucide="check-check"></i></small>`;
      m.dir = lang === 'ur' ? 'rtl' : 'ltr'; m.classList.toggle('ur', lang === 'ur'); icons(m);
    };
    const setLang = (l) => { lang = l; const ta = $('[data-ds="wa-text"]', sh); ta.value = msgs[l]; ta.dir = l === 'ur' ? 'rtl' : 'ltr'; paint(); flash($('[data-ds="wa-msg"]', sh), 'ds-pop'); };
    setLang('en');
    sh.addEventListener('input', paint);
    sh.addEventListener('click', async (e) => {
      const lb = e.target.closest('[data-ds="wa-lang"] button');
      if (lb) { $$('[data-ds="wa-lang"] button', sh).forEach((x) => x.classList.toggle('active', x === lb)); setLang(lb.dataset.l); return; }
      if (e.target.closest('[data-ds-copy]')) { try { await navigator.clipboard.writeText($('[data-ds="wa-text"]', sh).value); } catch (er) { /* clipboard may be blocked */ } toast('Message copied', { tone: 'info', ms: 1800 }); return; }
      const sb = e.target.closest('[data-ds-send]');
      if (sb) {
        const done = busy(sb, 'Sending…'); await sleep(900); done('<i data-lucide="check"></i>Sent');
        st.reminded = true;
        FS.closeOverlay(sh.closest('.overlay'));
        const tr = $(`tr[data-shop="${s.code}"]`, sec);
        if (tr) { const tmp = document.createElement('tbody'); tmp.innerHTML = rcRowHtml(s, 0); const n = tmp.firstElementChild; tr.replaceWith(n); icons(n); flash(n, 'row-flash'); }
        toast(`Reminder sent to ${s.name} (${lang === 'ur' ? 'Urdu' : 'English'})`, { tone: 'good' });
      }
    });
  }

  /* ================================================================ 4. ROUTES & SALESMEN */
  const RS = { sel: 'RT-01' };
  const SALES6 = { 'RT-01': [3.6, 3.9, 3.7, 4.2, 4.5, 4.9], 'RT-02': [3.1, 2.9, 3.3, 3.0, 3.4, 3.6], 'RT-03': [4.2, 4.6, 4.4, 4.9, 5.3, 5.1] };
  const PEOPLE = [
    { name: 'Imran Siddiqui', target: 4200000, ach: 4510000, calls: 212, prod: 171 },
    { name: 'Bilal Khan', target: 3800000, ach: 3420000, calls: 248, prod: 186 },
    { name: 'Nadeem Akhtar', target: 3000000, ach: 3390000, calls: 205, prod: 169 },
    { name: 'Tanveer Hassan', target: 3600000, ach: 2740000, calls: 190, prod: 128 },
  ];
  const SLABS = [{ from: 0, to: 80, rate: 0.5, label: 'Below 80%' }, { from: 80, to: 100, rate: 1.0, label: '80–100%' }, { from: 100, to: 120, rate: 1.5, label: '100–120%' }, { from: 120, to: Infinity, rate: 2.0, label: '120%+' }];
  const slabOf = (pct) => SLABS.find((s) => pct >= s.from && pct < s.to) || SLABS[0];
  const ROUTE_TONES = ['var(--primary)', 'var(--blue)', 'var(--orange)', 'var(--violet)', 'var(--info)', 'var(--danger)'];
  const toneOf = (code) => ROUTE_TONES[Math.max(0, ROUTES.findIndex((r) => r.code === code)) % ROUTE_TONES.length];
  const shopsOn = (code) => SHOPS.filter((s) => s.route === code);

  function spark(vals) {
    if (!vals || !vals.length) return '<svg class="ds-spark" viewBox="0 0 120 36"></svg>';
    const mx = Math.max(...vals), mn = Math.min(...vals), rg = mx - mn || 1;
    const pts = vals.map((v, i) => [4 + (i * 112) / (vals.length - 1), 30 - ((v - mn) / rg) * 24]);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    return `<svg class="ds-spark" viewBox="0 0 120 36" preserveAspectRatio="none"><path class="ar" d="${d} L116 36 L4 36 Z"/><path class="ln" d="${d}" pathLength="1"/><circle cx="${pts[pts.length - 1][0]}" cy="${pts[pts.length - 1][1]}" r="2.6"/></svg>`;
  }

  function renderRoutes(sec) {
    sec.innerHTML = `
      <div class="page-head">
        <div><div class="eyebrow">Wholesale &amp; Distribution / Distribution</div><h1>Routes &amp; Salesmen</h1>
          <p>Beats, visit days and who works them. Drag shops between routes, and see how each booker and salesman is tracking against target.</p></div>
        <div class="head-actions"><span class="tagline">Right shop, right day</span>
          <a class="btn secondary" href="#/app/wholesale/load-sheet"><i data-lucide="clipboard-list"></i>Load sheets</a>
          <button class="btn primary" data-ds="rt-new"><i data-lucide="plus"></i>New route</button></div>
      </div>
      <div class="ds-rcards" data-ds="rt-cards"></div>
      <div class="panel ds-mappanel">
        <div class="panel-head"><div><h3 data-ds="rt-maptitle">Route map</h3><p data-ds="rt-mapsub">Stops in visit order from Lahore HQ Warehouse.</p></div>
          <div class="seg" data-ds="rt-mapseg"></div></div>
        <div class="ds-mapwrap"><div class="ds-map" data-ds="rt-map"></div><ol class="ds-stops" data-ds="rt-stops"></ol></div>
      </div>
      <div class="panel">
        <div class="panel-head"><div><h3>Shop assignment</h3><p>Drag a shop card onto another route, or use its menu. Counts, the map and load sheets follow along.</p></div>
          <span class="pill"><i data-lucide="hand"></i>Drag &amp; drop</span></div>
        <div class="ds-board" data-ds="rt-board"></div>
      </div>
      <div class="ds-people-head"><h3>Bookers &amp; salesmen</h3><span class="muted small">September 2026 · month to date</span></div>
      <div class="ds-people" data-ds="rt-people"></div>
      <div class="ds-pp-bottom">
        <div class="panel"><div class="panel-head"><div><h3>Leaderboard</h3><p>Ranked by achievement against target.</p></div><span class="icon-well yellow"><i data-lucide="trophy"></i></span></div><div class="ds-leader" data-ds="rt-leader"></div></div>
        <div class="panel flush"><div class="panel-head"><div><h3>Commission slabs</h3><p>Paid on achieved sales, by target achievement band.</p></div></div>
          <div class="table-wrap"><table class="tbl ds-tbl" data-plain><thead><tr><th>Achievement</th><th class="num">Rate</th><th>Who's here</th><th class="num">Commission</th></tr></thead><tbody data-ds="rt-slabs"></tbody></table></div></div>
      </div>`;
    rtCards(sec, true); rtMap(sec); rtBoard(sec); rtPeople(sec);
    once(sec, 'Bound', rtBind);
  }

  function rtCards(sec) {
    const host = $('[data-ds="rt-cards"]', sec);
    host.innerHTML = ROUTES.map((r, i) => {
      const n = shopsOn(r.code).length, sales = SALES6[r.code] || [];
      const last = sales.length ? sales[sales.length - 1] : 0, prev = sales.length > 1 ? sales[sales.length - 2] : 0, ch = prev ? ((last - prev) / prev) * 100 : 0;
      return `<article class="ds-rcard ${r.code === RS.sel ? 'sel' : ''}" data-route="${r.code}" style="--i:${i};--rt:${toneOf(r.code)}" tabindex="0" role="button" aria-pressed="${r.code === RS.sel}">
        <div class="ds-rc-head"><span class="ds-rt">${r.code}</span><b>${esc(r.name)}</b><button class="icon-btn-sm" data-act="rmenu" data-menu="off" aria-label="Route menu"><i data-lucide="ellipsis"></i></button></div>
        <div class="ds-daychips" role="group" aria-label="Visit days">${WEEK.map((w) => `<button class="${r.days.includes(w) ? 'on' : ''}" data-day="${w}" aria-pressed="${r.days.includes(w)}">${w}</button>`).join('')}</div>
        <div class="ds-rc-people">
          <div><small>Booker</small><b>${esc(r.booker)}</b></div><div><small>Salesman</small><b>${esc(r.salesman)}</b></div>
          <div><small>Van</small><b>${esc(r.van)}</b></div><div><small>Driver</small><b>${esc(r.driver)}</b></div>
        </div>
        <div class="ds-rc-foot">
          <div><small>Shops</small><b data-ds="rc-n">${n}</b></div>
          <div class="ds-rc-sales"><small>Monthly sales</small><b>${last ? 'Rs ' + last.toFixed(1) + 'M' : '—'}${sales.length ? ` <em class="${ch >= 0 ? 'up' : 'down'}">${ch >= 0 ? '▲' : '▼'} ${Math.abs(ch).toFixed(1)}%</em>` : ''}</b></div>
          ${spark(sales)}
        </div></article>`;
    }).join('');
    icons(host);
  }

  function rtMap(sec) {
    const r = routeOf(RS.sel), shops = shopsOn(r.code);
    $('[data-ds="rt-maptitle"]', sec).textContent = `Route map · ${r.code} ${r.name}`;
    $('[data-ds="rt-mapsub"]', sec).textContent = shops.length ? `${shops.length} stops in visit order from Lahore HQ Warehouse · ${r.days.join(' & ') || 'no visit days'} · van ${r.van}` : 'No shops on this route yet';
    $('[data-ds="rt-mapseg"]', sec).innerHTML = ROUTES.map((x) => `<button class="${x.code === RS.sel ? 'active' : ''}" data-sel="${x.code}">${x.code}</button>`).join('');
    const W = 800, H = 380, n = shops.length;
    const rnd = prng(hash(r.code));
    const pts = shops.map((s, i) => {
      const t = n > 1 ? i / (n - 1) : 0.5;
      const x = 150 + t * 590 + (rnd() - 0.5) * 30;
      const y = 190 + Math.sin(t * Math.PI * 2.1 + hash(r.code) % 7) * 110 + (rnd() - 0.5) * 34;
      return [Math.round(x), Math.round(Math.max(40, Math.min(H - 40, y)))];
    });
    const wh = [64, 318];
    const all = [wh].concat(pts);
    let d = `M${wh[0]} ${wh[1]}`;
    for (let i = 0; i < all.length - 1; i++) { // catmull-rom → bezier
      const p0 = all[Math.max(0, i - 1)], p1 = all[i], p2 = all[i + 1], p3 = all[Math.min(all.length - 1, i + 2)];
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0]} ${p2[1]}`;
    }
    const blocks = []; const br = prng(99);
    for (let gx = 0; gx < 9; gx++) for (let gy = 0; gy < 5; gy++) if (br() > 0.28) blocks.push(`<rect x="${gx * 92 + 10 + br() * 10}" y="${gy * 78 + 8 + br() * 8}" width="${54 + br() * 22}" height="${40 + br() * 18}" rx="7"/>`);
    const labels = [['ANARKALI', 520, 60], ['GULBERG', 640, 150], ['MODEL TOWN', 560, 330], ['JOHAR TOWN', 250, 70], ['IQBAL TOWN', 300, 250], ['DHA', 730, 300], ['KOT LAKHPAT', 110, 360]];
    $('[data-ds="rt-map"]', sec).innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" class="ds-mapsvg" style="--rt:${toneOf(r.code)}" role="img" aria-label="Map of ${esc(r.name)}">
        <g class="blocks">${blocks.join('')}</g>
        <path class="canal" d="M-10 120 C 180 160, 320 60, 470 130 S 700 210, 820 150"/>
        <g class="roads"><path d="M0 230 H800"/><path d="M400 0 V380"/><path d="M0 40 L800 340"/><path d="M180 0 C 210 140, 160 260, 230 380"/></g>
        <g class="mlabels">${labels.map((l) => `<text x="${l[1]}" y="${l[2]}">${l[0]}</text>`).join('')}</g>
        ${n ? `<path class="route-glow" d="${d}"/><path class="route" id="ds-map-path" d="${d}" pathLength="1"/>` : ''}
        ${n && !RM() ? `<g class="truck"><circle r="9"/><path d="M-4 -2 h5 v4 h-5z M1 -1 h2.5 l1.5 2 v1 h-4z" /><animateMotion dur="${Math.max(9, n * 1.4)}s" repeatCount="indefinite" rotate="0"><mpath href="#ds-map-path"/></animateMotion></g>` : ''}
        <g class="wh" transform="translate(${wh[0]} ${wh[1]})"><rect x="-17" y="-17" width="34" height="34" rx="10"/><path d="M-8 6 V-3 L0 -8 L8 -3 V6 Z M-3 6 V1 H3 V6" /><text y="34" text-anchor="middle">Warehouse</text></g>
        ${pts.map((p, i) => `<g class="pin" data-shop="${shops[i].code}" transform="translate(${p[0]} ${p[1]})" style="--i:${i}" tabindex="0"><circle class="halo" r="17"/><circle class="dot" r="12"/><text text-anchor="middle" dy="4">${i + 1}</text></g>`).join('')}
        ${n ? '' : `<text class="empty" x="${W / 2}" y="${H / 2}" text-anchor="middle">Drag shops onto ${r.code} below to plot its beat</text>`}
      </svg>`;
    $('[data-ds="rt-stops"]', sec).innerHTML = shops.map((s, i) => `<li data-shop="${s.code}" style="--i:${i}"><span>${i + 1}</span><div><b>${esc(s.name)}</b><small>${esc(s.area)} · ${s.tier} · ${compact(s.balance)} due</small></div><em>${String(9 + Math.floor((i * 35) / 60)).padStart(2, '0')}:${String((i * 35) % 60).padStart(2, '0')}</em></li>`).join('') || '<li class="nil">No stops</li>';
  }

  function rtBoard(sec, moved) {
    const host = $('[data-ds="rt-board"]', sec);
    host.style.setProperty('--cols', ROUTES.length);
    host.innerHTML = ROUTES.map((r) => {
      const shops = shopsOn(r.code), due = shops.reduce((a, s) => a + s.balance, 0);
      return `<div class="ds-col" data-col="${r.code}" style="--rt:${toneOf(r.code)}">
        <div class="ds-col-head"><span class="ds-rt">${r.code}</span><b>${esc(r.name)}</b><span class="ds-col-n" data-n>${shops.length}</span></div>
        <div class="ds-col-sub">${r.days.join(' · ') || 'No days'} · ${compact(due)} due</div>
        <ul class="ds-col-list" data-drop="${r.code}">
          ${shops.map((s, i) => `<li class="ds-shopcard ${moved === s.code ? 'ds-landed' : ''}" draggable="true" data-shop="${s.code}" style="--i:${i}"><i data-lucide="grip-vertical" class="grip"></i><div><b>${esc(s.name)}</b><small>${esc(s.area)} · ${s.tier}</small></div><span class="ds-sc-due">${compact(s.balance)}</span><button class="icon-btn-sm" data-act="move" data-menu="off" aria-label="Move ${esc(s.name)}"><i data-lucide="arrow-right-left"></i></button></li>`).join('')}
          <li class="ds-dropzone">Drop here</li>
        </ul></div>`;
    }).join('');
    icons(host);
  }

  function rtPeople(sec) {
    const ppl = PEOPLE.map((p) => {
      const pct = (p.ach / p.target) * 100, slab = slabOf(pct);
      const roles = []; ROUTES.forEach((r) => { if (r.booker === p.name) roles.push(['Booker', r.code]); if (r.salesman === p.name) roles.push(['Salesman', r.code]); });
      return Object.assign({}, p, { pct, slab, comm: Math.round((p.ach * slab.rate) / 100), strike: (p.prod / p.calls) * 100, roles });
    });
    $('[data-ds="rt-people"]', sec).innerHTML = ppl.map((p, i) => `
      <article class="ds-person" style="--i:${i}">
        <div class="ds-pp-top"><span class="avatar lg ${avCls(p.name)}">${initials(p.name)}</span><div><b>${esc(p.name)}</b><div class="ds-roles">${p.roles.map((r) => `<span class="badge ${r[0] === 'Booker' ? 'info' : 'violet'}">${r[0]} · ${r[1]}</span>`).join('') || '<span class="badge neutral">Unassigned</span>'}</div></div></div>
        <div class="ds-target"><div class="ds-tg-top"><span>Target achievement</span><b class="${p.pct >= 100 ? 'up' : ''}">${p.pct.toFixed(0)}%</b></div>
          <div class="ds-tg-track"><i style="--w:${Math.min(100, (p.pct / 130) * 100)}%"></i><em style="left:${(100 / 130) * 100}%"></em></div>
          <small>${money(p.ach)} of ${money(p.target)}</small></div>
        <div class="ds-pp-stats">
          <div><small>Strike rate</small><b>${p.strike.toFixed(0)}%</b></div>
          <div><small>Productive calls</small><b>${p.prod}<span class="muted">/${p.calls}</span></b></div>
          <div><small>Commission</small><b>${money(p.comm)}</b><em>${p.slab.rate.toFixed(1)}% slab</em></div>
        </div></article>`).join('');
    const ranked = ppl.slice().sort((a, b) => b.pct - a.pct);
    const medal = ['trophy', 'medal', 'award', 'circle'];
    $('[data-ds="rt-leader"]', sec).innerHTML = ranked.map((p, i) => `
      <div class="ds-lb r${i + 1}" style="--i:${i}"><span class="ds-lb-rank">${i < 3 ? `<i data-lucide="${medal[i]}"></i>` : i + 1}</span><span class="avatar sm ${avCls(p.name)}">${initials(p.name)}</span>
        <div class="ds-lb-main"><b>${esc(p.name)}</b><div class="ds-lb-bar"><i style="--w:${Math.min(100, (p.pct / 130) * 100)}%"></i></div></div><b class="ds-lb-pct">${p.pct.toFixed(1)}%</b></div>`).join('');
    $('[data-ds="rt-slabs"]', sec).innerHTML = SLABS.map((s) => { const who = ppl.filter((p) => p.slab === s); return `<tr class="${who.length ? '' : 'ds-dim'}"><td><b>${s.label}</b></td><td class="num">${s.rate.toFixed(1)}%</td><td>${who.map((p) => `<span class="avatar sm ${avCls(p.name)}" title="${esc(p.name)}">${initials(p.name)}</span>`).join('') || '<span class="zero">—</span>'}</td><td class="num">${who.length ? money(who.reduce((a, p) => a + p.comm, 0)) : '<span class="zero">—</span>'}</td></tr>`; }).join('');
    icons($('[data-ds="rt-leader"]', sec));
  }

  function rtMove(sec, code, to, silent) {
    const s = SHOP[code]; if (!s || s.route === to) return;
    const from = s.route; s.route = to;
    rtBoard(sec, code);
    // card counts tick
    $$('.ds-rcard', sec).forEach((c) => { const el = $('[data-ds="rc-n"]', c); tickN(el, shopsOn(c.dataset.route).length); if (c.dataset.route === from || c.dataset.route === to) flash(c, 'ds-glow'); });
    if (RS.sel === from || RS.sel === to) rtMap(sec);
    // load sheet invoices follow on next route switch
    if (LS.route === from || LS.route === to) LS.stale = true;
    if (!silent) toast(`${s.name} moved ${from} → ${to}`, { tone: 'good', undo: () => rtMove(sec, code, from, true) });
  }

  function rtBind(sec) {
    let dragCode = null;
    sec.addEventListener('dragstart', (e) => {
      const li = e.target.closest && e.target.closest('.ds-shopcard'); if (!li) return;
      dragCode = li.dataset.shop; li.classList.add('dragging');
      try { e.dataTransfer.setData('text/plain', dragCode); e.dataTransfer.effectAllowed = 'move'; } catch (er) { /* ok */ }
      $('[data-ds="rt-board"]', sec).classList.add('dragging');
    });
    sec.addEventListener('dragend', () => { $$('.ds-shopcard.dragging', sec).forEach((x) => x.classList.remove('dragging')); $$('.ds-col.over', sec).forEach((x) => x.classList.remove('over')); const b = $('[data-ds="rt-board"]', sec); if (b) b.classList.remove('dragging'); });
    sec.addEventListener('dragover', (e) => { const col = e.target.closest && e.target.closest('.ds-col'); if (!col) return; e.preventDefault(); try { e.dataTransfer.dropEffect = 'move'; } catch (er) { /* ok */ } $$('.ds-col.over', sec).forEach((x) => x !== col && x.classList.remove('over')); col.classList.add('over'); });
    sec.addEventListener('dragleave', (e) => { const col = e.target.closest && e.target.closest('.ds-col'); if (col && !col.contains(e.relatedTarget)) col.classList.remove('over'); });
    sec.addEventListener('drop', (e) => {
      const col = e.target.closest && e.target.closest('.ds-col'); if (!col) return;
      e.preventDefault(); col.classList.remove('over');
      let code = dragCode; try { code = e.dataTransfer.getData('text/plain') || dragCode; } catch (er) { /* ok */ }
      if (code) rtMove(sec, code, col.dataset.col);
      dragCode = null;
    });
    sec.addEventListener('click', (e) => {
      const day = e.target.closest('[data-day]');
      if (day) {
        const card = day.closest('.ds-rcard'), r = routeOf(card.dataset.route), w = day.dataset.day;
        if (r.days.includes(w)) { if (r.days.length === 1) { toast('A route needs at least one visit day', { tone: 'warn' }); flash(day, 'ds-shake'); return; } r.days = r.days.filter((x) => x !== w); }
        else r.days = WEEK.filter((x) => r.days.includes(x) || x === w);
        day.classList.toggle('on'); day.setAttribute('aria-pressed', r.days.includes(w)); flash(day, 'ds-pop');
        toast(`${r.code} now visits ${r.days.join(', ')}`, { tone: 'info', ms: 2200 });
        rtBoard(sec); if (RS.sel === r.code) rtMap(sec);
        return;
      }
      const mv = e.target.closest('[data-act="move"]');
      if (mv) {
        const code = mv.closest('.ds-shopcard').dataset.shop;
        FS.menu(mv, ROUTES.filter((r) => r.code !== SHOP[code].route).map((r) => ({ label: `Move to ${r.code} · ${r.name}`, icon: 'arrow-right', onClick: () => rtMove(sec, code, r.code) })));
        return;
      }
      const rm = e.target.closest('[data-act="rmenu"]');
      if (rm) {
        const code = rm.closest('.ds-rcard').dataset.route;
        FS.menu(rm, [
          { label: 'Build load sheet', icon: 'clipboard-list', onClick: () => { lsSetRoute(code); FS.go('app/wholesale/load-sheet'); } },
          { label: 'Open recovery sheet', icon: 'hand-coins', onClick: () => { RC.route = code; RC.salesman = routeOf(code).salesman; FS.go('app/wholesale/recovery'); } },
          { sep: true },
          { label: 'Optimise stop order', icon: 'route', onClick: () => toast(`Stops on ${code} re-ordered by distance · saves ~6 km`, { tone: 'good' }) },
        ]);
        return;
      }
      const seg = e.target.closest('[data-ds="rt-mapseg"] button');
      if (seg) { rtSelect(sec, seg.dataset.sel); return; }
      const card = e.target.closest('.ds-rcard');
      if (card) { rtSelect(sec, card.dataset.route); return; }
      const stop = e.target.closest('[data-ds="rt-stops"] li[data-shop]');
      if (stop) { const pin = $(`.pin[data-shop="${stop.dataset.shop}"]`, sec); flash(pin, 'ds-ping'); return; }
      if (e.target.closest('[data-ds="rt-new"]')) rtNewRoute(sec);
    });
    sec.addEventListener('keydown', (e) => { const card = e.target.closest && e.target.closest('.ds-rcard'); if (card && e.target === card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); rtSelect(sec, card.dataset.route); } });
    // map tooltips
    const showTip = (pin) => {
      const s = SHOP[pin.dataset.shop], r = pin.getBoundingClientRect();
      FS.tip(`<small><i></i>${esc(s.area)} · ${s.tier}</small><b>${esc(s.name)}</b><small>${money(s.balance)} due · ${s.overdueDays}d</small>`, r.left + r.width / 2, r.top);
      $$('[data-ds="rt-stops"] li', sec).forEach((li) => li.classList.toggle('hot', li.dataset.shop === pin.dataset.shop));
    };
    sec.addEventListener('mouseover', (e) => { const pin = e.target.closest && e.target.closest('.pin'); if (pin) showTip(pin); });
    sec.addEventListener('mouseout', (e) => { const pin = e.target.closest && e.target.closest('.pin'); if (pin && !pin.contains(e.relatedTarget)) { FS.untip(); $$('[data-ds="rt-stops"] li.hot', sec).forEach((li) => li.classList.remove('hot')); } });
    sec.addEventListener('focusin', (e) => { const pin = e.target.closest && e.target.closest('.pin'); if (pin) showTip(pin); });
    sec.addEventListener('focusout', (e) => { if (e.target.closest && e.target.closest('.pin')) FS.untip(); });
  }

  function rtSelect(sec, code) {
    RS.sel = code;
    $$('.ds-rcard', sec).forEach((c) => { const on = c.dataset.route === code; c.classList.toggle('sel', on); c.setAttribute('aria-pressed', on); });
    rtMap(sec);
  }

  function rtNewRoute(sec) {
    const code = 'RT-' + String(ROUTES.length + 1).padStart(2, '0');
    const sh = FS.sheet({ title: 'New route', subtitle: `${code} · define the beat`, html: `
      <div class="form-grid">
        <label><span>Route code</span><input value="${code}" readonly></label>
        <label><span>Route name *</span><input data-n="name" placeholder="e.g. Lahore East (Shalimar/Mughalpura)"></label>
        <label><span>Booker</span><select data-n="booker">${BOOKERS.map((b) => `<option>${esc(b)}</option>`).join('')}</select></label>
        <label><span>Salesman</span><select data-n="salesman">${SALESMEN.map((b) => `<option>${esc(b)}</option>`).join('')}</select></label>
        <label><span>Van</span><select data-n="van">${Object.keys(VANS).map((v) => `<option ${v === 'LEC-1907' ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label><span>Driver</span><select data-n="driver">${DRIVERS.map((b) => `<option>${esc(b)}</option>`).join('')}</select></label>
      </div>
      <div class="ds-nr-days"><span class="small muted">Visit days</span><div class="ds-daychips">${WEEK.map((w) => `<button class="${w === 'Mon' || w === 'Thu' ? 'on' : ''}" data-nday="${w}">${w}</button>`).join('')}</div></div>`,
      foot: `<button class="btn secondary" data-close>Cancel</button><button class="btn primary" data-ds-save><i data-lucide="plus"></i>Create route</button>` });
    sh.addEventListener('click', (e) => {
      const d = e.target.closest('[data-nday]'); if (d) { d.classList.toggle('on'); return; }
      if (!e.target.closest('[data-ds-save]')) return;
      const name = $('[data-n="name"]', sh).value.trim();
      const days = $$('[data-nday].on', sh).map((x) => x.dataset.nday);
      if (!name) { const i = $('[data-n="name"]', sh); i.focus(); flash(i, 'ds-shake'); toast('Give the route a name', { tone: 'warn' }); return; }
      if (!days.length) { toast('Pick at least one visit day', { tone: 'warn' }); return; }
      ROUTES.push({ code, name, days, booker: $('[data-n="booker"]', sh).value, salesman: $('[data-n="salesman"]', sh).value, van: $('[data-n="van"]', sh).value, driver: $('[data-n="driver"]', sh).value });
      FS.closeOverlay(sh.closest('.overlay'));
      RS.sel = code;
      rtCards(sec); rtMap(sec); rtBoard(sec); rtPeople(sec);
      const card = $(`.ds-rcard[data-route="${code}"]`, sec);
      if (card) { card.scrollIntoView({ behavior: RM() ? 'auto' : 'smooth', block: 'nearest' }); flash(card, 'ds-glow'); celebrate(card); }
      toast(`${code} · ${name} created. Drag shops onto it below.`, { tone: 'good' });
    });
  }

  /* ================================================================ mount */
  const mount = (fn) => (sec, route, first) => {
    if (first || sec.dataset.dsDirty) { delete sec.dataset.dsDirty; fn(sec); FS.enhance(sec); icons(sec); }
  };
  FS.onEnter('app/wholesale/load-sheet', (sec, route, first) => {
    if (first) { lsSetRoute(LS.route, true); return mount(renderLoadSheet)(sec, route, true); }
    // refresh pieces that other screens can change
    if (LS.stale) { LS.stale = false; if (lsCurrentRun().status === 'Loading') { const keep = new Set(LS.sel); LS.invoices = invoicesFor(LS.route); LS.sel = new Set(LS.invoices.filter((i) => keep.has(i.no)).map((i) => i.no)); } }
    const rSel = $('[data-f="route"]', sec);
    if (rSel) { lsFillSelects(sec); lsRenderAll(sec); }
  });
  FS.onEnter('app/wholesale/settlement', (sec, route, first) => {
    renderSettlement(sec); FS.enhance(sec); icons(sec);
  });
  FS.onEnter('app/wholesale/recovery', (sec, route, first) => {
    if (first) { renderRecovery(sec); FS.enhance(sec); icons(sec); return; }
    $('[data-rf="route"]', sec).innerHTML = `<option value="all">All routes</option>${ROUTES.map((r) => `<option value="${r.code}">${r.code} · ${esc(r.name)}</option>`).join('')}`;
    $('[data-rf="route"]', sec).value = RC.route; $('[data-rf="salesman"]', sec).value = RC.salesman;
    rcRender(sec);
  });
  FS.onEnter('app/wholesale/routes', (sec, route, first) => {
    if (first) { renderRoutes(sec); FS.enhance(sec); icons(sec); return; }
    rtCards(sec); rtMap(sec); rtBoard(sec);
  });
})();
