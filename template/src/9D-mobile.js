/* ==========================================================================
   9D-mobile.js — Finsoft Mobile design reference (route: mobile)
   Two live mini-apps (Employee · Owner) inside realistic phone frames, each with
   its own router (iOS push/pop), tab bar + FAB, bottom sheets, snackbars and
   real pointer gestures (swipe cards, swipe-to-archive, pull-to-refresh).
   Prefix: mo-
   ========================================================================== */
(function () {
  'use strict';
  if (!window.FS) return;
  const D = window.FS_DATA || {};
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const RM = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fmt = (n, d = 0) => FS.fmt(n, d);
  const mny = (n, dec = 2) => FS.money(n, { dec });
  const ic = (n, c) => `<i data-lucide="${n}"${c ? ` class="${c}"` : ''}></i>`;
  const short = (n) => (n >= 1e6 ? 'Rs ' + (n / 1e6).toFixed(2) + 'M' : 'Rs ' + fmt(Math.round(n / 1e3)) + 'K');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const W = 397, H = 802; // phone frame (375×780 screen + 11px bezel)
  const EASE_IOS = 'cubic-bezier(.32,.72,0,1)';
  const cust = (code) => (D.customers || []).find((c) => c.code === code) || {};

  /* ---------------------------------------------------------------- chrome bits */
  const SBAR_ICONS = `<svg viewBox="0 0 18 12" width="18" height="12" aria-hidden="true"><rect x="0" y="8" width="3" height="4" rx="1" fill="currentColor"/><rect x="5" y="5.5" width="3" height="6.5" rx="1" fill="currentColor"/><rect x="10" y="3" width="3" height="9" rx="1" fill="currentColor"/><rect x="15" y="0" width="3" height="12" rx="1" fill="currentColor"/></svg>
    <svg viewBox="0 0 16 12" width="16" height="12" aria-hidden="true"><path d="M8 2.6c2.3 0 4.4.9 6 2.4l1.3-1.3A10.4 10.4 0 0 0 8 .8 10.4 10.4 0 0 0 .7 3.7L2 5a8.6 8.6 0 0 1 6-2.4Zm0 3.6c1.3 0 2.5.5 3.4 1.3l1.3-1.3A6.6 6.6 0 0 0 8 4.4c-1.8 0-3.5.7-4.7 1.8l1.3 1.3c.9-.8 2.1-1.3 3.4-1.3Zm0 3.6c.4 0 .8.1 1.1.4L8 11.3 6.9 10.2c.3-.3.7-.4 1.1-.4Z" fill="currentColor"/></svg>
    <svg viewBox="0 0 27 13" width="27" height="13" aria-hidden="true"><rect x=".5" y=".5" width="23" height="12" rx="3.6" fill="none" stroke="currentColor" opacity=".4"/><rect x="2" y="2" width="17" height="9" rx="2.2" fill="currentColor"/><path d="M25 4.5v4c.8-.3 1.4-1.1 1.4-2s-.6-1.7-1.4-2Z" fill="currentColor" opacity=".45"/></svg>`;

  function tabbarHTML(app, active) {
    const t = app.tabs;
    const btn = (x, k) => `<button class="mo-tb${x.id === active ? ' on' : ''}" data-mt="${x.id}" style="--c:${k}" aria-label="${x.label}">
        <span class="mo-tb-ic">${ic(x.icon)}${x.badge ? `<em class="mo-badge" data-badge="${x.id}"></em>` : ''}</span><span class="mo-tb-l" data-t="${x.label}">${x.label}</span></button>`;
    const idx = { [t[0].id]: 0, [t[1].id]: 1, [t[2].id]: 3, [t[3].id]: 4 }[active] ?? 0;
    return `<nav class="mo-tabbar" aria-label="${app.name} tabs"><span class="mo-tb-ind" style="--x:${idx}"></span>
      ${btn(t[0], 0)}${btn(t[1], 1)}<span class="mo-fab-slot"><button class="mo-fab" data-fab aria-label="Quick actions">${ic('plus')}</button></span>${btn(t[2], 3)}${btn(t[3], 4)}</nav>`;
  }
  function frameHTML(app, inner, o = {}) {
    return `<div class="mo-phone${o.static ? ' mo-static' : ''}${o.notabs ? ' mo-notabs' : ''}${o.dark ? ' mo-sb-dark' : ''}" data-app="${app.key}">
      <i class="mo-hw mo-hw-a"></i><i class="mo-hw mo-hw-b"></i><i class="mo-hw mo-hw-c"></i><i class="mo-hw mo-hw-d"></i>
      <div class="mo-screen">
        <div class="mo-views">${inner || ''}</div>
        ${tabbarHTML(app, o.tab || app.tabs[0].id)}
        <div class="mo-sheet-host"><div class="mo-scrim"></div></div>
        <div class="mo-snack-host"></div>
        <div class="mo-island" aria-hidden="true"><i></i></div>
        <div class="mo-sbar"><b>9:41</b><span>${SBAR_ICONS}</span></div>
        <div class="mo-homeind" aria-hidden="true"></div>
      </div>
    </div>`;
  }
  const navBar = (title, back = 'Back', right = '') => `<header class="mo-nav"><button class="mo-back" data-back>${ic('chevron-left')}<span>${back}</span></button><b class="mo-nav-t">${title}</b><span class="mo-nav-r">${right}</span></header>`;
  const largeTitle = (title, right = '', sub = '') => `<div class="mo-lt"><div>${sub ? `<small>${sub}</small>` : ''}<h2>${title}</h2></div><div class="mo-lt-r">${right}</div></div>`;
  const sw = (on, act, label) => `<button class="mo-switch${on ? ' on' : ''}" role="switch" aria-checked="${on}" data-act="${act}" aria-label="${label}"><i></i></button>`;
  const spark = (data, w, h, pad = 4) => {
    const mx = Math.max(...data), mn = Math.min(...data), r = mx - mn || 1;
    const pts = data.map((v, i) => [(i / (data.length - 1)) * w, pad + (h - pad * 2) * (1 - (v - mn) / r)]);
    let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], cx = (x0 + x1) / 2; d += ` C${cx.toFixed(1)},${y0.toFixed(1)} ${cx.toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`; }
    return { line: d, area: d + ` L${w},${h} L0,${h} Z`, last: pts[pts.length - 1] };
  };

  /* ============================================================ EMPLOYEE APP */
  const UR = { Home: 'ہوم', Attendance: 'حاضری', Inbox: 'ان باکس', Me: 'پروفائل', 'Good morning': 'صبح بخیر', 'Leave balance': 'چھٹیوں کا بیلنس', 'Next payday': 'اگلی تنخواہ', Requests: 'درخواستیں', News: 'اعلانات', Documents: 'دستاویزات', Settings: 'ترتیبات', 'Face ID login': 'فیس آئی ڈی لاگ اِن', Notifications: 'اطلاعات', 'Work offline': 'آف لائن کام', Language: 'زبان', 'Sign out': 'سائن آؤٹ', 'Check in': 'چیک اِن', 'Shortcuts': 'شارٹ کٹس', 'Lock app': 'ایپ لاک کریں', 'Quick actions': 'فوری اقدامات' };

  const empState = () => ({
    lang: 'en', clock: 9 * 3600 + 3 * 60 + 55, checkedIn: null, offline: false, faceId: true, notif: true,
    bal: { Annual: 14, Casual: 6, Sick: 8 },
    reqs: [
      { id: 'LV-118', type: 'Casual', range: '12 – 13 Oct', days: 2, step: 2, status: 'Awaiting HR' },
      { id: 'LV-104', type: 'Sick', range: '18 Sep', days: 1, step: 4, status: 'Approved' },
    ],
    inbox: [
      { id: 1, ic: 'file-text', tone: 'green', t: 'Your September payslip is ready', s: 'Net pay Rs 153,550 credited to HBL ••4417', ago: '2h', unread: true },
      { id: 2, ic: 'plane', tone: 'orange', t: 'Casual leave approved by manager', s: 'Zainab Raza approved 12 – 13 Oct · now with HR', ago: '5h', unread: true },
      { id: 3, ic: 'megaphone', tone: 'violet', t: 'Q3 town hall · Friday 3 PM', s: 'Board room, Lahore HQ · live on Teams', ago: '1d' },
      { id: 4, ic: 'wallet', tone: 'blue', t: 'Expense reimbursed via JazzCash', s: 'Rs 3,200 · fuel claim EXP-2026-000219', ago: '2d' },
      { id: 5, ic: 'clock-3', tone: 'yellow', t: 'Attendance correction approved', s: 'Tue 29 Sep · check-in set to 09:02', ago: '3d' },
      { id: 6, ic: 'shield-check', tone: 'green', t: 'Travel policy v2.1 published', s: 'Daily allowance revised for Karachi & Islamabad', ago: '5d' },
    ],
    fresh: [
      { id: 7, ic: 'calendar-clock', tone: 'blue', t: 'Shift update from Monday', s: 'General shift 09:00 – 18:00 · Saturday half day', ago: 'now', unread: true },
      { id: 8, ic: 'at-sign', tone: 'violet', t: 'Ayesha Noor mentioned you', s: '“Bilal, please update your emergency contact.”', ago: 'now', unread: true },
    ],
    scanned: 0,
  });
  const clockStr = (s, secs = true) => { const h = Math.floor(s / 3600) % 24, m = Math.floor(s / 60) % 60, x = s % 60; const p = (n) => String(n).padStart(2, '0'); return secs ? `${p(h)}:${p(m)}<small>:${p(x)}</small>` : `${p(h)}:${p(m)}`; };

  const EMP = {
    key: 'emp', name: 'Employee app', who: 'Bilal Khan',
    tabs: [{ id: 'home', icon: 'house', label: 'Home' }, { id: 'attendance', icon: 'calendar-check', label: 'Attendance' }, { id: 'inbox', icon: 'bell', label: 'Inbox', badge: true }, { id: 'me', icon: 'circle-user', label: 'Me' }],
    fab: [
      { act: 'eApplyLeave', icon: 'plane', tone: 'orange', label: 'Apply leave', sub: '14 annual days left' },
      { act: 'eScan', icon: 'scan-line', tone: 'green', label: 'Scan expense', sub: 'Snap a receipt' },
      { act: 'eAdvance', icon: 'hand-coins', tone: 'blue', label: 'Request advance', sub: 'Up to Rs 75,000' },
      { act: 'eCorrection', icon: 'clock-3', tone: 'violet', label: 'Correction', sub: 'Fix a missed punch' },
    ],
    badge: (st) => ({ inbox: st.inbox.filter((x) => x.unread).length }),
    screens: {},
    acts: {},
  };

  EMP.screens.home = {
    tab: 'home', skel: true,
    notes: [{ y: 0.24, t: 'Live clock check-in card', i: 'clock' }, { y: 0.6, t: 'Bento tiles, one tap deep', i: 'layout-grid' }, { y: 0.93, t: 'Centre FAB → quick actions', i: 'plus' }],
    render(ph) {
      const st = ph.st, t = ph.t;
      const ci = st.checkedIn;
      const worked = ci ? Math.max(0, st.clock - st.ciAt) : 0;
      const pct = Math.min(100, (worked / (9 * 3600)) * 100);
      return `<div class="mo-pad">
        <div class="mo-hello"><span class="mo-av">BK</span><div><small>${t('Good morning')},</small><b>Bilal</b></div><span class="mo-sp"></span>
          <button class="mo-ibtn" data-mt="inbox" aria-label="Inbox">${ic('bell')}<em class="mo-dot"></em></button></div>
        ${st.offline ? `<div class="mo-offline">${ic('wifi-off')}<span>You're offline · 2 actions will sync automatically</span></div>` : ''}
        <section class="mo-ci-card${ci ? ' is-in' : ''}">
          <div class="mo-ci-top"><span class="mo-gchip"><i class="mo-live"></i>${ci ? 'On shift' : "Today's shift"}</span><span>General · 09:00 – 18:00</span></div>
          <div class="mo-ci-clock" data-clock>${clockStr(st.clock)}</div>
          <div class="mo-ci-sub">Thursday, 1 October · Lahore HQ</div>
          ${ci ? `<div class="mo-ci-in"><span class="mo-ci-ok">${ic('check')}</span><div><b>Checked in ${ci}</b><small>On time · geofence + face verified${st.offline ? ' · queued' : ''}</small></div></div>
              <div class="mo-ci-prog"><i style="transform:scaleX(${(pct / 100).toFixed(3)})" data-shiftbar></i></div>
              <div class="mo-ci-foot"><span>Worked <b data-worked>${Math.floor(worked / 3600)}h ${String(Math.floor(worked / 60) % 60).padStart(2, '0')}m</b></span><button class="mo-ci-out" data-act="eCheckout">Check out</button></div>`
            : `<button class="mo-ci-btn" data-go="ci-map"><span class="mo-ci-knob">${ic('fingerprint')}</span><span>${t('Check in')}</span><small>Inside geofence · 38 m</small></button>`}
        </section>
        <div class="mo-bento">
          <button class="mo-tile mo-tile-lg" data-go="leave"><span class="mo-ring" style="--p:${(st.bal.Annual / 20) * 100}"><b>${st.bal.Annual}</b></span><div><small>${t('Leave balance')}</small><b>${st.bal.Annual} days</b><span class="mo-muted">Annual · of 20</span></div></button>
          <button class="mo-tile" data-go="payslip"><span class="mo-tic green">${ic('wallet')}</span><small>${t('Next payday')}</small><b>31 Oct</b><span class="mo-muted">in 30 days</span></button>
          <button class="mo-tile" data-go="leave"><span class="mo-tic orange">${ic('hourglass')}</span><small>${t('Requests')}</small><b>${st.reqs.filter((r) => r.step < 4).length} pending</b><span class="mo-muted">Leave · advance</span></button>
          <button class="mo-tile mo-tile-wide" data-mt="inbox"><span class="mo-tic violet">${ic('megaphone')}</span><div><small>${t('News')}</small><b>Q3 town hall · Fri 3 PM</b><span class="mo-muted">Board room · live on Teams</span></div>${ic('chevron-right', 'mo-chev')}</button>
        </div>
        <div class="mo-sec-h"><b>${t('Shortcuts')}</b></div>
        <div class="mo-quick">
          <button data-act="eScan"><span class="mo-tic green">${ic('scan-line')}</span>Scan</button>
          <button data-go="payslip"><span class="mo-tic blue">${ic('file-text')}</span>Payslip</button>
          <button data-act="eAdvance"><span class="mo-tic yellow">${ic('hand-coins')}</span>Advance</button>
          <button data-act="eApplyLeave"><span class="mo-tic orange">${ic('plane')}</span>Leave</button>
        </div>
      </div>`;
    },
  };

  EMP.screens.attendance = {
    tab: 'attendance', skel: true,
    notes: [{ y: 0.22, t: 'Month at a glance', i: 'calendar-days' }, { y: 0.5, t: 'Every punch, GPS-stamped', i: 'map-pin' }],
    render(ph) {
      const st = ph.st;
      const week = [['M', 28, 'ok'], ['T', 29, 'late'], ['W', 30, 'ok'], ['T', 1, st.checkedIn ? 'ok' : 'today'], ['F', 2, ''], ['S', 3, 'half'], ['S', 4, 'off']];
      const log = [['Wed 30 Sep', '08:56', '18:07', '9h 11m', 'ok'], ['Tue 29 Sep', '09:02', '18:15', '9h 13m', 'fix'], ['Mon 28 Sep', '08:49', '18:02', '9h 13m', 'ok'], ['Sat 26 Sep', '09:00', '13:30', '4h 30m', 'ok'], ['Fri 25 Sep', '09:21', '18:10', '8h 49m', 'late']];
      return `<div class="mo-pad">${largeTitle(ph.t('Attendance'), `<span class="mo-pill">${ic('map-pin')}Lahore HQ</span>`, 'October 2026')}
        <div class="mo-week">${week.map(([d, n, s]) => `<span class="${s}${n === 1 ? ' cur' : ''}"><small>${d}</small><b>${n}</b><i></i></span>`).join('')}</div>
        <div class="mo-stats4">
          <div><b>20</b><small>Present</small></div><div><b>2</b><small>Late</small></div><div><b>1</b><small>Leave</small></div><div><b>0</b><small>Absent</small></div>
        </div>
        ${st.checkedIn ? `<div class="mo-card mo-row-card"><span class="mo-tic green">${ic('circle-check')}</span><div><b>Checked in at ${st.checkedIn}</b><small>Geofence ✓ · Face match 98% ✓</small></div></div>`
          : `<button class="mo-btn mo-btn-p mo-btn-block" data-go="ci-map">${ic('fingerprint')}Check in now</button>`}
        <div class="mo-sec-h"><b>Recent punches</b><button class="mo-link" data-act="eCorrection">Request correction</button></div>
        <div class="mo-card mo-list">${log.map(([d, i, o, h, s]) => `<div class="mo-li"><div><b>${d}</b><small>${i} → ${o}</small></div><span class="mo-sp"></span><span class="mo-tag ${s}">${s === 'ok' ? 'On time' : s === 'late' ? 'Late 21m' : 'Corrected'}</span><span class="mo-num">${h}</span></div>`).join('')}</div>
      </div>`;
    },
  };

  /* ---- check-in flow: map → selfie → success */
  const mapSVG = () => `<svg class="mo-map" viewBox="0 0 375 780" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <rect class="mm-bg" width="375" height="780"/>
    <path class="mm-water" d="M-20 610 C 80 580, 140 640, 230 600 S 340 560, 400 590 L400 640 C 330 610, 260 660, 220 650 S 70 640, -20 660Z"/>
    <rect class="mm-park" x="22" y="120" width="96" height="120" rx="14"/><rect class="mm-park" x="262" y="458" width="92" height="84" rx="14"/>
    ${[[140, 100, 90, 110], [250, 96, 110, 120], [22, 270, 110, 130], [150, 262, 70, 60], [260, 248, 100, 96], [22, 432, 110, 130], [150, 480, 92, 72], [250, 372, 110, 70], [22, 690, 160, 80], [205, 690, 160, 80], [150, 80, 90, 10]].map(([x, y, w, h]) => `<rect class="mm-block" x="${x}" y="${y}" width="${w}" height="${h}" rx="10"/>`).join('')}
    <path class="mm-road-c" d="M-10 250 L385 236"/><path class="mm-road-c" d="M136 -10 L146 800"/><path class="mm-road-c" d="M-10 456 C 120 450, 250 470, 385 440"/>
    <path class="mm-road" d="M-10 250 L385 236"/><path class="mm-road" d="M136 -10 L146 800"/><path class="mm-road" d="M-10 456 C 120 450, 250 470, 385 440"/>
    <path class="mm-road mm-minor" d="M242 -10 L244 680"/><path class="mm-road mm-minor" d="M-10 350 L385 352"/><path class="mm-road mm-minor" d="M-10 676 L385 676"/>
    <text class="mm-lbl" x="150" y="70" transform="rotate(87 150 70)">Ferozepur Road</text>
    <text class="mm-lbl" x="268" y="231">Kot Lakhpat</text>
    <text class="mm-lbl" x="30" y="628">Lahore Canal</text>
    <g class="mm-fence"><circle class="mm-pulse" cx="196" cy="352" r="96"/><circle class="mm-pulse mm-pulse-2" cx="196" cy="352" r="96"/><circle class="mm-zone" cx="196" cy="352" r="96"/></g>
    <g class="mm-hq" transform="translate(196 352)"><circle r="17" class="mm-hq-b"/><path class="mm-hq-i" d="M-6 6 V-3 L0 -7 L6 -3 V6 Z M-2 6 V1 H2 V6"/></g>
    <g class="mm-me" transform="translate(222 398)"><circle class="mm-acc" r="26"/><circle class="mm-me-r" r="9"/><circle class="mm-me-c" r="6"/></g>
  </svg>`;
  EMP.screens['ci-map'] = {
    tab: 'home', chrome: 'none',
    notes: [{ y: 0.2, t: 'Geofenced check-in', i: 'locate-fixed' }, { y: 0.45, t: 'Live GPS accuracy halo', i: 'navigation' }, { y: 0.82, t: 'Works offline, syncs later', i: 'wifi-off' }],
    render(ph) {
      return `<div class="mo-full">${mapSVG()}
        <div class="mo-map-top"><button class="mo-cbtn" data-back aria-label="Back">${ic('chevron-left')}</button><span class="mo-here">${ic('circle-check')}You're at Lahore HQ</span><button class="mo-cbtn" data-act="eRecenter" aria-label="Recenter">${ic('locate-fixed')}</button></div>
        <div class="mo-map-card">
          <div class="mo-grab-s"></div>
          <div class="mo-row-card"><span class="mo-tic green">${ic('building-2')}</span><div><b>Lahore HQ</b><small>42-B Industrial Estate, Kot Lakhpat</small></div></div>
          <div class="mo-mapstats"><div><small>Distance</small><b>38 m</b></div><div><small>Geofence</small><b>150 m</b></div><div><small>GPS</small><b>±6 m</b></div></div>
          <button class="mo-btn mo-btn-p mo-btn-block" data-go="ci-selfie">${ic('scan-face')}Continue to selfie</button>
          <small class="mo-fine">${ph.st.offline ? 'Offline — your punch will be queued and synced.' : 'Location is captured only at check-in and check-out.'}</small>
        </div></div>`;
    },
  };
  EMP.screens['ci-selfie'] = {
    tab: 'home', chrome: 'none', dark: true,
    notes: [{ y: 0.3, t: 'Face oval + liveness scan', i: 'scan-face' }, { y: 0.72, t: 'Blink check stops photo spoofing', i: 'eye' }],
    render(ph) {
      return `<div class="mo-full mo-cam">
        <div class="mo-cam-top"><button class="mo-cbtn dark" data-back aria-label="Back">${ic('x')}</button><span class="mo-cam-t">Verify it's you</span><span class="mo-cbtn ghost"></span></div>
        <div class="mo-face"><div class="mo-face-in">
          <svg viewBox="0 0 220 290" class="mo-face-art" aria-hidden="true"><ellipse cx="110" cy="128" rx="58" ry="72" class="fa-skin"/><path d="M52 118c-6-56 30-84 58-84 34 0 66 22 60 82-6-22-20-34-36-38-20 10-48 10-82 40z" class="fa-hair"/><ellipse cx="88" cy="128" rx="5" ry="3.4" class="fa-eye"/><ellipse cx="132" cy="128" rx="5" ry="3.4" class="fa-eye"/><path d="M96 168c8 6 20 6 28 0" class="fa-mouth"/><path d="M14 290c8-50 46-78 96-78s88 28 96 78z" class="fa-body"/></svg>
          <i class="mo-scanline"></i></div>
          <svg class="mo-face-ring" viewBox="0 0 240 310" aria-hidden="true"><ellipse cx="120" cy="155" rx="114" ry="149" class="fr-base"/><ellipse cx="120" cy="155" rx="114" ry="149" class="fr-prog" pathLength="100"/></svg>
        </div>
        <div class="mo-cam-hint" data-hint>${ph.static ? 'Blink once' : 'Position your face in the oval'}</div>
        <div class="mo-cam-steps"><span class="${ph.static ? 'ok' : ''}" data-s="1">${ic('check')}Face found</span><span data-s="2">${ic('eye')}Blink</span><span data-s="3">${ic('shield-check')}Match</span></div>
        <div class="mo-cam-bar"><span class="mo-cbtn dark">${ic('image')}</span><button class="mo-shutter" data-act="eSnap" aria-label="Capture"><i></i></button><span class="mo-cbtn dark">${ic('refresh-cw')}</span></div>
      </div>`;
    },
    mount(ph, el) {
      const T = [];
      const hint = $('[data-hint]', el), stp = (n) => $(`[data-s="${n}"]`, el).classList.add('ok');
      const go = () => { if (!ph.st.checkedIn) { ph.st.checkedIn = clockStr(ph.st.clock, false); ph.st.ciAt = ph.st.clock; } el.classList.add('done'); hint.textContent = 'Verified · 98% match'; stp(3); ph.haptic(); T.push(setTimeout(() => ph.top().sid === 'ci-selfie' && ph.push('ci-done'), 650)); };
      T.push(setTimeout(() => { stp(1); hint.textContent = 'Hold still…'; el.classList.add('p1'); }, 600));
      T.push(setTimeout(() => { hint.textContent = 'Blink once'; el.classList.add('p2'); }, 1300));
      T.push(setTimeout(() => { stp(2); el.classList.add('p3'); hint.textContent = 'Checking match…'; }, 2100));
      T.push(setTimeout(go, 2700));
      ph._snap = () => { T.forEach(clearTimeout); stp(1); stp(2); el.classList.add('p3'); go(); };
      return () => T.forEach(clearTimeout);
    },
  };
  EMP.screens['ci-done'] = {
    tab: 'home', chrome: 'none',
    notes: [{ y: 0.27, t: 'Haptic tick + burst', i: 'sparkles' }, { y: 0.62, t: 'Proof of punch, timestamped', i: 'badge-check' }],
    render(ph) {
      const t = ph.st.checkedIn || '09:04';
      return `<div class="mo-full mo-done">
        <div class="mo-burst"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>
          <svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="52" class="bu-c" pathLength="100"/><path d="M38 61l15 15 30-32" class="bu-k" pathLength="100"/></svg></div>
        <small class="mo-eyebrow">Checked in</small>
        <div class="mo-done-time">${t}<span>AM</span></div>
        <p class="mo-muted">Thursday, 1 Oct 2026 · Lahore HQ</p>
        <div class="mo-card mo-list mo-done-list">
          <div class="mo-li">${ic('map-pin', 'mo-ok-i')}<b>Location verified</b><span class="mo-sp"></span><span class="mo-muted">38 m</span></div>
          <div class="mo-li">${ic('scan-face', 'mo-ok-i')}<b>Face match</b><span class="mo-sp"></span><span class="mo-muted">98%</span></div>
          <div class="mo-li">${ic('clock-3', 'mo-ok-i')}<b>Shift · General</b><span class="mo-sp"></span><span class="mo-tag ok">On time</span></div>
          ${ph.st.offline ? `<div class="mo-li">${ic('wifi-off', 'mo-ok-i')}<b>Saved offline</b><span class="mo-sp"></span><span class="mo-muted">will sync</span></div>` : ''}
        </div>
        <div class="mo-done-foot"><button class="mo-btn mo-btn-p mo-btn-block" data-act="eCiDone">Done</button></div>
      </div>`;
    },
    mount(ph) { const t = setTimeout(() => ph.haptic(), 380); return () => clearTimeout(t); },
  };

  /* ---- leave */
  EMP.screens.leave = {
    tab: 'home', back: 'Home', title: 'Leave', skel: true,
    notes: [{ y: 0.24, t: 'Balances as rings', i: 'circle-dot' }, { y: 0.62, t: 'Status tracker per request', i: 'git-commit-horizontal' }],
    render(ph) {
      const st = ph.st, tot = { Annual: 20, Casual: 10, Sick: 8 }, tone = { Annual: 'green', Casual: 'orange', Sick: 'blue' };
      const steps = ['Submitted', 'Manager', 'HR', 'Approved'];
      return `${navBar('Leave', 'Home', `<button class="mo-ibtn sm" data-act="eApplyLeave" aria-label="Apply leave">${ic('plus')}</button>`)}
      <div class="mo-pad mo-under-nav">
        <div class="mo-bal3">${Object.keys(tot).map((k) => `<div class="mo-bal ${tone[k]}"><span class="mo-ring" style="--p:${(st.bal[k] / tot[k]) * 100}"><b>${st.bal[k]}</b></span><b>${k}</b><small>of ${tot[k]} days</small></div>`).join('')}</div>
        <button class="mo-btn mo-btn-p mo-btn-block" data-act="eApplyLeave">${ic('calendar-plus')}Apply for leave</button>
        <div class="mo-sec-h"><b>My requests</b><span class="mo-muted">${st.reqs.length}</span></div>
        <div class="mo-reqs">${st.reqs.map((r, i) => `<div class="mo-card mo-req${r.fresh ? ' mo-flash' : ''}" style="--i:${i}">
            <div class="mo-req-h"><span class="mo-tic ${tone[r.type] || 'violet'}">${ic('plane')}</span><div><b>${r.type} leave · ${r.days} day${r.days > 1 ? 's' : ''}</b><small>${r.range} · ${r.id}</small></div><span class="mo-sp"></span><span class="mo-tag ${r.step >= 4 ? 'ok' : 'wait'}">${r.status}</span></div>
            <div class="mo-track" style="--n:${r.step}">${steps.map((s, k) => `<span class="${k < r.step ? 'done' : k === r.step ? 'cur' : ''}"><i>${k < r.step ? ic('check') : ''}</i><small>${s}</small></span>`).join('')}</div>
          </div>`).join('')}</div>
      </div>`;
    },
  };

  /* ---- payslip */
  const PAY = { earn: [['Basic salary', 110000], ['House rent', 44000], ['Utilities', 11000], ['Conveyance', 10000], ['Sales commission', 10000]], ded: [['Income tax u/s 149', 10050], ['Provident fund 10%', 11000], ['EOBI', 400], ['Advance recovery', 10000]] };
  EMP.screens.payslip = {
    tab: 'home', back: 'Home', title: 'Payslip', skel: true,
    notes: [{ y: 0.22, t: 'Net pay hero, muted decimals', i: 'wallet' }, { y: 0.55, t: 'Earnings / deductions accordion', i: 'list' }, { y: 0.9, t: 'Share PDF to WhatsApp', i: 'share-2' }],
    render() {
      const g = PAY.earn.reduce((a, x) => a + x[1], 0), d = PAY.ded.reduce((a, x) => a + x[1], 0);
      const acc = (k, title, rows, tot, open) => `<div class="mo-acc${open ? ' open' : ''}"><button class="mo-acc-h" data-act="eAcc">${ic(k === 'e' ? 'trending-up' : 'trending-down', 'mo-acc-i ' + k)}<b>${title}</b><span class="mo-sp"></span><span class="mo-num">${mny(tot, 0)}</span>${ic('chevron-down', 'mo-chev')}</button>
        <div class="mo-acc-b"><div>${rows.map(([n, v]) => `<div class="mo-li"><span>${n}</span><span class="mo-sp"></span><span class="mo-num">${fmt(v)}</span></div>`).join('')}</div></div></div>`;
      return `${navBar('Payslip', 'Home', `<button class="mo-ibtn sm" data-act="eSharePay" aria-label="Share">${ic('share')}</button>`)}
      <div class="mo-pad mo-under-nav">
        <div class="mo-segm" role="tablist"><button class="on" data-act="eMonth">Sep 2026</button><button data-act="eMonth">Aug</button><button data-act="eMonth">Jul</button></div>
        <div class="mo-net">
          <small>Net pay · September 2026</small>
          <div class="mo-big">${mny(g - d)}</div>
          <div class="mo-net-meta"><span class="mo-gchip">${ic('landmark')}HBL ••4417</span><span>Paid 30 Sep</span></div>
          <div class="mo-split"><i style="flex:${g - d}"></i><i style="flex:${d}"></i></div>
          <div class="mo-split-l"><span><i class="a"></i>Take-home ${Math.round(((g - d) / g) * 100)}%</span><span><i class="b"></i>Deductions ${Math.round((d / g) * 100)}%</span></div>
        </div>
        ${acc('e', 'Earnings', PAY.earn, g, true)}${acc('d', 'Deductions', PAY.ded, d, false)}
        <div class="mo-card mo-row-card mo-ytd"><span class="mo-tic blue">${ic('chart-column')}</span><div><b>Tax year to date</b><small>FY 2026-27 · Rs 30,150 withheld</small></div><span class="mo-sp"></span>${ic('chevron-right', 'mo-chev')}</div>
        <button class="mo-btn mo-btn-p mo-btn-block" data-act="eSharePay">${ic('share-2')}Share PDF</button>
      </div>`;
    },
  };

  /* ---- expense scan */
  const OCR = [['Merchant', "Salt'n Pepper Village"], ['Date', 'Wed, 30 Sep 2026'], ['Amount', 'Rs 4,850.00'], ['Category', 'Client meals']];
  EMP.screens.scan = {
    tab: 'home', chrome: 'none', dark: true,
    notes: [{ y: 0.3, t: 'Corner guides + laser line', i: 'scan-line' }, { y: 0.62, t: 'OCR fills fields one by one', i: 'sparkles' }, { y: 0.9, t: 'Optimistic submit + Undo', i: 'undo-2' }],
    render(ph) {
      const s = ph.static;
      const receipt = `<div class="mo-rcpt"><b>SALT'N PEPPER</b><small>Village · MM Alam Rd</small><hr>${[['Chicken Karahi', '2,150'], ['Daal Makhni', '780'], ['Naan × 6', '360'], ['Mint Margarita × 3', '960'], ['Service', '600']].map(([a, b]) => `<p><span>${a}</span><span>${b}</span></p>`).join('')}<hr><p class="t"><span>TOTAL</span><span>4,850</span></p><small>30-09-2026 · 14:22 · FBR POS #87412</small><i class="mo-qr"></i></div>`;
      return `<div class="mo-full mo-scan${s ? ' st-read st-fields' : ''}">
        <div class="mo-cam-top"><button class="mo-cbtn dark" data-back aria-label="Close">${ic('x')}</button><span class="mo-cam-t" data-scan-t>${s ? 'Review expense' : 'Scan receipt'}</span><button class="mo-cbtn dark" data-act="eFlash" aria-label="Flash">${ic('zap')}</button></div>
        <div class="mo-vf"><div class="mo-vf-in">${receipt}<i class="mo-laser"></i><i class="mo-flashfx"></i></div><span class="mo-corner tl"></span><span class="mo-corner tr"></span><span class="mo-corner bl"></span><span class="mo-corner br"></span></div>
        <div class="mo-cam-hint mo-scan-hint">Align the receipt inside the frame</div>
        <div class="mo-cam-bar mo-scan-bar"><span class="mo-cbtn dark">${ic('image')}</span><button class="mo-shutter" data-act="eShoot" aria-label="Capture receipt"><i></i></button><span class="mo-cbtn dark">${ic('files')}</span></div>
        <div class="mo-ocr">
          <div class="mo-ocr-h"><span class="mo-spin"></span><b data-ocr-t>${s ? 'Receipt read · 98% confidence' : 'Reading receipt…'}</b></div>
          ${OCR.map(([k, v], i) => `<div class="mo-field${s ? ' filled' : ''}" data-f="${i}"><small>${k}</small><b data-v="${esc(v)}">${s ? esc(v) : ''}</b><i class="mo-shim"></i>${i === 3 ? `<span class="mo-tag ok">${ic('sparkles')}Auto</span>` : ''}</div>`).join('')}
          <div class="mo-field-row"><span class="mo-pchip on">${ic('smartphone')}JazzCash</span><span class="mo-pchip">Easypaisa</span><span class="mo-pchip">Bank</span></div>
          <button class="mo-btn mo-btn-p mo-btn-block" data-act="eSubmitExp" ${s ? '' : 'disabled'}>Submit expense</button>
        </div>
      </div>`;
    },
    mount(ph, el) {
      const T = [], root = $('.mo-scan', el);
      const shoot = () => {
        if (root.classList.contains('st-read')) return;
        T.forEach(clearTimeout); ph.haptic();
        root.classList.add('st-shot');
        T.push(setTimeout(() => { root.classList.add('st-read'); $('[data-scan-t]', el).textContent = 'Review expense'; }, 260));
        OCR.forEach((x, i) => T.push(setTimeout(() => typeIn($(`[data-f="${i}"]`, el)), 1300 + i * 520)));
        T.push(setTimeout(() => { root.classList.add('st-fields'); $('[data-ocr-t]', el).textContent = 'Receipt read · 98% confidence'; $('[data-act="eSubmitExp"]', el).disabled = false; ph.haptic(); }, 1300 + OCR.length * 520 + 200));
      };
      const typeIn = (f) => {
        if (!f) return; f.classList.add('filled'); const b = $('b', f), v = b.dataset.v; let i = 0;
        if (RM()) { b.textContent = v; return; }
        const tm = setInterval(() => { b.textContent = v.slice(0, ++i); if (i >= v.length) clearInterval(tm); }, 22); T.push(setTimeout(() => clearInterval(tm), 2000));
      };
      ph._shoot = shoot;
      T.push(setTimeout(() => $('.mo-scan-hint', el) && ($('.mo-scan-hint', el).textContent = 'Hold steady · auto-capture'), 1100));
      T.push(setTimeout(shoot, 2600));
      return () => T.forEach(clearTimeout);
    },
  };

  /* ---- inbox (swipe to archive + pull to refresh) */
  const inboxRow = (x, i) => `<div class="mo-swipe${x.isNew ? ' mo-flash' : ''}" data-id="${x.id}" style="--i:${i}"><div class="mo-swipe-bg">${ic('archive')}<span>Archive</span></div>
      <div class="mo-swipe-fg${x.unread ? ' unread' : ''}"><span class="mo-tic ${x.tone}">${ic(x.ic)}</span><div class="mo-in-t"><b>${x.t}</b><small>${x.s}</small></div><span class="mo-in-ago">${x.ago}${x.unread ? '<i></i>' : ''}</span></div></div>`;
  EMP.screens.inbox = {
    tab: 'inbox', skel: true,
    notes: [{ y: 0.16, t: 'Pull down to refresh', i: 'refresh-cw' }, { y: 0.4, t: 'Swipe left to archive', i: 'archive' }, { y: 0.7, t: 'Undo snackbar, no dialogs', i: 'undo-2' }],
    render(ph) {
      const st = ph.st;
      return `<div class="mo-ptr"><span class="mo-ptr-sp">${ic('refresh-cw')}</span></div><div class="mo-pad mo-ptr-body">${largeTitle(ph.t('Inbox'), `<button class="mo-link" data-act="eReadAll">Mark all read</button>`, `${st.inbox.filter((x) => x.unread).length} unread`)}
        <div class="mo-hint-row">${ic('hand')}<span>Swipe left to archive · pull down to refresh</span></div>
        <div class="mo-inbox">${st.inbox.length ? st.inbox.map(inboxRow).join('') : `<div class="mo-empty">${ic('inbox')}<b>Inbox zero</b><small>Nothing needs you right now.</small></div>`}</div></div>`;
    },
    mount(ph, view) { return gestureInbox(ph, view); },
  };

  /* ---- me */
  EMP.screens.me = {
    tab: 'me', skel: true,
    notes: [{ y: 0.18, t: 'Profile & employee card', i: 'id-card' }, { y: 0.66, t: 'Biometric login', i: 'scan-face' }, { y: 0.86, t: 'English / اردو', i: 'languages' }],
    render(ph) {
      const st = ph.st, t = ph.t;
      return `<div class="mo-pad">${largeTitle(t('Me'))}
        <div class="mo-card mo-prof"><span class="mo-av lg">BK</span><div><b>Bilal Khan</b><small>Sales Executive · EMP-0042</small><span class="mo-pill">${ic('map-pin')}Lahore HQ · Sales</span></div></div>
        <div class="mo-sec-h"><b>${t('Documents')}</b></div>
        <div class="mo-card mo-list">${[['file-text', 'Salary certificate', 'PDF · Sep 2026'], ['file-badge', 'Tax certificate FY 2025-26', 'PDF · u/s 149'], ['id-card', 'CNIC copy', 'Verified']].map(([i, a, b]) => `<button class="mo-li" data-act="eDoc"><span class="mo-tic blue">${ic(i)}</span><div><b>${a}</b><small>${b}</small></div><span class="mo-sp"></span>${ic('download', 'mo-chev')}</button>`).join('')}</div>
        <div class="mo-sec-h"><b>${t('Settings')}</b></div>
        <div class="mo-card mo-list">
          <div class="mo-li"><span class="mo-tic green">${ic('scan-face')}</span><div><b>${t('Face ID login')}</b><small>Unlock with your face</small></div><span class="mo-sp"></span>${sw(st.faceId, 'eFace', 'Face ID login')}</div>
          <div class="mo-li"><span class="mo-tic orange">${ic('bell-ring')}</span><div><b>${t('Notifications')}</b><small>Payslips, approvals, news</small></div><span class="mo-sp"></span>${sw(st.notif, 'eNotif', 'Notifications')}</div>
          <div class="mo-li"><span class="mo-tic violet">${ic('wifi-off')}</span><div><b>${t('Work offline')}</b><small>Simulate no signal</small></div><span class="mo-sp"></span>${sw(st.offline, 'eOffline', 'Work offline')}</div>
          <div class="mo-li"><span class="mo-tic blue">${ic('languages')}</span><div><b>${t('Language')}</b></div><span class="mo-sp"></span><div class="mo-segm sm"><button class="${st.lang === 'en' ? 'on' : ''}" data-act="eLang" data-l="en">English</button><button class="${st.lang === 'ur' ? 'on' : ''}" data-act="eLang" data-l="ur" lang="ur">اردو</button></div></div>
          <button class="mo-li" data-go="lock"><span class="mo-tic green">${ic('lock')}</span><div><b>${t('Lock app')}</b><small>Preview biometric unlock</small></div><span class="mo-sp"></span>${ic('chevron-right', 'mo-chev')}</button>
        </div>
        <button class="mo-btn mo-btn-g mo-btn-block mo-signout" data-act="eSignout">${ic('log-out')}${t('Sign out')}</button>
        <p class="mo-fine center">Finsoft Mobile 3.2.0 · Al-Noor Enterprises</p>
      </div>`;
    },
  };
  EMP.screens.lock = {
    tab: 'me', chrome: 'none', dark: true,
    notes: [{ y: 0.42, t: 'Face ID / fingerprint unlock', i: 'scan-face' }],
    render() {
      return `<div class="mo-full mo-lock"><span class="brandmark mo-lock-mark">${ic('activity')}</span><b>Finsoft</b><small>Al-Noor Enterprises</small>
        <div class="mo-faceid"><svg viewBox="0 0 80 80" aria-hidden="true"><path class="fi-c" d="M6 24V14a8 8 0 0 1 8-8h10M56 6h10a8 8 0 0 1 8 8v10M74 56v10a8 8 0 0 1-8 8H56M24 74H14a8 8 0 0 1-8-8V56"/><path class="fi-f" d="M28 30v6M52 30v6M40 30v14h-4M30 54c6 5 14 5 20 0"/><path class="fi-k" d="M24 41l11 11 22-24" pathLength="100"/></svg></div>
        <p data-lock-t>Unlocking with Face ID…</p><button class="mo-link light" data-back>Use passcode</button></div>`;
    },
    mount(ph, el) {
      const T = [setTimeout(() => { el.classList.add('ok'); $('[data-lock-t]', el).textContent = 'Welcome back, Bilal'; ph.haptic(); }, 1300), setTimeout(() => ph.top().sid === 'lock' && ph.pop(), 2300)];
      return () => T.forEach(clearTimeout);
    },
  };

  /* ---- employee actions */
  Object.assign(EMP.acts, {
    eCiDone(ph) { if (ph.stack[0].sid === 'home') ph.popToRoot(); else ph.tab('home'); setTimeout(() => ph.snack(`Checked in at ${ph.st.checkedIn} · have a great day`, { icon: 'circle-check' }), 450); },
    eCheckout(ph) { ph.snack('Check-out opens after 18:00 · you can still log a field visit', { icon: 'info' }); },
    eRecenter(ph) { ph.haptic(); const g = $('.mm-me', ph.top().el); if (g && !RM()) g.animate([{ opacity: .3 }, { opacity: 1 }], { duration: 400 }); },
    eSnap(ph) { ph._snap && ph._snap(); },
    eShoot(ph) { ph._shoot && ph._shoot(); },
    eFlash(ph, b) { b.classList.toggle('on'); },
    eScan(ph) { ph.closeSheet(); ph.push('scan'); },
    eSubmitExp(ph) {
      ph.pop(); ph.st.scanned++;
      ph.snack('Expense Rs 4,850 submitted for approval', { icon: 'receipt', undo: () => { ph.st.scanned--; ph.snack('Expense withdrawn', { icon: 'undo-2' }); } });
    },
    eAcc(ph, b) { b.parentElement.classList.toggle('open'); },
    eMonth(ph, b) { $$('button', b.parentElement).forEach((x) => x.classList.toggle('on', x === b)); ph.skel(ph.top().el); },
    eSharePay(ph) { shareSheet(ph, 'Payslip_Sep-2026.pdf', 'Payslip PDF'); },
    eDoc(ph, b) { ph.snack(`${$('b', b).textContent} downloaded`, { icon: 'download' }); },
    eFace(ph, b) { ph.st.faceId = toggleSw(ph, b); ph.snack(ph.st.faceId ? 'Face ID login enabled' : 'Face ID login off', { icon: 'scan-face' }); },
    eNotif(ph, b) { ph.st.notif = toggleSw(ph, b); },
    eOffline(ph, b) { ph.st.offline = toggleSw(ph, b); ph.snack(ph.st.offline ? 'Offline mode · actions will queue and sync' : 'Back online · 2 actions synced', { icon: ph.st.offline ? 'wifi-off' : 'wifi' }); },
    eLang(ph, b) { ph.st.lang = b.dataset.l; ph.refreshTop(); ph.relabel(); ph.haptic(); },
    eSignout(ph) { ph.snack('Demo mode — you stay signed in', { icon: 'info' }); },
    eReadAll(ph) { ph.st.inbox.forEach((x) => (x.unread = false)); ph.refreshTop(); ph.badges(); },
    eApplyLeave(ph) { leaveSheet(ph); },
    eAdvance(ph) { advanceSheet(ph); },
    eCorrection(ph) { correctionSheet(ph); },
  });

  function toggleSw(ph, b) { const on = !b.classList.contains('on'); b.classList.toggle('on', on); b.setAttribute('aria-checked', on); ph.haptic(); return on; }

  /* sheets: leave · advance · correction · share */
  function leaveSheet(ph) {
    const st = ph.st; let type = 'Annual', a = 14, b = 16;
    const days = () => { let n = 0; for (let d = a; d <= b; d++) if ((d + 3) % 7 !== 0) n++; return n; }; // Oct 1 = Thu → Sun when (d+3)%7==0
    const cal = () => { let h = '<div class="mo-cal-h">' + ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((x) => `<small>${x}</small>`).join('') + '</div><div class="mo-cal">'; for (let i = 0; i < 3; i++) h += '<span></span>'; for (let d = 1; d <= 31; d++) { const sun = (d + 3) % 7 === 0, past = d < 2; h += `<button class="${sun ? 'off ' : ''}${past ? 'past ' : ''}${d === a ? 'a ' : ''}${d === b ? 'b ' : ''}${d > a && d < b ? 'in' : ''}" data-d="${d}" ${past ? 'disabled' : ''}>${d}</button>`; } return h + '</div>'; };
    const sh = ph.sheet({
      title: 'Apply leave', sub: 'October 2026',
      html: `<div class="mo-chips" data-types>${Object.keys(st.bal).concat('Unpaid').map((k) => `<button class="mo-pchip${k === type ? ' on' : ''}" data-ty="${k}">${k}${st.bal[k] != null ? ` <small>${st.bal[k]}</small>` : ''}</button>`).join('')}</div>
        <div class="mo-range"><div><small>From</small><b data-from>Wed, 14 Oct</b></div>${ic('arrow-right')}<div><small>To</small><b data-to>Fri, 16 Oct</b></div><div class="mo-days"><b data-days>3</b><small>working days</small></div></div>
        <div data-cal>${cal()}</div>
        <label class="mo-input"><small>Reason (optional)</small><input type="text" placeholder="Family wedding in Multan" value="Family wedding in Multan"></label>`,
      foot: `<button class="mo-btn mo-btn-p mo-btn-block" data-submit>Submit request</button>`,
    });
    const dn = (d) => ['Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed'][(d - 1) % 7] + ', ' + d + ' Oct';
    let pick = 0;
    const upd = () => { $('[data-cal]', sh).innerHTML = cal(); $('[data-from]', sh).textContent = dn(a); $('[data-to]', sh).textContent = dn(b); const el = $('[data-days]', sh); el.textContent = days(); if (!RM()) el.animate([{ transform: 'scale(1.35)' }, { transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.34,1.56,.64,1)' }); };
    sh.addEventListener('click', (e) => {
      const ty = e.target.closest('[data-ty]'); if (ty) { type = ty.dataset.ty; $$('[data-ty]', sh).forEach((x) => x.classList.toggle('on', x === ty)); ph.haptic(); }
      const d = e.target.closest('[data-d]'); if (d && !d.disabled) { const v = +d.dataset.d; if (pick === 0 || v < a) { a = b = v; pick = 1; } else { b = v; pick = 0; } upd(); }
      if (e.target.closest('[data-submit]')) {
        const n = days(), r = { id: 'LV-' + (120 + st.reqs.length), type, range: a === b ? `${a} Oct` : `${a} – ${b} Oct`, days: n, step: 1, status: 'Submitted', fresh: true };
        st.reqs.unshift(r); if (st.bal[type] != null) st.bal[type] -= n;
        ph.closeSheet();
        if (ph.top().sid !== 'leave') ph.push('leave'); else ph.refreshTop();
        setTimeout(() => { r.fresh = false; }, 1200);
        ph.snack(`${type} leave sent · ${n} day${n > 1 ? 's' : ''}`, { icon: 'send', undo: () => { st.reqs.splice(st.reqs.indexOf(r), 1); if (st.bal[type] != null) st.bal[type] += n; ph.refreshTop(); } });
      }
    });
  }
  function advanceSheet(ph) {
    let amt = 50000, m = 3;
    const sh = ph.sheet({
      title: 'Request advance', sub: 'Recovered from salary, no interest',
      html: `<div class="mo-amt"><small>Amount</small><div class="mo-big sm" data-amt>${mny(amt, 0)}</div></div>
        <div class="mo-chips" data-a>${[25000, 50000, 75000].map((v) => `<button class="mo-pchip${v === amt ? ' on' : ''}" data-v="${v}">Rs ${fmt(v)}</button>`).join('')}</div>
        <small class="mo-lbl">Recover over</small><div class="mo-segm" data-m>${[1, 3, 6].map((v) => `<button class="${v === m ? 'on' : ''}" data-mm="${v}">${v} month${v > 1 ? 's' : ''}</button>`).join('')}</div>
        <div class="mo-card mo-row-card"><span class="mo-tic blue">${ic('calendar')}</span><div><small>Monthly deduction</small><b data-mon>Rs ${fmt(Math.round(amt / m))}</b></div><span class="mo-sp"></span><span class="mo-tag ok">Eligible</span></div>
        <small class="mo-lbl">Disburse to</small><div class="mo-chips" data-w><button class="mo-pchip on">${ic('smartphone')}JazzCash</button><button class="mo-pchip">Easypaisa</button><button class="mo-pchip">HBL ••4417</button></div>`,
      foot: `<button class="mo-btn mo-btn-p mo-btn-block" data-submit>Send to HR</button>`,
    });
    const upd = () => { $('[data-amt]', sh).innerHTML = mny(amt, 0); $('[data-mon]', sh).textContent = 'Rs ' + fmt(Math.round(amt / m)); };
    sh.addEventListener('click', (e) => {
      const v = e.target.closest('[data-v]'); if (v) { amt = +v.dataset.v; $$('[data-v]', sh).forEach((x) => x.classList.toggle('on', x === v)); upd(); ph.haptic(); }
      const mm = e.target.closest('[data-mm]'); if (mm) { m = +mm.dataset.mm; $$('[data-mm]', sh).forEach((x) => x.classList.toggle('on', x === mm)); upd(); }
      const w = e.target.closest('[data-w] .mo-pchip'); if (w) $$('[data-w] .mo-pchip', sh).forEach((x) => x.classList.toggle('on', x === w));
      if (e.target.closest('[data-submit]')) { ph.closeSheet(); ph.snack(`Advance of Rs ${fmt(amt)} requested`, { icon: 'hand-coins', undo: () => ph.snack('Request withdrawn', { icon: 'undo-2' }) }); }
    });
  }
  function correctionSheet(ph) {
    const sh = ph.sheet({
      title: 'Attendance correction', sub: 'Goes to Zainab Raza for approval',
      html: `<small class="mo-lbl">Day</small><div class="mo-chips" data-g="d"><button class="mo-pchip">Mon 28</button><button class="mo-pchip on">Tue 29</button><button class="mo-pchip">Wed 30</button></div>
        <div class="mo-2col"><label class="mo-input"><small>Check in</small><input type="time" value="09:02"></label><label class="mo-input"><small>Check out</small><input type="time" value="18:15"></label></div>
        <small class="mo-lbl">Reason</small><div class="mo-chips" data-g="r"><button class="mo-pchip on">Forgot to punch</button><button class="mo-pchip">Field visit</button><button class="mo-pchip">Device issue</button></div>`,
      foot: `<button class="mo-btn mo-btn-p mo-btn-block" data-submit>Submit correction</button>`,
    });
    sh.addEventListener('click', (e) => {
      const c = e.target.closest('[data-g] .mo-pchip'); if (c) $$('.mo-pchip', c.parentElement).forEach((x) => x.classList.toggle('on', x === c));
      if (e.target.closest('[data-submit]')) { ph.closeSheet(); ph.snack('Correction for Tue 29 Sep submitted', { icon: 'clock-3', undo: () => {} }); }
    });
  }
  function shareSheet(ph, file, label, onPick) {
    const opts = [['wa', 'message-circle', 'WhatsApp'], ['mail', 'mail', 'Email'], ['link', 'link', 'Copy link'], ['save', 'folder-down', 'Save']];
    const sh = ph.sheet({
      title: 'Share', sub: file, cls: 'mo-share',
      html: `<div class="mo-file"><span class="mo-pdf">PDF</span><div><b>${file}</b><small>${label} · 84 KB</small></div></div>
        <div class="mo-share-row">${opts.map(([k, i, l]) => `<button data-k="${k}"><span class="mo-sh-ic ${k}">${ic(i)}</span><small>${l}</small></button>`).join('')}</div>`,
    });
    sh.addEventListener('click', (e) => {
      const b = e.target.closest('[data-k]'); if (!b) return;
      const k = b.dataset.k; ph.closeSheet(); ph.haptic();
      if (onPick) return onPick(k);
      ph.snack({ wa: `${label} sent on WhatsApp ✓✓`, mail: `${label} emailed`, link: 'Secure link copied · expires in 7 days', save: 'Saved to Files' }[k], { icon: k === 'link' ? 'copy' : 'check' });
    });
  }

  /* ============================================================ OWNER APP */
  const SALES = {
    today: { v: 1842500, d: '+8.4% vs last Thu', data: [12, 18, 16, 24, 31, 28, 36, 42, 39, 47, 52, 61], lbl: ['9am', '12pm', '3pm', 'now'] },
    week: { v: 11740300, d: '+5.1% vs last week', data: [12, 16, 14, 19, 21, 17, 18.4], lbl: ['Fri', 'Sun', 'Tue', 'Thu'] },
    month: { v: 46980000, d: '+12.3% vs August', data: [9, 11, 10, 14, 12, 15, 13, 16, 18, 15, 17, 19, 21, 18, 22, 20, 23, 25, 22, 26, 24, 27, 29, 26, 30, 31, 28, 33, 35, 34], lbl: ['1 Sep', '10', '20', '30 Sep'] },
  };
  const CARDS = () => [
    { id: 'pv', type: 'Payment voucher', icon: 'banknote', tone: 'blue', title: 'Siemens Pakistan', amt: 1240000, ref: 'BPV-2026-000318', meta: [['Pay from', 'Meezan 0123'], ['Requested by', 'Hira Ali'], ['Due', 'Sat, 3 Oct']], note: 'Final 30% for LV switchgear panels. GRN and bill matched.', tags: ['3-way matched', 'Within budget'] },
    { id: 'po', type: 'Purchase order', icon: 'shopping-cart', tone: 'violet', title: 'Habib Packaging', amt: 842000, ref: 'PO-2026-000418', meta: [['Items', '5-ply cartons × 7,500'], ['Requested by', 'Usman Ali'], ['Delivery', 'Thu, 8 Oct']], note: 'Restock ahead of Engro Foods order. Price 4% below last PO.', tags: ['Preferred vendor', '−4% price'] },
    { id: 'lv', type: 'Leave request', icon: 'plane', tone: 'orange', title: 'Bilal Khan', amt: null, big: '3 days', ref: 'Annual · 14 – 16 Oct', meta: [['Balance after', '11 days'], ['Cover', 'Imran Siddiqui'], ['Team away', '1 of 6']], note: 'Family wedding in Multan.', tags: ['No clash'] },
    { id: 'ex', type: 'Expense claim', icon: 'receipt', tone: 'green', title: 'Zainab Raza', amt: 18400, ref: 'EXP-2026-000233', meta: [['Category', 'Travel · Karachi'], ['Receipts', '3 attached'], ['Pay via', 'JazzCash']], note: 'Client visit to Engro Foods HQ, 2 nights.', tags: ['Policy OK'] },
    { id: 'adv', type: 'Salary advance', icon: 'hand-coins', tone: 'yellow', title: 'Kashif Ali', amt: 50000, ref: 'ADV-2026-000041', meta: [['Recover over', '3 months'], ['Monthly', 'Rs 16,667'], ['Previous', 'None']], note: 'Medical expenses for family.', tags: ['First request'] },
  ];
  const AGE = [['0 – 30 days', 2910000, 'a'], ['31 – 60 days', 1587090, 'b'], ['61 – 90 days', 970000, 'c'], ['90+ days', 900000, 'd']];
  const OVERDUE = [['CUST-0002', 47, 'SI', 'INV-2026-000812'], ['CUST-0006', 64, 'SI', 'INV-2026-000774'], ['CUST-0009', 38, 'SI', 'INV-2026-000839'], ['CUST-0008', 21, '', 'INV-2026-000902'], ['CUST-0001', 12, '', 'INV-2026-000955']];
  const ownState = () => ({ period: 'today', cards: CARDS(), done: [], sent: {} });

  const OWN = {
    key: 'own', name: 'Owner app', who: 'Ahmed Raza',
    tabs: [{ id: 'ohome', icon: 'house', label: 'Home' }, { id: 'approvals', icon: 'stamp', label: 'Approvals', badge: true }, { id: 'recv', icon: 'hand-coins', label: 'Receivables' }, { id: 'more', icon: 'layout-grid', label: 'More', badge: true }],
    fab: [
      { act: 'oInvoice', icon: 'file-plus-2', tone: 'green', label: 'Quick invoice', sub: 'Share on WhatsApp' },
      { act: 'oPayment', icon: 'circle-dollar-sign', tone: 'blue', label: 'Record payment', sub: 'JazzCash · bank · cash' },
      { act: 'oExpense', icon: 'receipt', tone: 'orange', label: 'Add expense', sub: 'Snap or type' },
      { act: 'oApproveAll', icon: 'check-check', tone: 'violet', label: 'Approve all', sub: 'With Face ID' },
    ],
    badge: (st) => ({ approvals: st.cards.length, more: 4 }),
    screens: {}, acts: {},
  };

  OWN.screens.ohome = {
    tab: 'ohome', skel: true,
    notes: [{ y: 0.22, t: 'Decision-first: one big number', i: 'target' }, { y: 0.34, t: 'Plain-language insight', i: 'message-square-text' }, { y: 0.55, t: 'Period segmented control', i: 'chart-spline' }, { y: 0.8, t: 'Bento tiles', i: 'layout-grid' }],
    render(ph) {
      const st = ph.st, S = SALES[st.period], sp = spark(S.data, 311, 74);
      const banks = (D.banks || []).map((b) => b.balance);
      return `<div class="mo-pad">
        <div class="mo-hello"><span class="mo-av own">AR</span><div><small>Good morning,</small><b>Ahmed</b></div><span class="mo-sp"></span>
          <button class="mo-co" data-act="oCompany">Al-Noor ${ic('chevron-down')}</button></div>
        <section class="mo-cash">
          <small>Cash position · 4 banks + 4 tills</small>
          <div class="mo-big">${mny(48215300)}</div>
          <div class="mo-stack">${banks.map((b, i) => `<i style="flex:${b}" class="s${i}"></i>`).join('')}<i style="flex:3206570" class="s4"></i></div>
          <button class="mo-insight" data-mt="recv"><span class="mo-ins-ic">${ic('sparkles')}</span><span><b>Receivables up 12%</b> · 3 invoices overdue &gt; 30 days</span>${ic('chevron-right')}</button>
        </section>
        ${st.cards.length ? `<button class="mo-card mo-row-card mo-apbar" data-mt="approvals"><span class="mo-tic violet">${ic('stamp')}</span><div><b>${st.cards.length} approvals waiting</b><small>Largest: Rs 1,240,000 to Siemens</small></div><span class="mo-sp"></span><span class="mo-go">Review</span></button>` : ''}
        <div class="mo-card mo-sales">
          <div class="mo-sales-h"><div><small>Sales ${st.period === 'today' ? 'today' : st.period === 'week' ? 'this week' : 'this month'}</small><b class="mo-num" data-sales>${mny(S.v, 0)}</b><span class="mo-up">${ic('trending-up')}${S.d}</span></div></div>
          <div class="mo-segm" data-period>${['today', 'week', 'month'].map((p) => `<button class="${p === st.period ? 'on' : ''}" data-act="oPeriod" data-p="${p}">${p[0].toUpperCase() + p.slice(1)}</button>`).join('')}</div>
          <svg class="mo-spark" viewBox="0 0 311 74" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="mo-sg-${ph.uid}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" class="sg-a"/><stop offset="1" class="sg-b"/></linearGradient></defs><path d="${sp.area}" fill="url(#mo-sg-${ph.uid})"/><path d="${sp.line}" class="sp-l" pathLength="1"/><circle cx="${sp.last[0] - 2}" cy="${sp.last[1]}" r="4" class="sp-d"/></svg>
          <div class="mo-sp-x">${S.lbl.map((l) => `<span>${l}</span>`).join('')}</div>
        </div>
        <div class="mo-bento">
          <button class="mo-tile" data-mt="recv"><span class="mo-tic green">${ic('arrow-down-left')}</span><small>Receivables</small><b>Rs 6.37M</b><span class="mo-up sm">${ic('trending-up')}12%</span></button>
          <button class="mo-tile" data-act="oPayables"><span class="mo-tic orange">${ic('arrow-up-right')}</span><small>Payables</small><b>Rs 3.00M</b><span class="mo-muted">Rs 1.24M due Sat</span></button>
          <button class="mo-tile" data-act="oSales"><span class="mo-tic blue">${ic('shopping-bag')}</span><small>Sales today</small><b>${short(SALES.today.v)}</b><span class="mo-muted">23 invoices</span></button>
          <button class="mo-tile warn" data-go="alerts"><span class="mo-tic red">${ic('package-x')}</span><small>Low stock</small><b>3 SKUs</b><span class="mo-muted">1 out of stock</span></button>
        </div>
      </div>`;
    },
  };

  const apCard = (c, k) => `<article class="mo-apc" data-id="${c.id}" data-k="${k}" style="--k:${k}" ${k ? 'aria-hidden="true"' : ''}>
      <div class="mo-apc-ov yes"><span>${ic('check')}Approve</span></div><div class="mo-apc-ov no"><span>${ic('x')}Reject</span></div>
      <div class="mo-apc-h"><span class="mo-tic ${c.tone}">${ic(c.icon)}</span><div><small>${c.type}</small><b>${c.title}</b></div><span class="mo-sp"></span><span class="mo-ref">${c.ref}</span></div>
      <div class="mo-apc-amt">${c.amt != null ? mny(c.amt) : c.big}</div>
      <p class="mo-apc-note">${c.note}</p>
      <div class="mo-apc-meta">${c.meta.map(([a, b]) => `<div><small>${a}</small><b>${b}</b></div>`).join('')}</div>
      <div class="mo-apc-tags">${c.tags.map((t) => `<span class="mo-tag ok">${ic('check')}${t}</span>`).join('')}</div>
    </article>`;
  OWN.screens.approvals = {
    tab: 'approvals', skel: true,
    notes: [{ y: 0.3, t: 'Swipe right to approve', i: 'arrow-right' }, { y: 0.45, t: 'Swipe left → reason sheet', i: 'arrow-left' }, { y: 0.84, t: 'Buttons for one-hand + a11y', i: 'accessibility' }],
    render(ph) {
      const st = ph.st, cs = st.cards;
      const total = cs.reduce((a, c) => a + (c.amt || 0), 0);
      return `<div class="mo-pad">${largeTitle('Approvals', `<span class="mo-count" data-count-badge>${cs.length}</span>`, cs.length ? `Rs ${fmt(total)} waiting` : 'Inbox zero')}
        ${cs.length ? `<div class="mo-deck">${cs.slice(0, 3).map(apCard).reverse().join('')}</div>
          <div class="mo-deck-hint">${ic('arrow-left')}Reject<span class="mo-sp"></span>Swipe the card<span class="mo-sp"></span>Approve${ic('arrow-right')}</div>
          <div class="mo-deck-btns"><button class="mo-rb no" data-act="oReject" aria-label="Reject">${ic('x')}</button><button class="mo-rb info" data-act="oInfo" aria-label="Details">${ic('info')}</button><button class="mo-rb yes" data-act="oApprove" aria-label="Approve">${ic('check')}</button></div>`
          : `<div class="mo-empty big"><div class="mo-party">${ic('party-popper')}</div><b>All caught up!</b><small>${st.done.length} decisions today · avg 4 seconds each</small><button class="mo-btn mo-btn-g" data-mt="ohome">Back to home</button><div class="mo-confetti">${Array.from({ length: 18 }, (_, i) => `<i style="--i:${i}"></i>`).join('')}</div></div>`}
      </div>`;
    },
    mount(ph, view) { return gestureDeck(ph, view); },
  };

  OWN.screens.recv = {
    tab: 'recv', skel: true,
    notes: [{ y: 0.26, t: 'Ageing donut', i: 'chart-pie' }, { y: 0.62, t: 'Tap → WhatsApp reminder', i: 'message-circle' }],
    render(ph) {
      const tot = AGE.reduce((a, x) => a + x[1], 0); let acc = 0;
      const segs = AGE.map(([, v, k]) => { const p = (v / tot) * 100, s = `<circle cx="60" cy="60" r="48" pathLength="100" class="dn ${k}" stroke-dasharray="${(p - 1.2).toFixed(2)} ${(100 - p + 1.2).toFixed(2)}" stroke-dashoffset="${(-acc).toFixed(2)}"/>`; acc += p; return s; }).join('');
      return `<div class="mo-pad">${largeTitle('Receivables', `<button class="mo-ibtn" data-act="oFilter" aria-label="Filter">${ic('sliders-horizontal')}</button>`, '9 customers')}
        <div class="mo-card mo-age">
          <div class="mo-donut"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="48" class="dn-bg"/>${segs}</svg><div><small>Outstanding</small><b>${short(tot)}</b></div></div>
          <div class="mo-age-l">${AGE.map(([l, v, k]) => `<div><i class="${k}"></i><span>${l}</span><b class="mo-num">${short(v)}</b></div>`).join('')}</div>
        </div>
        <div class="mo-sec-h"><b>Overdue first</b><span class="mo-muted">Tap to remind</span></div>
        <div class="mo-card mo-list">${OVERDUE.map(([code, days, , inv]) => { const c = cust(code); const sent = ph.st.sent[code]; return `<button class="mo-li mo-cust" data-act="oCust" data-c="${code}"><span class="mo-av sm ${days > 30 ? 'hot' : ''}">${c.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</span><div><b>${c.name}</b><small>${inv} · ${sent ? `<span class="mo-sent">${ic('check-check')}Reminded</span>` : c.city}</small></div><span class="mo-sp"></span><div class="mo-r"><b class="mo-num">${fmt(c.balance)}</b><span class="mo-tag ${days > 60 ? 'bad' : days > 30 ? 'wait' : 'neutral'}">${days}d</span></div></button>`; }).join('')}</div>
      </div>`;
    },
  };

  OWN.screens.wa = {
    tab: 'recv', chrome: 'none',
    notes: [{ y: 0.15, t: 'Native WhatsApp hand-off', i: 'message-circle' }, { y: 0.55, t: 'JazzCash / Easypaisa pay link', i: 'smartphone' }, { y: 0.9, t: 'Delivery ticks ✓✓ logged', i: 'check-check' }],
    render(ph, p) {
      const c = cust((p && p.c) || 'CUST-0002'), od = OVERDUE.find((x) => x[0] === c.code) || OVERDUE[0];
      const msg = `Assalam-o-Alaikum ${c.name} team,<br><br>A gentle reminder that invoice <b>${od[3]}</b> for <b>Rs ${fmt(c.balance)}</b> is ${od[1]} days overdue.<br><br>Pay instantly via JazzCash, Easypaisa or bank transfer:<br><u>pay.finsoft.pk/alnoor/${od[3].slice(-6)}</u><br><br>JazakAllah — Al-Noor Enterprises`;
      return `<div class="mo-full mo-wa${ph.static ? ' sent' : ''}">
        <header class="mo-wa-h"><button class="mo-wa-back" data-back aria-label="Back">${ic('chevron-left')}</button><span class="mo-av sm">${c.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</span><div><b>${c.name}</b><small>Business account · ${c.phone}</small></div><span class="mo-sp"></span>${ic('video')}${ic('phone')}</header>
        <div class="mo-wa-body">
          <span class="mo-wa-day">Today</span>
          <div class="mo-wa-sys">${ic('lock')}Messages are end-to-end encrypted.</div>
          <div class="mo-wa-in">Received with thanks, will process payment shortly.<small>Sep 12 · 11:20</small></div>
          <div class="mo-wa-out" data-bubble>${msg}<small>09:41 <span class="mo-ticks" data-ticks>${ic('check')}</span></small></div>
        </div>
        <div class="mo-wa-compose"><div class="mo-wa-draft"><span class="mo-wa-chip">${ic('sparkles')}Finsoft draft</span><p>${msg}</p></div><button class="mo-wa-send" data-act="oWaSend" aria-label="Send">${ic('send-horizontal')}</button></div>
      </div>`;
    },
  };

  OWN.screens.more = {
    tab: 'more',
    notes: [{ y: 0.24, t: 'Alerts surface first', i: 'bell-ring' }],
    render() {
      const tiles = [['chart-line', 'Profit & loss', 'blue'], ['waves', 'Cash flow', 'green'], ['receipt-text', 'Sales tax', 'orange'], ['users', 'Team · 46/52 in', 'violet'], ['boxes', 'Stock', 'yellow'], ['landmark', 'Banks', 'green']];
      return `<div class="mo-pad">${largeTitle('More')}
        <button class="mo-card mo-row-card mo-alert-row" data-go="alerts"><span class="mo-tic red">${ic('bell-ring')}</span><div><b>4 alerts need you</b><small>Low stock · cash below minimum · tax due</small></div><span class="mo-sp"></span><span class="mo-count">4</span></button>
        <div class="mo-grid3">${tiles.map(([i, l, t]) => `<button class="mo-gt" data-act="oSoon"><span class="mo-tic ${t}">${ic(i)}</span><small>${l}</small></button>`).join('')}</div>
        <div class="mo-card mo-list">
          <button class="mo-li" data-act="oCompany"><span class="mo-tic blue">${ic('building-2')}</span><div><b>Switch company</b><small>Al-Noor Enterprises (Pvt) Ltd</small></div><span class="mo-sp"></span>${ic('chevron-right', 'mo-chev')}</button>
          <button class="mo-li" data-act="oSoon"><span class="mo-tic green">${ic('shield-check')}</span><div><b>Security</b><small>Face ID for approvals over Rs 500K</small></div><span class="mo-sp"></span>${ic('chevron-right', 'mo-chev')}</button>
          <button class="mo-li" data-act="oSoon"><span class="mo-tic violet">${ic('settings')}</span><div><b>Settings</b><small>Notifications, limits, language</small></div><span class="mo-sp"></span>${ic('chevron-right', 'mo-chev')}</button>
        </div>
      </div>`;
    },
  };
  OWN.screens.alerts = {
    tab: 'more', back: 'Back', title: 'Alerts', skel: true,
    notes: [{ y: 0.24, t: 'Cash below minimum', i: 'wallet' }, { y: 0.55, t: 'Low stock with one-tap PO', i: 'package' }],
    render() {
      const low = [['PK-1005', 0, 50], ['FD-5004', 15, 60], ['EL-4002', 38, 40]].map(([s, q, r]) => [(D.items || []).find((x) => x.sku === s) || { name: s, unit: '' }, q, r]);
      return `${navBar('Alerts', 'Back')}
      <div class="mo-pad mo-under-nav">
        <div class="mo-sec-h"><b>Cash</b></div>
        <div class="mo-card mo-alert danger"><span class="mo-tic red">${ic('wallet')}</span><div><b>Karachi petty cash below minimum</b><small>Rs 50,000 · minimum Rs 75,000</small><div class="mo-bar"><i style="transform:scaleX(.66)"></i></div></div><button class="mo-btn sm mo-btn-p" data-act="oTopup">Top up</button></div>
        <div class="mo-sec-h"><b>Low stock</b><span class="mo-muted">3 SKUs</span></div>
        <div class="mo-card mo-list">${low.map(([it, q, r]) => `<div class="mo-li mo-stock"><div><b>${it.name}</b><small>${q} ${it.unit} left · reorder at ${r}</small><div class="mo-bar ${q === 0 ? 'out' : ''}"><i style="transform:scaleX(${Math.max(0.03, q / (r * 2)).toFixed(2)})"></i></div></div><button class="mo-btn sm mo-btn-g" data-act="oPO">Create PO</button></div>`).join('')}</div>
        <div class="mo-sec-h"><b>Compliance</b></div>
        <div class="mo-card mo-list">
          <div class="mo-li"><span class="mo-tic orange">${ic('calendar-clock')}</span><div><b>Sales tax return · Sep</b><small>Due 18 Oct · Rs 1.12M payable</small></div><span class="mo-sp"></span><span class="mo-tag wait">17d</span></div>
          <div class="mo-li"><span class="mo-tic blue">${ic('file-check')}</span><div><b>WHT statement u/s 165</b><small>Due 20 Oct · 42 deductees</small></div><span class="mo-sp"></span><span class="mo-tag neutral">19d</span></div>
        </div>
      </div>`;
    },
  };

  Object.assign(OWN.acts, {
    oPeriod(ph, b) {
      ph.st.period = b.dataset.p; const v = ph.top().el, S = SALES[ph.st.period], sp = spark(S.data, 311, 74);
      $$('[data-period] button', v).forEach((x) => x.classList.toggle('on', x === b));
      const svg = $('.mo-spark', v); const [area, line] = $$('path', svg); area.setAttribute('d', sp.area); line.setAttribute('d', sp.line); const dot = $('.sp-d', svg); dot.setAttribute('cx', sp.last[0] - 2); dot.setAttribute('cy', sp.last[1]);
      if (!RM()) { line.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 700, easing: 'cubic-bezier(.2,.8,.2,1)' }); area.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500 }); }
      $('[data-sales]', v).innerHTML = mny(S.v, 0); $('.mo-sales .mo-up', v).innerHTML = ic('trending-up') + S.d; $('.mo-sales small', v).textContent = 'Sales ' + (ph.st.period === 'today' ? 'today' : 'this ' + ph.st.period);
      $('.mo-sp-x', v).innerHTML = S.lbl.map((l) => `<span>${l}</span>`).join(''); FS.icons(v); ph.haptic();
    },
    oCompany(ph) { ph.snack('Al-Noor Enterprises is your only company', { icon: 'building-2' }); },
    oPayables(ph) { ph.snack('Rs 1,240,000 to Siemens is waiting for you in Approvals', { icon: 'stamp', action: { label: 'Open', fn: () => ph.tab('approvals') } }); },
    oSales(ph) { ph.snack('23 invoices · avg Rs 80,109 · top: Engro Foods', { icon: 'shopping-bag' }); },
    oSoon(ph, b) { ph.snack(`${($('small', b) || $('b', b)).textContent} opens the full report on web`, { icon: 'monitor-smartphone' }); },
    oApprove(ph) { deckDecide(ph, 'yes'); },
    oReject(ph) { deckDecide(ph, 'no'); },
    oInfo(ph) { const c = ph.st.cards[0]; if (c) ph.snack(`${c.ref} · ${c.meta[1][1]}`, { icon: 'info' }); },
    oCust(ph, b) { custActions(ph, b.dataset.c); },
    oWaSend(ph) { waSend(ph); },
    oFilter(ph) { ph.snack('Sorted by days overdue', { icon: 'sliders-horizontal' }); },
    oTopup(ph) { ph.snack('Transfer Rs 25,000 HBL 8721 → Karachi petty sent for approval', { icon: 'arrow-right-left' }); },
    oPO(ph, b) { b.textContent = 'Drafted ✓'; b.disabled = true; ph.haptic(); ph.snack('PO drafted for Habib Packaging', { icon: 'shopping-cart' }); },
    oInvoice(ph) { invoiceSheet(ph); },
    oPayment(ph) { paymentSheet(ph); },
    oExpense(ph) { expenseSheet(ph); },
    oApproveAll(ph) { approveAllSheet(ph); },
  });

  /* ---- owner sheets */
  function custActions(ph, code) {
    const c = cust(code), od = OVERDUE.find((x) => x[0] === code) || [];
    const sh = ph.sheet({
      cls: 'mo-action', title: c.name, sub: `Rs ${fmt(c.balance)} · ${od[1]} days · ${od[3]}`,
      html: `<div class="mo-act-list">
        <button data-k="wa" class="wa"><span class="mo-sh-ic wa">${ic('message-circle')}</span>Send WhatsApp reminder</button>
        <button data-k="call"><span class="mo-sh-ic">${ic('phone')}</span>Call ${c.phone}</button>
        <button data-k="pay"><span class="mo-sh-ic">${ic('circle-dollar-sign')}</span>Record payment</button>
        <button data-k="stmt"><span class="mo-sh-ic">${ic('file-text')}</span>Share statement</button></div>
        <button class="mo-act-cancel" data-k="x">Cancel</button>`,
    });
    sh.addEventListener('click', (e) => {
      const b = e.target.closest('[data-k]'); if (!b) return; const k = b.dataset.k; ph.closeSheet();
      if (k === 'wa') setTimeout(() => ph.push('wa', { c: code }), 180);
      else if (k === 'pay') setTimeout(() => paymentSheet(ph, code), 300);
      else if (k === 'call') ph.snack(`Calling ${c.phone}…`, { icon: 'phone' });
      else if (k === 'stmt') setTimeout(() => shareSheet(ph, `Statement_${c.code}.pdf`, 'Statement'), 300);
    });
  }
  function waSend(ph) {
    const v = ph.top().el, root = $('.mo-wa', v); if (!root || root.classList.contains('sent')) return;
    root.classList.add('sending'); ph.haptic();
    const code = ph.top().p && ph.top().p.c;
    setTimeout(() => root.classList.add('sent'), 240);
    const tk = $('[data-ticks]', v);
    setTimeout(() => { tk.innerHTML = ic('check-check'); FS.icons(tk); tk.classList.add('dlv'); }, 1100);
    setTimeout(() => { tk.classList.add('read'); ph.haptic(); }, 2000);
    setTimeout(() => { if (code) ph.st.sent[code] = true; ph.snack('Reminder delivered · logged to customer ledger', { icon: 'check-check' }); }, 2200);
  }
  function invoiceSheet(ph) {
    const cs = ['CUST-0002', 'CUST-0007', 'CUST-0004', 'CUST-0005'].map(cust);
    const its = ['OF-2002', 'FD-5002', 'FD-5003', 'EL-4001', 'PK-1003'].map((s) => (D.items || []).find((x) => x.sku === s)).filter(Boolean);
    const S = { step: 0, c: cs[0], q: { 'OF-2002': 20, 'FD-5002': 12 } };
    const sub = () => its.reduce((a, it) => a + (S.q[it.sku] || 0) * it.price, 0);
    const body = () => {
      if (S.step === 0) return `<div class="mo-search">${ic('search')}<span>Search 9 customers</span></div><div class="mo-card mo-list flat">${cs.map((c) => `<button class="mo-li mo-pick${c === S.c ? ' on' : ''}" data-cu="${c.code}"><span class="mo-av sm">${c.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</span><div><b>${c.name}</b><small>${c.city} · limit ${short(c.limit)}</small></div><span class="mo-sp"></span><span class="mo-radio"></span></button>`).join('')}</div>`;
      if (S.step === 1) return `<div class="mo-card mo-list flat">${its.map((it) => `<div class="mo-li mo-item"><div><b>${it.name}</b><small>Rs ${fmt(it.price)} / ${it.unit} · ${fmt(it.stock)} in stock</small></div><span class="mo-sp"></span><div class="mo-step"><button data-dq="${it.sku}" aria-label="Less">${ic('minus')}</button><b data-q="${it.sku}">${S.q[it.sku] || 0}</b><button data-iq="${it.sku}" aria-label="More">${ic('plus')}</button></div></div>`).join('')}</div><div class="mo-tot"><span>Subtotal</span><b class="mo-num" data-sub>${mny(sub())}</b></div>`;
      if (S.step === 2) { const s = sub(), g = Math.round(s * 0.18); return `<div class="mo-card mo-review"><div class="mo-rv-h"><small>Bill to</small><b>${S.c.name}</b><small>${S.c.city} · NTN ${S.c.ntn}</small></div>${its.filter((it) => S.q[it.sku]).map((it) => `<div class="mo-li"><span>${it.name} <small>× ${S.q[it.sku]}</small></span><span class="mo-sp"></span><span class="mo-num">${fmt(S.q[it.sku] * it.price)}</span></div>`).join('')}<div class="mo-li"><span class="mo-muted">GST 18%</span><span class="mo-sp"></span><span class="mo-num">${fmt(g)}</span></div><div class="mo-li tot"><b>Total</b><span class="mo-sp"></span><b class="mo-num">${mny(s + g)}</b></div></div><div class="mo-fine">Due in 30 days · FBR invoice number issued on posting</div>`; }
      if (S.step === 3) return `<div class="mo-gen"><div class="mo-doc"><i></i><i></i><i></i><i></i><i></i><i></i><span class="mo-doc-stamp">${ic('check')}</span></div><b data-gen-t>Generating INV-2026-000124.pdf…</b><div class="mo-bar lg"><i></i></div></div>`;
      return '';
    };
    const foot = () => S.step === 3 ? '' : `<div class="mo-sh-steps">${['Customer', 'Items', 'Review'].map((s, i) => `<span class="${i < S.step ? 'done' : i === S.step ? 'cur' : ''}">${s}</span>`).join('')}</div><div class="mo-2col">${S.step ? '<button class="mo-btn mo-btn-g" data-prev>Back</button>' : '<span></span>'}<button class="mo-btn mo-btn-p" data-next>${S.step === 2 ? 'Generate invoice' : 'Next'}</button></div>`;
    const sh = ph.sheet({ title: 'Quick invoice', sub: 'Step 1 of 3 · Customer', html: body(), foot: foot(), tall: true, cls: 'mo-inv' });
    const paint = (dir) => {
      const b = $('.mo-sh-body', sh); b.innerHTML = body(); $('.mo-sh-foot', sh).innerHTML = foot();
      $('.mo-sh-head small', sh).textContent = S.step < 3 ? `Step ${S.step + 1} of 3 · ${['Customer', 'Items', 'Review'][S.step]}` : 'Almost done';
      FS.icons(sh); if (!RM()) b.animate([{ opacity: 0, transform: `translateX(${dir * 28}px)` }, { opacity: 1, transform: 'none' }], { duration: 300, easing: 'cubic-bezier(.2,.8,.2,1)' });
    };
    sh.addEventListener('click', (e) => {
      const t = e.target;
      const cu = t.closest('[data-cu]'); if (cu) { S.c = cust(cu.dataset.cu); $$('[data-cu]', sh).forEach((x) => x.classList.toggle('on', x === cu)); ph.haptic(); }
      const inc = t.closest('[data-iq]'), dec = t.closest('[data-dq]');
      if (inc || dec) { const k = (inc || dec).dataset[inc ? 'iq' : 'dq']; S.q[k] = Math.max(0, (S.q[k] || 0) + (inc ? 1 : -1)); const q = $(`[data-q="${k}"]`, sh); q.textContent = S.q[k]; if (!RM()) q.animate([{ transform: `translateY(${inc ? 8 : -8}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 200 }); $('[data-sub]', sh).innerHTML = mny(sub()); }
      if (t.closest('[data-prev]')) { S.step--; paint(-1); }
      if (t.closest('[data-next]')) {
        if (S.step === 1 && !sub()) { ph.snack('Add at least one item', { icon: 'info' }); return; }
        S.step++; paint(1);
        if (S.step === 3) {
          setTimeout(() => { const g = $('.mo-gen', sh); if (g) { g.classList.add('done'); $('[data-gen-t]', sh).textContent = 'INV-2026-000124 ready'; ph.haptic(); } }, 1500);
          setTimeout(() => { ph.closeSheet(); setTimeout(() => shareSheet(ph, 'INV-2026-000124.pdf', 'Invoice', (k) => ph.snack({ wa: `Invoice sent to ${S.c.name} on WhatsApp ✓✓`, mail: `Invoice emailed to ${S.c.name}`, link: 'Pay link copied · JazzCash, Easypaisa, bank', save: 'Invoice saved to Files' }[k], { icon: k === 'link' ? 'copy' : 'check-check' })), 260); }, 2200);
        }
      }
    });
  }
  function paymentSheet(ph, code) {
    const c = cust(code || 'CUST-0002');
    const sh = ph.sheet({
      title: 'Record payment', sub: 'Receipt posts to the customer ledger',
      html: `<small class="mo-lbl">From</small><div class="mo-chips" data-g>${['CUST-0002', 'CUST-0006', 'CUST-0009'].map(cust).map((x) => `<button class="mo-pchip${x.code === c.code ? ' on' : ''}">${x.name}</button>`).join('')}</div>
        <div class="mo-amt"><small>Amount received</small><div class="mo-big sm">${mny(500000)}</div></div>
        <small class="mo-lbl">Method</small><div class="mo-chips" data-g><button class="mo-pchip on">${ic('landmark')}Meezan 0123</button><button class="mo-pchip">${ic('smartphone')}JazzCash</button><button class="mo-pchip">Easypaisa</button><button class="mo-pchip">Cash</button><button class="mo-pchip">Cheque</button></div>`,
      foot: `<button class="mo-btn mo-btn-p mo-btn-block" data-submit>Save receipt</button>`,
    });
    sh.addEventListener('click', (e) => {
      const p = e.target.closest('[data-g] .mo-pchip'); if (p) $$('.mo-pchip', p.parentElement).forEach((x) => x.classList.toggle('on', x === p));
      if (e.target.closest('[data-submit]')) { ph.closeSheet(); ph.snack('Receipt RCPT-2026-000287 · Rs 500,000 saved', { icon: 'circle-check', undo: () => ph.snack('Receipt voided', { icon: 'undo-2' }) }); }
    });
  }
  function expenseSheet(ph) {
    const sh = ph.sheet({
      title: 'Add expense', sub: 'Posts as a cash payment voucher',
      html: `<div class="mo-amt"><small>Amount</small><div class="mo-big sm">${mny(12500)}</div></div>
        <small class="mo-lbl">Category</small><div class="mo-chips" data-g><button class="mo-pchip on">Fuel</button><button class="mo-pchip">Utilities</button><button class="mo-pchip">Meals</button><button class="mo-pchip">Repairs</button><button class="mo-pchip">Courier</button></div>
        <small class="mo-lbl">Paid from</small><div class="mo-chips" data-g><button class="mo-pchip on">Lahore HQ drawer</button><button class="mo-pchip">Meezan 0123</button></div>
        <button class="mo-card mo-row-card mo-attach" data-scan><span class="mo-tic green">${ic('camera')}</span><div><b>Attach receipt</b><small>Auto-reads amount and vendor</small></div></button>`,
      foot: `<button class="mo-btn mo-btn-p mo-btn-block" data-submit>Save expense</button>`,
    });
    sh.addEventListener('click', (e) => {
      const p = e.target.closest('[data-g] .mo-pchip'); if (p) $$('.mo-pchip', p.parentElement).forEach((x) => x.classList.toggle('on', x === p));
      if (e.target.closest('[data-scan]')) ph.snack('Camera opens on device', { icon: 'camera' });
      if (e.target.closest('[data-submit]')) { ph.closeSheet(); ph.snack('CPV-2026-000512 · Rs 12,500 fuel posted', { icon: 'circle-check', undo: () => ph.snack('Voucher reversed', { icon: 'undo-2' }) }); }
    });
  }
  function approveAllSheet(ph) {
    const n = ph.st.cards.length, tot = ph.st.cards.reduce((a, c) => a + (c.amt || 0), 0);
    if (!n) { ph.closeSheet(); ph.snack('Nothing waiting — all caught up', { icon: 'party-popper' }); return; }
    const sh = ph.sheet({
      title: `Approve ${n} items?`, sub: `Rs ${fmt(tot)} in payments and claims`,
      html: `<div class="mo-card mo-list flat">${ph.st.cards.map((c) => `<div class="mo-li"><span class="mo-tic ${c.tone}">${ic(c.icon)}</span><div><b>${c.title}</b><small>${c.type}</small></div><span class="mo-sp"></span><span class="mo-num">${c.amt != null ? fmt(c.amt) : c.big}</span></div>`).join('')}</div>
        <div class="mo-faceid sm" data-fid hidden><svg viewBox="0 0 80 80" aria-hidden="true"><path class="fi-c" d="M6 24V14a8 8 0 0 1 8-8h10M56 6h10a8 8 0 0 1 8 8v10M74 56v10a8 8 0 0 1-8 8H56M24 74H14a8 8 0 0 1-8-8V56"/><path class="fi-f" d="M28 30v6M52 30v6M40 30v14h-4M30 54c6 5 14 5 20 0"/><path class="fi-k" d="M24 41l11 11 22-24" pathLength="100"/></svg></div>`,
      foot: `<button class="mo-btn mo-btn-p mo-btn-block" data-submit>${ic('scan-face')}Approve with Face ID</button>`,
    });
    FS.icons(sh);
    sh.addEventListener('click', (e) => {
      if (!e.target.closest('[data-submit]')) return;
      const f = $('[data-fid]', sh); f.hidden = false; setTimeout(() => f.classList.add('ok'), 700);
      setTimeout(() => {
        ph.closeSheet(); ph.st.done.push(...ph.st.cards); ph.st.cards = []; ph.badges();
        if (ph.top().sid === 'approvals') ph.refreshTop(); else ph.tab('approvals');
        ph.haptic(); ph.snack(`${n} items approved`, { icon: 'check-check' });
      }, 1400);
    });
  }

  /* ---- deck gesture + decisions */
  function deckDecide(ph, dir, fromDrag) {
    const v = ph.top().el, card = $('.mo-apc[data-k="0"]', v); const c = ph.st.cards[0];
    if (!card || !c) return;
    if (dir === 'no' && !fromDrag) { card.classList.add('show-no'); card.style.transform = 'translateX(-46px) rotate(-4deg)'; return rejectSheet(ph, card, c); }
    if (dir === 'no') return rejectSheet(ph, card, c);
    flyOut(ph, card, 1, () => commit(ph, c, 'Approved'));
  }
  function flyOut(ph, card, s, done) {
    card.classList.add(s > 0 ? 'show-yes' : 'show-no'); ph.haptic();
    const from = card.style.transform || 'none';
    if (RM()) { done(); return; }
    card.animate([{ transform: from }, { transform: `translate(${s * 520}px, -40px) rotate(${s * 26}deg)`, opacity: 0.4 }], { duration: 380, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'forwards' }).onfinish = done;
  }
  function commit(ph, c, verb) {
    const st = ph.st; const i = st.cards.indexOf(c); if (i < 0) return;
    st.cards.splice(i, 1); st.done.push(c); ph.badges(); ph.refreshTop();
    if (!st.cards.length) setTimeout(() => ph.haptic(), 200);
    ph.snack(`${c.type} ${verb.toLowerCase()} · ${c.amt != null ? 'Rs ' + fmt(c.amt) : c.big}`, { icon: verb === 'Approved' ? 'circle-check' : 'circle-x', undo: () => { st.done.splice(st.done.indexOf(c), 1); st.cards.unshift(c); ph.badges(); if (ph.top().sid === 'approvals') ph.refreshTop(); } });
  }
  function rejectSheet(ph, card, c) {
    let decided = false;
    const sh = ph.sheet({
      title: 'Reason for rejecting', sub: `${c.type} · ${c.title}`,
      html: `<div class="mo-chips col" data-g>${['Budget exceeded', 'Need more information', 'Duplicate request', 'Wrong vendor or rate'].map((r, i) => `<button class="mo-pchip${i === 1 ? ' on' : ''}">${r}</button>`).join('')}</div>
        <label class="mo-input"><small>Note to ${c.meta[1][1]}</small><input type="text" value="Please attach the signed quotation."></label>`,
      foot: `<button class="mo-btn mo-btn-d mo-btn-block" data-submit>Reject &amp; notify</button>`,
      onClose: () => { if (!decided) { card.classList.remove('show-no'); if (!RM()) card.animate([{ transform: card.style.transform || 'none' }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.34,1.56,.64,1)' }); card.style.transform = ''; } },
    });
    sh.addEventListener('click', (e) => {
      const p = e.target.closest('[data-g] .mo-pchip'); if (p) $$('.mo-pchip', p.parentElement).forEach((x) => x.classList.toggle('on', x === p));
      if (e.target.closest('[data-submit]')) { decided = true; ph.closeSheet(); flyOut(ph, card, -1, () => commit(ph, c, 'Rejected')); }
    });
  }
  function gestureDeck(ph, view) {
    const down = (e) => {
      const card = e.target.closest('.mo-apc'); if (!card || card.dataset.k !== '0' || e.button > 0) return;
      const c = ph.st.cards[0]; let dx = 0, dy = 0; const x0 = e.clientX, y0 = e.clientY;
      card.setPointerCapture(e.pointerId); card.classList.add('drag');
      const yes = $('.mo-apc-ov.yes', card), no = $('.mo-apc-ov.no', card);
      const mv = (ev) => {
        dx = (ev.clientX - x0) / ph.scale; dy = (ev.clientY - y0) / ph.scale;
        card.style.transform = `translate(${dx}px, ${dy * 0.35}px) rotate(${dx * 0.06}deg)`;
        yes.style.opacity = Math.max(0, Math.min(1, dx / 110)); no.style.opacity = Math.max(0, Math.min(1, -dx / 110));
      };
      const up = () => {
        card.removeEventListener('pointermove', mv); card.removeEventListener('pointerup', up); card.removeEventListener('pointercancel', up); card.classList.remove('drag');
        yes.style.opacity = ''; no.style.opacity = '';
        if (dx > 110) flyOut(ph, card, 1, () => commit(ph, c, 'Approved'));
        else if (dx < -110) { card.style.transform = 'translateX(-46px) rotate(-4deg)'; card.classList.add('show-no'); deckDecide(ph, 'no', true); }
        else { const from = card.style.transform; card.style.transform = ''; if (!RM() && from) card.animate([{ transform: from }, { transform: 'none' }], { duration: 480, easing: 'cubic-bezier(.34,1.56,.64,1)' }); }
      };
      card.addEventListener('pointermove', mv); card.addEventListener('pointerup', up); card.addEventListener('pointercancel', up);
    };
    view.addEventListener('pointerdown', down);
    return () => view.removeEventListener('pointerdown', down);
  }

  /* ---- inbox gestures: swipe-left archive + pull to refresh */
  function gestureInbox(ph, view) {
    const sc = $('.mo-scroll', view), body = $('.mo-ptr-body', view), ptr = $('.mo-ptr', view), sp = $('.mo-ptr-sp', view);
    let busy = false;
    const down = (e) => {
      if (e.button > 0 || busy) return;
      const row = e.target.closest('.mo-swipe'); const fg = row && $('.mo-swipe-fg', row);
      const x0 = e.clientX, y0 = e.clientY; let axis = null, dx = 0, dy = 0;
      const mv = (ev) => {
        dx = (ev.clientX - x0) / ph.scale; dy = (ev.clientY - y0) / ph.scale;
        if (!axis) { if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return; axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'; if (axis === 'x' && !row) axis = 'none'; if (axis === 'y' && (sc.scrollTop > 0 || dy < 0)) axis = 'none'; if (axis !== 'none') { try { sc.setPointerCapture(ev.pointerId); } catch (er) {} } }
        if (axis === 'x') { const x = Math.min(0, dx); fg.style.transform = `translateX(${x < -90 ? -90 + (x + 90) * 0.6 : x}px)`; row.classList.toggle('arm', x < -90); }
        if (axis === 'y') { const p = Math.max(0, dy) * 0.5; body.style.transform = `translateY(${p}px)`; ptr.style.opacity = Math.min(1, p / 50); sp.style.transform = `rotate(${p * 4}deg) scale(${Math.min(1, 0.5 + p / 120)})`; ptr.classList.toggle('arm', p > 56); }
      };
      const up = () => {
        sc.removeEventListener('pointermove', mv); sc.removeEventListener('pointerup', up); sc.removeEventListener('pointercancel', up);
        if (axis === 'x') {
          if (dx < -90) archive(ph, row);
          else { fg.style.transform = ''; row.classList.remove('arm'); if (!RM()) fg.animate([{ transform: `translateX(${Math.min(0, dx)}px)` }, { transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.34,1.56,.64,1)' }); }
        }
        if (axis === 'y') {
          const p = Math.max(0, dy) * 0.5;
          if (p > 56) refresh(); else settle(p);
        }
      };
      sc.addEventListener('pointermove', mv); sc.addEventListener('pointerup', up); sc.addEventListener('pointercancel', up);
    };
    sc.addEventListener('pointerdown', down);
    const settle = (p) => { body.style.transform = ''; ptr.style.opacity = ''; sp.style.transform = ''; ptr.classList.remove('arm', 'spin'); if (!RM() && p) body.animate([{ transform: `translateY(${p}px)` }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.34,1.3,.64,1)' }); };
    const refresh = () => {
      busy = true; body.style.transform = 'translateY(56px)'; ptr.style.opacity = 1; ptr.classList.add('spin'); sp.style.transform = ''; ph.haptic();
      setTimeout(() => {
        const add = ph.st.fresh.splice(0, 2); add.forEach((x) => (x.isNew = true)); ph.st.inbox.unshift(...add);
        settle(56); busy = false;
        const list = $('.mo-inbox', view);
        if (add.length) { list.insertAdjacentHTML('afterbegin', add.map(inboxRow).join('')); FS.icons(list); ph.badges(); $('.mo-lt small', view).textContent = `${ph.st.inbox.filter((x) => x.unread).length} unread`; ph.snack(`${add.length} new updates`, { icon: 'bell' }); }
        else ph.snack("You're all caught up", { icon: 'check' });
      }, 1000);
    };
    ph._refresh = refresh;
    return () => sc.removeEventListener('pointerdown', down);
  }
  function archive(ph, row) {
    const id = +row.dataset.id, st = ph.st, i = st.inbox.findIndex((x) => x.id === id); if (i < 0) return;
    const item = st.inbox[i]; st.inbox.splice(i, 1); ph.haptic();
    const fg = $('.mo-swipe-fg', row);
    const fin = () => { row.remove(); ph.badges(); };
    if (RM()) fin();
    else {
      fg.animate([{ transform: fg.style.transform || 'none' }, { transform: 'translateX(-110%)' }], { duration: 220, easing: 'ease-in', fill: 'forwards' }).onfinish = () => {
        row.style.height = row.offsetHeight + 'px'; row.classList.add('gone');
        row.animate([{ height: row.offsetHeight + 'px', opacity: 1 }, { height: '0px', opacity: 0, marginBottom: '-8px' }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' }).onfinish = fin;
      };
    }
    ph.snack('Archived', { icon: 'archive', undo: () => { st.inbox.splice(i, 0, item); if (ph.top().sid === 'inbox') ph.refreshTop(); ph.badges(); } });
  }

  /* ============================================================ PHONE ENGINE */
  let UID = 0;
  class Phone {
    constructor(app, host) {
      this.app = app; this.uid = ++UID; this.st = app.key === 'emp' ? empState() : ownState(); this.stack = []; this.scale = 1;
      host.insertAdjacentHTML('beforeend', frameHTML(app, ''));
      this.el = host.lastElementChild; this.views = $('.mo-views', this.el); this.sheetHost = $('.mo-sheet-host', this.el); this.snackHost = $('.mo-snack-host', this.el); this.screenEl = $('.mo-screen', this.el);
      this.t = (s) => (this.st.lang === 'ur' && UR[s]) || s;
      this.el.addEventListener('click', (e) => this.onClick(e));
      $('.mo-scrim', this.el).addEventListener('click', () => this.closeSheet());
      this.root(app.tabs[0].id, 'none'); this.badges(); FS.icons(this.el);
      if (app.key === 'emp') this.timer = setInterval(() => this.tick(), 1000);
    }
    onClick(e) {
      const t = e.target;
      const mt = t.closest('[data-mt]'); if (mt && this.el.contains(mt)) { if (mt.closest('.mo-sheet')) this.closeSheet(); return this.tab(mt.dataset.mt); }
      if (t.closest('[data-fab]')) return this.fab();
      if (t.closest('[data-back]')) return this.pop();
      if (t.closest('[data-x]')) return this.closeSheet();
      const go = t.closest('[data-go]'); if (go) return this.push(go.dataset.go);
      const a = t.closest('[data-act]'); if (a) { const f = this.app.acts[a.dataset.act]; if (f) f(this, a, e); }
    }
    top() { return this.stack[this.stack.length - 1]; }
    make(sid, p) {
      const sc = this.app.screens[sid];
      const v = document.createElement('section'); v.className = 'mo-view' + (sc.chrome === 'none' ? ' mo-v-full' : ''); v.dataset.sid = sid;
      v.innerHTML = `<div class="mo-scroll">${sc.render(this, p)}</div><i class="mo-dim"></i>`;
      this.views.appendChild(v); FS.icons(v);
      const rec = { sid, p, el: v, sc };
      if (sc.mount) rec.clean = sc.mount(this, v, p);
      if (sc.skel && !RM() && !this.noSkel) this.skel(v);
      return rec;
    }
    destroy(rec) { if (rec.clean) try { rec.clean(); } catch (e) {} rec.el.remove(); }
    chrome(rec) {
      this.el.classList.toggle('mo-notabs', rec.sc.chrome === 'none');
      this.el.classList.toggle('mo-sb-dark', !!rec.sc.dark);
      const idx = { [this.app.tabs[0].id]: 0, [this.app.tabs[1].id]: 1, [this.app.tabs[2].id]: 3, [this.app.tabs[3].id]: 4 }[this.stack[0].sc.tab] ?? 0;
      const ind = $('.mo-tb-ind', this.el), prev = +ind.style.getPropertyValue('--x');
      ind.style.setProperty('--x', idx);
      if (prev !== idx && !RM()) ind.animate([{ scale: '1 1' }, { scale: '1.7 .8', offset: 0.45 }, { scale: '1 1' }], { duration: 420, easing: 'ease-out' });
      $$('.mo-tb', this.el).forEach((b) => b.classList.toggle('on', b.dataset.mt === this.stack[0].sc.tab));
      this.onNav && this.onNav(rec);
    }
    root(sid, mode = 'tab') {
      const old = this.stack.slice(); this.stack = [];
      const rec = this.make(sid); this.stack.push(rec); this.chrome(rec);
      if (mode === 'none' || RM()) old.forEach((r) => this.destroy(r));
      else {
        rec.el.animate([{ opacity: 0, transform: 'scale(.985)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' });
        old.forEach((r) => r.el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' }).onfinish = () => this.destroy(r));
      }
    }
    tab(id) {
      this.closeSheet();
      if (this.stack.length === 1 && this.stack[0].sid === id) { const s = $('.mo-scroll', this.top().el); s.scrollTo({ top: 0, behavior: RM() ? 'auto' : 'smooth' }); return; }
      if (this.stack.length > 1 && this.stack[0].sid === id) return this.popToRoot();
      this.root(id);
    }
    push(sid, p) {
      if (!this.app.screens[sid]) return;
      this.closeSheet();
      const prev = this.top(), rec = this.make(sid, p); this.stack.push(rec); this.chrome(rec);
      if (RM()) { prev.el.classList.add('mo-hide'); return; }
      rec.el.animate([{ transform: 'translateX(100%)', boxShadow: '0 0 0 transparent' }, { transform: 'none', boxShadow: '-20px 0 40px -20px rgba(0,0,0,.25)' }], { duration: 460, easing: EASE_IOS });
      prev.el.animate([{ transform: 'none' }, { transform: 'translateX(-28%)' }], { duration: 460, easing: EASE_IOS, fill: 'forwards' }).onfinish = () => prev.el.classList.add('mo-hide');
      $('.mo-dim', prev.el).animate([{ opacity: 0 }, { opacity: 1 }], { duration: 460, easing: EASE_IOS, fill: 'forwards' });
    }
    pop(to) {
      if (this.stack.length < 2) return;
      const cur = this.stack.pop();
      while (to != null && this.stack.length > to + 1) this.destroy(this.stack.pop());
      const prev = this.top();
      this.rerender(prev, true); prev.el.classList.remove('mo-hide'); this.chrome(prev);
      prev.el.getAnimations().forEach((a) => a.cancel()); $('.mo-dim', prev.el).getAnimations().forEach((a) => a.cancel());
      if (RM()) { this.destroy(cur); return; }
      prev.el.animate([{ transform: 'translateX(-28%)' }, { transform: 'none' }], { duration: 420, easing: EASE_IOS });
      $('.mo-dim', prev.el).animate([{ opacity: 1 }, { opacity: 0 }], { duration: 420, easing: EASE_IOS });
      cur.el.style.zIndex = 3;
      cur.el.animate([{ transform: 'none' }, { transform: 'translateX(100%)' }], { duration: 420, easing: EASE_IOS, fill: 'forwards' }).onfinish = () => this.destroy(cur);
    }
    popToRoot() { this.pop(0); }
    rerender(rec, keepScroll) {
      const s = $('.mo-scroll', rec.el), y = keepScroll ? s.scrollTop : 0;
      if (rec.clean) try { rec.clean(); } catch (e) {}
      s.innerHTML = rec.sc.render(this, rec.p); FS.icons(s); s.scrollTop = y;
      if (rec.sc.mount) rec.clean = rec.sc.mount(this, rec.el, rec.p);
    }
    refreshTop() { this.rerender(this.top(), true); }
    goto(sid) {
      const sc = this.app.screens[sid]; if (!sc) return;
      this.closeSheet();
      if (sc.tab === sid) { this.root(sid); return; }
      if (this.stack[0].sid !== sc.tab || this.stack.length > 1) { this.noSkel = true; this.root(sc.tab, 'none'); this.noSkel = false; }
      this.push(sid);
    }
    relabel() { $$('.mo-tb-l', this.el).forEach((l) => (l.textContent = this.t(l.dataset.t))); }
    badges() { const b = this.app.badge(this.st); $$('[data-badge]', this.el).forEach((e) => { const n = b[e.dataset.badge] || 0; e.textContent = n; e.classList.toggle('z', !n); }); }
    tick() {
      this.st.clock++;
      const c = this.el.querySelectorAll('[data-clock]'); c.forEach((x) => (x.innerHTML = clockStr(this.st.clock)));
      if (this.st.checkedIn) { const w = this.st.clock - this.st.ciAt; $$('[data-worked]', this.el).forEach((x) => (x.textContent = `${Math.floor(w / 3600)}h ${String(Math.floor(w / 60) % 60).padStart(2, '0')}m`)); $$('[data-shiftbar]', this.el).forEach((x) => (x.style.transform = `scaleX(${Math.min(1, w / 32400).toFixed(4)})`)); }
    }
    skel(v) {
      const k = document.createElement('div'); k.className = 'mo-skel' + (v.classList.contains('mo-v-full') ? '' : '');
      const nav = !!$('.mo-nav', v);
      k.innerHTML = `${nav ? '<i class="sk-nav"></i>' : '<i class="sk-t"></i><i class="sk-t2"></i>'}<i class="sk-hero"></i><div class="sk-g"><i></i><i></i><i></i><i></i></div><i class="sk-r"></i><i class="sk-r"></i><i class="sk-r"></i>`;
      v.appendChild(k);
      setTimeout(() => { k.classList.add('out'); setTimeout(() => k.remove(), 260); }, 420);
    }
    haptic() { if (RM()) return; this.screenEl.animate([{ transform: 'none' }, { transform: 'translateX(-1.2px)' }, { transform: 'translateX(1.2px)' }, { transform: 'none' }], { duration: 140 }); }
    fab() {
      const a = this.app;
      const sh = this.sheet({
        title: this.t('Quick actions'), sub: a.key === 'emp' ? 'Bilal Khan · EMP-0042' : 'Ahmed Raza · CEO', cls: 'mo-fabsheet',
        html: `<div class="mo-fab-grid">${a.fab.map((f, i) => `<button data-act="${f.act}" style="--i:${i}"><span class="mo-tic ${f.tone} lg">${ic(f.icon)}</span><b>${f.label}</b><small>${f.sub}</small></button>`).join('')}</div>`,
      });
      this.el.classList.add('fab-open');
      sh._onClose = () => this.el.classList.remove('fab-open');
    }
    sheet(o) {
      if (this.sh) this.closeSheet(true);
      $$('.mo-snack', this.snackHost).forEach((x) => x.remove());
      const s = document.createElement('div');
      s.className = 'mo-sheet ' + (o.cls || '') + (o.tall ? ' tall' : ''); s.setAttribute('role', 'dialog'); s.setAttribute('aria-label', o.title || 'Sheet');
      s.innerHTML = `<div class="mo-grab" data-grab><i></i></div>${o.title && o.cls !== 'mo-action' ? `<div class="mo-sh-head" data-grab><div><b>${o.title}</b>${o.sub ? `<small>${o.sub}</small>` : ''}</div><button class="mo-x" data-x aria-label="Close">${ic('x')}</button></div>` : o.cls === 'mo-action' ? `<div class="mo-act-head" data-grab><b>${o.title}</b><small>${o.sub || ''}</small></div>` : ''}<div class="mo-sh-body">${o.html}</div>${o.foot ? `<div class="mo-sh-foot">${o.foot}</div>` : ''}`;
      this.sheetHost.appendChild(s); FS.icons(s);
      s._onClose = o.onClose;
      this.sh = s; this.sheetHost.classList.add('open');
      if (!RM()) s.animate([{ transform: 'translateY(100%)' }, { transform: 'translateY(-1.5%)', offset: 0.72 }, { transform: 'none' }], { duration: 520, easing: 'cubic-bezier(.2,.9,.3,1)' });
      $('.mo-scrim', this.el).getAnimations().forEach((x) => x.cancel());
      this.dragSheet(s);
      return s;
    }
    closeSheet(instant) {
      const s = this.sh; if (!s) return; this.sh = null;
      const cb = s._onClose; s._onClose = null; if (cb) cb();
      this.sheetHost.classList.remove('open');
      if (instant || RM()) { s.remove(); return; }
      const from = getComputedStyle(s).transform;
      s.animate([{ transform: from === 'none' ? 'none' : from }, { transform: 'translateY(105%)' }], { duration: 280, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' }).onfinish = () => s.remove();
    }
    dragSheet(s) {
      s.addEventListener('pointerdown', (e) => {
        if (!e.target.closest('[data-grab]') || e.target.closest('button')) return;
        const y0 = e.clientY; let dy = 0; s.setPointerCapture(e.pointerId);
        const mv = (ev) => { dy = Math.max(0, (ev.clientY - y0) / this.scale); s.style.transform = `translateY(${dy}px)`; };
        const up = () => { s.removeEventListener('pointermove', mv); s.removeEventListener('pointerup', up); if (dy > 90) this.closeSheet(); else { s.style.transform = ''; if (dy && !RM()) s.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 360, easing: 'cubic-bezier(.34,1.56,.64,1)' }); } };
        s.addEventListener('pointermove', mv); s.addEventListener('pointerup', up);
      });
    }
    snack(msg, o = {}) {
      const h = this.snackHost; $$('.mo-snack', h).forEach((x) => { x.classList.add('out'); setTimeout(() => x.remove(), 220); });
      const s = document.createElement('div'); s.className = 'mo-snack'; s.setAttribute('role', 'status');
      s.innerHTML = `${o.icon ? ic(o.icon) : ''}<span>${msg}</span>${o.undo ? '<button data-u>Undo</button>' : o.action ? `<button data-u>${o.action.label}</button>` : ''}<i class="mo-snack-bar"></i>`;
      h.appendChild(s); FS.icons(s);
      const kill = () => { s.classList.add('out'); setTimeout(() => s.remove(), 240); };
      const tm = setTimeout(kill, 4200);
      const u = $('[data-u]', s); if (u) u.addEventListener('click', (e) => { e.stopPropagation(); clearTimeout(tm); kill(); this.haptic(); (o.undo || o.action.fn)(); });
    }
  }

  /* ---------------------------------------------------------- static (gallery) phone */
  function staticPhone(app, sid, p) {
    const sc = app.screens[sid]; const st = app.key === 'emp' ? empState() : ownState();
    if (sid === 'ci-done') { st.checkedIn = '09:04'; }
    const fake = { st, t: (s) => s, static: true, uid: 'g' + (++UID) };
    const v = `<section class="mo-view${sc.chrome === 'none' ? ' mo-v-full' : ''}"><div class="mo-scroll">${sc.render(fake, p)}</div></section>`;
    return frameHTML(app, v, { static: true, tab: sc.tab, notabs: sc.chrome === 'none', dark: sc.dark });
  }

  /* ============================================================ PAGE MOUNT */
  const GALLERY = [
    ['emp', 'home', 'Home', 'Live clock check-in card and bento tiles; one primary action above the fold.'],
    ['emp', 'ci-map', 'Check-in', 'Geofence + GPS accuracy halo. Works offline and syncs later.'],
    ['emp', 'ci-selfie', 'Selfie liveness', 'Face oval, scan line and a blink check to stop photo spoofing.'],
    ['emp', 'ci-done', 'Checked in', 'Animated tick with a haptic pulse; the proof is timestamped.'],
    ['emp', 'leave', 'Leave', 'Balances as rings; every request shows a 4-step tracker.'],
    ['emp', 'payslip', 'Payslip', 'Net pay hero with muted decimals; accordion breakdown; share PDF.'],
    ['emp', 'scan', 'Expense scan', 'OCR reads merchant, date, amount and category one field at a time.'],
    ['emp', 'inbox', 'Inbox', 'Swipe left to archive, pull to refresh, Undo instead of dialogs.'],
    ['own', 'ohome', 'Owner home', 'Decision-first: one big number and one plain-language insight.'],
    ['own', 'approvals', 'Approvals', 'Swipe right to approve, left to reject with a reason.'],
    ['own', 'recv', 'Receivables', 'Ageing donut; overdue first; tap for a WhatsApp nudge.'],
    ['own', 'wa', 'WhatsApp reminder', 'Pre-written reminder with a JazzCash / Easypaisa pay link.'],
  ];
  const APPS = { emp: EMP, own: OWN };
  let S = null;

  function mount(sec) {
    const stage = $('#mo-stage', sec);
    S = { sec, stage, mode: 'both', phones: {} };
    ['emp', 'own'].forEach((k) => {
      const dev = $(`.mo-dev[data-dev="${k}"]`, stage);
      const ph = new Phone(APPS[k], $('.mo-dev-in', dev));
      ph.dev = dev; S.phones[k] = ph;
      ph.onNav = (rec) => notes(ph, rec);
      notes(ph, ph.top());
    });
    // gallery
    const g = $('#mo-gallery', sec);
    g.innerHTML = GALLERY.map(([a, sid, cap, ux], i) => `<div class="mo-gcard" role="button" tabindex="0" data-g-app="${a}" data-g-sid="${sid}" style="--i:${i}" aria-label="Open ${cap} in the live ${APPS[a].name}">
        <div class="mo-gthumb"><div class="mo-gscale">${staticPhone(APPS[a], sid, sid === 'wa' ? { c: 'CUST-0002' } : null)}</div></div>
        <div class="mo-gcap"><span class="mo-gtag ${a}">${a === 'emp' ? 'Employee' : 'Owner'}</span><b>${cap}</b><small>${ux}</small><span class="mo-gopen">Open in live phone ${ic('arrow-up-right')}</span></div></div>`).join('');
    FS.icons(g);
    g.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('mo-gcard')) { e.preventDefault(); e.target.click(); } });
    g.addEventListener('click', (e) => {
      const c = e.target.closest('.mo-gcard'); if (!c) return;
      const a = c.dataset.gApp, sid = c.dataset.gSid;
      if (S.mode !== 'both' && S.mode !== a) setMode(a);
      $('#mo-stage', sec).scrollIntoView({ behavior: RM() ? 'auto' : 'smooth', block: 'center' });
      const ph = S.phones[a];
      setTimeout(() => { ph.goto(sid === 'wa' ? 'recv' : sid); if (sid === 'wa') setTimeout(() => ph.push('wa', { c: 'CUST-0002' }), 60); ph.dev.classList.remove('mo-ping'); void ph.dev.offsetWidth; ph.dev.classList.add('mo-ping'); }, RM() ? 0 : 380);
    });
    // mode toggle
    $('#mo-mode', sec).addEventListener('click', (e) => { const b = e.target.closest('[data-mode]'); if (b) setMode(b.dataset.mode); });
    addEventListener('resize', () => S && S.sec.classList.contains('active') && layout());
    layout();
  }
  function setMode(m) {
    S.mode = m;
    $$('#mo-mode [data-mode]', S.sec).forEach((b, i) => { const on = b.dataset.mode === m; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); if (on) $('#mo-mode', S.sec).style.setProperty('--x', i); });
    const devs = $$('.mo-dev', S.stage);
    devs.forEach((d) => d.classList.toggle('mo-off', m !== 'both' && d.dataset.dev !== m));
    S.stage.dataset.mode = m;
    layout();
    if (!RM()) devs.filter((d) => !d.classList.contains('mo-off')).forEach((d, i) => d.animate([{ opacity: 0, transform: 'translateY(16px) scale(.98)' }, { opacity: 1, transform: 'none' }], { duration: 480, delay: i * 70, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' }));
    Object.values(S.phones).forEach((ph) => notes(ph, ph.top()));
  }
  function layout() {
    if (!S) return;
    const sw = S.stage.clientWidth, vh = innerHeight;
    const both = S.mode === 'both', stacked = both && sw < 860;
    const sh = Math.max(0.55, (vh - 96) / H);
    let s;
    if (both && !stacked) s = Math.min(0.9, sh, (sw - 100) / (2 * W));
    else if (stacked) s = Math.min(1, (sw - 8) / W);
    else s = Math.min(1.04, sh, (sw - 8) / W);
    s = Math.max(0.5, s);
    S.stage.classList.toggle('mo-stacked', stacked);
    const room = both ? (sw - 2 * W * s - 80) / 2 : (sw - W * s) / 2;
    S.stage.classList.toggle('mo-has-notes', room > 190);
    Object.values(S.phones).forEach((ph) => {
      ph.scale = s; ph.dev.style.setProperty('--s', s); ph.dev.style.width = W * s + 'px'; ph.dev.style.height = H * s + 'px';
    });
  }
  function notes(ph, rec) {
    const box = $('.mo-notes', ph.dev); if (!box || !rec) return;
    const list = rec.sc.notes || [];
    const single = S && S.mode !== 'both';
    box.innerHTML = list.map((n, i) => { const side = single ? (i % 2 ? 'r' : 'l') : ph.app.key === 'emp' ? 'l' : 'r'; return `<div class="mo-note ${side}" style="top:${n.y * 100}%;--i:${i}"><span class="mo-note-ic">${ic(n.i)}</span><span>${n.t}</span><i class="mo-note-line"></i></div>`; }).join('');
    FS.icons(box);
  }

  FS.onEnter('mobile', (sec, route, first) => {
    if (first) { try { mount(sec); } catch (e) { console.error('[mobile]', e); } }
    else if (S) { layout(); Object.values(S.phones).forEach((ph) => notes(ph, ph.top())); }
  });
  window.FS_MOBILE = { get S() { return S; } };
})();
