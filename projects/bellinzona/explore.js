// Explore: place search, landmark markers and info cards for the isometric map.
// Self-contained: builds its own DOM + CSS, reads places.json, and only needs a few handles from the viewer.
//
//   initExplore({ world, view, map, clamp, draw, toScreen })
//     world     world.json (labels, native_zoom)
//     view      live {x, y, z} object of the viewer (mutated here while flying)
//     map       the pannable element
//     clamp()   viewer's view clamp, draw() viewer's redraw request
//     toScreen  (worldX, worldY) -> [screenX, screenY] in CSS px

const CSS = `
#ex-markers { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.ex-mk { position: absolute; left: 0; top: 0; width: 0; height: 0; will-change: transform; }
.ex-mk i { position: absolute; left: -7px; top: -7px; width: 10px; height: 10px; border-radius: 50%;
  background: #f0b84a; border: 2px solid #15171b; box-shadow: 0 0 0 1.5px #ffffffd9, 0 2px 6px #000a;
  transition: transform .15s ease, background .15s ease; }
.ex-mk span { position: absolute; left: 0; top: 11px; transform: translateX(-50%); white-space: nowrap; color: #fff;
  font-size: 11.5px; font-weight: 500; letter-spacing: .01em; background: #1b1d22cc; padding: 1px 7px; border-radius: 9px;
  opacity: 0; transition: opacity .15s ease; }
.ex-mk.named span, .ex-mk.hover span, .ex-mk.sel span { opacity: 1; }
.ex-mk.dup span { display: none; }
.ex-mk.hover i { transform: scale(1.25); }
.ex-mk.sel i { transform: scale(1.35); background: #fff; box-shadow: 0 0 0 2px #f0b84a, 0 2px 8px #000c; }
.ex-mk.hover, .ex-mk.sel { z-index: 2; }

#ex-search { position: fixed; left: 16px; top: calc(66px + env(safe-area-inset-top, 0px)); width: min(280px, calc(100vw - 98px));
  z-index: 8; font-size: 14px; }
#ex-search input { box-sizing: border-box; width: 100%; height: 36px; margin: 0; padding: 0 30px 0 34px; border-radius: 8px;
  border: 1px solid #ffffff24; background: #1b1d22d9; color: #fff; font: inherit; font-size: 16px; outline: none;
  -webkit-appearance: none; appearance: none; box-shadow: 0 2px 10px #0006; backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
@media (min-width: 641px) { #ex-search input { font-size: 14px; } }
#ex-search input::placeholder { color: #ffffff8c; }
#ex-search input:focus { border-color: #f0b84ab3; background: #1b1d22f2; }
#ex-search input::-webkit-search-cancel-button { display: none; }
#ex-search svg { position: absolute; left: 11px; top: 11px; width: 14px; height: 14px; pointer-events: none; opacity: .7; z-index: 1; }
#ex-clear { position: absolute; right: 2px; top: 2px; width: 32px; height: 32px; border: 0; background: none; color: #ffffffa6;
  font-size: 18px; line-height: 1; cursor: pointer; display: none; padding: 0; }
#ex-clear:hover { color: #fff; }
#ex-search.has-text #ex-clear { display: block; }
#ex-results { list-style: none; margin: 6px 0 0; padding: 4px; border-radius: 8px; background: #1b1d22f2; border: 1px solid #ffffff1f;
  box-shadow: 0 6px 24px #0009; max-height: min(50vh, 340px); overflow-y: auto; display: none; }
#ex-results.open { display: block; }
#ex-results li { display: flex; align-items: baseline; gap: 8px; padding: 7px 8px; border-radius: 5px; color: #fff; cursor: pointer; }
#ex-results li.act { background: #ffffff1f; }
#ex-results li b { font-weight: 500; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#ex-results li small { font-size: 11px; color: #ffffff8c; white-space: nowrap; }
#ex-results li.none { color: #ffffff8c; cursor: default; font-size: 13px; }

#ex-card { position: fixed; left: 16px; top: calc(112px + env(safe-area-inset-top, 0px)); width: min(320px, calc(100vw - 32px));
  box-sizing: border-box; z-index: 7; padding: 14px 16px 13px; border-radius: 10px; background: #1b1d22f2; color: #fff;
  border: 1px solid #ffffff1f; box-shadow: 0 8px 30px #000a; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  max-height: calc(100vh - 170px); overflow-y: auto; display: none; }
#ex-card.open { display: block; }
#ex-card .k { font-size: 11px; text-transform: uppercase; letter-spacing: .1em; color: #f0b84a; margin: 0 28px 4px 0; }
#ex-card h2 { margin: 0 24px 0 0; font-size: 17px; font-weight: 650; line-height: 1.25; }
#ex-card .when { margin: 3px 0 0; font-size: 12px; color: #ffffffa6; }
#ex-card .d { margin: 9px 0 10px; font-size: 13.5px; line-height: 1.5; color: #ffffffe6; }
#ex-card .live { margin: 0 0 7px; padding: 6px 8px; font-size: 12.5px; line-height: 1.4; color: #fff; background: #ffffff14; border-radius: 6px; }
#ex-card a { font-size: 12px; color: #ffffffb3; text-decoration: underline; text-underline-offset: 2px; }
#ex-card a:hover { color: #fff; }
#ex-card .x { position: absolute; right: 6px; top: 6px; width: 32px; height: 32px; border: 0; background: none; color: #ffffffa6;
  font-size: 20px; line-height: 1; cursor: pointer; padding: 0; }
#ex-card .x:hover { color: #fff; }
@media (max-width: 640px) {
  #ex-card { left: 8px; right: 8px; top: auto; bottom: 64px; width: auto; max-height: 45vh; }
}
`;

const KIND_IT = { city: 'Città', town: 'Città', village: 'Paese', suburb: 'Quartiere', quarter: 'Quartiere', neighbourhood: 'Quartiere',
  hamlet: 'Frazione', locality: 'Località', isolated_dwelling: 'Località', castle: 'Castello' };

const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const el = (tag, attrs = {}, text) => {
  const e = document.createElement(tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (text != null) e.textContent = text;
  return e;
};

export async function initExplore({ world, view, map, clamp, draw, toScreen }) {
  const Z = world.native_zoom;
  let places = [];
  try {
    const r = await fetch('places.json');
    if (r.ok) places = (await r.json()).places || [];
    const M = world.enu2px, O = world.origin_lv95;        // place the markers with this view's own projection
    if (M && O) for (const p of places) if (p.e != null) { const a = p.e - O[0], b = p.n - O[1], c = (p.h || O[2]) - O[2]; p.x = M[0][0] * a + M[0][1] * b + M[0][2] * c; p.y = M[1][0] * a + M[1][1] * b + M[1][2] * c; }
  } catch { /* search still works on labels alone */ }

  document.head.appendChild(el('style')).textContent = CSS;

  // ---------- markers ----------
  const layer = el('div', { id: 'ex-markers' });
  map.appendChild(layer);
  const labelNames = new Set(world.labels.map(l => norm(l.name)));
  const markers = places.map(p => {
    const m = el('div', { class: 'ex-mk' });
    m.appendChild(el('i'));
    m.appendChild(el('span', {}, p.name));
    layer.appendChild(m);
    const dup = labelNames.has(norm(p.name));                      // the viewer already labels the castles
    if (dup) m.classList.add('dup');
    return {
      p, el: m, sx: 0, sy: 0, shown: false, dup, w: 0,
      minZ: Z - (p.tier === 1 ? 4.2 : 3.2),                       // main sights from further out
      nameZ: Z - (p.tier === 1 ? 2.6 : 1.7),
    };
  });
  for (const m of markers) m.w = m.el.lastChild.offsetWidth || m.p.name.length * 7 + 14;   // label widths, for decluttering
  let selected = null, hovered = null, lastKey = '';

  function layout(force) {
    const [ox, oy] = toScreen(0, 0);
    const key = `${ox.toFixed(1)},${oy.toFixed(1)},${view.z.toFixed(3)},${map.clientWidth},${map.clientHeight}`;
    if (!force && key === lastKey) return;
    lastKey = key;
    const w = map.clientWidth, h = map.clientHeight;
    for (const m of markers) {
      const [sx, sy] = toScreen(m.p.x, m.p.y);
      m.sx = sx; m.sy = sy;
      m.shown = (view.z >= m.minZ || m === selected) && sx > -40 && sy > -40 && sx < w + 40 && sy < h + 40;
      m.el.style.display = m.shown ? '' : 'none';
      if (!m.shown) continue;
      m.el.style.transform = `translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px)`;
    }
    // name labels: greedy declutter, most important first (selected, hovered, main sights)
    const rank = m => (m === selected ? 0 : m === hovered ? 1 : 1 + m.p.tier);
    const placed = [];
    for (const m of markers.filter(k => k.shown && !k.dup).sort((a, b) => rank(a) - rank(b))) {
      const forced = m === selected || m === hovered;
      let ok = forced || view.z >= m.nameZ;
      const box = [m.sx - m.w / 2 - 3, m.sy + 9, m.sx + m.w / 2 + 3, m.sy + 30];
      if (ok && !forced) ok = !placed.some(b => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1]);
      if (ok) placed.push(box);
      m.el.classList.toggle('named', ok);
    }
  }
  // Follows the viewer's own rAF redraws without needing a hook inside its render loop.
  (function tick() { layout(false); requestAnimationFrame(tick); })();

  function hit(cx, cy, radius) {
    const r = map.getBoundingClientRect();
    const x = cx - r.left, y = cy - r.top;
    let best = null, bd = radius * radius;
    for (const m of markers) {
      if (!m.shown) continue;
      const d = (m.sx - x) ** 2 + (m.sy - y) ** 2;
      if (d <= bd) { bd = d; best = m; }
    }
    return best;
  }

  // ---------- fly ----------
  let flyRaf = 0;
  function stopFly() { if (flyRaf) { cancelAnimationFrame(flyRaf); flyRaf = 0; } }
  function flyTo(x, y, z) {
    stopFly();
    const x0 = view.x, y0 = view.y, z0 = view.z;
    const s0 = Math.pow(2, z0 - Z);
    const distPx = Math.hypot(x - x0, y - y0) * s0;                     // on-screen distance at the starting zoom
    const span = Math.max(200, Math.min(map.clientWidth, map.clientHeight));
    const dip = Math.max(0, Math.min(2.5, Math.log2(distPx / span)));   // zoom out for long hops only
    const dur = Math.max(450, Math.min(1800, 500 + 260 * Math.log2(1 + distPx / span) + 200 * Math.abs(z - z0)));
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || distPx + Math.abs(z - z0) < 1e-3) {
      view.x = x; view.y = y; view.z = z; clamp(); draw(); return;
    }
    const t0 = performance.now();
    const step = now => {
      const t = Math.min(1, (now - t0) / dur);
      const k = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      view.x = x0 + (x - x0) * k; view.y = y0 + (y - y0) * k;
      view.z = z0 + (z - z0) * k - dip * Math.sin(Math.PI * t);
      clamp(); draw();
      flyRaf = t < 1 ? requestAnimationFrame(step) : 0;
    };
    flyRaf = requestAnimationFrame(step);
  }

  // ---------- card ----------
  const card = el('aside', { id: 'ex-card', role: 'dialog', 'aria-live': 'polite' });
  document.body.appendChild(card);
  const credits = document.getElementById('credits');
  function placeCard() {
    const phone = matchMedia('(max-width: 640px)').matches;
    card.style.bottom = phone && credits ? (credits.offsetHeight + 8) + 'px' : '';
  }
  function openCard(m) {
    if (selected) selected.el.classList.remove('sel');
    selected = m;
    m.el.classList.add('sel');
    const p = m.p;
    card.textContent = '';
    const x = el('button', { class: 'x', 'aria-label': 'Chiudi' }, '×');
    x.onclick = closeCard;
    card.appendChild(x);
    if (p.type) card.appendChild(el('p', { class: 'k' }, p.type));
    card.appendChild(el('h2', {}, p.name));
    if (p.period) card.appendChild(el('p', { class: 'when' }, p.period));
    if (p.desc) card.appendChild(el('p', { class: 'd' }, p.desc));
    if (window.__cardExtra) { try { for (const row of window.__cardExtra(p)) card.appendChild(el('p', { class: 'live' }, row)); } catch (err) { /* live rows are optional */ } }
    if (p.source && p.source.url) {
      card.appendChild(el('a', { href: p.source.url, target: '_blank', rel: 'noopener' }, 'Fonte: ' + (p.source.label || 'Wikipedia')));
    }
    card.setAttribute('aria-label', p.name);
    card.classList.add('open');
    card.scrollTop = 0;
    placeCard();
    layout(true);
  }
  function closeCard() {
    if (!selected) return;
    selected.el.classList.remove('sel');
    selected = null;
    card.classList.remove('open');
    layout(true);
  }

  // ---------- click vs drag on the map ----------
  let down = null, active = 0;
  map.addEventListener('pointerdown', e => {
    stopFly();
    active++;
    down = active === 1 ? { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() } : null;   // a second finger = pinch, not a click
  });
  map.addEventListener('pointermove', e => {
    if (down && e.pointerId === down.id && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) down = null;
    if (e.pointerType === 'mouse' && !active) {
      const m = hit(e.clientX, e.clientY, 14);
      if (m !== hovered) {
        if (hovered) hovered.el.classList.remove('hover');
        hovered = m;
        if (m) m.el.classList.add('hover');
        map.style.cursor = m ? 'pointer' : '';
        layout(true);
      }
    }
  });
  map.addEventListener('pointerup', e => {
    active = Math.max(0, active - 1);
    const d = down; down = null;
    if (!d || e.pointerId !== d.id || performance.now() - d.t > 600) return;
    const m = hit(e.clientX, e.clientY, e.pointerType === 'mouse' ? 14 : 24);
    if (m) openCard(m); else closeCard();
    input.blur();
  });
  map.addEventListener('pointercancel', () => { active = Math.max(0, active - 1); down = null; });
  map.addEventListener('pointerleave', () => { if (hovered) { hovered.el.classList.remove('hover'); hovered = null; map.style.cursor = ''; layout(true); } });
  map.addEventListener('wheel', stopFly, { passive: true });

  // ---------- search ----------
  const box = el('div', { id: 'ex-search', role: 'search' });
  box.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"><circle cx="6.8" cy="6.8" r="4.8"/><path d="M10.6 10.6 14.5 14.5"/></svg>';
  const input = el('input', { type: 'search', placeholder: 'Cerca un luogo…', 'aria-label': 'Cerca un luogo', autocomplete: 'off',
    autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'search', 'aria-controls': 'ex-results' });
  const clear = el('button', { id: 'ex-clear', 'aria-label': 'Cancella', type: 'button' }, '×');
  const list = el('ul', { id: 'ex-results', role: 'listbox' });
  box.append(input, clear, list);
  document.body.appendChild(box);

  const LABEL_Z = { city: Z - 3, town: Z - 3, village: Z - 2.2, suburb: Z - 2, quarter: Z - 2, neighbourhood: Z - 1.5 };
  const index = [];
  for (const m of markers) {
    index.push({ name: m.p.name, sub: m.p.type || '', keys: [m.p.name, ...(m.p.alt || [])].map(norm), rank: 0, marker: m });
  }
  const seen = new Set(index.flatMap(i => i.keys));
  for (const l of world.labels) {
    const k = norm(l.name);
    if (seen.has(k)) continue;                                           // e.g. the castles: the richer entry wins
    index.push({ name: l.name, sub: KIND_IT[l.kind] || '', keys: [k], rank: 1, x: l.x, y: l.y, z: LABEL_Z[l.kind] ?? Z - 1.2 });
  }

  function search(q) {
    const toks = norm(q).split(' ').filter(Boolean);
    if (!toks.length) return [];
    const out = [];
    for (const it of index) {
      let best = 9;
      for (const key of it.keys) {
        if (!toks.every(t => key.includes(t))) continue;
        const words = key.split(' ');
        const s = key.startsWith(toks[0]) ? 0 : toks.every(t => words.some(w => w.startsWith(t))) ? 1 : 2;
        if (s < best) best = s;
      }
      if (best < 9) out.push({ it, s: best * 2 + it.rank });
    }
    out.sort((a, b) => a.s - b.s || a.it.name.localeCompare(b.it.name, 'it'));
    return out.slice(0, 8).map(o => o.it);
  }

  let results = [], act = -1;
  function renderList() {
    list.textContent = '';
    const q = input.value.trim();
    box.classList.toggle('has-text', !!input.value);
    if (!q) { list.classList.remove('open'); return; }
    results = search(q);
    act = results.length ? 0 : -1;
    if (!results.length) list.appendChild(el('li', { class: 'none' }, 'Nessun risultato'));
    results.forEach((it, i) => {
      const li = el('li', { role: 'option', 'data-i': i });
      li.appendChild(el('b', {}, it.name));
      if (it.sub) li.appendChild(el('small', {}, it.sub));
      if (i === act) li.classList.add('act');
      list.appendChild(li);
    });
    list.classList.add('open');
  }
  function setAct(i) {
    if (!results.length) return;
    act = (i + results.length) % results.length;
    [...list.children].forEach((li, j) => li.classList.toggle('act', j === act));
    list.children[act].scrollIntoView({ block: 'nearest' });
  }
  function choose(it) {
    if (!it) return;
    input.value = it.name;
    box.classList.add('has-text');
    list.classList.remove('open');
    input.blur();
    if (it.marker) {
      const z = Math.max(view.z, Z - 1);
      openCard(it.marker);
      // on phones the card is a bottom sheet: aim a little lower so the marker stays clear of it
      const lift = matchMedia('(max-width: 640px)').matches ? card.offsetHeight / 2 / Math.pow(2, z - Z) : 0;
      flyTo(it.marker.p.x, it.marker.p.y + lift, z);
    } else {
      closeCard();
      flyTo(it.x, it.y, it.z);
    }
  }
  input.addEventListener('input', renderList);
  input.addEventListener('focus', () => { if (input.value.trim()) renderList(); });
  input.addEventListener('keydown', e => {
    e.stopPropagation();                                                 // keep the viewer's +/-/P/arrow shortcuts out of the text field
    if (e.key === 'ArrowDown') { e.preventDefault(); setAct(act + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAct(act - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); if (!list.classList.contains('open')) renderList(); choose(results[act]); }
    else if (e.key === 'Escape') {
      if (list.classList.contains('open')) list.classList.remove('open');
      else if (input.value) { input.value = ''; box.classList.remove('has-text'); }
      else input.blur();
    }
  });
  list.addEventListener('pointerdown', e => e.preventDefault());         // keep focus in the field while picking
  list.addEventListener('click', e => {
    const li = e.target.closest('li[data-i]');
    if (li) choose(results[+li.dataset.i]);
  });
  clear.addEventListener('click', () => { input.value = ''; renderList(); input.focus(); });
  document.addEventListener('pointerdown', e => { if (!box.contains(e.target)) list.classList.remove('open'); });

  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') { list.classList.remove('open'); closeCard(); }
    else if (e.key === '/' && document.activeElement !== input) { e.preventDefault(); input.focus(); input.select(); }
  });
  window.addEventListener('resize', () => { placeCard(); layout(true); });

  layout(true);
  return { flyTo, places, openCard: id => { const m = markers.find(k => k.p.id === id); if (m) openCard(m); }, closeCard };
}
