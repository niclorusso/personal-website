// Solar position (NOAA algorithm) for a UTC instant. Returns azimuth (deg, clockwise from north) and elevation (deg).
const RAD = Math.PI / 180;

export function sunPosition(ms, lat = 46.195, lon = 9.022) {
  const jd = ms / 86400000 + 2440587.5;
  const T = (jd - 2451545.0) / 36525;
  const L0 = ((280.46646 + T * (36000.76983 + T * 0.0003032)) % 360 + 360) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C = Math.sin(M * RAD) * (1.914602 - T * (0.004817 + 0.000014 * T)) + Math.sin(2 * M * RAD) * (0.019993 - 0.000101 * T)
    + Math.sin(3 * M * RAD) * 0.000289;
  const omega = 125.04 - 1934.136 * T;
  const lambda = L0 + C - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * RAD);
  const decl = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD));
  const y = Math.tan(eps * RAD / 2) ** 2;
  const eqTime = 4 / RAD * (y * Math.sin(2 * L0 * RAD) - 2 * e * Math.sin(M * RAD) + 4 * e * y * Math.sin(M * RAD) * Math.cos(2 * L0 * RAD)
    - 0.5 * y * y * Math.sin(4 * L0 * RAD) - 1.25 * e * e * Math.sin(2 * M * RAD));
  const utcMin = (((ms % 86400000) + 86400000) % 86400000) / 60000;
  const tst = ((utcMin + eqTime + 4 * lon) % 1440 + 1440) % 1440;
  const ha = tst / 4 < 0 ? tst / 4 + 180 : tst / 4 - 180;
  const phi = lat * RAD, H = ha * RAD;
  const cosZ = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(H);
  const el = 90 - Math.acos(Math.max(-1, Math.min(1, cosZ))) / RAD;
  const az = (Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi)) / RAD + 180 + 360) % 360;
  // atmospheric refraction near the horizon (small, but it moves sunrise by minutes)
  const r = el > -0.575 ? (el > 85 ? 0 : el > 5 ? 58.1 / Math.tan(el * RAD) - 0.07 / Math.tan(el * RAD) ** 3 + 0.000086 / Math.tan(el * RAD) ** 5
    : 1735 + el * (-518.2 + el * (103.4 + el * (-12.79 + el * 0.711)))) / 3600 : -20.774 / Math.tan(el * RAD) / 3600;
  return { az, el: el + r };
}

// Wall-clock time in Bellinzona (Europe/Zurich), e.g. "14:32"
export function zurichTime(ms) {
  return new Intl.DateTimeFormat('it-CH', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
}
export function zurichDate(ms) {
  return new Intl.DateTimeFormat('it-CH', { timeZone: 'Europe/Zurich', day: 'numeric', month: 'long' }).format(new Date(ms));
}
// UTC ms of today's local midnight in Zurich + minutes
export function zurichDayStart(ms) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Zurich', hourCycle: 'h23', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  const minutes = +p.hour * 60 + +p.minute + +p.second / 60;
  return ms - minutes * 60000;
}
