/* 9C-ess.js (Agent F): Employee Self-Service portal engine. All ess/* screens except ess/dashboard. */
(function () {
/* ---------- 00-core.js ---------- */
/* Shared ESS helpers. Every route part is its own IIFE and uses window.ES. */
var ES = (window.ES = window.ES || {});
(function () {
  var $ = FS.$, $$ = FS.$$;
  ES.$ = $; ES.$$ = $$;
  ES.reduce = function () { return matchMedia('(prefers-reduced-motion: reduce)').matches; };
  ES.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  ES.wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  /* ---------------- people ---------------- */
  var D = window.FS_DATA || { employees: [], company: {} };
  ES.CO = D.company;
  ES.ME = {
    id: 'EMP-0042', name: 'Bilal Khan', first: 'Bilal', role: 'Sales Executive', dept: 'Sales', branch: 'Lahore HQ', grade: 'G-7',
    email: 'bilal.khan@alnoor.com.pk', phone: '0312-4778899', manager: 'Zainab Raza', joined: '14 Mar 2022', joinedISO: '2022-03-14',
    cnic: '35202-4417823-7', dob: '19 Jun 1995', blood: 'B+', ntn: '3520244178237', eobi: 'EOBI-LHR-7731904',
    bank: 'Meezan Bank', account: '0123-0104417-01', iban: 'PK36 MEZN 0001 2301 0441 7001', shift: 'General 09:00 – 18:00',
    address: 'House 27, Street 4, Johar Town Block J, Lahore', basic: 92000, gross: 142500,
  };
  ES.TEAM = [
    { id: 'EMP-0061', name: 'Imran Siddiqui', role: 'Order Booker', dept: 'Sales', branch: 'Lahore HQ', phone: '0300-4661204', email: 'imran.s@alnoor.com.pk', route: 'Gulberg / Model Town' },
    { id: 'EMP-0064', name: 'Nadeem Akhtar', role: 'Order Booker', dept: 'Sales', branch: 'Lahore HQ', phone: '0321-4880917', email: 'nadeem.a@alnoor.com.pk', route: 'Johar Town / Township' },
    { id: 'EMP-0067', name: 'Tanveer Hassan', role: 'Field Sales Officer', dept: 'Sales', branch: 'Lahore HQ', phone: '0333-4129956', email: 'tanveer.h@alnoor.com.pk', route: 'Kot Lakhpat industrial' },
    { id: 'EMP-0072', name: 'Salman Butt', role: 'Delivery Rider', dept: 'Operations', branch: 'Lahore HQ', phone: '0345-4017783', email: 'salman.b@alnoor.com.pk', route: 'Lahore HQ dispatch' },
  ];
  var extra = [
    { id: 'EMP-0015', name: 'Umar Farooq', role: 'Regional Sales Lead', dept: 'Sales', branch: 'Lahore HQ', email: 'umar.f@alnoor.com.pk', phone: '0300-4119087' },
    { id: 'EMP-0039', name: 'Hamza Butt', role: 'Key Account Manager', dept: 'Sales', branch: 'Lahore HQ', email: 'hamza.b@alnoor.com.pk', phone: '0321-4002231' },
    { id: 'EMP-0044', name: 'Nida Shah', role: 'Payroll Officer', dept: 'Human Resources', branch: 'Lahore HQ', email: 'nida.shah@alnoor.com.pk', phone: '0332-4877120' },
    { id: 'EMP-0051', name: 'Rafiq Shah', role: 'Delivery Officer', dept: 'Operations', branch: 'Karachi', email: 'rafiq.s@alnoor.com.pk', phone: '0300-2190456' },
  ];
  var seen = {};
  ES.PEOPLE = D.employees.concat(extra, ES.TEAM).filter(function (p) { if (seen[p.id]) return false; seen[p.id] = 1; return true; });
  ES.person = function (name) { return ES.PEOPLE.find(function (p) { return p.name === name; }) || { name: name, role: '', dept: '' }; };
  ES.initials = function (n) { return String(n).split(/\s+/).filter(Boolean).map(function (w) { return w[0]; }).slice(0, 2).join('').toUpperCase(); };
  var TONES = ['', 'c2', 'c3', 'c4', 'c5', 'c6', 'lime'];
  ES.tone = function (n) { var h = 0; String(n).split('').forEach(function (c) { h = (h * 31 + c.charCodeAt(0)) >>> 0; }); return TONES[h % TONES.length]; };
  /* avatar: size '', 'xs', 'sm', 'lg', 'xl' */
  ES.av = function (name, size, cls) { return '<span class="avatar ' + (size || '') + ' ' + ES.tone(name) + ' ' + (cls || '') + '" title="' + ES.esc(name) + '">' + ES.initials(name) + '</span>'; };

  /* ---------------- dates ---------------- */
  ES.TODAY = new Date(2026, 9, 1, 9, 4, 0);
  ES.MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  ES.MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  ES.DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  ES.pad = function (n) { return (n < 10 ? '0' : '') + n; };
  ES.iso = function (d) { return d.getFullYear() + '-' + ES.pad(d.getMonth() + 1) + '-' + ES.pad(d.getDate()); };
  ES.parse = function (s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
  ES.dfmt = function (d, withDow) { if (typeof d === 'string') d = ES.parse(d); return (withDow ? ES.DOW[d.getDay()] + ', ' : '') + ES.pad(d.getDate()) + ' ' + ES.MON[d.getMonth()] + ' ' + d.getFullYear(); };
  ES.dshort = function (d) { if (typeof d === 'string') d = ES.parse(d); return ES.pad(d.getDate()) + ' ' + ES.MON[d.getMonth()]; };
  ES.HOLIDAYS = [
    { d: '2026-08-14', n: 'Independence Day' }, { d: '2026-08-26', n: '12 Rabi ul Awal' },
    { d: '2026-11-09', n: 'Iqbal Day' }, { d: '2026-12-25', n: 'Quaid-e-Azam Day' },
    { d: '2027-02-05', n: 'Kashmir Solidarity Day' }, { d: '2027-03-10', n: 'Eid ul Fitr' }, { d: '2027-03-11', n: 'Eid ul Fitr (2nd day)' },
    { d: '2027-03-12', n: 'Eid ul Fitr (3rd day)' }, { d: '2027-03-23', n: 'Pakistan Day' }, { d: '2027-05-01', n: 'Labour Day' },
  ];
  ES.isHoliday = function (d) { var s = ES.iso(d); var h = ES.HOLIDAYS.find(function (x) { return x.d === s; }); return h ? h.n : ''; };
  ES.isWeekend = function (d) { return d.getDay() === 0 || d.getDay() === 6; };
  /* working days between two dates inclusive (Sat/Sun + public holidays excluded) */
  ES.workingDays = function (a, b) {
    if (typeof a === 'string') a = ES.parse(a); if (typeof b === 'string') b = ES.parse(b);
    var n = 0, hol = [], d = new Date(a);
    if (b < a) return { days: 0, holidays: [] };
    while (d <= b) { var h = ES.isHoliday(d); if (h) hol.push(h); else if (!ES.isWeekend(d)) n++; d.setDate(d.getDate() + 1); }
    return { days: n, holidays: hol };
  };

  /* ---------------- formatting ---------------- */
  ES.money = function (n, o) { return FS.money(n, o); };
  ES.rs = function (n) { return 'Rs ' + FS.fmt(Math.round(n)); };
  var BADGE = { approved: 'good', paid: 'good', reimbursed: 'good', resolved: 'good', done: 'good', active: 'good', completed: 'good', closed: 'neutral', recovered: 'good',
    pending: 'warn', submitted: 'info', 'in review': 'info', open: 'info', 'in progress': 'info', scheduled: 'neutral', next: 'violet',
    rejected: 'danger', overdue: 'danger', breached: 'danger', cancelled: 'neutral', withdrawn: 'neutral', draft: 'neutral', 'on hold': 'warn' };
  ES.badge = function (s, extra) { return '<span class="badge dot ' + (BADGE[String(s).toLowerCase()] || 'neutral') + ' ' + (extra || '') + '">' + s + '</span>'; };

  /* status tracker: steps = ['Submitted','Manager','HR','Approved'], at = index of current step, state = 'ok'|'rej'|'cancel' */
  ES.tracker = function (steps, at, state, subs) {
    subs = subs || [];
    return '<ol class="es-track ' + (state === 'rej' ? 'is-rej' : state === 'cancel' ? 'is-cancel' : '') + '">' + steps.map(function (s, i) {
      var c = i < at ? 'done' : i === at ? (state === 'rej' ? 'rej' : state === 'cancel' ? 'cancel' : (i === steps.length - 1 ? 'done' : 'now')) : '';
      var ic = c === 'done' ? 'check' : c === 'rej' ? 'x' : c === 'cancel' ? 'minus' : c === 'now' ? 'loader' : '';
      return '<li class="' + c + '" style="--i:' + i + '"><span class="es-track-dot">' + (ic ? '<i data-lucide="' + ic + '"></i>' : '') + '</span><b>' + s + '</b>' + (subs[i] ? '<small>' + subs[i] + '</small>' : '') + '</li>';
    }).join('') + '</ol>';
  };

  /* progress ring. tone = CSS colour expression */
  ES.ring = function (pct, o) {
    o = o || {};
    var sz = o.size || 72, sw = o.stroke || 3.6, r = 18 - sw / 2;
    return '<div class="es-ring ' + (o.cls || '') + '" style="--sz:' + sz + 'px;--c:' + (o.tone || 'var(--primary)') + '" data-p="' + Math.max(0, Math.min(100, pct)) + '">' +
      '<svg viewBox="0 0 36 36" aria-hidden="true"><circle class="t" cx="18" cy="18" r="' + r + '" stroke-width="' + sw + '"/>' +
      '<circle class="v" cx="18" cy="18" r="' + r + '" stroke-width="' + sw + '" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100"/></svg>' +
      '<div class="es-ring-in">' + (o.label != null ? o.label : Math.round(pct) + '%') + (o.sub ? '<small>' + o.sub + '</small>' : '') + '</div></div>';
  };
  ES.setRing = function (ring, pct) {
    pct = Math.max(0, Math.min(100, pct)); ring.dataset.p = pct;
    var v = ring.querySelector('circle.v'); if (v) v.style.strokeDashoffset = 100 - pct;
  };
  ES.animRings = function (root) {
    $$('.es-ring', root).forEach(function (r) {
      var v = r.querySelector('circle.v'); if (!v) return;
      v.style.transition = 'none'; v.style.strokeDashoffset = 100; void v.getBoundingClientRect();
      requestAnimationFrame(function () { v.style.transition = ''; v.style.strokeDashoffset = 100 - (+r.dataset.p || 0); });
    });
  };

  /* ---------------- FS v3 API with graceful fallbacks ---------------- */
  ES.sheet = function (o) {
    if (typeof FS.sheet === 'function') {
      var el = FS.sheet({ title: o.title, subtitle: o.sub, html: o.html, foot: o.foot });
      if (el) { el.classList.add('es-sheet-host'); if (o.cls) String(o.cls).split(/\s+/).filter(Boolean).forEach(function (c) { el.classList.add(c); }); FS.icons(el); }
      return el;
    }
    var ov = document.createElement('div');
    ov.className = 'overlay es-sheet-ov'; ov.dataset.temp = '1';
    ov.innerHTML = '<div class="modal es-sheet es-sheet-host ' + (o.cls || '') + '" role="dialog" aria-modal="true"><span class="es-grab" aria-hidden="true"></span>' +
      '<div class="modal-head"><div><h2>' + o.title + '</h2>' + (o.sub ? '<p>' + o.sub + '</p>' : '') + '</div><button class="x" data-close aria-label="Close"><i data-lucide="x"></i></button></div>' +
      '<div class="es-sheet-body">' + o.html + '</div>' + (o.foot ? '<div class="modal-foot">' + o.foot + '</div>' : '') + '</div>';
    document.body.appendChild(ov);
    ov.classList.add('open'); FS.icons(ov); FS.enhance(ov);
    var first = ov.querySelector('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]), textarea');
    if (first && matchMedia('(min-width: 700px)').matches) setTimeout(function () { try { first.focus({ preventScroll: true }); } catch (e) {} }, 320);
    return ov.querySelector('.es-sheet');
  };
  ES.closeSheet = function (el) { var ov = el && el.closest('.overlay'); if (ov) FS.closeOverlay(ov); };

  ES.celebrate = function (el) {
    if (typeof FS.celebrate === 'function') return FS.celebrate(el);
    if (ES.reduce()) return;
    var r = el ? el.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
    var host = document.createElement('div');
    host.className = 'es-burst';
    host.style.left = r.left + r.width / 2 + 'px'; host.style.top = r.top + r.height / 2 + 'px';
    var cols = ['var(--lime)', 'var(--mint)', 'var(--primary)', 'var(--orange)', 'var(--violet)', 'var(--blue)'];
    var h = '<span class="es-burst-check"><i data-lucide="check"></i></span>';
    for (var i = 0; i < 26; i++) {
      var a = (Math.PI * 2 * i) / 26 + Math.random() * .3, d = 60 + Math.random() * 90;
      h += '<i style="--x:' + Math.cos(a) * d + 'px;--y:' + (Math.sin(a) * d - 30) + 'px;--r:' + (Math.random() * 540 - 270) + 'deg;background:' + cols[i % cols.length] + ';--d:' + (Math.random() * 120) + 'ms"></i>';
    }
    host.innerHTML = h; document.body.appendChild(host); FS.icons(host);
    setTimeout(function () { host.remove(); }, 1500);
  };
  /* big confetti rain (onboarding complete etc.) */
  ES.confetti = function () {
    if (ES.reduce()) return;
    var host = document.createElement('div'); host.className = 'es-rain';
    var cols = ['var(--lime)', 'var(--mint)', 'var(--primary)', 'var(--orange)', 'var(--violet)', 'var(--blue)', 'var(--warn)'];
    var h = '';
    for (var i = 0; i < 90; i++) h += '<i style="left:' + Math.random() * 100 + '%;background:' + cols[i % cols.length] + ';--d:' + Math.random() * 900 + 'ms;--t:' + (1700 + Math.random() * 1500) + 'ms;--r:' + (Math.random() * 900 - 450) + 'deg;--s:' + (.6 + Math.random() * .8) + ';--dx:' + (Math.random() * 120 - 60) + 'px"></i>';
    host.innerHTML = h; document.body.appendChild(host);
    setTimeout(function () { host.remove(); }, 3800);
  };

  ES.tick = function (el, to, o) {
    o = o || {};
    if (!el) return;
    if (o.dec == null) o.dec = 0;
    if (typeof FS.tick === 'function') return FS.tick(el, to, o);
    var dec = o.dec == null ? 0 : o.dec, pre = o.prefix == null ? '' : o.prefix, suf = o.suffix || '';
    var from = el.dataset.v != null ? +el.dataset.v : (parseFloat(el.textContent.replace(/[^\d.\-]/g, '')) || 0);
    el.dataset.v = to;
    var paint = function (v) {
      var s = FS.fmt(Math.abs(v), dec).split('.');
      el.innerHTML = (v < 0 ? '−' : '') + pre + s[0] + (s[1] ? '<span class="dec">.' + s[1] + '</span>' : '') + suf;
    };
    if (ES.reduce() || from === to) { paint(to); return; }
    var t0 = performance.now(), dur = o.dur || 600;
    cancelAnimationFrame(el._esTick);
    var step = function (now) {
      var p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      paint(from + (to - from) * e);
      if (p < 1) el._esTick = requestAnimationFrame(step);
    };
    el._esTick = requestAnimationFrame(step);
    el.classList.remove('es-bump'); void el.offsetWidth; el.classList.add('es-bump');
  };

  ES.confirm = function (o) {
    if (typeof FS.confirm === 'function') return FS.confirm(o);
    return new Promise(function (res) {
      var el = ES.sheet({ title: o.title, html: '<p class="es-confirm-text">' + (o.text || '') + '</p>' + (o.html || ''), cls: 'es-sheet-sm',
        foot: '<button class="btn secondary" data-close>Cancel</button><button class="btn ' + (o.danger ? 'danger' : 'primary') + '" data-es-ok>' + (o.okLabel || 'Confirm') + '</button>' });
      var done = false;
      el.querySelector('[data-es-ok]').addEventListener('click', function () { done = true; res(el); ES.closeSheet(el); });
      var ov = el.closest('.overlay');
      var mo = new MutationObserver(function () { if (!ov.isConnected || !ov.classList.contains('open')) { mo.disconnect(); if (!done) res(false); } });
      mo.observe(ov, { attributes: true }); mo.observe(document.body, { childList: true });
    });
  };

  /* button progress state; resolves after ms */
  ES.busy = function (btn, ms, label) {
    ms = ms == null ? 900 : ms;
    if (!btn) return ES.wait(ms);
    var html = btn.innerHTML;
    btn.classList.add('es-busy'); btn.disabled = true;
    btn.innerHTML = '<span class="es-spin" aria-hidden="true"></span>' + (label || 'Working…');
    return ES.wait(ms).then(function () { btn.classList.remove('es-busy'); btn.disabled = false; btn.innerHTML = html; FS.icons(btn); });
  };

  /* click delegation: elements with data-act="name" call map[name](el, event) */
  ES.acts = function (root, map) {
    root.addEventListener('click', function (e) {
      var a = e.target.closest('[data-act]');
      if (!a || !root.contains(a) || !map[a.dataset.act]) return;
      if (a.tagName === 'A' && a.getAttribute('href') === '#') e.preventDefault();
      map[a.dataset.act](a, e);
    });
  };

  /* mount a route: render() returns HTML appended after the page-head on first entry */
  ES.route = function (route, o) {
    FS.onEnter(route, function (sec, r, first) {
      if (first) {
        sec.classList.add('es-screen');
        if (o.render) sec.insertAdjacentHTML('beforeend', o.render(sec));
        if (o.bind) o.bind(sec);
        FS.icons(sec);
      }
      ES.animRings(sec);
      if (o.enter) o.enter(sec, first);
    });
  };

  /* scroll an element into view inside the shell's own scroller (scrollIntoView also nudges the document) */
  ES.scrollTo = function (el, top) {
    if (!el) return;
    var p = el.parentElement;
    while (p && p !== document.body) { var o = getComputedStyle(p).overflowY; if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight) break; p = p.parentElement; }
    if (!p || p === document.body) p = document.scrollingElement;
    var r = el.getBoundingClientRect(), pr = p === document.scrollingElement ? { top: 0, height: innerHeight } : p.getBoundingClientRect();
    var y = p.scrollTop + r.top - pr.top - (top ? 90 : Math.max(16, (pr.height - r.height) / 2));
    p.scrollTo({ top: Math.max(0, y), behavior: ES.reduce() ? 'auto' : 'smooth' });
  };
  /* restart a CSS entrance on dynamic items */
  ES.stagger = function (els, base) { els.forEach(function (el, i) { el.style.setProperty('--i', (base || 0) + i); el.classList.remove('es-in'); void el.offsetWidth; el.classList.add('es-in'); }); };
  ES.flash = function (el) { if (!el) return; el.classList.remove('row-flash'); void el.offsetWidth; el.classList.add('row-flash'); };
  ES.removeAnim = function (el, cb) { el.classList.add('es-out'); setTimeout(function () { el.remove(); cb && cb(); }, 320); };

  /* typing animation into an input / element. resolves when done */
  ES.typeInto = function (el, text, speed) {
    text = String(text); speed = speed || 34;
    var isInput = 'value' in el && el.tagName !== 'BUTTON';
    el.classList.add('es-typing');
    if (ES.reduce()) { if (isInput) el.value = text; else el.textContent = text; el.classList.remove('es-typing'); return Promise.resolve(); }
    return new Promise(function (res) {
      var i = 0;
      (function step() {
        i++; var s = text.slice(0, i);
        if (isInput) el.value = s; else el.textContent = s;
        if (i < text.length) setTimeout(step, speed + Math.random() * speed * .6);
        else { el.classList.remove('es-typing'); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); res(); }
      })();
    });
  };

  /* swipeable card: drag horizontally. o.onRight / o.onLeft return false to snap back */
  ES.swipe = function (card, o) {
    var x0 = 0, y0 = 0, dx = 0, drag = false, axis = '';
    var th = o.threshold || 110;
    var mv = card._esMover = o.mover ? card.querySelector(o.mover) : card;
    card.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 || e.target.closest('button, a, input, textarea, select, label')) return;
      drag = true; axis = ''; x0 = e.clientX; y0 = e.clientY; dx = 0; card.classList.add('es-dragging');
    });
    card.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var mx = e.clientX - x0, my = e.clientY - y0;
      if (!axis) { if (Math.abs(mx) > 6 || Math.abs(my) > 6) { axis = Math.abs(mx) > Math.abs(my) ? 'x' : 'y'; if (axis === 'x') { try { card.setPointerCapture(e.pointerId); } catch (er) {} } } }
      if (axis !== 'x') return;
      e.preventDefault();
      dx = mx;
      mv.style.transform = 'translateX(' + dx + 'px) rotate(' + (o.rotate === false ? 0 : dx / 24) + 'deg)';
      card.style.setProperty('--sw', Math.max(-1, Math.min(1, dx / th)));
      card.classList.toggle('es-sw-r', dx > 24); card.classList.toggle('es-sw-l', dx < -24);
    });
    var end = function () {
      if (!drag) return; drag = false; card.classList.remove('es-dragging');
      if (axis === 'x' && dx > th && o.onRight) ES.flyOut(card, 1, o.onRight);
      else if (axis === 'x' && dx < -th && o.onLeft) ES.flyOut(card, -1, o.onLeft);
      else ES.snapBack(card);
      axis = '';
    };
    card.addEventListener('pointerup', end); card.addEventListener('pointercancel', end);
    card.style.touchAction = 'pan-y';
  };
  ES.snapBack = function (card) { var mv = card._esMover || card; mv.classList.add('es-snap'); setTimeout(function () { mv.classList.remove('es-snap'); }, 350); card.classList.add('es-snap'); mv.style.transform = ''; card.style.setProperty('--sw', 0); card.classList.remove('es-sw-r', 'es-sw-l'); setTimeout(function () { card.classList.remove('es-snap'); }, 350); };
  /* fly a card out; cb may return a promise resolving false to cancel (card returns) */
  ES.flyOut = function (card, dir, cb) {
    var mv = card._esMover || card;
    var go = function () {
      card.classList.add('es-fly'); mv.classList.add('es-fly'); card.classList.toggle('es-sw-r', dir > 0); card.classList.toggle('es-sw-l', dir < 0);
      mv.style.transform = 'translateX(' + dir * 120 + '%) rotate(' + (mv === card ? dir * 14 : 0) + 'deg)'; mv.style.opacity = '0';
    };
    var res = cb ? cb(card, dir) : true;
    Promise.resolve(res).then(function (ok) {
      if (ok === false) { ES.snapBack(card); return; }
      go();
    });
  };

  /* autocomplete for people. items: [{name, sub}] */
  ES.autocomplete = function (input, items, onPick) {
    var wrap = input.parentElement; wrap.classList.add('es-ac');
    var box = document.createElement('div'); box.className = 'es-ac-list'; box.setAttribute('role', 'listbox'); wrap.appendChild(box);
    var hi = 0, shown = [];
    var render = function () {
      var q = input.value.trim().toLowerCase();
      shown = items.filter(function (p) { return !q || (p.name + ' ' + (p.sub || '')).toLowerCase().indexOf(q) > -1; }).slice(0, 6);
      hi = 0;
      box.innerHTML = shown.length ? shown.map(function (p, i) {
        var nm = ES.esc(p.name), k = q ? nm.toLowerCase().indexOf(q) : -1;
        if (k > -1) nm = nm.slice(0, k) + '<mark>' + nm.slice(k, k + q.length) + '</mark>' + nm.slice(k + q.length);
        return '<button type="button" role="option" data-i="' + i + '" class="' + (i === 0 ? 'hi' : '') + '">' + ES.av(p.name, 'xs') + '<span><b>' + nm + '</b><small>' + ES.esc(p.sub || '') + '</small></span></button>';
      }).join('') : '<div class="es-ac-none">No one matches “' + ES.esc(input.value) + '”</div>';
      box.classList.add('on');
    };
    var pick = function (i) { var p = shown[i]; if (!p) return; input.value = p.name; box.classList.remove('on'); onPick && onPick(p); };
    input.setAttribute('autocomplete', 'off');
    input.addEventListener('focus', render);
    input.addEventListener('input', render);
    input.addEventListener('keydown', function (e) {
      if (!box.classList.contains('on')) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); hi = (hi + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % Math.max(1, shown.length); $$('button', box).forEach(function (b, i) { b.classList.toggle('hi', i === hi); }); }
      else if (e.key === 'Enter') { e.preventDefault(); pick(hi); }
      else if (e.key === 'Escape') { box.classList.remove('on'); }
    });
    box.addEventListener('mousedown', function (e) { var b = e.target.closest('button'); if (b) { e.preventDefault(); pick(+b.dataset.i); } });
    input.addEventListener('blur', function () { setTimeout(function () { box.classList.remove('on'); }, 120); });
  };

  /* company letterhead for .paper documents (paper is always light) */
  ES.letterhead = function (right) {
    var c = ES.CO;
    return '<div class="es-lh"><div class="es-lh-brand"><span class="es-lh-mark">AN</span><div><b>' + c.name + '</b><small>' + c.address + '</small><small>' + c.phone + ' · ' + c.email + ' · NTN ' + c.ntn + '</small></div></div>' + (right ? '<div class="es-lh-right">' + right + '</div>' : '') + '</div>';
  };
  /* preview a .paper document in a wide drawer with a Download button */
  ES.paper = function (o) {
    return FS.drawer({ title: o.title, subtitle: o.sub || '', wide: true,
      html: '<div class="es-paper-wrap"><div class="paper es-paper">' + o.html + '</div></div>',
      foot: '<button class="btn secondary" data-close>Close</button><button class="btn secondary" data-es-print><i data-lucide="printer"></i>Print</button><button class="btn primary" data-es-dl="' + ES.esc(o.file || 'document.pdf') + '"><i data-lucide="download"></i>Download PDF</button>' });
  };
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-es-dl]');
    if (b) { e.preventDefault(); ES.busy(b, 1000, 'Preparing PDF…').then(function () { FS.toast(b.dataset.esDl + ' downloaded', { tone: 'good' }); }); return; }
    var p = e.target.closest('[data-es-print]');
    if (p) { FS.toast('Sent to printer · HP LaserJet (Sales floor)', { tone: 'info' }); }
  });

  /* simulated file pick: returns a fake file chip markup */
  ES.fileChip = function (name, size) {
    var ext = (name.split('.').pop() || '').toLowerCase();
    var ic = /png|jpg|jpeg|heic/.test(ext) ? 'image' : ext === 'pdf' ? 'file-text' : 'paperclip';
    return '<span class="es-file"><i data-lucide="' + ic + '"></i><b>' + ES.esc(name) + '</b><small>' + (size || '214 KB') + '</small><button type="button" class="es-file-x" aria-label="Remove" data-es-file-x><i data-lucide="x"></i></button></span>';
  };
  document.addEventListener('click', function (e) {
    var x = e.target.closest('[data-es-file-x]');
    if (x) { var f = x.closest('.es-file'); if (f) ES.removeAnim(f); }
  });
})();

/* ---------- 01-attendance.js ---------- */
/* ess/attendance: geofence map, selfie check-in, live timer, month calendar with corrections */
(function () {
  var $ = ES.$, $$ = ES.$$;
  var T0 = Date.now();
  var simNow = function () { return new Date(ES.TODAY.getTime() + (Date.now() - T0)); };
  var hm = function (d) { var h = d.getHours(), m = d.getMinutes(); return ES.pad(h % 12 || 12) + ':' + ES.pad(m) + ' ' + (h < 12 ? 'AM' : 'PM'); };
  var dur = function (ms) { var s = Math.max(0, Math.floor(ms / 1000)); return ES.pad(Math.floor(s / 3600)) + ':' + ES.pad(Math.floor(s / 60) % 60) + ':' + ES.pad(s % 60); };
  var st = { state: 'out', inAt: null, outAt: null, dist: 42, month: 8 /* Sep */ };

  /* ---------- month data ---------- */
  var MONTHS = {
    7: { late: { 4: '09:18' }, leave: { 11: 'Annual leave', 12: 'Annual leave', 13: 'Annual leave' }, absent: { 19: 1 }, stats: { ontime: 89, avg: '08:55', ot: '4h 10m', late: 1, present: 16, wd: 19 } },
    8: { late: { 8: '09:22', 17: '09:31' }, leave: { 24: 'Casual leave' }, absent: {}, stats: { ontime: 91, avg: '08:53', ot: '6h 30m', late: 2, present: 21, wd: 22 } },
    9: { late: {}, leave: {}, absent: {}, stats: { ontime: 100, avg: '—', ot: '0h 00m', late: 0, present: 0, wd: 22 } },
  };
  var CORR = {}; /* iso -> pending correction */
  function dayInfo(y, m, d) {
    var dt = new Date(y, m, d), iso = ES.iso(dt), M = MONTHS[m] || MONTHS[8], hol = ES.isHoliday(dt);
    var o = { d: d, iso: iso, dt: dt };
    if (dt > new Date(2026, 9, 1)) { o.s = ES.isWeekend(dt) ? 'w' : hol ? 'h' : 'f'; o.hol = hol; return o; }
    if (iso === '2026-10-01') { o.s = st.state === 'out' && !st.inAt ? 't' : (st.inAt && st.inAt.getHours() * 60 + st.inAt.getMinutes() > 9 * 60 + 15 ? 'lt' : 'p'); o.today = true; if (st.inAt) o.in = hm(st.inAt).replace(' AM', '').replace(' PM', ''); if (st.outAt) o.out = hm(st.outAt).replace(/ [AP]M/, ''); o.src = 'Mobile app · selfie + geofence'; o.loc = 'Lahore HQ · Gulberg III'; return o; }
    if (hol) { o.s = 'h'; o.hol = hol; return o; }
    if (ES.isWeekend(dt)) { o.s = 'w'; return o; }
    if (M.leave[d]) { o.s = 'l'; o.leave = M.leave[d]; return o; }
    if (M.absent[d]) { o.s = 'a'; return o; }
    o.s = M.late[d] ? 'lt' : 'p';
    o.in = M.late[d] || '08:' + ES.pad(44 + (d * 7) % 15);
    o.out = (d % 5 === 2 ? '19:' : '18:') + ES.pad((d * 13) % 45 + 2);
    var mi = (+o.out.slice(0, 2) * 60 + +o.out.slice(3)) - (+o.in.slice(0, 2) * 60 + +o.in.slice(3));
    o.hrs = Math.floor(mi / 60) + 'h ' + ES.pad(mi % 60) + 'm';
    o.ot = mi > 600 ? Math.floor((mi - 540) / 60) + 'h ' + ES.pad((mi - 540) % 60) + 'm' : '';
    o.src = d % 4 === 1 ? 'Mobile app · selfie + geofence' : 'ZKTeco · Main gate';
    o.loc = (m === 8 && d === 25) ? 'Packages Ltd, Kot Lakhpat (field visit)' : 'Lahore HQ · Gulberg III';
    return o;
  }
  var LBL = { p: 'P', lt: 'LT', l: 'L', a: 'A', h: 'H', w: '', f: '', t: '' };
  var NAME = { p: 'Present', lt: 'Late', l: 'Leave', a: 'Absent', h: 'Holiday', w: 'Weekend', f: 'Upcoming', t: 'Today · not checked in' };

  function calHTML(m) {
    var y = 2026, first = new Date(y, m, 1), lead = (first.getDay() + 6) % 7, n = new Date(y, m + 1, 0).getDate(), h = '';
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach(function (d) { h += '<span class="es-at-dow">' + d + '</span>'; });
    for (var i = 0; i < lead; i++) h += '<span class="es-at-cell blank"></span>';
    for (var d = 1; d <= n; d++) {
      var o = dayInfo(y, m, d), k = lead + d - 1;
      h += '<button type="button" class="es-at-cell s-' + o.s + (o.today ? ' today' : '') + (CORR[o.iso] ? ' corr' : '') + '" data-act="day" data-d="' + d + '" style="--i:' + k + '" aria-label="' + ES.dfmt(o.dt, true) + ' · ' + NAME[o.s] + '">' +
        '<b>' + d + '</b>' + (LBL[o.s] ? '<em>' + LBL[o.s] + '</em>' : '') + (o.in ? '<small>' + o.in + '</small>' : o.hol ? '<small>' + o.hol.split(' ')[0] + '</small>' : o.today ? '<small>Today</small>' : '') + '</button>';
    }
    return h;
  }

  /* ---------- geofence map ---------- */
  function mapSVG() {
    return '<svg class="es-at-map" viewBox="0 0 420 250" preserveAspectRatio="xMidYMid slice" aria-label="Geofence map: Lahore HQ, you are inside">' +
      '<rect class="m-bg" width="420" height="250"/>' +
      '<path class="m-park" d="M300 20h90v70h-90z"/><path class="m-park" d="M20 170h70v60H20z"/>' +
      '<path class="m-canal" d="M-10 205 C 90 180, 160 240, 260 210 S 380 170, 440 190"/>' +
      '<g class="m-blk"><rect x="20" y="20" width="80" height="50" rx="6"/><rect x="115" y="20" width="70" height="50" rx="6"/><rect x="200" y="20" width="85" height="50" rx="6"/>' +
      '<rect x="20" y="85" width="80" height="70" rx="6"/><rect x="115" y="85" width="70" height="30" rx="6"/><rect x="115" y="125" width="70" height="30" rx="6"/>' +
      '<rect x="235" y="85" width="50" height="70" rx="6"/><rect x="300" y="105" width="90" height="50" rx="6"/><rect x="105" y="170" width="70" height="22" rx="5"/><rect x="300" y="168" width="90" height="10" rx="4"/></g>' +
      '<g class="m-road"><path d="M0 78h420M0 162h420M108 0v250M193 0v170M292 0v250"/></g>' +
      '<g class="m-road thin"><path d="M228 78v84M108 120h85"/></g>' +
      '<text class="m-lbl" x="122" y="75">MM Alam Rd</text><text class="m-lbl" x="296" y="140" transform="rotate(-90 296 140)">Main Blvd</text><text class="m-lbl" x="320" y="58">Gulberg Park</text>' +
      '<g class="m-fence"><circle class="m-pulse" cx="214" cy="120" r="78"/><circle class="m-pulse p2" cx="214" cy="120" r="78"/><circle class="m-zone" cx="214" cy="120" r="78"/></g>' +
      '<path class="m-path" d="M262 200 C 252 180, 250 160, 240 140"/>' +
      '<g class="m-you"><circle class="m-acc" cx="240" cy="140" r="14"/><circle class="m-dot" cx="240" cy="140" r="6"/></g>' +
      '<g class="m-pin" transform="translate(214 120)"><path d="M0 0 C -12 -14, -14 -20, -14 -26 A 14 14 0 1 1 14 -26 C 14 -20, 12 -14, 0 0z"/><circle cx="0" cy="-26" r="5.5"/></g>' +
      '</svg>';
  }

  /* ---------- selfie modal ---------- */
  function selfie(sec) {
    var el = ES.sheet({
      title: 'Verify it’s you', sub: 'Selfie + geofence check-in · Lahore HQ', cls: 'es-sheet-lg',
      html: '<div class="es-at-selfie"><div class="es-at-cam" data-stage="align" id="es-at-cam">' +
        '<div class="es-at-feed"><svg viewBox="0 0 200 220" aria-hidden="true"><defs><radialGradient id="es-at-g1" cx="50%" cy="38%" r="60%"><stop offset="0" stop-color="currentColor" stop-opacity=".55"/><stop offset="1" stop-color="currentColor" stop-opacity=".12"/></radialGradient></defs>' +
        '<path class="sh" d="M28 220 C 34 170, 66 152, 100 152 C 134 152, 166 170, 172 220z"/><ellipse class="hd" cx="100" cy="92" rx="38" ry="47"/><path class="hr" d="M62 84 C 60 50, 84 38, 104 40 C 128 42, 142 58, 138 86 C 132 70, 116 62, 100 64 C 84 64, 70 70, 62 84z"/></svg></div>' +
        '<div class="es-at-oval"><i class="es-at-laser"></i></div>' +
        '<div class="es-at-mesh">' + Array.from({ length: 22 }, function (_, i) { var a = i / 22 * Math.PI * 2, r = 30 + (i % 3) * 12; return '<i style="--x:' + (50 + Math.cos(a) * r * .55).toFixed(1) + '%;--y:' + (45 + Math.sin(a) * r * .75).toFixed(1) + '%;--i:' + i + '"></i>'; }).join('') + '</div>' +
        '<span class="es-at-cn tl"></span><span class="es-at-cn tr"></span><span class="es-at-cn bl"></span><span class="es-at-cn br"></span>' +
        '<div class="es-at-cam-top"><span class="es-at-live"><i></i>LIVE</span><span>Front camera · 1080p</span></div>' +
        '<div class="es-at-cam-msg" id="es-at-msg">Position your face inside the oval</div>' +
        '<div class="es-at-match"><span><i data-lucide="scan-face"></i></span><div><b>Face matched <em id="es-at-pct">0</em>%</b><small>vs HR profile photo · liveness passed</small></div></div>' +
        '</div>' +
        '<ul class="es-at-checks" id="es-at-checks">' +
        [['scan-face', 'Face detected', 'Single face, good lighting'], ['eye', 'Liveness check', 'Blink once when asked'], ['user-check', 'Identity match', 'Compared with HR photo'], ['map-pin', 'Inside geofence', 'You are 42 m inside · ±6 m GPS']].map(function (c, i) {
          return '<li data-k="' + i + '"><span class="es-at-ck"><i data-lucide="' + c[0] + '"></i></span><div><b>' + c[1] + '</b><small>' + c[2] + '</small></div><span class="es-at-ck-s"><span class="es-spin"></span><i data-lucide="check"></i></span></li>';
        }).join('') + '</ul></div>',
      foot: '<button class="btn secondary" data-close>Cancel</button><button class="btn primary" id="es-at-confirm" disabled><i data-lucide="fingerprint"></i>Confirm check-in</button>',
    });
    var cam = $('#es-at-cam', el), msg = $('#es-at-msg', el), checks = $$('#es-at-checks li', el), btn = $('#es-at-confirm', el);
    var ck = function (i, s) { checks[i].className = s; };
    var alive = function () { return el.isConnected; };
    var seq = [
      [700, function () { cam.dataset.stage = 'scan'; msg.textContent = 'Hold still… scanning'; ck(0, 'run'); }],
      [1000, function () { ck(0, 'ok'); ck(1, 'run'); cam.dataset.stage = 'blink'; msg.textContent = 'Blink once'; }],
      [900, function () { ck(1, 'ok'); ck(2, 'run'); cam.dataset.stage = 'match'; msg.textContent = 'Matching with your profile…'; }],
      [900, function () {
        ck(2, 'ok'); ck(3, 'run'); cam.dataset.stage = 'done'; msg.textContent = 'Verified';
        var p = $('#es-at-pct', el), t0 = performance.now();
        (function f(now) { var k = Math.min(1, (now - t0) / 700); p.textContent = Math.round(98 * (1 - Math.pow(1 - k, 3))); if (k < 1 && alive()) requestAnimationFrame(f); })(t0);
      }],
      [500, function () { ck(3, 'ok'); btn.disabled = false; btn.focus(); }],
    ];
    var i = 0;
    (function next() { if (i >= seq.length || !alive()) return; var s = seq[i++]; setTimeout(function () { if (alive()) { s[1](); next(); } }, s[0]); })();
    btn.addEventListener('click', function () {
      ES.busy(btn, 700, 'Checking in…').then(function () {
        ES.closeSheet(el);
        st.state = 'in'; st.inAt = simNow(); st.outAt = null;
        paintPunch(sec); paintCal(sec);
        ES.celebrate($('.es-at-btn', sec));
        FS.toast('Checked in at ' + hm(st.inAt) + ' · face matched 98% · 42 m inside geofence', { tone: 'good' });
      });
    });
  }

  /* ---------- punch card ---------- */
  function paintPunch(sec) {
    var card = $('.es-at-punch', sec); if (!card) return;
    card.dataset.state = st.state;
    var lbl = { out: ['Check in', 'Selfie + geofence'], in: ['Check out', 'Tap when you leave'], done: ['Done for today', 'See you tomorrow'] }[st.state];
    $('.es-at-btn b', card).textContent = lbl[0]; $('.es-at-btn small', card).textContent = lbl[1];
    $('.es-at-btn', card).disabled = st.state === 'done';
    $('#es-at-chip', sec).innerHTML = st.state === 'out' ? '<i></i>Not checked in' : st.state === 'in' ? '<i></i>On the clock' : '<i></i>Shift complete';
    $('#es-at-in', sec).textContent = st.inAt ? hm(st.inAt) : '—';
    $('#es-at-out', sec).textContent = st.outAt ? hm(st.outAt) : '—';
    tick(sec);
  }
  function tick(sec) {
    var now = simNow();
    var c = $('#es-at-clock', sec); if (!c) return;
    c.innerHTML = hm(now).replace(/ ([AP]M)/, '<small>$1</small>');
    var t = $('#es-at-timer', sec), sub = $('#es-at-timer-sub', sec);
    if (st.inAt) {
      var end = st.outAt || now, ms = end - st.inAt;
      t.textContent = dur(ms);
      sub.textContent = st.outAt ? 'Worked today' : 'Since check-in at ' + hm(st.inAt);
      $('#es-at-worked', sec).textContent = Math.floor(ms / 3600000) + 'h ' + ES.pad(Math.floor(ms / 60000) % 60) + 'm';
    } else {
      var late = Math.floor((now - new Date(2026, 9, 1, 9, 0)) / 60000);
      t.textContent = '00:00:00';
      sub.textContent = late > 0 ? (late <= 15 ? 'Shift started ' + late + ' min ago · within 15 min grace' : 'You are ' + late + ' min late') : 'Shift starts at 09:00';
    }
    var sh = (now - new Date(2026, 9, 1, 9, 0)) / (9 * 3600000);
    var ring = $('.es-at-btn-ring', sec); if (ring) ES.setRing(ring, Math.max(2, Math.min(100, sh * 100)));
  }

  /* ---------- calendar + popover ---------- */
  function paintCal(sec) {
    var g = $('#es-at-cal', sec); g.innerHTML = calHTML(st.month);
    $('#es-at-mtitle', sec).textContent = ES.MONTH[st.month] + ' 2026';
    $$('[data-act=mprev],[data-act=mnext]', sec).forEach(function (b) { b.disabled = (b.dataset.act === 'mprev' && st.month <= 7) || (b.dataset.act === 'mnext' && st.month >= 9); });
    var s = (MONTHS[st.month] || MONTHS[8]).stats;
    ES.setRing($('#es-at-ontime', sec), s.ontime); $('#es-at-ontime .es-ring-in', sec).firstChild.nodeValue = s.ontime + '%';
    $('#es-at-s-avg', sec).textContent = s.avg; $('#es-at-s-ot', sec).textContent = s.ot;
    $('#es-at-s-late', sec).textContent = s.late; $('#es-at-s-pres', sec).textContent = s.present + ' / ' + s.wd;
    closePop();
  }
  var pop = null;
  function closePop() { if (pop) { pop.remove(); pop = null; } }
  function openPop(sec, btn) {
    closePop();
    var o = dayInfo(2026, st.month, +btn.dataset.d);
    var tone = { p: 'good', lt: 'warn', l: 'info', a: 'danger', h: 'violet', w: 'neutral', f: 'neutral', t: 'warn' }[o.s];
    pop = document.createElement('div');
    pop.className = 'es-at-pop';
    pop.innerHTML = '<div class="es-head"><div><h3>' + ES.dfmt(o.dt, true) + '</h3><p>' + (o.hol || o.leave || (o.s === 'w' ? 'Weekly off' : 'General shift 09:00 – 18:00')) + '</p></div><span class="spacer"></span><span class="badge dot ' + tone + '">' + NAME[o.s] + '</span></div>' +
      (o.in ? '<div class="es-at-pop-grid"><div><span>Check in</span><b>' + o.in + '</b></div><div><span>Check out</span><b>' + (o.out || '—') + '</b></div><div><span>Worked</span><b>' + (o.hrs || '—') + '</b></div><div><span>Overtime</span><b>' + (o.ot || '—') + '</b></div></div>' +
        '<div class="es-at-pop-src"><i data-lucide="map-pin"></i>' + o.loc + '<span>·</span><i data-lucide="smartphone"></i>' + o.src + '</div>' : '') +
      (o.s === 'a' ? '<div class="banner danger es-at-pop-ban"><i data-lucide="circle-alert"></i><div><b>No punch recorded</b><p>Marked as loss of pay unless regularised.</p></div></div>' : '') +
      (CORR[o.iso] ? '<div class="es-at-pop-corr"><i data-lucide="hourglass"></i>Correction pending with Zainab Raza</div>' : '') +
      (['p', 'lt', 'a', 't'].indexOf(o.s) > -1 && !CORR[o.iso] ? '<button type="button" class="btn secondary sm" data-act="popcorr" data-iso="' + o.iso + '"><i data-lucide="calendar-clock"></i>Request correction</button>' : '');
    sec.appendChild(pop);
    FS.icons(pop);
    var r = btn.getBoundingClientRect(), sr = sec.getBoundingClientRect(), w = pop.offsetWidth;
    var left = Math.max(8, Math.min(r.left - sr.left + r.width / 2 - w / 2, sec.clientWidth - w - 8));
    var ph = pop.offsetHeight, above = r.bottom + ph + 12 > innerHeight && r.top - ph - 12 > 70;
    pop.classList.toggle('above', above);
    pop.style.left = left + 'px'; pop.style.top = (above ? r.top - sr.top - ph - 8 : r.bottom - sr.top + 8) + 'px';
    var pr = pop.getBoundingClientRect(); if (pr.bottom > innerHeight - 8) scrollBy({ top: pr.bottom - innerHeight + 16, behavior: 'smooth' });
    pop.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act=popcorr]'); if (b) { e.stopPropagation(); closePop(); correction(sec, b.dataset.iso); }
    });
  }

  /* ---------- correction sheet ---------- */
  var REQS = [
    { id: 'AC-2026-0104', d: '2026-09-17', type: 'Late arrival', time: '08:30 (client visit)', reason: 'Client meeting at Lucky Cement, DHA Phase 5 from 08:30', st: 'Pending' },
    { id: 'AC-2026-0091', d: '2026-09-03', type: 'Missed punch-in', time: 'In 08:50', reason: 'Phone battery died at the gate; reached 08:50', st: 'Approved' },
    { id: 'AC-2026-0077', d: '2026-08-21', type: 'On-duty / field visit', time: '09:00 – 17:30', reason: 'Market survey — Hall Road distributors', st: 'Approved' },
    { id: 'AC-2026-0063', d: '2026-08-19', type: 'Missed punch-in', time: 'In 09:05', reason: 'Forgot to punch', st: 'Rejected', note: 'No gate CCTV entry found' },
  ];
  CORR['2026-09-17'] = 1;
  function correction(sec, iso) {
    iso = iso || '2026-09-17';
    var el = ES.sheet({
      title: 'Request correction', sub: 'Goes to Zainab Raza · SLA 24 h', cls: 'es-at-corr-sheet',
      html: '<div class="es-at-form">' +
        '<label class="es-field"><span>Date</span><input type="date" id="es-at-c-date" value="' + iso + '" min="2026-08-01" max="2026-10-01"></label>' +
        '<div class="es-field"><span>What happened?</span><div class="es-opts" id="es-at-c-type">' +
        [['log-in', 'Missed punch-in'], ['log-out', 'Missed punch-out'], ['clock-alert', 'Late arrival'], ['briefcase', 'On-duty / field visit'], ['house', 'Work from home']].map(function (t, i) { return '<button type="button" class="es-opt ' + (i === 2 ? 'on' : '') + '" data-t="' + t[1] + '"><i data-lucide="' + t[0] + '"></i>' + t[1] + '</button>'; }).join('') + '</div></div>' +
        '<div class="es-at-2"><label class="es-field"><span>Actual check in</span><input type="time" id="es-at-c-in" value="08:30"></label><label class="es-field"><span>Actual check out</span><input type="time" id="es-at-c-out" value="18:05"></label></div>' +
        '<label class="es-field"><span>Reason *</span><textarea rows="3" id="es-at-c-reason" placeholder="e.g. Client meeting at Lucky Cement from 08:30"></textarea></label>' +
        '<div class="es-field"><span>Attachment</span><div class="es-drop" data-act="cfile" tabindex="0"><i data-lucide="upload-cloud"></i><div><b>Add proof</b> · visit report, gate pass or photo<br><small class="es-hint">PDF, JPG up to 5 MB</small></div></div><div class="es-files" id="es-at-c-files"></div></div>' +
        '<div class="es-at-c-flow">' + ES.tracker(['Submitted', 'Manager', 'Attendance updated'], 0, 'ok', ['Now', 'Zainab Raza', 'Auto']) + '</div></div>',
      foot: '<button class="btn secondary" data-close>Cancel</button><button class="btn primary" id="es-at-c-go"><i data-lucide="send"></i>Submit request</button>',
    });
    var type = 'Late arrival';
    el.addEventListener('click', function (e) {
      var o = e.target.closest('#es-at-c-type .es-opt');
      if (o) { $$('#es-at-c-type .es-opt', el).forEach(function (b) { b.classList.toggle('on', b === o); }); type = o.dataset.t; }
      if (e.target.closest('[data-act=cfile]')) { var f = $('#es-at-c-files', el); f.insertAdjacentHTML('beforeend', ES.fileChip('visit-report-' + ($('#es-at-c-date', el).value || '').slice(5) + '.pdf', '186 KB')); FS.icons(f); }
    });
    $('#es-at-c-go', el).addEventListener('click', function () {
      var reason = $('#es-at-c-reason', el), d = $('#es-at-c-date', el).value;
      if (!reason.value.trim()) { reason.classList.add('es-at-err'); reason.focus(); reason.placeholder = 'Please add a reason for your manager'; setTimeout(function () { reason.classList.remove('es-at-err'); }, 600); return; }
      ES.busy(this, 900, 'Submitting…').then(function () {
        ES.closeSheet(el);
        var id = 'AC-2026-0' + (105 + Object.keys(CORR).length);
        REQS.unshift({ id: id, d: d, type: type, time: (type === 'Missed punch-out' ? 'Out ' : 'In ') + $('#es-at-c-in', el).value, reason: reason.value.trim(), st: 'Pending', fresh: true });
        CORR[d] = 1;
        var mm = ES.parse(d).getMonth(); if (mm >= 7 && mm <= 9) st.month = mm;
        paintCal(sec); paintReqs(sec);
        ES.celebrate($('#es-at-reqs', sec));
        FS.toast(id + ' sent to Zainab Raza for ' + ES.dfmt(d), { tone: 'good' });
      });
    });
  }
  function paintReqs(sec) {
    var tb = $('#es-at-reqs tbody', sec);
    tb.innerHTML = REQS.map(function (r) {
      return '<tr class="' + (r.fresh ? 'row-flash' : '') + '" data-id="' + r.id + '"><td><b>' + r.id + '</b><small>' + ES.dfmt(r.d, true) + '</small></td><td>' + r.type + '<small>' + r.time + '</small></td><td class="es-at-reason">' + ES.esc(r.reason) + (r.note ? '<small class="es-down">' + r.note + '</small>' : '') + '</td>' +
        '<td><div class="cell-user">' + ES.av('Zainab Raza', 'xs') + '<span>Zainab Raza</span></div></td><td>' + ES.badge(r.st) + '</td>' +
        '<td class="right">' + (r.st === 'Pending' ? '<button type="button" class="btn ghost sm" data-act="withdraw">Withdraw</button>' : '') + '</td></tr>';
    }).join('');
    REQS.forEach(function (r) { r.fresh = false; });
    $('#es-at-req-count', sec).textContent = REQS.filter(function (r) { return r.st === 'Pending'; }).length + ' pending';
    FS.icons(tb);
  }

  ES.route('ess/attendance', {
    render: function () {
      return '<div class="es-grid es-at-top">' +
        /* geofence */
        '<div class="es-card flush es-at-geo"><div class="es-head"><div><h3>Geofence</h3><p>Lahore HQ · Gulberg III · 150 m radius</p></div><span class="spacer"></span><button type="button" class="btn secondary sm" data-act="locate"><i data-lucide="locate-fixed"></i>Re-locate</button></div>' +
        '<div class="es-at-mapwrap">' + mapSVG() +
        '<span class="es-at-inside" id="es-at-inside"><i data-lucide="shield-check"></i>You are <b id="es-at-dist">42</b> m inside</span>' +
        '<span class="es-at-hq"><i data-lucide="building-2"></i>Al-Noor HQ</span>' +
        '<div class="es-at-mapchips"><span class="pill"><i data-lucide="satellite"></i>GPS <b>±6 m</b></span><span class="pill"><i data-lucide="wifi"></i>AlNoor-Staff</span><span class="pill"><i data-lucide="shield"></i>Mock location <b class="up">off</b></span></div></div></div>' +
        /* punch */
        '<div class="es-card es-at-punch" data-state="out"><div class="es-head"><h3>Today</h3><span class="es-label">Thu, 01 Oct 2026</span><span class="spacer"></span><span class="es-at-chip" id="es-at-chip"><i></i>Not checked in</span></div>' +
        '<div class="es-at-punch-body"><div class="es-at-btnwrap">' + ES.ring(1, { size: 196, stroke: 1.6, cls: 'es-at-btn-ring', label: '', tone: 'var(--lime)' }) +
        '<button type="button" class="es-at-btn" data-act="punch"><i data-lucide="fingerprint"></i><b>Check in</b><small>Selfie + geofence</small></button></div>' +
        '<div class="es-at-time"><span class="es-label">Local time</span><div class="es-at-clock" id="es-at-clock">09:04<small>AM</small></div>' +
        '<span class="es-label">Timer</span><div class="es-at-timer" id="es-at-timer">00:00:00</div><span class="es-at-timer-sub" id="es-at-timer-sub">Shift started 4 min ago</span></div></div>' +
        '<div class="es-at-log"><div><span>Check in</span><b id="es-at-in">—</b></div><div><span>Check out</span><b id="es-at-out">—</b></div><div><span>Worked</span><b id="es-at-worked">0h 00m</b></div></div></div>' +
        '</div>' +
        /* calendar + stats */
        '<div class="es-grid es-main">' +
        '<div class="es-card es-at-calcard"><div class="es-head"><h3 id="es-at-mtitle">September 2026</h3><span class="spacer"></span>' +
        '<div class="es-at-legend"><span><i class="s-p"></i>P</span><span><i class="s-lt"></i>LT</span><span><i class="s-l"></i>L</span><span><i class="s-a"></i>A</span><span><i class="s-h"></i>H</span></div>' +
        '<div class="es-row"><button type="button" class="icon-btn-sm" data-act="mprev" aria-label="Previous month"><i data-lucide="chevron-left"></i></button><button type="button" class="icon-btn-sm" data-act="mnext" aria-label="Next month"><i data-lucide="chevron-right"></i></button></div></div>' +
        '<div class="es-at-cal" id="es-at-cal"></div><p class="es-hint es-at-calhint"><i data-lucide="mouse-pointer-click"></i>Tap a day for punch details or to request a correction.</p></div>' +
        '<div class="es-col"><div class="es-card"><div class="es-head"><h3>Month at a glance</h3></div>' +
        '<div class="es-at-glance">' + ES.ring(91, { size: 108, stroke: 3.4, label: '91%', sub: 'On time', cls: '', tone: 'var(--primary)' }).replace('class="es-ring ', 'id="es-at-ontime" class="es-ring ') +
        '<div class="es-at-glance-r"><div><span>Present</span><b id="es-at-s-pres">21 / 22</b></div><div><span>Late marks</span><b id="es-at-s-late">2</b><small>3rd late = ½ day</small></div></div></div>' +
        '<div class="es-stats"><div class="es-stat"><span>Avg check-in</span><b id="es-at-s-avg">08:53</b><small>Shift 09:00</small></div><div class="es-stat"><span>Overtime</span><b id="es-at-s-ot">6h 30m</b><small>Approved</small></div></div></div>' +
        '<div class="es-card es-at-week"><div class="es-head"><h3>Hours · last 7 days</h3></div><div class="es-at-wbars">' +
        [['Thu', 9.2], ['Fri', 9.3], ['Mon', 9.3], ['Tue', 10.7], ['Wed', 9.5], ['Thu', 9.4], ['Fri', 9.1]].map(function (b, i) { return '<div style="--h:' + (b[1] / 11 * 100) + '%;--i:' + i + '" data-tip="' + b[1] + ' h"><i class="' + (b[1] > 10 ? 'ot' : '') + '"></i><span>' + b[0] + '</span></div>'; }).join('') +
        '</div><div class="es-at-target"><span>9 h target</span></div></div></div></div>' +
        /* requests */
        '<div class="es-card flush" id="es-at-reqs"><div class="es-head"><div><h3>My correction requests</h3><p id="es-at-req-count"></p></div><span class="spacer"></span><button type="button" class="btn secondary sm" data-act="correct"><i data-lucide="plus"></i>New request</button></div>' +
        '<div class="table-wrap"><table class="tbl" data-plain><thead><tr><th>Request</th><th>Type</th><th>Reason</th><th>Approver</th><th>Status</th><th></th></tr></thead><tbody></tbody></table></div></div>';
    },
    bind: function (sec) {
      paintCal(sec); paintReqs(sec); paintPunch(sec);
      setInterval(function () { if (sec.classList.contains('active') || sec.offsetParent) tick(sec); }, 1000);
      ES.acts(sec, {
        punch: function () {
          if (st.state === 'out') return selfie(sec);
          if (st.state === 'in') {
            ES.confirm({ title: 'Check out now?', text: 'You have worked ' + $('#es-at-worked', sec).textContent + ' today. Your shift ends at 06:00 PM.', okLabel: 'Check out' }).then(function (ok) {
              if (!ok) return;
              st.state = 'done'; st.outAt = simNow(); paintPunch(sec); paintCal(sec);
              ES.celebrate($('.es-at-btn', sec));
              FS.toast('Checked out at ' + hm(st.outAt) + '. Have a good evening, Bilal!', { tone: 'good', undo: function () { st.state = 'in'; st.outAt = null; paintPunch(sec); } });
            });
          }
        },
        locate: function (b) {
          var m = $('.es-at-mapwrap', sec); m.classList.remove('locating'); void m.offsetWidth; m.classList.add('locating');
          ES.busy(b, 900, 'Locating…').then(function () { st.dist = 38 + Math.round(Math.random() * 8); ES.tick($('#es-at-dist', sec), st.dist, { dec: 0 }); FS.toast('Location refreshed · ' + st.dist + ' m inside the geofence', { tone: 'info', ms: 2000 }); });
        },
        day: function (b, e) { e.stopPropagation(); openPop(sec, b); },
        mprev: function () { st.month = Math.max(7, st.month - 1); paintCal(sec); ES.stagger($$('.es-at-cell', sec)); },
        mnext: function () { st.month = Math.min(9, st.month + 1); paintCal(sec); ES.stagger($$('.es-at-cell', sec)); },
        correct: function () { correction(sec); },
        withdraw: function (b) {
          var tr = b.closest('tr'), r = REQS.find(function (x) { return x.id === tr.dataset.id; });
          ES.confirm({ title: 'Withdraw ' + r.id + '?', text: 'Your manager will no longer see this request.', okLabel: 'Withdraw', danger: true }).then(function (ok) {
            if (!ok) return; r.st = 'Withdrawn'; delete CORR[r.d]; paintReqs(sec); paintCal(sec); FS.toast(r.id + ' withdrawn', { tone: 'info' });
          });
        },
        export: function (b) { ES.busy(b, 800, 'Exporting…').then(function () { FS.toast('Attendance_' + ES.MONTH[st.month] + '_2026_EMP-0042.xlsx downloaded', { tone: 'good' }); }); },
      });
      document.addEventListener('click', function (e) { if (pop && !e.target.closest('.es-at-pop') && !e.target.closest('.es-at-cell')) closePop(); });
      addEventListener('resize', closePop);
    },
    enter: function (sec) { tick(sec); },
  });
})();

/* ---------- 02-leave.js ---------- */
/* ess/leave: balance rings, apply sheet with live working days + balance preview, team calendar, request trackers */
(function () {
  var $ = ES.$, $$ = ES.$$;
  var TYPES = [
    { k: 'annual', n: 'Annual leave', ic: 'plane', ent: 14, used: 5, tone: 'var(--primary)', meta: 'Accrues 1.17 / month' },
    { k: 'casual', n: 'Casual leave', ic: 'sun', ent: 10, used: 5, tone: 'var(--info)', meta: 'Last used 24 Sep' },
    { k: 'sick', n: 'Sick leave', ic: 'thermometer', ent: 8, used: 2, tone: 'var(--violet)', meta: 'Certificate if > 2 days' },
    { k: 'comp', n: 'Comp-off', ic: 'repeat', ent: 1, used: 0, tone: 'var(--orange)', meta: 'Expires 31 Oct 2026', warn: true },
  ];
  var UNPAID = { k: 'unpaid', n: 'Unpaid leave', ic: 'wallet', ent: Infinity, used: 0 };
  var typeOf = function (k) { return TYPES.find(function (t) { return t.k === k; }) || UNPAID; };
  var STEPS = ['Submitted', 'Manager', 'HR', 'Approved'];
  var REQ = [
    { id: 'LR-2026-0441', type: 'annual', from: '2026-10-12', to: '2026-10-14', days: 3, reason: 'Sister’s wedding in Sialkot', st: 'Pending', at: 1, applied: '28 Sep', hand: 'Hamza Butt' },
    { id: 'LR-2026-0437', type: 'casual', from: '2026-10-16', to: '2026-10-16', days: 0.5, half: 'Second half', reason: 'Parent-teacher meeting, Beaconhouse Johar Town', st: 'Approved', at: 4, applied: '22 Sep', hand: 'Imran Siddiqui' },
    { id: 'LR-2026-0418', type: 'casual', from: '2026-09-24', to: '2026-09-24', days: 1, reason: 'Bank work — car loan documents', st: 'Approved', at: 4, applied: '21 Sep' },
    { id: 'LR-2026-0351', type: 'annual', from: '2026-08-11', to: '2026-08-14', days: 3, reason: 'Family trip to Murree (14 Aug holiday excluded)', st: 'Approved', at: 4, applied: '30 Jul' },
    { id: 'LR-2026-0302', type: 'sick', from: '2026-07-08', to: '2026-07-09', days: 2, reason: 'Fever', st: 'Approved', at: 4, applied: '08 Jul' },
    { id: 'LR-2026-0277', type: 'annual', from: '2026-06-22', to: '2026-06-26', days: 5, reason: 'Eid ul Adha travel to Peshawar', st: 'Rejected', at: 1, applied: '02 Jun', note: 'Quarter-end close — please re-plan for July' },
  ];
  var TEAMOUT = [
    { n: 'Hamza Butt', from: '2026-09-28', to: '2026-10-03', t: 'Annual' },
    { n: 'Tanveer Hassan', from: '2026-10-05', to: '2026-10-06', t: 'Casual · pending' },
    { n: 'Fatima Noor', from: '2026-10-20', to: '2026-10-21', t: 'Casual' },
    { n: 'Mehwish Tariq', from: '2026-10-27', to: '2026-10-27', t: 'Sick (planned)' },
    { n: 'Imran Siddiqui', from: '2026-10-29', to: '2026-10-30', t: 'Annual' },
  ];
  var TODAY = '2026-10-01';
  var booked = function (k) { return REQ.filter(function (r) { return r.type === k && (r.st === 'Pending' || (r.st === 'Approved' && r.from > TODAY)); }).reduce(function (s, r) { return s + r.days; }, 0); };
  var avail = function (t) { return t.ent - t.used; };
  var free = function (t) { return avail(t) - booked(t.k); };
  var fmtD = function (n) { return (Math.round(n * 10) / 10).toString(); };
  var range = function (r) { return r.from === r.to ? ES.dfmt(r.from, true) : ES.dshort(r.from) + ' – ' + ES.dfmt(r.to); };
  var filt = 'all';

  function balCard(t, i) {
    var f = free(t), b = booked(t.k);
    return '<div class="es-card es-lv-bal" data-k="' + t.k + '" style="--i:' + i + '"><div class="es-head"><span class="icon-tile" style="--tc:' + t.tone + '"><i data-lucide="' + t.ic + '"></i></span><div><h3>' + t.n + '</h3><p>' + t.meta + '</p></div></div>' +
      '<div class="es-lv-bal-body">' + ES.ring(f / t.ent * 100, { size: 92, stroke: 3.4, tone: t.tone, label: '<span class="es-lv-free">' + fmtD(f) + '</span>', sub: 'of ' + t.ent }) +
      '<div class="es-lv-bal-r"><div><span>Used</span><b>' + fmtD(t.used) + '</b></div><div><span>Booked</span><b class="' + (b ? 'es-lv-bk' : '') + '">' + fmtD(b) + '</b></div>' +
      (t.warn ? '<span class="badge warn dot">30 days left</span>' : '<button type="button" class="es-link" data-act="apply" data-type="' + t.k + '">Apply<i data-lucide="arrow-right"></i></button>') + '</div></div></div>';
  }
  function paintBal(sec) {
    var host = $('#es-lv-bals', sec);
    host.innerHTML = TYPES.map(balCard).join('');
    FS.icons(host); ES.animRings(host);
    var tot = TYPES.slice(0, 2).reduce(function (s, t) { return s + free(t); }, 0);
    var h = $('#es-lv-avail', sec); if (h) ES.tick(h, tot, { dec: tot % 1 ? 1 : 0 });
  }

  function reqCard(r, i) {
    var t = typeOf(r.type), rej = r.st === 'Rejected', can = r.st === 'Withdrawn' || r.st === 'Cancelled';
    var hr = r.days > 3;
    var subs = ['You · ' + r.applied, 'Zainab Raza', hr ? 'Ayesha Noor' : 'Notified only', r.st === 'Approved' ? 'Done' : ''];
    var at = r.st === 'Approved' ? 4 : r.at;
    var action = r.st === 'Pending' ? '<button type="button" class="btn ghost sm" data-act="withdraw"><i data-lucide="undo-2"></i>Withdraw</button>'
      : (r.st === 'Approved' && r.from > TODAY) ? '<button type="button" class="btn ghost sm es-lv-cancel" data-act="cancel"><i data-lucide="calendar-x"></i>Cancel leave</button>' : '';
    return '<article class="es-lv-req es-in ' + (r.fresh ? 'fresh' : '') + '" data-id="' + r.id + '" data-st="' + r.st.toLowerCase() + '" style="--i:' + i + '">' +
      '<div class="es-lv-req-top"><span class="icon-tile" style="--tc:' + (t.tone || 'var(--muted)') + '"><i data-lucide="' + t.ic + '"></i></span>' +
      '<div class="es-lv-req-t"><b>' + t.n + ' · ' + fmtD(r.days) + (r.days === 1 ? ' day' : ' days') + (r.half ? ' <span class="pill">' + r.half + '</span>' : '') + '</b><small>' + range(r) + ' · ' + r.id + '</small></div>' +
      ES.badge(r.st) + '</div>' +
      '<p class="es-lv-reason">“' + ES.esc(r.reason) + '”' + (r.hand ? ' <span>· handover to ' + r.hand + '</span>' : '') + '</p>' +
      ES.tracker(STEPS, at, rej ? 'rej' : can ? 'cancel' : 'ok', subs) +
      (r.note ? '<div class="es-lv-note"><i data-lucide="message-square-warning"></i>' + r.note + '</div>' : '') +
      (action ? '<div class="es-lv-req-acts">' + action + '</div>' : '') + '</article>';
  }
  function paintReqs(sec) {
    var host = $('#es-lv-reqs', sec);
    var list = REQ.filter(function (r) { return filt === 'all' || r.st.toLowerCase() === filt; });
    host.innerHTML = list.length ? list.map(reqCard).join('') : '<div class="es-empty"><span class="icon-tile"><i data-lucide="inbox"></i></span><b>No ' + filt + ' requests</b><span>Try another filter.</span></div>';
    REQ.forEach(function (r) { r.fresh = false; });
    $$('[data-lf]', sec).forEach(function (b) { var f = b.dataset.lf; b.querySelector('i').textContent = REQ.filter(function (r) { return f === 'all' || r.st.toLowerCase() === f; }).length; });
    FS.icons(host);
  }

  function teamCal(sec) {
    var host = $('#es-lv-tcal', sec), y = 2026, m = 9, lead = (new Date(y, m, 1).getDay() + 6) % 7, n = 31, h = '';
    ['M', 'T', 'W', 'T', 'F', 'S', 'S'].forEach(function (d) { h += '<span class="es-lv-dow">' + d + '</span>'; });
    for (var i = 0; i < lead; i++) h += '<span></span>';
    var all = TEAMOUT.concat(REQ.filter(function (r) { return (r.st === 'Pending' || r.st === 'Approved') && r.to >= '2026-10-01' && r.from <= '2026-10-31'; }).map(function (r) { return { n: 'Bilal Khan', from: r.from, to: r.to, t: typeOf(r.type).n + (r.st === 'Pending' ? ' · pending' : ''), me: true }; }));
    for (var d = 1; d <= n; d++) {
      var dt = new Date(y, m, d), iso = ES.iso(dt), wk = ES.isWeekend(dt);
      var out = wk ? [] : all.filter(function (p) { return p.from <= iso && p.to >= iso; });
      h += '<div class="es-lv-tday ' + (wk ? 'wk' : '') + (iso === TODAY ? ' today' : '') + (out.length > 1 ? ' busy' : '') + '"><b>' + d + '</b><div class="es-lv-avs">' +
        out.slice(0, 3).map(function (p) { return '<span class="es-lv-av' + (p.me ? ' me' : '') + '" data-tip="' + p.n + (p.me ? ' (you)' : '') + ' · ' + p.t + '">' + ES.av(p.n, 'xs') + '</span>'; }).join('') +
        (out.length > 3 ? '<span class="es-lv-more">+' + (out.length - 3) + '</span>' : '') + '</div></div>';
    }
    host.innerHTML = h;
    var list = $('#es-lv-out', sec);
    list.innerHTML = all.filter(function (p) { return p.to >= TODAY; }).sort(function (a, b) { return a.from < b.from ? -1 : 1; }).map(function (p) {
      var cur = p.from <= TODAY && p.to >= TODAY;
      return '<div class="es-lv-outrow">' + ES.av(p.n, 'sm') + '<div><b>' + p.n + (p.me ? ' <span class="es-muted">(you)</span>' : '') + '</b><small>' + (p.from === p.to ? ES.dshort(p.from) : ES.dshort(p.from) + ' – ' + ES.dshort(p.to)) + ' · ' + p.t + '</small></div>' + (cur ? '<span class="badge warn dot">Out today</span>' : '') + '</div>';
    }).join('');
  }

  /* ---------- apply sheet ---------- */
  function apply(sec, preType) {
    var type = preType || 'annual';
    var colleagues = ES.PEOPLE.filter(function (p) { return p.name !== 'Bilal Khan'; }).map(function (p) { return { name: p.name, sub: p.role + ' · ' + p.branch }; });
    var el = ES.sheet({
      title: 'Apply for leave', sub: 'Zainab Raza approves · HR joins for more than 3 days', cls: 'es-sheet-lg',
      html: '<div class="es-lv-form">' +
        '<div class="es-field"><span>Leave type</span><div class="es-lv-types" id="es-lv-types">' + TYPES.concat([UNPAID]).map(function (t) {
          return '<button type="button" class="es-opt ' + (t.k === type ? 'on' : '') + '" data-t="' + t.k + '"><i data-lucide="' + t.ic + '"></i><span>' + t.n.replace(' leave', '') + '<small>' + (t.k === 'unpaid' ? 'No limit' : fmtD(free(t)) + ' left') + '</small></span></button>';
        }).join('') + '</div></div>' +
        '<div class="es-lv-dates"><label class="es-field"><span>From</span><input type="date" id="es-lv-from" value="2026-10-19" min="2026-10-01"></label>' +
        '<label class="es-field"><span>To</span><input type="date" id="es-lv-to" value="2026-10-21" min="2026-10-01"></label>' +
        '<div class="es-lv-wd"><b id="es-lv-days">3</b><span id="es-lv-dayslbl">working days</span></div></div>' +
        '<div class="es-lv-range" id="es-lv-range"></div>' +
        '<div class="es-lv-half"><label class="switch"><input type="checkbox" id="es-lv-half"><i></i><span>Half day</span></label><div class="seg" id="es-lv-halfseg"><button type="button" class="active" data-h="First half">First half</button><button type="button" data-h="Second half">Second half</button></div><span class="es-hint">Applies to the last day</span></div>' +
        /* live balance preview */
        '<div class="es-lv-preview" id="es-lv-prev"><div class="es-lv-prev-top"><div><span class="es-cap">Balance after this request</span><div class="es-lv-after"><b id="es-lv-after">6</b><span id="es-lv-unit">days</span><em id="es-lv-from-bal">from 9</em></div></div><div class="es-lv-prev-msg" id="es-lv-msg"></div></div>' +
        '<div class="es-lv-meter" id="es-lv-meter"><i class="u"></i><i class="b"></i><i class="r"></i><i class="n"></i></div>' +
        '<div class="es-lv-mlegend"><span><i class="u"></i>Used <b id="es-lv-m-u">5</b></span><span><i class="b"></i>Booked <b id="es-lv-m-b">3</b></span><span><i class="r"></i>This request <b id="es-lv-m-r">3</b></span><span><i class="n"></i>Left <b id="es-lv-m-n">3</b></span></div></div>' +
        '<label class="es-field"><span>Reason *</span><textarea rows="2" id="es-lv-reason" placeholder="e.g. Family wedding in Sialkot"></textarea></label>' +
        '<div class="es-lv-2"><label class="es-field"><span>Handover to</span><input id="es-lv-hand" placeholder="Search a colleague…"></label>' +
        '<label class="es-field"><span>Contact during leave</span><input id="es-lv-contact" value="0312-4778899"></label></div>' +
        '<div class="es-field"><span>Attachment <small class="es-hint" id="es-lv-attreq"></small></span><div class="es-drop" data-act="lvfile" tabindex="0"><i data-lucide="paperclip"></i><div><b>Attach a file</b> · invitation, medical certificate<br><small class="es-hint">PDF, JPG up to 5 MB</small></div></div><div class="es-files" id="es-lv-files"></div></div>' +
        '<div class="es-field"><span>Approval route</span><div id="es-lv-flow"></div></div>' +
        '</div>',
      foot: '<button class="btn secondary" data-close>Cancel</button><button class="btn primary" id="es-lv-go"><i data-lucide="send"></i>Submit request</button>',
    });
    var hand = '';
    ES.autocomplete($('#es-lv-hand', el), colleagues, function (p) { hand = p.name; FS.toast(p.name + ' will be notified as your handover', { tone: 'info', ms: 1800 }); });
    var calc = function () {
      var t = typeOf(type), f = $('#es-lv-from', el).value, to = $('#es-lv-to', el).value;
      if (to < f) { $('#es-lv-to', el).value = f; to = f; }
      var w = ES.workingDays(f, to), half = $('#es-lv-half', el).checked;
      var days = Math.max(0, w.days - (half && w.days ? 0.5 : 0));
      ES.tick($('#es-lv-days', el), days, { dec: days % 1 ? 1 : 0 });
      $('#es-lv-dayslbl', el).textContent = days === 1 ? 'working day' : 'working days';
      /* range strip */
      var a = ES.parse(f), b = ES.parse(to), cells = '', k = 0, d = new Date(a), lastWork = null;
      while (d <= b && k < 31) { if (!ES.isWeekend(d) && !ES.isHoliday(d)) lastWork = ES.iso(d); d.setDate(d.getDate() + 1); k++; }
      d = new Date(a); k = 0;
      while (d <= b && k < 31) {
        var hol = ES.isHoliday(d), wk = ES.isWeekend(d), iso = ES.iso(d);
        var cls = hol ? 'hol' : wk ? 'wk' : 'on' + (half && iso === lastWork ? ' half' : '');
        cells += '<span class="' + cls + '" style="--i:' + k + '" data-tip="' + ES.dfmt(d, true) + (hol ? ' · ' + hol : wk ? ' · weekend' : '') + '"><small>' + ES.DOW[d.getDay()].slice(0, 2) + '</small><b>' + d.getDate() + '</b></span>';
        d.setDate(d.getDate() + 1); k++;
      }
      var excl = [];
      var cal = Math.round((b - a) / 864e5) + 1, wkn = cal - w.days - w.holidays.length;
      if (wkn > 0) excl.push(wkn + ' weekend day' + (wkn > 1 ? 's' : ''));
      if (w.holidays.length) excl.push(w.holidays.join(', '));
      $('#es-lv-range', el).innerHTML = '<div class="es-lv-strip">' + cells + '</div><small>' + cal + ' calendar day' + (cal > 1 ? 's' : '') + (excl.length ? ' · excludes ' + excl.join(' + ') : '') + '</small>';
      /* balance */
      var prev = $('#es-lv-prev', el), msg = $('#es-lv-msg', el);
      if (t.k === 'unpaid') {
        prev.dataset.state = 'unpaid';
        $('#es-lv-after', el).textContent = '—'; $('#es-lv-from-bal', el).textContent = 'no balance used';
        msg.innerHTML = '<i data-lucide="info"></i>Salary is deducted at Rs 4,181 per day (basic ÷ 22).';
      } else {
        var fr = free(t), after = fr - days, bk = booked(t.k);
        ES.tick($('#es-lv-after', el), after, { dec: after % 1 ? 1 : 0 });
        $('#es-lv-from-bal', el).textContent = 'from ' + fmtD(fr) + (bk ? ' (' + fmtD(bk) + ' booked)' : '');
        $('#es-lv-unit', el).textContent = Math.abs(after) === 1 ? 'day' : 'days';
        var pct = function (v) { return Math.max(0, v / t.ent * 100) + '%'; };
        var met = $('#es-lv-meter', el).children;
        met[0].style.width = pct(t.used); met[1].style.width = pct(bk); met[2].style.width = pct(Math.min(days, Math.max(0, fr))); met[3].style.width = pct(Math.max(0, after));
        $('#es-lv-m-u', el).textContent = fmtD(t.used); $('#es-lv-m-b', el).textContent = fmtD(bk); $('#es-lv-m-r', el).textContent = fmtD(days); $('#es-lv-m-n', el).textContent = fmtD(Math.max(0, after));
        prev.dataset.state = after < 0 ? 'over' : after <= 1 ? 'low' : 'ok';
        msg.innerHTML = after < 0 ? '<i data-lucide="circle-alert"></i>Exceeds your ' + t.n.toLowerCase() + ' by ' + fmtD(-after) + ' day' + (-after > 1 ? 's' : '') + '. Extra days become unpaid.'
          : days === 0 ? '<i data-lucide="calendar-off"></i>No working days in this range.'
          : after <= 1 ? '<i data-lucide="triangle-alert"></i>Almost out of ' + t.n.toLowerCase() + '.'
          : '<i data-lucide="circle-check"></i>Enough balance' + (t.k === 'annual' ? ' · +1.17 accrues on 01 Nov' : '') + '.';
      }
      /* conflicts */
      var clash = TEAMOUT.filter(function (p) { return p.from <= to && p.to >= f; });
      if (clash.length) msg.innerHTML += '<span class="es-lv-clash"><i data-lucide="users"></i>' + clash.map(function (p) { return p.n.split(' ')[0]; }).join(', ') + ' also out</span>';
      FS.icons(msg);
      var needCert = t.k === 'sick' && days > 2;
      $('#es-lv-attreq', el).textContent = needCert ? '· medical certificate required' : '';
      $('#es-lv-flow', el).innerHTML = ES.tracker(STEPS, 0, 'ok', ['You', 'Zainab Raza · 24 h', days > 3 ? 'Ayesha Noor · 48 h' : 'Notified only', '']);
      FS.icons($('#es-lv-flow', el));
      el._days = days;
    };
    el.addEventListener('click', function (e) {
      var o = e.target.closest('#es-lv-types .es-opt');
      if (o) { type = o.dataset.t; $$('#es-lv-types .es-opt', el).forEach(function (b) { b.classList.toggle('on', b === o); }); calc(); }
      var h = e.target.closest('#es-lv-halfseg button');
      if (h) { setTimeout(calc); if (!$('#es-lv-half', el).checked) { $('#es-lv-half', el).checked = true; setTimeout(calc); } }
      if (e.target.closest('[data-act=lvfile]')) { var fl = $('#es-lv-files', el); fl.insertAdjacentHTML('beforeend', ES.fileChip(type === 'sick' ? 'medical-certificate.pdf' : 'wedding-invitation.jpg', type === 'sick' ? '312 KB' : '1.2 MB')); FS.icons(fl); }
    });
    ['#es-lv-from', '#es-lv-to', '#es-lv-half'].forEach(function (s) { $(s, el).addEventListener('change', calc); $(s, el).addEventListener('input', calc); });
    calc();
    $('#es-lv-go', el).addEventListener('click', function () {
      var reason = $('#es-lv-reason', el), days = el._days;
      if (!days) { FS.toast('Pick a range with at least one working day', { tone: 'warn' }); return; }
      if (!reason.value.trim()) { reason.classList.add('es-at-err'); reason.focus(); setTimeout(function () { reason.classList.remove('es-at-err'); }, 600); FS.toast('Add a short reason for Zainab', { tone: 'warn', ms: 2000 }); return; }
      var btn = this;
      ES.busy(btn, 1000, 'Submitting…').then(function () {
        var half = $('#es-lv-half', el).checked ? ($('#es-lv-halfseg .active', el) || {}).textContent : '';
        var r = { id: 'LR-2026-0' + (442 + REQ.length - 6), type: type, from: $('#es-lv-from', el).value, to: $('#es-lv-to', el).value, days: days, half: half, reason: reason.value.trim(), st: 'Pending', at: 1, applied: '01 Oct', hand: $('#es-lv-hand', el).value || hand, fresh: true };
        REQ.unshift(r);
        ES.closeSheet(el);
        filt = 'all'; $$('[data-lf]', sec).forEach(function (b) { b.classList.toggle('active', b.dataset.lf === 'all'); });
        paintBal(sec); paintReqs(sec); teamCal(sec);
        var card = $('.es-lv-req.fresh', sec) || $('.es-lv-req', sec);
        if (card) ES.scrollTo(card);
        setTimeout(function () { ES.celebrate(card); }, 350);
        FS.toast(r.id + ' sent to Zainab Raza · ' + fmtD(days) + ' day' + (days === 1 ? '' : 's'), { tone: 'good' });
      });
    });
  }

  function policy() {
    FS.drawer({ title: 'Leave policy 2026', subtitle: 'Al-Noor Enterprises · HR-POL-07 · rev. Jan 2026',
      html: '<div class="es-lv-pol">' + [
        ['plane', 'Annual leave', '14 days a year, accrued 1.17 days per month. Apply at least 7 days ahead. Up to 5 days carry forward to 2027.'],
        ['sun', 'Casual leave', '10 days a year for short personal needs. Max 3 consecutive days. Half days allowed.'],
        ['thermometer', 'Sick leave', '8 days a year. A medical certificate is needed for more than 2 consecutive days.'],
        ['repeat', 'Comp-off', 'Earned for approved weekend or holiday work. Expires 30 days after it is earned.'],
        ['git-branch', 'Approvals', 'Your line manager approves within 24 h. Requests over 3 days also go to HR (Ayesha Noor) within 48 h.'],
        ['calendar-off', 'Weekends & holidays', 'Saturdays, Sundays and gazetted public holidays inside a leave range are not counted.'],
      ].map(function (p) { return '<div class="es-lv-polrow"><span class="icon-tile"><i data-lucide="' + p[0] + '"></i></span><div><b>' + p[1] + '</b><p>' + p[2] + '</p></div></div>'; }).join('') + '</div>',
      foot: '<button class="btn secondary" data-close>Close</button><button class="btn primary" data-es-dl="HR-POL-07-Leave-Policy-2026.pdf"><i data-lucide="download"></i>Download PDF</button>' });
  }

  ES.route('ess/leave', {
    render: function () {
      var hol = ES.HOLIDAYS.filter(function (h) { return h.d >= TODAY; }).slice(0, 6);
      return '<div class="es-grid es-g4 es-lv-bals" id="es-lv-bals"></div>' +
        '<div class="es-grid es-main es-lv-main">' +
        '<div class="es-card flush"><div class="es-head"><div><h3>My requests</h3><p><b id="es-lv-avail">13.5</b> annual + casual days free to book</p></div><span class="spacer"></span>' +
        '<div class="chips es-lv-chips">' + [['all', 'All'], ['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected']].map(function (c, i) { return '<button type="button" class="' + (i ? '' : 'active') + '" data-lf="' + c[0] + '">' + c[1] + ' <i>0</i></button>'; }).join('') + '</div></div>' +
        '<div class="es-lv-reqs" id="es-lv-reqs"></div></div>' +
        '<div class="es-col">' +
        '<div class="es-card"><div class="es-head"><div><h3>Team calendar</h3><p>October 2026 · Sales, Lahore</p></div><span class="spacer"></span><span class="pill"><i data-lucide="users"></i><b>5</b> out this month</span></div>' +
        '<div class="es-lv-tcal" id="es-lv-tcal"></div><div class="es-lv-outlist" id="es-lv-out"></div></div>' +
        '<div class="es-card"><div class="es-head"><h3>Upcoming holidays</h3><span class="spacer"></span><span class="es-count">' + hol.length + '</span></div><div class="es-lv-hols">' +
        hol.map(function (h, i) { var d = ES.parse(h.d), away = Math.round((d - new Date(2026, 9, 1)) / 864e5); return '<div class="es-lv-hol es-in" style="--i:' + i + '"><span class="es-lv-hd"><b>' + ES.pad(d.getDate()) + '</b><small>' + ES.MON[d.getMonth()] + '</small></span><div><b>' + h.n + '</b><small>' + ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d.getDay()] + ' · public holiday</small></div><span class="pill">' + away + ' days</span></div>'; }).join('') +
        '</div></div></div></div>';
    },
    bind: function (sec) {
      paintBal(sec); paintReqs(sec); teamCal(sec);
      ES.acts(sec, {
        apply: function (b) { apply(sec, b.dataset.type); },
        policy: policy,
        withdraw: function (b) {
          var r = REQ.find(function (x) { return x.id === b.closest('.es-lv-req').dataset.id; });
          ES.confirm({ title: 'Withdraw ' + r.id + '?', text: 'Zainab Raza will be told you no longer need ' + fmtD(r.days) + ' day(s) of ' + typeOf(r.type).n.toLowerCase() + ' (' + range(r) + '). The days return to your balance.', okLabel: 'Withdraw request', danger: true }).then(function (ok) {
            if (!ok) return; r.st = 'Withdrawn'; r.at = 1; paintBal(sec); paintReqs(sec); teamCal(sec);
            FS.toast(r.id + ' withdrawn · ' + fmtD(r.days) + ' day(s) back in your balance', { tone: 'info', undo: function () { r.st = 'Pending'; paintBal(sec); paintReqs(sec); teamCal(sec); } });
          });
        },
        cancel: function (b) {
          var r = REQ.find(function (x) { return x.id === b.closest('.es-lv-req').dataset.id; });
          ES.confirm({ title: 'Cancel approved leave?', text: r.id + ' · ' + range(r) + '. Your manager is notified and the balance is restored.', okLabel: 'Cancel leave', danger: true }).then(function (ok) {
            if (!ok) return; r.st = 'Cancelled'; r.at = 4; paintBal(sec); paintReqs(sec); teamCal(sec);
            FS.toast(r.id + ' cancelled', { tone: 'info' });
          });
        },
      });
      sec.addEventListener('click', function (e) { var c = e.target.closest('[data-lf]'); if (c) { filt = c.dataset.lf; paintReqs(sec); } });
    },
  });
})();

/* ---------- 03-payslips.js ---------- */
/* ess/payslips: month chips, net-pay hero, accordion, YTD chart with compare, PDF + tax certificate */
(function () {
  var $ = ES.$, $$ = ES.$$;
  var NETS = [107200, 108380, 109400, 113650, 115080, 153100, 116700, 118220, 141550, 121700, 121430, 127630];
  var PAYDAY = [31, 28, 31, 30, 27, 27, 30, 29, 30, 31, 29, 30];
  var M = NETS.map(function (net, i) {
    var y = i < 3 ? 2025 : 2026, mo = (9 + i) % 12, cur = i >= 9, loan = i >= 5;
    var e = cur ? { basic: 92000, hra: 9000, med: 9200, fuel: 4800 } : { basic: 84000, hra: 8400, med: 8400, fuel: 4800 };
    var d = { tax: cur ? 4870 : 3900, pf: cur ? 4600 : 4200, eobi: cur ? 400 : 370, loan: loan ? 5000 : 0 };
    var ded = d.tax + d.pf + d.eobi + d.loan, gross = net + ded;
    e.comm = gross - e.basic - e.hra - e.med - e.fuel;
    return { i: i, y: y, mo: mo, label: ES.MONTH[mo] + ' ' + y, short: ES.MON[mo], run: 'PR-' + y + '-' + ES.pad(mo + 1), paid: ES.pad(PAYDAY[i]) + ' ' + ES.MON[mo] + ' ' + y, net: net, gross: gross, ded: ded, e: e, d: d };
  });
  var EARN = [['basic', 'Basic salary', 'Fixed · grade G-7'], ['hra', 'House rent allowance', 'Fixed'], ['med', 'Medical allowance', 'Exempt up to 10% of basic'], ['fuel', 'Fuel & conveyance', 'Field sales allowance'], ['comm', 'Sales commission', 'On collections vs target']];
  var DEDS = [['tax', 'Income tax u/s 149', 'FBR salaried slabs'], ['pf', 'Provident fund', '5% of basic · employer matches'], ['eobi', 'EOBI (employee)', '1% of minimum wage'], ['loan', 'Loan recovery', 'LN-2026-0031 · motorcycle']];
  var sel = 11, cmp = 10, comparing = false;

  function rowsHtml(list, src, total, neg) {
    return list.filter(function (r) { return src[r[0]]; }).map(function (r, k) {
      var v = src[r[0]];
      return '<div class="es-ps-li es-in" style="--i:' + k + '"><div><b>' + r[1] + '</b><small>' + r[2] + '</small></div><span class="es-ps-share"><i style="width:' + Math.max(3, v / total * 100).toFixed(1) + '%"></i></span><b class="es-ps-amt ' + (neg ? 'neg' : '') + '">' + (neg ? '−' : '') + FS.money(v, { rs: false }) + '</b></div>';
    }).join('');
  }
  function accordion(m) {
    return '<div class="es-ps-acc open" data-acc><button type="button" class="es-ps-acc-h" data-act="acc"><span class="icon-tile green"><i data-lucide="trending-up"></i></span><div><b>Earnings</b><small>' + Object.keys(m.e).filter(function (k) { return m.e[k]; }).length + ' components</small></div><span class="spacer"></span><b class="es-ps-acc-sum">' + FS.money(m.gross) + '</b><i data-lucide="chevron-down" class="es-ps-chev"></i></button>' +
      '<div class="es-ps-acc-b"><div>' + rowsHtml(EARN, m.e, m.gross) + '</div></div></div>' +
      '<div class="es-ps-acc" data-acc><button type="button" class="es-ps-acc-h" data-act="acc"><span class="icon-tile red"><i data-lucide="trending-down"></i></span><div><b>Deductions</b><small>Tax, PF, EOBI' + (m.d.loan ? ', loan' : '') + '</small></div><span class="spacer"></span><b class="es-ps-acc-sum neg">−' + FS.money(m.ded) + '</b><i data-lucide="chevron-down" class="es-ps-chev"></i></button>' +
      '<div class="es-ps-acc-b"><div>' + rowsHtml(DEDS, m.d, m.ded, true) + '</div></div></div>' +
      '<div class="es-ps-netrow"><span>Net pay</span><b>' + FS.money(m.net) + '</b></div>';
  }
  function stack(m) {
    var tot = m.gross, f = function (v) { return (v / tot * 100).toFixed(2) + '%'; };
    return '<i style="--w:' + f(m.e.basic) + ';--c:var(--es-forest)" data-tip="Basic Rs ' + FS.fmt(m.e.basic) + '"></i><i style="--w:' + f(m.e.hra + m.e.med + m.e.fuel) + ';--c:var(--mint)" data-tip="Allowances Rs ' + FS.fmt(m.e.hra + m.e.med + m.e.fuel) + '"></i><i style="--w:' + f(m.e.comm) + ';--c:var(--lime)" data-tip="Commission Rs ' + FS.fmt(m.e.comm) + '"></i><i class="ded" style="--w:' + f(m.ded) + '" data-tip="Deductions Rs ' + FS.fmt(m.ded) + '"></i>';
  }
  function chart() {
    var max = Math.max.apply(null, NETS);
    return M.map(function (m) {
      return '<button type="button" class="es-ps-bar ' + (m.i === sel ? 'sel' : '') + (comparing && m.i === cmp ? ' cmp' : '') + '" data-act="bar" data-i="' + m.i + '" style="--h:' + (m.net / max * 100).toFixed(1) + '%;--i:' + m.i + '" data-tip="' + m.label + ' · Rs ' + FS.fmt(m.net) + '" aria-label="' + m.label + '"><i></i><span>' + m.short[0] + '</span></button>';
    }).join('');
  }
  function compareHtml() {
    var a = M[sel], b = M[cmp];
    var lines = [['Gross earnings', a.gross, b.gross], ['Sales commission', a.e.comm, b.e.comm], ['Basic salary', a.e.basic, b.e.basic], ['Income tax', a.d.tax, b.d.tax, 1], ['Total deductions', a.ded, b.ded, 1], ['Net pay', a.net, b.net]];
    return '<table class="tbl es-ps-cmp" data-plain><thead><tr><th>Component</th><th class="num">' + a.short + ' ' + a.y + '</th><th class="num">' + b.short + ' ' + b.y + '</th><th class="num">Change</th></tr></thead><tbody>' +
      lines.map(function (l, k) { var dlt = l[1] - l[2], good = l[3] ? dlt < 0 : dlt > 0; return '<tr class="' + (k === lines.length - 1 ? 'total' : '') + '"><td>' + l[0] + '</td><td class="num">' + FS.fmt(l[1], 2) + '</td><td class="num">' + FS.fmt(l[2], 2) + '</td><td class="num"><span class="es-ps-dl ' + (dlt > 0 ? 'up' : dlt < 0 ? 'down' : '') + '">' + (dlt > 0 ? '+' : dlt < 0 ? '−' : '') + FS.fmt(Math.abs(dlt)) + '</span></td></tr>'; }).join('') + '</tbody></table>';
  }

  function words(n) {
    var a = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
    var t = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
    var h = function (x) { var s = ''; if (x >= 100) { s += a[Math.floor(x / 100)] + ' hundred'; x %= 100; if (x) s += ' and '; } if (x >= 20) { s += t[Math.floor(x / 10)] + (x % 10 ? '-' + a[x % 10] : ''); } else if (x) s += a[x]; return s; };
    var s = ''; if (n >= 1000) { s += h(Math.floor(n / 1000)) + ' thousand'; n %= 1000; if (n) s += ' '; } s += h(n);
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function payslipPaper(m) {
    var me = ES.ME, tr = '';
    var ea = EARN.filter(function (r) { return m.e[r[0]]; }), da = DEDS.filter(function (r) { return m.d[r[0]]; });
    for (var k = 0; k < Math.max(ea.length, da.length); k++) {
      var e = ea[k], d = da[k];
      tr += '<tr><td>' + (e ? e[1] : '') + '</td><td class="num">' + (e ? FS.fmt(m.e[e[0]], 2) : '') + '</td><td>' + (d ? d[1] : '') + '</td><td class="num">' + (d ? FS.fmt(m.d[d[0]], 2) : '') + '</td></tr>';
    }
    tr += '<tr class="total"><td>Gross earnings</td><td class="num">' + FS.fmt(m.gross, 2) + '</td><td>Total deductions</td><td class="num">' + FS.fmt(m.ded, 2) + '</td></tr>';
    return ES.letterhead('<b>Payslip</b><br>' + m.label + '<br>' + m.run) +
      '<div class="paper-meta"><div><small>Employee</small><b>' + me.name + '</b><br>' + me.id + ' · ' + me.role + '</div><div><small>Department</small>' + me.dept + ' · ' + me.branch + '<br>Grade ' + me.grade + '</div><div><small>CNIC / NTN</small>' + me.cnic + '<br>' + me.eobi + '</div><div><small>Paid to</small>' + me.bank + ' ****4417<br>Paid on ' + m.paid + '</div></div>' +
      '<table class="tbl" data-plain><thead><tr><th>Earnings</th><th class="num">Rs</th><th>Deductions</th><th class="num">Rs</th></tr></thead><tbody>' + tr + '</tbody></table>' +
      '<div class="paper-totals"><div><span>Gross earnings</span><b>' + FS.fmt(m.gross, 2) + '</b></div><div><span>Total deductions</span><b>(' + FS.fmt(m.ded, 2) + ')</b></div><div class="grand"><span>Net pay</span><b>Rs ' + FS.fmt(m.net, 2) + '</b></div></div>' +
      '<p class="es-ps-words"><b>In words:</b> Rupees ' + words(m.net) + ' only.</p>' +
      '<div class="paper-foot"><span>Working days 22 · Leave 1 · Late marks 2 · Overtime 6h 30m</span><span>Computer-generated payslip. No signature required.</span></div>';
  }
  function certPaper(fy, issued, gross, tax) {
    var me = ES.ME;
    return ES.letterhead('<b>Certificate</b><br>u/s 149 · FY ' + fy + '<br>Issued ' + issued) +
      '<h3 class="es-ps-cert-t">Certificate of Collection or Deduction of Income Tax</h3><p>Certified that a sum of <b>Rs ' + FS.fmt(tax, 2) + '</b> has been deducted on account of income tax from the salary of <b>' + me.name + '</b> (CNIC ' + me.cnic + ', ' + me.role + ') for the tax year ' + fy + ' and deposited in the Government Treasury through the CPRs listed below.</p>' +
      '<div class="paper-meta"><div><small>Gross salary</small><b>Rs ' + FS.fmt(gross, 2) + '</b></div><div><small>Exempt (medical)</small>Rs ' + FS.fmt(100800, 2) + '</div><div><small>Tax deducted</small><b>Rs ' + FS.fmt(tax, 2) + '</b></div><div><small>Withholding agent</small>' + ES.CO.name + '<br>NTN ' + ES.CO.ntn + '</div></div>' +
      '<table class="tbl" data-plain><thead><tr><th>Quarter</th><th>CPR no.</th><th>Deposited</th><th class="num">Amount</th></tr></thead><tbody>' +
      ['Jul–Sep', 'Oct–Dec', 'Jan–Mar', 'Apr–Jun'].map(function (q, k) { return '<tr><td>' + q + '</td><td>IT-' + (20250715 + k * 9100) + '-0' + (3 + k) + '</td><td>15 ' + ['Oct', 'Jan', 'Apr', 'Jul'][k] + '</td><td class="num">' + FS.fmt(tax / 4, 2) + '</td></tr>'; }).join('') + '</tbody></table>' +
      '<div class="paper-foot"><span>Ayesha Noor · HR Manager<br>Sana Javed · Finance Manager</span><span class="es-stamp">Al-Noor Enterprises · Payroll · Verified</span></div>';
  }

  function paint(sec, first) {
    var m = M[sel], p = M[sel - 1];
    $('#es-ps-period', sec).textContent = m.label;
    $('#es-ps-sub', sec).innerHTML = 'Credited ' + m.paid + ' to Meezan Bank ****4417 · ' + m.run;
    var net = $('#es-ps-net', sec);
    if (first) net.innerHTML = FS.money(m.net); else ES.tick(net, m.net, { dec: 2, prefix: 'Rs ' });
    var dl = p ? m.net - p.net : 0;
    $('#es-ps-pills', sec).innerHTML = (p ? '<span class="pill"><i data-lucide="' + (dl >= 0 ? 'trending-up' : 'trending-down') + '"></i>vs ' + p.short + ' <b class="' + (dl >= 0 ? 'up' : 'down') + '">' + (dl >= 0 ? '+' : '−') + 'Rs ' + FS.fmt(Math.abs(dl)) + '</b></span>' : '') +
      '<span class="pill"><i data-lucide="wallet"></i>Gross <b>Rs ' + FS.fmt(m.gross) + '</b></span><span class="pill"><i data-lucide="coins"></i>Commission <b class="up">Rs ' + FS.fmt(m.e.comm) + '</b></span>';
    $('#es-ps-stack', sec).innerHTML = stack(m);
    $('#es-ps-acc', sec).innerHTML = accordion(m);
    $('#es-ps-chips', sec).querySelectorAll('button').forEach(function (b) { b.classList.toggle('active', +b.dataset.i === sel); });
    var act = $('#es-ps-chips button.active', sec); if (act && !first) { var cp = act.parentElement; cp.scrollTo({ left: act.offsetLeft - cp.clientWidth / 2 + act.offsetWidth / 2, behavior: 'smooth' }); }
    $('#es-ps-chart', sec).innerHTML = chart();
    $('#es-ps-cmpwrap', sec).innerHTML = comparing ? '<div class="es-ps-cmphead"><span class="es-ps-key a"></span><b>' + m.label + '</b><span class="es-label">vs</span><span class="es-ps-key b"></span><b>' + M[cmp].label + '</b><span class="es-label">· tap a bar to change</span></div>' + compareHtml() : '';
    $('#es-ps-cmpwrap', sec).classList.toggle('on', comparing);
    FS.icons(sec);
  }

  ES.route('ess/payslips', {
    render: function () {
      var ytdG = M[9].gross + M[10].gross + M[11].gross, ytdN = M[9].net + M[10].net + M[11].net;
      return '<div class="es-ps-chips es-scroll-x" id="es-ps-chips" role="tablist">' + M.slice().reverse().map(function (m) { return '<button type="button" data-act="month" data-i="' + m.i + '" role="tab"><b>' + m.short + '</b><small>' + m.y + '</small></button>'; }).join('') + '</div>' +
        '<div class="es-grid es-wide">' +
          '<div class="es-col">' +
            '<div class="es-card es-ps-hero"><div class="es-head"><h3>Net pay</h3><span class="pill" id="es-ps-period">September 2026</span><span class="spacer"></span><span class="badge dot good">Paid</span></div>' +
              '<span class="es-label" id="es-ps-sub"></span>' +
              '<b class="num-big es-ps-net" id="es-ps-net"></b>' +
              '<div class="es-row wrap" id="es-ps-pills"></div>' +
              '<div class="es-ps-stack" id="es-ps-stack"></div>' +
              '<div class="es-ps-legend"><span><i style="background:var(--es-forest)"></i>Basic</span><span><i style="background:var(--mint)"></i>Allowances</span><span><i style="background:var(--lime)"></i>Commission</span><span><i class="ded"></i>Deductions</span></div>' +
              '<div class="es-row wrap es-ps-acts"><button class="btn secondary sm" type="button" data-act="view"><i data-lucide="eye"></i>View payslip</button><button class="btn primary sm" type="button" data-act="pdf"><i data-lucide="download"></i>Download PDF</button><button class="btn ghost sm" type="button" data-act="share"><i data-lucide="share-2"></i>Share with bank</button></div>' +
            '</div>' +
            '<div class="es-card es-ps-acc-card"><div class="es-head"><h3>Payslip breakdown</h3><span class="spacer"></span><button class="es-link" type="button" data-act="expandall">Expand all<i data-lucide="chevrons-down"></i></button></div><div id="es-ps-acc"></div></div>' +
          '</div>' +
          '<div class="es-col">' +
            '<div class="es-card"><div class="es-head"><h3>FY 2026-27 to date</h3><span class="spacer"></span><span class="es-label">Jul – Sep</span></div>' +
              '<div class="es-ps-ytd">' +
                [['Gross earnings', ytdG, 'trending-up', 'green', 1790800], ['Net pay', ytdN, 'wallet', 'lime', 1490000], ['Income tax u/s 149', 14610, 'percent', 'orange', 58440], ['Provident fund balance', 212460, 'piggy-bank', 'blue', 0]].map(function (r, k) {
                  return '<div class="es-ps-ytd-r"><span class="icon-tile ' + r[3] + '"><i data-lucide="' + r[2] + '"></i></span><div><span class="es-label">' + r[0] + '</span><b data-count>' + FS.money(r[1]) + '</b>' + (r[4] ? '<div class="progress"><i style="width:' + (r[1] / r[4] * 100).toFixed(1) + '%"></i></div><small>' + Math.round(r[1] / r[4] * 100) + '% of projected Rs ' + FS.fmt(r[4]) + '</small>' : '<small>Incl. employer share · ' + 'Rs 9,200 / month</small>') + '</div></div>';
                }).join('') +
              '</div></div>' +
            '<div class="es-card"><div class="es-head"><h3>Tax certificates</h3><span class="spacer"></span><a class="es-link" href="#/ess/tax">Declarations<i data-lucide="arrow-right"></i></a></div>' +
              [['2025-26', '15 Jul 2026', 1480640, 47200], ['2024-25', '12 Jul 2025', 1312400, 33150]].map(function (c) {
                return '<div class="es-ps-cert"><span class="icon-tile blue"><i data-lucide="file-badge"></i></span><div><b>FY ' + c[0] + ' · u/s 149</b><small>Issued ' + c[1] + ' · tax Rs ' + FS.fmt(c[3]) + '</small></div><span class="spacer"></span><button class="btn secondary sm" type="button" data-act="cert" data-fy="' + c[0] + '" data-iss="' + c[1] + '" data-g="' + c[2] + '" data-t="' + c[3] + '"><i data-lucide="download"></i>PDF</button></div>';
              }).join('') +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="es-card es-ps-chart-card"><div class="es-head"><div><h3>Net pay · last 12 months</h3><p>March and June include quarterly sales commission.</p></div><span class="spacer"></span>' +
          '<label class="switch"><input type="checkbox" id="es-ps-cmp" data-act="compare"><i></i><span>Compare months</span></label></div>' +
          '<div class="es-ps-chart" id="es-ps-chart"></div>' +
          '<div class="es-ps-cmpwrap" id="es-ps-cmpwrap"></div></div>';
    },
    bind: function (sec) {
      paint(sec, true);
      ES.acts(sec, {
        month: function (b) { sel = +b.dataset.i; if (cmp === sel) cmp = sel ? sel - 1 : 1; paint(sec); },
        bar: function (b) { var i = +b.dataset.i; if (comparing) { if (i === sel) return; cmp = i; } else sel = i; paint(sec); },
        acc: function (b) { b.closest('[data-acc]').classList.toggle('open'); },
        expandall: function () { $$('[data-acc]', sec).forEach(function (a) { a.classList.add('open'); }); },
        view: function () { ES.paper({ title: 'Payslip · ' + M[sel].label, sub: M[sel].run + ' · ' + ES.ME.id, html: payslipPaper(M[sel]), file: 'Payslip-' + ES.ME.id + '-' + M[sel].run + '.pdf' }); },
        pdf: function (b) { ES.paper({ title: 'Payslip · ' + M[sel].label, sub: M[sel].run + ' · ' + ES.ME.id, html: payslipPaper(M[sel]), file: 'Payslip-' + ES.ME.id + '-' + M[sel].run + '.pdf' }); },
        share: function (b) { ES.busy(b, 900, 'Generating link…').then(function () { FS.toast('Secure link copied · expires in 7 days', { tone: 'good' }); }); },
        cert: function (b) {
          var fy = b.dataset.fy || '2025-26', iss = b.dataset.iss || '15 Jul 2026', g = +(b.dataset.g || 1480640), t = +(b.dataset.t || 47200);
          ES.paper({ title: 'Tax certificate · FY ' + fy, sub: 'Section 149 · Income Tax Ordinance 2001', html: certPaper(fy, iss, g, t), file: 'Tax-Certificate-149-FY' + fy + '.pdf' });
        },
        compare: function (c) { comparing = c.checked; if (comparing && cmp === sel) cmp = sel ? sel - 1 : 1; paint(sec); if (comparing) ES.flash($('.es-ps-cmp', sec)); },
      });
    },
  });
})();

/* ---------- 04-tax.js ---------- */
/* ess/tax: FBR salaried slab projection, declarations with proof upload, tax-saved counter, monthly schedule */
(function () {
  var $ = ES.$, $$ = ES.$$;
  var BASE = 1680400, GROSS = 1790800, EXEMPT = 110400, YTD_TAX = 14610, PER = 4870;
  var SLABS = [[0, 600000, 0, 0], [600000, 1200000, .01, 0], [1200000, 2200000, .11, 6000], [2200000, 3200000, .23, 116000], [3200000, 4100000, .30, 346000], [4100000, 6000000, .35, 616000]];
  function slabTax(x) { for (var i = SLABS.length - 1; i >= 0; i--) { var s = SLABS[i]; if (x > s[0]) return s[3] + (x - s[0]) * s[2]; } return 0; }
  var DEC = [
    { k: 'zakat', t: 'Zakat', sec: 'u/s 60 · deductible allowance', ic: 'moon-star', tone: 'green', amt: 45000, payee: 'Meezan Bank · auto-deducted 1 Ramadan', on: true, proof: null, status: 'Pending', how: 'Reduces taxable income' },
    { k: 'vps', t: 'Pension fund (VPS)', sec: 'u/s 63 · tax credit', ic: 'piggy-bank', tone: 'blue', amt: 120000, payee: 'Meezan Tahaffuz Pension Fund', on: true, proof: 'MTPF-Contribution-Statement.pdf', status: 'Approved', how: 'Credit at average rate, max 20% of income' },
    { k: 'don', t: 'Donations', sec: 'u/s 61 · tax credit', ic: 'heart-handshake', tone: 'violet', amt: 25000, payee: 'Shaukat Khanum Memorial Trust', on: false, proof: null, status: 'Not declared', how: 'Credit at average rate, max 30% of income' },
    { k: 'health', t: 'Health insurance', sec: 'u/s 62A · tax credit', ic: 'shield-plus', tone: 'orange', amt: 36000, payee: 'Jubilee Life · family health plan', on: false, proof: null, status: 'Not declared', how: 'Credit at average rate on premium' },
  ];
  function byK(k) { return DEC.find(function (d) { return d.k === k; }); }
  function calc(over) {
    var dd = {}; DEC.forEach(function (d) { dd[d.k] = d.on ? d.amt : 0; });
    if (over) dd[over.k] = over.amt;
    var taxable = BASE - dd.zakat, tax = slabTax(taxable), avg = taxable ? tax / taxable : 0;
    var cr = { vps: avg * Math.min(dd.vps, taxable * .2), don: avg * Math.min(dd.don, taxable * .3), health: avg * Math.min(dd.health, 150000) };
    var net = Math.max(0, tax - cr.vps - cr.don - cr.health), base = slabTax(BASE);
    return { taxable: taxable, tax: tax, avg: avg, cr: cr, net: net, saved: base - net, base: base, monthly: Math.max(0, (net - YTD_TAX) / 9), zakatSave: base - tax };
  }
  function slabRows(c) {
    var x = c.taxable;
    return SLABS.map(function (s, i) {
      var top = s[1], fill = x <= s[0] ? 0 : Math.min(1, (x - s[0]) / (top - s[0])), part = x > s[0] ? (Math.min(x, top) - s[0]) * s[2] : 0, here = x > s[0] && x <= top;
      var lbl = i === SLABS.length - 1 ? 'Above Rs 4.1M' : (s[0] ? 'Rs ' + (s[0] / 1e6).toFixed(1).replace('.0', '') + 'M' : 'Rs 0') + ' – ' + (top / 1e6).toFixed(1).replace('.0', '') + 'M';
      return '<div class="es-tx-slab ' + (here ? 'here' : '') + (fill === 0 ? ' idle' : '') + '" style="--i:' + i + '"><span class="es-tx-slab-l"><b>' + lbl + '</b><small>' + (s[2] ? (s[3] ? 'Rs ' + FS.fmt(s[3]) + ' + ' : '') + Math.round(s[2] * 100) + '% of excess' : 'Exempt') + '</small></span>' +
        '<span class="es-tx-rate">' + Math.round(s[2] * 100) + '%</span><span class="es-tx-track"><i style="width:' + (fill * 100).toFixed(1) + '%"></i>' + (here ? '<em>You · Rs ' + (x / 1e6).toFixed(2) + 'M</em>' : '') + '</span><b class="es-tx-part">' + (part ? 'Rs ' + FS.fmt(part) : '—') + '</b></div>';
    }).join('');
  }
  function decCard(d, i) {
    var c = calc(), save = d.k === 'zakat' ? c.zakatSave : c.cr[d.k];
    var potential = d.on ? 0 : (calc(Object.assign({}, d, { amt: d.amt })).saved - c.saved);
    var st = d.on ? d.status : 'Not declared';
    return '<article class="es-card es-tx-dec ' + (d.on ? 'on' : '') + ' es-in" style="--i:' + i + '" data-k="' + d.k + '">' +
      '<div class="es-head"><span class="icon-tile ' + d.tone + '"><i data-lucide="' + d.ic + '"></i></span><div><h3>' + d.t + '</h3><p>' + d.sec + '</p></div><span class="spacer"></span>' + ES.badge(st) + '</div>' +
      (d.on ? '<div class="es-tx-dec-amt"><b>' + FS.money(d.amt) + '</b><span class="pill"><i data-lucide="sparkles"></i>Saves <b class="up">Rs ' + FS.fmt(save) + '</b></span></div><span class="es-label">' + d.payee + '</span>'
        : '<div class="es-tx-dec-amt ghost"><span class="es-label">' + d.how + '</span><span class="pill"><i data-lucide="sparkles"></i>Could save <b class="up">Rs ' + FS.fmt(potential) + '</b></span></div><span class="es-label">Suggested: Rs ' + FS.fmt(d.amt) + ' · ' + d.payee + '</span>') +
      '<div class="es-tx-proof">' + (d.on ? (d.proof ? '<div class="es-files">' + ES.fileChip(d.proof, '186 KB') + '</div>' : '<button type="button" class="es-drop" data-act="proof"><i data-lucide="upload-cloud"></i><span><b>Upload proof</b> · certificate or bank statement</span></button>') : '') + '</div>' +
      '<div class="es-row es-tx-dec-foot">' + (d.on ? '<button class="btn ghost sm" type="button" data-act="edit"><i data-lucide="pencil"></i>Edit</button><span class="spacer"></span><span class="es-label">' + (d.status === 'Approved' ? 'Verified by Nida Shah · Payroll' : d.proof ? 'Payroll reviews within 2 days' : 'Proof due 15 Oct for October payroll') + '</span>'
        : '<button class="btn primary sm" type="button" data-act="declare"><i data-lucide="plus"></i>Declare</button>') + '</div></article>';
  }
  function schedule(c) {
    var months = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'], max = Math.max(PER, c.monthly);
    return months.map(function (m, i) {
      var done = i < 3, v = done ? PER : c.monthly, y = i < 6 ? 2026 : 2027;
      return '<tr class="' + (i === 3 ? 'es-tx-next' : '') + '"><td><b>' + m + ' ' + y + '</b><small>PR-' + y + '-' + ES.pad((i + 6) % 12 + 1) + '</small></td><td class="num">' + FS.fmt(i < 3 ? [136570, 136300, 142500][i] : 152826, 2) + '</td><td><span class="es-tx-mini"><i style="width:' + (v / max * 100).toFixed(1) + '%"></i></span></td><td class="num ' + (done ? '' : 'es-tx-proj') + '">' + FS.fmt(v, 2) + '</td><td>' + (done ? ES.badge('Deducted', 'es-tx-b') : i === 3 ? ES.badge('Next') : ES.badge('Scheduled')) + '</td></tr>';
    }).join('') + '<tr class="total"><td>FY 2026-27</td><td class="num">' + FS.fmt(GROSS, 2) + '</td><td></td><td class="num">' + FS.fmt(c.net, 2) + '</td><td></td></tr>';
  }

  function update(sec, first) {
    var c = calc();
    var set = function (id, v, o) { var el = $('#' + id, sec); if (first) { el.dataset.v = v; var s = FS.fmt(Math.abs(v), o.dec || 0).split('.'); el.innerHTML = (o.prefix || '') + s[0] + (s[1] ? '<span class="dec">.' + s[1] + '</span>' : '') + (o.suffix || ''); } else ES.tick(el, v, o); };
    set('es-tx-taxable', c.taxable, { prefix: 'Rs ', dec: 0 });
    set('es-tx-annual', c.net, { prefix: 'Rs ', dec: 0 });
    set('es-tx-month', c.monthly, { prefix: 'Rs ', dec: 0 });
    set('es-tx-saved', c.saved, { prefix: 'Rs ', dec: 0, dur: 1100 });
    $('#es-tx-eff', sec).textContent = (c.net / c.taxable * 100).toFixed(2) + '%';
    $('#es-tx-drop', sec).innerHTML = 'Withholding from October drops from <b>Rs ' + FS.fmt(PER) + '</b> to <b>Rs ' + FS.fmt(c.monthly) + '</b> a month';
    var n = DEC.filter(function (d) { return d.on; }).length;
    var ring = $('#es-tx-ring .es-ring', sec); if (ring) { ES.setRing(ring, n / 4 * 100); ring.querySelector('.es-ring-in').innerHTML = n + '/4<small>declared</small>'; }
    $('#es-tx-slabs', sec).innerHTML = slabRows(c);
    $('#es-tx-decs', sec).innerHTML = DEC.map(decCard).join('');
    $('#es-tx-sched', sec).innerHTML = schedule(c);
    $('#es-tx-credits', sec).innerHTML = [['Zakat allowance', c.zakatSave], ['VPS credit', c.cr.vps], ['Donation credit', c.cr.don], ['Health credit', c.cr.health]].map(function (r) { return '<div><span>' + r[0] + '</span><b>' + (r[1] ? 'Rs ' + FS.fmt(r[1]) : '—') + '</b></div>'; }).join('');
    FS.icons(sec);
  }

  function upload(host, name) {
    host.innerHTML = '<div class="es-tx-up"><i data-lucide="file-up"></i><div><b>' + name + '</b><span class="es-tx-upbar"><i></i></span></div><small>0%</small></div>';
    FS.icons(host);
    var bar = host.querySelector('.es-tx-upbar i'), pc = host.querySelector('small'), p = 0;
    return new Promise(function (res) {
      var t = setInterval(function () { p = Math.min(100, p + 9 + Math.random() * 16); bar.style.width = p + '%'; pc.textContent = Math.round(p) + '%'; if (p >= 100) { clearInterval(t); setTimeout(function () { host.innerHTML = '<div class="es-files">' + ES.fileChip(name, '204 KB') + '</div>'; FS.icons(host); res(); }, 250); } }, 110);
    });
  }

  function openSheet(sec, k) {
    var d = byK(k || 'don') || DEC[2];
    var el = ES.sheet({ title: d.on ? 'Edit declaration' : 'Add a declaration', sub: 'FY 2026-27 · applies from the next payroll after Payroll verifies your proof', cls: 'es-tx-sheet',
      html: '<div class="es-field"><span>Type</span><div class="es-opts es-tx-types">' + DEC.map(function (x) { return '<button type="button" class="es-opt ' + (x.k === d.k ? 'on' : '') + '" data-k="' + x.k + '"><i data-lucide="' + x.ic + '"></i>' + x.t + '</button>'; }).join('') + '</div></div>' +
        '<div class="form-grid" style="margin-top:14px"><label><span>Amount (Rs)</span><input type="number" min="0" step="500" id="es-tx-in-amt" value="' + d.amt + '"></label><label><span>Paid to</span><input id="es-tx-in-payee" value="' + ES.esc(d.payee) + '"></label></div>' +
        '<p class="es-hint" id="es-tx-in-how" style="margin:8px 0 0">' + d.how + '</p>' +
        '<div class="es-field" style="margin-top:14px"><span>Proof</span><div id="es-tx-in-proof"><button type="button" class="es-drop" data-pick><i data-lucide="upload-cloud"></i><span><b>Drop file or browse</b> · PDF, JPG up to 5 MB</span></button></div></div>' +
        '<div class="es-tx-preview"><div><span class="es-label">This declaration saves</span><b id="es-tx-pv">Rs 0</b></div><div><span class="es-label">New monthly tax</span><b id="es-tx-pvm">Rs 0</b></div></div>',
      foot: '<button class="btn secondary" data-close>Cancel</button><button class="btn primary" data-save><i data-lucide="check"></i>Save declaration</button>' });
    var cur = d, picked = d.proof;
    var preview = function () {
      var amt = +$('#es-tx-in-amt', el).value || 0;
      var without = calc({ k: cur.k, amt: 0 }), withIt = calc({ k: cur.k, amt: amt });
      ES.tick($('#es-tx-pv', el), Math.max(0, without.net - withIt.net), { prefix: 'Rs ' });
      ES.tick($('#es-tx-pvm', el), withIt.monthly, { prefix: 'Rs ' });
    };
    el.addEventListener('click', function (e) {
      var o = e.target.closest('.es-tx-types .es-opt');
      if (o) { $$('.es-tx-types .es-opt', el).forEach(function (b) { b.classList.toggle('on', b === o); }); cur = byK(o.dataset.k); $('#es-tx-in-amt', el).value = cur.amt; $('#es-tx-in-payee', el).value = cur.payee; $('#es-tx-in-how', el).textContent = cur.how; picked = cur.proof; preview(); }
      if (e.target.closest('[data-pick]')) { picked = { zakat: 'Zakat-Deduction-Certificate.pdf', vps: 'MTPF-Contribution-Statement.pdf', don: 'SKMT-Donation-Receipt-2026.pdf', health: 'Jubilee-Premium-Receipt.pdf' }[cur.k]; upload($('#es-tx-in-proof', el), picked); }
      var sv = e.target.closest('[data-save]');
      if (sv) {
        var amt = +$('#es-tx-in-amt', el).value || 0;
        if (!amt) { FS.toast('Enter an amount', { tone: 'warn' }); return; }
        ES.busy(sv, 800, 'Saving…').then(function () {
          cur.amt = amt; cur.payee = $('#es-tx-in-payee', el).value; cur.on = true; cur.proof = typeof picked === 'string' ? picked : cur.proof; cur.status = cur.proof ? 'In review' : 'Pending';
          ES.closeSheet(el); update(sec);
          var card = $('.es-tx-dec[data-k="' + cur.k + '"]', sec); ES.flash(card);
          ES.celebrate($('#es-tx-saved', sec));
          FS.toast(cur.t + ' declared · tax saved is now Rs ' + FS.fmt(calc().saved), { tone: 'good' });
        });
      }
    });
    $('#es-tx-in-amt', el).addEventListener('input', preview);
    preview();
  }

  ES.route('ess/tax', {
    render: function () {
      return '<div class="es-grid es-wide">' +
        '<div class="es-card es-tx-proj"><div class="es-head"><div><h3>FY 2026-27 projection</h3><p>Salaried individual · Jul 2026 – Jun 2027 · based on 3 actual + 9 projected payslips</p></div><span class="spacer"></span><span class="pill"><i data-lucide="landmark"></i>FBR slabs <b>2026-27</b></span></div>' +
          '<div class="es-tx-figs">' +
            '<div><span class="es-label">Projected taxable income</span><b class="num-big" id="es-tx-taxable"></b><small>Gross Rs ' + FS.fmt(GROSS) + ' − exempt medical Rs ' + FS.fmt(EXEMPT) + '</small></div>' +
            '<div><span class="es-label">Annual tax</span><b class="es-tx-fig" id="es-tx-annual"></b><small>Effective rate <b id="es-tx-eff"></b></small></div>' +
            '<div><span class="es-label">Monthly from Oct</span><b class="es-tx-fig" id="es-tx-month"></b><small>Deducted so far Rs ' + FS.fmt(YTD_TAX) + '</small></div>' +
          '</div>' +
          '<div class="es-tx-slabs" id="es-tx-slabs"></div>' +
        '</div>' +
        '<div class="es-col">' +
          '<div class="es-card night es-tx-hero"><div class="es-head"><h3>Tax saved this year</h3><span class="spacer"></span><span id="es-tx-ring">' + ES.ring(50, { size: 62, tone: 'var(--lime)', label: '2/4', sub: 'declared' }) + '</span></div>' +
            '<b class="num-big es-tx-saved" id="es-tx-saved"></b>' +
            '<p class="es-tx-drop" id="es-tx-drop"></p>' +
            '<div class="es-tx-credits" id="es-tx-credits"></div>' +
            '<button class="btn lime" type="button" data-act="add"><i data-lucide="plus"></i>Add a declaration</button></div>' +
          '<div class="es-card"><div class="es-head"><h3>Good to know</h3></div><ul class="es-tx-notes">' +
            '<li><i data-lucide="info"></i><span>Zakat deducted by your bank on 1 Ramadan is a deductible allowance under <b>section 60</b>.</span></li>' +
            '<li><i data-lucide="info"></i><span>Pension, donations and health premiums earn a credit at your <b>average tax rate</b>.</span></li>' +
            '<li><i data-lucide="shield-check"></i><span>EOBI Rs 400 / month and PF 5% of basic are deducted separately and are not taxed.</span></li></ul></div>' +
        '</div></div>' +
        '<div class="es-head es-tx-sh"><h3>My declarations</h3><span class="spacer"></span><span class="es-label">Proof deadline 15 Oct 2026 for October payroll</span></div>' +
        '<div class="es-grid es-g2 es-tx-decs" id="es-tx-decs"></div>' +
        '<div class="es-card flush"><div class="es-head"><div><h3>Monthly deduction schedule</h3><p>Remaining tax is spread evenly over Oct – Jun and recalculated when declarations change.</p></div><span class="spacer"></span><button class="btn secondary sm" type="button" data-act="csv"><i data-lucide="download"></i>Export</button></div>' +
          '<div class="table-wrap"><table class="tbl es-tx-tbl" data-plain><thead><tr><th>Month</th><th class="num">Taxable salary</th><th>Share</th><th class="num">Tax u/s 149</th><th>Status</th></tr></thead><tbody id="es-tx-sched"></tbody></table></div></div>';
    },
    bind: function (sec) {
      update(sec, true);
      ES.acts(sec, {
        add: function () { var nx = DEC.find(function (d) { return !d.on; }); openSheet(sec, nx ? nx.k : 'don'); },
        declare: function (b) { openSheet(sec, b.closest('[data-k]').dataset.k); },
        edit: function (b) { openSheet(sec, b.closest('[data-k]').dataset.k); },
        proof: function (b) {
          var card = b.closest('[data-k]'), d = byK(card.dataset.k), host = b.parentElement;
          d.proof = 'Zakat-Deduction-Certificate-MBL.pdf';
          upload(host, d.proof).then(function () { d.status = 'In review'; var bd = card.querySelector('.es-head .badge'); bd.outerHTML = ES.badge('In review'); FS.toast('Proof uploaded · Payroll will verify within 2 days', { tone: 'good' }); });
        },
        csv: function (b) { ES.busy(b, 700, 'Exporting…').then(function () { FS.toast('Tax-schedule-FY2026-27.xlsx downloaded', { tone: 'good' }); }); },
      });
    },
  });
})();

/* ---------- 05-loans.js ---------- */
/* ess/loans: active loan ring, eligibility, request-advance sheet with live EMI schedule + checks, history */
(function () {
  var $ = ES.$, $$ = ES.$$;
  var NET = 127630, LOAN = { no: 'LN-2026-0031', t: 'Motorcycle loan', amt: 120000, emi: 5000, n: 24, paid: 7, start: [2026, 2] };
  var TYPES = {
    adv: { t: 'Salary advance', ic: 'banknote', max: 46000, min: 5000, step: 1000, tenures: [1, 2, 3], def: 30000, note: 'Up to 50% of basic salary' },
    loan: { t: 'Staff loan', ic: 'bike', max: 150000, min: 20000, step: 5000, tenures: [6, 12, 18, 24], def: 80000, note: 'Up to 150,000 · one active staff loan at a time' },
    med: { t: 'Medical emergency', ic: 'heart-pulse', max: 100000, min: 10000, step: 5000, tenures: [3, 6, 12], def: 40000, note: 'Hospital estimate required' },
  };
  var pendingAdv = false;
  var HIST = [
    { no: 'LN-2026-0031', t: 'Motorcycle loan', amt: 120000, d: 'Disbursed 02 Mar 2026 · BPV-2026-000061', st: 'Active', at: 4, ic: 'bike', tone: 'green' },
    { no: 'ADV-2025-0088', t: 'Salary advance', amt: 30000, d: 'Dec 2025 · repaid in 6 instalments, closed Jun 2026', st: 'Closed', at: 4, ic: 'banknote', tone: 'blue' },
    { no: 'ADV-2024-0141', t: 'Eid advance', amt: 25000, d: 'Apr 2024 · repaid in 3 instalments', st: 'Closed', at: 4, ic: 'moon-star', tone: 'violet' },
  ];
  var STEPS = ['Submitted', 'Manager', 'HR', 'Finance', 'Disbursed'];
  function mlabel(y, m) { var d = new Date(y, m, 1); return ES.MON[d.getMonth()] + ' ' + d.getFullYear(); }

  function sched() {
    var rows = '', bal = LOAN.amt;
    for (var i = 0; i < LOAN.n; i++) {
      bal -= LOAN.emi;
      var st = i < LOAN.paid ? 'Recovered' : i === LOAN.paid ? 'Next' : 'Scheduled', d = new Date(LOAN.start[0], LOAN.start[1] + i, 1);
      rows += '<tr class="' + (st === 'Next' ? 'es-ln-next' : '') + '"><td>' + (i + 1) + '</td><td><b>' + mlabel(d.getFullYear(), d.getMonth()) + '</b></td><td>' + (i < LOAN.paid + 1 ? 'PR-' + d.getFullYear() + '-' + ES.pad(d.getMonth() + 1) : '—') + '</td><td class="num">' + FS.fmt(LOAN.emi, 2) + '</td><td class="num">' + FS.fmt(bal, 2) + '</td><td>' + ES.badge(st) + '</td></tr>';
    }
    return rows;
  }
  function histItem(h, i) {
    return '<div class="es-ln-h es-in" style="--i:' + i + '"><span class="icon-tile ' + h.tone + '"><i data-lucide="' + h.ic + '"></i></span><div class="es-ln-h-main"><div class="es-row wrap"><b>' + h.t + ' · Rs ' + FS.fmt(h.amt) + '</b>' + ES.badge(h.st) + '</div><small>' + h.no + ' · ' + h.d + '</small>' +
      ES.tracker(STEPS, h.at, 'ok', h.subs) + '</div>' + (h.st === 'Pending' ? '<button class="btn ghost sm" type="button" data-act="withdraw" data-no="' + h.no + '"><i data-lucide="undo-2"></i>Withdraw</button>' : '') + '</div>';
  }
  function checks(type, amt, tenure) {
    var T = TYPES[type], emi = Math.ceil(amt / tenure), pct = (LOAN.emi + emi) / NET * 100;
    var c2 = type === 'adv' ? (pendingAdv ? [false, 'An advance request is already pending'] : [true, 'No active or pending advance']) : type === 'loan' ? [false, 'LN-2026-0031 is still active (Rs 85,000)'] : [true, 'Allowed alongside an active loan'];
    return [
      [true, 'Service tenure over 6 months', '4 yrs 6 mo · joined ' + ES.ME.joined],
      [c2[0], type === 'loan' ? 'No other active staff loan' : 'No active advance', c2[1]],
      [amt <= T.max, 'Within limit', 'Max Rs ' + FS.fmt(T.max) + ' · ' + T.note],
      [pct <= 40, 'Deductions ≤ 40% of net pay', FS.fmt(pct, 1) + '% of Rs ' + FS.fmt(NET) + ' incl. current EMI'],
    ];
  }

  function openRequest(sec) {
    var type = pendingAdv ? 'med' : 'adv', T = TYPES[type], amt = T.def, ten = 3;
    var el = ES.sheet({ title: 'Request an advance', sub: 'Interest-free · recovered from payroll · approver Zainab Raza, then HR and Finance', cls: 'es-sheet-lg',
      html: '<div class="es-opts es-ln-types">' + Object.keys(TYPES).map(function (k) { return '<button type="button" class="es-opt ' + (k === type ? 'on' : '') + '" data-type="' + k + '"><i data-lucide="' + TYPES[k].ic + '"></i>' + TYPES[k].t + '</button>'; }).join('') + '</div>' +
        '<div class="es-ln-amtbox"><div class="es-row"><div><span class="es-label">Amount</span><b class="es-ln-amt" id="es-ln-amt">Rs 0</b></div><span class="spacer"></span><div class="es-ln-emibox"><span class="es-label">Monthly EMI</span><b id="es-ln-emi">Rs 0</b></div></div>' +
        '<input type="range" class="es-ln-range" id="es-ln-range" aria-label="Amount">' +
        '<div class="es-row es-ln-scale"><span id="es-ln-min"></span><span class="spacer"></span><span id="es-ln-max"></span></div>' +
        '<div class="es-row wrap"><span class="es-label">Repay over</span><div class="seg" id="es-ln-ten"></div></div></div>' +
        '<div class="es-ln-sheetgrid"><div><h4 class="es-cap">Eligibility</h4><ul class="es-ln-checks" id="es-ln-checks"></ul>' +
          '<div class="es-ln-meter"><div class="es-row"><span class="es-label">Loan deductions vs net pay</span><span class="spacer"></span><b id="es-ln-pct">0%</b></div><div class="es-ln-meterbar"><i id="es-ln-meterfill"></i><em style="left:40%">40% cap</em></div></div>' +
          '<label class="es-field" style="margin-top:14px"><span>Purpose</span><textarea rows="2" id="es-ln-purpose">Children’s school admission fee · Beaconhouse Johar Town</textarea></label></div>' +
        '<div><h4 class="es-cap">Repayment preview</h4><div class="es-ln-prev"><table class="tbl" data-plain><thead><tr><th>Payroll</th><th class="num">Instalment</th><th class="num">Balance</th></tr></thead><tbody id="es-ln-prevrows"></tbody></table></div></div></div>',
      foot: '<span class="es-label es-ln-footnote" id="es-ln-foot"></span><button class="btn secondary" data-close>Cancel</button><button class="btn primary" id="es-ln-submit"><i data-lucide="send"></i>Submit request</button>' });
    var range = $('#es-ln-range', el);
    var setType = function (k, keepAmt) {
      type = k; T = TYPES[k];
      range.min = T.min; range.max = T.max; range.step = T.step;
      if (!keepAmt) amt = T.def;
      amt = Math.min(T.max, Math.max(T.min, amt)); range.value = amt;
      if (T.tenures.indexOf(ten) < 0) ten = T.tenures[Math.min(1, T.tenures.length - 1)];
      $('#es-ln-ten', el).innerHTML = T.tenures.map(function (t) { return '<button type="button" class="' + (t === ten ? 'active' : '') + '" data-ten="' + t + '">' + t + (t === 1 ? ' month' : ' months') + '</button>'; }).join('');
      $('#es-ln-min', el).textContent = 'Rs ' + FS.fmt(T.min); $('#es-ln-max', el).textContent = 'Max Rs ' + FS.fmt(T.max);
      $$('.es-ln-types .es-opt', el).forEach(function (b) { b.classList.toggle('on', b.dataset.type === k); });
      live(true);
    };
    var live = function (rebuild) {
      var emi = Math.ceil(amt / ten), cs = checks(type, amt, ten), ok = cs.every(function (c) { return c[0]; }), pct = (LOAN.emi + emi) / NET * 100;
      range.style.setProperty('--f', ((amt - T.min) / (T.max - T.min) * 100) + '%');
      ES.tick($('#es-ln-amt', el), amt, { dec: 0, prefix: 'Rs ', dur: 260 });
      ES.tick($('#es-ln-emi', el), emi, { dec: 0, prefix: 'Rs ', dur: 260 });
      $('#es-ln-pct', el).textContent = FS.fmt(pct, 1) + '%';
      var mf = $('#es-ln-meterfill', el); mf.style.width = Math.min(100, pct / 60 * 100) + '%'; mf.classList.toggle('bad', pct > 40); mf.classList.toggle('warn', pct > 32 && pct <= 40);
      $('#es-ln-checks', el).innerHTML = cs.map(function (c) { return '<li class="' + (c[0] ? 'ok' : 'bad') + '"><span><i data-lucide="' + (c[0] ? 'check' : 'x') + '"></i></span><div><b>' + c[1] + '</b><small>' + c[2] + '</small></div></li>'; }).join('');
      var rows = '', bal = amt;
      for (var i = 0; i < ten; i++) { var ins = i === ten - 1 ? bal : emi; bal -= ins; var d = new Date(2026, 9 + i, 1); rows += '<tr class="' + (rebuild ? 'es-in' : '') + '" style="--i:' + i + '"><td><b>' + mlabel(d.getFullYear(), d.getMonth()) + '</b><small>PR-' + d.getFullYear() + '-' + ES.pad(d.getMonth() + 1) + '</small></td><td class="num">' + FS.fmt(ins, 2) + '</td><td class="num">' + FS.fmt(Math.max(0, bal), 2) + '</td></tr>'; }
      $('#es-ln-prevrows', el).innerHTML = rows;
      var sub = $('#es-ln-submit', el); sub.disabled = !ok;
      $('#es-ln-foot', el).innerHTML = ok ? '<i data-lucide="circle-check"></i>Eligible · first deduction October payroll' : '<i data-lucide="circle-alert"></i>Fix the highlighted checks to continue';
      $('#es-ln-foot', el).classList.toggle('bad', !ok);
      FS.icons(el);
    };
    range.addEventListener('input', function () { amt = +range.value; live(false); });
    el.addEventListener('click', function (e) {
      var o = e.target.closest('[data-type]'); if (o) setType(o.dataset.type);
      var t = e.target.closest('[data-ten]'); if (t) { ten = +t.dataset.ten; $$('#es-ln-ten button', el).forEach(function (b) { b.classList.toggle('active', b === t); }); live(true); }
      var s = e.target.closest('#es-ln-submit');
      if (s && !s.disabled) {
        ES.busy(s, 1000, 'Submitting…').then(function () {
          var no = (type === 'adv' ? 'ADV' : type === 'med' ? 'MED' : 'LN') + '-2026-0' + (140 + HIST.length);
          HIST.unshift({ no: no, t: T.t, amt: amt, d: 'Requested today · ' + ten + ' × Rs ' + FS.fmt(Math.ceil(amt / ten)) + ' from Oct payroll', st: 'Pending', at: 1, ic: T.ic, tone: 'orange', subs: ['Today', 'Zainab Raza', 'Ayesha Noor', 'Hira Ali', ''] });
          if (type === 'adv') pendingAdv = true;
          ES.closeSheet(el); renderHist(sec); paintElig(sec);
          var first = $('.es-ln-h', sec); ES.flash(first);ES.scrollTo(first);
          ES.celebrate(first);
          FS.toast(no + ' submitted · Zainab Raza notified on WhatsApp', { tone: 'good' });
        });
      }
    });
    setType(type, false);
  }
  function renderHist(sec) { $('#es-ln-hist', sec).innerHTML = HIST.map(histItem).join(''); FS.icons($('#es-ln-hist', sec)); }
  function paintElig(sec) {
    var cs = checks('adv', 30000, 3);
    $('#es-ln-elig', sec).innerHTML = cs.map(function (c) { return '<li class="' + (c[0] ? 'ok' : 'bad') + '"><span><i data-lucide="' + (c[0] ? 'check' : 'x') + '"></i></span><div><b>' + c[1] + '</b><small>' + c[2] + '</small></div></li>'; }).join('');
    FS.icons($('#es-ln-elig', sec));
  }
  function statement() {
    var me = ES.ME;
    return ES.letterhead('<b>Loan statement</b><br>' + LOAN.no + '<br>As of 01 Oct 2026') +
      '<div class="paper-meta"><div><small>Borrower</small><b>' + me.name + '</b><br>' + me.id + ' · ' + me.role + '</div><div><small>Facility</small>' + LOAN.t + ' · interest-free<br>Disbursed 02 Mar 2026</div><div><small>Principal</small><b>Rs ' + FS.fmt(LOAN.amt, 2) + '</b><br>24 × Rs 5,000</div><div><small>Outstanding</small><b>Rs 85,000.00</b><br>Ends Feb 2028</div></div>' +
      '<table class="tbl" data-plain><thead><tr><th>#</th><th>Month</th><th>Payroll</th><th class="num">Instalment</th><th class="num">Balance</th><th>Status</th></tr></thead><tbody>' + sched() + '</tbody></table>' +
      '<div class="paper-foot"><span>Recovered through payroll under the Al-Noor staff loan policy (rev. Jan 2026).</span><span>Hira Ali · Senior Accountant</span></div>';
  }

  ES.route('ess/loans', {
    render: function () {
      var dots = ''; for (var i = 0; i < LOAN.n; i++) dots += '<i class="' + (i < LOAN.paid ? 'on' : i === LOAN.paid ? 'next' : '') + '" style="--i:' + i + '" data-tip="Instalment ' + (i + 1) + (i < LOAN.paid ? ' · recovered' : i === LOAN.paid ? ' · Oct 2026 payroll' : '') + '"></i>';
      return '<div class="es-grid es-g4 es-keep2 es-ln-kpis">' +
          [['Outstanding', 'Rs 85,000', '1 active loan', 'wallet', 'green'], ['Monthly deduction', 'Rs 5,000', 'Next: 31 Oct payroll', 'calendar-clock', 'blue'], ['Eligible advance', 'Rs 46,000', '50% of basic salary', 'sparkles', 'lime'], ['Repaid to date', 'Rs 35,000', '7 of 24 instalments', 'circle-check', 'violet']].map(function (k) {
            return '<div class="es-card es-ln-kpi"><div class="es-row"><span class="es-label">' + k[0] + '</span><span class="spacer"></span><span class="icon-tile ' + k[4] + '"><i data-lucide="' + k[3] + '"></i></span></div><b class="num-big" data-count>' + k[1] + '</b><small>' + k[2] + '</small></div>';
          }).join('') + '</div>' +
        '<div class="es-grid es-wide">' +
          '<div class="es-card es-ln-active"><div class="es-head"><span class="icon-tile green"><i data-lucide="bike"></i></span><div><h3>Motorcycle loan</h3><p>' + LOAN.no + ' · disbursed 02 Mar 2026 · interest-free</p></div><span class="spacer"></span>' + ES.badge('Active') + '</div>' +
            '<div class="es-ln-body">' + ES.ring(85000 / 120000 * 100, { size: 168, stroke: 3.2, tone: 'var(--es-forest)', label: '<span class="es-ln-ringv">Rs 85,000</span>', sub: 'outstanding of Rs 120,000', cls: 'es-ln-ring' }) +
              '<div class="es-ln-facts"><div><span class="es-label">Monthly EMI</span><b>' + FS.money(5000) + '</b></div><div><span class="es-label">Next deduction</span><b>31 Oct 2026</b><small>October payroll · PR-2026-10</small></div><div><span class="es-label">Instalments</span><b>7 <span class="es-muted">of 24</span></b><small>Ends February 2028</small></div></div></div>' +
            '<div class="es-ln-dots">' + dots + '</div>' +
            '<div class="es-row wrap"><button class="btn secondary sm" type="button" data-act="toggle"><i data-lucide="list"></i>Repayment schedule</button><button class="btn secondary sm" type="button" data-act="statement"><i data-lucide="file-text"></i>Statement</button><button class="btn ghost sm" type="button" data-act="prepay"><i data-lucide="zap"></i>Prepay</button></div>' +
            '<div class="es-ln-sched" id="es-ln-sched"><div><div class="table-wrap"><table class="tbl" data-plain><thead><tr><th>#</th><th>Month</th><th>Payroll run</th><th class="num">Instalment</th><th class="num">Balance after</th><th>Status</th></tr></thead><tbody>' + sched() + '</tbody></table></div></div></div>' +
          '</div>' +
          '<div class="es-col"><div class="es-card es-ln-eligcard"><div class="es-head"><h3>Salary advance</h3><span class="spacer"></span><span class="pill"><i data-lucide="shield-check"></i>Pre-approved</span></div>' +
            '<span class="es-label">You can request up to</span><b class="num-big">' + FS.money(46000) + '</b>' +
            '<ul class="es-ln-checks" id="es-ln-elig"></ul>' +
            '<button class="btn primary" type="button" data-act="request"><i data-lucide="hand-coins"></i>Request advance</button></div>' +
            '<div class="es-card"><div class="es-head"><h3>How it works</h3></div><ol class="es-ln-how"><li><b>Request</b><span>Pick an amount and tenure. EMI is calculated instantly.</span></li><li><b>Approve</b><span>Zainab Raza, then HR and Finance · usually 2 days.</span></li><li><b>Disburse</b><span>IBFT to Meezan ****4417 within 24 hours.</span></li><li><b>Recover</b><span>Auto-deducted from payroll. No interest, ever.</span></li></ol></div>' +
          '</div></div>' +
        '<div class="es-card"><div class="es-head"><h3>Requests &amp; history</h3><span class="spacer"></span><span class="es-label">All loans and advances since joining</span></div><div id="es-ln-hist" class="es-ln-hist"></div></div>';
    },
    bind: function (sec) {
      renderHist(sec); paintElig(sec);
      ES.acts(sec, {
        request: function () { openRequest(sec); },
        toggle: function (b) { var s = $('#es-ln-sched', sec); s.classList.toggle('on'); b.classList.toggle('active'); },
        statement: function () { ES.paper({ title: 'Loan statement · ' + LOAN.no, sub: 'As of 01 Oct 2026', html: statement(), file: 'Loan-Statement-' + LOAN.no + '.pdf' }); },
        prepay: function () { ES.confirm({ title: 'Prepay Rs 10,000 in October?', text: 'An extra Rs 10,000 will be recovered from your October salary, finishing the loan two months early (Dec 2027).', okLabel: 'Request prepayment' }).then(function (ok) { if (ok) FS.toast('Prepayment request sent to Payroll', { tone: 'good' }); }); },
        withdraw: function (b) {
          var no = b.dataset.no;
          ES.confirm({ title: 'Withdraw ' + no + '?', text: 'Your approvers will be notified. You can submit a new request any time.', okLabel: 'Withdraw', danger: true }).then(function (ok) {
            if (!ok) return; var h = HIST.find(function (x) { return x.no === no; }); h.st = 'Withdrawn'; h.at = 1; if (/^ADV/.test(no)) pendingAdv = false;
            renderHist(sec); paintElig(sec); FS.toast(no + ' withdrawn', { tone: 'info' });
          });
        },
        policy: function () {
          ES.sheet({ title: 'Staff loan & advance policy', sub: 'Al-Noor Enterprises · revised January 2026', cls: 'es-sheet-sm', html: '<ul class="es-tx-notes es-ln-policy">' +
            ['Salary advance up to 50% of basic, repaid within 3 months.', 'Staff loan up to Rs 150,000 after 1 year of service, repaid within 24 months. One active staff loan at a time.', 'Medical emergency loan up to Rs 100,000 with a hospital estimate.', 'Total loan deductions cannot exceed 40% of monthly net pay.', 'All facilities are interest-free and recovered through payroll.', 'Outstanding balances are settled from final dues on separation.'].map(function (t) { return '<li><i data-lucide="check"></i><span>' + t + '</span></li>'; }).join('') + '</ul>',
            foot: '<button class="btn primary" data-close>Got it</button>' });
        },
      });
    },
  });
})();

/* ---------- 06-expenses.js ---------- */
/* ess/expenses: KPIs, receipt-scan new claim (laser sweep + typed OCR), policy limits, claims with tracker */
(function () {
  var $ = ES.$, $$ = ES.$$;
  var CAT = {
    'Fuel': { ic: 'fuel', tone: 'green', lim: 15000, per: 'month', used: 9850 },
    'Client meal': { ic: 'utensils', tone: 'orange', lim: 2500, per: 'meal' },
    'Travel': { ic: 'bus', tone: 'blue', pre: true },
    'Lodging': { ic: 'bed-double', tone: 'violet', lim: 12000, per: 'night' },
    'Mobile': { ic: 'smartphone', tone: 'lime', lim: 3000, per: 'month', used: 3000 },
    'Parking & tolls': { ic: 'circle-parking', tone: 'blue' },
    'Stationery': { ic: 'pen-line', tone: 'green' },
  };
  var CC = ['Sales – Lahore North', 'Sales – Lahore South', 'Key Accounts'];
  var STEPS = ['Sent', 'Manager', 'Finance', 'Paid'];
  function trk(c, subs) {
    var t = ES.tracker(STEPS, c.at, c.st === 'Rejected' ? 'rej' : 'ok', subs);
    if (c.st === 'Approved') { var k = t.lastIndexOf('<li class="done"'); t = t.slice(0, k) + t.slice(k).replace('class="done"', 'class="now"').replace('data-lucide="check"', 'data-lucide="loader"'); }
    return t;
  }
  var CLAIMS = [
    { no: 'EX-2026-0231', d: '29 Sep 2026', m: 'PSO Service Station · Ferozepur Rd', cat: 'Fuel', cc: CC[1], amt: 4850, st: 'Pending', at: 1, note: 'Route visits Township → Kot Lakhpat' },
    { no: 'EX-2026-0228', d: '26 Sep 2026', m: 'Salt’n Pepper Village · MM Alam Rd', cat: 'Client meal', cc: CC[2], amt: 2500, st: 'Pending', at: 2, note: 'Lunch with Packages Ltd procurement' },
    { no: 'EX-2026-0219', d: '18 Sep 2026', m: 'Jazz Business · postpaid', cat: 'Mobile', cc: CC[0], amt: 3000, st: 'Approved', at: 3, note: 'September mobile allowance' },
    { no: 'EX-2026-0214', d: '15 Sep 2026', m: 'Shell Select · Main Blvd Gulberg', cat: 'Fuel', cc: CC[0], amt: 5000, st: 'Approved', at: 3, note: 'Gulberg & Model Town retailers' },
    { no: 'EX-2026-0207', d: '09 Sep 2026', m: 'Daewoo Express · Lahore → Faisalabad', cat: 'Travel', cc: CC[2], amt: 4600, st: 'Approved', at: 3, note: 'Interloop Ltd quarterly review · TR-2026-044' },
    { no: 'EX-2026-0201', d: '03 Sep 2026', m: 'Monal Lahore · Gulberg', cat: 'Client meal', cc: CC[2], amt: 6800, st: 'Rejected', at: 1, note: 'Over meal limit without pre-approval', why: 'Above Rs 2,500 meal limit. Please resubmit with pre-approval.' },
    { no: 'EX-2026-0187', d: '30 Aug 2026', m: 'PSO Service Station · Canal Rd', cat: 'Fuel', cc: CC[0], amt: 14200, st: 'Reimbursed', at: 4, note: 'August fuel · paid in PR-2026-08' },
    { no: 'EX-2026-0174', d: '07 Aug 2026', m: 'Daewoo Express · Lahore ⇄ Islamabad', cat: 'Travel', cc: CC[2], amt: 9020, st: 'Reimbursed', at: 4, note: 'Shifa International contract · TR-2026-031' },
    { no: 'EX-2026-0171', d: '06 Aug 2026', m: 'Hotel One · Blue Area Islamabad', cat: 'Lodging', cc: CC[2], amt: 11500, st: 'Reimbursed', at: 4, note: '1 night · Shifa International visit' },
    { no: 'EX-2026-0160', d: '28 Jul 2026', m: 'Shell Select · Main Blvd Gulberg', cat: 'Fuel', cc: CC[0], amt: 14200, st: 'Reimbursed', at: 4, note: 'July fuel · paid in PR-2026-07' },
  ];
  var RECEIPTS = {
    camera: { m: 'Shell Select · Main Blvd Gulberg III', d: '30 Sep 2026', amt: 6250, cat: 'Fuel', conf: 97, lines: [['Hi-Octane 98', '21.6 L', '6,250'], ['Pump 04', 'Card ****4417', '']], head: 'SHELL SELECT', addr: 'Main Boulevard, Gulberg III, Lahore', ntn: 'NTN 0787716-2', no: 'TXN 88412-04' },
    upload: { m: 'Salt’n Pepper Village · MM Alam Rd', d: '30 Sep 2026', amt: 3240, cat: 'Client meal', conf: 94, lines: [['Chicken Karahi (half)', '1', '1,450'], ['Daal Makhni', '1', '690'], ['Naan × 4, Raita', '', '520'], ['Fresh lime × 2', '', '580']], head: 'SALT’N PEPPER VILLAGE', addr: '42-E MM Alam Road, Gulberg, Lahore', ntn: 'STRN 03-04-2101-554-19', no: 'Bill #10734 · Table 12' },
  };
  var filter = 'All';

  function kpis(sec) {
    var sum = function (f) { return CLAIMS.filter(f).reduce(function (a, c) { return a + c.amt; }, 0); };
    var pend = CLAIMS.filter(function (c) { return c.st === 'Pending'; });
    ES.tick($('#es-ex-k1', sec), sum(function (c) { return c.st === 'Pending'; }), { dec: 0, prefix: 'Rs ' });
    $('#es-ex-k1s', sec).textContent = pend.length + ' claim' + (pend.length === 1 ? '' : 's') + ' awaiting approval';
    ES.tick($('#es-ex-k2', sec), sum(function (c) { return c.st === 'Approved'; }), { dec: 0, prefix: 'Rs ' });
    ES.tick($('#es-ex-k3', sec), sum(function (c) { return c.st === 'Reimbursed'; }), { dec: 0, prefix: 'Rs ' });
    var fuel = sum(function (c) { return c.cat === 'Fuel' && /Sep 2026/.test(c.d) && c.st !== 'Rejected'; });
    ES.tick($('#es-ex-k4', sec), fuel, { dec: 0, prefix: 'Rs ' });
    var p = Math.min(100, fuel / 15000 * 100), bar = $('#es-ex-k4b', sec); bar.style.width = p + '%'; bar.parentElement.classList.toggle('warn', p > 85);
    $$('.es-ex-chips button', sec).forEach(function (b) { var k = b.dataset.f, n = CLAIMS.filter(function (c) { return k === 'All' || c.st === k; }).length; b.querySelector('i').textContent = n; });
  }
  function row(c, i) {
    var C = CAT[c.cat] || { ic: 'receipt', tone: 'green' };
    return '<div class="es-ex-row es-in" style="--i:' + i + '" data-no="' + c.no + '" data-act="open" tabindex="0" role="button">' +
      '<span class="icon-tile ' + C.tone + '"><i data-lucide="' + C.ic + '"></i></span>' +
      '<div class="es-ex-m"><b>' + c.m + '</b><small>' + c.no + ' · ' + c.d + ' · ' + c.cat + '</small></div>' +
      '<span class="es-ex-cc">' + c.cc + '</span>' +
      '<div class="es-ex-trk">' + trk(c) + '</div>' +
      '<div class="es-ex-amt"><b>' + FS.money(c.amt) + '</b>' + ES.badge(c.st) + '</div></div>';
  }
  function renderList(sec) {
    var xs = CLAIMS.filter(function (c) { return filter === 'All' || c.st === filter; });
    var host = $('#es-ex-list', sec);
    host.innerHTML = xs.length ? xs.map(row).join('') : '<div class="es-empty"><span class="icon-tile lime"><i data-lucide="receipt"></i></span><b>No ' + filter.toLowerCase() + ' claims</b><span>Scan a receipt to start a new claim.</span></div>';
    FS.icons(host);
  }
  function policyCheck(cat, amt) {
    var C = CAT[cat]; if (!C || !amt) return null;
    if (C.pre) return { tone: 'info', ic: 'info', t: 'Intercity travel needs pre-approval', p: 'Attach your travel request (TR-…) so Finance can match it.' };
    if (!C.lim) return { tone: 'good', ic: 'circle-check', t: 'Within policy', p: 'No limit for ' + cat.toLowerCase() + '; receipt required.' };
    var used = C.per === 'month' ? (C.used || 0) : 0, tot = used + amt;
    if (tot > C.lim) return { tone: 'warn', ic: 'triangle-alert', t: 'Over ' + cat.toLowerCase() + ' limit by Rs ' + FS.fmt(tot - C.lim), p: (C.per === 'month' ? 'Used Rs ' + FS.fmt(used) + ' of Rs ' + FS.fmt(C.lim) + ' this month. ' : 'Limit Rs ' + FS.fmt(C.lim) + ' per ' + C.per + '. ') + 'The excess needs a justification and Zainab Raza’s approval.' };
    if (tot > C.lim * .85) return { tone: 'warn', ic: 'gauge', t: 'Close to your monthly limit', p: 'Rs ' + FS.fmt(C.lim - tot) + ' left of Rs ' + FS.fmt(C.lim) + ' after this claim.' };
    return { tone: 'good', ic: 'circle-check', t: 'Within policy', p: 'Rs ' + FS.fmt(C.lim - tot) + ' left of Rs ' + FS.fmt(C.lim) + ' per ' + C.per + '.' };
  }
  function receiptHtml(r) {
    return '<div class="es-ex-rcpt"><b class="es-ex-rh">' + r.head + '</b><small>' + r.addr + '</small><small>' + r.ntn + '</small><hr><div class="es-ex-rl"><span>' + r.no + '</span><span>' + r.d + ' 19:42</span></div><hr>' +
      r.lines.map(function (l) { return '<div class="es-ex-rl"><span>' + l[0] + (l[1] ? ' <em>' + l[1] + '</em>' : '') + '</span><span>' + l[2] + '</span></div>'; }).join('') +
      '<hr><div class="es-ex-rl es-ex-rt"><span>TOTAL</span><span>Rs ' + FS.fmt(r.amt) + '</span></div><small class="es-ex-rthx">Thank you · FBR POS invoice</small><div class="es-ex-qr"></div></div>';
  }

  function openClaim(sec, mode) {
    var el = ES.sheet({ title: 'New expense claim', sub: 'Scan a receipt and we fill the details · approver Zainab Raza, then Finance', cls: 'es-ex-sheet',
      html: '<div class="es-ex-stage" data-phase="capture">' +
        '<div class="es-ex-capture"><div class="es-ex-dz" data-dz tabindex="0" role="button"><span class="es-ex-dzic"><i data-lucide="scan-line"></i></span><b>Drop a receipt here</b><span>JPG, PNG or PDF · or click to browse</span></div>' +
          '<div class="es-ex-or"><span>or</span></div>' +
          '<div class="es-ex-capbtns"><button type="button" class="btn primary lg" data-cam><i data-lucide="camera"></i>Use camera</button><button type="button" class="btn ghost" data-manual><i data-lucide="keyboard"></i>Enter manually</button></div></div>' +
        '<div class="es-ex-scanwrap"><div class="es-ex-scan"><div class="es-ex-flash"></div><div class="es-ex-paperbox" id="es-ex-paperbox"></div><span class="es-ex-c tl"></span><span class="es-ex-c tr"></span><span class="es-ex-c bl"></span><span class="es-ex-c br"></span><i class="es-ex-laser"></i><div class="es-ex-scanst"><span class="es-spin"></span><b id="es-ex-scanst">Detecting edges…</b></div></div>' +
          '<div class="es-ex-form">' +
            '<div class="es-row es-ex-ocr" id="es-ex-ocr"><span class="es-ex-conf" id="es-ex-conf"><i data-lucide="sparkles"></i>Reading receipt…</span></div>' +
            '<div class="form-grid">' +
              '<label class="full"><span>Merchant</span><input id="es-ex-f-m" placeholder="e.g. PSO Service Station"></label>' +
              '<label><span>Date</span><input id="es-ex-f-d" placeholder="dd Mon yyyy"></label>' +
              '<label><span>Amount (Rs)</span><input id="es-ex-f-a" inputmode="numeric" placeholder="0"></label>' +
              '<label><span>Category</span><select id="es-ex-f-c"><option value="">Select…</option>' + Object.keys(CAT).map(function (k) { return '<option>' + k + '</option>'; }).join('') + '</select></label>' +
              '<label><span>Project / cost centre</span><select id="es-ex-f-cc">' + CC.map(function (c) { return '<option>' + c + '</option>'; }).join('') + '</select></label>' +
              '<label class="full"><span>Purpose</span><input id="es-ex-f-p" placeholder="Client, route or reason"></label>' +
            '</div>' +
            '<div class="es-ex-pol" id="es-ex-pol"></div>' +
          '</div></div></div>',
      foot: '<button class="btn secondary" data-close>Cancel</button><button class="btn secondary" data-draft>Save draft</button><button class="btn primary" data-submit disabled><i data-lucide="send"></i>Submit claim</button>' });
    el.classList.add('es-sheet-lg');
    var stage = $('.es-ex-stage', el), busy = false;
    var F = function (id) { return $('#es-ex-f-' + id, el); };
    var pol = function () {
      var amt = +String(F('a').value).replace(/[^\d.]/g, '') || 0, r = policyCheck(F('c').value, amt), host = $('#es-ex-pol', el);
      host.innerHTML = r ? '<div class="es-ex-polc ' + r.tone + '"><i data-lucide="' + r.ic + '"></i><div><b>' + r.t + '</b><span>' + r.p + '</span></div></div>' : '';
      FS.icons(host);
      $('[data-submit]', el).disabled = busy || !(F('m').value && amt && F('c').value);
    };
    ['input', 'change'].forEach(function (ev) { el.addEventListener(ev, function (e) { if (e.target.closest('.es-ex-form')) pol(); }); });
    var scan = function (kind) {
      if (busy) return; busy = true;
      var r = RECEIPTS[kind];
      $('#es-ex-paperbox', el).innerHTML = receiptHtml(r);
      stage.dataset.phase = 'scan'; stage.dataset.kind = kind;
      var st = $('#es-ex-scanst', el);
      var steps = kind === 'camera' ? [[0, 'Hold steady…'], [700, 'Detecting edges…'], [1400, 'Reading text…'], [2300, 'Extracting fields…']] : [[0, 'Uploading receipt.jpg…'], [600, 'Detecting edges…'], [1300, 'Reading text…'], [2200, 'Extracting fields…']];
      steps.forEach(function (s) { setTimeout(function () { st.textContent = s[1]; }, s[0]); });
      if (kind === 'camera') setTimeout(function () { stage.classList.add('es-ex-shot'); }, 650);
      setTimeout(function () {
        stage.dataset.phase = 'form';
        var seq = Promise.resolve();
        [['m', r.m], ['d', r.d], ['a', FS.fmt(r.amt)]].forEach(function (p) { seq = seq.then(function () { F(p[0]).closest('label').classList.add('es-ex-hot'); return ES.typeInto(F(p[0]), p[1], p[0] === 'm' ? 26 : 45).then(function () { F(p[0]).closest('label').classList.remove('es-ex-hot'); F(p[0]).closest('label').classList.add('es-ex-got'); }); }); });
        seq.then(function () { return ES.wait(160); }).then(function () {
          var c = F('c'); c.closest('label').classList.add('es-ex-hot'); c.value = r.cat; c.dispatchEvent(new Event('change', { bubbles: true }));
          return ES.wait(380).then(function () { c.closest('label').classList.remove('es-ex-hot'); c.closest('label').classList.add('es-ex-got'); });
        }).then(function () {
          if (r.cat === 'Client meal') { F('cc').value = 'Key Accounts'; F('p').value = 'Lunch with Packages Ltd procurement team'; } else F('p').value = 'Route visits · Gulberg & Model Town retailers';
          var cf = $('#es-ex-conf', el); cf.className = 'es-ex-conf done'; cf.innerHTML = '<i data-lucide="badge-check"></i>OCR confidence <b>' + r.conf + '%</b>';
          $('#es-ex-ocr', el).insertAdjacentHTML('beforeend', '<span class="es-files">' + ES.fileChip(kind === 'camera' ? 'IMG_20260930_1942.jpg' : 'receipt.jpg', kind === 'camera' ? '1.2 MB' : '846 KB') + '</span>');
          FS.icons(el); busy = false; pol();
          ES.flash($('#es-ex-pol .es-ex-polc', el));
        });
      }, 2900);
    };
    el.addEventListener('click', function (e) {
      if (e.target.closest('[data-cam]')) scan('camera');
      else if (e.target.closest('[data-dz]')) scan('upload');
      else if (e.target.closest('[data-manual]')) { stage.dataset.phase = 'form'; stage.dataset.kind = 'manual'; $('#es-ex-conf', el).innerHTML = '<i data-lucide="pencil"></i>Manual entry · attach a receipt later'; FS.icons(el); F('d').value = '01 Oct 2026'; setTimeout(function () { F('m').focus(); }, 50); pol(); }
      var dr = e.target.closest('[data-draft]'); if (dr) { ES.busy(dr, 600, 'Saving…').then(function () { ES.closeSheet(el); FS.toast('Draft saved · finish it from Expense Claims', { tone: 'info' }); }); }
      var sb = e.target.closest('[data-submit]');
      if (sb && !sb.disabled) {
        var amt = +String(F('a').value).replace(/[^\d.]/g, '');
        ES.busy(sb, 1000, 'Submitting…').then(function () {
          var no = 'EX-2026-0' + (232 + CLAIMS.length - 10);
          CLAIMS.unshift({ no: no, d: F('d').value || '01 Oct 2026', m: F('m').value, cat: F('c').value, cc: F('cc').value, amt: amt, st: 'Pending', at: 1, note: F('p').value });
          if (CAT[F('c').value] && CAT[F('c').value].per === 'month') CAT[F('c').value].used = (CAT[F('c').value].used || 0) + amt;
          ES.closeSheet(el); filter = 'All'; $$('.es-ex-chips button', sec).forEach(function (b) { b.classList.toggle('active', b.dataset.f === 'All'); });
          renderList(sec); kpis(sec); limits(sec);
          var first = $('.es-ex-row', sec); ES.flash(first); ES.celebrate(first);
          FS.toast(no + ' submitted · Rs ' + FS.fmt(amt) + ' sent to Zainab Raza', { tone: 'good' });
        });
      }
    });
    var dz = $('[data-dz]', el);
    ['dragenter', 'dragover'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('over'); if (ev === 'drop') scan('upload'); }); });
    dz.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); scan('upload'); } });
    if (mode) setTimeout(function () { scan(mode); }, 350);
  }
  function limits(sec) {
    var rows = [['Fuel', CAT.Fuel.used, 15000, 'this month'], ['Mobile', CAT.Mobile.used, 3000, 'this month'], ['Client meal', 2500, 2500, 'per meal'], ['Lodging', 11500, 12000, 'per night']];
    $('#es-ex-lims', sec).innerHTML = rows.map(function (r, i) {
      var p = Math.min(100, r[1] / r[2] * 100), C = CAT[r[0]];
      return '<div class="es-ex-lim" style="--i:' + i + '"><span class="icon-tile ' + C.tone + '"><i data-lucide="' + C.ic + '"></i></span><div><div class="es-row"><b>' + r[0] + '</b><span class="spacer"></span><small>' + (i < 2 ? 'Rs ' + FS.fmt(r[1]) + ' / ' : 'Max ') + 'Rs ' + FS.fmt(r[2]) + ' ' + r[3] + '</small></div>' +
        (i < 2 ? '<div class="progress ' + (p >= 100 ? 'danger' : p > 85 ? 'warn' : '') + '"><i style="width:' + p.toFixed(1) + '%"></i></div>' : '<small class="es-muted">' + (i === 2 ? 'Higher needs pre-approval' : 'Actuals above need receipts') + '</small>') + '</div></div>';
    }).join('');
    FS.icons($('#es-ex-lims', sec));
  }
  function detail(c) {
    var C = CAT[c.cat] || {};
    FS.drawer({ title: c.no, subtitle: c.cat + ' · ' + c.d,
      html: '<div class="es-ex-dhero"><span class="icon-tile ' + (C.tone || '') + '"><i data-lucide="' + (C.ic || 'receipt') + '"></i></span><div><b>' + c.m + '</b><span>' + FS.money(c.amt) + '</span></div>' + ES.badge(c.st) + '</div>' +
        trk(c, ['Bilal Khan', 'Zainab Raza', 'Hira Ali', c.st === 'Reimbursed' ? 'Payroll' : 'Oct payroll']) +
        (c.why ? '<div class="banner danger" style="margin-top:16px"><i data-lucide="circle-x"></i><div><b>Rejected by Zainab Raza</b><p>' + c.why + '</p></div></div>' : '') +
        '<div class="dl" style="margin-top:16px"><div><span>Cost centre</span><b>' + c.cc + '</b></div><div><span>Purpose</span><b>' + (c.note || '—') + '</b></div><div><span>Payment</span><b>' + (c.st === 'Reimbursed' ? 'Paid with payroll' : 'Reimburse with payroll') + '</b></div><div><span>Receipt</span><b>receipt-' + c.no.slice(-4) + '.jpg</b></div></div>',
      foot: c.st === 'Pending' ? '<button class="btn secondary" data-close>Close</button><button class="btn danger" data-close data-toast="' + c.no + ' withdrawn">Withdraw</button>' : c.st === 'Rejected' ? '<button class="btn secondary" data-close>Close</button><button class="btn primary" data-close data-toast="Opened as a new draft">Resubmit</button>' : '<button class="btn secondary" data-close>Close</button>' });
  }

  ES.route('ess/expenses', {
    render: function () {
      return '<div class="es-grid es-g4 es-keep2 es-ex-kpis">' +
          '<div class="es-card es-ex-kpi"><div class="es-row"><span class="es-label">Pending</span><span class="spacer"></span><span class="icon-tile orange"><i data-lucide="hourglass"></i></span></div><b class="num-big" id="es-ex-k1">Rs 0</b><small id="es-ex-k1s"></small></div>' +
          '<div class="es-card es-ex-kpi"><div class="es-row"><span class="es-label">Approved this month</span><span class="spacer"></span><span class="icon-tile green"><i data-lucide="circle-check"></i></span></div><b class="num-big" id="es-ex-k2">Rs 0</b><small>Paid with October payroll</small></div>' +
          '<div class="es-card es-ex-kpi"><div class="es-row"><span class="es-label">Reimbursed · FY</span><span class="spacer"></span><span class="icon-tile blue"><i data-lucide="banknote"></i></span></div><b class="num-big" id="es-ex-k3">Rs 0</b><small>4 claims since July</small></div>' +
          '<div class="es-card es-ex-kpi"><div class="es-row"><span class="es-label">Fuel used · Sep</span><span class="spacer"></span><span class="icon-tile lime"><i data-lucide="fuel"></i></span></div><b class="num-big" id="es-ex-k4">Rs 0</b><div class="progress"><i id="es-ex-k4b"></i></div><small>of Rs 15,000 monthly limit</small></div>' +
        '</div>' +
        '<div class="es-grid es-main">' +
          '<div class="es-card flush"><div class="es-head"><h3>My claims</h3><span class="spacer"></span><div class="chips es-ex-chips">' + ['All', 'Pending', 'Approved', 'Reimbursed', 'Rejected'].map(function (k, i) { return '<button type="button" class="' + (i ? '' : 'active') + '" data-f="' + k + '">' + k + ' <i>0</i></button>'; }).join('') + '</div></div>' +
            '<div class="es-ex-list" id="es-ex-list"></div></div>' +
          '<div class="es-col">' +
            '<div class="es-card es-ex-quick"><div class="es-head"><h3>Quick capture</h3><span class="spacer"></span><span class="pill"><i data-lucide="sparkles"></i>Auto-fill</span></div>' +
              '<button type="button" class="es-ex-qdrop" data-act="scan" data-mode="upload"><span class="es-ex-dzic"><i data-lucide="upload-cloud"></i></span><b>Drop or upload a receipt</b><small>We read merchant, date, amount and category</small></button>' +
              '<button type="button" class="btn primary" data-act="scan" data-mode="camera"><i data-lucide="camera"></i>Use camera</button></div>' +
            '<div class="es-card"><div class="es-head"><h3>Policy limits</h3><span class="spacer"></span><button type="button" class="es-link" data-act="policy">Full policy<i data-lucide="arrow-right"></i></button></div><div class="es-ex-lims" id="es-ex-lims"></div></div>' +
          '</div></div>';
    },
    bind: function (sec) {
      renderList(sec); limits(sec); kpis(sec);
      ES.acts(sec, {
        new: function () { openClaim(sec); },
        scan: function (b) { openClaim(sec, b.dataset.mode); },
        open: function (r) { var c = CLAIMS.find(function (x) { return x.no === r.dataset.no; }); if (c) detail(c); },
        policy: function () {
          ES.sheet({ title: 'Travel & expense policy', sub: 'Finance · updated 25 Sep 2026', cls: 'es-sheet-sm', html: '<ul class="es-tx-notes">' + [['fuel', 'Fuel up to Rs 15,000 a month for field sales staff.'], ['utensils', 'Client meals up to Rs 2,500 per meal; higher needs pre-approval.'], ['smartphone', 'Mobile Rs 3,000 a month against the bill.'], ['bed-double', 'Lodging up to Rs 12,000 per night outside Lahore.'], ['bus', 'Intercity travel with an approved travel request (TR).'], ['receipt', 'Submit within 30 days with an FBR POS or itemised receipt.']].map(function (t) { return '<li><i data-lucide="' + t[0] + '"></i><span>' + t[1] + '</span></li>'; }).join('') + '</ul>', foot: '<button class="btn primary" data-close>Got it</button>' });
        },
      });
      sec.addEventListener('keydown', function (e) { var r = e.target.closest('.es-ex-row'); if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); r.click(); } });
      sec.addEventListener('click', function (e) { var c = e.target.closest('.es-ex-chips [data-f]'); if (!c) return; filter = c.dataset.f; renderList(sec); });
    },
  });
})();

/* ---------- 07-profile.js ---------- */
/* ess/profile: header, tabbed details, request-change flow with pending badges, documents with expiry chips */
(function () {
  var $ = ES.$, $$ = ES.$$, M = ES.ME;
  var reveal = function (el, top) {
    if (!el) return;
    var p = el.parentElement;
    while (p && p !== document.body) { var o = getComputedStyle(p).overflowY; if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight) break; p = p.parentElement; }
    if (!p || p === document.body) p = document.scrollingElement;
    var r = el.getBoundingClientRect(), pr = p === document.scrollingElement ? { top: 0, height: innerHeight } : p.getBoundingClientRect();
    var y = p.scrollTop + r.top - pr.top - (top ? 90 : (pr.height - r.height) / 2);
    p.scrollTo({ top: Math.max(0, y), behavior: ES.reduce() ? 'auto' : 'smooth' });
  };
  /* field: [key, label, value, editable, icon] */
  var TABS = [
    { id: 'personal', label: 'Personal', ic: 'user-round', fields: [
      ['name', 'Full name', M.name, false, 'user-round'], ['father', 'Father’s name', 'Tariq Khan', false, 'users'],
      ['dob', 'Date of birth', M.dob, false, 'cake'], ['gender', 'Gender', 'Male', false, 'circle-user'],
      ['marital', 'Marital status', 'Married', true, 'heart'], ['cnic', 'CNIC', M.cnic, false, 'id-card'],
      ['blood', 'Blood group', M.blood, true, 'droplet'], ['pemail', 'Personal email', 'bilal.khan95@gmail.com', true, 'mail'],
      ['mobile', 'Mobile', M.phone, true, 'smartphone'], ['address', 'Home address', M.address, true, 'house'] ] },
    { id: 'job', label: 'Job', ic: 'briefcase', fields: [
      ['empid', 'Employee ID', M.id, false, 'hash'], ['role', 'Designation', M.role, false, 'briefcase'],
      ['dept', 'Department', 'Sales · Lahore territory', false, 'building-2'], ['grade', 'Grade', M.grade + ' · Executive band', false, 'layers'],
      ['manager', 'Reports to', M.manager + ' · Sales Manager', false, 'user-check'], ['branch', 'Work location', 'Lahore HQ · Gulberg III', false, 'map-pin'],
      ['joined', 'Date of joining', M.joined + ' · 4 yrs 6 mos', false, 'calendar-days'], ['type', 'Employment type', 'Permanent · confirmed 14 Sep 2022', false, 'badge-check'],
      ['shift', 'Shift', M.shift + ' (Mon – Fri)', false, 'clock'], ['reports', 'Direct reports', '4 field staff', false, 'users'] ] },
    { id: 'bank', label: 'Bank & Payroll', ic: 'landmark', fields: [
      ['bank', 'Salary bank', M.bank + ' · Johar Town branch', true, 'landmark'], ['acct', 'Account number', M.account, true, 'credit-card'],
      ['iban', 'IBAN', M.iban, true, 'scan-line'], ['paymode', 'Pay mode', 'Bank transfer (IBFT) · 30th of month', false, 'send'],
      ['ntn', 'NTN / tax status', M.ntn + ' · Filer (ATL active)', true, 'receipt-text'], ['eobi', 'EOBI number', M.eobi, false, 'shield-check'],
      ['pf', 'Provident fund', 'Member since Mar 2023 · 5% + 5%', false, 'piggy-bank'], ['basic', 'Basic salary', 'Rs 92,000 / month', false, 'banknote'],
      ['gross', 'Gross (Sep 2026)', 'Rs 142,500 incl. commission', false, 'wallet'], ['zakat', 'Zakat exemption', 'Not filed (CZ-50)', true, 'moon-star'] ] },
  ];
  var CONTACTS = [
    { n: 'Ayesha Khan', rel: 'Wife · primary', ph: '0300-4129087', city: 'Lahore' },
    { n: 'Tariq Khan', rel: 'Father', ph: '0321-4455120', city: 'Sialkot' },
  ];
  var DOCS = [
    { n: 'CNIC (front & back)', s: 'NADRA · 35202-4417823-7', exp: '2031-08-12', ic: 'id-card' },
    { n: 'Driving licence', s: 'Punjab · LHR-95-118204 · M/Car', exp: '2026-11-03', ic: 'car' },
    { n: 'Police character certificate', s: 'Punjab Police · Johar Town', exp: '2026-06-30', ic: 'shield' },
    { n: 'BBA (Hons)', s: 'University of the Punjab · 2017 · HEC attested', exp: '', ic: 'graduation-cap' },
    { n: 'MBA Marketing', s: 'University of Central Punjab · 2020', exp: '', ic: 'graduation-cap' },
    { n: 'Offer letter & contract', s: 'Signed 01 Mar 2022 · 4 pages', exp: '', ic: 'file-signature' },
  ];
  var pending = {}; /* key -> {to, reason, at} */

  function expChip(iso) {
    if (!iso) return '<span class="es-pf-exp ok"><i data-lucide="infinity"></i>No expiry</span>';
    var d = ES.parse(iso), days = Math.round((d - ES.TODAY) / 864e5);
    if (days < 0) return '<span class="es-pf-exp bad"><i data-lucide="circle-alert"></i>Expired ' + ES.dshort(iso) + ' ' + d.getFullYear() + '</span>';
    if (days <= 60) return '<span class="es-pf-exp soon"><i data-lucide="hourglass"></i>Expires in ' + days + ' days</span>';
    return '<span class="es-pf-exp ok"><i data-lucide="calendar-check"></i>Valid to ' + ES.dshort(iso) + ' ' + d.getFullYear() + '</span>';
  }
  function field(f) {
    var p = pending[f[0]], mask = f[0] === 'iban' || f[0] === 'acct';
    var val = mask ? '<span class="es-pf-mask" data-real="' + ES.esc(f[2]) + '">' + ES.esc(f[2].replace(/\d(?=[\d ]{4})/g, '•')) + '</span><button type="button" class="es-pf-eye" data-act="reveal" aria-label="Show"><i data-lucide="eye"></i></button>' : ES.esc(f[2]);
    return '<div class="es-pf-field ' + (p ? 'has-pending' : '') + '" data-key="' + f[0] + '"><span class="es-pf-fic"><i data-lucide="' + f[4] + '"></i></span>' +
      '<div class="es-pf-fv"><span>' + f[1] + '</span><b>' + val + '</b>' +
      (p ? '<em class="es-pf-pend"><i data-lucide="clock-3"></i>Pending change → ' + ES.esc(p.to) + '</em>' : '') + '</div>' +
      (f[3] ? (p ? '<button type="button" class="btn ghost sm" data-act="withdraw">Withdraw</button>' : '<button type="button" class="btn ghost sm es-pf-edit" data-act="change"><i data-lucide="pencil"></i><span>Change</span></button>') : '<span class="es-pf-lock" data-tip="Managed by HR"><i data-lucide="lock"></i></span>') + '</div>';
  }
  function paneFields(t) { return '<div class="es-pf-fields">' + t.fields.map(field).join('') + '</div>'; }
  function contactsHtml() {
    return '<div class="es-pf-contacts">' + CONTACTS.map(function (c, i) {
      return '<div class="es-pf-contact es-in" style="--i:' + i + '">' + ES.av(c.n, 'lg') + '<div><b>' + c.n + '</b><small>' + c.rel + ' · ' + c.city + '</small><span class="es-pf-ph"><i data-lucide="phone"></i>' + c.ph + '</span></div>' +
        '<div class="es-pf-cacts"><button type="button" class="icon-btn-sm" data-act="call" data-ph="' + c.ph + '" data-tip="Call" aria-label="Call"><i data-lucide="phone"></i></button><button type="button" class="icon-btn-sm" data-act="edit-contact" data-i="' + i + '" data-tip="Edit" aria-label="Edit"><i data-lucide="pencil"></i></button></div></div>';
    }).join('') + '<button type="button" class="es-pf-add" data-act="add-contact"><i data-lucide="user-plus"></i><b>Add emergency contact</b><small>Up to 3 contacts</small></button></div>' +
      '<div class="es-pf-medical"><span class="icon-tile red"><i data-lucide="heart-pulse"></i></span><div><b>Medical notes for first responders</b><small>Blood group B+ · No known allergies · Panel hospital: Shaukat Khanum Memorial, Johar Town</small></div></div>';
  }
  function docsHtml() {
    return '<div class="es-pf-docs">' + DOCS.map(function (d, i) {
      return '<div class="es-pf-doc es-in" style="--i:' + i + '"><span class="es-pf-thumb"><i data-lucide="' + d.ic + '"></i></span><div class="es-pf-dtx"><b>' + d.n + '</b><small>' + d.s + '</small>' + expChip(d.exp) + '</div>' +
        '<div class="es-pf-dacts"><button type="button" class="icon-btn-sm" data-act="view-doc" data-i="' + i + '" data-tip="Preview" aria-label="Preview"><i data-lucide="eye"></i></button><button type="button" class="icon-btn-sm" data-act="upload-doc" data-i="' + i + '" data-tip="Replace" aria-label="Replace"><i data-lucide="upload"></i></button></div></div>';
    }).join('') + '</div><label class="es-drop es-pf-dz" data-act="upload-new"><i data-lucide="cloud-upload"></i><span><b>Upload a document</b> · PDF, JPG or PNG up to 10 MB. HR verifies within 2 days.</span></label>';
  }
  function pendingList() {
    var keys = Object.keys(pending);
    if (!keys.length) return '<div class="es-empty es-pf-none"><span class="icon-tile"><i data-lucide="inbox"></i></span><b>No pending changes</b><span>Use “Change” next to any editable field.</span></div>';
    return keys.map(function (k, i) {
      var p = pending[k];
      return '<div class="es-pf-pitem es-in" style="--i:' + i + '"><div class="es-row"><b>' + p.label + '</b><span class="spacer"></span>' + ES.badge('In review') + '</div><small>' + ES.esc(p.from) + ' → <b>' + ES.esc(p.to) + '</b></small>' +
        ES.tracker(['Submitted', 'HR review', 'Updated'], 1, 'ok', [p.at, 'Ayesha Noor', '']).replace('es-track', 'es-track sm') + '</div>';
    }).join('');
  }
  function findField(key) { var r = null; TABS.forEach(function (t) { t.fields.forEach(function (f) { if (f[0] === key) r = f; }); }); return r; }
  function refresh(sec) {
    TABS.forEach(function (t) { var p = $('[data-pane="' + t.id + '"]', sec); p.innerHTML = paneFields(t); FS.icons(p); });
    var pl = $('#es-pf-pending', sec); pl.innerHTML = pendingList(); FS.icons(pl);
    var n = Object.keys(pending).length;
    $('#es-pf-pcount', sec).textContent = n;
    var cmp = 92 + Math.min(n, 2) * 0;
    ES.setRing($('#es-pf-ring', sec), cmp);
  }
  function openChange(sec, key) {
    var f = key ? findField(key) : null;
    var editable = []; TABS.forEach(function (t) { t.fields.forEach(function (x) { if (x[3] && !pending[x[0]]) editable.push(x); }); });
    if (!f) f = editable[0];
    var el = ES.sheet({ title: 'Request a change', sub: 'HR (Ayesha Noor) reviews changes within 2 working days. Bank changes apply from the next payroll.',
      html: '<div class="form-grid">' +
        '<label class="full"><span>Field</span><select id="es-pf-fsel">' + editable.map(function (x) { return '<option value="' + x[0] + '"' + (x[0] === f[0] ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') + '</select></label>' +
        '<label class="full"><span>Current value</span><input id="es-pf-cur" value="' + ES.esc(f[2]) + '" disabled></label>' +
        '<label class="full"><span>New value *</span><input id="es-pf-new" placeholder="Enter the corrected value"></label>' +
        '<label class="full"><span>Reason</span><textarea id="es-pf-why" rows="2" placeholder="e.g. Moved house in September"></textarea></label></div>' +
        '<div class="es-field" style="margin-top:12px"><span>Supporting proof</span><label class="es-drop" id="es-pf-proof"><i data-lucide="paperclip"></i><span><b>Attach proof</b> · utility bill, bank letter or CNIC copy</span></label><div class="es-files" id="es-pf-files"></div></div>' +
        '<div class="banner info es-pf-note" style="margin-top:12px"><i data-lucide="shield-check"></i><div><b>Verified by OTP</b><p>We’ll send a code to 0312-•••8899 before HR sees this request.</p></div></div>',
      foot: '<button class="btn secondary" data-close>Cancel</button><button class="btn primary" id="es-pf-submit"><i data-lucide="send"></i>Submit for approval</button>' });
    var sel = $('#es-pf-fsel', el), cur = $('#es-pf-cur', el), nw = $('#es-pf-new', el);
    sel.addEventListener('change', function () { cur.value = findField(sel.value)[2]; nw.focus(); });
    $('#es-pf-proof', el).addEventListener('click', function (e) { e.preventDefault(); var fl = $('#es-pf-files', el); fl.insertAdjacentHTML('beforeend', ES.fileChip(sel.value === 'address' ? 'LESCO-bill-Sep-2026.pdf' : 'supporting-proof.pdf', '312 KB')); FS.icons(fl); });
    $('#es-pf-submit', el).addEventListener('click', function () {
      var v = nw.value.trim();
      if (!v) { nw.classList.add('shake'); nw.focus(); setTimeout(function () { nw.classList.remove('shake'); }, 500); FS.toast('Enter the new value', { tone: 'warn' }); return; }
      var ff = findField(sel.value), btn = this;
      ES.busy(btn, 1000, 'Submitting…').then(function () {
        pending[ff[0]] = { to: v, from: ff[2], label: ff[1], at: 'Today' };
        ES.closeSheet(el);
        var tab = TABS.find(function (t) { return t.fields.indexOf(ff) > -1; });
        var tb = $('[data-tab="' + tab.id + '"]', sec); if (tb) tb.click();
        refresh(sec);
        var row = $('.es-pf-field[data-key="' + ff[0] + '"]', sec);
        if (row) { reveal(row); ES.flash(row); ES.celebrate(row.querySelector('.es-pf-pend')); }
        FS.toast(ff[1] + ' change sent to HR', { tone: 'good', undo: function () { delete pending[ff[0]]; refresh(sec); } });
      });
    });
  }

  ES.route('ess/profile', {
    render: function () {
      return '<div class="es-card es-pf-hero"><div class="es-pf-cover" aria-hidden="true"></div>' +
        '<div class="es-pf-id"><div class="es-pf-avwrap">' + ES.av(M.name, 'xl') + '<button type="button" class="es-pf-cam" data-act="photo" aria-label="Change photo"><i data-lucide="camera"></i></button></div>' +
        '<div class="es-pf-who"><h2>' + M.name + '</h2><p>' + M.role + ' · ' + M.dept + ' · ' + M.branch + '</p>' +
        '<div class="es-row wrap"><span class="badge good dot">Active</span><span class="pill"><i data-lucide="hash"></i>' + M.id + '</span><span class="pill"><i data-lucide="calendar-days"></i>Joined <b>' + M.joined + '</b></span><span class="pill"><i data-lucide="user-check"></i>Reports to <b>' + M.manager + '</b></span></div></div>' +
        '<div class="es-pf-comp">' + ES.ring(92, { size: 84, label: '92%', sub: 'complete', tone: 'var(--primary)' }).replace('class="es-ring ', 'id="es-pf-ring" class="es-ring ') +
        '<div><b>Almost there</b><small>Renew your police certificate to reach 100%.</small><button type="button" class="es-link" data-act="goto-docs">Fix now<i data-lucide="arrow-right"></i></button></div></div></div></div>' +
        '<div class="es-grid es-main">' +
          '<div class="es-card es-pf-main" data-tabs><div class="tabs">' + TABS.map(function (t, i) { return '<button type="button" class="' + (i ? '' : 'active') + '" data-tab="' + t.id + '"><i data-lucide="' + t.ic + '"></i>' + t.label + '</button>'; }).join('') +
            '<button type="button" data-tab="emergency"><i data-lucide="siren"></i>Emergency</button><button type="button" data-tab="docs"><i data-lucide="folder-open"></i>Documents <i class="es-pf-tabwarn">2</i></button></div>' +
            TABS.map(function (t, i) { return '<div class="tab-pane ' + (i ? '' : 'active') + '" data-pane="' + t.id + '">' + paneFields(t) + '</div>'; }).join('') +
            '<div class="tab-pane" data-pane="emergency">' + contactsHtml() + '</div><div class="tab-pane" data-pane="docs">' + docsHtml() + '</div></div>' +
          '<div class="es-col">' +
            '<div class="es-card"><div class="es-head"><h3>Pending changes</h3><span class="es-count" id="es-pf-pcount">0</span></div><div id="es-pf-pending">' + pendingList() + '</div></div>' +
            '<div class="es-card"><div class="es-head"><h3>Expiring soon</h3><span class="spacer"></span><span class="badge warn dot">2 need action</span></div>' +
              '<div class="es-pf-alert bad"><i data-lucide="shield-alert"></i><div><b>Police character certificate</b><small>Expired 30 Jun 2026 · required for field staff</small></div><button type="button" class="btn sm secondary" data-act="upload-doc" data-i="2">Renew</button></div>' +
              '<div class="es-pf-alert soon"><i data-lucide="car"></i><div><b>Driving licence</b><small>Expires 03 Nov 2026 · 33 days left</small></div><button type="button" class="btn sm secondary" data-act="upload-doc" data-i="1">Upload</button></div></div>' +
            '<div class="es-card"><div class="es-head"><h3>Quick links</h3></div><div class="es-pf-links">' +
              [['ess/payslips', 'file-text', 'Payslips & tax certificate'], ['ess/requests', 'file-badge', 'Salary certificate & NOCs'], ['ess/tax', 'percent', 'Tax declarations'], ['ess/company', 'contact', 'Company directory']].map(function (l) { return '<a href="#/' + l[0] + '"><i data-lucide="' + l[1] + '"></i><span>' + l[2] + '</span><i data-lucide="chevron-right"></i></a>'; }).join('') +
            '</div></div></div></div>';
    },
    bind: function (sec) {
      ES.acts(sec, {
        change: function (b) { openChange(sec, b.closest('.es-pf-field').dataset.key); },
        'change-any': function () { openChange(sec, null); },
        withdraw: function (b) { var k = b.closest('.es-pf-field').dataset.key; delete pending[k]; refresh(sec); FS.toast('Change request withdrawn', { tone: 'info' }); },
        reveal: function (b) { var m = b.previousElementSibling, show = !m.dataset.shown; var t = m.textContent; m.textContent = show ? m.dataset.real : m.dataset.real.replace(/\d(?=[\d ]{4})/g, '•'); m.dataset.shown = show ? '1' : ''; b.innerHTML = '<i data-lucide="' + (show ? 'eye-off' : 'eye') + '"></i>'; FS.icons(b); },
        photo: function () { FS.toast('Photo updated · HR will verify it matches your CNIC', { tone: 'good' }); },
        'goto-docs': function () { $('[data-tab="docs"]', sec).click(); reveal($('.es-pf-main', sec), true); },
        call: function (b) { FS.toast('Calling ' + b.dataset.ph + '…', { tone: 'info' }); },
        'add-contact': function () { contactSheet(sec, null); },
        'edit-contact': function (b) { contactSheet(sec, +b.dataset.i); },
        'view-doc': function (b) { var d = DOCS[+b.dataset.i]; FS.drawer({ title: d.n, subtitle: d.s, html: '<div class="es-pf-preview"><i data-lucide="' + d.ic + '"></i><b>' + d.n + '</b><small>Scanned copy · verified by HR on 18 Mar 2022</small></div>' + expChip(d.exp), foot: '<button class="btn secondary" data-close>Close</button><button class="btn primary" data-es-dl="' + d.n.replace(/\W+/g, '-') + '.pdf"><i data-lucide="download"></i>Download</button>' }); },
        'upload-doc': function (b) {
          var i = +b.dataset.i, d = DOCS[i];
          ES.busy(b, 1100, 'Uploading…').then(function () {
            if (i === 2) d.exp = '2027-09-30'; if (i === 1) d.exp = '2031-11-03';
            var p = $('[data-pane="docs"]', sec); p.innerHTML = docsHtml(); FS.icons(p);
            var al = b.closest('.es-pf-alert'); if (al) { al.classList.remove('bad', 'soon'); al.classList.add('done'); al.querySelector('small').textContent = 'New copy uploaded · HR verification pending'; b.remove(); }
            ES.setRing($('#es-pf-ring', sec), i === 2 ? 100 : 96); $('#es-pf-ring .es-ring-in', sec).firstChild.nodeValue = i === 2 ? '100%' : '96%';
            ES.celebrate($('#es-pf-ring', sec));
            FS.toast(d.n + ' uploaded for verification', { tone: 'good' });
          });
        },
        'upload-new': function (b) { FS.toast('Choose a file… (demo) · experience-letter-Shan-Foods.pdf added', { tone: 'good' }); },
      });
    },
  });
  function contactSheet(sec, i) {
    var c = i == null ? { n: '', rel: '', ph: '', city: 'Lahore' } : CONTACTS[i];
    var el = ES.sheet({ title: i == null ? 'Add emergency contact' : 'Edit contact', sub: 'Shared only with HR and your manager in an emergency.',
      html: '<div class="form-grid"><label><span>Full name *</span><input id="es-pf-cn" value="' + ES.esc(c.n) + '"></label><label><span>Relationship</span><select id="es-pf-cr">' + ['Wife · primary', 'Father', 'Mother', 'Brother', 'Sister', 'Friend'].map(function (r) { return '<option' + (c.rel === r ? ' selected' : '') + '>' + r + '</option>'; }).join('') + '</select></label><label><span>Mobile *</span><input id="es-pf-cp" value="' + ES.esc(c.ph) + '" placeholder="03xx-xxxxxxx"></label><label><span>City</span><input id="es-pf-cc" value="' + ES.esc(c.city) + '"></label></div>',
      foot: '<button class="btn secondary" data-close>Cancel</button><button class="btn primary" id="es-pf-csave"><i data-lucide="check"></i>Save contact</button>' });
    $('#es-pf-csave', el).addEventListener('click', function () {
      var n = $('#es-pf-cn', el).value.trim(), ph = $('#es-pf-cp', el).value.trim();
      if (!n || !ph) { FS.toast('Name and mobile are required', { tone: 'warn' }); return; }
      var nc = { n: n, rel: $('#es-pf-cr', el).value, ph: ph, city: $('#es-pf-cc', el).value };
      if (i == null) { if (CONTACTS.length >= 3) { FS.toast('Maximum 3 contacts', { tone: 'warn' }); return; } CONTACTS.push(nc); } else CONTACTS[i] = nc;
      ES.closeSheet(el);
      var p = $('[data-pane="emergency"]', sec); p.innerHTML = contactsHtml(); FS.icons(p);
      FS.toast('Emergency contact saved', { tone: 'good' });
    });
  }
})();

/* ---------- 08-company.js ---------- */
/* ess/company: people directory, profile drawer with org path, org tree, announcements & policies */
(function () {
  var $ = ES.$, $$ = ES.$$;
  /* manager map (name -> manager name) */
  var MGR = {
    'Sana Javed': 'Ahmed Raza', 'Ayesha Noor': 'Ahmed Raza', 'Faisal Qureshi': 'Ahmed Raza', 'Zainab Raza': 'Ahmed Raza', 'Usman Ali': 'Faisal Qureshi', 'Mehwish Tariq': 'Ahmed Raza',
    'Hira Ali': 'Sana Javed', 'Fatima Noor': 'Ayesha Noor', 'Nida Shah': 'Ayesha Noor', 'Kashif Ali': 'Faisal Qureshi', 'Ali Haider': 'Faisal Qureshi', 'Rafiq Shah': 'Faisal Qureshi',
    'Umar Farooq': 'Zainab Raza', 'Hamza Butt': 'Zainab Raza', 'Bilal Khan': 'Zainab Raza',
    'Imran Siddiqui': 'Bilal Khan', 'Nadeem Akhtar': 'Bilal Khan', 'Tanveer Hassan': 'Bilal Khan', 'Salman Butt': 'Bilal Khan',
  };
  var STATUS = {
    'Ahmed Raza': ['busy', 'In a meeting until 11:30'], 'Zainab Raza': ['on', 'Available · Karachi'], 'Ayesha Noor': ['on', 'Available'], 'Sana Javed': ['busy', 'Month-end close'],
    'Hira Ali': ['on', 'Available'], 'Usman Ali': ['field', 'Vendor visit · Sundar Estate'], 'Faisal Qureshi': ['on', 'Available'], 'Fatima Noor': ['off', 'On leave until 05 Oct'],
    'Kashif Ali': ['on', 'Available · Faisalabad'], 'Mehwish Tariq': ['busy', 'Do not disturb'], 'Ali Haider': ['field', 'On delivery route'], 'Umar Farooq': ['field', 'Client visit · Packages Ltd'],
    'Hamza Butt': ['on', 'Available'], 'Nida Shah': ['on', 'Available'], 'Rafiq Shah': ['field', 'On delivery route'], 'Bilal Khan': ['on', 'That’s you'],
    'Imran Siddiqui': ['field', 'Order booking · Gulberg'], 'Nadeem Akhtar': ['field', 'Order booking · Johar Town'], 'Tanveer Hassan': ['on', 'Available'], 'Salman Butt': ['off', 'Not checked in'],
  };
  var SLBL = { on: 'Available', busy: 'Busy', field: 'In the field', off: 'Away' };
  var PEOPLE = ES.PEOPLE.slice();
  var DEPTS = ['All'].concat(Array.from(new Set(PEOPLE.map(function (p) { return p.dept; }))));
  var dept = 'All', q = '';
  var ANN = [
    ['megaphone', 'lime', 'Q2 sales kick-off · 05 Oct', 'Ahmed Raza · Pearl Continental, Shalimar Hall · 10:00 AM', '2 h ago'],
    ['sparkles', 'green', 'Health insurance renewed with Jubilee Life', 'HR · OPD limit raised to Rs 60,000 per family', '29 Sep'],
    ['file-text', 'blue', 'Updated travel & expense policy v3.2', 'Finance · fuel cap Rs 15,000/month for field staff', '25 Sep'],
    ['party-popper', 'violet', 'Annual dinner — save the date', 'Admin · Friday 18 Dec, Royal Palm Golf Club', '22 Sep'],
  ];
  var POL = [
    ['Code of conduct', 'v4.0 · Jan 2026', true], ['Leave & attendance policy', 'v2.3 · Jul 2026', true], ['Travel & expense policy', 'v3.2 · Sep 2026', false],
    ['IT acceptable use', 'v1.8 · Mar 2026', true], ['Anti-harassment (Act 2010)', 'v2.0 · Feb 2025', true],
  ];
  var phoneOf = function (p) { return p.phone || '0300-0000000'; };
  var emailOf = function (p) { return p.email || (p.name.toLowerCase().split(' ')[0] + '@alnoor.com.pk'); };
  function st(p) { return STATUS[p.name] || ['on', 'Available']; }
  function card(p, i) {
    var s = st(p), me = p.name === ES.ME.name;
    return '<article class="es-dr-card es-in ' + (me ? 'me' : '') + '" style="--i:' + i + '" data-act="open" data-n="' + ES.esc(p.name) + '" tabindex="0" role="button" aria-label="' + ES.esc(p.name) + '">' +
      (me ? '<span class="es-dr-you">You</span>' : '') +
      '<div class="es-dr-avw">' + ES.av(p.name, 'lg') + '<i class="es-dr-dot ' + s[0] + '" title="' + SLBL[s[0]] + '"></i></div>' +
      '<b>' + p.name + '</b><span class="es-dr-role">' + p.role + '</span>' +
      '<div class="es-dr-tags"><span>' + p.dept + '</span><span><i data-lucide="map-pin"></i>' + p.branch + '</span></div>' +
      '<small class="es-dr-st ' + s[0] + '">' + s[1] + '</small>' +
      '<div class="es-dr-acts"><button type="button" data-act="call" data-tip="Call ' + phoneOf(p) + '" aria-label="Call"><i data-lucide="phone"></i></button>' +
      '<button type="button" class="wa" data-act="wa" data-tip="WhatsApp" aria-label="WhatsApp"><i data-lucide="message-circle"></i></button>' +
      '<button type="button" data-act="mail" data-tip="' + emailOf(p) + '" aria-label="Email"><i data-lucide="mail"></i></button></div></article>';
  }
  function list() {
    var qq = q.toLowerCase();
    return PEOPLE.filter(function (p) { return (dept === 'All' || p.dept === dept) && (!qq || (p.name + ' ' + p.role + ' ' + p.dept + ' ' + p.branch).toLowerCase().indexOf(qq) > -1); });
  }
  function renderGrid(sec) {
    var xs = list(), host = $('#es-dr-grid', sec);
    host.innerHTML = xs.length ? xs.map(card).join('') : '<div class="es-empty es-span"><span class="icon-tile"><i data-lucide="search-x"></i></span><b>No one found</b><span>Try another name, role or department.</span></div>';
    $('#es-dr-n', sec).textContent = xs.length + ' of ' + PEOPLE.length + ' people';
    FS.icons(host);
  }
  function reportsOf(n) { return PEOPLE.filter(function (p) { return MGR[p.name] === n; }); }
  function orgNode(p, depth) {
    var kids = reportsOf(p.name), s = st(p), me = p.name === ES.ME.name;
    var onPath = me || isAncestorOfMe(p.name);
    return '<li class="' + (onPath ? 'path' : '') + '"><div class="es-dr-node ' + (me ? 'me' : '') + '" data-act="open" data-n="' + ES.esc(p.name) + '" tabindex="0">' + ES.av(p.name, 'sm') + '<div><b>' + p.name + '</b><small>' + p.role + '</small></div><i class="es-dr-dot ' + s[0] + '"></i>' +
      (kids.length ? '<button type="button" class="es-dr-tog" data-act="tog" aria-label="Toggle reports"><em>' + kids.length + '</em><i data-lucide="chevron-down"></i></button>' : '') + '</div>' +
      (kids.length ? '<ul class="' + (depth >= 1 && !onPath ? 'shut' : '') + '">' + kids.map(function (k) { return orgNode(k, depth + 1); }).join('') + '</ul>' : '') + '</li>';
  }
  function isAncestorOfMe(n) { var m = MGR[ES.ME.name]; while (m) { if (m === n) return true; m = MGR[m]; } return false; }
  function openPerson(name) {
    var p = ES.person(name), s = st(p), mgr = MGR[p.name] ? ES.person(MGR[p.name]) : null, reps = reportsOf(p.name);
    var chip = function (x, cls) { return '<button type="button" class="es-dr-oc ' + (cls || '') + '" data-dr-open="' + ES.esc(x.name) + '">' + ES.av(x.name, 'xs') + '<span><b>' + x.name + '</b><small>' + x.role + '</small></span></button>'; };
    var html = '<div class="es-dr-dhead">' + ES.av(p.name, 'xl') + '<div><h3>' + p.name + '</h3><p>' + p.role + '</p><span class="es-dr-st ' + s[0] + '"><i class="es-dr-dot ' + s[0] + '"></i>' + s[1] + '</span></div></div>' +
      '<div class="es-dr-dacts"><button class="btn secondary" data-dr-act="call" data-ph="' + phoneOf(p) + '"><i data-lucide="phone"></i>Call</button><button class="btn secondary" data-dr-act="wa" data-ph="' + phoneOf(p) + '"><i data-lucide="message-circle"></i>WhatsApp</button><button class="btn primary" data-dr-act="mail" data-em="' + emailOf(p) + '"><i data-lucide="mail"></i>Email</button></div>' +
      '<div class="dl es-dr-dl"><div><span>Employee ID</span><b>' + (p.id || '—') + '</b></div><div><span>Department</span><b>' + p.dept + '</b></div><div><span>Branch</span><b>' + p.branch + '</b></div><div><span>Mobile</span><b>' + phoneOf(p) + '</b></div><div><span>Email</span><b>' + emailOf(p) + '</b></div><div><span>Local time</span><b>09:04 AM PKT</b></div></div>' +
      '<h4 class="es-cap" style="margin:18px 0 10px">Reporting line</h4><div class="es-dr-path">' +
      (mgr ? chip(mgr, 'up') + '<span class="es-dr-arrow"><i data-lucide="arrow-down"></i></span>' : '') + chip(p, 'self') +
      (reps.length ? '<span class="es-dr-arrow"><i data-lucide="arrow-down"></i></span><div class="es-dr-reps">' + reps.map(function (r) { return chip(r); }).join('') + '</div>' : '<small class="es-muted es-dr-norep">No direct reports</small>') + '</div>';
    var d = FS.drawer({ title: 'Profile', subtitle: p.dept + ' · ' + p.branch, html: html });
    d.addEventListener('click', function (e) {
      var o = e.target.closest('[data-dr-open]'); if (o) { FS.closeOverlay(d.closest('.overlay')); setTimeout(function () { openPerson(o.dataset.drOpen); }, 220); return; }
      var a = e.target.closest('[data-dr-act]'); if (a) contact(a.dataset.drAct, p);
    });
  }
  function contact(kind, p) {
    if (kind === 'call') FS.toast('Calling ' + p.name + ' · ' + phoneOf(p), { tone: 'info' });
    if (kind === 'wa') FS.toast('Opening WhatsApp chat with ' + p.name.split(' ')[0], { tone: 'good' });
    if (kind === 'mail') FS.toast('New email to ' + emailOf(p), { tone: 'info' });
  }

  ES.route('ess/company', {
    render: function () {
      return '<div class="es-grid es-main">' +
        '<div class="es-col">' +
          '<div class="es-card es-dr-bar"><div class="es-dr-tools"><div data-plain-search class="es-dr-sw"><label class="search-field es-dr-search"><i data-lucide="search"></i><input id="es-dr-q" placeholder="Search name, role, department or branch…" aria-label="Search people"></label></div>' +
            '<span class="es-label" id="es-dr-n"></span></div>' +
            '<div class="chips es-dr-chips">' + DEPTS.map(function (d, i) { var c = d === 'All' ? PEOPLE.length : PEOPLE.filter(function (p) { return p.dept === d; }).length; return '<button type="button" class="' + (i ? '' : 'active') + '" data-dept="' + d + '">' + d + ' <i>' + c + '</i></button>'; }).join('') + '</div></div>' +
          '<div class="es-dr-view on" data-view="grid"><div class="es-dr-grid" id="es-dr-grid"></div></div>' +
          '<div class="es-dr-view" data-view="org"><div class="es-card es-dr-orgcard"><div class="es-head"><h3>Organisation chart</h3><span class="es-label">Al-Noor Enterprises · 20 people shown</span><span class="spacer"></span><button type="button" class="btn ghost sm" data-act="expand"><i data-lucide="unfold-vertical"></i>Expand all</button></div>' +
            '<ul class="es-dr-tree">' + orgNode(ES.person('Ahmed Raza'), 0) + '</ul></div></div>' +
        '</div>' +
        '<div class="es-col">' +
          '<div class="es-card"><div class="es-head"><h3>Announcements</h3><span class="spacer"></span><span class="badge info">4 new</span></div><div class="es-dr-ann">' +
            ANN.map(function (a, i) { return '<button type="button" class="es-dr-ai" data-act="ann" data-i="' + i + '"><span class="icon-tile ' + a[1] + '"><i data-lucide="' + a[0] + '"></i></span><div><b>' + a[2] + '</b><small>' + a[3] + '</small></div><em>' + a[4] + '</em></button>'; }).join('') + '</div></div>' +
          '<div class="es-card"><div class="es-head"><h3>Policies</h3><span class="spacer"></span><span class="es-label" id="es-dr-pack">4 of 5 acknowledged</span></div><div class="progress"><i style="width:80%" id="es-dr-pbar"></i></div><div class="es-dr-pol">' +
            POL.map(function (p, i) { return '<div class="es-dr-pi"><span class="es-dr-pic"><i data-lucide="file-text"></i></span><div><b>' + p[0] + '</b><small>' + p[1] + '</small></div>' + (p[2] ? '<span class="badge good">Read</span>' : '<button type="button" class="btn sm primary" data-act="ack" data-i="' + i + '">Acknowledge</button>') + '</div>'; }).join('') + '</div></div>' +
          '<div class="es-card es-dr-hol"><div class="es-head"><h3>Next holidays</h3></div>' +
            ES.HOLIDAYS.filter(function (h) { return ES.parse(h.d) > ES.TODAY; }).slice(0, 3).map(function (h) { var d = ES.parse(h.d); return '<div class="es-dr-hi"><span><b>' + ES.pad(d.getDate()) + '</b><small>' + ES.MON[d.getMonth()] + '</small></span><div><b>' + h.n + '</b><small>' + ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d.getDay()] + ' · ' + Math.round((d - ES.TODAY) / 864e5) + ' days away</small></div></div>'; }).join('') + '</div>' +
        '</div></div>';
    },
    bind: function (sec) {
      renderGrid(sec);
      var inp = $('#es-dr-q', sec);
      inp.addEventListener('input', function () { q = inp.value.trim(); renderGrid(sec); });
      sec.addEventListener('click', function (e) { var c = e.target.closest('[data-dept]'); if (c) { dept = c.dataset.dept; renderGrid(sec); } });
      sec.addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.es-dr-card, .es-dr-node')) { e.preventDefault(); openPerson(e.target.dataset.n); } });
      ES.acts(sec, {
        open: function (el, e) { if (e.target.closest('button')) return; openPerson(el.dataset.n); },
        call: function (b, e) { e.stopPropagation(); contact('call', ES.person(b.closest('[data-n]').dataset.n)); },
        wa: function (b, e) { e.stopPropagation(); contact('wa', ES.person(b.closest('[data-n]').dataset.n)); },
        mail: function (b, e) { e.stopPropagation(); contact('mail', ES.person(b.closest('[data-n]').dataset.n)); },
        view: function (b) { $$('.es-dr-view', sec).forEach(function (v) { v.classList.toggle('on', v.dataset.view === b.dataset.v); }); $('.es-dr-bar', sec).classList.toggle('dim', b.dataset.v === 'org'); if (b.dataset.v === 'org') ES.stagger($$('.es-dr-node', sec).filter(function (n) { return n.offsetParent; })); },
        tog: function (b, e) { e.stopPropagation(); var ul = b.closest('li').querySelector(':scope > ul'); ul.classList.toggle('shut'); b.classList.toggle('closed', ul.classList.contains('shut')); },
        expand: function (b) { var shut = $$('.es-dr-tree ul.shut', sec); var open = shut.length > 0; $$('.es-dr-tree ul', sec).forEach(function (u) { if (!u.parentElement.classList.contains('path')) u.classList.toggle('shut', !open); }); b.innerHTML = open ? '<i data-lucide="fold-vertical"></i>Collapse' : '<i data-lucide="unfold-vertical"></i>Expand all'; FS.icons(b); },
        ann: function (b) { var a = ANN[+b.dataset.i]; FS.drawer({ title: a[2], subtitle: a[3], html: '<div class="es-dr-annbody"><span class="icon-tile ' + a[1] + '"><i data-lucide="' + a[0] + '"></i></span><p>Assalam-o-Alaikum team,</p><p>' + a[3] + '. Please plan your week accordingly and reach out to your line manager or HR with any questions.</p><p class="es-hand">— Al-Noor Enterprises</p></div>', foot: '<button class="btn secondary" data-close>Close</button><button class="btn primary" data-close data-toast="Marked as read"><i data-lucide="check"></i>Got it</button>' }); },
        ack: function (b) {
          var i = +b.dataset.i;
          ES.confirm({ title: 'Acknowledge ' + POL[i][0] + '?', text: 'I confirm I have read and understood the ' + POL[i][0] + ' (' + POL[i][1] + ') and agree to follow it.', okLabel: 'I agree' }).then(function (ok) {
            if (!ok) return;
            POL[i][2] = true; var bd = document.createElement('span'); bd.className = 'badge good'; bd.textContent = 'Read'; b.replaceWith(bd);
            $('#es-dr-pack', sec).textContent = '5 of 5 acknowledged'; $('#es-dr-pbar', sec).style.width = '100%';
            ES.celebrate(bd); FS.toast('Policy acknowledged · recorded with timestamp', { tone: 'good' });
          });
        },
      });
    },
  });
})();

/* ---------- 09-team.js ---------- */
/* ess/team: manager view. Team-today strip, swipe approvals deck, bulk approve, team calendar, team stats */
(function () {
  var $ = ES.$, $$ = ES.$$, T = ES.TEAM;
  var TODAY = [
    { n: 'Imran Siddiqui', s: 'in', t: '08:47', loc: 'Gulberg III · 0.4 km from HQ', note: 'On time' },
    { n: 'Nadeem Akhtar', s: 'late', t: '09:18', loc: 'Johar Town · route start', note: '18 min late' },
    { n: 'Tanveer Hassan', s: 'in', t: '08:55', loc: 'Lahore HQ · geofence', note: 'On time' },
    { n: 'Salman Butt', s: 'none', t: '—', loc: 'Last seen 30 Sep, 18:52', note: 'Shift started 09:00' },
  ];
  var SL = { in: ['In', 'good', 'log-in'], late: ['Late', 'warn', 'alarm-clock'], leave: ['On leave', 'violet', 'plane'], none: ['Not checked in', 'danger', 'circle-dashed'] };
  var Q = [
    { id: 'LV-2026-0533', type: 'leave', who: 'Tanveer Hassan', ic: 'calendar-heart', tone: 'green', lab: 'Leave request', title: 'Casual leave · 2 days', sub: 'Mon 05 – Tue 06 Oct 2026',
      rows: [['Reason', 'Sister’s nikkah in Okara'], ['Balance', 'Casual 6 → 4 days'], ['Handover', 'Imran Siddiqui covers Kot Lakhpat route']], note: ['circle-check', 'No team conflicts on these dates'], age: '8 min ago' },
    { id: 'AC-2026-0219', type: 'correction', who: 'Imran Siddiqui', ic: 'fingerprint', tone: 'blue', lab: 'Attendance correction', title: 'Missed punch-out · 29 Sep', sub: 'Requested check-out 18:40',
      rows: [['Reason', 'Client visit at Al-Fatah Stores, Gulberg ran late'], ['GPS trail', 'Last ping 18:37 · Al-Fatah, Main Blvd'], ['Effect', 'Marks 29 Sep as full day (9h 53m)']], note: ['map-pin', 'Location trail matches the claim'], age: '1 d ago' },
    { id: 'EXP-2026-0871', type: 'expense', who: 'Nadeem Akhtar', ic: 'receipt', tone: 'orange', lab: 'Expense claim', title: 'Fuel · Rs 4,850', sub: 'Route Johar Town → Township · 29 Sep',
      rows: [['Receipt', 'PSO Johar Town · 17.3 L (attached)'], ['Policy', 'Rs 9,350 of Rs 15,000 monthly fuel cap used'], ['Cost centre', 'SAL-LHR-02 · Field sales']], note: ['paperclip', 'Receipt scanned · OCR confidence 97%'], age: '2 d ago' },
    { id: 'ADV-2026-0141', type: 'advance', who: 'Salman Butt', ic: 'hand-coins', tone: 'violet', lab: 'Salary advance', title: 'Rs 20,000 over 4 months', sub: 'Rs 5,000 / month from Nov payroll',
      rows: [['Purpose', 'Delivery bike repair (engine overhaul)'], ['Eligibility', 'Tenure 2 yrs ✓ · No active advance ✓'], ['Next step', 'Then HR (Ayesha Noor) & Finance']], note: ['shield-check', 'Within 50% of basic salary'], age: '2 d ago' },
  ];
  var DONE = [];
  var CAL = { 'Tanveer Hassan': { 5: 'pend', 6: 'pend' }, 'Nadeem Akhtar': { 20: 'lv', 21: 'lv' }, 'Imran Siddiqui': { 27: 'sick' }, 'Salman Butt': { 12: 'lv', 13: 'lv', 14: 'lv' }, 'Bilal Khan': { 16: 'trn' } };
  var CL = { pend: 'Casual leave · pending', lv: 'Annual leave', sick: 'Sick leave (planned)', trn: 'Sales training · Karachi' };
  var STATS = [
    { n: 'Imran Siddiqui', on: 96, ord: 1.42, tgt: 1.5, ci: '08:49' },
    { n: 'Nadeem Akhtar', on: 82, ord: 1.18, tgt: 1.5, ci: '09:06' },
    { n: 'Tanveer Hassan', on: 94, ord: 1.61, tgt: 1.5, ci: '08:52' },
    { n: 'Salman Butt', on: 88, ord: 0, tgt: 0, ci: '08:58', del: '312 drops' },
  ];

  function stripHtml() {
    var groups = ['in', 'late', 'leave', 'none'];
    return '<div class="es-tm-groups">' + groups.map(function (g, i) {
      var xs = TODAY.filter(function (x) { return x.s === g; });
      return '<div class="es-tm-g ' + SL[g][1] + '"><div class="es-row"><span class="es-tm-gic"><i data-lucide="' + SL[g][2] + '"></i></span><span class="es-label">' + SL[g][0] + '</span></div><b>' + xs.length + '</b>' +
        '<div class="avatar-stack">' + (xs.length ? xs.map(function (x) { return ES.av(x.n, 'sm'); }).join('') : '<span class="es-tm-none">' + (g === 'leave' ? 'Nobody today' : '—') + '</span>') + '</div></div>';
    }).join('') + '</div>' +
      '<div class="es-tm-people">' + TODAY.map(function (x, i) {
        var p = ES.person(x.n), s = SL[x.s];
        return '<div class="es-tm-p es-in" style="--i:' + i + '">' + ES.av(x.n) + '<div class="es-tm-pn"><b>' + x.n + '</b><small>' + p.role + '</small></div>' +
          '<div class="es-tm-pt"><span class="badge dot ' + s[1] + '">' + (x.s === 'none' ? 'Not in' : s[0] + ' ' + x.t) + '</span><small><i data-lucide="map-pin"></i>' + x.loc + '</small></div>' +
          (x.s === 'none' ? '<button type="button" class="btn sm secondary" data-act="nudge" data-n="' + x.n + '"><i data-lucide="bell-ring"></i>Nudge</button>' : '<button type="button" class="icon-btn-sm" data-act="call" data-n="' + x.n + '" data-tip="Call ' + p.phone + '" aria-label="Call"><i data-lucide="phone"></i></button>') + '</div>';
      }).join('') + '</div>';
  }
  function cardHtml(q) {
    return '<article class="es-tm-card" data-id="' + q.id + '" tabindex="-1">' +
      '<span class="es-tm-stamp ok">Approve</span><span class="es-tm-stamp no">Reject</span>' +
      '<div class="es-tm-ch"><span class="icon-tile ' + q.tone + '"><i data-lucide="' + q.ic + '"></i></span><div><span class="es-cap">' + q.lab + '</span><small>' + q.id + ' · ' + q.age + '</small></div><span class="spacer"></span>' + ES.badge('Pending') + '</div>' +
      '<div class="es-tm-who">' + ES.av(q.who, 'lg') + '<div><b>' + q.who + '</b><small>' + ES.person(q.who).role + '</small></div></div>' +
      '<h3 class="es-tm-title">' + q.title + '</h3><p class="es-tm-sub">' + q.sub + '</p>' +
      '<div class="es-tm-rows">' + q.rows.map(function (r) { return '<div><span>' + r[0] + '</span><b>' + r[1] + '</b></div>'; }).join('') + '</div>' +
      '<div class="es-tm-note"><i data-lucide="' + q.note[0] + '"></i>' + q.note[1] + '</div>' +
      '<div class="es-tm-btns"><button type="button" class="es-tm-no" data-act="reject" aria-label="Reject"><i data-lucide="x"></i><span>Reject</span></button><span class="es-tm-hint"><span class="es-kbd">←</span> drag <span class="es-kbd">→</span></span><button type="button" class="es-tm-ok" data-act="approve" aria-label="Approve"><i data-lucide="check"></i><span>Approve</span></button></div></article>';
  }
  function layout(sec) {
    var cards = $$('.es-tm-card', $('#es-tm-deck', sec));
    cards.forEach(function (c, k) { c.style.setProperty('--k', Math.min(k, 3)); c.classList.toggle('top', k === 0); c.style.zIndex = 10 - k; c.setAttribute('aria-hidden', k ? 'true' : 'false'); });
    var n = Q.length;
    ES.tick($('#es-tm-left', sec), n, { dec: 0 });
    $('#es-tm-prog', sec).style.width = ((4 - n) / 4 * 100) + '%';
    $('#es-tm-bulk').disabled = !n;
    var bd = document.querySelector('a[href="#/ess/team"] .badge, [data-r="ess/team"] .badge'); if (bd) { bd.textContent = n; bd.style.display = n ? '' : 'none'; }
    var z = $('#es-tm-zero', sec); z.classList.toggle('on', !n);
  }
  function renderDeck(sec) {
    var d = $('#es-tm-deck', sec);
    d.innerHTML = Q.map(cardHtml).join('');
    FS.icons(d);
    $$('.es-tm-card', d).forEach(function (c) { ES.swipe(c, { threshold: 110, onRight: function () { return decide(sec, c, 1); }, onLeft: function () { return decide(sec, c, -1); } }); });
    layout(sec);
  }
  function rejectPrompt(q) {
    return new Promise(function (res) {
      var reasons = { leave: ['Team coverage needed', 'Insufficient notice', 'Peak sales week'], correction: ['No GPS evidence', 'Please attach visit report', 'Duplicate request'], expense: ['Receipt unclear', 'Exceeds policy cap', 'Wrong cost centre'], advance: ['Exceeds eligibility', 'Discuss in 1:1 first', 'Budget freeze'] }[q.type];
      var el = ES.sheet({ title: 'Reject ' + q.lab.toLowerCase() + '?', sub: q.who + ' · ' + q.title + '. They’ll see your reason.', cls: 'es-sheet-sm',
        html: '<div class="es-opts es-tm-reasons">' + reasons.map(function (r, i) { return '<button type="button" class="es-opt' + (i ? '' : ' on') + '">' + r + '</button>'; }).join('') + '</div>' +
          '<label class="es-field" style="margin-top:14px"><span>Message to ' + q.who.split(' ')[0] + '</span><textarea id="es-tm-why" rows="3">' + reasons[0] + '. Let’s discuss.</textarea></label>',
        foot: '<button class="btn secondary" data-close>Keep it</button><button class="btn danger" id="es-tm-rej"><i data-lucide="x"></i>Reject request</button>' });
      var done = false, ta = $('#es-tm-why', el);
      el.addEventListener('click', function (e) { var o = e.target.closest('.es-tm-reasons .es-opt'); if (o) { $$('.es-tm-reasons .es-opt', el).forEach(function (b) { b.classList.toggle('on', b === o); }); ta.value = o.textContent + '. Let’s discuss.'; } });
      $('#es-tm-rej', el).addEventListener('click', function () { done = true; res(ta.value.trim() || 'Rejected'); ES.closeSheet(el); });
      var ov = el.closest('.overlay') || el;
      var mo = new MutationObserver(function () { if (!ov.isConnected || (ov.classList.contains('overlay') && !ov.classList.contains('open'))) { mo.disconnect(); if (!done) res(false); } });
      mo.observe(ov, { attributes: true }); mo.observe(document.body, { childList: true });
    });
  }
  /* returns Promise<boolean> used by ES.flyOut */
  function decide(sec, card, dir) {
    var q = Q.find(function (x) { return x.id === card.dataset.id; });
    if (!q) return Promise.resolve(false);
    var p = dir > 0 ? Promise.resolve('Approved') : rejectPrompt(q);
    return p.then(function (why) {
      if (!why) return false;
      setTimeout(function () { finish(sec, q, dir, why); }, 380);
      return true;
    });
  }
  function finish(sec, q, dir, why) {
    var i = Q.indexOf(q); if (i < 0) return;
    Q.splice(i, 1);
    var c = $('.es-tm-card[data-id="' + q.id + '"]', sec); if (c) c.remove();
    DONE.unshift({ q: q, ok: dir > 0, why: why, idx: i });
    renderDone(sec); layout(sec);
    if (!sec._bulk) {
      FS.toast((dir > 0 ? 'Approved · ' : 'Rejected · ') + q.who.split(' ')[0] + '’s ' + q.lab.toLowerCase(), { tone: dir > 0 ? 'good' : 'danger', undo: function () { undo(sec, q); } });
      if (dir > 0) ES.celebrate($('#es-tm-deckwrap', sec));
    }
    if (!Q.length) setTimeout(function () { ES.celebrate($('#es-tm-zero', sec)); }, 300);
  }
  function undo(sec, q) {
    var k = DONE.findIndex(function (d) { return d.q === q; }); if (k < 0) return;
    var d = DONE.splice(k, 1)[0];
    Q.splice(Math.min(d.idx, Q.length), 0, q);
    renderDeck(sec); renderDone(sec);
  }
  function renderDone(sec) {
    var h = $('#es-tm-done', sec);
    h.innerHTML = DONE.length ? DONE.map(function (d, i) {
      return '<div class="es-tm-di es-in" style="--i:' + i + '">' + ES.av(d.q.who, 'sm') + '<div><b>' + d.q.who + ' · ' + d.q.title + '</b><small>' + (d.ok ? 'Approved just now' + (d.q.type === 'leave' || d.q.type === 'advance' ? ' · forwarded to HR' : '') : '“' + ES.esc(d.why) + '”') + '</small></div>' + ES.badge(d.ok ? 'Approved' : 'Rejected') + '<button type="button" class="es-link" data-act="undo" data-id="' + d.q.id + '">Undo</button></div>';
    }).join('') : '<p class="es-label es-tm-dempty">Decisions you make today appear here.</p>';
    FS.icons(h);
  }
  function topCard(sec) { return $('.es-tm-card.top', sec); }
  function act(sec, dir) {
    var c = topCard(sec); if (!c) return;
    ES.flyOut(c, dir, function () { return decide(sec, c, dir); });
  }
  function calHtml() {
    var days = [], d;
    for (var i = 1; i <= 31; i++) { d = new Date(2026, 9, i); days.push(d); }
    var people = [ES.ME.name].concat(T.map(function (t) { return t.name; }));
    return '<div class="es-scroll-x"><div class="es-tm-cal" style="--n:31">' +
      '<div class="es-tm-cn"></div>' + days.map(function (x) { return '<div class="es-tm-ch2 ' + (ES.isWeekend(x) ? 'we' : '') + (x.getDate() === 1 ? ' today' : '') + '"><small>' + ES.DOW[x.getDay()][0] + '</small><b>' + x.getDate() + '</b></div>'; }).join('') +
      people.map(function (n) {
        var ev = CAL[n] || {};
        return '<div class="es-tm-cn">' + ES.av(n, 'xs') + '<span>' + (n === ES.ME.name ? 'You' : n.split(' ')[0]) + '</span></div>' + days.map(function (x) {
          var k = ev[x.getDate()], we = ES.isWeekend(x);
          return '<div class="es-tm-cc ' + (we ? 'we ' : '') + (k || '') + (x.getDate() === 1 ? ' today' : '') + '"' + (k ? ' data-tip="' + n.split(' ')[0] + ' · ' + CL[k] + ' · ' + ES.dshort(x) + '"' : '') + '></div>';
        }).join('');
      }).join('') + '</div></div>' +
      '<div class="es-tm-leg"><span><i class="lv"></i>Annual</span><span><i class="pend"></i>Pending</span><span><i class="sick"></i>Sick</span><span><i class="trn"></i>Training</span><span><i class="we"></i>Weekend</span></div>';
  }
  function statsHtml() {
    return '<div class="es-stats es-tm-kpis"><div class="es-stat"><span>Team on-time</span><b>90%</b><small class="es-up">▲ 3% vs Aug</small></div><div class="es-stat"><span>Orders booked</span><b>Rs 4.21M</b><small>of Rs 4.5M target</small></div><div class="es-stat"><span>Overtime</span><b>14h 20m</b><small>September</small></div></div>' +
      '<div class="es-tm-st">' + STATS.map(function (s, i) {
        var pct = s.tgt ? Math.round(s.ord / s.tgt * 100) : 0;
        return '<div class="es-tm-sr">' + ES.av(s.n, 'sm') + '<div class="es-tm-sn"><b>' + s.n.split(' ')[0] + '</b><small>avg in ' + s.ci + '</small></div>' +
          '<div class="es-tm-bar" data-tip="On-time ' + s.on + '%"><span>On-time</span><div class="progress ' + (s.on < 85 ? 'warn' : '') + '"><i style="width:' + s.on + '%"></i></div><em>' + s.on + '%</em></div>' +
          '<div class="es-tm-bar" data-tip="' + (s.tgt ? 'Rs ' + s.ord + 'M of Rs ' + s.tgt + 'M' : s.del) + '"><span>' + (s.tgt ? 'Target' : 'Deliveries') + '</span><div class="progress"><i style="width:' + (s.tgt ? Math.min(100, pct) : 92) + '%"></i></div><em>' + (s.tgt ? pct + '%' : s.del) + '</em></div></div>';
      }).join('') + '</div>';
  }

  ES.route('ess/team', {
    render: function () {
      return '<div class="es-grid es-wide">' +
        '<div class="es-card es-tm-today"><div class="es-head"><h3>Team today</h3><span class="es-label">Thu, 01 Oct · shift 09:00</span><span class="spacer"></span><span class="pill"><i data-lucide="radio"></i>Live <b class="up">3 of 4 in</b></span></div>' + stripHtml() + '</div>' +
        '<div class="es-card es-tm-inbox" id="es-tm-deckwrap"><div class="es-head"><h3>Approvals</h3><span class="es-count" id="es-tm-left">4</span><span class="es-label">waiting</span><span class="spacer"></span><button type="button" class="es-link" data-act="bulk2"><i data-lucide="check-check"></i>Approve all</button></div>' +
          '<div class="progress es-tm-progress"><i id="es-tm-prog" style="width:0"></i></div>' +
          '<div class="es-tm-deck" id="es-tm-deck"></div>' +
          '<div class="es-tm-zero" id="es-tm-zero"><span class="icon-tile lime"><i data-lucide="party-popper"></i></span><b>Inbox zero</b><span>All requests handled. Your team has been notified.</span></div>' +
          '<div class="es-tm-donewrap"><span class="es-cap">Decided today</span><div id="es-tm-done"></div></div></div>' +
        '</div>' +
        '<div class="es-grid es-wide">' +
          '<div class="es-card"><div class="es-head"><h3>Team calendar · October 2026</h3><span class="spacer"></span><span class="pill"><i data-lucide="plane"></i>6 leave days planned</span></div>' + calHtml() + '</div>' +
          '<div class="es-card"><div class="es-head"><h3>Team stats · September</h3><span class="spacer"></span><a class="es-link" href="#/ess/goals">Goals<i data-lucide="arrow-right"></i></a></div>' + statsHtml() + '</div>' +
        '</div>';
    },
    bind: function (sec) {
      renderDeck(sec); renderDone(sec);
      var bulk = function (btn) {
        if (!Q.length) return;
        ES.confirm({ title: 'Approve all ' + Q.length + ' requests?', text: Q.map(function (q) { return q.who.split(' ')[0] + ' · ' + q.title; }).join('<br>'), okLabel: 'Approve ' + Q.length }).then(function (ok) {
          if (!ok) return;
          sec._bulk = true;
          var cards = $$('.es-tm-card', sec), n = cards.length;
          cards.forEach(function (c, i) { setTimeout(function () { ES.flyOut(c, 1, function () { return decide(sec, c, 1); }); }, i * 260); });
          setTimeout(function () { sec._bulk = false; ES.celebrate(btn); FS.toast(n + (n === 1 ? ' request' : ' requests') + ' approved · leave & advance forwarded to HR', { tone: 'good' }); }, n * 260 + 500);
        });
      };
      ES.acts(sec, {
        approve: function () { act(sec, 1); },
        reject: function () { act(sec, -1); },
        bulk: function (b) { bulk(b); },
        bulk2: function (b) { bulk(b); },
        undo: function (b) { var d = DONE.find(function (x) { return x.q.id === b.dataset.id; }); if (d) { undo(sec, d.q); FS.toast('Decision undone · back in your inbox', { tone: 'info' }); } },
        nudge: function (b) { ES.busy(b, 700, 'Sending…').then(function () { b.innerHTML = '<i data-lucide="check"></i>Nudged'; b.disabled = true; FS.icons(b); FS.toast('WhatsApp reminder sent to ' + b.dataset.n, { tone: 'good' }); }); },
        call: function (b) { FS.toast('Calling ' + b.dataset.n + '…', { tone: 'info' }); },
      });
      document.addEventListener('keydown', function (e) {
        if (!sec.classList.contains('active') || e.target.closest('input, textarea, select, [contenteditable]') || document.querySelector('.overlay.open')) return;
        if (e.key === 'ArrowRight') { e.preventDefault(); act(sec, 1); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); act(sec, -1); }
      });
    },
  });
})();

/* ---------- 10-requests.js ---------- */
/* ess/requests: self-serve HR letters. Type cards, request sheet, simulated approval, generated .paper letter, tracker */
(function () {
  var $ = ES.$, $$ = ES.$$, M = ES.ME;
  var reveal = function (el, top) {
    if (!el) return;
    var p = el.parentElement;
    while (p && p !== document.body) { var o = getComputedStyle(p).overflowY; if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight) break; p = p.parentElement; }
    if (!p || p === document.body) p = document.scrollingElement;
    var r = el.getBoundingClientRect(), pr = p === document.scrollingElement ? { top: 0, height: innerHeight } : p.getBoundingClientRect();
    var y = p.scrollTop + r.top - pr.top - (top ? 90 : (pr.height - r.height) / 2);
    p.scrollTo({ top: Math.max(0, y), behavior: ES.reduce() ? 'auto' : 'smooth' });
  };
  var TYPES = [
    { k: 'salary', n: 'Salary certificate', ic: 'banknote', tone: 'green', d: 'Gross & net salary on letterhead for banks, landlords and visas.', sla: 'Same day', addr: 'To whom it may concern', purpose: 'Car finance application' },
    { k: 'experience', n: 'Experience letter', ic: 'award', tone: 'violet', d: 'Confirms your role, tenure and responsibilities at Al-Noor.', sla: '1 working day', addr: 'To whom it may concern', purpose: 'Professional certification (CIM UK)' },
    { k: 'noc', n: 'NOC for visa', ic: 'plane', tone: 'blue', d: 'No-objection for travel abroad, with approved leave dates.', sla: '1 working day', addr: 'The Visa Officer, Embassy of Türkiye, Islamabad', purpose: 'Family holiday · Istanbul' },
    { k: 'bank', n: 'Bank letter', ic: 'landmark', tone: 'orange', d: 'Account opening, credit card or loan letter addressed to your bank.', sla: 'Same day', addr: 'The Branch Manager, Meezan Bank, Johar Town', purpose: 'Credit card application' },
    { k: 'verify', n: 'Employment verification', ic: 'badge-check', tone: 'lime', d: 'Confirms current employment for background checks and tenancy.', sla: 'Within 4 hours', addr: 'Zameen Property Management, DHA Lahore', purpose: 'House rental agreement' },
  ];
  var REQS = [
    { id: 'RQ-2026-0142', k: 'salary', to: 'The Manager, Meezan Bank — Car Ijarah', purpose: 'Car finance (Suzuki Cultus)', date: '12 Aug 2026', at: 3, state: 'ok', sal: true },
    { id: 'RQ-2026-0088', k: 'noc', to: 'The Consul General, UAE Consulate, Karachi', purpose: 'Visit visa · Dubai, 14 – 21 Jun', date: '03 Jun 2026', at: 3, state: 'ok', from: '2026-06-14', till: '2026-06-21', country: 'United Arab Emirates' },
    { id: 'RQ-2025-0311', k: 'bank', to: 'The Branch Manager, HBL Model Town', purpose: 'Home loan pre-approval', date: '18 Nov 2025', at: 1, state: 'rej', why: 'HBL accepts its own template · please share their form' },
  ];
  var seq = 151;
  var STEPS = ['Submitted', 'HR review', 'Signed', 'Ready'];
  var tOf = function (k) { return TYPES.find(function (t) { return t.k === k; }); };
  var lc = function (t) { return t.k === 'noc' ? t.n : t.n.toLowerCase(); };

  function typeCards() {
    return TYPES.map(function (t, i) {
      return '<button type="button" class="es-rq-type" data-act="new" data-t="' + t.k + '" style="--i:' + i + '"><span class="icon-tile ' + t.tone + '"><i data-lucide="' + t.ic + '"></i></span>' +
        '<b>' + t.n + '</b><small>' + t.d + '</small><span class="es-rq-sla"><i data-lucide="clock-3"></i>' + t.sla + '</span><span class="es-rq-go"><i data-lucide="arrow-up-right"></i></span></button>';
    }).join('');
  }
  function reqRow(r, i) {
    var t = tOf(r.k), subs = ['', 'Ayesha Noor', 'Digital signature', ''];
    return '<div class="es-rq-row es-in" style="--i:' + i + '" data-id="' + r.id + '"><div class="es-rq-rh"><span class="icon-tile ' + t.tone + '"><i data-lucide="' + t.ic + '"></i></span><div><b>' + t.n + '</b><small>' + r.id + ' · ' + r.date + ' · ' + ES.esc(r.purpose) + '</small></div><span class="spacer"></span>' +
      ES.badge(r.state === 'rej' ? 'Rejected' : r.state === 'cancel' ? 'Withdrawn' : r.at >= 3 ? 'Approved' : 'In review') + '</div>' +
      ES.tracker(STEPS, r.at, r.state, subs) +
      (r.state !== 'ok' ? '<p class="es-rq-why"><i data-lucide="message-square-warning"></i>' + ES.esc(r.why) + '</p>' : '') +
      '<div class="es-rq-acts">' + (r.at >= 3 && r.state === 'ok' ? '<button type="button" class="btn sm primary" data-act="view" data-id="' + r.id + '"><i data-lucide="file-text"></i>View letter</button><button type="button" class="btn sm secondary" data-es-dl="' + r.id + '-' + t.n.replace(/\W+/g, '-') + '.pdf"><i data-lucide="download"></i>PDF</button>' :
        r.state !== 'ok' ? '<button type="button" class="btn sm secondary" data-act="new" data-t="' + r.k + '"><i data-lucide="rotate-ccw"></i>Request again</button>' :
        '<button type="button" class="btn sm ghost" data-act="withdraw" data-id="' + r.id + '"><i data-lucide="undo-2"></i>Withdraw</button>') + '</div></div>';
  }
  function renderReqs(sec) {
    var h = $('#es-rq-list', sec);
    h.innerHTML = REQS.map(reqRow).join('');
    FS.icons(h);
    $('#es-rq-n', sec).textContent = REQS.length;
  }
  function fieldsFor(t) {
    var common = '<label class="full"><span>Addressed to *</span><input id="es-rq-to" value="' + ES.esc(t.addr) + '"></label><label class="full"><span>Purpose *</span><input id="es-rq-purpose" value="' + ES.esc(t.purpose) + '"></label>';
    if (t.k === 'noc') return common + '<label><span>Country</span><select id="es-rq-country"><option>Türkiye</option><option>United Arab Emirates</option><option>Saudi Arabia (Umrah)</option><option>United Kingdom</option><option>Malaysia</option></select></label><label><span>Leave approved?</span><select><option>Yes · LV-2026-0571</option><option>Applying separately</option></select></label><label><span>Travel from</span><input type="date" id="es-rq-from" value="2026-12-21"></label><label><span>Travel till</span><input type="date" id="es-rq-till" value="2026-12-31"></label>';
    if (t.k === 'salary' || t.k === 'bank' || t.k === 'verify') return common + '<label class="full es-rq-sw"><span class="switch"><input type="checkbox" id="es-rq-sal" ' + (t.k === 'verify' ? '' : 'checked') + '><i></i><span>Include salary breakdown</span></span><small class="es-hint">Gross Rs 142,500 · Net Rs 127,630 (September 2026)</small></label>';
    return common + '<label class="full"><span>Key responsibilities to mention</span><textarea id="es-rq-resp" rows="3">Managing key accounts in Lahore including Packages Ltd and Al-Fatah Stores; leading a team of 4 field staff; achieving 112% of FY 2025-26 sales target.</textarea></label>';
  }
  function openSheet(sec, k) {
    var t = tOf(k);
    var el = ES.sheet({ title: 'Request ' + lc(t), sub: 'Signed by Ayesha Noor, HR Manager · typical turnaround ' + t.sla.toLowerCase() + '.', cls: 'es-sheet-lg',
      html: '<div class="es-rq-pick">' + TYPES.map(function (x) { return '<button type="button" class="es-opt' + (x.k === k ? ' on' : '') + '" data-k="' + x.k + '"><i data-lucide="' + x.ic + '"></i>' + x.n + '</button>'; }).join('') + '</div>' +
        '<div class="form-grid es-rq-form" id="es-rq-fields">' + fieldsFor(t) + '</div>' +
        '<div class="es-rq-row2"><div class="es-field"><span>Format</span><div class="seg"><button type="button" class="active">Digital PDF + QR</button><button type="button">Printed &amp; stamped</button></div></div><div class="es-field"><span>Language</span><div class="seg"><button type="button" class="active">English</button><button type="button">اردو Urdu</button></div></div></div>' +
        '<div class="es-rq-prev"><i data-lucide="sparkles"></i><div><b>Auto-filled from your profile</b><small>' + M.name + ' · ' + M.id + ' · ' + M.role + ' · joined ' + M.joined + ' · CNIC ' + M.cnic + '</small></div></div>',
      foot: '<button class="btn secondary" data-close>Cancel</button><button class="btn primary" id="es-rq-submit"><i data-lucide="send"></i>Submit request</button>' });
    el.addEventListener('click', function (e) {
      var o = e.target.closest('.es-rq-pick .es-opt'); if (!o) return;
      k = o.dataset.k; t = tOf(k);
      $$('.es-rq-pick .es-opt', el).forEach(function (b) { b.classList.toggle('on', b === o); });
      var f = $('#es-rq-fields', el); f.innerHTML = fieldsFor(t); f.classList.remove('es-in'); void f.offsetWidth; f.classList.add('es-in');
      var h2 = el.querySelector('.modal-head h2'); if (h2) h2.textContent = 'Request ' + lc(t);
    });
    $('#es-rq-submit', el).addEventListener('click', function () {
      var to = $('#es-rq-to', el).value.trim(), pur = $('#es-rq-purpose', el).value.trim();
      if (!to || !pur) { FS.toast('Fill in who it’s addressed to and the purpose', { tone: 'warn' }); return; }
      var r = { id: 'RQ-2026-0' + (seq++), k: k, to: to, purpose: pur, date: '01 Oct 2026', at: 1, state: 'ok',
        sal: !!($('#es-rq-sal', el) || {}).checked, country: ($('#es-rq-country', el) || {}).value, from: ($('#es-rq-from', el) || {}).value, till: ($('#es-rq-till', el) || {}).value, resp: ($('#es-rq-resp', el) || {}).value };
      ES.busy(this, 900, 'Submitting…').then(function () {
        ES.closeSheet(el);
        REQS.unshift(r); renderReqs(sec);
        var row = $('.es-rq-row[data-id="' + r.id + '"]', sec); ES.flash(row);
        reveal(row);
        FS.toast(t.n + ' requested · ' + r.id, { tone: 'good' });
        /* simulated HR workflow */
        setTimeout(function () { if (r.state !== 'ok') return; r.at = 2; renderReqs(sec); }, 1600);
        setTimeout(function () {
          if (r.state !== 'ok') return;
          r.at = 3; renderReqs(sec);
          var rw = $('.es-rq-row[data-id="' + r.id + '"]', sec); ES.flash(rw); ES.celebrate(rw.querySelector('.es-rq-acts'));
          FS.toast('Ayesha Noor signed your ' + lc(t), { tone: 'good', action: { label: 'View letter', fn: function () { openLetter(r); } } });
        }, 3300);
      });
    });
  }
  function letterBody(r) {
    var t = tOf(r.k), ref = 'ALN/HR/' + r.id.slice(3);
    var sal = '<table class="tbl es-rq-sal"><thead><tr><th>Monthly emoluments (PKR)</th><th class="num">Amount</th></tr></thead><tbody>' +
      [['Basic salary', 92000], ['House rent allowance', 9000], ['Medical allowance', 9200], ['Fuel & conveyance', 4800], ['Sales commission (avg. last 3 months)', 27500]].map(function (x) { return '<tr><td>' + x[0] + '</td><td class="num">' + FS.fmt(x[1], 2) + '</td></tr>'; }).join('') +
      '<tr class="total"><td>Gross monthly salary</td><td class="num">142,500.00</td></tr><tr><td>Net salary credited (Sep 2026)</td><td class="num">127,630.00</td></tr></tbody></table>';
    var p = { salary: '<p>This is to certify that <b>Mr. ' + M.name + '</b> S/O Tariq Khan, holding CNIC No. <b>' + M.cnic + '</b>, is a permanent employee of Al-Noor Enterprises (Pvt) Ltd since <b>' + M.joined + '</b>. He is currently working as <b>' + M.role + '</b> in our Sales department at Lahore HQ (Employee ID ' + M.id + ').</p><p>His current monthly salary details are as follows:</p>' + sal + '<p>His salary is credited to ' + M.bank + ', IBAN ' + M.iban + '. This certificate is issued on his request for <b>' + ES.esc(r.purpose) + '</b> and carries no financial liability on the part of the company.</p>',
      experience: '<p>This is to certify that <b>Mr. ' + M.name + '</b> (CNIC ' + M.cnic + ') has been associated with Al-Noor Enterprises (Pvt) Ltd since <b>' + M.joined + '</b> and is presently serving as <b>' + M.role + '</b>, grade ' + M.grade + ', reporting to the Sales Manager.</p><p>During his tenure his key responsibilities have included: ' + ES.esc(r.resp || 'key account management and team leadership') + '</p><p>We have found him diligent, honest and a valued member of our team. We wish him continued success. This letter is issued on his request for ' + ES.esc(r.purpose) + '.</p>',
      noc: '<p>This is to certify that <b>Mr. ' + M.name + '</b>, CNIC ' + M.cnic + ', is employed with Al-Noor Enterprises (Pvt) Ltd as <b>' + M.role + '</b> since ' + M.joined + ', drawing a gross monthly salary of <b>Rs 142,500</b>.</p><p>The company has <b>no objection</b> to his travel to <b>' + ES.esc(r.country || 'Türkiye') + '</b> from <b>' + (r.from ? ES.dfmt(r.from) : '21 Dec 2026') + '</b> to <b>' + (r.till ? ES.dfmt(r.till) : '31 Dec 2026') + '</b> for ' + ES.esc(r.purpose) + '. His leave for this period has been approved and he will resume his duties upon return. All travel expenses will be borne by him.</p>',
      bank: '<p>We confirm that <b>Mr. ' + M.name + '</b>, CNIC ' + M.cnic + ', is a permanent employee of Al-Noor Enterprises (Pvt) Ltd, working as ' + M.role + ' since ' + M.joined + '. His salary is disbursed monthly to his account ' + M.account + ' (IBAN ' + M.iban + ').</p>' + (r.sal ? sal : '') + '<p>This letter is issued at his request for <b>' + ES.esc(r.purpose) + '</b>. The company undertakes to inform the bank in case of his separation, subject to his consent.</p>',
      verify: '<p>This letter confirms that <b>Mr. ' + M.name + '</b> (Employee ID ' + M.id + ', CNIC ' + M.cnic + ') is currently employed full-time with Al-Noor Enterprises (Pvt) Ltd as <b>' + M.role + '</b> at our Lahore HQ, with continuous service since ' + M.joined + '.</p>' + (r.sal ? sal : '') + '<p>This verification is issued for <b>' + ES.esc(r.purpose) + '</b>. For any queries, please contact HR at hr@alnoor.com.pk or +92 42 3512 8800 ext. 214.</p>' }[r.k];
    return ES.letterhead('<b>' + t.n + '</b><br>Ref: ' + ref + '<br>Date: ' + r.date) +
      '<p class="es-rq-to">' + ES.esc(r.to) + '</p><p class="es-rq-subj"><b>Subject: ' + t.n + ' — ' + M.name + '</b></p>' + p +
      '<div class="es-rq-sign"><div><span class="es-rq-sig">Ayesha Noor</span><b>Ayesha Noor</b><small>HR Manager · Al-Noor Enterprises (Pvt) Ltd</small></div><span class="es-stamp">Al-Noor<br>Enterprises<br>HR Dept.<br>Lahore</span>' +
      '<div class="es-rq-qr"><div class="es-rq-qrgrid">' + qr(r.id) + '</div><small>Verify: alnoor.com.pk/verify<br>Code ' + r.id.slice(-4) + '-' + M.id.slice(-4) + '</small></div></div>';
  }
  function qr(seed) {
    var h = 7, s = ''; for (var i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    for (var y = 0; y < 11; y++) for (var x = 0; x < 11; x++) {
      var corner = (x < 3 && y < 3) || (x > 7 && y < 3) || (x < 3 && y > 7);
      h = (h * 1103515245 + 12345) >>> 0;
      s += '<i class="' + (corner ? ((x % 10 === 1 || x === 9) && (y % 10 === 1 || y === 9) ? '' : 'on') : (h >> 16) & 1 ? 'on' : '') + '"></i>';
    }
    return s;
  }
  function openLetter(r) {
    var t = tOf(r.k);
    ES.paper({ title: t.n, sub: r.id + ' · signed ' + r.date + ' · ' + ES.esc(r.to), html: letterBody(r), file: r.id + '-' + t.n.replace(/\W+/g, '-') + '.pdf' });
  }

  ES.route('ess/requests', {
    render: function () {
      return '<div class="es-rq-types">' + typeCards() + '</div>' +
        '<div class="es-grid es-main">' +
          '<div class="es-card"><div class="es-head"><h3>My requests</h3><span class="es-count" id="es-rq-n">0</span><span class="spacer"></span><span class="es-label">Tracked from submission to signed letter</span></div><div id="es-rq-list" class="es-rq-list"></div></div>' +
          '<div class="es-col">' +
            '<div class="es-card es-rq-how"><div class="es-head"><h3>How it works</h3></div>' +
              [['file-pen-line', 'Pick a letter & fill 2 fields', 'Everything else comes from your profile.'], ['user-check', 'HR reviews', 'Ayesha Noor signs digitally, usually same day.'], ['qr-code', 'Download & share', 'Each letter carries a QR code anyone can verify.']].map(function (s, i) { return '<div class="es-rq-step"><span>' + (i + 1) + '</span><div><b>' + s[1] + '</b><small>' + s[2] + '</small></div><i data-lucide="' + s[0] + '"></i></div>'; }).join('') + '</div>' +
            '<div class="es-card"><div class="es-head"><h3>Turnaround</h3><span class="spacer"></span><span class="pill"><i data-lucide="zap"></i>Avg <b class="up">5h 12m</b></span></div>' +
              '<div class="es-stats"><div class="es-stat"><span>Issued this year</span><b>214</b><small>company-wide</small></div><div class="es-stat"><span>Same-day</span><b>87%</b><small>signed before 6 PM</small></div></div></div>' +
          '</div></div>';
    },
    bind: function (sec) {
      renderReqs(sec);
      ES.acts(sec, {
        new: function (b) { openSheet(sec, b.dataset.t || 'salary'); },
        view: function (b) { openLetter(REQS.find(function (r) { return r.id === b.dataset.id; })); },
        withdraw: function (b) {
          var r = REQS.find(function (x) { return x.id === b.dataset.id; });
          ES.confirm({ title: 'Withdraw ' + r.id + '?', text: 'HR will stop processing this request.', okLabel: 'Withdraw', danger: true }).then(function (ok) {
            if (!ok) return; r.state = 'cancel'; r.at = Math.max(r.at, 1); r.why = 'Withdrawn by you on 01 Oct 2026'; renderReqs(sec); FS.toast('Request withdrawn', { tone: 'info' });
          });
        },
      });
    },
  });
})();

/* ---------- 11-helpdesk.js ---------- */
/* ess/helpdesk: categories, ticket list with live SLA countdowns, chat drawer, CSAT */
(function () {
  var $ = ES.$, $$ = ES.$$;
  var H = 3600e3, NOW = Date.now();
  var CAT = {
    HR: { ic: 'users', tone: 'green', team: 'Fatima Noor', sla: 72, desc: 'Policies, insurance, letters, leave rules', avg: '6h 10m' },
    Payroll: { ic: 'banknote', tone: 'lime', team: 'Nida Shah', sla: 48, desc: 'Salary, commission, tax, deductions', avg: '4h 25m' },
    IT: { ic: 'laptop', tone: 'blue', team: 'Mehwish Tariq', sla: 24, desc: 'Laptop, VPN, email, mobile app access', avg: '1h 50m' },
    Admin: { ic: 'building-2', tone: 'orange', team: 'Faisal Qureshi', sla: 72, desc: 'Parking, travel desk, stationery, ID cards', avg: '9h 05m' },
  };
  var T = [
    { id: 'HD-2026-0436', cat: 'Payroll', sub: 'Commission for Sept not matching CRM', st: 'In progress', pri: 'High', agent: 'Nida Shah', opened: '30 Sep, 11:20 AM', due: NOW + 6 * H, slaH: 48,
      msgs: [
        { me: 1, t: 'Assalam-o-Alaikum. My September payslip shows commission of Rs 27,500 but CRM shows Rs 31,200 on closed invoices (Packages Ltd + Metro). Screenshot attached.', at: '30 Sep, 11:20 AM', file: 'crm-commission-sep.png' },
        { me: 0, t: 'Walaikum Assalam Bilal. Thanks for the screenshot. Two Metro invoices (INV-2026-000412/413) were collected on 01 Oct, so they fall into the October commission cycle per policy. Checking the third difference with Sales Ops.', at: '30 Sep, 02:05 PM' },
        { me: 0, t: 'Update: Sales Ops confirmed Rs 1,150 was missed on a return reversal. It will be added as arrears in October payroll.', at: 'Today, 08:40 AM' },
      ] },
    { id: 'HD-2026-0441', cat: 'HR', sub: 'Update spouse in medical insurance', st: 'Open', pri: 'Normal', agent: 'Fatima Noor', opened: '29 Sep, 04:10 PM', due: NOW + 52 * H, slaH: 72,
      msgs: [{ me: 1, t: 'I got married on 20 Sep. Please add my wife Ayesha Bilal to the Jubilee group health policy. Nikah nama and CNIC attached.', at: '29 Sep, 04:10 PM', file: 'nikah-nama.pdf' }] },
    { id: 'HD-2026-0418', cat: 'IT', sub: 'VPN not connecting on field laptop', st: 'Resolved', pri: 'High', agent: 'Mehwish Tariq', opened: '23 Sep, 09:30 AM', met: 'Met SLA · 3h 12m', csat: 0,
      msgs: [
        { me: 1, t: 'FortiClient shows “credential or SSLVPN configuration is wrong” since this morning. I can’t open Finsoft from the client site.', at: '23 Sep, 09:30 AM' },
        { me: 0, t: 'Your AD password expired last night, which also locks VPN. I have reset it and sent a temporary password by SMS to 0312-4778899.', at: '23 Sep, 11:05 AM' },
        { me: 1, t: 'Working now, JazakAllah!', at: '23 Sep, 12:42 PM' },
        { me: 0, t: 'Great. Marking this resolved. Please rate us when you get a minute.', at: '24 Sep, 09:00 AM' },
      ] },
    { id: 'HD-2026-0402', cat: 'Admin', sub: 'Parking sticker for new bike', st: 'Closed', pri: 'Low', agent: 'Faisal Qureshi', opened: '12 Sep, 10:15 AM', met: 'Met SLA · 1d 2h', csat: 4,
      msgs: [
        { me: 1, t: 'Need a parking sticker for my new Honda CG-125 (LEB-26-4417).', at: '12 Sep, 10:15 AM' },
        { me: 0, t: 'Sticker #P-2231 is ready at the reception. Please collect it with your employee card.', at: '13 Sep, 12:20 PM' },
      ] },
  ];
  var FAQ = [
    ['When is salary credited?', 'Salary is credited on the last working day of each month to your registered bank account.', 'Payroll'],
    ['How is income tax on salary calculated?', 'Tax u/s 149 is projected on your annual taxable salary under FBR slabs and deducted evenly each month.', 'Payroll'],
    ['How do I reset my email or VPN password?', 'Use the self-service reset at the login page, or raise an IT ticket. VPN uses the same AD password.', 'IT'],
    ['Can I add a dependent to medical insurance?', 'Yes, within 30 days of marriage or birth. Attach the nikah nama or B-form to an HR ticket.', 'HR'],
    ['How do I get a visiting card reprint?', 'Admin ticket with the corrected details. Turnaround is 3 working days.', 'Admin'],
  ];
  var filter = 'All';
  var secRef = null;

  function slaChip(t) {
    if (t.st === 'Resolved' || t.st === 'Closed') return '<span class="es-hd-sla met"><i data-lucide="circle-check"></i>' + (t.met || 'Met SLA') + '</span>';
    return '<span class="es-hd-sla" data-sla="' + t.id + '"><i data-lucide="timer"></i><b>' + left(t) + '</b></span>';
  }
  function left(t) {
    var ms = Math.max(0, t.due - Date.now()), s = Math.floor(ms / 1000);
    var d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
    return (d ? d + 'd ' + h + 'h ' + ES.pad(m) + 'm' : h + 'h ' + ES.pad(m) + 'm ' + ES.pad(sec) + 's') + ' left';
  }
  function slaTone(t) { var hrs = (t.due - Date.now()) / H; return hrs < 8 ? 'hot' : hrs < 24 ? 'warm' : 'ok'; }
  function tickSla() {
    $$('[data-sla]').forEach(function (el) {
      var t = T.find(function (x) { return x.id === el.dataset.sla; }); if (!t || !t.due) return;
      el.querySelector('b').textContent = left(t);
      el.classList.remove('ok', 'warm', 'hot'); el.classList.add(slaTone(t));
      var bar = el.parentElement && el.parentElement.querySelector('.es-hd-slabar i');
      if (bar) bar.style.width = Math.max(2, 100 - (t.due - Date.now()) / (t.slaH * H) * 100) + '%';
    });
  }

  function row(t, i) {
    var c = CAT[t.cat];
    var used = t.due ? Math.max(2, 100 - (t.due - Date.now()) / (t.slaH * H) * 100) : 100;
    return '<article class="es-hd-tk es-in" style="--i:' + i + '" data-act="open" data-id="' + t.id + '" tabindex="0" role="button">' +
      '<span class="icon-tile ' + c.tone + '"><i data-lucide="' + c.ic + '"></i></span>' +
      '<div class="es-hd-tk-main"><div class="es-hd-tk-top"><small>' + t.id + ' · ' + t.cat + '</small>' + (t.pri === 'High' ? '<span class="badge danger">High</span>' : '') + '</div>' +
      '<b>' + ES.esc(t.sub) + '</b>' +
      '<div class="es-hd-tk-meta">' + ES.av(t.agent, 'xs') + '<span>' + t.agent + '</span><span class="es-hd-sep">·</span><span>' + t.msgs.length + ' message' + (t.msgs.length > 1 ? 's' : '') + '</span><span class="es-hd-sep">·</span><span>Opened ' + t.opened + '</span></div>' +
      (t.due ? '<div class="es-hd-slabar"><i style="width:' + used + '%"></i></div>' : '') + '</div>' +
      '<div class="es-hd-tk-side">' + ES.badge(t.st) + slaChip(t) + (t.st === 'Resolved' && !t.csat ? '<span class="es-hd-rate"><i data-lucide="star"></i>Rate</span>' : t.csat ? '<span class="es-hd-stars-mini">' + stars(t.csat) + '</span>' : '') + '</div></article>';
  }
  function stars(n) { var s = ''; for (var i = 1; i <= 5; i++) s += '<i data-lucide="star" class="' + (i <= n ? 'on' : '') + '"></i>'; return s; }
  function renderList() {
    var host = $('#es-hd-list', secRef);
    var xs = T.filter(function (t) { return filter === 'All' || t.st === filter; });
    host.innerHTML = xs.length ? xs.map(row).join('') : '<div class="es-empty"><span class="icon-tile lime"><i data-lucide="inbox"></i></span><b>No ' + filter.toLowerCase() + ' tickets</b><span>Nice and quiet here.</span></div>';
    FS.icons(host); tickSla();
    $$('[data-hf]', secRef).forEach(function (b) { var f = b.dataset.hf; b.querySelector('i').textContent = T.filter(function (t) { return f === 'All' || t.st === f; }).length; });
    var open = T.filter(function (t) { return t.st === 'Open' || t.st === 'In progress'; }).length;
    ES.tick($('#es-hd-open', secRef), open, { dec: 0 });
    Object.keys(CAT).forEach(function (k) { var el = $('[data-cc="' + k + '"]', secRef); if (el) el.textContent = T.filter(function (t) { return t.cat === k && (t.st === 'Open' || t.st === 'In progress'); }).length + ' open'; });
  }

  function bubble(m, t) {
    return '<div class="es-hd-msg ' + (m.me ? 'me' : 'them') + '">' + (m.me ? '' : ES.av(t.agent, 'sm')) +
      '<div><div class="es-hd-bub">' + ES.esc(m.t) + (m.file ? '<span class="es-hd-att"><i data-lucide="paperclip"></i>' + m.file + '</span>' : '') + '</div><small>' + (m.me ? 'You' : t.agent) + ' · ' + m.at + '</small></div></div>';
  }
  function openTicket(id) {
    var t = T.find(function (x) { return x.id === id; }); if (!t) return;
    var c = CAT[t.cat], closed = t.st === 'Resolved' || t.st === 'Closed';
    var html = '<div class="es-hd-dhead"><span class="icon-tile ' + c.tone + '"><i data-lucide="' + c.ic + '"></i></span><div><b>' + t.cat + ' desk</b><small>Assigned to ' + t.agent + ' · Priority ' + t.pri + '</small></div><span class="spacer"></span>' + ES.badge(t.st) + '</div>' +
      '<div class="es-hd-dsla">' + slaChip(t) + (t.due ? '<div class="es-hd-slabar"><i></i></div>' : '') + '<small>Response SLA ' + (t.slaH || c.sla) + 'h · opened ' + t.opened + '</small></div>' +
      '<div class="es-hd-chat" id="es-hd-chat">' + t.msgs.map(function (m) { return bubble(m, t); }).join('') + '</div>' +
      (t.st === 'Resolved' ? csatBlock(t) : '') +
      (t.st === 'Closed' ? '<div class="es-hd-closed"><i data-lucide="lock"></i>This ticket is closed. ' + (t.csat ? 'You rated it ' + t.csat + '/5.' : '') + ' <button class="es-link" type="button" data-hd="reopen">Reopen<i data-lucide="rotate-ccw"></i></button></div>' :
      '<form class="es-hd-compose" id="es-hd-compose"><div class="es-files" id="es-hd-cfiles"></div><div class="es-hd-crow"><button type="button" class="icon-btn-sm" data-hd="attach" aria-label="Attach file" data-tip="Attach"><i data-lucide="paperclip"></i></button>' +
      '<textarea rows="1" placeholder="Write a reply… (Enter to send, Shift+Enter for a new line)" aria-label="Reply"></textarea><button class="btn primary sm" type="submit"><i data-lucide="send"></i>Send</button></div></form>');
    var dr = FS.drawer({ title: ES.esc(t.sub), subtitle: t.id, html: html });
    dr.classList.add('es-hd-drawer', 'es-sheet-host');
    var chat = $('#es-hd-chat', dr); chat.scrollTop = chat.scrollHeight;
    tickSla();
    dr.addEventListener('click', function (e) {
      var b = e.target.closest('[data-hd]'); if (!b) return;
      var a = b.dataset.hd;
      if (a === 'attach') { $('#es-hd-cfiles', dr).insertAdjacentHTML('beforeend', ES.fileChip('screenshot-' + (Math.random() * 900 + 100 | 0) + '.png', '384 KB')); FS.icons(dr); }
      if (a === 'star') { var n = +b.dataset.n; t._r = n; $$('[data-hd=star]', dr).forEach(function (s, i) { s.classList.toggle('on', i < n); s.classList.remove('pop'); if (i < n) { void s.offsetWidth; s.classList.add('pop'); s.style.setProperty('--i', i); } }); $('.es-hd-csat-l', dr).textContent = ['', 'Poor', 'Could be better', 'Okay', 'Good', 'Excellent!'][n]; $('[data-hd=csat]', dr).disabled = false; }
      if (a === 'csat') {
        ES.busy(b, 700, 'Sending…').then(function () {
          t.csat = t._r; t.st = 'Closed';
          var blk = $('.es-hd-csat', dr);
          blk.innerHTML = '<div class="es-hd-thanks"><span class="icon-tile lime"><i data-lucide="heart"></i></span><div><b>Thanks for rating ' + t.agent.split(' ')[0] + ' ' + t.csat + '/5</b><small>Your feedback goes straight to the ' + t.cat + ' desk lead.</small></div></div>';
          FS.icons(blk); ES.celebrate(blk); renderList();
        });
      }
      if (a === 'reopen') { t.st = 'Open'; t.due = Date.now() + (t.slaH || 24) * H; t.slaH = t.slaH || 24; FS.closeOverlays(); renderList(); FS.toast(t.id + ' reopened', { tone: 'info' }); setTimeout(function () { openTicket(t.id); }, 260); }
    });
    var form = $('#es-hd-compose', dr);
    if (form) {
      var ta = $('textarea', form);
      ta.addEventListener('input', function () { ta.style.height = 'auto'; ta.style.height = Math.min(120, ta.scrollHeight) + 'px'; });
      ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var txt = ta.value.trim(); if (!txt) { ta.focus(); return; }
        var files = $$('.es-file b', form).map(function (x) { return x.textContent; });
        var m = { me: 1, t: txt, at: 'Just now', file: files[0] };
        t.msgs.push(m);
        chat.insertAdjacentHTML('beforeend', bubble(m, t)); FS.icons(chat);
        chat.lastElementChild.classList.add('es-hd-new');
        ta.value = ''; ta.style.height = ''; $('#es-hd-cfiles', dr).innerHTML = '';
        chat.scrollTo({ top: chat.scrollHeight, behavior: 'smooth' });
        if (t.st === 'Resolved') { t.st = 'Open'; t.due = Date.now() + 24 * H; t.slaH = 24; }
        var typing = document.createElement('div');
        typing.className = 'es-hd-msg them es-hd-new'; typing.innerHTML = ES.av(t.agent, 'sm') + '<div><div class="es-hd-bub es-hd-typing"><i></i><i></i><i></i></div><small>' + t.agent + ' is typing…</small></div>';
        setTimeout(function () { chat.appendChild(typing); chat.scrollTo({ top: chat.scrollHeight, behavior: 'smooth' }); }, 600);
        setTimeout(function () {
          typing.remove();
          var r = { me: 0, t: reply(t, txt), at: 'Just now' };
          t.msgs.push(r); if (t.st === 'Open') t.st = 'In progress';
          chat.insertAdjacentHTML('beforeend', bubble(r, t)); FS.icons(chat); chat.lastElementChild.classList.add('es-hd-new');
          chat.scrollTo({ top: chat.scrollHeight, behavior: 'smooth' });
          renderList();
        }, 2500);
        renderList();
      });
    }
  }
  function reply(t, txt) {
    var f = t.agent.split(' ')[0];
    if (t.cat === 'Payroll') return 'Thanks Bilal, noted. I have linked this to the October payroll review (PR-2026-10). You will see the arrears line on your payslip. — ' + f;
    if (t.cat === 'HR') return 'Got it. I have forwarded the documents to Jubilee Life. The updated e-card usually arrives within 5 working days. — ' + f;
    if (t.cat === 'IT') return 'On it. If it happens again, please share a screenshot of the error and your laptop asset tag (AN-LT-0xx). — ' + f;
    return 'Thanks, I will update you shortly. — ' + f;
  }
  function csatBlock(t) {
    return '<div class="es-hd-csat"><div><b>How did ' + t.agent.split(' ')[0] + ' do?</b><small>Rate the resolution of ' + t.id + '</small></div><div class="es-hd-stars" role="radiogroup" aria-label="Rating">' +
      [1, 2, 3, 4, 5].map(function (n) { return '<button type="button" data-hd="star" data-n="' + n + '" aria-label="' + n + ' stars"><i data-lucide="star"></i></button>'; }).join('') +
      '</div><span class="es-hd-csat-l">Tap a star</span><button class="btn primary sm" type="button" data-hd="csat" disabled>Submit rating</button></div>';
  }

  var KEYS = { salary: 'Payroll', commission: 'Payroll', tax: 'Payroll', payslip: 'Payroll', laptop: 'IT', vpn: 'IT', email: 'IT', password: 'IT', insurance: 'HR', leave: 'HR', letter: 'HR', parking: 'Admin', card: 'Admin', travel: 'Admin' };
  function newTicket(cat) {
    cat = cat || 'Payroll';
    var el = ES.sheet({ title: 'New ticket', sub: 'We reply within the desk’s SLA. You’ll get WhatsApp and email updates.', cls: 'es-hd-sheet',
      html: '<div class="es-field"><span>Category</span><div class="es-opts" id="es-hd-cats">' + Object.keys(CAT).map(function (k) { return '<button type="button" class="es-opt ' + (k === cat ? 'on' : '') + '" data-c="' + k + '"><i data-lucide="' + CAT[k].ic + '"></i>' + k + '</button>'; }).join('') + '</div>' +
        '<span class="es-hint" id="es-hd-route"></span></div>' +
        '<div class="form-grid" style="margin-top:14px"><label class="full"><span>Subject *</span><input id="es-hd-subj" placeholder="e.g. Commission missing for Metro invoices"></label>' +
        '<div class="full" id="es-hd-sugg"></div>' +
        '<label><span>Priority</span><select id="es-hd-pri"><option>Low</option><option selected>Normal</option><option>High</option></select></label>' +
        '<label><span>Contact me on</span><select><option>WhatsApp · 0312-4778899</option><option>Email · bilal.khan@alnoor.com.pk</option></select></label>' +
        '<label class="full"><span>Describe the issue *</span><textarea id="es-hd-desc" rows="4" placeholder="What happened, when, and what you expected."></textarea></label></div>' +
        '<div class="es-field" style="margin-top:12px"><span>Attachments</span><div class="es-drop" data-hdn="drop" tabindex="0"><i data-lucide="upload-cloud"></i><div><b>Click to attach</b> screenshots or PDFs · max 10 MB</div></div><div class="es-files" id="es-hd-files" style="margin-top:8px"></div></div>',
      foot: '<button class="btn secondary" data-close>Cancel</button><button class="btn primary" data-hdn="submit"><i data-lucide="send"></i>Submit ticket</button>' });
    var pick = function (k) { cat = k; $$('#es-hd-cats .es-opt', el).forEach(function (b) { b.classList.toggle('on', b.dataset.c === k); }); $('#es-hd-route', el).innerHTML = '<i data-lucide="corner-down-right"></i> Routed to ' + CAT[k].team + ' · ' + CAT[k].desc.toLowerCase() + ' · SLA <b>' + CAT[k].sla + 'h</b>'; FS.icons($('#es-hd-route', el)); };
    pick(cat);
    var files = ['payslip-sep-2026.pdf', 'screenshot-crm.png', 'cnic-front.jpg'], fi = 0;
    el.addEventListener('click', function (e) {
      var c = e.target.closest('[data-c]'); if (c) pick(c.dataset.c);
      var b = e.target.closest('[data-hdn]'); if (!b) return;
      if (b.dataset.hdn === 'drop') { $('#es-hd-files', el).insertAdjacentHTML('beforeend', ES.fileChip(files[fi++ % files.length], (120 + fi * 97) + ' KB')); FS.icons(el); }
      if (b.dataset.hdn === 'submit') {
        var s = $('#es-hd-subj', el), d = $('#es-hd-desc', el);
        if (!s.value.trim() || !d.value.trim()) { [s, d].forEach(function (x) { if (!x.value.trim()) { x.classList.remove('es-hd-shake'); void x.offsetWidth; x.classList.add('es-hd-shake'); } }); FS.toast('Add a subject and a short description', { tone: 'warn' }); return; }
        var pri = $('#es-hd-pri', el).value, sla = CAT[cat].sla / (pri === 'High' ? 2 : 1);
        ES.busy(b, 900, 'Submitting…').then(function () {
          var id = 'HD-2026-0' + (442 + T.length - 4);
          var f = $$('#es-hd-files .es-file b', el).map(function (x) { return x.textContent; });
          T.unshift({ id: id, cat: cat, sub: s.value.trim(), st: 'Open', pri: pri, agent: CAT[cat].team, opened: 'Today, ' + new Date().toTimeString().slice(0, 5), due: Date.now() + sla * H, slaH: sla, msgs: [{ me: 1, t: d.value.trim(), at: 'Just now', file: f[0] }] });
          ES.closeSheet(el); filter = 'All';
          $$('[data-hf]', secRef).forEach(function (x) { x.classList.toggle('active', x.dataset.hf === 'All'); });
          renderList();
          var first = $('.es-hd-tk', secRef); ES.flash(first); ES.celebrate(first);
          FS.toast(id + ' created · ' + CAT[cat].team + ' will respond within ' + sla + 'h', { tone: 'good', action: { label: 'Open', fn: function () { openTicket(id); } } });
        });
      }
    });
    $('#es-hd-subj', el).addEventListener('input', function (e) {
      var q = e.target.value.toLowerCase(), hit = Object.keys(KEYS).find(function (k) { return q.indexOf(k) > -1; });
      if (hit && KEYS[hit] !== cat) pick(KEYS[hit]);
      var faq = q.length > 2 ? FAQ.filter(function (f) { return q.split(/\s+/).some(function (w) { return w.length > 2 && f[0].toLowerCase().indexOf(w) > -1; }); }).slice(0, 2) : [];
      $('#es-hd-sugg', el).innerHTML = faq.length ? '<div class="es-hd-sugg"><small><i data-lucide="sparkles"></i>These answers might help</small>' + faq.map(function (f) { return '<details><summary>' + f[0] + '</summary><p>' + f[1] + '</p></details>'; }).join('') + '</div>' : '';
      FS.icons($('#es-hd-sugg', el));
    });
  }

  ES.route('ess/helpdesk', {
    render: function () {
      return '<div class="es-grid es-g4 es-hd-cats">' + Object.keys(CAT).map(function (k, i) {
        var c = CAT[k];
        return '<button type="button" class="es-card es-hd-cat" data-act="newcat" data-cat="' + k + '" style="--i:' + i + '"><div class="es-row"><span class="icon-tile ' + c.tone + '"><i data-lucide="' + c.ic + '"></i></span><span class="spacer"></span><span class="pill" data-cc="' + k + '">0 open</span></div>' +
          '<div><b>' + k + '</b><small>' + c.desc + '</small></div><div class="es-hd-cat-foot"><span><i data-lucide="clock"></i>Avg reply ' + c.avg + '</span><span class="es-link">Ask<i data-lucide="arrow-right"></i></span></div></button>';
      }).join('') + '</div>' +
      '<div class="es-grid es-main">' +
        '<div class="es-card flush"><div class="es-head"><h3>My tickets</h3><span class="es-count" id="es-hd-open">0</span><span class="es-label">active</span><span class="spacer"></span>' +
        '<div class="chips es-hd-chips">' + ['All', 'Open', 'In progress', 'Resolved', 'Closed'].map(function (f, i) { return '<button type="button" class="' + (i ? '' : 'active') + '" data-hf="' + f + '">' + f + ' <i>0</i></button>'; }).join('') + '</div></div>' +
        '<div id="es-hd-list" class="es-hd-list"></div></div>' +
        '<div class="es-col">' +
          '<div class="es-card es-hd-perf"><div class="es-head"><h3>Service levels</h3><span class="spacer"></span><span class="pill"><i data-lucide="calendar"></i>Last 90 days</span></div>' +
          '<div class="es-row es-hd-perf-row">' + ES.ring(96, { size: 92, label: '96%', sub: 'on time', tone: 'var(--primary)' }) +
          '<div class="es-hd-perf-list"><div><span>Tickets raised</span><b>11</b></div><div><span>First reply</span><b>2h 14m</b></div><div><span>Your avg rating</span><b class="es-hd-gold">4.6 ★</b></div></div></div></div>' +
          '<div class="es-card"><div class="es-head"><h3>Quick answers</h3><span class="spacer"></span><i data-lucide="sparkles" class="es-hd-spark"></i></div>' +
          '<label class="search-field es-hd-faqs" data-plain-search><i data-lucide="search"></i><input id="es-hd-faq-q" placeholder="Search answers…"></label>' +
          '<div class="es-hd-faq" id="es-hd-faq">' + FAQ.map(function (f) { return '<details><summary><span class="badge neutral">' + f[2] + '</span>' + f[0] + '</summary><p>' + f[1] + '</p></details>'; }).join('') + '</div></div>' +
        '</div></div>';
    },
    bind: function (sec) {
      secRef = sec;
      renderList();
      ES.acts(sec, {
        'new': function () { newTicket(); },
        newcat: function (b) { newTicket(b.dataset.cat); },
        open: function (b) { openTicket(b.dataset.id); },
      });
      sec.addEventListener('keydown', function (e) { var t = e.target.closest('.es-hd-tk'); if (t && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openTicket(t.dataset.id); } });
      sec.addEventListener('click', function (e) { var c = e.target.closest('[data-hf]'); if (c) { filter = c.dataset.hf; renderList(); } });
      $('#es-hd-faq-q', sec).addEventListener('input', function (e) {
        var q = e.target.value.toLowerCase();
        $$('#es-hd-faq details', sec).forEach(function (d) { var hit = !q || d.textContent.toLowerCase().indexOf(q) > -1; d.style.display = hit ? '' : 'none'; if (q && hit) d.open = true; });
      });
      setInterval(function () { if (sec.classList.contains('active') || document.querySelector('.es-hd-drawer')) tickSla(); }, 1000);
    },
  });
})();

/* ---------- 12-goals.js ---------- */
/* ess/goals: OKRs with live sliders + rings, H1 self-assessment, 1:1 notes, feedback */
(function () {
  var $ = ES.$, $$ = ES.$$;
  /* fmt(p) renders the current value of a key result from its progress % */
  var O = [
    { t: 'Grow Lahore modern-trade revenue', ic: 'trending-up', w: 50, krs: [
      { t: 'Book Rs 18M sales in H1', p: 64, fmt: function (p) { return 'Rs ' + (18 * p / 100).toFixed(1) + 'M of Rs 18M'; } },
      { t: 'Open 12 new retail accounts', p: 58, fmt: function (p) { return Math.round(12 * p / 100) + ' of 12 accounts'; } },
      { t: 'Bring collection days to ≤ 45', p: 53, fmt: function (p) { return Math.round(60 - 15 * p / 100) + ' days · target 45'; } },
    ] },
    { t: 'Build a high-performing field team', ic: 'users', w: 30, krs: [
      { t: 'Team attendance ≥ 95%', p: 71, fmt: function (p) { return (88 + 7 * p / 100).toFixed(1) + '% · target 95%'; } },
      { t: 'Certify 2 order bookers on Finsoft mobile', p: 50, fmt: function (p) { return Math.round(2 * p / 100) + ' of 2 certified'; } },
      { t: 'Weekly route reviews', p: 77, fmt: function (p) { return Math.round(13 * p / 100) + ' of 13 weeks'; } },
    ] },
    { t: 'Customer delight', ic: 'smile', w: 20, krs: [
      { t: 'NPS ≥ 60 for key accounts', p: 70, fmt: function (p) { return 'NPS ' + Math.round(40 + 20 * p / 100) + ' · target 60'; } },
      { t: 'Resolve complaints within 48h', p: 67, fmt: function (p) { return Math.round(60 + 30 * p / 100) + '% in 48h · target 90%'; } },
    ] },
  ];
  var COMP = [
    ['Customer focus', 'Understands and anticipates customer needs'],
    ['Sales execution', 'Pipeline discipline, closing, pricing'],
    ['Team leadership', 'Coaching bookers, routes, accountability'],
    ['Communication', 'Clear, timely updates to manager and peers'],
    ['Ownership', 'Follows through without being chased'],
  ];
  var NOTES = [
    { d: '24 Sep 2026', w: 'Zainab Raza', t: 'Q2 pipeline & Metro collections', b: 'Metro aging at 61 days. Agreed to escalate via Hamza for the 2 oldest invoices. Discussed team-lead transition; Bilal to shadow Zainab on 2 approvals.', acts: [['Escalate Metro INV-412/413', 1], ['Shadow 2 leave approvals', 1], ['Draft route plan for Tanveer', 0]] },
    { d: '10 Sep 2026', w: 'Zainab Raza', t: 'Mid-quarter check-in', b: 'Sales at 52% of H1 target. Packages Ltd renewal on track for early close. Asked for Finsoft mobile training for both bookers.', acts: [['Book training with Mehwish (IT)', 1], ['Send Packages renewal draft', 1]] },
    { d: '27 Aug 2026', w: 'Zainab Raza', t: 'Goal setting H1', b: 'Locked OKRs: revenue, team, customer delight. Weightage 50/30/20.', acts: [['Upload OKRs to Finsoft', 1]] },
  ];
  var FB = [
    { w: 'Zainab Raza', r: 'Manager', tag: 'Strength', q: 'Bilal’s relationship with Packages Ltd procurement is the reason we renewed early. Keep documenting these plays for the team.', d: '22 Sep' },
    { w: 'Hamza Butt', r: 'Peer · Key Accounts', tag: 'Strength', q: 'Always shares retail intel from the field the same day. Saved me a wasted visit to Al-Fatah last week.', d: '15 Sep' },
    { w: 'Sana Javed', r: 'Finance', tag: 'Growth', q: 'Would love credit notes raised before month-end instead of on the 1st. It delays our close by a day.', d: '02 Sep' },
  ];
  var stars = {}, submitted = false;

  function oPct(o) { return Math.round(o.krs.reduce(function (s, k) { return s + k.p; }, 0) / o.krs.length); }
  function overall() { return Math.round(O.reduce(function (s, o) { return s + oPct(o) * o.w; }, 0) / 100); }
  function status(p) { return p >= 65 ? ['On track', 'good'] : p >= 50 ? ['Needs focus', 'warn'] : ['At risk', 'danger']; }

  function okr(o, i) {
    var p = oPct(o), st = status(p);
    return '<div class="es-card es-gl-obj" data-o="' + i + '"><div class="es-gl-ohead">' + ES.ring(p, { size: 64, stroke: 4, tone: 'var(--primary)', cls: 'es-gl-oring' }) +
      '<div class="es-gl-otitle"><small>Objective ' + (i + 1) + ' · weight ' + o.w + '%</small><b>' + o.t + '</b><div class="es-row wrap"><span class="badge dot ' + st[1] + '" data-st>' + st[0] + '</span><span class="es-label">' + o.krs.length + ' key results · owner Bilal Khan</span></div></div></div>' +
      '<div class="es-gl-krs">' + o.krs.map(function (k, j) {
        return '<div class="es-gl-kr" data-k="' + j + '"><div class="es-gl-kr-top"><b>' + k.t + '</b><span class="es-gl-kr-p" data-kp>' + k.p + '%</span></div>' +
          '<input type="range" min="0" max="100" value="' + k.p + '" style="--v:' + k.p + '%" aria-label="' + ES.esc(k.t) + ' progress">' +
          '<small data-kv>' + k.fmt(k.p) + '</small></div>';
      }).join('') + '</div></div>';
  }
  function compRow(c, i) {
    return '<div class="es-gl-comp" data-c="' + i + '"><div class="es-gl-comp-l"><b>' + c[0] + '</b><small>' + c[1] + '</small></div>' +
      '<div class="es-gl-stars" role="radiogroup" aria-label="' + c[0] + '">' + [1, 2, 3, 4, 5].map(function (n) { return '<button type="button" data-act="star" data-n="' + n + '" aria-label="' + n + ' of 5"><i data-lucide="star"></i></button>'; }).join('') + '<span class="es-gl-sl">Not rated</span></div>' +
      '<textarea rows="1" placeholder="Evidence or example (optional)" aria-label="' + c[0] + ' comment"></textarea></div>';
  }
  function note(n, i) {
    return '<li class="es-gl-note es-in" style="--i:' + i + '"><span class="es-gl-dot"></span><div class="es-gl-note-b"><div class="es-row wrap"><b>' + n.t + '</b><span class="spacer"></span><small>' + n.d + ' · with ' + n.w + '</small></div><p>' + ES.esc(n.b) + '</p>' +
      (n.acts.length ? '<div class="es-gl-acts">' + n.acts.map(function (a) { return '<label class="es-gl-act ' + (a[1] ? 'done' : '') + '"><input type="checkbox" ' + (a[1] ? 'checked' : '') + '><span>' + ES.esc(a[0]) + '</span></label>'; }).join('') + '</div>' : '') + '</div></li>';
  }

  function refresh(sec, oi) {
    var o = O[oi], card = $('[data-o="' + oi + '"]', sec), p = oPct(o), st = status(p);
    var ring = $('.es-gl-oring', card); ES.setRing(ring, p); $('.es-ring-in', ring).firstChild.nodeValue = p + '%';
    var b = $('[data-st]', card); if (b.textContent !== st[0]) { b.className = 'badge dot ' + st[1]; b.textContent = st[0]; b.classList.add('es-bump'); }
    var all = overall(), big = $('#es-gl-ring', sec);
    ES.setRing(big, all); ES.tick($('#es-gl-all', sec), all, { dec: 0, suffix: '%' });
    $('#es-gl-save', sec).classList.add('on');
  }

  ES.route('ess/goals', {
    render: function () {
      var all = overall();
      return '<div class="es-grid es-gl-top">' +
        '<div class="es-card night es-gl-hero"><div class="es-gl-hero-l">' + ES.ring(all, { size: 120, stroke: 3.4, tone: 'var(--lime)', label: '<span id="es-gl-all">' + all + '%</span>', sub: 'H1 progress', cls: 'es-gl-big' }).replace('class="es-ring', 'id="es-gl-ring" class="es-ring') +
        '<div><span class="es-gl-eye">FY 2026-27 · H1 (Jul – Dec)</span><h2>You’re ahead of plan, Bilal.</h2><p>Expected progress today is 50%. Your weighted OKR score leads it by a healthy margin.</p>' +
        '<div class="es-row wrap"><span class="es-gl-chip"><i data-lucide="target"></i>3 objectives · 8 key results</span><span class="es-gl-chip"><i data-lucide="calendar-clock"></i>Self-review due 15 Oct · 14 days</span></div></div></div>' +
        '<div class="es-gl-save" id="es-gl-save"><span>Unsaved check-in</span><button class="btn lime sm" type="button" data-act="save"><i data-lucide="check"></i>Save check-in</button></div></div>' +
        '<div class="es-card es-gl-cycle"><div class="es-head"><h3>H1 review cycle</h3><span class="spacer"></span><span class="badge warn dot" id="es-gl-cst">Self-assessment</span></div>' +
        '<div id="es-gl-track">' + ES.tracker(['Goals set', 'Self-review', 'Manager', 'Calibration', 'Sign-off'], 1, 'ok', ['27 Aug', 'Due 15 Oct', 'Zainab Raza', 'HR · Nov', 'Dec']) + '</div>' +
        '<div class="es-gl-mgr">' + ES.av('Zainab Raza', 'sm') + '<div><b>Zainab Raza</b><small>Sales Manager · reviews after you submit</small></div><span class="spacer"></span><button class="btn secondary sm" type="button" data-act="toreview">Start<i data-lucide="arrow-down"></i></button></div></div></div>' +

        '<div class="es-grid es-wide">' +
          '<div class="es-col"><div class="es-head es-gl-sh"><h3>Objectives &amp; key results</h3><span class="spacer"></span><span class="es-label"><i data-lucide="move-horizontal"></i> Drag a slider to update progress</span></div>' + O.map(okr).join('') + '</div>' +
          '<div class="es-col">' +
            '<div class="es-card"><div class="es-head"><h3>1:1 notes</h3><span class="spacer"></span><button class="es-link" type="button" data-act="checkin">Add note<i data-lucide="plus"></i></button></div><ol class="es-gl-tl" id="es-gl-tl">' + NOTES.map(note).join('') + '</ol></div>' +
            '<div class="es-card"><div class="es-head"><h3>Feedback received</h3><span class="es-count">' + FB.length + '</span><span class="spacer"></span><button class="es-link" type="button" data-act="askfb">Request<i data-lucide="send"></i></button></div>' +
            FB.map(function (f) { return '<figure class="es-gl-fb"><blockquote>“' + f.q + '”</blockquote><figcaption>' + ES.av(f.w, 'xs') + '<b>' + f.w + '</b><small>' + f.r + ' · ' + f.d + '</small><span class="spacer"></span><span class="badge ' + (f.tag === 'Strength' ? 'good' : 'info') + '">' + f.tag + '</span></figcaption></figure>'; }).join('') + '</div>' +
          '</div></div>' +

        '<div class="es-card es-gl-form" id="es-gl-form"><div class="es-head"><div><h3>H1 self-assessment</h3><p>Rate yourself honestly against each competency. Zainab sees this after you submit.</p></div><span class="spacer"></span><div class="es-gl-meter"><span><b id="es-gl-done">0</b>/5 rated</span><div class="progress"><i id="es-gl-bar" style="width:0%"></i></div></div></div>' +
        '<div class="es-gl-comps">' + COMP.map(compRow).join('') + '</div>' +
        '<div class="es-grid es-g2 es-gl-bottom"><div class="es-field"><span>Overall self-rating <b class="es-gl-ov" id="es-gl-ov">3.5</b> <small class="es-label" id="es-gl-ovl">Meets expectations+</small></span><input type="range" id="es-gl-ovr" min="1" max="5" step="0.5" value="3.5" style="--v:62.5%"><div class="es-gl-scale"><span>Below</span><span>Meets</span><span>Exceeds</span><span>Outstanding</span></div></div>' +
        '<label class="es-field"><span>Key achievements this half</span><textarea rows="3" id="es-gl-ach">Closed Packages Ltd renewal 2 weeks early (Rs 4.2M). Opened 7 new retail accounts in Gulberg and Model Town.</textarea></label></div>' +
        '<div class="es-row wrap es-gl-foot"><span class="es-label"><i data-lucide="lock"></i> Private until submitted · autosaved 09:02 AM</span><span class="spacer"></span><button class="btn secondary" type="button" data-act="draft">Save draft</button><button class="btn primary" type="button" data-act="submit"><i data-lucide="send"></i>Submit to Zainab</button></div></div>';
    },
    bind: function (sec) {
      sec.addEventListener('input', function (e) {
        var r = e.target;
        if (r.matches('.es-gl-kr input[type=range]')) {
          var kr = r.closest('.es-gl-kr'), oi = +r.closest('[data-o]').dataset.o, k = O[oi].krs[+kr.dataset.k];
          k.p = +r.value; r.style.setProperty('--v', k.p + '%');
          $('[data-kp]', kr).textContent = k.p + '%'; $('[data-kv]', kr).textContent = k.fmt(k.p);
          kr.classList.toggle('done', k.p >= 100);
          refresh(sec, oi);
        }
        if (r.id === 'es-gl-ovr') {
          var v = +r.value; r.style.setProperty('--v', ((v - 1) / 4 * 100) + '%');
          $('#es-gl-ov', sec).textContent = v.toFixed(1);
          $('#es-gl-ovl', sec).textContent = v < 2 ? 'Below expectations' : v < 3 ? 'Partially meets' : v < 3.5 ? 'Meets expectations' : v < 4.5 ? 'Exceeds expectations' : 'Outstanding';
        }
        if (r.matches('.es-gl-comp textarea')) { r.style.height = 'auto'; r.style.height = r.scrollHeight + 'px'; }
      });
      sec.addEventListener('change', function (e) {
        var c = e.target.closest('.es-gl-act'); if (c) { c.classList.toggle('done', e.target.checked); if (e.target.checked) ES.celebrate(c); }
        if (e.target.matches('.es-gl-kr input[type=range]')) { var kr = e.target.closest('.es-gl-kr'); if (+e.target.value >= 100) { ES.celebrate(kr); FS.toast('Key result complete', { tone: 'good' }); } }
      });
      ES.acts(sec, {
        save: function (b) { ES.busy(b, 700, 'Saving…').then(function () { $('#es-gl-save', sec).classList.remove('on'); FS.toast('Check-in saved · Zainab Raza notified', { tone: 'good' }); }); },
        toreview: function () {ES.scrollTo($('#es-gl-form', sec), true); $('#es-gl-form', sec).classList.remove('es-gl-glow'); void sec.offsetWidth; $('#es-gl-form', sec).classList.add('es-gl-glow'); },
        star: function (b) {
          if (submitted) return;
          var row = b.closest('.es-gl-comp'), n = +b.dataset.n; stars[row.dataset.c] = n;
          $$('[data-act=star]', row).forEach(function (s, i) { s.classList.toggle('on', i < n); s.classList.remove('pop'); if (i < n) { void s.offsetWidth; s.style.setProperty('--i', i); s.classList.add('pop'); } });
          $('.es-gl-sl', row).textContent = ['', 'Needs work', 'Developing', 'Solid', 'Strong', 'Role model'][n];
          row.classList.add('rated');
          var done = Object.keys(stars).length;
          $('#es-gl-done', sec).textContent = done; $('#es-gl-bar', sec).style.width = done * 20 + '%';
        },
        draft: function (b) { ES.busy(b, 600, 'Saving…').then(function () { FS.toast('Draft saved', { tone: 'info' }); }); },
        submit: function (b) {
          var miss = COMP.filter(function (c, i) { return !stars[i]; });
          if (miss.length) {
            $$('.es-gl-comp:not(.rated)', sec).forEach(function (r) { r.classList.remove('es-gl-need'); void r.offsetWidth; r.classList.add('es-gl-need'); });
            FS.toast('Rate ' + miss.length + ' more competenc' + (miss.length > 1 ? 'ies' : 'y') + ' to submit', { tone: 'warn' }); return;
          }
          ES.confirm({ title: 'Submit self-assessment?', text: 'Zainab Raza will be notified and your ratings lock. You can still add comments in your next 1:1.', okLabel: 'Submit' }).then(function (ok) {
            if (!ok) return;
            ES.busy(b, 1000, 'Submitting…').then(function () {
              submitted = true;
              var f = $('#es-gl-form', sec); f.classList.add('es-gl-sent');
              $$('textarea, input', f).forEach(function (x) { x.disabled = true; });
              $('.es-gl-foot', f).innerHTML = '<span class="es-gl-sentmsg"><i data-lucide="circle-check"></i>Submitted on 01 Oct 2026 · awaiting Zainab Raza</span><span class="spacer"></span><button class="btn secondary" type="button" data-act="toreview">View</button>';
              $('#es-gl-track', sec).innerHTML = ES.tracker(['Goals set', 'Self-review', 'Manager', 'Calibration', 'Sign-off'], 2, 'ok', ['27 Aug', 'Sent 01 Oct', 'Zainab Raza', 'HR · Nov', 'Dec']);
              var cst = $('#es-gl-cst', sec); cst.className = 'badge info dot'; cst.textContent = 'With manager';
              FS.icons(sec); ES.celebrate(b.isConnected ? b : f);
              FS.toast('Self-assessment submitted to Zainab Raza', { tone: 'good' });
            });
          });
        },
        checkin: function () {
          var el = ES.sheet({ title: 'New 1:1 note', sub: 'Shared with Zainab Raza. Action items show up in both your task lists.',
            html: '<div class="form-grid"><label class="full"><span>Topic *</span><input id="es-gl-nt" placeholder="e.g. October route plan"></label>' +
              '<label><span>Date</span><input type="date" value="2026-10-01"></label><label><span>With</span><select><option>Zainab Raza</option><option>Umar Farooq</option></select></label>' +
              '<label class="full"><span>Notes</span><textarea rows="4" id="es-gl-nb" placeholder="What did you discuss?"></textarea></label>' +
              '<label class="full"><span>Action items (one per line)</span><textarea rows="3" id="es-gl-na" placeholder="Share revised route plan with Tanveer"></textarea></label></div>',
            foot: '<button class="btn secondary" data-close>Cancel</button><button class="btn primary" data-gn="save"><i data-lucide="check"></i>Add note</button>' });
          $('[data-gn=save]', el).addEventListener('click', function (e) {
            var t = $('#es-gl-nt', el);
            if (!t.value.trim()) { t.classList.add('es-hd-shake'); t.focus(); return; }
            ES.busy(e.currentTarget, 600, 'Saving…').then(function () {
              var n = { d: '01 Oct 2026', w: 'Zainab Raza', t: t.value.trim(), b: $('#es-gl-nb', el).value.trim() || 'No notes added.', acts: $('#es-gl-na', el).value.split('\n').filter(function (x) { return x.trim(); }).map(function (x) { return [x.trim(), 0]; }) };
              NOTES.unshift(n); ES.closeSheet(el);
              var tl = $('#es-gl-tl', sec); tl.insertAdjacentHTML('afterbegin', note(n, 0)); FS.icons(tl); ES.flash(tl.firstElementChild);
              FS.toast('1:1 note added', { tone: 'good' });
            });
          });
        },
        askfb: function () {
          var el = ES.sheet({ title: 'Request feedback', sub: 'Pick up to 3 colleagues. They get a 2-minute form.', cls: 'es-sheet-sm',
            html: '<label class="es-field"><span>Colleague</span><input id="es-gl-fbp" placeholder="Start typing a name…"></label><div class="es-files" id="es-gl-fbl" style="margin-top:10px"></div>',
            foot: '<button class="btn secondary" data-close>Cancel</button><button class="btn primary" data-gf="send"><i data-lucide="send"></i>Send requests</button>' });
          ES.autocomplete($('#es-gl-fbp', el), ES.PEOPLE.filter(function (p) { return p.name !== 'Bilal Khan'; }).map(function (p) { return { name: p.name, sub: p.role + ' · ' + p.dept }; }), function (p) {
            $('#es-gl-fbl', el).insertAdjacentHTML('beforeend', '<span class="es-file">' + ES.av(p.name, 'xs') + '<b>' + p.name + '</b><button type="button" class="es-file-x" data-es-file-x aria-label="Remove"><i data-lucide="x"></i></button></span>');
            FS.icons(el); $('#es-gl-fbp', el).value = '';
          });
          $('[data-gf=send]', el).addEventListener('click', function (e) {
            var n = $$('#es-gl-fbl .es-file', el).length;
            if (!n) { FS.toast('Pick at least one colleague', { tone: 'warn' }); return; }
            ES.busy(e.currentTarget, 700, 'Sending…').then(function () { ES.closeSheet(el); FS.toast('Feedback requested from ' + n + ' colleague' + (n > 1 ? 's' : ''), { tone: 'good' }); });
          });
        },
      });
    },
  });
})();

/* ---------- 13-kudos.js ---------- */
/* ess/kudos: recognition wall, give kudos with drop-in, weekly pulse, live poll */
(function () {
  var $ = ES.$, $$ = ES.$$;
  var BADGES = {
    'Customer Hero': { ic: 'award', tone: 'lime' },
    'Team Player': { ic: 'users', tone: 'blue' },
    'Go-Getter': { ic: 'rocket', tone: 'orange' },
    'Problem Solver': { ic: 'lightbulb', tone: 'violet' },
    'Mentor': { ic: 'graduation-cap', tone: 'green' },
  };
  var RX = [['clap', '👏'], ['heart', '❤️'], ['fire', '🔥'], ['party', '🎉']];
  var K = [
    { id: 1, from: 'Zainab Raza', to: 'Bilal Khan', b: 'Customer Hero', m: 'Closed the Packages Ltd renewal two weeks early. Brilliant work, and the client called to say thank you!', at: '2 h ago', rx: { clap: 12, heart: 8, fire: 5, party: 3 }, mine: { heart: 1 } },
    { id: 2, from: 'Bilal Khan', to: 'Imran Siddiqui', b: 'Go-Getter', m: 'Booked 41 outlets in Model Town in a single day during the Shan promo. A new record for the route!', at: 'Yesterday', rx: { clap: 9, heart: 2, fire: 7, party: 1 }, mine: {} },
    { id: 3, from: 'Hira Ali', to: 'Usman Ali', b: 'Team Player', m: 'Stayed back to match 300+ GRNs for the September close. Finance owes you chai for a month.', at: '2 days ago', rx: { clap: 15, heart: 6, fire: 0, party: 4 }, mine: {} },
    { id: 4, from: 'Ayesha Noor', to: 'Mehwish Tariq', b: 'Problem Solver', m: 'Fixed the ZKTeco sync for Faisalabad in 20 minutes when payroll cut-off was looming. Lifesaver.', at: '3 days ago', rx: { clap: 11, heart: 9, fire: 2, party: 0 }, mine: { clap: 1 } },
    { id: 5, from: 'Faisal Qureshi', to: 'Ali Haider', b: 'Mentor', m: 'Trained both new delivery riders on proof-of-delivery in the mobile app. Zero failed PODs this week.', at: '5 days ago', rx: { clap: 7, heart: 3, fire: 1, party: 2 }, mine: {} },
  ];
  var Q = [
    { q: 'How manageable was your workload this week?', lo: 'Overwhelming', hi: 'Very manageable' },
    { q: 'Did you get the support you needed from your manager?', lo: 'Not at all', hi: 'Fully' },
    { q: 'How likely are you to recommend Al-Noor as a place to work?', lo: 'Unlikely', hi: 'Very likely' },
  ];
  var FACES = ['😫', '😕', '😐', '🙂', '😄'];
  var POLL = { q: 'Venue for the annual dinner (12 Dec)?', opts: [['Pearl Continental', 42], ['Nishat Hotel', 33], ['Royal Palm Golf Club', 25]], total: 148, voted: -1 };
  var filter = 'all', nextId = 10, pulse = { i: 0, a: [] }, secRef;

  function card(k, i, drop) {
    var B = BADGES[k.b];
    return '<article class="es-kd-card t-' + B.tone + (drop ? ' es-kd-drop' : ' es-in') + '" style="--i:' + (i || 0) + '" data-id="' + k.id + '">' +
      '<div class="es-kd-badge"><span class="es-kd-medal"><i data-lucide="' + B.ic + '"></i></span><b>' + k.b + '</b><span class="spacer"></span><small>' + k.at + '</small></div>' +
      '<div class="es-kd-who">' + ES.av(k.from, 'sm') + '<i data-lucide="arrow-right" class="es-kd-arr"></i>' + ES.av(k.to, 'sm') + '<div><b>' + (k.to === 'Bilal Khan' ? 'You' : k.to) + '</b><small>from ' + (k.from === 'Bilal Khan' ? 'you' : k.from) + '</small></div></div>' +
      '<p>' + ES.esc(k.m) + '</p>' +
      '<div class="es-kd-rx">' + RX.map(function (r) { var n = k.rx[r[0]] || 0, on = k.mine[r[0]]; return '<button type="button" class="' + (on ? 'on' : '') + '" data-act="rx" data-r="' + r[0] + '" aria-pressed="' + !!on + '"><span>' + r[1] + '</span><b>' + n + '</b></button>'; }).join('') +
      '<span class="spacer"></span><button type="button" class="es-kd-cm" data-act="cm" aria-label="Comment"><i data-lucide="message-circle"></i></button></div></article>';
  }
  function list() {
    return K.filter(function (k) { return filter === 'all' || (filter === 'me' ? k.to === 'Bilal Khan' : filter === 'by' ? k.from === 'Bilal Khan' : k.b === filter); });
  }
  function renderWall() {
    var w = $('#es-kd-wall', secRef), xs = list();
    w.innerHTML = xs.length ? xs.map(function (k, i) { return card(k, i); }).join('') : '<div class="es-empty es-span"><span class="icon-tile lime"><i data-lucide="sparkles"></i></span><b>No kudos here yet</b><span>Be the first to recognise someone.</span></div>';
    FS.icons(w);
  }

  function pulseHtml() {
    if (pulse.i >= Q.length) {
      return '<div class="es-kd-thanks"><span class="es-kd-thx-ic"><i data-lucide="check"></i></span><b>Thanks, Bilal!</b><small>Your answers are anonymous. 78% of Sales have responded this week.</small>' +
        '<div class="es-kd-mood">' + [['Workload', 3.6], ['Manager support', 4.3], ['eNPS', 4.0]].map(function (m, i) { return '<div><span>' + m[0] + '</span><div class="es-kd-mbar"><i style="--w:' + (m[1] / 5 * 100) + '%;--i:' + i + '"></i></div><b>' + m[1].toFixed(1) + '</b></div>'; }).join('') + '</div></div>';
    }
    var q = Q[pulse.i];
    return '<div class="es-kd-q es-kd-qin"><div class="es-kd-dots">' + Q.map(function (x, i) { return '<i class="' + (i < pulse.i ? 'done' : i === pulse.i ? 'now' : '') + '"></i>'; }).join('') + '<span>' + (pulse.i + 1) + ' of ' + Q.length + '</span></div>' +
      '<b>' + q.q + '</b><div class="es-kd-faces" role="radiogroup">' + FACES.map(function (f, i) { return '<button type="button" data-act="face" data-v="' + (i + 1) + '" aria-label="' + (i + 1) + ' of 5" style="--i:' + i + '">' + f + '</button>'; }).join('') + '</div>' +
      '<div class="es-kd-scale"><span>' + q.lo + '</span><span>' + q.hi + '</span></div></div>';
  }
  function pollHtml() {
    var voted = POLL.voted > -1;
    return '<b class="es-kd-pq">' + POLL.q + '</b><div class="es-kd-opts' + (voted ? ' voted' : '') + '">' + POLL.opts.map(function (o, i) {
      var pct = Math.round(o[1] / POLL.opts.reduce(function (s, x) { return s + x[1]; }, 0) * 100);
      return '<button type="button" data-act="vote" data-i="' + i + '" class="' + (POLL.voted === i ? 'mine' : '') + '" ' + (voted ? 'disabled' : '') + '><i class="es-kd-fill" style="--w:' + (voted ? pct : 0) + '%"></i><span class="es-kd-ol">' + (POLL.voted === i ? '<i data-lucide="circle-check"></i>' : '<i data-lucide="circle"></i>') + o[0] + '</span><b>' + (voted ? pct + '%' : '') + '</b></button>';
    }).join('') + '</div><div class="es-kd-pfoot"><span><b id="es-kd-votes">' + POLL.total + '</b> votes</span><span>Closes Fri, 09 Oct</span></div>';
  }

  ES.route('ess/kudos', {
    render: function () {
      return '<div class="es-grid es-main">' +
        '<div class="es-col">' +
          '<div class="es-card es-kd-give" id="es-kd-give"><div class="es-head"><span class="icon-tile lime"><i data-lucide="heart-handshake"></i></span><div><h3>Give kudos</h3><p>Say thanks in public. It takes 20 seconds and makes someone’s week.</p></div></div>' +
          '<div class="es-kd-form"><label class="es-field es-kd-to"><span>To</span><input id="es-kd-to" placeholder="Search a colleague… e.g. Hira"></label>' +
          '<div class="es-field"><span>Badge</span><div class="es-kd-bpick" id="es-kd-bpick">' + Object.keys(BADGES).map(function (b, i) { return '<button type="button" class="es-kd-bp t-' + BADGES[b].tone + (i === 0 ? ' on' : '') + '" data-act="badge" data-b="' + b + '"><i data-lucide="' + BADGES[b].ic + '"></i>' + b + '</button>'; }).join('') + '</div></div>' +
          '<label class="es-field es-kd-msg"><span>Message <small class="es-label" id="es-kd-cnt">0/280</small></span><textarea id="es-kd-m" rows="3" maxlength="280" placeholder="What did they do, and why did it matter?"></textarea></label>' +
          '<div class="es-row wrap es-kd-send"><label class="switch"><input type="checkbox" checked id="es-kd-share"><i></i><span>Share on company wall</span></label><span class="spacer"></span><span class="es-label">+20 points to them</span><button class="btn primary" type="button" data-act="send"><i data-lucide="send"></i>Send kudos</button></div></div></div>' +
          '<div class="es-head es-kd-wh"><h3>Recognition wall</h3><span class="spacer"></span><div class="chips es-kd-chips">' +
          [['all', 'Everyone'], ['me', 'For me'], ['by', 'By me']].concat(Object.keys(BADGES).map(function (b) { return [b, b]; })).map(function (c, i) { return '<button type="button" class="' + (i ? '' : 'active') + '" data-kf="' + c[0] + '">' + c[1] + '</button>'; }).join('') + '</div></div>' +
          '<div class="es-kd-wall" id="es-kd-wall"></div>' +
        '</div>' +
        '<div class="es-col">' +
          '<div class="es-card es-kd-me"><div class="es-head"><h3>Your recognition</h3><span class="spacer"></span><span class="pill"><i data-lucide="calendar"></i>2026</span></div>' +
          '<div class="es-stats"><div class="es-stat"><span>Received</span><b>14</b></div><div class="es-stat"><span>Given</span><b id="es-kd-given">9</b></div><div class="es-stat"><span>Points</span><b id="es-kd-pts">1,240</b></div></div>' +
          '<div class="es-kd-earned">' + [['Customer Hero', 6], ['Team Player', 4], ['Go-Getter', 3], ['Mentor', 1], ['Problem Solver', 0]].map(function (e) { var B = BADGES[e[0]]; return '<span class="es-kd-eb t-' + B.tone + (e[1] ? '' : ' off') + '" data-tip="' + e[0] + ' × ' + e[1] + '"><i data-lucide="' + B.ic + '"></i>' + (e[1] ? '<em>' + e[1] + '</em>' : '') + '</span>'; }).join('') + '</div></div>' +
          '<div class="es-card es-kd-pulse"><div class="es-head"><h3>Weekly pulse</h3><span class="spacer"></span><span class="badge info">Anonymous</span></div><div id="es-kd-pulse">' + pulseHtml() + '</div></div>' +
          '<div class="es-card"><div class="es-head"><h3>Poll</h3><span class="spacer"></span><span class="pill"><i data-lucide="vote"></i>Admin · Ahmed Raza</span></div><div id="es-kd-poll">' + pollHtml() + '</div></div>' +
        '</div></div>';
    },
    bind: function (sec) {
      secRef = sec;
      renderWall();
      var badge = 'Customer Hero', to = null;
      var toIn = $('#es-kd-to', sec);
      ES.autocomplete(toIn, ES.PEOPLE.filter(function (p) { return p.name !== 'Bilal Khan'; }).map(function (p) { return { name: p.name, sub: p.role + ' · ' + p.dept + ' · ' + p.branch }; }), function (p) { to = p.name; toIn.closest('.es-kd-to').classList.add('picked'); $('#es-kd-m', sec).focus(); });
      toIn.addEventListener('input', function () { to = null; toIn.closest('.es-kd-to').classList.remove('picked'); });
      $('#es-kd-m', sec).addEventListener('input', function (e) { var n = e.target.value.length, c = $('#es-kd-cnt', sec); c.textContent = n + '/280'; c.classList.toggle('es-down', n > 260); });
      sec.addEventListener('click', function (e) { var c = e.target.closest('[data-kf]'); if (c) { filter = c.dataset.kf; renderWall(); } });
      ES.acts(sec, {
        give: function () {ES.scrollTo($('#es-kd-give', sec)); setTimeout(function () { toIn.focus(); }, 350); },
        badge: function (b) { badge = b.dataset.b; $$('.es-kd-bp', sec).forEach(function (x) { x.classList.toggle('on', x === b); }); b.classList.remove('es-bump'); void b.offsetWidth; b.classList.add('es-bump'); },
        send: function (b) {
          var m = $('#es-kd-m', sec);
          if (!to) { toIn.classList.remove('es-hd-shake'); void toIn.offsetWidth; toIn.classList.add('es-hd-shake'); toIn.focus(); FS.toast('Pick a colleague from the list', { tone: 'warn' }); return; }
          if (m.value.trim().length < 8) { m.classList.remove('es-hd-shake'); void m.offsetWidth; m.classList.add('es-hd-shake'); m.focus(); FS.toast('Add a short message (why it mattered)', { tone: 'warn' }); return; }
          ES.busy(b, 800, 'Sending…').then(function () {
            var k = { id: nextId++, from: 'Bilal Khan', to: to, b: badge, m: m.value.trim(), at: 'Just now', rx: {}, mine: {} };
            K.unshift(k);
            if (filter !== 'all' && filter !== 'by' && filter !== badge) { filter = 'all'; $$('[data-kf]', sec).forEach(function (x) { x.classList.toggle('active', x.dataset.kf === 'all'); }); renderWall(); }
            else {
              var w = $('#es-kd-wall', sec); var em = $('.es-empty', w); if (em) em.remove();
              w.insertAdjacentHTML('afterbegin', card(k, 0, true)); FS.icons(w.firstElementChild);
            }
            var nc = $('#es-kd-wall .es-kd-card', sec);
            ES.scrollTo(nc);
            setTimeout(function () { ES.celebrate(nc); }, 380);
            var g = $('#es-kd-given', sec); ES.tick(g, (+(g.dataset.val || g.textContent.replace(/,/g, '')) || 9) + 1, { dec: 0 });
            var pts = $('#es-kd-pts', sec); ES.tick(pts, (+(pts.dataset.val || pts.textContent.replace(/,/g, '')) || 1240) + 5, { dec: 0 });
            FS.toast(to + ' got your ' + badge + ' kudos', { tone: 'good' });
            m.value = ''; toIn.value = ''; to = null; toIn.closest('.es-kd-to').classList.remove('picked'); $('#es-kd-cnt', sec).textContent = '0/280';
          });
        },
        rx: function (b) {
          var k = K.find(function (x) { return x.id === +b.closest('[data-id]').dataset.id; }), r = b.dataset.r;
          var on = !k.mine[r]; k.mine[r] = on ? 1 : 0; k.rx[r] = (k.rx[r] || 0) + (on ? 1 : -1);
          b.classList.toggle('on', on); b.setAttribute('aria-pressed', on);
          b.querySelector('b').textContent = k.rx[r];
          b.classList.remove('es-kd-pop'); void b.offsetWidth; if (on) b.classList.add('es-kd-pop');
          if (on) { var f = document.createElement('span'); f.className = 'es-kd-float'; f.textContent = b.querySelector('span').textContent; b.appendChild(f); setTimeout(function () { f.remove(); }, 900); }
        },
        cm: function (b) { FS.toast('Comments open in the Finsoft mobile app', { tone: 'info' }); },
        face: function (b) {
          var v = +b.dataset.v; pulse.a.push(v);
          var wrap = b.closest('.es-kd-faces'); $$('button', wrap).forEach(function (x) { x.classList.toggle('pick', x === b); x.classList.toggle('dim', x !== b); });
          setTimeout(function () {
            pulse.i++;
            var host = $('#es-kd-pulse', sec);
            host.firstElementChild.classList.add('es-kd-qout');
            setTimeout(function () { host.innerHTML = pulseHtml(); FS.icons(host); if (pulse.i >= Q.length) { ES.celebrate(host.querySelector('.es-kd-thx-ic')); } }, 260);
          }, 420);
        },
        vote: function (b) {
          if (POLL.voted > -1) return;
          var i = +b.dataset.i; POLL.voted = i; POLL.opts[i][1] += 1; POLL.total += 1;
          var host = $('#es-kd-poll', sec);
          host.innerHTML = pollHtml(); FS.icons(host);
          var fills = $$('.es-kd-fill', host);
          fills.forEach(function (f) { var w = f.style.getPropertyValue('--w'); f.style.setProperty('--w', '0%'); void f.offsetWidth; requestAnimationFrame(function () { f.style.setProperty('--w', w); }); });
          var v = $('#es-kd-votes', host); v.textContent = POLL.total - 1; ES.tick(v, POLL.total, { dec: 0 });
          FS.toast('Vote recorded · ' + POLL.opts[i][0], { tone: 'good' });
        },
      });
    },
  });
})();

/* ---------- 14-shifts.js ---------- */
/* ess/shifts: weekly roster (me + team), swap request wizard, team swap approvals, open shifts */
(function () {
  var $ = ES.$, $$ = ES.$$;
  var SH = {
    G: { n: 'General', t: '09:00 – 18:00', s: '09–18', h: 9, c: 'g' },
    M: { n: 'Morning field', t: '07:00 – 15:00', s: '07–15', h: 8, c: 'm' },
    E: { n: 'Evening dispatch', t: '13:00 – 21:00', s: '13–21', h: 8, c: 'e' },
    A: { n: 'Activation', t: '10:00 – 16:00', s: '10–16', h: 6, c: 'x' },
    C: { n: 'Stock count', t: '08:00 – 14:00', s: '08–14', h: 6, c: 'x' },
    O: { n: 'Off', t: 'Rest day', s: '', h: 0, c: 'o' },
    L: { n: 'Leave', t: 'Casual leave', s: '', h: 0, c: 'l' },
    H: { n: 'Holiday', t: 'Public holiday', s: '', h: 0, c: 'h' },
  };
  var ME = ES.ME;
  var CREW = [
    { id: ME.id, name: ME.name, role: 'Sales Executive', pat: 'GGGGGOO', me: true },
    { id: 'EMP-0061', name: 'Imran Siddiqui', role: 'Order Booker', pat: 'MMMMMMO' },
    { id: 'EMP-0064', name: 'Nadeem Akhtar', role: 'Order Booker', pat: 'MMMMOMO' },
    { id: 'EMP-0067', name: 'Tanveer Hassan', role: 'Field Sales Officer', pat: 'GGGGGOO' },
    { id: 'EMP-0072', name: 'Salman Butt', role: 'Delivery Rider', pat: 'EEEOEEE' },
  ];
  var PEERS = CREW.slice(1).concat([{ id: 'EMP-0039', name: 'Hamza Butt', role: 'Key Account Manager', pat: 'GGGGGMO' }, { id: 'EMP-0015', name: 'Umar Farooq', role: 'Regional Sales Lead', pat: 'GGGGGOO' }]);
  var WEEK0 = new Date(2026, 8, 28); /* Mon 28 Sep 2026 */
  var TODAY = ES.iso(ES.TODAY);
  var week = 0, onlyMe = false;
  var OVR = { 'EMP-0067|2026-10-05': 'L', 'EMP-0067|2026-10-06': 'L' };
  var PEND = {}; /* key -> 'swap' | 'pick' */
  var SWAPS = [
    { id: 'SW-2026-014', who: 'Hamza Butt', mine: 'Mon 21 Sep · General 09–18', theirs: 'Morning field 07–15', reason: 'Client visit · Engro Foods', at: 4, state: 'ok', when: '18 Sep' },
  ];
  var TEAMSWAP = { id: 'SW-2026-019', a: 'Imran Siddiqui', b: 'Salman Butt', date: '2026-10-03', reason: 'Imran: brother’s walima in Kasur', done: false };
  var OPEN = [
    { id: 'OS-31', d: '2026-10-03', code: 'A', title: 'Market activation · Al-Fatah Gulberg', perk: '+Rs 2,500 allowance', slots: 2 },
    { id: 'OS-32', d: '2026-10-04', code: 'C', title: 'Quarterly stock count · Metro Thokar', perk: 'OT 1.5× · lunch provided', slots: 1 },
    { id: 'OS-33', d: '2026-10-07', code: 'E', title: 'Evening dispatch support · Lahore HQ', perk: '+Rs 1,800 allowance', slots: 3 },
  ];

  function dayOf(off, i) { var d = new Date(WEEK0); d.setDate(d.getDate() + off * 7 + i); return d; }
  function code(p, d) {
    var k = p.id + '|' + ES.iso(d);
    if (OVR[k]) return OVR[k];
    if (ES.isHoliday(d)) return 'H';
    return p.pat[(d.getDay() + 6) % 7];
  }
  function weekNo(off) { return 40 + off; }

  /* ---------------- roster grid ---------------- */
  function cell(p, d, idx) {
    var c = code(p, d), s = SH[c], iso = ES.iso(d), k = p.id + '|' + iso, pend = PEND[k];
    var past = iso < TODAY, today = iso === TODAY;
    var cls = 'es-sh-cell es-sh-' + s.c + (p.me ? ' mine' : '') + (past ? ' past' : '') + (today ? ' today' : '') + (pend ? ' pend' : '');
    var tip = p.name + ' · ' + ES.dfmt(d, true) + ' · ' + s.n + (s.h ? ' ' + s.t : '') + (pend ? ' · ' + (pend === 'pick' ? 'pick-up pending' : 'swap pending') : '');
    var inner = s.h ? '<b>' + s.n + '</b><small>' + s.s + '</small>' : '<b>' + s.n + '</b>';
    if (pend) inner += '<em class="es-sh-pend"><i data-lucide="clock-3"></i>' + (pend === 'pick' ? 'Pick-up' : 'Swap') + '</em>';
    if (past && p.me && s.h) inner += '<em class="es-sh-done"><i data-lucide="check"></i></em>';
    var act = p.me && !past && s.h ? ' data-act="cell" data-d="' + iso + '"' : '';
    return '<button type="button" class="' + cls + '" style="--i:' + idx + '" data-tip="' + ES.esc(tip) + '"' + act + (act ? '' : ' tabindex="-1"') + '>' + inner + '</button>';
  }
  function renderGrid(sec) {
    var host = $('#es-sh-grid', sec), days = [0, 1, 2, 3, 4, 5, 6].map(function (i) { return dayOf(week, i); });
    var rows = onlyMe ? CREW.slice(0, 1) : CREW;
    var h = '<div class="es-sh-corner"><span class="es-cap">Team</span><b>' + rows.length + ' people</b></div>';
    days.forEach(function (d) {
      var t = ES.iso(d) === TODAY;
      h += '<div class="es-sh-day' + (t ? ' today' : '') + (ES.isWeekend(d) ? ' wk' : '') + '"><span>' + ES.DOW[d.getDay()] + '</span><b>' + ES.pad(d.getDate()) + '</b>' + (t ? '<em>Today</em>' : '') + '</div>';
    });
    var idx = 0;
    rows.forEach(function (p) {
      var hrs = days.reduce(function (a, d) { return a + SH[code(p, d)].h; }, 0);
      h += '<div class="es-sh-who' + (p.me ? ' mine' : '') + '">' + ES.av(p.name, 'sm') + '<div><b>' + (p.me ? 'You' : p.name) + (p.me ? '<span class="es-sh-you">' + p.name + '</span>' : '') + '</b><small>' + p.role + ' · ' + hrs + 'h</small></div></div>';
      days.forEach(function (d) { h += cell(p, d, idx++); });
    });
    h += '<div class="es-sh-foot"><span class="es-cap">Coverage</span></div>';
    days.forEach(function (d) {
      var on = CREW.filter(function (p) { return SH[code(p, d)].h; }).length;
      h += '<div class="es-sh-cov"><i style="--w:' + (on / CREW.length * 100) + '%" class="' + (on < 3 ? 'low' : '') + '"></i><span>' + on + '/' + CREW.length + ' on</span></div>';
    });
    host.innerHTML = h;
    host.style.setProperty('--rows', rows.length);
    FS.icons(host);
    var a = days[0], b = days[6];
    $('#es-sh-wk', sec).innerHTML = '<b>Week ' + weekNo(week) + '</b><span>' + ES.dshort(a) + ' – ' + ES.dshort(b) + ' ' + b.getFullYear() + '</span>';
    $('[data-act="today"]', sec).disabled = week === 0;
    $('[data-act="prev"]', sec).disabled = week <= -1;
    $('[data-act="next"]', sec).disabled = week >= 3;
    myWeek(sec);
  }
  function myWeek(sec) {
    var days = [0, 1, 2, 3, 4, 5, 6].map(function (i) { return dayOf(0, i); });
    var sched = 0, done = 0;
    days.forEach(function (d) { var hh = SH[code(CREW[0], d)].h; sched += hh; if (ES.iso(d) < TODAY) done += hh; });
    var ring = $('#es-sh-ring', sec);
    if (ring) { ES.setRing(ring, done / Math.max(1, sched) * 100); ES.tick($('#es-sh-sched', sec), sched, { dec: 0, suffix: 'h' }); $('.es-ring-in', ring).firstChild.nodeValue = done + 'h'; }
  }

  /* ---------------- swaps list ---------------- */
  function renderSwaps(sec) {
    var host = $('#es-sh-swaps', sec), h = '';
    if (!TEAMSWAP.done) {
      h += '<div class="es-sh-sw team es-in" id="es-sh-teamswap"><div class="es-sh-sw-top"><span class="es-sh-pair">' + ES.av(TEAMSWAP.a, 'sm') + '<i data-lucide="arrow-left-right"></i>' + ES.av(TEAMSWAP.b, 'sm') + '</span><div><b>' + TEAMSWAP.a.split(' ')[0] + ' ⇄ ' + TEAMSWAP.b.split(' ')[0] + ' · Sat 03 Oct</b><small>Morning field 07–15 ⇄ Evening dispatch 13–21 · ' + TEAMSWAP.reason + '</small></div><span class="badge warn dot">Needs you</span></div>' +
        '<div class="es-sh-sw-acts"><button class="btn secondary sm" type="button" data-act="tdecline"><i data-lucide="x"></i>Decline</button><button class="btn primary sm" type="button" data-act="tapprove"><i data-lucide="check"></i>Approve swap</button></div></div>';
    }
    SWAPS.forEach(function (s, i) {
      var steps = s.cover ? ['Requested', 'Accepted', 'Manager', 'Approved'] : ['Requested', 'Accepted', 'Manager', 'Approved'];
      var subs = [s.when, s.at > 1 ? s.who.split(' ')[0] : 'Waiting', s.at > 2 ? 'Zainab Raza' : 'Zainab Raza', s.at > 3 ? 'Done' : ''];
      h += '<div class="es-sh-sw es-in' + (s.fresh ? ' fresh' : '') + '" style="--i:' + (i + 1) + '" data-id="' + s.id + '"><div class="es-sh-sw-top"><span class="es-sh-pair">' + ES.av(ME.name, 'sm') + '<i data-lucide="' + (s.cover ? 'arrow-right' : 'arrow-left-right') + '"></i>' + ES.av(s.who, 'sm') + '</span><div><b>' + (s.cover ? 'Cover by ' : 'Swap with ') + s.who + '</b><small>' + s.mine + (s.theirs ? ' ⇄ ' + s.theirs : '') + ' · ' + s.reason + '</small></div>' + ES.badge(s.state === 'cancel' ? 'Withdrawn' : s.at >= 4 ? 'Approved' : 'Pending') + '</div>' +
        ES.tracker(steps, Math.min(s.at, 3), s.state, subs).replace('es-track', 'es-track sm') +
        (s.at < 4 && s.state !== 'cancel' ? '<div class="es-sh-sw-acts"><span class="es-label">' + s.id + '</span><span class="spacer"></span><button class="btn ghost sm" type="button" data-act="withdraw" data-id="' + s.id + '"><i data-lucide="undo-2"></i>Withdraw</button></div>' : '') + '</div>';
    });
    host.innerHTML = h;
    FS.icons(host);
    var n = SWAPS.filter(function (s) { return s.at < 4 && s.state !== 'cancel'; }).length + (TEAMSWAP.done ? 0 : 1);
    $('#es-sh-swapn', sec).textContent = n;
  }

  /* ---------------- open shifts ---------------- */
  function renderOpen(sec) {
    $('#es-sh-open', sec).innerHTML = OPEN.map(function (o, i) {
      var d = ES.parse(o.d), s = SH[o.code];
      return '<div class="es-sh-os es-in' + (o.taken ? ' taken' : '') + '" style="--i:' + i + '"><span class="es-sh-date"><b>' + ES.pad(d.getDate()) + '</b><small>' + ES.DOW[d.getDay()] + '</small></span>' +
        '<div class="es-sh-os-txt"><b>' + o.title + '</b><small>' + s.t + ' · ' + s.h + 'h · ' + o.slots + ' slot' + (o.slots > 1 ? 's' : '') + ' left</small><span class="pill"><i data-lucide="sparkles"></i><b>' + o.perk + '</b></span></div>' +
        (o.taken ? '<span class="badge warn dot">Requested</span>' : '<button class="btn secondary sm" type="button" data-act="pick" data-id="' + o.id + '"><i data-lucide="hand"></i>Pick up</button>') + '</div>';
    }).join('');
    FS.icons($('#es-sh-open', sec));
  }

  /* ---------------- swap wizard ---------------- */
  function upcoming() {
    var out = [];
    for (var i = 0; i < 14; i++) {
      var d = dayOf(0, i), iso = ES.iso(d);
      if (iso < TODAY) continue;
      var c = code(CREW[0], d);
      if (SH[c].h && !PEND[ME.id + '|' + iso]) out.push({ d: d, iso: iso, c: c });
    }
    return out;
  }
  function openSwap(sec, preIso) {
    var st = { step: 0, iso: preIso || null, peer: null, reason: '', mode: 'swap' };
    var ups = upcoming();
    if (!st.iso && ups.length) st.iso = ups[0].iso;
    var el = ES.sheet({
      title: 'Request a shift swap', sub: 'Your manager Zainab Raza approves after your colleague accepts.', cls: 'es-sh-sheet',
      html: '<ol class="es-sh-steps"><li class="on"><b>1</b>Shift</li><li><b>2</b>Colleague</li><li><b>3</b>Reason</li></ol><div class="es-sh-pane" data-pane="0"></div>',
      foot: '<button class="btn secondary" type="button" data-w="back">Cancel</button><span class="spacer"></span><button class="btn primary" type="button" data-w="next">Continue<i data-lucide="arrow-right"></i></button>',
    });
    var pane = el.querySelector('.es-sh-pane'), back = el.querySelector('[data-w="back"]'), next = el.querySelector('[data-w="next"]');
    function peerShift(p) { return code(p, ES.parse(st.iso)); }
    function draw() {
      $$('.es-sh-steps li', el).forEach(function (li, i) { li.classList.toggle('on', i <= st.step); li.classList.toggle('cur', i === st.step); });
      back.innerHTML = st.step ? '<i data-lucide="arrow-left"></i>Back' : 'Cancel';
      next.innerHTML = st.step === 2 ? '<i data-lucide="send"></i>Submit request' : 'Continue<i data-lucide="arrow-right"></i>';
      var h = '';
      if (st.step === 0) {
        h = '<p class="es-label">Which of your shifts do you want to give away?</p><div class="es-sh-pick">' + ups.map(function (u) {
          var s = SH[u.c];
          return '<button type="button" class="es-opt es-sh-opt' + (u.iso === st.iso ? ' on' : '') + '" data-iso="' + u.iso + '"><span class="es-sh-date"><b>' + ES.pad(u.d.getDate()) + '</b><small>' + ES.DOW[u.d.getDay()] + '</small></span><span><b>' + s.n + '</b><small>' + s.t + (u.iso === TODAY ? ' · today' : '') + '</small></span></button>';
        }).join('') + '</div>';
      } else if (st.step === 1) {
        var d = ES.parse(st.iso), mine = SH[code(CREW[0], d)];
        h = '<div class="es-sh-sum"><span class="es-sh-date"><b>' + ES.pad(d.getDate()) + '</b><small>' + ES.DOW[d.getDay()] + '</small></span><div><b>' + mine.n + ' · ' + mine.t + '</b><small>Pick a colleague. People off that day can cover; others swap.</small></div></div>' +
          '<label class="search-field es-sh-find" data-plain-search><i data-lucide="search"></i><input placeholder="Search colleagues…" data-w="find"></label><div class="es-sh-peers">' + PEERS.map(function (p) {
            var c = peerShift(p), s = SH[c], same = c === code(CREW[0], d), off = !s.h, onL = c === 'L';
            var tag = onL ? '<span class="badge neutral">On leave</span>' : same ? '<span class="badge neutral">Same shift</span>' : off ? '<span class="badge info">Off · can cover</span>' : '<span class="badge violet">' + s.n + ' ' + s.s + '</span>';
            return '<button type="button" class="es-sh-peer' + (st.peer === p.name ? ' on' : '') + '" data-peer="' + p.name + '"' + (same || onL ? ' disabled' : '') + '>' + ES.av(p.name, 'sm') + '<span><b>' + p.name + '</b><small>' + p.role + '</small></span>' + tag + '<i class="es-sh-radio"></i></button>';
          }).join('') + '</div>';
      } else {
        var dd = ES.parse(st.iso), mm = SH[code(CREW[0], dd)], pp = PEERS.find(function (x) { return x.name === st.peer; }), ps = SH[peerShift(pp)];
        st.mode = ps.h ? 'swap' : 'cover';
        h = '<div class="es-sh-deal"><div>' + ES.av(ME.name, 'lg') + '<b>You</b><small>' + mm.n + '<br>' + mm.t + '</small></div><span class="es-sh-deal-ic"><i data-lucide="' + (st.mode === 'swap' ? 'arrow-left-right' : 'arrow-right') + '"></i><small>' + ES.dfmt(dd, true) + '</small></span><div>' + ES.av(pp.name, 'lg') + '<b>' + pp.name.split(' ')[0] + '</b><small>' + (ps.h ? ps.n + '<br>' + ps.t : 'Off → covers<br>your shift') + '</small></div></div>' +
          '<p class="es-label" style="margin:14px 0 8px">Reason</p><div class="es-opts">' + ['Family event', 'Medical appointment', 'Client visit', 'Training', 'Personal'].map(function (r) { return '<button type="button" class="es-opt' + (st.reason === r ? ' on' : '') + '" data-reason="' + r + '">' + r + '</button>'; }).join('') + '</div>' +
          '<label class="es-field" style="margin-top:14px"><span>Note for ' + pp.name.split(' ')[0] + ' (optional)</span><textarea rows="3" data-w="note" placeholder="e.g. I’ll cover your Saturday next week in return."></textarea></label>' +
          '<div class="banner info es-sh-rule"><i data-lucide="info"></i><div><b>Swap policy</b><p>48 hours’ notice, same grade or below, max 2 swaps a month. You have <b>1 of 2</b> left in October.</p></div></div>';
      }
      pane.innerHTML = h; pane.classList.remove('es-in'); void pane.offsetWidth; pane.classList.add('es-in');
      FS.icons(el);
      var f = pane.querySelector('[data-w="find"]');
      if (f) f.addEventListener('input', function () { var q = f.value.toLowerCase(); $$('.es-sh-peer', pane).forEach(function (b) { b.style.display = b.dataset.peer.toLowerCase().indexOf(q) > -1 ? '' : 'none'; }); });
      valid();
    }
    function valid() { next.disabled = (st.step === 0 && !st.iso) || (st.step === 1 && !st.peer) || (st.step === 2 && !st.reason); }
    el.addEventListener('click', function (e) {
      var o = e.target.closest('[data-iso]'); if (o) { st.iso = o.dataset.iso; st.peer = null; $$('[data-iso]', el).forEach(function (b) { b.classList.toggle('on', b === o); }); valid(); return; }
      var p = e.target.closest('[data-peer]'); if (p && !p.disabled) { st.peer = p.dataset.peer; $$('[data-peer]', el).forEach(function (b) { b.classList.toggle('on', b === p); }); valid(); return; }
      var r = e.target.closest('[data-reason]'); if (r) { st.reason = r.dataset.reason; $$('[data-reason]', el).forEach(function (b) { b.classList.toggle('on', b === r); }); valid(); return; }
      if (e.target.closest('[data-w="back"]')) { if (st.step) { st.step--; draw(); } else ES.closeSheet(el); return; }
      if (e.target.closest('[data-w="next"]')) {
        if (st.step < 2) { st.step++; draw(); return; }
        var dd = ES.parse(st.iso), mm = SH[code(CREW[0], dd)], pp = PEERS.find(function (x) { return x.name === st.peer; }), ps = SH[peerShift(pp)];
        ES.busy(next, 900, 'Sending…').then(function () {
          var id = 'SW-2026-0' + (20 + SWAPS.length);
          SWAPS.unshift({ id: id, who: pp.name, mine: ES.DOW[dd.getDay()] + ' ' + ES.dshort(dd) + ' · ' + mm.n + ' ' + mm.s, theirs: ps.h ? ps.n + ' ' + ps.s : '', cover: !ps.h, reason: st.reason, at: 1, state: 'ok', when: 'Just now', fresh: true });
          PEND[ME.id + '|' + st.iso] = 'swap'; PEND[pp.id + '|' + st.iso] = 'swap';
          ES.closeSheet(el);
          var ws = Math.floor((dd - WEEK0) / 864e5 / 7); if (ws !== week) week = ws;
          renderGrid(sec); renderSwaps(sec);
          var card = $('[data-id="' + id + '"]', sec); if (card) {ES.scrollTo(card); ES.celebrate(card); }
          FS.toast('Swap request sent to ' + pp.name.split(' ')[0] + ' · ' + id, { tone: 'good', action: { label: 'View', fn: function () { if (card) ES.scrollTo(card); } } });
        });
      }
    });
    draw();
  }

  ES.route('ess/shifts', {
    render: function () {
      var t = SH.G;
      return '<div class="es-grid es-g3 es-sh-top">' +
        '<div class="es-card night es-sh-now"><div class="es-head"><span class="es-sh-live"><i></i>On shift</span><span class="spacer"></span><span class="es-sh-loc"><i data-lucide="map-pin"></i>Lahore HQ · Gulberg III</span></div>' +
          '<div><span class="es-sh-cap">Today · Thu 01 Oct</span><b class="es-sh-title">' + t.n + ' shift</b><span class="es-sh-time">' + t.t + '</span></div>' +
          '<div class="es-sh-tl"><div class="on"><span>Check-in</span><b id="es-sh-in">Pending</b></div><div><span>Market visit</span><b>11:00</b></div><div><span>Break</span><b>13:00 – 14:00</b></div><div><span>Check-out</span><b>18:00</b></div></div>' +
          '<div class="es-sh-bar"><i id="es-sh-prog"></i></div><div class="es-row"><span class="es-sh-cap" id="es-sh-left">8h 56m left</span><span class="spacer"></span><span class="es-sh-cap">Next · Fri 02 Oct, 09:00</span></div></div>' +
        '<div class="es-card es-sh-hrs"><div class="es-head"><h3>My week</h3><span class="spacer"></span><span class="pill"><i data-lucide="clock"></i>Scheduled <b id="es-sh-sched">45h</b></span></div>' +
          '<div class="es-row es-sh-ringrow">' + ES.ring(60, { size: 104, stroke: 3.4, label: '27h', sub: 'worked', cls: 'es-sh-ring' }).replace('class="es-ring', 'id="es-sh-ring" class="es-ring') +
          '<div class="es-sh-mini"><div><span>Overtime</span><b>1h 40m</b></div><div><span>Rest days</span><b>Sat, Sun</b></div><div><span>Swaps left</span><b>1 of 2</b></div></div></div></div>' +
        '<div class="es-card es-sh-swapcard"><div class="es-head"><h3>Swap requests</h3><span class="es-count" id="es-sh-swapn">2</span><span class="spacer"></span><button class="es-link" type="button" data-act="swap">New<i data-lucide="plus"></i></button></div><div id="es-sh-swaps" class="es-sh-swaps"></div></div>' +
        '</div>' +
        '<div class="es-card flush es-sh-roster"><div class="es-head"><h3>Weekly roster</h3><div class="es-sh-nav"><button class="icon-btn-sm" type="button" data-act="prev" aria-label="Previous week"><i data-lucide="chevron-left"></i></button><span id="es-sh-wk"></span><button class="icon-btn-sm" type="button" data-act="next" aria-label="Next week"><i data-lucide="chevron-right"></i></button><button class="btn ghost sm" type="button" data-act="today">Today</button></div><span class="spacer"></span>' +
          '<div class="seg es-sh-seg"><button type="button" class="active" data-act="team"><i data-lucide="users"></i>My team</button><button type="button" data-act="me"><i data-lucide="user"></i>Only me</button></div></div>' +
          '<div class="es-sh-legend">' + [['g', 'General 09–18'], ['m', 'Morning field 07–15'], ['e', 'Evening dispatch 13–21'], ['x', 'Open shift'], ['l', 'Leave'], ['o', 'Off']].map(function (l) { return '<span><i class="es-sh-' + l[0] + '"></i>' + l[1] + '</span>'; }).join('') + '<span class="es-sh-tipline"><i data-lucide="mouse-pointer-click"></i>Tap your upcoming shift to swap it</span></div>' +
          '<div class="es-scroll-x"><div class="es-sh-grid" id="es-sh-grid"></div></div></div>' +
        '<div class="es-grid es-wide" style="margin-top:16px">' +
          '<div class="es-card"><div class="es-head"><h3>Open shifts</h3><span class="es-count">' + OPEN.length + '</span><span class="spacer"></span><span class="es-label">First come, first served · manager confirms</span></div><div id="es-sh-open" class="es-sh-openlist"></div></div>' +
          '<div class="es-card"><div class="es-head"><h3>Shift rules</h3><span class="spacer"></span><span class="pill"><i data-lucide="shield-check"></i>Policy HR-ATT-04</span></div><ul class="es-sh-rules">' +
            '<li><i data-lucide="clock-alert"></i><div><b>Grace period 10 minutes</b><small>3 late marks in a month deduct half a casual leave.</small></div></li>' +
            '<li><i data-lucide="arrow-left-right"></i><div><b>Swaps need 48 hours’ notice</b><small>Colleague accepts first, then Zainab Raza approves.</small></div></li>' +
            '<li><i data-lucide="moon-star"></i><div><b>11 hours rest between shifts</b><small>Evening → morning back-to-back is blocked automatically.</small></div></li>' +
            '<li><i data-lucide="coins"></i><div><b>Open shifts pay extra</b><small>Weekend activations Rs 2,500, stock counts at 1.5× overtime.</small></div></li></ul></div>' +
        '</div>';
    },
    bind: function (sec) {
      renderGrid(sec); renderSwaps(sec); renderOpen(sec);
      ES.acts(sec, {
        swap: function () { openSwap(sec); },
        cell: function (b) { openSwap(sec, b.dataset.d); },
        prev: function () { if (week > -1) { week--; renderGrid(sec); } },
        next: function () { if (week < 3) { week++; renderGrid(sec); } },
        today: function () { week = 0; renderGrid(sec); },
        team: function () { onlyMe = false; renderGrid(sec); },
        me: function () { onlyMe = true; renderGrid(sec); },
        export: function (b) { ES.busy(b, 800, 'Exporting…').then(function () { FS.toast('Roster added to your calendar (.ics) · 10 shifts', { tone: 'good' }); }); },
        withdraw: function (b) {
          var s = SWAPS.find(function (x) { return x.id === b.dataset.id; });
          ES.confirm({ title: 'Withdraw swap request?', text: s.id + ' with ' + s.who + ' will be cancelled and your shift stays as rostered.', okLabel: 'Withdraw', danger: true }).then(function (ok) {
            if (!ok) return;
            s.state = 'cancel'; Object.keys(PEND).forEach(function (k) { if (PEND[k] === 'swap') delete PEND[k]; });
            renderSwaps(sec); renderGrid(sec); FS.toast('Swap request withdrawn', { tone: 'info' });
          });
        },
        tapprove: function (b) {
          ES.busy(b, 700, 'Approving…').then(function () {
            var a = PEERS.find(function (p) { return p.name === TEAMSWAP.a; }), c = PEERS.find(function (p) { return p.name === TEAMSWAP.b; }), d = ES.parse(TEAMSWAP.date);
            var ca = code(a, d), cc = code(c, d);
            OVR[a.id + '|' + TEAMSWAP.date] = cc; OVR[c.id + '|' + TEAMSWAP.date] = ca;
            ES.celebrate(b);
            var card = $('#es-sh-teamswap', sec); TEAMSWAP.done = true;
            ES.removeAnim(card, function () { renderSwaps(sec); });
            week = 0; renderGrid(sec);
            $$('.es-sh-cell', sec).forEach(function (x) { if (/Imran Siddiqui · Sat|Salman Butt · Sat/.test(x.dataset.tip)) x.classList.add('flip'); });
            FS.toast('Swap approved · Imran and Salman notified on WhatsApp', { tone: 'good' });
          });
        },
        tdecline: function () {
          var el = ES.sheet({ title: 'Decline swap', sub: 'Imran ⇄ Salman · Sat 03 Oct', cls: 'es-sheet-sm', html: '<label class="es-field"><span>Reason (shared with both)</span><textarea rows="3" data-w="r">Saturday dispatch is short-staffed after the Metro order. Let’s find another slot.</textarea></label>', foot: '<button class="btn secondary" data-close>Cancel</button><button class="btn danger" type="button" data-w="ok"><i data-lucide="x"></i>Decline</button>' });
          el.querySelector('[data-w="ok"]').addEventListener('click', function () { ES.closeSheet(el); TEAMSWAP.done = true; ES.removeAnim($('#es-sh-teamswap', sec), function () { renderSwaps(sec); }); FS.toast('Swap declined · reason sent to Imran and Salman', { tone: 'info' }); });
        },
        pick: function (b) {
          var o = OPEN.find(function (x) { return x.id === b.dataset.id; });
          var d = ES.parse(o.d);
          if (SH[code(CREW[0], d)].h) { FS.toast('You’re already rostered on ' + ES.dfmt(d, true) + ' — swap first', { tone: 'warn' }); return; }
          ES.busy(b, 800, 'Requesting…').then(function () {
            o.taken = true; OVR[ME.id + '|' + o.d] = o.code; PEND[ME.id + '|' + o.d] = 'pick';
            renderOpen(sec); week = Math.floor((d - WEEK0) / 864e5 / 7); renderGrid(sec);
            ES.celebrate($('#es-sh-open .taken', sec));
            FS.toast('Requested “' + o.title + '” · ' + o.perk, { tone: 'good' });
          });
        },
      });
    },
    enter: function (sec) {
      clearInterval(sec._esT);
      var t0 = Date.now(), start = 9 * 60, end = 18 * 60, base = 9 * 60 + 4;
      var paint = function () {
        var now = base + (Date.now() - t0) / 60000, p = Math.max(0, Math.min(1, (now - start) / (end - start))), left = Math.max(0, end - now);
        var bar = $('#es-sh-prog', sec); if (bar) bar.style.width = (p * 100).toFixed(2) + '%';
        var l = $('#es-sh-left', sec); if (l) l.textContent = Math.floor(left / 60) + 'h ' + ES.pad(Math.floor(left % 60)) + 'm left';
      };
      setTimeout(paint, 300); sec._esT = setInterval(paint, 30000);
    },
  });
})();

/* ---------- 15-onboarding.js ---------- */
/* ess/onboarding: team-lead onboarding checklist, policy "I agree", buddy booking, training, confetti at 100% */
(function () {
  var $ = ES.$, $$ = ES.$$;
  var G = [
    { k: 'docs', t: 'Documents', ic: 'folder-check', items: [
      { id: 'cnic', t: 'CNIC copy (front & back)', d: 'Verified by HR on 15 Sep', done: 1 },
      { id: 'bank', t: 'Confirm salary bank account', d: 'Meezan Bank ****4417 confirmed', done: 1 },
      { id: 'emerg', t: 'Emergency contact', d: 'Ayesha Bilal (spouse) · 0300-4417781', done: 1 },
      { id: 'letter', t: 'Upload signed team-lead appointment letter', d: 'Sign page 2 and upload a scan or photo', act: 'upload', btn: 'Upload', due: 'Due 05 Oct' },
    ] },
    { k: 'pol', t: 'Policies', ic: 'shield-check', items: [
      { id: 'coc', t: 'Code of conduct', d: 'Acknowledged 16 Sep', done: 1 },
      { id: 'appr', t: 'Leave & attendance approval policy', d: 'How to approve leave, corrections and overtime for your team · 4 min read', act: 'policy', btn: 'Read & agree', due: 'Due 03 Oct' },
    ] },
    { k: 'it', t: 'IT setup', ic: 'laptop', items: [
      { id: 'role', t: 'Manager role activated in Finsoft', d: 'Approvals inbox enabled for 4 direct reports', done: 1 },
      { id: 'mfa', t: 'Mobile app with MFA', d: 'Finsoft ESS on iPhone 13 · authenticator linked', done: 1 },
    ] },
    { k: 'buddy', t: 'Meet your buddy', ic: 'coffee', items: [
      { id: 'buddy', t: 'Coffee with Hamza Butt', d: 'Key Account Manager · led the Karachi team for 3 years', act: 'buddy', btn: 'Book a slot' },
    ] },
    { k: 'train', t: 'Training modules', ic: 'graduation-cap', items: [
      { id: 'appr101', t: 'Approvals 101 in Finsoft ESS', d: '12 min · scored 9/10', done: 1 },
      { id: 'tour', t: 'Team insights dashboard tour', d: '6 min · completed 28 Sep', done: 1 },
      { id: 'coach', t: 'Coaching field teams', d: '18 min · 40% watched', act: 'train', btn: 'Resume', prog: 40 },
    ] },
  ];
  var POLICY = [
    ['1. Purpose', 'This policy sets out how line managers at Al-Noor Enterprises (Pvt) Ltd review and approve leave, attendance corrections and overtime for their direct reports in Finsoft ESS.'],
    ['2. Response times', 'Leave requests must be actioned within 24 working hours. Requests over 3 days route to HR (Ayesha Noor) after your approval. Attendance corrections must be actioned before the monthly cut-off on the 25th.'],
    ['3. Fair and consistent decisions', 'Approve or reject based on business need and team coverage, never on personal grounds. A rejection must include a reason that the employee can see.'],
    ['4. Field staff', 'Order bookers and delivery riders check in through the geofenced mobile app with selfie verification. Corrections for missed punches need a route visit log or customer confirmation.'],
    ['5. Overtime', 'Overtime is paid at 2× the hourly basic rate under the Punjab Shops and Establishments Ordinance and must be pre-approved, except for emergency deliveries.'],
    ['6. Records', 'All decisions are logged in Finsoft with a timestamp and kept for 6 years for audit and labour-court purposes.'],
    ['7. Conflicts', 'If you are related to a team member, inform HR. Their approvals will route to Zainab Raza.'],
  ];
  var SLOTS = ['Fri 02 Oct · 11:00', 'Fri 02 Oct · 16:30', 'Mon 05 Oct · 10:00', 'Tue 06 Oct · 15:00'];
  var secRef;

  function all() { return G.reduce(function (a, g) { return a.concat(g.items); }, []); }
  function pct() { var xs = all(); return Math.round(xs.filter(function (x) { return x.done; }).length / xs.length * 100); }
  function find(id) { return all().find(function (x) { return x.id === id; }); }

  function itemHtml(x, i) {
    return '<li class="es-ob-item ' + (x.done ? 'done' : '') + ' es-in" style="--i:' + i + '" data-id="' + x.id + '"><span class="es-ob-ck"><i data-lucide="check"></i></span>' +
      '<div class="es-ob-txt"><b>' + x.t + '</b><small>' + x.d + '</small>' + (x.prog && !x.done ? '<div class="progress es-ob-prog"><i style="width:' + x.prog + '%"></i></div>' : '') + '</div>' +
      (x.done ? '<span class="es-ob-ok">Done</span>' : (x.due ? '<span class="pill es-ob-due"><i data-lucide="calendar-clock"></i>' + x.due + '</span>' : '') + '<button class="btn ' + (x.act === 'policy' ? 'primary' : 'secondary') + ' sm" type="button" data-act="' + x.act + '">' + x.btn + '</button>') + '</li>';
  }
  function groupHtml(g) {
    var d = g.items.filter(function (x) { return x.done; }).length;
    return '<div class="es-card es-ob-group' + (d === g.items.length ? ' complete' : '') + '" data-g="' + g.k + '"><div class="es-head"><span class="icon-tile ' + (d === g.items.length ? 'lime' : '') + '"><i data-lucide="' + g.ic + '"></i></span><h3>' + g.t + '</h3><span class="spacer"></span><span class="es-count">' + d + '/' + g.items.length + '</span></div><ul class="es-ob-list">' + g.items.map(itemHtml).join('') + '</ul></div>';
  }
  function legend() { return G.map(function (g) { var dn = g.items.filter(function (x) { return x.done; }).length; return '<span class="' + (dn === g.items.length ? 'ok' : '') + '"><i data-lucide="' + (dn === g.items.length ? 'circle-check' : g.ic) + '"></i>' + g.t + '</span>'; }).join(''); }
  function update(sec) {
    var p = pct(), xs = all(), d = xs.filter(function (x) { return x.done; }).length;
    var lg = $('.es-ob-legend', sec); lg.innerHTML = legend(); FS.icons(lg);
    ES.setRing($('#es-ob-ring', sec), p);
    ES.tick($('#es-ob-pct', sec), p, { dec: 0, suffix: '%' });
    $('#es-ob-n', sec).textContent = d + ' of ' + xs.length + ' steps done';
    $('#es-ob-left', sec).textContent = xs.length - d ? (xs.length - d) + ' left · about ' + ((xs.length - d) * 6) + ' min' : 'All done!';
    if (p === 100 && !sec.dataset.done) {
      sec.dataset.done = '1';
      var hero = $('#es-ob-prog', sec); hero.classList.add('complete');
      $('#es-ob-msg', sec).innerHTML = '<b>You’re all set, Team Lead!</b><span>Zainab and HR have been notified. Your approvals inbox is fully unlocked.</span><a class="btn lime sm" href="#/ess/team"><i data-lucide="users"></i>Go to My Team</a>';
      FS.icons(hero);
      setTimeout(function () { ES.confetti(); ES.celebrate($('#es-ob-ring', sec)); FS.toast('Onboarding complete · badge “Ready to lead” earned', { tone: 'good' }); }, 450);
    }
  }
  function complete(id) {
    var x = find(id), sec = secRef; x.done = 1;
    if (id === 'letter') x.d = 'Uploaded just now · pending HR verification';
    if (id === 'appr') x.d = 'Acknowledged 01 Oct 2026, ' + new Date().toTimeString().slice(0, 5);
    if (id === 'coach') x.d = '18 min · completed';
    var g = G.find(function (g) { return g.items.indexOf(x) > -1; });
    var gEl = $('[data-g="' + g.k + '"]', sec), li = $('[data-id="' + id + '"]', gEl);
    li.outerHTML = itemHtml(x, 0);
    li = $('[data-id="' + id + '"]', gEl); li.classList.remove('es-in'); li.classList.add('es-ob-just');
    var dn = g.items.filter(function (y) { return y.done; }).length;
    $('.es-count', gEl).textContent = dn + '/' + g.items.length;
    if (dn === g.items.length) { gEl.classList.add('complete'); $('.icon-tile', gEl).classList.add('lime'); }
    FS.icons(gEl);
    ES.celebrate($('.es-ob-ck', li));
    update(sec);
  }

  function policySheet() {
    var el = ES.sheet({ title: 'Leave & attendance approval policy', sub: 'HR-POL-014 · v3 · effective 01 Sep 2026 · owner Ayesha Noor', cls: 'es-sheet-lg',
      html: '<div class="es-ob-read"><i id="es-ob-rbar"></i></div><div class="es-ob-doc" id="es-ob-doc" tabindex="0">' + POLICY.map(function (p) { return '<h4>' + p[0] + '</h4><p>' + p[1] + '</p>'; }).join('') + '<p class="es-ob-end"><i data-lucide="flag"></i>End of policy</p></div>' +
        '<label class="es-ob-agree" id="es-ob-agree"><input type="checkbox" disabled id="es-ob-chk"><span>I have read and agree to the Leave &amp; attendance approval policy.</span></label><small class="es-hint" id="es-ob-hint">Scroll to the end to enable the checkbox.</small>',
      foot: '<button class="btn secondary" data-close>Later</button><button class="btn primary" id="es-ob-agreebtn" disabled><i data-lucide="pen-line"></i>I agree</button>' });
    var doc = $('#es-ob-doc', el), chk = $('#es-ob-chk', el), btn = $('#es-ob-agreebtn', el);
    var onScroll = function () {
      var p = Math.min(1, doc.scrollTop / Math.max(1, doc.scrollHeight - doc.clientHeight));
      $('#es-ob-rbar', el).style.width = (p * 100) + '%';
      if (p > .96 && chk.disabled) { chk.disabled = false; $('#es-ob-agree', el).classList.add('ready'); $('#es-ob-hint', el).textContent = 'Thanks for reading. Tick the box to sign.'; }
    };
    doc.addEventListener('scroll', onScroll);
    setTimeout(onScroll, 100);
    chk.addEventListener('change', function () { btn.disabled = !chk.checked; });
    btn.addEventListener('click', function () {
      ES.busy(btn, 800, 'Signing…').then(function () { ES.closeSheet(el); complete('appr'); FS.toast('Policy acknowledged · e-signature recorded', { tone: 'good' }); });
    });
  }
  function buddySheet() {
    var pick = null;
    var el = ES.sheet({ title: 'Coffee with Hamza Butt', sub: 'Your onboarding buddy · 30 minutes · Lahore HQ café or Google Meet', cls: 'es-sheet-sm',
      html: '<div class="es-ob-buddy">' + ES.av('Hamza Butt', 'lg') + '<div><b>Hamza Butt</b><small>Key Account Manager · led a 6-person field team in Karachi</small></div></div>' +
        '<div class="es-field" style="margin-top:14px"><span>Pick a slot</span><div class="es-opts">' + SLOTS.map(function (s) { return '<button type="button" class="es-opt" data-slot="' + s + '"><i data-lucide="calendar"></i>' + s + '</button>'; }).join('') + '</div></div>' +
        '<label class="es-field" style="margin-top:12px"><span>Anything you’d like to cover?</span><textarea rows="2">Handling leave clashes during month-end, and how you ran route reviews.</textarea></label>',
      foot: '<button class="btn secondary" data-close>Cancel</button><button class="btn primary" id="es-ob-book" disabled><i data-lucide="calendar-check"></i>Send invite</button>' });
    el.addEventListener('click', function (e) {
      var s = e.target.closest('[data-slot]'); if (!s) return;
      pick = s.dataset.slot; $$('[data-slot]', el).forEach(function (b) { b.classList.toggle('on', b === s); }); $('#es-ob-book', el).disabled = false;
    });
    $('#es-ob-book', el).addEventListener('click', function (e) {
      ES.busy(e.currentTarget, 800, 'Sending…').then(function () { ES.closeSheet(el); find('buddy').d = 'Booked · ' + pick + ' · invite sent to Hamza'; complete('buddy'); FS.toast('Invite sent to Hamza Butt for ' + pick, { tone: 'good' }); });
    });
  }
  function trainSheet() {
    var x = find('coach'), p = x.prog, timer;
    var CH = ['Why field coaching matters', 'The weekly route review', 'Giving feedback on the road', 'Using Finsoft team insights', 'Quiz'];
    var el = ES.sheet({ title: 'Coaching field teams', sub: 'Module 2 of 2 · 18 min · Al-Noor Academy', cls: 'es-sheet-lg',
      html: '<div class="es-ob-player"><div class="es-ob-screen"><span class="es-ob-play" id="es-ob-play"><i data-lucide="play"></i></span><b id="es-ob-ch">' + CH[Math.min(4, Math.floor(p / 20))] + '</b><small>Faisal Qureshi · Operations Head</small></div>' +
        '<div class="es-ob-bar"><i id="es-ob-pb" style="width:' + p + '%"></i></div><div class="es-ob-time"><span id="es-ob-t">' + Math.round(18 * p / 100) + ':00</span><span>18:00</span></div></div>' +
        '<ol class="es-ob-ch">' + CH.map(function (c, i) { return '<li class="' + (p >= (i + 1) * 20 ? 'done' : '') + '" data-c="' + i + '"><span>' + (i + 1) + '</span>' + c + '</li>'; }).join('') + '</ol>' +
        '<p class="es-hint">Demo: playback runs at 40× speed.</p>',
      foot: '<button class="btn secondary" data-close>Close</button><button class="btn primary" id="es-ob-go"><i data-lucide="play"></i>Resume</button>' });
    var go = $('#es-ob-go', el);
    var stop = function () { clearInterval(timer); timer = null; };
    var ov = el.closest('.overlay'); var mo = new MutationObserver(function () { if (!ov.isConnected || !ov.classList.contains('open')) { stop(); mo.disconnect(); } }); mo.observe(ov, { attributes: true }); mo.observe(document.body, { childList: true });
    var run = function () {
      if (timer) { stop(); go.innerHTML = '<i data-lucide="play"></i>Resume'; FS.icons(go); $('#es-ob-play', el).classList.remove('on'); return; }
      go.innerHTML = '<i data-lucide="pause"></i>Pause'; FS.icons(go); $('#es-ob-play', el).classList.add('on');
      timer = setInterval(function () {
        p = Math.min(100, p + 1.5); x.prog = Math.round(p);
        $('#es-ob-pb', el).style.width = p + '%';
        var m = 18 * p / 100; $('#es-ob-t', el).textContent = Math.floor(m) + ':' + ES.pad(Math.round((m % 1) * 59));
        $('#es-ob-ch', el).textContent = CH[Math.min(4, Math.floor(p / 20))];
        $$('.es-ob-ch li', el).forEach(function (li, i) { li.classList.toggle('done', p >= (i + 1) * 20); li.classList.toggle('now', p < (i + 1) * 20 && p >= i * 20); });
        var pr = $('[data-id="coach"] .es-ob-prog i', secRef); if (pr) pr.style.width = p + '%';
        if (p >= 100) {
          stop(); go.disabled = true; go.innerHTML = '<i data-lucide="circle-check"></i>Completed'; FS.icons(go);
          setTimeout(function () { ES.closeSheet(el); complete('coach'); FS.toast('Module complete · certificate added to your profile', { tone: 'good' }); }, 700);
        }
      }, 60);
    };
    go.addEventListener('click', run);
    $('#es-ob-play', el).addEventListener('click', run);
  }

  ES.route('ess/onboarding', {
    render: function () {
      var p = pct(), xs = all(), d = xs.filter(function (x) { return x.done; }).length;
      return '<div class="es-grid es-wide es-ob-top">' +
        '<div class="es-card night es-ob-ceo"><div class="es-ob-quote"><i data-lucide="quote"></i></div>' +
        '<span class="es-ob-eye">A note from the CEO</span><h2>Welcome to leadership, Bilal.</h2>' +
        '<p>Four years ago you joined us as a sales executive covering three routes. Today you are leading four of our best field people. Lead the way you sold: listen first, keep promises, and make your team’s wins louder than your own. My door at HQ is always open.</p>' +
        '<div class="es-ob-sign">' + ES.av('Ahmed Raza', '', 'lime') + '<div><span class="es-ob-hand">Ahmed Raza</span><small>Chief Executive Officer · Al-Noor Enterprises</small></div><span class="spacer"></span><button class="btn lime sm" type="button" data-act="video"><i data-lucide="play"></i>90-sec welcome</button></div></div>' +
        '<div class="es-card es-ob-pcard" id="es-ob-prog"><div class="es-head"><h3>Your progress</h3><span class="spacer"></span><span class="pill"><i data-lucide="sparkles"></i>Team-lead track</span></div>' +
        '<div class="es-ob-ringrow">' + ES.ring(p, { size: 132, stroke: 3.2, tone: 'var(--primary)', label: '<span id="es-ob-pct">' + p + '%</span>', sub: 'complete' }).replace('class="es-ring', 'id="es-ob-ring" class="es-ring') +
        '<div class="es-ob-msg" id="es-ob-msg"><b id="es-ob-n">' + d + ' of ' + xs.length + ' steps done</b><span id="es-ob-left">' + (xs.length - d) + ' left · about ' + ((xs.length - d) * 6) + ' min</span><span class="es-label">Started 15 Sep · target 09 Oct</span></div></div>' +
        '<div class="es-ob-legend">' + legend() + '</div></div></div>' +
        '<div class="es-grid es-main">' +
          '<div class="es-col">' + G.map(groupHtml).join('') + '</div>' +
          '<div class="es-col">' +
            '<div class="es-card"><div class="es-head"><h3>Your buddy</h3></div><div class="es-ob-buddy">' + ES.av('Hamza Butt', 'lg') + '<div><b>Hamza Butt</b><small>Key Account Manager · Sales</small></div></div>' +
            '<p class="es-ob-bq">“Happy to share what worked for me with field teams. Message me any time, especially before your first month-end.”</p>' +
            '<div class="es-row"><a class="btn secondary sm" href="#/ess/company"><i data-lucide="contact"></i>Profile</a><button class="btn secondary sm" type="button" data-act="wa"><i data-lucide="message-circle"></i>WhatsApp</button></div></div>' +
            '<div class="es-card"><div class="es-head"><h3>Key contacts</h3></div>' + [['Zainab Raza', 'Your manager · approvals escalation'], ['Ayesha Noor', 'HR Manager · policies & leave'], ['Mehwish Tariq', 'IT Lead · access & devices'], ['Nida Shah', 'Payroll · team overtime']].map(function (c) { return '<div class="es-ob-ct">' + ES.av(c[0], 'sm') + '<div><b>' + c[0] + '</b><small>' + c[1] + '</small></div></div>'; }).join('') + '</div>' +
            '<div class="es-card"><div class="es-head"><h3>First 30 days</h3></div><ol class="es-ob-30">' +
            [['Week 1', 'Shadow Zainab on 2 approvals', 1], ['Week 2', 'Run your first route review', 1], ['Week 3', '1:1 with each direct report', 0], ['Week 4', 'Present team plan for Q3', 0]].map(function (w) { return '<li class="' + (w[2] ? 'done' : '') + '"><span>' + w[0] + '</span><b>' + w[1] + '</b></li>'; }).join('') + '</ol></div>' +
          '</div></div>';
    },
    bind: function (sec) {
      secRef = sec;
      ES.acts(sec, {
        upload: function (b) {
          ES.busy(b, 1200, 'Uploading…').then(function () { complete('letter'); FS.toast('appointment-letter-signed.pdf uploaded', { tone: 'good' }); });
        },
        policy: function () { policySheet(); },
        buddy: function () { buddySheet(); },
        train: function () { trainSheet(); },
        video: function (b) { FS.toast('Playing welcome video from Ahmed Raza', { tone: 'info' }); b.innerHTML = '<i data-lucide="volume-2"></i>Playing…'; FS.icons(b); setTimeout(function () { b.innerHTML = '<i data-lucide="rotate-ccw"></i>Watch again'; FS.icons(b); }, 3000); },
        wa: function () { FS.toast('Opening WhatsApp · Hamza Butt 0321-4002231', { tone: 'info' }); },
      });
    },
  });
})();

/* ---------- 16-notifications.js ---------- */
/* ess/notifications: grouped feed, filter chips, animated mark-all-read, swipe to dismiss */
(function () {
  var $ = ES.$, $$ = ES.$$;
  var N = [
    { id: 1, g: 'Today', cat: 'approvals', ic: 'user-check', tone: 'green', t: 'Tanveer Hassan requested 2 days casual leave', b: '05 – 06 Oct · Sister’s nikkah in Okara. Needs your approval.', time: '8 min ago', unread: true, r: 'ess/team', cta: 'Review' },
    { id: 2, g: 'Today', cat: 'payroll', ic: 'banknote', tone: 'lime', t: 'September salary credited', b: 'Rs 127,630.00 sent to Meezan Bank ****4417 · PR-2026-09', time: '1 h ago', unread: true, r: 'ess/payslips', cta: 'View payslip' },
    { id: 3, g: 'Today', cat: 'social', ic: 'heart-handshake', tone: 'violet', t: 'Zainab Raza gave you kudos · Customer Hero', b: '“Closed the Packages Ltd renewal two weeks early. Brilliant work!”', time: '2 h ago', unread: true, r: 'ess/kudos', cta: 'Say thanks' },
    { id: 4, g: 'Today', cat: 'attendance', ic: 'fingerprint', tone: 'blue', t: 'Reminder: you haven’t checked in yet', b: 'Your shift started at 09:00. You are 42 m inside the Lahore HQ geofence.', time: '09:04 AM', unread: false, r: 'ess/attendance', cta: 'Check in' },
    { id: 5, g: 'This week', cat: 'leave', ic: 'calendar-check', tone: 'green', t: 'Casual leave approved · 24 Sep', b: 'Approved by Zainab Raza. Casual balance is now 5 days.', time: 'Tue, 29 Sep', unread: false, r: 'ess/leave' },
    { id: 6, g: 'This week', cat: 'approvals', ic: 'receipt', tone: 'orange', t: 'Nadeem Akhtar submitted an expense claim', b: 'Fuel · Rs 4,850 · Route visit Johar Town → Township', time: 'Tue, 29 Sep', unread: false, r: 'ess/team', cta: 'Review' },
    { id: 7, g: 'This week', cat: 'payroll', ic: 'percent', tone: 'blue', t: 'Upload proof for your Zakat declaration', b: 'Rs 45,000 declared u/s 60. Proof due by 15 Oct to apply in October payroll.', time: 'Mon, 28 Sep', unread: false, r: 'ess/tax', cta: 'Upload' },
    { id: 8, g: 'This week', cat: 'social', ic: 'megaphone', tone: 'lime', t: 'Q2 sales kick-off · 05 Oct, 10:00 AM', b: 'Ahmed Raza · Pearl Continental Lahore, Shalimar Hall. Please confirm attendance.', time: 'Mon, 28 Sep', unread: false, r: 'ess/company' },
    { id: 9, g: 'Earlier', cat: 'leave', ic: 'life-buoy', tone: 'violet', t: 'Helpdesk ticket HD-2026-0418 resolved', b: 'IT · “VPN not connecting on field laptop”. Rate your experience.', time: '24 Sep', unread: false, r: 'ess/helpdesk', cta: 'Rate' },
    { id: 10, g: 'Earlier', cat: 'payroll', ic: 'hand-coins', tone: 'orange', t: 'Loan instalment recovered · LN-2026-0031', b: 'Rs 5,000 deducted in September payroll. Outstanding Rs 85,000.', time: '30 Sep', unread: false, r: 'ess/loans' },
  ];
  N[3].unread = true; /* 4 unread total; sidebar shows 3 + live reminder */
  var CATS = [['all', 'All'], ['unread', 'Unread'], ['approvals', 'Approvals'], ['payroll', 'Payroll & tax'], ['leave', 'Leave & work'], ['attendance', 'Attendance'], ['social', 'Kudos & news']];
  var filter = 'all';

  function item(n, i) {
    return '<article class="es-nt-item ' + (n.unread ? 'unread' : '') + ' es-in" style="--i:' + i + '" data-id="' + n.id + '">' +
      '<span class="es-nt-swipe-r" aria-hidden="true"><i data-lucide="check"></i>Read</span><span class="es-nt-swipe-l" aria-hidden="true">Dismiss<i data-lucide="trash-2"></i></span>' +
      '<div class="es-nt-inner"><span class="icon-tile ' + n.tone + '"><i data-lucide="' + n.ic + '"></i></span>' +
      '<div class="es-nt-txt"><b>' + n.t + '</b><p>' + n.b + '</p><div class="es-nt-meta"><span>' + n.time + '</span>' +
      (n.cta ? '<a class="es-link" href="#/' + n.r + '">' + n.cta + '<i data-lucide="arrow-right"></i></a>' : '<a class="es-link" href="#/' + n.r + '">Open<i data-lucide="arrow-right"></i></a>') + '</div></div>' +
      '<div class="es-nt-acts"><button type="button" class="icon-btn-sm" data-act="toggle" data-tip="' + (n.unread ? 'Mark as read' : 'Mark as unread') + '" aria-label="Toggle read"><i data-lucide="' + (n.unread ? 'mail-open' : 'mail') + '"></i></button>' +
      '<button type="button" class="icon-btn-sm" data-act="dismiss" data-tip="Dismiss" aria-label="Dismiss"><i data-lucide="x"></i></button></div>' +
      '<span class="es-nt-dot" aria-label="Unread"></span></div></article>';
  }
  function visible() {
    return N.filter(function (n) { return filter === 'all' || (filter === 'unread' ? n.unread : n.cat === filter); });
  }
  function renderList(sec) {
    var host = $('#es-nt-list', sec), list = visible(), html = '', k = 0;
    ['Today', 'This week', 'Earlier'].forEach(function (g) {
      var xs = list.filter(function (n) { return n.g === g; });
      if (!xs.length) return;
      html += '<div class="es-nt-group"><h4>' + g + '<span class="es-count">' + xs.length + '</span></h4>' + xs.map(function (n) { return item(n, k++); }).join('') + '</div>';
    });
    host.innerHTML = html || '<div class="es-empty"><span class="icon-tile lime"><i data-lucide="party-popper"></i></span><b>You’re all caught up</b><span>Nothing here for this filter. Enjoy the quiet.</span></div>';
    FS.icons(host);
    $$('.es-nt-item', host).forEach(bindSwipe);
    counts(sec);
  }
  function counts(sec) {
    var u = N.filter(function (n) { return n.unread; }).length;
    ES.tick($('#es-nt-unread', sec), u, { dec: 0 });
    $$('[data-f]', sec).forEach(function (b) {
      var f = b.dataset.f, c = N.filter(function (n) { return f === 'all' || (f === 'unread' ? n.unread : n.cat === f); }).length;
      var i = b.querySelector('i'); if (i) i.textContent = c;
    });
    var btn = $('#es-nt-readall'); if (btn) btn.disabled = !u;
    var nav = document.querySelector('[data-r="ess/notifications"] .badge, a[href="#/ess/notifications"] .sb-badge, a[href="#/ess/notifications"] em');
    if (nav) { nav.textContent = u; nav.style.display = u ? '' : 'none'; }
  }
  function bindSwipe(el) {
    ES.swipe(el, {
      rotate: false, threshold: 90, mover: '.es-nt-inner',
      onLeft: function () { dismiss(el); return true; },
      onRight: function () { var n = byEl(el); n.unread = false; setTimeout(function () { renderList(el.closest('.screen')); }, 260); FS.toast('Marked as read', { tone: 'info', ms: 1600 }); return false; },
    });
  }
  function byEl(el) { var id = +el.dataset.id; return N.find(function (n) { return n.id === id; }); }
  function dismiss(el) {
    var sec = el.closest('.screen'), n = byEl(el), idx = N.indexOf(n);
    N.splice(idx, 1);
    el.classList.add('es-nt-gone');
    setTimeout(function () { renderList(sec); }, 330);
    FS.toast('Notification dismissed', { undo: function () { N.splice(idx, 0, n); renderList(sec); } });
  }

  ES.route('ess/notifications', {
    render: function () {
      return '<div class="es-grid es-main">' +
        '<div class="es-card flush es-nt-card"><div class="es-head"><h3>Inbox</h3><span class="es-count" id="es-nt-unread">4</span><span class="es-label">unread</span><span class="spacer"></span>' +
        '<div class="chips es-nt-chips">' + CATS.map(function (c, i) { return '<button type="button" class="' + (i ? '' : 'active') + '" data-f="' + c[0] + '">' + c[1] + ' <i>0</i></button>'; }).join('') + '</div></div>' +
        '<div id="es-nt-list" class="es-nt-list"></div></div>' +
        '<div class="es-col">' +
          '<div class="es-card es-nt-hero"><div class="es-head"><h3>This week</h3><span class="spacer"></span><span class="pill"><i data-lucide="bell-ring"></i>Avg response <b>1h 40m</b></span></div>' +
          '<div class="es-nt-bars">' + [['Mon', 6], ['Tue', 9], ['Wed', 4], ['Thu', 7], ['Fri', 0], ['Sat', 0], ['Sun', 0]].map(function (d, i) { return '<div style="--h:' + (d[1] * 10) + '%;--i:' + i + '" data-tip="' + d[1] + ' notifications"><i></i><span>' + d[0] + '</span></div>'; }).join('') + '</div>' +
          '<div class="es-stats"><div class="es-stat"><span>Approvals waiting</span><b>4</b><small>Oldest 2 days</small></div><div class="es-stat"><span>Actioned</span><b>18</b><small>this week</small></div></div></div>' +
          '<div class="es-card"><div class="es-head"><h3>Delivery channels</h3></div>' +
          [['Approvals for my team', 'user-check', [1, 1, 1]], ['Payroll & tax', 'banknote', [1, 1, 0]], ['Leave & attendance', 'calendar-check', [1, 0, 1]], ['Kudos & announcements', 'heart-handshake', [1, 0, 0]]].map(function (r) {
            return '<div class="es-nt-pref"><span class="icon-tile"><i data-lucide="' + r[1] + '"></i></span><b>' + r[0] + '</b><div class="es-nt-ch">' + ['In-app', 'Email', 'WhatsApp'].map(function (c, j) { return '<button type="button" class="es-nt-chip ' + (r[2][j] ? 'on' : '') + '" data-act="chan" aria-pressed="' + !!r[2][j] + '">' + c + '</button>'; }).join('') + '</div></div>';
          }).join('') +
          '<div class="es-nt-quiet"><label class="switch"><input type="checkbox" checked data-act="quiet"><i></i><span>Quiet hours</span></label><span class="es-label">22:00 – 08:00 · Fridays 13:00 – 14:30</span></div></div>' +
        '</div></div>';
    },
    bind: function (sec) {
      renderList(sec);
      ES.acts(sec, {
        toggle: function (b) { var el = b.closest('.es-nt-item'), n = byEl(el); n.unread = !n.unread; el.classList.toggle('unread', n.unread); b.dataset.tip = n.unread ? 'Mark as read' : 'Mark as unread'; b.innerHTML = '<i data-lucide="' + (n.unread ? 'mail-open' : 'mail') + '"></i>'; FS.icons(b); FS.untip(); counts(sec); },
        dismiss: function (b) { dismiss(b.closest('.es-nt-item')); },
        readall: function (b) {
          var un = $$('.es-nt-item.unread', sec);
          if (!un.length) return;
          un.forEach(function (el, i) { setTimeout(function () { el.classList.add('es-nt-reading'); el.classList.remove('unread'); }, i * 110); });
          setTimeout(function () { N.forEach(function (n) { n.unread = false; }); renderList(sec); ES.celebrate(b); FS.toast('All caught up · ' + un.length + ' marked as read', { tone: 'good' }); }, un.length * 110 + 450);
        },
        chan: function (b) { var on = !b.classList.contains('on'); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); FS.toast(b.textContent + (on ? ' on' : ' off') + ' for ' + b.closest('.es-nt-pref').querySelector('b').textContent, { tone: 'info', ms: 1800 }); },
        prefs: function () {ES.scrollTo($('.es-nt-pref', sec)); },
        quiet: function (b) { setTimeout(function () { FS.toast('Quiet hours ' + (b.checked ? 'enabled' : 'disabled'), { tone: 'info', ms: 1600 }); }); },
      });
      sec.addEventListener('click', function (e) {
        var c = e.target.closest('[data-f]'); if (!c) return;
        filter = c.dataset.f; renderList(sec);
      });
    },
  });
})();

})();
