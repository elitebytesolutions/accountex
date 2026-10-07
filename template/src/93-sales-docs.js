/* 93-sales-docs.js (Agent A): Sales Voucher · Sales Returns · Delivery Challans · POS.
   Loads after 95-ui.js. Everything is scoped to .sd-* / #sd-* and mounted through FS.onEnter. */
(function () {
  'use strict';
  if (!window.FS || !window.FS_DATA) return;
  const D = window.FS_DATA;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const RM = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = (v) => { const n = parseFloat(String(v).replace(/,/g, '')); return isFinite(n) ? n : 0; };
  const r2 = (n) => Math.round(n * 100) / 100;
  const fmt = (n, d = 2) => FS.fmt(n, d);
  const money = (n, d = 2) => FS.money(n, { dec: d });
  const BY_SKU = {}; D.items.forEach((it) => { BY_SKU[it.sku] = it; });
  const BY_CUST = {}; D.customers.forEach((c) => { BY_CUST[c.code] = c; });
  const hash = (s) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
  const isActive = (sec) => sec && sec.classList.contains('active');
  const anyOverlay = () => !!$('.overlay.open');

  /* ---------------- FS fallbacks (NEW v3 APIs may not exist yet) ---------------- */
  function renderNum(el, v, o) {
    const dec = o.dec == null ? 2 : o.dec, pre = o.prefix || '';
    const s = fmt(Math.abs(v), dec), parts = s.split('.');
    el.innerHTML = (v < 0 ? '−' : '') + pre + parts[0] + (parts[1] ? '<span class="dec">.' + parts[1] + '</span>' : '');
  }
  function tick(el, to, o = {}) {
    if (!el) return;
    if (typeof FS.tick === 'function') { try { FS.tick(el, to, o); el._sdv = to; return; } catch (e) { /* fall through */ } }
    const from = el._sdv == null ? 0 : el._sdv;
    el._sdv = to;
    if (RM() || from === to) { renderNum(el, to, o); return; }
    const t0 = performance.now(), dur = 520, id = (el._sdt = (el._sdt || 0) + 1);
    const step = (now) => {
      if (id !== el._sdt) return;
      const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      renderNum(el, from + (to - from) * e, o);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    el.classList.remove('sd-bump'); void el.offsetWidth; el.classList.add('sd-bump');
  }
  function celebrate(el) {
    if (typeof FS.celebrate === 'function') { try { FS.celebrate(el); return; } catch (e) { /* fall through */ } }
    const r = el ? el.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
    const b = document.createElement('div');
    b.className = 'sd-burst';
    b.style.left = r.left + r.width / 2 + 'px'; b.style.top = r.top + r.height / 2 + 'px';
    let h = '<span class="sd-burst-ok"><i data-lucide="check"></i></span>';
    for (let i = 0; i < 16; i++) h += `<i class="sd-conf" style="--a:${i * 22.5}deg;--d:${60 + (i % 4) * 18}px;--c:${['var(--lime)', 'var(--primary)', 'var(--mint)', 'var(--warn)'][i % 4]}"></i>`;
    b.innerHTML = h;
    document.body.appendChild(b); FS.icons(b);
    setTimeout(() => b.remove(), 1300);
  }
  function skeleton(el, ms = 600) {
    if (!el) return;
    if (typeof FS.skeleton === 'function') { try { FS.skeleton(el, ms); return; } catch (e) { /* fall through */ } }
    el.classList.add('sd-skel');
    setTimeout(() => el.classList.remove('sd-skel'), ms);
  }
  function confirmBox(o) {
    if (typeof FS.confirm === 'function') return FS.confirm(o);
    return Promise.resolve(window.confirm(o.text || o.title));
  }
  function busy(btn, label, ms = 1000) {
    return new Promise((res) => {
      if (!btn || btn.classList.contains('sd-busy')) return;
      const sp = btn.querySelector('span'), old = sp ? sp.textContent : '';
      btn.classList.add('sd-busy'); btn.disabled = true;
      btn.style.setProperty('--sd-ms', ms + 'ms');
      if (sp) sp.textContent = label;
      setTimeout(() => { btn.classList.remove('sd-busy'); btn.disabled = false; if (sp) sp.textContent = old; res(); }, ms);
    });
  }
  function shake(el) { if (!el) return; el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); setTimeout(() => el.classList.remove('shake'), 500); }
  function flashRow(tr) { if (!tr) return; tr.classList.remove('row-flash'); void tr.offsetWidth; tr.classList.add('row-flash'); }
  function bump(el) { if (!el) return; el.classList.remove('sd-pop'); void el.offsetWidth; el.classList.add('sd-pop'); }
  const nowTime = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };

  /* Small anchored popover for Held lists */
  function popList(anchor, title, rows, onPick, empty) {
    $$('.sd-pop-list').forEach((p) => p.remove());
    const p = document.createElement('div');
    p.className = 'sd-pop-list';
    p.innerHTML = `<div class="sd-pop-h"><b>${title}</b><small>${rows.length} held</small></div>` +
      (rows.length ? rows.map((r, i) => `<button data-i="${i}"><span class="icon-well sm"><i data-lucide="pause"></i></span><div><b>${esc(r.t)}</b><small>${esc(r.s)}</small></div><strong>${r.v}</strong></button>`).join('') : `<p class="sd-pop-empty">${empty}</p>`);
    document.body.appendChild(p); FS.icons(p);
    const rc = anchor.getBoundingClientRect();
    const w = p.offsetWidth, h = p.offsetHeight;
    let left = Math.min(innerWidth - w - 10, Math.max(10, rc.right - w)), top = rc.bottom + 8;
    if (top + h > innerHeight - 10) top = rc.top - h - 8;
    p.style.left = left + 'px'; p.style.top = top + 'px';
    p.addEventListener('click', (e) => { const b = e.target.closest('button[data-i]'); if (!b) return; p.remove(); onPick(+b.dataset.i); });
    setTimeout(() => {
      const off = (e) => { if (!p.contains(e.target)) { p.remove(); document.removeEventListener('mousedown', off, true); } };
      document.addEventListener('mousedown', off, true);
    }, 0);
  }

  /* Amount in words (Pakistani style: thousand / lakh / crore) */
  function words(n) {
    const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const two = (x) => (x < 20 ? a[x] : b[Math.floor(x / 10)] + (x % 10 ? ' ' + a[x % 10] : ''));
    const three = (x) => (x >= 100 ? a[Math.floor(x / 100)] + ' Hundred' + (x % 100 ? ' ' + two(x % 100) : '') : two(x));
    n = Math.floor(n);
    if (!n) return 'Zero';
    const parts = [];
    const cr = Math.floor(n / 1e7); n %= 1e7;
    const lk = Math.floor(n / 1e5); n %= 1e5;
    const th = Math.floor(n / 1e3); n %= 1e3;
    if (cr) parts.push(three(cr) + ' Crore');
    if (lk) parts.push(two(lk) + ' Lakh');
    if (th) parts.push(two(th) + ' Thousand');
    if (n) parts.push(three(n));
    return parts.join(' ');
  }

  /* ---------------- shared local data ---------------- */
  const CUSTX = {
    'CUST-0001': ['Sector H-8/4, Pitras Bukhari Road', 'H-8', 'procurement@shifa.com.pk'],
    'CUST-0002': ['72 Main Boulevard, Gulberg III', 'Gulberg', 'purchase@citymart.pk'],
    'CUST-0003': ['E-110 Khayaban-e-Jinnah', 'DHA', 'stores@fatima-group.com'],
    'CUST-0004': ['4th Floor, Packages House, Walton Road', 'Kot Lakhpat', 'supply@packages.com.pk'],
    'CUST-0005': ['Agha Khan Road, Shalimar 5', 'Blue Area', 'purchase@hashoohotels.com'],
    'CUST-0006': ['Shop 3, Main Market, Gulberg II', 'Gulberg', 'buying@alfatah.pk'],
    'CUST-0007': ['Thokar Niaz Baig, Multan Road', 'Johar Town', 'vendors@metro.pk'],
    'CUST-0008': ['Harbour Front, Clifton Block 4', 'Clifton', 'procure@engrofoods.com'],
    'CUST-0009': ['Khurrianwala, Sheikhupura Road', 'Satiana Road', 'stores@interloop-pk.com'],
    'CUST-0010': ['Counter sale', 'Kot Lakhpat', '—'],
  };
  const AREAS = { Lahore: ['Gulberg', 'DHA', 'Johar Town', 'Kot Lakhpat', 'Model Town'], Karachi: ['Clifton', 'SITE', 'Korangi'], Islamabad: ['Blue Area', 'H-8', 'F-7'], Faisalabad: ['Satiana Road', 'Madina Town'] };
  const CAT = {
    Packaging: ['package', 'green'], 'Office Supplies': ['paperclip', 'blue'], Safety: ['hard-hat', 'orange'],
    Electrical: ['lightbulb', 'violet'], FMCG: ['shopping-basket', 'lime'], 'IT Accessories': ['mouse', 'red'],
  };
  const catIc = (it) => (CAT[it.cat] || ['package', 'green']);
  const batchesOf = (it) => {
    const h = hash(it.sku), perish = it.cat === 'FMCG' || it.cat === 'Safety';
    return [0, 1, 2].map((k) => {
      const code = it.sku.slice(0, 1) + (((h >> (k * 4)) % 9000) + 1000);
      const m = ((h + k * 5) % 12) + 1, y = 27 + k;
      return { code, exp: perish ? String(m).padStart(2, '0') + '/' + y : '' };
    });
  };
  const lastPrice = (it, cust) => r2(it.price * (1 - ((hash(it.sku + cust) % 5) / 100)));

  /* ======================= Product autocomplete popover ======================= */
  const AC = { el: null, input: null, list: [], idx: 0, onPick: null };
  function acEnsure() {
    if (AC.el) return AC.el;
    AC.el = document.createElement('div');
    AC.el.className = 'sd-ac';
    AC.el.addEventListener('mousedown', (e) => {
      const b = e.target.closest('[data-sku]'); if (!b) return;
      e.preventDefault(); acPick(b.dataset.sku);
    });
    document.body.appendChild(AC.el);
    window.addEventListener('scroll', (e) => { if (AC.input && !(AC.el.contains(e.target))) acPlace(); }, true);
    window.addEventListener('resize', () => acClose());
    return AC.el;
  }
  function acOpen(input, onPick, cust) {
    acEnsure();
    AC.input = input; AC.onPick = onPick; AC.cust = cust || 'CUST-0002';
    acFilter(input.dataset.acq != null ? input.dataset.acq : '');
  }
  function acFilter(q) {
    if (!AC.input) return;
    q = (q || '').trim().toLowerCase();
    AC.list = D.items.filter((it) => !q || (it.name + ' ' + it.sku + ' ' + it.upc + ' ' + it.brand + ' ' + it.cat).toLowerCase().includes(q)).slice(0, 8);
    AC.idx = 0;
    const hl = (s) => { if (!q) return esc(s); const i = s.toLowerCase().indexOf(q); return i < 0 ? esc(s) : esc(s.slice(0, i)) + '<mark>' + esc(s.slice(i, i + q.length)) + '</mark>' + esc(s.slice(i + q.length)); };
    AC.el.innerHTML = `<div class="sd-ac-h"><span>Products</span><small><kbd class="kbd">↑</kbd><kbd class="kbd">↓</kbd> move <kbd class="kbd">Enter</kbd> pick <kbd class="kbd">Esc</kbd> close</small></div>` +
      (AC.list.length ? AC.list.map((it, i) => {
        const [ic, tone] = catIc(it);
        const st = it.stock <= 0 ? 'out' : it.stock < 50 ? 'low' : 'ok';
        return `<div class="sd-ac-row${i === 0 ? ' on' : ''}" data-sku="${it.sku}" data-i="${i}"><span class="icon-well sm ${tone === 'green' ? '' : tone}"><i data-lucide="${ic}"></i></span><div class="sd-ac-main"><b>${hl(it.name)}</b><small>${hl(it.sku)} · ${esc(it.brand)} · ${esc(it.pack)}</small></div><span class="sd-ac-stock ${st}">${st === 'out' ? 'Out of stock' : fmt(it.stock, 0) + ' ' + esc(it.unit)}</span><div class="sd-ac-price"><b>Rs ${fmt(it.price, 0)}</b><small>Last Rs ${fmt(lastPrice(it, AC.cust), 2)}</small></div></div>`;
      }).join('') : '<div class="sd-ac-empty">No product matches “' + esc(q) + '”. <b>New Product</b> to add it.</div>');
    FS.icons(AC.el);
    AC.el.classList.add('open');
    acPlace();
  }
  function acPlace() {
    if (!AC.input || !AC.el.classList.contains('open')) return;
    const r = AC.input.getBoundingClientRect();
    if (!r.width) { acClose(); return; }
    const w = Math.min(innerWidth - 20, Math.max(r.width, 520));
    AC.el.style.width = w + 'px';
    const h = AC.el.offsetHeight;
    let left = Math.min(r.left, innerWidth - w - 10), top = r.bottom + 6;
    if (top + h > innerHeight - 10 && r.top - h - 6 > 0) top = r.top - h - 6;
    AC.el.style.left = Math.max(10, left) + 'px'; AC.el.style.top = top + 'px';
  }
  function acClose() { if (AC.el) AC.el.classList.remove('open'); AC.input = null; }
  const acIsOpen = (input) => AC.el && AC.el.classList.contains('open') && AC.input === input;
  function acMove(d) {
    if (!AC.list.length) return;
    AC.idx = (AC.idx + d + AC.list.length) % AC.list.length;
    $$('.sd-ac-row', AC.el).forEach((r, i) => r.classList.toggle('on', i === AC.idx));
    const on = $('.sd-ac-row.on', AC.el); if (on) on.scrollIntoView({ block: 'nearest' });
  }
  function acPick(sku) {
    const fn = AC.onPick, input = AC.input;
    acClose();
    if (fn && sku) fn(sku, input);
  }
  /* returns true when the key was consumed by the popover */
  function acKey(e, input) {
    if (!acIsOpen(input)) return false;
    if (e.key === 'ArrowDown') { e.preventDefault(); acMove(1); return true; }
    if (e.key === 'ArrowUp') { e.preventDefault(); acMove(-1); return true; }
    if (e.key === 'Enter' || (e.key === 'Tab' && AC.list.length && input.value.trim())) { if (!AC.list.length) return false; e.preventDefault(); acPick(AC.list[AC.idx].sku); return true; }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); acClose(); return true; }
    return false;
  }

  /* ============================================================================
     1) SALES VOUCHER
     ========================================================================== */
  const SV = { lines: [], uid: 0, seq: 123, inv: 147, held: [], cust: 'CUST-0002', mounted: false };
  const SV_FIELDS = ['prod', 'batch', 'qty', 'bonus', 'rate', 'disc', 'gst'];
  function svLine(sku, qty, disc, bonus) {
    const it = sku ? BY_SKU[sku] : null;
    const l = { id: ++SV.uid, sku: sku || '', qty: qty || 0, bonus: 0, bonusManual: false, rate: it ? it.price : 0, disc: disc || 0, gst: it ? it.gst : 18, batch: it ? batchesOf(it)[0].code : '' };
    if (bonus != null) { l.bonus = bonus; l.bonusManual = true; } else applyScheme(l);
    return l;
  }
  function applyScheme(l) {
    if (l.bonusManual || !l.sku) return false;
    const b = l.qty >= 10 ? Math.floor(l.qty / 10) : 0;
    const changed = b !== l.bonus; l.bonus = b; return changed;
  }
  function calc(l) {
    const gross = l.qty * l.rate, disc = gross * l.disc / 100, taxable = gross - disc, gst = taxable * l.gst / 100, net = taxable + gst;
    return { gross, disc, gst, net, nrate: l.qty ? net / l.qty : 0 };
  }
  function svRowHtml(l, i) {
    const it = BY_SKU[l.sku];
    const c = calc(l);
    const bt = it ? batchesOf(it) : [];
    const batchOpts = it ? bt.map((b) => `<option value="${b.code}"${b.code === l.batch ? ' selected' : ''}>${b.exp ? b.code + ' · ' + b.exp : b.code}</option>`).join('') : '<option value="">—</option>';
    const gstOpts = [0, 5, 10, 17, 18].map((g) => `<option${g === l.gst ? ' selected' : ''}>${g}</option>`).join('');
    return `<tr data-id="${l.id}">
      <td class="sd-c-idx">${i + 1}</td>
      <td class="sd-c-prod"><div class="sd-prod"><input class="cell-input" data-f="prod" value="${it ? esc(it.name) : ''}" placeholder="Type to search product…" autocomplete="off"><button class="sd-prod-dd" tabindex="-1" aria-label="Browse products"><i data-lucide="chevron-down"></i></button></div>
        <div class="sd-meta">${svMeta(l)}</div></td>
      <td><span class="sd-pack">${it ? esc(it.pack) : '—'}</span></td>
      <td><select class="cell-input" data-f="batch"${it ? '' : ' disabled'}>${batchOpts}</select></td>
      <td><input class="cell-input num" data-f="qty" inputmode="decimal" value="${l.qty || ''}"></td>
      <td><input class="cell-input num${l.bonus && !l.bonusManual ? ' sd-auto' : ''}" data-f="bonus" inputmode="decimal" value="${l.bonus || ''}" placeholder="0"></td>
      <td><input class="cell-input num" data-f="rate" inputmode="decimal" value="${l.rate ? l.rate.toFixed(2) : ''}"></td>
      <td class="num sd-out" data-o="gross">${fmt(c.gross)}</td>
      <td><input class="cell-input num" data-f="disc" inputmode="decimal" value="${l.disc || 0}"></td>
      <td><select class="cell-input" data-f="gst">${gstOpts}</select></td>
      <td class="num sd-out" data-o="nrate">${fmt(c.nrate)}</td>
      <td class="num sd-out sd-strong" data-o="net">${fmt(c.net)}</td>
      <td class="sd-c-del"><button class="sd-del" aria-label="Delete line"><i data-lucide="trash-2"></i></button></td>
    </tr>`;
  }
  function svMeta(l) {
    const it = BY_SKU[l.sku];
    if (!it) return '<span class="sd-meta-empty">No product selected · type or press ↓</span>';
    const need = l.qty + l.bonus, over = need > it.stock;
    const scheme = l.bonus > 0 && !l.bonusManual;
    return `<code>${it.sku}</code><span class="sd-stock ${over ? 'bad' : it.stock < 50 ? 'low' : ''}" title="${fmt(it.stock, 0)} ${esc(it.unit)} on hand${over ? ' · short by ' + fmt(need - it.stock, 0) : ''}"><i data-lucide="${over ? 'triangle-alert' : 'box'}"></i>${fmt(it.stock, 0)}${over ? ' · short ' + fmt(need - it.stock, 0) : ''}</span>${scheme ? '<span class="sd-scheme" title="Buy 10 get 1 free"><i data-lucide="gift"></i>Scheme applied</span>' : ''}`;
  }
  function svRender(sec, flashId) {
    const tb = $('#sd-sv-grid tbody', sec);
    tb.innerHTML = SV.lines.map(svRowHtml).join('');
    FS.icons(tb);
    if (flashId) flashRow($(`tr[data-id="${flashId}"]`, tb));
    svTotals(sec);
  }
  function svUpdateRow(sec, l) {
    const tr = $(`#sd-sv-grid tr[data-id="${l.id}"]`, sec); if (!tr) return;
    const c = calc(l);
    $('[data-o=gross]', tr).textContent = fmt(c.gross);
    $('[data-o=nrate]', tr).textContent = fmt(c.nrate);
    $('[data-o=net]', tr).textContent = fmt(c.net);
    const bi = $('[data-f=bonus]', tr);
    if (document.activeElement !== bi) bi.value = l.bonus || '';
    bi.classList.toggle('sd-auto', !!l.bonus && !l.bonusManual);
    const meta = $('.sd-meta', tr);
    const before = !!$('.sd-scheme', meta);
    meta.innerHTML = svMeta(l); FS.icons(meta);
    const after = $('.sd-scheme', meta);
    if (after && !before) { bump(after); bump(bi); }
    svTotals(sec);
  }
  function svTotals(sec) {
    let items = 0, qty = 0, gross = 0, disc = 0, gst = 0, net = 0;
    SV.lines.forEach((l) => { if (!l.sku) return; const c = calc(l); items++; qty += l.qty; gross += c.gross; disc += c.disc; gst += c.gst; net += c.net; });
    const T = (k) => $(`#sd-sv-tot [data-t=${k}]`, sec);
    tick(T('items'), items, { dec: 0 }); tick(T('qty'), qty, { dec: 0 });
    tick(T('gross'), gross, { dec: 2 }); tick(T('disc'), disc, { dec: 2 }); tick(T('gst'), gst, { dec: 2 });
    tick(T('net'), net, { dec: 2, prefix: 'Rs ' });
    SV.net = net; SV.totals = { items, qty, gross, disc, gst, net };
    svCredit(sec);
  }
  function svCredit(sec) {
    const c = BY_CUST[SV.cust]; const box = $('#sd-sv-credit', sec);
    if (!c || !c.limit) { box.classList.add('sd-na'); $('#sd-sv-credit-pct', sec).textContent = 'Cash'; $('#sd-sv-credit-t', sec).textContent = 'No credit facility · cash customer'; $('.sd-g-bal', box).style.width = '0%'; $('.sd-g-bill', box).style.width = '0%'; return; }
    box.classList.remove('sd-na');
    const bal = c.balance, bill = SV.net || 0, lim = c.limit;
    const pb = Math.min(100, bal / lim * 100), pn = Math.min(100 - pb, bill / lim * 100), pct = (bal + bill) / lim * 100;
    $('.sd-g-bal', box).style.width = pb + '%';
    $('.sd-g-bill', box).style.left = pb + '%';
    $('.sd-g-bill', box).style.width = pn + '%';
    box.classList.toggle('warn', pct > 80 && pct <= 100);
    box.classList.toggle('over', pct > 100);
    $('#sd-sv-credit-pct', sec).textContent = Math.round(pct) + '%';
    $('#sd-sv-credit-t', sec).innerHTML = `Balance Rs ${fmt(bal, 0)} + this bill Rs ${fmt(bill, 0)} of Rs ${fmt(lim, 0)} limit${pct > 100 ? ' · <b>over limit</b>' : ''}`;
  }
  function svSetCustomer(sec, code, animate) {
    SV.cust = code;
    const c = BY_CUST[code], x = CUSTX[code] || ['', '', ''];
    $('#sd-sv-cust', sec).value = code;
    $('#sd-sv-cname', sec).value = c.name;
    const city = $('#sd-sv-city', sec); city.value = c.city;
    svAreas(sec, c.city, x[1]);
    $('#sd-sv-addr-t', sec).textContent = x[0] + ', ' + x[1] + ', ' + c.city;
    $('#sd-sv-addr-m', sec).innerHTML = `${esc(c.phone)} · NTN ${esc(c.ntn)} · <span class="sd-grp">${esc(c.group)}</span>`;
    if (animate) { const a = $('#sd-sv-addr', sec); a.classList.remove('sd-swap'); void a.offsetWidth; a.classList.add('sd-swap'); }
    svCredit(sec);
  }
  function svAreas(sec, city, pick) {
    const s = $('#sd-sv-area', sec);
    s.innerHTML = (AREAS[city] || ['—']).map((a) => `<option${a === pick ? ' selected' : ''}>${a}</option>`).join('');
  }
  const svFind = (id) => SV.lines.find((l) => l.id === id);
  function svAddRow(sec, sku, focus = 'prod') {
    const l = svLine(sku, sku ? 1 : 0);
    SV.lines.push(l);
    svRender(sec, l.id);
    const tr = $(`#sd-sv-grid tr[data-id="${l.id}"]`, sec);
    if (tr && focus) { const f = $(`[data-f=${focus}]`, tr); if (f) { f.focus(); if (f.select) f.select(); } tr.scrollIntoView({ block: 'nearest', behavior: RM() ? 'auto' : 'smooth' }); }
    return l;
  }
  function svPickInto(sec, l, sku) {
    const it = BY_SKU[sku];
    l.sku = sku; l.rate = it.price; l.gst = it.gst; l.batch = batchesOf(it)[0].code; if (!l.qty) l.qty = 1;
    l.bonusManual = false; applyScheme(l);
    const tr = $(`#sd-sv-grid tr[data-id="${l.id}"]`, sec);
    const tmp = document.createElement('tbody'); tmp.innerHTML = svRowHtml(l, SV.lines.indexOf(l));
    const nt = tmp.firstElementChild; tr.replaceWith(nt); FS.icons(nt); flashRow(nt);
    if (it.stock <= 0) FS.toast(`${esc(it.name)} is out of stock at ${esc($('#sd-sv-wh', sec).value)}`, { tone: 'warn' });
    svTotals(sec);
    const q = $('[data-f=qty]', nt); q.focus(); q.select();
  }
  function svFocusNext(sec, el, wrapAdd) {
    const tr = el.closest('tr'), f = el.dataset.f, k = SV_FIELDS.indexOf(f);
    if (k < SV_FIELDS.length - 1) {
      for (let j = k + 1; j < SV_FIELDS.length; j++) { const n = $(`[data-f=${SV_FIELDS[j]}]`, tr); if (n && !n.disabled) { n.focus(); if (n.select) n.select(); return; } }
    }
    const next = tr.nextElementSibling;
    if (next) { const p = $('[data-f=prod]', next); p.focus(); p.select(); return; }
    if (wrapAdd) svAddRow(sec, null, 'prod');
  }
  function svPrintHtml() {
    const c = BY_CUST[SV.cust], x = CUSTX[SV.cust] || ['', '', ''], t = SV.totals || {};
    const lines = SV.lines.filter((l) => l.sku);
    const inv = 'INV-2026-' + String(SV.inv).padStart(6, '0');
    const fbr = '4271839-6' + '-011026-' + (hash(inv) % 0xffffff).toString(16).toUpperCase().padStart(6, '0');
    return `<div class="paper sd-paper">
      <div class="paper-head"><div><h2>${esc(D.company.name)}</h2><p class="sd-pmuted">${esc(D.company.address)}<br>NTN ${D.company.ntn} · STRN ${D.company.strn} · ${esc(D.company.phone)}</p></div>
      <div class="doc-title"><h2>Sales Tax Invoice</h2><b>${inv}</b><p class="sd-pmuted">01 Oct 2026 · ${'SV-2026-' + String(SV.seq).padStart(6, '0')}</p></div></div>
      <div class="paper-meta">
        <div><small>Bill to</small><b>${esc(c.name)}</b><div class="sd-pmuted">${esc(x[0])}, ${esc(c.city)}<br>NTN ${esc(c.ntn)}</div></div>
        <div><small>Customer PO</small><b>PO-78956</b><div class="sd-pmuted">29 Sep 2026</div></div>
        <div><small>Terms</small><b>Net 30</b><div class="sd-pmuted">Due 31 Oct 2026</div></div>
        <div><small>Salesman</small><b>Zainab Raza</b><div class="sd-pmuted">Booker Bilal Khan</div></div>
      </div>
      <table class="tbl" data-plain><thead><tr><th>#</th><th>Item</th><th class="num">Qty</th><th class="num">Bonus</th><th class="num">Rate</th><th class="num">Disc</th><th class="num">GST</th><th class="num">Amount</th></tr></thead><tbody>
      ${lines.map((l, i) => { const it = BY_SKU[l.sku], k = calc(l); return `<tr><td>${i + 1}</td><td><b>${esc(it.name)}</b><small>${it.sku} · Batch ${l.batch}</small></td><td class="num">${fmt(l.qty, 0)}</td><td class="num">${l.bonus || '—'}</td><td class="num">${fmt(l.rate)}</td><td class="num">${l.disc}%</td><td class="num">${fmt(k.gst)}</td><td class="num"><b>${fmt(k.net)}</b></td></tr>`; }).join('')}
      </tbody></table>
      <div class="sd-paper-bot">
        <div class="sd-fbr"><span class="qr"></span><div><b>FBR Invoice No.</b><code>${fbr}</code><small>Reported to FBR in real time via PRAL IRIS. Scan to verify with the Tax Asaan app.</small></div></div>
        <div class="paper-totals">
          <div><span>Gross amount</span><b>${fmt(t.gross || 0)}</b></div>
          <div><span>Discount</span><b>− ${fmt(t.disc || 0)}</b></div>
          <div><span>Sales tax (GST)</span><b>${fmt(t.gst || 0)}</b></div>
          <div class="grand"><span>Net payable</span><span>${money(t.net || 0)}</span></div>
        </div>
      </div>
      <div class="paper-foot"><span><b>Amount in words:</b> Rupees ${words(t.net || 0)} Only</span><span>Prepared by Sana Javed · Authorised signatory ____________</span></div>
    </div>`;
  }
  function svPrint() {
    const d = FS.drawer({ title: 'Print preview', subtitle: 'Sales tax invoice · A4 portrait', wide: true, html: svPrintHtml(), foot: '<button class="btn secondary" data-close>Close</button><button class="btn secondary" data-sd="pdf"><i data-lucide="download"></i>Download PDF</button><button class="btn primary" data-sd="print"><i data-lucide="printer"></i>Print</button>' });
    d.classList.add('sd-print-drawer'); d.style.width = 'min(880px,100vw)';
    d.addEventListener('click', (e) => {
      const b = e.target.closest('[data-sd]'); if (!b) return;
      if (b.dataset.sd === 'print') FS.toast('Sent to HP LaserJet · Accounts (2 copies)');
      else FS.toast('PDF saved · ' + 'INV-2026-' + String(SV.inv).padStart(6, '0') + '.pdf');
    });
  }
  function svPost(sec, viaPay) {
    const btn = viaPay ? $('#sd-sv-paybtn', sec) : $('#sd-sv-post', sec);
    if (!SV.lines.some((l) => l.sku && l.qty > 0)) { FS.toast('Add at least one product line before posting', { tone: 'warn' }); shake($('.sd-items', sec)); return; }
    const inv = 'INV-2026-' + String(SV.inv).padStart(6, '0'), net = SV.net;
    busy(btn, 'Posting…', 1100).then(() => {
      celebrate(viaPay ? $('.sd-net b', sec) : btn);
      FS.toast(`${inv} posted · Rs ${fmt(net)}${viaPay ? ' · payment received' : ''}`, { tone: 'good', ms: 6000, action: { label: 'View invoice', fn: () => FS.go('app/sales/invoices/view') } });
      SV.seq++; SV.inv++;
      $('#sd-sv-no', sec).textContent = 'SV-2026-' + String(SV.seq).padStart(6, '0');
      $('#sd-sv-inv', sec).textContent = 'INV-2026-' + String(SV.inv).padStart(6, '0');
      bump($('#sd-sv-no', sec));
      SV.lines = [svLine(null, 0)];
      svRender(sec);
    });
  }
  /* ---- Receive payment modal ---- */
  const TENDERS = [
    { m: 'Cash', ic: 'banknote', sub: 'Lahore HQ drawer', tone: '' },
    { m: 'Card', ic: 'credit-card', sub: 'HBL POS terminal · ref', tone: 'blue' },
    { m: 'Credit', ic: 'notebook-tabs', sub: 'On account', tone: 'orange' },
    { m: 'JazzCash', ic: 'smartphone', sub: 'Wallet 0300-xxxx · TID', tone: 'red' },
    { m: 'Easypaisa', ic: 'wallet', sub: 'Wallet · TID', tone: 'violet' },
  ];
  function payOpen(sec) {
    if (!SV.lines.some((l) => l.sku && l.qty > 0)) { FS.toast('Nothing to collect yet: add a product line first', { tone: 'warn' }); return; }
    const c = BY_CUST[SV.cust];
    const rows = $('#sd-pay-rows', sec);
    rows.innerHTML = TENDERS.map((t, i) => `<div class="sd-prow" style="--i:${i}"><span class="icon-tile sd-tile-sm ${t.tone}"><i data-lucide="${t.ic}"></i></span><div class="sd-prow-t"><b>${t.m}</b><small>${t.m === 'Credit' ? 'On account · balance Rs ' + fmt(c.balance, 0) : t.sub}</small></div>${t.m !== 'Cash' && t.m !== 'Credit' ? '<input class="cell-input sd-pref" placeholder="Ref / TID">' : '<span></span>'}<div class="sd-pamt"><span>Rs</span><input class="cell-input num" data-m="${t.m}" inputmode="decimal" value="${i === 0 ? r2(SV.net).toFixed(2) : ''}" placeholder="0.00"></div><button class="btn ghost sm sd-rest" data-m="${t.m}">Rest</button></div>`).join('');
    $('#sd-pay-tender', sec).value = '';
    FS.openModal('sd-sv-pay');
    FS.icons(rows);
    payCalc(sec);
    setTimeout(() => { const f = $('#sd-pay-tender', sec); if (f) f.focus(); }, 250);
  }
  function payCalc(sec) {
    const net = r2(SV.net || 0);
    let paid = 0, cash = 0, credit = 0;
    $$('#sd-pay-rows input[data-m]', sec).forEach((i) => { const v = num(i.value); paid += v; if (i.dataset.m === 'Cash') cash = v; if (i.dataset.m === 'Credit') credit = v; });
    const rem = r2(net - paid);
    $('#sd-pay-net', sec).innerHTML = money(net);
    tick($('#sd-pay-paid', sec), paid, { prefix: 'Rs ' });
    const remEl = $('#sd-pay-rem', sec);
    remEl.closest('div').classList.toggle('done', Math.abs(rem) < 0.01);
    remEl.closest('div').classList.toggle('excess', rem < -0.009);
    $('small', remEl.closest('div')).textContent = rem < -0.009 ? 'Excess' : 'Remaining';
    tick(remEl, Math.abs(rem), { prefix: 'Rs ' });
    $('#sd-pay-fill', sec).style.width = Math.min(100, net ? paid / net * 100 : 0) + '%';
    const tend = num($('#sd-pay-tender', sec).value);
    const ch = tend ? tend - cash : 0;
    const chBox = $('.sd-change', sec);
    chBox.classList.toggle('short', ch < 0);
    $('small', chBox).textContent = ch < 0 ? 'Cash short' : 'Change due';
    tick($('#sd-pay-change', sec), Math.abs(ch), { prefix: 'Rs ' });
    const c = BY_CUST[SV.cust], warn = $('#sd-pay-warn', sec);
    if (credit > 0 && (!c.limit || c.balance + credit > c.limit)) {
      warn.hidden = false;
      $('#sd-pay-warn-t', sec).textContent = c.limit ? `${c.name} will be at Rs ${fmt(c.balance + credit, 0)} against a Rs ${fmt(c.limit, 0)} limit. Posting needs Finance Manager approval.` : `${c.name} has no credit facility.`;
    } else warn.hidden = true;
    $('#sd-pay-ok', sec).disabled = Math.abs(rem) > 0.009 || ch < 0;
  }

  function mountVoucher(sec) {
    const cs = $('#sd-sv-cust', sec);
    cs.innerHTML = D.customers.map((c) => `<option value="${c.code}">${esc(c.name)}</option>`).join('');
    $$('[data-team]', sec).forEach((s, k) => { s.innerHTML = D.salesTeam[s.dataset.team].map((n) => `<option>${esc(n)}</option>`).join(''); s.selectedIndex = [0, 1, 0, 0][k] || 0; });
    $('[data-team=salesmen]', sec).value = 'Zainab Raza';
    $('#sd-sv-wh', sec).innerHTML = D.warehouses.map((w) => `<option>${esc(w)}</option>`).join('');
    SV.lines = [svLine('PK-1001', 50, 2), svLine('PK-1003', 24, 0), svLine('OF-2002', 10, 0), svLine('FD-5002', 12, 2.5), svLine('FD-5004', 20, 0)];
    SV.held = [{ no: 'SV-2026-000121', cust: 'CUST-0007', at: '10:42', lines: [svLine('FD-5001', 144, 3), svLine('FD-5003', 24, 0), svLine('IN-3001', 10, 5)] }];
    svSetCustomer(sec, SV.cust, false);
    svRender(sec);
    $('#sd-sv-heldn', sec).textContent = SV.held.length;

    cs.addEventListener('change', () => { svSetCustomer(sec, cs.value, true); FS.toast(`${esc(BY_CUST[cs.value].name)} selected · address and credit terms loaded`, { tone: 'info', ms: 2400 }); });
    $('#sd-sv-city', sec).addEventListener('change', (e) => svAreas(sec, e.target.value));

    const tb = $('#sd-sv-grid tbody', sec);
    tb.addEventListener('input', (e) => {
      const el = e.target, tr = el.closest('tr'); if (!tr) return;
      const l = svFind(+tr.dataset.id), f = el.dataset.f;
      if (f === 'prod') { acOpen(el, (sku) => svPickInto(sec, l, sku), SV.cust); acFilter(el.value); return; }
      if (f === 'qty') { l.qty = Math.max(0, num(el.value)); applyScheme(l); }
      if (f === 'bonus') { l.bonus = Math.max(0, num(el.value)); l.bonusManual = el.value !== ''; if (el.value === '') applyScheme(l); }
      if (f === 'rate') l.rate = Math.max(0, num(el.value));
      if (f === 'disc') l.disc = Math.min(100, Math.max(0, num(el.value)));
      svUpdateRow(sec, l);
    });
    tb.addEventListener('change', (e) => {
      const el = e.target, tr = el.closest('tr'); if (!tr) return;
      const l = svFind(+tr.dataset.id);
      if (el.dataset.f === 'gst') { l.gst = num(el.value); svUpdateRow(sec, l); }
      if (el.dataset.f === 'batch') l.batch = el.value;
      if (el.dataset.f === 'rate' && l.rate) el.value = l.rate.toFixed(2);
    });
    tb.addEventListener('focusin', (e) => { if (e.target.dataset.f === 'prod') setTimeout(() => e.target.select(), 0); });
    tb.addEventListener('focusout', (e) => {
      if (e.target.dataset.f !== 'prod') return;
      setTimeout(() => {
        if (AC.input === e.target) acClose();
        const tr = e.target.closest('tr'); if (!tr || !tr.isConnected) return;
        const l = svFind(+tr.dataset.id); if (l && l.sku) e.target.value = BY_SKU[l.sku].name;
      }, 140);
    });
    tb.addEventListener('keydown', (e) => {
      const el = e.target; if (!el.dataset || !el.dataset.f) return;
      const tr = el.closest('tr'), l = svFind(+tr.dataset.id);
      if (el.dataset.f === 'prod') {
        if (acKey(e, el)) return;
        if (e.key === 'ArrowDown' && !acIsOpen(el)) { e.preventDefault(); acOpen(el, (sku) => svPickInto(sec, l, sku), SV.cust); acFilter(''); return; }
      }
      if ((e.key === 'Enter' && !e.ctrlKey && !e.metaKey) || (e.key === 'Tab' && !e.shiftKey)) {
        const last = !tr.nextElementSibling && el.dataset.f === 'gst';
        if (e.key === 'Tab' && last) return;
        e.preventDefault();
        if (el.dataset.f === 'rate' && l.rate) el.value = l.rate.toFixed(2);
        svFocusNext(sec, el, e.key === 'Enter');
      }
    });
    tb.addEventListener('click', (e) => {
      const dd = e.target.closest('.sd-prod-dd');
      if (dd) { const inp = $('[data-f=prod]', dd.parentElement); const l = svFind(+dd.closest('tr').dataset.id); inp.focus(); acOpen(inp, (sku) => svPickInto(sec, l, sku), SV.cust); acFilter(''); return; }
      const del = e.target.closest('.sd-del'); if (!del) return;
      const tr = del.closest('tr'), id = +tr.dataset.id, idx = SV.lines.findIndex((l) => l.id === id), l = SV.lines[idx];
      tr.classList.add('row-out');
      setTimeout(() => {
        SV.lines.splice(idx, 1);
        if (!SV.lines.length) SV.lines.push(svLine(null, 0));
        svRender(sec);
        if (l.sku) FS.toast(`Removed ${esc(BY_SKU[l.sku].name)}`, { undo: () => { SV.lines.splice(Math.min(idx, SV.lines.length), 0, l); svRender(sec, l.id); } });
      }, RM() ? 0 : 320);
    });

    /* search box (F2) adds products as new lines */
    const sb = $('#sd-sv-search', sec);
    const pickSearch = (sku) => {
      sb.value = '';
      const blank = SV.lines.find((l) => !l.sku);
      if (blank) svPickInto(sec, blank, sku);
      else svAddRow(sec, sku, 'qty');
      FS.toast(`${esc(BY_SKU[sku].name)} added`, { ms: 1800 });
    };
    sb.addEventListener('input', () => { acOpen(sb, pickSearch, SV.cust); acFilter(sb.value); });
    sb.addEventListener('focus', () => { acOpen(sb, pickSearch, SV.cust); acFilter(sb.value); });
    sb.addEventListener('blur', () => setTimeout(() => { if (AC.input === sb) acClose(); }, 140));
    sb.addEventListener('keydown', (e) => { if (acKey(e, sb)) return; if (e.key === 'ArrowDown') { acOpen(sb, pickSearch, SV.cust); acFilter(sb.value); } });
    $('#sd-sv-findbtn', sec).addEventListener('click', () => sb.focus());
    $('#sd-sv-addprod', sec).addEventListener('click', () => svAddRow(sec, null, 'prod'));
    $('#sd-sv-addrow', sec).addEventListener('click', () => svAddRow(sec, null, 'prod'));
    $('#sd-sv-change', sec).addEventListener('click', () => {
      const act = document.activeElement && document.activeElement.closest && document.activeElement.closest('#sd-sv-grid tr');
      const tr = act || $('#sd-sv-grid tbody tr:last-child', sec);
      const inp = $('[data-f=prod]', tr), l = svFind(+tr.dataset.id);
      inp.focus(); acOpen(inp, (sku) => { svPickInto(sec, l, sku); FS.toast('Product changed on line ' + (SV.lines.indexOf(l) + 1), { tone: 'info' }); }, SV.cust); acFilter('');
    });
    $('#sd-sv-newprod', sec).addEventListener('click', () => FS.toast('Create the product in the item master, then pick it here', { tone: 'info', action: { label: 'Open Items', fn: () => FS.go('app/inventory/items') } }));
    $('#sd-sv-clear', sec).addEventListener('click', () => {
      const prev = SV.lines.slice();
      if (!prev.some((l) => l.sku)) return;
      $$('#sd-sv-grid tbody tr', sec).forEach((tr) => tr.classList.add('row-out'));
      setTimeout(() => { SV.lines = [svLine(null, 0)]; svRender(sec); FS.toast(`Cleared ${prev.filter((l) => l.sku).length} lines`, { tone: 'warn', undo: () => { SV.lines = prev; svRender(sec); } }); }, RM() ? 0 : 320);
    });

    /* hold / recall */
    const heldBtn = $('#sd-sv-recall', sec);
    const hold = () => {
      const lines = SV.lines.filter((l) => l.sku);
      if (!lines.length) { FS.toast('Nothing to hold: the voucher is empty', { tone: 'warn' }); return; }
      SV.held.unshift({ no: $('#sd-sv-no', sec).textContent, cust: SV.cust, at: nowTime(), lines: SV.lines.slice() });
      SV.lines = [svLine(null, 0)]; svRender(sec);
      $('#sd-sv-heldn', sec).textContent = SV.held.length; bump($('#sd-sv-heldn', sec));
      FS.toast('Bill held · recall it any time from Held', { tone: 'info' });
    };
    const recall = (anchor) => {
      popList(anchor || heldBtn, 'Held bills', SV.held.map((h) => {
        const net = h.lines.reduce((s, l) => s + (l.sku ? calc(l).net : 0), 0);
        return { t: BY_CUST[h.cust].name, s: `${h.no} · ${h.lines.filter((l) => l.sku).length} items · held ${h.at}`, v: 'Rs ' + fmt(net, 0) };
      }), (i) => {
        const h = SV.held.splice(i, 1)[0];
        if (SV.lines.some((l) => l.sku)) SV.held.push({ no: $('#sd-sv-no', sec).textContent, cust: SV.cust, at: nowTime(), lines: SV.lines.slice() });
        SV.lines = h.lines; svSetCustomer(sec, h.cust, true); svRender(sec);
        $$('#sd-sv-grid tbody tr', sec).forEach((tr, k) => setTimeout(() => flashRow(tr), k * 60));
        $('#sd-sv-heldn', sec).textContent = SV.held.length;
        FS.toast(`Recalled ${h.no} · ${esc(BY_CUST[h.cust].name)}`, { tone: 'good' });
      }, 'No held bills. Use Hold to park the current bill.');
    };
    $('#sd-sv-hold', sec).addEventListener('click', hold);
    heldBtn.addEventListener('click', () => recall(heldBtn));

    /* header buttons */
    $('#sd-sv-post', sec).addEventListener('click', () => svPost(sec, false));
    $('#sd-sv-draft', sec).addEventListener('click', (e) => busy(e.currentTarget, 'Saving…', 650).then(() => FS.toast('Draft saved · ' + $('#sd-sv-no', sec).textContent, { tone: 'good' })));
    $('#sd-sv-print', sec).addEventListener('click', svPrint);
    $('#sd-sv-estimate', sec).addEventListener('click', () => FS.toast('Estimate EST-2026-000041 created for ' + esc(BY_CUST[SV.cust].name), { tone: 'good', action: { label: 'Preview', fn: svPrint } }));
    $('#sd-sv-more', sec).addEventListener('click', (e) => FS.menu(e.currentTarget, [
      { label: 'Receive payment', icon: 'hand-coins', onClick: () => payOpen(sec) },
      { label: 'Hold bill', icon: 'pause', onClick: hold },
      { label: 'Recall held bill', icon: 'history', onClick: () => recall($('#sd-sv-more', sec)) },
      { label: 'Duplicate voucher', icon: 'copy', onClick: () => FS.toast('Copied into a new draft ' + 'SV-2026-' + String(SV.seq + 1).padStart(6, '0'), { tone: 'info' }) },
      { label: 'Email to customer', icon: 'mail', onClick: () => FS.toast('Invoice emailed to ' + (CUSTX[SV.cust] || [])[2]) },
      { sep: true },
      { label: 'Discard voucher', icon: 'trash-2', danger: true, onClick: () => $('#sd-sv-clear', sec).click() },
    ]));

    /* payment modal */
    $('#sd-sv-paybtn', sec).addEventListener('click', () => payOpen(sec));
    const pm = $('#sd-sv-pay', sec);
    pm.addEventListener('input', () => payCalc(sec));
    pm.addEventListener('click', (e) => {
      const r = e.target.closest('.sd-rest'); if (!r) return;
      const inp = $(`input[data-m="${r.dataset.m}"]`, pm);
      let other = 0; $$('#sd-pay-rows input[data-m]', pm).forEach((i) => { if (i !== inp) other += num(i.value); });
      inp.value = Math.max(0, r2(SV.net - other)).toFixed(2);
      payCalc(sec); bump(inp);
    });
    $('#sd-pay-ok', sec).addEventListener('click', () => { FS.closeOverlay(pm); svPost(sec, true); });

    /* keyboard: F2 search, Ctrl+Enter add row */
    window.addEventListener('keydown', (e) => {
      if (!isActive(sec) || anyOverlay()) return;
      if (e.key === 'F2') { e.preventDefault(); sb.focus(); sb.select(); }
      else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); acClose(); svAddRow(sec, null, 'prod'); }
    }, true);
  }
  FS.onEnter('app/sales/voucher', (sec, route, first) => {
    if (first) { mountVoucher(sec); FS.icons(sec); }
    else svTotals(sec);
  });

  /* ============================================================================
     2) SALES RETURNS
     ========================================================================== */
  const INVOICES = {
    'INV-2026-000146': { date: '10 Sep 2026', cust: 'CUST-0002', booker: 'Bilal Khan', dman: 'Rafiq Shah', lines: [['FD-5002', 24, 1995, 0, 'Expired'], ['FD-5003', 48, 780, 5, 'Damaged'], ['FD-5001', 144, 150, 0, 'Customer request'], ['FD-5004', 12, 940, 0, ''], ['PK-1003', 36, 135, 0, '']], ret: [6, 5, 20, 0, 0] },
    'INV-2026-000139': { date: '04 Sep 2026', cust: 'CUST-0004', booker: 'Imran Siddiqui', dman: 'Ali Haider', lines: [['PK-1001', 500, 112, 2, 'Damaged'], ['PK-1004', 12, 1150, 0, 'Wrong item'], ['PK-1003', 72, 135, 0, '']], ret: [25, 2, 0] },
    'INV-2026-000121': { date: '22 Aug 2026', cust: 'CUST-0001', booker: 'Nadeem Akhtar', dman: 'Salman Butt', lines: [['IN-3001', 20, 1990, 0, 'Wrong item'], ['IN-3002', 10, 1650, 0, 'Damaged'], ['OF-2002', 40, 1690, 3, '']], ret: [4, 1, 0] },
  };
  const REASONS = ['Expired', 'Damaged', 'Wrong item', 'Customer request'];
  const DISPO = [['Restock', 'package-check'], ['Quarantine', 'shield-alert'], ['Write-off', 'trash-2']];
  const dispoFor = (r) => ({ Expired: 'Write-off', Damaged: 'Quarantine' }[r] || 'Restock');
  const SR = { no: 12, lines: [], inv: null, saved: false, timer: 0 };
  function genInvoice(no) {
    const h = hash(no), custs = D.customers.slice(0, 9), picks = [];
    for (let k = 0; k < 3; k++) { const it = D.items[(h >> (k * 3)) % D.items.length]; if (!picks.some((p) => p[0] === it.sku)) picks.push([it.sku, 6 + ((h >> k) % 30), it.price, (h >> k) % 2 ? 0 : 2, k === 0 ? 'Damaged' : '']); }
    return { date: (1 + (h % 27)) + ' Sep 2026', cust: custs[h % custs.length].code, booker: D.salesTeam.bookers[h % 3], dman: D.salesTeam.deliverymen[(h >> 2) % 3], lines: picks, ret: picks.map((p, k) => (k === 0 ? 2 : 0)) };
  }
  function srCalc(l) { const g = l.qty * l.rate, d = g * l.disc / 100; return { disc: d, amt: g - d }; }
  function srRowHtml(l, i) {
    const it = BY_SKU[l.sku], c = srCalc(l), err = l.qty > l.sold;
    return `<tr data-i="${i}" class="sd-stag${err ? ' sd-has-err' : ''}" style="--i:${i}">
      <td class="sd-c-idx">${i + 1}</td>
      <td><b class="sd-pn">${esc(it.name)}</b><small>${it.sku}</small></td>
      <td><span class="sd-pack">${esc(it.pack)}</span></td>
      <td><code class="sd-code">${l.batch}</code><small>${l.exp ? 'Exp ' + l.exp : 'No expiry'}</small></td>
      <td class="num">${fmt(l.rate)}</td>
      <td class="num sd-sold">${fmt(l.sold, 0)}</td>
      <td class="sd-c-rq"><input class="cell-input num" data-f="qty" inputmode="numeric" value="${l.qty || ''}" placeholder="0"><small class="sd-errmsg">Max ${l.sold} sold</small></td>
      <td><input class="cell-input num" data-f="disc" inputmode="decimal" value="${l.disc}"></td>
      <td class="num sd-out" data-o="disc">${fmt(c.disc)}</td>
      <td class="num sd-out sd-strong" data-o="amt">${fmt(c.amt)}</td>
      <td><select class="cell-input" data-f="reason"><option value="">Select reason</option>${REASONS.map((r) => `<option${r === l.reason ? ' selected' : ''}>${r}</option>`).join('')}</select></td>
      <td><div class="sd-dispo" data-v="${l.dispo}">${DISPO.map(([d, ic]) => `<button type="button" data-d="${d}" class="${d === l.dispo ? 'on' : ''}" data-tip="${d}" aria-label="${d}"><i data-lucide="${ic}"></i></button>`).join('')}</div></td>
      <td class="sd-c-del"><button class="sd-del" aria-label="Remove line"><i data-lucide="trash-2"></i></button></td>
    </tr>`;
  }
  function srRender(sec, stagger) {
    const tb = $('#sd-sr-grid tbody', sec);
    if (!SR.lines.length) {
      tb.innerHTML = `<tr class="sd-empty-row"><td colspan="13"><div class="empty-state"><span class="icon-well lg"><i data-lucide="file-search"></i></span><h4>No invoice loaded</h4><p>Type an invoice number above, e.g. INV-2026-000146, to pull its lines.</p></div></td></tr>`;
    } else tb.innerHTML = SR.lines.map(srRowHtml).join('');
    tb.classList.toggle('sd-stagger', !!stagger);
    FS.icons(tb);
    srTotals(sec);
  }
  function srTotals(sec) {
    let items = 0, qty = 0, disc = 0, amt = 0, errs = 0;
    SR.lines.forEach((l) => { if (l.qty > l.sold) { errs++; return; } if (l.qty > 0) { const c = srCalc(l); items++; qty += l.qty; disc += c.disc; amt += c.amt; } });
    const S = (k) => $(`[data-s=${k}]`, sec);
    tick(S('items'), items, { dec: 0 }); tick(S('qty'), qty, { dec: 0 });
    tick(S('disc'), disc, { prefix: 'Rs ' }); tick(S('total'), amt, { prefix: 'Rs ' });
    const F = (k) => $(`#sd-sr-grid tfoot [data-f=${k}]`, sec);
    F('qty').textContent = fmt(qty, 0); F('disc').textContent = fmt(disc); F('amt').textContent = fmt(amt);
    const ep = $('#sd-sr-errs', sec); ep.hidden = !errs; $('b', ep).textContent = errs;
    ep.lastChild.nodeValue = errs === 1 ? ' line needs attention' : ' lines need attention';
    SR.errs = errs; SR.qty = qty; SR.amt = amt; SR.items = items;
  }
  function srFill(sec, no, inv) {
    const c = BY_CUST[inv.cust], x = CUSTX[inv.cust] || ['', '', ''];
    SR.inv = no;
    if (SR.saved) { SR.no++; SR.saved = false; srSetState(sec, 'Draft'); }
    let full = 0;
    SR.lines = inv.lines.map((r, k) => {
      const it = BY_SKU[r[0]], b = batchesOf(it)[k % 3];
      full += r[1] * r[2] * (1 - r[3] / 100) * 1.18;
      return { sku: r[0], sold: r[1], rate: r[2], disc: r[3], reason: r[4], dispo: dispoFor(r[4]), qty: inv.ret[k] || 0, batch: b.code, exp: b.exp ? b.exp.replace('/', ' / 20') : '' };
    });
    const set = (k, v) => { const el = $(`[data-inv=${k}]`, sec); el.innerHTML = v; bump(el); };
    set('date', inv.date); set('cust', esc(c.name)); set('amt', 'PKR ' + fmt(full));
    $('#sd-sr-invno', sec).value = no;
    const cc = $('#sd-sr-cust', sec);
    $('[data-c=name]', cc).textContent = c.name;
    $('[data-c=addr]', cc).textContent = x[0] + ', ' + c.city;
    $('[data-c=phone]', cc).textContent = c.phone;
    $('[data-c=mail]', cc).textContent = x[2];
    $('#sd-sr-booker', sec).value = inv.booker; $('#sd-sr-dman', sec).value = inv.dman;
    srRender(sec, true);
    $('#sd-sr-strip', sec).classList.add('sd-loaded');
  }
  function srLoad(sec, raw) {
    const no = raw.trim().toUpperCase();
    if (!/^INV-\d{4}-\d{6}$/.test(no)) return false;
    if (no === SR.inv) return true;
    const inv = INVOICES[no] || genInvoice(no);
    ['#sd-sr-strip', '#sd-sr-cards', '#sd-sr-gridwrap'].forEach((s) => skeleton($(s, sec), 650));
    setTimeout(() => { srFill(sec, no, inv); FS.toast(`${no} loaded · ${inv.lines.length} lines from ${esc(BY_CUST[inv.cust].name)}`, { tone: 'info', ms: 2600 }); }, 560);
    return true;
  }
  function srSetState(sec, s) {
    const b = $('#sd-sr-state', sec);
    b.textContent = s; b.className = 'badge dot ' + (s === 'Posted' ? 'good' : 'warn'); bump(b);
    const no = 'SR-' + String(SR.no).padStart(6, '0');
    $('#sd-sr-title', sec).textContent = 'Sales Return - ' + no; $('#sd-sr-no', sec).value = no;
  }
  const SR_PREV = [
    ['SR-000011', 'INV-2026-000131', '28 Sep 2026', 'Hashoo Hotels', 'Imran Siddiqui', 'Salman Butt', 1, 1250, 'Draft'],
    ['SR-000010', 'INV-2026-000128', '24 Sep 2026', 'City Mart Superstores', 'Bilal Khan', 'Rafiq Shah', 5, 8400, 'Posted'],
    ['SR-000009', 'INV-2026-000117', '19 Sep 2026', 'Al-Fatah Stores', 'Bilal Khan', 'Ali Haider', 2, 2160, 'Posted'],
    ['SR-000008', 'INV-2026-000109', '15 Sep 2026', 'Metro Cash & Carry', 'Nadeem Akhtar', 'Rafiq Shah', 4, 6750, 'Cancelled'],
    ['SR-000007', 'INV-2026-000102', '11 Sep 2026', 'Packages Ltd', 'Imran Siddiqui', 'Salman Butt', 1, 975, 'Posted'],
    ['SR-000006', 'INV-2026-000094', '06 Sep 2026', 'Engro Foods', 'Bilal Khan', 'Ali Haider', 3, 14320, 'Posted'],
    ['SR-000005', 'INV-2026-000088', '02 Sep 2026', 'Shifa International', 'Nadeem Akhtar', 'Rafiq Shah', 2, 3980, 'Posted'],
  ];
  const stTone = (s) => ({ Draft: 'warn', Posted: 'good', Cancelled: 'danger' }[s] || 'neutral');
  const srPrevRow = (r, i) => `<tr data-qv-route="app/sales/credit-notes"><td>${i}</td><td><a class="link" href="#/app/sales/credit-notes">${r[0]}</a></td><td>${r[1]}</td><td>${r[2]}</td><td><b>${esc(r[3])}</b></td><td>${esc(r[4])}</td><td>${esc(r[5])}</td><td class="num">${r[6]}</td><td class="num"><b>${fmt(r[7])}</b></td><td><span class="badge dot ${stTone(r[8])}">${r[8]}</span></td><td class="actions"><button class="icon-btn-sm" aria-label="Row actions"><i data-lucide="ellipsis"></i></button></td></tr>`;

  function mountReturns(sec) {
    $('#sd-sr-booker', sec).innerHTML = D.salesTeam.bookers.map((n) => `<option>${esc(n)}</option>`).join('');
    $('#sd-sr-dman', sec).innerHTML = D.salesTeam.deliverymen.map((n) => `<option>${esc(n)}</option>`).join('');
    $('#sd-sr-prev tbody', sec).innerHTML = SR_PREV.map((r, k) => srPrevRow(r, k + 1)).join('');
    const rem = $('#sd-sr-rem', sec), remN = $('#sd-sr-remn', sec);
    const remCount = () => { remN.textContent = rem.value.length + '/500'; };
    rem.addEventListener('input', remCount); remCount();
    srRender(sec);
    const inp = $('#sd-sr-inv', sec);
    srLoad(sec, inp.value);

    inp.addEventListener('input', () => { clearTimeout(SR.timer); SR.timer = setTimeout(() => srLoad(sec, inp.value), 380); });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(SR.timer); if (!srLoad(sec, inp.value)) { shake(inp.closest('label')); FS.toast('Invoice numbers look like INV-2026-000146', { tone: 'warn' }); } } });
    $('#sd-sr-invx', sec).addEventListener('click', (e) => {
      e.preventDefault(); inp.value = ''; SR.inv = null; SR.lines = []; srRender(sec);
      $$('[data-inv]', sec).forEach((el) => { el.textContent = '—'; });
      $('#sd-sr-strip', sec).classList.remove('sd-loaded'); inp.focus();
    });

    const tb = $('#sd-sr-grid tbody', sec);
    tb.addEventListener('input', (e) => {
      const el = e.target, tr = el.closest('tr[data-i]'); if (!tr) return;
      const l = SR.lines[+tr.dataset.i];
      if (el.dataset.f === 'qty') {
        l.qty = Math.max(0, Math.floor(num(el.value)));
        const err = l.qty > l.sold, had = tr.classList.contains('sd-has-err');
        tr.classList.toggle('sd-has-err', err);
        if (err && !had) shake(el);
      }
      if (el.dataset.f === 'disc') l.disc = Math.min(100, Math.max(0, num(el.value)));
      const c = srCalc(l);
      $('[data-o=disc]', tr).textContent = fmt(c.disc); $('[data-o=amt]', tr).textContent = fmt(c.amt);
      srTotals(sec);
    });
    tb.addEventListener('change', (e) => {
      const el = e.target, tr = el.closest('tr[data-i]'); if (!tr || el.dataset.f !== 'reason') return;
      const l = SR.lines[+tr.dataset.i]; l.reason = el.value;
      const d = dispoFor(el.value);
      if (d !== l.dispo) { l.dispo = d; const g = $('.sd-dispo', tr); g.dataset.v = d; $$('button', g).forEach((b) => b.classList.toggle('on', b.dataset.d === d)); bump($('button.on', g)); }
    });
    tb.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || !e.target.dataset.f) return;
      e.preventDefault();
      const tr = e.target.closest('tr'), nx = tr.nextElementSibling;
      const n = nx && $(`[data-f=${e.target.dataset.f}]`, nx); if (n) { n.focus(); n.select && n.select(); }
    });
    tb.addEventListener('click', (e) => {
      const d = e.target.closest('.sd-dispo button');
      if (d) { const tr = d.closest('tr'), l = SR.lines[+tr.dataset.i]; l.dispo = d.dataset.d; $$('button', d.parentElement).forEach((b) => b.classList.toggle('on', b === d)); d.parentElement.dataset.v = l.dispo; return; }
      const del = e.target.closest('.sd-del'); if (!del) return;
      const tr = del.closest('tr'), i = +tr.dataset.i, l = SR.lines[i];
      tr.classList.add('row-out');
      setTimeout(() => { SR.lines.splice(i, 1); srRender(sec); FS.toast(`Removed ${esc(BY_SKU[l.sku].name)}`, { undo: () => { SR.lines.splice(i, 0, l); srRender(sec); } }); }, RM() ? 0 : 320);
    });

    $('#sd-sr-apply', sec).addEventListener('click', () => {
      if (!SR.inv) { inp.focus(); shake(inp.closest('label')); FS.toast('Search an invoice first', { tone: 'warn' }); return; }
      SR.lines.forEach((l) => { l.qty = l.sold; if (!l.reason) { l.reason = 'Customer request'; l.dispo = 'Restock'; } });
      srRender(sec, true);
      FS.toast(`Full return applied from ${SR.inv}`, { tone: 'info' });
    });
    $('#sd-sr-clear', sec).addEventListener('click', () => {
      const prev = SR.lines.map((l) => l.qty);
      SR.lines.forEach((l) => { l.qty = 0; }); srRender(sec);
      FS.toast('Return quantities cleared', { undo: () => { SR.lines.forEach((l, k) => { l.qty = prev[k]; }); srRender(sec); } });
    });
    $('#sd-sr-cancel', sec).addEventListener('click', () => confirmBox({ title: 'Discard this return?', text: 'Lines and quantities on this draft will be lost.', okLabel: 'Discard', danger: true }).then((ok) => { if (ok) { $('#sd-sr-invx', sec).click(); FS.toast('Draft discarded', { tone: 'warn' }); } }));
    $('#sd-sr-more', sec).addEventListener('click', (e) => FS.menu(e.currentTarget, [
      { label: 'Print return note', icon: 'printer', onClick: () => FS.toast('Return note sent to printer') },
      { label: 'Open credit notes', icon: 'file-minus-2', onClick: () => FS.go('app/sales/credit-notes') },
      { label: 'Duplicate', icon: 'copy', onClick: () => FS.toast('Duplicated as a new draft', { tone: 'info' }) },
      { sep: true },
      { label: 'Delete draft', icon: 'trash-2', danger: true, onClick: () => $('#sd-sr-invx', sec).click() },
    ]));
    $('#sd-sr-save', sec).addEventListener('click', (e) => {
      const btn = e.currentTarget;
      if (SR.saved) { FS.toast('Already posted. Load another invoice to start a new return.', { tone: 'info' }); return; }
      if (SR.errs) { $$('#sd-sr-grid tr.sd-has-err', sec).forEach((tr) => shake(tr)); FS.toast('Return quantity exceeds the quantity sold on ' + SR.errs + ' line(s)', { tone: 'danger' }); return; }
      if (!SR.qty) { shake($('#sd-sr-gridwrap', sec)); FS.toast('Enter a return quantity on at least one line', { tone: 'warn' }); return; }
      const miss = SR.lines.filter((l) => l.qty > 0 && !l.reason).length;
      if (miss) { FS.toast(`Pick a reason for ${miss} line(s)`, { tone: 'warn' }); $$('#sd-sr-grid tbody tr', sec).forEach((tr) => { const l = SR.lines[+tr.dataset.i]; if (l && l.qty > 0 && !l.reason) shake($('[data-f=reason]', tr)); }); return; }
      busy(btn, 'Saving…', 1000).then(() => {
        celebrate(btn);
        SR.saved = true; srSetState(sec, 'Posted');
        const no = 'SR-' + String(SR.no).padStart(6, '0'), c = BY_CUST[INVOICES[SR.inv] ? INVOICES[SR.inv].cust : genInvoice(SR.inv).cust];
        const tbp = $('#sd-sr-prev tbody', sec);
        const tmp = document.createElement('tbody');
        tmp.innerHTML = srPrevRow([no, SR.inv, '01 Oct 2026', c.name, $('#sd-sr-booker', sec).value, $('#sd-sr-dman', sec).value, SR.items, SR.amt, 'Posted'], 0);
        const tr = tmp.firstElementChild; tbp.prepend(tr); FS.icons(tr);
        $$(':scope > tr', tbp).forEach((r, k) => { r.firstElementChild.textContent = k + 1; });
        flashRow(tr);
        FS.toast(`${no} posted · credit note CN-2026-000045 raised for Rs ${fmt(SR.amt)}`, { tone: 'good', ms: 6000, action: { label: 'View credit note', fn: () => FS.go('app/sales/credit-notes') } });
      });
    });
  }
  FS.onEnter('app/sales/returns', (sec, route, first) => { if (first) { mountReturns(sec); FS.icons(sec); } });

  /* ============================================================================
     3) DELIVERY CHALLANS
     ========================================================================== */
  const DC_ST = [['Packed', 'package', 'info'], ['Dispatched', 'truck', 'warn'], ['Delivered', 'package-check', 'good'], ['Invoiced', 'receipt-text', 'violet']];
  const SOS = [
    { no: 'SO-2026-000318', cust: 'CUST-0007', lines: [['FD-5001', 288, 144], ['FD-5002', 60, 24], ['FD-5003', 96, 48], ['FD-5004', 48, 0]] },
    { no: 'SO-2026-000322', cust: 'CUST-0004', lines: [['PK-1001', 1200, 600], ['PK-1003', 180, 72], ['PK-1004', 24, 0]] },
    { no: 'SO-2026-000325', cust: 'CUST-0001', lines: [['IN-3001', 40, 0], ['IN-3002', 20, 0], ['OF-2002', 60, 20]] },
    { no: 'SO-2026-000327', cust: 'CUST-0009', lines: [['EL-4001', 30, 10], ['EL-4002', 6, 0], ['IT-6001', 25, 0]] },
  ];
  const DC = {
    seq: 238,
    rows: [
      { no: 'DC-2026-000237', date: '01 Oct 2026', so: 'SO-2026-000318', cust: 'Metro Cash & Carry', qty: 312, veh: 'LES-4471', drv: 'Rafiq Shah', st: 0 },
      { no: 'DC-2026-000236', date: '01 Oct 2026', so: 'SO-2026-000322', cust: 'Packages Ltd', qty: 650, veh: 'LEA-19-2280', drv: 'Salman Butt', st: 1 },
      { no: 'DC-2026-000235', date: '30 Sep 2026', so: 'SO-2026-000316', cust: 'City Mart Superstores', qty: 186, veh: 'LES-4471', drv: 'Rafiq Shah', st: 1 },
      { no: 'DC-2026-000234', date: '30 Sep 2026', so: 'SO-2026-000325', cust: 'Shifa International', qty: 20, veh: 'RIK-7731', drv: 'Ali Haider', st: 2 },
      { no: 'DC-2026-000233', date: '29 Sep 2026', so: 'SO-2026-000311', cust: 'Hashoo Hotels', qty: 64, veh: 'RIK-7731', drv: 'Ali Haider', st: 2 },
      { no: 'DC-2026-000232', date: '29 Sep 2026', so: 'SO-2026-000309', cust: 'Al-Fatah Stores', qty: 240, veh: 'LEA-19-2280', drv: 'Salman Butt', st: 3 },
      { no: 'DC-2026-000231', date: '28 Sep 2026', so: 'SO-2026-000327', cust: 'Interloop Ltd', qty: 10, veh: 'FDA-5520', drv: 'Rafiq Shah', st: 3 },
      { no: 'DC-2026-000230', date: '27 Sep 2026', so: 'SO-2026-000305', cust: 'Engro Foods', qty: 420, veh: 'KHI-3341', drv: 'Salman Butt', st: 3 },
    ],
    filter: -1,
  };
  const dcVal = (r) => r.qty * 410 + hash(r.no) % 9000;
  function dcStep(st) { return `<div class="sd-step" style="--p:${st / 3}">${DC_ST.map((s, k) => `<i class="${k <= st ? 'on' : ''}" title="${s[0]}"></i>`).join('')}<b></b></div>`; }
  function dcAction(r) {
    if (r.st === 0) return '<button class="btn secondary sm sd-dc-act" data-a="adv"><i data-lucide="truck"></i><span>Mark dispatched</span><em></em></button>';
    if (r.st === 1) return '<button class="btn secondary sm sd-dc-act" data-a="adv"><i data-lucide="package-check"></i><span>Mark delivered</span><em></em></button>';
    if (r.st === 2) return '<button class="btn primary sm sd-dc-act" data-a="inv"><i data-lucide="receipt-text"></i><span>Convert to invoice</span><em></em></button>';
    return '<a class="btn ghost sm" href="#/app/sales/invoices/view"><i data-lucide="file-text"></i>View invoice</a>';
  }
  const dcRow = (r) => `<tr data-no="${r.no}" data-st="${r.st}"${r.hide ? ' style="display:none"' : ''}><td><b class="sd-mono">${r.no}</b><small>${r.date}</small></td><td><a class="link" href="#/app/sales/orders">${r.so}</a></td><td><b>${esc(r.cust)}</b></td><td class="num">${fmt(r.qty, 0)}</td><td><div class="sd-veh"><span class="sd-plate">${r.veh}</span><small>${esc(r.drv)}</small></div></td><td>${dcStep(r.st)}</td><td><span class="badge dot ${DC_ST[r.st][2]}">${DC_ST[r.st][0]}</span></td><td class="actions"><div class="sd-dc-acts">${dcAction(r)}<button class="icon-btn-sm" aria-label="More"><i data-lucide="ellipsis"></i></button></div></td></tr>`;
  function dcRenderMeta(sec) {
    const cnt = [0, 0, 0, 0], val = [0, 0, 0, 0];
    DC.rows.forEach((r) => { cnt[r.st]++; val[r.st] += dcVal(r); });
    const k = $('#sd-dc-kpis', sec);
    const kp = [
      ['Packed · awaiting dispatch', cnt[0], 'package', '', 'Loading bay 3 · Lahore HQ'],
      ['On the road', cnt[1], 'truck', 'yellow', '3 vehicles out · avg 2.4 h'],
      ['Delivered · to invoice', cnt[2], 'package-check', 'teal', 'Rs ' + fmt(val[2], 0) + ' unbilled'],
      ['Invoiced this week', cnt[3], 'receipt-text', 'violet', 'Rs ' + fmt(val[3], 0) + ' billed'],
    ];
    if (!k.children.length) {
      k.innerHTML = kp.map((x) => `<div class="kpi ${x[3]}"><div class="kpi-top"><span>${x[0]}</span><span class="icon-well"><i data-lucide="${x[2]}"></i></span></div><strong data-k>${x[1]}</strong><small>${x[4]}</small></div>`).join('');
      FS.icons(k);
    } else $$('.kpi', k).forEach((el, i) => { const s = $('strong', el); if (s.textContent !== String(kp[i][1])) { s.textContent = kp[i][1]; bump(s); } $('small', el).textContent = kp[i][4]; });
    const f = $('#sd-dc-flow', sec);
    f.innerHTML = `<button class="sd-flow-all${DC.filter < 0 ? ' active' : ''}" data-f="-1"><b>All</b><em>${DC.rows.length}</em></button>` + DC_ST.map((s, i) => `${i ? '<span class="sd-flow-arrow"><i data-lucide="chevron-right"></i></span>' : '<span class="sd-flow-sep"></span>'}<button class="sd-flow-${s[2]}${DC.filter === i ? ' active' : ''}" data-f="${i}"><span class="sd-flow-ic"><i data-lucide="${s[1]}"></i></span><div><b>${s[0]}</b><small>${i === 0 ? 'Picked & sealed' : i === 1 ? 'Left the warehouse' : i === 2 ? 'POD signed' : 'Billed to customer'}</small></div><em>${cnt[i]}</em></button>`).join('');
    FS.icons(f);
  }
  function dcRender(sec) {
    const tb = $('#sd-dc-tbl tbody', sec);
    DC.rows.forEach((r) => { r.hide = DC.filter >= 0 && r.st !== DC.filter; });
    tb.innerHTML = DC.rows.map(dcRow).join('');
    FS.icons(tb);
    dcRenderMeta(sec);
  }
  function dcAdvance(sec, tr, toInvoice) {
    const r = DC.rows.find((x) => x.no === tr.dataset.no); if (!r) return;
    const btn = $('.sd-dc-act', tr);
    busy(btn, toInvoice ? 'Converting…' : 'Updating…', 700).then(() => {
      r.st = Math.min(3, r.st + 1);
      tr.dataset.st = r.st;
      const step = $('.sd-step', tr);
      step.style.setProperty('--p', r.st / 3);
      $$('i', step).forEach((d, k) => { const on = k <= r.st; if (on && !d.classList.contains('on')) { d.classList.add('on'); bump(d); } });
      const bd = $('.badge', tr); bd.className = 'badge dot ' + DC_ST[r.st][2]; bd.textContent = DC_ST[r.st][0]; bump(bd);
      const acts = $('.sd-dc-acts', tr); acts.innerHTML = dcAction(r) + '<button class="icon-btn-sm" aria-label="More"><i data-lucide="ellipsis"></i></button>'; FS.icons(acts);
      flashRow(tr);
      dcRenderMeta(sec);
      if (r.st === 3) { celebrate(btn.isConnected ? btn : acts); FS.toast(`${r.no} converted · draft invoice ready for ${esc(r.cust)}`, { tone: 'good', ms: 6000, action: { label: 'Open invoice', fn: () => FS.go('app/sales/invoices/new') } }); }
      else if (r.st === 1) FS.toast(`${r.no} dispatched · ${r.veh} is on the way with ${esc(r.drv)}`, { tone: 'info' });
      else FS.toast(`${r.no} delivered · proof of delivery captured`, { tone: 'good' });
      if (DC.filter >= 0 && r.st !== DC.filter) setTimeout(() => { tr.classList.add('row-out'); setTimeout(() => { r.hide = true; tr.style.display = 'none'; tr.classList.remove('row-out'); }, 350); }, 900);
    });
  }
  function dcNewDrawer(sec) {
    const soOpts = SOS.map((s) => `<option value="${s.no}">${s.no} · ${esc(BY_CUST[s.cust].name)}</option>`).join('');
    const html = `<div class="sd-dcn">
      <div class="form-grid">
        <label class="full"><span>Sales order *</span><select data-n="so">${soOpts}</select></label>
        <label><span>Challan date</span><input type="date" value="2026-10-01"></label>
        <label><span>From warehouse</span><select>${D.warehouses.map((w) => `<option>${esc(w)}</option>`).join('')}</select></label>
        <label><span>Vehicle no *</span><input data-n="veh" placeholder="e.g. LES-4471" value="LES-4471"></label>
        <label><span>Driver</span><select data-n="drv">${D.salesTeam.deliverymen.map((n) => `<option>${esc(n)}</option>`).join('')}</select></label>
      </div>
      <div class="sd-dcn-cust" data-n="cust"></div>
      <div class="sd-dcn-h"><b>Lines to deliver</b><small>Uncheck a line to leave it for a later challan</small></div>
      <div class="table-wrap sd-dcn-wrap"><table class="tbl lines" data-plain><thead><tr><th></th><th>Item</th><th class="num">Ordered</th><th class="num">Delivered</th><th class="num">Pending</th><th class="num">Deliver now</th></tr></thead><tbody data-n="lines"></tbody></table></div>
      <div class="sd-dcn-sum" data-n="sum"></div>
    </div>`;
    const d = FS.drawer({ title: 'New delivery challan', subtitle: 'DC-2026-' + String(DC.seq).padStart(6, '0') + ' · created from a sales order', wide: true, html, foot: '<button class="btn secondary" data-close>Cancel</button><button class="btn primary sd-progress-btn" data-n="create"><i data-lucide="truck"></i><span>Create challan</span><em></em></button>' });
    const N = (k) => $(`[data-n=${k}]`, d);
    const so = () => SOS.find((s) => s.no === N('so').value);
    const lines = () => {
      const s = so(), c = BY_CUST[s.cust];
      N('cust').innerHTML = `<span class="icon-well"><i data-lucide="building-2"></i></span><div><b>${esc(c.name)}</b><small>${esc((CUSTX[s.cust] || [''])[0])}, ${esc(c.city)} · ${esc(c.phone)}</small></div><span class="badge info">${s.lines.length} lines</span>`;
      N('lines').innerHTML = s.lines.map((l, k) => { const it = BY_SKU[l[0]], pend = l[1] - l[2]; return `<tr class="sd-stag" style="--i:${k}"><td><input type="checkbox" ${pend > 0 ? 'checked' : 'disabled'}></td><td><b>${esc(it.name)}</b><small>${it.sku} · ${esc(it.unit)}</small></td><td class="num">${fmt(l[1], 0)}</td><td class="num">${fmt(l[2], 0)}</td><td class="num"><b>${fmt(pend, 0)}</b></td><td><input class="cell-input num" value="${pend}" data-max="${pend}" ${pend > 0 ? '' : 'disabled'}></td></tr>`; }).join('');
      N('lines').classList.add('sd-stagger');
      FS.icons(d); sum();
    };
    const sum = () => {
      let n = 0, q = 0, bad = 0;
      $$('tr', N('lines')).forEach((tr) => {
        const cb = $('input[type=checkbox]', tr), qi = $('.cell-input', tr), v = num(qi.value), mx = +qi.dataset.max;
        qi.classList.toggle('sd-bad', v > mx);
        if (v > mx) bad++;
        tr.classList.toggle('sd-off', !cb.checked);
        if (cb.checked && v > 0) { n++; q += v; }
      });
      N('sum').innerHTML = `<span><b>${n}</b> lines</span><span><b>${fmt(q, 0)}</b> units</span>${bad ? '<span class="sd-warn-t"><i data-lucide="triangle-alert"></i>More than pending on ' + bad + ' line(s)</span>' : '<span class="sd-ok-t"><i data-lucide="circle-check"></i>Ready to dispatch</span>'}`;
      FS.icons(N('sum'));
      d._q = q; d._bad = bad; d._n = n;
    };
    N('so').addEventListener('change', lines);
    d.addEventListener('input', sum); d.addEventListener('change', (e) => { if (e.target.type === 'checkbox') sum(); });
    N('create').addEventListener('click', (e) => {
      const veh = N('veh');
      if (!veh.value.trim()) { shake(veh); veh.focus(); FS.toast('Enter the vehicle number', { tone: 'warn' }); return; }
      if (d._bad || !d._n) { shake(N('sum')); FS.toast(d._bad ? 'Deliver quantity exceeds pending' : 'Select at least one line', { tone: 'warn' }); return; }
      busy(e.currentTarget, 'Creating…', 800).then(() => {
        const s = so();
        const r = { no: 'DC-2026-' + String(DC.seq++).padStart(6, '0'), date: '01 Oct 2026', so: s.no, cust: BY_CUST[s.cust].name, qty: d._q, veh: veh.value.trim().toUpperCase(), drv: N('drv').value, st: 0 };
        DC.rows.unshift(r);
        FS.closeOverlay(d.closest('.overlay'));
        if (DC.filter > 0) DC.filter = -1;
        dcRender(sec);
        flashRow($(`#sd-dc-tbl tr[data-no="${r.no}"]`, sec));
        FS.toast(`${r.no} created · ${fmt(r.qty, 0)} units packed for ${esc(r.cust)}`, { tone: 'good' });
      });
    });
    lines();
  }
  function mountChallans(sec) {
    dcRender(sec);
    $('#sd-dc-new', sec).addEventListener('click', () => dcNewDrawer(sec));
    $('#sd-dc-flow', sec).addEventListener('click', (e) => {
      const b = e.target.closest('button[data-f]'); if (!b) return;
      const f = +b.dataset.f; DC.filter = DC.filter === f ? -1 : f;
      dcRender(sec);
      $$('#sd-dc-tbl tbody tr', sec).forEach((tr, k) => { if (tr.style.display !== 'none') { tr.classList.remove('row-in'); void tr.offsetWidth; tr.classList.add('row-in'); tr.style.setProperty('--ri', k); } });
    });
    $('#sd-dc-tbl', sec).addEventListener('click', (e) => {
      const b = e.target.closest('.sd-dc-act'); if (!b) return;
      e.stopPropagation();
      dcAdvance(sec, b.closest('tr'), b.dataset.a === 'inv');
    });
  }
  FS.onEnter('app/sales/challans', (sec, route, first) => { if (first) { mountChallans(sec); FS.icons(sec); } });

  /* ============================================================================
     4) POS / COUNTER SALE
     ========================================================================== */
  const POS = { cart: [], cust: 'CUST-0010', cat: 'All', q: '', seq: 4812, held: [], method: 'Cash', amt: '', shift: { open: true, cash: 48250, card: 22400, wal: 6800, bills: 23 } };
  const POS_FEE = 1;
  function posTotals() {
    let sub = 0, disc = 0;
    POS.cart.forEach((l) => { const it = BY_SKU[l.sku], g = it.price * l.qty; sub += g; disc += g * l.d / 100; });
    const gst = (sub - disc) * 0.18, total = POS.cart.length ? sub - disc + gst + POS_FEE : 0;
    return { sub, disc, gst, total, n: POS.cart.reduce((s, l) => s + l.qty, 0) };
  }
  function posTilesHtml() {
    const q = POS.q.toLowerCase();
    const list = D.items.filter((it) => (POS.cat === 'All' || it.cat === POS.cat) && (!q || (it.name + ' ' + it.sku + ' ' + it.brand + ' ' + it.upc).toLowerCase().includes(q)));
    if (!list.length) return `<div class="empty-state sd-tiles-empty"><span class="icon-well lg"><i data-lucide="search-x"></i></span><h4>No products match “${esc(POS.q)}”</h4><p>Try a SKU, brand or scan the barcode.</p></div>`;
    return list.map((it, i) => {
      const [ic, tone] = catIc(it), st = it.stock <= 0 ? 'out' : it.stock < 50 ? 'low' : 'ok';
      const inCart = POS.cart.find((l) => l.sku === it.sku);
      return `<button class="sd-tile${inCart ? ' in' : ''}" data-sku="${it.sku}" style="--i:${i}" ${st === 'out' ? 'disabled' : ''}>
        <span class="sd-tile-ic ${tone}"><i data-lucide="${ic}"></i></span>
        ${inCart ? `<em class="sd-tile-n">${inCart.qty}</em>` : ''}
        <b>${esc(it.name)}</b><small>${it.sku} · ${esc(it.unit)}</small>
        <span class="sd-tile-f"><strong>Rs ${fmt(it.price, 0)}</strong><span class="sd-sb ${st}">${st === 'out' ? 'Out' : fmt(it.stock, 0)}</span></span>
      </button>`;
    }).join('');
  }
  function posRenderTiles(sec, anim) {
    const t = $('#sd-pos-tiles', sec);
    t.innerHTML = posTilesHtml(); t.classList.toggle('sd-stagger', !!anim); FS.icons(t);
  }
  function posRenderCats(sec) {
    const cats = ['All'].concat([...new Set(D.items.map((i) => i.cat))]);
    $('#sd-pos-cats', sec).innerHTML = cats.map((c) => `<button class="${c === POS.cat ? 'active' : ''}" data-c="${esc(c)}">${c === 'All' ? '<i data-lucide="layout-grid"></i>' : `<i data-lucide="${(CAT[c] || ['package'])[0]}"></i>`}${esc(c)}<em>${c === 'All' ? D.items.length : D.items.filter((i) => i.cat === c).length}</em></button>`).join('');
    FS.icons($('#sd-pos-cats', sec));
  }
  function posRenderCart(sec, flashSku) {
    const box = $('#sd-pos-lines', sec);
    if (!POS.cart.length) {
      box.innerHTML = '<div class="sd-cart-empty"><span class="icon-well lg"><i data-lucide="scan-barcode"></i></span><b>Cart is empty</b><small>Tap a product, scan a barcode or press <kbd class="kbd">/</kbd> to search.</small></div>';
    } else {
      box.innerHTML = POS.cart.map((l) => {
        const it = BY_SKU[l.sku], [ic, tone] = catIc(it), amt = it.price * l.qty * (1 - l.d / 100);
        return `<div class="sd-cl" data-sku="${l.sku}"><span class="sd-cl-ic ${tone}"><i data-lucide="${ic}"></i></span>
          <div class="sd-cl-main"><b>${esc(it.name)}</b><small>Rs ${fmt(it.price, 0)} · <label class="sd-cl-d">Disc <input class="cell-input" data-a="d" value="${l.d}" inputmode="decimal">%</label></small></div>
          <div class="sd-qty"><button data-a="dec" aria-label="Less"><i data-lucide="minus"></i></button><input class="cell-input" data-a="q" value="${l.qty}" inputmode="numeric" aria-label="Quantity"><button data-a="inc" aria-label="More"><i data-lucide="plus"></i></button></div>
          <strong class="sd-cl-amt">${money(amt)}</strong>
          <button class="sd-cl-x" data-a="rm" aria-label="Remove"><i data-lucide="x"></i></button></div>`;
      }).join('');
    }
    FS.icons(box);
    if (flashSku) { const el = $(`.sd-cl[data-sku="${flashSku}"]`, box); if (el) { el.classList.add('sd-cl-flash'); el.scrollIntoView({ block: 'nearest' }); } }
    posRenderTotals(sec);
  }
  function posRenderTotals(sec) {
    const t = posTotals();
    const P = (k) => $(`[data-p=${k}]`, sec);
    tick(P('sub'), t.sub, { prefix: 'Rs ' }); tick(P('disc'), t.disc, { prefix: '− Rs ' }); tick(P('gst'), t.gst, { prefix: 'Rs ' });
    tick(P('total'), t.total, { prefix: 'Rs ' }); tick(P('paylbl'), t.total, { prefix: 'Rs ', dec: 0 });
    const n = $('#sd-pos-cartn', sec); if (n.textContent !== String(t.n)) { n.textContent = t.n; bump($('#sd-pos-carticon', sec)); }
    $('#sd-pos-pay', sec).disabled = !POS.cart.length;
    POS.t = t;
  }
  function posSyncTile(sec, sku) {
    const tile = $(`.sd-tile[data-sku="${sku}"]`, sec); if (!tile) return;
    const l = POS.cart.find((x) => x.sku === sku);
    tile.classList.toggle('in', !!l);
    let em = $('.sd-tile-n', tile);
    if (l) { if (!em) { em = document.createElement('em'); em.className = 'sd-tile-n'; tile.insertBefore(em, tile.children[1]); } em.textContent = l.qty; bump(em); } else if (em) em.remove();
  }
  function posFly(sec, fromEl, sku) {
    const cart = $('#sd-pos-carticon', sec);
    if (RM() || !fromEl || !cart || !fromEl.getBoundingClientRect().width) return;
    const a = fromEl.getBoundingClientRect(), b = cart.getBoundingClientRect();
    const it = BY_SKU[sku], [ic, tone] = catIc(it);
    const f = document.createElement('span');
    f.className = 'sd-fly ' + tone; f.innerHTML = `<i data-lucide="${ic}"></i>`;
    f.style.left = a.left + a.width / 2 - 20 + 'px'; f.style.top = a.top + a.height / 2 - 20 + 'px';
    document.body.appendChild(f); FS.icons(f);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
    const anim = f.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: `translate(${dx * 0.5}px,${dy * 0.5 - 90}px) scale(1.1)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${dx}px,${dy}px) scale(.35)`, opacity: 0.4 },
    ], { duration: 620, easing: 'cubic-bezier(.5,0,.3,1)' });
    anim.onfinish = () => { f.remove(); bump(cart); };
  }
  function posAdd(sec, sku, fromEl) {
    const it = BY_SKU[sku]; if (!it) return false;
    let l = POS.cart.find((x) => x.sku === sku);
    if ((l ? l.qty : 0) + 1 > it.stock) { FS.toast(`Only ${fmt(it.stock, 0)} ${esc(it.unit)} of ${esc(it.name)} in stock`, { tone: 'warn' }); shake(fromEl); return false; }
    if (l) l.qty++; else { l = { sku, qty: 1, d: 0 }; POS.cart.push(l); }
    posFly(sec, fromEl, sku);
    posRenderCart(sec, sku);
    posSyncTile(sec, sku);
    return true;
  }
  function posReceipt(snap) {
    const L = snap.lines.map((l) => { const it = BY_SKU[l.sku]; return `<div class="sd-rc-l"><span>${esc(it.name)}</span><span>${l.qty} × ${fmt(it.price)}${l.d ? ' −' + l.d + '%' : ''}</span><b>${fmt(it.price * l.qty * (1 - l.d / 100))}</b></div>`; }).join('');
    const t = snap.t;
    return `<div class="sd-receipt">
      <div class="sd-rc-c"><b class="sd-rc-co">AL-NOOR ENTERPRISES</b><small>${esc(D.company.address)}</small><small>NTN ${D.company.ntn} · STRN ${D.company.strn}</small><small>${esc(D.company.phone)}</small></div>
      <div class="sd-rc-cut"></div>
      <div class="sd-rc-kv"><span>Invoice</span><b>${snap.no}</b></div>
      <div class="sd-rc-kv"><span>Date</span><b>01-10-2026 ${snap.at}</b></div>
      <div class="sd-rc-kv"><span>Counter · Cashier</span><b>1 · Sana J.</b></div>
      <div class="sd-rc-kv"><span>Customer</span><b>${esc(BY_CUST[snap.cust].name)}</b></div>
      <div class="sd-rc-cut"></div>
      ${L}
      <div class="sd-rc-cut"></div>
      <div class="sd-rc-kv"><span>Subtotal</span><b>${fmt(t.sub)}</b></div>
      ${t.disc ? `<div class="sd-rc-kv"><span>Discount</span><b>−${fmt(t.disc)}</b></div>` : ''}
      <div class="sd-rc-kv"><span>GST 18%</span><b>${fmt(t.gst)}</b></div>
      <div class="sd-rc-kv"><span>FBR POS fee</span><b>${fmt(POS_FEE)}</b></div>
      <div class="sd-rc-kv sd-rc-big"><span>TOTAL</span><b>Rs ${fmt(t.total)}</b></div>
      <div class="sd-rc-kv"><span>${snap.method} received</span><b>${fmt(snap.paid)}</b></div>
      <div class="sd-rc-kv"><span>Change</span><b>${fmt(Math.max(0, snap.paid - t.total))}</b></div>
      <div class="sd-rc-cut"></div>
      <div class="sd-rc-fbr"><span class="qr"></span><div><b>FBR POS Invoice</b><code>${snap.fbr}</code><small>POS ID 801274</small><small>Verify via Tax Asaan app or SMS to 9966</small></div></div>
      <div class="sd-rc-c sd-rc-thanks"><b>Shukriya! Thank you for shopping.</b><small>Exchange within 7 days with receipt</small></div>
    </div>`;
  }
  function posComplete(sec) {
    const t = posTotals();
    const amt = num(POS.amt);
    if (amt + 0.001 < t.total) { shake($('.sd-tscreen', sec)); return; }
    const snap = { no: 'POS-2026-' + String(POS.seq).padStart(6, '0'), at: nowTime(), cust: POS.cust, lines: POS.cart.map((l) => ({ ...l })), t, method: POS.method, paid: amt, fbr: '801274' + '011026' + (hash('p' + POS.seq) % 1e8).toString().padStart(8, '0') };
    if (POS.method === 'Cash') POS.shift.cash += t.total; else if (POS.method === 'Card') POS.shift.card += t.total; else POS.shift.wal += t.total;
    POS.shift.bills++;
    POS.cart.forEach((l) => { BY_SKU[l.sku].stock -= l.qty; });
    FS.closeOverlay($('#sd-pos-tender', sec));
    celebrate($('#sd-pos-pay', sec));
    POS.cart = []; POS.seq++;
    $('#sd-pos-invno', sec).textContent = 'POS-2026-' + String(POS.seq).padStart(6, '0');
    posRenderCart(sec); posRenderTiles(sec);
    setTimeout(() => {
      const d = FS.drawer({ title: 'Sale complete', subtitle: `${snap.no} · ${snap.method} · change Rs ${fmt(Math.max(0, snap.paid - t.total))}`, html: posReceipt(snap), foot: '<button class="btn secondary" data-r="print"><i data-lucide="printer"></i>Print receipt</button><button class="btn primary" data-r="new"><i data-lucide="plus"></i>New sale</button>' });
      d.classList.add('sd-rc-drawer');
      d.addEventListener('click', (e) => {
        const b = e.target.closest('[data-r]'); if (!b) return;
        if (b.dataset.r === 'print') FS.toast('Printing on Epson TM-T82 · Counter 1');
        else { FS.closeOverlay(d.closest('.overlay')); setTimeout(() => $('#sd-pos-q', sec).focus(), 250); }
      });
    }, 380);
  }
  function posTenderOpen(sec) {
    if (!POS.cart.length) { FS.toast('Cart is empty', { tone: 'warn' }); return; }
    POS.method = 'Cash'; POS.amt = '';
    $$('#sd-pos-methods button', sec).forEach((b) => b.classList.toggle('active', b.dataset.m === 'Cash'));
    posTenderPaint(sec);
    FS.openModal('sd-pos-tender');
  }
  function posTenderPaint(sec) {
    const t = posTotals(), amt = num(POS.amt);
    $('#sd-pos-due', sec).innerHTML = money(t.total);
    const a = $('#sd-pos-amt', sec);
    a.innerHTML = POS.amt ? 'Rs ' + fmt(amt, 0) : '<span class="sd-ph">Rs 0</span>';
    const ch = amt - t.total, box = $('#sd-pos-changebox', sec);
    box.classList.toggle('short', ch < -0.001); box.classList.toggle('ok', ch >= -0.001 && !!POS.amt);
    $('span', box).textContent = ch < -0.001 ? 'Still due' : 'Change due';
    $('#sd-pos-change', sec).innerHTML = money(Math.abs(POS.amt ? ch : t.total));
    $('#sd-pos-complete', sec).disabled = ch < -0.001;
    $('#sd-pos-quick', sec).classList.toggle('sd-dim', POS.method !== 'Cash');
  }
  function posKey(sec, k) {
    if (k === 'back') POS.amt = POS.amt.slice(0, -1);
    else if ((POS.amt + k).replace(/^0+/, '').length <= 7) POS.amt = (POS.amt + k).replace(/^0+(?=\d)/, '');
    posTenderPaint(sec);
    bump($('#sd-pos-amt', sec));
  }
  function posHold(sec) {
    if (!POS.cart.length) { FS.toast('Nothing to hold: cart is empty', { tone: 'warn' }); return; }
    POS.held.unshift({ cust: POS.cust, at: nowTime(), lines: POS.cart, total: posTotals().total });
    POS.cart = []; posRenderCart(sec); posRenderTiles(sec);
    $('#sd-pos-heldn', sec).textContent = POS.held.length; bump($('#sd-pos-heldn', sec));
    FS.toast('Cart held · press Held to recall', { tone: 'info' });
  }
  function posShiftCalc(sec) {
    let cnt = 0;
    $$('#sd-pos-denoms tbody tr', sec).forEach((tr) => {
      const v = +tr.dataset.v, c = Math.max(0, Math.floor(num($('input', tr).value)));
      const a = v * c; cnt += a; $('[data-a]', tr).textContent = fmt(a, 0);
    });
    const exp = 10000 + POS.shift.cash, os = cnt - exp;
    $('#sd-shift-sales', sec).textContent = 'Rs ' + fmt(POS.shift.cash, 0);
    $('#sd-shift-exp', sec).textContent = 'Rs ' + fmt(exp, 0);
    tick($('#sd-shift-cnt', sec), cnt, { prefix: 'Rs ', dec: 0 });
    tick($('#sd-shift-os', sec), Math.abs(os), { prefix: os < 0 ? 'Short Rs ' : os > 0 ? 'Over Rs ' : 'Rs ', dec: 0 });
    const box = $('#sd-shift-osbox', sec);
    box.classList.toggle('short', os < -0.5); box.classList.toggle('over', os > 0.5); box.classList.toggle('even', Math.abs(os) <= 0.5);
    $('#sd-shift-card', sec).textContent = 'Rs ' + fmt(POS.shift.card, 0);
    $('#sd-shift-wal', sec).textContent = 'Rs ' + fmt(POS.shift.wal, 0);
    $('#sd-shift-bills', sec).textContent = POS.shift.bills;
  }
  function posShiftOpen(sec) {
    if (!POS.shift.open) {
      POS.shift = { open: true, cash: 0, card: 0, wal: 0, bills: 0 };
      const chip = $('#sd-pos-shift', sec); chip.classList.remove('closed'); $('span', chip).textContent = 'Shift open since ' + nowTime() + ' · Counter 1'; bump(chip);
      FS.toast('New shift opened with a Rs 10,000 float', { tone: 'good' });
      return;
    }
    const exp = Math.round(10000 + POS.shift.cash);
    const DEN = [5000, 1000, 500, 100, 50, 20, 10, 1];
    let left = exp - 140; const cnts = DEN.map((d) => { const c = Math.floor(left / d); left -= c * d; return c; });
    $('#sd-pos-denoms tbody', sec).innerHTML = DEN.map((d, k) => `<tr data-v="${d}"><td><span class="sd-den">${d === 1 ? 'Coins (Rs 1)' : 'Rs ' + fmt(d, 0)}</span></td><td class="num"><input class="cell-input num sd-den-in" value="${cnts[k]}" inputmode="numeric"></td><td class="num" data-a>0</td></tr>`).join('');
    posShiftCalc(sec);
    FS.openModal('sd-pos-closeshift');
  }
  function mountPos(sec) {
    const cs = $('#sd-pos-cust', sec);
    cs.innerHTML = D.customers.slice().reverse().map((c) => `<option value="${c.code}">${esc(c.name)}${c.code === 'CUST-0010' ? '' : ' · ' + c.code}</option>`).join('');
    cs.value = POS.cust;
    cs.addEventListener('change', () => { POS.cust = cs.value; bump(cs.closest('.sd-cust-pick')); });
    posRenderCats(sec); posRenderTiles(sec, true);
    POS.cart = [{ sku: 'FD-5002', qty: 2, d: 0 }, { sku: 'FD-5003', qty: 3, d: 5 }];
    posRenderCart(sec);
    POS.held = [{ cust: 'CUST-0010', at: '11:18', lines: [{ sku: 'OF-2002', qty: 5, d: 0 }, { sku: 'OF-2003', qty: 2, d: 0 }], total: 0 }];
    POS.held[0].total = POS.held[0].lines.reduce((s, l) => s + BY_SKU[l.sku].price * l.qty, 0) * 1.18 + 1;
    $('#sd-pos-heldn', sec).textContent = POS.held.length;
    $$('.sd-tile', sec).forEach((t) => posSyncTile(sec, t.dataset.sku));

    $('#sd-pos-cats', sec).addEventListener('click', (e) => {
      const b = e.target.closest('button[data-c]'); if (!b) return;
      POS.cat = b.dataset.c; $$('#sd-pos-cats button', sec).forEach((x) => x.classList.toggle('active', x === b));
      posRenderTiles(sec, true);
    });
    const q = $('#sd-pos-q', sec);
    q.addEventListener('input', () => { POS.q = q.value; posRenderTiles(sec); });
    q.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { const t = $('.sd-tile:not([disabled])', sec); if (t) { posAdd(sec, t.dataset.sku, $('.sd-tile-ic', t)); } }
      if (e.key === 'Escape') { q.value = ''; POS.q = ''; posRenderTiles(sec); q.blur(); }
    });
    const scan = $('#sd-pos-scan', sec);
    scan.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const code = scan.value.trim(); if (!code) return;
      const it = D.items.find((i) => i.upc === code || i.sku.toLowerCase() === code.toLowerCase());
      if (!it) { shake(scan.closest('label')); FS.toast(`No product with barcode ${esc(code)}`, { tone: 'danger' }); scan.select(); return; }
      if (posAdd(sec, it.sku, scan)) { scan.value = ''; scan.closest('label').classList.add('sd-scan-ok'); setTimeout(() => scan.closest('label').classList.remove('sd-scan-ok'), 600); }
    });
    $('#sd-pos-tiles', sec).addEventListener('click', (e) => {
      const t = e.target.closest('.sd-tile'); if (!t || t.disabled) return;
      t.classList.remove('sd-tap'); void t.offsetWidth; t.classList.add('sd-tap');
      posAdd(sec, t.dataset.sku, $('.sd-tile-ic', t));
    });
    const lines = $('#sd-pos-lines', sec);
    lines.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-a]'); if (!b) return;
      const row = b.closest('.sd-cl'), sku = row.dataset.sku, l = POS.cart.find((x) => x.sku === sku), it = BY_SKU[sku];
      if (b.dataset.a === 'inc') { if (l.qty + 1 > it.stock) { FS.toast(`Only ${fmt(it.stock, 0)} in stock`, { tone: 'warn' }); shake(row); return; } l.qty++; }
      if (b.dataset.a === 'dec') { l.qty--; }
      if (b.dataset.a === 'rm' || l.qty <= 0) {
        row.classList.add('sd-cl-out');
        setTimeout(() => { POS.cart = POS.cart.filter((x) => x !== l); posRenderCart(sec); posSyncTile(sec, sku); }, RM() ? 0 : 260);
        return;
      }
      $('[data-a=q]', row).value = l.qty;
      $('.sd-cl-amt', row).innerHTML = money(it.price * l.qty * (1 - l.d / 100));
      bump($('[data-a=q]', row));
      posRenderTotals(sec); posSyncTile(sec, sku);
    });
    lines.addEventListener('input', (e) => {
      const i = e.target; if (!i.dataset.a) return;
      const row = i.closest('.sd-cl'), l = POS.cart.find((x) => x.sku === row.dataset.sku), it = BY_SKU[l.sku];
      if (i.dataset.a === 'q') { const v = Math.floor(num(i.value)); if (v > 0) l.qty = Math.min(v, it.stock); }
      if (i.dataset.a === 'd') l.d = Math.min(100, Math.max(0, num(i.value)));
      $('.sd-cl-amt', row).innerHTML = money(it.price * l.qty * (1 - l.d / 100));
      posRenderTotals(sec); posSyncTile(sec, l.sku);
    });
    lines.addEventListener('focusout', (e) => { if (e.target.dataset.a === 'q') { const row = e.target.closest('.sd-cl'); const l = row && POS.cart.find((x) => x.sku === row.dataset.sku); if (l) e.target.value = l.qty; } });
    $('#sd-pos-clear', sec).addEventListener('click', () => {
      if (!POS.cart.length) return;
      const prev = POS.cart; POS.cart = []; posRenderCart(sec); posRenderTiles(sec);
      FS.toast('Cart cleared', { tone: 'warn', undo: () => { POS.cart = prev; posRenderCart(sec); posRenderTiles(sec); } });
    });
    $('#sd-pos-hold', sec).addEventListener('click', () => posHold(sec));
    const recallBtn = $('#sd-pos-recall', sec);
    recallBtn.addEventListener('click', () => popList(recallBtn, 'Held carts', POS.held.map((h) => ({ t: BY_CUST[h.cust].name, s: `${h.lines.length} items · held ${h.at}`, v: 'Rs ' + fmt(h.total, 0) })), (i) => {
      const h = POS.held.splice(i, 1)[0];
      if (POS.cart.length) POS.held.push({ cust: POS.cust, at: nowTime(), lines: POS.cart, total: posTotals().total });
      POS.cart = h.lines; POS.cust = h.cust; cs.value = h.cust;
      posRenderCart(sec); posRenderTiles(sec);
      $$('.sd-cl', sec).forEach((r, k) => setTimeout(() => r.classList.add('sd-cl-flash'), k * 70));
      $('#sd-pos-heldn', sec).textContent = POS.held.length;
      FS.toast('Cart recalled', { tone: 'good' });
    }, 'No held carts. Press F8 to park the current sale.'));
    $('#sd-pos-pay', sec).addEventListener('click', () => posTenderOpen(sec));
    $('#sd-pos-methods', sec).addEventListener('click', (e) => {
      const b = e.target.closest('button[data-m]'); if (!b) return;
      POS.method = b.dataset.m; $$('#sd-pos-methods button', sec).forEach((x) => x.classList.toggle('active', x === b));
      if (POS.method !== 'Cash') POS.amt = String(Math.ceil(posTotals().total));
      posTenderPaint(sec);
    });
    $('#sd-pos-keypad', sec).addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) posKey(sec, b.dataset.k || b.textContent.trim()); });
    $('#sd-pos-quick', sec).addEventListener('click', (e) => {
      const b = e.target.closest('button[data-q]'); if (!b) return;
      POS.amt = b.dataset.q === 'exact' ? String(Math.ceil(posTotals().total)) : String(num(POS.amt) + +b.dataset.q);
      posTenderPaint(sec); bump($('#sd-pos-amt', sec));
    });
    $('#sd-pos-complete', sec).addEventListener('click', () => posComplete(sec));
    $('#sd-pos-shift', sec).addEventListener('click', () => posShiftOpen(sec));
    $('#sd-pos-closeshift', sec).addEventListener('input', () => posShiftCalc(sec));
    $('#sd-shift-ok', sec).addEventListener('click', (e) => {
      busy(e.currentTarget, 'Closing…', 900).then(() => {
        FS.closeOverlay($('#sd-pos-closeshift', sec));
        POS.shift.open = false;
        const chip = $('#sd-pos-shift', sec); chip.classList.add('closed'); $('span', chip).textContent = 'Shift closed · tap to open'; bump(chip);
        celebrate(chip);
        FS.toast('Shift closed · Z-report Z-2026-0412 printed', { tone: 'good' });
      });
    });

    /* keyboard: F4 pay, F8 hold, / search; keypad digits while the tender pad is open */
    window.addEventListener('keydown', (e) => {
      if (!isActive(sec)) return;
      const tender = $('#sd-pos-tender', sec);
      if (tender.classList.contains('open')) {
        if (/^[0-9]$/.test(e.key)) { e.preventDefault(); posKey(sec, e.key); }
        else if (e.key === 'Backspace') { e.preventDefault(); posKey(sec, 'back'); }
        else if (e.key === 'Enter' && !$('#sd-pos-complete', sec).disabled) { e.preventDefault(); posComplete(sec); }
        return;
      }
      if (anyOverlay()) return;
      const inField = e.target.closest && e.target.closest('input, textarea, select, [contenteditable]');
      if (e.key === 'F4') { e.preventDefault(); posTenderOpen(sec); }
      else if (e.key === 'F8') { e.preventDefault(); posHold(sec); }
      else if (e.key === '/' && (!inField || e.target.id === 'sd-pos-scan')) { e.preventDefault(); e.stopPropagation(); q.focus(); q.select(); }
    }, true);
  }
  FS.onEnter('app/sales/pos', (sec, route, first) => { if (first) { mountPos(sec); FS.icons(sec); } });
})();
