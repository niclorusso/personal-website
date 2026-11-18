// Bellinzona 3D: real relief (swissALTI3D), orthophoto (SWISSIMAGE), buildings (swissBUILDINGS3D), trees.
// Two ways to move: fly (orbit around a point on the ground) and walk (eye level, terrain following).
import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { Terrain } from './terrain.js';
import { City } from './city.js';
import { sunPosition, zurichTime, zurichDate, zurichDayStart } from './sun.js';
import { stats, isTouch, clamp, lerp } from './util.js';
import { PANOS, framePicture } from './panorami.js';

const BASE = '3d/data/';
const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const RAD = Math.PI / 180;
const EYE = 1.65;

function fail(msg) {
  $('loading').hidden = false;
  $('loading').innerHTML = msg;
}

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  fail('Il tuo browser non supporta WebGL: la vista 3D non è disponibile.<br><a href="./">Torna alla mappa</a>');
  throw e;
}
const mobile = params.has('mobile') || isTouch || Math.min(innerWidth, innerHeight) < 600;
let pixelRatio = Math.min(devicePixelRatio || 1, mobile ? 1.5 : 2);
renderer.setPixelRatio(pixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const meta = await (await fetch(BASE + 'meta.json')).json();
const places = await fetch('places.json').then(r => r.json()).then(d => d.places || []).catch(() => []);
const [OE, ON] = meta.origin;
const W = (e, n, h = 0) => new THREE.Vector3(e - OE, h, ON - n);
const LV = v => [v.x + OE, ON - v.z];

// ---------------------------------------------------------------------------------------------- scene
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(mobile ? 60 : 50, innerWidth / innerHeight, 1, 70000);
camera.rotation.order = 'YXZ';
scene.fog = new THREE.FogExp2(0xc9d6e0, 0.000052);

const sky = new THREE.Mesh(new THREE.SphereGeometry(5000, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
  uniforms: { uZenith: { value: new THREE.Vector3() }, uHorizon: { value: new THREE.Vector3() }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Vector3() } },
  vertexShader: `varying vec3 vDir;
    void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `varying vec3 vDir; uniform vec3 uZenith, uHorizon, uSun, uSunCol;
    void main(){
      vec3 d = normalize(vDir);
      float h = clamp(d.y, 0.0, 1.0);
      vec3 c = mix(uHorizon, uZenith, pow(h, 0.55));
      if (d.y < 0.0) c = uHorizon * (1.0 + d.y * 0.25);
      float s = max(dot(d, uSun), 0.0);
      c += uSunCol * (pow(s, 900.0) * 3.0 + pow(s, 14.0) * 0.22);
      gl_FragColor = vec4(c, 1.0);
    }`,
}));
sky.renderOrder = -1000;
sky.frustumCulled = false;
scene.add(sky);

const hemi = new THREE.HemisphereLight(0xdfe8f2, 0x8a8170, 2);
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.castShadow = true;
sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.4;
if ('intensity' in sun.shadow) sun.shadow.intensity = 0.72;     // shade is never black: sky light fills it
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 8000;
scene.add(hemi, sun, sun.target);
let shadowsOn = !mobile && !params.has('noshadow');

const terrain = new Terrain(meta, BASE, renderer);
terrain.loadOuter().catch(e => console.warn('horizon', e));
if (mobile) terrain.tau = 2.6;            // phones: a texel may cover ~2 css px (pixel ratio 1.5)
scene.add(terrain.group);
const city = new City(meta, BASE, scene, { mobile });

// ---------------------------------------------------------------------------------------------- sun and sky
let timeMode = 'live', timeMs = Date.now();
const sunDir = new THREE.Vector3();
function mixc(a, b, t) { return a.map((v, i) => v + (b[i] - v) * t); }
function updateSun() {
  if (timeMode === 'live') timeMs = Date.now();
  const { az, el } = sunPosition(timeMs);
  sunDir.set(Math.sin(az * RAD) * Math.cos(el * RAD), Math.sin(el * RAD), -Math.cos(az * RAD) * Math.cos(el * RAD));
  // day factor: 0 at night (sun 8 deg below the horizon), 1 from 12 deg up
  const day = clamp((el + 8) / 20, 0, 1), low = 1 - clamp((el - 2) / 22, 0, 1);
  const zen = mixc([0.05, 0.07, 0.14], [0.42, 0.62, 0.86], day);
  const hor = mixc(mixc([0.10, 0.12, 0.20], [0.80, 0.86, 0.90], day), [0.95, 0.72, 0.52], day * low * 0.55);
  sky.material.uniforms.uZenith.value.set(...zen);
  sky.material.uniforms.uHorizon.value.set(...hor);
  sky.material.uniforms.uSun.value.copy(sunDir);
  sky.material.uniforms.uSunCol.value.set(...mixc([1, 0.95, 0.85], [1, 0.6, 0.3], low).map(v => v * clamp((el + 3) / 6, 0, 1)));
  scene.fog.color.setRGB(hor[0], hor[1], hor[2], THREE.SRGBColorSpace);
  const sunUp = clamp((el + 1) / 8, 0, 1);
  sun.intensity = Math.PI * 0.78 * sunUp;
  sun.color.setRGB(...mixc([1, 0.97, 0.92], [1, 0.72, 0.48], low), THREE.SRGBColorSpace);
  hemi.intensity = Math.PI * lerp(0.24, 0.66, day);
  hemi.color.setRGB(...mixc([0.45, 0.55, 0.85], [0.97, 0.98, 1.0], day), THREE.SRGBColorSpace);
  sun.castShadow = shadowsOn && el > 1;
  renderer.shadowMap.enabled = shadowsOn;
  const t = zurichTime(timeMs);
  $('sunlbl').textContent = `${timeMode === 'live' ? 'Ora' : 'Simulato'}: ${t} · sole ${el > 0 ? `alto ${Math.round(el)}°` : 'sotto l\'orizzonte'}`;
  $('tlbl').textContent = `${zurichDate(timeMs)}, ${t}`;
  dirty = true;
}

// ---------------------------------------------------------------------------------------------- controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.12;
controls.screenSpacePanning = false;
controls.zoomToCursor = true;
controls.minDistance = 20;
controls.maxDistance = 14000;
controls.maxPolarAngle = 88 * RAD;
controls.rotateSpeed = mobile ? 0.55 : 0.45;
controls.zoomSpeed = 1.1;
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

let mode = 'fly';
const walk = { x: 0, z: 0, y: 0, yaw: 0, pitch: -0.05, keys: new Set(), joy: { x: 0, y: 0, on: false }, look: null };
let anim = null, dirty = true, lastInteraction = performance.now();
const focus = new THREE.Vector3();
// punti panoramici: which one is shown (i), whether the user has moved away from it, the tour, the panorama's field of view
const pano = { i: -1, moved: false, tour: null, seq: 0, jump: 0 };
let fovH = null;
const panoFixed = () => pano.i >= 0 && !pano.moved;
// vertical field of view: the normal one, or the one that gives a panorama its horizontal angle (within limits on tall screens)
function wantFov() {
  const a = innerWidth / innerHeight;
  if (!fovH) return a < 1 ? 62 : 50;
  return clamp(2 * Math.atan(Math.tan(fovH * RAD / 2) / a) / RAD, 30, 78);
}

function viewDir(heading, pitch) {
  return new THREE.Vector3(Math.sin(heading * RAD) * Math.cos(pitch * RAD), -Math.sin(pitch * RAD), -Math.cos(heading * RAD) * Math.cos(pitch * RAD));
}
function groundY(x, z, fallback = 230) { const h = terrain.heightAt(x, z); return h === null ? fallback : h; }

// fly the camera to look at `target` from heading/pitch/distance
function flyTo(target, heading, pitch, dist, ms = 2200) {
  const dir = viewDir(heading, pitch);
  const camEnd = target.clone().addScaledVector(dir, -dist);
  const gh = terrain.heightAt(camEnd.x, camEnd.z);
  if (gh !== null && camEnd.y < gh + 25) camEnd.y = gh + 25;
  markMoved();
  fovH = null;
  startAnim(camEnd, target.clone(), ms, 'fly');
}
// the field of view eases to the one wanted at the end (a panorama's own, or the normal one)
function startAnim(camEnd, tgtEnd, ms, endMode) {
  const camStart = camera.position.clone(), tgtStart = mode === 'walk' ? walkLookPoint() : controls.target.clone();
  const hop = Math.min(1500, camStart.distanceTo(camEnd) * 0.25);
  controls.enabled = false;
  anim = { t0: performance.now(), ms, camStart, camEnd, tgtStart, tgtEnd, hop, endMode, fov0: camera.fov, fov1: wantFov() };
}
function stepAnim(now) {
  const a = anim;
  let t = clamp((now - a.t0) / a.ms, 0, 1);
  const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
  camera.position.lerpVectors(a.camStart, a.camEnd, e);
  camera.position.y += Math.sin(Math.PI * e) * a.hop;
  const tg = new THREE.Vector3().lerpVectors(a.tgtStart, a.tgtEnd, e);
  camera.lookAt(tg);
  if (a.fov0 !== a.fov1) { camera.fov = lerp(a.fov0, a.fov1, e); camera.updateProjectionMatrix(); }
  if (t >= 1) {
    anim = null;
    if (a.endMode === 'walk') {
      setMode('walk', true);
    } else {
      controls.target.copy(a.tgtEnd);
      controls.enabled = mode === 'fly';
      controls.update();
    }
    writeHash();
  }
  dirty = true;
}

function walkForward() { return new THREE.Vector3(-Math.sin(walk.yaw), 0, -Math.cos(walk.yaw)); }
function walkLookPoint() {
  const f = walkForward();
  return new THREE.Vector3(walk.x + f.x * 50 * Math.cos(walk.pitch), walk.y + Math.sin(walk.pitch) * 50, walk.z + f.z * 50 * Math.cos(walk.pitch));
}
function freeSpot(x, z) {
  if (!city.blocked(x, z)) return [x, z];
  for (let r = 1.5; r < 80; r += 1.5) for (let a = 0; a < 16; a++) {
    const px = x + Math.cos(a / 16 * Math.PI * 2) * r, pz = z + Math.sin(a / 16 * Math.PI * 2) * r;
    if (!city.blocked(px, pz)) return [px, pz];
  }
  return [x, z];
}
// how open a spot is: share of nearby points that are neither inside a building nor a step up or down
function openness(x, z) {
  const h0 = terrain.heightAt(x, z);
  if (h0 === null || city.blocked(x, z)) return 0;
  let ok = 0, n = 0;
  for (const r of [2, 4, 7]) for (let a = 0; a < 12; a++) {
    const px = x + Math.cos(a / 12 * Math.PI * 2) * r, pz = z + Math.sin(a / 12 * Math.PI * 2) * r;
    const h = terrain.heightAt(px, pz);
    n++;
    if (!city.blocked(px, pz) && h !== null && Math.abs(h - h0) < r * 0.5) ok++;
  }
  return ok / n;
}
// a good place to stand to see a point: the point itself if it is open ground (a square), otherwise an
// open spot 20-80 m away at about the same height with a clear line of sight; returns [x, z, moved]
function clearLine(x0, z0, x1, z1) {
  const d = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(Math.max(0, d - 14) / 1.5);
  const eye = (terrain.heightAt(x0, z0) ?? 0) + EYE, top = (terrain.heightAt(x1, z1) ?? 0) + 8;
  for (let i = 1; i <= n; i++) {
    const t = (i * 1.5) / d, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
    if (city.blocked(x, z)) return false;
    const h = terrain.heightAt(x, z);
    if (h !== null && h > eye + (top - eye) * t - 0.3) return false;       // a rise of the ground hides it
  }
  return true;
}
function standingSpot(x, z, pref = 32) {
  if (openness(x, z) >= 0.8) return [x, z, false];
  const h0 = terrain.heightAt(x, z) ?? 0;
  let best = null, bestS = -1;
  for (const r of [12, 20, 28, 36, 46, 60, 80]) for (let a = 0; a < 24; a++) {
    const px = x + Math.cos(a / 24 * Math.PI * 2) * r, pz = z + Math.sin(a / 24 * Math.PI * 2) * r;
    const h = terrain.heightAt(px, pz);
    if (h === null || Math.abs(h - h0) > 14) continue;
    const o = openness(px, pz);
    if (o < 0.45) continue;
    const sc = o + (clearLine(px, pz, x, z) ? 0.8 : 0) - Math.abs(r - pref) / 110 - Math.max(0, h0 - h) / 12;   // rather level with it than below
    if (sc > bestS) { bestS = sc; best = [px, pz]; }
  }
  if (!best) { const [fx, fz] = freeSpot(x, z); return [fx, fz, true]; }
  return [best[0], best[1], true];
}
// walk from a ground point, facing heading (deg); first make sure it is not inside a building
async function walkAt(p, heading, facePoint = false, pref = 32, ms = 2000) {
  mode = 'walking-in';
  await city.ensureMasks(p.x, p.z);
  for (let i = 0; i < 40 && terrain.heightAt(p.x, p.z) === null; i++) await new Promise(r => setTimeout(r, 100));
  const [x, z, moved] = standingSpot(p.x, p.z, pref);
  let pitch = -0.04;
  if (moved && facePoint) {                                            // look at the place, up or down to it
    heading = (Math.atan2(p.x - x, -(p.z - z)) / RAD + 360) % 360;
    const d = Math.hypot(p.x - x, p.z - z), up = (groundY(p.x, p.z) + 6) - (groundY(x, z) + EYE);
    pitch = clamp(Math.atan2(up, d), -0.35, 0.45);
  }
  p.x = x; p.z = z;
  walk.x = p.x; walk.z = p.z;
  walk.yaw = -heading * RAD;
  walk.pitch = pitch;
  const deck = city.deckAt(p.x, p.z);                                  // standing on a bridge, not under it
  walk.y = (deck !== null && deck > groundY(p.x, p.z, p.y) - 0.3 ? deck : groundY(p.x, p.z, p.y)) + EYE;
  const end = new THREE.Vector3(walk.x, walk.y, walk.z);
  startAnim(end, walkLookPoint(), ms, 'walk');
}
function headingOfCamera() {
  const d = new THREE.Vector3();
  camera.getWorldDirection(d);
  return (Math.atan2(d.x, -d.z) / RAD + 360) % 360;
}
function setMode(m, arrived = false) {
  if (m === 'walk') {
    if (!arrived) { leavePano(); walkAt(controls.target.clone(), headingOfCamera()); return; }
    mode = 'walk';
    controls.enabled = false;
    camera.near = 0.3; camera.updateProjectionMatrix();
    const [x, z] = freeSpot(walk.x, walk.z);
    walk.x = x; walk.z = z;
  } else {
    const f = walkForward();
    if (mode === 'walk') {
      const tgt = new THREE.Vector3(walk.x + f.x * 40, 0, walk.z + f.z * 40);
      tgt.y = groundY(tgt.x, tgt.z);
      flyTo(tgt, -walk.yaw / RAD, 35, 260, 1400);      // starts from the walker's view
    }
    mode = 'fly';
  }
  document.body.classList.toggle('walking', mode === 'walk');
  $('mode').innerHTML = mode === 'walk' ? '✈️<span> Vola</span>' : '🚶<span> Cammina</span>';
  $('mode').title = mode === 'walk' ? 'Torna in volo' : 'Cammina a terra';
  showHint();
  dirty = true;
}

// walking input
addEventListener('keydown', e => {
  if (e.target.closest && e.target.closest('input, select, textarea')) return;
  const k = e.key.toLowerCase();
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift', 'q', 'e'].includes(k)) {
    walk.keys.add(k);
    if (mode === 'fly' && /^(w|a|s|d|arrow)/.test(k)) markMoved();   // WASD / arrows in flight (moved in the loop)
    if (k.startsWith('arrow') || k === ' ') e.preventDefault();
  }
  if (k === 'escape') closeAll();
});
addEventListener('keyup', e => walk.keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => walk.keys.clear());

const cv = renderer.domElement;
cv.addEventListener('pointerdown', e => {
  lastInteraction = performance.now();
  closePanels();
  if (anim && mode !== 'walking-in') { anim = null; markMoved(); controls.enabled = mode === 'fly'; controls.target.copy(focusFromCamera()); }
  if (mode !== 'walk') return;
  walk.look = { id: e.pointerId, x: e.clientX, y: e.clientY };
  cv.setPointerCapture(e.pointerId);
});
cv.addEventListener('pointermove', e => {
  if (mode !== 'walk' || !walk.look || walk.look.id !== e.pointerId) return;
  const s = mobile ? 0.006 : 0.004;
  // "grab" the view, as in the orbit mode and in street-level photo viewers
  walk.yaw += (e.clientX - walk.look.x) * s;
  walk.pitch = clamp(walk.pitch + (e.clientY - walk.look.y) * s, -1.35, 1.35);
  walk.look.x = e.clientX; walk.look.y = e.clientY;
  dirty = true;
});
const endLook = e => { if (walk.look && walk.look.id === e.pointerId) walk.look = null; };
cv.addEventListener('pointerup', endLook);
cv.addEventListener('pointercancel', endLook);
cv.addEventListener('wheel', () => { lastInteraction = performance.now(); markMoved(); if (anim) { anim = null; controls.enabled = mode === 'fly'; } }, { passive: true });
cv.addEventListener('dblclick', e => {
  if (mode !== 'fly') return;
  const p = pickGround(e.clientX, e.clientY);
  if (p) flyTo(p, headingOfCamera(), Math.max(25, pitchOfCamera()), Math.max(120, camera.position.distanceTo(controls.target) * 0.45), 1200);
});
function pitchOfCamera() { const d = new THREE.Vector3(); camera.getWorldDirection(d); return -Math.asin(d.y) / RAD; }
function pickGround(cx, cy) {
  const r = cv.getBoundingClientRect();
  const ndc = new THREE.Vector2((cx - r.left) / r.width * 2 - 1, -(cy - r.top) / r.height * 2 + 1);
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, camera);
  const d = terrain.raycast(ray.ray.origin, ray.ray.direction);
  return d === null ? null : ray.ray.origin.clone().addScaledVector(ray.ray.direction, d);
}
function focusFromCamera() {
  const d = new THREE.Vector3(); camera.getWorldDirection(d);
  const hit = terrain.raycast(camera.position, d, 30000);
  return hit === null ? camera.position.clone().addScaledVector(d, 500) : camera.position.clone().addScaledVector(d, hit);
}

// on-screen joystick
{
  const joy = $('joy'), knob = $('knob');
  let id = null, cx = 0, cy = 0;
  const R = 46;
  joy.addEventListener('pointerdown', e => {
    id = e.pointerId; joy.setPointerCapture(id);
    const r = joy.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2;
    move(e); e.preventDefault();
  });
  const move = e => {
    if (e.pointerId !== id) return;
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const l = Math.hypot(dx, dy);
    if (l > R) { dx *= R / l; dy *= R / l; }
    walk.joy.x = dx / R; walk.joy.y = dy / R; walk.joy.on = true;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  };
  joy.addEventListener('pointermove', move);
  const up = e => { if (e.pointerId !== id) return; id = null; walk.joy.x = walk.joy.y = 0; walk.joy.on = false; knob.style.transform = ''; };
  joy.addEventListener('pointerup', up);
  joy.addEventListener('pointercancel', up);
}

function stepWalk(dt) {
  const k = walk.keys;
  let fwd = 0, side = 0, turn = 0;
  if (k.has('w') || k.has('arrowup')) fwd += 1;
  if (k.has('s') || k.has('arrowdown')) fwd -= 1;
  if (k.has('d')) side += 1;
  if (k.has('a')) side -= 1;
  if (k.has('arrowleft') || k.has('q')) turn += 1;
  if (k.has('arrowright') || k.has('e')) turn -= 1;
  if (walk.joy.on) { fwd -= walk.joy.y; side += walk.joy.x; }
  walk.yaw += turn * dt * 1.6;
  const mag = Math.min(1, Math.hypot(fwd, side));
  if (mag > 0.02) {
    const speed = (k.has('shift') ? 12 : 4.2) * (walk.joy.on ? 0.4 + 1.3 * mag * mag : 1);
    const f = walkForward(), r = new THREE.Vector3(-f.z, 0, f.x);
    const n = Math.hypot(fwd, side);
    const dx = (f.x * fwd + r.x * side) / n * speed * dt * Math.min(1, mag / 1), dz = (f.z * fwd + r.z * side) / n * speed * dt * Math.min(1, mag / 1);
    const feet = walk.y - EYE;
    const h0 = walkGround(walk.x, walk.z, feet);
    const onDeck = h0 > (terrain.heightAt(walk.x, walk.z) ?? h0) + 1.2;
    const ok = (x, z) => {
      if (city.blocked(x, z)) return false;
      const h1 = walkGround(x, z, h0);
      if (h1 === null) return false;
      if (onDeck && h1 < h0 - 1.2) return false;                           // the parapet: no stepping off a bridge
      return h1 - h0 < Math.hypot(x - walk.x, z - walk.z) * 1.2 + 0.08;      // no climbing cliffs or walls of rock
    };
    if (ok(walk.x + dx, walk.z + dz)) { walk.x += dx; walk.z += dz; }
    else if (ok(walk.x + dx, walk.z)) walk.x += dx;
    else if (ok(walk.x, walk.z + dz)) walk.z += dz;
    // stay inside the detailed area
    const a = meta.aoi;
    walk.x = clamp(walk.x, a[0] - OE + 5, a[2] - OE - 5);
    walk.z = clamp(walk.z, ON - a[3] + 5, ON - a[1] - 5);
  }
  const gy = (walkGround(walk.x, walk.z, walk.y - EYE) ?? walk.y - EYE) + EYE;
  walk.y = Math.abs(gy - walk.y) > 6 ? gy : lerp(walk.y, gy, 1 - Math.exp(-dt * 10));
  camera.position.set(walk.x, walk.y, walk.z);
  camera.rotation.set(walk.pitch, walk.yaw, 0, 'YXZ');
  if (mag > 0.02 || turn) dirty = true;
}

// what the walker stands on: a bridge deck if there is one at about the height of the feet, else the ground
function walkGround(x, z, feet) {
  const g = terrain.heightAt(x, z);
  if (g === null) return null;
  const d = city.deckAt(x, z);
  return d !== null && d > g - 0.3 && Math.abs(d - feet) < 1.4 ? d : g;
}

// keep the orbit point on the ground and the camera above it
function stepFly(dt) {
  const k = walk.keys;
  if (k.size && !anim) {     // WASD / arrows: glide over the map
    const d = camera.position.distanceTo(controls.target);
    const f = new THREE.Vector3(); camera.getWorldDirection(f); f.y = 0; f.normalize();
    const r = new THREE.Vector3(-f.z, 0, f.x);
    const v = new THREE.Vector3();
    if (k.has('w') || k.has('arrowup')) v.add(f);
    if (k.has('s') || k.has('arrowdown')) v.sub(f);
    if (k.has('d') || k.has('arrowright')) v.add(r);
    if (k.has('a') || k.has('arrowleft')) v.sub(r);
    if (v.lengthSq()) { v.normalize().multiplyScalar(d * 0.6 * dt * (k.has('shift') ? 3 : 1)); controls.target.add(v); camera.position.add(v); dirty = true; }
  }
  const changed = controls.update();
  if (changed) dirty = true;
  const t = controls.target;
  const lim = 6500;
  t.x = clamp(t.x, -lim - 600, lim - 600); t.z = clamp(t.z, -lim, lim);
  const th = terrain.heightAt(t.x, t.z);
  if (th !== null && Math.abs(th - t.y) > 0.05) {
    const dy = (th - t.y) * Math.min(1, dt * 4);
    t.y += dy;
    if (!panoFixed()) camera.position.y += dy;
    dirty = true;
  }
  const ch = terrain.heightAt(camera.position.x, camera.position.z);
  const clear = 12;
  if (ch !== null && camera.position.y < ch + clear) { camera.position.y = ch + clear; dirty = true; }
  if (camera.position.y > 9000) camera.position.y = 9000;
}

// ---------------------------------------------------------------------------------------------- labels and cards
const PLACES = places.filter(p => Number.isFinite(p.e) && Number.isFinite(p.n));
// minor places (playgrounds, the public pool) get no label; they are still reachable with ?p=<id>
const LABELLED = PLACES.filter(p => !p.minor);
const labelBox = $('labels');
for (const p of LABELLED) {
  const lift = p.cat === 'castelli' ? (p.tier === 1 ? 34 : 14) : p.cat === 'chiese' ? 20 : 10;
  p.pos = W(p.e, p.n, (p.h || 230) + lift);
  p.el = document.createElement('button');
  p.el.className = `lb t${p.tier || 2} ${p.cat || ''}`;
  p.el.textContent = p.name.length > 34 ? p.name.replace(/^Chiesa (dei|di|della|del) /, '') : p.name;
  p.el.type = 'button';
  p.el.addEventListener('click', e => { e.stopPropagation(); openCard(p); });
  p.el.hidden = true;
  p.vis = true;
  labelBox.appendChild(p.el);
}
const v3 = new THREE.Vector3();
const MAIN = new Set(['castelgrande', 'montebello', 'sasso-corbaro']);
let lastOcc = 0;
function updateLabels(now) {
  const walking = mode === 'walk';
  const W_ = innerWidth, H_ = innerHeight;
  const occ = now - lastOcc > 350;
  if (occ) lastOcc = now;
  const cand = [];
  for (const p of LABELLED) {
    const d = camera.position.distanceTo(p.pos);
    const maxD = walking ? (p.tier === 1 ? 2500 : 700) : (p.tier === 1 ? 9000 : (p.cat === 'castelli' || p.cat === 'gite' ? 3500 : 1800));
    v3.copy(p.pos).project(camera);
    if (d > maxD || v3.z > 1 || Math.abs(v3.x) > 1.1 || Math.abs(v3.y) > 1.1) { p.el.hidden = true; continue; }
    if (occ) {
      const dir = p.pos.clone().sub(camera.position).normalize();
      const hit = terrain.raycast(camera.position, dir, d - 15);
      p.vis = hit === null;
    }
    if (!p.vis) { p.el.hidden = true; continue; }
    cand.push({ p, d, x: (v3.x + 1) / 2 * W_, y: (1 - v3.y) / 2 * H_ });
  }
  const rank = p => (MAIN.has(p.id) ? [...MAIN].indexOf(p.id) * 0.1 : p.tier === 1 ? 1 : 2);
  cand.sort((a, b) => rank(a.p) - rank(b.p) || a.d - b.d);
  const boxes = [];
  const hit = b => boxes.some(o => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);
  for (const c of cand) {
    const w = c.p.el.offsetWidth || 90, h = 26;
    let lead = 0, b = [c.x - w / 2 - 3, c.y - h - 3, c.x + w / 2 + 3, c.y + 3];
    if (hit(b)) {
      if (!MAIN.has(c.p.id)) { c.p.el.hidden = true; continue; }
      // the three castles always show: stack the label higher, on a thin leader line
      while (hit(b) && lead < 200) { lead += 8; b = [b[0], c.y - lead - h - 3, b[2], c.y - lead + 3]; }
    }
    boxes.push(b);
    c.p.el.hidden = false;
    c.p.el.style.setProperty('--lead', lead + 'px');
    c.p.el.classList.toggle('led', lead > 0);
    c.p.el.style.transform = `translate(${c.x.toFixed(1)}px, ${(c.y - lead).toFixed(1)}px) translate(-50%, -100%)`;
  }
}

let cardPlace = null;
function openCard(p) {
  cardPlace = p;
  closePanels();
  leavePano();
  const c = $('card');
  const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const short = s => { s = String(s || ''); const parts = s.split(/(?<=\.)\s+/); let out = ''; for (const x of parts) { if ((out + x).length > 320 && out) break; out += (out ? ' ' : '') + x; } return out.replace(/[;,]\s*$/, '.'); };
  c.innerHTML = `<button class="x" aria-label="Chiudi">×</button>
    <h2>${esc(p.name)}</h2>
    <div class="meta">${esc([p.type, p.period].filter(Boolean).join(' · '))}</div>
    <p>${esc(short(p.desc))}</p>
    ${p.visit && p.visit.text ? `<p class="visit">${esc(short(p.visit.text))}</p>` : ''}
    <div class="row"><button data-a="fly">Vola qui</button><button data-a="walk">🚶 Cammina qui</button>
    ${p.source && p.source.url ? `<a href="${esc(p.source.url)}" target="_blank" rel="noopener">${esc(p.source.label || 'Fonte')}</a>` : ''}</div>`;
  c.hidden = false;
  c.querySelector('.x').onclick = () => { c.hidden = true; cardPlace = null; };
  c.querySelector('[data-a=fly]').onclick = () => { goPlace(p); };
  c.querySelector('[data-a=walk]').onclick = () => { c.hidden = true; walkToPlace(p); };
}
// best-looking viewpoints for the shortcuts (heading = direction the camera looks)
const VIEWS = {
  'castelgrande': { h: 20, p: 28, d: 520 },
  'montebello': { h: 80, p: 27, d: 430 },
  'sasso-corbaro': { h: 95, p: 24, d: 520 },
  'piazza-collegiata': { h: 95, p: 30, d: 220 },
  'collegiata': { h: 95, p: 30, d: 220 },
  'stazione': { h: 60, p: 32, d: 380 },
};
function placeById(id) { return PLACES.find(p => p.id === id); }
function goPlace(p, ms) {
  const v = viewOf(p);
  leavePano();
  toFly();
  flyTo(v.t, v.h, v.p, v.d, ms);
}
function toFly() {
  if (mode !== 'walk') return;
  controls.target.copy(walkLookPoint());
  mode = 'fly'; document.body.classList.remove('walking'); $('mode').innerHTML = '🚶<span> Cammina</span>'; $('mode').title = 'Cammina a terra';
}
function walkToPlace(p) {
  leavePano();
  const v = VIEWS[p.id] || { h: 20 };
  const t = W(p.e, p.n, p.h || 230);
  (async () => {
    // from afar, fly there first so that the detailed ground and buildings are loaded before landing
    if (camera.position.distanceTo(t) > 700) {
      goPlace(p, 1600);
      await new Promise(r => setTimeout(r, 1700));
      for (let i = 0; i < 40 && terrain.queue.size + city.queue.size > 0; i++) await new Promise(r => setTimeout(r, 100));
    }
    walkAt(t, v.h, true, p.cat === 'castelli' ? 48 : 30);
  })();
}

// ---------------------------------------------------------------------------------------------- UI
const SHORTCUTS = [['castelgrande', 'Castelgrande'], ['montebello', 'Montebello'], ['sasso-corbaro', 'Sasso Corbaro'], ['piazza-collegiata', 'Piazza Collegiata'], ['stazione', 'Stazione FFS']];
{
  const g = $('goto');
  for (const [id, name] of SHORTCUTS) {
    const b = document.createElement('button');
    b.textContent = name;
    b.onclick = () => { const p = placeById(id); if (p) goPlace(p); closePanels(); };
    g.appendChild(b);
  }
  const b = document.createElement('button');
  b.textContent = 'Vista d\'insieme';
  b.onclick = () => { overview(); closePanels(); };
  g.appendChild(b);
}
function overview(ms) {
  leavePano();
  toFly();
  flyTo(W(2722350, 1116650, 235), 12, 24, 5200, ms);
}
const panels = ['goto', 'timep', 'about'];
function closePanels(except) { for (const id of panels) if (id !== except) $(id).hidden = true; }
function closeAll() { closePanels(); $('card').hidden = true; }
function toggle(id) { const el = $(id); const open = el.hidden; closePanels(id); el.hidden = !open; }
$('gotob').onclick = e => { e.stopPropagation(); toggle('goto'); };
$('timeb').onclick = e => { e.stopPropagation(); toggle('timep'); };
$('infob').onclick = e => { e.stopPropagation(); toggle('about'); };
$('mode').onclick = () => { closeAll(); if (anim) return; setMode(mode === 'walk' ? 'fly' : 'walk'); };
$('compass').onclick = () => {
  if (mode === 'walk') { walk.yaw = 0; dirty = true; return; }
  flyTo(controls.target.clone(), 0, pitchOfCamera(), camera.position.distanceTo(controls.target), 900);
};
// time of day
{
  const slider = $('tslider');
  const sync = () => { const d0 = zurichDayStart(timeMs); slider.value = Math.round((timeMs - d0) / 60000); };
  slider.oninput = () => { timeMode = 'set'; timeMs = zurichDayStart(timeMs) + slider.value * 60000; updateSun(); };
  $('tnow').onclick = () => { timeMode = 'live'; updateSun(); sync(); };
  $('shadows').checked = shadowsOn;
  $('shadows').onchange = e => { shadowsOn = e.target.checked; updateSun(); };
  updateSun();
  sync();
  setInterval(() => { if (timeMode === 'live') { updateSun(); sync(); } }, 60000);
}
// ---------------------------------------------------------------------------------------------- punti panoramici
{
  const g = $('goto');
  const h = document.createElement('div');
  h.className = 'gsec';
  h.innerHTML = '<span>🏞 Panorami</span>';
  const t = document.createElement('button');
  t.id = 'gtour'; t.textContent = '▶ giro'; t.title = 'Mostra i panorami uno dopo l\'altro';
  t.onclick = () => { closePanels(); startTour(); };
  h.appendChild(t);
  g.appendChild(h);
  const grid = document.createElement('div');
  grid.className = 'pgrid';
  PANOS.forEach((v, i) => {
    const b = document.createElement('button');
    b.textContent = v.name; b.title = v.cap;
    b.onclick = () => { closePanels(); goPano(i); };
    grid.appendChild(b);
  });
  g.appendChild(grid);
  $('pprev').onclick = () => goPano(pano.i - 1);
  $('pnext').onclick = () => goPano(pano.i + 1);
  $('pname').onclick = () => { if (pano.moved) goPano(pano.i); };
  $('ptour').onclick = () => { if (pano.tour) stopTour(); else startTour(); };
  $('psave').onclick = () => saveImage();
  $('pshare').onclick = () => sharePano();
  $('pclose').onclick = () => leavePano();
  // the tour stops at the first touch, click, wheel or key anywhere (except on its own button)
  for (const ev of ['pointerdown', 'wheel', 'keydown']) {
    addEventListener(ev, e => { if (pano.tour && !(e.target.closest && e.target.closest('#ptour, #gtour'))) stopTour(); }, { capture: true, passive: true });
  }
}
function panoCam(v) {
  const eye = W(v.eye[0], v.eye[1], v.eye[2]);
  let at = W(v.at[0], v.at[1], 230);
  at.y = groundY(at.x, at.z, 230);
  // a tall (portrait) screen needs a taller angle to keep the width of the view: from the air, look a little lower, so
  // that the extra height goes to the ground below and the band of sky stays about as in the landscape framing
  // (not on a tower: the ground right below it is the blurriest part of the view)
  const v0 = 2 * Math.atan(Math.tan(v.fov * RAD / 2) / (16 / 9)) / RAD, extra = (fovH === v.fov ? wantFov() : v0) - v0;
  if (extra > 2 && !v.near) {
    const d = at.clone().sub(eye), hz = Math.hypot(d.x, d.z);
    const pitch = Math.atan2(-d.y, hz) + extra * 0.35 * RAD;
    const dir = new THREE.Vector3(d.x / hz * Math.cos(pitch), -Math.sin(pitch), d.z / hz * Math.cos(pitch));
    const hit = terrain.raycast(eye, dir, 20000);
    if (hit !== null) at = eye.clone().addScaledVector(dir, hit);
  }
  return { eye, at };
}
// the address of the page: ?vista=<id> while a panorama is shown, without the other ways of choosing a view
function setSearch(vista) {
  const q = new URLSearchParams(location.search);
  for (const k of ['p', 'luogo', 'x', 'y', 'e', 'n', 'h', 'd', 'modo', 'm', 'vista']) q.delete(k);
  if (vista) q.set('vista', vista);
  const s = q.toString();
  history.replaceState(null, '', location.pathname + (s ? '?' + s : '') + (vista ? '' : location.hash));
}
function showPano() {
  const v = PANOS[pano.i], el = $('pano');
  $('pname').innerHTML = '';
  $('pname').append(v.name, Object.assign(document.createElement('small'), { textContent: ` ${pano.i + 1}/${PANOS.length}` }));
  $('pname').title = pano.moved ? 'Torna a questo punto panoramico' : '';
  $('pcap').textContent = v.cap;
  el.classList.toggle('moved', pano.moved);
  el.hidden = false;
  document.body.classList.add('pano-on');
  $('ptour').textContent = pano.tour ? '■ ferma' : '▶ giro';
}
async function goPano(i, { jump = null, tour = false } = {}) {
  if (mode === 'walking-in') return;
  i = (i + PANOS.length) % PANOS.length;
  const v = PANOS[i];
  if (!tour) stopTour();
  closeAll();
  toFly();
  pano.i = i; pano.moved = false; fovH = v.fov;
  const seq = ++pano.seq;
  showPano();
  setSearch(v.id);
  const { eye, at } = panoCam(v);
  if (jump ?? (!tour && camera.position.distanceTo(eye) > 2500)) {
    // far away: wait behind the veil for the tiles of that view, instead of a long flight over a blur
    showVeil();
    pano.jump = seq;
    anim = null;
    placeCam(eye, at);
    await waitReady(12000);
    if (pano.jump !== seq) return;                // a later jump lifts the veil itself
    pano.jump = 0;
    if (seq === pano.seq) placeCam(eye, panoCam(v).at);     // the finer ground under the look-at point
    hideVeil();
    writeHash();
  } else startAnim(eye, at, tour ? 3200 : 2400, 'fly');
}
function placeCam(eye, at) {
  camera.position.copy(eye);
  controls.target.copy(at);
  camera.fov = wantFov(); camera.updateProjectionMatrix();
  camera.lookAt(at);
  controls.enabled = true;
  controls.update();
  dirty = true;
}
function markMoved() {
  if (!panoFixed()) return;
  pano.moved = true;
  stopTour();
  showPano();
  setSearch(null);
}
function leavePano() {
  if (pano.i < 0) return;
  stopTour();
  pano.i = -1; pano.moved = false; fovH = null; pano.seq++;
  $('pano').hidden = true;
  document.body.classList.remove('pano-on');
  setSearch(null);
}
function stopTour() {
  if (!pano.tour) return;
  pano.tour = null;
  $('ptour').textContent = '▶ giro';
  $('gtour').textContent = '▶ giro';
}
async function startTour() {
  const me = pano.tour = {};
  let i = pano.i < 0 ? 0 : pano.moved ? pano.i : pano.i + 1;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  while (pano.tour === me) {
    goPano(i, { tour: true });
    $('ptour').textContent = '■ ferma';
    await until(() => !anim || pano.tour !== me, 6000);
    await until(() => viewReady() || pano.tour !== me, 7000);
    for (let k = 0; k < 55 && pano.tour === me; k++) await sleep(100);     // a few seconds still
    i = (i + 1) % PANOS.length;
  }
}
function flash(msg) {
  const m = $('pmsg');
  m.textContent = msg;
  clearTimeout(flash.t);
  flash.t = setTimeout(() => { m.textContent = ''; }, 2600);
}
// 📷: render the view at a good size and read it back in the same task (the drawing buffer is not kept),
// then frame it with the name of the viewpoint, the place and the date and time of the light
function saveImage() {
  const v = pano.i >= 0 ? PANOS[pano.i] : null, fixed = panoFixed();
  const day = new Intl.DateTimeFormat('it-CH', { timeZone: 'Europe/Zurich', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(timeMs));
  const when = `${day}, ore ${zurichTime(timeMs)}${timeMode === 'set' ? ' (ora simulata)' : ''}`;
  const pr0 = renderer.getPixelRatio();
  const pr = clamp(1800 / Math.max(innerWidth, innerHeight), pr0, 2.5);
  let pic;
  try {
    if (pr !== pr0) renderer.setPixelRatio(pr);
    renderer.render(scene, camera);
    pic = framePicture(renderer.domElement, {
      title: fixed ? v.name : 'Bellinzona 3D', sub: `Bellinzona · ${when}`,
      credits: meta.credits, creditsShort: 'Dati: © swisstopo · WSL/LFI · © OpenStreetMap contributors',
    });
  } finally {
    if (pr !== pr0) renderer.setPixelRatio(pr0);
    dirty = true;
  }
  const z = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Zurich', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(timeMs)).reduce((o, p) => (o[p.type] = p.value, o), {});
  const name = `bellinzona-${fixed ? v.id : '3d'}-${z.year}${z.month}${z.day}-${z.hour}${z.minute}.jpg`;
  pic.toBlob(b => {
    if (!b) { flash('Immagine non disponibile'); return; }
    const url = URL.createObjectURL(b), a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    flash('Immagine salvata');
  }, 'image/jpeg', 0.92);
}
async function sharePano() {
  const v = PANOS[pano.i], fixed = panoFixed();
  const url = fixed ? new URL(`${location.pathname}?vista=${encodeURIComponent(v.id)}`, location.href).href : location.href;
  const title = fixed ? `${v.name} · Bellinzona 3D` : 'Bellinzona 3D';
  if (navigator.share) {
    try { await navigator.share({ title, text: fixed ? v.cap : title, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(url); flash('Link copiato'); } catch { prompt('Copia il link:', url); }
}

function showHint() {
  const h = $('hint');
  h.textContent = mode === 'walk'
    ? (isTouch ? 'Joystick per camminare · trascina per guardarti intorno' : 'WASD o frecce per camminare · trascina per guardare · Maiusc per correre')
    : (isTouch ? 'Trascina per ruotare · pizzica per lo zoom · due dita per spostare' : 'Trascina per ruotare · rotella per lo zoom · tasto destro o WASD per spostare · doppio clic per avvicinarti');
  h.classList.add('on');
  clearTimeout(showHint.t);
  showHint.t = setTimeout(() => h.classList.remove('on'), 5000);
}
$('credits').textContent = meta.credits;

// ---------------------------------------------------------------------------------------------- URL in / out
let hashT = 0;
function writeHash() {
  clearTimeout(hashT);
  hashT = setTimeout(() => {
    let h;
    if (mode === 'walk') {
      const [e, n] = LV(camera.position);
      h = `#w=${Math.round(e)},${Math.round(n)},${Math.round(((-walk.yaw / RAD) % 360 + 360) % 360)}`;
    } else if (mode === 'fly') {
      const [e, n] = LV(controls.target);
      h = `#v=${Math.round(e)},${Math.round(n)},${Math.round(camera.position.distanceTo(controls.target))},${Math.round(headingOfCamera())},${Math.round(pitchOfCamera())}`;
    } else return;
    if (h !== location.hash) history.replaceState(null, '', location.pathname + location.search + h);
  }, 400);
}
// 2-D map pixels (as in places.json x/y and the main page's #@x,y) -> LV95 of the ground seen at that pixel:
// the 2-D map looks down at 45 degrees, so walk down its viewing line until it meets the terrain
function fromMapPx(x, y) {
  const M = meta.enu2px;
  if (!M) return null;
  const det = M[0][0] * M[1][1] - M[0][1] * M[1][0];
  const at = up => { const bx = x - M[0][2] * up, by = y - M[1][2] * up; return [(bx * M[1][1] - M[0][1] * by) / det, (M[0][0] * by - M[1][0] * bx) / det]; };
  let hit = null;
  for (let H = 2600; H >= 150; H -= 1) {
    const [east, north] = at(H - meta.origin_h);
    const g = terrain.heightAt(east, -north);
    if (g !== null && g >= H) { hit = [east, north]; break; }
  }
  if (!hit) hit = at(230 - meta.origin_h);
  return [hit[0] + OE, hit[1] + ON];
}
const until = async (cond, ms) => { const t0 = performance.now(); while (!cond() && performance.now() - t0 < ms) await new Promise(r => setTimeout(r, 100)); };
// arriving from a link: wait behind a veil until the tiles of that view are in, instead of showing a blur
function showVeil() { const v = $('veil'); v.hidden = false; v.classList.remove('off'); $('loading').hidden = true; }
function hideVeil() { const v = $('veil'); v.classList.add('off'); setTimeout(() => { v.hidden = true; }, 600); }
function viewReady() {
  return terrain.root.state === 2 && terrain.queue.size === 0 && city.queue.size === 0 && city.lodState === 2
    && (!meta.outer || !!terrain.outer) && terrain.texturesReady() && !anim;
}
async function waitReady(ms = 15000) {
  const t0 = performance.now();
  let ok = 0;
  while (performance.now() - t0 < ms && ok < 3) {
    await new Promise(r => setTimeout(r, 200));
    ok = viewReady() ? ok + 1 : 0;
  }
}
function viewOf(p) {
  const v = VIEWS[p.id] || { h: 20, p: 32, d: p.cat === 'castelli' ? 450 : p.cat === 'gite' ? 600 : 300 };
  return { t: W(p.e, p.n, p.h || 230), h: v.h, p: v.p, d: v.d };
}
async function startView() {
  const vi = PANOS.findIndex(v => v.id === params.get('vista'));
  if (vi >= 0) {
    showVeil();
    await until(() => terrain.root.state === 2, 8000);
    await goPano(vi, { jump: true });
    return;
  }
  const walkWanted = /^(walk|cammina|w)$/i.test(params.get('modo') || params.get('m') || '');
  const heading = params.has('h') ? +params.get('h') : null;
  const id = params.get('p') || params.get('luogo');
  const ground = async (e, n) => {           // a point on the ground once the coarse terrain is in
    await until(() => terrain.root.state === 2, 8000);
    const t = W(e, n, 230); t.y = groundY(t.x, t.z, 230); return t;
  };
  let target = null, view = null;
  if (id && placeById(id)) {
    const p = placeById(id);
    showVeil();
    const v = viewOf(p);
    setCameraAt(v.t, v.h, v.p, v.d);
    await waitReady();
    if (walkWanted) {
      await walkAt(v.t.clone(), v.h, true, p.cat === 'castelli' ? 48 : 30, 10);
      await waitReady(8000);
      hideVeil();
    } else { hideVeil(); openCard(p); }
    return;
  }
  let e = +(params.get('e') ?? NaN), n = +(params.get('n') ?? NaN);
  if (!Number.isFinite(e) && params.has('x') && params.has('y')) {
    const x = +params.get('x'), y = +params.get('y');
    if (x > 2e6 && y > 1e6) { e = x; n = y; }                                        // LV95
    else if (x > 4e5 && x < 9e5 && y > 5e4 && y < 4e5) { e = x + 2e6; n = y + 1e6; }   // LV03
    else {                                                                          // pixels of the 2-D map
      showVeil();
      const r0 = fromMapPx(x, y);
      setCameraAt(W(r0[0], r0[1], 230), heading ?? 20, 35, 900);
      await until(() => terrain.root.state === 2, 8000);
      await waitReady(6000);                // the ground around it, to find where the 2-D map's view line meets it
      [e, n] = fromMapPx(x, y);
    }
  }
  const hv = /^#v=(-?[\d.]+),(-?[\d.]+),([\d.]+),(-?[\d.]+),(-?[\d.]+)/.exec(location.hash);
  const hw = /^#w=(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)/.exec(location.hash);
  if (Number.isFinite(e) && Number.isFinite(n)) view = { e, n, h: heading ?? 20, p: 35, d: +(params.get('d') || 350), walk: walkWanted };
  else if (hv) view = { e: +hv[1], n: +hv[2], h: +hv[4], p: +hv[5], d: +hv[3] };
  else if (hw) view = { e: +hw[1], n: +hw[2], h: +hw[3], p: 35, d: 300, walk: true };
  if (view) {
    showVeil();
    setCameraAt(W(view.e, view.n, 230), view.h, view.p, view.d);
    target = await ground(view.e, view.n);
    setCameraAt(target, view.h, view.p, view.d);
    await waitReady();
    if (view.walk) { await walkAt(target, view.h, false, 30, 10); await waitReady(8000); }
    hideVeil();
    return;
  }
  setCameraAt(W(2722350, 1116650, 235), 12, 30, 9000);
  overview(3000);
}
function setCameraAt(target, heading, pitch, dist) {
  controls.target.copy(target);
  camera.position.copy(target).addScaledVector(viewDir(heading, pitch), -dist);
  camera.lookAt(target);
  controls.update();
}

// ---------------------------------------------------------------------------------------------- loop
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  if (!anim) camera.fov = wantFov();
  camera.updateProjectionMatrix();
  document.documentElement.style.setProperty('--foot', $('credits').offsetHeight + 'px');
  dirty = true;
}
addEventListener('resize', resize);
resize();

const fps = { frames: 0, t0: performance.now(), value: 0, history: [] };
let last = performance.now(), lowSince = 0, readyAt = 0, lastHd = -999;
const needle = $('needle');
controls.addEventListener('start', () => { lastInteraction = performance.now(); markMoved(); if (anim) anim = null; });
controls.addEventListener('change', () => { dirty = true; writeHash(); });

function placeShadow() {
  if (!sun.castShadow) return;
  const f = mode === 'walk' ? camera.position : controls.target;
  const dist = mode === 'walk' ? 0 : camera.position.distanceTo(controls.target);
  const S = mode === 'walk' ? 140 : clamp(dist * 0.55, 160, 900);
  const cam = sun.shadow.camera;
  if (cam.right !== S) { cam.left = -S; cam.right = S; cam.top = S; cam.bottom = -S; cam.updateProjectionMatrix(); }
  // snap to shadow texels so the edges do not crawl when moving
  const texel = 2 * S / sun.shadow.mapSize.x;
  const fx = Math.round(f.x / texel) * texel, fz = Math.round(f.z / texel) * texel;
  sun.target.position.set(fx, f.y, fz);
  sun.position.set(fx, f.y, fz).addScaledVector(sunDir, 3000);
  sun.target.updateMatrixWorld();
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (anim) stepAnim(now);
  else if (mode === 'walk') stepWalk(dt);
  else if (mode === 'fly') stepFly(dt);
  if (mode === 'walk' && (walk.keys.size || walk.joy.on)) writeHash();

  // near plane follows the height above ground
  const gh = terrain.heightAt(camera.position.x, camera.position.z);
  const above = gh === null ? 500 : camera.position.y - gh;
  const pv = panoFixed() && !anim ? PANOS[pano.i] : null;
  const near = mode === 'walk' ? 0.3 : pv && pv.near ? pv.near : clamp(above * 0.06, 0.5, 12);
  if (Math.abs(near - camera.near) > camera.near * 0.2) { camera.near = near; camera.updateProjectionMatrix(); }
  camera.updateMatrixWorld();
  focus.copy(mode === 'fly' && !anim ? controls.target : camera.position);
  terrain.update(camera, innerHeight * renderer.getPixelRatio(), !!anim);
  city.update(camera.position, focus, mode === 'walk', !!anim);
  sky.position.copy(camera.position);
  sky.scale.setScalar(Math.min(camera.far * 0.9, 60000) / 5000);
  placeShadow();
  updateLabels(now);
  const hd = headingOfCamera();
  if (Math.abs(hd - lastHd) > 0.5) { needle.setAttribute('transform', `rotate(${(-hd).toFixed(1)} 22 22)`); lastHd = hd; }

  const busy = terrain.queue.size + city.queue.size;
  if (!dirty && !busy && !anim && now - lastInteraction > 1500 && !DEBUG && !window.__3dForce) return;   // idle: no redraw
  dirty = false;
  renderer.render(scene, camera);

  fps.frames++;
  if (now - fps.t0 >= 1000) {
    fps.value = fps.frames * 1000 / (now - fps.t0);
    fps.history.push(Math.round(fps.value));
    if (fps.history.length > 120) fps.history.shift();
    fps.frames = 0; fps.t0 = now;
    adapt(now);
    if (DEBUG) debug();
    if (!readyAt && terrain.root.texState === 2 && busy === 0) { readyAt = now; }
  }
  if (terrain.root.texState === 2 && !$('loading').hidden) $('loading').hidden = true;
}
// adaptive quality: if the device cannot keep up, render fewer pixels and coarser tiles
function adapt(now) {
  if (window.__3dNoAdapt) return;
  const busy = terrain.queue.size + city.queue.size;
  if (fps.value < 24 && busy === 0 && now - lastInteraction < 4000) {
    if (!lowSince) lowSince = now;
    if (now - lowSince > 3000) {
      lowSince = 0;
      if (shadowsOn && mobile) { shadowsOn = false; $('shadows').checked = false; updateSun(); }
      else if (pixelRatio > 1) { pixelRatio = Math.max(1, pixelRatio - 0.25); renderer.setPixelRatio(pixelRatio); resize(); }
      else if (terrain.tau < 3) terrain.tau += 0.4;
    }
  } else lowSince = 0;
}
function debug() {
  const i = renderer.info.render;
  const s = city.stats();
  $('dbg').hidden = false;
  $('dbg').textContent = `${fps.value.toFixed(0)} fps · ${i.calls} draw · ${(i.triangles / 1e6).toFixed(2)} M tri · terreno ${terrain.tileCount()} · edifici ${s.bTiles} · alberi ${s.trees} · ${(stats.bytes / 1e6).toFixed(1)} MB · pr ${pixelRatio}`;
}

// test / embedding hooks
window.__3d = {
  THREE, camera, controls, terrain, city, renderer, scene, meta,
  get fps() { return fps.value; }, get fpsHistory() { return fps.history.slice(); },
  get mode() { return mode; }, get busy() { return terrain.queue.size + city.queue.size + (anim ? 1 : 0); },
  get bytes() { return stats.bytes; }, get veil() { return !$('veil').hidden; }, viewReady,
  info() { const i = renderer.info.render; return { calls: i.calls, triangles: i.triangles, tiles: terrain.tileCount(), ...city.stats(), mb: +(stats.bytes / 1e6).toFixed(2), byKind: Object.fromEntries(Object.entries(stats.byKind).map(([k, v]) => [k, +(v / 1e6).toFixed(2)])), pixelRatio, shadows: shadowsOn }; },
  goPlace: id => goPlace(placeById(id), 10), overview: () => overview(10), walkPlace: id => walkToPlace(placeById(id)),
  view: (e, n, d, h, p) => { if (mode === 'walk') setMode('fly'); anim = null; const t = W(e, n, 230); t.y = groundY(t.x, t.z); setCameraAt(t, h, p, d); controls.enabled = true; dirty = true; },
  walkAt: async (e, n, h) => { const t = W(e, n, 230); await city.ensureMasks(t.x, t.z); const [x, z] = freeSpot(t.x, t.z); walk.x = x; walk.z = z; walk.yaw = -h * RAD; walk.pitch = -0.04; const dk = city.deckAt(x, z); walk.y = (dk !== null && dk > groundY(x, z) - 0.3 ? dk : groundY(x, z)) + EYE; mode = 'walk'; anim = null; setMode('walk', true); },
  setTime: iso => { timeMode = 'set'; timeMs = Date.parse(iso); updateSun(); },
  pano: (id, jump = true) => goPano(PANOS.findIndex(v => v.id === id), { jump }), get panoState() { return { i: pano.i, id: PANOS[pano.i]?.id, moved: pano.moved, tour: !!pano.tour, fov: camera.fov, near: camera.near }; },
  setShadows: on => { shadowsOn = on; updateSun(); },
  walkGround: (e, n, f) => walkGround(e - OE, ON - n, f), deckAt: (e, n) => city.deckAt(e - OE, ON - n),
  walkKeys: (keys, ms) => new Promise(r => { keys.forEach(k => walk.keys.add(k)); setTimeout(() => { keys.forEach(k => walk.keys.delete(k)); r(); }, ms); }),
  pos: () => { const [e, n] = LV(camera.position); return { e, n, y: camera.position.y, ground: terrain.heightAt(camera.position.x, camera.position.z) }; },
};

startView();
showHint();
requestAnimationFrame(frame);
