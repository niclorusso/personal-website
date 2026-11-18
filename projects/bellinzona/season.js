// Seasons: the tiles are painted once, in early summer. In autumn and winter each tile is recoloured in the
// browser as it loads: leaves turn, deciduous trees go bare, snow lies above the snow line.
// Which pixels are trees comes from the render (treemask.png); how high the ground is from the terrain model (hmap.png).
// The snow line is a seasonal rule of thumb, not a measurement.

export function seasonFor(month) {                       // month 1-12
  return month === 12 || month <= 2 ? 'inverno' : month <= 5 ? 'primavera' : month <= 9 ? 'estate' : 'autunno';
}
const SNOWLINE = { inverno: 900, primavera: 1700, autunno: 2100, estate: 9999 };

function vnoise(x, y, kx, ky, km) {                          // value noise in 0..1, bilinear between lattice points
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const h = (i, j) => { const v = Math.sin(i * kx + j * ky) * km; return v - Math.floor(v); };
  const v = (h(xi, yi) * (1 - sx) + h(xi + 1, yi) * sx) * (1 - sy) + (h(xi, yi + 1) * (1 - sx) + h(xi + 1, yi + 1) * sx) * sy;
  return Math.max(0, Math.min(1, (v - 0.5) * 2.4 + 0.5));   // blending pulls values to the middle: stretch them back
}

function loadGray(url) {
  return new Promise(res => {
    const im = new Image();
    im.onload = () => {
      const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
      const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0);
      const d = x.getImageData(0, 0, im.width, im.height).data, out = new Uint8Array(im.width * im.height);
      for (let i = 0; i < out.length; i++) out[i] = d[i * 4];
      res({ w: im.width, h: im.height, d: out });
    };
    im.onerror = () => res(null);
    im.src = url;
  });
}

export class Season {
  constructor(world, name) { this.world = world; this.ready = false; this.setName(name); }
  setName(name) {
    this.name = name;
    this.active = true;                                  // even in summer: the blossom painted on some crowns is turned to leaves
    this.snow = SNOWLINE[name] ?? 9999;
  }
  async load() {
    if (!this.active) { this.ready = false; return; }
    if (!this.trees) [this.trees, this.hm] = await Promise.all([loadGray((this.world.base || '') + 'treemask.png'), loadGray((this.world.base || '') + 'hmap.png')]);
    this.ready = !!(this.trees && this.hm);
  }
  // returns a canvas with the tile recoloured (or null when there is nothing to do)
  apply(img, z, tx, ty) {
    if (!this.ready || !this.active) return null;
    const T = this.world.tile_size, span = T * Math.pow(2, this.world.native_zoom - z), bx = this.world.bounds[0][0], by = this.world.bounds[0][1];
    const c = document.createElement('canvas'); c.width = c.height = T;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, T, T);
    const im = x.getImageData(0, 0, T, T), d = im.data, tr = this.trees, hm = this.hm;
    const autumn = this.name === 'autunno', winter = this.name === 'inverno', spring = this.name === 'primavera', line = this.snow;
    const step = span / T, snow = line < 9000;
    // tree-crown coverage from the render, sampled smoothly (mask is 1/8 of native); trow, uy: the mask's row for this pixel row
    const crowns = (wx, trow, uy) => {
      const fx = (wx - bx) / 8 - 0.5, x0 = Math.max(0, Math.min(tr.w - 2, Math.floor(fx))), ux = Math.max(0, Math.min(1, fx - x0)), o = trow + x0;
      return ((tr.d[o] * (1 - ux) + tr.d[o + 1] * ux) * (1 - uy) + (tr.d[o + tr.w] * (1 - ux) + tr.d[o + tr.w + 1] * ux) * uy) / 255;
    };
    // (the crown mask and the noise are worked out only for the pixels that need them: most of a town is roofs and streets)
    for (let py = 0; py < T; py++) {
      const wy = ty * span + (py + 0.5) * step;
      const hy = Math.min(hm.h - 1, Math.max(0, ((wy - by) / 32) | 0)), hrow = hy * hm.w;
      const fy = (wy - by) / 8 - 0.5, y0 = Math.max(0, Math.min(tr.h - 2, Math.floor(fy))), uy = Math.max(0, Math.min(1, fy - y0)), trow = y0 * tr.w;
      for (let px = 0; px < T; px++) {
        const i = (py * T + px) * 4;
        if (d[i + 3] === 0) continue;
        const wx = tx * span + (px + 0.5) * step;
        let r = d[i], g = d[i + 1], b = d[i + 2];
        let green = g > r * 1.06 && g > b * 1.18 && g > 55;
        let cover = -1;
        // stable noise, smooth between its cells: patches the size of a crown and of a whole grove, without square edges
        let e = -1;
        // ornamental blossom (pink or white crowns) belongs to spring only: the rest of the year those crowns are leaves like the others
        let blossom = false;
        if (!spring) {                                       // pink blossom is told by its colour alone (bluer than any plaster or roof tile); white needs the crown mask
          const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
          blossom = r > 100 && r > g * 1.15 && b >= g * 0.99;
          if (!blossom && mn > 185 && mx - mn < 34) blossom = (cover = crowns(wx, trow, uy)) > 0.8;
          if (blossom) { const l = (0.3 * r + 0.59 * g + 0.11 * b) / 172; r = 98 * l; g = 142 * l; b = 58 * l; green = true; }
        }
        if (green) {
          if (cover < 0) cover = crowns(wx, trow, uy);
          const tree = cover > 0.5 || blossom;
          const lum = 0.3 * r + 0.59 * g + 0.11 * b, conifer = tree && lum < 78;      // dark crowns stay green
          if (autumn && tree && !conifer) {
            const a = vnoise(wx / 34, wy / 34, 12.9898, 78.233, 43758.5453);
            e = vnoise(wx / 170, wy / 170, 4.13, 9.71, 9631.77);
            const k = a * 0.6 + e * 0.4;
            if (k > 0.2) {
              const tc = k > 0.78 ? [176, 78, 44] : k > 0.5 ? [222, 128, 40] : [226, 184, 58], f = 0.82, l = lum / 135;
              r = r * (1 - f) + tc[0] * l * f; g = g * (1 - f) + tc[1] * l * f; b = b * (1 - f) + tc[2] * l * f;
            }
          } else if (autumn && !tree) {
            r = r * 0.86 + 150 * 0.14 * (lum / 130); g = g * 0.95; b = b * 0.9;        // grass a little tired
          } else if (winter && tree && !conifer) {
            const l = lum / 140, f = 0.8;
            r = r * (1 - f) + 128 * l * f; g = g * (1 - f) + 112 * l * f; b = b * (1 - f) + 100 * l * f;   // bare branches
          } else if (winter && !tree) {
            const l = lum / 140, f = 0.5;
            r = r * (1 - f) + 150 * l * f; g = g * (1 - f) + 140 * l * f; b = b * (1 - f) + 96 * l * f;    // faded grass
          }
        }
        if (snow) {
          const alt = 200 + hm.d[hrow + Math.min(hm.w - 1, Math.max(0, ((wx - bx) / 32) | 0))] * 9;
          if (alt - line + 45 > 0) {                         // the noise moves the line by 45 m at most
            if (e < 0) e = vnoise(wx / 170, wy / 170, 4.13, 9.71, 9631.77);
            const s = Math.max(0, Math.min(1, (alt - line + (e - 0.5) * 90) / 200));
            if (s > 0) { const l = 0.3 * r + 0.59 * g + 0.11 * b, w = 205 + l * 0.2, f = s * 0.86; r = r * (1 - f) + w * f; g = g * (1 - f) + w * f; b = b * (1 - f) + (w + 6) * f; }
          }
        }
        d[i] = r; d[i + 1] = g; d[i + 2] = b;
      }
    }
    x.putImageData(im, 0, 0);
    return c;
  }
}
