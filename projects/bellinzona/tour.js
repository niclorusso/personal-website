// The guided tour: a first-time visitor is shown what the map has, one stop at a time. Short by default: five stops of one
// sentence each, then a choice between "Vedi il resto" (the other seven stops) and "Fine".
// It is started from the welcome sheet, from ⋯ / Altro "Giro guidato", or by ?giro in the address. Nothing has to be done: each
// stop moves the map or opens the real panel, puts a ring around it and says what it is; Avanti goes on, × ends it.
// It drives the page from outside (the toolbar's own buttons, window.__explore, window.__panel) and changes none of its logic.
import { t } from './i18n.js?v=20261126e';

const $ = id => document.getElementById(id);
const Z = 7;                                              // world.json's native zoom
const { coarse: COARSE, phone: PHONE, low: LOW } = window.__mq;   // a tablet; a phone, upright or on its side; on its side (index.html)
const bar = i => document.querySelectorAll('#ex-bar button')[i] || null;
const tab = k => document.querySelector('#tabs [data-k="' + k + '"]');   // a phone's bar of sections (index.html)
const seen = (...els) => els.find(e => e && e.offsetWidth) || null;      // the first of these that is on the page: a phone hides some buttons
const pressed = b => b && (b.getAttribute('aria-expanded') === 'true' || b.getAttribute('aria-pressed') === 'true');
const openPanel = (panel, button) => { if ($(panel) && $(panel).hidden && $(button)) $(button).click(); };
const closePanels = () => { for (const k of ['tm', 'evp', 'about', 'xmenu', 'adesso']) if ($(k) && !$(k).hidden && window.__panel) window.__panel(k); };
const ex = () => window.__explore || null;
// where the panel a stop opens and the box cannot both be in sight (a phone 400 px high), the stop shows the button that opens it instead
const clear = id => {
  const p = $(id); if (!p || p.hidden || !box) return;
  const r = p.getBoundingClientRect(); box.classList.toggle('top', r.top + r.height / 2 > innerHeight * .55);   // where track() will put it
  const b = box.getBoundingClientRect();
  if (b.left < r.right && r.left < b.right && b.top < r.bottom && r.top < b.bottom) window.__panel(id);
};
const place = id => { const e = ex(); return e && e.places ? e.places.find(p => p.id === id) : null; };
const fly = (id, z, dy = 0) => { const p = place(id), e = ex(); if (p && e) e.flyTo(p.x, p.y + dy, z); };

// each stop: the key of its texts, what to show (go), what to put the ring around (at), and how to tidy up (out);
// top: on a phone the box stays at the top, so that Avanti does not move from under the finger
const FIRST = [
  { k: 'city', go: () => fly('piazza-collegiata', 3.4), at: () => $('wx'), top: true },
  { k: 'now', go: () => openPanel('adesso', 'wx'), at: () => $('adesso'), top: true },
  { k: 'trains', go: () => fly('stazione', 5.6), top: true },
  { k: 'places', go: () => { const e = ex(); if (e) { e.openCard('castelgrande'); fly('castelgrande', 5.4); } }, at: () => $('ex-card'), out: () => { const e = ex(); if (e) e.closeCard(); }, top: true },
  { k: 'events', go: () => openPanel('evp', 'evb'), at: () => ($('evp') && !$('evp').hidden ? $('evp') : seen($('evb'), tab('evp'))) },
  { k: 'choice', go: () => fly('piazza-collegiata', 4) },
];
const REST = [
  { k: 'moving', go: () => fly('piazza-del-sole', 5.2) },
  { k: 'filter', title: () => t(seen(tab('places')) ? 'tab.places' : 'bar.what'), go: () => { const b = bar(0); if (b && !pressed(b)) b.click(); }, at: () => seen($('ex-menu'), bar(0), tab('places')), out: () => { const b = bar(0); if (b && pressed(b)) b.click(); } },
  { k: 'search', at: () => $('ex-search') },
  { k: 'walks', go: () => { const b = bar(1); if (b && !pressed(b)) b.click(); }, at: () => seen($('ex-routes'), bar(1), tab('routes')), out: () => { const b = bar(1); if (b && pressed(b)) b.click(); } },
  { k: 'time', go: () => { openPanel('tm', 'tmb'); clear('tm'); }, at: () => ($('tm') && !$('tm').hidden ? $('tm') : $('tmb')) },
  { k: 'threed', at: () => $('b3d') },
  { k: 'more', go: () => openPanel('xmenu', 'more'), at: () => ($('xmenu') && !$('xmenu').hidden ? $('xmenu') : seen($('more'), tab('xmenu'))) },
  { k: 'end', go: () => fly('piazza-collegiata', 4) },
];
let stops = FIRST;
const keep = s => !!s.top && matchMedia(PHONE).matches;

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
#tour-box .l { display: flex; align-items: center; gap: 12px; }
#tour-box .skip { border: 0; background: none; color: #ffffffcc; font: inherit; font-size: 13px; padding: 6px 2px; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
#tour-box .skip:hover { color: #fff; }
#tour-box .skip[hidden], #tour-box .b button[hidden] { display: none; }
#tour-box .n, #tour-box .skip, #tour-box .b button { white-space: nowrap; }
#tour-box .b button { border: 1px solid #ffffff40; background: none; color: #fff; border-radius: 8px; padding: 7px 12px; font: inherit; cursor: pointer; }
#tour-box .b button.go { background: #f0b84a; border-color: #f0b84a; color: #1b1d22; font-weight: 600; }
#tour-box .b button:disabled { opacity: .35; cursor: default; }
#tour-box .b button:focus-visible, #tour-box .x:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
#tour-ring { position: fixed; z-index: 59; pointer-events: none; border: 2px solid #f0b84a; border-radius: 10px; box-shadow: 0 0 0 4px #f0b84a33, 0 0 0 9999px #0000002e;
  transition: left .25s, top .25s, width .25s, height .25s, opacity .2s; opacity: 0; }
@media (prefers-reduced-motion: reduce) { #tour-ring { transition: none; } }
/* phones: above the bar of sections; nothing to press under 44 px, nothing to read under 14 px */
@media ${PHONE} {
  #tour-box { bottom: calc(var(--tabs, 0px) + 12px); font-size: 15px; }
  #tour-box h3 { margin-right: 36px; }
  #tour-box .x { right: 0; top: 0; width: 44px; height: 44px; }
  #tour-box .row { gap: 0 6px; flex-wrap: wrap; } #tour-box .l { gap: 4px; } #tour-box .b { gap: 6px; margin-left: auto; flex-wrap: wrap; justify-content: flex-end; }   /* long words (German): the two buttons on a line of their own */
  #tour-box .n { font-size: 14px; }
  #tour-box .skip { min-width: 44px; min-height: 44px; padding: 0 6px; font-size: 14px; }
  #tour-box .b button { min-height: 44px; padding: 0 12px; font-size: 15px; }
  /* the time machine in two columns while it is shown, all of it in sight beside or above the box (or not opened: clear()) */
  body.bz-tour #tm { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: center; } body.bz-tour:not(.embed) #tm { width: min(320px, calc(100vw - 32px)); }
  body.bz-tour #tm > b, body.bz-tour #tmh { grid-column: 1 / -1; } body.bz-tour #tme, body.bz-tour #tmd { min-width: 0; width: 100%; }
}
/* an upright phone: what a stop shows is kept low, so that the box (at the top then) does not cover it */
@media (max-width: 640px) {
  body.bz-tour #adesso, body.bz-tour:not(.embed) #evp, body.bz-tour:not(.embed) #xmenu, body.bz-tour:not(.embed) #about, body.bz-tour:not(.embed) #ex-menu, body.bz-tour #ex-card, body.bz-tour #ex-routes { max-height: 38vh; max-height: 38dvh; }
  #tour-box { padding: 10px 14px 8px; line-height: 1.35; } #tour-box .row { margin-top: 4px; }
  body.bz-tour.embed { --foot: 0px !important; }   /* inside another page what a stop shows may also take the foot of the frame (index.html: --foot), further from the box */
}
@media ${COARSE} { #tour-box .x { right: 0; top: 0; width: 44px; height: 44px; } #tour-box .skip { min-width: 44px; min-height: 44px; } #tour-box .b button { min-height: 44px; } }
@media ${LOW} { #tour-box { left: calc(8px + env(safe-area-inset-left, 0px)); transform: none; width: min(340px, 44vw); max-height: calc(100vh - var(--tabs, 0px) - 24px); max-height: calc(100dvh - var(--tabs, 0px) - 24px); overflow: auto; }
  #tour-box.rt { left: auto; right: calc(8px + env(safe-area-inset-right, 0px)); } }   /* on its side: at the left, the panels being shown are at the right */`;
  document.head.appendChild(s);
}

function draw() {
  const s = stops[at], last = at === stops.length - 1, choice = last && stops === FIRST;   // the short tour ends on a choice: the rest, or done
  box.querySelector('h3').textContent = s.title ? s.title() : t('tour.' + s.k + '.title');
  box.querySelector('p').textContent = t('tour.' + s.k + '.text');
  box.querySelector('.n').textContent = last ? '' : t('tour.of', { n: at + 1, k: stops.length - 1 });
  const [prev, rest, next] = box.querySelectorAll('.b button');
  prev.disabled = at === 0; prev.hidden = choice; rest.hidden = !choice; rest.textContent = t('tour.rest', { n: REST.length - 1 });
  next.textContent = last ? t('tour.done') : t('tour.next'); box.querySelector('.skip').hidden = last;
}
function track() {                                        // the ring follows its target (panels open, the page is resized); the box keeps clear of it
  if (!on) return;
  const s = stops[at], el = s.at ? s.at() : null, r = el && el.getBoundingClientRect();
  if (r && r.width && r.height) {
    const p = 5; ring.style.left = r.left - p + 'px'; ring.style.top = r.top - p + 'px'; ring.style.width = r.width + 2 * p + 'px'; ring.style.height = r.height + 2 * p + 'px'; ring.style.opacity = 1;
    box.classList.toggle('top', keep(s) || r.top + r.height / 2 > innerHeight * .55);
    box.classList.toggle('rt', r.left + r.width / 2 < innerWidth / 2);   // a phone on its side: the box at the side the target is not
  } else { ring.style.opacity = 0; box.classList.toggle('top', keep(s)); box.classList.remove('rt'); }
  raf = requestAnimationFrame(track);
}
function show(i) {
  const old = stops[at]; if (on && old && old.out) old.out();
  closePanels();
  at = Math.max(0, Math.min(stops.length - 1, i));
  draw();
  const s = stops[at]; if (s.go) setTimeout(() => { if (on && stops[at] === s) s.go(); }, 60);   // after the page's own "press elsewhere closes the panels"
}
function end() {
  if (!on) return; on = false; cancelAnimationFrame(raf);
  const s = stops[at]; if (s && s.out) s.out(); closePanels();
  box.remove(); ring.remove(); box = ring = null; removeEventListener('keydown', keys, true); document.body.classList.remove('bz-tour');
}
function keys(e) {
  if (e.key === 'Escape') { e.stopPropagation(); end(); }
  else if (e.key === 'ArrowRight') { if (at < stops.length - 1) show(at + 1); else end(); }
  else if (e.key === 'ArrowLeft') show(at - 1);
}

export function startTour() {
  if (on) return; on = true; css(); stops = FIRST;
  if (window.__toNow) window.__toNow();                    // from the time machine or the past: the tour shows the present, and the visitor stays there
  document.body.classList.add('bz-tour');
  ring = document.createElement('div'); ring.id = 'tour-ring';
  box = document.createElement('div'); box.id = 'tour-box'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-live', 'polite'); box.setAttribute('aria-label', t('tour.aria'));
  const x = document.createElement('button'); x.className = 'x'; x.type = 'button'; x.textContent = '×'; x.setAttribute('aria-label', t('tour.close')); x.onclick = end;
  const row = document.createElement('div'); row.className = 'row';
  const n = document.createElement('span'); n.className = 'n';
  const b = document.createElement('div'); b.className = 'b';
  const skip = document.createElement('button'); skip.type = 'button'; skip.className = 'skip'; skip.textContent = t('tour.skip'); skip.setAttribute('aria-label', t('tour.close')); skip.onclick = end;
  const prev = document.createElement('button'); prev.type = 'button'; prev.textContent = t('tour.prev'); prev.onclick = () => show(at - 1);
  const next = document.createElement('button'); next.type = 'button'; next.className = 'go'; next.onclick = () => (at < stops.length - 1 ? show(at + 1) : end());
  const rest = document.createElement('button'); rest.type = 'button'; rest.hidden = true; rest.onclick = () => { stops = REST; at = 0; show(0); next.focus({ preventScroll: true }); };   // the stops the short tour left out
  b.append(prev, rest, next); const left = document.createElement('div'); left.className = 'l'; left.append(n, skip); row.append(left, b);
  box.append(x, document.createElement('h3'), document.createElement('p'), row);
  // a press inside the box must not count as "a press elsewhere" for the page (which would close the panel being shown)
  for (const ev of ['pointerdown', 'mousedown', 'touchstart', 'click']) box.addEventListener(ev, e => e.stopPropagation());
  document.body.append(ring, box);
  addEventListener('keydown', keys, true);
  at = 0; show(0); track(); next.focus({ preventScroll: true });
}
