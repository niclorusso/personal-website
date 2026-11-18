// Buildings (swissBUILDINGS3D), trees (vegetation height model peaks) and walk-blocking masks, in 512 m tiles.
import * as THREE from 'three';
import { fetchBin, VarReader, JobQueue } from './util.js';

const LIN = new Uint8Array(256);
for (let i = 0; i < 256; i++) { const c = i / 255; LIN[i] = Math.round(255 * (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); }

function decodeBuildings(buf, qs) {
  const dv = new DataView(buf);
  const nV = dv.getUint32(0, true), nI = dv.getUint32(4, true), nR = dv.getUint32(8, true);
  const ox = dv.getFloat32(16, true), oy = dv.getFloat32(20, true), oz = dv.getFloat32(24, true);
  const u8 = new Uint8Array(buf);
  const rd = new VarReader(u8, 28);
  const counts = new Uint32Array(nR);
  for (let r = 0; r < nR; r++) counts[r] = rd.next();
  const rgb = u8.subarray(rd.p, rd.p + nR * 4);          // r, g, b, kind per run
  rd.p += nR * 4;
  const pos = new Float32Array(nV * 3);
  let x = 0, y = 0, z = 0;
  const inv = 1 / qs;
  for (let v = 0; v < nV; v++) {
    x += rd.zz(); y += rd.zz(); z += rd.zz();
    pos[v * 3] = ox + x * inv; pos[v * 3 + 1] = oy + y * inv; pos[v * 3 + 2] = oz + z * inv;
  }
  const idx = nV > 65535 ? new Uint32Array(nI) : new Uint16Array(nI);
  let hw = 0;
  for (let i = 0; i < nI; i++) {
    const c = rd.next();
    idx[i] = c === 0 ? hw++ : hw - c;
  }
  const col = new Uint8Array(nV * 3);
  let v = 0;
  for (let r = 0; r < nR; r++) {
    const R = LIN[rgb[r * 4]], G = LIN[rgb[r * 4 + 1]], B = LIN[rgb[r * 4 + 2]], wall = rgb[r * 4 + 3] === 0;
    let y0 = 1e9;
    if (wall) for (let k = 0; k < counts[r]; k++) y0 = Math.min(y0, pos[(v + k) * 3 + 1]);
    for (let k = 0; k < counts[r]; k++, v++) {
      // walls a little darker towards the ground (sky light is blocked down in the streets)
      let f = 1;
      if (wall) { const t = Math.min(1, Math.max(0, (pos[v * 3 + 1] - y0 - 2.5) / 9)); f = 0.62 + 0.38 * t * (2 - t); }
      col[v * 3] = R * f; col[v * 3 + 1] = G * f; col[v * 3 + 2] = B * f;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3, true));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}

// far-away buildings: simplified outlines extruded to mid-roof height (dm), one wall and one roof colour each.
// All tiles in one geometry (one draw call); a per-vertex tile number lets the shader hide tiles drawn in full.
function decodeLodAll(buf, tileOf) {
  const dv = new DataView(buf), u8 = new Uint8Array(buf);
  const nT = dv.getUint32(0, true);
  const P = [], C = [], TID = [];
  const ring = [], v2 = [];
  let o = 4;
  for (let s = 0; s < nT; s++) {
    const i = dv.getUint16(o, true), j = dv.getUint16(o + 2, true), len = dv.getUint32(o + 4, true);
    const t = tileOf(i, j);
    const n = dv.getUint32(o + 8, true);
    const rd = new VarReader(u8, o + 12);
    o += 8 + len;
    if (!t) continue;
    t.lodTris = 0;
    for (let b = 0; b < n; b++) {
      const np = rd.next(), y0 = rd.next() / 10, y1 = y0 + rd.next() / 10;
      ring.length = 0; v2.length = 0;
      let qx = 0, qz = 0;
      for (let k = 0; k < np; k++) { qx += rd.zz(); qz += rd.zz(); ring.push([t.x0 + qx / 10, t.zN + qz / 10]); }
      const w = u8.subarray(rd.p, rd.p + 3), r = u8.subarray(rd.p + 3, rd.p + 6);
      rd.p += 6;
      const wc = [LIN[w[0]], LIN[w[1]], LIN[w[2]]], wl = wc.map(c => c * 0.75), rc = [LIN[r[0]], LIN[r[1]], LIN[r[2]]];
      for (let k = 0; k < np; k++) {
        const a = ring[k], c = ring[(k + 1) % np];
        P.push(a[0], y0, a[1], c[0], y0, c[1], c[0], y1, c[1], a[0], y0, a[1], c[0], y1, c[1], a[0], y1, a[1]);
        C.push(...wl, ...wl, ...wc, ...wl, ...wc, ...wc);
        v2.push(new THREE.Vector2(a[0], a[1]));
      }
      let nt = 2 * np;
      for (const f of THREE.ShapeUtils.triangulateShape(v2, [])) {
        for (const q of f) { P.push(ring[q][0], y1, ring[q][1]); C.push(...rc); }
        nt++;
      }
      for (let k = 0; k < nt * 3; k++) TID.push(t.idx);
      t.lodTris += nt;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Uint8Array(C), 3, true));
  geo.setAttribute('tid', new THREE.BufferAttribute(new Uint16Array(TID), 1));
  geo.computeBoundingSphere();
  return geo;
}

// unit tree shapes (height 1, crown radius 1), merged with vertex colours (crown white = tinted per instance, trunk dark)
function treeGeometry(kind) {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.08, 0.1, 1, 5, 1, true);
  if (kind === 'broad') {
    trunk.scale(1, 0.45, 1); trunk.translate(0, 0.2, 0);
    const crown = new THREE.IcosahedronGeometry(1, 0);
    crown.scale(1, 0.62 / 1, 1); crown.translate(0, 0.62, 0);
    // icosahedron spans y -1..1 -> scaled to +-0.62: crown from 0.0 .. 1.24; squeeze into 0.32..1.0
    crown.scale(1, 0.55, 1); crown.translate(0, 0.32, 0);
    parts.push([trunk, 0.32], [crown, 1]);
  } else {
    trunk.scale(1, 0.3, 1); trunk.translate(0, 0.1, 0);
    const cone = new THREE.ConeGeometry(1, 0.88, kind === 'cypress' ? 6 : 7, 1, false);
    cone.translate(0, 0.12 + 0.44, 0);
    parts.push([trunk, 0.32], [cone, 1]);
  }
  const geos = parts.map(([g, shade]) => {
    g = g.toNonIndexed();
    g.deleteAttribute('uv');
    const n = g.attributes.position.count;
    const c = new Float32Array(n * 3).fill(shade);
    if (shade < 1) for (let i = 0; i < n; i++) { c[i * 3] = 0.3; c[i * 3 + 1] = 0.22; c[i * 3 + 2] = 0.16; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return g;
  });
  const total = geos.reduce((a, g) => a + g.attributes.position.count, 0);
  const pos = new Float32Array(total * 3), nrm = new Float32Array(total * 3), col = new Float32Array(total * 3);
  let o = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, o * 3); nrm.set(g.attributes.normal.array, o * 3); col.set(g.attributes.color.array, o * 3);
    o += g.attributes.position.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

// crown colours by month: broadleaf turns in October-November and is bare in winter (chestnut woods of the valley sides)
function palettes(month) {
  const g = (r, gg, b) => new THREE.Color().setRGB(r / 255, gg / 255, b / 255, THREE.SRGBColorSpace);
  const summer = [g(86, 120, 62), g(74, 108, 56), g(98, 130, 70), g(80, 112, 66)];
  const autumn = [g(112, 98, 56), g(100, 84, 52), g(86, 92, 56), g(118, 100, 60), g(78, 90, 54), g(96, 74, 50), g(74, 94, 58)];
  const winter = [g(128, 112, 96), g(118, 104, 92), g(136, 122, 104)];
  const spring = [g(120, 156, 78), g(104, 144, 70), g(130, 160, 90)];
  const conifer = [g(52, 78, 52), g(46, 70, 50), g(58, 84, 56)];
  const broad = month >= 10 && month <= 11 ? autumn : (month === 12 || month <= 3) ? winter : month <= 5 ? spring : summer;
  return { broad, conifer, cypress: [g(44, 64, 42), g(50, 70, 46)] };
}

export class City {
  constructor(meta, base, scene, opts) {
    this.meta = meta; this.base = base; this.scene = scene; this.opts = opts;
    this.group = new THREE.Group();
    this.treeGroup = new THREE.Group();
    scene.add(this.group, this.treeGroup);
    const [RE0, RN0] = meta.root, BT = meta.bt, [OE, ON] = meta.origin;
    const tile = key => { const [i, j] = key.split('_').map(Number); return { key, i, j, x0: RE0 + i * BT - OE, zN: ON - (RN0 + (j + 1) * BT), cx: RE0 + (i + 0.5) * BT - OE, cz: ON - (RN0 + (j + 0.5) * BT) }; };
    this.btiles = Object.entries(meta.buildings).map(([k, v], idx) => Object.assign(tile(k), { idx, tris: v[0], bytes: v[1], state: 0, lodTris: 0 }));
    this.bByKey = new Map(this.btiles.map(t => [t.key, t]));
    // far blocks: one mesh; tiles shown in full are hidden in it through a small mask texture
    this.hidden = new Uint8Array(256);
    this.hiddenTex = new THREE.DataTexture(this.hidden, 256, 1, THREE.RedFormat, THREE.UnsignedByteType);
    this.hiddenTex.needsUpdate = true;
    this.lodMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, color: 0xd6d6d6, side: THREE.DoubleSide });
    const hiddenTex = this.hiddenTex;
    this.lodMat.onBeforeCompile = sh => {
      sh.uniforms.uHidden = { value: hiddenTex };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float tid;\nuniform sampler2D uHidden;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nif (texelFetch(uHidden, ivec2(int(tid + 0.5), 0), 0).r > 0.5) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);');
    };
    this.lodState = 0;
    this.vtiles = Object.entries(meta.trees).map(([k, v]) => Object.assign(tile(k), { n: v, state: 0 }));
    this.wtiles = new Map(this.btiles.map(t => [t.key, Object.assign({}, t, { state: 0 })]));
    this.queue = new JobQueue(4);
    // the survey's triangles are not consistently wound (roofs face down): draw both sides, light with the flat (screen-space) normal
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, color: 0xd6d6d6, side: THREE.DoubleSide });
    this.treeMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.treeGeo = { broad: treeGeometry('broad'), conifer: treeGeometry('conifer'), cypress: treeGeometry('cypress') };
    const month = +new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Zurich', month: 'numeric' }).format(new Date());
    this.pal = palettes(month);
    this.tris = 0;
    this.detailDist = opts.mobile ? 1200 : 2200;      // full survey geometry within this distance, simple blocks beyond
    this.treeDist = opts.mobile ? 900 : 1600;
  }
  // bridges (OpenStreetMap decks, heights between the abutments): drawn like buildings, and walkable
  async loadBridges() {
    if (this.bridgeState || !this.meta.bridges) return;
    this.bridgeState = 1;
    const [mb, db] = await Promise.all([fetchBin(`${this.base}b/bridges.bin`), fetchBin(`${this.base}b/decks.bin`)]);
    const m = new THREE.Mesh(decodeBuildings(mb, this.meta.qs), this.mat);
    m.castShadow = m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    this.group.add(m);
    this.bridgeMesh = m;
    const n = new DataView(db).getUint32(0, true), rd = new VarReader(new Uint8Array(db), 4);
    this.decks = [];
    this.deckGrid = new Map();
    for (let i = 0; i < n; i++) {
      const kind = rd.next(), half = rd.next() / 10, np = rd.next();
      const P = new Float32Array(np * 3);
      let x = 0, z = 0, y = 0;
      for (let k = 0; k < np; k++) { x += rd.zz(); z += rd.zz(); y += rd.zz(); P[k * 3] = x / 10; P[k * 3 + 1] = y / 100; P[k * 3 + 2] = z / 10; }
      this.decks.push({ kind, half, P });
      for (let k = 0; k < np - 1; k++) {
        const x0 = Math.min(P[k * 3], P[k * 3 + 3]) - half, x1 = Math.max(P[k * 3], P[k * 3 + 3]) + half;
        const z0 = Math.min(P[k * 3 + 2], P[k * 3 + 5]) - half, z1 = Math.max(P[k * 3 + 2], P[k * 3 + 5]) + half;
        for (let gx = Math.floor(x0 / 20); gx <= Math.floor(x1 / 20); gx++) for (let gz = Math.floor(z0 / 20); gz <= Math.floor(z1 / 20); gz++) {
          const key = gx * 100000 + gz;
          if (!this.deckGrid.has(key)) this.deckGrid.set(key, []);
          this.deckGrid.get(key).push(i, k);
        }
      }
    }
    this.bridgeState = 2;
  }
  // height of a bridge deck at (x, z), or null (the highest one if decks cross)
  deckAt(x, z) {
    if (!this.deckGrid) return null;
    const list = this.deckGrid.get(Math.floor(x / 20) * 100000 + Math.floor(z / 20));
    if (!list) return null;
    let best = null;
    for (let q = 0; q < list.length; q += 2) {
      const d = this.decks[list[q]], k = list[q + 1], P = d.P;
      const ax = P[k * 3], az = P[k * 3 + 2], bx = P[k * 3 + 3], bz = P[k * 3 + 5];
      const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz || 1e-9;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / L2));
      if (Math.hypot(ax + vx * t - x, az + vz * t - z) > d.half + 0.2) continue;
      const y = P[k * 3 + 1] + (P[k * 3 + 4] - P[k * 3 + 1]) * t;
      if (best === null || y > best) best = y;
    }
    return best;
  }
  update(cam, focus, walking, moving = false) {
    const q = this.queue;
    if (!this.bridgeState) q.request('bridges', 0.3, () => this.loadBridges());
    // buildings: simple blocks everywhere (small), the full survey geometry near the camera
    let tris = 0;
    const lift = Math.max(0, cam.y - Math.max(focus.y, 200) - 100);
    if (this.lodState === 0) q.request('lod', 0.1, () => this.loadLod());
    let changed = false;
    for (const t of this.btiles) {
      const d = Math.hypot(t.cx - cam.x, t.cz - cam.z, lift), df = Math.hypot(t.cx - focus.x, t.cz - focus.z);
      const near = (walking ? Math.min(d, df) : d) - 362;
      if (t.state === 0 && !moving && near < this.detailDist + 200) q.request('b' + t.key, near / 1000, () => this.loadB(t));
      const full = !!t.mesh && (near < this.detailDist || this.lodState !== 2);
      if (t.mesh) t.mesh.visible = full;
      const h = full ? 255 : 0;
      if (this.hidden[t.idx] !== h) { this.hidden[t.idx] = h; changed = true; }
      tris += full ? t.tris : t.lodTris;
    }
    if (changed) this.hiddenTex.needsUpdate = true;
    this.tris = tris;
    // trees: near the camera only, thinned with distance (instances are sorted by a random seed)
    const R = walking ? this.treeDist * 0.7 : this.treeDist;
    for (const t of this.vtiles) {
      const d = Math.max(0, Math.hypot(t.cx - cam.x, t.cz - cam.z) - 362);
      const dg = Math.max(0, Math.hypot(t.cx - focus.x, t.cz - focus.z) - 362);
      const near = Math.min(d, dg);
      if (t.state === 0 && !moving && near < R * 1.2 && cam.y - focus.y < 2500) q.request('v' + t.key, 0.5 + near / 1000, () => this.loadV(t));
      if (t.meshes) {
        const f = d < R * 0.35 ? 1 : d < R ? 1 - 0.75 * (d - R * 0.35) / (R * 0.65) : 0;
        for (const m of t.meshes) { m.count = Math.floor(m.userData.n * f); m.visible = m.count > 0; }
      }
    }
    if (walking) {
      for (const t of this.wtiles.values()) {
        if (t.state === 0 && Math.hypot(t.cx - cam.x, t.cz - cam.z) < 700) q.request('w' + t.key, 0, () => this.loadW(t));
      }
    }
    q.pump();
  }
  async loadB(t) {
    if (t.state) return;
    t.state = 1;
    let buf;
    try { buf = await fetchBin(`${this.base}b/${t.key}.bin`); } catch (e) { t.state = 0; throw e; }
    const geo = decodeBuildings(buf, this.meta.qs);
    const m = new THREE.Mesh(geo, this.mat);
    m.castShadow = m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    this.group.add(m);
    t.mesh = m; t.state = 2;
  }
  async loadLod() {
    if (this.lodState) return;
    this.lodState = 1;
    let lbuf;
    try { lbuf = await fetchBin(`${this.base}b/lod.bin`); } catch (e) { this.lodState = 0; throw e; }
    const geo = decodeLodAll(lbuf, (i, j) => this.bByKey.get(`${i}_${j}`));
    const m = new THREE.Mesh(geo, this.lodMat);
    m.matrixAutoUpdate = false;
    this.group.add(m);
    this.lod = m; this.lodState = 2;
  }
  async loadV(t) {
    if (t.state) return;
    t.state = 1;
    let buf;
    try { buf = await fetchBin(`${this.base}v/${t.key}.bin`); } catch (e) { t.state = 0; throw e; }
    const dv = new DataView(buf), n = dv.getUint32(0, true);
    let o = 4;
    const X = new Uint16Array(buf.slice(o, o + 2 * n)); o += 2 * n;
    const Z = new Uint16Array(buf.slice(o, o + 2 * n)); o += 2 * n;
    const Y = new Uint16Array(buf.slice(o, o + 2 * n)); o += 2 * n;
    const u8 = new Uint8Array(buf);
    const H = u8.subarray(o, o + n); o += n;
    const K = u8.subarray(o, o + n); o += n;
    const S = u8.subarray(o, o + n);
    const groups = { broad: [], conifer: [], cypress: [] };
    for (let i = 0; i < n; i++) {
      const k = K[i];
      groups[k === 1 ? 'conifer' : k === 3 ? 'cypress' : 'broad'].push(i);
    }
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    t.meshes = [];
    for (const [kind, ids] of Object.entries(groups)) {
      if (!ids.length) continue;
      ids.sort((a, b) => S[a] - S[b]);
      const im = new THREE.InstancedMesh(this.treeGeo[kind], this.treeMat, ids.length);
      const pal = this.pal[kind];
      const c = new THREE.Color();
      ids.forEach((id, k) => {
        const h = H[id] / 4;
        const r = kind === 'broad' ? 0.24 * h + 0.9 : kind === 'conifer' ? 0.17 * h + 0.5 : 0.09 * h + 0.3;
        p.set(t.x0 + X[id] / 100, Y[id] / 10 - 0.3, t.zN + Z[id] / 100);
        q.setFromAxisAngle(up, S[id] * 0.0246);
        s.set(r, h, r);
        im.setMatrixAt(k, mtx.compose(p, q, s));
        c.copy(pal[(S[id] * 7) % pal.length]).multiplyScalar(0.9 + (S[id] % 23) / 115);
        im.setColorAt(k, c);
      });
      im.userData.n = ids.length;
      im.computeBoundingSphere();               // with all instances counted, before thinning
      im.computeBoundingBox();
      im.count = 0;
      im.castShadow = true; im.receiveShadow = false;
      im.matrixAutoUpdate = false;
      im.frustumCulled = true;
      this.treeGroup.add(im);
      t.meshes.push(im);
    }
    t.state = 2;
  }
  loadW(t) {
    if (!t.promise) t.promise = (async () => {
      t.state = 1;
      t.mask = new Uint8Array(await fetchBin(`${this.base}w/${t.key}.bin`));
      t.state = 2;
    })().catch(e => { t.state = -1; console.warn('mask', t.key, e); });
    return t.promise;
  }
  // walk masks around a point (to place the walker outside buildings)
  ensureMasks(x, z, r = 260) {
    const jobs = [];
    for (const t of this.wtiles.values()) if (Math.hypot(t.cx - x, t.cz - z) < r + 362) jobs.push(this.loadW(t));
    return Promise.all(jobs);
  }
  // is a ground point inside a building footprint? (only where the walk mask is loaded)
  blocked(x, z) {
    const [RE0, RN0] = this.meta.root, BT = this.meta.bt, [OE, ON] = this.meta.origin;
    const e = x + OE, n = ON - z;
    const i = Math.floor((e - RE0) / BT), j = Math.floor((n - RN0) / BT);
    const t = this.wtiles.get(`${i}_${j}`);
    if (!t || t.state !== 2) return false;
    const col = Math.floor(e - (RE0 + i * BT)), row = Math.floor((RN0 + (j + 1) * BT) - n);
    if (col < 0 || row < 0 || col >= BT || row >= BT) return false;
    return (t.mask[row * (BT / 8) + (col >> 3)] >> (7 - (col & 7))) & 1;
  }
  stats() {
    let loaded = 0, trees = 0, lods = 0;
    for (const t of this.btiles) { if (t.state === 2) loaded++; if (!this.hidden[t.idx]) lods++; }
    for (const t of this.vtiles) if (t.meshes) for (const m of t.meshes) trees += m.visible ? m.count : 0;
    return { bTiles: `${loaded}/${this.btiles.length}`, farTiles: lods, bTris: this.tris, trees };
  }
}
