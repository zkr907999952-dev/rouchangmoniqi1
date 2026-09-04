import * as THREE from "three";
import type { TubeAlong } from "@/lib/softbody/peristalsis";

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _axisY = new THREE.Vector3(0, 1, 0);
const _side = new THREE.Vector3();
const _bin = new THREE.Vector3();
const MIN_PITCH = 0.3;
const MAX_PITCH = 1.22;

export class FistPlay {
  readonly root = new THREE.Group();
  depth = 0.018;
  enabled = false;
  readonly anus = new THREE.Vector3();
  readonly tip = new THREE.Vector3();
  readonly dir = new THREE.Vector3(0, 0.85, 0.5);
  readonly entry = new THREE.Vector3(0, 0.85, 0.5);
  readonly mid = new THREE.Vector3();
  private readonly baseDir = new THREE.Vector3(0, 0.85, 0.5);
  private baseDepth = 0.018;
  private thrustPhase = 0;
  private stirPhase = 0;
  arousal = 0;
  private colon: TubeAlong | null = null;
  private armPos: THREE.BufferAttribute | null = null;
  private armRest: Float32Array | null = null;
  private armCount = 0;
  private armLen = 0.38;
  private yMin = 0.7;
  private yMax = 1.15;
  private maxScale = 1;
  private wallZ = 0.1;
  private slices: { y: number; halfX: number }[] = [];

  attach(arm: THREE.Object3D, tubes: TubeAlong[], rectumHint: THREE.Vector3) {
    this.root.clear();
    this.colon = pickColon(tubes);
    this.anus.copy(rectumHint);
    this.entry.copy(entryFromColon(this.colon, rectumHint));
    this.dir.copy(this.entry);
    this.anus.addScaledVector(this.entry, 0.01);
    const prepared = prepareArm(arm);
    this.armLen = prepared.len;
    this.armPos = prepared.pos;
    this.armRest = prepared.rest;
    this.armCount = prepared.count;
    this.root.add(prepared.root);
    this.root.visible = false;
    this.reset();
    this.layoutArm();
  }

  setEnvelope(yMin: number, yMax: number, slices: { y: number; halfX: number }[]) {
    this.yMin = yMin;
    this.yMax = yMax;
    this.slices = slices;
    this.clampLateral();
    this.baseDir.copy(this.dir);
    this.baseDepth = this.depth;
    this.layoutArm();
  }

  setMid(navel: THREE.Vector3) {
    this.mid.copy(navel);
    this.wallZ = navel.z - 0.004;
  }

  wallOver() {
    const palm = Math.max(0.01, this.depth - 0.038);
    const fz = this.anus.z + this.dir.z * palm;
    const gap = this.wallZ - fz;
    const along = gap / Math.max(0.18, this.dir.z);
    return Math.max(0, 0.058 - along);
  }

  setMaxScale(scale: number) {
    this.maxScale = THREE.MathUtils.clamp(scale, 0.5, 1.5);
    this.depth = Math.min(this.depth, this.reach());
    this.baseDepth = Math.min(this.baseDepth, this.reach());
  }

  private reach() {
    return this.armLen * 0.86 * this.maxScale;
  }

  reset() {
    this.depth = 0.018;
    this.dir.copy(this.entry);
    this.baseDir.copy(this.entry);
    this.baseDepth = 0.018;
    this.thrustPhase = 0;
    this.stirPhase = 0;
    this.arousal = 0;
    this.tip.copy(this.anus).addScaledVector(this.dir, this.depth);
  }

  setEnabled(on: boolean) {
    if (this.enabled === on) {
      this.root.visible = on;
      return;
    }
    this.enabled = on;
    this.root.visible = on;
    if (!on) this.reset();
    else this.layoutArm();
  }

  dragTo(_from: THREE.Vector3, to: THREE.Vector3) {
    if (!this.enabled) return;
    _v.copy(to).sub(this.anus);
    const inward = _v.dot(this.entry);
    const len = _v.length();
    if (len < 1e-5) return;
    if (inward > 0.004) {
      this.dir.copy(_v).normalize();
      this.clampPitch();
      this.depth = THREE.MathUtils.clamp(len, 0.012, this.reach());
    } else {
      this.depth = Math.max(0.012, this.depth + inward);
      _n.copy(_v).addScaledVector(this.entry, -inward);
      if (_n.lengthSq() > 1e-8) {
        this.dir.addScaledVector(_n.normalize(), 0.28).normalize();
        this.clampPitch();
      }
    }
    this.clampLateral();
    this.baseDir.copy(this.dir);
    this.baseDepth = this.depth;
  }

  private halfXAt(y: number) {
    const sl = this.slices;
    if (sl.length === 0) return 0.08;
    if (y <= sl[0]!.y) return sl[0]!.halfX;
    const last = sl[sl.length - 1]!;
    if (y >= last.y) return last.halfX;
    for (let i = 1; i < sl.length; i++) {
      const a = sl[i - 1]!;
      const b = sl[i]!;
      if (y > b.y) continue;
      const t = (y - a.y) / Math.max(1e-5, b.y - a.y);
      return a.halfX + (b.halfX - a.halfX) * t;
    }
    return last.halfX;
  }

  private clampPitch() {
    const pitch = Math.atan2(Math.max(0, this.dir.z), Math.max(0.04, this.dir.y));
    const p = THREE.MathUtils.clamp(pitch, MIN_PITCH, MAX_PITCH);
    const xz = this.dir.x;
    this.dir.y = Math.cos(p);
    this.dir.z = Math.sin(p);
    this.dir.x = xz;
    this.dir.normalize();
  }

  private clampLateral() {
    this.clampPitch();
    const fy = THREE.MathUtils.clamp(this.anus.y + this.dir.y * this.depth, this.yMin, this.yMax);
    const half = Math.max(0.03, this.halfXAt(fy) * 0.72);
    const fx = THREE.MathUtils.clamp(this.anus.x + this.dir.x * this.depth, -half, half);
    const fz = Math.max(this.anus.z + 0.01, this.anus.z + this.dir.z * this.depth);
    _v.set(fx - this.anus.x, fy - this.anus.y, fz - this.anus.z);
    const len = _v.length();
    if (len < 1e-5) return;
    this.dir.copy(_v).normalize();
    this.clampPitch();
    this.depth = THREE.MathUtils.clamp(len, 0.012, this.reach());
  }

  step(
    dt: number,
    opts: {
      thrust: boolean;
      stir: boolean;
      thrustSpeed: number;
      thrustStart: number;
      stirSpeed: number;
      stirRadius: number;
    },
  ) {
    if (!this.enabled) {
      this.arousal += (0 - this.arousal) * (1 - Math.exp(-2.1 * dt));
      return;
    }
    this.dir.copy(this.baseDir);
    this.depth = this.baseDepth;
    if (opts.thrust) {
      this.thrustPhase += dt * (0.35 + opts.thrustSpeed * 1.7);
      const wave = 0.5 - 0.5 * Math.cos(this.thrustPhase);
      const start = THREE.MathUtils.clamp(opts.thrustStart, 0.012, Math.max(0.014, this.baseDepth - 0.004));
      this.depth = start + (this.baseDepth - start) * wave;
    }
    if (opts.stir) {
      this.stirPhase += dt * (0.45 + opts.stirSpeed * 2.5);
      const r = 0.005 + opts.stirRadius * 0.034;
      _side.crossVectors(this.dir, _axisY);
      if (_side.lengthSq() < 1e-6) _side.set(1, 0, 0);
      _side.normalize();
      _bin.crossVectors(this.dir, _side).normalize();
      const c = Math.cos(this.stirPhase);
      const s = Math.sin(this.stirPhase);
      const fx = this.anus.x + this.dir.x * this.depth + (_side.x * c + _bin.x * s) * r;
      const fy = this.anus.y + this.dir.y * this.depth + (_side.y * c + _bin.y * s) * r;
      const fz = this.anus.z + this.dir.z * this.depth + (_side.z * c + _bin.z * s) * r;
      _v.set(fx - this.anus.x, fy - this.anus.y, fz - this.anus.z);
      const len = _v.length();
      if (len > 1e-5) {
        this.dir.copy(_v).normalize();
        this.clampPitch();
        this.depth = THREE.MathUtils.clamp(len, 0.012, this.reach());
      }
    }
    const inBody = this.depth > 0.042;
    let want = 0;
    if (inBody) {
      want = 0.48 + THREE.MathUtils.clamp((this.depth - 0.042) / 0.2, 0, 1) * 0.4;
      if (opts.thrust) want = Math.min(1, want + 0.18);
      if (opts.stir) want = Math.min(1, want + 0.32);
    }
    const k = want > this.arousal ? 2.6 : 1.7;
    this.arousal += (want - this.arousal) * (1 - Math.exp(-k * dt));
  }

  apply(gut = 1, keepPose = false) {
    if (!this.enabled) return;
    if (!keepPose) {
      this.dir.copy(this.baseDir);
      this.depth = this.baseDepth;
      this.clampLateral();
      this.baseDir.copy(this.dir);
      this.baseDepth = this.depth;
    }
    this.layoutArm();
    this.deformColon(gut);
  }

  belly() {
    if (!this.enabled || this.depth < 0.025) {
      return { depth: 0, start: 0, x: this.anus.x, y: this.anus.y, z: this.anus.z, lx: 0, lz: 0 };
    }
    return {
      depth: this.wallOver(),
      start: 0,
      x: this.tip.x,
      y: this.tip.y,
      z: this.tip.z,
      lx: this.dir.x - this.entry.x,
      lz: this.dir.z - this.entry.z,
    };
  }

  private layoutArm() {
    if (!this.armPos || !this.armRest) return;
    _q.setFromUnitVectors(_axisY, this.dir);
    const fx = this.anus.x + this.dir.x * this.depth;
    const fy = this.anus.y + this.dir.y * this.depth;
    const fz = this.anus.z + this.dir.z * this.depth;
    this.tip.set(fx, fy, fz);
    const rest = this.armRest;
    const arr = this.armPos.array as Float32Array;
    for (let i = 0; i < this.armCount; i++) {
      const i3 = i * 3;
      _v.set(rest[i3]!, rest[i3 + 1]!, rest[i3 + 2]!);
      _v.applyQuaternion(_q);
      arr[i3] = _v.x + fx;
      arr[i3 + 1] = _v.y + fy;
      arr[i3 + 2] = _v.z + fz;
    }
    this.armPos.needsUpdate = true;
    let sx = 0;
    let sy = 0;
    let sz = 0;
    let n = 0;
    for (let i = 0; i < this.armCount; i++) {
      const ry = rest[i * 3 + 1]!;
      if (ry > -0.018 || ry < -0.1) continue;
      const i3 = i * 3;
      sx += arr[i3]!;
      sy += arr[i3 + 1]!;
      sz += arr[i3 + 2]!;
      n++;
    }
    if (n > 8) {
      this.tip.set(sx / n, sy / n, sz / n);
      this.tip.addScaledVector(this.dir, -0.028);
    } else {
      this.tip.set(fx, fy, fz);
      this.tip.addScaledVector(this.dir, -0.045);
    }
  }

  private deformColon(gut = 1) {
    const tube = this.colon;
    if (!tube || this.depth < 0.02) return;
    const { positions, count } = tube;
    const ax = this.anus.x;
    const ay = this.anus.y;
    const az = this.anus.z;
    const dx = this.dir.x;
    const dy = this.dir.y;
    const dz = this.dir.z;
    const reach = this.depth;
    const rad = 0.018 * (0.55 + gut * 0.7);
    const mix = 0.9 * THREE.MathUtils.clamp(gut, 0, 2);
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const px = positions[i3]!;
      const py = positions[i3 + 1]!;
      const pz = positions[i3 + 2]!;
      const vx = px - ax;
      const vy = py - ay;
      const vz = pz - az;
      const s = THREE.MathUtils.clamp(vx * dx + vy * dy + vz * dz, 0, reach);
      const w = 1 - THREE.MathUtils.smoothstep(reach - 0.01, reach + 0.05, s);
      if (w < 0.02) continue;
      const cx = ax + dx * s;
      const cy = ay + dy * s;
      const cz = az + dz * s;
      let ox = px - cx;
      let oy = py - cy;
      let oz = pz - cz;
      const len = Math.hypot(ox, oy, oz);
      const want = rad + 0.01 * w;
      if (len > 1e-5) {
        const k = Math.max(len, want) / len;
        ox *= k;
        oy *= k;
        oz *= k;
      } else {
        ox = want;
        oy = 0;
        oz = 0;
      }
      const m = w * mix;
      positions[i3] = px + (cx + ox - px) * m;
      positions[i3 + 1] = py + (cy + oy - py) * m;
      positions[i3 + 2] = pz + (cz + oz - pz) * m;
    }
  }
}

function entryFromColon(tube: TubeAlong | null, hint: THREE.Vector3) {
  const d = new THREE.Vector3(0, 0.82, 0.47);
  if (!tube) return d.normalize();
  let x = 0;
  let y = 0;
  let z = 0;
  let n = 0;
  for (let i = 0; i < tube.count; i++) {
    if (tube.along[i]! < 0.88) continue;
    x += tube.positions[i * 3]!;
    y += tube.positions[i * 3 + 1]!;
    z += tube.positions[i * 3 + 2]!;
    n++;
  }
  if (n < 6) return d.normalize();
  d.set(x / n - hint.x, y / n - hint.y, z / n - hint.z);
  if (d.lengthSq() < 1e-6) d.set(0, 0.82, 0.47);
  return d.normalize();
}

function pickColon(tubes: TubeAlong[]) {
  if (tubes.length === 0) return null;
  let best: TubeAlong | null = null;
  let bestY = Infinity;
  for (const t of tubes) {
    let y = 0;
    let n = 0;
    for (let i = 0; i < t.count; i++) {
      if (t.along[i]! < 0.9) continue;
      y += t.positions[i * 3 + 1]!;
      n++;
    }
    if (n < 8) continue;
    y /= n;
    if (y < bestY) {
      bestY = y;
      best = t;
    }
  }
  if (best) return best;
  const order = tubes.map((t, i) => ({ i, n: t.count })).sort((a, b) => b.n - a.n);
  return tubes[order[Math.min(1, order.length - 1)]!.i] ?? tubes[0]!;
}

function prepareArm(src: THREE.Object3D) {
  const holder = new THREE.Group();
  const clone = src.clone(true);
  clone.updateMatrixWorld(true);
  let srcMesh: THREE.Mesh | null = null;
  clone.traverse((obj) => {
    const m = obj as THREE.Mesh;
    if (m.isMesh) srcMesh = m;
  });
  if (!srcMesh) {
    return { root: holder, pos: null, rest: null, count: 0, len: 0.38 };
  }
  const srcM = srcMesh as THREE.Mesh;
  srcM.updateWorldMatrix(true, false);
  const geo = srcM.geometry.clone();
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const arr = pos.array as Float32Array;
  const count = pos.count;
  for (let i = 0; i < count; i++) {
    _v.fromBufferAttribute(pos, i).applyMatrix4(srcM.matrixWorld);
    arr[i * 3] = _v.x;
    arr[i * 3 + 1] = _v.y;
    arr[i * 3 + 2] = _v.z;
  }

  let yMin = Infinity;
  let yMax = -Infinity;
  for (let i = 0; i < count; i++) {
    const y = arr[i * 3 + 1]!;
    if (y < yMin) yMin = y;
    if (y > yMax) yMax = y;
  }
  const span = Math.max(1e-4, yMax - yMin);
  let fistX = 0;
  let fistY = 0;
  let fistZ = 0;
  let fistN = 0;
  let stumpX = 0;
  let stumpY = 0;
  let stumpZ = 0;
  let stumpN = 0;
  for (let i = 0; i < count; i++) {
    const y = arr[i * 3 + 1]!;
    if (y > yMax - span * 0.08) {
      fistX += arr[i * 3]!;
      fistY += y;
      fistZ += arr[i * 3 + 2]!;
      fistN++;
    }
    if (y < yMin + span * 0.08) {
      stumpX += arr[i * 3]!;
      stumpY += y;
      stumpZ += arr[i * 3 + 2]!;
      stumpN++;
    }
  }
  fistX /= Math.max(1, fistN);
  fistY /= Math.max(1, fistN);
  fistZ /= Math.max(1, fistN);
  stumpX /= Math.max(1, stumpN);
  stumpY /= Math.max(1, stumpN);
  stumpZ /= Math.max(1, stumpN);

  _v.set(stumpX - fistX, stumpY - fistY, stumpZ - fistZ);
  if (_v.lengthSq() < 1e-8) _v.set(0, -1, 0);
  _q.setFromUnitVectors(_v.normalize(), new THREE.Vector3(0, -1, 0));
  const targetLen = 0.38;
  const rawLen = Math.hypot(stumpX - fistX, stumpY - fistY, stumpZ - fistZ) || span;
  const scl = targetLen / rawLen;
  for (let i = 0; i < count; i++) {
    _v.set(arr[i * 3]! - fistX, arr[i * 3 + 1]! - fistY, arr[i * 3 + 2]! - fistZ);
    _v.applyQuaternion(_q).multiplyScalar(scl);
    arr[i * 3] = _v.x;
    arr[i * 3 + 1] = _v.y;
    arr[i * 3 + 2] = _v.z;
  }
  geo.computeVertexNormals();
  pos.needsUpdate = true;
  pos.setUsage(THREE.DynamicDrawUsage);

  const mat = new THREE.MeshStandardMaterial({
    color: "#c9947a",
    roughness: 0.52,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 8;
  holder.add(mesh);

  return { root: holder, pos, rest: new Float32Array(arr), count, len: targetLen };
}
