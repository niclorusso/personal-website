// Explore: place search, landmark markers and info cards for the isometric map.
// Self-contained: builds its own DOM + CSS, reads places.json, and only needs a few handles from the viewer.
// Also: links to a place or an itinerary stop (?luogo=<id>, ?itinerario=<id>&tappa=<n>), "Vicino a me" with the walks
// nearby, "Aperti adesso", addresses in the search (answered by swisstopo) and a welcome on the first visit.
// The visitor's own itinerary (?mio=<id>,<id>.<visit min>…&partenza=stazione), filters by tag (places.json `tags`,
// `minor`), a history strip in the cards (`timeline`) and an audioguide read by the browser's own voice (speechSynthesis).
// geo.js (coordinates, walking network, address search) is loaded only when one of those is used.
// Shared bikes and charging points with live availability (mobility.js): two layers at the end of "Cosa vedere", loaded
// when that list is first opened and listed only while their live data is in.
//
//   initExplore({ world, view, map, clamp, draw, halt, toScreen })
//     world     world.json (labels, native_zoom)
//     view      live {x, y, z} object of the viewer (mutated here while flying)
//     map       the pannable element
//     clamp()   viewer's view clamp, draw() viewer's redraw request, halt() stops the viewer's own zoom and glide
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
.ex-mk.mini i { width: 17px; height: 17px; left: -10px; top: -10px; background: #fff; border: 1px solid #0007; }
.ex-mk.mini i::after { content: attr(data-ic); position: absolute; inset: 0; display: grid; place-items: center; font: normal 11px/1 system-ui, sans-serif; }
.ex-mk.mini.stop i::after { content: attr(data-n); }
.ex-mk.mini span { top: 13px; }
.ex-mk.dup span { display: none; }
.ex-mk.hover i { transform: scale(1.25); }
.ex-mk.sel i { transform: scale(1.35); background: #fff; box-shadow: 0 0 0 2px #f0b84a, 0 2px 8px #000c; }
.ex-mk.named { z-index: 1; }
.ex-mk.hover, .ex-mk.sel { z-index: 2; }
.ex-me, .ex-pin { position: absolute; left: 0; top: 0; width: 0; height: 0; z-index: 3; display: none; }
.ex-me b { position: absolute; left: 0; top: 0; border-radius: 50%; background: #3b82f624; border: 1px solid #3b82f699; transform: translate(-50%, -50%); }
.ex-me i { position: absolute; left: -8px; top: -8px; width: 12px; height: 12px; border-radius: 50%; background: #3b82f6; border: 2px solid #fff; box-shadow: 0 1px 6px #000a; }
.ex-pin i { position: absolute; left: -11px; top: -27px; width: 18px; height: 18px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg);
  background: #d0242b; border: 2px solid #fff; box-shadow: 0 2px 6px #000a; }
.ex-pin span { position: absolute; left: 0; top: 4px; transform: translateX(-50%); white-space: nowrap; color: #fff; font-size: 11.5px; font-weight: 500;
  background: #1b1d22cc; padding: 1px 7px; border-radius: 9px; }

#ex-search { position: fixed; left: 16px; top: calc(66px + env(safe-area-inset-top, 0px)); width: min(320px, calc(100vw - 78px));
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
#ex-results li.hd { cursor: default; padding: 9px 8px 3px; font-size: 10.5px; letter-spacing: .09em; text-transform: uppercase; color: #f0b84a; }

#ex-card { position: fixed; left: 16px; top: calc(160px + env(safe-area-inset-top, 0px)); width: min(320px, calc(100vw - 32px));
  box-sizing: border-box; z-index: 7; padding: 14px 16px 13px; border-radius: 10px; background: #1b1d22f2; color: #fff;
  border: 1px solid #ffffff1f; box-shadow: 0 8px 30px #000a; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  max-height: calc(100vh - 240px); overflow-y: auto; display: none; }
#ex-card.open { display: block; }
#ex-card .k { font-size: 11px; text-transform: uppercase; letter-spacing: .1em; color: #f0b84a; margin: 0 28px 4px 0; }
#ex-card h2 { margin: 0 24px 0 0; font-size: 17px; font-weight: 650; line-height: 1.25; }
#ex-card .when { margin: 3px 0 0; font-size: 12px; color: #ffffffa6; }
#ex-card .d { margin: 9px 0 10px; font-size: 13.5px; line-height: 1.5; color: #ffffffe6; }
#ex-card .live { margin: 0 0 7px; padding: 6px 8px; font-size: 12.5px; line-height: 1.4; color: #fff; background: #ffffff14; border-radius: 6px; }
#ex-card .off { margin: 0 0 8px; padding: 6px 8px; background: #ffffff14; border-radius: 6px; font-size: 12.5px; line-height: 1.4; }
#ex-card .off summary { cursor: pointer; font-weight: 650; }
#ex-card .off p { margin: 6px 0 0; }
#ex-card .off small { display: block; color: #ffffffa6; font-size: 11.5px; }
#ex-bar { position: fixed; left: 16px; top: calc(108px + env(safe-area-inset-top, 0px)); z-index: 6; width: min(320px, calc(100vw - 78px)); display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; }
#ex-bar > button { min-width: 0; height: 42px; padding: 3px 2px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; border: 1px solid #ffffff2e; border-radius: 8px;
  background: #1b1d22e0; color: #fff; font: 500 13px/16px ui-sans-serif, system-ui, sans-serif; cursor: pointer; white-space: nowrap; box-shadow: 0 2px 10px #0006; }
#ex-bar > button i { font-style: normal; font-size: 14px; line-height: 16px; }
#ex-bar > button:hover { background: #2a2d33f0; }
#ex-bar > button.on { background: #f0b84a; color: #1b1b1b; border-color: #f0b84a; }
#ex-bar > button:focus-visible { outline: 2px solid #fff; outline-offset: -4px; }
#ex-menu { position: fixed; left: 16px; top: calc(155px + env(safe-area-inset-top, 0px)); z-index: 9; width: min(320px, calc(100vw - 78px)); box-sizing: border-box; padding: 4px; border-radius: 8px;
  background: #1b1d22f2; border: 1px solid #ffffff1f; box-shadow: 0 6px 24px #0009; display: none; }
#ex-menu.open { display: block; }
#ex-menu button { display: flex; width: 100%; align-items: baseline; gap: 6px; padding: 8px 8px; border: 0; border-radius: 5px; background: none; color: #fff; font: 14px ui-sans-serif, system-ui, sans-serif; text-align: left; cursor: pointer; }
#ex-menu button:hover, #ex-menu button:focus-visible { background: #ffffff1f; outline: none; }
#ex-menu button.on { color: #f0b84a; font-weight: 600; }
#ex-menu button small { color: #ffffff8c; font-size: 12.5px; font-weight: 400; }
#ex-menu hr { border: 0; border-top: 1px solid #ffffff24; margin: 4px 6px; }
#ex-routes { position: fixed; left: 16px; top: calc(160px + env(safe-area-inset-top, 0px)); z-index: 7; width: min(320px, calc(100vw - 32px)); box-sizing: border-box; max-height: calc(100vh - 240px); overflow-y: auto; background: #1b1d22f2; color: #fff; border: 1px solid #ffffff1f; border-radius: 10px; padding: 10px 12px; font-size: 13px; line-height: 1.4; box-shadow: 0 6px 24px #0009; display: none; }
#ex-routes.open { display: block; }
#ex-routes h3 { margin: 0 30px 2px 0; font-size: 15px; } #ex-routes p { margin: 0 0 8px; color: #ffffffb3; font-size: 12px; }
#ex-routes p.st { color: #fff; font-size: 12.5px; }
#ex-routes button.r { display: block; width: 100%; text-align: left; margin: 0 0 6px; padding: 8px 10px; border: 0; border-radius: 7px; background: #ffffff14; color: #fff; font: inherit; cursor: pointer; }
#ex-routes button.r:hover { background: #ffffff26; } #ex-routes button.r small { display: block; color: #ffffffa6; font-size: 11.5px; }
#ex-routes ol { margin: 6px 0 8px; padding: 0; list-style: none; } #ex-routes li { display: flex; gap: 8px; align-items: baseline; padding: 5px 2px; border-top: 1px solid #ffffff17; cursor: pointer; }
#ex-routes li i { flex: none; width: 20px; height: 20px; border-radius: 50%; background: #e2572b; color: #fff; font: 700 11px/20px ui-sans-serif, system-ui, sans-serif; text-align: center; }
#ex-routes li span { flex: 1; } #ex-routes li small { color: #ffffffa6; white-space: nowrap; }
#ex-routes li.here span { font-weight: 650; }
#ex-routes .back { border: 0; background: none; color: #f0b84a; font: inherit; padding: 0; margin: 0 0 6px; cursor: pointer; }
.ex-mk.stop i::after { content: attr(data-n); position: absolute; inset: 0; display: grid; place-items: center; color: #fff; font: 700 10px ui-sans-serif, system-ui, sans-serif; }
.ex-mk.stop i { background: #e2572b !important; border-color: #fff !important; width: 18px !important; height: 18px !important; left: -11px; top: -11px; }
.ex-mk.stop span { top: 14px; }
#ex-card .vis { margin: 0 0 8px; padding: 7px 9px; background: #ffffff14; border-radius: 6px; font-size: 12.5px; line-height: 1.4; }
#ex-card .vis p { margin: 3px 0 0; } #ex-card .vis small { display: block; margin-top: 4px; color: #ffffff99; font-size: 11px; } #ex-card .vis small a { font-size: 11px; }
#ex-card .vis b { display: inline-block; padding: 1px 8px; border-radius: 10px; font-weight: 650; font-size: 12px; } #ex-card .vis b.yes { background: #2f9e5b; } #ex-card .vis b.no { background: #b3302a; }
#ex-card a { font-size: 12px; color: #ffffffb3; text-decoration: underline; text-underline-offset: 2px; }
#ex-card a:hover { color: #fff; }
#ex-card a.tel { font-size: inherit; color: inherit; }
#ex-card .x, #ex-routes .x { position: absolute; right: 6px; top: 6px; width: 32px; height: 32px; border: 0; background: none; color: #ffffffa6;
  font-size: 20px; line-height: 1; cursor: pointer; padding: 0; }
#ex-card .x:hover, #ex-routes .x:hover { color: #fff; }
.ex-acts { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 0; }
#ex-card .ex-acts a, .ex-acts button { display: inline-flex; align-items: center; height: 30px; padding: 0 12px; box-sizing: border-box; border: 1px solid #ffffff2e; border-radius: 15px;
  background: #ffffff14; color: #fff; font: 500 12.5px ui-sans-serif, system-ui, sans-serif; text-decoration: none; cursor: pointer; white-space: nowrap; }
#ex-card .ex-acts a:hover, .ex-acts button:hover { background: #ffffff26; }
#ex-card .ex-stops { margin: 0 0 11px; padding: 0 0 2px; border-bottom: 1px solid #ffffff1f; }
.ex-stops .ex-tappa { margin: 0 28px 6px 0; font-size: 12px; color: #ffffffb3; }
.ex-step { display: flex; gap: 6px; margin: 0 0 7px; }
.ex-step button { flex: 1; height: 32px; padding: 0 8px; border: 0; border-radius: 16px; background: #e2572b; color: #fff; font: 600 12.5px ui-sans-serif, system-ui, sans-serif; cursor: pointer; }
.ex-step button:disabled { background: #ffffff1a; color: #ffffff59; cursor: default; }
.ex-stops .ex-next { margin: 0 0 8px; font-size: 12px; line-height: 1.4; color: #ffffffb3; }
#ex-toast { position: fixed; left: 50%; top: calc(160px + env(safe-area-inset-top, 0px)); transform: translateX(-50%); z-index: 40; max-width: calc(100vw - 48px);
  padding: 7px 14px; border-radius: 16px; background: #1b1d22f2; color: #fff; font-size: 13px; box-shadow: 0 4px 16px #0009; pointer-events: none; opacity: 0; transition: opacity .2s; }
#ex-toast.on { opacity: 1; }
#ex-routes p.note { color: #ffd98a; } #ex-routes button.r small.note { color: #ffd98acc; }
#ex-routes button.r.mine { background: #e2572b2e; box-shadow: inset 0 0 0 1px #e2572b99; }
#ex-routes li .mi, #ex-routes li .warn { display: block; margin-top: 1px; color: #ffffffa6; font-size: 11.5px; } #ex-routes li .warn { color: #ffb35c; }
#ex-routes .mc { display: flex; gap: 3px; flex: none; align-self: center; }
#ex-routes .mc button { width: 28px; height: 28px; padding: 0; border: 1px solid #ffffff2e; border-radius: 6px; background: #ffffff14; color: #fff; font: 13px ui-sans-serif, system-ui, sans-serif; cursor: pointer; }
#ex-routes .mc button:disabled { opacity: .3; cursor: default; } #ex-routes .mc button:hover:not(:disabled) { background: #ffffff2e; }
#ex-routes select { font: inherit; font-size: 12px; padding: 1px 3px; border-radius: 5px; border: 1px solid #ffffff2e; background: #2a2d33; color: #fff; }
#ex-routes .row { display: flex; gap: 6px; align-items: center; margin: 0 0 8px; font-size: 12.5px; }
.ex-acts button[aria-pressed="true"] { background: #f0b84a; color: #1b1b1b; border-color: #f0b84a; }
#ex-card .tl { margin: 0 0 9px; } #ex-card .tl-h { margin: 0 0 5px; font-size: 11px; text-transform: uppercase; letter-spacing: .1em; color: #f0b84a; }
#ex-card .tl-y { display: flex; gap: 4px; overflow-x: auto; padding: 0 0 3px; scrollbar-width: thin; }
#ex-card .tl-y button { flex: none; height: 26px; padding: 0 9px; border: 1px solid #ffffff2e; border-radius: 13px; background: #ffffff14; color: #fff; font: 600 12px ui-sans-serif, system-ui, sans-serif; font-variant-numeric: tabular-nums; cursor: pointer; }
#ex-card .tl-y button[aria-selected="true"] { background: #f0b84a; border-color: #f0b84a; color: #1b1b1b; }
#ex-card .tl-b { margin: 5px 0 0; padding: 7px 9px; background: #ffffff14; border-radius: 6px; font-size: 12.5px; line-height: 1.45; }
#ex-card .tl-b p { margin: 2px 0 0; } #ex-card .tl small { display: block; margin-top: 4px; color: #ffffff99; font-size: 11px; } #ex-card .tl small a { font-size: 11px; }
#ex-routes .ex-lang { align-items: center; gap: 5px; margin-top: 9px; } #ex-routes .ex-lang span { font-size: 14px; margin-right: 1px; }
#ex-routes .ex-lang button { height: 26px; padding: 0 9px; font-size: 12px; }
@media (max-width: 640px) {
  #ex-card { left: 8px; right: 8px; top: auto; bottom: 64px; width: auto; max-height: 45vh; }
  #ex-routes { left: 8px; right: 8px; top: auto; bottom: 64px; width: auto; max-height: 38vh; box-sizing: border-box; }
  #ex-bar { width: min(320px, calc(100vw - 32px)); }   /* under the zoom buttons: the whole width */
  body.ex-under #ex-card, body.ex-under #ex-routes, body.ex-typing #ex-card, body.ex-typing #ex-routes, body.ex-menu #ex-card, body.ex-menu #ex-routes { display: none !important; }   /* one panel at a time */
  body.ex-sheet #sky, body.ex-sheet #wx { visibility: hidden; }   /* under a bottom sheet: not showing through it */
}
`;

import { t, tc, lang, locale, speechLang, num, hm as zhm, dt, date, LANGS, NAMES, switchLang, textReady } from './i18n.js?v=20261121b';

// the kinds of the map's own names (world.json labels), in the search results
const KIND_IT = { city: t('kind.city'), town: t('kind.city'), village: t('kind.village'), suburb: t('kind.suburb'), quarter: t('kind.suburb'), neighbourhood: t('kind.suburb'),
  hamlet: t('kind.hamlet'), locality: t('kind.locality'), isolated_dwelling: t('kind.locality'), castle: t('kind.castle') };
// a place's texts in the page's language (i18n/<lang>.json), the Italian of places.json where there is no translation
const pt = (p, k) => tc(`place.${p.id}.${k}`, p[k]);
const pn = p => pt(p, 'name');
// a source's label: names stay as they are; "Wikipedia (in tedesco)" says its language in the page's
const srcLabel = s => (lang !== 'it' && /^Wikipedia \(in tedesco\)$/.test(s) ? t('src.wikipedia.de') : s);

// a filter of "Cosa vedere": a category (small points left out) or 'tag:<tag>' (places.json `tags`: coperto, bambini)
const inCat = (p, c) => c.startsWith('tag:') ? Array.isArray(p.tags) && p.tags.includes(c.slice(4)) : p.cat === c && !p.minor;
const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const el = (tag, attrs = {}, text) => {
  const e = document.createElement(tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (text != null) e.textContent = text;
  return e;
};
// Swiss phone numbers in the texts ("091 829 11 39", "+41 91 825 21 31") become tel: links
const TEL = /(^|[^\d+])((?:\+41|0041|0)\s?(\d{2})\s?(\d{3})\s?(\d{2})\s?(\d{2}))(?!\d)/g;
function rich(tag, cls, text) {
  const e = el(tag, cls ? { class: cls } : {});
  let i = 0;
  for (const m of text.matchAll(TEL)) { const s = m.index + m[1].length; e.append(text.slice(i, s), el('a', { href: 'tel:+41' + m[3] + m[4] + m[5] + m[6], class: 'tel' }, m[2])); i = s + m[2].length; }
  e.append(text.slice(i));
  return e;
}
const fmtM = m => m < 950 ? Math.max(10, Math.round(m / 10) * 10) + ' m' : num(m / 1000, 1) + ' km';
const fmtWalk = d => d.air ? t('walk.air', { d: fmtM(d.m) }) : t('walk.time', { d: fmtM(d.m), min: d.min });
// directions in the phone's own map app: Apple Maps on iPhone and iPad, Google Maps (app or web) everywhere else
const APPLE = /iP(hone|ad|od)/.test(navigator.userAgent) || (/Mac/.test(navigator.platform) && navigator.maxTouchPoints > 1);
const dirUrl = p => APPLE ? `https://maps.apple.com/?daddr=${p.lat},${p.lon}&dirflg=w` : `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}&travelmode=walking`;
const VIEW0 = /^#[@g]/.test(location.hash);     // read before the viewer starts writing its view into the hash: a reload keeps its view

export async function initExplore({ world, view, map, clamp, draw, halt, toScreen }) {
  const Z = world.native_zoom;
  let places = [];
  try {
    const r = await ((window.__pre && window.__pre.places) || fetch('places.json', { cache: 'no-cache' }));   // asked for in index.html's <head>
    if (r.ok) places = (await r.json()).places || [];
    await textReady;                                       // the places' texts in the page's language (asked for in <head> too)
    const M = world.enu2px, O = world.origin_lv95;        // place the markers with this view's own projection
    if (M && O) for (const p of places) if (p.e != null) { const a = p.e - O[0], b = p.n - O[1], c = (p.h || O[2]) - O[2]; p.x = M[0][0] * a + M[0][1] * b + M[0][2] * c; p.y = M[1][0] * a + M[1][1] * b + M[1][2] * c; }
  } catch { /* search still works on labels alone */ }

  document.head.appendChild(el('style')).textContent = CSS;
  const phone = () => matchMedia('(max-width: 640px)').matches;
  let geoP = null, geoM = null;                                      // geo.js, loaded on first use
  const geo = () => geoP || (geoP = import('./geo.js?v=20261121b').then(m => { geoM = m; return new m.Geo(world, lang); }));
  const embed = new URLSearchParams(location.search).has('incorpora');   // inside someone else's page (index.html hides the rest)

  // ---------- markers ----------
  const layer = el('div', { id: 'ex-markers' });
  map.appendChild(layer);
  const labelNames = new Set(world.labels.map(l => norm(l.name)));
  const markers = places.map(p => {
    const m = el('div', { class: 'ex-mk' });
    const dot = el('i');
    // small points (playgrounds, the outdoor gym, the pool): a little badge with their sign, shown when their menu entry is picked
    if (p.minor) { m.classList.add('mini'); dot.dataset.ic = (p.tags || []).includes('giochi') ? '🛝' : (p.tags || []).includes('sport') ? '💪' : '🏊'; }
    m.appendChild(dot);
    m.appendChild(el('span', {}, pn(p)));
    layer.appendChild(m);
    const dup = labelNames.has(norm(p.name));                      // the viewer already labels the castles
    if (dup) m.classList.add('dup');
    return {
      p, el: m, sx: 0, sy: 0, shown: false, dup, w: 0,
      minZ: Z - (p.minor ? 2.4 : p.tier === 1 ? 4.2 : 3.2),                       // main sights from further out
      nameZ: Z - (p.tier === 1 ? 2.6 : 1.7),
    };
  });
  for (const m of markers) m.w = m.el.lastChild.offsetWidth || pn(m.p).length * 7 + 14;   // label widths, for decluttering
  // the viewer's own labels: the castles named as their places, the town as it is called in the page's language
  if (window.__relabel) { const byName = new Map(places.map(p => [norm(p.name), p])); window.__relabel((name, kind) => { const p = byName.get(norm(name)); return p && pn(p) !== p.name ? pn(p) : (kind === 'town' || kind === 'city') && name === 'Bellinzona' ? t('city') : name; }); }   // a name with no translation stays as the map writes it
  let selected = null, hovered = null, lastKey = '', cat = '', route = null;      // cat: category filter ('tag:<tag>' for a tag); route: the itinerary being shown
  let editing = false;    // the visitor's own itinerary is being built: a tap on a place adds it
  let mode = '';          // what the sheet under the buttons shows: 'routes', 'near' (Vicino a me), 'open' (Aperti adesso), 'hello' (first visit); '' = closed
  let stopIdx = -1;       // the itinerary stop last opened (0-based)
  let refocus = '';       // data-f of the sheet's control to give the focus back to after a redraw
  let openIds = null;     // "Aperti adesso": the places open at the map's moment
  let here = null;        // the visitor, when known and inside the map: { x, y, a, b (m from the origin), acc (m) }
  let walks = null;       // shortest walks from the visitor (geo.js), or null
  let pinAt = null;       // the address picked in the search: { x, y }
  const me = el('div', { class: 'ex-me' }), pin = el('div', { class: 'ex-pin' });
  me.append(el('b'), el('i')); pin.append(el('i'), el('span'));
  layer.append(me, pin);
  const M0 = world.enu2px, KX = Math.hypot(M0[0][0], M0[0][1]), KY = Math.hypot(M0[1][0], M0[1][1]);   // px per metre of ground along screen x and y
  // shared bikes and charging points (mobility.js): a layer is shown as cat 'mob:<id>'; mobSel is its marker whose card is open
  let mob = null, mobP = null, mobSel = null;
  const MOB = [['mob:bici', '🚲', t('mob.bici'), t('mob.bici.s')], ['mob:ricarica', '🔌', t('mob.ricarica'), t('mob.ricarica.s')]];
  const mobLayer = () => (cat.startsWith('mob:') ? cat.slice(4) : '');
  function wakeMob() {                                   // nothing is asked of those services before the list is opened
    if (document.body.classList.contains('era')) return;
    if (mob) mob.wake();
    else if (!mobP) mobP = import('./mobility.js?v=20261121b').then(M => { mob = M.initMobility({ geo, layer, toScreen, active: mobLayer, onChange: mobChanged }); mob.wake(); }).catch(() => { /* no such layers */ });
  }
  function mobChanged() {                                // live data in, changed or gone (stale, failed, time machine)
    if (mobLayer() && !mob.has(mobLayer())) { cat = ''; drawChips(); }   // the layer has nothing current: back to the places
    if (mobSel && !fillMob()) closeMob();
    if (menu.classList.contains('open')) fillMenu();
    layout(true);
  }

  function layout(force) {
    const [ox, oy] = toScreen(0, 0);
    const key = `${ox.toFixed(1)},${oy.toFixed(1)},${view.z.toFixed(3)},${map.clientWidth},${map.clientHeight}`;
    if (!force && key === lastKey) return;
    lastKey = key;
    const w = map.clientWidth, h = map.clientHeight;
    // small points (playgrounds…) only when the visitor picks their entry in the menu (the owner, 18 Nov 2026); while building an itinerary all places stay tappable
    const wanted = m => route ? m.stop > 0 || m.p.id === route.from || (editing && !m.p.minor && view.z >= m.minZ)
      : openIds ? openIds.has(m.p.id) : cat ? inCat(m.p, cat) : !m.p.minor && view.z >= m.minZ;
    for (const m of markers) {
      const [sx, sy] = toScreen(m.p.x, m.p.y);
      m.sx = sx; m.sy = sy;
      m.shown = (m === selected || wanted(m)) && sx > -40 && sy > -40 && sx < w + 40 && sy < h + 40;
      m.el.style.display = m.shown ? '' : 'none';
      if (!m.shown) continue;
      m.el.style.transform = `translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px)`;
    }
    if (mob) mob.layout(mobLayer(), w, h);
    // the visitor's dot with its accuracy ring (a circle on the ground is an ellipse on screen), and the address pin
    for (const [e, q] of [[me, here], [pin, pinAt]]) {
      e.style.display = q ? 'block' : 'none';
      if (q) { const [sx, sy] = toScreen(q.x, q.y); e.style.transform = `translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px)`; }
    }
    if (here) { const s = Math.pow(2, view.z - Z), r = me.firstChild; r.style.width = Math.min(4000, 2 * here.acc * KX * s).toFixed(1) + 'px'; r.style.height = Math.min(4000, 2 * here.acc * KY * s).toFixed(1) + 'px'; }
    // name labels: greedy declutter, most important first (selected, hovered, main sights)
    const rank = m => (m === selected ? 0 : m === hovered ? 1 : route && m.stop ? 1.5 : 1 + m.p.tier);
    const placed = [], hits = b => placed.some(q => b[0] < q[2] && b[2] > q[0] && b[1] < q[3] && b[3] > q[1]);
    // a name may cover the dot of a lesser place (it is drawn above it) but not one that ranks as high
    const dots = markers.filter(k => k.shown).map(k => { const r = k.stop ? 11 : 7; return [k.sx - r, k.sy - r, k.sx + r, k.sy + r, k, rank(k)]; });
    for (const m of markers.filter(k => k.shown && !k.dup).sort((a, b) => rank(a) - rank(b))) {
      const forced = m === selected || m === hovered, rm = rank(m);
      let ok = forced || view.z >= m.nameZ || !!cat || !!openIds || (route && m.stop > 0);
      const box = [m.sx - m.w / 2 - 3, m.sy + 9, m.sx + m.w / 2 + 3, m.sy + 30];
      if (ok && !forced) ok = !hits(box) && !dots.some(d => d[4] !== m && d[5] <= rm && box[0] < d[2] && box[2] > d[0] && box[1] < d[3] && box[3] > d[1]);
      if (ok) placed.push(box);
      m.el.classList.toggle('named', ok);
    }
  }
  // Follows the viewer's own rAF redraws without needing a hook inside its render loop.
  (function tick() { layout(false); requestAnimationFrame(tick); })();

  function hit(cx, cy, radius) {
    const r = map.getBoundingClientRect();
    const x = cx - r.left, y = cy - r.top;
    if (mob && mobLayer()) { const k = mob.hit(x, y, radius); if (k) return k; }
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
  function flyTo(x, y, z, jump) {
    stopFly();
    if (halt) halt();
    const x0 = view.x, y0 = view.y, z0 = view.z;
    const s0 = Math.pow(2, z0 - Z);
    const distPx = Math.hypot(x - x0, y - y0) * s0;                     // on-screen distance at the starting zoom
    const span = Math.max(200, Math.min(map.clientWidth, map.clientHeight));
    const dip = Math.max(0, Math.min(2.5, Math.log2(distPx / span)));   // zoom out for long hops only
    const dur = Math.max(450, Math.min(1800, 500 + 260 * Math.log2(1 + distPx / span) + 200 * Math.abs(z - z0)));
    if (jump || matchMedia('(prefers-reduced-motion: reduce)').matches || distPx + Math.abs(z - z0) < 1e-3) {
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

  // ---------- links: ?luogo=<id> opens a card, ?itinerario=<id> an itinerary, &tappa=<n> one of its stops ----------
  // ?mio=<id>,<id>.<min>,…&partenza=stazione: the visitor's own itinerary (a visit time only where it is not the default)
  const KEYS = ['luogo', 'itinerario', 'mio', 'partenza', 'tappa'];
  const readUrl = () => { const q = new URLSearchParams(location.search); return { luogo: q.get('luogo') || '', itinerario: q.get('itinerario') || '', mio: q.get('mio') || '', partenza: q.get('partenza') || '', tappa: +q.get('tappa') || 0 }; };
  const atStop = () => !!(route && selected && stopIdx >= 0 && route.stops[stopIdx] && route.stops[stopIdx].id === selected.p.id);
  const routeState = () => route.mine ? { mio: mineCode(), partenza: mine.start === 'stazione' ? 'stazione' : '' } : { itinerario: route.id };
  const urlState = () => ({ luogo: '', itinerario: '', mio: '', partenza: '', tappa: 0, ...(route ? { ...routeState(), tappa: atStop() ? stopIdx + 1 : 0 } : { luogo: selected ? selected.p.id : '' }) });
  const sameUrl = (a, b) => KEYS.every(k => (a[k] || '') === (b[k] || ''));
  const depth = s => s.tappa ? 2 : s.luogo || s.itinerario || s.mio ? 1 : 0;
  const query = s => { const q = new URLSearchParams(location.search); for (const k of KEYS) q.delete(k); for (const k of KEYS) if (s[k]) q.set(k, s[k]); return q.toString().replace(/%2C/gi, ','); };
  const linkFor = s => location.origin + location.pathname + '?' + query(s).replace(/(^|&)(incorpora|evento)=[^&]*/g, '').replace(/^&/, '');   // the shared link: no view in the hash, the place decides it
  let applying = false;
  // a new history entry when going deeper (nothing -> card -> itinerary stop), so Back closes what was opened; otherwise replace
  function syncUrl() {
    if (applying) return;
    const cur = readUrl(), nu = urlState();
    if (sameUrl(cur, nu)) return;
    const q = query(nu);
    try { history[depth(nu) > depth(cur) ? 'pushState' : 'replaceState'](history.state, '', location.pathname + (q ? '?' + q : '') + location.hash); } catch { /* sandboxed frame */ }
  }

  // ---------- card ----------
  const card = el('aside', { id: 'ex-card', role: 'dialog', 'aria-live': 'polite' });
  document.body.appendChild(card);
  const credits = document.getElementById('credits');
  function placeCard() {                                    // on phones the card and the itineraries are bottom sheets above the credits
    card.style.bottom = phone() && credits ? (credits.offsetHeight + 8) + 'px' : '';
    if (typeof routesBox !== 'undefined') routesBox.style.bottom = card.style.bottom;
  }
  const nowMs = () => window.__now ? window.__now() : Date.now();    // the moment the map shows: the time machine moves it
  // Is the place open at this moment in Bellinzona (or at `at`, ms)? Only when the published hours allow a plain answer; otherwise null.
  function openNow(v, at) {
    if (!v.rows || !v.rows.length) return null;
    const pt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Zurich', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(at ?? nowMs()));
    const g = k => pt.find(x => x.type === k).value, md = g('month') + '-' + g('day'), ymd = g('year') + '-' + md, hm = g('hour') + ':' + g('minute');
    const wd = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(g('weekday').toLowerCase());
    if ((v.shut || []).some(s => ymd >= s[0] && ymd <= s[1])) return { open: false, label: t('open.shutdays') };
    const inSeason = r => r.from <= r.to ? md >= r.from && md <= r.to : md >= r.from || md <= r.to;
    const D = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const onDay = d => { if (!d) return false; const [a, b] = d.split('-'), i = D.indexOf(a), j = D.indexOf(b || a); return i <= j ? wd >= i && wd <= j : wd >= i || wd <= j; };
    const season = v.rows.filter(inSeason);
    if (!season.length) return null;
    if (season.some(r => r.shut)) return { open: false, label: t('open.shutseason') };
    const today = season.filter(r => r.open && onDay(r.days));
    if (!today.length) return season.some(r => r.open) ? { open: false, label: t('open.today') } : null;
    const r = today.find(x => hm >= x.open && hm < x.close);
    if (r) return { open: true, label: t('open.until', { t: r.close }), until: r.close };
    const later = today.find(x => hm < x.open);
    // now: "closed now"; on arrival (warnAt): "closed when you get there"
    return { open: false, label: later ? t('open.opens', { t: later.open }) : t('open.closed'), arrive: later ? t('warn.opens', { t: later.open }) : t('warn.closed') };
  }

  // walking distance from the visitor to a place: on the network when known, otherwise as the crow flies
  const O = world.origin_lv95;
  function fromHere(p) {
    if (!here || !p || p.e == null) return null;
    const a = p.e - O[0], b = p.n - O[1];
    if (walks) return walks.to(a, b);
    return walksTried ? { m: Math.hypot(a - here.a, b - here.b), air: true } : null;
  }
  const placeById = id => places.find(p => p.id === id);
  // the stop bar of an itinerary: previous / next stop, and how far the next one is
  function stepBox(inCard) {
    const n = route.stops.length, k = stopIdx, box = el('div', { class: 'ex-stops' }), bar = el('div', { class: 'ex-step' });
    const prev = el('button', { type: 'button' }, t('step.prev')), next = el('button', { type: 'button' }, k < 0 ? t('step.start') : t('step.next'));
    prev.disabled = k <= 0; next.disabled = k >= n - 1;
    prev.onclick = () => goStop(k - 1); next.onclick = () => goStop(k + 1);
    bar.append(prev, next);
    if (inCard || k >= 0) box.appendChild(el('p', { class: 'ex-tappa' }, inCard ? t('step.of.card', { title: route.title, k: k + 1, n }) : t('step.of', { k: k + 1, n })));
    box.append(bar, el('p', { class: 'ex-next' }, nextText()));
    return box;
  }
  function nextText() {
    const k = stopIdx, nx = route.stops[k + 1];
    if (!nx) return t('next.last');
    const d = fromHere(placeById(nx.id));
    const inCard = selected && atStop();
    if (k < 0 && route.from != null && route.fromText) return t('next.first.' + route.fromText, { name: nx.name, min: nx.min }) + (d && route.from ? ' · ' + t('next.you', { d: fmtWalk(d) }) : '');
    return (k < 0 ? t('next.start', { name: nx.name }) : t(inCard ? 'next.next.here' : 'next.next.stop', { name: nx.name, min: nx.min, k: k + 1 })) + (d ? ' · ' + t('next.you', { d: fmtWalk(d) }) : '');
  }

  function openCard(m, quiet) {                             // quiet: the same card again (refresh), the viewer's panels left as they are
    if (mode === 'hello') setMode('');
    if (typeof routesBox !== 'undefined') routesBox.style.visibility = 'hidden';
    if (selected) selected.el.classList.remove('sel');
    if (mobSel) { mobSel.el.classList.remove('sel'); mobSel = null; }
    selected = m;
    m.el.classList.add('sel');
    const p = m.p;
    if (voice.id && voice.id !== p.id) stopVoice();
    if (route && m.stop) { if (!route.stops[stopIdx] || route.stops[stopIdx].id !== p.id) stopIdx = m.stop - 1; } else if (!route) stopIdx = -1;
    card.textContent = '';
    const x = el('button', { class: 'x', 'aria-label': t('close') }, '×');
    x.onclick = closeCard;
    card.appendChild(x);
    if (route && m.stop) card.appendChild(stepBox(true));
    const name = pn(p);
    if (p.type) card.appendChild(el('p', { class: 'k' }, pt(p, 'type')));
    card.appendChild(el('h2', {}, name));
    if (p.period) card.appendChild(el('p', { class: 'when' }, pt(p, 'period')));
    const acts = el('div', { class: 'ex-acts' });
    if (p.lat != null) acts.appendChild(el('a', { href: dirUrl(p), target: '_blank', rel: 'noopener' }, t('card.dir')));
    acts.appendChild(el('a', { class: 'v3d', href: '3d.html?p=' + encodeURIComponent(p.id) + '&lingua=' + lang, ...(embed ? { target: '_blank', rel: 'noopener' } : {}) }, t('card.3d')));   // the 3D view is in Italian for now: it gets the language for later
    const sh = el('button', { type: 'button' }, t('card.share'));
    sh.onclick = () => share(/bellinzon/i.test(name) ? name : name + ' · ' + t('city'), linkFor(atStop() ? { ...routeState(), tappa: stopIdx + 1 } : { luogo: p.id }));
    acts.appendChild(sh);
    if (SPEECH) { const vb = el('span', { class: 'ex-voice', style: 'display:contents', 'data-id': p.id }); acts.appendChild(vb); }
    if (p.e != null) {                                        // into (or out of) the visitor's own itinerary
      const b = el('button', { type: 'button' }), lab = () => { b.textContent = mine.ids.includes(p.id) ? t('card.mine.remove') : t('card.mine.add'); };
      b.onclick = () => { if (mine.ids.includes(p.id)) removeStop(p.id); else addStop(p.id); lab(); };
      lab(); acts.appendChild(b);
    }
    card.appendChild(acts);
    if (p.desc) card.appendChild(rich('p', 'd', pt(p, 'desc')));
    if (Array.isArray(p.timeline) && p.timeline.length) card.appendChild(storyBox(p));
    if (p.visit) {                                            // opening hours and prices as published, with the date they were checked
      const v = p.visit, box = el('div', { class: 'vis' }), st = openNow(v);
      if (st) box.appendChild(el('b', { class: st.open ? 'yes' : 'no' }, st.label));
      box.appendChild(rich('p', '', tc(`place.${p.id}.visit.text`, v.text)));
      if (v.prices.length) box.appendChild(el('p', {}, v.prices.map((x, i) => { const label = tc(`place.${p.id}.visit.price.${i}`, x[0]); return x[1] === 0 ? t('price.free', { label }) : t('price.chf', { label, p: num(x[1], Number.isInteger(x[1]) ? 0 : 2) }); }).join(' · ')));
      if (v.extra) box.appendChild(rich('p', '', tc(`place.${p.id}.visit.extra`, v.extra)));
      const src = el('small'); src.appendChild(el('a', { href: v.source.url, target: '_blank', rel: 'noopener' }, srcLabel(v.source.label))); src.appendChild(document.createTextNode(' · ' + t('card.checked', { date: date(v.checked) })));
      box.appendChild(src); card.appendChild(box);
    }
    if (p.officials) {                                        // Palazzo Civico: who sits in the Municipio and in the Consiglio comunale
      const o = p.officials, c = o.consiglio;
      const sec = (title, open) => { const d = el('details', { class: 'off' }); if (open) d.open = true; d.appendChild(el('summary', {}, title)); card.appendChild(d); return d; };
      const mu = sec(t('off.municipio', { n: o.municipio.length }), true);
      for (const m of o.municipio) { const r = el('p', {}); r.appendChild(el('b', {}, m.name)); r.appendChild(document.createTextNode(' · ' + (m.role === 'Municipale' ? '' : tc('officials.role.' + m.role, m.role) + ' · ') + m.party)); if (m.dicastero) r.appendChild(el('small', {}, tc('officials.dicastero.' + m.dicastero, m.dicastero))); mu.appendChild(r); }
      const cc = sec(t('off.consiglio', { n: c.seats }), false);
      cc.appendChild(el('p', {}, t('off.president', { name: c.president }) + (c.vice.length ? ' · ' + t('off.vice', { names: c.vice.join(', ') }) : '')));
      for (const [g, names] of c.groups) { const r = el('p', {}); r.appendChild(el('b', {}, g + ' (' + names.length + ')')); r.appendChild(el('small', {}, names.join(', '))); cc.appendChild(r); }
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich' }).format(new Date(nowMs())), nx = c.sessions.filter(x => x[0] >= today).slice(0, 2);
      if (nx.length) cc.appendChild(el('p', {}, t('off.sessions', { list: nx.map(x => x[1] ? t('off.session.at', { date: date(x[0]), time: x[1] }) : date(x[0])).join(', ') }) + ' · ' + tc('officials.room.' + c.room, c.room)));
      card.appendChild(el('a', { href: o.source.url, target: '_blank', rel: 'noopener' }, t('off.source', { label: o.source.label, date: date(o.retrieved) })));
      card.appendChild(el('br', {}));
    }
    if (window.__cardExtra) { try { for (const row of window.__cardExtra(p)) card.appendChild(el('p', { class: 'live' }, row)); } catch (err) { /* live rows are optional */ } }
    if (p.source && p.source.url) {
      card.appendChild(el('a', { href: p.source.url, target: '_blank', rel: 'noopener' }, t('card.source', { label: srcLabel(p.source.label || 'Wikipedia') })));
    }
    card.setAttribute('aria-label', name);
    card.classList.add('open');
    card.scrollTop = 0;
    renderVoice();
    placeCard();
    layout(true);
    if (!quiet) panel();
    syncUrl();
  }
  // a place's history in steps: one chip per date, the last (today) first shown; arrows move along
  function storyBox(p) {
    // each step with its texts in the page's language (keyed by its place in places.json's list)
    const tl = p.timeline.map((x, i) => x && { year: x.year, ...Object.fromEntries(['year', 'title', 'text'].filter(k => x[k] != null).map(k => [k, typeof x[k] === 'string' ? tc(`place.${p.id}.timeline.${i}.${k}`, x[k]) : x[k]])) }).filter(x => x && x.year != null);
    const box = el('div', { class: 'tl' }), ys = el('div', { class: 'tl-y', role: 'tablist', 'aria-label': t('story.aria') }), body = el('div', { class: 'tl-b', role: 'tabpanel' });
    if (!tl.length) return box;
    const pick = (k, focus) => {
      [...ys.children].forEach((b, j) => { b.setAttribute('aria-selected', j === k); b.tabIndex = j === k ? 0 : -1; });
      const b = ys.children[k]; if (focus) b.focus();
      ys.scrollLeft = Math.max(0, b.offsetLeft - ys.clientWidth / 2 + b.offsetWidth / 2);
      body.textContent = '';
      if (tl[k].title) body.appendChild(el('b', {}, tl[k].title));
      if (tl[k].text) body.appendChild(rich('p', '', tl[k].text));
    };
    tl.forEach((x, k) => { const b = el('button', { type: 'button', role: 'tab' }, String(x.year)); b.onclick = () => pick(k); ys.appendChild(b); });
    ys.addEventListener('keydown', e => { const k = [...ys.children].indexOf(document.activeElement), d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (d && k >= 0) { e.preventDefault(); e.stopPropagation(); pick(Math.max(0, Math.min(tl.length - 1, k + d)), true); } });
    box.append(el('p', { class: 'tl-h' }, t('story.title')), ys, body);
    const s = p.timeline_source;
    if (s && s.url) { const sm = el('small'); sm.append(t('card.src') + ' ', el('a', { href: s.url, target: '_blank', rel: 'noopener' }, srcLabel(s.label || s.url))); box.appendChild(sm); }
    requestAnimationFrame(() => pick(tl.length - 1));            // after layout, so the last chip can be scrolled into view
    pick(tl.length - 1);
    return box;
  }
  function closeCard() {
    if (typeof routesBox !== 'undefined') routesBox.style.visibility = '';
    stopVoice();
    if (mobSel) closeMob();
    if (!selected) return;
    selected.el.classList.remove('sel');
    selected = null;
    card.classList.remove('open');
    if (mode) renderSheet();                                  // back to the list it came from, brought up to date
    layout(true);
    syncUrl();
  }

  // the card of a bike station or a charging point: live, redrawn when the data move on, closed when they go
  function openMob(m) {
    if (selected) closeCard();
    if (mobSel && mobSel !== m) mobSel.el.classList.remove('sel');
    mobSel = m; m.el.classList.add('sel');
    if (!fillMob()) { closeMob(); return; }
    card.classList.add('open'); card.scrollTop = 0;
    placeCard(); layout(true); panel();
  }
  function fillMob() {
    const nodes = mob && mobSel ? mob.card(mobSel, dirUrl) : null;
    if (!nodes) return false;
    const top = card.scrollTop, x = el('button', { class: 'x', 'aria-label': t('close') }, '×');
    x.onclick = closeMob;
    card.textContent = ''; card.append(x, ...nodes); card.setAttribute('aria-label', mob.name(mobSel)); card.scrollTop = top;
    return true;
  }
  function closeMob() { if (!mobSel) return; mobSel.el.classList.remove('sel'); mobSel = null; card.classList.remove('open'); layout(true); }

  // ---------- share: the phone's own share sheet, or the link copied ----------
  const toastEl = el('div', { id: 'ex-toast', role: 'status' });
  document.body.appendChild(toastEl);
  let toastT = 0;
  function toast(t) { toastEl.textContent = t; toastEl.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('on'), 1800); }
  async function share(title, url) {
    if (navigator.share) { try { await navigator.share({ title, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    copyLink(url);
  }
  async function copyLink(url, msg = t('toast.link')) {
    try { await navigator.clipboard.writeText(url); toast(msg); return; } catch { /* not allowed here: the old way */ }
    const ta = el('textarea', { readonly: '' }); ta.value = url; ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { /* no clipboard at all */ }
    ta.remove();
    if (ok) toast(msg); else window.prompt(t('prompt.copy'), url);
  }

  // ---------- audioguide: the browser's own voice reads the card (nothing is downloaded) ----------
  // Sentence by sentence: some voices stop after ~15 s of one utterance, and a pause that cancels and later restarts the
  // sentence works on every browser (speechSynthesis.pause() does not on Android).
  const SPEECH = 'speechSynthesis' in window && typeof SpeechSynthesisUtterance === 'function';
  const voice = { id: null, parts: [], i: 0, paused: false, tok: 0, u: null };
  // a voice of the page's language (its own country's first: de-CH, fr-CH, it-CH / it-IT, en-GB): none, and the audioguide is not
  // offered, rather than German read by an Italian voice. While the browser has not said which voices it has (an empty list), only
  // the Italian page offers it, as it always did: the language alone usually picks the voice
  let itVoice = null, voicesKnown = false, readStops = false;   // readStops: "leggi alla tappa" in an itinerary
  const pickVoice = () => {
    try {
      const vs = speechSynthesis.getVoices(), mine = vs.filter(v => String(v.lang).toLowerCase().replace('_', '-').startsWith(lang + '-') || String(v.lang).toLowerCase() === lang);
      const own = new RegExp('^' + speechLang.replace('-', '[-_]'), 'i'), ch = new RegExp('^' + lang + '[-_]CH', 'i');
      voicesKnown = vs.length > 0;
      itVoice = mine.find(v => ch.test(v.lang) && v.localService) || mine.find(v => own.test(v.lang) && v.localService) || mine.find(v => v.localService) || mine[0] || null;
    } catch { itVoice = null; }
  };
  const voiceOk = () => SPEECH && (!!itVoice || (!voicesKnown && lang === 'it'));
  if (SPEECH) { pickVoice(); try { speechSynthesis.addEventListener('voiceschanged', () => { const had = voiceOk(); pickVoice(); if (had !== voiceOk()) { renderVoice(); if (mode === 'routes') renderSheet(); } }); } catch { /* old Safari */ } addEventListener('pagehide', () => stopVoice()); }
  function sayNext(tok) {
    if (tok !== voice.tok) return;
    if (voice.i >= voice.parts.length) { stopVoice(); return; }
    const u = voice.u = new SpeechSynthesisUtterance(voice.parts[voice.i]);
    u.lang = itVoice ? itVoice.lang : speechLang; if (itVoice) try { u.voice = itVoice; } catch { /* the language alone */ }
    u.onend = u.onerror = () => { if (tok === voice.tok && !voice.paused) { voice.i++; sayNext(tok); } };
    speechSynthesis.speak(u);
  }
  function speak(p) {
    if (!voiceOk() || !p) return;
    stopVoice();
    const text = pn(p) + '. ' + (p.desc ? pt(p, 'desc') : ''), parts = [];
    for (const s of text.match(/[^.!?;]+[.!?;]*\s*/g) || []) { if (parts.length && parts[parts.length - 1].length + s.length < 200) parts[parts.length - 1] += s; else parts.push(s); }
    Object.assign(voice, { id: p.id, parts, i: 0, paused: false });
    sayNext(++voice.tok); renderVoice();
  }
  function pauseVoice() { voice.paused = true; voice.tok++; speechSynthesis.cancel(); renderVoice(); }
  function resumeVoice() { voice.paused = false; sayNext(++voice.tok); renderVoice(); }
  function stopVoice() { if (!voice.id) return; voice.id = null; voice.paused = false; voice.tok++; try { speechSynthesis.cancel(); } catch { /* gone */ } renderVoice(); }
  function renderVoice() {                                    // the card's buttons: Ascolta, or Pausa / Riprendi and stop
    const vb = card.querySelector('.ex-voice'); if (!vb) return;
    const id = vb.dataset.id, on = voice.id === id, had = vb.contains(document.activeElement);
    vb.textContent = '';
    if (!voiceOk()) return;
    const b = el('button', { type: 'button', 'aria-label': t(!on ? 'voice.listen.aria' : voice.paused ? 'voice.resume.aria' : 'voice.pause.aria') }, t(!on ? 'voice.listen' : voice.paused ? 'voice.resume' : 'voice.pause'));
    b.onclick = () => { if (!on) speak(placeById(id)); else if (voice.paused) resumeVoice(); else pauseVoice(); };
    vb.appendChild(b);
    if (on) { const s = el('button', { type: 'button', 'aria-label': t('voice.stop.aria'), title: t('voice.stop') }, '⏹'); s.onclick = () => { stopVoice(); const f = vb.firstChild; if (f) f.focus(); }; vb.appendChild(s); }
    if (had) b.focus();
  }

  // ---------- one panel at a time on phones: the viewer's panels (time machine, events, info) and these ----------
  const others = [['tm', 'tmb'], ['evp', 'evb'], ['about', 'info'], ['xmenu', 'more'], ['adesso', 'wx'], ['credtxt', 'fonti']].map(([p, b]) => [document.getElementById(p), b && document.getElementById(b)]).filter(o => o[0]);
  const under = () => document.body.classList.toggle('ex-under', others.some(o => !o[0].hidden));
  { const mo = new MutationObserver(under); for (const [p] of others) mo.observe(p, { attributes: true, attributeFilter: ['hidden'] }); }
  function panel(always) {                                  // one of ours opens: on a phone (or for a dropdown) the viewer's panels give way
    if (!phone() && !always) return;
    for (const [p, b] of others) if (!p.hidden) { p.hidden = true; if (b) b.setAttribute('aria-expanded', false); }
    under();
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
    if (m && m.mob) openMob(m);
    else if (m && editing && !selected && !m.stop && m.p.id !== route.from) addStop(m.p.id);   // building an itinerary: the list is in view, the tap adds
    else if (m) openCard(m); else { closeCard(); if (mode === 'hello') setMode(''); }
    input.blur();
  });
  map.addEventListener('pointercancel', () => { active = Math.max(0, active - 1); down = null; });
  map.addEventListener('pointerleave', () => { if (hovered) { hovered.el.classList.remove('hover'); hovered = null; map.style.cursor = ''; layout(true); } });
  map.addEventListener('wheel', stopFly, { passive: true });

  // ---------- search ----------
  const box = el('div', { id: 'ex-search', role: 'search' });
  box.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"><circle cx="6.8" cy="6.8" r="4.8"/><path d="M10.6 10.6 14.5 14.5"/></svg>';
  const input = el('input', { type: 'search', placeholder: t('search.ph'), 'aria-label': t('search.aria'), autocomplete: 'off',
    autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'search', 'aria-controls': 'ex-results' });
  const clear = el('button', { id: 'ex-clear', 'aria-label': t('search.clear'), type: 'button' }, '×');
  const list = el('ul', { id: 'ex-results', role: 'listbox' });
  box.append(input, clear, list);
  document.body.appendChild(box);
  const showList = on => { list.classList.toggle('open', on); document.body.classList.toggle('ex-typing', on); };

  // ---------- what to see, itineraries, near me: three buttons under the search box, and the sheet they open ----------
  const bar = el('div', { id: 'ex-bar' }), menu = el('div', { id: 'ex-menu', role: 'menu', 'aria-label': t('bar.what') }), routesBox = el('div', { id: 'ex-routes' });
  const button = (icon, label, attrs) => { const b = el('button', { type: 'button', ...attrs }); b.append(el('i', { 'aria-hidden': 'true' }, icon), el('span', {}, label)); bar.appendChild(b); return b; };
  const bWhat = button('🏰', t('bar.what') + ' ▾', { 'aria-haspopup': 'true', 'aria-expanded': 'false', 'aria-controls': 'ex-menu' });
  const bRoutes = button('🧭', t('bar.routes'), { 'aria-pressed': 'false' }), bNear = button('📍', t('bar.near'), { 'aria-pressed': 'false' });
  document.body.append(bar, menu, routesBox);
  (function sheet() { document.body.classList.toggle('ex-sheet', card.classList.contains('open') || routesBox.classList.contains('open')); setTimeout(sheet, 250); })();   // a bottom sheet is up (phones hide what it would cover)
  // [id, icon, name in the list, name on the button]
  const CATS = [['', '🗺️', t('cat.all'), t('bar.what')], ...['castelli', 'chiese', 'citta', 'gite'].map((c, i) => [c, ['🏰', '⛪', '🏛️', '🌲'][i], t('cat.' + c), t('cat.' + c + '.s')])];
  const TAGS = [['tag:coperto', '☔', t('tag.coperto'), t('tag.coperto.s')], ['tag:bambini', '🧒', t('tag.bambini'), t('tag.bambini.s')], ['tag:giochi', '🛝', t('tag.giochi'), t('tag.giochi.s')], ['tag:sport', '💪', t('tag.sport'), t('tag.sport.s')]];   // listed only when some place carries the tag
  let routes = [], routesNote = '';
  // the itineraries with their texts in the page's language, and their stops named as the places are
  const routesReady = fetch('itinerari.json', { cache: 'no-cache', priority: 'low' }).then(r => r.ok ? r.json() : null).then(j => { if (j) {
    routes = j.routes.map(r => ({ ...r, ...Object.fromEntries(['title', 'sub', 'note'].filter(k => r[k]).map(k => [k, tc(`itin.${r.id}.${k}`, r[k])])), stops: r.stops.map(s => { const p = placeById(s.id); return { ...s, name: p ? pn(p) : s.name }; }) }));
    routesNote = j.note ? tc('itin.note', j.note) : ''; } }).catch(() => {});
  const fit = (pts, jump) => {                                           // show all of these world points, in the part of the screen the panels leave free
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const W = map.clientWidth, H = map.clientHeight, ph = phone();
    const side = ph ? 64 : 30;                                           // room for the names of the dots at the edges
    let l = side, r = W - side, t = bar.getBoundingClientRect().bottom + 24, b = H - (ph ? 110 : 70);
    if (routesBox.classList.contains('open')) { placeCard(); const q = routesBox.getBoundingClientRect(); if (ph) b = q.top - 24; else l = q.right + 40; }
    const w = Math.max(120, r - l), h = Math.max(120, b - t);
    const z = Math.min(Z - 0.3, Z + Math.log2(Math.min(w / Math.max(60, x1 - x0), h / Math.max(60, y1 - y0)))), s = Math.pow(2, z - Z);
    flyTo((x0 + x1) / 2 - ((l + r) / 2 - W / 2) / s, (y0 + y1) / 2 - ((t + b) / 2 - H / 2) / s, z, jump);
  };
  const setRoute = (r, keep) => {                                       // keep: the same itinerary, changed (the visitor's own): stay at the stop
    route = r; window.__route = r && r.line.length ? r.line : null;
    if (!keep || !r || stopIdx >= r.stops.length) stopIdx = -1;
    if (!r || !r.mine) editing = false;
    for (const m of markers) { m.stop = 0; m.el.classList.remove('stop'); }
    if (r) r.stops.forEach((st, k) => { const m = markers.find(q => q.p.id === st.id); if (m) { m.stop = k + 1; m.el.classList.add('stop'); m.el.firstChild.dataset.n = k + 1; } });
    layout(true); draw(); syncUrl();
  };
  const fitRoute = (r, jump) => {
    const pts = []; for (let i = 0; i < r.line.length; i += 2) pts.push([r.line[i], r.line[i + 1]]);
    if (r.mine) for (const st of r.stops) { const p = placeById(st.id); if (p) pts.push([p.x, p.y]); }
    if (pts.length) fit(pts, jump);
  };
  const pickRoute = (r, jump) => { closeCard(); setRoute(r); showRoutes(); fitRoute(r, jump); };
  function goStop(k, jump) {
    if (!route) return;
    k = Math.max(0, Math.min(route.stops.length - 1, k));
    const m = markers.find(q => q.p.id === route.stops[k].id);
    if (!m) return;
    stopIdx = k;
    if (editing) { editing = false; layout(true); }                    // the walk begins: only its stops on the map
    showPlace(m, Math.max(view.z, Z - 1.2), jump);
    if (readStops) speak(m.p);
  }
  function readToggle() {                                               // "leggi alla tappa": each stop read aloud when stepped to
    const b = el('button', { type: 'button', 'aria-pressed': readStops, title: t('read.title') }, t('read.label'));
    b.onclick = () => { readStops = !readStops; b.setAttribute('aria-pressed', readStops); if (!readStops) stopVoice(); };
    return b;
  }
  const hm = n => n < 60 ? t('dur.min', { n }) : t('dur.h', { h: Math.floor(n / 60), m: String(n % 60).padStart(2, '0') });
  const showRoutes = () => {
    routesBox.textContent = '';
    if (!route) {
      routesBox.append(el('h3', {}, t('routes.title')), el('p', {}, routesNote));
      const n = mine.ids.length, mb = el('button', { class: 'r mine', type: 'button' }, n ? t('mine.btn') : t('mine.btn.new'));
      mb.appendChild(el('small', {}, n ? t('mine.btn.sub', { n, names: mine.ids.slice(0, 3).map(id => pn(placeById(id))).join(', ') + (n > 3 ? '…' : '') }) : t('mine.btn.empty')));
      mb.onclick = openMine; routesBox.appendChild(mb);
      for (const r of routes) { const b = el('button', { class: 'r', type: 'button' }, r.title); b.appendChild(el('small', {}, t('route.meta', { sub: r.sub, km: num(r.km), walk: hm(Math.round(r.walk / 5) * 5) }) + (r.up >= 100 ? ' · ' + t('route.up', { up: r.up }) : ''))); if (r.note) b.appendChild(el('small', { class: 'note' }, r.note)); b.onclick = () => pickRoute(r); routesBox.appendChild(b); }
    } else if (route.mine) showMine();
    else {
      const bk = el('button', { class: 'back', type: 'button' }, t('routes.back')); bk.onclick = () => { setRoute(null); showRoutes(); };
      routesBox.append(bk, el('h3', {}, route.title));
      if (route.note) routesBox.append(el('p', { class: 'note' }, route.note));
      routesBox.append(el('p', {}, t('route.meta.full', { sub: route.sub, km: num(route.km), walk: hm(Math.round(route.walk / 5) * 5) })));
      routesBox.appendChild(stepBox());
      const ol = el('ol');
      route.stops.forEach((st, k) => { const li = el('li', { class: k === stopIdx ? 'here' : '' }); li.append(el('i', {}, String(k + 1)), el('span', {}, st.name), el('small', {}, k ? t('stop.plus', { min: st.min }) : t('stop.start'))); li.onclick = () => goStop(k); ol.appendChild(li); });
      routesBox.appendChild(ol);
      const acts = el('div', { class: 'ex-acts' }), sh = el('button', { type: 'button' }, t('routes.share'));
      sh.onclick = () => share(route.title + ' · ' + t('city'), linkFor({ itinerario: route.id }));
      acts.appendChild(sh); if (voiceOk()) acts.appendChild(readToggle()); routesBox.appendChild(acts);
    }
  };

  // ---------- the visitor's own itinerary: places picked on the map, walked on the same network and by the same rule
  // as the itineraries (geo.js, 17_itinerari.py); kept on this device and in its link ----------
  const VISIT = p => /^Castello/.test(p.type || '') ? 45 : 20;          // minutes of visit unless the visitor says otherwise
  const VISITS = [10, 15, 20, 30, 45, 60, 90, 120];
  const cleanMine = j => ({ ids: [...new Set((j.ids || []).filter(id => { const p = placeById(id); return p && p.e != null; }))], start: ['stazione', 'qui'].includes(j.start) ? j.start : '', visit: j.visit && typeof j.visit === 'object' ? j.visit : {} });
  let mine = { ids: [], start: '', visit: {} };                         // start: '' = from the first stop, 'stazione', 'qui' = from the visitor
  try { const j = JSON.parse(localStorage.getItem('bz-mio') || 'null'); if (j) mine = cleanMine(j); } catch { /* no storage */ }
  const saveMine = () => { try { localStorage.setItem('bz-mio', JSON.stringify(mine)); } catch { /* private mode: it lasts as long as the page */ } };
  const visitOf = id => mine.visit[id] ?? VISIT(placeById(id));
  const mineCode = () => mine.ids.map(id => id + (mine.visit[id] != null && mine.visit[id] !== VISIT(placeById(id)) ? '.' + mine.visit[id] : '')).join(',');
  const parseMine = (code, start) => { const visit = {}, ids = code.split(',').map(s => { const [id, v] = s.trim().split('.'); if (v && +v >= 0 && +v <= 600) visit[id] = Math.round(+v); return id; }); return cleanMine({ ids, start, visit }); };
  const legs = new Map(), ZERO = { m: 0, up: 0, min: 0, line: [] }, legKey = (p, q) => p.key + '>' + q.key;
  let mineSeq = 0;
  const ptOf = p => ({ key: p.id, id: p.id, a: p.e - O[0], b: p.n - O[1], x: p.x, y: p.y });
  function minePts() {                                                  // the start (when not the first stop) and the stops, in metres and world px
    const pts = [], st = placeById('stazione');
    if (mine.start === 'stazione' && st) pts.push({ ...ptOf(st), start: true });
    else if (mine.start === 'qui' && here) pts.push({ key: 'qui@' + Math.round(here.a / 20) + ',' + Math.round(here.b / 20), id: '', a: here.a, b: here.b, x: here.x, y: here.y, start: true });
    for (const id of mine.ids) pts.push(ptOf(placeById(id)));
    return pts;
  }
  function mineRoute() {                                                // shaped like an itinerary of itinerari.json, from the legs known so far
    const pts = minePts(), s = pts[0] && pts[0].start ? pts[0] : null;
    const R = { id: 'mio', mine: true, title: t('mine.title'), from: s ? s.id : null, fromText: s ? (s.id ? 'station' : 'here') : '', startKey: s ? s.key : '', stops: [], line: [], km: 0, up: 0, walk: 0, pending: false, air: false };
    let m = 0;
    pts.forEach((q, k) => {
      const lg = k ? (pts[k - 1].key === q.key ? ZERO : legs.get(legKey(pts[k - 1], q))) : null;
      if (k && !lg) R.pending = true;
      if (lg) { m += lg.m; R.up += lg.up; R.walk += lg.min; if (lg.air) R.air = true; for (const v of lg.line) R.line.push(v); }
      if (!q.start) R.stops.push({ id: q.id, name: pn(placeById(q.id)), min: lg ? lg.min : 0, m: lg ? Math.round(lg.m) : 0, air: !!(lg && lg.air), known: !k || !!lg });
    });
    R.km = Math.round(m / 100) / 10; R.up = Math.round(R.up / 10) * 10;
    return R;
  }
  function walkLeg(w, p, q) {                                           // one leg on the network (w = net.from(p)), or as the crow flies where it has none
    const r = w && w.path(q.a, q.b);
    if (r) { const M = world.enu2px, line = []; for (let i = 0; i < r.p.length; i += 3) line.push(Math.round((M[0][0] * r.p[i] + M[0][1] * r.p[i + 1] + M[0][2] * r.p[i + 2]) * 10) / 10, Math.round((M[1][0] * r.p[i] + M[1][1] * r.p[i + 1] + M[1][2] * r.p[i + 2]) * 10) / 10); return { m: r.m, up: r.up, min: r.min, line }; }
    const m = Math.hypot(q.a - p.a, q.b - p.b);
    return { m, up: 0, min: geoM.walkMin(m, 0), line: [p.x, p.y, q.x, q.y], air: true };
  }
  async function calcMine(fitAfter, jump) {                             // the legs not known yet, then the itinerary again
    const seq = ++mineSeq, pts = minePts(), need = [];
    for (let k = 1; k < pts.length; k++) if (pts[k - 1].key !== pts[k].key && !legs.has(legKey(pts[k - 1], pts[k]))) need.push([pts[k - 1], pts[k]]);
    if (need.length) {
      const net = await (await geo()).loadNet();
      if (seq !== mineSeq) return;
      for (const [p, q] of need) if (!legs.has(legKey(p, q))) legs.set(legKey(p, q), walkLeg(net && net.from(p.a, p.b, [[q.a, q.b]]), p, q));
    }
    if (seq !== mineSeq || !route || !route.mine) return;
    setRoute(mineRoute(), true);
    if (mode === 'routes') renderSheet();
    const nx = card.querySelector('.ex-next'); if (nx && selected) nx.textContent = nextText();
    if (fitAfter && route.stops.length) fitRoute(route, jump);
  }
  function changed(fitAfter) {                                          // the list was edited: keep it, redraw what is known, compute the rest
    saveMine();
    if (!route || !route.mine) return;
    setRoute(mineRoute(), true);
    if (mode === 'routes') renderSheet();
    calcMine(fitAfter);
  }
  function addStop(id) {
    if (mine.ids.includes(id) || placeById(id).e == null) return;
    mine.ids.push(id); changed();
    const n = mine.ids.length, name = pn(placeById(id));
    toast(route && route.mine ? t('toast.add.stop', { name, n }) : t('toast.add', { name, n }));
  }
  function removeStop(id) { const i = mine.ids.indexOf(id); if (i < 0) return; mine.ids.splice(i, 1); delete mine.visit[id]; changed(); if (!route || !route.mine) toast(t('toast.removed')); }
  function openMine() { closeCard(); editing = true; setRoute(mineRoute()); renderSheet(); calcMine(mine.ids.length > 0); }
  // when each stop is reached and left, from the moment the map shows, and what will be closed by then
  const toMin = s => +s.slice(0, 2) * 60 + +s.slice(3, 5);
  function lastEntry(v, close) {                                        // "ultimo ingresso 15:30" in the published (Italian) text, when it goes with this closing time
    for (const m of ((v.text || '') + ' ' + (v.extra || '')).matchAll(/ultim[oa] (?:ingresso|entrata)\D{0,12}(\d{1,2})[:.](\d{2})/gi)) {
      const t = m[1].padStart(2, '0') + ':' + m[2], d = toMin(close) - toMin(t);
      if (d > 0 && d <= 90) return t;
    }
    return '';
  }
  function warnAt(p, arr, dep) {
    const st = p && p.visit && openNow(p.visit, arr);
    if (!st) return '';
    if (!st.open) return st.arrive || st.label;
    const a = zhm(arr), d = zhm(dep), le = lastEntry(p.visit, st.until);
    if (le && a > le) return t('warn.last', { le, a });
    if (!le && toMin(st.until) - toMin(a) < 30) return t('warn.closes.entry', { t: st.until });
    if (dep - arr >= 864e5 || d > st.until || d < a) return t('warn.closes.visit', { t: st.until });
    return '';
  }
  function plan(R) {
    let t = nowMs(); const t0 = t;
    const rows = R.stops.map(st => { t += st.min * 60000; const arr = t, v = visitOf(st.id); t += v * 60000; return { arr, v, warn: warnAt(placeById(st.id), arr, t) }; });
    return { t0, end: t, rows, visits: rows.reduce((s, r) => s + r.v, 0) };
  }
  function showMine() {
    const R = route, n = R.stops.length, P = plan(R);
    const bk = el('button', { class: 'back', type: 'button' }, t('routes.back')); bk.onclick = () => { setRoute(null); showRoutes(); };
    routesBox.append(bk, el('h3', {}, R.title));
    if (editing) routesBox.append(el('p', {}, n ? t('mine.hint') : t('mine.hint.empty')));
    if (!n) return;
    if (editing) {                                                      // where the walk starts
      const row = el('label', { class: 'row' }, t('mine.start')), sel = el('select', { 'data-f': 'start' });
      const geoOk = window.isSecureContext && navigator.geolocation;
      for (const [v, label] of [['', t('mine.start.first')], ['stazione', t('mine.start.station')], ...(here || geoOk ? [['qui', here ? t('mine.start.here') : t('mine.start.ask')]] : [])]) sel.appendChild(el('option', { value: v }, label));
      sel.value = mine.start === 'qui' && !here && !geoOk ? '' : mine.start;
      sel.onchange = () => { mine.start = sel.value; refocus = 'start'; if (mine.start === 'qui' && !here && watch === null && geoOk) { startWatch(); flyNext = false; } changed(); };
      row.appendChild(sel); routesBox.appendChild(row);
      if (mine.start === 'qui' && !here) routesBox.append(el('p', {}, nearMsg || t('mine.wait')));
    }
    const away = Math.abs(nowMs() - Date.now()) > 45 * 60000;
    if (R.pending) routesBox.append(el('p', { class: 'st' }, t('mine.calc')));
    else {
      const walk = R.walk ? (R.km ? num(R.km) + ' km · ' : '') + t('mine.walk', { t: hm(R.walk) }) + (R.up >= 100 ? ' ' + t('mine.up', { up: R.up }) : '') : '';
      routesBox.append(el('p', { class: 'st' }, walk ? t('mine.sum', { walk, visits: hm(P.visits), total: hm(R.walk + P.visits) }) : t('mine.sum.nowalk', { visits: hm(P.visits), total: hm(R.walk + P.visits) })),
        el('p', {}, t(away ? 'mine.when.away' : 'mine.when', { start: zhm(P.t0), end: zhm(P.end) }) + (R.air ? ' ' + t('mine.air') : '')));
      routesBox.appendChild(stepBox());
    }
    const ol = el('ol');
    R.stops.forEach((st, k) => {
      const r = P.rows[k], li = el('li', { class: k === stopIdx ? 'here' : '' }), body = el('span');
      const mi = el('span', { class: 'mi' }, (k || R.startKey ? (st.known ? t('stop.walk', { min: st.min }) + (st.air ? ' ' + t('stop.air') : '') : t('stop.walking')) : t('stop.start')) + (R.pending ? '' : ' · ' + t('stop.arr', { t: zhm(r.arr) })) + ' · ' + t('stop.visit') + ' ');
      if (editing) {
        const s = el('select', { 'aria-label': t('stop.visit.aria', { name: st.name }), 'data-f': 'v:' + st.id });
        for (const v of [...new Set([...VISITS, r.v])].sort((a, b) => a - b)) s.appendChild(el('option', { value: v }, t('dur.min', { n: v })));
        s.value = r.v; s.onclick = e => e.stopPropagation();
        s.onchange = () => { const v = +s.value; if (v === VISIT(placeById(st.id))) delete mine.visit[st.id]; else mine.visit[st.id] = v; refocus = 'v:' + st.id; saveMine(); syncUrl(); renderSheet(); };
        mi.appendChild(s);
      } else mi.append(t('dur.min', { n: r.v }));
      body.append(st.name, mi);
      if (r.warn && !R.pending) body.appendChild(el('span', { class: 'warn' }, '⚠ ' + r.warn));
      li.append(el('i', {}, String(k + 1)), body);
      if (editing) {                                                    // up, down, out
        const mc = el('span', { class: 'mc' }), b = (sign, label, f, fn, off) => { const x = el('button', { type: 'button', 'aria-label': label + ': ' + st.name, title: label, 'data-f': f + ':' + st.id }, sign); x.disabled = !!off; x.onclick = e => { e.stopPropagation(); refocus = f + ':' + st.id; fn(); }; mc.appendChild(x); };
        b('↑', t('stop.up'), 'u', () => moveStop(k, -1), k === 0);
        b('↓', t('stop.down'), 'd', () => moveStop(k, 1), k === n - 1);
        b('×', t('stop.remove'), 'x', () => { refocus = 'x:' + (R.stops[k + 1] || R.stops[k - 1] || {}).id; removeStop(st.id); });
        li.appendChild(mc);
        li.onclick = () => { const m = markers.find(q => q.p.id === st.id); if (m) showPlace(m, Math.max(view.z, Z - 1.2)); };
      } else li.onclick = () => goStop(k);
      ol.appendChild(li);
    });
    routesBox.appendChild(ol);
    const acts = el('div', { class: 'ex-acts' }), btn = (label, fn, attrs) => { const x = el('button', { type: 'button', 'data-f': 'a:' + label.slice(0, 8), ...attrs }, label); x.onclick = () => fn(x); acts.appendChild(x); return x; };
    if (editing) {
      if (n + (R.startKey ? 1 : 0) >= 3) btn(t('mine.opt'), optimize, { title: t('mine.opt.title') });
      btn(t('mine.done'), () => { editing = false; layout(true); renderSheet(); fitRoute(route); });
      btn(t('mine.clear'), x => { if (x.dataset.sure) { mine.ids = []; mine.visit = {}; changed(); return; } x.dataset.sure = '1'; x.textContent = t('mine.clear.sure'); setTimeout(() => { if (x.isConnected) { x.textContent = t('mine.clear'); delete x.dataset.sure; } }, 3000); });
    } else btn(t('mine.edit'), () => { editing = true; layout(true); renderSheet(); });
    btn(editing ? t('card.share') : t('routes.share'), () => share(t('mine.share.title'), linkFor(routeState())));
    if (voiceOk() && !editing) acts.appendChild(readToggle());
    routesBox.appendChild(acts);
  }
  function moveStop(k, d) { const j = k + d; if (j < 0 || j >= mine.ids.length) return; [mine.ids[k], mine.ids[j]] = [mine.ids[j], mine.ids[k]]; changed(); }
  async function optimize(x) {                                          // nearest neighbour + 2-opt on the walking times between all the points
    const pts = minePts(); if (pts.length < 3) return;
    x.disabled = true; x.textContent = t('mine.calc.short');
    const net = await (await geo()).loadNet();
    await new Promise(r => setTimeout(r, 30));                          // let the button show it is working
    const n = pts.length, C = pts.map(() => new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      let w;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const key = legKey(pts[i], pts[j]);
        if (!legs.has(key)) { if (w === undefined) w = net && net.from(pts[i].a, pts[i].b, pts.map(q => [q.a, q.b])); legs.set(key, pts[i].key === pts[j].key ? ZERO : walkLeg(w, pts[i], pts[j])); }
        const lg = legs.get(key); C[i][j] = lg.m / 66.7 + lg.up / 6.67;
      }
    }
    const before = route && route.mine && !route.pending ? route.walk : 0, o = geoM.shortestOrder(C);
    if (!route || !route.mine) return;
    mine.ids = o.filter(i => !pts[i].start).map(i => pts[i].id);
    refocus = '';
    changed();
    const after = route.walk;
    toast(before && after < before ? t('toast.opt', { after: hm(after), before: hm(before) }) : t('toast.opt.same'));
  }
  function setMode(m) {
    if (menu.classList.contains('open')) openMenu(false);
    if (m !== 'routes' && route) setRoute(null);
    if (m !== 'open') openIds = null;
    mode = m;
    routesBox.classList.toggle('open', !!m);
    renderSheet();
    drawChips(); layout(true);
    if (m) panel();
    syncUrl();
  }
  function renderSheet() {
    const top = routesBox.scrollTop, a = document.activeElement, keep = refocus || (routesBox.contains(a) && a.dataset.f) || '';
    refocus = '';
    routesBox.textContent = '';
    if (mode === 'routes') showRoutes(); else if (mode === 'near') showNear(); else if (mode === 'open') showOpen(); else if (mode === 'hello') showHello();
    if (keep) { let f = routesBox.querySelector(`[data-f="${keep}"]`); if (f && f.disabled) f = f.parentNode.querySelector('button:not(:disabled)'); if (f) f.focus({ preventScroll: true }); }   // keyboard users stay where they were
    routesBox.scrollTop = top;
    placeCard();
  }
  const pickCat = id => {                                               // a category: only its dots, and all of them in view
    if (mode) setMode('');
    if (mobSel && id !== 'mob:' + mobSel.layer) closeMob();
    cat = id; layout(true); drawChips();
    if (id.startsWith('mob:')) { wakeMob(); const pts = mob ? mob.points(id.slice(4)) : []; if (pts.length) fit(pts); }
    else if (id) fit(markers.filter(m => inCat(m.p, id)).map(m => [m.p.x, m.p.y]));
    else if (view.z < Z - 3.2) fit(markers.filter(m => m.p.tier === 1).map(m => [m.p.x, m.p.y]));   // all places from far out, where the dots are hidden: back to the main sights
  };
  const pickOpen = () => { closeCard(); cat = ''; setMode('open'); if (openIds.size) fit(markers.filter(m => openIds.has(m.p.id)).map(m => [m.p.x, m.p.y])); };
  function openMenu(on, byKey) {
    menu.classList.toggle('open', on); bWhat.setAttribute('aria-expanded', on); document.body.classList.toggle('ex-menu', on);
    if (!on) return;
    showList(false); panel(true);
    fillMenu();
    wakeMob();
    if (byKey) (menu.querySelector('.on') || menu.firstChild).focus();
  }
  function fillMenu() {                                                 // also again while open, when live entries come or go
    const all = [...menu.querySelectorAll('button')], f = all.indexOf(document.activeElement);
    menu.textContent = '';
    const item = (icon, name, n, active, fn) => { const b = el('button', { type: 'button', role: 'menuitemradio', 'aria-checked': active, class: active ? 'on' : '' }); b.append(icon + ' ' + name + ' ', el('small', {}, '(' + n + ')')); b.onclick = () => { openMenu(false); bWhat.focus({ preventScroll: true }); fn(); }; menu.appendChild(b); };
    for (const [id, icon, name] of CATS) item(icon, name, id ? places.filter(p => inCat(p, id)).length : places.filter(p => !p.minor).length, mode !== 'open' && cat === id, () => pickCat(id));
    menu.appendChild(el('hr'));
    item('🕒', t('open.title'), openRows().length, mode === 'open', pickOpen);
    for (const [id, icon, name] of TAGS) { const n = places.filter(p => inCat(p, id)).length; if (n) item(icon, name, n, mode !== 'open' && cat === id, () => pickCat(id)); }
    const live = mob ? mob.entries() : [];                              // shared bikes, charging points: only with live data
    if (live.length) menu.appendChild(el('hr'));
    for (const e of live) { const [id, icon, name] = MOB.find(k => k[0] === 'mob:' + e.id); item(icon, name, e.n, cat === id, () => pickCat(id)); }
    if (f >= 0) { const b = menu.querySelectorAll('button')[f]; if (b) b.focus({ preventScroll: true }); }
  }
  bWhat.onclick = e => openMenu(!menu.classList.contains('open'), e.detail === 0);
  bRoutes.onclick = () => { if (mode === 'routes') setMode(''); else { closeCard(); cat = ''; setMode('routes'); } };
  bNear.onclick = () => { if (mode === 'near') setMode(''); else { closeCard(); cat = ''; locate(); } };
  menu.addEventListener('keydown', e => {                              // arrows move along the list, Escape goes back to the button
    const items = [...menu.querySelectorAll('button')], i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus(); }
    else if (e.key === 'Escape') { e.stopPropagation(); openMenu(false); bWhat.focus(); }
  });
  document.addEventListener('pointerdown', e => { if (menu.classList.contains('open') && !menu.contains(e.target) && !bWhat.contains(e.target)) openMenu(false); });
  function drawChips() {                                                // the buttons say what is active
    const open = mode === 'open', c = CATS.find(k => k[0] === cat) || TAGS.find(k => k[0] === cat) || MOB.find(k => k[0] === cat) || CATS[0];
    bWhat.firstChild.textContent = open ? '🕒' : cat ? c[1] : '🏰';
    bWhat.lastChild.textContent = (open ? t('open.s') : cat ? c[3] : t('bar.what')) + ' ▾';
    bWhat.classList.toggle('on', open || !!cat);
    for (const [b, on] of [[bRoutes, mode === 'routes'], [bNear, mode === 'near' || !!here]]) { b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); }
  }
  drawChips();

  // ---------- Aperti adesso: what is open at the moment the map shows, by the same rule as the card's badge ----------
  const minuteKey = () => Math.floor(nowMs() / 60000);
  let openKey = 0;
  const openRows = () => places.filter(p => p.visit && !p.minor).map(p => ({ p, st: openNow(p.visit) })).filter(r => r.st && r.st.open)
    .sort((a, b) => a.st.until.localeCompare(b.st.until) || pn(a.p).localeCompare(pn(b.p), locale));
  function showOpen() {
    const rows = openRows();
    openIds = new Set(rows.map(r => r.p.id)); openKey = minuteKey();
    const ms = nowMs(), f = o => dt(ms, o);
    routesBox.append(el('h3', {}, t('open.title')), el('p', {}, t(Math.abs(nowMs() - Date.now()) > 45 * 60000 ? 'open.at.away' : 'open.at', { time: f({ hour: '2-digit', minute: '2-digit' }), day: f({ weekday: 'long', day: 'numeric', month: 'long' }) })));
    if (!rows.length) routesBox.append(el('p', { class: 'st' }, t('open.none')));
    const ol = el('ol');
    for (const r of rows) { const li = el('li'); li.append(el('span', {}, pn(r.p)), el('small', {}, t('open.till', { t: r.st.until }))); li.onclick = () => { const m = markers.find(k => k.p === r.p); if (m) showPlace(m, Math.max(view.z, Z - 1.2)); }; ol.appendChild(li); }
    if (rows.length) routesBox.appendChild(ol);
    routesBox.append(el('p', {}, t('open.count', { n: places.filter(p => p.visit && !p.minor).length })));
  }
  setInterval(() => { if (mode === 'open' && minuteKey() !== openKey) { renderSheet(); layout(true); } }, 15000);   // the clock and the time machine move on

  // ---------- Vicino a me: the visitor's position (asked only on a tap), and the walks from there ----------
  let watch = null, resume = false, flyNext = false, nearMsg = '', walksTried = false, fixSeq = 0;
  function locate() {
    setMode('near');
    if (!window.isSecureContext) { nearMsg = t('near.https'); renderSheet(); return; }
    if (!navigator.geolocation) { nearMsg = t('near.nogeo'); renderSheet(); return; }
    if (here) flyHere();
    if (watch !== null) return;
    if (!here) { nearMsg = t('near.wait'); renderSheet(); }
    startWatch();
  }
  function startWatch() {
    flyNext = !here;
    watch = navigator.geolocation.watchPosition(onFix, onErr, { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 });
  }
  function stopWatch() { if (watch !== null) navigator.geolocation.clearWatch(watch); watch = null; }
  function forget() { stopWatch(); here = null; walks = null; walksTried = false; nearMsg = ''; layout(true); setMode(''); }
  function flyHere() {
    if (!here) return;
    const z = Math.max(view.z, Z - 1.5), lift = phone() && routesBox.classList.contains('open') ? routesBox.offsetHeight / 2 / Math.pow(2, z - Z) : 0;
    flyTo(here.x, here.y + lift, z);
  }
  const refreshNear = () => {
    if (route && route.mine && mine.start === 'qui' && ((minePts()[0] || {}).key || '') !== route.startKey) { setRoute(mineRoute(), true); calcMine(); }   // the walk starts where the visitor is
    if (mode === 'near' || mode === 'routes') renderSheet();
    const n = card.querySelector('.ex-next'); if (n && route) n.textContent = nextText();
  };
  async function onFix(pos) {
    const seq = ++fixSeq, c = pos.coords, g = await geo(), r = await g.fromWgs(c.latitude, c.longitude);
    if (seq !== fixSeq) return;
    if (!r.at) {                                             // outside the drawn area: say how far, and stop asking
      stopWatch(); here = null; walks = null; layout(true); drawChips();
      nearMsg = t('near.far', { km: r.km < 10 ? num(r.km, 1) : Math.round(r.km) });
      refreshNear(); return;
    }
    const moved = !here || Math.hypot(r.at.a - here.a, r.at.b - here.b) > 15;
    here = { x: r.at.x, y: r.at.y, a: r.at.a, b: r.at.b, acc: Math.min(c.accuracy || 0, 5000) };
    drawChips();
    nearMsg = c.accuracy > 150 ? t('near.approx', { acc: fmtM(c.accuracy) }) : '';
    layout(true);
    if (flyNext) { flyNext = false; flyHere(); }
    refreshNear();
    if (!moved && walks) return;
    const net = await g.loadNet();
    if (seq !== fixSeq) return;
    walksTried = true;
    if (net) {
      const at = await g.place(here.a, here.b);              // the exact height of the street under the visitor
      if (at && seq === fixSeq) { here.x = at.x; here.y = at.y; layout(true); }
      walks = net.from(here.a, here.b);
    }
    refreshNear();
  }
  function onErr(e) {
    if (e.code === 1) { stopWatch(); nearMsg = t('near.denied'); }
    else if (!here) nearMsg = e.code === 3 ? t('near.timeout') : t('near.unavailable');
    refreshNear();
  }
  document.addEventListener('visibilitychange', () => {        // no GPS while the page is not looked at
    if (document.hidden) { if (watch !== null) { stopWatch(); resume = true; } }
    else if (resume) { resume = false; startWatch(); }
  });
  function showNear() {
    routesBox.append(el('h3', {}, t('near.title')));
    if (nearMsg) routesBox.append(el('p', { class: 'st' }, nearMsg));
    if (!here) return;
    if (!walksTried) { routesBox.append(el('p', {}, t('near.calc'))); return; }
    const rows = places.filter(p => !p.minor).map(p => ({ p, d: fromHere(p) })).filter(r => r.d).sort((a, b) => (a.d.min || 0) - (b.d.min || 0) || a.d.m - b.d.m).slice(0, 6);
    const ol = el('ol');
    for (const r of rows) { const li = el('li'); li.append(el('span', {}, pn(r.p)), el('small', {}, fmtWalk(r.d))); li.onclick = () => { const m = markers.find(k => k.p === r.p); if (m) showPlace(m, Math.max(view.z, Z - 1.2)); }; ol.appendChild(li); }
    routesBox.appendChild(ol);
    routesBox.append(el('p', {}, t(walks ? 'near.note' : 'near.note.air')));
    const acts = el('div', { class: 'ex-acts' }), c1 = el('button', { type: 'button' }, t('near.center')), c2 = el('button', { type: 'button' }, t('near.hide'));
    c1.onclick = flyHere; c2.onclick = forget;
    acts.append(c1, c2); routesBox.appendChild(acts);
  }

  // ---------- first visit: a small welcome, three lines and three chips ----------
  function showHello() {
    const x = el('button', { class: 'x', type: 'button', 'aria-label': t('close') }, '×'); x.onclick = () => setMode('');
    routesBox.append(x, el('h3', {}, t('hello.title')), el('p', {}, t('hello.text')));
    const acts = el('div', { class: 'ex-acts' }), b = (label, title, fn) => { const k = el('button', { type: 'button', title }, label); k.onclick = fn; acts.appendChild(k); };
    const c = routes.find(r => r.id === 'centro');
    // German nouns keep their capital after the colon
    if (c) b(t('hello.walk', { min: Math.round(c.walk / 5) * 5 }), t('hello.walk.title', { title: c.title, sub: lang === 'de' ? c.sub : c.sub.charAt(0).toLowerCase() + c.sub.slice(1) }), () => { setMode('routes'); pickRoute(c); });
    if (!document.body.classList.contains('era')) b(t('hello.now'), t('hello.now.title'), () => { setMode(''); openEvents(); });
    b(t('tour.start'), t('tour.start.title'), () => { setMode(''); import('./tour.js?v=20261121b').then(m => m.startTour()); });   // the guided tour of everything there is
    b(t('hello.explore'), t('hello.explore.title'), () => setMode(''));
    routesBox.appendChild(acts);
    // the language, once, here: four small chips (later in ⋯ 🌐); the welcome comes back in the language chosen
    const lg = el('div', { class: 'ex-acts ex-lang', role: 'group', 'aria-label': t('menu.lang.group') });
    lg.appendChild(el('span', { 'aria-hidden': 'true' }, '🌐'));
    for (const code of LANGS) {
      const k = el('button', { type: 'button', lang: code, 'aria-label': NAMES[code], 'aria-pressed': code === lang }, code.toUpperCase());
      k.onclick = () => { if (code === lang) return; try { sessionStorage.setItem('bz-hello', '1'); } catch { /* no storage */ } switchLang(code); };
      lg.appendChild(k);
    }
    routesBox.appendChild(lg);
  }
  function openEvents() {                                      // the viewer wires the events button once its data are in
    let n = 0;
    const go = () => { const b = document.getElementById('evb'), p = document.getElementById('evp'); if (b && b.onclick) { if (p && p.hidden) b.click(); } else if (n++ < 40) setTimeout(go, 250); };
    go();
  }

  // ---------- search: places first, then addresses and place names from swisstopo ----------
  const LABEL_Z = { city: Z - 3, town: Z - 3, village: Z - 2.2, suburb: Z - 2, quarter: Z - 2, neighbourhood: Z - 1.5 };
  const index = [];
  for (const m of markers) {
    // found by its name in the page's language, its Italian name and its other names
    index.push({ name: pn(m.p), sub: m.p.type ? pt(m.p, 'type') : '', keys: [...new Set([pn(m.p), m.p.name, ...(m.p.alt || [])].map(norm))], rank: 0, marker: m });
  }
  const seen = new Set(index.flatMap(i => i.keys));
  for (const l of world.labels) {
    const k = norm(l.name);
    if (seen.has(k)) continue;                                           // e.g. the castles: the richer entry wins
    const own = (l.kind === 'town' || l.kind === 'city') && l.name === 'Bellinzona' ? t('city') : l.name;   // Bellinzone in French
    index.push({ name: own, sub: KIND_IT[l.kind] || '', keys: [...new Set([own, l.name].map(norm))], rank: 1, x: l.x, y: l.y, z: LABEL_Z[l.kind] ?? Z - 1.2 });
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
    out.sort((a, b) => a.s - b.s || a.it.name.localeCompare(b.it.name, locale));
    return out.slice(0, 8).map(o => o.it);
  }

  // the address search asks swisstopo only for what the visitor typed, after a pause; if it fails the places stay
  let addr = { q: '', list: [], busy: false }, addrT = 0, addrCtl = null;
  const addrCache = new Map();
  function askAddresses(q) {
    const k = norm(q);
    if (k === addr.q) return;
    clearTimeout(addrT);
    if (addrCtl) { addrCtl.abort(); addrCtl = null; }
    addr = { q: k, list: addrCache.get(k) || [], busy: k.length >= 3 && !addrCache.has(k) };
    if (!addr.busy) return;
    addrT = setTimeout(async () => {
      const ctl = addrCtl = new AbortController();
      let got = null;
      try { got = await (await geo()).addresses(q, ctl.signal); addrCache.set(k, got); } catch { /* offline or refused: places alone */ }
      if (addr.q !== k || ctl.signal.aborted) return;
      addr = { q: k, list: got || [], busy: false };
      if (list.classList.contains('open')) renderList(true);
    }, 350);
  }

  let results = [], act = -1;
  function renderList(keep) {
    list.textContent = '';
    const q = input.value.trim();
    box.classList.toggle('has-text', !!input.value);
    if (!q) { askAddresses(''); showList(false); return; }
    if (!keep) askAddresses(q);
    const found = search(q), adds = addr.list.slice(0, 5).map(a => ({ ...a, addr: true }));
    results = [...found, ...adds];
    act = keep && act >= 0 && act < results.length ? act : results.length ? 0 : -1;
    if (!results.length) list.appendChild(el('li', { class: 'none' }, addr.busy ? t('search.busy') : t('search.none')));
    results.forEach((it, i) => {
      if (it.addr && !(results[i - 1] || {}).addr) list.appendChild(el('li', { class: 'hd', 'aria-hidden': 'true' }, t('search.addr')));
      const li = el('li', { role: 'option', 'data-i': i });
      li.appendChild(el('b', {}, it.name));
      if (it.sub) li.appendChild(el('small', {}, it.sub));
      if (i === act) li.classList.add('act');
      list.appendChild(li);
    });
    showList(true);
  }
  function setAct(i) {
    if (!results.length) return;
    act = (i + results.length) % results.length;
    const lis = list.querySelectorAll('li[data-i]');
    lis.forEach((li, j) => li.classList.toggle('act', j === act));
    lis[act].scrollIntoView({ block: 'nearest' });
  }
  function showPlace(m, z, jump) {
    openCard(m);
    // on phones the card is a bottom sheet: aim a little lower so the marker stays clear of it
    const lift = phone() ? card.offsetHeight / 2 / Math.pow(2, z - Z) : 0;
    flyTo(m.p.x, m.p.y + lift, z, jump);
  }
  function choose(it) {
    if (!it) return;
    input.value = it.name;
    box.classList.add('has-text');
    showList(false);
    input.blur();
    pinAt = it.addr ? { x: it.x, y: it.y } : null;
    if (it.addr) pin.lastChild.textContent = it.name;
    if (it.marker && editing && !selected && !it.marker.stop && it.marker.p.e != null) {   // building an itinerary: the place found joins it
      const p = it.marker.p, z = Math.max(view.z, Z - 1.2), lift = phone() ? routesBox.offsetHeight / 2 / Math.pow(2, z - Z) : 0;
      addStop(p.id); clearSearch(); flyTo(p.x, p.y + lift, z);
    } else if (it.marker) showPlace(it.marker, Math.max(view.z, Z - 1));
    else {
      closeCard();
      flyTo(it.x, it.y, it.addr ? (it.town ? Z - 2.2 : Math.max(view.z, Z - 1)) : it.z);
    }
    layout(true);
  }
  const clearSearch = () => { input.value = ''; box.classList.remove('has-text'); if (pinAt) { pinAt = null; layout(true); } };
  input.addEventListener('input', () => renderList());
  input.addEventListener('focus', () => { if (input.value.trim()) renderList(); });
  input.addEventListener('keydown', e => {
    e.stopPropagation();                                                 // keep the viewer's +/-/P/arrow shortcuts out of the text field
    if (e.key === 'ArrowDown') { e.preventDefault(); setAct(act + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAct(act - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); if (!list.classList.contains('open')) renderList(); choose(results[act]); }
    else if (e.key === 'Escape') {
      if (list.classList.contains('open')) showList(false);
      else if (input.value) clearSearch();
      else input.blur();
    }
  });
  list.addEventListener('pointerdown', e => e.preventDefault());         // keep focus in the field while picking
  list.addEventListener('click', e => {
    const li = e.target.closest('li[data-i]');
    if (li) choose(results[+li.dataset.i]);
  });
  clear.addEventListener('click', () => { clearSearch(); renderList(); input.focus(); });
  document.addEventListener('pointerdown', e => { if (!box.contains(e.target)) showList(false); });

  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') {                                            // closes the list of what to see, else the card, then the sheet
      if (menu.classList.contains('open')) { openMenu(false); return; }
      showList(false);
      if (selected || mobSel) closeCard();
      else if (mode) setMode('');
    }
    else if (e.key === '/' && document.activeElement !== input) { e.preventDefault(); input.focus(); input.select(); }
  });
  window.addEventListener('resize', () => { placeCard(); layout(true); });

  // ---------- open what the address asks for; Back and Forward walk the same way ----------
  const onScreen = m => { const [sx, sy] = toScreen(m.p.x, m.p.y); return sx > 20 && sy > 20 && sx < map.clientWidth - 20 && sy < map.clientHeight - 20; };
  async function applyUrl(first) {
    const u = readUrl();
    if (u.itinerario) await routesReady;
    if (sameUrl(u, urlState())) return;
    const jump = first && !VIEW0;                                      // a link without a view: go straight to the place
    applying = true;
    try {
      const r = u.itinerario && routes.find(x => x.id === u.itinerario);
      const mi = !r && u.mio ? parseMine(u.mio, u.partenza) : null;   // someone's own itinerary: shown, kept on this device only once edited
      const m = !r && !(mi && mi.ids.length) && u.luogo && markers.find(k => k.p.id === u.luogo);
      if (mi && mi.ids.length) {
        const other = u.mio !== mineCode() || u.partenza !== (mine.start === 'stazione' ? 'stazione' : '');
        if (other) mine = mi;
        if (mode !== 'routes') { closeCard(); setMode('routes'); }
        if (other || !route || !route.mine) { closeCard(); editing = false; setRoute(mineRoute()); showRoutes(); calcMine(!u.tappa && (jump || !first), jump); }
        const k = u.tappa - 1, mk = route.stops[k] && markers.find(q => q.p.id === route.stops[k].id);
        if (mk) { if (first && !jump) { stopIdx = k; openCard(mk); } else goStop(k, jump); }
        else if (selected) closeCard();
      } else if (r) {
        if (mode !== 'routes') { closeCard(); setMode('routes'); }
        if (route !== r) { closeCard(); setRoute(r); showRoutes(); if (!u.tappa && (jump || !first)) fitRoute(r, jump); }
        const k = u.tappa - 1, mk = r.stops[k] && markers.find(q => q.p.id === r.stops[k].id);
        if (mk) { if (first && !jump) { stopIdx = k; openCard(mk); } else goStop(k, jump); }   // a reload keeps its own view
        else if (selected) closeCard();
      } else {
        if (route) { setRoute(null); if (mode === 'routes') showRoutes(); }
        if (m) {
          if (mode === 'hello') setMode('');
          if (jump) showPlace(m, Math.max(view.z, Z - 1), true);
          else { openCard(m); setTimeout(() => { if (selected === m && !onScreen(m)) showPlace(m, Math.max(view.z, Z - 1.2)); }, 80); }   // after the viewer has read the view back from the hash
        } else closeCard();
      }
    } finally { applying = false; }
  }
  addEventListener('popstate', () => applyUrl(false));
  layout(true);
  const deep = readUrl();
  await applyUrl(true);
  // the welcome: on the first visit, and only when the map opens on its own. A link (a place, an itinerary, an event, a moment,
  // an era, another side, a view in the hash) or the map inside another page opens straight on what it was sent for
  const q0 = new URLSearchParams(location.search);
  const linked = VIEW0 || embed || deep.luogo || deep.itinerario || deep.mio || ['evento', 'vista', 'epoca', 'quando', 'tappa', 'giro'].some(k => q0.has(k));
  try {                                                                  // any visit counts: the next one is a repeat (and who saw the old info panel is no newcomer)
    const seen = localStorage.getItem('bz-welcome') || localStorage.getItem('bz-about');
    localStorage.setItem('bz-welcome', '1');
    let again = false; try { again = !!sessionStorage.getItem('bz-hello'); sessionStorage.removeItem('bz-hello'); } catch { /* no storage */ }   // its language was just switched from it
    if ((!seen && !linked) || again) routesReady.then(() => { if (!mode && !selected) setMode('hello'); });
  } catch { /* no storage: no welcome, the map is enough */ }
  // refresh: the open card again, with the live rows of data that came after it (index.html, once the simulation is in)
  const refresh = () => { if (!selected) return; const top = card.scrollTop; openCard(selected, true); card.scrollTop = top; };
  return { flyTo, stopFly, places, openCard: id => { const m = markers.find(k => k.p.id === id); if (m) openCard(m); }, closeCard, refresh, locate, copy: copyLink, share };
}
