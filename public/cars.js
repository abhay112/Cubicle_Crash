// Real car models. Every car is a .glb in /models/<id>.glb (shrunk by tools/optimize-models.sh).
// Models are fetched on demand, so a match only downloads the cars its players actually picked.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Length of each car in game units (collision radius is 1.2). Models are scaled to match.
const LENGTH = { swift: 3.2, punch: 3.2, sonet: 3.4, nexon: 3.4, brezza: 3.5, creta: 3.6, ertiga: 3.9, thar: 3.4, scorpio: 3.8, fortuner: 3.9 };
export const DEFAULT_CAR = 'brezza';

const realModels = {};
const loading = {};
let available = new Set();
export const setAvailableModels = ids => { available = new Set(ids); };
export const isRealLoaded = id => !!realModels[id];
export const hasCar = id => available.has(id);

const toFloat = attr => {
  if (attr.array instanceof Float32Array && !attr.isInterleavedBufferAttribute) return attr.clone();
  const out = new Float32Array(attr.count * attr.itemSize);
  for (let i = 0; i < attr.count; i++) for (let c = 0; c < attr.itemSize; c++) out[i * attr.itemSize + c] = attr.getComponent(i, c);
  return new THREE.BufferAttribute(out, attr.itemSize);
};

// Bake a model's parts into one mesh per material so each car costs a handful of draw calls.
function mergeByMaterial(root) {
  root.updateMatrixWorld(true);
  const groups = new Map();
  root.traverse(o => {
    if (!o.isMesh || !o.geometry.attributes.position) return;
    const src = o.geometry, geo = new THREE.BufferGeometry();
    geo.setAttribute('position', toFloat(src.attributes.position));
    if (src.attributes.normal) geo.setAttribute('normal', toFloat(src.attributes.normal));
    geo.setAttribute('uv', src.attributes.uv ? toFloat(src.attributes.uv) : new THREE.BufferAttribute(new Float32Array(src.attributes.position.count * 2), 2));
    geo.setIndex(src.index ? src.index.clone() : [...Array(src.attributes.position.count).keys()]);
    geo.applyMatrix4(o.matrixWorld);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    const mat = (Array.isArray(o.material) ? o.material : [o.material])[0];
    if (!groups.has(mat)) groups.set(mat, []);
    groups.get(mat).push(geo);
  });
  const out = new THREE.Group();
  for (const [mat, geos] of groups) out.add(new THREE.Mesh(mergeGeometries(geos, false), mat));
  return out;
}

export function ensureModel(id) {
  if (!available.has(id) || realModels[id]) return Promise.resolve();
  return loading[id] ||= new GLTFLoader().loadAsync(`/models/${id}.glb`)
    .then(g => { realModels[id] = mergeByMaterial(g.scene); })
    .catch(e => { console.warn('Model failed', id, e); delete loading[id]; });
}

// Cars whose nose points the wrong way after loading (checked by eye); 1 = fine, -1 = flip.
const FRONT = { sonet: -1, brezza: -1, creta: -1, ertiga: -1, thar: -1, scorpio: -1 };
export const setFront = (id, v) => { FRONT[id] = v; }; // for quick experiments from the console

// Returns null until the model has been loaded. The game waits for models before a match starts.
export function buildCar(id, color) {
  if (!realModels[id]) return null;
  const L = LENGTH[id] || 3.5;
  const g = new THREE.Group();
  const model = realModels[id].clone(true);
  const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3());
  if (size.z > size.x) model.rotation.y = Math.PI / 2; // cars face +x in the game
  box.setFromObject(model); box.getSize(size);
  model.scale.multiplyScalar(L / size.x);
  box.setFromObject(model);
  const ctr = box.getCenter(new THREE.Vector3());
  model.position.sub(new THREE.Vector3(ctr.x, box.min.y, ctr.z));
  const flashMats = [];
  model.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.material = o.material.clone();
    if (o.material.emissive) flashMats.push(o.material);
  });
  // Pivot at the car's centre so a flip keeps it in place
  const holder = new THREE.Group();
  holder.add(model);
  if ((FRONT[id] ?? 1) === -1) holder.rotation.y = Math.PI;
  g.add(holder);
  // Underglow ring in the player's colour so everyone can tell the cars apart
  const ring = new THREE.Mesh(new THREE.RingGeometry(L * 0.55, L * 0.68, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }));
  ring.position.y = 0.05;
  g.add(ring);
  // One object that flashes every material at once when the car is hit
  const bodyMat = { emissive: { setRGB: (r, gg, b) => flashMats.forEach(m => m.emissive.setRGB(r, gg, b)) } };
  const height = new THREE.Box3().setFromObject(holder).max.y;
  return { group: g, wheels: [], bodyMat, height, length: L };
}

// Small turntable renderer used by the car picker
export class CarPreview {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#6b4a3a', 1.3));
    const sun = new THREE.DirectionalLight('#fff0d8', 2.4);
    sun.position.set(-4, 7, 5);
    this.scene.add(sun);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(2.6, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.25 }));
    floor.position.y = 0.01;
    this.scene.add(floor);
    this.camera = new THREE.PerspectiveCamera(32, 2, 0.1, 50);
    this.camera.position.set(0, 3.6, 10.5);
    this.camera.lookAt(0, 2.2, 0);
    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);
    this.spin = 0;
    const loop = () => {
      requestAnimationFrame(loop);
      if (!canvas.offsetParent) return;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * this.renderer.getPixelRatio())) { this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
      if (!this.paused) this.spin += 0.012;
      this.pivot.rotation.y = this.spin;
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }
  // Shows the car once its model has arrived; returns false while it is still loading
  setCar(id, color) {
    for (const c of [...this.pivot.children]) this.pivot.remove(c);
    const car = buildCar(id, color);
    if (!car) return false;
    car.group.scale.setScalar(1.15 * (3.5 / Math.max(3.5, car.length)));
    this.pivot.add(car.group);
    return true;
  }
}
