import * as THREE from "three";
import type { SkinBinding } from "@/lib/softbody/soft-skeleton";

type NavelVert = {
  pos: Float32Array;
  i3: number;
  dx: number;
  dy: number;
  restx: number;
  resty: number;
  restz: number;
};

export type NavelMorph = {
  verts: NavelVert[];
  nx: number;
  ny: number;
  planeZ: number;
};

function almondU(dx: number, dy: number, hx: number, hy: number) {
  const ny = dy / Math.max(1e-6, hy);
  const point = ny >= 0 ? 0.58 : 0.34;
  const pinch = Math.max(0.16, 1 - point * ny * ny);
  return Math.hypot(dx / Math.max(1e-6, hx * pinch), ny);
}

export function buildNavelMorph(bindings: SkinBinding[], navel: THREE.Vector3): NavelMorph {
  const nx = navel.x;
  const ny = navel.y;
  const nz = navel.z;
  let ringZ = 0;
  let ringN = 0;
  for (const b of bindings) {
    const rest = b.rest;
    for (let i = 0; i < b.count; i++) {
      const dx = rest[i * 3]! - nx;
      const dy = rest[i * 3 + 1]! - ny;
      const rz = rest[i * 3 + 2]!;
      if (rz < nz - 0.04) continue;
      const r = Math.hypot(dx, dy);
      if (r > 0.01 && r < 0.026) {
        ringZ += rz;
        ringN++;
      }
    }
  }
  const planeZ = ringN > 6 ? ringZ / ringN : nz + 0.006;
  const verts: NavelVert[] = [];
  for (const b of bindings) {
    const rest = b.rest;
    for (let i = 0; i < b.count; i++) {
      const rx = rest[i * 3]!;
      const ry = rest[i * 3 + 1]!;
      const rz = rest[i * 3 + 2]!;
      if (rz < planeZ - 0.05) continue;
      const dx = rx - nx;
      const dy = ry - ny;
      if (Math.hypot(dx, dy) > 0.052) continue;
      verts.push({
        pos: b.positions,
        i3: i * 3,
        dx,
        dy,
        restx: rx,
        resty: ry,
        restz: rz,
      });
    }
  }
  return { verts, nx, ny, planeZ };
}

export function applyNavelMorph(morph: NavelMorph, depth: number, diameter: number) {
  const d = THREE.MathUtils.clamp(depth, 0, 1);
  const dia = THREE.MathUtils.clamp(diameter, 0, 2.2);
  if (d < 0.008) return;
  const hx = 0.0027 + dia * 0.0078;
  const hy = 0.0051 + dia * 0.0135;
  const D = d * 0.092;
  const cap = Math.min(hy * 0.85, D * 0.38);
  const split = 0.2;
  const { nx, ny, planeZ } = morph;

  for (const v of morph.verts) {
    const u = almondU(v.dx, v.dy, hx, hy);
    if (u > 1.32) continue;
    let targetU: number;
    let along: number;
    if (u <= 1) {
      if (u < split) {
        const b = u / split;
        const th = b * Math.PI * 0.5;
        targetU = Math.sin(th);
        along = D - cap * (1 - Math.cos(th));
      } else {
        const w = (u - split) / (1 - split);
        targetU = 1;
        along = (D - cap) * (1 - w);
      }
    } else {
      const fade = 1 - (u - 1) / 0.32;
      const s = fade * fade * (3 - 2 * fade);
      v.pos[v.i3 + 2] += (planeZ - v.restz) * s * 0.16;
      continue;
    }
    if (u < 1e-4) {
      v.pos[v.i3] += nx - v.restx;
      v.pos[v.i3 + 1] += ny - v.resty;
      v.pos[v.i3 + 2] += planeZ - D - v.restz;
      continue;
    }
    const k = targetU / u;
    const tx = nx + v.dx * k;
    const ty = ny + v.dy * k;
    const tz = planeZ - along;
    v.pos[v.i3] += tx - v.restx;
    v.pos[v.i3 + 1] += ty - v.resty;
    v.pos[v.i3 + 2] += tz - v.restz;
  }
}
