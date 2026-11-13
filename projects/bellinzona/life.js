// Animated layer drawn over the tiles: cars and buses on the road graph, trains on the rails,
// swallows above the roofs. Everything lives in ENU metres and is projected with the map's enu2px matrix.

const DENSITY = [3.2, 2.4, 1.8, 1.3, 0.42, 0.07];          // vehicles per unit length, by road class
const SPEED = [26, 12.5, 11, 10, 7.5, 4.5];                 // m/s
const CAR_COLORS = ['#ececec', '#f4f4f2', '#bfc3c9', '#3d3f45', '#25272c', '#a92a28', '#2a548f', '#e7bf2e', '#7b8791', '#d6d6da', '#5d7f68'];
const BUS_COLORS = ['#f2c21a', '#e8e8ea', '#d24a2c'];        // postal yellow among them
let SHADOW = [0.94 * 1.28, 0.34 * 1.28];                  // ground offset of a shadow per metre of height (sun from WSW, 38 deg)

function rng(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(v * k))));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
};

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

  // traffic lights: real positions (OpenStreetMap), assumed timing - two phases of 30 s green, 3 s amber, 3 s all red
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
  // seconds since midnight on the station clock (Europe/Zurich), whatever the visitor's own time zone
  clock() {
    const now = Date.now() + (this.shiftMs || 0);            // shiftMs: look at another moment (testing, ?quando=)
    if (!this._ck || now - this._ck.at > 30000) {
      const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(now));
      const g = k => +p.find(x => x.type === k).value;
      this._ck = { at: now, s: g('hour') * 3600 + g('minute') * 60 + g('second') };
    }
    return this._ck.s + (now - this._ck.at) / 1000 + (this.clockOffset || 0);
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
          if (d < 30 && (!hit || d < hit.d)) hit = { d, dist: run + x };
        }
        run += ce.len;
        cur = this.next(cur, true);
      }
      if (!hit || hit.dist < 400) continue;
      const side = p0[1] > st[1] ? 'N' : 'S';              // the end of the map this entry is on
      if (!best[side] || hit.d < best[side].d) best[side] = { e: ei, dir, d: hit.d, dist: hit.dist };
    }
    this.entry = best;
    this.tt = tt;
    this.ttDone = new Set();
    this.trains = this.trains.filter(t => t.freight);       // passenger trains now run to the timetable
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
    const stalls = [], put = (x, y, h, dx, dy) => {
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
    // shoppers: three or four to a stall, plus people streaming through the market streets
    const P = this.pal, pick = a => a[Math.floor(r() * a.length)];
    const folk = [];
    for (const s of stalls) {
      const [x, y, h, dx, dy] = s.q, nx = dy * s.side, ny = -dx * s.side;
      folk.push({ x: x - nx * 1.3, y: y - ny * 1.3, h, k: s.k, coat: '#e8e4da', skin: pick(P.SKIN), hair: pick(P.HAIR), hh: 1.7 });       // the stallholder
      const n = 2 + Math.floor(r() * 3);
      for (let j = 0; j < n; j++) folk.push({ x: x + nx * (1.5 + r() * 1.2) + dx * (r() - 0.5) * 3.4, y: y + ny * (1.5 + r() * 1.2) + dy * (r() - 0.5) * 3.4, h, k: Math.min(1, s.k * 0.6 + 0.35 + r() * 0.3),
        coat: pick(P.COATS), skin: pick(P.SKIN), hair: pick(P.HAIR), hh: 1.5 + r() * 0.35, child: r() < 0.1 });
    }
    const len = zone.reduce((a, i) => a + this.edges[i].len, 0);
    for (let k = 0; k < Math.min(260, len / 2.2) && zone.length; k++) {
      const ei = zone[Math.floor(r() * zone.length)], e = this.edges[ei];
      (this.allPeople || this.people).push({ rank: 0, e: ei, dir: r() < 0.5 ? 1 : -1, s: r() * e.len, speed: 0.6 + r() * 0.5, still: false, pause: r() < 0.4 ? r() * 20 : 0, side: 1, lat: (r() - 0.5) * (e.w - 1),
        coat: pick(P.COATS), legs: r() < 0.6 ? '#2f3540' : '#5b6477', skin: pick(P.SKIN), hair: pick(P.HAIR), h: 1.55 + r() * 0.3, ph: r() * 6.28, child: r() < 0.1, mk: 0.3 + r() * 0.7 });
    }
    this.market = { stalls, folk };
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
    this.busTrips = b.trips.map(([line, to, s]) => {
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
      return { line, to, st, tm, legs };
    }).filter(Boolean);
    this.busStops = b.stops;
    this.busWait = b.wait || {};                            // real stop positions (OpenStreetMap) to wait at, per leg
    this.shelters = b.shelters || [];
    this.cars = this.cars.filter(v => !v.bus);              // no more made-up buses
    if (this.allCars) this.allCars = this.allCars.filter(v => !v.bus);
  }

  // where every bus of the timetable is right now
  busesNow() {
    if (!this.busTrips) return [];
    const out = [], now = this.clock() / 60;
    for (const t of this.busTrips) {
      const n = t.tm.length;
      let m = now;
      if (m < t.tm[0] && m + 1440 <= t.tm[n - 1]) m += 1440;  // journeys running past midnight
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
      out.push({ q, t, i, el: (m - t.tm[i]) * 60, dwell, left: (t.tm[i + 1] - m) * 60, last: i + 1 === n - 1, next: t.st[i + 1], eta: t.tm[i + 1], stopped: f === 0, red: s < f * seg.len - 4 });
    }
    return out;
  }

  // what is under the pointer: a train or a bus drawn in the last frame
  pick(x, y) {
    let best = null, bd = 1e9;
    for (const h of this.hot || []) { const d = Math.hypot(h.x - x, h.y - y) - h.r; if (d < 6 && d < bd) { bd = d; best = h; } }
    return best && best.info();
  }

  // the next real departures, for the board
  departures(n = 6) {
    if (!this.tt) return [];
    const m = this.clock() / 60;
    const later = this.tt.dep.filter(d => d[0] >= m - 0.5);
    return later.concat(this.tt.dep.map(d => [d[0] + 1440, ...d.slice(1)])).slice(0, n);
  }

  schedule() {
    const now = this.clock();
    for (let i = 0; i < this.tt.dep.length; i++) {
      const d = this.tt.dep[i], dep = d[0] * 60;
      const from = d[4] === 'N' ? (this.entry.S || this.entry.N) : (this.entry.N || this.entry.S);   // northbound trains come in from the south
      if (!from) return;
      const fast = !d[1].startsWith('S');
      const wagons = fast ? 9 : 6, speed = fast ? 21 : 17;
      const lead = (from.dist + wagons * 12.8) / speed + 28 + 50;      // run in, brake, stand about 50 s
      let late = now - (dep - lead);
      if (late < -43200) late += 86400;
      const key = i + ':' + Math.floor((now - late) / 86400 + 0.5);
      if (late < 0 || late > 30 || this.ttDone.has(key)) continue;
      this.ttDone.add(key);
      this.trains.push({ body: '#f3f3f1', roof: fast ? '#3a3d44' : '#c9ccd1', stripe: '#d0242b', wagons, speed, path: [{ e: from.e, dir: from.dir }], s: 0, seed: this.rand(), wait: 0, sched: { dep, line: d[1], to: d[2], plat: d[3] } });
    }
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
  behind(t, d) {
    let i = t.path.length - 1, along = t.s;
    while (d > along) {
      d -= along;
      if (--i < 0) return null;
      along = this.edges[t.path[i].e].len;
    }
    const seg = t.path[i], e = this.edges[seg.e], tt = along - d;
    const q = this.at(e, seg.dir === 1 ? tt : e.len - tt);
    q[3] *= seg.dir; q[4] *= seg.dir;
    return q;
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
    if (this.tt) { this.schedule(); if (this.trains.some(t => t.gone)) this.trains = this.trains.filter(t => !t.gone); }
    for (const t of this.trains) {
      if (t.gone) continue;
      if (t.wait > 0) { t.wait -= dt; if (t.wait <= 0) this.placeTrain(t, false); continue; }
      const head = t.path[t.path.length - 1], e = this.edges[head.e];
      // passenger trains call at the station: brake on approach, dwell with the middle of the train at the platform, leave
      let v = t.speed;
      if (!t.freight && this.live.stations.length) {
        const mid = this.behind(t, t.wagons * 12.8);
        if (mid) {
          const st = this.live.stations[0], d = Math.hypot(mid[0] - st[0], mid[1] - st[1]);
          if (t.dwell > 0) {
            t.dwell -= dt; v = 0;
            if (t.sched) { let left = t.sched.dep - this.clock(); if (left < -43200) left += 86400; if (left > 0 && left < 600) t.dwell = Math.max(t.dwell, left); }   // leave on the minute
            if (t.dwell <= 0) t.called = this.t;
          }
          else if (d < 45 && !(this.t - (t.called ?? -1e9) < 90)) t.dwell = t.sched ? 20 : 18 + this.rand() * 14;
          else if (d < 260 && !(this.t - (t.called ?? -1e9) < 90)) v *= Math.max(0.22, d / 260);
        }
      }
      t.s += v * dt;
      if (t.s >= e.len) {
        const o = this.next({ e: head.e, dir: head.dir }, true);
        if (o) { t.s -= e.len; t.path.push(o); if (t.path.length > 60) t.path.shift(); }
        else if (t.sched) t.gone = true;                    // a timetabled train has left the map
        else { t.s = e.len; t.wait = 6 + this.rand() * 14; }
      }
    }
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
    const hot = this.hot = [];
    const hm = m => String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(Math.floor(m) % 60).padStart(2, '0');

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
      hot.push({ x: b[0], y: b[1] - k, r: 9, info: () => ({ kind: 'sig', title: 'Semaforo · ' + ['verde', 'giallo', 'rosso'][st], sub: 'Posizione da OpenStreetMap; i tempi delle fasi sono ipotizzati' }) });
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
        hot.push({ x: c[0], y: c[1], r: Math.max(7, 6 * ppm), info: () => ({ kind: 'bus', title: 'Bus ' + b.t.line, to: b.t.to,
          sub: (b.stopped ? 'In fermata · prossima: ' : 'Prossima fermata: ') + this.busStops[b.next] + ' ' + hm(b.eta) }) });
      }
    }
    for (const b of this.props || []) {
      if (!b.round || ppm <= b.min) continue;
      const c = P(b.q[0], b.q[1], b.q[2]); if (!on(c)) continue;
      if (b.shadow) { const g = P(b.q[0] + SHADOW[0] * b.shadow, b.q[1] + SHADOW[1] * b.shadow, b.q[2] - b.shadow); ctx.fillStyle = 'rgba(30,32,60,0.26)'; ctx.beginPath(); ctx.ellipse(g[0], g[1], b.round * ppm, b.round * ppm * 0.6, 0, 0, 6.3); ctx.fill(); }
      if (b.trunk) { const g = P(b.q[0], b.q[1], b.q[2] - b.trunk); ctx.strokeStyle = '#5a4634'; ctx.lineWidth = Math.max(1, ppm * 0.14); ctx.beginPath(); ctx.moveTo(g[0], g[1]); ctx.lineTo(c[0], c[1]); ctx.stroke(); }
      ctx.fillStyle = b.body; ctx.beginPath(); ctx.ellipse(c[0], c[1], b.round * ppm, b.round * ppm * (b.flat ? 0.6 : 0.9), 0, 0, 6.3); ctx.fill();
      if (b.top) { ctx.fillStyle = b.top; ctx.beginPath(); ctx.ellipse(c[0] - b.round * ppm * 0.22, c[1] - b.round * ppm * 0.25, b.round * ppm * 0.6, b.round * ppm * (b.flat ? 0.34 : 0.52), 0, 0, 6.3); ctx.fill(); }
    }
    for (const b of this.props || []) { if (!b.round && ppm > b.min && on(P(b.q[0], b.q[1], b.q[2]))) box(b.q, b.len, b.wid, b.hei, b.body, b.top, false, b.stripe || null); }   // tents, floats, cabins
    const mk = this.pal ? this.marketLevel() : 0;
    if (mk > 0 && !this.market && this.marketZone) this.buildMarket();
    if (mk > 0 && this.market && ppm > 0.7) {                              // market stalls: trestle table with goods under a coloured awning
      for (const st of this.market.stalls) {
        if (st.k * 0.7 > mk) continue;
        const q = st.q;
        if (!on(P(q[0], q[1], q[2]))) continue;
        box(q, 3.0, 1.3, 0.85, '#8a6a4a', st.goods, false, null);
        box([q[0], q[1], q[2] + 2.25, q[3], q[4]], 3.6, 2.6, 0.16, st.awn, st.awn, false, null);
      }
    }
    if (ppm > 1.5) {                                        // people: shadow, legs, coat, head
      const k = ppm * 0.7071 * 1.7;                         // screen px per metre of height; drawn 1.7x life size so they read
      const draw = [];
      for (const f of this.guests || []) {                 // figures placed by the extras (schools, carnival, platforms...)
        const c = P(f.x, f.y, f.h);
        if (c[0] < -10 || c[1] < -10 || c[0] > W + 10 || c[1] > H + 30) continue;
        draw.push([c, f.o]);
      }
      for (const f of mk && this.market ? this.market.folk : []) {
        if (f.k > mk) continue;
        const c = P(f.x, f.y, f.h);
        if (c[0] < -10 || c[1] < -10 || c[0] > W + 10 || c[1] > H + 30) continue;
        draw.push([c, { still: true, pause: 0, child: !!f.child, h: f.hh, speed: 1, ph: 0, legs: '#3a3f4a', coat: f.coat, skin: f.skin, hair: f.hair }]);
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
      for (const [c, p] of draw) {
        const moving = !p.still && p.pause <= 0, hgt = (p.child ? 1.15 : p.h) * k, wd = Math.max(1.4, (p.child ? 0.36 : 0.46) * ppm * 1.7);
        const sw = moving ? Math.sin(this.t * 9 * p.speed + p.ph) : 0, bob = moving ? Math.abs(sw) * 0.04 * k : 0;
        const x = c[0], y = c[1] - bob;
        ctx.fillStyle = 'rgba(25,28,55,0.30)';
        ctx.beginPath(); ctx.ellipse(x + hgt * 0.42, y - hgt * 0.10, hgt * 0.50, wd * 0.42, -0.35, 0, 6.2832); ctx.fill();
        ctx.fillStyle = p.legs;
        const lw = wd * 0.42, lh = hgt * 0.46;
        ctx.fillRect(x - wd * 0.46 + sw * wd * 0.22, y - lh, lw, lh);
        ctx.fillRect(x + wd * 0.04 - sw * wd * 0.22, y - lh, lw, lh);
        ctx.fillStyle = p.coat;
        ctx.beginPath(); ctx.roundRect(x - wd / 2, y - hgt * 0.82, wd, hgt * 0.42, wd * 0.3); ctx.fill();
        ctx.fillStyle = p.skin;
        const hr = Math.max(0.9, hgt * 0.105);
        ctx.beginPath(); ctx.arc(x, y - hgt * 0.90, hr, 0, 6.2832); ctx.fill();
        ctx.fillStyle = p.hair;
        ctx.beginPath(); ctx.arc(x, y - hgt * 0.925, hr * 0.92, 3.3, 6.12); ctx.fill();
        if (this.wet && !p.child && p.ph % 1 < 0.7) {         // umbrellas when it rains or snows
          ctx.fillStyle = p.coat; ctx.beginPath(); ctx.ellipse(x, y - hgt * 1.08, wd * 1.35, wd * 0.62, 0, 3.1416, 6.2832); ctx.fill();
          ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x - 0.4, y - hgt * 1.08, 0.8, hgt * 0.3);
        }
      }
    }
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
          hot.push({ x: c[0], y: c[1], r: Math.max(7, 9 * ppm), info: () => t.sched
            ? { kind: 'train', title: t.sched.line, to: t.sched.to, sub: (t.dwell > 0 ? 'In stazione · parte alle ' : t.called ? 'Partito alle ' : 'In arrivo · parte alle ') + hm(t.sched.dep / 60) + (t.sched.plat ? ' · binario ' + t.sched.plat : '') }
            : { kind: 'train', title: t.freight ? 'Treno merci' : 'Treno', to: '', sub: t.freight ? 'In transito sulla linea del San Gottardo' : '' } });
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
