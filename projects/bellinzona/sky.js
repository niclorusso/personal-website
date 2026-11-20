// Day / dusk / night atmosphere drawn over the daylight tiles with canvas compositing.
// By day it draws nothing. At dusk the frame is graded warm; at night it is multiplied by a low-resolution
// light map (deep blue ambient + additive street-lamp pools), so lit streets keep their painted colours.
// Lamp positions come from roads.json (loaded lazily, the first time lamps are needed).

import { t, locale } from './i18n.js?v=20261121d';

const LAT = 46.19, LON = 9.02, TZ = 'Europe/Zurich';
const KEY = 'bellinzona.sky.mode';
const MODES = ['auto', 'day', 'dusk', 'night'].map(m => [m, t('sky.' + m)]);

// ambient multiply colour (r, g, b), warm soft-light grade, lamp intensity
const DAY = [255, 255, 255, 0, 0], DUSK = [255, 204, 168, 1, 0.4], NIGHT = [56, 70, 128, 0, 1];

const LM = 2;                       // light map resolution: 1 texel = LM css px
const GLOW = 24;                    // far-zoom city glow: 1 texel = GLOW world px
const CELL = 1024;                  // lamp grid cell, world px
const ISO = Math.SQRT1_2;           // a ground circle is this much flatter on screen (45 deg pitch)
const POOL = [17, 13, 9.5];         // light pool radius in metres: street, service road, footpath
const HEAD = [7, 5.5, 4];           // lamp head height in metres

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// solar elevation and azimuth (clockwise from north) in degrees (low-precision almanac formulae, good to a fraction of a degree)
export function sunPosition(ms, lat = LAT, lon = LON) {
  const R = Math.PI / 180, d = ms / 86400000 - 10957.5;               // days since J2000
  const g = (357.529 + 0.98560028 * d) * R;
  const L = (280.459 + 0.98564736 * d + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * R;
  const e = (23.439 - 3.6e-7 * d) * R;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)), dec = Math.asin(Math.sin(e) * Math.sin(L));
  const ha = ((18.697374558 + 24.06570982441908 * d) * 15 + lon) * R - ra;
  const el = Math.asin(Math.sin(lat * R) * Math.sin(dec) + Math.cos(lat * R) * Math.cos(dec) * Math.cos(ha)) / R;
  const az = Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(lat * R) - Math.sin(lat * R) * Math.cos(ha)) / R;
  return { el, az: (az + 360) % 360 };
}
export const sunElevation = (ms, lat, lon) => sunPosition(ms, lat, lon).el;

// the live weather's look (extras.js sets sky.wx from the measurements; all zero when there are none):
// over: overcast by day, a flatter, greyer light · clear: north foehn, crisper air · mist: haze lying on the valley floor
const MIST_FULL = 250, MIST_TOP = 300;   // m a.s.l.: the floor of the valley at Bellinzona is at 225-245 m (the Ticino at the gauge ~227 m); thinning out to nothing by 300 m, so the hills and the castles' heights stay clear

function stateFor(el) {
  const d = smooth(-1, 7, el), n = smooth(-1, -7, el), k = (1 - d) * (1 - n);
  return DAY.map((v, i) => v * d + DUSK[i] * k + NIGHT[i] * n);
}

function sprite(size, stops) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d'), r = size / 2, gr = g.createRadialGradient(r, r, 0, r, r, r);
  for (const [t, col] of stops) gr.addColorStop(t, col);
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  return c;
}

const CSS = `
#sky { position: fixed; left: 16px; bottom: calc(14px + env(safe-area-inset-bottom, 0px)); display: flex; gap: 2px; padding: 3px;
  background: #1b1d22cc; border-radius: 18px; box-shadow: 0 2px 10px #0006; -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
  font: 500 12px/1 ui-sans-serif, system-ui, sans-serif; user-select: none; -webkit-user-select: none; opacity: .86; transition: opacity .2s; }
#sky:hover, #sky:focus-within { opacity: 1; }
#sky button { height: 30px; padding: 0 11px; border: 0; border-radius: 15px; background: transparent; color: #ffffffb8; font: inherit;
  letter-spacing: .02em; cursor: pointer; touch-action: manipulation; }
#sky button:hover { color: #fff; }
#sky button[aria-pressed="true"] { background: #ffffff26; color: #fff; }
#sky button:focus-visible { outline: 2px solid #ffffff99; outline-offset: -2px; }
@media (max-width: 360px) { #sky { left: 8px; } #sky button { padding: 0 8px; } }
`;

export class Sky {
  // world: world.json; requestDraw: asks the viewer for another frame
  constructor(world, requestDraw) {
    this.world = world;
    this.M = world.enu2px;
    this.requestDraw = requestDraw || (() => {});
    this.clock = () => Date.now();                       // replaceable, for testing
    this.mode = 'auto';
    try { const m = localStorage.getItem(KEY); if (MODES.some(o => o[0] === m)) this.mode = m; } catch {}
    this.target = this.pick();
    this.cur = this.target.slice();                      // no fade on load
    this.autoAt = this.last = performance.now();
    this.lamps = null; this.loading = false;
    this.lm = null; this.grade = null;
    this.buf = new Float32Array(3 * 4096); this.cbuf = new Float32Array(5 * 512);
    this.carsOk = true;
    this.wx = { over: 0, clear: 0, mist: 0 }; this.wxc = { over: 0, clear: 0, mist: 0 }; this.mist = null;
    this.ui();
    // in automatic mode the light changes on its own even when nothing else asks for a frame
    setInterval(() => { if (this.mode === 'auto' && !document.hidden) { this.retarget(); if (!this.settled()) this.requestDraw(); } }, 30000);
  }

  pick() { return this.mode === 'day' ? DAY : this.mode === 'dusk' ? DUSK : this.mode === 'night' ? NIGHT : stateFor(sunElevation(this.clock())); }
  retarget() { this.target = this.pick(); this.autoAt = performance.now(); this.hint(); }

  // sunrise and sunset of the day shown (the time machine's day too), as a hint on the automatic button
  hint() {
    const b = this.el && this.el.firstChild, t0 = this.clock();
    if (!b) return;
    try {
      const fmt = new Intl.DateTimeFormat(locale, { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
      const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(t0), g = k => +p.find(x => x.type === k).value;
      const noon = Date.UTC(g('year'), g('month') - 1, g('day'), 12) - LON * 240000;   // solar noon of the day in Bellinzona
      if (noon === this.hintNoon && (Math.abs(t0 - Date.now()) < 2700000) === this.hintLive) return;
      this.hintNoon = noon; this.hintLive = Math.abs(t0 - Date.now()) < 2700000;
      const cross = dir => { let t = noon; while (Math.abs(t - noon) < 43200000 && sunElevation(t) > -0.833) t += dir * 60000; return fmt.format(t); };
      b.title = t(this.hintLive ? 'sky.hint.live' : 'sky.hint.tm', { rise: cross(-1), set: cross(1) });
    } catch {}
  }
  settled() { for (let i = 0; i < 5; i++) if (this.cur[i] !== this.target[i]) return false; return true; }

  setMode(m) {
    if (!MODES.some(o => o[0] === m)) return;
    this.mode = m;
    try { localStorage.setItem(KEY, m); } catch {}
    for (const b of this.el.children) b.setAttribute('aria-pressed', b.dataset.m === m);
    this.retarget();
    this.last = performance.now();
    this.requestDraw();
  }

  ui() {
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    const el = this.el = document.createElement('div');
    el.id = 'sky'; el.setAttribute('role', 'group'); el.setAttribute('aria-label', t('sky.aria'));
    for (const [m, label] of MODES) {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.m = m; b.textContent = label; b.setAttribute('aria-pressed', m === this.mode);
      b.onclick = () => this.setMode(m);
      el.appendChild(b);
    }
    this.hint();
    document.body.appendChild(el);
    const place = () => {                                  // sit above the credits strip when it reaches the left edge (phones)
      const cr = document.getElementById('credits'), r = cr && cr.getBoundingClientRect();
      el.style.bottom = r && r.height && r.left < 24 + el.offsetWidth ? (r.height + 10) + 'px' : '';
    };
    place(); window.addEventListener('resize', place); setTimeout(place, 600);
  }

  // street lamps along visible roads, bucketed in a grid of world-pixel cells; plus a small glow map for far zooms
  async load() {
    if (this.loading) return;
    this.loading = true;
    const edges = window.__life && window.__life.edges;
    if (!edges) { this.loading = false; return; }         // the roads come with the simulation (index.html): asked again on a later frame
    const M = this.M, pts = [], seen = new Set();
    edges.forEach((e, ei) => {
      if (!(e.c >= 1 && e.c <= 5) && e.c !== 7) return;
      const foot = e.c === 7, type = foot ? 2 : e.c === 5 ? 1 : 0;
      if (foot && !(e.d >= 1)) return;                     // squares, pavements, steps and cycle paths; not the hiking trails
      const step = foot ? (e.d >= 6 ? 10 : e.d >= 2 ? 16 : 22) : e.c === 5 ? 34 : 28, cell = step * 0.42, p = e.p, n = p.length / 4;
      const off = foot ? 0 : e.w / 2 + 0.6;
      let next = step / 2, run = 0, k = ei;
      for (let i = 1; i < n; i++) {
        const a = (i - 1) * 4, b = i * 4, de = p[b] - p[a], dn = p[b + 1] - p[a + 1], len = Math.hypot(de, dn);
        while (len > 0 && next <= run + len) {
          const f = (next - run) / len, side = k++ & 1 ? 1 : -1;
          next += step;
          if (!p[a + 3] || !p[b + 3]) continue;
          const x = p[a] + de * f + dn / len * off * side, y = p[a + 1] + dn * f - de / len * off * side, h = p[a + 2] + (p[b + 2] - p[a + 2]) * f;
          const key = Math.floor(x / cell) + ':' + Math.floor(y / cell) + ':' + (foot ? 1 : 0);
          if (seen.has(key)) continue;                     // junctions and parallel carriageways: no clumps
          seen.add(key);
          pts.push(M[0][0] * x + M[0][1] * y + M[0][2] * h, M[1][0] * x + M[1][1] * y + M[1][2] * h, type);
        }
        run += len;
      }
    });
    const N = pts.length / 3;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < N; i++) { x0 = Math.min(x0, pts[i * 3]); x1 = Math.max(x1, pts[i * 3]); y0 = Math.min(y0, pts[i * 3 + 1]); y1 = Math.max(y1, pts[i * 3 + 1]); }
    if (!N) { x0 = y0 = 0; x1 = y1 = 1; }
    const gx = Math.floor(x0 / CELL), gy = Math.floor(y0 / CELL), gw = Math.floor(x1 / CELL) - gx + 1, gh = Math.floor(y1 / CELL) - gy + 1;
    const start = new Uint32Array(gw * gh + 1), cellOf = new Uint32Array(N);
    for (let i = 0; i < N; i++) { const c = cellOf[i] = (Math.floor(pts[i * 3 + 1] / CELL) - gy) * gw + Math.floor(pts[i * 3] / CELL) - gx; start[c + 1]++; }
    for (let c = 0; c < gw * gh; c++) start[c + 1] += start[c];
    const fill = start.slice(), X = new Float32Array(N), Y = new Float32Array(N), T = new Uint8Array(N);
    for (let i = 0; i < N; i++) { const j = fill[cellOf[i]]++; X[j] = pts[i * 3]; Y[j] = pts[i * 3 + 1]; T[j] = pts[i * 3 + 2]; }

    // far-zoom glow: every lamp as a soft dot in a small canvas covering the lit area
    const pad = 40 * GLOW, glow = document.createElement('canvas');
    glow.width = Math.ceil((x1 - x0 + 2 * pad) / GLOW); glow.height = Math.ceil((y1 - y0 + 2 * pad) / GLOW);
    const g = glow.getContext('2d'), dot = sprite(32, [[0, 'rgba(255,186,110,0.5)'], [0.35, 'rgba(255,170,90,0.2)'], [1, 'rgba(255,160,80,0)']]);
    g.globalCompositeOperation = 'lighter';
    const mpw = this.world.mpp;                            // metres per world px
    for (let i = 0; i < N; i++) {
      const r = (T[i] === 2 ? 20 : 30) / mpw / GLOW;
      g.drawImage(dot, (X[i] - x0 + pad) / GLOW - r, (Y[i] - y0 + pad) / GLOW - r * ISO, 2 * r, 2 * r * ISO);
    }
    this.sp = [
      sprite(64, [[0, 'rgba(215,160,88,1)'], [0.3, 'rgba(210,150,80,0.62)'], [0.65, 'rgba(200,140,70,0.17)'], [1, 'rgba(200,140,70,0)']]),
      sprite(64, [[0, 'rgba(200,150,84,0.9)'], [0.3, 'rgba(200,146,80,0.5)'], [0.65, 'rgba(196,140,70,0.14)'], [1, 'rgba(196,140,70,0)']]),
      sprite(64, [[0, 'rgba(225,150,66,1)'], [0.3, 'rgba(222,140,60,0.6)'], [0.65, 'rgba(215,130,50,0.16)'], [1, 'rgba(215,130,50,0)']]),
    ];
    this.core = sprite(48, [[0, 'rgba(255,246,222,1)'], [0.1, 'rgba(255,226,160,0.95)'], [0.28, 'rgba(255,176,84,0.3)'], [0.6, 'rgba(255,150,60,0.07)'], [1, 'rgba(255,140,50,0)']]);
    this.beam = sprite(48, [[0, 'rgba(190,196,200,0.95)'], [0.4, 'rgba(180,186,190,0.4)'], [1, 'rgba(170,180,190,0)']]);
    this.white = sprite(24, [[0, 'rgba(255,255,244,1)'], [0.25, 'rgba(255,248,214,0.8)'], [0.6, 'rgba(255,236,180,0.14)'], [1, 'rgba(255,230,170,0)']]);
    this.red = sprite(24, [[0, 'rgba(255,70,50,1)'], [0.3, 'rgba(255,40,30,0.6)'], [1, 'rgba(255,30,20,0)']]);
    this.lamps = { N, X, Y, T, start, gx, gy, gw, gh, glow, ox: x0 - pad, oy: y0 - pad };
    this.requestDraw();
  }

  // call once per frame after everything else is on the canvas; the context is in css pixels
  draw(ctx, vx, vy, s, W, H) {
    const now = performance.now();
    if (!this.drawn) { this.drawn = true; this.retarget(); this.cur = this.target.slice(); }   // the viewer may have set the clock after construction (?quando=): no fade from today's light
    const cur = this.cur;
    if (this.mode === 'auto' && now - this.autoAt > 5000) this.retarget();
    if (!this.settled()) {
      const k = 1 - Math.exp(-Math.min(0.1, (now - this.last) / 1000) / 0.8);
      let done = true;
      for (let i = 0; i < 5; i++) {
        cur[i] += (this.target[i] - cur[i]) * k;
        if (Math.abs(this.target[i] - cur[i]) < (i < 3 ? 0.6 : 0.004)) cur[i] = this.target[i]; else done = false;
      }
      if (!done) this.requestDraw();
    }
    const kw = 1 - Math.exp(-Math.min(0.1, (now - this.last) / 1000) / 2.5), wc = this.wxc;   // live weather: eased in and out over a few seconds
    let wet = false;
    for (const k in wc) {
      const t = Math.max(0, Math.min(1, +(this.wx && this.wx[k]) || 0));
      wc[k] += (t - wc[k]) * kw; if (Math.abs(t - wc[k]) < 0.004) wc[k] = t; else this.requestDraw();
      if (wc[k] > 0.004) wet = true;
    }
    this.last = now;
    if (wet) this.weather(ctx, vx, vy, s, W, H);
    if (cur[0] === 255 && cur[1] === 255 && cur[2] === 255 && cur[3] === 0 && cur[4] === 0) return;      // plain day: nothing to do

    const amb = `rgb(${cur[0] | 0},${cur[1] | 0},${cur[2] | 0})`, warm = cur[3], lampK = cur[4];
    const ppm = s / this.world.mpp, L = this.lamps;
    if (lampK > 0.01 && !L) this.load();
    ctx.save();
    let nl = 0, nc = 0;
    if (lampK > 0.01 && L) {
      const lw = Math.ceil(W / LM), lh = Math.ceil(H / LM);
      if (!this.lm) { this.lm = document.createElement('canvas'); this.lx = this.lm.getContext('2d'); }
      const lm = this.lm, g = this.lx;
      if (lm.width !== lw || lm.height !== lh) { lm.width = lw; lm.height = lh; }
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
      g.fillStyle = amb; g.fillRect(0, 0, lw, lh);
      g.globalCompositeOperation = 'lighter';
      const near = smooth(0.4, 0.75, ppm), sl = s / LM, ox = W / 2 / LM - vx * sl, oy = H / 2 / LM - vy * sl;
      if (near < 1) {                                      // zoomed out: one image for the whole town
        g.globalAlpha = lampK * (1 - near) * Math.min(1, 0.55 + ppm);
        g.drawImage(L.glow, L.ox * sl + ox, L.oy * sl + oy, L.glow.width * GLOW * sl, L.glow.height * GLOW * sl);
      }
      if (near > 0) {                                      // individual pools of light on the ground
        g.globalAlpha = lampK * near * Math.min(1, 0.62 + ppm * 0.16);
        const m = 20 / this.world.mpp, sp = this.sp, grow = 1 + 0.5 * (1 - smooth(0.6, 2, ppm));     // a little larger when small, to stay soft
        const cx0 = Math.max(0, Math.floor((vx - W / 2 / s - m) / CELL) - L.gx), cx1 = Math.min(L.gw - 1, Math.floor((vx + W / 2 / s + m) / CELL) - L.gx);
        const cy0 = Math.max(0, Math.floor((vy - H / 2 / s - m) / CELL) - L.gy), cy1 = Math.min(L.gh - 1, Math.floor((vy + H / 2 / s + m) / CELL) - L.gy);
        const r0 = POOL[0] * ppm / LM * grow, r1 = POOL[1] * ppm / LM * grow, r2 = POOL[2] * ppm / LM * grow;
        const keep = ppm > 0.9, X = L.X, Y = L.Y, T = L.T;
        let buf = this.buf;
        for (let cy = cy0; cy <= cy1; cy++) {
          const i0 = L.start[cy * L.gw + cx0], i1 = L.start[cy * L.gw + cx1 + 1];
          for (let i = i0; i < i1; i++) {
            const t = T[i], r = t === 0 ? r0 : t === 1 ? r1 : r2, x = X[i] * sl + ox, y = Y[i] * sl + oy;
            if (x < -r || y < -r || x > lw + r || y > lh + r) continue;
            g.drawImage(sp[t], x - r, y - r * ISO, 2 * r, 2 * r * ISO);
            if (keep) {
              if (nl * 3 + 3 > buf.length) { buf = this.buf = new Float32Array(buf.length * 2); buf.set(this.buf); }
              buf[nl * 3] = x * LM; buf[nl * 3 + 1] = y * LM; buf[nl * 3 + 2] = t; nl++;
            }
          }
        }
      }
      if (this.floods) {                                   // the castles and the city walls are floodlit at night
        if (!this.floodSp) {
          const c = this.floodSp = document.createElement('canvas'); c.width = c.height = 64;
          const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
          gr.addColorStop(0, 'rgba(255,196,120,0.95)'); gr.addColorStop(0.45, 'rgba(255,170,90,0.42)'); gr.addColorStop(1, 'rgba(255,150,70,0)');
          x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
        }
        g.globalAlpha = Math.min(1, lampK * 0.85);
        const R = [20, 34, 85];
        for (const f of this.floods) {
          const r = Math.max(1.2, R[f[2]] * ppm / LM), x = f[0] * sl + ox, y = f[1] * sl + oy;
          if (x < -r || y < -r || x > lw + r || y > lh + r) continue;
          g.drawImage(this.floodSp, x - r, y - r * 0.8, 2 * r, 1.6 * r);
        }
      }
      nc = this.traffic(g, vx, vy, s, W, H, ppm, lampK);
      ctx.globalCompositeOperation = 'multiply';
      ctx.imageSmoothingQuality = 'low';
      ctx.drawImage(lm, 0, 0, lw * LM, lh * LM);
    } else {
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = amb; ctx.fillRect(0, 0, W, H);
    }
    if (warm > 0.01) {                                     // low sun: warm light from the west, violet in the east
      if (!this.grade || this.gw !== W || this.gh !== H) {
        const gr = this.grade = ctx.createLinearGradient(0, H * 0.2, W, H * 0.8);
        gr.addColorStop(0, 'rgb(255,150,60)'); gr.addColorStop(0.55, 'rgb(236,128,84)'); gr.addColorStop(1, 'rgb(150,96,150)');
        this.gw = W; this.gh = H;
      }
      ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = 0.36 * warm;
      ctx.fillStyle = this.grade; ctx.fillRect(0, 0, W, H);
    }
    if (nl || nc) {
      ctx.globalCompositeOperation = 'lighter';
      const a = lampK * smooth(0.9, 1.7, ppm);
      if (nl && a > 0) {                                   // the lamps themselves
        ctx.globalAlpha = a;
        const buf = this.buf, up = ISO * ppm, r = Math.max(3.5, 2.6 * ppm), core = this.core;
        for (let i = 0; i < nl; i++) {
          const t = buf[i * 3 + 2], rr = t === 2 ? r * 0.8 : r;
          ctx.drawImage(core, buf[i * 3] - rr, buf[i * 3 + 1] - HEAD[t] * up - rr, 2 * rr, 2 * rr);
        }
      }
      if (nc) {                                            // headlights and tail lights
        ctx.globalAlpha = lampK;
        const c = this.cbuf, r = Math.max(1.6, 0.85 * ppm);
        for (let i = 0; i < nc; i++) {
          const o = i * 5, x = c[o], y = c[o + 1], fx = c[o + 2], fy = c[o + 3];
          if (c[o + 4]) { ctx.drawImage(this.white, x - r * 1.5, y - r * 1.5, 3 * r, 3 * r); continue; }   // a lit railway carriage
          ctx.drawImage(this.white, x + fx - r, y + fy - r, 2 * r, 2 * r);
          ctx.drawImage(this.red, x - fx - r * 0.8, y - fy - r * 0.8, 1.6 * r, 1.6 * r);
        }
      }
    }
    ctx.restore();
  }

  // drawn under the dusk and night grading, so that mist turns dark at night and an overcast sky fades out with the daylight
  weather(ctx, vx, vy, s, W, H) {
    const wc = this.wxc, day = Math.max(0, Math.min(1, (this.cur[2] - 168) / 87));   // 1 by day, 0 from dusk on (blue channel of the ambient light)
    ctx.save();
    if (wc.mist > 0.004) {
      const m = this.mistMap();
      if (m) { ctx.globalAlpha = 0.42 * wc.mist; ctx.imageSmoothingEnabled = true; ctx.drawImage(m.c, (m.x - vx) * s + W / 2, (m.y - vy) * s + H / 2, m.c.width * 32 * s, m.c.height * 32 * s); }
    }
    const o = wc.over * day;
    if (o > 0.004) {                                       // overcast: a grey veil (less contrast, less colour) and slightly less light
      ctx.globalAlpha = 0.16 * o; ctx.fillStyle = 'rgb(172,178,186)'; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = o; ctx.fillStyle = 'rgb(236,238,242)'; ctx.fillRect(0, 0, W, H);
    }
    const c = wc.clear * day * (1 - wc.over);
    if (c > 0.004) { ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = 0.3 * c; ctx.drawImage(ctx.canvas, 0, 0, W, H); }   // foehn: the picture blended onto itself, a little more contrast and colour
    ctx.restore();
  }

  // where mist lies: the height map of the view (hmap.png, 1/32 of native, (h - 200) / 9 m) turned into an alpha mask, once
  mistMap() {
    if (this.mist) return this.mist.c ? this.mist : null;
    this.mist = {};
    const im = new Image();
    im.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
        const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height), p = d.data;
        for (let i = 0; i < p.length; i += 4) { const v = p[i], a = v ? smooth(MIST_TOP, MIST_FULL, 200 + 9 * v) : 0; p[i] = 226; p[i + 1] = 230; p[i + 2] = 235; p[i + 3] = Math.round(255 * a); }   // 0 = no ground there
        g.putImageData(d, 0, 0);
        this.mist = { c, x: this.world.bounds[0][0], y: this.world.bounds[0][1] }; this.requestDraw();
      } catch { /* no mist then */ }
    };
    im.src = (this.world.base || '') + 'hmap.png';
    return null;
  }

  // vehicles of the life layer light the road ahead; returns how many light points were queued in cbuf
  traffic(g, vx, vy, s, W, H, ppm, lampK) {
    const life = window.__life;
    if (!this.carsOk || !life || !life.cars || !life.edges || ppm <= 0.55) return 0;
    let n = 0;
    try {
      const M = this.M, c = this.cbuf, max = c.length / 5, sl = s / LM, beam = this.beam;
      const px = (e, nn) => (M[0][0] * e + M[0][1] * nn - vx) * s + W / 2, py = (e, nn, h) => (M[1][0] * e + M[1][1] * nn + M[1][2] * h - vy) * s + H / 2;
      g.globalAlpha = lampK * 0.85;
      const rb = 9 * ppm / LM;
      for (const v of life.cars) {
        const e = life.edges[v.e], p = e.p, far = (e.len + 30) * ppm;
        const ax = px(p[0], p[1]), ay = py(p[0], p[1], p[2]);
        if (ax < -far || ay < -far || ax > W + far || ay > H + far) continue;          // whole edge off screen
        const q = life.at(e, v.dir === 1 ? v.s : e.len - v.s);
        if (!q[5]) continue;
        const tx = q[3] * v.dir, ty = q[4] * v.dir, off = e.o ? 0 : Math.min(e.w / 4, 1.7);
        const ce = q[0] + ty * off, cn = q[1] - tx * off, x = px(ce, cn), y = py(ce, cn, q[2] + 0.6);
        if (x < -40 || y < -40 || x > W + 40 || y > H + 40) continue;
        const hl = v.len / 2, bx = px(ce + tx * (hl + 7), cn + ty * (hl + 7)), by = py(ce + tx * (hl + 7), cn + ty * (hl + 7), q[2]);
        g.drawImage(beam, bx / LM - rb, by / LM - rb * ISO, 2 * rb, 2 * rb * ISO);
        if (n < max) {
          const o = n++ * 5;
          c[o] = x; c[o + 1] = y; c[o + 4] = 0;
          c[o + 2] = px(ce + tx * hl, cn + ty * hl) - px(ce, cn); c[o + 3] = py(ce + tx * hl, cn + ty * hl, 0) - py(ce, cn, 0);
        }
      }
      if (life.trains && life.behind) {
        const rt = 11 * ppm / LM;
        g.globalAlpha = lampK * 0.6;
        for (const t of life.trains) {
          if (t.wait > 0 || t.freight) continue;
          for (let k = 0; k < t.wagons; k++) {
            const q = life.behind(t, 13 + k * 25.6);
            if (!q || !q[5]) continue;
            const x = px(q[0], q[1]), y = py(q[0], q[1], q[2]);
            if (x < -60 || y < -60 || x > W + 60 || y > H + 60) continue;
            g.drawImage(this.sp[0], x / LM - rt, y / LM - rt * ISO, 2 * rt, 2 * rt * ISO);
          }
        }
      }
    } catch { this.carsOk = false; return 0; }               // the life layer changed shape: do without
    return n;
  }
}
