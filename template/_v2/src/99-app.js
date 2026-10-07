/* ================= Finsoft v2 shell + router ================= */
(function () {
  const { $, $$ } = FS;
  const PORTALS = ['admin', 'app', 'ess'];
  const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };

  const TOP = {
    admin: {
      ws: { i: 'FC', name: 'Finsoft Cloud', sub: 'Production · PK region' },
      user: { i: 'SJ', name: 'Saim Javed', mail: 'saim@finsoft.pk' },
      card: { title: 'MRR goal · 76%', text: 'Rs 3.85M of Rs 5.0M quarterly target. 14 trials can close the gap.', p: 76, btn: 'View trials', r: 'admin/subscriptions' },
      create: [
        { t: 'Onboard Tenant', s: 'Provision a new organisation', i: 'building-2', r: 'admin/tenants/new' },
        { t: 'New Plan', s: 'Pricing & limits', i: 'tags', r: 'admin/plans', tone: 'tone-violet' },
        { t: 'Announcement', s: 'Notify all tenants', i: 'megaphone', r: 'admin/announcements', tone: 'tone-yellow' },
        { t: 'Support Ticket', s: 'Log on behalf of tenant', i: 'life-buoy', r: 'admin/support', tone: 'tone-blue' },
      ],
      notes: [['triangle-alert', 'Trial expiring', 'Karakoram Tech trial ends in 2 days'], ['credit-card', 'Payment failed', 'Ravi Motors — card declined (INV-P-0931)'], ['life-buoy', 'New P1 ticket', 'Indus Foods: payroll run stuck at review'], ['server', 'Backup completed', 'Nightly snapshot · 02:00 PKT · 41.2 GB']],
    },
    app: {
      ws: { i: 'AN', name: 'Al-Noor Enterprises', sub: 'Growth plan · Lahore HQ' },
      user: { i: 'SJ', name: 'Sana Javed', mail: 'sana@alnoor.com.pk' },
      card: { title: 'Q2 close · 68%', text: 'September is 68% reconciled. 3 bank lines and 2 accruals left before you can lock.', p: 68, btn: 'Close period', r: 'app/periods/close' },
      create: [
        { t: 'Sales Invoice', s: 'Bill a customer', i: 'receipt-text', r: 'app/sales/invoices/new', tone: 'tone-blue' },
        { t: 'Vendor Bill', s: 'Record a purchase', i: 'receipt', r: 'app/purchases/bills/new', tone: 'tone-yellow' },
        { t: 'Journal Voucher', s: 'JV / CPV / CRV / BPV', i: 'file-plus', r: 'app/accounting/vouchers/new' },
        { t: 'Cash Entry', s: 'Cash in / cash out', i: 'banknote', r: 'app/cash/book', tone: 'tone-teal' },
        { sep: true },
        { t: 'Add Employee', s: 'Onboard a new hire', i: 'user-plus', r: 'app/hr/employees/new', tone: 'tone-violet' },
        { t: 'Run Payroll', s: 'October 2026', i: 'wallet-cards', r: 'app/hr/payroll/run', tone: 'tone-red' },
      ],
      notes: [['circle-check', 'Approval needed', 'BPV-2026-000318 · Rs 1,240,000 to Siemens Pakistan'], ['calendar-heart', 'Leave request', 'Fatima Noor — Annual leave 06–10 Oct'], ['triangle-alert', 'Invoice overdue', 'INV-2026-000412 · City Mart Superstores · 18 days'], ['scroll', 'PDC maturing', '3 cheques mature tomorrow · Rs 2,850,000']],
    },
    ess: {
      ws: { i: 'AN', name: 'Al-Noor Enterprises', sub: 'Employee portal' },
      user: { i: 'BK', name: 'Bilal Khan', mail: 'bilal.khan@alnoor.com.pk' },
      card: { title: '14 leave days left', text: 'Annual 9 · Casual 5. Plan a break before the December freeze.', p: 58, btn: 'Apply leave', r: 'ess/leave' },
      create: [
        { t: 'Apply Leave', s: 'Annual · Casual · Sick', i: 'plane', r: 'ess/leave' },
        { t: 'Expense Claim', s: 'Submit receipts', i: 'receipt', r: 'ess/expenses', tone: 'tone-yellow' },
        { t: 'Request Advance', s: 'Salary advance / loan', i: 'hand-coins', r: 'ess/loans', tone: 'tone-teal' },
        { t: 'Attendance Correction', s: 'Missed punch', i: 'clock-alert', r: 'ess/attendance', tone: 'tone-blue' },
      ],
      notes: [['file-text', 'Payslip ready', 'September 2026 payslip is available'], ['circle-check', 'Leave approved', 'Casual leave on 25 Sep approved by Ayesha Noor']],
    },
  };

  /* ---------- boot: entry screens, route index ---------- */
  const screens = {};
  $$('.screen').forEach((s) => {
    const r = s.dataset.route; if (!r) return;
    screens[r] = s;
    if (!PORTALS.includes(r.split('/')[0])) $('#entry').appendChild(s);
  });

  /* ---------- nav model ---------- */
  function navIndex(p) {
    const out = []; const n = NAV[p];
    n.tiles.forEach((t) => out.push({ r: t.r, label: t.label, icon: t.icon, trail: [] }));
    n.groups.forEach((g) => g.modules.forEach((m) => {
      if (m.r) out.push({ r: m.r, label: m.label, icon: m.icon, trail: [g.title] });
      (m.children || []).forEach((c) => out.push({ r: c.r, label: c.label, icon: c.icon, trail: [g.title, m.label] }));
    }));
    return out;
  }

  /* ---------- sidebar ---------- */
  let currentPortal = null;
  let currentRoute = '';
  const pinKey = (p) => 'fs-pins-' + p;
  function renderSidebar(p) {
    const n = NAV[p], t = TOP[p];
    const sb = $('#sidebar');
    const pins = store.get(pinKey(p), []);
    const idx = navIndex(p);
    const cnt = (b) => (b ? `<em class="sb-count">${b}</em>` : '');
    const pinBtn = (r) => `<button class="sb-pin ${pins.includes(r) ? 'on' : ''}" data-pin="${r}" title="Pin to favourites"><i data-lucide="star"></i></button>`;
    const item = (o) => `<a class="sb-item" href="#/${o.r}" data-r="${o.r}" data-label="${o.label}"><i data-lucide="${o.icon}"></i><span class="sb-label">${o.label}</span>${cnt(o.badge)}${pinBtn(o.r)}</a>`;
    const mod = (m) => {
      if (!m.children) return item(m);
      const total = m.children.reduce((s, c) => s + (+c.badge || 0), 0);
      return `<div class="sb-mod" data-mod="${m.label}"><button class="sb-item sb-parent" type="button" data-label="${m.label}"><i data-lucide="${m.icon}"></i><span class="sb-label">${m.label}</span>${total ? cnt(total) : ''}<i class="sb-chev" data-lucide="chevron-right"></i></button>
        <div class="sb-sub"><div class="sb-sub-in">${m.children.map((c) => `<a class="sb-leaf" href="#/${c.r}" data-r="${c.r}" data-label="${c.label}"><span class="sb-label">${c.label}</span>${cnt(c.badge)}${pinBtn(c.r)}</a>`).join('')}</div></div></div>`;
    };
    const shut = store.get('fs-shut-' + p, []);
    const sec = (key, title, inner) => `<div class="sb-sec ${shut.includes(key) ? 'shut' : ''}" data-sec="${key}"><button class="sb-sec-h" type="button">${title}<i data-lucide="chevron-down"></i></button><div class="sb-sec-b"><div class="sb-sec-in">${inner}</div></div></div>`;
    const pinned = pins.map((r) => idx.find((x) => x.r === r)).filter(Boolean);
    const card = store.get('fs-card-' + p, true) ? `<div class="sb-card"><button class="x" data-card-x><i data-lucide="x"></i></button><b>${t.card.title}</b><p>${t.card.text}</p><div class="progress lime"><i style="width:${t.card.p}%"></i></div><div class="row"><a class="btn lime sm" href="#/${t.card.r}">${t.card.btn}</a><a class="btn ghost sm" href="#/${p === 'app' ? 'app/today' : p + '/dashboard'}">Learn more</a></div></div>` : '';
    const tools = p === 'app'
      ? [{ r: 'app/settings', label: 'Settings', icon: 'settings' }, { r: 'app/states', label: 'Help Center', icon: 'circle-help' }]
      : p === 'admin' ? [{ r: 'admin/system', label: 'System', icon: 'settings' }, { r: 'admin/support', label: 'Help Center', icon: 'circle-help' }]
      : [{ r: 'ess/profile', label: 'Settings', icon: 'settings' }, { r: 'ess/company', label: 'Help Center', icon: 'circle-help' }];
    sb.innerHTML = `
      <div class="sb-top"><a class="sb-logo" href="#/chooser"><span class="sb-mark"><i data-lucide="activity"></i></span><b>Finsoft</b></a>
        <button class="sb-collapse" id="sbCollapse" type="button" aria-label="Collapse sidebar"><i data-lucide="panel-left"></i></button></div>
      <div class="pop-wrap"><button class="sb-ws" data-pop="popWs"><span class="sb-ws-ava">${t.ws.i}</span><div><b>${t.ws.name}</b><small>${t.ws.sub}</small></div><i data-lucide="chevrons-up-down"></i></button>
        <div class="pop left" id="popWs" style="left:14px;min-width:260px">${wsMenu(p)}</div></div>
      <label class="sb-find"><i data-lucide="search"></i><input id="sbFind" placeholder="Search menu…" autocomplete="off"><kbd>/</kbd></label>
      <div class="sb-scroll" id="sbScroll"><nav class="sb-nav" id="sbNav"><span class="sb-hl" id="sbHl"></span>
        ${pinned.length ? sec('pinned', 'Pinned', pinned.map((o) => item(o)).join('')) : ''}
        ${sec('menu', 'Menu', n.tiles.map(item).join(''))}
        ${n.groups.map((g) => sec(g.title, g.title, g.modules.map(mod).join(''))).join('')}
        <div class="sb-empty sb-hidden" id="sbEmpty">No menu items match.</div>
      </nav></div>
      <div class="sb-bottom">${sec('tools', 'Tools', tools.map(item).join(''))}${card}</div>`;
  }
  function wsMenu(p) {
    if (p === 'app') return `<div class="pop-title">Companies</div>
      <a class="pop-item" href="#/app/dashboard"><span><i data-lucide="building-2"></i></span><div><b>Al-Noor Enterprises (Pvt) Ltd</b><small>ALNOOR · Growth plan</small></div></a>
      <a class="pop-item" href="#/app/dashboard" data-toast="Switched to Al-Noor Foods (demo)"><span class="tone-yellow"><i data-lucide="building"></i></span><div><b>Al-Noor Foods</b><small>ALNFOODS · Starter plan</small></div></a>
      <div class="pop-sep"></div><div class="pop-title">Branch</div>
      ${['All branches', 'Lahore HQ', 'Karachi', 'Islamabad', 'Faisalabad'].map((b, i) => `<button class="pop-item" data-toast="Branch filter: ${b}"><span class="${i ? 'tone-teal' : ''}"><i data-lucide="${i ? 'map-pin' : 'layers'}"></i></span><div><b>${b}</b></div></button>`).join('')}`;
    return `<div class="pop-title">Workspace</div><a class="pop-item" href="#/${p}/dashboard"><span><i data-lucide="${p === 'admin' ? 'cloud' : 'building-2'}"></i></span><div><b>${TOP[p].ws.name}</b><small>${TOP[p].ws.sub}</small></div></a>`;
  }

  /* nav filter */
  function filterNav(q) {
    q = q.trim().toLowerCase();
    const nav = $('#sbNav'); if (!nav) return;
    let any = false;
    $$('.sb-label mark', nav).forEach((m) => m.replaceWith(m.textContent));
    $$('.sb-label', nav).forEach((l) => l.normalize());
    $$('.sb-sec', nav).forEach((sec) => {
      let secHit = false;
      $$('.sb-sec-in > .sb-item, .sb-sec-in > .sb-mod', sec).forEach((el) => {
        if (el.classList.contains('sb-mod')) {
          const own = el.querySelector('.sb-parent').dataset.label.toLowerCase().includes(q);
          let kid = false;
          $$('.sb-leaf', el).forEach((l) => { const h = !q || own || l.dataset.label.toLowerCase().includes(q); l.classList.toggle('sb-hidden', !h); if (h && q && !own) { kid = true; mark(l, q); } });
          const show = !q || own || kid;
          el.classList.toggle('sb-hidden', !show);
          if (q) el.classList.toggle('open', kid || own);
          if (own && q) mark(el.querySelector('.sb-parent'), q);
          if (show) secHit = true;
        } else {
          const h = !q || el.dataset.label.toLowerCase().includes(q);
          el.classList.toggle('sb-hidden', !h);
          if (h && q) mark(el, q);
          if (h) secHit = true;
        }
      });
      sec.classList.toggle('sb-hidden', !secHit);
      if (q && secHit) sec.classList.remove('shut');
      if (secHit) any = true;
    });
    $('#sbEmpty').classList.toggle('sb-hidden', any);
    if (!q) setActiveNav(currentRoute); else $('#sbHl').classList.remove('on');
  }
  function mark(el, q) {
    const lab = el.querySelector('.sb-label'); if (!lab) return;
    const t = lab.textContent, i = t.toLowerCase().indexOf(q);
    if (i < 0) return;
    lab.innerHTML = `${t.slice(0, i)}<mark>${t.slice(i, i + q.length)}</mark>${t.slice(i + q.length)}`;
  }

  /* active nav + sliding highlight */
  function setActiveNav(route, keepOpen) {
    const nav = $('#sbNav'); if (!nav) return;
    $$('[data-r].active, .sb-parent.current', $('#sidebar')).forEach((a) => a.classList.remove('active', 'current'));
    let el = $(`.sb-sec:not([data-sec=pinned]) [data-r="${CSS.escape(route)}"]`, nav);
    if (!el) { let best = null, len = 0; $$('.sb-sec:not([data-sec=pinned]) [data-r]', nav).forEach((a) => { const r = a.dataset.r; if (route.startsWith(r + '/') && r.length > len) { best = a; len = r.length; } }); el = best; }
    $$(`.sb-sec[data-sec=pinned] [data-r="${CSS.escape(route)}"], .sb-bottom [data-r="${CSS.escape(route)}"]`).forEach((a) => a.classList.add('active'));
    if (!keepOpen) $$('.sb-mod.open', nav).forEach((m) => { if (!el || !m.contains(el)) m.classList.remove('open'); });
    if (!el) { $('#sbHl').classList.remove('on'); return; }
    el.classList.add('active');
    const mod = el.closest('.sb-mod');
    if (mod) { mod.classList.add('open'); mod.querySelector('.sb-parent').classList.add('current'); }
    const sec = el.closest('.sb-sec'); if (sec) sec.classList.remove('shut');
    moveHl(el);
    setTimeout(() => moveHl(el, true), 360);
  }
  function moveHl(el, scroll) {
    const hl = $('#sbHl'), nav = $('#sbNav'); if (!hl || !el || !el.offsetParent) return;
    const top = el.getBoundingClientRect().top - nav.getBoundingClientRect().top;
    hl.style.transform = `translateY(${top}px)`; hl.style.height = el.offsetHeight + 'px';
    hl.style.left = (el.classList.contains('sb-leaf') ? 19 : 0) + 'px';
    hl.classList.add('on');
    if (scroll) {
      const sc = $('#sbScroll'), r = el.getBoundingClientRect(), sr = sc.getBoundingClientRect();
      if (r.top < sr.top + 40 || r.bottom > sr.bottom - 40) sc.scrollTo({ top: sc.scrollTop + r.top - sr.top - sr.height / 3, behavior: 'smooth' });
    }
  }

  /* collapsed-rail flyouts */
  let fly = null;
  const killFly = () => { if (fly) { fly.remove(); fly = null; } };
  function railMode() { return $('#shell').classList.contains('collapsed') || (innerWidth <= 1100 && innerWidth > 780); }
  document.addEventListener('mouseover', (e) => {
    if (!railMode()) return;
    const it = e.target.closest('#sidebar .sb-item, #sidebar .sb-mod');
    if (!it) { if (fly && !e.target.closest('.sb-fly')) killFly(); return; }
    const mod = it.closest('.sb-mod');
    const anchor = mod ? mod.querySelector('.sb-parent') : it;
    if (fly && fly.dataset.for === anchor.dataset.label) return;
    killFly();
    const r = anchor.getBoundingClientRect();
    if (mod) {
      fly = document.createElement('div'); fly.className = 'sb-fly';
      fly.innerHTML = `<h5>${anchor.dataset.label}</h5>` + $$('.sb-leaf', mod).map((l) => `<a href="${l.getAttribute('href')}" class="${l.classList.contains('active') ? 'active' : ''}"><i data-lucide="dot"></i>${l.dataset.label}</a>`).join('');
      fly.style.left = r.right + 10 + 'px'; fly.style.top = Math.max(8, Math.min(r.top - 8, innerHeight - 40 - mod.querySelectorAll('.sb-leaf').length * 36)) + 'px';
    } else {
      fly = document.createElement('div'); fly.className = 'sb-tipfly'; fly.textContent = anchor.dataset.label;
      fly.style.left = r.right + 12 + 'px'; fly.style.top = r.top + r.height / 2 - 14 + 'px';
    }
    fly.dataset.for = anchor.dataset.label;
    document.body.appendChild(fly); FS.icons(fly);
  });
  document.addEventListener('click', (e) => { if (e.target.closest('.sb-fly a')) killFly(); });

  /* ---------- topbar ---------- */
  function renderTopbar(p) {
    const t = TOP[p];
    const createItems = t.create.map((c) => c.sep ? '<div class="pop-sep"></div>' : `<a class="pop-item" href="#/${c.r}"><span class="${c.tone || ''}"><i data-lucide="${c.i}"></i></span><div><b>${c.t}</b><small>${c.s}</small></div></a>`).join('');
    $('#topbar').innerHTML = `
      <button class="menu-btn" id="menuBtn" aria-label="Open menu"><i data-lucide="menu"></i></button>
      <nav class="crumbs" id="crumbs"></nav>
      <div class="top-actions">
        <button class="top-search" data-palette><i data-lucide="search"></i><span>Search anything…</span><kbd class="kbd">Ctrl K</kbd></button>
        <div class="pop-wrap"><button class="create-btn" data-pop="popCreate"><i data-lucide="plus"></i><span>Create</span></button><div class="pop" id="popCreate">${createItems}</div></div>
        <button class="round-btn theme-btn" id="themeBtn" aria-label="Toggle theme" data-tip="Toggle light / dark"><i class="ic-sun" data-lucide="sun"></i><i class="ic-moon" data-lucide="moon"></i></button>
        <div class="pop-wrap"><button class="round-btn" data-pop="popNotif" aria-label="Notifications"><i data-lucide="bell"></i><em></em></button>
          <div class="pop notif-pop" id="popNotif"><h3>Notifications <a class="link small" href="#/${p === 'app' ? 'app/notifications' : p + '/dashboard'}">View all</a></h3>
          ${t.notes.map((n) => `<div class="n"><span class="icon-well sm"><i data-lucide="${n[0]}"></i></span><div><b>${n[1]}</b>${n[2]}</div></div>`).join('')}</div></div>
        <div class="pop-wrap"><button class="user-pill" data-pop="popUser"><span class="avatar">${t.user.i}</span><div><b>${t.user.name}</b><small>${t.user.mail}</small></div><i data-lucide="chevron-down"></i></button>
          <div class="pop" id="popUser">
            <div class="pop-title">Switch portal</div>
            <a class="pop-item" href="#/admin/dashboard"><span class="tone-blue"><i data-lucide="shield-check"></i></span><div><b>Platform Admin</b><small>Tenants, plans & billing</small></div></a>
            <a class="pop-item" href="#/app/dashboard"><span><i data-lucide="building-2"></i></span><div><b>Company Workspace</b><small>Accounting & HRMS</small></div></a>
            <a class="pop-item" href="#/ess/dashboard"><span class="tone-teal"><i data-lucide="user-round"></i></span><div><b>Employee Self-Service</b><small>My attendance, leave & pay</small></div></a>
            <div class="pop-sep"></div>
            <a class="pop-item" href="#/${p === 'ess' ? 'ess/profile' : 'app/profile'}"><span class="tone-violet"><i data-lucide="circle-user"></i></span><div><b>My Profile</b><small>Security & preferences</small></div></a>
            <a class="pop-item" href="#/login"><span class="tone-red"><i data-lucide="log-out"></i></span><div><b>Sign out</b></div></a>
          </div></div>
      </div>`;
  }
  const titleCase = (s) => s.toLowerCase().replace(/(^|[\s&])(\w)/g, (m, a, b) => a + b.toUpperCase());
  function setCrumbs(p, route, target) {
    const hit = navIndex(p).find((x) => x.r === route);
    const portal = { admin: 'Platform', app: 'Workspace', ess: 'Self-Service' }[p];
    const parts = hit ? hit.trail : [];
    const title = (hit && hit.label) || (target && target.dataset.title) || '';
    $('#crumbs').innerHTML = `<a class="crumb-home" href="#/${p}/dashboard"><i data-lucide="house"></i></a><span>${portal}</span>${parts.map((x) => `<i data-lucide="chevron-right"></i><span>${titleCase(x)}</span>`).join('')}<i data-lucide="chevron-right"></i><b>${title}</b>`;
    FS.icons($('#crumbs'));
  }

  /* ---------- router ---------- */
  function go() {
    let route = decodeURIComponent(location.hash.replace(/^#\/?/, '')).replace(/\/$/, '');
    if (!route) route = 'chooser';
    let portal = route.split('/')[0];
    if (!PORTALS.includes(portal)) portal = null;
    let target = screens[route];
    if (!target) target = portal ? (screens[portal + '/404'] || screens['app/404']) : screens['chooser'];
    const prev = $('.screen.active');
    if (prev && prev === target && FS.route() === route) return;
    $$('.screen.active').forEach((s) => s.classList.remove('active'));
    FS.closeOverlays(); FS.closeMenu(); killFly(); closePops();
    currentRoute = route;
    if (portal) {
      document.body.classList.add('in-portal');
      if (portal !== currentPortal) { renderSidebar(portal); renderTopbar(portal); currentPortal = portal; FS.icons($('#app')); }
      const f = $('#sbFind'); if (f && f.value) { f.value = ''; filterNav(''); }
      setActiveNav(route);
      setCrumbs(portal, route, target);
    } else document.body.classList.remove('in-portal');
    if (target) {
      target.classList.add('active');
      document.title = (target.dataset.title || 'Finsoft') + ' · Finsoft';
      $$('.org', target).forEach((o) => { o.scrollLeft = (o.scrollWidth - o.clientWidth) / 2; });
      FS._enter(target, route);
    }
    $('#shell').classList.remove('mobile-open');
    FS.updateBulk && FS.updateBulk();
    window.scrollTo(0, 0);
  }
  FS.go = (r) => { location.hash = '#/' + r; };
  FS.route = () => currentRoute;

  /* ---------- popovers ---------- */
  function closePops() { $$('.pop.open').forEach((p) => p.classList.remove('open')); }

  /* ---------- palette ---------- */
  function paletteItems() {
    const items = [];
    PORTALS.forEach((p) => { const label = { admin: 'Platform Admin', app: 'Workspace', ess: 'Self-Service' }[p]; navIndex(p).forEach((x) => items.push({ t: x.label, r: x.r, i: x.icon, g: [label, ...x.trail.map(titleCase)].join(' · ') })); });
    Object.keys(screens).forEach((r) => { if (!items.some((x) => x.r === r)) items.push({ t: screens[r].dataset.title || r, r, i: 'file', g: r.split('/')[0] }); });
    return items;
  }
  let PAL = null, palIdx = 0;
  function renderPalette(q) {
    PAL = PAL || paletteItems();
    q = (q || '').toLowerCase().trim();
    const list = PAL.filter((x) => !q || (x.t + ' ' + x.g + ' ' + x.r).toLowerCase().includes(q)).slice(0, 40);
    palIdx = 0;
    $('#paletteList').innerHTML = list.length ? list.map((x, i) => `<a href="#/${x.r}" class="${i === 0 ? 'hl' : ''}"><i data-lucide="${x.i}"></i>${x.t}<small>${x.g}</small></a>`).join('') : '<div class="empty-state"><h4>No matches</h4><p>Try another keyword.</p></div>';
    FS.icons($('#paletteList'));
  }
  function openPalette() { FS.openModal('palette'); $('#paletteInput').value = ''; renderPalette(''); setTimeout(() => $('#paletteInput').focus(), 30); }
  $('#paletteInput').addEventListener('input', (e) => renderPalette(e.target.value));
  $('#paletteInput').addEventListener('keydown', (e) => {
    const links = $$('#paletteList a'); if (!links.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); links[palIdx].classList.remove('hl'); palIdx = (palIdx + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length; links[palIdx].classList.add('hl'); links[palIdx].scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'Enter') { e.preventDefault(); location.hash = links[palIdx].getAttribute('href'); FS.closeOverlays(); }
  });

  /* ---------- wizard ---------- */
  function wizardGo(w, idx) {
    const panes = $$(':scope > .wz-pane', w).length ? $$(':scope > .wz-pane', w) : $$('.wz-pane', w);
    const steps = $$('.steps li', w);
    idx = Math.max(0, Math.min(panes.length - 1, idx));
    panes.forEach((p, i) => p.classList.toggle('active', i === idx));
    steps.forEach((s, i) => { s.classList.toggle('active', i === idx); s.classList.toggle('done', i < idx); });
    w.dataset.step = idx;
    w.scrollIntoView({ behavior: 'smooth', block: 'start' });
    FS.enhance(w);
  }

  /* ---------- delegated events ---------- */
  document.addEventListener('click', (e) => {
    const t = e.target;
    const popBtn = t.closest('[data-pop]');
    if (popBtn) { const pop = document.getElementById(popBtn.dataset.pop); const was = pop.classList.contains('open'); closePops(); if (!was) { pop.classList.add('open'); FS.icons(pop); } e.stopPropagation(); return; }
    if (!t.closest('.pop')) closePops(); else if (t.closest('a, button')) setTimeout(closePops, 0);

    if (t.closest('[data-palette]')) { openPalette(); return; }
    const themeEl = t.closest('#themeBtn, [data-theme-toggle]');
    if (themeEl) { FS.setTheme(FS.theme() === 'dark' ? 'light' : 'dark', themeEl); return; }
    if (t.closest('#sbCollapse')) { $('#shell').classList.toggle('collapsed'); store.set('fs-collapsed', $('#shell').classList.contains('collapsed')); setTimeout(() => setActiveNav(currentRoute, true), 340); return; }
    if (t.closest('#menuBtn')) { $('#shell').classList.add('mobile-open'); return; }
    if (t.closest('#mobileScrim')) { $('#shell').classList.remove('mobile-open'); return; }
    const pin = t.closest('[data-pin]');
    if (pin) {
      e.preventDefault(); e.stopPropagation();
      const pins = store.get(pinKey(currentPortal), []); const r = pin.dataset.pin; const i = pins.indexOf(r);
      if (i > -1) pins.splice(i, 1); else pins.unshift(r);
      store.set(pinKey(currentPortal), pins.slice(0, 8));
      renderSidebar(currentPortal); FS.icons($('#sidebar')); setActiveNav(currentRoute);
      FS.toast(i > -1 ? 'Removed from pinned' : 'Pinned to your sidebar', { tone: 'info', ms: 2200 });
      return;
    }
    if (t.closest('[data-card-x]')) { store.set('fs-card-' + currentPortal, false); const c = t.closest('.sb-card'); c.style.transition = 'opacity .25s, transform .25s'; c.style.opacity = '0'; c.style.transform = 'translateY(10px)'; setTimeout(() => c.remove(), 250); return; }
    const secH = t.closest('.sb-sec-h');
    if (secH) { const s = secH.parentElement; s.classList.toggle('shut'); const shut = $$('.sb-sec.shut', $('#sidebar')).map((x) => x.dataset.sec); store.set('fs-shut-' + currentPortal, shut); setTimeout(() => setActiveNav(currentRoute, true), 330); return; }
    const parent = t.closest('.sb-parent');
    if (parent) {
      if (railMode()) { const first = parent.closest('.sb-mod').querySelector('.sb-leaf'); if (first) location.hash = first.getAttribute('href'); return; }
      parent.closest('.sb-mod').classList.toggle('open');
      setTimeout(() => setActiveNav(currentRoute, true), 330);
      return;
    }

    const tabBtn = t.closest('[data-tab]');
    if (tabBtn) {
      const scope = tabBtn.closest('[data-tabs]');
      if (scope) {
        const key = tabBtn.dataset.tab;
        $$('[data-tab]', scope).filter((b) => b.closest('[data-tabs]') === scope).forEach((b) => b.classList.toggle('active', b.dataset.tab === key));
        $$('[data-pane]', scope).filter((p) => p.closest('[data-tabs]') === scope).forEach((p) => { const on = p.dataset.pane === key; p.classList.toggle('active', on); if (on) { FS.enhance(p); FS.animateIn(p); } });
        const tabs = tabBtn.closest('.tabs'); if (tabs) FS.positionInk(tabs);
      }
    }
    const chip = t.closest('.chips > button, .seg > button');
    if (chip && !chip.dataset.tab) { $$(':scope > button', chip.parentElement).forEach((b) => b.classList.remove('active')); chip.classList.add('active'); if (chip.parentElement.classList.contains('chips')) FS.chipFilter(chip); }
    const ck = t.closest('.ck');
    if (ck && !ck.querySelector('input')) ck.classList.toggle('on');
    const sel = t.closest('[data-select] > *');
    if (sel) { $$(':scope > *', sel.parentElement).forEach((c) => c.classList.remove('selected')); sel.classList.add('selected'); }
    const tr = t.closest('.tree-row');
    if (tr && tr.closest('.tree')) { $$('.tree-row.selected', tr.closest('.tree')).forEach((r) => r.classList.remove('selected')); tr.classList.add('selected'); }
    const pg = t.closest('.pager button');
    if (pg && /^\d+$/.test(pg.textContent.trim())) { $$('button', pg.parentElement).forEach((b) => b.classList.remove('active')); pg.classList.add('active'); }

    const wz = t.closest('[data-wizard]');
    if (wz) {
      const cur = +(wz.dataset.step || 0);
      if (t.closest('[data-next]')) { e.preventDefault(); wizardGo(wz, cur + 1); }
      else if (t.closest('[data-prev]')) { e.preventDefault(); wizardGo(wz, cur - 1); }
      else { const li = t.closest('.steps li'); if (li) wizardGo(wz, $$('.steps li', wz).indexOf(li)); }
    }
    const opener = t.closest('[data-open]');
    if (opener) { e.preventDefault(); FS.openModal(opener.dataset.open); }
    if (t.closest('[data-close]') || t.classList.contains('overlay')) { const o = t.closest('.overlay'); if (o) FS.closeOverlay(o); }
    const tb = t.closest('[data-toast]');
    if (tb) FS.toast(tb.dataset.toast);
    if (t.closest('#paletteList a')) FS.closeOverlays();
    const a = t.closest('a[href="#"]');
    if (a) e.preventDefault();
  });

  document.addEventListener('input', (e) => { if (e.target.id === 'sbFind') { filterNav(e.target.value); if (e.target.value) $('#sbScroll').scrollTop = 0; } });
  document.addEventListener('keydown', (e) => {
    if (e.target.id === 'sbFind') {
      if (e.key === 'Escape') { e.target.value = ''; filterNav(''); e.target.blur(); }
      if (e.key === 'Enter') { const first = $$('#sbNav [data-r]').find((a) => !a.closest('.sb-hidden') && a.offsetParent); if (first) location.hash = first.getAttribute('href'); e.target.blur(); }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); }
    if (e.key === '/' && !e.target.closest('input, textarea, select, [contenteditable]') && $('#sbFind') && document.body.classList.contains('in-portal')) { e.preventDefault(); $('#sbFind').focus(); }
    if (e.key === 'Escape') { FS.closeOverlays(); FS.closeMenu(); closePops(); }
  });
  addEventListener('scroll', () => { const tb = $('#topbar'); if (tb) tb.classList.toggle('scrolled', scrollY > 8); }, { passive: true });
  addEventListener('resize', () => setActiveNav(currentRoute, true));
  window.addEventListener('hashchange', go);

  $$('[data-wizard]').forEach((w) => { if (!$('.wz-pane.active', w)) { const p = $('.wz-pane', w); if (p) p.classList.add('active'); } });
  if (store.get('fs-collapsed', false)) $('#shell').classList.add('collapsed');
  const et = document.createElement('button');
  et.className = 'round-btn theme-btn entry-theme'; et.setAttribute('data-theme-toggle', ''); et.setAttribute('aria-label', 'Toggle theme');
  et.innerHTML = '<i class="ic-sun" data-lucide="sun"></i><i class="ic-moon" data-lucide="moon"></i>';
  $('#entry').appendChild(et);

  /* ---------- self-check ---------- */
  window.fsCheck = function () {
    const missing = [];
    PORTALS.forEach((p) => navIndex(p).forEach((x) => { if (!screens[x.r]) missing.push(x.r); }));
    const badLinks = [];
    $$('a[href^="#/"]').forEach((a) => { const r = a.getAttribute('href').slice(2); if (!screens[r]) badLinks.push(r); });
    const res = { screens: Object.keys(screens).length, missingNav: [...new Set(missing)], brokenLinks: [...new Set(badLinks)] };
    console.log('[Finsoft self-check]', res);
    return res;
  };

  go();
  FS.icons();
})();
