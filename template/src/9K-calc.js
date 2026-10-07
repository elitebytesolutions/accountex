/* 9K-calc.js — Finsoft business calculator (Agent E, prefix cx-)
   API: FS.calc = { mount(el, opts) -> instance, open(anchorEl?), close(), toggle(anchorEl?), words(n, {lang, system}) }
   Shared across instances: tape (per day, localStorage), memory, settings (round, grouping, GST rate). */
(function () {
  'use strict';
  if (!window.FS) return;
  const D = window.FS_DATA || { items: [], schemes: [] };
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } },
  };
  const dayKey = () => { const d = new Date(); return 'cx-tape-' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

  /* ---------------- shared state ---------------- */
  const S = {
    tape: LS.get(dayKey(), []),
    mem: +LS.get('cx-mem', 0) || 0,
    set: Object.assign({ round: 0, group: 'intl', rate: 18, lang: 'en' }, LS.get('cx-set', {})),
  };
  if (!Array.isArray(S.tape)) S.tape = [];
  const insts = new Set();
  const saveTape = () => LS.set(dayKey(), S.tape);
  const saveMem = () => LS.set('cx-mem', S.mem);
  const saveSet = () => LS.set('cx-set', S.set);
  const refreshAll = (what) => insts.forEach((i) => i.refresh(what));
  const gt = () => clean(S.tape.reduce((a, l) => a + (l.k === 'total' ? 0 : +l.r || 0), 0));
  let uid = Date.now() % 100000;

  /* ---------------- number formatting ---------------- */
  function clean(n) { return Math.round(n * 1e8) / 1e8; }
  function group(i) {
    if (S.set.group === 'intl') return i.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    if (i.length <= 3) return i;
    return i.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + i.slice(-3);
  }
  function fmt(n, dec) {
    if (!isFinite(n)) return 'Error';
    const neg = n < 0; n = Math.abs(n);
    let s = dec == null ? String(clean(n)) : n.toFixed(dec);
    if (/e/i.test(s)) s = n.toFixed(dec == null ? 8 : dec).replace(/\.?0+$/, '');
    const [i, d] = s.split('.');
    return (neg ? '−' : '') + group(i) + (d ? '.' + d : '');
  }
  function decHTML(s) { const k = s.indexOf('.'); return k < 0 ? esc(s) : esc(s.slice(0, k)) + '<span class="cx-dec">' + esc(s.slice(k)) + '</span>'; }
  const raw = (n) => { let s = String(clean(n)); if (/e/i.test(s)) s = clean(n).toFixed(8).replace(/\.?0+$/, ''); return s; };
  const parseNum = (s) => { const v = parseFloat(String(s == null ? '' : s).replace(/[^\d.\-]/g, '')); return isFinite(v) ? v : 0; };
  const money = (n) => fmt(n, 2);

  /* ---------------- expression engine ---------------- */
  // internal expression: digits, '.', unary '-', binary ops + − × ÷, postfix %
  function normalize(s) {
    s = String(s).replace(/[,\s=]/g, '').replace(/[*xX]/g, '×').replace(/\//g, '÷').replace(/[–—−]/g, '-');
    return s.replace(/([\d.%])-/g, '$1−');
  }
  function tokenize(ex) {
    const re = /(-?(?:\d+\.?\d*|\.\d+))(%?)|([+−×÷])/g; const out = []; let m, pos = 0;
    while ((m = re.exec(ex))) {
      if (m.index !== pos) return null; pos = re.lastIndex;
      if (m[3]) out.push({ op: m[3] }); else out.push({ n: parseFloat(m[1]), pct: !!m[2] });
    }
    return pos === ex.length ? out : null;
  }
  function evaluate(ex, lenient) {
    const t = tokenize(ex); if (!t || !t.length) return null;
    if (lenient) while (t.length && t[t.length - 1].op) t.pop();
    if (!t.length || t.length % 2 === 0) return null;
    for (let i = 0; i < t.length; i++) if ((i % 2 === 0) !== (t[i].n !== undefined)) return null;
    let sum = 0, first = true, sign = '+', i = 0;
    while (i < t.length) {
      const f = [t[i]], ops = []; i++;
      while (i < t.length && (t[i].op === '×' || t[i].op === '÷')) { ops.push(t[i].op); f.push(t[i + 1]); i += 2; }
      let v;
      if (f.length === 1 && f[0].pct && !first) v = sum * f[0].n / 100; // a + b%  → a + a·b/100
      else {
        v = f[0].pct ? f[0].n / 100 : f[0].n;
        for (let j = 0; j < ops.length; j++) {
          const x = f[j + 1].pct ? f[j + 1].n / 100 : f[j + 1].n;
          if (ops[j] === '×') v *= x; else { if (x === 0) return NaN; v /= x; }
        }
      }
      sum = first ? v : (sign === '+' ? sum + v : sum - v); first = false;
      if (i < t.length) { sign = t[i].op; i++; }
    }
    return sum;
  }
  function pretty(ex) {
    return String(ex).replace(/(\d+)(\.\d*)?/g, (m, a, b) => group(a) + (b || '')).replace(/([+−×÷])/g, ' $1 ').replace(/-/g, '−').replace(/\s+/g, ' ').trim();
  }

  /* ---------------- amount in words ---------------- */
  const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (n) => n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '');
  const three = (n) => { const h = Math.floor(n / 100), r = n % 100; return [h ? ONES[h] + ' Hundred' : '', r ? two(r) : ''].filter(Boolean).join(' '); };
  function enLakh(n) {
    if (!n) return '';
    const cr = Math.floor(n / 1e7), rest = n % 1e7, lk = Math.floor(rest / 1e5), th = Math.floor((rest % 1e5) / 1000), h = n % 1000;
    return [cr ? (cr >= 100 ? enLakh(cr) : two(cr)) + ' Crore' : '', lk ? two(lk) + ' Lakh' : '', th ? two(th) + ' Thousand' : '', h ? three(h) : ''].filter(Boolean).join(' ');
  }
  function enIntl(n) {
    if (!n) return '';
    const sc = [[1e12, 'Trillion'], [1e9, 'Billion'], [1e6, 'Million'], [1e3, 'Thousand']]; const out = [];
    for (const [v, w] of sc) { const q = Math.floor(n / v); if (q) { out.push(three(q % 1000) + ' ' + w); n %= v; } }
    if (n) out.push(three(n));
    return out.join(' ');
  }
  const UR = ('صفر ایک دو تین چار پانچ چھ سات آٹھ نو دس گیارہ بارہ تیرہ چودہ پندرہ سولہ سترہ اٹھارہ انیس بیس اکیس بائیس تیئس چوبیس پچیس چھبیس ستائیس اٹھائیس انتیس تیس '
    + 'اکتیس بتیس تینتیس چونتیس پینتیس چھتیس سینتیس اڑتیس انتالیس چالیس اکتالیس بیالیس تینتالیس چوالیس پینتالیس چھیالیس سینتالیس اڑتالیس انچاس پچاس '
    + 'اکاون باون ترپن چوون پچپن چھپن ستاون اٹھاون انسٹھ ساٹھ اکسٹھ باسٹھ تریسٹھ چونسٹھ پینسٹھ چھیاسٹھ سڑسٹھ اڑسٹھ انہتر ستر '
    + 'اکہتر بہتر تہتر چوہتر پچھتر چھہتر ستتر اٹھتر اناسی اسی اکاسی بیاسی تراسی چوراسی پچاسی چھیاسی ستاسی اٹھاسی نواسی نوے '
    + 'اکانوے بانوے ترانوے چورانوے پچانوے چھیانوے ستانوے اٹھانوے ننانوے').split(' ');
  function urWords(n) {
    if (!n) return '';
    const ar = Math.floor(n / 1e9), cr = Math.floor((n % 1e9) / 1e7), lk = Math.floor((n % 1e7) / 1e5), th = Math.floor((n % 1e5) / 1000), h = Math.floor((n % 1000) / 100), r = n % 100;
    return [ar ? urWords(ar) + ' ارب' : '', cr ? UR[cr] + ' کروڑ' : '', lk ? UR[lk] + ' لاکھ' : '', th ? UR[th] + ' ہزار' : '', h ? UR[h] + ' سو' : '', r ? UR[r] : ''].filter(Boolean).join(' ');
  }
  function words(n, o = {}) {
    const lang = o.lang || S.set.lang, sys = o.system || S.set.group;
    n = +n || 0; const neg = n < 0; n = Math.abs(n);
    let rs = Math.floor(n + 1e-9), ps = Math.round((n - rs) * 100); if (ps === 100) { rs++; ps = 0; }
    if (lang === 'ur') {
      const w = rs ? urWords(rs) : 'صفر';
      return (neg ? 'منفی ' : '') + w + ' روپے' + (ps ? ' اور ' + UR[ps] + ' پیسے' : '') + ' صرف';
    }
    const f = sys === 'intl' ? enIntl : enLakh;
    return 'Rupees ' + (neg ? 'Minus ' : '') + (rs ? f(rs) : 'Zero') + (ps ? ' and ' + two(ps) + ' Paisa' : '') + ' Only';
  }

  /* ---------------- clipboard / print ---------------- */
  function copyText(t, label) {
    const ok = () => FS.toast((label || 'Copied') + ' · ' + (t.length > 46 ? t.slice(0, 44) + '…' : t), { tone: 'good' });
    const fallback = () => {
      try { const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); } catch (e) { /* ignore */ }
      ok();
    };
    try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(ok, fallback); else fallback(); } catch (e) { fallback(); }
  }
  function printTape() {
    if (!S.tape.length) { FS.toast('The tape is empty', { tone: 'info' }); return; }
    const rows = S.tape.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(lineExpr(l))}</td><td style="text-align:right">${esc(fmt(l.r))}</td></tr>`).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Calculator tape</title><style>body{font:13px/1.5 'Courier New',monospace;padding:24px;color:#111}h1{font-size:15px;margin:0 0 2px}p{margin:0 0 14px;color:#555}table{border-collapse:collapse;width:100%;max-width:520px}td{padding:4px 6px;border-bottom:1px dashed #bbb}tfoot td{border-top:2px solid #111;font-weight:bold;border-bottom:0}</style></head><body><h1>${esc((D.company && D.company.name) || 'Finsoft')}</h1><p>Calculator tape · ${new Date().toLocaleString()}</p><table><tbody>${rows}</tbody><tfoot><tr><td></td><td>Grand total</td><td style="text-align:right">${esc(fmt(gt()))}</td></tr></tfoot></table></body></html>`;
    const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0'; document.body.appendChild(f);
    try { f.contentDocument.open(); f.contentDocument.write(html); f.contentDocument.close(); setTimeout(() => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { /* ignore */ } setTimeout(() => f.remove(), 1500); }, 60); } catch (e) { f.remove(); }
  }
  const lineExpr = (l) => (l.k === 'calc' ? pretty(l.e) : l.e);
  function addTape(e, r, k) {
    const now = new Date();
    S.tape.push({ id: ++uid, e, r: clean(r), k: k || 'calc', t: String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0') });
    if (S.tape.length > 200) S.tape.shift();
    saveTape(); refreshAll('tape');
  }

  /* ---------------- markup ---------------- */
  const KEYS = [
    ['mc', 'MC', 'fn mem'], ['mr', 'MR', 'fn mem'], ['m+', 'M+', 'fn mem'], ['m-', 'M−', 'fn mem'], ['gt', 'GT', 'fn mem'],
    ['c', 'AC', 'fn clr'], ['bs', '⌫', 'fn'], ['neg', '±', 'fn'], ['gst+', '+GST', 'fn gst'], ['gst-', '−GST', 'fn gst'],
    ['7', '7'], ['8', '8'], ['9', '9'], ['÷', '÷', 'op'], ['=', '=', 'eq'],
    ['4', '4'], ['5', '5'], ['6', '6'], ['×', '×', 'op'],
    ['1', '1'], ['2', '2'], ['3', '3'], ['−', '−', 'op'],
    ['0', '0'], ['.', '.'], ['%', '%', 'op'], ['+', '+', 'op'],
  ];
  const TITLES = { mc: 'Memory clear', mr: 'Memory recall', 'm+': 'Add to memory', 'm-': 'Subtract from memory', gt: 'Recall grand total (sum of today\'s tape)', c: 'Clear entry / all clear (Esc)', bs: 'Backspace', neg: 'Change sign', 'gst+': 'Add GST at the selected rate (G)', 'gst-': 'Remove GST from an inclusive amount (Shift+G)', '=': 'Equals (Enter)' };
  const MODES = [['basic', 'Basic'], ['gst', 'GST'], ['trade', 'Trade'], ['units', 'Units'], ['words', 'Words']];
  const RATES = [[18, 'Standard'], [17, 'Reduced'], [16, 'PRA / ICT services'], [15, 'SRB / KPRA services']];

  function tpl(o) {
    const items = (D.items || []).map((it, i) => `<option value="${i}">${esc(it.name)} · ${it.ctn || 1}/${esc((it.pack || '').split(' ')[0] || 'Ctn')}</option>`).join('');
    const schemes = (D.schemes || []).map((s, i) => `<button type="button" class="cx-chip" data-scheme="${i}" title="${esc(s.label)}">${esc(s.sku)} · ${s.buy}+${s.free}</button>`).join('');
    return `
<div class="cx-display">
  <div class="cx-dtop">
    <span class="cx-ind" data-ind="m" title="Memory">M</span>
    <span class="cx-ind" data-ind="gt" title="Grand total">GT</span>
    <span class="cx-ind on" data-ind="grp" title="Digit grouping"></span>
    <span class="cx-sp"></span>
    <button type="button" class="cx-mini" data-act="round" title="Round result"><span data-round>Round: none</span><i data-lucide="chevron-down"></i></button>
    <button type="button" class="cx-mini cx-icon" data-act="copy" title="Copy result (Ctrl+C)"><i data-lucide="copy"></i></button>
  </div>
  <div class="cx-expr" data-expr>&nbsp;</div>
  <div class="cx-resrow"><span class="cx-prev" data-prev></span><output class="cx-res" data-res aria-live="polite">0</output></div>
</div>
<div class="cx-modes" role="tablist">${MODES.map(([k, l]) => `<button type="button" role="tab" data-mode="${k}"${k === 'basic' ? ' class="active"' : ''}>${l}</button>`).join('')}<i class="cx-modes-ink"></i></div>
<div class="cx-panes">
  <div class="cx-pane active" data-pane="basic">
    <div class="cx-keys">${KEYS.map(([k, l, c]) => `<button type="button" tabindex="-1" class="cx-k ${c || 'dg'}" data-k="${esc(k)}"${TITLES[k] ? ` title="${esc(TITLES[k])}"` : ''}>${k === 'gst+' || k === 'gst-' ? `${l}<small data-rate-l>18%</small>` : esc(l)}</button>`).join('')}</div>
  </div>

  <div class="cx-pane" data-pane="gst">
    <label class="cx-f"><span>Amount</span><input data-g="amt" inputmode="decimal" autocomplete="off"></label>
    <div class="cx-f"><span>Rate</span><div class="cx-chips" data-g="rates">${RATES.map(([r, t]) => `<button type="button" class="cx-chip" data-rate="${r}" title="${t}">${r}%</button>`).join('')}<button type="button" class="cx-chip" data-rate="custom">Custom</button><input class="cx-cust" data-g="cust" inputmode="decimal" placeholder="%" hidden></div></div>
    <div class="cx-line">
      <div class="cx-seg2" data-g="dir"><button type="button" data-v="add" class="active">+GST <small>exclusive</small></button><button type="button" data-v="rem">−GST <small>inclusive</small></button></div>
    </div>
    <label class="switch cx-sw"><input type="checkbox" data-g="ft"><i></i><span>Further tax 4% <small>unregistered buyer</small></span></label>
    <div class="cx-tiles c4">
      <div><small>Net</small><b data-o="g-net">0</b></div>
      <div><small data-o="g-tl">GST 18%</small><b data-o="g-tax">0</b></div>
      <div data-ft-tile><small>Further 4%</small><b data-o="g-ft">0</b></div>
      <div class="hl"><small>Gross</small><b data-o="g-gross">0</b></div>
    </div>
    <div class="cx-acts"><button type="button" class="btn sm secondary" data-act="g-tape"><i data-lucide="list-plus"></i>Add to tape</button><button type="button" class="btn sm primary" data-act="g-use"><i data-lucide="corner-down-left"></i>Use gross</button></div>
  </div>

  <div class="cx-pane" data-pane="trade">
    <div class="cx-card">
      <h5><i data-lucide="tags"></i>Chained discount</h5>
      <div class="cx-grid2"><label class="cx-f"><span>List price</span><input data-t="lp" inputmode="decimal" value="1,000"></label><label class="cx-f"><span>Discounts</span><input data-t="ch" value="10+5" placeholder="10+5+2"></label></div>
      <div class="cx-res2"><span>Effective <b data-o="t-eff">14.50%</b></span><span>Net <b data-o="t-net">855.00</b></span></div>
    </div>
    <div class="cx-card">
      <h5><i data-lucide="arrow-left-right"></i>Margin &amp; markup</h5>
      <div class="cx-seg2 sm" data-t="mm"><button type="button" data-v="price" class="active">Cost &amp; price</button><button type="button" data-v="margin">Cost &amp; margin %</button><button type="button" data-v="markup">Cost &amp; markup %</button></div>
      <div class="cx-grid2"><label class="cx-f"><span>Cost</span><input data-t="cost" inputmode="decimal" value="800"></label><label class="cx-f"><span data-t="v2l">Selling price</span><input data-t="v2" inputmode="decimal" value="1,000"></label></div>
      <div class="cx-res2 c4"><span>Price <b data-o="t-price">0</b></span><span>Profit <b data-o="t-profit">0</b></span><span>Margin <b data-o="t-margin">0</b></span><span>Markup <b data-o="t-markup">0</b></span></div>
    </div>
    <div class="cx-card">
      <h5><i data-lucide="gift"></i>Scheme effective price</h5>
      <div class="cx-grid3"><label class="cx-f"><span>Rate</span><input data-t="sr" inputmode="decimal" value="150"></label><label class="cx-f"><span>Buy</span><input data-t="sb" inputmode="numeric" value="10"></label><label class="cx-f"><span>Free</span><input data-t="sf" inputmode="numeric" value="1"></label></div>
      ${schemes ? `<div class="cx-chips sm">${schemes}</div>` : ''}
      <div class="cx-res2"><span>Effective unit <b data-o="t-su">0</b></span><span>Discount <b data-o="t-sd">0</b></span></div>
    </div>
  </div>

  <div class="cx-pane" data-pane="units">
    <label class="cx-f"><span>Product</span><select data-u="item">${items}</select></label>
    <div class="cx-pack" data-u="pack"></div>
    <div class="cx-grid3"><label class="cx-f"><span>Cartons</span><input data-u="ctn" inputmode="numeric" value="2"></label><label class="cx-f"><span data-u="loosel">Pieces</span><input data-u="pcs" inputmode="numeric" value="5"></label><label class="cx-f"><span>Total pcs</span><input data-u="tot" inputmode="numeric"></label></div>
    <div class="cx-seg2 sm" data-u="basis"><button type="button" data-v="price" class="active">Retail</button><button type="button" data-v="wprice">Wholesale</button><button type="button" data-v="cost">Cost</button></div>
    <div class="cx-tiles c3">
      <div><small>Total pieces</small><b data-o="u-tot">0</b></div>
      <div><small data-o="u-ul">Unit price</small><b data-o="u-unit">0</b></div>
      <div class="hl"><small>Value</small><b data-o="u-val">0</b></div>
    </div>
    <div class="cx-acts"><span class="cx-note" data-u="sum"></span><button type="button" class="btn sm primary" data-act="u-use"><i data-lucide="corner-down-left"></i>Use value</button></div>
  </div>

  <div class="cx-pane" data-pane="words">
    <label class="cx-f"><span>Amount (PKR)</span><input data-w="amt" inputmode="decimal" autocomplete="off"></label>
    <div class="cx-line"><div class="cx-seg2 sm" data-w="lang"><button type="button" data-v="en">English</button><button type="button" data-v="ur">اردو</button></div><div class="cx-seg2 sm" data-w="grp"><button type="button" data-v="lakh">12,34,567</button><button type="button" data-v="intl">1,234,567</button></div></div>
    <div class="cx-words"><div class="cx-wnum" data-w="num">0</div><p data-w="out"></p></div>
    <div class="cx-acts"><span class="cx-note">Cheque-ready wording</span><button type="button" class="btn sm secondary" data-act="w-copy"><i data-lucide="copy"></i>Copy</button></div>
  </div>
</div>
<div class="cx-tape${o.tape === false ? ' cx-hide' : ''}">
  <div class="cx-thead">
    <button type="button" class="cx-ttl" data-act="tape-toggle"><i data-lucide="scroll-text"></i>Tape <em data-tape-n>0</em><i class="cx-chev" data-lucide="chevron-down"></i></button>
    <span class="cx-gt" title="Grand total of today's tape">Σ <b data-gt>0</b></span>
    <span class="cx-tacts">
      <button type="button" class="cx-mini cx-icon" data-act="t-total" title="Re-total tape"><i data-lucide="sigma"></i></button>
      <button type="button" class="cx-mini cx-icon" data-act="t-copy" title="Copy tape"><i data-lucide="clipboard-copy"></i></button>
      <button type="button" class="cx-mini cx-icon" data-act="t-print" title="Print tape"><i data-lucide="printer"></i></button>
      <button type="button" class="cx-mini cx-icon" data-act="t-clear" title="Clear tape"><i data-lucide="trash-2"></i></button>
    </span>
  </div>
  <ol class="cx-tlist" data-tape></ol>
</div>`;
  }

  /* ---------------- component ---------------- */
  function mount(host, opts = {}) {
    if (!host) return null;
    if (host._cx) return host._cx;
    const root = document.createElement('div');
    root.className = 'cx' + (opts.float ? ' cx-in-float' : '') + (opts.compact ? ' cx-compact' : '');
    root.tabIndex = 0;
    root.setAttribute('aria-label', 'Calculator');
    root.innerHTML = tpl(opts);
    host.appendChild(root);
    const q = (s) => root.querySelector(s), qa = (s) => [...root.querySelectorAll(s)];
    const st = { ex: '', done: false, res: 0, label: '', fresh: false, err: '', mode: 'basic', shownVal: 0 };
    const resEl = q('[data-res]'), exprEl = q('[data-expr]'), prevEl = q('[data-prev]');

    /* -------- display -------- */
    function curNum() { const m = st.ex.match(/-?[\d.]*%?$/); return m ? m[0] : ''; }
    function currentValue() { if (st.done) return st.res; const v = evaluate(st.ex, true); return v == null || !isFinite(v) ? 0 : v; }
    function sizeRes(len) { resEl.style.setProperty('--cx-fs', len <= 10 ? '36px' : len <= 13 ? '30px' : len <= 16 ? '25px' : len <= 20 ? '21px' : '17px'); }
    function setRes(text, html) { resEl.innerHTML = html; sizeRes(text.length); }
    function showNumber(v) { const s = fmt(v); setRes(s, decHTML(s)); st.shownVal = v; }
    function animateTo(v) {
      const from = st.shownVal || 0;
      resEl.classList.remove('cx-roll'); void resEl.offsetWidth; resEl.classList.add('cx-roll');
      if (reduce() || from === v || !isFinite(from)) { showNumber(v); return; }
      const t0 = performance.now(), dur = 340, dp = (raw(v).split('.')[1] || '').length;
      const step = (now) => {
        const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
        if (p < 1) { const x = from + (v - from) * e; const s = fmt(x, Math.min(dp, 8)); setRes(s, decHTML(s)); requestAnimationFrame(step); } else showNumber(v);
      };
      requestAnimationFrame(step);
    }
    function render(anim) {
      root.classList.toggle('cx-err', !!st.err);
      if (st.err) { exprEl.textContent = pretty(st.ex) || ' '; setRes(st.err, esc(st.err)); prevEl.textContent = ''; return; }
      if (st.done) {
        exprEl.textContent = (st.label || pretty(st.ex)) + ' =';
        prevEl.textContent = '';
        if (anim) animateTo(st.res); else showNumber(st.res);
      } else {
        exprEl.textContent = pretty(st.ex) || ' ';
        const c = curNum();
        const hasOp = /[+−×÷]|\d%/.test(st.ex.replace(/^-/, ''));
        const pv = evaluate(st.ex, true);
        prevEl.textContent = hasOp && pv != null && isFinite(pv) && /\d%?$/.test(st.ex) ? '≈ ' + fmt(pv) : '';
        if (c && c !== '-' && !st.fresh) {
          const neg = c.startsWith('-'), body = c.replace(/^-/, '').replace(/%$/, ''), pct = c.endsWith('%');
          const [i, d] = body.split('.');
          const s = (neg ? '−' : '') + group(i || '0') + (d != null ? '.' + d : '') + (pct ? '%' : '');
          const k = s.indexOf('.');
          setRes(s, k < 0 ? esc(s) : esc(s.slice(0, k)) + '<span class="cx-dec">' + esc(s.slice(k)) + '</span>');
          st.shownVal = parseFloat(body) || 0;
        } else showNumber(pv == null || !isFinite(pv) ? 0 : pv);
      }
      const clr = q('[data-k="c"]'); if (clr) clr.textContent = st.ex && !st.done ? 'C' : 'AC';
    }
    function indicators() {
      const m = q('[data-ind="m"]'), g = q('[data-ind="gt"]'), grp = q('[data-ind="grp"]');
      m.classList.toggle('on', S.mem !== 0); m.title = 'Memory: ' + fmt(S.mem);
      const G = gt(); g.classList.toggle('on', S.tape.length > 0); g.title = 'Grand total: ' + fmt(G);
      grp.textContent = S.set.group === 'intl' ? 'INTL' : 'LAKH';
      q('[data-round]').textContent = 'Round: ' + (S.set.round ? S.set.round : 'none');
      qa('[data-rate-l]').forEach((e) => { e.textContent = S.set.rate + '%'; });
    }
    function flashInd(k) { const e = q(`[data-ind="${k}"]`); if (!e) return; e.classList.remove('cx-blip'); void e.offsetWidth; e.classList.add('cx-blip'); }
    function shake() { root.classList.remove('cx-shake'); void root.offsetWidth; root.classList.add('cx-shake'); }

    /* -------- key logic -------- */
    const isOp = (ch) => '+−×÷'.includes(ch);
    function startFresh() { if (st.done) { st.ex = ''; st.done = false; st.label = ''; } if (st.fresh) { st.ex = st.ex.slice(0, st.ex.length - curNum().length); st.fresh = false; } }
    function continueFromResult() { if (st.done) { st.ex = raw(st.res); st.done = false; st.label = ''; } st.fresh = false; }
    function insertValue(v) {
      st.err = '';
      if (st.done || st.ex === '') { st.ex = raw(v); st.done = false; st.label = ''; } else { const c = curNum(); st.ex = st.ex.slice(0, st.ex.length - c.length) + raw(v); }
      st.fresh = true; render();
    }
    function equals() {
      if (st.done) { shake(); return false; }
      let ex = st.ex.replace(/[+−×÷]$/, '');
      if (!ex || ex === '-') return false;
      const v = evaluate(ex, true);
      if (v == null) { shake(); return false; }
      if (!isFinite(v)) { st.err = 'Can’t divide by 0'; st.ex = ex; render(); shake(); return false; }
      const step = +S.set.round || 0; const r = step ? Math.round(v / step) * step : clean(v);
      st.ex = ex; st.res = clean(r); st.done = true; st.fresh = false; st.label = '';
      addTape(ex, st.res, 'calc');
      render(true); return true;
    }
    function commitPending() { if (!st.done && /[+−×÷]|\d%/.test(st.ex.replace(/^-/, ''))) equals(); }
    function applyGst(add) {
      commitPending();
      const v = currentValue(), r = +S.set.rate || 0;
      if (!v) { shake(); return; }
      const nv = clean(add ? v * (1 + r / 100) : v / (1 + r / 100));
      const label = add ? `${fmt(v)} + GST ${r}%` : `${fmt(v)} − GST ${r}% (incl.)`;
      st.res = nv; st.done = true; st.label = label; st.ex = raw(nv); st.fresh = false; st.err = '';
      addTape(label, nv, 'gst'); render(true);
    }
    function press(k) {
      if (st.err && k !== 'c' && k !== 'bs') { st.err = ''; st.ex = ''; }
      else if (st.err) { st.err = ''; st.ex = ''; render(); return; }
      if (/^\d$/.test(k)) {
        startFresh(); const c = curNum();
        if (c.endsWith('%')) { shake(); return; }
        if (c.replace(/\D/g, '').length >= 15) { shake(); return; }
        if (c === '0' || c === '-0') st.ex = st.ex.slice(0, -1) + k; else st.ex += k;
      } else if (k === '.') {
        startFresh(); const c = curNum();
        if (c.includes('.') || c.endsWith('%')) return;
        st.ex += (c === '' || c === '-') ? '0.' : '.';
      } else if (isOp(k)) {
        continueFromResult();
        if (st.ex === '' || st.ex === '-') { if (k === '−') { st.ex = '-'; render(); return; } st.ex = '0'; }
        const last = st.ex.slice(-1);
        if (isOp(last)) { if (k === '−' && (last === '×' || last === '÷')) st.ex += '-'; else st.ex = st.ex.slice(0, -1) + k; }
        else if (last === '-') st.ex = st.ex.slice(0, -1).replace(/[+−×÷]$/, '') + k;
        else { if (last === '.') st.ex = st.ex.slice(0, -1); st.ex += k; }
      } else if (k === '%') {
        continueFromResult();
        if (/[\d.]$/.test(st.ex)) st.ex = st.ex.replace(/\.$/, '') + '%'; else { shake(); return; }
      } else if (k === 'neg') {
        continueFromResult(); const c = curNum();
        const base = st.ex.slice(0, st.ex.length - c.length);
        st.ex = base + (c.startsWith('-') ? c.slice(1) : '-' + c);
      } else if (k === 'bs') {
        if (st.done) { st.ex = raw(st.res).slice(0, -1); st.done = false; st.label = ''; } else st.ex = st.ex.slice(0, -1);
        st.fresh = false;
      } else if (k === 'c') {
        if (st.done || !st.ex) { st.ex = ''; st.done = false; st.label = ''; st.res = 0; }
        else { const c = curNum(); if (c && c.length < st.ex.length) st.ex = st.ex.slice(0, st.ex.length - c.length); else st.ex = ''; }
        st.fresh = false;
      } else if (k === '=') { equals(); return; }
      else if (k === 'mc') { S.mem = 0; saveMem(); refreshAll('ind'); flashInd('m'); return; }
      else if (k === 'mr') { insertValue(S.mem); flashInd('m'); return; }
      else if (k === 'm+' || k === 'm-') {
        commitPending(); const v = currentValue();
        S.mem = clean(S.mem + (k === 'm+' ? v : -v)); saveMem(); refreshAll('ind'); flashInd('m');
        exprEl.textContent = (k === 'm+' ? 'M+ ' : 'M− ') + fmt(v) + '  ·  M = ' + fmt(S.mem);
        st.fresh = true; if (!st.done && st.ex) st.ex = raw(v);
        return;
      } else if (k === 'gt') { insertValue(gt()); flashInd('gt'); return; }
      else if (k === 'gst+' || k === 'gst-') { applyGst(k === 'gst+'); return; }
      render();
    }
    function animKey(k) {
      const b = root.querySelector(`.cx-k[data-k="${CSS.escape(k)}"]`); if (!b) return;
      b.classList.remove('cx-press'); void b.offsetWidth; b.classList.add('cx-press');
      clearTimeout(b._t); b._t = setTimeout(() => b.classList.remove('cx-press'), 160);
    }
    function copyResult() {
      const v = st.done ? st.res : currentValue();
      copyText(raw(v), 'Copied ' + fmt(v));
      const b = q('[data-act="copy"]'); if (b) { b.classList.add('cx-ok'); setTimeout(() => b.classList.remove('cx-ok'), 900); }
    }

    /* -------- mode panes -------- */
    function setMode(m) {
      st.mode = m;
      qa('[data-mode]').forEach((b) => b.classList.toggle('active', b.dataset.mode === m));
      qa('[data-pane]').forEach((p) => p.classList.toggle('active', p.dataset.pane === m));
      const b = q(`[data-mode="${m}"]`), ink = q('.cx-modes-ink');
      if (b && ink) { ink.style.width = b.offsetWidth + 'px'; ink.style.transform = `translateX(${b.offsetLeft - 3}px)`; }
      const v = currentValue();
      if (m === 'gst' && !q('[data-g="amt"]').dataset.touched) q('[data-g="amt"]').value = v ? fmt(v).replace(/−/g, '-') : '10,000';
      if (m === 'words' && !q('[data-w="amt"]').dataset.touched) q('[data-w="amt"]').value = v ? raw(v) : '1234567';
      if (m === 'gst') calcGst(); if (m === 'trade') calcTrade(); if (m === 'units') calcUnits(); if (m === 'words') calcWords();
      FS.icons(root);
    }
    const tick = (key, v, o = {}) => { const el = q(`[data-o="${key}"]`); if (!el) return; if (FS.tick) FS.tick(el, isFinite(v) ? v : 0, Object.assign({ dec: 2 }, o)); else el.textContent = fmt(v, o.dec ?? 2); };
    const segVal = (sel) => { const b = q(sel + ' button.active'); return b ? b.dataset.v : ''; };
    function segPick(btn) { [...btn.parentElement.children].forEach((x) => x.classList.toggle('active', x === btn)); }
    // GST
    let gstRes = 0;
    function calcGst() {
      const amt = parseNum(q('[data-g="amt"]').value), r = +S.set.rate || 0, ft = q('[data-g="ft"]').checked ? 4 : 0, add = segVal('[data-g="dir"]') !== 'rem';
      const net = add ? amt : amt / (1 + (r + ft) / 100), tax = net * r / 100, fur = net * ft / 100, gross = add ? net + tax + fur : amt;
      qa('[data-rate]').forEach((b) => b.classList.toggle('active', b.dataset.rate === 'custom' ? !RATES.some(([x]) => x === +S.set.rate) : +b.dataset.rate === +S.set.rate));
      const cust = q('[data-g="cust"]'); const isCust = !RATES.some(([x]) => x === +S.set.rate); cust.hidden = !isCust; if (isCust && document.activeElement !== cust) cust.value = S.set.rate;
      q('[data-o="g-tl"]').textContent = 'GST ' + r + '%';
      q('[data-ft-tile]').classList.toggle('cx-off', !ft);
      tick('g-net', net); tick('g-tax', tax); tick('g-ft', fur); tick('g-gross', gross);
      gstRes = { net, tax, fur, gross, r, ft, add, amt };
    }
    // Trade
    let tradeVals = {};
    function calcTrade() {
      const lp = parseNum(q('[data-t="lp"]').value);
      const ds = String(q('[data-t="ch"]').value).split(/[+,\s]+/).map(parseFloat).filter((x) => isFinite(x));
      const f = ds.reduce((a, d) => a * (1 - d / 100), 1), eff = (1 - f) * 100;
      tick('t-eff', eff, { suffix: '%' }); tick('t-net', lp * f);
      const mode = segVal('[data-t="mm"]'), cost = parseNum(q('[data-t="cost"]').value), v2 = parseNum(q('[data-t="v2"]').value);
      q('[data-t="v2l"]').textContent = mode === 'price' ? 'Selling price' : mode === 'margin' ? 'Margin %' : 'Markup %';
      let price = mode === 'price' ? v2 : mode === 'margin' ? (v2 < 100 ? cost / (1 - v2 / 100) : 0) : cost * (1 + v2 / 100);
      const profit = price - cost, margin = price ? profit / price * 100 : 0, markup = cost ? profit / cost * 100 : 0;
      tick('t-price', price); tick('t-profit', profit); tick('t-margin', margin, { suffix: '%' }); tick('t-markup', markup, { suffix: '%' });
      const sr = parseNum(q('[data-t="sr"]').value), sb = parseNum(q('[data-t="sb"]').value), sf = parseNum(q('[data-t="sf"]').value);
      const su = sb + sf > 0 ? sr * sb / (sb + sf) : 0, sd = sb + sf > 0 ? sf / (sb + sf) * 100 : 0;
      tick('t-su', su); tick('t-sd', sd, { suffix: '%' });
      tradeVals = { net: lp * f, eff, price, su };
    }
    // Units
    let unitVals = {};
    function unitItem() { return (D.items || [])[+q('[data-u="item"]').value] || { name: '—', ctn: 1, price: 0, wprice: 0, cost: 0, loose: 'Pcs' }; }
    function calcUnits(from) {
      const it = unitItem(), pack = Math.max(1, +it.ctn || 1), loose = it.loose || it.unit || 'Pcs';
      const ci = q('[data-u="ctn"]'), pi = q('[data-u="pcs"]'), ti = q('[data-u="tot"]');
      let tot;
      if (from === 'tot') { tot = Math.max(0, Math.round(parseNum(ti.value))); ci.value = Math.floor(tot / pack); pi.value = tot % pack; }
      else { tot = Math.max(0, Math.round(parseNum(ci.value) * pack + parseNum(pi.value))); if (document.activeElement !== ti) ti.value = tot; }
      q('[data-u="loosel"]').textContent = loose;
      q('[data-u="pack"]').innerHTML = `<i data-lucide="package"></i><span>1 carton = <b>${pack}</b> ${esc(loose)}</span><span class="cx-sp"></span><span>${esc(it.sku || '')}</span>`;
      const basis = segVal('[data-u="basis"]') || 'price', unit = +it[basis] || 0;
      q('[data-o="u-ul"]').textContent = (basis === 'price' ? 'Retail' : basis === 'wprice' ? 'Wholesale' : 'Cost') + ' / ' + loose;
      tick('u-tot', tot, { dec: 0 }); tick('u-unit', unit); tick('u-val', tot * unit);
      const c = Math.floor(tot / pack), p = tot % pack;
      q('[data-u="sum"]').textContent = `${c} ctn ${p} ${loose.toLowerCase()} = ${fmt(tot)} ${loose.toLowerCase()}`;
      FS.icons(q('[data-u="pack"]'));
      unitVals = { tot, unit, val: tot * unit, label: `${c} ctn ${p} ${loose.toLowerCase()} × ${fmt(unit, 2)}`, name: it.name };
    }
    // Words
    function calcWords() {
      const v = parseNum(q('[data-w="amt"]').value);
      qa('[data-w="lang"] button').forEach((b) => b.classList.toggle('active', b.dataset.v === S.set.lang));
      qa('[data-w="grp"] button').forEach((b) => b.classList.toggle('active', b.dataset.v === S.set.group));
      q('[data-w="num"]').innerHTML = 'Rs ' + decHTML(fmt(v, 2));
      const out = q('[data-w="out"]'); const w = words(v);
      out.textContent = w; out.dir = S.set.lang === 'ur' ? 'rtl' : 'ltr'; out.lang = S.set.lang === 'ur' ? 'ur' : 'en';
      out.classList.remove('cx-fade'); void out.offsetWidth; out.classList.add('cx-fade');
    }

    /* -------- tape -------- */
    let tapeLen = S.tape.length, editing = null;
    function renderTape() {
      const list = q('[data-tape]'), grew = S.tape.length > tapeLen; tapeLen = S.tape.length;
      q('[data-tape-n]').textContent = S.tape.length;
      q('[data-gt]').textContent = fmt(gt(), 2);
      if (!S.tape.length) { list.innerHTML = '<li class="cx-tempty"><i data-lucide="receipt-text"></i>No calculations yet today. Results you total with = land here.</li>'; FS.icons(list); return; }
      list.innerHTML = S.tape.map((l, i) => `<li class="cx-tl${l.k === 'total' ? ' cx-tot' : ''}${grew && i === S.tape.length - 1 ? ' cx-new' : ''}" data-id="${l.id}">
        <span class="cx-tn">${i + 1}</span>
        ${editing === l.id ? `<input class="cx-tedit" value="${esc(lineExpr(l))}" aria-label="Edit expression">` : `<button type="button" class="cx-tline" data-act="t-use" title="Use this result"><span class="cx-te">${esc(lineExpr(l))}</span><b class="cx-tr">${decHTML(fmt(l.r))}</b></button>`}
        <span class="cx-tx"><button type="button" class="cx-mini cx-icon" data-act="t-edit" title="Edit"><i data-lucide="pencil"></i></button><button type="button" class="cx-mini cx-icon" data-act="t-del" title="Delete"><i data-lucide="x"></i></button></span>
      </li>`).join('');
      FS.icons(list);
      if (grew) list.scrollTop = list.scrollHeight;
      const ed = list.querySelector('.cx-tedit'); if (ed) { ed.focus(); ed.select(); }
    }
    function saveEdit(id, text) {
      const l = S.tape.find((x) => x.id === id); editing = null;
      if (!l) return renderTape();
      const ex = normalize(text), v = evaluate(ex, true);
      if (v != null && isFinite(v)) { l.e = ex.replace(/[+−×÷]$/, ''); l.k = 'calc'; l.r = clean(v); saveTape(); FS.toast('Line ' + (S.tape.indexOf(l) + 1) + ' recalculated = ' + fmt(l.r), { tone: 'good' }); }
      else if (text.trim()) FS.toast('That expression can’t be evaluated', { tone: 'warn' });
      refreshAll('tape');
    }

    /* -------- events -------- */
    root.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('.cx-k'); if (b) animKey(b.dataset.k);
      if (!e.target.closest('input,select,textarea,button')) setTimeout(() => root.focus({ preventScroll: true }), 0);
    });
    root.addEventListener('click', (e) => {
      const key = e.target.closest('.cx-k');
      if (key) { press(key.dataset.k); root.focus({ preventScroll: true }); return; }
      const md = e.target.closest('[data-mode]'); if (md) { setMode(md.dataset.mode); return; }
      const rate = e.target.closest('[data-rate]');
      if (rate) { if (rate.dataset.rate === 'custom') { const c = q('[data-g="cust"]'); c.hidden = false; c.focus(); c.select(); qa('[data-rate]').forEach((b) => b.classList.toggle('active', b === rate)); return; } S.set.rate = +rate.dataset.rate; saveSet(); refreshAll('ind'); calcGst(); return; }
      const sb = e.target.closest('.cx-seg2 button');
      if (sb) {
        const seg = sb.parentElement;
        if (seg.dataset.w === 'lang') { S.set.lang = sb.dataset.v; saveSet(); refreshAll('set'); return; }
        if (seg.dataset.w === 'grp') { S.set.group = sb.dataset.v; saveSet(); refreshAll('set'); return; }
        segPick(sb);
        if (seg.dataset.g) calcGst();
        if (seg.dataset.t === 'mm') { const v2 = q('[data-t="v2"]'); const cost = parseNum(q('[data-t="cost"]').value); const pr = tradeVals.price || 0; v2.value = sb.dataset.v === 'price' ? fmt(pr, 2) : sb.dataset.v === 'margin' ? (pr ? ((pr - cost) / pr * 100).toFixed(2) : '20') : (cost ? ((pr - cost) / cost * 100).toFixed(2) : '25'); calcTrade(); }
        if (seg.dataset.u) calcUnits();
        return;
      }
      const sc = e.target.closest('[data-scheme]');
      if (sc) { const s = D.schemes[+sc.dataset.scheme]; const it = (D.items || []).find((x) => x.sku === s.sku); q('[data-t="sr"]').value = it ? it.price : 100; q('[data-t="sb"]').value = s.buy; q('[data-t="sf"]').value = s.free; calcTrade(); return; }
      const a = e.target.closest('[data-act]'); if (!a) return;
      const act = a.dataset.act;
      if (act === 'copy') copyResult();
      else if (act === 'round') FS.menu(a, [['none', 0], ['Nearest 1', 1], ['Nearest 5', 5], ['Nearest 10', 10]].map(([l, v]) => ({ label: (S.set.round === v ? '✓ ' : '') + (v ? l : 'No rounding'), icon: v ? 'circle-dot' : 'circle', onClick: () => { S.set.round = v; saveSet(); refreshAll('ind'); FS.toast(v ? 'Results round to nearest ' + v : 'Rounding off', { tone: 'info' }); } })));
      else if (act === 'g-use' || act === 'g-tape') {
        calcGst(); const g = gstRes; if (!g.amt) { shake(); return; }
        const label = g.add ? `${fmt(g.amt)} + GST ${g.r}%${g.ft ? ' + FT 4%' : ''}` : `${fmt(g.amt)} − GST ${g.r}%${g.ft ? ' + FT 4%' : ''} (incl.) → net`;
        const val = g.add ? g.gross : g.net;
        addTape(label, val, 'gst');
        if (act === 'g-use') { st.res = clean(val); st.done = true; st.label = label; st.ex = raw(val); setMode('basic'); render(true); } else FS.toast('Added to tape', { tone: 'good' });
      } else if (act === 'u-use') {
        calcUnits(); addTape(unitVals.label, unitVals.val, 'units');
        st.res = clean(unitVals.val); st.done = true; st.label = unitVals.label; st.ex = raw(unitVals.val); setMode('basic'); render(true);
      } else if (act === 'w-copy') copyText(q('[data-w="out"]').textContent, 'Copied words');
      else if (act === 'tape-toggle') root.classList.toggle('cx-tape-min');
      else if (act === 't-total') {
        if (!S.tape.length) { FS.toast('The tape is empty', { tone: 'info' }); return; }
        const n = S.tape.filter((l) => l.k !== 'total').length, G = gt();
        addTape(`Σ Total of ${n} line${n === 1 ? '' : 's'}`, G, 'total');
        st.res = G; st.done = true; st.label = 'Σ Tape total'; st.ex = raw(G); render(true);
      } else if (act === 't-copy') {
        if (!S.tape.length) { FS.toast('The tape is empty', { tone: 'info' }); return; }
        copyText(S.tape.map((l, i) => `${i + 1}. ${lineExpr(l)} = ${fmt(l.r)}`).join('\n') + `\nGT = ${fmt(gt())}`, 'Tape copied');
      } else if (act === 't-print') printTape();
      else if (act === 't-clear') {
        if (!S.tape.length) return;
        const old = S.tape.slice(); S.tape = []; saveTape(); refreshAll('tape');
        FS.toast('Tape cleared (' + old.length + ' lines)', { tone: 'info', undo: () => { S.tape = old; saveTape(); refreshAll('tape'); } });
      } else if (act === 't-use' || act === 't-edit' || act === 't-del') {
        const li = a.closest('[data-id]'), id = +li.dataset.id, l = S.tape.find((x) => x.id === id); if (!l) return;
        if (act === 't-use') { insertValue(l.r); li.classList.remove('cx-pick'); void li.offsetWidth; li.classList.add('cx-pick'); setMode('basic'); }
        else if (act === 't-edit') { editing = id; renderTape(); }
        else {
          li.classList.add('cx-out');
          setTimeout(() => { const i = S.tape.findIndex((x) => x.id === id); if (i < 0) return; const [rm] = S.tape.splice(i, 1); saveTape(); refreshAll('tape'); FS.toast('Line deleted', { tone: 'info', undo: () => { S.tape.splice(i, 0, rm); saveTape(); refreshAll('tape'); } }); }, reduce() ? 0 : 220);
        }
      }
    });
    root.addEventListener('input', (e) => {
      const t = e.target;
      if (t.dataset.g === 'amt') { t.dataset.touched = '1'; calcGst(); }
      else if (t.dataset.g === 'cust') { const v = parseFloat(t.value); if (isFinite(v) && v >= 0 && v < 100) { S.set.rate = v; saveSet(); indicators(); calcGst(); } }
      else if (t.dataset.t) calcTrade();
      else if (t.dataset.u) calcUnits(t.dataset.u === 'tot' ? 'tot' : '');
      else if (t.dataset.w === 'amt') { t.dataset.touched = '1'; calcWords(); }
    });
    root.addEventListener('change', (e) => {
      if (e.target.dataset.g === 'ft') calcGst();
      if (e.target.dataset.u === 'item') calcUnits();
      if (e.target.dataset.g === 'cust') refreshAll('ind');
    });
    root.addEventListener('focusout', (e) => { if (e.target.classList.contains('cx-tedit') && editing) saveEdit(editing, e.target.value); });
    const KEYMAP = { '+': '+', '-': '−', '*': '×', x: '×', X: '×', '/': '÷', '%': '%', '.': '.', ',': '.', Enter: '=', '=': '=', Backspace: 'bs', Escape: 'c', Delete: 'c', g: 'gst+', G: 'gst-' };
    root.addEventListener('keydown', (e) => {
      const t = e.target;
      if (t.classList && t.classList.contains('cx-tedit')) {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); saveEdit(editing, t.value); }
        if (e.key === 'Escape') { e.preventDefault(); editing = null; renderTape(); root.focus({ preventScroll: true }); }
        return;
      }
      if (t.closest('input,select,textarea')) { if (e.key === 'Escape') { e.stopPropagation(); t.blur(); root.focus({ preventScroll: true }); } return; }
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'c') {
        const sel = window.getSelection && String(window.getSelection());
        if (!sel) { e.preventDefault(); e.stopPropagation(); copyResult(); }
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      let k = /^\d$/.test(e.key) ? e.key : KEYMAP[e.key];
      if (!k) return;
      if (st.mode !== 'basic') setMode('basic');
      e.preventDefault(); e.stopPropagation();
      animKey(k); press(k);
    });

    const inst = {
      el: root,
      refresh(what) { indicators(); if (what !== 'ind') renderTape(); if (what === 'set') { render(); if (st.mode === 'words') calcWords(); } },
      clear() { st.ex = ''; st.done = false; st.res = 0; st.label = ''; st.err = ''; st.fresh = false; render(); },
      press, value: () => (st.done ? st.res : currentValue()), focus() { root.focus({ preventScroll: true }); }, setMode,
      layout() { const b = q('.cx-modes .active'), ink = q('.cx-modes-ink'); if (b && ink && b.offsetWidth) { ink.style.width = b.offsetWidth + 'px'; ink.style.transform = `translateX(${b.offsetLeft - 3}px)`; } },
    };
    host._cx = inst; insts.add(inst);
    indicators(); render(); renderTape(); FS.icons(root);
    requestAnimationFrame(() => inst.layout());
    if (window.ResizeObserver) new ResizeObserver(() => inst.layout()).observe(root);
    return inst;
  }

  /* ---------------- floating popover ---------------- */
  let fl = null, flInst = null;
  function clampPos(x, y) {
    const w = fl.offsetWidth, h = fl.querySelector('.cx-fhead').offsetHeight + 8;
    return [Math.max(8, Math.min(innerWidth - w - 8, x)), Math.max(8, Math.min(innerHeight - h, y))];
  }
  function place(x, y) { [x, y] = clampPos(x, y); fl.style.left = x + 'px'; fl.style.top = y + 'px'; }
  function buildFloat() {
    fl = document.createElement('div');
    fl.className = 'cx-float'; fl.id = 'cx-float'; fl.hidden = true;
    fl.setAttribute('role', 'dialog'); fl.setAttribute('aria-label', 'Calculator');
    fl.innerHTML = `<div class="cx-fhead" title="Drag to move"><i data-lucide="grip-vertical" class="cx-grip"></i><span class="cx-ftitle"><i data-lucide="calculator"></i>Calculator</span><kbd>C</kbd><span class="cx-sp"></span>
      <button type="button" class="cx-mini cx-icon" data-f="min" title="Minimise"><i data-lucide="minus"></i></button><button type="button" class="cx-mini cx-icon" data-f="close" title="Close"><i data-lucide="x"></i></button></div><div class="cx-fbody"></div>`;
    document.body.appendChild(fl);
    flInst = mount(fl.querySelector('.cx-fbody'), { float: true });
    FS.icons(fl);
    const head = fl.querySelector('.cx-fhead');
    let drag = null;
    head.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button') || e.button !== 0) return;
      const r = fl.getBoundingClientRect(); drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, id: e.pointerId };
      head.setPointerCapture(e.pointerId); fl.classList.add('cx-dragging'); e.preventDefault();
    });
    head.addEventListener('pointermove', (e) => { if (drag && e.pointerId === drag.id) place(e.clientX - drag.dx, e.clientY - drag.dy); });
    const end = (e) => { if (!drag) return; drag = null; fl.classList.remove('cx-dragging'); try { head.releasePointerCapture(e.pointerId); } catch (x) { /* */ } LS.set('cx-float-pos', [parseFloat(fl.style.left), parseFloat(fl.style.top)]); };
    head.addEventListener('pointerup', end); head.addEventListener('pointercancel', end);
    head.addEventListener('dblclick', (e) => { if (!e.target.closest('button')) toggleMin(); });
    fl.querySelector('[data-f="min"]').onclick = toggleMin;
    fl.querySelector('[data-f="close"]').onclick = close;
    addEventListener('resize', () => { if (fl && !fl.hidden) place(parseFloat(fl.style.left) || 0, parseFloat(fl.style.top) || 0); });
  }
  function toggleMin() {
    const m = fl.classList.toggle('cx-min');
    const b = fl.querySelector('[data-f="min"]'); b.title = m ? 'Restore' : 'Minimise';
    b.innerHTML = `<i data-lucide="${m ? 'maximize-2' : 'minus'}"></i>`; FS.icons(b);
    if (!m) { place(parseFloat(fl.style.left) || 0, parseFloat(fl.style.top) || 0); flInst.layout(); flInst.focus(); }
  }
  function open(anchor) {
    try {
      if (!fl) buildFloat();
      const wasHidden = fl.hidden;
      fl.hidden = false;
      if (fl.classList.contains('cx-min')) toggleMin();
      if (wasHidden) {
        const saved = LS.get('cx-float-pos', null), w = fl.offsetWidth;
        if (innerWidth < 560) place(8, 72);
        else if (anchor && anchor.getBoundingClientRect && anchor.offsetParent !== null) { const r = anchor.getBoundingClientRect(); place(r.right - w, r.bottom + 10); }
        else if (Array.isArray(saved)) place(saved[0], saved[1]);
        else place(innerWidth - w - 24, Math.max(72, innerHeight - fl.offsetHeight - 24));
        fl.classList.remove('cx-enter'); void fl.offsetWidth; fl.classList.add('cx-enter');
      } else { fl.classList.remove('cx-nudge'); void fl.offsetWidth; fl.classList.add('cx-nudge'); }
      flInst.layout(); flInst.focus();
      return flInst;
    } catch (err) { console.warn('FS.calc.open failed', err); return null; }
  }
  function close() { if (fl) { fl.hidden = true; } }
  function toggle(anchor) { if (fl && !fl.hidden) close(); else open(anchor); }

  FS.calc = { mount, open, close, toggle, words, evaluate: (s) => evaluate(normalize(s), true), state: S };

  /* ---------------- Today's Work: calculator + tax calculator ---------------- */
  function wireTax(sec) {
    const $ = (id) => sec.querySelector('#' + id);
    const amt = $('cx-tax-amount'), rate = $('cx-tax-rate'), type = $('cx-tax-type'), cur = $('cx-tax-cur');
    if (!amt || amt._cx) return; amt._cx = true;
    const NOTES = {
      st: 'Sales tax is added on top of the amount (Sales Tax Act 1990).',
      wht: 'WHT u/s 153(1)(a) is deducted at source — net is what you pay the supplier.',
      ft: 'Further tax applies on supplies to unregistered persons, on top of sales tax.',
      pra: 'Punjab sales tax on services (PRA) is added on top of the amount.',
    };
    const calc = () => {
      const a = parseNum(amt.value), r = parseNum(rate.value), t = type.value, tax = a * r / 100, wht = t === 'wht';
      const p = ''; sec.querySelectorAll('.cx-tcur').forEach((e) => { e.textContent = cur.value; });
      sec.querySelector('#cx-tax-l1').textContent = wht ? 'Net payable' : 'Net';
      sec.querySelector('#cx-tax-l3').textContent = wht ? 'Gross' : 'Total';
      FS.tick($('cx-tax-net'), wht ? a - tax : a, { prefix: p }); FS.tick($('cx-tax-tax'), tax, { prefix: p }); FS.tick($('cx-tax-total'), a + (wht ? 0 : tax), { prefix: p });
      $('cx-tax-note').textContent = NOTES[t] || '';
      $('cx-tax-words').textContent = words(wht ? a - tax : a + tax, { lang: 'en', system: 'lakh' }).replace('Rupees', cur.value === 'PKR' ? 'Rupees' : cur.value);
    };
    amt.addEventListener('input', calc); rate.addEventListener('input', calc); cur.addEventListener('change', calc);
    amt.addEventListener('blur', () => { const v = parseNum(amt.value); amt.value = v ? FS.fmt(v, v % 1 ? 2 : 0) : ''; });
    type.addEventListener('change', () => { rate.value = type.selectedOptions[0].dataset.rate; rate.classList.remove('cx-flash'); void rate.offsetWidth; rate.classList.add('cx-flash'); calc(); });
    $('cx-tax-reset').addEventListener('click', (e) => {
      const b = e.currentTarget; b.classList.remove('cx-spin'); void b.offsetWidth; b.classList.add('cx-spin');
      amt.value = '100,000'; type.value = 'st'; rate.value = '18'; cur.value = 'PKR'; calc();
    });
    $('cx-tax-send').addEventListener('click', () => {
      const a = parseNum(amt.value), r = parseNum(rate.value), wht = type.value === 'wht', tax = a * r / 100;
      addTape(`${fmt(a)} ${wht ? '− WHT' : '+ ' + type.selectedOptions[0].textContent.replace(/\s*\(.*\)/, '')} ${r}%`, wht ? a - tax : a + tax, 'gst');
      FS.toast('Added to calculator tape', { tone: 'good' });
    });
    calc();
  }
  FS.onEnter('app/today', (sec, route, first) => {
    const host = sec.querySelector('#cx-today');
    if (first || (host && !host._cx)) {
      const inst = mount(host, { compact: true });
      const clr = sec.querySelector('#cx-today-clear'); if (clr && inst) clr.addEventListener('click', () => { inst.clear(); inst.focus(); });
      const pop = sec.querySelector('#cx-today-pop'); if (pop) pop.addEventListener('click', () => open(pop));
      wireTax(sec);
      FS.icons(sec);
    }
    if (host && host._cx) host._cx.layout();
  });
})();
