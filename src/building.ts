import * as THREE from 'three';
import { clay, type ClayMaterial } from './clay';

/* ------------------------------------------------------------------ *
 * Procedural tower under construction, built as if it came from an IFC
 * model: storeys (IfcBuildingStorey) → elements (slab, column, core,
 * facade). Every element knows its storey, discipline and whether it is
 * already built, so the page can recolor it by "estado de avance".
 * ------------------------------------------------------------------ */

export const W = 18; // footprint X
export const D = 14; // footprint Z
export const H0 = 4.8; // lobby height
export const H = 3.6; // typical storey
export const NF = 14; // designed storeys (0..13)
export const floorBase = (i: number) => (i === 0 ? 0 : H0 + (i - 1) * H);
export const floorHeight = (i: number) => (i === 0 ? H0 : H);

// how far each storey is built: 0 nada · 1 losa+columnas · 2 +núcleo · 3 +fachada · 4 +interiores
const BUILT = [4, 4, 4, 4, 4, 4, 4, 4, 3, 2, 2, 1, 0, 0];
const FACADE_SIDES_BUILT: Record<number, string[]> = { 8: ['N', 'W'] };

export const PALETTE = {
  bg: '#f3ebdf',
  ground: '#ebe1d2',
  pad: '#d9cdbb',
  slab: '#efe6d8',
  column: '#e4d8c6',
  core: '#d5c6b2',
  brick: '#c4673f',
  brickDark: '#9c4a2a',
  mullion: '#6d5a4d',
  glass: '#b8d3dd',
  crane: '#e8b23a',
  steel: '#8b9097',
  wood: '#c99a62',
  green: '#8fb48a',
  greenDark: '#6e9a6a',
  ghost: '#9aa3ab',
  rejected: '#d63b2f',
};

type Kind = 'slab' | 'column' | 'core' | 'spandrel' | 'mullion' | 'interior' | 'site' | 'temp' | 'person';
interface Item {
  mat: ClayMaterial;
  floor: number; // -1 = site
  built: boolean;
  kind: Kind;
  side?: 'N' | 'S' | 'E' | 'W';
}

export interface BuildingParams {
  build: number; // intro 0..1
  explode: number;
  state: number; // estados de avance overlay
  highlight: number; // subsección "Fachada norte N2–N7"
  blueprint: number;
  time: number;
}

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitCyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, list: { p: number[]; s: number[]; r?: number[] }[]) {
  const im = new THREE.InstancedMesh(geo, mat, list.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  list.forEach((it, i) => {
    e.set(it.r?.[0] ?? 0, it.r?.[1] ?? 0, it.r?.[2] ?? 0);
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(...(it.p as [number, number, number])), q, new THREE.Vector3(...(it.s as [number, number, number])));
    im.setMatrixAt(i, m);
  });
  im.castShadow = true;
  im.receiveShadow = true;
  return im;
}

function box(mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) {
  const mesh = new THREE.Mesh(unitBox, mat);
  mesh.scale.set(w, h, d);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/* ------------------------------ people ------------------------------ */
const bodyGeo = new THREE.CapsuleGeometry(0.24, 0.72, 4, 10);
const headGeo = new THREE.SphereGeometry(0.19, 14, 10);
const helmetGeo = new THREE.SphereGeometry(0.23, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
const skin = ['#e0b394', '#c99572', '#a8754f', '#f0c8a8'].map((c) => clay(c));
const helmetMat = clay('#f2c230', { roughness: 0.6 });
const helmetWhite = clay('#f6f3ee', { roughness: 0.6 });

function person(shirt: ClayMaterial, opts: { helmet?: 'y' | 'w' } = {}) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(bodyGeo, shirt);
  body.position.y = 0.6;
  const head = new THREE.Mesh(headGeo, skin[Math.floor(Math.random() * skin.length)]);
  head.position.y = 1.3;
  g.add(body, head);
  if (opts.helmet) {
    const h = new THREE.Mesh(helmetGeo, opts.helmet === 'y' ? helmetMat : helmetWhite);
    h.position.y = 1.36;
    g.add(h);
  }
  g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  return g;
}

/* ------------------------------ builder ----------------------------- */
export function createBuilding() {
  const root = new THREE.Group();
  const items: Item[] = [];
  const floors: THREE.Group[] = [];
  const glassMats: { mat: THREE.MeshStandardMaterial; floor: number; built: boolean }[] = [];
  const reg = (mat: ClayMaterial, floor: number, built: boolean, kind: Kind, side?: Item['side']) => {
    items.push({ mat, floor, built, kind, side });
    return mat;
  };

  const colX = [-8.4, -4.2, 0, 4.2, 8.4];
  const colZ = [-6.4, -2.1, 2.1, 6.4];

  for (let i = 0; i < NF; i++) {
    const fg = new THREE.Group();
    fg.userData.base = floorBase(i);
    fg.position.y = floorBase(i);
    floors.push(fg);
    root.add(fg);
    const h = floorHeight(i);
    const lvl = BUILT[i];

    // Slab
    const slabMat = reg(clay(PALETTE.slab), i, lvl >= 1, 'slab');
    fg.add(box(slabMat, W + 0.8, 0.36, D + 0.8, 0, 0.18, 0));

    // Columns
    const colMat = reg(clay(PALETTE.column), i, lvl >= 1, 'column');
    const cols: { p: number[]; s: number[] }[] = [];
    colX.forEach((x) =>
      colZ.forEach((z) => {
        if (Math.abs(x) < 1 && Math.abs(z) < 3) return; // inside core
        const partial = i === 11 && (x + z) % 2 !== 0; // half-poured storey
        const ch = partial ? 1.4 : h - 0.36;
        cols.push({ p: [x, 0.36 + ch / 2, z], s: [0.62, ch, 0.62] });
      })
    );
    fg.add(instanced(unitBox, colMat, cols));

    // Core (stairs + elevators)
    const coreMat = reg(clay(i === 11 ? '#e3c36a' : PALETTE.core), i, lvl >= 1 && (i <= 10 || i === 11), 'core');
    const coreH = h - 0.36;
    fg.add(box(coreMat, 5.2, coreH, 4.2, 0, 0.36 + coreH / 2, 0));
    // elevator doors
    const doorMat = reg(clay('#6c625a'), i, lvl >= 2, 'core');
    for (const dx of [-1.2, 1.2]) fg.add(box(doorMat, 1.1, 2.3, 0.06, dx, 0.36 + 1.15, 2.13));

    // Facade
    const sides: { id: 'N' | 'S' | 'E' | 'W'; along: 'x' | 'z'; at: number; len: number; cols: number[] }[] = [
      { id: 'N', along: 'x', at: D / 2 + 0.05, len: W, cols: colX },
      { id: 'S', along: 'x', at: -D / 2 - 0.05, len: W, cols: colX },
      { id: 'E', along: 'z', at: W / 2 + 0.05, len: D, cols: colZ },
      { id: 'W', along: 'z', at: -W / 2 - 0.05, len: D, cols: colZ },
    ];
    for (const s of sides) {
      const built = lvl >= 3 || (FACADE_SIDES_BUILT[i]?.includes(s.id) ?? false);
      const spMat = reg(clay(PALETTE.brick), i, built, 'spandrel', s.id);
      const mulMat = reg(clay(PALETTE.mullion), i, built, 'mullion', s.id);
      const spH = i === 0 ? 0 : 0.95;
      const thick = 0.28;
      const place = (u: number, y: number, len: number, hh: number, t: number) =>
        s.along === 'x'
          ? { p: [u, y, s.at], s: [len, hh, t] }
          : { p: [s.at, y, u], s: [t, hh, len] };

      if (spH > 0) {
        // spandrel band + brick fins on every column line
        const sp = [place(0, 0.36 + spH / 2, s.len + 0.6, spH, thick)];
        s.cols.forEach((u) => sp.push(place(u, 0.36 + (h - 0.36) / 2, 0.5, h - 0.36, thick + 0.25)));
        fg.add(instanced(unitBox, spMat, sp));
      } else {
        // lobby: thick brick pilasters only at the corners / columns
        fg.add(instanced(unitBox, spMat, s.cols.map((u) => place(u, 0.36 + (h - 0.36) / 2, 0.7, h - 0.36, 0.55))));
      }
      // mullions
      const mul: { p: number[]; s: number[] }[] = [];
      for (let k = 0; k < s.cols.length - 1; k++) {
        const a = s.cols[k], b = s.cols[k + 1];
        for (let m = 1; m < 3; m++) mul.push(place(a + ((b - a) * m) / 3, 0.36 + spH + (h - 0.36 - spH) / 2, 0.09, h - 0.36 - spH, 0.16));
      }
      mul.push(place(0, h - 0.12, s.len, 0.14, 0.18)); // transom
      fg.add(instanced(unitBox, mulMat, mul));
      // glass
      const gm = new THREE.MeshStandardMaterial({
        color: PALETTE.glass, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide,
      });
      glassMats.push({ mat: gm, floor: i, built });
      const gh = h - 0.36 - spH;
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(s.len, gh), gm);
      glass.position.set(s.along === 'x' ? 0 : s.at, 0.36 + spH + gh / 2, s.along === 'x' ? s.at : 0);
      if (s.along === 'z') glass.rotation.y = Math.PI / 2;
      glass.renderOrder = 2;
      fg.add(glass);
    }

    // Edge protection railings on open storeys
    if (lvl > 0 && lvl < 3) {
      const railMat = reg(clay('#f0c33c', { roughness: 0.7 }), i, true, 'temp');
      const rails: { p: number[]; s: number[] }[] = [];
      for (const z of [D / 2 + 0.25, -D / 2 - 0.25]) {
        rails.push({ p: [0, 1.4, z], s: [W + 0.4, 0.07, 0.07] }, { p: [0, 0.9, z], s: [W + 0.4, 0.07, 0.07] });
        for (let x = -W / 2; x <= W / 2 + 0.01; x += 1.8) rails.push({ p: [x, 0.9, z], s: [0.08, 1.1, 0.08] });
      }
      for (const x of [W / 2 + 0.25, -W / 2 - 0.25]) {
        rails.push({ p: [x, 1.4, 0], s: [0.07, 0.07, D + 0.4] }, { p: [x, 0.9, 0], s: [0.07, 0.07, D + 0.4] });
        for (let z = -D / 2; z <= D / 2 + 0.01; z += 1.8) rails.push({ p: [x, 0.9, z], s: [0.08, 1.1, 0.08] });
      }
      fg.add(instanced(unitBox, railMat, rails));
    }

    // Rebar stubs on the storey being poured
    if (i === 11) {
      const rebarMat = reg(clay('#7b5a45', { roughness: 0.5 }), i, true, 'temp');
      const rb: { p: number[]; s: number[] }[] = [];
      cols.forEach((c) => {
        if (c.s[1] > 2) return;
        for (const [dx, dz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]])
          rb.push({ p: [c.p[0] + dx, 2.0, c.p[2] + dz], s: [0.05, 1.6, 0.05] });
      });
      fg.add(instanced(unitCyl, rebarMat, rb));
      // pallets, rebar bundles
      const palMat = reg(clay(PALETTE.wood), i, true, 'temp');
      fg.add(box(palMat, 1.6, 0.5, 1.2, -5.5, 0.6, 4), box(palMat, 1.6, 0.8, 1.2, 6, 0.75, -4.6));
    }
  }

  // roof slab of the design (not built yet → only visible as ghost)
  floors[NF - 1].add(box(reg(clay(PALETTE.slab), NF - 1, false, 'slab'), W + 0.8, 0.4, D + 0.8, 0, H + 0.2, 0));

  /* ----------------------------- interiors ---------------------------- */
  const shirts = ['#3d6f8e', '#c4673f', '#7c9a6d', '#e0a94a', '#5b5f8f', '#2f3a40'].map((c) => clay(c));
  const vest = clay('#f07a2c');
  shirts.forEach((m) => reg(m, -1, true, 'person'));
  reg(vest, -1, true, 'person');

  // Lobby (floor 0)
  {
    const f = floors[0];
    const cream = reg(clay('#f4ede2'), 0, true, 'interior');
    const terracotta = reg(clay(PALETTE.brick), 0, true, 'interior');
    const sofaMat = reg(clay('#7e9a8c'), 0, true, 'interior');
    const rug = reg(clay('#d8b48c'), 0, true, 'interior');
    f.add(box(rug, 7, 0.04, 4.5, -4.2, 0.38, 3.6));
    f.add(box(cream, 4.2, 1.05, 1, 4.6, 0.36 + 0.52, -0.2), box(terracotta, 4.4, 0.08, 1.15, 4.6, 0.36 + 1.08, -0.2));
    f.add(box(sofaMat, 3, 0.5, 1, -4.2, 0.6, 5.2), box(sofaMat, 3, 0.7, 0.3, -4.2, 0.95, 5.65));
    f.add(box(sofaMat, 1, 0.5, 2.6, -7.3, 0.6, 3.3));
    f.add(box(cream, 1.4, 0.4, 1.4, -4.2, 0.56, 3.3));
    // planters
    const pot = reg(clay('#b96440'), 0, true, 'interior');
    const leaf = reg(clay(PALETTE.green), 0, true, 'interior');
    for (const [x, z] of [[-8, 6.2], [8, 6.2], [-8, -6], [3, 5.8]]) {
      const p = new THREE.Mesh(unitCyl, pot);
      p.scale.set(0.8, 0.8, 0.8);
      p.position.set(x, 0.76, z);
      const l = new THREE.Mesh(new THREE.IcosahedronGeometry(0.85, 1), leaf);
      l.position.set(x, 1.85, z);
      l.castShadow = p.castShadow = true;
      f.add(p, l);
    }
    // canopy over entrance
    f.add(box(reg(clay(PALETTE.brickDark), 0, true, 'interior'), 7, 0.3, 2.6, 0, 4.0, D / 2 + 1.4));
    // people in lobby
    const ppl: [number, number, number][] = [[4.2, -1.3, 0], [3.2, 1.8, 1], [-2.6, 4.2, 2], [-5.8, 2.6, 4], [1.5, 5.2, 5]];
    ppl.forEach(([x, z, c]) => {
      const p = person(shirts[c % shirts.length]);
      p.position.set(x, 0.36, z);
      p.rotation.y = Math.random() * 6;
      f.add(p);
    });
    const lamp = new THREE.PointLight('#ffd7a8', 18, 16, 1.6);
    lamp.position.set(0, 3.8, 3.5);
    f.add(lamp);
  }

  // Typical office floor (5) — the one revealed by the section cut
  {
    const f = floors[5];
    const desk = reg(clay('#f4ede2'), 5, true, 'interior');
    const chair = reg(clay('#3d4a52'), 5, true, 'interior');
    const wall = reg(clay('#e9dccb'), 5, true, 'interior');
    const glassWall = reg(clay('#c8dde3'), 5, true, 'interior');
    const accent = reg(clay(PALETTE.brick), 5, true, 'interior');
    const leaf = reg(clay(PALETTE.green), 5, true, 'interior');
    const tables: { p: number[]; s: number[] }[] = [];
    const chairs: { p: number[]; s: number[] }[] = [];
    for (const x of [3.6, 6.6]) for (const z of [-5, -2.6, 2.6, 5]) {
      tables.push({ p: [x, 1.1, z], s: [2.4, 0.08, 1.2] }, { p: [x, 0.73, z], s: [2.2, 0.7, 0.1] });
      chairs.push({ p: [x - 0.6, 0.75, z + 0.95], s: [0.55, 0.8, 0.55] }, { p: [x + 0.6, 0.75, z - 0.95], s: [0.55, 0.8, 0.55] });
    }
    f.add(instanced(unitBox, desk, tables), instanced(unitBox, chair, chairs));
    // meeting rooms on the west
    f.add(box(wall, 0.15, 3.0, 13, -5.2, 1.86, 0), box(wall, 3.6, 3.0, 0.15, -7, 1.86, 0));
    f.add(box(glassWall, 0.08, 2.6, 4, -5.2, 1.66, 0));
    f.add(box(accent, 2.4, 0.08, 1.2, -7, 1.1, 3.4), box(accent, 2.4, 0.08, 1.2, -7, 1.1, -3.4));
    f.add(box(desk, 0.9, 0.75, 0.9, -7, 0.73, 3.4), box(desk, 0.9, 0.75, 0.9, -7, 0.73, -3.4));
    for (const [x, z] of [[8.2, 0], [-3.5, 6]]) {
      const l = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 1), leaf);
      l.position.set(x, 1.3, z);
      f.add(l);
    }
    // fit-out crew
    [[4.8, -3.8], [2.2, 3.8], [-3.4, -4.6]].forEach(([x, z], k) => {
      const p = person(k === 2 ? vest : shirts[k], { helmet: k === 2 ? 'y' : 'w' });
      p.position.set(x, 0.36, z);
      p.rotation.y = k * 1.7;
      f.add(p);
    });
  }

  // Crews on the open storeys
  [[9, -5, 3], [9, 4, -2], [10, -2, 5], [10, 6.5, 1], [11, 2, -4], [11, -6, 2.5], [11, 5, 4]].forEach(([fl, x, z], k) => {
    const p = person(vest, { helmet: 'y' });
    p.position.set(x, 0.36, z);
    p.rotation.y = k * 2.1;
    floors[fl].add(p);
  });

  /* ---------------------------- scaffolding --------------------------- */
  const scaffold = new THREE.Group();
  {
    const pole = reg(clay(PALETTE.steel, { roughness: 0.5 }), -1, true, 'temp');
    const plank = reg(clay(PALETTE.wood), -1, true, 'temp');
    const poles: { p: number[]; s: number[]; r?: number[] }[] = [];
    const planks: { p: number[]; s: number[] }[] = [];
    const y0 = floorBase(7), y1 = floorBase(11) + 1.2;
    for (const x of [W / 2 + 1.0, W / 2 + 2.3]) for (let z = -D / 2; z <= D / 2 + 0.01; z += 2.33)
      poles.push({ p: [x, (y0 + y1) / 2, z], s: [0.1, y1 - y0, 0.1] });
    for (let y = y0 + 1.8; y < y1; y += 1.8) {
      for (const x of [W / 2 + 1.0, W / 2 + 2.3]) poles.push({ p: [x, y, 0], s: [0.07, D, 0.07], r: [Math.PI / 2, 0, 0] });
      planks.push({ p: [W / 2 + 1.65, y - 0.05, 0], s: [1.3, 0.08, D] });
      for (let z = -D / 2; z < D / 2 - 0.1; z += 2.33)
        poles.push({ p: [W / 2 + 2.3, y - 0.9, z + 1.165], s: [0.05, 2.9, 0.05], r: [((k) => (k % 2 ? 0.67 : -0.67))(Math.round(z * 10)), 0, 0] });
    }
    scaffold.add(instanced(unitCyl, pole, poles), instanced(unitBox, plank, planks));
    root.add(scaffold);
  }

  /* ------------------------------- crane ------------------------------ */
  const crane = new THREE.Group();
  const slew = new THREE.Group();
  let trolley: THREE.Group;
  {
    const yellow = reg(clay(PALETTE.crane, { roughness: 0.55 }), -1, true, 'temp');
    const dark = reg(clay('#4b4f55'), -1, true, 'temp');
    const concrete = reg(clay('#cfc4b4'), -1, true, 'temp');
    const mastH = 64;
    crane.add(box(concrete, 6, 1.2, 6, 0, 0.6, 0));
    const lattice: { p: number[]; s: number[]; r?: number[] }[] = [];
    const s = 1.1;
    for (const [x, z] of [[-s, -s], [s, -s], [s, s], [-s, s]]) lattice.push({ p: [x, mastH / 2, z], s: [0.22, mastH, 0.22] });
    for (let y = 1.2; y < mastH; y += 2.2) {
      lattice.push({ p: [0, y, s], s: [2.2, 0.12, 0.12] }, { p: [0, y, -s], s: [2.2, 0.12, 0.12] });
      lattice.push({ p: [s, y, 0], s: [0.12, 0.12, 2.2] }, { p: [-s, y, 0], s: [0.12, 0.12, 2.2] });
      lattice.push({ p: [0, y + 1.1, s], s: [3.1, 0.09, 0.09], r: [0, 0, 0.785] }, { p: [0, y + 1.1, -s], s: [3.1, 0.09, 0.09], r: [0, 0, -0.785] });
      lattice.push({ p: [s, y + 1.1, 0], s: [0.09, 0.09, 3.1], r: [0.785, 0, 0] }, { p: [-s, y + 1.1, 0], s: [0.09, 0.09, 3.1], r: [-0.785, 0, 0] });
    }
    crane.add(instanced(unitBox, yellow, lattice));

    slew.position.y = mastH;
    crane.add(slew);
    slew.add(box(yellow, 3, 1.2, 3, 0, 0.6, 0));
    slew.add(box(dark, 1.8, 1.8, 1.8, 1.2, 2.0, 1.6)); // cab
    slew.add(box(reg(clay('#9fc3d0', { roughness: 0.2 }), -1, true, 'temp'), 1.5, 0.9, 0.1, 1.2, 2.3, 2.52));
    // jib (−x) and counter-jib (+x), triangular lattice
    const jib: { p: number[]; s: number[]; r?: number[] }[] = [];
    const jl = 46, cj = 15;
    for (const z of [-0.7, 0.7]) jib.push({ p: [-jl / 2, 1.4, z], s: [jl, 0.18, 0.18] });
    jib.push({ p: [-jl / 2, 2.8, 0], s: [jl, 0.18, 0.18] });
    for (let x = 0; x > -jl; x -= 1.6) {
      jib.push({ p: [x - 0.8, 2.1, 0.35], s: [0.08, 1.6, 0.08], r: [0.45, 0, 0.6] }, { p: [x - 0.8, 2.1, -0.35], s: [0.08, 1.6, 0.08], r: [-0.45, 0, 0.6] });
      jib.push({ p: [x, 1.4, 0], s: [0.08, 0.08, 1.4] });
    }
    for (const z of [-1, 1]) jib.push({ p: [cj / 2, 1.4, z], s: [cj, 0.3, 0.2] });
    slew.add(instanced(unitBox, yellow, jib));
    slew.add(box(concrete, 3.2, 2.4, 2.6, cj - 2.2, 0.4, 0)); // counterweights
    slew.add(box(concrete, 3.2, 2.4, 2.6, cj - 5.6, 0.4, 0));
    // A-frame + tie bars
    slew.add(box(yellow, 0.35, 8, 0.35, 0, 5, 0));
    const tie = (x2: number, y2: number) => {
      const len = Math.hypot(x2, y2 - 9);
      const m = box(dark, len, 0.07, 0.07, x2 / 2, (9 + y2) / 2, 0);
      m.rotation.z = Math.atan2(y2 - 9, x2);
      slew.add(m);
    };
    tie(-jl * 0.62, 2.8);
    tie(-jl * 0.98, 2.8);
    tie(cj - 1, 1.6);
    // trolley + hook + load
    trolley = new THREE.Group();
    trolley.position.set(-24, 1.2, 0);
    trolley.add(box(dark, 1.4, 0.5, 1.6, 0, 0, 0));
    const cableLen = 14;
    trolley.add(box(dark, 0.05, cableLen, 0.05, 0, -cableLen / 2, 0));
    trolley.add(box(yellow, 0.6, 0.6, 0.6, 0, -cableLen - 0.2, 0));
    const load = new THREE.Group();
    load.position.y = -cableLen - 1.4;
    for (let k = -1; k <= 1; k++) load.add(box(reg(clay('#8d6b56'), -1, true, 'temp'), 6, 0.35, 0.35, 0, k * 0.0, k * 0.42));
    load.add(box(dark, 0.04, 1.6, 0.04, -1.8, 0.8, 0), box(dark, 0.04, 1.6, 0.04, 1.8, 0.8, 0));
    trolley.add(load);
    slew.add(trolley);
    crane.position.set(W / 2 + 10, 0, -D / 2 - 4);
    root.add(crane);
  }

  /* -------------------------------- site ------------------------------ */
  const site = new THREE.Group();
  {
    const groundMat = reg(clay(PALETTE.ground), -1, true, 'site');
    const ground = new THREE.Mesh(new THREE.CircleGeometry(420, 64), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    site.add(ground);
    const padMat = reg(clay(PALETTE.pad), -1, true, 'site');
    const pad = box(padMat, 64, 0.12, 52, 2, 0.04, -2);
    pad.castShadow = false;
    site.add(pad);
    // street
    const asphalt = reg(clay('#b9b1a7'), -1, true, 'site');
    const street = box(asphalt, 260, 0.06, 14, 0, 0.02, 34);
    street.castShadow = false;
    site.add(street);
    const stripes: { p: number[]; s: number[] }[] = [];
    for (let x = -120; x < 120; x += 7) stripes.push({ p: [x, 0.07, 34], s: [3.2, 0.02, 0.3] });
    site.add(instanced(unitBox, reg(clay('#f5efe4'), -1, true, 'site'), stripes));
    // fence
    const fenceMat = reg(clay('#e7ddcf'), -1, true, 'site');
    const fence: { p: number[]; s: number[] }[] = [];
    fence.push({ p: [2, 1.1, 24], s: [64, 2.2, 0.15] }, { p: [2, 1.1, -28], s: [64, 2.2, 0.15] });
    fence.push({ p: [34, 1.1, -2], s: [0.15, 2.2, 52] }, { p: [-30, 1.1, -2], s: [0.15, 2.2, 52] });
    const fm = instanced(unitBox, fenceMat, fence);
    site.add(fm);
    // site offices (containers)
    const cont1 = reg(clay('#5f8fa3'), -1, true, 'site');
    const cont2 = reg(clay(PALETTE.brick), -1, true, 'site');
    site.add(box(cont1, 6, 2.6, 2.4, -22, 1.3, 14), box(cont2, 6, 2.6, 2.4, -22, 3.9, 14), box(cont1, 6, 2.6, 2.4, -22, 1.3, 10.8));
    // sand piles, material stacks
    const sand = reg(clay('#e3c79a'), -1, true, 'site');
    for (const [x, z, r] of [[-20, -14, 3], [-14, -20, 2.2]]) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(r, r * 0.9, 18), sand);
      c.position.set(x, r * 0.45, z);
      c.castShadow = c.receiveShadow = true;
      site.add(c);
    }
    const stack = reg(clay('#b9a58d'), -1, true, 'site');
    site.add(box(stack, 5, 1, 2.2, 22, 0.5, 14), box(stack, 5, 0.8, 2.2, 22, 1.4, 14));
    const blue = reg(clay('#4f7d93'), -1, true, 'site');
    site.add(box(blue, 2.4, 1.2, 2.4, 25, 0.6, 8));
    // trees around
    const trunk = reg(clay('#8a6a52'), -1, true, 'site');
    const crown = reg(clay(PALETTE.green), -1, true, 'site');
    const crown2 = reg(clay(PALETTE.greenDark), -1, true, 'site');
    const ico = new THREE.IcosahedronGeometry(1, 1);
    for (let k = 0; k < 26; k++) {
      const x = -110 + k * 9 + (k % 3) * 1.7;
      for (const z of [26.5, 41.5]) {
        if (Math.abs(x) < 6 && z < 30) continue;
        const t = new THREE.Mesh(unitCyl, trunk);
        t.scale.set(0.35, 2.4, 0.35);
        t.position.set(x, 1.2, z);
        const c = new THREE.Mesh(ico, (k + z) % 2 ? crown : crown2);
        const r = 1.8 + ((k * 7) % 5) * 0.25;
        c.scale.setScalar(r);
        c.position.set(x, 2.4 + r * 0.8, z);
        t.castShadow = c.castShadow = true;
        site.add(t, c);
      }
    }
    // neighbourhood blocks (context, low detail)
    const nb = reg(clay('#e8dccb'), -1, true, 'site');
    const nb2 = reg(clay('#dccbb5'), -1, true, 'site');
    const blocks: [number, number, number, number, number][] = [
      [-62, -14, 22, 18, 26], [-58, 18, 16, 9, 14], [64, -10, 20, 30, 22], [62, 18, 18, 12, 14], [0, -62, 40, 16, 20],
      [-40, -60, 22, 24, 18], [44, -58, 26, 10, 22], [-70, 70, 24, 14, 20], [10, 72, 30, 9, 16], [64, 66, 20, 22, 18],
      [-110, -30, 26, 20, 30], [112, 20, 24, 34, 26], [-30, 100, 30, 12, 20], [96, -80, 26, 16, 26],
    ];
    blocks.forEach(([x, z, w, h, d], k) => site.add(box(k % 2 ? nb : nb2, w, h, d, x, h / 2, z)));
  }
  root.add(site);

  /* ------------------------- issue pin (rejected) --------------------- */
  const pin = new THREE.Group();
  {
    const red = clay(PALETTE.rejected, { roughness: 0.45, emissive: new THREE.Color('#5a0d06') });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.75, 24, 16), red);
    head.position.y = 2.1;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.5, 20), red);
    tip.rotation.x = Math.PI;
    tip.position.y = 0.95;
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), clay('#ffffff'));
    dot.position.set(0, 2.1, 0.6);
    pin.add(head, tip, dot);
    pin.position.set(W / 2 + 0.8, floorBase(6) + 1.0, 2.1);
    pin.rotation.y = Math.PI / 2;
    pin.userData.mats = [red, dot.material];
    root.add(pin);
  }

  /* ----------------------------- per-frame ---------------------------- */
  const ghostTint = new THREE.Color(PALETTE.ghost);
  const rejectTint = new THREE.Color(PALETTE.rejected);
  const tmp = new THREE.Color();

  type State = 'approved' | 'reported' | 'rejected' | 'corrected' | 'none';
  const facadeState = (floor: number, side?: string): State => {
    if (floor <= 5) return 'approved';
    if (floor === 6) return side === 'E' ? 'rejected' : 'approved';
    if (floor === 7) return 'corrected';
    if (floor === 8) return 'reported';
    return 'none';
  };

  function update(p: BuildingParams) {
    // storeys rise one after another during the intro, then explode apart
    floors.forEach((fg, i) => {
      const k = THREE.MathUtils.smoothstep(p.build * (NF + 3) - i, 0, 1);
      fg.userData.intro = k;
      fg.position.y = fg.userData.base + p.explode * i * 2.7 - (1 - k) * 6;
    });
    scaffold.position.y = p.explode * 7.5 * 2.7;
    pin.position.y = floorBase(6) + 1.0 + p.explode * 6 * 2.7 + Math.sin(p.time * 2.2) * 0.25;
    const pinFade = Math.max(0, p.state * 1.2 - 0.2) * (1 - p.blueprint);
    pin.visible = pinFade > 0.01;
    pin.scale.setScalar(0.6 + 0.4 * pinFade);
    (pin.userData.mats as ClayMaterial[]).forEach((m) => (m.userData.uFade.value = pinFade));

    // crane slowly slewing, trolley drifting
    slew.rotation.y = -0.35 + Math.sin(p.time * 0.12) * 0.45;
    trolley.position.x = -24 + Math.sin(p.time * 0.2) * 9;

    const pulse = 0.5 + 0.5 * Math.sin(p.time * 3);
    for (const it of items) {
      const u = it.mat.userData;
      const intro = it.floor >= 0 ? floors[it.floor].userData.intro ?? 1 : 1;
      if (it.kind === 'site' || it.kind === 'person') {
        u.uFade.value = 1;
        u.uTintMix.value = 0;
        continue;
      }
      if (it.kind === 'temp' && it.floor < 0) {
        u.uFade.value = 1 - p.state * 0.85;
        u.uTintMix.value = 0;
        continue;
      }
      if (!it.built) {
        // not started: invisible in the "real" render, ghost (15%) in the BIM state view
        u.uFade.value = 0.16 * Math.max(p.state, p.blueprint) * intro;
        u.uTint.value.copy(ghostTint);
        u.uTintMix.value = 1;
        continue;
      }
      let fade = 1, tintMix = 0;
      tmp.copy(u.base);
      if (it.kind === 'spandrel' || it.kind === 'mullion') {
        const st = facadeState(it.floor, it.side);
        if (st === 'reported' || st === 'corrected') {
          fade = 0.42;
          const l = u.base.r * 0.3 + u.base.g * 0.59 + u.base.b * 0.11;
          tmp.setRGB(l * 1.05, l * 1.05, l * 1.08);
          tintMix = 0.65;
        } else if (st === 'rejected') {
          tmp.copy(rejectTint);
          tintMix = 0.55 + 0.25 * pulse;
        }
      } else if (it.kind === 'interior' || it.kind === 'temp') {
        fade = 1 - 0.75 * p.state;
      }
      u.uFade.value = THREE.MathUtils.lerp(1, fade, p.state) * intro;
      u.uTint.value.copy(tmp);
      u.uTintMix.value = tintMix * p.state;

      // subsection highlight: "Fachada norte · niveles 2–7"
      if (p.highlight > 0 && it.kind === 'spandrel') {
        if (it.side === 'N' && it.floor >= 2 && it.floor <= 7) {
          u.uTint.value.set('#e2581f');
          u.uTintMix.value = Math.max(u.uTintMix.value, p.highlight * (0.45 + 0.3 * pulse));
        } else {
          u.uFade.value *= 1 - 0.55 * p.highlight;
        }
      }
    }
    for (const g of glassMats) {
      const intro = floors[g.floor].userData.intro ?? 1;
      g.mat.opacity = (g.built ? 0.32 * (1 - p.state * 0.6) : 0) * (1 - p.blueprint) * intro;
      g.mat.visible = g.mat.opacity > 0.005;
    }
  }

  return { root, floors, crane, update, pin };
}
