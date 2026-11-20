// Shared bikes and charging points for electric cars: two layers of "Cosa vedere" (explore.js) with live availability.
// Nothing is asked until the visitor opens that list; then every 5 minutes, only while a layer is on (or the list was
// opened in the last 10 minutes), through livedata.js: timeout, backoff, staleness, plausibility. Anything doubtful
// (down, slow, changed format, values out of range, old) and the layer, its entry and its card are simply not there.
//
//   Bici condivise: api.sharedmobility.ch (UFE), "identify" in a circle around the drawn area, station-based offers of
//     the bike operators below (velospot pages of 50: a second page must come back short). The answer carries no time:
//     the time of each operator's data is its `last_updated` (/providers/<id>), and an operator older than 45 min is
//     left out. (sharedmobility.ch's own GBFS files send two Access-Control-Allow-Origin values: browsers refuse them.)
//   Ricarica auto: the points inside the map (ricarica.json, from pipeline/20_ricarica.py: the federal EVSEData is 24 MB)
//     joined by EvseID to the live EVSEStatus of data.geo.admin.ch (~170 kB compressed, rewritten every 30-60 s); the
//     file has no time inside, so its time is the `updated` of its STAC item, read just before.
//
//   initMobility({ geo, layer, toScreen, active, onChange }) -> { wake, entries, has, layout, hit, points, card, name }
//     geo()      -> Promise<Geo> (geo.js), for the positions: the same conversion as the address pins
//     layer      the element of the place markers, toScreen(x, y) -> [sx, sy], active() -> the layer shown ('bici', 'ricarica' or '')
//     onChange() called when what can be shown changes (data in, data gone, time machine)
import { source, info, MIN } from './livedata.js?v=20261121a';
import { t, hm as zhm } from './i18n.js?v=20261121a';

const SM = 'https://api.sharedmobility.ch/v1/sharedmobility/';
const AREA = '&Geometry=9.0131,46.1898&Tolerance=6500&geometryFormat=esrijson';   // circle around world.json `content` (6.44 km to its corners)
const IDENT = (prov, off) => SM + 'identify?filters=ch.bfe.sharedmobility.provider.id=' + prov + '&filters=ch.bfe.sharedmobility.pickup_type=station_based' + AREA + '&offset=' + off;
const PROV = { velospot: 'bici', carvelo2go: 'cargo' };                            // the bike operators of the area, and what they rent (i18n mob.n.<it>)
const EV_STATUS = 'https://data.geo.admin.ch/ch.bfe.ladestellen-elektromobilitaet/status/ch.bfe.ladestellen-elektromobilitaet.json';
const EV_STAC = 'https://data.geo.admin.ch/api/stac/v1/collections/ch.bfe.ladestellen-elektromobilitaet/items/status';
const EV_STATES = new Set(['Available', 'Occupied', 'Reserved', 'OutOfService', 'Unknown', 'EvseNotFound']);   // OICP; anything else = format changed
const SRC = { bici: [`sharedmobility.ch (${t('src.sfoe')})`, 'https://sharedmobility.ch'], ricarica: [`ich-tanke-strom.ch (${t('src.sfoe')})`, 'https://www.ich-tanke-strom.ch'] };   // UFE, BFE, OFEN, SFOE

const CSS = `
.mb-mk { position: absolute; left: 0; top: 0; width: 0; height: 0; display: none; will-change: transform; z-index: 1; }
.mb-mk i { position: absolute; left: 0; top: 0; transform: translate(-50%, -50%); min-width: 20px; height: 20px; box-sizing: border-box; padding: 0 5px;
  border-radius: 10px; background: #2f9e5b; border: 2px solid #fff; color: #fff; font: 700 11px/16px ui-sans-serif, system-ui, sans-serif; font-style: normal;
  text-align: center; box-shadow: 0 1px 5px #000a; transition: transform .15s ease; }
.mb-mk.ev i { background: #1f7fd1; }
.mb-mk.zero i { background: #6b7280; }
.mb-mk span { position: absolute; left: 0; top: 13px; transform: translateX(-50%); white-space: nowrap; color: #fff; font-size: 11.5px; font-weight: 500;
  background: #1b1d22cc; padding: 1px 7px; border-radius: 9px; display: none; }
.mb-mk.hover span, .mb-mk.sel span { display: block; }
.mb-mk.hover i, .mb-mk.sel i { transform: translate(-50%, -50%) scale(1.25); }
.mb-mk.hover, .mb-mk.sel { z-index: 2; }
`;
const el = (tag, attrs = {}, text) => { const e = document.createElement(tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; return e; };
const hm = ms => zhm(ms);
const str = v => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
const isNow = () => { try { return !document.body.classList.contains('era') && (!window.__now || Math.abs(window.__now() - Date.now()) < 45 * MIN); } catch { return false; } };

export function initMobility({ geo, layer, toScreen, active, onChange }) {
  document.head.appendChild(el('style')).textContent = CSS;
  let started = false, wantUntil = 0, evLocs = null, evWant = null, stacGot = 0, sig = '';
  const wanted = () => { try { return !!active() || Date.now() < wantUntil; } catch { return false; } };
  const opt = { every: 5 * MIN, timeout: 10000, live: wanted, delay: 300 };
  const pos = new Map();                        // "lat,lon" -> {x, y} on the map, or null outside the drawn ground
  const items = new Map();                      // "<layer>:<id>" -> marker { id, layer, el, x, y, sx, sy, shown, d }
  let S = null;                                 // the sources, once started

  async function place(lat, lon) {              // the map position, as for the address pins (geo.js); null outside the map
    const k = lat + ',' + lon;
    if (!pos.has(k)) { try { const r = await (await geo()).fromWgs(lat, lon); pos.set(k, r.at ? { x: r.at.x, y: r.at.y } : null); } catch { return null; } }
    return pos.get(k);
  }

  // ---------- shared bikes ----------
  function page(body) {                         // one page of identify: the stations of our operators, every field as expected
    if (!Array.isArray(body) || body.length > 50) return null;
    const st = [];
    for (const f of body) {
      const a = f && f.attributes, g = f && f.geometry;
      if (!a || typeof a !== 'object' || typeof a.provider_id !== 'string') return null;
      if (!PROV[a.provider_id] || a.pickup_type !== 'station_based') continue;
      const n = a.station_status_num_vehicle_available;
      if (typeof a.id !== 'string' || !str(a.station_name) || !g || !Number.isFinite(g.x) || !Number.isFinite(g.y) || g.x < 8.9 || g.x > 9.13 || g.y < 46.12 || g.y > 46.26
        || !Number.isInteger(n) || n < 0 || n > 60 || typeof a.station_status_installed !== 'boolean' || typeof a.station_status_renting !== 'boolean') return null;
      st.push({ id: a.id, prov: a.provider_id, op: str(a.provider_name), name: str(a.station_name), addr: str(a.station_address), lat: g.y, lon: g.x, n,
        on: a.station_status_installed, renting: a.station_status_renting });
    }
    return { len: body.length, st };
  }
  const provTime = id => body => (body && body.provider_id === id && Number.isInteger(body.last_updated) ? { at: body.last_updated * 1000, name: str(body.name) } : null);
  function bikes() {                            // the stations that can be shown now, or null
    if (!S) return null;
    const pv = S.pages.map(s => s.value()), [v0, v1, c0] = pv;
    if (!v0 || !v1 || !c0 || v1.len >= 50 || c0.len >= 50 || (v0.len < 50 && v1.len)) return null;   // a full last page: some stations would be missing
    if (Math.max(...S.pages.map(s => s.got)) - Math.min(...S.pages.map(s => s.got)) > 6 * MIN) return null;   // pages of different moments
    const out = [], seen = new Set();
    for (const v of pv) for (const s of v.st) {
      const t = S.times[s.prov].value(), p = pos.get(s.lat + ',' + s.lon);
      if (seen.has(s.id) || !t || !s.on || !p) continue;    // operator not fresh, station not installed, outside the map (or not placed yet)
      seen.add(s.id);
      out.push({ ...s, ...p, at: t.at, op: s.op || t.name });
    }
    return out.length ? out : null;
  }

  // ---------- charging points ----------
  function evParse(j) {
    const G = j && j.EVSEStatuses;
    if (!Array.isArray(G) || G.length < 5 || !evWant) return null;
    const st = new Map(); let total = 0;
    for (const g of G) {
      const R = g && g.EVSEStatusRecord;
      if (!Array.isArray(R)) return null;
      total += R.length;
      for (const r of R) if (r && evWant.has(r.EvseID)) { if (!EV_STATES.has(r.EVSEStatus)) return null; st.set(r.EvseID, r.EVSEStatus); }
    }
    return { st, total };
  }
  function chargers() {
    if (!S || !S.ev || !evLocs) return null;
    const s = S.ev.value(), t = S.stac.value();
    if (!s || !t || Math.abs(S.ev.got - stacGot) > 6 * MIN) return null;   // the status file and its time must be read together
    const at = Math.min(t.at, S.ev.got), out = [];
    for (const L of evLocs) {
      let free = 0, busy = 0, off = 0, unk = 0;
      for (const e of L.evse) { const v = s.st.get(e.id); if (v === 'Available') free++; else if (v === 'Occupied' || v === 'Reserved') busy++; else if (v === 'OutOfService') off++; else unk++; }
      if (free + busy + off) out.push({ ...L, free, busy, off, unk, at });
    }
    return out.length ? out : null;
  }
  async function loadEv() {                     // the points of the map (static), placed; old file = no layer
    try {
      const r = await fetch('ricarica.json', { cache: 'no-cache' });
      if (!r.ok) return;
      const j = await r.json(), age = Date.now() - Date.parse(j.retrieved);
      if (!(age >= -864e5 && age < 180 * 864e5) || !Array.isArray(j.locations)) return;
      const locs = [];
      for (const [i, L] of j.locations.entries()) {
        if (!L || !Number.isFinite(L.lat) || !Number.isFinite(L.lon) || !Array.isArray(L.evse) || !L.evse.length || L.evse.some(e => !e || typeof e.id !== 'string')) return;
        const p = await place(L.lat, L.lon);
        if (p) locs.push({ ...L, id: 'ev' + i, ...p, name: str(L.name), op: str(L.op), addr: str(L.addr), city: str(L.city) });
      }
      if (!locs.length) return;
      evLocs = locs; evWant = new Set(locs.flatMap(L => L.evse.map(e => e.id)));
      S.ev = source({ ...opt, id: 'ricarica', url: EV_STATUS, delay: 1500, parse: evParse, ok: d => d.total >= 1000 && d.st.size >= evWant.size / 2, onData: check });
    } catch { /* no layer */ }
  }

  // ---------- start, and what is there now ----------
  function wake() {                             // the list was opened: start once, and refresh what is due
    if (!isNow()) return;
    wantUntil = Date.now() + 10 * MIN;
    if (!started) {
      started = true;
      S = { pages: [IDENT('velospot', 0), IDENT('velospot', 50), IDENT('carvelo2go', 0)].map((url, k) => source({ ...opt, id: 'bici-' + k, url, parse: page, onData: placeBikes })),
        times: Object.fromEntries(Object.keys(PROV).map(p => [p, source({ ...opt, id: 'bici-t-' + p, url: SM + 'providers/' + p, maxAge: 45 * MIN, parse: provTime(p), ok: d => d.at > Date.now() - 45 * MIN, onData: check })])),
        stac: source({ ...opt, id: 'ricarica-t', url: EV_STAC, maxAge: 20 * MIN, onData: () => { stacGot = Date.now(); if (S.ev) setTimeout(S.ev.poll, 0); },
          parse: j => { const a = j && j.assets && Object.values(j.assets).find(x => x && x.href === EV_STATUS), at = a && typeof a.updated === 'string' ? Date.parse(a.updated) : NaN; return Number.isFinite(at) ? { at } : null; } }),
        ev: null };
      loadEv();
      setInterval(check, 5000);
      info({ id: 'bici', label: t('mob.bici'), order: 40, group: 'trasporti', source: SRC.bici[0], url: SRC.bici[1],
        text: () => { const b = bikes(); if (!b) return null; const n = b.reduce((s, x) => s + (x.renting ? x.n : 0), 0); return t('mob.row.bikes', { n }) + ' ' + t('mob.row.in', { n: b.length }); } });
      info({ id: 'ricarica', label: t('mob.ricarica'), order: 41, group: 'trasporti', source: SRC.ricarica[0], url: SRC.ricarica[1],
        text: () => { const c = chargers(); if (!c) return null; const f = c.reduce((s, x) => s + x.free, 0), k = c.reduce((s, x) => s + x.free + x.busy + x.off, 0); return t('mob.row.plugs', { n: f, k }) + ' ' + t('mob.row.points', { n: c.length }); } });
    } else for (const s of [...S.pages, ...Object.values(S.times), S.stac]) s.poll();   // only what is due
  }
  async function placeBikes(d) { for (const s of d.st) await place(s.lat, s.lon); check(); }
  const data = id => (id === 'bici' ? bikes() : id === 'ricarica' ? chargers() : null);
  function check() {                            // tell explore.js when what can be shown has changed (also when it goes away)
    let now = '';
    for (const id of ['bici', 'ricarica']) { const d = data(id); now += id + ':' + (d ? d.map(x => x.id + '=' + (x.n ?? x.free) + '/' + (x.renting ?? x.busy) + '/' + x.at).join(',') : '-') + ';'; }
    if (now === sig) return;
    sig = now;
    for (const id of ['bici', 'ricarica']) sync(id, data(id));
    try { onChange(); } catch { /* the page's mistake is not ours to throw */ }
  }
  function sync(id, list) {                     // markers follow the data: one per station, kept between refreshes
    const keep = new Set();
    for (const d of list || []) {
      const k = id + ':' + d.id; keep.add(k);
      let m = items.get(k);
      if (!m) { m = { id: d.id, layer: id, mob: true, el: el('div', { class: 'mb-mk' + (id === 'ricarica' ? ' ev' : '') }), sx: 0, sy: 0, shown: false }; m.el.append(el('i'), el('span')); layer.appendChild(m.el); items.set(k, m); }
      const n = id === 'bici' ? (d.renting ? d.n : 0) : d.free;
      m.d = d; m.x = d.x; m.y = d.y;
      m.el.firstChild.textContent = String(n); m.el.lastChild.textContent = title(id, d, true);
      m.el.classList.toggle('zero', !n);
    }
    for (const [k, m] of items) if (m.layer === id && !keep.has(k)) { m.d = null; m.shown = false; m.el.style.display = 'none'; }
  }

  function title(id, d, town) {                 // town: on the map, where a name repeats ("Stazione FFS · Giubiasco")
    if (id === 'ricarica') return d.name || d.addr || t('mob.ricarica.s');
    const m = /^(?:LIGHT - )?(.+?) - Ticino - (.+)$/.exec(d.name);   // velospot: "LIGHT - Galbisio - Fermata TP - Ticino - Bellinzona"
    return m ? m[1] + (town && m[2] !== 'Bellinzona' ? ' · ' + m[2].replace(/^S\/\s*/, 'S. ') : '') : d.name;
  }
  function card(m, dirUrl) {                    // the nodes of the card, or null when the station has no current data
    const d = m && m.d; if (!d || !isNow()) return null;
    const out = [], box = el('div', { class: 'vis' });
    if (m.layer === 'bici') {
      const town = (/ - Ticino - (.+)$/.exec(d.name) || [])[1] || '', what = PROV[d.prov];
      out.push(el('p', { class: 'k' }, t('mob.bici') + ' · ' + d.op), el('h2', {}, title('bici', d)));
      const where = [d.addr, town.replace(/^S\/\s*/, 'S. ')].filter(Boolean).join(', ');
      if (where) out.push(el('p', { class: 'when' }, where));
      box.appendChild(el('b', { class: d.renting && d.n ? 'yes' : 'no' }, !d.renting ? t('mob.suspended') : !d.n ? t('mob.none.' + what) : t('mob.n.' + what, { n: d.n })));
    } else {
      const k = d.free + d.busy + d.off;
      out.push(el('p', { class: 'k' }, t('mob.ricarica') + ' · ' + d.op), el('h2', {}, title('ricarica', d)));
      const where = [d.addr, d.city].filter(Boolean).join(', ');
      if (where) out.push(el('p', { class: 'when' }, where));
      box.appendChild(el('b', { class: d.free ? 'yes' : 'no' }, k === 1 ? t(d.free ? 'mob.plug.free' : d.off ? 'mob.plug.off' : 'mob.plug.busy')
        : !d.free ? t('mob.plugs.none', { k }) : d.free === 1 ? t('mob.plugs.one', { k }) : t('mob.plugs.free', { n: d.free, k })));
      const more = [d.off && k > 1 ? t('mob.off', { n: d.off }) : '', d.unk ? t('mob.unk', { n: d.unk }) : ''].filter(Boolean).join(' · ');
      if (more) box.appendChild(el('p', {}, more));
      const best = new Map();                   // plug -> highest power
      for (const e of d.evse) for (const p of Array.isArray(e.plug) ? e.plug : []) if (typeof p === 'string') best.set(p, Math.max(best.get(p) || 0, Number.isFinite(e.kw) ? e.kw : 0));
      const plug = p => (/^Tipo (\d)$/.test(p) ? t('mob.plug.type', { n: p.slice(5) }) : p === 'Presa svizzera T13' ? t('mob.plug.t13') : p);   // ricarica.json names them in Italian
      if (best.size) box.appendChild(el('p', {}, [...best].sort((a, b) => b[1] - a[1]).map(([p, kw]) => plug(p) + (kw ? ' ' + kw + ' kW' : '')).join(' · ')));
    }
    box.appendChild(el('small', {}, t('mob.updated', { t: hm(d.at) })));
    out.push(box);
    const acts = el('div', { class: 'ex-acts' });
    acts.appendChild(el('a', { href: dirUrl(d), target: '_blank', rel: 'noopener' }, t('card.dir')));
    out.push(acts, el('a', { href: SRC[m.layer][1], target: '_blank', rel: 'noopener' }, t('card.source', { label: SRC[m.layer][0] })));
    return out;
  }

  return {
    wake,
    entries: () => ['bici', 'ricarica'].map(id => ({ id, n: (data(id) || []).length })).filter(e => e.n),
    has: id => !!data(id),
    layout(id, w, h) {
      for (const m of items.values()) {
        const on = m.layer === id && !!m.d;
        if (on) { const [sx, sy] = toScreen(m.x, m.y); m.sx = sx; m.sy = sy; m.shown = sx > -40 && sy > -40 && sx < w + 40 && sy < h + 40; } else m.shown = false;
        m.el.style.display = m.shown ? 'block' : 'none';
        if (m.shown) m.el.style.transform = `translate(${m.sx.toFixed(1)}px,${m.sy.toFixed(1)}px)`;
      }
    },
    hit(x, y, r) { let best = null, bd = r * r; for (const m of items.values()) { if (!m.shown) continue; const d = (m.sx - x) ** 2 + (m.sy - y) ** 2; if (d <= bd) { bd = d; best = m; } } return best; },
    points: id => [...items.values()].filter(m => m.layer === id && m.d).map(m => [m.x, m.y]),
    card,
    name: m => (m && m.d ? title(m.layer, m.d) : ''),
  };
}
