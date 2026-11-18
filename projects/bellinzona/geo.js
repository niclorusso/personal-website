// Where things are on the map, for "Dove sono?" and the address search. Nothing here runs until the visitor asks.
//   GPS (WGS84) -> Swiss LV95 with swisstopo's approximate formulas (about 1 m in Switzerland), then the map's own
//   projection (world.enu2px), the same one that places the markers (explore.js) and the itineraries (17_itinerari.py).
//   Ground height: the nearest point of the walking network (roads.json carries heights) or the height map (hmap.png).
//   Walking distances: shortest path on the network of roads.json, as the itineraries do, and the same time rule
//   (4 km/h on the flat plus one hour for every 400 m of climb): an estimate, not a measured time.
//   The visitor's own itinerary (explore.js) takes its legs and its line from the same network, counted the same way.

export function lv95(lat, lon) {
  const p = (lat * 3600 - 169028.66) / 10000, l = (lon * 3600 - 26782.5) / 10000;
  return [2600072.37 + 211455.93 * l - 10938.51 * l * p - 0.36 * l * p * p - 44.54 * l * l * l,
    1200147.07 + 308807.95 * p + 3745.25 * l * l + 76.63 * p * p - 194.56 * l * l * p + 119.79 * p * p * p];
}
export const walkMin = (m, up) => Math.max(1, Math.round(m / 66.7 + up / 6.67));

export class Geo {
  constructor(world, lang = 'it') {
    this.lang = ['it', 'de', 'fr', 'en'].includes(lang) ? lang : 'it';   // the language of the address search's answers (the kinds of place names)
    this.world = world; this.M = world.enu2px; this.O = world.origin_lv95;
    const M = this.M, [x0, y0, x1, y1] = world.content, det = M[0][0] * M[1][1] - M[0][1] * M[1][0];
    // the LV95 box around the drawn area (corners of world.content brought back to the ground), for the address search
    const en = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([x, y]) => [(M[1][1] * x - M[0][1] * y) / det + this.O[0], (-M[1][0] * x + M[0][0] * y) / det + this.O[1]]);
    this.bbox = [Math.min(...en.map(q => q[0])), Math.min(...en.map(q => q[1])), Math.max(...en.map(q => q[0])), Math.max(...en.map(q => q[1]))].map(Math.round);
    this.net = null; this._hm = null; this._net = null;
  }

  hmap() {                                                   // screen-space terrain heights, 1/32 of native, (h - 200) / 9
    return this._hm || (this._hm = new Promise(res => {
      const im = new Image();
      im.onload = () => {
        const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
        const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0);
        const d = x.getImageData(0, 0, im.width, im.height).data, v = new Uint8Array(im.width * im.height);
        for (let i = 0; i < v.length; i++) v[i] = d[i * 4];
        res({ w: im.width, h: im.height, v });
      };
      im.onerror = () => res(null);
      im.src = (this.world.base || '') + 'hmap.png';
    }));
  }
  // ground height and screen position of a point given in metres from the origin; null where the map has no ground
  async place(a, b) {
    const hm = await this.hmap(); if (!hm) return null;
    const [bx, by] = this.world.bounds[0], M = this.M, x = M[0][0] * a + M[0][1] * b, y0 = M[1][0] * a + M[1][1] * b;
    const at = (y, near) => {
      const fx = (x - bx) / 32 - 0.5, fy = (y - by) / 32 - 0.5, i = Math.floor(fx), j = Math.floor(fy);
      if (i < 0 || j < 0 || i + 1 >= hm.w || j + 1 >= hm.h) return 0;
      if (near) return hm.v[Math.round(fy) * hm.w + Math.round(fx)];
      const u = fx - i, t = fy - j, o = j * hm.w + i;
      return (hm.v[o] * (1 - u) + hm.v[o + 1] * u) * (1 - t) + (hm.v[o + hm.w] * (1 - u) + hm.v[o + hm.w + 1] * u) * t;
    };
    let c = 0;                                               // the height map is indexed on screen: find the height that lands on itself
    for (let k = 0; k < 6; k++) { const v = at(y0 + M[1][2] * c); if (!v) return null; c = 204.5 + v * 9 - this.O[2]; }
    if (!at(y0 + M[1][2] * c, true)) return null;
    const s = this.net && this.net.snap(a, b, 25);           // on a street or path its own height is exact
    if (s) c = this.net.z[s.i];
    return { a, b, c, h: c + this.O[2], x, y: y0 + M[1][2] * c };
  }
  async fromWgs(lat, lon) { const [e, n] = lv95(lat, lon); return { e, n, at: await this.place(e - this.O[0], n - this.O[1]), km: Math.hypot(e - this.O[0], n - this.O[1]) / 1000 }; }

  // the walking network of roads.json (motorways and railways left out, as for the itineraries)
  loadNet() {
    return this._net || (this._net = fetch((this.world.base || '') + 'roads.json').then(r => r.ok ? r.json() : null).then(d => { if (d) this.net = new Net(d.edges); return this.net; }).catch(() => null));
  }

  // swisstopo's location search (addresses and place names), kept to the drawn area
  async addresses(q, signal) {
    const u = 'https://api3.geo.admin.ch/rest/services/api/SearchServer?type=locations&origins=address,gazetteer&sr=2056&lang=' + this.lang + '&limit=20&bbox=' + this.bbox.join(',') + '&searchText=' + encodeURIComponent(q);
    const r = await fetch(u, { signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!r.ok) throw new Error('search ' + r.status);
    const j = await r.json(), out = [], seen = new Set();
    const txt = s => String(s || '').replace(/<[^>]*>/g, '').replace(/&(amp|lt|gt|quot|#39);/g, (m, k) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }[k])).replace(/\s+/g, ' ').trim();
    for (const res of j.results || []) {
      const t = res.attrs || {}, lab = String(t.label || '');
      if (!Number.isFinite(t.x) || !Number.isFinite(t.y)) continue;
      let name, sub;
      if (t.origin === 'address') { name = txt(lab.split('<b>')[0]).replace(/\s#$/, ''); sub = txt((/<b>(.*?)<\/b>/.exec(lab) || [])[1]); }
      else { const kind = txt((/<i>(.*?)<\/i>/.exec(lab) || [])[1]); name = txt((/<b>(.*?)<\/b>/.exec(lab) || [])[1] || lab); const town = txt(lab.split('</b>').pop()).replace(/^\(\w+\)\s*-\s*/, ''); sub = [kind, town].filter(Boolean).join(' · '); }
      const key = (name + '|' + sub.replace(/^\d{4}\s+/, '')).toLowerCase();   // the street and the place name of the same square count once
      if (!name || seen.has(key)) continue;
      seen.add(key);
      const at = await this.place(t.y - this.O[0], t.x - this.O[1]);   // sr=2056: y is the easting, x the northing
      if (!at) continue;
      out.push({ name, sub, x: at.x, y: at.y, town: t.origin === 'gazetteer' && /SIEDLUNG/i.test(t.objectclass || '') });
    }
    return out;
  }
}

class Net {
  constructor(edges) {
    const key = new Map(), X = [], Y = [], Z = [], U = [], V = [], L = [], Wt = [];
    const node = (a, b, c) => { const k = a + ',' + b; let i = key.get(k); if (i === undefined) { i = X.length; key.set(k, i); X.push(a); Y.push(b); Z.push(c); } return i; };
    for (const e of edges) {
      if (e.c === 0 || e.c === 6) continue;
      const p = e.p, f = e.c === 7 ? 0.75 : 1;              // footpaths and pedestrian streets preferred a little, as for the itineraries
      let prev = node(p[0], p[1], p[2]);
      for (let k = 4; k < p.length; k += 4) {
        const i = node(p[k], p[k + 1], p[k + 2]); if (i === prev) continue;
        const d = Math.hypot(X[i] - X[prev], Y[i] - Y[prev]);
        U.push(prev); V.push(i); L.push(d); Wt.push(d * f + 1e-3); prev = i;
      }
    }
    const n = X.length; this.n = n; this.x = Float32Array.from(X); this.y = Float32Array.from(Y); this.z = Float32Array.from(Z);
    const deg = new Uint32Array(n + 1); for (let k = 0; k < U.length; k++) { deg[U[k] + 1]++; deg[V[k] + 1]++; }
    for (let i = 0; i < n; i++) deg[i + 1] += deg[i];
    const fill = deg.slice(0, n), to = new Uint32Array(U.length * 2), len = new Float32Array(U.length * 2), w = new Float32Array(U.length * 2);
    for (let k = 0; k < U.length; k++) { let j = fill[U[k]]++; to[j] = V[k]; len[j] = L[k]; w[j] = Wt[k]; j = fill[V[k]]++; to[j] = U[k]; len[j] = L[k]; w[j] = Wt[k]; }
    this.off = deg; this.to = to; this.len = len; this.w = w;
    // keep the largest connected piece: a start on a stray fragment would reach nothing
    const comp = new Int32Array(n).fill(-1), size = []; const st = new Uint32Array(n);
    for (let s = 0; s < n; s++) if (comp[s] < 0) { let top = 0, c = 0; st[top++] = s; comp[s] = size.length; while (top) { const u = st[--top]; c++; for (let j = deg[u]; j < deg[u + 1]; j++) if (comp[to[j]] < 0) { comp[to[j]] = size.length; st[top++] = to[j]; } } size.push(c); }
    const main = size.indexOf(Math.max(...size)); this.grid = new Map(); this.G = 50;
    for (let i = 0; i < n; i++) if (comp[i] === main) { const k = this.cell(Math.floor(X[i] / this.G), Math.floor(Y[i] / this.G)); let g = this.grid.get(k); if (!g) this.grid.set(k, g = []); g.push(i); }
  }
  cell(i, j) { return (i + 2000) * 4096 + (j + 2000); }
  snap(a, b, maxD = 300) {                                   // nearest node of the main network within maxD metres
    const G = this.G, ci = Math.floor(a / G), cj = Math.floor(b / G); let best = null, bd = maxD;
    for (let r = 0; r * G - G <= bd; r++) {
      for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) {
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r) continue;
        const g = this.grid.get(this.cell(i, j)); if (!g) continue;
        for (const k of g) { const d = Math.hypot(this.x[k] - a, this.y[k] - b); if (d < bd) { bd = d; best = k; } }
      }
    }
    return best === null ? null : { i: best, d: bd };
  }
  // shortest walks from one point to everywhere; to(a, b) -> { m, up, min } or null
  // path(a, b) -> { m, up, min, p: [a, b, c, ...] }: the walk counted as 17_itinerari.py counts the itineraries' legs (street to street)
  // goals: optional [[a, b], ...]: stop as soon as all of them are reached
  from(a, b, goals) {
    const s = this.snap(a, b); if (!s) return null;
    const n = this.n, dist = new Float64Array(n).fill(Infinity), len = new Float32Array(n), up = new Float32Array(n), done = new Uint8Array(n), pred = new Int32Array(n).fill(-1);
    let hk = new Float64Array(1024), hv = new Uint32Array(1024), hn = 0, left = 0;
    const want = goals ? new Uint8Array(n) : null;
    if (goals) for (const [ga, gb] of goals) { const t = this.snap(ga, gb); if (t && !want[t.i]) { want[t.i] = 1; left++; } }
    const push = (k, v) => { if (hn === hk.length) { const k2 = new Float64Array(hn * 2), v2 = new Uint32Array(hn * 2); k2.set(hk); v2.set(hv); hk = k2; hv = v2; } let i = hn++; while (i) { const p = (i - 1) >> 1; if (hk[p] <= k) break; hk[i] = hk[p]; hv[i] = hv[p]; i = p; } hk[i] = k; hv[i] = v; };
    const pop = () => { const v = hv[0], k = hk[--hn], x = hv[hn]; let i = 0; for (;;) { let c = 2 * i + 1; if (c >= hn) break; if (c + 1 < hn && hk[c + 1] < hk[c]) c++; if (hk[c] >= k) break; hk[i] = hk[c]; hv[i] = hv[c]; i = c; } hk[i] = k; hv[i] = x; return v; };
    dist[s.i] = 0; push(0, s.i);
    while (hn) {
      const u = pop(); if (done[u]) continue; done[u] = 1;
      if (want && want[u] && !--left) break;
      for (let j = this.off[u]; j < this.off[u + 1]; j++) {
        const v = this.to[j], d = dist[u] + this.w[j];
        if (d < dist[v]) { dist[v] = d; len[v] = len[u] + this.len[j]; up[v] = up[u] + Math.max(0, this.z[v] - this.z[u]); pred[v] = u; push(d, v); }
      }
    }
    return { start: s, to: (a2, b2) => { const t = this.snap(a2, b2); if (!t || !done[t.i]) return null; const m = len[t.i] + s.d + t.d; return { m, up: up[t.i], min: walkMin(m, up[t.i]) }; },
      path: (a2, b2) => {
        const t = this.snap(a2, b2); if (!t || !done[t.i]) return null;
        const ids = []; for (let i = t.i; i >= 0; i = pred[i]) ids.push(i);
        const p = []; for (let k = ids.length - 1; k >= 0; k--) p.push(this.x[ids[k]], this.y[ids[k]], this.z[ids[k]]);
        return { m: len[t.i], up: up[t.i], min: walkMin(len[t.i], up[t.i]), p };
      } };
  }
}

// the order of a walk that starts at point 0 and may end anywhere, shortest by the costs C[i][j] (minutes, not symmetric
// uphill): nearest neighbour, then 2-opt until nothing improves. Point 0 stays first.
export function shortestOrder(C) {
  const n = C.length, cost = o => { let s = 0; for (let k = 1; k < o.length; k++) s += C[o[k - 1]][o[k]]; return s; };
  let o = [0];
  const left = new Set(); for (let i = 1; i < n; i++) left.add(i);
  while (left.size) { const u = o[o.length - 1]; let b = -1; for (const v of left) if (b < 0 || C[u][v] < C[u][b]) b = v; o.push(b); left.delete(b); }
  let best = cost(o), better = true;
  while (better) {
    better = false;
    for (let i = 1; i < n - 1; i++) for (let j = i + 1; j < n; j++) {
      const t = o.slice(0, i).concat(o.slice(i, j + 1).reverse(), o.slice(j + 1)), c = cost(t);
      if (c < best - 1e-6) { o = t; best = c; better = true; }
    }
  }
  return o;
}
