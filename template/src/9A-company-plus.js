/* ================= 9A company-plus (Agent D, prefix cp-) =================
   Approvals, Setup Guide, Data Import, Recurring Invoices, Price Lists, Reminders,
   Cost Centres, Landed Cost, Bank Rules, Activity Feed. */
(function () {
  const FS = window.FS;
  if (!FS) return;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const D = window.FS_DATA || {};
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ini = (n) => String(n).split(/\s+/).filter((w) => /^[A-Za-z]/.test(w)).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const hash = (s) => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
  const tone = (n) => (n === 'Sana Javed' ? ' lime' : ' c' + (2 + (hash(n) % 5)));
  const av = (n, size = 'sm') => `<span class="avatar ${size}${tone(n)}" title="${esc(n)}">${ini(n)}</span>`;
  const rs = (n, dec = 0) => (n < 0 ? '−' : '') + 'Rs ' + FS.fmt(Math.abs(n), dec);
  const fmt = (n, d = 0) => FS.fmt(n, d);
  const sleep = (ms) => new Promise((r) => setTimeout(r, reduce() ? Math.min(ms, 60) : ms));
  const rng = (seed) => { let s = hash(seed) || 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const TODAY = new Date(2026, 9, 1);
  const dstr = (d, y = true) => `${String(d.getDate()).padStart(2, '0')} ${MON[d.getMonth()]}${y ? ' ' + d.getFullYear() : ''}`;
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const parseIso = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
  const ic = (n) => `<i data-lucide="${n}"></i>`;
  const active = (sec) => sec && sec.classList.contains('active');
  const typing = (e) => !!e.target.closest('input, textarea, select, [contenteditable="true"]');
  const overlayOpen = () => !!document.querySelector('.overlay.open');

  /* animated number change: FS.tick when the shell provides it, a local tween otherwise */
  function tick(el, to, o = {}) {
    if (!el) return;
    const dec = o.dec ?? 0, prefix = o.prefix ?? '', suffix = o.suffix ?? '';
    if (FS.tick && !o.local) { try { FS.tick(el, to, { dec, prefix }); if (suffix && !el.textContent.endsWith(suffix)) el.insertAdjacentText('beforeend', suffix); return; } catch (e) { /* fall through */ } }
    const from = el._cpv != null ? el._cpv : parseFloat(String(el.textContent).replace(/[^\d.\-]/g, '')) || 0;
    el._cpv = to;
    const paint = (v) => {
      const s = FS.fmt(Math.abs(v), dec); const [i, d] = s.split('.');
      el.innerHTML = `${v < 0 ? '−' : ''}${prefix}${i}${d ? `<span class="dec">.${d}</span>` : ''}${suffix}`;
    };
    if (reduce() || from === to) { paint(to); return; }
    const t0 = performance.now(), dur = o.dur || 650;
    cancelAnimationFrame(el._cpraf);
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      paint(from + (to - from) * e);
      if (p < 1) el._cpraf = requestAnimationFrame(step);
    };
    el._cpraf = requestAnimationFrame(step);
    el.classList.remove('cp-bump'); void el.offsetWidth; el.classList.add('cp-bump');
  }

  /* success burst: FS.celebrate when present, otherwise a local check + confetti-lite */
  function celebrate(el, msg) {
    if (FS.celebrate) { try { FS.celebrate(el); return; } catch (e) { /* fall back */ } }
    const r = el ? el.getBoundingClientRect() : { left: innerWidth / 2 - 1, top: innerHeight / 2 - 1, width: 2, height: 2 };
    const host = document.createElement('div');
    host.className = 'cp-burst';
    host.style.left = r.left + r.width / 2 + 'px';
    host.style.top = r.top + r.height / 2 + 'px';
    const cols = ['var(--lime)', 'var(--mint)', 'var(--primary)', 'var(--orange)', 'var(--blue)', 'var(--violet)'];
    let bits = '';
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2, d = 70 + (i % 5) * 22;
      bits += `<i style="--x:${Math.cos(a) * d}px;--y:${Math.sin(a) * d - 30}px;--r:${(i * 47) % 360}deg;background:${cols[i % cols.length]};animation-delay:${(i % 4) * 25}ms"></i>`;
    }
    host.innerHTML = `<b>${ic('check')}</b>${bits}${msg ? `<em>${esc(msg)}</em>` : ''}`;
    document.body.appendChild(host);
    FS.icons(host);
    setTimeout(() => host.remove(), 1500);
  }

  /* confirm dialog: FS.confirm when present */
  function confirmBox({ title, text, okLabel = 'Confirm', danger = false }) {
    if (FS.confirm) return FS.confirm({ title, text, okLabel, danger });
    return new Promise((res) => {
      const o = document.createElement('div');
      o.className = 'overlay'; o.dataset.temp = '1';
      o.innerHTML = `<div class="modal"><div class="modal-head"><div><h2>${title}</h2><p>${text || ''}</p></div><button class="x" data-close>${ic('x')}</button></div><div class="modal-foot"><button class="btn secondary" data-no>Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${okLabel}</button></div></div>`;
      document.body.appendChild(o);
      FS.icons(o);
      requestAnimationFrame(() => o.classList.add('open'));
      let done = false;
      const fin = (v) => { if (done) return; done = true; FS.closeOverlay(o); res(v); };
      o.addEventListener('click', (e) => { if (e.target.closest('[data-ok]')) fin(true); else if (e.target.closest('[data-no],[data-close]') || e.target === o) fin(false); });
    });
  }

  /* button progress state for async-looking actions */
  async function busy(btn, ms = 900, label) {
    if (!btn) { await sleep(ms); return; }
    const html = btn.innerHTML, w = btn.offsetWidth;
    btn.disabled = true; btn.classList.add('cp-busy'); btn.style.minWidth = w + 'px';
    btn.innerHTML = `<span class="cp-spin"></span>${label || 'Working…'}`;
    await sleep(ms);
    btn.disabled = false; btn.classList.remove('cp-busy'); btn.innerHTML = html; btn.style.minWidth = '';
    FS.icons(btn);
  }

  /* svg ring markup (r=52 viewBox 120) */
  const ring = (pct, cls = '') => {
    const C = 2 * Math.PI * 52;
    return `<svg class="cp-ring ${cls}" viewBox="0 0 120 120" aria-hidden="true"><circle class="trk" cx="60" cy="60" r="52"/><circle class="val" cx="60" cy="60" r="52" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - pct / 100)).toFixed(1)}"/></svg>`;
  };
  const setRing = (svg, pct) => { const c = svg && svg.querySelector('.val'); if (!c) return; const C = 2 * Math.PI * 52; c.style.strokeDashoffset = (C * (1 - pct / 100)).toFixed(1); };

  /* download helper */
  function download(name, text, type = 'text/csv') {
    const blob = new Blob([text], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 400);
  }
  const csv = (rows) => rows.map((r) => r.map((c) => { const s = String(c == null ? '' : c); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\n');

  /* fly an element out, then remove */
  function flyOut(el, dir = 1) {
    return new Promise((res) => {
      if (!el) return res();
      el.classList.add(dir > 0 ? 'cp-fly' : 'cp-fly-l');
      setTimeout(() => { el.remove(); res(); }, reduce() ? 10 : 460);
    });
  }

  const KEYS = {}; // route -> keydown handler
  document.addEventListener('keydown', (e) => {
    const sec = document.querySelector('.screen.active.cp-screen');
    if (!sec) return;
    const h = KEYS[sec.dataset.route];
    if (h) h(e, sec);
  });

  const CP = { $, $$, D, esc, ini, av, rs, fmt, sleep, rng, clamp, MON, DOW, TODAY, dstr, addDays, iso, parseIso, ic, active, typing, overlayOpen, tick, celebrate, confirmBox, busy, ring, setRing, download, csv, flyOut, KEYS, tone, hash, reduce };

  /* =====================================================================
     1. APPROVALS INBOX  (app/approvals)
     ===================================================================== */
  (function approvals() {
    const ROUTE = 'app/approvals';
    const T = {
      jv: { label: 'Vouchers', one: 'Journal / BPV', icon: 'book-open-check', tile: 'green', route: 'app/accounting/vouchers/view' },
      po: { label: 'Purchase orders', one: 'Purchase order', icon: 'shopping-cart', tile: 'blue', route: 'app/purchases/orders' },
      bill: { label: 'Vendor bills', one: 'Vendor bill', icon: 'receipt-text', tile: 'orange', route: 'app/purchases/bills' },
      pay: { label: 'Payments', one: 'Vendor payment', icon: 'banknote', tile: 'lime', route: 'app/payables/payments' },
      leave: { label: 'Leave', one: 'Leave request', icon: 'calendar-days', tile: 'violet', route: 'app/hr/leave/requests' },
      exp: { label: 'Expense claims', one: 'Expense claim', icon: 'wallet', tile: 'orange', route: 'app/cash/expenses' },
      payroll: { label: 'Payroll', one: 'Payroll run', icon: 'users', tile: 'green', route: 'app/hr/payroll/run' },
      credit: { label: 'Credit overrides', one: 'Credit override', icon: 'shield-alert', tile: 'red', route: 'app/receivables/credit' },
    };
    const chain = (...steps) => steps.map(([name, role, state, at]) => ({ name, role, state, at }));
    const ITEMS = [
      { id: 'a1', type: 'payroll', doc: 'PR-2026-09', title: 'September 2026 payroll, 148 employees', who: 'Ayesha Noor', amount: 21485600, age: 26, sla: 4, big: true,
        lines: [['Gross salaries', 24860000], ['EOBI & PESSI (employer)', 612400], ['Income tax withheld', -2148900], ['Loan recoveries', -1837900]],
        chain: chain(['Ayesha Noor', 'HR Manager', 'done', '30 Sep, 10:12'], ['Sana Javed', 'Finance Manager', 'you'], ['Ahmed Raza', 'CEO', 'wait']),
        comments: [['Ayesha Noor', 'Overtime for warehouse staff is included this month (Rs 386,400). Attendance locked on 29 Sep.', '30 Sep, 10:14']] },
      { id: 'a2', type: 'jv', doc: 'JV-2026-000318', title: 'Accrued audit fee, Q1 FY27 (over Rs 500k limit)', who: 'Hira Ali', amount: 850000, age: 52, sla: -4,
        lines: [['Dr 5310-02 Audit & professional fees', 850000], ['Cr 2140-01 Accrued expenses', -850000]],
        chain: chain(['Hira Ali', 'Senior Accountant', 'done', '29 Sep, 16:40'], ['Sana Javed', 'Finance Manager', 'you']),
        comments: [['Hira Ali', 'As per engagement letter with Yousuf Adil, 50% to be billed in October.', '29 Sep, 16:41']] },
      { id: 'a3', type: 'po', doc: 'PO-2026-000214', title: 'Habib Packaging, 12,000 cartons 5-ply', who: 'Usman Ali', amount: 1197000, age: 8, sla: 16,
        lines: [['PK-1001 Corrugated Carton 5-Ply × 12,000', 1020000], ['GST 18% (adjustable)', 177000]],
        chain: chain(['Usman Ali', 'Procurement Lead', 'done', 'Today, 08:05'], ['Faisal Qureshi', 'Operations Head', 'done', 'Today, 09:20'], ['Sana Javed', 'Finance Manager', 'you']),
        comments: [] },
      { id: 'a4', type: 'bill', doc: 'BILL-2026-000488', title: 'Siemens Pakistan, switchgear AMC', who: 'Hira Ali', amount: 642800, age: 30, sla: 2,
        lines: [['Annual maintenance contract FY27', 560000], ['Sales tax on services (PRA 16%)', 89600], ['WHT 153(1)(b) withheld', -6800]],
        chain: chain(['Hira Ali', 'Senior Accountant', 'done', '30 Sep, 11:02'], ['Sana Javed', 'Finance Manager', 'you']),
        comments: [] },
      { id: 'a5', type: 'pay', doc: 'BPV-2026-000771', title: 'Shan Foods, settle 3 bills via IBFT', who: 'Hira Ali', amount: 365000, age: 4, sla: 20,
        lines: [['BILL-2026-000452', 148000], ['BILL-2026-000460', 121000], ['BILL-2026-000466', 96000]],
        chain: chain(['Hira Ali', 'Senior Accountant', 'done', 'Today, 10:31'], ['Sana Javed', 'Finance Manager', 'you'], ['Ahmed Raza', 'CEO (dual sign)', 'wait']),
        comments: [] },
      { id: 'a6', type: 'credit', doc: 'CO-2026-0041', title: 'City Mart Superstores, SO over limit by Rs 355,850', who: 'Zainab Raza', amount: 486750, age: 3, sla: 1,
        lines: [['Credit limit', 1500000], ['Current balance', 1369100], ['This order (SO-2026-000932)', 486750]],
        chain: chain(['Zainab Raza', 'Sales Manager', 'done', 'Today, 11:10'], ['Sana Javed', 'Finance Manager', 'you']),
        comments: [['Zainab Raza', 'Ramzan stock-up order. They cleared Rs 400k by cheque yesterday; it is in clearing.', 'Today, 11:12']] },
      { id: 'a7', type: 'leave', doc: 'LV-2026-0193', title: 'Bilal Khan, annual leave 6–10 Oct (5 days)', who: 'Bilal Khan', amount: 0, age: 20, sla: 6,
        lines: [['Annual leave balance', '14 days'], ['Requested', '5 days'], ['Cover', 'Imran Siddiqui']],
        chain: chain(['Bilal Khan', 'Sales Executive', 'done', '30 Sep, 15:30'], ['Zainab Raza', 'Sales Manager', 'done', '30 Sep, 18:02'], ['Sana Javed', 'Delegate for HR', 'you']),
        comments: [] },
      { id: 'a8', type: 'exp', doc: 'EXP-2026-0412', title: 'Kashif Ali, Faisalabad depot fuel & tolls', who: 'Kashif Ali', amount: 18450, age: 75, sla: -27,
        lines: [['Fuel, Shell Canal Road (3 receipts)', 14200], ['M-4 motorway tolls', 2650], ['Loading labour', 1600]],
        chain: chain(['Kashif Ali', 'Warehouse Supervisor', 'done', '28 Sep, 09:00'], ['Sana Javed', 'Finance Manager', 'you']),
        comments: [] },
      { id: 'a9', type: 'jv', doc: 'BPV-2026-000769', title: 'LESCO September bill, Lahore HQ', who: 'Hira Ali', amount: 297400, age: 12, sla: 12,
        lines: [['Dr 5220-01 Electricity', 251300], ['Dr 1360-02 Advance tax 235', 46100], ['Cr 1120-02 HBL 8721', -297400]],
        chain: chain(['Hira Ali', 'Senior Accountant', 'done', 'Today, 07:58'], ['Sana Javed', 'Finance Manager', 'you']),
        comments: [] },
      { id: 'a10', type: 'po', doc: 'PO-2026-000216', title: 'Daraz Business, 20 Logitech M185 mice', who: 'Mehwish Tariq', amount: 50740, age: 2, sla: 22,
        lines: [['IT-6001 Logitech Wireless Mouse × 20', 43000], ['GST 18%', 7740]],
        chain: chain(['Mehwish Tariq', 'IT Lead', 'done', 'Today, 12:01'], ['Sana Javed', 'Finance Manager', 'you']),
        comments: [] },
      { id: 'a11', type: 'exp', doc: 'EXP-2026-0415', title: 'Zainab Raza, Karachi client dinner (Engro)', who: 'Zainab Raza', amount: 27600, age: 40, sla: -16,
        lines: [['Kolachi restaurant, 6 guests', 24300], ['Careem rides', 3300]],
        chain: chain(['Zainab Raza', 'Sales Manager', 'done', '29 Sep, 21:30'], ['Sana Javed', 'Finance Manager', 'you']),
        comments: [] },
      { id: 'a12', type: 'leave', doc: 'LV-2026-0197', title: 'Ali Haider, casual leave 2 Oct (1 day)', who: 'Ali Haider', amount: 0, age: 5, sla: 19,
        lines: [['Casual leave balance', '6 days'], ['Requested', '1 day'], ['Reason', 'Family function, Rawalpindi']],
        chain: chain(['Ali Haider', 'Delivery Officer', 'done', 'Today, 09:12'], ['Sana Javed', 'Delegate for HR', 'you']),
        comments: [] },
    ];
    let items = ITEMS.map((x) => ({ ...x, comments: x.comments.slice() }));
    let filter = 'all', view = 'cards', focus = 0, approvedToday = 7;
    const sel = new Set();
    let sec;

    const ageTxt = (h) => (h < 24 ? h + 'h' : Math.floor(h / 24) + 'd ' + (h % 24) + 'h');
    const slaChip = (s) => s < 0 ? `<span class="badge danger dot">SLA breached ${ageTxt(-s)}</span>` : s <= 4 ? `<span class="badge warn dot">Due in ${s}h</span>` : `<span class="badge good dot">${s}h left</span>`;
    const amt = (it) => it.amount ? FS.money(it.amount, { dec: 0 }) : '<span class="cp-nil">No amount</span>';
    const visible = () => items.filter((x) => filter === 'all' || x.type === filter);

    function card(it, i) {
      const t = T[it.type];
      return `<article class="cp-ap-card${it.big ? ' big' : ''}${sel.has(it.id) ? ' sel' : ''}" data-id="${it.id}" tabindex="0" style="--i:${i}">
        <label class="cp-ap-ck" title="Select (X)"><input type="checkbox" ${sel.has(it.id) ? 'checked' : ''}><i>${ic('check')}</i></label>
        <div class="cp-ap-top"><span class="icon-tile ${t.tile}">${ic(t.icon)}</span><div><small>${t.one}</small><b>${it.doc}</b></div></div>
        <p class="cp-ap-title">${esc(it.title)}</p>
        ${it.big ? `<div class="cp-ap-mini">${it.lines.slice(0, 3).map((l) => `<span><em>${l[0]}</em><b>${typeof l[1] === 'number' ? rs(l[1]) : l[1]}</b></span>`).join('')}</div>` : ''}
        ${it.big ? `<div class="cp-ap-chain">${it.chain.map((c) => `<span class="${c.state}">${av(c.name, 'xs')}<em>${c.name.split(' ')[0]}${c.state === 'you' ? ' (you)' : ''}</em>${c.state === 'done' ? ic('check') : ''}</span>`).join(ic('chevron-right'))}</div>` : ''}
        <div class="cp-ap-amtrow"><div class="cp-ap-amt">${amt(it)}</div>${slaChip(it.sla)}</div>
        <div class="cp-ap-foot">${av(it.who, 'xs')}<span>${esc(it.who)}<small>${ageTxt(it.age)} ago</small></span><span class="spacer"></span>
          <button class="cp-ap-q rej" data-act="reject" title="Reject (R)">${ic('x')}</button><button class="cp-ap-q ok" data-act="approve" title="Approve (A)">${ic('check')}</button></div>
      </article>`;
    }
    function row(it) {
      const t = T[it.type];
      return `<tr data-id="${it.id}" class="${sel.has(it.id) ? 'selected' : ''}"><td><input type="checkbox" ${sel.has(it.id) ? 'checked' : ''}></td>
        <td><div class="cell-user"><span class="icon-tile sm ${t.tile}">${ic(t.icon)}</span><div><b>${it.doc}</b><small>${t.one}</small></div></div></td>
        <td class="cp-wrap">${esc(it.title)}</td><td><div class="cell-user">${av(it.who, 'xs')}<span>${esc(it.who)}</span></div></td>
        <td class="num">${it.amount ? fmt(it.amount) : '<span class="zero">—</span>'}</td><td>${ageTxt(it.age)}</td><td>${slaChip(it.sla)}</td>
        <td class="actions"><div class="row cp-nowrap"><button class="btn ghost sm" data-act="reject">Reject</button><button class="btn primary sm" data-act="approve">${ic('check')}Approve</button></div></td></tr>`;
    }

    function shell() {
      return `
      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-top"><span>Waiting on you</span><span class="icon-well">${ic('inbox')}</span></div><strong id="cp-ap-k1">${items.length}</strong><small id="cp-ap-k1s">${items.filter((x) => x.sla < 0).length} past SLA</small></div>
        <div class="kpi blue"><div class="kpi-top"><span>Value pending</span><span class="icon-well">${ic('coins')}</span></div><strong id="cp-ap-k2">${rs(items.reduce((s, x) => s + x.amount, 0))}</strong><small>Across ${Object.keys(T).length} document types</small></div>
        <div class="kpi red"><div class="kpi-top"><span>SLA breached</span><span class="icon-well">${ic('alarm-clock')}</span></div><strong id="cp-ap-k3">${items.filter((x) => x.sla < 0).length}</strong><small class="down">Oldest ${ageTxt(Math.max(...items.map((x) => x.age)))}</small></div>
        <div class="kpi yellow"><div class="kpi-top"><span>Approved today</span><span class="icon-well">${ic('circle-check')}</span></div><strong id="cp-ap-k4">${approvedToday}</strong><small class="up">Avg turnaround 3h 40m</small></div>
      </div>
      <div class="toolbar cp-ap-bar">
        <div class="chips cp-chips" id="cp-ap-chips"></div>
        <span class="spacer"></span>
        <label class="cp-ap-all"><input type="checkbox" id="cp-ap-selall"> Select all</label>
        <span class="cp-kbd-hint" title="Keyboard shortcuts"><kbd>J</kbd><kbd>K</kbd> move <kbd>A</kbd> approve <kbd>R</kbd> reject <kbd>X</kbd> select <kbd>↵</kbd> open</span>
      </div>
      <div id="cp-ap-body"></div>
      <div class="cp-ap-bulk" id="cp-ap-bulk"><div class="cp-ap-bulk-in"><b><span id="cp-ap-bn">0</span> selected</b><small id="cp-ap-bv">Rs 0</small><div class="progress lime" id="cp-ap-bp"><i style="width:0"></i></div><span class="spacer"></span>
        <button class="btn ghost sm" id="cp-ap-bclear">Clear</button><button class="btn danger sm" id="cp-ap-brej">${ic('x')}Reject</button><button class="btn lime sm" id="cp-ap-bok">${ic('check-check')}Bulk approve</button></div></div>`;
    }

    function renderChips() {
      const counts = {}; items.forEach((x) => (counts[x.type] = (counts[x.type] || 0) + 1));
      const keys = ['all', ...Object.keys(T).filter((k) => counts[k])];
      if (filter !== 'all' && !counts[filter]) filter = 'all';
      $('#cp-ap-chips', sec).innerHTML = keys.map((k) => `<button class="${k === filter ? 'active' : ''}" data-f="${k}">${k === 'all' ? 'All' : ic(T[k].icon) + T[k].label}<i>${k === 'all' ? items.length : counts[k]}</i></button>`).join('');
      FS.icons($('#cp-ap-chips', sec));
    }
    function renderBody() {
      const body = $('#cp-ap-body', sec), vis = visible();
      if (!items.length) {
        body.innerHTML = `<div class="panel cp-ap-zero"><div class="cp-zero-art">${ic('party-popper')}</div><h3>Inbox zero</h3><p>Nothing is waiting on you. Approvals routed to you will land here, with an alert on WhatsApp for anything urgent.</p><div class="row cp-center"><a class="btn secondary" href="#/app/activity">${ic('messages-square')}Activity feed</a><a class="btn primary" href="#/app/dashboard">${ic('layout-dashboard')}Back to dashboard</a></div></div>`;
      } else if (view === 'cards') {
        body.innerHTML = `<div class="cp-ap-grid">${vis.map(card).join('')}</div>`;
      } else {
        body.innerHTML = `<div class="panel flush"><div class="table-wrap"><table class="tbl cp-ap-tbl" data-plain><thead><tr><th></th><th>Document</th><th>Details</th><th>Requested by</th><th class="num">Amount (Rs)</th><th>Age</th><th>SLA</th><th></th></tr></thead><tbody>${vis.map(row).join('')}</tbody></table></div></div>`;
      }
      FS.icons(body);
      focus = clamp(focus, 0, Math.max(0, vis.length - 1));
      paintFocus(false);
    }
    function nodes() { return $$('[data-id]', $('#cp-ap-body', sec)); }
    function paintFocus(scroll = true) {
      const ns = nodes();
      ns.forEach((n, i) => n.classList.toggle('cp-focus', i === focus));
      if (scroll && ns[focus]) ns[focus].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    function kpis() {
      tick($('#cp-ap-k1', sec), items.length, { local: true });
      tick($('#cp-ap-k2', sec), items.reduce((s, x) => s + x.amount, 0), { prefix: 'Rs ', dec: 0 });
      tick($('#cp-ap-k3', sec), items.filter((x) => x.sla < 0).length, { local: true });
      tick($('#cp-ap-k4', sec), approvedToday, { local: true });
      $('#cp-ap-k1s', sec).textContent = `${items.filter((x) => x.sla < 0).length} past SLA`;
      const sb = document.querySelector('.sb-leaf[href="#/app/approvals"] .sb-count, a[href="#/app/approvals"] .sb-count');
      if (sb) sb.textContent = items.length || '';
    }
    function bulkBar() {
      const n = sel.size, v = items.filter((x) => sel.has(x.id)).reduce((s, x) => s + x.amount, 0);
      $('#cp-ap-bn', sec).textContent = n;
      $('#cp-ap-bv', sec).textContent = 'Total ' + rs(v);
      $('#cp-ap-bulk', sec).classList.toggle('on', n > 0);
      const all = $('#cp-ap-selall', sec), vis = visible();
      all.checked = vis.length > 0 && vis.every((x) => sel.has(x.id));
      all.indeterminate = !all.checked && vis.some((x) => sel.has(x.id));
    }
    function toggleSel(id, on) {
      if (on == null) on = !sel.has(id);
      on ? sel.add(id) : sel.delete(id);
      nodes().filter((n) => n.dataset.id === id).forEach((n) => { n.classList.toggle(n.tagName === 'TR' ? 'selected' : 'sel', on); const c = n.querySelector('input[type=checkbox]'); if (c) c.checked = on; });
      bulkBar();
    }

    /* resolve = remove from queue with animation */
    async function resolve(ids, verb, { quiet = false, stagger = 70 } = {}) {
      const ns = nodes().filter((n) => ids.includes(n.dataset.id));
      const ps = ns.map((n, i) => new Promise((r) => setTimeout(() => { n.classList.add(verb === 'approved' ? 'cp-ok-flash' : 'cp-rej-flash'); flyOut(n, verb === 'approved' ? 1 : -1).then(r); }, i * stagger)));
      await Promise.all(ps);
      const gone = items.filter((x) => ids.includes(x.id));
      items = items.filter((x) => !ids.includes(x.id));
      ids.forEach((id) => sel.delete(id));
      if (verb === 'approved') approvedToday += ids.length;
      renderChips(); kpis(); bulkBar();
      if (!visible().length || !items.length) renderBody();
      else { focus = clamp(focus, 0, visible().length - 1); paintFocus(false); }
      if (!quiet && gone.length === 1) {
        const g = gone[0];
        FS.toast(`${g.doc} ${verb}`, { tone: verb === 'approved' ? 'good' : verb === 'rejected' ? 'danger' : 'info', undo: () => { items.push(g); items.sort((a, b) => ITEMS.findIndex((x) => x.id === a.id) - ITEMS.findIndex((x) => x.id === b.id)); if (verb === 'approved') approvedToday--; renderChips(); renderBody(); kpis(); } });
      }
      if (!items.length) setTimeout(() => celebrate($('#cp-ap-body', sec), 'Inbox zero'), 200);
      return gone;
    }
    const byId = (id) => items.find((x) => x.id === id);

    function approve(id) { resolve([id], 'approved'); }
    function reject(id) { openDetail(id, 'reject'); }

    async function bulkApprove() {
      const ids = visible().filter((x) => sel.has(x.id)).map((x) => x.id).concat(items.filter((x) => sel.has(x.id) && !visible().includes(x)).map((x) => x.id));
      if (!ids.length) return;
      const btn = $('#cp-ap-bok', sec), bar = $('#cp-ap-bp i', sec);
      btn.disabled = true; $('#cp-ap-bulk', sec).classList.add('working');
      for (let i = 0; i < ids.length; i++) {
        $('#cp-ap-bn', sec).textContent = `Approving ${i + 1}/${ids.length}`;
        bar.style.width = ((i + 1) / ids.length) * 100 + '%';
        await sleep(Math.max(140, 900 / ids.length));
      }
      await sleep(180);
      await resolve(ids, 'approved', { quiet: true, stagger: 60 });
      $('#cp-ap-bulk', sec).classList.remove('working'); btn.disabled = false; bar.style.width = '0';
      celebrate(btn, `${ids.length} approved`);
      FS.toast(`${ids.length} documents approved and routed to the next approver`, { tone: 'good' });
    }
    async function bulkReject() {
      const ids = [...sel];
      if (!ids.length) return;
      const ok = await confirmBox({ title: `Reject ${ids.length} documents?`, text: 'Each requester gets the reason "Rejected in bulk, please resubmit with backup".', okLabel: 'Reject all', danger: true });
      if (!ok) return;
      await resolve(ids, 'rejected', { quiet: true });
      FS.toast(`${ids.length} documents rejected`, { tone: 'danger' });
    }

    /* ---------- detail drawer ---------- */
    function openDetail(id, mode) {
      const it = byId(id); if (!it) return;
      const t = T[it.type];
      const total = it.lines.reduce((s, l) => s + (typeof l[1] === 'number' ? l[1] : 0), 0);
      const chainHtml = it.chain.map((c, i) => `<li class="cp-step ${c.state}" style="--i:${i}"><span class="cp-step-dot">${c.state === 'done' ? ic('check') : c.state === 'you' ? ic('hourglass') : ic('circle-dashed')}</span>${av(c.name, 'xs')}<div><b>${c.name}${c.state === 'you' ? ' <em>(you)</em>' : ''}</b><small>${c.role} · ${c.state === 'done' ? 'Approved ' + c.at : c.state === 'you' ? 'Waiting on you' : 'Pending after you'}</small></div></li>`).join('');
      const html = `
        <div class="cp-dr-head"><span class="icon-tile ${t.tile}">${ic(t.icon)}</span><div><small>${t.one} · ${it.doc}</small><b>${esc(it.title)}</b></div>${slaChip(it.sla)}</div>
        <div class="cp-paper">
          <div class="cp-paper-h"><div><b>Al-Noor Enterprises (Pvt) Ltd</b><small>NTN 4271839-6 · Lahore</small></div><div class="right"><b>${it.doc}</b><small>Raised by ${esc(it.who)}</small></div></div>
          <table class="cp-paper-t">${it.lines.map((l) => `<tr><td>${esc(l[0])}</td><td class="num">${typeof l[1] === 'number' ? (l[1] < 0 ? '(' + fmt(-l[1]) + ')' : fmt(l[1])) : esc(l[1])}</td></tr>`).join('')}
          ${it.amount ? `<tr class="tot"><td>Amount for approval</td><td class="num">${rs(it.amount)}</td></tr>` : ''}</table>
          <div class="cp-paper-f"><span>${ic('paperclip')}${it.type === 'leave' ? 'Leave calendar attached' : '2 attachments'}</span><a class="link" href="#/${t.route}">Open full document ${ic('arrow-up-right')}</a></div>
        </div>
        <h4 class="cp-h4">Approval chain</h4>
        <ol class="cp-chain">${chainHtml}</ol>
        <div class="cp-dr-act" id="cp-ap-act" hidden></div>
        <h4 class="cp-h4">Comments <span class="badge neutral" id="cp-ap-cc">${it.comments.length}</span></h4>
        <div class="cp-thread" id="cp-ap-thread">${it.comments.map(cm).join('') || '<p class="muted small cp-empty-c">No comments yet. Ask a question before approving.</p>'}</div>
        <div class="cp-comment-in"><span class="avatar xs lime">SJ</span><input id="cp-ap-cin" placeholder="Write a comment, @ to mention…"><button class="btn primary sm icon" id="cp-ap-csend" title="Send">${ic('send')}</button></div>`;
      const foot = `<button class="btn ghost" data-a="delegate">${ic('user-plus')}Delegate</button><button class="btn secondary" data-a="changes">${ic('message-square-reply')}Request changes</button><span class="spacer"></span><button class="btn danger" data-a="reject">${ic('x')}Reject</button><button class="btn primary" data-a="approve">${ic('check')}Approve</button>`;
      const dr = FS.drawer({ title: t.one, subtitle: `${esc(it.who)} · ${ageTxt(it.age)} ago${total ? ' · ' + rs(Math.abs(it.amount || total)) : ''}`, html, foot, wide: true });
      dr.classList.add('cp-ap-drawer');
      const close = () => FS.closeOverlay(dr.closest('.overlay'));
      const act = () => $('#cp-ap-act', dr);
      const reasonBox = (kind) => {
        const a = act(); a.hidden = false;
        const isRej = kind === 'reject';
        a.className = 'cp-dr-act ' + (isRej ? 'rej' : 'chg');
        a.innerHTML = `<b>${isRej ? 'Reason for rejection' : 'What needs to change?'}</b><div class="cp-reasons">${(isRej ? ['Missing supporting documents', 'Over budget', 'Wrong account / cost centre', 'Duplicate request'] : ['Attach vendor quotation', 'Split across cost centres', 'Correct the tax code', 'Add narration']).map((r) => `<button>${r}</button>`).join('')}</div><textarea rows="2" placeholder="Add a note for ${esc(it.who)}…"></textarea><div class="row"><span class="spacer"></span><button class="btn ghost sm" data-x>Cancel</button><button class="btn ${isRej ? 'danger solid' : 'primary'} sm" data-go>${isRej ? 'Confirm reject' : 'Send back'}</button></div>`;
        a.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        const ta = $('textarea', a); setTimeout(() => ta.focus(), 50);
        a.onclick = (e) => {
          const r = e.target.closest('.cp-reasons button'); if (r) { ta.value = r.textContent; $$('.cp-reasons button', a).forEach((b) => b.classList.toggle('on', b === r)); return; }
          if (e.target.closest('[data-x]')) { a.hidden = true; return; }
          if (e.target.closest('[data-go]')) {
            if (!ta.value.trim()) { ta.classList.add('cp-shake'); setTimeout(() => ta.classList.remove('cp-shake'), 400); ta.focus(); return; }
            close(); setTimeout(() => resolve([it.id], isRej ? 'rejected' : 'sent back for changes'), 220);
          }
        };
      };
      dr.closest('.overlay').addEventListener('click', (e) => {
        const b = e.target.closest('.modal-foot [data-a]'); if (!b) return;
        const a = b.dataset.a;
        if (a === 'approve') { close(); setTimeout(() => approve(it.id), 220); }
        if (a === 'reject') reasonBox('reject');
        if (a === 'changes') reasonBox('changes');
        if (a === 'delegate') {
          FS.menu(b, (D.employees || []).filter((p) => !['Sana Javed', it.who].includes(p.name)).slice(0, 7).map((p) => ({ label: `${p.name} · ${p.role}`, icon: 'user-round', onClick: () => { close(); setTimeout(() => { resolve([it.id], 'delegated', { quiet: true }); FS.toast(`${it.doc} delegated to ${p.name}`, { tone: 'info' }); }, 220); } })));
        }
      });
      const send = () => {
        const inp = $('#cp-ap-cin', dr); const v = inp.value.trim(); if (!v) return;
        const c = ['Sana Javed', v, 'Just now'];
        it.comments.push(c);
        const th = $('#cp-ap-thread', dr); const em = $('.cp-empty-c', th); if (em) em.remove();
        th.insertAdjacentHTML('beforeend', cm(c)); th.lastElementChild.classList.add('cp-new');
        $('#cp-ap-cc', dr).textContent = it.comments.length; inp.value = '';
      };
      $('#cp-ap-csend', dr).onclick = send;
      $('#cp-ap-cin', dr).addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
      FS.icons(dr);
      if (mode === 'reject') setTimeout(() => reasonBox('reject'), 300);
    }
    const cm = (c) => `<div class="cp-cm">${av(c[0], 'xs')}<div><b>${c[0]}</b><small>${c[2]}</small><p>${esc(c[1]).replace(/@([A-Z][a-z]+ [A-Z][a-z]+)/g, '<mark>@$1</mark>')}</p></div></div>`;

    function mount(s) {
      sec = s;
      sec.insertAdjacentHTML('beforeend', shell());
      renderChips(); renderBody(); bulkBar();
      $('#cp-ap-view').addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (!b || b.dataset.v === view) return; view = b.dataset.v; renderBody(); });
      $('#cp-ap-chips', sec).addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (!b) return; filter = b.dataset.f; focus = 0; renderChips(); renderBody(); bulkBar(); });
      $('#cp-ap-selall', sec).addEventListener('change', (e) => { visible().forEach((x) => toggleSel(x.id, e.target.checked)); });
      $('#cp-ap-bok', sec).onclick = bulkApprove;
      $('#cp-ap-brej', sec).onclick = bulkReject;
      $('#cp-ap-bclear', sec).onclick = () => { [...sel].forEach((id) => toggleSel(id, false)); };
      $('#cp-ap-body', sec).addEventListener('click', (e) => {
        const n = e.target.closest('[data-id]'); if (!n) return;
        const id = n.dataset.id;
        focus = nodes().indexOf(n); paintFocus(false);
        if (e.target.closest('.cp-ap-ck, input[type=checkbox]')) { if (e.target.matches('input')) toggleSel(id, e.target.checked); return; }
        const a = e.target.closest('[data-act]');
        if (a) { e.stopPropagation(); a.dataset.act === 'approve' ? approve(id) : reject(id); return; }
        if (e.target.closest('a')) return;
        openDetail(id);
      });
      $('#cp-ap-body', sec).addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('.cp-ap-card')) openDetail(e.target.dataset.id); });
    }
    KEYS[ROUTE] = (e) => {
      if (typing(e) || overlayOpen() || e.ctrlKey || e.metaKey || e.altKey) return;
      const vis = visible(); if (!vis.length) return;
      const k = e.key.toLowerCase();
      const cur = nodes()[focus];
      if (k === 'j' || e.key === 'ArrowDown') { focus = clamp(focus + 1, 0, vis.length - 1); paintFocus(); e.preventDefault(); }
      else if (k === 'k' || e.key === 'ArrowUp') { focus = clamp(focus - 1, 0, vis.length - 1); paintFocus(); e.preventDefault(); }
      else if (k === 'a' && cur) { e.preventDefault(); approve(cur.dataset.id); }
      else if (k === 'r' && cur) { e.preventDefault(); reject(cur.dataset.id); }
      else if (k === 'x' && cur) { e.preventDefault(); toggleSel(cur.dataset.id); }
      else if (e.key === 'Enter' && cur && !e.target.closest('.cp-ap-card')) { e.preventDefault(); openDetail(cur.dataset.id); }
    };
    FS.onEnter(ROUTE, (s, r, first) => { if (first) mount(s); else paintFocus(false); });
  })();

  /* =====================================================================
     2. SETUP GUIDE  (app/setup)
     ===================================================================== */
  (function setup() {
    const ROUTE = 'app/setup';
    const STEPS = [
      { k: 'profile', g: 'Basics', t: 'Company profile', w: 10, min: 3, icon: 'building-2', done: true, r: 'app/settings', cta: 'Review profile',
        d: 'Legal name, NTN, STRN, registered address, logo and financial year (July to June). These print on every invoice and FBR return.', tips: ['NTN 4271839-6 and STRN verified', 'Logo uploaded for invoices', 'FY 2026-27 starts 01 Jul 2026'] },
      { k: 'coa', g: 'Basics', t: 'Chart of accounts', w: 14, min: 10, icon: 'list-tree', done: true, r: 'app/accounting/coa', cta: 'Open chart of accounts',
        d: 'Start from the Pakistan trading template (412 accounts, IFRS for SMEs grouping) and tailor the expense heads to how you report.', tips: ['Trading & distribution template applied', 'Control accounts linked to AR / AP', 'Tax accounts mapped to FBR heads'] },
      { k: 'opening', g: 'Money', t: 'Opening balances', w: 14, min: 15, icon: 'scale', done: false, r: 'app/accounting/opening', cta: 'Enter opening balances',
        d: 'Bring in your trial balance as at 30 Jun 2026, plus open customer and vendor invoices so ageing is correct from day one.', tips: ['Trial balance must be in balance', 'Upload open invoices from Excel', 'Stock valued at weighted average'] },
      { k: 'items', g: 'Basics', t: 'Import items', w: 10, min: 8, icon: 'package', done: true, r: 'app/import', cta: 'Import items',
        d: 'Upload your item master with SKUs, barcodes, units, pack sizes, cost and selling price. Finsoft maps columns for you.', tips: ['16 items imported, 0 errors', 'Barcodes (UPC) captured', 'GST 18% defaulted'] },
      { k: 'bank', g: 'Money', t: 'Connect bank', w: 10, min: 5, icon: 'landmark', done: true, r: 'app/bank/accounts', cta: 'Manage bank accounts',
        d: 'Add Meezan, HBL, UBL and Alfalah accounts, then import statements or turn on rules to categorise routine lines automatically.', tips: ['4 bank accounts added', 'Statement import ready', 'Bank rules available'] },
      { k: 'tax', g: 'Compliance', t: 'Tax & FBR', w: 10, min: 7, icon: 'shield-check', done: false, r: 'app/tax/fbr', cta: 'Configure tax',
        d: 'Set sales tax rates, withholding sections (153, 149, 231A, 236) and connect FBR IRIS / POS integration for real-time invoice reporting.', tips: ['GST 18% & reduced rates', 'WHT sections & filer status', 'FBR POS integration key'] },
      { k: 'team', g: 'People', t: 'Invite team', w: 8, min: 4, icon: 'user-plus', done: true, r: 'app/settings/users', cta: 'Invite users',
        d: 'Invite your accountant, sales team and HR, and give each a role so they see only what they need. Approvals route by role.', tips: ['6 users active', 'Roles: Finance, Sales, HR, Warehouse', 'MFA enforced for finance'] },
      { k: 'invoice', g: 'Money', t: 'First invoice', w: 10, min: 3, icon: 'receipt-text', done: true, r: 'app/sales/invoices/new', cta: 'Create an invoice',
        d: 'Raise a sales tax invoice, share it on WhatsApp with a payment link and watch it flow into receivables and the ledger.', tips: ['INV-2026-000001 issued', 'Shared via WhatsApp', 'Posted to ledger'] },
      { k: 'payroll', g: 'People', t: 'Payroll setup', w: 14, min: 20, icon: 'wallet-cards', done: false, r: 'app/hr/payroll/structures', cta: 'Set up payroll',
        d: 'Define salary structures, EOBI / PESSI contributions and income tax slabs for FY 2026-27, then run a dry-run payroll.', tips: ['Salary structures & allowances', 'EOBI, PESSI & SESSI rates', 'Income tax slabs FY 2026-27'] },
    ];
    let steps = STEPS.map((s) => ({ ...s }));
    let open = 'opening', sec;
    const pct = () => steps.filter((s) => s.done).reduce((a, s) => a + s.w, 0);

    function stepHtml(s, i) {
      return `<div class="cp-su-step${s.done ? ' done' : ''}${open === s.k ? ' open' : ''}" data-k="${s.k}" style="--i:${i}">
        <button class="cp-su-row" aria-expanded="${open === s.k}">
          <span class="cp-su-check">${ic('check')}</span>
          <span class="cp-su-n">${String(i + 1).padStart(2, '0')}</span>
          <span class="cp-su-t"><b>${s.t}</b><small>${s.g} · ~${s.min} min · ${s.w}% of setup</small></span>
          <span class="badge ${s.done ? 'good' : 'neutral'} cp-su-state">${s.done ? 'Done' : 'To do'}</span>
          <span class="cp-su-chev">${ic('chevron-down')}</span>
        </button>
        <div class="cp-su-body"><div><div class="cp-su-in">
          <span class="icon-tile ${s.done ? '' : 'lime'}">${ic(s.icon)}</span>
          <div class="cp-su-txt"><p>${s.d}</p><ul>${s.tips.map((t) => `<li>${ic(s.done ? 'circle-check' : 'circle')}${t}</li>`).join('')}</ul>
            <div class="row cp-wrap-row"><a class="btn ${s.done ? 'secondary' : 'primary'} sm" href="#/${s.r}">${s.cta}${ic('arrow-right')}</a>
            <button class="btn ${s.done ? 'ghost' : 'lime'} sm" data-done>${s.done ? ic('undo-2') + 'Mark as not done' : ic('check') + 'Mark done'}</button></div></div>
        </div></div></div>
      </div>`;
    }
    function render() {
      const p = pct(), n = steps.filter((s) => s.done).length, next = steps.find((s) => !s.done);
      sec.insertAdjacentHTML('beforeend', `
      <div class="cp-su-hero">
        <div class="cp-su-ringwrap">${ring(p, 'big')}<div class="cp-su-pct"><b id="cp-su-p">${p}</b><span>%</span><small id="cp-su-n">${n} of ${steps.length} done</small></div></div>
        <div class="cp-su-hero-t">
          <span class="hero-eyebrow">Welcome aboard, Sana</span>
          <h2 id="cp-su-h">${p >= 100 ? 'You\'re all set. Al-Noor is fully live!' : 'Let\'s get Al-Noor ready to run'}</h2>
          <p id="cp-su-sub">${next ? `Next up: <b>${next.t}</b>, about ${next.min} minutes. Companies that finish setup in their first week close their first month 3× faster.` : 'Every step is complete. Your books, bank, tax and payroll are ready.'}</p>
          <div class="cp-su-seg" id="cp-su-seg">${steps.map((s) => `<i class="${s.done ? 'on' : ''}" style="flex:${s.w}" title="${s.t}"></i>`).join('')}</div>
          <div class="row cp-wrap-row"><button class="btn lime" id="cp-su-next">${ic('play')}${next ? 'Continue: ' + next.t : 'All done'}</button><span class="pill cp-su-pill">${ic('timer')}<span id="cp-su-left">${steps.filter((s) => !s.done).reduce((a, s) => a + s.min, 0)} min</span> left</span></div>
        </div>
      </div>
      <div class="split cp-su-split">
        <div class="panel cp-su-list">
          <div class="panel-head"><div><h3>Onboarding checklist</h3><p>Expand a step for details. Mark it done when you're happy with it.</p></div><div class="seg" id="cp-su-filter"><button class="active" data-f="all">All</button><button data-f="todo">To do</button><button data-f="done">Done</button></div></div>
          <div id="cp-su-steps">${steps.map(stepHtml).join('')}</div>
        </div>
        <div class="stack">
          <div class="cp-su-video" id="cp-su-video" role="button" tabindex="0">
            <div class="cp-su-thumb"><div class="cp-su-scr"><i></i><i></i><i></i><b></b><b></b><b></b></div><span class="cp-su-play">${ic('play')}</span><span class="cp-su-dur">2:04</span><div class="cp-su-prog"><i></i></div></div>
            <div class="cp-su-vt"><b>Watch a 2-min tour</b><small>Vouchers, invoices, bank & payroll in one quick walkthrough</small>
              <div class="cp-su-chaps"><span>0:00 Dashboard</span><span>0:38 Invoicing</span><span>1:12 Bank rules</span><span>1:40 Payroll</span></div></div>
          </div>
          <div class="panel cp-su-help">
            <div class="row"><span class="avatar lg c5">MK</span><div><b>Mariam Khalid</b><small class="muted">Your onboarding specialist · Finsoft</small><div class="cp-online"><i></i>Online now · replies in ~5 min</div></div></div>
            <p class="small muted">Stuck on opening balances or FBR integration? Book a free 30-minute screen-share, in English or Urdu.</p>
            <div class="grid-2 cp-g8"><button class="btn secondary sm" id="cp-su-wa">${ic('message-circle')}WhatsApp</button><button class="btn secondary sm" id="cp-su-call">${ic('phone')}Call</button></div>
            <button class="btn primary block" id="cp-su-book">${ic('calendar-plus')}Book a session</button>
          </div>
          <div class="panel cp-su-kb"><div class="panel-head"><div><h3>Popular guides</h3></div></div>
            <div class="list">${[['file-spreadsheet', 'Migrating from Tally or QuickBooks', '6 min read'], ['receipt', 'Sales tax invoices & FBR POS', '4 min read'], ['calculator', 'Payroll tax slabs FY 2026-27', '5 min read']].map((g) => `<div class="list-item"><span class="icon-well sm">${ic(g[0])}</span><div><b>${g[1]}</b><small>${g[2]}</small></div><span class="spacer"></span>${ic('chevron-right')}</div>`).join('')}</div>
          </div>
        </div>
      </div>`);
    }
    function update(celebrateIfDone) {
      const p = pct(), n = steps.filter((s) => s.done).length, next = steps.find((s) => !s.done);
      setRing($('.cp-su-ringwrap .cp-ring', sec), p);
      tick($('#cp-su-p', sec), p, { local: true, dur: 800 });
      $('#cp-su-n', sec).textContent = `${n} of ${steps.length} done`;
      $$('#cp-su-seg i', sec).forEach((x, i) => x.classList.toggle('on', steps[i].done));
      $('#cp-su-h', sec).textContent = p >= 100 ? 'You\'re all set. Al-Noor is fully live!' : 'Let\'s get Al-Noor ready to run';
      $('#cp-su-sub', sec).innerHTML = next ? `Next up: <b>${next.t}</b>, about ${next.min} minutes. Companies that finish setup in their first week close their first month 3× faster.` : 'Every step is complete. Your books, bank, tax and payroll are ready.';
      $('#cp-su-next', sec).innerHTML = ic(next ? 'play' : 'party-popper') + (next ? 'Continue: ' + next.t : 'All done, celebrate!');
      $('#cp-su-left', sec).textContent = steps.filter((s) => !s.done).reduce((a, s) => a + s.min, 0) + ' min';
      $('.cp-su-hero', sec).classList.toggle('complete', p >= 100);
      FS.icons($('.cp-su-hero', sec));
      if (p >= 100 && celebrateIfDone) {
        setTimeout(() => { celebrate($('.cp-su-ringwrap', sec), 'Setup complete!'); FS.toast('Setup complete. Welcome to Finsoft, Al-Noor Enterprises!', { tone: 'good' }); }, 650);
      }
    }
    function repaintStep(k) {
      const i = steps.findIndex((s) => s.k === k), el = $(`.cp-su-step[data-k="${k}"]`, sec);
      const tmp = document.createElement('div'); tmp.innerHTML = stepHtml(steps[i], i);
      const nu = tmp.firstElementChild; nu.style.animation = 'none';
      el.replaceWith(nu); FS.icons(nu);
      applyFilter();
    }
    let flt = 'all';
    function applyFilter() { $$('.cp-su-step', sec).forEach((el) => { const d = el.classList.contains('done'); el.hidden = (flt === 'todo' && d) || (flt === 'done' && !d); }); }
    function mount(s) {
      sec = s; render(); FS.icons(sec);
      const list = $('#cp-su-steps', sec);
      list.addEventListener('click', (e) => {
        const st = e.target.closest('.cp-su-step'); if (!st) return;
        const k = st.dataset.k, s2 = steps.find((x) => x.k === k);
        if (e.target.closest('[data-done]')) {
          s2.done = !s2.done;
          const was = st; was.classList.add('cp-su-pop');
          if (s2.done) { const nx = steps.find((x) => !x.done); open = nx ? nx.k : null; }
          setTimeout(() => {
            repaintStep(k);
            if (s2.done && open) { const o = $(`.cp-su-step[data-k="${open}"]`, sec); if (o) { o.classList.add('open'); $('.cp-su-row', o).setAttribute('aria-expanded', 'true'); } }
            $$('.cp-su-step', sec).forEach((x) => { if (x.dataset.k !== open) x.classList.remove('open'); });
            if (s2.done) { const done = $(`.cp-su-step[data-k="${k}"]`, sec); done.classList.add('cp-su-justdone'); }
          }, 220);
          update(s2.done);
          if (s2.done && pct() < 100) FS.toast(`${s2.t} marked done`, { tone: 'good', ms: 2400 });
          return;
        }
        if (e.target.closest('.cp-su-row')) {
          const isOpen = st.classList.contains('open');
          $$('.cp-su-step', sec).forEach((x) => { x.classList.remove('open'); $('.cp-su-row', x).setAttribute('aria-expanded', 'false'); });
          if (!isOpen) { st.classList.add('open'); $('.cp-su-row', st).setAttribute('aria-expanded', 'true'); open = k; } else open = null;
        }
      });
      $('#cp-su-filter', sec).addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (b) { flt = b.dataset.f; applyFilter(); } });
      $('#cp-su-next', sec).onclick = () => {
        const nx = steps.find((x) => !x.done);
        if (!nx) { celebrate($('.cp-su-ringwrap', sec), 'All done!'); return; }
        $$('.cp-su-step', sec).forEach((x) => x.classList.toggle('open', x.dataset.k === nx.k));
        open = nx.k; flt = 'all'; applyFilter();
        $(`.cp-su-step[data-k="${nx.k}"]`, sec).scrollIntoView({ behavior: 'smooth', block: 'center' });
      };
      $('#cp-su-reset').onclick = () => { steps = STEPS.map((x) => ({ ...x })); open = 'opening'; $('#cp-su-steps', sec).innerHTML = steps.map(stepHtml).join(''); FS.icons(sec); update(false); FS.toast('Demo progress reset', { tone: 'info', ms: 1800 }); };
      const vid = $('#cp-su-video', sec);
      const play = () => {
        if (vid.classList.contains('playing')) return;
        vid.classList.add('playing');
        FS.toast('Playing: Finsoft in 2 minutes', { tone: 'info', ms: 2000 });
        setTimeout(() => vid.classList.remove('playing'), reduce() ? 100 : 6200);
      };
      vid.onclick = play; vid.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); play(); } };
      $('#cp-su-wa', sec).onclick = () => FS.toast('Opening WhatsApp chat with Mariam (+92 300 0346 7638)', { tone: 'info' });
      $('#cp-su-call', sec).onclick = () => FS.toast('Calling Finsoft support: 042 111 346 763', { tone: 'info' });
      $('#cp-su-book', sec).onclick = async (e) => { await busy(e.currentTarget, 900, 'Booking…'); FS.toast('Session booked: Fri 02 Oct, 11:00 AM with Mariam Khalid', { tone: 'good' }); };
    }
    FS.onEnter(ROUTE, (s, r, first) => {
      if (first) mount(s);
      else { const rg = $('.cp-su-ringwrap .cp-ring .val', s); if (rg && !reduce()) { const v = rg.style.strokeDashoffset || rg.getAttribute('stroke-dashoffset'); rg.style.transition = 'none'; rg.style.strokeDashoffset = (2 * Math.PI * 52).toFixed(1); void rg.getBoundingClientRect(); rg.style.transition = ''; rg.style.strokeDashoffset = v; } }
    });
  })();

  /* =====================================================================
     3. DATA IMPORT WIZARD  (app/import)
     ===================================================================== */
  (function dataImport() {
    const ROUTE = 'app/import';
    const C = D.customers || [], V = D.vendors || [], I = D.items || [], E = D.employees || [];
    /* field defs: k, label, req, type (text|ntn|phone|num|email|code|cnic|date) */
    const ENT = {
      customers: { label: 'Customers', icon: 'users', tile: 'green', desc: 'Name, NTN, credit limit, opening balance', total: 248, route: 'app/customers', file: 'customers_alnoor_tally.xlsx',
        fields: [['name', 'Customer name', 1, 'text'], ['city', 'City', 0, 'text'], ['ntn', 'NTN', 0, 'ntn'], ['phone', 'Mobile / phone', 0, 'phone'], ['limit', 'Credit limit', 0, 'num'], ['ob', 'Opening balance', 0, 'num'], ['group', 'Customer group', 0, 'text']],
        src: [['Party Name', 'name', 99], ['Town', 'city', 81], ['NTN No.', 'ntn', 96], ['Contact #', 'phone', 74], ['Cr. Limit', 'limit', 88], ['Op. Bal (Rs)', 'ob', 92], ['Category', 'group', 63], ['Remarks', null, 0]],
        rows: () => C.slice(0, 9).map((c) => [c.name, c.city, c.ntn === '—' ? '' : c.ntn, c.phone === '—' ? '' : c.phone, c.limit, c.balance, c.group, '']) },
      vendors: { label: 'Vendors', icon: 'truck', tile: 'orange', desc: 'Suppliers with NTN, filer status, payables', total: 96, route: 'app/vendors', file: 'vendors_master.csv',
        fields: [['name', 'Vendor name', 1, 'text'], ['city', 'City', 0, 'text'], ['ntn', 'NTN', 1, 'ntn'], ['filer', 'ATL filer status', 0, 'text'], ['ob', 'Opening payable', 0, 'num']],
        src: [['Supplier', 'name', 98], ['City', 'city', 100], ['NTN', 'ntn', 100], ['Filer?', 'filer', 71], ['Balance', 'ob', 84]],
        rows: () => V.map((v) => [v.name, v.city, v.ntn === '—' ? '' : v.ntn, v.filer ? 'Active' : 'Inactive', v.balance]) },
      items: { label: 'Items', icon: 'package', tile: 'blue', desc: 'SKUs, barcodes, units, cost & price', total: 1362, route: 'app/inventory/items', file: 'item_master_sep26.xlsx',
        fields: [['sku', 'SKU', 1, 'code'], ['name', 'Item name', 1, 'text'], ['unit', 'Unit', 1, 'text'], ['cost', 'Cost price', 0, 'num'], ['price', 'Sale price', 1, 'num'], ['gst', 'GST %', 0, 'num']],
        src: [['Item Code', 'sku', 97], ['Description', 'name', 90], ['UOM', 'unit', 86], ['Purchase Rate', 'cost', 82], ['Sale Rate', 'price', 85], ['Tax %', 'gst', 79], ['Barcode', null, 0]],
        rows: () => I.slice(0, 10).map((x) => [x.sku, x.name, x.unit, x.cost, x.price, x.gst, x.upc]) },
      opening: { label: 'Opening balances', icon: 'scale', tile: 'violet', desc: 'Trial balance as at 30 Jun 2026', total: 184, route: 'app/accounting/opening', file: 'TB_30-Jun-2026.xlsx',
        fields: [['code', 'Account code', 1, 'code'], ['name', 'Account name', 0, 'text'], ['dr', 'Debit', 0, 'num'], ['cr', 'Credit', 0, 'num']],
        src: [['A/C Code', 'code', 95], ['A/C Title', 'name', 93], ['Debit (Rs)', 'dr', 98], ['Credit (Rs)', 'cr', 98]],
        rows: () => [['1110-01', 'Cash in Hand, Lahore HQ', 2942320, 0], ['1120-01', 'Meezan Bank 0123', 21452900, 0], ['1120-02', 'HBL 8721', 11988640, 0], ['1130-01', 'Trade receivables', 6367090, 0], ['1140-01', 'Stock in trade', 18450000, 0], ['2110-01', 'Trade payables', 0, 3001900], ['2140-01', 'Accrued expenses', 0, 1240000], ['3100-01', 'Share capital', 0, 25000000], ['3200-01', 'Retained earnings', 0, 31959050]] },
      employees: { label: 'Employees', icon: 'id-card', tile: 'lime', desc: 'CNIC, department, joining date, salary', total: 148, route: 'app/hr/employees', file: 'staff_list_hr.xlsx',
        fields: [['id', 'Employee ID', 1, 'code'], ['name', 'Full name', 1, 'text'], ['cnic', 'CNIC', 1, 'cnic'], ['dept', 'Department', 0, 'text'], ['email', 'Work email', 0, 'email'], ['phone', 'Mobile', 0, 'phone']],
        src: [['Emp #', 'id', 92], ['Name', 'name', 100], ['CNIC No', 'cnic', 97], ['Dept', 'dept', 88], ['Email', 'email', 100], ['Cell', 'phone', 77]],
        rows: () => E.slice(0, 10).map((x, i) => [x.id, x.name, `35202-${4100000 + i * 13791}-${(i % 9) + 1}`, x.dept, x.email, x.phone]) },
      coa: { label: 'Chart of accounts', icon: 'list-tree', tile: 'red', desc: 'Groups, sub-groups and ledgers', total: 412, route: 'app/accounting/coa', file: 'coa_export_quickbooks.csv',
        fields: [['code', 'Account code', 1, 'code'], ['name', 'Account name', 1, 'text'], ['type', 'Account type', 1, 'text'], ['parent', 'Parent group', 0, 'text']],
        src: [['Number', 'code', 90], ['Account', 'name', 94], ['Type', 'type', 100], ['Parent', 'parent', 85], ['Balance', null, 0]],
        rows: () => [['1110-01', 'Cash in Hand', 'Asset', 'Cash & Bank', 0], ['1120-01', 'Meezan Bank 0123', 'Asset', 'Cash & Bank', 0], ['1130-01', 'Trade receivables', 'Asset', 'Current assets', 0], ['2110-01', 'Trade payables', 'Liability', 'Current liabilities', 0], ['4110-01', 'Sales, local', 'Income', 'Revenue', 0], ['5110-01', 'Salaries & wages', 'Expense', 'Admin expenses', 0], ['5220-01', 'Electricity', 'Expense', 'Utilities', 0], ['5410-01', 'Bank charges', 'Expense', 'Finance cost', 0]] },
    };
    /* error injection per entity: [rowIndex, fieldKey, badValue, message] */
    const ERR = {
      customers: [[2, 'ntn', '06562319', 'NTN must look like 1234567-8'], [4, 'name', '', 'Customer name is required'], [6, 'limit', '25 lac', 'Credit limit must be a number']],
      vendors: [[3, 'ntn', '0400-120', 'NTN must look like 1234567-8'], [6, 'ob', 'Rs1,25,000/-', 'Opening payable must be a number']],
      items: [[3, 'price', '', 'Sale price is required'], [7, 'gst', '18 %%', 'GST % must be a number'], [9, 'sku', 'PK-1001', 'Duplicate SKU in file']],
      opening: [[4, 'dr', '18,450,000.00.0', 'Debit must be a number'], [7, 'code', '', 'Account code is required']],
      employees: [[2, 'cnic', '3520241000', 'CNIC must be 13 digits: 35202-1234567-1'], [5, 'email', 'zainab.raza@alnoor', 'Email address is incomplete'], [8, 'name', '', 'Full name is required']],
      coa: [[5, 'type', 'Expenditure', 'Type must be Asset, Liability, Equity, Income or Expense'], [7, 'code', '5220-01', 'Duplicate account code']],
    };
    const RX = { ntn: /^\d{7}-\d$/, phone: /^[\d\s+\-]{7,}$/, num: /^-?\d+(\.\d+)?$/, email: /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i, cnic: /^\d{5}-\d{7}-\d$/, code: /^[A-Z0-9][A-Z0-9\-]*$/i };
    let st, sec;
    const fresh = () => ({ step: 0, ent: null, file: null, map: {}, rows: [], skipErr: true });

    const validate = (ent, fk, v, rowIdx, rows) => {
      const f = ENT[ent].fields.find((x) => x[0] === fk); if (!f) return '';
      const s = String(v == null ? '' : v).trim();
      if (!s) return f[2] ? `${f[1]} is required` : '';
      if (f[3] === 'num' && !RX.num.test(s.replace(/,/g, ''))) return `${f[1]} must be a number`;
      if (RX[f[3]] && f[3] !== 'num' && !RX[f[3]].test(s)) return ({ ntn: 'NTN must look like 1234567-8', cnic: 'CNIC must be 13 digits: 35202-1234567-1', email: 'Email address is incomplete', phone: 'Phone number looks too short', code: 'Code has invalid characters' })[f[3]];
      if (ent === 'coa' && fk === 'type' && !/^(Asset|Liability|Equity|Income|Expense)$/.test(s)) return 'Type must be Asset, Liability, Equity, Income or Expense';
      if ((fk === 'sku' || (fk === 'code' && ent === 'coa')) && rows.some((r, j) => j !== rowIdx && String(r[fk]).trim() === s)) return 'Duplicate in file';
      return '';
    };

    function shell() {
      const labels = ['Choose data', 'Upload file', 'Map columns', 'Validate', 'Import'];
      return `<div class="wizard cp-wz" id="cp-im-wz">
        <ol class="steps">${labels.map((l, i) => `<li class="${i === 0 ? 'active' : ''}" data-s="${i}"><b>${i + 1}</b><span>${l}</span></li>`).join('')}</ol>
        <div class="cp-wz-pane" id="cp-im-pane"></div>
        <div class="cp-wz-foot"><button class="btn secondary" id="cp-im-back">${ic('arrow-left')}Back</button><span class="cp-wz-meta" id="cp-im-meta"></span><span class="spacer"></span><button class="btn primary" id="cp-im-next">Continue${ic('arrow-right')}</button></div>
      </div>`;
    }

    /* ---- panes ---- */
    function pChoose() {
      return `<div class="cp-pane-h"><h3>What would you like to import?</h3><p>Pick one data type. You can run the wizard again for the others.</p></div>
      <div class="cp-im-ents">${Object.entries(ENT).map(([k, e], i) => `<button class="cp-im-ent${st.ent === k ? ' on' : ''}" data-k="${k}" style="--i:${i}"><span class="icon-tile ${e.tile}">${ic(e.icon)}</span><b>${e.label}</b><small>${e.desc}</small><span class="cp-im-ent-f">${e.fields.length} fields · ${e.fields.filter((f) => f[2]).length} required</span><span class="cp-im-tick">${ic('check')}</span></button>`).join('')}</div>
      <div class="banner info cp-mt">${ic('lightbulb')}<div><b>Coming from Tally, QuickBooks or Peachtree?</b><p>Export the master list to Excel or CSV. Finsoft recognises their column names and maps them automatically.</p></div></div>`;
    }
    function pUpload() {
      const e = ENT[st.ent];
      return `<div class="cp-pane-h"><h3>Upload your ${e.label.toLowerCase()} file</h3><p>Excel (.xlsx, .xls) or CSV, up to 10 MB. The first row should hold column headings.</p></div>
      <div class="cp-drop${st.file ? ' has' : ''}" id="cp-im-drop" tabindex="0">
        <input type="file" id="cp-im-file" accept=".xlsx,.xls,.csv" hidden>
        <div class="cp-drop-idle"><span class="cp-drop-ic">${ic('cloud-upload')}</span><b>Drag &amp; drop your file here</b><small>or <u>browse your computer</u></small><div class="row cp-center cp-mt8"><span class="pill">${ic('file-spreadsheet')}.xlsx</span><span class="pill">${ic('file-text')}.csv</span><span class="pill">${ic('file')}.xls</span></div></div>
        <div class="cp-drop-file" id="cp-im-fcard"></div>
      </div>
      <div class="row cp-center cp-mt"><span class="muted small">No file handy?</span><button class="btn secondary sm" id="cp-im-sample">${ic('sparkles')}Use sample file</button><button class="btn ghost sm" id="cp-im-tpl1">${ic('download')}Download ${e.label.toLowerCase()} template</button></div>`;
    }
    const fileCard = (f, p) => `<span class="icon-tile green">${ic('file-spreadsheet')}</span><div class="cp-fc-t"><b>${esc(f.name)}</b><small>${f.size} · ${p < 100 ? 'Uploading… ' + Math.round(p) + '%' : `${fmt(ENT[st.ent].total)} rows · ${ENT[st.ent].src.length} columns detected`}</small><div class="progress ${p < 100 ? '' : 'lime'}"><i style="width:${p}%;transform:none"></i></div></div>${p >= 100 ? `<span class="badge good">${ic('check')}Ready</span><button class="btn ghost sm icon" id="cp-im-rm" title="Remove">${ic('trash-2')}</button>` : ''}`;
    async function upload(name, size) {
      const drop = $('#cp-im-drop', sec), card = $('#cp-im-fcard', sec);
      st.file = { name, size }; st.map = {};
      drop.classList.add('has', 'busy');
      for (let p = 0; p <= 100; p += 4 + Math.random() * 9) { card.innerHTML = fileCard(st.file, Math.min(p, 99)); FS.icons(card); await sleep(55); }
      card.innerHTML = fileCard(st.file, 100); FS.icons(card);
      drop.classList.remove('busy'); drop.classList.add('done');
      syncFoot();
      FS.toast(`${name} uploaded, ${fmt(ENT[st.ent].total)} rows found`, { tone: 'good', ms: 2400 });
    }

    function pMap() {
      const e = ENT[st.ent];
      const used = new Set(Object.values(st.map).map((m) => m.src));
      return `<div class="cp-pane-h row"><div><h3>Map your columns to Finsoft fields</h3><p>Drag a column from your file onto a field, or let Finsoft auto-map them by name and sample values.</p></div><span class="spacer"></span><button class="btn lime" id="cp-im-auto">${ic('wand-sparkles')}Auto-map</button></div>
      <div class="cp-map">
        <div class="cp-map-src"><h5>${ic('file-spreadsheet')}Your file <small>${esc(st.file.name)}</small></h5>
          ${e.src.map((s, i) => `<div class="cp-chip-src${used.has(i) ? ' used' : ''}" draggable="true" data-si="${i}"><span class="cp-grip">${ic('grip-vertical')}</span><b>${s[0]}</b><small>${esc(sampleOf(i))}</small></div>`).join('')}
        </div>
        <div class="cp-map-mid">${ic('arrow-right')}</div>
        <div class="cp-map-dst"><h5>${ic('database')}Finsoft fields <small>${e.fields.filter((f) => f[2]).length} required</small></h5>
          ${e.fields.map((f) => { const m = st.map[f[0]]; return `<div class="cp-slot${m ? ' filled' : ''}" data-fk="${f[0]}"><span class="cp-slot-l"><b>${f[1]}${f[2] ? '<em>*</em>' : ''}</b><small>${f[3] === 'num' ? 'Number' : f[3] === 'text' ? 'Text' : f[3].toUpperCase()}</small></span><span class="cp-slot-v">${m ? slotChip(m) : '<span class="cp-slot-ph">Drop a column here</span>'}</span></div>`; }).join('')}
        </div>
      </div>`;
    }
    const sampleOf = (si) => { const r = ENT[st.ent].rows()[0] || []; const v = r[si]; return v == null || v === '' ? '(blank)' : typeof v === 'number' ? fmt(v) : v; };
    const confBadge = (c) => `<span class="badge ${c >= 90 ? 'good' : c >= 75 ? 'info' : 'warn'} cp-conf">${c}%</span>`;
    const slotChip = (m) => `<span class="cp-mapped"><b>${ENT[st.ent].src[m.src][0]}</b>${confBadge(m.conf)}<button class="cp-unmap" title="Unmap">${ic('x')}</button></span>`;
    function setMap(fk, si, conf, animate) {
      Object.keys(st.map).forEach((k) => { if (st.map[k].src === si) delete st.map[k]; });
      st.map[fk] = { src: si, conf };
      const pane = $('#cp-im-pane', sec);
      $$('.cp-chip-src', pane).forEach((c) => c.classList.toggle('used', Object.values(st.map).some((m) => m.src === +c.dataset.si)));
      $$('.cp-slot', pane).forEach((sl) => { const m = st.map[sl.dataset.fk]; sl.classList.toggle('filled', !!m); $('.cp-slot-v', sl).innerHTML = m ? slotChip(m) : '<span class="cp-slot-ph">Drop a column here</span>'; });
      const sl = $(`.cp-slot[data-fk="${fk}"]`, pane);
      if (sl && animate) { sl.classList.remove('cp-snap'); void sl.offsetWidth; sl.classList.add('cp-snap'); }
      FS.icons(pane); syncFoot();
    }
    async function autoMap(btn) {
      const e = ENT[st.ent];
      btn.disabled = true; btn.innerHTML = `<span class="cp-spin"></span>Matching…`;
      const pane = $('#cp-im-pane', sec);
      for (let si = 0; si < e.src.length; si++) {
        const [, fk, conf] = e.src[si];
        const chip = $(`.cp-chip-src[data-si="${si}"]`, pane);
        chip.classList.add('scan'); await sleep(140); chip.classList.remove('scan');
        if (fk && !st.map[fk]) setMap(fk, si, conf, true);
      }
      btn.disabled = false; btn.innerHTML = `${ic('check')}Mapped`; FS.icons(btn);
      const unm = e.src.filter((s) => !s[1]).map((s) => s[0]);
      FS.toast(`${Object.keys(st.map).length} columns mapped${unm.length ? `, "${unm.join('", "')}" will be ignored` : ''}`, { tone: 'good' });
    }

    function buildRows() {
      const e = ENT[st.ent];
      const raw = e.rows();
      st.rows = raw.map((r) => { const o = {}; e.fields.forEach((f) => { const m = st.map[f[0]]; o[f[0]] = m ? r[m.src] : ''; }); return o; });
      (ERR[st.ent] || []).forEach(([ri, fk, bad]) => { if (st.rows[ri]) st.rows[ri][fk] = bad; });
    }
    const rowErrs = (ri) => ENT[st.ent].fields.map((f) => [f[0], validate(st.ent, f[0], st.rows[ri][f[0]], ri, st.rows)]).filter((x) => x[1]);
    const counts = () => { const e = ENT[st.ent]; const bad = st.rows.filter((r, i) => rowErrs(i).length).length; const errN = st.rows.reduce((s, r, i) => s + rowErrs(i).length, 0); const scaleBad = bad; return { total: e.total, bad: scaleBad, ok: e.total - scaleBad, errN, warn: Math.round(e.total * 0.02) }; };
    function pValidate() {
      const e = ENT[st.ent], c = counts();
      return `<div class="cp-pane-h row"><div><h3>Review & fix</h3><p>Showing the first ${st.rows.length} of ${fmt(e.total)} rows. Click any red cell to fix it in place.</p></div><span class="spacer"></span><button class="btn secondary sm" id="cp-im-dlerr">${ic('download')}Download errors</button></div>
      <div class="cp-val-sum">
        <div class="cp-vs good"><span class="icon-well">${ic('circle-check')}</span><div><b id="cp-im-ok">${fmt(c.ok)}</b><small>Rows ready</small></div></div>
        <div class="cp-vs warn"><span class="icon-well">${ic('triangle-alert')}</span><div><b>${c.warn}</b><small>Warnings (will import)</small></div></div>
        <div class="cp-vs bad"><span class="icon-well">${ic('circle-x')}</span><div><b id="cp-im-bad">${c.bad}</b><small>Rows with errors</small></div></div>
        <div class="cp-vs-bar"><div class="cp-vs-track"><i class="g" id="cp-im-barg" style="flex:${c.ok}"></i><i class="w" style="flex:${c.warn}"></i><i class="r" id="cp-im-barr" style="flex:${c.bad * 6}"></i></div><label class="switch"><input type="checkbox" id="cp-im-skip" ${st.skipErr ? 'checked' : ''}><i></i><span>Skip rows with errors</span></label></div>
      </div>
      <div class="cp-errlist" id="cp-im-errlist"></div>
      <div class="table-wrap cp-im-tw"><table class="tbl compact cp-im-tbl" data-plain><thead><tr><th>#</th>${e.fields.map((f) => `<th class="${f[3] === 'num' ? 'num' : ''}">${f[1]}${f[2] ? ' *' : ''}</th>`).join('')}<th>Status</th></tr></thead><tbody id="cp-im-tb"></tbody></table></div>`;
    }
    function paintRows() {
      const e = ENT[st.ent], tb = $('#cp-im-tb', sec);
      tb.innerHTML = st.rows.map((r, i) => {
        const errs = rowErrs(i);
        return `<tr class="${errs.length ? 'cp-err-row' : ''}" data-ri="${i}"><td class="muted">${i + 2}</td>${e.fields.map((f) => {
          const er = errs.find((x) => x[0] === f[0]);
          const v = r[f[0]]; const disp = v === '' || v == null ? '<span class="zero">—</span>' : esc(typeof v === 'number' ? fmt(v) : v);
          return er ? `<td class="cp-bad ${f[3] === 'num' ? 'num' : ''}" data-fk="${f[0]}" data-tip="${esc(er[1])}"><input class="cp-fix" value="${esc(v)}" placeholder="${esc(f[1])}" aria-label="${esc(er[1])}"></td>` : `<td class="${f[3] === 'num' ? 'num' : ''}">${disp}</td>`;
        }).join('')}<td>${errs.length ? `<span class="badge danger">${ic('circle-x')}${errs.length} error${errs.length > 1 ? 's' : ''}</span>` : '<span class="badge good">' + ic('check') + 'OK</span>'}</td></tr>`;
      }).join('');
      FS.icons(tb);
      const list = $('#cp-im-errlist', sec);
      const all = st.rows.flatMap((r, i) => rowErrs(i).map((x) => ({ ri: i, fk: x[0], msg: x[1] })));
      list.innerHTML = all.length ? `<b>${ic('list-x')}${all.length} issue${all.length > 1 ? 's' : ''} to fix</b>${all.map((x) => `<button data-ri="${x.ri}" data-fk="${x.fk}">Row ${x.ri + 2} · ${esc(x.msg)}</button>`).join('')}` : `<b class="ok">${ic('sparkles')}All clear. Every previewed row passes validation.</b>`;
      FS.icons(list);
      const c = counts();
      tick($('#cp-im-ok', sec), c.ok, { local: true }); tick($('#cp-im-bad', sec), c.bad, { local: true });
      $('#cp-im-barr', sec).style.flex = c.bad * 6; $('#cp-im-barg', sec).style.flex = c.ok;
      syncFoot();
    }
    function pImport() {
      const e = ENT[st.ent];
      return `<div class="cp-imp" id="cp-im-run">
        <div class="cp-imp-ring">${ring(0, 'big')}<div class="cp-su-pct"><b id="cp-im-pp">0</b><span>%</span><small>Importing ${e.label.toLowerCase()}</small></div></div>
        <div class="cp-imp-c">
          <div class="cp-imp-ctr"><div><b id="cp-im-c1">0</b><small>Created</small></div><div><b id="cp-im-c2">0</b><small>Updated</small></div><div><b id="cp-im-c3">0</b><small>Skipped</small></div><div><b id="cp-im-c4">0/s</b><small>Speed</small></div></div>
          <div class="progress lg lime"><i id="cp-im-pb" style="width:0;transform:none"></i></div>
          <div class="cp-imp-log" id="cp-im-log"></div>
        </div>
      </div>`;
    }
    async function runImport() {
      const e = ENT[st.ent], c = counts();
      const skip = st.skipErr ? c.bad : 0, total = e.total - skip, upd = Math.round(total * 0.08), crt = total - upd;
      const log = $('#cp-im-log', sec), names = e.rows().map((r) => r[0] + (r[1] && typeof r[1] === 'string' && st.ent !== 'opening' ? ' · ' + r[1] : ''));
      const N = 40;
      for (let k = 1; k <= N; k++) {
        const p = k / N;
        $('#cp-im-pp', sec).textContent = Math.round(p * 100);
        setRing($('#cp-im-run .cp-ring', sec), p * 100);
        $('#cp-im-pb', sec).style.width = p * 100 + '%';
        $('#cp-im-c1', sec).textContent = fmt(Math.round(crt * p));
        $('#cp-im-c2', sec).textContent = fmt(Math.round(upd * p));
        $('#cp-im-c3', sec).textContent = fmt(Math.round(skip * p));
        $('#cp-im-c4', sec).textContent = fmt(180 + Math.round(Math.random() * 60)) + '/s';
        if (k % 4 === 0) {
          const nm = names[(k / 4) % names.length];
          log.insertAdjacentHTML('afterbegin', `<div>${ic(k % 12 === 0 ? 'refresh-cw' : 'plus')}<span>${k % 12 === 0 ? 'Updated' : 'Created'} <b>${esc(nm)}</b></span><small>row ${fmt(Math.round(e.total * p))}</small></div>`);
          FS.icons(log.firstElementChild);
          while (log.children.length > 6) log.lastElementChild.remove();
        }
        if (!sec.classList.contains('active')) { await sleep(10); continue; }
        await sleep(55);
      }
      await sleep(250);
      const pane = $('#cp-im-pane', sec);
      pane.innerHTML = `<div class="cp-done">
        <div class="cp-done-ic">${ic('check')}</div>
        <h3>${fmt(total)} ${e.label.toLowerCase()} imported</h3>
        <p>${fmt(crt)} created, ${fmt(upd)} updated${skip ? `, ${skip} skipped with errors (download them to fix and re-import)` : ''}. Batch <b>IMP-2026-0${38 + Object.keys(ENT).indexOf(st.ent)}</b> can be rolled back for 24 hours.</p>
        <div class="cp-done-st"><span class="pill">${ic('clock')}Took 7.4s</span><span class="pill">${ic('user')}By Sana Javed</span><span class="pill">${ic('file-spreadsheet')}${esc(st.file.name)}</span></div>
        <div class="row cp-center cp-wrap-row"><button class="btn secondary" id="cp-im-again">${ic('rotate-ccw')}Import something else</button>${skip ? `<button class="btn ghost" id="cp-im-dlerr2">${ic('download')}Error rows</button>` : ''}<a class="btn primary" href="#/${e.route}">View ${e.label.toLowerCase()}${ic('arrow-right')}</a></div>
      </div>`;
      FS.icons(pane);
      sec.querySelector('.cp-wz-foot').hidden = true;
      $$('#cp-im-wz .steps li', sec).forEach((li) => { li.classList.add('done'); li.classList.remove('active'); });
      celebrate($('.cp-done-ic', pane), 'Import complete');
      hist.unshift([dstr(TODAY), e.label, st.file.name, total, skip]);
    }
    const hist = [['28 Sep 2026', 'Items', 'item_master_v2.xlsx', 16, 0], ['22 Sep 2026', 'Customers', 'customers_jul.csv', 212, 3], ['15 Sep 2026', 'Chart of accounts', 'coa_template_pk.xlsx', 412, 0]];

    function errorsCsv() {
      const e = ENT[st.ent];
      const rows = [['Row', 'Field', 'Value', 'Error', ...e.fields.map((f) => f[1])]];
      st.rows.forEach((r, i) => rowErrs(i).forEach(([fk, msg]) => rows.push([i + 2, e.fields.find((f) => f[0] === fk)[1], r[fk], msg, ...e.fields.map((f) => r[f[0]])])));
      if (rows.length === 1) { FS.toast('No errors to download, everything passes', { tone: 'info' }); return; }
      download(`${st.ent}_import_errors.csv`, csv(rows));
      FS.toast(`${rows.length - 1} error rows downloaded as CSV`, { tone: 'good' });
    }

    /* ---- navigation ---- */
    const canNext = () => {
      if (st.step === 0) return !!st.ent;
      if (st.step === 1) return !!(st.file && !$('#cp-im-drop.busy', sec));
      if (st.step === 2) return ENT[st.ent].fields.filter((f) => f[2]).every((f) => st.map[f[0]]);
      if (st.step === 3) return st.skipErr || counts().bad === 0;
      return false;
    };
    function syncFoot() {
      const nx = $('#cp-im-next', sec), bk = $('#cp-im-back', sec), meta = $('#cp-im-meta', sec);
      bk.style.visibility = st.step === 0 || st.step === 4 ? 'hidden' : '';
      nx.disabled = !canNext();
      const e = st.ent && ENT[st.ent];
      const label = st.step === 3 ? (st.skipErr && counts().bad ? `Import ${fmt(counts().ok)} rows` : 'Start import') : ['Continue', 'Continue to mapping', 'Validate data', '', ''][st.step];
      nx.innerHTML = `${label}${ic(st.step === 3 ? 'upload' : 'arrow-right')}`;
      nx.hidden = st.step === 4;
      if (st.step === 2 && e) { const req = e.fields.filter((f) => f[2]), done = req.filter((f) => st.map[f[0]]).length; meta.innerHTML = `${Object.keys(st.map).length}/${e.fields.length} fields mapped · <b class="${done === req.length ? 'cp-okc' : 'cp-badc'}">${done}/${req.length} required</b>`; }
      else if (st.step === 3 && e) { const c = counts(); meta.innerHTML = c.bad ? (st.skipErr ? `${c.bad} error rows will be skipped` : `<b class="cp-badc">Fix ${c.bad} rows or turn on “Skip rows with errors”</b>`) : '<b class="cp-okc">Ready to import</b>'; }
      else meta.innerHTML = e ? `${ic(e.icon)}${e.label}${st.file ? ' · ' + esc(st.file.name) : ''}` : 'Step 1 of 5';
      FS.icons(nx); FS.icons(meta);
    }
    function go(step) {
      st.step = step;
      const pane = $('#cp-im-pane', sec);
      $$('#cp-im-wz .steps li', sec).forEach((li, i) => { li.classList.toggle('active', i === step); li.classList.toggle('done', i < step); });
      sec.querySelector('.cp-wz-foot').hidden = false;
      pane.innerHTML = [pChoose, pUpload, pMap, pValidate, pImport][step]();
      pane.classList.remove('cp-pane-in'); void pane.offsetWidth; pane.classList.add('cp-pane-in');
      FS.icons(pane);
      if (step === 1 && st.file) { $('#cp-im-fcard', sec).innerHTML = fileCard(st.file, 100); $('#cp-im-drop', sec).classList.add('done'); FS.icons(pane); }
      if (step === 3) { buildRows(); paintRows(); }
      syncFoot();
      if (step === 4) runImport();
      const wz = $('#cp-im-wz', sec); if (wz.getBoundingClientRect().top < 60) wz.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function mount(s) {
      sec = s; st = fresh();
      sec.insertAdjacentHTML('beforeend', shell());
      go(0);
      $('#cp-im-next', sec).onclick = () => { if (canNext()) go(st.step + 1); };
      $('#cp-im-back', sec).onclick = () => go(Math.max(0, st.step - 1));
      $('#cp-im-wz .steps', sec).addEventListener('click', (e) => { const li = e.target.closest('li'); if (!li) return; const i = +li.dataset.s; if (i < st.step && st.step < 4) go(i); });
      const pane = $('#cp-im-pane', sec);
      pane.addEventListener('click', (e) => {
        const ent = e.target.closest('.cp-im-ent');
        if (ent) { if (st.ent !== ent.dataset.k) { st.ent = ent.dataset.k; st.file = null; st.map = {}; } $$('.cp-im-ent', pane).forEach((b) => b.classList.toggle('on', b === ent)); syncFoot(); return; }
        if (e.target.closest('#cp-im-sample')) { upload(ENT[st.ent].file, (0.2 + Object.keys(ENT).indexOf(st.ent) * 0.13).toFixed(2) + ' MB'); return; }
        if (e.target.closest('#cp-im-tpl1')) { const en = ENT[st.ent]; download(`finsoft_${st.ent}_template.csv`, csv([en.fields.map((f) => f[1] + (f[2] ? ' *' : ''))])); FS.toast('Template downloaded', { tone: 'good', ms: 2000 }); return; }
        if (e.target.closest('#cp-im-rm')) { st.file = null; st.map = {}; go(1); return; }
        if (e.target.closest('#cp-im-drop') && !st.file) { $('#cp-im-file', sec).click(); return; }
        if (e.target.closest('#cp-im-auto')) { autoMap(e.target.closest('#cp-im-auto')); return; }
        const un = e.target.closest('.cp-unmap'); if (un) { const fk = un.closest('.cp-slot').dataset.fk; delete st.map[fk]; go(2); return; }
        const src = e.target.closest('.cp-chip-src');
        if (src) { $$('.cp-chip-src', pane).forEach((c) => c.classList.toggle('picked', c === src && !c.classList.contains('picked'))); return; }
        const slot = e.target.closest('.cp-slot');
        if (slot) { const p = $('.cp-chip-src.picked', pane); if (p) { setMap(slot.dataset.fk, +p.dataset.si, 100, true); p.classList.remove('picked'); } return; }
        if (e.target.closest('#cp-im-dlerr')) { errorsCsv(); return; }
        const jump = e.target.closest('#cp-im-errlist button');
        if (jump) { const inp = $(`tr[data-ri="${jump.dataset.ri}"] td[data-fk="${jump.dataset.fk}"] input`, pane); if (inp) { inp.scrollIntoView({ block: 'center', behavior: 'smooth' }); setTimeout(() => inp.focus(), 250); } return; }
        if (e.target.closest('#cp-im-again')) { st = fresh(); go(0); return; }
        if (e.target.closest('#cp-im-dlerr2')) { errorsCsv(); }
      });
      pane.addEventListener('change', (e) => {
        if (e.target.id === 'cp-im-file' && e.target.files[0]) { const f = e.target.files[0]; upload(f.name, (f.size / 1048576).toFixed(2) + ' MB'); }
        if (e.target.id === 'cp-im-skip') { st.skipErr = e.target.checked; syncFoot(); }
        if (e.target.matches('.cp-fix')) {
          const td = e.target.closest('td'), ri = +td.closest('tr').dataset.ri, fk = td.dataset.fk;
          const v = e.target.value.trim(); const f = ENT[st.ent].fields.find((x) => x[0] === fk);
          st.rows[ri][fk] = f[3] === 'num' && RX.num.test(v.replace(/,/g, '')) ? +v.replace(/,/g, '') : v;
          const ok = !validate(st.ent, fk, st.rows[ri][fk], ri, st.rows);
          if (ok) { paintRows(); const tr = $(`tr[data-ri="${ri}"]`, pane); tr.classList.add('row-flash'); FS.toast(`Row ${ri + 2} fixed`, { tone: 'good', ms: 1600 }); }
          else { td.classList.remove('cp-shake'); void td.offsetWidth; td.classList.add('cp-shake'); }
        }
      });
      pane.addEventListener('keydown', (e) => { if (e.target.matches('.cp-fix') && e.key === 'Enter') e.target.dispatchEvent(new Event('change', { bubbles: true })); if (e.target.id === 'cp-im-drop' && (e.key === 'Enter' || e.key === ' ') && !st.file) { e.preventDefault(); $('#cp-im-file', sec).click(); } });
      /* drag & drop: file dropzone and column mapping */
      pane.addEventListener('dragstart', (e) => { const c = e.target.closest('.cp-chip-src'); if (!c) return; e.dataTransfer.setData('text/cp-si', c.dataset.si); e.dataTransfer.effectAllowed = 'move'; c.classList.add('dragging'); pane.classList.add('cp-dragging'); });
      pane.addEventListener('dragend', (e) => { $$('.dragging', pane).forEach((c) => c.classList.remove('dragging')); pane.classList.remove('cp-dragging'); $$('.cp-slot.over', pane).forEach((s2) => s2.classList.remove('over')); });
      pane.addEventListener('dragover', (e) => {
        const slot = e.target.closest('.cp-slot'), drop = e.target.closest('#cp-im-drop');
        if (slot || drop) { e.preventDefault(); }
        $$('.cp-slot.over', pane).forEach((s2) => s2 !== slot && s2.classList.remove('over'));
        if (slot) slot.classList.add('over');
        if (drop && !st.file) drop.classList.add('over');
      });
      pane.addEventListener('dragleave', (e) => { const drop = e.target.closest('#cp-im-drop'); if (drop && !drop.contains(e.relatedTarget)) drop.classList.remove('over'); });
      pane.addEventListener('drop', (e) => {
        const slot = e.target.closest('.cp-slot'), drop = e.target.closest('#cp-im-drop');
        if (slot) { e.preventDefault(); const si = e.dataTransfer.getData('text/cp-si'); slot.classList.remove('over'); if (si !== '') { const e2 = ENT[st.ent].src[+si]; setMap(slot.dataset.fk, +si, e2[1] === slot.dataset.fk ? e2[2] : 100, true); } }
        else if (drop) { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f && !st.file) upload(f.name, (f.size / 1048576).toFixed(2) + ' MB'); }
      });
      $('#cp-im-tpl').onclick = (e) => { busy(e.currentTarget, 700, 'Preparing…').then(() => { download('finsoft_import_templates.csv', csv(Object.values(ENT).map((en) => [en.label, ...en.fields.map((f) => f[1])]))); FS.toast('Templates for all 6 data types downloaded', { tone: 'good' }); }); };
      $('#cp-im-history').onclick = () => {
        FS.drawer({ title: 'Import history', subtitle: 'Last 30 days · batches can be rolled back for 24 hours', html: `<div class="timeline">${hist.map((h, i) => `<div class="tl-item"><span class="tl-dot ${h[4] ? 'warn' : 'good'}"></span><div><b>${h[1]} · ${fmt(h[3])} rows</b><small>${h[0]} · ${esc(h[2])}${h[4] ? ` · ${h[4]} skipped` : ''}</small>${i === 0 && h[0] === dstr(TODAY) ? '<p><button class="btn ghost sm" data-toast="Rollback scheduled; records will be removed in 1 minute">Roll back batch</button></p>' : ''}</div></div>`).join('')}</div>` });
      };
    }
    FS.onEnter(ROUTE, (s, r, first) => { if (first) mount(s); });
  })();

  /* =====================================================================
     4. RECURRING INVOICES  (app/sales/recurring)
     ===================================================================== */
  (function recurring() {
    const ROUTE = 'app/sales/recurring';
    const FREQ = { weekly: ['Weekly', 7], monthly: ['Monthly', 1], quarterly: ['Quarterly', 3], custom: ['Every N days', 0] };
    let seq = 1288;
    const P = [
      { id: 'RP-0012', cust: 'Shifa International', name: 'Office supplies standing order', freq: 'monthly', next: '2026-10-03', amount: 186400, auto: true, ch: ['email', 'wa'], status: 'active', runs: 14, end: 'Never' },
      { id: 'RP-0015', cust: 'Hashoo Hotels', name: 'Housekeeping consumables', freq: 'weekly', next: '2026-10-05', amount: 48600, auto: true, ch: ['wa'], status: 'active', runs: 61, end: 'Never' },
      { id: 'RP-0019', cust: 'Packages Ltd', name: 'Packaging AMC retainer', freq: 'quarterly', next: '2026-10-07', amount: 425000, auto: false, ch: ['email'], status: 'active', runs: 5, end: '30 Jun 2027' },
      { id: 'RP-0021', cust: 'Metro Cash & Carry', name: 'Shelf-ready cartons', freq: 'monthly', next: '2026-10-10', amount: 312750, auto: true, ch: ['email', 'wa'], status: 'active', runs: 9, end: 'Never' },
      { id: 'RP-0024', cust: 'Engro Foods', name: 'Stretch film & tape supply', freq: 'monthly', next: '2026-10-15', amount: 598000, auto: true, ch: ['email'], status: 'active', runs: 22, end: 'Never' },
      { id: 'RP-0027', cust: 'Interloop Ltd', name: 'Safety gear replenishment', freq: 'custom', every: 45, next: '2026-10-21', amount: 214900, auto: false, ch: ['email'], status: 'paused', runs: 3, end: 'After 8 runs' },
      { id: 'RP-0030', cust: 'Fatima Group', name: 'IT accessories framework', freq: 'quarterly', next: '2026-11-01', amount: 289000, auto: true, ch: ['email', 'wa'], status: 'active', runs: 2, end: '31 Dec 2026' },
      { id: 'RP-0031', cust: 'City Mart Superstores', name: 'FMCG weekly top-up', freq: 'weekly', next: '2026-10-02', amount: 96800, auto: true, ch: ['wa'], status: 'expiring', runs: 38, end: '15 Oct 2026' },
    ];
    let rows = P.map((p) => ({ ...p })), sec;
    const monthly = (p) => p.status === 'paused' ? 0 : p.freq === 'weekly' ? p.amount * 52 / 12 : p.freq === 'monthly' ? p.amount : p.freq === 'quarterly' ? p.amount / 3 : p.amount * 30 / (p.every || 30);
    function nextDates(start, freq, every, n = 6, end) {
      const out = []; let d = new Date(start);
      for (let i = 0; i < n; i++) {
        if (end && d > end) break;
        out.push(new Date(d));
        if (freq === 'weekly') d = addDays(d, 7);
        else if (freq === 'custom') d = addDays(d, every || 30);
        else { const m = freq === 'monthly' ? 1 : 3; const day = start.getDate(); d = new Date(d.getFullYear(), d.getMonth() + m, 1); d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); }
      }
      return out;
    }
    const chIc = (c) => c === 'wa' ? `<span class="cp-ch wa" title="WhatsApp">${ic('message-circle')}</span>` : `<span class="cp-ch em" title="Email">${ic('mail')}</span>`;
    const stBadge = (s) => ({ active: '<span class="badge good dot">Active</span>', paused: '<span class="badge neutral dot">Paused</span>', expiring: '<span class="badge warn dot">Ends soon</span>' })[s];
    const inDays = (d) => Math.round((parseIso(d) - TODAY) / 864e5);
    function tr(p) {
      const n = inDays(p.next);
      return `<tr data-id="${p.id}" class="${p.status === 'paused' ? 'cp-dim' : ''}">
        <td><div class="cell-user">${av(p.cust)}<div><b>${esc(p.cust)}</b><small>${p.id} · ${esc(p.name)}</small></div></div></td>
        <td><span class="cp-freq">${ic('repeat')}${p.freq === 'custom' ? `Every ${p.every} days` : FREQ[p.freq][0]}</span><small>${p.runs} runs · ends ${p.end}</small></td>
        <td><b class="cp-next">${dstr(parseIso(p.next))}</b><small class="${n <= 2 ? 'cp-soon' : ''}">${p.status === 'paused' ? 'On hold' : n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : 'In ' + n + ' days'}</small></td>
        <td class="num"><b>${fmt(p.amount)}</b><small>incl. GST</small></td>
        <td><div class="row cp-nowrap"><label class="switch" title="Auto-send"><input type="checkbox" data-auto ${p.auto ? 'checked' : ''}><i></i></label><span class="cp-chs${p.auto ? '' : ' off'}">${p.ch.map(chIc).join('')}</span></div></td>
        <td>${stBadge(p.status)}</td>
        <td class="actions"><div class="row cp-nowrap"><button class="btn secondary sm" data-run ${p.status === 'paused' ? 'disabled' : ''}>${ic('play')}Run now</button><button class="icon-btn-sm" data-more title="More">${ic('more-horizontal')}</button></div></td>
      </tr>`;
    }
    function kpis() {
      const act = rows.filter((p) => p.status !== 'paused');
      const wk = rows.filter((p) => p.status !== 'paused' && inDays(p.next) <= 7);
      tick($('#cp-ri-k1', sec), act.length, { local: true });
      tick($('#cp-ri-k2', sec), Math.round(rows.reduce((s, p) => s + monthly(p), 0)), { prefix: 'Rs ', dec: 0 });
      tick($('#cp-ri-k3', sec), wk.length, { local: true });
      $('#cp-ri-k3s', sec).textContent = `${rs(wk.reduce((s, p) => s + p.amount, 0))} to be invoiced`;
      tick($('#cp-ri-k4', sec), Math.round((rows.filter((p) => p.auto).length / rows.length) * 100), { local: true, suffix: '%' });
      const up = $('#cp-ri-upc', sec);
      const list = rows.filter((p) => p.status !== 'paused').sort((a, b) => a.next.localeCompare(b.next)).slice(0, 5);
      up.innerHTML = list.map((p, i) => { const d = parseIso(p.next); return `<div class="cp-up" style="--i:${i}"><span class="cp-cal"><small>${MON[d.getMonth()]}</small><b>${d.getDate()}</b></span><div><b>${esc(p.cust)}</b><small>${p.freq === 'custom' ? 'Every ' + p.every + ' days' : FREQ[p.freq][0]} · ${p.auto ? 'auto-send' : 'draft for review'}</small></div><span class="spacer"></span><b class="cp-up-amt">${rs(p.amount)}</b></div>`; }).join('');
    }
    function render() {
      sec.insertAdjacentHTML('beforeend', `
      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-top"><span>Active profiles</span><span class="icon-well">${ic('repeat')}</span></div><strong id="cp-ri-k1">0</strong><small class="up">+2 this quarter</small></div>
        <div class="kpi blue"><div class="kpi-top"><span>Monthly recurring revenue</span><span class="icon-well">${ic('trending-up')}</span></div><strong id="cp-ri-k2">Rs 0</strong><small>Normalised to a month, excl. paused</small></div>
        <div class="kpi yellow"><div class="kpi-top"><span>Next 7 days</span><span class="icon-well">${ic('calendar-clock')}</span></div><strong id="cp-ri-k3">0</strong><small id="cp-ri-k3s"></small></div>
        <div class="kpi violet"><div class="kpi-top"><span>Auto-send rate</span><span class="icon-well">${ic('send')}</span></div><strong id="cp-ri-k4">0%</strong><small>Email + WhatsApp, no manual step</small></div>
      </div>
      <div class="split cp-ri-split">
        <div class="panel flush">
          <div class="panel-head"><div><h3>Recurring profiles</h3><p>Invoices are raised at 6:00 AM on the run date and posted to receivables.</p></div><div class="panel-actions"><div class="seg" id="cp-ri-f"><button class="active" data-f="all">All</button><button data-f="active">Active</button><button data-f="paused">Paused</button></div></div></div>
          <div class="table-wrap"><table class="tbl cp-ri-tbl" data-plain><thead><tr><th>Customer &amp; profile</th><th>Frequency</th><th>Next run</th><th class="num">Amount (Rs)</th><th>Auto-send</th><th>Status</th><th></th></tr></thead><tbody id="cp-ri-tb">${rows.map(tr).join('')}</tbody></table></div>
        </div>
        <div class="stack">
          <div class="panel cp-ri-up"><div class="panel-head"><div><h3>Coming up</h3><p>Next scheduled runs</p></div><span class="pill">${ic('clock')}6:00 AM PKT</span></div><div id="cp-ri-upc"></div></div>
          <div class="panel cp-ri-tip"><span class="icon-tile lime">${ic('message-circle')}</span><div><b>WhatsApp delivery</b><p>Invoices go out as a PDF with a Raast payment QR. 71% of WhatsApp invoices were paid within 5 days last quarter.</p></div></div>
        </div>
      </div>`);
      kpis(); FS.icons(sec);
    }
    function paint() { const f = $('#cp-ri-f .active', sec).dataset.f; $('#cp-ri-tb', sec).innerHTML = rows.filter((p) => f === 'all' || (f === 'paused' ? p.status === 'paused' : p.status !== 'paused')).map(tr).join(''); FS.icons($('#cp-ri-tb', sec)); }
    async function runNow(p, btn) {
      const trEl = btn.closest('tr');
      trEl.classList.add('cp-running');
      btn.disabled = true; btn.innerHTML = '<span class="cp-spin"></span>Generating…';
      await sleep(700);
      btn.innerHTML = `<span class="cp-spin"></span>${p.auto ? 'Sending…' : 'Posting…'}`;
      await sleep(600);
      const inv = `INV-2026-00${seq++}`;
      const nd = nextDates(parseIso(p.next), p.freq, p.every, 2)[1];
      p.next = iso(nd); p.runs++;
      const fresh = document.createElement('tbody'); fresh.innerHTML = tr(p);
      const nu = fresh.firstElementChild; trEl.replaceWith(nu); FS.icons(nu); nu.classList.add('row-flash');
      kpis();
      FS.toast(`${inv} raised for ${p.cust} · ${rs(p.amount)}${p.auto ? ' · sent via ' + p.ch.map((c) => (c === 'wa' ? 'WhatsApp' : 'email')).join(' & ') : ' · saved as draft'}`, { tone: 'good', action: { label: 'View', fn: () => FS.go('app/sales/invoices') } });
      celebrate($('[data-run]', nu));
    }

    /* ---------- create drawer ---------- */
    function openCreate() {
      const custs = (D.customers || []).filter((c) => c.group !== 'Cash');
      const items = (D.items || []);
      const lineRow = (it, q) => `<tr><td><select class="cp-ln-i">${items.map((x) => `<option value="${x.sku}" ${x.sku === it ? 'selected' : ''}>${x.sku} · ${esc(x.name)}</option>`).join('')}</select></td><td><input class="cp-ln-q num" type="number" min="1" value="${q}"></td><td class="num cp-ln-r"></td><td class="num cp-ln-a"></td><td><button class="icon-btn-sm cp-ln-x" title="Remove" data-menu="off">${ic('x')}</button></td></tr>`;
      const html = `
        <div class="form-grid">
          <label><span>Customer *</span><select id="cp-rf-c">${custs.map((c) => `<option>${esc(c.name)}</option>`).join('')}</select></label>
          <label><span>Profile name *</span><input id="cp-rf-n" value="Monthly supply agreement"></label>
        </div>
        <h4 class="cp-h4">Template lines</h4>
        <div class="table-wrap cp-ln-wrap"><table class="tbl lines cp-ln" data-plain><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th><th></th></tr></thead><tbody id="cp-rf-lines">${lineRow('PK-1001', 400)}${lineRow('PK-1003', 120)}</tbody>
        <tfoot><tr><td colspan="2"><button class="btn ghost sm" id="cp-rf-add" type="button">${ic('plus')}Add line</button></td><td class="num muted">+ GST 18%</td><td class="num" id="cp-rf-tot">0</td><td></td></tr></tfoot></table></div>
        <h4 class="cp-h4">Schedule</h4>
        <div class="seg cp-rf-fq" id="cp-rf-fq"><button data-f="weekly">Weekly</button><button class="active" data-f="monthly">Monthly</button><button data-f="quarterly">Quarterly</button><button data-f="custom">Custom</button></div>
        <div class="form-grid c3 cp-mt">
          <label><span>Start date</span><input type="date" id="cp-rf-s" value="2026-10-05"></label>
          <label><span>End</span><select id="cp-rf-em"><option value="never">Never</option><option value="date">On a date</option><option value="count">After N runs</option></select></label>
          <label id="cp-rf-every-w" hidden><span>Every (days)</span><input type="number" id="cp-rf-every" value="45" min="1"></label>
          <label id="cp-rf-ed-w" hidden><span>End date</span><input type="date" id="cp-rf-ed" value="2027-06-30"></label>
          <label id="cp-rf-cn-w" hidden><span>Number of runs</span><input type="number" id="cp-rf-cn" value="4" min="1"></label>
        </div>
        <div class="cp-tl6"><div class="cp-tl6-h"><b>Next 6 runs</b><small id="cp-rf-sum"></small></div><div class="cp-tl6-line" id="cp-rf-tl"></div></div>
        <h4 class="cp-h4">Delivery</h4>
        <div class="cp-deliv">
          <label class="cp-dv"><span class="cp-ch em">${ic('mail')}</span><div><b>Email</b><small>accounts@ customer address, PDF attached</small></div><label class="switch"><input type="checkbox" id="cp-rf-em1" checked><i></i></label></label>
          <label class="cp-dv"><span class="cp-ch wa">${ic('message-circle')}</span><div><b>WhatsApp</b><small>PDF + Raast QR to the customer's number</small></div><label class="switch"><input type="checkbox" id="cp-rf-wa1" checked><i></i></label></label>
          <label class="cp-dv"><span class="cp-ch dr">${ic('file-pen-line')}</span><div><b>Save as draft first</b><small>Review before anything is sent</small></div><label class="switch"><input type="checkbox" id="cp-rf-dr1"><i></i></label></label>
        </div>`;
      const dr = FS.drawer({ title: 'New recurring profile', subtitle: 'Raise the same invoice on a schedule', html, foot: `<button class="btn secondary" data-close>Cancel</button><button class="btn primary" id="cp-rf-save">${ic('check')}Save profile</button>`, wide: true });
      dr.classList.add('cp-ri-drawer');
      let freq = 'monthly';
      const calc = () => {
        let sub = 0;
        $$('#cp-rf-lines tr', dr).forEach((r) => { const it = items.find((x) => x.sku === $('.cp-ln-i', r).value) || { price: 0 }; const q = +$('.cp-ln-q', r).value || 0; $('.cp-ln-r', r).textContent = fmt(it.price); $('.cp-ln-a', r).textContent = fmt(it.price * q); sub += it.price * q; });
        const tot = Math.round(sub * 1.18);
        tick($('#cp-rf-tot', dr), tot, { local: true, prefix: 'Rs ' });
        return tot;
      };
      const tl = () => {
        const s = parseIso($('#cp-rf-s', dr).value || '2026-10-05');
        const em = $('#cp-rf-em', dr).value;
        $('#cp-rf-every-w', dr).hidden = freq !== 'custom'; $('#cp-rf-ed-w', dr).hidden = em !== 'date'; $('#cp-rf-cn-w', dr).hidden = em !== 'count';
        const end = em === 'date' ? parseIso($('#cp-rf-ed', dr).value) : null;
        const n = em === 'count' ? Math.min(6, +$('#cp-rf-cn', dr).value || 1) : 6;
        const ds = nextDates(s, freq, +$('#cp-rf-every', dr).value || 30, n, end);
        const tot = calc();
        $('#cp-rf-tl', dr).innerHTML = ds.map((d, i) => `<div class="cp-tl6-pt" style="--i:${i}"><i></i><b>${DOW[d.getDay()]}, ${dstr(d, false)}</b><small>${d.getFullYear()}</small><em>${i === 0 ? 'First run' : '+' + Math.round((d - ds[0]) / 864e5) + 'd'}</em></div>`).join('') || '<span class="muted small">End date is before the start date.</span>';
        $('#cp-rf-sum', dr).textContent = ds.length ? `${ds.length} invoices · ${rs(tot * ds.length)} in the window` : '';
      };
      dr.addEventListener('input', tl); dr.addEventListener('change', tl);
      $('#cp-rf-fq', dr).addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (b) { freq = b.dataset.f; setTimeout(tl); } });
      $('#cp-rf-add', dr).onclick = () => { const tb = $('#cp-rf-lines', dr); tb.insertAdjacentHTML('beforeend', lineRow(items[(tb.children.length * 3) % items.length].sku, 10)); FS.icons(tb.lastElementChild); tb.lastElementChild.classList.add('row-flash'); tl(); };
      $('#cp-rf-lines', dr).addEventListener('click', (e) => { const x = e.target.closest('.cp-ln-x'); if (x && $$('#cp-rf-lines tr', dr).length > 1) { x.closest('tr').remove(); tl(); } });
      tl();
      dr.closest('.overlay').querySelector('#cp-rf-save').onclick = async (e) => {
        const name = $('#cp-rf-n', dr).value.trim(); if (!name) { $('#cp-rf-n', dr).focus(); return; }
        await busy(e.currentTarget, 800, 'Saving…');
        const ch = []; if ($('#cp-rf-em1', dr).checked) ch.push('email'); if ($('#cp-rf-wa1', dr).checked) ch.push('wa');
        const p = { id: 'RP-00' + (32 + rows.length - P.length), cust: $('#cp-rf-c', dr).value, name, freq, every: +$('#cp-rf-every', dr).value || 30, next: $('#cp-rf-s', dr).value, amount: calc(), auto: !$('#cp-rf-dr1', dr).checked && ch.length > 0, ch: ch.length ? ch : ['email'], status: 'active', runs: 0, end: { never: 'Never', date: dstr(parseIso($('#cp-rf-ed', dr).value)), count: 'After ' + $('#cp-rf-cn', dr).value + ' runs' }[$('#cp-rf-em', dr).value] };
        rows.unshift(p);
        FS.closeOverlay(dr.closest('.overlay'));
        $$('#cp-ri-f button', sec).forEach((b) => b.classList.toggle('active', b.dataset.f === 'all'));
        paint(); kpis();
        const r0 = $('#cp-ri-tb tr', sec); r0.classList.add('row-flash');
        FS.toast(`${p.id} created · first invoice on ${dstr(parseIso(p.next))}`, { tone: 'good' });
        celebrate(r0);
      };
    }
    function mount(s) {
      sec = s; render();
      $('#cp-ri-new').onclick = openCreate;
      $('#cp-ri-f', sec).addEventListener('click', (e) => { if (e.target.closest('[data-f]')) setTimeout(paint); });
      $('#cp-ri-tb', sec).addEventListener('change', (e) => {
        if (!e.target.matches('[data-auto]')) return;
        const p = rows.find((x) => x.id === e.target.closest('tr').dataset.id); p.auto = e.target.checked;
        e.target.closest('td').querySelector('.cp-chs').classList.toggle('off', !p.auto);
        kpis();
        FS.toast(`Auto-send ${p.auto ? 'on' : 'off'} for ${p.cust}${p.auto ? '' : '; invoices will wait as drafts'}`, { tone: p.auto ? 'good' : 'info', ms: 2400 });
      });
      $('#cp-ri-tb', sec).addEventListener('click', (e) => {
        const trEl = e.target.closest('tr[data-id]'); if (!trEl) return;
        const p = rows.find((x) => x.id === trEl.dataset.id);
        const run = e.target.closest('[data-run]'); if (run) { runNow(p, run); return; }
        const more = e.target.closest('[data-more]');
        if (more) {
          e.stopPropagation();
          FS.menu(more, [
            { label: p.status === 'paused' ? 'Resume profile' : 'Pause profile', icon: p.status === 'paused' ? 'play' : 'pause', onClick: () => { p.status = p.status === 'paused' ? 'active' : 'paused'; paint(); kpis(); $(`tr[data-id="${p.id}"]`, sec).classList.add('row-flash'); FS.toast(`${p.id} ${p.status === 'paused' ? 'paused' : 'resumed'}`, { tone: 'info' }); } },
            { label: 'Skip next run', icon: 'skip-forward', onClick: () => { p.next = iso(nextDates(parseIso(p.next), p.freq, p.every, 2)[1]); paint(); kpis(); FS.toast(`Next run moved to ${dstr(parseIso(p.next))}`, { tone: 'info' }); } },
            { label: 'Preview invoice', icon: 'eye', onClick: () => FS.go('app/sales/invoices/view') },
            { sep: true },
            { label: 'Delete profile', icon: 'trash-2', danger: true, onClick: async () => { if (await confirmBox({ title: `Delete ${p.id}?`, text: 'Invoices already raised are kept. No further invoices will be generated.', okLabel: 'Delete', danger: true })) { const r = $(`tr[data-id="${p.id}"]`, sec); r.classList.add('row-out'); setTimeout(() => { rows = rows.filter((x) => x !== p); paint(); kpis(); }, 340); } } },
          ]);
        }
      });
    }
    FS.onEnter(ROUTE, (s, r, first) => { if (first) mount(s); });
  })();

  /* =====================================================================
     5. PRICE LISTS & SCHEMES  (app/sales/price-lists)
     ===================================================================== */
  (function priceLists() {
    const ROUTE = 'app/sales/price-lists';
    const ITEMS = (D.items || []);
    const LISTS = [
      { id: 'retail', name: 'Retail', code: 'PL-RTL', markup: 32, groups: ['Cash', 'Walk-in'], custs: 1240, color: 'green', round: 5, def: true },
      { id: 'whole', name: 'Wholesale', code: 'PL-WHS', markup: 20, groups: ['Retail Chain'], custs: 86, color: 'blue', round: 5 },
      { id: 'dist', name: 'Distributor', code: 'PL-DST', markup: 12, groups: ['Distributors', 'Sub-dealers'], custs: 14, color: 'orange', round: 1 },
      { id: 'corp', name: 'Corporate', code: 'PL-CRP', markup: 24, groups: ['Corporate', 'Hospitality'], custs: 42, color: 'violet', round: 5 },
    ];
    const roundTo = (v, r) => Math.round(v / r) * r;
    const prices = {}; // listId -> sku -> price
    LISTS.forEach((l) => { prices[l.id] = {}; ITEMS.forEach((it) => { prices[l.id][it.sku] = l.id === 'retail' ? it.price : roundTo(it.cost * (1 + l.markup / 100), l.round); }); });
    // a couple of deliberately thin margins so colour coding shows
    prices.dist['FD-5002'] = 1760; prices.dist['FD-5004'] = 770; prices.whole['IT-6001'] = 2290;
    let cur = 'whole', cat = 'All', sec;
    const SCHEMES = [
      { id: 'SC-014', t: 'Buy 10 get 1 free', sub: 'Shan Biryani Masala 60g', icon: 'gift', tone: 'lime', type: 'Free goods', from: '01 Oct 2026', to: '31 Oct 2026', on: true, used: 382, given: 'Rs 5,73,000', budget: 72, who: 'Retail Chain, Distributors' },
      { id: 'SC-015', t: '5% off over Rs 100,000', sub: 'Any invoice, all categories', icon: 'percent', tone: 'blue', type: 'Invoice discount', from: '15 Sep 2026', to: '31 Dec 2026', on: true, used: 64, given: 'Rs 4,12,600', budget: 41, who: 'All customers' },
      { id: 'SC-016', t: 'Ramzan bundle: Tapal + Shan', sub: 'Tapal Danedar 950g + 3 × Shan Masala', icon: 'package-plus', tone: 'orange', type: 'Bundle price', from: '18 Feb 2027', to: '20 Mar 2027', on: false, used: 0, given: 'Rs 0', budget: 0, who: 'Retail, Wholesale', upcoming: true },
      { id: 'SC-012', t: 'Flat Rs 50 per carton', sub: 'Corrugated Carton 5-Ply, min 500 pcs', icon: 'badge-percent', tone: 'violet', type: 'Line discount', from: '01 Aug 2026', to: '30 Sep 2026', on: false, used: 911, given: 'Rs 9,11,000', budget: 100, who: 'Corporate', ended: true },
      { id: 'SC-017', t: 'Free delivery in Lahore', sub: 'Orders above Rs 25,000', icon: 'truck', tone: 'green', type: 'Service', from: '01 Jul 2026', to: '30 Jun 2027', on: true, used: 1290, given: 'Rs 3,87,000', budget: 33, who: 'All customers' },
      { id: 'SC-018', t: '2% early-payment discount', sub: 'Paid within 10 days of invoice', icon: 'timer', tone: 'red', type: 'Settlement', from: '01 Jul 2026', to: '30 Jun 2027', on: true, used: 147, given: 'Rs 2,96,400', budget: 58, who: 'Corporate, Retail Chain' },
    ];
    const QB = { 'FD-5001': [[1, 11, 150], [12, 47, 145], [48, 143, 140], [144, null, 134]], 'PK-1001': [[1, 99, 112], [100, 499, 106], [500, 1999, 101], [2000, null, 96]], 'OF-2002': [[1, 9, 1690], [10, 49, 1620], [50, null, 1560]] };
    let qbItem = 'FD-5001', qbQty = 60;

    const marg = (p, c) => p > 0 ? ((p - c) / p) * 100 : 0;
    const mTone = (m) => m >= 20 ? 'good' : m >= 10 ? 'warn' : 'danger';
    function listRow(l) {
      const its = ITEMS.map((it) => marg(prices[l.id][it.sku], it.cost));
      const avg = its.reduce((a, b) => a + b, 0) / its.length;
      return `<button class="cp-pl-row${l.id === cur ? ' on' : ''}" data-l="${l.id}"><span class="cp-pl-dot ${l.color}"></span><div class="cp-pl-n"><b>${l.name}${l.def ? ' <span class="badge neutral">Default</span>' : ''}</b><small>${l.code} · ${fmt(l.custs)} customers</small><span class="cp-pl-g">${l.groups.map((g) => `<em>${g}</em>`).join('')}</span></div><div class="cp-pl-m"><b>+${l.markup}%</b><small>markup on cost</small><span class="badge ${mTone(avg)}">${avg.toFixed(1)}% avg margin</span></div></button>`;
    }
    function gridRows() {
      const l = LISTS.find((x) => x.id === cur);
      return ITEMS.filter((it) => cat === 'All' || it.cat === cat).map((it) => {
        const p = prices[cur][it.sku], m = marg(p, it.cost), rp = prices.retail[it.sku];
        return `<tr data-sku="${it.sku}"><td><b>${esc(it.name)}</b><small>${it.sku} · ${it.unit} · ${esc(it.brand)}</small></td><td class="num">${fmt(it.cost)}</td><td class="num muted">${fmt(rp)}</td>
          <td class="num"><input class="cp-pin num" value="${p}" inputmode="decimal" aria-label="${esc(it.name)} price" ${l.id === 'retail' ? '' : ''}></td>
          <td class="num"><span class="cp-mg ${mTone(m)}"><span class="t"><i style="width:${clamp(m, 0, 45) / 45 * 100}%"></i></span><b>${m.toFixed(1)}%</b></span></td>
          <td class="num cp-vsr ${p < rp ? 'dr' : ''}">${rp ? ((p - rp) / rp * 100).toFixed(1) + '%' : '—'}</td></tr>`;
      }).join('');
    }
    function paintEditor() {
      const l = LISTS.find((x) => x.id === cur);
      $('#cp-pl-ed-t', sec).innerHTML = `${l.name} prices <span class="badge neutral">${l.code}</span>`;
      $('#cp-pl-mk', sec).value = l.markup;
      $('#cp-pl-tb', sec).innerHTML = gridRows();
      summary();
    }
    function summary() {
      const vals = ITEMS.map((it) => marg(prices[cur][it.sku], it.cost));
      const low = vals.filter((m) => m < 10).length, avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      tick($('#cp-pl-avg', sec), avg, { local: true, dec: 1, suffix: '%' });
      $('#cp-pl-low', sec).textContent = low;
      $('#cp-pl-lowbox', sec).classList.toggle('bad', low > 0);
      $$('.cp-pl-row', sec).forEach((b) => { const l = LISTS.find((x) => x.id === b.dataset.l); const tmp = document.createElement('div'); tmp.innerHTML = listRow(l); b.querySelector('.cp-pl-m').innerHTML = tmp.firstElementChild.querySelector('.cp-pl-m').innerHTML; });
    }
    function schemeCard(s, i) {
      return `<div class="cp-sch${s.on ? ' on' : ''}${s.ended ? ' ended' : ''}" data-id="${s.id}" style="--i:${i}">
        <div class="cp-sch-top"><span class="icon-tile ${s.tone}">${ic(s.icon)}</span><span class="badge ${s.ended ? 'neutral' : s.upcoming ? 'info' : s.on ? 'good' : 'neutral'} dot cp-sch-st">${s.ended ? 'Ended' : s.upcoming ? 'Scheduled' : s.on ? 'Live' : 'Off'}</span><label class="switch" title="Active"><input type="checkbox" ${s.on ? 'checked' : ''} ${s.ended ? 'disabled' : ''}><i></i></label></div>
        <h4>${s.t}</h4><p>${s.sub}</p>
        <div class="cp-sch-meta"><span>${ic('calendar-range')}${s.from} → ${s.to}</span><span>${ic('users')}${s.who}</span></div>
        <div class="cp-sch-stats"><div><b>${fmt(s.used)}</b><small>Times applied</small></div><div><b>${s.given}</b><small>Discount given</small></div></div>
        <div class="cp-sch-bud"><small>Budget used <b>${s.budget}%</b></small><div class="progress ${s.budget > 90 ? 'danger' : s.budget > 60 ? 'warn' : ''}"><i style="width:${s.budget}%"></i></div></div>
        <div class="cp-sch-f"><span class="badge neutral">${s.type}</span><span class="spacer"></span><span class="muted small">${s.id}</span></div>
      </div>`;
    }
    function qbPaint() {
      const it = ITEMS.find((x) => x.sku === qbItem), tiers = QB[qbItem];
      $('#cp-qb-tb', sec).innerHTML = tiers.map((t, i) => `<tr data-i="${i}"><td><span class="cp-tier">T${i + 1}</span></td><td><input class="cp-qb-in num" data-k="0" value="${t[0]}" type="number" min="1"></td><td><input class="cp-qb-in num" data-k="1" value="${t[1] == null ? '' : t[1]}" placeholder="and above" type="number" min="1"></td><td><input class="cp-qb-in num" data-k="2" value="${t[2]}" type="number" min="1"></td><td class="num"><span class="badge ${t[2] < tiers[0][2] ? 'good' : 'neutral'}">${t[2] < tiers[0][2] ? '−' + ((1 - t[2] / tiers[0][2]) * 100).toFixed(1) + '%' : 'Base'}</span></td><td class="num"><span class="cp-mg ${mTone(marg(t[2], it.cost))} sm"><b>${marg(t[2], it.cost).toFixed(1)}%</b></span></td><td>${i > 0 ? `<button class="icon-btn-sm cp-qb-x" title="Remove tier" data-menu="off">${ic('trash-2')}</button>` : ''}</td></tr>`).join('');
      FS.icons($('#cp-qb-tb', sec));
      qbChart(); qbCalc();
    }
    function qbChart() {
      const it = ITEMS.find((x) => x.sku === qbItem), tiers = QB[qbItem];
      const W = 560, H = 230, pl = 46, pr = 14, pt = 16, pb = 30;
      const maxQ = Math.max(tiers[tiers.length - 1][0] * 1.5, qbQty * 1.1, 10);
      const maxP = tiers[0][2] * 1.04, minP = Math.min(it.cost * 0.98, ...tiers.map((t) => t[2])) * 0.98;
      const x = (q) => pl + (q / maxQ) * (W - pl - pr), y = (p) => pt + (1 - (p - minP) / (maxP - minP)) * (H - pt - pb);
      let d = '', area = '';
      tiers.forEach((t, i) => { const x0 = x(t[0] - (i === 0 ? 1 : 0)), x1 = x(i < tiers.length - 1 ? tiers[i + 1][0] : maxQ); d += `${i ? 'L' : 'M'}${x0.toFixed(1)},${y(t[2]).toFixed(1)} L${x1.toFixed(1)},${y(t[2]).toFixed(1)} `; });
      area = d + `L${x(maxQ).toFixed(1)},${H - pb} L${x(0).toFixed(1)},${H - pb} Z`;
      const ticks = 4, grid = Array.from({ length: ticks + 1 }, (_, i) => minP + ((maxP - minP) * i) / ticks);
      const tierIdx = tiers.findIndex((t, i) => qbQty >= t[0] && (t[1] == null || qbQty <= t[1] || (i < tiers.length - 1 && qbQty < tiers[i + 1][0])));
      const tp = tiers[Math.max(0, tierIdx)][2];
      $('#cp-qb-chart', sec).innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="cp-qb-svg" preserveAspectRatio="none">
        ${grid.map((g) => `<line x1="${pl}" x2="${W - pr}" y1="${y(g)}" y2="${y(g)}" class="gl"/><text x="${pl - 8}" y="${y(g) + 4}" class="ax" text-anchor="end">${fmt(g)}</text>`).join('')}
        <line x1="${pl}" x2="${W - pr}" y1="${y(it.cost)}" y2="${y(it.cost)}" class="cost"/><text x="${W - pr}" y="${y(it.cost) - 6}" class="ax cost-t" text-anchor="end">Cost ${fmt(it.cost)}</text>
        <path d="${area}" class="ar"/><path d="${d}" class="ln"/>
        ${tiers.map((t, i) => `<circle cx="${x(t[0])}" cy="${y(t[2])}" r="4.5" class="pt"/><text x="${x(t[0]) + 6}" y="${y(t[2]) - 8}" class="tl">T${i + 1} · ${fmt(t[2])}</text><text x="${x(t[0])}" y="${H - 10}" class="ax" text-anchor="middle">${fmt(t[0])}</text>`).join('')}
        <line x1="${x(qbQty)}" x2="${x(qbQty)}" y1="${pt}" y2="${H - pb}" class="you"/><circle cx="${x(qbQty)}" cy="${y(tp)}" r="6" class="you-pt"/>
      </svg>`;
    }
    function qbCalc() {
      const it = ITEMS.find((x) => x.sku === qbItem), tiers = QB[qbItem];
      let t = tiers[0]; tiers.forEach((tt) => { if (qbQty >= tt[0]) t = tt; });
      const base = tiers[0][2] * qbQty, tot = t[2] * qbQty;
      tick($('#cp-qb-unit', sec), t[2], { prefix: 'Rs ', dec: 0, local: true });
      tick($('#cp-qb-tot', sec), tot, { prefix: 'Rs ', dec: 0 });
      $('#cp-qb-save', sec).innerHTML = base > tot ? `Saves <b>${rs(base - tot)}</b> vs base price (T${tiers.indexOf(t) + 1})` : `Base price applies (T1). Next tier at ${fmt((tiers[1] || [0])[0])} ${it.unit.toLowerCase()}s.`;
    }

    function render() {
      sec.insertAdjacentHTML('beforeend', `
      <div data-tabs class="cp-pl">
        <div class="tabs"><button class="active" data-tab="lists">${ic('list')}Price lists</button><button data-tab="schemes">${ic('gift')}Schemes <span class="badge neutral">${SCHEMES.filter((s) => s.on).length} live</span></button><button data-tab="breaks">${ic('chart-no-axes-column-decreasing')}Quantity breaks</button></div>
        <div class="tab-pane active" data-pane="lists">
          <div class="split-l cp-pl-split">
            <div class="panel cp-pl-lists"><div class="panel-head"><div><h3>Price lists</h3><p>Assigned by customer group</p></div><button class="btn ghost sm icon" id="cp-pl-add" title="New list">${ic('plus')}</button></div><div id="cp-pl-lists">${LISTS.map(listRow).join('')}</div>
              <div class="cp-pl-legend"><span><i class="good"></i>≥ 20% margin</span><span><i class="warn"></i>10–20%</span><span><i class="danger"></i>&lt; 10%</span></div></div>
            <div class="panel flush cp-pl-ed">
              <div class="panel-head"><div><h3 id="cp-pl-ed-t"></h3><p>Edit any price. Margin is recalculated on cost as you type.</p></div>
                <div class="cp-pl-stat"><div><b id="cp-pl-avg">0%</b><small>Avg margin</small></div><div id="cp-pl-lowbox"><b id="cp-pl-low">0</b><small>Below 10%</small></div></div></div>
              <div class="toolbar cp-pl-tools">
                <div class="chips" id="cp-pl-cat">${['All', ...new Set(ITEMS.map((i) => i.cat))].map((c, i) => `<button class="${i ? '' : 'active'}" data-c="${c}">${c}</button>`).join('')}</div>
                <span class="spacer"></span>
                <label class="cp-mk"><span>Markup on cost</span><input id="cp-pl-mk" type="number" step="1" min="0">%</label>
                <button class="btn secondary sm" id="cp-pl-apply">${ic('wand-sparkles')}Apply to all</button>
                <button class="btn primary sm" id="cp-pl-save">${ic('save')}Save</button>
              </div>
              <div class="table-wrap"><table class="tbl cp-pl-tbl" data-plain><thead><tr><th>Item</th><th class="num">Cost</th><th class="num">Retail</th><th class="num">List price</th><th class="num">Margin</th><th class="num">vs Retail</th></tr></thead><tbody id="cp-pl-tb"></tbody></table></div>
            </div>
          </div>
        </div>
        <div class="tab-pane" data-pane="schemes">
          <div class="cp-sch-strip"><div class="pill">${ic('zap')}<b>${SCHEMES.filter((s) => s.on).length}</b> live schemes</div><div class="pill">${ic('coins')}Discount given FY27 <b>Rs 25,80,000</b></div><div class="pill">${ic('trending-up')}Scheme sales uplift <b class="up">+14.2%</b></div><span class="spacer"></span><div class="seg" id="cp-sch-f"><button class="active" data-f="all">All</button><button data-f="live">Live</button><button data-f="off">Off / ended</button></div></div>
          <div class="cp-sch-grid" id="cp-sch-grid">${SCHEMES.map(schemeCard).join('')}</div>
        </div>
        <div class="tab-pane" data-pane="breaks">
          <div class="split cp-qb-split">
            <div class="panel">
              <div class="panel-head"><div><h3>Quantity-break builder</h3><p>Lower unit prices for bigger orders. Applies on top of the customer's price list.</p></div>
                <select id="cp-qb-item">${Object.keys(QB).map((k) => { const it = ITEMS.find((x) => x.sku === k); return `<option value="${k}">${k} · ${esc(it.name)}</option>`; }).join('')}</select></div>
              <div class="table-wrap"><table class="tbl lines cp-qb-tbl" data-plain><thead><tr><th>Tier</th><th>Min qty</th><th>Max qty</th><th>Unit price (Rs)</th><th class="num">Off base</th><th class="num">Margin</th><th></th></tr></thead><tbody id="cp-qb-tb"></tbody></table></div>
              <div class="row cp-mt"><button class="btn ghost sm" id="cp-qb-add">${ic('plus')}Add tier</button><span class="spacer"></span><button class="btn primary sm" id="cp-qb-savebtn">${ic('save')}Save slabs</button></div>
              <div class="cp-qb-chart" id="cp-qb-chart"></div>
            </div>
            <div class="stack">
              <div class="panel cp-qb-calc"><div class="panel-head"><div><h3>Try it</h3><p>What would this order cost?</p></div></div>
                <label class="cp-qb-q"><span>Order quantity</span><input type="range" id="cp-qb-range" min="1" max="300" value="${qbQty}"><input type="number" id="cp-qb-qty" value="${qbQty}" min="1"></label>
                <div class="cp-qb-res"><div><small>Unit price</small><b id="cp-qb-unit">Rs 0</b></div><div><small>Order total</small><b id="cp-qb-tot">Rs 0</b></div></div>
                <p class="cp-qb-save" id="cp-qb-save"></p>
              </div>
              <div class="banner info">${ic('info')}<div><b>Stacking rules</b><p>Quantity breaks stack with schemes, but never take the line below cost. Margin guard blocks anything under 5%.</p></div></div>
            </div>
          </div>
        </div>
      </div>`);
      paintEditor(); qbPaint(); FS.icons(sec);
    }
    function mount(s) {
      sec = s; render();
      $('#cp-pl-lists', sec).addEventListener('click', (e) => { const b = e.target.closest('[data-l]'); if (!b) return; cur = b.dataset.l; $$('.cp-pl-row', sec).forEach((x) => x.classList.toggle('on', x === b)); FS.skeleton ? FS.skeleton($('.cp-pl-ed', sec), 350) : null; paintEditor(); });
      $('#cp-pl-cat', sec).addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (!b) return; cat = b.dataset.c; paintEditor(); });
      $('#cp-pl-tb', sec).addEventListener('input', (e) => {
        if (!e.target.matches('.cp-pin')) return;
        const trEl = e.target.closest('tr'), sku = trEl.dataset.sku, it = ITEMS.find((x) => x.sku === sku);
        const v = parseFloat(e.target.value.replace(/,/g, '')) || 0; prices[cur][sku] = v;
        const m = marg(v, it.cost), mg = $('.cp-mg', trEl);
        mg.className = 'cp-mg ' + mTone(m); $('i', mg).style.width = clamp(m, 0, 45) / 45 * 100 + '%'; $('b', mg).textContent = m.toFixed(1) + '%';
        const rp = prices.retail[sku]; const vs = $('.cp-vsr', trEl); vs.textContent = ((v - rp) / rp * 100).toFixed(1) + '%'; vs.classList.toggle('dr', v < rp);
        trEl.classList.toggle('cp-dirty', true);
        summary();
      });
      $('#cp-pl-apply', sec).onclick = async (e) => {
        const l = LISTS.find((x) => x.id === cur), mk = parseFloat($('#cp-pl-mk', sec).value) || 0;
        await busy(e.currentTarget, 500, 'Applying…');
        l.markup = mk;
        ITEMS.forEach((it) => { prices[cur][it.sku] = roundTo(it.cost * (1 + mk / 100), l.round); });
        paintEditor();
        $$('#cp-pl-tb tr', sec).forEach((r, i) => setTimeout(() => r.classList.add('row-flash'), i * 25));
        FS.toast(`${l.name}: cost + ${mk}% applied to ${ITEMS.length} items, rounded to Rs ${l.round}`, { tone: 'good' });
      };
      $('#cp-pl-save', sec).onclick = async (e) => {
        const n = $$('#cp-pl-tb tr.cp-dirty', sec).length;
        await busy(e.currentTarget, 800, 'Saving…');
        $$('#cp-pl-tb tr.cp-dirty', sec).forEach((r) => r.classList.remove('cp-dirty'));
        FS.toast(`${LISTS.find((x) => x.id === cur).name} price list saved${n ? ` · ${n} prices changed` : ''}; effective from tomorrow`, { tone: 'good' });
      };
      $('#cp-pl-add', sec).onclick = () => FS.toast('New price list: start by copying an existing list', { tone: 'info' });
      $('#cp-pl-export').onclick = () => { download(`price_list_${cur}.csv`, csv([['SKU', 'Item', 'Cost', ...LISTS.map((l) => l.name)], ...ITEMS.map((it) => [it.sku, it.name, it.cost, ...LISTS.map((l) => prices[l.id][it.sku])])])); FS.toast('All price lists exported to CSV', { tone: 'good' }); };
      $('#cp-sch-grid', sec).addEventListener('change', (e) => {
        const card = e.target.closest('.cp-sch'); if (!card) return;
        const s2 = SCHEMES.find((x) => x.id === card.dataset.id); s2.on = e.target.checked;
        if (s2.on) s2.upcoming = false;
        const tmp = document.createElement('div'); tmp.innerHTML = schemeCard(s2, 0); const nu = tmp.firstElementChild; nu.style.animation = 'none';
        card.replaceWith(nu); FS.icons(nu); nu.classList.add('cp-pulse');
        FS.toast(`${s2.t} ${s2.on ? 'is now live' : 'switched off'}`, { tone: s2.on ? 'good' : 'info', ms: 2200 });
      });
      $('#cp-sch-f', sec).addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (!b) return; const f = b.dataset.f; $$('.cp-sch', sec).forEach((c) => { const on = c.classList.contains('on'); c.hidden = (f === 'live' && !on) || (f === 'off' && on); }); });
      $('#cp-pl-new').onclick = () => {
        const dr = FS.drawer({ title: 'New scheme', subtitle: 'Trade promotion with dates, eligibility and a budget cap', html: `
          <div class="cp-sch-types">${[['gift', 'Free goods', 'Buy X get Y free'], ['percent', 'Invoice discount', '% off above a value'], ['package-plus', 'Bundle price', 'Fixed price for a set'], ['badge-percent', 'Line discount', 'Rs or % off an item']].map((t, i) => `<button class="cp-st${i ? '' : ' on'}" data-t="${t[1]}"><span class="icon-well sm">${ic(t[0])}</span><b>${t[1]}</b><small>${t[2]}</small></button>`).join('')}</div>
          <div class="form-grid cp-mt"><label class="full"><span>Scheme name *</span><input id="cp-ns-n" value="Buy 12 get 1 free"></label><label><span>Item</span><select>${ITEMS.map((x) => `<option>${esc(x.name)}</option>`).join('')}</select></label><label><span>Eligible groups</span><select><option>All customers</option><option>Retail Chain</option><option>Distributors</option><option>Corporate</option></select></label><label><span>From</span><input type="date" value="2026-10-05"></label><label><span>To</span><input type="date" value="2026-11-30"></label><label><span>Budget cap (Rs)</span><input value="500000"></label><label><span>Max uses per customer</span><input type="number" value="4"></label></div>`,
          foot: `<button class="btn secondary" data-close>Cancel</button><button class="btn primary" id="cp-ns-save">${ic('check')}Create scheme</button>` });
        dr.addEventListener('click', (e) => { const b = e.target.closest('.cp-st'); if (b) $$('.cp-st', dr).forEach((x) => x.classList.toggle('on', x === b)); });
        dr.closest('.overlay').querySelector('#cp-ns-save').onclick = async (e) => {
          await busy(e.currentTarget, 700, 'Creating…');
          const t = $('.cp-st.on', dr).dataset.t;
          const s2 = { id: 'SC-0' + (19 + SCHEMES.length - 6), t: $('#cp-ns-n', dr).value || 'New scheme', sub: 'Just created', icon: 'sparkles', tone: 'lime', type: t, from: '05 Oct 2026', to: '30 Nov 2026', on: true, used: 0, given: 'Rs 0', budget: 0, who: 'All customers' };
          SCHEMES.unshift(s2);
          FS.closeOverlay(dr.closest('.overlay'));
          const tabBtn = $('[data-tab="schemes"]', sec); tabBtn.click();
          const grid = $('#cp-sch-grid', sec); grid.insertAdjacentHTML('afterbegin', schemeCard(s2, 0)); FS.icons(grid.firstElementChild); grid.firstElementChild.classList.add('cp-pulse');
          celebrate(grid.firstElementChild); FS.toast(`${s2.t} created and live`, { tone: 'good' });
        };
      };
      /* quantity breaks */
      $('#cp-qb-item', sec).onchange = (e) => { qbItem = e.target.value; qbPaint(); };
      $('#cp-qb-tb', sec).addEventListener('input', (e) => {
        if (!e.target.matches('.cp-qb-in')) return;
        const i = +e.target.closest('tr').dataset.i, k = +e.target.dataset.k, v = e.target.value === '' ? null : +e.target.value;
        QB[qbItem][i][k] = v;
        if (k === 1 && v != null && QB[qbItem][i + 1]) { QB[qbItem][i + 1][0] = v + 1; const nx = $(`#cp-qb-tb tr[data-i="${i + 1}"] [data-k="0"]`, sec); if (nx) nx.value = v + 1; }
        if (k === 2) { const trEl = e.target.closest('tr'); const it = ITEMS.find((x) => x.sku === qbItem); const m = marg(v || 0, it.cost); const mg = $('.cp-mg', trEl); mg.className = 'cp-mg sm ' + mTone(m); $('b', mg).textContent = m.toFixed(1) + '%'; }
        qbChart(); qbCalc();
      });
      $('#cp-qb-tb', sec).addEventListener('click', (e) => { const x = e.target.closest('.cp-qb-x'); if (!x) return; const i = +x.closest('tr').dataset.i; QB[qbItem].splice(i, 1); QB[qbItem][QB[qbItem].length - 1][1] = null; qbPaint(); });
      $('#cp-qb-add', sec).onclick = () => {
        const t = QB[qbItem], last = t[t.length - 1];
        const mn = Math.max(last[0] * 2, last[0] + 10);
        last[1] = mn - 1; t.push([mn, null, Math.round(last[2] * 0.96)]);
        qbPaint(); const r = $('#cp-qb-tb tr:last-child', sec); r.classList.add('row-flash');
      };
      $('#cp-qb-savebtn', sec).onclick = async (e) => { await busy(e.currentTarget, 700, 'Saving…'); FS.toast(`${QB[qbItem].length} quantity slabs saved for ${qbItem}`, { tone: 'good' }); };
      const setQ = (v) => { qbQty = clamp(+v || 1, 1, 5000); $('#cp-qb-qty', sec).value = qbQty; $('#cp-qb-range', sec).value = Math.min(qbQty, 300); qbChart(); qbCalc(); };
      $('#cp-qb-range', sec).oninput = (e) => setQ(e.target.value);
      $('#cp-qb-qty', sec).oninput = (e) => setQ(e.target.value);
    }
    FS.onEnter(ROUTE, (s, r, first) => { if (first) mount(s); });
  })();

  /* =====================================================================
     6. PAYMENT REMINDERS  (app/receivables/reminders)
     ===================================================================== */
  (function reminders() {
    const ROUTE = 'app/receivables/reminders';
    const TPL = {
      gentle: { name: 'Gentle heads-up', en: 'Assalam o Alaikum {customer}, a friendly reminder that invoice {invoice} for {amount} is due on {due_date}. You can pay instantly via Raast using the QR in the attached PDF. Thank you for your business! – Al-Noor Enterprises',
        ur: 'السلام علیکم {customer}، یاد دہانی کے طور پر عرض ہے کہ انوائس {invoice} کی رقم {amount} کی ادائیگی {due_date} کو واجب الادا ہے۔ آپ منسلک PDF میں موجود Raast QR کے ذریعے فوری ادائیگی کر سکتے ہیں۔ شکریہ! – النور انٹرپرائزز' },
      due: { name: 'Due today', en: 'Dear {customer}, invoice {invoice} for {amount} is due today ({due_date}). Please arrange payment to Meezan Bank 0123 or via Raast. Reply PAID if already settled. – Al-Noor Enterprises',
        ur: 'محترم {customer}، انوائس {invoice} کی رقم {amount} آج ({due_date}) واجب الادا ہے۔ براہ کرم میزان بینک 0123 یا Raast کے ذریعے ادائیگی فرمائیں۔ اگر ادائیگی ہو چکی ہے تو PAID لکھ کر جواب دیں۔' },
      firm: { name: 'Firm follow-up', en: 'Dear {customer}, our records show invoice {invoice} for {amount} is now overdue (due {due_date}). Kindly clear the balance at the earliest to avoid any interruption in supplies. For queries call 042 3512 8800.',
        ur: 'محترم {customer}، ہمارے ریکارڈ کے مطابق انوائس {invoice} کی رقم {amount} ({due_date} سے) واجب الادا ہے۔ سپلائی میں تعطل سے بچنے کے لیے براہ کرم جلد از جلد ادائیگی فرمائیں۔ رابطہ: 042 3512 8800' },
      final: { name: 'Final notice + hold', en: 'FINAL NOTICE: {customer}, invoice {invoice} for {amount} is 15+ days overdue (due {due_date}). New orders are on credit hold until payment is received. Our Sales Manager will call you today.',
        ur: 'حتمی نوٹس: {customer}، انوائس {invoice} کی رقم {amount} ({due_date}) پندرہ دن سے زائد واجب الادا ہے۔ ادائیگی موصول ہونے تک نئے آرڈرز روک دیے گئے ہیں۔ ہمارے سیلز مینیجر آج آپ سے رابطہ کریں گے۔' },
    };
    let rules = [
      { id: 'r1', off: -3, label: '3 days before due', ch: { wa: true, sms: false, email: true }, tpl: 'gentle', on: true, sent: 412, tone: 'info' },
      { id: 'r2', off: 0, label: 'On due date', ch: { wa: true, sms: true, email: true }, tpl: 'due', on: true, sent: 386, tone: 'warn' },
      { id: 'r3', off: 7, label: '7 days after due', ch: { wa: true, sms: true, email: false }, tpl: 'firm', on: true, sent: 141, tone: 'orange' },
      { id: 'r4', off: 15, label: '15 days after due', ch: { wa: true, sms: false, email: true }, tpl: 'final', on: true, sent: 37, tone: 'danger', esc: true },
    ];
    const OVER = [
      { c: 'Al-Fatah Stores', inv: 'INV-2026-000874', amt: 318290, due: '2026-09-02', phone: '0300-4761234', last: '24 Sep · WhatsApp' },
      { c: 'City Mart Superstores', inv: 'INV-2026-000902', amt: 189100, due: '2026-09-14', phone: '0321-4557890', last: '21 Sep · SMS' },
      { c: 'Interloop Ltd', inv: 'INV-2026-000911', amt: 405000, due: '2026-09-16', phone: '041-8711021', last: '23 Sep · Email' },
      { c: 'Hashoo Hotels', inv: 'INV-2026-000918', amt: 219480, due: '2026-09-21', phone: '051-2272890', last: '28 Sep · WhatsApp' },
      { c: 'Engro Foods', inv: 'INV-2026-000925', amt: 640000, due: '2026-09-24', phone: '021-111-211-211', last: 'Never' },
      { c: 'Packages Ltd', inv: 'INV-2026-000934', amt: 163200, due: '2026-09-28', phone: '042-35811541', last: 'Never' },
    ];
    let LOG = [
      ['01 Oct, 09:00', 'Shifa International', 'INV-2026-000951', 'wa', '3 days before due', 'read'],
      ['01 Oct, 09:00', 'Metro Cash & Carry', 'INV-2026-000948', 'email', '3 days before due', 'delivered'],
      ['01 Oct, 09:00', 'Packages Ltd', 'INV-2026-000934', 'sms', '7 days after due', 'delivered'],
      ['30 Sep, 09:00', 'Hashoo Hotels', 'INV-2026-000918', 'wa', '7 days after due', 'read'],
      ['30 Sep, 09:00', 'Fatima Group', 'INV-2026-000940', 'wa', 'On due date', 'read'],
      ['29 Sep, 09:00', 'Engro Foods', 'INV-2026-000925', 'email', 'On due date', 'failed'],
      ['28 Sep, 09:00', 'Al-Fatah Stores', 'INV-2026-000874', 'wa', '15 days after due', 'read'],
    ];
    let sel = 'r3', lang = 'en', chan = 'wa', cust = 0, sec;
    const due = (o) => Math.round((TODAY - parseIso(o.due)) / 864e5);
    const ruleFor = (o) => { const d = due(o); return d >= 15 ? 'r4' : d >= 7 ? 'r3' : d >= 0 ? 'r2' : 'r1'; };
    const CH = { wa: ['message-circle', 'WhatsApp'], sms: ['message-square-text', 'SMS'], email: ['mail', 'Email'] };
    const fill = (t, o) => t.replace(/\{(\w+)\}/g, (m, k) => `<mark>${esc({ customer: o.c, invoice: o.inv, amount: rs(o.amt), due_date: dstr(parseIso(o.due)) }[k] || m)}</mark>`);
    const offTxt = (n) => n === 0 ? 'Due' : (n > 0 ? '+' : '−') + Math.abs(n) + 'd';

    function ruleHtml(r, i) {
      return `<div class="cp-rule${r.id === sel ? ' on' : ''}${r.on ? '' : ' off'}" data-id="${r.id}" style="--i:${i}" tabindex="0">
        <span class="cp-rule-off ${r.tone}">${offTxt(r.off)}</span>
        <div class="cp-rule-b">
          <div class="cp-rule-h"><b>${r.label}</b><small>${fmt(r.sent)} sent this quarter</small><span class="spacer"></span><label class="switch" title="Enable rule"><input type="checkbox" data-on ${r.on ? 'checked' : ''}><i></i></label></div>
          <div class="cp-rule-c">${Object.keys(CH).map((k) => `<button class="cp-chtog ${k}${r.ch[k] ? ' on' : ''}" data-ch="${k}" title="${CH[k][1]}">${ic(CH[k][0])}<span>${CH[k][1]}</span></button>`).join('')}
            <select data-tpl>${Object.entries(TPL).map(([k, t]) => `<option value="${k}" ${k === r.tpl ? 'selected' : ''}>${t.name}</option>`).join('')}</select></div>
          ${r.esc ? `<div class="cp-rule-esc">${ic('siren')}<span>Escalate to <b>Zainab Raza</b> (Sales Manager) and place account on credit hold</span></div>` : ''}
        </div>
      </div>`;
    }
    function preview() {
      const r = rules.find((x) => x.id === sel), o = OVER[cust], t = TPL[r.tpl][lang];
      const avail = Object.keys(CH).filter((k) => r.ch[k]);
      if (!r.ch[chan]) chan = avail[0] || 'wa';
      $$('#cp-rm-pch button', sec).forEach((b) => { b.classList.toggle('active', b.dataset.c === chan); b.disabled = !r.ch[b.dataset.c]; });
      const ph = $('#cp-rm-phone', sec);
      ph.className = 'cp-phone ' + chan;
      const body = fill(t, o), rtl = lang === 'ur' ? ' dir="rtl" lang="ur"' : '';
      const time = '9:00 AM';
      let inner;
      if (chan === 'wa') inner = `<div class="cp-ph-bar wa"><span class="cp-ph-back">${ic('chevron-left')}</span><span class="avatar xs lime">AN</span><div><b>Al-Noor Enterprises ${ic('badge-check')}</b><small>Business account</small></div><span class="spacer"></span>${ic('phone')}</div>
        <div class="cp-ph-chat"><span class="cp-ph-day">Today</span><div class="cp-bub in cp-pop"${rtl}><div class="cp-pdf">${ic('file-text')}<div><b>${o.inv}.pdf</b><small>1 page · PDF · Raast QR</small></div></div><p>${body}</p><span class="cp-bub-t">${time} <i class="cp-ticks read">${ic('check-check')}</i></span></div>
        ${r.esc ? `<div class="cp-bub sys">Escalated to Zainab Raza · credit hold applied</div>` : ''}</div>
        <div class="cp-ph-in"><span>Message</span>${ic('mic')}</div>`;
      else if (chan === 'sms') inner = `<div class="cp-ph-bar sms"><span class="cp-ph-back">${ic('chevron-left')}</span><div class="cp-center-t"><b>ALNOOR</b><small>Text message</small></div></div>
        <div class="cp-ph-chat sms"><span class="cp-ph-day">Today ${time}</span><div class="cp-bub sms cp-pop"${rtl}><p>${body.replace(/ You can pay[^.]*\./, '')}</p></div><small class="cp-sms-n">${Math.ceil(t.length / 160)} SMS segments · ${t.length} chars</small></div>`;
      else inner = `<div class="cp-ph-bar mail"><span class="cp-ph-back">${ic('chevron-left')}</span><b>Inbox</b></div>
        <div class="cp-mail cp-pop"><div class="cp-mail-h"><span class="avatar sm lime">AN</span><div><b>Al-Noor Enterprises</b><small>accounts@alnoor.com.pk · to ${esc(o.c.toLowerCase().replace(/[^a-z]+/g, '.'))}@mail.pk</small></div></div>
          <h5>${r.off < 0 ? 'Upcoming payment' : r.off === 0 ? 'Payment due today' : 'Overdue'}: ${o.inv}</h5><p${rtl}>${body}</p><div class="cp-mail-btn">Pay ${rs(o.amt)} now</div><div class="cp-pdf">${ic('paperclip')}<div><b>${o.inv}.pdf</b><small>84 KB</small></div></div></div>`;
      ph.querySelector('.cp-ph-scr').innerHTML = inner;
      FS.icons(ph);
      $('#cp-rm-rule-t', sec).textContent = r.label;
      $('#cp-rm-vars', sec).innerHTML = [['customer', o.c], ['invoice', o.inv], ['amount', rs(o.amt)], ['due_date', dstr(parseIso(o.due))]].map((v) => `<span><code>{${v[0]}}</code>${esc(v[1])}</span>`).join('');
    }
    function overRow(o, i) {
      const d = due(o), r = rules.find((x) => x.id === ruleFor(o));
      return `<tr data-i="${i}"><td><div class="cell-user">${av(o.c)}<div><b>${esc(o.c)}</b><small>${o.phone}</small></div></div></td><td><a class="link" href="#/app/sales/invoices/view">${o.inv}</a><small>Due ${dstr(parseIso(o.due))}</small></td>
        <td><span class="badge ${d >= 15 ? 'danger' : d >= 7 ? 'warn' : 'info'}">${d} days</span></td><td class="num"><b>${fmt(o.amt)}</b></td><td><small class="cp-rmuted">${r.label}</small></td><td class="cp-last">${o.last}</td>
        <td class="actions"><button class="btn secondary sm cp-send" data-send>${ic('send')}Send now</button></td></tr>`;
    }
    const stB = (s) => s === 'read' ? `<span class="cp-dst read">${ic('check-check')}Read</span>` : s === 'delivered' ? `<span class="cp-dst dlv">${ic('check-check')}Delivered</span>` : s === 'sent' ? `<span class="cp-dst snt">${ic('check')}Sent</span>` : `<span class="cp-dst fail">${ic('circle-x')}Failed</span>`;
    const logRow = (l) => `<tr data-qv-route="app/receivables/ageing"><td>${l[0]}</td><td><b>${esc(l[1])}</b></td><td>${l[2]}</td><td><span class="cp-ch ${l[3] === 'wa' ? 'wa' : l[3] === 'sms' ? 'sm' : 'em'}">${ic(CH[l[3]][0])}</span>${CH[l[3]][1]}</td><td>${l[4]}</td><td>${stB(l[5])}</td></tr>`;

    function render() {
      const total = OVER.reduce((s, o) => s + o.amt, 0);
      sec.insertAdjacentHTML('beforeend', `
      <div class="kpi-grid">
        <div class="kpi red"><div class="kpi-top"><span>Overdue receivables</span><span class="icon-well">${ic('hourglass')}</span></div><strong id="cp-rm-k1">${rs(total)}</strong><small>${OVER.length} customers past due</small></div>
        <div class="kpi"><div class="kpi-top"><span>Reminders sent (Q2)</span><span class="icon-well">${ic('send')}</span></div><strong id="cp-rm-k2">976</strong><small class="up">94.8% delivered</small></div>
        <div class="kpi blue"><div class="kpi-top"><span>Read rate on WhatsApp</span><span class="icon-well">${ic('check-check')}</span></div><strong>88%</strong><small>vs 31% for email</small></div>
        <div class="kpi yellow"><div class="kpi-top"><span>Paid within 3 days of reminder</span><span class="icon-well">${ic('badge-dollar-sign')}</span></div><strong>Rs 8,412,600</strong><small class="up">▲ DSO down 6 days</small></div>
      </div>
      <div class="split cp-rm-split">
        <div class="panel cp-rm-sched">
          <div class="panel-head"><div><h3>Reminder schedule</h3><p>Runs every morning at 9:00 AM. Click a rule to preview it.</p></div><button class="btn ghost sm" id="cp-rm-add">${ic('plus')}Add rule</button></div>
          <div class="cp-rm-axis"><span>Before due</span><i></i><span>Due date</span><i></i><span>Overdue</span></div>
          <div class="cp-rules" id="cp-rm-rules">${rules.map(ruleHtml).join('')}</div>
          <div class="cp-rm-guard">${ic('shield-check')}<span>Quiet hours 9 PM–9 AM and Fridays 12:30–2:30 PM. Customers who reply <b>PAID</b> are paused for 48h.</span></div>
        </div>
        <div class="panel cp-rm-prev">
          <div class="panel-head"><div><h3>Live preview</h3><p id="cp-rm-rule-t"></p></div><div class="seg" id="cp-rm-lang"><button class="active" data-l="en">English</button><button data-l="ur">اردو</button></div></div>
          <div class="cp-rm-pctl"><div class="seg" id="cp-rm-pch"><button data-c="wa">${ic('message-circle')}WhatsApp</button><button data-c="sms">${ic('message-square-text')}SMS</button><button data-c="email">${ic('mail')}Email</button></div>
            <select id="cp-rm-cust">${OVER.map((o, i) => `<option value="${i}">${esc(o.c)}</option>`).join('')}</select></div>
          <div class="cp-phone wa" id="cp-rm-phone"><div class="cp-ph-notch"></div><div class="cp-ph-scr"></div></div>
          <div class="cp-rm-vars" id="cp-rm-vars"></div>
        </div>
      </div>
      <div class="panel flush">
        <div class="panel-head"><div><h3>Overdue customers</h3><p>Send a reminder right now with the rule that matches their age</p></div><div class="panel-actions"><button class="btn secondary sm" id="cp-rm-sendall">${ic('send')}Send to all ${OVER.length}</button></div></div>
        <div class="table-wrap"><table class="tbl cp-rm-over" data-plain><thead><tr><th>Customer</th><th>Invoice</th><th>Overdue</th><th class="num">Amount (Rs)</th><th>Rule</th><th>Last reminder</th><th></th></tr></thead><tbody id="cp-rm-otb">${OVER.map(overRow).join('')}</tbody></table></div>
      </div>
      <div class="panel flush">
        <div class="panel-head"><div><h3>Sent log</h3><p>Delivery receipts from WhatsApp Business API, Jazz SMS gateway and email</p></div><div class="panel-actions"><label class="search-field cp-sf"><i data-lucide="search"></i><input placeholder="Search log…"></label></div></div>
        <div class="table-wrap"><table class="tbl cp-rm-log"><thead><tr><th>Time</th><th>Customer</th><th>Invoice</th><th>Channel</th><th>Rule</th><th>Status</th></tr></thead><tbody id="cp-rm-ltb">${LOG.map(logRow).join('')}</tbody></table></div>
      </div>`);
      preview(); FS.icons(sec);
    }
    async function sendNow(i, btn) {
      const o = OVER[i]; const r = rules.find((x) => x.id === ruleFor(o));
      const chs = Object.keys(CH).filter((k) => r.ch[k]);
      btn.disabled = true; btn.classList.add('cp-sending');
      btn.innerHTML = `<span class="cp-spin"></span>Sending`;
      await sleep(650);
      btn.innerHTML = `<i class="cp-ticks">${ic('check')}</i>Sent`; FS.icons(btn);
      await sleep(500);
      btn.innerHTML = `<i class="cp-ticks">${ic('check-check')}</i>Delivered`; FS.icons(btn);
      await sleep(600);
      btn.classList.add('read'); btn.innerHTML = `<i class="cp-ticks read">${ic('check-check')}</i>Read`; FS.icons(btn);
      const trEl = btn.closest('tr'); $('.cp-last', trEl).textContent = 'Just now · ' + chs.map((c) => CH[c][1]).join(' + ');
      const tb = $('#cp-rm-ltb', sec);
      chs.reverse().forEach((c) => { LOG.unshift(['01 Oct, ' + new Date().toTimeString().slice(0, 5), o.c, o.inv, c, r.label, c === 'wa' ? 'read' : 'delivered']); tb.insertAdjacentHTML('afterbegin', logRow(LOG[0])); FS.icons(tb.firstElementChild); tb.firstElementChild.classList.add('row-flash'); });
      tick($('#cp-rm-k2', sec), 976 + (LOG.length - 7), { local: true });
      setTimeout(() => { btn.disabled = false; btn.classList.remove('cp-sending', 'read'); btn.innerHTML = `${ic('rotate-cw')}Send again`; FS.icons(btn); }, 2200);
      return chs.length;
    }
    function mount(s) {
      sec = s; render();
      const rl = $('#cp-rm-rules', sec);
      rl.addEventListener('click', (e) => {
        const card = e.target.closest('.cp-rule'); if (!card) return;
        const r = rules.find((x) => x.id === card.dataset.id);
        const t = e.target.closest('[data-ch]');
        if (t) { r.ch[t.dataset.ch] = !r.ch[t.dataset.ch]; if (!Object.values(r.ch).some(Boolean)) { r.ch[t.dataset.ch] = true; FS.toast('Keep at least one channel on', { tone: 'warn', ms: 1800 }); return; } t.classList.toggle('on', r.ch[t.dataset.ch]); if (r.ch[t.dataset.ch]) chan = t.dataset.ch; }
        if (e.target.closest('select, .switch')) { if (sel !== r.id) { sel = r.id; } }
        sel = r.id; $$('.cp-rule', rl).forEach((c) => c.classList.toggle('on', c === card));
        preview();
      });
      rl.addEventListener('change', (e) => {
        const card = e.target.closest('.cp-rule'); const r = rules.find((x) => x.id === card.dataset.id);
        if (e.target.matches('[data-tpl]')) { r.tpl = e.target.value; sel = r.id; preview(); }
        if (e.target.matches('[data-on]')) { r.on = e.target.checked; card.classList.toggle('off', !r.on); FS.toast(`“${r.label}” ${r.on ? 'enabled' : 'paused'}`, { tone: r.on ? 'good' : 'info', ms: 1800 }); }
      });
      rl.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('.cp-rule')) e.target.click(); });
      $('#cp-rm-lang', sec).addEventListener('click', (e) => { const b = e.target.closest('[data-l]'); if (b) { lang = b.dataset.l; preview(); } });
      $('#cp-rm-pch', sec).addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (b && !b.disabled) { chan = b.dataset.c; preview(); } });
      $('#cp-rm-cust', sec).onchange = (e) => { cust = +e.target.value; const o = OVER[cust]; sel = ruleFor(o); $$('.cp-rule', rl).forEach((c) => c.classList.toggle('on', c.dataset.id === sel)); preview(); };
      $('#cp-rm-otb', sec).addEventListener('click', (e) => { const b = e.target.closest('[data-send]'); if (!b || b.disabled) return; const i = +b.closest('tr').dataset.i; sendNow(i, b).then((n) => FS.toast(`Reminder sent to ${OVER[i].c} on ${n} channel${n > 1 ? 's' : ''}`, { tone: 'good', ms: 2600 })); });
      const all = async (btn) => {
        const bs = $$('#cp-rm-otb [data-send]', sec).filter((b) => !b.disabled);
        if (!bs.length) return;
        btn.disabled = true;
        for (const b of bs) { sendNow(+b.closest('tr').dataset.i, b); await sleep(260); }
        await sleep(1800); btn.disabled = false;
        celebrate(btn, bs.length + ' reminders sent');
        FS.toast(`${bs.length} reminders sent · ${rs(OVER.reduce((s2, o) => s2 + o.amt, 0))} chased`, { tone: 'good' });
      };
      $('#cp-rm-sendall', sec).onclick = (e) => all(e.currentTarget);
      $('#cp-rm-runall').onclick = (e) => all(e.currentTarget);
      $('#cp-rm-add', sec).onclick = () => {
        const n = rules.length + 1, off = 30;
        if (rules.some((r) => r.off === off)) { FS.toast('A 30-day rule already exists', { tone: 'info' }); return; }
        const r = { id: 'r' + n, off, label: '30 days after due', ch: { wa: false, sms: false, email: true }, tpl: 'final', on: true, sent: 0, tone: 'danger' };
        rules.push(r); sel = r.id;
        rl.insertAdjacentHTML('beforeend', ruleHtml(r, 0)); const el = rl.lastElementChild; FS.icons(el); el.classList.add('cp-pulse');
        $$('.cp-rule', rl).forEach((c) => c.classList.toggle('on', c === el));
        chan = 'email'; preview();
        FS.toast('Rule added: 30 days after due, email + statement of account', { tone: 'good' });
      };
    }
    FS.onEnter(ROUTE, (s, r, first) => { if (first) mount(s); });
  })();

  /* =====================================================================
     7. COST CENTRES & PROJECTS  (app/accounting/cost-centres)
     ===================================================================== */
  (function costCentres() {
    const ROUTE = 'app/accounting/cost-centres';
    const FY = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    const N = (code, name, budget, owner, extra = {}) => ({ code, name, budget, owner, ...extra });
    const TREE = [
      { ...N('CC-100', 'Lahore HQ', 0, 'Ahmed Raza', { icon: 'building-2' }), kids: [N('CC-110', 'Finance', 9600000, 'Sana Javed'), N('CC-120', 'Sales', 18400000, 'Zainab Raza'), N('CC-130', 'Administration', 7200000, 'Ahmed Raza'), N('CC-140', 'Warehouse', 11800000, 'Faisal Qureshi'), N('CC-150', 'IT', 5400000, 'Mehwish Tariq')] },
      { ...N('CC-200', 'Karachi', 0, 'Zainab Raza', { icon: 'building' }), kids: [N('CC-210', 'Sales', 12600000, 'Zainab Raza'), N('CC-220', 'Depot operations', 6900000, 'Faisal Qureshi')] },
      { ...N('CC-300', 'Islamabad', 0, 'Bilal Khan', { icon: 'building' }), kids: [N('CC-310', 'Sales', 7800000, 'Bilal Khan'), N('CC-320', 'Delivery', 3100000, 'Ali Haider')] },
      { ...N('CC-400', 'Faisalabad', 0, 'Kashif Ali', { icon: 'building' }), kids: [N('CC-410', 'Depot', 4200000, 'Kashif Ali')] },
    ];
    const PROJ = [
      N('PRJ-01', 'Karachi Warehouse Fit-out', 18500000, 'Faisal Qureshi', { proj: true, status: 'In progress', start: 'Jul 2026', end: 'Dec 2026', rev: 0, color: 'orange', tags: ['capex', 'karachi'] }),
      N('PRJ-02', 'ERP Rollout', 6200000, 'Mehwish Tariq', { proj: true, status: 'In progress', start: 'Aug 2026', end: 'Mar 2027', rev: 0, color: 'blue', tags: ['it', 'opex'] }),
      N('PRJ-03', 'Ramzan Campaign', 9800000, 'Zainab Raza', { proj: true, status: 'Planning', start: 'Jan 2027', end: 'Apr 2027', rev: 64000000, color: 'lime', tags: ['marketing', 'fmcg'] }),
      N('PRJ-04', 'Solar Installation, Lahore HQ', 14200000, 'Ahmed Raza', { proj: true, status: 'In progress', start: 'Sep 2026', end: 'Nov 2026', rev: 0, color: 'violet', tags: ['capex', 'energy'] }),
      N('PRJ-05', 'Engro Packaging Contract', 22000000, 'Zainab Raza', { proj: true, status: 'In progress', start: 'Jul 2026', end: 'Jun 2027', rev: 31500000, color: 'green', tags: ['contract', 'revenue'] }),
    ];
    const CATS = { cc: ['Salaries & benefits', 'Rent & utilities', 'Travel & conveyance', 'Marketing', 'Repairs', 'Other'], proj: ['Materials', 'Contractors', 'Labour', 'Equipment', 'Consultancy', 'Other'] };
    const all = () => [...TREE.flatMap((b) => [b, ...b.kids]), ...PROJ];
    // deterministic actuals (Jul..Sep actual; rest forecast)
    function enrich(n) {
      if (n._e) return n; n._e = true;
      const r = rng(n.code);
      if (n.kids) { n.budget = n.kids.reduce((s, k) => s + enrich(k).budget, 0); n.monthly = FY.map((_, i) => n.kids.reduce((s, k) => s + k.monthly[i], 0)); }
      else {
        const pace = n.proj ? (n.code === 'PRJ-03' ? 0.05 : 0.6 + r() * 0.75) : 0.8 + r() * 0.28;
        n.monthly = FY.map((_, i) => { const base = n.budget / 12; const shape = n.proj ? (n.code === 'PRJ-04' ? (i >= 2 && i <= 4 ? 3.2 : 0.1) : n.code === 'PRJ-01' ? (i < 6 ? 1.8 : 0.2) : 1) : 1; return Math.round(base * shape * pace * (0.8 + r() * 0.4)); });
      }
      n.actual = n.monthly.slice(0, 3).reduce((a, b) => a + b, 0);
      const rc = rng(n.code + 'c'); const cats = CATS[n.proj ? 'proj' : 'cc']; let w = cats.map(() => 0.3 + rc()); const ws = w.reduce((a, b) => a + b, 0);
      n.cats = cats.map((c, i) => { const b = Math.round((n.budget * w[i]) / ws); return { c, b, a: Math.round(((n.actual * w[i]) / ws) * (0.75 + rc() * 0.5)) }; });
      return n;
    }
    all().forEach(enrich);
    const TX = [['28 Sep', 'JV-2026-000311', 'Steel racking, 2nd instalment', 'Pak Steel Racks', 2850000, 'PRJ-01'], ['24 Sep', 'BILL-2026-000470', 'Solar panels 120kW (Longi)', 'Reon Energy', 6120000, 'PRJ-04'], ['22 Sep', 'BPV-2026-000744', 'Implementation partner, milestone 2', 'Systems Ltd', 1150000, 'PRJ-02'], ['19 Sep', 'JV-2026-000298', 'September salaries allocation', 'Payroll', 1320000, '*'], ['15 Sep', 'BILL-2026-000452', 'Office rent, Q2 advance', 'DHA Properties', 960000, '*'], ['12 Sep', 'CPV-2026-000212', 'Fuel & tolls, delivery fleet', 'Shell Pakistan', 184500, '*'], ['08 Sep', 'BILL-2026-000431', 'Corrugated sheets for contract', 'Habib Packaging', 2140000, 'PRJ-05'], ['03 Sep', 'JV-2026-000277', 'Electrical wiring & DBs', 'Pakistan Cables', 790000, 'PRJ-01']];
    let RULES = [
      { n: 'Office rent', acc: '5110-01 Rent', basis: 'Floor area', split: [['Finance', 25], ['Sales', 35], ['Administration', 20], ['IT', 20]], tags: ['monthly', 'auto-post'] },
      { n: 'Electricity, Lahore HQ', acc: '5220-01 Electricity', basis: 'Headcount', split: [['Warehouse', 45], ['Sales', 20], ['Finance', 15], ['Administration', 20]], tags: ['monthly'] },
      { n: 'Fleet fuel', acc: '5250-01 Fuel', basis: 'Km driven', split: [['Delivery', 60], ['Sales', 40]], tags: ['weekly', 'from logbook'] },
    ];
    let selCode = 'PRJ-01', sec, q = '';
    const find = (c) => all().find((n) => n.code === c);
    const pctUsed = (n) => n.budget ? (n.actual / n.budget) * 100 : 0;
    const ytdBudget = (n) => n.budget * 3 / 12;
    const tone = (n) => { const p = n.proj ? pctUsed(n) : (n.actual / ytdBudget(n)) * 100; return n.proj ? (p > 85 ? 'danger' : p > 60 ? 'warn' : 'good') : (p > 108 ? 'danger' : p > 100 ? 'warn' : 'good'); };

    function treeRow(n, lvl, parent) {
      const p = pctUsed(n);
      return `<button class="cp-tr lvl${lvl}${n.code === selCode ? ' on' : ''}" data-c="${n.code}" ${parent ? `data-p="${parent}"` : ''}>
        ${n.kids ? `<span class="cp-tr-tog">${ic('chevron-down')}</span>` : '<span class="cp-tr-sp"></span>'}
        <span class="cp-tr-ic ${n.proj ? n.color : ''}">${ic(n.icon || (n.proj ? 'folder-kanban' : 'circle-dot'))}</span>
        <span class="cp-tr-n"><b>${esc(n.name)}</b><small>${n.code}</small></span>
        <span class="cp-tr-m" data-tip="${p.toFixed(0)}% of annual budget used"><i class="${tone(n)}" style="width:${clamp(p, 0, 100)}%"></i></span>
      </button>`;
    }
    function tree() {
      const ql = q.toLowerCase(), hit = (n) => !ql || n.name.toLowerCase().includes(ql) || n.code.toLowerCase().includes(ql);
      let h = `<div class="cp-tr-g">${ic('git-fork')}Branches &amp; departments</div>`;
      TREE.forEach((b) => { const ks = b.kids.filter(hit); if (!hit(b) && !ks.length) return; h += treeRow(b, 0) + (hit(b) ? b.kids : ks).map((k) => treeRow(k, 1, b.code)).join(''); });
      const ps = PROJ.filter(hit);
      if (ps.length) h += `<div class="cp-tr-g">${ic('folder-kanban')}Projects</div>` + ps.map((p) => treeRow(p, 0)).join('');
      $('#cp-cc-tree', sec).innerHTML = h || '<p class="muted small cp-pad">No match.</p>';
      FS.icons($('#cp-cc-tree', sec));
    }
    function burn(n) {
      const W = 620, H = 220, pl = 52, pr = 16, pt = 14, pb = 28;
      const cum = []; n.monthly.reduce((s, v, i) => (cum[i] = s + v), 0);
      const fc = cum.map((v, i) => (i < 3 ? v : cum[2] + (cum[2] / 3) * (i - 2) * (n.code === 'PRJ-04' ? 0.6 : 1)));
      const max = Math.max(n.budget, ...fc) * 1.08;
      const x = (i) => pl + (i / 11) * (W - pl - pr), y = (v) => pt + (1 - v / max) * (H - pt - pb);
      const act = cum.slice(0, 3).map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
      const fore = fc.slice(2).map((v, i) => `${i ? 'L' : 'M'}${x(i + 2).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
      const ideal = `M${x(0)},${y(n.budget / 12)} L${x(11)},${y(n.budget)}`;
      const area = act + ` L${x(2)},${H - pb} L${x(0)},${H - pb} Z`;
      const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => max * f);
      const over = fc[11] > n.budget;
      return `<svg viewBox="0 0 ${W} ${H}" class="cp-burn" preserveAspectRatio="none">
        ${grid.map((g) => `<line x1="${pl}" x2="${W - pr}" y1="${y(g)}" y2="${y(g)}" class="gl"/><text x="${pl - 8}" y="${y(g) + 4}" text-anchor="end" class="ax">${g >= 1e6 ? (g / 1e6).toFixed(1) + 'M' : fmt(g / 1e3) + 'k'}</text>`).join('')}
        ${FY.map((m, i) => `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" class="ax${i === 2 ? ' now' : ''}">${m}</text>`).join('')}
        <line x1="${pl}" x2="${W - pr}" y1="${y(n.budget)}" y2="${y(n.budget)}" class="bud"/><text x="${W - pr}" y="${y(n.budget) - 6}" text-anchor="end" class="ax bud-t">Budget ${rs(n.budget)}</text>
        <path d="${ideal}" class="ideal"/>
        <path d="${area}" class="ar"/>
        <path d="${fore}" class="fc ${over ? 'over' : ''}"/>
        <path d="${act}" class="act" pathLength="1"/>
        ${cum.slice(0, 3).map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="4" class="pt" data-tip="${FY[i]}: ${rs(v)} spent to date"/>`).join('')}
        <circle cx="${x(11)}" cy="${y(fc[11])}" r="4.5" class="fpt ${over ? 'over' : ''}" data-tip="Forecast at year end: ${rs(Math.round(fc[11]))}"/>
      </svg>`;
    }
    function detail() {
      const n = find(selCode);
      const parent = TREE.find((b) => b.kids.includes(n));
      const bud = n.proj ? n.budget : ytdBudget(n), p = (n.actual / bud) * 100, varc = bud - n.actual;
      const cost = n.actual, rev = n.proj ? Math.round(n.rev * 3 / 12 * (n.code === 'PRJ-03' ? 0 : 1)) : 0;
      const tx = TX.filter((t) => t[5] === n.code || (t[5] === '*' && !n.proj)).slice(0, 6);
      $('#cp-cc-detail', sec).innerHTML = `
        <div class="panel cp-cc-head">
          <div class="cp-cc-ht"><span class="icon-tile ${n.proj ? n.color : 'green'}">${ic(n.icon || (n.proj ? 'folder-kanban' : 'circle-dot'))}</span>
            <div><small>${n.code}${parent ? ' · ' + parent.name : ''}${n.proj ? ' · Project' : n.kids ? ' · Branch' : ' · Department'}</small><h2>${esc(n.name)}</h2>
              <div class="row cp-wrap-row">${n.proj ? `<span class="badge ${n.status === 'Planning' ? 'info' : 'good'} dot">${n.status}</span><span class="pill">${ic('calendar-range')}${n.start} → ${n.end}</span>` : `<span class="badge good dot">Active</span>`}<span class="pill">${av(n.owner, 'xs')}${n.owner}</span>${(n.tags || []).map((t) => `<span class="pill cp-tag">#${t}</span>`).join('')}</div></div>
            <span class="spacer"></span><button class="btn secondary sm" id="cp-cc-edit">${ic('pencil')}Edit</button></div>
          <div class="cp-cc-kpis">
            <div><small>${n.proj ? 'Total budget' : 'Budget YTD (Q1)'}</small><b>${FS.money(bud, { dec: 0 })}</b></div>
            <div><small>Actual to date</small><b>${FS.money(n.actual, { dec: 0 })}</b></div>
            <div><small>${varc >= 0 ? 'Remaining' : 'Over budget'}</small><b class="${varc >= 0 ? 'cp-okc' : 'cp-badc'}">${FS.money(Math.abs(varc), { dec: 0 })}</b></div>
            <div class="cp-cc-ring">${ring(clamp(p, 0, 100), tone(n))}<span><b>${p.toFixed(0)}%</b><small>used</small></span></div>
          </div>
        </div>
        <div class="grid-2 cp-cc-g">
          <div class="panel"><div class="panel-head"><div><h3>Budget vs actual</h3><p>${n.proj ? 'Project to date' : 'Year to date, July–September'}</p></div><div class="cp-lg"><span><i class="b"></i>Budget</span><span><i class="a"></i>Actual</span></div></div>
            <div class="cp-bva">${n.cats.map((c, i) => { const cb = n.proj ? c.b : c.b * 3 / 12, mx = Math.max(...n.cats.map((x) => Math.max(n.proj ? x.b : x.b * 3 / 12, x.a))); const ov = c.a > cb; return `<div class="cp-bva-r" style="--i:${i}"><span>${c.c}</span><div class="cp-bva-t"><i class="b" style="width:${(cb / mx) * 100}%"></i><i class="a ${ov ? 'over' : ''}" style="width:${(c.a / mx) * 100}%"></i></div><b class="${ov ? 'cp-badc' : ''}" data-tip="Budget ${rs(Math.round(cb))}">${rs(c.a)}</b></div>`; }).join('')}</div>
          </div>
          <div class="panel"><div class="panel-head"><div><h3>${n.proj ? 'Project P&amp;L' : 'Cost summary'}</h3><p>${n.proj ? 'Revenue, cost and margin to date' : 'Where the money went'}</p></div></div>
            ${n.proj ? `<div class="cp-pnl">
              <div class="cp-pnl-r"><span>${ic('trending-up')}Revenue</span><b>${rs(rev)}</b></div>
              <div class="cp-pnl-r"><span>${ic('trending-down')}Direct cost</span><b class="cr">(${fmt(cost)})</b></div>
              <div class="cp-pnl-r"><span>${ic('layers')}Allocated overheads</span><b class="cr">(${fmt(Math.round(cost * 0.06))})</b></div>
              <div class="cp-pnl-r tot"><span>${rev ? 'Project margin' : 'Net project cost'}</span><b class="${rev - cost * 1.06 >= 0 ? 'cp-okc' : 'cp-badc'}">${rs(Math.round(rev - cost * 1.06))}</b></div>
              ${rev ? `<div class="cp-pnl-bar"><i style="width:${clamp(((rev - cost * 1.06) / rev) * 100, 0, 100)}%"></i></div><small class="muted">Margin ${(((rev - cost * 1.06) / rev) * 100).toFixed(1)}% · target 18%</small>` : `<small class="muted">${n.code === 'PRJ-03' ? 'Revenue starts with Ramzan orders in Feb 2027 (forecast ' + rs(n.rev) + ').' : 'Capital project, cost will be capitalised to fixed assets on completion.'}</small>`}
            </div>` : `<div class="cp-cc-sb">${n.cats.map((c, i) => `<i style="flex:${c.a};background:var(--cp-s${i})" data-tip="${c.c}: ${rs(c.a)}"></i>`).join('')}</div>
              <div class="cp-cc-leg">${n.cats.map((c, i) => `<span><i style="background:var(--cp-s${i})"></i>${c.c}<b>${((c.a / n.actual) * 100).toFixed(0)}%</b></span>`).join('')}</div>`}
          </div>
        </div>
        <div class="panel"><div class="panel-head"><div><h3>Burn chart</h3><p>Cumulative spend vs budget, with a run-rate forecast to June 2027</p></div><div class="cp-lg"><span><i class="a"></i>Actual</span><span><i class="f"></i>Forecast</span><span><i class="i"></i>Even pace</span></div></div>${burn(n)}</div>
        <div class="panel flush"><div class="panel-head"><div><h3>Top transactions</h3><p>Largest postings tagged to ${esc(n.name)}</p></div><a class="btn ghost sm" href="#/app/reports/gl">Open in GL${ic('arrow-up-right')}</a></div>
          <div class="table-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Voucher</th><th>Description</th><th>Party</th><th class="num">Amount (Rs)</th></tr></thead><tbody>${(tx.length ? tx : TX.slice(3, 6)).map((t) => `<tr data-qv-route="app/accounting/vouchers/view"><td>${t[0]} 2026</td><td><a class="link" href="#/app/accounting/vouchers/view">${t[1]}</a></td><td>${t[2]}${t[5] === '*' ? '<small>Allocated share</small>' : ''}</td><td>${t[3]}</td><td class="num">${fmt(t[5] === '*' ? Math.round(t[4] * (0.08 + rng(n.code + t[1])() * 0.2)) : t[4])}</td></tr>`).join('')}</tbody></table></div></div>`;
      FS.icons($('#cp-cc-detail', sec)); FS.enhance($('#cp-cc-detail', sec)); FS.animateIn($('#cp-cc-detail', sec));
      $('#cp-cc-edit', sec).onclick = () => openForm(n);
    }
    function rulesHtml() {
      return RULES.map((r, i) => `<div class="cp-ar" style="--i:${i}"><div class="cp-ar-h"><span class="icon-well sm">${ic('split')}</span><div><b>${r.n}</b><small>${r.acc} · by ${r.basis}</small></div><span class="spacer"></span>${r.tags.map((t) => `<span class="pill cp-tag">#${t}</span>`).join('')}</div>
        <div class="cp-ar-bar">${r.split.map((s, j) => `<i style="flex:${s[1]};background:var(--cp-s${j})" data-tip="${s[0]} ${s[1]}%"><span>${s[1]}%</span></i>`).join('')}</div>
        <div class="cp-ar-lg">${r.split.map((s, j) => `<span><i style="background:var(--cp-s${j})"></i>${s[0]}</span>`).join('')}</div></div>`).join('');
    }
    function render() {
      const tb = TREE.reduce((s, b) => s + b.budget, 0), ta = TREE.reduce((s, b) => s + b.actual, 0);
      sec.insertAdjacentHTML('beforeend', `
      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-top"><span>Cost centres</span><span class="icon-well">${ic('git-fork')}</span></div><strong>${TREE.reduce((s, b) => s + b.kids.length, 0)}</strong><small>Across ${TREE.length} branches</small></div>
        <div class="kpi violet"><div class="kpi-top"><span>Active projects</span><span class="icon-well">${ic('folder-kanban')}</span></div><strong id="cp-cc-np">${PROJ.length}</strong><small>${rs(PROJ.reduce((s, p) => s + p.budget, 0))} budgeted</small></div>
        <div class="kpi blue"><div class="kpi-top"><span>Opex spend YTD</span><span class="icon-well">${ic('wallet')}</span></div><strong>${rs(ta)}</strong><small>${((ta / (tb * 3 / 12)) * 100).toFixed(0)}% of Q1 budget</small></div>
        <div class="kpi yellow"><div class="kpi-top"><span>Auto-allocated</span><span class="icon-well">${ic('split')}</span></div><strong>Rs 4,318,000</strong><small class="up">${RULES.length} rules ran this month</small></div>
      </div>
      <div class="split-l cp-cc-split">
        <div class="panel cp-cc-tree-p"><div class="panel-head"><div><h3>Structure</h3><p>Budget used, Q1</p></div></div>
          <label class="search-field cp-sf" data-plain-search><i data-lucide="search"></i><input id="cp-cc-q" placeholder="Find centre or project…"></label>
          <div class="cp-tree" id="cp-cc-tree"></div>
          <div class="cp-tr-lg"><span><i class="good"></i>On track</span><span><i class="warn"></i>Watch</span><span><i class="danger"></i>Over</span></div>
        </div>
        <div id="cp-cc-detail"></div>
      </div>
      <div class="panel">
        <div class="panel-head"><div><h3>Allocation rules</h3><p>Shared costs are split automatically when the voucher is posted</p></div><button class="btn secondary sm" id="cp-cc-addrule">${ic('plus')}New rule</button></div>
        <div class="cp-ars" id="cp-cc-rules">${rulesHtml()}</div>
      </div>
      <div class="overlay" id="cp-cc-modal"><div class="modal wide"><div class="modal-head"><div><h2 id="cp-cc-mt">New cost centre</h2><p>Tag vouchers, bills and payroll to it for reporting</p></div><button class="x" data-close>${ic('x')}</button></div>
        <div class="modal-body"><div class="seg" id="cp-cc-type"><button class="active" data-t="cc">${ic('git-fork')}Cost centre</button><button data-t="proj">${ic('folder-kanban')}Project</button></div>
          <div class="form-grid cp-mt"><label><span>Name *</span><input id="cp-cc-fn" placeholder="e.g. Multan Sales"></label><label><span>Code</span><input id="cp-cc-fc" placeholder="Auto"></label>
            <label><span>Parent</span><select id="cp-cc-fp">${TREE.map((b) => `<option value="${b.code}">${b.name}</option>`).join('')}<option value="">(none: top level)</option></select></label><label><span>Owner</span><select id="cp-cc-fo">${(D.employees || []).map((e) => `<option>${e.name}</option>`).join('')}</select></label>
            <label><span>Annual budget (Rs)</span><input id="cp-cc-fb" value="5,000,000"></label><label><span>Dates</span><input id="cp-cc-fd" value="Oct 2026 → Jun 2027"></label>
            <label class="full"><span>Tags</span><div class="cp-tags" id="cp-cc-tags"><span class="pill cp-tag">#opex</span><input placeholder="Type a tag and press Enter"></div></label></div></div>
        <div class="modal-foot"><button class="btn secondary" data-close>Cancel</button><button class="btn primary" id="cp-cc-save">${ic('check')}Save</button></div></div></div>`);
      tree(); detail();
    }
    let editing = null;
    function openForm(n) {
      editing = n || null;
      $('#cp-cc-mt', sec).textContent = n ? `Edit ${n.name}` : 'New cost centre / project';
      $('#cp-cc-fn', sec).value = n ? n.name : '';
      $('#cp-cc-fc', sec).value = n ? n.code : '';
      $('#cp-cc-fb', sec).value = n ? fmt(n.budget) : '5,000,000';
      $$('#cp-cc-type button', sec).forEach((b) => b.classList.toggle('active', b.dataset.t === (n && n.proj ? 'proj' : 'cc')));
      if (n) $('#cp-cc-fo', sec).value = n.owner;
      $('#cp-cc-tags', sec).innerHTML = `${((n && n.tags) || ['opex']).map((t) => `<span class="pill cp-tag">#${t}</span>`).join('')}<input placeholder="Type a tag and press Enter">`;
      FS.openModal('cp-cc-modal');
      setTimeout(() => $('#cp-cc-fn', sec).focus(), 100);
    }
    function mount(s) {
      sec = s; render();
      $('#cp-cc-tree', sec).addEventListener('click', (e) => {
        const b = e.target.closest('.cp-tr'); if (!b) return;
        if (e.target.closest('.cp-tr-tog')) { const shut = b.classList.toggle('shut'); $$(`.cp-tr[data-p="${b.dataset.c}"]`, sec).forEach((k) => k.classList.toggle('cp-hide', shut)); return; }
        selCode = b.dataset.c; $$('.cp-tr', sec).forEach((x) => x.classList.toggle('on', x === b));
        if (FS.skeleton) FS.skeleton($('#cp-cc-detail', sec), 380);
        detail();
        if (innerWidth < 1100) $('#cp-cc-detail', sec).scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      $('#cp-cc-q', sec).addEventListener('input', (e) => { q = e.target.value; tree(); });
      $('#cp-cc-new').onclick = () => openForm(null);
      $('#cp-cc-tags', sec).addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.value.trim()) { e.preventDefault(); e.target.insertAdjacentHTML('beforebegin', `<span class="pill cp-tag cp-pop">#${esc(e.target.value.trim().replace(/^#/, ''))}</span>`); e.target.value = ''; } });
      $('#cp-cc-save', sec).onclick = async (e) => {
        const name = $('#cp-cc-fn', sec).value.trim();
        if (!name) { const f = $('#cp-cc-fn', sec); f.classList.add('cp-shake'); setTimeout(() => f.classList.remove('cp-shake'), 400); f.focus(); return; }
        await busy(e.currentTarget, 700, 'Saving…');
        const isProj = $('#cp-cc-type .active', sec).dataset.t === 'proj';
        const budget = parseFloat($('#cp-cc-fb', sec).value.replace(/,/g, '')) || 0;
        const tags = $$('#cp-cc-tags .cp-tag', sec).map((t) => t.textContent.replace('#', ''));
        if (editing) { editing.name = name; editing.owner = $('#cp-cc-fo', sec).value; editing.tags = tags; if (editing.budget !== budget && !editing.kids) { const k = budget / editing.budget; editing.budget = budget; editing.cats.forEach((c) => (c.b = Math.round(c.b * k))); } }
        else {
          const n = enrich(N(isProj ? 'PRJ-0' + (PROJ.length + 1) : 'CC-' + (500 + Math.floor(Math.random() * 90)), name, budget, $('#cp-cc-fo', sec).value, isProj ? { proj: true, status: 'Planning', start: 'Oct 2026', end: 'Jun 2027', rev: 0, color: 'blue', tags } : { tags }));
          if (isProj) PROJ.push(n); else { const par = TREE.find((b) => b.code === $('#cp-cc-fp', sec).value) || TREE[0]; par.kids.push(n); par.budget += n.budget; }
          selCode = n.code;
          tick($('#cp-cc-np', sec), PROJ.length, { local: true });
        }
        FS.closeOverlays(); tree(); detail();
        const row = $(`.cp-tr[data-c="${selCode}"]`, sec); if (row) { row.classList.add('cp-pulse'); row.scrollIntoView({ block: 'nearest' }); }
        FS.toast(`${name} ${editing ? 'updated' : 'created'}`, { tone: 'good' });
        if (!editing) celebrate(row);
      };
      $('#cp-cc-addrule', sec).onclick = () => {
        RULES.push({ n: 'Internet & software', acc: '5230-02 Internet', basis: 'Users', split: [['IT', 40], ['Finance', 25], ['Sales', 25], ['Administration', 10]], tags: ['monthly', 'new'] });
        $('#cp-cc-rules', sec).innerHTML = rulesHtml(); FS.icons($('#cp-cc-rules', sec));
        $('#cp-cc-rules', sec).lastElementChild.classList.add('cp-pulse');
        FS.toast('Allocation rule added: Internet & software split by users', { tone: 'good' });
      };
    }
    FS.onEnter(ROUTE, (s, r, first) => { if (first) mount(s); });
  })();

  /* =====================================================================
     8. LANDED COST  (app/purchases/landed-cost)
     ===================================================================== */
  (function landedCost() {
    const ROUTE = 'app/purchases/landed-cost';
    const it = (sku) => (D.items || []).find((x) => x.sku === sku) || { name: sku, unit: 'Pcs' };
    const SH = [
      { id: 'CN-2026-014', from: 'China', flag: 'CN', port: 'Ningbo → Karachi (KICT)', vendor: 'Shenzhen Lumina Lighting Co.', grn: 'GRN-2026-000188', bl: 'COSU6382104950', gd: 'KAPE-HC-48211-29092026', lc: 'Meezan LC 0123/26/114', fx: 278.4, eta: 'Cleared 29 Sep 2026', mode: 'Sea · 1 × 40ft HC', status: 'Cleared',
        lines: [['EL-4001', 400, 6.2, 9.8], ['IT-6001', 600, 0.12, 6.4], ['PK-1004', 300, 4.1, 2.6], ['PK-1005', 80, 9.5, 7.2]] },
      { id: 'AE-2026-006', from: 'UAE', flag: 'AE', port: 'Jebel Ali → Karachi (SAPT)', vendor: 'Gulf Safety Supplies FZE', grn: 'GRN-2026-000191', bl: 'MSKU7710293381', gd: 'KAPS-HC-11032-24092026', lc: 'HBL TT 8721/26/089', fx: 278.4, eta: 'Cleared 24 Sep 2026', mode: 'Sea · LCL 6 CBM', status: 'Cleared',
        lines: [['IN-3001', 220, 1.4, 4.9], ['IN-3002', 300, 0.45, 3.6]] },
      { id: 'TR-2026-002', from: 'Türkiye', flag: 'TR', port: 'Mersin → Port Qasim', vendor: 'Anadolu Kablo A.Ş.', grn: 'GRN-2026-000196', bl: 'ARKU2210048812', gd: 'Pending filing', lc: 'UBL LC 2294/26/031', fx: 278.4, eta: 'ETA 06 Oct 2026', mode: 'Sea · 1 × 20ft', status: 'In transit',
        lines: [['EL-4002', 60, 92, 38.5]] },
    ];
    const COSTS = {
      'CN-2026-014': [['duty', 'Customs duty (CD 20%)', 'Pakistan Customs', 0.2, true], ['acd', 'Additional customs duty (2%)', 'Pakistan Customs', 0.02, true], ['rd', 'Regulatory duty (RD 10%)', 'Pakistan Customs', 0.1, true], ['st', 'Sales tax at import (18%)', 'Pakistan Customs', 'st', false], ['wht', 'Income tax u/s 148 (5.5%)', 'Pakistan Customs', 'wht', false], ['frt', 'Ocean freight', 'COSCO Shipping Lines', 412000, true], ['clr', 'Clearing & forwarding agent', 'Al-Madina Clearing Agency', 68500, true], ['ins', 'Marine insurance', 'Adamjee Insurance', 41800, true], ['port', 'Port & terminal handling (KICT)', 'Karachi International Container Terminal', 96400, true], ['trk', 'Inland haulage Karachi → Lahore', 'TCS Logistics', 115000, true]],
      'AE-2026-006': [['duty', 'Customs duty (CD 11%)', 'Pakistan Customs', 0.11, true], ['st', 'Sales tax at import (18%)', 'Pakistan Customs', 'st', false], ['wht', 'Income tax u/s 148 (5.5%)', 'Pakistan Customs', 'wht', false], ['frt', 'LCL freight', 'Maersk Line', 86000, true], ['clr', 'Clearing & forwarding agent', 'Al-Madina Clearing Agency', 32000, true], ['ins', 'Marine insurance', 'Adamjee Insurance', 9600, true], ['trk', 'Inland haulage', 'TCS Logistics', 48000, true]],
      'TR-2026-002': [['duty', 'Customs duty (CD 16%)', 'Pakistan Customs', 0.16, true], ['st', 'Sales tax at import (18%)', 'Pakistan Customs', 'st', false], ['wht', 'Income tax u/s 148 (5.5%)', 'Pakistan Customs', 'wht', false], ['frt', 'Ocean freight', 'Arkas Line', 168000, true], ['clr', 'Clearing & forwarding agent', 'Al-Madina Clearing Agency', 41000, true], ['ins', 'Marine insurance', 'Adamjee Insurance', 18200, true]],
    };
    const SEG = { goods: ['Goods (FOB)', 'var(--primary)'], duty: ['Customs & duties', 'var(--orange)'], frt: ['Freight & haulage', 'var(--blue)'], clr: ['Clearing & port', 'var(--violet)'], ins: ['Insurance', 'var(--mint)'] };
    const segOf = (k) => (['duty', 'acd', 'rd'].includes(k) ? 'duty' : ['frt', 'trk'].includes(k) ? 'frt' : ['clr', 'port'].includes(k) ? 'clr' : k === 'ins' ? 'ins' : 'duty');
    let cur = SH[0], basis = 'value', costs = [], posted = {}, sec;

    const goodsLines = () => cur.lines.map(([sku, qty, kg, usd]) => { const x = it(sku); return { sku, name: x.name, unit: x.unit, qty, kg: kg * qty, usd, fob: Math.round(qty * usd * cur.fx) }; });
    const fobTotal = () => goodsLines().reduce((s, l) => s + l.fob, 0);
    function loadCosts() {
      const fob = fobTotal(), dutyRate = COSTS[cur.id].filter((c) => typeof c[3] === 'number' && c[3] < 1).reduce((s, c) => s + c[3], 0);
      const av = fob * 1.01; // assessable value incl. 1% landing charges
      costs = COSTS[cur.id].map(([k, label, payee, v, inc]) => {
        let amt;
        if (v === 'st') amt = Math.round((av * (1 + dutyRate)) * 0.18);
        else if (v === 'wht') amt = Math.round((av * (1 + dutyRate) * 1.18) * 0.055);
        else if (v < 1) amt = Math.round(av * v);
        else amt = v;
        return { k, label, payee, amt, inc, claim: v === 'st' || v === 'wht' };
      });
    }
    const capCosts = () => costs.filter((c) => c.inc).reduce((s, c) => s + c.amt, 0);
    function alloc() {
      const L = goodsLines(), w = L.map((l) => (basis === 'value' ? l.fob : basis === 'qty' ? l.qty : l.kg)), ws = w.reduce((a, b) => a + b, 0);
      const cap = capCosts();
      const al = L.map((l, i) => Math.round((cap * w[i]) / ws));
      al[al.length - 1] += cap - al.reduce((a, b) => a + b, 0); // keep the total exact after rounding
      return L.map((l, i) => { const a = al[i]; return { ...l, share: w[i] / ws, alloc: a, landed: (l.fob + a) / l.qty, base: l.fob / l.qty, up: (a / l.fob) * 100 }; });
    }
    function shipCard(s) {
      const fob = s.lines.reduce((t, [sku, q, kg, usd]) => t + q * usd * s.fx, 0);
      return `<button class="cp-ship${s === cur ? ' on' : ''}" data-id="${s.id}"><span class="cp-flag">${s.flag}</span><div><b>Shipment ${s.id}</b><small>from ${s.from} · ${s.mode}</small><small class="cp-ship-p">${ic('ship')}${s.port}</small></div><div class="cp-ship-r"><span class="badge ${posted[s.id] ? 'violet' : s.status === 'Cleared' ? 'good' : 'info'} dot">${posted[s.id] ? 'Posted' : s.status}</span><b>${rs(Math.round(fob))}</b><small>${s.lines.length} item${s.lines.length > 1 ? 's' : ''} FOB</small></div></button>`;
    }
    function costRow(c, i) {
      return `<tr data-i="${i}" class="${c.claim ? 'cp-claim' : ''}${c.inc ? '' : ' cp-excl'}"><td><b>${esc(c.label)}</b><small>${esc(c.payee)}</small>${c.claim ? `<span class="badge info cp-claimb" data-tip="${c.k === 'st' ? 'Adjustable as input tax in your sales tax return (Annex-A)' : 'Adjustable against income tax liability'}">${ic('rotate-ccw')}Claimable</span>` : ''}</td>
        <td class="num"><input class="cp-lc-amt num" value="${fmt(c.amt)}" inputmode="numeric" aria-label="${esc(c.label)}"></td>
        <td class="cp-lc-inc"><label class="switch sm" title="Include in landed cost"><input type="checkbox" data-inc ${c.inc ? 'checked' : ''}><i></i></label></td>
        <td><button class="icon-btn-sm cp-lc-x" title="Remove" data-menu="off">${ic('x')}</button></td></tr>`;
    }
    function render() {
      sec.insertAdjacentHTML('beforeend', `
      <div class="cp-ships" id="cp-lc-ships">${SH.map(shipCard).join('')}</div>
      <div class="panel cp-lc-doc" id="cp-lc-doc"></div>
      <div class="split cp-lc-split">
        <div class="stack cp-lc-main">
          <div class="panel flush">
            <div class="panel-head"><div><h3>Allocation</h3><p>Capitalised costs spread across the GRN lines</p></div>
              <div class="panel-actions"><span class="muted small cp-hide-sm">Allocate by</span><div class="seg" id="cp-lc-basis"><button class="active" data-b="value">${ic('banknote')}Value</button><button data-b="qty">${ic('hash')}Qty</button><button data-b="weight">${ic('weight')}Weight</button></div></div></div>
            <div class="table-wrap"><table class="tbl compact cp-lc-tbl" data-plain><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Weight</th><th class="num">Base cost</th><th class="num">Share</th><th class="num">Allocated</th><th class="num">Landed unit cost</th></tr></thead><tbody id="cp-lc-atb"></tbody>
              <tfoot><tr><td>Total</td><td class="num" id="cp-lc-tq"></td><td class="num" id="cp-lc-tw"></td><td class="num" id="cp-lc-tf"></td><td class="num">100%</td><td class="num" id="cp-lc-ta"></td><td class="num" id="cp-lc-tl"></td></tr></tfoot></table></div>
          </div>
          <div class="panel">
            <div class="panel-head"><div><h3>Cost composition</h3><p>What this shipment really cost, landed in Lahore</p></div><div class="cp-lc-total"><small>Total landed value</small><b id="cp-lc-grand">Rs 0</b></div></div>
            <div class="cp-lc-stack" id="cp-lc-stack"></div>
            <div class="cp-lc-leg" id="cp-lc-leg"></div>
          </div>
        </div>
        <div class="panel flush cp-lc-costs">
          <div class="panel-head"><div><h3>Cost lines</h3><p>Duties, freight and services on this shipment</p></div><button class="btn ghost sm" id="cp-lc-add">${ic('plus')}Add</button></div>
          <div class="table-wrap"><table class="tbl compact cp-lc-ctbl" data-plain><thead><tr><th>Cost</th><th class="num">Amount (Rs)</th><th>In cost</th><th></th></tr></thead><tbody id="cp-lc-ctb"></tbody></table></div>
          <div class="cp-lc-sum">
            <div><span>Capitalised to stock</span><b id="cp-lc-cap">Rs 0</b></div>
            <div><span>Claimable taxes (not in cost)</span><b id="cp-lc-clm">Rs 0</b></div>
            <div class="tot"><span>Uplift on FOB</span><b id="cp-lc-up">0%</b></div>
          </div>
        </div>
      </div>`);
      loadShipment(false);
    }
    function docHead() {
      $('#cp-lc-doc', sec).innerHTML = `<div class="cp-lc-dh"><span class="icon-tile blue">${ic('container')}</span><div><small>${cur.grn} · ${esc(cur.vendor)}</small><b>Shipment ${cur.id} from ${cur.from}</b></div><span class="spacer"></span>${posted[cur.id] ? `<span class="badge violet">${ic('stamp')}Posted · ${posted[cur.id]}</span>` : `<span class="badge ${cur.status === 'Cleared' ? 'good' : 'info'} dot">${cur.status}</span>`}</div>
        <div class="dl grid3 cp-lc-dl"><div><span>Bill of lading</span><b>${cur.bl}</b></div><div><span>Goods declaration (WeBOC)</span><b>${cur.gd}</b></div><div><span>LC / TT</span><b>${cur.lc}</b></div><div><span>Exchange rate</span><b>USD 1 = Rs ${cur.fx.toFixed(2)}</b></div><div><span>Route</span><b>${cur.port}</b></div><div><span>Status</span><b>${cur.eta}</b></div></div>`;
      FS.icons($('#cp-lc-doc', sec));
    }
    function loadShipment(anim = true) {
      loadCosts(); docHead();
      $('#cp-lc-ctb', sec).innerHTML = costs.map(costRow).join('');
      FS.icons($('#cp-lc-ctb', sec));
      recompute(anim, true);
    }
    function recompute(anim = true, rebuild = false) {
      const A = alloc(), fob = fobTotal(), cap = capCosts(), clm = costs.filter((c) => !c.inc).reduce((s, c) => s + c.amt, 0);
      const tb = $('#cp-lc-atb', sec);
      if (rebuild || tb.children.length !== A.length) {
        tb.innerHTML = A.map((a) => `<tr data-sku="${a.sku}"><td><b>${esc(a.name)}</b><small>${a.sku} · USD ${a.usd.toFixed(2)} / ${a.unit.toLowerCase()}</small></td><td class="num">${fmt(a.qty)}</td><td class="num">${fmt(a.kg)} kg</td><td class="num" data-v="fob">${fmt(a.fob)}</td>
          <td class="num"><span class="cp-share"><span class="t"><i data-v="bar"></i></span><b data-v="share">0%</b></span></td><td class="num cp-lc-alloc" data-v="alloc">0</td><td class="num"><b data-v="landed">0</b><small data-v="up">+0%</small></td></tr>`).join('');
      }
      A.forEach((a) => {
        const r = $(`tr[data-sku="${a.sku}"]`, tb);
        $('[data-v="bar"]', r).style.width = (a.share * 100).toFixed(1) + '%';
        $('[data-v="share"]', r).textContent = (a.share * 100).toFixed(1) + '%';
        tick($('[data-v="alloc"]', r), a.alloc, { dec: 0, prefix: '', local: !anim });
        tick($('[data-v="landed"]', r), a.landed, { dec: 2, prefix: 'Rs ', local: !anim });
        $('[data-v="up"]', r).textContent = `+${a.up.toFixed(1)}% on ${fmt(a.base, 0)}`;
        if (anim) { r.classList.remove('cp-hl'); void r.offsetWidth; r.classList.add('cp-hl'); }
      });
      $('#cp-lc-tq', sec).textContent = fmt(A.reduce((s, a) => s + a.qty, 0));
      $('#cp-lc-tw', sec).textContent = fmt(A.reduce((s, a) => s + a.kg, 0)) + ' kg';
      $('#cp-lc-tf', sec).textContent = fmt(fob);
      tick($('#cp-lc-ta', sec), cap, { dec: 0, prefix: '' });
      $('#cp-lc-tl', sec).textContent = '';
      tick($('#cp-lc-cap', sec), cap, { prefix: 'Rs ', dec: 0 });
      tick($('#cp-lc-clm', sec), clm, { prefix: 'Rs ', dec: 0 });
      tick($('#cp-lc-up', sec), (cap / fob) * 100, { dec: 1, local: true, suffix: '%' });
      tick($('#cp-lc-grand', sec), fob + cap, { prefix: 'Rs ', dec: 0 });
      // stacked bar
      const segs = { goods: fob, duty: 0, frt: 0, clr: 0, ins: 0 };
      costs.filter((c) => c.inc).forEach((c) => (segs[segOf(c.k)] += c.amt));
      const tot = Object.values(segs).reduce((a, b) => a + b, 0);
      const st = $('#cp-lc-stack', sec);
      if (!st.children.length) st.innerHTML = Object.keys(SEG).map((k) => `<i data-k="${k}" style="background:${SEG[k][1]}"><span></span></i>`).join('');
      Object.keys(SEG).forEach((k) => { const el = $(`[data-k="${k}"]`, st); const p = (segs[k] / tot) * 100; el.style.width = p + '%'; el.dataset.tip = `${SEG[k][0]}: ${rs(segs[k])} (${p.toFixed(1)}%)`; $('span', el).textContent = p >= 6 ? p.toFixed(0) + '%' : ''; });
      $('#cp-lc-leg', sec).innerHTML = Object.keys(SEG).map((k) => `<div><i style="background:${SEG[k][1]}"></i><span>${SEG[k][0]}</span><b>${rs(segs[k])}</b></div>`).join('') + `<div class="cp-lc-leg-x"><i></i><span>Claimable taxes (outside cost)</span><b>${rs(clm)}</b></div>`;
    }
    function journal() {
      const A = alloc(), cap = capCosts();
      const st = costs.find((c) => c.k === 'st'), wht = costs.find((c) => c.k === 'wht');
      const cr = {}; costs.forEach((c) => { cr[c.payee] = (cr[c.payee] || 0) + c.amt; });
      const lines = [
        ...A.map((a) => [`1140-01 Stock in trade · ${a.sku}`, a.fob + a.alloc, 0, 'Landed']),
        ...(st && !st.inc ? [['1350-01 Input sales tax (import)', st.amt, 0, 'Claimable']] : []),
        ...(wht && !wht.inc ? [['1360-03 Advance income tax u/s 148', wht.amt, 0, 'Claimable']] : []),
        ['2115-01 GRN clearing (goods in transit)', 0, fobTotal(), cur.grn],
        ...Object.entries(cr).map(([p, v]) => [`2110-01 Payables · ${p}`, 0, v, '']),
      ];
      const dr = lines.reduce((s, l) => s + l[1], 0), crt = lines.reduce((s, l) => s + l[2], 0);
      return { lines, dr, crt, cap };
    }
    async function post(btn) {
      if (posted[cur.id]) { FS.toast(`${cur.id} is already posted as ${posted[cur.id]}`, { tone: 'info' }); return; }
      const j = journal();
      const html = `<div class="cp-jv"><div class="cp-jv-h"><div><small>Journal preview · ${dstr(TODAY)}</small><b>Landed cost, Shipment ${cur.id}</b></div><span class="badge ${Math.abs(j.dr - j.crt) < 1 ? 'good' : 'danger'}">${ic(Math.abs(j.dr - j.crt) < 1 ? 'scale' : 'triangle-alert')}${Math.abs(j.dr - j.crt) < 1 ? 'Balanced' : 'Out of balance'}</span></div>
        <div class="table-wrap"><table class="tbl compact" data-plain><thead><tr><th>Account</th><th class="num">Debit</th><th class="num">Credit</th></tr></thead><tbody>${j.lines.map((l, i) => `<tr style="--i:${i}" class="cp-jv-r"><td>${esc(l[0])}${l[3] ? `<small>${l[3]}</small>` : ''}</td><td class="num dr">${l[1] ? fmt(l[1]) : ''}</td><td class="num cr">${l[2] ? fmt(l[2]) : ''}</td></tr>`).join('')}<tr class="total"><td>Total</td><td class="num">${fmt(j.dr)}</td><td class="num">${fmt(j.crt)}</td></tr></tbody></table></div>
        <p class="small muted cp-mt8">Basis: <b>${{ value: 'Value', qty: 'Quantity', weight: 'Weight' }[basis]}</b>. Item average costs are revalued from today; ${fmt(goodsLines().reduce((s, l) => s + l.qty, 0))} units affected.</p></div>`;
      const sh = (FS.sheet || FS.drawer)({ title: 'Post landed cost', subtitle: `${cur.grn} · ${esc(cur.vendor)}`, html, foot: `<button class="btn secondary" data-close>Cancel</button><button class="btn primary" id="cp-lc-go">${ic('stamp')}Post journal</button>` });
      const ov = sh.closest('.overlay') || sh;
      FS.icons(ov);
      $('#cp-lc-go', ov).onclick = async (e) => {
        await busy(e.currentTarget, 1000, 'Posting…');
        FS.closeOverlays();
        posted[cur.id] = 'JV-2026-000' + (322 + Object.keys(posted).length);
        $('#cp-lc-ships', sec).innerHTML = SH.map(shipCard).join(''); FS.icons($('#cp-lc-ships', sec));
        docHead();
        celebrate(btn || $('#cp-lc-doc', sec), 'Landed cost posted');
        FS.toast(`${posted[cur.id]} posted · ${rs(j.cap)} capitalised to stock`, { tone: 'good', action: { label: 'View', fn: () => FS.go('app/accounting/vouchers/view') } });
      };
    }
    function mount(s) {
      sec = s; render(); FS.icons(sec);
      $('#cp-lc-ships', sec).addEventListener('click', (e) => { const b = e.target.closest('.cp-ship'); if (!b || b.dataset.id === cur.id) return; cur = SH.find((x) => x.id === b.dataset.id); $$('.cp-ship', sec).forEach((x) => x.classList.toggle('on', x === b)); if (FS.skeleton) FS.skeleton($('.cp-lc-split', sec), 400); loadShipment(true); });
      $('#cp-lc-basis', sec).addEventListener('click', (e) => { const b = e.target.closest('[data-b]'); if (!b || b.dataset.b === basis) return; basis = b.dataset.b; recompute(true); });
      const ctb = $('#cp-lc-ctb', sec);
      ctb.addEventListener('input', (e) => { if (!e.target.matches('.cp-lc-amt')) return; const i = +e.target.closest('tr').dataset.i; costs[i].amt = parseFloat(e.target.value.replace(/[^\d.]/g, '')) || 0; recompute(false); });
      ctb.addEventListener('focusout', (e) => { if (e.target.matches('.cp-lc-amt')) { const i = +e.target.closest('tr').dataset.i; e.target.value = fmt(costs[i].amt); } });
      ctb.addEventListener('change', (e) => { if (!e.target.matches('[data-inc]')) return; const tr = e.target.closest('tr'), c = costs[+tr.dataset.i]; c.inc = e.target.checked; tr.classList.toggle('cp-excl', !c.inc); recompute(true); if (c.claim && c.inc) FS.toast(`${c.label} is normally claimable. Including it will overstate stock cost.`, { tone: 'warn' }); });
      ctb.addEventListener('click', (e) => { const x = e.target.closest('.cp-lc-x'); if (!x) return; const tr = x.closest('tr'), i = +tr.dataset.i; const gone = costs.splice(i, 1)[0]; tr.classList.add('row-out'); setTimeout(() => { ctb.innerHTML = costs.map(costRow).join(''); FS.icons(ctb); recompute(true); }, 300); FS.toast(`${gone.label} removed`, { tone: 'info', undo: () => { costs.splice(i, 0, gone); ctb.innerHTML = costs.map(costRow).join(''); FS.icons(ctb); recompute(true); } }); });
      $('#cp-lc-add', sec).onclick = () => {
        FS.menu($('#cp-lc-add', sec), [['Demurrage', 'Karachi Port Trust', 54000, 'clr'], ['Container detention', 'Shipping line', 38000, 'frt'], ['Bank LC charges', 'Meezan Bank', 22500, 'clr'], ['Excise & taxation (infrastructure cess)', 'Sindh Excise', 61800, 'duty'], ['Lab testing (PSQCA)', 'PSQCA', 15000, 'clr']].map(([l, p, a, k]) => ({ label: `${l} · ${rs(a)}`, icon: 'plus', onClick: () => { costs.push({ k, label: l, payee: p, amt: a, inc: true, claim: false }); ctb.innerHTML = costs.map(costRow).join(''); FS.icons(ctb); ctb.lastElementChild.classList.add('row-flash'); recompute(true); } })));
      };
      $('#cp-lc-post').onclick = (e) => post(e.currentTarget);
    }
    FS.onEnter(ROUTE, (s, r, first) => { if (first) mount(s); });
  })();

  /* =====================================================================
     9. BANK RULES & IMPORT  (app/bank/rules)
     ===================================================================== */
  (function bankRules() {
    const ROUTE = 'app/bank/rules';
    const ACC = [['5220-01', 'Utilities: Electricity'], ['5220-02', 'Utilities: Gas'], ['5230-01', 'Telephone & internet'], ['5250-01', 'Fuel & oil'], ['5260-01', 'Travel & conveyance'], ['5410-01', 'Bank charges'], ['1360-04', 'Advance tax u/s 231A'], ['5120-01', 'Salaries & wages'], ['5320-01', 'Courier & postage'], ['5150-01', 'Office supplies']];
    const accName = (c) => (ACC.find((a) => a[0] === c) || [c, c])[1];
    let RULES = [
      { id: 'BR-01', name: 'K-Electric bills', conds: [['desc', 'contains', 'K-ELECTRIC']], any: false, acc: '5220-01', cc: 'Karachi · Depot operations', on: true, hits: 14 },
      { id: 'BR-02', name: 'LESCO bills', conds: [['desc', 'contains', 'LESCO']], any: false, acc: '5220-01', cc: 'Lahore HQ · Administration', on: true, hits: 12 },
      { id: 'BR-03', name: 'SNGPL gas', conds: [['desc', 'contains', 'SNGPL']], any: false, acc: '5220-02', cc: 'Lahore HQ · Administration', on: true, hits: 9 },
      { id: 'BR-04', name: 'Telecom: PTCL & Jazz', conds: [['desc', 'contains', 'PTCL'], ['desc', 'contains', 'JAZZ']], any: true, acc: '5230-01', cc: 'Lahore HQ · IT', on: true, hits: 21 },
      { id: 'BR-05', name: 'Bank charges & FED', conds: [['desc', 'contains', 'CHARGES'], ['amt', 'less than', '5000']], any: false, acc: '5410-01', cc: '', on: true, hits: 48 },
      { id: 'BR-06', name: 'Fuel cards', conds: [['desc', 'contains', 'SHELL'], ['desc', 'contains', 'PSO']], any: true, acc: '5250-01', cc: 'Islamabad · Delivery', on: true, hits: 33 },
      { id: 'BR-07', name: 'WHT on cash withdrawal', conds: [['desc', 'contains', '231A']], any: false, acc: '1360-04', cc: '', on: true, hits: 6 },
      { id: 'BR-08', name: 'Ride hailing', conds: [['desc', 'contains', 'CAREEM']], any: false, acc: '5260-01', cc: 'Lahore HQ · Sales', on: false, hits: 17 },
    ];
    const STMT = [
      ['01 Oct', 'IBFT IN FROM SHIFA INTL REF INV-2026-000951', 'IBFT-0110-88231', 1003000, 'in'],
      ['01 Oct', 'K-ELECTRIC BILL PAYMENT A/C 0400012345678', 'KE-ONLINE', -184320, 'out'],
      ['01 Oct', 'RAAST P2P CR METRO CASH CARRY RTP2610010012345', 'RAAST-RTP2610010012345', 46500, 'in'],
      ['30 Sep', 'LESCO ELECTRICITY BILL 24-11-3349-0091200', 'LESCO-ONLINE', -297400, 'out'],
      ['30 Sep', 'SNGPL GAS BILL CONSUMER 89120044', 'SNGPL-ONLINE', -38650, 'out'],
      ['30 Sep', 'SERVICE CHARGES SEP 2026 INCL FED', 'SYS-CHG', -2840, 'out'],
      ['30 Sep', 'PTCL BROADBAND 042-35128800', 'PTCL-ONLINE', -14999, 'out'],
      ['29 Sep', 'SHELL CARD FLEET LAHORE CANAL', 'POS-55109', -18400, 'out'],
      ['29 Sep', 'IBFT IN ENGRO FOODS PAYMENT AGAINST INV 925', 'IBFT-2909-11902', 640000, 'in'],
      ['29 Sep', 'WHT 231A CASH WITHDRAWAL', 'SYS-WHT', -1500, 'out'],
      ['28 Sep', 'JAZZ POSTPAID CORPORATE 0300-4001122', 'JAZZ-ONLINE', -8740, 'out'],
      ['28 Sep', 'RAAST CR HASHOO HOTELS RTP2609280077712 INV918', 'RAAST-RTP2609280077712', 219480, 'in'],
      ['27 Sep', 'PSO FUEL CARD ISLAMABAD G-9', 'POS-77310', -12600, 'out'],
      ['27 Sep', 'CHQ 004512 PRESENTED HABIB PACKAGING', 'CLG-004512', -420000, 'out'],
      ['26 Sep', 'CAREEM RIDES BUSINESS', 'POS-90112', -3300, 'out'],
    ];
    const OPEN_INV = [['INV-2026-000951', 'Shifa International', 1003000], ['INV-2026-000948', 'Metro Cash & Carry', 46500], ['INV-2026-000925', 'Engro Foods', 640000], ['INV-2026-000918', 'Hashoo Hotels', 219480], ['INV-2026-000902', 'City Mart Superstores', 189100]];
    let lines = [], imported = false, sec, raast = [];
    const FIELDS = { desc: 'Description', amt: 'Amount', ref: 'Reference', type: 'Direction' };
    const OPS = { desc: ['contains', 'starts with', 'equals'], ref: ['contains', 'starts with'], amt: ['less than', 'greater than', 'equals'], type: ['is'] };
    const condTxt = (c) => `${FIELDS[c[0]]} ${c[1]} <b>${c[0] === 'amt' ? rs(+c[2]) : '“' + esc(c[2]) + '”'}</b>`;
    function test(rule, l) {
      const t = rule.conds.map(([f, op, v]) => {
        const val = f === 'desc' ? l.desc : f === 'ref' ? l.ref : f === 'amt' ? Math.abs(l.amt) : l.dir;
        const V = String(v).toUpperCase();
        if (f === 'amt') { const n = +v; return op === 'less than' ? val < n : op === 'greater than' ? val > n : val === n; }
        const S = String(val).toUpperCase();
        return op === 'contains' ? S.includes(V) : op === 'starts with' ? S.startsWith(V) : op === 'is' ? S === V : S === V;
      });
      return rule.any ? t.some(Boolean) : t.every(Boolean);
    }
    const isRaast = (l) => l.amt > 0 && /RAAST|IBFT/.test(l.desc);
    function ruleCard(r, i) {
      return `<div class="cp-br${r.on ? '' : ' off'}" data-id="${r.id}" style="--i:${i}"><div class="cp-br-h"><span class="icon-well sm">${ic('wand-sparkles')}</span><div><b>${esc(r.name)}</b><small>${r.id} · ${r.hits} hits in 90 days</small></div><span class="spacer"></span><label class="switch" title="Active"><input type="checkbox" ${r.on ? 'checked' : ''}><i></i></label><button class="icon-btn-sm" data-edit title="Edit rule" data-menu="off">${ic('pencil')}</button></div>
        <div class="cp-br-flow"><span class="cp-br-if">IF</span><span>${r.conds.map(condTxt).join(` <em>${r.any ? 'or' : 'and'}</em> `)}</span></div>
        <div class="cp-br-flow"><span class="cp-br-then">THEN</span><span>Categorise to <b>${accName(r.acc)} ${r.acc}</b>${r.cc ? ` · cost centre <b>${esc(r.cc)}</b>` : ''}</span></div></div>`;
    }
    function lineRow(l, i) {
      return `<tr data-i="${i}" class="${l.cat ? 'cp-done-row' : ''}"><td>${l.date}</td><td><b class="cp-desc">${esc(l.desc)}</b><small>${esc(l.ref)}</small></td><td class="num ${l.amt < 0 ? 'cr' : 'dr'}">${l.amt < 0 ? '(' + fmt(-l.amt) + ')' : fmt(l.amt)}</td>
        <td class="cp-cat">${l.cat ? `<span class="cp-catd">${ic('circle-check')}<span><b>${l.cat}</b><small>${l.rule}</small></span></span>` : isRaast(l) ? `<span class="badge info">${ic('zap')}Match to invoice</span>` : `<span class="badge neutral">Unmatched</span>`}</td></tr>`;
    }
    function paintLines() {
      const tb = $('#cp-br-ltb', sec);
      if (!imported) { tb.innerHTML = `<tr class="cp-empty"><td colspan="4"><div class="empty-state"><span class="icon-well lg">${ic('file-down')}</span><h4>No statement lines yet</h4><p>Import a CSV or MT940 statement above to see unmatched lines here.</p></div></td></tr>`; FS.icons(tb); counts(); return; }
      tb.innerHTML = lines.map(lineRow).join(''); FS.icons(tb); counts();
    }
    function counts() {
      const un = lines.filter((l) => !l.cat).length, done = lines.filter((l) => l.cat).length;
      tick($('#cp-br-k1', sec), un, { local: true });
      tick($('#cp-br-k2', sec), lines.length ? Math.round((done / lines.length) * 100) : 0, { local: true, suffix: '%' });
      tick($('#cp-br-k3', sec), RULES.filter((r) => r.on).length, { local: true });
      $('#cp-br-un', sec).textContent = un;
      const n = lines.filter((l) => !l.cat && RULES.some((r) => r.on && test(r, l))).length;
      $('#cp-br-apply', sec).disabled = !n;
      const apn = $('#cp-br-apn', sec); if (apn) apn.textContent = n;
    }
    async function doImport(name) {
      const dz = $('#cp-br-drop', sec), prog = $('#cp-br-prog', sec);
      dz.classList.add('busy');
      const steps = ['Uploading ' + name, 'Detecting format: ' + (/\.sta|\.940|mt940/i.test(name) ? 'MT940 (SWIFT)' : 'CSV · Meezan Bank layout'), 'Parsing 15 transactions', 'Removing 2 duplicates already imported', 'Done'];
      for (let i = 0; i < steps.length; i++) { prog.innerHTML = `<div class="progress lime"><i style="width:${((i + 1) / steps.length) * 100}%;transform:none"></i></div><small>${esc(steps[i])}…</small>`; await sleep(380); }
      dz.classList.remove('busy'); dz.classList.add('done');
      prog.innerHTML = `<span class="badge good">${ic('check')}${esc(name)}</span><small>15 lines · ${$('#cp-br-bank', sec).selectedOptions[0].text} · 26 Sep → 01 Oct 2026</small>`; FS.icons(prog);
      imported = true;
      lines = STMT.map(([date, desc, ref, amt]) => ({ date, desc, ref, amt, dir: amt < 0 ? 'out' : 'in', cat: null, rule: '' }));
      paintLines();
      $$('#cp-br-ltb tr', sec).forEach((r, i) => { r.style.animation = `cpRowDrop .45s var(--ease) ${i * 45}ms both`; });
      raastPaint();
      FS.toast(`15 statement lines imported, ${lines.filter((l) => RULES.some((r) => r.on && test(r, l))).length} match your rules`, { tone: 'good', action: { label: 'Apply rules', fn: () => apply() } });
    }
    async function apply() {
      const btn = $('#cp-br-apply', sec);
      const todo = lines.map((l, i) => [l, i]).filter(([l]) => !l.cat).map(([l, i]) => [l, i, RULES.find((r) => r.on && test(r, l))]).filter((x) => x[2]);
      if (!todo.length) return;
      btn.disabled = true; btn.innerHTML = `<span class="cp-spin"></span>Applying…`;
      for (const [l, i, r] of todo) {
        const tr = $(`#cp-br-ltb tr[data-i="${i}"]`, sec);
        tr.classList.add('cp-scan'); tr.scrollIntoView({ block: 'nearest', behavior: reduce() ? 'auto' : 'smooth' });
        await sleep(240);
        l.cat = `${accName(r.acc)} ${r.acc}`; l.rule = `Rule ${r.id} · ${r.name}`; r.hits++;
        const td = $('.cp-cat', tr); td.innerHTML = `<span class="cp-catd cp-pop">${ic('circle-check')}<span><b>${l.cat}</b><small>${l.rule}</small></span></span>`; FS.icons(td);
        tr.classList.remove('cp-scan'); tr.classList.add('cp-done-row', 'row-flash');
        counts();
      }
      btn.innerHTML = `${ic('wand-sparkles')}Apply rules <span class="cp-btn-n" id="cp-br-apn">0</span>`; FS.icons(btn);
      counts();
      $('#cp-br-rules', sec).innerHTML = RULES.map(ruleCard).join(''); FS.icons($('#cp-br-rules', sec));
      celebrate(btn, `${todo.length} categorised`);
      FS.toast(`${todo.length} lines categorised by rules · ${lines.filter((l) => !l.cat).length} left for review`, { tone: 'good' });
    }
    function raastPaint() {
      const host = $('#cp-br-raast', sec);
      raast = lines.map((l, i) => [l, i]).filter(([l]) => isRaast(l)).map(([l, i]) => {
        const ref = (l.desc.match(/INV[- ]?(?:2026-)?0*(\d{3,})/) || [])[1];
        let inv = ref ? OPEN_INV.find((x) => x[0].endsWith(ref.padStart(3, '0'))) : null;
        let conf = inv ? (inv[2] === l.amt ? 99 : 86) : 0, why = inv ? (inv[2] === l.amt ? 'Invoice ref + exact amount' : 'Invoice ref, amount differs') : '';
        if (!inv) { inv = OPEN_INV.find((x) => x[2] === l.amt); if (inv) { conf = 78; why = 'Exact amount + payer name'; } }
        return { l, i, inv, conf, why };
      });
      if (!imported) { host.innerHTML = `<p class="muted small cp-pad">Import a statement to find Raast and IBFT credits.</p>`; return; }
      host.innerHTML = raast.map((m, k) => `<div class="cp-rx${m.l.cat ? ' done' : ''}" data-k="${k}" style="--i:${k}">
        <div class="cp-rx-l"><span class="cp-rx-tag ${/RAAST/.test(m.l.desc) ? 'raast' : 'ibft'}">${/RAAST/.test(m.l.desc) ? 'RAAST' : 'IBFT'}</span><div><b>${rs(m.l.amt)}</b><small>${esc(m.l.ref)}</small></div></div>
        <span class="cp-rx-arrow">${ic('arrow-right')}</span>
        <div class="cp-rx-r">${m.inv ? `<div><b>${m.inv[0]}</b><small>${esc(m.inv[1])} · ${rs(m.inv[2])}</small></div><span class="badge ${m.conf >= 90 ? 'good' : 'warn'}" data-tip="${m.why}">${m.conf}%</span>` : '<span class="muted small">No match</span>'}</div>
        <button class="btn ${m.l.cat ? 'ghost' : 'secondary'} sm" data-match ${m.l.cat || !m.inv ? 'disabled' : ''}>${m.l.cat ? ic('check') + 'Matched' : 'Match'}</button></div>`).join('');
      FS.icons(host);
    }
    function matchOne(k) {
      const m = raast[k]; if (!m || m.l.cat || !m.inv) return;
      m.l.cat = `Receipt against ${m.inv[0]}`; m.l.rule = `${m.why} · ${m.conf}%`;
      const el = $(`.cp-rx[data-k="${k}"]`, sec); el.classList.add('done', 'cp-pulse'); const b = $('[data-match]', el); b.disabled = true; b.className = 'btn ghost sm'; b.innerHTML = ic('check') + 'Matched'; FS.icons(b);
      const tr = $(`#cp-br-ltb tr[data-i="${m.i}"]`, sec); if (tr) { const td = $('.cp-cat', tr); td.innerHTML = `<span class="cp-catd rx cp-pop">${ic('link-2')}<span><b>${m.l.cat}</b><small>${m.l.rule}</small></span></span>`; FS.icons(td); tr.classList.add('cp-done-row', 'row-flash'); }
      counts();
    }

    /* ---- rule builder ---- */
    function openBuilder(rule) {
      const r = rule ? JSON.parse(JSON.stringify(rule)) : { id: 'BR-0' + (RULES.length + 1), name: '', conds: [['desc', 'contains', '']], any: false, acc: '5320-01', cc: '', on: true, hits: 0 };
      const condRow = (c, i) => `<div class="cp-cond" data-i="${i}"><span class="cp-cond-w">${i ? (r.any ? 'OR' : 'AND') : 'IF'}</span><select data-f>${Object.entries(FIELDS).map(([k, v]) => `<option value="${k}" ${k === c[0] ? 'selected' : ''}>${v}</option>`).join('')}</select><select data-o>${OPS[c[0]].map((o) => `<option ${o === c[1] ? 'selected' : ''}>${o}</option>`).join('')}</select><input data-v value="${esc(c[2])}" placeholder="${c[0] === 'amt' ? 'e.g. 5000' : c[0] === 'type' ? 'in / out' : 'e.g. TCS'}"><button class="icon-btn-sm" data-rm title="Remove" data-menu="off">${ic('x')}</button></div>`;
      const html = `<div class="form-grid"><label class="full"><span>Rule name *</span><input id="cp-rb-n" value="${esc(r.name)}" placeholder="e.g. TCS courier charges"></label></div>
        <div class="cp-rb-sec"><div class="row"><h4>Conditions</h4><span class="spacer"></span><div class="seg" id="cp-rb-any"><button class="${r.any ? '' : 'active'}" data-a="0">Match all</button><button class="${r.any ? 'active' : ''}" data-a="1">Match any</button></div></div><div id="cp-rb-conds">${r.conds.map(condRow).join('')}</div><button class="btn ghost sm" id="cp-rb-addc">${ic('plus')}Add condition</button></div>
        <div class="cp-rb-sec"><h4>Then</h4><div class="form-grid"><label><span>Categorise to account</span><select id="cp-rb-acc">${ACC.map((a) => `<option value="${a[0]}" ${a[0] === r.acc ? 'selected' : ''}>${a[0]} · ${a[1]}</option>`).join('')}</select></label><label><span>Cost centre</span><select id="cp-rb-cc"><option value="">(none)</option>${['Lahore HQ · Administration', 'Lahore HQ · Sales', 'Lahore HQ · IT', 'Karachi · Depot operations', 'Islamabad · Delivery'].map((c) => `<option ${c === r.cc ? 'selected' : ''}>${c}</option>`).join('')}</select></label><label class="check full"><input type="checkbox" checked> Auto-post when matched (no review)</label></div></div>
        <div class="cp-rb-live" id="cp-rb-live"></div>`;
      const dr = FS.drawer({ title: rule ? 'Edit bank rule' : 'New bank rule', subtitle: 'Conditions on the statement line, then what to do with it', html, foot: `${rule ? `<button class="btn danger" id="cp-rb-del">${ic('trash-2')}Delete</button><span class="spacer"></span>` : ''}<button class="btn secondary" data-close>Cancel</button><button class="btn primary" id="cp-rb-save">${ic('check')}Save rule</button>`, wide: true });
      dr.classList.add('cp-rb');
      const sample = lines.length ? lines : STMT.map(([date, desc, ref, amt]) => ({ date, desc, ref, amt, dir: amt < 0 ? 'out' : 'in' }));
      const live = () => {
        r.conds = $$('.cp-cond', dr).map((c) => [$('[data-f]', c).value, $('[data-o]', c).value, $('[data-v]', c).value.trim()]);
        const valid = r.conds.filter((c) => c[2] !== '');
        const ms = valid.length ? sample.filter((l) => test({ ...r, conds: valid }, l)) : [];
        const box = $('#cp-rb-live', dr);
        box.innerHTML = `<div class="cp-rb-ctr${ms.length ? ' hit' : ''}"><b id="cp-rb-num">${ms.length}</b><span>Would match <b>${ms.length}</b> transaction${ms.length === 1 ? '' : 's'} in ${lines.length ? 'the imported statement' : 'the last 90 days'}</span></div>${ms.slice(0, 5).map((l) => `<div class="cp-rb-m">${ic('corner-down-right')}<span>${esc(l.desc)}</span><b class="${l.amt < 0 ? 'cr' : 'dr'}">${fmt(Math.abs(l.amt))}</b></div>`).join('')}`;
        FS.icons(box);
        const num = $('#cp-rb-num', dr); num.classList.remove('cp-bump'); void num.offsetWidth; num.classList.add('cp-bump');
      };
      dr.addEventListener('input', live);
      dr.addEventListener('change', (e) => {
        if (e.target.matches('[data-f]')) { const c = e.target.closest('.cp-cond'); const o = $('[data-o]', c); o.innerHTML = OPS[e.target.value].map((x) => `<option>${x}</option>`).join(''); }
        live();
      });
      dr.addEventListener('click', (e) => {
        const a = e.target.closest('#cp-rb-any [data-a]'); if (a) { r.any = a.dataset.a === '1'; $$('.cp-cond-w', dr).forEach((w, i) => { if (i) w.textContent = r.any ? 'OR' : 'AND'; }); setTimeout(live); return; }
        if (e.target.closest('#cp-rb-addc')) { const box = $('#cp-rb-conds', dr); box.insertAdjacentHTML('beforeend', condRow(['desc', 'contains', ''], box.children.length)); FS.icons(box.lastElementChild); box.lastElementChild.classList.add('cp-pop'); $('[data-v]', box.lastElementChild).focus(); return; }
        const rm = e.target.closest('[data-rm]'); if (rm && $$('.cp-cond', dr).length > 1) { rm.closest('.cp-cond').remove(); $$('.cp-cond-w', dr).forEach((w, i) => { w.textContent = i ? (r.any ? 'OR' : 'AND') : 'IF'; }); live(); }
      });
      live();
      const ov = dr.closest('.overlay');
      $('#cp-rb-save', ov).onclick = async (e) => {
        const nm = $('#cp-rb-n', dr).value.trim(); if (!nm) { $('#cp-rb-n', dr).focus(); $('#cp-rb-n', dr).classList.add('cp-shake'); return; }
        if (!r.conds.some((c) => c[2])) { FS.toast('Add a value to at least one condition', { tone: 'warn' }); return; }
        await busy(e.currentTarget, 600, 'Saving…');
        r.name = nm; r.acc = $('#cp-rb-acc', dr).value; r.cc = $('#cp-rb-cc', dr).value; r.conds = r.conds.filter((c) => c[2]);
        if (rule) Object.assign(rule, r); else RULES.unshift(r);
        FS.closeOverlay(ov);
        $('#cp-br-rules', sec).innerHTML = RULES.map(ruleCard).join(''); FS.icons($('#cp-br-rules', sec));
        $(`.cp-br[data-id="${r.id}"]`, sec).classList.add('cp-pulse');
        counts();
        FS.toast(`Rule “${nm}” saved${lines.length ? ` · ${lines.filter((l) => !l.cat && test(r, l)).length} lines ready to apply` : ''}`, { tone: 'good' });
      };
      const del = $('#cp-rb-del', ov);
      if (del) del.onclick = async () => { if (await confirmBox({ title: `Delete “${rule.name}”?`, text: 'Lines already categorised keep their account.', okLabel: 'Delete rule', danger: true })) { RULES = RULES.filter((x) => x !== rule); FS.closeOverlay(ov); $('#cp-br-rules', sec).innerHTML = RULES.map(ruleCard).join(''); FS.icons($('#cp-br-rules', sec)); counts(); FS.toast('Rule deleted', { tone: 'danger' }); } };
    }

    function render() {
      sec.insertAdjacentHTML('beforeend', `
      <div class="kpi-grid">
        <div class="kpi yellow"><div class="kpi-top"><span>Unmatched lines</span><span class="icon-well">${ic('list-todo')}</span></div><strong id="cp-br-k1">0</strong><small>Waiting for a category or match</small></div>
        <div class="kpi"><div class="kpi-top"><span>Auto-categorised</span><span class="icon-well">${ic('wand-sparkles')}</span></div><strong id="cp-br-k2">0%</strong><small class="up">91% last month</small></div>
        <div class="kpi violet"><div class="kpi-top"><span>Active rules</span><span class="icon-well">${ic('list-checks')}</span></div><strong id="cp-br-k3">0</strong><small>${RULES.reduce((s, r) => s + r.hits, 0)} hits in 90 days</small></div>
        <div class="kpi blue"><div class="kpi-top"><span>Raast / IBFT credits</span><span class="icon-well">${ic('zap')}</span></div><strong>Rs 1,908,980</strong><small>4 receipts this week</small></div>
      </div>
      <div class="split cp-br-split">
        <div class="stack">
          <div class="panel cp-br-imp">
            <div class="panel-head"><div><h3>Import statement</h3><p>CSV, Excel or MT940 from Meezan, HBL, UBL or Alfalah internet banking</p></div><select id="cp-br-bank">${(D.banks || []).map((b) => `<option>${b.short}</option>`).join('')}</select></div>
            <div class="cp-drop sm" id="cp-br-drop" tabindex="0"><input type="file" id="cp-br-file" accept=".csv,.xlsx,.sta,.940,.txt" hidden>
              <div class="cp-drop-idle"><span class="cp-drop-ic">${ic('file-down')}</span><div><b>Drop a statement file</b><small>or <u>browse</u> · .csv .xlsx .sta (MT940)</small></div><span class="spacer"></span><button class="btn secondary sm" id="cp-br-sample">${ic('sparkles')}Use sample statement</button></div>
              <div class="cp-br-prog" id="cp-br-prog"></div></div>
          </div>
          <div class="panel flush">
            <div class="panel-head"><div><h3>Statement lines <span class="badge neutral"><span id="cp-br-un">0</span> unmatched</span></h3><p>Rules run top to bottom; first match wins</p></div><div class="panel-actions"><button class="btn primary sm" id="cp-br-apply" disabled>${ic('wand-sparkles')}Apply rules <span class="cp-btn-n" id="cp-br-apn">0</span></button></div></div>
            <div class="table-wrap"><table class="tbl cp-br-lt" data-plain><thead><tr><th>Date</th><th>Description</th><th class="num">Amount (Rs)</th><th>Category / match</th></tr></thead><tbody id="cp-br-ltb"></tbody></table></div>
          </div>
        </div>
        <div class="stack">
          <div class="panel cp-br-rx"><div class="panel-head"><div><h3>Raast &amp; IBFT matching</h3><p>Credits matched to open invoices by reference and amount</p></div><button class="btn secondary sm" id="cp-br-mall">${ic('link-2')}Match ≥ 90%</button></div><div id="cp-br-raast"></div></div>
          <div class="panel cp-br-rp"><div class="panel-head"><div><h3>Rules</h3><p>${RULES.length} rules · drag priority coming soon</p></div><button class="btn ghost sm" id="cp-br-new2">${ic('plus')}New</button></div><div class="cp-brs" id="cp-br-rules">${RULES.map(ruleCard).join('')}</div></div>
        </div>
      </div>`);
      paintLines(); raastPaint(); FS.icons(sec);
    }
    function mount(s) {
      sec = s; render();
      const dz = $('#cp-br-drop', sec);
      dz.addEventListener('click', (e) => { if (e.target.closest('#cp-br-sample')) { e.stopPropagation(); if (!imported) doImport('Meezan_0123_Sep2026.csv'); else FS.toast('Statement already imported', { tone: 'info', ms: 1800 }); return; } if (!imported && !dz.classList.contains('busy')) $('#cp-br-file', sec).click(); });
      $('#cp-br-file', sec).onchange = (e) => { const f = e.target.files[0]; if (f) doImport(f.name); };
      dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('over'); });
      dz.addEventListener('dragleave', () => dz.classList.remove('over'));
      dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f && !imported) doImport(f.name); });
      $('#cp-br-apply', sec).onclick = apply;
      $('#cp-br-rules', sec).addEventListener('change', (e) => { const c = e.target.closest('.cp-br'); const r = RULES.find((x) => x.id === c.dataset.id); r.on = e.target.checked; c.classList.toggle('off', !r.on); counts(); });
      $('#cp-br-rules', sec).addEventListener('click', (e) => { const b = e.target.closest('[data-edit]'); if (b) openBuilder(RULES.find((x) => x.id === b.closest('.cp-br').dataset.id)); });
      $('#cp-br-raast', sec).addEventListener('click', (e) => { const b = e.target.closest('[data-match]'); if (b) { matchOne(+b.closest('.cp-rx').dataset.k); FS.toast('Receipt matched and posted', { tone: 'good', ms: 1800 }); } });
      $('#cp-br-mall', sec).onclick = async (e) => {
        if (!imported) { FS.toast('Import a statement first', { tone: 'info' }); return; }
        const ks = raast.map((m, k) => [m, k]).filter(([m]) => !m.l.cat && m.inv && m.conf >= 90).map(([, k]) => k);
        if (!ks.length) { FS.toast('Nothing left above 90% confidence', { tone: 'info' }); return; }
        const b = e.currentTarget; b.disabled = true;
        for (const k of ks) { matchOne(k); await sleep(320); }
        b.disabled = false; celebrate(b, `${ks.length} matched`);
        FS.toast(`${ks.length} Raast / IBFT receipts matched to invoices`, { tone: 'good' });
      };
      $('#cp-br-new').onclick = () => openBuilder(null);
      $('#cp-br-new2', sec).onclick = () => openBuilder(null);
    }
    FS.onEnter(ROUTE, (s, r, first) => { if (first) mount(s); });
  })();

  /* =====================================================================
     10. ACTIVITY FEED  (app/activity)
     ===================================================================== */
  (function activity() {
    const ROUTE = 'app/activity';
    const ME = 'Sana Javed';
    const MOD = { sales: ['Sales', 'receipt-text', 'green'], purchases: ['Purchases', 'shopping-cart', 'blue'], accounting: ['Accounting', 'book-open-check', 'violet'], bank: ['Bank', 'landmark', 'lime'], hr: ['HR', 'users', 'orange'], inventory: ['Inventory', 'package', 'red'] };
    let FEED = [
      { id: 1, day: 'Today', t: '12:42 PM', who: 'Zainab Raza', mod: 'sales', verb: 'created invoice', doc: ['INV-2026-000958', 'app/sales/invoices/view'], card: { amt: 598000, sub: 'Engro Foods · due 31 Oct', st: ['Sent', 'info'] }, text: '@Sana Javed Engro asked for 45-day terms on this one, can you approve the exception?', re: { '👍': 2, '🎉': 0 }, mine: {}, replies: [] },
      { id: 2, day: 'Today', t: '11:58 AM', who: 'Hira Ali', mod: 'bank', verb: 'received payment', doc: ['RV-2026-000412', 'app/receivables/receipts'], card: { amt: 1003000, sub: 'Shifa International · IBFT to Meezan 0123', st: ['Matched', 'good'] }, text: '', re: { '👍': 4, '🎉': 3 }, mine: {}, replies: [['Ahmed Raza', 'Great, that clears their September balance.', '12:05 PM']] },
      { id: 3, day: 'Today', t: '11:20 AM', who: 'Ayesha Noor', mod: 'hr', verb: 'submitted payroll run for approval', doc: ['PR-2026-09', 'app/hr/payroll/run'], card: { amt: 21485600, sub: '148 employees · September 2026', st: ['Awaiting you', 'warn'] }, text: 'Overtime for the warehouse team is included. @Sana Javed please review by 3 PM so we can upload to the bank today.', re: { '👍': 1, '🎉': 0 }, mine: {}, replies: [] },
      { id: 4, day: 'Today', t: '10:31 AM', who: 'Hira Ali', mod: 'accounting', verb: 'posted voucher', doc: ['JV-2026-000318', 'app/accounting/vouchers/view'], card: { amt: 850000, sub: 'Accrued audit fee, Q1 FY27', st: ['Posted', 'good'] }, text: '', re: { '👍': 1, '🎉': 0 }, mine: {}, replies: [] },
      { id: 5, day: 'Today', t: '09:15 AM', who: 'Usman Ali', mod: 'purchases', verb: 'raised purchase order', doc: ['PO-2026-000214', 'app/purchases/orders'], card: { amt: 1197000, sub: 'Habib Packaging · 12,000 cartons', st: ['Pending approval', 'warn'] }, text: 'Price is 3% lower than last quarter; locked till 15 Oct.', re: { '👍': 3, '🎉': 1 }, mine: {}, replies: [], att: ['Habib_quote_Sep26.pdf', '212 KB'] },
      { id: 6, day: 'Yesterday', t: '06:40 PM', who: 'Zainab Raza', mod: 'hr', verb: 'approved leave for', doc: ['Bilal Khan', 'app/hr/leave/requests'], card: null, text: 'Annual leave 6–10 Oct. Imran will cover Gulberg and DHA routes.', re: { '👍': 2, '🎉': 0 }, mine: {}, replies: [] },
      { id: 7, day: 'Yesterday', t: '04:12 PM', who: 'Kashif Ali', mod: 'inventory', verb: 'adjusted stock at', doc: ['Faisalabad Depot', 'app/inventory/adjustments'], card: { amt: 22800, sub: 'Surf Excel 1kg · 24 packs damaged in transit', st: ['Write-off', 'danger'] }, text: '@Faisal Qureshi photos attached, the TCS van roof was leaking.', re: { '👍': 0, '🎉': 0 }, mine: {}, replies: [['Faisal Qureshi', 'Raised a claim with TCS. Thanks Kashif.', '04:30 PM']], att: ['damage_photos.zip', '4.8 MB'] },
      { id: 8, day: 'Yesterday', t: '11:05 AM', who: 'Ahmed Raza', mod: 'accounting', verb: 'closed period', doc: ['September 2026', 'app/periods/close'], card: null, text: 'Well done team, September closed on day 1 for the first time! 🎉 @Hira Ali @Sana Javed', re: { '👍': 6, '🎉': 9 }, mine: { '🎉': true }, replies: [] },
      { id: 9, day: 'Mon 28 Sep', t: '03:22 PM', who: 'Mehwish Tariq', mod: 'purchases', verb: 'uploaded a bill from', doc: ['Daraz Business', 'app/purchases/bills'], card: { amt: 58000, sub: 'IT accessories · OCR captured 6 lines', st: ['Draft', 'neutral'] }, text: '', re: { '👍': 0, '🎉': 0 }, mine: {}, replies: [] },
      { id: 10, day: 'Mon 28 Sep', t: '09:48 AM', who: 'Bilal Khan', mod: 'sales', verb: 'won quotation', doc: ['QT-2026-000388', 'app/sales/quotations'], card: { amt: 742500, sub: 'Interloop Ltd · safety gear', st: ['Accepted', 'good'] }, text: 'Third order from Interloop this quarter 💪', re: { '👍': 5, '🎉': 4 }, mine: {}, replies: [] },
    ];
    let nextId = 100, tab = 'all', people = new Set(), mods = new Set(), sec, atts = [];
    const EMP = (D.employees || []);
    const mentionsMe = (p) => (p.text || '').includes('@' + ME) || p.replies.some((r) => r[1].includes('@' + ME));
    const fmtText = (s) => esc(s).replace(/@([A-Z][a-z]+(?: [A-Z][a-z]+)?)/g, (m, n) => `<mark class="cp-at${n === ME ? ' me' : ''}">@${n}</mark>`);
    const visible = (p) => (tab === 'all' || (tab === 'mentions' && mentionsMe(p)) || (tab === 'mine' && (p.who === ME || p.replies.some((r) => r[0] === ME)))) && (!people.size || people.has(p.who)) && (!mods.size || mods.has(p.mod));

    function replyHtml(r) { return `<div class="cp-rp">${av(r[0], 'xs')}<div><b>${r[0]}</b><small>${r[2]}</small><p>${fmtText(r[1])}</p></div></div>`; }
    function post(p, i) {
      const m = MOD[p.mod];
      return `<article class="cp-post${mentionsMe(p) ? ' ment' : ''}" data-id="${p.id}" style="--i:${i}">
        <div class="cp-post-av">${av(p.who, '')}<span class="cp-mod ${m[2]}" title="${m[0]}">${ic(m[1])}</span></div>
        <div class="cp-post-b">
          <div class="cp-post-h"><b>${p.who}</b> <span>${p.verb}</span> <a class="link" href="#/${p.doc[1]}">${esc(p.doc[0])}</a><span class="spacer"></span><small>${p.t}</small></div>
          ${p.text ? `<p class="cp-post-t">${fmtText(p.text)}</p>` : ''}
          ${p.card ? `<a class="cp-doc" href="#/${p.doc[1]}"><span class="icon-tile ${m[2]}">${ic(m[1])}</span><div><b>${esc(p.doc[0])}</b><small>${esc(p.card.sub)}</small></div><span class="spacer"></span><div class="cp-doc-r"><b>${FS.money(p.card.amt, { dec: 0 })}</b><span class="badge ${p.card.st[1]}">${p.card.st[0]}</span></div></a>` : ''}
          ${p.att ? `<div class="cp-att"><span class="cp-file">${ic(/\.pdf$/.test(p.att[0]) ? 'file-text' : /\.(png|jpe?g)$/.test(p.att[0]) ? 'image' : 'file-archive')}<b>${esc(p.att[0])}</b><small>${p.att[1]}</small></span></div>` : ''}
          <div class="cp-post-f"><span class="badge neutral">${ic(m[1])}${m[0]}</span>
            ${['👍', '🎉'].map((e) => `<button class="cp-re${p.mine[e] ? ' on' : ''}" data-re="${e}"><span>${e}</span><b>${p.re[e] || ''}</b></button>`).join('')}
            <button class="cp-re add" data-re-more title="React">${ic('smile-plus')}</button>
            <button class="cp-rbtn" data-reply>${ic('reply')}Reply${p.replies.length ? ` · ${p.replies.length}` : ''}</button></div>
          <div class="cp-rps">${p.replies.map(replyHtml).join('')}</div>
          <div class="cp-rin" hidden><span class="avatar xs lime">SJ</span><input placeholder="Reply to ${p.who.split(' ')[0]}…"><button class="btn primary sm icon">${ic('send')}</button></div>
        </div>
      </article>`;
    }
    function paint() {
      const host = $('#cp-af-feed', sec);
      const vis = FEED.filter(visible);
      let h = '', day = '';
      vis.forEach((p, i) => { if (p.day !== day) { day = p.day; h += `<div class="cp-day"><span>${day}</span></div>`; } h += post(p, i); });
      host.innerHTML = h || `<div class="empty-state"><span class="icon-well lg">${ic(tab === 'mentions' ? 'at-sign' : 'inbox')}</span><h4>${tab === 'mentions' ? 'No mentions match' : 'Nothing here'}</h4><p>Try clearing the people or module filters.</p></div>`;
      FS.icons(host);
      const mc = FEED.filter(mentionsMe).length;
      $('#cp-af-mc', sec).textContent = mc;
    }
    function sidebar() {
      const counts = {}; FEED.forEach((p) => (counts[p.who] = (counts[p.who] || 0) + 1));
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
      $('#cp-af-people', sec).innerHTML = top.map((n) => `<button class="cp-pp${people.has(n) ? ' on' : ''}" data-p="${n}">${av(n, 'xs')}<span>${n}</span><b>${counts[n]}</b></button>`).join('');
      $('#cp-af-mods', sec).innerHTML = Object.entries(MOD).map(([k, m]) => `<button class="cp-mb${mods.has(k) ? ' on' : ''}" data-m="${k}"><span class="cp-mod ${m[2]}">${ic(m[1])}</span>${m[0]}<b>${FEED.filter((p) => p.mod === k).length}</b></button>`).join('');
      FS.icons($('#cp-af-mods', sec));
      $('#cp-af-clear', sec).hidden = !people.size && !mods.size;
    }
    function render() {
      sec.insertAdjacentHTML('beforeend', `
      <div class="split cp-af-split">
        <div class="cp-af-main">
          <div class="panel cp-compose" id="cp-af-comp">
            <div class="cp-comp-row"><span class="avatar lime">SJ</span>
              <div class="cp-comp-in"><textarea id="cp-af-ta" rows="2" placeholder="Share an update, ask a question… type @ to mention someone"></textarea><div class="cp-mention" id="cp-af-mn" hidden></div></div></div>
            <div class="cp-comp-atts" id="cp-af-atts"></div>
            <div class="cp-comp-f">
              <button class="btn ghost sm" id="cp-af-attach">${ic('paperclip')}Attach</button><input type="file" id="cp-af-file" multiple hidden>
              <button class="btn ghost sm" id="cp-af-at">${ic('at-sign')}Mention</button>
              <button class="btn ghost sm" id="cp-af-link">${ic('link-2')}Link document</button>
              <select id="cp-af-mod" class="cp-sel-sm">${Object.entries(MOD).map(([k, m]) => `<option value="${k}" ${k === 'accounting' ? 'selected' : ''}>${m[0]}</option>`).join('')}</select>
              <span class="spacer"></span><small class="muted cp-hide-sm"><kbd>Ctrl</kbd>+<kbd>Enter</kbd></small>
              <button class="btn primary sm" id="cp-af-post" disabled>${ic('send')}Post</button>
            </div>
          </div>
          <div data-tabs><div class="tabs" id="cp-af-tabs"><button class="active" data-t="all">${ic('activity')}All activity</button><button data-t="mentions">${ic('at-sign')}Mentions <span class="badge lime" id="cp-af-mc">0</span></button><button data-t="mine">${ic('user')}My activity</button></div></div>
          <div class="cp-feed" id="cp-af-feed"></div>
        </div>
        <div class="stack cp-af-side">
          <div class="panel"><div class="panel-head"><div><h3>People</h3><p>Filter by who did it</p></div><button class="btn ghost sm" id="cp-af-clear" hidden>Clear</button></div><div class="cp-pps" id="cp-af-people"></div></div>
          <div class="panel"><div class="panel-head"><div><h3>Modules</h3></div></div><div class="cp-mbs" id="cp-af-mods"></div></div>
          <div class="panel cp-af-online"><div class="panel-head"><div><h3>Online now</h3><p>5 of 12 teammates</p></div></div><div class="cp-online-l">${['Ahmed Raza', 'Hira Ali', 'Zainab Raza', 'Ayesha Noor', 'Usman Ali'].map((n, i) => `<span class="cp-on" style="--i:${i}">${av(n, 'sm')}<i></i></span>`).join('')}</div></div>
        </div>
      </div>`);
      paint(); sidebar(); FS.icons(sec);
    }
    function setTab(t) {
      tab = t;
      $$('#cp-af-tabs button', sec).forEach((b) => b.classList.toggle('active', b.dataset.t === t));
      FS.positionInk($('#cp-af-tabs', sec));
      paint();
    }
    /* ---- @mention autocomplete ---- */
    let mnIdx = 0, mnList = [];
    function mentionState() {
      const ta = $('#cp-af-ta', sec), v = ta.value.slice(0, ta.selectionStart);
      const m = v.match(/@([A-Za-z]*(?: [A-Za-z]*)?)$/);
      const box = $('#cp-af-mn', sec);
      if (!m) { box.hidden = true; return; }
      const q = m[1].toLowerCase();
      mnList = EMP.filter((e) => e.name !== ME && (e.name.toLowerCase().startsWith(q) || e.name.toLowerCase().split(' ').some((w) => w.startsWith(q)) || e.role.toLowerCase().includes(q))).slice(0, 6);
      if (!mnList.length) { box.hidden = true; return; }
      mnIdx = clamp(mnIdx, 0, mnList.length - 1);
      box.innerHTML = `<small>Mention a teammate</small>${mnList.map((e, i) => `<button class="${i === mnIdx ? 'hl' : ''}" data-n="${e.name}">${av(e.name, 'xs')}<span><b>${e.name}</b><em>${e.role} · ${e.dept}</em></span></button>`).join('')}`;
      box.hidden = false;
    }
    function pickMention(name) {
      const ta = $('#cp-af-ta', sec), pos = ta.selectionStart, before = ta.value.slice(0, pos).replace(/@([A-Za-z]*(?: [A-Za-z]*)?)$/, '@' + name + ' ');
      ta.value = before + ta.value.slice(pos);
      ta.focus(); ta.selectionStart = ta.selectionEnd = before.length;
      $('#cp-af-mn', sec).hidden = true; syncPost();
    }
    const syncPost = () => { $('#cp-af-post', sec).disabled = !$('#cp-af-ta', sec).value.trim() && !atts.length; };
    function paintAtts() {
      $('#cp-af-atts', sec).innerHTML = atts.map((a, i) => `<span class="cp-file cp-pop">${ic(a[2] || 'file')}<b>${esc(a[0])}</b><small>${a[1]}</small><button data-rm="${i}" title="Remove">${ic('x')}</button></span>`).join('');
      FS.icons($('#cp-af-atts', sec)); syncPost();
    }
    async function doPost() {
      const ta = $('#cp-af-ta', sec), txt = ta.value.trim();
      if (!txt && !atts.length) return;
      const btn = $('#cp-af-post', sec);
      await busy(btn, 450, 'Posting…');
      const mod = $('#cp-af-mod', sec).value;
      const p = { id: nextId++, day: 'Today', t: 'Just now', who: ME, mod, verb: 'posted an update in', doc: [MOD[mod][0], { sales: 'app/sales/invoices', purchases: 'app/purchases/orders', accounting: 'app/accounting/vouchers', bank: 'app/bank/transactions', hr: 'app/hr/employees', inventory: 'app/inventory/stock' }[mod]], card: null, text: txt, re: { '👍': 0, '🎉': 0 }, mine: {}, replies: [], att: atts[0] ? [atts[0][0], atts[0][1]] : null };
      FEED.unshift(p);
      ta.value = ''; atts = []; paintAtts();
      if (tab === 'mentions') setTab('all');
      people.clear(); mods.clear(); sidebar();
      paint();
      const el = $(`.cp-post[data-id="${p.id}"]`, sec); el.classList.add('cp-new-post');
      const mentioned = [...new Set((txt.match(/@([A-Z][a-z]+ [A-Z][a-z]+)/g) || []).map((x) => x.slice(1)))].filter((n) => EMP.some((e) => e.name === n));
      FS.toast(mentioned.length ? `Posted · ${mentioned.join(', ')} notified` : 'Posted to the activity feed', { tone: 'good', ms: 2400 });
      syncPost();
    }
    function mount(s) {
      sec = s; render();
      const ta = $('#cp-af-ta', sec);
      ta.addEventListener('input', () => { mnIdx = 0; mentionState(); syncPost(); ta.style.height = 'auto'; ta.style.height = Math.min(160, ta.scrollHeight) + 'px'; });
      ta.addEventListener('click', mentionState);
      ta.addEventListener('keydown', (e) => {
        const box = $('#cp-af-mn', sec);
        if (!box.hidden) {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); mnIdx = (mnIdx + (e.key === 'ArrowDown' ? 1 : -1) + mnList.length) % mnList.length; mentionState(); return; }
          if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickMention(mnList[mnIdx].name); return; }
          if (e.key === 'Escape') { e.stopPropagation(); box.hidden = true; return; }
        }
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); doPost(); }
      });
      ta.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== ta) $('#cp-af-mn', sec).hidden = true; }, 150));
      $('#cp-af-mn', sec).addEventListener('mousedown', (e) => { const b = e.target.closest('[data-n]'); if (b) { e.preventDefault(); pickMention(b.dataset.n); } });
      $('#cp-af-at', sec).onclick = () => { const v = ta.value; ta.value = v + (v && !/\s$/.test(v) ? ' ' : '') + '@'; ta.focus(); ta.selectionStart = ta.selectionEnd = ta.value.length; mnIdx = 0; mentionState(); };
      $('#cp-af-attach', sec).onclick = () => $('#cp-af-file', sec).click();
      $('#cp-af-file', sec).onchange = (e) => { [...e.target.files].forEach((f) => atts.push([f.name, f.size > 1048576 ? (f.size / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(f.size / 1024)) + ' KB', /\.pdf$/i.test(f.name) ? 'file-text' : /\.(png|jpe?g|gif|webp)$/i.test(f.name) ? 'image' : /\.(xlsx?|csv)$/i.test(f.name) ? 'file-spreadsheet' : 'file'])); e.target.value = ''; paintAtts(); };
      $('#cp-af-link', sec).onclick = (e) => FS.menu(e.currentTarget, [['INV-2026-000958', 'receipt-text'], ['PO-2026-000214', 'shopping-cart'], ['JV-2026-000318', 'book-open-check'], ['PR-2026-09', 'users']].map(([d, i]) => ({ label: d, icon: i, onClick: () => { atts.push([d, 'Finsoft document', i]); paintAtts(); } })));
      $('#cp-af-atts', sec).addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (b) { atts.splice(+b.dataset.rm, 1); paintAtts(); } });
      $('#cp-af-post', sec).onclick = doPost;
      $('#cp-af-tabs', sec).addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (b) setTab(b.dataset.t); });
      $('#cp-af-people', sec).addEventListener('click', (e) => { const b = e.target.closest('[data-p]'); if (!b) return; people.has(b.dataset.p) ? people.delete(b.dataset.p) : people.add(b.dataset.p); sidebar(); paint(); });
      $('#cp-af-mods', sec).addEventListener('click', (e) => { const b = e.target.closest('[data-m]'); if (!b) return; mods.has(b.dataset.m) ? mods.delete(b.dataset.m) : mods.add(b.dataset.m); sidebar(); paint(); });
      $('#cp-af-clear', sec).onclick = () => { people.clear(); mods.clear(); sidebar(); paint(); };
      const feed = $('#cp-af-feed', sec);
      feed.addEventListener('click', (e) => {
        const art = e.target.closest('.cp-post'); if (!art) return;
        const p = FEED.find((x) => x.id === +art.dataset.id);
        const re = e.target.closest('[data-re]');
        if (re) {
          const k = re.dataset.re; p.mine[k] = !p.mine[k]; p.re[k] = (p.re[k] || 0) + (p.mine[k] ? 1 : -1);
          re.classList.toggle('on', p.mine[k]); $('b', re).textContent = p.re[k] || '';
          if (p.mine[k]) { re.classList.remove('cp-burst-re'); void re.offsetWidth; re.classList.add('cp-burst-re'); }
          return;
        }
        if (e.target.closest('[data-re-more]')) { FS.menu(e.target.closest('[data-re-more]'), ['👍 Like', '🎉 Celebrate'].map((l) => ({ label: l, onClick: () => { const k = l.split(' ')[0]; const b = $(`[data-re="${k}"]`, art); if (!p.mine[k]) b.click(); } }))); return; }
        if (e.target.closest('[data-reply]')) { const box = $('.cp-rin', art); box.hidden = !box.hidden; if (!box.hidden) $('input', box).focus(); return; }
        if (e.target.closest('.cp-rin .btn')) sendReply(art, p);
      });
      feed.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('.cp-rin input')) { const art = e.target.closest('.cp-post'); sendReply(art, FEED.find((x) => x.id === +art.dataset.id)); } });
    }
    function sendReply(art, p) {
      const inp = $('.cp-rin input', art), v = inp.value.trim(); if (!v) return;
      const r = [ME, v, 'Just now']; p.replies.push(r);
      const box = $('.cp-rps', art); box.insertAdjacentHTML('beforeend', replyHtml(r)); box.lastElementChild.classList.add('cp-new'); FS.icons(box.lastElementChild);
      inp.value = '';
      $('[data-reply]', art).innerHTML = `${ic('reply')}Reply · ${p.replies.length}`; FS.icons($('[data-reply]', art));
    }
    FS.onEnter(ROUTE, (s, r, first) => { if (first) mount(s); });
  })();
})();
