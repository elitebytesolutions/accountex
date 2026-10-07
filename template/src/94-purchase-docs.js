/* =====================================================================
   94-purchase-docs.js : Purchase Voucher · GRN · Purchase Returns ·
   Stock Vouchers · Cheque Voucher · New Voucher   (prefix pd-)
   Markup in 44-purchase-docs.html, styles in 14-purchase-docs.css
   ===================================================================== */
(function () {
  'use strict';
  if (!window.FS) return;
  var D = window.FS_DATA || {};
  ['items', 'vendors', 'customers', 'banks', 'cashAccounts', 'warehouses', 'branches', 'employees'].forEach(function (k) { if (!D[k]) D[k] = []; });

  /* ------------------------------------------------------------ helpers */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var RM = function () { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var num = function (v) { var x = parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isFinite(x) ? x : 0; };
  var r2 = function (v) { return Math.round(v * 100) / 100; };
  var fmt = function (n, d) { return FS.fmt(r2(n), d == null ? 2 : d); };
  var money = function (n, d) { return FS.money(r2(n), { dec: d == null ? 2 : d }); };
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var fd = function (iso) { if (!iso) return '—'; var p = iso.split('-'); return p.length < 3 ? iso : (p[2] + ' ' + MON[+p[1] - 1] + ' ' + p[0]); };
  var fdd = function (iso) { if (!iso) return '—'; var p = iso.split('-'); return p.length < 3 ? iso : (p[2] + '-' + p[1] + '-' + p[0]); };
  var pad = function (n, l) { n = String(n); while (n.length < l) n = '0' + n; return n; };
  var item = function (sku) { for (var i = 0; i < D.items.length; i++) if (D.items[i].sku === sku) return D.items[i]; return null; };
  var vendor = function (code) { for (var i = 0; i < D.vendors.length; i++) if (D.vendors[i].code === code) return D.vendors[i]; return null; };
  var uid = (function () { var i = 0; return function () { return 'r' + (++i); }; })();

  function icons(root) { try { FS.icons(root); } catch (e) { /* cosmetic */ } }
  function toast(msg, o) { try { FS.toast(msg, o || {}); } catch (e) { /* noop */ } }
  function celebrate(el) { try { if (FS.celebrate) FS.celebrate(el); } catch (e) { /* noop */ } }
  function skeleton(el, ms) {
    if (!el) return;
    try { if (FS.skeleton) { FS.skeleton(el, ms); return; } } catch (e) { /* fall through */ }
    el.classList.add('pd-skel'); setTimeout(function () { el.classList.remove('pd-skel'); }, ms || 600);
  }
  // animate a number change (prefers FS.tick)
  function tick(el, to, o) {
    if (!el) return;
    o = o || {};
    var dec = o.dec == null ? 2 : o.dec, prefix = o.prefix == null ? 'Rs ' : o.prefix;
    to = r2(to);
    if (el.dataset.pdv != null && +el.dataset.pdv === to) return;
    el.dataset.pdv = to;
    if (FS.tick) { try { FS.tick(el, to, { dec: dec, prefix: prefix }); return; } catch (e) { /* fall back */ } }
    var render = function (v) { var s = FS.fmt(Math.abs(v), dec).split('.'); return (v < 0 ? '−' : '') + prefix + s[0] + (s[1] ? '<span class="dec">.' + s[1] + '</span>' : ''); };
    var from = num(el.dataset.pdfrom || 0); el.dataset.pdfrom = to;
    if (RM()) { el.innerHTML = render(to); return; }
    cancelAnimationFrame(el._pdraf);
    var t0 = performance.now();
    var step = function (now) {
      var p = Math.min(1, (now - t0) / 450), e = 1 - Math.pow(1 - p, 3);
      el.innerHTML = render(from + (to - from) * e);
      if (p < 1) el._pdraf = requestAnimationFrame(step);
    };
    el._pdraf = requestAnimationFrame(step);
  }
  function setMoney(el, v, d) { if (el) el.innerHTML = money(v, d); }
  function busy(btn, label, ms) {
    return new Promise(function (res) {
      if (!btn) { setTimeout(res, ms); return; }
      var sp = btn.querySelector('span'), old = sp ? sp.textContent : null;
      btn.classList.add('pd-busy'); btn.disabled = true;
      if (sp && label) sp.textContent = label;
      setTimeout(function () { btn.classList.remove('pd-busy'); btn.disabled = false; if (sp && old != null) sp.textContent = old; res(); }, RM() ? 60 : ms);
    });
  }
  function restart(el, cls) { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
  function flash(tr) { restart(tr, 'row-flash'); setTimeout(function () { tr && tr.classList.remove('row-flash'); }, 1500); }
  function shake(el) { restart(el, 'pd-shake'); setTimeout(function () { el && el.classList.remove('pd-shake'); }, 500); }
  function rowOut(tr, cb) {
    if (!tr || RM()) { cb(); return; }
    tr.classList.add('pd-out'); setTimeout(cb, 260);
  }
  var actx = null;
  function beep(freq) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      var o = actx.createOscillator(), g = actx.createGain();
      o.type = 'square'; o.frequency.value = freq || 1850;
      g.gain.setValueAtTime(0.0001, actx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.06, actx.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + 0.11);
      o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + 0.12);
    } catch (e) { /* audio is optional */ }
  }
  function scrollToEl(el, off) {
    if (!el) return;
    var y = el.getBoundingClientRect().top + window.scrollY - (off == null ? 96 : off);
    window.scrollTo({ top: Math.max(0, y), behavior: RM() ? 'auto' : 'smooth' });
  }
  function itemOpts(sel, blank) {
    return (blank ? '<option value="">' + esc(blank) + '</option>' : '') + D.items.map(function (it) {
      return '<option value="' + it.sku + '"' + (it.sku === sel ? ' selected' : '') + '>' + esc(it.name) + '</option>';
    }).join('');
  }
  function vendorOpts(sel) { return D.vendors.map(function (v) { return '<option value="' + v.code + '"' + (v.code === sel ? ' selected' : '') + '>' + esc(v.name) + '</option>'; }).join(''); }
  function words(n) {
    n = Math.floor(Math.abs(n));
    if (!n) return 'Zero';
    var a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    var b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    var two = function (x) { return x < 20 ? a[x] : b[Math.floor(x / 10)] + (x % 10 ? ' ' + a[x % 10] : ''); };
    var three = function (x) { return x >= 100 ? a[Math.floor(x / 100)] + ' Hundred' + (x % 100 ? ' ' + two(x % 100) : '') : two(x); };
    var out = [], cr = Math.floor(n / 1e7); n %= 1e7;
    var lk = Math.floor(n / 1e5); n %= 1e5;
    var th = Math.floor(n / 1000); n %= 1000;
    if (cr) out.push((cr > 999 ? FS.fmt(cr) : three(cr)) + ' Crore');
    if (lk) out.push(two(lk) + ' Lakh');
    if (th) out.push(two(th) + ' Thousand');
    if (n) out.push(three(n));
    return out.join(' ');
  }
  // per-warehouse split of an item's stock (deterministic)
  function stockSplit(it) {
    var f = [0.52, 0.24, 0.15, 0.09];
    return D.warehouses.map(function (w, i) {
      var s = Math.round(it.stock * (f[i] || 0)), r = Math.round(s * (0.06 + i * 0.02));
      return { w: w, s: s, r: r, a: s - r };
    });
  }

  /* ===================================================================
     1. PURCHASE VOUCHER
     =================================================================== */
  var PV = { rows: [], posted: false, seq: 318 };
  function pvMount(sec) {
    var body = $('#pd-pv-body', sec), sup = $('#pd-pv-sup', sec);
    sup.innerHTML = vendorOpts('VEN-0001');
    var seed = [['PK-1001', 120, 5, 0, 0], ['PK-1003', 72, 0, 2, 0], ['PK-1004', 12, 1, 0, 2], ['FD-5003', 48, 0, 0, 0]];
    PV.rows = seed.map(function (s) { return pvNewRow(s[0], s[1], s[2], s[3], s[4]); });
    PV.focusSku = 'PK-1001';
    pvRender();

    /* grid events */
    body.addEventListener('input', function (e) {
      var tr = e.target.closest('tr'), k = e.target.dataset.k; if (!tr || !k) return;
      var r = pvRow(tr.dataset.id); if (!r) return;
      if (k === 'sel') return;
      r[k] = k === 'upc' ? e.target.value : num(e.target.value);
      pvRowCalc(tr, r); pvTotals();
    });
    body.addEventListener('change', function (e) {
      var tr = e.target.closest('tr'); if (!tr) return;
      var r = pvRow(tr.dataset.id); if (!r) return;
      if (e.target.dataset.k === 'sel') { r.sel = e.target.checked; tr.classList.toggle('selected', r.sel); pvSelState(); return; }
      if (e.target.dataset.k === 'sku') {
        var it = item(e.target.value); if (!it) return;
        Object.assign(r, { sku: it.sku, upc: it.upc, pur: it.cost, sale: it.price, gst: it.gst });
        var nr = pvRowHtml(r, PV.rows.indexOf(r)); var tmp = document.createElement('tbody'); tmp.innerHTML = nr;
        var ntr = tmp.firstElementChild; tr.replaceWith(ntr); icons(ntr); flash(ntr);
        PV.focusSku = it.sku; pvTotals(); pvMore();
      }
    });
    body.addEventListener('focusin', function (e) {
      var tr = e.target.closest('tr'); if (!tr) return; var r = pvRow(tr.dataset.id);
      if (r && r.sku !== PV.focusSku) { PV.focusSku = r.sku; pvStock(); }
    });
    body.addEventListener('click', function (e) {
      var b = e.target.closest('[data-del]'); if (!b) return;
      var tr = b.closest('tr'), r = pvRow(tr.dataset.id), at = PV.rows.indexOf(r);
      rowOut(tr, function () {
        PV.rows.splice(at, 1); pvRender();
        toast('Line removed — ' + (item(r.sku) || {}).name, { undo: function () { PV.rows.splice(at, 0, r); pvRender(); } });
      });
    });
    $('#pd-pv-all', sec).addEventListener('change', function (e) { PV.rows.forEach(function (r) { r.sel = e.target.checked; }); pvRender(); });
    $('#pd-pv-remsel', sec).addEventListener('click', function () {
      var keep = PV.rows.filter(function (r) { return !r.sel; }), gone = PV.rows.filter(function (r) { return r.sel; });
      if (!gone.length) return;
      var prev = PV.rows.slice();
      $$('tr.selected', body).forEach(function (tr) { tr.classList.add('pd-out'); });
      setTimeout(function () {
        PV.rows = keep; pvRender();
        toast(gone.length + ' line' + (gone.length > 1 ? 's' : '') + ' removed', { undo: function () { PV.rows = prev; PV.rows.forEach(function (r) { r.sel = false; }); pvRender(); } });
      }, RM() ? 0 : 260);
    });
    $('#pd-pv-clear', sec).addEventListener('click', function () {
      if (!PV.rows.length) return;
      var prev = PV.rows.slice(); PV.rows = []; pvRender();
      toast('All lines cleared', { tone: 'warn', undo: function () { PV.rows = prev; pvRender(); } });
    });
    $('#pd-pv-addrow', sec).addEventListener('click', function () {
      var r = pvNewRow('', 1, 0, 0, 0); PV.rows.push(r); pvRender();
      var tr = body.querySelector('tr[data-id="' + r.id + '"]'); flash(tr); var s = tr && tr.querySelector('select'); if (s) s.focus();
    });
    $('#pd-pv-import', sec).addEventListener('click', function () {
      var b = this; busy(b, null, 900).then(function () {
        ['OF-2001', 'IN-3001'].forEach(function (sku) { PV.rows.push(pvNewRow(sku, 6, 0, 0, 0)); });
        pvRender(); $$('tr', body).slice(-2).forEach(flash);
        toast('2 lines imported from habib-packaging-oct.xlsx', { tone: 'good' });
      });
    });

    /* barcode search */
    var scan = $('#pd-pv-scan', sec), box = $('#pd-pv-scanbox', sec);
    var sug = document.createElement('div'); sug.className = 'pd-sug'; box.appendChild(sug);
    var find = function (q) {
      q = q.trim().toLowerCase(); if (!q) return [];
      return D.items.filter(function (it) { return it.upc === q || it.sku.toLowerCase() === q || it.name.toLowerCase().indexOf(q) > -1 || it.upc.indexOf(q) === 0; });
    };
    var addBy = function (it) {
      var ex = PV.rows.filter(function (r) { return r.sku === it.sku; })[0], id;
      if (ex) { ex.qty += 1; id = ex.id; } else { var r = pvNewRow(it.sku, 1, 0, 0, 0); PV.rows.push(r); id = r.id; }
      pvRender(); PV.focusSku = it.sku; pvStock();
      var tr = body.querySelector('tr[data-id="' + id + '"]'); flash(tr);
      if (tr) tr.scrollIntoView({ block: 'nearest', behavior: RM() ? 'auto' : 'smooth' });
      beep(); restart(box, 'hit'); setTimeout(function () { box.classList.remove('hit'); }, 700);
      scan.value = ''; sug.classList.remove('on');
      toast((ex ? 'Qty +1 · ' : 'Added · ') + it.name, { tone: 'good' });
    };
    scan.addEventListener('input', function () {
      var m = find(scan.value).slice(0, 5);
      sug.innerHTML = m.map(function (it) { return '<button type="button" data-sku="' + it.sku + '"><b>' + esc(it.name) + '</b><small>' + it.upc + ' · ' + it.sku + '</small><span>' + money(it.cost) + '</span></button>'; }).join('');
      sug.classList.toggle('on', m.length > 0 && !/^\d{8,}$/.test(scan.value.trim()));
    });
    sug.addEventListener('mousedown', function (e) { var b = e.target.closest('[data-sku]'); if (b) { e.preventDefault(); addBy(item(b.dataset.sku)); } });
    scan.addEventListener('blur', function () { setTimeout(function () { sug.classList.remove('on'); }, 120); });
    scan.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { sug.classList.remove('on'); return; }
      if (e.key !== 'Enter') return;
      e.preventDefault();
      var q = scan.value.trim(); if (!q) return;
      var m = find(q);
      if (m.length) addBy(m[0]);
      else { beep(320); shake(box); toast('No product matches “' + q + '”', { tone: 'warn' }); }
    });
    $('#pd-pv-scanbtn', sec).addEventListener('click', function () {
      var it = D.items[Math.floor(Math.random() * D.items.length)], i = 0;
      scan.focus(); scan.value = '';
      var t = setInterval(function () {
        scan.value += it.upc[i++];
        if (i >= it.upc.length) { clearInterval(t); addBy(it); }
      }, RM() ? 0 : 22);
    });

    /* markup helper */
    $('#pd-pv-markup', sec).addEventListener('input', function () {
      var x = num(this.value), n = 0;
      PV.rows.forEach(function (r) {
        if (!r.pur) return;
        r.sale = r2(r.pur * (1 + x / 100)); n++;
        var inp = body.querySelector('tr[data-id="' + r.id + '"] [data-k="sale"]');
        if (inp) { inp.value = r.sale.toFixed(2); restart(inp, 'pd-cellflash'); }
      });
      $('#pd-pv-mu-note', sec).textContent = n + ' sale price' + (n === 1 ? '' : 's') + ' repriced at +' + x + '%';
    });

    /* voucher info */
    $('.pd-toggle', sec).addEventListener('click', function () {
      var card = this.closest('.pd-collapsible'); card.classList.toggle('shut');
      this.setAttribute('aria-expanded', card.classList.contains('shut') ? 'false' : 'true');
    });
    $$('#pd-pv-ptype input', sec).forEach(function (inp) {
      inp.addEventListener('change', function () {
        $$('#pd-pv-ptype label', sec).forEach(function (l) { l.classList.toggle('on', l.contains(inp) && inp.checked); });
        var t = $('#pd-pv-tk-type', sec); t.innerHTML = '<i data-lucide="' + (inp.value === 'Shop' ? 'store' : 'warehouse') + '"></i>' + inp.value; icons(t); restart(t, 'pd-pop');
      });
    });
    $('#pd-pv-gear', sec).addEventListener('click', function () {
      FS.menu(this, [
        { label: 'Auto-number · PV-YYYY-######', icon: 'hash', onClick: function () { toast('Auto numbering is on for purchase vouchers'); } },
        { label: 'Use manual number', icon: 'pencil', onClick: function () { var r = $('#pd-pv-ref', sec); r.readOnly = false; r.focus(); r.select(); } },
        { sep: true },
        { label: 'Numbering settings', icon: 'settings', onClick: function () { FS.go('app/settings'); } }
      ]);
    });
    $('#pd-pv-ref', sec).addEventListener('input', function () { $('#pd-pv-tk-ref', sec).textContent = this.value || '—'; });
    $('#pd-pv-addsup', sec).addEventListener('click', function () {
      var dr = FS.drawer({
        title: 'Quick add supplier', subtitle: 'Creates a vendor record you can complete later',
        html: '<div class="form-grid c1"><label><span>Supplier name *</span><input id="pd-pv-ns-name" placeholder="e.g. Packages Ltd"></label><label><span>NTN</span><input id="pd-pv-ns-ntn" placeholder="0000000-0"></label><label><span>City</span><select id="pd-pv-ns-city"><option>Lahore</option><option>Karachi</option><option>Islamabad</option><option>Faisalabad</option></select></label><label class="switch"><input type="checkbox" checked id="pd-pv-ns-filer"><i></i><span>Active taxpayer (ATL filer)</span></label></div>',
        foot: '<button class="btn secondary" data-close>Cancel</button><button class="btn primary" id="pd-pv-ns-save"><i data-lucide="check"></i>Add supplier</button>'
      });
      icons(dr);
      var save = dr && dr.querySelector('#pd-pv-ns-save');
      if (save) save.addEventListener('click', function () {
        var nm = dr.querySelector('#pd-pv-ns-name').value.trim();
        if (!nm) { shake(dr.querySelector('#pd-pv-ns-name')); return; }
        var v = { code: 'VEN-' + pad(D.vendors.length + 1, 4), name: nm, city: dr.querySelector('#pd-pv-ns-city').value, ntn: dr.querySelector('#pd-pv-ns-ntn').value || '—', filer: dr.querySelector('#pd-pv-ns-filer').checked, balance: 0 };
        D.vendors.push(v); sup.innerHTML = vendorOpts(v.code); FS.closeOverlays(); pvSupplier(); toast('Supplier added · ' + nm, { tone: 'good' });
      });
    });
    sup.addEventListener('change', pvSupplier);
    $('#pd-pv-bill', sec).addEventListener('input', pvTotals);
    $('#pd-pv-due', sec).addEventListener('change', pvTotals);
    $('#pd-pv-adv', sec).addEventListener('input', pvTotals);
    $('#pd-pv-credit', sec).addEventListener('change', function () { pvMode(this.checked ? 'credit' : 'cash'); });

    /* payments */
    $('#pd-pv-mode', sec).addEventListener('click', function (e) { var b = e.target.closest('[data-m]'); if (b) pvMode(b.dataset.m); });
    $('#pd-pv-wht', sec).addEventListener('input', pvTotals);
    $('#pd-pv-paid', sec).addEventListener('input', pvTotals);
    $('#pd-pv-acc', sec).addEventListener('change', pvTotals);
    $('#pd-pv-quick', sec).addEventListener('click', function (e) {
      var b = e.target.closest('[data-q]'); if (!b || $('#pd-pv-paid', sec).disabled) return;
      $('#pd-pv-paid', sec).value = r2(PV.payable * num(b.dataset.q)).toFixed(2); pvTotals();
    });

    /* more info */
    sec.addEventListener('click', function (e) {
      var q = e.target.closest('[data-qa]'); if (!q) return;
      if (q.dataset.qa === 'receipt') toast('First receipt note printed for ' + $('#pd-pv-ref', sec).value, { tone: 'good' });
      if (q.dataset.qa === 'compare') pvCompare();
    });

    /* header actions */
    $$('[data-pv-act]', sec).forEach(function (b) {
      b.addEventListener('click', function () {
        var a = b.dataset.pvAct;
        if (a === 'print') { toast('Print preview ready · ' + $('#pd-pv-ref', sec).value, { tone: 'info' }); return; }
        if (a === 'draft') { busy(b, null, 700).then(function () { toast('Draft saved · ' + $('#pd-pv-ref', sec).value, { tone: 'good' }); }); return; }
        if (a === 'post') pvPost(b);
      });
    });

    /* stepper + scroll-spy */
    $$('#pd-pv-steps li', sec).forEach(function (li) {
      li.querySelector('button').addEventListener('click', function () {
        var t = $('#pd-pv-s' + (+li.dataset.step + 1), sec); scrollToEl(t, 150);
      });
    });
    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking || !sec.classList.contains('active')) return;
      ticking = true; requestAnimationFrame(function () { ticking = false; pvSpy(sec); });
    }, { passive: true });
    window.addEventListener('resize', function () { if (sec.classList.contains('active')) pvSpy(sec); });

    pvSupplier(); pvMode('credit');
  }
  function pvNewRow(sku, qty, bonus, brk, disc) {
    var it = item(sku) || { upc: '', cost: 0, price: 0, gst: 18 };
    var h = sku ? sku.charCodeAt(3) + sku.charCodeAt(5) : 0;
    return { id: uid(), sku: sku, upc: it.upc, ls: (h % 9) + 1, shelf: (h % 12) + 2, sw: h % 2, pur: it.cost, sale: it.price, qty: qty, bonus: bonus, brk: brk, gst: it.gst, disc: disc, sel: false };
  }
  function pvRow(id) { for (var i = 0; i < PV.rows.length; i++) if (PV.rows[i].id === id) return PV.rows[i]; return null; }
  function pvCalc(r) {
    var cost = r.pur * r.qty, d = cost * r.disc / 100, g = (cost - d) * r.gst / 100;
    return { t: r.qty + r.bonus - r.brk, cost: cost, disc: d, gst: g, amt: cost - d + g };
  }
  function pvRowHtml(r, i) {
    var c = pvCalc(r), n = function (k, w, step) { return '<td class="' + (w || '') + '"><input class="num" data-k="' + k + '" type="number" min="0" step="' + (step || 1) + '" value="' + r[k] + '"></td>'; };
    return '<tr data-id="' + r.id + '"' + (r.sel ? ' class="selected"' : '') + '>' +
      '<td class="pd-ck"><input type="checkbox" data-k="sel"' + (r.sel ? ' checked' : '') + ' aria-label="Select line"></td>' +
      '<td class="pd-idx">' + (i + 1) + '</td>' +
      '<td class="pd-upc"><input data-k="upc" value="' + esc(r.upc) + '" readonly tabindex="-1"></td>' +
      '<td class="pd-prod"><select data-k="sku">' + itemOpts(r.sku, 'Select product…') + '</select></td>' +
      n('ls', 'pd-xs') + n('shelf', 'pd-xs') + n('sw', 'pd-xs') +
      '<td class="pd-sm"><input class="num" data-k="pur" type="number" min="0" step="0.01" value="' + r.pur.toFixed(2) + '"></td>' +
      '<td class="pd-sm"><input class="num" data-k="sale" type="number" min="0" step="0.01" value="' + r.sale.toFixed(2) + '"></td>' +
      n('qty', 'pd-xs') + n('bonus', 'pd-xs') + n('brk', 'pd-xs') +
      '<td class="num pd-out-c" data-o="t"><b>' + FS.fmt(c.t) + '</b></td>' +
      n('gst', 'pd-xs') + n('disc', 'pd-xs', 0.5) +
      '<td class="num pd-out-c" data-o="cost">' + fmt(c.cost) + '</td>' +
      '<td class="num pd-out-c pd-amt" data-o="amt"><b>' + fmt(c.amt) + '</b></td>' +
      '<td class="pd-del"><button type="button" class="pd-icb danger" data-del aria-label="Delete line"><i data-lucide="trash-2"></i></button></td></tr>';
  }
  function pvRowCalc(tr, r) {
    var c = pvCalc(r);
    tr.querySelector('[data-o="t"]').innerHTML = '<b>' + FS.fmt(c.t) + '</b>';
    tr.querySelector('[data-o="cost"]').textContent = fmt(c.cost);
    tr.querySelector('[data-o="amt"]').innerHTML = '<b>' + fmt(c.amt) + '</b>';
  }
  function pvRender() {
    var sec = $('.pd-pv'), body = $('#pd-pv-body', sec);
    body.innerHTML = PV.rows.length ? PV.rows.map(pvRowHtml).join('') :
      '<tr class="pd-empty"><td colspan="18"><div><span class="icon-well"><i data-lucide="scan-barcode"></i></span><b>No items yet</b><small>Scan a barcode, search above or press “Add Row”.</small></div></td></tr>';
    icons(body); pvSelState(); pvTotals(); pvMore();
  }
  function pvSelState() {
    var sec = $('.pd-pv'), n = PV.rows.filter(function (r) { return r.sel; }).length;
    var b = $('#pd-pv-remsel', sec); b.disabled = !n;
    b.lastChild.textContent = n ? 'Remove Selected (' + n + ')' : 'Remove Selected';
    var all = $('#pd-pv-all', sec); all.checked = n > 0 && n === PV.rows.length; all.indeterminate = n > 0 && n < PV.rows.length;
  }
  function pvSupplier() {
    var sec = $('.pd-pv'), v = vendor($('#pd-pv-sup', sec).value) || {};
    $('#pd-pv-tk-sup', sec).textContent = v.name || '—';
    $('#pd-pv-hsup', sec).textContent = v.name || 'supplier';
    var f = $('#pd-pv-filer', sec);
    f.className = 'badge dot ' + (v.filer ? 'good' : 'warn');
    f.textContent = v.filer ? 'Filer · on ATL' : 'Non-filer · double WHT';
    $('#pd-pv-wht', sec).value = v.filer ? '5.5' : '11';
    $('#pd-pv-wht-h', sec).textContent = v.filer ? 'Goods · company filer rate' : 'Goods · non-filer (ATL) rate';
    pvHistory(v); pvTotals();
  }
  function pvMode(m) {
    var sec = $('.pd-pv');
    $$('#pd-pv-mode [data-m]', sec).forEach(function (b) { b.classList.toggle('on', b.dataset.m === m); });
    var acc = $('#pd-pv-acc', sec), paid = $('#pd-pv-paid', sec), lab = $('#pd-pv-acc-l', sec);
    $('#pd-pv-credit', sec).checked = m === 'credit';
    sec.classList.toggle('pd-chq', m === 'cheque');
    if (m === 'credit') { acc.innerHTML = '<option>Accounts Payable — Trade (2110-01)</option>'; acc.disabled = true; paid.value = 0; paid.disabled = true; lab.textContent = 'Payable account'; }
    else {
      var list = m === 'cash' ? D.cashAccounts : D.banks;
      acc.innerHTML = list.map(function (a) { return '<option value="' + a.code + '">' + esc(a.name) + ' · ' + a.code + '</option>'; }).join('');
      acc.disabled = false; paid.disabled = false; lab.textContent = m === 'cash' ? 'Cash account' : 'Bank account';
      if (!num(paid.value)) paid.value = r2(PV.payable || 0).toFixed(2);
    }
    pvTotals();
  }
  function pvTotals() {
    var sec = $('.pd-pv'); if (!sec) return;
    var T = { items: PV.rows.length, qty: 0, gross: 0, disc: 0, gst: 0, after: 0 };
    PV.rows.forEach(function (r) {
      var c = pvCalc(r), it = item(r.sku);
      T.qty += c.t; T.gross += c.cost; T.disc += c.disc; T.gst += c.gst; T.after += (it ? it.stock : 0) + c.t;
    });
    var adv = num($('#pd-pv-adv', sec).value), taxable = T.gross - T.disc, net = taxable + T.gst + adv;
    var wht = r2(taxable * num($('#pd-pv-wht', sec).value) / 100), payable = r2(net - wht);
    PV.payable = payable;
    var paidEl = $('#pd-pv-paid', sec), paid = paidEl.disabled ? 0 : num(paidEl.value);
    var over = paid > payable + 0.005; paidEl.closest('.pd-f').classList.toggle('pd-invalid', over);
    paid = Math.min(paid, payable); var bal = r2(payable - paid);
    PV.T = { taxable: taxable, gst: T.gst, adv: adv, net: net, wht: wht, paid: paid, bal: bal, over: over };

    $('#pd-pv-cnt', sec).textContent = T.items;
    $('#pd-pv-t-items', sec).textContent = T.items;
    $('#pd-pv-t-qty', sec).textContent = FS.fmt(T.qty);
    $('#pd-pv-t-stock', sec).textContent = FS.fmt(T.after) + ' units';
    setMoney($('#pd-pv-t-gross', sec), T.gross); setMoney($('#pd-pv-t-disc', sec), T.disc); setMoney($('#pd-pv-t-gst', sec), T.gst);
    tick($('#pd-pv-net', sec), net); tick($('#pd-pv-tk-total', sec), net);
    setMoney($('#pd-pv-x-taxable', sec), taxable); setMoney($('#pd-pv-x-gst', sec), T.gst); setMoney($('#pd-pv-x-adv', sec), adv); setMoney($('#pd-pv-x-wht', sec), wht);
    setMoney($('#pd-pv-x-total', sec), T.gst + adv + wht);
    $('#pd-pv-tk-bill', sec).textContent = $('#pd-pv-bill', sec).value || '—';
    $('#pd-pv-tk-due', sec).textContent = fd($('#pd-pv-due', sec).value);
    // settlement
    $('#pd-pv-gross-net', sec).innerHTML = money(net);
    setMoney($('#pd-pv-s-paid', sec), paid); setMoney($('#pd-pv-s-wht', sec), wht); setMoney($('#pd-pv-s-bal', sec), bal);
    var tot = net || 1;
    $('#pd-pv-bar-p', sec).style.width = (paid / tot * 100) + '%';
    $('#pd-pv-bar-w', sec).style.width = (wht / tot * 100) + '%';
    $('#pd-pv-bar-b', sec).style.width = (bal / tot * 100) + '%';
    tick($('#pd-pv-bal', sec), bal);
    var due = $('#pd-pv-due', sec).value, days = due ? Math.round((new Date(due) - new Date('2026-10-01')) / 864e5) : 0;
    $('#pd-pv-bal-due', sec).textContent = bal > 0 ? ('Due ' + fd(due) + ' · ' + days + ' days') : 'Fully settled on posting';
    pvReview();
  }
  function pvReview() {
    var sec = $('.pd-pv'), T = PV.T; if (!T) return;
    var lines = PV.rows.filter(function (r) { return r.sku && r.qty > 0; });
    var checks = [
      [!!$('#pd-pv-sup', sec).value, 'Supplier selected', ($('#pd-pv-tk-sup', sec).textContent)],
      [!!$('#pd-pv-bill', sec).value.trim(), 'Supplier bill # entered', $('#pd-pv-bill', sec).value || 'Required to match the vendor bill'],
      [lines.length > 0 && lines.length === PV.rows.length, 'Every line has a product and quantity', lines.length + ' of ' + PV.rows.length + ' lines ready'],
      [PV.rows.every(function (r) { return !r.sku || r.pur > 0; }), 'All lines priced', 'Purchase price above zero'],
      [!T.over, 'Payment within payable', T.over ? 'Paid now exceeds the payable amount' : 'Balance ' + FS.fmt(T.bal, 2)]
    ];
    $('#pd-pv-checks', sec).innerHTML = checks.map(function (c) { return '<li class="' + (c[0] ? 'ok' : 'bad') + '"><i></i><div><b>' + esc(c[1]) + '</b><small>' + esc(c[2]) + '</small></div></li>'; }).join('');
    var accName = $('#pd-pv-acc', sec).selectedOptions[0];
    var jv = [['1140-01 · Finished Goods (inventory)', T.taxable, 0], ['2130-01 · Input sales tax', T.gst, 0]];
    if (T.adv) jv.push(['1150-04 · Advance Income Tax (236G)', T.adv, 0]);
    if (T.wht) jv.push(['2130-02 · WHT Payable u/s 153', 0, T.wht]);
    if (T.paid) jv.push([(accName ? accName.textContent.split(' · ')[0] : 'Cash / Bank'), 0, T.paid]);
    if (T.bal) jv.push(['2110-01 · A/P — ' + $('#pd-pv-tk-sup', sec).textContent, 0, T.bal]);
    var dr = 0, cr = 0;
    $('#pd-pv-jv', sec).innerHTML = jv.map(function (l) { dr += l[1]; cr += l[2]; return '<tr><td>' + esc(l[0]) + '</td><td class="num dr">' + (l[1] ? fmt(l[1]) : '') + '</td><td class="num cr">' + (l[2] ? fmt(l[2]) : '') + '</td></tr>'; }).join('') +
      '<tr class="pd-jv-tot"><td>Total</td><td class="num">' + fmt(dr) + '</td><td class="num">' + fmt(cr) + '</td></tr>';
    var ok = Math.abs(dr - cr) < 0.01, b = $('#pd-pv-jv-bal', sec);
    b.className = 'badge dot ' + (ok ? 'good' : 'danger'); b.textContent = ok ? 'Balanced' : 'Out by ' + fmt(dr - cr);
  }
  function pvMore() {
    var sec = $('.pd-pv'), dates = ['28 Sep 2026', '24 Sep 2026', '19 Sep 2026', '12 Sep 2026', '05 Sep 2026'];
    var rows = PV.rows.filter(function (r) { return r.sku; }).slice(0, 4);
    $('#pd-pv-prev', sec).innerHTML = rows.length ? rows.map(function (r, i) { var it = item(r.sku); return '<tr><td>' + dates[i] + '</td><td title="' + esc(it.name) + '">' + esc(it.name) + '</td><td class="num">' + fmt(it.price) + '</td></tr>'; }).join('') : '<tr><td colspan="3" class="muted">No products yet</td></tr>';
    pvStock();
  }
  function pvStock() {
    var sec = $('.pd-pv'), it = item(PV.focusSku) || item((PV.rows[0] || {}).sku);
    $('#pd-pv-stk-for', sec).textContent = it ? it.name : 'Select a line to inspect';
    $('#pd-pv-stk', sec).innerHTML = it ? stockSplit(it).map(function (s) { return '<tr><td>' + esc(s.w.replace(' Warehouse', '')) + '</td><td class="num">' + FS.fmt(s.s) + '</td><td class="num">' + FS.fmt(s.r) + '</td><td class="num"><b class="' + (s.a > 0 ? '' : 'neg') + '">' + FS.fmt(s.a) + '</b></td></tr>'; }).join('') : '<tr><td colspan="4" class="muted">—</td></tr>';
  }
  function pvHistory(v) {
    var sec = $('.pd-pv'), h = (v.code || 'X').charCodeAt(7) || 3;
    var rows = [['22 Sep 2026', 2640 * h], ['09 Sep 2026', 1320 * h + 450], ['18 Aug 2026', 1185 * h + 920]];
    $('#pd-pv-hist', sec).innerHTML = rows.map(function (r, i) { return '<tr><td>' + r[0] + '</td><td>PV-2026-000' + (301 - i * 9) + '</td><td class="num">' + fmt(r[1] * 10) + '</td></tr>'; }).join('');
  }
  function pvCompare() {
    var rows = PV.rows.filter(function (r) { return r.sku; });
    var html = '<p class="muted small" style="margin-top:0">Last price paid to each supplier for the products on this voucher.</p><table class="tbl" data-plain><thead><tr><th>Product</th><th class="num">This PV</th><th class="num">Best other</th><th>Vendor</th></tr></thead><tbody>' +
      rows.map(function (r) { var best = r2(r.pur * 0.965); return '<tr><td><b>' + esc(item(r.sku).name) + '</b></td><td class="num">' + fmt(r.pur) + '</td><td class="num dr">' + fmt(best) + '</td><td>Daraz Business</td></tr>'; }).join('') + '</tbody></table>';
    FS.drawer({ title: 'Price comparison', subtitle: rows.length + ' products · last 90 days', html: html, foot: '<button class="btn secondary" data-close>Close</button>' });
  }
  function pvSpy(sec) {
    var lis = $$('#pd-pv-steps li', sec), ids = ['#pd-pv-s1', '#pd-pv-s2', '#pd-pv-s3', '#pd-pv-s4'];
    var line = 170, act = 0, prog = 0;
    var els = ids.map(function (id) { return $(id, sec); });
    els.forEach(function (el, i) { if (el.getBoundingClientRect().top <= line) act = i; });
    var cur = els[act].getBoundingClientRect(), nxt = els[act + 1] ? els[act + 1].getBoundingClientRect().top : cur.bottom;
    prog = Math.max(0, Math.min(1, (line - cur.top) / Math.max(1, nxt - cur.top)));
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) { act = 3; prog = 1; }
    lis.forEach(function (li, i) {
      li.classList.toggle('active', i === act); li.classList.toggle('done', i < act);
      var em = li.querySelector('.pd-conn em'); if (em) em.style.transform = 'scaleX(' + (i < act ? 1 : i === act ? prog : 0) + ')';
    });
  }
  function pvPost(btn) {
    var sec = $('.pd-pv');
    if (PV.posted) { toast('This voucher is already posted', { tone: 'info' }); return; }
    var bad = [];
    if (!$('#pd-pv-bill', sec).value.trim()) bad.push(['#pd-pv-bill', 'Enter the supplier bill #']);
    if (!PV.rows.length || PV.rows.some(function (r) { return !r.sku || r.qty <= 0; })) bad.push(['#pd-pv-s2', 'Every line needs a product and a quantity']);
    if (PV.T && PV.T.over) bad.push(['#pd-pv-paid', 'Paid now exceeds the payable amount']);
    if (bad.length) {
      var el = $(bad[0][0], sec); scrollToEl(el, 170); shake(el.closest('.pd-f') || el);
      toast(bad[0][1], { tone: 'danger' }); return;
    }
    var all = $$('[data-pv-act="post"]', sec);
    busy(btn, 'Posting…', 1000).then(function () {
      PV.posted = true;
      var st = $('#pd-pv-state', sec), tk = $('#pd-pv-ticket', sec);
      st.classList.add('flip');
      setTimeout(function () { st.classList.add('posted'); st.querySelector('span').textContent = 'POSTED'; }, RM() ? 0 : 260);
      setTimeout(function () { tk.classList.add('posted'); celebrate(tk); }, RM() ? 0 : 420);
      sec.classList.add('pd-locked');
      $$('.pd-pv-main input, .pd-pv-main select, .pd-pv-main textarea', sec).forEach(function (i) { if (i.id !== 'pd-pv-scan') i.disabled = true; });
      all.forEach(function (b) { b.disabled = true; });
      var ref = $('#pd-pv-ref', sec).value;
      toast(ref + ' posted · stock, A/P and GL updated', { tone: 'good', action: { label: 'New voucher', fn: pvReset } });
    });
  }
  function pvReset() {
    var sec = $('.pd-pv'); PV.posted = false; PV.seq++;
    var ref = 'PV-2026-' + pad(PV.seq, 6);
    $('#pd-pv-ref', sec).value = ref; $('#pd-pv-tk-ref', sec).textContent = ref;
    sec.classList.remove('pd-locked');
    $$('.pd-pv-main input, .pd-pv-main select, .pd-pv-main textarea', sec).forEach(function (i) { i.disabled = false; });
    $$('[data-pv-act="post"]', sec).forEach(function (b) { b.disabled = false; });
    var st = $('#pd-pv-state', sec); st.classList.remove('flip', 'posted'); st.querySelector('span').textContent = 'DRAFT';
    $('#pd-pv-ticket', sec).classList.remove('posted');
    $('#pd-pv-bill', sec).value = ''; PV.rows = []; pvRender();
    $('#pd-pv-ref', sec).readOnly = true;
    pvMode($('#pd-pv-credit', sec).checked ? 'credit' : 'cash');
    window.scrollTo({ top: 0, behavior: RM() ? 'auto' : 'smooth' });
    toast('New voucher ' + ref + ' ready', { tone: 'info' });
  }
  FS.onEnter('app/purchases/voucher', function (sec, route, first) {
    if (first) { pvMount(sec); icons(sec); }
    setTimeout(function () { pvSpy(sec); }, 50);
  });

  /* ===================================================================
     2. GOODS RECEIVED (GRN)
     =================================================================== */
  var GRN = {
    seq: 87,
    pos: [
      { no: 'PO-2026-0141', ven: 'VEN-0001', date: '2026-09-22', exp: '2026-10-01', bill: 'HP-INV-46011', lines: [['PK-1001', 2000, 1200, 2000], ['PK-1003', 720, 360, 720], ['PK-1004', 60, 0, 60]] },
      { no: 'PO-2026-0144', ven: 'VEN-0003', date: '2026-09-25', exp: '2026-10-03', bill: 'SF-88231', lines: [['FD-5001', 1440, 0, 1440], ['FD-5002', 120, 48, 120]] },
      { no: 'PO-2026-0147', ven: 'VEN-0002', date: '2026-09-26', exp: '2026-10-06', bill: '', lines: [['EL-4001', 40, 20, 0], ['EL-4002', 12, 0, 0]] },
      { no: 'PO-2026-0150', ven: 'VEN-0005', date: '2026-09-28', exp: '2026-10-02', bill: 'DZ-7781', lines: [['OF-2002', 200, 0, 200], ['OF-2003', 60, 0, 60], ['IT-6001', 25, 10, 25]] }
    ],
    reg: [
      ['GRN-2026-0086', '2026-09-30', 'PO-2026-0139', 'Habib Packaging', 'Lahore HQ Warehouse', 1450, 185400, 'Passed', 'Billed'],
      ['GRN-2026-0085', '2026-09-29', 'PO-2026-0138', 'Shan Foods', 'Karachi Depot', 2880, 339840, 'Passed', 'Billed'],
      ['GRN-2026-0084', '2026-09-27', 'PO-2026-0136', 'Siemens Pakistan', 'Lahore HQ Warehouse', 64, 412800, 'Partial reject', 'Awaiting'],
      ['GRN-2026-0083', '2026-09-24', 'PO-2026-0133', 'Daraz Business', 'Islamabad Store', 140, 168200, 'Passed', 'Billed'],
      ['GRN-2026-0082', '2026-09-22', 'PO-2026-0131', 'TCS Logistics', 'Faisalabad Depot', 30, 44500, 'Passed', 'Awaiting'],
      ['GRN-2026-0081', '2026-09-19', 'PO-2026-0128', 'Nishat Mills', 'Lahore HQ Warehouse', 820, 1028400, 'Passed', 'Billed']
    ],
    state: []
  };
  var REASONS = ['Damaged in transit', 'Short expiry', 'Wrong item / spec', 'Failed QC test', 'Excess over PO'];
  function grnRegRow(g, fresh) {
    var qc = g[7] === 'Passed' ? 'good' : 'warn', bl = g[8] === 'Billed' ? 'good' : 'info';
    return '<tr data-qv-route="app/purchases/bills"' + (fresh ? ' class="row-flash"' : '') + '><td><b>' + g[0] + '</b></td><td>' + fd(g[1]) + '</td><td><a class="link" href="#/app/purchases/orders">' + g[2] + '</a></td><td>' + esc(g[3]) + '</td><td>' + esc(g[4]) + '</td><td class="num">' + FS.fmt(g[5]) + '</td><td class="num">' + fmt(g[6]) + '</td><td><span class="badge dot ' + qc + '">' + g[7] + '</span></td><td><span class="badge ' + bl + '">' + g[8] + '</span></td></tr>';
  }
  function grnMount(sec) {
    var poSel = $('#pd-grn-po', sec);
    poSel.innerHTML = GRN.pos.map(function (p, i) { return '<option value="' + i + '">' + p.no + ' · ' + esc(vendor(p.ven).name) + '</option>'; }).join('');
    $('#pd-grn-wh', sec).innerHTML = D.warehouses.map(function (w) { return '<option>' + esc(w) + '</option>'; }).join('');
    $('#pd-grn-reg', sec).innerHTML = GRN.reg.map(function (g) { return grnRegRow(g); }).join('');
    poSel.addEventListener('change', function () { grnLoad(sec, true); });
    var body = $('#pd-grn-body', sec);
    body.addEventListener('input', function (e) {
      var tr = e.target.closest('tr'), k = e.target.dataset.k; if (!tr || !k) return;
      var s = GRN.state[+tr.dataset.i];
      if (k === 'rec') { s.rec = Math.max(0, num(e.target.value)); if (!s.accEdited) { s.acc = s.rec; tr.querySelector('[data-k="acc"]').value = s.acc; } }
      if (k === 'acc') { s.acc = Math.max(0, num(e.target.value)); s.accEdited = true; }
      grnCalc(sec);
    });
    body.addEventListener('change', function (e) { var tr = e.target.closest('tr'); if (tr && e.target.dataset.k === 'why') { GRN.state[+tr.dataset.i].why = e.target.value; grnCalc(sec); } });
    $('#pd-grn-all', sec).addEventListener('click', function () {
      GRN.state.forEach(function (s) { s.rec = s.ord - s.prev; s.acc = s.rec; s.accEdited = false; });
      grnLines(sec); grnCalc(sec); $$('tr', body).forEach(flash);
    });
    $('#pd-grn-new', sec).addEventListener('click', function () { var p = $('#pd-grn-recv', sec); scrollToEl(p); restart(p, 'pd-glow'); var i = $('[data-k="rec"]', body); if (i) setTimeout(function () { i.focus(); }, 400); });
    $('#pd-grn-post', sec).addEventListener('click', function () { grnPost(sec, this); });
    grnLoad(sec, false);
  }
  function grnLoad(sec, anim) {
    var po = GRN.pos[+$('#pd-grn-po', sec).value], v = vendor(po.ven);
    GRN.state = po.lines.map(function (l) { return { sku: l[0], ord: l[1], prev: l[2], billed: l[3], rec: 0, acc: 0, why: '', accEdited: false }; });
    if (!anim) { GRN.state[0].rec = GRN.state[0].acc = Math.max(0, Math.round((GRN.state[0].ord - GRN.state[0].prev) * 0.5)); }
    var cells = [['Vendor', v.name], ['PO date', fd(po.date)], ['Expected', fd(po.exp)], ['Vendor bill', po.bill || 'Not received yet'], ['Lines', po.lines.length]];
    $('#pd-grn-meta', sec).innerHTML = cells.map(function (c) { return '<div><small>' + c[0] + '</small><b>' + esc(c[1]) + '</b></div>'; }).join('');
    grnLines(sec); grnCalc(sec);
    if (anim) skeleton($('.pd-grn-lines', sec), 450);
  }
  function grnLines(sec) {
    $('#pd-grn-body', sec).innerHTML = GRN.state.map(function (s, i) {
      var it = item(s.sku);
      return '<tr data-i="' + i + '"><td class="pd-prod"><b>' + esc(it.name) + '</b><small>' + it.sku + ' · ' + it.unit + ' · ' + money(it.cost) + '</small></td>' +
        '<td class="num">' + FS.fmt(s.ord) + '</td><td class="num muted">' + FS.fmt(s.prev) + '</td>' +
        '<td class="pd-sm"><input class="num" type="number" min="0" data-k="rec" value="' + s.rec + '"></td>' +
        '<td class="pd-sm"><input class="num" type="number" min="0" data-k="acc" value="' + s.acc + '"></td>' +
        '<td class="num pd-rej" data-o="rej">0</td>' +
        '<td class="pd-why"><select data-k="why" disabled><option value="">—</option>' + REASONS.map(function (r) { return '<option' + (r === s.why ? ' selected' : '') + '>' + r + '</option>'; }).join('') + '</select></td>' +
        '<td class="pd-prog"><div class="pd-pbar"><i class="a"></i><i class="b"></i></div><small data-o="pl"></small></td></tr>';
    }).join('');
  }
  function grnCalc(sec) {
    var po = GRN.pos[+$('#pd-grn-po', sec).value], units = 0, val = 0, rejV = 0, variance = 0, over = 0, bad = 0;
    GRN.state.forEach(function (s, i) {
      var tr = $('#pd-grn-body tr[data-i="' + i + '"]', sec), it = item(s.sku);
      var acc = Math.min(s.acc, s.rec), rej = s.rec - acc, remain = s.ord - s.prev;
      units += s.rec; val += acc * it.cost; rejV += rej * it.cost;
      var isOver = s.rec > remain || s.acc > s.rec; if (isOver) over++;
      if (rej > 0 && !s.why) bad++;
      if (po.bill && s.prev + acc !== s.billed) variance++;
      if (!tr) return;
      tr.querySelector('[data-o="rej"]').textContent = FS.fmt(rej);
      tr.querySelector('[data-o="rej"]').classList.toggle('on', rej > 0);
      var w = tr.querySelector('[data-k="why"]'); w.disabled = rej <= 0; w.classList.toggle('pd-bad', rej > 0 && !s.why);
      tr.querySelector('[data-k="rec"]').classList.toggle('pd-bad', s.rec > remain);
      tr.querySelector('[data-k="acc"]').classList.toggle('pd-bad', s.acc > s.rec);
      var pa = Math.min(100, s.prev / s.ord * 100), pb = Math.min(100 - pa, acc / s.ord * 100);
      tr.querySelector('.pd-pbar .a').style.width = pa + '%';
      tr.querySelector('.pd-pbar .b').style.width = pb + '%';
      tr.querySelector('.pd-pbar').classList.toggle('full', s.prev + acc >= s.ord);
      tr.querySelector('[data-o="pl"]').innerHTML = FS.fmt(s.prev) + ' + <b>' + FS.fmt(acc) + '</b> / ' + FS.fmt(s.ord) + (s.prev + acc >= s.ord ? ' · complete' : '');
    });
    $('#pd-grn-u', sec).textContent = FS.fmt(units);
    tick($('#pd-grn-v', sec), val); setMoney($('#pd-grn-r', sec), rejV);
    var ordered = GRN.state.reduce(function (a, s) { return a + s.ord; }, 0), recvd = GRN.state.reduce(function (a, s) { return a + s.prev + Math.min(s.acc, s.rec); }, 0);
    $('#pd-grn-m-po', sec).textContent = FS.fmt(ordered) + ' ordered';
    $('#pd-grn-m-grn', sec).textContent = FS.fmt(recvd) + ' received';
    $('#pd-grn-m-bill', sec).textContent = po.bill ? FS.fmt(GRN.state.reduce(function (a, s) { return a + s.billed; }, 0)) + ' billed' : 'awaited';
    var m = $('#pd-grn-match', sec), badge = $('#pd-grn-badge', sec), note = $('#pd-grn-mnote', sec);
    var st = over ? 'bad' : !po.bill ? 'two' : variance ? 'warn' : 'ok';
    m.dataset.st = st; badge.dataset.st = st;
    var nodes = { po: 'ok', grn: over ? 'bad' : units > 0 || recvd > 0 ? 'ok' : 'wait', bill: !po.bill ? 'wait' : variance ? 'warn' : 'ok' };
    $$('.pd-mnode', m).forEach(function (n) { n.dataset.st = nodes[n.dataset.n]; });
    var txt = { ok: ['circle-check', '3-way matched'], warn: ['triangle-alert', 'Qty variance on ' + variance + ' line' + (variance > 1 ? 's' : '')], two: ['clock', '2-way matched · bill awaited'], bad: ['octagon-alert', 'Over-receipt against PO'] }[st];
    var was = badge.dataset.was; badge.dataset.was = st;
    badge.innerHTML = '<i data-lucide="' + txt[0] + '"></i><span>' + txt[1] + '</span>'; icons(badge);
    if (was && was !== st) restart(badge, 'pd-pop');
    note.textContent = st === 'ok' ? 'PO, GRN and vendor bill ' + po.bill + ' agree on every line — the bill can be approved for payment.' :
      st === 'warn' ? 'Received quantities differ from vendor bill ' + po.bill + '. Receive the balance or raise a debit note.' :
      st === 'two' ? 'Quantities agree with the PO. Matching completes when the vendor bill arrives.' : 'Received now is more than what remains open on the PO.';
    GRN.ok = { units: units, val: val, over: over, bad: bad };
  }
  function grnPost(sec, btn) {
    var o = GRN.ok;
    if (!o.units) { shake($('#pd-grn-body', sec)); toast('Enter the quantity received on at least one line', { tone: 'warn' }); return; }
    if (o.over) { toast('Received now exceeds the open PO quantity', { tone: 'danger' }); return; }
    if (o.bad) { shake($('.pd-bad', sec) || btn); toast('Pick a reason for every rejected quantity', { tone: 'danger' }); return; }
    busy(btn, 'Posting GRN…', 1000).then(function () {
      var po = GRN.pos[+$('#pd-grn-po', sec).value], no = 'GRN-2026-' + pad(GRN.seq++, 4);
      var rej = GRN.state.some(function (s) { return s.rec > s.acc; });
      GRN.state.forEach(function (s, i) { po.lines[i][2] = Math.min(s.ord, s.prev + Math.min(s.acc, s.rec)); });
      var g = [no, '2026-10-01', po.no, vendor(po.ven).name, $('#pd-grn-wh', sec).value, o.units, o.val, rej ? 'Partial reject' : 'Passed', po.bill ? 'Billed' : 'Awaiting'];
      var tb = $('#pd-grn-reg', sec), tmp = document.createElement('tbody'); tmp.innerHTML = grnRegRow(g, true);
      tb.insertBefore(tmp.firstElementChild, tb.firstChild);
      var k = $('#pd-grn-k1', sec); k.textContent = String(num(k.textContent) + 1); restart(k, 'pd-pop');
      celebrate(btn);
      toast(no + ' posted · ' + FS.fmt(o.units) + ' units into ' + $('#pd-grn-wh', sec).value, { tone: 'good', action: { label: 'Create bill', fn: function () { FS.go('app/purchases/bills/new'); } } });
      $('#pd-grn-qc', sec).value = '';
      grnLoad(sec, true);
    });
  }
  FS.onEnter('app/purchases/grn', function (sec, route, first) { if (first) { grnMount(sec); icons(sec); } });

  /* ===================================================================
     3. PURCHASE RETURNS
     =================================================================== */
  var PRS = { page: 1, per: 6, status: 'All', open: {}, seq: 13, lines: [] };
  (function seedReturns() {
    var sup = ['VEN-0001', 'VEN-0003', 'VEN-0002', 'VEN-0005', 'VEN-0004', 'VEN-0006', 'VEN-0001', 'VEN-0003', 'VEN-0007', 'VEN-0002', 'VEN-0005', 'VEN-0001'];
    var st = ['Posted', 'Draft', 'Posted', 'Posted', 'Cancelled', 'Referenced', 'Posted', 'Draft', 'Posted', 'Referenced', 'Posted', 'Draft'];
    var rem = ['Cartons crushed during delivery', 'Near-expiry stock returned', 'Wrong wattage supplied', 'Excess quantity over PO', 'Raised in error', 'Damaged seal — QC rejected', 'Print defect on BOPP tape', 'Leaking packs', 'Wrong part number', 'Short expiry', 'Duplicate dispatch', 'Torn wrap rolls'];
    var skus = { 'VEN-0001': ['PK-1001', 'PK-1003', 'PK-1004'], 'VEN-0003': ['FD-5001', 'FD-5002', 'FD-5003'], 'VEN-0002': ['EL-4001', 'EL-4002'], 'VEN-0005': ['OF-2002', 'IT-6001', 'OF-2003'], 'VEN-0004': ['OF-2003'], 'VEN-0006': ['IN-3001', 'IN-3002'], 'VEN-0007': ['IN-3002'] };
    PRS.list = sup.map(function (c, i) {
      var ss = skus[c], n = 12 - i, lines = ss.slice(0, 1 + (i % ss.length)).map(function (s, j) { var it = item(s); return { sku: s, batch: it.sku.slice(0, 2) + '-' + pad(110 + i * 7 + j, 3), exp: (i % 2 ? '06' : '12') + '-2027', rate: it.cost, qty: 2 + ((i + j) % 5) * 3 }; });
      var amt = lines.reduce(function (a, l) { return a + l.rate * l.qty * 1.18; }, 0);
      return { no: 'PR-' + pad(n, 6), date: '2026-09-' + pad(30 - i * 2, 2), sup: c, ref: (i % 4 === 3 ? '—' : 'PV-2026-000' + (300 - i * 3)), bill: 'SB-' + (1180 - i * 6), items: lines.length, amt: r2(amt), status: st[i], pay: i % 3 === 1 ? 'Cash' : 'Credit', rem: rem[i], lines: lines };
    });
  })();
  function prFiltered(sec) {
    var q = $('#pd-pr-q', sec).value.trim().toLowerCase(), f = $('#pd-pr-from', sec).value, t = $('#pd-pr-to', sec).value, s = $('#pd-pr-fsup', sec).value, p = $('#pd-pr-fpay', sec).value;
    return PRS.list.filter(function (r) {
      var v = vendor(r.sup);
      if (q && (r.no + ' ' + v.name + ' ' + r.ref + ' ' + r.bill).toLowerCase().indexOf(q) < 0) return false;
      if (f && r.date < f) return false; if (t && r.date > t) return false;
      if (s && r.sup !== s) return false; if (p && r.pay !== p) return false;
      return true;
    });
  }
  function prRender(sec) {
    var base = prFiltered(sec), counts = { All: base.length, Draft: 0, Posted: 0, Referenced: 0, Cancelled: 0 };
    base.forEach(function (r) { counts[r.status]++; });
    $('#pd-pr-chips', sec).innerHTML = Object.keys(counts).map(function (k) { return '<button class="' + (PRS.status === k ? 'active' : '') + '" data-st="' + k + '">' + k + ' <i>' + counts[k] + '</i></button>'; }).join('');
    var rows = PRS.status === 'All' ? base : base.filter(function (r) { return r.status === PRS.status; });
    var pages = Math.max(1, Math.ceil(rows.length / PRS.per)); PRS.page = Math.min(PRS.page, pages);
    var start = (PRS.page - 1) * PRS.per, view = rows.slice(start, start + PRS.per);
    var tone = { Posted: 'good', Draft: 'neutral', Referenced: 'info', Cancelled: 'danger' };
    $('#pd-pr-body', sec).innerHTML = view.length ? view.map(function (r, i) {
      var open = PRS.open[r.no];
      return '<tr class="pd-pr-row' + (open ? ' open' : '') + '" data-no="' + r.no + '" style="--i:' + i + '"><td class="pd-xc"><button class="pd-chevb" aria-label="Expand" aria-expanded="' + (open ? 'true' : 'false') + '"><i data-lucide="chevron-right"></i></button></td><td class="muted">' + (start + i + 1) + '</td><td><b>' + r.no + '</b></td><td>' + fdd(r.date) + '</td><td>' + esc(vendor(r.sup).name) + '</td><td>' + r.ref + '</td><td>' + r.bill + '</td><td class="num">' + r.items + '</td><td class="num"><b>' + fmt(r.amt) + '</b></td><td><span class="badge ' + tone[r.status] + '">' + r.status + '</span></td><td>' + r.pay + '</td><td class="pd-act"><button class="pd-icb" data-act="view" title="View"><i data-lucide="eye"></i></button><button class="pd-icb" data-act="print" title="Print"><i data-lucide="printer"></i></button><button class="pd-icb" data-act="more" title="More"><i data-lucide="ellipsis"></i></button></td></tr>' +
        (open ? prDetail(r, true) : '');
    }).join('') : '<tr class="pd-empty"><td colspan="12"><div><span class="icon-well"><i data-lucide="search-x"></i></span><b>No returns match these filters</b><small>Try widening the dates or clearing the search.</small></div></td></tr>';
    $('#pd-pr-showing', sec).textContent = rows.length ? 'Showing ' + (start + 1) + ' to ' + (start + view.length) + ' of ' + rows.length + ' entries' : 'No entries';
    var pg = '<button data-pg="prev"' + (PRS.page === 1 ? ' disabled' : '') + '>‹</button>';
    for (var p = 1; p <= pages; p++) pg += '<button data-pg="' + p + '" class="' + (p === PRS.page ? 'active' : '') + '">' + p + '</button>';
    $('#pd-pr-pager', sec).innerHTML = pg + '<button data-pg="next"' + (PRS.page === pages ? ' disabled' : '') + '>›</button>';
    var tot = rows.reduce(function (a, r) { return a + (r.status === 'Cancelled' ? 0 : r.amt); }, 0);
    $('#pd-pr-sum', sec).innerHTML = 'Returned value <b>' + money(tot) + '</b>';
    icons($('#pd-pr-body', sec));
  }
  function prDetail(r, open) {
    var v = vendor(r.sup), shown = r.lines.slice(0, 3);
    return '<tr class="pd-pr-detail' + (open ? ' open' : '') + '" data-for="' + r.no + '"><td colspan="12"><div class="pd-xd"><div class="pd-xd-in"><div class="pd-xd-card">' +
      '<div class="pd-xd-top"><dl class="pd-xd-dl"><div><dt>Supplier</dt><dd>' + esc(v.name) + '</dd></div><div><dt>Reference #</dt><dd>' + r.ref + '</dd></div><div><dt>Supplier Bill #</dt><dd>' + r.bill + '</dd></div></dl>' +
      '<dl class="pd-xd-dl"><div><dt>Return Date</dt><dd>' + fdd(r.date) + '</dd></div><div><dt>Payment Type</dt><dd>' + r.pay + '</dd></div><div><dt>Remarks</dt><dd>' + esc(r.rem) + '</dd></div></dl>' +
      '<div class="pd-xd-stats"><div><span class="icon-well"><i data-lucide="package"></i></span><span><small>Total Items</small><b>' + r.items + '</b></span></div><div><span class="icon-well blue"><i data-lucide="coins"></i></span><span><small>Total Amount</small><b>' + fmt(r.amt) + '</b></span></div></div>' +
      '<div class="pd-xd-btns"><button class="btn secondary sm" data-act="dup"><i data-lucide="eye"></i>View Details</button><button class="btn primary sm" data-act="edit"><i data-lucide="pencil"></i>Edit Return</button></div></div>' +
      '<b class="pd-xd-h">Return Items (' + r.lines.length + ')</b><table class="pd-mt"><thead><tr><th>#</th><th>Product Name</th><th>Pack</th><th>Batch No.</th><th>Expiry</th><th class="num">Rate</th><th class="num">Returned Qty</th><th class="num">Amount</th></tr></thead><tbody>' +
      shown.map(function (l, i) { var it = item(l.sku); return '<tr><td>' + (i + 1) + '</td><td>' + esc(it.name) + '</td><td>' + esc(it.pack) + '</td><td>' + l.batch + '</td><td>' + l.exp + '</td><td class="num">' + fmt(l.rate) + '</td><td class="num">' + l.qty + '</td><td class="num">' + fmt(l.rate * l.qty) + '</td></tr>'; }).join('') +
      '</tbody></table>' + (r.lines.length > 3 ? '<small class="pd-more-l">+' + (r.lines.length - 3) + ' more items…</small>' : '') + '</div></div></div></td></tr>';
  }
  function prToggle(sec, tr) {
    var no = tr.dataset.no, r = PRS.list.filter(function (x) { return x.no === no; })[0], btn = tr.querySelector('.pd-chevb');
    if (PRS.open[no]) {
      delete PRS.open[no]; tr.classList.remove('open'); btn.setAttribute('aria-expanded', 'false');
      var d = tr.nextElementSibling; if (d && d.classList.contains('pd-pr-detail')) { d.classList.remove('open'); setTimeout(function () { d.remove(); }, RM() ? 0 : 340); }
    } else {
      PRS.open[no] = 1; tr.classList.add('open'); btn.setAttribute('aria-expanded', 'true');
      var tmp = document.createElement('tbody'); tmp.innerHTML = prDetail(r, false);
      var nd = tmp.firstElementChild; tr.after(nd); icons(nd);
      requestAnimationFrame(function () { requestAnimationFrame(function () { nd.classList.add('open'); }); });
    }
  }
  function prMount(sec) {
    $('#pd-pr-fsup', sec).innerHTML += vendorOpts('');
    $('#pd-pr-sup', sec).innerHTML += vendorOpts('');
    var fsup = $('#pd-pr-fsup', sec); fsup.value = '';
    var esup = $('#pd-pr-sup', sec); esup.value = '';
    prRender(sec);
    $('#pd-pr-chips', sec).addEventListener('click', function (e) { var b = e.target.closest('[data-st]'); if (!b) return; PRS.status = b.dataset.st; PRS.page = 1; prRender(sec); });
    $('#pd-pr-pager', sec).addEventListener('click', function (e) {
      var b = e.target.closest('[data-pg]'); if (!b || b.disabled) return;
      PRS.page = b.dataset.pg === 'prev' ? PRS.page - 1 : b.dataset.pg === 'next' ? PRS.page + 1 : +b.dataset.pg; prRender(sec);
    });
    $('#pd-pr-q', sec).addEventListener('input', function () { PRS.page = 1; prRender(sec); });
    $('#pd-pr-search', sec).addEventListener('click', function () { PRS.page = 1; skeleton($('.pd-pr-t', sec).parentElement, 380); prRender(sec); });
    $('#pd-pr-clear', sec).addEventListener('click', function () {
      $('#pd-pr-q', sec).value = ''; $('#pd-pr-from', sec).value = '2026-09-01'; $('#pd-pr-to', sec).value = '2026-10-01'; fsup.value = ''; $('#pd-pr-fpay', sec).value = '';
      PRS.status = 'All'; PRS.page = 1; prRender(sec);
    });
    ['#pd-pr-from', '#pd-pr-to', '#pd-pr-fsup', '#pd-pr-fpay'].forEach(function (id) { $(id, sec).addEventListener('change', function () { PRS.page = 1; prRender(sec); }); });
    $('#pd-pr-body', sec).addEventListener('click', function (e) {
      var tr = e.target.closest('tr.pd-pr-row'), act = e.target.closest('[data-act]');
      if (act) {
        var row = tr || e.target.closest('tr.pd-pr-detail').previousElementSibling, no = row.dataset.no;
        var r = PRS.list.filter(function (x) { return x.no === no; })[0];
        var a = act.dataset.act;
        if (a === 'view') { if (!PRS.open[no]) prToggle(sec, row); return; }
        if (a === 'print') { toast('Printing ' + no + '…', { tone: 'info' }); return; }
        if (a === 'edit' || a === 'dup') { prLoadInto(sec, r, a === 'edit'); return; }
        if (a === 'more') {
          FS.menu(act, [
            { label: 'Duplicate as new return', icon: 'copy', onClick: function () { prLoadInto(sec, r, false); } },
            { label: 'Download PDF', icon: 'download', onClick: function () { toast(no + '.pdf downloaded', { tone: 'good' }); } },
            { sep: true },
            { label: r.status === 'Cancelled' ? 'Already cancelled' : 'Cancel return', icon: 'ban', danger: true, onClick: function () {
              if (r.status === 'Cancelled') return; var was = r.status; r.status = 'Cancelled'; prRender(sec);
              toast(no + ' cancelled', { tone: 'warn', undo: function () { r.status = was; prRender(sec); } });
            } }
          ]);
        }
        return;
      }
      if (tr && (e.target.closest('.pd-chevb') || !e.target.closest('a,button,input'))) prToggle(sec, tr);
    });

    /* editor */
    $('#pd-pr-newbtn', sec).addEventListener('click', function () { var ed = $('#pd-pr-editor', sec); scrollToEl(ed); restart(ed, 'pd-glow'); setTimeout(function () { esup.focus(); }, 450); });
    esup.addEventListener('change', function () {
      var ref = $('#pd-pr-ref', sec), c = esup.value;
      esup.closest('.pd-f').classList.remove('pd-invalid');
      if (!c) { ref.disabled = true; ref.innerHTML = '<option value="">Select supplier first</option>'; return; }
      var h = c.charCodeAt(7);
      ref.innerHTML = '<option value="">Select purchase voucher…</option>' + [0, 1, 2].map(function (i) { return '<option value="' + i + '">PV-2026-000' + (312 - i * 7 - h % 5) + ' · ' + (26 - i * 8) + ' Sep 2026 · Rs ' + FS.fmt((h * 9100 + i * 48250)) + '</option>'; }).join('');
      ref.disabled = false; restart(ref.closest('.pd-f'), 'pd-pop');
      prEffect(sec);
    });
    $('#pd-pr-ref', sec).addEventListener('change', function () {
      if (this.value === '') return;
      var c = esup.value, pool = D.items.filter(function (it) { return it.brand === (vendor(c) || {}).name; });
      if (pool.length < 2) pool = D.items.slice(+this.value * 3 + 2, +this.value * 3 + 5);
      $('#pd-pr-bill', sec).value = 'SB-' + (1190 + +this.value * 7);
      var wrap = $('#pd-pr-linewrap', sec); skeleton(wrap, 650);
      PRS.lines = []; prLines(sec);
      setTimeout(function () {
        PRS.lines = pool.slice(0, 3).map(function (it, i) { return { id: uid(), sku: it.sku, batch: it.sku.slice(0, 2) + '-' + (420 + i * 13), rate: it.cost, qty: i === 0 ? 4 : 2, max: 24 + i * 12, bonus: 0, disc: i === 1 ? 2 : 0, gst: it.gst }; });
        prLines(sec); $$('#pd-pr-lbody tr', sec).forEach(function (tr, i) { tr.style.setProperty('--i', i); tr.classList.add('pd-in'); });
      }, RM() ? 0 : 520);
    });
    $('#pd-pr-gen', sec).addEventListener('click', function () {
      var inp = $('#pd-pr-no', sec); PRS.seq++; restart(inp, 'pd-roll');
      setTimeout(function () { inp.value = 'PR-' + pad(PRS.seq, 6); }, RM() ? 0 : 160);
    });
    $('#pd-pr-tabs', sec).addEventListener('click', function (e) {
      var b = e.target.closest('[data-pt]'); if (!b) return;
      $$('#pd-pr-tabs button', sec).forEach(function (x) { x.classList.toggle('active', x === b); });
      $$('.pd-pr-pane', sec).forEach(function (p) { p.classList.toggle('on', p.dataset.pp === b.dataset.pt); });
      if (b.dataset.pt === 'effect') prEffect(sec);
    });
    $$('#pd-pr-pay input', sec).forEach(function (inp) { inp.addEventListener('change', function () { $$('#pd-pr-pay label', sec).forEach(function (l) { l.classList.toggle('on', l.contains(inp)); }); prEffect(sec); }); });
    $('#pd-pr-additem', sec).addEventListener('click', function () {
      PRS.lines.push({ id: uid(), sku: '', batch: '', rate: 0, qty: 1, max: 999, bonus: 0, disc: 0, gst: 18 }); prLines(sec);
      var tr = $('#pd-pr-lbody tr:last-child', sec); flash(tr); var s = tr.querySelector('select'); if (s) s.focus();
      $('#pd-pr-tabs [data-pt="items"]', sec).click();
    });
    var lb = $('#pd-pr-lbody', sec);
    lb.addEventListener('input', function (e) {
      var tr = e.target.closest('tr'), k = e.target.dataset.k; if (!tr || !k || k === 'sku') return;
      var l = prLine(tr.dataset.id); l[k] = (k === 'batch') ? e.target.value : num(e.target.value);
      prLineCalc(tr, l); prTotals(sec);
    });
    lb.addEventListener('change', function (e) {
      if (e.target.dataset.k !== 'sku') return;
      var tr = e.target.closest('tr'), l = prLine(tr.dataset.id), it = item(e.target.value); if (!it) return;
      l.sku = it.sku; l.rate = it.cost; l.gst = it.gst; l.batch = l.batch || it.sku.slice(0, 2) + '-501';
      prLines(sec); flash($('#pd-pr-lbody tr[data-id="' + l.id + '"]', sec));
    });
    lb.addEventListener('click', function (e) {
      var b = e.target.closest('[data-del]'); if (!b) return;
      var tr = b.closest('tr'), l = prLine(tr.dataset.id), at = PRS.lines.indexOf(l);
      rowOut(tr, function () { PRS.lines.splice(at, 1); prLines(sec); toast('Line removed', { undo: function () { PRS.lines.splice(at, 0, l); prLines(sec); } }); });
    });
    $$('[data-pr-act]', sec).forEach(function (b) { b.addEventListener('click', function () { prSave(sec, b, b.dataset.prAct); }); });
    prLines(sec);
  }
  function prLine(id) { for (var i = 0; i < PRS.lines.length; i++) if (PRS.lines[i].id === id) return PRS.lines[i]; return null; }
  function prCalc(l) { var g = l.rate * l.qty, d = g * l.disc / 100, t = (g - d) * l.gst / 100; return { g: g, d: d, t: t, a: g - d + t }; }
  function prLines(sec) {
    var lb = $('#pd-pr-lbody', sec);
    lb.innerHTML = PRS.lines.length ? PRS.lines.map(function (l, i) {
      var c = prCalc(l), it = item(l.sku) || {};
      var n = function (k, step, extra) { return '<td class="pd-sm"><input class="num" type="number" min="0" step="' + (step || 1) + '" data-k="' + k + '" value="' + l[k] + '"' + (extra || '') + '></td>'; };
      return '<tr data-id="' + l.id + '"><td class="pd-idx">' + (i + 1) + '</td><td class="pd-prod"><select data-k="sku">' + itemOpts(l.sku, 'Search product…') + '</select></td>' +
        '<td><input value="' + esc(it.pack || '') + '" readonly tabindex="-1"></td><td class="pd-sm"><input data-k="batch" value="' + esc(l.batch) + '"></td>' +
        '<td class="pd-sm"><input class="num" type="number" min="0" step="0.01" data-k="rate" value="' + l.rate.toFixed(2) + '"></td>' +
        '<td class="pd-sm pd-qtyc"><input class="num" type="number" min="0" data-k="qty" value="' + l.qty + '"><small>of ' + l.max + '</small></td>' +
        n('bonus') + n('disc', 0.5) +
        '<td class="num pd-out-c" data-o="d">' + fmt(c.d) + '</td>' + n('gst') +
        '<td class="num pd-out-c" data-o="t">' + fmt(c.t) + '</td><td class="num pd-out-c pd-amt" data-o="a"><b>' + fmt(c.a) + '</b></td>' +
        '<td class="pd-del"><button type="button" class="pd-icb danger" data-del aria-label="Delete"><i data-lucide="trash-2"></i></button></td></tr>';
    }).join('') : '<tr class="pd-empty"><td colspan="13"><div><span class="icon-well"><i data-lucide="file-search"></i></span><b>No return lines yet</b><small>Pick a supplier and a reference purchase to load its lines, or press “Add Item”.</small></div></td></tr>';
    icons(lb);
    $$('tr[data-id]', lb).forEach(function (tr) { var l = prLine(tr.dataset.id); tr.querySelector('[data-k="qty"]').classList.toggle('pd-bad', l.qty > l.max); });
    prTotals(sec);
  }
  function prLineCalc(tr, l) {
    var c = prCalc(l);
    tr.querySelector('[data-o="d"]').textContent = fmt(c.d); tr.querySelector('[data-o="t"]').textContent = fmt(c.t); tr.querySelector('[data-o="a"]').innerHTML = '<b>' + fmt(c.a) + '</b>';
    tr.querySelector('[data-k="qty"]').classList.toggle('pd-bad', l.qty > l.max);
  }
  function prTotals(sec) {
    var T = { n: 0, g: 0, d: 0, t: 0, a: 0, q: 0 };
    PRS.lines.forEach(function (l) { if (!l.sku) return; var c = prCalc(l); T.n++; T.g += c.g; T.d += c.d; T.t += c.t; T.a += c.a; T.q += l.qty + l.bonus; });
    PRS.T = T;
    $('#pd-pr-t-items', sec).textContent = T.n; $('#pd-pr-c-items', sec).textContent = T.n;
    tick($('#pd-pr-t-sub', sec), T.g, { prefix: '' }); tick($('#pd-pr-t-disc', sec), T.d, { prefix: '' }); tick($('#pd-pr-t-gst', sec), T.t, { prefix: '' });
    tick($('#pd-pr-t-net', sec), T.a, { prefix: 'Rs ' }); tick($('#pd-pr-c-amt', sec), T.a, { prefix: '' });
    prEffect(sec);
  }
  function prEffect(sec) {
    var T = PRS.T || { n: 0, g: 0, d: 0, t: 0, a: 0, q: 0 }, v = vendor($('#pd-pr-sup', sec).value), cash = $('#pd-pr-pay input:checked', sec).value === 'Cash';
    var stockV = T.g - T.d, after = v ? v.balance - T.a : 0;
    var tiles = [
      ['boxes', 'orange', 'Stock', '−' + FS.fmt(T.q) + ' units', 'Leaves ' + (D.warehouses[0] || 'warehouse') + ' at cost', money(stockV)],
      [cash ? 'banknote' : 'wallet', 'blue', cash ? 'Cash refund' : 'Supplier payable', cash ? '+' + money(T.a) : money(v ? v.balance : 0) + ' → ' + money(Math.max(0, after)), cash ? 'Received into Cash in Hand — Lahore HQ' : (v ? esc(v.name) + ' balance reduces' : 'Select a supplier'), money(T.a)],
      ['percent', 'violet', 'GST reversal', '−' + money(T.t), 'Input tax reversed in Oct-2026 return (Annex-A)', money(T.t)]
    ];
    var jv = [[cash ? '1110-01 · Cash in Hand — Lahore HQ' : '2110-01 · A/P — ' + (v ? v.name : 'Supplier'), T.a, 0], ['1140-01 · Finished Goods', 0, stockV], ['2130-01 · Sales Tax Payable (input reversal)', 0, T.t]];
    var dr = T.a, cr = stockV + T.t, ok = Math.abs(dr - cr) < 0.01 && T.a > 0;
    $('#pd-pr-effect', sec).innerHTML = '<div class="pd-eff-tiles">' + tiles.map(function (t, i) {
      return '<div class="pd-eff" style="--i:' + i + '"><span class="icon-tile ' + t[1] + '"><i data-lucide="' + t[0] + '"></i></span><div><small>' + t[2] + '</small><b>' + t[3] + '</b><span>' + t[4] + '</span></div></div>';
    }).join('') + '</div><div class="pd-eff-jv"><div class="pd-jv-h"><b>Reversal journal preview</b><span class="badge dot ' + (ok ? 'good' : 'neutral') + '">' + (ok ? 'Balanced' : 'Waiting for lines') + '</span></div><table class="pd-mt pd-jv-t"><thead><tr><th>Account</th><th class="num">Debit</th><th class="num">Credit</th></tr></thead><tbody>' +
      jv.map(function (l) { return '<tr><td>' + esc(l[0]) + '</td><td class="num dr">' + (l[1] ? fmt(l[1]) : '') + '</td><td class="num cr">' + (l[2] ? fmt(l[2]) : '') + '</td></tr>'; }).join('') +
      '<tr class="pd-jv-tot"><td>Total</td><td class="num">' + fmt(dr) + '</td><td class="num">' + fmt(cr) + '</td></tr></tbody></table></div>';
    icons($('#pd-pr-effect', sec));
  }
  function prLoadInto(sec, r, edit) {
    var esup = $('#pd-pr-sup', sec); esup.value = r.sup; esup.dispatchEvent(new Event('change'));
    $('#pd-pr-bill', sec).value = r.bill; $('#pd-pr-rem', sec).value = r.rem;
    if (!edit) { PRS.seq++; }
    $('#pd-pr-no', sec).value = edit ? r.no : 'PR-' + pad(PRS.seq, 6);
    PRS.lines = r.lines.map(function (l) { var it = item(l.sku); return { id: uid(), sku: l.sku, batch: l.batch, rate: l.rate, qty: l.qty, max: l.qty + 20, bonus: 0, disc: 0, gst: it.gst }; });
    prLines(sec); var ed = $('#pd-pr-editor', sec); scrollToEl(ed); restart(ed, 'pd-glow');
    toast(edit ? 'Editing ' + r.no : 'Duplicated ' + r.no + ' into a new return', { tone: 'info' });
  }
  function prSave(sec, btn, act) {
    var esup = $('#pd-pr-sup', sec), ok = true;
    if (!esup.value) { esup.closest('.pd-f').classList.add('pd-invalid'); shake(esup.closest('.pd-f')); ok = false; }
    var valid = PRS.lines.filter(function (l) { return l.sku && l.qty > 0; });
    if (ok && !valid.length) { shake($('#pd-pr-linewrap', sec)); toast('Add at least one item to return', { tone: 'warn' }); return; }
    if (PRS.lines.some(function (l) { return l.qty > l.max; })) { toast('Returned qty exceeds the purchased qty on a line', { tone: 'danger' }); return; }
    if (!ok) { toast('Select the supplier first', { tone: 'danger' }); return; }
    var labels = { draft: 'Saving…', print: 'Saving…', post: 'Posting…' };
    busy(btn, labels[act], act === 'post' ? 1000 : 700).then(function () {
      var no = $('#pd-pr-no', sec).value, status = act === 'post' ? 'Posted' : 'Draft';
      var r = { no: no, date: $('#pd-pr-date', sec).value, sup: esup.value, ref: ($('#pd-pr-ref', sec).selectedOptions[0] || {}).value ? $('#pd-pr-ref', sec).selectedOptions[0].textContent.split(' · ')[0] : '—', bill: $('#pd-pr-bill', sec).value || '—', items: valid.length, amt: r2(PRS.T.a), status: status, pay: $('#pd-pr-pay input:checked', sec).value, rem: $('#pd-pr-rem', sec).value || 'Returned to supplier', lines: valid.map(function (l) { return { sku: l.sku, batch: l.batch, exp: '12-2027', rate: l.rate, qty: l.qty }; }) };
      PRS.list = PRS.list.filter(function (x) { return x.no !== no; }); PRS.list.unshift(r);
      PRS.status = 'All'; PRS.page = 1; prRender(sec);
      var first = $('#pd-pr-body tr.pd-pr-row', sec); flash(first);
      var st = $('#pd-pr-c-st', sec); st.textContent = status; st.closest('div').dataset.st = status.toLowerCase(); restart(st, 'pd-pop');
      if (act === 'post') { celebrate(btn); toast(no + ' posted · stock, payable and GST reversed', { tone: 'good', action: { label: 'Debit note', fn: function () { FS.go('app/purchases/debit-notes'); } } }); }
      else toast(no + (act === 'print' ? ' saved — sent to printer' : ' saved as draft'), { tone: 'good' });
      PRS.seq = Math.max(PRS.seq, num(no.replace(/\D/g, ''))) + 1;
      $('#pd-pr-no', sec).value = 'PR-' + pad(PRS.seq, 6);
      PRS.lines = []; prLines(sec);
      setTimeout(function () { st.textContent = 'Draft'; st.closest('div').dataset.st = 'draft'; }, 2600);
    });
  }
  FS.onEnter('app/purchases/returns', function (sec, route, first) { if (first) { prMount(sec); icons(sec); } });

  /* ===================================================================
     4. STOCK VOUCHERS
     =================================================================== */
  var SVT = {
    BRK: { title: 'Breakage Voucher', type: 'BREAKAGE', icon: 'package-x', tone: 'red', acct: '5110-03 · Stock Breakage & Write-off', desc: 'Record damaged, expired or unusable stock. Value is written off to cost of sales.', sub: 'Enter breakage details and the damaged items.', seq: 6 },
    GFT: { title: 'Gift Voucher', type: 'GIFTS', icon: 'gift', tone: 'green', acct: '5220-07 · Gifts & Promotions', desc: 'Issue items as gifts for guests, promotions or other purposes.', sub: 'Enter gift voucher information and add items.', seq: 4 },
    SMP: { title: 'Sample Voucher', type: 'SAMPLES', icon: 'flask-conical', tone: 'blue', acct: '5220-08 · Samples & Trials', desc: 'Send product samples to customers and prospects — track returnable samples.', sub: 'Who receives the samples and why.', seq: 3 },
    INT: { title: 'Internal Use Voucher', type: 'INTERNAL USE', icon: 'building-2', tone: 'orange', acct: '5220-03 · Stationery & Office Supplies', desc: 'Consume stock inside the company — charged to a department or cost centre.', sub: 'Which department consumes the stock.', seq: 9 }
  };
  var SV = { t: 'BRK', rows: [], files: [] };
  SV.prev = [
    ['2026-09-30', 'BRK-2026-0005', 'BRK', 'BR-112', 'Kashif Ali', 5, 12450, 'Posted', 'Expired items', 'Hira Ali'],
    ['2026-09-28', 'GFT-2026-0003', 'GFT', 'EVT-45', 'Marketing Team', 3, 5200, 'Posted', 'Promotional gift', 'Sana Javed'],
    ['2026-09-26', 'SMP-2026-0002', 'SMP', 'LEAD-208', 'Engro Foods', 2, 4180, 'Posted', 'Trial for new SKU', 'Zainab Raza'],
    ['2026-09-24', 'INT-2026-0008', 'INT', 'REQ-311', 'Finance', 4, 15420, 'Posted', 'Toner & paper', 'Hira Ali'],
    ['2026-09-21', 'BRK-2026-0004', 'BRK', '—', 'Faisal Qureshi', 2, 1800, 'Draft', 'Damaged boxes', 'Hira Ali'],
    ['2026-09-18', 'GFT-2026-0002', 'GFT', 'EID-02', 'VIP Customers', 10, 9500, 'Posted', 'Corporate hampers', 'Sana Javed'],
    ['2026-09-12', 'INT-2026-0007', 'INT', 'REQ-298', 'IT', 1, 2150, 'Draft', 'Replacement mouse', 'Mehwish Tariq']
  ];
  function svOpts(list, sel, blank) { return (blank ? '<option value="">' + blank + '</option>' : '') + list.map(function (x) { return '<option' + (x === sel ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join(''); }
  function svFields(t) {
    var T = SVT[t], emps = D.employees.map(function (e) { return e.name; });
    var no = t + '-2026-' + pad(T.seq, 4);
    var common = '<label class="pd-f"><span>Voucher No <em>*</em></span><div class="pd-inp-btn"><input id="pd-sv-no" value="' + no + '" readonly><button type="button" class="btn secondary icon" id="pd-sv-gear" aria-label="Numbering"><i data-lucide="settings"></i></button></div></label>' +
      '<label class="pd-f"><span>Date <em>*</em></span><div class="pd-inp-ic"><i data-lucide="calendar"></i><input type="date" id="pd-sv-date" value="2026-10-01"></div></label>' +
      '<label class="pd-f"><span>Warehouse <em>*</em></span><div class="pd-inp-ic"><i data-lucide="warehouse"></i><select id="pd-sv-wh">' + svOpts(D.warehouses) + '</select></div></label>';
    var spec = {
      BRK: '<label class="pd-f" data-req><span>Reason / Type <em>*</em></span><div class="pd-inp-ic"><i data-lucide="circle-alert"></i><select id="pd-sv-who">' + svOpts(['Damaged in handling', 'Expired', 'Leakage / spillage', 'Water damage', 'Pest damage'], '', 'Select reason') + '</select></div><small class="pd-err-m">Select a reason</small></label>' +
        '<label class="pd-f"><span>Employee / Person</span><div class="pd-inp-ic"><i data-lucide="user-round"></i><select>' + svOpts(emps, 'Kashif Ali') + '</select></div></label>',
      GFT: '<label class="pd-f" data-req><span>Guest / Recipient <em>*</em></span><div class="pd-inp-ic"><i data-lucide="user-round"></i><input id="pd-sv-who" placeholder="Search or enter guest name"></div><small class="pd-err-m">Who receives the gift?</small></label>' +
        '<label class="pd-f"><span>Occasion</span><div class="pd-inp-ic"><i data-lucide="party-popper"></i><select>' + svOpts(['Promotional', 'Eid hamper', 'Corporate gift', 'Event giveaway']) + '</select></div></label>',
      SMP: '<label class="pd-f" data-req><span>Customer / Prospect <em>*</em></span><div class="pd-inp-ic"><i data-lucide="building"></i><select id="pd-sv-who">' + svOpts(D.customers.map(function (c) { return c.name; }), '', 'Select customer') + '</select></div><small class="pd-err-m">Select the customer</small></label>' +
        '<label class="pd-f"><span>Salesperson</span><div class="pd-inp-ic"><i data-lucide="user-round"></i><select>' + svOpts((D.salesTeam && D.salesTeam.salesmen) || ['Bilal Khan']) + '</select></div></label>',
      INT: '<label class="pd-f" data-req><span>Department <em>*</em></span><div class="pd-inp-ic"><i data-lucide="users"></i><select id="pd-sv-who">' + svOpts(['Finance', 'Administration', 'Sales', 'Procurement', 'Operations', 'IT', 'Human Resources'], '', 'Select department') + '</select></div><small class="pd-err-m">Select the department</small></label>' +
        '<label class="pd-f"><span>Cost centre</span><div class="pd-inp-ic"><i data-lucide="folder-kanban"></i><select>' + svOpts(['Lahore HQ', 'Karachi', 'Islamabad', 'Faisalabad']) + '</select></div></label>'
    }[t];
    var extra = t === 'SMP' ? '<div class="pd-f"><span>Returnable</span><label class="switch"><input type="checkbox" checked><i></i><span>Expect samples back in 14 days</span></label></div>' :
      t === 'INT' ? '<label class="pd-f"><span>Requested by</span><div class="pd-inp-ic"><i data-lucide="user-round"></i><select>' + svOpts(emps, 'Hira Ali') + '</select></div></label>' :
      '<label class="pd-f"><span>Reference No</span><div class="pd-inp-ic"><i data-lucide="hash"></i><input placeholder="Enter reference no"></div></label>';
    return common + spec + extra + '<label class="pd-f full"><span>Remarks <small class="muted">(optional)</small></span><div class="pd-inp-ic top"><i data-lucide="notebook-pen"></i><textarea rows="2" placeholder="Enter remarks (optional)"></textarea></div></label>';
  }
  function svTypeCard(sec) {
    var T = SVT[SV.t], no = $('#pd-sv-no', sec), wh = $('#pd-sv-wh', sec);
    $('#pd-sv-type', sec).innerHTML = '<div class="pd-tc-top"><span class="pd-tc-ic ' + T.tone + '"><i data-lucide="' + T.icon + '"></i></span><div><small>Voucher Type</small><b>' + T.title + '</b><p>' + T.desc + '</p></div></div>' +
      '<dl class="pd-tk-dl"><div><dt>Voucher No</dt><dd>' + (no ? no.value : '') + '</dd></div><div><dt>Date</dt><dd>' + fd(($('#pd-sv-date', sec) || {}).value) + '</dd></div><div><dt>Account Code</dt><dd>' + T.acct.split(' · ')[0] + '<small>' + T.acct.split(' · ')[1] + '</small></dd></div><div><dt>Type</dt><dd><span class="pd-tpill ' + SV.t.toLowerCase() + '">' + T.type + '</span></dd></div><div><dt>Warehouse</dt><dd>' + esc(wh ? wh.value : '') + '</dd></div></dl>';
    icons($('#pd-sv-type', sec));
  }
  function svSwitch(sec, t, anim) {
    SV.t = t; var T = SVT[t];
    $$('#pd-sv-tabs button', sec).forEach(function (b) { b.classList.toggle('on', b.dataset.svt === t); });
    var f = $('#pd-sv-fields', sec), card = $('#pd-sv-type', sec), body = $('#pd-sv-body', sec);
    body.dataset.t = t.toLowerCase();
    var paint = function () {
      f.innerHTML = svFields(t); icons(f);
      $('#pd-sv-dsub', sec).textContent = T.sub;
      var di = $('#pd-sv-dic', sec); di.className = 'icon-tile ' + T.tone; di.innerHTML = '<i data-lucide="' + T.icon + '"></i>'; icons(di);
      svTypeCard(sec);
      $('#pd-sv-gear', sec).addEventListener('click', function () { FS.menu(this, [{ label: 'Prefix ' + t + '-YYYY-####', icon: 'hash' }, { label: 'Numbering settings', icon: 'settings', onClick: function () { FS.go('app/settings'); } }]); });
      ['#pd-sv-date', '#pd-sv-wh'].forEach(function (id) { $(id, sec).addEventListener('change', function () { svTypeCard(sec); svTotals(sec); }); });
      var who = $('#pd-sv-who', sec); if (who) who.addEventListener(who.tagName === 'INPUT' ? 'input' : 'change', function () { who.closest('.pd-f').classList.remove('pd-invalid'); });
      if (anim) { restart(f, 'pd-swap-in'); restart(card, 'pd-swap-in'); }
    };
    if (anim && !RM()) { f.classList.add('pd-swap-out'); card.classList.add('pd-swap-out'); setTimeout(function () { f.classList.remove('pd-swap-out'); card.classList.remove('pd-swap-out'); paint(); }, 170); }
    else paint();
  }
  function svRowHtml(r, i) {
    var it = item(r.sku) || {}, after = (it.stock || 0) - r.qty;
    return '<tr data-id="' + r.id + '"' + (r.sel ? ' class="selected"' : '') + '><td class="pd-ck"><input type="checkbox" data-k="sel"' + (r.sel ? ' checked' : '') + ' aria-label="Select"></td><td class="pd-idx">' + (i + 1) + '</td>' +
      '<td class="pd-prod"><select data-k="sku">' + itemOpts(r.sku, 'Search or scan…') + '</select></td>' +
      '<td class="pd-sm"><input data-k="batch" value="' + esc(r.batch) + '" placeholder="Lot"></td>' +
      '<td class="pd-sm2"><input type="month" data-k="exp" value="' + esc(r.exp) + '"></td>' +
      '<td class="pd-xs2"><select data-k="uom"><option>' + esc(it.unit || 'Pcs') + '</option><option>' + esc((it.pack || 'Carton').split(' ')[0]) + '</option></select></td>' +
      '<td class="pd-xs"><input class="num" type="number" min="0" data-k="qty" value="' + r.qty + '"></td>' +
      '<td class="pd-sm"><input class="num" type="number" min="0" step="0.01" data-k="rate" value="' + r.rate.toFixed(2) + '"></td>' +
      '<td class="num pd-out-c pd-amt" data-o="a"><b>' + fmt(r.qty * r.rate) + '</b></td>' +
      '<td class="num pd-out-c" data-o="s">' + svAfter(it, after) + '</td>' +
      '<td><input data-k="remark" value="' + esc(r.remark) + '" placeholder="Optional"></td>' +
      '<td class="pd-del"><button type="button" class="pd-icb danger" data-del aria-label="Delete"><i data-lucide="trash-2"></i></button></td></tr>';
  }
  function svAfter(it, after) {
    if (!it.sku) return '<span class="muted">—</span>';
    var pct = it.stock ? Math.max(0, Math.min(100, after / it.stock * 100)) : 0;
    return '<span class="pd-after' + (after < 0 ? ' neg' : '') + '"><b>' + FS.fmt(after) + '</b><i style="--w:' + pct + '%"></i></span>';
  }
  function svRender(sec) {
    var b = $('#pd-sv-lbody', sec);
    b.innerHTML = SV.rows.length ? SV.rows.map(svRowHtml).join('') : '<tr class="pd-empty"><td colspan="12"><div><span class="icon-well"><i data-lucide="scan-barcode"></i></span><b>No items on this voucher</b><small>Add an item or scan a barcode to begin.</small></div></td></tr>';
    icons(b); svTotals(sec); svSel(sec);
  }
  function svRow(id) { for (var i = 0; i < SV.rows.length; i++) if (SV.rows[i].id === id) return SV.rows[i]; return null; }
  function svNew(sku, qty) { var it = item(sku) || {}; return { id: uid(), sku: sku || '', batch: sku ? (sku.slice(0, 2) + '-' + (300 + Math.floor(Math.random() * 600))) : '', exp: sku ? '2027-0' + (1 + Math.floor(Math.random() * 9)) : '', uom: it.unit || 'Pcs', qty: qty || 0, rate: it.cost || 0, remark: '', sel: false }; }
  function svSel(sec) {
    var n = SV.rows.filter(function (r) { return r.sel; }).length, b = $('#pd-sv-remsel', sec);
    b.disabled = !n; b.lastChild.textContent = n ? 'Remove Selected (' + n + ')' : 'Remove Selected';
    var all = $('#pd-sv-all', sec); all.checked = n > 0 && n === SV.rows.length; all.indeterminate = n > 0 && n < SV.rows.length;
  }
  function svTotals(sec) {
    var q = 0, a = 0, skus = 0, left = 0, neg = 0;
    SV.rows.forEach(function (r) { var it = item(r.sku); if (!it) return; q += r.qty; a += r.qty * r.rate; skus++; left += it.stock - r.qty; if (it.stock - r.qty < 0) neg++; });
    $('#pd-sv-tq', sec).textContent = FS.fmt(q); tick($('#pd-sv-ta', sec), a);
    $('#pd-sv-after', sec).innerHTML = skus ? (neg ? '<span class="neg">' + neg + ' SKU short</span>' : FS.fmt(left) + ' units · ' + skus + ' SKU' + (skus > 1 ? 's' : '')) : 'Auto updated';
  }
  function svScan(sec) {
    var vf = $('#pd-sv-vf', sec), res = $('#pd-sv-res', sec);
    clearTimeout(SV.scanT); vf.classList.remove('hit'); vf.classList.add('scanning');
    res.className = 'pd-scan-res'; res.innerHTML = '<span class="pd-spin"></span><span>Searching for a barcode…</span>';
    SV.scanT = setTimeout(function () {
      if (!$('#pd-sv-scanner', sec).classList.contains('open')) return;
      var pool = D.items.filter(function (it) { return it.stock > 0; }), it = pool[Math.floor(Math.random() * pool.length)];
      vf.classList.remove('scanning'); vf.classList.add('hit'); beep();
      var ex = SV.rows.filter(function (r) { return r.sku === it.sku; })[0], id;
      SV.rows = SV.rows.filter(function (r) { return r.sku; });
      if (ex) { ex.qty += 1; id = ex.id; } else { var r = svNew(it.sku, 1); SV.rows.push(r); id = r.id; }
      svRender(sec); flash($('#pd-sv-lbody tr[data-id="' + id + '"]', sec));
      res.className = 'pd-scan-res ok';
      res.innerHTML = '<span class="icon-well"><i data-lucide="check"></i></span><div><b>' + esc(it.name) + '</b><small>' + it.upc + ' · ' + it.sku + ' · ' + money(it.cost) + ' · ' + FS.fmt(it.stock) + ' in stock</small></div><span class="badge good">' + (ex ? 'Qty +1' : 'Added') + '</span>';
      icons(res);
    }, RM() ? 200 : 1200);
  }
  function svMount(sec) {
    SV.rows = [svNew('FD-5003', 6), svNew('PK-1003', 4)];
    SV.rows[0].remark = 'Leaking caps'; SV.rows[1].remark = 'Crushed core';
    svSwitch(sec, 'BRK', false); svRender(sec); svPrev(sec);
    $('#pd-sv-tabs', sec).addEventListener('click', function (e) { var b = e.target.closest('[data-svt]'); if (b && b.dataset.svt !== SV.t) svSwitch(sec, b.dataset.svt, true); });
    $('#pd-sv-tabs', sec).addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      var ks = Object.keys(SVT), i = ks.indexOf(SV.t) + (e.key === 'ArrowRight' ? 1 : -1); i = (i + ks.length) % ks.length;
      svSwitch(sec, ks[i], true); $('#pd-sv-tabs [data-svt="' + ks[i] + '"]', sec).focus();
    });
    var lb = $('#pd-sv-lbody', sec);
    lb.addEventListener('input', function (e) {
      var tr = e.target.closest('tr'), k = e.target.dataset.k; if (!tr || !k || k === 'sel' || k === 'sku') return;
      var r = svRow(tr.dataset.id); r[k] = (k === 'qty' || k === 'rate') ? num(e.target.value) : e.target.value;
      e.target.classList.remove('pd-bad');
      var it = item(r.sku) || {};
      tr.querySelector('[data-o="a"]').innerHTML = '<b>' + fmt(r.qty * r.rate) + '</b>';
      tr.querySelector('[data-o="s"]').innerHTML = svAfter(it, (it.stock || 0) - r.qty);
      svTotals(sec);
    });
    lb.addEventListener('change', function (e) {
      var tr = e.target.closest('tr'); if (!tr) return; var r = svRow(tr.dataset.id);
      if (e.target.dataset.k === 'sel') { r.sel = e.target.checked; tr.classList.toggle('selected', r.sel); svSel(sec); }
      if (e.target.dataset.k === 'sku') { var n = svNew(e.target.value, r.qty || 1); n.id = r.id; Object.assign(r, n); svRender(sec); flash($('#pd-sv-lbody tr[data-id="' + r.id + '"]', sec)); }
    });
    lb.addEventListener('click', function (e) {
      var b = e.target.closest('[data-del]'); if (!b) return;
      var tr = b.closest('tr'), r = svRow(tr.dataset.id), at = SV.rows.indexOf(r);
      rowOut(tr, function () { SV.rows.splice(at, 1); svRender(sec); toast('Item removed', { undo: function () { SV.rows.splice(at, 0, r); svRender(sec); } }); });
    });
    var add = function () { SV.rows.push(svNew('', 1)); svRender(sec); var tr = $('#pd-sv-lbody tr:last-child', sec); flash(tr); var s = tr.querySelector('select'); if (s) s.focus(); };
    $('#pd-sv-add', sec).addEventListener('click', add); $('#pd-sv-addrow', sec).addEventListener('click', add);
    $('#pd-sv-all', sec).addEventListener('change', function (e) { SV.rows.forEach(function (r) { r.sel = e.target.checked; }); svRender(sec); });
    $('#pd-sv-remsel', sec).addEventListener('click', function () {
      var prev = SV.rows.slice(), n = SV.rows.filter(function (r) { return r.sel; }).length;
      $$('tr.selected', lb).forEach(function (tr) { tr.classList.add('pd-out'); });
      setTimeout(function () { SV.rows = SV.rows.filter(function (r) { return !r.sel; }); svRender(sec); toast(n + ' item' + (n > 1 ? 's' : '') + ' removed', { undo: function () { SV.rows = prev; prev.forEach(function (r) { r.sel = false; }); svRender(sec); } }); }, RM() ? 0 : 260);
    });
    $('#pd-sv-clear', sec).addEventListener('click', function () {
      if (!SV.rows.length) return; var prev = SV.rows.slice(); SV.rows = []; svRender(sec);
      toast('All items cleared', { tone: 'warn', undo: function () { SV.rows = prev; svRender(sec); } });
    });
    $('#pd-sv-scanbtn', sec).addEventListener('click', function () { FS.openModal('pd-sv-scanner'); svScan(sec); });
    $('#pd-sv-again', sec).addEventListener('click', function () { svScan(sec); });
    $('#pd-sv-file', sec).addEventListener('change', function () {
      SV.files = SV.files.concat(Array.prototype.slice.call(this.files).map(function (f) { return f.name; }));
      $('#pd-sv-files', sec).innerHTML = SV.files.length ? SV.files.map(function (n) { return '<span class="pill"><i data-lucide="file"></i>' + esc(n) + '</span>'; }).join(' ') : 'No file selected';
      icons($('#pd-sv-files', sec));
    });
    $('#pd-sv-reset', sec).addEventListener('click', function () {
      var prev = SV.rows.slice(); SV.rows = []; svSwitch(sec, SV.t, true); svRender(sec);
      SV.files = []; $('#pd-sv-files', sec).textContent = 'No file selected';
      toast('Voucher reset', { undo: function () { SV.rows = prev; svRender(sec); } });
    });
    $('#pd-sv-draft', sec).addEventListener('click', function () { svSave(sec, this, false); });
    $('#pd-sv-post', sec).addEventListener('click', function () { svSave(sec, this, true); });
    ['#pd-sv-ftype', '#pd-sv-fst'].forEach(function (id) { $(id, sec).addEventListener('change', function () { svPrev(sec); }); });
    $('#pd-sv-fq', sec).addEventListener('input', function () { svPrev(sec); });
  }
  function svValidate(sec, strict) {
    var errs = 0, who = $('#pd-sv-who', sec);
    if (who && !who.value.trim()) { who.closest('.pd-f').classList.add('pd-invalid'); shake(who.closest('.pd-f')); errs++; }
    var lines = SV.rows.filter(function (r) { return r.sku; });
    if (!lines.length) { shake($('.pd-sv-lines', sec)); errs++; }
    SV.rows.forEach(function (r) {
      var tr = $('#pd-sv-lbody tr[data-id="' + r.id + '"]', sec); if (!tr) return;
      var it = item(r.sku);
      if (!r.sku) { var s = tr.querySelector('[data-k="sku"]'); s.classList.add('pd-bad'); shake(s); errs++; }
      if (strict && (r.qty <= 0 || (it && r.qty > it.stock))) { var q = tr.querySelector('[data-k="qty"]'); q.classList.add('pd-bad'); shake(q); errs++; }
    });
    return errs;
  }
  function svSave(sec, btn, post) {
    var errs = svValidate(sec, post);
    if (errs) { toast(errs + ' field' + (errs > 1 ? 's need' : ' needs') + ' attention before ' + (post ? 'posting' : 'saving'), { tone: 'danger' }); return; }
    busy(btn, post ? 'Posting…' : null, post ? 1000 : 700).then(function () {
      var T = SVT[SV.t], no = $('#pd-sv-no', sec).value, who = $('#pd-sv-who', sec), lines = SV.rows.filter(function (r) { return r.sku; });
      var amt = lines.reduce(function (a, r) { return a + r.qty * r.rate; }, 0);
      if (post) lines.forEach(function (r) { var it = item(r.sku); if (it) it.stock -= r.qty; });
      SV.prev.unshift(['2026-10-01', no, SV.t, '—', who ? who.value : '—', lines.length, amt, post ? 'Posted' : 'Draft', lines[0].remark || T.title, 'Sana Javed']);
      T.seq++;
      svPrev(sec); flash($('#pd-sv-prev tr', sec));
      if (post) { celebrate(btn); toast(no + ' posted · ' + FS.fmt(lines.reduce(function (a, r) { return a + r.qty; }, 0)) + ' units out of ' + $('#pd-sv-wh', sec).value, { tone: 'good', action: { label: 'View stock', fn: function () { FS.go('app/inventory/stock'); } } }); }
      else toast(no + ' saved as draft', { tone: 'good' });
      SV.rows = []; svSwitch(sec, SV.t, true); svRender(sec);
    });
  }
  function svPrev(sec) {
    var ft = $('#pd-sv-ftype', sec).value, fs = $('#pd-sv-fst', sec).value, q = $('#pd-sv-fq', sec).value.trim().toLowerCase();
    var rows = SV.prev.filter(function (p) { return (!ft || p[2] === ft) && (!fs || p[7] === fs) && (!q || p.join(' ').toLowerCase().indexOf(q) > -1); });
    var name = { BRK: 'Breakage', GFT: 'Gift', SMP: 'Sample', INT: 'Internal' }, ic = { BRK: 'package-x', GFT: 'gift', SMP: 'flask-conical', INT: 'building-2' };
    $('#pd-sv-prev', sec).innerHTML = rows.length ? rows.map(function (p) {
      return '<tr><td>' + fdd(p[0]) + '</td><td><b>' + p[1] + '</b></td><td><span class="pd-tpill ' + p[2].toLowerCase() + '"><i data-lucide="' + ic[p[2]] + '"></i>' + name[p[2]] + '</span></td><td>' + p[3] + '</td><td>' + esc(p[4]) + '</td><td class="num">' + p[5] + '</td><td class="num">' + fmt(p[6]) + '</td><td><span class="badge dot ' + (p[7] === 'Posted' ? 'good' : 'warn') + '">' + p[7] + '</span></td><td class="muted">' + esc(p[8]) + '</td><td>' + esc(p[9]) + '</td><td><button class="pd-icb" data-view="' + p[1] + '" aria-label="View"><i data-lucide="eye"></i></button></td></tr>';
    }).join('') : '<tr class="pd-empty"><td colspan="11"><div><b>No vouchers match</b><small>Change the type, status or search.</small></div></td></tr>';
    $('#pd-sv-showing', sec).textContent = 'Showing ' + rows.length + ' of ' + SV.prev.length + ' vouchers';
    icons($('#pd-sv-prev', sec));
    $$('[data-view]', $('#pd-sv-prev', sec)).forEach(function (b) { b.addEventListener('click', function () { toast('Opening ' + b.dataset.view, { tone: 'info' }); }); });
  }
  FS.onEnter('app/inventory/stock-vouchers', function (sec, route, first) { if (first) { svMount(sec); icons(sec); } });

  /* ===================================================================
     5. CHEQUE VOUCHER
     =================================================================== */
  var CQ = { t: 'R', seq: { R: 15, I: 9 }, bt: 'R', rows: [], imported: [] };
  var CQ_SEED = [
    ['CUST-0001', 'Shifa International', '458921', '2026-10-01', '2026-10-15', 250000, 'Against INV-2026-0412'],
    ['CUST-0002', 'City Mart Superstores', '459322', '2026-10-01', '2026-10-15', 175000, 'Advance payment'],
    ['CUST-0004', 'Packages Ltd', '771244', '2026-10-01', '2026-10-16', 335000, 'September supplies'],
    ['CUST-0007', 'Metro Cash & Carry', '771205', '2026-10-02', '2026-10-20', 46500, 'Full settlement'],
    ['CUST-0005', 'Hashoo Hotels', '771988', '2026-10-02', '2026-10-22', 412000, 'Against INV-2026-0398']
  ];
  var CQ_IMPORT = [
    ['CUST-0008', 'Engro Foods', '884512', '2026-10-03', '2026-10-18', 625000, 'Against INV-2026-0421'],
    ['CUST-0009', 'Interloop Ltd', '884513', '2026-10-03', '2026-10-18', 305000, 'Part payment'],
    ['CUST-0006', 'Al-Fatah Stores', '553201', '2026-10-04', '2026-10-25', 118290, 'Against INV-2026-0388'],
    ['CUST-0003', 'Fatima Group', '553219', '2026-10-04', '2026-10-25', 980000, 'Advance — Q4 order'],
    ['CUST-0001', 'Shifa International', '458960', '2026-10-05', '2026-10-30', 140000, 'Against INV-2026-0430']
  ];
  function cqParties(t) { return t === 'R' ? D.customers.filter(function (c) { return c.group !== 'Cash'; }) : D.vendors; }
  function cqSingle(sec) {
    var t = CQ.t, R = t === 'R';
    $$('#pd-cq-stype [data-ct]', sec).forEach(function (b) { b.classList.toggle('on', b.dataset.ct === t); });
    $('#pd-cq-no', sec).value = (R ? 'R' : 'I') + '-CHQ-' + pad(CQ.seq[t], 4);
    var p = $('#pd-cq-party', sec);
    p.innerHTML = '<option value="">' + (R ? 'Select customer / account' : 'Select vendor / account') + '</option>' + cqParties(t).map(function (c) { return '<option value="' + c.code + '">' + c.code + ' · ' + esc(c.name) + '</option>'; }).join('');
    $('#pd-cq-dsub', sec).textContent = R ? 'Enter the cheque received from the customer.' : 'Enter the cheque issued to the vendor.';
    var m = $('#pd-cq-mode', sec);
    m.className = 'banner pd-cq-mode ' + (R ? 'good' : 'info');
    m.querySelector('b').textContent = R ? 'Receive mode: Deposit in bank' : 'Issue mode: Pay from bank';
    m.querySelector('p').textContent = R ? 'The cheque is debited to the bank and credited to the customer account.' : 'The vendor account is debited and the bank is credited when the cheque clears.';
    restart(m, 'pd-pop');
    cqPreview(sec);
  }
  function cqPreview(sec) {
    var R = CQ.t === 'R', amt = num($('#pd-cq-amt', sec).value), bankSel = $('#pd-cq-bank', sec), bank = bankSel.value ? bankSel.selectedOptions[0].textContent.split(' · ')[0] : (R ? 'Customer bank' : 'Bank');
    var party = $('#pd-cq-party', sec), pn = party.value ? party.selectedOptions[0].textContent.split(' · ')[1] : '';
    $('#pd-cq-l1', sec).textContent = R ? 'Dr · ' + (bankSel.value ? bank : 'Bank') : 'Dr · ' + (pn || 'Vendor (A/P)');
    $('#pd-cq-l2', sec).textContent = R ? 'Cr · ' + (pn || 'Customer (A/R)') : 'Cr · ' + (bankSel.value ? bank : 'Bank');
    setMoney($('#pd-cq-p1', sec), amt); setMoney($('#pd-cq-p2', sec), amt);
    var w = amt > 0 ? 'Rupees ' + words(amt) + (Math.round(amt % 1 * 100) ? ' and ' + Math.round(amt % 1 * 100) + ' Paisa' : '') + ' Only' : '';
    $('#pd-cq-words', sec).textContent = w;
    $('#pd-cq-pbank', sec).textContent = R ? (pn ? 'Drawn by ' + pn : 'Customer bank') : bank;
    var cd = $('#pd-cq-cdate', sec).value; $('#pd-cq-pdate', sec).textContent = cd ? fdd(cd).replace(/-/g, ' / ') : '— — —';
    $('#pd-cq-pparty', sec).textContent = R ? (D.company.name || 'Al-Noor Enterprises') : (pn || '________________');
    $('#pd-cq-pwords', sec).textContent = w || 'Rupees ____________________';
    $('#pd-cq-pamt', sec).innerHTML = amt > 0 ? money(amt) : 'Rs —';
    $('#pd-cq-pno', sec).textContent = '⑈' + ($('#pd-cq-chq', sec).value || '000000') + '⑈ 0123⑆ 0045';
  }
  function cqValidate(sec) {
    var v = {
      party: !!$('#pd-cq-party', sec).value,
      chq: /^\d{6,8}$/.test($('#pd-cq-chq', sec).value.trim()),
      cdate: !!$('#pd-cq-cdate', sec).value,
      due: !$('#pd-cq-due', sec).value || !$('#pd-cq-cdate', sec).value || $('#pd-cq-due', sec).value >= $('#pd-cq-cdate', sec).value,
      amt: num($('#pd-cq-amt', sec).value) > 0,
      bank: !!$('#pd-cq-bank', sec).value
    };
    var first = null;
    Object.keys(v).forEach(function (k) {
      var f = $('[data-req="' + k + '"]', sec); if (!f) return;
      f.classList.toggle('pd-invalid', !v[k]);
      if (!v[k]) { shake(f); first = first || f; }
    });
    if (first) { var i = first.querySelector('input,select'); if (i) i.focus({ preventScroll: true }); scrollToEl(first, 140); }
    return !first;
  }
  function cqReset(sec) {
    ['#pd-cq-old', '#pd-cq-chq', '#pd-cq-cdate', '#pd-cq-due', '#pd-cq-amt', '#pd-cq-rem', '#pd-cq-notes'].forEach(function (id) { $(id, sec).value = ''; });
    $('#pd-cq-party', sec).value = ''; $('#pd-cq-bank', sec).value = ''; $('#pd-cq-remc', sec).textContent = '0';
    $$('.pd-invalid', sec).forEach(function (f) { f.classList.remove('pd-invalid'); });
    cqSingle(sec);
  }
  /* bulk */
  function cqRowHtml(r, i) {
    var c = function (k, type, cls, ph) { return '<td class="' + (cls || '') + '"><input data-k="' + k + '"' + (type ? ' type="' + type + '"' : '') + ' value="' + esc(r[k]) + '"' + (ph ? ' placeholder="' + ph + '"' : '') + (type === 'number' ? ' class="num" min="0"' : '') + (r.gen ? ' disabled' : '') + '></td>'; };
    return '<tr data-id="' + r.id + '" class="' + (r.sel ? 'selected ' : '') + (r.gen ? 'pd-gen-done' : '') + '"><td class="pd-ck"><input type="checkbox" data-k="sel"' + (r.sel ? ' checked' : '') + ' aria-label="Select row"></td><td class="pd-idx">' + (i + 1) + '</td>' +
      '<td class="pd-code2"><div class="pd-cellic"><input data-k="code" value="' + esc(r.code) + '" placeholder="CUST-0000"' + (r.gen ? ' disabled' : '') + '><i data-lucide="search"></i></div></td>' +
      c('name', '', 'pd-name', 'Party name') + c('chq', '', 'pd-sm', '000000') + c('cdate', 'date', 'pd-date') + c('due', 'date', 'pd-date') + c('amt', 'number', 'pd-sm2', '0.00') + c('rem', '', 'pd-rem', 'Remarks') +
      '<td class="pd-sm">' + (r.gen ? '<span class="badge good">' + r.gen + '</span>' : '<input data-k="old" value="' + esc(r.old) + '" placeholder="—">') + '</td>' +
      '<td class="pd-act"><button type="button" class="pd-icb" data-dup aria-label="Duplicate row"><i data-lucide="copy"></i></button><button type="button" class="pd-icb danger" data-del aria-label="Delete row"><i data-lucide="trash-2"></i></button></td></tr>';
  }
  function cqMk(a) { return { id: uid(), code: a[0] || '', name: a[1] || '', chq: a[2] || '', cdate: a[3] || '', due: a[4] || '', amt: a[5] || '', rem: a[6] || '', old: '', sel: false, gen: '' }; }
  function cqRender(sec) {
    var b = $('#pd-cq-bbody', sec);
    b.innerHTML = CQ.rows.length ? CQ.rows.map(cqRowHtml).join('') : '<tr class="pd-empty"><td colspan="11"><div><span class="icon-well"><i data-lucide="sheet"></i></span><b>No rows</b><small>Add rows or upload a populated sheet.</small></div></td></tr>';
    icons(b); cqCount(sec);
  }
  function cqCount(sec) {
    var c = $('#pd-cq-rcount', sec), was = c.textContent; c.textContent = CQ.rows.length;
    if (was !== String(CQ.rows.length)) restart(c.parentElement, 'pd-pop');
    var tot = CQ.rows.reduce(function (a, r) { return a + num(r.amt); }, 0);
    $('#pd-cq-btot', sec).innerHTML = CQ.rows.length + ' rows · total <b>' + money(tot) + '</b>';
    var n = CQ.rows.filter(function (r) { return r.sel; }).length, all = $('#pd-cq-ball', sec);
    all.checked = n > 0 && n === CQ.rows.length; all.indeterminate = n > 0 && n < CQ.rows.length;
  }
  function cqRow(id) { for (var i = 0; i < CQ.rows.length; i++) if (CQ.rows[i].id === id) return CQ.rows[i]; return null; }
  function cqBValidate(sec) {
    var issues = [], seen = {};
    var parties = D.customers.concat(D.vendors);
    CQ.rows.forEach(function (r, i) {
      if (r.gen) return;
      var tr = $('#pd-cq-bbody tr[data-id="' + r.id + '"]', sec), bad = {};
      if (!parties.some(function (p) { return p.code === r.code.trim(); })) bad.code = 'party code';
      if (!r.name.trim()) bad.name = 'party name';
      if (!/^\d{6,8}$/.test(String(r.chq).trim())) bad.chq = 'cheque no';
      else if (seen[r.chq]) bad.chq = 'duplicate cheque no'; else seen[r.chq] = 1;
      if (!r.cdate) bad.cdate = 'cheque date';
      if (r.due && r.cdate && r.due < r.cdate) bad.due = 'due before cheque date';
      if (!(num(r.amt) > 0)) bad.amt = 'amount';
      if (tr) $$('input[data-k]', tr).forEach(function (inp) {
        var k = inp.dataset.k; if (k === 'sel') return;
        var isBad = !!bad[k]; inp.classList.toggle('pd-bad', isBad);
        if (isBad) { inp.style.animationDelay = (i * 40) + 'ms'; restart(inp, 'pd-shake'); }
      });
      Object.keys(bad).forEach(function (k) { issues.push('Row ' + (i + 1) + ': ' + bad[k]); });
    });
    var pend = CQ.rows.filter(function (r) { return !r.gen; }), tot = pend.reduce(function (a, r) { return a + num(r.amt); }, 0);
    var rowsBad = {}; issues.forEach(function (s) { rowsBad[s.split(':')[0]] = 1; });
    var ban = $('#pd-cq-vbanner', sec);
    ban.innerHTML = issues.length ?
      '<div class="banner danger pd-vban"><i data-lucide="octagon-alert"></i><div><b>' + issues.length + ' issue' + (issues.length > 1 ? 's' : '') + ' in ' + Object.keys(rowsBad).length + ' row' + (Object.keys(rowsBad).length > 1 ? 's' : '') + ' — fix the highlighted cells</b><p class="pd-issues">' + issues.slice(0, 8).map(function (s) { return '<span>' + esc(s) + '</span>'; }).join('') + (issues.length > 8 ? '<span>+' + (issues.length - 8) + ' more</span>' : '') + '</p></div></div>' :
      '<div class="banner good pd-vban"><i data-lucide="circle-check"></i><div><b>All ' + pend.length + ' rows are valid</b><p>Total ' + money(tot) + ' · ready to generate ' + pend.length + ' voucher' + (pend.length === 1 ? '' : 's') + '.</p></div></div>';
    icons(ban);
    return !issues.length;
  }
  function cqGenerate(sec, btn) {
    var pend = CQ.rows.filter(function (r) { return !r.gen; });
    if (!pend.length) { toast(CQ.rows.length ? 'All rows have already been generated' : 'Add at least one row first', { tone: 'info' }); return; }
    if (!cqBValidate(sec)) { toast('Fix the highlighted cells before generating', { tone: 'danger' }); return; }
    var bar = $('#pd-cq-gen', sec), p = $('#pd-cq-gen-p', sec), n = $('#pd-cq-gen-n', sec), t = CQ.bt;
    btn.classList.add('pd-busy'); btn.disabled = true;
    bar.classList.add('on'); p.style.width = '0'; $('#pd-cq-gen-t', sec).textContent = 'Generating vouchers…';
    var i = 0, firstNo = null, lastNo = null;
    var step = function () {
      if (i >= pend.length) {
        $('#pd-cq-gen-t', sec).textContent = 'Done — ' + pend.length + ' vouchers created';
        btn.classList.remove('pd-busy'); btn.disabled = false;
        celebrate(btn);
        toast(pend.length + ' cheque vouchers generated · ' + firstNo + (pend.length > 1 ? ' → ' + lastNo : ''), { tone: 'good', action: { label: 'Cheque register', fn: function () { FS.go('app/bank/cheque-register'); } } });
        $('#pd-cq-bs2', sec).classList.add('done');
        setTimeout(function () { bar.classList.remove('on'); }, 1400);
        return;
      }
      var r = pend[i], no = t + '-CHQ-' + pad(CQ.seq[t]++, 4);
      r.gen = no; firstNo = firstNo || no; lastNo = no;
      var tr = $('#pd-cq-bbody tr[data-id="' + r.id + '"]', sec);
      if (tr) { var tmp = document.createElement('tbody'); tmp.innerHTML = cqRowHtml(r, CQ.rows.indexOf(r)); var ntr = tmp.firstElementChild; ntr.classList.add('pd-gen-now'); tr.replaceWith(ntr); icons(ntr); }
      i++; p.style.width = (i / pend.length * 100) + '%'; n.textContent = i + ' / ' + pend.length;
      setTimeout(step, RM() ? 0 : 260);
    };
    n.textContent = '0 / ' + pend.length;
    setTimeout(step, RM() ? 0 : 200);
    if (CQ.t === t) { $('#pd-cq-no', sec).value = t + '-CHQ-' + pad(CQ.seq[t] + pend.length, 4); }
  }
  function cqMount(sec) {
    $('#pd-cq-bank', sec).innerHTML = '<option value="">Select bank account</option>' + D.banks.map(function (b) { return '<option value="' + b.code + '">' + esc(b.name) + ' · ' + b.code + '</option>'; }).join('');
    $('#pd-cq-bbank', sec).innerHTML = D.banks.map(function (b) { return '<option value="' + b.code + '">' + esc(b.name) + '</option>'; }).join('');
    cqSingle(sec);
    $('#pd-cq-tabs', sec).addEventListener('click', function (e) {
      var b = e.target.closest('[data-cqt]'); if (!b) return;
      $$('#pd-cq-tabs button', sec).forEach(function (x) { x.classList.toggle('on', x === b); });
      $$('.pd-cq-pane', sec).forEach(function (p) { p.classList.toggle('on', p.dataset.cqp === b.dataset.cqt); });
      $('#pd-cq-sub', sec).textContent = b.dataset.cqt === 'bulk' ? 'Create many cheque vouchers at once — type rows on screen or populate them from Excel.' : 'Create a single cheque voucher for receipt or issuance.';
    });
    $('#pd-cq-stype', sec).addEventListener('click', function (e) { var b = e.target.closest('[data-ct]'); if (b && b.dataset.ct !== CQ.t) { CQ.t = b.dataset.ct; cqSingle(sec); } });
    var form = $('.pd-cq-pane[data-cqp="single"]', sec);
    form.addEventListener('input', function (e) {
      var f = e.target.closest('.pd-f.pd-invalid'); if (f) f.classList.remove('pd-invalid');
      if (e.target.id === 'pd-cq-rem') $('#pd-cq-remc', sec).textContent = e.target.value.length;
      cqPreview(sec);
    });
    form.addEventListener('change', function (e) { var f = e.target.closest('.pd-f.pd-invalid'); if (f) f.classList.remove('pd-invalid'); cqPreview(sec); });
    $('#pd-cq-save', sec).addEventListener('click', function () {
      if (!cqValidate(sec)) { toast('Please fix the highlighted fields', { tone: 'danger' }); return; }
      var b = this, no = $('#pd-cq-no', sec).value, amt = num($('#pd-cq-amt', sec).value);
      busy(b, 'Saving…', 900).then(function () {
        celebrate(b); CQ.seq[CQ.t]++;
        toast(no + ' saved · ' + FS.fmt(amt, 2) + ' ' + (CQ.t === 'R' ? 'received' : 'issued'), { tone: 'good', action: { label: 'Register', fn: function () { FS.go('app/bank/cheque-register'); } } });
        cqReset(sec);
      });
    });
    $('#pd-cq-cancel', sec).addEventListener('click', function () { cqReset(sec); toast('Form cleared'); });
    $('#pd-cq-new', sec).addEventListener('click', function () { cqReset(sec); CQ.rows = CQ_SEED.map(cqMk); cqRender(sec); $('#pd-cq-vbanner', sec).innerHTML = ''; toast('Ready for a new voucher', { tone: 'info' }); });

    /* bulk */
    CQ.rows = CQ_SEED.map(cqMk); cqRender(sec);
    $('#pd-cq-btype', sec).addEventListener('click', function (e) {
      var b = e.target.closest('[data-ct]'); if (!b) return; CQ.bt = b.dataset.ct;
      $$('#pd-cq-btype button', sec).forEach(function (x) { x.classList.toggle('on', x === b); });
      $('#pd-cq-bpre', sec).value = (CQ.bt === 'R' ? 'R' : 'I') + '-Chq # -';
    });
    var bb = $('#pd-cq-bbody', sec);
    bb.addEventListener('input', function (e) {
      var tr = e.target.closest('tr'), k = e.target.dataset.k; if (!tr || !k || k === 'sel') return;
      var r = cqRow(tr.dataset.id); r[k] = e.target.value; e.target.classList.remove('pd-bad');
      if (k === 'amt') cqCount(sec);
    });
    bb.addEventListener('change', function (e) {
      var tr = e.target.closest('tr'), k = e.target.dataset.k; if (!tr) return; var r = cqRow(tr.dataset.id);
      if (k === 'sel') { r.sel = e.target.checked; tr.classList.toggle('selected', r.sel); cqCount(sec); }
      if (k === 'code') {
        var code = e.target.value.trim().toUpperCase(); e.target.value = code; r.code = code;
        var p = D.customers.concat(D.vendors).filter(function (x) { return x.code === code; })[0];
        if (p) { r.name = p.name; var ni = tr.querySelector('[data-k="name"]'); ni.value = p.name; ni.classList.remove('pd-bad'); restart(ni, 'pd-cellflash'); }
      }
    });
    bb.addEventListener('click', function (e) {
      var tr = e.target.closest('tr'); if (!tr) return; var r = cqRow(tr.dataset.id), at = CQ.rows.indexOf(r);
      if (e.target.closest('[data-dup]')) {
        var c = cqMk([r.code, r.name, r.chq ? String(+r.chq + 1) : '', r.cdate, r.due, r.amt, r.rem]);
        CQ.rows.splice(at + 1, 0, c); cqRender(sec); flash($('#pd-cq-bbody tr[data-id="' + c.id + '"]', sec));
      }
      if (e.target.closest('[data-del]')) rowOut(tr, function () { CQ.rows.splice(at, 1); cqRender(sec); toast('Row deleted', { undo: function () { CQ.rows.splice(at, 0, r); cqRender(sec); } }); });
    });
    $('#pd-cq-ball', sec).addEventListener('change', function (e) { CQ.rows.forEach(function (r) { r.sel = e.target.checked; }); cqRender(sec); });
    $('#pd-cq-badd', sec).addEventListener('click', function () {
      var r = cqMk(['', '', '', $('#pd-cq-bdate', sec).value, '', '', $('#pd-cq-bpre', sec).value]); CQ.rows.push(r); cqRender(sec);
      var tr = $('#pd-cq-bbody tr[data-id="' + r.id + '"]', sec); flash(tr); tr.querySelector('[data-k="code"]').focus();
    });
    $('#pd-cq-bdup', sec).addEventListener('click', function () {
      var sel = CQ.rows.filter(function (r) { return r.sel; }); if (!sel.length) { toast('Select rows to duplicate', { tone: 'info' }); return; }
      var added = sel.map(function (r) { r.sel = false; return cqMk([r.code, r.name, r.chq ? String(+r.chq + 100) : '', r.cdate, r.due, r.amt, r.rem]); });
      CQ.rows = CQ.rows.concat(added); cqRender(sec);
      added.forEach(function (r) { flash($('#pd-cq-bbody tr[data-id="' + r.id + '"]', sec)); });
      toast(added.length + ' row' + (added.length > 1 ? 's' : '') + ' duplicated', { tone: 'good' });
    });
    $('#pd-cq-bdel', sec).addEventListener('click', function () {
      var n = CQ.rows.filter(function (r) { return r.sel; }).length; if (!n) { toast('Select rows to delete', { tone: 'info' }); return; }
      var prev = CQ.rows.slice(); $$('tr.selected', bb).forEach(function (tr) { tr.classList.add('pd-out'); });
      setTimeout(function () { CQ.rows = CQ.rows.filter(function (r) { return !r.sel; }); cqRender(sec); toast(n + ' row' + (n > 1 ? 's' : '') + ' deleted', { undo: function () { CQ.rows = prev; prev.forEach(function (r) { r.sel = false; }); cqRender(sec); } }); }, RM() ? 0 : 260);
    });
    $('#pd-cq-tpl', sec).addEventListener('click', function () {
      var csv = 'PartyCode,PartyName,ChequeNo,ChequeDate,DueDate,Amount,Remarks,OldNo\r\n' +
        'CUST-0001,Shifa International,458921,2026-10-01,2026-10-15,250000,Against INV-2026-0412,\r\n' +
        'CUST-0002,City Mart Superstores,459322,2026-10-01,2026-10-15,175000,Advance payment,\r\n';
      try {
        var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), url = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = url; a.download = 'finsoft-cheque-voucher-template.csv'; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
      } catch (err) { /* download not supported */ }
      $('#pd-cq-bs2', sec).classList.add('on');
      toast('Template downloaded · finsoft-cheque-voucher-template.csv', { tone: 'good' });
    });
    $('#pd-cq-upl', sec).addEventListener('click', function () {
      var b = this;
      busy(b, 'Reading sheet…', 1100).then(function () {
        $('#pd-cq-bs2', sec).classList.add('on');
        var add = CQ_IMPORT.map(function (a) { var r = cqMk(a); r.rem = $('#pd-cq-bpre', sec).value + ' ' + a[6]; return r; });
        CQ.imported = add; CQ.rows = CQ.rows.concat(add); cqRender(sec);
        add.forEach(function (r, i) { var tr = $('#pd-cq-bbody tr[data-id="' + r.id + '"]', sec); if (tr) { tr.style.setProperty('--i', i); tr.classList.add('pd-in', 'row-flash'); } });
        $('#pd-cq-prev', sec).disabled = false;
        toast('5 rows imported from cheques-oct-2026.xlsx', { tone: 'good' });
      });
    });
    $('#pd-cq-prev', sec).addEventListener('click', function () {
      FS.drawer({ title: 'Last import preview', subtitle: 'cheques-oct-2026.xlsx · ' + CQ.imported.length + ' rows', html: '<table class="tbl" data-plain><thead><tr><th>Party</th><th>Cheque</th><th class="num">Amount</th></tr></thead><tbody>' + CQ.imported.map(function (r) { return '<tr><td><b>' + esc(r.name) + '</b><small>' + r.code + '</small></td><td>' + r.chq + '<small>' + fd(r.cdate) + '</small></td><td class="num">' + fmt(num(r.amt)) + '</td></tr>'; }).join('') + '</tbody></table>', foot: '<button class="btn secondary" data-close>Close</button>' });
    });
    $('#pd-cq-validate', sec).addEventListener('click', function () { var ok = cqBValidate(sec); if (ok) toast('All rows valid', { tone: 'good' }); });
    $('#pd-cq-generate', sec).addEventListener('click', function () { cqGenerate(sec, this); });
    $('#pd-cq-bcancel', sec).addEventListener('click', function () {
      var prev = CQ.rows.slice(); CQ.rows = CQ_SEED.map(cqMk); cqRender(sec); $('#pd-cq-vbanner', sec).innerHTML = '';
      toast('Bulk sheet reset', { undo: function () { CQ.rows = prev; cqRender(sec); } });
    });
  }
  FS.onEnter('app/bank/cheque-voucher', function (sec, route, first) { if (first) { cqMount(sec); icons(sec); } });

  /* ===================================================================
     6. NEW VOUCHER
     =================================================================== */
  var ACC = [
    ['Assets', [['1110-01', 'Cash in Hand — Lahore HQ', 'cash'], ['1110-02', 'Petty Cash — Karachi', 'cash'], ['1120-01', 'Meezan Bank — 0123', 'bank'], ['1120-02', 'HBL — 8721', 'bank'], ['1120-03', 'UBL — 2294', 'bank'], ['1120-04', 'Bank Alfalah — 5510', 'bank'], ['1130-01', 'Accounts Receivable — Trade', 'ar'], ['1140-01', 'Finished Goods', 'asset'], ['1140-03', 'Packing Material', 'asset'], ['1150-01', 'Advances to Staff', 'asset'], ['1150-03', 'Prepaid Rent', 'asset'], ['1150-04', 'Advance Income Tax', 'asset'], ['1210-04', 'Furniture & Fixtures', 'asset'], ['1210-05', 'Computers & IT Equipment', 'asset']]],
    ['Liabilities', [['2110-01', 'Accounts Payable — Trade', 'ap'], ['2120-01', 'Accrued Salaries', 'liab'], ['2120-02', 'Accrued Expenses', 'liab'], ['2130-01', 'Sales Tax Payable (GST 18%)', 'liab'], ['2130-02', 'WHT Payable u/s 153', 'liab'], ['2140-01', 'EOBI, PESSI & PF Payable', 'liab']]],
    ['Equity', [['3110-01', 'Ordinary Share Capital', 'eq'], ['3120-01', 'Unappropriated Profit', 'eq'], ['3120-02', "Directors' Current Account", 'eq']]],
    ['Income', [['4110-01', 'Sales — Local', 'inc'], ['4110-02', 'Sales — Export', 'inc'], ['4210-01', 'Profit on Bank Deposits', 'inc'], ['4210-02', 'Gain on Disposal of Assets', 'inc']]],
    ['Expenses', [['5110-01', 'Cost of Goods Sold', 'exp'], ['5110-02', 'Freight Inward', 'exp'], ['5210-01', 'Salaries & Wages', 'exp'], ['5220-01', 'Rent — Lahore HQ', 'exp'], ['5220-02', 'Electricity & Utilities', 'exp'], ['5220-03', 'Stationery & Office Supplies', 'exp'], ['5230-01', 'Depreciation Expense', 'exp']]]
  ];
  var ACCMAP = {}; ACC.forEach(function (g) { g[1].forEach(function (a) { ACCMAP[a[0]] = { code: a[0], name: a[1], k: a[2] }; }); });
  var VT = {
    JV: { name: 'Journal Voucher', seq: 46, mode: 'dual', sub: 'Enter a balanced voucher — every debit has a matching credit.', esub: 'Add debit and credit lines. The voucher must be balanced.' },
    CPV: { name: 'Cash Payment', seq: 212, mode: 'one', side: 'dr', box: 'cash', party: 'Pay to', allow: ['exp', 'ap', 'liab', 'asset'], sub: 'Pay out of a cash account — the cash leg is posted for you.', esub: 'List what the cash was spent on. The cash credit is added automatically.' },
    CRV: { name: 'Cash Receipt', seq: 187, mode: 'one', side: 'cr', box: 'cash', party: 'Received from', allow: ['inc', 'ar', 'liab', 'eq', 'asset'], sub: 'Receive cash into a drawer — the cash leg is posted for you.', esub: 'List what the cash was received for. The cash debit is added automatically.' },
    BPV: { name: 'Bank Payment', seq: 95, mode: 'one', side: 'dr', box: 'bank', party: 'Payee', allow: ['exp', 'ap', 'liab', 'asset'], sub: 'Pay from a bank account by cheque or transfer.', esub: 'List what the payment covers. The bank credit is added automatically.' },
    BRV: { name: 'Bank Receipt', seq: 133, mode: 'one', side: 'cr', box: 'bank', party: 'Received from', allow: ['inc', 'ar', 'liab', 'eq', 'asset'], sub: 'Receive money into a bank account.', esub: 'List what the receipt is for. The bank debit is added automatically.' },
    CV: { name: 'Contra', seq: 21, mode: 'dual', only: ['cash', 'bank'], sub: 'Move money between cash and bank accounts.', esub: 'Contra lines may only use cash and bank accounts.' },
    OB: { name: 'Opening', seq: 1, mode: 'dual', sub: 'Opening balances as at 01 Jul 2026 — debits must equal credits.', esub: 'Enter opening debit and credit balances.' }
  };
  var CC = ['Main Branch', 'Lahore HQ', 'Karachi', 'Islamabad', 'Faisalabad', 'Projects'];
  var VN = { t: 'JV', lines: [], dirty: false };
  var TPL = {
    rent: { label: 'Monthly rent — Lahore HQ', narr: 'Rent for October 2026 — Lahore HQ office lease', lines: [['5220-01', 'Rent — October 2026', 450000, 0, 'Lahore HQ'], ['2120-02', 'Rent payable to landlord', 0, 450000, 'Lahore HQ']] },
    sal: { label: 'Salary accrual', narr: 'October 2026 payroll accrual', lines: [['5210-01', 'Gross salaries — October', 3655000, 0, 'Main Branch'], ['2120-01', 'Net salaries payable', 0, 3290000, 'Main Branch'], ['2140-01', 'EOBI, PESSI & PF', 0, 365000, 'Main Branch']] },
    util: { label: 'Electricity bill (LESCO)', narr: 'LESCO electricity bill — September 2026', lines: [['5220-02', 'LESCO bill — Sep 2026', 184250, 0, 'Lahore HQ'], ['2120-02', 'Utilities payable', 0, 184250, 'Lahore HQ']] },
    dep: { label: 'Monthly depreciation', narr: 'Depreciation charge — September 2026', lines: [['5230-01', 'Depreciation — furniture & IT', 96400, 0, 'Main Branch'], ['1210-04', 'Furniture & Fixtures', 0, 38200, 'Main Branch'], ['1210-05', 'Computers & IT Equipment', 0, 58200, 'Main Branch']] }
  };
  var SAMPLE = {
    JV: [['1110-01', 'Cash received from customer', 50000, 0, 'Main Branch'], ['4110-01', 'Sales against invoice #INV-1024', 0, 50000, 'Main Branch']],
    CPV: [['5220-03', 'Printer toner & A4 paper', 18500, 0, 'Lahore HQ'], ['5110-02', 'Loader charges — TCS', 6200, 0, 'Lahore HQ']],
    CRV: [['4110-01', 'Counter sale — walk-in', 46500, 0, 'Lahore HQ']],
    BPV: [['2110-01', 'Habib Packaging — INV 45872', 250000, 0, 'Main Branch']],
    BRV: [['1130-01', 'Shifa International — INV-2026-0412', 250000, 0, 'Main Branch']],
    CV: [['1120-01', 'Cash deposited to Meezan', 300000, 0, 'Lahore HQ'], ['1110-01', 'Cash withdrawn from drawer', 0, 300000, 'Lahore HQ']],
    OB: [['1140-01', 'Opening stock', 28050210, 0, 'Main Branch'], ['3120-01', 'Opening retained earnings', 0, 28050210, 'Main Branch']]
  };
  function vnLine(a) { a = a || []; return { id: uid(), acc: a[0] || '', desc: a[1] || '', dr: a[2] || 0, cr: a[3] || 0, cc: a[4] || 'Main Branch' }; }
  function vnAccOpts(sel, t) {
    var cfg = VT[t];
    return '<option value="">Select account…</option>' + ACC.map(function (g) {
      var list = g[1].filter(function (a) {
        if (cfg.only) return cfg.only.indexOf(a[2]) > -1;
        if (cfg.mode === 'one') return cfg.allow.indexOf(a[2]) > -1;
        return true;
      });
      if (sel && ACCMAP[sel] && !list.some(function (a) { return a[0] === sel; }) && g[1].some(function (a) { return a[0] === sel; })) list = list.concat([[sel, ACCMAP[sel].name]]);
      return list.length ? '<optgroup label="' + g[0] + '">' + list.map(function (a) { return '<option value="' + a[0] + '"' + (a[0] === sel ? ' selected' : '') + '>' + esc(a[1]) + '</option>'; }).join('') + '</optgroup>' : '';
    }).join('');
  }
  function vnNo() { var c = VT[VN.t]; return VN.t + '-2026-' + pad(c.seq, 6); }
  function vnHead(sec) {
    var c = VT[VN.t], one = c.mode === 'one', amtH = c.side === 'dr' ? 'Debit (PKR)' : 'Credit (PKR)';
    $('#pd-vn-thead', sec).innerHTML = '<tr><th class="pd-hd"></th><th>#</th><th class="pd-prod">Account</th><th>Code</th><th>Description / Narration</th>' + (one ? '<th class="num">' + amtH + '</th>' : '<th class="num">Debit (PKR)</th><th class="num">Credit (PKR)</th>') + '<th>Cost Centre</th><th class="pd-act-h">Actions</th></tr>';
  }
  function vnRowHtml(l, i) {
    var c = VT[VN.t], one = c.mode === 'one', a = ACCMAP[l.acc];
    var amt = function (k, v) { return '<td class="pd-sm2"><input class="num" type="number" min="0" step="0.01" data-k="' + k + '" value="' + (v ? v : '') + '" placeholder="0.00"></td>'; };
    return '<tr data-id="' + l.id + '"><td class="pd-hd"><span class="pd-grip" title="Drag to reorder"><i data-lucide="grip-vertical"></i></span></td><td class="pd-idx">' + (i + 1) + '</td>' +
      '<td class="pd-prod"><select data-k="acc">' + vnAccOpts(l.acc, VN.t) + '</select></td>' +
      '<td class="pd-code"><input value="' + (a ? a.code : '') + '" readonly tabindex="-1" placeholder="auto"></td>' +
      '<td class="pd-desc"><input data-k="desc" value="' + esc(l.desc) + '" placeholder="Line description"></td>' +
      (one ? amt('amt', l.dr || l.cr) : amt('dr', l.dr) + amt('cr', l.cr)) +
      '<td class="pd-sm2"><select data-k="cc">' + CC.map(function (x) { return '<option' + (x === l.cc ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select></td>' +
      '<td class="pd-act"><button type="button" class="pd-icb" data-dup aria-label="Duplicate line"><i data-lucide="copy"></i></button><button type="button" class="pd-icb danger" data-del aria-label="Delete line"><i data-lucide="trash-2"></i></button></td></tr>';
  }
  function vnBoxAcc(sec) { var s = $('#pd-vn-box', sec); return s ? s.value : ''; }
  function vnContra(sec) {
    var c = VT[VN.t], tb = $('#pd-vn-contra', sec);
    if (c.mode !== 'one') { tb.innerHTML = ''; return; }
    var a = ACCMAP[vnBoxAcc(sec)], tot = VN.lines.reduce(function (s, l) { return s + num(l.dr || l.cr); }, 0);
    tb.innerHTML = '<tr class="pd-contra"><td class="pd-hd"><span class="pd-lock"><i data-lucide="lock"></i></span></td><td class="pd-idx">↳</td><td class="pd-prod"><b>' + (a ? esc(a.name) : 'Select the ' + c.box + ' account above') + '</b></td><td class="pd-code"><span>' + (a ? a.code : '—') + '</span></td><td><span class="muted">Auto contra — balancing ' + c.box + ' ' + (c.side === 'dr' ? 'credit' : 'debit') + '</span></td><td class="num"><b data-o="contra">' + fmt(tot) + '</b></td><td><span class="badge lime">Auto</span></td><td></td></tr>';
    icons(tb);
  }
  function vnRender(sec, stagger) {
    vnHead(sec);
    var b = $('#pd-vn-body', sec);
    b.innerHTML = VN.lines.length ? VN.lines.map(vnRowHtml).join('') : '<tr class="pd-empty"><td colspan="10"><div><span class="icon-well"><i data-lucide="list-plus"></i></span><b>No lines yet</b><small>Add a line or import from a template.</small></div></td></tr>';
    if (stagger) $$('tr[data-id]', b).forEach(function (tr, i) { tr.style.setProperty('--i', i); tr.classList.add('pd-in'); });
    icons(b); vnContra(sec); vnTotals(sec);
  }
  function vnLineById(id) { for (var i = 0; i < VN.lines.length; i++) if (VN.lines[i].id === id) return VN.lines[i]; return null; }
  function vnTotals(sec) {
    var c = VT[VN.t], one = c.mode === 'one', dr = 0, cr = 0, missing = 0;
    VN.lines.forEach(function (l) {
      var v = one ? num(l.dr || l.cr) : 0;
      if (one) { if (c.side === 'dr') dr += v; else cr += v; }
      else { dr += num(l.dr); cr += num(l.cr); }
      if ((num(l.dr) || num(l.cr)) && !l.acc) missing++;
    });
    var box = one ? vnBoxAcc(sec) : 'x';
    if (one) { if (c.side === 'dr') cr = dr; else dr = cr; }
    var diff = r2(dr - cr), ok = dr > 0 && Math.abs(diff) < 0.005 && !missing && !!box;
    tick($('#pd-vn-tdr', sec), dr); tick($('#pd-vn-tcr', sec), cr);
    var bal = $('#pd-vn-bal', sec), was = bal.classList.contains('ok');
    bal.classList.toggle('ok', ok); bal.classList.toggle('bad', !ok && dr + cr > 0);
    $('#pd-vn-bal-t', sec).textContent = ok ? 'Balanced' : 'Unbalanced';
    $('#pd-vn-bal-s', sec).textContent = ok ? 'Difference is zero' : !dr && !cr ? 'Add amounts to begin' : missing ? missing + ' line' + (missing > 1 ? 's' : '') + ' without an account' : one && !box ? 'Select the ' + c.box + ' account' : 'Difference Rs ' + FS.fmt(Math.abs(diff), 2);
    if (ok && !was) restart(bal, 'pd-balpop');
    if (!ok && was) restart(bal, 'pd-wobble');
    $('#pd-vn-totbar', sec).classList.toggle('ok', ok);
    $('#pd-vn-post', sec).disabled = !ok; $('#pd-vn-postmenu', sec).disabled = !ok;
    var ct = $('#pd-vn-contra [data-o="contra"]', sec); if (ct) ct.textContent = fmt(one && c.side === 'dr' ? dr : cr);
    VN.ok = ok;
  }
  function vnMorph(sec, anim) {
    var c = VT[VN.t], wrap = $('#pd-vn-morph', sec), inn = $('#pd-vn-morph-in', sec), h0 = wrap.offsetHeight, html = '';
    if (c.mode === 'one') {
      var list = c.box === 'cash' ? D.cashAccounts : D.banks;
      html = '<div class="pd-morph-card ' + c.box + '"><div class="pd-morph-h"><span class="icon-tile ' + (c.box === 'cash' ? 'lime' : 'blue') + '"><i data-lucide="' + (c.box === 'cash' ? 'banknote' : 'landmark') + '"></i></span><div><b>' + (c.box === 'cash' ? 'Cash account' : 'Bank account') + '</b><small>' + (c.side === 'dr' ? 'Money goes out of this account' : 'Money comes into this account') + '</small></div><span class="pd-balpill" id="pd-vn-boxbal"></span></div>' +
        '<div class="pd-fgrid ' + (c.box === 'bank' ? 'c4' : 'c2') + '">' +
        '<label class="pd-f"><span>' + (c.box === 'cash' ? 'Cash account' : 'Bank account') + ' <em>*</em></span><select id="pd-vn-box">' + list.map(function (a) { return '<option value="' + a.code + '">' + esc(a.name) + ' · ' + a.code + '</option>'; }).join('') + '</select></label>' +
        (c.box === 'bank' ? '<label class="pd-f"><span>Instrument type</span><select id="pd-vn-inst">' + (c.side === 'dr' ? '<option>Cheque</option><option>Online transfer (IBFT)</option><option>Pay order</option><option>RTGS</option>' : '<option>Cheque deposit</option><option>Online transfer (IBFT)</option><option>Cash deposit</option>') + '</select></label>' +
          '<label class="pd-f"><span>Cheque / Ref No.</span><input id="pd-vn-chq" placeholder="e.g. 00458921"></label><label class="pd-f"><span>Cheque Date</span><input type="date" value="2026-10-01"></label>' : '') +
        '<label class="pd-f' + (c.box === 'bank' ? ' span-2' : '') + '"><span>' + c.party + '</span><div class="pd-inp-ic"><i data-lucide="user-round"></i><input id="pd-vn-party" placeholder="' + (c.side === 'dr' ? 'Who is being paid?' : 'Who paid us?') + '"></div></label>' +
        (c.box === 'bank' ? '<div class="pd-f span-2 pd-inst-note"><span>&nbsp;</span><small><i data-lucide="info"></i> ' + (c.side === 'dr' ? 'WHT u/s 153 on services/goods should be posted as a separate line.' : 'Receipts clear into the bank on the value date shown on the statement.') + '</small></div>' : '') +
        '</div></div>';
    } else if (VN.t === 'JV') {
      html = '<div class="pd-morph-card jv"><div class="pd-morph-h"><span class="icon-tile violet"><i data-lucide="notebook-pen"></i></span><div><b>Free-form journal</b><small>Debit and credit any account in any combination.</small></div></div><div class="row"><label class="switch"><input type="checkbox"><i></i><span>Auto-reverse on 01 Nov 2026</span></label><label class="switch"><input type="checkbox"><i></i><span>Recurring monthly</span></label></div></div>';
    } else if (VN.t === 'CV') {
      html = '<div class="pd-morph-card"><div class="pd-morph-h"><span class="icon-tile blue"><i data-lucide="arrow-left-right"></i></span><div><b>Contra entry</b><small>Only cash and bank accounts are available on the lines.</small></div></div></div>';
    } else {
      html = '<div class="pd-morph-card"><div class="pd-morph-h"><span class="icon-tile orange"><i data-lucide="flag"></i></span><div><b>Opening balances · FY 2026-27</b><small>Posted as at 01 Jul 2026. Differences go to Opening Balance Equity.</small></div></div></div>';
    }
    inn.innerHTML = html; icons(inn);
    var box = $('#pd-vn-box', sec);
    if (box) {
      var upd = function () {
        var list = c.box === 'cash' ? D.cashAccounts : D.banks, a = list.filter(function (x) { return x.code === box.value; })[0];
        $('#pd-vn-boxbal', sec).innerHTML = a ? 'Balance <b>' + money(a.balance, 0) + '</b>' : '';
        vnContra(sec); vnTotals(sec);
      };
      box.addEventListener('change', upd); upd();
    }
    if (anim && !RM()) {
      var h1 = inn.offsetHeight;
      wrap.style.height = h0 + 'px'; void wrap.offsetHeight; wrap.style.height = h1 + 'px';
      restart(inn, 'pd-swap-in');
      setTimeout(function () { wrap.style.height = ''; }, 380);
    }
  }
  function vnSetType(sec, t, anim) {
    if (!VT[t]) return;
    var prev = VN.t, pc = VT[prev], c = VT[t];
    VN.t = t;
    // convert lines
    if (!VN.dirty) VN.lines = SAMPLE[t].map(vnLine);
    else if (pc.mode === 'dual' && c.mode === 'one') {
      VN.lines = VN.lines.filter(function (l) { var a = ACCMAP[l.acc]; return !a || (a.k !== 'cash' && a.k !== 'bank'); }).map(function (l) { var v = num(l.dr) || num(l.cr); return Object.assign(l, { dr: c.side === 'dr' ? v : 0, cr: c.side === 'cr' ? v : 0 }); });
    } else if (pc.mode === 'one' && c.mode === 'dual') {
      var tot = 0, box = vnBoxAcc(sec);
      VN.lines.forEach(function (l) { var v = num(l.dr || l.cr); tot += v; l.dr = pc.side === 'dr' ? v : 0; l.cr = pc.side === 'cr' ? v : 0; });
      if (box && tot) VN.lines.push(vnLine([box, 'Balancing ' + pc.box + ' leg', pc.side === 'cr' ? tot : 0, pc.side === 'dr' ? tot : 0, 'Main Branch']));
    } else if (pc.mode === 'one' && c.mode === 'one' && pc.side !== c.side) {
      VN.lines.forEach(function (l) { var v = num(l.dr || l.cr); l.dr = c.side === 'dr' ? v : 0; l.cr = c.side === 'cr' ? v : 0; });
    }
    $$('#pd-vn-tiles [data-vt]', sec).forEach(function (b) { b.classList.toggle('on', b.dataset.vt === t || (b.dataset.vt === 'MORE' && (t === 'CV' || t === 'OB'))); });
    $('#pd-vn-more-s', sec).textContent = t === 'CV' ? 'Contra' : t === 'OB' ? 'Opening' : 'Contra, Opening';
    $('#pd-vn-type', sec).value = t;
    var no = $('#pd-vn-no', sec); no.textContent = vnNo(); if (anim) restart(no.parentElement, 'pd-flipno');
    $('#pd-vn-sub', sec).textContent = c.sub; $('#pd-vn-esub', sec).textContent = c.esub;
    sec.dataset.mode = c.mode;
    vnMorph(sec, anim); vnRender(sec, anim);
  }
  function vnReset(sec) {
    VN.dirty = false; VN.lines = SAMPLE[VN.t].map(vnLine);
    $('#pd-vn-narr', sec).value = ''; $('#pd-vn-narrc', sec).textContent = '0'; $('#pd-vn-ref', sec).value = '';
    $('#pd-vn-files', sec).innerHTML = '';
    var no = $('#pd-vn-no', sec); no.textContent = vnNo(); restart(no.parentElement, 'pd-flipno');
    vnMorph(sec, false); vnRender(sec, true);
  }
  function vnPost(sec, btn, then) {
    if (!VN.ok) return;
    var narr = $('#pd-vn-narr', sec);
    if (!narr.value.trim()) { var f = narr.closest('.pd-f'); f.classList.add('pd-invalid'); shake(f); narr.focus(); toast('Add a narration before posting', { tone: 'danger' }); return; }
    var main = $('#pd-vn-post', sec);
    busy(main, 'Posting…', 1000).then(function () {
      var no = vnNo(), tot = $('#pd-vn-tdr', sec).textContent;
      VT[VN.t].seq++;
      celebrate(main);
      var tpl = $('#pd-vn-tplsw', sec).checked;
      toast(no + ' posted · ' + tot + (tpl ? ' · saved as template' : ''), { tone: 'good', action: { label: 'Open register', fn: function () { FS.go('app/accounting/vouchers'); } } });
      if (then === 'print') setTimeout(function () { toast('Print preview ready · ' + no, { tone: 'info' }); }, 400);
      vnReset(sec);
    });
  }
  function vnMount(sec) {
    $('#pd-vn-branch', sec).innerHTML = (D.branches.length ? D.branches : ['Lahore HQ']).map(function (b) { return '<option>' + esc(b) + '</option>'; }).join('');
    VN.lines = SAMPLE.JV.map(vnLine);
    vnSetType(sec, 'JV', false);
    $('#pd-vn-tiles', sec).addEventListener('click', function (e) {
      var b = e.target.closest('[data-vt]'); if (!b) return;
      if (b.dataset.vt === 'MORE') {
        FS.menu(b, [{ label: 'Contra Voucher', icon: 'arrow-left-right', onClick: function () { vnSetType(sec, 'CV', true); } }, { label: 'Opening Balance', icon: 'flag', onClick: function () { vnSetType(sec, 'OB', true); } }]);
        return;
      }
      if (b.dataset.vt !== VN.t) vnSetType(sec, b.dataset.vt, true);
    });
    $('#pd-vn-type', sec).addEventListener('change', function () { vnSetType(sec, this.value, true); });
    $('#pd-vn-gear', sec).addEventListener('click', function () { FS.menu(this, [{ label: 'Prefix · ' + VN.t + '-YYYY-######', icon: 'hash' }, { label: 'Numbering settings', icon: 'settings', onClick: function () { FS.go('app/settings'); } }]); });
    $('#pd-vn-narr', sec).addEventListener('input', function () { $('#pd-vn-narrc', sec).textContent = this.value.length; this.closest('.pd-f').classList.remove('pd-invalid'); });

    var b = $('#pd-vn-body', sec);
    b.addEventListener('input', function (e) {
      var tr = e.target.closest('tr'), k = e.target.dataset.k; if (!tr || !k) return;
      var l = vnLineById(tr.dataset.id); VN.dirty = true;
      if (k === 'desc') { l.desc = e.target.value; return; }
      if (k === 'dr' || k === 'cr') {
        l[k] = num(e.target.value);
        var o = k === 'dr' ? 'cr' : 'dr';
        if (l[k] && l[o]) { l[o] = 0; var oi = tr.querySelector('[data-k="' + o + '"]'); oi.value = ''; restart(oi, 'pd-cellflash'); }
      }
      if (k === 'amt') { var c = VT[VN.t]; l.dr = c.side === 'dr' ? num(e.target.value) : 0; l.cr = c.side === 'cr' ? num(e.target.value) : 0; }
      vnTotals(sec);
    });
    b.addEventListener('change', function (e) {
      var tr = e.target.closest('tr'), k = e.target.dataset.k; if (!tr || !k) return;
      var l = vnLineById(tr.dataset.id); VN.dirty = true;
      if (k === 'acc') { l.acc = e.target.value; var code = tr.querySelector('.pd-code input'); code.value = l.acc; restart(code, 'pd-cellflash'); vnTotals(sec); }
      if (k === 'cc') l.cc = e.target.value;
    });
    b.addEventListener('click', function (e) {
      var tr = e.target.closest('tr'); if (!tr || !tr.dataset.id) return; var l = vnLineById(tr.dataset.id), at = VN.lines.indexOf(l);
      if (e.target.closest('[data-dup]')) { VN.dirty = true; var c = vnLine([l.acc, l.desc, l.dr, l.cr, l.cc]); VN.lines.splice(at + 1, 0, c); vnRender(sec); flash($('#pd-vn-body tr[data-id="' + c.id + '"]', sec)); }
      if (e.target.closest('[data-del]')) { VN.dirty = true; rowOut(tr, function () { VN.lines.splice(at, 1); vnRender(sec); toast('Line removed', { undo: function () { VN.lines.splice(at, 0, l); vnRender(sec); } }); }); }
    });
    /* drag & drop */
    var drag = null;
    b.addEventListener('mousedown', function (e) { var g = e.target.closest('.pd-grip'); if (g) g.closest('tr').draggable = true; });
    b.addEventListener('dragstart', function (e) {
      var tr = e.target.closest && e.target.closest('tr[data-id]'); if (!tr || !tr.draggable) { e.preventDefault(); return; }
      drag = tr; tr.classList.add('pd-dragging');
      try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', tr.dataset.id); } catch (err) { /* ok */ }
    });
    b.addEventListener('dragover', function (e) {
      if (!drag) return; e.preventDefault();
      var over = e.target.closest('tr[data-id]'); if (!over || over === drag) return;
      var r = over.getBoundingClientRect(), after = e.clientY > r.top + r.height / 2;
      b.insertBefore(drag, after ? over.nextSibling : over);
    });
    var endDrag = function () {
      if (!drag) return; drag.classList.remove('pd-dragging'); drag.draggable = false;
      var order = $$('tr[data-id]', b).map(function (tr) { return tr.dataset.id; });
      VN.lines.sort(function (x, y) { return order.indexOf(x.id) - order.indexOf(y.id); });
      $$('tr[data-id] .pd-idx', b).forEach(function (td, i) { td.textContent = i + 1; });
      flash(drag); drag = null; VN.dirty = true;
    };
    b.addEventListener('drop', function (e) { e.preventDefault(); endDrag(); });
    b.addEventListener('dragend', endDrag);

    var addOne = function () { VN.dirty = true; var l = vnLine(); VN.lines.push(l); vnRender(sec); var tr = $('#pd-vn-body tr[data-id="' + l.id + '"]', sec); flash(tr); tr.querySelector('select').focus(); };
    $('#pd-vn-add', sec).addEventListener('click', addOne); $('#pd-vn-add2', sec).addEventListener('click', addOne);
    $('#pd-vn-addm', sec).addEventListener('click', function () {
      VN.dirty = true; var n = [vnLine(), vnLine(), vnLine()]; VN.lines = VN.lines.concat(n); vnRender(sec);
      n.forEach(function (l, i) { var tr = $('#pd-vn-body tr[data-id="' + l.id + '"]', sec); tr.style.setProperty('--i', i); tr.classList.add('pd-in', 'row-flash'); });
      toast('3 blank lines added', { tone: 'info' });
    });
    $('#pd-vn-tpl', sec).addEventListener('click', function () {
      var btn = this;
      FS.menu(btn, Object.keys(TPL).map(function (k) {
        return { label: TPL[k].label, icon: 'layout-template', onClick: function () {
          var tp = TPL[k], c = VT[VN.t];
          if (c.mode === 'one') vnSetType(sec, 'JV', true);
          VN.dirty = true; VN.lines = [];
          vnRender(sec);
          $('#pd-vn-narr', sec).value = tp.narr; $('#pd-vn-narrc', sec).textContent = tp.narr.length;
          tp.lines.forEach(function (a, i) {
            setTimeout(function () {
              var l = vnLine(a); VN.lines.push(l); vnRender(sec);
              var tr = $('#pd-vn-body tr[data-id="' + l.id + '"]', sec); if (tr) { tr.classList.add('pd-in'); flash(tr); }
            }, RM() ? 0 : 140 * (i + 1));
          });
          setTimeout(function () { toast('Template applied · ' + tp.label, { tone: 'good' }); }, RM() ? 0 : 140 * (tp.lines.length + 1));
        } };
      }));
    });
    /* attachments */
    var drop = $('#pd-vn-drop', sec), list = $('#pd-vn-files', sec);
    var addFiles = function (files) {
      Array.prototype.slice.call(files).forEach(function (f) {
        var li = document.createElement('li');
        li.innerHTML = '<span class="icon-well"><i data-lucide="file-text"></i></span><div><b>' + esc(f.name) + '</b><small>' + (f.size > 1048576 ? (f.size / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(f.size / 1024)) + ' KB') + ' · uploaded</small></div><button type="button" class="pd-icb" aria-label="Remove"><i data-lucide="x"></i></button>';
        li.querySelector('button').addEventListener('click', function () { li.classList.add('pd-out'); setTimeout(function () { li.remove(); }, 250); });
        list.appendChild(li); icons(li);
      });
    };
    ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
    drop.addEventListener('drop', function (e) { if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files); });
    $('#pd-vn-file', sec).addEventListener('change', function () { addFiles(this.files); this.value = ''; });
    /* tags */
    var tags = $('#pd-vn-tags', sec), tin = $('#pd-vn-tagin', sec);
    var addTag = function (t) { t = t.trim(); if (!t) return; var s = document.createElement('span'); s.className = 'pd-tag'; s.innerHTML = esc(t) + '<button type="button" aria-label="Remove tag">×</button>'; s.querySelector('button').addEventListener('click', function () { s.remove(); }); tags.insertBefore(s, tin); };
    ['month-end', 'lahore-hq'].forEach(addTag);
    tin.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tin.value); tin.value = ''; }
      if (e.key === 'Backspace' && !tin.value) { var l = tin.previousElementSibling; if (l) l.remove(); }
    });
    tags.addEventListener('click', function (e) { if (e.target === tags) tin.focus(); });
    /* actions */
    $('#pd-vn-tplsw', sec).addEventListener('change', function () { if (this.checked) toast('This voucher will also be saved as a reusable template', { tone: 'info' }); });
    $('#pd-vn-draft', sec).addEventListener('click', function () { var bt = this; busy(bt, null, 700).then(function () { toast('Draft saved · ' + vnNo(), { tone: 'good' }); }); });
    $('#pd-vn-post', sec).addEventListener('click', function () { vnPost(sec, this); });
    $('#pd-vn-postmenu', sec).addEventListener('click', function () {
      FS.menu(this, [
        { label: 'Save & New', icon: 'file-plus', onClick: function () { vnPost(sec, null, 'new'); } },
        { label: 'Save & Print', icon: 'printer', onClick: function () { vnPost(sec, null, 'print'); } }
      ]);
    });
    document.addEventListener('keydown', function (e) {
      if (!sec.classList.contains('active')) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && VN.ok) { e.preventDefault(); vnPost(sec, null); }
    });
  }
  FS.onEnter('app/accounting/vouchers/new', function (sec, route, first) { if (first) { vnMount(sec); icons(sec); } });
})();
