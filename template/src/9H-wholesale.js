/* 9H-wholesale.js (Agent C1): Quick Wholesale Entry · Bulk Invoicing · Order Bookings · Back-orders.
   Loads after 95-ui.js. Everything is scoped to .ws2-* / #ws2-* and mounted through FS.onEnter. */
(function () {
  'use strict';
  if (!window.FS || !window.FS_DATA) return;
  const D = window.FS_DATA;
  /* overlays are moved to <body> on mount (so wide modals sit above the sidebar); lookups scoped to a
     ws2 screen fall back to the document so they still find them */
  const ownScope = (r) => r !== document && r.classList && r.classList.contains('ws2-screen');
  const $ = (s, r = document) => r.querySelector(s) || (ownScope(r) ? document.querySelector(s) : null);
  const $$ = (s, r = document) => { let a = Array.from(r.querySelectorAll(s)); if (!a.length && ownScope(r)) a = Array.from(document.querySelectorAll(s)); return a; };
  const liftOverlays = (sec) => Array.from(sec.querySelectorAll(':scope > .overlay')).forEach((o) => { o.classList.add('ws2-ov'); document.body.appendChild(o); });
  const RM = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = (v) => { const n = parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isFinite(n) ? n : 0; };
  const r2 = (n) => Math.round(n * 100) / 100;
  const fmt = (n, d = 2) => FS.fmt(n, d);
  const money = (n, d = 2) => FS.money(n, { dec: d });
  const hash = (s) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
  const isActive = (sec) => sec && sec.classList.contains('active');
  const anyOverlay = () => !!$('.overlay.open');
  const wait = (ms) => new Promise((r) => setTimeout(r, RM() ? 0 : ms));
  const initials = (n) => n.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w)).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

  /* ---------- cloned master data (never mutate FS_DATA) ---------- */
  const ITEMS = D.items.map((it) => Object.assign({}, it, { barcodes: (it.barcodes || [it.upc]).slice() }));
  const BY = {}; ITEMS.forEach((it) => { BY[it.sku] = it; });
  const SHOPS = D.shops.map((s) => Object.assign({}, s));
  const SHOP = {}; SHOPS.forEach((s) => { SHOP[s.code] = s; });
  const ROUTES = D.routes;
  const ROUTE = {}; ROUTES.forEach((r) => { ROUTE[r.code] = r; });
  const TIERS = D.priceTiers || { Retailer: 1, Wholesaler: 0.95, Distributor: 0.9 };
  const SCH = {}; (D.schemes || []).forEach((s) => { SCH[s.sku] = s; });
  const BAR = {};
  ITEMS.forEach((it) => { BAR[it.barcodes[0]] = { sku: it.sku, unit: 'pcs' }; if (it.barcodes[1]) BAR[it.barcodes[1]] = { sku: it.sku, unit: 'ctn' }; });
  const pk = (it) => Math.max(1, (it && it.ctn) || 1);
  const tierF = (t) => TIERS[t] || 1;
  const tierRate = (it, tier) => r2(it.wprice * tierF(tier));
  const CATI = { Packaging: ['package', ''], 'Office Supplies': ['paperclip', 'blue'], Safety: ['hard-hat', 'yellow'], Electrical: ['lightbulb', 'violet'], FMCG: ['shopping-basket', 'teal'], 'IT Accessories': ['mouse', 'red'] };
  const catIc = (it) => CATI[it.cat] || ['package', ''];
  const loose = (it) => (it.loose || 'Pcs').toLowerCase();
  function qtyStr(it, pcs, short) {
    const p = pk(it); pcs = Math.round(pcs);
    if (p === 1) return fmt(pcs, 0) + ' ' + (short ? 'pcs' : loose(it));
    const c = Math.floor(pcs / p), r = pcs % p;
    if (!c) return r + ' pcs';
    return fmt(c, 0) + ' ctn' + (r ? ' + ' + r : '');
  }
  const tierChip = (t) => `<span class="ws2-tier t-${t.toLowerCase()}">${t}${tierF(t) < 1 ? ' −' + Math.round((1 - tierF(t)) * 100) + '%' : ''}</span>`;

  /* ---------- small UI helpers ---------- */
  function busy(btn, label, ms = 1000) {
    return new Promise((res) => {
      if (!btn || btn.classList.contains('ws2-busy')) return res(false);
      const sp = btn.querySelector('span'), old = sp ? sp.textContent : '';
      btn.classList.add('ws2-busy'); btn.disabled = true;
      btn.style.setProperty('--ws2-ms', (RM() ? 10 : ms) + 'ms');
      if (sp) sp.textContent = label;
      setTimeout(() => { btn.classList.remove('ws2-busy'); btn.disabled = false; if (sp) sp.textContent = old; res(true); }, RM() ? 10 : ms);
    });
  }
  const reflow = (el, cls) => { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
  const shake = (el) => { reflow(el, 'shake'); setTimeout(() => el && el.classList.remove('shake'), 500); };
  const flashRow = (tr) => reflow(tr, 'row-flash');
  const bump = (el) => reflow(el, 'ws2-bump');
  let actx = null;
  function beep(ok) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
      o.type = 'square'; o.frequency.value = ok ? 1880 : 240;
      g.gain.setValueAtTime(0.035, t); g.gain.exponentialRampToValueAtTime(0.0001, t + (ok ? 0.09 : 0.28));
      o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + (ok ? 0.1 : 0.3));
    } catch (e) { /* audio is optional */ }
  }
  function words(n) {
    const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const two = (x) => (x < 20 ? a[x] : b[Math.floor(x / 10)] + (x % 10 ? ' ' + a[x % 10] : ''));
    const three = (x) => (x >= 100 ? a[Math.floor(x / 100)] + ' Hundred' + (x % 100 ? ' ' + two(x % 100) : '') : two(x));
    n = Math.floor(n); if (!n) return 'Zero';
    const p = [], cr = Math.floor(n / 1e7); n %= 1e7; const lk = Math.floor(n / 1e5); n %= 1e5; const th = Math.floor(n / 1e3); n %= 1e3;
    if (cr) p.push(three(cr) + ' Crore'); if (lk) p.push(two(lk) + ' Lakh'); if (th) p.push(two(th) + ' Thousand'); if (n) p.push(three(n));
    return p.join(' ');
  }

  /* ---------- generic anchored list popover (keyboard driven) ---------- */
  function Pop(cls) {
    const P = { el: null, input: null, list: [], idx: 0, pick: null, minW: 480 };
    const ensure = () => {
      if (P.el) return;
      P.el = document.createElement('div'); P.el.className = 'ws2-pop ' + cls;
      P.el.addEventListener('mousedown', (e) => { const r = e.target.closest('[data-i]'); if (!r) return; e.preventDefault(); P.choose(+r.dataset.i); });
      document.body.appendChild(P.el);
      window.addEventListener('scroll', (e) => { if (P.input && !P.el.contains(e.target)) P.place(); }, true);
      window.addEventListener('resize', () => P.close());
    };
    P.show = (input, list, html, pick, minW) => {
      ensure(); P.input = input; P.list = list; P.idx = 0; P.pick = pick; P.minW = minW || 480;
      P.el.innerHTML = html; FS.icons(P.el); P.el.classList.add('open'); P.hl(); P.place();
    };
    P.hl = () => { $$('[data-i]', P.el).forEach((r, i) => r.classList.toggle('on', i === P.idx)); const on = $('[data-i].on', P.el); if (on) on.scrollIntoView({ block: 'nearest' }); };
    P.place = () => {
      if (!P.input || !P.el.classList.contains('open')) return;
      const r = P.input.getBoundingClientRect(); if (!r.width) { P.close(); return; }
      const w = Math.min(innerWidth - 20, Math.max(r.width, P.minW)); P.el.style.width = w + 'px';
      const h = P.el.offsetHeight; let top = r.bottom + 6;
      if (top + h > innerHeight - 10 && r.top - h - 6 > 0) top = r.top - h - 6;
      P.el.style.left = Math.max(10, Math.min(r.left, innerWidth - w - 10)) + 'px'; P.el.style.top = top + 'px';
    };
    P.close = () => { if (P.el) P.el.classList.remove('open'); P.input = null; };
    P.isOpen = (input) => !!(P.el && P.el.classList.contains('open') && (!input || P.input === input));
    P.choose = (i) => { const it = P.list[i], fn = P.pick, inp = P.input; P.close(); if (fn && it != null) fn(it, inp); };
    P.key = (e, input) => {
      if (!P.isOpen(input)) return false;
      if (e.key === 'ArrowDown') { e.preventDefault(); if (P.list.length) { P.idx = (P.idx + 1) % P.list.length; P.hl(); } return true; }
      if (e.key === 'ArrowUp') { e.preventDefault(); if (P.list.length) { P.idx = (P.idx - 1 + P.list.length) % P.list.length; P.hl(); } return true; }
      if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey && input.value.trim())) { if (!P.list.length) return false; e.preventDefault(); P.choose(P.idx); return true; }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); P.close(); return true; }
      return false;
    };
    return P;
  }
  const AC = Pop('ws2-ac');
  const SP = Pop('ws2-shoppop');
  const hl = (s, q) => { if (!q) return esc(s); const i = s.toLowerCase().indexOf(q); return i < 0 ? esc(s) : esc(s.slice(0, i)) + '<mark>' + esc(s.slice(i, i + q.length)) + '</mark>' + esc(s.slice(i + q.length)); };

  function acProducts(input, q, tier, pick) {
    q = (q || '').trim().toLowerCase();
    const list = ITEMS.filter((it) => !q || (it.name + ' ' + it.sku + ' ' + it.barcodes.join(' ') + ' ' + it.brand + ' ' + it.cat).toLowerCase().includes(q)).slice(0, 8);
    const html = `<div class="ws2-pop-h"><span>Products · ${esc(tier)} rates</span><small><kbd class="kbd">↑</kbd><kbd class="kbd">↓</kbd> move <kbd class="kbd">Enter</kbd> pick <kbd class="kbd">Esc</kbd> close</small></div>` +
      (list.length ? list.map((it, i) => {
        const [ic, tone] = catIc(it), st = it.stock <= 0 ? 'out' : it.stock <= it.low ? 'low' : 'ok', rt = tierRate(it, tier), s = SCH[it.sku];
        return `<div class="ws2-ac-row" data-i="${i}"><span class="icon-well sm ${tone}"><i data-lucide="${ic}"></i></span>
          <div class="ws2-ac-main"><b>${hl(it.name, q)}</b><small>${hl(it.sku, q)} · ${esc(it.brand)} · Ctn ${pk(it)}${s ? ` · <span class="ws2-sch sm"><i data-lucide="gift"></i>${esc(s.label)}</span>` : ''}</small></div>
          <span class="ws2-ac-stock ${st}">${st === 'out' ? 'Out of stock' : qtyStr(it, it.stock)}</span>
          <div class="ws2-ac-price"><b>Rs ${fmt(rt)}<small>/${esc(loose(it))}</small></b><small>Rs ${fmt(rt * pk(it), 0)} /ctn</small></div></div>`;
      }).join('') : `<div class="ws2-pop-empty">No product matches “${esc(q)}”.</div>`);
    AC.show(input, list.map((it) => it.sku), html, pick, 560);
  }
  function acShops(input, q, pick) {
    q = (q || '').trim().toLowerCase();
    const list = SHOPS.filter((s) => !q || (s.name + ' ' + s.code + ' ' + s.area + ' ' + s.route).toLowerCase().includes(q)).slice(0, 9);
    const html = `<div class="ws2-pop-h"><span>Shops</span><small>${SHOPS.length} on 3 routes</small></div>` + (list.length ? list.map((s, i) => {
      const pct = Math.min(100, s.balance / s.limit * 100), st = pct > 100 || s.balance > s.limit ? 'over' : pct > 80 ? 'warn' : '';
      return `<div class="ws2-sp-row" data-i="${i}"><span class="avatar sm">${initials(s.name)}</span><div class="ws2-ac-main"><b>${hl(s.name, q)}</b><small>${hl(s.code, q)} · ${esc(s.area)} · ${s.route}</small></div>${tierChip(s.tier)}<div class="ws2-sp-cr ${st}"><small>Rs ${fmt(s.balance, 0)} / ${fmt(s.limit / 1000, 0)}k</small><i style="--p:${pct}%"></i></div></div>`;
    }).join('') : `<div class="ws2-pop-empty">No shop matches “${esc(q)}”.</div>`);
    SP.show(input, list.map((s) => s.code), html, pick, 460);
  }

  /* ============================================================================
     1) QUICK WHOLESALE ENTRY
     ========================================================================== */
  const E = { lines: [], uid: 0, no: 231, shop: 'SHP-004', tier: 'Distributor', mode: 'pcs', held: [], override: false, prompted: false, scan: false, net: 0, lastFocus: null, pending: null, tries: 3, saved: [] };
  const FIELDS = ['prod', 'ctn', 'pcs', 'rate', 'disc', 'gst'];
  const TPL = [
    { name: 'Weekly standard order', icon: 'calendar-sync', lines: [['FD-5001', 2, 0], ['FD-5002', 4, 0], ['FD-5003', 2, 0], ['FD-5004', 1, 6], ['PK-1003', 1, 0], ['OF-2002', 6, 0]] },
    { name: 'Ramzan pack', icon: 'moon-star', lines: [['FD-5001', 6, 0], ['FD-5002', 10, 0], ['FD-5003', 3, 12], ['FD-5004', 4, 0]] },
  ];
  function mkLine(sku, ctn, pcs, rate) {
    const it = sku ? BY[sku] : null;
    return { id: ++E.uid, sku: sku || '', ctn: ctn || 0, pcs: pcs || 0, rate: it ? (rate != null ? rate : tierRate(it, E.tier)) : 0, manual: rate != null, disc: 0, gst: it ? it.gst : 18 };
  }
  function calc(l) {
    const it = BY[l.sku];
    if (!it) return { tp: 0, gross: 0, disc: 0, gst: 0, net: 0, free: 0, sv: 0 };
    const tp = (l.ctn || 0) * pk(it) + (l.pcs || 0), gross = tp * l.rate, disc = gross * l.disc / 100, gst = (gross - disc) * l.gst / 100;
    const s = SCH[l.sku], free = s && tp >= s.buy ? Math.floor(tp / s.buy) * s.free : 0;
    return { tp, gross, disc, gst, net: gross - disc + gst, free, sv: free * l.rate };
  }
  const rateVal = (l) => (l.sku ? (E.mode === 'ctn' ? l.rate * pk(BY[l.sku]) : l.rate).toFixed(2) : '');
  function lineMeta(l) {
    const it = BY[l.sku];
    if (!it) return '<span class="ws2-meta-empty">Type to search · <kbd class="kbd">↓</kbd> browse</span>';
    const c = calc(l), need = c.tp + c.free, over = need > it.stock;
    return `<code>${it.sku}</code><span class="ws2-pk">Ctn ${pk(it)}</span><span class="ws2-stock ${over ? 'bad' : it.stock <= it.low ? 'low' : ''}" title="${fmt(it.stock, 0)} ${esc(loose(it))} on hand"><i data-lucide="${over ? 'triangle-alert' : 'box'}"></i>${over ? 'Short ' + qtyStr(it, need - it.stock) : qtyStr(it, it.stock)}</span>${l.manual ? '<span class="ws2-manual" title="Rate edited by hand">Manual rate</span>' : ''}`;
  }
  const schCell = (l) => { const s = SCH[l.sku]; if (!s) return '<span class="ws2-dash">—</span>'; const c = calc(l); return `<span class="ws2-sch${c.free ? ' on' : ''}" title="${esc(s.label)}: buy ${s.buy} get ${s.free} free"><i data-lucide="gift"></i>${esc(s.label)}</span>`; };
  function freeHtml(l) {
    const c = calc(l); if (!c.free) return '';
    const it = BY[l.sku], p = pk(it), fc = Math.floor(c.free / p), fp = c.free % p;
    return `<tr class="ws2-free" data-for="${l.id}"><td class="ws2-c-idx"><i data-lucide="corner-down-right"></i></td>
      <td class="ws2-c-prod"><div class="ws2-free-n"><span class="ws2-gift"><i data-lucide="gift"></i></span><b>${esc(it.name)}</b><span class="ws2-free-tag">Free</span></div></td>
      <td class="num" data-o="fc">${fc || '—'}</td><td class="num" data-o="fp">${fp || '—'}</td><td class="num ws2-out" data-o="ftp">${fmt(c.free, 0)}</td>
      <td class="num ws2-out">0.00</td><td><span class="ws2-sch on sm">${esc(SCH[l.sku].label)}</span></td><td class="num ws2-out">—</td><td class="num ws2-out">—</td><td class="num ws2-out">0.00</td><td></td></tr>`;
  }
  function rowHtml(l, i) {
    const it = BY[l.sku], c = calc(l);
    return `<tr class="ws2-line" data-id="${l.id}">
      <td class="ws2-c-idx">${i + 1}</td>
      <td class="ws2-c-prod"><div class="ws2-prod"><input class="cell-input" data-f="prod" value="${it ? esc(it.name) : ''}" placeholder="SKU, name or barcode…" autocomplete="off" aria-label="Product line ${i + 1}"><button class="ws2-prod-dd" tabindex="-1" aria-label="Browse products"><i data-lucide="chevron-down"></i></button></div><div class="ws2-meta">${lineMeta(l)}</div></td>
      <td><input class="cell-input num" data-f="ctn" inputmode="numeric" value="${l.ctn || ''}" placeholder="0" aria-label="Cartons"></td>
      <td><input class="cell-input num" data-f="pcs" inputmode="numeric" value="${l.pcs || ''}" placeholder="0" aria-label="Pieces"></td>
      <td class="num ws2-out ws2-tp" data-o="tp">${c.tp ? fmt(c.tp, 0) : '—'}</td>
      <td><input class="cell-input num${l.manual ? ' ws2-manual-in' : ''}" data-f="rate" inputmode="decimal" value="${rateVal(l)}" aria-label="Rate"></td>
      <td data-o="sch">${schCell(l)}</td>
      <td><input class="cell-input num" data-f="disc" inputmode="decimal" value="${l.disc || 0}" aria-label="Discount percent"></td>
      <td><input class="cell-input num" data-f="gst" inputmode="decimal" value="${l.gst}" aria-label="GST percent"></td>
      <td class="num ws2-out ws2-strong" data-o="amt">${fmt(c.net)}</td>
      <td class="ws2-c-del"><button class="ws2-del" tabindex="-1" aria-label="Delete line"><i data-lucide="trash-2"></i></button></td>
    </tr>${freeHtml(l)}`;
  }
  let ES = null; /* entry section */
  const tbody = () => $('#ws2-e-grid tbody', ES);
  const trOf = (l) => $(`tr.ws2-line[data-id="${l.id}"]`, ES);
  const lineOf = (el) => { const tr = el.closest('tr.ws2-line'); return tr ? E.lines.find((x) => x.id === +tr.dataset.id) : null; };
  function render(flash) {
    const tb = tbody();
    tb.innerHTML = E.lines.map(rowHtml).join('');
    FS.icons(tb);
    (flash || []).forEach((id, k) => { const tr = $(`tr.ws2-line[data-id="${id}"]`, tb); if (tr) setTimeout(() => { flashRow(tr); const f = tr.nextElementSibling; if (f && f.classList.contains('ws2-free')) flashRow(f); }, RM() ? 0 : k * 50); });
    totals();
  }
  function syncFree(l, tr) {
    const ex = tr.nextElementSibling && tr.nextElementSibling.classList.contains('ws2-free') ? tr.nextElementSibling : null;
    const c = calc(l);
    if (c.free) {
      if (ex) {
        const it = BY[l.sku], p = pk(it), ftp = $('[data-o=ftp]', ex), old = ftp.textContent;
        $('[data-o=fc]', ex).textContent = Math.floor(c.free / p) || '—'; $('[data-o=fp]', ex).textContent = (c.free % p) || '—';
        ftp.textContent = fmt(c.free, 0);
        if (old !== ftp.textContent) { flashRow(ex); bump($('.ws2-gift', ex)); }
      } else {
        tr.insertAdjacentHTML('afterend', freeHtml(l));
        const n = tr.nextElementSibling; FS.icons(n); n.classList.add('ws2-free-in');
        const chip = $('[data-o=sch] .ws2-sch', tr); if (chip) bump(chip);
      }
    } else if (ex) {
      ex.classList.add('ws2-free-out'); setTimeout(() => ex.remove(), RM() ? 0 : 260);
    }
  }
  function updateRow(l) {
    const tr = trOf(l); if (!tr) return;
    const c = calc(l);
    $('[data-o=tp]', tr).textContent = c.tp ? fmt(c.tp, 0) : '—';
    $('[data-o=amt]', tr).textContent = fmt(c.net);
    const meta = $('.ws2-meta', tr); meta.innerHTML = lineMeta(l);
    const sc = $('[data-o=sch]', tr); sc.innerHTML = schCell(l);
    FS.icons(meta); FS.icons(sc);
    syncFree(l, tr);
    totals();
  }
  function renumber() { $$('tr.ws2-line', tbody()).forEach((tr, i) => { $('.ws2-c-idx', tr).textContent = i + 1; }); }
  function totals() {
    let items = 0, ctn = 0, pcs = 0, gross = 0, sv = 0, disc = 0, gst = 0, net = 0;
    E.lines.forEach((l) => { if (!l.sku) return; const c = calc(l); if (!c.tp) return; items++; ctn += l.ctn; pcs += l.pcs; gross += c.gross; sv += c.sv; disc += c.disc; gst += c.gst; net += c.net; });
    const T = (k) => $(`#ws2-e-tot [data-t=${k}]`, ES);
    FS.tick(T('items'), items, { dec: 0 }); FS.tick(T('ctn'), ctn, { dec: 0 }); FS.tick(T('pcs'), pcs, { dec: 0 });
    FS.tick(T('gross'), gross, { dec: 2 }); FS.tick(T('sch'), sv, { dec: 2 }); FS.tick(T('disc'), disc, { dec: 2 }); FS.tick(T('gst'), gst, { dec: 2 });
    FS.tick(T('net'), net, { dec: 2, prefix: 'Rs ' });
    E.net = net; E.tot = { items, ctn, pcs, gross, sv, disc, gst, net };
    credit();
  }
  function creditState() {
    const s = SHOP[E.shop], bill = E.net || 0, used = s.balance + bill, pct = s.limit ? used / s.limit * 100 : 0;
    return { s, bill, used, pct, avail: s.limit - used, over: used > s.limit, warn: pct > 80 };
  }
  function credit() {
    const c = creditState(), s = c.s, box = $('#ws2-e-credit', ES);
    const V = (k) => $(`[data-c=${k}]`, box);
    FS.tick(V('limit'), s.limit, { dec: 0, prefix: 'Rs ' }); FS.tick(V('bal'), s.balance, { dec: 0, prefix: 'Rs ' });
    FS.tick(V('bill'), c.bill, { dec: 0, prefix: 'Rs ' }); FS.tick(V('avail'), c.avail, { dec: 0, prefix: 'Rs ' });
    V('od').innerHTML = s.overdueDays ? `${s.overdueDays}<small> days</small>` : '<span class="ws2-zero">None</span>';
    V('od').classList.toggle('bad', s.overdueDays > 45); V('od').classList.toggle('warn', s.overdueDays > 15 && s.overdueDays <= 45);
    const pb = Math.min(100, s.balance / s.limit * 100), pn = Math.max(0, Math.min(100 - pb, c.bill / s.limit * 100));
    $('.ws2-cb-bal', box).style.width = pb + '%'; $('.ws2-cb-bill', box).style.left = pb + '%'; $('.ws2-cb-bill', box).style.width = pn + '%';
    box.classList.toggle('warn', c.warn && !c.over); box.classList.toggle('over', c.over); box.classList.toggle('ovr', c.over && E.override);
    const st = $('#ws2-e-cstate', ES);
    st.innerHTML = c.over ? (E.override ? '<i data-lucide="shield-check"></i>Override approved' : '<i data-lucide="shield-alert"></i>Over limit · blocked') : c.warn ? '<i data-lucide="triangle-alert"></i>Near limit' : '<i data-lucide="shield-check"></i>Within limit';
    FS.icons(st);
    $('#ws2-e-cnote', ES).innerHTML = `${Math.round(c.pct)}% of limit used${c.over ? ` · over by <b>Rs ${fmt(-c.avail, 0)}</b>` : ''}${s.overdueDays > 30 ? ` · oldest invoice ${s.overdueDays} days overdue` : ''}`;
    if (c.over && !E.override && !E.prompted && E.ready) { E.prompted = true; setTimeout(() => { if (isActive(ES) && !anyOverlay() && creditState().over && !E.override) openCredit('limit'); }, 380); }
    if (!c.over) E.prompted = false;
  }
  function openCredit(why) {
    const c = creditState(), s = c.s;
    E.lastFocus = document.activeElement && ES.contains(document.activeElement) ? document.activeElement : null;
    AC.close(); SP.close();
    $('#ws2-cr-sub', ES).innerHTML = why === 'save' ? `Saving is blocked: <b>${esc(s.name)}</b> would exceed its credit limit.` : `This bill takes <b>${esc(s.name)}</b> over its credit limit.`;
    $('#ws2-cr-dl', ES).innerHTML = [
      ['Credit limit', 'Rs ' + fmt(s.limit, 0), ''], ['Outstanding', 'Rs ' + fmt(s.balance, 0), ''], ['This bill', 'Rs ' + fmt(c.bill, 0), ''],
      ['After this bill', 'Rs ' + fmt(c.used, 0), 'bad'], ['Over by', 'Rs ' + fmt(-c.avail, 0), 'bad'], ['Overdue', s.overdueDays ? s.overdueDays + ' days' : 'None', s.overdueDays > 30 ? 'bad' : ''],
    ].map(([k, v, t]) => `<div class="${t}"><span>${k}</span><b>${v}</b></div>`).join('');
    const pin = $('#ws2-cr-pin', ES); pin.value = ''; E.tries = 3; pinDots();
    const h = $('#ws2-cr-hint', ES); h.classList.remove('bad'); h.textContent = 'Ask Faisal Qureshi (Operations Head) · demo PIN 1234';
    E.pending = why === 'save' ? E.pending : null;
    FS.openModal('ws2-m-credit');
    setTimeout(() => pin.focus(), 120);
  }
  function pinDots() { const v = $('#ws2-cr-pin', ES).value; $$('.ws2-pindots i', ES).forEach((d, i) => d.classList.toggle('on', i < v.length)); }
  function pinCheck() {
    const pin = $('#ws2-cr-pin', ES), h = $('#ws2-cr-hint', ES);
    if (pin.value === '1234') {
      E.override = true;
      const m = $('#ws2-m-credit .modal', ES); m.classList.add('ws2-ok');
      setTimeout(() => {
        FS.closeOverlay($('#ws2-m-credit', ES)); m.classList.remove('ws2-ok');
        credit(); FS.toast(`Credit override approved by Faisal Qureshi for ${esc(SHOP[E.shop].name)}`, { tone: 'good' });
        const p = E.pending; E.pending = null;
        if (p) save(p === 'print'); else if (E.lastFocus) E.lastFocus.focus();
      }, RM() ? 0 : 520);
      return;
    }
    E.tries--;
    shake($('.ws2-pinbox', ES)); pin.value = ''; pinDots();
    h.classList.add('bad');
    h.textContent = E.tries > 0 ? `Wrong PIN · ${E.tries} ${E.tries === 1 ? 'try' : 'tries'} left` : 'Too many attempts · request logged for review';
    if (E.tries <= 0) { pin.disabled = true; setTimeout(() => { pin.disabled = false; E.tries = 3; }, 4000); }
  }

  function setShop(code, animate) {
    const s = SHOP[code]; if (!s) return;
    E.shop = code; E.override = false; E.prompted = false;
    const prevTier = E.tier; E.tier = s.tier;
    const r = ROUTE[s.route];
    $('#ws2-e-route', ES).value = s.route;
    $('#ws2-e-sman', ES).value = r.salesman;
    $('#ws2-e-shopq', ES).value = '';
    $('#ws2-e-shopq', ES).placeholder = s.name + ' · search another shop…';
    renderShopCard(animate);
    if (prevTier !== E.tier) applyTier(animate);
    totals();
  }
  function renderShopCard(animate) {
    const s = SHOP[E.shop], r = ROUTE[s.route], card = $('#ws2-e-shopcard', ES);
    card.innerHTML = `<span class="avatar lg">${initials(s.name)}</span>
      <div class="ws2-sc-main"><b>${esc(s.name)}</b><small>${s.code} · ${esc(s.area)} · ${s.route} ${esc(r.name)}</small><small><i data-lucide="phone"></i>${esc(s.phone)}</small></div>
      <button class="ws2-tierbtn" id="ws2-e-tier" title="Price tier: rates follow the shop category">${tierChip(E.tier)}<i data-lucide="chevron-down"></i></button>`;
    FS.icons(card);
    if (animate) reflow(card, 'ws2-swap');
  }
  function applyTier(animate) {
    E.lines.forEach((l) => { if (l.sku && !l.manual) l.rate = tierRate(BY[l.sku], E.tier); });
    E.lines.forEach((l) => {
      const tr = trOf(l); if (!tr) return;
      const ri = $('[data-f=rate]', tr); if (document.activeElement !== ri) ri.value = rateVal(l);
      if (animate && l.sku && !l.manual) bump(ri);
      updateRow(l);
    });
  }
  function addRow(sku, focus, after) {
    const l = mkLine(sku, sku ? 0 : 0, 0);
    if (after) E.lines.splice(E.lines.indexOf(after) + 1, 0, l); else E.lines.push(l);
    render([l.id]);
    const tr = trOf(l);
    if (tr && focus) { focusF(tr, focus); tr.scrollIntoView({ block: 'nearest', behavior: RM() ? 'auto' : 'smooth' }); }
    return l;
  }
  function focusF(tr, f) { const el = $(`[data-f=${f}]`, tr); if (el) { el.focus(); if (el.select) el.select(); } }
  const nextLineTr = (tr) => { let n = tr.nextElementSibling; while (n && !n.classList.contains('ws2-line')) n = n.nextElementSibling; return n; };
  const prevLineTr = (tr) => { let n = tr.previousElementSibling; while (n && !n.classList.contains('ws2-line')) n = n.previousElementSibling; return n; };
  function focusNext(el, add) {
    const tr = el.closest('tr'), k = FIELDS.indexOf(el.dataset.f);
    if (k < FIELDS.length - 1) { focusF(tr, FIELDS[k + 1]); return; }
    const nx = nextLineTr(tr);
    if (nx) { focusF(nx, 'prod'); return; }
    if (add) addRow(null, 'prod');
  }
  function pickInto(l, sku) {
    const it = BY[sku];
    l.sku = sku; l.rate = tierRate(it, E.tier); l.manual = false; l.gst = it.gst;
    if (!l.ctn && !l.pcs) l.ctn = 1;
    const tr = trOf(l);
    const tmp = document.createElement('tbody'); tmp.innerHTML = rowHtml(l, E.lines.indexOf(l));
    const ex = tr.nextElementSibling && tr.nextElementSibling.classList.contains('ws2-free') ? tr.nextElementSibling : null;
    if (ex) ex.remove();
    const rows = Array.from(tmp.children); tr.replaceWith(...rows); rows.forEach((r) => { FS.icons(r); flashRow(r); });
    if (it.stock <= 0) FS.toast(`${esc(it.name)} is out of stock · line will go to back-order`, { tone: 'warn' });
    totals();
    focusF(rows[0], 'ctn');
  }
  function normalise(l, quiet) {
    const it = BY[l.sku]; if (!it) return false;
    const p = pk(it); if (p <= 1 || l.pcs < p) return false;
    const add = Math.floor(l.pcs / p); l.ctn += add; l.pcs -= add * p;
    if (!quiet) FS.toast(`${add * p + l.pcs} pcs rolled into ${add} ctn + ${l.pcs} pcs (pack of ${p})`, { tone: 'info', ms: 2200 });
    return true;
  }
  function delLine(l, focusField) {
    const tr = trOf(l); if (!tr) return;
    const idx = E.lines.indexOf(l);
    const ex = tr.nextElementSibling && tr.nextElementSibling.classList.contains('ws2-free') ? tr.nextElementSibling : null;
    tr.classList.add('row-out'); if (ex) ex.classList.add('row-out');
    setTimeout(() => {
      E.lines.splice(idx, 1);
      if (!E.lines.length) E.lines.push(mkLine());
      render();
      const t = $$('tr.ws2-line', tbody())[Math.min(idx, E.lines.length - 1)];
      if (focusField && t) focusF(t, focusField);
      if (l.sku) FS.toast(`Removed ${esc(BY[l.sku].name)}`, { undo: () => { E.lines.splice(Math.min(idx, E.lines.length), 0, l); render([l.id]); } });
    }, RM() ? 0 : 280);
  }
  function dupLine(l, field) {
    if (!l.sku) return;
    const n = Object.assign({}, l, { id: ++E.uid });
    E.lines.splice(E.lines.indexOf(l) + 1, 0, n);
    render([n.id]);
    focusF(trOf(n), field || 'ctn');
    FS.toast(`Line duplicated · ${esc(BY[l.sku].name)}`, { tone: 'info', ms: 1600 });
  }
  /* merge quantities into the bill: same sku adds up, otherwise a blank row is reused or a row is appended */
  function mergeLines(arr) {
    const ids = [];
    arr.forEach(([sku, ctn, pcs, rate]) => {
      if (!BY[sku]) return;
      let l = E.lines.find((x) => x.sku === sku);
      if (l) { l.ctn += ctn || 0; l.pcs += pcs || 0; if (rate != null) { l.rate = rate; l.manual = true; } }
      else {
        l = E.lines.find((x) => !x.sku);
        if (l) { const n = mkLine(sku, ctn, pcs, rate); n.id = l.id; Object.assign(l, n); }
        else { l = mkLine(sku, ctn, pcs, rate); E.lines.push(l); }
      }
      normalise(l, true);
      ids.push(l.id);
    });
    if (!E.lines.some((x) => !x.sku)) E.lines.push(mkLine());
    render(ids);
    return ids.length;
  }
  function snapshot() {
    const s = SHOP[E.shop];
    return { no: 'WS-2026-' + String(E.no).padStart(6, '0'), shop: s, route: ROUTE[s.route], sman: $('#ws2-e-sman', ES).value, tier: E.tier, lines: E.lines.filter((l) => l.sku && calc(l).tp).map((l) => Object.assign({}, l, { c: calc(l) })), tot: Object.assign({}, E.tot) };
  }
  function paperHtml(sn) {
    const t = sn.tot;
    return `<div class="paper ws2-paper">
      <div class="paper-head"><div><h2>${esc(D.company.name)}</h2><p class="ws2-pmuted">${esc(D.company.address)}<br>NTN ${D.company.ntn} · STRN ${D.company.strn} · ${esc(D.company.phone)}</p></div>
      <div class="doc-title"><h2>Wholesale Tax Invoice</h2><b>${sn.no}</b><p class="ws2-pmuted">01 Oct 2026 · ${sn.route.code} ${esc(sn.route.name)}</p></div></div>
      <div class="paper-meta">
        <div><small>Bill to</small><b>${esc(sn.shop.name)}</b><div class="ws2-pmuted">${sn.shop.code} · ${esc(sn.shop.area)}, Lahore<br>${esc(sn.shop.phone)}</div></div>
        <div><small>Price tier</small><b>${sn.tier}</b><div class="ws2-pmuted">Rates ×${tierF(sn.tier).toFixed(2)}</div></div>
        <div><small>Terms</small><b>Credit 15 days</b><div class="ws2-pmuted">Due 16 Oct 2026</div></div>
        <div><small>Salesman</small><b>${esc(sn.sman)}</b><div class="ws2-pmuted">Van ${sn.route.van} · ${esc(sn.route.driver)}</div></div>
      </div>
      <table class="tbl" data-plain><thead><tr><th>#</th><th>Item</th><th class="num">CTN</th><th class="num">PCS</th><th class="num">Total</th><th class="num">Rate</th><th class="num">Disc</th><th class="num">GST</th><th class="num">Amount</th></tr></thead><tbody>
      ${sn.lines.map((l, i) => { const it = BY[l.sku]; return `<tr><td>${i + 1}</td><td><b>${esc(it.name)}</b><small>${it.sku} · Ctn ${pk(it)}</small></td><td class="num">${l.ctn || '—'}</td><td class="num">${l.pcs || '—'}</td><td class="num">${fmt(l.c.tp, 0)}</td><td class="num">${fmt(l.rate)}</td><td class="num">${l.disc}%</td><td class="num">${fmt(l.c.gst)}</td><td class="num"><b>${fmt(l.c.net)}</b></td></tr>${l.c.free ? `<tr class="ws2-pfree"><td></td><td>↳ ${esc(it.name)} <em>FREE · ${esc(SCH[l.sku].label)}</em></td><td></td><td></td><td class="num">${l.c.free}</td><td class="num">0.00</td><td></td><td></td><td class="num">0.00</td></tr>` : ''}`; }).join('')}
      </tbody></table>
      <div class="ws2-paper-bot"><div class="ws2-pmuted">Scheme value given: <b>Rs ${fmt(t.sv || 0)}</b><br>Goods once sold are returnable within 7 days with invoice.</div>
        <div class="paper-totals"><div><span>Gross amount</span><b>${fmt(t.gross || 0)}</b></div><div><span>Discount</span><b>− ${fmt(t.disc || 0)}</b></div><div><span>Sales tax (GST)</span><b>${fmt(t.gst || 0)}</b></div><div class="grand"><span>Net payable</span><span>${money(t.net || 0)}</span></div></div></div>
      <div class="paper-foot"><span><b>Amount in words:</b> Rupees ${words(t.net || 0)} Only</span><span>Prepared by Sana Javed · Received by ____________</span></div>
    </div>`;
  }
  function printDrawer(sn) {
    const d = FS.drawer({ title: 'Print preview', subtitle: `${sn.no} · A4 portrait · 2 copies`, wide: true, html: paperHtml(sn), foot: '<button class="btn secondary" data-close>Close</button><button class="btn secondary" data-ws2="pdf"><i data-lucide="download"></i>PDF</button><button class="btn primary" data-ws2="print"><i data-lucide="printer"></i>Print</button>' });
    d.style.width = 'min(900px,100vw)';
    d.addEventListener('click', (e) => { const b = e.target.closest('[data-ws2]'); if (!b) return; FS.toast(b.dataset.ws2 === 'print' ? 'Sent to Counter printer · 2 copies' : `PDF saved · ${sn.no}.pdf`); });
  }
  function whatsapp() {
    const sn = snapshot();
    if (!sn.lines.length) { FS.toast('Add lines before sharing the invoice', { tone: 'warn' }); return; }
    const txt = sn.lines.slice(0, 6).map((l) => `• ${esc(BY[l.sku].name)}: ${l.ctn ? l.ctn + ' ctn' : ''}${l.ctn && l.pcs ? ' + ' : ''}${l.pcs ? l.pcs + ' pcs' : ''}${l.c.free ? ` <i>(+${l.c.free} free)</i>` : ''}`).join('<br>') + (sn.lines.length > 6 ? `<br>…and ${sn.lines.length - 6} more` : '');
    const sh = FS.sheet({ title: 'Share invoice on WhatsApp', subtitle: `To ${esc(sn.shop.name)} · ${esc(sn.shop.phone)}`,
      html: `<div class="ws2-wa"><div class="ws2-wa-top"><span class="avatar sm">${initials(sn.shop.name)}</span><div><b>${esc(sn.shop.name)}</b><small>online</small></div><i data-lucide="phone"></i></div>
        <div class="ws2-wa-body"><div class="ws2-wa-file"><span><i data-lucide="file-text"></i></span><div><b>${sn.no}.pdf</b><small>1 page · PDF · 84 KB</small></div></div>
        <div class="ws2-wa-msg">Assalam o Alaikum! Your invoice <b>${sn.no}</b> from ${esc(D.company.short)}:<br><br>${txt}<br><br><b>Net payable: Rs ${fmt(sn.tot.net, 0)}</b><br>Due 16 Oct 2026. Pay via Meezan 0123 or JazzCash.<span class="ws2-wa-time">11:42 <i data-lucide="check-check"></i></span></div></div></div>`,
      foot: '<button class="btn secondary" data-close>Cancel</button><button class="btn primary ws2-progress-btn" data-ws2="send"><i data-lucide="send"></i><span>Send</span><em></em></button>' });
    sh.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-ws2=send]'); if (!b) return;
      await busy(b, 'Sending…', 900);
      FS.celebrate(b, 'Sent'); FS.closeOverlay(sh.closest('.overlay'));
      FS.toast(`Invoice sent to ${esc(sn.shop.name)} on WhatsApp`, { tone: 'good' });
    });
  }
  async function save(print) {
    const sn = snapshot();
    if (!sn.lines.length) { FS.toast('Add at least one line with a quantity before saving', { tone: 'warn' }); shake($('#ws2-e-gridcard', ES)); return; }
    if (creditState().over && !E.override) { E.pending = print ? 'print' : 'save'; openCredit('save'); return; }
    const btn = $(print ? '#ws2-e-saveprint' : '#ws2-e-save', ES);
    const ok = await busy(btn, 'Saving…', 900); if (!ok) return;
    FS.celebrate(btn, 'Saved');
    SHOP[E.shop].balance += sn.tot.net;
    E.saved.push(sn);
    FS.toast(`${sn.no} saved · ${esc(sn.shop.name)} · Rs ${fmt(sn.tot.net, 0)}`, { tone: 'good', action: print ? null : { label: 'Print', fn: () => printDrawer(sn) } });
    if (print) printDrawer(sn);
    E.no++; E.override = false; E.prompted = false;
    $('#ws2-e-no', ES).textContent = 'WS-2026-' + String(E.no).padStart(6, '0'); bump($('#ws2-e-no', ES));
    E.lines = [mkLine()]; render();
    setTimeout(() => focusF($('tr.ws2-line', tbody()), 'prod'), 60);
  }
  function hold() {
    const filled = E.lines.filter((l) => l.sku);
    if (!filled.length) { FS.toast('Nothing to hold: the bill is empty', { tone: 'warn' }); return; }
    E.held.unshift({ no: 'WS-2026-' + String(E.no).padStart(6, '0'), shop: E.shop, at: '11:' + String(20 + E.held.length * 7).padStart(2, '0'), lines: E.lines.map((l) => Object.assign({}, l)) });
    E.lines = [mkLine()]; render();
    const n = $('#ws2-e-heldn', ES); n.textContent = E.held.length; bump(n);
    FS.toast('Bill parked · recall it any time', { tone: 'info' });
  }
  function recall(anchor) {
    if (!E.held.length) { FS.toast('No parked bills', { tone: 'info' }); return; }
    FS.menu(anchor, E.held.map((h, i) => {
      const net = h.lines.reduce((a, l) => a + calc(l).net, 0);
      return { icon: 'file-clock', label: `<span class="ws2-mi"><b>${esc(SHOP[h.shop].name)}</b><small>${h.lines.filter((l) => l.sku).length} lines · Rs ${fmt(net, 0)} · parked ${h.at}</small></span>`, onClick: () => {
        const b = E.held.splice(i, 1)[0];
        if (E.lines.some((l) => l.sku)) E.held.push({ no: '', shop: E.shop, at: 'now', lines: E.lines.map((l) => Object.assign({}, l)) });
        setShop(b.shop, true); E.lines = b.lines; render(E.lines.map((l) => l.id));
        $('#ws2-e-heldn', ES).textContent = E.held.length;
        FS.toast(`Recalled bill for ${esc(SHOP[b.shop].name)}`, { tone: 'good' });
      } };
    }));
  }
  function lastOrder(code) {
    const h = hash(code), pool = ['FD-5001', 'FD-5002', 'FD-5003', 'FD-5004', 'PK-1001', 'PK-1003', 'OF-2002', 'OF-2003', 'IN-3001', 'EL-4001'];
    const out = [], n = 4 + (h % 3);
    for (let k = 0; out.length < n && k < 20; k++) { const sku = pool[(h >>> k) % pool.length]; if (!out.some((x) => x[0] === sku)) out.push([sku, 1 + ((h >>> (k + 3)) % 5), (h >>> k) % 3 === 0 ? 6 : 0]); }
    return out;
  }
  async function fillAnimated(arr, label) {
    E.lines = []; render();
    for (let i = 0; i < arr.length; i++) {
      const [sku, c, p] = arr[i]; const l = mkLine(sku, c, p); E.lines.push(l);
      tbody().insertAdjacentHTML('beforeend', rowHtml(l, i));
      const tr = trOf(l); FS.icons(tr); tr.classList.add('ws2-fill-in'); if (tr.nextElementSibling) FS.icons(tr.nextElementSibling);
      totals();
      await wait(110);
    }
    E.lines.push(mkLine()); tbody().insertAdjacentHTML('beforeend', rowHtml(E.lines[E.lines.length - 1], E.lines.length - 1)); FS.icons(tbody());
    FS.toast(label, { tone: 'good' });
  }
  async function repeatLast() {
    const s = SHOP[E.shop], arr = lastOrder(E.shop);
    if (E.lines.some((l) => l.sku)) { const ok = await FS.confirm({ title: 'Replace current lines?', text: `Load ${esc(s.name)}'s last order (${arr.length} lines, 24 Sep 2026) in place of the current bill.`, okLabel: 'Replace', icon: 'history' }); if (!ok) return; }
    fillAnimated(arr, `Repeated last order for ${esc(s.name)} · ${arr.length} lines`);
  }
  function templates(anchor) {
    FS.menu(anchor, [...TPL.map((t) => ({ icon: t.icon, label: `<span class="ws2-mi"><b>${esc(t.name)}</b><small>${t.lines.length} lines · ${t.lines.reduce((a, x) => a + x[1], 0)} ctn</small></span>`, onClick: () => { const n = mergeLines(t.lines.map((x) => x.slice())); FS.toast(`Template “${esc(t.name)}” applied · ${n} lines`, { tone: 'good' }); } })),
      { sep: true }, { icon: 'bookmark-plus', label: 'Save current as template…', onClick: saveTemplate }]);
  }
  function saveTemplate() {
    const lines = E.lines.filter((l) => l.sku && calc(l).tp);
    if (!lines.length) { FS.toast('Add lines first, then save them as a template', { tone: 'warn' }); return; }
    const sh = FS.sheet({ title: 'Save as template', subtitle: `${lines.length} lines will be saved with their CTN / PCS`, html: `<label class="ws2-fld ws2-full"><span>Template name</span><input id="ws2-tpl-name" value="${esc(SHOP[E.shop].name)} · weekly"></label><div class="ws2-tpl-prev">${lines.map((l) => `<span class="pill"><i data-lucide="package"></i>${esc(BY[l.sku].name)} <b>${l.ctn}/${l.pcs}</b></span>`).join('')}</div>`, foot: '<button class="btn secondary" data-close>Cancel</button><button class="btn primary" data-ws2="tpl"><i data-lucide="bookmark-plus"></i>Save template</button>' });
    setTimeout(() => { const i = $('#ws2-tpl-name'); if (i) { i.focus(); i.select(); } }, 200);
    const go = () => { const name = ($('#ws2-tpl-name').value || 'My template').trim(); TPL.push({ name, icon: 'bookmark', lines: lines.map((l) => [l.sku, l.ctn, l.pcs]) }); FS.closeOverlay(sh.closest('.overlay')); FS.toast(`Template “${esc(name)}” saved`, { tone: 'good' }); };
    sh.addEventListener('click', (e) => { if (e.target.closest('[data-ws2=tpl]')) go(); });
    sh.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'ws2-tpl-name') { e.preventDefault(); go(); } });
  }

  /* ---- scan mode ---- */
  function setScan(on) {
    E.scan = on;
    const b = $('#ws2-e-scan', ES); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on);
    const bar = $('#ws2-e-scanbar', ES); bar.hidden = !on;
    if (on) { reflow(bar, 'ws2-drop'); setTimeout(() => $('#ws2-e-scanin', ES).focus(), 40); }
  }
  function processScan(code) {
    code = String(code || '').trim(); if (!code) return;
    const bar = $('#ws2-e-scanbar', ES), last = $('#ws2-e-scanlast', ES);
    const m = BAR[code] || (BY[code.toUpperCase()] ? { sku: code.toUpperCase(), unit: 'pcs' } : null);
    if (!m) { beep(false); reflow(bar, 'ws2-beep-bad'); last.className = 'ws2-scan-last bad'; last.innerHTML = `<i data-lucide="circle-x"></i>Unknown barcode <code>${esc(code)}</code>`; FS.icons(last); return; }
    const it = BY[m.sku];
    let l = E.lines.find((x) => x.sku === m.sku), fresh = false;
    if (!l) { l = E.lines.find((x) => !x.sku); if (l) Object.assign(l, mkLine(m.sku, 0, 0), { id: l.id }); else { l = mkLine(m.sku, 0, 0); E.lines.push(l); } fresh = true; }
    if (m.unit === 'ctn') l.ctn += 1; else { l.pcs += 1; normalise(l, true); }
    if (!E.lines.some((x) => !x.sku)) E.lines.push(mkLine());
    if (fresh) render([l.id]); else {
      const tr = trOf(l); $('[data-f=ctn]', tr).value = l.ctn || ''; $('[data-f=pcs]', tr).value = l.pcs || '';
      updateRow(l); flashRow(tr); bump($(m.unit === 'ctn' ? '[data-f=ctn]' : '[data-f=pcs]', tr));
    }
    beep(true); reflow(bar, 'ws2-beep');
    last.className = 'ws2-scan-last ok';
    last.innerHTML = `<i data-lucide="${m.unit === 'ctn' ? 'package' : 'scan-barcode'}"></i><b>${esc(it.name)}</b><span class="ws2-plus">+1 ${m.unit === 'ctn' ? 'CTN' : 'PCS'}</span><small>now ${qtyStr(it, calc(l).tp)}</small>`;
    FS.icons(last); reflow(last, 'ws2-bump');
    const tr = trOf(l); if (tr) tr.scrollIntoView({ block: 'nearest' });
  }

  /* ---- Add many ---- */
  const MANY = { sel: {}, q: '', cat: 'All' };
  function manyOpen() {
    MANY.sel = {}; MANY.q = ''; MANY.cat = 'All';
    const cats = ['All', ...new Set(ITEMS.map((i) => i.cat))];
    $('#ws2-many-cats', ES).innerHTML = cats.map((c, i) => `<button class="${i ? '' : 'active'}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
    $('#ws2-many-q', ES).value = '';
    manyRender(); FS.openModal('ws2-m-many');
    setTimeout(() => $('#ws2-many-q', ES).focus(), 120);
  }
  function manyRender() {
    const q = MANY.q.toLowerCase();
    const list = ITEMS.filter((it) => (MANY.cat === 'All' || it.cat === MANY.cat) && (!q || (it.name + ' ' + it.sku + ' ' + it.brand + ' ' + it.cat).toLowerCase().includes(q)));
    $('#ws2-many-list', ES).innerHTML = list.length ? list.map((it, i) => {
      const s = MANY.sel[it.sku], [ic, tone] = catIc(it), st = it.stock <= 0 ? 'out' : it.stock <= it.low ? 'low' : 'ok';
      return `<label class="ws2-many-row${s ? ' on' : ''}" data-sku="${it.sku}" style="--i:${i}"><input type="checkbox"${s ? ' checked' : ''} aria-label="Select ${esc(it.name)}"><span class="icon-well sm ${tone}"><i data-lucide="${ic}"></i></span>
        <div class="ws2-ac-main"><b>${esc(it.name)}</b><small>${it.sku} · Ctn ${pk(it)} · Rs ${fmt(tierRate(it, E.tier))}/${esc(loose(it))}${SCH[it.sku] ? ` · <span class="ws2-sch sm on"><i data-lucide="gift"></i>${esc(SCH[it.sku].label)}</span>` : ''}</small></div>
        <span class="ws2-ac-stock ${st}">${st === 'out' ? 'Out' : qtyStr(it, it.stock)}</span>
        <span class="ws2-many-q"><input class="cell-input num" data-q="ctn" inputmode="numeric" placeholder="CTN" value="${s && s.ctn ? s.ctn : ''}"><input class="cell-input num" data-q="pcs" inputmode="numeric" placeholder="PCS" value="${s && s.pcs ? s.pcs : ''}"></span></label>`;
    }).join('') : '<div class="ws2-pop-empty">No products match.</div>';
    FS.icons($('#ws2-many-list', ES));
    manySum();
  }
  function manySum() {
    const keys = Object.keys(MANY.sel), n = keys.length;
    let ctn = 0, pcs = 0, amt = 0;
    keys.forEach((k) => { const s = MANY.sel[k], it = BY[k]; ctn += s.ctn; pcs += s.pcs; amt += (s.ctn * pk(it) + s.pcs) * tierRate(it, E.tier) * (1 + it.gst / 100); });
    $('#ws2-many-sum', ES).innerHTML = n ? `<b>${n}</b> selected · ${ctn} ctn + ${pcs} pcs · <b>Rs ${fmt(amt, 0)}</b>` : 'Nothing selected';
    const go = $('#ws2-many-go', ES); go.disabled = !n; $('span', go).textContent = n ? `Add ${n} item${n > 1 ? 's' : ''}` : 'Add items';
  }

  /* ---- Paste from Excel ---- */
  const PASTE = { rows: [] };
  function matchCode(code) {
    const c = String(code || '').trim(); if (!c) return null;
    if (BY[c.toUpperCase()]) return c.toUpperCase();
    if (BAR[c]) return BAR[c].sku;
    const lc = c.toLowerCase(); if (lc.length < 4) return null;
    const hit = ITEMS.find((it) => it.name.toLowerCase().includes(lc) || lc.includes(it.name.toLowerCase()));
    return hit ? hit.sku : null;
  }
  function pasteParse() {
    const raw = $('#ws2-paste-ta', ES).value;
    PASTE.rows = raw.split(/\r?\n/).map((ln) => ln.trim()).filter(Boolean).map((ln) => ln.split(/\t|;|,/).map((x) => x.trim()))
      .filter((c, i) => !(i === 0 && /sku|barcode|code|item/i.test(c[0]) && !num(c[1])))
      .map((c) => ({ code: c[0], ctn: Math.max(0, Math.round(num(c[1]))), pcs: Math.max(0, Math.round(num(c[2]))), rate: c[3] ? num(c[3]) : null, sku: matchCode(c[0]), fixed: false }));
    pasteRender();
  }
  function pasteRender() {
    const R = PASTE.rows, ok = R.filter((r) => r.sku).length, bad = R.length - ok;
    $('#ws2-paste-stats', ES).innerHTML = R.length ? `<span class="pill"><i data-lucide="rows-3"></i><b>${R.length}</b> rows</span><span class="pill ws2-p-ok"><i data-lucide="circle-check"></i><b>${ok}</b> matched</span>${bad ? `<span class="pill ws2-p-bad"><i data-lucide="circle-x"></i><b>${bad}</b> need a fix</span>` : ''}` : '<span class="ws2-muted">Paste rows on the left or load the sample.</span>';
    const opts = (sel) => '<option value="">Choose product…</option>' + ITEMS.map((it) => `<option value="${it.sku}"${it.sku === sel ? ' selected' : ''}>${esc(it.sku)} · ${esc(it.name)}</option>`).join('');
    $('#ws2-paste-prev', ES).innerHTML = R.length ? `<table class="tbl ws2-ptbl" data-plain><thead><tr><th></th><th>Pasted</th><th>Product</th><th class="num">CTN</th><th class="num">PCS</th><th class="num">Rate /pc</th><th class="num">Amount</th></tr></thead><tbody>${R.map((r, i) => {
      const it = r.sku ? BY[r.sku] : null, rate = it ? (r.rate != null ? r.rate : tierRate(it, E.tier)) : 0, amt = it ? (r.ctn * pk(it) + r.pcs) * rate : 0;
      return `<tr class="${it ? 'ok' : 'bad'}${r.fixed ? ' fixed' : ''}" data-i="${i}" style="--i:${i}"><td><span class="ws2-pst">${it ? '<i data-lucide="check"></i>' : '<i data-lucide="x"></i>'}</span></td><td><code class="ws2-code">${esc(r.code)}</code></td>
        <td>${it && !r.fixed ? `<b>${esc(it.name)}</b><small>${it.sku} · Ctn ${pk(it)}</small>` : `<select class="cell-input ws2-pfix" aria-label="Fix product">${opts(r.sku)}</select>`}</td>
        <td class="num">${r.ctn || '—'}</td><td class="num">${r.pcs || '—'}</td><td class="num">${it ? fmt(rate) : '—'}${r.rate != null && it ? '<small>pasted</small>' : ''}</td><td class="num"><b>${it ? fmt(amt) : '—'}</b></td></tr>`;
    }).join('')}</tbody></table>` : '<div class="ws2-paste-empty"><i data-lucide="table-2"></i><b>Preview appears here</b><small>Green rows are matched, red rows need a product picked.</small></div>';
    FS.icons($('#ws2-paste-prev', ES)); FS.icons($('#ws2-paste-stats', ES));
    const go = $('#ws2-paste-go', ES); go.disabled = !ok; $('span', go).textContent = ok ? `Insert ${ok} line${ok > 1 ? 's' : ''}` : 'Insert lines';
  }
  function pasteSample() {
    const cb = (s) => BY[s].barcodes[1];
    return ['SKU / Barcode\tCTN\tPCS\tRate', 'FD-5001\t3\t0\t', `${BY['FD-5002'].upc}\t4\t6\t`, 'FD-5003\t2\t12\t', `${cb('FD-5004')}\t1\t0\t`, 'PK-1003\t1\t0\t128', 'TP-9000\t2\t0\t', 'OF-2002\t5\t0\t', 'Lipton Yellow Label 190g\t3\t0\t', 'in-3001\t1\t4\t'].join('\n');
  }

  function mountEntry(sec) {
    liftOverlays(sec);
    ES = sec;
    $('#ws2-e-route', sec).innerHTML = ROUTES.map((r) => `<option value="${r.code}">${r.code} · ${esc(r.name)}</option>`).join('');
    const people = [...new Set([...D.salesTeam.salesmen, ...D.salesTeam.bookers, ...ROUTES.map((r) => r.salesman)])];
    $('#ws2-e-sman', sec).innerHTML = people.map((p) => `<option>${esc(p)}</option>`).join('');
    $('#ws2-e-wh', sec).innerHTML = D.warehouses.map((w) => `<option>${esc(w)}</option>`).join('');
    $('#ws2-e-scandemo', sec).innerHTML = '<small>Try:</small>' + [['FD-5001', 0, 'Shan pc'], ['FD-5001', 1, 'Shan ctn'], ['FD-5003', 0, 'Dettol pc'], ['FD-5002', 0, 'Tapal pc']].map(([s, k, t]) => `<button class="ws2-demo" data-code="${BY[s].barcodes[k]}" title="${BY[s].barcodes[k]}"><i data-lucide="${k ? 'package' : 'barcode'}"></i>${t}</button>`).join('');
    E.held = [{ no: 'WS-2026-000229', shop: 'SHP-008', at: '10:52', lines: [mkLine('FD-5002', 3, 0), mkLine('FD-5003', 1, 0), mkLine()] }];
    E.lines = [mkLine('FD-5001', 2, 0), mkLine('FD-5002', 5, 6), mkLine('PK-1003', 1, 0), mkLine()];
    setShop(E.shop, false);
    render();
    E.ready = true;

    const tb = tbody();
    tb.addEventListener('input', (e) => {
      const el = e.target, f = el.dataset.f; if (!f) return;
      const l = lineOf(el); if (!l) return;
      if (f === 'prod') { el.dataset.acq = el.value; acProducts(el, el.value, E.tier, (sku) => pickInto(l, sku)); return; }
      if (!l.sku) return;
      if (f === 'ctn') l.ctn = Math.max(0, Math.round(num(el.value)));
      if (f === 'pcs') l.pcs = Math.max(0, Math.round(num(el.value)));
      if (f === 'rate') { const v = num(el.value); l.rate = E.mode === 'ctn' ? v / pk(BY[l.sku]) : v; l.manual = true; el.classList.add('ws2-manual-in'); }
      if (f === 'disc') l.disc = Math.min(100, Math.max(0, num(el.value)));
      if (f === 'gst') l.gst = Math.min(100, Math.max(0, num(el.value)));
      updateRow(l);
    });
    tb.addEventListener('focusin', (e) => { if (e.target.dataset && e.target.dataset.f) { E.lastFocus = e.target; setTimeout(() => e.target.select && e.target.select(), 0); } });
    tb.addEventListener('focusout', (e) => {
      const el = e.target, f = el.dataset && el.dataset.f; if (!f) return;
      const l = lineOf(el); if (!l) return;
      if (f === 'prod') setTimeout(() => { if (AC.input === el) AC.close(); if (l.sku && el.isConnected) el.value = BY[l.sku].name; }, 140);
      if (f === 'pcs' && normalise(l)) { const tr = trOf(l); $('[data-f=ctn]', tr).value = l.ctn || ''; el.value = l.pcs || ''; bump($('[data-f=ctn]', tr)); updateRow(l); }
      if (f === 'rate' && l.sku) el.value = rateVal(l);
    });
    tb.addEventListener('keydown', (e) => {
      const el = e.target, f = el.dataset && el.dataset.f; if (!f) return;
      const l = lineOf(el); if (!l) return;
      const tr = el.closest('tr');
      if (f === 'prod') {
        if (AC.key(e, el)) return;
        if (e.key === 'ArrowDown' && !e.ctrlKey) { e.preventDefault(); acProducts(el, '', E.tier, (sku) => pickInto(l, sku)); return; }
        if (e.key === 'Enter' && !l.sku) { e.preventDefault(); acProducts(el, el.value, E.tier, (sku) => pickInto(l, sku)); return; }
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) { e.preventDefault(); dupLine(l, f === 'prod' ? 'ctn' : f); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Delete') { e.preventDefault(); delLine(l, f); return; }
      if (f !== 'prod' && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && !e.altKey) {
        e.preventDefault(); const t = e.key === 'ArrowDown' ? nextLineTr(tr) : prevLineTr(tr); if (t) focusF(t, f); return;
      }
      if ((e.key === 'Enter' && !e.ctrlKey && !e.altKey) || (e.key === 'Tab' && !e.shiftKey)) {
        e.preventDefault();
        if (f === 'pcs' && normalise(l)) { $('[data-f=ctn]', tr).value = l.ctn || ''; el.value = l.pcs || ''; updateRow(l); }
        if (f === 'prod' && !l.sku) return;
        focusNext(el, true);
      }
    });
    tb.addEventListener('click', (e) => {
      const dd = e.target.closest('.ws2-prod-dd');
      if (dd) { const inp = $('[data-f=prod]', dd.parentElement), l = lineOf(dd); inp.focus(); acProducts(inp, '', E.tier, (sku) => pickInto(l, sku)); return; }
      const del = e.target.closest('.ws2-del'); if (del) delLine(lineOf(del));
    });

    /* rate mode toggle */
    $('#ws2-e-ratemode', sec).addEventListener('click', (e) => {
      const b = e.target.closest('button[data-m]'); if (!b || b.dataset.m === E.mode) return;
      E.mode = b.dataset.m; $$('#ws2-e-ratemode button', sec).forEach((x) => x.classList.toggle('on', x === b));
      E.lines.forEach((l) => { const tr = trOf(l); if (tr && l.sku) { const ri = $('[data-f=rate]', tr); ri.value = rateVal(l); bump(ri); } });
      FS.toast(`Rates now entered per ${E.mode === 'ctn' ? 'carton' : 'piece'}`, { tone: 'info', ms: 1600 });
    });

    /* shop search */
    const sq = $('#ws2-e-shopq', sec);
    const pickShop = (code) => { setShop(code, true); FS.toast(`${esc(SHOP[code].name)} · ${SHOP[code].tier} rates applied`, { tone: 'info', ms: 2000 }); const t = $('tr.ws2-line', tbody()); if (t) focusF(E.lines.find((l) => !l.sku) ? trOf(E.lines.find((l) => !l.sku)) : t, 'prod'); };
    sq.addEventListener('focus', () => acShops(sq, sq.value, pickShop));
    sq.addEventListener('input', () => acShops(sq, sq.value, pickShop));
    sq.addEventListener('keydown', (e) => { if (SP.key(e, sq)) return; if (e.key === 'ArrowDown') { e.preventDefault(); acShops(sq, sq.value, pickShop); } });
    sq.addEventListener('blur', () => setTimeout(() => { if (SP.input === sq) SP.close(); }, 140));
    $('#ws2-e-shopcard', sec).addEventListener('click', (e) => {
      const b = e.target.closest('#ws2-e-tier'); if (!b) return;
      FS.menu(b, Object.keys(TIERS).map((t) => ({ icon: t === E.tier ? 'check' : 'tag', label: `${t} <small class="ws2-muted">×${TIERS[t].toFixed(2)}</small>`, onClick: () => { if (t === E.tier) return; E.tier = t; renderShopCard(true); applyTier(true); FS.toast(`Price tier set to ${t} for this bill`, { tone: 'info' }); } })));
    });
    $('#ws2-e-route', sec).addEventListener('change', (e) => { $('#ws2-e-sman', sec).value = ROUTE[e.target.value].salesman; });

    /* tools */
    $('#ws2-e-addrow', sec).addEventListener('click', () => addRow(null, 'prod'));
    $('#ws2-e-clear', sec).addEventListener('click', () => {
      const prev = E.lines.slice(); if (!prev.some((l) => l.sku)) return;
      $$('tbody tr', $('#ws2-e-grid', sec)).forEach((tr) => tr.classList.add('row-out'));
      setTimeout(() => { E.lines = [mkLine()]; render(); FS.toast(`Cleared ${prev.filter((l) => l.sku).length} lines`, { tone: 'warn', undo: () => { E.lines = prev; render(); } }); }, RM() ? 0 : 280);
    });
    $('#ws2-e-hold', sec).addEventListener('click', hold);
    $('#ws2-e-recall', sec).addEventListener('click', (e) => recall(e.currentTarget));
    $('#ws2-e-repeat', sec).addEventListener('click', repeatLast);
    $('#ws2-e-tpl', sec).addEventListener('click', (e) => templates(e.currentTarget));
    $('#ws2-e-scan', sec).addEventListener('click', () => setScan(!E.scan));
    $('#ws2-e-save', sec).addEventListener('click', () => save(false));
    $('#ws2-e-saveprint', sec).addEventListener('click', () => save(true));
    $('#ws2-e-wa', sec).addEventListener('click', whatsapp);

    const si = $('#ws2-e-scanin', sec);
    si.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); processScan(si.value); si.value = ''; } if (e.key === 'Escape') { e.stopPropagation(); setScan(false); } });
    si.addEventListener('input', () => { const v = si.value.trim(); if (/^\d{13}$/.test(v) && BAR[v]) { processScan(v); si.value = ''; } });
    $('#ws2-e-scandemo', sec).addEventListener('click', async (e) => {
      const b = e.target.closest('[data-code]'); if (!b) return;
      const code = b.dataset.code; si.focus(); si.value = '';
      for (let i = 0; i < code.length; i++) { si.value += code[i]; if (!RM()) await new Promise((r) => setTimeout(r, 9)); }
      processScan(code); si.value = '';
    });

    /* add many */
    $('#ws2-e-many', sec).addEventListener('click', manyOpen);
    $('#ws2-many-q', sec).addEventListener('input', (e) => { MANY.q = e.target.value; manyRender(); });
    $('#ws2-many-q', sec).addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); const f = $('#ws2-many-list [data-q=ctn]', sec); if (f) f.focus(); } });
    $('#ws2-many-cats', sec).addEventListener('click', (e) => { const b = e.target.closest('[data-cat]'); if (!b) return; MANY.cat = b.dataset.cat; manyRender(); });
    const ml = $('#ws2-many-list', sec);
    ml.addEventListener('click', (e) => { if (e.target.closest('[data-q]')) e.preventDefault(); });
    ml.addEventListener('change', (e) => {
      if (e.target.type !== 'checkbox') return;
      const row = e.target.closest('[data-sku]'), sku = row.dataset.sku;
      if (e.target.checked) { MANY.sel[sku] = MANY.sel[sku] || { ctn: 1, pcs: 0 }; $('[data-q=ctn]', row).value = MANY.sel[sku].ctn || ''; }
      else { delete MANY.sel[sku]; $$('[data-q]', row).forEach((x) => { x.value = ''; }); }
      row.classList.toggle('on', e.target.checked); manySum();
    });
    ml.addEventListener('input', (e) => {
      const q = e.target.dataset.q; if (!q) return;
      const row = e.target.closest('[data-sku]'), sku = row.dataset.sku;
      const ctn = Math.max(0, Math.round(num($('[data-q=ctn]', row).value))), pcs = Math.max(0, Math.round(num($('[data-q=pcs]', row).value)));
      if (ctn || pcs) MANY.sel[sku] = { ctn, pcs }; else delete MANY.sel[sku];
      $('input[type=checkbox]', row).checked = !!(ctn || pcs); row.classList.toggle('on', !!(ctn || pcs)); manySum();
    });
    ml.addEventListener('keydown', (e) => {
      const q = e.target.dataset.q; if (!q || (e.key !== 'Enter' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
      e.preventDefault();
      const rows = $$('[data-sku]', ml), i = rows.indexOf(e.target.closest('[data-sku]'));
      if (e.key === 'Enter' && e.ctrlKey) { $('#ws2-many-go', sec).click(); return; }
      const n = rows[i + (e.key === 'ArrowUp' ? -1 : 1)]; if (n) { const x = $(`[data-q=${q}]`, n); x.focus(); x.select(); }
    });
    $('#ws2-many-go', sec).addEventListener('click', () => {
      const arr = Object.keys(MANY.sel).map((k) => [k, MANY.sel[k].ctn, MANY.sel[k].pcs]); if (!arr.length) return;
      FS.closeOverlay($('#ws2-m-many', sec));
      setTimeout(() => { const n = mergeLines(arr); FS.toast(`Added ${n} item${n > 1 ? 's' : ''} to the bill`, { tone: 'good' }); }, 180);
    });

    /* paste */
    $('#ws2-e-paste', sec).addEventListener('click', () => { FS.openModal('ws2-m-paste'); pasteParse(); setTimeout(() => $('#ws2-paste-ta', sec).focus(), 120); });
    $('#ws2-paste-ta', sec).addEventListener('input', pasteParse);
    $('#ws2-paste-sample', sec).addEventListener('click', () => { const ta = $('#ws2-paste-ta', sec); ta.value = pasteSample(); pasteParse(); reflow(ta, 'ws2-glow'); });
    $('#ws2-paste-clear', sec).addEventListener('click', () => { $('#ws2-paste-ta', sec).value = ''; pasteParse(); });
    $('#ws2-paste-prev', sec).addEventListener('change', (e) => {
      const s = e.target.closest('.ws2-pfix'); if (!s) return;
      const r = PASTE.rows[+s.closest('tr').dataset.i]; r.sku = s.value || null; r.fixed = !!s.value;
      pasteRender();
      if (s.value) { const tr = $(`#ws2-paste-prev tr[data-i="${PASTE.rows.indexOf(r)}"]`, sec); flashRow(tr); }
    });
    $('#ws2-paste-go', sec).addEventListener('click', () => {
      const arr = PASTE.rows.filter((r) => r.sku).map((r) => [r.sku, r.ctn, r.pcs, r.rate]); if (!arr.length) return;
      const skipped = PASTE.rows.length - arr.length;
      FS.closeOverlay($('#ws2-m-paste', sec));
      setTimeout(() => { const n = mergeLines(arr); FS.toast(`Inserted ${n} lines from Excel${skipped ? ` · ${skipped} unmatched skipped` : ''}`, { tone: 'good' }); }, 180);
    });

    /* credit modal */
    const pin = $('#ws2-cr-pin', sec);
    pin.addEventListener('input', () => { pin.value = pin.value.replace(/\D/g, '').slice(0, 4); pinDots(); if (pin.value.length === 4) setTimeout(pinCheck, 120); });
    pin.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); pinCheck(); } });
    $('#ws2-cr-ok', sec).addEventListener('click', () => { if (pin.value.length < 4) { shake($('.ws2-pinbox', sec)); pin.focus(); return; } pinCheck(); });
    $('#ws2-cr-hold', sec).addEventListener('click', () => { FS.closeOverlay($('#ws2-m-credit', sec)); E.pending = null; hold(); });
    $('.ws2-pinbox', sec).addEventListener('click', () => pin.focus());

    /* section keys */
    document.addEventListener('keydown', (e) => {
      if (!isActive(sec)) return;
      if (e.key === 'Escape' && (AC.isOpen() || SP.isOpen())) { AC.close(); SP.close(); return; }
      if (anyOverlay()) return;
      if (e.altKey && (e.key === 's' || e.key === 'S')) { e.preventDefault(); save(false); return; }
      if (e.key === 'F2') {
        e.preventDefault();
        let tr = document.activeElement && document.activeElement.closest && document.activeElement.closest('#ws2-e-grid tr.ws2-line');
        if (!tr) { const b = E.lines.find((l) => !l.sku); tr = b ? trOf(b) : null; }
        if (!tr) { addRow(null, 'prod'); return; }
        const inp = $('[data-f=prod]', tr), l = lineOf(inp); inp.focus(); inp.select(); acProducts(inp, '', E.tier, (sku) => pickInto(l, sku));
        tr.scrollIntoView({ block: 'nearest' });
        return;
      }
      if (e.key === 'F3') { e.preventDefault(); sq.focus(); return; }
      if (e.key === 'F8') { e.preventDefault(); setScan(!E.scan); }
    });
  }

  /* ============================================================================
     2) BULK INVOICING
     ========================================================================== */
  const MSKU = ['FD-5001', 'FD-5002', 'FD-5003', 'FD-5004', 'PK-1001', 'PK-1003', 'OF-2002', 'IN-3001'];
  const B = { route: 'RT-01', mode: 'matrix', q: {}, same: { items: { 'FD-5001': 2, 'FD-5002': 3, 'FD-5003': 1 }, shops: new Set() } };
  let BS = null;
  const ctnAmt = (sku, ctn, shop) => { const it = BY[sku]; return ctn * pk(it) * tierRate(it, shop.tier) * (1 + it.gst / 100); };
  const routeShops = () => SHOPS.filter((s) => s.route === B.route);
  function bulkOrders() {
    const out = [];
    routeShops().forEach((s) => {
      let lines;
      if (B.mode === 'matrix') { const q = B.q[s.code] || {}; lines = MSKU.filter((k) => q[k] > 0).map((k) => ({ sku: k, ctn: q[k] })); }
      else { if (!B.same.shops.has(s.code)) return; lines = Object.keys(B.same.items).filter((k) => B.same.items[k] > 0).map((k) => ({ sku: k, ctn: B.same.items[k] })); }
      if (!lines.length) return;
      const amt = lines.reduce((a, l) => a + ctnAmt(l.sku, l.ctn, s), 0), ctn = lines.reduce((a, l) => a + l.ctn, 0);
      out.push({ shop: s, lines, amt, ctn, over: s.balance + amt > s.limit });
    });
    return out;
  }
  function crIcon(s, amt) {
    const used = s.balance + amt, pct = used / s.limit;
    if (pct > 1) return `<span class="ws2-cri bad" title="Over limit by Rs ${fmt(used - s.limit, 0)} · will be skipped"><i data-lucide="shield-alert"></i></span>`;
    if (pct > 0.8) return `<span class="ws2-cri warn" title="${Math.round(pct * 100)}% of limit used"><i data-lucide="triangle-alert"></i></span>`;
    return '<span class="ws2-cri ok" title="Within limit"><i data-lucide="shield-check"></i></span>';
  }
  function mxRender() {
    const shops = routeShops(), t = $('#ws2-b-mx', BS);
    t.innerHTML = `<thead><tr><th class="ws2-mx-shop">Shop <small>${shops.length} on ${B.route}</small></th>${MSKU.map((k) => { const it = BY[k]; return `<th class="ws2-mx-sku" title="${esc(it.name)}"><b>${esc(it.name.split(' ').slice(0, 2).join(' '))}</b><small>${k} · ${pk(it)}/ctn</small></th>`; }).join('')}<th class="ws2-mx-tot">Qty</th><th class="ws2-mx-tot ws2-mx-amt">Amount</th></tr></thead>
      <tbody>${shops.map((s, r) => { const q = B.q[s.code] || {}; return `<tr data-shop="${s.code}" style="--i:${r}"><th class="ws2-mx-shop"><div><span class="ws2-mx-sn">${esc(s.name)}</span><small>${s.code} · ${s.tier}</small></div><span data-cr></span></th>${MSKU.map((k, c) => `<td><input class="cell-input ws2-mx-in" data-r="${r}" data-c="${c}" data-sku="${k}" inputmode="numeric" value="${q[k] || ''}" aria-label="${esc(s.name)} ${esc(BY[k].name)} cartons"></td>`).join('')}<td class="ws2-mx-tot" data-rq>0</td><td class="ws2-mx-tot ws2-mx-amt" data-ra>0</td></tr>`; }).join('')}</tbody>
      <tfoot><tr><th class="ws2-mx-shop">Total</th>${MSKU.map((k, c) => `<td data-cq="${c}">0</td>`).join('')}<td class="ws2-mx-tot" data-gq>0</td><td class="ws2-mx-tot ws2-mx-amt" data-ga>0</td></tr></tfoot>`;
    mxTotals(true);
  }
  function mxTotals(all) {
    const shops = routeShops(), t = $('#ws2-b-mx', BS);
    let max = 1; shops.forEach((s) => MSKU.forEach((k) => { max = Math.max(max, (B.q[s.code] || {})[k] || 0); }));
    const col = MSKU.map(() => 0); let gq = 0, ga = 0;
    shops.forEach((s) => {
      const tr = $(`tr[data-shop="${s.code}"]`, t); if (!tr) return;
      const q = B.q[s.code] || {}; let rq = 0, ra = 0;
      MSKU.forEach((k, c) => { const v = q[k] || 0; rq += v; ra += ctnAmt(k, v, s); col[c] += v; const td = tr.cells[c + 1]; td.style.setProperty('--h', (v / max).toFixed(3)); td.classList.toggle('has', v > 0); });
      gq += rq; ga += ra;
      tr.querySelector('[data-rq]').textContent = rq ? fmt(rq, 0) : '—';
      tr.querySelector('[data-ra]').innerHTML = ra ? fmt(ra, 0) : '<span class="ws2-dash">—</span>';
      const cr = tr.querySelector('[data-cr]'), html = ra || s.balance > s.limit ? crIcon(s, ra) : '';
      if (cr.dataset.h !== html) { cr.dataset.h = html; cr.innerHTML = html; FS.icons(cr); if (!all && html) bump(cr.firstElementChild); }
      tr.classList.toggle('ws2-mx-over', s.balance + ra > s.limit && ra > 0);
    });
    MSKU.forEach((k, c) => { $(`[data-cq="${c}"]`, t).textContent = col[c] ? fmt(col[c], 0) : '—'; });
    $('[data-gq]', t).textContent = fmt(gq, 0); $('[data-ga]', t).textContent = 'Rs ' + fmt(ga, 0);
    genbar();
  }
  function sameRender() {
    const it = $('#ws2-b-sitems', BS);
    it.innerHTML = ITEMS.filter((x) => x.stock > 0).map((x, i) => `<label class="ws2-si${B.same.items[x.sku] ? ' on' : ''}" style="--i:${i}"><span class="icon-well sm ${catIc(x)[1]}"><i data-lucide="${catIc(x)[0]}"></i></span><div class="ws2-ac-main"><b>${esc(x.name)}</b><small>${x.sku} · ${pk(x)}/ctn · Rs ${fmt(x.wprice * pk(x), 0)}/ctn</small></div><input class="cell-input num" data-sku="${x.sku}" inputmode="numeric" placeholder="0" value="${B.same.items[x.sku] || ''}" aria-label="${esc(x.name)} cartons"></label>`).join('');
    FS.icons(it);
    sameShops(); samePrev();
  }
  function sameShops() {
    const shops = routeShops(), box = $('#ws2-b-sshops', BS);
    box.innerHTML = shops.map((s, i) => { const head = s.limit - s.balance; return `<label class="ws2-ss${B.same.shops.has(s.code) ? ' on' : ''}" style="--i:${i}"><input type="checkbox" data-shop="${s.code}"${B.same.shops.has(s.code) ? ' checked' : ''}><span class="avatar sm">${initials(s.name)}</span><div class="ws2-ac-main"><b>${esc(s.name)}</b><small>${s.code} · ${esc(s.area)}</small></div>${tierChip(s.tier)}<span class="ws2-head-room ${head < 0 ? 'bad' : head < s.limit * 0.2 ? 'warn' : ''}">${head < 0 ? 'Over' : 'Rs ' + fmt(head / 1000, 0) + 'k'}<small>${head < 0 ? 'limit' : 'headroom'}</small></span></label>`; }).join('');
    const all = $('#ws2-b-all', BS); all.checked = shops.every((s) => B.same.shops.has(s.code)); all.indeterminate = !all.checked && shops.some((s) => B.same.shops.has(s.code));
    $('#ws2-b-shopsub', BS).textContent = `${B.same.shops.size} of ${shops.length} shops selected`;
  }
  function samePrev() {
    const orders = bulkOrders(), box = $('#ws2-b-sprev', BS);
    box.innerHTML = orders.length ? `<table class="tbl ws2-sp-tbl" data-plain><thead><tr><th>Shop</th><th>Tier</th><th class="num">Lines</th><th class="num">CTN</th><th class="num">Amount</th><th>Credit</th></tr></thead><tbody>${orders.map((o) => `<tr class="${o.over ? 'ws2-mx-over' : ''}"><td><b>${esc(o.shop.name)}</b><small>${o.shop.code}</small></td><td>${tierChip(o.shop.tier)}</td><td class="num">${o.lines.length}</td><td class="num">${o.ctn}</td><td class="num"><b>${fmt(o.amt, 0)}</b></td><td>${o.over ? '<span class="badge danger"><i data-lucide="shield-alert"></i>Over limit</span>' : '<span class="badge good"><i data-lucide="shield-check"></i>OK</span>'}</td></tr>`).join('')}</tbody></table>` : '<div class="ws2-paste-empty"><i data-lucide="mouse-pointer-click"></i><b>Nothing to preview yet</b><small>Set item quantities and tick shops.</small></div>';
    FS.icons(box);
    genbar();
  }
  function genbar() {
    const o = bulkOrders(), n = o.length, v = o.reduce((a, x) => a + x.amt, 0), c = o.reduce((a, x) => a + x.ctn, 0), w = o.filter((x) => x.over).length;
    FS.tick($('#ws2-b-gn', BS), n, { dec: 0 }); FS.tick($('#ws2-b-gc', BS), c, { dec: 0 }); FS.tick($('#ws2-b-gw', BS), w, { dec: 0 }); FS.tick($('#ws2-b-gv', BS), v, { dec: 0, prefix: 'Rs ' });
    $('#ws2-b-gw', BS).classList.toggle('bad', w > 0);
    const b = $('#ws2-b-gen', BS); b.disabled = !n; $('span', b).textContent = `Generate ${n} invoice${n === 1 ? '' : 's'}`;
  }
  function routeInfo() {
    const r = ROUTE[B.route];
    $('#ws2-b-rinfo', BS).innerHTML = `<span class="pill"><i data-lucide="calendar"></i>${r.days.join(' · ')}</span><span class="pill"><i data-lucide="user-round"></i>${esc(r.salesman)}</span><span class="pill"><i data-lucide="truck"></i>${r.van}</span>`;
    FS.icons($('#ws2-b-rinfo', BS));
  }
  async function generate() {
    const orders = bulkOrders(); if (!orders.length) return;
    const list = $('#ws2-gen-list', BS), sum = $('#ws2-gen-sum', BS), fill = $('#ws2-gen-fill', BS);
    $('#ws2-gen-title', BS).textContent = `Generating ${orders.length} invoices…`;
    $('#ws2-gen-sub', BS).textContent = `${B.route} · ${ROUTE[B.route].name} · ${$('#ws2-b-date', BS).value}`;
    sum.hidden = true; fill.style.width = '0%'; $('#ws2-gen-load', BS).hidden = true;
    list.innerHTML = orders.map((o, i) => `<div class="ws2-gen-row" data-i="${i}"><span class="ws2-gen-st"><i data-lucide="circle-dashed"></i></span><div><b>${esc(o.shop.name)}</b><small>${o.lines.length} lines · ${o.ctn} ctn</small></div><span class="ws2-gen-no">Queued</span><b class="ws2-gen-amt">Rs ${fmt(o.amt, 0)}</b></div>`).join('');
    FS.icons(list);
    FS.openModal('ws2-m-gen');
    let made = 0, val = 0; const skipped = [], nos = [];
    for (let i = 0; i < orders.length; i++) {
      const o = orders[i], row = $(`[data-i="${i}"]`, list);
      row.classList.add('run'); $('.ws2-gen-st', row).innerHTML = '<span class="ws2-spin"></span>'; $('.ws2-gen-no', row).textContent = 'Posting…';
      row.scrollIntoView({ block: 'nearest' });
      await wait(260);
      row.classList.remove('run');
      if (o.shop.balance + o.amt > o.shop.limit) {
        row.classList.add('skip'); $('.ws2-gen-st', row).innerHTML = '<i data-lucide="shield-alert"></i>';
        $('.ws2-gen-no', row).innerHTML = `Skipped · over limit by Rs ${fmt(o.shop.balance + o.amt - o.shop.limit, 0)}`;
        skipped.push(o);
      } else {
        const no = 'WS-2026-' + String(E.no++).padStart(6, '0'); nos.push(no);
        o.shop.balance += o.amt; made++; val += o.amt;
        row.classList.add('done'); $('.ws2-gen-st', row).innerHTML = '<i data-lucide="check"></i>'; $('.ws2-gen-no', row).innerHTML = `<code class="ws2-code">${no}</code>`;
        if (B.mode === 'matrix') delete B.q[o.shop.code]; else B.same.shops.delete(o.shop.code);
      }
      FS.icons(row);
      fill.style.width = ((i + 1) / orders.length * 100) + '%';
    }
    if (ES) $('#ws2-e-no', ES).textContent = 'WS-2026-' + String(E.no).padStart(6, '0');
    $('#ws2-gen-title', BS).textContent = `${made} invoice${made === 1 ? '' : 's'} generated`;
    sum.innerHTML = `<div class="ws2-gs-hero"><span class="ws2-gs-ic"><i data-lucide="badge-check"></i></span><div><small>Invoices</small><b>${made}</b></div><div><small>Total value</small><b>${money(val, 0)}</b></div><div><small>Skipped</small><b class="${skipped.length ? 'bad' : ''}">${skipped.length}</b></div></div>
      ${nos.length ? `<p class="ws2-gs-range">${nos[0]}${nos.length > 1 ? ' → ' + nos[nos.length - 1] : ''}</p>` : ''}
      ${skipped.length ? `<div class="ws2-gs-skip"><i data-lucide="info"></i><span>${skipped.map((o) => esc(o.shop.name)).join(', ')} skipped for credit. Collect payment or raise the limit, then bill them from Quick Entry.</span></div>` : ''}
      <div class="ws2-gs-links"><a href="#/app/wholesale/entry" data-close><i data-lucide="zap"></i>Quick Entry</a><a href="#/app/wholesale/bookings" data-close><i data-lucide="smartphone"></i>Order bookings</a><a href="#/app/wholesale/recovery" data-close><i data-lucide="hand-coins"></i>Recovery sheet</a></div>`;
    sum.hidden = false; FS.icons(sum); $('#ws2-gen-load', BS).hidden = !made;
    if (made) FS.celebrate($('.ws2-gs-ic', sum), `${made} invoices`);
    FS.toast(`${made} invoices posted · Rs ${fmt(val, 0)}${skipped.length ? ` · ${skipped.length} skipped` : ''}`, { tone: skipped.length ? 'warn' : 'good' });
    if (B.mode === 'matrix') mxRender(); else sameRender();
  }
  function mountBulk(sec) {
    liftOverlays(sec);
    BS = sec;
    $('#ws2-b-route', sec).innerHTML = ROUTES.map((r) => `<option value="${r.code}">${r.code} · ${esc(r.name)}</option>`).join('');
    /* a few prefilled cells so the matrix reads at a glance */
    const pre = routeShops();
    [[0, 'FD-5001', 2], [0, 'FD-5002', 3], [1, 'FD-5003', 1], [2, 'FD-5001', 4], [2, 'PK-1001', 2], [3, 'FD-5002', 6], [3, 'FD-5004', 1], [4, 'OF-2002', 2], [5, 'FD-5001', 1], [6, 'IN-3001', 2], [6, 'FD-5003', 2], [8, 'FD-5002', 2]].forEach(([r, k, v]) => { if (pre[r]) { B.q[pre[r].code] = B.q[pre[r].code] || {}; B.q[pre[r].code][k] = v; } });
    routeShops().slice(0, 4).forEach((s) => B.same.shops.add(s.code));
    routeInfo(); mxRender(); sameRender();
    $('#ws2-b-route', sec).addEventListener('change', (e) => { B.route = e.target.value; routeInfo(); FS.skeleton($('#ws2-b-matrix', sec), 350); mxRender(); sameRender(); });
    $('#ws2-b-mode', sec).addEventListener('click', (e) => {
      const b = e.target.closest('[data-m]'); if (!b) return; B.mode = b.dataset.m;
      $('#ws2-b-matrix', sec).hidden = B.mode !== 'matrix'; $('#ws2-b-same', sec).hidden = B.mode === 'matrix';
      reflow(B.mode === 'matrix' ? $('#ws2-b-matrix', sec) : $('#ws2-b-same', sec), 'ws2-swap');
      genbar();
    });
    const mx = $('#ws2-b-mx', sec);
    mx.addEventListener('input', (e) => {
      const i = e.target.closest('.ws2-mx-in'); if (!i) return;
      i.value = i.value.replace(/\D/g, '').slice(0, 3);
      const code = i.closest('tr').dataset.shop; B.q[code] = B.q[code] || {}; B.q[code][i.dataset.sku] = +i.value || 0;
      mxTotals();
    });
    mx.addEventListener('focusin', (e) => { const i = e.target.closest('.ws2-mx-in'); if (!i) return; setTimeout(() => i.select(), 0); mxCross(i, true); });
    mx.addEventListener('focusout', (e) => { const i = e.target.closest('.ws2-mx-in'); if (i) mxCross(i, false); });
    mx.addEventListener('keydown', (e) => {
      const i = e.target.closest('.ws2-mx-in'); if (!i) return;
      const r = +i.dataset.r, c = +i.dataset.c;
      const mv = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1], Enter: [e.shiftKey ? -1 : 1, 0] }[e.key];
      if (!mv) return; e.preventDefault();
      const n = $(`.ws2-mx-in[data-r="${r + mv[0]}"][data-c="${c + mv[1]}"]`, mx); if (n) n.focus();
    });
    $('#ws2-b-suggest', sec).addEventListener('click', async (e) => {
      const btn = e.currentTarget; await busy(btn, 'Reading history…', 650);
      const shops = routeShops();
      for (let r = 0; r < shops.length; r++) {
        const s = shops[r], h = hash(s.code + 'last'); B.q[s.code] = {};
        MSKU.forEach((k, c) => { if (((h >>> c) & 3) === 0 || (h >>> (c + 2)) % 5 === 0) B.q[s.code][k] = 1 + ((h >>> (c * 2)) % 5); });
        const tr = $(`tr[data-shop="${s.code}"]`, mx);
        MSKU.forEach((k) => { const inp = $(`.ws2-mx-in[data-sku="${k}"]`, tr); inp.value = B.q[s.code][k] || ''; });
        mxTotals(); reflow(tr, 'ws2-mx-fill');
        await wait(70);
      }
      FS.toast(`Filled ${shops.length} shops from their last orders`, { tone: 'good' });
    });
    $('#ws2-b-clear', sec).addEventListener('click', () => { const prev = JSON.parse(JSON.stringify(B.q)); routeShops().forEach((s) => delete B.q[s.code]); mxRender(); FS.toast('Matrix cleared', { tone: 'warn', undo: () => { B.q = prev; mxRender(); } }); });
    $('#ws2-b-sitems', sec).addEventListener('input', (e) => { const i = e.target.closest('[data-sku]'); if (!i) return; i.value = i.value.replace(/\D/g, '').slice(0, 3); B.same.items[i.dataset.sku] = +i.value || 0; i.closest('.ws2-si').classList.toggle('on', +i.value > 0); samePrev(); });
    $('#ws2-b-sshops', sec).addEventListener('change', (e) => { const c = e.target.dataset.shop; if (!c) return; if (e.target.checked) B.same.shops.add(c); else B.same.shops.delete(c); e.target.closest('.ws2-ss').classList.toggle('on', e.target.checked); const all = $('#ws2-b-all', sec), sh = routeShops(); all.checked = sh.every((s) => B.same.shops.has(s.code)); all.indeterminate = !all.checked && sh.some((s) => B.same.shops.has(s.code)); $('#ws2-b-shopsub', sec).textContent = `${B.same.shops.size} of ${sh.length} shops selected`; samePrev(); });
    $('#ws2-b-all', sec).addEventListener('change', (e) => { routeShops().forEach((s) => { if (e.target.checked) B.same.shops.add(s.code); else B.same.shops.delete(s.code); }); sameShops(); samePrev(); });
    $('#ws2-b-gen', sec).addEventListener('click', generate);
  }
  function mxCross(i, on) {
    const t = i.closest('table'), c = +i.dataset.c;
    i.closest('tr').classList.toggle('ws2-mx-row', on);
    const th = t.tHead.rows[0].cells[c + 1]; if (th) th.classList.toggle('ws2-mx-col', on);
  }

  /* ============================================================================
     3) ORDER BOOKINGS   +   4) BACK-ORDERS (shared state)
     ========================================================================== */
  const AV = {}; ITEMS.forEach((it) => { AV[it.sku] = it.stock; });
  const BK = [];
  const BO = [];
  let OS = null, RS = null, boUid = 0;
  const TODAY = new Date('2026-10-01');
  const ageOf = (d) => Math.max(0, Math.round((TODAY - new Date(d)) / 864e5));
  (function seedBookings() {
    const times = ['08:12', '08:34', '08:51', '09:07', '09:22', '09:40', '09:58', '10:15', '10:31', '10:46', '11:02', '11:20', '16:45', '17:10'];
    const notes = ['Deliver before Jumma', '', 'Shopkeeper wants fresh batch', '', 'Cash on delivery this time', '', '', 'Call before arriving · 0321', '', 'Shutter closes 1–3 PM', '', '', 'Collect last cheque too', ''];
    const pool = ['FD-5001', 'FD-5002', 'FD-5003', 'PK-1001', 'PK-1003', 'OF-2002', 'OF-2003', 'IN-3001', 'EL-4001', 'FD-5001'];
    const force = { 1: ['FD-5004', 1, 0], 4: ['FD-5004', 0, 9], 6: ['PK-1005', 0, 4], 8: ['OF-2001', 2, 0], 10: ['FD-5004', 1, 0], 11: ['OF-2001', 3, 0] };
    for (let i = 0; i < 14; i++) {
      const r = ROUTES[i % 3], shops = SHOPS.filter((s) => s.route === r.code), s = shops[(i * 3 + 1) % shops.length];
      const h = hash('BK' + i + s.code), n = 3 + (h % 4), lines = [];
      for (let k = 0; lines.length < n && k < 24; k++) { const sku = pool[(h >>> k) % 10]; if (!lines.some((x) => x.sku === sku)) lines.push({ sku, ctn: 1 + ((h >>> (k + 2)) % 4), pcs: (h >>> k) % 4 === 0 ? 6 : 0 }); }
      if (force[i]) { const [sku, ctn, pcs] = force[i]; const ex = lines.find((x) => x.sku === sku); if (ex) Object.assign(ex, { ctn, pcs }); else lines.push({ sku, ctn, pcs }); }
      lines.forEach((l) => { l.rate = tierRate(BY[l.sku], s.tier); });
      BK.push({ no: 'BK-2026-' + String(4120 + i), i, booker: r.booker, route: r.code, shop: s, time: times[i], date: i < 12 ? '2026-10-01' : '2026-09-30', lines, gps: i % 6 !== 4, gpsOff: (0.4 + (i % 3) * 0.6).toFixed(1), note: notes[i], status: i >= 12 ? 'Converted' : 'New', chk: null, inv: i >= 12 ? 'WS-2026-0002' + (14 + i) : null });
    }
  })();
  const bkAmt = (o) => o.lines.reduce((a, l) => { const it = BY[l.sku]; return a + (l.ctn * pk(it) + l.pcs) * l.rate * (1 + it.gst / 100); }, 0);
  const lineTp = (l) => l.ctn * pk(BY[l.sku]) + l.pcs;
  (function seedBO() {
    const S = (n) => SHOPS[n].code;
    [['WS-2026-000214', S(4), 'FD-5004', 36, '2026-09-24'], ['WS-2026-000216', S(7), 'FD-5004', 24, '2026-09-26'], ['WS-2026-000221', S(12), 'FD-5004', 18, '2026-09-29'], ['WS-2026-000209', S(1), 'PK-1005', 6, '2026-09-19'],
      ['WS-2026-000219', S(9), 'PK-1005', 4, '2026-09-27'], ['WS-2026-000211', S(3), 'OF-2001', 10, '2026-09-22'], ['WS-2026-000224', S(15), 'OF-2001', 6, '2026-09-30'], ['WS-2026-000205', S(6), 'EL-4002', 3, '2026-09-15'],
      ['WS-2026-000220', S(10), 'FD-5002', 30, '2026-09-28'], ['WS-2026-000222', S(4), 'FD-5002', 18, '2026-09-29'], ['WS-2026-000217', S(18), 'IN-3002', 24, '2026-09-26'], ['WS-2026-000226', S(21), 'FD-5004', 12, '2026-09-30']]
      .forEach(([ref, shop, sku, pend, date]) => BO.push({ id: ++boUid, ref, shop, sku, pend, alloc: 0, date, batch: '' }));
  })();
  const FEED = [
    { grn: 'GRN-2026-0187', vendor: 'Unilever Pakistan', sku: 'FD-5004', qty: 72, at: '09:40', status: 'arrived', batches: [{ no: 'SE-2608', exp: '2026-12-31', qty: 36 }, { no: 'SE-2611', exp: '2027-03-31', qty: 36 }] },
    { grn: 'GRN-2026-0188', vendor: 'Habib Packaging', sku: 'PK-1005', qty: 8, at: '10:15', status: 'arrived', batches: [] },
    { grn: 'GRN-2026-0190', vendor: 'Tapal Tea (Pvt) Ltd', sku: 'FD-5002', qty: 60, at: '11:05', status: 'arrived', batches: [{ no: 'TP-2609', exp: '2027-02-28', qty: 24 }, { no: 'TP-2612', exp: '2027-06-30', qty: 36 }] },
    { grn: 'GRN-2026-0189', vendor: 'HP Pakistan', sku: 'OF-2001', qty: 12, at: 'ETA 15:00', status: 'transit', batches: [] },
  ];

  /* ---- bookings ---- */
  const O = { sel: new Set(), st: 'All', booker: '', route: '', date: '' };
  const stBadge = (o) => ({ New: '<span class="badge info"><span class="dot"></span>New</span>', Checked: '<span class="badge violet"><i data-lucide="package-check"></i>Checked</span>', Converted: '<span class="badge good"><i data-lucide="check"></i>Converted</span>', Partial: '<span class="badge warn"><i data-lucide="split"></i>Partial</span>' }[o.status]);
  function stockCell(o) {
    if (o.status === 'Converted' && !o.chk) return '<span class="ws2-muted">Invoiced</span>';
    if (!o.chk) return '<span class="ws2-muted ws2-nc"><i data-lucide="circle-dashed"></i>Not checked</span>';
    if (!o.chk.short.length) return '<span class="ws2-stk ok"><i data-lucide="circle-check"></i>All in stock</span>';
    return `<span class="ws2-stk bad"><i data-lucide="triangle-alert"></i>${o.chk.short.length} short</span><div class="ws2-stk-l">${o.chk.short.map((x) => `<small>${esc(BY[x.sku].name.split(' ').slice(0, 2).join(' '))} <b>−${qtyStr(BY[x.sku], x.need - x.have)}</b></small>`).join('')}</div>`;
  }
  const filtered = () => BK.filter((o) => (O.st === 'All' || o.status === O.st) && (!O.booker || o.booker === O.booker) && (!O.route || o.route === O.route) && (!O.date || o.date === O.date));
  function bkRow(o, k) {
    return `<tr data-no="${o.no}" class="${O.sel.has(o.no) ? 'sel' : ''} st-${o.status.toLowerCase()}" style="--i:${k}">
      <td class="ws2-c-cb"><input type="checkbox" aria-label="Select ${o.no}"${O.sel.has(o.no) ? ' checked' : ''}${o.status === 'Converted' ? ' disabled' : ''}></td>
      <td><b class="ws2-ono">${o.no}</b><small>${o.date === '2026-10-01' ? 'Today' : 'Yesterday'} · ${o.time}</small></td>
      <td><div class="ws2-who"><span class="avatar sm">${initials(o.booker)}</span><span>${esc(o.booker)}</span></div></td>
      <td><b>${esc(o.shop.name)}</b><small>${esc(o.shop.area)}${o.note ? ` · <span class="ws2-note"><i data-lucide="message-square-text"></i>${esc(o.note)}</span>` : ''}</small></td>
      <td><span class="ws2-rt">${o.route}</span></td>
      <td class="num">${o.lines.length}</td>
      <td class="num"><b>${fmt(bkAmt(o), 0)}</b></td>
      <td>${o.gps ? '<span class="ws2-gps ok"><i data-lucide="map-pin-check"></i>GPS verified</span>' : `<span class="ws2-gps warn" title="Booked ${o.gpsOff} km away from the shop pin"><i data-lucide="map-pin-x"></i>${o.gpsOff} km off</span>`}</td>
      <td class="ws2-c-stk">${stockCell(o)}</td>
      <td class="ws2-c-st">${stBadge(o)}${o.inv ? `<small><code class="ws2-code">${o.inv}</code></small>` : ''}</td></tr>`;
  }
  function bkRender(stagger) {
    const list = filtered(), tb = $('#ws2-o-tbl tbody', OS);
    tb.innerHTML = list.length ? list.map(bkRow).join('') : '<tr><td colspan="10"><div class="ws2-paste-empty"><i data-lucide="inbox"></i><b>No bookings match</b><small>Clear a filter to see more.</small></div></td></tr>';
    if (stagger) tb.classList.add('ws2-stag'); else tb.classList.remove('ws2-stag');
    FS.icons(tb); bkChips(); bkSel(); bkKpis();
  }
  function bkChips() {
    const base = BK.filter((o) => (!O.booker || o.booker === O.booker) && (!O.route || o.route === O.route) && (!O.date || o.date === O.date));
    $('#ws2-o-status', OS).innerHTML = ['All', 'New', 'Checked', 'Converted', 'Partial'].map((s) => `<button class="${O.st === s ? 'active' : ''}" data-st="${s}">${s}<i>${s === 'All' ? base.length : base.filter((o) => o.status === s).length}</i></button>`).join('');
  }
  function bkSel() {
    const vis = filtered().filter((o) => o.status !== 'Converted');
    [...O.sel].forEach((n) => { const o = BK.find((x) => x.no === n); if (!o || o.status === 'Converted') O.sel.delete(n); });
    const n = O.sel.size, all = $('#ws2-o-all', OS);
    all.checked = vis.length > 0 && vis.every((o) => O.sel.has(o.no)); all.indeterminate = !all.checked && vis.some((o) => O.sel.has(o.no));
    const sv = [...O.sel].reduce((a, k) => a + bkAmt(BK.find((o) => o.no === k)), 0);
    $('#ws2-o-selt', OS).innerHTML = n ? `<b>${n}</b> selected · Rs ${fmt(sv, 0)}` : 'Select all';
    $('#ws2-o-check', OS).disabled = !n; $('#ws2-o-conv', OS).disabled = !n;
    $('#ws2-o-act', OS).classList.toggle('on', n > 0);
  }
  function bkKpis() {
    const today = BK.filter((o) => o.date === '2026-10-01'), val = today.reduce((a, o) => a + bkAmt(o), 0), pend = BK.filter((o) => o.status === 'New' || o.status === 'Checked').length, gps = BK.filter((o) => o.gps).length;
    const k = (t, ic, v, s, tone) => `<div class="kpi"><div class="kpi-top"><span>${t}</span><span class="icon-well ${tone || ''}"><i data-lucide="${ic}"></i></span></div><strong>${v}</strong><small>${s}</small></div>`;
    $('#ws2-o-kpis', OS).innerHTML = k('Orders today', 'smartphone', today.length, `${BK.length - today.length} from yesterday`) + k('Booked value today', 'banknote', 'Rs ' + fmt(val, 0), `${ROUTES.length} routes · ${D.salesTeam.bookers.length} bookers`, 'teal') + k('Awaiting conversion', 'hourglass', pend, `${BK.filter((o) => o.status === 'Partial').length} partial · ${BO.length} back-order lines`, 'yellow') + k('GPS verified', 'map-pin-check', Math.round(gps / BK.length * 100) + '%', `${BK.length - gps} booked off-site`, 'blue');
    FS.icons($('#ws2-o-kpis', OS));
  }
  function checkOrders(orders) {
    const tmp = Object.assign({}, AV);
    orders.slice().sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).forEach((o) => {
      const short = [];
      o.lines.forEach((l) => { const need = lineTp(l), have = Math.max(0, tmp[l.sku]); if (need > have) short.push({ sku: l.sku, need, have }); tmp[l.sku] = have - Math.min(need, have); });
      o.chk = { short };
    });
  }
  function bkDrawer(o) {
    const amt = bkAmt(o);
    const html = `<div class="ws2-bd-hero"><span class="avatar lg">${initials(o.shop.name)}</span><div><h3>${esc(o.shop.name)}</h3><p>${o.shop.code} · ${esc(o.shop.area)} · ${o.route} · ${o.shop.tier}</p><div class="row">${stBadge(o)}${o.gps ? '<span class="ws2-gps ok"><i data-lucide="map-pin-check"></i>GPS verified</span>' : `<span class="ws2-gps warn"><i data-lucide="map-pin-x"></i>${o.gpsOff} km off</span>`}</div></div></div>
      <div class="ws2-bd-meta"><div><small>Booker</small><b>${esc(o.booker)}</b></div><div><small>Booked</small><b>${o.date === '2026-10-01' ? 'Today' : 'Yesterday'} ${o.time}</b></div><div><small>Lines</small><b>${o.lines.length}</b></div><div><small>Amount</small><b>Rs ${fmt(amt, 0)}</b></div></div>
      ${o.note ? `<div class="ws2-bd-note"><i data-lucide="message-square-text"></i>${esc(o.note)}</div>` : ''}
      <table class="tbl ws2-bd-tbl" data-plain><thead><tr><th>Item</th><th class="num">CTN</th><th class="num">PCS</th><th class="num">Rate</th><th class="num">Amount</th><th>Stock</th></tr></thead><tbody>${o.lines.map((l) => { const it = BY[l.sku], need = lineTp(l), ok = AV[l.sku] >= need; return `<tr><td><b>${esc(it.name)}</b><small>${it.sku} · Ctn ${pk(it)}</small></td><td class="num">${l.ctn || '—'}</td><td class="num">${l.pcs || '—'}</td><td class="num">${fmt(l.rate)}</td><td class="num"><b>${fmt(need * l.rate * (1 + it.gst / 100), 0)}</b></td><td>${ok ? '<span class="ws2-stk ok"><i data-lucide="circle-check"></i>' + qtyStr(it, AV[l.sku]) + '</span>' : `<span class="ws2-stk bad"><i data-lucide="triangle-alert"></i>${AV[l.sku] > 0 ? 'Only ' + qtyStr(it, AV[l.sku]) : 'Out of stock'}</span>`}</td></tr>`; }).join('')}</tbody></table>
      <div class="ws2-bd-map"><span class="ws2-bd-pin"><i data-lucide="map-pin"></i></span><div><b>${o.gps ? 'Booked at the shop' : 'Booked away from the shop'}</b><small>${o.gps ? 'Within 25 m of the saved shop pin' : `${o.gpsOff} km from the saved pin · supervisor notified`} · ${o.time}</small></div></div>`;
    const conv = o.status === 'New' || o.status === 'Checked';
    const d = FS.drawer({ title: o.no, subtitle: `Booker app order · ${esc(o.booker)}`, html, foot: `<button class="btn secondary" data-close>Close</button>${conv ? '<button class="btn primary" data-ws2="conv"><i data-lucide="file-check-2"></i>Convert to invoice</button>' : ''}` });
    d.addEventListener('click', (e) => { if (!e.target.closest('[data-ws2=conv]')) return; FS.closeOverlay(d.closest('.overlay')); O.sel = new Set([o.no]); bkRender(); setTimeout(() => $('#ws2-o-conv', OS).click(), 300); });
  }
  async function bkCheck() {
    const sel = BK.filter((o) => O.sel.has(o.no) && o.status !== 'Converted'); if (!sel.length) return;
    const btn = $('#ws2-o-check', OS);
    sel.forEach((o) => { const tr = $(`tr[data-no="${o.no}"]`, OS); if (tr) $('.ws2-c-stk', tr).innerHTML = '<span class="ws2-muted ws2-nc"><span class="ws2-spin"></span>Checking…</span>'; });
    await busy(btn, 'Checking…', 800);
    checkOrders(sel);
    for (const o of sel) {
      if (o.status === 'New') o.status = 'Checked';
      const tr = $(`tr[data-no="${o.no}"]`, OS);
      if (tr) { $('.ws2-c-stk', tr).innerHTML = stockCell(o); $('.ws2-c-st', tr).innerHTML = stBadge(o); FS.icons(tr); reflow($('.ws2-c-stk', tr).firstElementChild, 'ws2-bump'); }
      await wait(70);
    }
    const sh = sel.filter((o) => o.chk.short.length).length;
    bkChips(); bkKpis();
    FS.toast(`${sel.length} orders checked · ${sel.length - sh} fully in stock${sh ? ` · ${sh} with shortages` : ''}`, { tone: sh ? 'warn' : 'good' });
  }
  async function bkConvert() {
    const sel = BK.filter((o) => O.sel.has(o.no) && o.status !== 'Converted'); if (!sel.length) return;
    const btn = $('#ws2-o-conv', OS), partial = $('#ws2-o-partial', OS).checked;
    btn.classList.add('ws2-busy'); btn.disabled = true; btn.style.setProperty('--ws2-ms', (sel.length * 330) + 'ms'); $('span', btn).textContent = 'Converting…';
    if (sel.some((o) => !o.chk)) checkOrders(sel.filter((o) => !o.chk).concat([]));
    let full = 0, part = 0, held = 0, bol = 0;
    const sorted = sel.slice().sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    for (const o of sorted) {
      const tr = $(`tr[data-no="${o.no}"]`, OS);
      if (tr) { $('.ws2-c-st', tr).innerHTML = '<span class="ws2-muted ws2-nc"><span class="ws2-spin"></span>Posting…</span>'; tr.classList.add('ws2-run'); }
      await wait(300);
      /* re-check live against current availability */
      const short = []; o.lines.forEach((l) => { const need = lineTp(l), have = Math.max(0, AV[l.sku]); if (need > have) short.push({ sku: l.sku, need, have }); });
      o.chk = { short };
      if (short.length && !partial) { held++; if (o.status === 'New') o.status = 'Checked'; }
      else {
        o.lines.forEach((l) => { const need = lineTp(l), give = Math.min(need, Math.max(0, AV[l.sku])); AV[l.sku] -= give; if (need > give) { BO.push({ id: ++boUid, ref: o.no, shop: o.shop.code, sku: l.sku, pend: need - give, alloc: 0, date: o.date, batch: '', fresh: true }); bol++; } });
        o.inv = 'WS-2026-' + String(E.no++).padStart(6, '0');
        o.status = short.length ? 'Partial' : 'Converted'; if (short.length) part++; else full++;
        O.sel.delete(o.no);
      }
      if (tr) { tr.classList.remove('ws2-run'); const tmp = document.createElement('tbody'); tmp.innerHTML = bkRow(o, 0); const n = tmp.firstElementChild; tr.replaceWith(n); FS.icons(n); flashRow(n); }
    }
    btn.classList.remove('ws2-busy'); $('span', btn).textContent = 'Convert to invoices';
    if (ES) $('#ws2-e-no', ES).textContent = 'WS-2026-' + String(E.no).padStart(6, '0');
    bkChips(); bkSel(); bkKpis(); if (RS) boRender();
    const made = full + part;
    if (made) FS.celebrate(btn, `${made} invoices`);
    FS.toast(`${made} invoice${made === 1 ? '' : 's'} created${part ? ` · ${part} partial` : ''}${bol ? ` · ${bol} lines to back-orders` : ''}${held ? ` · ${held} held for stock` : ''}`, { tone: held ? 'warn' : 'good', action: bol ? { label: 'Back-orders', fn: () => FS.go('app/wholesale/backorders') } : null });
  }
  function mountBookings(sec) {
    liftOverlays(sec);
    OS = sec;
    $('#ws2-o-booker', sec).innerHTML = '<option value="">All bookers</option>' + [...new Set(BK.map((o) => o.booker))].map((b) => `<option>${esc(b)}</option>`).join('');
    $('#ws2-o-route', sec).innerHTML = '<option value="">All routes</option>' + ROUTES.map((r) => `<option value="${r.code}">${r.code} · ${esc(r.name)}</option>`).join('');
    /* pre-checked state for a couple of orders, plus one partial from earlier */
    checkOrders(BK.filter((o) => o.i === 9 || o.i === 10)); BK.forEach((o) => { if (o.i === 9 || o.i === 10) o.status = 'Checked'; });
    const p = BK.find((o) => o.i === 11); p.status = 'Partial'; p.inv = 'WS-2026-000230'; p.chk = { short: [{ sku: 'OF-2001', need: 3, have: 0 }] };
    bkRender(true);
    $('#ws2-o-status', sec).addEventListener('click', (e) => { const b = e.target.closest('[data-st]'); if (!b) return; O.st = b.dataset.st; bkRender(true); });
    ['booker', 'route', 'date'].forEach((k) => $('#ws2-o-' + k, sec).addEventListener('change', (e) => { O[k] = e.target.value; bkRender(true); }));
    const tb = $('#ws2-o-tbl tbody', sec);
    tb.addEventListener('change', (e) => { if (e.target.type !== 'checkbox') return; const tr = e.target.closest('tr'); if (e.target.checked) O.sel.add(tr.dataset.no); else O.sel.delete(tr.dataset.no); tr.classList.toggle('sel', e.target.checked); bkSel(); });
    tb.addEventListener('click', (e) => { const tr = e.target.closest('tr[data-no]'); if (!tr || e.target.closest('input,button,a,label,.ws2-c-cb')) return; bkDrawer(BK.find((o) => o.no === tr.dataset.no)); });
    $('#ws2-o-all', sec).addEventListener('change', (e) => { filtered().filter((o) => o.status !== 'Converted').forEach((o) => { if (e.target.checked) O.sel.add(o.no); else O.sel.delete(o.no); }); bkRender(); });
    $('#ws2-o-check', sec).addEventListener('click', bkCheck);
    $('#ws2-o-conv', sec).addEventListener('click', bkConvert);
    $('#ws2-o-sync', sec).addEventListener('click', async (e) => { const b = e.currentTarget; $('svg', b).classList.add('ws2-rot'); FS.skeleton($('.ws2-o-panel', sec), 600); await wait(650); $('svg', b).classList.remove('ws2-rot'); FS.toast('Booker app synced · no new orders since 11:20', { tone: 'info' }); });
  }

  /* ---- back-orders ---- */
  const R = { view: 'item', open: new Set(['FD-5004']), sel: new Set(), feedDone: new Set(), last: null };
  const boVal = (b) => { const it = BY[b.sku], s = SHOP[b.shop]; return b.pend * tierRate(it, s.tier) * (1 + it.gst / 100); };
  const ageChip = (d) => { const a = ageOf(d); return `<span class="ws2-age ${a > 10 ? 'bad' : a > 4 ? 'warn' : ''}">${a ? a + 'd' : 'today'}</span>`; };
  function boKpis() {
    const val = BO.reduce((a, b) => a + boVal(b), 0), cust = new Set(BO.map((b) => b.shop)).size, old = BO.reduce((a, b) => Math.max(a, ageOf(b.date)), 0), ready = BO.filter((b) => b.alloc > 0).length;
    const k = (t, ic, v, s, tone) => `<div class="kpi"><div class="kpi-top"><span>${t}</span><span class="icon-well ${tone || ''}"><i data-lucide="${ic}"></i></span></div><strong>${v}</strong><small>${s}</small></div>`;
    $('#ws2-r-kpis', RS).innerHTML = k('Pending lines', 'list-todo', BO.length, `${new Set(BO.map((b) => b.sku)).size} products`) + k('Pending value', 'banknote', 'Rs ' + fmt(val, 0), 'at tier rates incl. GST', 'teal') + k('Customers waiting', 'store', cust, 'across 3 routes', 'blue') + k('Oldest pending', 'clock-alert', old + ' days', old > 10 ? 'needs attention' : 'within SLA', old > 10 ? 'red' : 'yellow') + k('Ready to invoice', 'package-check', ready, 'stock allocated', 'lime');
    FS.icons($('#ws2-r-kpis', RS));
  }
  function boDetail(b, by) {
    const it = BY[b.sku], s = SHOP[b.shop], pct = Math.min(100, b.alloc / b.pend * 100);
    const st = b.alloc >= b.pend ? '<span class="badge good"><i data-lucide="package-check"></i>Ready</span>' : b.alloc > 0 ? '<span class="badge info">Part allocated</span>' : '<span class="badge neutral">Waiting</span>';
    return `<div class="ws2-bo-row${R.sel.has(b.id) ? ' sel' : ''}${b.fresh ? ' fresh' : ''}" data-id="${b.id}"><label class="ws2-c-cb"><input type="checkbox"${R.sel.has(b.id) ? ' checked' : ''} aria-label="Select back-order line"></label>
      <div class="ws2-bo-who">${by === 'item' ? `<b>${esc(s.name)}</b><small>${s.code} · ${s.tier} · <code class="ws2-code">${b.ref}</code></small>` : `<b>${esc(it.name)}</b><small>${it.sku} · <code class="ws2-code">${b.ref}</code></small>`}</div>
      <div class="ws2-bo-q"><b>${qtyStr(it, b.pend)}</b><small>${fmt(b.pend, 0)} ${esc(loose(it))}</small></div>
      <div class="ws2-bo-al"><span class="ws2-albar"><i style="width:${pct}%"></i></span><small>${b.alloc ? `${fmt(b.alloc, 0)} allocated${b.batch ? ' · ' + b.batch : ''}` : 'Nothing allocated'}</small></div>
      ${ageChip(b.date)}<span class="ws2-bo-st">${st}</span></div>`;
  }
  function boRender(flashIds) {
    const groups = {};
    BO.forEach((b) => { const k = R.view === 'item' ? b.sku : b.shop; (groups[k] = groups[k] || []).push(b); });
    const keys = Object.keys(groups).sort((a, b) => groups[b].reduce((x, y) => x + boVal(y), 0) - groups[a].reduce((x, y) => x + boVal(y), 0));
    const box = $('#ws2-r-list', RS);
    box.innerHTML = keys.length ? keys.map((k, gi) => {
      const g = groups[k], open = R.open.has(k), val = g.reduce((a, b) => a + boVal(b), 0), oldest = g.reduce((a, b) => Math.max(a, ageOf(b.date)), 0), allSel = g.every((b) => R.sel.has(b.id));
      let head;
      if (R.view === 'item') { const it = BY[k], pend = g.reduce((a, b) => a + b.pend, 0); head = `<span class="icon-well ${catIc(it)[1]}"><i data-lucide="${catIc(it)[0]}"></i></span><div class="ws2-bo-gt"><b>${esc(it.name)}</b><small>${it.sku} · on hand ${AV[k] > 0 ? qtyStr(it, AV[k]) : '<span class="ws2-bad">nil</span>'}</small></div><div class="ws2-bo-gm"><small>Pending</small><b>${qtyStr(it, pend)}</b></div>`; }
      else { const s = SHOP[k]; head = `<span class="avatar">${initials(s.name)}</span><div class="ws2-bo-gt"><b>${esc(s.name)}</b><small>${s.code} · ${esc(s.area)} · ${s.route}</small></div><div class="ws2-bo-gm"><small>Products</small><b>${g.length}</b></div>`; }
      return `<div class="ws2-bo-g${open ? ' open' : ''}" data-k="${k}" style="--i:${gi}"><div class="ws2-bo-gh" role="button" tabindex="0" aria-expanded="${open}"><label class="ws2-c-cb ws2-gcb"><input type="checkbox"${allSel ? ' checked' : ''} aria-label="Select group"></label><i data-lucide="chevron-right" class="ws2-chev"></i>${head}
        <div class="ws2-bo-gm"><small>${R.view === 'item' ? 'Customers' : 'Lines'}</small><b>${g.length}</b></div><div class="ws2-bo-gm"><small>Value</small><b>Rs ${fmt(val, 0)}</b></div><div class="ws2-bo-gm"><small>Oldest</small>${ageChip(g.reduce((a, b) => (ageOf(b.date) >= ageOf(a) ? b.date : a), g[0].date))}</div></div>
        <div class="ws2-bo-gb"><div>${g.sort((a, b) => ageOf(b.date) - ageOf(a.date)).map((b) => boDetail(b, R.view)).join('')}</div></div></div>`;
    }).join('') : '<div class="ws2-paste-empty"><i data-lucide="party-popper"></i><b>No back-orders</b><small>Every order has been delivered in full.</small></div>';
    FS.icons(box);
    (flashIds || []).forEach((id) => { const r = $(`.ws2-bo-row[data-id="${id}"]`, box); if (r) reflow(r, 'ws2-row-flash'); });
    BO.forEach((b) => { b.fresh = false; });
    boKpis(); boSel(); feedRender();
    $('#ws2-r-expand', RS).innerHTML = `<i data-lucide="chevrons-up-down"></i>${keys.length && keys.every((k) => R.open.has(k)) ? 'Collapse all' : 'Expand all'}`; FS.icons($('#ws2-r-expand', RS));
  }
  function boSel() {
    [...R.sel].forEach((id) => { if (!BO.some((b) => b.id === id)) R.sel.delete(id); });
    const n = R.sel.size, ready = BO.filter((b) => R.sel.has(b.id) && b.alloc > 0).length;
    $('#ws2-r-selt', RS).innerHTML = n ? `<b>${n}</b> line${n > 1 ? 's' : ''} selected · ${ready} with stock allocated` : 'Select lines to invoice or cancel';
    $('#ws2-r-conv', RS).disabled = !n; $('#ws2-r-cancel', RS).disabled = !n; $('#ws2-r-act', RS).classList.toggle('on', n > 0);
  }
  function feedRender() {
    const box = $('#ws2-r-feed', RS);
    box.innerHTML = FEED.map((f, i) => {
      const it = BY[f.sku], dem = BO.filter((b) => b.sku === f.sku && b.pend > b.alloc), need = dem.reduce((a, b) => a + b.pend - b.alloc, 0), done = R.feedDone.has(f.grn);
      return `<div class="ws2-fd ${f.status}${done ? ' done' : ''}" style="--i:${i}"><span class="ws2-fd-dot"></span><div class="ws2-fd-b"><div class="ws2-fd-top"><code class="ws2-code">${f.grn}</code><small>${f.status === 'transit' ? '<i data-lucide="truck"></i>' : '<i data-lucide="package-open"></i>'}${f.at}</small></div>
        <b>${esc(it.name)}</b><small>${esc(f.vendor)} · <b>${qtyStr(it, f.qty)}</b>${f.batches.length ? ` · ${f.batches.length} batches` : ''}</small>
        <div class="ws2-fd-foot">${done ? '<span class="badge good"><i data-lucide="check"></i>Allocated</span>' : f.status === 'transit' ? '<span class="badge neutral"><i data-lucide="truck"></i>In transit</span>' : need ? `<span class="ws2-fd-need">${dem.length} waiting · ${qtyStr(it, need)}</span><button class="btn primary sm" data-grn="${f.grn}"><i data-lucide="split"></i>Allocate</button>` : '<span class="ws2-muted">No back-orders waiting</span>'}</div></div></div>`;
    }).join('');
    FS.icons(box);
  }
  function allocPlan(f, pol) {
    const it = BY[f.sku];
    let cand = BO.filter((b) => b.sku === f.sku && b.pend > b.alloc).map((b) => ({ b, need: b.pend - b.alloc, give: 0, batch: '' }));
    const tierRank = { Distributor: 0, Wholesaler: 1, Retailer: 2 };
    if (pol === 'prio') cand.sort((x, y) => tierRank[SHOP[x.b.shop].tier] - tierRank[SHOP[y.b.shop].tier] || ageOf(y.b.date) - ageOf(x.b.date));
    else cand.sort((x, y) => ageOf(y.b.date) - ageOf(x.b.date));
    let left = f.qty;
    if (pol === 'fair') {
      const tot = cand.reduce((a, c) => a + c.need, 0);
      cand.forEach((c) => { c.give = Math.min(c.need, Math.floor(f.qty * c.need / Math.max(tot, f.qty))); left -= c.give; });
      cand.forEach((c) => { const add = Math.min(left, c.need - c.give); c.give += add; left -= add; });
    } else cand.forEach((c) => { c.give = Math.min(c.need, left); left -= c.give; });
    /* FEFO batch labels: earliest expiry first */
    const bs = (f.batches.length ? f.batches.slice().sort((a, b) => a.exp.localeCompare(b.exp)) : [{ no: f.grn.replace('GRN-2026-', 'B'), exp: '', qty: f.qty }]).map((x) => Object.assign({}, x));
    cand.forEach((c) => { let g = c.give; const used = []; for (const x of bs) { if (!g) break; const t = Math.min(g, x.qty); if (t > 0) { x.qty -= t; g -= t; used.push(x.no); } } c.batch = used.join(' + '); });
    return { it, cand, left };
  }
  function allocRender() {
    const f = R.last, pol = R.pol || 'fefo', { it, cand, left } = allocPlan(f, pol), given = f.qty - left;
    $('#ws2-al-title', RS).textContent = `Allocate ${f.grn}`;
    $('#ws2-al-sub', RS).innerHTML = `${esc(it.name)} · ${qtyStr(it, f.qty)} arrived from ${esc(f.vendor)}${f.batches.length ? ' · batches ' + f.batches.map((b) => `${b.no} (exp ${b.exp.slice(0, 7)})`).join(', ') : ''}`;
    $('#ws2-al-prev', RS).innerHTML = `<div class="ws2-al-sum"><div><small>Arrived</small><b>${fmt(f.qty, 0)}</b></div><div><small>Waiting</small><b>${fmt(cand.reduce((a, c) => a + c.need, 0), 0)}</b></div><div><small>Allocating</small><b class="ws2-good">${fmt(given, 0)}</b></div><div><small>To free stock</small><b>${fmt(left, 0)}</b></div></div>
      <table class="tbl ws2-al-tbl" data-plain><thead><tr><th>#</th><th>Customer</th><th>Age</th><th class="num">Pending</th><th>Allocate</th><th>Batch</th><th class="num">Still due</th></tr></thead><tbody>${cand.map((c, i) => { const s = SHOP[c.b.shop]; return `<tr style="--i:${i}"><td>${i + 1}</td><td><b>${esc(s.name)}</b><small>${s.tier} · <code class="ws2-code">${c.b.ref}</code></small></td><td>${ageChip(c.b.date)}</td><td class="num">${fmt(c.need, 0)}</td><td><div class="ws2-al-cell"><span class="ws2-albar lg"><i style="--w:${(c.give / c.need * 100).toFixed(1)}%"></i></span><b>${fmt(c.give, 0)}</b></div></td><td>${c.batch ? `<code class="ws2-code">${c.batch}</code>` : '<span class="ws2-dash">—</span>'}</td><td class="num">${c.need - c.give ? fmt(c.need - c.give, 0) : '<span class="ws2-good">0</span>'}</td></tr>`; }).join('')}</tbody></table>`;
    const go = $('#ws2-al-go', RS); $('span', go).textContent = `Allocate ${fmt(given, 0)} ${loose(it)}`;
    requestAnimationFrame(() => $$('#ws2-al-prev .ws2-albar i', RS).forEach((x) => x.classList.add('go')));
  }
  function mountBackorders(sec) {
    liftOverlays(sec);
    RS = sec;
    boRender();
    $('#ws2-r-view', sec).addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (!b || b.dataset.v === R.view) return; R.view = b.dataset.v; R.open = new Set(); const first = BO[0]; if (first) R.open.add(R.view === 'item' ? 'FD-5004' : first.shop); boRender(); reflow($('#ws2-r-list', sec), 'ws2-swap'); });
    $('#ws2-r-expand', sec).addEventListener('click', () => { const keys = $$('.ws2-bo-g', sec).map((g) => g.dataset.k); const allOpen = keys.every((k) => R.open.has(k)); R.open = allOpen ? new Set() : new Set(keys); boRender(); });
    const list = $('#ws2-r-list', sec);
    const toggle = (g) => { const k = g.dataset.k; if (R.open.has(k)) R.open.delete(k); else R.open.add(k); g.classList.toggle('open'); $('.ws2-bo-gh', g).setAttribute('aria-expanded', g.classList.contains('open')); };
    list.addEventListener('click', (e) => {
      if (e.target.closest('label.ws2-c-cb')) return;
      const gh = e.target.closest('.ws2-bo-gh'); if (gh) toggle(gh.parentElement);
    });
    list.addEventListener('keydown', (e) => { const gh = e.target.closest('.ws2-bo-gh'); if (gh && (e.key === 'Enter' || e.key === ' ') && e.target === gh) { e.preventDefault(); toggle(gh.parentElement); } });
    list.addEventListener('change', (e) => {
      if (e.target.type !== 'checkbox') return;
      const row = e.target.closest('.ws2-bo-row');
      if (row) { const id = +row.dataset.id; if (e.target.checked) R.sel.add(id); else R.sel.delete(id); row.classList.toggle('sel', e.target.checked); }
      else { const g = e.target.closest('.ws2-bo-g'); $$('.ws2-bo-row', g).forEach((r) => { const id = +r.dataset.id; if (e.target.checked) R.sel.add(id); else R.sel.delete(id); r.classList.toggle('sel', e.target.checked); $('input', r).checked = e.target.checked; }); if (e.target.checked && !g.classList.contains('open')) toggle(g); }
      boSel();
    });
    $('#ws2-r-feed', sec).addEventListener('click', (e) => { const b = e.target.closest('[data-grn]'); if (!b) return; R.last = FEED.find((f) => f.grn === b.dataset.grn); R.pol = 'fefo'; $$('#ws2-al-pol button', sec).forEach((x, i) => x.classList.toggle('active', !i)); allocRender(); FS.openModal('ws2-m-alloc'); });
    $('#ws2-al-pol', sec).addEventListener('click', (e) => { const b = e.target.closest('[data-p]'); if (!b) return; R.pol = b.dataset.p; allocRender(); });
    $('#ws2-al-go', sec).addEventListener('click', async (e) => {
      const btn = e.currentTarget, f = R.last, { cand } = allocPlan(f, R.pol || 'fefo');
      $$('#ws2-al-prev tbody tr', sec).forEach((tr, i) => setTimeout(() => tr.classList.add('ws2-al-done'), RM() ? 0 : i * 90));
      await busy(btn, 'Allocating…', 300 + cand.length * 90);
      cand.forEach((c) => { c.b.alloc += c.give; if (c.batch) c.b.batch = c.batch; });
      AV[f.sku] = (AV[f.sku] || 0) + f.qty - cand.reduce((a, c) => a + c.give, 0);
      R.feedDone.add(f.grn);
      FS.closeOverlay($('#ws2-m-alloc', sec));
      R.view === 'item' ? R.open.add(f.sku) : cand.forEach((c) => R.open.add(c.b.shop));
      boRender(cand.filter((c) => c.give).map((c) => c.b.id));
      FS.celebrate($('#ws2-r-list', sec), 'Allocated');
      FS.toast(`${f.grn} allocated to ${cand.filter((c) => c.give).length} back-orders`, { tone: 'good', action: { label: 'Select ready', fn: () => { BO.filter((b) => b.alloc > 0).forEach((b) => R.sel.add(b.id)); boRender(); } } });
    });
    $('#ws2-r-conv', sec).addEventListener('click', async (e) => {
      const sel = BO.filter((b) => R.sel.has(b.id)), ready = sel.filter((b) => b.alloc > 0);
      if (!ready.length) { FS.toast('None of the selected lines have stock allocated yet · allocate an arrival first', { tone: 'warn' }); shake($('#ws2-r-feed', sec)); return; }
      ready.forEach((b) => { const r = $(`.ws2-bo-row[data-id="${b.id}"]`, sec); if (r) r.classList.add('ws2-run'); });
      await busy(e.currentTarget, 'Invoicing…', 900);
      const shops = new Set(ready.map((b) => b.shop));
      ready.forEach((b) => { const r = $(`.ws2-bo-row[data-id="${b.id}"]`, sec); if (r && b.alloc >= b.pend) r.classList.add('row-out'); });
      await wait(300);
      ready.forEach((b) => { if (b.alloc >= b.pend) BO.splice(BO.indexOf(b), 1); else { b.pend -= b.alloc; b.alloc = 0; b.batch = ''; } R.sel.delete(b.id); });
      const n = shops.size; E.no += n; if (ES) $('#ws2-e-no', ES).textContent = 'WS-2026-' + String(E.no).padStart(6, '0');
      boRender(); if (OS) bkKpis();
      FS.celebrate(e.currentTarget, `${n} invoices`);
      FS.toast(`${n} invoice${n > 1 ? 's' : ''} created for ${ready.length} back-order lines${sel.length > ready.length ? ` · ${sel.length - ready.length} still waiting for stock` : ''}`, { tone: 'good' });
    });
    $('#ws2-r-cancel', sec).addEventListener('click', () => { $('#ws2-cn-sub', sec).textContent = `${R.sel.size} line${R.sel.size > 1 ? 's' : ''} will be closed and the customers notified by SMS.`; $('#ws2-cn-note', sec).value = ''; FS.openModal('ws2-m-cancel'); });
    $('#ws2-cn-go', sec).addEventListener('click', () => {
      const reason = ($('input[name=ws2-cn]:checked', sec) || {}).value || 'Cancelled';
      const gone = BO.filter((b) => R.sel.has(b.id));
      FS.closeOverlay($('#ws2-m-cancel', sec));
      gone.forEach((b) => { const r = $(`.ws2-bo-row[data-id="${b.id}"]`, sec); if (r) r.classList.add('row-out'); });
      setTimeout(() => {
        gone.forEach((b) => BO.splice(BO.indexOf(b), 1)); R.sel.clear(); boRender(); if (OS) bkKpis();
        FS.toast(`${gone.length} line${gone.length > 1 ? 's' : ''} cancelled · ${esc(reason)}`, { tone: 'warn', undo: () => { gone.forEach((b) => BO.push(b)); boRender(gone.map((b) => b.id)); } });
      }, RM() ? 0 : 320);
    });
  }

  /* ---------- route hooks ---------- */
  FS.onEnter('app/wholesale/entry', (sec, r, first) => { if (first) { mountEntry(sec); FS.icons(sec); } else { totals(); } });
  FS.onEnter('app/wholesale/bulk', (sec, r, first) => { if (first) { mountBulk(sec); FS.icons(sec); } else { mxRender(); sameRender(); } });
  FS.onEnter('app/wholesale/bookings', (sec, r, first) => { if (first) { mountBookings(sec); FS.icons(sec); } else bkRender(true); });
  FS.onEnter('app/wholesale/backorders', (sec, r, first) => { if (first) { mountBackorders(sec); FS.icons(sec); } else boRender(); });
})();
