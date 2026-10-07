/* ================= 9B · Platform Admin plus (Agent E, prefix ap-) =================
   13 admin screens: tenants, tenant 360, staff, analytics, dunning, usage, partners,
   leads, comms, security, status, integrations, tax master. Everything renders on first enter. */
(function () {
  'use strict';
  if (!window.FS) return;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (n, d = 0) => FS.fmt(n, d);
  const rs = (n) => 'Rs ' + fmt(Math.round(n));
  const money = (n, dec = 0) => FS.money(n, { dec });
  const ini = (name) => name.replace(/\(.*?\)|&/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const icons = (root) => FS.icons(root);
  const toast = (m, o) => FS.toast(m, o);
  const onRoute = (r, fn) => FS.onEnter(r, (sec, route, first) => { if (first) { fn(sec); FS.enhance(sec); icons(sec); } });

  /* ---------- tone helpers ---------- */
  const TONES = ['', 'c2', 'c3', 'c4', 'c5', 'c6'];
  const hash = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };
  const avatar = (name, cls = 'sm') => `<span class="avatar ${cls} ${TONES[hash(name) % TONES.length]}">${ini(name)}</span>`;
  const LOGO_T = ['g', 'b', 'v', 'o', 'i', 'w'];
  const logo = (name, cls = '') => `<span class="ap-logo ${cls} t-${LOGO_T[hash(name) % LOGO_T.length]}">${ini(name)}</span>`;
  const healthTone = (s) => (s >= 75 ? 'good' : s >= 50 ? 'warn' : 'danger');
  const ring = (score, size = 38, stroke = 4, label = true) => {
    const r = (size - stroke) / 2, c = 2 * Math.PI * r, off = c * (1 - score / 100);
    return `<span class="ap-ring ${healthTone(score)}" style="--sz:${size}px" data-tip="Health ${score}/100"><svg viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" class="trk"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" class="arc" stroke-dasharray="${c.toFixed(2)}" style="--c:${c.toFixed(2)};--off:${off.toFixed(2)}"/></svg>${label ? `<b>${score}</b>` : ''}</span>`;
  };
  const meterTone = (pct) => (pct > 100 ? 'over' : pct >= 100 ? 'full' : pct >= 80 ? 'hot' : 'ok');
  const meter = (used, limit, o = {}) => {
    const pct = limit ? (used / limit) * 100 : 0;
    const t = meterTone(pct);
    return `<div class="ap-meter ${t}${o.compact ? ' compact' : ''}"${o.tip ? ` data-tip="${esc(o.tip)}"` : ''}><div class="ap-meter-top">${o.label ? `<span>${o.label}</span>` : ''}<em>${o.text || Math.round(pct) + '%'}</em></div><div class="ap-bar"><i style="--w:${clamp(pct, 0, 100).toFixed(1)}%"></i></div></div>`;
  };
  const PLAN = {
    Starter: { price: 9999, seats: 5, cls: 'starter', icon: 'sprout' },
    Growth: { price: 24999, seats: 50, cls: 'growth', icon: 'trending-up' },
    Business: { price: 49999, seats: 200, cls: 'business', icon: 'briefcase' },
    Enterprise: { price: 180000, seats: 1000, cls: 'enterprise', icon: 'gem' },
  };
  const planPill = (p) => `<span class="ap-plan ${PLAN[p] ? PLAN[p].cls : ''}">${p}</span>`;
  const STATUS = { Active: 'good', Trial: 'info', 'Past due': 'danger', 'Read-only': 'warn', Suspended: 'neutral', Provisioning: 'violet', Invited: 'info', Deactivated: 'neutral' };
  const statusBadge = (s, extra = '') => `<span class="badge ${STATUS[s] || 'neutral'} dot">${s}${extra}</span>`;
  const kpi = (label, value, sub, tone = '', icon = 'activity', subCls = '') => `<div class="kpi ${tone}"><div class="kpi-top"><span>${label}</span><span class="icon-well"><i data-lucide="${icon}"></i></span></div><strong>${value}</strong><small class="${subCls}">${sub}</small></div>`;
  const head = (title, sub = '', actions = '') => `<div class="panel-head"><div><h3>${title}</h3>${sub ? `<p>${sub}</p>` : ''}</div>${actions ? `<div class="panel-actions">${actions}</div>` : ''}</div>`;

  /* ---------- runtime fallbacks (v3 FS API may not be present) ---------- */
  function modal({ title, sub = '', html = '', foot = '', size = '', cls = '' }) {
    const o = document.createElement('div');
    o.className = 'overlay ap-temp';
    o.dataset.temp = '1';
    o.innerHTML = `<div class="modal ${size} ${cls}" role="dialog" aria-modal="true"><div class="modal-head"><div><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div><button class="x" data-close aria-label="Close"><i data-lucide="x"></i></button></div><div class="ap-mbody">${html}</div>${foot ? `<div class="modal-foot">${foot}</div>` : ''}</div>`;
    document.body.appendChild(o);
    o.classList.add('open');
    icons(o);
    setTimeout(() => { const f = o.querySelector('input:not([type=checkbox]):not([type=radio]):not([readonly]),textarea'); if (f) f.focus(); }, 60);
    const m = o.querySelector('.modal');
    m.close = () => FS.closeOverlay(o);
    return m;
  }
  function drawer({ title, sub = '', html = '', foot = '', wide = false }) {
    const d = FS.drawer({ title, subtitle: sub, html, foot, wide });
    d.classList.add('ap-drawer');
    d.close = () => FS.closeOverlay(d.closest('.overlay'));
    return d;
  }
  function confirmBox({ title = 'Are you sure?', text = '', okLabel = 'Confirm', danger = false, typeToConfirm = '' }) {
    if (FS.confirm && !typeToConfirm) return FS.confirm({ title, text, okLabel, danger });
    return new Promise((res) => {
      let done = false;
      const m = modal({
        title, size: 'ap-sm',
        html: `<div class="ap-confirm ${danger ? 'danger' : ''}"><span class="icon-tile ${danger ? 'red' : ''}"><i data-lucide="${danger ? 'triangle-alert' : 'circle-help'}"></i></span><p>${text}</p></div>${typeToConfirm ? `<label class="field ap-mt"><span>Type <b class="code">${typeToConfirm}</b> to confirm</span><input data-ap-type autocomplete="off"></label>` : ''}`,
        foot: `<button class="btn secondary" data-close>Cancel</button><button class="btn ${danger ? 'danger solid' : 'primary'}" data-ok ${typeToConfirm ? 'disabled' : ''}>${okLabel}</button>`,
      });
      const ok = m.querySelector('[data-ok]');
      const ti = m.querySelector('[data-ap-type]');
      if (ti) ti.addEventListener('input', () => { ok.disabled = ti.value.trim().toUpperCase() !== typeToConfirm.toUpperCase(); });
      ok.onclick = () => { done = true; res(true); m.close(); };
      const ov = m.closest('.overlay');
      new MutationObserver(() => { if (!ov.isConnected && !done) { done = true; res(false); } }).observe(document.body, { childList: true });
      ov.addEventListener('click', (e) => { if ((e.target === ov || e.target.closest('[data-close]')) && !done) { done = true; res(false); } });
    });
  }
  function celebrate(el) {
    if (FS.celebrate) return FS.celebrate(el);
    const r = el ? el.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
    const b = document.createElement('div');
    b.className = 'ap-burst';
    b.style.left = r.left + r.width / 2 + 'px';
    b.style.top = r.top + r.height / 2 + 'px';
    b.innerHTML = '<span class="ap-burst-ck"><i data-lucide="check"></i></span>' + Array.from({ length: 14 }, (_, i) => `<i class="ap-conf" style="--a:${i * 25.7}deg;--d:${40 + (i % 4) * 14}px;--k:${i % 5}"></i>`).join('');
    document.body.appendChild(b);
    icons(b);
    setTimeout(() => b.remove(), 1100);
  }
  function tick(el, to, o = {}) {
    if (!el) return;
    if (FS.tick) return FS.tick(el, to, { dec: 0, ...o });
    const dec = o.dec ?? 0, pre = o.prefix ?? '', suf = o.suffix ?? '';
    const from = parseFloat(String(el.dataset.v ?? el.textContent).replace(/[^0-9.\-]/g, '')) || 0;
    el.dataset.v = to;
    if (reduce()) { el.textContent = pre + fmt(to, dec) + suf; return; }
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / 650), e = 1 - Math.pow(1 - p, 3);
      el.textContent = pre + fmt(from + (to - from) * e, dec) + suf;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    el.classList.remove('ap-bump'); void el.offsetWidth; el.classList.add('ap-bump');
  }
  async function busy(btn, ms = 1000, label = 'Working…') {
    if (!btn) { await wait(ms); return; }
    const html = btn.innerHTML;
    btn.disabled = true;
    btn.classList.add('ap-busy');
    btn.innerHTML = `<span class="ap-spin"></span>${label}`;
    await wait(reduce() ? 50 : ms);
    btn.disabled = false;
    btn.classList.remove('ap-busy');
    btn.innerHTML = html;
    icons(btn);
  }
  function flash(el) { if (!el) return; el.classList.remove('ap-flash', 'row-flash'); void el.offsetWidth; el.classList.add(el.tagName === 'TR' ? 'row-flash' : 'ap-flash'); }
  function shake(el) { if (!el) return; el.classList.remove('shake', 'ap-shake'); void el.offsetWidth; el.classList.add('ap-shake'); }
  function rowOut(tr, after) { tr.classList.add('row-out'); setTimeout(() => { after ? after() : tr.remove(); }, 340); }
  async function copy(text, what = 'Copied to clipboard') {
    try { await navigator.clipboard.writeText(text); } catch (e) { /* file:// may block clipboard */ }
    toast(what, { tone: 'info', ms: 2200 });
  }
  const formData = (root) => { const o = {}; $$('[name]', root).forEach((f) => { o[f.name] = f.type === 'checkbox' ? f.checked : f.value.trim(); }); return o; };
  function need(root, names) {
    let ok = true;
    names.forEach((n) => { const f = root.querySelector(`[name="${n}"]`); if (f && !f.value.trim()) { ok = false; f.classList.add('ap-invalid'); shake(f.closest('label') || f); f.addEventListener('input', () => f.classList.remove('ap-invalid'), { once: true }); } });
    return ok;
  }
  const opts = (arr, sel) => arr.map((x) => { const [v, l] = Array.isArray(x) ? x : [x, x]; return `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(l)}</option>`; }).join('');
  const stagger = (root, sel) => $$(sel, root).forEach((el, i) => { el.classList.remove('ap-in'); void el.offsetWidth; el.style.setProperty('--i', i); el.classList.add('ap-in'); });
  const seededRand = (seed) => () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };

  /* ---------- shared tenant registry ---------- */
  const MODS = [
    ['acc', 'Accounting', 'landmark'], ['sal', 'Sales & AR', 'shopping-cart'], ['pur', 'Purchases & AP', 'shopping-bag'], ['inv', 'Inventory', 'boxes'],
    ['fa', 'Fixed Assets', 'warehouse'], ['pay', 'Payroll', 'wallet-cards'], ['att', 'Attendance', 'fingerprint'], ['ess', 'Self-Service', 'smartphone'], ['fbr', 'FBR POS', 'plug'],
  ];
  const T = (code, name, city, region, plan, status, users, health, renewal, mods, extra = {}) => ({
    code, name, city, region, plan, status, users, seats: extra.seats || PLAN[plan].seats, health, renewal, mods,
    mrr: extra.mrr != null ? extra.mrr : status === 'Trial' || status === 'Provisioning' ? 0 : PLAN[plan].price, owner: extra.owner, ntn: extra.ntn || '', since: extra.since || '', ...extra,
  });
  const TENANTS = [
    T('ALNOOR', 'Al-Noor Enterprises (Pvt) Ltd', 'Lahore', 'Punjab', 'Growth', 'Active', 48, 82, '14 Mar 2027', 'acc sal pur inv fa pay att ess', { owner: 'Ahmed Raza', ntn: '4271839-6', since: '14 Mar 2024', last: '2 min ago' }),
    T('CRESTEX', 'Crescent Textiles', 'Faisalabad', 'Punjab', 'Business', 'Active', 186, 91, '02 Aug 2027', 'acc sal pur inv fa pay att ess fbr', { owner: 'Imran Sheikh', ntn: '3381920-1', since: '02 Aug 2023', last: '5 min ago' }),
    T('BHATTI', 'Bhatti Traders', 'Gujranwala', 'Punjab', 'Starter', 'Active', 5, 64, '19 Jan 2027', 'acc sal pur', { owner: 'Nadeem Bhatti', ntn: '2219034-7', since: '19 Jan 2025', last: 'Yesterday' }),
    T('ZAMEEN', 'Zameen Builders', 'Islamabad', 'ICT', 'Business', 'Active', 94, 77, '11 Nov 2026', 'acc sal pur inv fa pay att', { owner: 'Zubair Khan', ntn: '4410287-3', since: '11 Nov 2023', last: '1 h ago' }),
    T('INDUSF', 'Indus Foods', 'Karachi', 'Sindh', 'Enterprise', 'Active', 412, 88, '05 May 2027', 'acc sal pur inv fa pay att ess fbr', { owner: 'Farah Siddiqui', seats: 500, ntn: '1093844-0', since: '05 May 2023', last: 'Just now' }),
    T('SHAHEEN', 'Shaheen Logistics', 'Karachi', 'Sindh', 'Growth', 'Active', 41, 58, '23 Feb 2027', 'acc sal pur pay att', { owner: 'Kamran Shah', ntn: '5520918-2', since: '23 Feb 2025', last: '3 h ago' }),
    T('PAKAGRO', 'Pak Agro Mills', 'Multan', 'Punjab', 'Growth', 'Active', 39, 71, '08 Jul 2027', 'acc sal pur inv pay att ess', { owner: 'Rana Aslam', ntn: '3092187-5', since: '08 Jul 2025', last: '20 min ago' }),
    T('KKTECH', 'Karakoram Tech', 'Islamabad', 'ICT', 'Growth', 'Trial', 17, 69, '03 Oct 2026', 'acc sal pur inv fa pay att ess fbr', { owner: 'Sara Baig', since: '17 Sep 2026', trialDays: 2, last: '8 min ago' }),
    T('MARGALA', 'Margalla Pharma', 'Rawalpindi', 'Punjab', 'Business', 'Active', 121, 84, '30 Jun 2027', 'acc sal pur inv fa pay att ess', { owner: 'Dr. Asad Mir', ntn: '4019283-9', since: '30 Jun 2024', last: '12 min ago' }),
    T('RAVIMTR', 'Ravi Motors', 'Lahore', 'Punjab', 'Growth', 'Past due', 33, 41, '12 Oct 2026', 'acc sal pur inv pay att', { owner: 'Tariq Mehmood', ntn: '2287410-4', since: '12 Apr 2024', last: '2 days ago' }),
    T('SUKRICE', 'Sukkur Rice Co.', 'Sukkur', 'Sindh', 'Starter', 'Suspended', 4, 22, '03 Oct 2026', 'acc sal', { owner: 'Ghulam Abbas', ntn: '6610294-8', since: '03 Oct 2025', last: '19 days ago' }),
    T('GWADAR', 'Gwadar Marine', 'Gwadar', 'Balochistan', 'Starter', 'Provisioning', 2, 55, '01 Oct 2027', 'acc sal pur', { owner: 'Baloch Akbar', since: '01 Oct 2026', last: 'Today' }),
    T('PESHSTL', 'Peshawar Steel Works', 'Peshawar', 'KPK', 'Business', 'Read-only', 76, 38, '18 Sep 2026', 'acc sal pur inv fa pay', { owner: 'Hamid Afridi', ntn: '7720193-6', since: '18 Sep 2024', last: '6 days ago' }),
    T('SIALSPT', 'Sialkot Sports Co.', 'Sialkot', 'Punjab', 'Growth', 'Trial', 12, 47, '06 Oct 2026', 'acc sal pur inv', { owner: 'Usman Ghani', since: '22 Sep 2026', trialDays: 5, last: '2 days ago' }),
    T('HYDCRM', 'Hyderabad Ceramics', 'Hyderabad', 'Sindh', 'Starter', 'Active', 5, 79, '27 Mar 2027', 'acc sal pur inv', { owner: 'Mehwish Qureshi', ntn: '8812043-1', since: '27 Mar 2026', last: '1 h ago' }),
    T('SWATFD', 'Swat Valley Foods', 'Mingora', 'KPK', 'Growth', 'Active', 22, 66, '14 Jan 2027', 'acc sal pur inv pay', { owner: 'Fazal Rabbi', ntn: '9920381-2', since: '14 Jan 2026', last: '4 h ago' }),
    T('ISBDGL', 'Islamabad Digital Labs', 'Islamabad', 'ICT', 'Enterprise', 'Active', 268, 93, '01 Dec 2026', 'acc sal pur inv fa pay att ess fbr', { owner: 'Hina Javaid', seats: 300, mrr: 145000, ntn: '4501928-7', since: '01 Dec 2023', last: 'Just now' }),
    T('MULTEX', 'Multan Cotton Exports', 'Multan', 'Punjab', 'Business', 'Past due', 58, 49, '09 Oct 2026', 'acc sal pur inv pay att', { owner: 'Shahid Gill', ntn: '3349102-0', since: '09 Oct 2024', last: 'Yesterday' }),
  ];
  const tenantByCode = (c) => TENANTS.find((t) => t.code === c);
  const STAFF_NAMES = ['Saim Javed', 'Mariam Iqbal', 'Danish Ahmed', 'Areeba Khalid', 'Talha Mehmood', 'Noor Sheikh'];

  /* ================= helpers shared by tenants + tenant 360 ================= */
  const TODAY = new Date(2026, 9, 1);
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const parseD = (s) => { const [d, m, y] = s.split(' '); return new Date(+y, MON.indexOf(m), +d); };
  const fmtD = (dt) => `${String(dt.getDate()).padStart(2, '0')} ${MON[dt.getMonth()]} ${dt.getFullYear()}`;
  const addDays = (s, n) => { const d = parseD(s); d.setDate(d.getDate() + n); return fmtD(d); };
  const daysTo = (s) => Math.round((parseD(s) - TODAY) / 864e5);
  const relDays = (n) => (n === 0 ? 'today' : n > 0 ? `in ${n} d` : `${-n} d ago`);
  function healthFactors(t) {
    const r = seededRand(hash(t.code));
    const j = (base, spread) => clamp(Math.round(base + (r() - 0.5) * spread), 4, 100);
    const pay = t.status === 'Past due' || t.status === 'Read-only' ? 18 : t.status === 'Suspended' ? 5 : t.status === 'Trial' ? 70 : 100;
    return [
      ['Logins / active users', j(t.health + 6, 26), 'log-in', `${Math.round((t.users * j(t.health, 30)) / 100)} of ${t.users} users active this week`],
      ['Modules adopted', Math.round((t.mods.split(' ').length / 9) * 100), 'blocks', `${t.mods.split(' ').length} of 9 modules in use`],
      ['Invoices / week', j(t.health, 34), 'receipt-text', `${Math.round(t.users * 3.4 * (t.health / 80))} invoices posted last 7 days`],
      ['Payment status', pay, 'credit-card', pay > 90 ? 'Paid on time · auto-debit' : pay > 50 ? 'Trial, card on file' : 'Invoice overdue, in dunning'],
      ['Support tickets', j(t.health + 4, 30), 'life-buoy', `${Math.max(0, Math.round((100 - t.health) / 18))} open · median reply 42 min`],
      ['NPS', j(t.health - 2, 36), 'smile', `Last survey ${t.health > 70 ? '+52 promoter' : t.health > 50 ? '+8 passive' : '−24 detractor'}`],
    ];
  }
  const factorBars = (t) => healthFactors(t).map(([n, v, ic, d], i) => `<div class="ap-factor" style="--i:${i}"><span class="ap-factor-ic ${healthTone(v)}"><i data-lucide="${ic}"></i></span><div><div class="ap-factor-top"><b>${n}</b><em>${v}</em></div><div class="ap-bar thin ${healthTone(v)}"><i style="--w:${v}%"></i></div><small>${d}</small></div></div>`).join('');
  const modsCell = (t) => `<span class="ap-mods">${MODS.map(([k, n, ic]) => `<i class="${t.mods.split(' ').includes(k) ? 'on' : ''}" data-tip="${n}${t.mods.split(' ').includes(k) ? '' : ' · off'}"><i data-lucide="${ic}"></i></i>`).join('')}</span>`;

  /* ================= 1 · admin/tenants ================= */
  onRoute('admin/tenants', (sec) => {
    const st = { view: 'all', q: '', plan: '', status: '', region: '', city: '' };
    const sel = new Set();
    const VIEWS = {
      all: ['All', () => true, 'layers'],
      risk: ['At risk', (t) => t.health < 50, 'heart-crack'],
      trials: ['Trials ending', (t) => t.status === 'Trial', 'hourglass'],
      due: ['Past due', (t) => t.status === 'Past due' || t.status === 'Read-only', 'credit-card'],
      ent: ['Enterprise', (t) => t.plan === 'Enterprise', 'gem'],
    };
    const REG = { Punjab: [], Sindh: [], KPK: [], ICT: [], Balochistan: [] };
    TENANTS.forEach((t) => { if (!REG[t.region].includes(t.city)) REG[t.region].push(t.city); });
    const healthy = TENANTS.filter((t) => t.health >= 75).length, watch = TENANTS.filter((t) => t.health >= 50 && t.health < 75).length, risk = TENANTS.filter((t) => t.health < 50).length;
    sec.insertAdjacentHTML('beforeend', `
      <div class="kpi-grid c5">
        ${kpi('Live tenants', '128', '▲ 9 net new this month', '', 'building-2', 'up')}
        ${kpi('In trial', '14', '5 trials end this week', 'yellow', 'hourglass')}
        ${kpi('At risk', '7', 'Health score under 50', 'red', 'heart-crack', 'down')}
        ${kpi('Past due', 'Rs 142,996', '4 tenants · oldest 19 d', 'violet', 'credit-card')}
        ${kpi('Seats in use', '4,312', '▲ 6.1% vs August', 'teal', 'users', 'up')}
      </div>
      <div class="panel ap-strip">
        <div class="ap-strip-h"><b>Portfolio health</b><small>Weighted score from logins, adoption, invoicing, payments, tickets and NPS</small></div>
        <div class="ap-strip-bar"><div class="stackbar ap-hbar"><i style="width:${(healthy / TENANTS.length) * 100}%;background:var(--good)" data-tip="Healthy · ${healthy}"></i><i style="width:${(watch / TENANTS.length) * 100}%;background:var(--warn)" data-tip="Watch · ${watch}"></i><i style="width:${(risk / TENANTS.length) * 100}%;background:var(--danger)" data-tip="At risk · ${risk}"></i></div>
          <div class="legend"><span><i style="background:var(--good)"></i>Healthy 75+ <b>${healthy}</b></span><span><i style="background:var(--warn)"></i>Watch 50–74 <b>${watch}</b></span><span><i style="background:var(--danger)"></i>At risk &lt;50 <b>${risk}</b></span></div></div>
        <div class="ap-strip-regions">${Object.keys(REG).map((r) => `<div><small>${r}</small><b>${TENANTS.filter((t) => t.region === r).length}</b></div>`).join('')}</div>
      </div>
      <div class="ap-views chips" role="tablist">${Object.entries(VIEWS).map(([k, [l, f, ic]]) => `<button class="${k === 'all' ? 'active' : ''}" data-view="${k}"><svg data-lucide="${ic}" class="ap-vic"></svg>${l} <i>${TENANTS.filter(f).length}</i></button>`).join('')}</div>
      <div class="toolbar" data-plain-search>
        <label class="search-field"><i data-lucide="search"></i><input data-f="q" placeholder="Search name, code, city or owner…"></label>
        <select data-f="plan"><option value="">All plans</option>${opts(Object.keys(PLAN))}</select>
        <select data-f="status"><option value="">All statuses</option>${opts(Object.keys(STATUS).slice(0, 6))}</select>
        <select data-f="region"><option value="">All regions</option>${opts(Object.keys(REG))}</select>
        <select data-f="city"><option value="">All cities</option></select>
        <span class="spacer"></span>
        <button class="btn ghost sm" data-reset><i data-lucide="rotate-ccw"></i>Reset</button>
      </div>
      <div class="panel flush">
        ${head('Tenants', '<span data-count-label>18 shown</span> · click a row for a quick view, tick rows for bulk actions', '<button class="btn secondary sm" data-toast="Column layout saved as your default"><i data-lucide="columns-3"></i>Columns</button>')}
        <div class="table-wrap"><table class="tbl ap-ttbl" data-plain>
          <thead><tr><th class="th-check"><input type="checkbox" data-all aria-label="Select all"></th><th>Tenant</th><th>Plan</th><th>Health</th><th class="num">MRR (Rs)</th><th>Seats</th><th>Modules</th><th>Status</th><th>Renewal</th><th></th></tr></thead>
          <tbody></tbody></table></div>
        <div class="table-foot"><span>View MRR <b class="tnum" data-mrr>Rs 0</b></span><div class="pager"><button>‹</button><button class="active">1</button><button>2</button><button>…</button><button>8</button><button>›</button></div></div>
      </div>`);
    const tb = $('tbody', sec);
    const citySel = $('[data-f=city]', sec);
    const fillCities = () => { const list = st.region ? REG[st.region] : [].concat(...Object.values(REG)); citySel.innerHTML = `<option value="">All cities</option>${opts(list.sort(), st.city)}`; };
    fillCities();
    const filtered = () => TENANTS.filter((t) => VIEWS[st.view][1](t) && (!st.plan || t.plan === st.plan) && (!st.status || t.status === st.status) && (!st.region || t.region === st.region) && (!st.city || t.city === st.city) && (!st.q || `${t.name} ${t.code} ${t.city} ${t.owner}`.toLowerCase().includes(st.q)));
    const row = (t) => {
      const d = daysTo(t.renewal);
      const sub = t.status === 'Trial' ? `<small class="ap-warn-t">Trial ends ${relDays(t.trialDays)}</small>` : `<small class="${d < 0 ? 'ap-danger-t' : ''}">${relDays(d)}</small>`;
      return `<tr data-code="${t.code}" class="${sel.has(t.code) ? 'selected' : ''}">
        <td class="th-check"><input type="checkbox" ${sel.has(t.code) ? 'checked' : ''} aria-label="Select ${esc(t.name)}"></td>
        <td><div class="cell-user">${logo(t.name)}<div><b>${esc(t.name)}</b><small>${t.code} · ${t.city}</small></div></div></td>
        <td>${planPill(t.plan)}</td>
        <td>${ring(t.health)}</td>
        <td class="num">${t.mrr ? fmt(t.mrr) : '<span class="zero">—</span>'}</td>
        <td>${meter(t.users, t.seats, { compact: true, text: `${t.users}/${fmt(t.seats)}` })}</td>
        <td>${modsCell(t)}</td>
        <td>${statusBadge(t.status)}</td>
        <td>${t.renewal}${sub}</td>
        <td class="actions"><button class="icon-btn-sm" data-menu="off" data-more aria-label="More actions"><i data-lucide="more-horizontal"></i></button></td></tr>`;
    };
    const mrrEl = $('[data-mrr]', sec);
    function render(anim = true) {
      const list = filtered();
      tb.innerHTML = list.length ? list.map(row).join('') : `<tr class="no-results"><td colspan="10"><div class="empty-state"><span class="icon-well lg"><i data-lucide="search-x"></i></span><h4>No tenants match</h4><p>Try another view or clear the filters.</p><button class="btn secondary sm" data-reset>Reset filters</button></div></td></tr>`;
      $('[data-count-label]', sec).textContent = `${list.length} shown`;
      tick(mrrEl, list.reduce((s, t) => s + t.mrr, 0), { prefix: 'Rs ' });
      if (anim) $$('tr', tb).forEach((tr, k) => { tr.style.setProperty('--ri', Math.min(k, 16)); tr.classList.add('ap-row-in'); });
      icons(tb);
      syncAll();
    }
    function syncAll() {
      const vis = filtered().map((t) => t.code);
      const all = $('[data-all]', sec);
      all.checked = vis.length > 0 && vis.every((c) => sel.has(c));
      all.indeterminate = !all.checked && vis.some((c) => sel.has(c));
      bulkSync();
    }
    /* own bulk bar (global one has fixed actions) */
    let bulk = $('#ap-tbulk');
    if (!bulk) {
      bulk = document.createElement('div');
      bulk.id = 'ap-tbulk';
      bulk.className = 'bulkbar ap-bulk';
      bulk.innerHTML = `<b><i>0</i>selected</b><button data-b="trial"><i data-lucide="calendar-plus"></i>Extend trial</button><button data-b="plan"><i data-lucide="arrow-up-down"></i>Change plan</button><button data-b="notice"><i data-lucide="send"></i>Send notice</button><button data-b="suspend" class="danger"><i data-lucide="pause-circle"></i>Suspend</button><button data-b="clear" aria-label="Clear selection"><i data-lucide="x"></i></button>`;
      document.body.appendChild(bulk);
      icons(bulk);
    }
    function bulkSync() { $('b i', bulk).textContent = sel.size; bulk.classList.toggle('on', sel.size > 0 && location.hash === '#/admin/tenants'); }
    FS.onEnter((r) => r !== 'admin/tenants', () => bulk.classList.remove('on'));
    FS.onEnter('admin/tenants', () => bulkSync());
    const chosen = () => TENANTS.filter((t) => sel.has(t.code));
    const clearSel = () => { sel.clear(); render(false); };
    const flashRows = (codes) => setTimeout(() => codes.forEach((c) => flash($(`tr[data-code="${c}"]`, tb))), 30);

    function extendTrial(list) {
      const m = modal({
        title: 'Extend trial', sub: `${list.length} tenant${list.length > 1 ? 's' : ''} selected`,
        html: `<div class="ap-lbl">Extend by</div><div class="seg ap-mb" data-days><button data-d="7" class="active">7 days</button><button data-d="14">14 days</button><button data-d="30">30 days</button></div>
          <div class="ap-chiplist">${list.map((t) => `<span class="pill">${logo(t.name, 'xs')}${esc(t.name)}${t.status === 'Trial' ? '' : ' <em class="ap-muted-t">· not on trial</em>'}</span>`).join('')}</div>
          <label class="field ap-mt"><span>Internal note</span><textarea name="note" rows="2" placeholder="e.g. Waiting on FBR POS go-live"></textarea></label>
          <label class="check ap-mt"><input type="checkbox" checked> Email the tenant owner about the new end date</label>`,
        foot: `<button class="btn secondary" data-close>Cancel</button><button class="btn primary" data-ok><i data-lucide="calendar-plus"></i>Extend</button>`,
      });
      m.querySelector('[data-ok]').onclick = async (e) => {
        const d = +$('[data-days] .active', m).dataset.d;
        await busy(e.currentTarget, 700, 'Extending…');
        const tr = list.filter((t) => t.status === 'Trial');
        tr.forEach((t) => { t.trialDays += d; t.renewal = addDays(t.renewal, d); });
        m.close(); clearSel(); flashRows(tr.map((t) => t.code));
        toast(tr.length ? `${tr.length} trial${tr.length > 1 ? 's' : ''} extended by ${d} days${tr.length < list.length ? ` · ${list.length - tr.length} skipped (not on trial)` : ''}` : 'None of the selected tenants are on trial', { tone: tr.length ? 'good' : 'warn' });
      };
    }
    function changePlan(list) {
      const m = modal({
        title: 'Change plan', sub: `${list.length} tenant${list.length > 1 ? 's' : ''} · prorated from today`, size: 'wide',
        html: `<div class="radio-cards ap-plans">${Object.entries(PLAN).map(([p, v], i) => `<label class="radio-card"><input type="radio" name="plan" value="${p}" ${i === 1 ? 'checked' : ''}><div><b>${p}</b><small>${p === 'Enterprise' ? 'Custom · from Rs 145,000' : rs(v.price) + ' / month'} · ${p === 'Enterprise' ? 'Unlimited' : 'up to ' + v.seats} users</small></div></label>`).join('')}</div>
          <div class="banner info ap-mt"><i data-lucide="info"></i><div><b>Proration</b><p>Upgrades are charged today for the remaining days of the cycle; downgrades apply at next renewal.</p></div></div>`,
        foot: `<button class="btn secondary" data-close>Cancel</button><button class="btn primary" data-ok>Apply plan</button>`,
      });
      m.querySelector('[data-ok]').onclick = async (e) => {
        const p = $('input[name=plan]:checked', m).value;
        await busy(e.currentTarget, 800, 'Applying…');
        list.forEach((t) => { t.plan = p; t.seats = PLAN[p].seats; if (t.mrr) t.mrr = PLAN[p].price; });
        m.close(); clearSel(); flashRows(list.map((t) => t.code));
        toast(`${list.length} tenant${list.length > 1 ? 's' : ''} moved to ${p}`, { tone: 'good' });
      };
    }
    function sendNotice(list) {
      const m = modal({
        title: 'Send notice', sub: `To the owners of ${list.length} tenant${list.length > 1 ? 's' : ''}`,
        html: `<div class="form-grid c1"><label><span>Template</span><select name="tpl">${opts(['Payment reminder', 'Trial ending', 'Planned maintenance', 'Plan change confirmation', 'Custom message'])}</select></label>
          <label><span>Message</span><textarea name="msg" rows="4">Assalam-o-Alaikum {{owner_name}}, a quick note from Finsoft Cloud about your {{plan}} subscription…</textarea></label></div>
          <div class="ap-lbl ap-mt">Channels</div><div class="row ap-wrap"><label class="check"><input type="checkbox" checked> Email</label><label class="check"><input type="checkbox" checked> SMS</label><label class="check"><input type="checkbox"> WhatsApp</label><label class="check"><input type="checkbox" checked> In-app banner</label></div>`,
        foot: `<button class="btn secondary" data-close>Cancel</button><button class="btn primary" data-ok><i data-lucide="send"></i>Send now</button>`,
      });
      m.querySelector('[data-ok]').onclick = async (e) => { await busy(e.currentTarget, 900, 'Queuing…'); m.close(); clearSel(); toast(`Notice queued to ${list.length} owner${list.length > 1 ? 's' : ''} · track it in Communications`, { action: { label: 'Open', fn: () => FS.go('admin/comms') } }); };
    }
    async function suspend(list) {
      const ok = await confirmBox({ title: `Suspend ${list.length} tenant${list.length > 1 ? 's' : ''}?`, text: `${list.map((t) => `<b>${esc(t.name)}</b>`).join(', ')} will be signed out and blocked. Data is retained and scheduled jobs pause until reactivated.`, okLabel: 'Suspend', danger: true });
      if (!ok) return;
      const prev = list.map((t) => [t, t.status]);
      list.forEach((t) => { t.status = 'Suspended'; });
      clearSel(); flashRows(list.map((t) => t.code));
      toast(`${list.length} tenant${list.length > 1 ? 's' : ''} suspended`, { tone: 'danger', undo: () => { prev.forEach(([t, s]) => { t.status = s; }); render(false); } });
    }
    bulk.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const list = chosen();
      ({ trial: () => extendTrial(list), plan: () => changePlan(list), notice: () => sendNotice(list), suspend: () => suspend(list), clear: clearSel })[b.dataset.b]();
    });

    /* quick view */
    function quickView(t) {
      const d = drawer({
        title: esc(t.name), sub: `${t.code} · ${t.city}, ${t.region}`,
        html: `<div class="ap-qv">
          <div class="ap-qv-top">${logo(t.name, 'lg')}<div class="ap-qv-meta">${planPill(t.plan)} ${statusBadge(t.status)}<small>Customer since ${t.since} · owner ${esc(t.owner)}</small></div>${ring(t.health, 72, 7)}</div>
          <div class="ap-qv-stats"><div><small>MRR</small><b>${t.mrr ? rs(t.mrr) : '—'}</b></div><div><small>Seats</small><b>${t.users} / ${fmt(t.seats)}</b></div><div><small>Renewal</small><b>${t.renewal}</b></div></div>
          <h4 class="ap-h4">Health breakdown</h4><div class="ap-factors">${factorBars(t)}</div>
          <h4 class="ap-h4">Contacts</h4>
          <div class="list">${[[t.owner, 'Owner · ' + t.code.toLowerCase() + '.owner@mail.pk'], ['Accounts desk', 'Billing · accounts@' + t.code.toLowerCase() + '.pk'], ['Mariam Iqbal', 'Finsoft account manager']].map(([n, s]) => `<div class="list-item">${avatar(n)}<div><b>${esc(n)}</b><small>${s}</small></div></div>`).join('')}</div>
          <h4 class="ap-h4">Last activity</h4>
          <div class="timeline">${[['good', 'Signed in', t.last + ' · web · Chrome'], ['info', 'Posted 14 vouchers', 'Today 10:12'], [t.status === 'Past due' ? 'danger' : 'good', t.status === 'Past due' ? 'Card payment failed' : 'Invoice paid', '01 Oct 2026 · ' + (t.status === 'Past due' ? 'JazzCash retry scheduled' : 'auto-debit')]].map(([c, b, s]) => `<div class="tl-item"><span class="tl-dot ${c}"></span><div><b>${b}</b><small>${s}</small></div></div>`).join('')}</div>
        </div>`,
        foot: `<button class="btn secondary" data-qv-imp><i data-lucide="venetian-mask"></i>Impersonate</button><a class="btn primary" href="#/admin/tenants/view" data-close><i data-lucide="panel-right-open"></i>Open Tenant 360</a>`,
      });
      d.querySelector('[data-qv-imp]').onclick = () => { d.close(); toast(`Impersonation needs a reason: opening Tenant 360 for ${t.code}`, { tone: 'info' }); FS.go('admin/tenants/view'); };
    }

    sec.addEventListener('click', (e) => {
      const v = e.target.closest('[data-view]');
      if (v) { st.view = v.dataset.view; render(); return; }
      if (e.target.closest('[data-reset]')) {
        Object.assign(st, { view: 'all', q: '', plan: '', status: '', region: '', city: '' });
        $$('[data-f]', sec).forEach((f) => { f.value = ''; });
        $$('[data-view]', sec).forEach((b) => b.classList.toggle('active', b.dataset.view === 'all'));
        fillCities(); render(); return;
      }
      if (e.target.closest('[data-ap-act=export-tenants]')) { busy(e.target.closest('button'), 900, 'Exporting…').then(() => toast(`${filtered().length} tenants exported to tenants-2026-10-01.csv`)); return; }
      const tr = e.target.closest('tbody tr[data-code]');
      if (!tr) return;
      const t = tenantByCode(tr.dataset.code);
      const more = e.target.closest('[data-more]');
      if (more) {
        e.stopPropagation();
        FS.menu(more, [
          { label: 'Open Tenant 360', icon: 'panel-right-open', onClick: () => FS.go('admin/tenants/view') },
          { label: 'Quick view', icon: 'eye', onClick: () => quickView(t) },
          { label: 'Change plan', icon: 'arrow-up-down', onClick: () => changePlan([t]) },
          { label: 'Extend trial', icon: 'calendar-plus', onClick: () => extendTrial([t]) },
          { label: 'Send notice', icon: 'send', onClick: () => sendNotice([t]) },
          { sep: true },
          t.status === 'Suspended' ? { label: 'Reactivate', icon: 'play-circle', onClick: () => { t.status = 'Active'; render(false); flashRows([t.code]); toast(`${t.name} reactivated`); } } : { label: 'Suspend', icon: 'pause-circle', danger: true, onClick: () => suspend([t]) },
        ]);
        return;
      }
      if (e.target.closest('input[type=checkbox], a, button')) return;
      quickView(t);
    });
    sec.addEventListener('change', (e) => {
      const f = e.target.closest('[data-f]');
      if (f) { st[f.dataset.f] = f.value; if (f.dataset.f === 'region') { st.city = ''; fillCities(); } render(); return; }
      if (e.target.matches('[data-all]')) { filtered().forEach((t) => (e.target.checked ? sel.add(t.code) : sel.delete(t.code))); $$('tr[data-code]', tb).forEach((tr) => { tr.classList.toggle('selected', e.target.checked); $('input', tr).checked = e.target.checked; }); syncAll(); return; }
      const ck = e.target.closest('tbody input[type=checkbox]');
      if (ck) { const tr = ck.closest('tr'); ck.checked ? sel.add(tr.dataset.code) : sel.delete(tr.dataset.code); tr.classList.toggle('selected', ck.checked); syncAll(); }
    });
    $('[data-f=q]', sec).addEventListener('input', (e) => { st.q = e.target.value.trim().toLowerCase(); e.target.closest('.search-field').classList.toggle('has-val', !!st.q); render(false); });
    render();
  });

  /* ================= 2 · admin/tenants/view (Tenant 360) ================= */
  onRoute('admin/tenants/view', (sec) => {
    const t = tenantByCode('ALNOOR');
    const USERS = [
      ['Ahmed Raza', 'Tenant Owner', 'Lahore HQ', 'On', 'Today 08:12', 'Active'],
      ['Sana Javed', 'Finance Manager', 'Lahore HQ', 'On', 'Today 09:31', 'Active'],
      ['Hira Ali', 'Accountant', 'Lahore HQ', 'On', 'Today 09:05', 'Active'],
      ['Ayesha Noor', 'HR Manager', 'Lahore HQ', 'On', 'Yesterday 17:44', 'Active'],
      ['Bilal Khan', 'Sales Executive', 'Karachi', 'On', '30 Sep 2026', 'Active'],
      ['Usman Ali', 'Procurement', 'Faisalabad', 'On', '29 Sep 2026', 'Active'],
      ['Umar Farooq', 'Accountant', 'Karachi', 'On', 'Today 10:02', 'Active'],
      ['Zainab Raza', 'Payroll Officer', 'Lahore HQ', 'On', 'Today 07:55', 'Active'],
      ['Hamza Butt', 'Cashier', 'Islamabad', 'Off', '28 Sep 2026', 'Active'],
      ['Kashif Ali', 'Auditor (read-only)', 'Lahore HQ', 'Off', '12 Sep 2026', 'Active'],
      ['Faisal Qureshi', 'Store Keeper', 'Islamabad', 'Pending', '—', 'Invited'],
    ].map(([name, role, branch, mfa, last, status]) => ({ name, role, branch, mfa, last, status, email: name.toLowerCase().replace(/\s+/g, '.') + '@alnoor.com.pk' }));
    const ROLES = ['Tenant Owner', 'Finance Manager', 'Accountant', 'HR Manager', 'Payroll Officer', 'Sales Executive', 'Procurement', 'Cashier', 'Store Keeper', 'Auditor (read-only)'];
    const BRANCHES = ['Lahore HQ', 'Karachi', 'Islamabad', 'Faisalabad'];
    let seatsUsed = t.users;
    const sub = { plan: t.plan, cycle: 'Annual', price: 249990 };
    const USAGE = [
      ['Users', 'users', seatsUsed, 50, '', [38, 41, 43, 44, 46, 48]],
      ['Invoices / month', 'receipt-text', 3214, 5000, '', [2410, 2620, 2880, 2950, 3090, 3214]],
      ['Storage', 'hard-drive', 19.4, 50, ' GB', [12, 13.6, 15, 16.2, 17.9, 19.4]],
      ['API calls', 'code-xml', 412000, 1000000, '', [210, 260, 300, 340, 388, 412].map((x) => x * 1000)],
      ['SMS', 'message-square-text', 1840, 2000, '', [920, 1100, 1240, 1500, 1690, 1840]],
      ['FBR submissions', 'plug', 8940, 10000, '', [5100, 6200, 7010, 7700, 8300, 8940]],
    ];
    const short = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? Math.round(n / 1000) + 'k' : n % 1 ? n.toFixed(1) : fmt(n));
    const userRow = (u, i) => `<tr data-u="${i}" class="${u.status === 'Deactivated' ? 'ap-dim' : ''}">
      <td><div class="cell-user">${avatar(u.name)}<div><b>${esc(u.name)}</b><small>${esc(u.email)}</small></div></div></td>
      <td>${esc(u.role)}</td><td>${esc(u.branch)}</td>
      <td data-mfa>${u.mfa === 'On' ? '<span class="badge good"><i data-lucide="shield-check"></i>On</span>' : u.mfa === 'Reset' ? '<span class="badge warn"><i data-lucide="rotate-ccw"></i>Re-enrol</span>' : u.mfa === 'Pending' ? '<span class="badge neutral">Pending</span>' : '<span class="badge danger"><i data-lucide="shield-off"></i>Off</span>'}</td>
      <td>${esc(u.last)}</td><td>${statusBadge(u.status)}</td>
      <td class="actions"><button class="icon-btn-sm" data-menu="off" data-umore aria-label="User actions"><i data-lucide="more-horizontal"></i></button></td></tr>`;
    const usageCard = ([l, ic, used, lim, unit, hist], i) => {
      const pct = (used / lim) * 100, mx = Math.max(...hist, lim * 0.2);
      return `<div class="panel ap-ucard ${meterTone(pct)}" style="--i:${i}"><div class="ap-ucard-h"><span class="icon-tile ${pct >= 100 ? 'red' : pct >= 80 ? 'orange' : ''}"><i data-lucide="${ic}"></i></span><div><b>${l}</b><small>${pct >= 80 ? (pct >= 100 ? 'Limit reached' : 'Approaching limit') : 'Within plan'}</small></div><em>${Math.round(pct)}%</em></div>
        <div class="ap-ucard-n"><b>${short(used)}${unit}</b><span>of ${short(lim)}${unit}</span></div>${meter(used, lim, { text: '' })}
        <div class="ap-minibars">${hist.map((h, k) => `<i style="--h:${(h / mx) * 100}%" data-tip="${['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'][k]} · ${short(h)}${unit}"></i>`).join('')}</div></div>`;
    };
    const FLAGS = [
      ['Accounting Core', 'landmark', true, 'Included'], ['Sales & AR', 'shopping-cart', true, 'Included'], ['Purchases & AP', 'shopping-bag', true, 'Included'], ['Inventory', 'boxes', true, 'Included'],
      ['Fixed Assets', 'warehouse', true, 'Add-on · Rs 2,500/mo'], ['Payroll', 'wallet-cards', true, 'Included'], ['Attendance', 'fingerprint', true, 'Included'], ['Employee Self-Service', 'smartphone', true, 'Included'],
      ['FBR POS integration', 'plug', false, 'Business plan', true], ['Recruitment', 'briefcase', false, 'Business plan', true],
    ];
    const BETA = [['AI bank-rule suggestions', 'wand-sparkles', true, 'Beta · 12% of tenants'], ['New POS counter', 'monitor-smartphone', false, 'Beta · invite only'], ['Urdu interface', 'languages', true, 'Rollout 60%'], ['Raast auto-collect', 'zap', false, 'Pilot']];
    const ACT = [
      ['admin', 'venetian-mask', 'Mariam Iqbal impersonated Sana Javed', '01 Oct 2026 08:31 · reason TCK-2291 bank reconciliation mismatch · 14 min', 'violet'],
      ['tenant', 'user-plus', 'Ahmed Raza invited Faisal Qureshi', '30 Sep 2026 16:20 · Store Keeper · Islamabad', 'info'],
      ['admin', 'users', 'Seat limit raised 40 → 50', '30 Sep 2026 11:47 · by Mariam Iqbal', 'good'],
      ['billing', 'receipt-text', 'Invoice FS-INV-2026-01611 paid', '01 Sep 2026 · Meezan direct debit · Rs 2,900', 'good'],
      ['billing', 'puzzle', 'Fixed Assets add-on enabled', '01 Sep 2026 10:02 · by Danish Ahmed', 'info'],
      ['security', 'shield-check', 'MFA enforcement turned on', '02 Jan 2026 · by Ahmed Raza (tenant)', 'good'],
      ['security', 'log-in', '5 failed sign-ins blocked', '18 Dec 2025 · IP 39.45.x.x · Lahore', 'danger'],
      ['billing', 'repeat', 'Plan renewed: Growth annual', '14 Mar 2026 · Rs 249,990', 'good'],
      ['admin', 'rocket', 'Tenant provisioned on Starter', '14 Mar 2024 · by Saim Javed', 'info'],
    ];
    const INV = [['FS-INV-2026-01842', 'Oct 2026 add-on', '01 Oct 2026', 2500, 'Open'], ['FS-INV-2026-01611', 'Sep 2026 add-on', '01 Sep 2026', 2500, 'Paid'], ['FS-INV-2026-00412', 'Mar 2026 – Feb 2027', '14 Mar 2026', 249990, 'Paid'], ['FS-INV-2025-00388', 'Mar 2025 – Feb 2026', '14 Mar 2025', 199990, 'Paid'], ['FS-INV-2024-00121', 'Mar 2024 – Feb 2025', '14 Mar 2024', 179990, 'Paid']];
    const KEYS = [['Production · ERP sync', 'fs_live_7Hq2LmX9vR4tB8nK3f9a', 'read:vouchers write:invoices', '14 Mar 2026', '2 min ago'], ['Power BI connector', 'fs_live_Pq81ZsW0cYe5JkU2d71c', 'read:reports', '02 Jun 2026', 'Today 06:00']];
    const mask = (k) => k.slice(0, 8) + '••••••••••••' + k.slice(-4);

    sec.insertAdjacentHTML('beforeend', `
      <div class="ap-imp-bar" hidden><span class="ap-pulse"></span><i data-lucide="venetian-mask"></i><div><b>Impersonating <span data-imp-user>Sana Javed</span> at Al-Noor Enterprises</b><small>Read-only · every action is recorded in the platform audit log</small></div><span class="spacer"></span><b class="ap-imp-clock tnum" data-imp-clock>30:00</b><button class="btn lime sm" data-imp-end><i data-lucide="log-out"></i>End session</button></div>
      <div class="panel ap-profile">
        ${logo(t.name, 'xl')}
        <div class="ap-profile-main">
          <h2>${esc(t.name)}</h2>
          <div class="row ap-wrap"><span data-p-plan>${planPill(sub.plan)}</span><span class="badge neutral">Annual</span><span data-p-status>${statusBadge('Active')}</span><span class="badge info"><i data-lucide="shield-check"></i>MFA enforced</span></div>
          <div class="ap-profile-meta">
            <div><small>Region</small><b>Punjab · Lahore</b></div><div><small>NTN</small><b class="tnum">4271839-6</b></div><div><small>STRN</small><b class="tnum">32-77-8761-234-55</b></div><div><small>Created</small><b>14 Mar 2024</b></div><div><small>Workspace</small><b>alnoor.finsoft.pk</b></div><div><small>Account manager</small><b>Mariam Iqbal</b></div>
          </div>
        </div>
        <div class="ap-profile-health">${ring(t.health, 92, 8)}<small>Health · <b class="ap-good-t">Healthy</b></small><span class="pill"><i data-lucide="trending-up"></i>+6 in 30 d</span></div>
        <div class="ap-profile-actions">
          <button class="btn primary" data-act="imp"><i data-lucide="venetian-mask"></i>Impersonate</button>
          <button class="btn secondary" data-act="plan"><i data-lucide="arrow-up-down"></i>Change plan</button>
          <button class="btn secondary" data-act="export"><i data-lucide="download"></i>Export data</button>
          <button class="btn danger" data-act="suspend"><i data-lucide="pause-circle"></i><span>Suspend</span></button>
        </div>
      </div>
      <div data-tabs class="ap-t360">
        <div class="tabs">
          <button class="active" data-tab="ov"><i data-lucide="layout-grid"></i>Overview</button>
          <button data-tab="users"><i data-lucide="users"></i>Users <i data-ucount>${USERS.length}</i></button>
          <button data-tab="usage"><i data-lucide="gauge"></i>Usage</button>
          <button data-tab="billing"><i data-lucide="credit-card"></i>Billing</button>
          <button data-tab="flags"><i data-lucide="toggle-right"></i>Feature flags</button>
          <button data-tab="int"><i data-lucide="webhook"></i>Integrations</button>
          <button data-tab="act"><i data-lucide="history"></i>Activity</button>
        </div>
        <div class="tab-pane active" data-pane="ov">
          <div class="split ap-split-wide">
            <div class="stack">
              <div class="panel">${head('Health score breakdown', 'Six signals, weighted. Updated hourly.', '<span class="pill"><i data-lucide="sparkles"></i>Likely to expand</span>')}<div class="ap-factors two">${factorBars(t)}</div></div>
              <div class="panel">${head('Usage this cycle', 'Against Growth plan limits', '<button class="btn ghost sm" data-goto-tab="usage">All meters<i data-lucide="arrow-right"></i></button>')}
                <div class="ap-ov-meters">${USAGE.slice(0, 4).map(([l, ic, u, lim, unit]) => meter(u, lim, { label: `<i data-lucide="${ic}"></i>${l}`, text: `${short(u)}${unit} / ${short(lim)}${unit}` })).join('')}</div></div>
            </div>
            <div class="stack">
              <div class="panel ap-subcard"><div class="ap-subcard-top"><span class="icon-tile lime"><i data-lucide="repeat"></i></span><div><small>Subscription</small><b data-sub-plan>Growth · Annual</b></div><span class="badge good dot">Auto-renew</span></div>
                <div class="ap-subcard-price"><b class="num-big">Rs 249,990</b><small>/ year · Rs 20,833 per month effective</small></div>
                <div class="dl"><div><span>Next renewal</span><b>14 Mar 2027 · in 164 d</b></div><div><span>Seats</span><b><span data-seats>${seatsUsed}</span> of 50</b></div><div><span>Add-ons</span><b>Fixed Assets · Rs 2,500/mo</b></div><div><span>Payment</span><b>Meezan direct debit</b></div><div><span>Lifetime value</span><b>Rs 674,973</b></div></div></div>
              <div class="panel">${head('Notes', 'Visible to platform staff only')}
                <div class="ap-note-add"><textarea rows="2" placeholder="Add a note… e.g. CFO asked about Business plan in Q3"></textarea><button class="btn primary sm" data-note><i data-lucide="plus"></i>Add</button></div>
                <div class="ap-notes" data-notes>
                  <div class="ap-note">${avatar('Mariam Iqbal', 'xs')}<div><p>Interested in FBR POS for 3 Karachi outlets. Demo booked for 08 Oct.</p><small>Mariam Iqbal · 29 Sep</small></div></div>
                  <div class="ap-note">${avatar('Danish Ahmed', 'xs')}<div><p>Prefers annual invoice in March; send PO copy to accounts@alnoor.com.pk.</p><small>Danish Ahmed · 14 Mar</small></div></div>
                </div></div>
            </div>
          </div>
        </div>
        <div class="tab-pane" data-pane="users">
          <div class="panel flush">
            <div class="toolbar ap-utools" data-plain-search>
              <label class="search-field"><i data-lucide="search"></i><input data-usearch placeholder="Search users, roles or branches…"></label>
              <select data-urole><option value="">All roles</option>${opts(ROLES)}</select>
              <span class="spacer"></span>
              <span class="ap-seatline">${meter(seatsUsed, 50, { compact: true, text: `<span data-seats>${seatsUsed}</span> / 50 seats` })}</span>
              <button class="btn primary sm" data-invite><i data-lucide="user-plus"></i>Invite / Add user</button>
            </div>
            <div class="table-wrap"><table class="tbl ap-utbl" data-plain><thead><tr><th>User</th><th>Role</th><th>Branch</th><th>MFA</th><th>Last sign-in</th><th>Status</th><th></th></tr></thead><tbody></tbody></table></div>
          </div>
        </div>
        <div class="tab-pane" data-pane="usage">
          <div class="banner warn"><i data-lucide="gauge"></i><div><b>3 meters above 80%</b><p>SMS, FBR submissions and users are close to Growth limits. Upselling to Business lifts all of them.</p></div><a class="btn secondary sm" href="#/admin/usage">Usage &amp; Quotas</a></div>
          <div class="grid-3 ap-ugrid">${USAGE.map(usageCard).join('')}</div>
        </div>
        <div class="tab-pane" data-pane="billing">
          <div class="split ap-split-wide">
            <div class="panel flush">${head('Invoices', 'Platform invoices for ALNOOR', '<a class="btn ghost sm" href="#/admin/invoices">All invoices<i data-lucide="arrow-right"></i></a>')}
              <div class="table-wrap"><table class="tbl" data-plain><thead><tr><th>Invoice</th><th>Period</th><th>Issued</th><th class="num">Amount (Rs)</th><th class="num">PST 16%</th><th>Status</th></tr></thead><tbody>
              ${INV.map(([n, p, d, a, s]) => `<tr><td><b class="tnum">${n}</b></td><td>${p}</td><td>${d}</td><td class="num">${fmt(a, 2)}</td><td class="num">${fmt(a * 0.16, 2)}</td><td>${s === 'Paid' ? '<span class="badge good dot">Paid</span>' : '<span class="badge warn dot">Open</span>'}</td></tr>`).join('')}</tbody></table></div></div>
            <div class="stack">
              <div class="panel">${head('Payment methods')}
                <div class="ap-pm primary"><span class="ap-pm-ic"><i data-lucide="landmark"></i></span><div><b>Meezan Bank direct debit</b><small>A/C ••••0123 · mandate active</small></div><span class="badge good">Primary</span></div>
                <div class="ap-pm"><span class="ap-pm-ic jc"><i data-lucide="smartphone"></i></span><div><b>JazzCash wallet</b><small>0300 •••• 412 · fallback for retries</small></div><span class="badge neutral">Backup</span></div></div>
              <div class="panel">${head('Dunning state', 'Policy: 7 d grace → 7 d read-only → suspend')}
                <div class="ap-dstate">${['Paid', 'Grace', 'Read-only', 'Suspended'].map((s, i) => `<div class="${i === 0 ? 'on' : ''}"><i></i><span>${s}</span></div>`).join('')}</div>
                <div class="dl ap-mt"><div><span>Balance due</span><b>Rs 2,900</b></div><div><span>Due</span><b>15 Oct 2026</b></div><div><span>Failed attempts</span><b>0</b></div></div></div>
            </div>
          </div>
        </div>
        <div class="tab-pane" data-pane="flags">
          <div class="grid-2">
            <div class="panel">${head('Modules', 'Toggles apply instantly for all users of ALNOOR', '<a class="btn ghost sm" href="#/admin/features">Global rollout<i data-lucide="arrow-right"></i></a>')}<div class="ap-flags">${FLAGS.map(([n, ic, on, note, locked]) => `<label class="ap-flag ${locked ? 'locked' : ''}"><span class="icon-well"><i data-lucide="${ic}"></i></span><div><b>${n}</b><small>${note}</small></div>${locked ? '<span class="badge violet"><i data-lucide="lock"></i>Upgrade</span>' : ''}<span class="switch"><input type="checkbox" ${on ? 'checked' : ''} ${locked ? 'disabled' : ''} data-flag="${n}"><i></i></span></label>`).join('')}</div></div>
            <div class="panel">${head('Beta & rollouts', 'Early access features for this tenant')}<div class="ap-flags">${BETA.map(([n, ic, on, note]) => `<label class="ap-flag"><span class="icon-well violet"><i data-lucide="${ic}"></i></span><div><b>${n}</b><small>${note}</small></div><span class="switch"><input type="checkbox" ${on ? 'checked' : ''} data-flag="${n}"><i></i></span></label>`).join('')}</div></div>
          </div>
        </div>
        <div class="tab-pane" data-pane="int">
          <div class="panel flush">${head('API keys', 'Masked by default. Revealing a key is logged.', '<a class="btn secondary sm" href="#/admin/integrations"><i data-lucide="webhook"></i>API &amp; Webhooks</a>')}
            <div class="table-wrap"><table class="tbl" data-plain><thead><tr><th>Name</th><th>Key</th><th>Scopes</th><th>Created</th><th>Last used</th><th></th></tr></thead><tbody>
            ${KEYS.map(([n, k, s, c, l]) => `<tr><td><b>${n}</b></td><td><code class="code ap-key" data-key="${k}">${mask(k)}</code></td><td>${s.split(' ').map((x) => `<span class="ap-scope">${x}</span>`).join(' ')}</td><td>${c}</td><td>${l}</td><td class="actions"><div class="row ap-nowrap"><button class="icon-btn-sm" data-menu="off" data-reveal aria-label="Reveal"><i data-lucide="eye"></i></button><button class="icon-btn-sm" data-menu="off" data-copy aria-label="Copy"><i data-lucide="copy"></i></button></div></td></tr>`).join('')}</tbody></table></div></div>
          <div class="grid-2">
            ${[['https://erp.alnoor.com.pk/hooks/finsoft', 'invoice.paid · voucher.posted', '99.2%', 'good'], ['https://hooks.zapier.com/alnoor/7731', 'employee.created', '87.5%', 'warn']].map(([u, ev, r, tone]) => `<div class="panel ap-hook"><span class="icon-tile ${tone === 'good' ? '' : 'orange'}"><i data-lucide="webhook"></i></span><div><b class="ap-ellip">${u}</b><small>${ev}</small></div><span class="badge ${tone}">${r} success</span></div>`).join('')}
          </div>
        </div>
        <div class="tab-pane" data-pane="act">
          <div class="panel">${head('Activity & audit', 'Admin, tenant, billing and security events', `<div class="chips" data-actf>${['All', 'Admin', 'Tenant', 'Billing', 'Security'].map((x, i) => `<button class="${i ? '' : 'active'}" data-k="${x.toLowerCase()}">${x}</button>`).join('')}</div>`)}
            <div class="timeline ap-acttl">${ACT.map(([k, ic, b, s, c]) => `<div class="tl-item" data-k="${k}"><span class="ap-tl-ic ${c}"><i data-lucide="${ic}"></i></span><div><b>${b}</b><small>${s}</small></div><span class="badge neutral ap-ml">${k}</span></div>`).join('')}</div></div>
        </div>
      </div>`);

    const utb = $('.ap-utbl tbody', sec);
    const uf = { q: '', role: '' };
    const renderUsers = () => {
      const rows = USERS.map((u, i) => [u, i]).filter(([u]) => (!uf.role || u.role === uf.role) && (!uf.q || `${u.name} ${u.email} ${u.role} ${u.branch}`.toLowerCase().includes(uf.q)));
      utb.innerHTML = rows.length ? rows.map(([u, i]) => userRow(u, i)).join('') : `<tr><td colspan="7"><div class="empty-state"><span class="icon-well lg"><i data-lucide="user-search"></i></span><h4>No users found</h4><p>Nobody matches “${esc(uf.q)}”.</p></div></td></tr>`;
      icons(utb);
    };
    renderUsers();
    const setSeats = () => { $$('[data-seats]', sec).forEach((el) => tick(el, seatsUsed)); const m = $('.ap-seatline .ap-meter', sec); if (m) { const pct = (seatsUsed / 50) * 100; m.className = `ap-meter compact ${meterTone(pct)}`; $('i', m).style.setProperty('--w', Math.min(100, pct) + '%'); } tick($('[data-ucount]', sec), USERS.length); };
    $('[data-usearch]', sec).addEventListener('input', (e) => { uf.q = e.target.value.trim().toLowerCase(); e.target.closest('.search-field').classList.toggle('has-val', !!uf.q); renderUsers(); });
    $('[data-urole]', sec).addEventListener('change', (e) => { uf.role = e.target.value; renderUsers(); });

    function invite() {
      const d = drawer({
        title: 'Invite / add user', sub: `Al-Noor Enterprises · ${50 - seatsUsed} seat${50 - seatsUsed === 1 ? '' : 's'} left on Growth`,
        html: `<div class="ap-inv">
          <div class="ap-inv-hero"><span class="icon-tile lime"><i data-lucide="user-plus"></i></span><div><b>Add someone to ALNOOR</b><small>They get an email with a secure link. Links expire in 72 hours.</small></div></div>
          <div class="form-grid c1">
            <label><span>Full name *</span><input name="name" placeholder="e.g. Nida Shah" autocomplete="off"></label>
            <label><span>Work email *</span><input name="email" type="email" placeholder="name@alnoor.com.pk" autocomplete="off"></label>
            <div class="form-grid"><label><span>Role</span><select name="role">${opts(ROLES, 'Accountant')}</select></label><label><span>Branch</span><select name="branch">${opts(BRANCHES)}</select></label></div>
          </div>
          <div class="ap-lbl ap-mt">Invite language</div><div class="seg" data-lang><button class="active">English</button><button>اردو</button></div>
          <div class="ap-switches">
            <label class="switch"><input type="checkbox" name="send" checked><i></i><span>Send invite email now</span></label>
            <label class="switch"><input type="checkbox" name="mfa" checked><i></i><span>Require MFA at first sign-in</span></label>
            <label class="switch"><input type="checkbox" name="copy"><i></i><span>Copy tenant owner (Ahmed Raza)</span></label>
          </div>
          <div class="ap-inv-preview"><small>Preview</small><p><b>Ahmed Raza</b> invited you to <b>Al-Noor Enterprises</b> on Finsoft as <b data-pv-role>Accountant</b>.</p></div>
          ${seatsUsed >= 50 ? '<div class="banner warn ap-mt"><i data-lucide="triangle-alert"></i><div><b>Seat limit reached</b><p>Adding this user will bill 1 extra seat at Rs 499/mo.</p></div></div>' : ''}
        </div>`,
        foot: `<button class="btn secondary" data-close>Cancel</button><button class="btn primary" data-send><i data-lucide="send"></i>Send invite</button>`,
      });
      const roleSel = $('[name=role]', d);
      roleSel.addEventListener('change', () => { $('[data-pv-role]', d).textContent = roleSel.value; });
      $('[name=send]', d).addEventListener('change', (e) => { const b = $('[data-send]', d); b.innerHTML = e.target.checked ? '<i data-lucide="send"></i>Send invite' : '<i data-lucide="user-plus"></i>Add user'; icons(b); });
      $('[data-send]', d).addEventListener('click', async (e) => {
        const f = formData(d);
        if (!need(d, ['name', 'email'])) { toast('Name and email are required', { tone: 'warn' }); return; }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) { const el = $('[name=email]', d); el.classList.add('ap-invalid'); shake(el.closest('label')); toast('That email address looks wrong', { tone: 'warn' }); return; }
        if (USERS.some((u) => u.email === f.email.toLowerCase())) { toast(`${f.email} already belongs to this tenant`, { tone: 'warn' }); return; }
        await busy(e.currentTarget, 900, f.send ? 'Sending…' : 'Adding…');
        USERS.unshift({ name: f.name, role: f.role, branch: f.branch, mfa: 'Pending', last: '—', status: f.send ? 'Invited' : 'Active', email: f.email.toLowerCase() });
        seatsUsed++;
        d.close();
        uf.q = ''; uf.role = ''; $('[data-usearch]', sec).value = ''; $('[data-urole]', sec).value = '';
        renderUsers(); setSeats();
        const tr = $('tr[data-u="0"]', utb); flash(tr);
        celebrate(tr);
        toast(f.send ? `Invite sent to ${esc(f.email)}` : `${esc(f.name)} added · temporary password emailed`, { tone: 'good', undo: () => { USERS.shift(); seatsUsed--; renderUsers(); setSeats(); } });
      });
    }

    /* impersonation */
    let impTimer = null;
    function impersonate(preset) {
      const active = USERS.filter((u) => u.status === 'Active');
      const m = modal({
        title: 'Impersonate a user', sub: 'Sessions are time-boxed, recorded and visible to the tenant owner.', size: 'wide',
        html: `<div class="form-grid">
            <label><span>Sign in as</span><select name="who">${opts(active.map((u) => [u.name, `${u.name} · ${u.role}`]), preset || 'Sana Javed')}</select></label>
            <label><span>Linked ticket</span><input name="ticket" value="TCK-2291"></label>
            <label class="full"><span>Reason *</span><textarea name="reason" rows="3" placeholder="Why do you need to sign in as this user?"></textarea></label>
          </div>
          <div class="ap-imp-opts"><div><div class="ap-lbl">Time limit</div><div class="seg" data-mins><button class="active" data-m="30">30 min</button><button data-m="60">60 min</button></div></div>
            <label class="switch"><input type="checkbox" name="ro" checked><i></i><span>Read-only (block posting and deletes)</span></label></div>
          <div class="banner warn ap-mt"><i data-lucide="eye"></i><div><b>The tenant will see a banner</b><p>Every user at Al-Noor Enterprises sees who is signed in and why, for the whole session. The owner also gets an email.</p></div></div>
          <div class="ap-imp-preview"><small>What the tenant sees</small><div class="ap-imp-ban"><i data-lucide="venetian-mask"></i><span><b>Finsoft Support (Saim Javed)</b> is viewing this workspace as <b data-pv-who>${esc(preset || 'Sana Javed')}</b> · ends in <b data-pv-min>30</b> min</span><u>Details</u></div></div>`,
        foot: `<button class="btn secondary" data-close>Cancel</button><button class="btn primary" data-ok><i data-lucide="venetian-mask"></i>Start session</button>`,
      });
      $('[name=who]', m).addEventListener('change', (e) => { $('[data-pv-who]', m).textContent = e.target.value; });
      $('[data-mins]', m).addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) $('[data-pv-min]', m).textContent = b.dataset.m; });
      $('[data-ok]', m).onclick = async (e) => {
        if (!need(m, ['reason'])) { toast('Add a reason before impersonating', { tone: 'warn' }); return; }
        const who = $('[name=who]', m).value, mins = +$('[data-mins] .active', m).dataset.m;
        await busy(e.currentTarget, 1000, 'Starting secure session…');
        m.close();
        startImp(who, mins);
      };
    }
    function startImp(who, mins) {
      const bar = $('.ap-imp-bar', sec);
      bar.hidden = false; flash(bar);
      $('[data-imp-user]', bar).textContent = who;
      let left = mins * 60;
      clearInterval(impTimer);
      const draw = () => { $('[data-imp-clock]', bar).textContent = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`; };
      draw();
      impTimer = setInterval(() => { left--; draw(); if (left <= 0) endImp(); }, 1000);
      toast(`Signed in as ${who} for ${mins} min · tenant notified`, { tone: 'info' });
      bar.scrollIntoView({ behavior: reduce() ? 'auto' : 'smooth', block: 'center' });
    }
    function endImp() { clearInterval(impTimer); const bar = $('.ap-imp-bar', sec); bar.classList.add('ap-out'); setTimeout(() => { bar.hidden = true; bar.classList.remove('ap-out'); }, 300); toast('Impersonation ended · session recording saved to audit log'); }
    $('[data-imp-end]', sec).onclick = endImp;

    function changePlan() {
      const m = modal({
        title: 'Change plan', sub: 'Al-Noor Enterprises · currently Growth annual', size: 'wide',
        html: `<div class="radio-cards">${Object.entries(PLAN).map(([p, v]) => `<label class="radio-card"><input type="radio" name="plan" value="${p}" ${p === sub.plan ? 'checked' : ''}><div><b>${p}${p === sub.plan ? ' · current' : ''}</b><small>${p === 'Enterprise' ? 'Custom pricing' : rs(v.price) + ' / mo'} · ${p === 'Enterprise' ? 'unlimited' : v.seats} users</small></div></label>`).join('')}</div>
          <div class="ap-prorate ap-mt"><div><small>Credit for unused Growth</small><b>− Rs 111,775</b></div><div><small>Business for 164 days</small><b>Rs 269,595</b></div><div><small>Due today</small><b class="ap-good-t" data-due>Rs 157,820</b></div></div>`,
        foot: `<button class="btn secondary" data-close>Cancel</button><button class="btn primary" data-ok>Confirm change</button>`,
      });
      $('[data-ok]', m).onclick = async (e) => {
        const p = $('input[name=plan]:checked', m).value;
        if (p === sub.plan) { m.close(); return; }
        await busy(e.currentTarget, 900, 'Updating subscription…');
        sub.plan = p; t.plan = p;
        $('[data-p-plan]', sec).innerHTML = planPill(p); flash($('[data-p-plan]', sec));
        $('[data-sub-plan]', sec).textContent = `${p} · Annual`;
        m.close(); celebrate($('[data-p-plan]', sec));
        toast(`Plan changed to ${p} · prorated invoice issued`, { tone: 'good' });
      };
    }
    let suspended = false;
    async function suspendT(btn) {
      if (suspended) { suspended = false; t.status = 'Active'; $('[data-p-status]', sec).innerHTML = statusBadge('Active'); btn.querySelector('span').textContent = 'Suspend'; btn.className = 'btn danger'; flash($('[data-p-status]', sec)); toast('Al-Noor Enterprises reactivated · users can sign in again'); return; }
      const ok = await confirmBox({ title: 'Suspend Al-Noor Enterprises?', text: `All ${seatsUsed} users are signed out immediately. Data is retained; payroll and recurring vouchers pause until reactivated.`, okLabel: 'Suspend tenant', danger: true, typeToConfirm: 'ALNOOR' });
      if (!ok) return;
      suspended = true; t.status = 'Suspended';
      $('[data-p-status]', sec).innerHTML = statusBadge('Suspended'); flash($('[data-p-status]', sec));
      btn.querySelector('span').textContent = 'Reactivate'; btn.className = 'btn secondary';
      toast('Tenant suspended · 48 sessions revoked', { tone: 'danger' });
    }
    function exportData() {
      const m = modal({
        title: 'Export tenant data', sub: 'Encrypted archive · link valid for 24 hours',
        html: `<div class="radio-cards ap-col">${[['zip', 'Full backup (.zip)', 'Database + attachments · ~19.4 GB', 'archive'], ['csv', 'CSV per module', 'Ledgers, invoices, employees · ~210 MB', 'sheet'], ['json', 'JSON (API format)', 'For migrations · ~380 MB', 'braces']].map(([v, b, s, ic], i) => `<label class="radio-card"><input type="radio" name="fmt" value="${v}" ${i ? '' : 'checked'}><span class="icon-well"><i data-lucide="${ic}"></i></span><div><b>${b}</b><small>${s}</small></div></label>`).join('')}</div>
          <label class="switch ap-mt"><input type="checkbox" checked><i></i><span>Notify tenant owner that an export was taken</span></label>
          <div class="ap-export-prog" hidden><div class="ap-bar lg"><i style="--w:0%"></i></div><small data-step>Preparing…</small></div>`,
        foot: `<button class="btn secondary" data-close>Close</button><button class="btn primary" data-ok><i data-lucide="download"></i>Start export</button>`,
      });
      $('[data-ok]', m).onclick = async (e) => {
        const b = e.currentTarget; b.disabled = true;
        const p = $('.ap-export-prog', m); p.hidden = false;
        const bar = $('.ap-bar i', p), lab = $('[data-step]', p);
        const steps = ['Snapshotting database…', 'Exporting ledgers & vouchers…', 'Packing attachments…', 'Encrypting archive (AES-256)…', 'Ready'];
        for (let i = 0; i < steps.length; i++) { lab.textContent = steps[i]; bar.style.setProperty('--w', ((i + 1) / steps.length) * 100 + '%'); await wait(reduce() ? 10 : 420); }
        lab.innerHTML = '<b class="ap-good-t">Export ready</b> · alnoor-2026-10-01.zip · link emailed to saim@finsoft.pk';
        b.disabled = false; b.innerHTML = '<i data-lucide="check"></i>Done'; icons(b); b.onclick = () => m.close();
        celebrate(b); toast('Export ready · download link valid for 24 h');
      };
    }

    sec.addEventListener('click', (e) => {
      const a = e.target.closest('[data-act]');
      if (a) { ({ imp: () => impersonate(), plan: changePlan, suspend: () => suspendT(a), export: exportData })[a.dataset.act](); return; }
      if (e.target.closest('[data-invite]')) { invite(); return; }
      const gt = e.target.closest('[data-goto-tab]');
      if (gt) { $(`.ap-t360 > .tabs [data-tab="${gt.dataset.gotoTab}"]`, sec).click(); return; }
      if (e.target.closest('[data-note]')) {
        const ta = $('.ap-note-add textarea', sec);
        if (!ta.value.trim()) { shake(ta); return; }
        $('[data-notes]', sec).insertAdjacentHTML('afterbegin', `<div class="ap-note ap-flash">${avatar('Saim Javed', 'xs')}<div><p>${esc(ta.value.trim())}</p><small>Saim Javed · just now</small></div></div>`);
        icons($('[data-notes]', sec)); ta.value = ''; toast('Note added'); return;
      }
      const um = e.target.closest('[data-umore]');
      if (um) {
        e.stopPropagation();
        const tr = um.closest('tr'), u = USERS[+tr.dataset.u];
        const items = [
          { label: 'Reset MFA', icon: 'rotate-ccw', onClick: async () => { if (!(await confirmBox({ title: `Reset MFA for ${u.name}?`, text: 'Their authenticator is unlinked. They must enrol again at next sign-in.', okLabel: 'Reset MFA' }))) return; u.mfa = 'Reset'; renderUsers(); const r = $(`tr[data-u="${USERS.indexOf(u)}"]`, utb); flash(r); toast(`MFA reset for ${u.name} · enrolment email sent`); } },
          { label: 'Send password reset', icon: 'key-round', onClick: async () => { tr.classList.add('ap-row-busy'); await wait(800); tr.classList.remove('ap-row-busy'); flash(tr); toast(`Password reset link sent to ${u.email}`); } },
          { label: 'Impersonate this user', icon: 'venetian-mask', onClick: () => (u.status === 'Active' ? impersonate(u.name) : toast(`${u.name} is not active`, { tone: 'warn' })) },
          { sep: true },
          u.status === 'Deactivated'
            ? { label: 'Reactivate', icon: 'user-check', onClick: () => { u.status = 'Active'; seatsUsed++; renderUsers(); setSeats(); flash($(`tr[data-u="${USERS.indexOf(u)}"]`, utb)); toast(`${u.name} reactivated`); } }
            : { label: 'Deactivate', icon: 'user-x', danger: true, onClick: async () => {
              if (!(await confirmBox({ title: `Deactivate ${u.name}?`, text: 'They are signed out everywhere and lose access. Their records and audit history stay.', okLabel: 'Deactivate', danger: true }))) return;
              const prev = u.status; u.status = 'Deactivated'; seatsUsed--;
              tr.classList.add('ap-dimming');
              setTimeout(() => { renderUsers(); setSeats(); }, 320);
              toast(`${u.name} deactivated · seat freed`, { tone: 'danger', undo: () => { u.status = prev; seatsUsed++; renderUsers(); setSeats(); } });
            } },
        ];
        if (u.role === 'Tenant Owner') items.splice(items.length - 1, 1, { label: 'Owner cannot be deactivated', icon: 'lock', onClick: () => toast('Transfer ownership first', { tone: 'warn' }) });
        FS.menu(um, items);
        return;
      }
      const rv = e.target.closest('[data-reveal]');
      if (rv) { const c = $('[data-key]', rv.closest('tr')); const shown = c.classList.toggle('shown'); c.textContent = shown ? c.dataset.key : mask(c.dataset.key); rv.innerHTML = `<i data-lucide="${shown ? 'eye-off' : 'eye'}"></i>`; icons(rv); if (shown) toast('Key revealed · logged to audit', { tone: 'info', ms: 2000 }); return; }
      const cp = e.target.closest('[data-copy]');
      if (cp) { copy($('[data-key]', cp.closest('tr')).dataset.key, 'API key copied'); return; }
      const af = e.target.closest('[data-actf] button');
      if (af) { const k = af.dataset.k; $$('.ap-acttl .tl-item', sec).forEach((it) => { it.hidden = k !== 'all' && it.dataset.k !== k; }); stagger(sec, '.ap-acttl .tl-item:not([hidden])'); }
    });
    sec.addEventListener('change', (e) => {
      const f = e.target.closest('[data-flag]');
      if (f) { const n = f.dataset.flag, on = f.checked; flash(f.closest('.ap-flag')); toast(`${n} ${on ? 'enabled' : 'disabled'} for ALNOOR`, { tone: on ? 'good' : 'warn', undo: () => { f.checked = !on; } }); }
    });
  });

  /* ================= 3 · admin/staff ================= */
  onRoute('admin/staff', (sec) => {
    const ROLES = ['Super Admin', 'Support Lead', 'Support Agent', 'Billing', 'Engineer'];
    const RTONE = { 'Super Admin': 'dark', 'Support Lead': 'violet', 'Support Agent': 'info', Billing: 'warn', Engineer: 'neutral' };
    const STAFF = [
      { name: 'Saim Javed', email: 'saim@finsoft.pk', role: 'Super Admin', mfa: 'Hardware key', scope: 'All tenants', last: 'Now', status: 'Active' },
      { name: 'Mariam Iqbal', email: 'mariam.iqbal@finsoft.pk', role: 'Support Lead', mfa: 'Authenticator', scope: 'Punjab · 54 tenants', last: '12 min ago', status: 'Active' },
      { name: 'Danish Ahmed', email: 'danish.ahmed@finsoft.pk', role: 'Billing', mfa: 'Authenticator', scope: 'All tenants (billing)', last: '1 h ago', status: 'Active' },
      { name: 'Areeba Khalid', email: 'areeba.khalid@finsoft.pk', role: 'Support Agent', mfa: 'Authenticator', scope: 'Sindh · 38 tenants', last: 'Yesterday', status: 'Active' },
      { name: 'Talha Mehmood', email: 'talha.m@finsoft.pk', role: 'Engineer', mfa: 'Hardware key', scope: 'Read-only · all', last: '3 h ago', status: 'Active' },
      { name: 'Noor Sheikh', email: 'noor.sheikh@finsoft.pk', role: 'Support Agent', mfa: 'Not set', scope: 'KPK & ICT · 21 tenants', last: '—', status: 'Invited' },
    ];
    const PERMS = [
      ['View tenants', 'Tenants', [1, 1, 1, 1, 1]], ['Onboard / provision tenants', 'Tenants', [1, 1, 0, 0, 0]], ['Suspend / delete tenants', 'Tenants', [1, 0, 0, 0, 0]], ['Impersonate tenant users', 'Tenants', [1, 1, 1, 0, 0]],
      ['Manage plans & pricing', 'Billing', [1, 0, 0, 1, 0]], ['Issue / void invoices & refunds', 'Billing', [1, 0, 0, 1, 0]], ['Run dunning & retries', 'Billing', [1, 0, 0, 1, 0]],
      ['Feature flags & rollouts', 'Platform', [1, 0, 0, 0, 1]], ['Edit COA templates & seeds', 'Platform', [1, 1, 0, 0, 1]], ['System health & backups', 'Platform', [1, 0, 0, 0, 1]],
      ['Support tickets', 'Support', [1, 1, 1, 1, 0]], ['Publish announcements', 'Support', [1, 1, 0, 0, 0]], ['Manage platform staff', 'Security', [1, 0, 0, 0, 0]], ['Approve privacy requests', 'Security', [1, 1, 0, 0, 0]],
    ];
    const saved = PERMS.map((p) => p[2].slice());
    sec.insertAdjacentHTML('beforeend', `
      <div class="kpi-grid">
        ${kpi('Platform staff', '<span data-staffn>6</span>', '5 active · 1 invited', '', 'users')}
        ${kpi('2FA coverage', '<span data-mfa>83</span>%', 'Hardware keys for 2 admins', 'teal', 'shield-check')}
        ${kpi('Active sessions', '9', 'Across 4 devices today', 'blue', 'monitor-smartphone')}
        ${kpi('Impersonations (30 d)', '23', 'All with linked tickets', 'violet', 'venetian-mask')}
      </div>
      <div class="panel flush">
        ${head('Staff', 'People with access to the Finsoft Cloud console', '<label class="search-field ap-sf" data-plain-search><i data-lucide="search"></i><input data-ssearch placeholder="Search staff…"></label>')}
        <div class="table-wrap"><table class="tbl ap-stbl" data-plain><thead><tr><th>Member</th><th>Role</th><th>2FA</th><th>Tenant scope</th><th>Last active</th><th>Status</th><th></th></tr></thead><tbody></tbody></table></div>
      </div>
      <div class="panel flush ap-matrix-panel">
        ${head('Role permissions', 'Click a cell to toggle. Super Admin is locked. Changes are written to the platform audit log.', '<span class="ap-dirty" data-dirty hidden><i data-lucide="circle-dot"></i><b>0</b> unsaved</span><button class="btn ghost sm" data-mreset disabled>Discard</button><button class="btn primary sm" data-msave disabled><i data-lucide="save"></i>Save matrix</button>')}
        <div class="table-wrap"><table class="tbl ap-matrix" data-plain><thead><tr><th>Permission</th>${ROLES.map((r) => `<th><span class="ap-rolehd ${RTONE[r]}">${r}</span><small data-rcount></small></th>`).join('')}</tr></thead><tbody>
        ${(() => { let g = ''; return PERMS.map(([p, grp, v], i) => { const gh = grp !== g ? `<tr class="group"><td colspan="6">${(g = grp)}</td></tr>` : ''; return `${gh}<tr data-p="${i}"><td>${p}</td>${v.map((on, j) => `<td><button class="ap-cell ${on ? 'on' : ''} ${j === 0 ? 'locked' : ''}" data-r="${j}" aria-pressed="${!!on}" aria-label="${p} for ${ROLES[j]}"><i data-lucide="check"></i></button></td>`).join('')}</tr>`; }).join(''); })()}
        </tbody></table></div>
      </div>`);
    const tb = $('.ap-stbl tbody', sec);
    let q = '';
    const mfaBadge = (m) => (m === 'Hardware key' ? '<span class="badge good"><i data-lucide="key-round"></i>Hardware key</span>' : m === 'Authenticator' ? '<span class="badge good"><i data-lucide="smartphone"></i>Authenticator</span>' : '<span class="badge danger"><i data-lucide="shield-off"></i>Not set</span>');
    const render = () => {
      const rows = STAFF.filter((s) => !q || `${s.name} ${s.email} ${s.role} ${s.scope}`.toLowerCase().includes(q));
      tb.innerHTML = rows.map((s) => `<tr data-s="${STAFF.indexOf(s)}"><td><div class="cell-user">${avatar(s.name)}<div><b>${esc(s.name)}</b><small>${esc(s.email)}</small></div></div></td><td><span class="ap-rolehd ${RTONE[s.role]}">${s.role}</span></td><td>${mfaBadge(s.mfa)}</td><td>${esc(s.scope)}</td><td>${s.last}</td><td>${statusBadge(s.status)}</td>
        <td class="actions"><div class="row ap-nowrap"><button class="icon-btn-sm" data-menu="off" data-edit aria-label="Edit"><i data-lucide="pencil"></i></button><button class="icon-btn-sm" data-menu="off" data-remove aria-label="Remove" ${s.name === 'Saim Javed' ? 'disabled' : ''}><i data-lucide="trash-2"></i></button></div></td></tr>`).join('') || '<tr><td colspan="7"><div class="empty-state"><h4>No staff match</h4></div></td></tr>';
      icons(tb);
      const cov = Math.round((STAFF.filter((s) => s.mfa !== 'Not set').length / STAFF.length) * 100);
      tick($('[data-staffn]', sec), STAFF.length); tick($('[data-mfa]', sec), cov);
    };
    render();
    $('[data-ssearch]', sec).addEventListener('input', (e) => { q = e.target.value.trim().toLowerCase(); e.target.closest('.search-field').classList.toggle('has-val', !!q); render(); });

    function staffDrawer(s) {
      const edit = !!s;
      s = s || { name: '', email: '', role: 'Support Agent', mfa: 'Not set', scope: 'All tenants' };
      const scopeType = /^All/.test(s.scope) ? 'all' : /tenants$/.test(s.scope) && /·/.test(s.scope) ? 'region' : 'all';
      const d = drawer({
        title: edit ? `Edit ${esc(s.name)}` : 'Add platform staff', sub: edit ? s.email : 'Console access for a Finsoft Cloud employee',
        html: `<div class="form-grid c1">
            <label><span>Full name *</span><input name="name" value="${esc(s.name)}" placeholder="e.g. Hassan Raza"></label>
            <label><span>Email *</span><div class="input-group ap-ig"><input name="email" value="${esc(s.email.replace('@finsoft.pk', ''))}" placeholder="hassan.raza"><span>@finsoft.pk</span></div></label>
            <label><span>Role</span><select name="role">${opts(ROLES, s.role)}</select></label>
          </div>
          <div class="ap-role-hint" data-rhint></div>
          <div class="ap-lbl ap-mt">Tenant scope</div>
          <div class="radio-cards ap-col ap-scope">${[['all', 'All tenants', 'Every organisation on the platform', 'globe'], ['region', 'By region', 'Only tenants in selected provinces', 'map'], ['list', 'Specific tenants', 'Hand-picked accounts', 'list-checks']].map(([v, b, sm, ic]) => `<label class="radio-card"><input type="radio" name="scopeT" value="${v}" ${v === scopeType ? 'checked' : ''}><span class="icon-well"><i data-lucide="${ic}"></i></span><div><b>${b}</b><small>${sm}</small></div></label>`).join('')}</div>
          <div class="ap-scope-pick" data-sp="region" hidden><div class="ap-chipsel">${['Punjab', 'Sindh', 'KPK', 'ICT', 'Balochistan'].map((r, i) => `<button type="button" class="${i === 0 ? 'on' : ''}">${r}</button>`).join('')}</div></div>
          <div class="ap-scope-pick" data-sp="list" hidden><div class="ap-chipsel">${TENANTS.slice(0, 10).map((t, i) => `<button type="button" class="${i < 2 ? 'on' : ''}">${t.code}</button>`).join('')}</div></div>
          <div class="ap-switches">
            <label class="switch"><input type="checkbox" name="mfa" ${edit && s.mfa === 'Not set' ? '' : 'checked'}><i></i><span>Require 2FA (hardware key or authenticator)</span></label>
            <label class="switch"><input type="checkbox" name="ip" checked><i></i><span>Restrict to office IP allow-list</span></label>
            ${edit ? '' : '<label class="switch"><input type="checkbox" name="send" checked><i></i><span>Email the invite now</span></label>'}
          </div>`,
        foot: `<button class="btn secondary" data-close>Cancel</button><button class="btn primary" data-save><i data-lucide="${edit ? 'save' : 'send'}"></i>${edit ? 'Save changes' : 'Send invite'}</button>`,
      });
      const hint = () => { const r = $('[name=role]', d).value, j = ROLES.indexOf(r); const can = PERMS.filter((p) => p[2][j]).map((p) => p[0]); $('[data-rhint]', d).innerHTML = `<i data-lucide="info"></i><span><b>${r}</b> can ${can.length} of ${PERMS.length} actions: ${can.slice(0, 4).join(', ')}${can.length > 4 ? '…' : ''}</span>`; icons($('[data-rhint]', d)); };
      const showScope = () => { const v = $('input[name=scopeT]:checked', d).value; $$('[data-sp]', d).forEach((p) => { p.hidden = p.dataset.sp !== v; }); };
      hint(); showScope();
      $('[name=role]', d).addEventListener('change', hint);
      d.addEventListener('change', (e) => { if (e.target.name === 'scopeT') showScope(); });
      d.addEventListener('click', (e) => { const c = e.target.closest('.ap-chipsel button'); if (c) c.classList.toggle('on'); });
      $('[data-save]', d).onclick = async (e) => {
        if (!need(d, ['name', 'email'])) return;
        const f = formData(d);
        const local = f.email.replace(/@.*/, '').toLowerCase();
        if (!/^[a-z0-9._-]+$/.test(local)) { shake($('[name=email]', d).closest('label')); toast('Use a valid @finsoft.pk address', { tone: 'warn' }); return; }
        const st = $('input[name=scopeT]:checked', d).value;
        const picks = st === 'all' ? [] : $$(`[data-sp="${st}"] .on`, d).map((b) => b.textContent);
        const scope = st === 'all' ? (f.role === 'Engineer' ? 'Read-only · all' : 'All tenants') : st === 'region' ? `${picks.join(', ') || 'No region'} · ${picks.length * 19} tenants` : `${picks.length} tenants`;
        await busy(e.currentTarget, 800, edit ? 'Saving…' : 'Inviting…');
        if (edit) Object.assign(s, { name: f.name, email: local + '@finsoft.pk', role: f.role, scope, mfa: f.mfa ? (s.mfa === 'Not set' ? 'Authenticator' : s.mfa) : 'Not set' });
        else STAFF.push({ name: f.name, email: local + '@finsoft.pk', role: f.role, mfa: f.mfa ? 'Not set' : 'Not set', scope, last: '—', status: 'Invited' });
        d.close(); render();
        flash($(`tr[data-s="${edit ? STAFF.indexOf(s) : STAFF.length - 1}"]`, tb));
        toast(edit ? `${f.name} updated` : `Invite sent to ${local}@finsoft.pk${f.mfa ? ' · 2FA required at first sign-in' : ''}`, { tone: 'good' });
      };
    }
    sec.addEventListener('click', async (e) => {
      if (e.target.closest('[data-ap-act=add-staff]')) { staffDrawer(); return; }
      const ed = e.target.closest('[data-edit]');
      if (ed) { staffDrawer(STAFF[+ed.closest('tr').dataset.s]); return; }
      const rm = e.target.closest('[data-remove]');
      if (rm) {
        const tr = rm.closest('tr'), s = STAFF[+tr.dataset.s];
        if (!(await confirmBox({ title: `Remove ${s.name}?`, text: `Console access is revoked and all active sessions end. ${s.name}'s past actions remain in the audit log.`, okLabel: 'Remove', danger: true }))) return;
        const idx = STAFF.indexOf(s);
        rowOut(tr, () => { STAFF.splice(idx, 1); render(); });
        toast(`${s.name} removed from the platform team`, { tone: 'danger', undo: () => { STAFF.splice(idx, 0, s); render(); flash($(`tr[data-s="${idx}"]`, tb)); } });
        return;
      }
      const c = e.target.closest('.ap-cell');
      if (c) {
        if (c.classList.contains('locked')) { shake(c); toast('Super Admin always has every permission', { tone: 'info', ms: 2000 }); return; }
        c.classList.toggle('on'); c.setAttribute('aria-pressed', c.classList.contains('on'));
        c.classList.remove('ap-pop'); void c.offsetWidth; c.classList.add('ap-pop');
        dirty(); return;
      }
      if (e.target.closest('[data-mreset]')) { $$('.ap-matrix tr[data-p]', sec).forEach((tr) => $$('.ap-cell', tr).forEach((b, j) => b.classList.toggle('on', !!saved[+tr.dataset.p][j]))); dirty(); toast('Changes discarded', { tone: 'info' }); return; }
      const sv = e.target.closest('[data-msave]');
      if (sv) {
        await busy(sv, 900, 'Saving…');
        $$('.ap-matrix tr[data-p]', sec).forEach((tr) => $$('.ap-cell', tr).forEach((b, j) => { saved[+tr.dataset.p][j] = b.classList.contains('on') ? 1 : 0; b.classList.remove('changed'); }));
        dirty(); celebrate(sv); toast('Role matrix saved · logged as AUD-PLT-8812');
      }
    });
    function dirty() {
      let n = 0;
      $$('.ap-matrix tr[data-p]', sec).forEach((tr) => $$('.ap-cell', tr).forEach((b, j) => { const ch = b.classList.contains('on') !== !!saved[+tr.dataset.p][j]; b.classList.toggle('changed', ch); if (ch) n++; }));
      const dl = $('[data-dirty]', sec); dl.hidden = !n; $('b', dl).textContent = n;
      $('[data-msave]', sec).disabled = !n; $('[data-mreset]', sec).disabled = !n;
      $$('.ap-matrix thead [data-rcount]', sec).forEach((el, j) => { el.textContent = `${$$(`.ap-matrix .ap-cell[data-r="${j}"].on`, sec).length} of ${PERMS.length}`; });
    }
    dirty();
  });

  /* ================= 4 · admin/analytics ================= */
  onRoute('admin/analytics', (sec) => {
    const MONTHS = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'];
    const YRS = ['25', '25', '25', '26', '26', '26', '26', '26', '26', '26', '26', '26'];
    /* monthly movement rates with a deterministic seasonal wave (Ramzan dip, Jul FY-start spike) */
    const R = MONTHS.map((m, i) => ({
      nw: 0.0295 * (1 + 0.3 * Math.sin(i * 1.3) + (m === 'Jul' ? 0.45 : 0) - (m === 'Mar' ? 0.35 : 0)),
      ex: 0.0205 * (1 + 0.25 * Math.cos(i * 0.9) + (m === 'Jul' ? 0.3 : 0)),
      co: 0.004 * (1 + 0.4 * Math.sin(i * 2.1)),
      ch: 0.006 * (1 + 0.35 * Math.cos(i * 1.7) + (m === 'Mar' ? 0.5 : 0)),
    }));
    let raw = [1];
    R.forEach((r, i) => { raw[i + 1] = raw[i] * (1 + r.nw + r.ex - r.co - r.ch); });
    const k = 3845000 / raw[12];
    const MRR = raw.map((v) => v * k); // MRR[0] = end of Sep-25, MRR[12] = end of Sep-26
    const SH0 = [0.15, 0.40, 0.27, 0.18], SH1 = [0.091, 0.4226, 0.2991, 0.1873];
    const PL = ['Starter', 'Growth', 'Business', 'Enterprise'];
    const share = (i) => { const t = i / 11; const s = SH0.map((a, j) => a + (SH1[j] - a) * t); const sum = s.reduce((x, y) => x + y, 0); return s.map((x) => x / sum); };
    const COHORT = MONTHS.map((m, c) => {
      const r = seededRand(c * 7 + 3), size = Math.round(6 + r() * 9 + (m === 'Jul' ? 6 : 0));
      const q = (r() - 0.5) * 5;
      return { label: `${m} ${YRS[c]}`, size, cells: Array.from({ length: 12 - c }, (_, mo) => (mo === 0 ? 100 : clamp(Math.round(100 - (19 + q) * (1 - Math.exp(-mo / 3.2)) + (r() - 0.5) * 3), 55, 100))) };
    });
    let P = 12;
    const short = (n) => (Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : Math.round(n / 1000) + 'k');
    function calc(p) {
      const s = 12 - p, S = MRR[s], E = MRR[12];
      let nw = 0, ex = 0, co = 0, ch = 0;
      for (let i = s; i < 12; i++) { nw += MRR[i] * R[i].nw; ex += MRR[i] * R[i].ex; co += MRR[i] * R[i].co; ch += MRR[i] * R[i].ch; }
      const nrr = Math.pow((S + ex - co - ch) / S, 12 / p) * 100, grr = Math.pow((S - co - ch) / S, 12 / p) * 100;
      const logo = 1.8 + (12 - p) * 0.03 - (p === 1 ? 0.25 : 0);
      const arpu = E / 128, ltv = (arpu * 0.82) / (logo / 100), cac = 297000 - (12 - p) * 2500;
      const sc = p / 12, r = seededRand(p * 11);
      const funnel = [['Website visitors', 48600], ['Sign-ups', 1420], ['Trials activated', 512], ['Engaged trials', 214], ['Paid', 71]].map(([l, v]) => [l, Math.round(v * sc * (0.92 + r() * 0.16))]);
      const reasons = [['Price', 32], ['Switched to competitor', 21], ['Business closed', 18], ['Missing feature', 15], ['Poor onboarding', 9], ['Other', 5]].map(([l, v], i) => [l, Math.max(2, v + Math.round((r() - 0.5) * (i < 3 ? 8 : 4)))]);
      return { S, E, nw, ex, co, ch, nrr, grr, logo, arpu, ltv, cac, ratio: ltv / cac, funnel, reasons };
    }
    sec.insertAdjacentHTML('beforeend', `
      <div class="ap-hero" data-anim>
        <div class="ap-hero-main"><span class="hero-eyebrow">Monthly recurring revenue · Sep 2026</span><b class="ap-hero-mrr">${money(3845000, 0)}</b>
          <div class="row ap-wrap"><span class="pill ap-pill-dark"><i data-lucide="calendar"></i>ARR <b>Rs 46.14M</b></span><span class="pill ap-pill-dark"><i data-lucide="trending-up"></i>Net new <b class="ap-lime-t" data-h-net></b></span></div>
          <svg class="ap-hero-spark" viewBox="0 0 240 60" preserveAspectRatio="none"><path d="${MRR.map((v, i) => `${i ? 'L' : 'M'}${(i / 12) * 240},${60 - ((v - MRR[0]) / (MRR[12] - MRR[0])) * 52 - 4}`).join(' ')}"/></svg></div>
        <div class="ap-hero-stats" data-hstats></div>
      </div>
      <div class="split ap-an-row1">
        <div class="panel">${head('MRR movement', '<span data-wf-sub></span>', '<span class="legend ap-legend-in"><span><i style="background:var(--good)"></i>Gain</span><span><i style="background:var(--danger)"></i>Loss</span></span>')}<div class="ap-wf" data-wf></div></div>
        <div class="panel">${head('Trial → paid funnel', 'Conversion between each step')}<div class="ap-funnel" data-funnel></div></div>
      </div>
      <div class="split ap-an-row2">
        <div class="panel">${head('MRR by plan', '12 months · selected period highlighted', `<span class="legend ap-legend-in">${PL.map((p) => `<span><i class="ap-sw ${p.toLowerCase()}"></i>${p}</span>`).join('')}</span>`)}<div class="ap-sbars" data-sbars></div></div>
        <div class="panel">${head('Why tenants churn', 'Exit survey · share of churned logos')}<div class="ap-donut-wrap" data-donut></div></div>
      </div>
      <div class="panel">${head('Cohort retention', 'Logo retention by sign-up month. Hover a cell for detail.', '<div class="ap-heat-scale"><small>55%</small><i></i><small>100%</small></div>')}<div class="ap-heat-wrap"><div class="ap-heat" data-heat></div></div></div>`);

    const hs = $('[data-hstats]', sec);
    function render() {
      const d = calc(P);
      sec.classList.remove('ap-rerender'); void sec.offsetWidth; sec.classList.add('ap-rerender');
      $('[data-h-net]', sec).textContent = `+${rs(d.E - d.S)}`;
      hs.innerHTML = [['NRR', d.nrr.toFixed(1) + '%', 'Net revenue retention', d.nrr > 105], ['GRR', d.grr.toFixed(1) + '%', 'Gross revenue retention', d.grr > 85], ['Logo churn', d.logo.toFixed(1) + '%', 'Monthly average', d.logo < 2], ['ARPU', rs(d.arpu), 'Per tenant / month', true], ['LTV : CAC', d.ratio.toFixed(1) + 'x', `LTV ${short(d.ltv)} · CAC ${short(d.cac)}`, d.ratio > 3], ['CAC payback', (d.cac / (d.arpu * 0.82)).toFixed(1) + ' mo', 'Gross-margin adjusted', true]]
        .map(([l, v, s, good], i) => `<div class="ap-hstat" style="--i:${i}"><small>${l}</small><b data-count>${v}</b><span>${good ? '<i class="ap-dot good"></i>' : '<i class="ap-dot warn"></i>'}${s}</span></div>`).join('');
      $$('[data-count]', hs).forEach((el) => FS.countUp(el, 700));
      /* waterfall */
      const steps = [['Starting MRR', d.S, 'total'], ['New', d.nw, 'up'], ['Expansion', d.ex, 'up'], ['Contraction', -d.co, 'down'], ['Churn', -d.ch, 'down'], ['Ending MRR', d.E, 'total']];
      let run = 0; const segs = steps.map(([l, v, t]) => { let a, b; if (t === 'total') { a = 0; b = v; run = v; } else { a = run; b = run + v; run = b; } return { l, v, t, lo: Math.min(a, b), hi: Math.max(a, b) }; });
      const mn = Math.min(...segs.filter((s) => s.t !== 'total').map((s) => s.lo), d.S), hi = Math.max(...segs.map((s) => s.hi)) * 1.03, lo = Math.max(0, mn - (hi - mn) * 0.7);
      const y = (v) => ((v - lo) / (hi - lo)) * 100;
      $('[data-wf-sub]', sec).textContent = `${P === 1 ? 'Sep 2026' : `${MONTHS[12 - P]} – Sep 2026`} · net ${d.E > d.S ? '+' : ''}${((d.E / d.S - 1) * 100).toFixed(1)}%`;
      $('[data-wf]', sec).innerHTML = `<div class="ap-wf-grid">${[0, 1, 2, 3].map((g) => `<i style="bottom:${g * 33.3}%"><em>${short(lo + ((hi - lo) * g) / 3)}</em></i>`).join('')}</div>` + segs.map((s, i) => `<div class="ap-wf-col ${s.t}" style="--i:${i}">
          <div class="ap-wf-track"><div class="ap-wf-bar" style="bottom:${s.t === 'total' ? 0 : y(s.lo)}%;height:${s.t === 'total' ? y(s.hi) : Math.max(0.8, y(s.hi) - y(s.lo))}%" data-tip="${s.l} · ${s.v < 0 ? '−' : s.t === 'up' ? '+' : ''}${rs(Math.abs(s.v))}"><em>${s.t === 'total' ? short(s.v) : (s.v < 0 ? '−' : '+') + short(Math.abs(s.v))}</em>${s.t === 'total' ? '<span class="ap-wf-break"></span>' : ''}</div>${i < 5 ? `<span class="ap-wf-link" style="bottom:${y(s.t === 'total' ? s.hi : s.v < 0 ? s.lo : s.hi)}%"></span>` : ''}</div>
          <small>${s.l}</small></div>`).join('');
      /* funnel */
      const f0 = d.funnel[0][1];
      $('[data-funnel]', sec).innerHTML = d.funnel.map(([l, v], i) => { const cv = i ? v / d.funnel[i - 1][1] : 1; return `<div class="ap-fstep" style="--i:${i}"><div class="ap-flab"><small>${l}</small><b>${fmt(v)}</b></div><div class="ap-ftrack"><div class="ap-fbar" style="--w:${Math.max(6, Math.pow(v / f0, 0.3) * 100)}%"></div></div>${i ? `<em class="${cv > 0.3 ? 'good' : 'warn'}"><i data-lucide="corner-down-right"></i>${(cv * 100).toFixed(1)}%</em>` : '<em class="ap-muted-t">100%</em>'}</div>`; }).join('') + `<div class="ap-fsum"><span>Visitor → paid <b>${((d.funnel[4][1] / f0) * 100).toFixed(2)}%</b></span><span>Trial → paid <b>${((d.funnel[4][1] / d.funnel[2][1]) * 100).toFixed(1)}%</b></span></div>`;
      /* stacked bars */
      const mx = MRR[12] * 1.05;
      $('[data-sbars]', sec).innerHTML = `<div class="ap-sbars-in">${MONTHS.map((m, i) => { const tot = MRR[i + 1], sh = share(i), on = i >= 12 - P; return `<div class="ap-scol ${on ? 'on' : ''}" style="--i:${i}" data-m="${i}"><div class="ap-sstack" style="--h:${(tot / mx) * 100}%">${sh.map((s, j) => `<i class="ap-sw ${PL[j].toLowerCase()}" style="flex:${s}"></i>`).join('')}</div><small>${m}</small></div>`; }).join('')}</div>`;
      /* donut */
      const tot = d.reasons.reduce((s, r) => s + r[1], 0); const C = 2 * Math.PI * 52; let acc = 0;
      const COL = ['var(--primary)', 'var(--lime)', 'var(--info)', 'var(--orange)', 'var(--violet)', 'var(--muted-2)'];
      $('[data-donut]', sec).innerHTML = `<div class="ap-donut"><svg viewBox="0 0 140 140">${d.reasons.map(([l, v], i) => { const len = (v / tot) * C, seg = `<circle cx="70" cy="70" r="52" style="--len:${len.toFixed(2)};--gap:${(C - len).toFixed(2)};--off:${(-acc).toFixed(2)};--i:${i};stroke:${COL[i]}" data-tip="${l} · ${Math.round((v / tot) * 100)}%"/>`; acc += len; return seg; }).join('')}</svg><div class="ap-donut-c"><b>${Math.round(d.logo * P * 128 / 100) || 2}</b><small>logos lost</small></div></div>
        <div class="ap-donut-leg">${d.reasons.map(([l, v], i) => `<div style="--i:${i}"><i style="background:${COL[i]}"></i><span>${l}</span><b>${Math.round((v / tot) * 100)}%</b></div>`).join('')}</div>`;
      /* heatmap */
      const firstOn = 12 - P;
      $('[data-heat]', sec).innerHTML = `<div class="ap-heat-row head"><span>Cohort</span><span>Tenants</span>${Array.from({ length: 12 }, (_, m) => `<span>M${m}</span>`).join('')}</div>` + COHORT.map((c, ci) => `<div class="ap-heat-row ${ci >= firstOn ? 'on' : 'off'}" style="--i:${ci}"><span><b>${c.label}</b></span><span class="tnum">${c.size}</span>${Array.from({ length: 12 }, (_, m) => { const v = c.cells[m]; if (v == null) return '<i class="na"></i>'; const a = Math.round(10 + ((v - 55) / 45) * 82); return `<i style="--a:${a}%" class="${a > 58 ? 'hi' : ''}" data-tip="${c.label} cohort · month ${m} · ${v}% (${Math.round((c.size * v) / 100)} of ${c.size} tenants)">${v}</i>`; }).join('')}</div>`).join('') + `<div class="ap-heat-row avg"><span><b>Average</b></span><span></span>${Array.from({ length: 12 }, (_, m) => { const vals = COHORT.map((c) => c.cells[m]).filter((v) => v != null); return `<i>${Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)}</i>`; }).join('')}</div>`;
      icons(sec);
    }
    /* stacked bar tooltip */
    sec.addEventListener('mousemove', (e) => {
      const col = e.target.closest('.ap-scol');
      if (!col) return;
      const i = +col.dataset.m, sh = share(i), tot = MRR[i + 1], r = $('.ap-sstack', col).getBoundingClientRect();
      FS.tip(`<small><i></i>${MONTHS[i]} ${YRS[i]} · total</small><b>${rs(tot)}</b>${PL.map((p, j) => `<small class="ap-tip-row"><i class="ap-sw ${p.toLowerCase()}"></i>${p}<b>${short(tot * sh[j])}</b></small>`).reverse().join('')}`, r.left + r.width / 2, r.top);
    });
    sec.addEventListener('mouseout', (e) => { if (e.target.closest('.ap-scol') && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.ap-scol'))) FS.untip(); });
    sec.addEventListener('click', (e) => {
      const b = e.target.closest('[data-ap-period] button');
      if (b) { const p = b.dataset.p; P = +p; render(); toast(`Showing ${P === 1 ? 'last month' : 'last ' + P + ' months'}`, { tone: 'info', ms: 1600 }); }
    });
    render();
  });

  /* ================= 5 · admin/dunning ================= */
  const METHOD = {
    card: ['Card', 'credit-card', 'Visa ••4421'], jazz: ['JazzCash', 'smartphone', 'Wallet 0300•••412'], easy: ['Easypaisa', 'smartphone', 'Wallet 0345•••908'],
    raast: ['Raast', 'zap', 'RTP via IBAN'], dd: ['Direct debit', 'landmark', 'Meezan mandate'],
  };
  onRoute('admin/dunning', (sec) => {
    const D = (name, code, inv, amt, m, att, days, next, reason, ok) => ({ name, code, inv, amt, m, att, days, next, reason, ok, hist: [] });
    const ROWS = [
      D('Ravi Motors', 'RAVIMTR', 'FS-INV-2026-01802', 28999, 'card', 2, 3, 'Today 15:00 · JazzCash', 'Card declined (do not honour)', true),
      D('Swat Valley Foods', 'SWATFD', 'FS-INV-2026-01811', 28999, 'jazz', 1, 2, 'Fri 10:00 · JazzCash', 'Insufficient wallet balance', false),
      D('Hyderabad Ceramics', 'HYDCRM', 'FS-INV-2026-01826', 11599, 'easy', 1, 1, 'Tomorrow 10:00 · Easypaisa', 'Wallet PIN not confirmed', true),
      D('Bhatti Traders', 'BHATTI', 'FS-INV-2026-01790', 11599, 'raast', 2, 5, 'Sat 11:00 · Raast', 'Raast request expired', false),
      D('Pak Agro Mills', 'PAKAGRO', 'FS-INV-2026-01833', 28999, 'card', 1, 1, 'Tomorrow 09:30 · Card', '3-D Secure not completed', true),
      D('Multan Cotton Exports', 'MULTEX', 'FS-INV-2026-01702', 57999, 'dd', 3, 9, 'Mon 10:00 · Raast', 'Mandate rejected by bank', false),
      D('Shaheen Logistics', 'SHAHEEN', 'FS-INV-2026-01688', 28999, 'card', 3, 11, 'Today 18:00 · Card', 'Card expired 09/26', true),
      D('Peshawar Steel Works', 'PESHSTL', 'FS-INV-2026-01655', 57999, 'jazz', 3, 13, 'Paused · read-only', 'Wallet limit exceeded', false),
      D('Sukkur Rice Co.', 'SUKRICE', 'FS-INV-2026-01512', 11599, 'easy', 4, 19, 'Manual only', 'Account dormant', false),
      D('Thar Coal Services', 'THARCOAL', 'FS-INV-2026-01488', 57999, 'card', 4, 22, 'Manual only', 'Card reported stolen', true),
      D('Quetta Dry Fruits', 'QTADRY', 'FS-INV-2026-01301', 28999, 'raast', 4, 41, 'Collections', 'No response to 9 reminders', false),
    ];
    const BUCKETS = [['1–7 days', 1, 7, 'Grace'], ['8–14 days', 8, 14, 'Read-only'], ['15–30 days', 15, 30, 'Suspended'], ['30+ days', 31, 999, 'Collections']];
    const pol = { grace: 7, ro: 7, sus: 31 };
    const stageOf = (r) => (r.promise ? 'Promise' : r.days <= pol.grace ? 'Grace' : r.days <= pol.grace + pol.ro ? 'Read-only' : r.days <= pol.grace + pol.ro + pol.sus ? 'Suspended' : 'Collections');
    const STG = { Grace: 'info', 'Read-only': 'warn', Suspended: 'danger', Collections: 'neutral', Promise: 'violet', Recovered: 'good' };
    let bucket = 0, selected = ROWS[0], recovered = 412480, attempts = 578, wins = 413;
    ROWS.forEach((r) => {
      const plan = [[0, r.m, 'Initial charge', 'fail'], [1, r.m, 'Smart retry · 10:00', 'fail'], [3, 'jazz', 'Fallback to wallet', 'fail'], [5, 'raast', 'Raast request-to-pay', 'fail'], [7, r.m, 'Final retry before read-only', 'fail']];
      r.hist = plan.map((p, i) => ({ d: p[0], m: p[1], l: p[2], s: i < r.att ? 'fail' : 'next' }));
    });
    sec.insertAdjacentHTML('beforeend', `
      <div class="kpi-grid">
        ${kpi('Recovered this month', `<span data-rec>${rs(recovered)}</span>`, '▲ 18% vs September', '', 'badge-check', 'up')}
        ${kpi('Recovery rate', `<span data-rate>${((wins / attempts) * 100).toFixed(1)}</span>%`, 'Smart retries · 30 days', 'teal', 'percent')}
        ${kpi('In dunning', `<span data-ind>${ROWS.length}</span> tenants`, `<span data-inda>${rs(ROWS.reduce((s, r) => s + r.amt, 0))}</span> outstanding`, 'yellow', 'alarm-clock')}
        ${kpi('Churn saved', '9 tenants', 'Rs 236,991 MRR kept this quarter', 'violet', 'shield-check')}
      </div>
      <div class="split ap-dun-split">
        <div class="panel flush">
          <div class="panel-head"><div><h3>Collections queue</h3><p>Click a row to see its retry plan</p></div><div class="panel-actions"><div class="seg ap-buckets" data-buckets></div></div></div>
          <div class="table-wrap"><table class="tbl ap-dtbl" data-plain><thead><tr><th>Tenant</th><th class="num">Amount</th><th>Method</th><th>Attempts · next retry</th><th>Stage</th><th></th></tr></thead><tbody></tbody></table></div>
        </div>
        <div class="panel ap-rt-panel">${head('<span data-rt-name></span>', '<span data-rt-sub></span>')}<div class="ap-rt" data-rt></div>
          <div class="ap-insight"><i data-lucide="sparkles"></i><div><b>Smart retry</b><p>Retries land at 10:00 on salary-credit days (1st and 10th). After two card declines we switch to JazzCash, then a Raast request-to-pay. JazzCash recovers 64% of failed cards.</p></div></div></div>
      </div>
      <div class="grid-2 ap-dun-bottom">
        <div class="panel">${head('Dunning policy', 'Drag the handles or type days. Applies to new failures.', '<button class="btn primary sm" data-pol-save><i data-lucide="save"></i>Save policy</button>')}
          <div class="ap-pol" data-pol>
            <div class="ap-pol-track"><div class="ap-pol-seg g"><span>Grace</span></div><div class="ap-pol-seg r"><span>Read-only</span></div><div class="ap-pol-seg s"><span>Suspended</span></div><div class="ap-pol-seg c"><span>Cancel</span></div>
              <button class="ap-pol-h" data-h="grace" aria-label="Grace end"></button><button class="ap-pol-h" data-h="ro" aria-label="Read-only end"></button><button class="ap-pol-h" data-h="sus" aria-label="Suspension end"></button></div>
            <div class="ap-pol-axis">${[0, 10, 20, 30, 40, 50, 60].map((d) => `<span style="left:${(d / 60) * 100}%">${d}</span>`).join('')}</div>
          </div>
          <div class="form-grid c3 ap-mt"><label><span>Grace (days)</span><input type="number" min="1" max="20" data-pn="grace" value="7"></label><label><span>Read-only (days)</span><input type="number" min="0" max="20" data-pn="ro" value="7"></label><label><span>Suspended before cancel</span><input type="number" min="5" max="40" data-pn="sus" value="31"></label></div>
          <p class="ap-pol-say" data-pol-say></p>
        </div>
        <div class="panel">${head('Reminder channels', 'Who hears what, and when. Times in PKT.', '<div class="seg" data-rlang><button class="active">English</button><button>اردو</button></div>')}
          <div class="ap-chan">${[['Email', 'mail', true, 'Your Finsoft invoice FS-INV-… of Rs 28,999 is unpaid. Pay in one tap →'], ['SMS', 'message-square-text', true, 'Finsoft: Rs 28,999 due. Pay via JazzCash/Easypaisa: fsft.pk/p/8KQ2'], ['WhatsApp', 'message-circle', false, 'Assalam-o-Alaikum! Your Finsoft payment of Rs 28,999 is pending. Reply PAY for a Raast link.']].map(([n, ic, on, txt]) => `<div class="ap-chan-row ${on ? 'on' : ''}"><span class="icon-tile ${n === 'WhatsApp' ? 'lime' : n === 'SMS' ? 'blue' : ''}"><i data-lucide="${ic}"></i></span><div class="ap-chan-main"><div class="row"><b>${n}</b><span class="spacer"></span><label class="switch"><input type="checkbox" ${on ? 'checked' : ''} data-chan="${n}"><i></i></label></div><p>${txt}</p><div class="ap-chipsel ap-days">${['−3', '0', '+1', '+3', '+7', '+14'].map((d, i) => `<button type="button" class="${(n === 'WhatsApp' ? [1, 3] : n === 'SMS' ? [1, 2, 4] : [0, 1, 3, 4, 5]).includes(i) ? 'on' : ''}">D${d}</button>`).join('')}</div></div></div>`).join('')}</div>
        </div>
      </div>`);
    const tb = $('.ap-dtbl tbody', sec);
    const dots = (r) => `<span class="ap-att">${[0, 1, 2, 3].map((i) => `<i class="${i < r.att ? 'f' : ''}"></i>`).join('')}<small>${r.att}/4</small></span>`;
    const inBucket = (r, b) => r.days >= BUCKETS[b][1] && r.days <= BUCKETS[b][2];
    function renderBuckets() {
      $('[data-buckets]', sec).innerHTML = BUCKETS.map(([l], i) => { const n = ROWS.filter((r) => inBucket(r, i)).length; return `<button class="${i === bucket ? 'active' : ''}" data-b="${i}">${l} <i class="ap-bcount ${i >= 2 ? 'hot' : ''}">${n}</i></button>`; }).join('');
    }
    function renderRows() {
      const list = ROWS.filter((r) => inBucket(r, bucket));
      if (!list.includes(selected)) selected = list[0] || null;
      tb.innerHTML = list.length ? list.map((r) => { const s = stageOf(r); const [ml, mi] = METHOD[r.m]; return `<tr data-code="${r.code}" class="${r === selected ? 'ap-sel' : ''}">
        <td><div class="cell-user">${logo(r.name)}<div><b>${esc(r.name)}</b><small>${r.inv} · ${r.days} d overdue</small></div></div></td>
        <td class="num"><b>${fmt(r.amt)}</b></td>
        <td><span class="ap-meth ${r.m}"><i data-lucide="${mi}"></i>${ml}</span></td>
        <td>${dots(r)}<small class="${/Today/.test(r.next) ? 'ap-warn-t' : ''}">${r.promise ? 'Paused · promise' : r.next}</small></td>
        <td><span class="badge ${STG[s]} dot">${s === 'Promise' ? 'Promise · ' + r.promise : s}</span></td>
        <td class="actions"><div class="row ap-nowrap"><button class="btn secondary sm" data-retry><i data-lucide="refresh-cw"></i>Retry</button><button class="icon-btn-sm" data-menu="off" data-ptp data-tip="Promise to pay" aria-label="Promise to pay"><i data-lucide="handshake"></i></button></div></td></tr>`; }).join('') : `<tr><td colspan="6"><div class="empty-state"><span class="icon-well lg"><i data-lucide="party-popper"></i></span><h4>Bucket cleared</h4><p>Nothing overdue in ${BUCKETS[bucket][0]}. Nice work.</p></div></td></tr>`;
      $$('tr', tb).forEach((tr, k) => { tr.style.setProperty('--ri', k); tr.classList.add('ap-row-in'); });
      icons(tb); renderTimeline();
    }
    function renderTimeline() {
      const r = selected;
      if (!r) { $('[data-rt-name]', sec).textContent = 'Retry plan'; $('[data-rt-sub]', sec).textContent = 'Select a tenant'; $('[data-rt]', sec).innerHTML = ''; return; }
      $('[data-rt-name]', sec).textContent = r.name;
      $('[data-rt-sub]', sec).textContent = `${rs(r.amt)} · ${r.reason}`;
      $('[data-rt]', sec).innerHTML = r.hist.map((h, i) => { const [ml, mi] = METHOD[h.m]; return `<div class="ap-rt-step ${h.s}" style="--i:${i}"><span class="ap-rt-dot"><i data-lucide="${h.s === 'fail' ? 'x' : h.s === 'ok' ? 'check' : 'clock'}"></i></span><div><b>Day ${h.d} · ${h.l}</b><small><i data-lucide="${mi}"></i>${ml}${h.s === 'fail' ? ' · declined' : h.s === 'ok' ? ' · paid' : h.s === 'next' && i === r.att ? ' · next up' : ' · scheduled'}</small></div></div>`; }).join('');
      icons($('[data-rt]', sec));
    }
    renderBuckets(); renderRows();

    async function retry(r, btn) {
      const tr = $(`tr[data-code="${r.code}"]`, tb);
      if (tr) tr.classList.add('ap-retrying');
      if (btn) { btn.disabled = true; btn.innerHTML = '<span class="ap-spin"></span>Charging…'; btn.dataset.tip = `Charging via ${METHOD[r.m === 'card' && r.att >= 2 ? 'jazz' : r.m][0]}`; }
      const prog = tr && tr.querySelector('td:first-child');
      if (prog) prog.insertAdjacentHTML('beforeend', '<span class="ap-rprog"><i></i></span>');
      await wait(reduce() ? 60 : 1400);
      attempts++;
      if (tr) tr.classList.remove('ap-retrying');
      $$('.ap-rprog', tb).forEach((p) => p.remove());
      if (r.ok) {
        wins++; recovered += r.amt;
        r.hist[Math.min(r.att, r.hist.length - 1)].s = 'ok';
        if (tr) { tr.classList.add('ap-won'); const st = tr.querySelector('.badge'); st.className = 'badge good dot'; st.textContent = 'Recovered'; }
        if (btn) { btn.innerHTML = '<i data-lucide="check"></i>Paid'; btn.className = 'btn sm ap-paid'; icons(btn); }
        tick($('[data-rec]', sec), recovered, { prefix: 'Rs ' });
        tick($('[data-rate]', sec), (wins / attempts) * 100, { dec: 1 });
        renderTimeline(); celebrate(btn || tr);
        toast(`${r.name} paid ${rs(r.amt)} · access restored`, { tone: 'good' });
        await wait(1100);
        const idx = ROWS.indexOf(r); ROWS.splice(idx, 1);
        const after = () => { tick($('[data-ind]', sec), ROWS.length); tick($('[data-inda]', sec), ROWS.reduce((s, x) => s + x.amt, 0), { prefix: 'Rs ' }); renderBuckets(); renderRows(); };
        tr ? rowOut(tr, after) : after();
        return true;
      }
      r.att = Math.min(4, r.att + 1);
      if (r.hist[r.att - 1]) r.hist[r.att - 1].s = 'fail';
      tick($('[data-rate]', sec), (wins / attempts) * 100, { dec: 1 });
      renderRows();
      const ntr = $(`tr[data-code="${r.code}"]`, tb); shake(ntr); if (ntr) ntr.classList.add('ap-lost');
      toast(`${r.name}: declined · ${r.reason.toLowerCase()}. Next smart retry ${r.next.split(' · ')[0]}`, { tone: 'danger' });
      return false;
    }
    function promise(r) {
      const m = modal({
        title: 'Promise to pay', sub: `${esc(r.name)} · ${r.inv}`,
        html: `<div class="form-grid"><label><span>Promised date</span><input type="date" name="d" value="2026-10-05" min="2026-10-01"></label><label><span>Amount (Rs)</span><input name="a" class="num" value="${fmt(r.amt)}"></label>
          <label class="full"><span>Logged from</span><select name="src">${opts(['Phone call with owner', 'WhatsApp message', 'Email reply', 'Account manager visit'])}</select></label>
          <label class="full"><span>Note</span><textarea name="n" rows="2" placeholder="e.g. Cheque from HBL to be deposited Monday"></textarea></label></div>
          <div class="ap-switches"><label class="switch"><input type="checkbox" checked><i></i><span>Pause automatic retries until the promised date</span></label><label class="switch"><input type="checkbox" ${r.days > pol.grace ? 'checked' : ''}><i></i><span>Lift read-only mode meanwhile</span></label><label class="switch"><input type="checkbox" checked><i></i><span>Remind owner one day before (SMS)</span></label></div>`,
        foot: `<button class="btn secondary" data-close>Cancel</button><button class="btn primary" data-ok><i data-lucide="handshake"></i>Log promise</button>`,
      });
      $('[data-ok]', m).onclick = async (e) => {
        const v = $('[name=d]', m).value; if (!v) { shake($('[name=d]', m)); return; }
        await busy(e.currentTarget, 600, 'Saving…');
        const dt = new Date(v); r.promise = `${String(dt.getDate()).padStart(2, '0')} ${MON[dt.getMonth()]}`;
        m.close(); renderRows(); flash($(`tr[data-code="${r.code}"]`, tb));
        toast(`Promise logged: ${r.name} will pay on ${r.promise}`, { tone: 'info' });
      };
    }
    /* policy builder */
    const MAX = 60;
    const polEl = $('[data-pol]', sec);
    function drawPolicy() {
      const g = pol.grace, r = pol.ro, s = pol.sus, pct = (d) => (Math.min(d, MAX) / MAX) * 100;
      const segs = $$('.ap-pol-seg', polEl);
      segs[0].style.cssText = `left:0;width:${pct(g)}%`; segs[1].style.cssText = `left:${pct(g)}%;width:${pct(g + r) - pct(g)}%`; segs[2].style.cssText = `left:${pct(g + r)}%;width:${pct(g + r + s) - pct(g + r)}%`; segs[3].style.cssText = `left:${pct(g + r + s)}%;width:${100 - pct(g + r + s)}%`;
      const hs = $$('.ap-pol-h', polEl); hs[0].style.left = pct(g) + '%'; hs[1].style.left = pct(g + r) + '%'; hs[2].style.left = pct(g + r + s) + '%';
      hs[0].dataset.d = `Day ${g}`; hs[1].dataset.d = `Day ${g + r}`; hs[2].dataset.d = `Day ${g + r + s}`;
      $$('[data-pn]', sec).forEach((i) => { if (document.activeElement !== i) i.value = pol[i.dataset.pn]; });
      $('[data-pol-say]', sec).innerHTML = `<b>Day 1–${g}</b> full access with reminders · ${r ? `<b>Day ${g + 1}–${g + r}</b> read-only (view & export only) · ` : ''}<b>Day ${g + r + 1}</b> suspended · <b>Day ${g + r + s + 1}</b> cancelled, data archived for 90 days.`;
    }
    drawPolicy();
    let drag = null;
    polEl.addEventListener('pointerdown', (e) => { const h = e.target.closest('.ap-pol-h'); if (!h) return; drag = h.dataset.h; h.setPointerCapture(e.pointerId); h.classList.add('drag'); });
    polEl.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const tr = $('.ap-pol-track', polEl).getBoundingClientRect();
      const day = Math.round(clamp((e.clientX - tr.left) / tr.width, 0, 1) * MAX);
      if (drag === 'grace') pol.grace = clamp(day, 1, 20);
      if (drag === 'ro') pol.ro = clamp(day - pol.grace, 0, 20);
      if (drag === 'sus') pol.sus = clamp(day - pol.grace - pol.ro, 5, 40);
      drawPolicy();
    });
    const endDrag = () => { if (!drag) return; $$('.ap-pol-h', polEl).forEach((h) => h.classList.remove('drag')); drag = null; renderRows(); };
    polEl.addEventListener('pointerup', endDrag); polEl.addEventListener('pointercancel', endDrag);
    polEl.addEventListener('keydown', (e) => { const h = e.target.closest('.ap-pol-h'); if (!h || !/Arrow(Left|Right)/.test(e.key)) return; e.preventDefault(); const k = h.dataset.h, dv = e.key === 'ArrowRight' ? 1 : -1; const lim = { grace: [1, 20], ro: [0, 20], sus: [5, 40] }[k]; pol[k] = clamp(pol[k] + dv, lim[0], lim[1]); drawPolicy(); });
    sec.addEventListener('input', (e) => { const i = e.target.closest('[data-pn]'); if (!i) return; const lim = { grace: [1, 20], ro: [0, 20], sus: [5, 40] }[i.dataset.pn]; const v = parseInt(i.value, 10); if (!isNaN(v)) { pol[i.dataset.pn] = clamp(v, lim[0], lim[1]); drawPolicy(); } });
    sec.addEventListener('change', (e) => {
      if (e.target.closest('[data-pn]')) { drawPolicy(); renderRows(); }
      const c = e.target.closest('[data-chan]'); if (c) { c.closest('.ap-chan-row').classList.toggle('on', c.checked); toast(`${c.dataset.chan} reminders ${c.checked ? 'on' : 'off'}`, { tone: c.checked ? 'good' : 'warn', ms: 1800 }); }
    });
    sec.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-buckets] button');
      if (b) { bucket = +b.dataset.b; renderRows(); return; }
      const rb = e.target.closest('[data-retry]');
      if (rb) { e.stopPropagation(); const r = ROWS.find((x) => x.code === rb.closest('tr').dataset.code); selected = r; $$('tr', tb).forEach((t) => t.classList.toggle('ap-sel', t === rb.closest('tr'))); renderTimeline(); retry(r, rb); return; }
      const pb = e.target.closest('[data-ptp]');
      if (pb) { promise(ROWS.find((x) => x.code === pb.closest('tr').dataset.code)); return; }
      const tr = e.target.closest('tbody tr[data-code]');
      if (tr) { selected = ROWS.find((x) => x.code === tr.dataset.code); $$('tr', tb).forEach((t) => t.classList.toggle('ap-sel', t === tr)); renderTimeline(); stagger(sec, '.ap-rt-step'); return; }
      const all = e.target.closest('[data-ap-act=retry-all]');
      if (all) {
        const due = ROWS.filter((r) => inBucket(r, bucket) && !r.promise && r.att < 4);
        if (!due.length) { toast('Nothing due for retry in this bucket', { tone: 'info' }); return; }
        all.disabled = true; let won = 0;
        for (const r of due) { selected = r; renderTimeline(); const btn = $(`tr[data-code="${r.code}"] [data-retry]`, tb); if (await retry(r, btn)) { won++; await wait(500); } }
        all.disabled = false; toast(`Batch retry finished · ${won} of ${due.length} recovered`, { tone: won ? 'good' : 'warn' }); return;
      }
      const ps = e.target.closest('[data-pol-save]');
      if (ps) { await busy(ps, 800, 'Saving…'); celebrate(ps); toast(`Policy saved · ${pol.grace} d grace → ${pol.ro} d read-only → suspend`); return; }
      const dch = e.target.closest('.ap-days button');
      if (dch) dch.classList.toggle('on');
      const rl = e.target.closest('[data-rlang] button');
      if (rl) {
        const ur = rl.textContent.trim() === 'اردو';
        const T = ur ? ['آپ کی فن سافٹ انوائس 28,999 روپے واجب الادا ہے۔ ایک کلک میں ادائیگی کریں ←', 'فن سافٹ: 28,999 روپے واجب الادا۔ جاز کیش/ایزی پیسہ سے ادا کریں: fsft.pk/p/8KQ2', 'السلام علیکم! آپ کی فن سافٹ ادائیگی 28,999 روپے زیر التوا ہے۔ راست لنک کے لیے PAY لکھیں۔'] : ['Your Finsoft invoice FS-INV-… of Rs 28,999 is unpaid. Pay in one tap →', 'Finsoft: Rs 28,999 due. Pay via JazzCash/Easypaisa: fsft.pk/p/8KQ2', 'Assalam-o-Alaikum! Your Finsoft payment of Rs 28,999 is pending. Reply PAY for a Raast link.'];
        $$('.ap-chan-main p', sec).forEach((p, i) => { p.textContent = T[i]; p.dir = ur ? 'rtl' : 'ltr'; p.classList.toggle('ap-ur', ur); flash(p); });
      }
    });
  });

  /* ================= 6 · admin/usage ================= */
  onRoute('admin/usage', (sec) => {
    const METRICS = [['users', 'Users', 'users', ''], ['inv', 'Invoices / mo', 'receipt-text', ''], ['sto', 'Storage', 'hard-drive', ' GB'], ['api', 'API calls', 'code-xml', ''], ['sms', 'SMS', 'message-square-text', ''], ['fbr', 'FBR submissions', 'plug', '']];
    const LIM = {
      Starter: { users: 5, inv: 500, sto: 10, api: 50000, sms: 200, fbr: 1000 },
      Growth: { users: 50, inv: 5000, sto: 50, api: 1000000, sms: 2000, fbr: 10000 },
      Business: { users: 200, inv: 20000, sto: 100, api: 5000000, sms: 10000, fbr: 50000 },
      Enterprise: { users: 500, inv: 100000, sto: 500, api: 20000000, sms: 50000, fbr: 250000 },
    };
    const FIX = { CRESTEX: { sto: 104 }, ALNOOR: { users: 48, inv: 3214, sto: 19.4, api: 412000, sms: 1840, fbr: 8940 }, BHATTI: { users: 5 }, HYDCRM: { users: 5, inv: 470 }, RAVIMTR: { inv: 5420 }, INDUSF: { api: 18900000 }, MARGALA: { fbr: 52300 }, ISBDGL: { api: 16200000, sto: 412 }, SHAHEEN: { sms: 2140 } };
    const ROWS = TENANTS.filter((t) => t.status !== 'Provisioning').map((t) => {
      const r = seededRand(hash(t.code) + 5), L = { ...LIM[t.plan] };
      if (t.plan === 'Enterprise') L.users = t.seats;
      const u = {}; METRICS.forEach(([k]) => { u[k] = k === 'users' ? t.users : Math.round(L[k] * (0.18 + r() * 0.62) * (k === 'sto' ? 10 : 1)) / (k === 'sto' ? 10 : 1); });
      Object.assign(u, FIX[t.code] || {});
      return { t, L, u, ov: {} };
    });
    const pct = (row, k) => (row.u[k] / row.L[k]) * 100;
    const short = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? Math.round(n / 1000) + 'k' : n % 1 ? n.toFixed(1) : fmt(n));
    const worst = (row) => Math.max(...METRICS.map(([k]) => pct(row, k)));
    let filter = 'all', sortK = null, metric = 'api';
    const RULES = [
      [true, 'Any meter ≥ 80%', 'Notify account manager in Slack #cs-alerts', 'bell'],
      [true, 'Any meter ≥ 100%', 'Email tenant owner with upgrade link (EN/UR)', 'mail'],
      [true, 'API calls ≥ 120%', 'Throttle to 10 req/s and page on-call engineer', 'gauge'],
      [false, 'SMS ≥ 100% on Starter', 'Block SMS, keep email reminders', 'message-square-off'],
      [true, 'Storage ≥ 95%', 'Offer 50 GB add-on at Rs 1,999/mo in-app', 'hard-drive'],
    ];
    sec.insertAdjacentHTML('beforeend', `
      <div class="kpi-grid">
        ${kpi('Over quota', `<span data-over></span> tenants`, 'Billing overage or upgrade pending', 'red', 'circle-alert', 'down')}
        ${kpi('Near limit (≥80%)', `<span data-near></span> tenants`, 'Upsell candidates this month', 'yellow', 'gauge')}
        ${kpi('API calls MTD', '18.4M', '▲ 22% vs September', 'blue', 'code-xml', 'up')}
        ${kpi('SMS sent MTD', '142,380', 'Rs 0.62 blended cost per SMS', 'teal', 'message-square-text')}
      </div>
      <div class="panel flush">
        <div class="panel-head"><div><h3>Per-tenant meters</h3><p>Click a column header to sort by utilisation · ⋮ to override a limit</p></div><div class="panel-actions"><div class="chips" data-uf><button class="active" data-f="all">All</button><button data-f="near">Near limit</button><button data-f="over">At / over limit</button></div></div></div>
        <div class="table-wrap"><table class="tbl ap-mtbl" data-plain><thead><tr><th>Tenant</th>${METRICS.map(([k, l, ic]) => `<th class="ap-sortable" data-k="${k}"><span><i data-lucide="${ic}"></i>${l}</span></th>`).join('')}<th></th></tr></thead><tbody></tbody></table></div>
        <div class="table-foot"><span class="ap-mlegend"><span><i class="ok"></i>Under 80%</span><span><i class="hot"></i>80–99%</span><span><i class="full"></i>At limit</span><span><i class="over"></i>Over limit</span></span><span data-ucount></span></div>
      </div>
      <div class="grid-2 ap-use-bottom">
        <div class="panel">${head('Top consumers', 'This month · share of platform total', `<div class="seg" data-metric>${[['api', 'API'], ['sto', 'Storage'], ['sms', 'SMS'], ['inv', 'Invoices']].map(([k, l]) => `<button class="${k === 'api' ? 'active' : ''}" data-m="${k}">${l}</button>`).join('')}</div>`)}<div class="ap-top" data-top></div></div>
        <div class="panel">${head('Alert rules', 'Evaluated every 15 minutes', '<button class="btn secondary sm" data-ap-act="add-rule"><i data-lucide="plus"></i>Rule</button>')}<div class="ap-rules" data-rules></div></div>
      </div>`);
    const tb = $('tbody', sec);
    const cell = (row, k, unit) => { const p = pct(row, k); return `<td class="ap-mcell">${meter(row.u[k], row.L[k], { compact: true, text: `${short(row.u[k])}${unit}<small> / ${short(row.L[k])}</small>`, tip: `${row.t.name} · ${Math.round(p)}% of ${row.ov[k] ? 'override ' : ''}limit` })}${row.ov[k] ? '<span class="ap-ovtag" data-tip="Limit override active"><i data-lucide="sliders-horizontal"></i></span>' : ''}</td>`; };
    function render() {
      let list = ROWS.filter((r) => filter === 'all' || (filter === 'near' ? worst(r) >= 80 && worst(r) < 100 : worst(r) >= 100));
      if (sortK) list = list.slice().sort((a, b) => pct(b, sortK) - pct(a, sortK));
      tb.innerHTML = list.map((r) => `<tr data-code="${r.t.code}"><td><div class="cell-user">${logo(r.t.name)}<div><b>${esc(r.t.name)}</b><small>${planPill(r.t.plan)}</small></div></div></td>${METRICS.map(([k, , , u]) => cell(r, k, u)).join('')}<td class="actions"><button class="icon-btn-sm" data-menu="off" data-ov aria-label="Override limit"><i data-lucide="sliders-horizontal"></i></button></td></tr>`).join('') || '<tr><td colspan="8"><div class="empty-state"><h4>Nobody here</h4><p>No tenants in this filter.</p></div></td></tr>';
      $$('tr', tb).forEach((tr, i) => { tr.style.setProperty('--ri', i); tr.classList.add('ap-row-in'); });
      $$('th[data-k]', sec).forEach((th) => th.classList.toggle('sorted', th.dataset.k === sortK));
      const over = ROWS.filter((r) => worst(r) >= 100).length, near = ROWS.filter((r) => worst(r) >= 80 && worst(r) < 100).length;
      tick($('[data-over]', sec), over); tick($('[data-near]', sec), near);
      $('[data-ucount]', sec).textContent = `${list.length} of ${ROWS.length} tenants`;
      icons(tb);
    }
    function renderTop() {
      const list = ROWS.slice().sort((a, b) => b.u[metric] - a.u[metric]).slice(0, 8), mx = list[0].u[metric], tot = ROWS.reduce((s, r) => s + r.u[metric], 0);
      const unit = metric === 'sto' ? ' GB' : '';
      $('[data-top]', sec).innerHTML = list.map((r, i) => `<div class="ap-top-row" style="--i:${i}"><span class="ap-top-rank">${i + 1}</span>${logo(r.t.name, 'xs')}<span class="ap-top-name">${esc(r.t.name)}</span><div class="ap-top-bar"><i style="--w:${(r.u[metric] / mx) * 100}%" class="${pct(r, metric) >= 100 ? 'over' : pct(r, metric) >= 80 ? 'hot' : ''}"></i></div><b>${short(r.u[metric])}${unit}</b><small>${((r.u[metric] / tot) * 100).toFixed(1)}%</small></div>`).join('');
    }
    function renderRules() {
      $('[data-rules]', sec).innerHTML = RULES.map(([on, c, a, ic], i) => `<div class="ap-rule ${on ? 'on' : ''}" style="--i:${i}"><span class="icon-well ${on ? '' : 'neutral'}"><i data-lucide="${ic}"></i></span><div><b>${c}</b><small>${a}</small></div><label class="switch"><input type="checkbox" ${on ? 'checked' : ''} data-rule="${i}"><i></i></label></div>`).join('');
      icons($('[data-rules]', sec));
    }
    render(); renderTop(); renderRules();

    function override(row) {
      const m = modal({
        title: 'Override limit', sub: `${esc(row.t.name)} · ${row.t.plan} plan`,
        html: `<div class="form-grid"><label class="full"><span>Meter</span><select name="k">${opts(METRICS.map(([k, l]) => [k, l]), worst(row) >= 80 ? METRICS.reduce((b, [k]) => (pct(row, k) > pct(row, b) ? k : b), 'users') : 'users')}</select></label>
          <label><span>Current limit</span><input name="cur" readonly></label><label><span>New limit *</span><input name="lim" type="number" min="1"></label>
          <label><span>Expires</span><select name="exp">${opts(['End of this cycle', '30 days', '90 days', 'Never (contract)'])}</select></label><label><span>Bill overage</span><select name="bill">${opts(['No · goodwill', 'Yes · at plan overage rate', 'Yes · custom price'])}</select></label>
          <label class="full"><span>Reason *</span><input name="why" placeholder="e.g. Year-end FBR filing spike, approved by Danish Ahmed"></label></div>
          <div class="ap-ovprev" data-ovprev></div>`,
        foot: `<button class="btn secondary" data-close>Cancel</button><button class="btn primary" data-ok><i data-lucide="sliders-horizontal"></i>Apply override</button>`,
      });
      const sync = () => { const k = $('[name=k]', m).value; $('[name=cur]', m).value = fmt(row.L[k]); const lim = +$('[name=lim]', m).value || Math.ceil(row.L[k] * 1.5); if (!$('[name=lim]', m).value) $('[name=lim]', m).placeholder = fmt(lim); $('[data-ovprev]', m).innerHTML = `<div><small>Now</small>${meter(row.u[k], row.L[k], { text: `${Math.round(pct(row, k))}%` })}</div><i data-lucide="arrow-right"></i><div><small>After override</small>${meter(row.u[k], lim, { text: `${Math.round((row.u[k] / lim) * 100)}%` })}</div>`; icons($('[data-ovprev]', m)); };
      sync();
      m.addEventListener('input', sync); m.addEventListener('change', sync);
      $('[data-ok]', m).onclick = async (e) => {
        if (!need(m, ['lim', 'why'])) return;
        const k = $('[name=k]', m).value, lim = +$('[name=lim]', m).value;
        if (lim <= 0) { shake($('[name=lim]', m)); return; }
        await busy(e.currentTarget, 700, 'Applying…');
        row.L[k] = lim; row.ov[k] = true;
        m.close(); render(); renderTop(); flash($(`tr[data-code="${row.t.code}"]`, tb));
        toast(`${METRICS.find((x) => x[0] === k)[1]} limit for ${row.t.code} set to ${fmt(lim)}`, { tone: 'good' });
      };
    }
    function addRule() {
      const m = modal({
        title: 'New alert rule', sub: 'Runs every 15 minutes against live meters',
        html: `<div class="form-grid"><label><span>Meter</span><select name="k">${opts(['Any meter'].concat(METRICS.map((x) => x[1])))}</select></label><label><span>Threshold</span><div class="ap-range"><input type="range" name="th" min="50" max="150" step="5" value="90"><b data-th>90%</b></div></label>
          <label><span>Plans</span><select name="pl">${opts(['All plans', 'Starter', 'Growth', 'Business', 'Enterprise'])}</select></label><label><span>Action</span><select name="act">${opts(['Notify account manager', 'Email tenant owner', 'Throttle', 'Block usage', 'Offer add-on in-app'])}</select></label></div>
          <div class="ap-rule-say" data-say></div>`,
        foot: `<button class="btn secondary" data-close>Cancel</button><button class="btn primary" data-ok><i data-lucide="bell-plus"></i>Create rule</button>`,
      });
      const say = () => { const f = formData(m); $('[data-th]', m).textContent = f.th + '%'; $('[data-say]', m).innerHTML = `<i data-lucide="zap"></i><span>When <b>${f.k.toLowerCase()}</b> reaches <b>${f.th}%</b> for <b>${f.pl.toLowerCase()}</b> → <b>${f.act.toLowerCase()}</b>. Would fire for <b>${ROWS.filter((r) => worst(r) >= +f.th).length}</b> tenants today.</span>`; icons($('[data-say]', m)); };
      say(); m.addEventListener('input', say); m.addEventListener('change', say);
      $('[data-ok]', m).onclick = async (e) => { const f = formData(m); await busy(e.currentTarget, 600, 'Creating…'); RULES.unshift([true, `${f.k} ≥ ${f.th}%${f.pl === 'All plans' ? '' : ' on ' + f.pl}`, f.act, 'bell-plus']); m.close(); renderRules(); flash($('.ap-rule', sec)); toast('Alert rule created'); };
    }
    sec.addEventListener('click', (e) => {
      const f = e.target.closest('[data-uf] button'); if (f) { filter = f.dataset.f; render(); return; }
      const th = e.target.closest('th[data-k]'); if (th) { sortK = sortK === th.dataset.k ? null : th.dataset.k; render(); return; }
      const ov = e.target.closest('[data-ov]'); if (ov) { override(ROWS.find((r) => r.t.code === ov.closest('tr').dataset.code)); return; }
      const mt = e.target.closest('[data-metric] button'); if (mt) { metric = mt.dataset.m; renderTop(); return; }
      if (e.target.closest('[data-ap-act=add-rule]')) addRule();
    });
    sec.addEventListener('change', (e) => { const r = e.target.closest('[data-rule]'); if (r) { RULES[+r.dataset.rule][0] = r.checked; r.closest('.ap-rule').classList.toggle('on', r.checked); toast(`Rule ${r.checked ? 'enabled' : 'paused'}: ${RULES[+r.dataset.rule][1]}`, { tone: r.checked ? 'good' : 'warn', ms: 2000 }); } });
  });

  /* ================= 7 · admin/partners ================= */
  onRoute('admin/partners', (sec) => {
    const PARTNERS = [
      { name: 'Lahore Tech Partners', city: 'Lahore', tier: 'Gold', n: 12, pct: 20, mrr: 349988, next: 15, iban: 'PK36 MEZN ••••  4471' },
      { name: 'Karachi ERP Solutions', city: 'Karachi', tier: 'Gold', n: 9, pct: 20, mrr: 287491, next: 15, iban: 'PK12 HABB •••• 9024' },
      { name: 'Pindi Digital', city: 'Rawalpindi', tier: 'Silver', n: 7, pct: 15, mrr: 174993, next: 10, iban: 'PK70 UNIL •••• 3318' },
      { name: 'Faisalabad Accounts Hub', city: 'Faisalabad', tier: 'Silver', n: 6, pct: 15, mrr: 124994, next: 10, iban: 'PK45 ALFH •••• 5510' },
      { name: 'Peshawar Systems', city: 'Peshawar', tier: 'Bronze', n: 4, pct: 10, mrr: 64996, next: 6, iban: 'PK08 BKIP •••• 7702' },
      { name: 'Multan SoftWorks', city: 'Multan', tier: 'Bronze', n: 3, pct: 10, mrr: 44997, next: 6, iban: 'PK91 MUCB •••• 1186' },
    ];
    PARTNERS.forEach((p) => { p.due = Math.round((p.mrr * p.pct) / 100); });
    const TIER = { Gold: 'warn', Silver: 'neutral', Bronze: 'orange' };
    const COUPONS = [
      { code: 'FINSOFT-STARTUP50', type: '%', val: 50, dur: '6 months', plans: ['Starter'], used: 41, cap: 200, status: 'Active', exp: '31 Dec 2026' },
      { code: 'FINSOFT-EXPO26', type: 'Rs', val: 5000, dur: 'Once', plans: ['Growth', 'Business'], used: 18, cap: 50, status: 'Active', exp: '15 Nov 2026' },
      { code: 'PARTNER-LTP20', type: '%', val: 20, dur: 'Forever', plans: ['Growth', 'Business', 'Enterprise'], used: 12, cap: 0, status: 'Active', exp: '—' },
      { code: 'FINSOFT-11-11', type: '%', val: 11, dur: 'Once', plans: ['Starter', 'Growth'], used: 0, cap: 300, status: 'Scheduled', exp: '12 Nov 2026' },
      { code: 'FINSOFT-AZADI14', type: '%', val: 14, dur: '12 months', plans: ['Starter', 'Growth', 'Business'], used: 112, cap: 150, status: 'Expired', exp: '31 Aug 2026' },
      { code: 'FINSOFT-RAMZAN25-26', type: '%', val: 25, dur: '3 months', plans: ['Growth', 'Business'], used: 96, cap: 100, status: 'Expired', exp: '30 Mar 2026' },
    ];
    const totalDue = () => PARTNERS.reduce((s, p) => s + p.due, 0);
    sec.insertAdjacentHTML('beforeend', `
      <div data-tabs class="ap-ptabs">
        <div class="tabs"><button class="active" data-tab="res"><i data-lucide="handshake"></i>Resellers <i>${PARTNERS.length}</i></button><button data-tab="cou"><i data-lucide="ticket-percent"></i>Coupons <i data-ccount>${COUPONS.length}</i></button></div>
        <div class="tab-pane active" data-pane="res">
          <div class="kpi-grid">
            ${kpi('Partners', '6', '2 Gold · 2 Silver · 2 Bronze', '', 'handshake')}
            ${kpi('Tenants via partners', '41', '32% of new logos this year', 'teal', 'building-2', 'up')}
            ${kpi('Partner-sourced MRR', 'Rs 1,047,459', '27% of platform MRR', 'blue', 'trending-up')}
            ${kpi('Commission due', `<span data-due>${rs(totalDue())}</span>`, 'Payout run on 05 Oct · WHT 12% u/s 233', 'yellow', 'wallet')}
          </div>
          <div class="ap-pgrid">${PARTNERS.map((p, i) => `<div class="card ap-pcard" data-p="${i}" style="--i:${i}">
            <div class="ap-pcard-top">${logo(p.name, 'lg')}<div><b>${p.name}</b><small><i data-lucide="map-pin"></i>${p.city}</small></div><span class="badge ${TIER[p.tier]} ap-tier"><i data-lucide="award"></i>${p.tier}</span></div>
            <div class="ap-pstats"><div><small>Tenants</small><b>${p.n}</b></div><div><small>Commission</small><b>${p.pct}%</b></div><div><small>Their MRR</small><b>${Math.round(p.mrr / 1000)}k</b></div></div>
            <div class="ap-ptier"><div class="row"><small>${p.next - p.n} more tenants to ${p.tier === 'Gold' ? 'Platinum' : p.tier === 'Silver' ? 'Gold' : 'Silver'}</small><span class="spacer"></span><small>${p.n}/${p.next}</small></div><div class="ap-bar thin"><i style="--w:${(p.n / p.next) * 100}%"></i></div></div>
            <div class="ap-pdue"><div><small>Payout due</small><b data-pdue>${rs(p.due)}</b></div><button class="btn secondary sm" data-stmt><i data-lucide="file-text"></i>Statement</button></div>
          </div>`).join('')}</div>
        </div>
        <div class="tab-pane" data-pane="cou">
          <div class="ap-cgen">
            <div class="panel">${head('Coupon generator', 'Codes are case-insensitive and validated at checkout')}
              <div class="form-grid">
                <div class="field full"><span>Code</span><div class="ap-codein"><input name="code" value="FINSOFT-RAMZAN25" autocomplete="off" spellcheck="false"><button class="btn ghost sm" type="button" data-shuffle><i data-lucide="shuffle"></i>Shuffle</button></div></div>
                <div class="field"><span>Discount type</span><div class="seg" data-ctype><button class="active" data-t="%">Percent</button><button data-t="Rs">Flat (Rs)</button></div></div>
                <label><span>Value</span><input name="val" type="number" min="1" value="25"></label>
                <label><span>Duration</span><select name="dur">${opts(['Once', '3 months', '6 months', '12 months', 'Forever'], '3 months')}</select></label>
                <label><span>Redemption cap</span><input name="cap" type="number" min="0" value="250" placeholder="0 = unlimited"></label>
                <label><span>Starts</span><input type="date" name="from" value="2027-02-05"></label>
                <label><span>Expires</span><input type="date" name="to" value="2027-03-12"></label>
              </div>
              <div class="ap-lbl ap-mt">Applies to plans</div><div class="ap-chipsel" data-cplans>${Object.keys(PLAN).map((p, i) => `<button type="button" class="${i === 1 || i === 2 ? 'on' : ''}">${p}</button>`).join('')}</div>
              <div class="ap-switches"><label class="switch"><input type="checkbox" name="first" checked><i></i><span>New customers only</span></label><label class="switch"><input type="checkbox" name="stack"><i></i><span>Stackable with partner discounts</span></label></div>
              <div class="form-actions ap-mt"><button class="btn primary" data-create><i data-lucide="ticket-plus"></i>Create coupon</button></div>
            </div>
            <div class="ap-ticket-wrap"><div class="ap-ticket" data-ticket></div><p class="ap-ticket-note"><i data-lucide="info"></i><span data-impact></span></p></div>
          </div>
          <div class="panel flush">${head('All coupons', 'Redemptions update in real time', '<label class="search-field ap-sf" data-plain-search><i data-lucide="search"></i><input data-csearch placeholder="Search codes…"></label>')}
            <div class="table-wrap"><table class="tbl ap-ctbl" data-plain><thead><tr><th>Code</th><th>Discount</th><th>Duration</th><th>Plans</th><th>Redemptions</th><th>Expires</th><th>Status</th><th></th></tr></thead><tbody></tbody></table></div></div>
        </div>
      </div>`);

    /* statements */
    function statement(p, card) {
      const r = seededRand(hash(p.name));
      const names = TENANTS.slice().sort(() => r() - 0.5).slice(0, Math.min(p.n, 8));
      const lines = names.map((t) => { const mrr = t.plan === 'Enterprise' ? 145000 : PLAN[t.plan].price; return [t, mrr, Math.round((mrr * p.pct) / 100)]; });
      const gross = p.due, wht = Math.round(gross * 0.12), net = gross - wht;
      const d = drawer({
        title: `${p.name} · statement`, sub: `September 2026 · ${p.tier} tier at ${p.pct}%`, wide: true,
        html: `<div class="ap-stmt-head"><div><small>Gross commission</small><b>${rs(gross)}</b></div><div><small>WHT 12% · u/s 233</small><b class="ap-danger-t">− ${rs(wht)}</b></div><div class="net"><small>Net payable</small><b>${rs(net)}</b></div></div>
          <div class="table-wrap ap-mt"><table class="tbl" data-plain><thead><tr><th>Tenant</th><th>Plan</th><th class="num">MRR (Rs)</th><th class="num">Commission</th></tr></thead><tbody>${lines.map(([t, m, c]) => `<tr><td><div class="cell-user">${logo(t.name, 'xs')}<b>${esc(t.name)}</b></div></td><td>${planPill(t.plan)}</td><td class="num">${fmt(m)}</td><td class="num">${fmt(c)}</td></tr>`).join('')}${p.n > lines.length ? `<tr><td colspan="4" class="ap-muted-t">+ ${p.n - lines.length} more tenants</td></tr>` : ''}<tr class="total"><td colspan="3">Total commission</td><td class="num">${fmt(gross)}</td></tr></tbody></table></div>
          <div class="dl ap-mt"><div><span>Pay to</span><b>${p.iban}</b></div><div><span>Payout method</span><b>IBFT via Meezan Bank</b></div><div><span>NTN on file</span><b>Yes · active taxpayer</b></div></div>`,
        foot: `<button class="btn secondary" data-toast="Statement PDF sent to ${p.name}"><i data-lucide="send"></i>Email PDF</button><button class="btn primary" data-pay ${p.due ? '' : 'disabled'}><i data-lucide="banknote"></i>${p.due ? 'Mark as paid' : 'Paid'}</button>`,
      });
      $('[data-pay]', d).onclick = async (e) => {
        const b = e.currentTarget;
        await busy(b, 1100, 'Sending IBFT…');
        p.due = 0; b.disabled = true; b.innerHTML = '<i data-lucide="check"></i>Paid'; icons(b);
        celebrate(b);
        $('[data-pdue]', card).innerHTML = '<span class="badge good dot">Paid · 01 Oct</span>';
        tick($('[data-due]', sec), totalDue(), { prefix: 'Rs ' });
        toast(`${rs(net)} paid to ${p.name} · WHT certificate generated`);
      };
    }
    /* coupons */
    const gen = $('.ap-cgen', sec);
    let ctype = '%';
    const pick = () => $$('[data-cplans] .on', gen).map((b) => b.textContent.replace('✓ ', ''));
    function drawTicket() {
      const f = formData(gen), plans = pick();
      const v = +f.val || 0;
      const fmtD2 = (s) => { if (!s) return '—'; const d = new Date(s); return `${String(d.getDate()).padStart(2, '0')} ${MON[d.getMonth()]} ${d.getFullYear()}`; };
      $('[data-ticket]', sec).innerHTML = `<div class="ap-ticket-l"><small>Finsoft Cloud · coupon</small><b class="ap-ticket-off">${ctype === '%' ? `${v}%` : `Rs ${fmt(v)}`}<span>off</span></b><p>${f.dur === 'Once' ? 'first invoice' : f.dur === 'Forever' ? 'every invoice, forever' : `for ${f.dur}`}</p><div class="ap-ticket-plans">${plans.length ? plans.map(planPill).join('') : '<span class="ap-muted-t">No plans selected</span>'}</div></div>
        <div class="ap-ticket-r"><code>${esc((f.code || 'CODE').toUpperCase())}</code><small>${fmtD2(f.from)} → ${fmtD2(f.to)}</small><small>${+f.cap ? `First ${fmt(+f.cap)} redemptions` : 'Unlimited redemptions'}${f.first ? ' · new customers' : ''}</small></div>`;
      const avg = plans.reduce((s, p) => s + PLAN[p].price, 0) / (plans.length || 1);
      const months = { Once: 1, '3 months': 3, '6 months': 6, '12 months': 12, Forever: 24 }[f.dur];
      const per = ctype === '%' ? (avg * v) / 100 : Math.min(v, avg);
      $('[data-impact]', sec).innerHTML = `Est. discount cost <b>${rs(per * months * (+f.cap || 100) * 0.35)}</b> at a 35% redemption rate · ${rs(per)} off per invoice`;
    }
    drawTicket();
    gen.addEventListener('input', drawTicket);
    gen.addEventListener('change', drawTicket);
    const ctb = $('.ap-ctbl tbody', sec);
    let cq = '';
    const ST = { Active: 'good', Scheduled: 'info', Expired: 'neutral', Paused: 'warn' };
    function renderCoupons() {
      const list = COUPONS.filter((c) => !cq || c.code.toLowerCase().includes(cq));
      ctb.innerHTML = list.map((c) => `<tr data-c="${c.code}"><td><div class="ap-cc"><code class="code">${c.code}</code><button class="icon-btn-sm" data-menu="off" data-ccopy aria-label="Copy code"><i data-lucide="copy"></i></button></div></td>
        <td><b>${c.type === '%' ? c.val + '%' : 'Rs ' + fmt(c.val)}</b> off</td><td>${c.dur}</td><td><div class="row ap-wrap ap-gap4">${c.plans.map(planPill).join('')}</div></td>
        <td>${c.cap ? meter(c.used, c.cap, { compact: true, text: `${c.used} / ${c.cap}` }) : `<span class="ap-muted-t">${c.used} · no cap</span>`}</td><td>${c.exp}</td><td><span class="badge ${ST[c.status]} dot">${c.status}</span></td>
        <td class="actions"><button class="icon-btn-sm" data-menu="off" data-cmore aria-label="More"><i data-lucide="more-horizontal"></i></button></td></tr>`).join('') || '<tr><td colspan="8"><div class="empty-state"><h4>No coupons match</h4></div></td></tr>';
      icons(ctb);
    }
    renderCoupons();
    sec.addEventListener('click', async (e) => {
      if (e.target.closest('[data-ap-act=new-coupon]')) { $('[data-tab="cou"]', sec).click(); setTimeout(() => { const i = $('[name=code]', gen); i.focus(); i.select(); gen.scrollIntoView({ behavior: reduce() ? 'auto' : 'smooth', block: 'start' }); }, 80); return; }
      const st = e.target.closest('[data-stmt]'); if (st) { const card = st.closest('.ap-pcard'); statement(PARTNERS[+card.dataset.p], card); return; }
      const ct = e.target.closest('[data-ctype] button'); if (ct) { ctype = ct.dataset.t; $('[name=val]', gen).value = ctype === '%' ? 25 : 5000; drawTicket(); return; }
      const cp = e.target.closest('[data-cplans] button'); if (cp) { cp.classList.toggle('on'); drawTicket(); return; }
      if (e.target.closest('[data-shuffle]')) { const w = ['RAMZAN', 'EID', 'AZADI', 'GROW', 'SME', 'KARACHI', 'LAHORE', 'BOOKS']; const i = $('[name=code]', gen); i.value = `FINSOFT-${w[Math.floor(Math.random() * w.length)]}${Math.floor(10 + Math.random() * 40)}`; flash(i); drawTicket(); return; }
      const cr = e.target.closest('[data-create]');
      if (cr) {
        const f = formData(gen), code = f.code.toUpperCase().replace(/\s+/g, '');
        if (!/^[A-Z0-9-]{4,24}$/.test(code)) { const i = $('[name=code]', gen); i.classList.add('ap-invalid'); shake(i.closest('label')); toast('Codes are 4–24 letters, digits or dashes', { tone: 'warn' }); return; }
        if (COUPONS.some((c) => c.code === code)) { shake($('[name=code]', gen).closest('label')); toast(`${code} already exists`, { tone: 'warn' }); return; }
        if (!(+f.val > 0) || (ctype === '%' && +f.val > 100)) { shake($('[name=val]', gen).closest('label')); toast('Enter a valid discount value', { tone: 'warn' }); return; }
        if (!pick().length) { shake($('[data-cplans]', gen)); toast('Pick at least one plan', { tone: 'warn' }); return; }
        await busy(cr, 800, 'Creating…');
        const d = new Date(f.to);
        COUPONS.unshift({ code, type: ctype, val: +f.val, dur: f.dur, plans: pick(), used: 0, cap: +f.cap || 0, status: new Date(f.from) > TODAY ? 'Scheduled' : 'Active', exp: isNaN(d) ? '—' : `${String(d.getDate()).padStart(2, '0')} ${MON[d.getMonth()]} ${d.getFullYear()}` });
        cq = ''; $('[data-csearch]', sec).value = ''; renderCoupons(); flash($('tr', ctb));
        tick($('[data-ccount]', sec), COUPONS.length);
        celebrate($('[data-ticket]', sec));
        toast(`${code} created`, { action: { label: 'Copy', fn: () => copy(code, `${code} copied`) } });
        return;
      }
      const cc = e.target.closest('[data-ccopy]'); if (cc) { const code = cc.closest('tr').dataset.c; copy(code, `${code} copied`); cc.innerHTML = '<i data-lucide="check"></i>'; icons(cc); setTimeout(() => { cc.innerHTML = '<i data-lucide="copy"></i>'; icons(cc); }, 1400); return; }
      const cm = e.target.closest('[data-cmore]');
      if (cm) {
        e.stopPropagation();
        const tr = cm.closest('tr'), c = COUPONS.find((x) => x.code === tr.dataset.c);
        FS.menu(cm, [
          { label: 'Copy code', icon: 'copy', onClick: () => copy(c.code, `${c.code} copied`) },
          { label: 'Copy share link', icon: 'link', onClick: () => copy(`https://finsoft.pk/signup?coupon=${c.code}`, 'Share link copied') },
          c.status === 'Paused' ? { label: 'Resume', icon: 'play', onClick: () => { c.status = 'Active'; renderCoupons(); flash($(`tr[data-c="${c.code}"]`, ctb)); } } : { label: 'Pause', icon: 'pause', onClick: () => { c.status = 'Paused'; renderCoupons(); flash($(`tr[data-c="${c.code}"]`, ctb)); toast(`${c.code} paused`, { tone: 'warn' }); } },
          { sep: true },
          { label: 'Delete', icon: 'trash-2', danger: true, onClick: async () => { if (!(await confirmBox({ title: `Delete ${c.code}?`, text: `${c.used} existing redemptions keep their discount. The code stops working at checkout.`, okLabel: 'Delete', danger: true }))) return; const i = COUPONS.indexOf(c); rowOut(tr, () => { COUPONS.splice(i, 1); renderCoupons(); tick($('[data-ccount]', sec), COUPONS.length); }); toast(`${c.code} deleted`, { tone: 'danger' }); } },
        ]);
      }
    });
    $('[data-csearch]', sec).addEventListener('input', (e) => { cq = e.target.value.trim().toLowerCase(); e.target.closest('.search-field').classList.toggle('has-val', !!cq); renderCoupons(); });
  });

  /* ================= 8 · admin/leads ================= */
  onRoute('admin/leads', (sec) => {
    const COLS = [['lead', 'Lead', 'inbox', 'blue'], ['demo', 'Demo booked', 'presentation', 'violet'], ['trial', 'Trial', 'hourglass', 'warn'], ['paid', 'Paid', 'badge-check', 'good'], ['churn', 'Churned', 'user-x', 'danger']];
    const SRC = { Website: 'globe', Referral: 'users', Partner: 'handshake', Facebook: 'thumbs-up', LinkedIn: 'briefcase', Expo: 'tent' };
    const OWN = ['Mariam Iqbal', 'Danish Ahmed', 'Areeba Khalid', 'Saim Javed'];
    let uid = 0;
    const L = (col, co, city, src, own, plan, extra = {}) => ({ id: ++uid, col, co, city, src, own, plan, val: PLAN[plan].price, ...extra });
    const LEADS = [
      L('lead', 'Sialkot Surgical Instruments', 'Sialkot', 'Website', 'Mariam Iqbal', 'Growth', { note: 'Downloaded GST guide' }),
      L('lead', 'Lyallpur Weaving', 'Faisalabad', 'Partner', 'Mariam Iqbal', 'Business', { note: 'Via Faisalabad Accounts Hub' }),
      L('lead', 'Gujrat Fans Co.', 'Gujrat', 'Expo', 'Danish Ahmed', 'Starter', { note: 'Met at ITCN Asia' }),
      L('lead', 'Hunza Organic', 'Gilgit', 'Facebook', 'Areeba Khalid', 'Starter', { note: 'Asked about Urdu invoices' }),
      L('demo', 'Karachi Pharma Distributors', 'Karachi', 'LinkedIn', 'Saim Javed', 'Business', { note: 'Demo Thu 11:00' }),
      L('demo', 'Chenab Rice Mills', 'Gujranwala', 'Referral', 'Danish Ahmed', 'Growth', { note: 'Demo Fri 15:30' }),
      L('demo', 'Indus Hospital Supplies', 'Karachi', 'Website', 'Areeba Khalid', 'Business', { note: 'Demo Mon 12:00' }),
      L('trial', 'Karakoram Tech', 'Islamabad', 'Website', 'Mariam Iqbal', 'Growth', { score: 86, left: 2 }),
      L('trial', 'Thar Solar', 'Hyderabad', 'Partner', 'Areeba Khalid', 'Business', { score: 71, left: 9 }),
      L('trial', 'Quaid Logistics', 'Lahore', 'Referral', 'Danish Ahmed', 'Growth', { score: 58, left: 12 }),
      L('trial', 'Sialkot Sports Co.', 'Sialkot', 'Expo', 'Mariam Iqbal', 'Growth', { score: 42, left: 5 }),
      L('paid', 'Gwadar Marine', 'Gwadar', 'Website', 'Areeba Khalid', 'Starter', { note: 'Won 01 Oct' }),
      L('paid', 'Swat Valley Foods', 'Mingora', 'Partner', 'Danish Ahmed', 'Growth', { note: 'Won 14 Sep' }),
      L('paid', 'Hyderabad Ceramics', 'Hyderabad', 'Referral', 'Mariam Iqbal', 'Starter', { note: 'Won 03 Sep' }),
      L('churn', 'Nawabshah Sugar', 'Nawabshah', 'Website', 'Danish Ahmed', 'Growth', { note: 'Reason: price' }),
      L('churn', 'Kasur Leather Works', 'Kasur', 'Facebook', 'Areeba Khalid', 'Starter', { note: 'Reason: went with competitor' }),
    ];
    let q = '', owner = '';
    sec.insertAdjacentHTML('beforeend', `
      <div class="ap-lstats" data-lstats></div>
      <div class="toolbar" data-plain-search>
        <label class="search-field"><i data-lucide="search"></i><input data-lq placeholder="Search company or city…"></label>
        <div class="ap-owners" data-owners>${OWN.map((o) => `<button type="button" data-o="${o}" data-tip="${o}">${avatar(o, 'sm')}</button>`).join('')}</div>
        <span class="spacer"></span><span class="ap-hint"><i data-lucide="hand"></i>Drag cards between columns</span>
      </div>
      <div class="kanban ap-kb" data-kb>${COLS.map(([k, l, ic, tone]) => `<div class="kb-col ap-col-${tone}" data-col="${k}"><div class="kb-col-head"><h4><i class="ap-cdot"></i>${l}</h4><span data-n>0</span></div><small class="ap-colval" data-v></small><div class="ap-kb-list" data-list></div></div>`).join('')}</div>`);
    const kb = $('[data-kb]', sec);
    const card = (d) => `<article class="kb-card ap-lcard" draggable="true" data-id="${d.id}" tabindex="0" aria-label="${esc(d.co)}">
      <div class="ap-lc-top">${logo(d.co, 'xs')}<b>${esc(d.co)}</b><button class="icon-btn-sm" data-menu="off" data-lmore aria-label="Lead actions"><i data-lucide="more-horizontal"></i></button></div>
      <div class="ap-lc-meta"><span><i data-lucide="map-pin"></i>${d.city}</span><span class="ap-src"><i data-lucide="${SRC[d.src]}"></i>${d.src}</span></div>
      ${d.col === 'trial' ? `<div class="ap-eng ${healthTone(d.score)}"><div class="row"><small>Trial engagement</small><span class="spacer"></span><b>${d.score}</b></div><div class="ap-bar thin ${healthTone(d.score)}"><i style="--w:${d.score}%"></i></div><small>${d.left} day${d.left > 1 ? 's' : ''} left</small></div>` : d.note ? `<small class="ap-lc-note">${esc(d.note)}</small>` : ''}
      <div class="ap-lc-foot">${avatar(d.own, 'xs')}<span>${d.own.split(' ')[0]}</span><span class="spacer"></span>${planPill(d.plan)}<b>${fmt(d.val)}</b></div></article>`;
    const visible = (d) => (!q || `${d.co} ${d.city}`.toLowerCase().includes(q)) && (!owner || d.own === owner);
    function render(flashId) {
      COLS.forEach(([k]) => {
        const col = $(`[data-col="${k}"]`, kb), list = LEADS.filter((d) => d.col === k);
        $('[data-list]', col).innerHTML = list.filter(visible).map(card).join('') || '<div class="ap-kb-empty"><i data-lucide="inbox"></i>Drop here</div>';
        tick($('[data-n]', col), list.length);
        $('[data-v]', col).innerHTML = `${rs(list.reduce((s, d) => s + d.val, 0))} <em>/ mo</em>`;
      });
      icons(kb);
      if (flashId) { const c = $(`[data-id="${flashId}"]`, kb); if (c) { c.classList.add('ap-landed'); setTimeout(() => c.classList.remove('ap-landed'), 900); } }
      stats();
    }
    function stats() {
      const n = (k) => LEADS.filter((d) => d.col === k).length, v = (k) => LEADS.filter((d) => d.col === k).reduce((s, d) => s + d.val, 0);
      const reached = { lead: LEADS.length, demo: LEADS.length - n('lead'), trial: n('trial') + n('paid') + n('churn'), paid: n('paid') + n('churn') };
      const pipe = v('lead') + v('demo') + v('trial');
      $('[data-lstats]', sec).innerHTML = `
        <div class="ap-ls"><small>Pipeline value</small><b>${rs(pipe)}<em>/mo</em></b><span>${n('lead') + n('demo') + n('trial')} open deals</span></div>
        ${[['Leads', 'lead', reached.lead], ['Demos', 'demo', reached.demo], ['Trials', 'trial', reached.trial], ['Paid', 'paid', n('paid')]].map(([l, k, c], i, a) => `<div class="ap-ls step"><small>${l}</small><b>${c}</b>${i ? `<span class="ap-conv"><i data-lucide="arrow-right"></i>${a[i - 1][2] ? Math.round((c / a[i - 1][2]) * 100) : 0}%</span>` : '<span>All time this quarter</span>'}</div>`).join('')}
        <div class="ap-ls win"><small>Win rate</small><b>${Math.round((n('paid') / Math.max(1, n('paid') + n('churn'))) * 100)}%</b><span>${rs(v('paid'))} won MRR</span></div>`;
      icons($('[data-lstats]', sec));
    }
    render();

    function move(id, col, beforeId) {
      const d = LEADS.find((x) => x.id === id); if (!d) return;
      const from = d.col;
      LEADS.splice(LEADS.indexOf(d), 1);
      d.col = col;
      if (col === 'trial' && d.score == null) { d.score = 50 + (d.id * 7) % 40; d.left = 14; }
      if (col === 'paid') d.note = 'Won today';
      const bi = beforeId ? LEADS.findIndex((x) => x.id === beforeId) : -1;
      if (bi >= 0) LEADS.splice(bi, 0, d); else LEADS.push(d);
      render(id);
      if (from === col) return;
      const name = COLS.find((c) => c[0] === col)[1];
      if (col === 'paid') { celebrate($(`[data-id="${id}"]`, kb)); toast(`${d.co} is now a paying tenant · +${rs(d.val)} MRR`, { tone: 'good', action: { label: 'Onboard', fn: () => FS.go('admin/tenants/new') } }); }
      else if (col === 'churn') toast(`${d.co} marked churned`, { tone: 'warn', undo: () => move(id, from) });
      else toast(`${d.co} moved to ${name}`, { tone: 'info', ms: 2200, undo: () => move(id, from) });
    }
    /* HTML5 drag & drop */
    let dragId = null, ph = null;
    const clearPh = () => { if (ph) ph.remove(); ph = null; $$('.kb-col', kb).forEach((c) => c.classList.remove('ap-over')); };
    kb.addEventListener('dragstart', (e) => {
      const c = e.target.closest('.ap-lcard'); if (!c) return;
      dragId = +c.dataset.id;
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', String(dragId)); } catch (er) { /* ignore */ }
      requestAnimationFrame(() => c.classList.add('ap-dragging'));
    });
    kb.addEventListener('dragend', (e) => { const c = e.target.closest('.ap-lcard'); if (c) c.classList.remove('ap-dragging'); clearPh(); dragId = null; });
    kb.addEventListener('dragover', (e) => {
      const col = e.target.closest('.kb-col'); if (!col || dragId == null) return;
      e.preventDefault(); e.dataTransfer.dropEffect = 'move';
      $$('.kb-col', kb).forEach((c) => c.classList.toggle('ap-over', c === col));
      const list = $('[data-list]', col);
      if (!ph) { ph = document.createElement('div'); ph.className = 'ap-ph'; }
      const after = $$('.ap-lcard:not(.ap-dragging)', list).find((c) => { const r = c.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
      const empty = $('.ap-kb-empty', list); if (empty) empty.hidden = true;
      if (after) { if (ph.nextSibling !== after) list.insertBefore(ph, after); } else if (list.lastElementChild !== ph) list.appendChild(ph);
    });
    kb.addEventListener('dragleave', (e) => { const col = e.target.closest('.kb-col'); if (col && !col.contains(e.relatedTarget)) { col.classList.remove('ap-over'); if (ph && ph.parentNode && col.contains(ph)) ph.remove(); } });
    kb.addEventListener('drop', (e) => {
      const col = e.target.closest('.kb-col'); if (!col || dragId == null) return;
      e.preventDefault();
      const next = ph && ph.nextElementSibling && ph.nextElementSibling.classList.contains('ap-lcard') ? +ph.nextElementSibling.dataset.id : null;
      const id = dragId; clearPh(); dragId = null;
      move(id, col.dataset.col, next);
    });
    /* keyboard / menu fallback */
    sec.addEventListener('click', (e) => {
      const mo = e.target.closest('[data-lmore]');
      if (mo) {
        e.stopPropagation();
        const d = LEADS.find((x) => x.id === +mo.closest('.ap-lcard').dataset.id);
        FS.menu(mo, COLS.filter(([k]) => k !== d.col).map(([k, l, ic]) => ({ label: `Move to ${l}`, icon: ic, onClick: () => move(d.id, k) })).concat([{ sep: true }, { label: 'Delete lead', icon: 'trash-2', danger: true, onClick: () => { const i = LEADS.indexOf(d); const c = $(`[data-id="${d.id}"]`, kb); c.classList.add('ap-gone'); setTimeout(() => { LEADS.splice(i, 1); render(); }, 260); toast(`${d.co} deleted`, { tone: 'danger', undo: () => { LEADS.splice(i, 0, d); render(d.id); } }); } }]));
        return;
      }
      const ob = e.target.closest('[data-o]');
      if (ob) { owner = owner === ob.dataset.o ? '' : ob.dataset.o; $$('[data-o]', sec).forEach((b) => b.classList.toggle('on', b.dataset.o === owner)); $('[data-owners]', sec).classList.toggle('filtering', !!owner); render(); return; }
      if (e.target.closest('[data-ap-act=new-lead]')) newLead();
    });
    kb.addEventListener('keydown', (e) => {
      const c = e.target.closest('.ap-lcard'); if (!c || !/Arrow(Left|Right)/.test(e.key)) return;
      const d = LEADS.find((x) => x.id === +c.dataset.id), i = COLS.findIndex((x) => x[0] === d.col) + (e.key === 'ArrowRight' ? 1 : -1);
      if (i < 0 || i >= COLS.length) return;
      move(d.id, COLS[i][0]); const n = $(`[data-id="${d.id}"]`, kb); if (n) n.focus();
    });
    $('[data-lq]', sec).addEventListener('input', (e) => { q = e.target.value.trim().toLowerCase(); e.target.closest('.search-field').classList.toggle('has-val', !!q); render(); });
    function newLead() {
      const m = modal({
        title: 'New lead', sub: 'Lands in the Lead column', size: 'wide',
        html: `<div class="form-grid"><label><span>Company *</span><input name="co" placeholder="e.g. Sargodha Citrus Exports"></label><label><span>Contact person</span><input name="ct" placeholder="e.g. Waqas Ahmed"></label>
          <label><span>Phone</span><input name="ph" placeholder="0300 1234567"></label><label><span>City</span><select name="city">${opts(['Lahore', 'Karachi', 'Islamabad', 'Rawalpindi', 'Faisalabad', 'Multan', 'Peshawar', 'Quetta', 'Sialkot', 'Hyderabad', 'Sargodha'])}</select></label>
          <label><span>Source</span><select name="src">${opts(Object.keys(SRC))}</select></label><label><span>Owner</span><select name="own">${opts(OWN)}</select></label>
          <label><span>Plan interest</span><select name="plan">${opts(['Starter', 'Growth', 'Business', 'Enterprise'], 'Growth')}</select></label><label><span>Expected MRR (Rs)</span><input name="val" type="number" value="24999"></label>
          <label class="full"><span>Notes</span><textarea name="note" rows="2" placeholder="Pain points, current software (Tally, QuickBooks, Excel)…"></textarea></label></div>`,
        foot: `<button class="btn secondary" data-close>Cancel</button><button class="btn primary" data-ok><i data-lucide="plus"></i>Add lead</button>`,
      });
      $('[name=plan]', m).addEventListener('change', (e) => { $('[name=val]', m).value = PLAN[e.target.value].price; });
      $('[data-ok]', m).onclick = async (e) => {
        if (!need(m, ['co'])) return;
        const f = formData(m);
        await busy(e.currentTarget, 600, 'Adding…');
        const d = L('lead', f.co, f.city, f.src, f.own, f.plan, { note: f.note || (f.ct ? `Contact: ${f.ct}` : 'New lead'), val: +f.val || PLAN[f.plan].price });
        LEADS.unshift(d); m.close(); q = ''; owner = ''; $('[data-lq]', sec).value = ''; $$('[data-o]', sec).forEach((b) => b.classList.remove('on'));
        render(d.id); toast(`${f.co} added to leads · assigned to ${f.own}`);
      };
    }
  });

  /* ================= 9 · admin/comms ================= */
  onRoute('admin/comms', (sec) => {
    if (!$('#ap-urdu-font')) { const l = document.createElement('link'); l.id = 'ap-urdu-font'; l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;600&display=swap'; document.head.appendChild(l); }
    const VARS = ['owner_name', 'tenant_name', 'plan', 'amount', 'due_date', 'trial_days', 'invoice_no', 'login_url'];
    const SAMPLE = { en: { owner_name: 'Ahmed Raza', tenant_name: 'Al-Noor Enterprises', plan: 'Growth', amount: 'Rs 28,999', due_date: '05 Oct 2026', trial_days: '3', invoice_no: 'FS-INV-2026-01842', login_url: 'alnoor.finsoft.pk' }, ur: { owner_name: 'احمد رضا', tenant_name: 'النور انٹرپرائزز', plan: 'گروتھ', amount: '28,999 روپے', due_date: '05 اکتوبر 2026', trial_days: '3', invoice_no: 'FS-INV-2026-01842', login_url: 'alnoor.finsoft.pk' } };
    const TPL = [
      { k: 'welcome', name: 'Welcome', icon: 'party-popper', ch: ['email', 'sms', 'wa'], sent: '1,204', en: ['Welcome to Finsoft, {{owner_name}}!', 'Assalam-o-Alaikum {{owner_name}},\n\nYour Finsoft workspace for {{tenant_name}} is ready and the {{plan}} plan is active.\n\nSign in at {{login_url}} to import your chart of accounts and invite your team.\n\nShukriya,\nTeam Finsoft'], ur: ['فن سافٹ میں خوش آمدید، {{owner_name}}!', 'السلام علیکم {{owner_name}}،\n\n{{tenant_name}} کے لیے آپ کا فن سافٹ ورک اسپیس تیار ہے اور {{plan}} پلان فعال ہو گیا ہے۔\n\nاپنی ٹیم کو مدعو کرنے کے لیے {{login_url}} پر لاگ اِن کریں۔\n\nشکریہ،\nٹیم فن سافٹ'] },
      { k: 'trial', name: 'Trial ending', icon: 'hourglass', ch: ['email', 'sms', 'wa'], sent: '318', en: ['Your trial ends in {{trial_days}} days', 'Hi {{owner_name}},\n\nYour Finsoft trial for {{tenant_name}} ends in {{trial_days}} days. Keep your vouchers, payroll and FBR setup by choosing a plan today.\n\nUpgrade: {{login_url}}/billing\n\nTeam Finsoft'], ur: ['آپ کا ٹرائل {{trial_days}} دن میں ختم ہو رہا ہے', 'محترم {{owner_name}}،\n\n{{tenant_name}} کا فن سافٹ ٹرائل {{trial_days}} دن میں ختم ہو جائے گا۔ اپنا ڈیٹا محفوظ رکھنے کے لیے آج ہی پلان منتخب کریں۔\n\nاپ گریڈ: {{login_url}}/billing\n\nٹیم فن سافٹ'] },
      { k: 'invoice', name: 'Invoice', icon: 'receipt-text', ch: ['email', 'wa'], sent: '2,876', en: ['Invoice {{invoice_no}} · {{amount}}', 'Dear {{owner_name}},\n\nInvoice {{invoice_no}} for your {{plan}} subscription is ready. Amount due: {{amount}} by {{due_date}}.\n\nPay with JazzCash, Easypaisa, Raast or card at {{login_url}}/pay\n\nTeam Finsoft'], ur: ['انوائس {{invoice_no}} · {{amount}}', 'محترم {{owner_name}}،\n\nآپ کی {{plan}} سبسکرپشن کی انوائس {{invoice_no}} جاری کر دی گئی ہے۔ واجب الادا رقم: {{amount}}، آخری تاریخ {{due_date}}۔\n\nجاز کیش، ایزی پیسہ، راست یا کارڈ سے ادائیگی کریں: {{login_url}}/pay\n\nٹیم فن سافٹ'] },
      { k: 'failed', name: 'Payment failed', icon: 'credit-card', ch: ['email', 'sms', 'wa'], sent: '211', en: ['Payment failed for {{tenant_name}}', 'Hi {{owner_name}},\n\nWe could not collect {{amount}} for invoice {{invoice_no}}. We will retry automatically, or you can pay now in one tap.\n\nPay now: {{login_url}}/pay\n\nYour access continues until {{due_date}}.'], ur: ['{{tenant_name}} کی ادائیگی ناکام ہو گئی', 'محترم {{owner_name}}،\n\nانوائس {{invoice_no}} کی رقم {{amount}} وصول نہیں ہو سکی۔ ہم خودکار طور پر دوبارہ کوشش کریں گے، یا آپ ابھی ادائیگی کر سکتے ہیں۔\n\nادائیگی: {{login_url}}/pay\n\nآپ کی رسائی {{due_date}} تک جاری رہے گی۔'] },
      { k: 'reset', name: 'Password reset', icon: 'key-round', ch: ['email', 'sms'], sent: '944', en: ['Reset your Finsoft password', 'Hi {{owner_name}},\n\nSomeone asked to reset the password for your {{tenant_name}} account. The link below works for 30 minutes.\n\n{{login_url}}/reset\n\nIf this was not you, ignore this message.'], ur: ['اپنا فن سافٹ پاس ورڈ ری سیٹ کریں', 'محترم {{owner_name}}،\n\n{{tenant_name}} اکاؤنٹ کا پاس ورڈ ری سیٹ کرنے کی درخواست موصول ہوئی ہے۔ یہ لنک 30 منٹ تک کارآمد ہے۔\n\n{{login_url}}/reset\n\nاگر یہ آپ نے نہیں کیا تو اس پیغام کو نظر انداز کریں۔'] },
      { k: 'maint', name: 'Maintenance', icon: 'wrench', ch: ['email', 'sms', 'wa'], sent: '128', en: ['Planned maintenance on {{due_date}}', 'Dear {{owner_name}},\n\nFinsoft will be briefly unavailable on {{due_date}} from 02:00 to 03:00 PKT while we upgrade our database. Payroll and FBR submissions scheduled in that window will run right after.\n\nThank you for your patience.'], ur: ['{{due_date}} کو طے شدہ مرمت', 'محترم {{owner_name}}،\n\nڈیٹا بیس اپ گریڈ کی وجہ سے فن سافٹ {{due_date}} کو رات 02:00 سے 03:00 بجے تک دستیاب نہیں ہوگا۔ اس دوران طے شدہ پے رول اور ایف بی آر سبمیشنز بعد میں چلائی جائیں گی۔\n\nآپ کے صبر کا شکریہ۔'] },
    ];
    const CH = { email: ['Email', 'mail'], sms: ['SMS', 'message-square-text'], wa: ['WhatsApp', 'message-circle'] };
    const LOG = [
      ['10:42', 'invoice', 'Al-Noor Enterprises', 'accounts@alnoor.com.pk', 'email', 'Delivered'],
      ['10:40', 'failed', 'Ravi Motors', '0300 4412 918', 'sms', 'Delivered'],
      ['10:38', 'failed', 'Ravi Motors', 'tariq@ravimotors.pk', 'email', 'Bounced'],
      ['10:31', 'trial', 'Karakoram Tech', '0333 5120 774', 'wa', 'Read'],
      ['10:12', 'welcome', 'Gwadar Marine', 'akbar@gwadarmarine.pk', 'email', 'Opened'],
      ['09:58', 'reset', 'Crescent Textiles', '0321 7781 200', 'sms', 'Failed'],
      ['09:41', 'invoice', 'Indus Foods', 'ap@indusfoods.com.pk', 'email', 'Delivered'],
      ['09:15', 'maint', 'Margalla Pharma', '0345 9013 377', 'wa', 'Delivered'],
      ['08:50', 'trial', 'Sialkot Sports Co.', 'usman@sialkotsports.pk', 'email', 'Failed'],
    ].map(([t, k, ten, to, ch, st]) => ({ t, k, ten, to, ch, st }));
    const LST = { Delivered: 'good', Read: 'good', Opened: 'info', Sent: 'neutral', Bounced: 'warn', Failed: 'danger' };
    const S = { tpl: TPL[3], lang: 'en', view: 'email', focus: 'body', logF: 'all' };
    sec.insertAdjacentHTML('beforeend', `
      <div class="ap-comms">
        <div class="panel ap-tpl-list">${head('Templates', '6 lifecycle messages')}<div class="ap-tpls" data-tpls></div></div>
        <div class="panel ap-editor">
          <div class="ap-ed-head"><div><small>Editing</small><h3 data-ed-name></h3></div><span class="spacer"></span><div class="seg ap-lang" data-lang><button class="active" data-l="en">English</button><button data-l="ur" lang="ur">اردو</button></div></div>
          <label class="field"><span>Subject</span><input data-f="subject" autocomplete="off"></label>
          <label class="field ap-mt"><span>Message <em class="ap-count" data-cnt></em></span><textarea data-f="body" rows="11"></textarea></label>
          <div class="ap-vars"><small>Insert variable at cursor</small><div class="ap-varlist">${VARS.map((v) => `<button type="button" data-var="${v}">{{${v}}}</button>`).join('')}</div></div>
          <div class="ap-ed-foot"><span class="ap-saved" data-saved><i data-lucide="circle-check"></i>Saved · v12</span><span class="spacer"></span><button class="btn secondary" data-test><i data-lucide="send"></i>Send test</button><button class="btn primary" data-save><i data-lucide="save"></i>Save template</button></div>
        </div>
        <div class="panel ap-preview">
          <div class="ap-pv-head"><b>Live preview</b><div class="seg" data-view><button class="active" data-v="email"><i data-lucide="mail"></i>Email</button><button data-v="sms"><i data-lucide="message-square-text"></i>SMS</button><button data-v="wa"><i data-lucide="message-circle"></i>WhatsApp</button></div></div>
          <div class="ap-pv-stage" data-stage></div>
        </div>
      </div>
      <div class="panel flush">${head('Delivery log', 'Last 24 hours · all channels', `<div class="chips" data-logf>${['All', 'Delivered', 'Failed'].map((x, i) => `<button class="${i ? '' : 'active'}" data-f="${x.toLowerCase()}">${x}</button>`).join('')}</div>`)}
        <div class="table-wrap"><table class="tbl ap-logtbl" data-plain><thead><tr><th>Time</th><th>Template</th><th>Tenant</th><th>Recipient</th><th>Channel</th><th>Status</th><th></th></tr></thead><tbody></tbody></table></div></div>`);
    const subj = $('[data-f=subject]', sec), body = $('[data-f=body]', sec);
    const fill = (s, lang) => esc(s).replace(/\{\{(\w+)\}\}/g, (m, k) => (SAMPLE[lang][k] ? `<mark class="ap-var">${esc(SAMPLE[lang][k])}</mark>` : m));
    const plain = (s, lang) => s.replace(/\{\{(\w+)\}\}/g, (m, k) => SAMPLE[lang][k] || m);
    function renderList() {
      $('[data-tpls]', sec).innerHTML = TPL.map((t) => `<button class="ap-tpl ${t === S.tpl ? 'on' : ''}" data-k="${t.k}"><span class="icon-well"><i data-lucide="${t.icon}"></i></span><div><b>${t.name}</b><small>${t.sent} sent · 30 d</small><span class="ap-chs">${['email', 'sms', 'wa'].map((c) => `<i class="${t.ch.includes(c) ? 'on' : ''}" data-tip="${CH[c][0]}${t.ch.includes(c) ? '' : ' · off'}"><i data-lucide="${CH[c][1]}"></i></i>`).join('')}</span></div></button>`).join('');
      icons($('[data-tpls]', sec));
    }
    function load() {
      const [s, b] = S.tpl[S.lang];
      subj.value = s; body.value = b;
      const rtl = S.lang === 'ur';
      [subj, body].forEach((f) => { f.dir = rtl ? 'rtl' : 'ltr'; f.classList.toggle('ap-ur', rtl); });
      $('[data-ed-name]', sec).textContent = `${S.tpl.name} · ${rtl ? 'Urdu' : 'English'}`;
      preview(true);
    }
    function save() { S.tpl[S.lang] = [subj.value, body.value]; }
    function preview(anim) {
      save();
      const lang = S.lang, rtl = lang === 'ur', [s, b] = S.tpl[lang];
      const len = plain(b, lang).length;
      $('[data-cnt]', sec).textContent = `${fmt(len)} chars · ${Math.ceil(len / (rtl ? 70 : 160))} SMS segment${Math.ceil(len / (rtl ? 70 : 160)) > 1 ? 's' : ''}`;
      const dir = `dir="${rtl ? 'rtl' : 'ltr'}" class="${rtl ? 'ap-ur' : ''}"`;
      const html = fill(b, lang).replace(/\n/g, '<br>');
      const cta = { failed: rtl ? 'ابھی ادائیگی کریں' : 'Pay now', invoice: rtl ? 'انوائس دیکھیں' : 'View invoice', trial: rtl ? 'پلان منتخب کریں' : 'Choose a plan', welcome: rtl ? 'لاگ اِن کریں' : 'Open Finsoft', reset: rtl ? 'پاس ورڈ ری سیٹ کریں' : 'Reset password', maint: rtl ? 'اسٹیٹس دیکھیں' : 'View status' }[S.tpl.k];
      let out = '';
      if (S.view === 'email') out = `<div class="ap-mail"><div class="ap-mail-bar"><i></i><i></i><i></i><span>Inbox · accounts@alnoor.com.pk</span></div>
          <div class="ap-mail-meta"><div><small>From</small><b>Finsoft Cloud &lt;hello@finsoft.pk&gt;</b></div><div><small>Subject</small><b ${dir}>${fill(s, lang)}</b></div></div>
          <div class="ap-mail-body" ${dir}><div class="ap-mail-brand"><span class="sb-mark ap-mk"><i data-lucide="activity"></i></span><b>Finsoft</b></div><p>${html}</p><a class="ap-mail-cta">${cta}</a><small class="ap-mail-foot">Finsoft Cloud (Pvt) Ltd · Lahore · <u>Unsubscribe</u></small></div></div>`;
      else if (S.view === 'sms') out = `<div class="ap-phone"><div class="ap-phone-notch"></div><div class="ap-phone-top"><i data-lucide="chevron-left"></i><span class="avatar xs">FS</span><div><b>FINSOFT</b><small>Text message</small></div></div><div class="ap-phone-screen"><small class="ap-day">Today 10:42</small><div class="ap-bubble sms" ${dir}>${fill(b, lang).replace(/\n+/g, ' ')}</div></div></div>`;
      else out = `<div class="ap-phone wa"><div class="ap-phone-notch"></div><div class="ap-phone-top wa"><i data-lucide="chevron-left"></i><span class="avatar xs">FS</span><div><b>Finsoft Cloud <i data-lucide="badge-check" class="ap-verified"></i></b><small>Business account</small></div></div><div class="ap-phone-screen wa"><small class="ap-day">Today</small><div class="ap-bubble wa" ${dir}><b>${fill(s, lang)}</b><br>${html}<span class="ap-time">10:42 <i data-lucide="check-check"></i></span></div><div class="ap-wa-btns"><span>${cta}</span><span>${rtl ? 'مدد' : 'Talk to support'}</span></div></div></div>`;
      const st = $('[data-stage]', sec);
      st.innerHTML = out; icons(st);
      if (anim) { st.classList.remove('ap-swap'); void st.offsetWidth; st.classList.add('ap-swap'); }
      $('[data-saved]', sec).classList.add('dirty');
    }
    const logRow = (r, i) => `<tr data-i="${i}"><td class="tnum">${r.t}</td><td>${TPL.find((t) => t.k === r.k).name}</td><td><b>${esc(r.ten)}</b></td><td class="ap-mono">${esc(r.to)}</td><td><span class="ap-chpill ${r.ch}"><i data-lucide="${CH[r.ch][1]}"></i>${CH[r.ch][0]}</span></td><td><span class="badge ${LST[r.st]} dot">${r.st}</span></td><td class="actions">${r.st === 'Failed' || r.st === 'Bounced' ? '<button class="btn secondary sm" data-retry><i data-lucide="refresh-cw"></i>Retry</button>' : ''}</td></tr>`;
    function renderLog() {
      const tb = $('.ap-logtbl tbody', sec);
      const list = LOG.map((r, i) => [r, i]).filter(([r]) => S.logF === 'all' || (S.logF === 'delivered' ? /Delivered|Read|Opened/.test(r.st) : /Failed|Bounced/.test(r.st)));
      tb.innerHTML = list.map(([r, i]) => logRow(r, i)).join('');
      icons(tb);
    }
    renderList(); load(); renderLog();
    [subj, body].forEach((f) => { f.addEventListener('input', () => preview(false)); f.addEventListener('focus', () => { S.focus = f.dataset.f; }); });
    function insertVar(v) {
      const f = S.focus === 'subject' ? subj : body, tok = `{{${v}}}`;
      const s = f.selectionStart ?? f.value.length, e = f.selectionEnd ?? f.value.length;
      f.setRangeText(tok, s, e, 'end');
      f.focus();
      preview(false);
      flash(f);
    }
    function sendTest(btn) {
      const m = modal({
        title: 'Send a test', sub: `${S.tpl.name} · ${S.lang === 'ur' ? 'Urdu' : 'English'} · ${CH[S.view][0]}`, size: 'ap-sm',
        html: `<label class="field"><span>${S.view === 'email' ? 'Email address' : 'Mobile number'}</span><input name="to" value="${S.view === 'email' ? 'saim@finsoft.pk' : '0300 1234567'}"></label><p class="ap-note-s">Variables are filled with sample data for Al-Noor Enterprises.</p>`,
        foot: `<button class="btn secondary" data-close>Cancel</button><button class="btn primary" data-ok><i data-lucide="send"></i>Send test</button>`,
      });
      $('[data-ok]', m).onclick = async (e) => {
        if (!need(m, ['to'])) return;
        const to = $('[name=to]', m).value;
        await busy(e.currentTarget, 900, 'Sending…'); m.close();
        LOG.unshift({ t: '10:44', k: S.tpl.k, ten: 'Test · Finsoft', to, ch: S.view, st: 'Sent' });
        S.logF = 'all'; $$('[data-logf] button', sec).forEach((b, i) => b.classList.toggle('active', !i)); renderLog();
        const tr = $('.ap-logtbl tbody tr', sec); flash(tr);
        toast(`Test ${CH[S.view][0].toLowerCase()} sent to ${esc(to)}`, { tone: 'info' });
        setTimeout(() => { LOG[0].st = 'Delivered'; const b = $('.ap-logtbl tbody tr[data-i="0"] .badge', sec); if (b) { b.className = 'badge good dot ap-pop'; b.textContent = 'Delivered'; } }, 1600);
      };
    }
    function broadcast() {
      const SEG = [['all', 'All active tenants', 128, 'building-2'], ['trial', 'Trials', 14, 'hourglass'], ['due', 'Past due', 11, 'credit-card'], ['starter', 'Starter plan', 35, 'sprout'], ['sindh', 'Sindh region', 24, 'map-pin'], ['ent', 'Enterprise owners', 5, 'gem']];
      const m = modal({
        title: 'Broadcast to a segment', sub: 'Owners and billing contacts of each tenant', size: 'wide',
        html: `<div class="ap-lbl">Segment</div><div class="radio-cards ap-segs">${SEG.map(([k, l, n, ic], i) => `<label class="radio-card"><input type="radio" name="seg" value="${k}" data-n="${n}" ${i ? '' : 'checked'}><span class="icon-well"><i data-lucide="${ic}"></i></span><div><b>${l}</b><small>${n} tenants</small></div></label>`).join('')}</div>
          <div class="form-grid ap-mt"><label><span>Template</span><select name="tpl">${opts(TPL.map((t) => [t.k, t.name]), 'maint')}</select></label><label><span>Language</span><select name="lang">${opts(['Tenant preference (EN/UR)', 'English', 'Urdu'])}</select></label>
          <label><span>Send</span><select name="when">${opts(['Now', 'Tonight 20:00 PKT', 'Tomorrow 10:00 PKT'])}</select></label><div class="field"><span>Channels</span><div class="row ap-wrap ap-chk"><label class="check"><input type="checkbox" name="em" checked> Email</label><label class="check"><input type="checkbox" name="sm" checked> SMS</label><label class="check"><input type="checkbox" name="wa"> WhatsApp</label></div></div></div>
          <div class="ap-bc-est" data-est></div><div class="ap-export-prog" data-prog hidden><div class="ap-bar lg"><i style="--w:0%"></i></div><small data-step></small></div>`,
        foot: `<button class="btn secondary" data-close>Cancel</button><button class="btn primary" data-ok><i data-lucide="radio-tower"></i>Send broadcast</button>`,
      });
      const est = () => { const n = +$('input[name=seg]:checked', m).dataset.n, f = formData(m), ch = [f.em, f.sm, f.wa].filter(Boolean).length; const msgs = n * 2 * ch; $('[data-est]', m).innerHTML = `<i data-lucide="users"></i><span>About <b>${fmt(msgs)}</b> messages to <b>${fmt(n * 2)}</b> people across <b>${ch}</b> channel${ch === 1 ? '' : 's'} · SMS cost ≈ <b>${rs(f.sm ? n * 2 * 0.62 * 2 : 0)}</b></span>`; icons($('[data-est]', m)); };
      est(); m.addEventListener('change', est);
      $('[data-ok]', m).onclick = async (e) => {
        const f = formData(m);
        if (!f.em && !f.sm && !f.wa) { shake($('.ap-chk', m)); toast('Pick at least one channel', { tone: 'warn' }); return; }
        const b = e.currentTarget, n = +$('input[name=seg]:checked', m).dataset.n * 2;
        b.disabled = true;
        const p = $('[data-prog]', m); p.hidden = false;
        for (let i = 1; i <= 10; i++) { $('i', p).style.setProperty('--w', i * 10 + '%'); $('[data-step]', p).textContent = `Queued ${fmt(Math.round((n * i) / 10))} of ${fmt(n)}…`; await wait(reduce() ? 5 : 110); }
        $('[data-step]', p).innerHTML = `<b class="ap-good-t">Broadcast queued</b> · delivery updates stream into the log`;
        celebrate(b); b.innerHTML = '<i data-lucide="check"></i>Done'; icons(b); b.disabled = false; b.onclick = () => m.close();
        LOG.unshift({ t: '10:45', k: f.tpl, ten: `Segment · ${n / 2} tenants`, to: `${fmt(n)} recipients`, ch: f.wa ? 'wa' : f.sm ? 'sms' : 'email', st: 'Sent' });
        renderLog(); flash($('.ap-logtbl tbody tr', sec));
        toast(`Broadcast sent to ${fmt(n)} people`);
      };
    }
    sec.addEventListener('click', async (e) => {
      const t = e.target.closest('.ap-tpl');
      if (t) { save(); S.tpl = TPL.find((x) => x.k === t.dataset.k); if (!S.tpl.ch.includes(S.view)) { S.view = S.tpl.ch[0]; $$('[data-view] button', sec).forEach((b) => b.classList.toggle('active', b.dataset.v === S.view)); } renderList(); load(); return; }
      const l = e.target.closest('[data-lang] button');
      if (l && l.dataset.l !== S.lang) { save(); S.lang = l.dataset.l; load(); toast(S.lang === 'ur' ? 'اردو ورژن · right-to-left preview' : 'English version', { tone: 'info', ms: 1600 }); return; }
      const v = e.target.closest('[data-view] button');
      if (v) { S.view = v.dataset.v; if (!S.tpl.ch.includes(S.view)) toast(`${S.tpl.name} is not sent by ${CH[S.view][0]} yet · previewing anyway`, { tone: 'warn', ms: 2200 }); preview(true); return; }
      const vr = e.target.closest('[data-var]');
      if (vr) { e.preventDefault(); insertVar(vr.dataset.var); return; }
      const sv = e.target.closest('[data-save]');
      if (sv) { save(); await busy(sv, 700, 'Saving…'); const s = $('[data-saved]', sec); s.classList.remove('dirty'); s.innerHTML = '<i data-lucide="circle-check"></i>Saved · v13 · just now'; icons(s); flash(s); toast(`${S.tpl.name} saved (${S.lang === 'ur' ? 'Urdu' : 'English'})`); return; }
      if (e.target.closest('[data-test]')) { sendTest(); return; }
      if (e.target.closest('[data-ap-act=broadcast]')) { broadcast(); return; }
      const lf = e.target.closest('[data-logf] button');
      if (lf) { S.logF = lf.dataset.f; renderLog(); return; }
      const rt = e.target.closest('[data-retry]');
      if (rt) {
        const tr = rt.closest('tr'), r = LOG[+tr.dataset.i];
        await busy(rt, 1100, 'Retrying…');
        r.st = r.ch === 'email' && r.st === 'Bounced' ? 'Delivered' : 'Delivered';
        const b = $('.badge', tr); b.className = 'badge good dot ap-pop'; b.textContent = 'Delivered';
        rt.remove(); flash(tr);
        toast(`Re-sent to ${esc(r.to)} via ${r.ch === 'email' ? 'backup SMTP (SES Mumbai)' : 'Jazz SMS gateway'}`);
      }
    });
    /* keep variable chips from stealing focus so the caret stays put */
    sec.addEventListener('mousedown', (e) => { if (e.target.closest('[data-var]')) e.preventDefault(); });
  });

  /* ================= 10 · admin/security ================= */
  onRoute('admin/security', (sec) => {
    const IPS = [['203.99.180.0/24', 'Lahore office'], ['119.160.96.0/22', 'Karachi office'], ['10.8.0.0/16', 'WireGuard VPN'], ['39.40.12.18/32', 'Islamabad DR site']];
    const SESS = [
      ['Saim Javed', 'Edge 129 · Windows 11', '203.99.180.44', 'Lahore, PK', 'Today 08:02', 'Now', true],
      ['Saim Javed', 'Finsoft iOS 3.4 · iPhone 15', '10.8.2.17', 'VPN · Lahore', 'Yesterday 21:40', '2 h ago', false],
      ['Mariam Iqbal', 'Chrome 129 · macOS', '203.99.180.61', 'Lahore, PK', 'Today 09:12', '12 min ago', false],
      ['Danish Ahmed', 'Firefox 131 · Ubuntu', '119.160.97.8', 'Karachi, PK', 'Today 09:55', '1 h ago', false],
      ['Talha Mehmood', 'Chrome 129 · Windows 11', '10.8.4.90', 'VPN · Islamabad', 'Today 07:30', '3 h ago', false],
      ['Areeba Khalid', 'Safari 18 · iPadOS', '119.160.98.140', 'Karachi, PK', 'Yesterday 18:05', 'Yesterday', false],
    ];
    const STEPS = ['Received', 'Verified', 'Approved', 'Processing', 'Done'];
    const PRV = [
      { id: 'PRV-2026-029', t: 'Quetta Dry Fruits', code: 'QTADRY', type: 'Delete', by: 'Owner · Haji Rahim', rec: '03 Sep 2026', due: 2, step: 1, appr: 1 },
      { id: 'PRV-2026-031', t: 'Sukkur Rice Co.', code: 'SUKRICE', type: 'Delete', by: 'Owner · Ghulam Abbas', rec: '22 Sep 2026', due: 21, step: 1, appr: 0 },
      { id: 'PRV-2026-033', t: 'Al-Noor Enterprises', code: 'ALNOOR', type: 'Export', by: 'Hira Ali (Accountant)', rec: '28 Sep 2026', due: 27, step: 0, appr: 0 },
      { id: 'PRV-2026-034', t: 'Bhatti Traders', code: 'BHATTI', type: 'Export', by: 'Ex-employee · Waqas Butt', rec: '29 Sep 2026', due: 28, step: 1, appr: 0 },
      { id: 'PRV-2026-026', t: 'Gwadar Marine', code: 'GWADAR', type: 'Export', by: 'Owner · Baloch Akbar', rec: '15 Aug 2026', due: 0, step: 4, appr: 1 },
    ];
    sec.insertAdjacentHTML('beforeend', `
      <div class="panel ap-secscore">
        ${ring(86, 84, 8)}
        <div class="ap-secscore-t"><small>Console security score</small><b>Strong · 86 / 100</b><p>One staff member has no 2FA and one deletion request is due in 2 days.</p></div>
        <div class="ap-seclist">${[['good', 'SSO enforced via SAML', 'shield-check'], ['warn', '2FA coverage 5 of 6', 'smartphone'], ['good', 'IP allow-list on', 'network'], ['good', 'Breached-password check', 'key-round'], ['danger', '1 privacy request due soon', 'timer']].map(([t, l, ic]) => `<span class="ap-secitem ${t}"><i data-lucide="${ic}"></i>${l}</span>`).join('')}</div>
      </div>
      <div class="grid-2">
        <div class="panel ap-sso">${head('Single sign-on', 'Staff sign in through your identity provider', '<span class="badge good dot">Connected</span>')}
          <div class="seg ap-mb" data-sso><button class="active" data-p="saml"><i data-lucide="shield"></i>SAML 2.0 (Okta)</button><button data-p="google"><i data-lucide="globe"></i>Google Workspace</button></div>
          <div data-ssop="saml"><div class="form-grid"><label class="full"><span>IdP SSO URL</span><input value="https://finsoft.okta.com/app/finsoft_console/sso/saml"></label><label><span>IdP entity ID</span><input value="http://www.okta.com/exk8f2a91"></label><label><span>Name ID format</span><select>${opts(['Email address', 'Persistent'])}</select></label></div>
            <div class="ap-cert"><span class="icon-tile"><i data-lucide="file-key"></i></span><div><b>okta-finsoft-console.pem</b><small>X.509 · SHA-256 · expires 14 Jun 2028</small></div><button class="btn ghost sm" data-toast="Choose a new certificate file"><i data-lucide="upload"></i>Replace</button></div>
            <div class="ap-copyrow"><small>ACS URL</small><code class="code">https://console.finsoft.pk/sso/acs</code><button class="icon-btn-sm" data-menu="off" data-cp="https://console.finsoft.pk/sso/acs" aria-label="Copy"><i data-lucide="copy"></i></button></div></div>
          <div data-ssop="google" hidden><div class="form-grid"><label><span>Workspace domain</span><input value="finsoft.pk"></label><label><span>OAuth client ID</span><input value="88213-console.apps.googleusercontent.com"></label><label class="full"><span>Allowed groups</span><input value="platform-team@finsoft.pk"></label></div></div>
          <div class="ap-switches"><label class="switch"><input type="checkbox" checked><i></i><span>Require SSO for all staff</span></label><label class="switch"><input type="checkbox" checked><i></i><span>Break-glass password login for Super Admin only</span></label></div>
          <div class="ap-ssotest" data-ssotest hidden></div>
          <div class="form-actions ap-mt"><button class="btn secondary" data-ssotest-btn><i data-lucide="plug-zap"></i>Test connection</button></div>
        </div>
        <div class="panel">${head('Two-factor enforcement', 'Applies at next sign-in')}
          <div class="radio-cards ap-col">${[['Optional', 'Staff choose for themselves', 'unlock'], ['Required for admins', 'Super Admin and Billing only', 'user-cog'], ['Required for everyone', 'All platform staff, no exceptions', 'shield-check']].map(([b, s, ic], i) => `<label class="radio-card"><input type="radio" name="tfa" ${i === 2 ? 'checked' : ''}><span class="icon-well"><i data-lucide="${ic}"></i></span><div><b>${b}</b><small>${s}</small></div></label>`).join('')}</div>
          <div class="ap-lbl ap-mt">Allowed methods</div>
          <div class="ap-methods"><label class="check"><input type="checkbox" checked> Hardware key (WebAuthn)</label><label class="check"><input type="checkbox" checked> Authenticator app</label><label class="check"><input type="checkbox"> SMS OTP <span class="badge warn">SIM-swap risk</span></label></div>
          <div class="ap-cov"><div class="row"><b>Enrolment</b><span class="spacer"></span><small>5 of 6 staff</small></div><div class="ap-bar"><i style="--w:83%"></i></div><div class="row ap-mt"><span class="avatar xs c4">NS</span><small>Noor Sheikh has not enrolled yet</small><span class="spacer"></span><button class="btn secondary sm" data-nudge><i data-lucide="bell-ring"></i>Nudge</button></div></div>
        </div>
      </div>
      <div class="grid-2">
        <div class="panel">${head('IP allow-list', 'Console access only from these networks', '<label class="switch"><input type="checkbox" checked data-ipon><i></i><span>Enforce</span></label>')}
          <div class="ap-ipadd"><input data-ip placeholder="CIDR, e.g. 182.180.0.0/16" autocomplete="off" spellcheck="false"><input data-iplabel placeholder="Label (optional)"><button class="btn primary" data-ipadd><i data-lucide="plus"></i>Add</button></div>
          <small class="ap-iperr" data-iperr></small>
          <div class="ap-ips" data-ips></div>
          <div class="banner good ap-mt ap-bn-sm"><i data-lucide="circle-check"></i><div><b>Your IP 203.99.180.44 is allowed</b><p>Matched “Lahore office”. You will not be locked out.</p></div></div>
        </div>
        <div class="panel">${head('Password policy', 'Used for break-glass and tenant-side owner accounts')}
          <div class="ap-range-row"><span>Minimum length</span><input type="range" min="8" max="24" value="12" data-pw="len"><b data-pwlen>12</b></div>
          <div class="ap-pwgrid">${[['upper', 'Upper & lower case', true], ['num', 'At least one number', true], ['sym', 'At least one symbol', true], ['breach', 'Block breached passwords (HIBP)', true], ['reuse', 'Block last 5 passwords', false]].map(([k, l, on]) => `<label class="switch"><input type="checkbox" data-pw="${k}" ${on ? 'checked' : ''}><i></i><span>${l}</span></label>`).join('')}</div>
          <div class="form-grid ap-mt"><label><span>Rotate every</span><select data-pw="rot">${opts(['Never (NIST)', '90 days', '180 days'])}</select></label><label><span>Lock after failed attempts</span><select data-pw="lock">${opts(['5 attempts · 15 min', '10 attempts · 30 min', '3 attempts · 1 h'])}</select></label></div>
          <div class="ap-pwstr"><div class="row"><small>Policy strength</small><span class="spacer"></span><b data-pwlabel></b></div><div class="ap-segbar" data-pwbar>${'<i></i>'.repeat(5)}</div></div>
        </div>
      </div>
      <div class="panel flush">${head('Admin sessions', 'Signed-in console sessions across all staff', '<button class="btn danger sm" data-revall><i data-lucide="log-out"></i>Revoke all others</button>')}
        <div class="table-wrap"><table class="tbl ap-sesstbl" data-plain><thead><tr><th>Staff</th><th>Device</th><th>IP address</th><th>Location</th><th>Started</th><th>Last seen</th><th></th></tr></thead><tbody>
        ${SESS.map(([n, d, ip, loc, st, last, cur], i) => `<tr data-s="${i}"><td><div class="cell-user">${avatar(n)}<div><b>${n}</b>${cur ? '<small class="ap-good-t">This device</small>' : ''}</div></div></td><td><span class="ap-dev"><i data-lucide="${/iPhone|iPad/.test(d) ? 'smartphone' : 'monitor'}"></i>${d}</span></td><td class="ap-mono">${ip}</td><td>${loc}</td><td>${st}</td><td>${last}</td><td class="actions">${cur ? '<span class="badge good">Current</span>' : '<button class="btn ghost sm" data-revoke><i data-lucide="x-circle"></i>Revoke</button>'}</td></tr>`).join('')}</tbody></table></div></div>
      <div class="panel flush">${head('Privacy requests', 'Tenant data export and deletion. Statutory deadline: 30 days. Deletion needs two approvers.', '<span class="pill"><i data-lucide="scale"></i>PECA 2016 · PDPB 2023 draft</span>')}
        <div class="table-wrap"><table class="tbl ap-prvtbl" data-plain><thead><tr><th>Request</th><th>Type</th><th>Requested by</th><th>Due</th><th>Workflow</th><th></th></tr></thead><tbody></tbody></table></div></div>`);

    /* SSO */
    const ssoTest = async (btn) => {
      const box = $('[data-ssotest]', sec); box.hidden = false;
      const steps = ['Fetching IdP metadata', 'Validating X.509 signature', 'Sending test AuthnRequest', 'Verifying assertion for saim@finsoft.pk'];
      box.innerHTML = steps.map((s) => `<div class="ap-tstep"><span class="ap-spin"></span>${s}</div>`).join('');
      btn.disabled = true;
      for (const el of $$('.ap-tstep', box)) { await wait(reduce() ? 10 : 450); el.classList.add('ok'); el.querySelector('.ap-spin').outerHTML = '<i data-lucide="circle-check"></i>'; icons(el); }
      btn.disabled = false; celebrate(btn); toast('SSO round-trip succeeded in 412 ms');
    };
    /* IP chips */
    const renderIps = () => { $('[data-ips]', sec).innerHTML = IPS.map(([c, l], i) => `<span class="ap-ip" data-i="${i}"><i data-lucide="network"></i><code>${c}</code><small>${esc(l)}</small><button type="button" data-iprm aria-label="Remove ${c}"><i data-lucide="x"></i></button></span>`).join(''); icons($('[data-ips]', sec)); };
    renderIps();
    const CIDR = /^((25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(25[0-5]|2[0-4]\d|1?\d?\d)\/(3[0-2]|[12]?\d)$/;
    function addIp() {
      const i = $('[data-ip]', sec), lab = $('[data-iplabel]', sec), v = i.value.trim(), err = $('[data-iperr]', sec);
      if (!CIDR.test(v)) { i.classList.add('ap-invalid'); shake(i); err.textContent = v ? `“${v}” is not a valid IPv4 CIDR (e.g. 182.180.0.0/16)` : 'Enter a CIDR range'; return; }
      if (IPS.some(([c]) => c === v)) { shake(i); err.textContent = `${v} is already on the list`; return; }
      i.classList.remove('ap-invalid'); err.textContent = '';
      IPS.push([v, lab.value.trim() || 'Custom range']); i.value = ''; lab.value = '';
      renderIps(); const n = $('.ap-ip:last-child', sec); n.classList.add('ap-ipnew');
      toast(`${v} added to the allow-list`);
    }
    /* password strength */
    function pw() {
      const len = +$('[data-pw=len]', sec).value; $('[data-pwlen]', sec).textContent = len;
      const on = (k) => $(`[data-pw=${k}]`, sec).checked;
      let s = (len >= 14 ? 2 : len >= 12 ? 1.5 : len >= 10 ? 1 : 0.4) + (on('upper') ? 0.6 : 0) + (on('num') ? 0.4 : 0) + (on('sym') ? 0.5 : 0) + (on('breach') ? 1.2 : 0) + (on('reuse') ? 0.3 : 0);
      const lvl = clamp(Math.round(s), 1, 5);
      $$('[data-pwbar] i', sec).forEach((b, i) => { b.className = i < lvl ? ['', 'l1', 'l2', 'l3', 'l4', 'l5'][lvl] : ''; });
      $('[data-pwlabel]', sec).textContent = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Excellent'][lvl];
    }
    pw();
    /* privacy */
    const ptb = $('.ap-prvtbl tbody', sec);
    function renderPrv() {
      ptb.innerHTML = PRV.map((r, i) => {
        const done = r.step === 4, tone = done ? 'good' : r.due <= 3 ? 'danger' : r.due <= 10 ? 'warn' : 'good';
        const action = done ? '<button class="btn ghost sm" data-dl><i data-lucide="download"></i>Certificate</button>' : r.step === 3 ? '<span class="ap-muted-t"><span class="ap-spin ap-inl"></span>Running…</span>' : `<div class="row ap-nowrap"><button class="btn primary sm" data-appr><i data-lucide="check"></i>${r.step === 0 ? 'Verify' : 'Approve'}</button><button class="btn ghost sm" data-rej>Reject</button></div>`;
        return `<tr data-i="${i}"><td><div class="cell-user">${logo(r.t)}<div><b>${r.id}</b><small>${esc(r.t)}</small></div></div></td>
          <td><span class="badge ${r.type === 'Delete' ? 'danger' : 'info'}"><i data-lucide="${r.type === 'Delete' ? 'trash-2' : 'download'}"></i>${r.type}</span></td>
          <td>${esc(r.by)}<small>Received ${r.rec}</small></td>
          <td>${done ? '<span class="ap-good-t"><b>Completed</b></span><small>within SLA</small>' : `<div class="ap-due ${tone}"><b>${r.due} day${r.due === 1 ? '' : 's'} left</b><div class="ap-bar thin ${tone}"><i style="--w:${(r.due / 30) * 100}%"></i></div></div>`}</td>
          <td><div class="ap-wfsteps">${STEPS.map((s, k) => `<span class="${k < r.step || done ? 'done' : k === r.step ? 'cur' : ''}" data-tip="${s}${s === 'Approved' && r.type === 'Delete' ? ` · ${r.appr}/2 approvers` : ''}"><i></i></span>`).join('')}<small>${STEPS[r.step]}${r.type === 'Delete' && r.step === 1 ? ` · ${r.appr}/2 approvals` : ''}</small></div></td>
          <td class="actions">${action}</td></tr>`;
      }).join('');
      icons(ptb);
    }
    renderPrv();
    async function advance(r, tr) {
      if (r.step === 0) { r.step = 1; renderPrv(); flash($(`tr[data-i="${PRV.indexOf(r)}"]`, ptb)); toast(`${r.id} identity verified`); return; }
      if (r.type === 'Delete') {
        const ok = await confirmBox({ title: `Approve deletion for ${r.t}?`, text: 'All ledgers, documents, payroll and backups for this tenant will be permanently erased after the second approval. A deletion certificate is issued to the owner.', okLabel: 'Approve deletion', danger: true, typeToConfirm: r.code });
        if (!ok) return;
        r.appr++;
        if (r.appr < 2) { renderPrv(); flash($(`tr[data-i="${PRV.indexOf(r)}"]`, ptb)); toast(`Approval 1 of 2 recorded · Mariam Iqbal has been asked to co-approve`, { tone: 'info' }); return; }
      }
      r.step = 3; renderPrv();
      const row = $(`tr[data-i="${PRV.indexOf(r)}"]`, ptb); row.classList.add('ap-row-busy');
      await wait(reduce() ? 50 : 1800);
      r.step = 4; renderPrv(); const nr = $(`tr[data-i="${PRV.indexOf(r)}"]`, ptb); flash(nr); celebrate(nr);
      toast(r.type === 'Delete' ? `${r.t} data erased · certificate sent to owner` : `Export for ${r.t} ready · link valid 7 days`, { tone: 'good' });
    }
    sec.addEventListener('click', async (e) => {
      const sp = e.target.closest('[data-sso] button'); if (sp) { $$('[data-ssop]', sec).forEach((p) => { p.hidden = p.dataset.ssop !== sp.dataset.p; }); return; }
      const tb = e.target.closest('[data-ssotest-btn]'); if (tb) { ssoTest(tb); return; }
      const cp = e.target.closest('[data-cp]'); if (cp) { copy(cp.dataset.cp, 'ACS URL copied'); return; }
      const nd = e.target.closest('[data-nudge]'); if (nd) { await busy(nd, 600, 'Sending…'); nd.innerHTML = '<i data-lucide="check"></i>Nudged'; nd.disabled = true; icons(nd); toast('Reminder sent to Noor Sheikh · 2FA required within 48 h'); return; }
      if (e.target.closest('[data-ipadd]')) { addIp(); return; }
      const rm = e.target.closest('[data-iprm]');
      if (rm) {
        const chip = rm.closest('.ap-ip'), i = +chip.dataset.i, item = IPS[i];
        if (IPS.length === 1) { shake(chip); toast('Keep at least one range while the allow-list is enforced', { tone: 'warn' }); return; }
        chip.classList.add('ap-ipout');
        setTimeout(() => { IPS.splice(i, 1); renderIps(); }, 250);
        toast(`${item[0]} removed`, { tone: 'warn', undo: () => { IPS.splice(i, 0, item); renderIps(); } });
        return;
      }
      const rv = e.target.closest('[data-revoke]');
      if (rv) { const tr = rv.closest('tr'); const n = tr.querySelector('b').textContent; rowOut(tr); toast(`Session for ${n} revoked · signed out on that device`, { tone: 'danger' }); return; }
      const ra = e.target.closest('[data-revall]');
      if (ra) {
        const rows = $$('.ap-sesstbl tbody tr', sec).filter((tr) => tr.querySelector('[data-revoke]'));
        if (!rows.length) { toast('No other sessions', { tone: 'info' }); return; }
        if (!(await confirmBox({ title: `Revoke ${rows.length} sessions?`, text: 'Everyone except you is signed out of the console immediately.', okLabel: 'Revoke all', danger: true }))) return;
        rows.forEach((tr, k) => setTimeout(() => rowOut(tr), k * 90));
        toast(`${rows.length} sessions revoked`, { tone: 'danger' }); return;
      }
      const ap = e.target.closest('[data-appr]'); if (ap) { advance(PRV[+ap.closest('tr').dataset.i]); return; }
      const rj = e.target.closest('[data-rej]');
      if (rj) { const tr = rj.closest('tr'), r = PRV[+tr.dataset.i]; if (!(await confirmBox({ title: `Reject ${r.id}?`, text: 'The requester is told why and can submit again with more proof of identity.', okLabel: 'Reject', danger: true }))) return; const i = PRV.indexOf(r); rowOut(tr, () => { PRV.splice(i, 1); renderPrv(); }); toast(`${r.id} rejected`, { tone: 'warn' }); return; }
      if (e.target.closest('[data-dl]')) { toast('Completion certificate downloaded (PDF, signed)'); return; }
      const sv = e.target.closest('[data-ap-act=sec-save]'); if (sv) { await busy(sv, 900, 'Saving…'); celebrate(sv); toast('Security policies saved · logged as AUD-PLT-8820'); }
    });
    sec.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.closest('[data-ip], [data-iplabel]')) { e.preventDefault(); addIp(); } });
    sec.addEventListener('input', (e) => { if (e.target.closest('[data-pw]')) pw(); if (e.target.closest('[data-ip]')) { e.target.classList.remove('ap-invalid'); $('[data-iperr]', sec).textContent = ''; } });
    sec.addEventListener('change', (e) => { if (e.target.closest('[data-pw]')) pw(); if (e.target.matches('[data-ipon]')) toast(e.target.checked ? 'Allow-list enforced' : 'Allow-list disabled · console reachable from any IP', { tone: e.target.checked ? 'good' : 'warn' }); });
  });

  /* ================= 11 · admin/status ================= */
  onRoute('admin/status', (sec) => {
    const COMP = [['Web app', 'monitor'], ['Public API', 'code-xml'], ['FBR / PRAL gateway', 'plug'], ['PRA & SRB e-invoicing', 'landmark'], ['Payroll engine', 'wallet-cards'], ['Email & SMS delivery', 'send'], ['Bank feeds & Raast', 'zap'], ['Backups & DR', 'database-backup']];
    const DAYS = Array.from({ length: 90 }, (_, i) => { const d = new Date(TODAY); d.setDate(d.getDate() - (89 - i)); return `${String(d.getDate()).padStart(2, '0')} ${MON[d.getMonth()]}`; });
    const hist = COMP.map(([n], ci) => { const r = seededRand(ci * 13 + 7); return DAYS.map((_, di) => { const x = r(); if (ci === 2 && di === 89) return 'warn'; if (ci === 4 && di === 82) return 'warn'; if (ci === 5 && di === 70) return 'danger'; if (ci === 1 && di === 52) return 'danger'; return x > 0.985 ? 'warn' : x > 0.996 ? 'danger' : 'good'; }); });
    const uptime = (h) => (100 - h.filter((s) => s === 'warn').length * 0.021 - h.filter((s) => s === 'danger').length * 0.09).toFixed(2);
    const STAGES = ['Investigating', 'Identified', 'Monitoring', 'Resolved'];
    const INC = [
      { id: 'INC-2026-018', title: 'FBR invoice submissions delayed', impact: 'Minor', comps: ['FBR / PRAL gateway'], stage: 1, started: 'Today 09:40', updates: [['Identified', '09:58', 'PRAL’s IRIS endpoint is responding slowly. Submissions are queued and retried automatically; no invoices are lost.'], ['Investigating', '09:40', 'We are seeing timeouts when submitting POS invoices to FBR through PRAL. Looking into it.']] },
      { id: 'INC-2026-017', title: 'Payroll PDF generation slow', impact: 'Minor', comps: ['Payroll engine'], stage: 3, started: '24 Sep 14:10', dur: '48 min', updates: [['Resolved', '14:58', 'Worker pool scaled. Payslips are generating normally.'], ['Identified', '14:25', 'A large tenant run saturated the PDF workers.'], ['Investigating', '14:10', 'Payslip PDFs are taking longer than usual.']] },
      { id: 'INC-2026-016', title: 'Email delivery delays', impact: 'Major', comps: ['Email & SMS delivery'], stage: 3, started: '12 Sep 11:02', dur: '1 h 36 min', updates: [['Resolved', '12:38', 'Failover to backup SMTP complete; backlog cleared.'], ['Investigating', '11:02', 'Outbound email is delayed by up to 40 minutes.']] },
      { id: 'INC-2026-015', title: 'API 5xx errors', impact: 'Major', comps: ['Public API'], stage: 3, started: '04 Aug 16:20', dur: '9 min', updates: [['Resolved', '16:29', 'Bad deploy rolled back.'], ['Investigating', '16:20', 'Elevated 502s on api.finsoft.pk.']] },
    ];
    const MAINT = [['Sun 18 Oct · 02:00–02:30 PKT', 'Backups & DR', 'Storage migration to Karachi DR'], ['Sun 01 Nov · 01:00–03:00 PKT', 'Web app, Public API', 'PostgreSQL 17 upgrade']];
    let sel = INC[0];
    sec.insertAdjacentHTML('beforeend', `
      <div class="ap-status-ban" data-sban></div>
      <div class="panel ap-pubpage">
        <div class="ap-browser"><i></i><i></i><i></i><span><i data-lucide="lock"></i>status.finsoft.pk</span><a class="btn ghost sm" data-toast="Public page opened in a new tab"><i data-lucide="external-link"></i>Open</a></div>
        <div class="ap-pub-head"><div><span class="sb-mark ap-mk"><i data-lucide="activity"></i></span><b>Finsoft Cloud status</b></div><span class="pill"><i data-lucide="users"></i><b>2,418</b> subscribers</span></div>
        <div class="ap-comps" data-comps></div>
        <div class="ap-pub-foot"><span>90 days ago</span><span class="spacer"></span><span class="legend ap-legend-in"><span><i style="background:var(--good)"></i>Operational</span><span><i style="background:var(--warn)"></i>Degraded</span><span><i style="background:var(--danger)"></i>Outage</span></span><span class="spacer"></span><span>Today</span></div>
      </div>
      <div class="split ap-inc-split">
        <div class="panel ap-incd" data-incd></div>
        <div class="panel">${head('Incidents', 'Last 90 days')}<div class="ap-incs" data-incs></div></div>
      </div>
      <div class="grid-2 ap-maint">
        <div class="panel">${head('Schedule maintenance', 'Tenants get an in-app banner and an email')}
          <div class="form-grid"><label><span>Date</span><input type="date" name="d" value="2026-10-11" min="2026-10-01"></label><label><span>Start (PKT)</span><input type="time" name="t" value="02:00"></label>
            <label><span>Duration</span><select name="dur">${opts([['30', '30 minutes'], ['60', '1 hour'], ['90', '1 h 30 min'], ['120', '2 hours']], '60')}</select></label><label><span>Show banner</span><select name="lead">${opts(['72 hours before', '24 hours before', '1 hour before'])}</select></label>
            <label class="full"><span>What tenants should know</span><input name="msg" value="Payroll runs and FBR submissions scheduled in this window will run right after."></label></div>
          <div class="ap-lbl ap-mt">Affected components</div><div class="ap-chipsel" data-mcomps>${COMP.map(([n], i) => `<button type="button" class="${i === 0 || i === 4 ? 'on' : ''}">${n}</button>`).join('')}</div>
          <div class="form-actions ap-mt"><button class="btn primary" data-sched><i data-lucide="calendar-plus"></i>Schedule window</button></div>
        </div>
        <div class="stack">
          <div class="panel">${head('In-app banner preview', 'Exactly what tenants will see at the top of Finsoft')}<div class="ap-bprev"><div class="ap-bprev-app"><span class="ap-bprev-sb"></span><div><div class="ap-mbanner" data-mban></div><div class="ap-bprev-lines"><i></i><i></i><i></i></div></div></div></div></div>
          <div class="panel">${head('Upcoming windows')}<div class="list" data-mlist></div></div>
        </div>
      </div>`);
    function banner() {
      const open = INC.filter((i) => i.stage < 3);
      $('[data-sban]', sec).innerHTML = open.length ? `<span class="ap-sdot warn"></span><div><b>Partial degradation</b><small>${open.map((i) => i.title).join(' · ')}</small></div><span class="spacer"></span><span class="badge warn">${open.length} open incident${open.length > 1 ? 's' : ''}</span>` : `<span class="ap-sdot good"></span><div><b>All systems operational</b><small>Updated just now · 99.97% uptime over 90 days</small></div><span class="spacer"></span><span class="badge good">No open incidents</span>`;
      $('[data-sban]', sec).className = `ap-status-ban ${open.length ? 'warn' : 'good'}`;
    }
    function comps() {
      const open = INC.filter((i) => i.stage < 3).flatMap((i) => i.comps);
      $('[data-comps]', sec).innerHTML = COMP.map(([n, ic], ci) => { const h = hist[ci].slice(); if (!open.includes(n) && h[89] === 'warn' && ci === 2) h[89] = 'good'; const now = open.includes(n) ? 'warn' : 'good'; return `<div class="ap-comp" style="--i:${ci}"><div class="ap-comp-h"><i data-lucide="${ic}"></i><b>${n}</b><span class="spacer"></span><small>${uptime(h)}% uptime</small><span class="ap-cstat ${now}">${now === 'good' ? 'Operational' : 'Degraded'}</span></div><div class="ap-ubars">${h.map((s, di) => `<i class="${s}" style="--d:${di}" data-tip="${DAYS[di]} · ${s === 'good' ? 'No incidents' : s === 'warn' ? 'Degraded performance' : 'Partial outage'}"></i>`).join('')}</div></div>`; }).join('');
      icons($('[data-comps]', sec));
    }
    function list() {
      $('[data-incs]', sec).innerHTML = INC.map((i) => `<button class="ap-inc ${i === sel ? 'on' : ''} ${i.stage < 3 ? 'open' : ''}" data-id="${i.id}"><span class="ap-sdot ${i.stage < 3 ? 'warn' : 'good'}"></span><div><b>${esc(i.title)}</b><small>${i.id} · ${i.started}${i.dur ? ' · ' + i.dur : ''}</small></div><span class="badge ${i.stage < 3 ? (i.impact === 'Major' ? 'danger' : 'warn') : 'good'}">${STAGES[i.stage]}</span></button>`).join('');
    }
    function detail(anim) {
      const i = sel;
      $('[data-incd]', sec).innerHTML = `<div class="panel-head"><div><h3>${esc(i.title)}</h3><p>${i.id} · ${i.impact} impact · ${i.comps.join(', ')}</p></div><div class="panel-actions"><span class="badge ${i.stage < 3 ? 'warn' : 'good'} dot">${i.stage < 3 ? 'Open' : 'Resolved'}</span></div></div>
        <div class="ap-istep">${STAGES.map((s, k) => `<div class="${k < i.stage ? 'done' : k === i.stage ? 'cur' : ''}"><span><i data-lucide="${['search', 'crosshair', 'activity', 'circle-check'][k]}"></i></span><b>${s}</b></div>`).join('')}</div>
        <div class="ap-iupd" data-iupd>${i.updates.map(([s, t, m], k) => `<div class="ap-upd" style="--i:${k}"><span class="badge ${s === 'Resolved' ? 'good' : s === 'Monitoring' ? 'info' : s === 'Identified' ? 'violet' : 'warn'}">${s}</span><div><p>${esc(m)}</p><small>${t} PKT · posted by Saim Javed</small></div></div>`).join('')}</div>
        ${i.stage < 3 ? `<div class="ap-composer"><div class="row ap-wrap"><b>Post an update</b><span class="spacer"></span><div class="seg" data-ust>${STAGES.map((s, k) => `<button class="${k === Math.min(3, i.stage + 1) ? 'active' : ''}" data-s="${k}" ${k < i.stage ? 'disabled' : ''}>${s}</button>`).join('')}</div></div>
          <textarea rows="3" data-umsg placeholder="What changed? Keep it short and human."></textarea>
          <div class="row ap-wrap"><label class="check"><input type="checkbox" checked> Email & SMS subscribers</label><label class="check"><input type="checkbox" checked> Update in-app banner</label><span class="spacer"></span><button class="btn primary" data-post><i data-lucide="send"></i>Post update</button></div></div>` : '<div class="banner good ap-mt"><i data-lucide="circle-check"></i><div><b>Resolved</b><p>Post-incident review due within 5 working days.</p></div><button class="btn secondary sm" data-toast="Post-mortem draft created">Write post-mortem</button></div>'}`;
      icons($('[data-incd]', sec));
      if (anim) stagger(sec, '.ap-upd');
    }
    function maint() {
      const f = formData($('.ap-maint', sec)), d = new Date(f.d + 'T' + (f.t || '02:00'));
      const comps = $$('[data-mcomps] .on', sec).map((b) => b.textContent.replace('✓ ', ''));
      const end = new Date(d.getTime() + (+f.dur || 60) * 60000), hm = (x) => `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`;
      const days = Math.round((d - TODAY) / 864e5);
      $('[data-mban]', sec).innerHTML = isNaN(d) ? '' : `<i data-lucide="wrench"></i><span><b>Scheduled maintenance</b> · ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]} ${String(d.getDate()).padStart(2, '0')} ${MON[d.getMonth()]}, ${hm(d)}–${hm(end)} PKT. ${comps.length ? esc(comps.join(', ')) + ' may be unavailable.' : ''} ${esc(f.msg)}</span><em>in ${days} d</em><button type="button" aria-label="Dismiss">✕</button>`;
      icons($('[data-mban]', sec));
      $('[data-mlist]', sec).innerHTML = MAINT.map(([w, c, n]) => `<div class="list-item"><span class="icon-well yellow"><i data-lucide="calendar-clock"></i></span><div><b>${w}</b><small>${esc(c)} · ${esc(n)}</small></div><span class="spacer"></span><span class="badge info">Scheduled</span></div>`).join('');
      icons($('[data-mlist]', sec));
      return { d, end, comps, hm };
    }
    banner(); comps(); list(); detail(); maint();
    $('.ap-maint', sec).addEventListener('input', maint);
    $('.ap-maint', sec).addEventListener('change', maint);
    sec.addEventListener('click', async (e) => {
      const it = e.target.closest('.ap-inc'); if (it) { sel = INC.find((x) => x.id === it.dataset.id); list(); detail(true); return; }
      const mc = e.target.closest('[data-mcomps] button'); if (mc) { mc.classList.toggle('on'); maint(); return; }
      const po = e.target.closest('[data-post]');
      if (po) {
        const ta = $('[data-umsg]', sec), st = +$('[data-ust] .active', sec).dataset.s;
        if (!ta.value.trim()) { ta.classList.add('ap-invalid'); shake(ta); toast('Write a short update first', { tone: 'warn' }); return; }
        await busy(po, 800, 'Posting…');
        sel.updates.unshift([STAGES[st], '10:46', ta.value.trim()]);
        sel.stage = st;
        if (st === 3) sel.dur = '1 h 6 min';
        detail(true); list(); banner(); comps();
        const first = $('.ap-upd', sec); if (first) flash(first);
        if (st === 3) { celebrate($('.ap-istep', sec)); toast(`${sel.id} resolved · 2,418 subscribers notified`, { tone: 'good' }); }
        else toast(`Update posted (${STAGES[st]}) · subscribers notified`, { tone: 'info' });
        return;
      }
      const sc = e.target.closest('[data-sched]');
      if (sc) {
        const r = maint();
        if (isNaN(r.d) || r.d < TODAY) { shake($('[name=d]', sec)); toast('Pick a future date', { tone: 'warn' }); return; }
        if (!r.comps.length) { shake($('[data-mcomps]', sec)); toast('Select at least one component', { tone: 'warn' }); return; }
        await busy(sc, 800, 'Scheduling…');
        MAINT.unshift([`${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][r.d.getDay()]} ${String(r.d.getDate()).padStart(2, '0')} ${MON[r.d.getMonth()]} · ${r.hm(r.d)}–${r.hm(r.end)} PKT`, r.comps.join(', '), 'Planned maintenance']);
        maint(); flash($('[data-mlist] .list-item', sec));
        toast('Maintenance scheduled · banner and emails queued');
        return;
      }
      if (e.target.closest('[data-ap-act=declare]')) declare();
    });
    function declare() {
      const m = modal({
        title: 'Declare an incident', sub: 'Creates a public incident on status.finsoft.pk', size: 'wide',
        html: `<div class="form-grid"><label class="full"><span>Title *</span><input name="t" placeholder="e.g. Bank feed sync delayed for HBL"></label><label><span>Impact</span><select name="imp">${opts(['Minor', 'Major', 'Critical'])}</select></label><label><span>Status</span><select name="st">${opts(['Investigating', 'Identified'])}</select></label>
          <label class="full"><span>First update *</span><textarea name="m" rows="3" placeholder="What are tenants seeing?"></textarea></label></div><div class="ap-lbl ap-mt">Components</div><div class="ap-chipsel" data-dc>${COMP.map(([n]) => `<button type="button">${n}</button>`).join('')}</div>`,
        foot: `<button class="btn secondary" data-close>Cancel</button><button class="btn danger solid" data-ok><i data-lucide="siren"></i>Declare</button>`,
      });
      m.addEventListener('click', (e) => { const b = e.target.closest('[data-dc] button'); if (b) b.classList.toggle('on'); });
      $('[data-ok]', m).onclick = async (e) => {
        if (!need(m, ['t', 'm'])) return;
        const f = formData(m), cs = $$('[data-dc] .on', m).map((b) => b.textContent.replace('✓ ', ''));
        if (!cs.length) { shake($('[data-dc]', m)); toast('Pick affected components', { tone: 'warn' }); return; }
        await busy(e.currentTarget, 800, 'Publishing…');
        const inc = { id: `INC-2026-0${19 + INC.length - 4}`, title: f.t, impact: f.imp, comps: cs, stage: f.st === 'Identified' ? 1 : 0, started: 'Today 10:47', updates: [[f.st, '10:47', f.m]] };
        INC.unshift(inc); sel = inc; m.close(); banner(); comps(); list(); detail(true);
        toast(`${inc.id} published · on-call paged`, { tone: 'danger' });
      };
    }
  });

  /* ================= 12 · admin/integrations ================= */
  onRoute('admin/integrations', (sec) => {
    const SCOPES = ['read:vouchers', 'write:vouchers', 'read:invoices', 'write:invoices', 'read:payroll', 'read:reports', 'webhooks:manage'];
    const EVENTS = ['invoice.created', 'invoice.paid', 'payment.failed', 'voucher.posted', 'employee.created', 'payroll.posted', 'fbr.submitted', 'tenant.suspended'];
    const rk = (r, n = 20) => Array.from({ length: n }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'[Math.floor(r() * 56)]).join('');
    const mask = (k) => k.slice(0, 8) + '••••••••••••' + k.slice(-4);
    let T = tenantByCode('ALNOOR'), DATA = null, selLog = 0;
    function build(t) {
      const r = seededRand(hash(t.code) + 3), dom = t.code.toLowerCase();
      const keys = [
        { name: 'Production · ERP sync', env: 'live', key: 'fs_live_' + rk(r), scopes: ['read:vouchers', 'write:invoices', 'read:invoices'], created: '14 Mar 2026', used: '2 min ago' },
        { name: 'Power BI connector', env: 'live', key: 'fs_live_' + rk(r), scopes: ['read:reports'], created: '02 Jun 2026', used: 'Today 06:00' },
        { name: 'Staging tests', env: 'test', key: 'fs_test_' + rk(r), scopes: SCOPES.slice(0, 5), created: '19 Aug 2026', used: '3 days ago' },
      ];
      const hooks = [
        { url: `https://erp.${dom}.com.pk/hooks/finsoft`, on: true, ev: ['invoice.created', 'invoice.paid', 'voucher.posted', 'fbr.submitted'], rate: 99.2, secret: 'whsec_' + rk(r, 24) },
        { url: `https://hooks.zapier.com/${dom}/7731`, on: true, ev: ['employee.created', 'payroll.posted'], rate: 87.5, secret: 'whsec_' + rk(r, 24) },
      ];
      const codes = [200, 200, 500, 200, 200, 408, 200, 404, 200, 200];
      const log = codes.map((c, i) => ({ t: `10:${String(44 - i * 3).padStart(2, '0')}:${String(Math.floor(r() * 60)).padStart(2, '0')}`, ev: hooks[i % 3 === 2 ? 1 : 0].ev[i % (i % 3 === 2 ? 2 : 4)], ep: i % 3 === 2 ? 1 : 0, code: c, ms: c === 408 ? 10000 : Math.round(80 + r() * 300), att: c === 200 ? 1 : 1 + (i % 3), id: 'evt_' + rk(r, 14) }));
      return { keys, hooks, log };
    }
    sec.insertAdjacentHTML('beforeend', `
      <div class="kpi-grid">
        ${kpi('API calls · 24 h', '<span data-k1>412,380</span>', '▲ 8% vs yesterday', 'blue', 'code-xml', 'up')}
        ${kpi('Error rate', '0.4%', '4xx 0.31% · 5xx 0.09%', 'teal', 'circle-alert')}
        ${kpi('p95 latency', '182 ms', 'api.finsoft.pk · Karachi edge', '', 'timer')}
        ${kpi('Webhook success', '<span data-k4>97.6</span>%', 'Auto-retry with backoff · 6 attempts', 'violet', 'webhook')}
      </div>
      <div class="panel flush">${head('API keys', '<span data-tname></span> · keys are shown once at creation, then masked', '<button class="btn secondary sm" data-ap-act="new-key"><i data-lucide="plus"></i>New key</button>')}
        <div class="table-wrap"><table class="tbl ap-ktbl" data-plain><thead><tr><th>Name</th><th>Key</th><th>Scopes</th><th>Created</th><th>Last used</th><th></th></tr></thead><tbody></tbody></table></div></div>
      <div class="ap-hooks-h"><h3>Webhook endpoints</h3><button class="btn secondary sm" data-addhook><i data-lucide="plus"></i>Add endpoint</button></div>
      <div class="grid-2 ap-hooks" data-hooks></div>
      <div class="split ap-log-split">
        <div class="panel flush">${head('Webhook deliveries', 'Click a row to inspect the payload', `<div class="chips" data-lf><button class="active" data-f="all">All</button><button data-f="ok">2xx</button><button data-f="err">Failed</button></div>`)}
          <div class="table-wrap"><table class="tbl ap-wtbl" data-plain><thead><tr><th>Time</th><th>Event</th><th>Endpoint</th><th>Status</th><th class="num">Latency</th><th>Attempt</th><th></th></tr></thead><tbody></tbody></table></div></div>
        <div class="panel ap-payload" data-payload></div>
      </div>`);
    let lf = 'all';
    const codeBadge = (c) => `<span class="ap-code ${c < 300 ? 'ok' : c < 500 && c !== 408 ? 'warn' : 'err'}">${c === 408 ? 'Timeout' : c}</span>`;
    function renderKeys() {
      $('[data-tname]', sec).textContent = T.name;
      $('.ap-ktbl tbody', sec).innerHTML = DATA.keys.map((k, i) => `<tr data-i="${i}"><td><b>${esc(k.name)}</b><small><span class="ap-env ${k.env}">${k.env}</span></small></td><td><div class="ap-keycell"><code class="code ap-key" data-key>${mask(k.key)}</code><button class="icon-btn-sm" data-menu="off" data-reveal aria-label="Reveal"><i data-lucide="eye"></i></button><button class="icon-btn-sm" data-menu="off" data-copy aria-label="Copy"><i data-lucide="copy"></i></button></div></td>
        <td><div class="ap-scopes">${k.scopes.map((s) => `<span class="ap-scope">${s}</span>`).join('')}</div></td><td>${k.created}</td><td>${k.used}</td>
        <td class="actions"><div class="row ap-nowrap"><button class="btn ghost sm" data-rotate><i data-lucide="rotate-cw"></i>Rotate</button><button class="icon-btn-sm" data-menu="off" data-revokek aria-label="Revoke"><i data-lucide="trash-2"></i></button></div></td></tr>`).join('');
      icons($('.ap-ktbl', sec));
    }
    function renderHooks() {
      $('[data-hooks]', sec).innerHTML = DATA.hooks.map((h, i) => `<div class="panel ap-hookcard ${h.on ? '' : 'off'}" data-h="${i}"><div class="ap-hook-top"><span class="icon-tile ${h.rate > 95 ? '' : 'orange'}"><i data-lucide="webhook"></i></span><div><b class="ap-ellip">${esc(h.url)}</b><small>${h.rate}% success · 7 d</small></div><label class="switch"><input type="checkbox" ${h.on ? 'checked' : ''} data-hon><i></i></label></div>
        <div class="ap-secret"><small>Signing secret</small><code class="code" data-sec>whsec_••••••••${h.secret.slice(-4)}</code><button class="icon-btn-sm" data-menu="off" data-secrev aria-label="Reveal"><i data-lucide="eye"></i></button></div>
        <div class="ap-evs">${EVENTS.map((ev) => `<label class="ap-ev"><input type="checkbox" ${h.ev.includes(ev) ? 'checked' : ''} data-ev="${ev}"><span>${ev}</span></label>`).join('')}</div>
        <div class="row"><small class="ap-muted-t">${h.ev.length} events subscribed</small><span class="spacer"></span><button class="btn secondary sm" data-ping><i data-lucide="send"></i>Send test event</button></div></div>`).join('');
      icons($('[data-hooks]', sec));
    }
    function renderLog() {
      const tb = $('.ap-wtbl tbody', sec);
      const list = DATA.log.map((l, i) => [l, i]).filter(([l]) => lf === 'all' || (lf === 'ok' ? l.code < 300 : l.code >= 300));
      tb.innerHTML = list.map(([l, i]) => `<tr data-i="${i}" class="${i === selLog ? 'ap-sel' : ''}"><td class="tnum">${l.t}</td><td><code class="ap-evc">${l.ev}</code></td><td><span class="ap-ellip ap-epw">${esc(DATA.hooks[l.ep].url.replace('https://', ''))}</span></td><td>${codeBadge(l.code)}</td><td class="num">${fmt(l.ms)} ms</td><td>${l.att}/6</td><td class="actions"><button class="icon-btn-sm ${l.code < 300 ? '' : 'ap-replay-hot'}" data-menu="off" data-replay data-tip="Replay" aria-label="Replay"><i data-lucide="rotate-ccw"></i></button></td></tr>`).join('');
      icons(tb); payload();
    }
    function payload() {
      const l = DATA.log[selLog]; if (!l) return;
      const amt = 28999 + (selLog * 1370) % 9000;
      const obj = { id: l.id, type: l.ev, created: `2026-10-01T${l.t}+05:00`, tenant: { code: T.code, name: T.name }, data: l.ev.startsWith('invoice') || l.ev === 'payment.failed' ? { invoice_no: `INV-2026-00${412 + selLog}`, customer: 'City Mart Superstores', currency: 'PKR', amount: amt, gst: Math.round(amt * 0.18), fbr_irn: l.ev === 'invoice.paid' ? `FBR-${hash(l.id) % 99999999}` : null } : l.ev.startsWith('voucher') ? { voucher_no: `JV-2026-0000${45 + selLog}`, narration: 'Accrual for October', debit: amt, credit: amt } : l.ev === 'fbr.submitted' ? { pos_id: '182044', invoice_no: `INV-2026-00${412 + selLog}`, status: 'ACCEPTED' } : { employee_id: 'EMP-0042', name: 'Bilal Khan', department: 'Sales' } };
      const json = JSON.stringify(obj, null, 2);
      const hl = esc(json).replace(/(&quot;[^&]*?&quot;)(\s*:)?|\b(-?\d+(?:\.\d+)?)\b|\b(true|false|null)\b/g, (m, s, colon, n, b) => (s ? (colon ? `<span class="k">${s}</span>${colon}` : `<span class="s">${s}</span>`) : n ? `<span class="n">${n}</span>` : `<span class="b">${b}</span>`));
      $('[data-payload]', sec).innerHTML = `<div class="panel-head"><div><h3>Payload</h3><p><code class="ap-evc">${l.ev}</code> · ${l.id}</p></div><div class="panel-actions">${codeBadge(l.code)}<button class="icon-btn-sm" data-menu="off" data-cpjson aria-label="Copy JSON"><i data-lucide="copy"></i></button></div></div>
        <div class="seg ap-mb" data-pv><button class="active" data-v="req">Request</button><button data-v="res">Response</button></div>
        <pre class="code ap-json" data-pvreq>${hl}</pre>
        <pre class="code ap-json" data-pvres hidden><span class="k">HTTP/1.1</span> <span class="n">${l.code === 408 ? '408' : l.code}</span> ${l.code === 200 ? 'OK' : l.code === 404 ? 'Not Found' : l.code === 408 ? 'Request Timeout' : 'Internal Server Error'}\n<span class="k">content-type</span>: application/json\n<span class="k">x-request-id</span>: ${l.id.replace('evt', 'req')}\n<span class="k">finsoft-signature</span>: t=1790841840,v1=${hash(l.id).toString(16)}…\n\n${l.code === 200 ? '<span class="s">{"received": true}</span>' : l.code === 408 ? '<span class="b">— no response within 10 s —</span>' : `<span class="s">{"error": "${l.code === 404 ? 'route not found' : 'upstream crashed'}"}</span>`}</pre>
        <div class="ap-pl-foot"><small>Signed with HMAC-SHA256 · retries at 1m, 5m, 30m, 2h, 6h</small><button class="btn primary sm" data-replay-sel><i data-lucide="rotate-ccw"></i>Replay this event</button></div>`;
      icons($('[data-payload]', sec));
    }
    function load(t) { T = t; DATA = build(t); selLog = 2; renderKeys(); renderHooks(); renderLog(); }
    const tsel = $('[data-ap-tenant]', sec);
    tsel.innerHTML = opts(TENANTS.filter((t) => t.status !== 'Provisioning').map((t) => [t.code, t.name]), 'ALNOOR');
    tsel.addEventListener('change', () => { load(tenantByCode(tsel.value)); FS.skeleton ? FS.skeleton($('.ap-ktbl', sec).closest('.panel'), 450) : 0; toast(`Showing keys and webhooks for ${T.name}`, { tone: 'info', ms: 1800 }); });
    load(T);

    async function replay(i, btn) {
      const l = DATA.log[i];
      if (btn) await busy(btn, 1000, 'Sending…'); else await wait(600);
      const n = { ...l, t: '10:47:' + String(10 + DATA.log.length).slice(-2), code: 200, ms: Math.round(90 + Math.random() * 120), att: 1, id: l.id };
      DATA.log.unshift(n); selLog = 0; lf = 'all';
      $$('[data-lf] button', sec).forEach((b, k) => b.classList.toggle('active', !k));
      renderLog(); flash($('.ap-wtbl tbody tr', sec));
      tick($('[data-k4]', sec), 97.7, { dec: 1 });
      toast(`${l.ev} replayed to ${DATA.hooks[l.ep].url.replace('https://', '').split('/')[0]} · 200 OK in ${n.ms} ms`, { tone: 'good' });
    }
    function newKey(rotateIdx) {
      const rot = rotateIdx != null, k0 = rot ? DATA.keys[rotateIdx] : null;
      const m = modal({
        title: rot ? `Rotate “${esc(k0.name)}”` : 'Create API key', sub: `${esc(T.name)} · keys are shown once`, size: 'wide',
        html: rot ? `<div class="banner warn"><i data-lucide="triangle-alert"></i><div><b>The old key keeps working for 24 hours</b><p>Update ${esc(k0.name)} with the new key before ${'02 Oct 2026 10:47'}. After that, requests with the old key get 401.</p></div></div><div class="ap-newkey" data-nk hidden></div>`
          : `<div class="form-grid"><label><span>Name *</span><input name="n" placeholder="e.g. Shopify order sync"></label><div class="field"><span>Environment</span><div class="seg" data-env><button class="active" data-e="live">Live</button><button data-e="test">Test</button></div></div></div>
            <div class="ap-lbl ap-mt">Scopes</div><div class="ap-evs">${SCOPES.map((s, i) => `<label class="ap-ev"><input type="checkbox" ${i === 0 || i === 2 ? 'checked' : ''} value="${s}"><span>${s}</span></label>`).join('')}</div>
            <div class="form-grid ap-mt"><label><span>Expires</span><select name="x">${opts(['Never', '90 days', '1 year'])}</select></label><label><span>Allowed IPs (optional)</span><input name="ip" placeholder="e.g. 203.99.180.0/24"></label></div><div class="ap-newkey" data-nk hidden></div>`,
        foot: `<button class="btn secondary" data-close>Cancel</button><button class="btn ${rot ? 'danger solid' : 'primary'}" data-ok><i data-lucide="${rot ? 'rotate-cw' : 'key-round'}"></i>${rot ? 'Rotate key' : 'Create key'}</button>`,
      });
      $('[data-ok]', m).onclick = async (e) => {
        const b = e.currentTarget;
        if (b.dataset.done) { m.close(); return; }
        let k;
        if (!rot) {
          if (!need(m, ['n'])) return;
          const sc = $$('.ap-evs input:checked', m).map((x) => x.value);
          if (!sc.length) { shake($('.ap-evs', m)); toast('Pick at least one scope', { tone: 'warn' }); return; }
          const env = $('[data-env] .active', m).dataset.e;
          k = { name: $('[name=n]', m).value.trim(), env, key: `fs_${env}_` + rk(Math.random, 20), scopes: sc, created: '01 Oct 2026', used: 'Never' };
        }
        await busy(b, 900, rot ? 'Rotating…' : 'Generating…');
        if (rot) { k0.key = 'fs_' + k0.env + '_' + rk(Math.random, 20); k0.created = '01 Oct 2026'; k = k0; } else DATA.keys.unshift(k);
        const nk = $('[data-nk]', m); nk.hidden = false;
        nk.innerHTML = `<small>Copy it now. You will not see it again.</small><div class="row"><code class="code">${k.key}</code><button class="btn primary sm" data-cpnk><i data-lucide="copy"></i>Copy</button></div>`;
        icons(nk); flash(nk);
        $('[data-cpnk]', nk).onclick = () => copy(k.key, 'New key copied');
        b.dataset.done = '1'; b.className = 'btn secondary'; b.innerHTML = '<i data-lucide="check"></i>Done'; icons(b);
        renderKeys(); flash($(`.ap-ktbl tr[data-i="${rot ? rotateIdx : 0}"]`, sec));
        toast(rot ? `${k.name} rotated · old key expires in 24 h` : `Key “${esc(k.name)}” created`, { tone: 'good' });
      };
    }
    function addHook() {
      const m = modal({
        title: 'Add webhook endpoint', sub: esc(T.name), size: 'wide',
        html: `<label class="field"><span>Endpoint URL *</span><input name="u" placeholder="https://example.com/webhooks/finsoft"></label><div class="ap-lbl ap-mt">Events</div><div class="ap-evs">${EVENTS.map((ev, i) => `<label class="ap-ev"><input type="checkbox" value="${ev}" ${i < 2 ? 'checked' : ''}><span>${ev}</span></label>`).join('')}</div>`,
        foot: `<button class="btn secondary" data-close>Cancel</button><button class="btn primary" data-ok><i data-lucide="plus"></i>Add endpoint</button>`,
      });
      $('[data-ok]', m).onclick = async (e) => {
        const u = $('[name=u]', m).value.trim();
        if (!/^https:\/\/[^\s/$.?#].[^\s]*$/.test(u)) { const i = $('[name=u]', m); i.classList.add('ap-invalid'); shake(i.closest('label')); toast('Endpoint must be a valid https:// URL', { tone: 'warn' }); return; }
        await busy(e.currentTarget, 800, 'Verifying endpoint…');
        DATA.hooks.push({ url: u, on: true, ev: $$('.ap-evs input:checked', m).map((x) => x.value), rate: 100, secret: 'whsec_' + rk(Math.random, 24) });
        m.close(); renderHooks(); const c = $$('.ap-hookcard', sec).pop(); flash(c); c.scrollIntoView({ behavior: reduce() ? 'auto' : 'smooth', block: 'center' });
        toast('Endpoint added · a test ping returned 200');
      };
    }
    sec.addEventListener('click', async (e) => {
      if (e.target.closest('[data-ap-act=new-key]')) { newKey(); return; }
      const kr = e.target.closest('.ap-ktbl tr[data-i]');
      if (kr) {
        const k = DATA.keys[+kr.dataset.i];
        if (e.target.closest('[data-reveal]')) { const c = $('[data-key]', kr), b = e.target.closest('[data-reveal]'); const on = c.classList.toggle('shown'); c.textContent = on ? k.key : mask(k.key); b.innerHTML = `<i data-lucide="${on ? 'eye-off' : 'eye'}"></i>`; icons(b); return; }
        if (e.target.closest('[data-copy]')) { copy(k.key, `${k.name} key copied`); return; }
        if (e.target.closest('[data-rotate]')) { newKey(+kr.dataset.i); return; }
        if (e.target.closest('[data-revokek]')) { if (!(await confirmBox({ title: `Revoke “${k.name}”?`, text: 'Requests using this key fail immediately with 401. This cannot be undone.', okLabel: 'Revoke key', danger: true }))) return; const i = DATA.keys.indexOf(k); rowOut(kr, () => { DATA.keys.splice(i, 1); renderKeys(); }); toast(`${k.name} revoked`, { tone: 'danger' }); return; }
        return;
      }
      if (e.target.closest('[data-addhook]')) { addHook(); return; }
      const hc = e.target.closest('.ap-hookcard');
      if (hc) {
        const h = DATA.hooks[+hc.dataset.h];
        if (e.target.closest('[data-secrev]')) { const c = $('[data-sec]', hc), b = e.target.closest('[data-secrev]'); const on = c.classList.toggle('shown'); c.textContent = on ? h.secret : `whsec_••••••••${h.secret.slice(-4)}`; b.innerHTML = `<i data-lucide="${on ? 'eye-off' : 'eye'}"></i>`; icons(b); return; }
        const pg = e.target.closest('[data-ping]');
        if (pg) { await busy(pg, 900, 'Pinging…'); DATA.log.unshift({ t: '10:47:31', ev: 'ping', ep: +hc.dataset.h, code: 200, ms: 143, att: 1, id: 'evt_' + rk(Math.random, 14) }); selLog = 0; renderLog(); flash($('.ap-wtbl tbody tr', sec)); toast('Test event delivered · 200 OK in 143 ms'); return; }
      }
      const f = e.target.closest('[data-lf] button'); if (f) { lf = f.dataset.f; renderLog(); return; }
      const rp = e.target.closest('[data-replay]'); if (rp) { e.stopPropagation(); replay(+rp.closest('tr').dataset.i, rp); return; }
      const rs2 = e.target.closest('[data-replay-sel]'); if (rs2) { replay(selLog, rs2); return; }
      const lr = e.target.closest('.ap-wtbl tbody tr'); if (lr) { selLog = +lr.dataset.i; $$('.ap-wtbl tbody tr', sec).forEach((r) => r.classList.toggle('ap-sel', r === lr)); payload(); const p = $('[data-payload]', sec); flash(p); return; }
      const pv = e.target.closest('[data-pv] button'); if (pv) { $('[data-pvreq]', sec).hidden = pv.dataset.v !== 'req'; $('[data-pvres]', sec).hidden = pv.dataset.v !== 'res'; return; }
      if (e.target.closest('[data-cpjson]')) { copy($('[data-pvreq]', sec).textContent, 'Payload JSON copied'); }
    });
    sec.addEventListener('change', (e) => {
      const hc = e.target.closest('.ap-hookcard'); if (!hc) return;
      const h = DATA.hooks[+hc.dataset.h];
      if (e.target.matches('[data-hon]')) { h.on = e.target.checked; hc.classList.toggle('off', !h.on); toast(`Endpoint ${h.on ? 'enabled' : 'paused · events are queued for 72 h'}`, { tone: h.on ? 'good' : 'warn' }); }
      if (e.target.matches('[data-ev]')) { const ev = e.target.dataset.ev; h.ev = e.target.checked ? h.ev.concat(ev) : h.ev.filter((x) => x !== ev); $('.row small', hc).textContent = `${h.ev.length} events subscribed`; toast(`${e.target.checked ? 'Subscribed to' : 'Unsubscribed from'} ${ev}`, { tone: 'info', ms: 1600 }); }
    });
  });

  /* ================= 13 · admin/tax-master ================= */
  onRoute('admin/tax-master', (sec) => {
    const ST = [
      { auth: 'FBR', jur: 'Federal', what: 'Supply of goods · Sales Tax Act 1990', rate: 18, red: '0% Fifth Sch. · exempt Sixth Sch.', eff: '01 Jul 2025', n: 128, logo: 'landmark' },
      { auth: 'FBR', jur: 'Federal', what: 'Further tax · unregistered buyers', rate: 4, red: '—', eff: '01 Jul 2025', n: 96, logo: 'landmark' },
      { auth: 'PRA', jur: 'Punjab', what: 'Services · Punjab Sales Tax on Services Act 2012', rate: 16, red: '5% IT services · 8% courier', eff: '01 Jul 2026', n: 74, logo: 'building' },
      { auth: 'SRB', jur: 'Sindh', what: 'Services · Sindh Sales Tax on Services Act 2011', rate: 15, red: '8% telecom-adjacent · 3% IT export', eff: '01 Jul 2026', n: 31, logo: 'building' },
      { auth: 'KPRA', jur: 'Khyber Pakhtunkhwa', what: 'Services · KP Finance Act 2013', rate: 15, red: '2% restaurants (card)', eff: '01 Jul 2026', n: 12, logo: 'building' },
      { auth: 'BRA', jur: 'Balochistan', what: 'Services · Balochistan Sales Tax on Services Act 2015', rate: 15, red: '—', eff: '01 Jul 2026', n: 3, logo: 'building' },
    ];
    const WHT = [
      { sec: '153(1)(a)', what: 'Sale of goods', atl: '5.0% co. · 5.5% others', non: '10.0% · 11.0%', thr: 'Rs 75,000 / year per supplier', eff: '01 Jul 2026' },
      { sec: '153(1)(b)', what: 'Rendering of services', atl: '9.0% co. · 11.0% others', non: '18.0% · 22.0%', thr: 'Rs 30,000 / year', eff: '01 Jul 2026' },
      { sec: '153(1)(c)', what: 'Execution of contracts', atl: '7.0% co. · 7.5% others', non: '14.0% · 15.0%', thr: '—', eff: '01 Jul 2026' },
      { sec: '149', what: 'Salary income', atl: 'Slabs · 0% to 35%', non: 'Same slabs', thr: 'Rs 600,000 / year exempt', eff: '01 Jul 2026', slabs: true },
      { sec: '236G', what: 'Sale to distributors, dealers & wholesalers', atl: '0.1% (fertiliser 0.25%)', non: '0.2% · 0.5%', thr: '—', eff: '01 Jul 2026' },
      { sec: '236H', what: 'Sale to retailers', atl: '0.5%', non: '1.0%', thr: '—', eff: '01 Jul 2026' },
    ];
    const SLABS = [['Up to 600,000', '0%'], ['600,001 – 1,200,000', '1% of amount over 600,000'], ['1,200,001 – 2,200,000', 'Rs 6,000 + 11% over 1.2M'], ['2,200,001 – 3,200,000', 'Rs 116,000 + 23% over 2.2M'], ['3,200,001 – 4,100,000', 'Rs 346,000 + 30% over 3.2M'], ['Above 4,100,000', 'Rs 616,000 + 35% over 4.1M']];
    const LOG = [
      ['01 Oct 2026 09:12', 'Danish Ahmed', 'FBR DI sandbox token rotated', 'key-round', 'info'],
      ['01 Jul 2026 00:05', 'System', 'FY 2026-27 rates published to 128 tenants (v2026.07)', 'upload-cloud', 'good'],
      ['28 Jun 2026 16:40', 'Saim Javed', 'WHT 153(1)(b) services 8% → 9% (companies) per Finance Act 2026', 'percent', 'warn'],
      ['24 Jun 2026 11:03', 'Saim Javed', 'PRA services rate confirmed 16% for FY 2026-27', 'building', 'info'],
      ['10 Jun 2026 10:18', 'Mariam Iqbal', 'Further tax 3% → 4% (unregistered buyers)', 'landmark', 'warn'],
    ];
    const ENV = { sandbox: ['https://gw.fbr.gov.pk/di_data/v1/di/postinvoicedata_sb', 'https://e-pra.punjab.gov.pk/sandbox/api/v2/invoices'], production: ['https://gw.fbr.gov.pk/di_data/v1/di/postinvoicedata', 'https://e-pra.punjab.gov.pk/api/v2/invoices'] };
    let env = 'sandbox';
    const TILE = [['Federal GST', 18, 'FBR', 'landmark', 'green'], ['PRA · Punjab', 16, 'Services', 'building', 'blue'], ['SRB · Sindh', 15, 'Services', 'building', 'violet'], ['KPRA · KP', 15, 'Services', 'building', 'orange'], ['BRA · Balochistan', 15, 'Services', 'building', 'lime']];
    sec.insertAdjacentHTML('beforeend', `
      <div class="ap-taxtiles">${TILE.map(([l, r, s, ic, c], i) => `<div class="ap-taxtile" style="--i:${i}"><span class="icon-tile ${c}"><i data-lucide="${ic}"></i></span><small>${l}</small><b data-count>${r}%</b><span>${s} · eff. ${i ? '01 Jul 2026' : '01 Jul 2025'}</span></div>`).join('')}</div>
      <div data-tabs>
        <div class="tabs"><button class="active" data-tab="st"><i data-lucide="receipt"></i>Sales tax</button><button data-tab="wht"><i data-lucide="file-minus"></i>Withholding</button><button data-tab="fbr"><i data-lucide="plug"></i>FBR / PRAL connection</button><button data-tab="log"><i data-lucide="history"></i>Change log <i data-lc>${LOG.length}</i></button></div>
        <div class="tab-pane active" data-pane="st"><div class="panel flush">${head('Sales tax rates', 'Federal on goods, provincial on services. Tenants inherit these unless they override.')}
          <div class="table-wrap"><table class="tbl ap-sttbl" data-plain><thead><tr><th>Authority</th><th>Applies to</th><th class="num">Rate</th><th>Reduced / special</th><th>Effective from</th><th class="num">Tenants</th><th></th></tr></thead><tbody></tbody></table></div></div></div>
        <div class="tab-pane" data-pane="wht"><div class="panel flush">${head('Withholding tax sections', 'Income Tax Ordinance 2001 · ATL = Active Taxpayers List')}
          <div class="table-wrap"><table class="tbl ap-whttbl" data-plain><thead><tr><th>Section</th><th>Nature</th><th>ATL rate</th><th>Non-ATL rate</th><th>Threshold</th><th>Effective</th><th></th></tr></thead><tbody></tbody></table></div></div></div>
        <div class="tab-pane" data-pane="fbr">
          <div class="split ap-fbr-split">
            <div class="panel">${head('Endpoint configuration', 'Digital invoicing for every tenant that enables FBR POS', '<div class="seg ap-env" data-env><button class="active" data-e="sandbox"><i data-lucide="flask-conical"></i>Sandbox</button><button data-e="production"><i data-lucide="radio"></i>Production</button></div>')}
              <div class="banner info ap-envban" data-envban><i data-lucide="flask-conical"></i><div><b>Sandbox mode</b><p>Invoices go to FBR’s test gateway. Nothing is reported for real.</p></div></div>
              <div class="form-grid"><label class="full"><span>FBR DI endpoint</span><input data-u1 readonly></label><label class="full"><span>PRA e-invoicing endpoint</span><input data-u2 readonly></label>
                <div class="field"><span>Security token</span><div class="ap-ig"><input value="••••••••••••••••7f3c" readonly data-tok><span><button type="button" class="ap-igbtn" data-tokrev><i data-lucide="eye"></i></button></span></div></div><label><span>POS ID (platform)</span><input value="182044"></label>
                <label><span>Timeout</span><select>${opts(['10 seconds', '20 seconds', '30 seconds'], '20 seconds')}</select></label><label><span>On failure</span><select>${opts(['Queue & retry every 5 min', 'Queue & retry hourly', 'Fail the invoice'])}</select></label></div>
              <div class="form-actions ap-mt"><button class="btn secondary" data-toast="Configuration saved"><i data-lucide="save"></i>Save</button><button class="btn primary" data-ctest><i data-lucide="plug-zap"></i>Test connection</button></div>
            </div>
            <div class="stack">
              <div class="panel ap-ctest" data-ctestp>${head('Connection test', 'Runs a signed sample invoice end to end')}<div class="ap-conn" data-conn><div class="ap-conn-idle"><span class="ap-conn-orb"><i data-lucide="plug"></i></span><p>Not run yet today. Last success 30 Sep 23:58.</p></div></div></div>
              <div class="panel">${head('Today', 'All tenants · FBR DI')}<div class="dl"><div><span>Submitted</span><b>8,940</b></div><div><span>Accepted</span><b class="ap-good-t">8,861 · 99.1%</b></div><div><span>Queued (PRAL slow)</span><b class="ap-warn-t">37</b></div><div><span>Rejected</span><b class="ap-danger-t">42</b></div></div><a class="btn ghost sm ap-mt" href="#/admin/status"><i data-lucide="siren"></i>Open incident INC-2026-018</a></div>
            </div>
          </div>
        </div>
        <div class="tab-pane" data-pane="log"><div class="panel">${head('Change log', 'Every rate edit, publish and credential change')}<div class="timeline" data-log></div></div></div>
      </div>`);
    const stb = $('.ap-sttbl tbody', sec), wtb = $('.ap-whttbl tbody', sec);
    const renderST = () => { stb.innerHTML = ST.map((r, i) => `<tr data-i="${i}"><td><div class="cell-user"><span class="icon-well ${r.auth === 'FBR' ? '' : 'teal'}"><i data-lucide="${r.logo}"></i></span><div><b>${r.auth}</b><small>${r.jur}</small></div></div></td><td>${r.what}</td><td class="num"><b class="ap-rate">${r.rate}%</b>${r.pending ? `<small class="ap-pend">→ ${r.pending.rate}% from ${r.pending.eff}</small>` : ''}</td><td>${r.red}</td><td>${r.eff}</td><td class="num">${r.n}</td><td class="actions"><button class="btn ghost sm" data-edit><i data-lucide="pencil"></i>Edit</button></td></tr>`).join(''); icons(stb); };
    const renderWHT = () => { wtb.innerHTML = WHT.map((r, i) => `<tr data-i="${i}"><td><code class="code">${r.sec}</code></td><td><b>${r.what}</b></td><td>${r.atl}</td><td class="ap-danger-t">${r.non}</td><td>${r.thr}</td><td>${r.eff}</td><td class="actions">${r.slabs ? '<button class="btn secondary sm" data-slabs><i data-lucide="layers"></i>Slabs</button>' : '<button class="btn ghost sm" data-wedit><i data-lucide="pencil"></i>Edit</button>'}</td></tr>`).join(''); icons(wtb); };
    const renderLog = () => { $('[data-log]', sec).innerHTML = LOG.map(([t, who, w, ic, c], i) => `<div class="tl-item" style="--i:${i}"><span class="ap-tl-ic ${c}"><i data-lucide="${ic}"></i></span><div><b>${esc(w)}</b><small>${t} · ${who}</small></div></div>`).join(''); icons($('[data-log]', sec)); tick($('[data-lc]', sec), LOG.length); };
    const renderEnv = () => {
      $('[data-u1]', sec).value = ENV[env][0]; $('[data-u2]', sec).value = ENV[env][1];
      const b = $('[data-envban]', sec);
      b.className = `banner ${env === 'sandbox' ? 'info' : 'warn'} ap-envban`;
      b.innerHTML = env === 'sandbox' ? '<i data-lucide="flask-conical"></i><div><b>Sandbox mode</b><p>Invoices go to FBR’s test gateway. Nothing is reported for real.</p></div>' : '<i data-lucide="radio"></i><div><b>Production · live reporting</b><p>Every POS invoice from opted-in tenants is reported to FBR and PRA in real time.</p></div>';
      icons(b); flash(b);
    };
    renderST(); renderWHT(); renderLog(); renderEnv();
    function editRate(r) {
      const m = modal({
        title: `Change ${r.auth} rate`, sub: `${r.jur} · ${r.what}`,
        html: `<div class="ap-ratechg"><div><small>Current</small><b>${r.rate}%</b></div><i data-lucide="arrow-right"></i><div><small>New</small><b data-nr>${r.rate}%</b></div></div>
          <div class="form-grid ap-mt"><label><span>New rate (%)</span><input type="number" step="0.5" min="0" max="30" name="rate" value="${r.rate}"></label><label><span>Effective from</span><input type="date" name="eff" value="2027-01-01" min="2026-10-02"></label>
          <label class="full"><span>Legal reference *</span><input name="ref" placeholder="e.g. SRO 1250(I)/2026 or Finance (Supplementary) Act"></label></div>
          <div class="banner warn ap-mt"><i data-lucide="users"></i><div><b>${r.n} tenants use this rate</b><p>They see a notice now; invoices switch automatically on the effective date.</p></div></div>`,
        foot: `<button class="btn secondary" data-close>Cancel</button><button class="btn primary" data-ok><i data-lucide="calendar-check"></i>Schedule change</button>`,
      });
      $('[name=rate]', m).addEventListener('input', (e) => { $('[data-nr]', m).textContent = (e.target.value || 0) + '%'; });
      $('[data-ok]', m).onclick = async (e) => {
        if (!need(m, ['ref', 'rate'])) return;
        const nr = +$('[name=rate]', m).value, d = new Date($('[name=eff]', m).value);
        if (nr === r.rate) { shake($('[name=rate]', m).closest('label')); toast('The new rate equals the current rate', { tone: 'warn' }); return; }
        await busy(e.currentTarget, 700, 'Scheduling…');
        r.pending = { rate: nr, eff: isNaN(d) ? '01 Jan 2027' : `${String(d.getDate()).padStart(2, '0')} ${MON[d.getMonth()]} ${d.getFullYear()}` };
        LOG.unshift(['01 Oct 2026 10:48', 'Saim Javed', `${r.auth} ${r.rate}% → ${nr}% scheduled for ${r.pending.eff} (${$('[name=ref]', m).value.trim()})`, 'percent', 'warn']);
        m.close(); renderST(); renderLog(); flash($(`tr[data-i="${ST.indexOf(r)}"]`, stb));
        toast(`${r.auth} change scheduled · ${r.n} tenants will be notified`, { tone: 'good' });
      };
    }
    async function connTest(btn) {
      const box = $('[data-conn]', sec);
      const steps = [['DNS', 'gw.fbr.gov.pk → 202.61.36.18', 120], ['TLS 1.3', 'Certificate valid · PRAL CA', 180], ['Auth', 'Bearer token accepted', 260], ['Sample invoice', env === 'sandbox' ? 'POST postinvoicedata_sb' : 'POST postinvoicedata (dry-run)', 640]];
      btn.disabled = true;
      box.innerHTML = `<div class="ap-conn-run"><span class="ap-conn-orb run"><i data-lucide="plug-zap"></i><em></em></span><div class="ap-conn-steps">${steps.map(([s, d]) => `<div class="ap-cs"><span class="ap-spin"></span><div><b>${s}</b><small>${d}</small></div><em></em></div>`).join('')}</div></div>`;
      icons(box);
      let total = 0;
      for (const [i, el] of $$('.ap-cs', box).entries()) { el.classList.add('run'); await wait(reduce() ? 10 : 380 + i * 120); total += steps[i][2]; el.classList.remove('run'); el.classList.add('ok'); $('.ap-spin', el).outerHTML = '<i data-lucide="circle-check"></i>'; $('em', el).textContent = steps[i][2] + ' ms'; icons(el); }
      const orb = $('.ap-conn-orb', box); orb.classList.remove('run'); orb.classList.add('ok'); orb.innerHTML = '<i data-lucide="check"></i>'; icons(orb);
      box.insertAdjacentHTML('beforeend', `<div class="ap-conn-res"><div><small>FBR invoice number (IRN)</small><code class="code">7000012610${hash(env + total) % 100000}</code></div><div><small>Round trip</small><b>${fmt(total)} ms</b></div></div>`);
      btn.disabled = false; celebrate(orb);
      LOG.unshift(['01 Oct 2026 10:49', 'Saim Javed', `Connection test passed (${env}) · ${fmt(total)} ms`, 'plug-zap', 'good']); renderLog();
      toast(`FBR ${env} connection OK · ${fmt(total)} ms`, { tone: 'good' });
    }
    sec.addEventListener('click', async (e) => {
      const ed = e.target.closest('[data-edit]'); if (ed) { editRate(ST[+ed.closest('tr').dataset.i]); return; }
      const we = e.target.closest('[data-wedit]'); if (we) { const r = WHT[+we.closest('tr').dataset.i]; toast(`Editing ${r.sec}: rate changes need a Finance Act or SRO reference`, { tone: 'info' }); editRate({ auth: r.sec, jur: 'Income Tax Ordinance 2001', what: r.what, rate: parseFloat(r.atl) || 0, n: 128 }); return; }
      if (e.target.closest('[data-slabs]')) { drawer({ title: 'Section 149 · salary slabs', sub: 'Tax year 2027 (FY 2026-27) · resident individuals', html: `<div class="table-wrap"><table class="tbl" data-plain><thead><tr><th>Taxable income (Rs / year)</th><th>Tax</th></tr></thead><tbody>${SLABS.map(([a, b]) => `<tr><td class="tnum"><b>${a}</b></td><td>${b}</td></tr>`).join('')}</tbody></table></div><div class="banner info ap-mt"><i data-lucide="info"></i><div><b>Used by every tenant’s payroll</b><p>Payroll recomputes monthly withholding from projected annual salary, including bonuses and arrears.</p></div></div>` }); return; }
      const eb = e.target.closest('[data-env] button');
      if (eb && eb.dataset.e !== env) {
        if (eb.dataset.e === 'production') {
          const ok = await confirmBox({ title: 'Switch to production?', text: 'Invoices from 23 opted-in tenants will be reported to FBR and PRA for real. Make sure the sandbox test passed today.', okLabel: 'Go live', danger: true });
          if (!ok) { $$('[data-env] button', sec).forEach((b) => b.classList.toggle('active', b.dataset.e === env)); return; }
        }
        env = eb.dataset.e; $$('[data-env] button', sec).forEach((b) => b.classList.toggle('active', b.dataset.e === env));
        renderEnv(); LOG.unshift(['01 Oct 2026 10:48', 'Saim Javed', `FBR / PRAL switched to ${env}`, env === 'production' ? 'radio' : 'flask-conical', env === 'production' ? 'danger' : 'info']); renderLog();
        toast(`Now using ${env} endpoints`, { tone: env === 'production' ? 'warn' : 'info' });
        return;
      }
      const ct = e.target.closest('[data-ctest]'); if (ct) { connTest(ct); return; }
      const tr = e.target.closest('[data-tokrev]'); if (tr) { const i = $('[data-tok]', sec); const on = i.dataset.on !== '1'; i.dataset.on = on ? '1' : ''; i.value = on ? 'b4f2a9c0-71de-4c8e-9a51-2d0e8f1c7f3c' : '••••••••••••••••7f3c'; tr.innerHTML = `<i data-lucide="${on ? 'eye-off' : 'eye'}"></i>`; icons(tr); return; }
      const pb = e.target.closest('[data-ap-act=tax-publish]');
      if (pb) {
        if (!(await confirmBox({ title: 'Publish tax master v2026.10?', text: 'All 128 tenants receive the updated rates and sections. Scheduled changes apply on their effective dates.', okLabel: 'Publish' }))) return;
        await busy(pb, 1200, 'Publishing…'); celebrate(pb);
        LOG.unshift(['01 Oct 2026 10:50', 'Saim Javed', 'Tax master v2026.10 published to 128 tenants', 'upload-cloud', 'good']); renderLog();
        toast('Tax master v2026.10 published to 128 tenants');
      }
    });
  });

})();
