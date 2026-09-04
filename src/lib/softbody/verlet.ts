import type { VertexMeta } from "./body-geometry";

export type SoftParams = {
  stiffness: number;
  damping: number;
  gravity: number;
  pressure: number;
  jiggle: number;
  wind: number;
  time: number;
  breathing: boolean;
};

type Spring = { a: number; b: number; rest: number };

const MAX_OFFSET = 0.18;

export class SoftAbdomen {
  readonly count: number;
  readonly pos: Float32Array;
  readonly prev: Float32Array;
  readonly rest: Float32Array;
  readonly invMass: Float32Array;
  readonly weight: Float32Array;
  readonly radius: Float32Array;
  readonly spineZ: Float32Array;
  readonly nx: Float32Array;
  readonly ny: Float32Array;
  readonly nz: Float32Array;
  readonly springs: Spring[];
  private acc = 0;
  private readonly positionsAttr: Float32Array;
  energy = 0;

  constructor(
    positions: Float32Array,
    meta: VertexMeta[],
    radial: number,
    rings: number,
  ) {
    this.count = meta.length;
    this.positionsAttr = positions;
    this.pos = new Float32Array(positions);
    this.prev = new Float32Array(positions);
    this.rest = new Float32Array(positions);
    this.invMass = new Float32Array(this.count);
    this.weight = new Float32Array(this.count);
    this.radius = new Float32Array(this.count);
    this.spineZ = new Float32Array(this.count);
    this.nx = new Float32Array(this.count);
    this.ny = new Float32Array(this.count);
    this.nz = new Float32Array(this.count);

    for (let i = 0; i < this.count; i++) {
      const m = meta[i];
      this.weight[i] = m.soft;
      this.radius[i] = m.restRadius;
      this.spineZ[i] = m.spineZ;
      this.nx[i] = m.nx;
      this.ny[i] = m.ny;
      this.nz[i] = m.nz;
      this.invMass[i] = m.soft > 0.04 ? 1 : 0;
    }

    this.springs = [];
    const addSpring = (a: number, b: number, kScale = 1) => {
      if (a === b) return;
      if (this.invMass[a] === 0 && this.invMass[b] === 0) return;
      const ax = this.rest[a * 3];
      const ay = this.rest[a * 3 + 1];
      const az = this.rest[a * 3 + 2];
      const bx = this.rest[b * 3];
      const by = this.rest[b * 3 + 1];
      const bz = this.rest[b * 3 + 2];
      const rest = Math.hypot(ax - bx, ay - by, az - bz);
      if (rest < 1e-5) return;
      this.springs.push({ a, b, rest: rest * kScale });
    };

    for (let iy = 0; iy < rings; iy++) {
      for (let ix = 0; ix < radial; ix++) {
        const i = iy * radial + ix;
        const right = iy * radial + ((ix + 1) % radial);
        addSpring(i, right);
        if (iy + 1 < rings) {
          const up = (iy + 1) * radial + ix;
          const upRight = (iy + 1) * radial + ((ix + 1) % radial);
          addSpring(i, up);
          addSpring(i, upRight);
        }
        if (iy + 2 < rings) {
          addSpring(i, (iy + 2) * radial + ix);
        }
        addSpring(i, iy * radial + ((ix + 2) % radial));
      }
    }
  }

  reset() {
    this.pos.set(this.rest);
    this.prev.set(this.rest);
    this.positionsAttr.set(this.rest);
    this.energy = 0;
    this.acc = 0;
  }

  shake(strength = 0.045) {
    for (let i = 0; i < this.count; i++) {
      if (this.invMass[i] === 0) continue;
      const w = this.weight[i];
      const i3 = i * 3;
      this.prev[i3] -= (Math.random() - 0.5) * 2 * strength * w;
      this.prev[i3 + 1] -= (Math.random() * 0.4 + 0.2) * strength * w;
      this.prev[i3 + 2] -= (Math.random() * 0.6 + 0.4) * strength * w;
    }
  }

  applyImpulse(px: number, py: number, pz: number, dx: number, dy: number, dz: number, radius: number, strength: number) {
    const r2 = radius * radius;
    for (let i = 0; i < this.count; i++) {
      if (this.invMass[i] === 0) continue;
      const i3 = i * 3;
      const ox = this.pos[i3] - px;
      const oy = this.pos[i3 + 1] - py;
      const oz = this.pos[i3 + 2] - pz;
      const d2 = ox * ox + oy * oy + oz * oz;
      if (d2 > r2) continue;
      const d = Math.sqrt(d2) || 1e-5;
      const falloff = (1 - d / radius) ** 2 * this.weight[i];
      const s = strength * falloff;
      this.pos[i3] += dx * s;
      this.pos[i3 + 1] += dy * s;
      this.pos[i3 + 2] += dz * s;
    }
  }

  grab(px: number, py: number, pz: number, tx: number, ty: number, tz: number, radius: number) {
    const r2 = radius * radius;
    for (let i = 0; i < this.count; i++) {
      if (this.invMass[i] === 0) continue;
      const i3 = i * 3;
      const ox = this.rest[i3] - px;
      const oy = this.rest[i3 + 1] - py;
      const oz = this.rest[i3 + 2] - pz;
      const d2 = ox * ox + oy * oy + oz * oz;
      if (d2 > r2 * 2.2) continue;
      const d = Math.sqrt(d2) || 1e-5;
      const falloff = (1 - Math.min(d / radius, 1)) ** 1.4 * this.weight[i];
      if (falloff <= 0) continue;
      const gx = tx + ox * 0.35;
      const gy = ty + oy * 0.35;
      const gz = tz + oz * 0.35;
      const k = Math.min(1, falloff * 1.15);
      this.pos[i3] += (gx - this.pos[i3]) * k;
      this.pos[i3 + 1] += (gy - this.pos[i3 + 1]) * k;
      this.pos[i3 + 2] += (gz - this.pos[i3 + 2]) * k;
      this.prev[i3] += (this.pos[i3] - this.prev[i3]) * 0.35;
      this.prev[i3 + 1] += (this.pos[i3 + 1] - this.prev[i3 + 1]) * 0.35;
      this.prev[i3 + 2] += (this.pos[i3 + 2] - this.prev[i3 + 2]) * 0.35;
    }
  }

  step(dt: number, params: SoftParams) {
    const capped = Math.min(dt, 0.08);
    this.acc += capped;
    const fixed = 1 / 60;
    let steps = 0;
    while (this.acc >= fixed && steps < 4) {
      this.integrate(fixed, params);
      this.acc -= fixed;
      steps++;
    }
    this.positionsAttr.set(this.pos);
  }

  private integrate(dt: number, params: SoftParams) {
    const damp = 0.82 + params.damping * 0.175;
    const g = params.gravity * (0.35 + params.jiggle * 0.65);
    const wind =
      Math.sin(params.time * 1.7) * params.wind * 2.4 +
      Math.sin(params.time * 0.9) * params.wind * 1.1;
    const breath = params.breathing ? (Math.sin(params.time * 1.35) * 0.5 + 0.5) * 0.011 : 0;
    const dt2 = dt * dt;
    const jiggle = Math.max(0.15, params.jiggle);

    let energy = 0;

    for (let i = 0; i < this.count; i++) {
      const w = this.weight[i] * jiggle;
      if (this.invMass[i] === 0 || w <= 0.001) continue;
      const i3 = i * 3;
      let x = this.pos[i3];
      let y = this.pos[i3 + 1];
      let z = this.pos[i3 + 2];
      const vx = (x - this.prev[i3]) * damp;
      const vy = (y - this.prev[i3 + 1]) * damp;
      const vz = (z - this.prev[i3 + 2]) * damp;
      this.prev[i3] = x;
      this.prev[i3 + 1] = y;
      this.prev[i3 + 2] = z;
      x += vx;
      y += vy + g * dt2 * w;
      z += vz + wind * dt2 * w;
      this.pos[i3] = x;
      this.pos[i3 + 1] = y;
      this.pos[i3 + 2] = z;
    }

    const iterations = 6 + Math.round(params.stiffness * 4);
    const kSpring = 0.22 + params.stiffness * 0.55;
    for (let it = 0; it < iterations; it++) {
      const springs = this.springs;
      for (let s = 0; s < springs.length; s++) {
        const sp = springs[s];
        const a = sp.a;
        const b = sp.b;
        const a3 = a * 3;
        const b3 = b * 3;
        const wA = this.invMass[a];
        const wB = this.invMass[b];
        const wSum = wA + wB;
        if (wSum === 0) continue;
        let dx = this.pos[a3] - this.pos[b3];
        let dy = this.pos[a3 + 1] - this.pos[b3 + 1];
        let dz = this.pos[a3 + 2] - this.pos[b3 + 2];
        const dist = Math.hypot(dx, dy, dz) || 1e-6;
        const diff = ((dist - sp.rest) / dist) * kSpring;
        const inv = diff / wSum;
        this.pos[a3] -= dx * inv * wA;
        this.pos[a3 + 1] -= dy * inv * wA;
        this.pos[a3 + 2] -= dz * inv * wA;
        this.pos[b3] += dx * inv * wB;
        this.pos[b3 + 1] += dy * inv * wB;
        this.pos[b3 + 2] += dz * inv * wB;
      }

      const kVol = 0.18 + params.pressure * 0.5;
      const kShape = 0.025 + params.stiffness * 0.12;
      for (let i = 0; i < this.count; i++) {
        if (this.invMass[i] === 0) continue;
        const w = this.weight[i] * jiggle;
        const i3 = i * 3;
        const restX = this.rest[i3];
        const restY = this.rest[i3 + 1];
        const restZ = this.rest[i3 + 2];
        const bx = breath * this.nx[i] * w;
        const by = breath * this.ny[i] * w * 0.35;
        const bz = breath * this.nz[i] * w;
        const tx = restX + bx;
        const ty = restY + by;
        const tz = restZ + bz;

        let x = this.pos[i3];
        let y = this.pos[i3 + 1];
        let z = this.pos[i3 + 2];

        const sx = 0;
        const sz = this.spineZ[i];
        let ox = x - sx;
        let oz = z - sz;
        const r = Math.hypot(ox, oz) || 1e-6;
        const restR = this.radius[i] + breath * 0.55 * w;
        const minR = restR * 0.62;
        if (r < minR) {
          const s = minR / r;
          x = sx + ox * s;
          z = sz + oz * s;
          ox = x - sx;
          oz = z - sz;
        }
        const vol = ((restR - Math.hypot(ox, oz)) / (Math.hypot(ox, oz) || 1e-6)) * kVol * w;
        x += ox * vol;
        z += oz * vol;

        x += (tx - x) * kShape * (0.35 + (1 - w) * 0.65);
        y += (ty - y) * (kShape + 0.04);
        z += (tz - z) * kShape * (0.35 + (1 - w) * 0.65);

        let dx = x - tx;
        let dy = y - ty;
        let dz = z - tz;
        const len = Math.hypot(dx, dy, dz);
        const maxOff = MAX_OFFSET * (0.55 + w * 0.7);
        if (len > maxOff) {
          const s = maxOff / len;
          x = tx + dx * s;
          y = ty + dy * s;
          z = tz + dz * s;
          dx *= s;
          dy *= s;
          dz *= s;
        }

        this.pos[i3] = x;
        this.pos[i3 + 1] = y;
        this.pos[i3 + 2] = z;
        energy += dx * dx + dy * dy + dz * dz;
      }
    }

    this.energy = energy;
  }
}
