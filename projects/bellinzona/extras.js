// The town's calendar and surroundings, layered on the simulation: live weather, the Ticino, the cable car,
// schools, the Rabadan carnival, match days, passengers on the platforms, sounds; and the "Adesso a Bellinzona" panel.
// Real inputs: MeteoSwiss 10-minute measurements (station Magadino/Cadenazzo) and pollen (Locarno-Monti), FOEN river gauges
// 2020 (Ticino, Bellinzona) and 2068 (Riazzino), FOEN forest-fire warnings, OpenStreetMap geometry, the calendar. Everything else
// (how many people, exact school hours, cabin timetable, parade timing) is a stated assumption, kept in one place below.

import { festState, festDates, festBuild, fireworks } from './fest.js?v=20261121c';
import { source, info, infoRows, MIN, HOUR } from './livedata.js?v=20261121c';
import { sunPosition } from './sky.js?v=20261121c';
import { t, lang, num as nf } from './i18n.js?v=20261121c';

const ASSUME = {
  school: { in1: [7.83, 8.33], out1: [11.58, 11.95], in2: [13.25, 13.58], out2: [15.75, 16.2] },   // typical Ticino timetable; Wednesday afternoon free
  superiore: { in1: [7.9, 8.25], out2: [16.4, 16.85] },
  cable: { open: [6.5, 21.5], every: 30, speed: 4.4, shut: [['2026-11-09', '2026-11-13']] },   // 06:30-21:30, off on Wednesdays 08-10 and on the maintenance dates (mornera.ch, read 17 Nov 2026); it runs on demand: a run each half hour is assumed; speed from "poco più di 10 minuti" to Mornera
  parade: { day: 0, from: 13.5, to: 16.5 },                 // Sunday afternoon
  rabadanCrowd: [10, 27],                                   // 10:00 to 03:00
};

const VIVID = ['#e23a3a', '#f2c21a', '#2f9e5b', '#2d6fd6', '#b04ad0', '#f07f2e', '#19b5b0', '#f25fa0'];
const hash = (a, b = 0) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };
const clamp01 = v => Math.max(0, Math.min(1, v));
const shadeHex = (hex, k) => { const n = parseInt(hex.slice(1), 16); return `rgb(${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => Math.min(255, Math.round(v * k))).join(',')})`; };
const D2R = Math.PI / 180;

// ======== live measurements, read by the visitor's browser through livedata.js ========
// Every source fails to nothing: slow, down, a column renamed or gone, a value out of range, an old timestamp, and its rows in the
// "Adesso" panel and whatever it drives on the map are simply not there. Only open data with CORS, no keys.
const num = s => (typeof s === 'number' ? (Number.isFinite(s) ? s : null) : typeof s === 'string' && /^\s*-?\d+(\.\d+)?\s*$/.test(s) ? +s : null);
const within = (v, lo, hi) => (v !== null && v >= lo && v <= hi ? v : null);
const lines = t => (typeof t === 'string' ? t.trim().split(/\r?\n/) : []);
const utc = s => { const m = /^(\d\d)\.(\d\d)\.(\d{4}) (\d\d):(\d\d)$/.exec(s || ''); return m ? Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4], +m[5]) : NaN; };   // MeteoSwiss open data: dd.mm.yyyy HH:MM, always UTC, end of the interval
const f1 = v => nf(v, 1), f0 = v => String(Math.round(v));
const MAG = [46.160025, 8.933672];                        // Magadino/Cadenazzo, 203 m (MeteoSwiss station list)

// MeteoSwiss automatic station Magadino/Cadenazzo (MAG), the nearest with all of these: on the Magadino plain, about 8 km south-west of
// the old town, so its air is the plain's rather than the streets'. File VQHA80.csv; columns and units checked against MeteoSwiss's
// legend https://data.geo.admin.ch/ch.meteoschweiz.messwerte-aktuell/info/VQHA80_en.txt (17 Nov 2026): Date yyyyMMddHHmm in UTC,
// "-" = missing; tre200s0 °C air temperature 2 m · rre150z0 mm precipitation, 10-min total · sre000z0 min sunshine, 10-min total ·
// gre000z0 W/m² global radiation, 10-min mean · ure200s0 % relative humidity 2 m · tde200s0 °C dew point 2 m · dkl010z0 ° wind
// direction, 10-min mean (where it blows from) · fu3010z0 km/h wind speed, 10-min mean · fu3010z1 km/h gust peak (1 s).
const VQ = { temp: ['tre200s0', -30, 45], rain: ['rre150z0', 0, 50], sun: ['sre000z0', 0, 10], rad: ['gre000z0', -20, 1400], hum: ['ure200s0', 1, 100], dew: ['tde200s0', -40, 35], dir: ['dkl010z0', 0, 360], wind: ['fu3010z0', 0, 200], gust: ['fu3010z1', 0, 300] };
export function parseVQ(txt) {
  const L = lines(txt), head = (L[0] || '').split(';'), rows = L.filter(l => l.startsWith('MAG;'));
  if (head[0] !== 'Station/Location' || head[1] !== 'Date' || rows.length !== 1) return null;
  const r = rows[0].split(';'), m = /^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)$/.exec(r[1] || '');
  if (r.length !== head.length || !m) return null;
  const o = { at: Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) };
  for (const k in VQ) {
    const [col, lo, hi] = VQ[k], i = head.indexOf(col);
    if (i < 0) return null;                                  // a column renamed or gone: the file is no longer the one described above
    if (r[i] === '-' || r[i] === '') { o[k] = null; continue; }
    if (num(r[i]) === null) return null;                     // text where a number was due
    o[k] = within(num(r[i]), lo, hi);                        // out of range: that reading is dropped
    if (o[k] === null && k === 'temp') o.bad = true;
  }
  if (o.bad) o.hum = o.dew = null;                           // temperature and humidity come from the same instrument
  delete o.bad;
  if (o.temp !== null && o.dew !== null && o.hum !== null) {   // the humidity the dew point implies (Magnus) must agree with the one measured
    const es = t => Math.exp(17.62 * t / (243.12 + t));
    if (Math.abs(100 * es(o.dew) / es(o.temp) - o.hum) > 6) o.hum = o.dew = null;
  }
  if (o.wind !== null && o.gust !== null && o.gust < o.wind - 0.5) o.gust = null;
  if (o.wind !== null && o.wind >= 2 && o.dir === null) o.wind = o.gust = null;   // a wind without a direction draws nothing
  if (o.rad !== null) o.rad = Math.max(0, o.rad);
  return o.temp === null && o.rain === null && o.wind === null ? null : o;
}

// North foehn: MeteoSwiss's own foehn index for the same station (open data ogd-smn, 10-minute file, column wcc006s0 "Indice di
// favonio": 0 favonio non presente, 1 tendenza al favonio, 2 favonio - legend of the geo.admin.ch layer
// ch.meteoschweiz.messwerte-foehn-10min, read 17 Nov 2026). South of the Alps the foehn that comes down is the north foehn. Kept
// conservative: only index 2 (the "tendency" is not enough) and only with the dry air foehn brings, relative humidity at most 60 %
// in the same row (in 2026 to mid-November the 1766 ten-minute values with index 2 at Magadino had a median of 25 %, a maximum of 48 %).
export function parseFoehn(txt) {
  const L = lines(txt), head = (L[0] || '').split(';'), F = head.indexOf('wcc006s0'), H = head.indexOf('ure200s0');
  if (head[0] !== 'station_abbr' || head[1] !== 'reference_timestamp' || F < 0 || H < 0) return null;
  for (let k = L.length - 1; k > 0 && k >= L.length - 6; k--) {   // the index comes in a little after the other values: the last row that has it
    const r = L[k].split(';');
    if (r.length !== head.length || r[0] !== 'MAG') return null;
    if (r[F] === '') continue;
    const at = utc(r[1]);
    if (!/^[012]$/.test(r[F]) || !Number.isFinite(at)) return null;
    return { at, f: +r[F], hum: r[H] === '' ? null : within(num(r[H]), 1, 100) };
  }
  return null;
}

// FOEN gauge 2020, Ticino at Bellinzona, through api.existenz.ch (FOEN's open data: flow m³/s, height m a.s.l., timestamps in seconds)
export function parseGauge(j) {
  const pl = j && Array.isArray(j.payload) ? j.payload : null, o = { flow: null, height: null, at: NaN }, ts = [];
  if (!pl) return null;
  for (const [k, lo, hi] of [['flow', 0.3, 5000], ['height', 222, 240]]) {
    const x = pl.find(p => p && p.loc === '2020' && p.par === k), v = x ? num(x.val) : null, t = x ? num(x.timestamp) : null;
    if (v === null || t === null || t < 1.5e9 || t > 4e9) continue;
    o[k] = within(v, lo, hi); if (o[k] !== null) ts.push(t * 1000);
  }
  if (!ts.length) return null;
  o.at = Math.min(...ts); return o;
}

// FOEN on the federal linked-data service LINDAS (open data, updated every 10 minutes; the source the FOEN names for its current
// data): the official flood danger level of gauge 2020, and the water temperature of the Ticino at Riazzino (gauge 2068, 9 km
// downstream: Bellinzona's gauge does not measure it). One SPARQL query; the answer is CSV with the variables named here.
const LD = 'https://environment.ld.admin.ch/foen/hydro/river/observation/';
const LQ = `PREFIX h: <https://environment.ld.admin.ch/foen/hydro/dimension/> SELECT ?s ?t ?q ?d ?temp WHERE { VALUES ?s { <${LD}2020> <${LD}2068> } ?s h:measurementTime ?t . OPTIONAL { ?s h:discharge ?q } OPTIONAL { ?s h:dangerLevel ?d } OPTIONAL { ?s h:waterTemperature ?temp } }`;
// Danger thresholds of gauge 2020 as published on https://www.hydrodaten.admin.ch/it/seen-und-fluesse/stationen-und-daten/2020
// (read 17 Nov 2026): grado 2 from 700, 3 from 1100, 4 from 1450, 5 above 1800 m³/s. Used only to check the level LINDAS gives:
// a level more than one step away from what the discharge says is not shown. Names: hydrodaten.admin.ch "I 5 gradi di pericolo";
// grado 1 there is "pericolo nullo o debole", said here as "nessun pericolo o pericolo debole" (livedata.js drops any text containing "null").
// The names in the other languages are the same scale's own (i18n/ui.*.json flood.1-5).
const DANGER_Q = [700, 1100, 1450, 1800];
export function parseLD(txt) {
  const L = lines(txt), o = { level: null, q: null, water: null, at: NaN }, ts = [];
  if (L[0] !== 's,t,q,d,temp') return null;
  for (const l of L.slice(1)) {
    const c = l.split(',');
    if (c.length !== 5 || !c[0].startsWith(LD)) return null;
    const id = c[0].slice(LD.length), at = /^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d)?(Z|[+-]\d\d:\d\d)$/.test(c[1]) ? Date.parse(c[1]) : NaN;
    if (!Number.isFinite(at) || at > Date.now() + 10 * MIN || Date.now() - at > 70 * MIN) continue;   // each gauge on its own: an old one is left out
    if (id === '2020') {
      const q = within(num(c[2]), 0.3, 5000), d = /^[1-5]$/.test(c[3]) ? +c[3] : null;
      if (q === null || d === null || Math.abs(1 + DANGER_Q.filter(x => q >= x).length - d) > 1) continue;
      o.level = d; o.q = q; ts.push(at);
    } else if (id === '2068') {
      const w = within(num(c[4]), 0, 28);
      if (w !== null) { o.water = w; ts.push(at); }
    }
  }
  if (!ts.length) return null;
  o.at = Math.min(...ts); return o;
}

// Forest fires, FOEN with the cantons (geo.admin.ch, opendata.swiss "Open use"): the danger level of the warning region that holds
// Bellinzona (now "Ticino centrale") and the prevention measures (fire bans) in force there. The identify service gives the
// region's current entry but not when the data were last refreshed: that comes from the warning dataset's STAC item ("updated", a
// second tiny request; refreshed daily). Both rows are shown only while that is less than 50 hours old.
const FIRE_URL = 'https://api3.geo.admin.ch/rest/services/api/MapServer/identify?geometryType=esriGeometryPoint&geometry=2722180,1116830&sr=2056&tolerance=0&returnGeometry=false&lang=it&layers=all:ch.bafu.gefahren-waldbrand_warnung,ch.bafu.gefahren-waldbrand_praeventionsmassnahmen_kantone';
const FIRE_DE = ['', 'Keine oder geringe Gefahr', 'Mässige Gefahr', 'Erhebliche Gefahr', 'Grosse Gefahr', 'Sehr grosse Gefahr'];   // the levels as titled in the data (17 Nov 2026)
// the service gives its texts in the four languages (title_de, _fr, _it, _en, read 17 Nov 2026): the page's, else the Italian
const LG = ['it', 'de', 'fr', 'en'];
const plain = s => (typeof s === 'string' && s.trim().length >= 3 && s.length < 220 && !/[<>{}]|\b(undefined|NaN|null)\b/.test(s) ? s.trim() : null);
export function parseFire(j) {
  const res = j && Array.isArray(j.results) ? j.results : null;
  if (!res) return null;
  const get = id => { const r = res.filter(x => x && x.layerBodId === id && x.attributes); return r.length === 1 && r[0].attributes.canton === 'TI' ? r[0].attributes : null; };
  const w = get('ch.bafu.gefahren-waldbrand_warnung'), m = get('ch.bafu.gefahren-waldbrand_praeventionsmassnahmen_kantone'), o = { danger: null, level: null, region: null, measure: null, detail: null };
  const all = (a, k) => Object.fromEntries(LG.map(l => [l, plain(a[k + '_' + l])]).filter(x => x[1]));   // { it, de, … } the languages given
  if (w && plain(w.title_it) && plain(w.name_it)) { o.danger = all(w, 'title'); o.region = Object.fromEntries(Object.entries(all(w, 'name')).map(([l, s]) => [l, s.replace(/\s*\(TI\)$/, '')])); o.level = FIRE_DE.indexOf(w.title_de) > 0 ? FIRE_DE.indexOf(w.title_de) : null; }
  if (m && plain(m.title_it)) { o.measure = all(m, 'title'); o.detail = all(m, 'description'); }
  return o.danger || o.measure ? o : null;
}
const inLang = o => (o ? o[lang] || o.it || null : null);
export function parseStac(j) { const u = j && j.properties && j.properties.updated, at = typeof u === 'string' ? Date.parse(u) : NaN; return Number.isFinite(at) ? { at } : null; }

// Pollen, MeteoSwiss open data (ogd-pollen, hourly file of the automatic station Locarno-Monti, the nearest: 18 km west): mean
// concentration of the last hour, pollen per m³ (ogd-pollen_meta_parameters.csv, 17 Nov 2026). MeteoSwiss's classes "debole …
// molto forte" are defined for daily means, so none is claimed for an hour. Its seven species; ambrosia and chestnut are not in it.
const POLLEN = [['kabetuh0', 'betulla'], ['khpoach0', 'graminacee'], ['kaalnuh0', 'ontano'], ['kacoryh0', 'nocciolo'], ['kafaguh0', 'faggio'], ['kafraxh0', 'frassino'], ['kaquerh0', 'quercia']];   // names: i18n pollen.<name>
export function parsePollen(txt) {
  const L = lines(txt), head = (L[0] || '').split(';'), ix = POLLEN.map(([c]) => head.indexOf(c));
  if (head[0] !== 'station_abbr' || head[1] !== 'reference_timestamp' || L.length < 2 || ix.some(i => i < 0)) return null;
  const r = L[L.length - 1].split(';'), at = utc(r[1]);
  if (r.length !== head.length || r[0] !== 'PLO' || !Number.isFinite(at)) return null;
  const v = ix.map(i => (r[i] === '' ? null : /^\d+$/.test(r[i]) ? within(+r[i], 0, 30000) : NaN));
  return v.some(x => Number.isNaN(x)) ? null : { at, v };
}

// Is the sun out? Sunshine minutes, and the global radiation against what a clear sky gives at that sun height, judged only when the
// sun is above the station's own horizon: Magadino lies at the foot of the Monte Ceneri and is in the mountains' shadow when the sun
// is low in the south-east or south-west. Horizon by azimuth: the lowest sun that gave any sunshine there in MeteoSwiss's 2026 10-minute
// data of the station (5° bins, the higher of each pair), plus 2°; from south-south-east to south-south-west it is lower than the winter
// sun, which shone there at its lowest, so 16° stands for it. Clear sky: Haurwitz (1945),
// 1098·sin h·e^(-0.057/sin h) W/m²; Magadino's fully sunny 10 minutes of 2026 measured a median 0.91-0.99 of it by sun height, so no
// sunshine at all and less than half of it means cloud. By night (or in the shadow) nothing is said.
const HORIZON = [[80, 8], [90, 11], [100, 14], [110, 12], [120, 14], [130, 14.5], [140, 16], [150, 16], [200, 16], [210, 15], [220, 13.5], [230, 14], [240, 11], [250, 7], [260, 6], [270, 5], [280, 7.5], [290, 9], [300, 9]];
const horizonAt = az => { let i = 0; while (i < HORIZON.length - 2 && az > HORIZON[i + 1][0]) i++; const [a0, h0] = HORIZON[i], [a1, h1] = HORIZON[i + 1]; return h0 + (h1 - h0) * clamp01((az - a0) / (a1 - a0)); };
const skyMemo = new WeakMap();
export function skyState(w) {                            // { k: 'sole' | 'tratti' | 'coperto', over: 0..1 } or null
  if (!w || w.sun === null || w.rad === null) return null;
  if (skyMemo.has(w)) return skyMemo.get(w);
  const { el, az } = sunPosition(w.at - 5 * MIN, MAG[0], MAG[1]), s = Math.sin(el * D2R);
  let out = null;
  if (el >= 8 && el >= horizonAt(az)) {
    const ratio = w.rad / (1098 * s * Math.exp(-0.057 / s));
    if (ratio <= 1.6) out = w.sun >= 7 ? { k: 'sole', over: 0 } : w.sun >= 1 ? { k: 'tratti', over: 0 } : ratio < 0.5 ? { k: 'coperto', over: clamp01((0.55 - ratio) / 0.3) } : null;   // more than 1.6 × a clear sky: a sensor fault
  }
  skyMemo.set(w, out); return out;
}

// Valley mist, drawn as a light haze on the valley floor: when the air is close to saturation with little wind and no rain, the
// conditions in which mist forms on the Ticino valley's floor. A hint, not a visibility measurement (the station reports none):
// relative humidity from 94 % (nothing) to 99 % (full), mean wind 5 km/h or less (gone by 10), no rain in the last 10 minutes;
// strongest around dawn, when such mist is thickest, fainter later in the day. Magadino is out on the plain, where mist is more
// frequent than in town: kept faint (sky.js).
export function mistK(w, ms) {
  if (!w || w.hum === null || w.wind === null || w.rain !== 0) return 0;
  const k = clamp01((w.hum - 94) / 5) * clamp01((10 - w.wind) / 5);
  if (!k) return 0;
  const { el, az } = sunPosition(ms);
  return k * (el < -6 ? 0.75 : az < 180 && el < 10 ? 1 : 0.55);
}

const DIRS = t('wind.dirs').split('|');                    // north, north-east … north-west
export function windText(w) {
  if (!w || w.wind === null) return null;
  if (w.wind < 2) return t('wind.calm');
  return t('wind.from', { dir: DIRS[Math.round(w.dir / 45) % 8], v: f0(w.wind) }) + (w.gust !== null && w.gust >= w.wind + 8 ? ', ' + t('wind.gust', { v: f0(w.gust) }) : '');
}

let LIVE = null;
function liveSources() {
  if (LIVE) return LIVE;
  const S = LIVE = {
    meteo: source({ id: 'meteo', url: 'https://data.geo.admin.ch/ch.meteoschweiz.messwerte-aktuell/VQHA80.csv', text: true, every: 10 * MIN, maxAge: 40 * MIN, parse: parseVQ, delay: 700 }),
    gauge: source({ id: 'ticino', url: 'https://api.existenz.ch/apiv1/hydro/latest?locations=2020&parameters=flow,height', every: 10 * MIN, maxAge: 70 * MIN, parse: parseGauge, delay: 900 }),
    foehn: source({ id: 'favonio', url: 'https://data.geo.admin.ch/ch.meteoschweiz.ogd-smn/mag/ogd-smn_mag_t_now.csv', text: true, every: 10 * MIN, maxAge: 40 * MIN, parse: parseFoehn, delay: 4000 }),
    river: source({ id: 'ticino-ufam', url: 'https://ld.admin.ch/query?query=' + encodeURIComponent(LQ), text: true, every: 10 * MIN, maxAge: 70 * MIN, parse: parseLD, delay: 5000 }),
    fire: source({ id: 'incendi', url: FIRE_URL, every: HOUR, maxAge: 3 * HOUR, parse: parseFire, delay: 7000 }),
    fireAge: source({ id: 'incendi-agg', url: 'https://data.geo.admin.ch/api/stac/v1/collections/ch.bafu.gefahren-waldbrand_warnung/items/gefahren-waldbrand_warnung', every: HOUR, maxAge: 50 * HOUR, parse: parseStac, delay: 7500 }),
    pollen: source({ id: 'pollini', url: 'https://data.geo.admin.ch/ch.meteoschweiz.ogd-pollen/plo/ogd-pollen_plo_h_now.csv', text: true, every: 30 * MIN, maxAge: 3 * HOUR, parse: parsePollen, delay: 9000 }),
  };
  // the federal offices by their own name in the page's language (MeteoSvizzera, MeteoSchweiz, MétéoSuisse, MeteoSwiss; UFAM, BAFU, OFEV, FOEN)
  const W = () => S.meteo.value(), MSN = t('src.meteo'), FO = t('src.foen'), MS = MSN + ' · Magadino/Cadenazzo', MSU = 'https://www.meteosvizzera.admin.ch/servizi-e-pubblicazioni/applicazioni/valori-attuali-e-reti-di-misura.html#param=messnetz-automatisch&station=MAG';
  const HY = 'https://www.hydrodaten.admin.ch/it/seen-und-fluesse/stationen-und-daten/';
  info({ id: 'meteo-aria', group: 'meteo', order: 10, label: t('row.temp'), source: MS, url: MSU, text: () => { const w = W(); return w && w.temp !== null ? f1(w.temp) + ' °C' + (w.hum !== null ? ' · ' + t('row.temp.hum', { h: f0(w.hum) }) : '') : null; } });
  info({ id: 'meteo-cielo', group: 'meteo', order: 11, label: t('row.sun'), source: MS, url: MSU, text: () => { const s = skyState(W()); return s && t('sun.' + s.k); } });
  info({ id: 'meteo-pioggia', group: 'meteo', order: 12, label: t('row.rain'), source: MS, url: MSU, text: () => { const w = W(); return w && w.rain !== null ? (w.rain === 0 ? t('rain.none') : t('rain.mm', { mm: f1(w.rain) })) : null; } });
  info({ id: 'meteo-vento', group: 'meteo', order: 13, label: t('row.wind'), source: MS, url: MSU, text: () => windText(W()) });
  info({ id: 'meteo-favonio', group: 'meteo', order: 14, label: t('row.foehn'), source: MSN + ' · ' + t('src.foehn'), url: MSU, text: () => { const f = foehnOn(); return f ? t('foehn.text', { h: f0(f.hum) }) : null; } });
  info({ id: 'acqua-ticino', group: 'acqua', order: 20, label: t('row.ticino'), source: FO + ', via api.existenz.ch', url: HY + '2020', text: () => { const g = S.gauge.value(); return g && g.flow !== null ? `${f0(g.flow)} m³/s` + (g.height !== null ? ' · ' + t('row.ticino.level', { h: nf(g.height, 2) }) : '') : null; } });
  info({ id: 'acqua-piena', group: 'acqua', order: 21, label: t('row.flood'), source: FO + ' · LINDAS', url: HY + '2020', text: () => { const r = S.river.value(); return r && r.level ? t('flood.text', { level: r.level, name: t('flood.' + r.level) }) : null; } });
  info({ id: 'acqua-temp', group: 'acqua', order: 22, label: t('row.water'), source: FO + ' · LINDAS', url: HY + '2068', text: () => { const r = S.river.value(); return r && r.water !== null ? t('water.text', { t: f1(r.water) }) : null; } });
  const fire = () => (S.fireAge.value() ? S.fire.value() : null);
  info({ id: 'aria-incendi', group: 'aria', order: 40, label: t('row.fire'), source: FO + ' · ' + t('src.fire'), url: 'https://www.waldbrandgefahr.ch/', text: () => { const f = fire(), d = f && inLang(f.danger), r = f && inLang(f.region); return d ? (lang === 'de' ? d : d.toLowerCase()) + (f.level ? ' ' + t('fire.level', { level: f.level }) : '') + (r ? ', ' + r : '') : null; } });
  info({ id: 'aria-fuochi', group: 'aria', order: 41, label: t('row.fires'), source: t('src.canton') + ' · via ' + FO, url: 'https://www.waldbrandgefahr.ch/', text: () => { const f = fire(), m = f && inLang(f.measure), d = f && inLang(f.detail); return m ? m + (d ? ': ' + d : '') : null; } });
  info({ id: 'aria-pollini', group: 'aria', order: 42, label: t('row.pollen'), source: MSN, url: 'https://www.meteosvizzera.admin.ch/servizi-e-pubblicazioni/applicazioni/valori-attuali-e-reti-di-misura.html#param=messnetz-pollen&station=PLO', text: () => {
    const p = S.pollen.value(); if (!p) return null;
    const on = POLLEN.map(([, n], i) => [t('pollen.' + n), p.v[i]]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]);
    return on.length ? t('pollen.avg', { list: on.slice(0, 3).map(([n, c]) => `${n} ${c}/m³`).join(', ') }) : p.v.every(x => x === 0) ? t('pollen.none') : null; } });
  return S;
}
// the north foehn as defined above, or null; { hum } when it blows
function foehnOn() {
  const f = LIVE && LIVE.foehn.value();
  return f && f.f === 2 && f.hum !== null && f.hum <= 60 ? f : null;
}

// The flag at Castelgrande, moved by the measured wind, with the arms of Bellinzona (white serpent on red). Only there: its
// flagpole is mapped in OpenStreetMap (node 9671157846, man_made=flagpole); its foot is on the ground of the hill (swissALTI3D),
// the 9 m pole is ASSUMED, and that this is the flag flown on it is the owner's word. [e, n, h, pole] in metres from the map's origin.
const FLAGS = [[94.9, 194.3, 31.2, 9]];                    // only where a flagpole is mapped: Castelgrande (the owner's choice, 17 Nov 2026)

// ---- the "Adesso a Bellinzona" panel: the rows of livedata.js, opened from the status line, only while the map shows now ----
const GROUPS = ['meteo', 'acqua', 'aria', 'trasporti'].map(g => [g, t('grp.' + g)]);
function adesso(extras) {
  const wx = document.getElementById('wx'), pn = document.getElementById('adesso');
  if (!wx || !pn || pn.dataset.on) return;
  pn.dataset.on = '1';
  const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const can = () => !document.body.classList.contains('era') && extras.live() && typeof window.__panel === 'function';
  const phone = () => matchMedia('(max-width: 640px)').matches;
  wx.setAttribute('aria-controls', 'adesso'); wx.setAttribute('aria-expanded', 'false'); wx.setAttribute('aria-label', t('adesso.aria'));
  let sig = '';
  const place = () => { if (phone()) { pn.style.bottom = ''; return; } const r = wx.getBoundingClientRect(); pn.style.bottom = Math.round(innerHeight - r.top + 8) + 'px'; };
  const fill = () => {
    const rows = infoRows(), s = JSON.stringify(rows);
    if (s === sig) return; sig = s;
    pn.textContent = '';
    const x = mk('button', 'ax', '×'); x.type = 'button'; x.setAttribute('aria-label', t('close')); x.onclick = () => { if (!pn.hidden) window.__panel('adesso'); wx.focus(); };
    pn.append(x, mk('h2', null, t('adesso.title')));
    const known = GROUPS.map(g => g[0]), groups = [...GROUPS];
    for (const r of rows) { const g = (r.group || '').toLowerCase(); if (g && !known.includes(g)) { known.push(g); groups.push([g, g[0].toUpperCase() + g.slice(1)]); } }
    groups.push(['', t('grp.altro')]);
    for (const [g, name] of groups) {
      const mine = rows.filter(r => ((r.group || '').toLowerCase() || '') === g);
      if (!mine.length) continue;
      const sec = mk('section'); sec.append(mk('h3', null, name));
      for (const r of mine) {
        const d = mk('div', 'ar'); d.append(mk('span', 'al', r.label), mk('span', 'av', r.text));
        if (r.source) { const a = mk(r.url ? 'a' : 'span', 'as', r.source); if (r.url) { a.href = r.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; } d.append(a); }
        sec.append(d);
      }
      pn.append(sec);
    }
    const names = [...new Set(rows.map(r => r.source && r.source.split(/[·,]/)[0].trim()).filter(Boolean))];
    pn.append(mk('p', 'an', (rows.length ? t('adesso.from', { names: names.join(', ') }) : t('adesso.none')) + ' ' + t('adesso.rule')));
  };
  const open = () => { if (!can()) return; if (window.__panel('adesso')) { sig = ''; fill(); place(); } };
  wx.addEventListener('click', open);
  wx.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  setInterval(() => {
    const ok = can();
    wx.classList.toggle('tap', ok);
    if (ok) { wx.setAttribute('role', 'button'); wx.tabIndex = 0; } else { wx.removeAttribute('role'); wx.removeAttribute('tabindex'); }
    if (!pn.hidden) { if (ok) { fill(); place(); } else if (typeof window.__panel === 'function') window.__panel('adesso'); else pn.hidden = true; }
  }, 1000);
}

function easter(y) {                                       // Gregorian computus -> [month, day]
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  return [Math.floor((h + l - 7 * m + 114) / 31), ((h + l - 7 * m + 114) % 31) + 1];
}

// The parade route (extras.json "parade") resampled every metre and smoothed over +-5 m, by the same rule as 23_crowds.py
// (which found the spectators' places along it), so that the floats turn round corners instead of jerking at the vertices
function smoothRoute(fp) {
  const n0 = fp.length / 4, c0 = new Float64Array(n0);
  for (let i = 1; i < n0; i++) c0[i] = c0[i - 1] + Math.hypot(fp[i * 4] - fp[i * 4 - 4], fp[i * 4 + 1] - fp[i * 4 - 3]);
  const L0 = c0[n0 - 1], n = Math.ceil(L0) + 1, P = new Float32Array(n * 4);
  for (let i = 0, g = 1; i < n; i++) {
    const s = Math.min(i, L0);
    while (g < n0 - 1 && c0[g] < s) g++;
    const a = (g - 1) * 4, b = g * 4, f = clamp01((s - c0[g - 1]) / Math.max(1e-3, c0[g] - c0[g - 1]));
    for (let k = 0; k < 3; k++) P[i * 4 + k] = fp[a + k] + (fp[b + k] - fp[a + k]) * f;
    P[i * 4 + 3] = fp[a + 3] && fp[b + 3] ? 1 : 0;
  }
  const p = P.slice(), cum = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const w = Math.min(5, i, n - 1 - i); let x = 0, y = 0;
    for (let j = i - w; j <= i + w; j++) { x += P[j * 4]; y += P[j * 4 + 1]; }
    p[i * 4] = x / (2 * w + 1); p[i * 4 + 1] = y / (2 * w + 1);
    if (i) cum[i] = cum[i - 1] + Math.hypot(p[i * 4] - p[i * 4 - 4], p[i * 4 + 1] - p[i * 4 - 3]);
  }
  return { p, n, cum, len: cum[n - 1] };
}

// The Sunday parade (ASSUMED in all but its route and hours): 68 numbers in file - about thirty floats ("una trentina",
// the owner's own count from watching it; the official 2026 leaflet listed 15 floats among its 55 numbers), 19 groups on
// foot and 19 guggen bands, as in 2026 - with 7 m between one and the next. A float: a tractor or a lorry, a hitch, a
// decorated wagon 9-12 m long with people on it. All move at one steady pace, so they keep their order and never close up:
// the head leaves the station at 13:30 and the tail reaches Piazza Indipendenza at 16:30 (fest.js), so the pace is the
// route plus the length of the parade over three hours (about 0.19 m/s, 0.7 km/h); whoever has not started yet is
// waiting out of the picture, on the approach beyond the station, and whoever has arrived leaves the picture there.
const TRACTORS = ['#c8402f', '#2f7a3f', '#2d5fa8', '#e0a52e', '#8f2f2a', '#5a6470'];
function corteoPlan(Lr) {
  const units = []; let d = 0, g = 0;
  for (let i = 0; i < 68; i++) {
    let u;
    if (Math.floor((i + 1) * 30 / 68) > Math.floor(i * 30 / 68)) {
      const wl = 9 + hash(i, 11) * 3, truck = hash(i, 14) < 0.3;
      u = { kind: 'float', wl, cab: truck ? 5.2 : 3.6, len: (truck ? 5.2 : 3.6) + 0.9 + wl, truck, type: Math.floor(hash(i, 15) * 5), trac: TRACTORS[Math.floor(hash(i, 16) * TRACTORS.length)],
        c1: VIVID[(i * 3) % 8], c2: VIVID[(i * 3 + 3) % 8], c3: VIVID[(i * 3 + 5) % 8], riders: 5 + Math.floor(hash(i, 17) * 5) };
    } else if (g++ % 2) { const n = 18 + Math.floor(hash(i, 13) * 16); u = { kind: 'band', n, cols: 5, len: 1.6 + Math.ceil(n / 5) * 1.25, look: 32 + (i * 5) % 12 }; }   // guggen: all in one costume
    else { const n = 12 + Math.floor(hash(i, 12) * 14); u = { kind: 'group', n, cols: 4, len: Math.ceil(n / 4) * 1.3 }; }
    u.i = i; u.d = d; d += u.len + 7;
    units.push(u);
  }
  const Lp = d - 7;
  return { units, Lp, v: (Lp + Lr) / (3 * 3600) };
}

// The grandstand (tribuna) on the north-east side of the pitch (14_stadium.py: the pitch-side wall of the block, a -> b, the
// ground, the eaves). Inside the painted block: 14 tiers of seats rising under the roof, 0.82 m deep and 0.44 m high each,
// three stairways; the first tier 0.9 m behind a parapet 1.1 m high. All of that is ASSUMED (no plan of the stand was found):
// only what can be seen from the map's angle under the eaves is drawn, so the deeper tiers stay hidden by the roof.
function standPlan(sd, L) {
  if (!sd || !(sd.eave > sd.base + 3)) return null;
  const len = Math.hypot(sd.b[0] - sd.a[0], sd.b[1] - sd.a[1]), u = [(sd.b[0] - sd.a[0]) / len, (sd.b[1] - sd.a[1]) / len];
  const rows = [], aisles = [0.25, 0.5, 0.75].map(f => f * len);
  for (let i = 0; i < 14; i++) {
    const xs = [];
    for (let x = 0.9; x < len - 0.9; x += 0.56) if (!aisles.some(c => Math.abs(x - c) < 0.8)) xs.push(x + (hash(i, xs.length) - 0.5) * 0.08);
    rows.push({ d: 0.9 + i * 0.82, z: sd.base + 0.85 + i * 0.44, xs, look: Uint8Array.from(xs, (x, j) => L.lookOf(i * 500 + j + 7, false, 0.06)), k: Float32Array.from(xs, (x, j) => hash(i * 500 + j, 77)) });
  }
  return { a: sd.a, u, w: sd.w, len, base: sd.base, eave: sd.eave, rows, aisles, fill: 0 };
}

// "2027-02-07T14:30" read as Bellinzona time -> epoch ms
export function zurichMs(str) {
  const m = /^(\d{4})-(\d\d)-(\d\d)(?:[T ](\d\d):(\d\d))?/.exec(str || '');
  if (!m) return NaN;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 12), +(m[5] || 0));
  const off = t => {                                       // hours Zurich is ahead of UTC at the instant t
    const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Zurich', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(t));
    let o = +p.find(x => x.type === 'hour').value - new Date(t).getUTCHours();
    if (o < -12) o += 24; if (o > 12) o -= 24;
    return o * 3600000;
  };
  return guess - off(guess - off(guess));                  // twice: on the clock-change days the offset at `guess` itself can be the wrong one
}

export class Extras {
  constructor({ world, life, sky, data, matches, params, view, requestDraw }) {
    Object.assign(this, { world, life, sky, data, view, requestDraw });
    this.M = world.enu2px;
    this.seasonForced = !!params.get('stagione'); this.seasonName = params.get('stagione') || null;
    this.force = { meteo: params.get('meteo'), rabadan: params.has('rabadan'), partita: params.has('partita'), scuola: params.get('scuola'), sostare: params.has('sostare') };
    this.matches = (matches && matches.home) || [];
    this.tbd = (matches && matches.tbd) || [];              // home matches with a date but no kick-off time yet
    this.src = liveSources();                               // measurements of now: null in the time machine and the past
    this.drops = []; this.t = 0;
    this.pal = life.pal;
    this.seen = new WeakMap();
    // visible street points, to stand people on
    this.ground = [];
    for (const e of life.edges) if (e.c === 4 || e.c === 5 || e.c === 7) for (let i = 0; i < e.p.length; i += 8) if (e.p[i + 3]) this.ground.push([e.p[i], e.p[i + 1], e.p[i + 2]]);
    const around = (p, R) => { const o = this.ground.filter(g => Math.hypot(g[0] - p[0], g[1] - p[1]) < R && Math.hypot(g[0] - p[0], g[1] - p[1]) > 6); return o.length ? o : [p]; };
    this.schools = (data.schools || []).map((s, i) => ({ ...s, i, far: around(s.p, 55), n: Math.max(8, Math.min(36, Math.round(s.size / 70))) }));
    if (data.stadium && data.stadium.gate) this.stadium = { ...data.stadium, far: around(data.stadium.gate, 90) };
    const line = flat => { const n = flat.length / (flat === this._r ? 4 : 3); return n; };
    this.cables = (data.cables || []).map(c => { const n = c.p.length / 3, cum = new Float32Array(n); for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(c.p[i * 3] - c.p[i * 3 - 3], c.p[i * 3 + 1] - c.p[i * 3 - 2]); return { ...c, n, cum, len: cum[n - 1] }; });
    this.rivers = (data.river || []).map(p => { const n = p.length / 4, cum = new Float32Array(n); for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(p[i * 4] - p[i * 4 - 4], p[i * 4 + 1] - p[i * 4 - 3]); return { p, n, cum, len: cum[n - 1] }; }).filter(r => r.n > 1);
    const rl = this.rivers.reduce((a, r) => a + r.len, 0);
    this.flecks = [];
    for (let k = 0; k < Math.min(520, rl / 14); k++) { let t = hash(k, 1) * rl, ri = 0; while (ri < this.rivers.length - 1 && t > this.rivers[ri].len) t -= this.rivers[ri++].len; this.flecks.push({ ri, s: t, lat: (hash(k, 2) - 0.5) * 30, len: 4 + hash(k, 3) * 7, v: 0.7 + hash(k, 4) * 0.6 }); }
    if (data.parade) { this.parade = smoothRoute(data.parade); this.corteo = corteoPlan(this.parade.len); }
    this.sole = (life.live.squares || []).find(s => s.name === 'Piazza del Sole');
    this.venues = data.venues || null;
    // the crowds (life.js setCrowd): standing places built once per event and kept here by name
    const cw = data.crowds || {};
    if (this.venues && cw.venues) for (const k in this.venues) if (cw.venues[k] && cw.venues[k].length === this.venues[k].p.length / 3) this.venues[k].seen = cw.venues[k];
    this.way = cw.way || ''; this.wayStep = cw.step;
    if (this.parade && cw.parade) {                         // the places along the parade route (23_crowds.py): [x, y, h, s, row] each
      const R = this.parade, n = cw.parade.length / 6, o = [];
      for (let j = 0; j < n; j++) {
        const q = life.at(R, j * cw.step);
        for (let k = 0; k < 2; k++) {
          const side = k ? 1 : -1, c = cw.parade.substr((j * 2 + k) * 3, 3), r0 = 2.6 + 0.2 * +c[0], bits = parseInt(c.slice(1), 16);
          for (let r = 0; r < 8; r++) if (bits & (1 << r)) { const off = side * (r0 + r * cw.rows); o.push(q[0] + q[4] * off, q[1] - q[3] * off, q[2], j * cw.step, r); }
        }
      }
      this.lining = Float32Array.from(o);
    }
    this.cc = new Map(); this.cSig = null;
    const hd = ((world.camera && world.camera.headingDeg) || 20) * D2R;
    this.fwd = [Math.sin(hd), Math.cos(hd)];                // the way the camera looks, along the ground
    this.stand = data.stadium ? standPlan(data.stadium.stand, life) : null;
    if (this.stand) life.under = [(...a) => this.drawStand(...a)];
    if (sky && data.floods) sky.floods = data.floods.slice();
    this.baseFloods = data.floods ? data.floods.length : 0;
    try { adesso(this); } catch { /* the panel is optional */ }
  }

  now() { return Date.now() + (this.life.shiftMs || 0); }
  cal() {                                                   // the date in Bellinzona
    const now = this.now();
    if (!this._cal || Math.abs(now - this._cal.at) > 20000) {
      const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Zurich', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(now));
      const g = k => p.find(x => x.type === k).value;
      this._cal = { at: now, y: +g('year'), m: +g('month'), d: +g('day'), wd: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(g('weekday')), key: `${g('year')}-${g('month')}-${g('day')}` };
    }
    return this._cal;
  }
  hours() { return this.life.clock() / 3600; }

  // the live readings (livedata.js: polled only while the map shows now; null when absent, old or implausible)
  get wx() { return this.src.meteo.value(); }               // { temp, rain, sun, rad, hum, dew, dir, wind, gust, at }
  get hydro() { return this.src.gauge.value(); }            // { flow, height, at }
  floodLevel() { const r = this.src.river.value(); return r && r.level ? r.level : 0; }
  foehn() { return !!foehnOn(); }

  // measurements are of this very moment: they say nothing about another date chosen in the time machine
  live() { return Math.abs(this.life.shiftMs || 0) < 45 * 60000; }

  // public holidays in Ticino, and the school holidays (summer and Christmas by fixed dates, the other weeks from Easter: an approximation of the cantonal calendar)
  holiday() {
    const c = this.cal();
    if (this._hol && this._hol.key === c.key) return this._hol;
    const [em, ed] = easter(c.y), E = Date.UTC(c.y, em - 1, ed), T = Date.UTC(c.y, c.m - 1, c.d), d = Math.round((T - E) / 86400000), md = c.m * 100 + c.d;
    // their names: i18n hol.<month day> (hol.101 Capodanno … hol.1226 Santo Stefano), hol.e<days from Easter> (hol.e0 Pasqua … hol.e60 Corpus Domini)
    const fixed = [101, 106, 319, 501, 629, 801, 815, 1101, 1208, 1225, 1226], moving = [0, 1, 39, 50, 60];
    const name = fixed.includes(md) ? t('hol.' + md) : moving.includes(d) ? t('hol.e' + d) : null;
    const school = !!name || (md >= 620 && md <= 831) || md >= 1223 || md <= 106 || (d >= -50 && d <= -42) || (d >= -2 && d <= 8) || (md >= 1031 && md <= 1107 && c.y === 2026);
    return (this._hol = { key: c.key, name, school });
  }

  weather() {                                               // {kind: 'sereno' | 'pioggia' | 'neve', k: intensity 0..1}
    const f = this.force.meteo;
    if (!f && !this.live()) return { kind: 'sereno', k: 0 };
    if (f === 'pioggia' || f === 'neve') return { kind: f, k: 0.8 };
    if (f === 'sereno' || !this.wx || !(this.wx.rain > 0)) return { kind: 'sereno', k: 0 };
    return { kind: this.wx.temp !== null && this.wx.temp <= 1 ? 'neve' : 'pioggia', k: Math.max(0.3, Math.min(1, this.wx.rain / 1.5)) };
  }

  // The next occurrence of each simulated event, for the "Eventi" buttons of the time machine:
  // [{ id, label, when: 'YYYY-MM-DDTHH:MM' (Bellinzona time), at: [world x, world y] }]
  events() {
    // counted from the real present, not from the moment the time machine is showing
    const pt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Zurich', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
    const g = k => pt.find(x => x.type === k).value;
    const c = { y: +g('year'), m: +g('month'), d: +g('day'), wd: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(g('weekday')), key: `${g('year')}-${g('month')}-${g('day')}` };
    const h = +g('hour') + +g('minute') / 60, DAY = 86400000, md = c.m * 100 + c.d;
    const T = Date.UTC(c.y, c.m - 1, c.d), key = ms => new Date(ms).toISOString().slice(0, 10), out = [];
    const sat = (6 - c.wd + 7) % 7 || (h < 13 ? 0 : 7);       // the Saturday market, 07:30-13:00
    out.push({ id: 'mercato', label: t('ev.mercato'), when: key(T + sat * DAY) + 'T10:00', at: [600, 40] });
    const ms = this.matches.slice().sort((a, b) => (a[0] + a[1]).localeCompare(b[0] + b[1]));
    const kick = m => { const [hh, mm] = m[1].split(':').map(Number); return hh * 60 + mm; };
    const next = ms.find(m => m[0] > c.key || (m[0] === c.key && h * 60 < kick(m) + 110));   // none once the last game in matches.json is over
    if (next) { const k = kick(next) + 20; out.push({ id: 'partita', label: next[2] ? t('ev.partita.vs', { vs: next[2] }) : t('ev.partita'), when: `${next[0]}T${String(Math.floor(k / 60)).padStart(2, '0')}:${String(k % 60).padStart(2, '0')}`, at: [-763, -1769] }); }
    const tbd = this.tbd.filter(m => m[0] >= c.key && (!next || m[0] < next[0])).sort((a, b) => a[0].localeCompare(b[0]))[0];
    if (tbd) out.push({ id: 'partita-tbd', label: t('ev.partita.tbd', { vs: tbd[2] }), when: tbd[0] + 'T12:00', day: true, at: [-763, -1769] });
    const M = this.M, V = this.venues;
    if (V) for (const f of festDates({ ...c, h })) { const v = f.venue === 'stadium' ? this.stadium && this.stadium.c : V[f.venue] && V[f.venue].c; if (!v) continue; out.push({ id: f.id, label: f.label, when: f.when, past: f.past, at: [M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2], M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2]] }); }
    if (this.data.sostare) {                                  // SoStare al Sole: fountain jets from 10 July (tio.ch, 2026) to mid-September, 10:00-20:00 assumed
      const on = md >= 710 && md <= 915, day = on && h < 20 ? c.key : on && md < 915 ? key(T + DAY) : (md >= 710 ? c.y + 1 : c.y) + '-07-10';
      out.push({ id: 'sostare', label: t('ev.sostare'), when: day + 'T15:00', at: [537, -588] });
    }
    // what is on right now goes first, at the present minute: picking it keeps the map (and the live weather) on now
    const now = `${c.key}T${g('hour')}:${g('minute')}`, fs = festState(c, h), rb = fs.rabadan || {};
    const on = { mercato: c.wd === 6 && h >= 7.5 && h < 13, partita: ms.some(m => m[0] === c.key && h * 60 >= kick(m) - 60 && h * 60 < kick(m) + 110),
      natale: fs.natale && fs.natale.open, giubiasco: fs.giubiasco && fs.giubiasco.open, mercatino: fs.mercatino, perbacco: fs.perbacco && fs.perbacco.open, agosto: fs.agosto, gala: fs.gala && fs.gala.phase === 'gare',
      rabadan: rb.open || rb.risotto, corteo: rb.parade === 'corteo', bambini: rb.parade === 'bambini', sostare: md >= 710 && md <= 915 && h >= 10 && h < 20 };
    const NOW = { rabadan: rb.risotto ? t('ev.rabadan.risotto') : t('ev.rabadan'), agosto: fs.agosto && !fs.agosto.fire ? t('ev.agosto.festa') : null };
    for (const id in on) {
      const i = out.findIndex(e => e.id === id);
      if (!on[id] || i < 0) continue;
      const e = out[i], keep = e.when.slice(0, 10) !== c.key || (id === 'agosto' && e.when > now);   // the fireworks keep their own line until they start
      if (!keep) out.splice(i, 1);
      out.push({ ...e, id: keep ? id + '-ora' : id, label: t('ev.now', { label: NOW[id] || e.label }), when: now });
    }
    return out.sort((a, b) => (a.past ? 1 : 0) - (b.past ? 1 : 0) || a.when.localeCompare(b.when));   // an edition already held (no next date announced) goes last
  }

  match() {                                                 // a home game listed in matches.json: -60 min to +115 min around kick-off
    if (this.force.partita) return { on: true, f: 0.5, vs: 'prova' };
    const c = this.cal(), h = this.hours();
    for (const m of this.matches) {
      if (m[0] !== c.key) continue;
      const [hh, mm] = m[1].split(':').map(Number), k = hh + mm / 60;
      if (h > k - 1 && h < k + 2.2) return { on: true, f: (h - (k - 1)) / 3.2, vs: m[2] || '' };
    }
    return { on: false };
  }

  figure(seed, x, y, h, moving, opt = {}) {
    const P = this.pal, r = hash(seed, 9), pick = (a, k) => a[Math.floor(hash(seed, k) * a.length)];
    return { x, y, h, o: { still: !moving, pause: 0, child: !!opt.child, h: opt.child ? 1.2 : 1.55 + r * 0.3, speed: 1.1, ph: r * 6.28, legs: r < 0.6 ? '#2f3540' : '#5b6477',
      coat: opt.vivid ? pick(VIVID, 4) : pick(P.COATS, 4), skin: pick(P.SKIN, 5), hair: pick(P.HAIR, 6) } };
  }

  // people converging on a point (f: 0 -> 1 all arrived) or dispersing from it
  flow(out, site, n, f, leaving, seed, opt) {
    for (let j = 0; j < n; j++) {
      const u = hash(seed + j, 1) * 0.7, g = clamp01((f - u) / 0.3);
      if (g <= 0 || g >= 1) continue;
      const far = site.far[Math.floor(hash(seed + j, 2) * site.far.length)], a = leaving ? g : 1 - g, gate = site.gate || site.p;
      const jx = (hash(seed + j, 3) - 0.5) * 3, jy = (hash(seed + j, 4) - 0.5) * 3;
      out.push(this.figure(seed + j, gate[0] + (far[0] - gate[0]) * a + jx, gate[1] + (far[1] - gate[1]) * a + jy, gate[2] + (far[2] - gate[2]) * a, true, typeof opt === 'function' ? opt(j) : opt));
    }
  }

  // called before the simulation is drawn: fills life.guests / life.props / life.wet
  prepare(dt) {
    this.t += dt;
    const L = this.life, guests = [], props = [], h = this.hours(), cal = this.cal();
    const w = this.weather();
    L.wet = w.kind !== 'sereno';
    this.state = { w, school: null, rabadan: false, match: null, gala: null };
    this.gfx = [];                                           // lines and dots drawn over the people (the javelin, sand)
    // the measured wind, as the way it blows on the ground (te, tn) and across the screen (sx: -1 left .. 1 right); null without a reading
    const m = this.wx, calm = m && m.wind !== null && m.wind < 2;
    this.wind = m && m.wind !== null && (calm || m.dir !== null) ? { kmh: m.wind, gust: m.gust !== null ? m.gust : m.wind, te: calm ? 0 : -Math.sin(m.dir * D2R), tn: calm ? 0 : -Math.cos(m.dir * D2R) } : null;
    if (this.wind) { const M = this.M, k = this.world.mpp || 0.25; this.wind.sx = (M[0][0] * this.wind.te + M[0][1] * this.wind.tn) * k; }
    if (this.sky) { const fo = this.foehn(), st = skyState(m); this.sky.wx = { over: st ? st.over : 0, clear: fo ? 1 : 0, mist: fo ? 0 : mistK(m, this.now()) }; }

    // schools, Monday to Friday
    const wd = cal.wd, sf = this.force.scuola;
    const hol = this.holiday(); if (L.holiday !== !!hol.name) { L.holiday = !!hol.name; L._hourAt = -1e9; }
    if ((wd >= 1 && wd <= 5 && !hol.school) || sf) {
      for (const s of this.schools) {
        const A = s.kind === 'superiore' ? ASSUME.superiore : ASSUME.school;
        for (const key of ['in1', 'out1', 'in2', 'out2']) {
          const win = A[key];
          if (!win || (wd === 3 && (key === 'in2' || key === 'out2') && s.kind !== 'superiore')) continue;
          let f = (h - win[0]) / (win[1] - win[0]);
          if (sf) f = sf === 'uscita' ? (key === 'out1' ? 0.5 : -1) : (key === 'in1' ? 0.5 : -1);
          if (f <= 0 || f >= 1) continue;
          const leaving = key.startsWith('out'), small = s.kind === 'infanzia' || s.kind === 'elementare';
          this.flow(guests, s, s.n, f, leaving, 1000 + s.i * 100, j => ({ child: s.kind !== 'superiore' && !(small && j % 4 === 0) }));   // little ones come with a parent
          this.state.school = leaving ? 'uscita' : 'entrata';
        }
      }
    }

    // the summit cross on the Motto della Croce (told by a resident; its size is assumed)
    props.push({ q: [2397.7, 191.3, 1014.2, 0.94, -0.34], len: 0.55, wid: 0.55, hei: 9, body: '#8d8f94', top: '#c9cbd0', min: 0.3 });
    props.push({ q: [2397.7, 191.3, 1020.4, 0.94, -0.34], len: 4.2, wid: 0.5, hei: 0.5, body: '#8d8f94', top: '#c9cbd0', min: 0.3 });
    // yearly events (fest.js): Rabadan, Natale in Città, 1 August, PerBacco (GalAthletics is drawn with the stadium, below)
    const fs = this.fest = festState(cal, h, this.force);
    L.marketExtra = !!fs.mercatino;
    L.squareClosed = fs.rabadan || fs.natale ? 'Piazza del Sole' : null;   // the usual strollers would walk through the tents
    // the crowds of this moment: crowd(key, level, build) takes the places of a list (built once per key) while level > 0
    const cOn = [], crowd = (key, level, build) => { if (!(level > 0)) return; let c = this.cc.get(key); if (!c) this.cc.set(key, c = build()); if (c.length) cOn.push([key, c, Math.min(1, level)]); };
    const R = this.parade, rb = fs.rabadan;
    const cr = { add: crowd, look: (s, v, k) => L.lookOf(s, v, k), fwd: this.fwd, dist: R ? (x, y) => this.laneDist(x, y) : null, lane: R && rb && rb.parade ? (x, y) => this.laneDist(x, y) : null };
    if (this.venues) festBuild(fs, this.venues, this.t, props, guests, (...a) => this.figure(...a), cr);
    const paraders = L.paraders || (L.paraders = []);
    paraders.length = 0; L.floats = [];
    if (rb) {
      this.state.rabadan = true;
      if (rb.parade && R) this.paradeNow(rb, h, R, crowd, cr.free, paraders, L.floats);
      else if (rb.open && this.lining) crowd('lin-night', 1, () => this.liningList(430, R.len, [0.3, 0.3, 0.3, 0.3, 0.25, 0.2, 0.2, 0.15], cr.free, 0.6));   // the carnival nights: the old town's streets full too
    }
    const mk = L.marketLevel();                             // the Saturday market (life.js): its crowd round the stalls
    if (mk > 0 && L.marketZone) { if (!L.market) L.buildMarket(); crowd('market', mk, () => L.market.crowd); }
    // and the whole way from the Daro crossing on Viale Stazione to Piazza Indipendenza: "folla dalla stazione a piazza Indipendenza in modo continuo,
    // sempre tanta" (the owner, 18 Nov 2026). The parade route is that same way, so its standing places (23_crowds.py) are
    // used for the sides, and the street itself is filled wherever it shows between the roofs (crowds.way). How many is illustrative.
    if (mk > 0 && R && this.lining) crowd('market-way', mk, () => {
      // the market ends at the crossing with the road to Daro and goes no further towards the station (the owner, 18 Nov 2026):
      // the crossing's south side on the route, found by position
      let s0 = 0, best = 1e9;
      for (let i = 0; i < R.n; i++) { const d = Math.hypot(R.p[i * 4] - 369, R.p[i * 4 + 1] - 207.2); if (d < best) { best = d; s0 = R.cum[i]; } }
      const side = this.liningList(s0, R.len + 1, [0.6, 0.55, 0.5, 0.4, 0.3, 0.25, 0.2, 0.15], null, 0), o = Array.from(side);
      const W = this.way || '', st = this.wayStep;           // 23_crowds.py: which of 8 places across the street show, per station
      for (let j = 0, k = 0; j < W.length / 2; j++) {
        const bits = parseInt(W.substr(j * 2, 2), 16);
        if (!bits || j * st < s0) continue;
        const q = L.at(R, j * st);
        for (let b = 0; b < 8; b++, k++) {
          if (!(bits & (1 << b)) || hash(k, 91) > 0.5) continue;
          const lat = -2.45 + 0.7 * b + (hash(k, 92) - 0.5) * 0.3, al = (hash(k, 93) - 0.5) * 0.4;
          o.push(q[0] + q[4] * lat + q[3] * al, q[1] - q[3] * lat + q[4] * al, q[2], L.lookOf(k + 5200, false, 0.1), 0, 0.1 + hash(k, 94) * 0.85);
        }
      }
      return Float32Array.from(o);
    });

    // match day at the Stadio Comunale
    const mt = this.match();
    if (this.stand) this.stand.fill = 0;
    const terraces = () => { const o = []; (this.stadium.seats || []).forEach((p, k) => o.push(p[0], p[1], p[2], L.lookOf(14000 + k, hash(k, 71) < 0.3, 0.06), 5, hash(k, 70))); return Float32Array.from(o); };
    if (mt.on && this.stadium) {
      this.state.match = mt;
      if (mt.f < 0.4) this.flow(guests, this.stadium, 260, mt.f / 0.4, false, 12000, {});
      else if (mt.f > 0.85) this.flow(guests, this.stadium, 260, (mt.f - 0.85) / 0.15, true, 12000, {});
      const g = this.stadium.gate;
      // the covered grandstand full and some people on the open terraces (a share of the places 14_stadium.py gives them:
      // ASSUMED, a home game of AC Bellinzona draws far fewer than GalAthletics), and the game itself (kick-off at f = 0.3125,
      // half-time 0.547-0.625, final whistle 0.885)
      const fill = clamp01((mt.f - 0.12) / 0.2) * clamp01((0.97 - mt.f) / 0.07), S = this.stadium;
      crowd('terr', fill * 0.25, terraces);
      if (this.stand) this.stand.fill = fill * 0.9;
      const play = (mt.f >= 0.3125 && mt.f < 0.547) || (mt.f >= 0.625 && mt.f < 0.885);
      if (play && S.pitch) {
        const [P0, P1, P2] = S.pitch, at = (u, v) => [P1[0] + (P2[0] - P1[0]) * u + (P0[0] - P1[0]) * v, P1[1] + (P2[1] - P1[1]) * u + (P0[1] - P1[1]) * v];
        const bu = 0.5 + 0.38 * Math.sin(this.t * 0.11) + 0.08 * Math.sin(this.t * 0.47), bv = 0.5 + 0.34 * Math.sin(this.t * 0.17 + 1.3);
        const FORM = [[0.04, 0.5], [0.2, 0.15], [0.18, 0.38], [0.18, 0.62], [0.2, 0.85], [0.36, 0.2], [0.34, 0.42], [0.34, 0.6], [0.36, 0.8], [0.47, 0.35], [0.47, 0.65]];
        for (let team = 0; team < 2; team++) FORM.forEach(([fu, fv], i) => {
          const u0 = team ? 1 - fu : fu, pull = i === 0 ? 0.04 : 0.34;
          const u = u0 + (bu - 0.5) * pull * 1.5 + 0.02 * Math.sin(this.t * 0.9 + i * 2.1 + team), v = fv + (bv - fv) * pull + 0.02 * Math.cos(this.t * 0.8 + i * 1.7 + team);
          const [x, y] = at(clamp01(u), clamp01(v)), fg = this.figure(15000 + team * 20 + i, x, y, P1[2], true, {});
          fg.o.coat = i === 0 ? (team ? '#e8d23a' : '#3aa35a') : team ? '#f2f2f2' : '#8f1d2c'; fg.o.legs = team ? '#f2f2f2' : '#8f1d2c'; guests.push(fg);
        });
        const [rx, ry] = at(clamp01(bu - 0.05), clamp01(bv + 0.06)), rf = this.figure(15099, rx, ry, P1[2], true, {}); rf.o.coat = '#16181c'; rf.o.legs = '#16181c'; guests.push(rf);
      }
      for (let j = 0; j < 14; j++) guests.push(this.figure(13000 + j, g[0] + (hash(j, 51) - 0.5) * 14, g[1] + (hash(j, 52) - 0.5) * 14, g[2], false, {}));
    }
    // GalAthletics (fest.js): a sold-out meeting (over 6000 people in 2024; the grandstand sold out in 2026) against a few hundred
    // at a league game, so the grandstand is full and the open terraces are packed (14_stadium.py gives them one place per
    // 0.6 m2; the number drawn is illustrative, not a count). Races on the track round the pitch: its oval is fitted to the
    // painted track (inner edge 39.5 m from the pitch axis, so straights of 75 m for 400 m in lane 1, centre 2.5 m towards the
    // south-east end); which races, and where the 100 m starts, are ASSUMED. Field events in field(): also illustrative.
    const ga = fs.gala;
    if (ga && this.stadium && !mt.on) {
      const S = this.stadium, g = S.gate;
      this.state.gala = ga;
      if (ga.phase !== 'gare') this.flow(guests, S, 600, ga.k, ga.phase === 'uscita', 12000, {});
      const fill = ga.phase === 'arrivo' ? clamp01(ga.k * 1.3) : ga.phase === 'uscita' ? clamp01(1 - ga.k * 1.6) : 1;
      crowd('terr', fill * 0.97, terraces);
      if (this.stand) this.stand.fill = fill * 0.98;
      crowd('village', 1, () => {                            // the village with food by the gate, open to all: on the streets round it
        const o = []; let j = 0;
        for (const e of L.edges) if (e.c === 4 || e.c === 5 || e.c === 7) for (let i = 0; i < e.p.length; i += 4) {
          if (!e.p[i + 3] || Math.hypot(e.p[i] - g[0], e.p[i + 1] - g[1]) > 38) continue;
          for (let k = 0; k < 3; k++, j++) o.push(e.p[i] + (hash(j, 51) - 0.5) * 2.6, e.p[i + 1] + (hash(j, 52) - 0.5) * 2.6, e.p[i + 2], L.lookOf(13000 + j, false, 0.12), 0, hash(j, 53));
        }
        return Float32Array.from(o);
      });
      if (ga.phase === 'gare' && S.pitch) {
        const [P0, P1, P2] = S.pitch, L = Math.hypot(P2[0] - P1[0], P2[1] - P1[1]), Wd = Math.hypot(P0[0] - P1[0], P0[1] - P1[1]), h0 = P1[2];
        const U = [(P2[0] - P1[0]) / L, (P2[1] - P1[1]) / L], N = [(P0[0] - P1[0]) / Wd, (P0[1] - P1[1]) / Wd];
        const at = (u, v) => [P1[0] + U[0] * (L / 2 + 2.5 + u) + N[0] * (Wd / 2 + v), P1[1] + U[1] * (L / 2 + 2.5 + u) + N[1] * (Wd / 2 + v)];   // metres from the oval's centre
        const SL = 75, R1 = 40.1, lap = (s, r) => {          // anticlockwise round the oval, r = radius of the lane; R1 = middle of lane 1
          const per = 2 * SL + 2 * Math.PI * r; s = ((s % per) + per) % per;
          if (s < SL) return at(-SL / 2 + s, -r); s -= SL;
          if (s < Math.PI * r) { const a = s / r - Math.PI / 2; return at(SL / 2 + r * Math.cos(a), r * Math.sin(a)); } s -= Math.PI * r;
          if (s < SL) return at(SL / 2 - s, r); s -= SL;
          const a = s / r + Math.PI / 2; return at(-SL / 2 + r * Math.cos(a), r * Math.sin(a));
        };
        const runner = (seed, p, moving) => { const fg = this.figure(seed, p[0], p[1], h0, moving, {}); fg.o.coat = VIVID[seed % VIVID.length]; fg.o.legs = fg.o.skin; if (moving) fg.o.speed = 2.2; guests.push(fg); };
        for (let j = 0; j < 9; j++) runner(16000 + j, lap(this.t * 7 - j * 1.7 - hash(j, 81) * 2, R1 + (j % 2) * 1.22), true);   // a middle-distance race, at 800 m pace
        const ts = this.t % 45, run = Math.max(0, ts - 3), d = run < 10.5 ? 100 * Math.pow(run / 10.5, 1.15) : 100 + Math.min(10, (run - 10.5) * 3);
        if (ts < 24) for (let l = 0; l < 8; l++) runner(16100 + l, at(50 - d * (1 + (hash(l, 82) - 0.5) * 0.04), R1 + l * 1.22), run > 0 && run < 14);   // a 100 m along the north-east straight, every 45 s
        this.field(at, U, N, h0, guests, props);
      }
    }
    if (this.sky && this.sky.floods && this.stadium) {      // floodlit pitch
      const c = this.stadium.c, M = this.M;
      this.sky.floods.length = this.baseFloods;
      if (mt.on || ga) for (const [dx, dy] of [[-45, -30], [45, -30], [-45, 30], [45, 30], [0, 0]]) this.sky.floods.push([M[0][0] * (c[0] + dx) + M[0][1] * (c[1] + dy) + M[0][2] * c[2], M[1][0] * (c[0] + dx) + M[1][1] * (c[1] + dy) + M[1][2] * c[2], 2]);
    }

    // passengers on the platform while a timetabled train stands in the station
    for (const t of L.trains) {
      if (!t.sched || t.freight || !(t.dwell > 0)) { if (this.seen.has(t) && !(t.dwell > 0)) this.seen.delete(t); continue; }
      if (!this.seen.has(t)) { this.seen.set(t, this.t); this.chime = true; }
      const el = this.t - this.seen.get(t), pn = parseInt(t.sched.plat, 10) || 1, side = pn % 2 ? 1 : -1, PA = L.platforms && L.platforms.ax, low = pn === 1 || pn === 3 || pn === 6 ? -1 : 1;   // platforms 1, 3, 6 lie on the station-building side of their track, 2 and 4 on the far side
      for (let k = 0; k < t.wagons; k++) {
        const q = L.behind(t, 13 + k * 25.6);
        if (!q || !q[5]) continue;
        const nx = PA ? PA[1] * low : q[4] * side, ny = PA ? -PA[0] * low : -q[3] * side, sd = t.sched.dep + k * 13;
        for (let j = 0; j < 3; j++) {                        // getting off: step out, then walk along the platform
          const e2 = el - 2 - j * 1.6;
          if (e2 < 0 || e2 > 16) continue;
          const lat = Math.min(4.6, 2.3 + e2 * 0.6), al = (j - 1) * 5 + Math.max(0, e2 - 4) * 1.2 * (hash(sd, j) < 0.5 ? 1 : -1);
          guests.push(this.figure(sd + j, q[0] + nx * lat + q[3] * al, q[1] + ny * lat + q[4] * al, q[2], true, {}));
        }
        for (let j = 0; j < 3; j++) {                        // getting on: wait back from the edge, board in the last seconds
          if (hash(sd, 20 + j) < 0.3) continue;
          const g = clamp01((16 - t.dwell - j * 2) / 5);
          if (g >= 1) continue;
          const lat = 4.8 - g * 2.6, al = (j - 1) * 6 * (1 - g) + (hash(sd, 30 + j) - 0.5) * 2;
          guests.push(this.figure(sd + 40 + j, q[0] + nx * lat + q[3] * al, q[1] + ny * lat + q[4] * al, q[2], g > 0, {}));
        }
      }
    }

    // café terraces: tables and parasols outside the bars and restaurants, people at them in opening hours when it is dry
    const winter = cal.m === 12 || cal.m <= 2, sitting = h >= 8 && h < 23 && !L.wet && !winter;
    (this.data.terraces || []).forEach((tr, ti) => {
      const col = ['#efe6d0', '#c8402f', '#2f6f9f', '#3f8a55', '#e8e2d2'][ti % 5];
      tr.t.forEach((p, k) => {
        props.push({ q: [p[0], p[1], p[2], 0.94, -0.34], len: 0.9, wid: 0.9, hei: 0.75, body: '#6b5a48', top: '#e9e2d2', min: 1.6 });
        if (!winter) props.push({ q: [p[0], p[1], p[2] + 2.2, 0.94, -0.34], len: 2.5, wid: 2.5, hei: 0.14, body: col, top: col, min: 1.0 });
        if (sitting) for (const sx of [-0.9, 0.9]) { const sd = 20000 + ti * 50 + k * 2 + (sx > 0 ? 1 : 0); if (hash(sd, 3) < (h > 11 && h < 22 ? 0.75 : 0.4)) { const f = this.figure(sd, p[0] + 0.94 * sx, p[1] - 0.34 * sx, p[2], false, {}); f.o.h = 1.15; guests.push(f); } }
      });
    });

    // "SoStare al Sole": potted trees, red modular seats and the play fountain of Piazza del Sole in summer.
    // Documented: about twenty trees, modular seats, 100 m2 fountain with jets (10 July - mid September). The layout is taken from the city's rendering.
    const so = this.data.sostare, doy = cal.m * 100 + cal.d;
    this.sostare = !!so && (this.force.sostare || (this.seasonForced && this.seasonName === 'estate') || (doy >= 710 && doy <= 1031 && !this.seasonForced));
    if (this.sostare) {
      const jets = (this.force.sostare || (doy >= 710 && doy <= 915) || this.seasonForced) && h >= 10 && h < 20 && !L.wet;
      const f = so.fountain;
      props.push({ q: [f[0], f[1], f[2], f[3], f[4]], len: 10, wid: 10, hei: 0.35, body: '#3b3d42', top: jets ? '#7fa3b3' : '#55595f', min: 0.8 });
      if (jets) for (let i = 0; i < 40; i++) {
        const a = (hash(i, 61) - 0.5) * 9, b = (hash(i, 62) - 0.5) * 9, up = Math.abs(Math.sin(this.t * 1.7 + i * 1.9)) * 1.1;
        props.push({ q: [f[0] + f[3] * a - f[4] * b, f[1] + f[4] * a + f[3] * b, f[2] + 0.5 + up * 1.6], round: 0.22, body: 'rgba(235,246,252,0.85)', min: 1.6 });
        if (i < 7 && hash(i, 63) < 0.8) guests.push(this.figure(31000 + i, f[0] + f[3] * b + f[4] * a * 0.9, f[1] + f[4] * b - f[3] * a * 0.9, f[2], true, { child: true, vivid: true }));
      }
      so.seats.forEach((p, k) => {
        props.push({ q: [p[0], p[1], p[2], 0.94, -0.34], len: 0.62, wid: 0.62, hei: p[3], body: '#c23a2b', top: '#dc4a37', min: 1.5 });
        if (sitting && p[3] < 0.6 && hash(k, 64) < (h > 11 && h < 21 ? 0.3 : 0.12)) { const g = this.figure(32000 + k, p[0] + 0.3, p[1], p[2], false, {}); g.o.h = 1.2; guests.push(g); }
      });
      for (const p of so.trees) {
        props.push({ q: [p[0], p[1], p[2] + 0.45], round: 0.62, flat: true, body: '#3a3b3e', top: '#55575b', min: 1.2 });
        props.push({ q: [p[0], p[1], p[2] + 3.3], round: 1.25, body: '#4f8a3c', top: '#6aa64f', trunk: 2.8, shadow: 3.3, min: 0.9 });
      }
    }

    // cable cars
    this.cabins = [];
    for (const c of this.cables) {
      const A = ASSUME.cable, trip = c.len / A.speed, slot = Math.floor(h * 60 / A.every), ph = (h * 60 - slot * A.every) * 60;
      const wedClosed = wd === 3 && h >= 8 && h < 10, works = (A.shut || []).some(r => cal.key >= r[0] && cal.key <= r[1]), open = h >= A.open[0] && h <= A.open[1] && !wedClosed && !works;
      const f = open ? clamp01(ph / trip) : 0, e = f * f * (3 - 2 * f), up = slot % 2 === 0;
      for (const first of [true, false]) {
        const s = (first === up ? e : 1 - e) * c.len;
        let i = 1; while (i < c.n - 1 && c.cum[i] < s) i++;
        const a = (i - 1) * 3, b = i * 3, d = Math.max(1e-3, c.cum[i] - c.cum[i - 1]), g = clamp01((s - c.cum[i - 1]) / d), p = c.p;
        const q = [p[a] + (p[b] - p[a]) * g, p[a + 1] + (p[b + 1] - p[a + 1]) * g, p[a + 2] + (p[b + 2] - p[a + 2]) * g - 2.6, (p[b] - p[a]) / d, (p[b + 1] - p[a + 1]) / d];
        props.push({ q, len: 2.8, wid: 1.7, hei: 2.3, body: '#d8362f', top: '#f2f2f2', min: 0.3 });
        this.cabins.push({ q, name: c.name, moving: open && f > 0 && f < 1, going: (first === up) ? t('cable.up') : t('cable.down'), open, why: works ? t('cable.works') : wedClosed ? t('cable.wed') : t('cable.off') });
      }
    }
    L.guests = guests; L.props = props;
    const sig = cOn.map(c => c[0]).join('|');               // a new set of crowds: merged and sorted once (life.js)
    if (sig !== this.cSig) { this.cSig = sig; L.setCrowd(cOn.map(c => c[1])); }
    L.crowdLv = cOn.map(c => c[2]);
  }

  // distance from a point to the parade route's centre line (metres), for keeping its lane free
  laneDist(x, y) {
    const p = this.parade.p; let best = 1e9;
    for (let i = 0; i < p.length; i += 8) { const d = (p[i] - x) * (p[i] - x) + (p[i + 1] - y) * (p[i + 1] - y); if (d < best) best = d; }
    return Math.sqrt(best);
  }

  // places along the parade route between s = a and b (metres from the station) taken by spectators: row r (0 = at the lane)
  // taken with chance probs[r], a share `vivid` in carnival colours, children mostly in front
  liningList(a, b, probs, free, vivid) {
    const Z = this.lining, L = this.life, o = [];
    if (!Z) return new Float32Array(0);
    for (let i = 0, k = 0; i < Z.length; i += 5, k++) {
      const s = Z[i + 3], r = Z[i + 4];
      if (s < a || s >= b || r >= probs.length || hash(k, 31) > probs[r]) continue;
      const x = Z[i] + (hash(k, 32) - 0.5) * 0.35, y = Z[i + 1] + (hash(k, 33) - 0.5) * 0.35;
      if (free && !free(x, y)) continue;
      o.push(x, y, Z[i + 2], L.lookOf(k + 17, hash(k, 34) < vivid, r < 2 ? 0.22 : 0.05), 0, hash(k, 35));
    }
    return Float32Array.from(o);
  }

  // the Rabadan parades now: paraders into `out` ([e, n, h, look, phase, 0] each), floats into `floats`, the crowd lining the way
  paradeNow(rb, h, R, crowd, free, out, floats) {
    const L = this.life;
    if (rb.parade === 'corteo') {
      const C = this.corteo; let ts = (h - 13.5) * 3600;
      if (this.force.rabadan) ts = ((ts % 10800) + 10800) % 10800;
      const head = C.v * ts;                                // metres the head has come from the station
      for (const u of C.units) {
        const sf = head - u.d;                              // where this number's front is
        if (sf <= 0 || sf - u.len >= R.len) continue;
        if (u.kind === 'float') this.float(u, sf, R, floats); else this.walkers(u, sf, R, out);
      }
      // the crowd along the whole way, several deep, in twelve stretches: each goes home within a quarter of an hour of the tail passing
      const tail = head - C.Lp, P8 = [0.95, 0.93, 0.9, 0.86, 0.8, 0.72, 0.62, 0.5];
      for (let k = 0; k < 12; k++) { const a = k * R.len / 12, b = (k + 1) * R.len / 12, sm = (a + b) / 2; crowd('lin-c' + k, tail < sm ? 1 : 1 - (tail - sm) / (C.v * 900), () => this.liningList(a, b + (k === 11 ? 1 : 0), P8, free, 0.4)); }
      return;
    }
    // Friday: the children, starting from Piazza Indipendenza; Saturday: guggen only (as before: groups looping along the way)
    const gap = 26, units = Math.ceil((R.len + 200) / gap), back = rb.parade === 'bambini';
    for (let u = 0; u < units; u++) {
      let s = (this.t * 0.7 + u * gap) % (units * gap) - 100;
      if (s < 2 || s > R.len - 2) continue;
      if (back) s = R.len - s;
      const q = L.at(R, s), dir = back ? -1 : 1, band = rb.parade === 'guggen', n = band ? 12 : 16;
      if (!q[5]) continue;
      for (let j = 0; j < n; j++) out.push(q[0] - dir * q[3] * (j >> 1) * 1.3 + q[4] * ((j & 1) - 0.5) * 1.6, q[1] - dir * q[4] * (j >> 1) * 1.3 - q[3] * ((j & 1) - 0.5) * 1.6, q[2],
        band ? 32 + (u * 5) % 12 : L.lookOf(7000 + u * 20 + j, true, j % 4 ? 0.95 : 0), this.t * 5 + j * 0.9, 0);
    }
    crowd('lin-' + rb.parade, 1, () => this.liningList(0, R.len + 1, [0.88, 0.65, 0.4], free, 0.4));
  }

  // a number on foot: rows of four (a group) or five (a guggen band, all in one costume, a drum major in front)
  walkers(u, sf, R, out) {
    const L = this.life, band = u.kind === 'band', gap = band ? 1.25 : 1.3, lead = band ? 1.6 : 0;
    if (band && sf - 0.4 < R.len) { const q = L.at(R, sf - 0.4); if (q[5]) out.push(q[0], q[1], q[2], 32 + (u.look - 26) % 12, this.t * 4.5, 0); }   // the drum major, in another costume
    for (let j = 0; j < u.n; j++) {
      const s = sf - lead - 0.6 - Math.floor(j / u.cols) * gap;
      if (s < 0.5 || s > R.len - 0.5) continue;
      const q = L.at(R, s);
      if (!q[5]) continue;
      const lat = ((j % u.cols) - (u.cols - 1) / 2) * 1.15 + (hash(u.i * 60 + j, 3) - 0.5) * 0.3;
      out.push(q[0] + q[4] * lat, q[1] - q[3] * lat, q[2], band ? u.look : L.lookOf(u.i * 60 + j, true, 0.15), this.t * 4.5 + j * 0.9, 0);
    }
  }

  // a float: the tractor (or lorry) and the wagon, each turned along the way where it is; hidden where the painting's
  // buildings cover the street (the route's visibility flags)
  float(u, sf, R, out) {
    const L = this.life, seen = (s, half) => s - half > 0 && s + half < R.len && L.at(R, s)[5] && L.at(R, s - half)[5] && L.at(R, s + half)[5];
    const cs = sf - u.cab / 2, ws = sf - u.cab - 0.9 - u.wl / 2;
    if (seen(cs, u.cab / 2)) { const q = L.at(R, cs); out.push({ e: q[0], n: q[1], h: q[2], draw: () => this.drawCab(u, q) }); }
    if (seen(ws, u.wl / 2)) { const q = L.at(R, ws); out.push({ e: q[0], n: q[1], h: q[2], draw: (ctx, P, ppm, spr) => this.drawWagon(u, q, ctx, P, ppm, spr) }); }
  }
  drawCab(u, q) {
    const box = this.life._box, [e, n, h, te, tn] = q, at = (f, r, z) => [e + te * f + tn * r, n + tn * f - te * r, h + z, te, tn];
    if (u.truck) { box(at(-0.6, 0, 0.35), u.cab - 1.2, 2.4, 0.55, '#2a2c30', '#2a2c30', false, null); box(at(0, 0, 0.6), u.cab, 2.5, 2.6, u.trac, shadeHex(u.trac, 1.12), true, null); return; }
    for (const r of [-1, 1]) box(at(-0.75, r * 1.05, 0), 1.6, 0.5, 1.6, '#1d1e21', '#2a2c30', false, null);        // the big back wheels
    box(at(0.55, 0, 0.4), u.cab - 1.1, 1.3, 1.1, u.trac, shadeHex(u.trac, 1.1), false, null);                      // bonnet
    box(at(-0.6, 0, 0.45), 1.6, 1.6, 2.3, '#2c3440', u.trac, false, null);                                         // cab
  }
  drawWagon(u, q, ctx, P, ppm, spr) {
    const L = this.life, box = L._box, [e, n, h, te, tn] = q, wl = u.wl, at = (f, r, z) => [e + te * f + tn * r, n + tn * f - te * r, h + z, te, tn];
    const ball = (p, r, body, top) => { const c = P(p[0], p[1], p[2]); ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(c[0], c[1], r * ppm, r * ppm * 0.95, 0, 0, 6.3); ctx.fill(); ctx.fillStyle = top; ctx.beginPath(); ctx.ellipse(c[0] - r * ppm * 0.25, c[1] - r * ppm * 0.3, r * ppm * 0.5, r * ppm * 0.45, 0, 0, 6.3); ctx.fill(); };
    box(at(0, 0, 0.35), wl, 3.2, 0.85, u.c1, shadeHex(u.c1, 1.15), false, '#ffffff');                              // the platform and its skirt
    const items = [], put = (p, fn) => items.push([P(p[0], p[1], p[2])[1], fn]);
    const zt = 1.2, half = wl / 2;
    let ride = [-half + 1, half - 1], rz = zt;                                                                      // where the riders stand
    if (u.type === 0) {                                     // a castle: two towers and a wall
      for (const f of [-half + 1.3, half - 1.3]) { const p = at(f, 0.3, zt); put(p, () => box(p, 2.2, 2.4, 4.6, u.c2, u.c3, false, '#ffffff')); }
      const p = at(0, 0.9, zt); put(p, () => box(p, wl - 4.6, 0.6, 2.8, u.c2, u.c3, false, null)); ride = [-half + 2.8, half - 2.8];
    } else if (u.type === 1) {                              // a big carnival head with a hat
      const p = at(-half / 2, 0, zt + 2.5); put(at(-half / 2, 0, zt), () => { ball(p, 2.4, u.c2, shadeHex(u.c2, 1.25)); box(at(-half / 2, 0, zt + 4.6), 1.6, 1.6, 1.6, u.c3, shadeHex(u.c3, 1.2), false, null); });
      ride = [0.5, half - 0.8];
    } else if (u.type === 2) {                              // a stage with the riders up on it
      const p = at(-0.3, 0, zt); put(p, () => box(p, wl - 1.4, 2.7, 2.2, u.c2, u.c3, false, '#ffffff')); rz = zt + 2.2; ride = [-half + 1.4, half - 1.6];
    } else if (u.type === 3) {                              // a stepped pyramid
      const f = -half / 2;
      for (let k = 0; k < 3; k++) { const p = at(f, 0, zt + k * 1.4); put(at(f, 0, zt - k * 0.01), () => box(p, half - k * 1.2, 2.8 - k * 0.85, 1.4, k % 2 ? u.c3 : u.c2, k % 2 ? u.c2 : u.c3, false, null)); }
      ride = [0.6, half - 0.8];
    } else {                                                // a boat with a mast
      const p = at(0, 0, zt); put(p, () => { box(p, wl - 0.8, 2.8, 1.1, u.c2, u.c3, false, '#ffffff'); box(at(0.4, 0, zt + 1.1), 0.25, 0.25, 5.8, '#6b4027', '#6b4027', false, null); box(at(1.5, 0, zt + 2.6), 2.1, 0.12, 3.3, '#f4f1ea', '#f4f1ea', false, null); });
      rz = zt + 1.1; ride = [-half + 1, -0.6];
    }
    if (spr) for (let j = 0; j < u.riders; j++) {           // people on board, in costume
      const p = at(ride[0] + (ride[1] - ride[0]) * (j + 0.5) / u.riders, ((j % 2) - 0.5) * 1.3, rz);
      put(p, () => { const c = P(p[0], p[1], p[2]); spr(c[0], c[1], L.lookOf(u.i * 50 + j, true, 0.25), 0); });
    }
    items.sort((a, b) => a[0] - b[0]);
    for (const it of items) it[1]();
  }

  // GalAthletics field events, all ASSUMED and illustrative (which events are shown, where, how often, how far): the javelin in
  // the south-east half-circle inside the track, thrown along the pitch (a 21 m run-up: shorter than a real one, the
  // half-circle is only 27 m deep) - a thrower runs up and lets go, the javelin flies its arc and sticks in the grass, two
  // officials measure the throw, the next one comes; the long jump on the runway between the track and the grandstand (that
  // strip and its two pits are mapped in OpenStreetMap, ways 1477028745, 1477028753 and 1477028754; the jump goes towards the
  // south-east one, the one painted as sand); the high-jump mat
  // with its group at the north-west end. Metres are from the oval's centre (u along the pitch towards the south-east, v across
  // it towards the grandstand). Figures are drawn 1.7 times life size, so the javelin is drawn half as long again as a real
  // one (3.9 m) and carried, and let go, at the height of a drawn shoulder.
  field(at, U, N, h0, guests, props) {
    const t = this.t, g = this.gfx, OFF = '#e8d23a';
    const fig = (seed, u, v, z, moving, coat) => { const p = at(u, v), f = this.figure(seed, p[0], p[1], h0 + z, moving, {}); f.o.coat = coat; f.o.legs = coat === OFF ? '#2f3540' : f.o.skin; if (moving) f.o.speed = 2.2; guests.push(f); };
    const pt = (u, v, z) => { const p = at(u, v); return [p[0], p[1], h0 + z]; };
    const line = (a, b, col, w, alpha) => g.push({ a, b, col, w, alpha });
    // the javelin: a throw every 38 s
    {
      const C = 38, cyc = Math.floor(t / C), tc = t - cyc * C, kit = VIVID[cyc % 8], A0 = 75, ARC = 54.5, G = 9.81;
      const D = 58 + hash(cyc, 41) * 26, th = 34 * D2R, v0 = Math.sqrt(D * G / Math.sin(2 * th)), vx = v0 * Math.cos(th), vz = v0 * Math.sin(th), z0 = 2.7;
      const T = (vz + Math.sqrt(vz * vz + 2 * G * z0)) / G, side = (hash(cyc, 42) - 0.5) * 0.22, tR = 7.2, tL = tR + T;
      const uL = ARC - 0.6 - vx * T, vL = 0.35 + side * vx * T;
      let tu = null, mv = false;                          // the thrower: waits, runs up, lets go at the arc, stops, walks back
      if (tc < 3) tu = A0; else if (tc < tR) { tu = A0 - (A0 - ARC) * Math.pow((tc - 3) / (tR - 3), 1.3); mv = true; }
      else if (tc < tR + 0.8) { tu = ARC - 0.8 * Math.sin((tc - tR) / 0.8 * 1.5708); mv = true; } else if (tc < tR + 6) tu = ARC - 0.8;
      else if (tc < tR + 20) { tu = ARC - 0.8 + (tc - tR - 6) / 14 * (A0 + 2 - ARC); mv = true; }
      if (tu !== null) fig(16300 + (cyc % 50), tu, tc > tR + 6 ? -2.5 : 0, 0, mv, kit);
      if (tc < tR) { line(pt(tu + 1.6, 0.35, 2.35), pt(tu - 2.3, 0.35, 3.0), '#3a3d44', 2.3, 0.7); line(pt(tu + 1.6, 0.35, 2.35), pt(tu - 2.3, 0.35, 3.0), '#e4e6e8', 1.3, 1); }   // carried over the shoulder
      else if (tc < tL) {                                 // in flight, nose along its path, with its shadow on the grass
        const s = tc - tR, cu = ARC - 0.6 - vx * s, cv = 0.35 + side * vx * s, cz = z0 + vz * s - G * s * s / 2, dz = vz - G * s, l = Math.hypot(vx, dz), du = -vx / l * 1.95, dzz = dz / l * 1.95;
        line(pt(cu - du, cv, 0.05), pt(cu + du, cv, 0.05), 'rgba(25,28,55,1)', 1.2, 0.25);
        line(pt(cu - du, cv, cz - dzz), pt(cu + du, cv, cz + dzz), '#3a3d44', 2.4, 0.7); line(pt(cu - du, cv, cz - dzz), pt(cu + du, cv, cz + dzz), '#e4e6e8', 1.4, 1);
      } else if (tc < tL + 13) line(pt(uL, vL, 0), pt(uL + 3.2, vL, 2.24), '#d9dcdf', 1.3, 1);                    // stuck in the grass
      if (tc > tL + 6.5 && tc < tL + 13) line(pt(uL, vL, 0.05), pt(ARC, 0, 0.05), '#f2d23a', 0.8, 0.7);         // the tape
      // the officials: one goes out to the mark and back, one stays at the arc
      const ou = tc < tL + 0.5 || tc > tL + 19 ? 0 : tc < tL + 6.5 ? (tc - tL - 0.5) / 6 : tc < tL + 13 ? 1 : 1 - (tc - tL - 13) / 6;
      fig(16290, 30 + (uL + 0.6 - 30) * ou, -24 + (vL - 1.2 + 24) * ou, 0, ou > 0 && ou < 1, OFF);
      fig(16291, ARC - 1.2, -2.6, 0, false, OFF);
      fig(16292, A0 + 2, -5, 0, false, VIVID[(cyc + 1) % 8]); fig(16293, A0 + 3.4, -6.4, 0, false, VIVID[(cyc + 2) % 8]);   // the next throwers
    }
    // the long jump: a jump every 26 s, towards the sand pit at the south-east end of the runway (the one painted as sand)
    {
      const C = 26, tt = t + 9, cyc = Math.floor(tt / C), tc = tt - cyc * C, kit = VIVID[(cyc + 3) % 8], V0 = 54, U0 = 12, B = 52.5, J = 7.5, E = B + J + 0.2;
      let u = null, v = V0, z = 0, mv = false;
      if (tc < 2) u = U0; else if (tc < 7) { u = U0 + (B - U0) * Math.pow((tc - 2) / 5, 1.25); mv = true; }
      else if (tc < 7.85) { const s = (tc - 7) / 0.85; u = B + J * s; z = 5.2 * s * (1 - s); mv = true; }
      else if (tc < 9.5) u = E; else if (tc < 12) { u = E; v = V0 + (tc - 9.5) / 2.5 * 4.6; mv = true; }
      else if (tc < 22) { u = E - (tc - 12) / 10 * (E - U0 - 3); v = V0 + 4.6; mv = true; }
      if (u !== null) fig(16400 + (cyc % 50), u, v, z, mv, kit);
      if (tc > 7.85 && tc < 8.8) { const s = (tc - 7.85) / 0.95; for (let k = 0; k < 8; k++) { const a = k * 0.785 + cyc, r = 0.4 + s * 1.3; g.push({ dot: pt(E + Math.cos(a) * r, V0 + Math.sin(a) * r * 0.7, 0.3 + s * 0.6 * (1 - s) * 2), r: 0.22, col: '#d9c08a', alpha: 1 - s }); } }   // sand
      fig(16410, B, V0 - 3.4, 0, false, OFF); fig(16411, E + 1, V0 - 3.6, 0, false, OFF);
      for (let k = 0; k < 3; k++) fig(16420 + k, U0 - 4 - k * 1.6, V0 + 5 + (k % 2) * 0.8, 0, false, VIVID[(cyc + 4 + k) % 8]);
    }
    // the high jump: the mat, the uprights and the bar at the north-west end, athletes waiting and officials (no jump drawn)
    {
      const mu = -62, q = (u, v, z) => { const p = at(u, v); return [p[0], p[1], h0 + z, U[0], U[1]]; }, qn = (u, v, z) => { const p = at(u, v); return [p[0], p[1], h0 + z, N[0], N[1]]; };
      props.push({ q: q(mu - 1.5, 0, 0), len: 4, wid: 5.5, hei: 0.7, body: '#2d5fa8', top: '#3d74c4', min: 0.8 });
      for (const s of [-1, 1]) props.push({ q: q(mu + 0.8, s * 2.9, 0), len: 0.14, wid: 0.14, hei: 2.6, body: '#9aa0a8', top: '#c9cdd2', min: 1.4 });
      props.push({ q: qn(mu + 0.8, 0, 2.2), len: 5.8, wid: 0.07, hei: 0.07, body: '#f2d23a', top: '#f6e27a', min: 1.4 });
      for (let k = 0; k < 6; k++) fig(16500 + k, mu + 9 + (k % 3) * 1.6 + hash(k, 83), -8 + Math.floor(k / 3) * 2 + Math.sin(t * 0.2 + k) * 0.3, 0, false, k === 2 ? OFF : VIVID[(k * 3) % 8]);
      fig(16510, mu + 1.5, 4.4, 0, false, OFF);
    }
  }

  // drawn right after the simulation: river, cables, hover targets
  draw(ctx, toScreen, ppm, W, H, dt) {
    const M = this.M, P = (e, n, h) => toScreen(M[0][0] * e + M[0][1] * n + M[0][2] * h, M[1][0] * e + M[1][1] * n + M[1][2] * h);
    this._P = P; this._ppm = ppm;
    if (this.gfx && this.gfx.length && ppm > 1.2) {         // the javelin, the tape, the sand
      ctx.save(); ctx.lineCap = 'round';
      for (const g of this.gfx) {
        ctx.globalAlpha = g.alpha;
        if (g.dot) { const c = P(g.dot[0], g.dot[1], g.dot[2]); ctx.fillStyle = g.col; ctx.beginPath(); ctx.arc(c[0], c[1], Math.max(0.8, g.r * ppm), 0, 6.2832); ctx.fill(); continue; }
        const a = P(g.a[0], g.a[1], g.a[2]), b = P(g.b[0], g.b[1], g.b[2]);
        ctx.strokeStyle = g.col; ctx.lineWidth = Math.max(1, g.w * ppm / 5); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      }
      ctx.restore();
    }
    const lv = this.floodLevel();
    if (lv >= 2 && this.rivers.length) {                    // FOEN flood danger 2 or more at Bellinzona: the river runs brown along its course
      ctx.save(); ctx.lineCap = ctx.lineJoin = 'round';
      const a = [0, 0, 0.3, 0.38, 0.46, 0.52][lv];
      for (const [wm, f] of [[44, 0.5], [32, 1]]) {         // a soft edge, then the body of the water: grey-brown, as the Ticino runs in a flood
        ctx.strokeStyle = `rgba(140,116,82,${a * f})`; ctx.lineWidth = Math.max(2, wm * ppm);
        for (const r of this.rivers) {
          ctx.beginPath(); let on = false;
          for (let i = 0; i < r.n; i++) { const j = i * 4; if (!r.p[j + 3]) { on = false; continue; } const q = P(r.p[j], r.p[j + 1], r.p[j + 2]); if (on) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); on = true; }
          ctx.stroke();
        }
      }
      ctx.restore();
    }
    const wd = this.wind;
    if (wd && ppm > 0.7) {                                  // the flag: limp in a calm, straight out from about 24 km/h, snapping in gusts
      const k = clamp01((wd.kmh - 2) / 22), g = clamp01((wd.gust - wd.kmh) / 25), L = Math.max(4.2, 15 / ppm), Hh = L * 0.85;
      const droop = (1 - k) * 1.35 + 0.1, out = Math.cos(droop) * L, down = Math.sin(droop) * L;
      ctx.save(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      FLAGS.forEach(([e, n, h0, pole], i) => {
        const top = h0 + Math.max(pole, Hh * 1.6), b = P(e, n, top);
        if (b[0] < -60 || b[1] < -60 || b[0] > W + 60 || b[1] > H + 60) return;
        const a = P(e, n, h0), lo = P(e, n, top - Hh), wave = Math.sin(this.t * (1.5 + 8 * k) + i * 2.1) * (0.06 + 0.14 * g) * (0.3 + k);
        const fe = e + wd.te * out - wd.tn * wave * L, fn = n + wd.tn * out + wd.te * wave * L;
        const t1 = P(fe, fn, top - down), t0 = P(fe, fn, top - Hh - down * 0.8);   // the fly edge, top and bottom
        ctx.strokeStyle = '#4a4744'; ctx.lineWidth = Math.max(1, ppm * 0.14);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        // the arms of Bellinzona: a white serpent on red («biscione bianco in campo rosso», without crown or child)
        ctx.fillStyle = '#c8231c'; ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(t1[0], t1[1]); ctx.lineTo(t0[0], t0[1]); ctx.lineTo(lo[0], lo[1]); ctx.closePath(); ctx.fill();
        const at = (u, v) => { const x0 = b[0] + (t1[0] - b[0]) * u, y0 = b[1] + (t1[1] - b[1]) * u, x1 = lo[0] + (t0[0] - lo[0]) * u, y1 = lo[1] + (t0[1] - lo[1]) * u; return [x0 + (x1 - x0) * v, y0 + (y1 - y0) * v]; };
        const wpx = Math.hypot(t1[0] - b[0], t1[1] - b[1]);
        if (wpx > 5) {
          ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(0.9, wpx * 0.09); ctx.beginPath();
          for (let q = 0; q <= 28; q++) { const v = 0.14 + 0.74 * q / 28, p = at(0.5 + 0.2 * Math.sin(q / 28 * Math.PI * 7) * (0.55 + 0.45 * q / 28), v); q ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }
          ctx.stroke();
          const hd = at(0.5, 0.12); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(hd[0], hd[1], Math.max(0.9, wpx * 0.075), 0, 7); ctx.fill();
        }
      });
      ctx.restore();
    }
    if (ppm > 0.3 && this.rivers.length) {                  // the Ticino flows: faster and busier when the gauge reads high
      const flow = this.hydro && this.hydro.flow !== null ? this.hydro.flow : 60, v = Math.max(0.6, Math.min(4, 0.5 + flow / 50));
      const share = Math.max(0.35, Math.min(1, flow / 150));
      ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(255,255,255,0.42)'; ctx.lineWidth = Math.max(1, ppm * 0.45);
      ctx.beginPath();
      this.flecks.forEach((f, k) => {
        const r = this.rivers[f.ri];
        f.s += v * f.v * dt; if (f.s > r.len - f.len - 1) f.s = 1;
        if (k / this.flecks.length > share) return;
        const a = this.life.at(r, f.s), b = this.life.at(r, f.s + f.len);
        if (!a[5] || !b[5]) return;
        const p0 = P(a[0] + a[4] * f.lat, a[1] - a[3] * f.lat, a[2]), p1 = P(b[0] + b[4] * f.lat, b[1] - b[3] * f.lat, b[2]);
        if (p0[0] < -20 || p0[1] < -20 || p0[0] > W + 20 || p0[1] > H + 20) return;
        ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]);
      });
      ctx.stroke();
    }
    if (ppm > 0.12) {
      ctx.strokeStyle = 'rgba(40,44,52,0.75)'; ctx.lineWidth = Math.max(0.8, ppm * 0.12);
      for (const c of this.cables) { ctx.beginPath(); for (let i = 0; i < c.n; i++) { const p = P(c.p[i * 3], c.p[i * 3 + 1], c.p[i * 3 + 2]); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); } ctx.stroke(); }
      for (const cb of this.cabins || []) {
        const p = P(cb.q[0], cb.q[1], cb.q[2] + 1.2);
        (this.life.hot || (this.life.hot = [])).push({ x: p[0], y: p[1], r: Math.max(8, 3 * ppm), info: () => ({ kind: 'bus', title: t('cable.title'), to: cb.name.replace(/^Funivia /, ''), sub: !cb.open ? cb.why : cb.moving ? cb.going : t('cable.station') }) });
      }
    }
  }

  // the grandstand (standPlan) on the painted block's pitch side: called by life.js before the people. Behind the parapet, under
  // the eaves, the tiers from the back to the front, each with its seats and whoever sits there; clipped to the opening, so the
  // roof hides what lies too deep under it. In the colours of the painted front (sampled from the tiles) and of grey concrete
  // (the colour of the real seats was not found: neutral).
  drawStand(ctx, P, ppm, W, H, L) {
    const S = this.stand;
    if (!S || ppm < 0.3) return;
    const F = (x, d, z) => P(S.a[0] + S.u[0] * x + S.w[0] * d, S.a[1] + S.u[1] * x + S.w[1] * d, z);
    const A = F(0, 0, S.base), B = F(S.len, 0, S.eave);
    if (Math.max(A[0], B[0]) < -40 || Math.min(A[0], B[0]) > W + 40 || Math.max(A[1], B[1]) < -60 || Math.min(A[1], B[1]) > H + 60) return;
    const poly = L._poly, top = S.eave - 0.5, par = S.base + 1.1, e0 = 0.4, e1 = S.len - 0.4;
    const quad = (x0, x1, d0, d1, z0, z1, col) => poly([F(x0, d0, z0), F(x1, d0, z0), F(x1, d1, z1), F(x0, d1, z1)], col);
    const segs = [], ai = S.aisles; let x = e0;
    for (const c of ai) { segs.push([x, c - 0.55]); x = c + 0.55; }
    segs.push([x, e1]);
    ctx.save();
    const o = [F(e0, 0, par), F(e1, 0, par), F(e1, 0, top), F(e0, 0, top)];
    ctx.beginPath(); o.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
    ctx.fillStyle = '#45413c'; ctx.fill(); ctx.clip();
    const yTop = F(S.len / 2, 0, top)[1], fill = S.fill, spr = ppm >= 2.4 && L.sprite, xs = [], ls = [];
    for (let i = S.rows.length - 1; i >= 0; i--) {
      const r = S.rows[i];
      if (F(S.len / 2, r.d, r.z - 0.44)[1] < yTop - 1) continue;          // all of it under the roof, out of sight
      quad(e0, e1, r.d, r.d, r.z - 0.44, r.z, '#78746c');                 // the riser
      quad(e0, e1, r.d, r.d + 0.82, r.z, r.z, '#a39e94');                 // the tread
      for (const c of ai) { quad(c - 0.55, c + 0.55, r.d, r.d, r.z - 0.44, r.z, '#8b867d'); quad(c - 0.55, c + 0.55, r.d, r.d + 0.82, r.z, r.z, '#b5b0a6'); }   // the stairs
      if (ppm > 0.9) for (const [a, b] of segs) quad(a, b, r.d + 0.55, r.d + 0.55, r.z, r.z + 0.4, '#5e5a55');   // the seat backs
      if (fill > 0) for (let j = 0; j < r.xs.length; j++) {
        if (r.k[j] >= fill) continue;
        const c = F(r.xs[j], r.d + 0.38, r.z);
        if (spr) spr(c[0], c[1], r.look[j], 5); else { xs.push(c[0], c[1]); ls.push(r.look[j]); }
      }
    }
    if (!spr && xs.length && L.specks) L.specks(xs, ls, ls.length, true);
    ctx.restore();
    quad(0, S.len, 0, 0, S.base, par, '#ece0cc');                        // the parapet
    quad(0, e0, 0, 0, par, top, '#ece0cc'); quad(e1, S.len, 0, 0, par, top, '#ece0cc');   // the ends
    quad(0, S.len, 0, 0, top, S.eave, '#d6cab6');                         // the edge of the roof
    if (ppm > 1.5) quad(0, S.len, 0, 0, par - 0.12, par, '#c9bda9');      // the top of the parapet
  }

  // drawn last, over everything: rain or snow
  overlay(ctx, W, H, dt) {
    // headlights and tail lights of moving vehicles, over the dusk and the night
    const lk = this.sky && this.sky.cur ? this.sky.cur[4] : 0, B = this.life.beams;     // as lit as the sky is now (it fades)
    if (lk > 0.15 && B && B.length && this._P && this._ppm > 0.55) {
      const P = this._P, ppm = this._ppm, rr = Math.max(1.1, ppm * 0.22);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const b of B) {
        const [e, n, h, te, tn, hl, hw] = b, re = tn, rn = -te, c = (f, r) => P(e + te * f + re * r, n + tn * f + rn * r, h + 0.3);
        const a = c(hl, 0), z = c(hl + 13, 0);
        if (a[0] < -40 || a[1] < -40 || a[0] > W + 40 || a[1] > H + 40) continue;
        const g = ctx.createLinearGradient(a[0], a[1], z[0], z[1]); g.addColorStop(0, `rgba(255,238,190,${0.42 * lk})`); g.addColorStop(1, 'rgba(255,238,190,0)');
        const p1 = c(hl, -hw * 0.9), p2 = c(hl + 13, -hw - 2.6), p3 = c(hl + 13, hw + 2.6), p4 = c(hl, hw * 0.9);
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.lineTo(p3[0], p3[1]); ctx.lineTo(p4[0], p4[1]); ctx.closePath(); ctx.fill();
        ctx.fillStyle = `rgba(255,246,214,${0.95 * lk})`;
        for (const r of [-0.7, 0.7]) { const q = c(hl, hw * r); ctx.beginPath(); ctx.arc(q[0], q[1], rr, 0, 6.2832); ctx.fill(); }
        ctx.fillStyle = `rgba(255,40,30,${0.85 * lk})`;
        for (const r of [-0.7, 0.7]) { const q = c(-hl, hw * r); ctx.beginPath(); ctx.arc(q[0], q[1], rr * 0.8, 0, 6.2832); ctx.fill(); }
      }
      ctx.restore();
    }
    if (this.fest && this.fest.agosto && this.fest.agosto.fire && this._P) fireworks(ctx, this._P, this.t, [404, -54, 73]);   // from the Castello di Montebello
    const w = this.state ? this.state.w : { kind: 'sereno' };
    if (w.kind === 'sereno') return;
    const snow = w.kind === 'neve', want = Math.round((snow ? 420 : 620) * w.k * (W * H) / 1e6);
    while (this.drops.length < want) this.drops.push({ x: Math.random() * W, y: Math.random() * H, v: 0.7 + Math.random() * 0.6, p: Math.random() * 6.28 });
    this.drops.length = Math.min(this.drops.length, want);
    ctx.save();
    ctx.fillStyle = snow ? 'rgba(228,234,246,0.12)' : `rgba(62,76,104,${0.10 + 0.12 * w.k})`;
    ctx.fillRect(0, 0, W, H);
    // slant from the measured wind (straight down without a reading): sideways speed over falling speed, rain ~7 m/s, snow ~1 m/s;
    // a metre across the screen is 4 px, a metre of fall 2.83 px (the 45° view), hence the 1.41
    const ms = this.wind ? this.wind.kmh / 3.6 * this.wind.sx * 1.41 : 0, r = snow ? Math.max(-2.5, Math.min(2.5, ms)) : Math.max(-1.2, Math.min(1.2, ms / 7));
    const respawn = () => Math.random() * (W + Math.abs(r) * H) - (r > 0 ? r * H : 0);
    if (snow) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      for (const d of this.drops) { d.y += 55 * d.v * dt; d.x += (r * 55 * d.v + Math.sin(this.t * 1.3 + d.p) * 22) * dt; if (d.y > H) { d.y = -4; d.x = respawn(); } ctx.beginPath(); ctx.arc(d.x, d.y, 1.1 + d.v, 0, 6.2832); ctx.fill(); }
    } else {
      ctx.strokeStyle = 'rgba(215,228,245,0.5)'; ctx.lineWidth = 1.1; ctx.beginPath();
      for (const d of this.drops) { d.y += 900 * d.v * dt; d.x += r * 900 * d.v * dt; if (d.y > H) { d.y = -20; d.x = respawn(); } ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + r * 19, d.y + 19); }
      ctx.stroke();
    }
    ctx.restore();
  }

  status(season) {
    this.seasonName = season;
    const s = this.state || {}, out = [t('season.' + season)];
    const live = this.live();
    if (live && this.wx && this.wx.temp !== null) out.push(f1(this.wx.temp) + ' °C');
    // dry only when the rain gauge says so; nothing while the first answer is on its way
    const wt = !s.w ? null : s.w.kind !== 'sereno' ? t('wx.' + s.w.kind) : !live ? t('wx.notlive') : !this.wx ? null : this.wx.rain !== null ? t('wx.asciutto') : null;
    if (wt) out.push(wt);
    if (live && this.hydro && this.hydro.flow !== null) out.push(t('status.ticino', { q: Math.round(this.hydro.flow) }));
    const wd = live && this.wind;                           // wind only when it is worth a word: 25 km/h on average, or gusts of 50
    if (live && this.foehn()) out.push(t('status.foehn')); else if (wd && wd.gust >= 50) out.push(t('status.gust', { v: f0(wd.gust) })); else if (wd && wd.kmh >= 25) out.push(t('status.wind', { v: f0(wd.kmh) }));
    const hol = this.holiday(); if (hol.name) out.push(hol.name); else if (hol.school && this.cal().wd >= 1 && this.cal().wd <= 5) out.push(t('status.schoolhol'));
    const f = this.fest || {};
    if (this.life.marketLevel() > 0 && !f.mercatino) out.push(t('status.market'));
    if (s.rabadan) out.push(t(f.rabadan && f.rabadan.parade ? 'status.rabadan.' + f.rabadan.parade : f.rabadan && f.rabadan.risotto ? 'status.rabadan.risotto' : 'status.rabadan'));
    if (f.natale) out.push(t('status.natale')); if (f.giubiasco && f.giubiasco.open) out.push(t('status.giubiasco')); if (f.mercatino) out.push(t('status.mercatino')); if (f.agosto) out.push(t(f.agosto.fire ? 'status.agosto.fire' : 'status.agosto')); if (f.perbacco) out.push('PerBacco!');
    if (s.school) out.push(t('status.school.' + s.school));
    if (s.match) out.push(s.match.vs ? t('status.match.vs', { vs: s.match.vs }) : t('status.match'));
    if (s.gala) out.push(t('status.gala.' + s.gala.phase));
    return out.join(' · ');
  }

  // ---- sound (synthesised in the browser, off until switched on) ----
  soundOn() {
    if (this.ac) { this.ac.resume(); this.muted = false; this.master.gain.value = 0.9; return; }
    const ac = this.ac = new (window.AudioContext || window.webkitAudioContext)();
    this.master = ac.createGain(); this.master.gain.value = 0.9; this.master.connect(ac.destination);
    const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), d = buf.getChannelData(0);
    let last = 0; for (let i = 0; i < d.length; i++) { const wn = Math.random() * 2 - 1; last = (last + 0.03 * wn) / 1.03; d[i] = last * 3.2 + wn * 0.15; }
    const loop = (type, freq, q) => { const s = ac.createBufferSource(); s.buffer = buf; s.loop = true; const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; const g = ac.createGain(); g.gain.value = 0; s.connect(f); f.connect(g); g.connect(this.master); s.start(); return g; };
    this.gCrowd = loop('bandpass', 620, 0.6); this.gRain = loop('highpass', 2600, 0.3); this.gRiver = loop('lowpass', 420, 0.4);
    this.lastHour = Math.floor(this.hours()) % 24;
  }
  soundOff() { if (this.ac) { this.muted = true; this.master.gain.value = 0; } }
  strike(at, f0, vol) {                                     // one bell stroke: a few inharmonic partials dying away
    const ac = this.ac;
    for (const [m, a, dec] of [[0.5, 0.5, 4.5], [1, 1, 3.2], [1.19, 0.6, 2.4], [1.5, 0.35, 1.8], [2, 0.45, 1.5], [2.51, 0.2, 1.0], [3.01, 0.12, 0.7]]) {
      const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = f0 * m;
      g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(vol * a * 0.16, at + 0.012); g.gain.exponentialRampToValueAtTime(1e-4, at + dec);
      o.connect(g); g.connect(this.master); o.start(at); o.stop(at + dec + 0.1);
    }
  }
  near(px, py, reach) { const v = this.view(); return clamp01(1 - Math.hypot(v.x - px, v.y - py) / reach) * clamp01((v.z - 3) / 3); }
  sound() {
    if (!this.ac || this.muted) return;
    const ac = this.ac, s = this.state || {}, tgt = (g, v) => g.gain.setTargetAtTime(v, ac.currentTime, 0.6);
    const M = this.M, pxy = p => [M[0][0] * p[0] + M[0][1] * p[1] + M[0][2] * p[2], M[1][0] * p[0] + M[1][1] * p[1] + M[1][2] * p[2]];
    let crowd = this.life.marketLevel() * this.near(600, 40, 1800);
    if (s.rabadan && this.sole) crowd = Math.max(crowd, this.near(...pxy([198, 161, -13]), 2200));
    if ((s.match || s.gala) && this.stadium) crowd =Math.max(crowd, this.near(...pxy(this.stadium.c), 2200));
    tgt(this.gCrowd, crowd * 0.5);
    tgt(this.gRain, s.w && s.w.kind === 'pioggia' ? 0.10 + 0.18 * s.w.k : 0);
    let river = 0; if (this.rivers.length) { const v = this.view(); for (const r of this.rivers) for (let i = 0; i < r.n; i += 12) { const p = pxy([r.p[i * 4], r.p[i * 4 + 1], r.p[i * 4 + 2]]); river = Math.max(river, clamp01(1 - Math.hypot(v.x - p[0], v.y - p[1]) / 700)); } river *= clamp01((this.view().z - 5) / 2); }
    tgt(this.gRiver, river * 0.22);
    const hr = Math.floor(this.hours()) % 24, sh = this.life.shiftMs || 0;   // the station clock can read 24:00:xx for a few seconds after midnight
    if (sh !== this.bellShift) { this.bellShift = sh; this.lastHour = hr; }  // a jump of the time machine is not the hour striking
    if (hr !== this.lastHour) {                             // the Collegiata strikes the hour
      this.lastHour = hr;
      const b = this.data.bell, vol = b ? 0.25 + 0.75 * this.near(b[0], b[1], 5000) : 0.3, n = hr % 12 || 12;
      for (let i = 0; i < n; i++) this.strike(ac.currentTime + 0.2 + i * 1.9, 196, vol);
    }
    if (this.chime) {                                       // a train has pulled in: station chime
      this.chime = false;
      const st = this.life.live.stations[0], p = pxy(st), vol = this.near(p[0], p[1], 2500);
      if (vol > 0.05) [659, 523, 784].forEach((f, i) => { const o = ac.createOscillator(), g = ac.createGain(), at = ac.currentTime + 0.1 + i * 0.42; o.type = 'triangle'; o.frequency.value = f; g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(0.12 * vol, at + 0.02); g.gain.exponentialRampToValueAtTime(1e-4, at + 0.9); o.connect(g); g.connect(this.master); o.start(at); o.stop(at + 1); });
    } 
  }
}
