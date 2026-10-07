/* =====================================================================
   98-books.js : Cash Book (app/cash/book) + Bank Book (app/bank/book)
   Markup shells live in 47-books.html, styles in 18-books.css (.cb- / .bb-)
   ===================================================================== */
(function () {
  'use strict';

  /* ---------------------------------------------------------------- helpers */
  var RM = function () { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var grp = function (n, d) { d = d == null ? 2 : d; return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); };
  var r2 = function (n) { return Math.round(n * 100) / 100; };
  function money(n, o) {
    n = Math.abs(r2(n));
    if (window.FS && typeof FS.money === 'function') return FS.money(n, o);
    var dec = o && o.dec != null ? o.dec : 2, s = grp(n, dec).split('.');
    return 'Rs ' + s[0] + (s[1] ? '<span class="dec">.' + s[1] + '</span>' : '');
  }
  // signed money: "+Rs 1,000.00" / "−Rs 1,000.00"
  function smoney(n, forceSign) {
    var sign = n < 0 ? '−' : (forceSign && n > 0 ? '+' : '');
    return (sign ? '<span class="sg">' + sign + '</span>' : '') + money(n);
  }
  function icons(root) {
    try {
      if (window.FS && FS.icons) FS.icons(root);
      else if (window.lucide) lucide.createIcons();
    } catch (e) { /* icons are cosmetic */ }
  }
  function toast(msg, o) { if (window.FS && FS.toast) FS.toast(msg, o || {}); else console.log('[toast]', msg); }
  function menu(anchor, items) { if (window.FS && FS.menu) FS.menu(anchor, items); }
  function tween(el, to, opt) {
    if (!el) return;
    opt = opt || {};
    var fmt = opt.fmt || function (v) { return money(v); };
    var from = opt.from != null ? opt.from : (el.dataset.v != null ? +el.dataset.v : 0);
    el.dataset.v = to;
    cancelAnimationFrame(el._raf);
    if (RM() || from === to) { el.innerHTML = fmt(to); return; }
    var dur = opt.dur || 900, t0 = performance.now();
    var step = function (now) {
      var k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.innerHTML = fmt(k === 1 ? to : from + (to - from) * e);
      if (k < 1) el._raf = requestAnimationFrame(step);
    };
    el._raf = requestAnimationFrame(step);
  }
  function enterAnim(box, on) {
    box.classList.remove('enter');
    clearTimeout(box._et);
    if (!on || RM()) return;
    void box.offsetWidth;
    box.classList.add('enter');
    box._et = setTimeout(function () { box.classList.remove('enter'); }, 1100);
  }
  function replay(el, cls) { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
  function morphHeight(box, mutate, dur) {
    var h0 = box.offsetHeight;
    mutate();
    var h1 = box.offsetHeight;
    if (RM() || !box.animate || Math.abs(h1 - h0) < 2) return;
    box.style.overflow = 'clip';
    var a = box.animate([{ height: h0 + 'px' }, { height: h1 + 'px' }], { duration: dur || 320, easing: 'cubic-bezier(.2,.8,.2,1)' });
    a.onfinish = a.oncancel = function () { box.style.overflow = ''; };
  }

  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function D(s) { var p = s.split('-').map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2])); }
  function dParts(s) { var x = D(s); return { d: String(x.getUTCDate()).padStart(2, '0'), my: MON[x.getUTCMonth()] + ' ' + x.getUTCFullYear(), wd: WD[x.getUTCDay()] }; }
  function dShort(s) { var p = dParts(s); return p.d + ' ' + p.my; }
  function t12(t) { if (!t) return ''; var p = t.split(':').map(Number), h = p[0] % 12 || 12; return h + ':' + String(p[1]).padStart(2, '0') + (p[0] < 12 ? ' AM' : ' PM'); }

  // Register a route hook; survives FS loading after this partial.
  function register(route, fn) {
    var done = false;
    var tryReg = function () {
      if (done) return true;
      if (window.FS && typeof FS.onEnter === 'function') { FS.onEnter(route, fn); done = true; return true; }
      return false;
    };
    if (tryReg()) return;
    document.addEventListener('DOMContentLoaded', function () {
      if (!tryReg()) {
        var chk = function () {
          if ((location.hash || '').replace(/^#\/?/, '') === route) {
            var s = document.querySelector('.screen[data-route="' + route + '"]');
            if (s) fn(s, route, !s.dataset.booksMounted);
          }
        };
        window.addEventListener('hashchange', chk);
        chk();
      } else {
        // FS registered late: if the route is already showing, mount now.
        var s = document.querySelector('.screen[data-route="' + route + '"]');
        if (s && (location.hash || '').replace(/^#\/?/, '') === route && !s.dataset.booksMounted) fn(s, route, true);
      }
    });
  }

  /* =====================================================================
     CASH BOOK
     ===================================================================== */
  var TODAY = '2026-10-01';
  var ACC = {
    drawer: { n: 'Main Cash Drawer', s: 'Lahore HQ', short: 'Cash drawer', t: 'cash', icon: 'banknote' },
    petty: { n: 'Petty Cash', s: 'Lahore HQ', short: 'Petty cash', t: 'cash', icon: 'coins' },
    meezan: { n: 'Meezan Bank', s: 'Current · 0123', short: 'Meezan 0123', t: 'bank', icon: 'landmark' },
    hbl: { n: 'HBL', s: 'Current · 8721', short: 'HBL 8721', t: 'bank', icon: 'landmark' },
    ubl: { n: 'UBL', s: 'Current · 2294', short: 'UBL 2294', t: 'bank', icon: 'landmark' },
    alfalah: { n: 'Bank Alfalah', s: 'Current · 5510', short: 'Alfalah 5510', t: 'bank', icon: 'landmark' }
  };
  var CASH_ACC = ['drawer', 'petty'], BANK_ACC = ['meezan', 'hbl', 'ubl', 'alfalah'];
  var BASE = { drawer: 184250, petty: 27500, meezan: 1245600, hbl: 1590150, ubl: 412300, alfalah: 286950 };
  var MODES = {
    cash: ['Cash', 'Card'],
    bank: ['Online / IBFT', 'RAAST', 'Bank transfer', 'Debit card'],
    cheque: ['Cheque']
  };
  var CAT_IN = ['Sales receipts', 'Customer receipts', 'Other income', 'Loan / capital', 'Refund received'];
  var CAT_OUT = ['Office supplies', 'Utilities', 'Courier & postage', 'Staff welfare', 'Salary advance', 'Fuel & conveyance', 'Repairs & maintenance', 'Vendor payment'];
  var CAT_ICON = {
    'Sales receipts': 'receipt', 'Customer receipts': 'users', 'Other income': 'coins', 'Loan / capital': 'building-2', 'Refund received': 'repeat',
    'Office supplies': 'file-text', 'Utilities': 'zap', 'Courier & postage': 'truck', 'Staff welfare': 'coffee', 'Salary advance': 'user',
    'Fuel & conveyance': 'fuel', 'Repairs & maintenance': 'wrench', 'Vendor payment': 'building-2', 'Bank deposit': 'landmark', 'Transfer': 'arrow-left-right', 'Reversal': 'repeat'
  };
  var CUSTOMERS = ['Shifa International', 'City Mart Superstores', 'Fatima Group', 'Packages Ltd', 'Hashoo Hotels', 'Al-Fatah Stores', 'Metro Cash & Carry', 'Engro Foods', 'Lucky Cement', 'Interloop Ltd'];
  var VENDORS = ['Pak Suzuki Spares', 'Nishat Mills', 'Siemens Pakistan', 'Habib Packaging', 'Shan Foods', 'PTCL', 'K-Electric', 'LESCO', 'Daraz Business', 'TCS Logistics'];
  var DRAWN = ['HBL', 'MCB Bank', 'UBL', 'Meezan Bank', 'Allied Bank', 'Bank Alfalah', 'Faysal Bank', 'Bank Al Habib', 'Standard Chartered'];
  var TIPS = {
    cash: 'Use quick entry options for faster data entry.',
    bank: 'Bank Only posts BRV / BPV vouchers straight to the selected bank.',
    transfer: 'Transfers post a contra JV, so no income or expense is booked.',
    cheque: 'Mark post-dated cheques as PDC to track them in the cheque register.'
  };

  // date, time, dir, title, party, voucher, category, amount, status
  var SEED = [
    ['2026-09-25', '09:40', 'in', 'Walk-in sale receipt', 'Walk-in Customer', 'CRV-2026-000405', 'Sales receipts', 38500],
    ['2026-09-25', '12:15', 'out', 'Courier charges', 'TCS Logistics', 'CPV-2026-000281', 'Courier & postage', 2850],
    ['2026-09-25', '16:05', 'out', 'Office tea & refreshments', 'Staff welfare', 'CPV-2026-000282', 'Staff welfare', 1640],
    ['2026-09-26', '11:20', 'in', 'Counter sale receipt', 'Al-Fatah Stores', 'CRV-2026-000406', 'Sales receipts', 56200],
    ['2026-09-26', '15:45', 'out', 'Salary advance', 'Bilal Khan · EMP-0042', 'CPV-2026-000283', 'Salary advance', 15000],
    ['2026-09-28', '10:05', 'out', 'Cash deposited to bank', 'Meezan Bank · 0123', 'CPV-2026-000284', 'Bank deposit', 120000],
    ['2026-09-28', '13:30', 'in', 'Receipt against INV-2026-000118', 'City Mart Superstores', 'CRV-2026-000407', 'Customer receipts', 72000],
    ['2026-09-28', '17:10', 'out', 'Electricity bill · Sep', 'LESCO', 'CPV-2026-000285', 'Utilities', 18420],
    ['2026-09-29', '10:50', 'in', 'Walk-in sale receipt', 'Walk-in Customer', 'CRV-2026-000408', 'Sales receipts', 24750],
    ['2026-09-29', '14:25', 'out', 'Fuel & conveyance', 'Ali Haider', 'CPV-2026-000286', 'Fuel & conveyance', 4300],
    ['2026-09-30', '09:55', 'in', 'Scrap & packing material sale', 'Kashif Ali', 'CRV-2026-000409', 'Other income', 9800],
    ['2026-09-30', '12:40', 'out', 'Stationery & printer toner', 'Daraz Business', 'CPV-2026-000287', 'Office supplies', 3275],
    ['2026-09-30', '16:20', 'out', 'Internet bill · Sep', 'PTCL', 'CPV-2026-000288', 'Utilities', 6499],
    ['2026-10-01', '10:10', 'in', 'Walk-in sale receipt', 'Walk-in Customer', 'CRV-2026-000410', 'Sales receipts', 31600],
    ['2026-10-01', '11:35', 'out', 'Courier charges', 'TCS Logistics', 'CPV-2026-000289', 'Courier & postage', 1950],
    ['2026-10-01', '12:20', 'in', 'Receipt against INV-2026-000121', 'Hashoo Hotels', 'CRV-2026-000411', 'Customer receipts', 45000, 'Draft'],
    ['2026-10-01', '13:05', 'out', 'Staff lunch · warehouse', 'Staff welfare', 'CPV-2026-000290', 'Staff welfare', 3800, 'Draft']
  ];
  var DEN = [
    { v: 5000, l: '5,000', c: 'var(--warn)' }, { v: 1000, l: '1,000', c: 'var(--blue)' }, { v: 500, l: '500', c: 'var(--good)' },
    { v: 100, l: '100', c: 'var(--danger)' }, { v: 50, l: '50', c: 'var(--violet)' }, { v: 20, l: '20', c: 'var(--orange)' },
    { v: 10, l: '10', c: 'var(--primary)' }, { v: 1, l: 'Coins', c: 'var(--muted)', coin: true }
  ];

  var S = null, CB = null; // state + root

  function blankForm(kind, mode) {
    var bank = mode === 'bank' || mode === 'cheque';
    return {
      date: TODAY, time: '14:30',
      party: kind === 'in' ? 'Walk-in Customer' : '', pick: '',
      cat: kind === 'in' ? 'Sales receipts' : 'Office supplies',
      acct: bank ? 'meezan' : 'drawer', mode: MODES[bank ? mode : 'cash'][0],
      ref: '', amt: '', notes: '', file: '',
      chq: '', chqDate: TODAY, drawn: kind === 'in' ? 'MCB Bank' : 'Meezan Bank', pdc: false
    };
  }
  function blankTr() { return { from: 'drawer', to: 'meezan', date: TODAY, ref: '', amt: '', notes: '' }; }

  function initState() {
    var uid = 0;
    S = {
      mode: 'cash',
      entries: SEED.map(function (r) {
        return { id: 'e' + (++uid), date: r[0], time: r[1], dir: r[2], title: r[3], party: r[4], no: r[5], cat: r[6], amt: r[7], status: r[8] || 'Posted', acct: 'drawer', icon: CAT_ICON[r[6]] || 'receipt' };
      }),
      uid: uid,
      seq: { CRV: 412, CPV: 291, BRV: 233, BPV: 318, JV: 46 },
      f: { q: '', dir: 'all', from: '2026-09-25', to: TODAY },
      forms: { in: blankForm('in', 'cash'), out: blankForm('out', 'cash'), tr: blankTr() },
      count: { 5000: 40, 1000: 58, 500: 42, 100: 46, 50: 9, 20: 11, 10: 7, 1: 6 },
      newest: 'e' + uid,
      closed: false
    };
  }

  // balance effect(s) of an entry
  function legs(e) {
    if (e.dir === 'tr') return [{ a: e.from, v: -e.amt }, { a: e.to, v: e.amt }];
    return [{ a: e.acct, v: e.dir === 'in' ? e.amt : -e.amt }];
  }
  function drawerDelta(e) { return legs(e).reduce(function (s, l) { return s + (l.a === 'drawer' ? l.v : 0); }, 0); }
  function balances() {
    var b = Object.assign({}, BASE);
    S.entries.forEach(function (e) { legs(e).forEach(function (l) { b[l.a] = r2(b[l.a] + l.v); }); });
    return b;
  }
  function sorted() { return S.entries.slice().sort(function (a, b) { return (a.date + a.time + a.id.padStart(6, '0')).localeCompare(b.date + b.time + b.id.padStart(6, '0')); }); }
  // how an entry reads in the drawer ledger: 'in' | 'out' | 'off'
  function ledgerDir(e) {
    var d = drawerDelta(e);
    return d > 0 ? 'in' : d < 0 ? 'out' : 'off';
  }
  function nextNo(p) { return p + '-2026-' + String(S.seq[p]++).padStart(6, '0'); }

  /* ------------------------------------------------------------ skeleton */
  function cbSkeleton() {
    return '' +
      '<header class="cb-head">' +
        '<div><h1>Cash Book Entry</h1><p>Record cash movement quickly and keep your books up to date</p></div>' +
        '<span class="cb-tag" aria-hidden="true">Simple Accounting<br>for a Brighter Tomorrow.</span>' +
      '</header>' +
      '<div class="cb-kpis">' +
        '<article class="main"><span class="cb-kic"><i data-lucide="wallet"></i></span><div><small>Total Liquid Cash</small><b data-kv="total"></b><em><i data-lucide="trending-up"></i>+12.5% from last month</em></div><i class="cb-bars" aria-hidden="true"><u></u><u></u><u></u></i></article>' +
        '<article data-acc="drawer"><span class="cb-kic g"><i data-lucide="banknote"></i></span><div><small>Main Cash Drawer</small><b data-kv="drawer"></b><em data-kn="drawer">Lahore HQ</em></div></article>' +
        '<article data-acc="bank"><span class="cb-kic b"><i data-lucide="landmark"></i></span><div><small>Bank Account</small><b data-kv="bank"></b><em>4 accounts · Meezan, HBL, UBL, Alfalah</em></div></article>' +
        '<article data-acc="petty"><span class="cb-kic y"><i data-lucide="coins"></i></span><div><small>Petty Cash</small><b data-kv="petty"></b><em>Imprest Rs 30,000</em></div></article>' +
      '</div>' +
      '<div class="cb-quick">' +
        '<b>Quick Entry:</b>' +
        '<div class="cb-pills" role="tablist" aria-label="Quick entry mode"><span class="cb-thumb" aria-hidden="true"></span>' +
          '<button type="button" role="tab" data-mode="cash" class="active" aria-selected="true"><i data-lucide="banknote"></i>Cash Only</button>' +
          '<button type="button" role="tab" data-mode="bank" aria-selected="false"><i data-lucide="landmark"></i>Bank Only</button>' +
          '<button type="button" role="tab" data-mode="transfer" aria-selected="false"><i data-lucide="arrow-left-right"></i>Transfer</button>' +
          '<button type="button" role="tab" data-mode="cheque" aria-selected="false"><i data-lucide="wallet-cards"></i>Cheque</button>' +
        '</div>' +
        '<span class="cb-tip"><span class="cb-tip-ic"><i data-lucide="lightbulb"></i></span><b>Tip:</b><span data-tip>' + TIPS.cash + '</span></span>' +
      '</div>' +
      '<div class="cb-panels"></div>' +
      '<div class="cb-lower">' +
        '<section class="cb-ledger">' +
          '<div class="cb-lh">' +
            '<div class="cb-lh-t"><span class="cb-lh-ic"><i data-lucide="book-open"></i></span><div><h3>Cash Ledger · Lahore HQ drawer</h3><p data-lsub></p></div></div>' +
            '<div class="cb-ltools">' +
              '<label class="cb-search"><i data-lucide="search"></i><input type="search" data-lq placeholder="Search voucher, party, category…" aria-label="Search ledger"></label>' +
              '<div class="cb-seg" role="tablist" aria-label="Direction"><span class="cb-seg-thumb" aria-hidden="true"></span><button type="button" data-dir="all" class="active">All</button><button type="button" data-dir="in">In</button><button type="button" data-dir="out">Out</button></div>' +
              '<div class="cb-range"><i data-lucide="calendar-range"></i><input type="date" data-r="from" min="2026-09-25" max="2026-10-01" value="2026-09-25" aria-label="From date"><span>→</span><input type="date" data-r="to" min="2026-09-25" max="2026-10-01" value="2026-10-01" aria-label="To date"></div>' +
            '</div>' +
          '</div>' +
          '<div class="bb-colhead"><span>Transaction</span><span>Receipt (+)</span><span>Payment (−)</span><span>Running balance</span><span>Status</span></div>' +
          '<div class="bb-ledger" data-tl></div>' +
        '</section>' +
        '<aside class="cb-rail">' +
          '<div class="cb-card cb-cc" data-cc></div>' +
          '<div class="cb-card cb-glance" data-glance></div>' +
        '</aside>' +
      '</div>';
  }

  /* --------------------------------------------------------------- forms */
  function opt(list, sel, ph) {
    return (ph != null ? '<option value="">' + esc(ph) + '</option>' : '') +
      list.map(function (o) {
        var v = typeof o === 'string' ? o : o.v, l = typeof o === 'string' ? o : o.l;
        return '<option value="' + esc(v) + '"' + (v === sel ? ' selected' : '') + '>' + esc(l) + '</option>';
      }).join('');
  }
  function accOpts(keys, sel) { return opt(keys.map(function (k) { return { v: k, l: ACC[k].n + ' · ' + ACC[k].s }; }), sel); }
  var TRAIL_DOWN = ''; // selects use the global v2 chevron
  function fld(o) {
    var well = o.well || '<i data-lucide="' + o.icon + '"></i>';
    return '<label class="cb-f' + (o.full ? ' full' : '') + (o.cls ? ' ' + o.cls : '') + '" data-k="' + o.k + '">' +
      '<span class="cb-l">' + o.label + (o.req ? '<em>*</em>' : '') + (o.hint ? '<small>' + o.hint + '</small>' : '') + '</span>' +
      '<span class="cb-in"><span class="cb-well">' + well + '</span>' + o.input + '</span>' +
      '<small class="cb-err" aria-live="polite"></small></label>';
  }
  function gl(label, first, cls) { return '<div class="cb-group-label' + (first ? ' first' : '') + (cls ? ' ' + cls : '') + '">' + label + '</div>'; }

  function panelHTML(kind) {
    var out = kind === 'out', f = S.forms[kind], m = S.mode, P = kind + '.';
    var bankish = m === 'bank' || m === 'cheque';
    var sub = {
      cash: out ? 'Record money paid out from your business' : 'Record money received into your business',
      bank: out ? 'Record a payment made from your bank account' : 'Record money received into your bank account',
      cheque: out ? 'Issue a cheque to a vendor or for an expense' : 'Receive a customer cheque into a bank account'
    }[m];
    var accKeys = bankish ? BANK_ACC : CASH_ACC;
    var h = '<form class="cb-panel ' + kind + '" data-kind="' + kind + '" novalidate>' +
      '<div class="cb-ph">' +
        '<span class="cb-ph-icon"><i data-lucide="' + (out ? 'arrow-up-from-line' : 'arrow-down-to-line') + '"></i></span>' +
        '<div><h2>' + (out ? 'Cash Out' : 'Cash In') + '</h2><p>' + sub + '</p></div>' +
        '<span class="cb-ph-badge">' + (out ? 'Manage your expenses' : 'Increase your cash flow') + '</span>' +
      '</div>' +
      '<div class="cb-grid">' +
        gl('When', true) +
        fld({ k: 'date', label: 'Date', req: 1, icon: 'calendar', input: '<input type="date" data-b="' + P + 'date" value="' + esc(f.date) + '">' }) +
        fld({ k: 'time', label: 'Time', req: 1, icon: 'clock', input: '<input type="time" data-b="' + P + 'time" value="' + esc(f.time) + '">' }) +
        gl('Who') +
        fld({ k: 'party', label: out ? 'Paid To / Party' : 'Received From / Party', req: 1, icon: 'user', full: 1,
          input: '<input data-b="' + P + 'party" value="' + esc(f.party) + '" placeholder="' + (out ? 'e.g. Daraz Business' : 'Walk-in Customer') + '" autocomplete="off"><span class="cb-trail"><i data-lucide="chevron-right"></i></span>' }) +
        fld({ k: 'pick', label: out ? 'Vendor' : 'Customer', icon: 'users', full: 1, hint: 'fills the party',
          input: '<select data-b="' + P + 'pick" class="' + (f.pick ? '' : 'ph') + '">' + opt(out ? VENDORS : CUSTOMERS, f.pick, out ? 'Select a vendor (e.g. Daraz Business)' : 'Select a customer (e.g. City Mart Superstores)') + '</select>' + TRAIL_DOWN }) +
        gl('What') +
        fld({ k: 'cat', label: 'Category', req: 1, icon: 'tag', input: '<select data-b="' + P + 'cat">' + opt(out ? CAT_OUT : CAT_IN, f.cat) + '</select>' + TRAIL_DOWN }) +
        fld({ k: 'acct', label: bankish ? 'Bank Account' : 'Account', req: 1, icon: bankish ? 'landmark' : 'wallet-cards', input: '<select data-b="' + P + 'acct">' + accOpts(accKeys, f.acct) + '</select>' + TRAIL_DOWN }) +
        fld({ k: 'mode', label: 'Payment Mode', req: 1, icon: 'credit-card', input: '<select data-b="' + P + 'mode">' + opt(MODES[bankish ? m : 'cash'], f.mode) + '</select>' + TRAIL_DOWN }) +
        fld({ k: 'ref', label: 'Reference No.', icon: 'file-text', input: '<input data-b="' + P + 'ref" value="' + esc(f.ref) + '" placeholder="' + (out ? 'e.g. BILL-2026-000214' : 'e.g. INV-2026-000123') + '">' });
    if (m === 'cheque') {
      h += '<div class="cb-chq' + (S._chqEnter ? ' enter' : '') + '"><div class="cb-chq-in">' +
        gl('Cheque') +
        fld({ k: 'chq', label: 'Cheque No.', req: 1, icon: 'hash', input: '<input data-b="' + P + 'chq" value="' + esc(f.chq) + '" placeholder="e.g. 004419" inputmode="numeric">' }) +
        fld({ k: 'chqDate', label: 'Cheque Date', req: 1, icon: 'calendar', input: '<input type="date" data-b="' + P + 'chqDate" value="' + esc(f.chqDate) + '">' }) +
        fld({ k: 'drawn', label: out ? 'Drawn On (our bank)' : 'Drawn On Bank', icon: 'building-2', input: '<select data-b="' + P + 'drawn">' + opt(DRAWN, f.drawn) + '</select>' + TRAIL_DOWN }) +
        '<div class="cb-f cb-pdc"><span class="cb-l">Post-dated?</span>' +
          '<label class="cb-toggle"><input type="checkbox" data-b="' + P + 'pdc"' + (f.pdc ? ' checked' : '') + '><i></i><span><b>PDC</b><small>Hold until cheque date</small></span></label></div>' +
        '</div></div>';
    }
    h += gl('Amount') +
        fld({ k: 'amt', label: 'Amount', req: 1, full: 1, cls: 'amount-f', well: '<b class="cb-rs">Rs</b>', input: '<input type="text" inputmode="decimal" data-b="' + P + 'amt" value="' + esc(f.amt) + '" placeholder="0.00" autocomplete="off">' }) +
        gl('Notes') +
        fld({ k: 'notes', label: 'Notes / Narration', icon: 'message-square-text', full: 1, input: '<input data-b="' + P + 'notes" value="' + esc(f.notes) + '" placeholder="' + (out ? 'e.g. Office supplies purchase, bill no., etc.' : 'e.g. Payment for invoice, customer name, etc.') + '">' }) +
      '</div>' +
      '<div class="cb-attach"><span class="cb-l">Receipt / Attachment</span>' +
        '<label class="cb-drop' + (f.file ? ' has' : '') + '"><span class="cb-drop-icon"><i data-lucide="' + (f.file ? 'circle-check' : 'cloud-upload') + '"></i></span>' +
          '<span class="cb-drop-body"><b>' + (f.file ? esc(f.file) : 'Drop your receipt here, or <u>browse</u>') + '</b><small>' + (f.file ? 'Attached · click to replace' : 'PDF · JPG · PNG · Max 5 MB') + '</small></span>' +
          '<input type="file" hidden accept=".pdf,.jpg,.jpeg,.png" data-file="' + kind + '"></label></div>' +
      '<button class="cb-save" type="submit"><i data-lucide="save"></i>' + (out ? 'Save Cash Out' : 'Save Cash In') + '</button>' +
    '</form>';
    return h;
  }

  function trHTML() {
    var f = S.forms.tr, all = CASH_ACC.concat(BANK_ACC);
    var card = function (side) {
      var k = f[side];
      return '<div class="cb-tr-card ' + side + '" data-k="' + side + '">' +
        '<span class="cb-tr-k">' + (side === 'from' ? 'From account' : 'To account') + '</span>' +
        '<div class="cb-tr-sel"><span class="cb-tr-ic"><i data-lucide="' + ACC[k].icon + '"></i></span>' +
          '<select data-b="tr.' + side + '">' + accOpts(all, k) + '</select>' + TRAIL_DOWN + '</div>' +
        '<div class="cb-tr-bal"><span>Available</span><b data-trbal="' + side + '"></b></div>' +
        '<div class="cb-tr-bal after"><span>After transfer</span><b data-trafter="' + side + '"></b></div>' +
        '<small class="cb-err" aria-live="polite"></small>' +
      '</div>';
    };
    return '<form class="cb-panel tr" data-kind="tr" novalidate>' +
      '<div class="cb-ph">' +
        '<span class="cb-ph-icon"><i data-lucide="arrow-left-right"></i></span>' +
        '<div><h2>Transfer between accounts</h2><p>Move money between cash drawers and bank accounts. Posts a contra journal voucher.</p></div>' +
        '<span class="cb-ph-badge">Contra entry · JV</span>' +
      '</div>' +
      '<div class="cb-tr-flow">' + card('from') +
        '<div class="cb-tr-mid"><span class="cb-tr-line"></span><button type="button" class="cb-swap" aria-label="Swap accounts" title="Swap accounts"><i data-lucide="arrow-left-right"></i></button><span class="cb-tr-line"></span></div>' +
        card('to') + '</div>' +
      '<div class="cb-grid c4">' +
        fld({ k: 'date', label: 'Date', req: 1, icon: 'calendar', input: '<input type="date" data-b="tr.date" value="' + esc(f.date) + '">' }) +
        fld({ k: 'ref', label: 'Reference No.', icon: 'hash', input: '<input data-b="tr.ref" value="' + esc(f.ref) + '" placeholder="e.g. Deposit slip 55102">' }) +
        fld({ k: 'amt', label: 'Amount', req: 1, cls: 'amount-f span2', well: '<b class="cb-rs">Rs</b>', input: '<input type="text" inputmode="decimal" data-b="tr.amt" value="' + esc(f.amt) + '" placeholder="0.00" autocomplete="off">' }) +
        fld({ k: 'notes', label: 'Narration', icon: 'message-square-text', full: 1, input: '<input data-b="tr.notes" value="' + esc(f.notes) + '" placeholder="e.g. Cash deposited to Meezan for vendor payments">' }) +
      '</div>' +
      '<button class="cb-save" type="submit"><i data-lucide="arrow-left-right"></i>Save Transfer</button>' +
    '</form>';
  }

  function renderPanels(anim) {
    var box = $('.cb-panels', CB);
    box.classList.toggle('one', S.mode === 'transfer');
    box.innerHTML = S.mode === 'transfer' ? trHTML() : panelHTML('in') + panelHTML('out');
    S._chqEnter = false;
    icons(box);
    if (S.mode === 'transfer') updateTr();
    if (anim) replay(box, 'morph-in');
  }

  function updateTr() {
    var f = S.forms.tr, b = balances(), amt = parseAmt(f.amt) || 0;
    ['from', 'to'].forEach(function (side) {
      var el = $('[data-trbal="' + side + '"]', CB), af = $('[data-trafter="' + side + '"]', CB);
      if (!el) return;
      el.innerHTML = money(b[f[side]]);
      var after = b[f[side]] + (side === 'from' ? -amt : amt);
      af.innerHTML = smoney(after);
      af.classList.toggle('neg', after < 0);
      af.parentNode.classList.toggle('on', amt > 0);
      var ic = $('.cb-tr-card.' + side + ' .cb-tr-ic', CB);
      if (ic && ic.dataset.k !== f[side]) { ic.dataset.k = f[side]; ic.innerHTML = '<i data-lucide="' + ACC[f[side]].icon + '"></i>'; icons(ic); }
    });
  }

  function setMode(m) {
    if (m === S.mode) return;
    var prev = S.mode, box = $('.cb-panels', CB);
    S.mode = m;
    ['in', 'out'].forEach(function (k) {
      var f = S.forms[k], bankish = m === 'bank' || m === 'cheque';
      if (m === 'transfer') return;
      if (bankish && ACC[f.acct].t !== 'bank') f.acct = 'meezan';
      if (!bankish && ACC[f.acct].t !== 'cash') f.acct = 'drawer';
      var modes = MODES[bankish ? m : 'cash'];
      if (modes.indexOf(f.mode) < 0) f.mode = modes[0];
    });
    // pills + tip
    $$('.cb-pills button', CB).forEach(function (b) { var on = b.dataset.mode === m; b.classList.toggle('active', on); b.setAttribute('aria-selected', on); });
    moveThumb($('.cb-pills', CB));
    var tip = $('[data-tip]', CB); tip.textContent = TIPS[m]; replay(tip, 'swap');

    var big = prev === 'transfer' || m === 'transfer';
    if (RM()) { renderPanels(); return; }
    if (big) {
      box.classList.add('morph-out');
      setTimeout(function () {
        box.classList.remove('morph-out');
        morphHeight(box, function () { renderPanels(true); }, 360);
      }, 190);
    } else {
      var go = function () {
        S._chqEnter = m === 'cheque';
        morphHeight(box, function () { renderPanels(); }, 300);
        ['acct', 'mode'].forEach(function (k) { $$('[data-k="' + k + '"] .cb-in', box).forEach(function (x) { replay(x, 'swap'); }); });
        $$('.cb-ph p', box).forEach(function (x) { replay(x, 'swap-txt'); });
      };
      if (prev === 'cheque') { $$('.cb-chq', box).forEach(function (x) { x.classList.add('leaving'); }); setTimeout(go, 230); }
      else go();
    }
  }

  function moveThumb(wrap) {
    if (!wrap) return;
    var a = $('button.active', wrap), th = $('.cb-thumb, .cb-seg-thumb', wrap);
    if (!a || !th) return;
    th.style.width = a.offsetWidth + 'px';
    th.style.transform = 'translateX(' + a.offsetLeft + 'px)';
    th.style.height = a.offsetHeight + 'px';
    th.style.top = a.offsetTop + 'px';
  }

  function parseAmt(s) { var n = parseFloat(String(s || '').replace(/[^0-9.]/g, '')); return isFinite(n) ? r2(n) : NaN; }

  /* ------------------------------------------------------------- saving */
  function showErrs(form, errs) {
    $$('[data-k]', form).forEach(function (l) {
      var msg = errs[l.dataset.k], e = $('.cb-err', l);
      l.classList.toggle('err', !!msg);
      if (e) e.textContent = msg || '';
    });
    var keys = Object.keys(errs);
    if (keys.length) {
      replay(form, 'shake');
      var first = $('[data-k="' + keys[0] + '"] input, [data-k="' + keys[0] + '"] select', form);
      if (first) setTimeout(function () { first.focus({ preventScroll: false }); }, 60);
    }
    return keys.length === 0;
  }

  function save(kind, form) {
    var f = S.forms[kind], errs = {}, b = balances(), amt = parseAmt(f.amt), e;
    if (kind === 'tr') {
      if (!f.date) errs.date = 'Pick a date';
      if (f.from === f.to) errs.to = 'Choose a different account';
      if (!(amt > 0)) errs.amt = 'Enter an amount greater than 0';
      else if (amt > b[f.from]) errs.amt = 'Exceeds available ' + ACC[f.from].short + ' balance';
      if (!showErrs(form, errs)) return;
      e = { id: 'e' + (++S.uid), date: f.date, time: '14:30', dir: 'tr', from: f.from, to: f.to, amt: amt, cat: 'Transfer', icon: 'arrow-left-right',
        title: f.notes.trim() || ('Transfer · ' + ACC[f.from].short + ' → ' + ACC[f.to].short), party: f.ref.trim() || (ACC[f.from].short + ' → ' + ACC[f.to].short), no: nextNo('JV'), status: 'Posted' };
      S.forms.tr = blankTr();
      commit(e, 'Transfer saved · ' + e.no);
      return;
    }
    var out = kind === 'out', bankish = S.mode === 'bank' || S.mode === 'cheque';
    if (!f.date) errs.date = 'Pick a date';
    if (!f.time) errs.time = 'Pick a time';
    if (!f.party.trim()) errs.party = out ? 'Who was this paid to?' : 'Who paid you?';
    if (!f.cat) errs.cat = 'Choose a category';
    if (!(amt > 0)) errs.amt = 'Enter an amount greater than 0';
    else if (out && amt > b[f.acct]) errs.amt = 'Exceeds available balance in ' + ACC[f.acct].short + ' (' + 'Rs ' + grp(b[f.acct]) + ')';
    if (S.mode === 'cheque') {
      if (!/^\d{4,10}$/.test(f.chq.trim())) errs.chq = f.chq.trim() ? 'Use 4–10 digits' : 'Cheque no. is required';
      if (!f.chqDate) errs.chqDate = 'Pick the cheque date';
    }
    if (!showErrs(form, errs)) return;
    var pre = bankish ? (out ? 'BPV' : 'BRV') : (out ? 'CPV' : 'CRV');
    var title = f.notes.trim() || (S.mode === 'cheque' ? 'Cheque ' + (out ? 'issued' : 'received') + ' · #' + f.chq.trim() : (out ? f.cat : (f.cat === 'Sales receipts' ? 'Walk-in sale receipt' : f.cat)));
    e = { id: 'e' + (++S.uid), date: f.date, time: f.time, dir: kind, title: title, party: f.party.trim(), no: nextNo(pre), cat: f.cat, amt: amt,
      status: S.mode === 'cheque' && f.pdc ? 'PDC' : 'Posted', acct: f.acct, icon: S.mode === 'cheque' ? 'wallet-cards' : (CAT_ICON[f.cat] || 'receipt'), mode: f.mode, ref: f.ref.trim() };
    S.forms[kind] = blankForm(kind, S.mode);
    S.forms[kind].acct = f.acct; // keep the chosen account
    commit(e, (out ? 'Cash Out' : 'Cash In') + ' saved · ' + e.no);
  }

  function commit(e, msg) {
    var prevBal = balances();
    S.entries.push(e);
    S.newest = e.id; S.flash = e.id;
    // make sure the new row is visible
    S.f.q = ''; S.f.dir = 'all';
    if (e.date < S.f.from) S.f.from = e.date < '2026-09-25' ? S.f.from : e.date;
    if (e.date > S.f.to) S.f.to = e.date;
    syncLedgerTools();
    renderPanels();
    renderAll(prevBal);
    var row = $('.bb-row[data-id="' + e.id + '"]', CB);
    if (row && !RM()) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    toast(msg, { tone: 'good', undo: function () { undo(e.id); } });
  }

  function undo(id) {
    var i = S.entries.findIndex(function (x) { return x.id === id; });
    if (i < 0) return;
    var prevBal = balances(), e = S.entries[i];
    S.entries.splice(i, 1);
    var p = e.no.split('-')[0];
    if (S.seq[p] && e.no === p + '-2026-' + String(S.seq[p] - 1).padStart(6, '0')) S.seq[p]--;
    var last = sorted().pop();
    S.newest = last ? last.id : null;
    var row = $('.bb-row[data-id="' + id + '"]', CB);
    var done = function () { renderAll(prevBal); };
    if (row && !RM()) { row.classList.add('leaving'); setTimeout(done, 260); } else done();
    toast(e.no + ' removed', { tone: 'info' });
  }

  /* -------------------------------------------------------------- ledger */
  function syncLedgerTools() {
    var q = $('[data-lq]', CB); if (q) q.value = S.f.q;
    $$('.cb-seg button', CB).forEach(function (b) { b.classList.toggle('active', b.dataset.dir === S.f.dir); });
    moveThumb($('.cb-seg', CB));
    var fr = $('[data-r="from"]', CB), to = $('[data-r="to"]', CB);
    if (fr) fr.value = S.f.from; if (to) to.value = S.f.to;
  }

  function computeLedger() {
    var all = sorted(), bal = BASE.drawer, open = null, rows = [];
    all.forEach(function (e) {
      if (e.date < S.f.from) { bal += drawerDelta(e); return; }
      if (open === null) open = bal;
      bal = r2(bal + drawerDelta(e));
      if (e.date > S.f.to) return;
      rows.push({ e: e, bal: bal, ld: ledgerDir(e) });
    });
    if (open === null) open = bal;
    // closing = balance at end of the range
    var close = BASE.drawer;
    all.forEach(function (e) { if (e.date <= S.f.to) close = r2(close + drawerDelta(e)); });
    var q = S.f.q.trim().toLowerCase();
    var vis = rows.filter(function (r) {
      if (S.f.dir !== 'all' && r.ld !== S.f.dir) return false;
      if (!q) return true;
      return [r.e.title, r.e.party, r.e.no, r.e.cat, r.e.status].join(' ').toLowerCase().indexOf(q) >= 0;
    });
    return { open: r2(open), close: close, rows: rows, vis: vis };
  }

  function rowHTML(r) {
    var e = r.e, ld = r.ld, isNew = e.id === S.flash;
    var tone = ld === 'in' ? 'green' : ld === 'out' ? 'red' : 'grey';
    var sub = esc(e.no) + ' · ' + esc(e.party) + ' · ' + t12(e.time);
    var balCol = ld === 'off'
      ? '<div class="bb-col bal off"><small>Posted to</small><b>' + esc(e.dir === 'tr' ? ACC[e.from].short + ' → ' + ACC[e.to].short : ACC[e.acct].short) + '</b></div>'
      : '<div class="bb-col bal"><small>Running Balance</small><b>' + money(r.bal) + '</b></div>';
    var amtIn = ld === 'in' ? '<b class="green">' + smoney(e.amt, true) + '</b>' : (ld === 'off' && e.dir === 'in' ? '<b class="muted-amt">' + smoney(e.amt, true) + '</b>' : '<b class="dash">—</b>');
    var amtOut = ld === 'out' ? '<b class="red">' + smoney(-e.amt) + '</b>' : (ld === 'off' && e.dir !== 'in' ? '<b class="muted-amt">' + smoney(-e.amt) + '</b>' : '<b class="dash">—</b>');
    var st = e.status.toLowerCase();
    return '<div class="bb-row' + (isNew ? ' is-new' : '') + (ld === 'off' ? ' off' : '') + '" data-id="' + e.id + '">' +
      '<span class="bb-row-icon ' + tone + '"><i data-lucide="' + e.icon + '"></i></span>' +
      '<div class="bb-row-text"><b>' + esc(e.title) + '</b><small>' + sub + '</small></div>' +
      '<div class="bb-col">' + amtIn + '</div>' +
      '<div class="bb-col">' + amtOut + '</div>' +
      balCol +
      '<div class="bb-tag-slot"><span class="bb-tag ' + st + '">' + esc(e.status) + '</span></div>' +
      '<button type="button" class="bb-more" aria-label="Actions for ' + esc(e.no) + '"><i data-lucide="ellipsis-vertical"></i></button>' +
    '</div>';
  }

  function renderLedger(anim) {
    var L = computeLedger(), box = $('[data-tl]', CB);
    enterAnim(box, false);
    var days = [], map = {};
    L.vis.forEach(function (r) { if (!map[r.e.date]) { map[r.e.date] = []; days.push(r.e.date); } map[r.e.date].push(r); });
    var sub = $('[data-lsub]', CB);
    sub.textContent = dShort(S.f.from) + ' – ' + dShort(S.f.to) + ' · ' + L.vis.length + ' of ' + L.rows.length + ' vouchers';
    if (!days.length) {
      box.innerHTML = '<div class="bb-empty"><span class="bb-empty-ic"><i data-lucide="search"></i></span><b>No entries match</b><p>Try clearing the search or widening the date range.</p><button type="button" class="btn secondary sm" data-clear>Clear filters</button></div>';
      icons(box);
      return;
    }
    var html = '';
    days.forEach(function (d, i) {
      var p = dParts(d), list = map[d];
      var inT = 0, outT = 0;
      list.forEach(function (r) { var v = drawerDelta(r.e); if (v > 0) inT += v; else outT -= v; });
      var hasNew = list.some(function (r) { return r.e.id === S.newest; });
      var dayClose = list[list.length - 1].bal;
      html += '<div class="bb-day" style="--d:' + i + '">' +
        '<div class="bb-daycol"><div class="bb-date' + (d === TODAY ? ' today' : '') + '"><b>' + p.d + '</b><span>' + p.my + '</span><small>' + (d === TODAY ? 'Today' : p.wd) + '</small></div>' +
          (i === 0 ? '<div class="bb-open-chip"><small>Opening Balance</small><b>' + money(L.open) + '</b></div>' : '') + '</div>' +
        '<span class="bb-node' + (hasNew ? ' pulse' : '') + '"></span>' +
        '<div class="bb-daycard">' + list.map(rowHTML).join('') +
          '<div class="cb-daytot"><span class="lbl">Day total</span>' +
            '<span>In <b class="green">' + smoney(inT, true) + '</b></span>' +
            '<span>Out <b class="red">' + smoney(-outT) + '</b></span>' +
            '<span>Net <b class="' + (inT - outT >= 0 ? 'green' : 'red') + '">' + smoney(inT - outT, true) + '</b></span>' +
            '<span class="close">Day close <b>' + money(dayClose) + '</b></span></div>' +
        '</div></div>';
    });
    html += '<div class="bb-day bb-closing" style="--d:' + days.length + '"><div class="bb-daycol"></div><span class="bb-node end"></span>' +
      '<div class="cb-closebar"><span><i data-lucide="circle-check"></i>Closing balance · ' + dShort(S.f.to) + '</span><b>' + money(L.close) + '</b></div></div>';
    box.innerHTML = html;
    icons(box);
    S.flash = null;
    if (anim && !box.querySelector('.is-new')) enterAnim(box, true);
  }

  /* --------------------------------------------------------------- KPIs */
  function renderKPIs(prev) {
    var b = balances();
    var vals = { total: CASH_ACC.concat(BANK_ACC).reduce(function (s, k) { return s + b[k]; }, 0), drawer: b.drawer, bank: BANK_ACC.reduce(function (s, k) { return s + b[k]; }, 0), petty: b.petty };
    var pv = prev ? { total: CASH_ACC.concat(BANK_ACC).reduce(function (s, k) { return s + prev[k]; }, 0), drawer: prev.drawer, bank: BANK_ACC.reduce(function (s, k) { return s + prev[k]; }, 0), petty: prev.petty } : null;
    Object.keys(vals).forEach(function (k) {
      var el = $('[data-kv="' + k + '"]', CB);
      tween(el, r2(vals[k]), { from: pv ? r2(pv[k]) : 0, dur: pv ? 800 : 1100 });
      if (pv && r2(pv[k]) !== r2(vals[k])) replay(el.closest('article'), 'bump');
    });
    var n = S.entries.filter(function (e) { return drawerDelta(e) !== 0; }).length;
    var kn = $('[data-kn="drawer"]', CB); if (kn) kn.textContent = 'Lahore HQ · ' + n + ' vouchers this week';
  }

  /* ---------------------------------------------------------- cash count */
  function counted() { return DEN.reduce(function (s, d) { return s + d.v * (S.count[d.v] || 0); }, 0); }
  function bookBal() { return balances().drawer; }
  function renderCC() {
    var box = $('[data-cc]', CB);
    box.innerHTML = '<div class="cb-card-h"><span class="cb-card-ic"><i data-lucide="coins"></i></span><div><h3>Cash Count</h3><p>Lahore HQ drawer · ' + dShort(TODAY) + '</p></div></div>' +
      '<div class="cb-den">' + DEN.map(function (d) {
        return '<div class="cb-den-row" data-den="' + d.v + '">' +
          '<span class="cb-note' + (d.coin ? ' coin' : '') + '" style="--c:' + d.c + '">' + (d.coin ? '<i data-lucide="coins"></i>' : '<em>Rs</em>') + d.l + '</span>' +
          '<span class="cb-step"><button type="button" data-step="-1" aria-label="Fewer ' + d.l + '"><i data-lucide="minus"></i></button>' +
            '<input type="text" inputmode="numeric" value="' + (S.count[d.v] || 0) + '" aria-label="' + (d.coin ? 'Coins total in rupees' : 'Count of Rs ' + d.l + ' notes') + '">' +
            '<button type="button" data-step="1" aria-label="More ' + d.l + '"><i data-lucide="plus"></i></button></span>' +
          '<b class="cb-den-sub">' + grp(d.v * (S.count[d.v] || 0), 0) + '</b></div>';
      }).join('') + '</div>' +
      '<div class="cb-cc-sum">' +
        '<div><span>Counted</span><b data-cc-counted></b></div>' +
        '<div><span>Book balance</span><b data-cc-book></b></div>' +
        '<div class="os"><span>Over / Short</span><b data-cc-os></b></div>' +
      '</div>' +
      '<div class="cb-os-track" aria-hidden="true"><span class="lbl l">Short</span><i></i><span class="mid"></span><span class="lbl r">Over</span></div>' +
      '<button type="button" class="cb-close-day" data-close-day><i data-lucide="circle-check"></i><span>Reconcile &amp; close day</span></button>';
    icons(box);
    updateCC(true);
  }
  function updateCC(first) {
    var box = $('[data-cc]', CB); if (!box) return;
    var c = counted(), bk = bookBal(), d = r2(c - bk);
    tween($('[data-cc-counted]', box), c, first ? { from: 0 } : { dur: 450 });
    tween($('[data-cc-book]', box), bk, first ? { from: 0 } : { dur: 450 });
    var os = $('[data-cc-os]', box);
    os.className = d === 0 ? 'zero' : d > 0 ? 'over' : 'short';
    os.innerHTML = d === 0 ? '<i data-lucide="circle-check"></i>Balanced' : smoney(d, true);
    if (d === 0) icons(os);
    var bar = $('.cb-os-track > i', box), pct = Math.min(50, Math.abs(d) / 2000 * 50);
    bar.className = d >= 0 ? 'over' : 'short';
    bar.style.width = (d === 0 ? 0 : Math.max(2.5, pct)) + '%';
    bar.style.left = d >= 0 ? '50%' : (50 - Math.max(2.5, pct)) + '%';
    if (d === 0) bar.style.left = '50%';
    var btn = $('[data-close-day]', box);
    btn.classList.toggle('done', !!S.closed);
    $('span', btn).textContent = S.closed ? 'Day closed · ' + dShort(TODAY) : 'Reconcile & close day';
  }

  /* ------------------------------------------------------------- glance */
  function renderGlance(anim) {
    var box = $('[data-glance]', CB);
    var today = S.entries.filter(function (e) { return e.date === TODAY; });
    var inT = 0, outT = 0, nIn = 0, nOut = 0, cats = {};
    today.forEach(function (e) {
      var v = drawerDelta(e);
      if (v > 0) { inT += v; nIn++; } else if (v < 0) { outT -= v; nOut++; }
      if (v) { cats[e.cat] = cats[e.cat] || { n: e.cat, v: 0, dir: v > 0 ? 'in' : 'out', icon: e.icon }; cats[e.cat].v += Math.abs(v); }
    });
    var tot = inT + outT || 1, C = 2 * Math.PI * 42, a = inT / tot * C, gap = (inT && outT) ? 3 : 0;
    var top = Object.keys(cats).map(function (k) { return cats[k]; }).sort(function (x, y) { return y.v - x.v; }).slice(0, 4);
    var max = top.length ? top[0].v : 1;
    box.innerHTML = '<div class="cb-card-h"><span class="cb-card-ic v"><i data-lucide="zap"></i></span><div><h3>Today at a glance</h3><p>' + WD[D(TODAY).getUTCDay()] + ', ' + dShort(TODAY) + ' · drawer</p></div></div>' +
      '<div class="cb-glance-top">' +
        '<div class="cb-donut"><svg viewBox="0 0 100 100" aria-hidden="true"><circle class="trk" cx="50" cy="50" r="42"/>' +
          '<circle class="seg in" cx="50" cy="50" r="42" stroke-dasharray="0 ' + C + '" data-da="' + Math.max(0, a - gap) + ' ' + C + '"/>' +
          '<circle class="seg out" cx="50" cy="50" r="42" stroke-dasharray="0 ' + C + '" stroke-dashoffset="' + (-a) + '" data-da="' + Math.max(0, C - a - gap) + ' ' + C + '"/></svg>' +
          '<div class="cb-donut-c"><small>Net</small><b class="' + (inT - outT >= 0 ? 'green' : 'red') + '">' + (inT - outT >= 0 ? '+' : '−') + grp(Math.abs(inT - outT) / 1000, 1) + 'k</b></div></div>' +
        '<div class="cb-legend">' +
          '<div><i class="in"></i><span>Cash in<small>' + nIn + ' voucher' + (nIn === 1 ? '' : 's') + '</small></span><b>' + money(inT) + '</b></div>' +
          '<div><i class="out"></i><span>Cash out<small>' + nOut + ' voucher' + (nOut === 1 ? '' : 's') + '</small></span><b>' + money(outT) + '</b></div>' +
        '</div>' +
      '</div>' +
      '<div class="cb-cats"><h4>Top categories</h4>' + (top.length ? top.map(function (c) {
        return '<div class="cb-cat ' + c.dir + '"><span class="cb-cat-ic"><i data-lucide="' + (CAT_ICON[c.n] || c.icon) + '"></i></span>' +
          '<div><span><b>' + esc(c.n) + '</b><em>' + (c.dir === 'in' ? '+' : '−') + grp(c.v, 0) + '</em></span><i><u style="--w:' + (c.v / max * 100).toFixed(1) + '%"></u></i></div></div>';
      }).join('') : '<p class="cb-none">No drawer movement yet today.</p>') + '</div>';
    icons(box);
    var go = function () {
      $$('.seg', box).forEach(function (s) { s.setAttribute('stroke-dasharray', s.dataset.da); });
      $$('.cb-cat u', box).forEach(function (u) { u.classList.add('on'); });
    };
    if (RM() || !anim) go(); else requestAnimationFrame(function () { requestAnimationFrame(go); });
  }

  function renderAll(prevBal) {
    renderLedger();
    renderKPIs(prevBal);
    updateCC();
    renderGlance(true);
  }

  /* ----------------------------------------------------- ledger actions */
  function find(id) { return S.entries.find(function (x) { return x.id === id; }); }
  function viewVoucher(e) {
    var ld = ledgerDir(e), isTr = e.dir === 'tr';
    var dr, cr;
    if (isTr) { dr = ACC[e.to].n + ' · ' + ACC[e.to].s; cr = ACC[e.from].n + ' · ' + ACC[e.from].s; }
    else if (e.dir === 'in') { dr = ACC[e.acct].n + ' · ' + ACC[e.acct].s; cr = e.cat; }
    else { dr = e.cat; cr = ACC[e.acct].n + ' · ' + ACC[e.acct].s; }
    var html = '<div class="cb-vv">' +
      '<div class="cb-vv-amt ' + (ld === 'out' ? 'red' : ld === 'in' ? 'green' : '') + '"><small>' + (isTr ? 'Transfer amount' : e.dir === 'in' ? 'Amount received' : 'Amount paid') + '</small><b>' + money(e.amt) + '</b><span class="bb-tag ' + e.status.toLowerCase() + '">' + esc(e.status) + '</span></div>' +
      '<div class="dl">' +
        '<div><span>Voucher</span><b>' + esc(e.no) + '</b></div>' +
        '<div><span>Date &amp; time</span><b>' + dShort(e.date) + ' · ' + t12(e.time) + '</b></div>' +
        '<div><span>' + (e.dir === 'in' ? 'Received from' : isTr ? 'Reference' : 'Paid to') + '</span><b>' + esc(e.party) + '</b></div>' +
        '<div><span>Category</span><b>' + esc(e.cat) + '</b></div>' +
        (e.mode ? '<div><span>Payment mode</span><b>' + esc(e.mode) + '</b></div>' : '') +
        '<div><span>Branch</span><b>Lahore HQ</b></div>' +
        '<div><span>Prepared by</span><b>Hira Ali</b></div>' +
      '</div>' +
      '<h4 class="cb-vv-h">Journal lines</h4>' +
      '<div class="cb-vv-lines"><div class="hd"><span>Account</span><span>Debit</span><span>Credit</span></div>' +
        '<div><span>' + esc(dr) + '</span><b>' + grp(e.amt) + '</b><b class="z">—</b></div>' +
        '<div><span>' + esc(cr) + '</span><b class="z">—</b><b>' + grp(e.amt) + '</b></div>' +
        '<div class="tot"><span>Total</span><b>' + grp(e.amt) + '</b><b>' + grp(e.amt) + '</b></div></div>' +
      '<p class="cb-vv-narr">' + esc(e.title) + '</p>' +
    '</div>';
    if (window.FS && FS.drawer) {
      var d = FS.drawer({ title: e.no, subtitle: e.title, html: html, foot: '<button class="btn secondary" data-close>Close</button><button class="btn primary" data-close data-toast="Voucher sent to printer"><i data-lucide="printer"></i>Print voucher</button>' });
      if (d) icons(d);
    }
  }
  function editEntry(e) {
    if (e.status !== 'Draft') {
      toast(e.no + ' is posted. Reverse it to correct the books.', { tone: 'warn', action: { label: 'Reverse', fn: function () { reverse(e); } } });
      return;
    }
    // load the draft back into its form
    var kind = e.dir, m = ACC[e.acct].t === 'bank' ? 'bank' : 'cash';
    if (S.mode !== m) setMode(m);
    var f = blankForm(kind, m);
    Object.assign(f, { date: e.date, time: e.time, party: e.party, cat: e.cat, acct: e.acct, amt: String(e.amt), notes: e.title });
    S.forms[kind] = f;
    S.entries = S.entries.filter(function (x) { return x.id !== e.id; });
    var prev = balances();
    setTimeout(function () {
      renderPanels();
      renderAll(prev);
      var p = $('.cb-panel.' + kind, CB);
      if (p) { p.scrollIntoView({ behavior: RM() ? 'auto' : 'smooth', block: 'start' }); replay(p, 'focus-flash'); }
      toast('Draft ' + e.no + ' loaded into ' + (kind === 'in' ? 'Cash In' : 'Cash Out'), { tone: 'info' });
    }, S.mode === m ? 0 : 420);
  }
  function reverse(e) {
    var r;
    if (e.dir === 'tr') r = { dir: 'tr', from: e.to, to: e.from };
    else r = { dir: e.dir === 'in' ? 'out' : 'in', acct: e.acct };
    Object.assign(r, { id: 'e' + (++S.uid), date: TODAY, time: '15:00', title: 'Reversal of ' + e.no, party: e.party, no: nextNo('JV'), cat: 'Reversal', amt: e.amt, status: 'Posted', icon: 'repeat' });
    commit(r, e.no + ' reversed · ' + r.no);
  }

  /* --------------------------------------------------------------- wire */
  function wireCB() {
    // quick entry pills
    CB.addEventListener('click', function (ev) {
      var t = ev.target;
      var pill = t.closest('.cb-pills button');
      if (pill) { setMode(pill.dataset.mode); return; }
      var seg = t.closest('.cb-seg button');
      if (seg) { S.f.dir = seg.dataset.dir; syncLedgerTools(); renderLedger(true); return; }
      if (t.closest('.cb-swap')) {
        var f = S.forms.tr, x = f.from; f.from = f.to; f.to = x;
        $('[data-b="tr.from"]', CB).value = f.from; $('[data-b="tr.to"]', CB).value = f.to;
        replay($('.cb-tr-flow', CB), 'swapping'); updateTr();
        $$('.cb-tr-card', CB).forEach(function (c) { c.classList.remove('err'); });
        return;
      }
      if (t.closest('[data-clear]')) { S.f = { q: '', dir: 'all', from: '2026-09-25', to: TODAY }; syncLedgerTools(); renderLedger(true); return; }
      var more = t.closest('.bb-more');
      if (more) {
        var e = find(more.closest('.bb-row').dataset.id);
        if (!e) return;
        menu(more, [
          { label: 'View voucher', icon: 'file-text', onClick: function () { viewVoucher(e); } },
          { label: e.status === 'Draft' ? 'Edit draft' : 'Edit', icon: 'pencil', onClick: function () { editEntry(e); } },
          { sep: true },
          { label: 'Reverse', icon: 'repeat', danger: true, onClick: function () { reverse(e); } }
        ]);
        return;
      }
      var step = t.closest('[data-step]');
      if (step) {
        var row = step.closest('[data-den]'), dv = +row.dataset.den, inc = +step.dataset.step * (dv === 1 ? 1 : 1);
        S.count[dv] = Math.max(0, (S.count[dv] || 0) + inc);
        $('input', row).value = S.count[dv];
        $('.cb-den-sub', row).textContent = grp(dv * S.count[dv], 0);
        replay($('.cb-den-sub', row), 'tick');
        S.closed = false; updateCC();
        return;
      }
      if (t.closest('[data-close-day]')) {
        var d = r2(counted() - bookBal());
        S.closed = true; updateCC();
        if (d === 0) toast('Day closed · Lahore HQ drawer balanced at Rs ' + grp(bookBal()), { tone: 'good' });
        else toast('Day closed with ' + (d < 0 ? 'a shortage' : 'an overage') + ' of Rs ' + grp(Math.abs(d)) + ' · posted to Cash Over/Short', { tone: 'warn', undo: function () { S.closed = false; updateCC(); } });
        return;
      }
    });

    var onField = function (ev) {
      var t = ev.target;
      if (t.dataset.b) {
        var p = t.dataset.b.split('.'), f = S.forms[p[0]];
        f[p[1]] = t.type === 'checkbox' ? t.checked : t.value;
        var lab = t.closest('[data-k]');
        if (lab && lab.classList.contains('err')) { lab.classList.remove('err'); var er = $('.cb-err', lab); if (er) er.textContent = ''; }
        if (p[1] === 'pick') {
          t.classList.toggle('ph', !t.value);
          if (t.value) {
            f.party = t.value;
            var form = t.closest('form'), pi = $('[data-b="' + p[0] + '.party"]', form);
            pi.value = t.value; replay(pi.closest('.cb-in'), 'swap');
            var pl = pi.closest('[data-k]'); pl.classList.remove('err'); $('.cb-err', pl).textContent = '';
            if (p[0] === 'out' && f.cat === 'Office supplies') { /* smart default */ }
          }
        }
        if (p[0] === 'tr') updateTr();
        if (p[1] === 'amt' && ev.type === 'change' && t.value) { var n = parseAmt(t.value); if (n > 0) { t.value = grp(n); f.amt = t.value; } }
        return;
      }
      if (t.dataset.lq != null) { S.f.q = t.value; renderLedger(); return; }
      if (t.dataset.r) {
        S.f[t.dataset.r] = t.value || (t.dataset.r === 'from' ? '2026-09-25' : TODAY);
        if (S.f.from > S.f.to) { var tmp = S.f.from; S.f.from = S.f.to; S.f.to = tmp; syncLedgerTools(); }
        renderLedger(true); return;
      }
      var den = t.closest('[data-den]');
      if (den && t.tagName === 'INPUT') {
        var dv = +den.dataset.den, v = Math.max(0, parseInt(t.value.replace(/\D/g, ''), 10) || 0);
        S.count[dv] = v;
        if (ev.type === 'change') t.value = v;
        $('.cb-den-sub', den).textContent = grp(dv * v, 0);
        S.closed = false; updateCC();
      }
      if (t.dataset.file) {
        var file = t.files && t.files[0];
        if (file) { S.forms[t.dataset.file].file = file.name; refreshDrop(t.closest('.cb-drop'), file.name); }
      }
    };
    CB.addEventListener('input', onField);
    CB.addEventListener('change', onField);

    CB.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var form = ev.target.closest('form');
      save(form.dataset.kind, form);
    });

    // drag & drop receipts
    CB.addEventListener('dragover', function (ev) { var d = ev.target.closest('.cb-drop'); if (d) { ev.preventDefault(); d.classList.add('over'); } });
    CB.addEventListener('dragleave', function (ev) { var d = ev.target.closest('.cb-drop'); if (d && !d.contains(ev.relatedTarget)) d.classList.remove('over'); });
    CB.addEventListener('drop', function (ev) {
      var d = ev.target.closest('.cb-drop'); if (!d) return;
      ev.preventDefault(); d.classList.remove('over');
      var file = ev.dataTransfer.files && ev.dataTransfer.files[0];
      if (file) { var k = $('input[type=file]', d).dataset.file; S.forms[k].file = file.name; refreshDrop(d, file.name); }
    });

    window.addEventListener('resize', function () { moveThumb($('.cb-pills', CB)); moveThumb($('.cb-seg', CB)); });
  }
  function refreshDrop(d, name) {
    d.classList.add('has');
    $('.cb-drop-icon', d).innerHTML = '<i data-lucide="circle-check"></i>';
    $('.cb-drop-body', d).innerHTML = '<b>' + esc(name) + '</b><small>Attached · click to replace</small>';
    icons(d); replay(d, 'got');
  }

  function mountCB(section) {
    CB = $('[data-cb-mount]', section);
    if (!CB) return;
    initState();
    CB.innerHTML = cbSkeleton();
    icons(CB);
    renderPanels();
    renderLedger();
    renderCC();
    renderGlance(false);
    wireCB();
    section.dataset.booksMounted = '1';
  }

  register('app/cash/book', function (section, route, first) {
    if (!section) return;
    if (!section.dataset.booksMounted) mountCB(section);
    // entrance: count KPIs up, re-sweep the donut, place pill thumbs
    requestAnimationFrame(function () {
      moveThumb($('.cb-pills', CB)); moveThumb($('.cb-seg', CB));
      renderKPIs(null);
      renderGlance(true);
      updateCC(true);
      if (!RM()) replay(CB, 'cb-enter');
      renderLedger(true);
    });
  });

  /* =====================================================================
     BANK BOOK
     ===================================================================== */
  // date, kind, title, sub, withdrawal, deposit, status
  var BANKS = {
    hbl: {
      label: 'HBL - Main Account', num: 'PKR • 0012 3456 7890 8721', open: 1250000, period: ['2026-09-01', '2026-09-21'], last: 'Aug 2026',
      stmtOnly: [{ t: 'SMS alert charges · Sep', v: -350 }],
      tx: [
        ['2026-09-01', 'cheque', 'Cheque Issued', 'Chq # 001234 · Nishat Mills', 45000, 0, 'Cleared'],
        ['2026-09-02', 'deposit', 'Cash Deposit', 'Branch deposit · Lahore HQ', 0, 200000, 'Cleared'],
        ['2026-09-05', 'transfer', 'Online Transfer', 'Utility bills · K-Electric', 12500, 0, 'Cleared'],
        ['2026-09-05', 'receipt', 'Customer Payment', 'Al-Fatah Stores · INV-2026-000098', 0, 350000, 'Cleared'],
        ['2026-09-08', 'atm', 'ATM Withdrawal', 'Cash withdrawal · Gulberg branch', 20000, 0, 'Cleared'],
        ['2026-09-10', 'cheque', 'Cheque Issued', 'Chq # 001235 · Office rent', 150000, 0, 'Uncleared'],
        ['2026-09-15', 'loan', 'Loan Received', 'Short-term running finance', 0, 300000, 'Cleared'],
        ['2026-09-18', 'charges', 'Bank Charges', 'Monthly service charges', 2350, 0, 'Cleared'],
        ['2026-09-20', 'transfer', 'Online Transfer', 'Vendor payment · Siemens Pakistan', 280000, 0, 'Pending']
      ]
    },
    meezan: {
      label: 'Meezan Bank - Current', num: 'PKR • 0101 0234 5670 0123', open: 2140000, period: ['2026-09-01', '2026-09-21'], last: 'Aug 2026',
      stmtOnly: [{ t: 'Profit credit · Sep', v: 2340 }],
      tx: [
        ['2026-09-01', 'receipt', 'Customer Payment', 'Shifa International · INV-2026-000091', 0, 425000, 'Cleared'],
        ['2026-09-03', 'transfer', 'Payroll Transfer', 'Salaries · PR-2026-08', 612400, 0, 'Cleared'],
        ['2026-09-03', 'charges', 'Bank Charges', 'IBFT charges · payroll batch', 1180, 0, 'Cleared'],
        ['2026-09-07', 'deposit', 'Cash Deposit', 'Lahore HQ drawer · CPV-2026-000241', 0, 150000, 'Cleared'],
        ['2026-09-09', 'tax', 'Tax Payment', 'WHT u/s 149 · FBR CPR', 48650, 0, 'Cleared'],
        ['2026-09-11', 'receipt', 'Customer Payment', 'Lucky Cement · INV-2026-000104', 0, 286500, 'Cleared'],
        ['2026-09-14', 'cheque', 'Cheque Issued', 'Chq # 004417 · Habib Packaging', 96800, 0, 'Uncleared'],
        ['2026-09-16', 'transfer', 'Online Transfer', 'Utility bills · LESCO', 21340, 0, 'Cleared'],
        ['2026-09-18', 'receipt', 'IBFT Received', 'Packages Ltd · INV-2026-000109', 0, 178000, 'Pending'],
        ['2026-09-19', 'cheque', 'Cheque Issued', 'Chq # 004418 · Shan Foods', 64250, 0, 'Uncleared']
      ]
    },
    ubl: {
      label: 'UBL - Collections', num: 'PKR • 2294 0100 4471 2294', open: 386500, period: ['2026-09-01', '2026-09-21'], last: 'Aug 2026',
      stmtOnly: [],
      tx: [
        ['2026-09-04', 'receipt', 'Customer Payment', 'Metro Cash & Carry · INV-2026-000096', 0, 118400, 'Cleared'],
        ['2026-09-09', 'transfer', 'Online Transfer', 'Vendor payment · Shan Foods', 74600, 0, 'Cleared'],
        ['2026-09-13', 'receipt', 'Customer Payment', 'Engro Foods · INV-2026-000106', 0, 96000, 'Cleared'],
        ['2026-09-17', 'charges', 'Bank Charges', 'Cash handling fee', 1450, 0, 'Cleared'],
        ['2026-09-19', 'cheque', 'Cheque Issued', 'Chq # 220981 · TCS Logistics', 18650, 0, 'Uncleared']
      ]
    },
    alfalah: {
      label: 'Bank Alfalah - Payroll', num: 'PKR • 5510 0099 1203 5510', open: 905000, period: ['2026-09-01', '2026-09-21'], last: 'Aug 2026',
      stmtOnly: [{ t: 'Debit card annual fee', v: -2500 }],
      tx: [
        ['2026-09-01', 'deposit', 'Funding Transfer', 'From Meezan 0123 · JV-2026-000038', 0, 600000, 'Cleared'],
        ['2026-09-03', 'transfer', 'Payroll Disbursement', 'Field staff · PR-2026-08', 548200, 0, 'Cleared'],
        ['2026-09-12', 'tax', 'EOBI Contribution', 'EOBI · Aug 2026', 32400, 0, 'Cleared'],
        ['2026-09-16', 'transfer', 'Online Transfer', 'PESSI contribution · Aug', 28750, 0, 'Pending']
      ]
    }
  };
  var BB_ICON = {
    opening: ['file-text', 'grey'], cheque: ['wallet-cards', 'red'], deposit: ['arrow-down-to-line', 'green'], transfer: ['arrow-left-right', 'red'],
    receipt: ['banknote', 'green'], atm: ['credit-card', 'red'], loan: ['building-2', 'green'], charges: ['landmark', 'red'], tax: ['receipt', 'red']
  };
  var RANGES = [
    { l: 'Full period', from: '2026-09-01', to: '2026-09-21' },
    { l: 'First 10 days', from: '2026-09-01', to: '2026-09-10' },
    { l: 'Mid-month', from: '2026-09-11', to: '2026-09-21' },
    { l: 'Last 7 days', from: '2026-09-15', to: '2026-09-21' }
  ];
  var B = null, BBR = null;

  function bbInit() {
    var data = {};
    Object.keys(BANKS).forEach(function (k) {
      var n = 0;
      data[k] = BANKS[k].tx.map(function (r) { return { id: k + (++n), date: r[0], kind: r[1], title: r[2], sub: r[3], out: r[4], in: r[5], status: r[6] }; });
    });
    B = { acct: 'hbl', data: data, q: '', range: 0, only: null };
  }
  function bbCompute() {
    var A = BANKS[B.acct], R = RANGES[B.range], txs = B.data[B.acct];
    var bal = A.open, open = null, rows = [];
    txs.forEach(function (t) {
      if (t.date < R.from) { bal += t.in - t.out; return; }
      if (open === null) open = bal;
      if (t.date > R.to) return;
      bal = bal + t.in - t.out;
      rows.push({ t: t, bal: bal });
    });
    if (open === null) open = bal;
    var close = rows.length ? rows[rows.length - 1].bal : open;
    var q = B.q.trim().toLowerCase();
    var vis = rows.filter(function (r) {
      if (B.only === 'pending' && !(r.t.status !== 'Cleared' && /cheque|transfer/.test(r.t.kind))) return false;
      if (B.only === 'unresolved' && !(r.t.status !== 'Cleared' && !/cheque|transfer/.test(r.t.kind))) return false;
      if (!q) return true;
      return [r.t.title, r.t.sub, r.t.kind, r.t.status].join(' ').toLowerCase().indexOf(q) >= 0;
    });
    var wd = rows.filter(function (r) { return r.t.out; }), dp = rows.filter(function (r) { return r.t.in; });
    // reconciliation is always for the full period book
    var all = txs, endBal = A.open + all.reduce(function (s, t) { return s + t.in - t.out; }, 0);
    var matched = all.filter(function (t) { return t.status === 'Cleared'; }).length + 1; // + opening
    var pendCh = all.filter(function (t) { return t.status !== 'Cleared' && /cheque|transfer/.test(t.kind); });
    var unres = all.filter(function (t) { return t.status !== 'Cleared' && !/cheque|transfer/.test(t.kind); });
    var stmt = endBal + all.reduce(function (s, t) { return s + (t.status !== 'Cleared' ? t.out - t.in : 0); }, 0) + A.stmtOnly.reduce(function (s, x) { return s + x.v; }, 0);
    return {
      open: open, close: close, rows: rows, vis: vis,
      wd: wd.reduce(function (s, r) { return s + r.t.out; }, 0), wdN: wd.length,
      dp: dp.reduce(function (s, r) { return s + r.t.in; }, 0), dpN: dp.length,
      matched: matched, total: all.length + 1, pendCh: pendCh.length, unres: unres.length + A.stmtOnly.length,
      book: endBal, stmt: stmt
    };
  }

  function bbSkeleton() {
    return '' +
      '<header class="bb-head">' +
        '<span class="bb-logo"><i data-lucide="book-open"></i></span>' +
        '<div><h1>Bank Book</h1><p>Track and review your bank transactions with running balance</p></div>' +
        '<span class="bb-quote"><i data-lucide="leaf"></i><em>“Clear books. Confident business.”</em></span>' +
      '</header>' +
      '<div class="bb-grid">' +
        '<section class="bb-main">' +
          '<div class="bb-tools">' +
            '<label class="bb-acct"><span>Bank Account</span><span class="bb-acct-box"><span class="bb-acct-ic"><i data-lucide="landmark"></i></span>' +
              '<select data-bb-acct aria-label="Bank account">' + Object.keys(BANKS).map(function (k) { return '<option value="' + k + '">' + esc(BANKS[k].label) + '</option>'; }).join('') + '</select>' +
              '<small data-bb-num></small></span></label>' +
            '<div class="bb-search-wrap"><label class="bb-search"><i data-lucide="search"></i><input type="search" data-bb-q placeholder="Search description, cheque no, reference…" aria-label="Search bank book"></label>' +
              '<small>Try: <button type="button" data-hint="cheque">cheque</button>, <button type="button" data-hint="deposit">deposit</button>, <button type="button" data-hint="transfer">transfer</button>, <button type="button" data-hint="rent">rent</button>, <button type="button" data-hint="pending">pending</button>…</small></div>' +
            '<button type="button" class="bb-range" data-bb-range><i data-lucide="calendar-range"></i><span data-bb-range-l></span><i data-lucide="chevron-down"></i></button>' +
          '</div>' +
          '<div class="bb-kpis">' +
            '<div><span class="green"><i data-lucide="wallet"></i></span><div><small>Opening Balance</small><b data-bk="open"></b><em data-bke="open"></em></div></div>' +
            '<div><span class="red"><i data-lucide="arrow-down"></i></span><div><small>Total Withdrawals</small><b class="red" data-bk="wd"></b><em data-bke="wd"></em></div></div>' +
            '<div><span class="green"><i data-lucide="arrow-up"></i></span><div><small>Total Deposits</small><b class="green" data-bk="dp"></b><em data-bke="dp"></em></div></div>' +
            '<div><span class="green"><i data-lucide="database"></i></span><div><small>Closing Balance</small><b data-bk="close"></b><em data-bke="close"></em></div></div>' +
          '</div>' +
          '<div class="bb-filter" data-bb-filter hidden></div>' +
          '<div class="bb-colhead"><span>Transaction</span><span>Withdrawals</span><span>Deposits</span><span>Running balance</span><span>Status</span></div>' +
          '<div class="bb-ledger" data-bb-tl></div>' +
          '<div class="bb-foot">' +
            '<div class="bb-tip"><i data-lucide="lightbulb"></i><span><b>Tip:</b> Keep your bank book updated regularly and reconcile with your bank statement monthly.</span></div>' +
            '<button type="button" class="bb-export" data-bb-export><i data-lucide="download"></i>Export Bank Book<i data-lucide="chevron-down"></i></button>' +
          '</div>' +
        '</section>' +
        '<aside class="bb-side">' +
          '<div class="bb-card bb-recon">' +
            '<h2>Reconciliation Progress</h2>' +
            '<div class="bb-progress"><div class="bb-ring"><svg viewBox="0 0 80 80" aria-hidden="true"><circle class="trk" cx="40" cy="40" r="33"/><circle class="val" cx="40" cy="40" r="33" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100"/></svg><b data-bb-pct>0%</b></div>' +
              '<div class="bb-progress-text"><span data-bb-matched></span><i><i data-bb-bar></i></i></div></div>' +
            '<div class="bb-issues">' +
              '<button type="button" data-only="pending"><span class="red"><i data-lucide="wallet-cards"></i></span><div><b data-bb-pend></b><small>Pending Cheques</small></div><i data-lucide="chevron-right"></i></button>' +
              '<button type="button" data-only="unresolved"><span class="amber"><i data-lucide="alert-triangle"></i></span><div><b data-bb-unres></b><small>Unresolved Entries</small></div><i data-lucide="chevron-right"></i></button>' +
            '</div>' +
            '<a class="bb-reconcile" href="#/app/bank/reconciliation"><i data-lucide="refresh-cw"></i>Reconcile with Statement</a>' +
            '<div class="bb-stmt-foot"><span data-bb-last></span><a class="bb-link" href="#/app/bank/reconciliation">View Statement</a></div>' +
          '</div>' +
          '<div class="bb-card">' +
            '<h2><span class="bb-h2-icon"><i data-lucide="file-text"></i></span>Recent Statement Activity</h2>' +
            '<ul class="bb-stmt">' +
              '<li><span><i data-lucide="database"></i></span><div><small>Statement Balance</small><b data-bb-sb></b><em>as of 21 Sep 2026</em></div></li>' +
              '<li><span><i data-lucide="book-open"></i></span><div><small>Book Balance</small><b data-bb-bkb></b><em>as of 21 Sep 2026</em></div></li>' +
            '</ul>' +
            '<div class="bb-diff"><i data-lucide="info"></i><div><small>Difference</small><b data-bb-diff></b></div></div>' +
            '<div class="bb-note"><i data-lucide="lightbulb"></i><span data-bb-note></span></div>' +
          '</div>' +
        '</aside>' +
      '</div>';
  }

  function bbRowHTML(r, isLast) {
    var t = r.t, ic = BB_ICON[t.kind] || ['receipt', t.out ? 'red' : 'green'];
    var tone = t.kind === 'transfer' && t.in ? 'green' : ic[1];
    var st = t.status.toLowerCase();
    return '<div class="bb-row" data-id="' + t.id + '">' +
      '<span class="bb-row-icon ' + tone + '"><i data-lucide="' + ic[0] + '"></i></span>' +
      '<div class="bb-row-text"><b>' + esc(t.title) + '</b><small>' + esc(t.sub) + '</small></div>' +
      '<div class="bb-col">' + (t.out ? '<b class="red">' + money(t.out, { dec: 0 }) + '</b>' : '<b class="dash">—</b>') + '</div>' +
      '<div class="bb-col">' + (t.in ? '<b class="green">' + money(t.in, { dec: 0 }) + '</b>' : '<b class="dash">—</b>') + '</div>' +
      '<div class="bb-col bal"><small>Running Balance</small><b>' + money(r.bal, { dec: 0 }) + '</b></div>' +
      '<div class="bb-tag-slot"><span class="bb-tag ' + st + '">' + esc(t.status) + '</span></div>' +
      '<button type="button" class="bb-more" aria-label="Actions for ' + esc(t.title) + '"><i data-lucide="ellipsis-vertical"></i></button>' +
    '</div>';
  }

  function bbRenderTL(C, anim) {
    var box = $('[data-bb-tl]', BBR), days = [], map = {};
    enterAnim(box, false);
    C.vis.forEach(function (r) { if (!map[r.t.date]) { map[r.t.date] = []; days.push(r.t.date); } map[r.t.date].push(r); });
    var R = RANGES[B.range];
    // opening row sits on the range-start day
    var showOpen = !B.q.trim() && !B.only;
    if (showOpen && days.indexOf(R.from) < 0) { days.unshift(R.from); map[R.from] = []; }
    if (!days.length) {
      box.innerHTML = '<div class="bb-empty"><span class="bb-empty-ic"><i data-lucide="search"></i></span><b>No transactions match</b><p>Try another keyword or clear the filter.</p><button type="button" class="btn secondary sm" data-bb-clear>Clear filters</button></div>';
      icons(box); return;
    }
    var lastDay = days[days.length - 1];
    box.innerHTML = days.map(function (d, i) {
      var p = dParts(d), list = map[d];
      var rows = '';
      if (showOpen && d === R.from) {
        rows += '<div class="bb-row opening"><span class="bb-row-icon grey"><i data-lucide="file-text"></i></span><div class="bb-row-text"><b>Opening Balance</b><small>Balance brought forward</small></div>' +
          '<div class="bb-col"><b class="dash">—</b></div><div class="bb-col"><b class="dash">—</b></div><div class="bb-col bal"><small>Running Balance</small><b>' + money(C.open, { dec: 0 }) + '</b></div><div class="bb-tag-slot"></div><span></span></div>';
      }
      rows += list.map(function (r) { return bbRowHTML(r); }).join('');
      return '<div class="bb-day" style="--d:' + i + '">' +
        '<div class="bb-daycol"><div class="bb-date"><b>' + p.d + '</b><span>' + p.my + '</span><small>' + p.wd + '</small></div>' +
          (i === 0 && showOpen ? '<div class="bb-open-chip"><small>Opening Balance</small><b>' + money(C.open, { dec: 0 }) + '</b></div>' : '') + '</div>' +
        '<span class="bb-node' + (d === lastDay ? ' pulse' : '') + '"></span>' +
        '<div class="bb-daycard">' + rows + '</div></div>';
    }).join('');
    icons(box);
    if (anim) enterAnim(box, true);
  }

  function bbRender(opts) {
    opts = opts || {};
    var C = bbCompute(), A = BANKS[B.acct], R = RANGES[B.range];
    $('[data-bb-num]', BBR).textContent = A.num;
    $('[data-bb-range-l]', BBR).textContent = dShort(R.from) + ' – ' + dShort(R.to);
    var prev = opts.prev;
    var K = { open: C.open, wd: C.wd, dp: C.dp, close: C.close };
    Object.keys(K).forEach(function (k) {
      tween($('[data-bk="' + k + '"]', BBR), K[k], { from: prev ? prev[k] : 0, fmt: function (v) { return money(v, { dec: 0 }); }, dur: prev ? 700 : 1000 });
    });
    $('[data-bke="open"]', BBR).textContent = dShort(R.from);
    $('[data-bke="wd"]', BBR).textContent = C.wdN + ' transaction' + (C.wdN === 1 ? '' : 's');
    $('[data-bke="dp"]', BBR).textContent = C.dpN + ' transaction' + (C.dpN === 1 ? '' : 's');
    $('[data-bke="close"]', BBR).textContent = dShort(R.to);
    B._last = K;
    bbRenderTL(C, opts.anim !== false);
    // filter chip
    var fc = $('[data-bb-filter]', BBR);
    if (B.only) {
      fc.hidden = false;
      fc.innerHTML = '<span class="bb-fchip"><i data-lucide="' + (B.only === 'pending' ? 'wallet-cards' : 'alert-triangle') + '"></i>Showing ' + (B.only === 'pending' ? 'pending cheques &amp; transfers' : 'unresolved entries') + '<button type="button" data-bb-clear aria-label="Clear filter"><i data-lucide="x"></i></button></span>';
      icons(fc);
    } else fc.hidden = true;
    $$('.bb-issues button', BBR).forEach(function (b) { b.classList.toggle('on', b.dataset.only === B.only); });
    // reconciliation
    var pct = Math.round(C.matched / C.total * 100);
    $('[data-bb-matched]', BBR).textContent = C.matched + ' of ' + C.total + ' transactions matched';
    tween($('[data-bb-pct]', BBR), pct, { from: opts.ringFrom != null ? opts.ringFrom : (prev ? B._pct || 0 : 0), fmt: function (v) { return Math.round(v) + '%'; }, dur: 900 });
    var ring = $('.bb-ring .val', BBR), bar = $('[data-bb-bar]', BBR);
    var setRing = function () { ring.style.strokeDashoffset = 100 - pct; bar.style.width = pct + '%'; };
    if (!prev && !RM()) { ring.style.strokeDashoffset = 100; bar.style.width = '0%'; requestAnimationFrame(function () { requestAnimationFrame(setRing); }); } else setRing();
    B._pct = pct;
    $('[data-bb-pend]', BBR).textContent = C.pendCh;
    $('[data-bb-unres]', BBR).textContent = C.unres;
    $('[data-bb-last]', BBR).textContent = 'Last statement: ' + A.last;
    tween($('[data-bb-sb]', BBR), C.stmt, { from: prev ? undefined : 0, fmt: function (v) { return money(v, { dec: 0 }); } });
    tween($('[data-bb-bkb]', BBR), C.book, { from: prev ? undefined : 0, fmt: function (v) { return money(v, { dec: 0 }); } });
    var diff = C.stmt - C.book;
    tween($('[data-bb-diff]', BBR), diff, { from: prev ? undefined : 0, fmt: function (v) { v = Math.round(v); return (v > 0 ? '+' : v < 0 ? '−' : '') + money(v, { dec: 0 }); } });
    $('.bb-diff', BBR).classList.toggle('ok', diff === 0);
    $('[data-bb-note]', BBR).textContent = diff === 0
      ? 'Statement and book agree. Nothing left to reconcile.'
      : 'You have ' + C.pendCh + ' pending cheque' + (C.pendCh === 1 ? '' : 's') + ' and ' + C.unres + ' unresolved entr' + (C.unres === 1 ? 'y' : 'ies') + ' causing the difference.';
  }

  function bbWire() {
    BBR.addEventListener('change', function (ev) {
      if (ev.target.matches('[data-bb-acct]')) {
        var prev = B._last;
        B.acct = ev.target.value; B.only = null;
        var main = $('.bb-main', BBR), side = $('.bb-side', BBR);
        if (RM()) { bbRender({ prev: prev }); return; }
        main.classList.add('switch-out'); side.classList.add('switch-out');
        setTimeout(function () {
          main.classList.remove('switch-out'); side.classList.remove('switch-out');
          bbRender({ prev: prev });
          replay(main, 'switch-in'); replay(side, 'switch-in');
        }, 180);
        replay($('.bb-acct-box', BBR), 'swap');
      }
    });
    BBR.addEventListener('input', function (ev) {
      if (ev.target.matches('[data-bb-q]')) { B.q = ev.target.value; bbRenderTL(bbCompute()); }
    });
    BBR.addEventListener('click', function (ev) {
      var t = ev.target;
      var h = t.closest('[data-hint]');
      if (h) { var q = $('[data-bb-q]', BBR); q.value = h.dataset.hint; B.q = h.dataset.hint; bbRenderTL(bbCompute()); q.focus(); return; }
      if (t.closest('[data-bb-clear]')) { B.q = ''; B.only = null; $('[data-bb-q]', BBR).value = ''; bbRender({ prev: B._last }); return; }
      var only = t.closest('[data-only]');
      if (only) { B.only = B.only === only.dataset.only ? null : only.dataset.only; B.q = ''; $('[data-bb-q]', BBR).value = ''; bbRender({ prev: B._last }); return; }
      var rg = t.closest('[data-bb-range]');
      if (rg) {
        menu(rg, RANGES.map(function (r, i) {
          return { label: r.l + ' · ' + dShort(r.from).slice(0, 6) + ' – ' + dShort(r.to), icon: i === B.range ? 'circle-check' : 'calendar', onClick: function () { var p = B._last; B.range = i; bbRender({ prev: p }); } };
        }));
        return;
      }
      if (t.closest('[data-bb-export]')) {
        var nm = BANKS[B.acct].label;
        menu(t.closest('[data-bb-export]'), [
          { label: 'Export as PDF', icon: 'file-text', onClick: function () { toast('Bank Book exported · ' + nm + '.pdf', { tone: 'good' }); } },
          { label: 'Export as Excel', icon: 'download', onClick: function () { toast('Bank Book exported · ' + nm + '.xlsx', { tone: 'good' }); } },
          { label: 'Print', icon: 'printer', onClick: function () { toast('Sent to printer', { tone: 'info' }); } }
        ]);
        return;
      }
      var more = t.closest('.bb-more');
      if (more) {
        var id = more.closest('.bb-row').dataset.id, tx = B.data[B.acct].find(function (x) { return x.id === id; });
        if (!tx) return;
        var cleared = tx.status === 'Cleared';
        menu(more, [
          { label: 'View details', icon: 'file-text', onClick: function () { bbView(tx); } },
          { label: cleared ? 'Mark as uncleared' : 'Mark as cleared', icon: cleared ? 'clock' : 'circle-check', onClick: function () {
            var p = B._last, pc = B._pct; tx.status = cleared ? 'Uncleared' : 'Cleared';
            bbRender({ prev: p, ringFrom: pc, anim: false });
            var row = $('.bb-row[data-id="' + id + '"]', BBR); if (row) replay(row, 'flash');
            toast(tx.title + ' marked ' + tx.status.toLowerCase(), { tone: cleared ? 'info' : 'good', undo: function () { tx.status = cleared ? 'Cleared' : 'Uncleared'; bbRender({ prev: B._last, ringFrom: B._pct, anim: false }); } });
          } },
          { sep: true },
          { label: 'Open reconciliation', icon: 'refresh-cw', onClick: function () { location.hash = '#/app/bank/reconciliation'; } }
        ]);
      }
    });
  }
  function bbView(t) {
    if (!(window.FS && FS.drawer)) return;
    var html = '<div class="cb-vv"><div class="cb-vv-amt ' + (t.out ? 'red' : 'green') + '"><small>' + (t.out ? 'Withdrawal' : 'Deposit') + '</small><b>' + money(t.out || t.in) + '</b><span class="bb-tag ' + t.status.toLowerCase() + '">' + esc(t.status) + '</span></div>' +
      '<div class="dl"><div><span>Bank account</span><b>' + esc(BANKS[B.acct].label) + '</b></div><div><span>Value date</span><b>' + dShort(t.date) + '</b></div>' +
      '<div><span>Description</span><b>' + esc(t.sub) + '</b></div><div><span>Type</span><b>' + esc(t.title) + '</b></div>' +
      '<div><span>Statement match</span><b>' + (t.status === 'Cleared' ? 'Matched · Aug–Sep statement' : 'Not yet on statement') + '</b></div></div></div>';
    var d = FS.drawer({ title: t.title, subtitle: BANKS[B.acct].label + ' · ' + dShort(t.date), html: html, foot: '<button class="btn secondary" data-close>Close</button><a class="btn primary" href="#/app/bank/reconciliation" data-close><i data-lucide="refresh-cw"></i>Reconcile</a>' });
    if (d) icons(d);
  }

  register('app/bank/book', function (section) {
    if (!section) return;
    if (!section.dataset.booksMounted) {
      BBR = $('[data-bb-mount]', section);
      if (!BBR) return;
      bbInit();
      BBR.innerHTML = bbSkeleton();
      icons(BBR);
      bbWire();
      section.dataset.booksMounted = '1';
    }
    bbRender();
    if (!RM()) replay(BBR, 'cb-enter');
  });
})();
