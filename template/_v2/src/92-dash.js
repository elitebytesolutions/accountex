/* 92-dash.js (Agent D) — Fundcy dashboards + Whole Stock engine.
   Loads before 95-ui.js, so everything is wired on DOMContentLoaded. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var FS = function () { return window.FS || {}; };
  var RM = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var grp = function (n, d) { return Number(n).toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); };
  var money = function (n) { return 'Rs ' + grp(Math.round(n)) + '<span class="dec">.00</span>'; };
  var icons = function (root) { if (FS().icons) FS().icons(root); else if (window.lucide) window.lucide.createIcons(); };
  var toast = function (m, o) { if (FS().toast) FS().toast(m, o || {}); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  /* ================================================================ data */
  var M = 1e6, K = 1e3;
  var FLOWS = {
    money: {
      A: 'Income', B: 'Expense',
      labels: ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
      long: ['Jul 2025', 'Aug 2025', 'Sep 2025', 'Oct 2025', 'Nov 2025', 'Dec 2025', 'Jan 2026', 'Feb 2026', 'Mar 2026', 'Apr 2026', 'May 2026', 'Jun 2026'],
      a: [14.2, 15.1, 13.8, 16.4, 15.0, 18.9, 14.6, 15.8, 17.2, 16.1, 17.9, 19.4].map(function (v) { return v * M; }),
      b: [9.1, 10.4, 8.7, 11.2, 9.6, 12.8, 9.9, 10.3, 11.7, 10.8, 12.1, 13.0].map(function (v) { return v * M; })
    },
    mrr: {
      A: 'New MRR', B: 'Expansion',
      labels: ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'],
      long: ['Oct 2025', 'Nov 2025', 'Dec 2025', 'Jan 2026', 'Feb 2026', 'Mar 2026', 'Apr 2026', 'May 2026', 'Jun 2026', 'Jul 2026', 'Aug 2026', 'Sep 2026'],
      a: [112, 98, 86, 120, 104, 132, 118, 126, 140, 210, 168, 186].map(function (v) { return v * K; }),
      b: [38, 44, 30, 52, 46, 58, 50, 61, 66, 72, 70, 79].map(function (v) { return v * K; })
    },
    payroll: {
      A: 'Salaries', B: 'Allowances',
      labels: ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'],
      long: ['Oct 2025', 'Nov 2025', 'Dec 2025', 'Jan 2026', 'Feb 2026', 'Mar 2026', 'Apr 2026', 'May 2026', 'Jun 2026', 'Jul 2026', 'Aug 2026', 'Sep 2026'],
      a: [13.1, 13.2, 13.3, 13.4, 13.5, 13.8, 13.9, 14.6, 14.8, 15.1, 15.3, 15.5].map(function (v) { return v * M; }),
      b: [4.8, 4.9, 8.2, 4.9, 5.0, 5.1, 5.2, 5.7, 7.09, 5.82, 5.88, 5.95].map(function (v) { return v * M; })
    }
  };

  /* ============================================================ helpers */
  function replay(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }
  function grow(sec) {
    sec.classList.remove('fd-grown');
    void sec.offsetWidth;
    if (RM) { sec.classList.add('fd-grown'); return; }
    setTimeout(function () { sec.classList.add('fd-grown'); }, 60);
  }

  /* ---------------------------------------------------------- heat grid */
  function renderHeat(el) {
    var vals = el.getAttribute('data-fd-heat').split(',').map(Number);
    var max = Math.max.apply(null, vals), html = '', d = 0;
    if (max > 6) { vals = vals.map(function (v) { return Math.max(1, Math.round(v / max * 6)); }); max = 6; }
    vals.forEach(function (n, ci) {
      var r = n / max, base = r > 0.85 ? 4 : r > 0.65 ? 3 : r > 0.45 ? 2 : 1;
      html += '<span class="hc">';
      for (var j = 0; j < n; j++) {
        var lv = base;
        if (j === n - 1) lv = Math.max(0, base - 2);
        else if (j === n - 2) lv = Math.max(1, base - 1);
        else if (j === 0 && base === 4) lv = 3;
        html += '<i class="l' + lv + '" style="--d:' + (d += 14) + '"></i>';
      }
      html += '</span>';
    });
    el.innerHTML = html;
  }

  /* ---------------------------------------------------------- tick gauge */
  function renderGauge(el) {
    var pct = +el.getAttribute('data-fd-gauge'), n = +(el.getAttribute('data-ticks') || 30);
    var max = el.getAttribute('data-max'), unit = el.getAttribute('data-unit');
    var on = Math.round(n * pct / 100), t = '';
    for (var i = 0; i < n; i++) t += '<i' + (i < on ? ' class="on"' : '') + ' style="--i:' + i + '"></i>';
    var s = max ? [0, +max / 2, +max] : [0, 50, 100];
    unit = unit == null ? '' : unit;
    el.innerHTML = '<div class="fd-gauge-scale"><span>' + s[0] + unit + '</span><span>' + s[1] + unit + '</span><span>' + s[2] + unit + '</span></div><div class="fd-ticks" role="meter" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100">' + t + '</div>';
  }

  /* ---------------------------------------------------------- calendar */
  function renderCal(el) {
    var names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], h = '';
    names.forEach(function (n) { h += '<span class="dn">' + n + '</span>'; });
    h += '<i class="e"></i>'; // 1 Sep 2026 is a Tuesday
    var late = { 8: 1, 17: 1 }, leave = { 24: 1 };
    for (var d = 1; d <= 30; d++) {
      var dow = (d) % 7; // 0 = Monday when offset 1
      var wk = dow === 5 || dow === 6;
      var c = wk ? 'c-w' : late[d] ? 'c-l' : leave[d] ? 'c-v' : 'c-p';
      var tip = (wk ? 'Weekend' : late[d] ? 'Late · in 09:22 AM' : leave[d] ? 'Casual leave' : 'Present · in 08:5' + (d % 10) + ' AM');
      h += '<i class="' + c + '" style="--d:' + d * 18 + '" title="' + d + ' Sep · ' + tip + '">' + d + '</i>';
    }
    el.innerHTML = h;
  }

  /* ---------------------------------------------------------- money flow */
  function flowData(key, mode) {
    var f = FLOWS[key];
    if (mode !== 'q') return { labels: f.labels, long: f.long, a: f.a, b: f.b, A: f.A, B: f.B };
    var o = { labels: [], long: [], a: [], b: [], A: f.A, B: f.B };
    for (var q = 0; q < 4; q++) {
      var sa = 0, sb = 0;
      for (var m = 0; m < 3; m++) { sa += f.a[q * 3 + m]; sb += f.b[q * 3 + m]; }
      o.labels.push('Q' + (q + 1)); o.long.push('Q' + (q + 1) + ' · ' + f.long[q * 3].split(' ')[0] + '–' + f.long[q * 3 + 2]);
      o.a.push(sa); o.b.push(sb);
    }
    return o;
  }

  function renderFlow(el, mode) {
    var key = el.getAttribute('data-fd-flow'), stack = el.getAttribute('data-mode') === 'stack';
    var d = flowData(key, mode), n = d.a.length;
    var tops = d.a.map(function (v, i) { return stack ? v + d.b[i] : Math.max(v, d.b[i]); });
    var scale = Math.max.apply(null, tops) * 1.12;
    el.classList.toggle('fd-m-stack', stack); el.classList.toggle('fd-m-over', !stack);
    var h = '<div class="fd-plot' + (mode === 'q' ? ' q' : '') + '"><div class="fd-guide"></div>';
    for (var i = 0; i < n; i++) {
      var ha = d.a[i] / scale * 100, hb = d.b[i] / scale * 100;
      var t = Math.min(100, tops[i] / scale * 100 + 9 + ((i * 37) % 7) * 2.6);
      h += '<div class="fd-col" data-i="' + i + '" tabindex="0" aria-label="' + esc(d.long[i]) + ': ' + d.A + ' Rs ' + grp(d.a[i]) + ', ' + d.B + ' Rs ' + grp(d.b[i]) + '">' +
        '<div class="fd-bararea"><div class="fd-track" style="--t:' + t.toFixed(1) + '%"></div>' +
        '<i class="fd-seg a" style="--h:' + ha.toFixed(2) + '%;--i:' + i + '"></i>' +
        '<i class="fd-seg b" style="--h:' + hb.toFixed(2) + '%;--o:' + (stack ? ha.toFixed(2) : 0) + '%;--i:' + i + '"></i></div>' +
        '<span class="m">' + d.labels[i] + '</span></div>';
    }
    h += '</div><div class="fd-dot"></div><div class="fd-tipx"></div>';
    el.innerHTML = h;
    el._d = d; el._stack = stack; el._scale = scale;
    var hot = mode === 'q' ? n - 1 : Math.min(n - 1, +(el.getAttribute('data-hot') || n - 1));
    el._hot = hot;
    var plot = $('.fd-plot', el);
    $$('.fd-col', el).forEach(function (c) {
      c.addEventListener('mouseenter', function () { tipAt(el, +c.dataset.i); });
      c.addEventListener('focus', function () { tipAt(el, +c.dataset.i); });
    });
    plot.addEventListener('mouseleave', function () { tipAt(el, el._hot); });
    requestAnimationFrame(function () { tipAt(el, hot); });
  }

  function tipAt(el, i) {
    var d = el._d; if (!d) return;
    var col = $$('.fd-col', el)[i]; if (!col) return;
    $$('.fd-col', el).forEach(function (c) { c.classList.toggle('hot', c === col); });
    var area = $('.fd-bararea', col);
    var er = el.getBoundingClientRect(), ar = area.getBoundingClientRect();
    var top = el._stack ? d.a[i] + d.b[i] : d.a[i];
    var y = ar.bottom - er.top - ar.height * (top / el._scale);
    var x = ar.left - er.left + ar.width / 2;
    var tip = $('.fd-tipx', el), dot = $('.fd-dot', el), guide = $('.fd-guide', el);
    tip.innerHTML = '<span class="k"><i></i>' + (el._stack ? 'Total · ' + d.long[i] : d.A + ' · ' + d.long[i]) + '</span><b>' + money(top) + '</b>' +
      '<small><i></i>' + (el._stack ? d.A + ' ' + money(d.a[i]).replace(/<[^>]+>\.00<\/span>/, '') + ' · ' + d.B + ' ' + money(d.b[i]).replace(/<[^>]+>\.00<\/span>/, '') : d.B + ' ' + money(d.b[i]).replace(/<[^>]+>\.00<\/span>/, '')) + '</small>';
    var half = tip.offsetWidth / 2 + 4;
    tip.style.left = Math.max(half, Math.min(er.width - half, x)) + 'px';
    var flip = y < tip.offsetHeight + 20;
    tip.classList.toggle('side', flip);
    if (flip) { var right = x + 18 + tip.offsetWidth < er.width; tip.classList.toggle('left', !right); tip.style.left = x + 'px'; }
    else tip.classList.remove('left');
    tip.style.top = y + 'px';
    dot.style.left = x + 'px'; dot.style.top = y + 'px';
    guide.style.top = (y - $('.fd-plot', el).offsetTop) + 'px';
  }

  function mountFlows(sec) {
    $$('.fd-flow', sec).forEach(function (el) {
      var card = el.closest('.fd-card'), sel = card && $('[data-fd-mode]', card);
      renderFlow(el, sel ? sel.value : 'm');
      if (sel && !sel._fd) {
        sel._fd = 1;
        sel.addEventListener('change', function () {
          if (RM) { renderFlow(el, sel.value); return; }
          el.classList.add('out');
          setTimeout(function () {
            renderFlow(el, sel.value);
            void el.offsetWidth;
            requestAnimationFrame(function () { el.classList.remove('out'); });
          }, 280);
        });
      }
    });
  }

  /* ------------------------------------------------------- dashboards */
  var mounted = {}, lastRun = {};
  function enterDash(sec, route) {
    var now = Date.now();
    if (lastRun[route] && now - lastRun[route] < 400) return;
    lastRun[route] = now;
    if (!mounted[route]) {
      mounted[route] = 1;
      $$('[data-fd-heat]', sec).forEach(renderHeat);
      $$('[data-fd-gauge]', sec).forEach(renderGauge);
      $$('[data-fd-cal]', sec).forEach(renderCal);
      mountFlows(sec);
      if (route === 'ess/dashboard') mountPunch(sec);
      icons(sec);
      window.addEventListener('resize', function () {
        if (!sec.classList.contains('active')) return;
        $$('.fd-flow', sec).forEach(function (el) { tipAt(el, el._hot); });
      });
      document.addEventListener('fs:theme', function () { $$('.fd-flow', sec).forEach(function (el) { tipAt(el, el._hot); }); });
    } else {
      $$('.fd-flow', sec).forEach(function (el) { requestAnimationFrame(function () { tipAt(el, el._hot); }); });
    }
    if (!RM) replay(sec, 'fd-play');
    grow(sec);
  }

  /* ------------------------------------------------------- ESS punch */
  function mountPunch(sec) {
    var card = $('[data-fd-punch]', sec); if (!card) return;
    var btn = $('[data-punch]', card), clk = $('[data-clock]', card), ap = $('[data-clock-ampm]', card);
    var st = { inAt: null, outAt: null };
    var two = function (n) { return (n < 10 ? '0' : '') + n; };
    var fmt = function (t, sec2) { var h = t.getHours(), m = t.getMinutes(), s = t.getSeconds(), a = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return two(h) + ':' + two(m) + (sec2 ? ':' + two(s) : '') + ' ' + a; };
    function worked() {
      if (!st.inAt) return '0h 00m';
      var ms = (st.outAt || new Date()) - st.inAt, mins = Math.floor(ms / 60000), s = Math.floor(ms / 1000) % 60;
      return Math.floor(mins / 60) + 'h ' + two(mins % 60) + 'm' + (st.outAt ? '' : ' ' + two(s) + 's');
    }
    function tick() {
      var t = new Date(), h = t.getHours();
      clk.textContent = two(h % 12 || 12) + ':' + two(t.getMinutes()) + ':' + two(t.getSeconds());
      ap.textContent = h >= 12 ? 'PM' : 'AM';
      if (st.inAt && !st.outAt) $('[data-punch-worked]', card).textContent = worked();
    }
    tick(); setInterval(tick, 1000);
    function flash(el, v) { el.textContent = v; el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
    btn.addEventListener('click', function () {
      var r = document.createElement('span'); r.className = 'fd-ripple'; btn.appendChild(r);
      setTimeout(function () { r.remove(); }, 750);
      var now = new Date(), state = $('[data-punch-state]', card);
      if (!st.inAt || st.outAt) {
        st.inAt = now; st.outAt = null;
        btn.classList.add('out');
        $('[data-punch-label]', card).textContent = 'Check Out';
        $('[data-punch-sub]', card).textContent = 'Tap when you leave';
        flash($('[data-punch-in]', card), fmt(now));
        $('[data-punch-out]', card).textContent = '—';
        state.textContent = 'Checked in'; state.className = 'fd-status ok';
        toast('Checked in at ' + fmt(now, true) + ' — Lahore HQ', { tone: 'good' });
      } else {
        st.outAt = now;
        btn.classList.remove('out');
        $('[data-punch-label]', card).textContent = 'Check In';
        $('[data-punch-sub]', card).textContent = 'Tap to punch again';
        flash($('[data-punch-out]', card), fmt(now));
        flash($('[data-punch-worked]', card), worked());
        state.textContent = 'Checked out'; state.className = 'fd-status info';
        toast('Checked out at ' + fmt(now, true) + ' · worked ' + worked(), { tone: 'info' });
      }
    });
  }

  /* ================================================================
     WHOLE STOCK
     ================================================================ */
  var P = [
    { n: 'Corrugated Carton 18×12×12', d: '5-ply export shipping box', sku: 'CTN-1812', upc: '8964001234512', co: 'Packages Ltd', cls: 'Packaging', sub: 'Cartons', wh: 'Lahore HQ', loc: 'Rack A-02', cur: 2450, res: 120, cost: 85, st: 'In Stock', last: '2026-09-30', batch: 'B-2609-11', exp: '—', reo: 800, by: 'Usman Ali', ic: 'package', c: 0 },
    { n: 'Stretch Film 500mm × 23µ', d: 'Pallet wrap roll, 300 m', sku: 'STF-500', upc: '8964001234529', co: 'Habib Packaging', cls: 'Packaging', sub: 'Films', wh: 'Karachi', loc: 'Bay C-14', cur: 320, res: 20, cost: 2450, st: 'In Stock', last: '2026-09-29', batch: 'B-2609-04', exp: '—', reo: 120, by: 'Usman Ali', ic: 'layers', c: 1 },
    { n: 'BOPP Tape 48mm Clear', d: '48 mm × 100 yards', sku: 'TAP-048', upc: '8964001234536', co: 'Habib Packaging', cls: 'Packaging', sub: 'Tapes', wh: 'Lahore HQ', loc: 'Rack A-05', cur: 0, res: 0, cost: 165, st: 'Out of Stock', last: '2026-09-24', batch: 'B-2608-19', exp: '—', reo: 600, by: 'Usman Ali', ic: 'circle-x', c: 5 },
    { n: 'Toner Cartridge 85A', d: 'Laser printer toner, black', sku: 'TNR-85A', upc: '8964001234543', co: 'Daraz Business', cls: 'Office Supplies', sub: 'Printing', wh: 'Islamabad', loc: 'Store 2', cur: 18, res: 6, cost: 14500, st: 'Low Stock', last: '2026-09-30', batch: 'B-2609-21', exp: '—', reo: 25, by: 'Hira Ali', ic: 'printer', c: 2 },
    { n: 'A4 Copy Paper 80gsm', d: 'Ream of 500 sheets', sku: 'PPR-A4-80', upc: '8964001234550', co: 'Packages Ltd', cls: 'Office Supplies', sub: 'Paper', wh: 'Lahore HQ', loc: 'Rack B-01', cur: 1200, res: 100, cost: 1350, st: 'In Stock', last: '2026-09-28', batch: 'B-2609-08', exp: '—', reo: 400, by: 'Hira Ali', ic: 'file-text', c: 1 },
    { n: 'Nitrile Gloves (Box of 100)', d: 'Powder-free, size M', sku: 'GLV-NIT-M', upc: '8964001234567', co: 'SafeHands Pvt', cls: 'Safety', sub: 'PPE', wh: 'Faisalabad', loc: 'Zone F-3', cur: 5600, res: 800, cost: 1250, st: 'Overstock', last: '2026-09-27', batch: 'B-2609-02', exp: 'Mar 2028', reo: 900, by: 'Usman Ali', ic: 'sparkles', c: 3 },
    { n: 'LED Panel Light 2×2 40W', d: 'Cool daylight, 6500K', sku: 'LED-2240', upc: '8964001234574', co: 'Siemens Pakistan', cls: 'Electrical', sub: 'Lighting', wh: 'Karachi', loc: 'Bay E-02', cur: 430, res: 30, cost: 4850, st: 'In Stock', last: '2026-09-26', batch: 'B-2609-15', exp: '—', reo: 150, by: 'Umar Farooq', ic: 'zap', c: 4 },
    { n: 'Detergent Powder 2kg', d: 'Industrial laundry', sku: 'DTG-2KG', upc: '8964001234581', co: 'Unity Home Care', cls: 'Cleaning', sub: 'Laundry', wh: 'Lahore HQ', loc: 'Rack D-07', cur: 850, res: 50, cost: 690, st: 'In Stock', last: '2026-09-25', batch: 'B-2609-01', exp: 'Aug 2028', reo: 300, by: 'Hira Ali', ic: 'boxes', c: 0 },
    { n: 'Biryani Masala 50g', d: 'Spice mix · carton of 144', sku: 'SPC-BRY-50', upc: '8964001234598', co: 'Shan Foods', cls: 'Food', sub: 'Spices', wh: 'Karachi', loc: 'Dry C-01', cur: 12500, res: 1200, cost: 120, st: 'Overstock', last: '2026-09-30', batch: 'B-2609-24', exp: 'Jun 2027', reo: 3000, by: 'Umar Farooq', ic: 'sparkles', c: 2 },
    { n: 'Red Chilli Powder 1kg', d: 'Ground, food grade', sku: 'SPC-RCP-1K', upc: '8964001234604', co: 'National Foods', cls: 'Food', sub: 'Spices', wh: 'Faisalabad', loc: 'Zone F-1', cur: 37, res: 12, cost: 980, st: 'Low Stock', last: '2026-09-22', batch: 'B-2608-30', exp: 'Feb 2027', reo: 120, by: 'Umar Farooq', ic: 'triangle-alert', c: 5 },
    { n: 'PP Packing Strap 12mm', d: 'Roll, 10 kg', sku: 'STR-PP-12', upc: '8964001234611', co: 'Habib Packaging', cls: 'Packaging', sub: 'Strapping', wh: 'Faisalabad', loc: 'Zone F-6', cur: 640, res: 40, cost: 6200, st: 'In Stock', last: '2026-09-21', batch: 'B-2609-06', exp: '—', reo: 200, by: 'Usman Ali', ic: 'layers', c: 1 },
    { n: 'Safety Helmet (ANSI)', d: 'HDPE shell, ratchet', sku: 'PPE-HLM-01', upc: '8964001234628', co: 'SafeHands Pvt', cls: 'Safety', sub: 'PPE', wh: 'Islamabad', loc: 'Store 1', cur: 0, res: 0, cost: 1450, st: 'Out of Stock', last: '2026-09-18', batch: 'B-2607-12', exp: '—', reo: 60, by: 'Usman Ali', ic: 'circle-x', c: 5 },
    { n: 'Liquid Hand Wash 5L', d: 'Antibacterial refill', sku: 'HYG-HW-5L', upc: '8964001234635', co: 'Unity Home Care', cls: 'Cleaning', sub: 'Hygiene', wh: 'Islamabad', loc: 'Store 3', cur: 260, res: 20, cost: 2150, st: 'In Stock', last: '2026-09-29', batch: 'B-2609-17', exp: 'Jan 2028', reo: 80, by: 'Hira Ali', ic: 'sparkles', c: 0 },
    { n: 'Extension Board 6-way', d: 'Surge protected, 3 m', sku: 'ELC-EXT-6', upc: '8964001234642', co: 'Brightway Electric', cls: 'Electrical', sub: 'Accessories', wh: 'Lahore HQ', loc: 'Rack E-03', cur: 24, res: 4, cost: 1850, st: 'Low Stock', last: '2026-09-20', batch: 'B-2609-09', exp: '—', reo: 40, by: 'Umar Farooq', ic: 'zap', c: 4 }
  ];
  P.forEach(function (p) { p.avail = p.cur - p.res; p.value = p.cur * p.cost; });

  var COLS = [ // the 18 selectable columns (PNG order)
    ['product', 'Product', 1], ['sku', 'SKU / UPC', 1], ['company', 'Company', 1], ['cls', 'Class', 1], ['sub', 'Sub Class', 1],
    ['wh', 'Warehouse', 0], ['loc', 'Location', 0], ['cur', 'Current Stock', 1], ['res', 'Reserved', 1],
    ['avail', 'Available', 1], ['cost', 'Unit Cost (PKR)', 1], ['value', 'Stock Value (PKR)', 1], ['status', 'Status', 1],
    ['last', 'Last Movement', 1], ['batch', 'Batch', 0], ['expiry', 'Expiry', 0], ['reorder', 'Reorder Level', 0], ['created', 'Created By', 0]
  ];
  // table columns (some merge two selectable columns into one cell, like the PNG)
  var TC = [
    { k: 'product', keys: ['product'], label: 'Product', sort: 'n' },
    { k: 'sku', keys: ['sku'], label: 'SKU / UPC', sort: 'sku' },
    { k: 'company', keys: ['company'], label: 'Company', sort: 'co' },
    { k: 'cls', keys: ['cls', 'sub'], label: 'Class / Sub Class', sort: 'cls' },
    { k: 'wh', keys: ['wh', 'loc'], label: 'Warehouse', sort: 'wh' },
    { k: 'cur', keys: ['cur'], label: 'Current Stock', sort: 'cur', num: 1 },
    { k: 'res', keys: ['res'], label: 'Reserved', sort: 'res', num: 1 },
    { k: 'avail', keys: ['avail'], label: 'Available', sort: 'avail', num: 1 },
    { k: 'reorder', keys: ['reorder'], label: 'Reorder Level', sort: 'reo', num: 1 },
    { k: 'cost', keys: ['cost'], label: 'Unit Cost (PKR)', sort: 'cost', num: 1 },
    { k: 'value', keys: ['value'], label: 'Stock Value (PKR)', sort: 'value', num: 1 },
    { k: 'batch', keys: ['batch'], label: 'Batch', sort: 'batch' },
    { k: 'expiry', keys: ['expiry'], label: 'Expiry', sort: 'exp' },
    { k: 'status', keys: ['status'], label: 'Status', sort: 'st' },
    { k: 'last', keys: ['last'], label: 'Last Movement', sort: 'last' },
    { k: 'created', keys: ['created'], label: 'Created By', sort: 'by' }
  ];
  var TONE = { 'In Stock': 'good', 'Low Stock': 'warn', 'Overstock': 'violet', 'Out of Stock': 'danger' };
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var dmy = function (s) { var p = s.split('-'); return p[2] + ' ' + MON[+p[1] - 1] + ' ' + p[0]; };

  var WS = { cols: {}, sort: { k: 'n', dir: 1 }, chip: '', q: '', f: {}, page: 1, per: 20, sel: {} };
  function resetCols() { COLS.forEach(function (c) { WS.cols[c[0]] = !!c[2]; }); }
  resetCols();

  function cell(tc, p) {
    var C = WS.cols;
    switch (tc.k) {
      case 'product': return '<div class="ws-prod"><span class="ws-thumb c' + p.c + '"><i data-lucide="' + p.ic + '"></i></span><div><b>' + esc(p.n) + '</b><small>' + esc(p.d) + '</small></div></div>';
      case 'sku': return p.sku + '<small>' + p.upc + '</small>';
      case 'company': return esc(p.co);
      case 'cls': return (C.cls ? p.cls : '') + (C.sub ? (C.cls ? '<small>' + p.sub + '</small>' : p.sub) : '');
      case 'wh': return (C.wh ? p.wh : '') + (C.loc ? (C.wh ? '<small>' + p.loc + '</small>' : p.loc) : '');
      case 'cur': return '<b>' + grp(p.cur) + '</b>';
      case 'res': return grp(p.res);
      case 'avail': return grp(p.avail);
      case 'reorder': return grp(p.reo);
      case 'cost': return grp(p.cost, 2);
      case 'value': return grp(p.value, 2);
      case 'batch': return p.batch;
      case 'expiry': return p.exp;
      case 'status': return '<span class="ws-pill ' + TONE[p.st] + '"><i></i>' + p.st + '</span>';
      case 'last': return dmy(p.last);
      case 'created': return p.by;
    }
  }
  function visTC() { return TC.filter(function (t) { return t.keys.some(function (k) { return WS.cols[k]; }); }); }

  function filtered() {
    var q = WS.q.trim().toLowerCase(), f = WS.f;
    var vmin = parseFloat(f.vmin), vmax = parseFloat(f.vmax);
    var rows = P.filter(function (p) {
      if (WS.chip && p.st !== WS.chip) return false;
      if (q && (p.n + ' ' + p.d + ' ' + p.sku + ' ' + p.upc + ' ' + p.co + ' ' + p.cls + ' ' + p.sub).toLowerCase().indexOf(q) < 0) return false;
      if (f.company && p.co !== f.company) return false;
      if (f.cls && p.cls !== f.cls) return false;
      if (f.sub && p.sub !== f.sub) return false;
      if (f.wh && p.wh !== f.wh) return false;
      if (f.loc && p.loc !== f.loc) return false;
      if (f.status && p.st !== f.status) return false;
      if (f.count) { var r = f.count.split('-'), lo = +r[0], hi = r[1] === '' || r[1] == null ? (r.length > 1 ? Infinity : lo) : +r[1]; if (p.cur < lo || p.cur > hi) return false; }
      if (f.reorder === 'below' && p.avail >= p.reo) return false;
      if (f.reorder === 'above' && p.avail < p.reo) return false;
      if (!isNaN(vmin) && p.value < vmin) return false;
      if (!isNaN(vmax) && p.value > vmax) return false;
      return true;
    });
    var k = WS.sort.k, dir = WS.sort.dir;
    rows.sort(function (a, b) { var x = a[k], y = b[k]; return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y))) * dir; });
    return rows;
  }

  function renderStock(sec, opt) {
    opt = opt || {};
    var vis = visTC(), rows = filtered(), total = rows.length;
    var pages = Math.max(1, Math.ceil(total / WS.per));
    if (WS.page > pages) WS.page = pages;
    var start = (WS.page - 1) * WS.per, pageRows = rows.slice(start, start + WS.per);
    var fadeIn = opt.fadeIn || [];
    var fc = function (k) { return fadeIn.indexOf(k) >= 0 ? ' fading' : ''; };
    var th = '<tr><th class="nos"><input type="checkbox" data-ws-all aria-label="Select all"></th>';
    vis.forEach(function (t) {
      var s = WS.sort.k === t.sort;
      th += '<th data-col="' + t.k + '" data-k="' + t.sort + '" class="' + (t.num ? 'num ' : '') + (s ? 'sorted' : '') + fc(t.k) + '"' + (s ? ' aria-sort="' + (WS.sort.dir > 0 ? 'ascending' : 'descending') + '"' : '') + '>' + t.label + '<i class="si" data-lucide="' + (s ? (WS.sort.dir > 0 ? 'chevron-down' : 'chevron-down') : 'arrow-up-down') + '"' + (s && WS.sort.dir < 0 ? ' style="transform:rotate(180deg)"' : '') + '></i></th>';
    });
    th += '<th class="nos" aria-label="Actions"></th></tr>';
    var tb = '';
    pageRows.forEach(function (p, i) {
      var id = P.indexOf(p);
      tb += '<tr data-id="' + id + '" class="' + (opt.anim ? 'ws-rowin ' : '') + (WS.sel[id] ? 'sel' : '') + '" style="--i:' + i + '"><td><input type="checkbox" data-ws-row aria-label="Select ' + esc(p.n) + '"' + (WS.sel[id] ? ' checked' : '') + '></td>';
      vis.forEach(function (t) { tb += '<td data-col="' + t.k + '" class="' + (t.num ? 'num' : '') + fc(t.k) + '">' + cell(t, p) + '</td>'; });
      tb += '<td class="actions"><button class="ws-kebab" type="button" data-ws-kebab aria-label="Row actions"><i data-lucide="ellipsis-vertical"></i></button></td></tr>';
    });
    if (!pageRows.length) tb = '<tr><td class="ws-empty" colspan="' + (vis.length + 2) + '">No products match these filters. <button class="ws-linkbtn" type="button" data-ws-reset>Reset filters</button></td></tr>';
    $('[data-ws-thead]', sec).innerHTML = th;
    $('[data-ws-tbody]', sec).innerHTML = tb;
    // footer
    $('[data-ws-showing]', sec).textContent = total ? 'Showing ' + (start + 1) + ' – ' + (start + pageRows.length) + ' of ' + total + ' products' : 'Showing 0 of 0 products';
    var pg = '<button type="button" data-pg="' + (WS.page - 1) + '"' + (WS.page <= 1 ? ' disabled' : '') + ' aria-label="Previous"><i data-lucide="chevron-down" style="transform:rotate(90deg)"></i></button>';
    for (var n = 1; n <= pages; n++) pg += '<button type="button" data-pg="' + n + '"' + (n === WS.page ? ' class="active"' : '') + '>' + n + '</button>';
    pg += '<button type="button" data-pg="' + (WS.page + 1) + '"' + (WS.page >= pages ? ' disabled' : '') + ' aria-label="Next"><i data-lucide="chevron-down" style="transform:rotate(-90deg)"></i></button>';
    $('[data-ws-pager]', sec).innerHTML = pg;
    $('[data-ws-total]', sec).textContent = WS.chip || anyFilter() ? '(' + total + ' shown · 1,842)' : '(1,842)';
    syncAll(sec);
    icons($('.ws-products', sec));
    if (fadeIn.length) requestAnimationFrame(function () { requestAnimationFrame(function () { $$('.fading', sec).forEach(function (e) { e.classList.remove('fading'); }); }); });
  }
  function anyFilter() { var f = WS.f; return !!(WS.q || f.company || f.cls || f.sub || f.wh || f.loc || f.status || f.count || f.reorder || f.vmin || f.vmax); }
  function syncAll(sec) {
    var boxes = $$('[data-ws-row]', sec), all = $('[data-ws-all]', sec);
    if (!all) return;
    var c = boxes.filter(function (b) { return b.checked; }).length;
    all.checked = boxes.length && c === boxes.length; all.indeterminate = c > 0 && c < boxes.length;
  }

  function renderColPop(sec) {
    var h = '';
    // two columns, PNG order: first 9 left, rest right
    var left = COLS.slice(0, 9), right = COLS.slice(9);
    for (var i = 0; i < 9; i++) {
      [left[i], right[i]].forEach(function (c) {
        if (!c) { h += '<span></span>'; return; }
        h += '<label><input type="checkbox" data-colkey="' + c[0] + '"' + (WS.cols[c[0]] ? ' checked' : '') + (c[0] === 'product' ? ' disabled' : '') + '>' + c[1] + '</label>';
      });
    }
    $('[data-ws-colgrid]', sec).innerHTML = h;
    updColCount(sec);
  }
  function updColCount(sec) {
    var n = COLS.filter(function (c) { return WS.cols[c[0]]; }).length;
    $('[data-ws-colcount]', sec).textContent = n + ' of ' + COLS.length + ' columns selected';
  }
  function setCol(sec, key, on) {
    var before = visTC().map(function (t) { return t.k; });
    WS.cols[key] = on;
    var after = visTC().map(function (t) { return t.k; });
    var gone = before.filter(function (k) { return after.indexOf(k) < 0; });
    var added = after.filter(function (k) { return before.indexOf(k) < 0; });
    updColCount(sec);
    if (gone.length && !RM) {
      gone.forEach(function (k) { $$('[data-col="' + k + '"]', sec).forEach(function (e) { e.classList.add('fading'); }); });
      setTimeout(function () { renderStock(sec); }, 230);
    } else renderStock(sec, { fadeIn: RM ? [] : added.concat(gone.length ? [] : visTC().filter(function (t) { return t.keys.indexOf(key) >= 0; }).map(function (t) { return t.k; })) });
  }

  function exportCSV() {
    var vis = visTC(), rows = filtered();
    var head = vis.map(function (t) { return t.label; });
    var val = function (t, p) {
      switch (t.k) {
        case 'product': return p.n; case 'sku': return p.sku; case 'company': return p.co; case 'cls': return p.cls + ' / ' + p.sub;
        case 'wh': return p.wh + ' / ' + p.loc; case 'cur': return p.cur; case 'res': return p.res; case 'avail': return p.avail;
        case 'reorder': return p.reo; case 'cost': return p.cost.toFixed(2); case 'value': return p.value.toFixed(2); case 'batch': return p.batch;
        case 'expiry': return p.exp; case 'status': return p.st; case 'last': return p.last; case 'created': return p.by;
      }
    };
    var csv = [head].concat(rows.map(function (p) { return vis.map(function (t) { return val(t, p); }); }))
      .map(function (r) { return r.map(function (v) { v = String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(','); }).join('\n');
    try {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
      a.download = 'whole-stock-2026-10-01.csv'; document.body.appendChild(a); a.click(); a.remove();
      toast('Exported ' + rows.length + ' products to CSV', { tone: 'good' });
    } catch (e) { toast('Export failed', { tone: 'danger' }); }
  }
  function exportMenu(btn) {
    var items = [
      { label: 'Export as CSV', icon: 'download', onClick: exportCSV },
      { label: 'Export as Excel (.xlsx)', icon: 'file-text', onClick: function () { toast('Excel export queued — you will be notified', { tone: 'info' }); } },
      { label: 'Export as PDF', icon: 'printer', onClick: function () { toast('PDF export queued', { tone: 'info' }); } }
    ];
    if (FS().menu) FS().menu(btn, items); else exportCSV();
  }

  function fillSelect(sel, key) {
    var vals = P.map(function (p) { return p[key]; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).sort();
    vals.forEach(function (v) { var o = document.createElement('option'); o.value = v; o.textContent = v; sel.appendChild(o); });
  }

  function mountStock(sec) {
    var map = { company: 'co', cls: 'cls', sub: 'sub', wh: 'wh', loc: 'loc' };
    $$('[data-ws-f]', sec).forEach(function (s) {
      var k = s.getAttribute('data-ws-f');
      if (map[k]) fillSelect(s, map[k]);
      s.addEventListener('change', function () { WS.f[k] = s.value; WS.page = 1; renderStock(sec, { anim: 1 }); });
    });
    ['vmin', 'vmax'].forEach(function (k) {
      var inp = $('[data-ws-' + k + ']', sec);
      inp.addEventListener('input', function () { WS.f[k] = inp.value; WS.page = 1; renderStock(sec); });
    });
    var q = $('[data-ws-q]', sec);
    q.addEventListener('input', function () { WS.q = q.value; WS.page = 1; renderStock(sec); });
    $('[data-ws-sortby]', sec).addEventListener('change', function (e) {
      var v = e.target.value.split(':'), m = { name: 'n', value: 'value', cur: 'cur', last: 'last' };
      WS.sort = { k: m[v[0]], dir: +v[1] }; renderStock(sec, { anim: 1 });
    });
    // chips
    var chips = $('[data-ws-chips]', sec);
    chips.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      $$('button', chips).forEach(function (x) { x.classList.toggle('active', x === b); });
      WS.chip = b.getAttribute('data-chip'); WS.page = 1;
      renderStock(sec, { anim: 1 });
    });
    // reset
    function reset() {
      WS.q = ''; WS.f = {}; WS.chip = ''; WS.page = 1; WS.sort = { k: 'n', dir: 1 };
      q.value = ''; $$('[data-ws-f]', sec).forEach(function (s) { s.value = ''; });
      $('[data-ws-vmin]', sec).value = ''; $('[data-ws-vmax]', sec).value = '';
      $('[data-ws-sortby]', sec).value = 'name:1';
      $$('button', chips).forEach(function (x, i) { x.classList.toggle('active', i === 0); });
      renderStock(sec, { anim: 1 });
    }
    sec.addEventListener('click', function (e) {
      var t = e.target;
      if (t.closest('[data-ws-reset]')) { reset(); toast('Filters reset'); return; }
      if (t.closest('[data-ws-save]')) { toast('View saved as “Stock · ' + (WS.chip || 'All products') + '”', { tone: 'good' }); return; }
      if (t.closest('[data-ws-export]')) { exportMenu(t.closest('[data-ws-export]')); return; }
      if (t.closest('[data-ws-print]')) { window.print(); return; }
      if (t.closest('[data-ws-more]')) {
        var mb = t.closest('[data-ws-more]');
        if (FS().menu) FS().menu(mb, [
          { label: 'Stock adjustments', icon: 'sliders-horizontal', onClick: function () { location.hash = '#/app/inventory/adjustments'; } },
          { label: 'Warehouses', icon: 'warehouse', onClick: function () { location.hash = '#/app/inventory/warehouses'; } },
          { label: 'Inventory reports', icon: 'chart-column', onClick: function () { location.hash = '#/app/inventory/reports'; } }
        ]);
        return;
      }
      var pgb = t.closest('[data-pg]');
      if (pgb && !pgb.disabled) { WS.page = +pgb.getAttribute('data-pg'); renderStock(sec, { anim: 1 }); return; }
      var th = t.closest('th[data-k]');
      if (th && th.closest('.ws-tbl')) {
        var k = th.getAttribute('data-k');
        WS.sort = { k: k, dir: WS.sort.k === k ? -WS.sort.dir : 1 };
        renderStock(sec, { anim: 1 }); return;
      }
      var kb = t.closest('[data-ws-kebab]');
      if (kb) {
        var p = P[+kb.closest('tr').getAttribute('data-id')];
        if (FS().menu) FS().menu(kb, [
          { label: 'View item', icon: 'package', onClick: function () { location.hash = '#/app/inventory/items'; } },
          { label: 'Adjust stock', icon: 'sliders-horizontal', onClick: function () { location.hash = '#/app/inventory/adjustments'; } },
          { label: 'Transfer to warehouse', icon: 'warehouse', onClick: function () { toast('Transfer draft created for ' + p.n, { tone: 'good' }); } },
          { label: 'Stock card', icon: 'file-text', onClick: function () { toast(p.sku + ' · ' + grp(p.cur) + ' units at ' + p.wh, { tone: 'info' }); } }
        ]);
        return;
      }
    });
    sec.addEventListener('change', function (e) {
      var t = e.target;
      if (t.matches('[data-ws-all]')) {
        $$('[data-ws-row]', sec).forEach(function (b) { b.checked = t.checked; var id = b.closest('tr').getAttribute('data-id'); WS.sel[id] = t.checked; b.closest('tr').classList.toggle('sel', t.checked); });
        var n = Object.keys(WS.sel).filter(function (k) { return WS.sel[k]; }).length;
        if (n) toast(n + ' products selected');
      } else if (t.matches('[data-ws-row]')) {
        var tr = t.closest('tr'); WS.sel[tr.getAttribute('data-id')] = t.checked; tr.classList.toggle('sel', t.checked); syncAll(sec);
      } else if (t.matches('[data-colkey]')) {
        setCol(sec, t.getAttribute('data-colkey'), t.checked);
      } else if (t.matches('[data-ws-per]')) {
        WS.per = +t.value; WS.page = 1; renderStock(sec, { anim: 1 });
      }
    });
    // filters toggle
    var fp = $('[data-ws-filters]', sec), tg = $('[data-ws-toggle]', sec);
    tg.addEventListener('click', function () {
      var c = fp.classList.toggle('collapsed');
      tg.setAttribute('aria-expanded', String(!c));
      $('span', tg).textContent = c ? 'Show Filters' : 'Hide Filters';
    });
    // stock view
    var seg = $('[data-ws-view]', sec), asof = $('[data-ws-asof]', sec);
    seg.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      $$('button', seg).forEach(function (x) { x.classList.toggle('active', x === b); });
      if (b.getAttribute('data-v') === 'date') { asof.focus(); try { asof.showPicker && asof.showPicker(); } catch (er) { } toast('Pick a date to view historical stock', { tone: 'info' }); }
      else { asof.value = '2026-10-01'; $('[data-ws-asof2]', sec).value = '2026-10-01'; toast('Showing current stock'); }
    });
    asof.addEventListener('change', function () {
      $('[data-ws-asof2]', sec).value = asof.value;
      $$('button', seg).forEach(function (x) { x.classList.toggle('active', x.getAttribute('data-v') === 'date'); });
      if (asof.value) toast('Stock as on ' + dmy(asof.value));
    });
    // column popover
    var cb = $('[data-ws-cols]', sec), pop = $('[data-ws-colpop]', sec);
    function closePop() { pop.hidden = true; cb.setAttribute('aria-expanded', 'false'); }
    cb.addEventListener('click', function (e) {
      e.stopPropagation();
      if (pop.hidden) { renderColPop(sec); pop.hidden = false; cb.setAttribute('aria-expanded', 'true'); icons(pop); }
      else closePop();
    });
    document.addEventListener('click', function (e) { if (!pop.hidden && !e.target.closest('.ws-colwrap')) closePop(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !pop.hidden) { closePop(); cb.focus(); } });
    $('[data-ws-colreset]', sec).addEventListener('click', function () { resetCols(); renderColPop(sec); renderStock(sec); toast('Columns reset'); });
    $('[data-ws-colmanage]', sec).addEventListener('click', function () { closePop(); toast('Column order & widths are saved per user', { tone: 'info' }); });
    renderStock(sec, { anim: 1 });
  }

  var stockMounted = false;
  function enterStock(sec) {
    var now = Date.now();
    if (lastRun.stock && now - lastRun.stock < 400) return;
    lastRun.stock = now;
    if (!stockMounted) { stockMounted = true; mountStock(sec); }
    else renderStock(sec, { anim: 1 });
    if (!RM) replay(sec, 'ws-play');
  }

  /* ================================================================ wiring */
  var ROUTES = ['app/dashboard', 'admin/dashboard', 'ess/dashboard', 'app/hr/payroll'];
  function run(sec, route) {
    if (!sec) return;
    if (route === 'app/inventory/stock') enterStock(sec);
    else if (ROUTES.indexOf(route) >= 0) enterDash(sec, route);
  }
  function secFor(r) { return document.querySelector('.screen[data-route="' + r + '"]'); }
  function boot() {
    var all = ROUTES.concat(['app/inventory/stock']);
    if (FS().onEnter) {
      all.forEach(function (r) { FS().onEnter(r, function (sec) { run(sec || secFor(r), r); }); });
    } else {
      window.addEventListener('hashchange', function () { var r = location.hash.replace(/^#\/?/, ''); if (all.indexOf(r) >= 0) setTimeout(function () { run(secFor(r), r); }, 30); });
    }
    // catch the initial route in case it was entered before our hooks existed
    setTimeout(function () {
      var r = location.hash.replace(/^#\/?/, '').split('?')[0];
      var s = secFor(r);
      if (all.indexOf(r) >= 0 && s && (s.classList.contains('active') || s.offsetParent)) run(s, r);
    }, 120);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else setTimeout(boot, 0);
})();
