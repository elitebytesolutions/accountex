/* ================= Finsoft prototype runtime ================= */
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const PORTALS = ['admin', 'app', 'ess'];
  const icons = () => { if (window.lucide) lucide.createIcons({ attrs: { 'stroke-width': 1.8 } }); };

  /* ---------- per-portal topbar config ---------- */
  const TOP = {
    admin: {
      company: 'Finsoft Cloud', companyIcon: 'cloud', search: 'Search tenants, invoices, tickets, users…',
      user: { i: 'SJ', name: 'Saim Javed', role: 'Super Admin' }, notif: 4,
      create: [
        { t: 'Onboard Tenant', s: 'Provision a new organisation', i: 'building-2', r: 'admin/tenants/new' },
        { t: 'New Plan', s: 'Pricing & limits', i: 'tags', r: 'admin/plans', tone: 'tone-violet' },
        { t: 'Announcement', s: 'Notify all tenants', i: 'megaphone', r: 'admin/announcements', tone: 'tone-yellow' },
        { t: 'Support Ticket', s: 'Log on behalf of tenant', i: 'life-buoy', r: 'admin/support', tone: 'tone-blue' },
      ],
      notes: [
        ['alert-triangle', 'Trial expiring', 'Karakoram Tech trial ends in 2 days'],
        ['credit-card', 'Payment failed', 'Ravi Motors — card declined (INV-P-0931)'],
        ['life-buoy', 'New P1 ticket', 'Indus Foods: payroll run stuck at review'],
        ['server', 'Backup completed', 'Nightly snapshot · 02:00 PKT · 41.2 GB'],
      ],
    },
    app: {
      company: 'Al-Noor Enterprises', companyIcon: 'building-2', search: 'Search anything… (Customers, Invoices, Employees, Accounts, Reports)',
      user: { i: 'SJ', name: 'Sana Javed', role: 'Finance Manager' }, notif: 7,
      branches: ['All branches', 'Lahore HQ', 'Karachi', 'Islamabad', 'Faisalabad'],
      create: [
        { t: 'Sales Invoice', s: 'Bill a customer', i: 'receipt-text', r: 'app/sales/invoices/new', tone: 'tone-blue' },
        { t: 'Vendor Bill', s: 'Record a purchase', i: 'receipt', r: 'app/purchases/bills/new', tone: 'tone-yellow' },
        { t: 'Journal Voucher', s: 'JV / CPV / CRV / BPV', i: 'file-plus', r: 'app/accounting/vouchers/new' },
        { t: 'Receive Payment', s: 'Customer receipt', i: 'hand-coins', r: 'app/receivables/receipts', tone: 'tone-teal' },
        { sep: true },
        { t: 'Add Employee', s: 'Onboard a new hire', i: 'user-plus', r: 'app/hr/employees/new', tone: 'tone-violet' },
        { t: 'Run Payroll', s: 'October 2026', i: 'wallet-cards', r: 'app/hr/payroll/run', tone: 'tone-red' },
      ],
      notes: [
        ['circle-check', 'Approval needed', 'BPV-2026-000318 · Rs 1,240,000 to Siemens Pakistan'],
        ['calendar-heart', 'Leave request', 'Fatima Noor — Annual leave 06–10 Oct'],
        ['alert-triangle', 'Invoice overdue', 'INV-2026-000412 · City Mart Superstores · 18 days'],
        ['scroll', 'PDC maturing', '3 cheques mature tomorrow · Rs 2,850,000'],
      ],
    },
    ess: {
      company: 'Al-Noor Enterprises', companyIcon: 'building-2', search: 'Search payslips, policies, colleagues…',
      user: { i: 'BK', name: 'Bilal Khan', role: 'Sales Executive' }, notif: 2,
      create: [
        { t: 'Apply Leave', s: 'Annual · Casual · Sick', i: 'plane', r: 'ess/leave' },
        { t: 'Expense Claim', s: 'Submit receipts', i: 'receipt', r: 'ess/expenses', tone: 'tone-yellow' },
        { t: 'Request Advance', s: 'Salary advance / loan', i: 'hand-coins', r: 'ess/loans', tone: 'tone-teal' },
        { t: 'Attendance Correction', s: 'Missed punch', i: 'clock-alert', r: 'ess/attendance', tone: 'tone-blue' },
      ],
      notes: [
        ['file-text', 'Payslip ready', 'September 2026 payslip is available'],
        ['circle-check', 'Leave approved', 'Casual leave on 25 Sep approved by Ayesha Noor'],
      ],
    },
  };

  /* ---------- boot: move entry screens, index routes ---------- */
  const screens = {};
  $$('.screen').forEach((s) => {
    const r = s.dataset.route;
    if (!r) return;
    screens[r] = s;
    if (!PORTALS.includes(r.split('/')[0])) $('#entry').appendChild(s);
  });

  /* ---------- sidebar ---------- */
  function renderSidebar(p) {
    const n = NAV[p];
    const sb = $('#sidebar');
    const shell = $('#shell');
    shell.classList.remove('portal-admin', 'portal-app', 'portal-ess');
    shell.classList.add('portal-' + p);
    const leaf = (c) => `<a class="sb-leaf" href="#/${c.r}" data-r="${c.r}"><span class="sb-dot"></span><span class="sb-leaf-icon"><i data-lucide="${c.icon}"></i></span><span class="sb-leaf-label">${c.label}</span></a>`;
    const mod = (m) => m.children
      ? `<div class="sb-module"><button class="sb-head" type="button"><span class="sb-head-icon"><i data-lucide="${m.icon}"></i></span><span class="sb-head-text"><b>${m.label}</b><small>${m.desc}</small></span><i class="chev" data-lucide="chevron-right"></i></button>
         <div class="sb-subbox"><div class="sb-clip"><div class="sb-children">${m.children.map(leaf).join('')}</div></div></div></div>`
      : `<div class="sb-module"><a class="sb-link" href="#/${m.r}" data-r="${m.r}"><span class="sb-head-icon plain"><i data-lucide="${m.icon}"></i></span><span class="sb-head-text"><b>${m.label}</b><small>${m.desc}</small></span><i class="chev" data-lucide="chevron-right"></i></a></div>`;
    sb.innerHTML = `
      <div class="sb-brand">
        <a class="sb-mark" href="#/chooser" title="Switch portal"><i data-lucide="activity"></i></a>
        <div class="sb-brand-text"><b>${n.brand.title}</b><small>${n.brand.sub}</small></div>
        <button class="sb-collapse" id="sbCollapse" type="button" aria-label="Collapse sidebar"><i data-lucide="chevrons-left"></i></button>
      </div>
      <div class="sb-search" data-palette><i data-lucide="search"></i><span>Search anything...</span><kbd>Ctrl K</kbd></div>
      <div class="sb-tiles">${n.tiles.map((t) => `<a class="sb-tile" href="#/${t.r}" data-r="${t.r}"><span class="sb-tile-icon"><i data-lucide="${t.icon}"></i></span><span class="sb-tile-text"><b>${t.label}</b><small>${t.sub}</small></span></a>`).join('')}</div>
      <nav class="sb-nav">${n.groups.map((g) => `
        <div class="sb-group">
          <div class="sb-section"><span class="sb-section-title">${g.title}</span><span class="sb-section-line"></span><span class="sb-section-tag"><i data-lucide="${g.tagIcon}"></i><span>${g.tag}</span></span></div>
          <div class="sb-modules">${g.modules.map(mod).join('')}</div>
        </div>`).join('')}
      </nav>
      <div class="sb-foot"><span class="sb-avatar">${n.foot.initials}</span><div class="sb-foot-text"><b>${n.foot.name}</b><small>${n.foot.role}</small></div><a class="sb-more" href="#/chooser" title="Switch portal"><i data-lucide="more-horizontal"></i></a></div>`;
  }

  /* ---------- topbar ---------- */
  function renderTopbar(p) {
    const t = TOP[p];
    const createItems = t.create.map((c) => c.sep ? '<div class="pop-sep"></div>' :
      `<a class="pop-item" href="#/${c.r}"><span class="${c.tone || ''}"><i data-lucide="${c.i}"></i></span><div><b>${c.t}</b><small>${c.s}</small></div></a>`).join('');
    const companyMenu = p === 'app'
      ? `<div class="pop-title">Switch company</div>
         <a class="pop-item" href="#/app/dashboard"><span><i data-lucide="building-2"></i></span><div><b>Al-Noor Enterprises (Pvt) Ltd</b><small>ALNOOR · Growth plan</small></div></a>
         <a class="pop-item" href="#/app/dashboard" data-toast="Switched to Al-Noor Foods (demo)"><span class="tone-yellow"><i data-lucide="building"></i></span><div><b>Al-Noor Foods</b><small>ALNFOODS · Starter plan</small></div></a>
         <div class="pop-sep"></div><div class="pop-title">Branch</div>
         ${t.branches.map((b, i) => `<button class="pop-item" data-toast="Branch filter: ${b}"><span class="${i ? 'tone-teal' : ''}"><i data-lucide="${i ? 'map-pin' : 'layers'}"></i></span><div><b>${b}</b></div></button>`).join('')}`
      : `<div class="pop-title">Workspace</div><a class="pop-item" href="#/${p}/dashboard"><span><i data-lucide="${t.companyIcon}"></i></span><div><b>${t.company}</b><small>${p === 'admin' ? 'Platform console · Production' : 'Employee portal'}</small></div></a>`;
    $('#topbar').innerHTML = `
      <button class="menu-btn" id="menuBtn" aria-label="Open menu"><i data-lucide="menu"></i></button>
      <a class="top-brand" href="#/${p}/dashboard"><span class="brandmark"><i data-lucide="activity"></i></span><div><b>Fin<span>soft</span></b><small>Smarter Accounting for a Brighter Tomorrow</small></div></a>
      <div class="pop-wrap"><button class="company-pick" data-pop="popCompany"><i data-lucide="${t.companyIcon}"></i>${t.company}<i data-lucide="chevron-down"></i></button>
        <div class="pop" id="popCompany" style="left:0;right:auto;min-width:290px">${companyMenu}</div></div>
      <div class="global-search" data-palette><i data-lucide="search"></i><span>${t.search}</span><kbd class="kbd">Ctrl + K</kbd></div>
      <div class="top-actions">
        <div class="pop-wrap"><button class="create-new" data-pop="popCreate"><i data-lucide="plus"></i><span>Create New</span><i data-lucide="chevron-down"></i></button>
          <div class="pop" id="popCreate">${createItems}</div></div>
        <div class="pop-wrap"><button class="icon-btn" data-pop="popNotif" aria-label="Notifications"><i data-lucide="bell"></i><em>${t.notif}</em></button>
          <div class="pop notif-pop" id="popNotif"><h3>Notifications <a class="link small" href="#/${p === 'app' ? 'app/notifications' : p + '/dashboard'}">View all</a></h3>
          ${t.notes.map((n) => `<div class="n"><span class="icon-well sm"><i data-lucide="${n[0]}"></i></span><div><b>${n[1]}</b>${n[2]}</div></div>`).join('')}</div></div>
        <button class="icon-btn hide-sm" aria-label="Messages" data-toast="No new messages"><i data-lucide="mail"></i></button>
        <button class="icon-btn hide-sm" aria-label="Help" data-palette><i data-lucide="circle-help"></i></button>
        <a class="icon-btn hide-sm" aria-label="Settings" href="#/${p === 'app' ? 'app/settings' : p === 'admin' ? 'admin/system' : 'ess/profile'}"><i data-lucide="settings"></i></a>
        <div class="pop-wrap"><button class="user-menu" data-pop="popUser"><span class="avatar">${t.user.i}</span><div><b>${t.user.name}</b><small>${t.user.role}</small></div><i data-lucide="chevron-down"></i></button>
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
    $('#footTenant').textContent = p === 'admin' ? 'Finsoft Cloud Platform Console' : 'Al-Noor Enterprises (Pvt) Ltd';
  }

  /* ---------- router ---------- */
  let currentPortal = null;
  function go() {
    let route = decodeURIComponent(location.hash.replace(/^#\/?/, '')).replace(/\/$/, '');
    if (!route) route = 'chooser';
    let portal = route.split('/')[0];
    if (!PORTALS.includes(portal)) portal = null;
    let target = screens[route];
    if (!target) target = portal ? (screens[portal + '/404'] || screens['app/404']) : screens['chooser'];

    $$('.screen.active').forEach((s) => s.classList.remove('active'));
    closeAll();

    if (portal) {
      document.body.classList.add('in-portal');
      if (portal !== currentPortal) { renderSidebar(portal); renderTopbar(portal); currentPortal = portal; icons(); }
      setActiveNav(route);
    } else {
      document.body.classList.remove('in-portal');
    }
    if (target) {
      target.classList.add('active');
      $$('.org', target).forEach((o) => { o.scrollLeft = (o.scrollWidth - o.clientWidth) / 2; });
      document.title = (target.dataset.title || 'Finsoft') + ' · Finsoft';
    }
    $('#shell').classList.remove('mobile-open');
    window.scrollTo(0, 0);
  }

  function setActiveNav(route) {
    $$('#sidebar [data-r]').forEach((a) => a.classList.remove('active'));
    $$('#sidebar .sb-module').forEach((m) => m.classList.remove('current'));
    let el = $(`#sidebar [data-r="${CSS.escape(route)}"]`);
    if (!el) { // longest prefix match
      let best = null, len = 0;
      $$('#sidebar [data-r]').forEach((a) => { const r = a.dataset.r; if (route.startsWith(r + '/') && r.length > len) { best = a; len = r.length; } });
      el = best;
    }
    $$('#sidebar .sb-module.open').forEach((m) => m.classList.remove('open'));
    if (!el) return;
    el.classList.add('active');
    const mod = el.closest('.sb-module');
    if (mod) { mod.classList.add('current'); if (el.classList.contains('sb-leaf')) mod.classList.add('open'); }
    // keep the active item visible inside the sidebar scroller
    setTimeout(() => {
      const sb = $('#sidebar'), r = (mod || el).getBoundingClientRect(), sr = sb.getBoundingClientRect();
      if (r.top < sr.top + 200 || r.bottom > sr.bottom - 80) sb.scrollTo({ top: sb.scrollTop + r.top - sr.top - 200, behavior: 'smooth' });
    }, 340);
  }

  /* ---------- overlays & popovers ---------- */
  function closePops() { $$('.pop.open').forEach((p) => p.classList.remove('open')); }
  function closeAll() { closePops(); $$('.overlay.open').forEach((o) => o.classList.remove('open')); }
  function openOverlay(id) { const o = document.getElementById(id); if (o) { o.classList.add('open'); icons(); } }

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `<i data-lucide="circle-check"></i><span>${msg}</span>`;
    $('#toastHost').appendChild(t);
    icons();
    setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3200);
  }
  window.fsToast = toast;

  /* ---------- command palette ---------- */
  function paletteItems() {
    const items = [];
    PORTALS.forEach((p) => {
      const n = NAV[p];
      const label = { admin: 'Platform Admin', app: 'Workspace', ess: 'Self-Service' }[p];
      n.tiles.forEach((t) => items.push({ t: t.label, r: t.r, i: t.icon, g: label }));
      n.groups.forEach((g) => g.modules.forEach((m) => {
        if (m.r) items.push({ t: m.label, r: m.r, i: m.icon, g: label + ' · ' + g.title });
        (m.children || []).forEach((c) => items.push({ t: c.label, r: c.r, i: c.icon, g: label + ' · ' + m.label }));
      }));
    });
    Object.keys(screens).forEach((r) => { if (!items.some((x) => x.r === r)) items.push({ t: screens[r].dataset.title || r, r, i: 'file', g: r.split('/')[0] }); });
    return items;
  }
  let PAL = null, palIdx = 0;
  function renderPalette(q) {
    PAL = PAL || paletteItems();
    q = (q || '').toLowerCase().trim();
    const list = PAL.filter((x) => !q || (x.t + ' ' + x.g + ' ' + x.r).toLowerCase().includes(q)).slice(0, 40);
    palIdx = 0;
    $('#paletteList').innerHTML = list.length
      ? list.map((x, i) => `<a href="#/${x.r}" class="${i === 0 ? 'hl' : ''}"><i data-lucide="${x.i}"></i>${x.t}<small>${x.g}</small></a>`).join('')
      : '<div class="empty-state"><h4>No matches</h4><p>Try another keyword.</p></div>';
    icons();
  }
  function openPalette() { openOverlay('palette'); $('#paletteInput').value = ''; renderPalette(''); setTimeout(() => $('#paletteInput').focus(), 30); }
  $('#paletteInput').addEventListener('input', (e) => renderPalette(e.target.value));
  $('#paletteInput').addEventListener('keydown', (e) => {
    const links = $$('#paletteList a');
    if (!links.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      links[palIdx].classList.remove('hl');
      palIdx = (palIdx + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length;
      links[palIdx].classList.add('hl'); links[palIdx].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') { e.preventDefault(); location.hash = links[palIdx].getAttribute('href'); closeAll(); }
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
  }

  /* ---------- delegated events ---------- */
  document.addEventListener('click', (e) => {
    const t = e.target;
    const popBtn = t.closest('[data-pop]');
    if (popBtn) {
      const pop = document.getElementById(popBtn.dataset.pop);
      const was = pop.classList.contains('open');
      closePops(); if (!was) pop.classList.add('open');
      e.stopPropagation(); return;
    }
    if (!t.closest('.pop')) closePops();
    else if (t.closest('a, button')) setTimeout(closePops, 0);

    if (t.closest('[data-palette]')) { openPalette(); return; }
    if (t.closest('#sbCollapse')) { $('#shell').classList.toggle('collapsed'); return; }
    if (t.closest('#menuBtn')) { $('#shell').classList.add('mobile-open'); return; }
    if (t.closest('#mobileScrim')) { $('#shell').classList.remove('mobile-open'); return; }

    const head = t.closest('.sb-head');
    if (head) {
      const shell = $('#shell');
      if (shell.classList.contains('collapsed') && innerWidth > 1100) shell.classList.remove('collapsed');
      head.parentElement.classList.toggle('open');
      return;
    }

    // tabs
    const tabBtn = t.closest('[data-tab]');
    if (tabBtn) {
      const scope = tabBtn.closest('[data-tabs]');
      if (scope) {
        const key = tabBtn.dataset.tab;
        $$('[data-tab]', scope).filter((b) => b.closest('[data-tabs]') === scope).forEach((b) => b.classList.toggle('active', b.dataset.tab === key));
        $$('[data-pane]', scope).filter((p) => p.closest('[data-tabs]') === scope).forEach((p) => p.classList.toggle('active', p.dataset.pane === key));
      }
    }
    // chip / segmented toggles
    const chip = t.closest('.chips > button, .seg > button');
    if (chip && !chip.dataset.tab) { $$(':scope > button', chip.parentElement).forEach((b) => b.classList.remove('active')); chip.classList.add('active'); }
    const ck = t.closest('.ck');
    if (ck && !$('input', ck)) ck.classList.toggle('on');
    // selectable cards
    const sel = t.closest('[data-select] > *');
    if (sel) { $$(':scope > *', sel.parentElement).forEach((c) => c.classList.remove('selected')); sel.classList.add('selected'); }
    const tr = t.closest('.tree-row');
    if (tr) { $$('.tree-row.selected', tr.closest('.tree')).forEach((r) => r.classList.remove('selected')); tr.classList.add('selected'); }
    const cb = t.closest('.tbl tbody input[type=checkbox]');
    if (cb) cb.closest('tr').classList.toggle('selected', cb.checked);
    const all = t.closest('.tbl thead input[type=checkbox]');
    if (all) $$('tbody input[type=checkbox]', all.closest('table')).forEach((c) => { c.checked = all.checked; c.closest('tr').classList.toggle('selected', all.checked); });

    // wizard
    const wz = t.closest('[data-wizard]');
    if (wz) {
      const cur = +(wz.dataset.step || 0);
      if (t.closest('[data-next]')) { e.preventDefault(); wizardGo(wz, cur + 1); }
      else if (t.closest('[data-prev]')) { e.preventDefault(); wizardGo(wz, cur - 1); }
      else { const li = t.closest('.steps li'); if (li) wizardGo(wz, $$('.steps li', wz).indexOf(li)); }
    }

    // modals
    const opener = t.closest('[data-open]');
    if (opener) { e.preventDefault(); openOverlay(opener.dataset.open); }
    if (t.closest('[data-close]') || t.classList.contains('overlay')) { const o = t.closest('.overlay'); if (o) o.classList.remove('open'); }

    // toast
    const tb = t.closest('[data-toast]');
    if (tb) toast(tb.dataset.toast);

    // palette navigation closes it
    if (t.closest('#paletteList a')) closeAll();

    // dead links: keep the prototype from jumping to top
    const a = t.closest('a[href="#"]');
    if (a) e.preventDefault();
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); }
    if (e.key === 'Escape') closeAll();
  });
  window.addEventListener('hashchange', go);

  // wizards start at the first step
  $$('[data-wizard]').forEach((w) => { if (!$('.wz-pane.active', w)) { const p = $('.wz-pane', w); if (p) p.classList.add('active'); } });

  /* ---------- self-check: every nav route must have a screen ---------- */
  window.fsCheck = function () {
    const missing = [];
    PORTALS.forEach((p) => {
      const n = NAV[p];
      const rs = n.tiles.map((t) => t.r);
      n.groups.forEach((g) => g.modules.forEach((m) => { if (m.r) rs.push(m.r); (m.children || []).forEach((c) => rs.push(c.r)); }));
      rs.forEach((r) => { if (!screens[r]) missing.push(r); });
    });
    const badLinks = [];
    $$('a[href^="#/"]').forEach((a) => { const r = a.getAttribute('href').slice(2); if (!screens[r]) badLinks.push(r); });
    const res = { screens: Object.keys(screens).length, missingNav: [...new Set(missing)], brokenLinks: [...new Set(badLinks)] };
    console.log('[Finsoft self-check]', res);
    return res;
  };

  go();
  icons();
  setTimeout(window.fsCheck, 50);
})();
