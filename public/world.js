// 3D low-poly world for Car Fight (Three.js).
// Server coordinates are 2D pixels; 20 px = 1 world unit, server y maps to world z.
import * as THREE from 'three';
import { buildCar } from './cars.js';
import { levelY } from './levels.js';

export const S = 1 / 20;
export const POWER_COLOR = { rocket: '#f97316', triple: '#facc15', mine: '#a8a29e', shield: '#3b82f6', boost: '#e879f9', health: '#22c55e', jump: '#38bdf8', turbo: '#ef4444', foot: '#fb923c', pride: '#ec4899' };
export const POWER_ICON = { rocket: '🚀', triple: '🔱', mine: '💣', shield: '🛡️', boost: '⚡', health: '❤️', jump: '🦘', turbo: '🏎️', foot: '🧍', pride: '🏳️‍🌈' };

// Look of each map: sky gradient, fog, lights, ground/floor colours, scenery and obstacle style
const THEMES = {
  autumn: {
    sky: ['#3b2a63', '#8a5f9e', '#e8a27a'], fog: '#9a6b98', hemi: ['#d9c7ff', '#7a4b2a', 1.1], sun: ['#ffd2a1', 2.4],
    ground: ['#6b7a2a', '#9a8a32', '#4f6b2a'], floor: ['#c8703a', '#e08a4a', '#a85a30'],
    specks: ['#8f2a1c', '#b8401f', '#6e2416', '#d0662c'], speckSize: [0.22, 0.14],
    blades: ['#8a9a35', '#b5a644', '#6f8a2e', '#c9b45a', '#5d7a2a'],
    trunk: ['#4b2f7a', '#3a2a5e'], canopy: ['#c2410c', '#b91c1c', '#d97706', '#9ca34a', '#e9a23b', '#a3302a', '#d4b24c'],
    pine: ['#24533f', '#1f4536'], pineRatio: 0.22,
    rock: ['#8a817c', '#6f6763'], block: ['#857767', '#7a6d5e'], top: '#7d8a35', blockH: 1.8,
  },
  desert: {
    sky: ['#2f4f8f', '#e0a066', '#ffdca8'], fog: '#e8bf92', hemi: ['#fff1d6', '#a0663a', 1.2], sun: ['#fff0d0', 2.8], exposure: 1.0,
    ground: ['#d9a35e', '#e8bb74', '#c78f4c'], floor: ['#e3b06a', '#f0c584', '#cf9a55'],
    specks: ['#a8754a', '#8c5f3a', '#c49060'], speckSize: [0.2, 0.2],
    blades: ['#c9a55a', '#b08a45', '#a8904a'], bladeDensity: 0.35, bladeHeight: 0.7,
    trunk: ['#3f7a3a', '#4d8c45', '#356b32'], cactus: true, canopy: [], pine: [], pineRatio: 0, treeDensity: 0.5,
    rock: ['#b5653d', '#9c5233'], block: ['#b8643a', '#a85a33', '#c4703f'], top: '#d9894f', blockH: 3.2, hills: 1.6,
  },
  snow: {
    sky: ['#24365c', '#7f9cc9', '#e3ecf7'], fog: '#c9d8ea', hemi: ['#e8f1ff', '#7f93ad', 1.15], sun: ['#ffffff', 2.2], exposure: 0.95,
    ground: ['#e9eff7', '#ffffff', '#d5e0ee'], floor: ['#cfd9e6', '#e3eaf3', '#b9c6d6'],
    specks: ['#aab8c9', '#ffffff', '#93a4b8'], speckSize: [0.25, 0.18],
    blades: ['#dfe8f2', '#c3d0de'], bladeDensity: 0.4, bladeHeight: 0.5,
    trunk: ['#4a3628', '#3b2b20'], canopy: ['#2f5d4f'], pine: ['#2f5d4f', '#3d6e5d', '#284f43'], pineRatio: 1, snowCaps: true,
    rock: ['#9aa8b8', '#7f8c9c'], block: ['#a9c4dc', '#bcd3e8', '#94b4d1'], top: '#ffffff', blockH: 2.2, hills: 1.4,
  },
  city: {
    sky: ['#070b1f', '#24195a', '#7b3f8c'], fog: '#2a2350', hemi: ['#8b7dff', '#1b1b2b', 0.9], sun: ['#9db4ff', 1.2], exposure: 1.15,
    ground: ['#2b2f3a', '#323746', '#262a33'], floor: ['#3a3d47', '#44474f', '#33363f'],
    specks: ['#e5e7eb', '#facc15'], speckSize: [0.9, 0.12], speckAligned: true,
    blades: [], trunk: ['#3b2f2f'], canopy: ['#22c55e', '#16a34a'], pine: ['#14532d'], pineRatio: 0.3, treeDensity: 0.4,
    rock: ['#facc15', '#1f2937'], barriers: true, block: ['#4b5563', '#374151', '#6b7280', '#3f3d56'], top: '#1f2937', blockH: 4.5, windows: true, hills: 0.6,
  },
  jungle: {
    sky: ['#17402c', '#5f8f5a', '#d5ecb0'], fog: '#7fa77a', hemi: ['#dfffd0', '#3b2a1a', 1.05], sun: ['#fff4c2', 2.3],
    ground: ['#2f6b2a', '#3f8a35', '#25561f'], floor: ['#8a5a34', '#9c6a3e', '#734a2b'],
    specks: ['#2f6b2a', '#4d8f3a', '#6b4a2b'], speckSize: [0.3, 0.18],
    blades: ['#3f8a35', '#5aa845', '#2f6b2a', '#76b852'], bladeDensity: 1.4, bladeHeight: 1.3,
    trunk: ['#5a3d26', '#4a321f'], canopy: ['#2f7a32', '#3f9a3c', '#1f5f2a', '#5aa845', '#7cc25a'], pine: ['#1f5f2a'], pineRatio: 0.1, treeDensity: 1.3,
    rock: ['#5e6b4f', '#4c5940'], block: ['#2f6b2a', '#35772f', '#2a6026'], top: '#4f9a3f', blockH: 2.6,
  },
};

// Seeded random so every player sees the same scenery
let seed = 1337;
const srand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const rnd = (a, b) => a + srand() * (b - a);

const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3(), tmpC = new THREE.Color();

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const PRIDE_COLORS = ['#e40303', '#ff8c00', '#ffed00', '#008026', '#004dff', '#750787']; // rainbow flag

// Ribbon trail drawn behind the rear wheels while boosting
class Trail {
  constructor(scene, color) {
    this.n = 26;
    this.pts = [];
    this.color = new THREE.Color(color);
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.n * 2 * 3);
    this.col = new Float32Array(this.n * 2 * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const idx = [];
    for (let i = 0; i < this.n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setIndex(idx);
    this.geo = geo;
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }
  update(p, side, active) {
    for (const q of this.pts) q.a *= 0.95;
    const last = this.pts[0];
    if (!last || last.p.distanceToSquared(p) > 0.04) {
      this.pts.unshift({ p: p.clone(), s: side.clone(), a: active ? 1 : 0 });
      if (this.pts.length > this.n) this.pts.pop();
    } else if (active) last.a = 1;
    const w = 0.16;
    for (let i = 0; i < this.n; i++) {
      const q = this.pts[Math.min(i, this.pts.length - 1)];
      if (!q) continue;
      const f = q.a * (1 - i / this.n);
      for (let k = 0; k < 2; k++) {
        const o = (i * 2 + k) * 3, sgn = k ? 1 : -1;
        this.pos[o] = q.p.x + q.s.x * w * sgn; this.pos[o + 1] = q.p.y; this.pos[o + 2] = q.p.z + q.s.z * w * sgn;
        this.col[o] = this.color.r * f; this.col[o + 1] = this.color.g * f; this.col[o + 2] = this.color.b * f;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
  reset() { this.pts = []; }
  dispose(scene) { scene.remove(this.mesh); this.geo.dispose(); }
}


// Low-poly soldier carrying a big rocket launcher on the shoulder (faces +x like the cars)
function buildSoldier(color, h) {
  const root = new THREE.Group();
  const k = Math.max(1, h) * 1.25;
  const mat = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 });
  const box = (w, hh, d, c, x, y, z, parent = root) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), mat(c));
    m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m;
  };
  const legPivot = x => { const p = new THREE.Group(); p.position.set(0, 0.95 * k, x * k); root.add(p); box(0.28 * k, 0.95 * k, 0.28 * k, '#374151', 0, -0.47 * k, 0, p); return p; };
  const legL = legPivot(-0.2), legR = legPivot(0.2);
  box(0.5 * k, 0.8 * k, 0.8 * k, color, 0, 1.35 * k, 0);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3 * k, 12, 10), mat('#f1c27d'));
  head.position.y = 2.05 * k; head.castShadow = true; root.add(head);
  box(0.4 * k, 0.16 * k, 0.5 * k, '#1f2937', 0.02 * k, 2.25 * k, 0);
  const armL = new THREE.Group(); armL.position.set(0.1 * k, 1.65 * k, -0.5 * k); root.add(armL);
  box(0.9 * k, 0.24 * k, 0.24 * k, color, 0.4 * k, 0, 0, armL);
  const armR = new THREE.Group(); armR.position.set(0.1 * k, 1.65 * k, 0.5 * k); root.add(armR);
  box(0.9 * k, 0.24 * k, 0.24 * k, color, 0.4 * k, 0, 0, armR);
  // Launcher tube on the shoulder, pointing forward, with a glowing warhead tip
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * k, 0.24 * k, 2.6 * k, 12), mat('#4b5563'));
  tube.rotation.z = Math.PI / 2; tube.position.set(0.8 * k, 1.9 * k, 0.05 * k); tube.castShadow = true; root.add(tube);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.22 * k, 0.5 * k, 12), new THREE.MeshStandardMaterial({ color: '#f97316', emissive: '#f97316', emissiveIntensity: 0.7 }));
  tip.rotation.z = -Math.PI / 2; tip.position.set(2.35 * k, 1.9 * k, 0.05 * k); root.add(tip);
  return {
    root,
    animate(time, speed) {
      const sw = Math.sin(time * 12) * Math.min(1, speed / 120) * 0.9;
      legL.rotation.z = sw; legR.rotation.z = -sw;
      root.position.y = Math.abs(Math.sin(time * 12)) * Math.min(1, speed / 120) * 0.12 * k;
    },
  };
}

export class World {
  constructor(canvas) {
    const mobile = matchMedia('(pointer: coarse)').matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile });
    // Resolution is capped for laptops and adapts to the frame rate (see adapt())
    this.maxPR = Math.min(devicePixelRatio, mobile ? 1.25 : 1.5);
    this.pr = this.maxPR;
    this.perf = { t: 0, frames: 0, slowRounds: 0 };
    this.renderer.setPixelRatio(this.pr);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog('#9a6b98', 70, 190);

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
    this.camera.position.set(0, 40, 60);

    this.hemi = new THREE.HemisphereLight('#d9c7ff', '#7a4b2a', 1.1);
    this.scene.add(this.hemi);
    const sun = new THREE.DirectionalLight('#ffd2a1', 2.4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
    // Shadow box follows the camera target so big maps still get crisp shadows
    Object.assign(sun.shadow.camera, { left: -55, right: 55, top: 55, bottom: -55, near: 1, far: 200 });
    sun.shadow.bias = -0.0005;
    this.sun = sun;
    this.scene.add(sun, sun.target);
    // Soft light that follows the player in the basements
    this.lamp = new THREE.PointLight('#ffe2b0', 2.2, 50, 1.4);
    this.lamp.visible = false;
    this.scene.add(this.lamp);
    this.viewLevel = 0; // 0 = ground, -1/-2 = basements (only on multi-level maps)

    this.cars = new Map();
    this.powerups = new Map();
    this._rb = new THREE.Color();
    this.bulletPool = []; this.rocketPool = []; this.minePool = []; this.boomPool = [];
    this.particles = [];
    this.texts = [];
    this.shake = 0;
    this.camMode = 'chase';
    this.camYaw = 0;
    this.camDist = 11;
    this.camPos = new THREE.Vector3(0, 40, 60);
    this.camLook = new THREE.Vector3();
    this.arenaBuilt = false;

    const pm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), 500);
    pm.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    pm.frustumCulled = false;
    pm.count = 0;
    this.particleMesh = pm;
    this.scene.add(pm);

    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = w + 'px';
    this.renderer.domElement.style.height = h + 'px';
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? 75 : 60;
    this.camera.updateProjectionMatrix();
  }

  toWorld(x, y) { return new THREE.Vector3(x * S - this.hw, 0, y * S - this.hh); }

  // ---------- Static scenery ----------
  // Rebuilt whenever the map changes; everything lives in one group so it can be thrown away.
  buildArena(arena) {
    const key = arena.id + ':' + arena.w + 'x' + arena.h;
    if (this.arenaKey === key) return;
    this.arenaKey = key;
    this.arenaBuilt = true;
    if (this.staticGroup) {
      this.scene.remove(this.staticGroup);
      this.staticGroup.traverse(o => { o.geometry?.dispose(); if (o.material && !o.material.shared) o.material.dispose?.(); });
    }
    const group = this.staticGroup = new THREE.Group();
    this.scene.add(group);
    this.viewLevel = 0; this.lamp.visible = false;
    this.arena = arena; this.hw = arena.w * S / 2; this.hh = arena.h * S / 2;
    const T = THEMES[arena.theme] || THEMES.autumn;
    seed = 1337;
    this.arena = arena;
    this.hw = arena.w * S / 2; this.hh = arena.h * S / 2;
    const AW = arena.w * S, AH = arena.h * S, R = Math.max(this.hw, this.hh);
    const area = (AW * AH) / (80 * 50);
    const pick = list => list[Math.floor(srand() * list.length)];

    // Sky, fog and light per theme
    this.scene.background = canvasTexture(4, 256, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, T.sky[0]); gr.addColorStop(0.55, T.sky[1]); gr.addColorStop(1, T.sky[2]);
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    this.scene.fog.color.set(T.fog);
    this.scene.fog.near = 70 + R * 0.3; this.scene.fog.far = 190 + R;
    this.hemi.color.set(T.hemi[0]); this.hemi.groundColor.set(T.hemi[1]); this.hemi.intensity = T.hemi[2];
    this.sun.color.set(T.sun[0]); this.sun.intensity = T.sun[1];
    this.renderer.toneMappingExposure = T.exposure || 1.05;

    const hill = (x, z) => {
      const out = Math.max(Math.abs(x) - this.hw - 16, Math.abs(z) - this.hh - 16, 0);
      return Math.min(out, 40) * 0.12 * (Math.sin(x * 0.07) + Math.cos(z * 0.06) + 1.2) * (T.hills ?? 1);
    };

    // Ground with colour patches and gentle hills outside the arena
    const GS = R * 2 + 320;
    const ground = new THREE.PlaneGeometry(GS, GS, 140, 140);
    ground.rotateX(-Math.PI / 2);
    const gp = ground.attributes.position, gcol = [];
    const gA = new THREE.Color(T.ground[0]), gB = new THREE.Color(T.ground[1]), gC = new THREE.Color(T.ground[2]);
    for (let i = 0; i < gp.count; i++) {
      const x = gp.getX(i), z = gp.getZ(i);
      gp.setY(i, hill(x, z) - 0.05);
      const n = (Math.sin(x * 0.21) * Math.cos(z * 0.17) + 1) / 2;
      tmpC.copy(gA).lerp(gB, n).lerp(gC, srand() * 0.4);
      gcol.push(tmpC.r, tmpC.g, tmpC.b);
    }
    ground.setAttribute('color', new THREE.Float32BufferAttribute(gcol, 3));
    ground.computeVertexNormals();
    const groundMesh = new THREE.Mesh(ground, new THREE.MeshLambertMaterial({ vertexColors: true }));
    groundMesh.receiveShadow = true;
    group.add(groundMesh);

    // Arena floor
    const floor = new THREE.PlaneGeometry(AW + 3, AH + 3, Math.round(AW / 2), Math.round(AH / 2)); // colour noise needs only ~2 m cells
    floor.rotateX(-Math.PI / 2);
    const dcol = [], dA = new THREE.Color(T.floor[0]), dB = new THREE.Color(T.floor[1]), dC = new THREE.Color(T.floor[2]);
    const dp = floor.attributes.position;
    for (let i = 0; i < dp.count; i++) {
      const n = (Math.sin(dp.getX(i) * 0.3) * Math.cos(dp.getZ(i) * 0.25) + 1) / 2;
      tmpC.copy(dA).lerp(dB, n).lerp(dC, srand() * 0.35);
      dcol.push(tmpC.r, tmpC.g, tmpC.b);
    }
    floor.setAttribute('color', new THREE.Float32BufferAttribute(dcol, 3));
    const floorMesh = new THREE.Mesh(floor, new THREE.MeshLambertMaterial({ vertexColors: true }));
    floorMesh.position.y = 0.02;
    floorMesh.receiveShadow = true;
    group.add(floorMesh);

    // Leaves / pebbles / road paint scattered on the floor
    const specks = new THREE.InstancedMesh(new THREE.PlaneGeometry(T.speckSize[0], T.speckSize[1]).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial(), Math.min(7000, Math.round(1400 * area)));
    for (let i = 0; i < specks.count; i++) {
      tmpM.compose(tmpV.set(rnd(-this.hw, this.hw), 0.04, rnd(-this.hh, this.hh)), tmpQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), T.speckAligned ? (srand() < 0.5 ? 0 : Math.PI / 2) : rnd(0, 6.28)), tmpS.set(1, 1, 1));
      specks.setMatrixAt(i, tmpM);
      specks.setColorAt(i, tmpC.set(pick(T.specks)));
    }
    specks.receiveShadow = true;
    group.add(specks);

    // Grass blades: thick outside, a few tufts along the inner edge
    if (T.blades.length) {
      const blades = new THREE.InstancedMesh(new THREE.ConeGeometry(0.09, 1, 3).translate(0, 0.5, 0), new THREE.MeshLambertMaterial(), Math.min(22000, Math.round(9000 * Math.sqrt(area) * (T.bladeDensity ?? 1))));
      const ring = 30 + R * 0.2;
      for (let i = 0; i < blades.count; i++) {
        let x, z;
        if (i < blades.count * 0.07) {
          const e = Math.floor(rnd(0, 4));
          x = e < 2 ? rnd(-this.hw, this.hw) : (e === 2 ? -1 : 1) * (this.hw - rnd(0, 2));
          z = e < 2 ? (e === 0 ? -1 : 1) * (this.hh - rnd(0, 2)) : rnd(-this.hh, this.hh);
        } else {
          do { x = rnd(-this.hw - ring, this.hw + ring); z = rnd(-this.hh - ring, this.hh + ring); }
          while (Math.abs(x) < this.hw + 2 && Math.abs(z) < this.hh + 2);
        }
        const h = rnd(0.5, 1.3) * (T.bladeHeight ?? 1);
        tmpM.compose(tmpV.set(x, hill(x, z) - 0.05, z), tmpQ.setFromEuler(new THREE.Euler(rnd(-0.3, 0.3), rnd(0, 6), rnd(-0.3, 0.3))), tmpS.set(1, h, 1));
        blades.setMatrixAt(i, tmpM);
        blades.setColorAt(i, tmpC.set(pick(T.blades)));
      }
      group.add(blades);
    }

    // Trees around the arena (round canopies, pines or cacti depending on theme)
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 1, 5).translate(0, 0.5, 0);
    const blobGeo = new THREE.IcosahedronGeometry(1, 0);
    const pineGeo = new THREE.ConeGeometry(1, 2.4, 6).translate(0, 1.2, 0);
    const flat = c => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
    const N = Math.min(420, Math.round(220 * Math.sqrt(area) * (T.treeDensity ?? 1))); // capped so big maps stay light
    const trunks = new THREE.InstancedMesh(trunkGeo, flat('#ffffff'), N);
    const blobs = new THREE.InstancedMesh(blobGeo, new THREE.MeshLambertMaterial({ flatShading: true }), N);
    const pines = new THREE.InstancedMesh(pineGeo, new THREE.MeshLambertMaterial({ flatShading: true }), N);
    const caps = new THREE.InstancedMesh(pineGeo, flat('#ffffff'), N);
    let nb = 0, np = 0, nc = 0;
    const spread = 70 + R * 0.3;
    for (let i = 0; i < N; i++) {
      let x, z;
      do { x = rnd(-this.hw - spread, this.hw + spread); z = rnd(-this.hh - spread, this.hh + spread); }
      while (Math.abs(x) < this.hw + 4 && Math.abs(z) < this.hh + 4);
      const y = hill(x, z) - 0.3;
      const s = rnd(0.9, 1.8);
      if (T.cactus) {
        const th = rnd(2.5, 4.5) * s;
        tmpM.compose(tmpV.set(x, y, z), tmpQ.identity(), tmpS.set(s * 2, th, s * 2));
        trunks.setMatrixAt(i, tmpM); trunks.setColorAt(i, tmpC.set(pick(T.trunk)));
        continue;
      }
      const th = rnd(2, 3.5) * s;
      tmpM.compose(tmpV.set(x, y, z), tmpQ.identity(), tmpS.set(s, th, s));
      trunks.setMatrixAt(i, tmpM);
      trunks.setColorAt(i, tmpC.set(pick(T.trunk)));
      if (srand() < T.pineRatio) {
        tmpM.compose(tmpV.set(x, y + th * 0.4, z), tmpQ.identity(), tmpS.set(s * 1.3, s * 1.6, s * 1.3));
        pines.setMatrixAt(np, tmpM); pines.setColorAt(np++, tmpC.set(pick(T.pine)));
        if (T.snowCaps) {
          tmpM.compose(tmpV.set(x, y + th * 0.4 + s * 1.6 * 1.2, z), tmpQ.identity(), tmpS.set(s * 0.65, s * 0.8, s * 0.65));
          caps.setMatrixAt(nc++, tmpM);
        }
      } else {
        tmpM.compose(tmpV.set(x, y + th + s * 0.6, z), tmpQ.setFromEuler(new THREE.Euler(rnd(0, 3), rnd(0, 3), 0)), tmpS.set(s * 1.7, s * 1.5, s * 1.7));
        blobs.setMatrixAt(nb, tmpM); blobs.setColorAt(nb++, tmpC.set(pick(T.canopy)));
      }
    }
    blobs.count = nb; pines.count = np; caps.count = nc;
    for (const m of [trunks, blobs, pines, caps]) { m.castShadow = true; group.add(m); }

    // Border: rocks, or concrete barriers in the city
    const rockGeo = T.barriers ? new THREE.BoxGeometry(2.2, 1, 0.8) : new THREE.DodecahedronGeometry(1, 0);
    const per = Math.ceil((AW + AH) * 2 / 2.4) + 4;
    const rocks = new THREE.InstancedMesh(rockGeo, new THREE.MeshLambertMaterial({ flatShading: true }), per);
    let ri = 0;
    const placeRock = (x, z, rotY) => {
      if (ri >= per) return;
      const s = T.barriers ? 1 : rnd(0.7, 1.2);
      const q = T.barriers ? tmpQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY) : tmpQ.setFromEuler(new THREE.Euler(rnd(0, 3), rnd(0, 3), rnd(0, 3)));
      tmpM.compose(tmpV.set(x, T.barriers ? 0.5 : s * 0.3, z), q, T.barriers ? tmpS.set(1, 1, 1) : tmpS.set(s * 1.2, s * 0.8, s));
      rocks.setMatrixAt(ri, tmpM); rocks.setColorAt(ri++, tmpC.set(T.barriers ? T.rock[ri % 2] : pick(T.rock)));
    };
    for (let x = -this.hw; x <= this.hw; x += 2.4) { placeRock(x, -this.hh - 0.9, 0); placeRock(x, this.hh + 0.9, 0); }
    for (let z = -this.hh; z <= this.hh; z += 2.4) { placeRock(-this.hw - 0.9, z, Math.PI / 2); placeRock(this.hw + 0.9, z, Math.PI / 2); }
    rocks.count = ri;
    rocks.castShadow = rocks.receiveShadow = true;
    group.add(rocks);

    // Obstacles
    const windows = T.windows ? canvasTexture(64, 64, (g) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, 64, 64);
      for (let y = 6; y < 64; y += 16) for (let x = 6; x < 64; x += 16) {
        g.fillStyle = Math.random() < 0.6 ? pick(['#fde68a', '#67e8f9', '#f0abfc', '#fca5a5']) : '#111';
        g.fillRect(x, y, 8, 9);
      }
    }) : null;
    if (windows) { windows.wrapS = windows.wrapT = THREE.RepeatWrapping; }
    for (const o of arena.obstacles) {
      const w = o.w * S, d = o.h * S, h = T.blockH;
      const c = this.toWorld(o.x + o.w / 2, o.y + o.h / 2);
      let m;
      if (T.windows) {
        const tex = windows.clone();
        tex.needsUpdate = true;
        tex.repeat.set(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2)));
        const mat = new THREE.MeshLambertMaterial({ color: pick(T.block), emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.9 });
        m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.3, d + 0.2), flat(T.top));
        roof.position.set(c.x, h + 0.15, c.z);
        group.add(roof);
        const neon = new THREE.Mesh(new THREE.BoxGeometry(w + 0.25, 0.12, d + 0.25), new THREE.MeshBasicMaterial({ color: pick(['#f0abfc', '#67e8f9', '#facc15', '#fb7185']) }));
        neon.position.set(c.x, h - 0.4, c.z);
        group.add(neon);
      } else {
        const geo = new THREE.BoxGeometry(w, h, d, Math.max(2, Math.round(w)), 2, Math.max(2, Math.round(d)));
        const p = geo.attributes.position;
        for (let i = 0; i < p.count; i++) {
          if (p.getY(i) > -h / 2 + 0.01) {
            p.setX(i, p.getX(i) + rnd(-0.12, 0.12));
            p.setY(i, p.getY(i) + rnd(-0.15, 0.2));
            p.setZ(i, p.getZ(i) + rnd(-0.12, 0.12));
          }
        }
        geo.computeVertexNormals();
        m = new THREE.Mesh(geo, flat(pick(T.block)));
        const top = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.15, d * 0.9), flat(T.top));
        top.position.set(c.x, h + 0.05, c.z);
        top.receiveShadow = true;
        group.add(top);
      }
      m.position.set(c.x, h / 2, c.z);
      m.castShadow = m.receiveShadow = true;
      group.add(m);
    }
  }

  // ---------- Cars ----------
  makeCar(id, info) {
    const model = buildCar(info.car, info.color);
    if (!model) return null; // model still downloading; the car appears as soon as it arrives
    const g = model.group, wheels = model.wheels, body = model.bodyMat;
    const carParts = [...g.children];
    const soldier = buildSoldier(info.color, model.height);
    soldier.root.visible = false;
    g.add(soldier.root);

    // Player photo floating above the roof
    const initial = (info.name[0] || '?').toUpperCase();
    // ring === null draws the usual coloured ring; otherwise the six Pride flag stripes
    const paintPhoto = (ring) => (c, w) => {
      if (ring) {
        c.save(); c.beginPath(); c.arc(w / 2, w / 2, w / 2, 0, Math.PI * 2); c.clip();
        PRIDE_COLORS.forEach((col, i) => { c.fillStyle = col; c.fillRect(0, i * w / 6, w, w / 6 + 1); });
        c.restore();
      } else {
        c.fillStyle = info.color; c.beginPath(); c.arc(w / 2, w / 2, w / 2, 0, Math.PI * 2); c.fill();
      }
      c.fillStyle = '#fff'; c.beginPath(); c.arc(w / 2, w / 2, w / 2 - 10, 0, Math.PI * 2); c.fill();
      c.save(); c.beginPath(); c.arc(w / 2, w / 2, w / 2 - 18, 0, Math.PI * 2); c.clip();
      c.fillStyle = info.color; c.fillRect(0, 0, w, w);
      c.fillStyle = '#fff'; c.font = 'bold 120px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(initial, w / 2, w / 2 + 6);
      c.restore();
    };
    const photoTex = canvasTexture(256, 256, paintPhoto(null));
    const photoTexPride = canvasTexture(256, 256, paintPhoto(PRIDE_COLORS));
    // Pride flag draped on the roof (only visible while the Pride power-up is active)
    const flagTex = canvasTexture(64, 96, (c, w, h) => { PRIDE_COLORS.forEach((col, i) => { c.fillStyle = col; c.fillRect(0, i * 96 / 6, 64, 96 / 6 + 1); }); });
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(model.length * 0.6, model.length * 0.4), new THREE.MeshBasicMaterial({ map: flagTex, side: THREE.DoubleSide }));
    flag.rotation.x = -Math.PI / 2; flag.rotation.z = Math.PI / 2;
    flag.position.y = model.height + 0.05; flag.visible = false;
    g.add(flag);
    const photo = new THREE.Sprite(new THREE.SpriteMaterial({ map: photoTex }));
    photo.scale.set(2, 2, 1);
    photo.position.y = model.height + 1.4;
    g.add(photo);

    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 256; labelCanvas.height = 64;
    const labelTex = new THREE.CanvasTexture(labelCanvas);
    labelTex.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex, depthTest: false }));
    label.scale.set(3.6, 0.9, 1);
    label.position.y = model.height + 3;
    label.renderOrder = 10;
    g.add(label);

    const shield = new THREE.Mesh(new THREE.IcosahedronGeometry(2.4, 1), new THREE.MeshBasicMaterial({ color: '#60a5fa', transparent: true, opacity: 0.25, wireframe: false, depthWrite: false }));
    shield.position.y = 1;
    shield.userData.base = Math.max(1, model.length / 3.2);
    g.add(shield);

    this.scene.add(g);
    const car = {
      g, wheels, photo, photoTex, photoTexPride, flag, carParts, soldier, label, labelCanvas, labelTex, shield, lastLabel: '',
      trails: [new Trail(this.scene, '#f0abfc'), new Trail(this.scene, '#f0abfc')],
      x: 0, z: 0, a: 0, wasDead: true, info, bodyMat: body, flash: 0, smokeT: 0,
    };
    this.cars.set(id, car);
    return car;
  }

  drawLabel(car, name, hp, isMe) {
    const key = name + hp + isMe;
    if (key === car.lastLabel) return;
    car.lastLabel = key;
    const c = car.labelCanvas.getContext('2d');
    c.clearRect(0, 0, 256, 64);
    c.font = 'bold 26px system-ui, sans-serif'; c.textAlign = 'center';
    c.lineWidth = 6; c.strokeStyle = 'rgba(0,0,0,.65)';
    const text = name + (isMe ? ' (you)' : '');
    c.strokeText(text, 128, 28); c.fillStyle = '#fff'; c.fillText(text, 128, 28);
    c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(48, 40, 160, 14);
    c.fillStyle = hp > 50 ? '#22c55e' : hp > 25 ? '#f59e0b' : '#ef4444';
    c.fillRect(51, 43, 154 * hp / 100, 8);
    car.labelTex.needsUpdate = true;
  }

  // Debug: call __world.showHeading(true) in the console to draw each car's driving direction
  showHeading(on) {
    for (const car of this.cars.values()) {
      car.g.getObjectByName('heading')?.removeFromParent();
      if (!on) continue;
      const a = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.6, 8).rotateZ(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#00ff00', depthTest: false }));
      a.name = 'heading'; a.position.set(car.info.car ? 3 : 3, 1.2, 0); a.renderOrder = 30;
      car.g.add(a);
    }
  }

  rebuildCars() { for (const id of [...this.cars.keys()]) this.removeCar(id); }

  removeCar(id) {
    const car = this.cars.get(id);
    if (!car) return;
    this.scene.remove(car.g);
    car.trails.forEach(t => t.dispose(this.scene));
    this.cars.delete(id);
  }

  // ---------- Pools ----------
  pooled(pool, make, i) {
    while (pool.length <= i) { const m = make(); this.scene.add(m); pool.push(m); }
    const m = pool[i];
    m.visible = true;
    return m;
  }
  hideFrom(pool, n) { for (let i = n; i < pool.length; i++) pool[i].visible = false; }

  spawnFx(f) {
    const p = this.toWorld(f.x, f.y);
    const yo = levelY(f.lv || 0);
    if (f.k === 'hit') {
      const car = this.cars.get(f.id);
      if (car) car.flash = 0.3;
    }
    if ((f.lv || 0) !== this.viewLevel) return; // effects on another level are not drawn
    if (f.k === 'hit') {
      this.damageText(p, f.dmg, yo);
      for (let i = 0; i < 6; i++) {
        const a = Math.random() * Math.PI * 2;
        this.particles.push({ fy: yo, p: new THREE.Vector3(p.x, yo + 1.4, p.z), v: new THREE.Vector3(Math.cos(a) * 4, 3 + Math.random() * 4, Math.sin(a) * 4),
          life: 0.4, max: 0.4, c: new THREE.Color(i % 2 ? '#ff4d4d' : '#ffd166'), s: 0.16 });
      }
    }
    const conf = {
      boom: { n: f.big ? 45 : 26, colors: ['#f97316', '#fbbf24', '#ef4444', '#57534e'], sp: f.big ? 14 : 9, size: 0.35 },
      spark: { n: 8, colors: ['#fde047', '#ffffff'], sp: 6, size: 0.15 },
      shieldhit: { n: 10, colors: ['#93c5fd', '#60a5fa'], sp: 6, size: 0.18 },
      pickup: { n: 18, colors: [POWER_COLOR[f.type] || '#fff', '#ffffff'], sp: 5, size: 0.2 },
    }[f.k];
    if (!conf) return;
    for (let i = 0; i < conf.n; i++) {
      const a = Math.random() * Math.PI * 2, sp = conf.sp * (0.3 + Math.random());
      this.particles.push({
        fy: yo, p: new THREE.Vector3(p.x, yo + 1, p.z), v: new THREE.Vector3(Math.cos(a) * sp, Math.random() * conf.sp * 0.9, Math.sin(a) * sp),
        life: 0.5 + Math.random() * 0.6, max: 1.1, c: new THREE.Color(conf.colors[i % conf.colors.length]), s: conf.size * (0.6 + Math.random()),
      });
    }
    if (f.k === 'boom') {
      const b = this.boomPool.find(m => !m.visible) || this.pooled(this.boomPool, () => new THREE.Mesh(
        new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, depthWrite: false })), this.boomPool.length);
      b.visible = true; b.position.set(p.x, yo + 1, p.z); b.userData.t = 0; b.userData.big = f.big ? 1.6 : 1;
    }
  }

  // ---------- Per-frame sync ----------
  update(state, players, myId, dt, time) {
    if (!this.arenaBuilt) return this.render(dt, time, null);
    const seen = new Set();
    let me = null;
    if (state) {
      // Which level the local player is on decides what we draw
      const mine = state.cars.find(c => c.id === myId);
      if (mine && (mine.lv || 0) !== this.viewLevel) { this.viewLevel = mine.lv || 0; }
      const k = Math.min(1, dt * 16);
      for (const c of state.cars) {
        const info = players[c.id];
        if (!info) continue;
        seen.add(c.id);
        let car = this.cars.get(c.id);
        if (car && (car.info.photo !== info.photo || car.info.car !== info.car)) { this.removeCar(c.id); car = null; }
        if (!car) car = this.makeCar(c.id, info);
        if (!car) continue;
        const lv = c.lv || 0;
        car.g.visible = c.alive && lv === this.viewLevel;
        if (!car.g.visible) { car.trails.forEach(t => t.reset()); car.wasDead = true; continue; }
        car.y = levelY(lv) + (c.jp >= 0 ? Math.sin(c.jp * Math.PI) * 3.2 : 0);
        const tp = this.toWorld(c.x, c.y);
        if (car.wasDead) { car.x = tp.x; car.z = tp.z; car.a = c.a; car.wasDead = false; }
        car.x += (tp.x - car.x) * k; car.z += (tp.z - car.z) * k;
        car.a += Math.atan2(Math.sin(c.a - car.a), Math.cos(c.a - car.a)) * k;
        car.g.position.set(car.x, car.y, car.z);
        car.g.rotation.y = -car.a;
        for (const w of car.wheels) w.rotation.z -= (c.sp * S) * dt / 0.48;
        car.shield.visible = !!c.sh;
        if (c.pd) car.shield.material.color.set(PRIDE_COLORS[Math.floor(time * 3 + 3) % 6]); else car.shield.material.color.set('#60a5fa');
        car.flag.visible = !!c.pd && !c.ft;
        const wantTex = c.pd ? car.photoTexPride : car.photoTex;
        if (car.photo.material.map !== wantTex) { car.photo.material.map = wantTex; car.photo.material.needsUpdate = true; }
        // On foot: the car body is swapped for a running soldier with a rocket launcher
        const foot = !!c.ft;
        for (const m of car.carParts) m.visible = !foot;
        car.soldier.root.visible = foot;
        if (foot) car.soldier.animate(time, Math.abs(c.sp));
        // Red flash + shake when hit
        if (car.flash > 0) {
          car.flash -= dt;
          const f = Math.max(0, car.flash) / 0.3;
          car.bodyMat.emissive.setRGB(f * 1.2, f * 0.15, f * 0.1);
          car.g.position.x += (Math.random() - 0.5) * 0.25 * f;
          car.g.position.z += (Math.random() - 0.5) * 0.25 * f;
        } else if (c.pd) {
          // Pride power-up: the whole car glows in cycling rainbow colours and throws confetti
          this._rb.set(PRIDE_COLORS[Math.floor(time * 3) % 6]);
          car.bodyMat.emissive.setRGB(this._rb.r * 0.6, this._rb.g * 0.6, this._rb.b * 0.6);
          if ((car.confT = (car.confT || 0) - dt) <= 0) {
            car.confT = 0.04;
            this._rb.set(PRIDE_COLORS[Math.floor(Math.random() * 6)]);
            this.particles.push({ fy: car.y, p: new THREE.Vector3(car.x + (Math.random() - 0.5) * 2, 1.5 + car.y, car.z + (Math.random() - 0.5) * 2),
              v: new THREE.Vector3((Math.random() - 0.5) * 4, 3 + Math.random() * 3, (Math.random() - 0.5) * 4),
              life: 0.9, max: 0.9, c: this._rb.clone(), s: 0.28, rise: true });
          }
        } else car.bodyMat.emissive.setRGB(0, 0, 0);
        // Damaged cars smoke (black and thick when nearly wrecked)
        if (c.hp < 50 && (car.smokeT -= dt) <= 0) {
          car.smokeT = c.hp < 25 ? 0.04 : 0.1;
          const g = c.hp < 25 ? 0.12 + Math.random() * 0.1 : 0.35 + Math.random() * 0.2;
          this.particles.push({ fy: car.y, p: new THREE.Vector3(car.x + (Math.random() - 0.5) * 0.6, 1.6 + car.y, car.z + (Math.random() - 0.5) * 0.6),
            v: new THREE.Vector3((Math.random() - 0.5) * 0.6, 2 + Math.random(), (Math.random() - 0.5) * 0.6),
            life: 1.1, max: 1.1, c: new THREE.Color(g, g, g), s: 0.35 + Math.random() * 0.25, rise: true });
          if (c.hp < 25 && Math.random() < 0.3) this.particles.push({ fy: car.y, p: new THREE.Vector3(car.x, 1.5 + car.y, car.z),
            v: new THREE.Vector3(0, 2.5, 0), life: 0.4, max: 0.4, c: new THREE.Color('#ff7a1a'), s: 0.3, rise: true });
        }
        car.shield.scale.setScalar(car.shield.userData.base * (1 + Math.sin(time * 8) * 0.03));
        this.drawLabel(car, info.name, c.hp, c.id === myId);
        const dir = new THREE.Vector3(Math.cos(car.a), 0, Math.sin(car.a));
        const side = new THREE.Vector3(-dir.z, 0, dir.x);
        const boosting = !!(c.bo || c.nb || c.tb);
        if (c.pd) car.trails.forEach((t, i) => t.color.set(PRIDE_COLORS[(Math.floor(time * 6) + i * 3) % 6])); else car.trails.forEach(t => t.color.set('#f0abfc'));
        car.trails.forEach((t, i) => {
          const sgn = i ? 1 : -1;
          t.update(new THREE.Vector3(car.x - dir.x * 1.3 + side.x * 0.95 * sgn, 0.12 + car.y, car.z - dir.z * 1.3 + side.z * 0.95 * sgn), side, boosting);
        });
        if (c.id === myId) me = { car, c, dir };
      }
      for (const id of [...this.cars.keys()]) if (!seen.has(id)) this.removeCar(id);

      // Bullets & rockets
      let nb = 0, nr = 0;
      for (const [x, y, rocket, a, blv] of state.bullets) {
        if ((blv || 0) !== this.viewLevel) continue;
        const p = this.toWorld(x, y);
        p.y = levelY(blv || 0);
        if (rocket) {
          const m = this.pooled(this.rocketPool, () => {
            const g = new THREE.Group();
            g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.9, 6).rotateZ(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#f97316' })));
            const fl = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 6), new THREE.MeshBasicMaterial({ color: '#fde047' }));
            fl.position.x = -0.55; g.add(fl);
            return g;
          }, nr++);
          m.position.set(p.x, 1.2 + p.y, p.z); m.rotation.y = -a;
        } else {
          const m = this.pooled(this.bulletPool, () => new THREE.Mesh(new THREE.SphereGeometry(0.17, 6, 6), new THREE.MeshBasicMaterial({ color: '#fff27a' })), nb++);
          m.position.set(p.x, 1.2 + p.y, p.z);
        }
      }
      this.hideFrom(this.bulletPool, nb); this.hideFrom(this.rocketPool, nr);

      // Mines
      const minesHere = state.mines.filter(mi => (mi.lv || 0) === this.viewLevel);
      minesHere.forEach((mi, i) => {
        const m = this.pooled(this.minePool, () => {
          const g = new THREE.Group();
          const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 0.25, 8), new THREE.MeshLambertMaterial({ color: '#2b2b2b' }));
          base.position.y = 0.12; base.castShadow = true; g.add(base);
          const led = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 6), new THREE.MeshBasicMaterial({ color: '#ff2a2a' }));
          led.position.y = 0.3; g.add(led);
          return g;
        }, i);
        const p = this.toWorld(mi.x, mi.y);
        m.position.set(p.x, levelY(mi.lv || 0), p.z);
        m.children[1].visible = mi.armed && Math.floor(time * 4) % 2 === 0;
      });
      this.hideFrom(this.minePool, minesHere.length);

      // Power-ups: spinning crystal + ground ring + icon
      const live = new Set();
      for (const pu of state.powerups) {
        live.add(pu.id);
        let m = this.powerups.get(pu.id);
        if (!m) {
          m = new THREE.Group();
          const col = POWER_COLOR[pu.type];
          const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.7, 0), new THREE.MeshLambertMaterial({ color: col, emissive: col, emissiveIntensity: 0.6, flatShading: true }));
          gem.castShadow = true;
          m.add(gem);
          const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.2, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.7, depthWrite: false }));
          ring.position.y = 0.06;
          m.add(ring);
          const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTexture(128, 128, c => {
            c.font = '96px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
            c.fillText(POWER_ICON[pu.type], 64, 70);
          }), depthWrite: false }));
          icon.scale.set(1.1, 1.1, 1);
          m.add(icon);
          const p = this.toWorld(pu.x, pu.y);
          m.position.set(p.x, 0, p.z);
          this.scene.add(m);
          this.powerups.set(pu.id, m);
        }
        m.visible = (pu.lv || 0) === this.viewLevel;
        m.position.y = levelY(pu.lv || 0);
        const bob = Math.sin(time * 3 + m.position.x) * 0.2;
        m.children[0].position.y = 1.2 + bob;
        m.children[0].rotation.y = time * 2;
        m.children[2].position.y = 2.4 + bob;
        m.children[1].scale.setScalar(1 + Math.sin(time * 5) * 0.08);
      }
      for (const [id, m] of this.powerups) if (!live.has(id)) { this.scene.remove(m); this.powerups.delete(id); }
    }
    this.render(dt, time, me);
    return me;
  }

  damageText(p, dmg, yo = 0) {
    let t = this.texts.find(s => !s.visible);
    if (!t) {
      const c = document.createElement('canvas');
      c.width = 128; c.height = 64;
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      t = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
      t.scale.set(2, 1, 1);
      t.renderOrder = 20;
      this.scene.add(t);
      this.texts.push(t);
    }
    const c = t.material.map.image, g = c.getContext('2d');
    g.clearRect(0, 0, 128, 64);
    g.font = 'bold 44px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 7; g.strokeStyle = '#3b0a0a'; g.strokeText('-' + dmg, 64, 34);
    g.fillStyle = dmg >= 20 ? '#ff3b3b' : '#ffd166'; g.fillText('-' + dmg, 64, 34);
    t.material.map.needsUpdate = true;
    t.position.set(p.x + (Math.random() - 0.5), 4 + yo, p.z);
    t.userData = { t: 0, y: 4 + yo };
    t.visible = true;
  }

  clearMatch() {
    this.snapCam = true;
    this.viewLevel = 0;
    for (const id of [...this.cars.keys()]) this.removeCar(id);
    for (const m of this.powerups.values()) this.scene.remove(m);
    this.powerups.clear();
    this.particles = [];
    [this.bulletPool, this.rocketPool, this.minePool].forEach(p => this.hideFrom(p, 0));
  }

  // Keeps the frame rate smooth on weak laptops: every 2 s, lower the resolution when slower than
  // ~45 fps (down to 0.6x), turn shadows off if it is still slow, and raise quality again when fast.
  adapt(dt) {
    if (!this.arenaBuilt) return;
    const p = this.perf;
    p.t += dt; p.frames++;
    if (p.t < 2) return;
    const fps = p.frames / p.t;
    p.t = 0; p.frames = 0;
    let pr = this.pr;
    if (fps < 45) pr = Math.max(0.6, pr * 0.85);
    else if (fps > 57) pr = Math.min(this.maxPR, pr * 1.1);
    if (fps < 30 && this.pr <= 0.65 && this.renderer.shadowMap.enabled) {
      this.renderer.shadowMap.enabled = false; // shadows are the next most expensive thing
      this.sun.castShadow = false;
      this.scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
    }
    if (Math.abs(pr - this.pr) > 0.01) { this.pr = pr; this.renderer.setPixelRatio(pr); this.resize(); }
  }

  render(dt, time, me) {
    // Particles
    this.particles = this.particles.filter(p => (p.life -= dt) > 0);
    const pm = this.particleMesh;
    pm.count = Math.min(this.particles.length, 500);
    for (let i = 0; i < pm.count; i++) {
      const p = this.particles[i];
      if (p.rise) { p.v.multiplyScalar(0.98); p.s += dt * 0.6; } else p.v.y -= 18 * dt;
      p.p.addScaledVector(p.v, dt);
      const fy = (p.fy || 0) + 0.1;
      if (p.p.y < fy) { p.p.y = fy; p.v.multiplyScalar(0.5); p.v.y *= -0.3; }
      const s = p.s * Math.max(0.1, p.life / p.max);
      tmpM.compose(p.p, tmpQ.setFromEuler(new THREE.Euler(p.life * 5, p.life * 3, 0)), tmpS.set(s, s, s));
      pm.setMatrixAt(i, tmpM);
      pm.setColorAt(i, p.c);
    }
    pm.instanceMatrix.needsUpdate = true;
    if (pm.instanceColor) pm.instanceColor.needsUpdate = true;
    for (const b of this.boomPool) {
      if (!b.visible) continue;
      b.userData.t += dt;
      const t = b.userData.t / 0.45;
      if (t >= 1) { b.visible = false; continue; }
      b.scale.setScalar((0.5 + t * 3) * b.userData.big);
      b.material.opacity = 1 - t;
    }

    // Camera
    let pos, look;
    if (me && this.camMode === 'chase') {
      const yaw = me.car.a + this.camYaw;
      const d = this.camDist;
      pos = new THREE.Vector3(me.car.x - Math.cos(yaw) * d, d * 0.55 + 1.5 + me.car.y, me.car.z - Math.sin(yaw) * d);
      look = new THREE.Vector3(me.car.x + me.dir.x * 6, 1.5 + me.car.y, me.car.z + me.dir.z * 6);
    } else if (me) {
      pos = new THREE.Vector3(me.car.x, this.camDist * 3.2 + me.car.y, me.car.z + this.camDist * 1.4);
      look = new THREE.Vector3(me.car.x, me.car.y, me.car.z);
    } else {
      const R = this.arenaBuilt ? Math.max(this.hw, this.hh) : 40, a = time * 0.06 + this.camYaw;
      pos = new THREE.Vector3(Math.cos(a) * (R * 1.3 + 12), R * 0.75 + 8, Math.sin(a) * (R * 1.3 + 12));
      look = new THREE.Vector3(0, 0, 0);
    }
    // Floating damage numbers
    for (const t of this.texts) {
      if (!t.visible) continue;
      t.userData.t += dt;
      const u = t.userData.t / 0.9;
      if (u >= 1) { t.visible = false; continue; }
      t.position.y = t.userData.y + u * 2;
      t.material.opacity = 1 - u * u;
    }
    const k = Math.min(1, dt * (me ? 6 : 2));
    if (this.snapCam && me) { this.camPos.copy(pos); this.camLook.copy(look); this.snapCam = false; }
    this.camPos.lerp(pos, k);
    this.camLook.lerp(look, k);
    this.camera.position.copy(this.camPos);
    if (this.lamp.visible) this.lamp.position.copy(this.camLook).add(new THREE.Vector3(0, 4, 0));
    this.sun.target.position.copy(this.camLook);
    this.sun.position.copy(this.camLook).add(new THREE.Vector3(-30, 55, 25));
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 1.8);
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
    }
    this.camera.lookAt(this.camLook);
    this.adapt(dt);
    this.renderer.render(this.scene, this.camera);
  }
}
