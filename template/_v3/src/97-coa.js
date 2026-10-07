/* 97-coa.js: Chart of Accounts engine + Account Ledger engine (Agent B)
   Mounts into section shells in 46-coa.html. Uses window.FS (95-ui.js / 99-app.js). */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ helpers */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var FSX = function () { return window.FS || {}; };
  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }
  function ic(n, cls) { return '<i data-lucide="' + n + '"' + (cls ? ' class="' + cls + '"' : '') + '></i>'; }
  function group(n) { return Math.round(n).toLocaleString('en-US'); }
  function fmt(n, d) {
    d = d || 0;
    if (FSX().fmt) return FSX().fmt(n, d);
    return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function money(n, dec) {
    dec = dec == null ? 2 : dec;
    if (FSX().money) return FSX().money(n, { dec: dec, rs: true });
    var neg = n < 0, s = Math.abs(n).toFixed(dec).split('.');
    return (neg ? '-' : '') + 'Rs ' + group(+s[0]) + (dec ? '<span class="dec">.' + s[1] + '</span>' : '');
  }
  /* table amount without Rs, muted decimals */
  function amt(n) {
    var s = Math.abs(n).toFixed(2).split('.');
    return group(+s[0]) + '<span class="dec">.' + s[1] + '</span>';
  }
  function paint(root) {
    try {
      if (FSX().icons) FSX().icons(root);
      else if (window.lucide) window.lucide.createIcons();
    } catch (e) { /* icons are cosmetic */ }
  }
  function toast(msg, opts) {
    if (FSX().toast) return FSX().toast(msg, opts || {});
    console.log('[toast]', msg);
  }
  function menu(anchor, items) {
    if (FSX().menu) return FSX().menu(anchor, items);
    console.warn('FS.menu unavailable');
  }
  function countUp(el) {
    if (!el) return;
    if (FSX().countUp) { try { FSX().countUp(el); } catch (e) { } }
  }
  function openModal(id) {
    var el = document.getElementById(id);
    if (FSX().openModal) FSX().openModal(id);
    else if (el) el.classList.add('open');
    if (el) paint(el);
  }
  function closeModal(id) {
    if (FSX().closeOverlays) FSX().closeOverlays();
    else { var el = document.getElementById(id); if (el) el.classList.remove('open'); }
  }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
  function reduced() { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { var a = hash(String(seed)); return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function hl(text, q) {
    text = String(text);
    if (!q) return esc(text);
    var lo = text.toLowerCase(), ql = q.toLowerCase(), out = '', i = 0, j;
    while ((j = lo.indexOf(ql, i)) !== -1) { out += esc(text.slice(i, j)) + '<mark>' + esc(text.slice(j, j + q.length)) + '</mark>'; i = j + q.length; }
    return out + esc(text.slice(i));
  }
  function curRoute() { return (location.hash || '').replace(/^#\/?/, '').split('?')[0]; }

  /* robust route hook: works whether FS.onEnter is defined before or after this script */
  function onRoute(route, fn) {
    var hooked = false;
    function run() {
      var sec = document.querySelector('.screen[data-route="' + route + '"]');
      if (sec) fn(sec);
    }
    function hook() {
      if (hooked) return true;
      if (FSX().onEnter) { hooked = true; FSX().onEnter(route, function (sec) { fn(sec || document.querySelector('.screen[data-route="' + route + '"]')); }); return true; }
      return false;
    }
    if (hook()) return;
    document.addEventListener('DOMContentLoaded', function () {
      if (!hook()) window.addEventListener('hashchange', function () { if (curRoute() === route) run(); });
      if (curRoute() === route) setTimeout(run, 30);
    });
  }

  /* ------------------------------------------------------------------ data */
  var CLS = {
    '1': { key: 'A', name: 'Assets', tone: 'ct-green', icon: 'database', nature: 'Dr', sub: ['Cash', 'Bank', 'Receivable', 'Inventory', 'Prepayment', 'Fixed asset', 'Deposit'] },
    '2': { key: 'L', name: 'Liabilities', tone: 'ct-red', icon: 'landmark', nature: 'Cr', sub: ['Payable', 'Accrual', 'Tax', 'Statutory', 'Borrowing'] },
    '3': { key: 'E', name: 'Equity', tone: 'ct-blue', icon: 'pie-chart', nature: 'Cr', sub: ['Capital', 'Reserve', 'Drawings'] },
    '4': { key: 'I', name: 'Income', tone: 'ct-violet', icon: 'chart-column', nature: 'Cr', sub: ['Sales', 'Other income', 'Finance income'] },
    '5': { key: 'X', name: 'Expenses', tone: 'ct-orange', icon: 'shopping-bag', nature: 'Dr', sub: ['Cost of sales', 'Employee cost', 'Premises', 'Depreciation', 'General expense'] }
  };
  var RAW = [
    ['1000', 'Assets', 'Resources controlled by the company', 'database'],
    ['1100', 'Current Assets', 'Expected to convert to cash within a year', 'folder-open'],
    ['1110', 'Cash in Hand', 'Physical cash held at branches', 'wallet-cards'],
    ['1110-01', 'Cash in Hand — Lahore HQ', 'Main cash book · head office', 'coins', 2942320, 'Cash'],
    ['1110-02', 'Petty Cash — Karachi', 'Imprest float · Karachi branch', 'coins', 50000, 'Cash', 'Karachi'],
    ['1120', 'Bank Accounts', 'Current and savings accounts', 'landmark'],
    ['1120-01', 'Meezan Bank — 0123', 'Main operating account', 'landmark', 21452900, 'Bank'],
    ['1120-02', 'HBL — 8721', 'Collections account', 'landmark', 11988640, 'Bank'],
    ['1120-03', 'UBL — 2294', 'Payroll account', 'landmark', 7346200, 'Bank'],
    ['1120-04', 'Bank Alfalah — 5510', 'Vendor payments', 'landmark', 4435240, 'Bank'],
    ['1130', 'Trade Receivables', 'Amounts due from customers', 'users'],
    ['1130-01', 'Accounts Receivable — Trade', 'Customer control account', 'users', 18642750, 'Receivable'],
    ['1140', 'Inventory', 'Goods available for sale', 'boxes'],
    ['1140-01', 'Finished Goods', 'Lahore and Karachi warehouses', 'boxes', 28050210, 'Inventory'],
    ['1140-02', 'Raw Materials', 'Production inputs', 'boxes', 18420000, 'Inventory'],
    ['1140-03', 'Packing Material', 'Cartons, labels and film', 'boxes', 6334000, 'Inventory'],
    ['1150', 'Advances & Prepayments', 'Deposits, advances and prepaid costs', 'wallet-cards'],
    ['1150-01', 'Advances to Staff', 'Salary and travel advances', 'users', 1240000, 'Prepayment'],
    ['1150-02', 'Security Deposits', 'Utilities and leases', 'file-text', 3500000, 'Deposit'],
    ['1150-03', 'Prepaid Rent', 'Lahore HQ lease', 'file-text', 2700000, 'Prepayment'],
    ['1150-04', 'Advance Income Tax', 'Adjustable withholding', 'file-text', 4323440, 'Prepayment'],
    ['1200', 'Non-current Assets', 'Long-term assets and investments', 'briefcase'],
    ['1210', 'Property, Plant & Equipment', 'At cost less depreciation', 'briefcase'],
    ['1210-01', 'Land & Building', 'Lahore HQ and Sundar plant', 'landmark', 42000000, 'Fixed asset'],
    ['1210-02', 'Plant & Machinery', 'Production lines', 'settings', 24600000, 'Fixed asset'],
    ['1210-03', 'Vehicles', 'Delivery fleet and staff cars', 'briefcase', 9850000, 'Fixed asset'],
    ['1210-04', 'Furniture & Fixtures', 'Offices and showrooms', 'boxes', 2184700, 'Fixed asset'],
    ['1210-05', 'Computers & IT Equipment', 'Laptops, servers and network', 'database', 3800000, 'Fixed asset'],
    ['1220', 'Long-term Deposits', 'Refundable deposits', 'file-text'],
    ['1220-01', 'LESCO Security Deposit', 'Industrial connection', 'file-text', 1000000, 'Deposit'],
    ['2000', 'Liabilities', 'Obligations to external parties', 'landmark'],
    ['2100', 'Current Liabilities', 'Due within twelve months', 'folder-open'],
    ['2110', 'Trade Payables', 'Amounts owed to suppliers', 'shopping-bag'],
    ['2110-01', 'Accounts Payable — Trade', 'Vendor control account', 'shopping-bag', 9874200, 'Payable'],
    ['2120', 'Accrued Liabilities', 'Expenses incurred, not yet paid', 'calendar-days'],
    ['2120-01', 'Accrued Salaries', 'September payroll', 'users', 14620000, 'Accrual'],
    ['2120-02', 'Accrued Expenses', 'Utilities and services', 'file-text', 2340200, 'Accrual'],
    ['2130', 'Tax Payables', 'FBR and PRA liabilities', 'file-text'],
    ['2130-01', 'Sales Tax Payable (GST 18%)', 'Output tax less input tax', 'file-text', 3184950, 'Tax'],
    ['2130-02', 'WHT Payable u/s 153', 'Deducted from suppliers', 'file-text', 412800, 'Tax'],
    ['2140', 'Statutory Payables', 'Employee benefit contributions', 'users'],
    ['2140-01', 'EOBI, PESSI & PF Payable', 'Monthly contributions', 'users', 1380000, 'Statutory'],
    ['2150', 'Short-term Borrowings', 'Running finance facilities', 'landmark'],
    ['2150-01', 'Running Finance — Meezan', 'Limit Rs 25 million', 'landmark', 11400000, 'Borrowing'],
    ['2200', 'Non-current Liabilities', 'Due after twelve months', 'briefcase'],
    ['2210', 'Long-term Financing', 'Secured term loans', 'landmark'],
    ['2210-01', 'Term Finance — HBL', '5-year facility · KIBOR + 2%', 'landmark', 35200000, 'Borrowing'],
    ['3000', 'Equity', "Owners' residual interest", 'pie-chart'],
    ['3100', 'Capital & Reserves', 'Share capital and retained earnings', 'folder-open'],
    ['3110', 'Share Capital', 'Issued and paid-up', 'pie-chart'],
    ['3110-01', 'Ordinary Share Capital', '10,000,000 shares of Rs 10', 'pie-chart', 100000000, 'Capital'],
    ['3120', 'Reserves', 'Accumulated profits', 'coins'],
    ['3120-01', 'Unappropriated Profit', 'Retained earnings', 'coins', 36448250, 'Reserve'],
    ['3120-02', "Directors' Current Account", 'Drawings and contributions', 'users', 0, 'Drawings', null, 'Inactive'],
    ['4000', 'Income', 'Revenue from operations', 'chart-column'],
    ['4100', 'Revenue from Operations', 'Core sales income', 'trending-up'],
    ['4110', 'Sales', 'Gross sales net of returns', 'shopping-bag'],
    ['4110-01', 'Sales — Local', 'Domestic customers', 'shopping-bag', 43215400, 'Sales'],
    ['4110-02', 'Sales — Export', 'Middle East and UK buyers', 'shopping-bag', 4460000, 'Sales'],
    ['4200', 'Other Income', 'Non-operating income', 'coins'],
    ['4210', 'Finance Income', 'Profit on deposits', 'coins'],
    ['4210-01', 'Profit on Bank Deposits', 'Meezan and Alfalah PLS', 'coins', 645200, 'Finance income'],
    ['4210-02', 'Gain on Disposal of Assets', 'Fixed asset disposals', 'coins', 0, 'Other income'],
    ['5000', 'Expenses', 'Costs of running the business', 'shopping-bag'],
    ['5100', 'Cost of Sales', 'Direct costs of goods sold', 'boxes'],
    ['5110', 'Cost of Goods Sold', 'Materials, freight and conversion', 'boxes'],
    ['5110-01', 'Cost of Goods Sold', 'Materials consumed and conversion', 'boxes', 18620590, 'Cost of sales'],
    ['5110-02', 'Freight Inward', 'TCS and carriage', 'boxes', 4260000, 'Cost of sales'],
    ['5200', 'Administrative Expenses', 'Overheads', 'briefcase'],
    ['5210', 'Employee Costs', 'Salaries and benefits', 'users'],
    ['5210-01', 'Salaries & Wages', 'Monthly payroll', 'users', 10965000, 'Employee cost'],
    ['5220', 'Premises & Utilities', 'Rent, power and services', 'landmark'],
    ['5220-01', 'Rent — Lahore HQ', 'Office lease', 'file-text', 1350000, 'Premises'],
    ['5220-02', 'Electricity & Utilities', 'LESCO, SNGPL and PTCL', 'activity', 1642810, 'Premises'],
    ['5220-03', 'Stationery & Office Supplies', 'Daraz Business', 'file-text', 0, 'General expense'],
    ['5230', 'Depreciation', 'Charge for the period', 'activity'],
    ['5230-01', 'Depreciation Expense', 'Straight-line and reducing balance', 'activity', 1068400, 'Depreciation']
  ];
  var MOD_DATES = ['30 Sep 2026', '28 Sep 2026', '26 Sep 2026', '22 Sep 2026', '18 Sep 2026', '12 Sep 2026', '04 Sep 2026', '29 Aug 2026', '21 Aug 2026', '14 Aug 2026'];
  var MOD_BY = ['S. Javed', 'H. Ali', 'S. Javed', 'A. Raza', 'H. Ali'];

  function levelOf(code) {
    if (code.indexOf('-') > 0) return 4;
    if (code.slice(1) === '000') return 1;
    if (code.slice(2) === '00') return 2;
    return 3;
  }
  function parentOf(code) {
    var l = levelOf(code);
    if (l === 4) return code.split('-')[0];
    if (l === 3) return code.slice(0, 2) + '00';
    if (l === 2) return code[0] + '000';
    return null;
  }
  function mkAccount(r) {
    var code = r[0], lv = levelOf(code), cls = CLS[code[0]], R = rng(code);
    var own = lv === 4 ? (r[4] || 0) : 0;
    var chg = own === 0 && lv === 4 ? 0 : +((R() < 0.18 ? -(0.3 + R() * 1.4) : (0.4 + R() * 4.2)).toFixed(1));
    return {
      code: code, name: r[1], desc: r[2], icon: r[3], own: own, sub: r[5] || (lv === 4 ? cls.sub[0] : null),
      branch: r[6] || (lv === 4 ? 'Lahore HQ' : 'All branches'), status: r[7] || 'Active',
      level: lv, parent: parentOf(code), cls: code[0], nature: cls.nature, chg: chg,
      opening: lv === 4 ? Math.round(own * (0.62 + R() * 0.3) / 10) * 10 : 0,
      mod: { d: MOD_DATES[Math.floor(R() * MOD_DATES.length)], by: MOD_BY[Math.floor(R() * MOD_BY.length)] }
    };
  }
  var ACC = RAW.map(mkAccount);
  var BY = {};
  function reindex() { BY = {}; ACC.forEach(function (a) { BY[a.code] = a; }); balMemo = {}; kidsMemo = null; }
  var balMemo = {}, kidsMemo = null;
  function kids(code) {
    if (!kidsMemo) {
      kidsMemo = {};
      ACC.forEach(function (a) { var p = a.parent || '_'; (kidsMemo[p] = kidsMemo[p] || []).push(a); });
      Object.keys(kidsMemo).forEach(function (k) { kidsMemo[k].sort(function (x, y) { return x.code < y.code ? -1 : 1; }); });
    }
    return kidsMemo[code || '_'] || [];
  }
  function bal(code) {
    if (balMemo[code] != null) return balMemo[code];
    var a = BY[code], k = kids(code), v = a ? a.own : 0;
    k.forEach(function (c) { v += bal(c.code); });
    return (balMemo[code] = v);
  }
  function kind(a) { return a.level <= 2 ? 'Header' : a.level === 3 ? 'Group' : 'Postable'; }
  function ancestors(code) { var out = [], p = BY[code] && BY[code].parent; while (p) { out.push(p); p = BY[p] && BY[p].parent; } return out; }
  function pathName(code) { return ancestors(code).reverse().map(function (c) { return BY[c].name; }).join(' › '); }
  reindex();

  /* sparkline paths: deterministic, trending in the direction of `up` */
  function series(seed, n, up) {
    var R = rng(seed), v = 50, out = [];
    for (var i = 0; i < n; i++) { v += (R() - 0.42) * 14 * (up ? 1 : -1) + (up ? 2.2 : -2.2); out.push(v); }
    return out;
  }
  function sparkSVG(seed, up, w, h, area) {
    var s = series(seed, 9, up), mn = Math.min.apply(null, s), mx = Math.max.apply(null, s), rg = (mx - mn) || 1;
    var pts = s.map(function (v, i) { return [(i / (s.length - 1)) * w, h - 2 - ((v - mn) / rg) * (h - 4)]; });
    var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join('');
    return '<svg class="coa-spark" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true">' +
      (area ? '<path class="a" d="' + d + 'L' + w + ' ' + h + 'L0 ' + h + 'Z"/>' : '') +
      '<path class="l" pathLength="1" d="' + d + '"/></svg>';
  }
  function barsSVG() {
    var hs = [8, 12, 11, 16, 19, 24], w = 64, h = 24, bw = 7, gap = (w - hs.length * bw) / (hs.length - 1);
    return '<svg class="coa-spark" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true">' + hs.map(function (v, i) {
      return '<rect x="' + (i * (bw + gap)).toFixed(1) + '" y="' + (h - v) + '" width="' + bw + '" height="' + v + '" rx="2"/>';
    }).join('') + '</svg>';
  }

  /* ================================================================== CHART OF ACCOUNTS */
  var S = {
    open: new Set(['1000', '1100', '1110', '1120']), qClosed: new Set(), sel: new Set(),
    q: '', cat: 'all', type: 'all', status: 'all', level: 'all',
    density: 'comfy', view: 'table', sort: { key: null, dir: 1 }, page: 1, per: 25, focus: null,
    nameW: +(lsGet('fs-coa-name-w') || 0) || 0, created: 0, rows: []
  };
  var KPI = [
    ['1000', 'Total Assets', 'ct-green', 'database', 2.5],
    ['2000', 'Liabilities', 'ct-red', 'landmark', -1.2],
    ['3000', 'Equity', 'ct-blue', 'pie-chart', 3.1],
    ['4000', 'Income', 'ct-violet', 'chart-column', 4.6],
    ['5000', 'Expenses', 'ct-orange', 'shopping-bag', -0.8]
  ];
  var C = null; /* root element of the coa screen */

  function coaShell() {
    var k = KPI.map(function (r) {
      var up = r[4] >= 0;
      return '<article class="coa-stat ' + r[2] + '" data-kpi="' + r[0] + '">' +
        '<span class="coa-stat-icon">' + ic(r[3]) + '</span><small>' + r[1] + (r[0] >= '4000' ? ' <span style="color:var(--muted-2)">· YTD</span>' : '') + '</small>' + sparkSVG('kpi' + r[0], up, 64, 24, true) +
        '<b class="v num">' + money(bal(r[0])) + '</b>' +
        '<div class="coa-stat-foot"><em class="' + (up ? 'up' : 'down') + '"><b>' + (up ? '▲ +' : '▼ ') + r[4].toFixed(1) + '%</b> vs last period</em></div></article>';
    }).join('') +
      '<article class="coa-stat t-green" data-kpi="count"><span class="coa-stat-icon">' + ic('list-tree') + '</span><small>Total Accounts</small>' + barsSVG() +
      '<b class="v num" data-acc-count>' + ACC.length + '</b><div class="coa-stat-foot"><em class="up"><b data-acc-new>▲ +12 new</b> this FY</em></div></article>';

    var catOpts = '<option value="all">All Accounts</option>' + Object.keys(CLS).map(function (d) { return '<option value="' + d + '">' + CLS[d].name + '</option>'; }).join('');
    var sel = function (name, opts) { return '<label class="coa-select">' + '<select data-f="' + name + '" aria-label="' + name + ' filter">' + opts + '</select>' + ic('chevron-down') + '</label>'; };
    var hd = function (cls, inner) { return '<span class="' + cls + '">' + inner + '</span>'; };
    return '' +
      '<div class="coa-head">' +
      '<div class="coa-title"><span class="coa-title-icon">' + ic('book-open') + '</span><div><h1>Chart of Accounts</h1><p>Manage your chart of accounts and organize it into sub-accounts</p></div></div>' +
      '<div class="coa-tools">' +
      '<label class="coa-search" data-search>' + ic('search') + '<input type="text" placeholder="Search accounts or codes…" aria-label="Search accounts" data-q><kbd>⌘ K</kbd><button class="clr" type="button" aria-label="Clear search" data-qclr>' + ic('x') + '</button></label>' +
      '<div class="coa-seg" role="tablist" aria-label="View"><button class="active" data-view="table" role="tab">' + ic('table-2') + 'Table View</button><button data-view="map" role="tab">' + ic('network') + 'Hierarchy Map</button></div>' +
      '<label class="coa-select">' + ic('filter') + '<select data-f="cat" aria-label="Account class">' + catOpts + '</select>' + ic('chevron-down') + '</label>' +
      '<button class="coa-btn" data-act="import">' + ic('upload') + 'Import</button>' +
      '<button class="coa-btn" data-act="export">' + ic('download') + 'Export</button>' +
      '<div class="coa-split"><button class="coa-btn primary" data-act="add">' + ic('plus') + 'Add Account</button><button class="coa-btn primary caret" data-act="addmenu" aria-label="More add options">' + ic('chevron-down') + '</button></div>' +
      '</div></div>' +
      '<div class="coa-stats">' + k + '</div>' +
      '<div class="coa-toolbar">' +
      '<label class="coa-check big" title="Select all on this page"><input type="checkbox" data-selall aria-label="Select all visible">' + '<i>' + ic('check') + '</i></label>' +
      '<b class="coa-selcount" data-selcount>0 selected</b><span class="coa-vsep"></span>' +
      '<div class="coa-bulk">' +
      '<button class="coa-btn" data-bulk="edit" title="Edit" disabled>' + ic('pencil') + '<span class="lbl">Edit</span></button>' +
      '<button class="coa-btn" data-bulk="move" title="Move" disabled>' + ic('folder-tree') + '<span class="lbl">Move</span></button>' +
      '<button class="coa-btn" data-bulk="activate" title="Activate" disabled>' + ic('check') + '<span class="lbl">Activate</span></button>' +
      '<button class="coa-btn" data-bulk="deactivate" title="Deactivate" disabled>' + ic('x') + '<span class="lbl">Deactivate</span></button>' +
      '<button class="coa-btn danger" data-bulk="delete" disabled>' + ic('trash-2') + 'Delete</button>' +
      '<button class="coa-btn" data-act="more">More ' + ic('chevron-down') + '</button>' +
      '</div>' +
      '<div class="coa-toolbar-right">' +
      sel('type', '<option value="all">All Types</option><option>Header</option><option>Group</option><option>Postable</option>') +
      sel('status', '<option value="all">All Statuses</option><option>Active</option><option>Inactive</option>') +
      sel('level', '<option value="all">All Levels</option><option value="1">Level 1</option><option value="2">Level 2</option><option value="3">Level 3</option><option value="4">Level 4</option>') +
      '<button class="coa-btn" data-act="reset">Reset</button>' +
      '<div class="coa-seg icons" aria-label="Density"><button data-density="list" title="Compact">' + ic('list') + '</button><button class="active" data-density="comfy" title="Comfortable">' + ic('list-tree') + '</button><button data-density="grid" title="Spacious">' + ic('layout-grid') + '</button></div>' +
      '<button class="coa-btn icon" data-act="settings" aria-label="Table settings">' + ic('settings') + '</button>' +
      '</div></div>' +
      '<div class="coa-views">' +
      '<div class="coa-view" data-v="table"><section class="coa-table d-comfy" data-plain>' +
      '<div class="coa-scroll"><div class="coa-grid" role="treegrid" aria-label="Chart of accounts" tabindex="0">' +
      '<div class="coa-tr head" role="row">' +
      hd('c-check', '<label class="coa-check"><input type="checkbox" data-selall aria-label="Select page"><i>' + ic('check') + '</i></label>') +
      hd('c-name sort" data-sort="name', 'Account Name ' + ic('arrow-up-down', 'si') + '<span class="coa-resizer" data-resize role="separator" aria-orientation="vertical" aria-label="Resize account name column"></span>') +
      hd('sort" data-sort="code', ic('tag') + 'Code ' + ic('arrow-up-down', 'si')) +
      hd('c-type', ic('filter') + 'Type') +
      hd('c-parent', ic('folder-tree') + 'Parent Account') +
      hd('c-subs', ic('network') + '<span class="full">Sub-accounts</span><span class="short">Sub-accts</span>') +
      hd('num sort" data-sort="bal', ic('coins') + 'Balance (PKR) ' + ic('arrow-up-down', 'si')) +
      hd('', ic('trending-up') + 'Change') +
      hd('', ic('calendar-days') + 'Last Modified') +
      hd('', ic('activity') + 'Status') +
      hd('c-actions', 'Actions') +
      '</div><div class="coa-body" role="rowgroup"></div></div></div>' +
      '<div class="coa-foot"><span data-showing></span><div class="coa-foot-right">' +
      '<span class="row" style="display:flex;gap:6px;align-items:center"><button class="coa-btn" style="height:30px;padding:0 10px" data-act="expandall">' + ic('chevron-down') + 'Expand all</button><button class="coa-btn" style="height:30px;padding:0 10px" data-act="collapseall">' + ic('chevron-right') + 'Collapse all</button></span>' +
      '<span style="display:flex;align-items:center;gap:8px">Rows per page <label class="coa-select"><select data-per aria-label="Rows per page"><option>10</option><option selected>25</option><option>50</option><option>100</option></select>' + ic('chevron-down') + '</label></span>' +
      '<div class="coa-pager" data-pager></div>' +
      '<label class="coa-goto">Go to page <input type="number" min="1" value="1" data-goto aria-label="Go to page"></label>' +
      '</div></div></section></div>' +
      '<div class="coa-view off" data-v="map"><div class="coa-map" data-map></div></div>' +
      '</div>';
  }

  /* ---------- visible rows ---------- */
  function filtersActive() { return S.type !== 'all' || S.status !== 'all' || S.level !== 'all'; }
  function computeRows() {
    var q = S.q.trim().toLowerCase(), active = !!q || filtersActive(), info = {};
    function selfMatch(a) {
      return (!q || a.code.toLowerCase().indexOf(q) !== -1 || a.name.toLowerCase().indexOf(q) !== -1) &&
        (S.type === 'all' || kind(a) === S.type) && (S.status === 'all' || a.status === S.status) &&
        (S.level === 'all' || a.level === +S.level);
    }
    function scan(a) {
      var m = selfMatch(a), d = false;
      kids(a.code).forEach(function (k) { if (scan(k)) d = true; });
      info[a.code] = { m: m, d: d };
      return m || d;
    }
    var roots = kids(null).filter(function (r) { return S.cat === 'all' || r.cls === S.cat; });
    roots.forEach(scan);
    function sorted(list) {
      if (!S.sort.key) return list;
      var k = S.sort.key, dir = S.sort.dir;
      return list.slice().sort(function (x, y) {
        var a = k === 'bal' ? bal(x.code) : k === 'name' ? x.name.toLowerCase() : x.code;
        var b = k === 'bal' ? bal(y.code) : k === 'name' ? y.name.toLowerCase() : y.code;
        return (a < b ? -1 : a > b ? 1 : 0) * dir;
      });
    }
    var rows = [];
    function walk(list, depth, lasts) {
      list = sorted(list.filter(function (n) { return !active || info[n.code].m || info[n.code].d; }));
      list.forEach(function (n, i) {
        var last = i === list.length - 1, inf = info[n.code];
        var isOpen = active ? (inf.d && !S.qClosed.has(n.code)) : S.open.has(n.code);
        var kc = kids(n.code).length;
        var r = { a: n, depth: depth, last: last, lasts: lasts.concat([last]), ctx: active && !inf.m, open: isOpen && kc > 0, kc: kc };
        rows.push(r);
        if (isOpen && kc) walk(kids(n.code), depth + 1, r.lasts);
      });
    }
    walk(roots, 1, []);
    return rows;
  }

  /* ---------- row html (state-free; state lives in classes) ---------- */
  var STEP = 28;
  function rowHTML(r) {
    var a = r.a, q = S.q.trim(), d = r.depth, guides = '';
    for (var k = 0; k <= d - 2; k++) {
      var x = 10 + k * STEP + 13;
      if (k === d - 2) guides += '<i class="coa-guide elbow' + (r.last ? ' end' : '') + '" style="left:' + x + 'px"></i>';
      else if (!r.lasts[k + 1]) guides += '<i class="coa-guide" style="left:' + x + 'px"></i>';
    }
    var b = bal(a.code), p = a.parent ? BY[a.parent] : null, chg = a.chg, cd = chg > 0 ? 'up' : chg < 0 ? 'down' : 'flat';
    var kd = kind(a);
    return '' +
      '<span class="c-check" role="gridcell"><label class="coa-check"><input type="checkbox" aria-label="Select ' + esc(a.name) + '" data-sel><i>' + ic('check') + '</i></label></span>' +
      '<span class="c-name" role="gridcell" style="padding-left:' + (10 + (d - 1) * STEP) + 'px">' + guides +
      (r.kc ? '<button class="tw" type="button" tabindex="-1" aria-label="Toggle ' + esc(a.name) + '" data-tw>' + ic('chevron-right') + '</button>' : '<i class="coa-nochev"></i>') +
      '<span class="coa-icon">' + ic(a.icon) + '</span>' +
      '<span class="coa-name"><b title="' + esc(a.name) + '">' + hl(a.name, q) + '</b><small>' + esc(a.desc || '') + '</small></span></span>' +
      '<span class="c-code" role="gridcell">' + hl(a.code, q) + '</span>' +
      '<span role="gridcell"><span class="coa-kind ' + kd.toLowerCase() + '">' + kd + '</span></span>' +
      '<span class="c-parent' + (p ? '' : ' none') + '" role="gridcell">' + (p ? '<em>' + esc(p.name) + ' (' + p.code + ')</em>' : '—') + '</span>' +
      '<span role="gridcell"><span class="coa-count' + (r.kc ? ' on' : '') + '">' + r.kc + '</span></span>' +
      '<span class="num c-balance' + (b === 0 ? ' zero' : '') + '" role="gridcell"><span>' + money(b) + '</span></span>' +
      '<span class="c-change ' + cd + '" role="gridcell"><em>' + (chg > 0 ? '▲ +' : chg < 0 ? '▼ ' : '● ') + chg.toFixed(1) + '%</em>' +
      (chg === 0 ? '<i class="coa-flat"></i>' : sparkSVG(a.code, chg > 0, 46, 18, false)) + '</span>' +
      '<span class="c-mod" role="gridcell"><b>' + a.mod.d + '</b><small>by ' + a.mod.by + '</small></span>' +
      '<span role="gridcell"><span class="coa-status ' + (a.status === 'Active' ? 'on' : 'off') + '">' + a.status + '</span></span>' +
      '<span class="c-actions" role="gridcell"><button type="button" tabindex="-1" aria-label="Actions for ' + esc(a.name) + '" data-rowmenu>' + ic('ellipsis-vertical') + '</button></span>';
  }

  /* ---------- keyed reconcile of the body ---------- */
  function pageRows() {
    var n = S.rows.length, pages = Math.max(1, Math.ceil(n / S.per));
    if (S.page > pages) S.page = pages;
    if (S.page < 1) S.page = 1;
    return S.rows.slice((S.page - 1) * S.per, S.page * S.per);
  }
  function renderBody(animate) {
    var body = $('.coa-body', C);
    if (!body) return;
    S.rows = computeRows();
    var rows = pageRows(), keep = {}, existing = {};
    animate = animate && !reduced();
    rows.forEach(function (r) { keep[r.a.code] = 1; });
    $$('.coa-tr', body).forEach(function (el) {
      if (el._leaving) { if (!animate && !el.classList.contains('remove')) el.parentNode.removeChild(el); return; }
      if (keep[el.dataset.code]) existing[el.dataset.code] = el;
      else if (animate) {
        el._leaving = true; el.classList.remove('enter', 'flash'); el.classList.add('leave');
        var kill = function () { if (el.parentNode) el.parentNode.removeChild(el); };
        el.addEventListener('animationend', kill, { once: true }); setTimeout(kill, 420);
      } else el.parentNode.removeChild(el);
    });
    var prev = null, dirty = false;
    rows.forEach(function (r) {
      var code = r.a.code, el = existing[code], html = rowHTML(r), isNew = !el;
      if (isNew) {
        el = document.createElement('div');
        el.dataset.code = code; el.setAttribute('role', 'row'); el.tabIndex = -1;
        el.innerHTML = html; el._h = html; dirty = true;
      } else if (el._h !== html) { el.innerHTML = html; el._h = html; dirty = true; }
      var cls = 'coa-tr lv' + r.a.level + ' ' + CLS[r.a.cls].tone + (r.a.level === 1 ? ' root' : '') + (r.ctx ? ' ctx' : '') +
        (r.a.status !== 'Active' ? ' inactive' : '') + (r.open ? ' open' : '') + (S.sel.has(code) ? ' sel' : '') + (S.focus === code ? ' focus' : '');
      if (el.classList.contains('enter') && !isNew) cls += ' enter';
      if (el.classList.contains('flash')) cls += ' flash';
      el.className = cls;
      el.setAttribute('aria-level', r.depth);
      if (r.kc) el.setAttribute('aria-expanded', r.open ? 'true' : 'false'); else el.removeAttribute('aria-expanded');
      el.setAttribute('aria-selected', S.sel.has(code) ? 'true' : 'false');
      el.tabIndex = S.focus === code ? 0 : -1;
      var cb = el.querySelector('[data-sel]'); if (cb) cb.checked = S.sel.has(code);
      var ref = prev ? prev.nextSibling : body.firstChild;
      while (ref && ref._leaving) ref = ref.nextSibling;
      if (ref !== el) body.insertBefore(el, ref);
      if (isNew && animate) {
        el.classList.add('enter');
        el.addEventListener('animationend', function h(e) { if (e.target === el) { el.classList.remove('enter'); el.removeEventListener('animationend', h); } });
      }
      prev = el;
    });
    var empty = $('.coa-empty', body);
    if (!rows.length) {
      if (!empty) {
        body.insertAdjacentHTML('beforeend', '<div class="coa-empty"><span class="coa-stat-icon ct-grey">' + ic('search') + '</span><b>No accounts match</b>Try a different code or name, or reset the filters.<div style="margin-top:12px"><button class="coa-btn" data-act="reset" style="display:inline-flex">Reset filters</button></div></div>');
        dirty = true;
      }
    } else if (empty) empty.remove();
    if (dirty) paint(body);
    renderFoot();
    syncSel();
  }
  function renderAll(animate) {
    renderBody(animate);
    if (S.view === 'map') renderMap(false);
  }

  /* ---------- footer / pager ---------- */
  function renderFoot() {
    var n = S.rows.length, pages = Math.max(1, Math.ceil(n / S.per)), from = n ? (S.page - 1) * S.per + 1 : 0, to = Math.min(n, S.page * S.per);
    var sh = $('[data-showing]', C);
    sh.innerHTML = 'Showing <b>' + from + '–' + to + '</b> of <b>' + n + '</b> rows · ' + ACC.length + ' accounts';
    var p = S.page, list = [], i;
    for (i = 1; i <= pages; i++) if (i === 1 || i === pages || Math.abs(i - p) <= 1) list.push(i); else if (list[list.length - 1] !== '…') list.push('…');
    var b = function (pg, label, dis, act) { return '<button type="button" data-page="' + pg + '"' + (dis ? ' disabled' : '') + (act ? ' class="active" aria-current="page"' : '') + '>' + label + '</button>'; };
    $('[data-pager]', C).innerHTML = b(1, '«', p === 1) + b(p - 1, ic('chevron-left'), p === 1) +
      list.map(function (x) { return x === '…' ? '<span class="gap">…</span>' : b(x, x, false, x === p); }).join('') +
      b(p + 1, ic('chevron-right'), p === pages) + b(pages, '»', p === pages);
    paint($('[data-pager]', C));
    var g = $('[data-goto]', C); g.max = pages; if (document.activeElement !== g) g.value = p;
  }

  /* ---------- selection ---------- */
  function syncSel() {
    var n = S.sel.size, pr = pageRows();
    var on = pr.filter(function (r) { return S.sel.has(r.a.code); }).length;
    $$('[data-selall]', C).forEach(function (cb) { cb.checked = pr.length > 0 && on === pr.length; cb.indeterminate = on > 0 && on < pr.length; });
    var sc = $('[data-selcount]', C); sc.textContent = n + ' selected'; sc.classList.toggle('on', n > 0);
    $$('[data-bulk]', C).forEach(function (b) { b.disabled = !n; });
    $$('.coa-body .coa-tr', C).forEach(function (el) {
      var s = S.sel.has(el.dataset.code); el.classList.toggle('sel', s); el.setAttribute('aria-selected', s ? 'true' : 'false');
      var cb = el.querySelector('[data-sel]'); if (cb) cb.checked = s;
    });
  }
  function toggleSel(code, force) {
    var s = force == null ? !S.sel.has(code) : force;
    if (s) S.sel.add(code); else S.sel.delete(code);
    syncSel();
  }

  /* ---------- focus / keyboard ---------- */
  function setFocus(code, scroll) {
    S.focus = code;
    $$('.coa-body .coa-tr', C).forEach(function (el) { var f = el.dataset.code === code; el.classList.toggle('focus', f); el.tabIndex = f ? 0 : -1; if (f) { el.focus({ preventScroll: !scroll }); if (scroll) el.scrollIntoView({ block: 'nearest' }); } });
  }
  function onKey(e) {
    if (e.target.closest('input,select,textarea')) return;
    var pr = pageRows(), idx = -1;
    pr.forEach(function (r, i) { if (r.a.code === S.focus) idx = i; });
    var r = pr[idx];
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); if (idx < pr.length - 1) setFocus(pr[idx + 1].a.code, true); else if (idx === -1 && pr[0]) setFocus(pr[0].a.code, true); break;
      case 'ArrowUp': e.preventDefault(); if (idx > 0) setFocus(pr[idx - 1].a.code, true); break;
      case 'Home': e.preventDefault(); if (pr[0]) setFocus(pr[0].a.code, true); break;
      case 'End': e.preventDefault(); if (pr.length) setFocus(pr[pr.length - 1].a.code, true); break;
      case 'ArrowRight': e.preventDefault(); if (r) { if (r.kc && !r.open) toggle(r.a.code); else if (r.open && pr[idx + 1]) setFocus(pr[idx + 1].a.code, true); } break;
      case 'ArrowLeft': e.preventDefault(); if (r) { if (r.open) toggle(r.a.code); else if (r.a.parent && BY[r.a.parent]) { var pi = pr.findIndex(function (x) { return x.a.code === r.a.parent; }); if (pi >= 0) setFocus(r.a.parent, true); } } break;
      case ' ': e.preventDefault(); if (r) toggleSel(r.a.code); break;
      case 'Enter': e.preventDefault(); if (r) inspect(r.a.code); break;
    }
  }

  /* ---------- expand / collapse ---------- */
  function toggle(code) {
    var active = !!S.q.trim() || filtersActive();
    if (active) { if (S.qClosed.has(code)) S.qClosed.delete(code); else S.qClosed.add(code); }
    else { if (S.open.has(code)) S.open.delete(code); else S.open.add(code); }
    renderBody(true);
    if (S.focus === code) setFocus(code, false);
  }
  function expandAll() { ACC.forEach(function (a) { if (kids(a.code).length) S.open.add(a.code); }); S.qClosed.clear(); renderBody(true); }
  function collapseAll() { S.open.clear(); ACC.forEach(function (a) { if (kids(a.code).length) S.qClosed.add(a.code); }); S.page = 1; renderBody(true); }

  /* ---------- KPI ---------- */
  function renderKpis(animate) {
    KPI.forEach(function (r) {
      var el = $('[data-kpi="' + r[0] + '"] .v', C); if (!el) return;
      el.innerHTML = money(bal(r[0]));
      if (animate) countUp(el);
    });
    var cnt = $('[data-acc-count]', C); cnt.textContent = ACC.length; if (animate) countUp(cnt);
    $('[data-acc-new]', C).textContent = '▲ +' + (12 + S.created) + ' new';
    var st = $('.coa-stats', C);
    if (animate && !reduced()) { st.classList.remove('draw'); void st.offsetWidth; st.classList.add('draw'); }
  }

  /* ---------- hierarchy map ---------- */
  function renderMap(animate) {
    var host = $('[data-map]', C), q = S.q.trim();
    var roots = kids(null);
    var card = function (a, lvl) {
      var b = bal(a.code), kc = kids(a.code).length;
      return '<div class="coa-map-card" data-code="' + a.code + '" tabindex="0"><span class="ic">' + ic(a.icon) + '</span><div class="bd"><b title="' + esc(a.name) + '">' + hl(a.name, q) + '</b><div class="ft"><code class="coa-map-code">' + a.code + (lvl === 3 && kc ? ' · ' + kc + (kc > 1 ? ' accts' : ' acct') : '') + '</code><span class="coa-map-bal' + (b ? '' : ' zero') + '">' + money(b, 0) + '</span></div></div></div>';
    };
    host.innerHTML = '<div class="coa-map-legend"><b>Account hierarchy</b>' + roots.map(function (r) { return '<span class="' + CLS[r.cls].tone + '"><i></i>' + r.name + '</span>'; }).join('') + '</div>' +
      '<div class="coa-map-main">' + roots.map(function (r) {
        var l2 = kids(r.code), tone = CLS[r.cls].tone;
        return '<div class="coa-map-branch ' + tone + '">' +
          '<div class="coa-map-root" data-code="' + r.code + '" tabindex="0"><span class="coa-map-root-icon">' + ic(CLS[r.cls].icon) + '</span><div class="coa-map-root-body"><b>' + hl(r.name, q) + '</b><code>' + r.code + ' · ' + kind(r) + '</code>' +
          '<div class="coa-map-root-foot"><span class="coa-map-sub">' + l2.length + (l2.length > 1 ? ' groups' : ' group') + '</span><span class="coa-map-bal">' + money(bal(r.code), 0) + '</span></div></div></div>' +
          '<div class="coa-map-l2" role="list">' + l2.map(function (s, si) {
            var l3 = kids(s.code);
            return '<div class="coa-map-l2-item' + (si === l2.length - 1 ? ' last' : '') + '" role="listitem">' + card(s, 2) +
              (l3.length ? '<div class="coa-map-l3" role="list">' + l3.map(function (g, gi) {
                return '<div class="coa-map-l3-item' + (gi === l3.length - 1 ? ' last' : '') + '" role="listitem">' + card(g, 3) + '</div>';
              }).join('') + '</div>' : '') + '</div>';
          }).join('') + '</div></div>';
      }).join('') + '</div>';
    paint(host);
    if (animate && !reduced()) { host.classList.remove('in'); void host.offsetWidth; host.classList.add('in'); }
  }
  function setView(v) {
    S.view = v;
    $$('[data-view]', C).forEach(function (b) { b.classList.toggle('active', b.dataset.view === v); b.setAttribute('aria-selected', b.dataset.view === v); });
    if (v === 'map') renderMap(true);
    $$('.coa-view', C).forEach(function (el) { el.classList.toggle('off', el.dataset.v !== v); });
  }

  /* ---------- inspector ---------- */
  function trendSVG(a) {
    var b = bal(a.code), R = rng('trend' + a.code), pts = [], v = b, M = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'];
    for (var i = 11; i >= 0; i--) { pts[i] = Math.max(0, v); v = v / (1 + (a.chg >= 0 ? 1 : -1) * (0.01 + R() * 0.05)) + (R() - 0.5) * b * 0.04; }
    var W = 400, H = 120, top = 14, bot = 22, mx = Math.max.apply(null, pts) || 1, mn = Math.min.apply(null, pts) * 0.92;
    if (mx === mn) mn = 0;
    var X = function (i) { return 8 + i * (W - 16) / 11; }, Y = function (val) { return top + (H - top - bot) * (1 - (val - mn) / ((mx - mn) || 1)); };
    var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(p).toFixed(1); }).join('');
    var grid = [0, 0.5, 1].map(function (f) { var y = top + (H - top - bot) * f; return '<line class="gl" x1="0" x2="' + W + '" y1="' + y + '" y2="' + y + '"/>'; }).join('');
    var hits = pts.map(function (p, i) { return '<rect class="hit" x="' + (X(i) - 16) + '" y="0" width="32" height="' + H + '" data-i="' + i + '"/>'; }).join('');
    return '<svg class="coa-trend" viewBox="0 0 ' + W + ' ' + H + '" data-pts="' + pts.map(Math.round).join(',') + '" role="img" aria-label="12-month balance trend">' +
      '<defs><linearGradient id="coaTrendGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--tc);stop-opacity:.26"/><stop offset="1" style="stop-color:var(--tc);stop-opacity:0"/></linearGradient></defs>' + grid +
      '<path class="ar" d="' + d + 'L' + X(11) + ' ' + (H - bot) + 'L' + X(0) + ' ' + (H - bot) + 'Z"/><path class="ln" pathLength="1" d="' + d + '"/>' +
      '<circle class="dot" r="4" cx="' + X(11) + '" cy="' + Y(pts[11]) + '"/>' +
      M.map(function (m, i) { return i % 2 === 1 || i === 11 ? '<text x="' + X(i) + '" y="' + (H - 6) + '" text-anchor="middle">' + m + '</text>' : ''; }).join('') +
      '<g class="hv"><line y1="' + top + '" y2="' + (H - bot) + '"/><circle class="dot" r="3.5"/><text class="tv" text-anchor="middle" y="9" style="font-weight:700;fill:var(--ink)"></text></g>' + hits + '</svg>';
  }
  function wireTrend(root) {
    var svg = $('.coa-trend', root); if (!svg) return;
    var pts = svg.dataset.pts.split(',').map(Number), hv = $('.hv', svg), M = ['Oct 25', 'Nov 25', 'Dec 25', 'Jan 26', 'Feb 26', 'Mar 26', 'Apr 26', 'May 26', 'Jun 26', 'Jul 26', 'Aug 26', 'Sep 26'];
    var W = 400, H = 120, top = 14, bot = 22, mx = Math.max.apply(null, pts) || 1, mn = Math.min.apply(null, pts) * 0.92; if (mx === mn) mn = 0;
    $$('.hit', svg).forEach(function (h) {
      h.addEventListener('mouseenter', function () {
        var i = +h.dataset.i, x = 8 + i * (W - 16) / 11, y = top + (H - top - bot) * (1 - (pts[i] - mn) / ((mx - mn) || 1));
        hv.classList.add('on');
        hv.querySelector('line').setAttribute('x1', x); hv.querySelector('line').setAttribute('x2', x);
        hv.querySelector('circle').setAttribute('cx', x); hv.querySelector('circle').setAttribute('cy', y);
        var t = hv.querySelector('.tv'); t.textContent = M[i] + ' · Rs ' + group(pts[i]); t.setAttribute('x', Math.min(W - 70, Math.max(70, x)));
      });
    });
    svg.addEventListener('mouseleave', function () { hv.classList.remove('on'); });
  }
  function postingsFor(a) {
    var L = LEDGER[a.code];
    if (L) {
      return L.tx.slice(-5).reverse().map(function (t) { return { v: t.vno, d: t.date, n: t.narr, c: t.contra, dr: t.dr, cr: t.cr }; });
    }
    if (a.level !== 4) {
      /* roll up: newest postings of descendants */
      var leaves = [], walk = function (c) { kids(c).forEach(function (k) { if (k.level === 4) leaves.push(k); else walk(k.code); }); };
      walk(a.code);
      var all = [];
      leaves.forEach(function (l) { all = all.concat(postingsFor(l).map(function (p) { p.c = l.name; return p; })); });
      return all.sort(function (x, y) { return x.d < y.d ? 1 : -1; }).slice(0, 5);
    }
    var R = rng('post' + a.code), out = [], b = bal(a.code) || 250000, types = a.nature === 'Dr' ? ['JV', 'BPV', 'CPV'] : ['JV', 'BRV', 'SI'];
    var narr = { A: ['Monthly adjustment', 'Transfer from Meezan Bank', 'Reclassification', 'Purchase — Siemens Pakistan', 'Accrual reversal'], L: ['Accrual — September', 'Payment to vendor', 'Monthly provision', 'Settlement — HBL', 'Tax deducted at source'], E: ['Profit appropriation', 'Directors contribution', 'Transfer to reserve', 'Opening adjustment', 'Dividend declared'], I: ['Invoice — Packages Ltd', 'Invoice — Engro Foods', 'Profit credited — Meezan', 'Invoice — Fatima Group', 'Credit note adjustment'], X: ['Bill — K-Electric', 'Payment — PTCL', 'Bill — LESCO', 'Daraz Business order', 'Monthly charge'] }[CLS[a.cls].key];
    for (var i = 0; i < 5; i++) {
      var day = 29 - i * 5 - Math.floor(R() * 3), t = types[i % types.length], v = Math.round(b * (0.01 + R() * 0.05) / 100) * 100 || 5000;
      var isDr = (a.nature === 'Dr') !== (i === 2);
      out.push({ v: vno(t, day, narr[i]), d: '2026-09-' + String(day).padStart(2, '0'), n: narr[i], c: a.nature === 'Dr' ? 'Meezan Bank — 0123' : 'Accounts Receivable — Trade', dr: isDr ? v : 0, cr: isDr ? 0 : v });
    }
    return out;
  }
  function fdate(iso) { var p = iso.split('-'); return p[2] + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+p[1] - 1] + ' ' + p[0]; }

  var drawerEl = null;
  function inspect(code) {
    var a = BY[code]; if (!a) return;
    setFocus(code, false);
    var tone = CLS[a.cls].tone, b = bal(code), p = a.parent ? BY[a.parent] : null, kd = kind(a), up = a.chg >= 0;
    var posts = postingsFor(a);
    var html = '<div class="coa-insp ' + tone + '">' +
      '<div class="coa-insp-head"><span class="coa-icon">' + ic(a.icon) + '</span><div style="min-width:0"><code>' + a.code + ' · ' + esc(pathName(code) || 'Top level') + '</code><h3>' + esc(a.name) + '</h3>' +
      '<div class="coa-insp-chips"><span class="coa-kind ' + kd.toLowerCase() + '">' + kd + '</span><span class="coa-status ' + (a.status === 'Active' ? 'on' : 'off') + '">' + a.status + '</span><span class="coa-chip tone">' + CLS[a.cls].name + '</span><span class="coa-chip">' + (a.nature === 'Dr' ? 'Debit' : 'Credit') + ' nature</span></div></div></div>' +
      '<div class="coa-insp-card"><small><span>Current balance · 30 Sep 2026</span><span>PKR</span></small><b class="big" data-ib>' + money(b) + '</b>' +
      '<em class="' + (up ? '' : 'down') + '">' + (up ? '▲ +' : '▼ ') + a.chg.toFixed(1) + '% vs last period</em>' + trendSVG(a) + '</div>' +
      '<div class="coa-props">' +
      '<div><span>Account type</span><b>' + kd + (a.sub ? ' · ' + esc(a.sub) : '') + '</b></div>' +
      '<div><span>Nature</span><b>' + (a.nature === 'Dr' ? 'Debit (Dr)' : 'Credit (Cr)') + '</b></div>' +
      '<div><span>Parent</span><b>' + (p ? esc(p.name) + ' (' + p.code + ')' : '—') + '</b></div>' +
      '<div><span>Level</span><b>Level ' + a.level + ' of 4</b></div>' +
      '<div><span>Currency</span><b>PKR · Pakistani Rupee</b></div>' +
      '<div><span>Branch</span><b>' + esc(a.branch) + '</b></div>' +
      '<div><span>Opening (01 Jul 2026)</span><b>' + (a.level === 4 ? money(a.opening, 0) : 'Roll-up') + '</b></div>' +
      '<div><span>Last modified</span><b>' + a.mod.d + ' · ' + a.mod.by + '</b></div>' +
      '</div>' +
      '<div class="coa-sec-t"><span>Recent postings</span><a href="#/app/accounting/ledger" data-coa-act="ledger" data-code="' + code + '">View all</a></div>' +
      '<div class="coa-posts">' + (posts.length ? posts.map(function (t) {
        return '<div class="coa-post"><b>' + t.v + '</b><span class="amt ' + (t.dr ? 'dr' : 'cr') + '">' + fmt(t.dr || t.cr, 2) + '<i>' + (t.dr ? 'Dr' : 'Cr') + '</i></span><small>' + fdate(t.d) + ' · ' + esc(t.n) + '</small><small style="text-align:right">' + esc(t.c) + '</small></div>';
      }).join('') : '<div class="coa-post"><small>No postings yet.</small></div>') + '</div>' +
      '</div>';
    var foot = '<div class="coa-insp-actions" style="width:100%"><a class="coa-btn primary" href="#/app/accounting/ledger" data-coa-act="ledger" data-code="' + code + '" style="text-decoration:none">' + ic('book-open') + 'View Ledger</a>' +
      '<button class="coa-btn" data-coa-act="addsub" data-code="' + code + '"' + (a.level >= 4 ? ' disabled title="Postable accounts cannot have sub-accounts"' : '') + '>' + ic('plus') + 'Add sub-account</button>' +
      '<button class="coa-btn" data-coa-act="edit" data-code="' + code + '">' + ic('pencil') + 'Edit</button></div>';
    if (FSX().drawer) {
      drawerEl = FSX().drawer({ title: 'Account details', subtitle: a.code + ' · ' + a.name, html: html, foot: foot });
      var root = drawerEl || document;
      paint(drawerEl || undefined);
      wireTrend(root);
      countUp($('[data-ib]', root));
    } else {
      ownDrawer(a, html + '<div style="margin-top:16px">' + foot + '</div>');
    }
  }
  function ownDrawer(a, html) {
    closeOwnDrawer();
    var scrim = document.createElement('div'); scrim.className = 'coa-drawer-scrim';
    var d = document.createElement('aside'); d.className = 'coa-drawer'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', 'Account details');
    d.innerHTML = '<div class="coa-drawer-h"><div><b>Account details</b><small>' + esc(a.code + ' · ' + a.name) + '</small></div><button class="coa-btn icon" data-x aria-label="Close">' + ic('x') + '</button></div><div class="coa-drawer-b">' + html + '</div>';
    document.body.appendChild(scrim); document.body.appendChild(d);
    paint(d); wireTrend(d);
    requestAnimationFrame(function () { scrim.classList.add('on'); d.classList.add('on'); });
    scrim.onclick = closeOwnDrawer; $('[data-x]', d).onclick = closeOwnDrawer;
    drawerEl = d;
  }
  function closeOwnDrawer() {
    $$('.coa-drawer,.coa-drawer-scrim').forEach(function (el) { el.classList.remove('on'); setTimeout(function () { el.remove(); }, 300); });
  }
  function closeDrawer() {
    if (FSX().closeOverlays) FSX().closeOverlays();
    closeOwnDrawer();
  }
  /* actions inside the inspector (delegated on document so it works with any drawer host) */
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-coa-act]'); if (!b) return;
    var code = b.dataset.code, act = b.dataset.coaAct;
    if (act === 'ledger') { window.FSLedgerAccount = code; closeDrawer(); return; }
    e.preventDefault();
    if (b.disabled) return;
    closeDrawer();
    setTimeout(function () { if (act === 'addsub') openAdd({ parent: code }); if (act === 'edit') openAdd({ edit: code }); }, 120);
  });

  /* ---------- row menu ---------- */
  function rowMenu(btn, code) {
    var a = BY[code]; if (!a) return;
    var items = [];
    if (a.level < 4) items.push({ label: 'Add sub-account', icon: 'plus', onClick: function () { openAdd({ parent: code }); } });
    else items.push({ label: 'Add sibling account', icon: 'plus', onClick: function () { openAdd({ parent: a.parent }); } });
    items.push({ label: 'Edit', icon: 'pencil', onClick: function () { openAdd({ edit: code }); } });
    items.push({ label: 'View ledger', icon: 'book-open', onClick: function () { window.FSLedgerAccount = code; location.hash = '#/app/accounting/ledger'; } });
    items.push({ label: 'Open details', icon: 'file-text', onClick: function () { inspect(code); } });
    items.push({ sep: true });
    items.push(a.status === 'Active'
      ? { label: 'Deactivate', icon: 'x', onClick: function () { setStatus([code], 'Inactive'); } }
      : { label: 'Activate', icon: 'check', onClick: function () { setStatus([code], 'Active'); } });
    items.push({ label: 'Delete', icon: 'trash-2', danger: true, onClick: function () { openDelete(code); } });
    menu(btn, items);
  }

  /* ---------- status (single + bulk) ---------- */
  function setStatus(codes, status) {
    var prev = codes.map(function (c) { return [c, BY[c].status]; });
    var changed = codes.filter(function (c) { return BY[c].status !== status; });
    codes.forEach(function (c) { BY[c].status = status; BY[c].mod = { d: '01 Oct 2026', by: 'S. Javed' }; });
    renderAll(false);
    var msg = changed.length ? (changed.length === 1 ? BY[changed[0]].name + ' ' : changed.length + ' accounts ') + (status === 'Active' ? 'activated' : 'deactivated') : 'Already ' + status.toLowerCase();
    toast(msg, {
      tone: status === 'Active' ? 'good' : 'warn', undo: function () {
        prev.forEach(function (p) { if (BY[p[0]]) BY[p[0]].status = p[1]; });
        renderAll(false);
      }
    });
  }

  /* ---------- delete ---------- */
  var delCode = null;
  function blockers(code) {
    var out = [], k = kids(code).length, b = bal(code);
    if (k) out.push('It has <b>' + k + ' sub-account' + (k > 1 ? 's' : '') + '</b>. Move or delete them first.');
    if (b !== 0) out.push('It carries a balance of <b>' + money(b, 0) + '</b>. Transfer the balance to zero first.');
    return out;
  }
  function openDelete(code) {
    var a = BY[code]; if (!a) return;
    delCode = code;
    var bl = blockers(code), body = $('[data-coa-del-body]');
    body.innerHTML = '<div class="coa-del-acc ' + CLS[a.cls].tone + '"><span class="coa-icon ' + CLS[a.cls].tone + '">' + ic(a.icon) + '</span><div><b>' + esc(a.name) + '</b><small>' + a.code + ' · ' + kind(a) + ' · ' + esc(pathName(code) || 'Top level') + '</small></div></div>' +
      (bl.length ? '<div class="coa-block">' + ic('triangle-alert') + '<div><b>This account can’t be deleted</b>Accounts are protected while they hold data:<ul><li>' + bl.join('</li><li>') + '</li></ul></div></div>'
        : '<p class="coa-del-ok">The account has no sub-accounts and a zero balance, so it can be removed safely. You can undo this for a few seconds afterwards.</p>');
    $('[data-coa-del-sub]').textContent = bl.length ? 'Deletion is blocked for this account' : 'This permanently removes the account from the chart.';
    var go = $('[data-coa-del-go]'); go.disabled = !!bl.length;
    openModal('coa-mdl-del');
  }
  function doDelete(codes) {
    var removed = [];
    codes.forEach(function (code) {
      var i = ACC.findIndex(function (x) { return x.code === code; });
      if (i >= 0) removed.push([i, ACC[i]]);
    });
    var els = codes.map(function (c) { return $('.coa-body .coa-tr[data-code="' + c + '"]', C); }).filter(Boolean);
    var finish = function () {
      els.forEach(function (el) { if (el.parentNode) el.parentNode.removeChild(el); });
      removed.slice().sort(function (x, y) { return y[0] - x[0]; }).forEach(function (r) { ACC.splice(r[0], 1); S.sel.delete(r[1].code); });
      reindex(); renderAll(false); renderKpis(false);
      toast(removed.length === 1 ? 'Deleted ' + removed[0][1].code + ' · ' + removed[0][1].name : 'Deleted ' + removed.length + ' accounts', {
        tone: 'danger', undo: function () {
          removed.slice().sort(function (x, y) { return x[0] - y[0]; }).forEach(function (r) { ACC.splice(Math.min(r[0], ACC.length), 0, r[1]); });
          reindex(); renderAll(false); renderKpis(false);
          removed.forEach(function (r) { flash(r[1].code); });
        }
      });
    };
    if (els.length && !reduced()) {
      els.forEach(function (el) { el._leaving = true; el.classList.add('remove'); });
      setTimeout(finish, 420);
    } else finish();
  }
  function flash(code) {
    var el = $('.coa-body .coa-tr[data-code="' + code + '"]', C); if (!el) return;
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
    setTimeout(function () { el.classList.remove('flash'); }, 1900);
  }

  /* ---------- add / edit modal ---------- */
  var M = { parent: null, nature: 'Dr', edit: null, codeTouched: false };
  function nextCode(pcode) {
    var p = BY[pcode]; if (!p) return '';
    var ks = kids(pcode).map(function (k) { return k.code; }), i, c;
    if (p.level === 3) { for (i = 1; i < 100; i++) { c = pcode + '-' + String(i).padStart(2, '0'); if (!BY[c]) return c; } }
    if (p.level === 2) { for (i = 1; i < 10; i++) { c = pcode.slice(0, 2) + i + '0'; if (!BY[c]) return c; } }
    if (p.level === 1) { for (i = 1; i < 10; i++) { c = pcode[0] + i + '00'; if (!BY[c]) return c; } }
    return pcode + '-' + (ks.length + 1);
  }
  function parentOptions(q) {
    q = (q || '').toLowerCase();
    return ACC.filter(function (a) { return a.level < 4; }).filter(function (a) {
      return !q || a.code.indexOf(q) !== -1 || a.name.toLowerCase().indexOf(q) !== -1;
    }).sort(function (x, y) { return x.code < y.code ? -1 : 1; });
  }
  function renderParentList(q) {
    var list = $('[data-tsel-list]'); if (!list) return;
    var opts = parentOptions(q);
    list.innerHTML = opts.length ? opts.map(function (a) {
      return '<button type="button" class="' + CLS[a.cls].tone + (a.code === M.parent ? ' on' : '') + '" data-pick="' + a.code + '" style="padding-left:' + (8 + (a.level - 1) * 16) + 'px"><span class="ic">' + ic(a.icon) + '</span><code>' + a.code + '</code>' + hl(a.name, q) + '</button>';
    }).join('') : '<div class="none">No parent matches “' + esc(q) + '”</div>';
    paint(list);
  }
  function derive() {
    var p = BY[M.parent], box = $('[data-derived]');
    if (!box) return;
    if (!p) { box.innerHTML = 'Pick a parent to derive the level, type and code.'; return; }
    var lv = p.level + 1, kd = lv <= 2 ? 'Header' : lv === 3 ? 'Group' : 'Postable';
    box.innerHTML = ic('folder-tree') + ' Level <b>' + lv + '</b> · <span class="coa-kind ' + kd.toLowerCase() + '">' + kd + '</span> · Class <b>' + CLS[p.cls].name + '</b> · Path <b>' + esc((pathName(p.code) ? pathName(p.code) + ' › ' : '') + p.name) + '</b>';
    paint(box);
    var btn = $('[data-tsel-btn] span'); btn.className = ''; btn.textContent = p.code + ' · ' + p.name;
    if (!M.edit) {
      var code = $('[data-m="code"]'); if (!M.codeTouched) code.value = nextCode(p.code);
      var ob = $('[data-m="opening"]'); ob.disabled = lv !== 4; if (lv !== 4) ob.value = '';
      $('[data-ob-hint]').textContent = lv === 4 ? 'Posted on 01 Jul 2026 against Opening Balance Equity' : 'Only postable (level 4) accounts carry balances';
      var st = $('[data-m="sub"]'), sib = kids(p.code).filter(function (k) { return k.sub; })[0], def = sib ? sib.sub : CLS[p.cls].sub[0]; st.innerHTML = CLS[p.cls].sub.map(function (s) { return '<option' + (s === def ? ' selected' : '') + '>' + s + '</option>'; }).join('');
      setNature(CLS[p.cls].nature);
    }
  }
  function setNature(n) {
    M.nature = n;
    $$('[data-nature]').forEach(function (b) { b.classList.toggle('on', b.dataset.nature === n); b.setAttribute('aria-pressed', b.dataset.nature === n); });
  }
  function openAdd(opts) {
    opts = opts || {};
    var ed = opts.edit ? BY[opts.edit] : null;
    M.edit = ed ? ed.code : null; M.codeTouched = false;
    M.parent = ed ? ed.parent : (opts.parent && BY[opts.parent] && BY[opts.parent].level < 4 ? opts.parent : (S.focus && BY[S.focus] ? (BY[S.focus].level < 4 ? S.focus : BY[S.focus].parent) : '1120'));
    $('[data-coa-add-title]').textContent = ed ? 'Edit account' : (opts.parent ? 'Add sub-account' : 'Add account');
    $('[data-coa-add-sub]').textContent = ed ? ed.code + ' · ' + ed.name : 'Create a ledger account anywhere in the hierarchy';
    $('[data-coa-add-save]').innerHTML = ic('check') + (ed ? 'Save changes' : 'Create account');
    var body = $('[data-coa-add-body]');
    body.innerHTML = '<div class="coa-form">' +
      '<label class="full"><span class="l">Account name *</span><input data-m="name" placeholder="e.g. Bank Al Habib — 7781" value="' + (ed ? esc(ed.name) : '') + '" autocomplete="off"><span class="hint err" data-name-err hidden>Enter an account name</span></label>' +
      '<div class="fld full"><span class="l">Parent account *<em>searchable</em></span>' +
      '<div class="coa-tsel" data-tsel><button type="button" class="coa-tsel-btn" data-tsel-btn' + (ed ? ' disabled' : '') + '><span class="ph">Select a parent…</span>' + ic('chevron-down') + '</button>' +
      '<div class="coa-tsel-pop"><label class="coa-search">' + ic('search') + '<input data-tsel-q placeholder="Search code or name…" aria-label="Search parent accounts"></label><div class="coa-tsel-list" data-tsel-list role="listbox"></div></div></div></div>' +
      '<div class="coa-derived" data-derived></div>' +
      '<label><span class="l">Account code *<em>auto-suggested</em></span><input data-m="code" value="' + (ed ? ed.code : '') + '"' + (ed ? ' readonly' : '') + '><span class="hint" data-code-hint>Next free code under the parent</span></label>' +
      '<label><span class="l">Account type</span><select data-m="sub">' + (ed ? CLS[ed.cls].sub.map(function (s) { return '<option' + (s === ed.sub ? ' selected' : '') + '>' + s + '</option>'; }).join('') : '') + '</select></label>' +
      '<div class="fld"><span class="l">Nature</span><div class="coa-nature"><button type="button" data-nature="Dr">Debit (Dr)</button><button type="button" data-nature="Cr">Credit (Cr)</button></div></div>' +
      '<label><span class="l">Opening balance (PKR)</span><input data-m="opening" type="number" min="0" step="0.01" placeholder="0.00" value="' + (ed && ed.level === 4 ? ed.opening : '') + '"' + (ed ? ' disabled' : '') + '><span class="hint" data-ob-hint>' + (ed ? 'Opening balance is locked after creation' : '') + '</span></label>' +
      '<label><span class="l">Status</span><select data-m="status"><option' + (!ed || ed.status === 'Active' ? ' selected' : '') + '>Active</option><option' + (ed && ed.status === 'Inactive' ? ' selected' : '') + '>Inactive</option></select></label>' +
      '<label><span class="l">Description</span><input data-m="desc" placeholder="Optional" value="' + (ed ? esc(ed.desc || '') : '') + '"></label>' +
      '</div>';
    derive();
    if (ed) setNature(ed.nature);
    openModal('coa-mdl-add');
    setTimeout(function () { var n = $('[data-m="name"]'); if (n) n.focus(); }, 80);
  }
  function wireModals() {
    var add = document.getElementById('coa-mdl-add');
    add.addEventListener('click', function (e) {
      var t = e.target;
      var tb = t.closest('[data-tsel-btn]');
      if (tb && !tb.disabled) {
        var ts = $('[data-tsel]', add), opening = !ts.classList.contains('open');
        ts.classList.toggle('open', opening);
        if (opening) { $('[data-tsel-q]', add).value = ''; renderParentList(''); setTimeout(function () { $('[data-tsel-q]', add).focus(); }, 30); }
        return;
      }
      var pk = t.closest('[data-pick]');
      if (pk) { M.parent = pk.dataset.pick; M.codeTouched = false; $('[data-tsel]', add).classList.remove('open'); derive(); return; }
      var nb = t.closest('[data-nature]'); if (nb) { setNature(nb.dataset.nature); return; }
      if (!t.closest('[data-tsel]')) { var ts2 = $('[data-tsel]', add); if (ts2) ts2.classList.remove('open'); }
      if (t.closest('[data-coa-add-save]')) save();
    });
    add.addEventListener('input', function (e) {
      if (e.target.matches('[data-tsel-q]')) renderParentList(e.target.value);
      if (e.target.matches('[data-m="code"]')) { M.codeTouched = true; validateCode(); }
      if (e.target.matches('[data-m="name"]')) { e.target.classList.remove('err'); $('[data-name-err]', add).hidden = true; }
    });
    add.addEventListener('keydown', function (e) {
      if (e.target.matches('[data-tsel-q]')) {
        var btns = $$('[data-pick]', add), cur = btns.findIndex(function (b) { return b.classList.contains('kb'); });
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault(); if (cur >= 0) btns[cur].classList.remove('kb');
          cur = e.key === 'ArrowDown' ? Math.min(btns.length - 1, cur + 1) : Math.max(0, cur - 1);
          if (btns[cur]) { btns[cur].classList.add('kb'); btns[cur].scrollIntoView({ block: 'nearest' }); }
        } else if (e.key === 'Enter') { e.preventDefault(); var b = btns[cur >= 0 ? cur : 0]; if (b) b.click(); }
        else if (e.key === 'Escape') { e.stopPropagation(); $('[data-tsel]', add).classList.remove('open'); }
      } else if (e.key === 'Enter' && e.target.matches('input')) { e.preventDefault(); save(); }
    });
    var del = document.getElementById('coa-mdl-del');
    del.addEventListener('click', function (e) {
      if (e.target.closest('[data-coa-del-go]') && delCode && !blockers(delCode).length) {
        var c = delCode; delCode = null; closeModal('coa-mdl-del'); setTimeout(function () { doDelete([c]); }, 160);
      }
    });
  }
  function validateCode() {
    var inp = $('[data-m="code"]'), hint = $('[data-code-hint]'), v = inp.value.trim(), p = BY[M.parent], ok = true, msg = 'Next free code under the parent';
    if (!v) { ok = false; msg = 'Code is required'; }
    else if (BY[v] && v !== M.edit) { ok = false; msg = 'Code ' + v + ' is already used by ' + BY[v].name; }
    else if (p && v.indexOf(p.code.replace(/0+$/, '')) !== 0) { msg = 'Heads up: code does not start with the parent prefix'; }
    inp.classList.toggle('err', !ok); hint.textContent = msg; hint.classList.toggle('err', !ok);
    return ok;
  }
  function save() {
    var name = $('[data-m="name"]'), nm = name.value.trim();
    if (!nm) { name.classList.add('err'); $('[data-name-err]').hidden = false; name.focus(); return; }
    if (!M.parent || !BY[M.parent]) { toast('Pick a parent account', { tone: 'warn' }); return; }
    if (!validateCode()) { $('[data-m="code"]').focus(); return; }
    var status = $('[data-m="status"]').value, desc = $('[data-m="desc"]').value.trim(), sub = $('[data-m="sub"]').value;
    if (M.edit) {
      var a = BY[M.edit], before = JSON.parse(JSON.stringify(a));
      a.name = nm; a.desc = desc; a.status = status; a.nature = M.nature; a.sub = sub; a.mod = { d: '01 Oct 2026', by: 'S. Javed' };
      closeModal('coa-mdl-add'); renderAll(false); flash(a.code);
      toast('Saved changes to ' + a.code, { tone: 'good', undo: function () { Object.assign(BY[before.code] || {}, before); renderAll(false); } });
      return;
    }
    var p = BY[M.parent], code = $('[data-m="code"]').value.trim(), lv = p.level + 1, ob = lv === 4 ? +($('[data-m="opening"]').value || 0) : 0;
    var acc = {
      code: code, name: nm, desc: desc || (lv === 4 ? sub + ' account' : 'New ' + (lv === 3 ? 'group' : 'header')), icon: lv === 4 ? p.icon : 'folder-open', own: Math.max(0, ob), sub: sub,
      branch: lv === 4 ? 'Lahore HQ' : 'All branches', status: status, level: lv, parent: p.code, cls: p.cls, nature: M.nature, chg: 0, opening: Math.max(0, ob),
      mod: { d: '01 Oct 2026', by: 'S. Javed' }
    };
    ACC.push(acc); reindex(); S.created++;
    /* make sure it's visible: clear blocking filters, expand path, jump to its page */
    var q = S.q.trim().toLowerCase();
    if ((q && code.toLowerCase().indexOf(q) === -1 && nm.toLowerCase().indexOf(q) === -1) || filtersActive() || (S.cat !== 'all' && S.cat !== acc.cls)) resetFilters(true);
    ancestors(code).forEach(function (c) { S.open.add(c); S.qClosed.delete(c); });
    S.rows = computeRows();
    var idx = S.rows.findIndex(function (r) { return r.a.code === code; });
    if (idx >= 0) S.page = Math.floor(idx / S.per) + 1;
    closeModal('coa-mdl-add');
    if (S.view !== 'table') setView('table');
    renderBody(true); renderKpis(false);
    setTimeout(function () {
      var el = $('.coa-body .coa-tr[data-code="' + code + '"]', C);
      if (el) { el.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' }); flash(code); setFocus(code, false); }
    }, 60);
    toast('Account ' + code + ' · ' + nm + ' created', {
      tone: 'good', undo: function () {
        var i = ACC.indexOf(acc); if (i >= 0) ACC.splice(i, 1); S.created--; reindex(); renderAll(false); renderKpis(false);
      }
    });
  }

  /* ---------- filters ---------- */
  function resetFilters(silent) {
    S.q = ''; S.cat = 'all'; S.type = 'all'; S.status = 'all'; S.level = 'all'; S.qClosed.clear(); S.sort = { key: null, dir: 1 }; S.page = 1;
    var qi = $('[data-q]', C); qi.value = ''; $('[data-search]', C).classList.remove('has');
    $$('[data-f]', C).forEach(function (s) { s.value = 'all'; });
    syncSortHead();
    if (!silent) { renderAll(true); toast('Filters reset', { tone: 'info' }); }
  }
  function syncSortHead() {
    $$('.coa-tr.head .sort', C).forEach(function (h) {
      var on = S.sort.key === h.dataset.sort;
      h.classList.toggle('asc', on && S.sort.dir === 1); h.classList.toggle('desc', on && S.sort.dir === -1);
      h.setAttribute('aria-sort', on ? (S.sort.dir === 1 ? 'ascending' : 'descending') : 'none');
      var si = h.querySelector('.si'); if (si) si.style.transform = on && S.sort.dir === -1 ? 'scaleY(-1)' : '';
    });
  }

  /* ---------- bulk ---------- */
  function bulk(kindName) {
    var codes = Array.from(S.sel); if (!codes.length) return;
    if (kindName === 'activate') return setStatus(codes, 'Active');
    if (kindName === 'deactivate') return setStatus(codes, 'Inactive');
    if (kindName === 'delete') {
      if (codes.length === 1) return openDelete(codes[0]);
      var blocked = codes.filter(function (c) { return blockers(c).length; });
      if (blocked.length) { toast(blocked.length + ' of ' + codes.length + ' selected accounts have sub-accounts or balances and can’t be deleted', { tone: 'warn' }); return; }
      return doDelete(codes);
    }
    if (kindName === 'edit') {
      if (codes.length === 1) return openAdd({ edit: codes[0] });
      var prevSel = new Set(S.sel);
      toast(codes.length + ' accounts opened for bulk edit', { tone: 'info', undo: function () { S.sel = prevSel; syncSel(); } });
      return;
    }
    if (kindName === 'move') {
      var prev = new Set(S.sel);
      S.sel.clear(); syncSel();
      toast('Moved ' + codes.length + ' account' + (codes.length > 1 ? 's' : '') + ' to the clipboard: pick a new parent to drop them', { tone: 'info', undo: function () { S.sel = prev; syncSel(); } });
    }
  }

  /* ---------- column resize ---------- */
  function applyNameW() {
    var t = $('.coa-table', C);
    if (S.nameW) t.style.setProperty('--name-w', S.nameW + 'px'); else t.style.removeProperty('--name-w');
  }
  function startResize(e) {
    e.preventDefault(); e.stopPropagation();
    var h = e.target, cell = h.parentNode, x0 = e.clientX, w0 = cell.getBoundingClientRect().width;
    h.classList.add('drag'); h.setPointerCapture && h.setPointerCapture(e.pointerId);
    var mv = function (ev) { S.nameW = Math.round(Math.max(220, Math.min(620, w0 + ev.clientX - x0))); applyNameW(); };
    var up = function () { h.classList.remove('drag'); document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); lsSet('fs-coa-name-w', S.nameW); };
    document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
  }

  /* ---------- wiring ---------- */
  var qTimer = null;
  function wireCoa() {
    C.addEventListener('input', function (e) {
      var t = e.target;
      if (t.matches('[data-q]')) {
        $('[data-search]', C).classList.toggle('has', !!t.value);
        clearTimeout(qTimer);
        qTimer = setTimeout(function () { S.q = t.value; S.qClosed.clear(); S.page = 1; renderBody(true); if (S.view === 'map') renderMap(false); }, 120);
      }
    });
    C.addEventListener('change', function (e) {
      var t = e.target;
      if (t.matches('[data-f]')) { S[t.dataset.f] = t.value; S.page = 1; S.qClosed.clear(); renderAll(true); return; }
      if (t.matches('[data-per]')) { S.per = +t.value; S.page = 1; renderBody(false); return; }
      if (t.matches('[data-goto]')) { S.page = Math.max(1, Math.min(+t.value || 1, Math.ceil(S.rows.length / S.per))); renderBody(false); return; }
      if (t.matches('[data-selall]')) { pageRows().forEach(function (r) { if (t.checked) S.sel.add(r.a.code); else S.sel.delete(r.a.code); }); syncSel(); return; }
      if (t.matches('[data-sel]')) { var row = t.closest('.coa-tr'); toggleSel(row.dataset.code, t.checked); }
    });
    C.addEventListener('pointerdown', function (e) { if (e.target.matches('[data-resize]')) startResize(e); });
    C.addEventListener('click', function (e) {
      var t = e.target, b;
      if (t.closest('[data-resize]')) return;
      if ((b = t.closest('[data-qclr]'))) { var qi = $('[data-q]', C); qi.value = ''; qi.dispatchEvent(new Event('input', { bubbles: true })); qi.focus(); return; }
      if ((b = t.closest('[data-view]'))) { setView(b.dataset.view); return; }
      if ((b = t.closest('[data-density]'))) {
        S.density = b.dataset.density; $$('[data-density]', C).forEach(function (x) { x.classList.toggle('active', x === b); });
        var tb = $('.coa-table', C); tb.classList.remove('d-list', 'd-comfy', 'd-grid'); tb.classList.add('d-' + S.density); return;
      }
      if ((b = t.closest('[data-page]'))) { if (!b.disabled) { S.page = +b.dataset.page; renderBody(false); $('.coa-table', C).scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } return; }
      if ((b = t.closest('[data-bulk]'))) { bulk(b.dataset.bulk); return; }
      if ((b = t.closest('.coa-tr.head .sort'))) {
        var k = b.dataset.sort;
        if (S.sort.key !== k) S.sort = { key: k, dir: 1 }; else if (S.sort.dir === 1) S.sort.dir = -1; else S.sort = { key: null, dir: 1 };
        syncSortHead(); renderBody(true); return;
      }
      if ((b = t.closest('[data-act]'))) {
        var act = b.dataset.act;
        if (act === 'add') openAdd({});
        else if (act === 'addmenu') menu(b, [
          { label: 'Add account', icon: 'plus', onClick: function () { openAdd({}); } },
          { label: 'Add sub-account', icon: 'folder-tree', onClick: function () { var f = S.focus && BY[S.focus]; openAdd({ parent: f ? (f.level < 4 ? f.code : f.parent) : '1100' }); } },
          { label: 'Import from template', icon: 'file-text', onClick: function () { toast('Template “Pakistan · Trading company (IFRS for SMEs)” ready to import', { tone: 'info', action: { label: 'Preview', fn: function () { } } }); } }
        ]);
        else if (act === 'import') toast('Import accepts CSV or Excel using the Finsoft COA template', { tone: 'info' });
        else if (act === 'export') toast('Exported ' + ACC.length + ' accounts to chart-of-accounts.xlsx', { tone: 'good' });
        else if (act === 'reset') resetFilters(false);
        else if (act === 'expandall') expandAll();
        else if (act === 'collapseall') collapseAll();
        else if (act === 'settings') menu(b, [
          { label: 'Expand all', icon: 'chevron-down', onClick: expandAll },
          { label: 'Collapse all', icon: 'chevron-right', onClick: collapseAll },
          { sep: true },
          { label: 'Reset column width', icon: 'arrow-up-down', onClick: function () { S.nameW = 0; lsSet('fs-coa-name-w', ''); applyNameW(); } }
        ]);
        else if (act === 'more') menu(b, [
          { label: 'Expand all', icon: 'chevron-down', onClick: expandAll },
          { label: 'Collapse all', icon: 'chevron-right', onClick: collapseAll },
          { sep: true },
          { label: 'Export selected', icon: 'download', onClick: function () { toast(S.sel.size ? 'Exported ' + S.sel.size + ' selected accounts' : 'Select accounts to export', { tone: S.sel.size ? 'good' : 'warn' }); } },
          { label: 'Clear selection', icon: 'x', onClick: function () { S.sel.clear(); syncSel(); } }
        ]);
        return;
      }
      /* body row interactions */
      var row = t.closest('.coa-body .coa-tr');
      if (row) {
        var code = row.dataset.code;
        if (t.closest('[data-tw]')) { setFocus(code, false); toggle(code); return; }
        if (t.closest('.coa-check')) return;
        if ((b = t.closest('[data-rowmenu]'))) { setFocus(code, false); rowMenu(b, code); return; }
        inspect(code);
        return;
      }
      var mc = t.closest('.coa-map-card,.coa-map-root');
      if (mc) inspect(mc.dataset.code);
    });
    C.addEventListener('keydown', function (e) {
      if (e.target.closest('.coa-map-card,.coa-map-root') && e.key === 'Enter') { inspect(e.target.closest('[data-code]').dataset.code); return; }
      if (e.target.closest('.coa-grid')) onKey(e);
    });
    $('.coa-grid', C).addEventListener('focus', function (e) {
      if (e.target.classList.contains('coa-grid') && !S.focus) { var pr = pageRows(); if (pr[0]) setFocus(pr[0].a.code, false); }
    });
    /* ⌘K / Ctrl+K / "/" focuses the search while this screen is active */
    window.addEventListener('keydown', function (e) {
      if (curRoute() !== 'app/accounting/coa') return;
      var isK = (e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K');
      var isSlash = e.key === '/' && !e.target.closest('input,textarea,select,[contenteditable]');
      if (isK || isSlash) { e.preventDefault(); e.stopImmediatePropagation(); var qi = $('[data-q]', C); qi.focus(); qi.select(); }
    }, true);
    wireModals();
  }

  function mountCoa(sec) {
    C = $('[data-coa]', sec);
    if (!C) return;
    if (!C.dataset.mounted) {
      C.dataset.mounted = '1';
      C.innerHTML = coaShell();
      paint(C);
      applyNameW();
      wireCoa();
      renderBody(false);
      renderMap(false);
    } else if (S.view === 'map') renderMap(true);
    renderKpis(true);
  }
  onRoute('app/accounting/coa', mountCoa);

  /* ================================================================== ACCOUNT LEDGER */
  var VBASE = { CRV: 90, CPV: 80, BRV: 140, BPV: 120, JV: 40, SI: 330, PI: 228, CN: 14 };
  var VPRE = { CRV: 'CRV', CPV: 'CPV', BRV: 'BRV', BPV: 'BPV', JV: 'JV', SI: 'INV', PI: 'BILL', CN: 'CN' };
  var VNAME = { CRV: 'Cash receipt', CPV: 'Cash payment', BRV: 'Bank receipt', BPV: 'Bank payment', JV: 'Journal', SI: 'Sales invoice', PI: 'Purchase bill', CN: 'Credit note' };
  function vno(t, day, narr) { return VPRE[t] + '-2026-' + String((VBASE[t] || 10) + day * 4 + hash(narr) % 4).padStart(6, '0'); }
  var TX = {
    '1110-01': ['03|CRV|Cash sales — week 1|Sales — Local|368000|0', '06|CRV|Receipt — Al-Fatah Stores|Accounts Receivable — Trade|400000|0', '08|CPV|Office supplies — Daraz Business|Stationery & Office Supplies|0|45000', '10|CRV|Cash sales — week 2|Sales — Local|360000|0', '12|CPV|Cash deposited to Meezan Bank|Meezan Bank — 0123|0|750000', '17|CRV|Cash sales — week 3|Sales — Local|362000|0', '18|CRV|Receipt — City Mart Superstores|Accounts Receivable — Trade|400000|0', '21|CPV|Petty cash top-up — Karachi|Petty Cash — Karachi|0|50000', '24|CRV|Cash sales — week 4|Sales — Local|392000|0', '26|JV|Cash recovered — staff advance|Advances to Staff|776000|0', '28|CPV|Generator diesel — Lahore HQ|Electricity & Utilities|0|355000', '30|CRV|Cash sales — 30 Sep|Sales — Local|400000|0'],
    '1120-01': ['02|BRV|Receipt — Shifa International|Accounts Receivable — Trade|2450000|0', '03|BPV|Payment — Nishat Mills|Accounts Payable — Trade|0|1860000', '05|BRV|Receipt — Packages Ltd|Accounts Receivable — Trade|1725400|0', '07|BPV|LESCO bill — August|Electricity & Utilities|0|412600', '09|BPV|Salary funding — UBL payroll|UBL — 2294|0|3200000', '10|BRV|Receipt — Lucky Cement|Accounts Receivable — Trade|3180000|0', '12|JV|Cash deposited from Lahore HQ|Cash in Hand — Lahore HQ|750000|0', '14|BPV|Sales tax — August return|Sales Tax Payable (GST 18%)|0|2964300', '16|BRV|Receipt — Engro Foods|Accounts Receivable — Trade|2240000|0', '18|BPV|Payment — Siemens Pakistan|Accounts Payable — Trade|0|1315000', '21|BRV|Receipt — Metro Cash & Carry|Accounts Receivable — Trade|1964500|0', '23|BPV|Rent — Lahore HQ (Q2)|Prepaid Rent|0|1350000', '25|BPV|WHT deposited u/s 153|WHT Payable u/s 153|0|388450', '27|BRV|Profit on PLS deposit|Profit on Bank Deposits|214300|0', '29|BRV|Receipt — Interloop Ltd|Accounts Receivable — Trade|2875000|0', '30|BPV|Bank charges and SMS fees|Bank Charges|0|4850'],
    '1120-02': ['01|BRV|Receipt — Hashoo Hotels|Accounts Receivable — Trade|1240000|0', '04|BPV|Payment — Habib Packaging|Accounts Payable — Trade|0|684500', '06|BRV|Receipt — Al-Fatah Stores|Accounts Receivable — Trade|956000|0', '08|BPV|PTCL and internet — August|Electricity & Utilities|0|86400', '11|BRV|Receipt — Fatima Group|Accounts Receivable — Trade|1820000|0', '13|BPV|Payment — Shan Foods|Accounts Payable — Trade|0|1125000', '15|BPV|Term finance instalment|Term Finance — HBL|0|1466700', '17|BRV|Receipt — Packages Ltd|Accounts Receivable — Trade|1375000|0', '19|BPV|EOBI and PESSI — August|EOBI, PESSI & PF Payable|0|462000', '22|BRV|Receipt — City Mart Superstores|Accounts Receivable — Trade|1088250|0', '24|BPV|Payment — TCS Logistics|Freight Inward|0|238600', '26|BRV|Receipt — Shifa International|Accounts Receivable — Trade|1630000|0', '29|BPV|Markup on term finance|Finance Cost|0|402300', '30|BPV|Bank charges|Bank Charges|0|3150'],
    '1130-01': ['02|SI|Invoice — Shifa International|Sales — Local|2120000|0', '02|BRV|Receipt — Shifa International|Meezan Bank — 0123|0|2450000', '04|SI|Invoice — Lucky Cement|Sales — Local|3480000|0', '05|BRV|Receipt — Packages Ltd|Meezan Bank — 0123|0|1725400', '06|CRV|Receipt — Al-Fatah Stores|Cash in Hand — Lahore HQ|0|400000', '09|SI|Invoice — Engro Foods|Sales — Local|2615000|0', '10|BRV|Receipt — Lucky Cement|Meezan Bank — 0123|0|3180000', '14|SI|Invoice — Metro Cash & Carry|Sales — Local|1964500|0', '16|BRV|Receipt — Engro Foods|Meezan Bank — 0123|0|2240000', '18|CRV|Receipt — City Mart Superstores|Cash in Hand — Lahore HQ|0|400000', '20|SI|Invoice — Interloop Ltd|Sales — Export|2875000|0', '22|CN|Credit note — damaged cartons|Sales — Local|0|184600', '25|SI|Invoice — Hashoo Hotels|Sales — Local|1452300|0', '28|SI|Invoice — Fatima Group|Sales — Local|2310000|0', '29|BRV|Receipt — Interloop Ltd|Meezan Bank — 0123|0|2875000'],
    '1140-01': ['01|JV|Production transfer — batch 0901|Work in Process|3240000|0', '03|JV|Cost of goods dispatched — week 1|Cost of Goods Sold|0|2115600', '08|JV|Production transfer — batch 0908|Work in Process|2980000|0', '10|JV|Cost of goods dispatched — week 2|Cost of Goods Sold|0|2388400', '12|JV|Transfer to Karachi warehouse|Goods in Transit|0|640000', '15|JV|Production transfer — batch 0915|Work in Process|3105500|0', '17|JV|Cost of goods dispatched — week 3|Cost of Goods Sold|0|2496700', '20|JV|Stock count adjustment|Cost of Goods Sold|0|86300', '22|JV|Production transfer — batch 0922|Work in Process|2840000|0', '24|JV|Cost of goods dispatched — week 4|Cost of Goods Sold|0|2702800', '27|JV|Sales return restocked|Cost of Goods Sold|124600|0', '29|JV|Production transfer — batch 0929|Work in Process|1960000|0', '30|JV|Cost of goods dispatched — 30 Sep|Cost of Goods Sold|0|1105300'],
    '2110-01': ['02|PI|Bill — Nishat Mills (yarn)|Raw Materials|0|1984000', '03|BPV|Payment — Nishat Mills|Meezan Bank — 0123|1860000|0', '04|BPV|Payment — Habib Packaging|HBL — 8721|684500|0', '07|PI|Bill — Habib Packaging (cartons)|Packing Material|0|742800', '09|PI|Bill — Siemens Pakistan (spares)|Plant & Machinery|0|1315000', '13|BPV|Payment — Shan Foods|HBL — 8721|1125000|0', '14|PI|Bill — Pak Suzuki Spares|Vehicles|0|268400', '18|BPV|Payment — Siemens Pakistan|Meezan Bank — 0123|1315000|0', '19|PI|Bill — TCS Logistics|Freight Inward|0|238600', '21|PI|Bill — Shan Foods (canteen)|Staff Welfare|0|412500', '23|JV|WHT deducted u/s 153 — September|WHT Payable u/s 153|98400|0', '24|BPV|Payment — TCS Logistics|HBL — 8721|238600|0', '27|PI|Bill — Nishat Mills (yarn)|Raw Materials|0|2160000', '30|PI|Bill — Daraz Business|Stationery & Office Supplies|0|96300'],
    '4110-01': ['02|SI|Invoice — Shifa International|Accounts Receivable — Trade|0|2120000', '03|CRV|Cash sales — week 1|Cash in Hand — Lahore HQ|0|368000', '04|SI|Invoice — Lucky Cement|Accounts Receivable — Trade|0|3480000', '09|SI|Invoice — Engro Foods|Accounts Receivable — Trade|0|2615000', '10|CRV|Cash sales — week 2|Cash in Hand — Lahore HQ|0|360000', '14|SI|Invoice — Metro Cash & Carry|Accounts Receivable — Trade|0|1964500', '17|CRV|Cash sales — week 3|Cash in Hand — Lahore HQ|0|362000', '22|CN|Credit note — damaged cartons|Accounts Receivable — Trade|184600|0', '24|CRV|Cash sales — week 4|Cash in Hand — Lahore HQ|0|392000', '25|SI|Invoice — Hashoo Hotels|Accounts Receivable — Trade|0|1452300', '28|SI|Invoice — Fatima Group|Accounts Receivable — Trade|0|2310000', '30|CRV|Cash sales — 30 Sep|Cash in Hand — Lahore HQ|0|400000', '30|JV|Trade discount — City Mart|Accounts Receivable — Trade|212400|0'],
    '5110-01': ['03|JV|Cost of goods dispatched — week 1|Finished Goods|2115600|0', '06|JV|Packing material consumed|Packing Material|486000|0', '10|JV|Cost of goods dispatched — week 2|Finished Goods|2388400|0', '13|JV|Conversion cost absorbed|Factory Overheads|612000|0', '17|JV|Cost of goods dispatched — week 3|Finished Goods|2496700|0', '20|JV|Stock count adjustment|Finished Goods|86300|0', '24|JV|Cost of goods dispatched — week 4|Finished Goods|2702800|0', '26|JV|Packing material consumed|Packing Material|448500|0', '27|JV|Sales return restocked|Finished Goods|0|124600', '28|JV|Purchase price variance|Raw Materials|0|58200', '30|JV|Cost of goods dispatched — 30 Sep|Finished Goods|1105300|0', '30|JV|Conversion cost absorbed|Factory Overheads|598000|0'],
    '5210-01': ['02|JV|Final settlement — Kashif Ali|Accrued Salaries|142000|0', '05|JV|Overtime — August production|Accrued Salaries|186000|0', '08|CPV|Daily wages — loaders week 1|Cash in Hand — Lahore HQ|64000|0', '12|JV|Leave encashment — Nida Shah|Accrued Salaries|58500|0', '15|CPV|Daily wages — loaders week 2|Cash in Hand — Lahore HQ|61500|0', '18|JV|Salary arrears — Finance department|Accrued Salaries|94000|0', '22|CPV|Daily wages — loaders week 3|Cash in Hand — Lahore HQ|66000|0', '24|JV|Reversal — duplicate overtime|Accrued Salaries|0|38000', '26|BPV|Commission — Sales team Q1|UBL — 2294|412000|0', '29|CPV|Daily wages — loaders week 4|Cash in Hand — Lahore HQ|63000|0', '30|JV|Payroll PR-2026-09 — gross salaries|Accrued Salaries|3420000|0', '30|JV|EOBI employer share — September|EOBI, PESSI & PF Payable|96000|0', '30|JV|PF employer contribution — September|EOBI, PESSI & PF Payable|184000|0']
  };
  var LEDGER = {};
  Object.keys(TX).forEach(function (code) {
    var a = BY[code], dr = 0, cr = 0;
    var tx = TX[code].map(function (s, i) {
      var p = s.split('|'), day = +p[0];
      dr += +p[4]; cr += +p[5];
      return { i: i, day: day, date: '2026-09-' + p[0], type: p[1], vno: vno(p[1], day, p[2]), narr: p[2], contra: p[3], dr: +p[4], cr: +p[5] };
    });
    /* closing must equal the chart-of-accounts balance; derive opening (signed in Dr terms) */
    var closingDr = a.nature === 'Dr' ? a.own : -a.own;
    LEDGER[code] = { code: code, tx: tx, opening: closingDr - (dr - cr), dr: dr, cr: cr, closing: closingDr };
  });
  var LCODES = Object.keys(TX);
  var SING = { '1': 'Asset', '2': 'Liability', '3': 'Equity', '4': 'Income', '5': 'Expense' };

  var LS = { code: '1110-01', q: '', side: 'all', vt: 'all', min: '', contra: 'all', sort: 'old', page: 1, per: 10, filters: false, sideQ: '', range: '01 Sep 2026 – 30 Sep 2026' };
  var L = null;

  function drcr(n) { return amt(Math.abs(n)) + '<small>' + (n >= 0 ? 'Dr' : 'Cr') + '</small>'; }
  function alShell() {
    return '' +
      '<div class="al-head"><div>' +
      '<div class="al-crumbs"><a href="#/app/accounting/coa">Accounting</a>' + ic('chevron-right') + '<span>Ledgers</span></div>' +
      '<h1>Account Ledger</h1><p>Detailed transactions, running balance and insights for any account.</p></div>' +
      '<div class="al-head-actions">' +
      '<button class="al-btn" data-al-act="range">' + ic('calendar-days') + '<span data-range>' + LS.range + '</span>' + ic('chevron-down', 'cv') + '</button>' +
      '<button class="al-btn" data-al-act="views">' + ic('folder-open') + 'Saved Views' + ic('chevron-down', 'cv') + '</button>' +
      '<button class="al-btn" data-al-act="export">' + ic('download') + 'Export' + ic('chevron-down', 'cv') + '</button>' +
      '<a class="al-btn primary" href="#/app/reports/gl" style="text-decoration:none">' + ic('book-open') + 'General Ledger</a>' +
      '</div></div>' +
      '<div class="al-card al-account" data-al-banner></div>' +
      '<div class="al-stats" data-al-stats></div>' +
      '<div class="al-body">' +
      '<aside class="al-card al-side"><h3>Related Accounts <span data-al-count></span></h3>' +
      '<label class="al-search">' + ic('search') + '<input placeholder="Search accounts…" data-al-sideq aria-label="Search accounts"></label>' +
      '<ul data-al-list></ul>' +
      '<a class="al-btn wide" href="#/app/accounting/coa">' + ic('network') + 'View chart of accounts</a></aside>' +
      '<div class="al-card al-main">' +
      '<div class="al-main-head"><div><h3>Ledger Transactions <span data-al-n></span></h3><p>Every posting in date order with the running balance after each transaction.</p></div>' +
      '<div class="al-main-tools">' +
      '<label class="al-search wide">' + ic('search') + '<input placeholder="Search voucher, particulars or amount…" data-al-q aria-label="Search transactions"></label>' +
      '<button class="al-btn" data-al-act="filters" aria-expanded="false">' + ic('filter') + 'Filters <span class="al-pill" data-al-fc>0</span></button>' +
      '<div class="al-seg" role="group" aria-label="Sort"><button class="active" data-al-sort="old">Oldest</button><button data-al-sort="new">Newest</button></div>' +
      '</div></div>' +
      '<div class="al-filters-wrap" data-al-fw><div><div class="al-filters">' +
      '<label class="al-filter"><small>Voucher type</small><select data-al-f="vt"><option value="all">All types</option>' + Object.keys(VNAME).map(function (k) { return '<option value="' + k + '">' + k + ' · ' + VNAME[k] + '</option>'; }).join('') + '</select></label>' +
      '<label class="al-filter"><small>Transaction side</small><select data-al-f="side"><option value="all">Debits and credits</option><option value="dr">Debits only</option><option value="cr">Credits only</option></select></label>' +
      '<label class="al-filter"><small>Minimum amount (Rs)</small><input type="number" min="0" step="1000" placeholder="Any amount" data-al-f="min"></label>' +
      '<label class="al-filter"><small>Contra account</small><select data-al-f="contra"></select></label>' +
      '</div></div></div>' +
      '<div class="al-chips" data-al-chips></div>' +
      '<div class="al-table" data-plain><table data-plain><thead><tr>' +
      '<th class="sortable" data-al-th="date">Date ' + ic('arrow-up-down') + '</th><th>Voucher</th><th>Particulars</th><th class="num">Debit (Rs)</th><th class="num">Credit (Rs)</th><th class="num">Balance (Rs)</th><th class="ctr" aria-label="Actions"></th>' +
      '</tr></thead><tbody data-al-body></tbody></table></div>' +
      '<div class="al-foot" data-al-foot></div>' +
      '</div></div>';
  }
  function acc() { return BY[LS.code]; }
  function renderBanner(anim) {
    var a = acc(), p = BY[a.parent], gp = p && BY[p.parent], tone = CLS[a.cls].tone;
    var opts = LCODES.map(function (c) { return '<option value="' + c + '"' + (c === LS.code ? ' selected' : '') + '>' + c + ' · ' + esc(BY[c].name) + '</option>'; }).join('');
    var host = $('[data-al-banner]', L);
    host.className = 'al-card al-account ' + tone;
    host.innerHTML = '<span class="al-account-icon' + (anim ? ' al-swap' : '') + '">' + ic(a.icon) + '</span>' +
      '<div class="al-account-text' + (anim ? ' al-swap' : '') + '"><div><h2>' + esc(a.name) + '</h2><span class="al-status">' + a.status + '</span></div>' +
      '<p>' + a.code + '<i></i>' + SING[a.cls] + '<i></i>' + esc(gp ? gp.name : '') + (gp ? '<i></i>' : '') + esc(p ? p.name : '') + '<i></i>' + (a.nature === 'Dr' ? 'Debit' : 'Credit') + '</p>' +
      '<small>' + esc(a.desc) + '</small></div>' +
      '<div class="al-office">' + ic('landmark') + '<div><b>' + esc(a.branch) + '</b><small>Main book · PKR</small></div></div>' +
      '<label class="al-select al-switch" title="Switch account"><select data-al-switch aria-label="Switch account">' + opts + '</select>' + ic('chevron-down') + '</label>';
    paint(host);
  }
  function renderStats(anim) {
    var Lg = LEDGER[LS.code], a = acc(), n = Lg.tx.length, ndr = Lg.tx.filter(function (t) { return t.dr; }).length;
    var sgn = a.nature === 'Dr' ? 1 : -1, open = Lg.opening * sgn, close = Lg.closing * sgn, delta = open ? ((close - open) / Math.abs(open)) * 100 : 0;
    var card = function (tone, icon, label, val, em, emCls) {
      return '<div class="al-stat ' + tone + '"><span class="al-stat-icon">' + ic(icon) + '</span><div><small>' + label + '</small><b class="num" data-cu>' + val + '</b><em class="' + (emCls || '') + '">' + em + '</em></div></div>';
    };
    var host = $('[data-al-stats]', L);
    host.innerHTML =
      card('ct-green', 'database', 'Opening Balance', money(open, 0), 'as at 01 Sep 2026 · ' + (Lg.opening >= 0 ? 'Dr' : 'Cr')) +
      card('ct-green', 'trending-up', 'Total Debits', money(Lg.dr, 0), ndr + ' transactions') +
      card('ct-orange', 'activity', 'Total Credits', money(Lg.cr, 0), (n - ndr) + ' transactions') +
      card('ct-blue', 'coins', 'Closing Balance', money(close, 0), ic('trending-up') + (close - open >= 0 ? '+' : '−') + 'Rs ' + fmt(Math.abs(close - open)) + ' net', close - open >= 0 ? 'up' : 'down') +
      card('ct-violet', 'file-text', 'Transactions', String(n), 'in this period');
    paint(host);
    if (anim) $$('[data-cu]', host).forEach(countUp);
    if (anim && !reduced()) $$('.al-stat', host).forEach(function (el, i) { el.style.animation = 'none'; void el.offsetWidth; el.style.animation = 'coaRise .45s var(--ease) ' + (i * 0.04) + 's both'; });
  }
  function renderSide() {
    var q = LS.sideQ.trim().toLowerCase();
    var list = LCODES.filter(function (c) { var a = BY[c]; return !q || c.indexOf(q) !== -1 || a.name.toLowerCase().indexOf(q) !== -1; });
    $('[data-al-count]', L).textContent = LCODES.length;
    $('[data-al-list]', L).innerHTML = list.length ? list.map(function (c) {
      var a = BY[c];
      return '<li><button type="button" class="' + CLS[a.cls].tone + (c === LS.code ? ' active' : '') + '" data-al-pick="' + c + '"><span class="al-side-icon">' + ic(a.icon) + '</span>' +
        '<span style="min-width:0"><b title="' + esc(a.name) + '">' + hl(a.name, LS.sideQ.trim()) + '</b><small>' + c + '<i></i>' + SING[a.cls] + '</small></span>' +
        '<strong class="' + (a.nature === 'Cr' ? 'cr' : '') + '">' + money(a.own, 0) + '</strong></button></li>';
    }).join('') : '<li class="al-empty">No accounts match “' + esc(LS.sideQ) + '”</li>';
    paint($('[data-al-list]', L));
  }
  function contraOptions() {
    var set = {}; LEDGER[LS.code].tx.forEach(function (t) { set[t.contra] = 1; });
    var sel = $('[data-al-f="contra"]', L);
    sel.innerHTML = '<option value="all">All accounts</option>' + Object.keys(set).sort().map(function (c) { return '<option' + (c === LS.contra ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('');
  }
  function ledgerRows() {
    var Lg = LEDGER[LS.code], run = Lg.opening, q = LS.q.trim().toLowerCase(), min = +LS.min || 0;
    var all = Lg.tx.map(function (t) { run += t.dr - t.cr; return Object.assign({ bal: run }, t); });
    var rows = all.filter(function (t) {
      if (LS.vt !== 'all' && t.type !== LS.vt) return false;
      if (LS.side === 'dr' && !t.dr) return false;
      if (LS.side === 'cr' && !t.cr) return false;
      if (min && (t.dr || t.cr) < min) return false;
      if (LS.contra !== 'all' && t.contra !== LS.contra) return false;
      if (q) {
        var hay = (t.vno + ' ' + t.narr + ' ' + t.contra + ' ' + t.type + ' ' + (t.dr || t.cr) + ' ' + fmt(t.dr || t.cr)).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
    if (LS.sort === 'new') rows.reverse();
    var bf = { bf: true, bal: Lg.opening };
    if (LS.sort === 'new') rows.push(bf); else rows.unshift(bf);
    return rows;
  }
  function activeFilters() {
    var out = [];
    if (LS.vt !== 'all') out.push(['vt', 'Type: ' + LS.vt]);
    if (LS.side !== 'all') out.push(['side', LS.side === 'dr' ? 'Debits only' : 'Credits only']);
    if (+LS.min) out.push(['min', 'Amount ≥ Rs ' + fmt(+LS.min)]);
    if (LS.contra !== 'all') out.push(['contra', 'Contra: ' + LS.contra]);
    return out;
  }
  function renderTable(anim) {
    var rows = ledgerRows(), q = LS.q.trim(), n = rows.length - 1, pages = Math.max(1, Math.ceil(rows.length / LS.per));
    if (LS.page > pages) LS.page = pages;
    var pr = rows.slice((LS.page - 1) * LS.per, LS.page * LS.per);
    $('[data-al-n]', L).textContent = '(' + n + ')';
    var fs = activeFilters();
    $('[data-al-fc]', L).textContent = fs.length;
    $('[data-al-chips]', L).innerHTML = fs.length ? fs.map(function (f) { return '<span>' + esc(f[1]) + '<button type="button" data-al-clr="' + f[0] + '" aria-label="Remove filter">' + ic('x') + '</button></span>'; }).join('') + '<button class="al-link" data-al-clr="all">Clear all</button>' : '';
    paint($('[data-al-chips]', L));
    var anim2 = anim && !reduced();
    var body = $('[data-al-body]', L);
    body.innerHTML = (n === 0 && !pr.some(function (r) { return !r.bf; }) && (q || fs.length) ? '<tr class="al-none"><td colspan="7">No transactions match your search or filters.</td></tr>' : '') +
      pr.map(function (t, i) {
        var cls = (t.bf ? 'bf' : '') + (anim2 ? ' in' : ''), st = anim2 ? ' style="--i:' + i + '"' : '';
        if (t.bf) return '<tr class="' + cls + '"' + st + '><td class="date">01 Sep 2026</td><td><span class="al-ref">—</span></td><td class="part"><b>Balance brought forward</b><small>Opening · ' + (acc().nature === 'Dr' ? 'Debit' : 'Credit') + ' nature</small></td><td class="num"><i>—</i></td><td class="num"><i>—</i></td><td class="num bal">' + drcr(t.bal) + '</td><td class="ctr"></td></tr>';
        return '<tr class="' + cls + '"' + st + '><td class="date">' + fdate(t.date) + '</td>' +
          '<td><a class="al-ref" href="#/app/accounting/vouchers/view">' + hl(t.vno, q) + '</a><span class="al-type ' + t.type.toLowerCase() + '">' + t.type + ' · ' + VNAME[t.type] + '</span></td>' +
          '<td class="part"><b>' + hl(t.narr, q) + '</b><small>' + (t.dr ? 'To ' : 'By ') + hl(t.contra, q) + '</small></td>' +
          '<td class="num' + (t.dr ? ' dr' : '') + '">' + (t.dr ? amt(t.dr) : '<i>—</i>') + '</td>' +
          '<td class="num' + (t.cr ? ' cr' : '') + '">' + (t.cr ? amt(t.cr) : '<i>—</i>') + '</td>' +
          '<td class="num bal">' + drcr(t.bal) + '</td>' +
          '<td class="ctr"><button class="al-dots" type="button" data-al-row="' + t.i + '" aria-label="Transaction actions">' + ic('ellipsis') + '</button></td></tr>';
      }).join('');
    paint(body);
    var pdr = 0, pcr = 0; pr.forEach(function (t) { if (!t.bf) { pdr += t.dr; pcr += t.cr; } });
    var from = rows.length ? (LS.page - 1) * LS.per + 1 : 0, to = Math.min(rows.length, LS.page * LS.per), p = LS.page, pg = '';
    var b = function (x, label, dis, act) { return '<button type="button" data-al-page="' + x + '"' + (dis ? ' disabled' : '') + (act ? ' class="active"' : '') + '>' + label + '</button>'; };
    pg += b(p - 1, '‹', p === 1);
    for (var i = 1; i <= pages; i++) pg += b(i, i, false, i === p);
    pg += b(p + 1, '›', p === pages);
    $('[data-al-foot]', L).innerHTML = '<span>Showing ' + from + '–' + to + ' of ' + rows.length + ' lines</span>' +
      '<span class="al-foot-tot"><small>Page totals</small><b class="dr">' + amt(pdr) + '</b><b class="cr">' + amt(pcr) + '</b><small>Ending balance</small><b>' + drcr(LEDGER[LS.code].closing).replace('<small>', ' <small>') + '</b></span>' +
      '<span class="al-foot-rows">Rows <label class="coa-select"><select data-al-per aria-label="Rows per page">' + [10, 25, 50].map(function (x) { return '<option' + (x === LS.per ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select>' + ic('chevron-down') + '</label></span>' +
      '<div class="coa-pager">' + pg + '</div>';
    paint($('[data-al-foot]', L));
  }
  function switchAccount(code, anim) {
    if (!LEDGER[code]) return;
    LS.code = code; LS.page = 1; LS.contra = 'all';
    renderBanner(anim); renderStats(anim); renderSide(); contraOptions(); renderTable(anim);
  }
  function wireLedger() {
    L.addEventListener('input', function (e) {
      var t = e.target;
      if (t.matches('[data-al-q]')) { LS.q = t.value; LS.page = 1; renderTable(false); }
      else if (t.matches('[data-al-sideq]')) { LS.sideQ = t.value; renderSide(); }
      else if (t.matches('[data-al-f="min"]')) { LS.min = t.value; LS.page = 1; renderTable(false); }
    });
    L.addEventListener('change', function (e) {
      var t = e.target;
      if (t.matches('[data-al-switch]')) switchAccount(t.value, true);
      else if (t.matches('[data-al-f]') && t.dataset.alF !== 'min') { LS[t.dataset.alF] = t.value; LS.page = 1; renderTable(true); }
      else if (t.matches('[data-al-per]')) { LS.per = +t.value; LS.page = 1; renderTable(false); }
    });
    L.addEventListener('click', function (e) {
      var t = e.target, b;
      if ((b = t.closest('[data-al-pick]'))) { if (b.dataset.alPick !== LS.code) switchAccount(b.dataset.alPick, true); return; }
      if ((b = t.closest('[data-al-sort]'))) {
        LS.sort = b.dataset.alSort; LS.page = 1;
        $$('[data-al-sort]', L).forEach(function (x) { x.classList.toggle('active', x === b); });
        renderTable(true); return;
      }
      if ((b = t.closest('[data-al-th="date"]'))) { var nb = $('[data-al-sort="' + (LS.sort === 'old' ? 'new' : 'old') + '"]', L); nb.click(); return; }
      if ((b = t.closest('[data-al-page]'))) { if (!b.disabled) { LS.page = +b.dataset.alPage; renderTable(true); } return; }
      if ((b = t.closest('[data-al-clr]'))) {
        var k = b.dataset.alClr;
        if (k === 'all') { LS.vt = 'all'; LS.side = 'all'; LS.min = ''; LS.contra = 'all'; } else LS[k] = k === 'min' ? '' : 'all';
        $('[data-al-f="vt"]', L).value = LS.vt; $('[data-al-f="side"]', L).value = LS.side; $('[data-al-f="min"]', L).value = LS.min; $('[data-al-f="contra"]', L).value = LS.contra;
        LS.page = 1; renderTable(true); return;
      }
      if ((b = t.closest('[data-al-row]'))) {
        var tx = LEDGER[LS.code].tx[+b.dataset.alRow];
        menu(b, [
          { label: 'View voucher', icon: 'file-text', onClick: function () { location.hash = '#/app/accounting/vouchers/view'; } },
          { label: 'Open contra ledger', icon: 'book-open', onClick: function () { var c = LCODES.find(function (x) { return BY[x].name === tx.contra; }); if (c) switchAccount(c, true); else toast(tx.contra + ' has no ledger in this demo', { tone: 'info' }); } },
          { label: 'Copy reference', icon: 'tag', onClick: function () { try { navigator.clipboard.writeText(tx.vno); } catch (er) { } toast('Copied ' + tx.vno, { tone: 'good' }); } }
        ]);
        return;
      }
      if ((b = t.closest('[data-al-act]'))) {
        var act = b.dataset.alAct;
        if (act === 'filters') {
          LS.filters = !LS.filters;
          $('[data-al-fw]', L).classList.toggle('open', LS.filters);
          b.classList.toggle('on', LS.filters); b.setAttribute('aria-expanded', LS.filters);
        } else if (act === 'range') {
          var set = function (label) { return function () { LS.range = label; $('[data-range]', L).textContent = label; toast('Period set to ' + label, { tone: 'info' }); }; };
          menu(b, [
            { label: 'This month · Sep 2026', icon: 'calendar-days', onClick: set('01 Sep 2026 – 30 Sep 2026') },
            { label: 'Last quarter · Q1 FY27', icon: 'calendar-days', onClick: set('01 Jul 2026 – 30 Sep 2026') },
            { label: 'FY 2026-27 to date', icon: 'calendar-days', onClick: set('01 Jul 2026 – 01 Oct 2026') }
          ]);
        } else if (act === 'views') {
          menu(b, [
            { label: 'Month-end review', icon: 'folder-open', onClick: function () { toast('Applied view “Month-end review”', { tone: 'info' }); } },
            { label: 'Large debits (≥ Rs 1M)', icon: 'filter', onClick: function () { LS.side = 'dr'; LS.min = '1000000'; $('[data-al-f="side"]', L).value = 'dr'; $('[data-al-f="min"]', L).value = '1000000'; LS.page = 1; renderTable(true); toast('Applied view “Large debits”', { tone: 'info' }); } },
            { sep: true },
            { label: 'Save current view…', icon: 'plus', onClick: function () { toast('View saved', { tone: 'good' }); } }
          ]);
        } else if (act === 'export') {
          menu(b, [
            { label: 'Excel (.xlsx)', icon: 'table-2', onClick: function () { toast('Exported ' + BY[LS.code].name + ' ledger to Excel', { tone: 'good' }); } },
            { label: 'PDF statement', icon: 'file-text', onClick: function () { toast('PDF statement generated', { tone: 'good' }); } },
            { label: 'CSV', icon: 'download', onClick: function () { toast('CSV downloaded', { tone: 'good' }); } }
          ]);
        }
      }
    });
  }
  function mountLedger(sec) {
    L = $('[data-al]', sec);
    if (!L) return;
    var want = window.FSLedgerAccount; window.FSLedgerAccount = null;
    if (!L.dataset.mounted) {
      L.dataset.mounted = '1';
      if (want && LEDGER[want]) LS.code = want;
      L.innerHTML = alShell();
      paint(L);
      wireLedger();
      switchAccount(LS.code, true);
    } else if (want && LEDGER[want] && want !== LS.code) switchAccount(want, true);
    else { renderStats(true); renderTable(true); }
    if (want && !LEDGER[want] && BY[want]) toast(BY[want].name + ' has no postings in this period · showing ' + BY[LS.code].name, { tone: 'info' });
  }
  onRoute('app/accounting/ledger', mountLedger);
})();
