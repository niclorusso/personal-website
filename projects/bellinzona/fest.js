// Yearly events of Bellinzona: when each one is on, and what stands where.
//
// From published sources (checked 13 November 2026):
// - Rabadan: Thursday to Shrove Tuesday. Official 2026 leaflet map "La Città del Carnevale" (rabadan.ch): the
//   Capannone Eventi in Piazza del Sole and seven society tents (Taia e Medega beside Viale Stazione towards Piazza del
//   Sole; Bau Band in Piazza Buffi; AC Ravecchia in Piazza Nosetto; HC Biasca 3 Valli, Sonada Balossa and FC Moderna in
//   Piazza Governo, with the street food; Sci Club Lavorgo in Piazza Indipendenza), the guggen concert in Piazza
//   Collegiata, music stands near Nosetto/Collegiata and in Piazza Governo. Opening hours of 2026. Sunday parade from
//   13:30 along Viale Stazione, past Collegiata and Nosetto, to Piazza Indipendenza: in 2026 55 numbers (15 floats, 19
//   groups, 19 guggen). Friday 14:30 children's parade starting from Piazza Indipendenza; Saturday 14:00 guggen
//   parade; Tuesday 11:30 risotto at the Capannone.
// - Natale in Città (ticino.ch): Piazza del Sole, last Thursday of November to 6 January; ice rink of 500 m2, chalet of
//   about 500 m2, tube slide, Santa's hut, carousel, eight food stands; opening hours of 2026/27. Christmas tree in
//   Piazza Collegiata. Christmas market on the two Sundays before Christmas, 10:00-18:00.
// - 1 August (bellinzonaevalli.ch, tio.ch): Piazza del Sole from 17:30; fireworks planned around 22:00 from the
//   Castello di Montebello (called off in 2018, 2024 and 2026 for drought, wind or fire risk: shown here as planned).
// - PerBacco! (perbaccobellinzona.ch): Thursday to Sunday at the start of September; wine bars and food stands in Piazza
//   Nosetto, Collegiata, Governo and Buffi; two grape-treading vats in Piazza Governo. The Sunday falls between 3 and 9
//   September in every edition found (2017: 31 Aug-3 Sep, VareseNews; 2019 and 2024: 5-8 Sep, Newly Swissed and
//   MySwitzerland; 2022: 1-4 Sep; 2025: 4-7 Sep; 2026: 3-6 Sep, MySwitzerland). A Sunday on 2 September (2029) is unchecked.
// - GalAthletics Bellinzona (galathletics.ch, read 17 Nov 2026): the international athletics meeting at the Stadio Comunale
//   (World Athletics Continental Tour), called Galà dei Castelli until 2024 (renamed for 2026, RSI 27 Nov 2025). Paid entry:
//   the grandstand was sold out in 2026, tickets left for the open terraces along most of the perimeter (laRegione, 28 Aug 2026);
//   a village with food outside the stadium, open to all, before and after (ticino.ch). Over 6000 spectators in 2024 (RSI).
//
// ASSUMED, because no source gives a plan to scale: the size of every structure, where exactly it stands inside its
// square, how many people are there, how long the parades last.

import { t } from './i18n.js?v=20261118e';

const DAY = 86400000;
const VIVID = ['#e23a3a', '#f2c21a', '#2f9e5b', '#2d6fd6', '#b04ad0', '#f07f2e', '#19b5b0', '#f25fa0'];
const hash = (a, b = 0) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };

export function easter(y) {                                 // Gregorian computus -> [month, day]
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  return [Math.floor((h + l - 7 * m + 114) / 31), ((h + l - 7 * m + 114) % 31) + 1];
}
export const lastThuNov = y => 30 - ((new Date(Date.UTC(y, 10, 30)).getUTCDay() - 4 + 7) % 7);
export const firstSunSep = y => 1 + ((7 - new Date(Date.UTC(y, 8, 1)).getUTCDay()) % 7);
export const xmasSundays = y => { const last = 24 - new Date(Date.UTC(y, 11, 24)).getUTCDay(); return [last - 7, last]; };
export const perbaccoSun = y => { const d = firstSunSep(y); return d >= 3 ? d : d + 7; };   // day of September of PerBacco's last day
// GalAthletics: [date, first start, last start] of the published programme, in hours. 2026: pre-meeting from 17:10, top
// events from 18:15, last race (women's 100 m) at 20:05 (official programme PDF); box office open from 16:00 (laRegione).
// The dates follow no rule (Galà dei Castelli: Tue 14 Sep 2021, Mon 4 Sep 2023, Mon 9 Sep 2024, none in 2025; GalAthletics:
// Sun 30 Aug 2026), so none is guessed: the next one goes here once it is announced (none was by 17 Nov 2026).
export const GALA = [['2026-08-30', 17 + 10 / 60, 20 + 5 / 60]];

// c = { y, m, d, wd } in Bellinzona, h = hour of the day. Before 06:00 the night still belongs to the evening before.
export function festState(c, h, force = {}) {
  let s = { y: c.y, m: c.m, d: c.d, wd: c.wd, hh: h };
  if (h < 6) { const t = new Date(Date.UTC(c.y, c.m - 1, c.d) - DAY); s = { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), wd: t.getUTCDay(), hh: h + 24 }; }
  const out = {}, md = s.m * 100 + s.d, within = (o, x) => !!o && x >= o[0] && x <= o[1];
  const [em, ed] = easter(s.y), back = Math.round((Date.UTC(s.y, em - 1, ed) - Date.UTC(s.y, s.m - 1, s.d)) / DAY);   // 52 = Thursday ... 47 = Tuesday
  if (force.rabadan) out.rabadan = { open: 1, parade: 'corteo', risotto: false };
  else if (back <= 52 && back >= 47) {
    out.rabadan = {
      open: within({ 52: [21, 28], 51: [19, 29], 50: [18, 29], 49: [17.75, 25], 48: [19, 27], 47: [19, 29] }[back], s.hh) ? 1 : 0,
      parade: back === 49 && s.hh >= 13.5 && s.hh < 16.5 ? 'corteo' : back === 51 && s.hh >= 14.5 && s.hh < 16 ? 'bambini' : back === 50 && s.hh >= 14 && s.hh < 16 ? 'guggen' : null,
      risotto: back === 47 && s.hh >= 11.5 && s.hh < 14,
    };
  }
  if ((s.m === 11 && s.d >= lastThuNov(s.y)) || s.m === 12 || (s.m === 1 && s.d <= 6))
    out.natale = { open: within({ 0: [10, 25], 1: [16, 25], 2: [16, 25], 3: [14, 25], 4: [16, 25], 5: [16, 26], 6: [10, 26] }[s.wd], s.hh) ? 1 : 0 };
  if (s.m === 12 && xmasSundays(s.y).includes(s.d) && s.hh >= 10 && s.hh < 18) out.mercatino = true;
  // Giubiasco, Piazza Grande (tio.ch): 5 December to 6 January, Wednesday to Sunday; the closing hour is not published (23:00 assumed)
  if ((s.m === 12 && s.d >= 5) || (s.m === 1 && s.d <= 6)) out.giubiasco = { open: within({ 3: [12, 23], 4: [17, 23], 5: [17, 23], 6: [10, 23], 0: [10, 23] }[s.wd], s.hh) ? 1 : 0 };
  if (md === 801 && s.hh >= 17.5 && s.hh <= 25) out.agosto = { fire: s.hh >= 22 && s.hh < 22.34 };
  const pb = Math.round((Date.UTC(s.y, 8, perbaccoSun(s.y)) - Date.UTC(s.y, s.m - 1, s.d)) / DAY);   // 3 = Thursday (may be in August) ... 0 = Sunday
  if (pb >= 0 && pb <= 3) out.perbacco = { open: within({ 4: [17, 24], 5: [17, 25], 6: [10, 25], 0: [10, 16] }[s.wd], s.hh) ? 1 : 0 };
  const ga = GALA.find(g => g[0] === `${s.y}-${String(s.m).padStart(2, '0')}-${String(s.d).padStart(2, '0')}`);
  if (ga) {   // the public comes from 70 minutes before (the box office, 2026); the last race is over 5 minutes after its start; everyone is out half an hour later (assumed)
    const a = ga[1] - 7 / 6, z = ga[2] + 1 / 12;
    if (s.hh >= a && s.hh < z + 0.5) out.gala = s.hh < ga[1] ? { phase: 'arrivo', k: (s.hh - a) / (ga[1] - a) } : s.hh < z ? { phase: 'gare', k: (s.hh - ga[1]) / (z - ga[1]) } : { phase: 'uscita', k: (s.hh - z) / 0.5 };
  }
  return out;
}

// The next date of each event, counted from the day c (real present; c.h = hour, so that what ended earlier today is
// skipped): [{ id, label, when, venue }]
export function festDates(c) {
  const T = Date.UTC(c.y, c.m - 1, c.d), h = c.h || 0, key = ms => new Date(ms).toISOString().slice(0, 10), out = [];
  const left = (day, until) => day > T || (day === T && h < until);         // not over yet
  const pick = f => { for (const y of [c.y - 1, c.y, c.y + 1]) { const r = f(y); if (r && left(r.end, r.until || 24)) return r; } return null; };
  const rb = pick(y => { const [em, ed] = easter(y), E = Date.UTC(y, em - 1, ed); return { E, end: E - 47 * DAY }; });
  if (rb) {
    const day = k => rb.E - k * DAY;
    if (left(day(50), 29)) out.push({ id: 'rabadan', label: t('fest.rabadan.sabato'), when: key(day(50)) + 'T22:00', venue: 'sole' });
    if (left(day(49), 16.5)) out.push({ id: 'corteo', label: t('fest.rabadan.corteo'), when: key(day(49)) + 'T14:30', venue: 'collegiata' });
    if (left(day(51), 16)) out.push({ id: 'bambini', label: t('fest.rabadan.bambini'), when: key(day(51)) + 'T14:50', venue: 'collegiata' });
    if (!left(day(49), 16.5)) out.push({ id: 'rabadan', label: t('fest.rabadan.ultime'), when: key(T) + 'T22:00', venue: 'sole' });   // Sunday evening to Tuesday
  }
  const nat = pick(y => ({ start: Date.UTC(y, 10, lastThuNov(y)), end: Date.UTC(y + 1, 0, 6) }));
  if (nat) out.push({ id: 'natale', label: t('fest.natale'), when: key(Math.max(nat.start, T)) + 'T18:30', venue: 'sole' });
  const gb = pick(y => ({ y, start: Date.UTC(y, 11, 5), end: Date.UTC(y + 1, 0, 6), until: 23 }));
  if (gb) {
    let d = Math.max(gb.start, left(T, 23) ? T : T + DAY);
    const open = () => { while ([1, 2].includes(new Date(d).getUTCDay())) d += DAY; };
    open(); if (d > gb.end) { d = Date.UTC(gb.y + 1, 11, 5); open(); }                                // closed on the last days: next season
    out.push({ id: 'giubiasco', label: t('fest.giubiasco'), when: key(d) + 'T18:00', venue: 'giubiasco' });
  }
  const mk = pick(y => { const su = xmasSundays(y).map(d => Date.UTC(y, 11, d)).filter(d => left(d, 18)); return su.length ? { day: su[0], end: su[0], until: 18 } : null; });
  if (mk) out.push({ id: 'mercatino', label: t('fest.mercatino'), when: key(mk.day) + 'T15:00', venue: 'collegiata' });
  const ag = pick(y => ({ end: Date.UTC(y, 7, 1) }));
  if (ag) out.push({ id: 'agosto', label: t('fest.agosto'), when: key(ag.end) + 'T22:05', venue: 'sole' });
  const pb = pick(y => ({ end: Date.UTC(y, 8, perbaccoSun(y)), until: 16 }));
  if (pb) out.push({ id: 'perbacco', label: t('fest.perbacco'), when: T >= pb.end ? key(pb.end) + 'T12:00' : key(pb.end - DAY) + 'T18:30', venue: 'nosetto' });
  // GalAthletics: the next announced edition, else the last one held (no date is guessed); shown 20 minutes before the last race
  const gd = GALA.map(g => ({ g, day: Date.UTC(+g[0].slice(0, 4), +g[0].slice(5, 7) - 1, +g[0].slice(8, 10)) })), gn = gd.find(x => left(x.day, x.g[2] + 1 / 12));
  const gl = gn || gd[gd.length - 1];
  if (gl) { const mm = Math.round((gl.g[2] - 1 / 3) * 60); out.push({ id: 'gala', label: gn ? t('fest.gala') : t('fest.gala.past', { year: gl.g[0].slice(0, 4) }), when: `${gl.g[0]}T${String(Math.floor(mm / 60)).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`, venue: 'stadium', past: !gn }); }
  return out;
}

// What stands in the squares. V = venues from extras.json, T = seconds, fig = Extras.figure, cr = the crowds of extras.js:
// cr.add(key, level, build) gives a list of standing places [e, n, h, look, pose, k, ...] built once per key, cr.look(seed,
// vivid, kids) a look, cr.fwd the direction the camera looks along the ground, cr.dist(x, y) the distance to the parade route
// (cr.lane the same, only while a parade is on); festBuild leaves in cr.free(x, y) whether a point is clear of what it set up.
// How many people stand in a square is ASSUMED and deliberately generous ("pienissimo", the owner, 18 Nov 2026): a number of
// people per standing point of the square (16_events.py samples the squares every 2.5 m), on the points whose ground shows
// in the painting (23_crowds.py), away from the tents and stands and from the ground behind them that they hide.
export function festBuild(st, V, T, props, guests, fig, cr) {
  if (!V || !V.sole) return;
  const box = (x, y, h, len, wid, hei, body, top, stripe, min = 0.35, ux = 0.928, uy = -0.373) => props.push({ q: [x, y, h, ux, uy], len, wid, hei, body, top, stripe: stripe || undefined, min });
  const SU = [0.928, -0.373], SV = [0.373, 0.928], sc = V.sole.c;        // the axes of Piazza del Sole
  const sole = (a, b) => [sc[0] + SU[0] * a + SV[0] * b, sc[1] + SU[1] * a + SV[1] * b];
  // footprints people keep out of: [x, y, half-length, half-width, height, axis]. Someone standing behind a tent, where the tent
  // hides the ground, would be drawn over it: the ground up to the tent's height behind it (a 45° view) is kept clear too
  const blocks = [], fwd = cr.fwd || [0.342, 0.94];
  const block = (x, y, a, b, hei, ux = SU[0], uy = SU[1]) => blocks.push([x, y, a, b, hei, ux, uy]);
  // a tent whose ground the painting's buildings hide (Piazza Buffi, most of Piazza Nosetto) is not drawn: it would stand on the roofs
  const seenAt = (v, x, y) => { if (!v || !v.seen) return true; let bi = 0, bd = 1e9; for (let i = 0; i < v.p.length; i += 3) { const d = (v.p[i] - x) ** 2 + (v.p[i + 1] - y) ** 2; if (d < bd) { bd = d; bi = i / 3; } } return v.seen[bi] === '1'; };
  const tent = (x, y, h, len, wid, hei, k, v) => { if (seenAt(v, x, y)) box(x, y, h, len, wid, hei, '#f4f1ea', k % 2 ? '#d8362f' : '#f2c21a', k % 2 ? '#d8362f' : '#f2c21a'); block(x, y, len / 2 + 1, wid / 2 + 1, hei); };
  const free = (x, y) => !blocks.some(b => { for (let t = 0; t <= 1; t += 0.25) { const d = t * (b[4] + 1.5), dx = x - fwd[0] * d - b[0], dy = y - fwd[1] * d - b[1], a = dx * b[5] + dy * b[6], c = -dx * b[6] + dy * b[5]; if (Math.abs(a) < b[2] && Math.abs(c) < b[3]) return true; } return false; });
  cr.free = free;
  // per: people per standing point (a point stands for 6.25 m2); opt.keep(x, y): a further test; level: the share present
  const people = (v, per, seed, opt = {}, level = 1) => cr.add('sq' + seed + ':' + per, level, () => {
    const p = v.p, m = p.length / 3, out = [];
    for (let i = 0; i < m; i++) {
      if (v.seen && v.seen[i] !== '1') continue;
      const n = Math.floor(per) + (hash(i, seed) < per % 1 ? 1 : 0);
      for (let j = 0; j < n; j++) {
        const q = i * 7 + j, x = p[i * 3] + (hash(q, seed + 1) - 0.5) * 2.5, y = p[i * 3 + 1] + (hash(q, seed + 2) - 0.5) * 2.5;
        if (free(x, y) && (!opt.keep || opt.keep(x, y))) out.push(x, y, p[i * 3 + 2], cr.look(seed * 1000 + q, !!opt.vivid && hash(q, seed + 4) < 0.7, 1 / (opt.kids || 11)), 0, hash(q, seed + 3));
      }
    }
    return Float32Array.from(out);
  });
  const stands = (v, n, r, body, top, seed) => { for (let k = 0; k < n; k++) { const a = (k / n) * 6.283 + seed, x = v.c[0] + Math.cos(a) * r, y = v.c[1] + Math.sin(a) * r * 0.7; if (seenAt(v, x, y)) box(x, y, v.c[2], 3.2, 2.6, 2.5, body, top, '#ffffff', 0.6); block(x, y, 2.4, 2.1, 2.5); } };
  const stage = (x, y, h, len = 11, v) => { if (seenAt(v, x, y)) { box(x, y, h, len, 7, 1.3, '#2e3036', '#4a4d55', null, 0.4); box(x + SV[0] * 3.2, y + SV[1] * 3.2, h + 1.3, len, 0.6, 4.6, '#1f2126', '#b3302a', null, 0.4); } block(x, y, len / 2 + 1, 4.5, 5.9); };
  const offLane = (x, y) => !cr.lane || cr.lane(x, y) > 4.6;           // during a parade the squares on its way keep its lane free
  // a tent in a square the parade crosses stands out of its way (where exactly is ASSUMED anyway): the standing point of the
  // square nearest its middle that is at least `need` metres from the route
  const clear = (v, need) => {
    if (v.clear) return v.clear;
    if (!cr.dist || cr.dist(v.c[0], v.c[1]) >= need) return (v.clear = v.c);
    let best = v.c, bd = 1e9;
    for (let i = 0; i < v.p.length; i += 3) { const d = Math.hypot(v.p[i] - v.c[0], v.p[i + 1] - v.c[1]); if (d < bd && cr.dist(v.p[i], v.p[i + 1]) >= need) { bd = d; best = [v.p[i], v.p[i + 1], v.p[i + 2]]; } }
    return (v.clear = best);
  };

  if (st.rabadan) {
    const r = st.rabadan, h0 = sc[2];
    box(sc[0], sc[1], h0, 56, 48, 9, '#f4f1ea', '#e9e3d6', '#d8362f'); block(sc[0], sc[1], 29, 25, 9);   // Capannone Eventi: it takes up almost the whole square (told by a resident)
    tent(275, 162, -12.6, 14, 8, 4.2, 0);                                // Taia e Medega, towards Viale Stazione
    tent(V.buffi.c[0], V.buffi.c[1], V.buffi.c[2], 20, 10, 4.6, 1, V.buffi);   // Bau Band
    const np = clear(V.nosetto, 10);
    tent(np[0], np[1], np[2], 15, 9, 4.4, 0, V.nosetto);                 // AC Ravecchia
    const g = V.governo.c;
    // HC Biasca 3 Valli, Sonada Balossa and FC Moderna (told by a resident: two side by side, parallel to the Teatro Sociale,
    // at that end of the square; the third at the far end, against Via Dogana)
    tent(-30, -71, g[2], 16, 9, 4.4, 0); tent(-27, -86, g[2], 16, 9, 4.4, 1); tent(-72, -98, g[2], 16, 9, 4.4, 0);
    for (let k = 0; k < 6; k++) { const x = -92 + k * 5.2, y = -72 - k * 2.1; box(x, y, g[2], 3.6, 2.6, 2.6, VIVID[k % VIVID.length], '#f4f1ea', '#ffffff', 0.6); block(x, y, 2.6, 2.1, 2.6); }   // RabaStreetFood
    stage(-52, -84, g[2], 7);                                            // music stand in Piazza Governo
    const ip = clear(V.indipendenza, 10);
    tent(ip[0], ip[1], ip[2], 13, 8, 4.2, 1, V.indipendenza);           // Sci Club Lavorgo
    const co = V.collegiata.c;
    stage(co[0] - 4, co[1] + 12, co[2]);                                 // guggen concert
    stage((co[0] + V.nosetto.c[0]) / 2 + 8, (co[1] + V.nosetto.c[1]) / 2 + 2, co[2], 7, V.nosetto);   // (in the lane between the two squares, which the painting's roofs hide)
    if (r.open) {                                                        // the carnival nights: every square full
      people(V.sole, 5, 51, { vivid: true }); people(V.governo, 3.5, 52, { vivid: true }); people(V.collegiata, 3.5, 53, { vivid: true });
      people(V.nosetto, 3, 54, { vivid: true }); people(V.buffi, 3, 55, { vivid: true }); people(V.indipendenza, 3, 56, { vivid: true });
    } else if (r.risotto) people(V.sole, 4, 57, { vivid: true, kids: 6 });   // the queue for the risotto
    else if (r.parade) {                                                 // the parades: the squares on the way fill up beside the lane
      const k = r.parade === 'corteo' ? 1 : 0.5;
      people(V.collegiata, 3 * k, 58, { vivid: true, kids: 5, keep: offLane }); people(V.nosetto, 3 * k, 59, { vivid: true, kids: 5, keep: offLane });
      people(V.indipendenza, 3 * k, 60, { vivid: true, kids: 5, keep: offLane }); people(V.governo, 1.2 * k, 61, { vivid: true, kids: 5 });
    }
  }

  if (st.natale) {
    const h0 = sc[2], open = st.natale.open;
    const rk = sole(0, 0), ch = sole(0, 20);                             // the rink is in the middle of the square (told by a resident)
    box(rk[0], rk[1], h0, 26, 21, 1.0, '#6b4027', '#8a5a3a', null, 0.3); box(rk[0], rk[1], h0 + 0.2, 25, 20, 0.85, '#bcd3e0', '#e4f3fb', null, 0.3);   // rink, 500 m2, inside its boards
    box(ch[0], ch[1], h0, 36, 14, 5.2, '#8a5a3a', '#5d3722', '#f4f1ea', 0.3);                                                                         // chalet, about 500 m2
    block(rk[0], rk[1], 13.5, 11, 1); block(ch[0], ch[1], 18.5, 7.5, 5.2);
    for (let k = 0; k < 8; k++) { const p = sole(-24 + k * 5.6, -18); box(p[0], p[1], h0, 4.2, 3, 2.7, '#7a4b2c', k % 2 ? '#b3302a' : '#2f6b3f', '#f4f1ea', 0.6); block(p[0], p[1], 2.8, 2.2, 2.7); }   // eight food stands
    const hut = sole(-25, 7); box(hut[0], hut[1], h0, 4.5, 4, 3.2, '#b3302a', '#f4f1ea', null, 0.6); block(hut[0], hut[1], 3, 2.8, 3.2);              // Santa's hut
    const car = sole(-23, -6); props.push({ q: [car[0], car[1], h0 + 0.3], round: 3.6, flat: true, body: '#8a2d2d', top: '#c9a23a', min: 0.6 });
    props.push({ q: [car[0], car[1], h0 + 3.6], round: 3.3, body: '#d8362f', top: '#f2c21a', trunk: 3.2, shadow: 3.6, min: 0.6 }); block(car[0], car[1], 4.2, 4.2, 6.9);   // carousel
    const sl = sole(24, -8); box(sl[0], sl[1], h0, 4, 18, 2.6, '#dfe6ec', '#f6fafc', '#2d6fd6', 0.5); block(sl[0], sl[1], 3, 10, 2.6);                // tube slide
    if (open) {
      for (let j = 0; j < 44; j++) {                                     // skaters going round (a full rink: ASSUMED)
        const a = T * (0.32 + hash(j, 71) * 0.25) * (j % 5 ? 1 : -1) + j * 1.9, ra = 4 + hash(j, 72) * 7.5, rb = 3 + hash(j, 73) * 5.8;
        const p = sole(Math.cos(a) * ra, Math.sin(a) * rb);
        guests.push(fig(71000 + j, p[0], p[1], h0 + 1.05, true, { vivid: true, child: j % 3 === 0 }));
      }
      people(V.sole, 1.6, 74, { kids: 5 });
    }
    const t = V.collegiata.c, tx = t[0] + 2, ty = t[1] - 6;              // the tree in Piazza Collegiata
    block(tx, ty, 3.4, 3.4, 12.6);
    const foot = [tx, ty, t[2]];                                         // drawn among the people (life.js): the market's crowd stands round it
    [[3.1, 3.6], [2.4, 6.4], [1.7, 8.8], [1.0, 10.8]].forEach((s, k) => props.push({ q: [tx, ty, t[2] + s[1]], round: s[0], body: '#1f5a34', top: '#2f7a48', trunk: k ? 0 : 3.4, shadow: k ? 0 : 3.6, min: 0.5, sort: foot }));
    props.push({ q: [tx, ty, t[2] + 12.2], round: 0.45, body: '#f2c21a', top: '#ffe58a', min: 0.7, sort: foot });
    for (let k = 0; k < 22; k++) { const a = k * 2.4, z = 2.6 + (k / 22) * 8, r = 3.1 * (1 - (z - 2.6) / 9.4) + 0.35; props.push({ q: [tx + Math.cos(a) * r, ty + Math.sin(a) * r, t[2] + z], round: 0.2, body: k % 2 ? '#ffe58a' : '#ff8a6a', top: '#fff6cf', min: 1.0, sort: foot }); }
    if (open) people(V.collegiata, 1.8, 75, { kids: 5 });
  }

  if (st.giubiasco && V.giubiasco) {
    // Piazza Grande: an artificial ski slope 38 m long, two tents (bar and concerts; food, about 100 seats), a lit tree (tio.ch)
    const G = V.giubiasco, u = G.u, w = [-u[1], u[0]], at = (a, b) => [G.c[0] + u[0] * a + w[0] * b, G.c[1] + u[1] * a + w[1] * b], h0 = G.c[2];
    const gbox = (a, b, len, wid, hei, body, top, stripe) => { const p = at(a, b); props.push({ q: [p[0], p[1], h0, u[0], u[1]], len, wid, hei, body, top, stripe: stripe || undefined, min: 0.35 }); block(p[0], p[1], len / 2 + 1, wid / 2 + 1, hei, u[0], u[1]); };
    gbox(-4, 0, 38, 7, 0.5, '#c9d3da', '#f4f8fb', null); gbox(-17, 0, 12, 7, 3.2, '#b9c4cc', '#f4f8fb', '#2d6fd6'); gbox(-21, 0, 4, 7, 5, '#9aa6ae', '#e8eef2', null);   // the slope and its ramp
    gbox(28, -5, 18, 9, 4.4, '#f4f1ea', '#d8362f', '#d8362f'); gbox(28, 6, 18, 9, 4.4, '#f4f1ea', '#2f6b3f', '#2f6b3f');                                             // the two tents
    const t = at(-30, 0); block(t[0], t[1], 2.8, 2.8, 10.6, u[0], u[1]);
    [[2.6, 3.2], [2.0, 5.6], [1.4, 7.7], [0.8, 9.4]].forEach((s2, k) => props.push({ q: [t[0], t[1], h0 + s2[1]], round: s2[0], body: '#1f5a34', top: '#2f7a48', trunk: k ? 0 : 3, shadow: k ? 0 : 3.2, min: 0.5, sort: [t[0], t[1], h0] }));
    props.push({ q: [t[0], t[1], h0 + 10.6], round: 0.4, body: '#f2c21a', top: '#ffe58a', min: 0.7, sort: [t[0], t[1], h0] });
    if (st.giubiasco.open) {
      for (let j = 0; j < 8; j++) { const f = (T * (0.12 + hash(j, 95) * 0.1) + j * 0.37) % 1, p = at(-14 + f * 26, (hash(j, 96) - 0.5) * 4.5); guests.push(fig(96000 + j, p[0], p[1], h0 + 0.6 + (1 - f) * 2.6 * Math.max(0, 1 - f * 2.2), true, { vivid: true, child: j % 2 === 0 })); }   // skiers coming down
      people(G, 0.9, 97, { kids: 5 });                                   // round the slope, the tents and the tree
    }
  }

  if (st.agosto) {
    const h0 = sc[2], sp = sole(0, 20);
    stage(sp[0], sp[1], h0, 14);
    for (let k = 0; k < 6; k++) { const p = sole(-18 + k * 7.2, -19); box(p[0], p[1], h0, 4.2, 3, 2.7, '#f4f1ea', '#d8362f', '#ffffff', 0.6); block(p[0], p[1], 2.8, 2.2, 2.7); }   // risotto and luganighe
    people(V.sole, 3.2, 81, { kids: 7 });                                // the whole town comes for the fireworks
  }

  if (st.perbacco) {
    stands(V.nosetto, 5, 9, '#5c1f33', '#f4f1ea', 0.4); stands(V.collegiata, 6, 12, '#5c1f33', '#f4f1ea', 1.1); stands(V.buffi, 6, 11, '#5c1f33', '#f4f1ea', 2.0); stands(V.governo, 7, 15, '#5c1f33', '#f4f1ea', 0.2);
    const g = V.governo.c;
    for (const dx of [-3, 3]) { props.push({ q: [g[0] + dx, g[1], g[2] + 0.9], round: 1.7, flat: true, body: '#6b4027', top: '#7b2a4a', min: 0.7 }); block(g[0] + dx, g[1], 2.4, 2.4, 1.8); }   // the two treading vats
    if (st.perbacco.open) { people(V.nosetto, 3, 91); people(V.collegiata, 2.8, 92); people(V.buffi, 3, 93); people(V.governo, 2.6, 94); }
  }
}

// Fireworks over a point [e, n, h]; P projects ENU metres to the screen. Drawn over the night sky.
export function fireworks(ctx, P, T, o) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 6; k++) {
    const tt = T / 2.8 + k / 6, id = Math.floor(tt), f = tt - id;
    const ex = o[0] + (hash(id, k * 7 + 1) - 0.5) * 80, ny = o[1] + (hash(id, k * 7 + 2) - 0.5) * 50, top = o[2] + 45 + hash(id, k * 7 + 3) * 45;
    if (f < 0.28) {
      const p = P(ex, ny, o[2] + (top - o[2]) * (f / 0.28));
      ctx.globalAlpha = 0.9; ctx.fillStyle = '#ffe6aa'; ctx.beginPath(); ctx.arc(p[0], p[1], 1.7, 0, 6.2832); ctx.fill();
      continue;
    }
    const g = (f - 0.28) / 0.72, R = (30 + hash(id, k + 40) * 22) * (1 - Math.pow(1 - g, 3)), col = VIVID[Math.floor(hash(id, k + 9) * VIVID.length)];
    const c = P(ex, ny, top), gl = ctx.createRadialGradient(c[0], c[1], 0, c[0], c[1], 90);
    ctx.globalAlpha = (1 - g) * 0.35; gl.addColorStop(0, col); gl.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gl; ctx.fillRect(c[0] - 90, c[1] - 90, 180, 180);
    ctx.globalAlpha = 1 - g * g; ctx.fillStyle = g < 0.25 ? '#fff6dc' : col;
    for (let i = 0; i < 54; i++) {
      const th = hash(i, id + k) * 6.2832, ph = Math.acos(2 * hash(i, id + k + 50) - 1);
      const p = P(ex + R * Math.sin(ph) * Math.cos(th), ny + R * Math.sin(ph) * Math.sin(th), top + R * Math.cos(ph) - 16 * g * g);
      ctx.beginPath(); ctx.arc(p[0], p[1], 1.9 - g * 0.8, 0, 6.2832); ctx.fill();
    }
  }
  ctx.restore();
}
