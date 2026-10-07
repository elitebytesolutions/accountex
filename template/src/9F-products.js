/* 9F-products.js · v4 Inventory products: catalogue, detail, companies, classes, kits, labels (Agent A, prefix pr-) */
(function () {
  'use strict';
  if (!window.FS || !window.FS_DATA) return;
  const D = window.FS_DATA;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n, d = 0) => FS.fmt(n, d);
  const money = (n, o) => FS.money(n, o);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const TODAY = new Date('2026-10-01T00:00:00');
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const icons = (el) => FS.icons(el);
  const num = (v) => { const n = parseFloat(String(v).replace(/,/g, '')); return isNaN(n) ? null : n; };
  const pct = (n, d = 1) => (n >= 0 ? '' : '−') + fmt(Math.abs(n), d) + '%';
  const rng = (seed) => { let h = 2166136261 >>> 0; String(seed).split('').forEach((c) => { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }); if (!h) h = 1; return () => { h ^= h << 13; h >>>= 0; h ^= h >>> 17; h ^= h << 5; h >>>= 0; return (h % 100000) / 100000; }; };
  const busy = (btn, label, ms = 850) => new Promise((res) => {
    if (!btn) return res();
    const old = btn.innerHTML; btn.disabled = true; btn.classList.add('pr-busy');
    btn.innerHTML = '<span class="pr-spin"></span>' + esc(label || 'Saving…');
    setTimeout(() => { btn.disabled = false; btn.classList.remove('pr-busy'); btn.innerHTML = old; icons(btn); res(); }, reduce() ? 150 : ms);
  });
  const shake = (el) => { if (!el) return; el.classList.remove('pr-shake'); void el.offsetWidth; el.classList.add('pr-shake'); };

  /* ---------- barcode (real EAN-13 encoding, drawn with CSS flex bars) ---------- */
  const eanCheck = (d12) => { let s = 0; for (let i = 0; i < 12; i++) s += (+d12[i]) * (i % 2 ? 3 : 1); return d12 + ((10 - (s % 10)) % 10); };
  const ean = (digits) => eanCheck(String(digits).replace(/\D/g, '').padEnd(12, '0').slice(0, 12));
  const LC = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
  const RC = LC.map((p) => p.replace(/./g, (b) => (b === '1' ? '0' : '1')));
  const GC = RC.map((p) => p.split('').reverse().join(''));
  const PAR = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
  function eanBits(code) {
    let c = String(code || '').replace(/\D/g, '');
    if (c.length !== 13) c = ean(c || '0');
    const par = PAR[+c[0]];
    let b = '101';
    for (let i = 1; i <= 6; i++) b += (par[i - 1] === 'L' ? LC : GC)[+c[i]];
    b += '01010';
    for (let i = 7; i <= 12; i++) b += RC[+c[i]];
    return b + '101';
  }
  function bars(code, cls = '') {
    const b = eanBits(code); let out = '', i = 0;
    while (i < b.length) {
      let j = i; while (j < b.length && b[j] === b[i]) j++;
      const guard = i < 3 || (i >= 45 && i < 50) || i >= 92;
      out += b[i] === '1' ? `<i class="${guard ? 'g' : ''}" style="flex:${j - i}"></i>` : `<b style="flex:${j - i}"></b>`;
      i = j;
    }
    return `<span class="pr-bc ${cls}" aria-hidden="true">${out}</span>`;
  }
  const newUpc = () => ean('89640' + String(Math.floor(1000000 + Math.random() * 8999999)));

  /* ---------- shared, cloned catalogue ---------- */
  const URDU = { 'PK-1001': 'کوروگیٹڈ کارٹن ۵ پلائی', 'PK-1003': 'بی او پی پی ٹیپ ۲ انچ', 'PK-1004': 'اسٹریچ ریپ فلم', 'PK-1005': 'ببل ریپ رول', 'OF-2001': 'ایچ پی ٹونر ۸۵ اے', 'OF-2002': 'اے فور پیپر ریم', 'OF-2003': 'باکس فائل', 'IN-3001': 'نائٹرائل دستانے', 'IN-3002': 'سیفٹی ہیلمٹ', 'EL-4001': 'ایل ای ڈی پینل لائٹ', 'EL-4002': 'تانبے کی تار', 'FD-5001': 'شان بریانی مصالحہ', 'FD-5002': 'ٹپال دانے دار چائے', 'FD-5003': 'ڈیٹول مائع', 'FD-5004': 'سرف ایکسل', 'IT-6001': 'لاجیٹیک وائرلیس ماؤس', 'FD-5005': 'شان نہاری مصالحہ', 'FD-5006': 'شان کڑاہی مصالحہ', 'FD-5007': 'شان تکہ مصالحہ', 'FD-5008': 'ٹپال فیملی مکسچر', 'FD-5011': 'ڈیٹول صابن', 'FD-5012': 'لپٹن یلو لیبل', 'FD-5014': 'وِم برتن بار', 'EL-4003': 'ایل ای ڈی بلب ۱۲ واٹ' };
  const URDU_CLS = { 'MC-001': 'پیکنگ کا سامان', 'MC-002': 'دفتری سامان', 'MC-003': 'حفاظتی سامان', 'MC-004': 'برقی سامان', 'MC-005': 'گروسری', 'MC-006': 'گھریلو صفائی' };
  // [sku, name, co, cls, sub, loose, ctn, cost, price, stock, shelf, low, high, attrs, status]
  const EXTRA = [
    ['OF-2004', 'HP Ink Cartridge 680 Black', 'CO-01', 'MC-002', 'ST-004', 'Pcs', 1, 2450, 3200, 64, 'B1', 20, 150, ['precious']],
    ['OF-2005', 'HP Ink Cartridge 680 Colour', 'CO-01', 'MC-002', 'ST-004', 'Pcs', 1, 2650, 3450, 18, 'B1', 20, 150, ['precious']],
    ['OF-2007', 'A4 Paper Ream 70gsm', 'CO-02', 'MC-002', 'ST-005', 'Ream', 5, 1150, 1450, 860, 'B1', 300, 2000, []],
    ['OF-2008', 'Legal Paper Ream 80gsm', 'CO-02', 'MC-002', 'ST-005', 'Ream', 5, 1580, 1950, 210, 'B2', 120, 900, []],
    ['OF-2009', 'A3 Paper Ream 80gsm', 'CO-02', 'MC-002', 'ST-005', 'Ream', 5, 2700, 3350, 44, 'B2', 50, 300, []],
    ['OF-2010', 'Stapler No.10 Heavy Duty', 'CO-03', 'MC-002', 'ST-005', 'Pcs', 24, 420, 590, 180, 'B3', 60, 480, []],
    ['OF-2011', 'Ball Pen Blue (Box of 50)', 'CO-03', 'MC-002', 'ST-005', 'Box', 20, 650, 850, 320, 'B3', 100, 800, []],
    ['OF-2012', 'Correction Tape 5mm', 'CO-03', 'MC-002', 'ST-005', 'Pcs', 48, 95, 140, 12, 'B3', 100, 960, ['short']],
    ['OF-2013', 'Whiteboard Marker (Box of 10)', 'CO-03', 'MC-002', 'ST-005', 'Box', 24, 520, 720, 140, 'B3', 48, 480, [], 'Draft'],
    ['IN-3003', 'Safety Goggles Clear', 'CO-04', 'MC-003', 'ST-007', 'Pcs', 24, 380, 560, 210, 'C1', 48, 480, []],
    ['IN-3004', 'Hi-Vis Safety Vest', 'CO-04', 'MC-003', 'ST-007', 'Pcs', 20, 450, 690, 75, 'C1', 40, 400, []],
    ['IN-3005', 'Ear Plugs (Box of 200)', 'CO-04', 'MC-003', 'ST-007', 'Box', 10, 2100, 2900, 8, 'C2', 10, 80, ['expiry']],
    ['IN-3006', 'Disposable Face Mask (50)', 'CO-04', 'MC-003', 'ST-006', 'Box', 40, 300, 450, 1350, 'C2', 200, 2400, ['expiry']],
    ['EL-4003', 'LED Bulb 12W Cool Day', 'CO-05', 'MC-004', 'ST-008', 'Pcs', 100, 260, 380, 2400, 'C3', 500, 6000, []],
    ['EL-4004', 'LED Tube Light T8 18W', 'CO-05', 'MC-004', 'ST-008', 'Pcs', 25, 520, 720, 640, 'C3', 150, 1500, []],
    ['EL-4005', 'Downlight 7W Warm White', 'CO-05', 'MC-004', 'ST-008', 'Pcs', 40, 610, 850, 0, 'C3', 80, 800, ['short']],
    ['EL-4006', 'Emergency Light Rechargeable', 'CO-05', 'MC-004', 'ST-008', 'Pcs', 10, 1850, 2600, 34, 'C4', 20, 160, []],
    ['EL-4007', 'Copper Wire 3/29 (90m)', 'CO-06', 'MC-004', 'ST-009', 'Coil', 1, 5600, 6900, 52, 'C4', 15, 120, ['precious']],
    ['EL-4008', 'Flexible Cable 40/76 (90m)', 'CO-06', 'MC-004', 'ST-009', 'Coil', 1, 4900, 6150, 21, 'C4', 15, 100, []],
    ['PK-1006', 'Corrugated Carton 3-Ply 12×10×8', 'CO-07', 'MC-001', 'ST-001', 'Pcs', 50, 42, 58, 9600, 'A1', 1500, 15000, []],
    ['PK-1007', 'Masking Tape 1" Roll', 'CO-07', 'MC-001', 'ST-002', 'Roll', 72, 65, 95, 1800, 'A3', 400, 4000, []],
    ['PK-1008', 'Poly Mailer Bag 10×14 (100)', 'CO-07', 'MC-001', 'ST-003', 'Pack', 10, 690, 920, 310, 'A3', 80, 600, []],
    ['PK-1009', 'Packing Strap PP 12mm', 'CO-07', 'MC-001', 'ST-003', 'Roll', 1, 1450, 1890, 66, 'A2', 20, 150, []],
    ['FD-5005', 'Shan Nihari Masala 60g', 'CO-08', 'MC-005', 'ST-010', 'Pack', 144, 118, 150, 3600, 'D1', 1440, 8000, ['expiry']],
    ['FD-5006', 'Shan Karahi Masala 50g', 'CO-08', 'MC-005', 'ST-010', 'Pack', 144, 105, 135, 2880, 'D1', 1440, 8000, ['expiry']],
    ['FD-5007', 'Shan Tikka Masala 50g', 'CO-08', 'MC-005', 'ST-010', 'Pack', 144, 105, 135, 96, 'D1', 1440, 8000, ['expiry']],
    ['FD-5008', 'Tapal Family Mixture 430g', 'CO-09', 'MC-005', 'ST-011', 'Pack', 24, 790, 920, 384, 'D3', 120, 1200, ['expiry']],
    ['FD-5009', 'Tapal Green Tea (30 bags)', 'CO-09', 'MC-005', 'ST-011', 'Box', 48, 260, 330, 160, 'D3', 240, 1440, ['expiry']],
    ['FD-5010', 'Harpic Toilet Cleaner 500ml', 'CO-10', 'MC-006', 'ST-012', 'Btl', 24, 330, 420, 480, 'D2', 120, 1200, ['controlled']],
    ['FD-5011', 'Dettol Soap 110g', 'CO-10', 'MC-006', 'ST-012', 'Pcs', 72, 150, 195, 1440, 'D2', 360, 3600, ['expiry']],
    ['FD-5012', 'Lipton Yellow Label 950g', 'CO-11', 'MC-005', 'ST-011', 'Pack', 12, 1690, 1960, 96, 'D3', 60, 600, ['expiry']],
    ['FD-5013', 'Sunsilk Shampoo 360ml', 'CO-11', 'MC-006', 'ST-012', 'Btl', 24, 690, 850, 600, 'D4', 120, 1200, ['expiry']],
    ['FD-5014', 'Vim Dishwash Bar 300g', 'CO-11', 'MC-006', 'ST-012', 'Pcs', 48, 95, 125, 2160, 'D4', 480, 4800, []],
    ['IT-6002', 'Logitech USB Keyboard K120', 'CO-12', 'MC-002', 'ST-004', 'Pcs', 20, 1950, 2650, 54, 'B4', 20, 200, []],
    ['IT-6003', 'Logitech Webcam C270', 'CO-12', 'MC-002', 'ST-004', 'Pcs', 10, 5800, 7450, 6, 'B4', 10, 60, ['precious']],
    ['IT-6004', 'Logitech Headset H390', 'CO-12', 'MC-002', 'ST-004', 'Pcs', 10, 6200, 7990, 26, 'B4', 10, 60, [], 'Inactive'],
  ];
  const mkBatches = (it) => it.attrs.includes('expiry') ? [
    { no: it.sku.replace('-', '') + 'X', exp: '2026-10-22', qty: Math.round(it.stock * 0.06), cost: Math.round(it.cost * 0.98) },
    { no: it.sku.replace('-', '') + 'A', exp: '2026-12-31', qty: Math.round(it.stock * 0.3), cost: it.cost },
    { no: it.sku.replace('-', '') + 'B', exp: '2027-06-30', qty: it.stock - Math.round(it.stock * 0.06) - Math.round(it.stock * 0.3), cost: Math.round(it.cost * 1.03) },
  ] : [];
  const P = window.FS_PR = {
    items: [], companies: clone(D.companies), classes: clone(D.classes), cur: 'FD-5001', labelPick: null, moves: {},
  };
  D.items.forEach((x) => {
    const it = { sku: x.sku, upc: x.upc, name: x.name, loose: x.loose || x.unit, ctn: x.ctn || 1, cost: x.cost, price: x.price, wprice: x.wprice || Math.round(x.price * 0.92), stock: x.stock, shelf: x.shelf, cls: x.cls, sub: x.sub, company: x.company, low: x.low, high: x.high, attrs: (x.attrs || []).slice(), barcodes: (x.barcodes || [x.upc]).slice(), status: 'Active', fin: 0, cpu: x.cost, gst: x.gst || 18 };
    it.batches = mkBatches(it); P.items.push(it);
  });
  EXTRA.forEach((e, k) => {
    const upc = ean('89640' + e[0].replace(/\D/g, '') + String(k).padStart(3, '0'));
    const it = { sku: e[0], name: e[1], company: e[2], cls: e[3], sub: e[4], loose: e[5], ctn: e[6], cost: e[7], price: e[8], wprice: Math.round(e[8] * 0.93), stock: e[9], shelf: e[10], low: e[11], high: e[12], attrs: e[13], status: e[14] || 'Active', upc, barcodes: [upc, ean('1' + upc.slice(1, 12))], fin: 0, cpu: e[7], gst: 18 };
    it.batches = mkBatches(it); P.items.push(it);
  });
  const UPD = ['2 days ago', '5 days ago', '1 week ago', '1 month ago', '3 days ago', '6 days ago', '2 weeks ago', '1 week ago', '4 days ago', '3 weeks ago', 'Yesterday', '2 months ago'];
  P.companies.forEach((c, i) => { c.updated = UPD[i % UPD.length]; c.country = 'Pakistan'; c.phone = '0' + (21 + (i % 3) * 21) + '-' + (34500000 + i * 1371); c.email = 'trade@' + c.name.toLowerCase().replace(/[^a-z]/g, '').slice(0, 10) + '.com.pk'; });
  const item = (sku) => P.items.find((i) => i.sku === sku);
  const co = (code) => P.companies.find((c) => c.code === code) || { code, name: code, short: '?', color: '#6B7A72', city: '' };
  const coName = (code) => co(code).name.replace(/ \(.*?\)| Pakistan| Ltd| Industries| Stationery/g, '').trim();
  const cls = (id) => P.classes.find((c) => c.id === id) || { id, name: id, subs: [], icon: 'tag' };
  const sub = (it) => (cls(it.cls).subs.find((s) => s.id === it.sub) || {}).name || '—';
  const pack = (it) => (it.ctn > 1 ? `CTN ${it.ctn} × ${it.loose}` : `Single ${it.loose}`);
  const tone = (it) => (it.stock <= Math.max(1, Math.round(it.low / 4)) ? 'red' : it.stock <= it.low ? 'amber' : 'green');
  const ctnSplit = (it, q = it.stock) => (it.ctn > 1 ? `${fmt(Math.floor(q / it.ctn))} CTN + ${fmt(q % it.ctn)} ${it.loose}` : `${fmt(q)} ${it.loose}`);
  const ATTR = { short: { l: 'Short Item', ic: 'scissors', t: 'warn' }, expiry: { l: 'Expiry Required', ic: 'calendar-clock', t: 'info' }, precious: { l: 'Precious', ic: 'gem', t: 'violet' }, controlled: { l: 'Controlled', ic: 'shield-alert', t: 'danger' } };
  const coTile = (it, cls = '') => { const c = co(it.company); return `<span class="pr-tile ${cls}" style="--co:${c.color}">${it.img ? `<img src="${it.img}" alt="">` : `<i data-lucide="${cls_icon(it)}"></i>`}</span>`; };
  const cls_icon = (it) => cls(it.cls).icon || 'package';
  const urdu = (it) => URDU[it.sku] || URDU_CLS[it.cls] || 'مصنوعات';
  P.helpers = { bars, ean, item, co };

  /* ====================================================================== */
  /* 1 · PRODUCT CATALOGUE                                                   */
  /* ====================================================================== */
  const C = { f: { scope: '', company: '', cls: '', min: '', max: '', shelf: '', attr: '', q: '', view: 'detail', sort: 'name:1' }, tab: 'all', page: 1, per: 15, sel: new Set(), pin: null, flash: new Set(), sec: null };
  const TABS = [
    { k: 'all', l: 'All' }, { k: 'company', l: 'By Company', g: (i) => i.company, gl: (k) => co(k).name },
    { k: 'cls', l: 'By Class', g: (i) => i.cls, gl: (k) => cls(k).name }, { k: 'shelf', l: 'Shelf', g: (i) => i.shelf || '—', gl: (k) => 'Shelf ' + k },
    { k: 'short', l: 'Short Items', a: 'short' }, { k: 'expiry', l: 'Expiry Required', a: 'expiry' }, { k: 'precious', l: 'Precious', a: 'precious' }, { k: 'controlled', l: 'Controlled', a: 'controlled' },
    { k: 'stock', l: 'Stock List' },
  ];
  function baseFiltered() {
    const f = C.f, q = f.q.trim().toLowerCase();
    return P.items.filter((it) =>
      (!f.scope || (f.scope === 'low' ? it.stock <= it.low : it.status === f.scope)) &&
      (!f.company || it.company === f.company) && (!f.cls || it.cls === f.cls) && (!f.shelf || it.shelf === f.shelf) &&
      (!f.attr || it.attrs.includes(f.attr)) &&
      (f.min === '' || it.stock >= +f.min) && (f.max === '' || it.stock <= +f.max) &&
      (!q || (it.sku + ' ' + it.name + ' ' + it.upc + ' ' + it.barcodes.join(' ') + ' ' + co(it.company).name).toLowerCase().includes(q)));
  }
  function rowsFor(tab) {
    const t = TABS.find((x) => x.k === tab) || TABS[0];
    let rows = baseFiltered();
    if (t.a) rows = rows.filter((i) => i.attrs.includes(t.a));
    const [key, dir] = C.f.sort.split(':');
    rows.sort((a, b) => { const x = a[key], y = b[key]; return (typeof x === 'string' ? x.localeCompare(y) : x - y) * +dir; });
    if (t.g) rows.sort((a, b) => t.gl(t.g(a)).localeCompare(t.gl(t.g(b))));
    if (C.pin) { const k = rows.findIndex((r) => r.sku === C.pin); if (k > 0) rows.unshift(rows.splice(k, 1)[0]); }
    return rows;
  }
  function filterLabel() {
    const f = C.f, out = [];
    if (f.scope) out.push({ Active: 'Active', Draft: 'Drafts', Inactive: 'Inactive', low: 'Low Stock' }[f.scope]);
    if (f.company) out.push(coName(f.company));
    if (f.cls) out.push(cls(f.cls).name);
    if (f.min !== '' || f.max !== '') out.push(`Stock ${f.min || 0}–${f.max || '∞'}`);
    if (f.shelf) out.push('Shelf ' + f.shelf);
    if (f.attr) out.push(ATTR[f.attr].l);
    if (f.q) out.push(`“${f.q}”`);
    const t = TABS.find((x) => x.k === C.tab);
    if (t && t.k !== 'all') out.push(t.l);
    return out;
  }
  const stockPill = (it) => `<span class="pr-stock ${tone(it)}" title="${esc(ctnSplit(it))}">${fmt(it.stock)}</span>`;
  const stateTag = (it) => (it.status !== 'Active' ? `<i class="pr-state ${it.status.toLowerCase()}">${it.status}</i>` : '');
  const attrDots = (it) => it.attrs.map((a) => `<span class="pr-adot ${ATTR[a].t}" title="${ATTR[a].l}"><i data-lucide="${ATTR[a].ic}"></i></span>`).join('');
  function headHTML(stock) {
    return '<tr><th class="pr-chk" data-nosort><input type="checkbox" data-pr-all aria-label="Select all on page"></th><th>Code</th><th>Product Name</th>' +
      (stock ? '<th>Pack</th>' : '<th>UPC</th><th>Company</th><th>Class</th><th>Pack</th>') +
      '<th>Shelf</th><th class="num">High<br>Level</th><th class="num">Low<br>Level</th>' +
      (stock ? '<th class="num">Cost /<br>Unit</th><th class="num">CTN + Loose</th><th class="num">Stock Value</th>' : '<th class="num">Purchase<br>Price</th><th class="num">Retail<br>Price</th><th class="num">W. Price</th>') +
      '<th class="pr-stc">Stock</th><th class="pr-act" aria-label="Actions"></th></tr>';
  }
  function rowHTML(it, stock, i) {
    const c = co(it.company), sel = C.sel.has(it.sku);
    return `<tr data-sku="${it.sku}" class="${sel ? 'selected' : ''} ${it.status !== 'Active' ? 'pr-muted' : ''} ${C.flash.has(it.sku) ? 'pr-flash' : ''}" style="--i:${i}" tabindex="0">` +
      `<td class="pr-chk"><input type="checkbox" data-pr-row aria-label="Select ${esc(it.sku)}"${sel ? ' checked' : ''}></td>` +
      `<td class="pr-code">${esc(it.sku)}${stateTag(it)}</td>` +
      `<td class="pr-name"><span>${esc(it.name)}</span>${attrDots(it)}</td>` +
      (stock ? `<td>${pack(it)}</td>` : `<td class="pr-mono">${esc(it.upc)}</td><td class="pr-coname"><span class="pr-codot" style="--co:${c.color}"></span>${esc(coName(it.company))}</td><td class="pr-clsname">${esc(cls(it.cls).name)}</td><td class="pr-pack">${pack(it)}</td>`) +
      `<td><span class="pr-shelf">${esc(it.shelf || '—')}</span></td><td class="num">${fmt(it.high)}</td><td class="num">${fmt(it.low)}</td>` +
      (stock ? `<td class="num">${fmt(it.cpu || it.cost, 2)}</td><td class="num pr-ctnq">${ctnSplit(it)}</td><td class="num"><b>${money(it.stock * (it.cpu || it.cost), { dec: 0 })}</b></td>`
        : `<td class="num pr-price" data-pr-price="cost">${fmt(it.cost, 2)}</td><td class="num pr-price" data-pr-price="price">${fmt(it.price, 2)}</td><td class="num pr-price" data-pr-price="wprice">${fmt(it.wprice, 2)}</td>`) +
      `<td class="pr-stc">${stockPill(it)}</td><td class="pr-act"><button class="pr-kebab" type="button" data-pr-kebab aria-label="Actions for ${esc(it.sku)}"><i data-lucide="ellipsis-vertical"></i></button></td></tr>`;
  }
  function tileHTML(it, i) {
    const c = co(it.company), lvl = Math.min(100, Math.round((it.stock / Math.max(1, it.high)) * 100));
    return `<article class="pr-ptile-card ${C.sel.has(it.sku) ? 'selected' : ''} ${C.flash.has(it.sku) ? 'pr-flash' : ''} ${it.status !== 'Active' ? 'pr-muted' : ''}" data-sku="${it.sku}" style="--i:${i};--co:${c.color}" tabindex="0">
      <div class="pr-pt-top">${coTile(it)}<label class="pr-pt-chk"><input type="checkbox" data-pr-row aria-label="Select ${esc(it.sku)}"${C.sel.has(it.sku) ? ' checked' : ''}></label><button class="pr-kebab" type="button" data-pr-kebab aria-label="Actions"><i data-lucide="ellipsis-vertical"></i></button></div>
      <small class="pr-pt-code">${esc(it.sku)} · ${esc(coName(it.company))}${stateTag(it)}</small>
      <b class="pr-pt-name">${esc(it.name)}</b>
      <div class="pr-pt-meta"><span>${pack(it)}</span><span>Shelf ${esc(it.shelf || '—')}</span></div>
      <div class="pr-pt-price"><b>${money(it.price)}</b><small>W. ${fmt(it.wprice)}</small></div>
      <div class="pr-pt-stock"><span class="pr-lvl ${tone(it)}"><i style="width:${lvl}%"></i></span>${stockPill(it)}</div>
    </article>`;
  }
  function renderCat() {
    const sec = C.sec; if (!sec) return;
    const tab = TABS.find((x) => x.k === C.tab), stock = C.tab === 'stock', view = C.f.view;
    const rows = rowsFor(C.tab), total = rows.length;
    const pages = Math.max(1, Math.ceil(total / C.per)); if (C.page > pages) C.page = pages;
    const start = (C.page - 1) * C.per, pageRows = rows.slice(start, start + C.per);
    // scope tabs with counts
    const base = baseFiltered();
    $('[data-pr-scopes]', sec).innerHTML = TABS.map((t) => {
      let n = t.a ? base.filter((i) => i.attrs.includes(t.a)).length : t.g ? new Set(base.map(t.g)).size : base.length;
      return `<button type="button" role="tab" class="${C.tab === t.k ? 'on' : ''}" data-pr-tab="${t.k}" aria-selected="${C.tab === t.k}">${t.l}${t.k === 'stock' ? '' : ` <em>${fmt(n)}</em>`}</button>`;
    }).join('');
    // table / tiles
    const wrap = $('[data-pr-tablewrap]', sec), tiles = $('[data-pr-tiles]', sec);
    sec.classList.toggle('pr-compact', view === 'compact');
    wrap.hidden = view === 'grid'; tiles.hidden = view !== 'grid';
    if (view === 'grid') {
      tiles.innerHTML = pageRows.length ? pageRows.map(tileHTML).join('') : emptyHTML(true);
    } else {
      $('[data-pr-thead]', sec).innerHTML = headHTML(stock);
      const cols = stock ? 13 : 15;
      let html = '', last = null;
      pageRows.forEach((it, i) => {
        if (tab.g) {
          const g = tab.g(it);
          if (g !== last) {
            const all = rows.filter((r) => tab.g(r) === g), st = all.reduce((a, x) => a + x.stock, 0);
            const dot = C.tab === 'company' ? `<span class="pr-codot" style="--co:${co(g).color}"></span>` : C.tab === 'cls' ? `<i data-lucide="${cls(g).icon}"></i>` : '<i data-lucide="map-pin"></i>';
            html += `<tr class="pr-group"><td colspan="${cols}">${dot}<b>${esc(tab.gl(g))}</b><small>· ${all.length} product${all.length === 1 ? '' : 's'} · ${fmt(st)} in stock</small></td></tr>`;
            last = g;
          }
        }
        html += rowHTML(it, stock, i);
      });
      $('[data-pr-tbody]', sec).innerHTML = html || `<tr class="pr-empty"><td colspan="${cols}">${emptyHTML()}</td></tr>`;
    }
    $('[data-pr-showing]', sec).innerHTML = total ? `Showing <b>${start + 1}–${start + pageRows.length}</b> of <b>${fmt(total)}</b> products` : 'Showing 0 products';
    const fl = filterLabel(), chip = $('[data-pr-fchip]', sec);
    chip.innerHTML = `Filtered: <b>${esc(fl.length ? fl.join(' · ') : 'All Products')}</b>${fl.length ? '<button type="button" aria-label="Clear filters" data-pr-clear><i data-lucide="x"></i></button>' : ''}`;
    chip.classList.toggle('on', !!fl.length);
    $('[data-pr-pager]', sec).innerHTML = pagerHTML(C.page, pages);
    updateBulk();
    icons(sec);
    if (C.flash.size) { const f = C.flash; setTimeout(() => { f.forEach((s) => { const r = $(`[data-sku="${s}"]`, sec); if (r) r.classList.remove('pr-flash'); }); }, 2600); C.flash = new Set(); }
  }
  function emptyHTML(tile) {
    return `<div class="pr-emptybox ${tile ? 'tile' : ''}"><span><i data-lucide="package-search"></i></span><b>No products match</b><small>Try widening the stock range or clearing a filter.</small><button class="btn secondary sm" type="button" data-pr-clear><i data-lucide="rotate-ccw"></i>Clear filters</button></div>`;
  }
  function pagerHTML(page, pages) {
    const nums = [];
    for (let p = 1; p <= pages; p++) if (p === 1 || p === pages || Math.abs(p - page) <= 1) nums.push(p); else if (nums[nums.length - 1] !== '…') nums.push('…');
    return `<button type="button" class="nav" data-pg="${page - 1}" ${page <= 1 ? 'disabled' : ''} aria-label="Previous page"><i data-lucide="chevron-left"></i></button>` +
      nums.map((p) => (p === '…' ? '<span class="dots">…</span>' : `<button type="button" class="${p === page ? 'on' : ''}" data-pg="${p}">${p}</button>`)).join('') +
      `<button type="button" class="nav" data-pg="${page + 1}" ${page >= pages ? 'disabled' : ''} aria-label="Next page"><i data-lucide="chevron-right"></i></button>`;
  }
  function updateBulk() {
    const sec = C.sec, n = C.sel.size, bar = $('[data-pr-bulk]', sec);
    bar.hidden = !n; $('[data-pr-hint]', sec).hidden = !!n;
    $('[data-pr-selcount]', sec).textContent = n + ' selected';
    const all = $('[data-pr-all]', sec);
    if (all) { const page = $$('[data-pr-row]', sec); const on = page.filter((b) => b.checked).length; all.checked = !!page.length && on === page.length; all.indeterminate = on > 0 && on < page.length; }
  }
  function fillCatSelects(sec) {
    const fill = (sel, opts, first) => { const v = sel.value; sel.innerHTML = `<option value="">${first}</option>` + opts.map(([k, l]) => `<option value="${esc(k)}">${esc(l)}</option>`).join(''); sel.value = v; };
    fill($('[data-pr-f="company"]', sec), P.companies.map((c) => [c.code, c.name]), 'All Companies');
    fill($('[data-pr-f="cls"]', sec), P.classes.map((c) => [c.id, c.name]), 'All Classes');
    fill($('[data-pr-f="shelf"]', sec), [...new Set(P.items.map((i) => i.shelf).filter(Boolean))].sort().map((s) => [s, 'Shelf ' + s]), 'All Shelves');
  }
  function clearFilters() {
    Object.assign(C.f, { scope: '', company: '', cls: '', min: '', max: '', shelf: '', attr: '', q: '' });
    $$('[data-pr-f]', C.sec).forEach((el) => { const k = el.dataset.prF; if (k !== 'view' && k !== 'sort') el.value = ''; });
    C.tab = 'all'; C.page = 1; C.pin = null; renderCat();
  }
  function openDetail(sku) { P.cur = sku; FS.go('app/inventory/products/view'); }
  function removeItems(skus, label) {
    const removed = skus.map((s) => ({ it: item(s), at: P.items.indexOf(item(s)) })).filter((x) => x.it);
    const rowsEl = skus.map((s) => $(`[data-sku="${s}"]`, C.sec)).filter(Boolean);
    rowsEl.forEach((r) => r.classList.add('pr-out'));
    setTimeout(() => {
      P.items = P.items.filter((i) => !skus.includes(i.sku)); skus.forEach((s) => C.sel.delete(s)); renderCat();
      FS.toast(label + ' deleted', { tone: 'danger', undo: () => { removed.sort((a, b) => a.at - b.at).forEach((x) => P.items.splice(x.at, 0, x.it)); removed.forEach((x) => C.flash.add(x.it.sku)); renderCat(); } });
    }, reduce() ? 0 : 320);
  }
  function setStatus(skus, st) {
    skus.forEach((s) => { const it = item(s); if (it) it.status = st; C.flash.add(s); });
    renderCat(); FS.toast(`${skus.length} product${skus.length === 1 ? '' : 's'} ${st === 'Active' ? 'activated' : 'deactivated'}`, { tone: st === 'Active' ? 'good' : 'info' });
  }
  function rowMenu(btn, sku) {
    const it = item(sku); if (!it) return;
    FS.menu(btn, [
      { label: 'View details', icon: 'eye', onClick: () => openDetail(sku) },
      { label: 'Edit product', icon: 'pencil', onClick: () => openForm('edit', sku) },
      { label: 'Duplicate', icon: 'copy', onClick: () => openForm('dup', sku) },
      { label: 'Print label', icon: 'printer', onClick: () => { P.labelPick = [sku]; FS.go('app/inventory/labels'); } },
      { label: 'Bulk price (this company)', icon: 'percent', onClick: () => openBulk('company', it.company) },
      { sep: true },
      it.status === 'Active' ? { label: 'Deactivate', icon: 'power-off', onClick: () => setStatus([sku], 'Inactive') } : { label: 'Activate', icon: 'power', onClick: () => setStatus([sku], 'Active') },
      { label: 'Delete', icon: 'trash-2', danger: true, onClick: () => FS.confirm({ title: `Delete ${it.sku}?`, text: `${esc(it.name)} will be removed from the catalogue. Stock history is kept.`, okLabel: 'Delete', danger: true }).then((ok) => ok && removeItems([sku], it.sku)) },
    ]);
  }
  function inlineEdit(td) {
    if (td.querySelector('input')) return;
    const sku = td.closest('tr').dataset.sku, field = td.dataset.prPrice, it = item(sku), old = it[field];
    td.classList.add('pr-editing');
    td.innerHTML = `<input class="pr-cellin" type="number" step="0.01" min="0" value="${old}" aria-label="Edit ${field}">`;
    const inp = td.querySelector('input'); inp.focus(); inp.select();
    let done = false;
    const finish = (save) => {
      if (done) return; done = true;
      const v = num(inp.value);
      if (save && v != null && v >= 0 && v !== old) {
        it[field] = Math.round(v * 100) / 100; renderCat();
        const cell = $(`[data-sku="${sku}"] [data-pr-price="${field}"]`, C.sec); if (cell) cell.classList.add('pr-cellflash');
        const nm = { cost: 'Purchase', price: 'Retail', wprice: 'W. price' }[field];
        FS.toast(`${sku} · ${nm} ${fmt(old, 2)} → ${fmt(it[field], 2)}`, { tone: 'good', undo: () => { it[field] = old; renderCat(); } });
      } else renderCat();
    };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); if (e.key === 'Tab') { e.preventDefault(); finish(true); } });
    inp.addEventListener('blur', () => finish(true));
  }
  function importSheet() {
    const sh = FS.sheet({ title: 'Import products', subtitle: 'CSV or Excel · code, name, UPC, pack, company, class, prices, levels',
      html: `<div class="pr-imp"><label class="pr-drop big" tabindex="0"><input type="file" accept=".csv,.xlsx,.xls" hidden data-pr-impfile><span class="pr-drop-ic"><i data-lucide="file-spreadsheet"></i></span><div><b>Drop your file here</b><small>or click to browse · we validate every row before importing</small></div></label>
        <div class="pr-imp-row"><i data-lucide="file-down"></i><span>Need the layout? <button class="pr-link" type="button" data-pr-imptpl>Download template</button></span><span class="spacer"></span><button class="btn secondary sm" type="button" data-pr-impsample><i data-lucide="sparkles"></i>Use sample file (3 rows)</button></div>
        <div class="pr-imp-res" data-pr-impres hidden></div></div>`,
      foot: '<button class="btn secondary" type="button" data-close>Close</button>' });
    const doImport = (btn, name) => {
      const res = $('[data-pr-impres]', sh); res.hidden = false;
      res.innerHTML = `<span class="pr-spin dark"></span>Validating <b>${esc(name)}</b>…`;
      setTimeout(() => {
        const rows = [['FD-5015', 'Shan Chaat Masala 50g', 'CO-08', 'MC-005', 'ST-010', 'Pack', 144, 98, 125, 1440, 'D1', 720, 6000, ['expiry']], ['PK-1010', 'Kraft Paper Roll 36" (25kg)', 'CO-07', 'MC-001', 'ST-003', 'Roll', 1, 6400, 7900, 18, 'A4', 6, 40, []], ['OF-2014', 'Sticky Notes 3×3 (12 pads)', 'CO-03', 'MC-002', 'ST-005', 'Pack', 24, 380, 520, 240, 'B3', 48, 480, []]];
        const added = [];
        rows.forEach((e) => {
          if (item(e[0])) return;
          const upc = newUpc();
          P.items.unshift({ sku: e[0], name: e[1], company: e[2], cls: e[3], sub: e[4], loose: e[5], ctn: e[6], cost: e[7], price: e[8], wprice: Math.round(e[8] * 0.93), stock: e[9], shelf: e[10], low: e[11], high: e[12], attrs: e[13], status: 'Active', upc, barcodes: [upc, ean('1' + upc.slice(1, 12))], fin: 0, cpu: e[7], batches: [] });
          added.push(e[0]); C.flash.add(e[0]);
        });
        res.innerHTML = added.length ? `<i data-lucide="circle-check"></i><span><b>${added.length} products imported</b> · 0 errors · ${added.join(', ')}</span>` : '<i data-lucide="info"></i><span>These rows are already in your catalogue. Nothing to import.</span>';
        res.classList.toggle('ok', !!added.length); icons(res);
        if (added.length) { C.f.sort = 'name:1'; C.pin = null; fillCatSelects(C.sec); clearFilters(); C.flash = new Set(added); renderCat(); FS.toast(`${added.length} products imported`, { tone: 'good' }); }
      }, reduce() ? 100 : 900);
    };
    sh.addEventListener('click', (e) => {
      if (e.target.closest('[data-pr-impsample]')) doImport(e.target.closest('button'), 'sample-products.csv');
      else if (e.target.closest('[data-pr-imptpl]')) FS.toast('Template downloaded · finsoft-products-template.xlsx', { tone: 'info' });
    });
    const fi = $('[data-pr-impfile]', sh); fi.addEventListener('change', () => fi.files[0] && doImport(null, fi.files[0].name));
    const dz = $('.pr-drop', sh); wireDrop(dz, (f) => doImport(null, f.name));
  }
  function wireDrop(dz, onFile) {
    ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('over'); }));
    dz.addEventListener('drop', (e) => { const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) onFile(f); });
    dz.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); dz.querySelector('input[type=file]').click(); } });
  }

  function mountCat(sec) {
    C.sec = sec;
    fillCatSelects(sec);
    sec.addEventListener('input', (e) => {
      const f = e.target.closest('[data-pr-f]'); if (!f) return;
      const k = f.dataset.prF;
      if (k === 'q' || k === 'min' || k === 'max') { C.f[k] = f.value; C.page = 1; C.pin = null; renderCat(); }
    });
    sec.addEventListener('change', (e) => {
      const f = e.target.closest('[data-pr-f]');
      if (f && !['q', 'min', 'max'].includes(f.dataset.prF)) {
        C.f[f.dataset.prF] = f.value; C.page = 1; C.pin = null;
        if (f.dataset.prF === 'view') { const ic = $('[data-pr-viewic]', sec); if (ic) { const n = document.createElement('i'); n.setAttribute('data-lucide', { detail: 'list', compact: 'rows-3', grid: 'layout-grid' }[f.value]); n.setAttribute('data-pr-viewic', ''); ic.replaceWith(n); } }
        renderCat(); return;
      }
      if (e.target.matches('[data-pr-per]')) { C.per = +e.target.value; C.page = 1; renderCat(); return; }
      if (e.target.matches('[data-pr-all]')) { $$('[data-pr-row]', sec).forEach((b) => { const s = b.closest('[data-sku]').dataset.sku; b.checked = e.target.checked; e.target.checked ? C.sel.add(s) : C.sel.delete(s); b.closest('[data-sku]').classList.toggle('selected', e.target.checked); }); updateBulk(); return; }
      if (e.target.matches('[data-pr-row]')) { const r = e.target.closest('[data-sku]'); e.target.checked ? C.sel.add(r.dataset.sku) : C.sel.delete(r.dataset.sku); r.classList.toggle('selected', e.target.checked); updateBulk(); }
    });
    sec.addEventListener('click', (e) => {
      const t = e.target;
      if (t.closest('[data-pr-new]')) return openForm('new');
      if (t.closest('[data-pr-import]')) return importSheet();
      if (t.closest('[data-pr-export]')) return FS.toast(`Exported ${rowsFor(C.tab).length} products to Excel`, { tone: 'good' });
      if (t.closest('[data-pr-clear]')) return clearFilters();
      const tb = t.closest('[data-pr-tab]'); if (tb) { C.tab = tb.dataset.prTab; C.page = 1; C.pin = null; renderCat(); return; }
      const pg = t.closest('[data-pg]'); if (pg && pg.closest('[data-pr-pager]')) { C.page = +pg.dataset.pg; renderCat(); $('[data-pr-tablecard]', sec).scrollIntoView({ block: 'nearest', behavior: reduce() ? 'auto' : 'smooth' }); return; }
      const ba = t.closest('[data-pr-bulkact]');
      if (ba) {
        const skus = [...C.sel], a = ba.dataset.prBulkact;
        if (a === 'none') { C.sel.clear(); renderCat(); }
        else if (a === 'activate' || a === 'deactivate') setStatus(skus, a === 'activate' ? 'Active' : 'Inactive');
        else if (a === 'delete') FS.confirm({ title: `Delete ${skus.length} products?`, text: 'They will be removed from the catalogue. You can undo straight after.', okLabel: 'Delete', danger: true }).then((ok) => ok && removeItems(skus, skus.length + ' products'));
        else if (a === 'labels') { P.labelPick = skus; FS.go('app/inventory/labels'); }
        else if (a === 'price') openBulk('sel');
        return;
      }
      const kb = t.closest('[data-pr-kebab]'); if (kb) { e.stopPropagation(); rowMenu(kb, kb.closest('[data-sku]').dataset.sku); return; }
      if (t.closest('input, button, label, .pr-chk, .pr-editing')) return;
      const row = t.closest('tr[data-sku], .pr-ptile-card[data-sku]');
      if (row && !t.closest('[data-pr-price]')) {
        clearTimeout(C.clickT); const sku = row.dataset.sku;
        C.clickT = setTimeout(() => openDetail(sku), 230); // wait so a double-click on a price can win
      }
    });
    sec.addEventListener('dblclick', (e) => { const td = e.target.closest('[data-pr-price]'); if (td) { clearTimeout(C.clickT); inlineEdit(td); } });
    sec.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('tr[data-sku], .pr-ptile-card')) openDetail(e.target.dataset.sku); });
    document.addEventListener('keydown', (e) => {
      if (!sec.classList.contains('active') || $('.overlay.open')) return;
      if (e.key === '/' && !e.target.closest('input, textarea, select')) { e.preventDefault(); $('[data-pr-f="q"]', sec).focus(); }
    });
    mountForm(sec); mountBulk(sec);
  }
  FS.onEnter('app/inventory/items', (sec, r, first) => {
    if (first) mountCat(sec); else fillCatSelects(sec);
    renderCat();
  });

  /* ---------- New / edit product form ---------- */
  const M = { mode: 'new', sku: null, img: null };
  const fEl = (n) => $(`[data-pr-form] [name="${n}"]`, C.sec);
  function fillFormSelects() {
    const sec = C.sec;
    $('[data-pr-cosel]', sec).innerHTML = '<option value="">Select company</option>' + P.companies.map((c) => `<option value="${c.code}">${esc(c.name)}</option>`).join('');
    $('[data-pr-distsel]', sec).innerHTML = '<option value="">Select distributor</option>' + D.vendors.map((v) => `<option value="${v.code}">${esc(v.name)}</option>`).join('');
    $('[data-pr-clssel]', sec).innerHTML = '<option value="">Select class</option>' + P.classes.map((c) => `<option value="${c.id}">${esc(c.name)} · ${c.id}</option>`).join('');
  }
  function fillSubs(clsId, val) {
    const s = $('[data-pr-subsel]', C.sec), c = P.classes.find((x) => x.id === clsId);
    s.disabled = !c;
    s.innerHTML = c ? '<option value="">Select sub type</option>' + c.subs.map((x) => `<option value="${x.id}">${esc(x.name)} · ${x.id}</option>`).join('') : '<option value="">Select a class first</option>';
    if (val) s.value = val;
    if (c) { s.classList.remove('pr-pop'); void s.offsetWidth; s.classList.add('pr-pop'); }
  }
  function resetForm() {
    const form = $('[data-pr-form]', C.sec); form.reset();
    $$('.pr-ff.err', form).forEach((l) => l.classList.remove('err'));
    fillSubs('');
    M.img = null; const img = $('[data-pr-img]', C.sec); img.hidden = true; img.removeAttribute('src'); $('[data-pr-drop]', C.sec).classList.remove('has');
    formLive();
  }
  function openForm(mode, sku) {
    if (!C.sec) return;
    M.mode = mode; M.sku = sku || null;
    fillFormSelects(); resetForm();
    const it = sku && item(sku);
    $('[data-pr-ftitle]', C.sec).textContent = mode === 'edit' ? 'Edit Product' : mode === 'dup' ? 'Duplicate Product' : 'New Product';
    $('[data-pr-fsub]', C.sec).textContent = mode === 'edit' ? `${it.sku} · ${it.name}` : 'Add a new product to your inventory';
    $('[data-pr-fsave="save"] span', C.sec).textContent = mode === 'edit' ? 'Update Product' : 'Save Product';
    if (it) {
      const v = { sku: mode === 'dup' ? '' : it.sku, upc: mode === 'dup' ? '' : it.upc, name: it.name + (mode === 'dup' ? ' (copy)' : ''), ctn: it.ctn, loose: it.loose, company: it.company, dist: it.dist || '', shelf: it.shelf, cost: it.cost, price: it.price, wprice: it.wprice, cpu: it.cpu || '', high: it.high, low: it.low, fin: it.fin || '', cls: it.cls, bcPiece: mode === 'dup' ? '' : it.barcodes[0] || '', bcCtn: mode === 'dup' ? '' : it.barcodes[1] || '' };
      Object.keys(v).forEach((k) => { const el = fEl(k); if (el) el.value = v[k]; });
      fillSubs(it.cls, it.sub);
      ['short', 'expiry', 'controlled', 'precious'].forEach((a) => { fEl('a-' + a).checked = it.attrs.includes(a); });
      if (it.img && mode === 'edit') { M.img = it.img; const img = $('[data-pr-img]', C.sec); img.src = it.img; img.hidden = false; $('[data-pr-drop]', C.sec).classList.add('has'); }
    }
    $$('[data-pr-sec]', C.sec).forEach((s) => { s.classList.add('open'); $('[data-pr-sech]', s).setAttribute('aria-expanded', 'true'); });
    formLive();
    FS.openModal('pr-new');
    setTimeout(() => (fEl(mode === 'edit' ? 'name' : 'sku') || {}).focus && fEl(mode === 'edit' ? 'name' : 'sku').focus(), 120);
  }
  function formLive() {
    const sec = C.sec, g = (n) => num(fEl(n).value);
    const ctn = g('ctn'), loose = fEl('loose').value, cost = g('cost'), price = g('price'), wp = g('wprice'), fin = g('fin') || 0;
    const line = $('[data-pr-uomline]', sec), subl = $('[data-pr-uomsub]', sec), box = $('[data-pr-uom]', sec);
    if (ctn && ctn >= 1 && loose) {
      line.innerHTML = `1 CTN = ${fmt(ctn)} ${esc(loose)}${price ? ` · CTN price <b>${money(price * ctn, { dec: 0 })}</b>` : ''}`;
      subl.innerHTML = [wp ? `W. CTN ${money(wp * ctn, { dec: 0 })}` : '', cost ? `Cost CTN ${money(cost * ctn, { dec: 0 })}` : '', `1 ${esc(loose)} = ${fmt(1 / ctn, ctn > 99 ? 4 : 3)} CTN`].filter(Boolean).join(' · ');
      box.classList.add('live');
    } else { line.textContent = 'Enter a pack size and loose unit'; subl.textContent = 'Carton and piece prices are worked out live'; box.classList.remove('live'); }
    const chip = (label, v, hint) => `<span class="pr-mchip ${v == null ? '' : v < 0 ? 'bad' : v < 10 ? 'low' : 'ok'}"><small>${label}</small><b>${v == null ? '—' : pct(v)}</b>${hint ? `<em>${hint}</em>` : ''}</span>`;
    const m1 = cost && price ? ((price - cost) / price) * 100 : null, m2 = cost && wp ? ((wp - cost) / wp) * 100 : null, mk = cost && price ? ((price - cost) / cost) * 100 : null;
    const net = cost && price ? ((price * (1 - fin / 100) - cost) / (price * (1 - fin / 100))) * 100 : null;
    $('[data-pr-margins]', sec).innerHTML = chip('Retail margin', m1, price && cost ? 'Rs ' + fmt(price - cost, 2) + ' / unit' : '') + chip('W. margin', m2) + chip('Markup', mk) + (fin ? chip('Net after ' + fmt(fin, 1) + '% disc', net) : '');
    fEl('cpu').placeholder = cost ? fmt(cost, 2) + ' (= purchase)' : 'Enter cost per unit';
    $('[data-pr-bc="piece"]', sec).innerHTML = /^\d{12,13}$/.test(fEl('bcPiece').value) ? bars(fEl('bcPiece').value) : '<span class="pr-bc-empty">—</span>';
    $('[data-pr-bc="ctn"]', sec).innerHTML = /^\d{12,13}$/.test(fEl('bcCtn').value) ? bars(fEl('bcCtn').value) : '<span class="pr-bc-empty">—</span>';
  }
  function fieldErr(name, msg) {
    const el = fEl(name), lab = el && el.closest('.pr-ff'); if (!lab) return;
    lab.classList.toggle('err', !!msg); const sm = $('.pr-err', lab); if (sm) sm.textContent = msg || '';
  }
  function validate(draft) {
    const g = (n) => fEl(n).value.trim(), errs = {};
    const sku = g('sku').toUpperCase(), shelf = g('shelf').toUpperCase(), upc = g('upc');
    if (!sku) errs.sku = 'Product code is required';
    else if (!/^[A-Z0-9][A-Z0-9-]{1,11}$/.test(sku)) errs.sku = 'Letters, digits and dashes only';
    else if (item(sku) && !(M.mode === 'edit' && M.sku === sku)) errs.sku = `${sku} already exists`;
    if (!g('name')) errs.name = 'Product name is required';
    if (upc && !/^\d{8}$|^\d{12,13}$/.test(upc)) errs.upc = 'UPC must be 8, 12 or 13 digits';
    if (shelf && !/^[A-Z]{1,2}\d{1,3}$/.test(shelf)) errs.shelf = 'Use 1–2 letters then up to 3 digits (e.g. A1, PR12)';
    if (!draft) {
      if (!(num(g('ctn')) >= 1)) errs.ctn = 'Pack size is required';
      if (!g('loose')) errs.loose = 'Choose a loose unit';
      if (!g('company')) errs.company = 'Choose a company';
      if (!(num(g('cost')) > 0)) errs.cost = 'Purchase price is required';
      if (!(num(g('price')) > 0)) errs.price = 'Retail price is required';
      else if (num(g('cost')) > 0 && num(g('price')) < num(g('cost'))) errs.price = 'Retail is below purchase price';
      if (!g('cls')) errs.cls = 'Choose a class';
    }
    if (num(g('low')) != null && num(g('high')) != null && num(g('low')) > num(g('high'))) errs.low = 'Low level is above high level';
    ['sku', 'name', 'upc', 'shelf', 'ctn', 'loose', 'company', 'cost', 'price', 'cls', 'low'].forEach((k) => fieldErr(k, errs[k]));
    return errs;
  }
  async function saveForm(draft, btn) {
    const errs = validate(draft), keys = Object.keys(errs);
    if (keys.length) {
      const first = fEl(keys[0]), secEl = first.closest('[data-pr-sec]');
      if (secEl && !secEl.classList.contains('open')) toggleSec(secEl, true);
      shake($('.pr-modal', C.sec)); first.focus();
      FS.toast(`${keys.length} field${keys.length > 1 ? 's need' : ' needs'} attention`, { tone: 'warn', ms: 2400 });
      return;
    }
    await busy(btn, draft ? 'Saving draft…' : 'Saving…');
    const g = (n) => fEl(n).value.trim(), n = (k, d) => (num(g(k)) == null ? d : num(g(k)));
    const sku = g('sku').toUpperCase(), upc = g('upc') || newUpc();
    const prev = M.mode === 'edit' ? item(M.sku) : null;
    const it = Object.assign(prev || { stock: 0, batches: [] }, {
      sku, upc, name: g('name'), ctn: n('ctn', 1), loose: g('loose') || 'Pcs', company: g('company') || 'CO-07', dist: g('dist'), shelf: g('shelf').toUpperCase(),
      cost: n('cost', 0), price: n('price', 0), wprice: n('wprice', Math.round(n('price', 0) * 0.93)), cpu: n('cpu', n('cost', 0)), high: n('high', 0), low: n('low', 0), fin: n('fin', 0),
      cls: g('cls') || 'MC-001', sub: g('sub'), attrs: ['short', 'expiry', 'controlled', 'precious'].filter((a) => fEl('a-' + a).checked),
      barcodes: [g('bcPiece') || upc, g('bcCtn') || ean('1' + upc.slice(1, 12))], status: draft ? 'Draft' : (prev && prev.status !== 'Draft' ? prev.status : 'Active'), img: M.img || (prev && prev.img) || null,
    });
    if (!prev) P.items.unshift(it);
    FS.closeOverlay(document.getElementById('pr-new'));
    C.pin = sku; C.page = 1; C.flash.add(sku);
    if (!rowsFor(C.tab).some((r) => r.sku === sku)) { clearFilters(); C.pin = sku; C.flash.add(sku); }
    fillCatSelects(C.sec); renderCat();
    const row = $(`[data-sku="${sku}"]`, C.sec);
    if (row) row.scrollIntoView({ block: 'nearest', behavior: reduce() ? 'auto' : 'smooth' });
    if (!draft) FS.celebrate(row || null);
    FS.toast(`${sku} · ${it.name} ${prev ? 'updated' : draft ? 'saved as draft' : 'added to the catalogue'}`, { tone: draft ? 'info' : 'good', action: { label: 'View', fn: () => openDetail(sku) } });
  }
  function toggleSec(s, force) {
    const on = force == null ? !s.classList.contains('open') : force;
    s.classList.toggle('open', on); $('[data-pr-sech]', s).setAttribute('aria-expanded', String(on));
  }
  function mountForm(sec) {
    const ov = $('#pr-new', sec), form = $('[data-pr-form]', ov);
    ov.addEventListener('click', (e) => {
      const h = e.target.closest('[data-pr-sech]'); if (h) return toggleSec(h.closest('[data-pr-sec]'));
      const gen = e.target.closest('[data-pr-gen]');
      if (gen) {
        const k = gen.dataset.prGen;
        if (k === 'upc') { const v = newUpc(); fEl('upc').value = v; if (!fEl('bcPiece').value) fEl('bcPiece').value = v; }
        if (k === 'piece') fEl('bcPiece').value = fEl('upc').value && /^\d{13}$/.test(fEl('upc').value) ? fEl('upc').value : newUpc();
        if (k === 'ctn') { const base = /^\d{13}$/.test(fEl('bcPiece').value) ? fEl('bcPiece').value : newUpc(); fEl('bcCtn').value = ean('1' + base.slice(1, 12)); }
        const target = { upc: 'upc', piece: 'bcPiece', ctn: 'bcCtn' }[k]; const el = fEl(target); el.classList.remove('pr-pop'); void el.offsetWidth; el.classList.add('pr-pop');
        formLive(); return;
      }
      if (e.target.closest('[data-pr-fclear]')) { resetForm(); FS.toast('Form cleared', { tone: 'info', ms: 1600 }); return; }
      const sv = e.target.closest('[data-pr-fsave]'); if (sv) saveForm(sv.dataset.prFsave === 'draft', sv);
      const dz = e.target.closest('[data-pr-drop]'); if (dz && !e.target.matches('input')) $('[data-pr-file]', dz).click();
    });
    form.addEventListener('input', (e) => {
      if (e.target.name === 'shelf') { const v = e.target.value.toUpperCase(); fieldErr('shelf', v && !/^[A-Z]{0,2}\d{0,3}$/.test(v) ? 'Use 1–2 letters then up to 3 digits (e.g. A1, PR12)' : ''); }
      if (e.target.name === 'upc' || e.target.name.startsWith('bc')) e.target.value = e.target.value.replace(/\D/g, '');
      if (e.target.closest('.pr-ff.err') && e.target.value) e.target.closest('.pr-ff').classList.remove('err');
      formLive();
    });
    form.addEventListener('change', (e) => { if (e.target.name === 'cls') fillSubs(e.target.value); formLive(); });
    form.addEventListener('submit', (e) => e.preventDefault());
    form.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveForm(false, $('[data-pr-fsave="save"]', ov)); });
    const dz = $('[data-pr-drop]', ov), file = $('[data-pr-file]', ov);
    const setImg = (f) => { if (!f || !/^image\//.test(f.type)) { FS.toast('Please choose an image file', { tone: 'warn' }); return; } M.img = URL.createObjectURL(f); const img = $('[data-pr-img]', ov); img.src = M.img; img.hidden = false; dz.classList.add('has'); FS.toast('Image attached · ' + f.name, { tone: 'good', ms: 1800 }); };
    file.addEventListener('change', () => setImg(file.files[0]));
    wireDrop(dz, setImg);
  }

  /* ---------- Bulk price update ---------- */
  const B = { by: 'company', target: '', field: 'price', pct: 5, round: 1, rows: [] };
  function bpTargets() {
    const sel = $('[data-pr-bpt]', C.sec), lab = $('[data-pr-bptlabel]', C.sec);
    if (B.by === 'company') { lab.textContent = 'Company'; sel.innerHTML = P.companies.map((c) => `<option value="${c.code}">${esc(c.name)} · ${P.items.filter((i) => i.company === c.code).length}</option>`).join(''); }
    else if (B.by === 'cls') { lab.textContent = 'Class'; sel.innerHTML = P.classes.map((c) => `<option value="${c.id}">${esc(c.name)} · ${P.items.filter((i) => i.cls === c.id).length}</option>`).join(''); }
    else { lab.textContent = 'Selection'; sel.innerHTML = `<option value="sel">${C.sel.size} selected product${C.sel.size === 1 ? '' : 's'}</option>`; }
    if (B.target && [...sel.options].some((o) => o.value === B.target)) sel.value = B.target; else B.target = sel.value;
    sel.disabled = B.by === 'sel';
  }
  const rnd = (v) => (B.round ? Math.max(B.round, Math.round(v / B.round) * B.round) : Math.round(v * 100) / 100);
  function bpRender() {
    const sec = C.sec;
    const list = B.by === 'sel' ? P.items.filter((i) => C.sel.has(i.sku)) : P.items.filter((i) => i[B.by === 'company' ? 'company' : 'cls'] === B.target);
    const fields = B.field === 'both' ? ['price', 'wprice'] : [B.field];
    B.rows = list.map((it) => ({ it, nv: fields.map((f) => [f, rnd(it[f] * (1 + B.pct / 100))]) }));
    $('[data-pr-bpbody]', sec).innerHTML = B.rows.map((r, i) => {
      const f = r.nv[0][0], ov = r.it[f], nv = r.nv[0][1], d = nv - ov;
      const sale = r.nv.find((x) => x[0] === 'price'), newPrice = sale ? sale[1] : r.it.price, newCost = B.field === 'cost' ? nv : r.it.cost;
      const m = newPrice ? ((newPrice - newCost) / newPrice) * 100 : 0;
      return `<tr style="--i:${i}"><td class="pr-code">${r.it.sku}</td><td class="pr-bpname">${esc(r.it.name)}${r.nv.length > 1 ? `<small>W. ${fmt(r.it.wprice, 2)} → ${fmt(r.nv[1][1], 2)}</small>` : ''}</td><td class="num pr-old">${fmt(ov, 2)}</td><td class="pr-arrow"><i data-lucide="arrow-right"></i></td><td class="num"><b>${fmt(nv, 2)}</b></td><td class="num ${d >= 0 ? 'pr-up' : 'pr-down'}">${d >= 0 ? '+' : '−'}${fmt(Math.abs(d), 2)}</td><td class="num"><span class="pr-mchip sm ${m < 0 ? 'bad' : m < 10 ? 'low' : 'ok'}"><b>${pct(m)}</b></span></td></tr>`;
    }).join('') || '<tr><td colspan="7" class="pr-bp-empty">No products in this group yet.</td></tr>';
    const tot = B.rows.reduce((a, r) => a + (r.nv[0][1] - r.it[r.nv[0][0]]), 0);
    $('[data-pr-bpsum]', sec).innerHTML = B.rows.length ? `<b>${B.rows.length}</b> products · avg <b class="${B.pct >= 0 ? 'pr-up' : 'pr-down'}">${B.pct >= 0 ? '+' : '−'}${fmt(Math.abs(tot / B.rows.length), 2)}</b> per unit` : '';
    $('[data-pr-bpapply] span', sec).textContent = `Apply to ${B.rows.length} product${B.rows.length === 1 ? '' : 's'}`;
    $('[data-pr-bpapply]', sec).disabled = !B.rows.length || !B.pct;
    $$('[data-pr-bpq]', sec).forEach((b) => b.classList.toggle('on', +b.dataset.prBpq === B.pct));
    icons($('[data-pr-bpbody]', sec));
  }
  function openBulk(by, target) {
    if (!C.sec) { FS.go('app/inventory/items'); return; }
    if (by === 'sel' && !C.sel.size) by = 'company';
    B.by = by; if (target) B.target = target;
    $$('[data-pr-bpby] button', C.sec).forEach((b) => b.classList.toggle('active', b.dataset.v === B.by));
    $('[data-pr-bpby] [data-v="sel"]', C.sec).disabled = !C.sel.size;
    $('[data-pr-bppct]', C.sec).value = B.pct;
    bpTargets(); bpRender(); FS.openModal('pr-bulkprice');
  }
  function mountBulk(sec) {
    const ov = $('#pr-bulkprice', sec);
    ov.addEventListener('click', async (e) => {
      const by = e.target.closest('[data-pr-bpby] button');
      if (by && !by.disabled) { B.by = by.dataset.v; $$('[data-pr-bpby] button', ov).forEach((b) => b.classList.toggle('active', b === by)); B.target = ''; bpTargets(); bpRender(); return; }
      const st = e.target.closest('[data-pr-bpstep]'); if (st) { B.pct = Math.round((B.pct + +st.dataset.prBpstep * 0.5) * 10) / 10; $('[data-pr-bppct]', ov).value = B.pct; bpRender(); return; }
      const q = e.target.closest('[data-pr-bpq]'); if (q) { B.pct = +q.dataset.prBpq; $('[data-pr-bppct]', ov).value = B.pct; bpRender(); return; }
      const ap = e.target.closest('[data-pr-bpapply]');
      if (ap) {
        const snap = B.rows.map((r) => ({ it: r.it, old: r.nv.map(([f]) => [f, r.it[f]]) }));
        await busy(ap, 'Updating prices…', 900);
        B.rows.forEach((r) => { r.nv.forEach(([f, v]) => { r.it[f] = v; }); C.flash.add(r.it.sku); });
        FS.closeOverlay(ov); renderCat(); FS.celebrate($('[data-pr-tablecard]', C.sec), `${snap.length} prices updated`);
        FS.toast(`Prices ${B.pct >= 0 ? 'raised' : 'lowered'} ${pct(Math.abs(B.pct))} on ${snap.length} products`, { tone: 'good', undo: () => { snap.forEach((s) => s.old.forEach(([f, v]) => { s.it[f] = v; })); renderCat(); } });
      }
    });
    ov.addEventListener('input', (e) => { if (e.target.matches('[data-pr-bppct]')) { B.pct = num(e.target.value) || 0; bpRender(); } });
    ov.addEventListener('change', (e) => {
      if (e.target.matches('[data-pr-bpt]')) B.target = e.target.value;
      if (e.target.matches('[data-pr-bpfield]')) B.field = e.target.value;
      if (e.target.matches('[data-pr-bpround]')) B.round = +e.target.value;
      bpRender();
    });
  }

  /* ====================================================================== */
  /* 2 · PRODUCT DETAIL                                                      */
  /* ====================================================================== */
  const PD = { tab: 'overview', sec: null, ledger: 'all', orders: 'all' };
  const PD_TABS = [['overview', 'Overview', 'layout-dashboard'], ['card', 'Stock Card', 'scroll-text'], ['price', 'Price History', 'chart-line'], ['suppliers', 'Suppliers', 'truck'], ['batches', 'Batches & Expiry', 'calendar-clock'], ['barcodes', 'Barcodes & Labels', 'scan-barcode'], ['orders', 'Open Orders', 'clipboard-list'], ['activity', 'Activity', 'history']];
  const MONTHS = ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];
  const dshort = (d) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const addDays = (n) => { const d = new Date(TODAY); d.setDate(d.getDate() + n); return d; };
  function facts(it) {
    const r = rng(it.sku + 'f');
    const daily = Math.max(0.4, (it.high / (26 + r() * 20)));
    const reserved = it.stock ? Math.min(it.stock, Math.round(it.stock * (0.05 + r() * 0.08))) : 0;
    return { daily, reserved, avail: it.stock - reserved, value: it.stock * (it.cpu || it.cost), cover: it.stock ? Math.round(it.stock / daily) : 0, lead: 3 + Math.floor(r() * 8) };
  }
  function locSplit(it) {
    const r = rng(it.sku + 'loc'), w = D.locations.map((l, i) => (i === 0 ? 3.2 : i === 1 ? 2.1 : 0.6 + r() * 1.4) * (0.7 + r() * 0.6));
    const tot = w.reduce((a, b) => a + b, 0); let left = it.stock;
    return D.locations.map((l, i) => { const q = i === D.locations.length - 1 ? left : Math.round((it.stock * w[i]) / tot); left -= q; return { l, q: Math.max(0, q) }; });
  }
  function ledger(it) {
    const r = rng(it.sku + 'led'), out = [], u = Math.max(it.ctn, Math.round(it.high / 12));
    const kinds = [['Sales Invoice', 'SI', -1, 'info'], ['GRN', 'GRN', 1, 'good'], ['Sales Invoice', 'SI', -1, 'info'], ['Transfer Out', 'TRF', -1, 'violet'], ['Sales Return', 'SR', 1, 'warn'], ['Sales Invoice', 'SI', -1, 'info'], ['Transfer In', 'TRF', 1, 'violet'], ['Stock Adjustment', 'ADJ', -1, 'danger']];
    const extra = (P.moves[it.sku] || []);
    let bal = it.stock - extra.reduce((t, m) => t + m.inq - m.outq, 0);
    for (let k = 0; k < 13; k++) {
      const kd = kinds[Math.floor(r() * kinds.length)];
      let q = Math.max(1, Math.round(u * (0.3 + r() * 1.4)));
      if (kd[1] === 'GRN') q = Math.max(it.ctn, Math.round(q * 2.4 / it.ctn) * it.ctn);
      if (kd[2] > 0 && q > bal) q = Math.max(0, bal);
      if (!q) continue;
      const before = bal - kd[2] * q;
      out.push({ date: addDays(-k * 2 - Math.floor(r() * 2)), type: kd[0], doc: `${kd[1]}-2026-${String(400 + Math.floor(r() * 500)).padStart(4, '0')}`, tone: kd[3], loc: D.locations[Math.floor(r() * 3)].name, inq: kd[2] > 0 ? q : 0, outq: kd[2] < 0 ? q : 0, bal });
      bal = before;
    }
    out.reverse();
    return { open: bal, rows: out.concat(extra) };
  }
  function priceSeries(it) {
    const r = rng(it.sku + 'px'); const pu = [], sa = [];
    for (let i = 0; i < 12; i++) { const t = i / 11; pu.push(Math.round(it.cost * (0.86 + 0.14 * t + (r() - 0.5) * 0.04))); sa.push(Math.round(it.price * (0.88 + 0.12 * t + (r() - 0.5) * 0.03))); }
    pu[11] = it.cost; sa[11] = it.price; return { pu, sa };
  }
  function suppliers(it) {
    const c = co(it.company), main = D.vendors.find((v) => c.name.toLowerCase().includes(v.name.toLowerCase().split(' ')[0])) || { code: 'VEN-00' + (10 + +it.company.slice(3)), name: c.name.replace(/ Pakistan| \(.*\)/, '') + ' Distribution', city: c.city };
    const r = rng(it.sku + 'sup'), others = D.vendors.filter((v) => v.code !== main.code && /Daraz|TCS|Habib|Siemens/.test(v.name)).slice(0, 2);
    return [main].concat(others).map((v, i) => ({ v, pref: i === 0, price: Math.round(it.cost * (1 + i * 0.035 + r() * 0.02)), lead: 3 + i * 2 + Math.floor(r() * 3), last: addDays(-(4 + i * 17 + Math.floor(r() * 9))), share: i === 0 ? 72 : i === 1 ? 20 : 8 }));
  }
  function orders(it) {
    const r = rng(it.sku + 'ord'), out = [];
    for (let i = 0; i < 3; i++) { const c = D.customers[Math.floor(r() * 9)], q = Math.max(1, Math.round(it.ctn * (1 + r() * 4))), done = Math.round(q * r() * 0.6); out.push({ t: 'SO', no: 'SO-2026-' + String(812 + i * 7 + Math.floor(r() * 5)).padStart(4, '0'), party: c.name, date: addDays(-(2 + i * 3)), due: addDays(2 + i * 3), q, done, st: done ? 'Part delivered' : i === 2 ? 'Awaiting stock' : 'Confirmed' }); }
    const sup = suppliers(it)[0];
    for (let i = 0; i < 2; i++) { const q = Math.max(it.ctn, Math.round(it.high / 3 / it.ctn) * it.ctn); out.push({ t: 'PO', no: 'PO-2026-' + String(411 + i * 4).padStart(4, '0'), party: sup.v.name, date: addDays(-(5 + i * 6)), due: addDays(3 + i * 5), q, done: i ? 0 : Math.round(q / 3), st: i ? 'Approved' : 'Part received' }); }
    return out;
  }
  function pdBadges(it) {
    const b = [`<span class="badge ${it.status === 'Active' ? 'good' : it.status === 'Draft' ? 'warn' : 'neutral'} dot">${it.status}</span>`, `<span class="badge outline"><i data-lucide="${cls(it.cls).icon}"></i>${esc(cls(it.cls).name)} · ${esc(sub(it))}</span>`];
    it.attrs.forEach((a) => b.push(`<span class="badge ${ATTR[a].t}"><i data-lucide="${ATTR[a].ic}"></i>${ATTR[a].l}</span>`));
    return b.join('');
  }
  function pdHTML(it) {
    const c = co(it.company), f = facts(it), cov = f.cover, covT = !it.stock ? 'danger' : cov < 10 ? 'danger' : cov < 25 ? 'warn' : 'good';
    return `<div class="pr-pd-hero" style="--co:${c.color}">
        ${coTile(it, 'xl')}
        <div class="pr-pd-ht"><small>${esc(it.sku)} · UPC ${esc(it.upc)} · ${esc(c.name)}</small><h1>${esc(it.name)}</h1><div class="pr-pd-badges">${pdBadges(it)}</div></div>
        <div class="pr-pd-act">
          <button class="btn secondary" type="button" data-pr-pdact="edit"><i data-lucide="pencil"></i>Edit</button>
          <button class="btn secondary" type="button" data-pr-pdact="label"><i data-lucide="printer"></i>Print label</button>
          <button class="btn secondary" type="button" data-pr-pdact="adjust"><i data-lucide="sliders-horizontal"></i>Adjust stock</button>
          <button class="btn primary" type="button" data-pr-pdact="po"><i data-lucide="shopping-cart"></i>Create PO</button>
        </div>
      </div>
      <div class="pr-pd-kpis">
        <div class="pr-kpi" style="--i:0"><span class="pr-kpi-ic"><i data-lucide="boxes"></i></span><div><small>On hand</small><b data-pr-k="onhand">${ctnSplit(it)}</b><em>${fmt(it.stock)} ${esc(it.loose)} in total</em></div></div>
        <div class="pr-kpi" style="--i:1"><span class="pr-kpi-ic blue"><i data-lucide="circle-check"></i></span><div><small>Available</small><b data-pr-k="avail">${fmt(f.avail)}</b><em>${ctnSplit(it, f.avail)}</em></div></div>
        <div class="pr-kpi" style="--i:2"><span class="pr-kpi-ic orange"><i data-lucide="lock"></i></span><div><small>Reserved</small><b>${fmt(f.reserved)}</b><em>On ${orders(it).filter((o) => o.t === 'SO').length} open sales orders</em></div></div>
        <div class="pr-kpi" style="--i:3"><span class="pr-kpi-ic violet"><i data-lucide="coins"></i></span><div><small>Stock value</small><b data-pr-k="value">${money(f.value, { dec: 0 })}</b><em>At weighted average cost</em></div></div>
        <div class="pr-kpi ${covT}" style="--i:4"><span class="pr-kpi-ic"><i data-lucide="calendar-days"></i></span><div><small>Days of cover</small><b>${it.stock ? cov + ' days' : 'Out of stock'}</b><em>Selling ~${fmt(f.daily, f.daily < 10 ? 1 : 0)} ${esc(it.loose)} a day</em><span class="pr-cover"><i style="width:${Math.min(100, (cov / 60) * 100)}%"></i></span></div></div>
      </div>
      <div class="pr-card pr-pd-tabs">
        <div class="tabs pr-tabs" role="tablist">${PD_TABS.map(([k, l, ic]) => `<button type="button" role="tab" class="${PD.tab === k ? 'active' : ''}" data-pr-pdtab="${k}"><i data-lucide="${ic}"></i>${l}${k === 'batches' && it.batches.length ? `<i>${it.batches.length}</i>` : k === 'orders' ? `<i>${orders(it).length}</i>` : ''}</button>`).join('')}</div>
        <div class="pr-pd-pane" data-pr-pdpane>${paneHTML(it, PD.tab)}</div>
      </div>`;
  }
  function paneHTML(it, tab) {
    const f = facts(it);
    if (tab === 'overview') {
      const locs = locSplit(it), max = Math.max(1, ...locs.map((x) => x.q));
      const top = it.high * 1.15 || 1, pos = Math.min(100, (it.stock / top) * 100), lowP = (it.low / top) * 100, highP = (it.high / top) * 100;
      const st = it.stock <= it.low ? ['danger', 'Reorder now', `Below the low level by ${fmt(it.low - it.stock)} ${it.loose}`] : it.stock > it.high ? ['violet', 'Overstock', `${fmt(it.stock - it.high)} ${it.loose} above the high level`] : ['good', 'Healthy', 'Between low and high levels'];
      const rq = Math.max(0, it.high - it.stock), rqC = Math.ceil(rq / it.ctn);
      const m = it.price ? ((it.price - it.cost) / it.price) * 100 : 0, wm = it.wprice ? ((it.wprice - it.cost) / it.wprice) * 100 : 0;
      const sch = D.schemes.find((s) => s.sku === it.sku);
      return `<div class="pr-ov">
        <div class="pr-sub-card pr-ov-loc"><div class="pr-sub-h"><b>Stock by location</b><small>${D.locations.length} locations · ${fmt(it.stock)} ${esc(it.loose)}</small></div>
          ${locs.map((x, i) => `<div class="pr-locrow" style="--i:${i}"><span class="pr-locic ${x.l.type === 'Shop' ? 'shop' : ''}"><i data-lucide="${x.l.type === 'Shop' ? 'store' : 'warehouse'}"></i></span><div class="pr-loct"><b>${esc(x.l.name)}</b><small>${x.l.code} · ${x.l.type}</small></div><div class="pr-locbar"><i style="--w:${(x.q / max) * 100}%"></i></div><div class="pr-locq"><b>${fmt(x.q)}</b><small>${it.stock ? Math.round((x.q / it.stock) * 100) : 0}%</small></div></div>`).join('')}
        </div>
        <div class="pr-sub-card"><div class="pr-sub-h"><b>Reorder settings</b><span class="badge ${st[0]} dot">${st[1]}</span></div>
          <div class="pr-meter"><div class="pr-meter-track"><span class="pr-meter-low" style="width:${lowP}%"></span><span class="pr-meter-ok" style="left:${lowP}%;width:${highP - lowP}%"></span><i class="pr-meter-pin ${st[0]}" style="left:${pos}%"><em>${fmt(it.stock)}</em></i></div><div class="pr-meter-lbl"><span style="left:${lowP}%">Low ${fmt(it.low)}</span><span style="left:${highP}%">High ${fmt(it.high)}</span></div></div>
          <p class="pr-muted-p">${st[2]}.</p>
          <dl class="pr-dl"><div><dt>Low level</dt><dd>${fmt(it.low)}</dd></div><div><dt>High level</dt><dd>${fmt(it.high)}</dd></div><div><dt>Suggested order</dt><dd>${rq ? `${fmt(rqC)} CTN <small>(${fmt(rqC * it.ctn)} ${esc(it.loose)})</small>` : '—'}</dd></div><div><dt>Lead time</dt><dd>${f.lead} days</dd></div><div><dt>Shelf</dt><dd><span class="pr-shelf">${esc(it.shelf || '—')}</span></dd></div><div><dt>Pack</dt><dd>${pack(it)}</dd></div></dl>
        </div>
        <div class="pr-sub-card"><div class="pr-sub-h"><b>Pricing</b><span class="pr-mchip sm ${m < 10 ? 'low' : 'ok'}"><b>${pct(m)} margin</b></span></div>
          <div class="pr-pgrid"><div><small>Purchase</small><b>${money(it.cost)}</b><em>CTN ${money(it.cost * it.ctn, { dec: 0 })}</em></div><div><small>W. price</small><b>${money(it.wprice)}</b><em>${pct(wm)} margin</em></div><div class="hi"><small>Retail</small><b>${money(it.price)}</b><em>CTN ${money(it.price * it.ctn, { dec: 0 })}</em></div></div>
          <table class="pr-mini"><thead><tr><th>Price tier</th><th class="num">Unit</th><th class="num">CTN</th></tr></thead><tbody>${Object.entries(D.priceTiers).map(([k, v]) => `<tr><td>${k}</td><td class="num">${fmt(it.price * v, 2)}</td><td class="num">${fmt(it.price * v * it.ctn, 0)}</td></tr>`).join('')}</tbody></table>
          ${sch ? `<div class="pr-scheme"><i data-lucide="gift"></i><span>Active scheme <b>${esc(sch.label)}</b> · buy ${sch.buy}, get ${sch.free} free</span></div>` : `<div class="pr-scheme none"><i data-lucide="percent"></i><span>GST ${it.gst || 18}% · Fin. discount ${fmt(it.fin || 0, 1)}%</span></div>`}
        </div>
      </div>`;
    }
    if (tab === 'card') {
      const L = ledger(it), rows = L.rows.filter((x) => PD.ledger === 'all' || (PD.ledger === 'in' ? x.inq : x.outq));
      const tin = L.rows.reduce((a, x) => a + x.inq, 0), tout = L.rows.reduce((a, x) => a + x.outq, 0);
      return `<div class="pr-pane-head"><div class="pr-ledsum"><div><small>Opening</small><b>${fmt(L.open)}</b></div><div class="in"><small>In</small><b>+${fmt(tin)}</b></div><div class="out"><small>Out</small><b>−${fmt(tout)}</b></div><div><small>Closing</small><b>${fmt(L.open + tin - tout)}</b></div></div><span class="spacer"></span><div class="seg pr-seg" data-pr-led><button type="button" data-v="all" class="${PD.ledger === 'all' ? 'active' : ''}">All</button><button type="button" data-v="in" class="${PD.ledger === 'in' ? 'active' : ''}">In</button><button type="button" data-v="out" class="${PD.ledger === 'out' ? 'active' : ''}">Out</button></div></div>
        <div class="pr-tw"><table class="tbl pr-led" data-plain><thead><tr><th>Date</th><th>Document</th><th>Type</th><th>Location</th><th class="num">In</th><th class="num">Out</th><th class="num">Balance</th></tr></thead><tbody>
        <tr class="pr-led-open"><td>${dshort(rows.length ? L.rows[0].date : TODAY)}</td><td colspan="5"><b>Opening balance</b></td><td class="num"><b>${fmt(L.open)}</b></td></tr>
        ${rows.map((x, i) => `<tr class="${x.inq ? 'pr-in' : 'pr-outr'}" style="--i:${i}"><td>${dshort(x.date)}</td><td class="pr-mono">${x.doc}</td><td><span class="badge ${x.tone}">${x.type}</span></td><td>${esc(x.loc)}</td><td class="num pr-up">${x.inq ? '+' + fmt(x.inq) : ''}</td><td class="num pr-down">${x.outq ? '−' + fmt(x.outq) : ''}</td><td class="num"><b>${fmt(x.bal)}</b></td></tr>`).join('')}
        </tbody></table></div>`;
    }
    if (tab === 'price') {
      const s = priceSeries(it), lo = Math.min(...s.pu) * 0.92, hi = Math.max(...s.sa) * 1.05, W = 720, H = 260, pl = 54, pr = 16, pt = 16, pb = 30;
      const x = (i) => pl + (i * (W - pl - pr)) / 11, y = (v) => pt + (1 - (v - lo) / (hi - lo)) * (H - pt - pb);
      const path = (a) => a.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
      const ticks = [0, 1, 2, 3, 4].map((k) => lo + ((hi - lo) * k) / 4);
      const chg = ((s.sa[11] - s.sa[0]) / s.sa[0]) * 100, pchg = ((s.pu[11] - s.pu[0]) / s.pu[0]) * 100;
      return `<div class="pr-pane-head"><div class="pr-legend"><span><i class="sale"></i>Sale price <b class="pr-up">${pct(chg)}</b></span><span><i class="pur"></i>Purchase price <b class="pr-down">${pct(pchg)}</b></span></div><span class="spacer"></span><span class="pill"><i data-lucide="calendar"></i>Nov 2025 – Oct 2026</span></div>
        <div class="pr-chart" data-pr-chart data-pu="${s.pu.join(',')}" data-sa="${s.sa.join(',')}">
          <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Purchase vs sale price over 12 months">
            <defs><linearGradient id="pr-grad" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--primary)" stop-opacity=".22"/><stop offset="1" stop-color="var(--primary)" stop-opacity="0"/></linearGradient></defs>
            ${ticks.map((t) => `<line class="pr-gl" x1="${pl}" x2="${W - pr}" y1="${y(t)}" y2="${y(t)}"/><text class="pr-ax" x="${pl - 8}" y="${y(t) + 4}" text-anchor="end">${fmt(t)}</text>`).join('')}
            ${MONTHS.map((m, i) => `<text class="pr-ax" x="${x(i)}" y="${H - 8}" text-anchor="middle">${m}</text>`).join('')}
            <path class="pr-area" d="${path(s.sa)} L${x(11)},${H - pb} L${x(0)},${H - pb} Z" fill="url(#pr-grad)"/>
            <path class="pr-ln sale" d="${path(s.sa)}" pathLength="1"/>
            <path class="pr-ln pur" d="${path(s.pu)}" pathLength="1"/>
            <line class="pr-guide" data-pr-guide x1="0" x2="0" y1="${pt}" y2="${H - pb}" opacity="0"/>
            ${s.sa.map((v, i) => `<circle class="pr-dot sale" cx="${x(i)}" cy="${y(v)}" r="3.5" data-i="${i}"/>`).join('')}
            ${s.pu.map((v, i) => `<circle class="pr-dot pur" cx="${x(i)}" cy="${y(v)}" r="3.5" data-i="${i}"/>`).join('')}
            <rect class="pr-hit" x="${pl}" y="0" width="${W - pl - pr}" height="${H}" data-pr-hit data-w="${W}" data-pl="${pl}" data-pr="${pr}"/>
          </svg>
        </div>
        <div class="pr-pricenotes"><div><small>Avg margin (12 mo)</small><b>${pct(s.sa.reduce((a, v, i) => a + (v - s.pu[i]) / v, 0) / 12 * 100)}</b></div><div><small>Last purchase change</small><b>${money(s.pu[11] - s.pu[10], { dec: 0 })}</b></div><div><small>Price changes</small><b>${3 + (it.sku.charCodeAt(4) % 4)}</b></div></div>`;
    }
    if (tab === 'suppliers') {
      return `<div class="pr-tw"><table class="tbl" data-plain><thead><tr><th>Supplier</th><th class="num">Last price</th><th class="num">vs current</th><th>Lead time</th><th>Last purchase</th><th>Share of buying</th><th></th></tr></thead><tbody>${suppliers(it).map((s, i) => `<tr style="--i:${i}"><td><div class="pr-sup"><span class="avatar sm">${esc(s.v.name.split(' ').map((w) => w[0]).slice(0, 2).join(''))}</span><div><b>${esc(s.v.name)}</b><small>${esc(s.v.code)} · ${esc(s.v.city || '')}</small></div></div></td><td class="num">${fmt(s.price, 2)}</td><td class="num ${s.price > it.cost ? 'pr-down' : 'pr-up'}">${s.price === it.cost ? '—' : (s.price > it.cost ? '+' : '−') + fmt(Math.abs(s.price - it.cost), 2)}</td><td>${s.lead} days</td><td>${dshort(s.last)}</td><td><div class="pr-share"><i style="width:${s.share}%"></i></div><small>${s.share}%</small></td><td>${s.pref ? '<span class="badge lime"><i data-lucide="star"></i>Preferred</span>' : ''}</td></tr>`).join('')}</tbody></table></div>`;
    }
    if (tab === 'batches') {
      if (!it.batches.length) return `<div class="pr-emptybox"><span><i data-lucide="calendar-x"></i></span><b>Not expiry-tracked</b><small>Turn on “Required Expiry” to capture batch and expiry on every purchase voucher.</small><button class="btn secondary sm" type="button" data-pr-pdact="trackexp"><i data-lucide="calendar-clock"></i>Enable expiry tracking</button></div>`;
      const bs = it.batches.slice().sort((a, b) => a.exp.localeCompare(b.exp));
      return `<div class="pr-pane-head"><div class="pr-fefo"><i data-lucide="arrow-down-wide-narrow"></i><span><b>FEFO</b> · first-expiry, first-out picking order</span></div><span class="spacer"></span><span class="pill"><i data-lucide="layers"></i>${bs.length} batches · ${fmt(bs.reduce((a, b) => a + b.qty, 0))} ${esc(it.loose)}</span></div>
        <div class="pr-tw"><table class="tbl" data-plain><thead><tr><th>#</th><th>Batch</th><th>Expiry</th><th>Days left</th><th class="num">Qty</th><th class="num">Cost</th><th class="num">Value</th><th>Status</th></tr></thead><tbody>${bs.map((b, i) => {
          const days = Math.round((new Date(b.exp + 'T00:00:00') - TODAY) / 864e5), t = days < 0 ? 'danger' : days <= 30 ? 'danger' : days <= 120 ? 'warn' : 'good';
          return `<tr style="--i:${i}" class="${i === 0 ? 'pr-next' : ''}"><td>${i === 0 ? '<span class="badge lime">Pick next</span>' : i + 1}</td><td class="pr-mono">${esc(b.no)}</td><td>${dshort(new Date(b.exp + 'T00:00:00'))}</td><td><div class="pr-days ${t}"><i style="width:${Math.max(4, Math.min(100, (days / 365) * 100))}%"></i></div><b class="pr-dl-${t}">${days < 0 ? 'Expired' : days + ' days'}</b></td><td class="num">${fmt(b.qty)}</td><td class="num">${fmt(b.cost, 2)}</td><td class="num">${fmt(b.qty * b.cost)}</td><td><span class="badge ${t} dot">${days <= 30 ? 'Expiring soon' : days <= 120 ? 'Watch' : 'Fresh'}</span></td></tr>`;
        }).join('')}</tbody></table></div>`;
    }
    if (tab === 'barcodes') {
      const cards = [['Piece', it.barcodes[0] || it.upc, 'EAN-13 · 1 ' + it.loose], ['Carton', it.barcodes[1] || ean('1' + it.upc.slice(1, 12)), 'Outer · 1 CTN = ' + it.ctn + ' ' + it.loose]];
      return `<div class="pr-bcgrid">${cards.map(([k, code, s], i) => `<div class="pr-sub-card pr-bccard" style="--i:${i}"><div class="pr-sub-h"><b>${k} barcode</b><small>${esc(s)}</small></div><div class="pr-bcbig">${bars(code)}<span class="pr-bcdig">${esc(code)}</span></div><div class="pr-bcfoot"><button class="btn ghost sm" type="button" data-pr-copy="${esc(code)}"><i data-lucide="copy"></i>Copy</button><button class="btn ghost sm" type="button" data-pr-pdact="label"><i data-lucide="printer"></i>Print</button></div></div>`).join('')}
        <div class="pr-sub-card"><div class="pr-sub-h"><b>Shelf label preview</b><small>Thermal 2×1"</small></div><div class="pr-lbstage-sm">${labelHTML(it, { price: true, company: true, urdu: true, batch: false, ctn: false }, 'thermal')}</div><div class="pr-bcfoot"><span class="pr-muted-p">Printed 3 times this month</span><span class="spacer"></span><button class="btn secondary sm" type="button" data-pr-pdact="label"><i data-lucide="scan-barcode"></i>Open label designer</button></div></div></div>`;
    }
    if (tab === 'orders') {
      const os = orders(it).filter((o) => PD.orders === 'all' || o.t === PD.orders);
      return `<div class="pr-pane-head"><div class="seg pr-seg" data-pr-ord><button type="button" data-v="all" class="${PD.orders === 'all' ? 'active' : ''}">All</button><button type="button" data-v="SO" class="${PD.orders === 'SO' ? 'active' : ''}">Sales orders</button><button type="button" data-v="PO" class="${PD.orders === 'PO' ? 'active' : ''}">Purchase orders</button></div><span class="spacer"></span><a class="btn ghost sm" href="#/app/sales/orders"><i data-lucide="external-link"></i>All sales orders</a></div>
        <div class="pr-tw"><table class="tbl" data-plain><thead><tr><th>Type</th><th>Order</th><th>Party</th><th>Date</th><th>Due</th><th class="num">Qty</th><th>Progress</th><th>Status</th></tr></thead><tbody>${os.map((o, i) => `<tr style="--i:${i}"><td><span class="pr-otype ${o.t === 'SO' ? 'so' : 'po'}">${o.t}</span></td><td class="pr-mono"><a class="pr-link" href="#/app/${o.t === 'SO' ? 'sales' : 'purchases'}/orders">${o.no}</a></td><td>${esc(o.party)}</td><td>${dshort(o.date)}</td><td>${dshort(o.due)}</td><td class="num">${fmt(o.q)} <small>${esc(it.loose)}</small></td><td><div class="pr-share"><i style="width:${Math.round((o.done / o.q) * 100)}%"></i></div><small>${fmt(o.done)} / ${fmt(o.q)}</small></td><td><span class="badge ${o.st === 'Awaiting stock' ? 'warn' : o.st.startsWith('Part') ? 'info' : 'good'}">${o.st}</span></td></tr>`).join('')}</tbody></table></div>`;
    }
    const acts = (P.moves[it.sku] || []).slice().reverse().map((m) => ({ ic: 'sliders-horizontal', t: 'warn', who: 'Sana Javed', what: `Adjusted stock ${m.inq ? '+' + fmt(m.inq) : '−' + fmt(m.outq)} (${esc(m.reason || 'Adjustment')})`, when: 'Just now' })).concat([
      { ic: 'tag', t: 'info', who: 'Hira Ali', what: `Changed retail price to ${money(it.price)}`, when: 'Yesterday, 4:12 PM' },
      { ic: 'package-check', t: 'good', who: 'Kashif Ali', what: `Received GRN-2026-0874 · ${fmt(it.ctn * 12)} ${esc(it.loose)} at Lahore HQ Warehouse`, when: '27 Sep 2026' },
      { ic: 'clipboard-check', t: 'violet', who: 'Faisal Qureshi', what: 'Cycle count matched the system (0 variance)', when: '20 Sep 2026' },
      { ic: 'printer', t: 'blue', who: 'Bilal Khan', what: 'Printed 24 shelf labels', when: '12 Sep 2026' },
      { ic: 'circle-plus', t: 'good', who: 'Usman Ali', what: `Created product in ${esc(cls(it.cls).name)}`, when: '03 Jan 2025' },
    ]);
    return `<ol class="pr-tl">${acts.map((a, i) => `<li style="--i:${i}"><span class="pr-tl-ic ${a.t}"><i data-lucide="${a.ic}"></i></span><div><b>${a.what}</b><small>${esc(a.who)} · ${a.when}</small></div></li>`).join('')}</ol>`;
  }
  function renderPD(anim) {
    const sec = PD.sec; if (!sec) return;
    let it = item(P.cur); if (!it) { P.cur = (item('FD-5001') || P.items[0]).sku; it = item(P.cur); }
    const sel = $('[data-pr-pdsel]', sec);
    sel.innerHTML = P.items.map((i) => `<option value="${i.sku}">${esc(i.sku)} · ${esc(i.name)}</option>`).join(''); sel.value = it.sku;
    const body = $('[data-pr-pdbody]', sec);
    const paint = () => { body.innerHTML = pdHTML(it); icons(body); FS.positionInk($('.pr-tabs', body)); wirePane(it); body.classList.remove('pr-swap-out'); if (anim) { body.classList.remove('pr-swap-in'); void body.offsetWidth; body.classList.add('pr-swap-in'); } };
    if (anim && !reduce() && body.children.length) { body.classList.add('pr-swap-out'); setTimeout(paint, 180); } else paint();
  }
  function setPane(it, tab) {
    PD.tab = tab; const body = $('[data-pr-pdbody]', PD.sec), pane = $('[data-pr-pdpane]', body);
    $$('[data-pr-pdtab]', body).forEach((b) => { b.classList.toggle('active', b.dataset.prPdtab === tab); b.setAttribute('aria-selected', String(b.dataset.prPdtab === tab)); });
    FS.positionInk($('.pr-tabs', body));
    pane.innerHTML = paneHTML(it, tab); pane.classList.remove('pr-pane-in'); void pane.offsetWidth; pane.classList.add('pr-pane-in'); icons(pane); wirePane(it);
  }
  function wirePane(it) {
    const ch = $('[data-pr-chart]', PD.sec); if (!ch) return;
    const svg = $('svg', ch), hit = $('[data-pr-hit]', ch), guide = $('[data-pr-guide]', ch), pu = ch.dataset.pu.split(',').map(Number), sa = ch.dataset.sa.split(',').map(Number);
    const W = +hit.dataset.w, pl = +hit.dataset.pl, prr = +hit.dataset.pr;
    hit.addEventListener('mousemove', (e) => {
      const r = svg.getBoundingClientRect(), vx = ((e.clientX - r.left) / r.width) * W;
      const i = Math.max(0, Math.min(11, Math.round(((vx - pl) / (W - pl - prr)) * 11))), gx = pl + (i * (W - pl - prr)) / 11;
      guide.setAttribute('x1', gx); guide.setAttribute('x2', gx); guide.setAttribute('opacity', '1');
      $$('.pr-dot', ch).forEach((d) => d.classList.toggle('on', +d.dataset.i === i));
      const dot = $(`.pr-dot.sale[data-i="${i}"]`, ch).getBoundingClientRect(), m = ((sa[i] - pu[i]) / sa[i]) * 100;
      FS.tip(`<small><i></i>${MONTHS[i]} ${i < 2 ? 2025 : 2026}</small><b>Sale ${fmt(sa[i])} · Buy ${fmt(pu[i])}</b><small>Margin ${pct(m)}</small>`, dot.left + dot.width / 2, dot.top - 4);
    });
    hit.addEventListener('mouseleave', () => { guide.setAttribute('opacity', '0'); $$('.pr-dot', ch).forEach((d) => d.classList.remove('on')); FS.untip && FS.untip(); });
  }
  function adjustSheet(it) {
    const sh = FS.sheet({ title: 'Adjust stock', subtitle: `${it.sku} · ${esc(it.name)} · on hand ${ctnSplit(it)}`,
      html: `<div class="pr-adj"><div class="seg pr-seg" data-pr-adjdir><button type="button" class="active" data-v="1"><i data-lucide="plus"></i>Stock in</button><button type="button" data-v="-1"><i data-lucide="minus"></i>Stock out</button></div>
        <div class="pr-fg c2"><label class="pr-ff"><span>Cartons</span><input type="number" min="0" value="1" data-pr-adjc></label><label class="pr-ff"><span>Loose (${esc(it.loose)})</span><input type="number" min="0" value="0" data-pr-adjl></label></div>
        <div class="pr-fg c2"><label class="pr-ff"><span>Reason</span><select data-pr-adjr><option>Physical count</option><option>Damaged / breakage</option><option>Found stock</option><option>Free sample</option><option>Opening correction</option></select></label><label class="pr-ff"><span>Location</span><select data-pr-adjloc>${D.locations.map((l) => `<option>${esc(l.name)}</option>`).join('')}</select></label></div>
        <div class="pr-adj-prev"><div><small>Current</small><b>${fmt(it.stock)}</b></div><i data-lucide="arrow-right"></i><div><small>After</small><b data-pr-adjafter>${fmt(it.stock + it.ctn)}</b></div><div class="pr-adj-d" data-pr-adjd>+${fmt(it.ctn)} ${esc(it.loose)}</div></div></div>`,
      foot: `<button class="btn secondary" type="button" data-close>Cancel</button><button class="btn primary" type="button" data-pr-adjgo><i data-lucide="check"></i><span>Post adjustment</span></button>` });
    let dir = 1;
    const qty = () => (num($('[data-pr-adjc]', sh).value) || 0) * it.ctn + (num($('[data-pr-adjl]', sh).value) || 0);
    const upd = () => { const q = qty(), after = it.stock + dir * q, el = $('[data-pr-adjafter]', sh); FS.tick(el, Math.max(0, after), { dec: 0 }); $('[data-pr-adjd]', sh).textContent = (dir > 0 ? '+' : '−') + fmt(q) + ' ' + it.loose; $('[data-pr-adjd]', sh).classList.toggle('neg', dir < 0); $('[data-pr-adjgo]', sh).disabled = !q || after < 0; };
    sh.addEventListener('input', upd);
    sh.addEventListener('click', async (e) => {
      const d = e.target.closest('[data-pr-adjdir] button'); if (d) { dir = +d.dataset.v; $$('[data-pr-adjdir] button', sh).forEach((b) => b.classList.toggle('active', b === d)); upd(); return; }
      const go = e.target.closest('[data-pr-adjgo]');
      if (go) {
        const q = qty(); await busy(go, 'Posting…', 800);
        it.stock += dir * q;
        (P.moves[it.sku] = P.moves[it.sku] || []).push({ date: TODAY, type: 'Stock Adjustment', doc: 'ADJ-2026-' + String(900 + Math.floor(Math.random() * 99)).padStart(4, '0'), tone: 'danger', loc: $('[data-pr-adjloc]', sh).value, inq: dir > 0 ? q : 0, outq: dir < 0 ? q : 0, bal: it.stock, reason: $('[data-pr-adjr]', sh).value });
        FS.closeOverlay(sh.closest('.overlay')); renderPD(false); FS.celebrate($('[data-pr-k="onhand"]', PD.sec));
        FS.toast(`Stock ${dir > 0 ? 'increased' : 'reduced'} by ${fmt(q)} ${it.loose} · ${it.sku}`, { tone: 'good', action: { label: 'Stock card', fn: () => setPane(it, 'card') } });
      }
    });
  }
  function mountPD(sec) {
    PD.sec = sec;
    $('[data-pr-pdsel]', sec).addEventListener('change', (e) => { P.cur = e.target.value; renderPD(true); });
    sec.addEventListener('click', async (e) => {
      const t = e.target;
      const nv = t.closest('[data-pr-pdnav]'); if (nv) { const k = P.items.findIndex((i) => i.sku === P.cur), n = P.items[(k + +nv.dataset.prPdnav + P.items.length) % P.items.length]; P.cur = n.sku; renderPD(true); return; }
      const it = item(P.cur); if (!it) return;
      const tb = t.closest('[data-pr-pdtab]'); if (tb) return setPane(it, tb.dataset.prPdtab);
      const led = t.closest('[data-pr-led] button'); if (led) { PD.ledger = led.dataset.v; return setPane(it, 'card'); }
      const od = t.closest('[data-pr-ord] button'); if (od) { PD.orders = od.dataset.v; return setPane(it, 'orders'); }
      const cp = t.closest('[data-pr-copy]'); if (cp) { try { await navigator.clipboard.writeText(cp.dataset.prCopy); } catch (x) { /* clipboard may be blocked */ } FS.toast('Barcode copied · ' + cp.dataset.prCopy, { tone: 'info', ms: 1800 }); return; }
      const a = t.closest('[data-pr-pdact]'); if (!a) return;
      const act = a.dataset.prPdact;
      if (act === 'edit') { FS.go('app/inventory/items'); setTimeout(() => openForm('edit', it.sku), 380); }
      else if (act === 'label') { P.labelPick = [it.sku]; FS.go('app/inventory/labels'); }
      else if (act === 'adjust') adjustSheet(it);
      else if (act === 'po') {
        await busy(a, 'Drafting…', 800);
        const q = Math.max(it.ctn, Math.ceil(Math.max(it.high - it.stock, it.ctn) / it.ctn) * it.ctn);
        FS.celebrate(a); FS.toast(`Draft PO-2026-0418 · ${fmt(q / it.ctn)} CTN of ${it.sku} for ${suppliers(it)[0].v.name}`, { tone: 'good', action: { label: 'Open', fn: () => FS.go('app/purchases/orders') } });
      } else if (act === 'trackexp') { it.attrs.push('expiry'); it.batches = mkBatches(it); renderPD(false); setPane(it, 'batches'); FS.toast('Expiry tracking enabled for ' + it.sku, { tone: 'good' }); }
    });
  }
  FS.onEnter('app/inventory/products/view', (sec, r, first) => { if (first) mountPD(sec); renderPD(!first); });

  /* ====================================================================== */
  /* 3 · COMPANIES & BRANDS                                                  */
  /* ====================================================================== */
  const CO = { q: '', city: '', prod: '', sort: 'name', status: '', page: 1, per: 9, panel: null, flash: null, pin: null, color: '#1F5F45', sec: null, stat: 'Active' };
  const SWATCH = ['#1F5F45', '#2F6FD0', '#D64545', '#B7791F', '#7C3AED', '#DB2777'];
  const coCount = (code) => P.items.filter((i) => i.company === code).length;
  function coRows() {
    const q = CO.q.trim().toLowerCase();
    let rows = P.companies.filter((c) => (!q || (c.code + ' ' + c.name + ' ' + c.city).toLowerCase().includes(q)) && (!CO.city || c.city === CO.city) && (!CO.status || c.status === CO.status) && (!CO.prod || (CO.prod === 'with' ? coCount(c.code) : !coCount(c.code))));
    const S = { name: (a, b) => a.name.localeCompare(b.name), code: (a, b) => a.code.localeCompare(b.code), products: (a, b) => coCount(b.code) - coCount(a.code), updated: (a, b) => P.companies.indexOf(b) - P.companies.indexOf(a) };
    rows.sort(S[CO.sort]);
    if (CO.pin) { const k = rows.findIndex((c) => c.code === CO.pin); if (k > 0) rows.unshift(rows.splice(k, 1)[0]); }
    return rows;
  }
  const logo = (c, cls = '') => `<span class="pr-logo ${cls}" style="--co:${c.color}"><b>${esc(c.short || c.name.slice(0, 3))}</b></span>`;
  function renderCOKpis() {
    const sec = CO.sec, act = P.companies.filter((c) => c.status === 'Active').length, top = P.companies.slice().sort((a, b) => coCount(b.code) - coCount(a.code))[0];
    const k = $('[data-pr-cokpis]', sec);
    if (!k.children.length) k.innerHTML = [['building-2', '', 'Total Companies', 'tot', 'Across all products'], ['circle-check', '', 'Active Companies', 'act', 'Currently in use'], ['circle-pause', 'n', 'Inactive Companies', 'ina', 'Not in use'], ['tag', '', 'Most Used Company', 'top', '']].map(([ic, c, l, key, s], i) => `<div class="pr-co-kpi" style="--i:${i}"><span class="${c}"><i data-lucide="${ic}"></i></span><div><small>${l}</small><b data-pr-cok="${key}">0</b><em data-pr-coke="${key}">${s}</em></div></div>`).join('');
    FS.tick($('[data-pr-cok="tot"]', k), P.companies.length, { dec: 0 }); FS.tick($('[data-pr-cok="act"]', k), act, { dec: 0 }); FS.tick($('[data-pr-cok="ina"]', k), P.companies.length - act, { dec: 0 });
    $('[data-pr-cok="top"]', k).textContent = top.code; $('[data-pr-coke="top"]', k).textContent = `${top.name} · ${coCount(top.code)} products`;
  }
  function renderCO() {
    const sec = CO.sec; if (!sec) return;
    const rows = coRows(), pages = Math.max(1, Math.ceil(rows.length / CO.per)); if (CO.page > pages) CO.page = pages;
    const st = (CO.page - 1) * CO.per, pr = rows.slice(st, st + CO.per);
    $('[data-pr-cogrid]', sec).innerHTML = pr.map((c, i) => `<article class="pr-co-card ${CO.flash === c.code ? 'pr-flash' : ''} ${c.status === 'Inactive' ? 'off' : ''}" data-co="${c.code}" style="--i:${i};--co:${c.color}" tabindex="0" role="button" aria-label="${esc(c.name)} details">
        <div class="pr-co-top">${logo(c)}<div class="pr-co-tt"><b>${esc(c.code)}</b><span>${esc(c.name)}</span></div><span class="pr-cobadge ${c.status === 'Active' ? 'on' : 'off'}">${c.status}</span></div>
        <div class="pr-co-meta"><span><i data-lucide="package"></i>${coCount(c.code)} Products</span><span><i data-lucide="map-pin"></i>${esc(c.city || '—')}, ${esc(c.country || 'Pakistan')}</span><span><i data-lucide="clock"></i>Updated: ${esc(c.updated || 'Just now')}</span></div>
      </article>`).join('') || `<div class="pr-emptybox"><span><i data-lucide="building"></i></span><b>No companies match</b><small>Try another search or status.</small></div>`;
    $('[data-pr-coshowing]', sec).textContent = rows.length ? `Showing ${st + 1}–${st + pr.length} of ${rows.length} companies` : 'No companies';
    $('[data-pr-copager]', sec).innerHTML = pagerHTML(CO.page, pages);
    const cities = [...new Set(P.companies.map((c) => c.city).filter(Boolean))].sort(), cs = $('[data-pr-cocity]', sec), v = cs.value;
    cs.innerHTML = '<option value="">All Cities</option>' + cities.map((c) => `<option>${esc(c)}</option>`).join(''); cs.value = v;
    renderCOKpis(); icons(sec);
    if (CO.flash) setTimeout(() => { CO.flash = null; }, 50);
  }
  function setPanel(open, focus) {
    const sec = CO.sec; CO.panel = open;
    $('[data-pr-colayout]', sec).classList.toggle('with-panel', open);
    if (open && focus) setTimeout(() => $('[data-pr-coform] [name="name"]', sec).focus(), 260);
  }
  function nextCoCode() { let n = 1; P.companies.forEach((c) => { const m = /^CO-(\d+)$/.exec(c.code); if (m) n = Math.max(n, +m[1] + 1); }); return 'CO-' + String(n).padStart(2, '0'); }
  function coPreview() {
    const sec = CO.sec, f = $('[data-pr-coform]', sec), name = f.name.value.trim() || 'New Company', code = f.code.value.trim().toUpperCase() || nextCoCode();
    const short = name.split(/\s+/).filter((w) => !/^(pvt|ltd|\(pvt\)|pakistan|and|&)$/i.test(w)).map((w) => w[0]).join('').slice(0, 3).toUpperCase() || 'NC';
    CO.short = name.length <= 5 ? name : short;
    $('[data-pr-coprev]', sec).innerHTML = `<small>Card preview</small><div class="pr-co-card mini" style="--co:${CO.color}"><div class="pr-co-top">${logo({ short: CO.short, name, color: CO.color })}<div class="pr-co-tt"><b>${esc(code)}</b><span>${esc(name)}</span></div><span class="pr-cobadge ${CO.stat === 'Active' ? 'on' : 'off'}">${CO.stat}</span></div></div>`;
  }
  function coErr(name, msg) { const el = $(`[data-pr-coform] [name="${name}"]`, CO.sec), l = el.closest('.pr-ff'); l.classList.toggle('err', !!msg); const s = $('.pr-err', l); if (s) s.textContent = msg || ''; }
  async function saveCO(btn) {
    const f = $('[data-pr-coform]', CO.sec), v = (n) => f[n].value.trim(), errs = {};
    const code = v('code').toUpperCase();
    if (!code) errs.code = 'Company code is required'; else if (!/^[A-Z]{2,3}-?\d{2,3}$/.test(code)) errs.code = 'Use a code like CO-13 or SU07'; else if (P.companies.some((c) => c.code === code)) errs.code = code + ' is already used';
    if (!v('name')) errs.name = 'Company name is required'; else if (P.companies.some((c) => c.name.toLowerCase() === v('name').toLowerCase())) errs.name = 'A company with this name exists';
    if (v('phone') && !/^[0-9+\-\s()]{7,16}$/.test(v('phone'))) errs.phone = 'Enter a valid phone number';
    if (v('email') && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v('email'))) errs.email = 'Enter a valid email address';
    if (v('web') && !/^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/.*)?$/i.test(v('web'))) errs.web = 'Enter a valid website';
    ['code', 'name', 'phone', 'email', 'web'].forEach((k) => coErr(k, errs[k]));
    if (Object.keys(errs).length) { shake($('[data-pr-copanel]', CO.sec)); f[Object.keys(errs)[0]].focus(); return; }
    await busy(btn, 'Saving…', 800);
    const c = { code, name: v('name'), short: CO.short, city: v('city') || (v('address').split(',').pop() || '').trim() || 'Lahore', status: CO.stat, color: CO.color, updated: 'Just now', country: v('country'), phone: v('phone'), email: v('email'), web: v('web'), address: v('address'), notes: v('notes') };
    P.companies.unshift(c); CO.flash = code; CO.pin = code; CO.page = 1; CO.q = ''; $('[data-pr-coq]', CO.sec).value = '';
    resetCOForm(); renderCO();
    const card = $(`[data-co="${code}"]`, CO.sec); FS.celebrate(card); card && card.scrollIntoView({ block: 'nearest', behavior: reduce() ? 'auto' : 'smooth' });
    FS.toast(`${code} · ${c.name} created`, { tone: 'good', action: { label: 'Add products', fn: () => { FS.go('app/inventory/items'); setTimeout(() => { openForm('new'); const s = fEl('company'); if (s) { s.value = code; formLive(); } }, 380); } } });
  }
  function resetCOForm() {
    const f = $('[data-pr-coform]', CO.sec); f.reset(); $$('.pr-ff.err', f).forEach((l) => l.classList.remove('err'));
    CO.stat = 'Active'; $$('[data-pr-costat] button', f).forEach((b) => b.classList.toggle('on', b.dataset.v === 'Active'));
    CO.color = SWATCH[P.companies.length % SWATCH.length]; renderSwatches(); coPreview();
  }
  function renderSwatches() { $('[data-pr-coswatch]', CO.sec).innerHTML = SWATCH.map((c) => `<button type="button" style="--co:${c}" class="${c === CO.color ? 'on' : ''}" data-c="${c}" aria-label="Colour ${c}"></button>`).join(''); }
  function coDrawer(c) {
    const its = P.items.filter((i) => i.company === c.code), r = rng(c.code + 'cl'), val = its.reduce((a, i) => a + i.stock * i.cost, 0);
    const sch = D.schemes.filter((s) => its.some((i) => i.sku === s.sku)), claim = Math.round(val * (0.01 + r() * 0.02)), tgt = Math.round((val * 1.6) / 1000) * 1000 || 500000, ach = Math.round(tgt * (0.45 + r() * 0.5));
    const dr = FS.drawer({ title: `<span class="pr-drw-t">${logo(c, 'sm')}${esc(c.name)}</span>`, subtitle: `${c.code} · ${esc(c.city)}, ${esc(c.country || 'Pakistan')} · ${c.status}`, wide: true,
      html: `<div class="pr-drw">
        <div class="pr-drw-stats"><div><small>Products</small><b>${its.length}</b></div><div><small>Stock value</small><b>${money(val, { dec: 0 })}</b></div><div><small>Low stock</small><b class="${its.filter((i) => i.stock <= i.low).length ? 'pr-down' : ''}">${its.filter((i) => i.stock <= i.low).length}</b></div></div>
        <div class="pr-sub-card"><div class="pr-sub-h"><b>Principal claims &amp; schemes</b><span class="badge info">FY 2026-27</span></div>
          <div class="pr-claims"><div><small>Claims pending</small><b>${money(claim, { dec: 0 })}</b><em>${2 + Math.floor(r() * 4)} claims · oldest 18 days</em></div><div><small>Claims settled (YTD)</small><b>${money(claim * 3.4, { dec: 0 })}</b><em>Via credit notes</em></div></div>
          <div class="pr-target"><div class="pr-target-h"><span>Quarterly target</span><b>${Math.round((ach / tgt) * 100)}%</b></div><div class="pr-share big"><i style="width:${Math.round((ach / tgt) * 100)}%"></i></div><small>${money(ach, { dec: 0 })} of ${money(tgt, { dec: 0 })} purchased</small></div>
          ${sch.length ? sch.map((s) => `<div class="pr-scheme"><i data-lucide="gift"></i><span><b>${esc(s.label)}</b> on ${esc(item(s.sku).name)} · buy ${s.buy} get ${s.free}</span></div>`).join('') : '<div class="pr-scheme none"><i data-lucide="gift"></i><span>No active trade schemes for this principal</span></div>'}
        </div>
        <div class="pr-sub-card flush"><div class="pr-sub-h"><b>Products</b><small>${its.length} items</small></div>
          ${its.length ? `<table class="tbl pr-drw-tbl" data-plain><thead><tr><th>Code</th><th>Product</th><th class="num">Retail</th><th class="pr-stc">Stock</th></tr></thead><tbody>${its.map((i) => `<tr data-pr-drwsku="${i.sku}"><td class="pr-code">${i.sku}</td><td>${esc(i.name)}<small>${pack(i)}</small></td><td class="num">${fmt(i.price, 2)}</td><td class="pr-stc">${stockPill(i)}</td></tr>`).join('')}</tbody></table>` : '<div class="pr-emptybox"><span><i data-lucide="package-open"></i></span><b>No products yet</b><small>Add the first product for this company.</small></div>'}
        </div></div>`,
      foot: `<button class="btn secondary" type="button" data-pr-drwact="toggle"><i data-lucide="${c.status === 'Active' ? 'power-off' : 'power'}"></i>${c.status === 'Active' ? 'Deactivate' : 'Activate'}</button><button class="btn primary" type="button" data-pr-drwact="cat"><i data-lucide="package-search"></i>Open in catalogue</button>` });
    dr.addEventListener('click', (e) => {
      const row = e.target.closest('[data-pr-drwsku]'); if (row) { FS.closeOverlays(); openDetail(row.dataset.prDrwsku); return; }
      const a = e.target.closest('[data-pr-drwact]'); if (!a) return;
      if (a.dataset.prDrwact === 'cat') { FS.closeOverlays(); clearFiltersSoft(); C.f.company = c.code; FS.go('app/inventory/items'); setTimeout(() => { const s = C.sec && $('[data-pr-f="company"]', C.sec); if (s) { s.value = c.code; renderCat(); } }, 60); }
      else { c.status = c.status === 'Active' ? 'Inactive' : 'Active'; c.updated = 'Just now'; FS.closeOverlays(); CO.flash = c.code; renderCO(); FS.toast(`${c.name} is now ${c.status.toLowerCase()}`, { tone: c.status === 'Active' ? 'good' : 'info' }); }
    });
  }
  function clearFiltersSoft() { Object.assign(C.f, { scope: '', company: '', cls: '', min: '', max: '', shelf: '', attr: '', q: '' }); C.tab = 'all'; C.page = 1; if (C.sec) $$('[data-pr-f]', C.sec).forEach((el) => { const k = el.dataset.prF; if (k !== 'view' && k !== 'sort') el.value = ''; }); }
  function mountCO(sec) {
    CO.sec = sec; resetCOForm();
    sec.addEventListener('input', (e) => {
      if (e.target.matches('[data-pr-coq]')) { CO.q = e.target.value; CO.page = 1; CO.pin = null; renderCO(); }
      if (e.target.closest('[data-pr-coform]')) { const l = e.target.closest('.pr-ff.err'); if (l) l.classList.remove('err'); coPreview(); }
    });
    sec.addEventListener('change', (e) => {
      if (e.target.matches('[data-pr-cocity]')) CO.city = e.target.value; else if (e.target.matches('[data-pr-coprod]')) CO.prod = e.target.value; else if (e.target.matches('[data-pr-cosort]')) CO.sort = e.target.value; else return;
      CO.page = 1; CO.pin = null; renderCO();
    });
    sec.addEventListener('click', (e) => {
      const t = e.target;
      const sg = t.closest('[data-pr-costatus] button'); if (sg) { CO.status = sg.dataset.v; $$('[data-pr-costatus] button', sec).forEach((b) => b.classList.toggle('active', b === sg)); CO.page = 1; renderCO(); return; }
      if (t.closest('[data-pr-conew]')) { setPanel(true, true); shake($('[data-pr-copanel]', sec)); return; }
      if (t.closest('[data-pr-coclose]')) { setPanel(false); return; }
      if (t.closest('[data-pr-coimport]')) { const g = $('[data-pr-cogrid]', sec); FS.skeleton(g, 700).then(() => FS.toast('Companies imported · 0 new, 12 matched existing records', { tone: 'info' })); return; }
      if (t.closest('[data-pr-cogen]')) { const f = $('[data-pr-coform]', sec); f.code.value = nextCoCode(); coErr('code', ''); coPreview(); return; }
      if (t.closest('[data-pr-cosave]')) { saveCO(t.closest('[data-pr-cosave]')); return; }
      const rs = t.closest('[data-pr-costat] button'); if (rs) { CO.stat = rs.dataset.v; $$('[data-pr-costat] button', sec).forEach((b) => b.classList.toggle('on', b === rs)); coPreview(); return; }
      const sw = t.closest('[data-pr-coswatch] button'); if (sw) { CO.color = sw.dataset.c; renderSwatches(); coPreview(); return; }
      const pg = t.closest('[data-pr-copager] [data-pg]'); if (pg) { CO.page = +pg.dataset.pg; renderCO(); return; }
      const card = t.closest('[data-co]'); if (card && !card.classList.contains('mini')) coDrawer(P.companies.find((c) => c.code === card.dataset.co));
    });
    sec.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('[data-co]')) coDrawer(P.companies.find((c) => c.code === e.target.dataset.co)); });
    setPanel(innerWidth >= 1280);
  }
  FS.onEnter('app/inventory/companies', (sec, r, first) => { if (first) mountCO(sec); renderCO(); });

  /* ====================================================================== */
  /* 4 · PRODUCT CLASSES                                                     */
  /* ====================================================================== */
  const CL = { q: '', main: '', vis: '', open: new Set(['MC-001', 'MC-002']), sec: null, flash: null, modal: null, drag: null, editing: null };
  const CL_ICONS = ['package', 'paperclip', 'hard-hat', 'lightbulb', 'shopping-basket', 'spray-can', 'cup-soda', 'cookie', 'shirt', 'pill', 'baby', 'wrench', 'sofa', 'smartphone'];
  const clCount = (id) => P.items.filter((i) => i.cls === id).length;
  const subCount = (id) => P.items.filter((i) => i.sub === id).length;
  const nextMain = () => 'MC-' + String(P.classes.reduce((n, c) => Math.max(n, +c.id.slice(3)), 0) + 1).padStart(3, '0');
  const nextSub = () => 'ST-' + String(P.classes.reduce((n, c) => c.subs.reduce((m, s) => Math.max(m, +s.id.slice(3)), n), 0) + 1).padStart(3, '0');
  function clRows() {
    const q = CL.q.trim().toLowerCase();
    return P.classes.map((c) => {
      const subs = c.subs.filter((s) => (CL.vis === '' || String(+s.visible) === CL.vis || String(+c.visible) === CL.vis) && (!q || (s.id + ' ' + s.name).toLowerCase().includes(q) || (c.id + ' ' + c.name).toLowerCase().includes(q)));
      const hitMain = !q || (c.id + ' ' + c.name).toLowerCase().includes(q);
      return { c, subs, show: (!CL.main || c.id === CL.main) && (hitMain || subs.length) && (CL.vis === '' || String(+c.visible) === CL.vis || c.subs.some((s) => String(+s.visible) === CL.vis)) };
    }).filter((r) => r.show);
  }
  const hl = (s) => { const q = CL.q.trim(); if (!q) return esc(s); const i = s.toLowerCase().indexOf(q.toLowerCase()); return i < 0 ? esc(s) : esc(s.slice(0, i)) + '<mark>' + esc(s.slice(i, i + q.length)) + '</mark>' + esc(s.slice(i + q.length)); };
  function subRowHTML(c, s, i) {
    const ed = CL.editing === s.id;
    return `<tr draggable="${ed ? 'false' : 'true'}" data-sub="${s.id}" class="${CL.flash === s.id ? 'pr-flash' : ''} ${s.visible ? '' : 'off'}" style="--i:${i}">
      <td class="pr-grip" title="Drag to reorder"><i data-lucide="grip-vertical"></i></td><td class="pr-mono">${hl(s.id)}</td>
      <td>${ed ? `<input class="pr-cellin wide" value="${esc(s.name)}" data-pr-subedit aria-label="Sub type name">` : `<b>${hl(s.name)}</b>`}</td>
      <td class="pr-mono">${c.id}</td><td><span class="pr-count">${subCount(s.id)}</span></td>
      <td><label class="switch"><input type="checkbox" data-pr-subvis ${s.visible ? 'checked' : ''}><i></i><span>${s.visible ? 'Visible' : 'Hidden'}</span></label></td>
      <td class="pr-clact">${ed ? '<button type="button" data-pr-subsave aria-label="Save"><i data-lucide="check"></i></button><button type="button" data-pr-subcancel aria-label="Cancel"><i data-lucide="x"></i></button>' : '<button type="button" data-pr-subed aria-label="Edit sub type"><i data-lucide="pencil"></i></button><button type="button" data-pr-subdel aria-label="Delete sub type"><i data-lucide="trash-2"></i></button>'}</td></tr>`;
  }
  function cardHTML(r, i) {
    const c = r.c, open = CL.open.has(c.id) || (CL.q && r.subs.length);
    return `<article class="pr-cl-card ${open ? 'open' : ''} ${c.visible ? '' : 'off'} ${CL.flash === c.id ? 'pr-flash' : ''}" data-cl="${c.id}" style="--i:${i}">
      <div class="pr-cl-main" data-pr-cltog role="button" tabindex="0" aria-expanded="${!!open}">
        <span class="pr-cl-ic"><i data-lucide="${c.icon || 'tag'}"></i></span>
        <div class="pr-cl-meta"><small>Main ID</small><b>${hl(c.id)}</b></div>
        <div class="pr-cl-meta grow"><small>Main Class Name</small><b>${hl(c.name)}</b></div>
        <div class="pr-cl-meta"><small>Sub Types</small><b class="light">${c.subs.length} sub type${c.subs.length === 1 ? '' : 's'}</b></div>
        <div class="pr-cl-meta"><small>Products</small><b class="light">${clCount(c.id)} product${clCount(c.id) === 1 ? '' : 's'}</b></div>
        <div class="pr-cl-right"><label class="switch" data-pr-clvisw><input type="checkbox" data-pr-mainvis ${c.visible ? 'checked' : ''}><i></i><span>${c.visible ? 'Visible' : 'Hidden'}</span></label><span class="pr-cl-chev"><i data-lucide="chevron-down"></i></span></div>
      </div>
      <div class="pr-cl-body"><div class="pr-cl-in"><div class="pr-cl-tw">
        <table class="pr-cl-tbl"><thead><tr><th></th><th>Sub ID</th><th>Sub Type Name</th><th>Parent Main ID</th><th>Products</th><th>Visibility</th><th class="pr-clact">Actions</th></tr></thead>
        <tbody>${r.subs.map((s, k) => subRowHTML(c, s, k)).join('') || `<tr class="pr-cl-none"><td colspan="7">No sub types yet · <button class="pr-link" type="button" data-pr-addsub="${c.id}">Add the first one</button></td></tr>`}</tbody></table>
        <button class="pr-cl-add" type="button" data-pr-addsub="${c.id}"><i data-lucide="plus"></i>Add sub type to ${esc(c.name)}</button>
      </div></div></div>
    </article>`;
  }
  function renderCL() {
    const sec = CL.sec; if (!sec) return;
    const rows = clRows(), subs = P.classes.reduce((a, c) => a + c.subs.length, 0), hidden = P.classes.filter((c) => !c.visible).length + P.classes.reduce((a, c) => a + c.subs.filter((s) => !s.visible).length, 0);
    $('[data-pr-clsum]', sec).innerHTML = `<span class="pill"><i data-lucide="tags"></i><b>${P.classes.length}</b> main classes</span><span class="pill"><i data-lucide="layers"></i><b>${subs}</b> sub types</span><span class="pill"><i data-lucide="eye-off"></i><b>${hidden}</b> hidden</span><span class="pill"><i data-lucide="package"></i><b>${P.items.length}</b> products classified</span><span class="spacer"></span><span class="pr-cl-tip"><i data-lucide="grip-vertical"></i>Drag rows to reorder</span>`;
    $('[data-pr-cllist]', sec).innerHTML = rows.map(cardHTML).join('') || '<div class="pr-emptybox"><span><i data-lucide="tags"></i></span><b>No classes match</b><small>Try another search or reset the filters.</small></div>';
    const ms = $('[data-pr-clmain]', sec), v = ms.value; ms.innerHTML = '<option value="">Main ID</option>' + P.classes.map((c) => `<option value="${c.id}">${c.id} · ${esc(c.name)}</option>`).join(''); ms.value = v;
    icons(sec); const ed = $('[data-pr-subedit]', sec); if (ed) { ed.focus(); ed.select(); }
    if (CL.flash) setTimeout(() => { CL.flash = null; }, 50);
  }
  function clModal(kind, parent) {
    CL.modal = { kind, parent, icon: 'package' };
    const sec = CL.sec, body = $('[data-pr-clmbody]', sec);
    $('[data-pr-clmh]', sec).textContent = kind === 'main' ? 'Add Main Class' : 'Add Sub Type';
    if (kind === 'main') {
      body.innerHTML = `<div class="pr-fg c2"><label class="pr-ff"><span>Main ID</span><input value="${nextMain()}" readonly></label><label class="pr-ff"><span>Main Class Name<em>*</em></span><input data-pr-clname placeholder="e.g. Beverages"><small class="pr-err"></small></label></div>
        <div class="pr-ff"><span>Icon</span><div class="pr-iconpick" data-pr-iconpick>${CL_ICONS.map((ic) => `<button type="button" data-ic="${ic}" class="${ic === 'package' ? 'on' : ''}" aria-label="${ic}"><i data-lucide="${ic}"></i></button>`).join('')}</div></div>
        <label class="switch"><input type="checkbox" checked data-pr-clvisin><i></i><span>Visible in sales &amp; purchase screens</span></label>`;
    } else {
      const p = parent || [...CL.open][0] || P.classes[0].id;
      body.innerHTML = `<label class="pr-ff"><span>Parent Main Class<em>*</em></span><select data-pr-clparent>${P.classes.map((c) => `<option value="${c.id}" ${c.id === p ? 'selected' : ''}>${c.id} · ${esc(c.name)}</option>`).join('')}</select></label>
        <div class="pr-fg c2"><label class="pr-ff"><span>Sub ID</span><input value="${nextSub()}" readonly></label><label class="pr-ff"><span>Sub Type Name<em>*</em></span><input data-pr-clname placeholder="e.g. Soft Drinks"><small class="pr-err"></small></label></div>
        <label class="switch"><input type="checkbox" checked data-pr-clvisin><i></i><span>Visible</span></label>`;
    }
    FS.openModal('pr-clmodal');
    setTimeout(() => $('[data-pr-clname]', body).focus(), 120);
  }
  function clSave() {
    const sec = CL.sec, body = $('[data-pr-clmbody]', sec), nm = $('[data-pr-clname]', body), name = nm.value.trim(), lab = nm.closest('.pr-ff'), vis = $('[data-pr-clvisin]', body).checked;
    const fail = (m) => { lab.classList.add('err'); $('.pr-err', lab).textContent = m; shake($('.pr-clm', sec)); nm.focus(); };
    if (!name) return fail('Name is required');
    if (CL.modal.kind === 'main') {
      if (P.classes.some((c) => c.name.toLowerCase() === name.toLowerCase())) return fail('This class already exists');
      const c = { id: nextMain(), name, icon: CL.modal.icon, visible: vis, subs: [] };
      P.classes.push(c); CL.open.add(c.id); CL.flash = c.id;
      FS.closeOverlay($('#pr-clmodal')); renderCL(); const el = $(`[data-cl="${c.id}"]`, sec); el && el.scrollIntoView({ block: 'center', behavior: reduce() ? 'auto' : 'smooth' });
      FS.toast(`${c.id} · ${name} added`, { tone: 'good', action: { label: 'Add sub type', fn: () => clModal('sub', c.id) } });
    } else {
      const c = P.classes.find((x) => x.id === $('[data-pr-clparent]', body).value);
      if (c.subs.some((s) => s.name.toLowerCase() === name.toLowerCase())) return fail(`Already in ${c.name}`);
      const s = { id: nextSub(), name, visible: vis }; c.subs.push(s); CL.open.add(c.id); CL.flash = s.id;
      FS.closeOverlay($('#pr-clmodal')); renderCL(); const el = $(`[data-sub="${s.id}"]`, sec); el && el.scrollIntoView({ block: 'center', behavior: reduce() ? 'auto' : 'smooth' });
      FS.celebrate(el); FS.toast(`${s.id} · ${name} added to ${c.name}`, { tone: 'good' });
    }
  }
  function mountCL(sec) {
    CL.sec = sec;
    sec.addEventListener('input', (e) => { if (e.target.matches('[data-pr-clq]')) { CL.q = e.target.value; renderCL(); } const l = e.target.closest('.pr-ff.err'); if (l) l.classList.remove('err'); });
    sec.addEventListener('change', (e) => {
      const t = e.target;
      if (t.matches('[data-pr-clmain]')) { CL.main = t.value; if (t.value) CL.open.add(t.value); renderCL(); return; }
      if (t.matches('[data-pr-clvis]')) { CL.vis = t.value; renderCL(); return; }
      if (t.matches('[data-pr-mainvis]')) { const c = P.classes.find((x) => x.id === t.closest('[data-cl]').dataset.cl); c.visible = t.checked; t.nextElementSibling.nextElementSibling.textContent = t.checked ? 'Visible' : 'Hidden'; t.closest('.pr-cl-card').classList.toggle('off', !t.checked); FS.toast(`${c.name} is now ${t.checked ? 'visible' : 'hidden'}`, { tone: 'info', ms: 1800 }); return; }
      if (t.matches('[data-pr-subvis]')) { const c = P.classes.find((x) => x.id === t.closest('[data-cl]').dataset.cl), s = c.subs.find((x) => x.id === t.closest('[data-sub]').dataset.sub); s.visible = t.checked; t.nextElementSibling.nextElementSibling.textContent = t.checked ? 'Visible' : 'Hidden'; t.closest('tr').classList.toggle('off', !t.checked); }
    });
    sec.addEventListener('click', (e) => {
      const t = e.target;
      if (t.closest('[data-pr-clvisw]')) return;
      const add = t.closest('[data-pr-cladd]'); if (add) return clModal(add.dataset.prCladd);
      const as = t.closest('[data-pr-addsub]'); if (as) return clModal('sub', as.dataset.prAddsub);
      if (t.closest('[data-pr-clreset]')) { CL.q = ''; CL.main = ''; CL.vis = ''; $('[data-pr-clq]', sec).value = ''; $('[data-pr-clmain]', sec).value = ''; $('[data-pr-clvis]', sec).value = ''; renderCL(); FS.toast('Filters reset', { tone: 'info', ms: 1500 }); return; }
      const ip = t.closest('[data-pr-iconpick] button'); if (ip) { CL.modal.icon = ip.dataset.ic; $$('[data-pr-iconpick] button', sec).forEach((b) => b.classList.toggle('on', b === ip)); return; }
      if (t.closest('[data-pr-clmsave]')) return clSave();
      const tog = t.closest('[data-pr-cltog]');
      if (tog) { const card = tog.closest('[data-cl]'), id = card.dataset.cl, on = !card.classList.contains('open'); on ? CL.open.add(id) : CL.open.delete(id); card.classList.toggle('open', on); tog.setAttribute('aria-expanded', String(on)); return; }
      const row = t.closest('[data-sub]'); if (!row) return;
      const c = P.classes.find((x) => x.id === row.closest('[data-cl]').dataset.cl), s = c.subs.find((x) => x.id === row.dataset.sub);
      if (t.closest('[data-pr-subed]')) { CL.editing = s.id; renderCL(); return; }
      if (t.closest('[data-pr-subcancel]')) { CL.editing = null; renderCL(); return; }
      if (t.closest('[data-pr-subsave]')) return subSave(c, s);
      if (t.closest('[data-pr-subdel]')) {
        const n = subCount(s.id);
        FS.confirm({ title: `Delete ${s.id} · ${esc(s.name)}?`, text: n ? `${n} product${n === 1 ? '' : 's'} use this sub type. They keep their main class and will need a new sub type.` : 'This sub type has no products.', okLabel: 'Delete', danger: true }).then((ok) => {
          if (!ok) return;
          const at = c.subs.indexOf(s); row.classList.add('pr-out');
          setTimeout(() => { c.subs.splice(at, 1); renderCL(); FS.toast(`${s.name} deleted`, { tone: 'danger', undo: () => { c.subs.splice(at, 0, s); CL.flash = s.id; renderCL(); } }); }, reduce() ? 0 : 300);
        });
      }
    });
    const subSave = (c, s) => { const inp = $('[data-pr-subedit]', sec), v = inp.value.trim(); if (!v) { shake(inp); return; } const old = s.name; s.name = v; CL.editing = null; CL.flash = s.id; renderCL(); if (old !== v) FS.toast(`Renamed to ${v}`, { tone: 'good', undo: () => { s.name = old; renderCL(); } }); };
    sec.addEventListener('keydown', (e) => {
      if (e.target.matches('[data-pr-subedit]')) { const row = e.target.closest('[data-sub]'), c = P.classes.find((x) => x.id === row.closest('[data-cl]').dataset.cl); if (e.key === 'Enter') subSave(c, c.subs.find((x) => x.id === row.dataset.sub)); if (e.key === 'Escape') { CL.editing = null; renderCL(); } return; }
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-pr-cltog]')) { e.preventDefault(); e.target.click(); }
      if (e.key === 'Enter' && e.target.matches('[data-pr-clname]')) clSave();
    });
    // HTML5 drag & drop reorder (within a main class)
    sec.addEventListener('dragstart', (e) => { const r = e.target.closest && e.target.closest('tr[data-sub]'); if (!r) return; CL.drag = { id: r.dataset.sub, cl: r.closest('[data-cl]').dataset.cl }; r.classList.add('pr-dragging'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', r.dataset.sub); } catch (x) { /* ignore */ } });
    sec.addEventListener('dragover', (e) => {
      const r = e.target.closest && e.target.closest('tr[data-sub]'); if (!CL.drag || !r || r.closest('[data-cl]').dataset.cl !== CL.drag.cl) return;
      e.preventDefault(); const b = r.getBoundingClientRect(), after = e.clientY > b.top + b.height / 2;
      $$('.pr-dropb, .pr-dropa', sec).forEach((x) => x.classList.remove('pr-dropb', 'pr-dropa')); if (r.dataset.sub !== CL.drag.id) r.classList.add(after ? 'pr-dropa' : 'pr-dropb');
    });
    sec.addEventListener('drop', (e) => {
      const r = e.target.closest && e.target.closest('tr[data-sub]'); if (!CL.drag || !r) return; e.preventDefault();
      const c = P.classes.find((x) => x.id === CL.drag.cl), from = c.subs.findIndex((s) => s.id === CL.drag.id), after = r.classList.contains('pr-dropa');
      if (r.dataset.sub !== CL.drag.id && from >= 0) {
        const old = c.subs.slice(), [m] = c.subs.splice(from, 1); let to = c.subs.findIndex((s) => s.id === r.dataset.sub); if (after) to++;
        c.subs.splice(to, 0, m); CL.flash = m.id; renderCL(); FS.toast(`Order saved · ${m.name} moved to position ${to + 1}`, { tone: 'good', ms: 2200, undo: () => { c.subs = old; renderCL(); } });
      }
    });
    sec.addEventListener('dragend', () => { CL.drag = null; $$('.pr-dragging, .pr-dropb, .pr-dropa', sec).forEach((x) => x.classList.remove('pr-dragging', 'pr-dropb', 'pr-dropa')); });
  }
  FS.onEnter('app/inventory/classes', (sec, r, first) => { if (first) mountCL(sec); renderCL(); });

  /* ====================================================================== */
  /* 5 · KITS & BUNDLES                                                      */
  /* ====================================================================== */
  const K = { sec: null, cur: 'KIT-001', margin: 25 };
  P.kits = [
    { code: 'KIT-001', name: 'Eid Gift Hamper', icon: 'gift', tone: 'lime', comps: [{ sku: 'FD-5001', qty: 2 }, { sku: 'FD-5005', qty: 2 }, { sku: 'FD-5002', qty: 1 }, { sku: 'FD-5011', qty: 3 }], price: 2990, stock: 24 },
    { code: 'KIT-002', name: 'Office Starter Pack', icon: 'briefcase', tone: 'blue', comps: [{ sku: 'OF-2002', qty: 2 }, { sku: 'OF-2003', qty: 2 }, { sku: 'OF-2010', qty: 1 }, { sku: 'OF-2011', qty: 1 }, { sku: 'IT-6001', qty: 1 }], price: 7990, stock: 12 },
    { code: 'KIT-003', name: 'Site Safety Kit', icon: 'hard-hat', tone: 'orange', comps: [{ sku: 'IN-3001', qty: 1 }, { sku: 'IN-3002', qty: 1 }, { sku: 'IN-3003', qty: 1 }, { sku: 'IN-3004', qty: 1 }], price: 4490, stock: 8 },
    { code: 'KIT-004', name: 'Packing Starter Bundle', icon: 'package-open', tone: 'violet', comps: [{ sku: 'PK-1001', qty: 25 }, { sku: 'PK-1003', qty: 6 }, { sku: 'PK-1004', qty: 1 }], price: 4390, stock: 0 },
  ];
  const kit = (code) => P.kits.find((k) => k.code === code);
  const kCost = (k) => k.comps.reduce((a, c) => a + (item(c.sku) ? item(c.sku).cost * c.qty : 0), 0);
  const kRetail = (k) => k.comps.reduce((a, c) => a + (item(c.sku) ? item(c.sku).price * c.qty : 0), 0);
  const kBuild = (k) => (k.comps.length ? Math.min(...k.comps.map((c) => (item(c.sku) ? Math.floor(item(c.sku).stock / c.qty) : 0))) : 0);
  const kMargin = (k) => (k.price ? ((k.price - kCost(k)) / k.price) * 100 : 0);
  function renderKitList() {
    const sec = K.sec;
    $('[data-pr-kitlist]', sec).innerHTML = P.kits.map((k, i) => {
      const m = kMargin(k);
      return `<article class="pr-kcard ${k.code === K.cur ? 'on' : ''}" data-kit="${k.code}" style="--i:${i}" tabindex="0" role="button" aria-pressed="${k.code === K.cur}">
        <div class="pr-kc-top"><span class="icon-tile ${k.tone}"><i data-lucide="${k.icon}"></i></span><div><b>${esc(k.name)}</b><small>${k.code} · ${k.comps.length} components</small></div><span class="pr-mchip sm ${m < 0 ? 'bad' : m < 10 ? 'low' : 'ok'}"><b>${pct(m)}</b></span></div>
        <div class="pr-kc-comps">${k.comps.slice(0, 4).map((c) => item(c.sku) ? `<span title="${esc(item(c.sku).name)}">${coTile(item(c.sku), 'xs')}<em>×${c.qty}</em></span>` : '').join('')}${k.comps.length > 4 ? `<span class="pr-more">+${k.comps.length - 4}</span>` : ''}</div>
        <div class="pr-kc-foot"><div><small>Cost</small><b>${money(kCost(k), { dec: 0 })}</b></div><div><small>Price</small><b>${money(k.price, { dec: 0 })}</b></div><div><small>In stock</small><b data-pr-kstock="${k.code}">${fmt(k.stock)}</b></div><div><small>Can build</small><b>${fmt(kBuild(k))}</b></div></div>
      </article>`;
    }).join('') + '<button class="pr-kcard pr-kadd" type="button" data-pr-kitnew><i data-lucide="plus"></i><span>New kit or bundle</span></button>';
    icons($('[data-pr-kitlist]', sec));
  }
  function renderBuilder(focusName) {
    const sec = K.sec, k = kit(K.cur), box = $('[data-pr-kitb]', sec);
    if (!k) { box.innerHTML = ''; return; }
    const used = new Set(k.comps.map((c) => c.sku));
    box.innerHTML = `<div class="pr-card pr-kb">
      <div class="pr-kb-head"><span class="icon-tile ${k.tone}"><i data-lucide="${k.icon}"></i></span><div class="pr-kb-name"><input value="${esc(k.name)}" data-pr-kname aria-label="Kit name"><small>${k.code} · Bill of materials · ${fmt(k.stock)} assembled in stock</small></div>
        <div class="pr-kb-acts"><button class="btn secondary" type="button" data-pr-kas="dis" ${k.stock ? '' : 'disabled'}><i data-lucide="package-open"></i>Disassemble</button><button class="btn primary" type="button" data-pr-kas="as"><i data-lucide="hammer"></i>Assemble</button></div></div>
      <div class="pr-kb-grid">
        <div class="pr-kb-comps">
          <div class="pr-tw"><table class="tbl pr-kb-tbl" data-plain><thead><tr><th>Component</th><th>Qty per kit</th><th class="num">Unit cost</th><th class="num">Line cost</th><th class="num">On hand</th><th></th></tr></thead><tbody data-pr-kbody>
          ${k.comps.map((c, i) => { const it = item(c.sku); if (!it) return ''; const can = Math.floor(it.stock / c.qty); return `<tr data-ksku="${c.sku}" style="--i:${i}"><td><div class="pr-kcomp">${coTile(it, 'sm')}<div><b>${esc(it.name)}</b><small>${it.sku} · ${pack(it)}</small></div></div></td>
            <td><div class="pr-step sm"><button type="button" data-pr-kq="-1" aria-label="Less"><i data-lucide="minus"></i></button><input type="number" min="1" value="${c.qty}" data-pr-kqin aria-label="Quantity"><button type="button" data-pr-kq="1" aria-label="More"><i data-lucide="plus"></i></button></div></td>
            <td class="num">${fmt(it.cost, 2)}</td><td class="num"><b data-pr-kline>${fmt(it.cost * c.qty, 2)}</b></td><td class="num"><span class="pr-stock ${tone(it)}">${fmt(it.stock)}</span><small>${fmt(can)} kits</small></td>
            <td><button class="pr-iconbtn" type="button" data-pr-krm aria-label="Remove component"><i data-lucide="trash-2"></i></button></td></tr>`; }).join('') || '<tr><td colspan="6" class="pr-bp-empty">Add components below to start costing this kit.</td></tr>'}
          </tbody></table></div>
          <div class="pr-kb-add"><div class="pr-ctl"><i data-lucide="search"></i><select data-pr-kadd aria-label="Add component"><option value="">Add a component…</option>${P.items.filter((i) => !used.has(i.sku) && i.status !== 'Inactive').map((i) => `<option value="${i.sku}">${i.sku} · ${esc(i.name)} · Rs ${fmt(i.cost)}</option>`).join('')}</select><i data-lucide="chevron-down" class="pr-chev"></i></div><button class="btn secondary" type="button" data-pr-kaddbtn><i data-lucide="plus"></i>Add</button></div>
        </div>
        <aside class="pr-kb-roll">
          <div class="pr-roll-row"><small>Total component cost</small><b class="pr-roll-big" data-pr-kcost>${money(kCost(k))}</b></div>
          <div class="pr-roll-row"><small>Bought separately (retail)</small><b data-pr-kretail>${money(kRetail(k), { dec: 0 })}</b></div>
          <div class="pr-roll-sl"><div class="pr-roll-slh"><small>Target margin</small><b data-pr-kmt>${K.margin}%</b></div><input type="range" min="5" max="50" step="1" value="${K.margin}" data-pr-kmr aria-label="Target margin"></div>
          <div class="pr-roll-sug"><div><small>Suggested price</small><b data-pr-ksug>${money(Math.ceil(kCost(k) / (1 - K.margin / 100) / 10) * 10, { dec: 0 })}</b></div><button class="btn secondary sm" type="button" data-pr-kuse><i data-lucide="wand-sparkles"></i>Use</button></div>
          <label class="pr-ff"><span>Kit selling price</span><div class="pr-inaff"><b>Rs</b><input type="number" min="0" value="${k.price}" data-pr-kprice></div></label>
          <div class="pr-roll-m"><span class="pr-mchip ${kMargin(k) < 0 ? 'bad' : kMargin(k) < 10 ? 'low' : 'ok'}" data-pr-kmchip><small>Margin</small><b>${pct(kMargin(k))}</b><em>Rs ${fmt(k.price - kCost(k))} / kit</em></span><span class="pr-mchip info" data-pr-ksave><small>Customer saves</small><b>${pct(kRetail(k) ? ((kRetail(k) - k.price) / kRetail(k)) * 100 : 0)}</b><em>vs buying separately</em></span></div>
          <div class="pr-roll-build"><i data-lucide="boxes"></i><span>Stock can build <b data-pr-kbuild>${fmt(kBuild(k))}</b> more kits</span></div>
          <button class="btn lime block" type="button" data-pr-ksave-btn><i data-lucide="save"></i><span>Save kit</span></button>
        </aside>
      </div></div>`;
    icons(box);
    if (focusName) { const n = $('[data-pr-kname]', box); n.focus(); n.select(); }
  }
  function updateRoll() {
    const sec = K.sec, k = kit(K.cur), cost = kCost(k), m = kMargin(k), ret = kRetail(k);
    FS.tick($('[data-pr-kcost]', sec), cost, { dec: 2, prefix: 'Rs ' });
    $('[data-pr-kretail]', sec).innerHTML = money(ret, { dec: 0 });
    $('[data-pr-ksug]', sec).innerHTML = money(Math.ceil(cost / (1 - K.margin / 100) / 10) * 10, { dec: 0 });
    const mc = $('[data-pr-kmchip]', sec); mc.className = `pr-mchip ${m < 0 ? 'bad' : m < 10 ? 'low' : 'ok'}`; mc.innerHTML = `<small>Margin</small><b>${pct(m)}</b><em>Rs ${fmt(k.price - cost)} / kit</em>`;
    $('[data-pr-ksave]', sec).innerHTML = `<small>Customer saves</small><b>${pct(ret ? ((ret - k.price) / ret) * 100 : 0)}</b><em>vs buying separately</em>`;
    $('[data-pr-kbuild]', sec).textContent = fmt(kBuild(k));
    $$('[data-ksku]', sec).forEach((r) => { const c = k.comps.find((x) => x.sku === r.dataset.ksku), it = item(c.sku); $('[data-pr-kline]', r).textContent = fmt(it.cost * c.qty, 2); $('.num small', r).textContent = fmt(Math.floor(it.stock / c.qty)) + ' kits'; });
  }
  function assembleSheet(dir) {
    const k = kit(K.cur); let q = dir === 'as' ? Math.min(5, Math.max(1, kBuild(k))) : Math.min(1, k.stock);
    const sh = FS.sheet({ title: dir === 'as' ? `Assemble ${esc(k.name)}` : `Disassemble ${esc(k.name)}`, subtitle: dir === 'as' ? 'Components are issued from stock and kits are added' : 'Kits are broken down and components return to stock',
      html: `<div class="pr-asm"><div class="pr-asm-q"><span>Kits to ${dir === 'as' ? 'assemble' : 'disassemble'}</span><div class="pr-step lg"><button type="button" data-pr-aq="-1" aria-label="Less"><i data-lucide="minus"></i></button><input type="number" min="1" value="${q}" data-pr-aqin aria-label="Kit quantity"><button type="button" data-pr-aq="1" aria-label="More"><i data-lucide="plus"></i></button></div><small>${dir === 'as' ? `Max ${fmt(kBuild(k))} from current stock` : `${fmt(k.stock)} kits in stock`}</small></div>
        <div class="pr-tw"><table class="tbl pr-asm-tbl" data-plain><thead><tr><th>Component</th><th class="num">Per kit</th><th class="num">${dir === 'as' ? 'Issue' : 'Return'}</th><th class="num">Before</th><th></th><th class="num">After</th></tr></thead><tbody data-pr-abody></tbody></table></div>
        <div class="pr-asm-kit"><span class="icon-tile ${k.tone}"><i data-lucide="${k.icon}"></i></span><span>${esc(k.name)} stock</span><b>${fmt(k.stock)}</b><i data-lucide="arrow-right"></i><b data-pr-akafter>${fmt(k.stock)}</b></div></div>`,
      foot: `<button class="btn secondary" type="button" data-close>Cancel</button><button class="btn primary" type="button" data-pr-ago><i data-lucide="${dir === 'as' ? 'hammer' : 'package-open'}"></i><span>${dir === 'as' ? 'Assemble' : 'Disassemble'}</span></button>` });
    const draw = () => {
      let ok = q >= 1 && (dir === 'as' || q <= k.stock);
      $('[data-pr-abody]', sh).innerHTML = k.comps.map((c) => { const it = item(c.sku), mv = c.qty * q, after = it.stock + (dir === 'as' ? -mv : mv), bad = after < 0; if (bad) ok = false; return `<tr class="${bad ? 'pr-bad' : ''}"><td><b>${esc(it.name)}</b><small>${it.sku}</small></td><td class="num">${c.qty}</td><td class="num ${dir === 'as' ? 'pr-down' : 'pr-up'}">${dir === 'as' ? '−' : '+'}${fmt(mv)}</td><td class="num">${fmt(it.stock)}</td><td class="pr-arrow"><i data-lucide="arrow-right"></i></td><td class="num"><b class="${bad ? 'pr-down' : ''}">${fmt(after)}</b>${bad ? '<small class="pr-short">short ' + fmt(-after) + '</small>' : ''}</td></tr>`; }).join('');
      FS.tick($('[data-pr-akafter]', sh), Math.max(0, k.stock + (dir === 'as' ? q : -q)), { dec: 0 });
      $('[data-pr-ago]', sh).disabled = !ok; icons($('[data-pr-abody]', sh));
    };
    draw();
    sh.addEventListener('input', (e) => { if (e.target.matches('[data-pr-aqin]')) { q = Math.max(0, Math.floor(num(e.target.value) || 0)); draw(); } });
    sh.addEventListener('click', async (e) => {
      const s = e.target.closest('[data-pr-aq]'); if (s) { q = Math.max(1, q + +s.dataset.prAq); $('[data-pr-aqin]', sh).value = q; draw(); return; }
      const go = e.target.closest('[data-pr-ago]');
      if (go) {
        await busy(go, dir === 'as' ? 'Assembling…' : 'Breaking down…', 1000);
        k.comps.forEach((c) => { item(c.sku).stock += (dir === 'as' ? -1 : 1) * c.qty * q; });
        k.stock += dir === 'as' ? q : -q;
        FS.closeOverlay(sh.closest('.overlay')); renderKitList(); renderBuilder();
        FS.celebrate($(`[data-kit="${k.code}"]`, K.sec), dir === 'as' ? `${q} assembled` : `${q} broken down`);
        FS.toast(`${fmt(q)} × ${k.name} ${dir === 'as' ? 'assembled' : 'disassembled'} · voucher ASM-2026-0${310 + q}`, { tone: 'good' });
      }
    });
  }
  function mountKits(sec) {
    K.sec = sec;
    sec.addEventListener('click', async (e) => {
      const t = e.target, k = kit(K.cur);
      if (t.closest('[data-pr-kitnew]')) {
        const n = 'KIT-' + String(P.kits.length + 1).padStart(3, '0');
        P.kits.push({ code: n, name: 'New Bundle', icon: 'package-plus', tone: 'green', comps: [], price: 0, stock: 0 });
        K.cur = n; renderKitList(); renderBuilder(true); FS.toast(`${n} created · add components to cost it`, { tone: 'info' }); return;
      }
      const card = t.closest('[data-kit]'); if (card) { K.cur = card.dataset.kit; renderKitList(); const b = $('[data-pr-kitb]', sec); b.classList.remove('pr-swap-in'); void b.offsetWidth; b.classList.add('pr-swap-in'); renderBuilder(); return; }
      if (!k) return;
      const qb = t.closest('[data-pr-kq]'); if (qb) { const r = qb.closest('[data-ksku]'), c = k.comps.find((x) => x.sku === r.dataset.ksku); c.qty = Math.max(1, c.qty + +qb.dataset.prKq); $('[data-pr-kqin]', r).value = c.qty; updateRoll(); return; }
      const rm = t.closest('[data-pr-krm]'); if (rm) { const r = rm.closest('[data-ksku]'), at = k.comps.findIndex((x) => x.sku === r.dataset.ksku), c = k.comps[at]; r.classList.add('pr-out'); setTimeout(() => { k.comps.splice(at, 1); renderBuilder(); renderKitList(); FS.toast(`${item(c.sku).name} removed`, { tone: 'info', undo: () => { k.comps.splice(at, 0, c); renderBuilder(); renderKitList(); } }); }, reduce() ? 0 : 280); return; }
      if (t.closest('[data-pr-kaddbtn]')) { const s = $('[data-pr-kadd]', sec); if (!s.value) { shake(s.closest('.pr-ctl')); return; } k.comps.push({ sku: s.value, qty: 1 }); const sku = s.value; renderBuilder(); renderKitList(); const r = $(`[data-ksku="${sku}"]`, sec); if (r) r.classList.add('pr-flash'); return; }
      if (t.closest('[data-pr-kuse]')) { k.price = Math.ceil(kCost(k) / (1 - K.margin / 100) / 10) * 10; $('[data-pr-kprice]', sec).value = k.price; updateRoll(); return; }
      const as = t.closest('[data-pr-kas]'); if (as) { if (!k.comps.length) { FS.toast('Add components first', { tone: 'warn' }); return; } assembleSheet(as.dataset.prKas); return; }
      const sv = t.closest('[data-pr-ksave-btn]'); if (sv) { await busy(sv, 'Saving…', 700); renderKitList(); FS.toast(`${k.code} · ${k.name} saved · cost ${FS.fmt(kCost(k))}, price ${FS.fmt(k.price)}`, { tone: 'good' }); }
    });
    sec.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-kit]')) { e.preventDefault(); e.target.click(); } });
    sec.addEventListener('input', (e) => {
      const k = kit(K.cur); if (!k) return; const t = e.target;
      if (t.matches('[data-pr-kname]')) { k.name = t.value || 'Untitled kit'; const c = $(`[data-kit="${k.code}"] b`, sec); if (c) c.textContent = k.name; }
      if (t.matches('[data-pr-kqin]')) { const c = k.comps.find((x) => x.sku === t.closest('[data-ksku]').dataset.ksku); c.qty = Math.max(1, Math.floor(num(t.value) || 1)); updateRoll(); }
      if (t.matches('[data-pr-kprice]')) { k.price = num(t.value) || 0; updateRoll(); }
      if (t.matches('[data-pr-kmr]')) { K.margin = +t.value; $('[data-pr-kmt]', sec).textContent = K.margin + '%'; updateRoll(); }
    });
    sec.addEventListener('change', (e) => { if (e.target.matches('[data-pr-kadd]') && e.target.value) $('[data-pr-kaddbtn]', sec).click(); });
  }
  FS.onEnter('app/inventory/kits', (sec, r, first) => { if (first) mountKits(sec); renderKitList(); renderBuilder(); });

  /* ====================================================================== */
  /* 6 · BARCODE LABELS                                                      */
  /* ====================================================================== */
  const LB = { sec: null, picks: new Map([['FD-5001', 6], ['FD-5002', 3], ['PK-1003', 3]]), q: '', tpl: 'thermal', o: { price: true, urdu: false, batch: false, company: true, ctn: false } };
  const TPL = { thermal: ['Thermal roll · 2 × 1 inch', 0], small: ['Thermal roll · 38 × 25 mm', 0], a4: ['A4 sheet · 4 × 10 labels (52.5 × 29.7 mm)', 40] };
  function labelHTML(it, o, tpl) {
    const b = it.batches && it.batches.length ? it.batches.slice().sort((x, y) => x.exp.localeCompare(y.exp))[0] : null;
    const code = o.ctn ? (it.barcodes[1] || it.upc) : (it.barcodes[0] || it.upc);
    const [i, d] = FS.fmt(o.ctn ? it.price * it.ctn : it.price, 2).split('.');
    return `<div class="pr-label ${tpl}">
      ${o.company ? `<small class="pr-lb-co">${esc(coName(it.company))}${o.ctn ? ` · CTN ${it.ctn}` : ''}</small>` : ''}
      <b class="pr-lb-name">${esc(it.name)}</b>
      ${o.urdu ? `<span class="pr-lb-ur" dir="rtl" lang="ur">${urdu(it)}</span>` : ''}
      <div class="pr-lb-bc">${bars(code)}<span>${esc(code)}</span></div>
      <div class="pr-lb-foot">${o.batch ? `<small>${b ? `B ${esc(b.no)} · Exp ${b.exp.slice(5, 7)}/${b.exp.slice(2, 4)}` : 'No batch'}</small>` : `<small>${esc(it.sku)}</small>`}${o.price ? `<b class="pr-lb-price">Rs ${i}<span>.${d}</span></b>` : ''}</div>
    </div>`;
  }
  function renderPicks() {
    const sec = LB.sec, q = LB.q.trim().toLowerCase();
    const list = P.items.filter((i) => !q || (i.sku + ' ' + i.name + ' ' + i.upc).toLowerCase().includes(q)).sort((a, b) => (LB.picks.has(b.sku) - LB.picks.has(a.sku)));
    $('[data-pr-lbpicks]', sec).innerHTML = list.map((it) => { const on = LB.picks.has(it.sku); return `<div class="pr-pick ${on ? 'on' : ''}" data-lsku="${it.sku}"><label><input type="checkbox" ${on ? 'checked' : ''} data-pr-lbchk aria-label="Pick ${esc(it.sku)}">${coTile(it, 'xs')}<span><b>${esc(it.name)}</b><small>${it.sku} · Rs ${fmt(it.price)}</small></span></label><div class="pr-step sm"><button type="button" data-pr-lq="-1" ${on ? '' : 'disabled'} aria-label="Fewer"><i data-lucide="minus"></i></button><input type="number" min="1" value="${LB.picks.get(it.sku) || 1}" ${on ? '' : 'disabled'} data-pr-lqin aria-label="Copies"><button type="button" data-pr-lq="1" ${on ? '' : 'disabled'} aria-label="More"><i data-lucide="plus"></i></button></div></div>`; }).join('') || '<div class="pr-emptybox"><b>No products match</b></div>';
    icons($('[data-pr-lbpicks]', sec));
  }
  function renderSheet() {
    const sec = LB.sec, all = []; LB.picks.forEach((n, sku) => { const it = item(sku); if (it) for (let k = 0; k < n; k++) all.push(it); });
    const cap = 160, shown = all.slice(0, cap), sheet = $('[data-pr-lbsheet]', sec), per = TPL[LB.tpl][1];
    sheet.className = 'pr-lb-sheet ' + LB.tpl;
    if (LB.tpl === 'a4') {
      const pages = Math.max(1, Math.ceil(shown.length / per)); let h = '';
      for (let p = 0; p < Math.min(pages, 4); p++) { h += `<div class="pr-a4" aria-label="Page ${p + 1}"><span class="pr-a4-n">Page ${p + 1}</span>`; for (let s = 0; s < per; s++) { const it = shown[p * per + s]; h += it ? labelHTML(it, LB.o, 'a4') : '<div class="pr-label a4 blank"></div>'; } h += '</div>'; }
      sheet.innerHTML = h;
      $('[data-pr-lbpages]', sec).innerHTML = `<i data-lucide="file"></i>${pages} page${pages === 1 ? '' : 's'} · ${pages * per - all.length >= 0 ? pages * per - all.length : 0} blank`;
    } else {
      sheet.innerHTML = shown.map((it, i) => labelHTML(it, LB.o, LB.tpl).replace('class="pr-label', `style="--i:${Math.min(i, 30)}" class="pr-label`)).join('') + (all.length > cap ? `<div class="pr-lb-more">+${all.length - cap} more labels</div>` : '') || '<div class="pr-emptybox"><span><i data-lucide="scan-barcode"></i></span><b>No labels yet</b><small>Tick a product on the left to preview its label.</small></div>';
      $('[data-pr-lbpages]', sec).innerHTML = `<i data-lucide="file"></i>${LB.tpl === 'thermal' ? Math.round(all.length * 1.0 * 10) / 10 + ' in' : fmt(all.length * 28) + ' mm'} of roll`;
    }
    $('[data-pr-lbsub]', sec).textContent = TPL[LB.tpl][0];
    $('[data-pr-lbcount]', sec).textContent = `${fmt(all.length)} label${all.length === 1 ? '' : 's'} · ${LB.picks.size} product${LB.picks.size === 1 ? '' : 's'}`;
    $('[data-pr-lbprint]', sec).disabled = !all.length;
    icons(sec);
  }
  function mountLB(sec) {
    LB.sec = sec;
    sec.addEventListener('input', (e) => {
      if (e.target.matches('[data-pr-lbq]')) { LB.q = e.target.value; renderPicks(); }
      if (e.target.matches('[data-pr-lqin]')) { const s = e.target.closest('[data-lsku]').dataset.lsku; LB.picks.set(s, Math.max(1, Math.min(500, Math.floor(num(e.target.value) || 1)))); renderSheet(); }
    });
    sec.addEventListener('change', (e) => {
      if (e.target.matches('[data-pr-lbchk]')) { const r = e.target.closest('[data-lsku]'), s = r.dataset.lsku; e.target.checked ? LB.picks.set(s, 1) : LB.picks.delete(s); r.classList.toggle('on', e.target.checked); $$('button, input[type=number]', r).forEach((x) => { x.disabled = !e.target.checked; }); renderSheet(); }
      if (e.target.matches('[data-pr-lbo]')) { LB.o[e.target.dataset.prLbo] = e.target.checked; renderSheet(); }
    });
    sec.addEventListener('click', (e) => {
      const t = e.target;
      const lq = t.closest('[data-pr-lq]'); if (lq) { const r = lq.closest('[data-lsku]'), s = r.dataset.lsku, v = Math.max(1, (LB.picks.get(s) || 1) + +lq.dataset.prLq); LB.picks.set(s, v); $('[data-pr-lqin]', r).value = v; renderSheet(); return; }
      const tp = t.closest('[data-pr-lbtpl] button'); if (tp) { LB.tpl = tp.dataset.v; $$('[data-pr-lbtpl] button', sec).forEach((b) => b.classList.toggle('active', b === tp)); const st = $('.pr-lb-stage', sec); FS.skeleton(st, 260); renderSheet(); return; }
      if (t.closest('[data-pr-lbnone]')) { LB.picks.clear(); renderPicks(); renderSheet(); return; }
      if (t.closest('[data-pr-lbprint]')) {
        document.body.classList.add('pr-printing');
        const done = () => { document.body.classList.remove('pr-printing'); removeEventListener('afterprint', done); };
        addEventListener('afterprint', done);
        try { window.print(); } catch (x) { /* print blocked */ }
        setTimeout(done, 1500);
        FS.toast(`Sent ${$('[data-pr-lbcount]', sec).textContent} to the printer`, { tone: 'good' });
      }
    });
  }
  FS.onEnter('app/inventory/labels', (sec, r, first) => {
    if (first) mountLB(sec);
    if (P.labelPick && P.labelPick.length) { LB.picks = new Map(P.labelPick.map((s) => [s, P.labelPick.length === 1 ? 8 : 2])); P.labelPick = null; LB.q = ''; $('[data-pr-lbq]', sec).value = ''; }
    renderPicks(); renderSheet();
  });
})();
