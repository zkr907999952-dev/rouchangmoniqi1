import * as THREE from "three";

type Wave = { x: number; y: number; z: number; t: number; force: number; range: number };

type Tube = { positions: Float32Array; count: number };

export class BellyStrike {
  private waves: Wave[] = [];
  private tubes: Tube[] = [];

  attach(root: THREE.Object3D) {
    this.tubes.length = 0;
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      const pos = mesh.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
      if (!pos || !(pos.array instanceof Float32Array) || pos.count < 24) return;
      this.tubes.push({ positions: pos.array, count: pos.count });
    });
  }

  get active() {
    return this.waves.length > 0;
  }

  fire(x: number, y: number, z: number, force: number, range: number) {
    this.waves.push({
      x,
      y,
      z,
      t: 0,
      force: THREE.MathUtils.clamp(force, 0.08, 1),
      range: THREE.MathUtils.clamp(range, 0.05, 1),
    });
    if (this.waves.length > 4) this.waves.shift();
  }

  step(dt: number) {
    const d = Math.min(dt, 0.05);
    for (const w of this.waves) w.t += d;
    this.waves = this.waves.filter((w) => w.t < 3.6);
  }

  apply(rebound = 0.58) {
    if (!this.waves.length) return;
    const rec = 1.05 + (1 - THREE.MathUtils.clamp(rebound, 0, 1)) * 2.4;
    const decay = 0.28 + rebound * 0.85;
    for (const tube of this.tubes) {
      const { positions, count } = tube;
      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        let px = positions[i3]!;
        let py = positions[i3 + 1]!;
        let pz = positions[i3 + 2]!;
        for (const w of this.waves) {
          const dx = px - w.x;
          const dy = py - w.y;
          const r = Math.hypot(dx, dy);
          const span = 0.055 + w.range * 0.13;
          const ringR = w.t * (0.18 + w.range * 0.15);
          const width = 0.03 + w.range * 0.024;
          const life = Math.max(0, 1 - w.t / rec);
          const fade = life * life * (3 - 2 * life);
          const ring = Math.exp(-((r - ringR) / width) * ((r - ringR) / width));
          const hole = Math.exp(-(r * r) / (span * span * 0.55)) * Math.exp(-w.t * decay);
          const amp = w.force * fade;
          const inv = r < 1e-4 ? 0 : 1 / r;
          const push = amp * (0.03 * ring + 0.026 * hole);
          const crush = amp * (0.062 * hole + 0.018 * ring);
          px += dx * inv * push;
          py += dy * inv * push * 0.7;
          pz -= crush;
        }
        positions[i3] = px;
        positions[i3 + 1] = py;
        positions[i3 + 2] = pz;
      }
    }
  }

  ringRadius() {
    const w = this.waves[this.waves.length - 1];
    if (!w) return 0;
    return w.t * (0.2 + w.range * 0.16);
  }

  ringOpacity() {
    const w = this.waves[this.waves.length - 1];
    if (!w) return 0;
    return Math.max(0, 1 - w.t / 1.2) * 0.85 * w.force;
  }

  lastOrigin(out: THREE.Vector3) {
    const w = this.waves[this.waves.length - 1];
    if (!w) {
      out.set(0, 0, 0);
      return false;
    }
    out.set(w.x, w.y, w.z);
    return true;
  }
}
