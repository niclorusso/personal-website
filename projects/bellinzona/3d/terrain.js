// Terrain: a quadtree of 64 x 64-cell height tiles (swissALTI3D) draped with SWISSIMAGE tiles.
// A parent is drawn until all four children have their heights; textures refine independently
// (a tile borrows the best ancestor texture until its own arrives).
import * as THREE from 'three';
import { fetchBin, fetchImage, JobQueue, clamp } from './util.js';

const N = 64, NV = N + 1, NB = N + 3;
const NVERT = NV * NV + 4 * NV;

let INDEX = null;
function sharedIndex() {
  if (INDEX) return INDEX;
  const idx = [];
  for (let r = 0; r < N; r++) for (let k = 0; k < N; k++) {
    const a = r * NV + k, b = a + 1, c = a + NV, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  // skirts (both windings, so they hide cracks from either side)
  const edges = [
    k => k,                       // north row
    k => N * NV + k,              // south row
    k => k * NV,                  // west column
    k => k * NV + N,              // east column
  ];
  edges.forEach((g, e) => {
    const s0 = NV * NV + e * NV;
    for (let k = 0; k < N; k++) {
      const a = g(k), b = g(k + 1), c = s0 + k, d = s0 + k + 1;
      idx.push(a, b, c, b, d, c, a, c, b, b, c, d);
    }
  });
  INDEX = new THREE.BufferAttribute(new Uint16Array(idx), 1);
  return INDEX;
}

function decodeHeights(buf, NB = N + 3) {
  const r = new Int16Array(buf), q = new Int32Array(NB * NB), h = new Float32Array(NB * NB);
  q[0] = r[0];
  for (let k = 1; k < NB; k++) q[k] = q[k - 1] + r[k];
  for (let row = 1; row < NB; row++) {
    const o = row * NB;
    q[o] = q[o - NB] + r[o];
    for (let k = 1; k < NB; k++) q[o + k] = r[o + k] + q[o + k - 1] + q[o + k - NB] - q[o + k - NB - 1];
  }
  for (let i = 0; i < q.length; i++) h[i] = q[i] / 10;
  return h;
}

class Tile {
  constructor(T, L, i, j, parent) {
    this.T = T; this.L = L; this.i = i; this.j = j; this.parent = parent;
    const m = T.meta, s = m.root[2] / 2 ** L;
    this.s = s; this.c = s / N;
    this.x0 = m.root[0] + i * s - m.origin[0];
    this.zN = m.origin[1] - (m.root[1] + (j + 1) * s);
    this.key = `${L}/${i}_${j}`;
    this.hasData = T.sets.t[L]?.has(`${i}_${j}`);
    this.hasKids = L < m.maxLevel && !!T.sets.t[L + 1]?.has(`${2 * i}_${2 * j}`);
    this.hasTex = !!T.sets.o[L]?.has(`${i}_${j}`);
    this.state = 0; this.texState = 0; this.kids = null; this.seen = 0;
    this.box = new THREE.Box3(new THREE.Vector3(this.x0, 0, this.zN), new THREE.Vector3(this.x0 + s, 3000, this.zN + s));
  }
  children() {
    if (!this.kids) {
      this.kids = [];
      for (const [di, dj] of [[0, 1], [1, 1], [0, 0], [1, 0]]) this.kids.push(new Tile(this.T, this.L + 1, 2 * this.i + di, 2 * this.j + dj, this));
    }
    return this.kids;
  }
  async load() {
    const T = this.T;
    const buf = await fetchBin(`${T.base}t/${this.L}/${this.i}_${this.j}.bin`);
    if (this.state !== 1) return;
    this.h = decodeHeights(buf);
    this.build();
    this.state = 2;
  }
  build() {
    const h = this.h, c = this.c, T = this.T;
    const pos = new Float32Array(NVERT * 3), nrm = new Float32Array(NVERT * 3), uv = new Float32Array(NVERT * 2);
    let lo = 1e9, hi = -1e9;
    for (let r = 0; r <= N; r++) for (let k = 0; k <= N; k++) {
      const v = r * NV + k, g = (r + 1) * NB + (k + 1);
      const y = h[g];
      lo = Math.min(lo, y); hi = Math.max(hi, y);
      pos[v * 3] = this.x0 + k * c; pos[v * 3 + 1] = y; pos[v * 3 + 2] = this.zN + r * c;
      const dx = (h[g + 1] - h[g - 1]) / (2 * c), dz = (h[g + NB] - h[g - NB]) / (2 * c);
      const l = Math.hypot(dx, 1, dz);
      nrm[v * 3] = -dx / l; nrm[v * 3 + 1] = 1 / l; nrm[v * 3 + 2] = -dz / l;
      uv[v * 2] = k / N; uv[v * 2 + 1] = r / N;
    }
    const drop = Math.max(4, c * 2.5);
    const edges = [k => k, k => N * NV + k, k => k * NV, k => k * NV + N];
    edges.forEach((g, e) => {
      for (let k = 0; k <= N; k++) {
        const src = g(k), v = NV * NV + e * NV + k;
        pos[v * 3] = pos[src * 3]; pos[v * 3 + 1] = pos[src * 3 + 1] - drop; pos[v * 3 + 2] = pos[src * 3 + 2];
        nrm.copyWithin(v * 3, src * 3, src * 3 + 3);
        uv[v * 2] = uv[src * 2]; uv[v * 2 + 1] = uv[src * 2 + 1];
      }
    });
    this.box.min.y = lo - drop; this.box.max.y = hi;
    this.minY = lo; this.maxY = hi;
    const geo = new THREE.BufferGeometry();
    geo.setIndex(sharedIndex());
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.boundingBox = this.box.clone();
    geo.boundingSphere = this.box.getBoundingSphere(new THREE.Sphere());
    this.mat = T.makeMaterial();
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.matrixAutoUpdate = false;
    this.mesh.receiveShadow = true;
    this.mesh.visible = false;
    this.mesh.renderOrder = 10 - this.L;
    T.group.add(this.mesh);
    this.texFrom = null;
  }
  async loadTex() {
    const T = this.T;
    const img = await fetchImage(`${T.base}o/${this.L}/${this.i}_${this.j}.webp`);
    if (this.texState !== 1) { img.close?.(); return; }
    const t = new THREE.Texture(img);
    t.colorSpace = THREE.SRGBColorSpace;
    t.flipY = false;
    t.anisotropy = T.anisotropy;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.needsUpdate = true;
    this.tex = t;
    this.texState = 2;
  }
  // best texture available: own or an ancestor's (with a uv window)
  useTexture() {
    let a = this;
    while (a && !(a.texState === 2)) a = a.parent;
    if (!a) return false;
    if (this.texFrom === a) return true;
    if (this.borrow) { this.borrow.dispose(); this.borrow = null; }
    if (a === this) this.mat.map = this.tex;
    else {
      const f = 2 ** (this.L - a.L);
      const n = 2 ** this.L, na = 2 ** a.L;
      const jn = n - 1 - this.j, jna = na - 1 - a.j;
      const t = a.tex.clone();
      t.offset.set((this.i - a.i * f) / f, (jn - jna * f) / f);
      t.repeat.set(1 / f, 1 / f);
      t.needsUpdate = false;
      this.borrow = t;
      this.mat.map = t;
    }
    if (!this.mat.userData.hadMap) { this.mat.needsUpdate = true; this.mat.userData.hadMap = true; }
    this.texFrom = a;
    return true;
  }
  dispose() {
    if (this.kids) for (const k of this.kids) k.dispose();
    this.kids = null;
    if (this.mesh) { this.T.group.remove(this.mesh); this.mesh.geometry.dispose(); this.mat.dispose(); this.mesh = null; }
    if (this.borrow) { this.borrow.dispose(); this.borrow = null; }
    if (this.tex) { this.tex.dispose(); this.tex.image?.close?.(); this.tex = null; }
    this.state = 0; this.texState = 0; this.texFrom = null; this.h = null;
  }
  // bilinear height inside this tile (x, z world)
  sample(x, z) {
    const fx = clamp((x - this.x0) / this.c, 0, N) + 1, fz = clamp((z - this.zN) / this.c, 0, N) + 1;
    const k = Math.min(Math.floor(fx), NB - 2), r = Math.min(Math.floor(fz), NB - 2);
    const u = fx - k, v = fz - r, h = this.h, g = r * NB + k;
    return (h[g] * (1 - u) + h[g + 1] * u) * (1 - v) + (h[g + NB] * (1 - u) + h[g + NB + 1] * u) * v;
  }
}

export class Terrain {
  constructor(meta, base, renderer) {
    this.meta = meta; this.base = base;
    this.sets = { t: {}, o: {} };
    for (const L in meta.terrain) this.sets.t[L] = new Set(meta.terrain[L]);
    for (const L in meta.ortho) this.sets.o[L] = new Set(meta.ortho[L]);
    this.group = new THREE.Group();
    this.queue = new JobQueue(6);
    this.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    this.tau = 1.6;                                    // max size of a texel on screen (device px) before splitting
    this.frustum = new THREE.Frustum();
    this.m4 = new THREE.Matrix4();
    const [rx, rz, S] = [meta.root[0] - meta.origin[0], meta.origin[1] - meta.root[1] - meta.root[2], meta.root[2]];
    // haze at the edge of the data: the detailed square fades from ~6.4 km until the horizon ring is in,
    // then only the ring's far edge does (uFade: radii where the fade starts and ends, from the centre)
    this.uniforms = { uCentre: { value: new THREE.Vector2(rx + S / 2, rz + S / 2) }, uFade: { value: new THREE.Vector2(6400, 8300) } };
    this.rootBox = [rx, rz, rx + S, rz + S];
    this.outer = null;
    this.root = new Tile(this, 0, 0, 0, null);
    this.shown = [];
    this.tmp = new THREE.Vector3();
    this.lastEvict = 0;
  }
  makeMaterial(fade = this.uniforms.uFade, key = 'terrain-fade') {
    const m = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const U = this.uniforms;
    m.onBeforeCompile = sh => {
      sh.uniforms.uCentre = U.uCentre;
      sh.uniforms.uFade = fade;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vEdgeXZ;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvEdgeXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vEdgeXZ;\nuniform vec2 uCentre, uFade;')
        .replace('#include <fog_fragment>', `#include <fog_fragment>
          #ifdef USE_FOG
          // where the data end, fade into the haze in a circle rather than along a square edge
          gl_FragColor.rgb = mix(fogColor, gl_FragColor.rgb, smoothstep(uFade.y, uFade.x, length(vEdgeXZ - uCentre)));
          #endif`);
    };
    m.customProgramCacheKey = () => key;
    return m;
  }
  // the horizon ring: a 32.8 km square at 128 m (swissALTIRegio outside, swissALTI3D inside), one mesh with a hole
  async loadOuter() {
    const o = this.meta.outer;
    if (!o) return;
    const [buf, img] = await Promise.all([fetchBin(`${this.base}outer.bin`), fetchImage(`${this.base}outer.webp`)]);
    const n = o.cells, nb = n + 3, c = o.size / n, V = n + 1;
    const h = decodeHeights(buf, nb);
    const x0 = o.origin[0] - this.meta.origin[0], zN = this.meta.origin[1] - (o.origin[1] + o.size);
    const hole0 = Math.round((this.rootBox[0] - x0) / c), hole1 = hole0 + Math.round(this.meta.root[2] / c);
    const inHole = (r, k) => r >= hole0 && r < hole1 && k >= hole0 && k < hole1;
    // skirt along the hole (under the detailed terrain's edge)
    const ring = [];
    for (let k = hole0; k < hole1; k++) ring.push([hole0, k], [hole0, k + 1], [hole1, k], [hole1, k + 1], [k, hole0], [k + 1, hole0], [k, hole1], [k + 1, hole1]);
    const NV = V * V + ring.length;
    const pos = new Float32Array(NV * 3), nrm = new Float32Array(NV * 3), uv = new Float32Array(NV * 2);
    const put = (v, r, k, drop) => {
      const g = (r + 1) * nb + (k + 1);
      pos[v * 3] = x0 + k * c; pos[v * 3 + 1] = h[g] - drop; pos[v * 3 + 2] = zN + r * c;
      const dx = (h[g + 1] - h[g - 1]) / (2 * c), dz = (h[g + nb] - h[g - nb]) / (2 * c), l = Math.hypot(dx, 1, dz);
      nrm[v * 3] = -dx / l; nrm[v * 3 + 1] = 1 / l; nrm[v * 3 + 2] = -dz / l;
      uv[v * 2] = k / n; uv[v * 2 + 1] = r / n;
    };
    for (let r = 0; r <= n; r++) for (let k = 0; k <= n; k++) put(r * V + k, r, k, 0);
    ring.forEach(([r, k], i) => put(V * V + i, r, k, 60));
    // in blocks of 32 x 32 cells sharing one vertex buffer, so that what is behind the camera is culled
    const A = { position: new THREE.BufferAttribute(pos, 3), normal: new THREE.BufferAttribute(nrm, 3), uv: new THREE.BufferAttribute(uv, 2) };
    const blocks = [];
    const B = 32;
    for (let br = 0; br < n; br += B) for (let bk = 0; bk < n; bk += B) {
      const idx = [];
      let lo = 1e9, hi = -1e9;
      for (let r = br; r < br + B; r++) for (let k = bk; k < bk + B; k++) {
        if (inHole(r, k)) continue;
        const a = r * V + k, b = a + 1, cc = a + V, d = cc + 1;
        idx.push(a, cc, b, b, cc, d);
        lo = Math.min(lo, pos[a * 3 + 1], pos[d * 3 + 1]); hi = Math.max(hi, pos[a * 3 + 1], pos[d * 3 + 1]);
      }
      if (!idx.length) continue;
      const box = new THREE.Box3(new THREE.Vector3(x0 + bk * c, lo - 10, zN + br * c), new THREE.Vector3(x0 + (bk + B) * c, hi + 10, zN + (br + B) * c));
      blocks.push([idx, box]);
    }
    const sk = [];
    for (let i = 0; i < ring.length; i += 2) {
      const [r0, k0] = ring[i], [r1, k1] = ring[i + 1];
      const a = r0 * V + k0, b = r1 * V + k1, sa = V * V + i, sb = V * V + i + 1;
      sk.push(a, b, sa, b, sb, sa, a, sa, b, b, sa, sb);
    }
    blocks.push([sk, null]);
    const t = new THREE.Texture(img);
    t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.anisotropy = this.anisotropy;
    t.minFilter = THREE.LinearMipmapLinearFilter; t.needsUpdate = true;
    const R = o.size / 2;
    const mat = this.makeMaterial({ value: new THREE.Vector2(R * 0.84, R * 0.99) }, 'terrain-outer');
    mat.map = t;
    for (const [idx, box] of blocks) {
      const geo = new THREE.BufferGeometry();
      geo.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
      for (const k in A) geo.setAttribute(k, A[k]);
      if (box) { geo.boundingBox = box; geo.boundingSphere = box.getBoundingSphere(new THREE.Sphere()); } else geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.matrixAutoUpdate = false;
      mesh.renderOrder = 20;
      this.group.add(mesh);
    }
    this.outer = { h, nb, n, c, x0, zN };
    this.uniforms.uFade.value.set(1e7, 1.1e7);                // the detailed terrain no longer needs to fade
  }
  update(camera, viewH, moving = false) {
    const now = performance.now();
    this.moving = moving;
    this.now = now;
    this.cam = camera.position;
    this.K = viewH / (2 * Math.tan(camera.fov * Math.PI / 360));
    this.frustum.setFromProjectionMatrix(this.m4.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    for (const t of this.shown) t.mesh && (t.mesh.visible = false);
    this.shown = [];
    this.visit(this.root);
    for (const t of this.shown) { t.mesh.visible = true; t.useTexture(); }
    this.queue.pump();
    if (now - this.lastEvict > 3000) { this.lastEvict = now; this.evict(this.root, now); }
  }
  dist(t) { return Math.max(1, t.box.distanceToPoint(this.cam)); }
  request(t, extra = 0) {
    if (this.moving && t.L >= 5) return;          // during a flight only the coarse levels: fine tiles once arrived
    if (t.state === 0 && t.hasData) {
      this.queue.request(t.key, t.L * 0.25 + this.dist(t) / t.s + extra, () => { if (t.state === 0) { t.state = 1; return t.load().catch(e => { t.state = -1; setTimeout(() => { if (t.state === -1) t.state = 0; }, 8000); throw e; }); } });
    }
  }
  requestTex(t) {
    if (this.moving && t.L >= 5) return;
    let a = t;
    while (a && !a.hasTex) a = a.parent;
    if (!a || a.texState !== 0) return;
    a.seen = this.now;
    this.queue.request('o' + a.key, a.L * 0.25 + this.dist(t) / a.s + 0.1, () => { if (a.texState === 0) { a.texState = 1; return a.loadTex().catch(e => { a.texState = -1; setTimeout(() => { if (a.texState === -1) a.texState = 0; }, 8000); throw e; }); } });
  }
  wantSplit(t) {
    if (!t.hasKids) return false;
    if (!this.frustum.intersectsBox(t.box)) return false;
    return (t.s / this.meta.texpx) * this.K / this.dist(t) > this.tau;
  }
  visit(t) {
    t.seen = this.now;
    if (t.state === 0) this.request(t);
    if (t.state !== 2) return;
    if (this.wantSplit(t)) {
      const kids = t.children();
      let ready = true;
      for (const k of kids) {
        k.seen = this.now;
        if (k.state === 0) this.request(k);
        if (k.state !== 2 && k.state !== -1) ready = false;
      }
      if (ready && kids.every(k => k.state === 2)) { for (const k of kids) this.visit(k); return; }
    }
    if (!this.frustum.intersectsBox(t.box) && t.L > 0) return;
    this.shown.push(t);
    this.requestTex(t);
  }
  evict(t, now) {
    if (!t.kids) return;
    for (const k of t.kids) {
      if (now - k.seen > 20000 && k.L > 2) k.dispose();
      else this.evict(k, now);
    }
    if (t.kids.every(k => k.state === 0 && !k.kids)) t.kids = null;
  }
  // height of the finest loaded tile under (x, z); null when nothing is loaded there yet
  heightAt(x, z) {
    const B = this.rootBox, O = this.outer;
    if (O && (x < B[0] || x > B[2] || z < B[1] || z > B[3])) {
      const fx = Math.min(Math.max((x - O.x0) / O.c, 0), O.n) + 1, fz = Math.min(Math.max((z - O.zN) / O.c, 0), O.n) + 1;
      const k = Math.min(Math.floor(fx), O.nb - 2), r = Math.min(Math.floor(fz), O.nb - 2), u = fx - k, v = fz - r, g = r * O.nb + k, h = O.h;
      return (h[g] * (1 - u) + h[g + 1] * u) * (1 - v) + (h[g + O.nb] * (1 - u) + h[g + O.nb + 1] * u) * v;
    }
    let t = this.root;
    if (t.state !== 2) return null;
    for (;;) {
      if (!t.kids) break;
      const fx = (x - t.x0) / t.s, fz = (z - t.zN) / t.s;
      const k = t.kids[(fz < 0.5 ? 0 : 2) + (fx < 0.5 ? 0 : 1)];
      if (!k || k.state !== 2) break;
      t = k;
    }
    return t.sample(x, z);
  }
  tileCount() { return this.shown.length; }
  // every tile on screen has the sharpest photo that exists for it
  texturesReady() {
    for (const t of this.shown) {
      let a = t;
      while (a && !a.hasTex) a = a.parent;
      if (a && a.texState !== 2 && a.texState !== -1) return false;
    }
    return true;
  }
  // ray-march the height field; returns distance to the first hit or null
  raycast(origin, dir, maxD = 20000) {
    let d = 0, step = 4;
    let prevAbove = true;
    const p = this.tmp;
    while (d < maxD) {
      p.copy(dir).multiplyScalar(d).add(origin);
      const h = this.heightAt(p.x, p.z);
      if (h !== null && p.y < h) {
        // refine
        let a = Math.max(0, d - step), b = d;
        for (let i = 0; i < 12; i++) {
          const m = (a + b) / 2;
          p.copy(dir).multiplyScalar(m).add(origin);
          const hm = this.heightAt(p.x, p.z);
          if (hm !== null && p.y < hm) b = m; else a = m;
        }
        return b;
      }
      step = Math.max(2, Math.min(200, d * 0.02 + (h === null ? 50 : (p.y - h) * 0.5)));
      d += step;
    }
    return null;
  }
}
