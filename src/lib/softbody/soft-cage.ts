export type CageParams = {
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

type Binding = {
  positions: Float32Array;
  rest: Float32Array;
  weight: Float32Array;
  corners: Int32Array;
  bweights: Float32Array;
};

type Hold =
  | {
      mode: "drag";
      px: number;
      py: number;
      pz: number;
      tx: number;
      ty: number;
      tz: number;
      radius: number;
    }
  | {
      mode: "press";
      px: number;
      py: number;
      pz: number;
      nx: number;
      ny: number;
      nz: number;
      depth: number;
      radius: number;
    };

const MAX_OFF = 0.2;

export class SoftCage {
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  readonly count: number;
  readonly pos: Float32Array;
  readonly prev: Float32Array;
  readonly rest: Float32Array;
  readonly invMass: Float32Array;
  readonly origin: [number, number, number];
  readonly cell: [number, number, number];
  readonly springs: Spring[] = [];
  readonly bindings: Binding[] = [];
  energy = 0;
  private acc = 0;
  private hold: Hold | null = null;

  constructor(
    origin: [number, number, number],
    size: [number, number, number],
    nx = 8,
    ny = 6,
    nz = 6,
  ) {
    this.nx = nx;
    this.ny = ny;
    this.nz = nz;
    this.count = nx * ny * nz;
    this.origin = origin;
    this.cell = [size[0] / (nx - 1), size[1] / (ny - 1), size[2] / (nz - 1)];
    this.pos = new Float32Array(this.count * 3);
    this.prev = new Float32Array(this.count * 3);
    this.rest = new Float32Array(this.count * 3);
    this.invMass = new Float32Array(this.count);

    for (let iz = 0; iz < nz; iz++) {
      for (let iy = 0; iy < ny; iy++) {
        for (let ix = 0; ix < nx; ix++) {
          const i = ix + iy * nx + iz * nx * ny;
          const x = origin[0] + ix * this.cell[0];
          const y = origin[1] + iy * this.cell[1];
          const z = origin[2] + iz * this.cell[2];
          this.rest[i * 3] = x;
          this.rest[i * 3 + 1] = y;
          this.rest[i * 3 + 2] = z;
          // Pin only the feet so the rest of the body can be dragged.
          if (iy === 0) this.invMass[i] = 0;
          else if (iy === ny - 1) this.invMass[i] = 0.28;
          else this.invMass[i] = 1;
        }
      }
    }
    this.pos.set(this.rest);
    this.prev.set(this.rest);

    const add = (a: number, b: number) => {
      if (a === b) return;
      if (this.invMass[a] === 0 && this.invMass[b] === 0) return;
      const dx = this.rest[a * 3] - this.rest[b * 3];
      const dy = this.rest[a * 3 + 1] - this.rest[b * 3 + 1];
      const dz = this.rest[a * 3 + 2] - this.rest[b * 3 + 2];
      this.springs.push({ a, b, rest: Math.hypot(dx, dy, dz) });
    };

    for (let iz = 0; iz < nz; iz++) {
      for (let iy = 0; iy < ny; iy++) {
        for (let ix = 0; ix < nx; ix++) {
          const i = ix + iy * nx + iz * nx * ny;
          if (ix + 1 < nx) add(i, i + 1);
          if (iy + 1 < ny) add(i, i + nx);
          if (iz + 1 < nz) add(i, i + nx * ny);
          if (ix + 1 < nx && iy + 1 < ny) add(i, i + 1 + nx);
          if (ix + 1 < nx && iz + 1 < nz) add(i, i + 1 + nx * ny);
        }
      }
    }
  }

  bind(positions: Float32Array, weight: Float32Array) {
    const n = weight.length;
    const corners = new Int32Array(n * 8);
    const bweights = new Float32Array(n * 8);
    const rest = new Float32Array(positions);
    const [ox, oy, oz] = this.origin;
    const [cx, cy, cz] = this.cell;
    const nx = this.nx;
    const ny = this.ny;
    const nz = this.nz;

    for (let i = 0; i < n; i++) {
      if (weight[i] <= 0.001) {
        corners[i * 8] = -1;
        continue;
      }
      const x = positions[i * 3];
      const y = positions[i * 3 + 1];
      const z = positions[i * 3 + 2];
      const fx = (x - ox) / cx;
      const fy = (y - oy) / cy;
      const fz = (z - oz) / cz;
      if (fx < -0.05 || fy < -0.05 || fz < -0.05 || fx > nx - 0.95 || fy > ny - 0.95 || fz > nz - 0.95) {
        corners[i * 8] = -1;
        weight[i] = 0;
        continue;
      }
      const ix = Math.max(0, Math.min(nx - 2, Math.floor(fx)));
      const iy = Math.max(0, Math.min(ny - 2, Math.floor(fy)));
      const iz = Math.max(0, Math.min(nz - 2, Math.floor(fz)));
      const tx = Math.max(0, Math.min(1, fx - ix));
      const ty = Math.max(0, Math.min(1, fy - iy));
      const tz = Math.max(0, Math.min(1, fz - iz));
      const base = ix + iy * nx + iz * nx * ny;
      const o = i * 8;
      corners[o] = base;
      corners[o + 1] = base + 1;
      corners[o + 2] = base + nx;
      corners[o + 3] = base + 1 + nx;
      corners[o + 4] = base + nx * ny;
      corners[o + 5] = base + 1 + nx * ny;
      corners[o + 6] = base + nx + nx * ny;
      corners[o + 7] = base + 1 + nx + nx * ny;
      const sx = 1 - tx;
      const sy = 1 - ty;
      const sz = 1 - tz;
      bweights[o] = sx * sy * sz;
      bweights[o + 1] = tx * sy * sz;
      bweights[o + 2] = sx * ty * sz;
      bweights[o + 3] = tx * ty * sz;
      bweights[o + 4] = sx * sy * tz;
      bweights[o + 5] = tx * sy * tz;
      bweights[o + 6] = sx * ty * tz;
      bweights[o + 7] = tx * ty * tz;
    }

    this.bindings.push({ positions, rest, weight, corners, bweights });
  }

  reset() {
    this.pos.set(this.rest);
    this.prev.set(this.rest);
    this.acc = 0;
    this.hold = null;
    this.apply();
  }

  shake(strength = 0.04) {
    for (let i = 0; i < this.count; i++) {
      if (this.invMass[i] === 0) continue;
      const i3 = i * 3;
      this.prev[i3] -= (Math.random() - 0.5) * 2 * strength;
      this.prev[i3 + 1] -= (Math.random() * 0.5 + 0.2) * strength;
      this.prev[i3 + 2] -= (Math.random() * 0.7 + 0.3) * strength;
    }
  }

  setDrag(px: number, py: number, pz: number, tx: number, ty: number, tz: number, radius: number) {
    this.hold = { mode: "drag", px, py, pz, tx, ty, tz, radius };
  }

  setPress(px: number, py: number, pz: number, nx: number, ny: number, nz: number, depth: number, radius: number) {
    this.hold = { mode: "press", px, py, pz, nx, ny, nz, depth, radius };
  }

  clearHold() {
    this.hold = null;
  }

  sampleDelta(px: number, py: number, pz: number, out: Float32Array) {
    const [ox, oy, oz] = this.origin;
    const [cx, cy, cz] = this.cell;
    const nx = this.nx;
    const ny = this.ny;
    const fx = (px - ox) / cx;
    const fy = (py - oy) / cy;
    const fz = (pz - oz) / cz;
    const ix = Math.max(0, Math.min(this.nx - 2, Math.floor(fx)));
    const iy = Math.max(0, Math.min(this.ny - 2, Math.floor(fy)));
    const iz = Math.max(0, Math.min(this.nz - 2, Math.floor(fz)));
    const tx = Math.max(0, Math.min(1, fx - ix));
    const ty = Math.max(0, Math.min(1, fy - iy));
    const tz = Math.max(0, Math.min(1, fz - iz));
    const base = ix + iy * nx + iz * nx * ny;
    const ids = [
      base,
      base + 1,
      base + nx,
      base + 1 + nx,
      base + nx * ny,
      base + 1 + nx * ny,
      base + nx + nx * ny,
      base + 1 + nx + nx * ny,
    ];
    const sx = 1 - tx;
    const sy = 1 - ty;
    const sz = 1 - tz;
    const w = [
      sx * sy * sz,
      tx * sy * sz,
      sx * ty * sz,
      tx * ty * sz,
      sx * sy * tz,
      tx * sy * tz,
      sx * ty * tz,
      tx * ty * tz,
    ];
    let x = 0;
    let y = 0;
    let z = 0;
    for (let k = 0; k < 8; k++) {
      const i3 = ids[k] * 3;
      const bw = w[k];
      x += (this.pos[i3] - this.rest[i3]) * bw;
      y += (this.pos[i3 + 1] - this.rest[i3 + 1]) * bw;
      z += (this.pos[i3 + 2] - this.rest[i3 + 2]) * bw;
    }
    out[0] = x;
    out[1] = y;
    out[2] = z;
    return out;
  }

  step(dt: number, params: CageParams) {
    this.acc += Math.min(dt, 0.08);
    const fixed = 1 / 60;
    let n = 0;
    while (this.acc >= fixed && n < 3) {
      this.integrate(fixed, params);
      this.applyHold();
      this.acc -= fixed;
      n++;
    }
    this.applyHold();
    this.apply();
  }

  apply() {
    for (const b of this.bindings) {
      const { positions, rest, weight, corners, bweights } = b;
      const n = weight.length;
      for (let i = 0; i < n; i++) {
        const w = weight[i];
        if (w <= 0.001 || corners[i * 8] < 0) continue;
        let px = 0;
        let py = 0;
        let pz = 0;
        let rx = 0;
        let ry = 0;
        let rz = 0;
        const o = i * 8;
        for (let k = 0; k < 8; k++) {
          const ci = corners[o + k] * 3;
          const bw = bweights[o + k];
          px += this.pos[ci] * bw;
          py += this.pos[ci + 1] * bw;
          pz += this.pos[ci + 2] * bw;
          rx += this.rest[ci] * bw;
          ry += this.rest[ci + 1] * bw;
          rz += this.rest[ci + 2] * bw;
        }
        const i3 = i * 3;
        positions[i3] = rest[i3] + (px - rx) * w;
        positions[i3 + 1] = rest[i3 + 1] + (py - ry) * w;
        positions[i3 + 2] = rest[i3 + 2] + (pz - rz) * w;
      }
    }
  }

  private applyHold() {
    const h = this.hold;
    if (!h) return;
    const r = h.radius;
    const r2 = r * r;
    for (let i = 0; i < this.count; i++) {
      if (this.invMass[i] === 0) continue;
      const i3 = i * 3;
      const ox = this.rest[i3] - h.px;
      const oy = this.rest[i3 + 1] - h.py;
      const oz = this.rest[i3 + 2] - h.pz;
      const d2 = ox * ox + oy * oy + oz * oz;
      if (d2 > r2 * 2.8) continue;
      const d = Math.sqrt(d2) || 1e-5;
      const falloff = (1 - Math.min(d / r, 1)) ** 1.4;
      if (falloff <= 0.01) continue;
      const k = Math.min(0.85, falloff * 1.05);
      let tx: number;
      let ty: number;
      let tz: number;
      if (h.mode === "drag") {
        tx = h.tx + ox * 0.75;
        ty = h.ty + oy * 0.75;
        tz = h.tz + oz * 0.75;
      } else {
        tx = h.px + ox - h.nx * h.depth;
        ty = h.py + oy - h.ny * h.depth;
        tz = h.pz + oz - h.nz * h.depth;
      }
      this.pos[i3] += (tx - this.pos[i3]) * k;
      this.pos[i3 + 1] += (ty - this.pos[i3 + 1]) * k;
      this.pos[i3 + 2] += (tz - this.pos[i3 + 2]) * k;
      // Kill Verlet velocity on held nodes so they don't twitch.
      this.prev[i3] = this.pos[i3];
      this.prev[i3 + 1] = this.pos[i3 + 1];
      this.prev[i3 + 2] = this.pos[i3 + 2];
    }
  }

  private integrate(dt: number, params: CageParams) {
    const damp = 0.86 + params.damping * 0.12;
    const g = this.hold ? params.gravity * 0.15 : params.gravity * (0.25 + params.jiggle * 0.4);
    const wind = this.hold ? 0 : Math.sin(params.time * 1.7) * params.wind * 1.4;
    const breath = params.breathing && !this.hold ? Math.sin(params.time * 1.65) * 0.0075 : 0;
    const dt2 = dt * dt;
    const jiggle = Math.max(0.2, params.jiggle);

    for (let i = 0; i < this.count; i++) {
      if (this.invMass[i] === 0) continue;
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
      y += vy + g * dt2 * jiggle;
      z += vz + wind * dt2 * jiggle;
      this.pos[i3] = x;
      this.pos[i3 + 1] = y;
      this.pos[i3 + 2] = z;
    }

    const iterations = 4 + Math.round(params.stiffness * 3);
    const kSpring = 0.28 + params.stiffness * 0.48;
    const nx = this.nx;
    const ny = this.ny;
    const nz = this.nz;
    const nxy = nx * ny;

    for (let it = 0; it < iterations; it++) {
      for (let s = 0; s < this.springs.length; s++) {
        const sp = this.springs[s];
        const a3 = sp.a * 3;
        const b3 = sp.b * 3;
        const wA = this.invMass[sp.a];
        const wB = this.invMass[sp.b];
        const wSum = wA + wB;
        if (wSum === 0) continue;
        let dx = this.pos[a3] - this.pos[b3];
        let dy = this.pos[a3 + 1] - this.pos[b3 + 1];
        let dz = this.pos[a3 + 2] - this.pos[b3 + 2];
        const dist = Math.hypot(dx, dy, dz) || 1e-6;
        const inv = ((dist - sp.rest) / dist) * kSpring / wSum;
        this.pos[a3] -= dx * inv * wA;
        this.pos[a3 + 1] -= dy * inv * wA;
        this.pos[a3 + 2] -= dz * inv * wA;
        this.pos[b3] += dx * inv * wB;
        this.pos[b3 + 1] += dy * inv * wB;
        this.pos[b3 + 2] += dz * inv * wB;
      }

      const kShape = 0.045 + params.stiffness * 0.1;
      const kVol = 0.1 + params.pressure * 0.32;
      let energy = 0;
      const midX = this.origin[0] + this.cell[0] * (nx - 1) * 0.5;
      const midZ = this.origin[2] + this.cell[2] * (nz - 1) * 0.5;
      for (let i = 0; i < this.count; i++) {
        if (this.invMass[i] === 0) continue;
        const i3 = i * 3;
        const rx = this.rest[i3];
        const ry = this.rest[i3 + 1];
        const rz = this.rest[i3 + 2];
        const iz = Math.floor(i / nxy);
        const iy = Math.floor((i % nxy) / nx);
        const front = iz / Math.max(1, nz - 1);
        const belly = 1 - Math.min(1, Math.abs(iy / Math.max(1, ny - 1) - 0.55) * 2.2);
        const restZ = rz + breath * front * Math.max(0, belly);
        let x = this.pos[i3];
        let y = this.pos[i3 + 1];
        let z = this.pos[i3 + 2];
        x += (rx - x) * kShape;
        y += (ry - y) * (kShape + 0.03);
        z += (restZ - z) * (kShape + 0.06);
        const ox = x - midX;
        const oz = z - midZ;
        const r = Math.hypot(ox, oz) || 1e-6;
        const restR = Math.hypot(rx - midX, rz - midZ);
        const vol = ((restR - r) / r) * kVol * jiggle * 0.6;
        x += ox * vol;
        z += oz * vol;
        let dx = x - rx;
        let dy = y - ry;
        let dz = z - rz;
        const len = Math.hypot(dx, dy, dz);
        if (len > MAX_OFF) {
          const s = MAX_OFF / len;
          x = rx + dx * s;
          y = ry + dy * s;
          z = rz + dz * s;
        }
        this.pos[i3] = x;
        this.pos[i3 + 1] = y;
        this.pos[i3 + 2] = z;
        energy += dx * dx + dy * dy + dz * dz;
      }
      this.energy = energy;
    }
  }
}
