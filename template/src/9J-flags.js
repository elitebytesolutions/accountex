/* ================= 9J · Feature Management (Agent D, prefix ff-) =================
   admin/features · admin/features/view · admin/segments · admin/entitlements · admin/change-requests
   One in-memory store (S) is shared by all five screens: change requests raised on a flag show up
   on the Change Requests screen, approving one updates the flag, KPIs and nav badges everywhere. */
(function () {
  'use strict';
  if (!window.FS) return;

  /* ---------------------------------------------------------------- helpers */
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (n, d = 0) => FS.fmt(n, d);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const wait = (ms) => new Promise((r) => setTimeout(r, reduce() ? 30 : ms));
  const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const rng = (seed) => { let a = seed >>> 0 || 1; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const ini = (n) => String(n).replace(/\(.*?\)|&|\./g, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const TONES = ['', 'c2', 'c3', 'c4', 'c5', 'c6'];
  const avatar = (n, cls = 'xs') => `<span class="avatar ${cls} ${TONES[hash(n) % TONES.length]}" title="${esc(n)}">${ini(n)}</span>`;
  const plural = (n, w, p = w + 's') => `${fmt(n)} ${n === 1 ? w : p}`;
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const TODAY = new Date(2026, 9, 1);
  const parseD = (s) => { const [d, m, y] = s.split(' '); return new Date(+y, MON.indexOf(m), +d); };
  const fmtD = (dt) => `${String(dt.getDate()).padStart(2, '0')} ${MON[dt.getMonth()]} ${dt.getFullYear()}`;
  const isoD = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  const fromIso = (s) => { const [y, m, d] = s.split('-'); return new Date(+y, +m - 1, +d); };
  const daysSince = (s) => Math.round((TODAY - parseD(s)) / 864e5);
  const addDays = (n) => { const d = new Date(TODAY); d.setDate(d.getDate() + n); return d; };
  const nowStamp = () => { const d = new Date(); return `01 Oct 2026 · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const ME = 'Saim Javed';
  const STAFF = ['Saim Javed', 'Mariam Iqbal', 'Danish Ahmed', 'Areeba Khalid', 'Talha Mehmood', 'Noor Sheikh'];

  function flash(el) { if (!el) return; el.classList.remove('row-flash', 'ff-flash'); void el.offsetWidth; el.classList.add(el.tagName === 'TR' ? 'row-flash' : 'ff-flash'); }
  function shake(el) { if (!el) return; el.classList.remove('ff-shake'); void el.offsetWidth; el.classList.add('ff-shake'); }
  async function busy(btn, ms = 900, label = 'Working…') {
    if (!btn) return wait(ms);
    const html = btn.innerHTML; const w = btn.offsetWidth;
    btn.disabled = true; btn.classList.add('ff-busy'); btn.style.minWidth = w + 'px';
    btn.innerHTML = `<span class="ff-spin"></span>${label}`;
    await wait(ms);
    btn.disabled = false; btn.classList.remove('ff-busy'); btn.style.minWidth = ''; btn.innerHTML = html; FS.icons(btn);
  }
  async function copy(text, what) {
    try { await navigator.clipboard.writeText(text); } catch (e) { /* file:// can block the clipboard */ }
    FS.toast(what || `Copied <b class="ff-mono">${esc(text)}</b>`, { tone: 'info', ms: 2200 });
  }
  function modal({ title, sub = '', html = '', foot = '', cls = '' }) {
    const o = document.createElement('div');
    o.className = 'overlay'; o.dataset.temp = '1';
    o.innerHTML = `<div class="modal ff-modal ${cls}" role="dialog" aria-modal="true"><div class="modal-head"><div><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div><button class="x" data-close aria-label="Close"><i data-lucide="x"></i></button></div><div class="ff-mbody">${html}</div>${foot ? `<div class="modal-foot">${foot}</div>` : ''}</div>`;
    document.body.appendChild(o);
    o.classList.add('open'); FS.icons(o);
    const m = o.querySelector('.modal');
    m.close = () => FS.closeOverlay(o);
    setTimeout(() => { const f = m.querySelector('[autofocus],textarea,input:not([type=checkbox]):not([type=radio]):not([type=range])'); if (f) f.focus(); }, 80);
    return m;
  }
  const closeOf = (el) => { const o = el && el.closest('.overlay'); if (o) FS.closeOverlay(o); };
  const sw = (on, attrs = '', cls = '') => `<label class="switch ${cls}"><input type="checkbox" ${on ? 'checked' : ''} ${attrs}><i></i></label>`;

  /* ---------------------------------------------------------------- tenants (128) */
  const CITY = [['Lahore', 'Punjab', 22], ['Karachi', 'Sindh', 20], ['Islamabad', 'ICT', 10], ['Faisalabad', 'Punjab', 9], ['Rawalpindi', 'Punjab', 7], ['Multan', 'Punjab', 6], ['Gujranwala', 'Punjab', 5], ['Sialkot', 'Punjab', 5], ['Peshawar', 'KPK', 6], ['Hyderabad', 'Sindh', 4], ['Quetta', 'Balochistan', 3], ['Sukkur', 'Sindh', 2]];
  const INDUSTRIES = ['Distribution', 'FMCG', 'Pharma', 'Textile', 'Manufacturing', 'Retail', 'Services', 'Construction'];
  const SUFFIX = [['Distributors', 'Distribution'], ['Traders', 'Distribution'], ['Agencies', 'Distribution'], ['Foods', 'FMCG'], ['Beverages', 'FMCG'], ['Pharma', 'Pharma'], ['Medicos', 'Pharma'], ['Textiles', 'Textile'], ['Garments', 'Textile'], ['Steel', 'Manufacturing'], ['Plastics', 'Manufacturing'], ['Paints', 'Manufacturing'], ['Mart', 'Retail'], ['Electronics', 'Retail'], ['Motors', 'Retail'], ['Solutions', 'Services'], ['Logistics', 'Services'], ['Builders', 'Construction']];
  const PREFIX = ['Al-Madina', 'Faisal', 'Habib', 'Mehran', 'Khyber', 'Ittefaq', 'Prime', 'Royal', 'Lucky', 'Galaxy', 'Shalimar', 'Chenab', 'Hamza', 'Fatima', 'Zam Zam', 'Madni', 'Saeed', 'Bismillah', 'Rehman', 'Kohinoor', 'Crown', 'Paragon', 'Sapphire', 'Jinnah', 'Iqbal', 'Qasim', 'Sadiq', 'Hilal', 'Unique', 'Excel'];
  const PLANS = ['Starter', 'Growth', 'Business', 'Enterprise'];
  const PLAN_CLS = { Starter: 'starter', Growth: 'growth', Business: 'business', Enterprise: 'enterprise' };
  const planPill = (p) => `<span class="ff-plan ${PLAN_CLS[p] || ''}">${p}</span>`;
  const ROLES = ['Owner', 'Admin', 'Accountant', 'Sales', 'Warehouse', 'HR'];
  const PLATFORMS = ['Web', 'Android', 'iOS', 'Desktop'];
  const KNOWN = [
    ['ALNOOR', 'Al-Noor Enterprises', 'Lahore', 'Growth', 'Distribution', 930, 48], ['CRESTEX', 'Crescent Textiles', 'Faisalabad', 'Business', 'Textile', 1155, 186],
    ['BHATTI', 'Bhatti Traders', 'Gujranwala', 'Starter', 'Distribution', 620, 5], ['ZAMEEN', 'Zameen Builders', 'Islamabad', 'Business', 'Construction', 1055, 94],
    ['INDUSF', 'Indus Foods', 'Karachi', 'Enterprise', 'FMCG', 1245, 412], ['SHAHEEN', 'Shaheen Logistics', 'Karachi', 'Growth', 'Services', 585, 41],
    ['PAKAGRO', 'Pak Agro Mills', 'Multan', 'Growth', 'Manufacturing', 450, 39], ['KKTECH', 'Karakoram Tech', 'Islamabad', 'Growth', 'Services', 14, 17],
    ['MARGALA', 'Margalla Pharma', 'Rawalpindi', 'Business', 'Pharma', 823, 121], ['RAVIMTR', 'Ravi Motors', 'Lahore', 'Growth', 'Retail', 902, 33],
    ['SUKRICE', 'Sukkur Rice Co.', 'Sukkur', 'Starter', 'FMCG', 363, 4], ['GWADAR', 'Gwadar Marine', 'Quetta', 'Starter', 'Services', 0, 2],
    ['PESHSTL', 'Peshawar Steel Works', 'Peshawar', 'Business', 'Manufacturing', 743, 76], ['SIALSPT', 'Sialkot Sports Co.', 'Sialkot', 'Growth', 'Manufacturing', 9, 12],
    ['HYDCRM', 'Hyderabad Ceramics', 'Hyderabad', 'Starter', 'Manufacturing', 188, 5], ['ISBDGL', 'Islamabad Digital Labs', 'Islamabad', 'Enterprise', 'Services', 1035, 268],
    ['MULTEX', 'Multan Cotton Exports', 'Multan', 'Business', 'Textile', 722, 58], ['FSQA', 'Finsoft QA Sandbox', 'Lahore', 'Enterprise', 'Services', 1400, 22],
    ['FSDEMO', 'Finsoft Demo Co.', 'Lahore', 'Business', 'Distribution', 1300, 9], ['FSSTAFF', 'Finsoft Staff Books', 'Lahore', 'Growth', 'Services', 1200, 31],
  ];
  const TENANTS = (() => {
    const out = [];
    const cityBag = []; CITY.forEach(([c, r, w]) => { for (let i = 0; i < w; i++) cityBag.push([c, r]); });
    const regionOf = (c) => (CITY.find((x) => x[0] === c) || [c, 'Punjab'])[1];
    const mk = (code, name, city, plan, ind, age, users, r) => {
      const ver = age < 40 ? '4.12.' + Math.floor(r() * 3) : ['4.10.2', '4.11.0', '4.11.3', '4.12.0', '4.12.1'][Math.floor(r() * 5)];
      const roles = ROLES.filter((x, i) => i < 2 || r() < 0.55);
      const plats = PLATFORMS.filter((x, i) => i === 0 || r() < (i === 1 ? 0.6 : 0.3));
      const internal = code.startsWith('FS');
      return {
        code, name, city, region: regionOf(city), plan, industry: ind, age, users,
        appVer: ver, roles, platforms: plats, internal, beta: internal || r() < 0.18, st: plan !== 'Starter' ? r() < 0.86 : r() < 0.45,
        branches: Math.max(1, Math.round(users / (plan === 'Enterprise' ? 30 : 16) + r() * 2)),
        inv: Math.round(users * (60 + r() * 140)), gb: +(users * (0.15 + r() * 0.5)).toFixed(1), api: plan === 'Starter' ? 0 : Math.round(users * (40 + r() * 400)),
      };
    };
    KNOWN.forEach((k, i) => out.push(mk(k[0], k[1], k[2], k[3], k[4], k[5], k[6], rng(i + 7))));
    const r = rng(20261001);
    const used = new Set(out.map((t) => t.name));
    while (out.length < 128) {
      const [suf, ind] = SUFFIX[Math.floor(r() * SUFFIX.length)];
      const name = `${PREFIX[Math.floor(r() * PREFIX.length)]} ${suf}`;
      if (used.has(name)) continue;
      used.add(name);
      const [city] = cityBag[Math.floor(r() * cityBag.length)];
      const pr = r();
      const plan = pr < 0.4 ? 'Starter' : pr < 0.72 ? 'Growth' : pr < 0.91 ? 'Business' : 'Enterprise';
      const users = Math.max(2, Math.round({ Starter: 4, Growth: 22, Business: 90, Enterprise: 320 }[plan] * (0.4 + r())));
      const age = r() < 0.12 ? Math.floor(r() * 30) : Math.floor(30 + r() * 1100);
      const code = (name.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 5) + String(out.length).padStart(2, '0')).slice(0, 8);
      out.push(mk(code, name, city, plan, ind, age, users, rng(hash(name))));
    }
    return out;
  })();
  const tenantBy = (c) => TENANTS.find((t) => t.code === c);
  const planCount = (p) => TENANTS.filter((t) => t.plan === p).length;

  /* ---------------------------------------------------------------- attributes + rule engine */
  const segNames = () => S.segments.map((s) => s.name);
  const ATTRS = {
    segment: { label: 'Segment', kind: 'enum', icon: 'users-round', vals: () => segNames(), get: (t) => S.segments.filter((s) => segMatch(s, t)).map((s) => s.name) },
    plan: { label: 'Plan', kind: 'enum', icon: 'gem', vals: () => PLANS, get: (t) => t.plan },
    region: { label: 'Region', kind: 'enum', icon: 'map', vals: () => ['Punjab', 'Sindh', 'KPK', 'ICT', 'Balochistan'], get: (t) => t.region },
    city: { label: 'City', kind: 'enum', icon: 'map-pin', vals: () => CITY.map((c) => c[0]), get: (t) => t.city },
    industry: { label: 'Industry', kind: 'enum', icon: 'factory', vals: () => INDUSTRIES, get: (t) => t.industry },
    age: { label: 'Tenant age (days)', kind: 'num', icon: 'calendar-days', get: (t) => t.age },
    role: { label: 'User role', kind: 'enum', icon: 'user-cog', vals: () => ROLES, get: (t) => t.roles },
    appver: { label: 'App version', kind: 'ver', icon: 'git-branch', get: (t) => t.appVer },
    platform: { label: 'Platform', kind: 'enum', icon: 'monitor-smartphone', vals: () => PLATFORMS, get: (t) => t.platforms },
    st: { label: 'Sales-tax registered', kind: 'enum', icon: 'receipt-text', vals: () => ['Yes', 'No'], get: (t) => (t.st ? 'Yes' : 'No') },
    beta: { label: 'Beta opt-in', kind: 'enum', icon: 'flask-conical', vals: () => ['Yes', 'No'], get: (t) => (t.beta ? 'Yes' : 'No') },
    internal: { label: 'Internal tenant', kind: 'enum', icon: 'building', vals: () => ['Yes', 'No'], get: (t) => (t.internal ? 'Yes' : 'No') },
  };
  const FLAG_ATTRS = ['segment', 'plan', 'region', 'city', 'industry', 'age', 'role', 'appver', 'platform'];
  const SEG_ATTRS = ['plan', 'region', 'city', 'industry', 'age', 'st', 'beta', 'internal', 'appver', 'platform'];
  const OPS = { in: 'is one of', not: 'is not one of', gt: 'greater than', lt: 'less than' };
  const opsFor = (attr) => (ATTRS[attr].kind === 'enum' ? ['in', 'not'] : ['gt', 'lt', 'in']);
  const verN = (v) => String(v).split('.').reduce((a, x) => a * 1000 + (+x || 0), 0);
  function matchRule(t, r) {
    if (!r.vals.length) return false;
    const A = ATTRS[r.attr]; const v = A.get(t);
    const arr = Array.isArray(v) ? v : [v];
    if (r.op === 'in') return A.kind === 'enum' ? arr.some((x) => r.vals.includes(x)) : r.vals.some((x) => (A.kind === 'ver' ? verN(x) === verN(v) : +x === +v));
    if (r.op === 'not') return !arr.some((x) => r.vals.includes(x));
    const num = A.kind === 'ver' ? verN(v) : +v, lim = A.kind === 'ver' ? verN(r.vals[0]) : +r.vals[0];
    return r.op === 'gt' ? num > lim : num < lim;
  }
  function segMatch(seg, t) {
    if (seg.exclude && seg.exclude.includes(t.code)) return false;
    if (seg.include && seg.include.includes(t.code)) return true;
    return seg.rules.length > 0 && seg.rules.every((r) => matchRule(t, r));
  }
  const ruleText = (r) => `${ATTRS[r.attr].label} ${OPS[r.op]} ${r.vals.length ? r.vals.join(', ') : '…'}`;

  /* ---------------------------------------------------------------- flags */
  const TYPES = {
    release: { label: 'Release', icon: 'rocket', tone: 'info', temp: true, blurb: 'Ship code dark, then roll it out gradually. Temporary: remove it once it is at 100%.' },
    kill: { label: 'Kill switch', icon: 'power', tone: 'danger', temp: false, blurb: 'A permanent off-switch for a risky dependency (FBR API, heavy reports). Flipping it needs the key typed.' },
    ops: { label: 'Ops', icon: 'wrench', tone: 'warn', temp: false, blurb: 'Operational toggles such as read-only mode or SMS fallback. Permanent and usually global.' },
    experiment: { label: 'Experiment', icon: 'flask-conical', tone: 'violet', temp: true, blurb: 'A/B test with sticky buckets and a metric. Temporary: archive it when the experiment ends.' },
    entitlement: { label: 'Entitlement', icon: 'badge-check', tone: 'good', temp: false, blurb: 'What a plan or add-on unlocks. Permanent and driven by Plan Entitlements, not by rollouts.' },
  };
  const typeBadge = (t, sm) => `<span class="ff-type t-${t}${sm ? ' sm' : ''}"><i data-lucide="${TYPES[t].icon}"></i>${TYPES[t].label}</span>`;
  const STAGES = [['define', 'Define', 'pencil-ruler'], ['develop', 'Develop', 'code-xml'], ['production', 'Production', 'rocket'], ['cleanup', 'Cleanup', 'brush-cleaning'], ['archived', 'Archived', 'archive']];
  const stageLabel = (s) => (STAGES.find((x) => x[0] === s) || STAGES[0])[1];
  const stagePill = (s) => `<span class="ff-stage s-${s}">${stageLabel(s)}</span>`;
  const CATS = ['Compliance', 'Sales', 'Inventory', 'Finance', 'HRMS', 'Communication', 'Platform'];
  const CAT_ICON = { Compliance: 'landmark', Sales: 'shopping-cart', Inventory: 'boxes', Finance: 'wallet', HRMS: 'users', Communication: 'message-circle', Platform: 'layout-dashboard' };
  const ENVS = [['dev', 'Dev', 'D'], ['staging', 'Staging', 'S'], ['production', 'Production', 'P']];
  const envName = (e) => ENVS.find((x) => x[0] === e)[1];

  // F(key, name, type, cat, stage, owner, desc, envs 'DSP', prodPct, extra)
  const F = (key, name, type, cat, stage, owner, desc, envs, pct, x = {}) => {
    const plan = type === 'entitlement' || type === 'kill' || type === 'ops' ? null : pct;
    const env = (i) => ({ on: envs[i] === '1', pct: plan == null ? null : i === 2 ? pct : i === 1 ? Math.max(pct, 50) : 100 });
    return {
      key, name, type, cat, stage, owner, desc, tags: x.tags || [], type2: x.type2 || '',
      envs: { dev: env(0), staging: env(1), production: env(2) },
      created: x.created || '14 Jul 2026', updated: x.updated || '28 Sep 2026', lastEval: x.lastEval || ['just now', '1 min ago', '4 min ago', '12 min ago'][hash(key) % 4],
      evals: x.evals != null ? x.evals : 2000 + (hash(key) % 60000), temporary: x.temporary != null ? x.temporary : TYPES[type].temp,
      expiry: x.expiry || (TYPES[type].temp ? '31 Dec 2026' : ''), prereq: x.prereq || [], seg: x.seg || '', stale: x.stale || '',
      variations: x.variations || [['On', 'true'], ['Off', 'false']], schedule: x.schedule || null, pending: {},
    };
  };
  const FLAGS = [
    F('fbr_einvoicing_di', 'FBR Digital Invoicing (DI)', 'entitlement', 'Compliance', 'production', 'Saim Javed', 'Real-time invoice submission to the FBR PRAL DI API, with IRN and QR code on print.', '111', 8, { type2: 'release', tags: ['fbr', 'tax', 'pilot'], created: '12 Aug 2026', evals: 48210, lastEval: 'just now' }),
    F('fbr_pos_integration', 'FBR POS integration', 'entitlement', 'Compliance', 'production', 'Saim Javed', "Push Tier-1 retail POS sales to FBR's fiscal POS service.", '111', 0, { tags: ['fbr', 'pos'], created: '03 Feb 2026' }),
    F('srb_pra_provincial_tax', 'SRB / PRA provincial sales tax', 'release', 'Compliance', 'cleanup', 'Mariam Iqbal', 'Provincial sales tax on services for Sindh (SRB) and Punjab (PRA) returns.', '111', 100, { tags: ['tax'], created: '20 May 2026', updated: '02 Jun 2026', stale: 'At 100% in Production for 121 days. Remove it from code and archive.' }),
    F('withholding_tax_engine_v2', 'Withholding tax engine v2', 'release', 'Compliance', 'production', 'Mariam Iqbal', 'Rewritten WHT engine for sections 153, 149 and 231-A with FY 2026-27 rates.', '111', 10, { tags: ['tax', 'wht'], created: '22 Aug 2026', expiry: '31 Jul 2027', schedule: [['15 Sep 2026', 10], ['01 Jul 2027', 100]] }),
    F('fbr_api_killswitch', 'FBR API kill switch', 'kill', 'Compliance', 'production', 'Danish Ahmed', 'When OFF, all outbound FBR calls stop and invoices queue locally until PRAL recovers.', '111', 0, { tags: ['fbr', 'resilience'], created: '10 Jan 2026', evals: 91200, lastEval: 'just now' }),
    F('pos_module', 'POS module', 'entitlement', 'Sales', 'production', 'Talha Mehmood', 'Point-of-sale terminal with offline mode, shifts and cash drawer.', '111', 0, { created: '18 Nov 2025' }),
    F('wholesale_quick_entry_grid', 'Wholesale quick-entry grid', 'release', 'Sales', 'production', 'Areeba Khalid', 'Keyboard-first carton and loose order grid for wholesale invoices.', '111', 50, { tags: ['wholesale', 'beta', 'grid'], created: '02 Sep 2026', evals: 18420, schedule: [['15 Sep 2026', 10], ['24 Sep 2026', 50], ['08 Oct 2026', 75], ['22 Oct 2026', 100]], expiry: '30 Nov 2026' }),
    F('booker_app_order_sync', 'Booker app order sync', 'entitlement', 'Sales', 'production', 'Talha Mehmood', 'Sync orders taken by order bookers on the mobile app into sales orders.', '111', 0, { tags: ['distribution', 'mobile'] }),
    F('van_sales_load_sheet', 'Van sales load sheet', 'entitlement', 'Sales', 'production', 'Talha Mehmood', 'Load sheet, van stock and end-of-day settlement for van sales routes.', '111', 0, { tags: ['distribution'] }),
    F('trade_schemes_engine', 'Trade schemes engine', 'release', 'Sales', 'develop', 'Areeba Khalid', 'Buy-X-get-Y, slab discounts and company-funded trade schemes.', '110', 0, { tags: ['beta', 'pricing'], seg: 'Beta tenants', created: '19 Sep 2026' }),
    F('credit_limit_hard_block', 'Credit limit hard block', 'ops', 'Sales', 'production', 'Danish Ahmed', 'Block posting when a customer exceeds the credit limit; a soft warning when off.', '100', 0, { tags: ['risk'] }),
    F('paste_from_excel_grids', 'Paste from Excel in grids', 'release', 'Sales', 'production', 'Noor Sheikh', 'Paste rows copied from Excel or Sheets straight into voucher and invoice grids.', '111', 25, { tags: ['grid', 'ux'], created: '09 Sep 2026' }),
    F('batch_expiry_tracking', 'Batch & expiry tracking', 'entitlement', 'Inventory', 'production', 'Talha Mehmood', 'Batch numbers, expiry dates and FEFO picking for stock items.', '111', 0),
    F('serial_number_tracking', 'Serial number tracking', 'entitlement', 'Inventory', 'production', 'Talha Mehmood', 'Unique serials per unit from GRN to invoice and warranty.', '111', 0),
    F('multi_warehouse_transit', 'Multi-warehouse transit', 'entitlement', 'Inventory', 'production', 'Talha Mehmood', 'Goods-in-transit accounts and two-step transfers between warehouses.', '111', 0),
    F('auto_reorder_suggestions', 'Auto reorder suggestions', 'release', 'Inventory', 'production', 'Noor Sheikh', 'Suggest purchase orders from reorder levels and 90-day velocity.', '111', 20, { tags: ['ai'], created: '26 Aug 2026' }),
    F('barcode_label_designer', 'Barcode label designer', 'release', 'Inventory', 'develop', 'Noor Sheikh', 'Drag-and-drop shelf and carton label designer with Code128 and QR.', '110', 0, { tags: ['beta'], seg: 'Beta tenants', lastEval: '34 days ago', evals: 0, stale: 'No evaluations in 34 days. Is the code still shipping?' }),
    F('multi_currency', 'Multi-currency', 'entitlement', 'Finance', 'production', 'Mariam Iqbal', 'Foreign-currency invoices, bills and bank accounts with revaluation.', '111', 0),
    F('bank_statement_import_ai_match', 'Bank statement AI match', 'release', 'Finance', 'production', 'Danish Ahmed', 'Import Meezan, HBL and UBL statements and auto-match them to vouchers.', '111', 0, { tags: ['ai', 'beta'], seg: 'Beta tenants', created: '21 Sep 2026' }),
    F('ai_cash_forecast', 'AI cash forecast', 'experiment', 'Finance', 'production', 'Danish Ahmed', '13-week cash forecast on the dashboard. Measures dashboard return visits.', '111', 5, { tags: ['ai', 'experiment'], variations: [['Control', 'control'], ['Forecast card', 'forecast']], created: '15 Sep 2026' }),
    F('new_ledger_report_engine', 'New ledger report engine', 'release', 'Finance', 'production', 'Mariam Iqbal', 'Streaming general-ledger engine for 1M+ line reports.', '111', 10, { tags: ['performance'], seg: 'Internal staff', created: '04 Sep 2026' }),
    F('payroll_engine_v2', 'Payroll engine v2', 'release', 'HRMS', 'production', 'Mariam Iqbal', 'FY 2026-27 slabs, EOBI and PESSI, arrears and loan recovery in one run.', '111', 35, { tags: ['payroll'], prereq: [['hrms_module', 'On']], created: '01 Aug 2026' }),
    F('biometric_attendance_zkteco', 'Biometric attendance (ZKTeco)', 'entitlement', 'HRMS', 'production', 'Talha Mehmood', 'Pull punches from ZKTeco devices over the push SDK.', '111', 0),
    F('eobi_pessi_returns', 'EOBI / PESSI returns', 'release', 'HRMS', 'production', 'Mariam Iqbal', 'Generate monthly EOBI PR-01 and PESSI contribution returns.', '111', 0, { tags: ['beta', 'compliance'], seg: 'Beta tenants', expiry: '15 Sep 2026', stale: 'Expired on 15 Sep 2026 (16 days ago). Extend it or finish the rollout.' }),
    F('employee_self_service_portal', 'Employee self-service portal', 'release', 'HRMS', 'production', 'Noor Sheikh', 'Payslips, leave and attendance requests for employees on web and mobile.', '111', 25, { tags: ['ess'] }),
    F('whatsapp_integration', 'WhatsApp integration', 'entitlement', 'Communication', 'production', 'Talha Mehmood', 'Paid add-on: WhatsApp Business API sender for invoices and statements.', '111', 0, { tags: ['add-on'] }),
    F('whatsapp_payment_reminders', 'WhatsApp payment reminders', 'release', 'Communication', 'production', 'Danish Ahmed', 'Automatic overdue reminders with a Raast payment link over WhatsApp.', '111', 50, { tags: ['collections'], prereq: [['whatsapp_integration', 'On']], created: '11 Sep 2026' }),
    F('sms_gateway_fallback', 'SMS gateway fallback', 'ops', 'Communication', 'production', 'Danish Ahmed', 'Fail over from Jazz to Telenor SMS gateway when delivery drops below 90%.', '111', 0),
    F('urdu_ui_rtl', 'Urdu interface (RTL)', 'release', 'Platform', 'production', 'Mariam Iqbal', 'Full Urdu translation with right-to-left layout. Opt-in beta.', '111', 0, { tags: ['i18n', 'beta'], seg: 'Beta tenants' }),
    F('mobile_app_beta', 'Mobile app beta', 'release', 'Platform', 'develop', 'Areeba Khalid', 'New React Native app for owners: approvals, dashboard and receipts.', '110', 0, { tags: ['mobile', 'beta'], seg: 'Beta tenants', created: '25 Sep 2026' }),
    F('new_dashboard_layout', 'New dashboard layout', 'experiment', 'Platform', 'production', 'Areeba Khalid', 'A/B test of the bento dashboard against the classic layout (50/50).', '111', 50, { tags: ['experiment', 'ux'], variations: [['Classic', 'classic'], ['Bento', 'bento']], created: '17 Sep 2026' }),
    F('todays_work_calculator', "Today's work calculator", 'release', 'Platform', 'production', 'Noor Sheikh', "Pocket calculator and tape on the Today's work screen.", '111', 100, { tags: ['ux'], created: '29 Jun 2026', updated: '19 Jul 2026', stale: 'At 100% in Production for 74 days. Safe to remove from code.' }),
    F('heavy_reports_killswitch', 'Heavy reports kill switch', 'kill', 'Platform', 'production', 'Danish Ahmed', 'When OFF, reports over 250k rows are queued as background exports instead of rendering live.', '111', 0, { tags: ['performance'], lastEval: 'just now' }),
    F('maintenance_read_only_mode', 'Maintenance read-only mode', 'ops', 'Platform', 'production', 'Danish Ahmed', 'Puts every tenant in read-only mode during database maintenance windows.', '100', 0, { tags: ['ops'] }),
    F('new_signup_onboarding_wizard', 'New signup onboarding wizard', 'experiment', 'Platform', 'production', 'Areeba Khalid', 'Guided 5-step setup for new signups compared with the checklist. Measures activation.', '111', 50, { tags: ['growth', 'experiment'], seg: 'New signups (<30 days)', variations: [['Checklist', 'checklist'], ['Wizard', 'wizard']], created: '08 Sep 2026' }),
    F('legacy_invoice_print_v1', 'Legacy invoice print v1', 'release', 'Sales', 'archived', 'Noor Sheikh', 'Old A4 invoice renderer, replaced by Report Studio templates.', '000', 0, { created: '02 Jan 2025', updated: '12 Mar 2026', lastEval: '203 days ago', evals: 0 }),
  ];
  const flagBy = (k) => S.flags.find((f) => f.key === k);
  const CORE_MODULES = ['hrms_module'];

  /* ---------------------------------------------------------------- segments */
  const SEGMENTS = [
    { id: 'beta', name: 'Beta tenants', icon: 'flask-conical', tone: 'violet', desc: 'Tenants who opted into early features from Settings.', rules: [{ attr: 'beta', op: 'in', vals: ['Yes'] }] },
    { id: 'internal', name: 'Internal staff', icon: 'building', tone: 'blue', desc: "Finsoft's own QA, demo and staff tenants.", rules: [{ attr: 'internal', op: 'in', vals: ['Yes'] }] },
    { id: 'enterprise', name: 'Enterprise plan', icon: 'gem', tone: 'lime', desc: 'Every tenant on the Enterprise plan.', rules: [{ attr: 'plan', op: 'in', vals: ['Enterprise'] }] },
    { id: 'lahore', name: 'Lahore pilot', icon: 'map-pin', tone: 'green', desc: 'Growth and Business tenants in Lahore for the FBR DI pilot.', rules: [{ attr: 'city', op: 'in', vals: ['Lahore'] }, { attr: 'plan', op: 'in', vals: ['Growth', 'Business'] }] },
    { id: 'st', name: 'Sales-tax registered', icon: 'receipt-text', tone: 'orange', desc: 'Tenants with an STRN on file.', rules: [{ attr: 'st', op: 'in', vals: ['Yes'] }] },
    { id: 'new', name: 'New signups (<30 days)', icon: 'sparkles', tone: 'blue', desc: 'Accounts created in the last 30 days.', rules: [{ attr: 'age', op: 'lt', vals: ['30'] }] },
    { id: 'dist', name: 'Distribution businesses', icon: 'truck', tone: 'green', desc: 'Distributors, traders and FMCG wholesalers.', rules: [{ attr: 'industry', op: 'in', vals: ['Distribution', 'FMCG'] }] },
  ];

  /* ---------------------------------------------------------------- store */
  const S = {
    env: 'production', tab: 'flags', cur: 'wholesale_quick_entry_grid', curEnv: 'production',
    flags: clone(FLAGS), segments: clone(SEGMENTS), det: {}, crs: [], audit: {}, seq: 1048,
    filter: { q: '', cat: '', type: '', stage: '', owner: '', stale: false },
    segSel: 'beta', crTab: 'pending',
  };

  /* ---------------------------------------------------------------- targeting model (per flag × env) */
  const ENT_FLAG_PLANS = {}; // filled from the entitlement matrix below
  const varName = (f, i) => (f.variations[i] ? f.variations[i][0] : '—');
  function getD(f, env) {
    const id = f.key + '|' + env;
    if (S.det[id]) return S.det[id];
    const e = f.envs[env];
    const pick = (n, pred) => TENANTS.filter(pred).sort((a, b) => hash(a.code + f.key) - hash(b.code + f.key)).slice(0, n).map((t) => t.code);
    const d = { on: e.on, targets: { 0: [], 1: [] }, rules: [], def: 'rollout', pct: e.pct == null ? 100 : e.pct, rollOn: f.type === 'experiment' ? 1 : 0, off: f.variations.length > 1 ? 1 : 0, pre: clone(f.prereq) };
    if (f.type === 'entitlement') {
      d.def = 1;
      d.rules.push({ attr: 'plan', op: 'in', vals: (ENT_FLAG_PLANS[f.key] || ['Business', 'Enterprise']).slice(), serve: 0 });
      if (f.key === 'fbr_einvoicing_di') { d.rules = []; d.targets[0] = pick(10, (t) => t.plan !== 'Starter' && t.st); }
      if (f.key === 'whatsapp_integration') { d.rules = []; d.targets[0] = pick(14, (t) => t.plan !== 'Starter'); }
    } else if (f.type === 'kill' || f.type === 'ops') {
      d.def = 0; d.pct = 100;
    } else {
      if (f.seg) d.rules.push({ attr: 'segment', op: 'in', vals: [f.seg], serve: d.rollOn });
      if (env !== 'dev') d.targets[d.rollOn] = ['FSQA'];
      if (f.key === 'wholesale_quick_entry_grid' && env !== 'dev') {
        d.targets = { 0: ['FSQA', 'ALNOOR', 'INDUSF', 'CRESTEX'], 1: ['SUKRICE'] };
        d.rules = [{ attr: 'segment', op: 'in', vals: ['Beta tenants'], serve: 0 }, { attr: 'appver', op: 'lt', vals: ['4.11.0'], serve: 1 }];
      }
      if (f.key === 'new_ledger_report_engine') d.rules[0] = { attr: 'segment', op: 'in', vals: ['Internal staff'], serve: 0 };
    }
    S.det[id] = d;
    return d;
  }
  const bucket = (t, key) => hash(t.code + '.' + key) % 100;
  function evaluate(f, env, t, d, depth = 0) {
    d = d || getD(f, env);
    for (const [k, v] of (d.pre || f.prereq)) {
      if (CORE_MODULES.includes(k)) { if (t.plan === 'Starter') return { v: d.off, why: 'Prerequisite ' + k }; continue; }
      const pf = flagBy(k);
      if (pf && depth < 3 && varName(pf, evaluate(pf, env, t, getD(pf, env), depth + 1).v) !== v) return { v: d.off, why: 'Prerequisite ' + k };
    }
    if (!d.on) return { v: d.off, why: 'Targeting off' };
    for (const i of [0, 1]) if ((d.targets[i] || []).includes(t.code)) return { v: i, why: 'Individual target' };
    for (let i = 0; i < d.rules.length; i++) if (matchRule(t, d.rules[i])) return { v: d.rules[i].serve, why: 'Rule ' + (i + 1) };
    if (d.def === 'rollout') return { v: bucket(t, f.key) < d.pct ? d.rollOn : (d.rollOn ? 0 : 1), why: `Rollout · bucket ${bucket(t, f.key)}` };
    return { v: d.def, why: 'Default rule' };
  }
  const onIdx = (f) => (f.type === 'experiment' ? 1 : 0);
  const servedOn = (f, env, d) => TENANTS.filter((t) => evaluate(f, env, t, d).v === onIdx(f)).length;
  function sync(f, env) {
    const d = getD(f, env), e = f.envs[env];
    e.on = d.on;
    if (d.pre) f.prereq = clone(d.pre);
    if (e.pct != null) e.pct = d.def === 'rollout' ? d.pct : d.def === onIdx(f) ? 100 : 0;
  }
  function snap(f, d) {
    const o = { flag: f.key, on: d.on };
    const pre = d.pre || f.prereq;
    if (pre.length) o.prerequisites = pre.map(([k, v]) => `${k} = ${v}`);
    const tg = {}; [0, 1].forEach((i) => { if ((d.targets[i] || []).length) tg[varName(f, i)] = d.targets[i].slice(); });
    if (Object.keys(tg).length) o.targets = tg;
    if (d.rules.length) o.rules = d.rules.map((r) => `${ruleText(r)} → ${varName(f, r.serve)}`);
    o.defaultRule = d.def === 'rollout' ? { rollout: `${d.pct}% ${varName(f, d.rollOn)} / ${100 - d.pct}% ${varName(f, d.rollOn ? 0 : 1)}`, bucketBy: 'tenant_id' } : { serve: varName(f, d.def) };
    o.offVariation = varName(f, d.off);
    return o;
  }

  /* ---------------------------------------------------------------- JSON line diff */
  function diffLines(a, b) {
    const n = a.length, m = b.length, dp = Array.from({ length: n + 1 }, () => new Int16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const out = []; let i = 0, j = 0;
    while (i < n && j < m) { if (a[i] === b[j]) { out.push([' ', a[i]]); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) out.push(['-', a[i++]]); else out.push(['+', b[j++]]); }
    while (i < n) out.push(['-', a[i++]]);
    while (j < m) out.push(['+', b[j++]]);
    return out;
  }
  const jsonLines = (o) => JSON.stringify(o, null, 2).split('\n');
  function diffStats(before, after) { const d = diffLines(jsonLines(before), jsonLines(after)); return { add: d.filter((x) => x[0] === '+').length, del: d.filter((x) => x[0] === '-').length }; }
  function diffHtml(before, after, compact) {
    const d = diffLines(jsonLines(before), jsonLines(after));
    let ln = 0, rn = 0;
    const rows = d.map(([t, s]) => {
      if (t !== '+') ln++;
      if (t !== '-') rn++;
      const cls = t === '+' ? 'add' : t === '-' ? 'del' : '';
      return `<div class="ff-dl ${cls}"><span class="n">${t === '+' ? '' : ln}</span><span class="n">${t === '-' ? '' : rn}</span><span class="m">${t === ' ' ? '' : t === '-' ? '−' : '+'}</span><code>${esc(s)}</code></div>`;
    });
    const s = diffStats(before, after);
    return `<div class="ff-diff${compact ? ' compact' : ''}"><div class="ff-diff-h"><span><i data-lucide="file-diff"></i>targeting.json</span><span><b class="add">+${s.add}</b><b class="del">−${s.del}</b></span></div><div class="ff-diff-b">${rows.join('')}</div></div>`;
  }

  /* ---------------------------------------------------------------- change requests + audit */
  function auditFor(f) {
    if (S.audit[f.key]) return S.audit[f.key];
    const d = getD(f, 'production');
    const now = snap(f, d);
    const list = [];
    const p = f.envs.production.pct;
    if (p != null && p > 0) {
      const prev = clone(d); prev.pct = Math.max(5, Math.round(d.pct / 2 / 5) * 5);
      if (prev.pct !== d.pct) list.push({ when: f.updated + ' · 11:42', who: f.owner, env: 'production', what: `Rollout ${prev.pct}% → ${d.pct}%`, icon: 'percent', tone: 'info', before: snap(f, prev), after: now, via: 'CR-' + (1040 - (hash(f.key) % 30)) });
    }
    if (d.rules.length) {
      const prev = clone(d); prev.rules = prev.rules.slice(0, -1);
      list.push({ when: '19 Sep 2026 · 15:08', who: STAFF[(hash(f.key) + 1) % STAFF.length], env: 'production', what: `Added rule “${ruleText(d.rules[d.rules.length - 1])}”`, icon: 'list-plus', tone: 'violet', before: snap(f, prev), after: snap(f, Object.assign(clone(prev), { rules: d.rules })) });
    }
    const off = clone(d); off.on = false;
    list.push({ when: f.created + ' · 17:30', who: f.owner, env: 'production', what: 'Targeting turned on in Production', icon: 'power', tone: 'good', before: snap(f, off), after: snap(f, Object.assign(clone(off), { on: true })) });
    list.push({ when: f.created + ' · 10:05', who: f.owner, env: 'all', what: 'Flag created', icon: 'flag', tone: '', before: {}, after: { key: f.key, type: f.type, temporary: f.temporary, variations: f.variations.map((v) => v[0]) } });
    S.audit[f.key] = list;
    return list;
  }
  function audit(f, entry) { auditFor(f).unshift({ when: nowStamp(), who: ME, ...entry, fresh: true }); }
  const pendingCount = () => S.crs.filter((c) => c.status === 'pending').length;
  function crSummary(before, after) {
    const parts = [];
    if (before.on !== after.on) parts.push(after.on ? 'Turn targeting ON' : 'Turn targeting OFF');
    if (JSON.stringify(before.defaultRule) !== JSON.stringify(after.defaultRule)) {
      const bp = before.defaultRule && before.defaultRule.rollout ? before.defaultRule.rollout.split(' ')[0] : '';
      parts.push(after.defaultRule.rollout ? `Rollout ${bp ? bp + ' → ' : ''}${after.defaultRule.rollout.split(' ')[0]}` : `Default → ${after.defaultRule.serve}`);
    }
    const rb = (before.rules || []).length, ra = (after.rules || []).length;
    if (rb !== ra) parts.push(`${ra > rb ? '+' : '−'}${Math.abs(ra - rb)} rule${Math.abs(ra - rb) > 1 ? 's' : ''}`);
    else if (JSON.stringify(before.rules) !== JSON.stringify(after.rules)) parts.push('Rules edited');
    if (JSON.stringify(before.targets) !== JSON.stringify(after.targets)) parts.push('Targets changed');
    if (JSON.stringify(before.prerequisites) !== JSON.stringify(after.prerequisites)) parts.push('Prerequisites changed');
    if (before.offVariation !== after.offVariation) parts.push('Off variation changed');
    return parts.join(' · ') || 'No targeting change';
  }
  function createCR(f, env, newD, o) {
    const before = snap(f, o.beforeD || getD(f, env)), after = snap(f, newD);
    const cr = {
      id: 'CR-' + ++S.seq, key: f.key, env, requester: o.requester || ME, reason: o.reason, created: o.created || nowStamp(), status: o.status || 'pending',
      approvers: o.approvers || ['Mariam Iqbal'], before, after, patch: clone(newD), comments: o.comments || [], summary: crSummary(before, after),
      decidedBy: o.decidedBy, decidedAt: o.decidedAt, note: o.note, fresh: !o.created,
    };
    S.crs.unshift(cr);
    if (cr.status === 'pending') f.pending[env] = cr.id;
    return cr;
  }
  function applyCR(cr) {
    const f = flagBy(cr.key); if (!f) return;
    S.det[f.key + '|' + cr.env] = clone(cr.patch);
    sync(f, cr.env);
    delete f.pending[cr.env];
    f.updated = '01 Oct 2026'; f.lastEval = 'just now';
    audit(f, { env: cr.env, what: `${cr.summary} (${cr.id})`, icon: 'git-pull-request-arrow', tone: 'good', before: cr.before, after: cr.after, via: cr.id });
  }
  function refreshBadges() {
    const n = pendingCount();
    $$('[data-ff-pending-badge]').forEach((b) => { b.textContent = n; b.hidden = !n; });
    try {
      const m = window.NAV.admin.groups.flatMap((g) => g.modules).find((x) => x.label === 'Feature Management');
      const c = m && m.children.find((x) => x.r === 'admin/change-requests');
      if (c) c.badge = n ? String(n) : '';
    } catch (e) { /* nav shape differs */ }
    $$('#sidebar [data-r="admin/change-requests"]').forEach((a) => {
      let em = a.querySelector('.sb-count');
      if (!n) { if (em) em.remove(); return; }
      if (!em) { em = document.createElement('em'); em.className = 'sb-count'; a.querySelector('.sb-label').after(em); }
      if (em.textContent !== String(n)) { em.textContent = n; em.classList.remove('ff-bump'); void em.offsetWidth; em.classList.add('ff-bump'); }
    });
  }
  const watchClose = (m, onClose) => {
    const ov = m.closest('.overlay');
    const obs = new MutationObserver(() => { if (!ov.isConnected) { obs.disconnect(); onClose(); } });
    obs.observe(document.body, { childList: true });
  };
  // change request modal: diff preview + reason + approvers -> resolves to the new CR or null
  function changeRequestModal(f, env, newD, o = {}) {
    return new Promise((res) => {
      const before = snap(f, getD(f, env)), after = snap(f, newD);
      let done = false;
      const m = modal({
        title: o.title || 'Request a Production change', cls: 'wide',
        sub: `<span class="ff-env-dot e-${env}"></span>${envName(env)} is protected. A second admin must approve before <b class="ff-mono">${f.key}</b> changes.`,
        html: `<div class="ff-cr-modal">
          <div class="ff-cr-sum"><span class="icon-tile orange"><i data-lucide="git-pull-request"></i></span><div><b>${esc(crSummary(before, after))}</b><small>${esc(f.name)} · ${envName(env)}</small></div>${typeBadge(f.type, 1)}</div>
          ${diffHtml(before, after, true)}
          <label class="field"><span>Reason for the change *</span><textarea rows="3" name="reason" placeholder="Why now, what you checked, and how to roll back"></textarea></label>
          <div class="field"><span>Approvers</span><div class="ff-pickers">${STAFF.filter((s) => s !== ME).map((s, i) => `<button type="button" class="ff-pick ${i === 0 ? 'on' : ''}" data-who="${s}">${avatar(s)}${s}</button>`).join('')}</div></div>
          <label class="ff-check"><input type="checkbox" name="sched"> Apply automatically once approved, but not before <input type="time" value="22:00" class="ff-time"> PKT</label>
        </div>`,
        foot: `<button class="btn secondary" data-close>Cancel</button><button class="btn primary" data-ok><i data-lucide="send"></i>Submit for approval</button>`,
      });
      m.addEventListener('click', (e) => { const p = e.target.closest('.ff-pick'); if (p) p.classList.toggle('on'); });
      const ok = $('[data-ok]', m), ta = $('[name=reason]', m);
      ta.addEventListener('input', () => ta.classList.remove('ff-invalid'));
      ok.onclick = async () => {
        if (!ta.value.trim()) { ta.classList.add('ff-invalid'); shake(ta.closest('label')); ta.focus(); return; }
        const approvers = $$('.ff-pick.on', m).map((b) => b.dataset.who);
        if (!approvers.length) { shake($('.ff-pickers', m)); FS.toast('Pick at least one approver', { tone: 'warn' }); return; }
        await busy(ok, 800, 'Submitting…');
        done = true;
        const cr = createCR(f, env, newD, { reason: ta.value.trim(), approvers });
        m.close(); refreshBadges(); res(cr);
        FS.toast(`<b>${cr.id}</b> sent to ${approvers.join(', ')} for approval`, { tone: 'info', ms: 6000, action: { label: 'View request', fn: () => { S.crTab = 'pending'; S.crOpen = cr.id; FS.go('admin/change-requests'); } } });
      };
      watchClose(m, () => { if (!done) res(null); });
    });
  }
  // kill switch: type the key to confirm -> resolves true/false
  function killConfirm(f, env, turnOn) {
    return new Promise((res) => {
      let done = false;
      const m = modal({
        title: `${turnOn ? 'Restore' : 'Flip'} kill switch`, cls: 'ff-sm',
        html: `<div class="ff-kill ${turnOn ? 'restore' : ''}"><span class="icon-well lg ${turnOn ? '' : 'red'}"><i data-lucide="${turnOn ? 'shield-check' : 'shield-alert'}"></i></span>
          <div><p>${turnOn ? `Turning <b class="ff-mono">${f.key}</b> back ON resumes it for every tenant in <b>${envName(env)}</b>.` : `Turning <b class="ff-mono">${f.key}</b> OFF affects <b>all ${TENANTS.length} tenants</b> in <b>${envName(env)}</b> immediately.`}</p>
          ${env === 'production' ? '<p class="ff-note"><i data-lucide="siren"></i>Kill switches skip the approval queue. The flip is logged and #platform-oncall is paged.</p>' : ''}</div></div>
          <label class="field"><span>Type <b class="ff-mono">${f.key}</b> to confirm</span><input name="k" autocomplete="off" spellcheck="false" class="ff-mono-in" placeholder="${f.key}"></label>`,
        foot: `<button class="btn secondary" data-close>Cancel</button><button class="btn ${turnOn ? 'primary' : 'danger solid'}" data-ok disabled><i data-lucide="power"></i>${turnOn ? 'Restore' : 'Kill it'}</button>`,
      });
      const ok = $('[data-ok]', m), inp = $('[name=k]', m);
      inp.addEventListener('input', () => { const good = inp.value.trim() === f.key; ok.disabled = !good; inp.classList.toggle('ff-ok', good); });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !ok.disabled) ok.click(); });
      ok.onclick = async () => { await busy(ok, 700, turnOn ? 'Restoring…' : 'Killing…'); done = true; m.close(); res(true); };
      watchClose(m, () => { if (!done) res(false); });
    });
  }

  /* ---------------------------------------------------------------- shared rule builder */
  // rules: [{attr, op, vals[], serve?}]  opts: {attrs, serve: [names] | null, join: 'or'|'and', onChange, flagKey}
  function mountRules(host, rules, opts) {
    host.classList.add('ff-rules');
    const count = (r) => TENANTS.filter((t) => matchRule(t, r)).length;
    const valsHtml = (r, i) => {
      const A = ATTRS[r.attr];
      if (A.kind !== 'enum') return `<input class="ff-valin" data-r="num" data-i="${i}" value="${esc(r.vals[0] || '')}" placeholder="${A.kind === 'ver' ? '4.11.0' : '30'}" inputmode="${A.kind === 'ver' ? 'text' : 'numeric'}">`;
      return r.vals.map((v) => `<span class="ff-vchip">${esc(v)}<button type="button" data-r="rmval" data-i="${i}" data-v="${esc(v)}" aria-label="Remove ${esc(v)}"><i data-lucide="x"></i></button></span>`).join('') + (A.vals().some((v) => !r.vals.includes(v)) ? `<button type="button" class="ff-addval" data-r="addval" data-i="${i}"><i data-lucide="plus"></i>${r.vals.length ? '' : 'Add value'}</button>` : '');
    };
    const row = (r, i) => `<div class="ff-rule" draggable="true" data-i="${i}" style="--i:${i}">
      <span class="ff-grip" title="Drag to reorder" aria-hidden="true"><i data-lucide="grip-vertical"></i></span>
      <span class="ff-if">${i === 0 ? 'IF' : opts.join === 'and' ? 'AND' : 'ELSE IF'}</span>
      <select data-r="attr" data-i="${i}" aria-label="Attribute">${opts.attrs.map((a) => `<option value="${a}" ${a === r.attr ? 'selected' : ''}>${ATTRS[a].label}</option>`).join('')}</select>
      <select data-r="op" data-i="${i}" aria-label="Operator" class="ff-op">${opsFor(r.attr).map((o) => `<option value="${o}" ${o === r.op ? 'selected' : ''}>${OPS[o]}</option>`).join('')}</select>
      <div class="ff-vals">${valsHtml(r, i)}</div>
      ${opts.serve ? `<span class="ff-then">serve</span><select data-r="serve" data-i="${i}" class="ff-serve" aria-label="Serve variation">${opts.serve.map((n, k) => `<option value="${k}" ${k === r.serve ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>` : ''}
      <span class="ff-rule-end"><em class="ff-rule-n" data-n="${i}">${count(r)}<small>tenants</small></em>
      <button type="button" class="icon-btn-sm ff-rm" data-r="del" data-i="${i}" aria-label="Remove rule"><i data-lucide="trash-2"></i></button></span>
    </div>`;
    const render = () => {
      host.innerHTML = (rules.length ? rules.map(row).join('') : `<div class="ff-rules-empty"><i data-lucide="list-filter"></i>${opts.empty || 'No rules yet.'}</div>`) +
        `<button type="button" class="ff-addrule" data-r="add"><i data-lucide="plus"></i>Add rule</button>`;
      FS.icons(host);
    };
    const changed = () => { $$('[data-n]', host).forEach((em) => { const r = host._ffRules[+em.dataset.n]; if (r) { em.firstChild.textContent = count(r); } }); host._ffOpts.onChange && host._ffOpts.onChange(); };
    render();
    if (host._ffBound) { host._ffRules = rules; host._ffOpts = opts; host._ffRender = render; return render; }
    host._ffBound = true; host._ffRules = rules; host._ffOpts = opts; host._ffRender = render;
    const R = () => host._ffRules, O = () => host._ffOpts;
    host.addEventListener('click', (e) => {
      const b = e.target.closest('[data-r]'); if (!b || b.tagName === 'SELECT' || b.tagName === 'INPUT') return;
      const rs = R(), i = +b.dataset.i, act = b.dataset.r;
      if (act === 'add') {
        const a = O().attrs.includes('plan') ? 'plan' : O().attrs[0];
        rs.push({ attr: a, op: 'in', vals: [], serve: 0 });
        host._ffRender(); O().onChange && O().onChange();
        const last = $$('.ff-rule', host).pop(); if (last) { last.classList.add('ff-new'); const ab = $('[data-r=addval]', last); if (ab) setTimeout(() => ab.click(), 60); }
      } else if (act === 'del') {
        const el = b.closest('.ff-rule'); el.classList.add('ff-out');
        setTimeout(() => { rs.splice(i, 1); host._ffRender(); O().onChange && O().onChange(); }, reduce() ? 0 : 220);
      } else if (act === 'rmval') {
        rs[i].vals = rs[i].vals.filter((v) => v !== b.dataset.v); host._ffRender(); O().onChange && O().onChange();
      } else if (act === 'addval') {
        const r = rs[i], left = ATTRS[r.attr].vals().filter((v) => !r.vals.includes(v));
        FS.menu(b, left.map((v) => ({ label: v, icon: ATTRS[r.attr].icon, onClick: () => { r.vals.push(v); host._ffRender(); O().onChange && O().onChange(); const ch = $$('.ff-rule', host)[i]; if (ch) flash(ch); } })));
      }
    });
    host.addEventListener('change', (e) => {
      const el = e.target, rs = R(), i = +el.dataset.i, r = rs[i]; if (!r) return;
      if (el.dataset.r === 'attr') { r.attr = el.value; r.op = opsFor(r.attr)[0]; r.vals = []; host._ffRender(); O().onChange && O().onChange(); }
      else if (el.dataset.r === 'op') { r.op = el.value; changed(false); }
      else if (el.dataset.r === 'serve') { r.serve = +el.value; changed(false); }
    });
    host.addEventListener('input', (e) => {
      const el = e.target; if (el.dataset.r !== 'num') return;
      const r = R()[+el.dataset.i]; r.vals = el.value.trim() ? [el.value.trim()] : []; changed(false);
    });
    // drag to reorder
    let from = -1;
    host.addEventListener('dragstart', (e) => { const r = e.target.closest && e.target.closest('.ff-rule'); if (!r) return; from = +r.dataset.i; r.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(from)); } catch (x) { /* ignore */ } });
    host.addEventListener('dragend', () => { $$('.ff-rule', host).forEach((r) => r.classList.remove('dragging', 'over-top', 'over-bot')); });
    host.addEventListener('dragover', (e) => {
      const r = e.target.closest('.ff-rule'); if (!r || from < 0) return; e.preventDefault();
      const rect = r.getBoundingClientRect(), top = e.clientY < rect.top + rect.height / 2;
      $$('.ff-rule', host).forEach((x) => x.classList.remove('over-top', 'over-bot'));
      r.classList.add(top ? 'over-top' : 'over-bot');
    });
    host.addEventListener('drop', (e) => {
      const r = e.target.closest('.ff-rule'); if (!r || from < 0) return; e.preventDefault();
      const rect = r.getBoundingClientRect(), top = e.clientY < rect.top + rect.height / 2;
      let to = +r.dataset.i + (top ? 0 : 1); const rs = R();
      const [m] = rs.splice(from, 1); if (to > from) to--; rs.splice(to, 0, m); from = -1;
      host._ffRender(); O().onChange && O().onChange(); const moved = $$('.ff-rule', host)[to]; if (moved) flash(moved);
      FS.toast(`Rule moved to position ${to + 1}. Rules are evaluated top to bottom.`, { tone: 'info', ms: 2400 });
    });
    return render;
  }

  /* ================================================================ 1 · admin/features */
  const kpi = (k, label, icon, tone = '') => `<div class="kpi ff-kpi ${tone}" data-kpi="${k}" tabindex="0"><div class="kpi-top"><span>${label}</span><span class="icon-well ${tone === 'warn' ? 'yellow' : tone === 'danger' ? 'red' : tone === 'violet' ? 'violet' : ''}"><i data-lucide="${icon}"></i></span></div><strong data-kv="${k}">0</strong><small data-ks="${k}"></small></div>`;
  const live = () => S.flags.filter((f) => f.stage !== 'archived');
  function kpiData() {
    const L = live();
    return {
      total: [L.length, `${L.filter((f) => f.temporary).length} temporary · ${L.filter((f) => !f.temporary).length} permanent`],
      prod: [L.filter((f) => f.envs.production.on).length, `of ${L.length} serving in Production`],
      stale: [L.filter((f) => f.stale).length, 'Ready to clean up'],
      pending: [pendingCount(), 'Awaiting a second approver'],
      kill: [L.filter((f) => f.type === 'kill').length, L.filter((f) => f.type === 'kill').every((f) => f.envs.production.on) ? 'All armed · traffic flowing' : 'A kill switch is OFF'],
    };
  }
  function paintKpis(sec, first) {
    const k = kpiData();
    Object.entries(k).forEach(([key, [v, sub]]) => {
      const el = $(`[data-kv="${key}"]`, sec); if (!el) return;
      if (first) { el.textContent = v; el.dataset.val = v; } else if (+el.dataset.val !== v) FS.tick(el, v, { dec: 0 });
      $(`[data-ks="${key}"]`, sec).textContent = sub;
    });
  }
  const ENV_KEYS = {};
  const keyFor = (env, kind) => {
    const id = env + kind;
    if (!ENV_KEYS[id]) { const r = rng(hash(id)); ENV_KEYS[id] = Array.from({ length: 28 }, () => '0123456789abcdef'[Math.floor(r() * 16)]).join(''); }
    const p = { server: 'sdk-', client: '', mobile: 'mob-' }[kind];
    return p + (kind === 'client' ? ENV_KEYS[id].slice(0, 24) : `${env.slice(0, 4)}-${ENV_KEYS[id].slice(0, 8)}-${ENV_KEYS[id].slice(8, 12)}-${ENV_KEYS[id].slice(12, 24)}`);
  };
  const mask = (k) => k.slice(0, k.indexOf('-') + 1 || 4) + '•'.repeat(14) + k.slice(-4);
  const MODULES = [
    ['Accounting & GL', 'mod.accounting', 'book-open', 128, 'Starter', true], ['Sales & receivables', 'mod.sales', 'receipt-text', 126, 'Starter'], ['Purchases & payables', 'mod.purchases', 'shopping-bag', 121, 'Starter'],
    ['Inventory', 'mod.inventory', 'boxes', 88, 'Growth'], ['Wholesale & distribution', 'mod.wholesale', 'truck', 37, 'Business'], ['Point of sale', 'mod.pos', 'monitor-smartphone', 29, 'Growth'],
    ['Fixed assets', 'mod.assets', 'building-2', 41, 'Business'], ['HRMS', 'hrms_module', 'users', 86, 'Growth'], ['Payroll', 'mod.payroll', 'wallet', 86, 'Growth'],
    ['Attendance', 'mod.attendance', 'fingerprint', 79, 'Growth'], ['Recruitment', 'mod.recruitment', 'user-search', 22, 'Business'], ['Employee self-service', 'mod.ess', 'id-card', 84, 'Growth'],
  ].map(([name, key, icon, used, min, locked]) => ({ name, key, icon, used, min, locked: !!locked, on: true, plans: PLANS.map((p, i) => i >= PLANS.indexOf(min)) }));

  function renderFeatures(sec) {
    const mount = $('[data-ff-mount]', sec);
    const owners = [...new Set(S.flags.map((f) => f.owner))];
    mount.innerHTML = `
      <div class="kpi-grid c5 ff-kpis">${kpi('total', 'Total flags', 'flag')}${kpi('prod', 'Active in Production', 'activity')}${kpi('stale', 'Stale flags', 'hourglass', 'warn')}${kpi('pending', 'Pending approvals', 'git-pull-request', 'violet')}${kpi('kill', 'Kill switches', 'power', 'danger')}</div>
      <div class="tabs ff-tabs" role="tablist"><button class="active" data-ff-tab="flags" role="tab"><svg data-lucide="flag"></svg>Flags <i data-ff-count>0</i></button><button data-ff-tab="modules" role="tab"><svg data-lucide="blocks"></svg>Core modules</button><button data-ff-tab="sdk" role="tab"><svg data-lucide="key-round"></svg>SDK keys</button></div>
      <div data-ff-pane="flags">
        <div class="panel flush ff-flagpanel" data-env="${S.env}">
          <div class="ff-envbar">
            <div class="ff-envsw" role="radiogroup" aria-label="Environment">${ENVS.map(([k, n]) => `<button type="button" role="radio" class="e-${k} ${k === S.env ? 'active' : ''}" data-env="${k}" aria-checked="${k === S.env}"><span class="ff-env-dot e-${k}"></span>${n}</button>`).join('')}</div>
            <div class="ff-envmeta" data-envmeta></div>
          </div>
          <div class="ff-filters">
            <div class="ff-frow">
              <label class="search-field ff-search" data-plain-search><i data-lucide="search"></i><input placeholder="Search key, name, tag…" data-f="q" aria-label="Search flags"></label>
              <select data-f="type" aria-label="Type"><option value="">All types</option>${Object.entries(TYPES).map(([k, t]) => `<option value="${k}">${t.label}</option>`).join('')}</select>
              <select data-f="owner" aria-label="Owner"><option value="">All owners</option>${owners.map((o) => `<option>${o}</option>`).join('')}</select>
              <label class="switch ff-stale-sw"><input type="checkbox" data-f="stale"><i></i><span>Stale only</span></label>
            </div>
            <div class="ff-frow">
              <div class="ff-chiprow" data-chips="cat"><button class="active" data-v="">All</button>${CATS.map((c) => `<button data-v="${c}"><svg data-lucide="${CAT_ICON[c]}"></svg>${c}</button>`).join('')}</div>
              <span class="ff-sep"></span>
              <div class="ff-chiprow ff-stagechips" data-chips="stage"><button class="active" data-v="">Live</button>${STAGES.map(([k, n]) => `<button data-v="${k}"><span class="ff-sdot s-${k}"></span>${n}</button>`).join('')}</div>
            </div>
          </div>
          <div class="ff-prodnote" data-prodnote><i data-lucide="shield-check"></i><span><b>Production is protected.</b> Toggling a flag here opens a change request for a second approver. Kill switches apply instantly after you type the key.</span></div>
          <div class="table-wrap ff-twrap"><table class="tbl ff-tbl" data-plain data-no-qv>
            <thead><tr><th>Flag</th><th>Type</th><th>Lifecycle</th><th title="Dev · Staging · Production">Envs</th><th>Rollout</th><th>Prerequisites</th><th>Owner</th><th>Last evaluated</th><th class="ff-c-sw" data-swh>Production</th><th></th></tr></thead>
            <tbody data-rows></tbody></table></div>
          <div class="ff-tfoot"><span data-showing></span><span class="ff-legend"><span><i class="ff-ed on"></i>Serving</span><span><i class="ff-ed"></i>Off</span><span><i class="ff-ed pend"></i>Pending approval</span><span><i data-lucide="hourglass"></i>Stale</span></span></div>
        </div>
      </div>
      <div data-ff-pane="modules" hidden>${modulesHtml()}</div>
      <div data-ff-pane="sdk" hidden>${sdkHtml()}</div>`;
    paintKpis(sec, true);
    paintEnv(sec);
    paintRows(sec);
    bindFeatures(sec);
  }

  function filtered() {
    const F = S.filter, q = F.q.toLowerCase();
    return S.flags.filter((f) => (F.stage ? f.stage === F.stage : f.stage !== 'archived') && (!F.cat || f.cat === F.cat) && (!F.type || f.type === F.type || f.type2 === F.type) && (!F.owner || f.owner === F.owner) && (!F.stale || f.stale) &&
      (!q || `${f.key} ${f.name} ${f.desc} ${f.tags.join(' ')}`.toLowerCase().includes(q)));
  }
  function rolloutCell(f, env) {
    const e = f.envs[env];
    if (e.pct == null) {
      const lbl = f.type === 'entitlement' ? (f.key === 'fbr_einvoicing_di' || f.key === 'whatsapp_integration' ? `${getD(f, env).targets[0].length} tenants` : 'By plan') : 'Global';
      return `<div class="ff-roll na ${e.on ? '' : 'off'}"><span class="ff-rtag"><i data-lucide="${f.type === 'entitlement' ? 'layers' : 'globe'}"></i>${lbl}</span></div>`;
    }
    const pct = e.on ? e.pct : 0;
    return `<div class="ff-roll ${e.on ? '' : 'off'}"><div class="ff-mbar"><i style="--w:${pct}%"></i></div><em>${e.on ? pct + '%' : 'Off'}</em>${f.seg ? `<small class="ff-segtag"><i data-lucide="users-round"></i>${esc(f.seg)}</small>` : ''}</div>`;
  }
  const prereqChips = (f) => (f.prereq.length ? f.prereq.map(([k, v]) => `<span class="ff-pre ${CORE_MODULES.includes(k) ? 'mod' : ''}" title="Requires ${k} = ${v}"><i data-lucide="${CORE_MODULES.includes(k) ? 'blocks' : 'link-2'}"></i>${k}</span>`).join('') : '<span class="ff-none">—</span>');
  const envDots = (f, cur) => `<div class="ff-envdots">${ENVS.map(([k, n, s]) => { const e = f.envs[k]; return `<span class="ff-ed ${e.on ? 'on' : ''} ${f.pending[k] ? 'pend' : ''} ${k === cur ? 'cur' : ''} e-${k}" title="${n}: ${e.on ? 'serving' : 'off'}${e.pct != null && e.on ? ' · ' + e.pct + '%' : ''}${f.pending[k] ? ' · change pending' : ''}">${s}</span>`; }).join('')}</div>`;
  function rowHtml(f, i) {
    const e = f.envs[S.env], pend = f.pending[S.env];
    return `<tr data-key="${f.key}" class="${f.stale ? 'is-stale' : ''} ${f.stage === 'archived' ? 'is-arch' : ''}" style="--ri:${i}" tabindex="0">
      <td class="ff-c-flag"><div class="ff-flagcell"><span class="ff-ficon t-${f.type}"><i data-lucide="${TYPES[f.type].icon}"></i></span><div>
        <div class="ff-keyline"><code class="ff-key">${f.key}</code>${pend ? `<span class="badge warn ff-pendb" title="${pend} awaiting approval"><i data-lucide="clock"></i>Pending</span>` : ''}${f.stale ? `<span class="ff-stalei" title="${esc(f.stale)}"><i data-lucide="hourglass"></i>Stale</span>` : ''}</div>
        <b>${esc(f.name)}</b><small>${esc(f.desc)}</small></div></div></td>
      <td>${typeBadge(f.type, 1)}${f.type2 ? typeBadge(f.type2, 1) : ''}<small class="ff-cat">${f.cat}</small></td>
      <td>${stagePill(f.stage)}</td>
      <td>${envDots(f, S.env)}</td>
      <td>${rolloutCell(f, S.env)}</td>
      <td><div class="ff-pres">${prereqChips(f)}</div></td>
      <td>${avatar(f.owner, 'sm')}</td>
      <td><span class="ff-eval ${/day/.test(f.lastEval) ? 'cold' : ''}">${f.lastEval}<small>${f.evals ? fmt(f.evals) + ' evals / 24h' : 'no traffic'}</small></span></td>
      <td class="ff-c-sw">${sw(e.on, `data-sw aria-label="${f.key} in ${envName(S.env)}"`, `ff-bigsw ${f.type === 'kill' ? 'kill' : ''} ${pend ? 'pend' : ''}`)}</td>
      <td><button class="icon-btn-sm" data-menu aria-label="Actions for ${f.key}"><i data-lucide="ellipsis-vertical"></i></button></td>
    </tr>`;
  }
  function paintRows(sec, anim) {
    const list = filtered(), tb = $('[data-rows]', sec);
    tb.innerHTML = list.length ? list.map(rowHtml).join('') : `<tr class="ff-emptyrow"><td colspan="10"><div class="empty-state ff-empty"><span class="icon-well lg"><i data-lucide="flag-off"></i></span><b>No flags match</b><small>Try clearing a filter or the search.</small><button class="btn secondary sm" data-clear>Clear filters</button></div></td></tr>`;
    if (anim !== false) tb.classList.add('ff-rows-in');
    setTimeout(() => tb.classList.remove('ff-rows-in'), 800);
    FS.icons(tb);
    const tot = live().length;
    $('[data-showing]', sec).innerHTML = `Showing <b>${list.length}</b> of ${tot} flags${S.filter.stage === 'archived' ? ' (archived)' : ''}`;
    const c = $('[data-ff-count]', sec); if (c) c.textContent = tot;
  }
  function paintEnv(sec) {
    const p = $('.ff-flagpanel', sec); p.dataset.env = S.env;
    $$('.ff-envsw button', sec).forEach((b) => { const on = b.dataset.env === S.env; b.classList.toggle('active', on); b.setAttribute('aria-checked', on); });
    $('[data-swh]', sec).textContent = envName(S.env);
    $('[data-prodnote]', sec).hidden = S.env !== 'production';
    const L = live(), on = L.filter((f) => f.envs[S.env].on).length;
    $('[data-envmeta]', sec).innerHTML = `<span class="pill"><i data-lucide="toggle-right"></i><b>${on}</b>&nbsp;of ${L.length} serving</span><span class="pill ff-keypill" title="Server-side SDK key"><i data-lucide="key-round"></i><code>${mask(keyFor(S.env, 'server'))}</code></span>${S.env === 'production' ? '<span class="pill ff-lock"><i data-lucide="lock"></i>Approvals required</span>' : `<span class="pill"><i data-lucide="zap"></i>Changes apply instantly</span>`}`;
    FS.icons($('[data-envmeta]', sec));
  }
  function updateRow(sec, f, doFlash = true) {
    const tr = $(`tr[data-key="${f.key}"]`, sec); if (!tr) return;
    const i = $$('[data-rows] tr', sec).indexOf(tr);
    const tmp = document.createElement('tbody'); tmp.innerHTML = rowHtml(f, i);
    const n = tmp.firstElementChild; tr.replaceWith(n); FS.icons(n); if (doFlash) flash(n);
  }
  function refreshAll(sec) { paintKpis(sec); paintEnv(sec); }

  async function toggleFlag(sec, f, want) {
    const env = S.env;
    if (f.pending[env]) {
      FS.toast(`<b class="ff-mono">${f.key}</b> already has ${f.pending[env]} waiting for approval`, { tone: 'warn', action: { label: 'Review', fn: () => { S.crOpen = f.pending[env]; FS.go('admin/change-requests'); } } });
      return;
    }
    if (f.type === 'kill') {
      const ok = await killConfirm(f, env, want);
      if (!ok) return;
      const d = getD(f, env), before = snap(f, d);
      d.on = want; sync(f, env); f.lastEval = 'just now';
      audit(f, { env, what: `Kill switch ${want ? 'restored' : 'flipped OFF'} in ${envName(env)}${env === 'production' ? ' (emergency, bypassed approval)' : ''}`, icon: 'power', tone: want ? 'good' : 'danger', before, after: snap(f, d) });
      updateRow(sec, f); refreshAll(sec);
      FS.toast(want ? `<b class="ff-mono">${f.key}</b> restored in ${envName(env)}` : `<b class="ff-mono">${f.key}</b> is OFF in ${envName(env)}. On-call has been paged.`, { tone: want ? 'good' : 'danger', ms: 5000 });
      return;
    }
    if (env === 'production') {
      const nd = clone(getD(f, env)); nd.on = want;
      const cr = await changeRequestModal(f, env, nd, { title: `${want ? 'Turn on' : 'Turn off'} ${f.key} in Production` });
      if (cr) { updateRow(sec, f); refreshAll(sec); }
      return;
    }
    const d = getD(f, env), before = snap(f, d);
    d.on = want; sync(f, env);
    audit(f, { env, what: `Targeting turned ${want ? 'ON' : 'OFF'} in ${envName(env)}`, icon: 'power', tone: want ? 'good' : 'warn', before, after: snap(f, d) });
    updateRow(sec, f); refreshAll(sec);
    FS.toast(`<b class="ff-mono">${f.key}</b> ${want ? 'ON' : 'OFF'} in ${envName(env)}`, { tone: want ? 'good' : 'warn', undo: () => { d.on = !want; sync(f, env); updateRow(sec, f); refreshAll(sec); } });
  }

  function bindFeatures(sec) {
    const mount = $('[data-ff-mount]', sec);
    mount.addEventListener('click', (e) => {
      const t = e.target;
      const tab = t.closest('[data-ff-tab]');
      if (tab) {
        S.tab = tab.dataset.ffTab;
        $$('[data-ff-tab]', sec).forEach((b) => b.classList.toggle('active', b === tab));
        $$('[data-ff-pane]', sec).forEach((p) => { const on = p.dataset.ffPane === S.tab; p.hidden = !on; if (on) { p.classList.remove('ff-pane-in'); void p.offsetWidth; p.classList.add('ff-pane-in'); } });
        FS.positionInk($('.ff-tabs', sec));
        return;
      }
      const envB = t.closest('.ff-envsw [data-env]');
      if (envB && envB.dataset.env !== S.env) {
        S.env = envB.dataset.env;
        const w = $('.ff-twrap', sec);
        w.classList.remove('ff-swap'); void w.offsetWidth; w.classList.add('ff-swap');
        paintEnv(sec);
        setTimeout(() => paintRows(sec, false), reduce() ? 0 : 140);
        return;
      }
      const kp = t.closest('[data-kpi]');
      if (kp) {
        const k = kp.dataset.kpi;
        if (k === 'pending') { FS.go('admin/change-requests'); return; }
        if (k === 'stale') { S.filter.stale = !S.filter.stale; $('[data-f=stale]', sec).checked = S.filter.stale; paintRows(sec); return; }
        if (k === 'kill') { S.filter.type = S.filter.type === 'kill' ? '' : 'kill'; $('[data-f=type]', sec).value = S.filter.type; paintRows(sec); return; }
        return;
      }
      const chip = t.closest('[data-chips] > button');
      if (chip) {
        const grp = chip.parentElement; $$(':scope > button', grp).forEach((b) => b.classList.toggle('active', b === chip));
        S.filter[grp.dataset.chips] = chip.dataset.v; paintRows(sec); return;
      }
      if (t.closest('[data-clear]')) { clearFilters(sec); return; }
      const mb = t.closest('[data-menu]');
      if (mb) { rowMenu(sec, mb); return; }
      const tr = t.closest('[data-rows] tr[data-key]');
      if (tr && !t.closest('label, button, a, input, select')) openFlag(tr.dataset.key, S.env);
      const rev = t.closest('[data-reveal]');
      if (rev) { const k = rev.closest('[data-sdk]'); const code = $('code', k); const shown = k.classList.toggle('shown'); code.textContent = shown ? k.dataset.val : mask(k.dataset.val); rev.innerHTML = `<i data-lucide="${shown ? 'eye-off' : 'eye'}"></i>`; FS.icons(rev); return; }
      const cp = t.closest('[data-copy]');
      if (cp) { copy(cp.closest('[data-sdk]') ? cp.closest('[data-sdk]').dataset.val : cp.dataset.copy, cp.closest('[data-sdk]') ? 'Key copied to clipboard' : undefined); return; }
      const rot = t.closest('[data-rotate]');
      if (rot) { rotateKey(sec, rot.closest('[data-sdk]')); return; }
      const modOff = t.closest('[data-modmin]');
      if (modOff) return;
    });
    mount.addEventListener('keydown', (e) => {
      const tr = e.target.closest && e.target.closest('[data-rows] tr[data-key]');
      if (tr && e.key === 'Enter' && e.target === tr) openFlag(tr.dataset.key, S.env);
      const kp = e.target.closest && e.target.closest('[data-kpi]');
      if (kp && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); kp.click(); }
    });
    mount.addEventListener('input', (e) => { if (e.target.dataset.f === 'q') { S.filter.q = e.target.value.trim(); paintRows(sec, false); } });
    mount.addEventListener('change', (e) => {
      const t = e.target;
      if (t.dataset.f === 'type' || t.dataset.f === 'owner') { S.filter[t.dataset.f] = t.value; paintRows(sec); return; }
      if (t.dataset.f === 'stale') { S.filter.stale = t.checked; paintRows(sec); return; }
      if (t.matches('[data-sw]')) {
        const f = flagBy(t.closest('tr').dataset.key), want = t.checked;
        t.checked = !want; // nothing applies until confirmed
        toggleFlag(sec, f, want);
        return;
      }
      if (t.matches('[data-mod-plan]')) { modPlanToggle(sec, t); return; }
      if (t.matches('[data-mod-min]')) { modMinChange(sec, t); return; }
      if (t.matches('[data-mod-on]')) { modGlobal(sec, t); }
    });
    // header button
    $('[data-ff-act="new-flag"]', sec).addEventListener('click', () => newFlagWizard(sec));
  }
  function clearFilters(sec) {
    S.filter = { q: '', cat: '', type: '', stage: '', owner: '', stale: false };
    $('[data-f=q]', sec).value = ''; $('[data-f=type]', sec).value = ''; $('[data-f=owner]', sec).value = ''; $('[data-f=stale]', sec).checked = false;
    $$('[data-chips] > button', sec).forEach((b) => b.classList.toggle('active', b.dataset.v === ''));
    paintRows(sec);
  }
  function openFlag(key, env) { S.cur = key; S.curEnv = env || S.env; FS.go('admin/features/view'); }
  function rowMenu(sec, btn) {
    const f = flagBy(btn.closest('tr').dataset.key);
    FS.menu(btn, [
      { label: 'Open', icon: 'external-link', onClick: () => openFlag(f.key) },
      { label: 'Duplicate', icon: 'copy-plus', onClick: () => duplicateFlag(sec, f) },
      { label: 'Copy key', icon: 'clipboard-copy', onClick: () => copy(f.key) },
      { sep: true },
      f.stage === 'archived'
        ? { label: 'Restore', icon: 'archive-restore', onClick: () => { f.stage = 'cleanup'; paintRows(sec); refreshAll(sec); FS.toast(`${f.key} restored to Cleanup`, { tone: 'good' }); } }
        : { label: 'Archive', icon: 'archive', danger: true, onClick: () => archiveFlag(sec, f) },
    ]);
  }
  function duplicateFlag(sec, f) {
    let k = f.key + '_copy', n = 2; while (flagBy(k)) k = f.key + '_copy' + n++;
    const c = clone(f); c.key = k; c.name = f.name + ' (copy)'; c.stage = 'define'; c.pending = {}; c.stale = ''; c.evals = 0; c.lastEval = 'never'; c.created = c.updated = '01 Oct 2026'; c.owner = ME;
    ENVS.forEach(([e]) => { c.envs[e].on = false; });
    S.flags.splice(S.flags.indexOf(f) + 1, 0, c);
    paintRows(sec, false); refreshAll(sec);
    flash($(`tr[data-key="${k}"]`, sec));
    FS.toast(`Duplicated as <b class="ff-mono">${k}</b> (off everywhere)`, { tone: 'good' });
  }
  async function archiveFlag(sec, f) {
    const live100 = f.envs.production.on && f.envs.production.pct === 100;
    const ok = await FS.confirm({ title: `Archive ${f.key}?`, text: live100 ? 'It still serves 100% in Production. Archiving stops evaluations, so remove the code references first.' : 'Archived flags stop evaluating and are hidden from the list. You can restore them later.', okLabel: 'Archive flag', danger: true, icon: 'archive' });
    if (!ok) return;
    const tr = $(`tr[data-key="${f.key}"]`, sec);
    const done = () => { const prev = f.stage; f.stage = 'archived'; paintRows(sec, false); refreshAll(sec); audit(f, { env: 'all', what: 'Flag archived', icon: 'archive', tone: 'warn', before: { stage: prev }, after: { stage: 'archived' } }); FS.toast(`<b class="ff-mono">${f.key}</b> archived`, { tone: 'warn', undo: () => { f.stage = prev; paintRows(sec); refreshAll(sec); } }); };
    if (tr) { tr.classList.add('row-out', 'ff-row-out'); setTimeout(done, reduce() ? 0 : 340); } else done();
  }

  /* ---------- core modules tab */
  function modulesHtml() {
    return `<div class="banner ff-banner"><i data-lucide="info"></i><div><b>Core modules are global switches.</b> Turning one off hides it for every tenant on that plan. What each plan includes commercially lives in <a class="link" href="#/admin/entitlements">Plan Entitlements</a>.</div></div>
    <div class="panel flush"><div class="panel-head"><div><h3>Modules by plan</h3><p>${MODULES.length} modules · changes are logged to the platform audit log</p></div></div>
    <div class="table-wrap"><table class="tbl ff-modtbl" data-plain data-no-qv><thead><tr><th>Module</th><th>Key</th><th class="num">Tenants using</th><th>Minimum plan</th>${PLANS.map((p) => `<th class="ff-c-plan">${planPill(p)}</th>`).join('')}<th>Enabled</th></tr></thead>
    <tbody>${MODULES.map((m, i) => `<tr data-mod="${i}" class="${m.on ? '' : 'ff-modoff'}"><td><div class="ff-modname"><span class="icon-well sm"><i data-lucide="${m.icon}"></i></span><b>${m.name}</b>${m.locked ? '<span class="badge neutral"><i data-lucide="lock"></i>Core</span>' : ''}</div></td><td><code class="ff-key">${m.key}</code></td><td class="num" data-used>${m.used}</td>
      <td><select data-mod-min="${i}" ${m.locked ? 'disabled' : ''} aria-label="Minimum plan for ${m.name}">${PLANS.map((p) => `<option ${p === m.min ? 'selected' : ''}>${p}</option>`).join('')}</select></td>
      ${PLANS.map((p, k) => `<td class="ff-c-plan">${sw(m.plans[k], `data-mod-plan="${i}" data-p="${k}" ${m.locked ? 'disabled' : ''} aria-label="${m.name} on ${p}"`, 'ff-smsw')}</td>`).join('')}
      <td>${sw(m.on, `data-mod-on="${i}" ${m.locked ? 'disabled' : ''} aria-label="${m.name} enabled"`)}</td></tr>`).join('')}</tbody></table></div></div>`;
  }
  function modPlanToggle(sec, t) {
    const m = MODULES[+t.dataset.modPlan], k = +t.dataset.p;
    m.plans[k] = t.checked;
    const n = planCount(PLANS[k]);
    FS.toast(`${m.name} ${t.checked ? 'enabled' : 'disabled'} for ${PLANS[k]} · ${n} tenants`, { tone: t.checked ? 'good' : 'warn', undo: () => { m.plans[k] = !t.checked; t.checked = !t.checked; } });
  }
  function modMinChange(sec, sel) {
    const i = +sel.dataset.modMin, m = MODULES[i], idx = PLANS.indexOf(sel.value);
    m.min = sel.value; m.plans = PLANS.map((p, k) => k >= idx);
    const tr = sel.closest('tr');
    $$('[data-mod-plan]', tr).forEach((c, k) => { if (c.checked !== m.plans[k]) { c.checked = m.plans[k]; flash(c.closest('td')); } });
    FS.toast(`${m.name} now starts at ${sel.value}`, { tone: 'info' });
  }
  async function modGlobal(sec, t) {
    const m = MODULES[+t.dataset.modOn], want = t.checked;
    if (!want) {
      t.checked = true;
      const ok = await FS.confirm({ title: `Turn off ${m.name}?`, text: `${m.name} disappears for all ${m.used} tenants using it. Data is kept and comes back when you switch it on.`, okLabel: 'Turn off', danger: true });
      if (!ok) return;
      t.checked = false;
    }
    m.on = want; t.closest('tr').classList.toggle('ff-modoff', !want);
    FS.toast(`${m.name} ${want ? 'enabled' : 'disabled'} for all tenants`, { tone: want ? 'good' : 'warn', undo: () => { m.on = !want; t.checked = !want; t.closest('tr').classList.toggle('ff-modoff', want); } });
  }

  /* ---------- SDK keys tab */
  function sdkRow(env, kind, label, hint, secret) {
    const v = keyFor(env, kind);
    return `<div class="ff-sdk" data-sdk data-env="${env}" data-kind="${kind}" data-val="${v}"><div class="ff-sdk-l"><b>${label}</b><small>${hint}</small></div>
      <div class="ff-sdk-v"><code>${secret ? mask(v) : v}</code>${secret ? '<button class="icon-btn-sm" data-reveal aria-label="Reveal"><i data-lucide="eye"></i></button>' : ''}<button class="icon-btn-sm" data-copy aria-label="Copy"><i data-lucide="copy"></i></button>${kind !== 'client' ? '<button class="icon-btn-sm" data-rotate aria-label="Rotate"><i data-lucide="refresh-cw"></i></button>' : ''}</div></div>`;
  }
  function sdkHtml() {
    return `<div class="ff-sdkgrid">${ENVS.map(([k, n]) => `<div class="panel ff-envcard e-${k}"><div class="ff-envcard-h"><span class="ff-env-dot e-${k}"></span><div><h3>${n}</h3><p>${k === 'production' ? 'Live tenants · approvals on' : k === 'staging' ? 'Pre-release QA · mirrors prod data shape' : 'Engineers & CI · anything goes'}</p></div><span class="badge ${k === 'production' ? 'danger' : k === 'staging' ? 'warn' : 'info'}">${k === 'production' ? 'Protected' : k === 'staging' ? 'Shared' : 'Open'}</span></div>
      ${sdkRow(k, 'server', 'Server-side SDK key', 'Secret. Node, .NET and Go services only.', true)}${sdkRow(k, 'client', 'Client-side ID', 'Safe in the browser bundle.', false)}${sdkRow(k, 'mobile', 'Mobile key', 'Android, iOS and the booker app.', true)}
      <div class="ff-sdk-foot"><span><i data-lucide="activity"></i>${fmt(k === 'production' ? 1284110 : k === 'staging' ? 84210 : 23118)} evaluations today</span><span>Rotated ${k === 'production' ? '62' : k === 'staging' ? '14' : '3'} days ago</span></div></div>`).join('')}</div>
    <div class="panel"><div class="panel-head"><div><h3>Quick start</h3><p>Evaluate a flag for a tenant. Bucketing is sticky on <code class="ff-key">tenant.id</code>, so a tenant never flips between variations.</p></div><button class="btn ghost sm" data-copy="import { init } from '@finsoft/flags-node';"><i data-lucide="copy"></i>Copy</button></div>
    <pre class="ff-code"><span class="c">// server.ts</span>
<span class="k">import</span> { init } <span class="k">from</span> <span class="s">'@finsoft/flags-node'</span>;
<span class="k">const</span> flags = init(process.env.<span class="v">FINSOFT_SDK_KEY</span>);

<span class="k">const</span> ctx = { key: tenant.id, plan: tenant.plan, city: tenant.city, appVersion: <span class="s">'4.12.1'</span> };
<span class="k">if</span> (<span class="k">await</span> flags.variation(<span class="s">'wholesale_quick_entry_grid'</span>, ctx, <span class="v">false</span>)) {
  renderQuickEntryGrid();
}</pre></div>`;
  }
  async function rotateKey(sec, row) {
    const env = row.dataset.env, kind = row.dataset.kind;
    const ok = await FS.confirm({ title: `Rotate the ${envName(env)} ${kind === 'server' ? 'server' : 'mobile'} key?`, text: 'A new key is issued now. The old one keeps working for 24 hours so you can redeploy.', okLabel: 'Rotate key', danger: env === 'production', icon: 'refresh-cw' });
    if (!ok) return;
    const btn = $('[data-rotate]', row); btn.classList.add('ff-spinning');
    await wait(700);
    ENV_KEYS[env + kind] = Array.from({ length: 28 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
    const v = keyFor(env, kind); row.dataset.val = v;
    $('code', row).textContent = row.classList.contains('shown') ? v : mask(v);
    btn.classList.remove('ff-spinning'); flash(row);
    if (S.env === env) paintEnv(sec);
    FS.toast(`${envName(env)} ${kind} key rotated · old key expires in 24 h`, { tone: 'good' });
  }

  /* ---------- new flag wizard (sheet) */
  const snake = (s) => s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^[0-9_]+/, '').slice(0, 60);
  function keyError(k) {
    if (!k) return 'Key is required';
    if (!/^[a-z]/.test(k)) return 'Start with a lowercase letter';
    if (/[^a-z0-9_]/.test(k)) return 'Use snake_case: a–z, 0–9 and _ only';
    if (/__/.test(k) || /_$/.test(k)) return 'No double or trailing underscores';
    if (k.length < 3) return 'At least 3 characters';
    if (flagBy(k)) return 'A flag with this key already exists';
    return '';
  }
  function newFlagWizard(sec) {
    const W = { step: 0, type: '', name: '', key: '', keyTouched: false, desc: '', tags: [], cat: 'Sales', varKind: 'bool', mvars: [['Control', 'control'], ['Treatment', 'treatment']], owner: ME, temporary: true, expiry: isoD(addDays(90)) };
    const STEPS = ['Type', 'Details', 'Variations', 'Ownership', 'Review'];
    const sh = FS.sheet({ title: 'New feature flag', subtitle: 'Flags start OFF in every environment. Production changes will need approval.', html: '<div class="ff-wiz"><ol class="ff-wsteps"></ol><div class="ff-wbody"></div></div>', foot: '<button class="btn secondary" data-wb>Cancel</button><span class="spacer"></span><span class="ff-wcount"></span><button class="btn primary" data-wn>Next<i data-lucide="arrow-right"></i></button>' });
    sh.classList.add('ff-sheet');
    const body = $('.ff-wbody', sh), steps = $('.ff-wsteps', sh), back = $('[data-wb]', sh), next = $('[data-wn]', sh);
    const vars = () => (W.varKind === 'bool' ? [['On', 'true'], ['Off', 'false']] : W.mvars);
    const keyMsg = () => { const e = keyError(W.key); return `<small class="ff-keymsg ${W.key ? (e ? 'bad' : 'ok') : ''}"><i data-lucide="${W.key && !e ? 'circle-check' : 'info'}"></i>${W.key ? (e || 'Looks good. This is what engineers type in code.') : 'Generated from the name. snake_case, unique, cannot change later.'}</small>`; };
    const paint = (dir = 1) => {
      steps.innerHTML = STEPS.map((s, i) => `<li class="${i < W.step ? 'done' : i === W.step ? 'cur' : ''}"><span>${i < W.step ? '<i data-lucide="check"></i>' : i + 1}</span>${s}</li>`).join('');
      let h = '';
      if (W.step === 0) {
        h = `<p class="ff-wlead">What kind of flag is this? The type sets sensible defaults for lifecycle and expiry.</p><div class="ff-tcards">${Object.entries(TYPES).map(([k, t]) => `<button type="button" class="ff-tcard t-${k} ${W.type === k ? 'on' : ''}" data-type="${k}" aria-pressed="${W.type === k}"><span class="ff-ficon t-${k}"><i data-lucide="${t.icon}"></i></span><b>${t.label}</b><small>${t.blurb}</small><span class="ff-ttag ${t.temp ? 'temp' : ''}">${t.temp ? 'Temporary' : 'Permanent'}</span></button>`).join('')}</div>`;
      } else if (W.step === 1) {
        h = `<div class="form-grid">
          <label class="full"><span>Name *</span><input data-w="name" value="${esc(W.name)}" placeholder="e.g. Raast QR on invoices" maxlength="80"></label>
          <label class="full"><span>Key *</span><div class="ff-keyin"><i data-lucide="key-round"></i><input data-w="key" value="${esc(W.key)}" placeholder="raast_qr_on_invoices" spellcheck="false" autocomplete="off"></div>${keyMsg()}</label>
          <label><span>Category</span><select data-w="cat">${CATS.map((c) => `<option ${c === W.cat ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
          <label><span>Tags</span><div class="ff-tagin">${W.tags.map((t) => `<span class="ff-vchip">${esc(t)}<button type="button" data-rmtag="${esc(t)}" aria-label="Remove tag"><i data-lucide="x"></i></button></span>`).join('')}<input data-w="tag" placeholder="${W.tags.length ? '' : 'Type and press Enter'}"></div></label>
          <label class="full"><span>Description</span><textarea data-w="desc" rows="2" placeholder="What does it gate, and who asked for it?">${esc(W.desc)}</textarea></label></div>`;
      } else if (W.step === 2) {
        h = `<div class="seg ff-vkind"><button type="button" class="${W.varKind === 'bool' ? 'active' : ''}" data-vk="bool"><svg data-lucide="toggle-right"></svg>Boolean</button><button type="button" class="${W.varKind === 'multi' ? 'active' : ''}" data-vk="multi"><svg data-lucide="list"></svg>Multivariate</button></div>
          <p class="ff-wlead">${W.varKind === 'bool' ? 'Two variations: serve <b>On</b> to targeted tenants, <b>Off</b> to everyone else.' : 'Two or more string variations, e.g. for an A/B/n experiment. Bucketing stays sticky by tenant ID.'}</p>
          <div class="ff-varlist">${vars().map(([n, v], i) => `<div class="ff-varrow" style="--i:${i}"><span class="ff-vsw v${i % 4}"></span><input data-vn="${i}" value="${esc(n)}" ${W.varKind === 'bool' ? 'readonly' : ''} aria-label="Variation name"><input data-vv="${i}" class="ff-mono-in" value="${esc(v)}" ${W.varKind === 'bool' ? 'readonly' : ''} aria-label="Variation value">${W.varKind === 'multi' && W.mvars.length > 2 ? `<button type="button" class="icon-btn-sm" data-rmv="${i}" aria-label="Remove"><i data-lucide="x"></i></button>` : ''}</div>`).join('')}</div>
          ${W.varKind === 'multi' ? '<button type="button" class="ff-addrule" data-addv><i data-lucide="plus"></i>Add variation</button>' : ''}`;
      } else if (W.step === 3) {
        h = `<div class="form-grid">
          <label><span>Owner *</span><select data-w="owner">${STAFF.map((s) => `<option ${s === W.owner ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
          <label><span>Expiry date ${W.temporary ? '*' : ''}</span><input type="date" data-w="expiry" value="${W.expiry}" min="${isoD(addDays(1))}" ${W.temporary ? '' : 'disabled'}></label>
          <div class="full ff-tempbox ${W.temporary ? 'temp' : ''}"><label class="switch"><input type="checkbox" data-w="temporary" ${W.temporary ? 'checked' : ''}><i></i><span>Temporary flag</span></label><small>${W.temporary ? 'Becomes <b>stale</b> 60 days after it reaches 100% or on its expiry date, and the owner gets a cleanup reminder.' : 'Permanent flags (kill switches, ops, entitlements) never go stale.'}</small></div></div>`;
      } else {
        const t = TYPES[W.type];
        h = `<div class="ff-review"><div class="ff-rhead"><span class="ff-ficon t-${W.type} lg"><i data-lucide="${t.icon}"></i></span><div><code class="ff-key lg">${W.key}</code><b>${esc(W.name)}</b><small>${esc(W.desc || 'No description')}</small></div></div>
          <div class="dl ff-rdl"><div><span>Type</span><b>${typeBadge(W.type, 1)}</b></div><div><span>Category</span><b>${W.cat}</b></div><div><span>Variations</span><b>${vars().map((v) => esc(v[0])).join(' · ')}</b></div><div><span>Owner</span><b>${avatar(W.owner)} ${W.owner}</b></div><div><span>Lifecycle</span><b>${W.temporary ? 'Temporary · expires ' + fmtD(fromIso(W.expiry)) : 'Permanent'}</b></div><div><span>Tags</span><b>${W.tags.length ? W.tags.map((x) => `<span class="ff-vchip">${esc(x)}</span>`).join(' ') : '—'}</b></div></div>
          <div class="ff-renvs">${ENVS.map(([k, n]) => `<span><span class="ff-env-dot e-${k}"></span>${n}<b>OFF</b></span>`).join('')}</div>
          <pre class="ff-code sm"><span class="k">if</span> (<span class="k">await</span> flags.variation(<span class="s">'${W.key}'</span>, ctx, <span class="v">${W.varKind === 'bool' ? 'false' : `'${esc(W.mvars[0][1])}'`}</span>)) { … }</pre></div>`;
      }
      body.innerHTML = `<div class="ff-wpane" style="--dir:${dir}">${h}</div>`;
      back.textContent = W.step ? 'Back' : 'Cancel';
      next.innerHTML = W.step === 4 ? '<i data-lucide="flag"></i>Create flag' : 'Next<i data-lucide="arrow-right"></i>';
      $('.ff-wcount', sh).textContent = `Step ${W.step + 1} of 5`;
      FS.icons(sh);
      const f = $('input:not([readonly]):not([type=checkbox]),textarea', body); if (f && W.step === 1) f.focus();
    };
    const valid = () => {
      if (W.step === 0 && !W.type) { shake($('.ff-tcards', body)); FS.toast('Pick a flag type', { tone: 'warn' }); return false; }
      if (W.step === 1) {
        const n = $('[data-w=name]', body), k = $('[data-w=key]', body);
        if (!W.name.trim()) { n.classList.add('ff-invalid'); shake(n.closest('label')); n.focus(); return false; }
        if (keyError(W.key)) { k.classList.add('ff-invalid'); shake(k.closest('label')); k.focus(); return false; }
      }
      if (W.step === 2 && W.varKind === 'multi') {
        const vals = W.mvars.map((v) => v[1].trim());
        if (vals.some((v) => !v) || new Set(vals).size !== vals.length) { shake($('.ff-varlist', body)); FS.toast('Variation values must be filled in and unique', { tone: 'warn' }); return false; }
      }
      if (W.step === 3 && W.temporary && !W.expiry) { shake($('[data-w=expiry]', body).closest('label')); return false; }
      return true;
    };
    sh.addEventListener('click', async (e) => {
      const t = e.target;
      const tc = t.closest('[data-type]');
      if (tc) { W.type = tc.dataset.type; W.temporary = TYPES[W.type].temp; if (W.type === 'experiment') W.varKind = 'multi'; $$('.ff-tcard', body).forEach((b) => { b.classList.toggle('on', b === tc); b.setAttribute('aria-pressed', b === tc); }); setTimeout(() => { if (W.step === 0) { W.step = 1; paint(1); } }, reduce() ? 0 : 260); return; }
      const vk = t.closest('[data-vk]'); if (vk) { W.varKind = vk.dataset.vk; paint(0); return; }
      if (t.closest('[data-addv]')) { const n = W.mvars.length; W.mvars.push([`Variant ${String.fromCharCode(65 + n - 1)}`, `variant_${String.fromCharCode(97 + n - 1)}`]); paint(0); return; }
      const rv = t.closest('[data-rmv]'); if (rv) { W.mvars.splice(+rv.dataset.rmv, 1); paint(0); return; }
      const rt = t.closest('[data-rmtag]'); if (rt) { W.tags = W.tags.filter((x) => x !== rt.dataset.rmtag); paint(0); $('[data-w=tag]', body).focus(); return; }
      if (t.closest('[data-wb]')) { if (W.step === 0) { closeOf(sh); return; } W.step--; paint(-1); return; }
      if (t.closest('[data-wn]')) {
        if (!valid()) return;
        if (W.step < 4) { W.step++; paint(1); return; }
        await busy(next, 900, 'Creating…');
        const nf = F(W.key, W.name.trim(), W.type, W.cat, 'define', W.owner, W.desc.trim() || 'No description yet.', '000', 0, { tags: W.tags, variations: vars().map((v) => v.slice()), temporary: W.temporary, expiry: W.temporary ? fmtD(fromIso(W.expiry)) : '', created: '01 Oct 2026', updated: '01 Oct 2026', evals: 0, lastEval: 'never' });
        nf.stage = 'define'; nf.fresh = true;
        S.flags.unshift(nf);
        audit(nf, { env: 'all', what: 'Flag created', icon: 'flag', tone: 'good', before: {}, after: { key: nf.key, type: nf.type, temporary: nf.temporary, variations: nf.variations.map((v) => v[0]) } });
        closeOf(sh);
        clearFilters(sec);
        refreshAll(sec);
        const tr = $(`tr[data-key="${nf.key}"]`, sec);
        if (tr) { tr.classList.add('ff-newrow'); flash(tr); tr.scrollIntoView({ block: 'center', behavior: reduce() ? 'auto' : 'smooth' }); setTimeout(() => FS.celebrate($('.ff-key', tr)), 250); }
        FS.toast(`Flag <b class="ff-mono">${nf.key}</b> created · OFF in all environments`, { tone: 'good', action: { label: 'Set up targeting', fn: () => openFlag(nf.key, 'dev') } });
      }
    });
    sh.addEventListener('input', (e) => {
      const t = e.target, w = t.dataset.w;
      if (w === 'name') { W.name = t.value; t.classList.remove('ff-invalid'); if (!W.keyTouched) { W.key = snake(t.value); const k = $('[data-w=key]', body); k.value = W.key; refreshKey(); } }
      if (w === 'key') { W.keyTouched = true; const pos = t.selectionStart; W.key = t.value.toLowerCase().replace(/[\s-]/g, '_'); if (t.value !== W.key) { t.value = W.key; t.setSelectionRange(pos, pos); } t.classList.remove('ff-invalid'); refreshKey(); }
      if (w === 'desc') W.desc = t.value;
      if (t.dataset.vn) W.mvars[+t.dataset.vn][0] = t.value;
      if (t.dataset.vv) W.mvars[+t.dataset.vv][1] = t.value;
    });
    const refreshKey = () => { const m = $('.ff-keymsg', body); if (m) { m.outerHTML = keyMsg(); FS.icons(body); } const k = $('[data-w=key]', body); if (k) k.classList.toggle('ff-ok', !!W.key && !keyError(W.key)); };
    sh.addEventListener('change', (e) => {
      const t = e.target, w = t.dataset.w;
      if (w === 'cat') W.cat = t.value;
      if (w === 'owner') W.owner = t.value;
      if (w === 'expiry') W.expiry = t.value;
      if (w === 'temporary') { W.temporary = t.checked; paint(0); }
    });
    sh.addEventListener('keydown', (e) => {
      const t = e.target;
      if (t.dataset.w === 'tag' && e.key === 'Enter') { e.preventDefault(); const v = snake(t.value); if (v && !W.tags.includes(v)) { W.tags.push(v); paint(0); $('[data-w=tag]', body).focus(); } else t.value = ''; }
      else if (t.dataset.w === 'tag' && e.key === 'Backspace' && !t.value && W.tags.length) { W.tags.pop(); paint(0); $('[data-w=tag]', body).focus(); }
      else if (e.key === 'Enter' && t.tagName === 'INPUT' && W.step !== 4) { e.preventDefault(); next.click(); }
    });
    paint();
  }

  /* ================================================================ 2 · admin/features/view */
  const V = { key: '', env: '', d: null, base: '' };
  const vDirty = () => V.d && JSON.stringify(V.d) !== V.base;
  function renderDetail(sec) {
    const f = flagBy(S.cur) || flagBy('wholesale_quick_entry_grid');
    S.cur = f.key;
    const env = S.curEnv;
    V.key = f.key; V.env = env; V.d = clone(getD(f, env)); V.base = JSON.stringify(V.d);
    const mount = $('[data-ff-mount]', sec);
    const pend = f.pending[env];
    mount.innerHTML = `
      <div class="page-head ff-dhead">
        <div>
          <div class="eyebrow"><a class="link" href="#/admin/features">Feature Flags</a> / ${f.cat}</div>
          <h1>${esc(f.name)}</h1>
          <div class="ff-dkey"><code class="ff-key lg">${f.key}</code><button class="icon-btn-sm" data-copykey aria-label="Copy key"><i data-lucide="copy"></i></button>${typeBadge(f.type)}${f.type2 ? typeBadge(f.type2) : ''}${f.temporary ? '<span class="pill"><i data-lucide="timer"></i>Temporary</span>' : '<span class="pill"><i data-lucide="infinity"></i>Permanent</span>'}${f.stale ? `<span class="ff-stalei lg" title="${esc(f.stale)}"><i data-lucide="hourglass"></i>Stale</span>` : ''}</div>
        </div>
        <div class="head-actions">
          <select data-pick aria-label="Switch flag">${S.flags.filter((x) => x.stage !== 'archived' || x.key === f.key).map((x) => `<option value="${x.key}" ${x.key === f.key ? 'selected' : ''}>${x.key}</option>`).join('')}</select>
          <a class="btn secondary" href="#/admin/features"><i data-lucide="arrow-left"></i>All flags</a>
        </div>
      </div>
      ${f.stale ? `<div class="banner warn ff-banner"><i data-lucide="hourglass"></i><div><b>This flag looks stale.</b> ${esc(f.stale)}</div><button class="btn sm secondary" data-stage="cleanup">Move to Cleanup</button></div>` : ''}
      <div class="panel ff-lifecycle"><div class="ff-lc-h"><b>Lifecycle</b><small>Click a stage to move the flag. Temporary flags should end in Archived.</small></div>
        ${stepperHtml(f)}</div>
      <div class="ff-envtabs" role="tablist">${ENVS.map(([k, n]) => { const e = f.envs[k]; return `<button type="button" role="tab" class="e-${k} ${k === env ? 'active' : ''}" data-denv="${k}" aria-selected="${k === env}"><span class="ff-env-dot e-${k}"></span><b>${n}</b><em class="${e.on ? 'on' : ''}">${e.on ? (e.pct != null ? e.pct + '%' : 'On') : 'Off'}</em>${f.pending[k] ? '<i class="ff-pdot" title="Change pending"></i>' : ''}</button>`; }).join('')}<span class="spacer"></span><span class="ff-servedpill" data-served></span></div>
      <div class="split ff-dsplit">
        <div class="ff-dmain">
          ${pend ? `<div class="banner ff-banner ff-pendbanner"><i data-lucide="git-pull-request"></i><div><b>${pend} is waiting for approval.</b> The targeting below is what is live now. Your request applies when a second admin approves it.</div><button class="btn sm secondary" data-gocr="${pend}">Review</button></div>` : ''}
          <div class="panel ff-targeting e-${env}">
            <div class="ff-tgt-h"><div><h3>Targeting <span class="ff-envchip e-${env}"><span class="ff-env-dot e-${env}"></span>${envName(env)}</span></h3><p>Evaluated top to bottom: prerequisites, individual targets, rules, then the default rule.</p></div>
              <label class="switch ff-bigsw ff-tgtsw ${f.type === 'kill' ? 'kill' : ''}"><input type="checkbox" data-don ${V.d.on ? 'checked' : ''}><i></i><span data-donl>${V.d.on ? 'On' : 'Off'}</span></label></div>
            <div class="ff-offnote" data-offnote ${V.d.on ? 'hidden' : ''}><i data-lucide="power-off"></i>Targeting is off. Every tenant gets the off variation.</div>
            <section class="ff-sec"><div class="ff-sec-h"><span class="ff-secn">1</span><div><b>Individual targets</b><small>Always win over rules. Use them for pilots and exceptions.</small></div></div><div data-targets></div></section>
            <section class="ff-sec"><div class="ff-sec-h"><span class="ff-secn">2</span><div><b>Rules</b><small>First match wins. Drag the handle to reorder.</small></div></div><div data-rules></div></section>
            <section class="ff-sec"><div class="ff-sec-h"><span class="ff-secn">3</span><div><b>Default rule</b><small>Everyone who did not match above.</small></div>
              <select data-def class="ff-defsel" aria-label="Default rule"><option value="rollout">Percentage rollout</option>${f.variations.map((v, i) => `<option value="${i}">Serve ${esc(v[0])}</option>`).join('')}</select></div>
              <div data-rollout></div></section>
            <section class="ff-sec ff-offsec"><div class="ff-sec-h"><span class="ff-secn"><i data-lucide="power-off"></i></span><div><b>Off variation</b><small>Served when targeting is off or a prerequisite fails.</small></div>
              <select data-offv aria-label="Off variation">${f.variations.map((v, i) => `<option value="${i}" ${i === V.d.off ? 'selected' : ''}>${esc(v[0])}</option>`).join('')}</select></div></section>
          </div>
          <div class="panel"><div class="panel-head"><div><h3>Prerequisites</h3><p>This flag only evaluates when these flags serve the required variation.</p></div><button class="btn ghost sm" data-addpre><i data-lucide="plus"></i>Add prerequisite</button></div><div data-pre></div></div>
          <div class="panel"><div class="panel-head"><div><h3>Scheduled changes</h3><p>A ramp plan. Each step opens a change request automatically on its date.</p></div><button class="btn ghost sm" data-addstep><i data-lucide="calendar-plus"></i>Add step</button></div><div data-sched></div></div>
          <div class="panel"><div class="panel-head"><div><h3>Evaluation insights</h3><p>Evaluations per day in ${envName(env)}, last 14 days</p></div><div class="ff-legend2" data-leg></div></div><div data-chart></div></div>
          <div class="panel flush"><div class="panel-head"><div><h3>Audit log</h3><p>Every change with a before / after diff</p></div></div><div data-audit></div></div>
        </div>
        <div class="ff-dside">
          <div class="panel ff-about"><div class="panel-head"><div><h3>About</h3></div></div><p class="ff-desc">${esc(f.desc)}</p>
            <div class="dl ff-dl2"><div><span>Owner</span><b>${avatar(f.owner)} ${f.owner}</b></div><div><span>Category</span><b>${f.cat}</b></div><div><span>Created</span><b>${f.created}</b></div><div><span>Expiry</span><b class="${f.stale && /Expired/.test(f.stale) ? 'ff-danger-t' : ''}">${f.expiry || 'Never (permanent)'}</b></div><div><span>Last evaluated</span><b>${f.lastEval}</b></div><div><span>Tags</span><b>${f.tags.length ? f.tags.map((t) => `<span class="ff-vchip">${esc(t)}</span>`).join(' ') : '—'}</b></div></div></div>
          <div class="panel"><div class="panel-head"><div><h3>Variations</h3><p>${f.variations.length === 2 && f.variations[0][1] === 'true' ? 'Boolean' : 'Multivariate'}</p></div></div><div data-vars></div></div>
          <div class="panel"><div class="panel-head"><div><h3>Tenants served</h3><p>Live evaluation in ${envName(env)}</p></div><span class="ff-servedn" data-servedn></span></div><div data-tenants></div></div>
          <div class="panel"><div class="panel-head"><div><h3>Code references</h3><p>Found by the nightly scan of 3 repos</p></div>${f.stale ? '<span class="badge warn">Remove</span>' : ''}</div>${codeRefs(f)}</div>
        </div>
      </div>
      <div class="ff-savebar" data-savebar hidden><span class="ff-sb-ic"><i data-lucide="pencil-line"></i></span><div><b data-sbcount>Unsaved changes</b><small>${env === 'production' ? 'Production: saving opens a change request for approval' : 'Applies to ' + envName(env) + ' immediately'}</small></div><span class="spacer"></span><button class="btn ghost" data-discard>Discard</button><button class="btn ${env === 'production' ? 'primary' : 'lime'}" data-save>${env === 'production' ? '<i data-lucide="git-pull-request"></i>Review &amp; request approval' : '<i data-lucide="check"></i>Save changes'}</button></div>`;
    $('[data-def]', mount).value = String(V.d.def);
    paintTargets(sec); paintRollout(sec); paintPre(sec); paintSched(sec); paintChart(sec); paintAudit(sec); paintVars(sec); paintServed(sec);
    mountRules($('[data-rules]', mount), V.d.rules, { attrs: FLAG_ATTRS, serve: f.variations.map((v) => v[0]), join: 'or', empty: 'No rules. Everyone falls through to the default rule.', onChange: () => { paintServed(sec); paintRollout(sec, true); dirtyCheck(sec); } });
    FS.icons(mount);
  }
  const fCur = () => flagBy(V.key);
  function stepperHtml(f) {
    const stIdx = STAGES.findIndex((s) => s[0] === f.stage);
    return `<ol class="ff-stepper" style="--prog:${stIdx / (STAGES.length - 1)}">${STAGES.map(([k, n, ic], i) => `<li class="${i < stIdx ? 'done' : i === stIdx ? 'cur' : ''}"><button type="button" data-stage="${k}" ${i === stIdx ? 'aria-current="step"' : ''}><span class="ff-sic"><i data-lucide="${i < stIdx ? 'check' : ic}"></i></span><b>${n}</b><small>${['Spec & key agreed', 'Code behind the flag', 'Serving tenants', 'Remove code refs', 'No longer evaluated'][i]}</small></button></li>`).join('')}</ol>`;
  }
  function dirtyCheck(sec) {
    const bar = $('[data-savebar]', sec); if (!bar) return;
    const dirty = vDirty();
    if (dirty) {
      const f = fCur(), base = JSON.parse(V.base);
      const s = diffStats(snap(f, base), snap(f, V.d));
      $('[data-sbcount]', bar).innerHTML = `${crSummary(snap(f, base), snap(f, V.d))} <span class="ff-sbdiff"><b class="add">+${s.add}</b><b class="del">−${s.del}</b></span>`;
    }
    if (dirty && bar.hidden) { bar.hidden = false; bar.classList.remove('ff-sb-in'); void bar.offsetWidth; bar.classList.add('ff-sb-in'); }
    if (!dirty) bar.hidden = true;
  }
  function paintTargets(sec) {
    const f = fCur(), host = $('[data-targets]', sec);
    host.innerHTML = [0, 1].map((i) => { const list = V.d.targets[i] || []; return `<div class="ff-trow"><span class="ff-tvar"><span class="ff-vsw v${i}"></span>${esc(varName(f, i))}</span><div class="ff-tchips">${list.map((c) => { const t = tenantBy(c); return `<span class="ff-tchip" title="${t ? esc(t.name) + ' · ' + t.plan + ' · ' + t.city : c}">${avatar(t ? t.name : c)}<b>${t ? esc(t.name) : c}</b><button type="button" data-rmt="${i}" data-c="${c}" aria-label="Remove ${c}"><i data-lucide="x"></i></button></span>`; }).join('')}
      <div class="ff-tadd"><i data-lucide="search"></i><input data-tadd="${i}" placeholder="Add tenant…" autocomplete="off" aria-label="Add tenant to ${esc(varName(f, i))}"><div class="ff-tdrop" hidden></div></div></div><em class="ff-tcount">${list.length}</em></div>`; }).join('');
    FS.icons(host);
  }
  function paintRollout(sec, quiet) {
    const f = fCur(), host = $('[data-rollout]', sec), d = V.d;
    if (d.def !== 'rollout') { host.innerHTML = `<div class="ff-fixed"><span class="ff-vsw v${d.def}"></span>Everyone else gets <b>${esc(varName(f, d.def))}</b></div>`; return; }
    // tenants who reach the default rule
    const reach = TENANTS.filter((t) => ![0, 1].some((i) => (d.targets[i] || []).includes(t.code)) && !d.rules.some((r) => matchRule(t, r)));
    const per = Array.from({ length: 100 }, () => 0); reach.forEach((t) => per[bucket(t, f.key)]++);
    const inN = reach.filter((t) => bucket(t, f.key) < d.pct).length;
    if (quiet && $('.ff-buckets', host)) {
      $$('.ff-buckets i', host).forEach((c, k) => { c.classList.toggle('has', per[k] > 0); c.title = `Bucket ${k} · ${per[k]} tenant${per[k] === 1 ? '' : 's'}`; });
      const n = $('[data-inn]', host); if (n) FS.tick(n, inN, { dec: 0 }); const r = $('[data-reach]', host); if (r) r.textContent = reach.length;
      return;
    }
    const on = varName(f, d.rollOn), rest = varName(f, d.rollOn ? 0 : 1);
    host.innerHTML = `<div class="ff-rollout">
      <div class="ff-rl-top"><div class="ff-rl-big"><b data-pctv>${d.pct}</b><span>%</span></div><div class="ff-rl-split"><span><span class="ff-vsw v${d.rollOn}"></span>${esc(on)} <b data-pa>${d.pct}%</b></span><span><span class="ff-vsw v${d.rollOn ? 0 : 1}"></span>${esc(rest)} <b data-pb>${100 - d.pct}%</b></span></div>
        <div class="ff-rl-n"><b data-inn>${inN}</b><small>of <span data-reach>${reach.length}</span> tenants reaching this rule</small></div></div>
      <div class="ff-slider" style="--p:${d.pct}%"><input type="range" min="0" max="100" step="1" value="${d.pct}" data-pct aria-label="Rollout percentage"><div class="ff-ticks">${[0, 10, 25, 50, 75, 100].map((p) => `<button type="button" data-snap="${p}" style="left:${p}%">${p}</button>`).join('')}</div></div>
      <div class="ff-buckets" data-buckets aria-hidden="true">${per.map((n, k) => `<i class="${k < d.pct ? 'on' : ''} ${n ? 'has' : ''}" style="--k:${k}" title="Bucket ${k} · ${n} tenant${n === 1 ? '' : 's'}"></i>`).join('')}</div>
      <p class="ff-sticky"><i data-lucide="pin"></i><span><b>Sticky by tenant ID.</b> Each tenant hashes <code class="ff-key">tenant.id + "${f.key}"</code> into one of 100 buckets. Raising the percentage only adds buckets, so nobody who already has ${esc(on)} loses it.</span></p></div>`;
    FS.icons(host);
  }
  function setPct(sec, p) {
    p = Math.max(0, Math.min(100, Math.round(p)));
    V.d.pct = p;
    const host = $('[data-rollout]', sec); if (!host) return;
    const r = $('[data-pct]', host); if (+r.value !== p) r.value = p;
    $('.ff-slider', host).style.setProperty('--p', p + '%');
    $('[data-pctv]', host).textContent = p; $('[data-pa]', host).textContent = p + '%'; $('[data-pb]', host).textContent = 100 - p + '%';
    $$('[data-buckets] i', host).forEach((c, k) => c.classList.toggle('on', k < p));
    const f = fCur(), d = V.d;
    const reach = TENANTS.filter((t) => ![0, 1].some((i) => (d.targets[i] || []).includes(t.code)) && !d.rules.some((ru) => matchRule(t, ru)));
    const n = $('[data-inn]', host); const v = reach.filter((t) => bucket(t, f.key) < p).length; n.textContent = v; n.dataset.val = v;
    paintServed(sec); dirtyCheck(sec);
  }
  function paintPre(sec) {
    const f = fCur(), host = $('[data-pre]', sec), pre = V.d.pre || [];
    host.innerHTML = pre.length ? `<div class="ff-prelist">${pre.map(([k, v], i) => { const pf = flagBy(k); const isMod = CORE_MODULES.includes(k); return `<div class="ff-prerow" style="--i:${i}"><span class="ff-ficon ${pf ? 't-' + pf.type : 'mod'}"><i data-lucide="${isMod ? 'blocks' : pf ? TYPES[pf.type].icon : 'link-2'}"></i></span>
      <div class="ff-pre-k">${isMod ? `<code class="ff-key">${k}</code><small>Core module · HRMS must be enabled for the tenant's plan</small>` : `<select data-prek="${i}" aria-label="Prerequisite flag">${S.flags.filter((x) => x.key !== f.key && x.stage !== 'archived').map((x) => `<option ${x.key === k ? 'selected' : ''}>${x.key}</option>`).join('')}</select>`}</div>
      <span class="ff-then">must serve</span>${isMod ? '<span class="ff-vchip">Enabled</span>' : `<select data-prev="${i}" aria-label="Required variation">${(pf ? pf.variations : [['On'], ['Off']]).map((x) => `<option ${x[0] === v ? 'selected' : ''}>${esc(x[0])}</option>`).join('')}</select>`}
      ${pf ? `<span class="ff-prestate ${pf.envs[V.env].on ? 'on' : ''}">${pf.envs[V.env].on ? 'Serving' : 'Off'} in ${envName(V.env)}</span>` : ''}<button type="button" class="icon-btn-sm" data-rmpre="${i}" aria-label="Remove prerequisite"><i data-lucide="trash-2"></i></button></div>`; }).join('')}</div>`
      : '<div class="ff-rules-empty"><i data-lucide="link-2-off"></i>No prerequisites. This flag evaluates on its own.</div>';
    FS.icons(host);
  }
  function paintSched(sec) {
    const f = fCur(), host = $('[data-sched]', sec);
    if (!f.schedule) f.schedule = f.envs.production.pct != null && f.type !== 'entitlement' ? [] : null;
    if (!f.schedule) { host.innerHTML = '<div class="ff-rules-empty"><i data-lucide="calendar-x"></i>Scheduled ramps are for percentage rollouts. This flag is plan or switch based.</div>'; FS.icons(host); return; }
    const steps = f.schedule.slice().sort((a, b) => parseD(a[0]) - parseD(b[0]));
    f.schedule = steps;
    const nextI = steps.findIndex((s) => parseD(s[0]) > TODAY);
    host.innerHTML = `${steps.length ? `<div class="ff-ramp">${steps.map(([d, p], i) => { const done = parseD(d) <= TODAY; return `<div class="ff-rstep ${done ? 'done' : ''} ${i === nextI ? 'next' : ''}" style="--i:${i}"><span class="ff-rdot">${done ? '<i data-lucide="check"></i>' : p + '%'}</span><b>${p}%</b><small>${d}</small>${i === nextI ? `<em>in ${Math.round((parseD(d) - TODAY) / 864e5)} days</em>` : done ? '<em>applied</em>' : ''}</div>`; }).join('')}</div>` : ''}
      <div class="ff-steps">${steps.map(([d, p], i) => `<div class="ff-steprow ${parseD(d) <= TODAY ? 'done' : ''}"><i data-lucide="${parseD(d) <= TODAY ? 'circle-check' : 'calendar-clock'}"></i><input type="date" data-sd="${i}" value="${isoD(parseD(d))}" ${parseD(d) <= TODAY ? 'disabled' : ''} aria-label="Step date"><span>set rollout to</span><div class="ff-pctin"><input type="number" min="0" max="100" data-sp="${i}" value="${p}" ${parseD(d) <= TODAY ? 'disabled' : ''} aria-label="Step percent"><span>%</span></div><span class="spacer"></span>${parseD(d) <= TODAY ? '<span class="badge good">Applied</span>' : `<button type="button" class="icon-btn-sm" data-rms="${i}" aria-label="Remove step"><i data-lucide="x"></i></button>`}</div>`).join('') || '<div class="ff-rules-empty"><i data-lucide="calendar-plus"></i>No ramp planned. Add steps to automate the rollout.</div>'}</div>`;
    FS.icons(host);
  }
  function paintVars(sec) {
    const f = fCur(), host = $('[data-vars]', sec);
    const counts = f.variations.map(() => 0); TENANTS.forEach((t) => counts[evaluate(f, V.env, t, V.d).v]++);
    host.innerHTML = `<div class="ff-vars">${f.variations.map(([n, v], i) => `<div class="ff-var"><span class="ff-vsw v${i % 4}"></span><div><b>${esc(n)}</b><code>${esc(v)}</code></div><em data-vc="${i}">${counts[i]}<small>tenants</small></em></div>`).join('')}</div>
      <div class="ff-varbar">${f.variations.map((x, i) => `<i class="v${i % 4}" data-vb="${i}" style="width:${(counts[i] / TENANTS.length) * 100}%"></i>`).join('')}</div>`;
  }
  function paintServed(sec) {
    const f = fCur(); if (!f || !V.d) return;
    const evs = TENANTS.map((t) => ({ t, r: evaluate(f, V.env, t, V.d) }));
    const on = evs.filter((x) => x.r.v === onIdx(f)).length;
    const pill = $('[data-served]', sec); if (pill) pill.innerHTML = `<i data-lucide="users"></i><b>${on}</b> of ${TENANTS.length} tenants get ${esc(varName(f, onIdx(f)))}`;
    const sn = $('[data-servedn]', sec); if (sn) sn.innerHTML = `<b>${on}</b>/${TENANTS.length}`;
    const host = $('[data-tenants]', sec);
    if (host) {
      const order = (x) => (x.r.why === 'Individual target' ? 0 : /^Rule/.test(x.r.why) ? 1 : /^Rollout/.test(x.r.why) ? 2 : 3);
      const list = evs.slice().sort((a, b) => order(a) - order(b) || (b.r.v === onIdx(f)) - (a.r.v === onIdx(f)) || b.t.users - a.t.users).slice(0, 8);
      host.innerHTML = `<div class="ff-served">${list.map(({ t, r }) => `<div class="ff-srow">${avatar(t.name, 'sm')}<div><b>${esc(t.name)}</b><small>${t.plan} · ${t.city} · <span class="ff-why">${r.why}</span></small></div><span class="ff-vtag v${r.v % 4}">${esc(varName(f, r.v))}</span></div>`).join('')}</div><a class="link ff-more" href="#/admin/tenants">All ${TENANTS.length} tenants<i data-lucide="arrow-right"></i></a>`;
    }
    const vh = $('[data-vars]', sec);
    if (vh && $('[data-vc]', vh)) {
      const counts = f.variations.map(() => 0); evs.forEach((x) => counts[x.r.v]++);
      counts.forEach((c, i) => { const em = $(`[data-vc="${i}"]`, vh); if (em) em.firstChild.textContent = c; const b = $(`[data-vb="${i}"]`, vh); if (b) b.style.width = (c / TENANTS.length) * 100 + '%'; });
    }
    FS.icons(pill || sec);
  }
  function paintChart(sec) {
    const f = fCur(), host = $('[data-chart]', sec), env = V.env;
    const r = rng(hash(f.key + env));
    const scale = env === 'production' ? 1 : env === 'staging' ? 0.08 : 0.02;
    const base = Math.max(f.evals * scale, f.evals ? 300 : 0);
    const share = (servedOn(f, env, getD(f, env)) / TENANTS.length);
    const days = Array.from({ length: 14 }, (_, i) => {
      const dt = addDays(i - 13); const wk = dt.getDay() === 0 ? 0.45 : dt.getDay() === 6 ? 0.7 : 1;
      const tot = Math.round(base * wk * (0.82 + r() * 0.3) * (f.stale && /34 days/.test(f.stale) ? 0 : 1));
      const s = Math.min(1, Math.max(0, share * (0.75 + (i / 13) * 0.25) + (r() - 0.5) * 0.03));
      return { dt, t: Math.round(tot * s), f: tot - Math.round(tot * s) };
    });
    const W = 640, H = 210, P = { l: 44, r: 10, t: 12, b: 26 };
    const max = Math.max(10, ...days.map((d) => d.t + d.f)) * 1.1;
    const x = (i) => P.l + (i * (W - P.l - P.r)) / 13, y = (v) => H - P.b - (v / max) * (H - P.t - P.b);
    const path = (key) => days.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join(' ');
    const area = (key) => `${path(key)} L${x(13)},${H - P.b} L${x(0)},${H - P.b} Z`;
    const grid = [0, 0.25, 0.5, 0.75, 1].map((g) => { const v = max * g; return `<line x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}" class="g"/><text x="${P.l - 8}" y="${y(v) + 4}" text-anchor="end">${v >= 1000 ? Math.round(v / 1000) + 'k' : Math.round(v)}</text>`; }).join('');
    const tot = days.reduce((s, d) => s + d.t + d.f, 0), tt = days.reduce((s, d) => s + d.t, 0);
    const on = varName(f, onIdx(f)), off = varName(f, onIdx(f) ? 0 : 1);
    $('[data-leg]', sec).innerHTML = `<span><i class="v0"></i>${esc(on)}</span><span><i class="v1"></i>${esc(off)}</span>`;
    host.innerHTML = tot ? `<div class="ff-chartwrap"><svg class="ff-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Evaluations over 14 days">${grid}
      <path d="${area('f')}" class="a-off"/><path d="${area('t')}" class="a-on"/><path d="${path('f')}" class="l-off" pathLength="1"/><path d="${path('t')}" class="l-on" pathLength="1"/>
      ${days.map((d, i) => (i % 2 === 1 ? `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${String(d.dt.getDate()).padStart(2, '0')} ${MON[d.dt.getMonth()]}</text>` : '')).join('')}
      <line class="ff-cross" x1="0" x2="0" y1="${P.t}" y2="${H - P.b}" style="opacity:0"/>
      ${days.map((d, i) => `<rect x="${x(i) - (W - P.l - P.r) / 26}" y="${P.t}" width="${(W - P.l - P.r) / 13}" height="${H - P.t - P.b}" data-day="${i}" class="hit"/>`).join('')}</svg></div>
      <div class="ff-chartfoot"><div><small>Evaluations</small><b>${fmt(tot)}</b></div><div><small>${esc(on)}</small><b>${fmt(tt)}</b></div><div><small>${esc(off)}</small><b>${fmt(tot - tt)}</b></div><div><small>Errors</small><b class="ff-good-t">0.00%</b></div><div><small>p95 latency</small><b>${env === 'production' ? '3.1' : '2.4'} ms</b></div></div>`
      : '<div class="empty-state ff-empty"><span class="icon-well lg"><i data-lucide="activity"></i></span><b>No evaluations in 14 days</b><small>The SDK has not asked for this flag. Check the code references, then archive it.</small></div>';
    const svg = $('svg', host);
    if (svg) {
      svg.addEventListener('mousemove', (e) => { const h = e.target.closest('.hit'); if (!h) return; const d = days[+h.dataset.day]; const cr = $('.ff-cross', svg); cr.setAttribute('x1', x(+h.dataset.day)); cr.setAttribute('x2', x(+h.dataset.day)); cr.style.opacity = 1; FS.tip(`<small>${fmtD(d.dt)}</small><b>${fmt(d.t + d.f)} evals</b><small><i></i>${esc(on)} ${fmt(d.t)} · ${esc(off)} ${fmt(d.f)}</small>`, e.clientX, e.clientY - 8); });
      svg.addEventListener('mouseleave', () => { FS.untip(); $('.ff-cross', svg).style.opacity = 0; });
    }
    FS.icons(host);
  }
  function codeRefs(f) {
    const cat = f.cat.toLowerCase(), camel = f.key.replace(/_([a-z0-9])/g, (m, c) => c.toUpperCase());
    const h = hash(f.key);
    const refs = [
      ['finsoft-web', `apps/web/src/screens/${cat}/${camel}.tsx`, 30 + (h % 180), `const on = useFlag('${f.key}')`],
      ['finsoft-api', `services/${cat}/src/${f.key.split('_').slice(0, 2).join('-')}.handler.ts`, 12 + (h % 90), `if (await flags.variation('${f.key}', ctx, false)) {`],
      ['finsoft-api', `services/${cat}/test/${camel}.spec.ts`, 8 + (h % 40), `mockFlag('${f.key}', true)`],
    ];
    if (/Sales|Inventory|Communication/.test(f.cat)) refs.push(['finsoft-mobile', `src/features/${cat}/${camel}Screen.tsx`, 21 + (h % 60), `flags.boolVariation('${f.key}', false)`]);
    return `<div class="ff-refs">${refs.map(([repo, p, ln, code]) => `<div class="ff-ref"><div class="ff-ref-h"><span class="ff-repo"><i data-lucide="git-branch"></i>${repo}</span><code class="ff-path">${p}<b>:${ln}</b></code></div><pre><span class="ln">${ln}</span>${esc(code)}</pre></div>`).join('')}</div>`;
  }
  function paintAudit(sec) {
    const f = fCur(), host = $('[data-audit]', sec);
    const list = auditFor(f);
    host.innerHTML = `<div class="ff-audit">${list.map((a, i) => `<div class="ff-arow ${a.fresh ? 'fresh' : ''}" style="--i:${i}"><span class="ff-aic ${a.tone || ''}"><i data-lucide="${a.icon || 'pencil'}"></i></span>
      <div class="ff-amain"><div class="ff-atop"><b>${esc(a.what)}</b>${a.env && a.env !== 'all' ? `<span class="ff-envchip sm e-${a.env}"><span class="ff-env-dot e-${a.env}"></span>${envName(a.env)}</span>` : ''}${a.via ? `<span class="ff-via">${a.via}</span>` : ''}</div><small>${avatar(a.who)} ${a.who} · ${a.when}</small>
      <button type="button" class="ff-atog" data-adiff="${i}" aria-expanded="false"><i data-lucide="chevron-right"></i>Show diff</button><div class="ff-adiff" hidden></div></div></div>`).join('')}</div>`;
    list.forEach((a) => { a.fresh = false; });
    FS.icons(host);
  }

  function bindDetail(sec) {
    const mount = $('[data-ff-mount]', sec);
    mount.addEventListener('click', async (e) => {
      const t = e.target;
      if (t.closest('[data-copykey]')) { copy(V.key); return; }
      const de = t.closest('[data-denv]');
      if (de && de.dataset.denv !== V.env) {
        if (vDirty() && !(await FS.confirm({ title: 'Discard unsaved changes?', text: `You have unsaved targeting changes in ${envName(V.env)}.`, okLabel: 'Discard', danger: true }))) return;
        S.curEnv = de.dataset.denv; const main = $('.ff-dsplit', mount); renderDetail(sec); const m2 = $('.ff-dsplit', mount); m2.classList.add('ff-swap'); FS.icons(mount); void main; return;
      }
      const st = t.closest('[data-stage]');
      if (st) { stageMove(sec, st.dataset.stage); return; }
      const gc = t.closest('[data-gocr]'); if (gc) { S.crOpen = gc.dataset.gocr; FS.go('admin/change-requests'); return; }
      const rmt = t.closest('[data-rmt]');
      if (rmt) { const i = +rmt.dataset.rmt; V.d.targets[i] = V.d.targets[i].filter((c) => c !== rmt.dataset.c); const chip = rmt.closest('.ff-tchip'); chip.classList.add('ff-out'); setTimeout(() => { paintTargets(sec); afterEdit(sec); }, reduce() ? 0 : 180); return; }
      const opt = t.closest('[data-pickt]');
      if (opt) { addTarget(sec, +opt.dataset.i, opt.dataset.pickt); return; }
      const sn = t.closest('[data-snap]'); if (sn) { animatePct(sec, +sn.dataset.snap); return; }
      if (t.closest('[data-addpre]')) {
        const f = fCur(); V.d.pre = V.d.pre || [];
        const cand = S.flags.find((x) => x.key !== f.key && x.stage !== 'archived' && !V.d.pre.some((p) => p[0] === x.key) && (x.type === 'entitlement' || x.type === 'kill'));
        if (!cand) return;
        V.d.pre.push([cand.key, cand.variations[0][0]]); paintPre(sec); afterEdit(sec); const rows = $$('.ff-prerow', sec); flash(rows[rows.length - 1]); return;
      }
      const rp = t.closest('[data-rmpre]'); if (rp) { V.d.pre.splice(+rp.dataset.rmpre, 1); paintPre(sec); afterEdit(sec); return; }
      if (t.closest('[data-addstep]')) {
        const f = fCur(); if (!f.schedule) { FS.toast('Scheduled ramps need a percentage rollout', { tone: 'warn' }); return; }
        const last = f.schedule.length ? f.schedule[f.schedule.length - 1] : [fmtD(TODAY), V.d.pct];
        const dt = parseD(last[0]) < TODAY ? new Date(TODAY) : parseD(last[0]); dt.setDate(dt.getDate() + 7);
        f.schedule.push([fmtD(dt), Math.min(100, Math.max(+last[1] + 25, 10))]);
        paintSched(sec); const r = $$('.ff-steprow', sec).pop(); flash(r);
        FS.toast(`Ramp step added for ${fmtD(dt)}. It will open a change request on that date.`, { tone: 'info' });
        return;
      }
      const rs = t.closest('[data-rms]'); if (rs) { const f = fCur(); const [d, p] = f.schedule[+rs.dataset.rms]; f.schedule.splice(+rs.dataset.rms, 1); paintSched(sec); FS.toast(`Removed the ${p}% step on ${d}`, { tone: 'warn', undo: () => { f.schedule.push([d, p]); paintSched(sec); } }); return; }
      const ad = t.closest('[data-adiff]');
      if (ad) {
        const a = auditFor(fCur())[+ad.dataset.adiff], box = ad.nextElementSibling, open = box.hidden;
        if (open && !box.innerHTML) { box.innerHTML = diffHtml(a.before, a.after); FS.icons(box); }
        box.hidden = !open; ad.setAttribute('aria-expanded', open); ad.classList.toggle('open', open); ad.lastChild.textContent = open ? 'Hide diff' : 'Show diff';
        return;
      }
      if (t.closest('[data-discard]')) { V.d = JSON.parse(V.base); renderDetail(sec); FS.toast('Changes discarded', { tone: 'info', ms: 1800 }); return; }
      if (t.closest('[data-save]')) { saveDetail(sec, t.closest('[data-save]')); }
    });
    mount.addEventListener('change', (e) => {
      const t = e.target;
      if (t.matches('[data-pick]')) {
        const go = () => { S.cur = t.value; renderDetail(sec); window.scrollTo({ top: 0, behavior: reduce() ? 'auto' : 'smooth' }); };
        if (vDirty()) FS.confirm({ title: 'Discard unsaved changes?', text: 'Switching flags drops your unsaved targeting edits.', okLabel: 'Discard', danger: true }).then((ok) => (ok ? go() : (t.value = V.key))); else go();
        return;
      }
      if (t.matches('[data-don]')) {
        const f = fCur();
        if (f.type === 'kill') {
          const want = t.checked; t.checked = !want;
          killConfirm(f, V.env, want).then((ok) => {
            if (!ok) return;
            const d = getD(f, V.env), before = snap(f, d); d.on = want; sync(f, V.env);
            audit(f, { env: V.env, what: `Kill switch ${want ? 'restored' : 'flipped OFF'} in ${envName(V.env)}`, icon: 'power', tone: want ? 'good' : 'danger', before, after: snap(f, d) });
            renderDetail(sec); FS.toast(`<b class="ff-mono">${f.key}</b> ${want ? 'restored' : 'is OFF'} in ${envName(V.env)}`, { tone: want ? 'good' : 'danger' });
          });
          return;
        }
        V.d.on = t.checked; $('[data-donl]', mount).textContent = t.checked ? 'On' : 'Off'; $('[data-offnote]', mount).hidden = t.checked;
        $('.ff-targeting', mount).classList.toggle('is-off', !t.checked); afterEdit(sec); return;
      }
      if (t.matches('[data-def]')) { V.d.def = t.value === 'rollout' ? 'rollout' : +t.value; paintRollout(sec); afterEdit(sec); return; }
      if (t.matches('[data-offv]')) { V.d.off = +t.value; afterEdit(sec); return; }
      if (t.matches('[data-prek]')) { const i = +t.dataset.prek, pf = flagBy(t.value); V.d.pre[i] = [t.value, pf.variations[0][0]]; paintPre(sec); afterEdit(sec); return; }
      if (t.matches('[data-prev]')) { V.d.pre[+t.dataset.prev][1] = t.value; afterEdit(sec); return; }
      if (t.matches('[data-sd]')) { const f = fCur(); const v = t.value ? fromIso(t.value) : null; if (!v || v <= TODAY) { FS.toast('Pick a date after today', { tone: 'warn' }); paintSched(sec); return; } f.schedule[+t.dataset.sd][0] = fmtD(v); paintSched(sec); FS.toast('Ramp updated', { tone: 'good', ms: 1800 }); return; }
      if (t.matches('[data-sp]')) { const f = fCur(); f.schedule[+t.dataset.sp][1] = Math.max(0, Math.min(100, +t.value || 0)); paintSched(sec); return; }
    });
    mount.addEventListener('input', (e) => {
      const t = e.target;
      if (t.matches('[data-pct]')) { setPct(sec, +t.value); return; }
      if (t.matches('[data-tadd]')) { tenantSuggest(t); }
    });
    mount.addEventListener('keydown', (e) => {
      const t = e.target;
      if (t.matches && t.matches('[data-tadd]')) {
        const drop = t.nextElementSibling, items = $$('[data-pickt]', drop);
        let cur = items.findIndex((x) => x.classList.contains('hi'));
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!items.length) return; cur = (cur + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; items.forEach((x, k) => x.classList.toggle('hi', k === cur)); }
        if (e.key === 'Enter') { e.preventDefault(); const it = items[cur] || items[0]; if (it) addTarget(sec, +it.dataset.i, it.dataset.pickt); }
        if (e.key === 'Escape') { drop.hidden = true; }
      }
    });
    mount.addEventListener('focusout', (e) => { if (e.target.matches && e.target.matches('[data-tadd]')) setTimeout(() => { const dr = e.target.nextElementSibling; if (dr) dr.hidden = true; }, 160); });
  }
  function afterEdit(sec) { paintServed(sec); paintRollout(sec, true); dirtyCheck(sec); }
  function tenantSuggest(inp) {
    const i = +inp.dataset.tadd, q = inp.value.trim().toLowerCase(), drop = inp.nextElementSibling;
    const taken = new Set([...(V.d.targets[0] || []), ...(V.d.targets[1] || [])]);
    const list = TENANTS.filter((t) => !taken.has(t.code) && (!q || `${t.name} ${t.code} ${t.city}`.toLowerCase().includes(q))).slice(0, 6);
    drop.innerHTML = list.length ? list.map((t, k) => `<button type="button" data-pickt="${t.code}" data-i="${i}" class="${k === 0 ? 'hi' : ''}">${avatar(t.name)}<span><b>${esc(t.name)}</b><small>${t.code} · ${t.plan} · ${t.city}</small></span></button>`).join('') : '<div class="ff-tnone">No matching tenants</div>';
    drop.hidden = false;
  }
  function addTarget(sec, i, code) {
    V.d.targets[i] = V.d.targets[i] || [];
    const o = i ? 0 : 1; V.d.targets[o] = (V.d.targets[o] || []).filter((c) => c !== code);
    V.d.targets[i].push(code);
    paintTargets(sec); afterEdit(sec);
    const chips = $$(`.ff-trow:nth-child(${i + 1}) .ff-tchip`, sec); const c = chips[chips.length - 1]; if (c) { c.classList.add('ff-pop'); }
    const inp = $(`[data-tadd="${i}"]`, sec); if (inp) inp.focus();
  }
  function animatePct(sec, to) {
    const from = V.d.pct; if (from === to) return;
    if (reduce()) { setPct(sec, to); return; }
    const t0 = performance.now(), dur = 420;
    const step = (now) => { const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3); setPct(sec, from + (to - from) * e); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  async function stageMove(sec, to) {
    const f = fCur(), from = f.stage; if (to === from) return;
    if (to === 'archived') {
      const ok = await FS.confirm({ title: `Archive ${f.key}?`, text: 'Archived flags stop evaluating and SDKs fall back to their in-code default. Remove the code references first.', okLabel: 'Archive', danger: true, icon: 'archive' });
      if (!ok) return;
    }
    f.stage = to;
    if (to === 'cleanup' || to === 'archived') { /* keep stale note until archived */ if (to === 'archived') f.stale = ''; }
    audit(f, { env: 'all', what: `Lifecycle ${stageLabel(from)} → ${stageLabel(to)}`, icon: 'milestone', tone: 'violet', before: { stage: from }, after: { stage: to } });
    const ol = $('.ff-stepper', sec); ol.outerHTML = stepperHtml(f);
    const cur = $('.ff-stepper li.cur', sec); if (cur) cur.classList.add('ff-pop');
    FS.icons($('.ff-lifecycle', sec));
    if (to === 'archived') { const bn = $('.ff-banner.warn', sec); if (bn) bn.remove(); }
    paintAudit(sec);
    FS.toast(`${f.key} moved to <b>${stageLabel(to)}</b>`, { tone: 'good', undo: () => { f.stage = from; $('.ff-stepper', sec).outerHTML = stepperHtml(f); FS.icons($('.ff-lifecycle', sec)); } });
  }
  async function saveDetail(sec, btn) {
    const f = fCur(); if (!vDirty()) return;
    if (V.env === 'production') {
      const cr = await changeRequestModal(f, 'production', clone(V.d));
      if (cr) renderDetail(sec);
      return;
    }
    await busy(btn, 700, 'Saving…');
    const before = snap(f, getD(f, V.env));
    S.det[f.key + '|' + V.env] = clone(V.d); sync(f, V.env);
    audit(f, { env: V.env, what: crSummary(before, snap(f, V.d)), icon: 'save', tone: 'good', before, after: snap(f, V.d) });
    renderDetail(sec);
    FS.celebrate($('.ff-envtabs .active', sec));
    FS.toast(`Saved to ${envName(V.env)}. SDKs pick it up within 2 seconds.`, { tone: 'good' });
  }

  /* ================================================================ 3 · admin/segments */
  const segUsers = (seg) => S.flags.filter((f) => f.stage !== 'archived' && (f.seg === seg.name || ENVS.some(([e]) => { const d = S.det[f.key + '|' + e]; return d && d.rules.some((r) => r.attr === 'segment' && r.vals.includes(seg.name)); })));
  const segCount = (seg) => TENANTS.filter((t) => segMatch(seg, t)).length;
  const SG = { draft: null, base: '' };
  function renderSegments(sec) {
    const mount = $('[data-ff-mount]', sec);
    mount.innerHTML = `<div class="ff-segwrap"><div class="ff-seglist" data-seglist></div><div class="ff-segedit" data-segedit></div></div>`;
    paintSegList(sec); paintSegEdit(sec);
  }
  function paintSegList(sec) {
    const host = $('[data-seglist]', sec);
    host.innerHTML = `<div class="ff-seglist-h"><b>${S.segments.length} segments</b><small>${TENANTS.length} tenants in total</small></div>` + S.segments.map((s, i) => {
      const n = s.id === S.segSel && SG.draft ? segCount(SG.draft) : segCount(s), used = segUsers(s).length;
      return `<button type="button" class="ff-segcard ${s.id === S.segSel ? 'on' : ''}" data-seg="${s.id}" style="--i:${i}"><span class="icon-tile ${s.tone}"><i data-lucide="${s.icon}"></i></span><div><b>${esc(s.name)}</b><small>${esc(s.desc)}</small><div class="ff-segmeta"><span class="ff-mbar sm"><i style="--w:${(n / TENANTS.length) * 100}%"></i></span><em data-segcn="${s.id}">${n}</em><span class="ff-segused"><i data-lucide="flag"></i>${used}</span></div></div></button>`;
    }).join('');
    FS.icons(host);
  }
  function paintSegEdit(sec) {
    const seg = S.segments.find((s) => s.id === S.segSel) || S.segments[0];
    S.segSel = seg.id;
    SG.draft = clone(seg); SG.base = JSON.stringify(seg.rules);
    const host = $('[data-segedit]', sec);
    const users = segUsers(seg);
    host.innerHTML = `<div class="panel ff-segpanel">
      <div class="ff-seg-h"><span class="icon-tile ${seg.tone} lg"><i data-lucide="${seg.icon}"></i></span><div><h2>${esc(seg.name)}</h2><p>${esc(seg.desc)}</p><code class="ff-key">segment.${snake(seg.name)}</code></div><span class="spacer"></span><button class="btn ghost sm" data-segedit-btn><i data-lucide="pencil"></i>Edit</button><button class="icon-btn-sm" data-segmenu aria-label="More"><i data-lucide="ellipsis-vertical"></i></button></div>
      <div class="ff-segbody">
        <div class="ff-segrules"><div class="ff-sec-h"><span class="ff-secn"><i data-lucide="list-filter"></i></span><div><b>Membership rules</b><small>A tenant is in the segment when it matches <b>all</b> rules.</small></div></div><div data-segrules></div></div>
        <div class="ff-segcount"><div class="ff-ring" style="--p:0"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" class="trk"/><circle cx="60" cy="60" r="52" class="arc" pathLength="100"/></svg><div><b data-segn>0</b><small>of ${TENANTS.length} tenants</small></div></div>
          <div class="ff-segbreak" data-segbreak></div></div>
      </div>
      <div class="ff-segfoot" data-segfoot hidden><span><i data-lucide="pencil-line"></i>Unsaved rule changes · <b data-segdelta></b></span><span class="spacer"></span><button class="btn ghost sm" data-segdiscard>Discard</button><button class="btn primary sm" data-segsave><i data-lucide="check"></i>Save segment</button></div>
    </div>
    <div class="grid-2 ff-seggrid">
      <div class="panel"><div class="panel-head"><div><h3>Matching tenants</h3><p data-segprevsub></p></div></div><div data-segprev></div></div>
      <div class="panel"><div class="panel-head"><div><h3>Flags using this segment</h3><p>${users.length ? 'Editing the rules changes who these flags serve' : 'Not referenced by any flag yet'}</p></div></div>
        ${users.length ? `<div class="ff-segflags">${users.map((f) => `<button type="button" class="ff-segflag" data-openflag="${f.key}"><span class="ff-ficon t-${f.type}"><i data-lucide="${TYPES[f.type].icon}"></i></span><span><code class="ff-key">${f.key}</code><small>${esc(f.name)} · ${f.envs.production.on ? 'serving in Production' : 'off in Production'}</small></span><i data-lucide="arrow-up-right"></i></button>`).join('')}</div>` : '<div class="ff-rules-empty"><i data-lucide="flag-off"></i>Add it to a flag from the flag\'s Rules section: <b>Segment is one of</b>.</div>'}</div>
    </div>`;
    mountRules($('[data-segrules]', host), SG.draft.rules, { attrs: SEG_ATTRS, serve: null, join: 'and', empty: 'No rules yet. Add one to start matching tenants.', onChange: () => segLive(sec) });
    FS.icons(host);
    segLive(sec, true);
  }
  function segLive(sec, first) {
    const host = $('[data-segedit]', sec), seg = SG.draft;
    const list = TENANTS.filter((t) => segMatch(seg, t)), n = list.length;
    const el = $('[data-segn]', host);
    if (first) { el.textContent = n; el.dataset.val = n; } else FS.tick(el, n, { dec: 0 });
    const ring = $('.ff-ring', host); requestAnimationFrame(() => ring.style.setProperty('--p', ((n / TENANTS.length) * 100).toFixed(1)));
    if (!first) { ring.classList.remove('ff-bump'); void ring.offsetWidth; ring.classList.add('ff-bump'); }
    const by = PLANS.map((p) => [p, list.filter((t) => t.plan === p).length]);
    $('[data-segbreak]', host).innerHTML = by.map(([p, c]) => `<div class="ff-sbrow">${planPill(p)}<span class="ff-mbar"><i style="--w:${n ? (c / n) * 100 : 0}%"></i></span><b>${c}</b></div>`).join('');
    const prev = $('[data-segprev]', sec.querySelector('.ff-seggrid'));
    $('[data-segprevsub]', sec).textContent = n ? `Showing ${Math.min(12, n)} of ${n}` : 'Nobody matches yet';
    prev.innerHTML = n ? `<div class="ff-tprev">${list.slice().sort((a, b) => b.users - a.users).slice(0, 12).map((t, i) => `<div class="ff-tp" style="--i:${i}">${avatar(t.name, 'sm')}<div><b>${esc(t.name)}</b><small>${t.city} · ${t.industry}</small></div>${planPill(t.plan)}</div>`).join('')}</div>${n > 12 ? `<div class="ff-more2">+ ${n - 12} more tenants</div>` : ''}` : '<div class="empty-state ff-empty"><span class="icon-well lg"><i data-lucide="users-round"></i></span><b>No tenants match</b><small>Loosen a rule or add values.</small></div>';
    FS.icons(prev);
    const cn = $(`[data-segcn="${seg.id}"]`, sec); if (cn) { cn.textContent = n; const bar = cn.previousElementSibling.firstElementChild; bar.style.setProperty('--w', (n / TENANTS.length) * 100 + '%'); }
    const dirty = JSON.stringify(seg.rules) !== SG.base;
    const foot = $('[data-segfoot]', host);
    if (dirty) { const orig = segCount(S.segments.find((s) => s.id === seg.id)); const dlt = n - orig; $('[data-segdelta]', host).textContent = `${dlt >= 0 ? '+' : '−'}${Math.abs(dlt)} tenants vs saved`; }
    if (dirty && foot.hidden) { foot.hidden = false; foot.classList.add('ff-sb-in'); } else if (!dirty) foot.hidden = true;
  }
  function segModal(sec, seg) {
    const isNew = !seg;
    const ICONS = ['users-round', 'flask-conical', 'building', 'gem', 'map-pin', 'receipt-text', 'sparkles', 'truck', 'store', 'factory', 'rocket', 'heart-handshake'];
    const TN = ['green', 'blue', 'violet', 'orange', 'lime', 'red'];
    const st = { icon: seg ? seg.icon : 'users-round', tone: seg ? seg.tone : 'green' };
    const m = modal({
      title: isNew ? 'New segment' : 'Edit segment', sub: isNew ? 'Name it, then add rules in the editor. Membership updates live.' : 'Rules are edited in the panel; this changes the name and look.',
      html: `<div class="form-grid"><label class="full"><span>Name *</span><input name="name" value="${seg ? esc(seg.name) : ''}" placeholder="e.g. Karachi distributors" maxlength="40"></label>
        <label class="full"><span>Key</span><input name="key" readonly value="segment.${seg ? snake(seg.name) : ''}" class="ff-mono-in"></label>
        <label class="full"><span>Description</span><textarea name="desc" rows="2" placeholder="Who is in it and why">${seg ? esc(seg.desc) : ''}</textarea></label>
        <div class="full field"><span>Icon &amp; colour</span><div class="ff-iconpick">${ICONS.map((ic) => `<button type="button" data-ic="${ic}" class="${ic === st.icon ? 'on' : ''}" aria-label="${ic}"><i data-lucide="${ic}"></i></button>`).join('')}</div><div class="ff-tonepick">${TN.map((t) => `<button type="button" data-tn="${t}" class="icon-tile ${t} ${t === st.tone ? 'on' : ''}" aria-label="${t}"></button>`).join('')}</div></div>
        ${isNew ? `<div class="full field"><span>Start from</span><div class="radio-cards ff-starts"><label class="radio-card"><input type="radio" name="start" value="blank" checked><div><b>Blank</b><small>No rules</small></div></label><label class="radio-card"><input type="radio" name="start" value="city"><div><b>City</b><small>City is one of…</small></div></label><label class="radio-card"><input type="radio" name="start" value="plan"><div><b>Plan</b><small>Plan is one of…</small></div></label></div></div>` : ''}</div>`,
      foot: `<button class="btn secondary" data-close>Cancel</button><button class="btn primary" data-ok><i data-lucide="check"></i>${isNew ? 'Create segment' : 'Save'}</button>`,
    });
    m.addEventListener('input', (e) => { if (e.target.name === 'name') { $('[name=key]', m).value = 'segment.' + snake(e.target.value); e.target.classList.remove('ff-invalid'); } });
    m.addEventListener('click', (e) => {
      const ic = e.target.closest('[data-ic]'); if (ic) { st.icon = ic.dataset.ic; $$('[data-ic]', m).forEach((b) => b.classList.toggle('on', b === ic)); }
      const tn = e.target.closest('[data-tn]'); if (tn) { st.tone = tn.dataset.tn; $$('[data-tn]', m).forEach((b) => b.classList.toggle('on', b === tn)); }
    });
    $('[data-ok]', m).onclick = async () => {
      const nm = $('[name=name]', m);
      if (!nm.value.trim()) { nm.classList.add('ff-invalid'); shake(nm.closest('label')); nm.focus(); return; }
      if (S.segments.some((s) => s.name.toLowerCase() === nm.value.trim().toLowerCase() && s !== seg)) { nm.classList.add('ff-invalid'); shake(nm.closest('label')); FS.toast('A segment with that name exists', { tone: 'warn' }); return; }
      await busy($('[data-ok]', m), 600, 'Saving…');
      if (isNew) {
        const start = ($('[name=start]:checked', m) || {}).value;
        const ns = { id: 'seg' + Date.now(), name: nm.value.trim(), desc: $('[name=desc]', m).value.trim() || 'Custom segment', icon: st.icon, tone: st.tone, rules: start === 'city' ? [{ attr: 'city', op: 'in', vals: ['Karachi'] }] : start === 'plan' ? [{ attr: 'plan', op: 'in', vals: ['Growth'] }] : [] };
        S.segments.push(ns); S.segSel = ns.id;
        m.close(); paintSegList(sec); paintSegEdit(sec);
        const card = $(`[data-seg="${ns.id}"]`, sec); if (card) { flash(card); card.scrollIntoView({ block: 'nearest' }); }
        FS.toast(`Segment “${esc(ns.name)}” created`, { tone: 'good' });
      } else {
        const old = seg.name; seg.name = nm.value.trim(); seg.desc = $('[name=desc]', m).value.trim(); seg.icon = st.icon; seg.tone = st.tone;
        if (old !== seg.name) { S.flags.forEach((f) => { if (f.seg === old) f.seg = seg.name; }); Object.values(S.det).forEach((d) => d.rules.forEach((r) => { if (r.attr === 'segment') r.vals = r.vals.map((v) => (v === old ? seg.name : v)); })); }
        m.close(); paintSegList(sec); paintSegEdit(sec); flash($('.ff-segpanel', sec));
        FS.toast('Segment updated', { tone: 'good' });
      }
    };
  }
  function bindSegments(sec) {
    $('[data-ff-act="new-segment"]', sec).addEventListener('click', () => segModal(sec, null));
    const mount = $('[data-ff-mount]', sec);
    mount.addEventListener('click', async (e) => {
      const t = e.target;
      const c = t.closest('[data-seg]');
      if (c && c.dataset.seg !== S.segSel) {
        if (JSON.stringify(SG.draft.rules) !== SG.base && !(await FS.confirm({ title: 'Discard rule changes?', text: 'This segment has unsaved rule edits.', okLabel: 'Discard', danger: true }))) return;
        S.segSel = c.dataset.seg; $$('[data-seg]', sec).forEach((b) => b.classList.toggle('on', b === c));
        paintSegList(sec); paintSegEdit(sec); const ed = $('[data-segedit]', sec); ed.classList.remove('ff-pane-in'); void ed.offsetWidth; ed.classList.add('ff-pane-in');
        return;
      }
      if (t.closest('[data-segedit-btn]')) { segModal(sec, S.segments.find((s) => s.id === S.segSel)); return; }
      if (t.closest('[data-segmenu]')) {
        const seg = S.segments.find((s) => s.id === S.segSel);
        FS.menu(t.closest('[data-segmenu]'), [
          { label: 'Duplicate', icon: 'copy-plus', onClick: () => { const n = clone(seg); n.id = 'seg' + Date.now(); n.name = seg.name + ' (copy)'; S.segments.push(n); S.segSel = n.id; paintSegList(sec); paintSegEdit(sec); flash($(`[data-seg="${n.id}"]`, sec)); FS.toast('Segment duplicated', { tone: 'good' }); } },
          { label: 'Copy key', icon: 'clipboard-copy', onClick: () => copy('segment.' + snake(seg.name)) },
          { sep: true },
          { label: 'Delete', icon: 'trash-2', danger: true, onClick: async () => {
            const used = segUsers(seg);
            if (used.length) { FS.toast(`Used by ${plural(used.length, 'flag')}. Remove it from those rules first.`, { tone: 'warn' }); return; }
            if (!(await FS.confirm({ title: `Delete “${esc(seg.name)}”?`, text: 'No flags use it, so nothing changes for tenants.', okLabel: 'Delete', danger: true }))) return;
            S.segments.splice(S.segments.indexOf(seg), 1); S.segSel = S.segments[0].id; paintSegList(sec); paintSegEdit(sec); FS.toast('Segment deleted', { tone: 'warn' });
          } },
        ]);
        return;
      }
      const of = t.closest('[data-openflag]'); if (of) { openFlag(of.dataset.openflag, 'production'); return; }
      if (t.closest('[data-segdiscard]')) { paintSegEdit(sec); paintSegList(sec); return; }
      if (t.closest('[data-segsave]')) {
        const btn = t.closest('[data-segsave]'), seg = S.segments.find((s) => s.id === S.segSel);
        const used = segUsers(seg);
        if (used.some((f) => f.envs.production.on) && !(await FS.confirm({ title: 'Save segment?', text: `${plural(used.length, 'flag')} use this segment in Production. Their audience changes as soon as you save.`, okLabel: 'Save segment', icon: 'users-round' }))) return;
        await busy(btn, 700, 'Saving…');
        seg.rules = clone(SG.draft.rules);
        paintSegEdit(sec); paintSegList(sec); flash($(`[data-seg="${seg.id}"]`, sec));
        FS.celebrate($('[data-segn]', sec));
        FS.toast(`“${esc(seg.name)}” saved · ${segCount(seg)} tenants`, { tone: 'good' });
      }
    });
  }

  /* ================================================================ 4 · admin/entitlements */
  const ENT = [
    ['Core modules', 'blocks', [['Accounting & GL', 'mod.accounting', '1111', true], ['Sales & receivables', 'mod.sales', '1111'], ['Purchases & payables', 'mod.purchases', '1111'], ['Inventory', 'mod.inventory', '0111'], ['Wholesale & distribution', 'mod.wholesale', '0011'], ['Point of sale', 'pos_module', '0111'], ['HRMS & payroll', 'hrms_module', '0111'], ['Fixed assets', 'mod.assets', '0011']]],
    ['Compliance', 'landmark', [['FBR Digital Invoicing', 'fbr_einvoicing_di', '0011'], ['FBR POS integration', 'fbr_pos_integration', '0111'], ['SRB / PRA returns', 'mod.provincial_tax', '1111'], ['WHT certificates', 'mod.wht', '0111']]],
    ['Sales & distribution', 'truck', [['Booker app', 'booker_app_order_sync', '0011'], ['Van sales load sheet', 'van_sales_load_sheet', '0011'], ['Trade schemes', 'mod.schemes', '0011']]],
    ['Inventory', 'boxes', [['Batch & expiry', 'batch_expiry_tracking', '0111'], ['Serial numbers', 'serial_number_tracking', '0011'], ['Multi-warehouse & transit', 'multi_warehouse_transit', '0011']]],
    ['Finance', 'wallet', [['Multi-currency', 'multi_currency', '0011'], ['Budgets & variance', 'mod.budgets', '0111'], ['Report Studio', 'mod.report_studio', '0011']]],
    ['HR', 'users', [['Biometric attendance (ZKTeco)', 'biometric_attendance_zkteco', '0111'], ['Employee self-service', 'mod.ess', '0111']]],
    ['Platform', 'shield-check', [['Public API & webhooks', 'mod.api', '0011'], ['Custom roles', 'mod.custom_roles', '0111'], ['SSO (SAML / Azure AD)', 'mod.sso', '0001'], ['Priority support', 'mod.priority_support', '0011']]],
  ];
  const LIMITS = [['Users', 'users', 'users', [5, 25, 100, null]], ['Branches', 'branches', 'git-fork', [1, 3, 10, null]], ['Invoices / month', 'inv', 'receipt-text', [500, 5000, 25000, null]], ['Storage (GB)', 'gb', 'hard-drive', [5, 25, 100, 500]], ['API calls / day', 'api', 'webhook', [0, 5000, 50000, 500000]]];
  const ADDONS = [
    { k: 'pos', name: 'POS terminal', icon: 'monitor-smartphone', price: 2500, unit: 'per terminal / month', subs: 214, plans: [0, 1, 1, 1], tone: 'green' },
    { k: 'wa', name: 'WhatsApp Business', icon: 'message-circle', price: 3000, unit: 'per month + Rs 1.20 / message', subs: 63, plans: [1, 1, 1, 1], tone: 'lime' },
    { k: 'co', name: 'Extra company', icon: 'building-2', price: 4999, unit: 'per company / month', subs: 41, plans: [0, 1, 1, 1], tone: 'blue' },
    { k: 'pay', name: 'Payroll', icon: 'wallet', price: 150, unit: 'per employee / month', subs: 2840, plans: [1, 1, 0, 0], tone: 'violet', note: 'Included from Business' },
  ];
  const PRICE = { Starter: 9999, Growth: 24999, Business: 49999, Enterprise: 180000 };
  const E = { cur: null, base: null };
  E.cur = { feat: {}, lim: {}, add: {} };
  ENT.forEach(([, , rows]) => rows.forEach(([, k, p]) => { E.cur.feat[k] = p.split('').map((x) => x === '1'); }));
  LIMITS.forEach(([, k, , v]) => { E.cur.lim[k] = v.slice(); });
  ADDONS.forEach((a) => { E.cur.add[a.k] = a.price; });
  E.base = clone(E.cur);
  const syncEntFlags = () => Object.entries(E.cur.feat).forEach(([k, arr]) => { ENT_FLAG_PLANS[k] = PLANS.filter((p, i) => arr[i]); });
  syncEntFlags();
  const entLabel = (k) => { for (const [, , rows] of ENT) for (const r of rows) if (r[1] === k) return r[0]; return k; };
  const limFmt = (v) => (v == null ? '∞' : fmt(v));
  function entChanges() {
    const out = [];
    Object.entries(E.cur.feat).forEach(([k, arr]) => arr.forEach((v, i) => { if (v !== E.base.feat[k][i]) out.push({ kind: 'feat', k, i, from: E.base.feat[k][i], to: v }); }));
    Object.entries(E.cur.lim).forEach(([k, arr]) => arr.forEach((v, i) => { if (v !== E.base.lim[k][i]) out.push({ kind: 'lim', k, i, from: E.base.lim[k][i], to: v }); }));
    Object.entries(E.cur.add).forEach(([k, v]) => { if (v !== E.base.add[k]) out.push({ kind: 'add', k, from: E.base.add[k], to: v }); });
    return out;
  }
  function changeImpact(c) {
    if (c.kind === 'feat') {
      const ts = TENANTS.filter((t) => t.plan === PLANS[c.i]);
      return { ts, tone: c.to ? 'good' : 'danger', text: c.to ? `${ts.length} ${PLANS[c.i]} tenants gain ${entLabel(c.k)}` : `${ts.length} ${PLANS[c.i]} tenants lose ${entLabel(c.k)}` };
    }
    if (c.kind === 'lim') {
      const L = LIMITS.find((l) => l[1] === c.k), ts = TENANTS.filter((t) => t.plan === PLANS[c.i]);
      const lower = c.to != null && (c.from == null || c.to < c.from);
      if (lower) { const over = ts.filter((t) => t[c.k] > c.to); return { ts: over, tone: over.length ? 'danger' : 'warn', text: over.length ? `${over.length} ${PLANS[c.i]} tenants are already over ${limFmt(c.to)} ${L[0].toLowerCase()}` : `Nobody on ${PLANS[c.i]} is over the new limit` }; }
      return { ts, tone: 'good', text: `${ts.length} ${PLANS[c.i]} tenants get more headroom` };
    }
    const a = ADDONS.find((x) => x.k === c.k);
    const ts = TENANTS.filter((t) => a.plans[PLANS.indexOf(t.plan)] && hash(t.code + a.k) % 100 < Math.min(60, (a.subs / TENANTS.length) * 10));
    return { ts, tone: c.to > c.from ? 'warn' : 'good', text: `${fmt(a.subs)} ${a.k === 'pay' ? 'employees billed' : 'subscriptions'} ${c.to > c.from ? 'pay' : 'save'} Rs ${fmt(Math.abs(c.to - c.from))} ${a.unit.split(' / ')[0].replace('per ', 'per ')} at next renewal` };
  }
  function renderEnt(sec) {
    const mount = $('[data-ff-mount]', sec);
    const featCount = (i) => Object.values(E.cur.feat).filter((a) => a[i]).length;
    mount.innerHTML = `
      <div class="ff-plancards">${PLANS.map((p, i) => `<div class="ff-plancard p-${PLAN_CLS[p]}" style="--i:${i}"><div class="ff-pc-top">${planPill(p)}<small>${planCount(p)} tenants</small></div><b class="ff-pc-price">Rs ${fmt(PRICE[p])}<small>/ month</small></b><div class="ff-pc-meta"><span><b data-fc="${i}">${featCount(i)}</b> features</span><span><b>${limFmt(E.cur.lim.users[i])}</b> users</span></div></div>`).join('')}</div>
      <div class="panel flush ff-entpanel"><div class="panel-head"><div><h3>Feature matrix</h3><p>Rows link to entitlement flags; toggling a cell changes the plan rule on that flag.</p></div><div class="panel-actions"><label class="search-field ff-search sm" data-plain-search><i data-lucide="search"></i><input placeholder="Filter features…" data-entq aria-label="Filter features"></label></div></div>
        <div class="table-wrap"><table class="tbl ff-enttbl" data-plain data-no-qv><thead><tr><th>Feature</th><th>Key</th>${PLANS.map((p) => `<th class="ff-c-plan">${planPill(p)}</th>`).join('')}</tr></thead><tbody>
        ${ENT.map(([g, ic, rows]) => `<tr class="ff-grp"><td colspan="6"><span><i data-lucide="${ic}"></i>${g}</span><em>${rows.length}</em></td></tr>${rows.map(([n, k, , locked]) => `<tr data-ek="${k}" data-name="${esc(n.toLowerCase())}"><td><b>${n}</b>${locked ? '<span class="badge neutral ff-core"><i data-lucide="lock"></i>Core</span>' : ''}</td><td>${flagBy(k) ? `<a class="ff-key ff-klink" href="#/admin/features/view" data-openflag="${k}">${k}</a>` : `<code class="ff-key muted">${k}</code>`}</td>${PLANS.map((p, i) => `<td class="ff-c-plan"><button type="button" class="ff-chk ${E.cur.feat[k][i] ? 'on' : ''}" data-fk="${k}" data-i="${i}" aria-pressed="${E.cur.feat[k][i]}" aria-label="${n} on ${p}" ${locked ? 'disabled' : ''}><i data-lucide="check"></i></button></td>`).join('')}</tr>`).join('')}`).join('')}
        <tr class="ff-grp"><td colspan="6"><span><i data-lucide="gauge"></i>Limits</span><em>Blank = unlimited</em></td></tr>
        ${LIMITS.map(([n, k, ic]) => `<tr data-lk="${k}" data-name="${esc(n.toLowerCase())}"><td><span class="ff-limn"><i data-lucide="${ic}"></i><b>${n}</b></span></td><td><code class="ff-key muted">limit.${k}</code></td>${PLANS.map((p, i) => `<td class="ff-c-plan"><input class="ff-limin" type="number" min="0" data-lk="${k}" data-i="${i}" value="${E.cur.lim[k][i] == null ? '' : E.cur.lim[k][i]}" placeholder="∞" aria-label="${n} on ${p}"></td>`).join('')}</tr>`).join('')}
        </tbody></table></div></div>
      <div class="panel"><div class="panel-head"><div><h3>Add-ons</h3><p>Sold on top of a plan. Prices in PKR, excluding sales tax.</p></div></div>
        <div class="ff-addons">${ADDONS.map((a, i) => `<div class="ff-addon" style="--i:${i}"><div class="ff-ad-h"><span class="icon-tile ${a.tone}"><i data-lucide="${a.icon}"></i></span><div><b>${a.name}</b><small>${fmt(a.subs)} ${a.k === 'pay' ? 'employees billed' : 'active'}</small></div></div>
          <label class="ff-price"><span>Rs</span><input type="number" min="0" step="50" data-ak="${a.k}" value="${E.cur.add[a.k]}" aria-label="${a.name} price"></label><small class="ff-unit">${a.unit}</small>
          <div class="ff-adplans">${PLANS.map((p, k) => `<span class="${a.plans[k] ? 'on' : ''}" title="${a.plans[k] ? 'Available' : a.note || 'Not available'} on ${p}">${p[0]}</span>`).join('')}${a.note ? `<em>${a.note}</em>` : ''}</div></div>`).join('')}</div></div>
      <div class="ff-savebar" data-entbar hidden><span class="ff-sb-ic"><i data-lucide="layers"></i></span><div><b data-entn>0 changes</b><small data-entt></small></div><span class="spacer"></span><button class="btn ghost" data-entdiscard>Discard</button><button class="btn primary" data-entreview><i data-lucide="eye"></i>Preview impact</button></div>`;
    FS.icons(mount);
  }
  function entDirty(sec) {
    const ch = entChanges();
    const affected = new Set(); ch.forEach((c) => changeImpact(c).ts.forEach((t) => affected.add(t.code)));
    const bar = $('[data-entbar]', sec);
    $('[data-ff-act="ent-review"]', sec).disabled = !ch.length;
    if (ch.length) {
      $('[data-entn]', bar).textContent = plural(ch.length, 'change');
      $('[data-entt]', bar).innerHTML = `<b>${affected.size}</b> tenants affected`;
      if (bar.hidden) { bar.hidden = false; bar.classList.remove('ff-sb-in'); void bar.offsetWidth; bar.classList.add('ff-sb-in'); }
    } else bar.hidden = true;
    PLANS.forEach((p, i) => { const el = $(`[data-fc="${i}"]`, sec); const v = Object.values(E.cur.feat).filter((a) => a[i]).length; if (el && +el.textContent !== v) { el.textContent = v; flash(el); } });
    return { ch, affected };
  }
  function entDrawer(sec) {
    const { ch, affected } = entDirty(sec);
    if (!ch.length) return;
    const rows = ch.map((c) => {
      const im = changeImpact(c);
      const label = c.kind === 'feat' ? entLabel(c.k) : c.kind === 'lim' ? LIMITS.find((l) => l[1] === c.k)[0] : ADDONS.find((a) => a.k === c.k).name + ' price';
      const from = c.kind === 'feat' ? (c.from ? 'Included' : '—') : c.kind === 'lim' ? limFmt(c.from) : 'Rs ' + fmt(c.from);
      const to = c.kind === 'feat' ? (c.to ? 'Included' : 'Removed') : c.kind === 'lim' ? limFmt(c.to) : 'Rs ' + fmt(c.to);
      return `<div class="ff-imp ${im.tone}"><span class="ff-imp-ic"><i data-lucide="${im.tone === 'good' ? 'trending-up' : im.tone === 'danger' ? 'triangle-alert' : 'info'}"></i></span><div><div class="ff-imp-top"><b>${label}</b>${c.kind !== 'add' ? planPill(PLANS[c.i]) : ''}</div><div class="ff-imp-ch"><s>${from}</s><i data-lucide="arrow-right"></i><b>${to}</b></div><small>${im.text}</small>
        ${im.ts.length ? `<div class="ff-imp-ts">${im.ts.slice(0, 5).map((t) => avatar(t.name)).join('')}${im.ts.length > 5 ? `<em>+${im.ts.length - 5}</em>` : ''}</div>` : ''}</div><b class="ff-imp-n">${im.ts.length}</b></div>`;
    }).join('');
    const losing = ch.some((c) => changeImpact(c).tone === 'danger');
    const d = FS.drawer({
      title: 'Review entitlement changes', subtitle: `${plural(ch.length, 'change')} across ${new Set(ch.map((c) => c.i)).size || 1} plan(s)`,
      html: `<div class="ff-impact"><div class="ff-imp-hero ${losing ? 'danger' : ''}"><div><small>Tenants affected</small><b data-affn>0</b></div><p>${losing ? 'Some tenants lose access or are over a new limit. Grandfathering keeps their current access until renewal.' : 'Everyone affected gains something. No one loses access.'}</p></div>
        <div class="ff-implist">${rows}</div>
        <div class="ff-impopts"><label class="switch"><input type="checkbox" data-grand ${losing ? 'checked' : ''}><i></i><span>Grandfather existing tenants until renewal</span></label><label class="switch"><input type="checkbox" checked><i></i><span>Email affected tenant owners</span></label><label class="switch"><input type="checkbox"><i></i><span>Post to the in-app changelog</span></label></div></div>`,
      foot: `<button class="btn secondary" data-close>Back to editing</button><button class="btn primary" data-entsave><i data-lucide="check"></i>Save entitlements</button>`,
      wide: false,
    });
    d.classList.add('ff-drawer');
    setTimeout(() => FS.tick($('[data-affn]', d), affected.size, { dec: 0 }), 200);
    $('[data-entsave]', d).onclick = async (e) => {
      await busy(e.currentTarget, 1000, 'Saving…');
      E.base = clone(E.cur); syncEntFlags();
      // push plan rules into entitlement flags' targeting
      Object.keys(S.det).forEach((id) => { const [k] = id.split('|'); const f = flagBy(k); if (f && f.type === 'entitlement' && ENT_FLAG_PLANS[k]) S.det[id].rules.forEach((r) => { if (r.attr === 'plan') r.vals = ENT_FLAG_PLANS[k].slice(); }); });
      closeOf(d);
      $$('.ff-chg', sec).forEach((x) => x.classList.remove('ff-chg'));
      entDirty(sec);
      FS.celebrate($('.ff-plancards', sec));
      FS.toast(`Entitlements saved · ${affected.size} tenants updated${$('[data-grand]', d).checked ? ' (grandfathered)' : ''}`, { tone: 'good' });
    };
  }
  function bindEnt(sec) {
    const mount = $('[data-ff-mount]', sec);
    $('[data-ff-act="ent-review"]', sec).addEventListener('click', () => entDrawer(sec));
    mount.addEventListener('click', (e) => {
      const t = e.target;
      const c = t.closest('.ff-chk');
      if (c && !c.disabled) {
        const k = c.dataset.fk, i = +c.dataset.i; E.cur.feat[k][i] = !E.cur.feat[k][i];
        c.classList.toggle('on', E.cur.feat[k][i]); c.setAttribute('aria-pressed', E.cur.feat[k][i]);
        c.closest('td').classList.toggle('ff-chg', E.cur.feat[k][i] !== E.base.feat[k][i]);
        c.classList.remove('ff-pop'); void c.offsetWidth; c.classList.add('ff-pop');
        entDirty(sec); return;
      }
      const of = t.closest('[data-openflag]'); if (of) { e.preventDefault(); openFlag(of.dataset.openflag, 'production'); return; }
      if (t.closest('[data-entreview]')) { entDrawer(sec); return; }
      if (t.closest('[data-entdiscard]')) { E.cur = clone(E.base); renderEnt(sec); entDirty(sec); FS.toast('Changes discarded', { tone: 'info', ms: 1800 }); }
    });
    mount.addEventListener('input', (e) => {
      const t = e.target;
      if (t.matches('[data-entq]')) { const q = t.value.trim().toLowerCase(); $$('.ff-enttbl tbody tr[data-name]', sec).forEach((r) => { r.hidden = q && !r.dataset.name.includes(q); }); return; }
      if (t.matches('input[data-lk]')) { const k = t.dataset.lk, i = +t.dataset.i; E.cur.lim[k][i] = t.value === '' ? null : Math.max(0, +t.value); t.closest('td').classList.toggle('ff-chg', E.cur.lim[k][i] !== E.base.lim[k][i]); entDirty(sec); return; }
      if (t.matches('[data-ak]')) { E.cur.add[t.dataset.ak] = Math.max(0, +t.value || 0); t.closest('.ff-addon').classList.toggle('ff-chg', E.cur.add[t.dataset.ak] !== E.base.add[t.dataset.ak]); entDirty(sec); }
    });
  }

  /* ================================================================ 5 · admin/change-requests */
  const CRS = { pending: ['Pending', 'clock', 'warn'], approved: ['Approved', 'circle-check', 'good'], rejected: ['Rejected', 'circle-x', 'danger'] };
  function renderCRs(sec) {
    const mount = $('[data-ff-mount]', sec);
    const cnt = (s) => S.crs.filter((c) => !s || c.status === s).length;
    mount.innerHTML = `
      <div class="kpi-grid ff-kpis">
        <div class="kpi"><div class="kpi-top"><span>Pending</span><span class="icon-well yellow"><i data-lucide="clock"></i></span></div><strong data-crk="pending">${cnt('pending')}</strong><small>Need a second approver</small></div>
        <div class="kpi"><div class="kpi-top"><span>Approved · 30 days</span><span class="icon-well"><i data-lucide="circle-check"></i></span></div><strong data-crk="approved">${cnt('approved')}</strong><small>Applied to Production</small></div>
        <div class="kpi"><div class="kpi-top"><span>Rejected · 30 days</span><span class="icon-well red"><i data-lucide="circle-x"></i></span></div><strong data-crk="rejected">${cnt('rejected')}</strong><small>Sent back with a note</small></div>
        <div class="kpi"><div class="kpi-top"><span>Median time to approve</span><span class="icon-well violet"><i data-lucide="timer"></i></span></div><strong>1h 34m</strong><small class="up">−22 min vs last month</small></div>
      </div>
      <div class="tabs ff-crtabs" role="tablist">${['pending', 'approved', 'rejected', ''].map((s) => `<button type="button" class="${S.crTab === (s || 'all') ? 'active' : ''}" data-crtab="${s || 'all'}" role="tab">${s ? CRS[s][0] : 'All'} <i data-crc="${s || 'all'}">${cnt(s)}</i></button>`).join('')}</div>
      <div class="ff-crlist" data-crlist></div>`;
    paintCRList(sec);
    FS.icons(mount);
    requestAnimationFrame(() => FS.positionInk($('.ff-crtabs', sec)));
  }
  function crCard(c, i) {
    const f = flagBy(c.key), st = CRS[c.status], s = diffStats(c.before, c.after);
    return `<article class="ff-cr s-${c.status} ${c.fresh ? 'fresh' : ''}" data-cr="${c.id}" style="--i:${i}" tabindex="0">
      <div class="ff-cr-top"><span class="ff-crid">${c.id}</span><code class="ff-key">${c.key}</code><span class="ff-envchip e-${c.env}"><span class="ff-env-dot e-${c.env}"></span>${envName(c.env)}</span><span class="badge ${st[2]} dot">${st[0]}</span><span class="spacer"></span><small class="ff-when"><i data-lucide="clock"></i>${c.created}</small></div>
      <div class="ff-cr-body">${avatar(c.requester, 'sm')}<div><div class="ff-cr-what"><b>${c.requester}</b> requested <b>${esc(c.summary)}</b>${f ? ` on <span class="ff-cr-fname">${esc(f.name)}</span>` : ''}</div><p class="ff-reason">“${esc(c.reason)}”</p>
        <div class="ff-cr-meta"><span class="ff-sbdiff"><b class="add">+${s.add}</b><b class="del">−${s.del}</b></span><span class="ff-appr"><span class="avatar-stack">${c.approvers.map((a) => avatar(a)).join('')}</span>${c.status === 'pending' ? `Needs 1 of ${c.approvers.length}` : c.status === 'approved' ? `Approved by ${c.decidedBy}` : `Rejected by ${c.decidedBy}`}</span><span><i data-lucide="message-square"></i>${c.comments.length}</span>${f ? typeBadge(f.type, 1) : ''}</div></div></div>
      <div class="ff-cr-act"><button type="button" class="btn ${c.status === 'pending' ? 'primary' : 'secondary'} sm" data-opencr="${c.id}">${c.status === 'pending' ? '<i data-lucide="eye"></i>Review' : '<i data-lucide="file-diff"></i>View diff'}</button></div></article>`;
  }
  function paintCRList(sec) {
    const host = $('[data-crlist]', sec);
    const list = S.crs.filter((c) => S.crTab === 'all' || c.status === S.crTab);
    host.innerHTML = list.length ? list.map(crCard).join('') : `<div class="empty-state ff-empty panel"><span class="icon-well lg"><i data-lucide="${S.crTab === 'pending' ? 'party-popper' : 'inbox'}"></i></span><b>${S.crTab === 'pending' ? 'Inbox zero' : 'Nothing here yet'}</b><small>${S.crTab === 'pending' ? 'No Production changes are waiting for you.' : 'Requests will show up here.'}</small><a class="btn secondary sm" href="#/admin/features">Go to flags</a></div>`;
    S.crs.forEach((c) => { c.fresh = false; });
    FS.icons(host);
  }
  function paintCRCounts(sec) {
    ['pending', 'approved', 'rejected', 'all'].forEach((s) => {
      const n = S.crs.filter((c) => s === 'all' || c.status === s).length;
      const i = $(`[data-crc="${s}"]`, sec); if (i && +i.textContent !== n) { i.textContent = n; i.classList.remove('ff-bump'); void i.offsetWidth; i.classList.add('ff-bump'); }
      const k = $(`[data-crk="${s}"]`, sec); if (k && +k.textContent !== n) FS.tick(k, n, { dec: 0 });
    });
  }
  function crDrawer(sec, id) {
    const c = S.crs.find((x) => x.id === id); if (!c) return;
    const f = flagBy(c.key), st = CRS[c.status];
    const thread = () => c.comments.map((m) => `<div class="ff-cm ${m.who === ME ? 'me' : ''}">${avatar(m.who)}<div><div class="ff-cm-h"><b>${m.who}</b><small>${m.when}</small></div><p>${esc(m.text)}</p></div></div>`).join('') || '<div class="ff-cm-empty">No comments yet. Ask a question or add context.</div>';
    const d = FS.drawer({
      title: `${c.id} · ${c.key}`, subtitle: `${envName(c.env)} · requested by ${c.requester} · ${c.created}`, wide: true,
      html: `<div class="ff-crd">
        <div class="ff-crd-top"><span class="badge ${st[2]} dot">${st[0]}</span><span class="ff-envchip e-${c.env}"><span class="ff-env-dot e-${c.env}"></span>${envName(c.env)}</span>${f ? typeBadge(f.type, 1) : ''}<span class="spacer"></span>${f ? `<a class="link" href="#/admin/features/view" data-openflag="${c.key}">Open flag<i data-lucide="arrow-up-right"></i></a>` : ''}</div>
        <div class="ff-crd-sum"><b>${esc(c.summary)}</b><p>“${esc(c.reason)}”</p></div>
        <h4 class="ff-h4">Diff</h4>${diffHtml(c.before, c.after)}
        <h4 class="ff-h4">Approvals</h4><div class="ff-apprlist">${c.approvers.map((a) => `<div class="ff-apr">${avatar(a, 'sm')}<div><b>${a}</b><small>${c.status === 'approved' && a === c.decidedBy ? 'Approved · ' + c.decidedAt : c.status === 'rejected' && a === c.decidedBy ? 'Rejected · ' + c.decidedAt : 'Requested reviewer'}</small></div><span class="badge ${c.status !== 'pending' && a === c.decidedBy ? st[2] : 'neutral'}">${c.status !== 'pending' && a === c.decidedBy ? st[0] : 'Waiting'}</span></div>`).join('')}${c.decidedBy && !c.approvers.includes(c.decidedBy) ? `<div class="ff-apr">${avatar(c.decidedBy, 'sm')}<div><b>${c.decidedBy}</b><small>${st[0]} · ${c.decidedAt}</small></div><span class="badge ${st[2]}">${st[0]}</span></div>` : ''}</div>
        ${c.note ? `<div class="ff-decnote ${c.status}"><i data-lucide="quote"></i><div><b>${c.decidedBy}'s note</b><p>${esc(c.note)}</p></div></div>` : ''}
        <h4 class="ff-h4">Discussion</h4><div class="ff-thread" data-thread>${thread()}</div>
        <div class="ff-cmin"><input placeholder="Write a comment…" data-cmtext aria-label="Comment"><button class="btn secondary sm" data-cmpost><i data-lucide="send"></i>Post</button></div>
        ${c.status === 'pending' ? `<div class="ff-decide"><label class="field"><span>Second-approver note *</span><textarea rows="3" data-note placeholder="What you checked: dashboards, error rates, tenants affected…"></textarea></label><small><i data-lucide="shield-check"></i>Approving applies the change to ${envName(c.env)} immediately and records your note in the audit log.</small></div>` : ''}
      </div>`,
      foot: c.status === 'pending' ? `<button class="btn danger" data-reject><i data-lucide="x"></i>Reject</button><span class="spacer"></span><button class="btn secondary" data-close>Close</button><button class="btn primary" data-approve><i data-lucide="check"></i>Approve &amp; apply</button>` : `<button class="btn secondary" data-close>Close</button>`,
    });
    d.classList.add('ff-drawer');
    const post = () => { const i = $('[data-cmtext]', d); if (!i.value.trim()) { i.focus(); return; } c.comments.push({ who: ME, text: i.value.trim(), when: 'Just now' }); i.value = ''; $('[data-thread]', d).innerHTML = thread(); const last = $$('.ff-cm', d).pop(); if (last) flash(last); FS.icons(d); const card = $(`[data-cr="${c.id}"] .ff-cr-meta span:nth-child(3)`, sec); if (card) { card.innerHTML = `<i data-lucide="message-square"></i>${c.comments.length}`; FS.icons(card); } };
    d.addEventListener('click', (e) => {
      if (e.target.closest('[data-cmpost]')) post();
      const of = e.target.closest('[data-openflag]'); if (of) { e.preventDefault(); closeOf(d); openFlag(of.dataset.openflag, c.env); }
      const dec = e.target.closest('[data-approve],[data-reject]');
      if (dec) decide(sec, c, d, dec.hasAttribute('data-approve'), dec);
    });
    d.addEventListener('keydown', (e) => { if (e.target.matches('[data-cmtext]') && e.key === 'Enter') { e.preventDefault(); post(); } });
  }
  async function decide(sec, c, d, approve, btn) {
    const ta = $('[data-note]', d);
    if (!ta.value.trim()) { ta.classList.add('ff-invalid'); shake(ta.closest('label')); ta.focus(); FS.toast(approve ? 'Add a second-approver note before approving' : 'Tell the requester why', { tone: 'warn' }); ta.addEventListener('input', () => ta.classList.remove('ff-invalid'), { once: true }); return; }
    await busy(btn, 900, approve ? 'Applying…' : 'Rejecting…');
    c.status = approve ? 'approved' : 'rejected'; c.decidedBy = ME === c.requester ? 'Mariam Iqbal' : ME; c.decidedAt = nowStamp(); c.note = ta.value.trim();
    const f = flagBy(c.key);
    if (approve) applyCR(c); else if (f) { delete f.pending[c.env]; audit(f, { env: c.env, what: `${c.id} rejected: ${c.summary}`, icon: 'circle-x', tone: 'danger', before: c.before, after: c.before, via: c.id }); }
    closeOf(d);
    refreshBadges();
    const card = $(`[data-cr="${c.id}"]`, sec);
    const finish = () => {
      paintCRCounts(sec);
      if (S.crTab === 'all') { if (card) { const n = document.createElement('div'); n.innerHTML = crCard(c, 0); const el = n.firstElementChild; card.replaceWith(el); FS.icons(el); flash(el); } }
      else paintCRList(sec);
      const tabBtn = $(`[data-crtab="${c.status}"]`, sec);
      if (approve) FS.celebrate(tabBtn || null, 'Applied');
    };
    if (card && S.crTab === 'pending') {
      card.classList.add(approve ? 'ff-cr-fly' : 'ff-cr-drop');
      const st = CRS[c.status], b = $('.ff-cr-top .badge', card); if (b) { b.className = `badge ${st[2]} dot`; b.textContent = st[0]; }
      setTimeout(finish, reduce() ? 0 : 560);
    } else finish();
    FS.toast(approve ? `${c.id} approved · <b class="ff-mono">${c.key}</b> updated in ${envName(c.env)}` : `${c.id} rejected · ${c.requester} has been notified`, { tone: approve ? 'good' : 'warn', action: f ? { label: 'Open flag', fn: () => openFlag(c.key, c.env) } : undefined });
  }
  function bindCRs(sec) {
    const mount = $('[data-ff-mount]', sec);
    mount.addEventListener('click', (e) => {
      const t = e.target;
      const tb = t.closest('[data-crtab]');
      if (tb) { S.crTab = tb.dataset.crtab; $$('[data-crtab]', sec).forEach((b) => b.classList.toggle('active', b === tb)); FS.positionInk($('.ff-crtabs', sec)); paintCRList(sec); return; }
      const oc = t.closest('[data-opencr]'); if (oc) { crDrawer(sec, oc.dataset.opencr); return; }
      const card = t.closest('[data-cr]'); if (card && !t.closest('a,button')) crDrawer(sec, card.dataset.cr);
    });
    mount.addEventListener('keydown', (e) => { const card = e.target.closest && e.target.closest('[data-cr]'); if (card && e.key === 'Enter' && e.target === card) crDrawer(sec, card.dataset.cr); });
  }

  /* ================================================================ seed + register */
  function seedCRs() {
    S.seq = 1041;
    const at = (key, env, mut) => { const f = flagBy(key), d = clone(getD(f, env)); mut(d); return [f, d]; };
    let [f, d] = at('fbr_einvoicing_di', 'production', () => {});
    const b = clone(d); b.targets[0] = b.targets[0].slice(0, 6);
    createCR(f, 'production', d, { beforeD: b, requester: 'Saim Javed', reason: 'Adding 4 more Lahore pilot tenants who passed the PRAL sandbox test on 05 Sep.', created: '08 Sep 2026 · 14:22', status: 'approved', decidedBy: 'Mariam Iqbal', decidedAt: '08 Sep 2026 · 15:01', note: 'All four have STRNs and valid POS IDs. Approved.', approvers: ['Mariam Iqbal'], comments: [{ who: 'Mariam Iqbal', text: 'Did Ravi Motors clear their sandbox invoice errors?', when: '08 Sep · 14:40' }, { who: 'Saim Javed', text: 'Yes, 0 errors on the last 50 test invoices.', when: '08 Sep · 14:52' }] });
    [f, d] = at('withholding_tax_engine_v2', 'production', () => {});
    const w = clone(d); w.pct = 5;
    createCR(f, 'production', d, { beforeD: w, requester: 'Mariam Iqbal', reason: 'Section 153 rates verified against Finance Act 2026. 5% cohort reconciled with zero variances.', created: '15 Sep 2026 · 09:12', status: 'approved', decidedBy: 'Saim Javed', decidedAt: '15 Sep 2026 · 10:40', note: 'Spot-checked 12 certificates. Go.', approvers: ['Saim Javed', 'Danish Ahmed'] });
    [f, d] = at('wholesale_quick_entry_grid', 'production', () => {});
    const q = clone(d); q.pct = 10;
    createCR(f, 'production', d, { beforeD: q, requester: 'Areeba Khalid', reason: 'Beta feedback is positive (NPS +61) and the 10% cohort shows 34% faster order entry.', created: '24 Sep 2026 · 11:05', status: 'approved', decidedBy: 'Saim Javed', decidedAt: '24 Sep 2026 · 12:30', note: 'Error rate flat at 0.02%. Approved for 50%.', approvers: ['Saim Javed'] });
    [f, d] = at('sms_gateway_fallback', 'production', () => {});
    const sm = clone(d); sm.on = false;
    createCR(f, 'production', d, { beforeD: sm, requester: 'Danish Ahmed', reason: 'Jazz delivery dropped to 84% in Karachi last night. Enabling automatic failover to Telenor.', created: '27 Sep 2026 · 07:48', status: 'approved', decidedBy: 'Saim Javed', decidedAt: '27 Sep 2026 · 07:55', note: 'Confirmed on the SMS dashboard. Approved.', approvers: ['Saim Javed'] });
    [f, d] = at('maintenance_read_only_mode', 'production', (x) => { x.on = true; });
    createCR(f, 'production', d, { requester: 'Talha Mehmood', reason: 'Database maintenance window tonight 01:00–02:00 for the Postgres 16 upgrade.', created: '29 Sep 2026 · 18:40', status: 'rejected', decidedBy: 'Saim Javed', decidedAt: '29 Sep 2026 · 19:02', note: 'Month-end close is running for 41 tenants. Reschedule to Sunday 05 Oct, 02:00.', approvers: ['Saim Javed'] });
    [f, d] = at('new_dashboard_layout', 'production', (x) => { x.rules.push({ attr: 'plan', op: 'in', vals: ['Enterprise'], serve: 0 }); });
    createCR(f, 'production', d, { requester: 'Areeba Khalid', reason: 'Enterprise CSMs asked to keep the classic dashboard until the quarterly business reviews are done.', created: '30 Sep 2026 · 12:15', approvers: ['Saim Javed', 'Danish Ahmed'], comments: [{ who: 'Danish Ahmed', text: 'Will this skew the experiment? Enterprise is only 9% of tenants.', when: '30 Sep · 13:02' }, { who: 'Areeba Khalid', text: 'Slightly. We exclude them from the analysis as well.', when: '30 Sep · 13:20' }] });
    [f, d] = at('whatsapp_payment_reminders', 'production', (x) => { x.pct = 75; });
    createCR(f, 'production', d, { requester: 'Danish Ahmed', reason: 'Delivery rate 98.7% and opt-outs at 0.4% after a week at 50%. Ramping to 75% per the rollout plan.', created: '01 Oct 2026 · 09:30', approvers: ['Saim Javed', 'Mariam Iqbal'], comments: [{ who: 'Mariam Iqbal', text: 'Collections team confirms reminders cut DSO by 3 days for the 50% cohort.', when: '01 Oct · 09:52' }] });
    S.crs.forEach((c) => { c.fresh = false; });
  }
  seedCRs();

  FS.onEnter('admin/features', (sec, r, first) => {
    if (first) { renderFeatures(sec); FS.icons(sec); }
    else { paintKpis(sec); paintEnv(sec); paintRows(sec, false); }
    refreshBadges();
    requestAnimationFrame(() => FS.positionInk($('.ff-tabs', sec)));
  });
  FS.onEnter('admin/features/view', (sec, r, first) => {
    if (first) bindDetail(sec);
    if (first || V.key !== S.cur || V.env !== S.curEnv || !vDirty()) renderDetail(sec);
    refreshBadges();
  });
  FS.onEnter('admin/segments', (sec, r, first) => {
    if (first) { renderSegments(sec); bindSegments(sec); }
    else { paintSegList(sec); if (JSON.stringify(SG.draft.rules) === SG.base) paintSegEdit(sec); }
    refreshBadges();
  });
  FS.onEnter('admin/entitlements', (sec, r, first) => {
    if (first) { renderEnt(sec); bindEnt(sec); }
    refreshBadges();
  });
  FS.onEnter('admin/change-requests', (sec, r, first) => {
    if (first) bindCRs(sec);
    if (S.crOpen) { const c = S.crs.find((x) => x.id === S.crOpen); if (c) S.crTab = c.status; }
    renderCRs(sec);
    refreshBadges();
    if (S.crOpen) { const id = S.crOpen; S.crOpen = null; setTimeout(() => { const card = $(`[data-cr="${id}"]`, sec); if (card) { card.scrollIntoView({ block: 'center' }); flash(card); } crDrawer(sec, id); }, 250); }
  });
  document.addEventListener('fs:theme', () => { const s = $('.screen.active[data-route="admin/features/view"]'); if (s && V.key) paintChart(s); });
})();
