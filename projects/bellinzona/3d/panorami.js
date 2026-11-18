// Punti panoramici: fixed cameras (eye in LV95 + metres above sea level, look-at point on the ground, horizontal field of view).
// Tower tops are the highest point of the surveyed building (swissBUILDINGS3D) + 2 m; the tower positions are the
// OpenStreetMap ways "Torre Nera" (43385290) and the Sasso Corbaro tower (986589603).
// `near` is the near clipping plane while standing there.
export const PANOS = [
  { id: 'valle', name: 'La valle dall\'alto', fov: 70,
    eye: [2725300, 1119600, 1830], at: [2722350, 1116650],
    cap: 'Vista aerea da nord-est: Bellinzona con i tre castelli e la valle del Ticino verso il Piano di Magadino.' },
  { id: 'nord', name: 'Verso nord', fov: 72,
    eye: [2722300, 1116950, 620], at: [2722390, 1119550],
    cap: 'Vista aerea sopra Castelgrande, verso nord: la città e la Riviera, la valle del Ticino che sale verso Biasca e il Gottardo.' },
  { id: 'torre-nera', name: 'Dalla Torre Nera', fov: 76, near: 1,
    eye: [2722226.8, 1116963.6, 308.6], at: [2722419, 1116708],
    cap: 'Dalla cima della Torre Nera di Castelgrande: i tetti del centro storico, la Collegiata e Montebello.' },
  { id: 'murata', name: 'La Murata', fov: 70,
    eye: [2721560, 1116860, 360], at: [2721930, 1116945],
    cap: 'Vista aerea da ovest: la Murata corre diritta fino a Castelgrande.' },
  { id: 'collegiata', name: 'Piazza Collegiata', fov: 70,
    eye: [2722150, 1116860, 345], at: [2722440, 1116808],
    cap: 'Vista aerea sopra il centro: Piazza Collegiata, la Collegiata e Montebello.' },
  { id: 'montebello', name: 'Montebello e Castelgrande', fov: 66,
    eye: [2722885, 1116642, 440], at: [2722560, 1116790],
    cap: 'Vista aerea da est: Montebello in primo piano, dietro Castelgrande.' },
  { id: 'sasso-corbaro', name: 'Da Sasso Corbaro', fov: 76, near: 1,
    eye: [2722843.8, 1116424.4, 479.7], at: [2720500, 1115800],
    cap: 'Dalla torre di Sasso Corbaro verso sud-ovest: Ravecchia in basso e la valle del Ticino verso il Piano di Magadino.' },
  { id: 'tre-castelli', name: 'I tre castelli', fov: 66,
    eye: [2721750, 1115950, 520], at: [2722560, 1116700],
    cap: 'Vista aerea da sud-ovest: Castelgrande, Montebello e Sasso Corbaro.' },
  { id: 'giubiasco', name: 'Verso Giubiasco', fov: 72,
    eye: [2722450, 1116350, 680], at: [2721300, 1114300],
    cap: 'Vista aerea: il piano del Ticino verso Giubiasco e il Piano di Magadino.' },
];

// the picture to save: the rendered view on a light mat, with the name, the place and the date underneath
export function framePicture(src, { title, sub, credits, creditsShort = credits }) {
  const w = src.width, h = src.height;
  const m = Math.round(Math.max(24, Math.min(w, h) * 0.04));
  const fs = Math.round(Math.max(18, Math.min(46, w * 0.032)));
  const l2 = Math.round(fs * 0.62), l3 = Math.round(Math.max(10, fs * 0.42));
  const band = Math.round(fs * 1.45 + l2 * 1.7 + l3 * 1.9 + m * 0.5);
  const out = document.createElement('canvas');
  out.width = w + 2 * m; out.height = h + m + band;
  const g = out.getContext('2d');
  g.fillStyle = '#f5f2ea'; g.fillRect(0, 0, out.width, out.height);
  g.drawImage(src, m, m, w, h);
  g.strokeStyle = '#00000033'; g.lineWidth = 1; g.strokeRect(m - 0.5, m - 0.5, w + 1, h + 1);
  const font = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const fit = (text, size, weight) => {         // shrink a long line to the width of the picture
    let s = size;
    do { g.font = `${weight} ${s}px ${font}`; s--; } while (g.measureText(text).width > w && s > 9);
  };
  let y = m + h + Math.round(fs * 1.35);
  g.textBaseline = 'alphabetic'; g.textAlign = 'left';
  g.fillStyle = '#1b1d22'; fit(title, fs, 700); g.fillText(title, m, y);
  y += Math.round(l2 * 1.7);
  g.fillStyle = '#4a4d55'; fit(sub, l2, 500); g.fillText(sub, m, y);
  y += Math.round(l3 * 1.9);
  g.font = `400 ${l3}px ${font}`;
  if (g.measureText(credits).width > w) credits = creditsShort;
  g.fillStyle = '#8a8c92'; fit(credits, l3, 400); g.fillText(credits, m, y);
  return out;
}
