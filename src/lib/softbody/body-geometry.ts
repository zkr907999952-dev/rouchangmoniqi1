import * as THREE from "three";

export const BODY = {
  height: 1.66,
  y0: 0.84,
  y1: 1.52,
  hipY: 0.955,
  navelY: 1.055,
  waistY: 1.108,
  underbustY: 1.242,
  bustY: 1.332,
  shoulderY: 1.465,
  chinY: 1.458,
  softY0: 1.012,
  softY1: 1.248,
} as const;

type Key = { y: number; rx: number; rz: number; z0: number };

const KEYS: Key[] = [
  { y: 0.84, rx: 0.128, rz: 0.118, z0: 0.012 },
  { y: 0.9, rx: 0.152, rz: 0.132, z0: 0.02 },
  { y: 0.955, rx: 0.168, rz: 0.142, z0: 0.028 },
  { y: 1.01, rx: 0.142, rz: 0.128, z0: 0.034 },
  { y: 1.055, rx: 0.12, rz: 0.118, z0: 0.042 },
  { y: 1.108, rx: 0.1, rz: 0.096, z0: 0.034 },
  { y: 1.16, rx: 0.106, rz: 0.098, z0: 0.028 },
  { y: 1.22, rx: 0.12, rz: 0.102, z0: 0.022 },
  { y: 1.268, rx: 0.136, rz: 0.122, z0: 0.038 },
  { y: 1.332, rx: 0.15, rz: 0.14, z0: 0.052 },
  { y: 1.39, rx: 0.128, rz: 0.102, z0: 0.02 },
  { y: 1.44, rx: 0.116, rz: 0.086, z0: 0.006 },
  { y: 1.485, rx: 0.078, rz: 0.07, z0: 0.002 },
  { y: 1.52, rx: 0.05, rz: 0.048, z0: 0.0 },
];

function clamp01(t: number) {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

function smoothstep(e0: number, e1: number, x: number) {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

function gaussian(x: number, mu: number, sigma: number) {
  const d = (x - mu) / sigma;
  return Math.exp(-0.5 * d * d);
}

function interpKey(y: number): Key {
  if (y <= KEYS[0].y) return KEYS[0];
  const last = KEYS[KEYS.length - 1];
  if (y >= last.y) return last;
  for (let i = 0; i < KEYS.length - 1; i++) {
    const a = KEYS[i];
    const b = KEYS[i + 1];
    if (y >= a.y && y <= b.y) {
      const t = smoothstep(a.y, b.y, y);
      return {
        y,
        rx: a.rx + (b.rx - a.rx) * t,
        rz: a.rz + (b.rz - a.rz) * t,
        z0: a.z0 + (b.z0 - a.z0) * t,
      };
    }
  }
  return last;
}

export type BodySample = {
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
  theta: number;
  radius: number;
  spineZ: number;
};

export function sampleBody(y: number, theta: number): BodySample {
  const key = interpKey(y);
  const c = Math.cos(theta);
  const s = Math.sin(theta);

  let rx = key.rx;
  let rz = key.rz;
  let z0 = key.z0;

  const belly =
    0.032 *
    smoothstep(0.995, 1.04, y) *
    (1 - smoothstep(1.1, 1.2, y)) *
    Math.pow(Math.max(c, 0), 1.15);
  rz += belly;
  z0 += belly * 0.4;

  const glute =
    0.038 *
    gaussian(y, 0.93, 0.055) *
    Math.pow(Math.max(-c, 0), 1.45);
  rz += glute;
  z0 -= glute * 0.25;

  const collarbone = 0.012 * gaussian(y, 1.445, 0.028) * Math.abs(s);
  rx += collarbone;

  const bustEnv = gaussian(y, 1.328, 0.052);
  const left = gaussian(theta, 0.46, 0.42);
  const right = gaussian(theta, -0.46, 0.42);
  const bust = bustEnv * (left + right) * 0.058;
  rz += bust;
  rx += bust * 0.28;
  z0 += bust * 0.45;

  rx += 0.01 * gaussian(y, 0.96, 0.04) * Math.abs(s);

  let x = rx * s;
  let z = z0 + rz * c;

  const navelDy = y - BODY.navelY;
  const navelR = Math.hypot(x, navelDy * 1.6, z - (z0 + rz * 0.92));
  if (navelR < 0.02 && c > 0.82) {
    const k = (1 - navelR / 0.02) ** 2 * 0.012;
    const len = Math.hypot(x, z - z0) || 1;
    x -= (x / len) * k;
    z -= ((z - z0) / len) * k;
  }

  let nx = x;
  let ny = 0;
  let nz = z - z0;
  const nl = Math.hypot(nx, ny, nz) || 1;
  nx /= nl;
  nz /= nl;

  const radius = Math.hypot(x, z - z0);
  return { x, y, z, nx, ny, nz, theta, radius, spineZ: z0 };
}

export type VertexMeta = {
  index: number;
  y: number;
  theta: number;
  soft: number;
  restRadius: number;
  spineZ: number;
  nx: number;
  ny: number;
  nz: number;
};

export type TorsoBuild = {
  geometry: THREE.BufferGeometry;
  meta: VertexMeta[];
  radial: number;
  rings: number;
};

function softnessAt(y: number, theta: number) {
  const c = Math.cos(theta);
  const band = smoothstep(BODY.softY0, BODY.softY0 + 0.03, y) * (1 - smoothstep(BODY.softY1 - 0.03, BODY.softY1, y));
  if (band <= 0) return 0;
  const front = clamp01((c + 0.22) / 1.22);
  const frontBias = 0.22 + 0.78 * front ** 1.1;
  return clamp01(band * frontBias);
}

export function createTorsoGeometry(
  radial = 48,
  heightSegs = 36,
  inflate = 0,
): TorsoBuild {
  const rings = heightSegs + 1;
  const positions = new Float32Array(rings * radial * 3);
  const normals = new Float32Array(rings * radial * 3);
  const uvs = new Float32Array(rings * radial * 2);
  const meta: VertexMeta[] = [];

  for (let iy = 0; iy < rings; iy++) {
    const ty = iy / heightSegs;
    const y = BODY.y0 + ty * (BODY.y1 - BODY.y0);
    for (let ix = 0; ix < radial; ix++) {
      const theta = (ix / radial) * Math.PI * 2;
      const p = sampleBody(y, theta);
      const i = iy * radial + ix;
      const px = p.x + p.nx * inflate;
      const py = p.y + p.ny * inflate;
      const pz = p.z + p.nz * inflate;
      positions[i * 3] = px;
      positions[i * 3 + 1] = py;
      positions[i * 3 + 2] = pz;
      normals[i * 3] = p.nx;
      normals[i * 3 + 1] = p.ny;
      normals[i * 3 + 2] = p.nz;
      uvs[i * 2] = ix / radial;
      uvs[i * 2 + 1] = ty;
      meta.push({
        index: i,
        y,
        theta,
        soft: softnessAt(y, theta),
        restRadius: p.radius + inflate,
        spineZ: p.spineZ,
        nx: p.nx,
        ny: p.ny,
        nz: p.nz,
      });
    }
  }

  const indices: number[] = [];
  for (let iy = 0; iy < heightSegs; iy++) {
    for (let ix = 0; ix < radial; ix++) {
      const a = iy * radial + ix;
      const b = iy * radial + ((ix + 1) % radial);
      const c = (iy + 1) * radial + ix;
      const d = (iy + 1) * radial + ((ix + 1) % radial);
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return { geometry, meta, radial, rings };
}

export function createBandGeometry(
  y0: number,
  y1: number,
  inflate: number,
  radial = 48,
  heightSegs = 12,
) {
  const rings = heightSegs + 1;
  const positions: number[] = [];
  const uvs: number[] = [];
  for (let iy = 0; iy < rings; iy++) {
    const ty = iy / heightSegs;
    const y = y0 + ty * (y1 - y0);
    for (let ix = 0; ix < radial; ix++) {
      const theta = (ix / radial) * Math.PI * 2;
      const p = sampleBody(y, theta);
      positions.push(p.x + p.nx * inflate, p.y + p.ny * inflate, p.z + p.nz * inflate);
      uvs.push(ix / radial, ty);
    }
  }
  const indices: number[] = [];
  for (let iy = 0; iy < heightSegs; iy++) {
    for (let ix = 0; ix < radial; ix++) {
      const a = iy * radial + ix;
      const b = iy * radial + ((ix + 1) % radial);
      const c = (iy + 1) * radial + ix;
      const d = (iy + 1) * radial + ((ix + 1) % radial);
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function createHeadGeometry() {
  const pts = [
    new THREE.Vector2(0.012, 0.0),
    new THREE.Vector2(0.042, 0.012),
    new THREE.Vector2(0.068, 0.038),
    new THREE.Vector2(0.078, 0.07),
    new THREE.Vector2(0.084, 0.108),
    new THREE.Vector2(0.082, 0.148),
    new THREE.Vector2(0.074, 0.188),
    new THREE.Vector2(0.052, 0.218),
    new THREE.Vector2(0.02, 0.236),
    new THREE.Vector2(0.0, 0.24),
  ];
  const geo = new THREE.LatheGeometry(pts, 32);
  geo.computeVertexNormals();
  return geo;
}

export function createHairGeometry() {
  const pts = [
    new THREE.Vector2(0.01, 0.248),
    new THREE.Vector2(0.07, 0.236),
    new THREE.Vector2(0.1, 0.2),
    new THREE.Vector2(0.112, 0.14),
    new THREE.Vector2(0.118, 0.06),
    new THREE.Vector2(0.114, -0.02),
    new THREE.Vector2(0.1, -0.1),
    new THREE.Vector2(0.078, -0.175),
    new THREE.Vector2(0.04, -0.22),
    new THREE.Vector2(0.0, -0.232),
  ];
  const geo = new THREE.LatheGeometry(pts, 40);
  geo.computeVertexNormals();
  return geo;
}
