// Animated layer drawn over the tiles: cars and buses on the road graph, trains on the rails,
// swallows above the roofs. Everything lives in ENU metres and is projected with the map's enu2px matrix.
import { source, info, MIN } from './livedata.js?v=20261121b';
import { t as say } from './i18n.js?v=20261121b';   // (t is a train in this file)

const DENSITY = [3.2, 2.4, 1.8, 1.3, 0.42, 0.07];          // vehicles per unit length, by road class
const SPEED = [26, 12.5, 11, 10, 7.5, 4.5];                 // m/s
const CAR_COLORS = ['#ececec', '#f4f4f2', '#bfc3c9', '#3d3f45', '#25272c', '#a92a28', '#2a548f', '#e7bf2e', '#7b8791', '#d6d6da', '#5d7f68'];
const BUS_COLORS = ['#f2c21a', '#e8e8ea', '#d24a2c'];        // postal yellow among them
const VIVID = ['#e23a3a', '#f2c21a', '#2f9e5b', '#2d6fd6', '#b04ad0', '#f07f2e', '#19b5b0', '#f25fa0'];   // carnival colours (as fest.js)
const SPRITES = 2.4;                                         // from this many px per metre crowds are sprites, below it specks
let SHADOW = [0.94 * 1.28, 0.34 * 1.28];                  // ground offset of a shadow per metre of height (sun from WSW, 38 deg)

// real-time delays at Bellinzona station (id 8505213) from the open Swiss public transport API: only the fields used,
// from half an hour back (late trains whose time has passed) to 80-95 minutes ahead (about 5 KB)
const RT_URL = 'https://transport.opendata.ch/v1/stationboard?id=8505213&limit=28&' + ['stop/departure', 'stop/delay', 'stop/platform', 'stop/prognosis/departure', 'stop/prognosis/platform', 'category', 'number', 'to'].map(f => 'fields[]=stationboard/' + f).join('&');
const RT_STALE = 300000;                                    // live data older than five minutes is dropped: back to the timetable
const rtMin = s => { const x = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)(?::(\d\d))?/.exec(typeof s === 'string' ? s : ''); return x ? Date.UTC(+x[1], x[2] - 1, +x[3]) / 6e4 + x[4] * 60 + +x[5] + (x[6] || 0) / 60 : NaN; };   // minutes since 1970 on the station clock (the API writes local time)
const rtNorm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
// live bus delays at the bus terminal by the station, "Bellinzona, Stazione" (id 8579936, a stop of its own: the train board has
// no buses), from half an hour back to about an hour ahead (about 8 KB)
const BUS_STOP = 'Bellinzona, Stazione';
const BUS_URL = 'https://transport.opendata.ch/v1/stationboard?id=8579936&limit=40&' + ['stop/departure', 'stop/delay', 'stop/prognosis/departure', 'number', 'to'].map(f => 'fields[]=stationboard/' + f).join('&');
const zStamp = ms => { const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms)), g = k => p.find(x => x.type === k).value; return `${g('year')}-${g('month')}-${g('day')}%20${g('hour')}:${g('minute')}`; };

function rng(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(v * k))));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
};

// One person: shadow, legs, coat, head, an umbrella in the wet. k = px per metre of height (people are drawn 1.7 times life
// size so that they read), sw = swing of the legs (-1..1, 0 standing still), seat = seated (shorter, no shadow of its own)
function person(ctx, x, y, o, k, ppm, sw, wet, seat) {
  const hgt = (o.child ? 1.15 : o.h) * k * (seat ? 0.72 : 1), wd = Math.max(1.4, (o.child ? 0.36 : 0.46) * ppm * 1.7);
  y -= Math.abs(sw) * 0.04 * k;
  if (!seat) { ctx.fillStyle = 'rgba(25,28,55,0.30)'; ctx.beginPath(); ctx.ellipse(x + hgt * 0.42, y - hgt * 0.10, hgt * 0.50, wd * 0.42, -0.35, 0, 6.2832); ctx.fill(); }
  ctx.fillStyle = o.legs;
  const lw = wd * 0.42, lh = hgt * 0.46;
  ctx.fillRect(x - wd * 0.46 + sw * wd * 0.22, y - lh, lw, lh);
  ctx.fillRect(x + wd * 0.04 - sw * wd * 0.22, y - lh, lw, lh);
  ctx.fillStyle = o.coat;
  ctx.beginPath(); ctx.roundRect(x - wd / 2, y - hgt * 0.82, wd, hgt * 0.42, wd * 0.3); ctx.fill();
  ctx.fillStyle = o.skin;
  const hr = Math.max(0.9, hgt * 0.105);
  ctx.beginPath(); ctx.arc(x, y - hgt * 0.90, hr, 0, 6.2832); ctx.fill();
  ctx.fillStyle = o.hair;
  ctx.beginPath(); ctx.arc(x, y - hgt * 0.925, hr * 0.92, 3.3, 6.12); ctx.fill();
  if (wet && !o.child && !seat && o.ph % 1 < 0.7) {          // umbrellas when it rains or snows
    ctx.fillStyle = o.coat; ctx.beginPath(); ctx.ellipse(x, y - hgt * 1.08, wd * 1.35, wd * 0.62, 0, 3.1416, 6.2832); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x - 0.4, y - hgt * 1.08, 0.8, hgt * 0.3);
  }
}
const SWING = [0, 0, 1, 0, -1, 0];                           // the poses of a sprite: standing, four steps of walking, seated

export class Life {
  constructor(data, M, content, live) {
    this.live = live || { squares: [], tables: [], stations: [] };
    this.M = M;
    this.content = content;
    this.rand = rng(11);
    // railway tunnels are left out of the data: join the loose ends that face each other so trains run through, unseen
    {
      const deg = new Map(), end = [];
      for (const e of data.edges) if (e.c === 6) for (const n of [e.a, e.b]) deg.set(n, (deg.get(n) || 0) + 1);
      for (const e of data.edges) {
        if (e.c !== 6) continue;
        const p = e.p, n = p.length / 4;
        if (n < 2) continue;
        if (deg.get(e.a) === 1) end.push({ node: e.a, x: p[0], y: p[1], h: p[2], dx: p[0] - p[4], dy: p[1] - p[5] });
        if (deg.get(e.b) === 1) { const k = (n - 1) * 4; end.push({ node: e.b, x: p[k], y: p[k + 1], h: p[k + 2], dx: p[k] - p[k - 4], dy: p[k + 1] - p[k - 3] }); }
      }
      for (const a of end) { const l = Math.hypot(a.dx, a.dy) || 1; a.dx /= l; a.dy /= l; }
      const extra = [];
      for (const a of end) {
        if (a.used) continue;
        let best = null, bd = 420;
        for (const b of end) {
          if (b === a || b.used) continue;
          const vx = b.x - a.x, vy = b.y - a.y, d = Math.hypot(vx, vy);
          if (d < 4 || d >= bd) continue;
          if ((vx * a.dx + vy * a.dy) / d > 0.9 && (-vx * b.dx - vy * b.dy) / d > 0.9) { best = b; bd = d; }
        }
        if (best) {
          a.used = best.used = true;
          const m = Math.max(1, Math.ceil(bd / 8)), p = [];
          for (let i = 0; i <= m; i++) p.push(a.x + (best.x - a.x) * i / m, a.y + (best.y - a.y) * i / m, a.h + (best.h - a.h) * i / m, 0);
          extra.push({ c: 6, o: 0, w: 2.6, a: a.node, b: best.node, p, tunnel: 1 });
        }
      }
      if (extra.length) data = { ...data, edges: data.edges.concat(extra) };
      this.tunnels = extra.length;
    }
    this.edges = data.edges.map(e => {
      const n = e.p.length / 4, cum = new Float32Array(n);
      for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(e.p[i * 4] - e.p[i * 4 - 4], e.p[i * 4 + 1] - e.p[i * 4 - 3]);
      return { ...e, n, cum, len: cum[n - 1] };
    });
    this.out = new Map();                                   // node -> [{e, dir}] edges that can be entered there
    const link = (node, e, dir) => { if (!this.out.has(node)) this.out.set(node, []); this.out.get(node).push({ e, dir }); };
    this.edges.forEach((e, i) => { link(e.a, i, 1); if (!e.o) link(e.b, i, -1); });
    this.roads = []; this.rails = [];
    this.walks = [];
    this.edges.forEach((e, i) => (e.c === 6 ? this.rails : e.c === 7 ? this.walks : this.roads).push(i));
    // people: footpaths, squares and the pavements of ordinary streets, busiest around the old town
    this.outWalk = new Map();
    const walkable = e => e.c === 7 || (e.c >= 2 && e.c <= 5);
    this.edges.forEach((e, i) => { if (!walkable(e)) return; for (const [node, dir] of [[e.a, 1], [e.b, -1]]) { if (!this.outWalk.has(node)) this.outWalk.set(node, []); this.outWalk.get(node).push({ e: i, dir }); } });
    const wk = [], ww = [];
    this.edges.forEach((e, i) => {
      if (!walkable(e)) return;
      const m = Math.floor(e.n / 2) * 4, d = Math.hypot(e.p[m] - 150, e.p[m + 1] + 60);
      const base = e.c === 7 ? e.d : (e.c === 5 ? 0.15 : 0.9);
      wk.push(i); ww.push(e.len * base * (0.25 + 7 * Math.exp(-d / 420) + 2.5 * Math.exp(-Math.hypot(e.p[m] - 570, e.p[m + 1] - 500) / 250)));
    });
    this.walkPick = () => { let t = this.rand() * this.walkTotal, j = 0; while (t > ww[j] && j < ww.length - 1) t -= ww[j++]; return wk[j]; };
    this.walkTotal = ww.reduce((a, b) => a + b, 0);
    const COATS = ['#c0392b', '#2e5fa3', '#e8e4da', '#2b2d33', '#3d7a52', '#e0b23a', '#8a5a9e', '#d9772f', '#5b6770', '#b9c7d6', '#7a4a34', '#e88fa8'];
    const SKIN = ['#f1c9a5', '#e0ac7e', '#c68c5d', '#8d5a3b', '#f6d7bd'];
    const HAIR = ['#2a1d14', '#5a3b22', '#b08a4a', '#d9d5cc', '#151515', '#8a3c22'];
    this.pal = { COATS, SKIN, HAIR };
    // the looks of the crowds (crowd(), extras.js): 28 everyday adults, 4 children, then 12 carnival-coloured adults, 4 children
    this.looks = [];
    for (let i = 0; i < 48; i++) {
      const v = i >= 32, kid = (i % 32) >= (v ? 12 : 28), coats = v ? VIVID : COATS;
      this.looks.push({ coat: coats[(i % 32) % coats.length], legs: i % 5 < 3 ? '#2f3540' : '#5b6477', skin: SKIN[(i * 3 + 1) % SKIN.length], hair: HAIR[(i * 7 + 2) % HAIR.length], child: kid, h: 1.55 + ((i * 37) % 31) / 100, ph: (i * 0.618) % 1 });
    }
    const coatsUsed = [...new Set(this.looks.map(o => o.coat))];
    this.lookCoat = Uint8Array.from(this.looks, o => coatsUsed.indexOf(o.coat)); this.coatsUsed = coatsUsed;
    this.people = [];
    const nPeople = wk.length ? Math.round(Math.min(2600, Math.max(150, this.walkTotal / 26))) : 0;
    while (this.people.length < nPeople) {
      const ei = this.walkPick(), e = this.edges[ei];
      const group = this.rand() < 0.3 ? 2 : (this.rand() < 0.06 ? 3 : 1);            // couples, small groups
      const side = this.rand() < 0.5 ? 1 : -1, s0 = this.rand() * e.len, dir = this.rand() < 0.5 ? 1 : -1, speed = 0.95 + this.rand() * 0.6;
      const still = e.c === 7 && e.d >= 6 && this.rand() < 0.35;                       // standing about in the squares
      for (let g = 0; g < group; g++) this.people.push({
        e: ei, dir, s: s0 + g * 0.25, speed, still, pause: 0, side,
        lat: (e.c === 7 ? (this.rand() - 0.5) * Math.max(0.6, e.w - 1) : (e.w / 2 + 1.0)) + g * 0.62,
        coat: COATS[Math.floor(this.rand() * COATS.length)], legs: this.rand() < 0.6 ? '#2f3540' : '#5b6477',
        skin: SKIN[Math.floor(this.rand() * SKIN.length)], hair: HAIR[Math.floor(this.rand() * HAIR.length)],
        h: 1.55 + this.rand() * 0.3, ph: this.rand() * 6.28, child: this.rand() < 0.07,
      });
    }

    // road vehicles
    this.cars = [];
    this.hasBusLines = this.edges.some(e => e.r === 1);
    const weights = this.roads.map(i => this.edges[i].len * DENSITY[this.edges[i].c]);
    const total = weights.reduce((a, b) => a + b, 0);
    const count = Math.round(Math.min(1400, Math.max(60, total / 48)));
    for (let k = 0; k < count; k++) {
      let t = this.rand() * total, j = 0;
      while (t > weights[j] && j < weights.length - 1) t -= weights[j++];
      const ei = this.roads[j], e = this.edges[ei];
      const bus = this.hasBusLines ? (e.r === 1 && this.rand() < 0.16) : (e.c >= 1 && e.c <= 3 && this.rand() < 0.07);   // buses only on streets real lines use
      const van = !bus && this.rand() < 0.1;
      this.cars.push({
        e: ei, dir: e.o ? 1 : (this.rand() < 0.5 ? 1 : -1), s: this.rand() * e.len, cruise: 0.75 + this.rand() * 0.4,
        len: bus ? 11.5 : van ? 5.6 : 4.2 + this.rand() * 0.5, wid: bus ? 2.5 : van ? 2.0 : 1.8, hei: bus ? 3.0 : van ? 2.2 : 1.45,
        bus, van, color: bus ? (this.hasBusLines ? BUS_COLORS[0] : BUS_COLORS[Math.floor(this.rand() * BUS_COLORS.length)]) : CAR_COLORS[Math.floor(this.rand() * CAR_COLORS.length)],
        phase: this.rand() * 6.28,
      });
    }

    // people strolling across the open squares (between ground points that are actually visible) and sitting at café tables
    this.strollers = [];
    for (const sq of this.live.squares) {
      const n = sq.p.length / 3, count = Math.min(60, Math.max(2, Math.round(sq.area / 70)));
      for (let k = 0; k < count; k++) {
        const i = Math.floor(this.rand() * n) * 3;
        this.strollers.push({ sq, x: sq.p[i], y: sq.p[i + 1], h: sq.p[i + 2], tx: sq.p[i], ty: sq.p[i + 1], th: sq.p[i + 2], pause: this.rand() * 12, speed: 0.8 + this.rand() * 0.5,
          coat: COATS[Math.floor(this.rand() * COATS.length)], legs: this.rand() < 0.6 ? '#2f3540' : '#5b6477', skin: SKIN[Math.floor(this.rand() * SKIN.length)],
          hair: HAIR[Math.floor(this.rand() * HAIR.length)], ph: this.rand() * 6.28, hh: 1.55 + this.rand() * 0.3, child: this.rand() < 0.1, moving: false });
      }
    }
    this.seated = [];
    for (const t of this.live.tables) {
      for (const sx of [-0.95, 0.95]) {
        if (this.rand() < 0.3) continue;
        this.seated.push({ e: t[0] + t[3] * sx, n: t[1] + t[4] * sx, h: t[2], coat: COATS[Math.floor(this.rand() * COATS.length)], skin: SKIN[Math.floor(this.rand() * SKIN.length)], hair: HAIR[Math.floor(this.rand() * HAIR.length)] });
      }
    }

    // trains: a head moving on the rail graph, wagons follow the edges it has already travelled
    this.trains = [];
    const railLen = this.rails.reduce((a, i) => a + this.edges[i].len, 0);
    const nTrains = this.rails.length ? Math.max(2, Math.min(7, Math.round(railLen / 4500))) : 0;
    const LIVERY = [
      { body: '#f3f3f1', roof: '#c9ccd1', stripe: '#d0242b', wagons: 6, speed: 17 },       // regional
      { body: '#f3f3f1', roof: '#3a3d44', stripe: '#d0242b', wagons: 9, speed: 21 },       // intercity
      { body: '#7b6a58', roof: '#5b5048', stripe: null, wagons: 14, speed: 12, freight: true },
    ];
    for (let k = 0; k < nTrains; k++) {
      const t = { ...LIVERY[k % LIVERY.length], path: [], s: 0, seed: this.rand() };
      this.placeTrain(t, true);
      this.trains.push(t);
    }

    // swallows: small flocks drifting over the valley
    const [x0, y0, x1, y1] = content;
    this.flocks = [];
    for (let k = 0; k < 9; k++) {
      const a = this.rand() * 6.28;
      this.flocks.push({
        x: x0 + this.rand() * (x1 - x0), y: y0 + this.rand() * (y1 - y0), vx: Math.cos(a) * 44, vy: Math.sin(a) * 26, turn: (this.rand() - 0.5) * 0.12,
        birds: Array.from({ length: 5 + Math.floor(this.rand() * 9) }, () => ({ ox: (this.rand() - 0.5) * 150, oy: (this.rand() - 0.5) * 90, ph: this.rand() * 6.28, sp: 7 + this.rand() * 4 })),
      });
    }
    this.t = 0;
  }

  // position at distance s along an edge: [e, n, h, te, tn, visible]
  at(edge, s) {
    const { p, cum, n } = edge;
    let lo = 1, hi = n - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < s) lo = m + 1; else hi = m; }
    const i = lo, a = (i - 1) * 4, b = i * 4, d = Math.max(1e-3, cum[i] - cum[i - 1]), f = Math.max(0, Math.min(1, (s - cum[i - 1]) / d));
    return [p[a] + (p[b] - p[a]) * f, p[a + 1] + (p[b + 1] - p[a + 1]) * f, p[a + 2] + (p[b + 2] - p[a + 2]) * f,
      (p[b] - p[a]) / d, (p[b + 1] - p[a + 1]) / d, p[a + 3] && p[b + 3]];
  }

  // ---- crowds: thousands of people at once (extras.js). Places that stay put for the whole event are given once, as lists
  // [e, n, h, look, pose, k, ...] (k: the place is taken while k < the list's level), merged here into one list sorted from
  // the back of the view to the front; each frame only the stretch on screen is walked. Close up each person is a sprite
  // painted once per look and pose (atlas, repainted when the zoom changes by a quarter of an octave), from further away a speck.
  lookOf(seed, vivid, kids = 0.07) {
    const r = Math.abs(Math.sin(seed * 12.9898 + 4.1) * 43758.5453) % 1, q = Math.abs(Math.sin(seed * 78.233 + 1.7) * 24634.6345) % 1;
    return (vivid ? 32 : 0) + (q < kids ? (vivid ? 12 : 28) + Math.floor(r * 4) : Math.floor(r * (vivid ? 12 : 28)));
  }
  setCrowd(lists) {
    let n = 0;
    for (const l of lists) n += l.length / 6;
    const M = this.M, wy = new Float32Array(n), ord = new Uint32Array(n), src = new Float32Array(n * 6), grp = new Uint8Array(n);
    let j = 0;
    lists.forEach((l, g) => { for (let i = 0; i < l.length; i += 6, j++) { src.set(l.subarray ? l.subarray(i, i + 6) : l.slice(i, i + 6), j * 6); grp[j] = g; } });
    for (let i = 0; i < n; i++) { ord[i] = i; wy[i] = M[1][0] * src[i * 6] + M[1][1] * src[i * 6 + 1] + M[1][2] * src[i * 6 + 2]; }
    ord.sort((a, b) => wy[a] - wy[b]);
    const C = { n, wx: new Float32Array(n), wy: new Float32Array(n), look: new Uint8Array(n), pose: new Uint8Array(n), k: new Float32Array(n), grp: new Uint8Array(n) };
    for (let i = 0; i < n; i++) {
      const o = ord[i], s = o * 6;
      C.wx[i] = M[0][0] * src[s] + M[0][1] * src[s + 1] + M[0][2] * src[s + 2]; C.wy[i] = wy[o];
      C.look[i] = src[s + 3]; C.pose[i] = src[s + 4]; C.k[i] = src[s + 5]; C.grp[i] = grp[o];
    }
    this.crowd = n ? C : null;
  }
  atlas(ppm, dpr) {
    const b = Math.round(Math.log2(ppm) * 4), wet = !!this.wet, key = b + '|' + dpr + '|' + wet;
    if (this._atlas && this._atlas.key === key) return this._atlas;
    const pa = Math.pow(2, b / 4), k = pa * 0.7071 * 1.7, wd = Math.max(1.4, 0.46 * pa * 1.7), H = 1.9 * k;
    const L = wd * 1.4 + 1, R = H * 0.95 + 1, T = H * 1.1 + wd * 0.7 + 1, B = H * 0.1 + wd * 0.5 + 2;
    const cw = Math.ceil((L + R) * dpr), ch = Math.ceil((T + B) * dpr);
    const cv = (this._atlas && this._atlas.cv) || document.createElement('canvas');
    cv.width = cw * SWING.length; cv.height = ch * this.looks.length;
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, cv.width, cv.height);
    this.looks.forEach((o, r) => SWING.forEach((sw, c) => person(g, c * cw / dpr + L, r * ch / dpr + T, o, k, pa, sw, wet, c === 5)));
    return (this._atlas = { key, cv, cw, ch, ax: L * dpr, ay: T * dpr, f: 1 / (pa * dpr) });
  }

  setSignals(d) {
    this.signals = d.signals || [];
    for (const g of this.signals) { const e = this.edges[g.e]; if (e) (e.sig || (e.sig = [])).push(g); }
  }

  sigState(g) {                                             // 0 green, 1 amber, 2 red
    const two = this.sigTwo || (this.sigTwo = new Map());
    let ng = two.get(g.j);
    if (ng == null) { ng = this.signals.some(o => o.j === g.j && o.g === 1) ? 2 : 1; two.set(g.j, ng); }
    if (ng === 1) { const t = (this.t + g.j * 17) % 60; return t < 42 ? 0 : t < 45 ? 1 : 2; }     // a lone crossing: red now and then for people on foot
    const t = (this.t + g.j * 17 + g.g * 36) % 72;
    return t < 30 ? 0 : t < 33 ? 1 : 2;
  }

  next(v, straight) {
    const e = this.edges[v.e], node = v.dir === 1 ? e.b : e.a;
    let opts = (this.out.get(node) || []).filter(o => o.e !== v.e && (this.edges[o.e].c === 6) === (e.c === 6));
    if (!opts.length) return null;
    if (straight) {                                         // trains keep to the straightest continuation
      const h = this.at(e, v.dir === 1 ? e.len : 0), hx = h[3] * v.dir, hy = h[4] * v.dir;
      let best = null, bd = -2;
      for (const o of opts) {
        const oe = this.edges[o.e], q = this.at(oe, o.dir === 1 ? 0 : oe.len), d = (q[3] * o.dir) * hx + (q[4] * o.dir) * hy;
        if (d > bd) { bd = d; best = o; }
      }
      return bd > 0.3 ? best : null;
    }
    if (v.bus && this.hasBusLines) { const on = opts.filter(o => this.edges[o.e].r === 1); if (on.length) opts = on; }   // a bus stays on its line
    const w = opts.map(o => DENSITY[this.edges[o.e].c] + 0.05);
    let t = this.rand() * w.reduce((a, b) => a + b, 0), j = 0;
    while (t > w[j] && j < w.length - 1) t -= w[j++];
    return opts[j];
  }

  // ---- real timetable -------------------------------------------------------------------------------------
  // seconds since midnight on the station clock (Europe/Zurich), whatever the visitor's own time zone; this._ck.day is that date, in days since 1970
  clock() {
    const now = Date.now() + (this.shiftMs || 0);            // shiftMs: look at another moment (testing, ?quando=)
    if (!this._ck || now - this._ck.at > 30000 || now < this._ck.at || this._ck.s + (now - this._ck.at) / 1000 >= 86400) {   // read again past midnight
      const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(now));
      const g = k => +p.find(x => x.type === k).value;
      this._ck = { at: now, s: g('hour') * 3600 + g('minute') * 60 + g('second') + (now % 1000) / 1000, day: Date.UTC(g('year'), g('month') - 1, g('day')) / 864e5 };
    }
    return this._ck.s + (now - this._ck.at) / 1000 + (this.clockOffset || 0);
  }

  // the timetable of one date (days since 1970): that very date when it was read, otherwise a typical day of its weekday
  ttFor(day) {
    const tt = this.tt;
    let t = tt.days && tt.days[new Date(day * 864e5).toISOString().slice(0, 10)];
    if (typeof t === 'string') t = tt.week[t];
    return t || (tt.week && tt.week[['Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed'][((day % 7) + 7) % 7]]) || { date: tt.date, dep: tt.dep, end: [] };
  }

  // where a train must enter the map to roll straight through the station, from the north and from the south
  setTimetable(tt) {
    if (!tt || !tt.dep || !this.live.stations.length || !this.rails.length) return;
    const st = this.live.stations[0];
    const best = { N: null, S: null };
    for (const ei of this.rails) {
      const e = this.edges[ei];
      const na = (this.out.get(e.a) || []).filter(o => this.edges[o.e].c === 6).length, nb = (this.out.get(e.b) || []).filter(o => this.edges[o.e].c === 6).length;
      if (na > 1 && nb > 1) continue;                       // not a loose end
      const dir = na <= 1 ? 1 : -1;
      const p0 = this.at(e, dir === 1 ? 0 : e.len);
      let cur = { e: ei, dir }, run = 0, hit = null;
      for (let k = 0; k < 400 && cur; k++) {
        const ce = this.edges[cur.e];
        for (let x = 0; x < ce.len; x += 10) {
          const q = this.at(ce, cur.dir === 1 ? x : ce.len - x), d = Math.hypot(q[0] - st[0], q[1] - st[1]);
          // lat > 0: the line passes to the right of the station point, seen the way the train runs
          if (d < 30 && (!hit || d < hit.d)) hit = { d, dist: run + x, lat: ((q[0] - st[0]) * q[4] - (q[1] - st[1]) * q[3]) * cur.dir };
        }
        run += ce.len;
        cur = this.next(cur, true);
      }
      if (!hit || hit.dist < 400) continue;
      const side = p0[1] > st[1] ? 'N' : 'S';              // the end of the map this entry is on
      // Swiss trains keep left: of the lines through the station, each direction takes the one furthest to its left
      const b = best[side];
      if (!b || hit.lat < b.lat - 1.5 || (hit.lat < b.lat + 1.5 && hit.d < b.d)) best[side] = { e: ei, dir, d: hit.d, dist: hit.dist, lat: hit.lat };
    }
    this.entry = best;
    this.tt = tt;
    this.ttDone = new Set();
    this.rt = { map: new Map(), at: 0, next: 0, fails: 0, busy: false, hold: 0, arrAt: -1e13 };   // live delays by train (see rtTake)
    this.trains = this.trains.filter(t => t.freight);       // passenger trains now run to the timetable
    // the platform tracks (OpenStreetMap): the rail graph has only the two main tracks, trains pull alongside their own platform
    if (tt.axis && tt.tracks) this.platforms = { st, ax: tt.axis, tracks: tt.tracks, seen: tt.seen };
    // timed on the simulation itself: from the edge of the map to standing at the platform, and from leaving it to out of the map
    for (const side in best) if (best[side]) best[side].run = [false, true].map(fast => {
      const t = this.passenger(best[side], fast, { at: Infinity });
      let k = 0, j = 0;
      while (!(t.dwell > 0) && !t.gone && k < 8000) { this.moveTrain(t, 0.5, 0); k++; }
      t.sched.at = 0;
      while (!t.gone && j < 8000) { this.moveTrain(t, 0.5, 0); j++; }
      return { in: k * 0.5, out: j * 0.5 };
    });
  }

  passenger(from, fast, sched) {
    const wagons = fast ? 9 : 6, speed = fast ? 21 : 17;
    return { body: '#f3f3f1', roof: fast ? '#3a3d44' : '#c9ccd1', stripe: '#d0242b', wagons, speed, path: [{ e: from.e, dir: from.dir }], s: 0, seed: this.rand(), wait: 0, sched };
  }

  // Saturday market in the old town (07:30-13:00, per ticino.ch): 0 = no market, 1 = in full swing; stalls go up and come down around it
  marketLevel() {
    if (this.marketForce || this.marketExtra) return 1;                 // marketExtra: the Christmas market Sundays (extras.js)
    const now = Date.now() + (this.shiftMs || 0);
    if (!this._wd || now - this._wd.at > 60000) this._wd = { at: now, d: new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Zurich', weekday: 'short' }).format(new Date(now)) };
    if (this._wd.d !== 'Sat') return 0;
    const h = this.clock() / 3600;
    return Math.max(0, Math.min(1, (h - 6.75) / 0.75, (13.75 - h) / 0.75));
  }

  // stalls along the pedestrian streets and squares between Piazza Collegiata and Piazza Nosetto, and the crowd they draw
  buildMarket() {
    const r = rng(404), cell = new Set();
    for (const [x, y] of this.marketZone) cell.add(Math.round(x / 4) + ',' + Math.round(y / 4));
    const near = (x, y) => { const cx = Math.round(x / 4), cy = Math.round(y / 4); for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) if (cell.has((cx + i) + ',' + (cy + j))) return true; return false; };
    const A = this.marketZone[0], B = this.marketZone[this.marketZone.length - 1];
    const AWN = ['#c8402f', '#e8e2d2', '#2f6f9f', '#3f8a55', '#e0a52e', '#d9772f'];
    // a stall only where the painting shows the ground and the awning above it (23_crowds.py), not on a roof that hides the street
    const G = this.stallGrid, shown = (x, y) => { if (!G) return true; const i = Math.floor(x - G.x), j = Math.floor(y - G.y); if (i < 0 || j < 0 || i >= G.w || j >= G.h) return false; const k = j * G.w + i; return (parseInt(G.bits[k >> 2], 16) >> (3 - (k & 3))) & 1; };
    const stalls = [], put = (x, y, h, dx, dy) => {
      if (!shown(x, y)) return;
      if (stalls.some(s => Math.hypot(s.q[0] - x, s.q[1] - y) < 5.2)) return;
      stalls.push({ q: [x, y, h, dx, dy], awn: AWN[Math.floor(r() * AWN.length)], goods: ['#7fae4a', '#d9483b', '#e8b23a', '#c9a27a', '#f0ead8'][Math.floor(r() * 5)], k: r(), side: r() < 0.5 ? 1 : -1 });
    };
    const zone = [];
    this.edges.forEach((e, i) => {
      if (e.c !== 7 || e.w < 5) return;
      const mid = this.at(e, e.len / 2);
      if (near(mid[0], mid[1])) zone.push(i);
      const side = r() < 0.5 ? 1 : -1;
      for (let s = 4; s < e.len - 3; s += 6.4) {
        const q = this.at(e, s);
        if (q[5] && near(q[0], q[1])) put(q[0] + q[4] * 1.7 * side, q[1] - q[3] * 1.7 * side, q[2], q[3], q[4]);
      }
    });
    const ux = (B[0] - A[0]) / Math.hypot(B[0] - A[0], B[1] - A[1]), uy = (B[1] - A[1]) / Math.hypot(B[0] - A[0], B[1] - A[1]);
    for (const sq of this.live.squares) {
      for (let i = 0; i < sq.p.length; i += 3) {
        if (!near(sq.p[i], sq.p[i + 1])) continue;
        const a = sq.p[i] * ux + sq.p[i + 1] * uy, b = -sq.p[i] * uy + sq.p[i + 1] * ux;
        if (Math.abs(((b % 9) + 9) % 9 - 4.5) < 1.2 && Math.abs(((a % 6.5) + 6.5) % 6.5 - 3.2) < 1.2) put(sq.p[i], sq.p[i + 1], sq.p[i + 2], ux, uy);   // rows of stalls
      }
    }
    // shoppers: a crowd at every stall, plus people standing about and streaming through the market streets. "Pienissimo" (the
    // owner, 18 Nov 2026): how many is illustrative, a full Saturday morning, not a count. As a crowd list for extras.js
    // ([e, n, h, look, pose, k]: k = how far into the morning the place fills, 0..1)
    const P = this.pal, pick = a => a[Math.floor(r() * a.length)];
    const folk = [], put2 = (x, y, h, look, k) => folk.push(x, y, h, look, 0, k);
    for (const s of stalls) {
      const [x, y, h, dx, dy] = s.q, nx = dy * s.side, ny = -dx * s.side;
      put2(x - nx * 1.3, y - ny * 1.3, h, 2, s.k * 0.7);                     // the stallholder (look 2: a light coat, as before)
      const n = 6 + Math.floor(r() * 5);
      for (let j = 0; j < n; j++) put2(x + nx * (1.5 + (j >> 2) * 0.8 + r() * 0.6) + dx * (((j & 3) - 1.5) * 0.95 + (r() - 0.5) * 0.5), y + ny * (1.5 + (j >> 2) * 0.8 + r() * 0.6) + dy * (((j & 3) - 1.5) * 0.95 + (r() - 0.5) * 0.5), h,
        this.lookOf(s.k * 1000 + j, false, 0.1), Math.min(0.99, s.k * 0.6 + 0.3 + r() * 0.35));
    }
    const len = zone.reduce((a, i) => a + this.edges[i].len, 0);
    for (const ei of zone) {                                    // standing about in the middle of the market streets, where the ground shows
      const e = this.edges[ei];
      for (let s = 1.2; s < e.len - 1; s += 1.1) {
        const q = this.at(e, s);
        if (!q[5]) continue;
        for (const lat of [-0.8, 0.8]) if (r() < 0.75) put2(q[0] + q[4] * (lat + (r() - 0.5) * 0.6), q[1] - q[3] * (lat + (r() - 0.5) * 0.6), q[2], this.lookOf(ei * 7 + s * 13 + lat, false, 0.1), 0.15 + r() * 0.8);
      }
    }
    for (const sq of this.live.squares) for (let i = 0; i < sq.p.length; i += 3) {   // and in the squares among the rows of stalls (their points are visible ground)
      const x = sq.p[i], y = sq.p[i + 1];
      if (!near(x, y) || stalls.some(t => Math.abs(t.q[0] - x) < 2.2 && Math.abs(t.q[1] - y) < 2.2)) continue;
      for (let j = 0; j < 2; j++) if (r() < 0.7) put2(x + (r() - 0.5) * 1.8, y + (r() - 0.5) * 1.8, sq.p[i + 2], this.lookOf(i * 3 + j + 9, false, 0.1), 0.2 + r() * 0.75);
    }
    for (let k = 0; k < Math.min(520, len / 1.2) && zone.length; k++) {
      const ei = zone[Math.floor(r() * zone.length)], e = this.edges[ei];
      (this.allPeople || this.people).push({ rank: 0, e: ei, dir: r() < 0.5 ? 1 : -1, s: r() * e.len, speed: 0.6 + r() * 0.5, still: false, pause: r() < 0.4 ? r() * 20 : 0, side: 1, lat: (r() - 0.5) * (e.w - 1),
        coat: pick(P.COATS), legs: r() < 0.6 ? '#2f3540' : '#5b6477', skin: pick(P.SKIN), hair: pick(P.HAIR), h: 1.55 + r() * 0.3, ph: r() * 6.28, child: r() < 0.1, mk: 0.3 + r() * 0.7 });
    }
    this.market = { stalls, crowd: Float32Array.from(folk) };
    this._hourAt = -1e9;                                    // let the new market-goers in
  }

  // how busy the town is at this hour (1 = rush hour). The shape of the day is a typical one, not a count.
  hourLevels() {
    const now = Date.now() + (this.shiftMs || 0);
    if (!this._wd || Math.abs(now - this._wd.at) > 60000) this._wd = { at: now, d: new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Zurich', weekday: 'short' }).format(new Date(now)) };
    const h = (this.clock() / 3600) % 24, we = this._wd.d === 'Sat' || this._wd.d === 'Sun' || !!this.holiday;   // public holidays (set by the extras) run like a Sunday
    const curve = pts => { for (let i = 1; i < pts.length; i++) if (h <= pts[i][0]) { const a = pts[i - 1], b = pts[i]; return a[1] + (b[1] - a[1]) * (h - a[0]) / (b[0] - a[0]); } return pts[pts.length - 1][1]; };
    const cars = we ? curve([[0, .1], [7, .1], [10, .5], [12, .6], [15, .65], [18, .55], [21, .3], [24, .12]])
      : curve([[0, .07], [5, .07], [6, .3], [7.5, 1], [9, .62], [11.5, .7], [12.2, .82], [13.5, .7], [16, .75], [17.5, 1], [19, .6], [21, .32], [23, .15], [24, .07]]);
    const people = curve([[0, .04], [6, .08], [8, .6], [10, .7], [12, .95], [14, .75], [17.5, 1], [19.5, .7], [22, .3], [24, .06]]);
    return { cars, people };
  }
  applyHour() {
    if (!this.allCars) {
      const r = rng(505);
      this.allCars = this.cars; this.allPeople = this.people;
      for (const v of this.allCars) v.rank = r();
      for (const p of this.allPeople) p.rank = r();
    }
    const l = this.hourLevels();
    this.cars = this.allCars.filter(v => v.rank < l.cars);
    this.people = this.allPeople.filter(p => p.mk || p.rank < l.people);
    this.level = l;
  }

  // real bus timetable: every journey of the day, with the way between consecutive stops
  setBuses(b) {
    if (!b || !b.trips || !b.trips.length) return;
    const segs = new Map();
    for (const k in b.segs) {
      const p = b.segs[k], n = p.length / 4, cum = new Float32Array(n);
      for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(p[i * 4] - p[i * 4 - 4], p[i * 4 + 1] - p[i * 4 - 3]);
      if (n >= 2) segs.set(k, { p, n, cum, len: cum[n - 1] });
    }
    this.busAll = b.trips.map(([line, to, s, days]) => {
      const st = [], tm = [];
      for (let i = 0; i < s.length; i += 2) { st.push(s[i]); tm.push(s[i + 1]); }
      const legs = st.slice(1).map((x, i) => segs.get(st[i] + '>' + x));
      if (!legs.every(Boolean)) return null;
      // the timetable is to the minute: stops sharing a minute are spread across it, in proportion to the way between them
      for (let i = 0; i < tm.length;) {
        let j = i; while (j + 1 < tm.length && tm[j + 1] <= tm[i]) j++;
        if (j > i) {
          const t2 = j + 1 < tm.length ? tm[j + 1] : tm[i] + 1;
          let total = 0; for (let k = i; k <= j && k < legs.length; k++) total += legs[k].len;
          let run = 0;
          for (let k = i + 1; k <= j; k++) { run += legs[k - 1].len; tm[k] = tm[i] + Math.min(0.98, (t2 - tm[i]) * run / Math.max(1, total)); }
        }
        i = j + 1;
      }
      return { line, to, st, tm, legs, days: days || 7 };      // days: 1 Monday to Friday, 2 Saturday, 4 Sunday and holidays
    }).filter(Boolean);
    this.busTrips = [];
    this.busDay();
    this.busStops = b.stops;
    this.busWait = b.wait || {};                            // real stop positions (OpenStreetMap) to wait at, per leg
    this.shelters = b.shelters || [];
    this.cars = this.cars.filter(v => !v.bus);              // no more made-up buses
    if (this.allCars) this.allCars = this.allCars.filter(v => !v.bus);
    this.busS = this.busStops.indexOf(BUS_STOP);
    if (this.busS >= 0 && !this.busSrc && typeof window !== 'undefined' && typeof fetch === 'function') {
      // once a minute (livedata.js: only while the tab is visible and the map shows now, never in the time machine or the past)
      this.busSrc = source({ id: 'bus', url: () => BUS_URL + '&datetime=' + zStamp(Date.now() - 30 * MIN), every: MIN, maxAge: 4 * MIN, timeout: 20000, delay: 4000,
        live: () => Math.abs(this.shiftMs || 0) < 45 * MIN,
        parse: j => { const l = j && Array.isArray(j.stationboard) ? j.stationboard.filter(e => e && e.stop && Number.isFinite(rtMin(e.stop.departure))) : []; return l.length ? { list: l } : null; },   // no usable entry: a failure
        onData: d => { d.match = this.busMatch(d.list); } });
      info({ id: 'bus', label: say('row.bus'), order: 30, group: 'trasporti', source: 'transport.opendata.ch', url: 'https://transport.opendata.ch', text: () => this.busInfo() });
    }
  }

  // ---- live bus delays ------------------------------------------------------------------------------------
  // a live departure is matched to a planned one by line, destination and planned minute at the station, strictly: one planned
  // departure only, at that minute (or within two minutes when that is the only one), and no other live departure claiming it.
  // A board that does not fit the saved timetable (fewer than six in ten matched: a new timetable, works) is not used at all.
  // A bus missing from the board is not taken as cancelled; a bus without a delay (null) runs as planned.
  busMatch(list) {
    this.busDay();
    const s0 = this.clock(), S = this.busS, day = this._ck.day, mNow = day * 1440 + s0 / 60, plan = new Map(), got = [], used = new Map();
    const st = { live: 0, delay: 0, none: 0, late: 0, matched: 0, unknown: 0, unsure: 0, bad: 0, fit: false };
    for (const t of this.busTrips) for (let i = 0; i < t.st.length - 1; i++) if (t.st[i] === S) {
      const k = t.line + '|' + rtNorm(t.to);
      (plan.get(k) || plan.set(k, []).get(k)).push({ t, i, m: day * 1440 + Math.floor(t.tm[i] + 1e-6) });   // the timetable's own minute
    }
    for (const e of list) {
      const s = e && e.stop, m = rtMin(s && s.departure);
      if (!(m > mNow - 40 && m < mNow + 75)) continue;            // outside the board's window (or no time at all): not counted
      st.live++;
      const ps = plan.get(String((e && e.number) || '').trim() + '|' + rtNorm(e.to));
      if (!ps) { st.unknown++; continue; }
      let c = ps.filter(p => p.m === m);
      if (!c.length) c = ps.filter(p => Math.abs(p.m - m) <= 2);
      if (c.length !== 1) { st.unsure++; continue; }
      // the delay in whole minutes, in agreement with the forecast time when there is one; null: no real-time data for this bus
      let late = s.delay == null || s.delay === '' ? null : +s.delay;
      const pr = rtMin(s.prognosis && s.prognosis.departure);
      if (late !== null && !(Number.isInteger(late) && late >= -5 && late <= 90 && !(Number.isFinite(pr) && Math.abs(pr - m - late) > 1))) { st.bad++; late = null; }
      got.push({ p: c[0], m, late });
      used.set(c[0], (used.get(c[0]) || 0) + 1);
    }
    const map = new Map();
    for (const g of got) {
      if (used.get(g.p) > 1) { st.unsure++; continue; }       // two live buses for one planned: neither
      st.matched++;
      if (g.late === null) { st.none++; continue; }
      st.delay++;
      const late = Math.max(0, g.late);                        // a minute early reads as on time
      if (late) st.late++;
      map.set(g.p.t, { t: g.p.t, i: g.p.i, m: g.p.m, late });
    }
    st.fit = st.matched >= 3 && st.matched >= 0.6 * st.live;
    this.busStat = st;                                         // for checking
    return { trips: this.busTrips, map: st.fit ? map : new Map(), stat: st };
  }
  // the live delays of today's buses (trip -> { i: the station call, m, late }), or null: no live data, stale, or another moment shown
  busLive() { const d = this.busSrc && this.busSrc.value(); return d && d.match && d.match.trips === this.busTrips ? d.match.map : null; }

  // the delay a bus runs with eases in and out, never a jump: a bus not yet out takes it at once (or sets off now if it should already
  // have), one on its way takes a new delay standing at its stop, or at half speed between stops, and makes up time at one and a half;
  // a trip that is over stays over. dm: minutes since the last frame, < 0 when the clock jumped (everything is placed afresh)
  busEase(t, m, off, want, dm) {
    const tm = t.tm, n = tm.length, mt = m - off;
    if (dm < 0) return want;
    if (mt > tm[n - 1]) return off;
    if (mt < tm[0]) return Math.max(want, Math.min(off, m - tm[0]));
    let i = 0; while (i < n - 2 && mt >= tm[i + 1]) i++;
    const T = (tm[i + 1] - tm[i]) * 60, at = (mt - tm[i]) * 60 < (i ? Math.min(14, T * 0.3) : 2);
    return want > off ? Math.min(want, off + (at ? 1 : 0.5) * dm) : Math.max(want, off - 0.5 * dm);
  }

  // the next departures from one stop: [planned minute, line, to, live delay at the station or null]; a late bus stays until it has left
  busNext(id, k = 3) {
    if (!this.busTrips) return [];
    this.busDay();
    const m = this.clock() / 60, L = this.busLive(), out = [];
    for (const t of this.busTrips) for (let i = 0; i < t.st.length - 1; i++) if (t.st[i] === id) {
      const r = L && L.get(t), late = r && r.i === i ? r.late : null;
      if (t.tm[i] + (late || 0) >= m) out.push([t.tm[i], t.line, t.to, late]);
    }
    return out.sort((a, b) => a[0] - b[0]).slice(0, k);
  }

  // the "Adesso" panel: only with live delays for at least two buses leaving the station in the next quarter of an hour (further
  // ahead the forecast is the timetable itself: measured, nearly every delay shows up only in the last minutes before leaving)
  busInfo() {
    const L = this.busLive();
    if (!L) return null;
    const s0 = this.clock(), m = this._ck.day * 1440 + s0 / 60;
    let n = 0, k = 0, top = null;
    for (const r of L.values()) if (r.m + r.late >= m - 0.5 && r.m <= m + 15) { n++; if (r.late >= 3) { k++; if (!top || r.late > top.late) top = r; } }
    if (n < 2) return null;
    return !k ? say('bus.ontime') : say(k === 1 ? 'bus.late.one' : 'bus.late', { n: k, line: top.t.line, late: top.late });
  }

  // this.busTrips: the journeys of the day shown (Monday to Friday, Saturday, or Sunday and public holidays), with
  // those of the evening before still running after midnight, their times moved onto this day's clock
  busDay() {
    this.clock();
    const day = this._ck.day, key = day + (this.holiday ? 'h' : '');
    if (this._busKey === key) return;
    this._busKey = key;
    const kind = (d, hol) => { const wd = (((d + 4) % 7) + 7) % 7; return hol || wd === 0 ? 4 : wd === 6 ? 2 : 1; };   // wd 0 = Sunday
    const today = kind(day, this.holiday), before = kind(day - 1, false);
    this.busTrips = this.busAll.filter(t => (t.days & before) && t.tm[t.tm.length - 1] > 1440).map(t => ({ ...t, tm: t.tm.map(x => x - 1440), _at: null }))
      .concat(this.busAll.filter(t => t.days & today));
    this._stopAt = null;                                     // the place cards (index.html) look up the stops again among these
  }

  // where every bus of the timetable is right now
  busesNow() {
    if (!this.busAll) return [];
    this.busDay();
    const out = [], m0 = this.clock() / 60, L = this.busLive(), dm = this._bm == null ? -1 : m0 - this._bm;
    this._bm = m0;
    for (const t of this.busTrips) {
      const n = t.tm.length, r = L && L.get(t), want = r ? r.late : 0;
      if (want || t._off) t._off = this.busEase(t, m0, t._off || 0, want, dm > 5 ? -1 : dm);   // live delay at the station (busMatch)
      const m = m0 - (t._off || 0);                           // the trip's own clock: the timetable, late
      if (m < t.tm[0] || m > t.tm[n - 1]) continue;
      let i = 0; while (i < n - 2 && m >= t.tm[i + 1]) i++;
      const seg = t.legs[i], T = (t.tm[i + 1] - t.tm[i]) * 60, dwell = i === 0 ? 0 : Math.min(14, T * 0.3);
      let f = Math.max(0, Math.min(1, ((m - t.tm[i]) * 60 - dwell) / Math.max(1, T - dwell)));
      f = f * f * (3 - 2 * f);                               // pull away and brake gently
      // the timetable says where the bus should be; the bus drawn follows that point, waits at red lights and then makes up the time
      let s = f * seg.len;
      if (this.signals) {
        if (!seg.sg) {                                       // lights along this leg: stop lines within 6 m of the path, facing the same way
          seg.sg = [];
          for (const g of this.signals) for (let k = 1; k < seg.n; k++) {
            const a = k * 4, dx = seg.p[a] - seg.p[a - 4], dy = seg.p[a + 1] - seg.p[a - 3], d = Math.hypot(dx, dy) || 1;
            if (Math.hypot(seg.p[a] - g.x, seg.p[a + 1] - g.y) < 6 && (dx * g.hx + dy * g.hy) / d > 0.6) { seg.sg.push({ s: seg.cum[k], g }); break; }
          }
        }
        const dt = t._at == null ? 1e9 : this.t - t._at;
        if (t._leg !== i || dt > 5 || dt < 0 || s < t._s - 30) { t._leg = i; t._s = s; }     // new leg, or the clock was moved: start from the timetable
        else if (dt > 0) {
          let to = Math.min(s, t._s + 15 * dt);              // catches up at 54 km/h at most
          for (const k of seg.sg) {
            const line = k.s - 7, st = this.sigState(k.g);
            if (t._s <= line + 0.5 && to > line && (st === 2 || (st === 1 && line - t._s > 8))) to = Math.max(t._s, line);
          }
          t._s = Math.max(t._s, to);
        }
        t._at = this.t; s = t._s;
      }
      const q = this.at(seg, s);
      if (i > 0) {                                           // the previous leg may have ended on the other kerb: ease across instead of jumping
        const pp = t.legs[i - 1].p, k = pp.length - 4, el = (m - t.tm[i]) * 60;
        if (el < 6) { const g = 1 - el / 6; q[0] += (pp[k] - seg.p[0]) * g; q[1] += (pp[k + 1] - seg.p[1]) * g; }
      }
      out.push({ q, t, i, el: (m - t.tm[i]) * 60, dwell, left: (t.tm[i + 1] - m) * 60, last: i + 1 === n - 1, next: t.st[i + 1], eta: t.tm[i + 1], stopped: f === 0, red: s < f * seg.len - 4, late: want });
    }
    return out;
  }

  // what is under the pointer: a train or a bus drawn in the last frame
  pick(x, y) {
    let best = null, bd = 1e9;
    for (const h of this.hot || []) { const d = Math.hypot(h.x - x, h.y - y) - h.r; if (d < 6 && d < bd) { bd = d; best = h; } }
    return best && best.info();
  }

  // the next real departures, for the board: a late train stays on it until it has left. With live data each row
  // carries .rt = { late: minutes, plat: the new platform or null, off: cancelled }; cancelled rows only when `withOff`.
  // Within the live board's window the rows are the live board's trains (saved ones it replaced are left out); beyond it, the saved timetable
  departures(n = 6, withOff = false) {
    if (!this.tt) return [];
    const m = this.clock() / 60, day = this._ck.day, out = [];
    this.tt.date = this.ttFor(day).date;                     // the board says the date of the timetable it shows
    const add = (mm, d, r) => {
      const late = r && !r.off && r.late > 0 ? r.late : 0;
      if (mm + late < m - 0.5 || (r && r.off && !withOff)) return;
      const x = [mm, ...d];
      if (r) x.rt = { late, plat: r.plat, off: r.off };
      out.push(x);
    };
    for (let k = 0; k <= 1; k++) this.ttFor(day + k).dep.forEach((d, i) => { const r = this.rtFor((day + k) * 2048 + i); if (!(r && r.sup)) add(d[0] + k * 1440, d.slice(1), r); });
    if (this.rtLive()) for (const [key, r] of this.rt.map) if (r.x && !r.x.end && this.rtFor(key)) add(r.m - day * 1440, [r.x.line, r.x.to, r.x.plat, r.x.way], r);
    return out.sort((a, b) => a[0] - b[0]).slice(0, n);
  }

  // ---- real-time delays -----------------------------------------------------------------------------------
  // live data is in use: the map shows now (as extras.live()), and the last answer is recent
  rtLive() { const R = this.rt; return !!R && R.at > 0 && Date.now() - R.at < RT_STALE && Math.abs(this.shiftMs || 0) < 45 * 60000; }
  // what the live board says of one planned train (key: day * 2048 + index, + 1024 for one that ends here), or null
  rtFor(key) { if (!this.rtLive()) return null; const r = this.rt.map.get(key); return r && Date.now() - r.seen < r.keep ? r : null; }

  // ask again once a minute while the tab is visible and the map shows now; after a failure wait 2, 4, 8, 15 minutes
  rtTick() {
    const R = this.rt;
    if (!R || R.busy || Date.now() < R.next || Math.abs(this.shiftMs || 0) >= 45 * 60000 || typeof fetch !== 'function') return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    // not while the page shows the past (index.html marks ?epoca as such from the start, until the era is known) or another moment
    if (typeof document !== 'undefined' && document.body && document.body.classList.contains('era')) return;
    if (typeof window !== 'undefined' && window.__now && Math.abs(window.__now() - Date.now()) >= 45 * 60000) return;
    this.rtPoll();
  }
  async rtPoll() {
    const R = this.rt, shift = this.shiftMs || 0;
    if (R.busy) return;
    R.busy = true;
    if (this._ttFresh && !this.rtLive()) R.hold = Date.now() + 2500;   // trains are about to be placed: wait a moment for their delays
    try {
      const dep = await this.rtGet(false, shift);
      if ((this.shiftMs || 0) !== shift) return;              // the time machine moved meanwhile: this answer is not for the map
      this.rtTake(dep, false);
      R.at = Date.now(); R.fails = 0; R.next = R.at + 60000;
      // trains that end here are only on the arrival board: asked every other minute, and only when one is due
      if (R.at - R.arrAt >= 115000 && this.rtEndSoon()) { R.arrAt = R.at; try { this.rtTake(await this.rtGet(true, shift), true); } catch { /* left as planned */ } }
    } catch (e) {
      R.fails++;
      R.next = Date.now() + Math.max(e && e.rate ? 300000 : 0, Math.min(900000, 60000 * 2 ** Math.min(R.fails, 4)));
    } finally { R.busy = false; R.hold = 0; }
  }
  async rtGet(arrivals, shift) {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(Date.now() + shift - 30 * 60000));
    const g = k => p.find(x => x.type === k).value;
    const ac = new AbortController(), timer = setTimeout(() => ac.abort(), 20000);   // connecting alone can take 10-20 s at times
    try {
      const r = await fetch(`${RT_URL}&datetime=${g('year')}-${g('month')}-${g('day')}%20${g('hour')}:${g('minute')}${arrivals ? '&type=arrival' : ''}`, { signal: ac.signal, cache: 'no-store', credentials: 'omit' });
      if (r.status === 429) throw { rate: true };
      if (!r.ok) throw new Error('board ' + r.status);
      const j = await r.json();
      if (!j || !Array.isArray(j.stationboard)) throw new Error('board shape');
      return j.stationboard;
    } finally { clearTimeout(timer); }
  }
  rtEndSoon() {
    const m = this._ck.day * 1440 + this.clock() / 60;
    for (let k = -1; k <= 1; k++) for (const d of this.ttFor(this._ck.day + k).end || []) { const x = (this._ck.day + k) * 1440 + d[0] - m; if (x > -10 && x < 50) return true; }
    for (const r of this.rt.map.values()) if (r.x && r.x.end && r.m - m > -10 && r.m - m < 50) return true;
    return false;
  }

  // N or S for a train the saved timetable does not have: from its destination (or the destination's first word) on all saved
  // days, else from the usual direction of its line; null when the saved days do not say
  rtWay(line, to, toRaw, end) {
    if (!this._ways) {
      const c = this._ways = new Map(), add = (k, w) => { const v = c.get(k) || c.set(k, [0, 0]).get(k); v[w === 'N' ? 0 : 1]++; };
      for (const tab of [...Object.values(this.tt.week || {}), ...Object.values(this.tt.days || {})]) if (tab && typeof tab === 'object') {
        for (const d of tab.dep || []) { add('d' + rtNorm(d[2]), d[4]); add('w' + rtNorm(String(d[2]).split(/[\s,]/)[0]), d[4]); add('l' + d[1], d[4]); }
        for (const d of tab.end || []) add('e' + d[1], d[3]);
      }
    }
    const pick = k => { const v = this._ways.get(k); return !v ? null : v[0] >= 4 * v[1] ? 'N' : v[1] >= 4 * v[0] ? 'S' : null; };
    return end ? pick('e' + line) || pick('l' + line) : pick('d' + to) || pick('w' + rtNorm(toRaw.split(/[\s,]/)[0])) || pick('l' + line);
  }

  // match a live board to the planned trains: same minute (or within two, same line and destination), then the line
  // (S10, IC2; an EC has its train number instead) and the destination decide between trains sharing a minute.
  // The API leaves cancelled trains out of the board: a planned train missing from the middle of a board that
  // otherwise matches (three in four at least) is taken as cancelled, unless an unmatched live train is near its minute.
  rtTake(list, end) {
    const R = this.rt, now = Date.now(), live = [], plan = new Map();
    for (let k = -1; k <= 1; k++) {
      const day = this._ck.day + k, tab = this.ttFor(day);
      (end ? tab.end || [] : tab.dep).forEach((d, i) => { const m = day * 1440 + d[0]; (plan.get(m) || plan.set(m, []).get(m)).push({ key: day * 2048 + (end ? 1024 : 0) + i, m, line: d[1], to: end ? '' : rtNorm(d[2]), plat: end ? d[2] : d[3], way: end ? d[3] : d[4] }); });
    }
    const mNow = this._ck.day * 1440 + this.clock() / 60;
    for (const e of list) {
      const st = e && e.stop, m = rtMin(st && st.departure);
      if (!(Math.abs(m - mNow) < 2160) || (end && rtNorm(e.to) !== 'bellinzona')) continue;    // the arrival board: only the trains that end here
      let late = st.delay == null || st.delay === '' ? NaN : +st.delay;
      if (!Number.isFinite(late)) late = rtMin(st.prognosis && st.prognosis.departure) - m;
      if (late < -30 || late > 300) continue;                 // nonsense
      const cat = String(e.category || '').trim(), num = String(e.number || '').trim(), pr = st.prognosis && st.prognosis.platform;
      live.push({ m, cat, line: cat + (/^[1-9]\d{0,2}$/.test(num) ? num : ''), to: rtNorm(e.to), toRaw: String(e.to || '').trim(), late: Number.isFinite(late) ? Math.max(0, Math.round(late)) : null, plat: String(pr || st.platform || '').trim() });
    }
    if (!end && !live.length) throw new Error('board empty');
    const pairs = [];
    live.forEach((l, li) => { for (let dm = -2; dm <= 2; dm++) for (const p of plan.get(Math.round(l.m) + dm) || []) {
      const ls = p.line === l.line ? 2 : p.line.replace(/\d+$/, '') === l.cat ? 1 : 0, ds = end ? 2 : p.to === l.to ? 2 : p.to && l.to && (p.to.startsWith(l.to) || l.to.startsWith(p.to)) ? 1 : 0;
      if (dm ? ls === 2 && ds === 2 : ls === 2 || (ls === 1 && ds > 0)) pairs.push([(dm ? 0 : 10) + ls * 3 + ds - Math.abs(dm), li, p]);
    } });
    pairs.sort((a, b) => b[0] - a[0]);
    const used = new Map(), usedP = new Set(), map = new Map();
    for (const [, li, p] of pairs) if (!used.has(li) && !usedP.has(p.key)) { used.set(li, p); usedP.add(p.key); }
    const m0 = Math.min(...live.map(l => l.m)), m1 = Math.max(...live.map(l => l.m));
    let n = 0, hit = 0;
    for (const [m, ps] of plan) if (m > m0 && m < m1) for (const p of ps) { n++; if (usedP.has(p.key)) hit++; }
    // the saved timetable fits the live board (three in four): adjust it. It does not (a new timetable, works): the board alone is
    // the truth for its window, every saved train in it is left out (nothing "soppresso") and every live train runs
    if (!end) { R.fits = n >= 4 && hit >= 0.75 * n; R.trust = n >= 4 && !R.fits; }
    const trust = !!R.trust, st = { live: live.length, matched: trust ? 0 : used.size, planned: n, hit, missing: 0, cancelled: 0, extra: 0, skipped: 0, trust };
    if (!trust) for (const [li, p] of used) {
      const l = live[li], moved = l.plat && p.plat && l.plat !== p.plat && parseInt(l.plat, 10) !== parseInt(p.plat, 10);
      map.set(p.key, { m: p.m, e: end, late: l.late, plat: moved ? l.plat : null, off: false, seen: now, keep: RT_STALE });
    }
    // saved trains of the window the board does not have: cancelled (missing from inside a board that fits), or replaced by an
    // unmatched live train near their minute, or by the whole board; sup = left out without a word
    for (const [m, ps] of plan) if (m >= m0 && m <= m1) for (const p of ps) {
      if (!trust && usedP.has(p.key)) continue;
      st.missing++;
      const near = live.some((l, li) => !used.has(li) && Math.abs(l.m - m) <= 2), off = !trust && !near && m > m0 && m < m1 && R.fits;
      if (trust || near || off) map.set(p.key, { m, e: end, late: null, plat: null, off, sup: !off, seen: now, keep: RT_STALE });
      if (off) st.cancelled++;
    }
    // live trains the saved timetable does not have run as they are, in the direction their destination (or line) has on the saved days
    live.forEach((l, li) => {
      if (!trust && used.has(li)) return;
      let way = this.rtWay(l.line, l.to, l.toRaw, end);
      if (!way) for (const [m, ps] of plan) if (Math.abs(m - l.m) <= 2) for (const p of ps) if (!usedP.has(p.key)) way = p.way;   // else that of the saved train it replaces
      if (!way) { st.skipped++; return; }
      st.extra++;
      map.set((end ? 'E' : 'D') + l.m + '|' + l.line + '|' + l.to, { m: l.m, e: end, late: l.late, plat: null, off: false, seen: now, keep: RT_STALE, x: { line: l.line, to: l.toRaw, plat: l.plat, way, end } });
    });
    R[end ? 'statEnd' : 'stat'] = st;                         // for checking
    // what this board says replaces what the last one said; a late train whose time is already behind the board keeps its last delay a while
    for (const [k, r] of R.map) {
      if (!!r.e !== end) map.set(k, r);
      else if (!map.has(k) && live.length && r.m < m0 && !r.off && !r.sup && now - r.seen < 900000) map.set(k, { ...r, keep: 900000 });
    }
    R.map = map;
  }

  // the trains already on the map follow what the live board says: a new delay holds them at the platform (or slows
  // their approach), a new platform is taken only while they are still far from the station
  rtApply() {
    const P = this.platforms;
    for (const t of this.trains) {
      const s = t.sched;
      if (!s || t.key == null || t.gone) continue;
      let r = this.rtFor(t.key);
      if (r && (r.off || r.sup) && !t.live && !s.off) {        // a saved train the board has under another minute: its live twin (same line and way, within 6 min) takes it over
        for (const [k, x] of this.rt.map) if (x.x && !this.ttDone.has(k) && x.x.line === s.line && x.x.way === t.way && !x.x.end === !t.endT && Math.abs(x.m * 60 + (t.endT ? 200 : 0) - t.planAt) <= 360 && this.rtFor(k)) {
          this.ttDone.add(k); r = x;
          Object.assign(t, { key: k, live: true, planAt: x.m * 60 + (t.endT ? 200 : 0), planArr: null, arrAt: null, late: NaN });
          Object.assign(s, { dep: (x.m * 60) % 86400, arr: null, to: t.endT ? s.to : x.x.to, plat0: x.x.plat });
          break;
        }
      }
      const L = r && !r.off && r.late > 0 ? r.late * 60 : 0;
      if (L !== t.late) { t.late = L; s.at = t.planAt + L; if (t.planArr != null) t.arrAt = t.planArr + L; }
      if (r && r.off && !s.off && t.since == null) s.off = s.end = true;        // cancelled on its way in: out of service at the platform
      const pl = (r && r.plat) || s.plat0;
      if (pl === s.plat || t.dwell > 0 || t.since != null || !P) continue;
      const q = this.behind(t, 0, true);
      if (!q || Math.abs((q[0] - P.st[0]) * P.ax[0] + (q[1] - P.st[1]) * P.ax[1]) < 420) continue;
      const trk = parseInt(pl, 10);
      s.plat = pl;
      if (P.tracks[trk] != null) { t.lat = P.tracks[trk]; t.seen = P.seen && P.seen[trk]; }
    }
  }

  // every timetabled train that is on the map at this moment, wherever it has got to: also right after the page opens,
  // the time machine moves or the tab comes back from the background
  schedule(dt) {
    const now = this.clock(), abs = this._ck.day * 86400 + now;   // abs: seconds on the station clock, days included
    if (this._ttAbs == null) this._ttFresh = true;
    else {
      this._ttLag = (this._ttLag || 0) + abs - this._ttAbs - dt;   // the clock ran ahead of the frames (or jumped)
      if (this._ttLag > 600 || this._ttLag < -3) { this.trains = this.trains.filter(t => !t.sched); this.ttDone.clear(); this._ttLag = 0; this._ttFresh = true; }
      else if (this._ttLag > 1) {                          // slow frames, a short time away: the trains catch up
        for (const t of this.trains) if (t.sched) for (let x = this._ttLag; x > 0 && !t.gone; x -= 0.5) this.moveTrain(t, Math.min(0.5, x), abs - x + Math.min(0.5, x));
        this._ttLag = 0; this._ttFresh = true;
      }
    }
    this._ttAbs = abs;
    this.rtTick();
    if (this.rt && this.rt.hold > Date.now()) return;      // the first live answer is on its way (2.5 s at most)
    this.rtApply();
    for (let k = -1; k <= 1; k++) {                          // the evening before, today, the first trains after midnight
      const day = this._ck.day + k, tab = this.ttFor(day);
      for (let i = 0; i < tab.dep.length; i++) this.spawn(tab.dep[i], false, day, i, abs);
      for (let i = 0; i < (tab.end || []).length; i++) this.spawn(tab.end[i], true, day, i, abs);
    }
    if (this.rtLive()) for (const [k, r] of this.rt.map) if (r.x && !this.ttDone.has(k)) {   // trains only the live board has
      const x = r.x, day = Math.floor(r.m / 1440), mi = r.m - day * 1440;
      this.spawn(x.end ? [mi, x.line, x.plat, x.way] : [mi, x.line, x.to, x.plat, x.way, undefined], x.end, day, -1, abs, k);
    }
    this._ttFresh = false;                                  // _ttFresh: placing trains wherever they have got to (page opened, clock moved)
  }

  // d: a departure [minute, line, to, platform, N|S, arrival minute | null when it starts here | undefined: not known],
  // or (end) a train that ends here [arrival minute, line, platform, N|S]
  // lk: the key of a train only the live board has (d is then built from it)
  spawn(d, end, day, i, abs, lk) {
    const way = end ? d[3] : d[4], plat0 = end ? d[2] : d[3], base = day * 86400;
    const from = way === 'N' ? (this.entry.S || this.entry.N) : (this.entry.N || this.entry.S);   // northbound trains come in from the south
    if (!from || !from.run) return;
    const rk = lk || day * 2048 + (end ? 1024 : 0) + i, r = this.rtFor(rk);   // live: late, on another platform, cancelled or replaced (does not run)
    if (r ? r.off || r.sup : lk) return;
    const late = r && r.late > 0 ? r.late * 60 : 0, plat = (r && r.plat) || plat0;
    const fast = !d[1].startsWith('S'), run = from.run[fast ? 1 : 0], arr = end ? d[0] : d[5];
    const dep = end ? d[0] * 60 + 200 : d[0] * 60;          // one that ends here stands three minutes, then is out of service
    // standing at the platform from: its arrival (timetable minutes are whole; it pulls in during that minute), not less than 50 s;
    // one that starts here (how long it stands before is not in the timetable) is there five minutes before
    const at = arr === null ? dep - 300 : arr === undefined ? dep - 50 : Math.min(arr * 60 + 20, dep - 50);
    let t0 = base + late + (arr === null ? at : at - run.in);   // when it comes into view: at the edge of the map, or at its platform
    if (abs < t0 || abs > base + dep + late + run.out) return;
    const key = lk || day + (end ? ':e' : ':') + i;          // each train once per date
    if (this.ttDone.has(key)) return;
    // live data lapsed: a saved train whose live twin (same line and way, within 6 min) is already running stays away
    if (!r && this.trains.some(o => o.live && !o.gone && o.sched.line === d[1] && o.way === way && !o.endT === !end && Math.abs(o.planAt - base - dep) <= 360)) { this.ttDone.add(key); return; }
    if (!this._ttFresh && abs - t0 > 3) {                    // its moment passed while it was held back for a delay that has since shrunk or lapsed:
      if (abs > base + dep + late) return;                   // it comes in now, from the edge of the map, unless it should be gone already
      t0 = abs;
    }
    this.ttDone.add(key);
    const t = this.passenger(from, fast, { at: base + dep + late, dep: (end ? d[0] * 60 : dep) % 86400, arr: arr == null ? null : (arr * 60 + 86400) % 86400, line: d[1], to: end ? 'Bellinzona' : d[2], plat, plat0, end });
    Object.assign(t, { key: rk, late, planAt: base + dep, way, endT: end, live: !!lk });
    if (arr !== null) { t.planArr = base + at; t.arrAt = t.planArr + late; t.run = run.in; t.prog = 0; }   // to come in on time, however late
    const P = this.platforms, trk = parseInt(plat, 10), lat = P && P.tracks[trk];
    if (lat != null) { t.lat = lat; t.seen = P.seen && P.seen[trk]; }
    if (arr === null) for (let k = 0; k < 8000 && !(t.dwell > 0) && !t.gone; k++) this.moveTrain(t, 0.5, t0);   // pulls in unseen
    for (let x = t0; x < abs && !t.gone; x += 0.5) this.moveTrain(t, Math.min(0.5, abs - x), Math.min(x + 0.5, abs));   // where it has got to by now
    if (!t.gone) this.trains.push(t);
  }

  placeTrain(t, anywhere) {
    const ends = this.rails.filter(i => { const e = this.edges[i]; return (this.out.get(e.a) || []).length + (this.out.get(e.b) || []).length <= 3; });
    const pool = anywhere || !ends.length ? this.rails : ends;
    const ei = pool[Math.floor(this.rand() * pool.length)], e = this.edges[ei];
    const dir = (this.out.get(e.a) || []).filter(o => this.edges[o.e].c === 6).length <= 1 ? 1 : -1;
    t.path = [{ e: ei, dir }];
    t.s = anywhere ? this.rand() * e.len : 0;
    t.wait = 0;
  }

  // point `d` metres behind the head of a train, walking back over the edges it came along
  // (raw: on the rail graph itself, not moved across to the train's platform track)
  behind(t, d, raw) {
    let i = t.path.length - 1, along = t.s;
    while (d > along) {
      d -= along;
      if (--i < 0) return null;
      along = this.edges[t.path[i].e].len;
    }
    const seg = t.path[i], e = this.edges[seg.e], tt = along - d;
    const q = this.at(e, seg.dir === 1 ? tt : e.len - tt);
    q[3] *= seg.dir; q[4] *= seg.dir;
    const P = this.platforms;
    if (!raw && t.lat != null && P) {                        // within 200 m of the station on its platform track, easing across over the 180 m before
      const ax = P.ax[0], ay = P.ax[1], ex = q[0] - P.st[0], ey = q[1] - P.st[1], al = ex * ax + ey * ay, g = t.lat - (ex * ay - ey * ax);
      const u = Math.max(0, Math.min(1, (380 - Math.abs(al)) / 180)), f = u * u * (3 - 2 * u);
      if (f > 0) {
        q[0] += ay * g * f; q[1] -= ax * g * f;
        const k = g * 6 * u * (1 - u) / 180 * -Math.sign(al) * (q[3] * ax + q[4] * ay), hx = q[3] + ay * k, hy = q[4] - ax * k, hl = Math.hypot(hx, hy) || 1;
        q[3] = hx / hl; q[4] = hy / hl;                      // heading along the sideways move
        const sv = f > 0.5 && t.seen && t.seen[Math.round((al + 400) / 5)];
        if (sv) q[5] = sv === '1' ? 1 : 0;                   // hidden under a canopy or behind a building, as seen from the camera
      }
    }
    return q;
  }

  // one train moves on by dt seconds; abs: the station clock at the end of the step (days * 86400 + seconds), to leave on the minute
  moveTrain(t, dt, abs) {
    if (t.wait > 0) { t.wait -= dt; if (t.wait <= 0) this.placeTrain(t, false); return; }
    const head = t.path[t.path.length - 1], e = this.edges[head.e];
    // passenger trains call at the station: brake on approach, dwell with the middle of the train at the platform, leave
    let v = t.speed;
    if (t.since != null) t.since += dt;                      // seconds since it left the platform
    if (!t.freight && this.live.stations.length) {
      const mid = this.behind(t, t.wagons * 12.8, true);
      if (mid) {
        const st = this.live.stations[0], d = Math.hypot(mid[0] - st[0], mid[1] - st[1]), left = t.since < 90;
        if (t.dwell > 0) {
          t.dwell -= dt; t.stood = (t.stood || 0) + dt; v = 0;
          // leave on the minute (late: on the minute the live board says, which may move while it stands), after 20 s at least
          if (t.sched) { const w = t.sched.at - abs; if (w < 900 + (t.late || 0)) t.dwell = Math.max(w, 20 - t.stood); }
          if (t.dwell <= 0) { t.since = 0; if (t.sched && t.sched.end) t.gone = true; }   // one that ends here goes out of service
        }
        else if (d < 45 && !left) { t.dwell = t.sched ? 20 : 18 + this.rand() * 14; t.stood = 0; }
        else if (d < 260 && !left) v *= Math.max(0.22, d / 260);
      }
    }
    if (t.arrAt != null && t.since == null && !(t.dwell > 0)) {   // running late on its way in: slower, to come in on its new time; any more is spent at the platform
      const need = t.run - t.prog, have = t.arrAt - abs, f = have > need + 1 ? Math.max(0.35, need / have) : 1;
      v *= f; t.prog += f * dt;
    }
    t.s += v * dt;
    if (t.s >= e.len) {
      const o = this.next({ e: head.e, dir: head.dir }, true);
      if (o) { t.s -= e.len; t.path.push(o); if (t.path.length > 60) t.path.shift(); }
      else if (t.sched) t.gone = true;                    // a timetabled train has left the map
      else { t.s = e.len; t.wait = 6 + this.rand() * 14; }
    }
  }

  step(dt) {
    dt = Math.min(dt, 0.1);
    this.t += dt;
    if (!(this._hourAt > this.t - 20) || this._hourShift !== (this.shiftMs || 0)) { this._hourAt = this.t; this._hourShift = this.shiftMs || 0; this.applyHour(); }
    // who is ahead of whom on each carriageway, so nobody drives through the car in front
    const lanes = new Map();
    for (const v of this.cars) { const k = v.e * 2 + (v.dir === 1 ? 0 : 1); let a = lanes.get(k); if (!a) lanes.set(k, a = []); a.push(v); }
    for (const a of lanes.values()) { a.sort((p, q) => q.s - p.s); for (let i = 0; i < a.length; i++) a[i].ahead = i ? a[i - 1] : null; }
    // junctions: who is coming up to each one
    if (!this.jdeg) {
      this.jdeg = new Map(); this.lock = new Map();
      for (const i of this.roads) { const e = this.edges[i]; for (const n of [e.a, e.b]) this.jdeg.set(n, (this.jdeg.get(n) || 0) + 1); }
    }
    const near = new Map();
    for (const v of this.cars) {
      const e = this.edges[v.e];
      v.rem = e.len - v.s; v.node = v.dir === 1 ? e.b : e.a;
      if (v.rem < 26 && this.jdeg.get(v.node) >= 3) { let a = near.get(v.node); if (!a) near.set(v.node, a = []); a.push(v); }
    }
    for (const v of this.cars) {
      const e = this.edges[v.e];
      let sp = SPEED[e.c] * v.cruise * (v.bus ? 0.8 : 1) * (0.75 + 0.25 * Math.sin(this.t * 0.13 + v.phase));
      if (v.ahead) {
        const gap = v.ahead.s - v.s - (v.ahead.len + v.len) / 2;
        if (gap < 2) sp = 0; else if (gap < 14) sp *= (gap - 2) / 12;
      }
      v.red = false;
      if (e.sig) for (const g of e.sig) {                    // stop at a red light
        if (g.d !== v.dir) continue;
        const d = (v.dir === 1 ? g.s : e.len - g.s) - v.s - v.len / 2 - 1;
        if (d < -1.5 || d > 30) continue;
        const st = this.sigState(g);
        if (st === 2 || (st === 1 && d > 9)) { sp *= Math.max(0, Math.min(1, d / 9)); v.red = true; }
      }
      // right of way: traffic on a roundabout first, then the bigger road, then whoever got there first
      if (v.rem < 14 && this.jdeg.get(v.node) >= 3 && v.cleared !== v.node) {
        if (!v.nx || v.nxFrom !== v.e) { v.nx = this.next(v, false); v.nxFrom = v.e; }
        const nx = v.nx, ne = nx ? this.edges[nx.e] : null;
        let wait = false;
        const lk = this.lock.get(v.node);
        if (lk && lk.car !== v && lk.until > this.t) wait = true;
        const patient = (v.waited || 0) < 7;                 // nobody waits for ever
        if (!wait && patient && ne) {
          for (const o of near.get(v.node) || []) {
            if (o === v || o.e === v.e || o.red) continue;
            const oe = this.edges[o.e], moving = (o.waited || 0) < 0.5;
            if (ne.ra && !e.ra && oe.ra && o.rem < 16) { wait = true; break; }                 // entering a roundabout
            if (!e.ra && !oe.ra && oe.c < e.c && moving && o.rem < 22 && o.rem < v.rem + 14) { wait = true; break; }   // side road
          }
        }
        if (!wait && ne) {                                  // is there room on the far side?
          const tail = lanes.get(nx.e * 2 + (nx.dir === 1 ? 0 : 1));
          if (tail && tail.length) { const last = tail[tail.length - 1]; if (last.s < last.len / 2 + v.len / 2 + 2.5) wait = true; }
        }
        if (wait) { sp *= Math.max(0, Math.min(1, (v.rem - 3.5) / 8)); if (v.rem < 5) v.waited = (v.waited || 0) + dt; }
        else if (v.rem < 5.5) { this.lock.set(v.node, { car: v, until: this.t + 5 }); v.cleared = v.node; v.hold = v.node; v.waited = 0; }
      }
      v.s += sp * dt;
      if (v.hold != null && v.cleared == null && v.s > v.len / 2 + 4) { const k = this.lock.get(v.hold); if (k && k.car === v) this.lock.delete(v.hold); v.hold = null; }   // junction is free again
      if (v.s >= e.len) {
        const o = (v.nx && v.nxFrom === v.e) ? v.nx : this.next(v, false);
        v.nx = null; v.cleared = null; v.waited = 0;
        if (o) { v.e = o.e; v.dir = o.dir; v.s = 0; }
        else {                                              // dead end or edge of the map: reappear elsewhere
          const ei = this.roads[Math.floor(this.rand() * this.roads.length)];
          v.e = ei; v.dir = this.edges[ei].o ? 1 : (this.rand() < 0.5 ? 1 : -1); v.s = 0;
        }
      }
    }
    for (const p of this.strollers) {
      if (p.pause > 0) { p.pause -= dt; p.moving = false; continue; }
      const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy);
      if (d < 0.3) {                                        // arrived: linger, then head for another nearby visible spot
        p.pause = this.rand() < 0.5 ? 1 + this.rand() * 14 : 0;
        const q = p.sq.p, n = q.length / 3;
        for (let tries = 0; tries < 8; tries++) {
          const i = Math.floor(this.rand() * n) * 3;
          if (Math.hypot(q[i] - p.x, q[i + 1] - p.y) < 28 || tries === 7) { p.tx = q[i]; p.ty = q[i + 1]; p.th = q[i + 2]; break; }
        }
        continue;
      }
      const st = Math.min(d, p.speed * dt);
      p.x += dx / d * st; p.y += dy / d * st; p.h += (p.th - p.h) * Math.min(1, st / d); p.moving = true;
    }
    for (const p of this.people) {
      if (p.still) { if (this.rand() < dt / 40) p.still = false; continue; }
      if (p.pause > 0) { p.pause -= dt; continue; }
      const e = this.edges[p.e];
      p.s += p.speed * dt;
      if (p.s >= e.len) {
        const node = p.dir === 1 ? e.b : e.a;
        const opts = (this.outWalk.get(node) || []).filter(o => o.e !== p.e);
        if (opts.length) {
          const w = opts.map(o => { const oe = this.edges[o.e]; return oe.c === 7 ? oe.d + 0.3 : 0.8; });
          let t = this.rand() * w.reduce((a, b) => a + b, 0), j = 0;
          while (t > w[j] && j < w.length - 1) t -= w[j++];
          const was = e.c, o = opts[j], oe = this.edges[o.e];
          p.e = o.e; p.dir = o.dir; p.s = 0;
          if (oe.c !== was) p.lat = oe.c === 7 ? (this.rand() - 0.5) * Math.max(0.6, oe.w - 1) : oe.w / 2 + 1.0;
          if (this.rand() < 0.04) p.pause = 2 + this.rand() * 8;
        } else { p.dir = -p.dir; p.s = 0; }                 // dead end: turn round
      }
    }
    if (this.tt) this.schedule(dt);
    if (this.busAll) this.busDay();
    for (const t of this.trains) if (!t.gone) this.moveTrain(t, dt, this._ttAbs || 0);
    if (this.trains.some(t => t.gone)) this.trains = this.trains.filter(t => !t.gone);
    const [x0, y0, x1, y1] = this.content;
    for (const f of this.flocks) {
      const c = Math.cos(f.turn * dt), s = Math.sin(f.turn * dt);
      [f.vx, f.vy] = [f.vx * c - f.vy * s, f.vx * s + f.vy * c];
      f.x += f.vx * dt; f.y += f.vy * dt;
      if (f.x < x0) f.x = x1; if (f.x > x1) f.x = x0; if (f.y < y0) f.y = y1; if (f.y > y1) f.y = y0;
    }
  }

  // toScreen(worldPxX, worldPxY) -> [sx, sy];  ppm = screen pixels per metre
  draw(ctx, toScreen, ppm, W, H) {
    const M = this.M;
    const P = (e, n, h) => toScreen(M[0][0] * e + M[0][1] * n + M[0][2] * h, M[1][0] * e + M[1][1] * n + M[1][2] * h);
    const poly = (pts, fill) => { ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); ctx.fill(); };
    const box = (q, len, wid, hei, body, top, cabin, stripe) => {
      const [e, n, h, te, tn] = q, re = tn, rn = -te, hl = len / 2, hw = wid / 2;
      const c = (f, r, z) => P(e + te * f + re * r, n + tn * f + rn * r, h + z);
      const sh = z => [e + SHADOW[0] * z, n + SHADOW[1] * z];
      const s0 = sh(hei);
      const S = (f, r) => P(s0[0] + te * f + re * r, s0[1] + tn * f + rn * r, h);
      poly([c(-hl, -hw, 0), c(hl, -hw, 0), S(hl, -hw), S(hl, hw), S(-hl, hw), c(-hl, hw, 0)], 'rgba(30,32,60,0.28)');
      const b = [c(-hl, -hw, 0), c(hl, -hw, 0), c(hl, hw, 0), c(-hl, hw, 0)], t = [c(-hl, -hw, hei), c(hl, -hw, hei), c(hl, hw, hei), c(-hl, hw, hei)];
      for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; poly([b[i], b[j], t[j], t[i]], shade(body, i % 2 ? 0.62 : 0.8)); }
      if (stripe) for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4, m = (a, k) => [a[0] + (k[0] - a[0]) * 0.42, a[1] + (k[1] - a[1]) * 0.42], m2 = (a, k) => [a[0] + (k[0] - a[0]) * 0.62, a[1] + (k[1] - a[1]) * 0.62];
        poly([m(b[i], t[i]), m(b[j], t[j]), m2(b[j], t[j]), m2(b[i], t[i])], stripe);
      }
      poly(t, top);
      if (cabin) {                                          // glasshouse + roof panel
        const g = [c(-hl * 0.62, -hw * 0.86, hei), c(hl * 0.42, -hw * 0.86, hei), c(hl * 0.42, hw * 0.86, hei), c(-hl * 0.62, hw * 0.86, hei)];
        poly(g, '#2c3440');
        const rf = [c(-hl * 0.42, -hw * 0.8, hei + 0.02), c(hl * 0.18, -hw * 0.8, hei + 0.02), c(hl * 0.18, hw * 0.8, hei + 0.02), c(-hl * 0.42, hw * 0.8, hei + 0.02)];
        poly(rf, top);
      }
    };
    // a car: wheels, body, glasshouse with a roof, lights at both ends. moving cars are remembered in this.beams so
    // that their headlights can be drawn over the night (extras.js)
    const beams = this.beams = [];
    const car = (q, len, wid, color, moving) => {
      const [e, n, h, te, tn] = q, re = tn, rn = -te, hl = len / 2, hw = wid / 2;
      const c = (f, r, z) => P(e + te * f + re * r, n + tn * f + rn * r, h + z);
      const s0 = [e + SHADOW[0] * 1.3, n + SHADOW[1] * 1.3], S = (f, r) => P(s0[0] + te * f + re * r, s0[1] + tn * f + rn * r, h);
      poly([c(-hl, -hw, 0), c(hl, -hw, 0), S(hl, -hw), S(hl, hw), S(-hl, hw), c(-hl, hw, 0)], 'rgba(30,32,60,0.28)');
      const prism = (f0, f1, r0, r1, z0, z1, side, top) => {
        const b = [c(f0, r0, z0), c(f1, r0, z0), c(f1, r1, z0), c(f0, r1, z0)], t = [c(f0, r0, z1), c(f1, r0, z1), c(f1, r1, z1), c(f0, r1, z1)];
        for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; poly([b[i], b[j], t[j], t[i]], shade(side, i % 2 ? 0.62 : 0.8)); }
        poly(t, top);
      };
      if (ppm > 2.2) for (const f of [-hl * 0.6, hl * 0.6]) for (const r of [-1, 1]) prism(f - 0.34, f + 0.34, r * hw - (r > 0 ? 0.22 : -0.02), r * hw + (r > 0 ? 0.02 : 0.22), 0, 0.62, '#17181b', '#17181b');   // wheels
      prism(-hl, hl, -hw, hw, 0.22, 0.82, color, shade(color, 1.05));                                   // body
      const frontSeen = c(hl, 0, 0)[1] > c(-hl, 0, 0)[1];
      if (ppm > 1.6) {                                       // lights on the end that faces the viewer
        const f = frontSeen ? hl : -hl, col = frontSeen ? '#fff3c4' : '#d8231f';
        for (const r of [-1, 1]) poly([c(f, r * hw * 0.5, 0.48), c(f, r * hw * 0.92, 0.48), c(f, r * hw * 0.92, 0.72), c(f, r * hw * 0.5, 0.72)], col);
      }
      prism(-hl * 0.58, hl * 0.28, -hw * 0.86, hw * 0.86, 0.82, 1.38, '#26303c', '#26303c');            // glasshouse
      if (ppm > 1.6) poly([c(hl * 0.28, -hw * 0.8, 0.86), c(hl * 0.28, hw * 0.8, 0.86), c(hl * 0.1, hw * 0.74, 1.36), c(hl * 0.1, -hw * 0.74, 1.36)], '#7fa0b8');   // windscreen
      poly([c(-hl * 0.46, -hw * 0.8, 1.4), c(hl * 0.1, -hw * 0.8, 1.4), c(hl * 0.1, hw * 0.8, 1.4), c(-hl * 0.46, hw * 0.8, 1.4)], shade(color, 1.08));               // roof
      if (moving) beams.push([e, n, h, te, tn, hl, hw]);
    };
    const on = p => p[0] > -60 && p[1] > -60 && p[0] < W + 60 && p[1] < H + 60;
    this._box = box; this._P = P; this._poly = poly;        // for what extras.js draws in this pass (the grandstand, the floats)
    const hot = this.hot = [];
    const hm = m => { m = ((Math.floor(m) % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };

    if (ppm > 0.9 && this.live.parked) {                       // parked cars in the car parks (static)
      if (!this.parkedCars) {
        const r = rng(77);
        this.parkedCars = this.live.parked.map(p => ({ q: p, len: 4.1 + r() * 0.5, color: CAR_COLORS[Math.floor(r() * CAR_COLORS.length)] }));
      }
      for (const c of this.parkedCars) {
        if (!on(P(c.q[0], c.q[1], c.q[2]))) continue;
        car(c.q, c.len, 1.8, c.color, false);
      }
    }
    if (ppm > 0.55) {
      for (const v of this.cars) {
        const e = this.edges[v.e], q = this.at(e, v.dir === 1 ? v.s : e.len - v.s);
        if (!q[5]) continue;
        q[3] *= v.dir; q[4] *= v.dir;
        const off = e.o ? 0 : Math.min(e.w / 4, 1.7);       // keep right
        q[0] += q[4] * off; q[1] -= q[3] * off;
        if (!on(P(q[0], q[1], q[2]))) continue;
        if (v.bus) { box(q, v.len, v.wid, v.hei, v.color, v.color, false, '#26303c'); beams.push([q[0], q[1], q[2], q[3], q[4], v.len / 2, v.wid / 2]); } else car(q, v.len, v.wid, v.color, true);
        if (v.bus) box([q[0], q[1], q[2] + v.hei, q[3], q[4]], v.len * 0.9, v.wid * 0.7, 0.18, '#d8dade', '#e6e8ea', false, null);
      }
    }
    if (ppm > 0.9) for (const sh of this.shelters || []) {     // bus shelters (stops tagged shelter=yes)
      if (!on(P(sh[0], sh[1], sh[2]))) continue;
      box(sh, 3.6, 1.3, 2.3, '#9db2c2', '#4d5660', false, null);
    }
    if (ppm > 1.1) for (const g of this.signals || []) {       // traffic lights, on the right of the lane they control
      const r = g.w / 2 + 0.6, e0 = g.x + g.hy * r, n0 = g.y - g.hx * r, a = P(e0, n0, g.z);
      if (!on(a)) continue;
      const b = P(e0, n0, g.z + 3.3), st = this.sigState(g), k = Math.max(1.6, ppm * 0.42);
      ctx.strokeStyle = '#2a2d33'; ctx.lineWidth = Math.max(1, ppm * 0.16); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      ctx.fillStyle = '#1b1d21'; ctx.fillRect(b[0] - k * 0.75, b[1] - k * 2.6, k * 1.5, k * 3.4);
      ctx.fillStyle = ['#35e06a', '#ffc21a', '#ff3b30'][st];
      ctx.beginPath(); ctx.arc(b[0], b[1] - k * [-0.1, 0.9, 1.9][st], k * 0.62, 0, 6.3); ctx.fill();
      hot.push({ x: b[0], y: b[1] - k, r: 9, info: () => ({ kind: 'sig', title: say('sig.' + ['green', 'yellow', 'red'][st]), sub: say('sig.sub') }) });
    }
    if (ppm > 0.3) {                                        // buses of the real timetable
      for (const b of (this._buses = this.busesNow())) {
        const q = b.q;
        if (!q[5]) continue;
        q[0] += q[4] * 1.6; q[1] -= q[3] * 1.6;             // keep right
        const c = P(q[0], q[1], q[2] + 1.5);
        if (!on(c)) continue;
        box(q, 11.5, 2.5, 3.0, BUS_COLORS[0], BUS_COLORS[0], false, '#26303c'); beams.push([q[0], q[1], q[2], q[3], q[4], 5.75, 1.25]);
        box([q[0], q[1], q[2] + 3.0, q[3], q[4]], 10.3, 1.75, 0.18, '#d8dade', '#e6e8ea', false, null);
        hot.push({ x: c[0], y: c[1], r: Math.max(7, 6 * ppm), info: () => ({ kind: 'bus', title: say('bus.title', { line: b.t.line }), to: b.t.to,
          sub: say(b.stopped ? 'bus.atstop' : 'bus.next', { stop: this.busStops[b.next], time: hm(b.eta) }) + (b.late ? ' · ' + say(b.next === this.busS ? 'bus.late.here' : 'bus.late.station', { late: b.late }) : '') }) });   // planned time, live delay
      }
    }
    // round things (trees, balls, the carousel). One with `sort` ([e, n, h], the foot of a tall thing such as a Christmas tree) is
    // drawn among the people instead, by that point, so that whoever stands behind it is hidden by it
    const round = (b, c) => {
      if (b.shadow) { const g = P(b.q[0] + SHADOW[0] * b.shadow, b.q[1] + SHADOW[1] * b.shadow, b.q[2] - b.shadow); ctx.fillStyle = 'rgba(30,32,60,0.26)'; ctx.beginPath(); ctx.ellipse(g[0], g[1], b.round * ppm, b.round * ppm * 0.6, 0, 0, 6.3); ctx.fill(); }
      if (b.trunk) { const g = P(b.q[0], b.q[1], b.q[2] - b.trunk); ctx.strokeStyle = '#5a4634'; ctx.lineWidth = Math.max(1, ppm * 0.14); ctx.beginPath(); ctx.moveTo(g[0], g[1]); ctx.lineTo(c[0], c[1]); ctx.stroke(); }
      ctx.fillStyle = b.body; ctx.beginPath(); ctx.ellipse(c[0], c[1], b.round * ppm, b.round * ppm * (b.flat ? 0.6 : 0.9), 0, 0, 6.3); ctx.fill();
      if (b.top) { ctx.fillStyle = b.top; ctx.beginPath(); ctx.ellipse(c[0] - b.round * ppm * 0.22, c[1] - b.round * ppm * 0.25, b.round * ppm * 0.6, b.round * ppm * (b.flat ? 0.34 : 0.52), 0, 0, 6.3); ctx.fill(); }
    };
    const later = [];
    for (const b of this.props || []) {
      if (!b.round || ppm <= b.min) continue;
      const c = P(b.q[0], b.q[1], b.q[2]); if (!on(c)) continue;
      if (b.sort && ppm > 1.5) later.push([P(b.sort[0], b.sort[1], b.sort[2]), { draw: () => round(b, c) }]); else round(b, c);
    }
    for (const b of this.props || []) { if (!b.round && ppm > b.min && on(P(b.q[0], b.q[1], b.q[2]))) box(b.q, b.len, b.wid, b.hei, b.body, b.top, false, b.stripe || null); }   // tents, floats, cabins
    const mk = this.pal ? this.marketLevel() : 0;
    if (mk > 0 && !this.market && this.marketZone) this.buildMarket();
    if (mk > 0 && this.market && ppm > 0.7) {                              // market stalls: trestle table with goods under a coloured awning
      for (const st of this.market.stalls) {                                // (close up, drawn among the crowd round them: see `later`)
        if (st.k * 0.7 > mk) continue;
        const q = st.q, c = P(q[0], q[1], q[2]);
        if (!on(c)) continue;
        const stall = () => { box(q, 3.0, 1.3, 0.85, '#8a6a4a', st.goods, false, null); box([q[0], q[1], q[2] + 2.25, q[3], q[4]], 3.6, 2.6, 0.16, st.awn, st.awn, false, null); };
        if (ppm > 1.5) later.push([c, { draw: stall }]); else stall();
      }
    }
    // what extras.js draws over the painting under the people (the grandstand); then things that move among the people and
    // must be sorted with them (the parade floats: { e, n, h, draw(ctx, P, ppm) }), and the paraders [e, n, h, look, phase, ...]
    // (phase < 0: standing; else the walking cycle in radians)
    const dpr = ctx.getTransform().a || 1, sprites = ppm >= SPRITES, A = sprites ? this.atlas(ppm, dpr) : null;
    const sf = A ? ppm * A.f : 0, aw = A ? A.cw * sf : 0, ah = A ? A.ch * sf : 0, ax = A ? A.ax * sf : 0, ay = A ? A.ay * sf : 0;
    const sprite = this.sprite = A ? (x, y, look, pose) => ctx.drawImage(A.cv, pose * A.cw, look * A.ch, A.cw, A.ch, x - ax, y - ay, aw, ah) : null;
    const looks = this.looks, k = ppm * 0.7071 * 1.7;       // screen px per metre of height (people are drawn 1.7x life size)
    const specks = (xs, ls, n, seat) => {                   // from afar: a dab of the coat's colour and one of skin, batched by colour
      const nc = this.coatsUsed.length, bins = this._bins || (this._bins = Array.from({ length: nc }, () => []));
      for (const b of bins) b.length = 0;
      for (let i = 0; i < n; i++) bins[this.lookCoat[ls[i]]].push(i);
      const w = Math.max(2, Math.round(0.75 * ppm)), hb = Math.max(seat ? 2 : 3, Math.round((seat ? 0.8 : 1.3) * k)), hh = Math.max(1, Math.round(0.32 * k));
      bins.forEach((b, c) => { if (!b.length) return; ctx.fillStyle = this.coatsUsed[c]; ctx.beginPath(); for (const i of b) ctx.rect(Math.round(xs[i * 2] - w / 2), Math.round(xs[i * 2 + 1]) - hb, w, Math.ceil(hb * 0.8)); ctx.fill(); });
      if (ppm < 1.8) return;                                // heads only once there is room for them
      ctx.fillStyle = '#e2b48c'; ctx.beginPath();
      for (let i = 0; i < n; i++) ctx.rect(Math.round(xs[i * 2] - w * 0.4), Math.round(xs[i * 2 + 1]) - hb - Math.round(hh * 0.2), Math.max(1, Math.round(w * 0.8)), hh);
      ctx.fill();
    };
    this.specks = specks;
    for (const f of this.under || []) f(ctx, P, ppm, W, H, this);
    const C = ppm > 0.6 ? this.crowd : null, lv = this.crowdLv || [];
    const D = ppm > 0.6 ? this.paraders || [] : [], F = this.floats || [];
    const t0 = toScreen(0, 0), sc = toScreen(1, 0)[0] - t0[0];
    let lo = 0, hi = 0;
    if (C) {                                                // the stretch of the sorted crowd that is on screen
      const ya = (-12 - t0[1]) / sc, yb = (H + ah + 40 - t0[1]) / sc, find = v => { let a = 0, b = C.n; while (a < b) { const m = (a + b) >> 1; if (C.wy[m] < v) a = m + 1; else b = m; } return a; };
      lo = find(ya); hi = find(yb);
    }
    this.crowdN = C ? C.n : 0; let drawn = 0;
    if (!sprites) {                                         // from afar: floats first, then the specks of the crowd and the parade
      if (ppm > 0.5) for (const f of F) { const c = P(f.e, f.n, f.h); if (on(c)) f.draw(ctx, P, ppm, null); }
      const n = (C ? hi - lo : 0) + D.length / 6, xs = this._xs && this._xs.length >= n * 2 ? this._xs : (this._xs = new Float32Array(n * 2 + 512)), ls = this._ls && this._ls.length >= n ? this._ls : (this._ls = new Uint8Array(n + 256));
      let m = 0;
      for (let i = lo; i < hi; i++) {
        if (C.k[i] >= (lv[C.grp[i]] || 0) || C.pose[i] === 5) continue;
        const x = t0[0] + C.wx[i] * sc; if (x < -4 || x > W + 4) continue;
        xs[m * 2] = x; xs[m * 2 + 1] = t0[1] + C.wy[i] * sc; ls[m++] = C.look[i];
      }
      for (let i = 0; i < D.length; i += 6) { const c = P(D[i], D[i + 1], D[i + 2]); if (c[0] < -4 || c[1] < -4 || c[0] > W + 4 || c[1] > H + 20) continue; xs[m * 2] = c[0]; xs[m * 2 + 1] = c[1]; ls[m++] = D[i + 3]; }
      if (m) specks(xs, ls, m, false);
      drawn = m;
      // the seated ones (stands, terraces) a little shorter
      m = 0;
      for (let i = lo; i < hi; i++) {
        if (C.k[i] >= (lv[C.grp[i]] || 0) || C.pose[i] !== 5) continue;
        const x = t0[0] + C.wx[i] * sc; if (x < -4 || x > W + 4) continue;
        xs[m * 2] = x; xs[m * 2 + 1] = t0[1] + C.wy[i] * sc; ls[m++] = C.look[i];
      }
      if (m) specks(xs, ls, m, true);
      drawn += m;
    }
    if (ppm > 1.5) {                                        // people: shadow, legs, coat, head
      const draw = later;
      for (const f of this.guests || []) {                 // figures placed by the extras (schools, carnival, platforms...)
        const c = P(f.x, f.y, f.h);
        if (c[0] < -10 || c[1] < -10 || c[0] > W + 10 || c[1] > H + 30) continue;
        draw.push([c, f.o]);
      }
      if (sprites) {
        for (const f of F) { const c = P(f.e, f.n, f.h); if (on(c)) draw.push([c, f]); }
        for (let i = 0; i < D.length; i += 6) {
          const c = P(D[i], D[i + 1], D[i + 2]);
          if (c[0] < -10 || c[1] < -10 || c[0] > W + 10 || c[1] > H + 30) continue;
          const ph = D[i + 4];
          draw.push([c, { spr: D[i + 3], pose: ph < 0 ? 0 : 1 + (Math.floor(ph / 1.5708) & 3) }]);
        }
      }
      for (const p of this.people) {
        if (p.mk && p.mk > mk) continue;                     // market-goers are only there on market mornings
        const e = this.edges[p.e], q = this.at(e, p.dir === 1 ? p.s : e.len - p.s);
        if (!q[5]) continue;
        const tx = q[3] * p.dir, ty = q[4] * p.dir, off = p.lat * (e.c === 7 ? 1 : p.side);
        const c = P(q[0] + ty * off, q[1] - tx * off, q[2]);
        if (c[0] < -10 || c[1] < -10 || c[0] > W + 10 || c[1] > H + 30) continue;
        draw.push([c, p]);
      }
      for (const p of this.strollers) {
        if (this.squareClosed && p.sq.name === this.squareClosed) continue;   // the square is taken up by an event (extras.js)
        const c = P(p.x, p.y, p.h);
        if (c[0] < -10 || c[1] < -10 || c[0] > W + 10 || c[1] > H + 30) continue;
        draw.push([c, { still: !p.moving, pause: 0, child: p.child, h: p.hh, speed: p.speed, ph: p.ph, legs: p.legs, coat: p.coat, skin: p.skin, hair: p.hair }]);
      }
      // passengers: a few wait at the next stop, get on while the bus stands, others get off and walk away
      // (how many is made up: the timetable says when the bus calls, not who rides it)
      for (const b of this._buses || []) {
        const t = b.t, hsh = k => { const x = Math.sin((t.tm[0] * 7.13 + t.st[b.i] * 3.7 + k * 12.9898) * 43758.5453); return x - Math.floor(x); };
        const who = (k, x, y, h, moving) => {
          const c = P(x, y, h);
          if (c[0] < -10 || c[1] < -10 || c[0] > W + 10 || c[1] > H + 30) return;
          const r = hsh(k + 50);
          draw.push([c, { still: !moving, pause: 0, child: r > 0.92, h: 1.55 + r * 0.3, speed: 1.1, ph: r * 6.28, legs: r < 0.6 ? '#2f3540' : '#5b6477',
            coat: this.pal.COATS[Math.floor(hsh(k + 60) * this.pal.COATS.length)], skin: this.pal.SKIN[Math.floor(hsh(k + 70) * this.pal.SKIN.length)], hair: this.pal.HAIR[Math.floor(hsh(k + 80) * this.pal.HAIR.length)] }]);
        };
        // at the stop the bus is heading for
        const seg = t.legs[b.i], k = seg.p.length - 4, k0 = Math.max(0, k - 4);
        let dx = seg.p[k] - seg.p[k0], dy = seg.p[k + 1] - seg.p[k0 + 1]; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
        const w1 = this.busWait[t.st[b.i] + '>' + t.st[b.i + 1]];              // the mapped stop, when there is one
        if (!b.last && b.left < 150 && (w1 || seg.p[k + 3])) {
          const nw = Math.floor(hsh(1 + b.i) * 4), bx = w1 ? w1[0] : seg.p[k] + dy * 5.2, by = w1 ? w1[1] : seg.p[k + 1] - dx * 5.2;
          for (let j = 0; j < nw; j++) who(j + b.i * 10, bx - dx * (j * 1.1 - 1.5), by - dy * (j * 1.1 - 1.5), w1 ? w1[2] : seg.p[k + 2], false);
        }
        // at the stop it is standing at, or has just left
        if (b.i > 0 && b.el < b.dwell + 14 && seg.p[3]) {
          const p = seg.p, a0 = Math.min(4, p.length - 4);
          let ex = p[a0] - p[0], ey = p[a0 + 1] - p[1]; const elen = Math.hypot(ex, ey) || 1; ex /= elen; ey /= elen;
          const sx = p[0] + ey * 1.6, sy = p[1] - ex * 1.6;                      // where the bus stands
          const hs = k2 => { const x = Math.sin((t.tm[0] * 7.13 + t.st[b.i - 1] * 3.7 + k2 * 12.9898) * 43758.5453); return x - Math.floor(x); };
          const nb = Math.floor(hs(1 + b.i - 1) * 4);                            // the same people who were waiting
          for (let j = 0; j < nb; j++) {
            const g = b.el / Math.max(3, b.dwell * 0.8) - j * 0.12;
            if (g >= 1) continue;                                                // on board
            const w0 = this.busWait[t.st[b.i - 1] + '>' + t.st[b.i]];
            const wx = (w0 ? w0[0] : p[0] + ey * 5.2) - ex * (j * 1.1 - 1.5), wy = (w0 ? w0[1] : p[1] - ex * 5.2) - ey * (j * 1.1 - 1.5), f = Math.max(0, g);
            who(j + (b.i - 1) * 10, wx + (sx + ey * 1.4 - wx) * f, wy + (sy - ex * 1.4 - wy) * f, p[2], g > 0);
          }
          const no = Math.floor(hsh(9) * 4) + (b.last ? 2 : 0);
          for (let j = 0; j < no; j++) {
            const el = b.el - 1 - j * 1.4;
            if (el < 0 || el > 11) continue;
            const ang = (hsh(20 + j) - 0.5) * 1.6, d = 1.4 + el * 1.25, ca = Math.cos(ang), sa = Math.sin(ang);
            const ox = ey * ca - ex * sa * 0.9, oy = -ex * ca - ey * sa * 0.9;        // away from the kerb, fanning out
            who(100 + j, sx + ox * d, sy + oy * d, p[2], true);
          }
        }
      }
      for (const p of this.seated) {
        const c = P(p.e, p.n, p.h);
        if (c[0] < -10 || c[1] < -10 || c[0] > W + 10 || c[1] > H + 30) continue;
        draw.push([c, { still: true, pause: 0, child: false, h: 1.15, speed: 1, ph: 0, legs: '#3a3f4a', coat: p.coat, skin: p.skin, hair: p.hair }]);
      }
      draw.sort((a, b) => a[0][1] - b[0][1]);
      // the crowd's sprites are merged in by height on the screen, so that whoever stands in front is drawn last
      let ci = lo;
      const upTo = yl => {
        for (; ci < hi; ci++) {
          const y = t0[1] + C.wy[ci] * sc;
          if (y > yl) return;
          if (C.k[ci] >= (lv[C.grp[ci]] || 0)) continue;
          let x = t0[0] + C.wx[ci] * sc;
          if (x < -aw || x > W + aw) continue;
          if (C.pose[ci] === 0 && (ci & 3) === 0) x += Math.sin(this.t * 0.8 + ci) * 0.1 * ppm;   // shifting from foot to foot
          sprite(x, y, C.look[ci], C.pose[ci]); drawn++;
        }
      };
      for (const [c, p] of draw) {
        if (sprites && C) upTo(c[1]);
        if (p.draw) { p.draw(ctx, P, ppm, sprite); continue; }                    // a float
        if (p.spr !== undefined) { sprite(c[0], c[1], p.spr, p.pose); drawn++; continue; }
        const moving = !p.still && p.pause <= 0;
        person(ctx, c[0], c[1], p, k, ppm, moving ? Math.sin(this.t * 9 * p.speed + p.ph) : 0, this.wet, false);
      }
      if (sprites && C) upTo(Infinity);
    }
    this.crowdDrawn = drawn;
    if (ppm > 0.12) {
      for (const t of this.trains) {
        if (t.wait > 0 || t.gone) continue;
        for (let k = 0; k < t.wagons; k++) {
          const q = this.behind(t, 13 + k * 25.6);
          if (!q || !q[5] || !on(P(q[0], q[1], q[2]))) continue;
          let body = t.body, top = t.roof;
          if (t.freight) { const pal = ['#8a5a3c', '#5f6d7a', '#9a3a2e', '#6c6f58', '#3f5f8a', '#b9b3a6']; body = pal[Math.floor((t.seed * 97 + k * 7.3) % pal.length)]; top = shade(body, 0.78); if (k === 0) { body = '#b3261e'; top = '#7d1b16'; } }
          box(q, 24.4, 2.9, t.freight && k ? 3.0 : 3.9, body, top, false, t.freight ? null : t.stripe);
          const c = P(q[0], q[1], q[2] + 2);
          hot.push({ x: c[0], y: c[1], r: Math.max(7, 9 * ppm), info: () => {
            const s = t.sched;
            if (!s) return { kind: 'train', title: say(t.freight ? 'train.freight' : 'train.title'), to: '', sub: t.freight ? say('train.gotthard') : '' };
            const L = t.late || 0, lt = L ? ' · ' + say('train.planned', { time: hm(s.dep / 60) }) + ' · +' + Math.round(L / 60) + '′' : '';   // live delay
            const pl = s.plat ? ' · ' + say(s.plat0 && s.plat !== s.plat0 ? 'train.plat.moved' : 'train.plat', { p: s.plat, p0: s.plat0 }) : '';
            if (s.off) return { kind: 'train', title: s.line, to: s.to, sub: say('train.off') + pl };
            const dep = hm((s.dep + L) / 60);
            if (s.end) return { kind: 'train', title: s.line, to: s.to, sub: say(t.dwell > 0 ? 'train.end.in' : 'train.end.arr', { time: dep }) + lt + pl };
            return { kind: 'train', title: s.line, to: s.to, sub: (t.dwell > 0 ? say('train.dwell', { time: dep }) : t.since != null ? say('train.left', { time: dep }) : s.arr != null && s.arr !== s.dep ? say('train.arrdep', { arr: hm((s.arr + L) / 60), time: dep }) : say('train.coming', { time: dep })) + lt + pl };
          } });
        }
      }
    }
    if (ppm > 0.1) {
      const sc = Math.max(1, Math.min(3.2, ppm * 1.6));
      ctx.lineCap = 'round';
      for (const f of this.flocks) {
        const c = toScreen(f.x, f.y);
        if (c[0] < -300 || c[1] < -300 || c[0] > W + 300 || c[1] > H + 300) continue;
        const ang = Math.atan2(f.vy, f.vx), ca = Math.cos(ang), sa = Math.sin(ang);
        for (const b of f.birds) {
          const p = toScreen(f.x + b.ox + Math.sin(this.t * 0.7 + b.ph) * 14, f.y + b.oy + Math.cos(this.t * 0.5 + b.ph) * 9);
          const flap = Math.sin(this.t * b.sp + b.ph), w = 3.4 * sc, lift = flap * 1.5 * sc;
          const wing = (ox, oy, col, lw) => {
            ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath();
            ctx.moveTo(p[0] + ox - sa * w - ca * lift * 0.4, p[1] + oy + ca * w * 0.6 - lift);
            ctx.lineTo(p[0] + ox + ca * 1.2 * sc, p[1] + oy + sa * 1.2 * sc);
            ctx.lineTo(p[0] + ox + sa * w - ca * lift * 0.4, p[1] + oy - ca * w * 0.6 - lift);
            ctx.stroke();
          };
          wing(26 * ppm + 8, 30 * ppm + 10, 'rgba(20,24,50,0.22)', 1.3 * sc);
          wing(0, 0, 'rgba(250,250,252,0.95)', 1.15 * sc);
        }
      }
    }
  }
}

// other views are lit from another side: the shadows of the moving things follow
export function setSun(azDeg) { const a = azDeg * Math.PI / 180; SHADOW = [-Math.sin(a) * 1.28, -Math.cos(a) * 1.28]; }
