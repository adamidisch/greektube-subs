/* UI baseline audit (v7.33.0).
   Τρέχει μέσα στη σελίδα: DevTools console ή javascript_tool του Claude in Chrome. Δεν χρειάζεται εγκατάσταση.
   Μετρά τα «αυτονόητα» του design-rules: ύψη και κάθετο κέντρο σε σειρά, απόσταση από τις άκρες,
   μεγέθη και βάρη γραμματοσειράς, native στοιχεία, ετικέτες, scroll και στόχους αφής.
   Είναι heuristic: τα ευρήματα διαβάζονται κριτικά. Δεν ελέγχει tooltips στο hover ούτε «live» εφαρμογή ρυθμίσεων. */
(() => {
  const V = {};
  const d = el => { const t = (el.getAttribute('aria-label') || el.innerText || '').toString().trim().replace(/\s+/g, ' ').slice(0, 22); return el.tagName.toLowerCase() + (t ? ' "' + t + '"' : ''); };
  const add = (rule, el, info) => { const o = (V[rule] = V[rule] || { count: 0, samples: [] }); o.count++; if (o.samples.length < 4) o.samples.push(Object.assign({ el: d(el) }, info)); };
  const vis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const alpha = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return 0; const p = m[1].split(',').map(parseFloat); return p.length > 3 ? p[3] : 1; };
  const boxy = el => { const s = getComputedStyle(el); return alpha(s.backgroundColor) > 0.05 || (parseFloat(s.borderTopWidth) > 0 && alpha(s.borderTopColor) > 0.05); };
  const CTRL = 'button,a[href],input:not([type=hidden]),select,textarea,[role=button],[role=tab],[role=switch]';
  const ctrls = [...document.querySelectorAll(CTRL)].filter(vis);
  const boxyC = ctrls.filter(boxy);
  // 1) ίδια σειρά: ίδιο ύψος και ίδιο κάθετο κέντρο (±1px)
  const rowsOf = list => { const rows = []; list.forEach(c => { const r = c.getBoundingClientRect(); const row = rows.find(x => r.top < x.b - 2 && r.bottom > x.t + 2); if (row) { row.items.push(r); row.t = Math.min(row.t, r.top); row.b = Math.max(row.b, r.bottom); } else rows.push({ t: r.top, b: r.bottom, items: [r], first: c }); }); return rows; };
  const seen = new Set();
  const check = list => rowsOf(list).forEach(row => { if (row.items.length < 2 || seen.has(row.first)) return; seen.add(row.first); const h = row.items.map(r => Math.round(r.height)), c = row.items.map(r => Math.round((r.top + r.bottom) / 2)); if (Math.max(...h) - Math.min(...h) > 1) add('row-height', row.first, { heights: h.join(',') }); if (Math.max(...c) - Math.min(...c) > 1) add('row-v-center', row.first, { centers: c.join(',') }); });
  const groups = new Map();
  boxyC.forEach(c => { let a = c.parentElement; while (a && a !== document.body) { if (boxyC.filter(x => a.contains(x)).length >= 2) break; a = a.parentElement; } if (a && a !== document.body) { if (!groups.has(a)) groups.set(a, []); groups.get(a).push(c); } });
  groups.forEach(list => check(list));
  document.querySelectorAll('header,nav,[role=toolbar]').forEach(h => check(boxyC.filter(c => h.contains(c))));
  // 2) στοιχεία κολλημένα στην άκρη της μπάρας τους
  document.querySelectorAll('header,nav,[role=toolbar],div,section').forEach(s => {
    const r = s.getBoundingClientRect();
    if (r.height > 90 || r.height < 30 || r.width < 280 || !vis(s) || !boxy(s)) return;
    const inside = ctrls.filter(c => s.contains(c) && !c.matches('input,select,textarea'));
    if (!inside.length) return;
    const l = Math.min(...inside.map(c => c.getBoundingClientRect().left)) - r.left;
    const rt = r.right - Math.max(...inside.map(c => c.getBoundingClientRect().right));
    const thr = s.matches('header,nav,[role=toolbar]') ? 12 : 3;
    if (l < thr || rt < thr) add('edge-padding', s, { left: Math.round(l), right: Math.round(rt), min: thr });
  });
  // 3) τυπογραφία
  const sizes = new Set();
  document.querySelectorAll('body *').forEach(el => {
    if (!vis(el) || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) return;
    const s = getComputedStyle(el), fs = parseFloat(s.fontSize), fw = parseInt(s.fontWeight);
    sizes.add(fs);
    if (fs < 12) add('font<12px', el, { fs });
    if (fw > 600) add('weight>600', el, { fw, fs });
  });
  // 4) native εμφάνιση και ετικέτες
  document.querySelectorAll('select').forEach(el => vis(el) && add('native-select', el, {}));
  document.querySelectorAll('input[type=file]').forEach(el => vis(el) && add('native-file-input', el, {}));
  document.querySelectorAll('[title]').forEach(el => add('title-attr(native tooltip)', el, { title: el.title.slice(0, 20) }));
  ctrls.forEach(c => { if (!c.matches('input,textarea,select') && !(c.innerText || '').trim() && !c.getAttribute('aria-label') && !c.getAttribute('aria-labelledby') && !c.title) add('icon-control-without-label', c, {}); });
  // 5) scroll: ένα μόνο scroll. Στοιχείο που καλύπτει όλο το viewport (π.χ. οθόνη Ρυθμίσεων) θεωρείται το scroll της σελίδας.
  document.querySelectorAll('body *').forEach(el => {
    const s = getComputedStyle(el);
    if (!/(auto|scroll)/.test(s.overflowY) || el.scrollHeight <= el.clientHeight + 2 || el.clientHeight <= 80 || el.matches('textarea,select')) return;
    const r = el.getBoundingClientRect();
    if (r.width >= innerWidth - 24 && r.height >= innerHeight - 24) return;
    add('inner-scroll', el, { sh: el.scrollHeight, ch: el.clientHeight });
  });
  if (document.documentElement.scrollWidth > innerWidth + 1) add('horizontal-overflow', document.documentElement, { sw: document.documentElement.scrollWidth, iw: innerWidth });
  // 6) στόχοι αφής
  if (matchMedia('(pointer: coarse)').matches || innerWidth <= 480) ctrls.forEach(c => { const r = c.getBoundingClientRect(); if (Math.min(r.width, r.height) < 44) add('touch-target<44', c, { w: Math.round(r.width), h: Math.round(r.height) }); });
  return { viewport: innerWidth + 'x' + innerHeight, controls: ctrls.length, fontSizesUsed: [...sizes].sort((a, b) => a - b), violations: V };
})()
