/* ================= Finsoft v2 UI runtime: window.FS =================
   Enhancers are idempotent: tables, charts, tabs, count-up, menus, drawers, toasts. */
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FS = (window.FS = window.FS || {});
  FS.$ = $; FS.$$ = $$;

  /* ---------- route hooks ---------- */
  const hooks = [];
  const mounted = new WeakSet();
  FS.onEnter = (match, fn) => hooks.push({ match, fn });
  FS._enter = (sec, route) => {
    const first = !mounted.has(sec);
    mounted.add(sec);
    hooks.forEach((h) => {
      const ok = typeof h.match === 'function' ? h.match(route, sec) : h.match === route;
      if (ok) { try { h.fn(sec, route, first); } catch (e) { console.error('[FS hook]', route, e); } }
    });
    FS.enhance(sec);
    FS.animateIn(sec);
  };

  /* ---------- icons ---------- */
  FS.icons = (root) => {
    if (!window.lucide) return;
    try { lucide.createIcons({ attrs: { 'stroke-width': 1.8 }, root: root || document }); }
    catch (e) { lucide.createIcons({ attrs: { 'stroke-width': 1.8 } }); }
  };

  /* ---------- formatting ---------- */
  FS.fmt = (n, dec = 0) => Number(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  FS.money = (n, o = {}) => {
    const dec = o.dec ?? 2, neg = n < 0, s = FS.fmt(Math.abs(n), dec);
    const [i, d] = s.split('.');
    return `${neg ? '−' : ''}${o.rs === false ? '' : 'Rs '}${i}${d ? `<span class="dec">.${d}</span>` : ''}`;
  };

  /* ---------- count-up ---------- */
  const NUM_RE = /(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?/;
  FS.countUp = (el, dur = 900) => {
    if (reduce() || el.dataset.counting) return;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) { const t = walker.currentNode; if (NUM_RE.test(t.nodeValue) && !t.parentElement.closest('.dec')) nodes.push(t); }
    if (!nodes.length) return;
    const t = nodes[0];
    const orig = t.nodeValue;
    const m = orig.match(NUM_RE);
    const target = parseFloat(m[0].replace(/,/g, ''));
    if (!isFinite(target) || target === 0) return;
    const decs = m[2] ? m[2].length - 1 : 0;
    const comma = m[1].includes(',') || target >= 10000;
    el.dataset.counting = '1';
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(2, -10 * p);
      const v = target * (p >= 1 ? 1 : e);
      const str = comma ? FS.fmt(v, decs) : v.toFixed(decs);
      t.nodeValue = orig.replace(m[0], str);
      if (p < 1) requestAnimationFrame(step); else { t.nodeValue = orig; delete el.dataset.counting; }
    };
    requestAnimationFrame(step);
  };

  /* ---------- entrance animation for a screen ---------- */
  FS.animateIn = (sec) => {
    if (!sec) return;
    let i = 0;
    $$(':scope > *', sec).forEach((c) => {
      if (c.classList.contains('overlay')) return;
      if (c.matches('.kpi-grid, .grid-2, .grid-3, .grid-4, .card-grid, .plan-grid, .quick-grid')) {
        $$(':scope > *', c).forEach((k) => { k.classList.add('anim-in'); k.style.setProperty('--i', i++); });
      } else { c.classList.add('anim-in'); c.style.setProperty('--i', i++); }
    });
    $$('.bars', sec).forEach((b) => $$('.bar', b).forEach((bar, j) => bar.querySelectorAll('i').forEach((x) => x.style.setProperty('--bi', j))));
    $$('svg.chart .line, svg.spark path', sec).forEach((p) => p.setAttribute('pathLength', '1'));
    const countSel = '[data-count], .kpi > strong, .num-big, .hero-stats b, .mini-stat b, .stat-row b';
    $$(countSel, sec).forEach((el) => { if (!el.closest('.overlay')) FS.countUp(el); });
    $$('.tbl:not([data-plain]) tbody', sec).forEach((tb) => {
      $$(':scope > tr', tb).slice(0, 24).forEach((tr, k) => { tr.classList.remove('row-in'); void tr.offsetWidth; tr.classList.add('row-in'); tr.style.setProperty('--ri', k); });
    });
    $$('.tabs', sec).forEach(positionInk);
  };

  /* ---------- toasts ---------- */
  FS.toast = (msg, o = {}) => {
    const host = $('#toastHost');
    if (!host) return;
    const ms = o.ms || 4200;
    const t = document.createElement('div');
    t.className = 'toast ' + (o.tone || '');
    const ic = { warn: 'triangle-alert', danger: 'circle-x', info: 'info' }[o.tone] || 'circle-check';
    t.innerHTML = `<i data-lucide="${ic}"></i><span>${msg}</span>${o.undo ? '<button data-act="undo">Undo</button>' : ''}${o.action ? `<button data-act="go">${o.action.label}</button>` : ''}<i class="bar" style="animation-duration:${ms}ms"></i>`;
    host.appendChild(t);
    FS.icons(t);
    const close = () => { if (!t.isConnected) return; t.classList.add('out'); setTimeout(() => t.remove(), 300); };
    const timer = setTimeout(close, ms);
    t.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      clearTimeout(timer);
      if (b.dataset.act === 'undo') { o.undo(); FS.toast('Undone', { tone: 'info', ms: 1800 }); }
      if (b.dataset.act === 'go') o.action.fn();
      close();
    });
    return t;
  };

  /* ---------- overlays ---------- */
  FS.openModal = (id) => { const o = document.getElementById(id); if (o) { o.classList.remove('closing'); o.classList.add('open'); FS.icons(o); FS.enhance(o); } };
  FS.closeOverlay = (o) => {
    if (!o || !o.classList.contains('open')) return;
    o.classList.add('closing');
    setTimeout(() => { o.classList.remove('open', 'closing'); if (o.dataset.temp) o.remove(); }, 200);
  };
  FS.closeOverlays = () => $$('.overlay.open').forEach(FS.closeOverlay);
  FS.drawer = ({ title = '', subtitle = '', html = '', foot = '', wide = false } = {}) => {
    const o = document.createElement('div');
    o.className = 'overlay drawer-overlay';
    o.dataset.temp = '1';
    o.innerHTML = `<aside class="drawer" style="${wide ? 'width:min(720px,100vw)' : ''}"><div class="modal-head"><div><h2>${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ''}</div><button class="x" data-close><i data-lucide="x"></i></button></div><div class="drawer-body">${html}</div>${foot ? `<div class="modal-foot">${foot}</div>` : ''}</aside>`;
    document.body.appendChild(o);
    requestAnimationFrame(() => { o.classList.add('open'); FS.icons(o); FS.enhance(o); FS.animateIn(o.querySelector('.drawer-body')); });
    return o.querySelector('.drawer');
  };

  /* ---------- context menu ---------- */
  let menuEl = null;
  FS.closeMenu = () => { if (menuEl) { menuEl.remove(); menuEl = null; } };
  FS.menu = (anchor, items) => {
    FS.closeMenu();
    const m = document.createElement('div');
    m.className = 'fs-menu';
    items.forEach((it) => {
      if (it.sep) { m.appendChild(document.createElement('hr')); return; }
      const b = document.createElement('button');
      if (it.danger) b.className = 'danger';
      b.innerHTML = `${it.icon ? `<i data-lucide="${it.icon}"></i>` : ''}${it.label}`;
      b.onclick = (e) => { e.stopPropagation(); FS.closeMenu(); it.onClick && it.onClick(); };
      m.appendChild(b);
    });
    document.body.appendChild(m);
    FS.icons(m);
    const r = anchor.getBoundingClientRect();
    const mw = m.offsetWidth, mh = m.offsetHeight;
    let left = r.right - mw, top = r.bottom + 6;
    if (left < 8) left = r.left;
    if (top + mh > innerHeight - 8) top = r.top - mh - 6;
    m.style.left = left + 'px'; m.style.top = top + 'px';
    menuEl = m;
    return m;
  };

  /* ---------- tooltip ---------- */
  const tip = document.createElement('div');
  tip.className = 'tip';
  document.body.appendChild(tip);
  FS.tip = (html, x, y) => { tip.innerHTML = html; tip.style.left = x + 'px'; tip.style.top = y + 'px'; tip.classList.add('on'); };
  FS.untip = () => tip.classList.remove('on');
  document.addEventListener('mouseover', (e) => {
    const bar = e.target.closest('.bars .bar');
    const tipEl = e.target.closest('[data-tip]');
    if (bar) {
      const label = bar.dataset.tip || (bar.querySelector('[data-tip]') || {}).dataset?.tip || '';
      const span = bar.querySelector('span'), em = bar.querySelector('em');
      const r = (bar.querySelector('i') || bar).getBoundingClientRect();
      const txt = label || (em ? em.textContent : '') || (bar.style.getPropertyValue('--h') || '');
      FS.tip(`<small><i></i>${span ? span.textContent : ''}</small><b>${txt}</b>`, r.left + r.width / 2, r.top);
    } else if (tipEl && !tipEl.closest('.bars')) {
      const r = tipEl.getBoundingClientRect();
      FS.tip(`<b style="font-size:12.5px">${tipEl.dataset.tip}</b>`, r.left + r.width / 2, r.top);
    }
  });
  document.addEventListener('mouseout', (e) => { if (e.target.closest('.bars .bar, [data-tip]')) FS.untip(); });

  /* ---------- tabs ink ---------- */
  function positionInk(tabs) {
    if (tabs.classList.contains('vnav')) return;
    let ink = tabs.querySelector(':scope > .tab-ink');
    if (!ink) { ink = document.createElement('span'); ink.className = 'tab-ink'; tabs.appendChild(ink); tabs.classList.add('has-ink'); }
    const a = tabs.querySelector(':scope > button.active');
    if (!a || !a.offsetWidth) { ink.style.width = '0'; return; }
    ink.style.left = a.offsetLeft + 10 + 'px';
    ink.style.width = a.offsetWidth - 20 + 'px';
  }
  FS.positionInk = positionInk;

  /* ---------- tables ---------- */
  const parseVal = (s) => {
    const t = s.replace(/[−–]/g, '-').trim();
    const num = t.replace(/Rs|PKR|%|,|\s/g, '');
    if (/^\(?-?\d+(\.\d+)?\)?$/.test(num)) { let v = parseFloat(num.replace(/[()]/g, '')); if (/^\(.*\)$/.test(num)) v = -v; return v; }
    const d = Date.parse(t);
    if (!isNaN(d) && /\d{4}/.test(t) && /[a-z]/i.test(t)) return d;
    return t.toLowerCase();
  };
  const bodyRows = (tb) => $$(':scope > tr', tb).filter((r) => !r.classList.contains('total') && !r.classList.contains('no-results') && !r.classList.contains('group'));
  function enhanceTable(table) {
    if (table.dataset.fsTable || table.hasAttribute('data-plain')) return;
    table.dataset.fsTable = '1';
    const ths = $$('thead th', table);
    const tb = table.tBodies[0];
    if (!tb) return;
    ths.forEach((th, idx) => {
      const hasCheck = th.querySelector('input[type=checkbox]');
      if (hasCheck || th.hasAttribute('data-nosort') || !th.textContent.trim() || th.colSpan > 1) return;
      th.classList.add('sortable');
      const ic = document.createElement('span');
      ic.className = 'sort-ic';
      ic.innerHTML = '<i data-lucide="arrow-up-down"></i>';
      th.appendChild(ic);
      th.addEventListener('click', () => {
        const dir = th.dataset.sort === 'asc' ? 'desc' : 'asc';
        ths.forEach((h) => { delete h.dataset.sort; h.classList.remove('sorted'); const s = h.querySelector('.sort-ic'); if (s) s.innerHTML = '<i data-lucide="arrow-up-down"></i>'; });
        th.dataset.sort = dir; th.classList.add('sorted');
        ic.innerHTML = `<i data-lucide="${dir === 'asc' ? 'arrow-up' : 'arrow-down'}"></i>`;
        FS.icons(th);
        const rows = bodyRows(tb);
        const tail = $$(':scope > tr.total', tb);
        rows.sort((a, b) => {
          const va = parseVal(a.cells[idx] ? a.cells[idx].innerText : ''), vb = parseVal(b.cells[idx] ? b.cells[idx].innerText : '');
          const r = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), undefined, { numeric: true });
          return dir === 'asc' ? r : -r;
        });
        rows.forEach((r, k) => { tb.appendChild(r); r.classList.remove('row-in'); void r.offsetWidth; r.classList.add('row-in'); r.style.setProperty('--ri', Math.min(k, 20)); });
        tail.forEach((r) => tb.appendChild(r));
      });
    });
    // select all
    const all = table.querySelector('thead input[type=checkbox]');
    if (all) all.addEventListener('change', () => { bodyRows(tb).forEach((r) => { const c = r.querySelector('input[type=checkbox]'); if (c && r.style.display !== 'none') { c.checked = all.checked; r.classList.toggle('selected', all.checked); } }); updateBulk(); });
    tb.addEventListener('change', (e) => { const c = e.target; if (c.matches('input[type=checkbox]')) { c.closest('tr').classList.toggle('selected', c.checked); updateBulk(); } });
    // row menus
    tb.addEventListener('click', (e) => {
      const b = e.target.closest('.icon-btn-sm');
      if (!b || b.dataset.open || b.dataset.menu === 'off' || b.hasAttribute('onclick') || (b.tagName === 'A' && b.getAttribute('href') && b.getAttribute('href') !== '#')) return;
      e.preventDefault();
      e.stopPropagation();
      const tr = b.closest('tr');
      const name = (tr.querySelector('b, a') || tr.cells[1] || tr.cells[0]).innerText.split('\n')[0];
      FS.menu(b, [
        { label: 'View details', icon: 'eye', onClick: () => FS.toast(`Opening ${name}`, { tone: 'info' }) },
        { label: 'Edit', icon: 'pencil', onClick: () => FS.toast(`Editing ${name}`, { tone: 'info' }) },
        { label: 'Duplicate', icon: 'copy', onClick: () => { const c = tr.cloneNode(true); tr.after(c); c.classList.add('row-flash'); FS.toast(`${name} duplicated`, { undo: () => c.remove() }); } },
        { label: 'Export row', icon: 'download', onClick: () => FS.toast('Exported to CSV') },
        { sep: true },
        { label: 'Delete', icon: 'trash-2', danger: true, onClick: () => removeRows([tr], name) },
      ]);
    });
    // columns manager
    const panel = table.closest('.panel');
    if (ths.length >= 7 && panel && !panel.querySelector('.colbtn')) {
      let head = panel.querySelector(':scope > .panel-head');
      if (head) {
        let acts = head.querySelector('.panel-actions');
        if (!acts) { acts = document.createElement('div'); acts.className = 'panel-actions'; head.appendChild(acts); }
        const btn = document.createElement('button');
        btn.className = 'btn secondary sm colbtn';
        btn.innerHTML = '<i data-lucide="columns-3"></i>Columns';
        btn.onclick = (e) => { e.stopPropagation(); openColumns(btn, table); };
        acts.prepend(btn);
      }
    }
  }
  function openColumns(btn, table) {
    FS.closeMenu();
    const ths = $$('thead th', table);
    const pop = document.createElement('div');
    pop.className = 'colpop fs-menu';
    pop.style.padding = '12px';
    const items = ths.map((th, i) => ({ i, label: th.innerText.trim() })).filter((x) => x.label);
    pop.innerHTML = `<h5>Show / Hide Columns <button data-reset>Reset</button></h5><div class="colpop-list">${items.map((x) => `<label><input type="checkbox" data-col="${x.i}" ${ths[x.i].style.display === 'none' ? '' : 'checked'}>${x.label}</label>`).join('')}</div><p class="small muted" style="margin:10px 4px 0">${items.length} columns available</p>`;
    document.body.appendChild(pop);
    const r = btn.getBoundingClientRect();
    pop.style.left = Math.max(8, r.right - 260) + 'px'; pop.style.top = r.bottom + 6 + 'px';
    menuEl = pop;
    const setCol = (i, show) => { $$('tr', table).forEach((tr) => { const c = tr.cells[i]; if (c) c.style.display = show ? '' : 'none'; }); };
    pop.addEventListener('click', (e) => e.stopPropagation());
    pop.addEventListener('change', (e) => { const c = e.target; if (c.dataset.col) setCol(+c.dataset.col, c.checked); });
    pop.querySelector('[data-reset]').onclick = () => { $$('input[data-col]', pop).forEach((c) => { c.checked = true; setCol(+c.dataset.col, true); }); };
  }
  function removeRows(rows, label) {
    const parents = rows.map((r) => [r, r.parentNode, r.nextSibling]);
    rows.forEach((r) => r.classList.add('row-out'));
    setTimeout(() => { rows.forEach((r) => r.remove()); updateBulk(); }, 340);
    FS.toast(`${rows.length > 1 ? rows.length + ' rows' : label} deleted`, { tone: 'danger', undo: () => parents.forEach(([r, p, n]) => { r.classList.remove('row-out', 'selected'); const c = r.querySelector('input[type=checkbox]'); if (c) c.checked = false; p.insertBefore(r, n && n.parentNode === p ? n : null); r.classList.add('row-flash'); }) });
  }

  /* bulk bar */
  const bulk = document.createElement('div');
  bulk.className = 'bulkbar';
  bulk.innerHTML = `<b><i>0</i>selected</b><button data-b="export"><i data-lucide="download"></i>Export</button><button data-b="assign"><i data-lucide="user-plus"></i>Assign</button><button data-b="archive"><i data-lucide="archive"></i>Archive</button><button data-b="delete" class="danger"><i data-lucide="trash-2"></i>Delete</button><button data-b="clear"><i data-lucide="x"></i></button>`;
  document.body.appendChild(bulk);
  const selectedRows = () => { const sec = $('.screen.active'); return sec ? $$('.tbl:not([data-plain]) tbody tr.selected', sec) : []; };
  function updateBulk() {
    const n = selectedRows().length;
    bulk.querySelector('b i').textContent = n;
    bulk.classList.toggle('on', n > 0);
  }
  FS.updateBulk = updateBulk;
  bulk.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const rows = selectedRows();
    const clear = () => { rows.forEach((r) => { r.classList.remove('selected'); const c = r.querySelector('input[type=checkbox]'); if (c) c.checked = false; }); $$('.screen.active thead input[type=checkbox]').forEach((c) => (c.checked = false)); updateBulk(); };
    if (b.dataset.b === 'delete') { removeRows(rows); return; }
    if (b.dataset.b === 'export') FS.toast(`${rows.length} rows exported to Excel`);
    if (b.dataset.b === 'assign') FS.toast(`${rows.length} rows assigned to Hira Ali`);
    if (b.dataset.b === 'archive') FS.toast(`${rows.length} rows archived`, { undo: () => {} });
    clear();
  });

  /* live search */
  function searchTargets(input) {
    const panel = input.closest('.panel');
    if (panel) { const t = $$('table.tbl:not([data-plain])', panel); if (t.length) return t; }
    const sec = input.closest('.screen, .drawer, .modal');
    if (!sec) return [];
    const all = $$('table.tbl:not([data-plain])', sec);
    const after = all.filter((t) => input.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING);
    return after.length ? [after[0]] : all.slice(0, 1);
  }
  function runSearch(input) {
    const q = input.value.trim().toLowerCase();
    input.closest('.search-field')?.classList.toggle('has-val', !!q);
    const ranges = [];
    searchTargets(input).forEach((table) => {
      const tb = table.tBodies[0]; if (!tb) return;
      let shown = 0;
      bodyRows(tb).forEach((r) => {
        const chipHidden = r.dataset.chipHide === '1';
        const hit = !q || r.innerText.toLowerCase().includes(q);
        r.style.display = hit && !chipHidden ? '' : 'none';
        if (hit && !chipHidden) shown++;
        if (q && hit && window.Highlight) {
          const w = document.createTreeWalker(r, NodeFilter.SHOW_TEXT);
          while (w.nextNode()) {
            const n = w.currentNode, txt = n.nodeValue.toLowerCase();
            let i = txt.indexOf(q);
            while (i > -1) { const rg = new Range(); rg.setStart(n, i); rg.setEnd(n, i + q.length); ranges.push(rg); i = txt.indexOf(q, i + q.length); }
          }
        }
      });
      let nr = tb.querySelector('tr.no-results');
      if (!shown) {
        if (!nr) { nr = document.createElement('tr'); nr.className = 'no-results'; nr.innerHTML = `<td colspan="${table.tHead ? table.tHead.rows[0].cells.length : 6}"></td>`; tb.appendChild(nr); }
        nr.cells[0].innerHTML = `<div class="empty-state" style="padding:20px"><span class="icon-well lg"><i data-lucide="search-x"></i></span><h4>No results${q ? ` for “${input.value}”` : ''}</h4><p>Try a different keyword or clear the filters.</p></div>`;
        nr.style.display = ''; FS.icons(nr);
      } else if (nr) nr.style.display = 'none';
    });
    if (window.CSS && CSS.highlights) { if (ranges.length) CSS.highlights.set('fs-search', new Highlight(...ranges)); else CSS.highlights.delete('fs-search'); }
  }
  function enhanceSearch(field) {
    if (field.dataset.fsSearch) return;
    const input = field.querySelector('input');
    if (!input || field.closest('[data-plain-search]')) return;
    field.dataset.fsSearch = '1';
    const x = document.createElement('button');
    x.className = 'clear-x'; x.type = 'button'; x.innerHTML = '<i data-lucide="x"></i>';
    x.onclick = () => { input.value = ''; runSearch(input); input.focus(); };
    field.appendChild(x);
    input.addEventListener('input', () => runSearch(input));
  }

  /* chip filtering */
  function chipFilter(btn) {
    const chips = btn.closest('.chips');
    const scope = chips.closest('.panel') || chips.closest('.screen');
    if (!scope) return;
    let tables = $$('table.tbl:not([data-plain])', scope);
    if (!tables.length) { const sec = chips.closest('.screen'); tables = $$('table.tbl:not([data-plain])', sec).filter((t) => chips.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING).slice(0, 1); }
    if (!tables.length) return;
    const raw = (btn.cloneNode(true));
    raw.querySelectorAll('i, svg').forEach((n) => n.remove());
    const key = raw.textContent.trim().toLowerCase();
    const isAll = /^(all|everything|any)\b/.test(key) || !key;
    tables.forEach((t) => {
      const rows = bodyRows(t.tBodies[0]);
      if (isAll) { rows.forEach((r) => { r.dataset.chipHide = ''; r.style.display = ''; }); return; }
      const word = key.split(/\s+/)[0];
      const matchBadge = (r) => $$('.badge, .tag, .pill', r).some((b) => b.textContent.toLowerCase().includes(key) || b.textContent.toLowerCase().includes(word));
      let hits = rows.filter(matchBadge);
      if (!hits.length) hits = rows.filter((r) => r.innerText.toLowerCase().includes(key));
      if (!hits.length) return; // chip not related to table content: leave as-is
      rows.forEach((r, k) => { const on = hits.includes(r); r.dataset.chipHide = on ? '' : '1'; r.style.display = on ? '' : 'none'; if (on) { r.classList.remove('row-in'); void r.offsetWidth; r.classList.add('row-in'); r.style.setProperty('--ri', k % 12); } });
    });
  }
  FS.chipFilter = chipFilter;

  /* ---------- enhance root ---------- */
  FS.enhance = (root = document) => {
    $$('table.tbl', root).forEach(enhanceTable);
    $$('.search-field', root).forEach(enhanceSearch);
    $$('.tabs', root).forEach(positionInk);
    FS.icons(root);
  };

  /* ---------- ripple ---------- */
  document.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.btn, .create-btn');
    if (!b || reduce()) return;
    const r = b.getBoundingClientRect(), s = Math.max(r.width, r.height) * 2;
    const rp = document.createElement('span');
    rp.className = 'ripple';
    rp.style.cssText = `width:${s}px;height:${s}px;left:${e.clientX - r.left - s / 2}px;top:${e.clientY - r.top - s / 2}px`;
    b.appendChild(rp);
    setTimeout(() => rp.remove(), 650);
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('.fs-menu')) FS.closeMenu(); }, true);
  addEventListener('scroll', () => FS.closeMenu(), true);
  addEventListener('resize', () => $$('.screen.active .tabs').forEach(positionInk));

  /* ---------- theme ---------- */
  FS.theme = () => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  FS.setTheme = (t, origin) => {
    const apply = () => {
      document.documentElement.dataset.theme = t;
      try { localStorage.setItem('fs-theme', t); } catch (e) {}
      document.dispatchEvent(new CustomEvent('fs:theme', { detail: t }));
    };
    if (document.startViewTransition && !reduce()) {
      if (origin) { const r = origin.getBoundingClientRect(); document.documentElement.style.setProperty('--vt-x', r.left + r.width / 2 + 'px'); document.documentElement.style.setProperty('--vt-y', r.top + r.height / 2 + 'px'); }
      document.startViewTransition(apply);
    } else apply();
  };
})();
