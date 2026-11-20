// The guided tour: a first-time visitor is shown, one stop at a time, everything the map has.
// It is started from the welcome sheet, from ⋯ "Giro guidato", or by ?giro in the address. Nothing has to be done: each stop
// moves the map or opens the real panel, puts a ring around it and says in two lines what it is; Avanti goes on, × ends it.
// It drives the page from outside (the toolbar's own buttons, window.__explore, window.__panel) and changes none of its logic.
import { t } from './i18n.js?v=20261121a';

const $ = id => document.getElementById(id);
const Z = 7;                                              // world.json's native zoom
const bar = i => document.querySelectorAll('#ex-bar button')[i] || null;
const pressed = b => b && (b.getAttribute('aria-expanded') === 'true' || b.getAttribute('aria-pressed') === 'true');
const openPanel = (panel, button) => { if ($(panel) && $(panel).hidden && $(button)) $(button).click(); };
const closePanels = () => { for (const k of ['tm', 'evp', 'about', 'xmenu', 'adesso']) if ($(k) && !$(k).hidden && window.__panel) window.__panel(k); };
const ex = () => window.__explore || null;
const place = id => { const e = ex(); return e && e.places ? e.places.find(p => p.id === id) : null; };
const fly = (id, z, dy = 0) => { const p = place(id), e = ex(); if (p && e) e.flyTo(p.x, p.y + dy, z); };

// each stop: the key of its texts, what to show (go), what to put the ring around (at), and how to tidy up (out)
const STOPS = [
  { k: 'city', go: () => fly('piazza-collegiata', 3.4), at: () => $('title') },
  { k: 'light', go: () => fly('castelgrande', 4.6), at: () => $('wx') },
  { k: 'now', go: () => openPanel('adesso', 'wx'), at: () => $('adesso') },
  { k: 'trains', go: () => fly('stazione', 5.6) },
  { k: 'moving', go: () => fly('piazza-del-sole', 5.2) },
  { k: 'places', go: () => { const e = ex(); if (e) { e.openCard('castelgrande'); fly('castelgrande', 5.4); } }, at: () => $('ex-card'), out: () => { const e = ex(); if (e) e.closeCard(); } },
  { k: 'filter', go: () => { const b = bar(0); if (b && !pressed(b)) b.click(); }, at: () => ($('ex-menu') && $('ex-menu').offsetHeight ? $('ex-menu') : bar(0)), out: () => { const b = bar(0); if (b && pressed(b)) b.click(); } },
  { k: 'search', at: () => $('ex-search') },
  { k: 'walks', go: () => { const b = bar(1); if (b && !pressed(b)) b.click(); }, at: () => ($('ex-routes') && $('ex-routes').offsetHeight ? $('ex-routes') : bar(1)), out: () => { const b = bar(1); if (b && pressed(b)) b.click(); } },
  { k: 'events', go: () => openPanel('evp', 'evb'), at: () => ($('evp') && !$('evp').hidden ? $('evp') : $('evb')) },
  { k: 'time', go: () => openPanel('tm', 'tmb'), at: () => ($('tm') && !$('tm').hidden ? $('tm') : $('tmb')) },
  { k: 'threed', at: () => $('b3d') },
  { k: 'more', go: () => openPanel('xmenu', 'more'), at: () => ($('xmenu') && !$('xmenu').hidden ? $('xmenu') : $('more')) },
  { k: 'end', go: () => fly('piazza-collegiata', 4) },
];

let box = null, ring = null, at = 0, raf = 0, on = false;

function css() {
  if ($('tour-css')) return;
  const s = document.createElement('style'); s.id = 'tour-css';
  s.textContent = `
#tour-box { position: fixed; left: 50%; bottom: calc(18px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); z-index: 60; width: min(440px, calc(100vw - 24px));
  box-sizing: border-box; padding: 14px 16px 12px; border-radius: 12px; background: #1b1d22f7; color: #fff; border: 1px solid #f0b84a66; box-shadow: 0 14px 40px #0009;
  font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
#tour-box.top { bottom: auto; top: calc(14px + env(safe-area-inset-top, 0px)); }
#tour-box h3 { margin: 0 30px 4px 0; font-size: 16px; line-height: 1.25; color: #f0b84a; }
#tour-box p { margin: 0; color: #ffffffe6; }
#tour-box .x { position: absolute; right: 6px; top: 4px; width: 34px; height: 34px; border: 0; background: none; color: #fff; font-size: 22px; line-height: 1; cursor: pointer; opacity: .75; }
#tour-box .x:hover { opacity: 1; }
#tour-box .row { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 12px; }
#tour-box .n { font-size: 12px; color: #ffffff99; font-variant-numeric: tabular-nums; }
#tour-box .b { display: flex; gap: 8px; }
#tour-box .b button { border: 1px solid #ffffff40; background: none; color: #fff; border-radius: 8px; padding: 7px 12px; font: inherit; cursor: pointer; }
#tour-box .b button.go { background: #f0b84a; border-color: #f0b84a; color: #1b1d22; font-weight: 600; }
#tour-box .b button:disabled { opacity: .35; cursor: default; }
#tour-box .b button:focus-visible, #tour-box .x:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
#tour-ring { position: fixed; z-index: 59; pointer-events: none; border: 2px solid #f0b84a; border-radius: 10px; box-shadow: 0 0 0 4px #f0b84a33, 0 0 0 9999px #0000002e;
  transition: left .25s, top .25s, width .25s, height .25s, opacity .2s; opacity: 0; }
@media (prefers-reduced-motion: reduce) { #tour-ring { transition: none; } }`;
  document.head.appendChild(s);
}

function draw() {
  const s = STOPS[at], last = at === STOPS.length - 1;
  box.querySelector('h3').textContent = t('tour.' + s.k + '.title');
  box.querySelector('p').textContent = t('tour.' + s.k + '.text');
  box.querySelector('.n').textContent = last ? '' : t('tour.of', { n: at + 1, k: STOPS.length - 1 });
  const [prev, next] = box.querySelectorAll('.b button');
  prev.disabled = at === 0; next.textContent = last ? t('tour.done') : t('tour.next');
}
function track() {                                        // the ring follows its target (panels open, the page is resized); the box keeps clear of it
  if (!on) return;
  const s = STOPS[at], el = s.at ? s.at() : null, r = el && el.getBoundingClientRect();
  if (r && r.width && r.height) {
    const p = 5; ring.style.left = r.left - p + 'px'; ring.style.top = r.top - p + 'px'; ring.style.width = r.width + 2 * p + 'px'; ring.style.height = r.height + 2 * p + 'px'; ring.style.opacity = 1;
    box.classList.toggle('top', r.top + r.height / 2 > innerHeight * .55);
  } else { ring.style.opacity = 0; box.classList.remove('top'); }
  raf = requestAnimationFrame(track);
}
function show(i) {
  const old = STOPS[at]; if (on && old && old.out) old.out();
  closePanels();
  at = Math.max(0, Math.min(STOPS.length - 1, i));
  draw();
  const s = STOPS[at]; if (s.go) setTimeout(() => { if (on && STOPS[at] === s) s.go(); }, 60);   // after the page's own "press elsewhere closes the panels"
}
function end() {
  if (!on) return; on = false; cancelAnimationFrame(raf);
  const s = STOPS[at]; if (s && s.out) s.out(); closePanels();
  box.remove(); ring.remove(); box = ring = null; removeEventListener('keydown', keys, true);
}
function keys(e) {
  if (e.key === 'Escape') { e.stopPropagation(); end(); }
  else if (e.key === 'ArrowRight') { if (at < STOPS.length - 1) show(at + 1); else end(); }
  else if (e.key === 'ArrowLeft') show(at - 1);
}

export function startTour() {
  if (on) return; on = true; css();
  ring = document.createElement('div'); ring.id = 'tour-ring';
  box = document.createElement('div'); box.id = 'tour-box'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-live', 'polite'); box.setAttribute('aria-label', t('tour.aria'));
  const x = document.createElement('button'); x.className = 'x'; x.type = 'button'; x.textContent = '×'; x.setAttribute('aria-label', t('tour.close')); x.onclick = end;
  const row = document.createElement('div'); row.className = 'row';
  const n = document.createElement('span'); n.className = 'n';
  const b = document.createElement('div'); b.className = 'b';
  const prev = document.createElement('button'); prev.type = 'button'; prev.textContent = t('tour.prev'); prev.onclick = () => show(at - 1);
  const next = document.createElement('button'); next.type = 'button'; next.className = 'go'; next.onclick = () => (at < STOPS.length - 1 ? show(at + 1) : end());
  b.append(prev, next); row.append(n, b);
  box.append(x, document.createElement('h3'), document.createElement('p'), row);
  // a press inside the box must not count as "a press elsewhere" for the page (which would close the panel being shown)
  for (const ev of ['pointerdown', 'mousedown', 'touchstart', 'click']) box.addEventListener(ev, e => e.stopPropagation());
  document.body.append(ring, box);
  addEventListener('keydown', keys, true);
  at = 0; show(0); track(); next.focus({ preventScroll: true });
}
