/* =====================================================================
   9E-cash-users.js : Cash Ledger (app/cash/ledger), Users (app/settings/users),
   Roles & Permissions (app/settings/roles). Shells in 49-cash-users.html,
   styles in 1E-cash-users.css. Prefix: cu-
   ===================================================================== */
(function () {
  'use strict';
  const FS = window.FS;
  const DATA = window.FS_DATA || {};
  if (!FS) return;

  /* ================================================================ helpers */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const RM = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n, d = 0) => Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const r2 = (n) => Math.round(n * 100) / 100;
  const money = (n, o) => FS.money(n, o);
  const icons = (r) => { try { FS.icons(r); } catch (e) { /* cosmetic */ } };
  const toast = (m, o) => FS.toast(m, o || {});
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const initials = (n) => String(n).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const hash = (s) => Array.from(String(s)).reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const avCls = (n) => ['', 'c2', 'c3', 'c4', 'c5', 'c6'][hash(n) % 6];
  const compact = (n) => { const a = Math.abs(n), s = n < 0 ? '−' : '+'; if (a >= 1e6) return s + (a / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M'; if (a >= 1e3) return s + Math.round(a / 1e3) + 'k'; return s + Math.round(a); };
  const replay = (el, cls) => { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
  const clone = (o) => JSON.parse(JSON.stringify(o));

  // signed rupee formatter for tweens
  const rs = (v, dec = 2) => (v < -0.004 ? '−' : '') + 'Rs ' + FS.money(Math.abs(v), { dec, rs: false });
  function tween(el, to, o = {}) {
    if (!el) return;
    const f = o.fmt || ((v) => rs(v, o.dec ?? 2));
    const from = el.dataset.v != null ? +el.dataset.v : (o.from ?? 0);
    el.dataset.v = to;
    cancelAnimationFrame(el._raf);
    if (RM() || from === to) { el.innerHTML = f(to); return; }
    const dur = o.dur || 800, t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.innerHTML = f(k === 1 ? to : from + (to - from) * e);
      if (k < 1) el._raf = requestAnimationFrame(step);
    };
    el._raf = requestAnimationFrame(step);
  }
  // live number change: prefer the shared FS.tick (v3), fall back to the local tween
  function tick(el, to, o = {}) {
    if (!el) return;
    if (typeof FS.tick === 'function' && !o.fmt) {
      if (el.dataset.v != null) el.dataset.val = el.dataset.v;
      try { FS.tick(el, to, { dec: o.dec ?? 2, prefix: o.prefix ?? 'Rs ', suffix: o.suffix || '', dur: o.dur || 800 }); el.dataset.v = to; return; } catch (e) { /* fall through */ }
    }
    tween(el, to, o);
  }
  const tickN = (el, to, suffix = '') => tick(el, to, { dec: 0, prefix: '', suffix });

  function celebrate(el) {
    if (typeof FS.celebrate === 'function') { try { FS.celebrate(el); return; } catch (e) { /* fall through */ } }
    if (RM()) return;
    const r = el && el.getBoundingClientRect ? el.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
    const b = document.createElement('div');
    b.className = 'cu-burst';
    b.style.left = r.left + r.width / 2 + 'px';
    b.style.top = r.top + r.height / 2 + 'px';
    const cols = ['--lime', '--primary', '--mint', '--warn', '--blue', '--violet'];
    b.innerHTML = '<span class="cu-burst-ok"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.2 4.2L19 7"/></svg></span>' +
      Array.from({ length: 18 }, (_, i) => `<i style="--a:${i * 20}deg;--d:${56 + (i % 3) * 20}px;--c:var(${cols[i % cols.length]})"></i>`).join('');
    document.body.appendChild(b);
    setTimeout(() => b.remove(), 1400);
  }

  function confirmBox(o) {
    if (typeof FS.confirm === 'function') return FS.confirm(o);
    return new Promise((res) => {
      const ov = document.createElement('div');
      ov.className = 'overlay';
      ov.dataset.temp = '1';
      ov.innerHTML = `<div class="modal cu-confirm" role="alertdialog"><div class="cu-confirm-ic ${o.danger ? 'danger' : ''}"><i data-lucide="${o.icon || (o.danger ? 'triangle-alert' : 'circle-help')}"></i></div><h3>${o.title}</h3><p>${o.text || ''}</p><div class="modal-foot"><button class="btn secondary" data-cf="0">Cancel</button><button class="btn ${o.danger ? 'danger solid' : 'primary'}" data-cf="1">${o.okLabel || 'Confirm'}</button></div></div>`;
      document.body.appendChild(ov);
      icons(ov);
      requestAnimationFrame(() => ov.classList.add('open'));
      let done = false;
      const fin = (v) => { if (done) return; done = true; FS.closeOverlay(ov); res(v); };
      ov.addEventListener('click', (e) => { const b = e.target.closest('[data-cf]'); if (b) fin(b.dataset.cf === '1'); else if (e.target === ov) fin(false); });
      const mo = new MutationObserver(() => { if (!ov.classList.contains('open') && !done && ov.isConnected) { done = true; res(false); mo.disconnect(); } });
      setTimeout(() => { mo.observe(ov, { attributes: true }); const ok = ov.querySelector('[data-cf="1"]'); if (ok) ok.focus(); }, 60);
    });
  }

  function busy(btn, label, ms = 1000) {
    if (!btn) return sleep(ms);
    const html = btn.innerHTML;
    btn.style.minWidth = btn.offsetWidth + 'px';
    btn.disabled = true;
    btn.classList.add('cu-busy');
    btn.innerHTML = `<span class="cu-spin"></span>${label}`;
    return sleep(ms).then(() => { btn.disabled = false; btn.classList.remove('cu-busy'); btn.innerHTML = html; btn.style.minWidth = ''; });
  }

  function onRoute(route, mount, enter) {
    FS.onEnter(route, (sec, r, first) => {
      if (first || !sec.dataset.cuMounted) { sec.dataset.cuMounted = '1'; mount(sec); }
      else if (enter) enter(sec);
    });
  }

  /* ================================================================ dates */
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const WDS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const WDL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dU = (s) => { const p = s.split('-').map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2])); };
  const dS = (d) => d.toISOString().slice(0, 10);
  const addD = (s, n) => { const x = dU(s); x.setUTCDate(x.getUTCDate() + n); return dS(x); };
  const dow = (s) => dU(s).getUTCDay();
  const dMon = (s) => `${s.slice(8)} ${MON[+s.slice(5, 7) - 1]}`;
  const dLong = (s) => `${WDL[dow(s)]}, ${dMon(s)} ${s.slice(0, 4)}`;
  const t12 = (t) => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
  const TODAY = '2026-10-01', START = '2026-09-15';
  const DAYS = []; for (let s = START; s <= TODAY; s = addD(s, 1)) DAYS.push(s);

  /* ================================================================ PRNG */
  const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = (R, a) => a[Math.floor(R() * a.length)];
  const between = (R, a, b) => a + R() * (b - a);
  const roundTo = (n, s) => Math.max(s, Math.round(n / s) * s);

  /* =====================================================================
     1) CASH LEDGER
     ===================================================================== */
  const CATS = {
    sales: { label: 'Walk-in sales', dir: 'in', type: 'CRV', icon: 'shopping-bag', color: 'var(--good)' },
    collect: { label: 'Collections', dir: 'in', type: 'CRV', icon: 'hand-coins', color: 'var(--blue)' },
    bankin: { label: 'Bank withdrawal', dir: 'in', type: 'JV', icon: 'landmark', color: 'var(--info)' },
    deposit: { label: 'Bank deposit', dir: 'out', type: 'JV', icon: 'building-2', color: 'var(--violet)' },
    petty: { label: 'Petty expenses', dir: 'out', type: 'CPV', icon: 'coffee', color: 'var(--orange)' },
    advance: { label: 'Salary advance', dir: 'out', type: 'CPV', icon: 'user-round', color: 'var(--warn)' },
    utility: { label: 'Utilities', dir: 'out', type: 'CPV', icon: 'zap', color: 'var(--danger)' },
    courier: { label: 'Courier', dir: 'out', type: 'CPV', icon: 'package', color: 'var(--mint)' },
    fuel: { label: 'Fuel', dir: 'out', type: 'CPV', icon: 'fuel', color: 'var(--primary)' },
    vendor: { label: 'Vendor payment', dir: 'out', type: 'CPV', icon: 'store', color: 'var(--muted)' },
  };
  const TYPE_LONG = { CRV: 'Cash receipt voucher', CPV: 'Cash payment voucher', JV: 'Journal (contra) voucher' };
  const CONTRA = {
    sales: { code: '4110', name: 'Sales — Counter' }, collect: { code: '1130', name: 'Trade debtors' },
    petty: { code: '6150', name: 'Office & petty expenses' }, advance: { code: '1160', name: 'Staff advances' },
    utility: { code: '6210', name: 'Utilities' }, courier: { code: '6320', name: 'Courier & postage' },
    fuel: { code: '6330', name: 'Vehicle running — fuel' }, vendor: { code: '2110', name: 'Trade creditors' },
  };
  const KEYS = ['LHR', 'KHI', 'ISB', 'FSD'];
  const PROFILE = {
    LHR: { custodian: 'Hira Ali', icon: 'vault', w: { sales: 9, collect: 5, bankin: 1, petty: 6, deposit: 4, advance: 3, utility: 2, courier: 3, fuel: 3, vendor: 3 }, extra: 0.85 },
    KHI: { custodian: 'Zainab Raza', icon: 'coins', w: { bankin: 3, petty: 12, courier: 6, fuel: 6, advance: 2, utility: 2, vendor: 1 }, extra: 0.6 },
    ISB: { custodian: 'Ali Haider', icon: 'monitor-smartphone', w: { sales: 8, collect: 3, deposit: 3, petty: 6, courier: 3, fuel: 3, advance: 1, utility: 1 }, extra: 0.6 },
    FSD: { custodian: 'Kashif Ali', icon: 'wallet', w: { bankin: 3, petty: 10, fuel: 7, courier: 4, advance: 2, utility: 1 }, extra: 0.5 },
  };
  const RANGE = {
    sales: { LHR: [12000, 240000], ISB: [4000, 65000] }, collect: { LHR: [45000, 420000], ISB: [20000, 125000] },
    bankin: { LHR: [100000, 300000], KHI: [20000, 35000], FSD: [15000, 25000], ISB: [40000, 80000] },
    deposit: { LHR: [250000, 850000], ISB: [60000, 180000] }, petty: { _: [350, 5800] },
    advance: { LHR: [10000, 40000], ISB: [5000, 15000], _: [3000, 8000] }, utility: { LHR: [8000, 62000], ISB: [4000, 15000], _: [2000, 9000] },
    courier: { _: [450, 3800] }, fuel: { LHR: [3000, 12000], _: [1500, 6000] }, vendor: { LHR: [15000, 90000], _: [4000, 12000] },
  };
  const PETTY = ['Tea, milk & sugar for office', 'Stationery — files & markers', 'Cleaning supplies & detergent', 'Photocopy & printing', 'Drinking water bottles (19 L)', 'Electrician — office wiring repair', 'Guest refreshments', 'Plumber — washroom fittings', 'Pantry — biscuits & snacks', 'Rickshaw fare — bank visit'];
  const UTIL = { LHR: 'LESCO electricity — Sep 2026', KHI: 'K-Electric bill — Sep 2026', ISB: 'IESCO electricity — Sep 2026', FSD: 'FESCO electricity — Sep 2026' };
  const UTIL2 = ['SNGPL gas bill — Sep', 'PTCL broadband — Oct', 'Water & WASA charges', 'Jazz postpaid — field phones'];
  const COURIER = ['TCS — documents to Karachi', 'Leopards — samples to Faisalabad', 'TCS overnight — cheque book', 'M&P — cartons to Islamabad', 'TCS — sales tax return to RTO', 'Leopards COD — spare parts'];
  const FUEL = ['Fuel — delivery van LEA-4471', 'Fuel — Suzuki Bolan LES-2290', 'PSO card top-up', 'Generator diesel 20 L', 'Fuel — Honda CD70 rider'];
  const CASH = (DATA.cashAccounts || []).map((a, i) => ({ ...a, key: KEYS[i] || 'C' + i, branch: (DATA.branches || [])[i] || 'Lahore HQ', ...PROFILE[KEYS[i] || 'LHR'] }));

  function rangeFor(cat, key) { const r = RANGE[cat]; return r[key] || r._ || [1000, 5000]; }

  function makeEntry(cat, acct, R) {
    const [lo, hi] = rangeFor(cat, acct.key);
    const target = between(R, lo, hi);
    const banks = DATA.banks || [];
    const e = { cat, dir: CATS[cat].dir, type: CATS[cat].type, contra: CONTRA[cat] || null, party: '', doc: '' };
    if (cat === 'sales') {
      const it = pick(R, (DATA.items || []).filter((x) => x.price * 1.18 < target));
      const item = it || (DATA.items || [])[1] || { name: 'Counter goods', price: 1000 };
      const qty = Math.max(1, Math.round(target / (item.price * 1.18)));
      e.amt = Math.round(item.price * qty * 1.18);
      e.part = `Counter sale — ${qty} × ${item.name}`;
      e.party = 'Walk-in Customer';
    } else if (cat === 'collect') {
      const pool = (DATA.customers || []).filter((c) => c.group !== 'Cash' && (acct.key !== 'ISB' || c.city === 'Islamabad'));
      const c = pick(R, pool.length ? pool : DATA.customers);
      e.amt = roundTo(target, 100);
      e.part = `Receipt from ${c.name}`;
      e.party = c.name;
      e.doc = 'INV-2026-000' + (100 + Math.floor(R() * 80));
    } else if (cat === 'bankin' || cat === 'deposit') {
      const b = pick(R, banks.length ? banks : [{ code: '1120-01', name: 'Meezan Bank — 0123', short: 'Meezan 0123' }]);
      e.amt = roundTo(target, 1000);
      e.contra = { code: b.code, name: b.name };
      e.party = b.short;
      if (cat === 'deposit') { e.part = `Cash deposited — ${b.short}`; e.doc = 'Slip #' + (4400 + Math.floor(R() * 500)); }
      else if (acct.key === 'LHR' || acct.key === 'ISB') { e.part = `Cash withdrawn — ${b.short}`; e.doc = 'Chq #00' + (7100 + Math.floor(R() * 400)); }
      else { e.part = `Imprest top-up from ${b.short}`; e.doc = 'Chq #00' + (7100 + Math.floor(R() * 400)); }
    } else if (cat === 'petty') {
      e.amt = roundTo(target, 10); e.part = pick(R, PETTY);
    } else if (cat === 'advance') {
      const pool = (DATA.employees || []).filter((x) => x.branch === acct.branch);
      const emp = pick(R, pool.length ? pool : DATA.employees);
      e.amt = roundTo(target, 500); e.part = `Salary advance — ${emp.name}`; e.party = emp.name; e.doc = emp.id;
    } else if (cat === 'utility') {
      e.amt = roundTo(target, 10); e.part = R() < 0.55 ? UTIL[acct.key] : pick(R, UTIL2);
    } else if (cat === 'courier') {
      e.amt = roundTo(target, 10); e.part = pick(R, COURIER); e.party = /Leopards/.test(e.part) ? 'Leopards Courier' : /M&P/.test(e.part) ? 'M&P Express' : 'TCS Logistics';
    } else if (cat === 'fuel') {
      e.amt = roundTo(target, 10); e.part = pick(R, FUEL); e.party = 'PSO — Pakistan State Oil';
    } else {
      const v = pick(R, (DATA.vendors || []).filter((x) => ['VEN-0005', 'VEN-0006', 'VEN-0007', 'VEN-0001'].includes(x.code)));
      e.amt = roundTo(target, 100); e.part = `Payment to ${v ? v.name : 'vendor'}`; e.party = v ? v.name : ''; e.doc = 'BILL-2026-000' + (200 + Math.floor(R() * 60));
    }
    return e;
  }

  function pickCat(R, w) {
    const keys = Object.keys(w), tot = keys.reduce((a, k) => a + w[k], 0);
    let x = R() * tot;
    for (const k of keys) { x -= w[k]; if (x <= 0) return k; }
    return keys[keys.length - 1];
  }

  function genAccount(acct, idx) {
    const R = rng(1009 + idx * 7919);
    const slots = [];
    DAYS.forEach((d) => {
      const wd = dow(d);
      let n = wd === 0 ? (R() < 0.45 ? 1 : 0) : 2 + (R() < acct.extra ? 1 : 0) - (R() < 0.12 ? 1 : 0);
      if (d === TODAY) n = Math.min(n, 2) + 1;
      const mins = [];
      for (let i = 0; i < n; i++) mins.push(d === TODAY ? 545 + Math.floor(R() * 310) : 550 + Math.floor(R() * 575));
      mins.sort((a, b) => a - b).forEach((m) => slots.push({ date: d, time: String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0') }));
    });
    // walk backwards from the known closing balance so the forward running balance can never go negative
    const outW = {}; Object.keys(acct.w).forEach((k) => { if (CATS[k].dir === 'out') outW[k] = acct.w[k]; });
    let after = acct.balance;
    const list = [];
    for (let i = slots.length - 1; i >= 0; i--) {
      let e = makeEntry(pickCat(R, acct.w), acct, R);
      if (e.dir === 'in' && after - e.amt < 500) e = makeEntry(pickCat(R, outW), acct, R);
      after = e.dir === 'in' ? after - e.amt : after + e.amt;
      Object.assign(e, slots[i]);
      list.unshift(e);
    }
    const opening = after;
    const seq = { CRV: 380 + idx * 40, CPV: 620 + idx * 55, JV: 140 + idx * 12 };
    let bal = opening;
    list.forEach((e, k) => {
      seq[e.type]++;
      e.id = acct.key + '-' + k;
      e.ref = `${e.type}-${acct.key}-${String(seq[e.type]).padStart(4, '0')}`;
      bal = e.dir === 'in' ? bal + e.amt : bal - e.amt;
      e.bal = bal;
      e.by = acct.custodian;
      e.appr = e.amt >= 50000 || e.type === 'JV' ? 'Sana Javed' : 'Hira Ali';
      e.att = e.type === 'JV' ? 1 : Math.floor(R() * 3);
    });
    // day locks: everything before 30 Sep is closed, with small historical over/short
    const locks = {};
    DAYS.forEach((d) => {
      if (d >= '2026-09-30') return;
      const v = R() < 0.58 ? 0 : (R() < 0.66 ? -1 : 1) * roundTo(between(R, 10, 380), 10);
      locks[d] = { v, by: R() < 0.7 ? 'Sana Javed' : acct.custodian, at: `${17 + Math.floor(R() * 2)}:${String(10 + Math.floor(R() * 49)).padStart(2, '0')}` };
    });
    return { acct, opening, entries: list, locks, counts: {} };
  }
  const LED = CASH.map(genAccount);

  const NOTES = [5000, 1000, 500, 100, 50, 20, 10];
  const NOTE_TONE = { 5000: 'olive', 1000: 'blue', 500: 'green', 100: 'red', 50: 'violet', 20: 'orange', 10: 'brown' };
  function greedy(total) { const c = {}; let rem = Math.round(total); NOTES.forEach((n) => { c[n] = Math.floor(rem / n); rem -= c[n] * n; }); c.coins = rem; return c; }

  const L = { sec: null, acct: 0, from: START, to: TODAY, preset: 'custom', view: 'table', q: '', dir: 'all', cats: new Set(), vt: 'all', min: '', max: '', page: 1, day: TODAY, donut: 'out' };
  const AD = () => LED[L.acct];
  const signed = (e) => (e.dir === 'in' ? e.amt : -e.amt);
  function balEnd(ad, d) { let b = ad.opening; for (const e of ad.entries) { if (e.date <= d) b = e.bal; else break; } return b; }
  function balStart(ad, d) { let b = ad.opening; for (const e of ad.entries) { if (e.date < d) b = e.bal; else break; } return b; }
  const filtersOn = () => !!(L.q || L.dir !== 'all' || L.cats.size || L.vt !== 'all' || L.min !== '' || L.max !== '');
  function passes(e) {
    if (L.dir !== 'all' && e.dir !== L.dir) return false;
    if (L.cats.size && !L.cats.has(e.cat)) return false;
    if (L.vt !== 'all' && e.type !== L.vt) return false;
    if (L.min !== '' && e.amt < +L.min) return false;
    if (L.max !== '' && e.amt > +L.max) return false;
    if (L.q) { const q = L.q.toLowerCase(); if (![e.ref, e.part, e.party, e.doc, e.contra && e.contra.name, CATS[e.cat].label, String(e.amt)].join(' ').toLowerCase().includes(q)) return false; }
    return true;
  }
  const periodRows = (ad) => ad.entries.filter((e) => e.date >= L.from && e.date <= L.to);
  const shown = (ad) => periodRows(ad).filter(passes);

  function sparkPath(vals, w = 120, h = 34) {
    const mn = Math.min(...vals), mx = Math.max(...vals), span = mx - mn || 1;
    const pts = vals.map((v, i) => [(i / (vals.length - 1)) * w, h - 3 - ((v - mn) / span) * (h - 8)]);
    const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    return { line, area: `${line} L${w} ${h} L0 ${h} Z`, last: pts[pts.length - 1] };
  }

  /* ---------------------------------------------------------------- mount */
  function ledgerMount(sec) {
    L.sec = sec;
    sec.innerHTML = `
      <div class="page-head cu-head">
        <div>
          <div class="eyebrow">Finance / Cash</div>
          <h1>Cash Ledger</h1>
          <p>Running balance of every drawer, counter and imprest — with day close, denominations and a full audit trail.</p>
        </div>
        <div class="cu-head-r">
          <span class="tagline">Every rupee, accounted for</span>
          <div class="head-actions">
            <button class="btn secondary" data-cl="export"><i data-lucide="download"></i>Export<i data-lucide="chevron-down" class="cu-cv"></i></button>
            <button class="btn secondary" data-cl="print"><i data-lucide="printer"></i>Print</button>
            <button class="btn primary" data-cl="close"><i data-lucide="lock-keyhole"></i>Close Day</button>
          </div>
        </div>
      </div>
      <div class="cu-accts" data-cl-accts role="tablist" aria-label="Cash accounts"></div>
      <div class="cu-period">
        <div class="seg" data-cl-presets>
          <button data-p="today">Today</button><button data-p="week">This week</button><button data-p="month">This month</button><button data-p="custom" class="active">Custom</button>
        </div>
        <label class="cu-range"><i data-lucide="calendar-range"></i><input type="date" data-cl-from min="${START}" max="${TODAY}" value="${L.from}" aria-label="From date"><span>→</span><input type="date" data-cl-to min="${START}" max="${TODAY}" value="${L.to}" aria-label="To date"></label>
        <span class="spacer"></span>
        <span class="pill cu-cust" data-cl-cust></span>
      </div>
      <div class="cu-kpis" data-cl-kpis></div>
      <div class="cu-lg">
        <div class="panel flush cu-main">
          <div class="cu-main-head">
            <div><h3 data-cl-title>Ledger</h3><p data-cl-sub></p></div>
            <div class="seg cu-views" data-cl-views>
              <button data-v="table" class="active"><i data-lucide="table-2"></i>Table</button>
              <button data-v="timeline"><i data-lucide="git-commit-vertical"></i>Timeline</button>
              <button data-v="heat"><i data-lucide="calendar-days"></i>Calendar heatmap</button>
            </div>
          </div>
          <div class="cu-filters" data-plain-search>
            <label class="search-field cu-search"><i data-lucide="search"></i><input data-cl-q placeholder="Search ref, party, particulars, amount…"><kbd>/</kbd></label>
            <div class="cu-dirs" data-cl-dirs><button data-dir="all" class="active">All</button><button data-dir="in"><i data-lucide="arrow-down-left"></i>In</button><button data-dir="out"><i data-lucide="arrow-up-right"></i>Out</button></div>
            <label class="cu-fsel"><i data-lucide="file-text"></i><select data-cl-vt aria-label="Voucher type"><option value="all">All types</option><option value="CRV">CRV · receipts</option><option value="CPV">CPV · payments</option><option value="JV">JV · contra</option></select></label>
            <div class="cu-amt"><span>Rs</span><input type="number" min="0" placeholder="Min" data-cl-min aria-label="Minimum amount"><i></i><input type="number" min="0" placeholder="Max" data-cl-max aria-label="Maximum amount"></div>
          </div>
          <div class="cu-catchips" data-cl-cats></div>
          <div class="cu-view" data-cl-view></div>
        </div>
        <aside class="cu-rail">
          <div class="panel cu-dc" data-cl-dc></div>
          <div class="panel cu-vtp" data-cl-var></div>
          <div class="panel cu-dn" data-cl-donut></div>
        </aside>
      </div>`;
    bindLedger(sec);
    renderAccts();
    renderCats();
    refresh({ anim: true });
    icons(sec);
  }

  function ledgerEnter() { refresh({ anim: true, kpiFrom0: true }); }

  /* ---------------------------------------------------------------- render: accounts */
  function renderAccts() {
    const box = $('[data-cl-accts]', L.sec);
    box.innerHTML = LED.map((ad, i) => {
      const a = ad.acct, vals = DAYS.map((d) => balEnd(ad, d)), sp = sparkPath(vals);
      const delta = vals[vals.length - 1] - ad.opening, pct = ad.opening ? (delta / ad.opening) * 100 : 0;
      return `<button class="cu-acct ${i === L.acct ? 'active' : ''}" data-cl-acct="${i}" role="tab" aria-selected="${i === L.acct}" style="--i:${i}">
        <span class="cu-acct-top"><span class="icon-tile ${['', 'orange', 'blue', 'violet'][i % 4]}"><i data-lucide="${a.icon}"></i></span><span class="cu-acct-name"><b>${esc(a.short)}</b><small>${a.code} · ${esc(a.branch)}</small></span><span class="cu-acct-ck"><i data-lucide="check"></i></span></span>
        <span class="cu-acct-bal">${money(vals[vals.length - 1])}</span>
        <span class="cu-acct-foot"><span class="cu-delta ${delta >= 0 ? 'up' : 'down'}"><i data-lucide="${delta >= 0 ? 'trending-up' : 'trending-down'}"></i>${pct >= 0 ? '+' : '−'}${Math.abs(pct).toFixed(1)}%</span><small>since 15 Sep</small>
        <svg class="cu-spark" viewBox="0 0 120 34" preserveAspectRatio="none" aria-hidden="true"><path class="a" d="${sp.area}"/><path class="l" d="${sp.line}" pathLength="1"/><circle cx="${sp.last[0]}" cy="${sp.last[1]}" r="2.6"/></svg></span>
      </button>`;
    }).join('');
    icons(box);
  }

  function renderCats() {
    const ad = AD(), box = $('[data-cl-cats]', L.sec);
    const counts = {};
    periodRows(ad).forEach((e) => { counts[e.cat] = (counts[e.cat] || 0) + 1; });
    const keys = Object.keys(CATS).filter((k) => counts[k]);
    [...L.cats].forEach((k) => { if (!counts[k]) L.cats.delete(k); });
    box.innerHTML = `<span class="cu-catlbl"><i data-lucide="tags"></i>Categories</span>` + keys.map((k) => `<button class="cu-catchip ${L.cats.has(k) ? 'on' : ''}" data-cat="${k}" style="--cc:${CATS[k].color}" aria-pressed="${L.cats.has(k)}"><i class="d"></i>${CATS[k].label}<em>${counts[k]}</em></button>`).join('') + `<button class="cu-clear" data-cl-clear ${filtersOn() ? '' : 'disabled'}><i data-lucide="x"></i>Clear all</button>`;
    icons(box);
  }

  /* ---------------------------------------------------------------- render: KPIs */
  function renderKpis(o = {}) {
    const ad = AD(), rows = shown(ad), box = $('[data-cl-kpis]', L.sec);
    const open = balStart(ad, L.from), close = balEnd(ad, L.to);
    const inR = rows.filter((e) => e.dir === 'in'), outR = rows.filter((e) => e.dir === 'out');
    const tin = inR.reduce((a, e) => a + e.amt, 0), tout = outR.reduce((a, e) => a + e.amt, 0);
    if (!box.firstElementChild) {
      const card = (k, label, icon, tone) => `<div class="cu-kpi ${tone}" data-k="${k}"><span class="cu-kpi-ic"><i data-lucide="${icon}"></i></span><div><small>${label}</small><b data-kv></b><em data-ke></em></div></div>`;
      box.innerHTML = card('open', 'Opening balance', 'flag', 'neutral') + card('in', 'Receipts (in)', 'arrow-down-left', 'good') + card('out', 'Payments (out)', 'arrow-up-right', 'bad') + card('close', 'Closing balance', 'wallet', 'brand') + card('n', 'Transactions', 'list-ordered', 'violet');
      icons(box);
    }
    const set = (k, v, sub, isCount) => {
      const c = $(`[data-k="${k}"]`, box), b = $('[data-kv]', c);
      if (o.kpiFrom0) b.dataset.v = 0;
      isCount ? tickN(b, v) : tick(b, v);
      $('[data-ke]', c).innerHTML = sub;
    };
    const diff = close - open;
    set('open', open, `as of ${dMon(L.from)}`);
    set('in', tin, `${inR.length} receipt${inR.length === 1 ? '' : 's'}${filtersOn() ? ' · filtered' : ''}`);
    set('out', tout, `${outR.length} payment${outR.length === 1 ? '' : 's'}${filtersOn() ? ' · filtered' : ''}`);
    set('close', close, `<span class="${diff >= 0 ? 'up' : 'down'}"><i data-lucide="${diff >= 0 ? 'arrow-up' : 'arrow-down'}"></i>${rs(Math.abs(diff), 0)}</span> vs opening`);
    set('n', rows.length, rows.length ? `avg ${rs((tin + tout) / rows.length, 0)}` : 'no entries', true);
    icons(box);
  }

  /* ---------------------------------------------------------------- render: views */
  function refresh(o = {}) {
    const ad = AD();
    $('[data-cl-cust]', L.sec).innerHTML = `<i data-lucide="user-round-check"></i>Custodian <b>${esc(ad.acct.custodian)}</b><span class="cu-dot"></span>${esc(ad.acct.name)}`;
    renderKpis(o);
    renderView(o.anim);
    renderDayClose();
    renderVariance();
    renderDonut();
    const clr = $('[data-cl-clear]', L.sec); clr.disabled = !filtersOn();
    icons($('[data-cl-cust]', L.sec));
  }

  function renderView(anim) {
    const box = $('[data-cl-view]', L.sec), ad = AD(), rows = shown(ad);
    const title = { table: 'Ledger', timeline: 'Day timeline', heat: 'Daily net flow' }[L.view];
    $('[data-cl-title]', L.sec).innerHTML = `${title} <span>· ${esc(ad.acct.short)}</span>`;
    $('[data-cl-sub]', L.sec).textContent = `${dMon(L.from)} – ${dMon(L.to)} ${L.to.slice(0, 4)} · ${rows.length} of ${periodRows(ad).length} entries${filtersOn() ? ' (filtered)' : ''}`;
    box.classList.toggle('cu-anim', !!anim);
    if (L.view === 'table') box.innerHTML = tableHtml(ad, rows);
    else if (L.view === 'timeline') box.innerHTML = timelineHtml(ad, rows);
    else box.innerHTML = heatHtml(ad, rows);
    if (anim) replay(box, 'cu-swap');
    icons(box);
  }

  const PER = 18;
  function tableHtml(ad, rows) {
    const pages = Math.max(1, Math.ceil(rows.length / PER));
    L.page = Math.min(Math.max(1, L.page), pages);
    const slice = rows.slice((L.page - 1) * PER, L.page * PER);
    const bf = slice.length ? slice[0].bal - signed(slice[0]) : balStart(ad, L.from);
    const bfDate = L.page === 1 || !slice.length ? L.from : slice[0].date;
    let h = '', k = 0;
    h += `<tr class="bf"><td class="date"><b>${dMon(bfDate)}</b><small>${WDS[dow(bfDate)]}</small></td><td colspan="2"><span class="al-ref">Balance brought forward</span><small class="cu-muted">${L.page === 1 ? 'Opening balance for the period' : 'Carried from page ' + (L.page - 1)}</small></td><td class="cu-ccol"></td><td class="num"></td><td class="num"></td><td class="num bal">${money(bf)}<small>Dr</small></td><td class="ctr"></td></tr>`;
    if (!slice.length) {
      h += `<tr class="al-none"><td colspan="8"><div class="empty-state"><span class="icon-well lg"><i data-lucide="search-x"></i></span><h4>No entries match</h4><p>Try widening the period or clearing filters.</p><button class="btn secondary sm" data-cl-clear2><i data-lucide="x"></i>Clear filters</button></div></td></tr>`;
    }
    let i = 0;
    while (i < slice.length) {
      const d = slice[i].date, grp = [];
      while (i < slice.length && slice[i].date === d) grp.push(slice[i++]);
      const locked = ad.locks[d];
      grp.forEach((e) => {
        const c = CATS[e.cat];
        h += `<tr class="in cu-row ${e.dir}${locked ? ' cu-locked' : ''}" data-id="${e.id}" style="--i:${Math.min(k++, 24)}" tabindex="0">
          <td class="date"><b>${dMon(e.date)}${locked ? '<i data-lucide="lock" class="cu-lk"></i>' : ''}</b><small>${WDS[dow(e.date)]} · ${t12(e.time)}</small></td>
          <td><span class="al-ref">${e.ref}</span><span class="al-type ${e.type.toLowerCase()}">${e.type}</span></td>
          <td class="part"><b>${esc(e.part)}</b><small>${e.dir === 'in' ? 'To' : 'By'} ${e.contra.code} · ${esc(e.contra.name)}</small><span class="cu-cat cu-cat-inl" style="--cc:${c.color}"><i></i>${c.label}</span></td>
          <td class="cu-ccol"><span class="cu-cat" style="--cc:${c.color}"><i></i>${c.label}</span></td>
          <td class="num dr">${e.dir === 'in' ? money(e.amt) : '<i>—</i>'}</td>
          <td class="num cr">${e.dir === 'out' ? money(e.amt) : '<i>—</i>'}</td>
          <td class="num bal">${money(e.bal)}<small>Dr</small></td>
          <td class="ctr"><button class="al-dots" data-cl-dots aria-label="Row actions"><i data-lucide="more-vertical"></i></button></td></tr>`;
      });
      const din = grp.filter((e) => e.dir === 'in').reduce((a, e) => a + e.amt, 0), dout = grp.filter((e) => e.dir === 'out').reduce((a, e) => a + e.amt, 0);
      h += `<tr class="cu-sub${L.day === d ? ' sel' : ''}" data-cl-day="${d}" style="--i:${Math.min(k++, 24)}"><td colspan="3"><span class="cu-sub-l"><i data-lucide="${locked ? 'lock' : 'sigma'}"></i>Day total · ${WDS[dow(d)]} ${dMon(d)}<em>${grp.length} ${grp.length === 1 ? 'entry' : 'entries'}</em>${locked ? '<span class="cu-sub-lock">Closed</span>' : '<span class="cu-sub-open">Open</span>'}</span></td><td class="cu-ccol"></td><td class="num dr">${din ? money(din) : '<i>—</i>'}</td><td class="num cr">${dout ? money(dout) : '<i>—</i>'}</td><td class="num bal">${money(grp[grp.length - 1].bal)}<small>Dr</small></td><td class="ctr"></td></tr>`;
    }
    const pin = slice.filter((e) => e.dir === 'in').reduce((a, e) => a + e.amt, 0), pout = slice.filter((e) => e.dir === 'out').reduce((a, e) => a + e.amt, 0);
    const last = L.page === pages;
    const end = slice.length ? slice[slice.length - 1].bal : bf;
    const foot = `<tfoot>
      <tr class="cu-ptot"><td colspan="3">Page total <small>${slice.length} entries</small></td><td class="cu-ccol"></td><td class="num dr">${money(pin)}</td><td class="num cr">${money(pout)}</td><td class="num"></td><td></td></tr>
      <tr class="cu-end"><td colspan="3">${last ? (filtersOn() ? 'Balance after last shown entry' : 'Closing balance carried down') : 'Balance carried forward'} <small>${last ? 'as of ' + dMon(L.to) : 'to page ' + (L.page + 1)}</small></td><td class="cu-ccol"></td><td class="num"></td><td class="num"></td><td class="num bal">${money(last && !filtersOn() ? balEnd(ad, L.to) : end)}<small>Dr</small></td><td></td></tr>
    </tfoot>`;
    const pager = pages > 1 ? `<div class="cu-pager">${'<button data-pg="prev" ' + (L.page === 1 ? 'disabled' : '') + ' aria-label="Previous page"><i data-lucide="chevron-left"></i></button>'}${Array.from({ length: pages }, (_, p) => `<button data-pg="${p + 1}" class="${p + 1 === L.page ? 'active' : ''}">${p + 1}</button>`).join('')}<button data-pg="next" ${L.page === pages ? 'disabled' : ''} aria-label="Next page"><i data-lucide="chevron-right"></i></button></div>` : '';
    return `<div class="al-table cu-lt"><table>
      <thead><tr><th>Date</th><th>Voucher</th><th>Particulars</th><th class="cu-ccol">Category</th><th class="num">Receipt</th><th class="num">Payment</th><th class="num">Balance</th><th></th></tr></thead>
      <tbody>${h}</tbody>${slice.length ? foot : ''}</table></div>
      <div class="cu-lfoot"><span><i data-lucide="info"></i>${rows.length ? `Showing ${(L.page - 1) * PER + 1}–${(L.page - 1) * PER + slice.length} of ${rows.length}` : 'No entries'} · balance column always reflects the full ledger</span>${pager}</div>`;
  }

  function timelineHtml(ad, rows) {
    if (!rows.length) return `<div class="empty-state"><span class="icon-well lg"><i data-lucide="calendar-x"></i></span><h4>Nothing in this period</h4><p>Adjust the date range or filters.</p></div>`;
    const days = [...new Set(rows.map((e) => e.date))].sort().reverse();
    return `<div class="cu-tl">` + days.map((d, k) => {
      const g = rows.filter((e) => e.date === d), locked = ad.locks[d];
      const din = g.filter((e) => e.dir === 'in').reduce((a, e) => a + e.amt, 0), dout = g.filter((e) => e.dir === 'out').reduce((a, e) => a + e.amt, 0);
      return `<section class="cu-tl-day${locked ? ' locked' : ''}${L.day === d ? ' sel' : ''}" style="--i:${Math.min(k, 14)}">
        <div class="cu-tl-node"><b>${d.slice(8)}</b><small>${MON[+d.slice(5, 7) - 1]}</small></div>
        <div class="cu-tl-card">
          <header data-cl-day="${d}"><div><h4>${WDL[dow(d)]}${d === TODAY ? ' <span class="badge lime">Today</span>' : ''}</h4><small>${g.length} ${g.length === 1 ? 'entry' : 'entries'} · day closing ${money(balEnd(ad, d))}</small></div>
          <span class="cu-tl-sum"><span class="in">+${money(din)}</span><span class="out">−${money(dout)}</span></span>${locked ? `<span class="cu-tl-lock" data-tip="Closed by ${esc(locked.by)} at ${locked.at}"><i data-lucide="lock"></i></span>` : `<span class="cu-tl-open" data-tip="Day still open"><i data-lucide="lock-open"></i></span>`}</header>
          <ul>${g.map((e) => { const c = CATS[e.cat]; return `<li data-id="${e.id}" tabindex="0"><time>${t12(e.time)}</time><span class="cu-ic" style="--cc:${c.color}"><i data-lucide="${c.icon}"></i></span><div><b>${esc(e.part)}</b><small><span class="al-type ${e.type.toLowerCase()}">${e.type}</span>${e.ref} · ${e.dir === 'in' ? 'To' : 'By'} ${esc(e.contra.name)}</small></div><strong class="${e.dir}">${e.dir === 'in' ? '+' : '−'}${money(e.amt)}</strong></li>`; }).join('')}</ul>
        </div></section>`;
    }).join('') + `</div>`;
  }

  function heatHtml(ad, rows) {
    const per = {};
    rows.forEach((e) => { const p = (per[e.date] = per[e.date] || { i: 0, o: 0, n: 0 }); p[e.dir === 'in' ? 'i' : 'o'] += e.amt; p.n++; });
    const vals = Object.values(per).map((p) => Math.abs(p.i - p.o));
    const mx = Math.max(1, ...vals);
    let s = L.from; while (dow(s) !== 1) s = addD(s, -1);
    let e = L.to; while (dow(e) !== 0) e = addD(e, 1);
    const cells = [];
    for (let d = s, k = 0; d <= e; d = addD(d, 1), k++) {
      const inP = d >= L.from && d <= L.to, p = per[d], lk = ad.locks[d];
      if (!inP) { cells.push(`<div class="cu-hm-c out" style="--i:${k}"><span>${+d.slice(8)}${d.slice(8) === '01' ? ' ' + MON[+d.slice(5, 7) - 1] : ''}</span></div>`); continue; }
      if (!p) { cells.push(`<div class="cu-hm-c none${L.day === d ? ' sel' : ''}" style="--i:${k}" data-cl-day="${d}" data-tip="${WDS[dow(d)]} ${dMon(d)} · no entries"><span>${+d.slice(8)}${d.slice(8) === '01' ? ' ' + MON[+d.slice(5, 7) - 1] : ''}</span><em>—</em></div>`); continue; }
      const net = p.i - p.o, pct = Math.round(14 + (Math.abs(net) / mx) * 70);
      const tip = `${WDS[dow(d)]} ${dMon(d)} · In ${rs(p.i, 0)} · Out ${rs(p.o, 0)} · Net ${net >= 0 ? '+' : '−'}${rs(Math.abs(net), 0)} · ${p.n} txns`;
      cells.push(`<div class="cu-hm-c ${net >= 0 ? 'pos' : 'neg'}${pct > 55 ? ' hot' : ''}${L.day === d ? ' sel' : ''}" style="--hp:${pct}%;--i:${k}" data-cl-day="${d}" data-tip="${tip}" tabindex="0"><span>${+d.slice(8)}${d.slice(8) === '01' ? ' ' + MON[+d.slice(5, 7) - 1] : ''}${lk ? '<i data-lucide="lock"></i>' : ''}</span><em>${compact(net)}</em><small><i style="--w:${Math.round((p.i / (p.i + p.o || 1)) * 100)}%"></i></small></div>`);
    }
    const days = Object.keys(per).sort((a, b) => (per[b].i - per[b].o) - (per[a].i - per[a].o));
    const best = days[0], worst = days[days.length - 1];
    const avg = days.length ? days.reduce((a, d) => a + per[d].i - per[d].o, 0) / days.length : 0;
    return `<div class="cu-hm">
      <div class="cu-hm-head">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((w) => `<span>${w}</span>`).join('')}</div>
      <div class="cu-hm-grid">${cells.join('')}</div>
      <div class="cu-hm-foot">
        <div class="cu-hm-legend"><span>More out</span><i class="neg"></i><i class="neg2"></i><i class="mid"></i><i class="pos2"></i><i class="pos"></i><span>More in</span></div>
        <div class="cu-hm-stats">${best ? `<span><small>Best day</small><b class="up">${dMon(best)} · ${compact(per[best].i - per[best].o)}</b></span><span><small>Heaviest outflow</small><b class="down">${dMon(worst)} · ${compact(per[worst].i - per[worst].o)}</b></span><span><small>Avg daily net</small><b>${compact(avg)}</b></span>` : '<span><small>No entries in range</small></span>'}</div>
      </div></div>`;
  }

  /* ---------------------------------------------------------------- rail: day close */
  function countsFor(ad, d) {
    if (!ad.counts[d]) {
      const book = balEnd(ad, d), lk = ad.locks[d];
      const preset = lk ? lk.v : d === TODAY ? -150 : 0;
      ad.counts[d] = greedy(book + preset);
    }
    return ad.counts[d];
  }
  const countedOf = (c) => NOTES.reduce((a, n) => a + n * (c[n] || 0), 0) + (+c.coins || 0);

  function renderDayClose() {
    const ad = AD(), d = L.day, box = $('[data-cl-dc]', L.sec), lk = ad.locks[d];
    const c = countsFor(ad, d), book = balEnd(ad, d);
    const opts = DAYS.slice().reverse().map((x) => `<option value="${x}" ${x === d ? 'selected' : ''}>${WDS[dow(x)]} ${dMon(x)}${ad.locks[x] ? ' · closed' : ' · open'}</option>`).join('');
    box.classList.toggle('locked', !!lk);
    box.innerHTML = `
      <div class="cu-dc-head"><span class="cu-dc-ic"><i data-lucide="calculator"></i></span><div><h3>Day Close</h3><p>${lk ? `Closed by ${esc(lk.by)} at ${lk.at}` : 'Count the drawer, then lock the day'}</p></div>
        <label class="cu-dc-day"><select data-cl-dcday aria-label="Day to close">${opts}</select><i data-lucide="chevron-down"></i></label></div>
      <div class="cu-dens">
        ${NOTES.map((n) => `<div class="cu-den" data-den="${n}"><span class="cu-note ${NOTE_TONE[n]}">${fmt(n)}</span><span class="cu-x">×</span><div class="cu-step"><button data-st="-1" ${lk ? 'disabled' : ''} aria-label="Fewer ${n} notes"><i data-lucide="minus"></i></button><input type="number" min="0" value="${c[n]}" data-den-in="${n}" ${lk ? 'disabled' : ''} aria-label="${n} notes"><button data-st="1" ${lk ? 'disabled' : ''} aria-label="More ${n} notes"><i data-lucide="plus"></i></button></div><b data-den-amt>${money(n * c[n], { dec: 0 })}</b></div>`).join('')}
        <div class="cu-den coins" data-den="coins"><span class="cu-note coin"><i data-lucide="coins"></i>Coins</span><span class="cu-x"></span><div class="cu-step"><button data-st="-1" ${lk ? 'disabled' : ''} aria-label="Less coins"><i data-lucide="minus"></i></button><input type="number" min="0" value="${c.coins}" data-den-in="coins" ${lk ? 'disabled' : ''} aria-label="Coins amount"><button data-st="1" ${lk ? 'disabled' : ''} aria-label="More coins"><i data-lucide="plus"></i></button></div><b data-den-amt>${money(+c.coins, { dec: 0 })}</b></div>
      </div>
      <div class="cu-dc-sum">
        <div><small>Counted</small><b data-dc-counted></b></div>
        <div><small>Book balance</small><b data-dc-book></b></div>
        <div class="cu-dc-var" data-dc-varbox><small data-dc-varlbl>Over / short</small><b data-dc-var></b></div>
      </div>
      <div class="cu-vbar" data-dc-bar><i class="mid"></i><i class="fill"></i></div>
      <div class="cu-vbar-lbl"><span>Short</span><span>±Rs 1,000 tolerance</span><span>Over</span></div>
      <button class="btn ${lk ? 'secondary' : 'primary'} block cu-lockbtn${lk ? ' is-locked' : ''}" data-cl-lock ${lk ? 'disabled' : ''}>
        <svg class="cu-lock-svg" viewBox="0 0 24 24" aria-hidden="true"><path class="sh" d="M7.5 11V8a4.5 4.5 0 0 1 9 0v3"/><rect x="5" y="11" width="14" height="10" rx="2.5"/><circle cx="12" cy="16" r="1.3"/></svg>
        <span>${lk ? `${dMon(d)} is locked` : `Lock ${dMon(d)}`}</span></button>`;
    icons(box);
    const bk = $('[data-dc-book]', box); bk.dataset.v = book; bk.innerHTML = rs(book);
    updateDc(true);
  }

  function updateDc(instant) {
    const ad = AD(), box = $('[data-cl-dc]', L.sec), c = countsFor(ad, L.day), book = balEnd(ad, L.day);
    const counted = countedOf(c), v = r2(counted - book);
    const ce = $('[data-dc-counted]', box), ve = $('[data-dc-var]', box);
    if (instant) { ce.dataset.v = counted; ve.dataset.v = v; }
    tick(ce, counted); tick(ve, v, { fmt: (x) => (Math.abs(x) < 0.5 ? 'Rs 0' : (x > 0 ? '+' : '−') + 'Rs ' + fmt(Math.abs(Math.round(x)))) });
    const vb = $('[data-dc-varbox]', box);
    vb.className = 'cu-dc-var ' + (v === 0 ? 'ok' : v < 0 ? 'short' : 'over');
    $('[data-dc-varlbl]', box).textContent = v === 0 ? 'Balanced' : v < 0 ? 'Short' : 'Over';
    const bar = $('[data-dc-bar]', box), w = Math.min(1, Math.abs(v) / 1000) * 50;
    bar.className = 'cu-vbar ' + (v === 0 ? 'ok' : v < 0 ? 'short' : 'over');
    bar.style.setProperty('--w', (v === 0 ? 0 : Math.max(w, 2)) + '%');
  }

  async function lockDay(btn) {
    const ad = AD(), d = L.day;
    if (ad.locks[d]) return;
    const c = countsFor(ad, d), v = r2(countedOf(c) - balEnd(ad, d));
    if (v !== 0) {
      const ok = await confirmBox({ title: `Lock ${dMon(d)} with ${v < 0 ? 'a short' : 'an over'} of Rs ${fmt(Math.abs(v))}?`, text: `A variance JV for Rs ${fmt(Math.abs(v))} will be posted to <b>6990 · Cash over / short</b> and the day becomes read-only.`, okLabel: 'Lock day', icon: 'lock-keyhole' });
      if (!ok) return;
    }
    const box = $('[data-cl-dc]', L.sec);
    btn.disabled = true;
    btn.classList.add('cu-locking');
    $('span', btn).textContent = 'Locking…';
    await sleep(RM() ? 50 : 950);
    ad.locks[d] = { v, by: 'Sana Javed', at: '14:' + String(30 + Math.floor(Math.random() * 20)) };
    btn.classList.add('is-locked');
    box.classList.add('locked', 'cu-justlocked');
    $('span', btn).textContent = `${dMon(d)} is locked`;
    celebrate(btn);
    toast(`${WDL[dow(d)]} ${dMon(d)} locked · closing ${rs(balEnd(ad, d))}${v ? ` · ${v < 0 ? 'short' : 'over'} Rs ${fmt(Math.abs(v))} posted` : ' · balanced'}`, { tone: 'good' });
    await sleep(RM() ? 0 : 650);
    renderView(false);
    $$(`[data-cl-view] tr.cu-row`, L.sec).forEach((tr) => { const e = ad.entries.find((x) => x.id === tr.dataset.id); if (e && e.date === d) tr.classList.add('cu-lk-new'); });
    renderDayClose();
    renderVariance(d);
  }

  function renderVariance(flashDay) {
    const ad = AD(), box = $('[data-cl-var]', L.sec), last = DAYS.slice(-14);
    const vals = last.map((d) => (ad.locks[d] ? ad.locks[d].v : null));
    const mx = Math.max(300, ...vals.filter((v) => v != null).map(Math.abs));
    const closed = vals.filter((v) => v != null), net = closed.reduce((a, v) => a + v, 0), exact = closed.filter((v) => v === 0).length;
    box.innerHTML = `<div class="panel-head"><div><h3>Variance trend</h3><p>Over / short at close · last 14 days</p></div><span class="badge ${net < 0 ? 'danger' : net > 0 ? 'warn' : 'good'}">${net === 0 ? 'Net Rs 0' : (net > 0 ? '+' : '−') + 'Rs ' + fmt(Math.abs(net))}</span></div>
      <div class="cu-vt">${last.map((d, i) => {
        const v = vals[i], cls = v == null ? 'open' : v === 0 ? 'zero' : v < 0 ? 'short' : 'over';
        const h = v == null || v === 0 ? 0 : Math.max(8, (Math.abs(v) / mx) * 100);
        const tip = v == null ? `${dMon(d)} · not closed yet` : `${dMon(d)} · ${v === 0 ? 'balanced' : (v < 0 ? 'short Rs ' : 'over Rs ') + fmt(Math.abs(v))}`;
        return `<div class="cu-vt-col ${cls}${flashDay === d ? ' flash' : ''}" data-tip="${tip}" style="--h:${h}%;--i:${i}"><i></i><small>${+d.slice(8)}</small></div>`;
      }).join('')}</div>
      <div class="cu-vt-foot"><span><i class="k short"></i>Short</span><span><i class="k over"></i>Over</span><span><i class="k zero"></i>Exact</span><span class="spacer"></span><b>${exact}/${closed.length}</b>&nbsp;closed exact</div>`;
  }

  function renderDonut() {
    const ad = AD(), box = $('[data-cl-donut]', L.sec), rows = shown(ad).filter((e) => e.dir === L.donut);
    const by = {};
    rows.forEach((e) => { by[e.cat] = (by[e.cat] || 0) + e.amt; });
    const list = Object.entries(by).sort((a, b) => b[1] - a[1]);
    const tot = list.reduce((a, x) => a + x[1], 0);
    const C = 2 * Math.PI * 42;
    let off = 0;
    const segs = list.map(([k, v], i) => { const len = tot ? (v / tot) * C : 0; const s = `<circle class="cu-dn-seg" r="42" cx="60" cy="60" stroke="${CATS[k].color}" style="--len:${Math.max(0, len - 1.5).toFixed(2)};--off:${(-off).toFixed(2)};--i:${i}" data-tip="${CATS[k].label} · ${rs(v, 0)} · ${tot ? Math.round((v / tot) * 100) : 0}%"/>`; off += len; return s; }).join('');
    box.innerHTML = `<div class="panel-head"><div><h3>Top categories</h3><p>${L.donut === 'out' ? 'Where the cash went' : 'Where the cash came from'}</p></div><div class="seg cu-mini-seg" data-cl-dd><button data-dd="out" class="${L.donut === 'out' ? 'active' : ''}">Out</button><button data-dd="in" class="${L.donut === 'in' ? 'active' : ''}">In</button></div></div>
      <div class="cu-dn-wrap"><svg class="cu-dn-svg" viewBox="0 0 120 120" aria-hidden="true"><circle class="cu-dn-track" r="42" cx="60" cy="60"/>${segs}</svg><div class="cu-dn-c"><b data-dn-tot></b><small>${rows.length} entries</small></div></div>
      <ul class="cu-dn-list">${list.slice(0, 5).map(([k, v], i) => `<li style="--cc:${CATS[k].color};--i:${i}"><i></i><span>${CATS[k].label}</span><b>${rs(v, 0)}</b><em>${tot ? Math.round((v / tot) * 100) : 0}%</em></li>`).join('') || '<li class="none">No entries in range</li>'}</ul>`;
    const t = $('[data-dn-tot]', box); t.dataset.v = 0;
    tween(t, tot, { fmt: (v) => compact(v).replace('+', 'Rs ') });
    requestAnimationFrame(() => requestAnimationFrame(() => box.classList.add('drawn')));
    box.classList.remove('drawn');
  }

  /* ---------------------------------------------------------------- voucher drawer */
  function openVoucher(id) {
    const ad = AD(), e = ad.entries.find((x) => x.id === id);
    if (!e) return;
    const c = CATS[e.cat], lk = ad.locks[e.date];
    const cash = { code: ad.acct.code, name: ad.acct.name };
    let lines;
    if (e.cat === 'sales') { const net = r2(e.amt / 1.18), tax = r2(e.amt - net); lines = [[cash, e.amt, 0, 'Cash received at counter'], [{ code: '4110', name: 'Sales — Counter' }, 0, net, 'Net sale value'], [{ code: '2310', name: 'Output sales tax @18%' }, 0, tax, 'GST collected']]; }
    else if (e.dir === 'in') lines = [[cash, e.amt, 0, 'Cash received'], [e.contra, 0, e.amt, e.party || 'Contra']];
    else lines = [[e.contra, e.amt, 0, e.party || 'Expense / contra'], [cash, 0, e.amt, 'Cash paid out']];
    const dr = lines.reduce((a, l) => a + l[1], 0), cr = lines.reduce((a, l) => a + l[2], 0);
    const files = Array.from({ length: e.att }, (_, i) => i === 0 ? { n: `${e.type === 'JV' ? 'bank-slip' : 'receipt'}-${e.ref.toLowerCase()}.jpg`, s: `${180 + (hash(e.id) % 300)} KB`, ic: 'image' } : { n: `${e.doc ? e.doc.toLowerCase().replace(/[^a-z0-9]+/g, '-') : 'supporting-doc'}.pdf`, s: `${60 + (hash(e.ref) % 140)} KB`, ic: 'file-text' });
    const audit = [
      ['circle-plus', 'Created', `${e.by} · ${dMon(e.date)} ${t12(e.time)}`],
      ['badge-check', 'Approved', `${e.appr} · ${dMon(e.date)} ${t12(e.time.replace(/:(\d)\d$/, ':5$1'))}`],
      ['book-check', 'Posted to ledger', `System · balance ${rs(e.bal)}`],
    ];
    if (lk) audit.push(['lock', 'Day locked', `${lk.by} · ${dMon(e.date)} ${lk.at}`]);
    const html = `
      <div class="cu-vd-hero ${e.dir}">
        <div class="cu-vd-top"><span class="al-type ${e.type.toLowerCase()}">${e.type} · ${TYPE_LONG[e.type]}</span>${lk ? '<span class="badge neutral"><i data-lucide="lock"></i>Day locked</span>' : '<span class="badge good dot">Posted</span>'}</div>
        <div class="cu-vd-amt">${e.dir === 'in' ? '+' : '−'}${money(e.amt)}</div>
        <p>${esc(e.part)}</p>
        <div class="cu-vd-meta"><span><i data-lucide="calendar"></i>${dLong(e.date)} · ${t12(e.time)}</span><span><i data-lucide="wallet"></i>${esc(ad.acct.short)}</span><span style="--cc:${c.color}"><i data-lucide="${c.icon}"></i>${c.label}</span></div>
      </div>
      <h4 class="cu-h4"><i data-lucide="scale"></i>Journal lines</h4>
      <div class="cu-vd-lines"><table class="tbl compact" data-plain><thead><tr><th>Account</th><th class="num">Debit</th><th class="num">Credit</th></tr></thead><tbody>
        ${lines.map((l) => `<tr><td><b>${l[0].code} · ${esc(l[0].name)}</b><small>${esc(l[3])}</small></td><td class="num ${l[1] ? 'dr' : 'zero'}">${l[1] ? money(l[1]) : '—'}</td><td class="num ${l[2] ? 'cr' : 'zero'}">${l[2] ? money(l[2]) : '—'}</td></tr>`).join('')}
      </tbody><tfoot><tr><td>Total <span class="badge good"><i data-lucide="check"></i>Balanced</span></td><td class="num">${money(dr)}</td><td class="num">${money(cr)}</td></tr></tfoot></table></div>
      <div class="dl cu-vd-dl">
        <div><span>Party</span><b>${esc(e.party || '—')}</b></div>
        <div><span>Source document</span><b>${esc(e.doc || '—')}</b></div>
        <div><span>Prepared by</span><b>${esc(e.by)}</b></div>
        <div><span>Approved by</span><b>${esc(e.appr)}</b></div>
        <div><span>Running balance</span><b>${money(e.bal)} Dr</b></div>
        <div><span>Narration</span><b>Being ${e.dir === 'in' ? 'cash received' : 'cash paid'} — ${esc(e.part.toLowerCase())}</b></div>
      </div>
      <h4 class="cu-h4"><i data-lucide="paperclip"></i>Attachments <em>${files.length}</em></h4>
      <div class="cu-att">${files.map((f) => `<button class="cu-file" data-vd="file"><span class="icon-well sm"><i data-lucide="${f.ic}"></i></span><span><b>${f.n}</b><small>${f.s}</small></span><i data-lucide="download"></i></button>`).join('')}<button class="cu-file add" data-vd="attach" ${lk ? 'disabled' : ''}><i data-lucide="upload"></i><span><b>Attach file</b><small>${lk ? 'Day is locked' : 'PDF, JPG up to 10 MB'}</small></span></button></div>
      <h4 class="cu-h4"><i data-lucide="history"></i>Audit trail</h4>
      <ol class="cu-audit">${audit.map((a, i) => `<li style="--i:${i}"><span><i data-lucide="${a[0]}"></i></span><div><b>${a[1]}</b><small>${esc(a[2])}</small></div></li>`).join('')}</ol>`;
    const dr2 = FS.drawer({ title: e.ref, subtitle: `${esc(ad.acct.name)} · ${dMon(e.date)} ${e.date.slice(0, 4)}`, html, wide: true, foot: `<button class="btn ghost" data-close>Close</button><span class="spacer"></span><button class="btn secondary" data-vd="print"><i data-lucide="printer"></i>Print</button><button class="btn danger" data-vd="reverse" ${lk ? 'disabled title="Day is locked"' : ''}><i data-lucide="undo-2"></i>Reverse</button>` });
    dr2.classList.add('cu-vd');
    dr2.addEventListener('click', async (ev) => {
      const b = ev.target.closest('[data-vd]'); if (!b) return;
      const a = b.dataset.vd;
      if (a === 'print') { await busy(b, 'Preparing…', 700); toast(`${e.ref} sent to printer`, { tone: 'info' }); }
      if (a === 'file') toast('Download started', { tone: 'info' });
      if (a === 'attach') toast('Choose a file to attach (demo)', { tone: 'info' });
      if (a === 'reverse') {
        const ok = await confirmBox({ title: `Reverse ${e.ref}?`, text: `A reversing ${e.type} for ${rs(e.amt)} will be drafted for approval. The original stays in the ledger.`, okLabel: 'Draft reversal', danger: true });
        if (ok) toast(`Reversal of ${e.ref} drafted · awaiting approval`, { tone: 'warn', action: { label: 'Approvals', fn: () => FS.go('app/approvals') } });
      }
    });
  }

  function rowMenu(btn, id) {
    const ad = AD(), e = ad.entries.find((x) => x.id === id); if (!e) return;
    FS.menu(btn, [
      { label: 'View voucher', icon: 'eye', onClick: () => openVoucher(id) },
      { label: 'Print voucher', icon: 'printer', onClick: () => toast(`${e.ref} sent to printer`, { tone: 'info' }) },
      { label: 'Copy reference', icon: 'copy', onClick: () => { try { navigator.clipboard.writeText(e.ref); } catch (x) { /* file:// */ } toast(`${e.ref} copied`); } },
      { label: 'Select this day for close', icon: 'calculator', onClick: () => selectDay(e.date, true) },
      { sep: true },
      { label: ad.locks[e.date] ? 'Reverse (day locked)' : 'Reverse entry', icon: 'undo-2', danger: true, onClick: () => ad.locks[e.date] ? toast('This day is locked. Unlock it from Period Close to reverse.', { tone: 'warn' }) : openVoucher(id) },
    ]);
  }

  function selectDay(d, scroll) {
    L.day = d;
    $$('[data-cl-day]', L.sec).forEach((x) => x.classList.toggle('sel', x.dataset.clDay === d));
    $$('.cu-tl-day', L.sec).forEach((x) => x.classList.toggle('sel', !!x.querySelector(`[data-cl-day="${d}"]`)));
    renderDayClose();
    const box = $('[data-cl-dc]', L.sec);
    replay(box, 'cu-pulse');
    if (scroll) box.scrollIntoView({ behavior: RM() ? 'auto' : 'smooth', block: 'center' });
  }

  function exportCsv() {
    const ad = AD(), rows = shown(ad);
    const lines = [['Date', 'Time', 'Voucher', 'Type', 'Particulars', 'Contra', 'Category', 'Receipt', 'Payment', 'Balance']].concat(rows.map((e) => [e.date, e.time, e.ref, e.type, e.part, `${e.contra.code} ${e.contra.name}`, CATS[e.cat].label, e.dir === 'in' ? e.amt : '', e.dir === 'out' ? e.amt : '', e.bal]));
    const csv = lines.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n');
    try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      a.download = `cash-ledger-${ad.acct.key.toLowerCase()}-${L.from}-to-${L.to}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
    } catch (x) { /* ignore */ }
    toast(`${rows.length} entries exported to CSV`);
  }

  /* ---------------------------------------------------------------- events */
  function setPreset(p) {
    L.preset = p;
    if (p === 'today') { L.from = TODAY; L.to = TODAY; }
    if (p === 'week') { let s = TODAY; while (dow(s) !== 1) s = addD(s, -1); L.from = s; L.to = TODAY; }
    if (p === 'month') { L.from = TODAY.slice(0, 8) + '01'; L.to = TODAY; }
    if (p === 'custom') { L.from = START; L.to = TODAY; }
    $$('[data-cl-presets] button', L.sec).forEach((b) => b.classList.toggle('active', b.dataset.p === p));
    $('[data-cl-from]', L.sec).value = L.from; $('[data-cl-to]', L.sec).value = L.to;
    if (L.day < L.from || L.day > L.to) L.day = L.to;
    L.page = 1; renderCats(); refresh({ anim: true });
  }

  function bindLedger(sec) {
    let qT;
    sec.addEventListener('click', (ev) => {
      const t = ev.target;
      let b;
      if ((b = t.closest('[data-cl-acct]'))) {
        const i = +b.dataset.clAcct; if (i === L.acct) return;
        L.acct = i; L.page = 1;
        $$('[data-cl-acct]', sec).forEach((x) => { const on = +x.dataset.clAcct === i; x.classList.toggle('active', on); x.setAttribute('aria-selected', on); });
        renderCats(); refresh({ anim: true });
        replay($('[data-cl-kpis]', sec), 'cu-swap');
        return;
      }
      if ((b = t.closest('[data-cl-presets] [data-p]'))) return setPreset(b.dataset.p);
      if ((b = t.closest('[data-cl-views] [data-v]'))) {
        L.view = b.dataset.v;
        $$('[data-cl-views] button', sec).forEach((x) => x.classList.toggle('active', x === b));
        renderView(true); return;
      }
      if ((b = t.closest('[data-cl-dirs] [data-dir]'))) {
        L.dir = b.dataset.dir; L.page = 1;
        $$('[data-cl-dirs] button', sec).forEach((x) => x.classList.toggle('active', x === b));
        refresh({ anim: true }); return;
      }
      if ((b = t.closest('[data-cat]'))) {
        const k = b.dataset.cat; L.cats.has(k) ? L.cats.delete(k) : L.cats.add(k);
        b.classList.toggle('on', L.cats.has(k)); b.setAttribute('aria-pressed', L.cats.has(k)); replay(b, 'pop');
        L.page = 1; refresh({ anim: true }); return;
      }
      if (t.closest('[data-cl-clear], [data-cl-clear2]')) {
        L.q = ''; L.dir = 'all'; L.cats.clear(); L.vt = 'all'; L.min = ''; L.max = ''; L.page = 1;
        $('[data-cl-q]', sec).value = ''; $('[data-cl-vt]', sec).value = 'all'; $('[data-cl-min]', sec).value = ''; $('[data-cl-max]', sec).value = '';
        $$('[data-cl-dirs] button', sec).forEach((x) => x.classList.toggle('active', x.dataset.dir === 'all'));
        renderCats(); refresh({ anim: true }); toast('Filters cleared', { tone: 'info', ms: 1800 }); return;
      }
      if ((b = t.closest('[data-pg]'))) {
        const p = b.dataset.pg; L.page = p === 'prev' ? L.page - 1 : p === 'next' ? L.page + 1 : +p;
        renderView(true); $('[data-cl-view]', sec).scrollIntoView({ behavior: RM() ? 'auto' : 'smooth', block: 'nearest' }); return;
      }
      if ((b = t.closest('[data-cl-dots]'))) { ev.stopPropagation(); rowMenu(b, b.closest('[data-id]').dataset.id); return; }
      if ((b = t.closest('[data-cl-view] [data-id]'))) return openVoucher(b.dataset.id);
      if ((b = t.closest('[data-cl-day]'))) return selectDay(b.dataset.clDay, true);
      if ((b = t.closest('[data-st]'))) {
        const row = b.closest('[data-den]'), key = row.dataset.den, ad = AD(), c = countsFor(ad, L.day);
        const step = key === 'coins' ? 10 : 1;
        c[key] = Math.max(0, (+c[key] || 0) + +b.dataset.st * step);
        $('input', row).value = c[key];
        $('[data-den-amt]', row).innerHTML = money(key === 'coins' ? c[key] : c[key] * +key, { dec: 0 });
        replay(row, 'bump'); updateDc(); return;
      }
      if ((b = t.closest('[data-cl-lock]'))) return lockDay(b);
      if ((b = t.closest('[data-dd]'))) { L.donut = b.dataset.dd; renderDonut(); return; }
      if ((b = t.closest('[data-cl]'))) {
        const a = b.dataset.cl;
        if (a === 'export') FS.menu(b, [
          { label: 'CSV (current view)', icon: 'file-spreadsheet', onClick: exportCsv },
          { label: 'Excel workbook', icon: 'sheet', onClick: () => busy(b, 'Exporting…', 900).then(() => toast(`Cash-Ledger-${AD().acct.key}.xlsx ready`, { action: { label: 'Open', fn: () => {} } })) },
          { label: 'PDF statement', icon: 'file-text', onClick: () => busy(b, 'Rendering…', 1000).then(() => toast('PDF statement generated')) },
          { sep: true },
          { label: 'Email to auditor', icon: 'mail', onClick: () => toast('Statement emailed to k.akhtar@auditpartners.pk') },
        ]);
        if (a === 'print') { toast('Preparing print layout…', { tone: 'info', ms: 1600 }); setTimeout(() => { try { window.print(); } catch (x) { /* ignore */ } }, 500); }
        if (a === 'close') {
          const ad = AD(); let d = TODAY;
          if (ad.locks[d]) d = DAYS.slice().reverse().find((x) => !ad.locks[x]) || TODAY;
          if (d < L.from || d > L.to) setPreset('custom');
          selectDay(d, true);
        }
      }
    });
    sec.addEventListener('keydown', (ev) => {
      const r = ev.target.closest && ev.target.closest('[data-cl-view] [data-id], [data-cl-day][tabindex]');
      if (r && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); r.click(); }
    });
    document.addEventListener('keydown', (ev) => {
      if (ev.key === '/' && sec.classList.contains('active') && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '') && !document.querySelector('.overlay.open')) { ev.preventDefault(); $('[data-cl-q]', sec).focus(); }
    });
    sec.addEventListener('input', (ev) => {
      const t = ev.target;
      if (t.matches('[data-cl-q]')) { clearTimeout(qT); qT = setTimeout(() => { L.q = t.value.trim(); L.page = 1; refresh({ anim: true }); }, 160); }
      if (t.matches('[data-cl-min]')) { L.min = t.value; L.page = 1; clearTimeout(qT); qT = setTimeout(() => refresh({}), 200); }
      if (t.matches('[data-cl-max]')) { L.max = t.value; L.page = 1; clearTimeout(qT); qT = setTimeout(() => refresh({}), 200); }
      if (t.matches('[data-den-in]')) {
        const key = t.dataset.denIn, c = countsFor(AD(), L.day);
        c[key] = Math.max(0, Math.floor(+t.value || 0));
        $('[data-den-amt]', t.closest('[data-den]')).innerHTML = money(key === 'coins' ? c[key] : c[key] * +key, { dec: 0 });
        updateDc();
      }
    });
    sec.addEventListener('change', (ev) => {
      const t = ev.target;
      if (t.matches('[data-cl-vt]')) { L.vt = t.value; L.page = 1; refresh({ anim: true }); }
      if (t.matches('[data-cl-from], [data-cl-to]')) {
        let f = $('[data-cl-from]', sec).value || START, to = $('[data-cl-to]', sec).value || TODAY;
        if (f > to) [f, to] = [to, f];
        L.from = f < START ? START : f; L.to = to > TODAY ? TODAY : to; L.preset = 'custom';
        $$('[data-cl-presets] button', sec).forEach((b) => b.classList.toggle('active', b.dataset.p === 'custom'));
        if (L.day < L.from || L.day > L.to) L.day = L.to;
        L.page = 1; renderCats(); refresh({ anim: true });
      }
      if (t.matches('[data-cl-dcday]')) selectDay(t.value, false);
    });
  }

  onRoute('app/cash/ledger', ledgerMount, ledgerEnter);

  /* =====================================================================
     2) USERS + 3) ROLES : shared model
     ===================================================================== */
  const ALLB = (DATA.branches || ['Lahore HQ', 'Karachi', 'Islamabad', 'Faisalabad']).slice();
  const WHS = (DATA.warehouses || []).slice();
  const ROLES = [
    { id: 'owner', name: 'Owner', icon: 'crown', tone: 'violet', desc: 'Full access to every module, billing and company ownership.', system: true },
    { id: 'fm', name: 'Finance Manager', icon: 'landmark', tone: 'green', desc: 'Approves and posts finance, closes days and periods.' },
    { id: 'acc', name: 'Accountant', icon: 'calculator', tone: 'blue', desc: 'Creates vouchers, bills, receipts and reconciliations.' },
    { id: 'hr', name: 'HR Manager', icon: 'users', tone: 'orange', desc: 'People, attendance, leave and payroll approval.' },
    { id: 'pay', name: 'Payroll Officer', icon: 'wallet-cards', tone: 'teal', desc: 'Prepares payroll runs, loans and final settlements.' },
    { id: 'sales', name: 'Sales Executive', icon: 'shopping-cart', tone: 'yellow', desc: 'Quotations, orders, invoices and own customers.' },
    { id: 'store', name: 'Storekeeper', icon: 'warehouse', tone: 'brown', desc: 'Receives goods, adjusts and transfers stock.' },
    { id: 'aud', name: 'Auditor (read-only)', icon: 'eye', tone: 'neutral', desc: 'Views and exports everything, changes nothing.' },
  ];
  const roleById = (id) => ROLES.find((r) => r.id === id) || ROLES[2];
  const ROLE_CAN = {
    owner: [['Everything in every module', 'Manage billing, plan and seats', 'Transfer company ownership', 'Unlock closed days and periods'], []],
    fm: [['Approve and post vouchers', 'Close days, months and fiscal periods', 'Approve payroll runs and loans', 'Create and approve vendor payments', 'Export all financial reports'], ['Delete posted entries', 'Change billing or ownership']],
    acc: [['Create and edit vouchers, bills and receipts', 'Record cash and bank entries', 'Prepare bank reconciliations', 'Export ledgers and reports'], ['Approve or post vouchers', 'Open payroll or HR records']],
    hr: [['Manage employees and the org chart', 'Approve leave and attendance', 'Approve payroll runs', 'Run hiring and onboarding'], ['See finance ledgers', 'Post payroll journals']],
    pay: [['Prepare and post payroll runs', 'Manage loans and advances', 'Process final settlements', 'Export statutory reports'], ['Approve their own payroll', 'Edit employee master data']],
    sales: [['Create quotations, orders and invoices', 'Manage their own customers', 'Record customer receipts', 'See item prices and stock'], ['Approve discounts above limit', 'See cost prices and margins']],
    store: [['Receive goods (GRN) and post stock', 'Create adjustments and transfers', 'Manage items and warehouses', 'Export stock reports'], ['See purchase prices', 'Approve stock write-offs']],
    aud: [['View every module and document', 'Export ledgers and reports', 'Read the full audit trail'], ['Create, edit or delete anything', 'Approve or post']],
  };
  const MODW = ['Finance', 'Sales', 'Purchases', 'Inventory', 'HR', 'Payroll', 'Reports', 'Settings'];
  const MODW_DEF = { owner: MODW, fm: ['Finance', 'Sales', 'Purchases', 'Inventory', 'Payroll', 'Reports'], acc: ['Finance', 'Sales', 'Purchases', 'Reports'], hr: ['HR', 'Payroll', 'Reports'], pay: ['Payroll', 'HR', 'Reports'], sales: ['Sales', 'Inventory'], store: ['Inventory', 'Purchases'], aud: ['Finance', 'Sales', 'Purchases', 'Inventory', 'HR', 'Payroll', 'Reports'] };
  const LIMIT_DEF = { owner: 5000000, fm: 5000000, acc: 0, hr: 500000, pay: 0, sales: 50000, store: 0, aud: 0 };

  const ACT = [['V', 'View', 'eye'], ['C', 'Create', 'plus'], ['E', 'Edit', 'pencil'], ['A', 'Approve', 'badge-check'], ['P', 'Post', 'book-check'], ['D', 'Delete', 'trash-2'], ['X', 'Export', 'download']];
  const GROUPS = [
    { id: 'fin', name: 'Finance', icon: 'landmark', mods: [['coa', 'Chart of accounts', 'VCEDX'], ['vch', 'Journal vouchers', 'VCEAPDX'], ['cash', 'Cash book & petty cash', 'VCEAPDX'], ['bank', 'Bank & cheques', 'VCEAPDX'], ['recon', 'Bank reconciliation', 'VCEAPX'], ['fa', 'Fixed assets', 'VCEAPDX'], ['bud', 'Budgets', 'VCEADX'], ['tax', 'Tax & compliance', 'VCEAPX'], ['close', 'Period close', 'VAPX'], ['frep', 'Financial reports', 'VX']] },
    { id: 'sp', name: 'Sales & Purchases', icon: 'shopping-cart', mods: [['quo', 'Quotations & orders', 'VCEADX'], ['sinv', 'Sales invoices', 'VCEAPDX'], ['rcpt', 'Customer receipts', 'VCEAPDX'], ['cust', 'Customers', 'VCEDX'], ['po', 'Purchase orders', 'VCEADX'], ['bill', 'Vendor bills', 'VCEAPDX'], ['vpay', 'Vendor payments', 'VCEAPDX'], ['vend', 'Vendors', 'VCEDX']] },
    { id: 'inv', name: 'Inventory', icon: 'boxes', mods: [['item', 'Items & services', 'VCEDX'], ['grn', 'Goods received (GRN)', 'VCEAPDX'], ['adj', 'Stock adjustments', 'VCEAPDX'], ['xfer', 'Stock transfers', 'VCEAPX'], ['wh', 'Warehouses', 'VCEDX'], ['irep', 'Inventory reports', 'VX']] },
    { id: 'hr', name: 'HR & Payroll', icon: 'users', mods: [['emp', 'Employees', 'VCEDX'], ['att', 'Attendance', 'VCEAX'], ['lv', 'Leave', 'VCEADX'], ['prun', 'Payroll runs', 'VCEAPX'], ['loan', 'Loans & advances', 'VCEAPDX'], ['fs', 'Final settlement', 'VCEAPX'], ['hrep', 'HR reports', 'VX']] },
    { id: 'sys', name: 'System', icon: 'settings', mods: [['comp', 'Company settings', 'VEX'], ['usr', 'Users', 'VCEDX'], ['rol', 'Roles & permissions', 'VCEDX'], ['wf', 'Approval workflows', 'VCEDX'], ['intg', 'Integrations', 'VCEDX'], ['aud', 'Audit trail', 'VX'], ['bak', 'Backup & import', 'VCX']] },
  ];
  const MODS = {}; GROUPS.forEach((g) => g.mods.forEach((m) => { MODS[m[0]] = { k: m[0], n: m[1], av: m[2], g: g.id }; }));
  const norm = (s) => ACT.map((a) => a[0]).filter((x) => s.includes(x)).join('');
  function grantDefault(rid, mk) {
    const m = MODS[mk], g = m.g;
    const T = {
      owner: () => m.av,
      fm: () => ({ fin: { coa: 'VCEX', close: 'VAPX', frep: 'VX', bud: 'VCEAX' }[mk] || 'VEAPX', sp: { vpay: 'VCEAPX', cust: 'VX', vend: 'VX' }[mk] || 'VAPX', inv: 'VX', hr: { prun: 'VAX', loan: 'VAX', hrep: 'VX' }[mk] || '', sys: { wf: 'VCE', aud: 'VX', comp: 'V', usr: 'V' }[mk] || '' }[g]),
      acc: () => ({ fin: { coa: 'VX', close: '', frep: 'VX' }[mk] ?? 'VCEX', sp: mk === 'quo' ? 'V' : 'VCEX', inv: 'VX', hr: mk === 'loan' ? 'V' : '', sys: '' }[g]),
      hr: () => ({ hr: { prun: 'VAX', loan: 'VAX', fs: 'VAX' }[mk] || 'VCEADX', sys: { usr: 'V', aud: 'V' }[mk] || '' }[g] || ''),
      pay: () => ({ hr: { prun: 'VCEPX', loan: 'VCEX', fs: 'VCEX', emp: 'V', att: 'VX', lv: 'V', hrep: 'VX' }[mk] || '', fin: mk === 'cash' ? 'V' : '' }[g] || ''),
      sales: () => ({ sp: { quo: 'VCE', sinv: 'VCE', rcpt: 'VC', cust: 'VCE' }[mk] || '', inv: { item: 'V', irep: 'V' }[mk] || '' }[g] || ''),
      store: () => ({ inv: { item: 'VCE', grn: 'VCEP', adj: 'VCE', xfer: 'VCE', wh: 'VE', irep: 'VX' }[mk] || '', sp: { po: 'V', vend: 'V' }[mk] || '' }[g] || ''),
      aud: () => 'VX',
    };
    const s = (T[rid] || (() => ''))() || '';
    return norm(s.split('').filter((x) => m.av.includes(x)).join(''));
  }
  const SAVED = {}, DRAFT = {}, META = {}, META_SAVED = {};
  function initRolePerms(r, base) {
    SAVED[r.id] = {};
    Object.keys(MODS).forEach((mk) => { SAVED[r.id][mk] = base ? SAVED[base][mk] : grantDefault(r.id, mk); });
    DRAFT[r.id] = clone(SAVED[r.id]);
    META_SAVED[r.id] = base ? clone(META_SAVED[base]) : { branch: !['owner', 'fm', 'aud'].includes(r.id), maxv: LIMIT_DEF[r.id] ?? 0, disc: { owner: 100, fm: 15, sales: 7.5 }[r.id] ?? 0, back: { owner: 365, fm: 30, acc: 7 }[r.id] ?? 0, salary: ['owner', 'hr', 'pay'].includes(r.id) ? 'full' : r.id === 'fm' ? 'masked' : 'hidden' };
    META[r.id] = clone(META_SAVED[r.id]);
  }
  ROLES.forEach((r) => initRolePerms(r));

  const EMPS = (DATA.employees || []).concat([
    { id: 'EMP-0052', name: 'Rabia Saeed', role: 'Accountant', dept: 'Finance', branch: 'Karachi', email: 'rabia.saeed@alnoor.com.pk', phone: '0321-2004455' },
    { id: 'EMP-0057', name: 'Hamza Butt', role: 'Payroll Assistant', dept: 'Human Resources', branch: 'Lahore HQ', email: 'hamza.butt@alnoor.com.pk', phone: '0300-4127788' },
    { id: 'EMP-0061', name: 'Sobia Khan', role: 'Cashier', dept: 'Finance', branch: 'Lahore HQ', email: 'sobia.khan@alnoor.com.pk', phone: '0333-4991200' },
    { id: 'EMP-0064', name: 'Tanveer Hassan', role: 'Sales Executive', dept: 'Sales', branch: 'Karachi', email: 'tanveer.h@alnoor.com.pk', phone: '0345-2210987' },
    { id: 'EMP-0070', name: 'Nadeem Akhtar', role: 'Order Booker', dept: 'Sales', branch: 'Lahore HQ', email: 'nadeem.akhtar@alnoor.com.pk', phone: '0302-4675511' },
    { id: 'EMP-0073', name: 'Mariam Iqbal', role: 'Junior Accountant', dept: 'Finance', branch: 'Islamabad', email: 'mariam.iqbal@alnoor.com.pk', phone: '0311-5098765' },
  ]);
  const suggestRole = (title) => /owner|chief|ceo/i.test(title) ? 'owner' : /finance manager/i.test(title) ? 'fm' : /payroll/i.test(title) ? 'pay' : /hr /i.test(title + ' ') ? 'hr' : /account|cashier/i.test(title) ? 'acc' : /sales|booker/i.test(title) ? 'sales' : /warehouse|store|procure/i.test(title) ? 'store' : 'acc';

  let uid = 0;
  function mkUser(empId, role, branches, mfa, last, dev, status = 'active', extra = {}) {
    const e = EMPS.find((x) => x.id === empId) || {};
    return { id: 'u' + ++uid, emp: empId, name: e.name, email: e.email, phone: e.phone, title: e.role, dept: e.dept, role, branches, mfa, last, dev, status, ext: false, ...extra };
  }
  function extUser(name, email, title, org, role, branches, mfa, last, dev, status = 'active') {
    return { id: 'u' + ++uid, emp: null, name, email, phone: '—', title, dept: org, role, branches, mfa, last, dev, status, ext: true };
  }
  const USERS = [
    mkUser('EMP-0001', 'owner', ALLB, true, 'Today 08:41', 'Chrome · Windows'),
    mkUser('EMP-0004', 'fm', ALLB, true, 'Today 09:02', 'Edge · Windows', 'active', { you: true }),
    mkUser('EMP-0011', 'acc', ['Lahore HQ', 'Faisalabad'], true, 'Today 08:55', 'Chrome · Windows'),
    mkUser('EMP-0006', 'hr', ALLB, true, '30 Sep 17:20', 'Safari · macOS'),
    mkUser('EMP-0027', 'pay', ['Lahore HQ'], true, '30 Sep 19:48', 'Chrome · Windows'),
    mkUser('EMP-0018', 'acc', ['Lahore HQ', 'Karachi'], true, '29 Sep 11:12', 'Chrome · Windows'),
    mkUser('EMP-0021', 'sales', ['Karachi'], false, 'Today 10:15', 'iOS app · iPhone 15'),
    mkUser('EMP-0042', 'sales', ['Lahore HQ'], false, 'Today 09:04', 'Android app · Pixel 7'),
    mkUser('EMP-0009', 'store', ['Lahore HQ', 'Islamabad'], true, '27 Sep 14:30', 'Chrome · Windows'),
    mkUser('EMP-0033', 'store', ['Faisalabad'], false, 'Today 07:58', 'Android app · Galaxy A54'),
    mkUser('EMP-0035', 'owner', ALLB, true, 'Today 09:20', 'Firefox · Ubuntu'),
    extUser('Kamran Akhtar', 'k.akhtar@auditpartners.pk', 'External auditor', 'Audit Partners & Co.', 'aud', ALLB, true, '15 Sep 10:05', 'Chrome · Windows'),
    extUser('Rehan Sheikh', 'rehan@taxlink.pk', 'Tax consultant', 'TaxLink Advisory', 'aud', ['Lahore HQ'], false, '22 Sep 16:40', 'Safari · iPadOS'),
    extUser('Nida Shah', 'nida.shah@alnoor.com.pk', 'Former accountant', 'Finance', 'acc', ['Islamabad'], false, '18 Jun 16:44', 'Chrome · Windows', 'suspended'),
  ];
  const INVITES = [
    { id: 'i1', email: 'rabia.saeed@alnoor.com.pk', name: 'Rabia Saeed', role: 'acc', branch: 'Karachi', by: 'Sana Javed', sent: '24 Sep', exp: 'Expires today', tone: 'danger', via: 'Email' },
    { id: 'i2', email: 'ali.haider@alnoor.com.pk', name: 'Ali Haider', role: 'sales', branch: 'Islamabad', by: 'Ahmed Raza', sent: '28 Sep', exp: 'Expires 4 Oct', tone: 'warn', via: 'WhatsApp' },
    { id: 'i3', email: 'hamza.butt@alnoor.com.pk', name: 'Hamza Butt', role: 'pay', branch: 'Lahore HQ', by: 'Ayesha Noor', sent: '30 Sep', exp: 'Expires 7 Oct', tone: 'neutral', via: 'Email' },
  ];
  const SEATS = 25;
  const roleCount = (rid) => USERS.filter((u) => u.role === rid && u.status !== 'removed').length;
  const rolePill = (rid) => { const r = roleById(rid); return `<span class="cu-role t-${r.tone}"><i data-lucide="${r.icon}"></i>${esc(r.name)}</span>`; };
  const seatsUsed = () => new Set(USERS.filter((u) => u.status !== 'removed').map((u) => u.email).concat(INVITES.map((i) => i.email))).size;

  /* ================================================================ USERS screen */
  const U = { sec: null, q: '', role: 'all', branch: 'all', status: 'all' };

  function usersMount(sec) {
    U.sec = sec;
    sec.innerHTML = `
      <div class="page-head">
        <div><div class="eyebrow">Settings / Users</div><h1>Users</h1><p>Everyone who can sign in to ${esc((DATA.company || {}).short || 'Al-Noor Enterprises')} — their roles, branches, devices and security.</p></div>
        <div class="cu-head-r"><span class="tagline">Right people, right access</span>
          <div class="head-actions"><button class="btn secondary" data-u="export"><i data-lucide="download"></i>Export</button><button class="btn secondary" data-u="mfa"><i data-lucide="shield-check"></i>Enforce MFA</button><button class="btn primary" data-u="add"><i data-lucide="user-plus"></i>Add User</button></div></div>
      </div>
      <div class="cu-ukpis" data-u-kpis></div>
      <div class="toolbar cu-utool" data-plain-search>
        <label class="search-field"><i data-lucide="search"></i><input data-u-q placeholder="Search name, email or employee ID…"></label>
        <label class="cu-fsel"><i data-lucide="map-pin"></i><select data-u-branch aria-label="Branch"><option value="all">All branches</option>${ALLB.map((b) => `<option>${b}</option>`).join('')}</select></label>
        <span class="spacer"></span>
        <div class="cu-dirs" data-u-status></div>
      </div>
      <div class="cu-rolechips" data-u-roles></div>
      <div class="panel flush cu-utable">
        <div class="panel-head"><div><h3>Team members</h3><p data-u-count></p></div><span class="pill"><i data-lucide="mouse-pointer-click"></i>Click a row for details</span></div>
        <div class="table-wrap"><table class="tbl cu-ut" data-plain><thead><tr><th>User</th><th>Email</th><th>Role</th><th>Branch access</th><th>MFA</th><th>Last active</th><th>Status</th><th></th></tr></thead><tbody data-u-body></tbody></table></div>
      </div>
      <div class="cu-ugrid">
        <div class="panel cu-invp"><div class="panel-head"><div><h3>Pending invites</h3><p>Invitations expire after 7 days</p></div><span class="badge info" data-inv-n></span></div><div class="cu-invs" data-u-inv></div></div>
        <div class="panel cu-post"><div class="panel-head"><div><h3>Security posture</h3><p>MFA adoption by role</p></div><span class="badge neutral"><i data-lucide="shield"></i>Policy: MFA for approvers</span></div><div data-u-post></div></div>
      </div>`;
    bindUsers(sec);
    renderUsers();
    icons(sec);
  }

  function renderUKpis(fromZero) {
    const box = $('[data-u-kpis]', U.sec);
    const act = USERS.filter((u) => u.status === 'active'), mfa = act.filter((u) => u.mfa).length;
    const pct = act.length ? Math.round((mfa / act.length) * 100) : 0, used = seatsUsed();
    if (!box.firstElementChild) {
      box.innerHTML = `
        <div class="cu-uk"><span class="icon-tile"><i data-lucide="users"></i></span><div><small>Active users</small><b data-uk="act"></b><em data-uk-s="act"></em></div></div>
        <div class="cu-uk"><span class="icon-tile blue"><i data-lucide="mail-plus"></i></span><div><small>Pending invites</small><b data-uk="inv"></b><em data-uk-s="inv"></em></div></div>
        <div class="cu-uk"><span class="cu-ring" data-uk-ring><svg viewBox="0 0 44 44"><circle r="18" cx="22" cy="22"/><circle class="v" r="18" cx="22" cy="22" pathLength="100"/></svg><i data-lucide="shield-check"></i></span><div><small>MFA coverage</small><b data-uk="mfa"></b><em data-uk-s="mfa"></em></div></div>
        <div class="cu-uk seats"><div class="cu-seat-top"><small>Seats used</small><b data-uk="seat"></b></div><div class="cu-seats" data-uk-seats>${Array.from({ length: SEATS }, (_, i) => `<i style="--i:${i}"></i>`).join('')}</div><em data-uk-s="seat"></em></div>`;
      icons(box);
    }
    const b = (k) => $(`[data-uk="${k}"]`, box);
    if (fromZero) ['act', 'inv', 'mfa', 'seat'].forEach((k) => (b(k).dataset.v = 0));
    tickN(b('act'), act.length);
    tickN(b('inv'), INVITES.length);
    tickN(b('mfa'), pct, '%');
    tween(b('seat'), used, { fmt: (v) => `${Math.round(v)}<span class="dec"> / ${SEATS}</span>` });
    $('[data-uk-s="act"]', box).innerHTML = `${USERS.filter((u) => u.status === 'suspended').length} suspended · ${USERS.filter((u) => u.ext).length} external`;
    $('[data-uk-s="inv"]', box).innerHTML = INVITES.some((i) => i.tone === 'danger') ? '<span class="down">1 expires today</span>' : 'All within 7 days';
    $('[data-uk-s="mfa"]', box).innerHTML = `${mfa} of ${act.length} active users`;
    $('[data-uk-s="seat"]', box).innerHTML = `Business plan · <b>${SEATS - used}</b> seats left`;
    const ring = $('[data-uk-ring]', box); ring.style.setProperty('--p', pct); ring.classList.toggle('low', pct < 80);
    $$('[data-uk-seats] i', box).forEach((x, i) => x.classList.toggle('on', i < used));
  }

  function userRow(u, k) {
    const st = { active: '<span class="badge good dot">Active</span>', invited: '<span class="badge info dot">Invited</span>', suspended: '<span class="badge danger dot">Suspended</span>' }[u.status];
    const br = u.branches.length === ALLB.length ? '<span class="cu-bchip all">All branches</span>' : u.branches.slice(0, 2).map((b) => `<span class="cu-bchip">${esc(b)}</span>`).join('') + (u.branches.length > 2 ? `<span class="cu-bchip more">+${u.branches.length - 2}</span>` : '');
    return `<tr data-uid="${u.id}" class="cu-urow ${u.status}" style="--ri:${Math.min(k, 20)}" tabindex="0">
      <td><div class="cell-user"><span class="avatar sm ${avCls(u.name)}">${initials(u.name)}</span><div><b>${esc(u.name)}${u.you ? ' <span class="cu-you">You</span>' : ''}${u.ext ? ' <span class="cu-ext">External</span>' : ''}</b><small>${esc(u.title)}${u.emp ? ' · ' + u.emp : ''}</small></div></div></td>
      <td class="cu-mail">${esc(u.email)}</td>
      <td>${rolePill(u.role)}</td>
      <td><div class="cu-bchips">${br}</div></td>
      <td>${u.mfa ? '<span class="cu-mfa on"><i data-lucide="shield-check"></i>On</span>' : '<span class="cu-mfa off"><i data-lucide="shield-off"></i>Off</span>'}</td>
      <td>${esc(u.last)}<small>${esc(u.dev)}</small></td>
      <td>${st}</td>
      <td class="actions"><button class="icon-btn-sm" data-u-dots aria-label="Actions for ${esc(u.name)}"><i data-lucide="more-horizontal"></i></button></td></tr>`;
  }

  function renderUsers(o = {}) {
    const sec = U.sec;
    // role chips
    const rc = $('[data-u-roles]', sec);
    rc.innerHTML = `<span class="cu-catlbl"><i data-lucide="shield"></i>Role</span><button class="cu-catchip ${U.role === 'all' ? 'on' : ''}" data-urole="all">All roles<em>${USERS.length}</em></button>` +
      ROLES.filter((r) => roleCount(r.id)).map((r) => `<button class="cu-catchip ${U.role === r.id ? 'on' : ''}" data-urole="${r.id}"><i data-lucide="${r.icon}"></i>${esc(r.name.replace(' (read-only)', ''))}<em>${roleCount(r.id)}</em></button>`).join('');
    const sc = $('[data-u-status]', sec);
    const cnt = { all: USERS.length, active: USERS.filter((u) => u.status === 'active').length, invited: USERS.filter((u) => u.status === 'invited').length, suspended: USERS.filter((u) => u.status === 'suspended').length, nomfa: USERS.filter((u) => !u.mfa && u.status === 'active').length };
    sc.innerHTML = [['all', 'All'], ['active', 'Active'], ['invited', 'Invited'], ['suspended', 'Suspended'], ['nomfa', 'No MFA']].filter(([k]) => k === 'all' || cnt[k]).map(([k, l]) => `<button data-ust="${k}" class="${U.status === k ? 'active' : ''}">${l}<em>${cnt[k]}</em></button>`).join('');
    // rows
    const q = U.q.toLowerCase();
    const list = USERS.filter((u) => (U.role === 'all' || u.role === U.role) && (U.branch === 'all' || u.branches.includes(U.branch)) &&
      (U.status === 'all' || (U.status === 'nomfa' ? !u.mfa && u.status === 'active' : u.status === U.status)) &&
      (!q || [u.name, u.email, u.emp, u.title, roleById(u.role).name].join(' ').toLowerCase().includes(q)));
    const body = $('[data-u-body]', sec);
    body.innerHTML = list.length ? list.map(userRow).join('') : `<tr class="no-results"><td colspan="8"><div class="empty-state"><span class="icon-well lg"><i data-lucide="user-search"></i></span><h4>No users match</h4><p>Try another role, branch or status.</p></div></td></tr>`;
    if (!RM()) $$('tr.cu-urow', body).forEach((tr) => tr.classList.add('row-in'));
    if (o.flash) { const tr = $(`[data-uid="${o.flash}"]`, body); if (tr) { tr.classList.add('row-flash', 'cu-new'); } }
    $('[data-u-count]', sec).textContent = `${list.length} of ${USERS.length} users${U.role !== 'all' || U.branch !== 'all' || U.status !== 'all' || U.q ? ' · filtered' : ''}`;
    renderUKpis(o.fromZero);
    renderInvites(o.flashInv);
    renderPosture();
    icons(sec);
  }

  function renderInvites(flash) {
    const box = $('[data-u-inv]', U.sec);
    $('[data-inv-n]', U.sec).textContent = `${INVITES.length} pending`;
    box.innerHTML = INVITES.length ? INVITES.map((iv) => {
      const cool = iv.cool && iv.cool > Date.now() ? Math.ceil((iv.cool - Date.now()) / 1000) : 0;
      return `<div class="cu-inv${flash === iv.id ? ' cu-inv-new' : ''}" data-inv="${iv.id}">
        <span class="avatar sm ${avCls(iv.email)}">${initials(iv.name || iv.email)}</span>
        <div class="cu-inv-t"><b>${esc(iv.email)}</b><small>${roleById(iv.role).name} · ${esc(iv.branch)} · via ${iv.via} · by ${esc(iv.by)}, ${iv.sent}</small></div>
        <span class="badge ${iv.tone}">${iv.exp}</span>
        <div class="cu-inv-act"><button class="btn ghost sm" data-inv-resend ${cool ? 'disabled' : ''}>${cool ? `<i data-lucide="timer"></i>Resend in <span data-cd>${cool}</span>s` : '<i data-lucide="send"></i>Resend'}</button><button class="icon-btn-sm" data-inv-copy data-tip="Copy invite link" aria-label="Copy invite link"><i data-lucide="link"></i></button><button class="icon-btn-sm cu-x-btn" data-inv-revoke data-tip="Revoke invite" aria-label="Revoke invite"><i data-lucide="x"></i></button></div>
      </div>`;
    }).join('') : `<div class="empty-state cu-inv-empty"><span class="icon-well lg"><i data-lucide="mail-check"></i></span><h4>No pending invites</h4><p>Everyone you invited has joined.</p></div>`;
    icons(box);
  }

  function renderPosture() {
    const box = $('[data-u-post]', U.sec);
    const rows = ROLES.map((r) => { const us = USERS.filter((u) => u.role === r.id && u.status === 'active'); return [r, us.length, us.filter((u) => u.mfa).length]; }).filter((x) => x[1]);
    box.innerHTML = `<div class="cu-post-list">${rows.map(([r, n, m], i) => `<div class="cu-post-row" style="--i:${i}"><span class="cu-role t-${r.tone} sm"><i data-lucide="${r.icon}"></i>${esc(r.name.replace(' (read-only)', ''))}</span><div class="cu-post-bar"><i style="--w:${Math.round((m / n) * 100)}%" class="${m < n ? 'part' : ''}"></i></div><b>${m}/${n}</b></div>`).join('')}</div>
      <div class="cu-post-foot"><i data-lucide="info"></i><span>${USERS.filter((u) => u.status === 'active' && !u.mfa).length} active users can still sign in with a password only.</span><button class="btn secondary sm" data-u="mfa">Enforce for all</button></div>`;
    icons(box);
  }

  function userMenu(btn, u) {
    FS.menu(btn, [
      { label: 'View details', icon: 'user-round', onClick: () => openUser(u.id) },
      { label: 'Edit access', icon: 'pencil', onClick: () => openWizard(u) },
      { label: 'Reset MFA', icon: 'smartphone', onClick: () => resetMfa(u) },
      { label: 'Send password reset', icon: 'key-round', onClick: () => toast(`Password reset link sent to ${u.email}`) },
      { sep: true },
      u.status === 'suspended' ? { label: 'Reactivate', icon: 'user-check', onClick: () => toggleSuspend(u) } : { label: 'Suspend', icon: 'user-x', danger: true, onClick: () => toggleSuspend(u) },
    ]);
  }

  async function toggleSuspend(u, after) {
    if (u.you) { toast("You can't suspend your own account", { tone: 'warn' }); return false; }
    const sus = u.status !== 'suspended';
    const ok = await confirmBox({ title: `${sus ? 'Suspend' : 'Reactivate'} ${u.name}?`, text: sus ? 'They will be signed out of every device immediately and cannot sign in until reactivated. Their records and history are kept.' : 'They will be able to sign in again with their existing role and branch access.', okLabel: sus ? 'Suspend user' : 'Reactivate', danger: sus, icon: sus ? 'user-x' : 'user-check' });
    if (!ok) return false;
    const prev = u.status;
    u.status = sus ? 'suspended' : 'active';
    renderUsers({ flash: u.id });
    toast(`${u.name} ${sus ? 'suspended · 2 sessions revoked' : 'reactivated'}`, { tone: sus ? 'warn' : 'good', undo: () => { u.status = prev; renderUsers({ flash: u.id }); } });
    if (after) after();
    return true;
  }
  async function resetMfa(u) {
    const ok = await confirmBox({ title: `Reset MFA for ${u.name}?`, text: 'Their authenticator will be unlinked. They must enrol again at next sign-in.', okLabel: 'Reset MFA', icon: 'smartphone' });
    if (!ok) return;
    toast(`MFA reset for ${u.name} · re-enrolment required at next sign-in`, { tone: 'info' });
  }

  /* ---------------- user detail drawer */
  function sessionsFor(u) {
    const h = hash(u.email), cities = { 'Lahore HQ': 'Lahore', Karachi: 'Karachi', Islamabad: 'Islamabad', Faisalabad: 'Faisalabad' };
    const city = cities[u.branches[0]] || 'Lahore';
    const list = [{ ic: /app/i.test(u.dev) ? 'smartphone' : 'laptop', dev: u.dev, loc: `${city}, PK`, ip: `39.${32 + (h % 20)}.${h % 250}.${(h >> 3) % 250}`, last: /Today/.test(u.last) ? 'Active now' : u.last, cur: true }];
    if (h % 3 !== 0) list.push({ ic: 'smartphone', dev: h % 2 ? 'Android app · Finsoft 4.2' : 'iOS app · Finsoft 4.2', loc: `${city}, PK`, ip: `119.${150 + (h % 40)}.${(h >> 2) % 250}.${(h >> 5) % 250}`, last: 'Yesterday 21:14' });
    if (h % 4 === 1) list.push({ ic: 'monitor', dev: 'Chrome · macOS', loc: 'Dubai, AE', ip: `94.${200 + (h % 50)}.${(h >> 4) % 250}.18`, last: '26 Sep 11:02', risk: true });
    return list;
  }
  function activityFor(u) {
    const pool = {
      owner: [['badge-check', 'Approved payroll run Sep 2026'], ['settings', 'Updated company fiscal settings'], ['user-plus', 'Invited ali.haider@alnoor.com.pk']],
      fm: [['book-check', 'Posted JV-LHR-0153'], ['lock', 'Locked cash day 29 Sep · Lahore HQ'], ['badge-check', 'Approved vendor payment BILL-2026-000231']],
      acc: [['file-plus', 'Created CPV-LHR-0688'], ['git-compare', 'Reconciled Meezan 0123 — Sep'], ['download', 'Exported Trial Balance']],
      hr: [['calendar-check', 'Approved 3 leave requests'], ['user-plus', 'Added employee EMP-0073'], ['badge-check', 'Approved attendance regularisation']],
      pay: [['play-circle', 'Prepared payroll run Sep 2026'], ['hand-coins', 'Recorded loan instalment EMP-0042'], ['file-spreadsheet', 'Exported EOBI statement']],
      sales: [['file-pen', 'Created quotation QT-2026-000318'], ['receipt-text', 'Issued invoice INV-2026-000164'], ['hand-coins', 'Recorded receipt from City Mart']],
      store: [['package-check', 'Posted GRN-2026-000092'], ['sliders-horizontal', 'Created stock adjustment ADJ-0041'], ['truck', 'Dispatched transfer to Karachi Depot']],
      aud: [['download', 'Exported General Ledger FY 2025-26'], ['scroll-text', 'Viewed audit trail — vouchers'], ['eye', 'Viewed fixed asset register']],
    }[u.role] || [];
    const times = ['Today 09:14', 'Yesterday 17:42', '29 Sep 11:20', '27 Sep 15:05'];
    return [['log-in', `Signed in · ${u.dev}`]].concat(pool).map((a, i) => [a[0], a[1], times[i] || '25 Sep']);
  }
  function effPerms(rid) {
    const p = SAVED[rid] || {};
    return GROUPS.map((g) => ({ g, mods: g.mods.map((m) => [m, p[m[0]] || '']).filter((x) => x[1]) })).filter((x) => x.mods.length);
  }

  function openUser(id) {
    const u = USERS.find((x) => x.id === id); if (!u) return;
    const r = roleById(u.role), meta = META_SAVED[u.role] || {};
    const sess = sessionsFor(u), acts = activityFor(u), eff = effPerms(u.role);
    const html = `
      <div class="cu-ud-hero">
        <span class="avatar lg ${avCls(u.name)}">${initials(u.name)}</span>
        <div><h3>${esc(u.name)}${u.you ? ' <span class="cu-you">You</span>' : ''}</h3><p>${esc(u.title)} · ${esc(u.dept || '')}</p><div class="cu-ud-tags">${rolePill(u.role)}<span data-ud-status>${{ active: '<span class="badge good dot">Active</span>', invited: '<span class="badge info dot">Invited</span>', suspended: '<span class="badge danger dot">Suspended</span>' }[u.status]}</span>${u.mfa ? '<span class="cu-mfa on"><i data-lucide="shield-check"></i>MFA on</span>' : '<span class="cu-mfa off"><i data-lucide="shield-off"></i>MFA off</span>'}</div></div>
      </div>
      <div class="tabs cu-ud-tabs" role="tablist"><button class="active" data-ut="profile"><i data-lucide="user-round"></i>Profile</button><button data-ut="perm"><i data-lucide="shield-check"></i>Permissions</button><button data-ut="sess"><i data-lucide="monitor-smartphone"></i>Sessions <i>${sess.length}</i></button><button data-ut="act"><i data-lucide="activity"></i>Activity</button></div>
      <div class="cu-ud-pane active" data-up="profile">
        <div class="dl cu-ud-dl">
          <div><span>Email</span><b>${esc(u.email)}</b></div><div><span>Phone</span><b>${esc(u.phone || '—')}</b></div>
          <div><span>Employee</span><b>${u.emp ? `<a href="#/app/hr/employees/view">${u.emp}</a>` : 'External — not on payroll'}</b></div>
          <div><span>Branches</span><b>${u.branches.length === ALLB.length ? 'All branches' : u.branches.map(esc).join(', ')}</b></div>
          <div><span>Approval limit</span><b>${meta.maxv ? rs(meta.maxv, 0) : 'No approvals'}</b></div>
          <div><span>Data scope</span><b>${['owner', 'fm', 'aud'].includes(u.role) ? 'All company' : 'Own branch'}</b></div>
          <div><span>Last active</span><b>${esc(u.last)} · ${esc(u.dev)}</b></div>
          <div><span>Member since</span><b>${u.ext ? '02 Sep 2026' : '14 Mar 2025'}</b></div>
        </div>
      </div>
      <div class="cu-ud-pane" data-up="perm">
        <div class="banner info cu-ud-ban"><i data-lucide="info"></i><div><b>Inherited from ${esc(r.name)}</b><p>${esc(r.desc)} No user-level overrides.</p></div><a class="btn secondary sm" href="#/app/settings/roles" data-ud-role="${u.role}">Edit role</a></div>
        ${eff.length ? eff.map((x) => `<div class="cu-eff"><h5><i data-lucide="${x.g.icon}"></i>${x.g.name}<em>${x.mods.length} modules</em></h5>${x.mods.map(([m, s]) => `<div class="cu-eff-row"><span>${m[1]}</span><div>${ACT.map((a) => m[2].includes(a[0]) ? `<i class="${s.includes(a[0]) ? 'on' : ''}" title="${a[1]}">${a[1]}</i>` : '').join('')}</div></div>`).join('')}</div>`).join('') : '<div class="empty-state"><h4>No permissions</h4></div>'}
      </div>
      <div class="cu-ud-pane" data-up="sess">
        <div class="cu-sess">${sess.map((s, i) => `<div class="cu-ses${s.risk ? ' risk' : ''}" data-ses="${i}"><span class="icon-well ${s.risk ? 'red' : ''}"><i data-lucide="${s.ic}"></i></span><div><b>${esc(s.dev)}${s.cur ? ' <span class="badge good">Current</span>' : ''}${s.risk ? ' <span class="badge danger">Unusual location</span>' : ''}</b><small>${s.loc} · IP ${s.ip} · ${s.last}</small></div><button class="btn ${s.risk ? 'danger' : 'secondary'} sm" data-revoke><i data-lucide="log-out"></i>Revoke</button></div>`).join('')}</div>
        <button class="btn ghost sm cu-ses-all" data-revoke-all><i data-lucide="shield-x"></i>Sign out of all devices</button>
      </div>
      <div class="cu-ud-pane" data-up="act">
        <ol class="cu-audit">${acts.map((a, i) => `<li style="--i:${i}"><span><i data-lucide="${a[0]}"></i></span><div><b>${esc(a[1])}</b><small>${a[2]}</small></div></li>`).join('')}</ol>
      </div>`;
    const dr = FS.drawer({ title: 'User details', subtitle: esc(u.email), html, wide: true, foot: `<button class="btn ghost" data-ud="more"><i data-lucide="more-horizontal"></i>More</button><span class="spacer"></span><button class="btn ${u.status === 'suspended' ? 'secondary' : 'danger'}" data-ud="suspend"><i data-lucide="${u.status === 'suspended' ? 'user-check' : 'user-x'}"></i>${u.status === 'suspended' ? 'Reactivate' : 'Suspend'}</button><button class="btn primary" data-ud="edit"><i data-lucide="pencil"></i>Edit</button>` });
    dr.classList.add('cu-ud');
    dr.addEventListener('click', async (ev) => {
      const t = ev.target;
      let b;
      if ((b = t.closest('[data-ut]'))) {
        $$('[data-ut]', dr).forEach((x) => x.classList.toggle('active', x === b));
        $$('[data-up]', dr).forEach((p) => p.classList.toggle('active', p.dataset.up === b.dataset.ut));
        if (FS.positionInk) FS.positionInk($('.cu-ud-tabs', dr));
        return;
      }
      if ((b = t.closest('[data-ud-role]'))) { RO.sel = b.dataset.udRole; FS.closeOverlays(); return; }
      if ((b = t.closest('[data-revoke]'))) {
        const row = b.closest('.cu-ses');
        await busy(b, 'Revoking', 600);
        row.classList.add('out');
        setTimeout(() => row.remove(), 380);
        toast(`Session on ${$('b', row).firstChild.textContent.trim()} revoked`, { tone: 'good' });
        return;
      }
      if ((b = t.closest('[data-revoke-all]'))) {
        const ok = await confirmBox({ title: 'Sign out of all devices?', text: `${u.name} will be signed out everywhere and asked to sign in again.`, okLabel: 'Sign out everywhere', danger: true });
        if (!ok) return;
        $$('.cu-ses', dr).forEach((row, i) => setTimeout(() => row.classList.add('out'), i * 90));
        toast(`All sessions for ${u.name} revoked`, { tone: 'good' });
        return;
      }
      if ((b = t.closest('[data-ud]'))) {
        const a = b.dataset.ud;
        if (a === 'edit') { FS.closeOverlays(); setTimeout(() => openWizard(u), 220); }
        if (a === 'suspend') { await toggleSuspend(u, () => { FS.closeOverlays(); }); }
        if (a === 'more') FS.menu(b, [
          { label: 'Reset MFA', icon: 'smartphone', onClick: () => resetMfa(u) },
          { label: 'Send password reset', icon: 'key-round', onClick: () => toast(`Password reset link sent to ${u.email}`) },
          { sep: true },
          { label: 'Transfer ownership…', icon: 'crown', danger: true, onClick: async () => {
            if (u.role === 'owner' && !u.you) { toast(`${u.name} is already an owner`, { tone: 'info' }); return; }
            const ok = await confirmBox({ title: `Transfer ownership to ${u.name}?`, text: 'They will become the Owner with billing and full access. Ahmed Raza will be asked to confirm by email within 24 hours.', okLabel: 'Request transfer', danger: true, icon: 'crown' });
            if (ok) toast(`Ownership transfer requested · waiting for Ahmed Raza to confirm`, { tone: 'warn' });
          } },
        ]);
      }
    });
  }

  /* ---------------- Add / edit user wizard */
  const STEPS = [['Method', 'send'], ['Identity', 'id-card'], ['Role', 'shield'], ['Access', 'map-pin'], ['Security', 'lock-keyhole'], ['Review', 'list-checks']];
  let W = null;

  function genPwd() {
    const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%&*?'];
    const R = () => (window.crypto && crypto.getRandomValues ? crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296 : Math.random());
    let p = sets.map((s) => s[Math.floor(R() * s.length)]).join('');
    const all = sets.join('');
    while (p.length < 14) p += all[Math.floor(R() * all.length)];
    return p.split('').sort(() => R() - 0.5).join('');
  }
  function pwdScore(p) {
    let s = 0; if (p.length >= 8) s++; if (p.length >= 12) s++; if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++; if (/\d/.test(p) && /[^A-Za-z0-9]/.test(p)) s++;
    return Math.min(4, s);
  }

  function openWizard(edit) {
    const isEdit = !!edit;
    W = {
      step: isEdit ? 3 : 1, edit: isEdit ? edit.id : null, method: 'invite', chEmail: true, chWa: false, pwd: genPwd(), forceChange: true, showPwd: false,
      idMode: 'link', emp: isEdit ? edit.emp : null, name: isEdit ? edit.name : '', email: isEdit ? edit.email : '', phone: isEdit ? edit.phone : '', dept: isEdit ? edit.dept : '', title: isEdit ? edit.title : '',
      role: isEdit ? edit.role : 'acc', roleTouched: isEdit, branches: new Set(isEdit ? edit.branches : ['Lahore HQ']), whs: new Set([WHS[0]]), mods: new Set(MODW_DEF[isEdit ? edit.role : 'acc'] || []),
      limit: LIMIT_DEF[isEdit ? edit.role : 'acc'] || 0, scope: 'branch', mfa: isEdit ? edit.mfa : true, mfaMethod: 'app', ip: false, ips: '39.32.0.0/16', timeout: '60', hours: 'business', from: '09:00', to: '19:00', errs: {},
    };
    if (isEdit && !edit.emp) W.idMode = 'manual';
    const dr = FS.drawer({
      title: isEdit ? `Edit ${esc(edit.name)}` : 'Add user',
      subtitle: isEdit ? 'Update role, access and security' : 'Invite a teammate or create their account in six quick steps',
      wide: true,
      html: `<div class="cu-wz"><ol class="cu-wz-steps" data-wz-steps>${STEPS.map((s, i) => `<li data-goto="${i + 1}"><span><i data-lucide="${s[1]}"></i><b>${i + 1}</b></span><em>${s[0]}</em></li>`).join('')}<i class="cu-wz-line"><i></i></i></ol><div class="cu-wz-body" data-wz-body></div></div>`,
      foot: `<button class="btn ghost" data-wz="back"><i data-lucide="arrow-left"></i>Back</button><span class="spacer"></span><span class="cu-wz-count" data-wz-count></span><div class="cu-wz-prog" data-wz-prog><i></i></div><button class="btn primary" data-wz="next">Continue<i data-lucide="arrow-right"></i></button>`,
    });
    dr.classList.add('cu-wzd');
    W.dr = dr;
    bindWizard(dr);
    wzRender();
  }

  function wzRender(dirn) {
    const dr = W.dr, body = $('[data-wz-body]', dr);
    $$('[data-wz-steps] li', dr).forEach((li, i) => { li.classList.toggle('done', i + 1 < W.step); li.classList.toggle('cur', i + 1 === W.step); });
    $('[data-wz-steps] .cu-wz-line > i', dr).style.width = ((W.step - 1) / (STEPS.length - 1)) * 100 + '%';
    $('[data-wz-count]', dr).textContent = `Step ${W.step} of ${STEPS.length}`;
    const back = $('[data-wz="back"]', dr), next = $('[data-wz="next"]', dr);
    back.style.visibility = W.step === 1 ? 'hidden' : '';
    const fin = W.edit ? '<i data-lucide="check"></i>Save changes' : W.method === 'invite' ? '<i data-lucide="send"></i>Send invite' : '<i data-lucide="user-plus"></i>Create user';
    next.innerHTML = W.step === STEPS.length ? fin : 'Continue<i data-lucide="arrow-right"></i>';
    next.classList.toggle('lime', W.step === STEPS.length);
    body.innerHTML = `<div class="cu-wz-pane ${dirn === -1 ? 'back' : ''}">${[null, wzMethod, wzIdentity, wzRole, wzAccess, wzSecurity, wzReview][W.step]()}</div>`;
    icons(dr);
    if (W.step === 3) animPreview();
    if (W.step === 4) updLimit();
    const f = $('input:not([type=checkbox]):not([type=range]):not([readonly]), textarea', body);
    if (f && W.step === 2 && !RM()) setTimeout(() => f.focus({ preventScroll: true }), 300);
  }

  function wzMethod() {
    const sc = pwdScore(W.pwd), lbl = ['Too weak', 'Weak', 'Fair', 'Strong', 'Very strong'][sc];
    return `<h3 class="cu-wz-h">How should they get access?</h3><p class="cu-wz-p">You can switch later — invites expire after 7 days.</p>
      <div class="cu-mcards">
        <button class="cu-mcard ${W.method === 'invite' ? 'on' : ''}" data-m="invite"><span class="icon-tile blue"><i data-lucide="mail-plus"></i></span><b>Invite by email / WhatsApp</b><small>They set their own password from a secure one-time link.</small><span class="cu-mcard-tags"><em>Recommended</em><em>No password sharing</em></span><i class="cu-radio"></i></button>
        <button class="cu-mcard ${W.method === 'create' ? 'on' : ''}" data-m="create"><span class="icon-tile orange"><i data-lucide="key-round"></i></span><b>Create account now</b><small>Set a temporary password and share it with them securely.</small><span class="cu-mcard-tags"><em>Works offline</em><em>Instant access</em></span><i class="cu-radio"></i></button>
      </div>
      ${W.method === 'invite' ? `<div class="cu-wz-box"><span class="lbl">Send invite via</span>
        <div class="cu-chan"><label class="cu-chk"><input type="checkbox" data-w="chEmail" ${W.chEmail ? 'checked' : ''}><span><i data-lucide="mail"></i>Email</span></label><label class="cu-chk"><input type="checkbox" data-w="chWa" ${W.chWa ? 'checked' : ''}><span><i data-lucide="message-circle"></i>WhatsApp</span></label></div>
        <div class="cu-bubble"><small>Preview</small><p><b>Sana Javed</b> invited you to join <b>Al-Noor Enterprises</b> on Finsoft as <b>${esc(roleById(W.role).name)}</b>. Accept within 7 days: <u>finsoft.pk/i/7Hq2-xK9</u></p></div></div>`
      : `<div class="cu-wz-box"><span class="lbl">Temporary password</span>
        <div class="cu-pwd"><input type="${W.showPwd ? 'text' : 'password'}" value="${esc(W.pwd)}" data-w="pwd" aria-label="Temporary password" spellcheck="false"><button class="icon-btn-sm" data-pw="eye" data-tip="${W.showPwd ? 'Hide' : 'Show'}"><i data-lucide="${W.showPwd ? 'eye-off' : 'eye'}"></i></button><button class="btn secondary sm" data-pw="gen"><i data-lucide="refresh-cw"></i>Generate</button><button class="btn secondary sm" data-pw="copy"><i data-lucide="copy"></i>Copy</button></div>
        <div class="cu-meter s${sc}" data-meter><i></i><i></i><i></i><i></i><span>${lbl}</span></div>
        <label class="cu-chk inline"><input type="checkbox" data-w="forceChange" ${W.forceChange ? 'checked' : ''}><span>Require a new password at first sign-in</span></label></div>`}`;
  }

  function wzIdentity() {
    const e = W.emp ? EMPS.find((x) => x.id === W.emp) : null;
    const err = (k) => (W.errs[k] ? `<small class="cu-err">${W.errs[k]}</small>` : '');
    return `<h3 class="cu-wz-h">Who is this user?</h3><p class="cu-wz-p">Linking an employee keeps HR, payroll and access in sync.</p>
      <div class="seg cu-idseg" data-idseg><button data-idm="link" class="${W.idMode === 'link' ? 'active' : ''}"><i data-lucide="link-2"></i>Link existing employee</button><button data-idm="manual" class="${W.idMode === 'manual' ? 'active' : ''}"><i data-lucide="pencil-line"></i>Enter manually</button></div>
      ${W.idMode === 'link' ? `<div class="cu-combo" data-combo>
        <label class="search-field cu-combo-in"><i data-lucide="search"></i><input data-combo-q placeholder="Search employees by name, ID or department…" autocomplete="off" value=""></label>
        <div class="cu-combo-list" data-combo-list></div>
      </div>
      ${e ? `<div class="cu-linked"><span class="avatar ${avCls(e.name)}">${initials(e.name)}</span><div><b>${esc(e.name)}</b><small>${e.id} · ${esc(e.role)} · ${esc(e.dept)} · ${esc(e.branch)}</small></div><span class="badge good"><i data-lucide="link-2"></i>Linked</span><button class="icon-btn-sm" data-unlink aria-label="Unlink"><i data-lucide="x"></i></button></div>` : ''}` : ''}
      <div class="form-grid cu-idform ${W.idMode === 'link' && !e ? 'dim' : ''}">
        <label><span>Full name *</span><input data-w="name" value="${esc(W.name)}" placeholder="e.g. Sobia Khan">${err('name')}</label>
        <label><span>Work email ${W.method === 'invite' && !W.chEmail ? '' : '*'}</span><input type="email" data-w="email" value="${esc(W.email)}" placeholder="name@alnoor.com.pk">${err('email')}</label>
        <label><span>Mobile ${W.chWa && W.method === 'invite' ? '*' : ''}</span><input data-w="phone" value="${esc(W.phone === '—' ? '' : W.phone)}" placeholder="03xx-xxxxxxx">${err('phone')}</label>
        <label><span>Department</span><input data-w="dept" value="${esc(W.dept || '')}" placeholder="e.g. Finance"></label>
        <label class="full"><span>Job title</span><input data-w="title" value="${esc(W.title || '')}" placeholder="e.g. Cashier"></label>
      </div>`;
  }

  function comboRender(q) {
    const list = $('[data-combo-list]', W.dr); if (!list) return;
    q = (q || '').toLowerCase();
    const emails = new Set(USERS.filter((u) => u.status !== 'removed').map((u) => u.email)), inv = new Set(INVITES.map((i) => i.email));
    const res = EMPS.filter((e) => !q || [e.name, e.id, e.dept, e.role].join(' ').toLowerCase().includes(q)).slice(0, 8);
    list.innerHTML = res.length ? res.map((e, i) => {
      const has = emails.has(e.email), pend = inv.has(e.email);
      return `<button class="cu-combo-opt" data-emp="${e.id}" ${has || pend ? 'disabled' : ''} style="--i:${i}"><span class="avatar xs ${avCls(e.name)}">${initials(e.name)}</span><span><b>${esc(e.name)}</b><small>${e.id} · ${esc(e.role)} · ${esc(e.branch)}</small></span>${has ? '<em>Has access</em>' : pend ? '<em class="p">Invite pending</em>' : '<i data-lucide="corner-down-left"></i>'}</button>`;
    }).join('') : '<div class="cu-combo-none">No employees found</div>';
    list.classList.add('open');
    icons(list);
  }

  function wzRole() {
    return `<h3 class="cu-wz-h">Choose a role</h3><p class="cu-wz-p">Roles bundle permissions. Fine-tune them any time in Roles &amp; Permissions.${W.emp && !W.roleTouched ? ' <span class="badge lime">Suggested from job title</span>' : ''}</p>
      <div class="cu-rcards">${ROLES.map((r) => `<button class="cu-rcard t-${r.tone} ${W.role === r.id ? 'on' : ''}" data-role="${r.id}"><span class="cu-rcard-ic"><i data-lucide="${r.icon}"></i></span><b>${esc(r.name)}</b><small>${roleCount(r.id)} user${roleCount(r.id) === 1 ? '' : 's'}</small><i class="cu-radio"></i></button>`).join('')}</div>
      <div class="cu-preview" data-preview>${previewHtml()}</div>`;
  }
  function previewHtml() {
    const r = roleById(W.role), can = ROLE_CAN[r.id] || [Object.keys(DRAFT[r.id] || {}).filter((k) => (SAVED[r.id] || {})[k]).slice(0, 4).map((k) => `Work with ${MODS[k].n.toLowerCase()}`), []];
    return `<div class="cu-pv-head"><span class="cu-rcard-ic t-${r.tone}"><i data-lucide="${r.icon}"></i></span><div><b>This role can…</b><small>${esc(r.desc || '')}</small></div></div>
      <ul>${can[0].map((x, i) => `<li class="y" style="--i:${i}"><i data-lucide="check"></i>${esc(x)}</li>`).join('')}${can[1].map((x, i) => `<li class="n" style="--i:${i + can[0].length}"><i data-lucide="x"></i>Cannot ${esc(x.charAt(0).toLowerCase() + x.slice(1))}</li>`).join('')}</ul>`;
  }
  function animPreview() { const p = $('[data-preview]', W.dr); if (p) { replay(p, 'swap'); } }

  function wzAccess() {
    return `<h3 class="cu-wz-h">Where and how much?</h3><p class="cu-wz-p">Limit access to branches, modules and approval amounts.</p>
      <div class="cu-acc-grid">
        <div class="cu-wz-box"><span class="lbl">Branches <button class="cu-link" data-all="branches">Select all</button></span><div class="cu-tiles">${ALLB.map((b) => `<label class="cu-tile"><input type="checkbox" data-br="${esc(b)}" ${W.branches.has(b) ? 'checked' : ''}><span><i data-lucide="map-pin"></i>${esc(b)}</span></label>`).join('')}</div>${W.errs.branches ? `<small class="cu-err">${W.errs.branches}</small>` : ''}</div>
        <div class="cu-wz-box"><span class="lbl">Warehouses <button class="cu-link" data-all="whs">Select all</button></span><div class="cu-tiles">${WHS.map((b) => `<label class="cu-tile"><input type="checkbox" data-wh="${esc(b)}" ${W.whs.has(b) ? 'checked' : ''}><span><i data-lucide="warehouse"></i>${esc(b.replace(' Warehouse', ''))}</span></label>`).join('')}</div></div>
      </div>
      <div class="cu-wz-box"><span class="lbl">Modules <small>${W.mods.size} of ${MODW.length} on · defaults from ${esc(roleById(W.role).name)}</small></span><div class="cu-mods">${MODW.map((m) => `<label class="switch cu-mod"><input type="checkbox" data-mod="${m}" ${W.mods.has(m) ? 'checked' : ''}><i></i><span>${m}</span></label>`).join('')}</div></div>
      <div class="cu-wz-box"><span class="lbl">Approval limit <small>Max single voucher this user may approve</small></span>
        <div class="cu-slider"><input type="range" min="0" max="5000000" step="25000" value="${W.limit}" data-w="limit" aria-label="Approval limit"><output data-limit-out></output></div>
        <div class="cu-slider-ticks"><span>None</span><span>Rs 1.25M</span><span>Rs 2.5M</span><span>Rs 3.75M</span><span>Rs 5M+</span></div></div>
      <div class="cu-wz-box"><span class="lbl">Data scope</span><div class="seg cu-scope" data-scope>${[['own', 'Own records', 'user'], ['branch', 'Their branches', 'map-pin'], ['all', 'All company', 'building-2']].map(([k, l, ic]) => `<button data-sc="${k}" class="${W.scope === k ? 'active' : ''}"><i data-lucide="${ic}"></i>${l}</button>`).join('')}</div>
        <small class="cu-hint">${{ own: 'Sees only documents they created or are assigned to.', branch: 'Sees every document in the branches ticked above.', all: 'Sees data across all branches and warehouses.' }[W.scope]}</small></div>`;
  }
  function updLimit() {
    const o = $('[data-limit-out]', W.dr), r = $('[data-w="limit"]', W.dr); if (!o || !r) return;
    const v = +r.value; W.limit = v;
    o.innerHTML = v === 0 ? 'No approvals' : v >= 5000000 ? 'Rs 5,000,000+' : rs(v, 0);
    const pct = (v / 5000000) * 100;
    r.style.setProperty('--sp', pct + '%');
    o.style.left = `calc(${pct}% + ${(0.5 - pct / 100) * 20}px)`;
  }

  function wzSecurity() {
    return `<h3 class="cu-wz-h">Security</h3><p class="cu-wz-p">Approvers should always use multi-factor sign-in.</p>
      <div class="cu-sec">
        <div class="cu-sec-row"><span class="icon-well"><i data-lucide="smartphone"></i></span><div><b>Require MFA</b><small>Authenticator app or SMS code at every new device.</small>${W.mfa ? `<div class="seg cu-mini-seg" data-mfam><button data-mm="app" class="${W.mfaMethod === 'app' ? 'active' : ''}">Authenticator</button><button data-mm="sms" class="${W.mfaMethod === 'sms' ? 'active' : ''}">SMS</button></div>` : ''}</div><label class="switch"><input type="checkbox" data-w="mfa" ${W.mfa ? 'checked' : ''}><i></i></label></div>
        <div class="cu-sec-row"><span class="icon-well blue"><i data-lucide="network"></i></span><div><b>IP restriction</b><small>Only allow sign-in from office networks.</small>${W.ip ? `<textarea data-w="ips" rows="2" class="cu-ips">${esc(W.ips)}</textarea>` : ''}</div><label class="switch"><input type="checkbox" data-w="ip" ${W.ip ? 'checked' : ''}><i></i></label></div>
        <div class="cu-sec-row"><span class="icon-well yellow"><i data-lucide="timer"></i></span><div><b>Session timeout</b><small>Sign out after inactivity.</small></div><select data-w="timeout" class="cu-sel-sm">${[['15', '15 minutes'], ['30', '30 minutes'], ['60', '1 hour'], ['240', '4 hours'], ['720', '12 hours']].map(([v, l]) => `<option value="${v}" ${W.timeout === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="cu-sec-row"><span class="icon-well violet"><i data-lucide="clock"></i></span><div><b>Login hours</b><small>${W.hours === 'any' ? 'Can sign in at any time.' : W.hours === 'business' ? 'Mon–Sat, 09:00 – 19:00 PKT.' : 'Custom window, Mon–Sat.'}</small>
          ${W.hours === 'custom' ? `<div class="cu-hours"><input type="time" data-w="from" value="${W.from}" aria-label="From"><span>to</span><input type="time" data-w="to" value="${W.to}" aria-label="To"></div>` : ''}</div>
          <div class="seg cu-mini-seg" data-hours><button data-hr="any" class="${W.hours === 'any' ? 'active' : ''}">Anytime</button><button data-hr="business" class="${W.hours === 'business' ? 'active' : ''}">Business</button><button data-hr="custom" class="${W.hours === 'custom' ? 'active' : ''}">Custom</button></div></div>
      </div>`;
  }

  function wzReview() {
    const r = roleById(W.role);
    const row = (k, v, step) => `<div><span>${k}</span><b>${v}</b>${step ? `<button class="cu-link" data-goto="${step}">Edit</button>` : ''}</div>`;
    return `<h3 class="cu-wz-h">Review &amp; ${W.edit ? 'save' : W.method === 'invite' ? 'send' : 'create'}</h3><p class="cu-wz-p">Double-check everything — you can change it later.</p>
      <div class="cu-rev-hero"><span class="avatar lg ${avCls(W.name)}">${initials(W.name || '?')}</span><div><b>${esc(W.name)}</b><small>${esc(W.email || W.phone)}${W.emp ? ' · ' + W.emp : ''}</small></div>${rolePill(W.role)}</div>
      <div class="cu-rev">
        <div class="dl">${row('Method', W.edit ? 'Existing account' : W.method === 'invite' ? `Invite via ${[W.chEmail && 'email', W.chWa && 'WhatsApp'].filter(Boolean).join(' + ')}` : 'Account with temporary password', W.edit ? 0 : 1)}${row('Identity', `${esc(W.title || '—')} · ${esc(W.dept || '—')}`, 2)}${row('Role', esc(r.name), 3)}${row('Branches', W.branches.size === ALLB.length ? 'All branches' : [...W.branches].map(esc).join(', '), 4)}${row('Modules', `${W.mods.size} of ${MODW.length}`, 4)}</div>
        <div class="dl">${row('Approval limit', W.limit ? (W.limit >= 5000000 ? 'Rs 5,000,000+' : rs(W.limit, 0)) : 'No approvals', 4)}${row('Data scope', { own: 'Own records', branch: 'Their branches', all: 'All company' }[W.scope], 4)}${row('MFA', W.mfa ? (W.mfaMethod === 'app' ? 'Required · authenticator' : 'Required · SMS') : '<span class="cu-warn-t">Not required</span>', 5)}${row('IP restriction', W.ip ? esc(W.ips) : 'Off', 5)}${row('Session · hours', `${W.timeout >= 60 ? W.timeout / 60 + ' h' : W.timeout + ' min'} · ${W.hours === 'any' ? 'anytime' : W.hours === 'business' ? 'business hours' : W.from + '–' + W.to}`, 5)}</div>
      </div>
      ${!W.mfa && W.limit > 0 ? '<div class="banner warn"><i data-lucide="triangle-alert"></i><div><b>Approver without MFA</b><p>This user can approve up to ' + rs(W.limit, 0) + ' but MFA is off. We recommend turning it on.</p></div><button class="btn secondary sm" data-goto="5">Fix</button></div>' : ''}
      <div class="cu-next"><b>What happens next</b><ul>${W.edit ? '<li><i data-lucide="refresh-cw"></i>Changes apply at their next page load</li><li><i data-lucide="scroll-text"></i>Logged in the audit trail</li>' : W.method === 'invite' ? `<li><i data-lucide="send"></i>A secure link is sent ${W.chWa ? 'by WhatsApp' : ''}${W.chWa && W.chEmail ? ' and ' : ''}${W.chEmail ? 'by email' : ''}</li><li><i data-lucide="hourglass"></i>The invite stays pending for 7 days</li><li><i data-lucide="user-check"></i>They choose a password${W.mfa ? ' and enrol MFA' : ''}</li>` : '<li><i data-lucide="key-round"></i>The account is active immediately</li><li><i data-lucide="copy"></i>Share the temporary password securely</li><li><i data-lucide="refresh-cw"></i>They must change it at first sign-in</li>'}</ul></div>`;
  }

  function wzValidate() {
    W.errs = {};
    if (W.step === 1 && W.method === 'invite' && !W.chEmail && !W.chWa) { toast('Pick at least one invite channel', { tone: 'warn' }); return false; }
    if (W.step === 2) {
      if (!W.name.trim()) W.errs.name = 'Name is required';
      const needEmail = !(W.method === 'invite' && !W.chEmail);
      if (needEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(W.email.trim())) W.errs.email = W.email ? 'Enter a valid email' : 'Email is required';
      else if (W.email && !W.edit && USERS.some((u) => u.email === W.email.trim() && u.status !== 'removed')) W.errs.email = 'This email already has access';
      if (W.method === 'invite' && W.chWa && !/^0\d{3}-?\d{7}$/.test((W.phone || '').trim())) W.errs.phone = 'Mobile is required for WhatsApp (03xx-xxxxxxx)';
    }
    if (W.step === 4 && !W.branches.size) W.errs.branches = 'Pick at least one branch';
    if (Object.keys(W.errs).length) {
      wzRender();
      const p = $('.cu-wz-pane', W.dr); replay(p, 'shake');
      return false;
    }
    return true;
  }

  async function wzSubmit(btn) {
    const dr = W.dr, prog = $('[data-wz-prog]', dr);
    prog.classList.add('on');
    $('[data-wz="back"]', dr).disabled = true;
    await busy(btn, W.edit ? 'Saving…' : W.method === 'invite' ? 'Sending invite…' : 'Creating account…', RM() ? 100 : 1150);
    let flash, flashInv;
    if (W.edit) {
      const u = USERS.find((x) => x.id === W.edit);
      Object.assign(u, { name: W.name.trim(), email: W.email.trim(), phone: W.phone, dept: W.dept, title: W.title, role: W.role, branches: ALLB.filter((b) => W.branches.has(b)), mfa: W.mfa });
      flash = u.id;
      toast(`${u.name} updated · ${roleById(u.role).name}`, { tone: 'good' });
    } else {
      const inv = W.method === 'invite';
      const u = { id: 'u' + ++uid, emp: W.emp, name: W.name.trim(), email: W.email.trim() || `${W.phone} (WhatsApp)`, phone: W.phone || '—', title: W.title || roleById(W.role).name, dept: W.dept || '—', role: W.role, branches: ALLB.filter((b) => W.branches.has(b)), mfa: W.mfa && !inv, last: inv ? 'Not signed in yet' : 'Just now', dev: inv ? 'Invite sent' : 'Account created', status: inv ? 'invited' : 'active', ext: !W.emp && !/alnoor\.com\.pk$/.test(W.email) };
      USERS.unshift(u);
      flash = u.id;
      if (inv) { const iv = { id: 'i' + Date.now(), email: u.email, name: u.name, role: u.role, branch: u.branches.length === ALLB.length ? 'All branches' : u.branches[0], by: 'Sana Javed', sent: 'Today', exp: 'Expires 8 Oct', tone: 'neutral', via: [W.chEmail && 'Email', W.chWa && 'WhatsApp'].filter(Boolean).join(' + '), cool: Date.now() + 30000 }; INVITES.unshift(iv); flashInv = iv.id; }
      toast(inv ? `Invite sent to ${u.name} · expires in 7 days` : `${u.name} can sign in now · temporary password copied`, { tone: 'good', action: inv ? null : undefined });
    }
    celebrate(btn);
    await sleep(RM() ? 0 : 450);
    FS.closeOverlay(dr.closest('.overlay'));
    U.role = 'all'; U.status = 'all'; U.branch = 'all'; U.q = '';
    if (U.sec) { $('[data-u-q]', U.sec).value = ''; $('[data-u-branch]', U.sec).value = 'all'; renderUsers({ flash, flashInv }); if (flashInv) startCountdown(); }
  }

  function bindWizard(dr) {
    dr.addEventListener('click', async (ev) => {
      const t = ev.target;
      let b;
      if ((b = t.closest('[data-wz]'))) {
        if (b.dataset.wz === 'back') { if (W.step > 1) { W.step--; wzRender(-1); } return; }
        if (!wzValidate()) return;
        if (W.step < STEPS.length) { W.step++; wzRender(1); } else wzSubmit(b);
        return;
      }
      if ((b = t.closest('[data-goto]'))) {
        const s = +b.dataset.goto; if (!s || s === W.step) return;
        if (s > W.step) { for (let k = W.step; k < s; k++) { if (!wzValidate()) return; W.step++; } wzRender(1); }
        else { W.step = s; wzRender(-1); }
        return;
      }
      if ((b = t.closest('[data-m]'))) { W.method = b.dataset.m; wzRender(); return; }
      if ((b = t.closest('[data-pw]'))) {
        const a = b.dataset.pw;
        if (a === 'gen') { W.pwd = genPwd(); const i = $('[data-w="pwd"]', dr); i.value = W.pwd; replay(i, 'cu-flashin'); updMeter(); }
        if (a === 'copy') { try { await navigator.clipboard.writeText(W.pwd); } catch (x) { /* file:// */ } b.innerHTML = '<i data-lucide="check"></i>Copied'; icons(b); setTimeout(() => { b.innerHTML = '<i data-lucide="copy"></i>Copy'; icons(b); }, 1400); }
        if (a === 'eye') { W.showPwd = !W.showPwd; wzRender(); }
        return;
      }
      if ((b = t.closest('[data-idm]'))) { W.idMode = b.dataset.idm; if (W.idMode === 'manual') W.emp = null; wzRender(); return; }
      if ((b = t.closest('[data-emp]'))) {
        const e = EMPS.find((x) => x.id === b.dataset.emp);
        Object.assign(W, { emp: e.id, name: e.name, email: e.email, phone: e.phone, dept: e.dept, title: e.role });
        W.branches = new Set([e.branch]);
        if (!W.roleTouched) { W.role = suggestRole(e.role); W.mods = new Set(MODW_DEF[W.role] || []); W.limit = LIMIT_DEF[W.role] || 0; }
        W.errs = {};
        wzRender();
        $$('.cu-idform input', dr).forEach((i, k) => { i.style.setProperty('--i', k); replay(i, 'cu-fill'); });
        return;
      }
      if (t.closest('[data-unlink]')) { W.emp = null; wzRender(); return; }
      if ((b = t.closest('[data-role]'))) {
        W.role = b.dataset.role; W.roleTouched = true; W.mods = new Set(MODW_DEF[W.role] || MODW.slice(0, 3)); W.limit = LIMIT_DEF[W.role] || 0;
        W.scope = ['owner', 'fm', 'aud'].includes(W.role) ? 'all' : 'branch';
        $$('[data-role]', dr).forEach((x) => x.classList.toggle('on', x === b));
        $('[data-preview]', dr).innerHTML = previewHtml(); icons($('[data-preview]', dr)); animPreview();
        $('.cu-wz-p .badge', dr) && $('.cu-wz-p .badge', dr).remove();
        return;
      }
      if ((b = t.closest('[data-all]'))) {
        const k = b.dataset.all, all = k === 'branches' ? ALLB : WHS;
        W[k] = W[k].size === all.length ? new Set() : new Set(all);
        wzRender(); return;
      }
      if ((b = t.closest('[data-sc]'))) { W.scope = b.dataset.sc; wzRender(); return; }
      if ((b = t.closest('[data-mm]'))) { W.mfaMethod = b.dataset.mm; return; }
      if ((b = t.closest('[data-hr]'))) { W.hours = b.dataset.hr; wzRender(); return; }
      if (!t.closest('[data-combo]')) { const l = $('[data-combo-list]', dr); if (l) l.classList.remove('open'); }
    });
    dr.addEventListener('focusin', (ev) => { if (ev.target.matches('[data-combo-q]')) comboRender(ev.target.value); });
    dr.addEventListener('input', (ev) => {
      const t = ev.target;
      if (t.matches('[data-combo-q]')) { comboRender(t.value); return; }
      const k = t.dataset.w;
      if (k && t.type !== 'checkbox') {
        W[k] = t.value;
        if (k === 'pwd') updMeter();
        if (k === 'limit') updLimit();
        if (W.errs[k]) { delete W.errs[k]; const er = t.parentElement.querySelector('.cu-err'); if (er) er.remove(); }
      }
    });
    dr.addEventListener('change', (ev) => {
      const t = ev.target;
      if (t.dataset.w && t.type === 'checkbox') { W[t.dataset.w] = t.checked; if (['mfa', 'ip', 'chEmail', 'chWa'].includes(t.dataset.w)) wzRender(); return; }
      if (t.dataset.w === 'timeout') W.timeout = t.value;
      if (t.dataset.br) { t.checked ? W.branches.add(t.dataset.br) : W.branches.delete(t.dataset.br); if (W.errs.branches) { delete W.errs.branches; const er = $('.cu-err', dr); if (er) er.remove(); } }
      if (t.dataset.wh) t.checked ? W.whs.add(t.dataset.wh) : W.whs.delete(t.dataset.wh);
      if (t.dataset.mod) { t.checked ? W.mods.add(t.dataset.mod) : W.mods.delete(t.dataset.mod); const s = t.closest('.cu-wz-box').querySelector('.lbl small'); if (s) s.textContent = `${W.mods.size} of ${MODW.length} on · customised`; }
    });
    dr.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && !ev.target.matches('textarea, button, [data-combo-q]')) { ev.preventDefault(); $('[data-wz="next"]', dr).click(); }
      if (ev.key === 'Enter' && ev.target.matches('[data-combo-q]')) { ev.preventDefault(); const o = $('.cu-combo-opt:not([disabled])', dr); if (o) o.click(); }
    });
  }
  function updMeter() {
    const m = $('[data-meter]', W.dr); if (!m) return;
    const sc = pwdScore(W.pwd);
    m.className = 'cu-meter s' + sc;
    $('span', m).textContent = ['Too weak', 'Weak', 'Fair', 'Strong', 'Very strong'][sc];
  }

  let cdTimer = null;
  function startCountdown() {
    if (cdTimer) return;
    cdTimer = setInterval(() => {
      let any = false;
      INVITES.forEach((iv) => {
        if (!iv.cool) return;
        const left = Math.ceil((iv.cool - Date.now()) / 1000);
        const el = U.sec && $(`[data-inv="${iv.id}"]`, U.sec);
        if (left > 0) { any = true; const s = el && $('[data-cd]', el); if (s) s.textContent = left; }
        else { iv.cool = 0; if (el) { const b = $('[data-inv-resend]', el); b.disabled = false; b.innerHTML = '<i data-lucide="send"></i>Resend'; icons(b); replay(b, 'pop'); } }
      });
      if (!any) { clearInterval(cdTimer); cdTimer = null; }
    }, 1000);
  }

  function bindUsers(sec) {
    let qT;
    sec.addEventListener('click', async (ev) => {
      const t = ev.target;
      let b;
      if ((b = t.closest('[data-u]'))) {
        const a = b.dataset.u;
        if (a === 'add') return openWizard();
        if (a === 'export') { await busy(b, 'Exporting…', 800); toast(`${USERS.length} users exported to Excel`); return; }
        if (a === 'mfa') {
          const n = USERS.filter((u) => u.status === 'active' && !u.mfa);
          if (!n.length) { toast('Everyone already uses MFA', { tone: 'info' }); return; }
          const ok = await confirmBox({ title: `Require MFA for ${n.length} users?`, text: `${n.map((u) => u.name).join(', ')} will be asked to enrol at their next sign-in.`, okLabel: 'Enforce MFA', icon: 'shield-check' });
          if (!ok) return;
          n.forEach((u) => (u.mfa = true));
          renderUsers();
          celebrate($('[data-uk-ring]', sec));
          toast(`MFA enforced for ${n.length} users · coverage 100%`, { tone: 'good', undo: () => { n.forEach((u) => (u.mfa = false)); renderUsers(); } });
        }
        return;
      }
      if ((b = t.closest('[data-urole]'))) { U.role = b.dataset.urole; renderUsers(); return; }
      if ((b = t.closest('[data-ust]'))) { U.status = b.dataset.ust; renderUsers(); return; }
      if ((b = t.closest('[data-u-dots]'))) { ev.stopPropagation(); const u = USERS.find((x) => x.id === b.closest('[data-uid]').dataset.uid); userMenu(b, u); return; }
      if ((b = t.closest('tr[data-uid]'))) { openUser(b.dataset.uid); return; }
      if ((b = t.closest('[data-inv-resend]'))) {
        const iv = INVITES.find((x) => x.id === b.closest('[data-inv]').dataset.inv);
        await busy(b, 'Sending', 700);
        iv.cool = Date.now() + 30000; iv.exp = 'Expires 8 Oct'; iv.tone = 'neutral'; iv.sent = 'Today';
        renderInvites(); renderUKpis();
        startCountdown();
        toast(`Invite resent to ${iv.email}`, { tone: 'good' });
        return;
      }
      if ((b = t.closest('[data-inv-copy]'))) {
        const iv = INVITES.find((x) => x.id === b.closest('[data-inv]').dataset.inv);
        try { await navigator.clipboard.writeText(`https://finsoft.pk/i/${iv.id}-${hash(iv.email).toString(36)}`); } catch (x) { /* file:// */ }
        b.classList.add('ok'); b.innerHTML = '<i data-lucide="check"></i>'; icons(b);
        setTimeout(() => { b.classList.remove('ok'); b.innerHTML = '<i data-lucide="link"></i>'; icons(b); }, 1500);
        toast('Invite link copied to clipboard');
        return;
      }
      if ((b = t.closest('[data-inv-revoke]'))) {
        const row = b.closest('[data-inv]'), idx = INVITES.findIndex((x) => x.id === row.dataset.inv), iv = INVITES[idx];
        row.style.height = row.offsetHeight + 'px';
        row.classList.add('out');
        await sleep(RM() ? 0 : 420);
        INVITES.splice(idx, 1);
        const pu = USERS.find((u) => u.email === iv.email && u.status === 'invited');
        if (pu) pu.status = 'removed';
        const uix = pu ? USERS.indexOf(pu) : -1;
        if (pu) USERS.splice(uix, 1);
        renderUsers();
        toast(`Invite for ${iv.email} revoked`, { tone: 'warn', undo: () => { INVITES.splice(idx, 0, iv); if (pu) { pu.status = 'invited'; USERS.splice(uix, 0, pu); } renderUsers({ flashInv: iv.id }); } });
        return;
      }
    });
    sec.addEventListener('keydown', (ev) => { const r = ev.target.closest && ev.target.closest('tr[data-uid]'); if (r && ev.key === 'Enter') openUser(r.dataset.uid); });
    sec.addEventListener('input', (ev) => { if (ev.target.matches('[data-u-q]')) { clearTimeout(qT); qT = setTimeout(() => { U.q = ev.target.value.trim(); renderUsers(); }, 150); } });
    sec.addEventListener('change', (ev) => { if (ev.target.matches('[data-u-branch]')) { U.branch = ev.target.value; renderUsers(); } });
  }

  onRoute('app/settings/users', usersMount, () => { renderUsers({ fromZero: true }); });

  /* ================================================================ ROLES screen */
  const RO = { sec: null, sel: 'fm', grp: 'fin', q: '' };
  const SOD_CA = ['vch', 'cash', 'bank', 'vpay', 'rcpt', 'sinv', 'bill', 'prun', 'loan', 'adj', 'grn', 'fa'];
  const SOD_CP = ['vch', 'cash', 'bank'];
  const has = (rid, mk, a) => ((DRAFT[rid] || {})[mk] || '').includes(a);
  const hasS = (rid, mk, a) => ((SAVED[rid] || {})[mk] || '').includes(a);
  function setP(rid, mk, a, on) { const s = DRAFT[rid][mk] || ''; DRAFT[rid][mk] = norm(on ? (s.includes(a) ? s : s + a) : s.replace(a, '')); }
  function conflicts(rid) {
    if (rid === 'owner') return [];
    const out = [];
    SOD_CA.forEach((mk) => { if (has(rid, mk, 'C') && has(rid, mk, 'A')) out.push({ mk, a: 'A', t: `Create & approve · ${MODS[mk].n}`, d: `The same person could raise and approve ${MODS[mk].n.toLowerCase()}. Add a second approver or remove Approve.` }); });
    SOD_CP.forEach((mk) => { if (has(rid, mk, 'C') && has(rid, mk, 'P')) out.push({ mk, a: 'P', t: `Create & post · ${MODS[mk].n}`, d: 'Entries could reach the ledger without an independent review. Remove Post or require approval first.' }); });
    if (has(rid, 'usr', 'C') && has(rid, 'rol', 'E')) out.push({ mk: 'rol', a: 'E', t: 'Create users & edit roles', d: 'This role could grant itself more access (privilege escalation).' });
    return out;
  }
  function dirtyCount() {
    let n = 0;
    ROLES.forEach((r) => {
      Object.keys(MODS).forEach((mk) => { const a = DRAFT[r.id][mk] || '', b = SAVED[r.id][mk] || ''; ACT.forEach(([x]) => { if (a.includes(x) !== b.includes(x)) n++; }); });
      Object.keys(META[r.id]).forEach((k) => { if (META[r.id][k] !== META_SAVED[r.id][k]) n++; });
    });
    return n;
  }
  const dirtyRoles = () => ROLES.filter((r) => Object.keys(MODS).some((mk) => (DRAFT[r.id][mk] || '') !== (SAVED[r.id][mk] || '')) || Object.keys(META[r.id]).some((k) => META[r.id][k] !== META_SAVED[r.id][k]));

  function rolesMount(sec) {
    RO.sec = sec;
    sec.innerHTML = `
      <div class="page-head">
        <div><div class="eyebrow">Settings / Roles &amp; Permissions</div><h1>Roles &amp; Permissions</h1><p>Control what each role can view, create, approve and post — with live segregation-of-duties checks.</p></div>
        <div class="cu-head-r"><span class="tagline">Trust, but verify</span><div class="head-actions"><button class="btn secondary" data-ro="dup"><i data-lucide="copy"></i>Duplicate role</button><button class="btn primary" data-ro="new"><i data-lucide="plus"></i>New role</button></div></div>
      </div>
      <div class="cu-ro">
        <aside class="panel cu-ro-list">
          <div class="cu-ro-lh"><h3>Roles</h3><span data-ro-cnt></span></div>
          <div data-plain-search><label class="search-field"><i data-lucide="search"></i><input data-ro-q placeholder="Search roles…"></label></div>
          <ul data-ro-list></ul>
          <div class="cu-ro-note"><i data-lucide="info"></i>System roles can be copied but not deleted.</div>
        </aside>
        <div class="cu-ro-main">
          <div class="panel cu-ro-head" data-ro-head></div>
          <div data-ro-sod></div>
          <div class="panel flush cu-mxp">
            <div class="panel-head"><div><h3>Permission matrix</h3><p>Click a column header or module name to toggle it all. Changed cells are marked.</p></div><div class="seg" data-ro-grps>${GROUPS.map((g) => `<button data-grp="${g.id}" class="${g.id === RO.grp ? 'active' : ''}"><i data-lucide="${g.icon}"></i>${g.name}</button>`).join('')}</div></div>
            <div class="cu-mx-wrap" data-ro-mx></div>
            <div class="cu-mx-legend"><span><i class="cu-ck on sm"></i>Granted</span><span><i class="cu-ck sm"></i>Not granted</span><span><i class="cu-na">—</i>Not applicable</span><span><i class="cu-chg-dot"></i>Unsaved change</span><span class="spacer"></span><span data-ro-last>Last changed by Ahmed Raza · 12 Sep 2026 15:22</span></div>
          </div>
          <div class="grid-2 cu-ro-bot">
            <div class="panel" data-ro-limits></div>
            <div class="panel" data-ro-sum></div>
          </div>
        </div>
      </div>
      <div class="cu-savebar" data-ro-bar role="status"><span class="cu-sb-ic"><i data-lucide="pencil-line"></i></span><div><b>Unsaved changes</b><small data-ro-n></small></div><button class="btn ghost sm" data-ro="discard">Discard</button><button class="btn lime sm" data-ro="save"><i data-lucide="check"></i>Save changes</button></div>
      <div class="overlay" id="cu-role-modal"><div class="modal cu-rmodal">
        <div class="modal-head"><div><h2 data-rm-title>New role</h2><p>Start from an existing role and adjust its permissions.</p></div><button class="x" data-close aria-label="Close"><i data-lucide="x"></i></button></div>
        <div class="form-grid c1">
          <label><span>Role name *</span><input data-rm-name placeholder="e.g. Branch Accountant" maxlength="40"><small class="cu-err" data-rm-err hidden>Give the role a unique name</small></label>
          <label><span>Description</span><textarea data-rm-desc rows="2" placeholder="What is this role for?"></textarea></label>
          <label><span>Copy permissions from</span><select data-rm-base>${ROLES.map((r) => `<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select></label>
        </div>
        <div class="cu-rm-prev" data-rm-prev></div>
        <div class="modal-foot"><button class="btn secondary" data-close>Cancel</button><button class="btn primary" data-ro="create"><i data-lucide="plus"></i>Create role</button></div>
      </div></div>`;
    bindRoles(sec);
    renderRoles(true);
    icons(sec);
  }

  function renderRoles(anim) {
    renderRoleList();
    renderRoleHead();
    renderMatrix(anim);
    renderSod();
    renderLimits();
    renderSum();
    renderBar();
  }

  function renderRoleList(flash) {
    const ul = $('[data-ro-list]', RO.sec), q = RO.q.toLowerCase();
    $('[data-ro-cnt]', RO.sec).textContent = `${ROLES.length} roles · ${ROLES.filter((r) => r.system).length} system`;
    const list = ROLES.filter((r) => !q || r.name.toLowerCase().includes(q));
    const dr = new Set(dirtyRoles().map((r) => r.id));
    ul.innerHTML = list.map((r, i) => `<li style="--i:${i}"><button class="cu-ro-item t-${r.tone} ${r.id === RO.sel ? 'active' : ''}${flash === r.id ? ' cu-new' : ''}" data-rsel="${r.id}"><span class="cu-rcard-ic"><i data-lucide="${r.icon}"></i></span><span class="cu-ro-it"><b>${esc(r.name)}${dr.has(r.id) ? '<i class="cu-chg-dot" title="Unsaved changes"></i>' : ''}</b><small>${r.system ? 'System · ' : r.custom ? 'Custom · ' : ''}${esc(r.desc.split(',')[0].split('.')[0])}</small></span><em>${roleCount(r.id)}</em></button></li>`).join('') || '<li class="cu-ro-none">No roles match</li>';
    icons(ul);
  }

  function renderRoleHead() {
    const r = roleById(RO.sel), box = $('[data-ro-head]', RO.sec), us = USERS.filter((u) => u.role === r.id && u.status !== 'removed');
    box.innerHTML = `<span class="cu-ro-hic t-${r.tone}"><i data-lucide="${r.icon}"></i></span>
      <div class="cu-ro-ht"><h2>${esc(r.name)} ${r.system ? '<span class="badge violet"><i data-lucide="lock"></i>System</span>' : r.custom ? '<span class="badge lime">Custom</span>' : ''}</h2><p>${esc(r.desc)}</p>
        <div class="cu-ro-users"><span class="avatar-stack">${us.slice(0, 5).map((u) => `<span class="avatar xs ${avCls(u.name)}" data-tip="${esc(u.name)}">${initials(u.name)}</span>`).join('')}${us.length > 5 ? `<span class="avatar xs dark">+${us.length - 5}</span>` : ''}</span><a href="#/app/settings/users" data-ro-users="${r.id}">${us.length ? `${us.length} user${us.length === 1 ? '' : 's'} with this role` : 'No users yet — assign from Users'}</a></div></div>
      <div class="cu-ro-hs"><label class="switch"><input type="checkbox" data-meta="branch" ${META[r.id].branch ? 'checked' : ''} ${r.id === 'owner' ? 'disabled' : ''}><i></i><span>Branch-restricted</span></label><small>${META[r.id].branch ? 'Users only see their own branches' : 'Users see every branch'}</small></div>`;
    replay(box, 'cu-swap');
    icons(box);
  }

  function renderMatrix(anim) {
    const g = GROUPS.find((x) => x.id === RO.grp), rid = RO.sel, box = $('[data-ro-mx]', RO.sec), locked = rid === 'owner';
    const colState = (a) => { const av = g.mods.filter((m) => m[2].includes(a)); const on = av.filter((m) => has(rid, m[0], a)).length; return av.length ? (on === av.length ? 'all' : on ? 'some' : 'none') : 'na'; };
    let d = 0;
    box.innerHTML = `<table class="cu-mx${locked ? ' locked' : ''}${anim ? ' anim' : ''}"><thead><tr><th class="cu-mx-mod">Module</th>${ACT.map(([a, l, ic]) => { const s = colState(a); return `<th><button class="cu-mx-col ${s}" data-col="${a}" ${s === 'na' ? 'disabled' : ''} title="Toggle ${l} for all ${g.name} modules"><i data-lucide="${ic}"></i><span>${l}</span><i class="cu-mx-cs"></i></button></th>`; }).join('')}<th class="cu-mx-cnt">Granted</th></tr></thead>
      <tbody>${g.mods.map(([mk, n, av]) => {
        const on = ACT.filter(([a]) => av.includes(a) && has(rid, mk, a)).length, tot = av.length;
        return `<tr><th class="cu-mx-mod"><button class="cu-mx-row" data-row="${mk}" title="Toggle the whole row"><b>${n}</b><small>${on === tot ? 'Full access' : on ? `${on} of ${tot}` : 'No access'}</small></button></th>${ACT.map(([a, l]) => {
          if (!av.includes(a)) return '<td><span class="cu-na">—</span></td>';
          const v = has(rid, mk, a), chg = v !== hasS(rid, mk, a);
          return `<td><button class="cu-ck${v ? ' on' : ''}${chg ? ' chg' : ''}" data-m="${mk}" data-a="${a}" style="--d:${d++}" aria-pressed="${v}" aria-label="${l} ${n}"><svg viewBox="0 0 24 24"><path d="M6 12.5l4 4L18 8"/></svg></button></td>`;
        }).join('')}<td class="cu-mx-cnt"><span class="cu-mx-meter"><i style="--w:${tot ? (on / tot) * 100 : 0}%"></i></span></td></tr>`;
      }).join('')}</tbody></table>`;
    icons(box);
  }

  function renderSod() {
    const box = $('[data-ro-sod]', RO.sec), c = conflicts(RO.sel);
    if (RO.sel === 'owner') { box.innerHTML = `<div class="banner info cu-sod"><i data-lucide="crown"></i><div><b>Owner bypasses segregation-of-duties checks</b><p>Keep the number of owners small — currently ${roleCount('owner')}.</p></div></div>`; icons(box); return; }
    box.innerHTML = c.length ? `<div class="cu-sods">${c.map((x, i) => `<div class="banner warn cu-sod" style="--i:${i}"><i data-lucide="triangle-alert"></i><div><b>${x.t}</b><p>${x.d}</p></div><button class="btn secondary sm" data-fix="${x.mk}:${x.a}"><i data-lucide="wand-sparkles"></i>Remove ${({ A: 'Approve', P: 'Post', E: 'Edit' })[x.a]}</button></div>`).join('')}</div>`
      : `<div class="banner good cu-sod ok"><i data-lucide="shield-check"></i><div><b>No segregation-of-duties conflicts</b><p>Nobody in this role can both raise and approve the same transaction.</p></div></div>`;
    icons(box);
  }

  function renderLimits() {
    const r = roleById(RO.sel), m = META[r.id], box = $('[data-ro-limits]', RO.sec), lk = r.id === 'owner';
    box.innerHTML = `<div class="panel-head"><div><h3>Data limits</h3><p>Caps applied on top of the matrix</p></div><span class="icon-well yellow"><i data-lucide="gauge"></i></span></div>
      <div class="cu-lim">
        <label class="cu-lim-row"><span>Max voucher amount</span><div class="cu-slider sm"><input type="range" min="0" max="10000000" step="50000" value="${m.maxv}" data-meta="maxv" ${lk ? 'disabled' : ''} aria-label="Max voucher amount"></div><output data-lim-out="maxv">${m.maxv ? rs(m.maxv, 0) : 'No approvals'}</output></label>
        <label class="cu-lim-row"><span>Max discount</span><div class="cu-slider sm"><input type="range" min="0" max="100" step="0.5" value="${m.disc}" data-meta="disc" ${lk ? 'disabled' : ''} aria-label="Max discount"></div><output data-lim-out="disc">${m.disc}%</output></label>
        <label class="cu-lim-row"><span>Back-dated posting</span><select data-meta="back" ${lk ? 'disabled' : ''}>${[[0, 'Not allowed'], [3, 'Up to 3 days'], [7, 'Up to 7 days'], [30, 'Up to 30 days'], [365, 'Any open period']].map(([v, l]) => `<option value="${v}" ${+m.back === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="cu-lim-row"><span>Salary visibility</span><select data-meta="salary" ${lk ? 'disabled' : ''}>${[['hidden', 'Hidden'], ['masked', 'Masked (except own)'], ['full', 'Full']].map(([v, l]) => `<option value="${v}" ${m.salary === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      </div>`;
    $$('input[type=range]', box).forEach((i) => i.style.setProperty('--sp', (i.value / i.max) * 100 + '%'));
    icons(box);
  }

  function renderSum() {
    const rid = RO.sel, box = $('[data-ro-sum]', RO.sec);
    const counts = ACT.map(([a, l]) => { const av = Object.values(MODS).filter((m) => m.av.includes(a)); return [l, av.filter((m) => has(rid, m.k, a)).length, av.length]; });
    const tot = counts.reduce((s, c) => s + c[1], 0), all = counts.reduce((s, c) => s + c[2], 0);
    box.innerHTML = `<div class="panel-head"><div><h3>Coverage</h3><p>Grants across all ${Object.keys(MODS).length} modules</p></div><b class="cu-cov" data-cov></b></div>
      <div class="cu-covs">${counts.map(([l, n, t], i) => `<div class="cu-cov-row" style="--i:${i}"><span>${l}</span><div class="cu-post-bar"><i style="--w:${(n / t) * 100}%"></i></div><b>${n}/${t}</b></div>`).join('')}</div>`;
    const c = $('[data-cov]', box); c.dataset.v = box._v || 0; tickN(c, Math.round((tot / all) * 100), '%'); box._v = Math.round((tot / all) * 100);
  }

  function renderBar() {
    const n = dirtyCount(), bar = $('[data-ro-bar]', RO.sec), roles = dirtyRoles();
    bar.classList.toggle('on', n > 0);
    if (n) $('[data-ro-n]', RO.sec).textContent = `${n} change${n === 1 ? '' : 's'} in ${roles.map((r) => r.name).join(', ')}`;
    renderRoleList();
  }

  function afterEdit(opts = {}) {
    renderMatrix(false);
    renderSod();
    renderSum();
    renderBar();
    if (opts.flashCells) opts.flashCells.forEach(([mk, a]) => { const c = $(`.cu-ck[data-m="${mk}"][data-a="${a}"]`, RO.sec); if (c) replay(c, 'pulse'); });
  }

  function selectRole(id) {
    if (RO.sel === id) return;
    RO.sel = id;
    renderRoleList(); renderRoleHead(); renderMatrix(true); renderSod(); renderLimits(); renderSum();
  }

  function openRoleModal(dup) {
    const m = $('#cu-role-modal');
    $('[data-rm-title]', m).textContent = dup ? `Duplicate ${roleById(RO.sel).name}` : 'New role';
    $('[data-rm-name]', m).value = dup ? `Copy of ${roleById(RO.sel).name}` : '';
    $('[data-rm-desc]', m).value = dup ? roleById(RO.sel).desc : '';
    $('[data-rm-base]', m).innerHTML = ROLES.map((r) => `<option value="${r.id}" ${r.id === (dup ? RO.sel : 'acc') ? 'selected' : ''}>${esc(r.name)}</option>`).join('');
    $('[data-rm-err]', m).hidden = true;
    rmPreview();
    FS.openModal('cu-role-modal');
    setTimeout(() => { const i = $('[data-rm-name]', m); i.focus(); i.select(); }, 120);
  }
  function rmPreview() {
    const m = $('#cu-role-modal'), b = $('[data-rm-base]', m).value;
    const n = Object.keys(MODS).reduce((s, k) => s + (DRAFT[b][k] || '').length, 0);
    $('[data-rm-prev]', m).innerHTML = `<i data-lucide="copy"></i><span>Copies <b>${n}</b> permissions and data limits from <b>${esc(roleById(b).name)}</b>${dirtyRoles().some((r) => r.id === b) ? ' (including unsaved changes)' : ''}.</span>`;
    icons($('[data-rm-prev]', m));
  }
  function createRole() {
    const m = $('#cu-role-modal'), name = $('[data-rm-name]', m).value.trim(), base = $('[data-rm-base]', m).value;
    if (!name || ROLES.some((r) => r.name.toLowerCase() === name.toLowerCase())) { $('[data-rm-err]', m).hidden = false; replay($('[data-rm-name]', m), 'shake'); return; }
    const br = roleById(base);
    const r = { id: 'c' + Date.now().toString(36), name, icon: br.icon === 'crown' ? 'shield' : br.icon, tone: 'lime', desc: $('[data-rm-desc]', m).value.trim() || `Custom role based on ${br.name}.`, custom: true };
    ROLES.push(r);
    SAVED[r.id] = clone(DRAFT[base]); DRAFT[r.id] = clone(DRAFT[base]);
    META_SAVED[r.id] = clone(META[base]); META[r.id] = clone(META[base]);
    if (base === 'owner') META_SAVED[r.id].branch = META[r.id].branch = true;
    FS.closeOverlay(m);
    RO.sel = r.id; RO.q = ''; $('[data-ro-q]', RO.sec).value = '';
    renderRoles(true);
    renderRoleList(r.id);
    celebrate($(`[data-rsel="${r.id}"]`, RO.sec));
    toast(`Role “${esc(name)}” created from ${esc(br.name)}`, { tone: 'good' });
  }

  function bindRoles(sec) {
    sec.addEventListener('click', async (ev) => {
      const t = ev.target;
      let b;
      if ((b = t.closest('[data-rsel]'))) return selectRole(b.dataset.rsel);
      if ((b = t.closest('[data-grp]'))) { RO.grp = b.dataset.grp; $$('[data-grp]', sec).forEach((x) => x.classList.toggle('active', x === b)); renderMatrix(true); return; }
      if ((b = t.closest('.cu-ck[data-m]'))) {
        if (RO.sel === 'owner') { toast('Owner always has full access', { tone: 'info' }); replay($('.cu-mx', sec), 'shake'); return; }
        const mk = b.dataset.m, a = b.dataset.a, v = !has(RO.sel, mk, a);
        setP(RO.sel, mk, a, v);
        if (v && a !== 'V') setP(RO.sel, mk, 'V', true);
        if (!v && a === 'V') ACT.forEach(([x]) => setP(RO.sel, mk, x, false));
        afterEdit({ flashCells: [[mk, a]] });
        return;
      }
      if ((b = t.closest('[data-col]'))) {
        if (RO.sel === 'owner') { toast('Owner always has full access', { tone: 'info' }); return; }
        const a = b.dataset.col, g = GROUPS.find((x) => x.id === RO.grp), av = g.mods.filter((m) => m[2].includes(a));
        const allOn = av.every((m) => has(RO.sel, m[0], a));
        av.forEach((m) => { setP(RO.sel, m[0], a, !allOn); if (!allOn && a !== 'V') setP(RO.sel, m[0], 'V', true); if (allOn && a === 'V') ACT.forEach(([x]) => setP(RO.sel, m[0], x, false)); });
        afterEdit({ flashCells: av.map((m) => [m[0], a]) });
        toast(`${ACT.find((x) => x[0] === a)[1]} ${allOn ? 'removed from' : 'granted on'} ${av.length} ${g.name} modules`, { tone: 'info', ms: 2000 });
        return;
      }
      if ((b = t.closest('[data-row]'))) {
        if (RO.sel === 'owner') { toast('Owner always has full access', { tone: 'info' }); return; }
        const mk = b.dataset.row, av = MODS[mk].av.split(''), allOn = av.every((a) => has(RO.sel, mk, a));
        av.forEach((a) => setP(RO.sel, mk, a, !allOn));
        afterEdit({ flashCells: av.map((a) => [mk, a]) });
        return;
      }
      if ((b = t.closest('[data-fix]'))) {
        const [mk, a] = b.dataset.fix.split(':');
        const ban = b.closest('.cu-sod'); ban.classList.add('out');
        await sleep(RM() ? 0 : 300);
        setP(RO.sel, mk, a, false);
        if (MODS[mk].g !== RO.grp) { RO.grp = MODS[mk].g; $$('[data-grp]', sec).forEach((x) => x.classList.toggle('active', x.dataset.grp === RO.grp)); }
        afterEdit({ flashCells: [[mk, a]] });
        toast(`${({ A: 'Approve', P: 'Post', E: 'Edit' })[a]} removed from ${MODS[mk].n}`, { tone: 'good' });
        return;
      }
      if ((b = t.closest('[data-ro-users]'))) { U.role = b.dataset.roUsers; U.status = 'all'; return; }
      if ((b = t.closest('[data-ro]'))) {
        const a = b.dataset.ro;
        if (a === 'new') openRoleModal(false);
        if (a === 'dup') openRoleModal(true);
        if (a === 'create') createRole();
        if (a === 'discard') {
          const n = dirtyCount();
          ROLES.forEach((r) => { DRAFT[r.id] = clone(SAVED[r.id]); META[r.id] = clone(META_SAVED[r.id]); });
          renderRoleHead(); renderMatrix(true); renderSod(); renderLimits(); renderSum(); renderBar();
          toast(`${n} change${n === 1 ? '' : 's'} discarded`, { tone: 'info' });
        }
        if (a === 'save') {
          const roles = dirtyRoles().map((r) => r.name);
          await busy(b, 'Saving…', RM() ? 50 : 900);
          ROLES.forEach((r) => { SAVED[r.id] = clone(DRAFT[r.id]); META_SAVED[r.id] = clone(META[r.id]); });
          $('[data-ro-last]', sec).textContent = 'Last changed by Sana Javed · just now';
          afterEdit();
          celebrate(b);
          toast(`Permissions saved for ${roles.join(', ')} · affected users updated`, { tone: 'good' });
        }
      }
    });
    sec.addEventListener('input', (ev) => {
      const t = ev.target;
      if (t.matches('[data-ro-q]')) { RO.q = t.value.trim(); renderRoleList(); return; }
      if (t.matches('[data-rm-name]')) $('[data-rm-err]', sec).hidden = true;
      if (t.matches('input[type=range][data-meta]')) {
        const k = t.dataset.meta, v = +t.value; META[RO.sel][k] = v;
        t.style.setProperty('--sp', (v / t.max) * 100 + '%');
        $(`[data-lim-out="${k}"]`, sec).innerHTML = k === 'disc' ? v + '%' : v ? rs(v, 0) : 'No approvals';
        renderBar();
      }
    });
    sec.addEventListener('change', (ev) => {
      const t = ev.target;
      if (t.matches('[data-rm-base]')) return rmPreview();
      if (t.matches('[data-meta]') && t.type !== 'range') {
        const k = t.dataset.meta;
        META[RO.sel][k] = t.type === 'checkbox' ? t.checked : k === 'back' ? +t.value : t.value;
        if (k === 'branch') { const s = t.closest('.cu-ro-hs').querySelector('small'); s.textContent = t.checked ? 'Users only see their own branches' : 'Users see every branch'; }
        renderBar();
      }
    });
    sec.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && ev.target.matches('[data-rm-name]')) { ev.preventDefault(); createRole(); } });
  }

  onRoute('app/settings/roles', rolesMount, () => { renderRoles(true); });
})();
