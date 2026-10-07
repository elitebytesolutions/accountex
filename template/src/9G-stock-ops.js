/* =====================================================================
   9G-stock-ops.js : Inventory stock operations (prefix so-). Owner: Agent B.
   Routes: app/inventory/stock-in-out, transfer, count, batches,
           stock-view, movements, demand.
   Every screen is rendered on first enter from FS_DATA (cloned).
   ===================================================================== */
(function () {
  'use strict';
  if (!window.FS || !window.FS_DATA) return;

  /* ------------------------------------------------------------ helpers */
  const D = window.FS_DATA;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n, d = 0) => FS.fmt(n, d);
  const money = (n, o) => FS.money(n, o);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const ico = (n, cls) => `<i data-lucide="${n}"${cls ? ` class="${cls}"` : ''}></i>`;
  const sum = (a, f) => a.reduce((s, x) => s + (f ? f(x) : x), 0);
  const RM = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = (ms) => new Promise((r) => setTimeout(r, RM() ? Math.min(ms, 80) : ms));
  const TODAY = new Date('2026-10-01T00:00:00');
  const daysTo = (iso) => Math.round((new Date(iso + 'T00:00:00') - TODAY) / 864e5);
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dfmt = (iso) => { const d = new Date(iso + 'T00:00:00'); return String(d.getDate()).padStart(2, '0') + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear(); };
  const isoAdd = (n) => { const d = new Date(TODAY); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const ME = 'Sana Javed';

  const ITEMS = clone(D.items);
  const LOCS = clone(D.locations);
  const COS = clone(D.companies);
  const co = (code) => COS.find((c) => c.code === code) || { code, name: '—', short: '—', color: 'var(--muted)' };
  const cls = (id) => D.classes.find((c) => c.id === id) || { name: '—', icon: 'package' };
  const item = (sku) => ITEMS.find((i) => i.sku === sku);
  const loc = (code) => LOCS.find((l) => l.code === code) || LOCS[0];
  const findItem = (q) => {
    q = String(q || '').trim().toLowerCase();
    if (!q) return null;
    return ITEMS.find((i) => i.sku.toLowerCase() === q || i.upc === q || (i.barcodes || []).includes(q))
      || ITEMS.find((i) => (i.name + ' · ' + i.sku).toLowerCase() === q)
      || ITEMS.find((i) => i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q));
  };
  const isCarton = (code, it) => it && it.barcodes && it.barcodes[1] === code;
  const pIcon = (it) => cls(it.cls).icon || 'package';

  /* spinner state on a button for async-looking work */
  const busy = async (btn, ms, label) => {
    if (!btn) return wait(ms);
    const h = btn.innerHTML;
    btn.classList.add('so-busy'); btn.disabled = true;
    btn.innerHTML = `<span class="so-spin"></span>${label || 'Working…'}`;
    await wait(ms);
    btn.innerHTML = h; btn.classList.remove('so-busy'); btn.disabled = false;
    FS.icons(btn);
  };
  const pulse = (el, c = 'so-pop') => { if (!el) return; el.classList.remove(c); void el.offsetWidth; el.classList.add(c); };
  const flashRow = (tr) => { if (!tr) return; tr.classList.remove('row-flash', 'so-flash'); void tr.offsetWidth; tr.classList.add('so-flash'); };
  const removeAnimated = (el, done) => { if (!el) return done && done(); el.classList.add('so-out'); setTimeout(() => { el.remove(); done && done(); }, RM() ? 0 : 260); };

  /* sparkline path from numbers */
  const spark = (vals, w = 100, h = 30) => {
    const mx = Math.max(...vals), mn = Math.min(...vals), r = mx - mn || 1;
    const pts = vals.map((v, i) => [(i / (vals.length - 1)) * w, h - 3 - ((v - mn) / r) * (h - 6)]);
    const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    return { line, area: line + ` L${w} ${h} L0 ${h} Z` };
  };

  /* page head (icon tile + breadcrumb + title + actions) */
  const head = (o) => `
    <div class="so-head">
      ${o.back ? `<a class="so-back" href="#/${o.back}" aria-label="Back">${ico('arrow-left')}</a>` : ''}
      <span class="so-head-ico">${ico(o.icon)}</span>
      <div class="so-head-t">
        <div class="so-crumb">Inventory ${ico('chevron-right')} <b>${o.crumb || o.title}</b></div>
        <h1>${o.title}</h1>
        <p>${o.sub}</p>
      </div>
      ${o.mid || ''}
      <div class="so-head-r">${o.actions || ''}</div>
    </div>`;

  /* select options */
  const opts = (arr, sel) => arr.map((o) => { const v = typeof o === 'object' ? o.v : o, l = typeof o === 'object' ? o.l : o; return `<option value="${esc(v)}"${String(v) === String(sel) ? ' selected' : ''}>${esc(l)}</option>`; }).join('');
  const datalist = (id) => `<datalist id="${id}">${ITEMS.map((i) => `<option value="${esc(i.name)} · ${i.sku}">${i.upc}</option>`).join('')}</datalist>`;

  /* mount helper: render on first enter, re-run onEnter for subsequent visits */
  const ROUTE = (k) => 'app/inventory/' + k;
  const mount = (route, render, again) => {
    FS.onEnter(ROUTE(route), (sec, r, first) => {
      const root = $('.so-root', sec);
      if (first || !root.dataset.ready) {
        root.dataset.ready = '1';
        try { render(root, sec); } catch (e) { console.error('[so]', route, e); }
        FS.icons(root); FS.enhance(root);
      } else if (again) again(root, sec);
    });
  };
  const onRoute = (route) => FS.route && FS.route() === ROUTE(route);
  const overlayOpen = () => !!document.querySelector('.overlay.open');


  /* =====================================================================
     1. MANUAL STOCK IN / OUT  (app/inventory/stock-in-out)
     ===================================================================== */
  const REASONS = {
    in: [['Opening Stock', 'package-open', 'First-time balances'], ['Adjustment', 'sliders-horizontal', 'Correct a book error'], ['Damaged Return', 'rotate-ccw', 'Customer returned goods'], ['Production', 'factory', 'Finished goods made'], ['Found in Count', 'scan-search', 'Surplus on shelf'], ['Gift Received', 'gift', 'Free goods from principal'], ['Internal Return', 'undo-2', 'Back from a department']],
    out: [['Consumption', 'utensils-crossed', 'Used in operations'], ['Sample Issue', 'flask-conical', 'Given as samples'], ['Internal Use', 'box', 'Office / own use'], ['Adjustment', 'sliders-horizontal', 'Correct a book error'], ['Damaged / Breakage', 'package-x', 'Broken or unusable'], ['Expired Write-off', 'calendar-x', 'Past expiry date'], ['Lost / Theft', 'shield-alert', 'Missing stock']],
  };
  const SHELVES = ['A-01-01', 'A-01-02', 'A-02-01', 'B-01-01', 'B-02-03', 'C-01-02', 'C-02-01', 'D-01-01', 'D-02-04'];
  const PEOPLE = D.employees.map((e) => e.name);

  mount('stock-in-out', (root) => {
    const S = {
      mode: 'in', seq: { in: 126, out: 22 }, manual: false,
      reason: 'Opening Stock', wh: 'WH-LHR', shelf: 'A-01-01', req: '', ref: '', notes: '', date: '2026-10-01',
      lines: [
        { sku: 'FD-5003', batch: 'FD5003B', qty: 100, cost: 610 },
        { sku: 'FD-5002', batch: 'FD5002B', qty: 50, cost: 1720 },
        { sku: 'OF-2002', batch: '', qty: 30, cost: 1350 },
      ],
      recent: [
        { date: '2026-09-29', no: 'MI-000125', mode: 'in', reason: 'Opening Stock', ref: 'OP-2026-01', items: 12, qty: 245, value: 245600, status: 'Posted', by: 'Hira Ali' },
        { date: '2026-09-26', no: 'MO-000021', mode: 'out', reason: 'Consumption', ref: 'CON-2026-03', items: 8, qty: 120, value: 98400, status: 'Posted', by: 'Kashif Ali' },
        { date: '2026-09-22', no: 'MI-000124', mode: 'in', reason: 'Adjustment', ref: 'ADJ-2026-02', items: 15, qty: 300, value: 312750, status: 'Draft', by: 'Hira Ali' },
        { date: '2026-09-18', no: 'MO-000020', mode: 'out', reason: 'Damaged / Breakage', ref: 'DMG-2026-01', items: 6, qty: 25, value: 18750, status: 'Posted', by: 'Fatima Noor' },
        { date: '2026-09-12', no: 'MO-000019', mode: 'out', reason: 'Sample Issue', ref: 'SMP-2026-07', items: 3, qty: 36, value: 22140, status: 'Posted', by: 'Bilal Khan' },
      ],
    };
    const entryNo = () => (S.mode === 'in' ? 'MI-' : 'MO-') + String(S.seq[S.mode]).padStart(6, '0');
    const avail = (l) => { const it = item(l.sku); if (l.batch && l.batch !== 'NEW') { const b = it.batches.find((x) => x.no === l.batch); return b ? b.qty : 0; } return it.stock; };
    const expShort = (iso) => { const d = new Date(iso + 'T00:00:00'); return String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear(); };

    root.innerHTML = `
      <div class="so-io" data-mode="in">
        ${head({ back: 'app/inventory/stock', icon: 'arrow-down-up', crumb: 'Stock In / Out', title: 'Manual Stock In / Stock Out', sub: 'Create manual inventory movement entries to adjust stock quantities in your warehouse.',
          actions: `<button class="btn secondary" data-act="draft">${ico('save')}Save as Draft</button><button class="btn primary so-acc-btn" data-act="post">${ico('check')}Save &amp; Post</button>` })}
        <div class="so-modes" role="tablist">
          <button class="so-mode on" data-mode="in" role="tab"><span class="so-mode-ico">${ico('upload')}</span><span><b>Manual Stock In</b><small>Add stock to increase inventory</small></span><em>${ico('check')}</em></button>
          <button class="so-mode" data-mode="out" role="tab"><span class="so-mode-ico">${ico('download')}</span><span><b>Manual Stock Out</b><small>Remove stock from inventory</small></span><em>${ico('check')}</em></button>
          <i class="so-mode-ink"></i>
        </div>
        <div class="so-io-grid">
          <div class="panel so-io-info">
            <div class="so-ph"><span class="so-ph-ico">${ico('file-text')}</span><h3>Entry Information</h3></div>
            <div class="so-fg c3">
              <label><span>Entry No.</span><div class="so-inp-gear"><input class="so-entry-no" readonly value="${entryNo()}"><button class="so-gear" type="button" aria-label="Numbering settings">${ico('settings')}</button></div></label>
              <label><span>Entry Date</span><input type="date" class="so-date" value="${S.date}"></label>
              <label><span>Manual Reference No.</span><input class="so-ref" placeholder="e.g. ADJ-2026-001"></label>
              <label><span>Movement Reason <em>*</em></span><div class="so-sel">${ico('package-open', 'so-reason-ico')}<select class="so-reason"></select></div></label>
              <label><span>Warehouse <em>*</em></span><div class="so-sel">${ico('warehouse')}<select class="so-wh">${opts(LOCS.map((l) => ({ v: l.code, l: l.name })), S.wh)}</select></div></label>
              <label><span>Location / Shelf / Rack</span><div class="so-sel">${ico('map-pin')}<select class="so-shelf">${opts(SHELVES, S.shelf)}</select></div></label>
            </div>
            <div class="so-fg c2">
              <label><span>Requested By</span><div class="so-sel">${ico('user')}<select class="so-req"><option value="">Select user</option>${opts(PEOPLE)}</select></div></label>
              <label><span>Entered By <em>*</em></span><div class="so-sel ro">${ico('user-check')}<input readonly value="${ME}"></div></label>
            </div>
            <label class="so-fg-full"><span>Notes</span><textarea class="so-notes" rows="2" maxlength="300" placeholder="Add notes about this manual stock movement (optional)…"></textarea></label>
          </div>
          <div class="panel so-io-reasons">
            <div class="so-ph"><span class="so-ph-ico">${ico('folder-open')}</span><h3>Movement Reasons</h3></div>
            <div class="so-reason-grid"></div>
            <div class="so-reason-note">${ico('info')}<span>Select a reason that best describes this stock movement.</span></div>
          </div>
          <div class="so-io-side">
            <div class="panel so-sum">
              <div class="so-ph"><span class="so-ph-ico">${ico('chart-column')}</span><h3>Entry Summary</h3></div>
              <div class="so-sum-rows">
                <div><span>Total Items</span><b class="so-s-items">0</b></div>
                <div><span>Total Quantity</span><b class="so-s-qty">0</b></div>
                <div class="big"><span>Total Value (Rs.)</span><b class="so-s-val">0</b></div>
              </div>
              <div class="so-movebox"><span class="so-movebox-ico">${ico('arrow-up')}</span><div><small>Movement Type</small><b class="so-mt">Stock In</b><p class="so-mt-p">Stock will be increased after posting.</p></div></div>
            </div>
            <div class="panel so-valid">
              <div class="so-ph"><span class="so-ph-ico">${ico('shield-check')}</span><h3>Validation</h3></div>
              <div class="so-valid-box"></div>
            </div>
          </div>
          <div class="panel so-io-lines">
            <div class="so-lines-head">
              <div class="so-ph"><span class="so-ph-ico">${ico('package')}</span><h3>Add Products</h3></div>
              <label class="so-search">${ico('search')}<input class="so-psearch" list="so-io-dl" placeholder="Search product by name, code or barcode…" autocomplete="off"><button type="button" class="so-scan" title="Simulate barcode scan">${ico('scan-barcode')}</button></label>
              ${datalist('so-io-dl')}
              <button class="btn primary so-acc-btn so-additem">${ico('plus')}Add Item</button>
            </div>
            <div class="table-wrap"><table class="tbl so-lines" data-plain>
              <thead><tr><th>#</th><th>Product</th><th>UPC / Barcode</th><th>Batch</th><th class="num">Quantity</th><th class="num">Unit Cost (Rs.)</th><th class="num">Total Value (Rs.)</th><th class="so-c">Actions</th></tr></thead>
              <tbody></tbody>
            </table></div>
          </div>
        </div>
        <div class="panel flush so-recent">
          <div class="so-ph pad"><span class="so-ph-ico">${ico('history')}</span><h3>Recent Manual Entries</h3><span class="spacer"></span><a class="so-link" href="#/app/inventory/movements">View All ${ico('arrow-right')}</a></div>
          <div class="table-wrap"><table class="tbl so-rtbl" data-no-qv>
            <thead><tr><th>Date</th><th>Entry No.</th><th>Type</th><th>Reason</th><th>Reference No.</th><th class="num">Items</th><th class="num">Quantity</th><th class="num">Total Value (Rs.)</th><th>Status</th><th>Entered By</th><th data-nosort class="so-c">Actions</th></tr></thead>
            <tbody></tbody>
          </table></div>
        </div>
      </div>`;

    const W = $('.so-io', root);
    const tbody = $('.so-lines tbody', root);

    /* ---- reasons (select + tiles stay in sync) */
    function renderReasons() {
      const list = REASONS[S.mode];
      $('.so-reason', root).innerHTML = `<option value="">Select reason</option>` + list.map((r) => `<option${r[0] === S.reason ? ' selected' : ''}>${r[0]}</option>`).join('');
      $('.so-reason-grid', root).innerHTML = list.map((r, i) => `<button type="button" class="so-rtile${r[0] === S.reason ? ' on' : ''}" data-reason="${esc(r[0])}" style="--i:${i}" title="${esc(r[2])}"><span>${ico(r[1])}</span><b>${r[0]}</b></button>`).join('');
      const cur = list.find((r) => r[0] === S.reason);
      const ri = $('.so-reason-ico', root) || $('.so-reason', root).previousElementSibling;
      if (ri) { ri.outerHTML = ico(cur ? cur[1] : 'list', 'so-reason-ico'); }
      FS.icons($('.so-io-reasons', root)); FS.icons($('.so-io-info', root));
    }

    /* ---- product lines */
    function batchCell(l, it) {
      if (!it.batches || !it.batches.length) return `<span class="so-muted">No batch tracking</span>`;
      if (S.mode === 'in') {
        return `<select class="so-cell-sel" data-f="batch">${it.batches.map((b) => `<option value="${b.no}"${b.no === l.batch ? ' selected' : ''}>${b.no} · EXP ${expShort(b.exp)}</option>`).join('')}<option value="NEW"${l.batch === 'NEW' ? ' selected' : ''}>+ New batch</option></select>`;
      }
      return `<select class="so-cell-sel" data-f="batch"><option value="">Choose batch</option>${it.batches.map((b) => `<option value="${b.no}"${b.no === l.batch ? ' selected' : ''}>${b.no} · EXP ${expShort(b.exp)} · avail ${fmt(b.qty)}</option>`).join('')}</select>`;
    }
    function lineRow(l, i) {
      const it = item(l.sku);
      const over = S.mode === 'out' && l.qty > avail(l);
      return `<tr data-i="${i}" class="${over ? 'so-over' : ''}">
        <td class="so-idx">${i + 1}</td>
        <td><div class="so-prod"><span class="so-pt">${ico(pIcon(it))}</span><div><b>${esc(it.name)}</b><small>${it.sku} · ${esc(co(it.company).short)}</small></div></div></td>
        <td class="so-mono">${it.upc}</td>
        <td>${batchCell(l, it)}</td>
        <td class="num"><input class="so-cell-in num" data-f="qty" type="number" min="0" value="${l.qty}"><small class="so-avail${over ? ' bad' : ''}">${S.mode === 'out' ? (over ? 'Only ' + fmt(avail(l)) + ' available' : fmt(avail(l)) + ' ' + it.loose + ' available') : it.loose + ' · ctn of ' + it.ctn}</small></td>
        <td class="num"><input class="so-cell-in num w" data-f="cost" type="number" min="0" step="0.01" value="${l.cost.toFixed(2)}"></td>
        <td class="num so-lv">${fmt(l.qty * l.cost, 2)}</td>
        <td class="so-c"><button class="so-del" data-act="del" aria-label="Remove line">${ico('trash-2')}</button></td>
      </tr>`;
    }
    function renderLines(flashIdx) {
      tbody.innerHTML = S.lines.length ? S.lines.map(lineRow).join('') : `<tr class="so-empty-row"><td colspan="8"><div class="so-empty">${ico('scan-barcode')}<b>No products yet</b><span>Search, pick from the list or press the scan button to add items.</span></div></td></tr>`;
      FS.icons(tbody);
      if (flashIdx != null) flashRow(tbody.querySelector(`tr[data-i="${flashIdx}"]`));
      refresh();
    }
    function refreshRow(i) {
      const tr = tbody.querySelector(`tr[data-i="${i}"]`); if (!tr) return;
      const l = S.lines[i];
      $('.so-lv', tr).textContent = fmt(l.qty * l.cost, 2);
      const over = S.mode === 'out' && l.qty > avail(l);
      tr.classList.toggle('so-over', over);
      const a = $('.so-avail', tr);
      if (a) { a.classList.toggle('bad', over); if (S.mode === 'out') a.textContent = over ? 'Only ' + fmt(avail(l)) + ' available' : fmt(avail(l)) + ' ' + item(l.sku).loose + ' available'; }
      refresh();
    }

    /* ---- summary + validation */
    function issues() {
      const out = [];
      if (!S.reason) out.push('Choose a movement reason');
      if (!S.wh) out.push('Select a warehouse');
      if (!S.lines.length) out.push('Add at least one product');
      S.lines.forEach((l, i) => {
        const it = item(l.sku);
        if (!(l.qty > 0)) out.push(`Line ${i + 1}: quantity must be more than zero`);
        if (S.mode === 'in' && !(l.cost > 0)) out.push(`Line ${i + 1}: enter a unit cost`);
        if (S.mode === 'out' && it.batches.length && !l.batch) out.push(`Line ${i + 1}: pick a batch for ${it.name}`);
        if (S.mode === 'out' && l.qty > avail(l)) out.push(`Line ${i + 1}: ${fmt(l.qty)} exceeds ${fmt(avail(l))} available`);
      });
      return out;
    }
    function refresh() {
      FS.tick($('.so-s-items', root), S.lines.length, { dec: 0 });
      FS.tick($('.so-s-qty', root), sum(S.lines, (l) => +l.qty || 0), { dec: 0 });
      FS.tick($('.so-s-val', root), sum(S.lines, (l) => (+l.qty || 0) * (+l.cost || 0)), { dec: 2 });
      const iss = issues();
      const box = $('.so-valid-box', root);
      const was = box.dataset.ok;
      box.dataset.ok = iss.length ? '0' : '1';
      box.className = 'so-valid-box ' + (iss.length ? 'bad' : 'ok');
      box.innerHTML = iss.length
        ? `<div class="so-vb-top"><span>${ico('triangle-alert')}</span><div><b>Needs attention</b><p>${iss.length} issue${iss.length > 1 ? 's' : ''} to fix before posting.</p></div></div><ul>${iss.slice(0, 5).map((x) => `<li>${ico('circle-alert')}${esc(x)}</li>`).join('')}${iss.length > 5 ? `<li class="more">+${iss.length - 5} more</li>` : ''}</ul>`
        : `<div class="so-vb-top"><span>${ico('check')}</span><div><b>Ready to post</b><p>All information looks good. You can save as draft or post this entry.</p></div></div>`;
      FS.icons(box);
      if (was && was !== box.dataset.ok) pulse(box);
    }

    /* ---- mode switch morphs accent, prefix, reasons */
    function setMode(m) {
      if (S.mode === m) return;
      S.mode = m;
      W.dataset.mode = m;
      $$('.so-mode', root).forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
      S.reason = REASONS[m][0][0];
      $('.so-entry-no', root).value = entryNo(); pulse($('.so-entry-no', root));
      $('.so-mt', root).textContent = m === 'in' ? 'Stock In' : 'Stock Out';
      $('.so-mt-p', root).textContent = m === 'in' ? 'Stock will be increased after posting.' : 'Stock will be reduced after posting.';
      $('.so-movebox-ico', root).innerHTML = ico(m === 'in' ? 'arrow-up' : 'arrow-down');
      if (m === 'out') S.lines.forEach((l) => { if (l.batch === 'NEW') l.batch = ''; });
      else S.lines.forEach((l) => { const it = item(l.sku); if (it.batches.length && !l.batch) l.batch = it.batches[0].no; });
      FS.icons($('.so-movebox', root));
      pulse($('.so-movebox', root));
      renderReasons(); renderLines();
    }

    /* ---- add product */
    function addSku(sku, by) {
      const it = item(sku); if (!it) return false;
      const ex = S.lines.findIndex((l) => l.sku === sku);
      if (ex > -1) { S.lines[ex].qty += by || 1; renderLines(ex); FS.toast(`${esc(it.name)} · quantity +${by || 1}`, { tone: 'info', ms: 1800 }); return true; }
      S.lines.push({ sku, batch: it.batches.length ? (S.mode === 'in' ? it.batches[it.batches.length - 1].no : it.batches[0].no) : '', qty: by || 1, cost: it.cost });
      renderLines(S.lines.length - 1);
      return true;
    }
    function addFromSearch() {
      const inp = $('.so-psearch', root);
      const v = inp.value.trim();
      if (!v) { inp.focus(); pulse(inp.parentElement, 'so-shake'); FS.toast('Type a product name, code or barcode first', { tone: 'warn', ms: 2200 }); return; }
      const it = findItem(v.includes(' · ') ? v.split(' · ').pop() : v);
      if (!it) { pulse(inp.parentElement, 'so-shake'); FS.toast(`No product matches “${esc(v)}”`, { tone: 'warn' }); return; }
      addSku(it.sku, isCarton(v, it) ? it.ctn : 1);
      inp.value = '';
    }

    /* ---- recent entries */
    function renderRecent(flash) {
      const tb = $('.so-rtbl tbody', root);
      tb.innerHTML = S.recent.map((r, i) => `<tr data-r="${i}">
        <td class="so-nw">${dfmt(r.date)}</td><td><b class="so-mono">${r.no}</b></td>
        <td><span class="so-pill ${r.mode}">${ico(r.mode === 'in' ? 'arrow-up' : 'arrow-down')}${r.mode === 'in' ? 'Stock In' : 'Stock Out'}</span></td>
        <td>${esc(r.reason)}</td><td class="so-mono">${esc(r.ref || '—')}</td>
        <td class="num">${r.items}</td><td class="num">${fmt(r.qty)}</td><td class="num">${fmt(r.value, 2)}</td>
        <td><span class="badge ${r.status === 'Posted' ? 'good' : 'neutral'}">${r.status}</span></td><td>${esc(r.by)}</td>
        <td class="so-c"><button class="icon-btn-sm so-eye" data-view="${i}" aria-label="View entry">${ico('eye')}</button></td></tr>`).join('');
      FS.icons(tb);
      if (flash) flashRow(tb.firstElementChild);
    }
    function viewEntry(r) {
      const lines = r.lines || ITEMS.slice(0, Math.min(r.items, 4)).map((it, k) => ({ sku: it.sku, batch: it.batches[0] ? it.batches[0].no : '', qty: Math.max(1, Math.round(r.qty / Math.min(r.items, 4)) - k), cost: it.cost }));
      FS.drawer({
        title: r.no, subtitle: `${r.mode === 'in' ? 'Manual Stock In' : 'Manual Stock Out'} · ${dfmt(r.date)}`,
        html: `<div class="so-dr-hero ${r.mode}"><span>${ico(r.mode === 'in' ? 'arrow-up' : 'arrow-down')}</span><div><b>${money(r.value)}</b><small>${r.items} items · ${fmt(r.qty)} units · ${esc(r.reason)}</small></div><span class="badge ${r.status === 'Posted' ? 'good' : 'neutral'}">${r.status}</span></div>
          <div class="dl"><div><span>Reference</span><b>${esc(r.ref || '—')}</b></div><div><span>Warehouse</span><b>${esc(loc(r.wh || 'WH-LHR').name)}</b></div><div><span>Entered by</span><b>${esc(r.by)}</b></div></div>
          <h4 class="so-dr-h">Lines</h4>
          <table class="tbl" data-plain><thead><tr><th>Product</th><th>Batch</th><th class="num">Qty</th><th class="num">Value</th></tr></thead><tbody>${lines.map((l) => { const it = item(l.sku); return `<tr><td><b>${esc(it.name)}</b><small>${it.sku}</small></td><td>${l.batch || '—'}</td><td class="num">${fmt(l.qty)}</td><td class="num">${fmt(l.qty * l.cost, 2)}</td></tr>`; }).join('')}</tbody></table>`,
        foot: `<button class="btn secondary" data-close>Close</button><button class="btn primary" data-toast="Sent to printer">${ico('printer')}Print</button>`,
      });
    }

    async function save(post, btn) {
      const iss = issues();
      if (post && iss.length) {
        const box = $('.so-valid-box', root); pulse(box, 'so-shake');
        box.scrollIntoView({ behavior: RM() ? 'auto' : 'smooth', block: 'center' });
        FS.toast(`Fix ${iss.length} issue${iss.length > 1 ? 's' : ''} before posting`, { tone: 'warn' });
        return;
      }
      if (!post && !S.lines.length) { FS.toast('Add at least one product to save a draft', { tone: 'warn' }); return; }
      await busy(btn, post ? 1000 : 650, post ? 'Posting…' : 'Saving…');
      const no = entryNo();
      const rec = { date: S.date, no, mode: S.mode, reason: S.reason || 'Unspecified', ref: $('.so-ref', root).value.trim(), items: S.lines.length, qty: sum(S.lines, (l) => l.qty), value: sum(S.lines, (l) => l.qty * l.cost), status: post ? 'Posted' : 'Draft', by: ME, wh: S.wh, lines: clone(S.lines) };
      S.recent.unshift(rec);
      if (post) {
        rec.lines.forEach((l) => { const it = item(l.sku); const d = S.mode === 'in' ? l.qty : -l.qty; it.stock += d; const b = it.batches.find((x) => x.no === l.batch); if (b) b.qty += d; });
        FS.celebrate(btn, S.mode === 'in' ? 'Stock increased' : 'Stock reduced');
      }
      S.seq[S.mode]++;
      S.lines = []; $('.so-ref', root).value = ''; $('.so-notes', root).value = '';
      $('.so-entry-no', root).value = entryNo(); pulse($('.so-entry-no', root));
      renderLines(); renderRecent(true);
      FS.toast(`<b>${no}</b> ${post ? 'posted' : 'saved as draft'} · ${rec.items} item${rec.items > 1 ? 's' : ''}, ${fmt(rec.qty)} units`, { tone: post ? 'good' : 'info', action: { label: 'View', fn: () => viewEntry(rec) } });
    }

    /* ---- events */
    root.addEventListener('click', (e) => {
      const t = e.target;
      const m = t.closest('.so-mode'); if (m) { setMode(m.dataset.mode); return; }
      const rt = t.closest('.so-rtile');
      if (rt) { S.reason = rt.dataset.reason; renderReasons(); refresh(); pulse($('.so-reason', root).parentElement); return; }
      if (t.closest('.so-gear')) {
        FS.menu(t.closest('.so-gear'), [
          { label: S.manual ? 'Switch to auto numbering' : 'Enter number manually', icon: S.manual ? 'wand-sparkles' : 'pencil', onClick() { S.manual = !S.manual; const n = $('.so-entry-no', root); n.readOnly = !S.manual; n.classList.toggle('so-edit', S.manual); if (S.manual) n.focus(); else n.value = entryNo(); FS.toast(S.manual ? 'Manual numbering on' : 'Auto numbering restored', { tone: 'info', ms: 1800 }); } },
          { label: `Series: ${S.mode === 'in' ? 'MI-' : 'MO-'}###### (next ${String(S.seq[S.mode]).padStart(6, '0')})`, icon: 'hash', onClick() {} },
          { sep: true },
          { label: 'Numbering settings', icon: 'settings-2', onClick() { FS.go('app/settings'); } },
        ]);
        return;
      }
      if (t.closest('.so-scan')) {
        const pool = ITEMS.filter((x) => x.stock > 0);
        const it = pool[Math.floor(Math.random() * pool.length)];
        const code = Math.random() < 0.3 ? it.barcodes[1] : it.upc;
        const lab = t.closest('.so-search'); pulse(lab, 'so-beep');
        addSku(it.sku, isCarton(code, it) ? it.ctn : 1);
        FS.toast(`Scanned ${code}${isCarton(code, it) ? ' (carton of ' + it.ctn + ')' : ''}`, { tone: 'info', ms: 1800 });
        return;
      }
      if (t.closest('.so-additem')) { addFromSearch(); return; }
      const del = t.closest('[data-act="del"]');
      if (del) {
        const tr = del.closest('tr'); const i = +tr.dataset.i; const removed = S.lines[i];
        removeAnimated(tr, () => { S.lines.splice(i, 1); renderLines(); FS.toast(`${esc(item(removed.sku).name)} removed`, { undo: () => { S.lines.splice(i, 0, removed); renderLines(i); } }); });
        return;
      }
      const v = t.closest('[data-view]'); if (v) { viewEntry(S.recent[+v.dataset.view]); return; }
      const a = t.closest('[data-act]');
      if (a && a.dataset.act === 'post') save(true, a);
      if (a && a.dataset.act === 'draft') save(false, a);
    });
    root.addEventListener('input', (e) => {
      const t = e.target;
      const tr = t.closest('.so-lines tbody tr');
      if (tr && t.dataset.f) {
        const l = S.lines[+tr.dataset.i];
        if (t.dataset.f === 'qty') l.qty = Math.max(0, parseFloat(t.value) || 0);
        if (t.dataset.f === 'cost') l.cost = Math.max(0, parseFloat(t.value) || 0);
        refreshRow(+tr.dataset.i);
      }
    });
    root.addEventListener('change', (e) => {
      const t = e.target;
      if (t.classList.contains('so-reason')) { S.reason = t.value; renderReasons(); refresh(); }
      if (t.classList.contains('so-wh')) { S.wh = t.value; refresh(); }
      if (t.classList.contains('so-shelf')) S.shelf = t.value;
      if (t.classList.contains('so-date')) S.date = t.value || S.date;
      if (t.classList.contains('so-psearch') && t.value.includes(' · ')) addFromSearch();
      const tr = t.closest('.so-lines tbody tr');
      if (tr && t.dataset.f === 'batch') {
        const l = S.lines[+tr.dataset.i]; l.batch = t.value;
        const b = item(l.sku).batches.find((x) => x.no === t.value); if (b) l.cost = b.cost;
        renderLines();
      }
    });
    root.addEventListener('keydown', (e) => {
      if (e.target.classList.contains('so-psearch') && e.key === 'Enter') { e.preventDefault(); addFromSearch(); }
      if (e.target.classList.contains('so-cell-in') && e.key === 'Enter') {
        e.preventDefault();
        const all = $$('.so-cell-in', tbody); const k = all.indexOf(e.target);
        (all[k + 1] || $('.so-psearch', root)).focus();
      }
    });

    renderReasons(); renderLines(); renderRecent();
  });

  /* =====================================================================
     2. STOCK TRANSFERS  (app/inventory/transfer)
     ===================================================================== */
  const LOC_SHARE = { 'WH-LHR': 0.55, 'WH-KHI': 0.3, 'WH-FSD': 0.15, 'SH-DHA': 0.08, 'SH-ISB': 0.06 };
  const ART = {
    Warehouse: `<svg class="so-art" viewBox="0 0 220 150" aria-hidden="true">
      <ellipse class="a-ground" cx="112" cy="136" rx="104" ry="11"/>
      <circle class="a-cloud" cx="40" cy="26" r="9"/><circle class="a-cloud" cx="52" cy="22" r="12"/><circle class="a-cloud" cx="64" cy="27" r="8"/>
      <g class="a-tree-g"><rect class="a-trunk" x="18" y="104" width="5" height="26" rx="2"/><circle class="a-tree" cx="20" cy="96" r="14"/><circle class="a-tree2" cx="26" cy="104" r="9"/></g>
      <path class="a-wall" d="M44 70 L118 36 L192 70 V130 H44 Z"/>
      <path class="a-roof" d="M36 72 L118 30 L200 72 L194 80 L118 42 L42 80 Z"/>
      <path class="a-roof2" d="M42 80 L118 42 L194 80 L194 84 L118 47 L42 84 Z"/>
      <rect class="a-sign" x="98" y="56" width="40" height="11" rx="3"/>
      <rect class="a-door" x="88" y="84" width="60" height="46" rx="2"/>
      <path class="a-slat" d="M90 90 H146 M90 96 H146 M90 102 H146 M90 108 H146 M90 114 H146 M90 120 H146"/>
      <rect class="a-win" x="56" y="88" width="20" height="13" rx="2"/><rect class="a-win" x="162" y="88" width="20" height="13" rx="2"/>
      <rect class="a-box" x="150" y="112" width="18" height="18" rx="1.5"/><rect class="a-box2" x="168" y="112" width="18" height="18" rx="1.5"/><rect class="a-box" x="159" y="95" width="18" height="17" rx="1.5"/>
      <path class="a-tape" d="M159 112 V130 M177 112 V130 M168 95 V112"/>
      <g class="a-fork"><rect class="a-lime" x="50" y="108" width="24" height="16" rx="3"/><rect class="a-dark" x="54" y="98" width="3" height="12"/><rect class="a-dark" x="74" y="92" width="3" height="34"/><rect class="a-dark" x="77" y="122" width="16" height="3"/><rect class="a-box2" x="78" y="110" width="13" height="12" rx="1"/><circle class="a-wheel" cx="56" cy="127" r="5"/><circle class="a-wheel" cx="70" cy="127" r="5"/></g>
    </svg>`,
    Shop: `<svg class="so-art" viewBox="0 0 220 150" aria-hidden="true">
      <ellipse class="a-ground" cx="112" cy="136" rx="104" ry="11"/>
      <circle class="a-cloud" cx="168" cy="20" r="8"/><circle class="a-cloud" cx="180" cy="16" r="11"/><circle class="a-cloud" cx="192" cy="21" r="7"/>
      <g class="a-tree-g"><rect class="a-trunk" x="196" y="104" width="5" height="26" rx="2"/><circle class="a-tree" cx="198" cy="96" r="14"/><circle class="a-tree2" cx="192" cy="104" r="9"/></g>
      <rect class="a-wall" x="40" y="58" width="144" height="72" rx="2"/>
      <rect class="a-roof2" x="34" y="52" width="156" height="8" rx="2"/>
      <rect class="a-roof" x="76" y="26" width="72" height="22" rx="5"/>
      <text class="a-signtxt" x="112" y="41.5" text-anchor="middle">SHOP</text>
      <path class="a-awn" d="M36 60 H188 L182 80 H42 Z"/>
      <path class="a-awn-s" d="M53 60 L56 80 H69 L68 60 Z M83 60 L84 80 H97 L98 60 Z M113 60 L112 80 H125 L128 60 Z M143 60 L140 80 H153 L158 60 Z M173 60 L168 80 H180 L188 60 Z"/>
      <path class="a-awn-e" d="M42 80 q7 7 14 0 q7 7 14 0 q7 7 14 0 q7 7 14 0 q7 7 14 0 q7 7 14 0 q7 7 14 0 q7 7 14 0 q7 7 14 0 q7 7 14 0"/>
      <rect class="a-win" x="50" y="90" width="38" height="28" rx="2"/><rect class="a-win" x="136" y="90" width="38" height="28" rx="2"/>
      <path class="a-slat" d="M69 90 V118 M155 90 V118"/>
      <rect class="a-door" x="98" y="88" width="28" height="42" rx="2"/><circle class="a-knob" cx="120" cy="110" r="1.6"/>
      <rect class="a-box" x="44" y="118" width="14" height="12" rx="1"/><rect class="a-box2" x="58" y="120" width="12" height="10" rx="1"/>
      <path class="a-pot" d="M172 122 h12 l-2 8 h-8 Z"/><circle class="a-tree" cx="178" cy="116" r="6"/>
    </svg>`,
  };
  const TRUCK = `<svg class="so-truck-svg" viewBox="0 0 120 64" aria-hidden="true">
      <rect class="t-body" x="4" y="8" width="70" height="38" rx="4"/>
      <rect class="t-stripe" x="4" y="32" width="70" height="5"/>
      <path class="t-cab" d="M74 20 H96 Q100 20 103 24 L114 38 V46 H74 Z"/>
      <path class="t-glass" d="M80 25 H95 L104 37 H80 Z"/>
      <rect class="t-base" x="2" y="46" width="114" height="4" rx="2"/>
      <path class="t-logo" d="M24 18 l8 -4 8 4 v9 l-8 4 -8 -4 Z"/>
      <g class="t-wheel"><circle cx="24" cy="52" r="8"/><circle class="t-hub" cx="24" cy="52" r="3"/><path class="t-spoke" d="M24 45 V59 M17 52 H31"/></g>
      <g class="t-wheel"><circle cx="94" cy="52" r="8"/><circle class="t-hub" cx="94" cy="52" r="3"/><path class="t-spoke" d="M94 45 V59 M87 52 H101"/></g>
    </svg>`;

  mount('transfer', (root) => {
    const T = {
      seq: 124, from: 'WH-LHR', to: 'SH-DHA', by: ME, date: '2026-10-01T10:24', remarks: '',
      lines: [
        { sku: 'FD-5003', batch: 'FD5003A', ctn: 2, loose: 0, ctrl: true },
        { sku: 'FD-5002', batch: 'FD5002A', ctn: 3, loose: 4, ctrl: false },
        { sku: 'OF-2002', batch: '', ctn: 6, loose: 0, ctrl: false },
      ],
      recent: [
        { no: 'TR-000123', from: 'WH-LHR', to: 'SH-DHA', items: 4, qty: 120, value: 22560, when: '30 Sep 2026 · 10:24 AM', status: 'Draft' },
        { no: 'TR-000122', from: 'WH-KHI', to: 'SH-DHA', items: 3, qty: 96, value: 61420, when: '30 Sep 2026 · 04:15 PM', status: 'In transit' },
        { no: 'TR-000121', from: 'WH-LHR', to: 'SH-ISB', items: 6, qty: 200, value: 34000, when: '28 Sep 2026 · 11:40 AM', status: 'Received' },
        { no: 'TR-000120', from: 'SH-DHA', to: 'WH-LHR', items: 2, qty: 50, value: 9600, when: '25 Sep 2026 · 04:22 PM', status: 'Pending' },
        { no: 'TR-000119', from: 'WH-FSD', to: 'WH-LHR', items: 5, qty: 95, value: 16150, when: '22 Sep 2026 · 12:10 PM', status: 'Received' },
      ],
      incoming: [
        { no: 'TR-000122', from: 'WH-KHI', to: 'SH-DHA', status: 'In transit', dispatched: '30 Sep · 04:15 PM', eta: 'Today · 02:00 PM', progress: 68, driver: 'Rafiq Shah · LEA-2290',
          lines: [{ sku: 'FD-5001', batch: 'FD5001B', qty: 48 }, { sku: 'FD-5004', batch: 'FD5004B', qty: 24 }, { sku: 'EL-4001', batch: '', qty: 24 }] },
        { no: 'TR-000118', from: 'WH-LHR', to: 'WH-FSD', status: 'Dispatched', dispatched: 'Today · 08:05 AM', eta: 'Today · 05:30 PM', progress: 22, driver: 'Salman Butt · LEB-8812',
          lines: [{ sku: 'PK-1001', batch: '', qty: 250 }, { sku: 'PK-1003', batch: '', qty: 72 }] },
      ],
    };
    const L = (c) => loc(c);
    const trNo = () => 'TR-' + String(T.seq).padStart(6, '0');
    const share = (c) => LOC_SHARE[c] || 0.1;
    const bOf = (l) => { const it = item(l.sku); return l.batch ? it.batches.find((b) => b.no === l.batch) : null; };
    const availOf = (l) => { const it = item(l.sku); const b = bOf(l); return Math.max(0, Math.round((b ? b.qty : it.stock) * share(T.from))); };
    const qtyOf = (l) => (+l.ctn || 0) * item(l.sku).ctn + (+l.loose || 0);
    const costOf = (l) => { const b = bOf(l); return b ? b.cost : item(l.sku).cost; };
    const kindIco = (t) => (t === 'Shop' ? 'store' : 'warehouse');
    const locName = (c) => L(c).name;
    const stTone = { Draft: 'neutral', Posted: 'good', Received: 'good', 'In transit': 'info', Dispatched: 'info', Pending: 'warn' };

    const locCard = (side) => {
      const c = side === 'from' ? T.from : T.to, l = L(c);
      return `<div class="so-loc ${l.type === 'Shop' ? 'shop' : 'wh'}" data-side="${side}">
        <div class="so-loc-top">
          <div class="so-loc-art">${ART[l.type] || ART.Warehouse}</div>
          <div class="so-loc-main">
            <span class="so-chip">${side === 'from' ? 'From' : 'To'}</span>
            <label class="so-loc-pick"><b>${esc(l.name)}</b>${ico('chevron-down')}<select data-loc="${side}" aria-label="${side} location">${opts(LOCS.map((x) => ({ v: x.code, l: x.name })), c)}</select></label>
            <small>${side === 'from' ? 'Source' : 'Destination'} Location</small>
            <p><span>${ico('map-pin')}</span>${esc(l.address)}</p>
          </div>
          <span class="so-kind ${l.type === 'Shop' ? 'shop' : 'wh'}">${ico(kindIco(l.type))}${l.type}</span>
        </div>
        <div class="so-loc-stats">
          <div><span>${ico('boxes')}</span><div><small>Current Stock</small><b>${fmt(l.stock)} <em>items</em></b></div></div>
          <div><span>${ico('layout-grid')}</span><div><small>Location Type</small><b>${l.type}</b></div></div>
          <div><span>${ico('layers')}</span><div><small>Active Products</small><b>${fmt(l.products)}</b></div></div>
        </div>
      </div>`;
    };

    root.innerHTML = `
      <div class="so-tr">
        <div class="so-tr-head">
          <div class="so-tr-title"><span class="so-head-ico">${ico('package')}</span><div><div class="so-crumb">Inventory ${ico('chevron-right')} <b>Stock Transfers</b></div><h1>Stock Transfer</h1><p>Move stock between your warehouses and shops</p></div></div>
          <div class="so-tr-meta">
            <label><span>Transfer No.</span><div class="so-tf ro"><b class="so-trno">${trNo()}</b>${ico('lock')}</div></label>
            <label><span>Date &amp; Time</span><div class="so-tf">${ico('calendar')}<input type="datetime-local" class="so-trdate" value="${T.date}"></div></label>
            <label><span>Prepared By</span><div class="so-tf">${ico('user')}<select class="so-trby">${opts(PEOPLE, T.by)}</select></div></label>
            <label class="grow"><span>Remarks (Optional)</span><div class="so-tf"><input class="so-trrem" placeholder="e.g. Replenishment for DHA shop"></div></label>
            <span class="so-tr-status badge neutral dot">Draft</span>
          </div>
          <div class="so-head-r"><button class="btn secondary" data-act="draft">${ico('save')}Save Draft</button><button class="btn primary" data-act="post">${ico('send')}Save &amp; Post</button></div>
        </div>
        <div class="so-route">
          <div class="so-loc-slot" data-slot="from"></div>
          <div class="so-truck">
            <div class="so-track"><i class="so-road"></i><div class="so-truck-mover">${TRUCK}</div>${ico('chevron-right', 'so-track-end')}</div>
            <b class="so-truck-t">Transferring Stock</b>
            <small class="so-truck-s"></small>
            <em class="so-truck-err" hidden>${ico('triangle-alert')}Source and destination are the same</em>
            <button class="so-swap" type="button" title="Swap locations">${ico('arrow-left-right')}Swap</button>
          </div>
          <div class="so-loc-slot" data-slot="to"></div>
        </div>
        <div class="so-tr-body">
          <div class="panel so-manifest">
            <div class="so-mf-head">
              <span class="so-ph-ico lg">${ico('package-check')}</span>
              <div><h2>Transfer Manifest</h2><p>Add products to transfer from the source to destination</p></div>
              <div class="so-mf-tools">
                <button class="btn secondary so-mf-add">${ico('plus')}Add Product</button>
                <div class="so-search so-mf-search">${ico('search')}<input class="so-mf-q" placeholder="Search product by code or name…" autocomplete="off"><div class="so-suggest" hidden></div></div>
                <button class="btn secondary so-mf-scan">${ico('scan-line')}Scan</button>
              </div>
            </div>
            <div class="so-mf-lines"></div>
          </div>
          <div class="so-tr-side">
            <div class="panel so-slip-panel">
              <div class="so-ph"><span class="so-ph-ico">${ico('receipt-text')}</span><h3>Transfer Slip Preview</h3><span class="spacer"></span><button class="btn secondary sm so-slip-view">${ico('printer')}Print</button></div>
              <div class="so-slip"></div>
            </div>
            <div class="panel so-recent-tr">
              <div class="so-ph"><span class="so-ph-ico">${ico('history')}</span><h3>Recent Transfers</h3><span class="spacer"></span><a class="btn secondary sm" href="#/app/inventory/movements">View All</a></div>
              <div class="so-tl"></div>
            </div>
          </div>
        </div>
        <div class="panel so-incoming">
          <div class="so-ph"><span class="so-ph-ico">${ico('truck')}</span><div><h3>Incoming transfers</h3><p>Dispatched stock on the road. Receive it at the destination to update stock.</p></div><span class="spacer"></span><span class="so-inc-count badge info dot"></span></div>
          <div class="so-inc-grid"></div>
        </div>
        <div class="so-tr-foot">
          <div class="so-foot-note">${ico('truck')}<span>Transferring today<br>for a stronger tomorrow.</span></div>
          <div class="so-foot-stats">
            <div><span>${ico('list-checks')}</span><div><small>Total Items</small><b class="so-f-items">0</b></div></div>
            <div><span>${ico('boxes')}</span><div><small>Total Quantity</small><b class="so-f-qty">0</b></div></div>
            <div><span>${ico('package-open')}</span><div><small>Total Loose</small><b class="so-f-loose">0</b></div></div>
            <div><span>${ico('banknote')}</span><div><small>Total Value</small><b class="so-f-val">0</b></div></div>
          </div>
          <button class="btn primary lg so-foot-post" data-act="post">${ico('check')}Save &amp; Post Transfer<span class="so-tail">${ico('chevron-right')}</span></button>
        </div>
      </div>`;

    /* ---- locations */
    function renderLocs() {
      ['from', 'to'].forEach((s) => { const slot = $(`[data-slot="${s}"]`, root); slot.innerHTML = locCard(s); FS.icons(slot); });
      const same = T.from === T.to;
      $('.so-truck-s', root).textContent = `From ${L(T.from).type} to ${L(T.to).type}`;
      $('.so-truck-err', root).hidden = !same;
      $('.so-truck', root).classList.toggle('bad', same);
    }

    /* ---- manifest */
    function lineCard(l, i) {
      const it = item(l.sku), b = bOf(l), av = availOf(l), q = qtyOf(l), bad = q > av;
      return `<div class="so-line${bad ? ' bad' : ''}" data-i="${i}" style="--i:${i}">
        <span class="so-no">${i + 1}</span>
        <span class="so-thumb" style="--c:${co(it.company).color}">${ico(pIcon(it))}<em>${esc(co(it.company).short)}</em></span>
        <div class="so-lprod">
          <b>${it.sku}</b><span title="${esc(it.name)}">${esc(it.name)}</span>
          <div class="so-lmeta">
            <div><small>Batch</small>${it.batches.length ? `<select data-f="batch">${it.batches.map((x) => `<option${x.no === l.batch ? ' selected' : ''}>${x.no}</option>`).join('')}</select>` : '<b>—</b>'}</div>
            <div><small>Expiry</small><b>${ico('calendar')}${b ? MON[+b.exp.slice(5, 7) - 1] + ' ' + b.exp.slice(0, 4) : 'N/A'}</b></div>
            <div><small>Company</small><b>${esc(co(it.company).short)}</b></div>
          </div>
        </div>
        <div class="so-nums">
          <div><small>Available</small><b class="so-av">${fmt(av)}</b><em>${it.loose}</em></div>
          <div><small>Transfer CTN</small><input type="number" min="0" data-f="ctn" value="${l.ctn}" class="${bad ? 'bad' : ''}"><em>× ${it.ctn}</em></div>
          <div><small>Loose Qty</small><input type="number" min="0" data-f="loose" value="${l.loose}" class="${bad ? 'bad' : ''}"><em class="so-lq">${fmt(q)} ${it.loose}</em></div>
          <div><small>Cost (Rs.)</small><output>${fmt(costOf(l), 2)}</output></div>
          <div><small>Value (Rs.)</small><output class="so-lval">${fmt(q * costOf(l), 2)}</output></div>
        </div>
        <div class="so-line-foot">
          <span class="so-ean">${ico('barcode')}${it.upc}</span>
          <span class="so-over-msg">${bad ? ico('triangle-alert') + 'Exceeds available by ' + fmt(q - av) : ''}</span>
          <button class="so-ctrl${l.ctrl ? ' on' : ''}" data-f="ctrl" type="button" aria-pressed="${l.ctrl}"><i></i>${l.ctrl ? 'Controlled item' : 'Non-controlled'}</button>
        </div>
        <button class="so-ldel" data-act="ldel" aria-label="Remove">${ico('trash-2')}</button>
      </div>`;
    }
    function renderLines(flash) {
      const box = $('.so-mf-lines', root);
      box.innerHTML = T.lines.map(lineCard).join('') + `<button class="so-add-more" type="button">${ico('plus')}<span><b>Add Another Product</b><small>Search or scan to add products to this transfer</small></span></button>`;
      FS.icons(box);
      if (flash != null) { const el = box.querySelector(`.so-line[data-i="${flash}"]`); if (el) pulse(el, 'so-lflash'); }
      totals();
    }
    function updateLine(i) {
      const el = $(`.so-line[data-i="${i}"]`, root); const l = T.lines[i]; if (!el) return;
      const it = item(l.sku), av = availOf(l), q = qtyOf(l), bad = q > av;
      el.classList.toggle('bad', bad);
      $$('input', el).forEach((x) => x.classList.toggle('bad', bad));
      $('.so-lq', el).textContent = fmt(q) + ' ' + it.loose;
      $('.so-lval', el).textContent = fmt(q * costOf(l), 2);
      const m = $('.so-over-msg', el); m.innerHTML = bad ? ico('triangle-alert') + 'Exceeds available by ' + fmt(q - av) : ''; FS.icons(m);
      totals();
    }
    function totals() {
      const qty = sum(T.lines, qtyOf), val = sum(T.lines, (l) => qtyOf(l) * costOf(l)), loose = sum(T.lines, (l) => +l.loose || 0);
      FS.tick($('.so-f-items', root), T.lines.length, { dec: 0 });
      FS.tick($('.so-f-qty', root), qty, { dec: 0 });
      FS.tick($('.so-f-loose', root), loose, { dec: 0 });
      FS.tick($('.so-f-val', root), val, { dec: 2, prefix: 'Rs ' });
      const dt = $('.so-trdate', root).value || T.date;
      const d = new Date(dt);
      const when = `${String(d.getDate()).padStart(2, '0')} ${MON[d.getMonth()]} ${d.getFullYear()} · ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
      $('.so-slip', root).innerHTML = `
        <div class="so-slip-brand"><span>${ico('leaf')}</span><b>AL-NOOR ENTERPRISES</b><small>Stock Transfer Slip</small></div>
        <dl class="so-slip-kv"><dt>Transfer No.</dt><dd>${trNo()}</dd><dt>Date &amp; Time</dt><dd>${when}</dd><dt>Prepared By</dt><dd>${esc($('.so-trby', root).value)}</dd></dl>
        <div class="so-slip-route"><p><span>${ico(kindIco(L(T.from).type))}</span><small>From</small>${esc(locName(T.from))}</p><p><span>${ico(kindIco(L(T.to).type))}</span><small>To</small>${esc(locName(T.to))}</p></div>
        <div class="so-slip-tot"><span>Items: <b>${T.lines.length}</b></span><span>Total Qty: <b>${fmt(qty)}</b></span><span>Value: <b>Rs ${fmt(val, 2)}</b></span></div>`;
      FS.icons($('.so-slip', root));
    }

    /* ---- suggest */
    const sg = () => $('.so-suggest', root);
    function suggest(q) {
      q = (q || '').trim().toLowerCase();
      const list = ITEMS.filter((i) => !q || (i.name + ' ' + i.sku + ' ' + i.upc).toLowerCase().includes(q)).slice(0, 7);
      sg().innerHTML = list.length ? list.map((i, k) => `<button type="button" data-sku="${i.sku}" class="${k === 0 ? 'hl' : ''}"><span class="so-pt sm">${ico(pIcon(i))}</span><span><b>${esc(i.name)}</b><small>${i.sku} · ${i.upc}</small></span><em>${fmt(Math.round(i.stock * share(T.from)))} avail</em></button>`).join('') : `<div class="so-sg-empty">No products match “${esc(q)}”</div>`;
      sg().hidden = false; FS.icons(sg());
    }
    function addLine(sku, viaScan) {
      const it = item(sku); if (!it) return;
      const ex = T.lines.findIndex((l) => l.sku === sku);
      if (ex > -1) { T.lines[ex].loose = (+T.lines[ex].loose || 0) + 1; renderLines(ex); FS.toast(`${esc(it.name)} already on the manifest · +1 ${it.loose}`, { tone: 'info', ms: 2000 }); return; }
      T.lines.push({ sku, batch: it.batches.length ? it.batches[0].no : '', ctn: 1, loose: 0, ctrl: it.attrs.includes('controlled') });
      renderLines(T.lines.length - 1);
      if (viaScan) FS.toast(`Scanned ${it.upc} · ${esc(it.name)}`, { tone: 'info', ms: 1800 });
      const el = $(`.so-line[data-i="${T.lines.length - 1}"]`, root); if (el) el.scrollIntoView({ behavior: RM() ? 'auto' : 'smooth', block: 'nearest' });
    }

    /* ---- recent + incoming */
    function renderRecent(flash) {
      $('.so-tl', root).innerHTML = T.recent.slice(0, 6).map((r, k) => `<div class="so-tl-row${flash && k === 0 ? ' so-in' : ''}">
          <i class="so-tl-dot ${stTone[r.status] || 'neutral'}"></i>
          <div class="so-tl-main"><b>${r.no}</b><small>${ico(kindIco(L(r.from).type))}${esc(L(r.from).name.replace(' Warehouse', ''))} ${ico('arrow-right')} ${esc(L(r.to).name.replace(' Warehouse', ''))}</small><small>${r.items} items · ${fmt(r.qty)} qty · Rs ${fmt(r.value, 2)}</small></div>
          <div class="so-tl-r"><small>${r.when.replace(' · ', '<br>')}</small><span class="badge ${stTone[r.status] || 'neutral'}">${r.status}</span></div>
        </div>`).join('');
      FS.icons($('.so-tl', root));
    }
    function incCard(x, k) {
      const qty = sum(x.lines, (l) => l.qty), val = sum(x.lines, (l) => l.qty * item(l.sku).cost);
      const done = x.status === 'Received';
      return `<div class="so-inc${done ? ' done' : ''}" data-k="${k}" style="--i:${k}">
        <div class="so-inc-top"><b>${x.no}</b><span class="badge ${done ? 'good' : 'info'} dot${done ? '' : ' so-live'}">${x.status}</span></div>
        <div class="so-inc-route"><span>${ico(kindIco(L(x.from).type))}${esc(L(x.from).name)}</span><span>${ico(kindIco(L(x.to).type))}${esc(L(x.to).name)}</span></div>
        <div class="so-inc-bar"><i style="width:${done ? 100 : x.progress}%"></i><span class="so-inc-truck" style="left:${done ? 100 : x.progress}%">${ico('truck')}</span></div>
        <div class="so-inc-meta"><div><small>Lines</small><b>${x.lines.length}</b></div><div><small>Quantity</small><b>${fmt(qty)}</b></div><div><small>Value</small><b>Rs ${fmt(val)}</b></div></div>
        <div class="so-inc-when"><span>${ico('clock')}Dispatched ${x.dispatched}</span><span>${done ? ico('circle-check') + 'Received ' + (x.recvAt || 'just now') : ico('map-pin') + 'ETA ' + x.eta}</span></div>
        ${done ? `<div class="so-inc-done">${ico('badge-check')}${x.recvNote || 'Received in full'}</div>` : `<div class="so-inc-actions"><span class="so-muted">${ico('user')}${esc(x.driver)}</span><button class="btn primary sm" data-recv="${k}">${ico('package-check')}Receive</button></div>`}
      </div>`;
    }
    function renderIncoming() {
      const open = T.incoming.filter((x) => x.status !== 'Received').length;
      $('.so-inc-count', root).textContent = open + ' in transit';
      $('.so-inc-grid', root).innerHTML = T.incoming.length ? T.incoming.map(incCard).join('') : `<div class="so-empty">${ico('truck')}<b>Nothing on the road</b><span>Posted transfers appear here until they are received.</span></div>`;
      FS.icons($('.so-inc-grid', root));
    }

    /* ---- receive flow */
    function receive(k) {
      const x = T.incoming[k];
      const rows = x.lines.map((l) => ({ ...l, rec: l.qty }));
      const sh = FS.sheet({
        title: `Receive ${x.no}`, subtitle: `${L(x.from).name} → ${L(x.to).name} · count what arrived`,
        html: `<div class="so-rcv">
          <div class="so-rcv-stats"><div><small>Sent</small><b class="so-r-sent">${fmt(sum(rows, (r) => r.qty))}</b></div><div><small>Received</small><b class="so-r-rec">0</b></div><div class="sh"><small>Shortage</small><b class="so-r-short">0</b></div><div class="ex"><small>Excess</small><b class="so-r-ex">0</b></div></div>
          <table class="tbl so-rcv-tbl" data-plain><thead><tr><th>Product</th><th>Batch</th><th class="num">Sent</th><th class="num">Received</th><th class="num">Difference</th></tr></thead><tbody>
          ${rows.map((r, i) => { const it = item(r.sku); return `<tr data-i="${i}"><td><div class="so-prod"><span class="so-pt">${ico(pIcon(it))}</span><div><b>${esc(it.name)}</b><small>${it.sku}</small></div></div></td><td>${r.batch || '—'}</td><td class="num">${fmt(r.qty)}</td><td class="num"><input type="number" min="0" class="so-cell-in" value="${r.qty}"></td><td class="num"><span class="so-diff ok">${ico('check')}Matched</span></td></tr>`; }).join('')}
          </tbody></table>
          <label class="so-rcv-note"><span>Receiving note</span><input class="so-rcv-n" placeholder="e.g. 2 cartons crushed in transit"></label>
        </div>`,
        foot: `<button class="btn ghost so-r-all">${ico('list-checks')}Receive all as sent</button><span class="spacer"></span><button class="btn secondary" data-close>Cancel</button><button class="btn primary so-r-ok">${ico('check')}Confirm Receipt</button>`,
      });
      const calc = () => {
        let rec = 0, s = 0, e = 0;
        $$('tbody tr', sh).forEach((tr) => {
          const r = rows[+tr.dataset.i]; r.rec = Math.max(0, parseFloat($('input', tr).value) || 0);
          const d = r.rec - r.qty; rec += r.rec; if (d < 0) s -= d; if (d > 0) e += d;
          tr.className = d < 0 ? 'short' : d > 0 ? 'excess' : '';
          $('.so-diff', tr).className = 'so-diff ' + (d < 0 ? 'short' : d > 0 ? 'excess' : 'ok');
          $('.so-diff', tr).innerHTML = d === 0 ? ico('check') + 'Matched' : (d < 0 ? ico('arrow-down') + 'Short ' + fmt(-d) : ico('arrow-up') + 'Excess ' + fmt(d));
        });
        FS.icons($('tbody', sh));
        FS.tick($('.so-r-rec', sh), rec, { dec: 0 }); FS.tick($('.so-r-short', sh), s, { dec: 0 }); FS.tick($('.so-r-ex', sh), e, { dec: 0 });
        return { s, e };
      };
      calc();
      sh.addEventListener('input', (e) => { if (e.target.matches('tbody input')) calc(); });
      $('.so-r-all', sh).onclick = () => { $$('tbody input', sh).forEach((inp, i) => { inp.value = rows[i].qty; }); calc(); };
      $('.so-r-ok', sh).onclick = async (ev) => {
        const { s, e } = calc();
        await busy(ev.currentTarget, 900, 'Receiving…');
        x.status = 'Received'; x.progress = 100; x.recvAt = 'today · ' + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        x.recvNote = s || e ? `Received with ${s ? fmt(s) + ' short' : ''}${s && e ? ' · ' : ''}${e ? fmt(e) + ' excess' : ''} · variance logged` : 'Received in full · stock updated';
        const r = T.recent.find((y) => y.no === x.no); if (r) r.status = 'Received';
        FS.closeOverlay(sh.closest('.overlay'));
        renderIncoming(); renderRecent();
        const card = $(`.so-inc[data-k="${k}"]`, root);
        FS.celebrate(card, 'Received');
        FS.toast(`<b>${x.no}</b> received at ${esc(L(x.to).name)}${s || e ? ` · ${x.recvNote}` : ' in full'}`, { tone: s ? 'warn' : 'good' });
      };
    }

    /* ---- post / draft */
    function issues() {
      const out = [];
      if (T.from === T.to) out.push('Source and destination cannot be the same');
      if (!T.lines.length) out.push('Add at least one product');
      T.lines.forEach((l, i) => { if (qtyOf(l) <= 0) out.push(`Line ${i + 1} has no quantity`); if (qtyOf(l) > availOf(l)) out.push(`Line ${i + 1} exceeds available stock`); });
      return out;
    }
    async function post(btn, draft) {
      const iss = issues();
      if (!draft && iss.length) {
        FS.toast(iss[0] + (iss.length > 1 ? ` (+${iss.length - 1} more)` : ''), { tone: 'warn' });
        const bad = $('.so-line.bad', root) || (T.from === T.to ? $('.so-truck', root) : $('.so-manifest', root));
        if (bad) { pulse(bad, 'so-shake'); bad.scrollIntoView({ behavior: RM() ? 'auto' : 'smooth', block: 'center' }); }
        return;
      }
      if (draft && !T.lines.length) { FS.toast('Add at least one product to save a draft', { tone: 'warn' }); return; }
      await busy(btn, draft ? 600 : 1100, draft ? 'Saving…' : 'Dispatching…');
      const no = trNo(), qty = sum(T.lines, qtyOf), val = sum(T.lines, (l) => qtyOf(l) * costOf(l));
      const now = new Date(); const tm = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      T.recent.unshift({ no, from: T.from, to: T.to, items: T.lines.length, qty, value: val, when: '01 Oct 2026 · ' + tm, status: draft ? 'Draft' : 'In transit' });
      if (!draft) {
        T.incoming.unshift({ no, from: T.from, to: T.to, status: 'Dispatched', dispatched: 'Today · ' + tm, eta: 'Today · ' + (L(T.from).name.includes('Karachi') ? 'tomorrow' : '06:30 PM'), progress: 6, driver: 'Ali Haider · LES-4471', lines: T.lines.map((l) => ({ sku: l.sku, batch: l.batch, qty: qtyOf(l) })) });
        const truck = $('.so-truck', root); truck.classList.remove('so-go'); void truck.offsetWidth; truck.classList.add('so-go');
        setTimeout(() => truck.classList.remove('so-go'), 2200);
        const st = $('.so-tr-status', root); st.className = 'so-tr-status badge info dot so-live'; st.textContent = 'Dispatched · In transit';
        setTimeout(() => { st.className = 'so-tr-status badge neutral dot'; st.textContent = 'Draft'; }, 3600);
        renderIncoming();
        setTimeout(() => { const c = T.incoming[0]; if (c && c.status === 'Dispatched') { c.status = 'In transit'; c.progress = 18; renderIncoming(); } }, 2400);
      }
      T.seq++; T.lines = [];
      $('.so-trno', root).textContent = trNo(); pulse($('.so-trno', root).parentElement);
      renderLines(); renderRecent(true);
      FS.toast(`<b>${no}</b> ${draft ? 'saved as draft' : 'dispatched · in transit to ' + esc(L(T.to === T.from ? T.to : T.to).name)}`, { tone: draft ? 'info' : 'good', action: draft ? null : { label: 'Track', fn: () => $('.so-incoming', root).scrollIntoView({ behavior: 'smooth', block: 'center' }) } });
    }

    /* ---- events */
    root.addEventListener('click', (e) => {
      const t = e.target;
      if (t.closest('.so-swap')) { [T.from, T.to] = [T.to, T.from]; const r = $('.so-route', root); r.classList.remove('so-swapping'); void r.offsetWidth; r.classList.add('so-swapping'); renderLocs(); renderLines(); return; }
      const sb = t.closest('.so-suggest button'); if (sb) { addLine(sb.dataset.sku); sg().hidden = true; $('.so-mf-q', root).value = ''; return; }
      if (t.closest('.so-mf-add') || t.closest('.so-add-more')) { const q = $('.so-mf-q', root); q.focus(); suggest(q.value); return; }
      if (t.closest('.so-mf-scan')) { const pool = ITEMS.filter((i) => i.stock > 0 && !T.lines.some((l) => l.sku === i.sku)); const it = pool[Math.floor(Math.random() * pool.length)] || ITEMS[0]; pulse(t.closest('.so-mf-scan'), 'so-beep'); addLine(it.sku, true); return; }
      const ctrl = t.closest('[data-f="ctrl"]');
      if (ctrl) { const i = +ctrl.closest('.so-line').dataset.i; T.lines[i].ctrl = !T.lines[i].ctrl; ctrl.classList.toggle('on', T.lines[i].ctrl); ctrl.setAttribute('aria-pressed', T.lines[i].ctrl); ctrl.lastChild.textContent = T.lines[i].ctrl ? 'Controlled item' : 'Non-controlled'; return; }
      const del = t.closest('[data-act="ldel"]');
      if (del) { const el = del.closest('.so-line'); const i = +el.dataset.i; const rm = T.lines[i]; removeAnimated(el, () => { T.lines.splice(i, 1); renderLines(); FS.toast(`${esc(item(rm.sku).name)} removed from manifest`, { undo: () => { T.lines.splice(i, 0, rm); renderLines(i); } }); }); return; }
      const rv = t.closest('[data-recv]'); if (rv) { receive(+rv.dataset.recv); return; }
      if (t.closest('.so-slip-view')) {
        const qty = sum(T.lines, qtyOf), val = sum(T.lines, (l) => qtyOf(l) * costOf(l));
        FS.drawer({ title: 'Transfer slip', subtitle: trNo() + ' · print preview', wide: true,
          html: `<div class="so-slip-paper"><div class="so-slip-brand"><span>${ico('leaf')}</span><b>AL-NOOR ENTERPRISES (PVT) LTD</b><small>${esc(D.company.address)} · NTN ${D.company.ntn}</small></div>
            <h3 class="so-sp-title">Stock Transfer Slip · ${trNo()}</h3>
            <div class="so-sp-grid"><div><small>From</small><b>${esc(locName(T.from))}</b><span>${esc(L(T.from).address)}</span></div><div><small>To</small><b>${esc(locName(T.to))}</b><span>${esc(L(T.to).address)}</span></div></div>
            <table class="tbl" data-plain><thead><tr><th>#</th><th>Product</th><th>Batch</th><th class="num">CTN</th><th class="num">Loose</th><th class="num">Qty</th><th class="num">Value</th></tr></thead><tbody>${T.lines.map((l, i) => { const it = item(l.sku); return `<tr><td>${i + 1}</td><td><b>${esc(it.name)}</b><small>${it.sku}${l.ctrl ? ' · controlled' : ''}</small></td><td>${l.batch || '—'}</td><td class="num">${l.ctn}</td><td class="num">${l.loose}</td><td class="num">${fmt(qtyOf(l))}</td><td class="num">${fmt(qtyOf(l) * costOf(l), 2)}</td></tr>`; }).join('') || '<tr><td colspan="7" class="so-muted">No lines yet</td></tr>'}</tbody>
            <tfoot><tr class="total"><td colspan="5">Total</td><td class="num">${fmt(qty)}</td><td class="num">${fmt(val, 2)}</td></tr></tfoot></table>
            <div class="so-sp-sign"><span>Prepared by<br><b>${esc($('.so-trby', root).value)}</b></span><span>Dispatched by<br><b>&nbsp;</b></span><span>Received by<br><b>&nbsp;</b></span></div></div>`,
          foot: `<button class="btn secondary" data-close>Close</button><button class="btn primary" data-toast="Slip sent to printer">${ico('printer')}Print slip</button>` });
        return;
      }
      if (!t.closest('.so-mf-search')) sg().hidden = true;
      const a = t.closest('[data-act="post"],[data-act="draft"]');
      if (a) post(a, a.dataset.act === 'draft');
    });
    root.addEventListener('input', (e) => {
      const t = e.target;
      if (t.classList.contains('so-mf-q')) { suggest(t.value); return; }
      const ln = t.closest('.so-line');
      if (ln && (t.dataset.f === 'ctn' || t.dataset.f === 'loose')) { T.lines[+ln.dataset.i][t.dataset.f] = Math.max(0, parseInt(t.value, 10) || 0); updateLine(+ln.dataset.i); }
      if (t.classList.contains('so-trrem')) T.remarks = t.value;
    });
    root.addEventListener('change', (e) => {
      const t = e.target;
      if (t.dataset.loc) { T[t.dataset.loc] = t.value; renderLocs(); renderLines(); const s = $(`[data-slot="${t.dataset.loc}"] .so-loc`, root); pulse(s); return; }
      const ln = t.closest('.so-line');
      if (ln && t.dataset.f === 'batch') { T.lines[+ln.dataset.i].batch = t.value; renderLines(); }
      if (t.classList.contains('so-trdate') || t.classList.contains('so-trby')) totals();
    });
    root.addEventListener('keydown', (e) => {
      if (!e.target.classList.contains('so-mf-q')) return;
      const btns = $$('.so-suggest button', root); const k = btns.findIndex((b) => b.classList.contains('hl'));
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!btns.length) return; btns[k].classList.remove('hl'); btns[(k + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length].classList.add('hl'); }
      if (e.key === 'Enter') { e.preventDefault(); const v = e.target.value.trim(); const direct = ITEMS.find((i) => i.upc === v || i.barcodes.includes(v)); const b = direct ? null : btns[Math.max(0, k)]; if (direct) addLine(direct.sku, true); else if (b) addLine(b.dataset.sku); e.target.value = ''; sg().hidden = true; }
      if (e.key === 'Escape') { sg().hidden = true; e.stopPropagation(); }
    });

    renderLocs(); renderLines(); renderRecent(); renderIncoming();
  });

  /* =====================================================================
     3. STOCK COUNT  (app/inventory/count) — sessions + 5-step wizard
     ===================================================================== */
  /* ABC classes from cost value (shared with the studio idea) */
  const ABC = (() => {
    const rows = ITEMS.map((i) => ({ sku: i.sku, v: i.stock * i.cost })).sort((a, b) => b.v - a.v);
    const tot = sum(rows, (r) => r.v); let c = 0; const m = {};
    rows.forEach((r) => { c += r.v; const p = c / tot; m[r.sku] = p <= 0.8 ? 'A' : p <= 0.95 ? 'B' : 'C'; });
    return m;
  })();
  const VREASONS = ['Miscount (recount done)', 'Damaged / unsaleable', 'Theft / pilferage', 'Unrecorded receipt', 'Unrecorded issue', 'Expired write-off', 'Unit of measure error'];

  mount('count', (root) => {
    const C = {
      seq: 18, jv: 61,
      sessions: [
        { no: 'SC-2026-017', name: 'Faisalabad blind count', loc: 'WH-FSD', scope: 'Grocery · Home Care', lines: 12, counted: 0, status: 'Draft', net: 0, by: 'Kashif Ali', date: '2026-10-01', blind: true },
        { no: 'SC-2026-016', name: 'Shop DHA full count', loc: 'SH-DHA', scope: 'All classes', lines: 16, counted: 11, status: 'Counting', net: 0, by: 'Bilal Khan', date: '2026-09-30' },
        { no: 'SC-2026-015', name: 'Monthly A-items', loc: 'WH-KHI', scope: 'ABC · A items', lines: 6, counted: 6, status: 'Variance review', net: -8640, by: 'Zainab Raza', date: '2026-09-28' },
        { no: 'SC-2026-014', name: 'Q1 cycle count · Packaging', loc: 'WH-LHR', scope: 'Packaging', lines: 4, counted: 4, status: 'Approved', net: -14250, by: 'Kashif Ali', date: '2026-09-24', jv: 'JV-2026-000058' },
        { no: 'SC-2026-013', name: 'Islamabad store spot check', loc: 'SH-ISB', scope: 'Office Supplies', lines: 4, counted: 4, status: 'Approved', net: 3120, by: 'Ali Haider', date: '2026-09-16', jv: 'JV-2026-000052' },
      ],
      W: null,
    };
    const stTone = { Draft: 'neutral', Counting: 'info', 'Variance review': 'warn', Approved: 'good' };
    const stIco = { Draft: 'file-pen', Counting: 'scan-line', 'Variance review': 'scale', Approved: 'badge-check' };
    const expAt = (it, lc) => Math.max(0, Math.round(it.stock * (LOC_SHARE[lc] || 0.1)));

    root.innerHTML = `
      <div class="so-cnt">
        ${head({ icon: 'clipboard-check', crumb: 'Stock Count', title: 'Stock Count', sub: 'Freeze a snapshot, count with a scanner, review variances and post the adjustment.',
          actions: `<span class="tagline so-tagline">Count it. Trust it.</span><button class="btn secondary so-cnt-export">${ico('download')}Export</button><button class="btn primary so-cnt-new">${ico('plus')}New count</button>` })}
        <div class="so-cnt-list">
          <div class="so-kpis c4">
            <div class="so-kpi"><span class="so-kpi-i blue">${ico('clipboard-list')}</span><div><small>Open sessions</small><b class="so-k-open">3</b><em>1 waiting for approval</em></div></div>
            <div class="so-kpi"><span class="so-kpi-i green">${ico('scan-line')}</span><div><small>Lines counted (Sep)</small><b>342</b><em>across 4 locations</em></div></div>
            <div class="so-kpi"><span class="so-kpi-i lime">${ico('target')}</span><div><small>Count accuracy</small><b>97.4%</b><em class="up">▲ 1.2 pts vs Aug</em></div></div>
            <div class="so-kpi"><span class="so-kpi-i red">${ico('scale')}</span><div><small>Net variance (Q1)</small><b>Rs −19,770</b><em>0.07% of stock value</em></div></div>
          </div>
          <div class="panel flush">
            <div class="so-ph pad"><span class="so-ph-ico">${ico('list-checks')}</span><div><h3>Count sessions</h3><p>Every count moves Draft → Counting → Variance review → Approved</p></div><span class="spacer"></span>
              <div class="seg so-cnt-filter"><button class="active" data-f="all">All</button><button data-f="open">Open</button><button data-f="Approved">Approved</button></div></div>
            <div class="table-wrap"><table class="tbl so-sess" data-no-qv><thead><tr><th>Session</th><th>Location</th><th>Scope</th><th>Progress</th><th>Status</th><th class="num">Net variance</th><th>Owner</th><th data-nosort></th></tr></thead><tbody></tbody></table></div>
          </div>
          <div class="so-flow">${['Draft', 'Counting', 'Variance review', 'Approved'].map((s, i) => `<div class="so-flow-s ${stTone[s]}"><span>${ico(stIco[s])}</span><b>${s}</b><small>${['Scope picked, nothing frozen', 'Snapshot frozen, scanning', 'Counts in, explain the gaps', 'Adjustment posted to GL'][i]}</small></div>${i < 3 ? `<i>${ico('chevron-right')}</i>` : ''}`).join('')}</div>
        </div>
        <div class="so-cnt-wz" hidden></div>
      </div>`;

    /* ------------------------------ list */
    function renderSessions(flashNo) {
      const f = ($('.so-cnt-filter .active', root) || {}).dataset ? $('.so-cnt-filter .active', root).dataset.f : 'all';
      const list = C.sessions.filter((s) => f === 'all' || (f === 'open' ? s.status !== 'Approved' : s.status === f));
      $('.so-sess tbody', root).innerHTML = list.map((s) => {
        const p = s.lines ? Math.round((s.counted / s.lines) * 100) : 0;
        const act = s.status === 'Approved' ? `<button class="btn ghost sm" data-sv="${s.no}">${ico('eye')}View</button>` : `<button class="btn secondary sm" data-go="${s.no}">${ico(s.status === 'Draft' ? 'play' : 'arrow-right')}${s.status === 'Draft' ? 'Start' : s.status === 'Counting' ? 'Continue' : 'Review'}</button>`;
        return `<tr data-no="${s.no}" class="${s.no === flashNo ? 'so-flash' : ''}">
          <td><b>${esc(s.name)}</b><small>${s.no} · ${dfmt(s.date)}${s.blind ? ' · blind' : ''}</small></td>
          <td>${esc(loc(s.loc).name)}</td><td>${esc(s.scope)}</td>
          <td><div class="so-prog"><div class="progress ${p === 100 ? '' : 'warn'}"><i style="width:${p}%"></i></div><small>${s.counted}/${s.lines} lines</small></div></td>
          <td><span class="badge ${stTone[s.status]} dot">${s.status}</span></td>
          <td class="num ${s.net < 0 ? 'neg' : s.net > 0 ? 'dr' : 'zero'}">${s.net ? (s.net < 0 ? '−' : '+') + 'Rs ' + fmt(Math.abs(s.net)) : '—'}</td>
          <td><div class="cell-user"><span class="avatar sm">${s.by.split(' ').map((x) => x[0]).join('')}</span><div><b>${esc(s.by.split(' ')[0])}</b></div></div></td>
          <td class="so-c">${act}</td></tr>`;
      }).join('') || `<tr><td colspan="8"><div class="so-empty">${ico('inbox')}<b>No sessions</b></div></td></tr>`;
      FS.icons($('.so-sess', root));
      const open = C.sessions.filter((s) => s.status !== 'Approved').length;
      FS.tick($('.so-k-open', root), open, { dec: 0 });
    }

    /* ------------------------------ wizard */
    const STEPS = [['Scope', 'crosshair'], ['Freeze', 'snowflake'], ['Count', 'scan-line'], ['Variance', 'scale'], ['Approve', 'stamp']];
    function newW(s) {
      return { no: s ? s.no : 'SC-2026-' + String(C.seq).padStart(3, '0'), name: s ? s.name : 'New cycle count', loc: s ? s.loc : 'WH-LHR', classes: new Set(), abcA: s ? /A items/.test(s.scope) : false, blind: s ? !!s.blind : false, step: 0, frozen: false, frozenAt: '', lines: [], reasonAll: '', src: s || null };
    }
    function scopeItems(W) {
      return ITEMS.filter((it) => (!W.classes.size || W.classes.has(it.cls)) && (!W.abcA || ABC[it.sku] === 'A'));
    }
    function openWizard(s, step) {
      const W = (C.W = newW(s));
      if (s && /Packaging|Grocery|Office|Home/.test(s.scope)) D.classes.forEach((c) => { if (s.scope.includes(c.name)) W.classes.add(c.id); });
      if (step && step >= 2) {
        W.frozen = true; W.frozenAt = dfmt(s.date) + ' · 09:12 AM';
        W.lines = scopeItems(W).map((it, k) => ({ sku: it.sku, exp: expAt(it, W.loc), cnt: null }));
        const pre = step >= 3 ? W.lines.length : Math.min(s.counted, W.lines.length);
        W.lines.slice(0, pre).forEach((l, k) => { l.cnt = l.exp + ([0, 0, -2, 0, 1, 0, -5, 0, 0, -1][k % 10]); });
      }
      W.step = step || 0;
      $('.so-cnt-list', root).hidden = true;
      const wz = $('.so-cnt-wz', root); wz.hidden = false;
      renderWizard();
      wz.scrollIntoView({ behavior: RM() ? 'auto' : 'smooth', block: 'start' });
    }
    function closeWizard() { C.W = null; $('.so-cnt-wz', root).hidden = true; $('.so-cnt-list', root).hidden = false; renderSessions(); }

    function renderWizard() {
      const W = C.W, wz = $('.so-cnt-wz', root);
      wz.innerHTML = `
        <div class="panel so-wz">
          <div class="so-wz-top">
            <div><small>${W.no} · ${esc(loc(W.loc).name)}</small><h2 contenteditable="${W.step === 0}" spellcheck="false" class="so-wz-name">${esc(W.name)}</h2></div>
            <button class="btn ghost sm so-wz-close">${ico('x')}Close</button>
          </div>
          <ol class="so-steps">${STEPS.map((s, i) => `<li class="${i === W.step ? 'on' : i < W.step ? 'done' : ''}" data-step="${i}"><span>${i < W.step ? ico('check') : ico(s[1])}</span><b>${i + 1}. ${s[0]}</b></li>`).join('')}<i class="so-steps-bar" style="--p:${W.step / 4}"></i></ol>
          <div class="so-wz-body"></div>
          <div class="so-wz-foot"><button class="btn secondary so-wz-back"${W.step === 0 ? ' disabled' : ''}>${ico('arrow-left')}Back</button><span class="so-wz-hint"></span><button class="btn primary so-wz-next">${W.step === 4 ? ico('stamp') + 'Approve &amp; post adjustment' : 'Continue' + ico('arrow-right')}</button></div>
        </div>`;
      [stepScope, stepFreeze, stepCount, stepVariance, stepApprove][W.step]($('.so-wz-body', wz));
      FS.icons(wz);
    }
    const hint = (t) => { const h = $('.so-wz-hint', root); if (h) h.innerHTML = t; };

    /* step 1: scope */
    function stepScope(b) {
      const W = C.W;
      b.innerHTML = `<div class="so-scope">
        <div class="so-scope-l">
          <h4>Where are you counting?</h4>
          <div class="so-loc-pick-grid">${LOCS.map((l) => `<button class="so-lp${l.code === W.loc ? ' on' : ''}" data-lp="${l.code}"><span>${ico(l.type === 'Shop' ? 'store' : 'warehouse')}</span><b>${esc(l.name)}</b><small>${fmt(l.products)} products</small></button>`).join('')}</div>
          <h4>Product classes <small>(none selected = all)</small></h4>
          <div class="so-cls-chips">${D.classes.map((c) => `<button class="so-cchip${W.classes.has(c.id) ? ' on' : ''}" data-cls="${c.id}">${ico(c.icon)}${esc(c.name)}<em>${ITEMS.filter((i) => i.cls === c.id).length}</em></button>`).join('')}</div>
          <div class="so-toggles">
            <label class="so-tg"><span class="so-tg-i">${ico('chart-pie')}</span><span><b>ABC · A-items only</b><small>Top items making up 80% of stock value</small></span><span class="switch"><input type="checkbox" class="so-abc"${W.abcA ? ' checked' : ''}><i></i></span></label>
            <label class="so-tg"><span class="so-tg-i">${ico('eye-off')}</span><span><b>Blind count</b><small>Counters can't see the expected quantity</small></span><span class="switch"><input type="checkbox" class="so-blind"${W.blind ? ' checked' : ''}><i></i></span></label>
          </div>
        </div>
        <div class="so-scope-r">
          <div class="so-scope-sum"><small>In scope</small><b class="so-sc-n">0</b><span>products</span>
            <div class="so-sc-kv"><div><small>Expected units</small><b class="so-sc-u">0</b></div><div><small>Value at cost</small><b class="so-sc-v">0</b></div></div>
            <div class="so-sc-list"></div></div>
        </div></div>`;
      const upd = () => {
        const its = scopeItems(W);
        FS.tick($('.so-sc-n', b), its.length, { dec: 0 });
        FS.tick($('.so-sc-u', b), sum(its, (i) => expAt(i, W.loc)), { dec: 0 });
        FS.tick($('.so-sc-v', b), sum(its, (i) => expAt(i, W.loc) * i.cost), { dec: 0, prefix: 'Rs ' });
        $('.so-sc-list', b).innerHTML = its.slice(0, 6).map((i) => `<span>${ico(pIcon(i))}${esc(i.name)}<em class="abc ${ABC[i.sku]}">${ABC[i.sku]}</em></span>`).join('') + (its.length > 6 ? `<span class="more">+${its.length - 6} more</span>` : '') + (its.length ? '' : '<span class="more">Nothing in scope — widen the filters</span>');
        FS.icons($('.so-sc-list', b));
        hint(its.length ? `${its.length} lines will be frozen` : `<span class="so-bad">${ico('triangle-alert')}Pick a wider scope</span>`); FS.icons($('.so-wz-hint', root));
      };
      b.onclick = (e) => {
        const lp = e.target.closest('[data-lp]'); if (lp) { W.loc = lp.dataset.lp; $$('.so-lp', b).forEach((x) => x.classList.toggle('on', x === lp)); upd(); return; }
        const ch = e.target.closest('[data-cls]'); if (ch) { W.classes.has(ch.dataset.cls) ? W.classes.delete(ch.dataset.cls) : W.classes.add(ch.dataset.cls); ch.classList.toggle('on'); upd(); }
      };
      b.onchange = (e) => { if (e.target.classList.contains('so-abc')) { W.abcA = e.target.checked; upd(); } if (e.target.classList.contains('so-blind')) W.blind = e.target.checked; };
      upd();
    }

    /* step 2: freeze snapshot (animated) */
    function stepFreeze(b) {
      const W = C.W, its = scopeItems(W);
      b.innerHTML = `<div class="so-freeze${W.frozen ? ' frozen' : ''}">
        <div class="so-fz-art"><span class="so-fz-ring"></span><span class="so-fz-ico">${ico(W.frozen ? 'lock' : 'snowflake')}</span></div>
        <div class="so-fz-main">
          <h3>${W.frozen ? 'Snapshot frozen' : 'Freeze the book quantities'}</h3>
          <p>${W.frozen ? `Book stock for ${esc(loc(W.loc).name)} was captured at <b>${W.frozenAt}</b>. Sales and receipts after this moment won't change the expected quantities.` : `We'll capture expected quantities for ${its.length} products at ${esc(loc(W.loc).name)}. Movements after the freeze are tracked separately, so counting can happen while the shop stays open.`}</p>
          <div class="so-fz-bar"><i style="width:${W.frozen ? 100 : 0}%"></i></div>
          <div class="so-fz-tick">${W.frozen ? `${ico('circle-check')}${W.lines.length} lines · ${fmt(sum(W.lines, (l) => l.exp))} units · Rs ${fmt(sum(W.lines, (l) => l.exp * item(l.sku).cost))}` : `${ico('info')}Nothing frozen yet`}</div>
          ${W.frozen ? '' : `<button class="btn primary lg so-fz-go">${ico('snowflake')}Freeze snapshot</button>`}
        </div></div>`;
      hint(W.frozen ? 'Ready to count' : 'Freeze first to continue');
      const go = $('.so-fz-go', b);
      if (go) go.onclick = async () => {
        go.disabled = true; go.innerHTML = '<span class="so-spin"></span>Freezing…';
        const box = $('.so-freeze', b); box.classList.add('running');
        const bar = $('.so-fz-bar i', b), tk = $('.so-fz-tick', b);
        for (let k = 0; k < its.length; k++) {
          bar.style.width = ((k + 1) / its.length) * 100 + '%';
          tk.innerHTML = `${ico('loader')}Capturing ${its[k].sku} · ${esc(its[k].name)}`; FS.icons(tk);
          await wait(Math.max(40, 900 / its.length));
        }
        W.lines = its.map((it) => ({ sku: it.sku, exp: expAt(it, W.loc), cnt: null }));
        W.frozen = true; W.frozenAt = '01 Oct 2026 · ' + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        if (!W.src) { C.sessions.unshift({ no: W.no, name: W.name, loc: W.loc, scope: scopeLabel(W), lines: W.lines.length, counted: 0, status: 'Counting', net: 0, by: ME, date: '2026-10-01', blind: W.blind }); W.src = C.sessions[0]; C.seq++; }
        else { W.src.status = 'Counting'; W.src.lines = W.lines.length; }
        stepFreeze(b); FS.icons(b);
        FS.celebrate($('.so-fz-ico', b), 'Frozen');
      };
    }
    const scopeLabel = (W) => (W.abcA ? 'ABC · A items' : W.classes.size ? [...W.classes].map((c) => cls(c).name).join(' · ') : 'All classes');

    /* step 3: count sheet with scan entry */
    function stepCount(b) {
      const W = C.W;
      b.innerHTML = `<div class="so-cs">
        <div class="so-cs-top">
          <label class="so-scanbox">${ico('scan-barcode')}<input class="so-cs-scan" placeholder="Scan a barcode or type SKU / name, then Enter" autocomplete="off"><span class="so-cs-mul">× <input type="number" min="1" value="1" class="so-cs-x" aria-label="Multiplier"></span></label>
          <button class="btn secondary so-cs-sim">${ico('zap')}Simulate scanner</button>
          <button class="btn ghost so-cs-fill">${ico('wand-sparkles')}Count the rest (demo)</button>
        </div>
        <div class="so-cs-prog"><div><b class="so-cs-pc">0</b> of ${W.lines.length} lines counted<span class="so-cs-pct">0%</span></div><div class="progress"><i style="width:0%"></i></div></div>
        <div class="table-wrap"><table class="tbl so-cs-tbl" data-plain><thead><tr><th>#</th><th>Product</th><th>Shelf</th><th>Barcode</th><th class="num">Expected</th><th class="so-c">Counted</th><th>Status</th></tr></thead><tbody></tbody></table></div>
        <p class="so-cs-last so-muted">${W.blind ? ico('eye-off') + 'Blind count: expected quantities are hidden from counters.' : ico('info') + 'Tip: carton barcodes add a full carton.'}</p>
      </div>`;
      const tb = $('tbody', b);
      const status = (l) => {
        if (l.cnt == null) return `<span class="so-st nc">Not counted</span>`;
        if (W.blind) return `<span class="so-st ok">${ico('check')}Counted</span>`;
        const d = l.cnt - l.exp;
        return d === 0 ? `<span class="so-st ok">${ico('check')}Match</span>` : d < 0 ? `<span class="so-st sh">${ico('arrow-down')}Short ${fmt(-d)}</span>` : `<span class="so-st ex">${ico('arrow-up')}Over ${fmt(d)}</span>`;
      };
      const row = (l, i) => { const it = item(l.sku); return `<tr data-i="${i}" class="${l.cnt == null ? '' : 'counted'}"><td class="so-idx">${i + 1}</td><td><div class="so-prod"><span class="so-pt">${ico(pIcon(it))}</span><div><b>${esc(it.name)}</b><small>${it.sku} · ${it.loose}</small></div></div></td><td><span class="so-shelf">${it.shelf}</span></td><td class="so-mono so-muted">${it.upc}</td><td class="num">${W.blind ? '<span class="so-mask">•••</span>' : fmt(l.exp)}</td><td class="so-c"><div class="so-stepper"><button data-d="-1" aria-label="Minus">${ico('minus')}</button><input type="number" min="0" value="${l.cnt == null ? '' : l.cnt}" placeholder="—"><button data-d="1" aria-label="Plus">${ico('plus')}</button></div></td><td class="so-stc">${status(l)}</td></tr>`; };
      tb.innerHTML = W.lines.map(row).join('');
      const prog = () => {
        const n = W.lines.filter((l) => l.cnt != null).length, p = W.lines.length ? Math.round((n / W.lines.length) * 100) : 0;
        FS.tick($('.so-cs-pc', b), n, { dec: 0 }); $('.so-cs-pct', b).textContent = p + '%';
        $('.so-cs-prog .progress i', b).style.width = p + '%';
        $('.so-cs-prog .progress', b).classList.toggle('warn', p < 100);
        hint(n === W.lines.length ? `${ico('circle-check')}All lines counted` : `${W.lines.length - n} lines left — uncounted lines count as zero`); FS.icons($('.so-wz-hint', root));
        if (W.src) W.src.counted = n;
      };
      const upd = (i, flash) => {
        const tr = tb.querySelector(`tr[data-i="${i}"]`), l = W.lines[i];
        $('input', tr).value = l.cnt == null ? '' : l.cnt;
        tr.classList.toggle('counted', l.cnt != null);
        $('.so-stc', tr).innerHTML = status(l); FS.icons($('.so-stc', tr));
        if (flash) { flashRow(tr); tr.scrollIntoView({ block: 'nearest', behavior: RM() ? 'auto' : 'smooth' }); }
        prog();
      };
      const scan = (code) => {
        code = String(code || '').trim(); if (!code) return false;
        const it = findItem(code);
        const i = it ? W.lines.findIndex((l) => l.sku === it.sku) : -1;
        const box = $('.so-scanbox', b);
        if (i < 0) { pulse(box, 'so-shake'); $('.so-cs-last', b).innerHTML = `${ico('circle-x')}<span class="so-bad">“${esc(code)}” is not in this count's scope</span>`; FS.icons($('.so-cs-last', b)); return false; }
        const by = (isCarton(code, it) ? it.ctn : 1) * Math.max(1, parseInt($('.so-cs-x', b).value, 10) || 1);
        W.lines[i].cnt = (W.lines[i].cnt || 0) + by;
        pulse(box, 'so-beep');
        $('.so-cs-last', b).innerHTML = `${ico('scan-barcode')}<span><b>+${by}</b> ${esc(it.name)} → ${fmt(W.lines[i].cnt)} ${it.loose}</span>`; FS.icons($('.so-cs-last', b));
        upd(i, true); return true;
      };
      b.onkeydown = (e) => { if (e.target.classList.contains('so-cs-scan') && e.key === 'Enter') { e.preventDefault(); if (scan(e.target.value)) e.target.value = ''; } };
      b.oninput = (e) => { const tr = e.target.closest('tbody tr'); if (tr && e.target.type === 'number') { const i = +tr.dataset.i; W.lines[i].cnt = e.target.value === '' ? null : Math.max(0, parseInt(e.target.value, 10) || 0); const st = $('.so-stc', tr); st.innerHTML = status(W.lines[i]); FS.icons(st); tr.classList.toggle('counted', W.lines[i].cnt != null); prog(); } };
      b.onclick = async (e) => {
        const d = e.target.closest('[data-d]');
        if (d) { const i = +d.closest('tr').dataset.i; const l = W.lines[i]; l.cnt = Math.max(0, (l.cnt == null ? (W.blind ? 0 : l.exp) : l.cnt) + +d.dataset.d); upd(i); return; }
        if (e.target.closest('.so-cs-sim')) {
          const btn = e.target.closest('.so-cs-sim'); btn.disabled = true;
          const VV = [0, -2, 0, 1, 0, -4, 0, 0, 3, -1];
          const todo = W.lines.map((l, i) => i).filter((i) => W.lines[i].cnt == null).slice(0, 8);
          if (!todo.length) { FS.toast('Every line already has a count', { tone: 'info', ms: 1800 }); btn.disabled = false; return; }
          for (let k = 0; k < todo.length; k++) {
            const l = W.lines[todo[k]], it = item(l.sku), want = Math.max(1, l.exp + VV[k % VV.length]);
            $('.so-cs-x', b).value = want; $('.so-cs-scan', b).value = it.upc; await wait(260); scan(it.upc); $('.so-cs-scan', b).value = '';
          }
          $('.so-cs-x', b).value = 1;
          btn.disabled = false; return;
        }
        if (e.target.closest('.so-cs-fill')) {
          const VAR = [0, 0, -3, 0, 2, 0, 0, -6, 0, 0, -1, 0, 4, 0, 0, -2];
          W.lines.forEach((l, i) => { if (l.cnt == null) { l.cnt = Math.max(0, l.exp + VAR[i % VAR.length]); upd(i); } });
          FS.toast('Remaining lines filled with demo counts', { tone: 'info', ms: 2000 });
        }
      };
      prog();
      setTimeout(() => { const s = $('.so-cs-scan', b); if (s) s.focus({ preventScroll: true }); }, 60);
    }

    /* step 4: variance review */
    function stepVariance(b) {
      const W = C.W;
      W.lines.forEach((l) => { if (l.cnt == null) { l.cnt = 0; l.uncounted = true; } });
      const vr = (l) => l.cnt - l.exp;
      b.innerHTML = `<div class="so-vr">
        ${W.lines.some((l) => l.uncounted) ? `<div class="banner warn">${ico('triangle-alert')}<div><b>${W.lines.filter((l) => l.uncounted).length} uncounted lines were set to zero</b><p>Go back to the count sheet if those items are actually on the shelf.</p></div></div>` : ''}
        <div class="so-vr-top">
          <div class="chips so-vr-f"><button class="active" data-vf="all">All lines <i>${W.lines.length}</i></button><button data-vf="var">Variances <i>${W.lines.filter((l) => vr(l)).length}</i></button><button data-vf="sh">Short <i>${W.lines.filter((l) => vr(l) < 0).length}</i></button><button data-vf="ex">Excess <i>${W.lines.filter((l) => vr(l) > 0).length}</i></button></div>
          <span class="spacer"></span>
          <label class="so-vr-all">Apply reason to all variances <select class="so-vr-ra"><option value="">Choose…</option>${opts(VREASONS)}</select></label>
        </div>
        <div class="table-wrap"><table class="tbl so-vr-tbl" data-plain><thead><tr><th>Product</th><th class="num">Expected</th><th class="num">Counted</th><th class="num">Variance</th><th class="num">Variance value</th><th class="num">%</th><th>Reason</th></tr></thead><tbody></tbody>
          <tfoot><tr class="total"><td>Totals</td><td class="num so-vt-e"></td><td class="num so-vt-c"></td><td class="num so-vt-q"></td><td class="num so-vt-v"></td><td></td><td></td></tr></tfoot></table></div>
        <div class="so-vr-cards">
          <div class="sh"><small>Shortage value</small><b class="so-vc-s">0</b></div>
          <div class="ex"><small>Excess value</small><b class="so-vc-e">0</b></div>
          <div class="net"><small>Net adjustment</small><b class="so-vc-n">0</b></div>
          <div class="acc"><small>Line accuracy</small><b class="so-vc-a">0</b></div>
        </div></div>`;
      const tb = $('tbody', b);
      const render = () => {
        const f = $('.so-vr-f .active', b).dataset.vf;
        tb.innerHTML = W.lines.map((l, i) => ({ l, i })).filter(({ l }) => f === 'all' || (f === 'var' ? vr(l) : f === 'sh' ? vr(l) < 0 : vr(l) > 0)).map(({ l, i }) => {
          const it = item(l.sku), d = vr(l), v = d * it.cost, p = l.exp ? (d / l.exp) * 100 : d ? 100 : 0;
          return `<tr data-i="${i}" class="${d < 0 ? 'sh' : d > 0 ? 'ex' : 'ok'}"><td><div class="so-prod"><span class="so-pt">${ico(pIcon(it))}</span><div><b>${esc(it.name)}</b><small>${it.sku}${l.uncounted ? ' · <span class="so-bad">not counted</span>' : ''}</small></div></div></td>
            <td class="num">${fmt(l.exp)}</td><td class="num"><b>${fmt(l.cnt)}</b></td>
            <td class="num"><span class="so-vq">${d === 0 ? '—' : (d > 0 ? '+' : '−') + fmt(Math.abs(d))}</span></td>
            <td class="num">${d === 0 ? '<span class="zero">—</span>' : (d > 0 ? '+' : '−') + 'Rs ' + fmt(Math.abs(v))}</td>
            <td class="num"><span class="so-vp">${d === 0 ? '0%' : (d > 0 ? '+' : '') + p.toFixed(1) + '%'}</span></td>
            <td>${d === 0 ? '<span class="so-st ok">' + ico('check') + 'No action</span>' : `<select class="so-vr-r${l.reason ? '' : ' need'}">${'<option value="">Select reason</option>' + opts(VREASONS, l.reason)}</select>`}</td></tr>`;
        }).join('') || `<tr><td colspan="7"><div class="so-empty">${ico('circle-check')}<b>Nothing here</b></div></td></tr>`;
        FS.icons(tb);
        const sh = sum(W.lines.filter((l) => vr(l) < 0), (l) => -vr(l) * item(l.sku).cost), ex = sum(W.lines.filter((l) => vr(l) > 0), (l) => vr(l) * item(l.sku).cost);
        $('.so-vt-e', b).textContent = fmt(sum(W.lines, (l) => l.exp)); $('.so-vt-c', b).textContent = fmt(sum(W.lines, (l) => l.cnt));
        const nq = sum(W.lines, vr); $('.so-vt-q', b).textContent = (nq > 0 ? '+' : nq < 0 ? '−' : '') + fmt(Math.abs(nq));
        $('.so-vt-v', b).textContent = (ex - sh < 0 ? '−' : '+') + 'Rs ' + fmt(Math.abs(ex - sh));
        FS.tick($('.so-vc-s', b), sh, { dec: 0, prefix: 'Rs ' }); FS.tick($('.so-vc-e', b), ex, { dec: 0, prefix: 'Rs ' });
        FS.tick($('.so-vc-n', b), ex - sh, { dec: 0, prefix: 'Rs ' });
        FS.tick($('.so-vc-a', b), (W.lines.filter((l) => !vr(l)).length / W.lines.length) * 100, { dec: 1, suffix: '%' });
        const need = W.lines.filter((l) => vr(l) && !l.reason).length;
        hint(need ? `${ico('circle-alert')}${need} variance${need > 1 ? 's' : ''} need a reason` : `${ico('circle-check')}All variances explained`); FS.icons($('.so-wz-hint', root));
      };
      b.onclick = (e) => { if (e.target.closest('.so-vr-f button')) setTimeout(render, 0); };
      b.onchange = (e) => {
        if (e.target.classList.contains('so-vr-r')) { W.lines[+e.target.closest('tr').dataset.i].reason = e.target.value; e.target.classList.toggle('need', !e.target.value); render(); }
        if (e.target.classList.contains('so-vr-ra') && e.target.value) { W.lines.forEach((l) => { if (vr(l) && !l.reason) l.reason = e.target.value; }); render(); FS.toast('Reason applied to all open variances', { tone: 'info', ms: 1800 }); }
      };
      render();
      if (W.src) { W.src.status = 'Variance review'; W.src.counted = W.lines.length; }
    }

    /* step 5: approve → journal preview */
    function stepApprove(b) {
      const W = C.W, vr = (l) => l.cnt - l.exp;
      const sh = sum(W.lines.filter((l) => vr(l) < 0), (l) => -vr(l) * item(l.sku).cost), ex = sum(W.lines.filter((l) => vr(l) > 0), (l) => vr(l) * item(l.sku).cost);
      const jv = 'JV-2026-' + String(C.jv).padStart(6, '0');
      const rows = [];
      if (sh) rows.push(['5160', 'Inventory shrinkage & losses', 'Count shortages · ' + W.no, sh, 0], ['1201', 'Stock in trade', 'Reduce book stock', 0, sh]);
      if (ex) rows.push(['1201', 'Stock in trade', 'Count surplus · ' + W.no, ex, 0], ['4920', 'Inventory gains (other income)', 'Surplus recognised', 0, ex]);
      b.innerHTML = `<div class="so-ap">
        <div class="so-ap-paper">
          <div class="so-ap-h"><div><small>Adjustment journal · preview</small><h3>${jv}</h3></div><span class="badge warn dot">Pending approval</span></div>
          <div class="so-ap-meta"><span>${ico('calendar')}01 Oct 2026</span><span>${ico('warehouse')}${esc(loc(W.loc).name)}</span><span>${ico('clipboard-check')}${W.no}</span></div>
          <table class="tbl" data-plain><thead><tr><th>Account</th><th>Narration</th><th class="num">Debit</th><th class="num">Credit</th></tr></thead><tbody>
          ${rows.length ? rows.map((r) => `<tr><td><b>${r[0]}</b><small>${r[1]}</small></td><td>${esc(r[2])}</td><td class="num dr">${r[3] ? fmt(r[3], 2) : ''}</td><td class="num cr">${r[4] ? fmt(r[4], 2) : ''}</td></tr>`).join('') : `<tr><td colspan="4" class="so-muted">No variances — nothing to post. Approving closes the session.</td></tr>`}
          </tbody><tfoot><tr class="total"><td colspan="2">Total</td><td class="num">${fmt(sh + ex, 2)}</td><td class="num">${fmt(sh + ex, 2)}</td></tr></tfoot></table>
          <div class="so-ap-bal">${ico('scale')}Debits equal credits · balanced</div>
        </div>
        <div class="so-ap-side">
          <div class="so-ap-kv"><div><small>Lines</small><b>${W.lines.length}</b></div><div><small>Variances</small><b>${W.lines.filter(vr).length}</b></div><div><small>Shortage</small><b class="neg">Rs ${fmt(sh)}</b></div><div><small>Excess</small><b class="pos">Rs ${fmt(ex)}</b></div></div>
          <h4>Approval</h4>
          <div class="so-ap-who"><span class="avatar">SJ</span><div><b>${ME}</b><small>Finance Manager · approver</small></div></div>
          <label class="so-ap-note"><span>Comment</span><textarea rows="3" placeholder="Optional note for the audit trail">Variances reviewed with ${esc(W.src ? W.src.by : ME)}. Recounts done for lines above 5%.</textarea></label>
          <p class="so-muted">${ico('info')}On approval the stock ledger is corrected and the journal is posted to the GL.</p>
        </div></div>`;
      hint('Review the journal, then approve');
      C.preview = { jv, net: ex - sh };
    }

    async function next(btn) {
      const W = C.W;
      if (W.step === 0) { if (!scopeItems(W).length) { pulse($('.so-scope-r', root), 'so-shake'); FS.toast('Nothing in scope', { tone: 'warn' }); return; } W.name = $('.so-wz-name', root).textContent.trim() || W.name; }
      if (W.step === 1 && !W.frozen) { pulse($('.so-freeze', root), 'so-shake'); FS.toast('Freeze the snapshot first', { tone: 'warn' }); return; }
      if (W.step === 2 && !W.lines.some((l) => l.cnt != null)) { pulse($('.so-scanbox', root), 'so-shake'); FS.toast('Count at least one line', { tone: 'warn' }); return; }
      if (W.step === 3) { const need = W.lines.filter((l) => l.cnt - l.exp && !l.reason); if (need.length) { const s = $('.so-vr-r.need', root); if (s) { pulse(s, 'so-shake'); s.focus(); } FS.toast(`Give a reason for ${need.length} variance${need.length > 1 ? 's' : ''}`, { tone: 'warn' }); return; } }
      if (W.step === 4) {
        await busy(btn, 1100, 'Posting…');
        const s = W.src || {}; Object.assign(s, { status: 'Approved', net: C.preview.net, jv: C.preview.jv, counted: W.lines.length, lines: W.lines.length });
        if (!W.src) C.sessions.unshift(Object.assign(s, { no: W.no, name: W.name, loc: W.loc, scope: scopeLabel(W), by: ME, date: '2026-10-01' }));
        C.jv++;
        FS.celebrate(btn, 'Approved');
        const no = W.no, jv = C.preview.jv;
        closeWizard(); renderSessions(no);
        FS.toast(`<b>${no}</b> approved · ${jv} posted (${C.preview.net < 0 ? '−' : '+'}Rs ${fmt(Math.abs(C.preview.net))})`, { tone: 'good', action: { label: 'Open GL', fn: () => FS.go('app/accounting/vouchers') } });
        return;
      }
      W.step++; renderWizard();
    }

    root.addEventListener('click', (e) => {
      const t = e.target;
      if (t.closest('.so-cnt-new')) { openWizard(null, 0); return; }
      if (t.closest('.so-cnt-export')) { FS.toast('Count sessions exported to Excel', { tone: 'good' }); return; }
      if (t.closest('.so-cnt-filter button')) { setTimeout(() => renderSessions(), 0); return; }
      const g = t.closest('[data-go]');
      if (g) { const s = C.sessions.find((x) => x.no === g.dataset.go); openWizard(s, s.status === 'Draft' ? 0 : s.status === 'Counting' ? 2 : 3); return; }
      const sv = t.closest('[data-sv]');
      if (sv) { const s = C.sessions.find((x) => x.no === sv.dataset.sv); FS.drawer({ title: s.name, subtitle: s.no + ' · ' + loc(s.loc).name, html: `<div class="so-dr-hero"><span>${ico('badge-check')}</span><div><b>${s.net < 0 ? '−' : '+'}Rs ${fmt(Math.abs(s.net))}</b><small>${s.lines} lines · ${esc(s.scope)}</small></div><span class="badge good">Approved</span></div><div class="dl"><div><span>Journal</span><b>${s.jv || '—'}</b></div><div><span>Counted by</span><b>${esc(s.by)}</b></div><div><span>Date</span><b>${dfmt(s.date)}</b></div><div><span>Approved by</span><b>${ME}</b></div></div>`, foot: `<button class="btn secondary" data-close>Close</button><a class="btn primary" href="#/app/accounting/vouchers">${ico('book-open')}Open journal</a>` }); return; }
      if (!C.W) return;
      if (t.closest('.so-wz-close')) { closeWizard(); return; }
      if (t.closest('.so-wz-back')) { C.W.step = Math.max(0, C.W.step - 1); if (C.W.step === 2) C.W.lines.forEach((l) => { if (l.uncounted) { l.cnt = null; delete l.uncounted; } }); renderWizard(); return; }
      if (t.closest('.so-wz-next')) { next(t.closest('.so-wz-next')); return; }
      const st = t.closest('.so-steps li.done'); if (st) { C.W.step = +st.dataset.step; renderWizard(); }
    });

    renderSessions();
  });

  /* =====================================================================
     4. BATCHES & EXPIRY  (app/inventory/batches) — FEFO register
     ===================================================================== */
  const BATCHES = (() => {
    const out = [];
    const locs = ['WH-LHR', 'WH-KHI', 'SH-DHA', 'WH-FSD', 'SH-ISB'];
    ITEMS.forEach((it, k) => it.batches.forEach((b, j) => out.push({ sku: it.sku, no: b.no, exp: b.exp, qty: b.qty, cost: b.cost, loc: locs[(k + j) % 5] })));
    [['FD-5001', 'FD5001X', '2026-09-18', 320, 'WH-LHR'], ['FD-5003', 'FD5003X', '2026-09-27', 48, 'SH-DHA'], ['IN-3001', 'IN3001X', '2026-08-31', 10, 'WH-FSD'],
      ['FD-5004', 'FD5004E', '2026-10-05', 12, 'SH-ISB'], ['FD-5004', 'FD5004C', '2026-10-12', 36, 'WH-KHI'], ['FD-5002', 'FD5002C', '2026-10-24', 60, 'SH-ISB'],
      ['IN-3001', 'IN3001C', '2026-11-08', 40, 'WH-LHR'], ['FD-5001', 'FD5001C', '2026-11-20', 720, 'WH-KHI'], ['FD-5003', 'FD5003C', '2026-12-15', 96, 'WH-FSD'],
      ['FD-5004', 'FD5004D', '2027-01-31', 48, 'SH-DHA'], ['FD-5002', 'FD5002D', '2027-02-27', 120, 'WH-LHR'], ['IN-3001', 'IN3001D', '2027-03-31', 60, 'WH-KHI'],
      ['FD-5001', 'FD5001D', '2027-04-30', 1440, 'WH-LHR'], ['FD-5003', 'FD5003D', '2027-08-31', 240, 'WH-LHR'], ['FD-5002', 'FD5002E', '2027-09-15', 84, 'WH-KHI'],
    ].forEach((r) => out.push({ sku: r[0], no: r[1], exp: r[2], qty: r[3], cost: item(r[0]).cost, loc: r[4] }));
    return out.map((b, i) => Object.assign(b, { id: i, days: daysTo(b.exp) }));
  })();
  const dispOf = (d) => (d < 0 ? 'Quarantine' : d <= 90 ? 'Priority sale' : 'Saleable');
  const DISP_T = { Quarantine: 'danger', 'Priority sale': 'warn', Saleable: 'good', Clearance: 'violet', 'Return to principal': 'info', 'Written off': 'neutral' };
  const dayTone = (d) => 't' + (d < 0 ? 'x' : d <= 30 ? 'r' : d <= 90 ? 'w' : d <= 183 ? 'i' : 'g');

  mount('batches', (root) => {
    const R = BATCHES.map((b) => ({ ...b, disp: dispOf(b.days), gone: false }));
    const S = { win: 'all', q: '', loc: '' };
    const WINS = [
      ['exp', 'Expired', 'Quarantine immediately', 'calendar-x', (d) => d < 0, 'red'],
      ['30', 'Next 30 days', 'Sell first or return', 'alarm-clock', (d) => d >= 0 && d <= 30, 'orange'],
      ['90', 'Next 90 days', 'Priority sale / return', 'hourglass', (d) => d >= 0 && d <= 90, 'warn'],
      ['180', 'Within 6 months', 'Monitor closely', 'calendar-clock', (d) => d >= 0 && d <= 183, 'info'],
      ['all', 'All batches', 'Complete register', 'layers', () => true, 'green'],
    ];
    const live = () => R.filter((r) => !r.gone);
    const val = (r) => r.qty * r.cost;

    root.innerHTML = `
      <div class="so-bx">
        ${head({ icon: 'calendar-clock', crumb: 'Batches & Expiry', title: 'Batches & Expiry', sub: 'First-expiry-first-out register for every batch-tracked product, across all locations.',
          actions: `<span class="tagline so-tagline">First to expire, first to go</span><button class="btn secondary so-bx-csv">${ico('download')}Export register</button><a class="btn primary" href="#/app/inventory/transfer">${ico('truck')}Move stock</a>` })}
        <div class="so-bx-cards"></div>
        <div class="so-bx-viz">
          <div class="panel"><div class="so-ph"><span class="so-ph-ico">${ico('chart-column')}</span><div><h3>Expiry timeline</h3><p>Stock value expiring each month at cost</p></div><span class="spacer"></span><span class="so-legend"><i class="tx"></i>Expired<i class="tr"></i>≤30d<i class="tw"></i>≤90d<i class="ti"></i>≤6m<i class="tg"></i>Later</span></div><div class="so-tlbars"></div></div>
          <div class="panel"><div class="so-ph"><span class="so-ph-ico">${ico('calendar-days')}</span><div><h3>Expiry calendar</h3><p>Next 26 weeks · darker = more value expiring</p></div></div><div class="so-heat"></div></div>
        </div>
        <div class="panel flush">
          <div class="so-ph pad"><span class="so-ph-ico">${ico('list-ordered')}</span><div><h3>FEFO register</h3><p class="so-bx-sub"></p></div><span class="spacer"></span>
            <label class="so-search so-bx-q">${ico('search')}<input placeholder="Search product or batch…"></label>
            <select class="so-bx-loc"><option value="">All locations</option>${opts(LOCS.map((l) => ({ v: l.code, l: l.name })))}</select></div>
          <div class="table-wrap"><table class="tbl so-bx-tbl" data-plain><thead><tr><th>#</th><th>Product</th><th>Batch</th><th>Location</th><th>Expiry</th><th>Days remaining</th><th class="num">Qty</th><th class="num">Value (Rs)</th><th>Disposition</th><th></th></tr></thead><tbody></tbody>
            <tfoot><tr class="total"><td colspan="6">Total · <span class="so-bx-n"></span></td><td class="num so-bx-tq"></td><td class="num so-bx-tv"></td><td colspan="2"></td></tr></tfoot></table></div>
        </div>
      </div>`;

    function cards() {
      $('.so-bx-cards', root).innerHTML = WINS.map((w, i) => {
        const rs = live().filter((r) => w[4](r.days));
        return `<button class="so-bxc ${w[5]}${S.win === w[0] ? ' on' : ''}" data-win="${w[0]}" style="--i:${i}"><span class="so-bxc-i">${ico(w[3])}</span><span class="so-bxc-t">${w[1]}</span><b>${rs.length}</b><small>${w[2]}</small><em>Rs ${fmt(sum(rs, val))}</em></button>`;
      }).join('');
      FS.icons($('.so-bx-cards', root));
    }
    function rows() {
      const w = WINS.find((x) => x[0] === S.win);
      return live().filter((r) => w[4](r.days)).filter((r) => !S.loc || r.loc === S.loc)
        .filter((r) => !S.q || (item(r.sku).name + ' ' + r.no + ' ' + r.sku).toLowerCase().includes(S.q)).sort((a, b) => a.days - b.days);
    }
    function table(flashId) {
      const rs = rows(), w = WINS.find((x) => x[0] === S.win);
      $('.so-bx-sub', root).textContent = `${w[1]} · FEFO priority order · ${rs.length} batch records`;
      $('.so-bx-tbl tbody', root).innerHTML = rs.map((r, k) => {
        const it = item(r.sku), d = r.days;
        return `<tr data-id="${r.id}" class="${r.id === flashId ? 'so-flash' : ''}">
          <td class="so-idx">${k + 1}</td>
          <td><div class="so-prod"><span class="so-pt">${ico(pIcon(it))}</span><div><b>${esc(it.name)}</b><small>${it.sku} · ${esc(co(it.company).short)}</small></div></div></td>
          <td class="so-mono"><b>${r.no}</b></td><td class="so-nw">${esc(loc(r.loc).name)}</td><td class="so-nw">${dfmt(r.exp)}</td>
          <td><span class="so-days ${dayTone(d)}">${d < 0 ? Math.abs(d) + ' days overdue' : d === 0 ? 'Expires today' : d + ' days'}</span><span class="so-dbar ${dayTone(d)}"><i style="width:${Math.max(4, Math.min(100, (d / 365) * 100))}%"></i></span></td>
          <td class="num">${fmt(r.qty)}</td><td class="num">${fmt(val(r), 2)}</td>
          <td><span class="badge ${DISP_T[r.disp]} dot">${r.disp}</span></td>
          <td class="so-c"><button class="so-rowmenu" data-menu="${r.id}" aria-label="Batch actions">${ico('ellipsis-vertical')}</button></td></tr>`;
      }).join('') || `<tr><td colspan="10"><div class="so-empty">${ico('circle-check')}<b>No batches in this window</b><span>Nothing to act on here.</span></div></td></tr>`;
      $('.so-bx-n', root).textContent = rs.length + ' batches';
      $('.so-bx-tq', root).textContent = fmt(sum(rs, (r) => r.qty));
      $('.so-bx-tv', root).textContent = fmt(sum(rs, val), 2);
      FS.icons($('.so-bx-tbl', root));
    }
    function timeline() {
      const months = [{ k: 'x', l: 'Expired', v: sum(live().filter((r) => r.days < 0), val), t: 'tx' }];
      for (let m = 0; m < 12; m++) {
        const y = 2026 + Math.floor((9 + m) / 12), mo = (9 + m) % 12;
        const key = y + '-' + String(mo + 1).padStart(2, '0');
        const rs = live().filter((r) => r.days >= 0 && r.exp.slice(0, 7) === key);
        const mid = daysTo(key + '-15');
        months.push({ k: key, l: MON[mo] + (mo === 0 ? " '" + String(y).slice(2) : ''), v: sum(rs, val), n: rs.length, t: dayTone(mid) });
      }
      const mx = Math.max(...months.map((m) => m.v), 1);
      $('.so-tlbars', root).innerHTML = `<div class="so-tlb-grid">${[1, 0.5, 0].map((g) => `<span style="bottom:${g * 100}%"><em>${g ? 'Rs ' + fmt(Math.round((mx * g) / 1000)) + 'k' : '0'}</em></span>`).join('')}</div>` + months.map((m, i) => `<div class="so-tlb" data-tip="${m.l}: Rs ${fmt(m.v)}${m.n != null ? ' · ' + m.n + ' batches' : ''}" style="--i:${i}"><i class="${m.t}" style="--h:${m.v ? Math.max(3, (m.v / mx) * 100) : 0}%"></i><span>${m.l}</span></div>`).join('');
    }
    function heat() {
      const start = new Date(TODAY); start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
      const byDay = {}; live().forEach((r) => { if (r.days >= -7) (byDay[r.exp] = byDay[r.exp] || []).push(r); });
      const maxV = Math.max(...Object.values(byDay).map((a) => sum(a, val)), 1);
      let cols = '', months = '';
      for (let w = 0; w < 26; w++) {
        let cells = '';
        for (let d = 0; d < 7; d++) {
          const dt = new Date(start); dt.setDate(start.getDate() + w * 7 + d);
          const iso = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
          const list = byDay[iso] || []; const v = sum(list, val);
          const lv = !v ? 0 : v / maxV > 0.6 ? 4 : v / maxV > 0.25 ? 3 : v / maxV > 0.08 ? 2 : 1;
          const past = dt < TODAY;
          cells += `<i class="l${lv}${past ? ' past' : ''}${iso === '2026-10-01' ? ' today' : ''}" data-tip="${dfmt(iso)}${list.length ? ' · ' + list.map((r) => r.no).join(', ') + ' · Rs ' + fmt(v) : ' · nothing expiring'}"></i>`;
          if (d === 0 && dt.getDate() <= 7) months += `<span style="grid-column:${w + 1}">${MON[dt.getMonth()]}</span>`;
        }
        cols += `<div class="so-hw">${cells}</div>`;
      }
      $('.so-heat', root).innerHTML = `<div class="so-heat-m">${months}</div><div class="so-heat-wrap"><div class="so-heat-d"><span>Mon</span><span></span><span>Wed</span><span></span><span>Fri</span><span></span><span></span></div><div class="so-heat-g">${cols}</div></div><div class="so-heat-leg">Less<i class="l0"></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i>More<span class="spacer"></span><i class="today"></i>Today</div>`;
    }
    const all = (flashId) => { cards(); table(flashId); timeline(); heat(); };

    function act(r, kind) {
      const it = item(r.sku), prev = r.disp;
      if (kind === 'clear') { r.disp = 'Clearance'; all(r.id); FS.toast(`${r.no} moved to clearance · ${esc(it.name)}`, { tone: 'info', undo: () => { r.disp = prev; all(r.id); } }); }
      if (kind === 'ret') { r.disp = 'Return to principal'; all(r.id); FS.toast(`Return note drafted for ${r.no} → ${esc(co(it.company).name)}`, { tone: 'info', undo: () => { r.disp = prev; all(r.id); } }); }
      if (kind === 'sale') { r.disp = dispOf(r.days); all(r.id); FS.toast(`${r.no} back to ${r.disp.toLowerCase()}`, { tone: 'info', ms: 1800 }); }
      if (kind === 'off') {
        FS.confirm({ title: `Write off ${r.no}?`, text: `${fmt(r.qty)} × ${esc(it.name)} worth <b>Rs ${fmt(val(r), 2)}</b> will be removed from stock and expensed to Inventory write-offs.`, okLabel: 'Write off', danger: true, icon: 'trash-2' }).then((ok) => {
          if (!ok) return;
          const tr = $(`tr[data-id="${r.id}"]`, root);
          removeAnimated(tr, () => {
            r.gone = true; all();
            FS.toast(`${r.no} written off · Rs ${fmt(val(r))} expensed`, { tone: 'danger', undo: () => { r.gone = false; all(r.id); } });
          });
        });
      }
    }

    root.addEventListener('click', (e) => {
      const t = e.target;
      const c = t.closest('[data-win]'); if (c) { S.win = c.dataset.win; all(); return; }
      const m = t.closest('[data-menu]');
      if (m) {
        const r = R.find((x) => x.id === +m.dataset.menu);
        FS.menu(m, [
          { label: 'Move to clearance', icon: 'tags', onClick: () => act(r, 'clear') },
          { label: 'Return to principal', icon: 'undo-2', onClick: () => act(r, 'ret') },
          ...(r.disp === 'Clearance' || r.disp === 'Return to principal' ? [{ label: 'Restore disposition', icon: 'rotate-ccw', onClick: () => act(r, 'sale') }] : []),
          { label: 'Transfer to another location', icon: 'truck', onClick: () => FS.go('app/inventory/transfer') },
          { sep: true },
          { label: 'Write off…', icon: 'trash-2', danger: true, onClick: () => act(r, 'off') },
        ]);
        return;
      }
      if (t.closest('.so-bx-csv')) {
        const rs = rows();
        const csv = [['Product', 'SKU', 'Batch', 'Location', 'Expiry', 'Days', 'Qty', 'Value', 'Disposition']].concat(rs.map((r) => [item(r.sku).name, r.sku, r.no, loc(r.loc).name, r.exp, r.days, r.qty, val(r).toFixed(2), r.disp]))
          .map((a) => a.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n');
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'batch-register-2026-10-01.csv'; document.body.appendChild(a); a.click(); a.remove();
        FS.toast(`Exported ${rs.length} batches to CSV`, { tone: 'good' });
      }
    });
    root.addEventListener('input', (e) => { if (e.target.closest('.so-bx-q')) { S.q = e.target.value.trim().toLowerCase(); table(); } });
    root.addEventListener('change', (e) => { if (e.target.classList.contains('so-bx-loc')) { S.loc = e.target.value; table(); } });
    root.addEventListener('pointerover', (e) => { const el = e.target.closest('[data-tip]'); if (!el || !root.contains(el)) return; const r = el.getBoundingClientRect(); FS.tip(esc(el.dataset.tip), r.left + r.width / 2, r.top - 8); });
    root.addEventListener('pointerout', (e) => { if (e.target.closest('[data-tip]')) FS.untip(); });
    all();
  });

  /* =====================================================================
     5. STOCK IN VIEW  (app/inventory/stock-view) — grouped by company
     ===================================================================== */
  const CO_LINES = {
    'CO-07': ['Corrugated Carton 5-Ply 18×12×12', 'BOPP Tape 2" Clear 100 yd', 'Stretch Wrap Film 23µ × 500mm', 'Bubble Wrap Roll 1m × 100m', 'Carton 3-Ply 12×10×8', 'BOPP Tape 3" Brown', 'Packing Strap 12mm', 'Poly Bag 12×18 (100)', 'Corner Board 50mm', 'Shrink Film 19µ', 'Masking Tape 1"', 'Carton 5-Ply 24×18×18', 'Fragile Tape 2"', 'Pallet Wrap 500mm'],
    'CO-08': ['Shan Biryani Masala 60g', 'Shan Karahi Masala 50g', 'Shan Tikka Masala 50g', 'Shan Nihari Masala 60g', 'Shan Haleem Mix 300g', 'Shan Chaat Masala 100g', 'Shan Qorma Masala 50g', 'Shan Bombay Biryani 60g', 'Shan Pulao Masala 50g', 'Shan Kheer Mix 150g', 'Shan Custard 300g', 'Shan Ginger Garlic Paste 310g', 'Shan Achar Gosht 50g', 'Shan Seekh Kabab 50g', 'Shan Chana Masala 50g', 'Shan Fish Masala 50g'],
    'CO-11': ['Surf Excel 1kg', 'Surf Excel 500g', 'Sunlight Dishwash Bar', 'Vim Liquid 500ml', 'Lifebuoy Soap 110g', 'Rin Detergent 1kg', 'Comfort Fabric Conditioner 1L', 'Domex Toilet Cleaner 500ml', 'Lux Soap 150g', 'Sunsilk Shampoo 360ml'],
    'CO-10': ['Dettol Liquid 500ml', 'Dettol Liquid 1L', 'Dettol Soap Original 115g', 'Dettol Handwash 200ml', 'Harpic Toilet Cleaner 500ml', 'Lysol Floor Cleaner 1L', 'Finish Dishwasher Tabs', 'Veet Cream 50g'],
    'CO-09': ['Tapal Danedar Tea 950g', 'Tapal Danedar 475g', 'Tapal Family Mixture 900g', 'Tapal Green Tea Jasmine (30)', 'Tapal Tezdum 430g', 'Tapal Mezban 900g'],
    'CO-04': ['Industrial Nitrile Gloves (100)', 'Safety Helmet ANSI', 'Safety Goggles Clear', 'Hi-Vis Vest Orange', 'Dust Mask N95 (20)', 'Ear Plugs (200 pair)', 'Safety Shoes Size 42'],
    'CO-05': ['LED Panel Light 2×2 48W', 'LED Bulb 12W', 'LED Tube 4ft 18W', 'Flood Light 50W', 'Downlight 9W'],
    'CO-03': ['Box File Lever Arch', 'Stapler No.10', 'Stapler Pins 24/6', 'Display File 40 pockets', 'Gel Pen Blue (12)'],
    'CO-02': ['A4 Paper Ream 80gsm', 'A4 Paper Ream 70gsm', 'Legal Paper Ream 80gsm', 'A3 Paper Ream 80gsm'],
    'CO-01': ['HP LaserJet Toner 85A', 'HP Toner 12A', 'HP Toner 26A', 'HP Ink 680 Black', 'HP Ink 680 Colour'],
    'CO-06': ['Copper Wire 7/29 (90m)', 'Copper Wire 3/29 (90m)', 'Flexible Cable 40/76', 'Twin Flat 1.5mm'],
    'CO-12': ['Logitech Wireless Mouse M185', 'Logitech Keyboard K120', 'Logitech Combo MK270'],
  };
  const PACKS = ['1×12', '1×24', '1×6', '1×36', '1×144', '1×20', '1×1', '1×10'];
  const VIEW_ROWS = (() => {
    let seed = 7; const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    const out = [];
    Object.keys(CO_LINES).forEach((c) => CO_LINES[c].forEach((n, i) => {
      const base = ITEMS.find((it) => it.name === n);
      const cost = base ? base.cost : Math.round(80 + rnd() * 1800);
      const op = Math.round(rnd() * 120), inn = c === 'CO-12' ? 0 : Math.round(60 + rnd() * 460), out2 = c === 'CO-12' ? 0 : Math.round(inn * (0.25 + rnd() * 0.45));
      out.push({ co: c, name: n, code: (base ? base.sku : c.replace('CO-', 'P') + '-' + String(100 + i)), pack: base ? '1×' + base.ctn : PACKS[(i + c.length) % PACKS.length], op, inn, out: out2, cl: op + inn - out2, cost, batch: base && base.batches[0] ? base.batches[0].no : '—' });
    }));
    return out;
  })();

  mount('stock-view', (root) => {
    const S = { tab: 'in', open: new Set(['CO-08']), more: new Set(), filt: { co: '', wh: '', q: '', code: '', batch: '', all: true }, ins: 'CO-08', top: 'in', sort: 1 };
    const share = () => (S.filt.wh ? (LOC_SHARE[S.filt.wh] || 0.1) / 0.55 : 1);
    const rowsNow = () => {
      const f = S.filt, k = share();
      return VIEW_ROWS.filter((r) => (!f.co || r.co === f.co) && (!f.q || r.name.toLowerCase().includes(f.q)) && (!f.code || r.code.toLowerCase().includes(f.code)) && (!f.batch || r.batch.toLowerCase().includes(f.batch)))
        .map((r) => k === 1 ? r : { ...r, op: Math.round(r.op * k), inn: Math.round(r.inn * k), out: Math.round(r.out * k), cl: Math.round(r.op * k) + Math.round(r.inn * k) - Math.round(r.out * k) });
    };
    const groups = () => {
      const rs = rowsNow(); const m = new Map();
      rs.forEach((r) => { if (!m.has(r.co)) m.set(r.co, []); m.get(r.co).push(r); });
      return [...m.entries()].filter(([, a]) => S.filt.all || sum(a, (r) => r.inn + r.out) > 0)
        .map(([c, a]) => ({ c, rows: a.slice().sort((x, y) => x.name.localeCompare(y.name) * S.sort), t: { op: sum(a, (r) => r.op), inn: sum(a, (r) => r.inn), out: sum(a, (r) => r.out), cl: sum(a, (r) => r.cl), iv: sum(a, (r) => r.inn * r.cost), ov: sum(a, (r) => r.out * r.cost) } }))
        .sort((a, b) => b.t.inn - a.t.inn);
    };
    const field = (lab, inner) => `<label class="so-vf"><span>${lab}</span>${inner}</label>`;

    root.innerHTML = `
      <div class="so-vw">
        <div class="so-vw-top">
          ${head({ icon: 'package', crumb: 'Stock In View', title: 'Stock In View', sub: 'Opening, inward, outward and closing stock visibility',
            actions: `<button class="btn secondary so-vw-xls">${ico('file-spreadsheet')}Export Excel</button><button class="btn secondary so-vw-pdf">${ico('file-text')}Export PDF</button><button class="btn secondary so-vw-print">${ico('printer')}Print</button><button class="btn secondary so-vw-ref">${ico('refresh-cw')}Refresh</button>` })}
          <div class="so-vw-bar">
            <div class="so-vtabs"><button class="on" data-vt="in">${ico('package')}Stock In</button><button data-vt="io">${ico('arrow-left-right')}Stock In Out</button><i></i></div>
            <div class="so-vinfo">
              <div><span class="so-vinfo-i">${ico('package-open')}</span><div><small>Viewing</small><b class="so-vi-t">Stock In</b><em class="so-vi-s">Opening stock and inward movement</em></div></div>
              <div><span class="so-vinfo-i soft">${ico('calendar')}</span><div><small>Data as of</small><b>${ico('calendar-days')}01 Oct 2026</b><em class="so-vi-f">All Companies · All Suppliers</em></div></div>
            </div>
          </div>
        </div>
        <div class="panel so-vfilters">
          <div class="so-ph"><span class="so-ph-ico">${ico('filter')}</span><h3>Filters</h3><p class="so-vf-p">Refine your data to get the exact view you need</p><span class="spacer"></span><button class="btn ghost sm so-vf-tg">${ico('chevron-up')}<span>Hide Filters</span></button></div>
          <div class="so-vf-body"><div class="so-vf-in">
            <div class="so-vf-grid">
              ${field('Date From', `<input type="date" value="2026-07-01" class="so-vf-from">`)}
              ${field('Date To', `<input type="date" value="2026-10-01" class="so-vf-to">`)}
              ${field('Upto Date', `<input type="date" value="2026-07-01">`)}
              ${field('Company', `<select class="so-vf-co"><option value="">All Companies</option>${opts(COS.map((c) => ({ v: c.code, l: c.name })))}</select>`)}
              ${field('Supplier', `<select class="so-vf-sup"><option value="">All Suppliers</option>${opts(D.vendors.map((v) => v.name))}</select>`)}
              ${field('Warehouse', `<select class="so-vf-wh"><option value="">All Warehouses</option>${opts(LOCS.map((l) => ({ v: l.code, l: l.name })))}</select>`)}
              ${field('Product Name', `<div class="so-sel">${ico('search')}<input class="so-vf-q" placeholder="Search product name…"></div>`)}
              ${field('Product Code / Ref. #', `<input class="so-vf-code" placeholder="Enter code or ref. #">`)}
              ${field('Batch #', `<input class="so-vf-batch" placeholder="Enter batch #">`)}
              ${field('Pack', `<select><option>All Packs</option>${opts(PACKS)}</select>`)}
            </div>
            <div class="so-vf-foot"><label class="check so-vf-all"><input type="checkbox" checked> Show All Companies <small>(off = hide companies with no movement)</small></label><span class="spacer"></span><button class="btn secondary so-vf-clear">Clear Filters</button><button class="btn primary so-vf-apply">${ico('filter')}Apply Filters</button></div>
          </div></div>
        </div>
        <div class="so-kpis c5 so-vkpis"></div>
        <div class="so-vw-body">
          <div class="panel flush so-vtable">
            <div class="so-ph pad"><span class="so-ph-ico">${ico('package')}</span><h3>Stock Details <span class="so-muted">(Grouped by Company)</span></h3><span class="spacer"></span><span class="so-vt-count so-muted"></span>
              <select class="so-vt-pp"><option>25 per page</option><option>50 per page</option><option>100 per page</option></select>
              <div class="seg so-vt-den"><button class="active" data-den="cozy" title="Comfortable">${ico('rows-3')}</button><button data-den="compact" title="Compact">${ico('list')}</button></div>
              <button class="btn ghost sm so-vt-all">${ico('chevrons-up-down')}Expand all</button></div>
            <div class="table-wrap"><table class="tbl so-gtbl" data-plain><thead></thead></table></div>
          </div>
          <aside class="so-vrail">
            <div class="panel so-ins">
              <div class="so-ph"><span class="so-ph-ico lime">${ico('lightbulb')}</span><h3>Insights</h3></div>
              <select class="so-ins-co">${opts(COS.map((c) => ({ v: c.code, l: c.name })), S.ins)}</select>
              <div class="so-ins-body"></div>
            </div>
          </aside>
        </div>
      </div>`;

    const cols = () => S.tab === 'in'
      ? [['pack', 'Pack'], ['op', 'Op-Stock'], ['inn', 'In Qty'], ['out', 'Out Qty'], ['cl', 'Cl-Stock']]
      : [['pack', 'Pack'], ['op', 'Op-Stock'], ['inn', 'In Qty'], ['iv', 'In Value'], ['out', 'Out Qty'], ['ov', 'Out Value'], ['net', 'Net'], ['cl', 'Cl-Stock']];
    const cell = (k, r, isG) => {
      if (k === 'pack') return `<td class="so-c">${isG ? '' : r.pack}</td>`;
      if (k === 'iv') return `<td class="num">${fmt(isG ? r.iv : r.inn * r.cost)}</td>`;
      if (k === 'ov') return `<td class="num">${fmt(isG ? r.ov : r.out * r.cost)}</td>`;
      if (k === 'net') { const n = r.inn - r.out; return `<td class="num"><span class="so-net ${n >= 0 ? 'up' : 'dn'}">${n >= 0 ? '▲' : '▼'} ${fmt(Math.abs(n))}</span></td>`; }
      if (k === 'inn' && S.tab === 'io' && !isG) return `<td class="num"><span class="so-io-in">${fmt(r.inn)}</span></td>`;
      if (k === 'out' && S.tab === 'io' && !isG) return `<td class="num"><span class="so-io-out">${fmt(r.out)}</span></td>`;
      return `<td class="num${k === 'cl' ? ' so-cl' : ''}">${fmt(r[k])}</td>`;
    };
    function renderTable(anim) {
      const G = groups(), C = cols(), total = sum(G, (g) => g.rows.length);
      $('.so-gtbl thead', root).innerHTML = `<tr><th class="so-gname"><button class="so-sortbtn">Product Name ${ico(S.sort > 0 ? 'arrow-up' : 'arrow-down')}</button></th>${C.map((c) => `<th class="${c[0] === 'pack' ? 'so-c' : 'num'}">${c[1]}</th>`).join('')}</tr>`;
      $$('.so-gtbl tbody', root).forEach((t) => t.remove());
      const tbl = $('.so-gtbl', root);
      tbl.insertAdjacentHTML('beforeend', G.map((g, gi) => {
        const o = S.open.has(g.c), c = co(g.c), lim = S.more.has(g.c) ? 999 : 10;
        const kids = o ? g.rows.slice(0, lim).map((r, i) => `<tr class="so-kid${anim === g.c ? ' so-kid-in' : ''}" style="--i:${i}"><td class="so-gname">${esc(r.name)}<small>${r.code}</small></td>${C.map((cc) => cell(cc[0], r)).join('')}</tr>`).join('') + (g.rows.length > lim ? `<tr class="so-more"><td colspan="${C.length + 1}"><button data-more="${g.c}">Show ${g.rows.length - lim} more products… ${ico('chevron-down')}</button></td></tr>` : '') : '';
        return `<tbody class="so-gb${o ? ' open' : ''}" data-g="${g.c}" style="--gi:${gi}"><tr class="so-ghead" data-tg="${g.c}"><td class="so-gname"><span class="so-gchev">${ico('chevron-right')}</span><span class="so-gdot" style="background:${c.color}"></span><b>${esc(c.name.toUpperCase())}</b> <em>(${g.rows.length} products)</em></td>${C.map((cc) => cc[0] === 'pack' ? '<td></td>' : cell(cc[0], g.t, true)).join('')}</tr>${kids}</tbody>`;
      }).join('') || `<tbody><tr><td colspan="${C.length + 1}"><div class="so-empty">${ico('search-x')}<b>No products match these filters</b><span>Clear filters to see everything.</span></div></td></tr></tbody>`);
      const T = { op: sum(G, (g) => g.t.op), inn: sum(G, (g) => g.t.inn), out: sum(G, (g) => g.t.out), cl: sum(G, (g) => g.t.cl), iv: sum(G, (g) => g.t.iv), ov: sum(G, (g) => g.t.ov) };
      tbl.insertAdjacentHTML('beforeend', `<tbody class="so-gtot"><tr><td class="so-gname"><b>Grand total</b> <em>(${G.length} companies)</em></td>${C.map((cc) => cc[0] === 'pack' ? '<td></td>' : cell(cc[0], T, true)).join('')}</tr></tbody>`);
      $('.so-vt-count', root).textContent = `Showing 1–${Math.min(25, total)} of ${total} products`;
      $('.so-vt-all', root).innerHTML = `${ico('chevrons-up-down')}${G.every((g) => S.open.has(g.c)) ? 'Collapse all' : 'Expand all'}`;
      FS.icons(tbl); FS.icons($('.so-vt-all', root));
      renderKpis(G, T);
    }
    function renderKpis(G, T) {
      const n = sum(G, (g) => g.rows.length);
      const K = [['package', 'Total Products', n, '12%', 'green', [3, 4, 4, 5, 6, 6, 8]], ['clipboard-list', 'Opening Stock', T.op, '8%', 'green', [5, 4, 6, 5, 7, 6, 7]], ['arrow-up', 'In Qty', T.inn, '24%', 'green', [2, 3, 3, 5, 4, 6, 8]], ['arrow-down', 'Out Qty', T.out, '6%', 'red', [4, 3, 5, 4, 6, 5, 7]], ['boxes', 'Closing Stock', T.cl, '17%', 'green', [3, 4, 5, 5, 6, 7, 8]]];
      const box = $('.so-vkpis', root);
      if (!box.children.length) {
        box.innerHTML = K.map((k, i) => { const sp = spark(k[5]); return `<div class="so-kpi" style="--i:${i}"><span class="so-kpi-i ${k[4]}">${ico(k[0])}</span><div><small>${k[1]}</small><b class="so-kv" data-k="${i}">0</b><em class="${k[4] === 'red' ? 'down' : 'up'}">${ico('arrow-up')} ${k[3]} <span>vs previous period</span></em></div><svg class="spark so-spark ${k[4]}" viewBox="0 0 100 30" preserveAspectRatio="none"><path class="a" d="${sp.area}"/><path class="l" d="${sp.line}"/></svg></div>`; }).join('');
        FS.icons(box);
      }
      K.forEach((k, i) => FS.tick($(`.so-kv[data-k="${i}"]`, box), k[2], { dec: 0 }));
    }
    function renderIns() {
      const rs = rowsNow().filter((r) => r.co === S.ins);
      const t = { n: rs.length, op: sum(rs, (r) => r.op), inn: sum(rs, (r) => r.inn), out: sum(rs, (r) => r.out), cl: sum(rs, (r) => r.cl) };
      const inc = t.cl - t.op, pc = t.op ? Math.round((inc / t.op) * 100) : 0;
      const top = rs.slice().sort((a, b) => (S.top === 'in' ? b.inn - a.inn : b.out - a.out)).slice(0, 5);
      const mx = Math.max(1, ...top.map((r) => (S.top === 'in' ? r.inn : r.out)));
      $('.so-ins-body', root).innerHTML = `
        <h4>Company Totals</h4>
        <div class="so-ins-kv">${[['Products', t.n], ['Opening Stock', t.op], ['In Qty', t.inn], ['Out Qty', t.out], ['Closing Stock', t.cl]].map((x) => `<div><span>${ico('chevron-right')}${x[0]}</span><b>${fmt(x[1])}</b></div>`).join('')}</div>
        <div class="so-ins-net ${inc < 0 ? 'neg' : ''}"><span>${ico(inc < 0 ? 'trending-down' : 'trending-up')}</span><div><small>Net ${inc < 0 ? 'Decrease' : 'Increase'}</small><b>${inc < 0 ? '−' : '+'}${fmt(Math.abs(inc))}</b><p>Stock ${inc < 0 ? 'decreased' : 'increased'} by ${Math.abs(pc)}% compared to opening stock.</p></div></div>
        <h4>Top Movements</h4>
        <div class="seg so-ins-tabs"><button class="${S.top === 'in' ? 'active' : ''}" data-top="in">Top Inward</button><button class="${S.top === 'out' ? 'active' : ''}" data-top="out">Top Outward</button></div>
        <ol class="so-ins-top">${top.map((r, i) => { const v = S.top === 'in' ? r.inn : r.out; return `<li style="--i:${i}"><span>${i + 1}</span><div><b title="${esc(r.name)}">${esc(r.name)}</b><i class="${S.top}"><em style="width:${(v / mx) * 100}%"></em></i></div><strong>${fmt(v)}</strong></li>`; }).join('') || '<li class="so-muted">No movement</li>'}</ol>`;
      FS.icons($('.so-ins-body', root));
    }
    function setTab(t) {
      S.tab = t;
      $$('.so-vtabs button', root).forEach((b) => b.classList.toggle('on', b.dataset.vt === t));
      $('.so-vtabs', root).classList.toggle('r', t === 'io');
      $('.so-vi-t', root).textContent = t === 'in' ? 'Stock In' : 'Stock In Out';
      $('.so-vi-s', root).textContent = t === 'in' ? 'Opening stock and inward movement' : 'Inward and outward movement, both directions';
      pulse($('.so-vinfo', root));
      renderTable();
    }
    function apply(btn) {
      const f = S.filt;
      f.co = $('.so-vf-co', root).value; f.wh = $('.so-vf-wh', root).value; f.q = $('.so-vf-q', root).value.trim().toLowerCase();
      f.code = $('.so-vf-code', root).value.trim().toLowerCase(); f.batch = $('.so-vf-batch', root).value.trim().toLowerCase(); f.all = $('.so-vf-all input', root).checked;
      if (f.co) { S.open.add(f.co); S.ins = f.co; $('.so-ins-co', root).value = f.co; }
      if (f.q || f.code || f.batch) groups().forEach((g) => S.open.add(g.c));
      $('.so-vi-f', root).textContent = `${f.co ? co(f.co).name : 'All Companies'} · ${$('.so-vf-sup', root).value || 'All Suppliers'}${f.wh ? ' · ' + loc(f.wh).name : ''}`;
      const go = () => { renderTable(); renderIns(); };
      if (btn) { busy(btn, 500, 'Applying…'); FS.skeleton($('.so-vtable .table-wrap', root), 520).then(() => { go(); FS.toast(`Filters applied · ${sum(groups(), (g) => g.rows.length)} products`, { tone: 'info', ms: 1800 }); }); } else go();
    }

    root.addEventListener('click', (e) => {
      const t = e.target;
      const vt = t.closest('[data-vt]'); if (vt) { setTab(vt.dataset.vt); return; }
      const g = t.closest('[data-tg]');
      if (g) { const c = g.dataset.tg; if (S.open.has(c)) { const body = g.closest('tbody'); body.classList.add('closing'); setTimeout(() => { S.open.delete(c); renderTable(); }, RM() ? 0 : 180); } else { S.open.add(c); renderTable(c); } S.ins = c; $('.so-ins-co', root).value = c; renderIns(); return; }
      const m = t.closest('[data-more]'); if (m) { S.more.add(m.dataset.more); renderTable(m.dataset.more); return; }
      if (t.closest('.so-sortbtn')) { S.sort *= -1; renderTable(); return; }
      if (t.closest('.so-vt-all')) { const G = groups(); if (G.every((x) => S.open.has(x.c))) S.open.clear(); else G.forEach((x) => S.open.add(x.c)); renderTable(); return; }
      const den = t.closest('[data-den]'); if (den) { $('.so-gtbl', root).classList.toggle('compact', den.dataset.den === 'compact'); return; }
      const tp = t.closest('[data-top]'); if (tp) { S.top = tp.dataset.top; renderIns(); return; }
      if (t.closest('.so-vf-tg')) { const p = $('.so-vfilters', root); p.classList.toggle('shut'); const sh = p.classList.contains('shut'); $('.so-vf-tg', root).innerHTML = `${ico(sh ? 'chevron-down' : 'chevron-up')}<span>${sh ? 'Show Filters' : 'Hide Filters'}</span>`; FS.icons($('.so-vf-tg', root)); return; }
      if (t.closest('.so-vf-apply')) { apply(t.closest('.so-vf-apply')); return; }
      if (t.closest('.so-vf-clear')) { $$('.so-vf-grid input:not([type=date]), .so-vf-grid select', root).forEach((x) => { x.value = x.tagName === 'SELECT' ? x.options[0].value : ''; }); $('.so-vf-all input', root).checked = true; apply(); FS.toast('Filters cleared', { tone: 'info', ms: 1500 }); return; }
      if (t.closest('.so-vw-ref')) { const b = t.closest('.so-vw-ref'); b.querySelector('svg').classList.add('so-spinning'); FS.skeleton($('.so-vtable .table-wrap', root), 650).then(() => { b.querySelector('svg').classList.remove('so-spinning'); renderTable(); FS.toast('Stock data refreshed · as of 01 Oct 2026, 10:42 AM', { tone: 'good', ms: 2200 }); }); return; }
      if (t.closest('.so-vw-xls')) {
        const C = cols().filter((c) => c[0] !== 'net');
        const lines = [['Company', 'Product', 'Code'].concat(C.map((c) => c[1]))];
        groups().forEach((gg) => gg.rows.forEach((r) => lines.push([co(gg.c).name, r.name, r.code].concat(C.map((c) => c[0] === 'iv' ? r.inn * r.cost : c[0] === 'ov' ? r.out * r.cost : r[c[0]])))));
        const csv = lines.map((a) => a.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n');
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `stock-${S.tab === 'in' ? 'in' : 'in-out'}-view-2026-10-01.csv`; document.body.appendChild(a); a.click(); a.remove();
        FS.toast(`Exported ${lines.length - 1} rows for Excel`, { tone: 'good' }); return;
      }
      if (t.closest('.so-vw-pdf')) { busy(t.closest('.so-vw-pdf'), 900, 'Rendering…').then(() => FS.toast('PDF ready · Stock In View (A4 landscape)', { tone: 'good' })); return; }
      if (t.closest('.so-vw-print')) { FS.toast('Preparing print layout…', { tone: 'info', ms: 1800 }); }
    });
    root.addEventListener('change', (e) => { if (e.target.classList.contains('so-ins-co')) { S.ins = e.target.value; renderIns(); } });
    root.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.closest('.so-vf-grid')) { e.preventDefault(); apply($('.so-vf-apply', root)); } });

    renderTable(); renderIns();
  });

  /* =====================================================================
     6. STOCK MOVEMENTS  (app/inventory/movements) — ledger
     ===================================================================== */
  const MTYPES = {
    Purchase: { dir: 'in', tag: 'in', pre: 'GRN', icon: 'truck' },
    'Sales Return': { dir: 'in', tag: 'in', pre: 'SR', icon: 'rotate-ccw' },
    Sale: { dir: 'out', tag: 'out', pre: 'DN', icon: 'shopping-cart' },
    'Purchase Return': { dir: 'out', tag: 'out', pre: 'PR', icon: 'undo-2' },
    Issue: { dir: 'out', tag: 'out', pre: 'MO', icon: 'package-minus' },
    Transfer: { dir: 'move', tag: 'move', pre: 'TR', icon: 'arrow-left-right' },
    Adjustment: { dir: 'adj', tag: 'adj', pre: 'ADJ', icon: 'sliders-horizontal' },
    Count: { dir: 'adj', tag: 'adj', pre: 'SC', icon: 'clipboard-check' },
  };
  const MOVES = (() => {
    let seed = 42; const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    const pattern = ['Sale', 'Purchase', 'Sale', 'Transfer', 'Sale', 'Issue', 'Purchase', 'Sale', 'Adjustment', 'Sales Return', 'Sale', 'Transfer', 'Purchase', 'Sale', 'Purchase Return', 'Count', 'Sale', 'Transfer', 'Purchase', 'Sale'];
    const users = ['Kashif Ali', 'Hira Ali', 'Bilal Khan', 'Usman Ali', 'Zainab Raza', 'Ali Haider'];
    const custs = D.customers.map((c) => c.name);
    const seqs = {};
    const out = [];
    for (let i = 0; i < 40; i++) {
      const type = pattern[i % pattern.length], T = MTYPES[type], it = ITEMS[Math.floor(rnd() * ITEMS.length)];
      const l1 = LOCS[Math.floor(rnd() * LOCS.length)], l2 = LOCS.filter((x) => x.code !== l1.code)[Math.floor(rnd() * 4)];
      const day = 30 - Math.floor(i * 0.72), d = '2026-' + (day < 1 ? '10-01' : '09-' + String(day).padStart(2, '0'));
      const base = Math.max(1, Math.round((it.ctn || 1) * (1 + rnd() * 6)));
      let qty = type === 'Adjustment' || type === 'Count' ? (rnd() < 0.6 ? -1 : 1) * Math.max(1, Math.round(base / 6)) : base;
      if (T.dir === 'out') qty = -qty;
      seqs[T.pre] = (seqs[T.pre] || 300) + 1 + Math.floor(rnd() * 3);
      const vend = (D.vendors.find((v) => v.name === it.brand) || {}).name || co(it.company).name;
      out.push({
        id: i, date: d, time: String(8 + Math.floor(rnd() * 10)).padStart(2, '0') + ':' + String(Math.floor(rnd() * 60)).padStart(2, '0'),
        ref: T.pre + '-2026-' + String(seqs[T.pre]).padStart(6, '0'), type, dir: T.dir, sku: it.sku,
        from: T.dir === 'in' ? (type === 'Purchase' ? vend : custs[i % custs.length]) : l1.name,
        to: T.dir === 'out' ? (type === 'Sale' ? custs[(i * 3) % custs.length] : type === 'Purchase Return' ? vend : 'Consumption') : T.dir === 'move' ? l2.name : T.dir === 'adj' ? '' : l1.name,
        loc: l1.code, loc2: T.dir === 'move' ? l2.code : '', qty, value: Math.abs(qty) * it.cost, user: users[i % users.length],
      });
    }
    return out.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  })();

  mount('movements', (root) => {
    const S = { dir: 'all', q: '', type: '', sku: '', loc: '', from: '2026-09-01', to: '2026-10-01' };
    const tagL = { in: 'Stock In', out: 'Stock Out', move: 'Transfer', adj: 'Adjustment' };
    root.innerHTML = `
      <div class="so-mv">
        ${head({ icon: 'arrow-left-right', crumb: 'Stock Movements', title: 'Stock Movements', sub: 'Every unit in and out: receipts, sales, transfers and adjustments in one ledger.',
          actions: `<button class="btn ghost so-mv-print">${ico('printer')}Print</button><button class="btn secondary so-mv-csv">${ico('download')}Export CSV</button><a class="btn primary" href="#/app/inventory/stock-in-out">${ico('plus')}Manual entry</a>` })}
        <div class="so-kpis c5 so-mv-k"></div>
        <div class="so-mv-filters">
          <label class="so-search so-mv-q">${ico('search')}<input placeholder="Search ref, product, party or user…"></label>
          <div class="so-dirs">${[['all', 'All'], ['in', 'In'], ['out', 'Out'], ['move', 'Transfer'], ['adj', 'Adjustment']].map((d) => `<button class="${d[0] === 'all' ? 'on' : ''}" data-dir="${d[0]}">${d[1]}</button>`).join('')}<i></i></div>
          <div class="so-sel sm">${ico('tag')}<select class="so-mv-type"><option value="">All types</option>${opts(Object.keys(MTYPES))}</select></div>
          <div class="so-sel sm">${ico('package')}<select class="so-mv-sku"><option value="">All products</option>${opts(ITEMS.map((i) => ({ v: i.sku, l: i.name })))}</select></div>
          <div class="so-sel sm">${ico('warehouse')}<select class="so-mv-loc"><option value="">All locations</option>${opts(LOCS.map((l) => ({ v: l.code, l: l.name })))}</select></div>
          <div class="so-range">${ico('calendar')}<input type="date" class="so-mv-from" value="${S.from}"><i>→</i><input type="date" class="so-mv-to" value="${S.to}"></div>
          <button class="btn ghost sm so-mv-reset">${ico('rotate-ccw')}Reset</button>
        </div>
        <div class="so-mv-body">
          <div class="panel flush">
            <div class="so-ph pad"><span class="so-ph-ico">${ico('book-open')}</span><h3>Movement ledger</h3><span class="spacer"></span><span class="so-muted so-mv-n"></span></div>
            <div class="table-wrap"><table class="tbl so-mv-tbl" data-plain><thead><tr><th>Date</th><th>Reference</th><th>Type</th><th>Product</th><th>Route</th><th class="num">Qty</th><th class="num">Value (Rs)</th></tr></thead><tbody></tbody>
              <tfoot><tr class="total"><td colspan="5">Totals <span class="so-muted so-mv-tn"></span></td><td class="num so-mv-tq"></td><td class="num so-mv-tv"></td></tr></tfoot></table></div>
          </div>
          <aside class="so-mv-side">
            <div class="panel"><div class="so-ph"><span class="so-ph-ico">${ico('chart-bar')}</span><h3>Movement mix</h3></div><div class="so-mix"></div></div>
            <div class="panel"><div class="so-ph"><span class="so-ph-ico">${ico('map-pin')}</span><h3>Locations touched</h3></div><div class="so-locs"></div></div>
          </aside>
        </div>
      </div>`;

    const rows = () => MOVES.filter((m) => (S.dir === 'all' || m.dir === S.dir) && (!S.type || m.type === S.type) && (!S.sku || m.sku === S.sku) && (!S.loc || m.loc === S.loc || m.loc2 === S.loc) && m.date >= S.from && m.date <= S.to
      && (!S.q || [m.ref, m.type, item(m.sku).name, m.sku, m.from, m.to, m.user].join(' ').toLowerCase().includes(S.q)));
    function render() {
      const rs = rows();
      const qin = sum(rs.filter((m) => m.qty > 0 && m.dir !== 'move'), (m) => m.qty), qout = -sum(rs.filter((m) => m.qty < 0), (m) => m.qty), tr = sum(rs.filter((m) => m.dir === 'move'), (m) => m.qty);
      const K = [['list', 'Movements', rs.length, 'neutral', `${new Set(rs.map((m) => m.sku)).size} products`], ['arrow-down-to-line', 'Quantity in', qin, 'green', 'receipts & returns'], ['arrow-up-from-line', 'Quantity out', qout, 'red', 'sales & issues'], ['scale', 'Net change', qin - qout, qin - qout >= 0 ? 'blue' : 'red', 'in minus out'], ['arrow-left-right', 'Transferred', tr, 'warn', 'between locations']];
      const kb = $('.so-mv-k', root);
      if (!kb.children.length) { kb.innerHTML = K.map((k, i) => `<div class="so-kpi" style="--i:${i}"><span class="so-kpi-i ${k[3]}">${ico(k[0])}</span><div><small>${k[1]}</small><b class="so-mk" data-k="${i}">0</b><em>${k[4]}</em></div></div>`).join(''); FS.icons(kb); }
      K.forEach((k, i) => { const el = $(`.so-mk[data-k="${i}"]`, kb); FS.tick(el, k[2], { dec: 0, prefix: i === 3 && k[2] > 0 ? '+' : '' }); el.className = 'so-mk' + (i === 3 ? (k[2] >= 0 ? ' pos' : ' neg') : ''); });
      $('.so-mv-n', root).textContent = `${rs.length} of ${MOVES.length} movements`;
      $('.so-mv-tbl tbody', root).innerHTML = rs.map((m, i) => {
        const it = item(m.sku), T = MTYPES[m.type];
        const route = m.dir === 'adj' ? `<span>${esc(m.from)}</span><i>${m.qty > 0 ? 'gain' : 'loss'}</i>` : `<span title="${esc(m.from)}">${esc(m.from)}</span>${ico('arrow-right')}<span title="${esc(m.to)}">${esc(m.to)}</span>`;
        return `<tr style="--i:${Math.min(i, 14)}" class="so-in"><td class="so-nw">${dfmt(m.date).slice(0, 6)}<small>${m.time}</small></td><td><b class="so-mv-ref">${m.ref}</b><small>by ${esc(m.user)}</small></td>
          <td><span class="so-mtag ${T.tag}">${ico(T.icon)}${m.type}</span></td>
          <td><b>${esc(it.name)}</b><small>${it.sku}</small></td>
          <td class="so-mroute">${route}</td>
          <td class="num ${m.dir === 'move' ? 'mv' : m.qty > 0 ? 'pos' : 'neg'}">${m.dir === 'move' ? '⇄ ' + fmt(m.qty) : (m.qty > 0 ? '+' : '−') + fmt(Math.abs(m.qty))}</td>
          <td class="num">${fmt(m.value, 2)}</td></tr>`;
      }).join('') || `<tr><td colspan="7"><div class="so-empty">${ico('search-x')}<b>No movements match</b><span>Try widening the date range or resetting filters.</span></div></td></tr>`;
      FS.icons($('.so-mv-tbl tbody', root));
      const nq = sum(rs.filter((m) => m.dir !== 'move'), (m) => m.qty);
      $('.so-mv-tn', root).textContent = `· ${rs.length} rows`;
      $('.so-mv-tq', root).textContent = (nq > 0 ? '+' : nq < 0 ? '−' : '') + fmt(Math.abs(nq));
      $('.so-mv-tv', root).textContent = fmt(sum(rs, (m) => m.value), 2);
      const types = Object.keys(MTYPES).map((t) => ({ t, n: rs.filter((m) => m.type === t).length, q: sum(rs.filter((m) => m.type === t), (m) => Math.abs(m.qty)) })).filter((x) => x.n);
      const mx = Math.max(1, ...types.map((x) => x.q));
      $('.so-mix', root).innerHTML = types.sort((a, b) => b.q - a.q).map((x, i) => `<div class="so-bar" style="--i:${i}"><p><span>${ico(MTYPES[x.t].icon)}${x.t} <em>${x.n}</em></span><b>${fmt(x.q)}</b></p><i><em class="${MTYPES[x.t].tag}" style="width:${(x.q / mx) * 100}%"></em></i></div>`).join('') || '<p class="so-muted">No data</p>';
      const lc = {}; rs.forEach((m) => { [m.loc, m.loc2].filter(Boolean).forEach((c) => { lc[c] = (lc[c] || 0) + 1; }); });
      $('.so-locs', root).innerHTML = Object.entries(lc).sort((a, b) => b[1] - a[1]).map(([c, n]) => `<button class="so-locrow${S.loc === c ? ' on' : ''}" data-l="${c}"><span>${ico(loc(c).type === 'Shop' ? 'store' : 'warehouse')}</span><b>${esc(loc(c).name)}</b><small>${n} moves</small></button>`).join('') || '<p class="so-muted">No locations</p>';
      FS.icons($('.so-mv-side', root));
    }
    root.addEventListener('click', (e) => {
      const t = e.target;
      const d = t.closest('[data-dir]'); if (d) { S.dir = d.dataset.dir; $$('.so-dirs button', root).forEach((b) => b.classList.toggle('on', b === d)); render(); return; }
      const l = t.closest('[data-l]'); if (l) { S.loc = S.loc === l.dataset.l ? '' : l.dataset.l; $('.so-mv-loc', root).value = S.loc; render(); return; }
      if (t.closest('.so-mv-reset')) { Object.assign(S, { dir: 'all', q: '', type: '', sku: '', loc: '', from: '2026-09-01', to: '2026-10-01' }); $('.so-mv-q input', root).value = ''; ['type', 'sku', 'loc'].forEach((k) => { $('.so-mv-' + k, root).value = ''; }); $('.so-mv-from', root).value = S.from; $('.so-mv-to', root).value = S.to; $$('.so-dirs button', root).forEach((b) => b.classList.toggle('on', b.dataset.dir === 'all')); render(); FS.toast('Filters reset', { tone: 'info', ms: 1500 }); return; }
      if (t.closest('.so-mv-csv')) {
        const rs = rows();
        const csv = [['Date', 'Time', 'Reference', 'Type', 'SKU', 'Product', 'From', 'To', 'Qty', 'Value', 'User']].concat(rs.map((m) => [m.date, m.time, m.ref, m.type, m.sku, item(m.sku).name, m.from, m.to, m.qty, m.value.toFixed(2), m.user]))
          .map((a) => a.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\r\n');
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })); a.download = `stock-movements-${S.from}-to-${S.to}.csv`;
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        FS.toast(`Downloaded ${rs.length} movements as CSV`, { tone: 'good' }); return;
      }
      if (t.closest('.so-mv-print')) FS.toast('Preparing printable ledger…', { tone: 'info', ms: 1800 });
    });
    root.addEventListener('input', (e) => { if (e.target.closest('.so-mv-q')) { S.q = e.target.value.trim().toLowerCase(); render(); } });
    root.addEventListener('change', (e) => {
      const c = e.target.classList;
      if (c.contains('so-mv-type')) S.type = e.target.value; if (c.contains('so-mv-sku')) S.sku = e.target.value; if (c.contains('so-mv-loc')) S.loc = e.target.value;
      if (c.contains('so-mv-from')) S.from = e.target.value || '2026-01-01'; if (c.contains('so-mv-to')) S.to = e.target.value || '2026-12-31';
      render();
    });
    render();
  });

  /* =====================================================================
     7. DEMAND & REORDER  (app/inventory/demand)
     ===================================================================== */
  const ADS = { 'PK-1001': 95, 'PK-1003': 60, 'PK-1004': 9, 'PK-1005': 2, 'OF-2001': 2.5, 'OF-2002': 40, 'OF-2003': 12, 'IN-3001': 14, 'IN-3002': 5, 'EL-4001': 4, 'EL-4002': 2, 'FD-5001': 320, 'FD-5002': 30, 'FD-5003': 42, 'FD-5004': 9, 'IT-6001': 2 };
  const LEAD = 14;
  const REORDER = ITEMS.map((it) => {
    const ads = ADS[it.sku] || 1, cover = it.stock / ads;
    const need = Math.max(it.high - it.stock, Math.ceil(ads * (LEAD + 14) - it.stock));
    const ctn = Math.max(1, Math.ceil(need / it.ctn));
    return { sku: it.sku, ads, cover, ctn, sup: co(it.company).name, code: it.company, flag: it.stock <= it.low || cover < 21 };
  }).filter((r) => r.flag);

  mount('demand', (root) => {
    const blank = () => ({ sku: '', co: '', ctn: '', rate: 0, qty: 0, bonus: 0, pct: 0 });
    const S = { tab: 'dem', dno: 12, sup: '', date: '2026-10-01', lines: Array.from({ length: 8 }, blank), focus: 0, saved: false, notes: '', sel: new Set(REORDER.map((r) => r.sku)), raised: {}, po: 214 };
    const KEYS = [['F1', 'new', 'plus', 'New'], ['F2', 'clear', 'trash-2', 'Clear'], ['F3', 'save', 'save', 'Save'], ['F4', 'dprint', 'file-text', 'Detail Print'], ['F5', 'print', 'printer', 'Print'], ['F6', 'thermal', 'receipt', 'Therm Print'], ['Esc', 'exit', 'log-out', 'Exit']];
    root.innerHTML = `
      <div class="so-dm">
        <div class="so-dm-head">
          ${head({ icon: 'boxes', crumb: 'Demand & Reorder', title: 'Demand of Goods', sub: 'Create and manage product demand for suppliers',
            actions: `<span class="tagline so-tagline">Stock today · business tomorrow</span><div class="so-dtabs"><button class="on" data-dt="dem">${ico('shopping-cart')}Demand of Goods</button><button data-dt="ro">${ico('sparkles')}Reorder Suggestions<em>${REORDER.length}</em></button><i></i></div>` })}
        </div>
        <div class="so-dm-pane" data-dp="dem">
          <div class="so-dstrip">
            <label class="so-dsf"><span class="so-dsf-i">${ico('user')}</span><span><small>Supplier Name <em>*</em></small><select class="so-d-sup"><option value="">Select Supplier</option>${opts(COS.map((c) => c.name))}</select></span></label>
            <label class="so-dsf sm"><span class="so-dsf-i">${ico('hash')}</span><span><small>DNO <em>*</em></small><input class="so-d-dno" value="${S.dno}" readonly></span></label>
            <label class="so-dsf sm"><span class="so-dsf-i">${ico('calendar')}</span><span><small>Date <em>*</em></small><input type="date" class="so-d-date" value="${S.date}"></span></label>
            <label class="so-dsf"><span class="so-dsf-i">${ico('package')}</span><span><small>Available Stock</small><output class="so-d-av">—</output></span></label>
            <label class="so-dsf"><span class="so-dsf-i">${ico('user-check')}</span><span><small>Prepared By</small><input value="${ME}" readonly></span></label>
          </div>
          <div class="panel so-dgrid-p">
            <div class="so-dg-head">
              <span class="so-ph-ico lg">${ico('shopping-cart')}</span><div><h2>Products / Demand of Goods</h2><p>Add products and specify the required quantities and rates · <span class="so-kbd">Enter</span> next cell · <span class="so-kbd">↑</span><span class="so-kbd">↓</span> move rows</p></div>
              <div class="so-dg-tools"><button class="btn primary so-d-add">${ico('plus')}Add Row</button><button class="btn secondary so-d-dup">${ico('copy')}Duplicate Row</button><button class="btn secondary so-d-imp">${ico('download')}Import Lines</button><button class="btn secondary so-d-clr">${ico('trash-2')}Clear Lines</button></div>
            </div>
            <div class="table-wrap"><table class="tbl so-dg" data-plain><thead><tr><th>#</th><th>Product Name <em>*</em></th><th>Company</th><th class="num">CTN</th><th class="num">Rate</th><th class="num">Qty</th><th class="num">Bonus</th><th class="num">% Disc.</th><th class="num">Discount</th><th class="num">Amount</th><th class="so-c">Actions</th></tr></thead><tbody></tbody></table></div>
            ${datalist('so-dm-dl')}
            <div class="so-dtot">
              <div><span>${ico('package')}</span><div><small>Total Items</small><b><span class="so-t-items">0</span> <em>products</em></b></div></div>
              <div><span>${ico('chart-column')}</span><div><small>Total Quantity</small><b class="so-t-qty">0</b></div></div>
              <div><span>${ico('gift')}</span><div><small>Total Bonus</small><b class="so-t-bonus">0</b></div></div>
              <div><span>${ico('calculator')}</span><div><small>Grand Amount</small><b class="so-t-amt">Rs 0.00</b></div></div>
            </div>
            <div class="so-dnotes"><span>${ico('notebook-pen')}Notes</span><div><textarea class="so-d-notes" rows="2" maxlength="500" placeholder="Add notes or remarks here…"></textarea><small class="so-d-cnt">0/500</small></div></div>
          </div>
          <div class="so-fbar">${KEYS.map((k, i) => `<button class="${k[1] === 'exit' ? 'exit' : ''}${i === 2 ? ' gap' : ''}" data-key="${k[1]}">${ico(k[2])}<span>${k[3]}</span><kbd class="so-kbd">${k[0]}</kbd></button>`).join('')}</div>
        </div>
        <div class="so-dm-pane" data-dp="ro" hidden></div>
      </div>`;

    const tb = $('.so-dg tbody', root);
    const it0 = (l) => (l.sku ? item(l.sku) : null);
    const disc = (l) => (l.rate * l.qty * l.pct) / 100;
    const amt = (l) => l.rate * l.qty - disc(l);
    const n2 = (v) => (v ? fmt(v, 2) : '0.00');
    const rowH = (l, i) => { const it = it0(l); return `<tr data-i="${i}" class="${S.focus === i ? 'focus' : ''}${l.sku ? ' filled' : ''}">
        <td class="so-idx">${i + 1}</td>
        <td><div class="so-dprod">${ico('search')}<input data-f="prod" list="so-dm-dl" placeholder="Search product…" value="${it ? esc(it.name) : ''}" autocomplete="off"></div></td>
        <td><select data-f="co"><option value="">Select…</option>${opts(COS.map((c) => ({ v: c.code, l: c.short + ' · ' + c.name })), l.co)}</select></td>
        <td class="num"><input data-f="ctn" type="number" min="0" step="1" value="${l.ctn}" class="n"></td>
        <td class="num"><input data-f="rate" type="number" min="0" step="0.01" value="${l.rate ? l.rate.toFixed(2) : ''}" placeholder="0.00" class="n w"></td>
        <td class="num"><input data-f="qty" type="number" min="0" value="${l.qty || ''}" placeholder="0" class="n"></td>
        <td class="num"><input data-f="bonus" type="number" min="0" value="${l.bonus || ''}" placeholder="0" class="n"></td>
        <td class="num"><input data-f="pct" type="number" min="0" max="100" step="0.5" value="${l.pct || ''}" placeholder="0.00" class="n"></td>
        <td class="num"><output class="so-ro">${n2(disc(l))}</output></td>
        <td class="num"><output class="so-ro amt">${n2(amt(l))}</output></td>
        <td class="so-c so-nw"><button class="so-ra dup" data-ra="dup" title="Duplicate">${ico('copy')}</button><button class="so-ra del" data-ra="del" title="Delete">${ico('trash-2')}</button></td></tr>`; };
    function renderGrid(flash) {
      tb.innerHTML = S.lines.map(rowH).join('');
      FS.icons(tb);
      if (flash != null) flashRow(tb.querySelector(`tr[data-i="${flash}"]`));
      totals();
    }
    function totals() {
      const f = S.lines.filter((l) => l.sku);
      FS.tick($('.so-t-items', root), f.length, { dec: 0 });
      FS.tick($('.so-t-qty', root), sum(f, (l) => +l.qty || 0), { dec: 0 });
      FS.tick($('.so-t-bonus', root), sum(f, (l) => +l.bonus || 0), { dec: 0 });
      FS.tick($('.so-t-amt', root), sum(f, amt), { dec: 2, prefix: 'Rs ' });
    }
    function refreshRow(i) {
      const tr = tb.querySelector(`tr[data-i="${i}"]`), l = S.lines[i];
      $('.so-ro', tr).textContent = n2(disc(l)); $('.so-ro.amt', tr).textContent = n2(amt(l));
      tr.classList.toggle('filled', !!l.sku);
      totals();
    }
    function showAvail(i) {
      const l = S.lines[i], it = it0(l), o = $('.so-d-av', root);
      o.innerHTML = it ? `<b>${fmt(it.stock)}</b> ${it.loose} <em>· ${fmt(Math.floor(it.stock / it.ctn))} CTN${it.stock <= it.low ? ' · <span class="so-bad">below reorder</span>' : ''}</em>` : '—';
      pulse(o.closest('.so-dsf'));
    }
    function setFocus(i) { if (S.focus === i) return; S.focus = i; $$('tr', tb).forEach((tr) => tr.classList.toggle('focus', +tr.dataset.i === i)); showAvail(i); }
    function pickProduct(i, v, loose) {
      const it = findItem(v.includes(' · ') ? v.split(' · ').pop() : v); const l = S.lines[i];
      if (!it || (!loose && it.name !== v && !v.includes(' · ') && it.sku.toLowerCase() !== v.toLowerCase() && it.upc !== v)) return false;
      Object.assign(l, { sku: it.sku, co: it.company, rate: it.cost, ctn: 1, qty: it.ctn });
      if (!S.sup) { S.sup = co(it.company).name; $('.so-d-sup', root).value = S.sup; pulse($('.so-d-sup', root).closest('.so-dsf')); }
      const tr = tb.querySelector(`tr[data-i="${i}"]`); tr.outerHTML = rowH(l, i);
      const ntr = tb.querySelector(`tr[data-i="${i}"]`); FS.icons(ntr); flashRow(ntr); showAvail(i); totals();
      const q = $('[data-f="qty"]', ntr); q.focus(); q.select();
      return true;
    }
    const cells = () => $$('input:not([readonly]), select', tb);
    function move(el, dir) {
      if (dir === 'next') { const all = cells(); const k = all.indexOf(el); if (k === all.length - 1) { S.lines.push(blank()); renderGrid(S.lines.length - 1); $('tr:last-child [data-f="prod"]', tb).focus(); return; } all[k + 1].focus(); if (all[k + 1].select) all[k + 1].select(); return; }
      const tr = el.closest('tr'); const f = el.dataset.f; const tgt = dir === 'up' ? tr.previousElementSibling : tr.nextElementSibling;
      if (tgt) { const x = $(`[data-f="${f}"]`, tgt); x.focus(); if (x.select) x.select(); }
    }

    /* ---------- F-key actions */
    const dirty = () => S.lines.some((l) => l.sku) && !S.saved;
    const flashKey = (k) => { const b = $(`[data-key="${k}"]`, root); if (b) pulse(b, 'so-kp'); };
    const paper = (detail) => {
      const f = S.lines.filter((l) => l.sku);
      return `<div class="so-dpaper"><div class="so-slip-brand"><span>${ico('leaf')}</span><b>AL-NOOR ENTERPRISES (PVT) LTD</b><small>Demand of Goods · DNO ${S.dno} · ${dfmt(S.date)}</small></div>
        <div class="so-dp-meta"><span>Supplier: <b>${esc(S.sup || '—')}</b></span><span>Prepared by: <b>${ME}</b></span></div>
        <table class="tbl" data-plain><thead><tr><th>#</th><th>Product</th>${detail ? '<th>Company</th><th class="num">CTN</th>' : ''}<th class="num">Qty</th>${detail ? '<th class="num">Bonus</th>' : ''}<th class="num">Rate</th>${detail ? '<th class="num">Disc.</th>' : ''}<th class="num">Amount</th></tr></thead><tbody>
        ${f.map((l, i) => { const it = item(l.sku); return `<tr><td>${i + 1}</td><td><b>${esc(it.name)}</b><small>${it.sku}</small></td>${detail ? `<td>${esc(co(l.co).short)}</td><td class="num">${l.ctn || 0}</td>` : ''}<td class="num">${fmt(l.qty)}</td>${detail ? `<td class="num">${fmt(l.bonus || 0)}</td>` : ''}<td class="num">${fmt(l.rate, 2)}</td>${detail ? `<td class="num">${fmt(disc(l), 2)}</td>` : ''}<td class="num">${fmt(amt(l), 2)}</td></tr>`; }).join('') || `<tr><td colspan="9" class="so-muted">No lines</td></tr>`}
        </tbody><tfoot><tr class="total"><td colspan="${detail ? 8 : 4}">Grand amount</td><td class="num">${fmt(sum(f, amt), 2)}</td></tr></tfoot></table>
        ${S.notes ? `<p class="so-dp-note"><b>Notes:</b> ${esc(S.notes)}</p>` : ''}<div class="so-sp-sign"><span>Prepared by<br><b>${ME}</b></span><span>Checked by<br><b>&nbsp;</b></span><span>Approved by<br><b>&nbsp;</b></span></div></div>`;
    };
    const ACT = {
      async new() {
        if (dirty() && !(await FS.confirm({ title: 'Start a new demand?', text: 'The current lines are not saved and will be discarded.', okLabel: 'Discard & new', danger: true }))) return;
        S.dno++; S.lines = Array.from({ length: 8 }, blank); S.sup = ''; S.saved = false; S.notes = ''; S.focus = 0;
        $('.so-d-dno', root).value = S.dno; $('.so-d-sup', root).value = ''; $('.so-d-notes', root).value = ''; $('.so-d-cnt', root).textContent = '0/500';
        pulse($('.so-d-dno', root).closest('.so-dsf')); renderGrid(); showAvail(0); $('[data-f="prod"]', tb).focus();
        FS.toast(`New demand · DNO ${S.dno}`, { tone: 'info', ms: 1800 });
      },
      clear() {
        if (!S.lines.some((l) => l.sku)) { FS.toast('Nothing to clear', { tone: 'info', ms: 1500 }); return; }
        const prev = clone(S.lines); S.lines = Array.from({ length: 8 }, blank); renderGrid(); showAvail(0);
        FS.toast('All lines cleared', { tone: 'warn', undo: () => { S.lines = prev; renderGrid(); } });
      },
      async save() {
        const f = S.lines.filter((l) => l.sku);
        if (!S.sup) { const el = $('.so-d-sup', root).closest('.so-dsf'); pulse(el, 'so-shake'); el.classList.add('need'); $('.so-d-sup', root).focus(); FS.toast('Select a supplier before saving', { tone: 'warn' }); return; }
        if (!f.length || f.some((l) => !(l.qty > 0))) { pulse($('.so-dgrid-p', root), 'so-shake'); FS.toast(f.length ? 'Every line needs a quantity' : 'Add at least one product', { tone: 'warn' }); return; }
        const b = $('[data-key="save"]', root); await busy(b, 900, 'Saving…');
        S.saved = true; FS.celebrate(b, 'Saved');
        FS.toast(`<b>DMD-2026-${String(S.dno).padStart(5, '0')}</b> saved · ${f.length} items · Rs ${fmt(sum(f, amt), 2)}`, { tone: 'good', action: { label: 'Raise PO', fn: () => FS.go('app/purchases/orders') } });
      },
      dprint() { FS.drawer({ title: 'Detail print preview', subtitle: 'Demand of Goods · A4', wide: true, html: paper(true), foot: `<button class="btn secondary" data-close>Close</button><button class="btn primary" data-toast="Sent to printer">${ico('printer')}Print</button>` }); },
      print() { FS.drawer({ title: 'Print preview', subtitle: 'Demand of Goods · summary', html: paper(false), foot: `<button class="btn secondary" data-close>Close</button><button class="btn primary" data-toast="Sent to printer">${ico('printer')}Print</button>` }); },
      thermal() {
        const f = S.lines.filter((l) => l.sku);
        FS.sheet({ title: 'Thermal print', subtitle: '80 mm receipt preview', html: `<div class="so-thermal"><b>AL-NOOR ENTERPRISES</b><span>DEMAND OF GOODS</span><span>DNO ${S.dno} · ${dfmt(S.date)}</span><span>${esc(S.sup || 'No supplier')}</span><hr>${f.map((l) => { const it = item(l.sku); return `<div><span>${esc(it.name.slice(0, 24))}</span><span>${fmt(l.qty)} × ${fmt(l.rate, 2)}</span><b>${fmt(amt(l), 2)}</b></div>`; }).join('') || '<span>— no lines —</span>'}<hr><div class="t"><span>TOTAL</span><b>Rs ${fmt(sum(f, amt), 2)}</b></div><span>Items ${f.length} · Qty ${fmt(sum(f, (l) => l.qty))} · Bonus ${fmt(sum(f, (l) => l.bonus || 0))}</span><span>Prepared by ${ME}</span><span class="cut">✂ - - - - - - - - - - - - - - -</span></div>`, foot: `<button class="btn secondary" data-close>Close</button><button class="btn primary" data-toast="Sent to thermal printer">${ico('receipt')}Print receipt</button>` });
      },
      async exit() {
        if (dirty() && !(await FS.confirm({ title: 'Leave Demand of Goods?', text: 'You have unsaved lines on this demand.', okLabel: 'Leave without saving', danger: true }))) return;
        FS.go('app/inventory/stock');
      },
    };
    const runKey = (k) => { flashKey(k); ACT[k](); };

    /* ---------- reorder suggestions */
    function renderRO() {
      const pane = $('[data-dp="ro"]', root);
      const groups = {}; REORDER.forEach((r) => { (groups[r.sup] = groups[r.sup] || []).push(r); });
      const sel = REORDER.filter((r) => S.sel.has(r.sku) && !S.raised[r.sku]);
      const val = (r) => r.ctn * item(r.sku).ctn * item(r.sku).cost;
      pane.innerHTML = `
        <div class="so-ro-top">
          <div class="banner info">${ico('sparkles')}<div><b>${REORDER.length} products need reordering</b><p>Below the low level, or less than 3 weeks of cover at the current sales rate. Lead time assumed ${LEAD} days; suggestions top up to the high level plus two weeks of sales.</p></div></div>
        </div>
        <div class="so-ro-grid">${Object.entries(groups).map(([sup, rs], gi) => {
          const all = rs.every((r) => S.sel.has(r.sku) || S.raised[r.sku]);
          return `<div class="panel flush so-rog" style="--i:${gi}">
            <div class="so-rog-h"><label class="so-ck"><input type="checkbox" data-gsel="${esc(sup)}"${all ? ' checked' : ''}><span></span></label><span class="so-rog-av" style="--c:${co(rs[0].code).color}">${esc(co(rs[0].code).short)}</span><div><b>${esc(sup)}</b><small>${rs.length} item${rs.length > 1 ? 's' : ''} · preferred supplier</small></div><span class="spacer"></span><b class="so-rog-v">Rs ${fmt(sum(rs, val))}</b></div>
            <table class="tbl so-rot" data-plain><thead><tr><th></th><th>Product</th><th class="num">On hand</th><th class="num">Low</th><th class="num">Avg / day</th><th>Cover</th><th class="num">Suggest CTN</th><th class="num">Value</th></tr></thead><tbody>
            ${rs.map((r) => { const it = item(r.sku); const d = Math.floor(r.cover); return `<tr class="${S.raised[r.sku] ? 'raised' : ''}"><td>${S.raised[r.sku] ? `<span class="badge good">${S.raised[r.sku]}</span>` : `<label class="so-ck"><input type="checkbox" data-rsel="${r.sku}"${S.sel.has(r.sku) ? ' checked' : ''}><span></span></label>`}</td>
              <td><b>${esc(it.name)}</b><small>${it.sku}</small></td><td class="num ${it.stock <= it.low ? 'neg' : ''}">${fmt(it.stock)}</td><td class="num">${fmt(it.low)}</td><td class="num">${fmt(r.ads, r.ads % 1 ? 1 : 0)}</td>
              <td><span class="so-cover ${d < 7 ? 'r' : d < 14 ? 'w' : 'i'}"><i style="width:${Math.min(100, (r.cover / 30) * 100)}%"></i>${d} days</span></td>
              <td class="num"><input type="number" min="1" class="so-ro-ctn" data-rctn="${r.sku}" value="${r.ctn}"${S.raised[r.sku] ? ' disabled' : ''}><small>${fmt(r.ctn * it.ctn)} ${it.loose}</small></td>
              <td class="num">${fmt(val(r))}</td></tr>`; }).join('')}</tbody></table></div>`;
        }).join('')}</div>
        <div class="so-ro-foot"><div><b class="so-ro-n">${sel.length}</b> items from <b>${new Set(sel.map((r) => r.sup)).size}</b> suppliers selected · <b>Rs ${fmt(sum(sel, val))}</b></div><span class="spacer"></span><button class="btn secondary so-ro-dem">${ico('clipboard-list')}Send to demand</button><button class="btn primary so-ro-po"${sel.length ? '' : ' disabled'}>${ico('file-plus')}Create POs</button></div>`;
      FS.icons(pane);
    }
    async function createPOs(btn) {
      const sel = REORDER.filter((r) => S.sel.has(r.sku) && !S.raised[r.sku]);
      const sups = [...new Set(sel.map((r) => r.sup))];
      const sh = FS.sheet({ title: 'Creating purchase orders', subtitle: `${sups.length} supplier${sups.length > 1 ? 's' : ''} · ${sel.length} lines`, html: `<div class="so-poq">${sups.map((s, i) => `<div class="so-poq-r" data-s="${i}"><span class="so-poq-i">${ico('file-plus')}</span><div><b>${esc(s)}</b><small>${sel.filter((r) => r.sup === s).length} line${sel.filter((r) => r.sup === s).length > 1 ? 's' : ''} · waiting</small><div class="progress"><i style="width:0%"></i></div></div><em>Queued</em></div>`).join('')}</div>`, foot: `<button class="btn primary so-poq-done" disabled>${ico('loader')}Working…</button>` });
      busy(btn, 400);
      const made = [];
      for (let i = 0; i < sups.length; i++) {
        const r = $(`[data-s="${i}"]`, sh), no = 'PO-2026-' + String(S.po++).padStart(6, '0');
        r.classList.add('run'); $('em', r).textContent = 'Creating…'; { const n = sel.filter((x) => x.sup === sups[i]).length; $('small', r).textContent = `${n} line${n > 1 ? 's' : ''} · ${no}`; }
        $('.progress i', r).style.width = '100%';
        await wait(650);
        r.classList.remove('run'); r.classList.add('ok'); $('em', r).innerHTML = ico('circle-check') + 'Created'; FS.icons(r);
        sel.filter((x) => x.sup === sups[i]).forEach((x) => { S.raised[x.sku] = no; S.sel.delete(x.sku); });
        made.push(no);
      }
      const done = $('.so-poq-done', sh); done.disabled = false; done.innerHTML = ico('check') + 'Done'; FS.icons(done);
      done.onclick = () => FS.closeOverlay(sh.closest('.overlay'));
      FS.celebrate(done, `${made.length} POs`);
      renderRO();
      FS.toast(`${made.length} purchase order${made.length > 1 ? 's' : ''} created · ${made[0]}${made.length > 1 ? ' – ' + made[made.length - 1] : ''}`, { tone: 'good', ms: 7000, action: { label: 'View POs', fn: () => { FS.closeOverlays(); FS.go('app/purchases/orders'); } } });
    }

    /* ---------- events */
    root.addEventListener('click', (e) => {
      const t = e.target;
      const dt = t.closest('[data-dt]');
      if (dt) {
        S.tab = dt.dataset.dt;
        $$('.so-dtabs button', root).forEach((b) => b.classList.toggle('on', b === dt)); $('.so-dtabs', root).classList.toggle('r', S.tab === 'ro');
        $$('.so-dm-pane', root).forEach((p) => { p.hidden = p.dataset.dp !== S.tab; if (!p.hidden) { p.classList.remove('so-pane-in'); void p.offsetWidth; p.classList.add('so-pane-in'); } });
        $('.so-head h1', root).textContent = S.tab === 'dem' ? 'Demand of Goods' : 'Reorder Suggestions';
        $('.so-head p', root).textContent = S.tab === 'dem' ? 'Create and manage product demand for suppliers' : 'Items running low, grouped by preferred supplier';
        if (S.tab === 'ro') renderRO();
        return;
      }
      const k = t.closest('[data-key]'); if (k) { runKey(k.dataset.key); return; }
      const ra = t.closest('[data-ra]');
      if (ra) {
        const i = +ra.closest('tr').dataset.i;
        if (ra.dataset.ra === 'dup') { S.lines.splice(i + 1, 0, clone(S.lines[i])); renderGrid(i + 1); }
        else { const rm = S.lines[i]; removeAnimated(ra.closest('tr'), () => { S.lines.splice(i, 1); if (S.lines.length < 8) S.lines.push(blank()); renderGrid(); if (rm.sku) FS.toast('Line removed', { undo: () => { S.lines.splice(i, 0, rm); renderGrid(i); } }); }); }
        return;
      }
      if (t.closest('.so-d-add')) { S.lines.push(blank()); renderGrid(S.lines.length - 1); $('tr:last-child [data-f="prod"]', tb).focus(); return; }
      if (t.closest('.so-d-dup')) { const i = S.lines[S.focus] && S.lines[S.focus].sku ? S.focus : S.lines.map((l) => !!l.sku).lastIndexOf(true); if (i < 0) { FS.toast('Pick a filled row to duplicate', { tone: 'warn', ms: 2000 }); return; } S.lines.splice(i + 1, 0, clone(S.lines[i])); renderGrid(i + 1); return; }
      if (t.closest('.so-d-clr')) { runKey('clear'); return; }
      if (t.closest('.so-d-imp')) {
        const add = REORDER.filter((r) => !S.lines.some((l) => l.sku === r.sku) && (!S.sup || r.sup === S.sup));
        if (!add.length) { FS.toast(S.sup ? `No reorder lines for ${esc(S.sup)}` : 'Nothing to import', { tone: 'info' }); return; }
        add.forEach((r) => { const it = item(r.sku); const l = { sku: r.sku, co: it.company, ctn: r.ctn, rate: it.cost, qty: r.ctn * it.ctn, bonus: 0, pct: 0 }; const e2 = S.lines.findIndex((x) => !x.sku); if (e2 > -1) S.lines[e2] = l; else S.lines.push(l); });
        if (!S.sup) { S.sup = add[0].sup; $('.so-d-sup', root).value = S.sup; }
        FS.skeleton($('.so-dgrid-p .table-wrap', root), 450).then(() => { renderGrid(); FS.toast(`Imported ${add.length} lines from reorder suggestions`, { tone: 'good' }); });
        return;
      }
      if (t.closest('.so-ro-po')) { createPOs(t.closest('.so-ro-po')); return; }
      if (t.closest('.so-ro-dem')) {
        const sel = REORDER.filter((r) => S.sel.has(r.sku) && !S.raised[r.sku]);
        sel.forEach((r) => { if (S.lines.some((l) => l.sku === r.sku)) return; const it = item(r.sku); const l = { sku: r.sku, co: it.company, ctn: r.ctn, rate: it.cost, qty: r.ctn * it.ctn, bonus: 0, pct: 0 }; const e2 = S.lines.findIndex((x) => !x.sku); if (e2 > -1) S.lines[e2] = l; else S.lines.push(l); });
        $('[data-dt="dem"]', root).click(); renderGrid(); FS.toast(`${sel.length} lines added to the demand`, { tone: 'good' });
      }
    });
    root.addEventListener('focusin', (e) => { const tr = e.target.closest('.so-dg tbody tr'); if (tr) setFocus(+tr.dataset.i); });
    root.addEventListener('input', (e) => {
      const t = e.target;
      if (t.classList.contains('so-d-notes')) { S.notes = t.value; $('.so-d-cnt', root).textContent = t.value.length + '/500'; return; }
      const tr = t.closest('.so-dg tbody tr');
      if (tr && t.dataset.f && t.dataset.f !== 'prod' && t.dataset.f !== 'co') {
        const i = +tr.dataset.i, l = S.lines[i], it = it0(l), v = parseFloat(t.value) || 0;
        if (t.dataset.f === 'ctn') { l.ctn = t.value; if (it) { l.qty = Math.round(v * it.ctn); $('[data-f="qty"]', tr).value = l.qty || ''; } }
        if (t.dataset.f === 'qty') { l.qty = Math.max(0, v); if (it) { l.ctn = +(l.qty / it.ctn).toFixed(2); $('[data-f="ctn"]', tr).value = l.ctn; } }
        if (t.dataset.f === 'rate') l.rate = Math.max(0, v);
        if (t.dataset.f === 'bonus') l.bonus = Math.max(0, v);
        if (t.dataset.f === 'pct') l.pct = Math.min(100, Math.max(0, v));
        S.saved = false; refreshRow(i);
      }
      if (tr && t.dataset.f === 'prod' && t.value.includes(' · ')) pickProduct(+tr.dataset.i, t.value);
      const rc = t.dataset.rctn; if (rc) { const r = REORDER.find((x) => x.sku === rc); r.ctn = Math.max(1, parseInt(t.value, 10) || 1); }
    });
    root.addEventListener('change', (e) => {
      const t = e.target;
      if (t.classList.contains('so-d-sup')) { S.sup = t.value; t.closest('.so-dsf').classList.remove('need'); }
      if (t.classList.contains('so-d-date')) S.date = t.value || S.date;
      const tr = t.closest('.so-dg tbody tr');
      if (tr && t.dataset.f === 'co') S.lines[+tr.dataset.i].co = t.value;
      if (tr && t.dataset.f === 'prod' && t.value && !t.value.includes(' · ')) { if (!pickProduct(+tr.dataset.i, t.value)) { pulse(t.parentElement, 'so-shake'); FS.toast(`No product “${esc(t.value)}”`, { tone: 'warn', ms: 2000 }); } }
      if (t.dataset.rsel) { t.checked ? S.sel.add(t.dataset.rsel) : S.sel.delete(t.dataset.rsel); renderRO(); }
      if (t.dataset.gsel) { REORDER.filter((r) => r.sup === t.dataset.gsel && !S.raised[r.sku]).forEach((r) => (t.checked ? S.sel.add(r.sku) : S.sel.delete(r.sku))); renderRO(); }
      if (t.dataset.rctn) renderRO();
    });
    root.addEventListener('keydown', (e) => {
      const t = e.target; if (!t.closest('.so-dg tbody')) return;
      if (e.key === 'Enter') { e.preventDefault(); if (t.dataset.f === 'prod' && t.value && !it0(S.lines[+t.closest('tr').dataset.i])) { if (pickProduct(+t.closest('tr').dataset.i, t.value, true)) return; } move(t, 'next'); }
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && t.tagName !== 'SELECT' && !(t.dataset.f === 'prod' && t.value)) { e.preventDefault(); move(t, e.key === 'ArrowDown' ? 'down' : 'up'); }
    });
    document.addEventListener('keydown', (e) => {
      if (!onRoute('demand') || S.tab !== 'dem' || overlayOpen() || document.querySelector('.fs-menu')) return;
      const map = { F1: 'new', F2: 'clear', F3: 'save', F4: 'dprint', F5: 'print', F6: 'thermal', Escape: 'exit' };
      const k = map[e.key]; if (!k) return;
      if (k === 'exit' && e.target.closest && e.target.closest('input, textarea, select')) { e.target.blur(); return; }
      e.preventDefault(); e.stopPropagation(); runKey(k);
    }, true);

    renderGrid(); showAvail(0);
  });
})();
