// Small helpers: binary fetch with gzip (files are gzip-compressed by 18_3d.py), image decoding, a fetch queue.

let bytesIn = 0;
const byKind = {};
export const stats = { get bytes() { return bytesIn; }, get byKind() { return { ...byKind }; } };
function count(url, n) {
  bytesIn += n;
  const k = (/data\/(\w)\//.exec(url) || [, 'x'])[1] + (url.includes('.lod.') ? 'L' : '');
  byKind[k] = (byKind[k] || 0) + n;
}

async function gunzip(buf) {
  if (typeof DecompressionStream === 'undefined') throw new Error('DecompressionStream non disponibile');
  const ds = new DecompressionStream('gzip');
  return await new Response(new Blob([buf]).stream().pipeThrough(ds)).arrayBuffer();
}

// one retry: a busy server (or a phone changing cell) can drop a request
async function get(url, signal) {
  try {
    const r = await fetch(url, { signal });
    if (r.ok || r.status === 404) return r;
  } catch (e) { if (signal && signal.aborted) throw e; }
  await new Promise(res => setTimeout(res, 600 + Math.random() * 600));
  return fetch(url, { signal });
}

export async function fetchBin(url, signal) {
  const r = await get(url, signal);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  const buf = new Uint8Array(await r.arrayBuffer());
  count(url, buf.byteLength);
  // the server may already have removed the gzip layer (Content-Encoding): only inflate real gzip data
  if (buf[0] === 0x1f && buf[1] === 0x8b) return await gunzip(buf);
  return buf.buffer;
}

export async function fetchImage(url, signal) {
  const r = await get(url, signal);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  const blob = await r.blob();
  count(url, blob.size);
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(blob, { imageOrientation: 'none', premultiplyAlpha: 'none', colorSpaceConversion: 'none' }); }
    catch (e) { /* older Safari: fall back to an <img> */ }
  }
  const img = new Image();
  img.src = URL.createObjectURL(blob);
  await img.decode();
  return img;
}

// Unsigned LEB128 reader
export class VarReader {
  constructor(u8, pos = 0) { this.u = u8; this.p = pos; }
  next() {
    const u = this.u; let p = this.p, v = 0, s = 0, b;
    do { b = u[p++]; v += (b & 0x7f) * 2 ** s; s += 7; } while (b & 0x80);
    this.p = p;
    return v;
  }
  zz() { const v = this.next(); return (v % 2) ? -(v + 1) / 2 : v / 2; }
}

// A priority queue of async jobs with a concurrency limit; jobs not re-requested recently are dropped.
export class JobQueue {
  constructor(limit = 6) { this.limit = limit; this.running = 0; this.pending = new Map(); }
  request(key, prio, run) {
    const j = this.pending.get(key);
    if (j) { j.prio = prio; j.t = performance.now(); return; }
    this.pending.set(key, { key, prio, run, t: performance.now() });
  }
  pump() {
    if (this.running >= this.limit || !this.pending.size) return;
    const now = performance.now();
    const list = [...this.pending.values()].filter(j => {
      if (now - j.t > 2500) { this.pending.delete(j.key); return false; }
      return true;
    }).sort((a, b) => a.prio - b.prio);
    for (const j of list) {
      if (this.running >= this.limit) break;
      this.pending.delete(j.key);
      this.running++;
      Promise.resolve().then(j.run).catch(e => console.warn('load', j.key, e.message || e)).finally(() => { this.running--; });
    }
  }
  get size() { return this.pending.size + this.running; }
}

export const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
