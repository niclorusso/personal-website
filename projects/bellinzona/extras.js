// The town's calendar and surroundings, layered on the simulation: live weather, the Ticino, the cable car,
// schools, the Rabadan carnival, match days, passengers on the platforms, sounds.
// Real inputs: MeteoSwiss 10-minute measurements (station Magadino/Cadenazzo), FOEN river gauge 2020 (Ticino, Bellinzona),
// OpenStreetMap geometry, the calendar. Everything else (how many people, exact school hours, cabin timetable,
// parade timing) is a stated assumption, kept in one place below.

const ASSUME = {
  school: { in1: [7.83, 8.33], out1: [11.58, 11.95], in2: [13.25, 13.58], out2: [15.75, 16.2] },   // typical Ticino timetable; Wednesday afternoon free
  superiore: { in1: [7.9, 8.25], out2: [16.4, 16.85] },
  cable: { open: [6.5, 21.5], every: 30, speed: 5 },        // valley station hours from OpenStreetMap; a run each half hour is assumed
  parade: { day: 0, from: 13.5, to: 16.5 },                 // Sunday afternoon
  rabadanCrowd: [10, 27],                                   // 10:00 to 03:00
};

const VIVID = ['#e23a3a', '#f2c21a', '#2f9e5b', '#2d6fd6', '#b04ad0', '#f07f2e', '#19b5b0', '#f25fa0'];
const hash = (a, b = 0) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };
const clamp01 = v => Math.max(0, Math.min(1, v));

function easter(y) {                                       // Gregorian computus -> [month, day]
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  return [Math.floor((h + l - 7 * m + 114) / 31), ((h + l - 7 * m + 114) % 31) + 1];
}

// "2027-02-07T14:30" read as Bellinzona time -> epoch ms
export function zurichMs(str) {
  const m = /^(\d{4})-(\d\d)-(\d\d)(?:[T ](\d\d):(\d\d))?/.exec(str || '');
  if (!m) return NaN;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 12), +(m[5] || 0));
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Zurich', hour: '2-digit', hourCycle: 'h23', day: '2-digit' }).formatToParts(new Date(guess));
  let off = +p.find(x => x.type === 'hour').value - new Date(guess).getUTCHours();
  if (off < -12) off += 24; if (off > 12) off -= 24;
  return guess - off * 3600000;
}

export class Extras {
  constructor({ world, life, sky, data, matches, params, view, requestDraw }) {
    Object.assign(this, { world, life, sky, data, view, requestDraw });
    this.M = world.enu2px;
    this.seasonForced = !!params.get('stagione'); this.seasonName = params.get('stagione') || null;
    this.force = { meteo: params.get('meteo'), rabadan: params.has('rabadan'), partita: params.has('partita'), scuola: params.get('scuola'), sostare: params.has('sostare') };
    this.matches = (matches && matches.home) || [];
    this.wx = null; this.hydro = null;
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
    if (data.parade) { const p = data.parade, n = p.length / 4, cum = new Float32Array(n); for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(p[i * 4] - p[i * 4 - 4], p[i * 4 + 1] - p[i * 4 - 3]); this.parade = { p, n, cum, len: cum[n - 1] }; }
    this.sole = (life.live.squares || []).find(s => s.name === 'Piazza del Sole');
    if (sky && data.floods) sky.floods = data.floods.slice();
    this.baseFloods = data.floods ? data.floods.length : 0;
    this.poll(); setInterval(() => this.poll(), 600000);
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

  async poll() {
    try {                                                   // MeteoSwiss automatic station nearest to Bellinzona with a rain gauge
      const txt = await (await fetch('https://data.geo.admin.ch/ch.meteoschweiz.messwerte-aktuell/VQHA80.csv', { cache: 'no-store' })).text();
      const rows = txt.trim().split('\n').map(l => l.split(';')), head = rows[0], row = rows.find(r => r[0] === 'MAG');
      if (row) { const v = k => { const x = parseFloat(row[head.indexOf(k)]); return Number.isFinite(x) ? x : null; }; this.wx = { temp: v('tre200s0'), rain: v('rre150z0'), sun: v('sre000z0'), hum: v('ure200s0'), stamp: row[1] }; }
    } catch (e) { /* offline: no weather */ }
    try {                                                   // federal gauge 2020, Ticino at Bellinzona
      const j = await (await fetch('https://api.existenz.ch/apiv1/hydro/latest?locations=2020&parameters=flow,height', { cache: 'no-store' })).json();
      const g = k => { const r = (j.payload || []).find(x => x.par === k); return r ? r.val : null; };
      this.hydro = { flow: g('flow'), height: g('height') };
    } catch (e) { /* offline */ }
    this.requestDraw();
  }

  // measurements are of this very moment: they say nothing about another date chosen in the time machine
  live() { return Math.abs(this.life.shiftMs || 0) < 45 * 60000; }

  // public holidays in Ticino, and the school holidays (summer and Christmas by fixed dates, the other weeks from Easter: an approximation of the cantonal calendar)
  holiday() {
    const c = this.cal();
    if (this._hol && this._hol.key === c.key) return this._hol;
    const [em, ed] = easter(c.y), E = Date.UTC(c.y, em - 1, ed), T = Date.UTC(c.y, c.m - 1, c.d), d = Math.round((T - E) / 86400000), md = c.m * 100 + c.d;
    const fixed = { 101: 'Capodanno', 106: 'Epifania', 319: 'San Giuseppe', 501: 'Festa del lavoro', 629: 'Santi Pietro e Paolo', 801: 'Festa nazionale', 815: 'Assunzione', 1101: 'Ognissanti', 1208: 'Immacolata', 1225: 'Natale', 1226: 'Santo Stefano' };
    const moving = { 1: 'Lunedì di Pasqua', 39: 'Ascensione', 50: 'Lunedì di Pentecoste', 60: 'Corpus Domini' };
    const name = fixed[md] || moving[d] || (d === 0 ? 'Pasqua' : null);
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

  rabadan() {                                               // Thursday before Ash Wednesday to Shrove Tuesday
    if (this.force.rabadan) return { on: true, parade: true, crowd: 1 };
    const c = this.cal(), [em, ed] = easter(c.y), E = Date.UTC(c.y, em - 1, ed), T = Date.UTC(c.y, c.m - 1, c.d), back = Math.round((E - T) / 86400000);
    const h = this.hours();
    // days 52..47 before Easter; the small hours belong to the night before
    const on = (back <= 52 && back >= 47) || (back === 46 && h < 3);
    if (!on) return { on: false };
    const hh = h < 3 ? h + 24 : h;
    return { on: true, parade: back === 49 && h >= ASSUME.parade.from && h <= ASSUME.parade.to, crowd: hh >= ASSUME.rabadanCrowd[0] && hh <= ASSUME.rabadanCrowd[1] ? (hh > 18 ? 1 : 0.5) : 0 };
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
    this.state = { w, school: null, rabadan: false, match: null };

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

    // Rabadan: tents and revellers in Piazza del Sole, the Sunday parade down Viale Stazione
    const rb = this.rabadan();
    if (rb.on && this.sole) {
      this.state.rabadan = true;
      const sp = this.sole.p, n = sp.length / 3;
      if (!this.tents) {
        this.tents = [];
        for (let k = 0; k < n && this.tents.length < 7; k += 7) { const i = Math.floor(hash(k, 31) * n) * 3; if (!this.tents.some(t => Math.hypot(t[0] - sp[i], t[1] - sp[i + 1]) < 24)) this.tents.push([sp[i], sp[i + 1], sp[i + 2]]); }
      }
      this.tents.forEach((t, k) => props.push({ q: [t[0], t[1], t[2], 0.94, -0.34], len: 15, wid: 8, hei: 4.2, body: '#f4f1ea', top: k % 2 ? '#d8362f' : '#f2c21a', stripe: k % 2 ? '#d8362f' : '#f2c21a', min: 0.3 }));
      if (rb.crowd > 0) for (let j = 0; j < 220 * rb.crowd; j++) {
        const i = Math.floor(hash(j, 41) * n) * 3;
        if (this.tents.some(t => Math.abs(t[0] - sp[i]) < 9 && Math.abs(t[1] - sp[i + 1]) < 6)) continue;
        guests.push(this.figure(5000 + j, sp[i] + Math.sin(this.t * 0.3 + j) * 0.4, sp[i + 1] + Math.cos(this.t * 0.27 + j * 1.7) * 0.4, sp[i + 2], false, { vivid: true, child: j % 9 === 0 }));
      }
      if (rb.parade && this.parade) {
        const R = this.parade, gap = 30, units = Math.ceil((R.len + 200) / gap);
        for (let u = 0; u < units; u++) {
          const s = (this.t * 0.7 + u * gap) % (units * gap) - 100;
          if (s < 2 || s > R.len - 2) continue;
          const q = L.at(R, s);
          if (!q[5]) continue;
          if (u % 2 === 0) props.push({ q: [q[0], q[1], q[2], q[3], q[4]], len: 7.5, wid: 2.9, hei: 3.4 + hash(u, 5) * 1.6, body: VIVID[u % VIVID.length], top: VIVID[(u + 3) % VIVID.length], stripe: '#ffffff', min: 0.5 });
          else for (let j = 0; j < 10; j++) guests.push(this.figure(7000 + u * 20 + j, q[0] - q[3] * (j >> 1) * 1.3 + q[4] * ((j & 1) - 0.5) * 1.6, q[1] - q[4] * (j >> 1) * 1.3 - q[3] * ((j & 1) - 0.5) * 1.6, q[2], true, { vivid: true }));   // a guggen band
        }
        for (let s = 3; s < R.len - 3; s += 2.4) {              // the crowd lining the street
          const q = L.at(R, s);
          if (!q[5]) continue;
          for (const side of [-1, 1]) { const k = Math.round(s * 10) * side; if (hash(k, 7) < 0.75) guests.push(this.figure(9000 + k, q[0] + q[4] * side * (5.2 + hash(k, 8) * 1.6), q[1] - q[3] * side * (5.2 + hash(k, 8) * 1.6), q[2], false, { vivid: hash(k, 9) < 0.5, child: hash(k, 10) < 0.15 })); }
        }
      }
    } else this.tents = null;

    // match day at the Stadio Comunale
    const mt = this.match();
    if (mt.on && this.stadium) {
      this.state.match = mt;
      if (mt.f < 0.4) this.flow(guests, this.stadium, 160, mt.f / 0.4, false, 12000, {});
      else if (mt.f > 0.85) this.flow(guests, this.stadium, 160, (mt.f - 0.85) / 0.15, true, 12000, {});
      const g = this.stadium.gate;
      // spectators on the open terraces, and the game itself (kick-off at f = 0.3125, half-time 0.547-0.625, final whistle 0.885)
      const fill = clamp01((mt.f - 0.12) / 0.2) * clamp01((0.97 - mt.f) / 0.07), S = this.stadium;
      (S.seats || []).forEach((p, k) => { if (hash(k, 70) < fill * 0.6) { const fg = this.figure(14000 + k, p[0], p[1], p[2], false, { vivid: hash(k, 71) < 0.35 }); fg.o.h = 1.25; guests.push(fg); } });
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
    if (this.sky && this.sky.floods && this.stadium) {      // floodlit pitch
      const c = this.stadium.c, M = this.M;
      this.sky.floods.length = this.baseFloods;
      if (mt.on) for (const [dx, dy] of [[-45, -30], [45, -30], [-45, 30], [45, 30], [0, 0]]) this.sky.floods.push([M[0][0] * (c[0] + dx) + M[0][1] * (c[1] + dy) + M[0][2] * c[2], M[1][0] * (c[0] + dx) + M[1][1] * (c[1] + dy) + M[1][2] * c[2], 2]);
    }

    // passengers on the platform while a timetabled train stands in the station
    for (const t of L.trains) {
      if (!t.sched || t.freight || !(t.dwell > 0)) { if (this.seen.has(t) && !(t.dwell > 0)) this.seen.delete(t); continue; }
      if (!this.seen.has(t)) { this.seen.set(t, this.t); this.chime = true; }
      const el = this.t - this.seen.get(t), side = (parseInt(t.sched.plat, 10) || 1) % 2 ? 1 : -1;
      for (let k = 0; k < t.wagons; k++) {
        const q = L.behind(t, 13 + k * 25.6);
        if (!q || !q[5]) continue;
        const nx = q[4] * side, ny = -q[3] * side, sd = t.sched.dep + k * 13;
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
    this.sostare = !!so && (this.force.sostare || this.seasonName === 'estate' || (doy >= 710 && doy <= 1031 && !this.seasonForced));
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
      const wedClosed = wd === 3 && h >= 8 && h < 10, open = h >= A.open[0] && h <= A.open[1] && !wedClosed;
      const f = open ? clamp01(ph / trip) : 0, e = f * f * (3 - 2 * f), up = slot % 2 === 0;
      for (const first of [true, false]) {
        const s = (first === up ? e : 1 - e) * c.len;
        let i = 1; while (i < c.n - 1 && c.cum[i] < s) i++;
        const a = (i - 1) * 3, b = i * 3, d = Math.max(1e-3, c.cum[i] - c.cum[i - 1]), g = clamp01((s - c.cum[i - 1]) / d), p = c.p;
        const q = [p[a] + (p[b] - p[a]) * g, p[a + 1] + (p[b + 1] - p[a + 1]) * g, p[a + 2] + (p[b + 2] - p[a + 2]) * g - 2.6, (p[b] - p[a]) / d, (p[b + 1] - p[a + 1]) / d];
        props.push({ q, len: 2.8, wid: 1.7, hei: 2.3, body: '#d8362f', top: '#f2f2f2', min: 0.3 });
        this.cabins.push({ q, name: c.name, moving: open && f > 0 && f < 1, going: (first === up) ? 'in salita' : 'in discesa', open });
      }
    }
    L.guests = guests; L.props = props;
  }

  // drawn right after the simulation: river, cables, hover targets
  draw(ctx, toScreen, ppm, W, H, dt) {
    const M = this.M, P = (e, n, h) => toScreen(M[0][0] * e + M[0][1] * n + M[0][2] * h, M[1][0] * e + M[1][1] * n + M[1][2] * h);
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
        (this.life.hot || (this.life.hot = [])).push({ x: p[0], y: p[1], r: Math.max(8, 3 * ppm), info: () => ({ kind: 'bus', title: 'Funivia', to: cb.name.replace(/^Funivia /, ''), sub: !cb.open ? 'Ferma (fuori orario)' : cb.moving ? 'Cabina ' + cb.going : 'In stazione' }) });
      }
    }
  }

  // drawn last, over everything: rain or snow
  overlay(ctx, W, H, dt) {
    const w = this.state ? this.state.w : { kind: 'sereno' };
    if (w.kind === 'sereno') return;
    const snow = w.kind === 'neve', want = Math.round((snow ? 420 : 620) * w.k * (W * H) / 1e6);
    while (this.drops.length < want) this.drops.push({ x: Math.random() * W, y: Math.random() * H, v: 0.7 + Math.random() * 0.6, p: Math.random() * 6.28 });
    this.drops.length = Math.min(this.drops.length, want);
    ctx.save();
    ctx.fillStyle = snow ? 'rgba(228,234,246,0.12)' : `rgba(62,76,104,${0.10 + 0.12 * w.k})`;
    ctx.fillRect(0, 0, W, H);
    if (snow) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      for (const d of this.drops) { d.y += 55 * d.v * dt; d.x += Math.sin(this.t * 1.3 + d.p) * 22 * dt; if (d.y > H) { d.y = -4; d.x = Math.random() * W; } ctx.beginPath(); ctx.arc(d.x, d.y, 1.1 + d.v, 0, 6.2832); ctx.fill(); }
    } else {
      ctx.strokeStyle = 'rgba(215,228,245,0.5)'; ctx.lineWidth = 1.1; ctx.beginPath();
      for (const d of this.drops) { d.y += 900 * d.v * dt; d.x -= 150 * d.v * dt; if (d.y > H) { d.y = -20; d.x = Math.random() * (W + 200); } ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - 3.2, d.y + 19); }
      ctx.stroke();
    }
    ctx.restore();
  }

  status(season) {
    this.seasonName = season;
    const s = this.state || {}, out = [season];
    const live = this.live();
    if (live && this.wx && this.wx.temp !== null) out.push(this.wx.temp.toFixed(1).replace('.', ',') + ' °C');
    if (s.w) out.push(s.w.kind !== 'sereno' ? s.w.kind : live ? (this.wx ? 'asciutto' : 'meteo non disponibile') : 'meteo reale solo per adesso');
    if (live && this.hydro && this.hydro.flow !== null) out.push('Ticino ' + Math.round(this.hydro.flow) + ' m³/s');
    const hol = this.holiday(); if (hol.name) out.push(hol.name); else if (hol.school && this.cal().wd >= 1 && this.cal().wd <= 5) out.push('vacanze scolastiche');
    if (this.life.marketLevel() > 0) out.push('mercato');
    if (s.rabadan) out.push('Rabadan');
    if (s.school) out.push('scuole: ' + s.school);
    if (s.match) out.push('partita' + (s.match.vs ? ' vs ' + s.match.vs : ''));
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
    this.lastHour = Math.floor(this.hours());
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
    if (s.match && this.stadium) crowd = Math.max(crowd, this.near(...pxy(this.stadium.c), 2200));
    tgt(this.gCrowd, crowd * 0.5);
    tgt(this.gRain, s.w && s.w.kind === 'pioggia' ? 0.10 + 0.18 * s.w.k : 0);
    let river = 0; if (this.rivers.length) { const v = this.view(); for (const r of this.rivers) for (let i = 0; i < r.n; i += 12) { const p = pxy([r.p[i * 4], r.p[i * 4 + 1], r.p[i * 4 + 2]]); river = Math.max(river, clamp01(1 - Math.hypot(v.x - p[0], v.y - p[1]) / 700)); } river *= clamp01((this.view().z - 5) / 2); }
    tgt(this.gRiver, river * 0.22);
    const hr = Math.floor(this.hours());
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
