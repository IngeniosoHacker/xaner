import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { createBuilding, PALETTE } from './building';
import { globalUniforms } from './clay';
import { VIEWS, type View } from './views';
import './style.css';

gsap.registerPlugin(ScrollTrigger);

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches || new URLSearchParams(location.search).has('instant');
const isMobile = window.matchMedia('(max-width: 820px), (pointer: coarse)').matches;

/* ------------------------------- renderer ------------------------------ */
const canvas = document.querySelector<HTMLCanvasElement>('#scene')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
let pixelRatio = Math.min(window.devicePixelRatio, isMobile ? 1.5 : 1.75);
renderer.setPixelRatio(pixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const cutPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e4);
renderer.clippingPlanes = [cutPlane];

const scene = new THREE.Scene();
const bgDay = new THREE.Color(PALETTE.bg);
const bgDusk = new THREE.Color('#e9c3a6');
const bgPlan = new THREE.Color('#123049');
scene.background = bgDay.clone();
scene.fog = new THREE.Fog(bgDay.clone(), 140, 420);

const camera = new THREE.PerspectiveCamera(40, 1, 0.3, 1200);

const hemi = new THREE.HemisphereLight('#fff6ea', '#c8b296', 1.5);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff0dc', 2.6);
sun.position.set(48, 80, 36);
sun.castShadow = true;
sun.shadow.mapSize.set(isMobile ? 1024 : 2048, isMobile ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 80, bottom: -50, near: 10, far: 260 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.04;
sun.shadow.radius = 4;
scene.add(sun);
const fill = new THREE.DirectionalLight('#dfe9ff', 0.55);
fill.position.set(-40, 30, -30);
scene.add(fill);

const building = createBuilding();
scene.add(building.root);

const grid = new THREE.GridHelper(220, 110, '#7fb6e0', '#2f5878');
(grid.material as THREE.Material).transparent = true;
(grid.material as THREE.Material).opacity = 0;
grid.position.y = 0.09;
scene.add(grid);

/* ----------------------------- post-process ---------------------------- */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
let gtao: GTAOPass | null = null;
if (!isMobile) {
  gtao = new GTAOPass(scene, camera, 1, 1);
  gtao.updateGtaoMaterial({ radius: 1.6, distanceExponent: 1.4, thickness: 2, scale: 1.1, samples: 12 });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
  composer.addPass(gtao);
}
composer.addPass(new OutputPass());

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  composer.setPixelRatio(pixelRatio);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

/* ------------------------------ scroll → t ----------------------------- */
const lenis = reduceMotion ? null : new Lenis({ lerp: 0.085, wheelMultiplier: 0.9 });
if (lenis) {
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}

const sections = Array.from(document.querySelectorAll<HTMLElement>('section[data-view]'));
let centers: number[] = [];
function measure() {
  centers = sections.map((s) => {
    const r = s.getBoundingClientRect();
    return r.top + window.scrollY + r.height / 2;
  });
}
measure();
window.addEventListener('resize', measure);
window.addEventListener('load', measure);
new ResizeObserver(measure).observe(document.body);

/** Continuous view index. Between two sections the camera travels; around a section centre it holds. */
function scrollT() {
  if (centers.length !== VIEWS.length) return 0;
  const s = window.scrollY + window.innerHeight / 2;
  if (s <= centers[0]) return 0;
  for (let i = 0; i < centers.length - 1; i++) {
    if (s < centers[i + 1]) {
      const f = (s - centers[i]) / Math.max(1, centers[i + 1] - centers[i]);
      return i + THREE.MathUtils.smootherstep(f, 0.18, 0.82);
    }
  }
  return centers.length - 1;
}

/* --------------------------- camera rig / path ------------------------- */
const v3 = (a: [number, number, number]) => new THREE.Vector3(...a);
const posCurve = new THREE.CatmullRomCurve3(VIEWS.map((v) => v3(v.pos)), false, 'centripetal', 0.5);
const tgtCurve = new THREE.CatmullRomCurve3(VIEWS.map((v) => v3(v.tgt)), false, 'centripetal', 0.5);
const num = (v: View, k: keyof View, d = 0) => (v[k] as number | undefined) ?? d;

const rig = {
  pos: v3(VIEWS[0].pos),
  tgt: v3(VIEWS[0].tgt),
  fov: VIEWS[0].fov,
  roll: 0,
  side: VIEWS[0].side as number,
  explode: 0,
  cut: 0,
  state: 0,
  highlight: 0,
  blueprint: 0,
  dusk: 0,
};
const want = { ...rig, pos: rig.pos.clone(), tgt: rig.tgt.clone() };
const intro = { build: reduceMotion ? 1 : 0, lift: reduceMotion ? 0 : 1 };

function sample(t: number) {
  const n = VIEWS.length - 1;
  const u = THREE.MathUtils.clamp(t / n, 0, 1);
  posCurve.getPoint(u, want.pos);
  tgtCurve.getPoint(u, want.tgt);
  const i = Math.min(Math.floor(t), n - 1);
  const f = THREE.MathUtils.clamp(t - i, 0, 1);
  const a = VIEWS[i], b = VIEWS[i + 1] ?? a;
  const L = (k: keyof View, d = 0) => THREE.MathUtils.lerp(num(a, k, d), num(b, k, d), f);
  // dolly-zoom feel: fov moves a little ahead of the position
  want.fov = THREE.MathUtils.lerp(a.fov, b.fov, THREE.MathUtils.smoothstep(f, 0, 0.75));
  want.roll = L('roll');
  want.side = L('side');
  want.explode = L('explode');
  want.state = L('state');
  want.highlight = L('highlight');
  want.blueprint = L('blueprint');
  want.dusk = L('dusk');
  // section plane only between its neighbours
  const ca = a.cut !== undefined ? 1 : 0, cb = b.cut !== undefined ? 1 : 0;
  want.cut = THREE.MathUtils.lerp(ca, cb, f);
}

const cutView = VIEWS.find((v) => v.cut !== undefined)!;
const mouse = new THREE.Vector2();
window.addEventListener('pointermove', (e) => {
  mouse.set(e.clientX / window.innerWidth - 0.5, e.clientY / window.innerHeight - 0.5);
});

/* --------------------------------- HUD --------------------------------- */
const hud = {
  idx: document.querySelector<HTMLElement>('[data-hud="idx"]')!,
  label: document.querySelector<HTMLElement>('[data-hud="label"]')!,
  mode: document.querySelector<HTMLElement>('[data-hud="mode"]')!,
  fov: document.querySelector<HTMLElement>('[data-hud="fov"]')!,
  xyz: document.querySelector<HTMLElement>('[data-hud="xyz"]')!,
  bar: document.querySelector<HTMLElement>('[data-hud="bar"]')!,
};
const letterbox = document.querySelector<HTMLElement>('.letterbox')!;
const dots = Array.from(document.querySelectorAll<HTMLButtonElement>('.rail button'));
dots.forEach((d, i) =>
  d.addEventListener('click', () => {
    const y = centers[i] - window.innerHeight / 2;
    lenis ? lenis.scrollTo(y, { duration: 2.2 }) : window.scrollTo({ top: y, behavior: 'smooth' });
  })
);
let lastIdx = -1;
function updateHud(t: number, speed: number) {
  const idx = THREE.MathUtils.clamp(Math.round(t) || 0, 0, VIEWS.length - 1);
  if (idx !== lastIdx) {
    lastIdx = idx;
    hud.idx.textContent = String(idx + 1).padStart(2, '0') + ' / ' + String(VIEWS.length).padStart(2, '0');
    hud.label.textContent = VIEWS[idx].label;
    dots.forEach((d, i) => d.classList.toggle('on', i === idx));
    document.body.dataset.active = VIEWS[idx].id;
  }
  const iso = rig.fov < 20;
  hud.mode.textContent = rig.blueprint > 0.5 ? 'PLANO · IFC' : iso ? 'ISOMÉTRICA' : 'PERSPECTIVA';
  hud.fov.textContent = rig.fov.toFixed(1) + '°';
  hud.xyz.textContent = `${camera.position.x.toFixed(1)} · ${camera.position.y.toFixed(1)} · ${camera.position.z.toFixed(1)}`;
  hud.bar.style.transform = `scaleX(${(t / (VIEWS.length - 1)).toFixed(4)})`;
  // cinematic letterbox grows with camera speed
  const lb = reduceMotion ? 0 : THREE.MathUtils.clamp((speed - 25) / 60, 0, 1);
  letterbox.style.setProperty('--lb', lb.toFixed(3));
}

/* ------------------------------- render loop --------------------------- */
const clock = new THREE.Clock();
const look = new THREE.Vector3();
const prevPos = new THREE.Vector3().copy(rig.pos);
let frames = 0, slowFrames = 0;
const tmpCol = new THREE.Color();

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;
  const t = scrollT();
  sample(t);

  const k = reduceMotion ? 1 : 1 - Math.exp(-dt * 3.2);
  const kf = reduceMotion ? 1 : 1 - Math.exp(-dt * 4.5);
  rig.pos.lerp(want.pos, k);
  rig.tgt.lerp(want.tgt, k);
  for (const key of ['fov', 'roll', 'side', 'explode', 'cut', 'state', 'highlight', 'blueprint', 'dusk'] as const) {
    (rig[key] as number) += ((want[key] as number) - (rig[key] as number)) * kf;
  }

  // camera: rig + handheld drift + mouse parallax + intro crane-up
  const sway = reduceMotion ? 0 : 1;
  camera.position.copy(rig.pos);
  camera.position.x += (Math.sin(time * 0.31) * 0.6 + mouse.x * 2.2) * sway;
  camera.position.y += (Math.sin(time * 0.23) * 0.35 - mouse.y * 1.2) * sway - intro.lift * 10;
  camera.position.z += Math.cos(time * 0.27) * 0.5 * sway;
  look.copy(rig.tgt);
  look.y -= intro.lift * 6;
  camera.up.set(Math.sin(rig.roll), Math.cos(rig.roll), 0);
  camera.lookAt(look);

  // narrow screens: widen the lens so the tower still fits
  const aspect = camera.aspect;
  let fov = rig.fov;
  if (aspect < 1.25) fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(fov) / 2) * Math.pow(1.25 / aspect, 0.8)));
  camera.fov = fov;
  // shift the frame away from the text panel
  const w = window.innerWidth, h = window.innerHeight;
  const ox = isMobile || w < 900 ? 0 : rig.side * w * 0.17;
  const oy = isMobile || w < 900 ? h * 0.14 : 0;
  camera.setViewOffset(w, h, ox, oy, w, h);
  camera.updateProjectionMatrix();

  // section cut
  const cutY = THREE.MathUtils.lerp(160, cutView.cut!, THREE.MathUtils.smoothstep(rig.cut, 0, 1));
  cutPlane.constant = rig.cut < 0.002 ? 1e4 : cutY;

  // blueprint / dusk atmosphere
  globalUniforms.uBlueprint.value = THREE.MathUtils.smoothstep(rig.blueprint, 0.02, 0.98);
  const bp = globalUniforms.uBlueprint.value;
  tmpCol.copy(bgDay).lerp(bgDusk, rig.dusk).lerp(bgPlan, bp);
  (scene.background as THREE.Color).copy(tmpCol);
  (scene.fog as THREE.Fog).color.copy(tmpCol);
  hemi.intensity = 1.5 * (1 - bp * 0.4) * (1 - rig.dusk * 0.25);
  sun.intensity = 2.6 * (1 - bp) * (1 - rig.dusk * 0.2);
  sun.color.set('#fff0dc').lerp(tmpCol.set('#ffb27a'), rig.dusk);
  sun.position.set(48 - rig.dusk * 110, 80 - rig.dusk * 58, 36 + rig.dusk * 10);
  (grid.material as THREE.Material).opacity = bp * 0.55;
  grid.visible = bp > 0.01;
  if (gtao) gtao.blendIntensity = 1 - Math.max(bp, rig.cut, rig.state * 0.5);

  building.update({
    build: intro.build,
    explode: THREE.MathUtils.smoothstep(rig.explode, 0, 1),
    state: rig.state,
    highlight: rig.highlight,
    blueprint: bp,
    time,
  });

  composer.render(dt);

  const speed = prevPos.distanceTo(camera.position) / Math.max(dt, 1e-3);
  prevPos.copy(camera.position);
  updateHud(t, speed);

  // adaptive quality: drop AO / pixel ratio if the device struggles
  frames++;
  if (frames > 60 && dt > 1 / 38) slowFrames++;
  if (frames % 120 === 0) {
    if (slowFrames > 60) {
      if (gtao && gtao.enabled) gtao.enabled = false;
      else if (pixelRatio > 1) {
        pixelRatio = Math.max(1, pixelRatio - 0.35);
        renderer.setPixelRatio(pixelRatio);
        resize();
      }
    }
    slowFrames = 0;
  }
}
renderer.setAnimationLoop(frame);

/* ------------------------------ intro + text --------------------------- */
const tl = gsap.timeline({ delay: 0.2 });
if (!reduceMotion) {
  tl.to(intro, { build: 1, duration: 3.2, ease: 'power2.inOut' }, 0)
    .to(intro, { lift: 0, duration: 3.6, ease: 'power3.inOut' }, 0.2);
}
tl.from('.hero .reveal', { y: 40, opacity: 0, duration: 1.1, stagger: 0.12, ease: 'power3.out' }, 0.6)
  .from('.topbar, .hud, .rail', { opacity: 0, duration: 1, stagger: 0.1 }, 1.4);

document.querySelectorAll<HTMLElement>('.panel:not(.hero-panel)').forEach((panel) => {
  gsap.from(panel.querySelectorAll('.reveal'), {
    y: 36,
    opacity: 0,
    duration: 0.9,
    stagger: 0.08,
    ease: 'power3.out',
    scrollTrigger: { trigger: panel, start: 'top 78%', toggleActions: 'play none none reverse' },
  });
});

document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((a) =>
  a.addEventListener('click', (e) => {
    const el = document.querySelector(a.getAttribute('href')!);
    if (!el) return;
    e.preventDefault();
    lenis ? lenis.scrollTo(el as HTMLElement, { duration: 2.4 }) : el.scrollIntoView({ behavior: 'smooth' });
  })
);

document.querySelector('[data-year]')!.textContent = String(new Date().getFullYear());
