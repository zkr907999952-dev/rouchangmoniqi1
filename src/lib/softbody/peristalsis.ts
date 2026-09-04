import * as THREE from "three";

type Adj = { head: Int32Array; next: Int32Array; to: Int32Array; w: Float32Array };

function addEdge(adj: Adj, slot: { n: number }, a: number, b: number, len: number) {
  if (a === b) return;
  const i = slot.n++;
  adj.next[i] = adj.head[a]!;
  adj.to[i] = b;
  adj.w[i] = len;
  adj.head[a] = i;
}

function buildAdj(rest: Float32Array, count: number, index: ArrayLike<number> | null): Adj {
  const nTri = index ? (index.length / 3) | 0 : (count / 3) | 0;
  const maxE = nTri * 6 + 8;
  const adj: Adj = {
    head: new Int32Array(count).fill(-1),
    next: new Int32Array(maxE),
    to: new Int32Array(maxE),
    w: new Float32Array(maxE),
  };
  const slot = { n: 0 };
  const edge = (a: number, b: number) => {
    if (a >= count || b >= count) return;
    const dx = rest[a * 3]! - rest[b * 3]!;
    const dy = rest[a * 3 + 1]! - rest[b * 3 + 1]!;
    const dz = rest[a * 3 + 2]! - rest[b * 3 + 2]!;
    addEdge(adj, slot, a, b, Math.hypot(dx, dy, dz));
  };
  for (let t = 0; t < nTri; t++) {
    const a = index ? index[t * 3]! : t * 3;
    const b = index ? index[t * 3 + 1]! : t * 3 + 1;
    const c = index ? index[t * 3 + 2]! : t * 3 + 2;
    edge(a, b);
    edge(b, a);
    edge(b, c);
    edge(c, b);
    edge(c, a);
    edge(a, c);
  }
  return adj;
}

class MinHeap {
  i: Int32Array;
  d: Float32Array;
  n = 0;
  constructor(cap: number) {
    this.i = new Int32Array(cap);
    this.d = new Float32Array(cap);
  }
  push(i: number, d: number) {
    if (this.n >= this.i.length) {
      const cap = this.i.length * 2;
      const ni = new Int32Array(cap);
      const nd = new Float32Array(cap);
      ni.set(this.i);
      nd.set(this.d);
      this.i = ni;
      this.d = nd;
    }
    let n = this.n++;
    const ii = this.i;
    const dd = this.d;
    ii[n] = i;
    dd[n] = d;
    while (n > 0) {
      const p = (n - 1) >> 1;
      if (dd[p]! <= dd[n]!) break;
      const ti = ii[p]!;
      const td = dd[p]!;
      ii[p] = ii[n]!;
      dd[p] = dd[n]!;
      ii[n] = ti;
      dd[n] = td;
      n = p;
    }
  }
  pop() {
    const ii = this.i;
    const dd = this.d;
    const i0 = ii[0]!;
    const d0 = dd[0]!;
    const last = --this.n;
    if (last > 0) {
      ii[0] = ii[last]!;
      dd[0] = dd[last]!;
      let n = 0;
      while (true) {
        const l = n * 2 + 1;
        if (l >= last) break;
        const r = l + 1;
        const c = r < last && dd[r]! < dd[l]! ? r : l;
        if (dd[n]! <= dd[c]!) break;
        const ti = ii[n]!;
        const td = dd[n]!;
        ii[n] = ii[c]!;
        dd[n] = dd[c]!;
        ii[c] = ti;
        dd[c] = td;
        n = c;
      }
    }
    return { i: i0, d: d0 };
  }
}

function dijkstra(start: number, count: number, adj: Adj, dist: Float32Array, heap: MinHeap) {
  dist.fill(1e12);
  dist[start] = 0;
  heap.n = 0;
  heap.push(start, 0);
  while (heap.n > 0) {
    const { i: v, d: dv } = heap.pop();
    if (dv > dist[v]! + 1e-8) continue;
    for (let e = adj.head[v]!; e !== -1; e = adj.next[e]!) {
      const u = adj.to[e]!;
      const nd = dv + adj.w[e]!;
      if (nd < dist[u]!) {
        dist[u] = nd;
        heap.push(u, nd);
      }
    }
  }
}

function smoothField(field: Float32Array, count: number, adj: Adj, iters: number) {
  const tmp = new Float32Array(count);
  for (let k = 0; k < iters; k++) {
    for (let i = 0; i < count; i++) {
      let s = field[i]!;
      let n = 1;
      for (let e = adj.head[i]!; e !== -1; e = adj.next[e]!) {
        s += field[adj.to[e]!]!;
        n++;
      }
      tmp[i] = s / n;
    }
    field.set(tmp);
  }
}

function fillAlong(
  rest: Float32Array,
  count: number,
  along: Float32Array,
  seen: Uint8Array,
  seed: number,
  adj: Adj,
  dist: Float32Array,
  heap: MinHeap,
) {
  dijkstra(seed, count, adj, dist, heap);
  let rectum = -1;
  let yMin = Infinity;
  let visited = 0;
  for (let i = 0; i < count; i++) {
    if (dist[i]! > 1e11) continue;
    visited++;
    const y = rest[i * 3 + 1]!;
    if (y < yMin) {
      yMin = y;
      rectum = i;
    }
  }
  if (visited < 12 || rectum < 0) {
    seen[seed] = 1;
    along[seed] = 0;
    return;
  }
  dijkstra(rectum, count, adj, dist, heap);
  let prox = rectum;
  let maxD = -1;
  for (let i = 0; i < count; i++) {
    if (dist[i]! > 1e11) continue;
    if (dist[i]! > maxD) {
      maxD = dist[i]!;
      prox = i;
    }
  }
  dijkstra(prox, count, adj, dist, heap);
  let length = 0;
  for (let i = 0; i < count; i++) {
    if (dist[i]! > 1e11) continue;
    if (dist[i]! > length) length = dist[i]!;
  }
  const inv = 1 / Math.max(1e-5, length);
  for (let i = 0; i < count; i++) {
    if (dist[i]! > 1e11) continue;
    seen[i] = 1;
    along[i] = Math.min(1, dist[i]! * inv);
  }
}

function computeAlong(rest: Float32Array, count: number, geometry: THREE.BufferGeometry, adj: Adj) {
  const along = new Float32Array(count);
  const dist = new Float32Array(count);
  const heap = new MinHeap(Math.max(64, count * 2));
  const seen = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    if (seen[i]) continue;
    fillAlong(rest, count, along, seen, i, adj, dist, heap);
  }
  smoothField(along, count, adj, 10);
  let lo = 1;
  let hi = 0;
  for (let i = 0; i < count; i++) {
    if (!seen[i]) continue;
    if (along[i]! < lo) lo = along[i]!;
    if (along[i]! > hi) hi = along[i]!;
  }
  const inv = 1 / Math.max(1e-5, hi - lo);
  for (let i = 0; i < count; i++) along[i] = seen[i] ? (along[i]! - lo) * inv : 0.5;
  return along;
}

function computeRadial(rest: Float32Array, along: Float32Array, count: number, adj: Adj) {
  const bins = 96;
  const cx = new Float32Array(bins);
  const cy = new Float32Array(bins);
  const cz = new Float32Array(bins);
  const cn = new Float32Array(bins);
  for (let i = 0; i < count; i++) {
    const b = Math.min(bins - 1, Math.max(0, (along[i]! * bins) | 0));
    cx[b] += rest[i * 3]!;
    cy[b] += rest[i * 3 + 1]!;
    cz[b] += rest[i * 3 + 2]!;
    cn[b] += 1;
  }
  for (let b = 0; b < bins; b++) {
    const n = cn[b]!;
    if (n < 1) continue;
    cx[b] /= n;
    cy[b] /= n;
    cz[b] /= n;
  }
  for (let b = 1; b < bins; b++) {
    if (cn[b]! >= 6) continue;
    cx[b] = cx[b - 1]!;
    cy[b] = cy[b - 1]!;
    cz[b] = cz[b - 1]!;
    cn[b] = cn[b - 1]!;
  }
  const rad = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = along[i]! * (bins - 1);
    const b = Math.min(bins - 2, Math.max(0, u | 0));
    const f = u - b;
    const mx = cx[b]! * (1 - f) + cx[b + 1]! * f;
    const my = cy[b]! * (1 - f) + cy[b + 1]! * f;
    const mz = cz[b]! * (1 - f) + cz[b + 1]! * f;
    let rx = rest[i * 3]! - mx;
    let ry = rest[i * 3 + 1]! - my;
    let rz = rest[i * 3 + 2]! - mz;
    const len = Math.hypot(rx, ry, rz);
    if (len > 0.022) {
      const s = 0.022 / len;
      rx *= s;
      ry *= s;
      rz *= s;
    }
    rad[i * 3] = rx;
    rad[i * 3 + 1] = ry;
    rad[i * 3 + 2] = rz;
  }
  const tmp = new Float32Array(count * 3);
  for (let k = 0; k < 6; k++) {
    for (let i = 0; i < count; i++) {
      let sx = rad[i * 3]!;
      let sy = rad[i * 3 + 1]!;
      let sz = rad[i * 3 + 2]!;
      let n = 1;
      for (let e = adj.head[i]!; e !== -1; e = adj.next[e]!) {
        const j = adj.to[e]!;
        sx += rad[j * 3]!;
        sy += rad[j * 3 + 1]!;
        sz += rad[j * 3 + 2]!;
        n++;
      }
      tmp[i * 3] = sx / n;
      tmp[i * 3 + 1] = sy / n;
      tmp[i * 3 + 2] = sz / n;
    }
    rad.set(tmp);
  }
  return rad;
}

function lobe(frac: number, width: number) {
  const d = Math.min(frac, 1 - frac);
  const t = 1 - Math.min(1, d / Math.max(1e-4, width));
  return t * t * (3 - 2 * t);
}

function pulse(along: number, time: number, amp: number, speed: number) {
  const n = 1.55;
  const sp = 0.03 + speed * 0.2;
  let p = along * n - time * sp * n;
  p -= Math.floor(p);
  const perist = lobe(p, 0.34);
  let p2 = along * 0.85 - time * sp * 0.55;
  p2 -= Math.floor(p2);
  const perist2 = lobe(p2, 0.42);
  const haustra = 0.5 + 0.5 * Math.sin(along * 12 * Math.PI - time * (0.45 + speed * 0.9));
  const mix = 0.5 + 0.5 * Math.sin(along * 7 * Math.PI + time * (0.25 + speed * 0.5));
  const hs = haustra * haustra * (3 - 2 * haustra);
  const ms = mix * mix * (3 - 2 * mix);
  const seg = hs * 0.45 + ms * 0.25;
  const shape = perist * 0.62 + perist2 * 0.28 + seg * 0.18;
  return shape * (0.16 + amp * 0.42);
}

export type TubeAlong = {
  positions: Float32Array;
  along: Float32Array;
  rad: Float32Array;
  count: number;
};

export class GutPeristalsis {
  private tubes: TubeAlong[] = [];

  getTubes() {
    return this.tubes;
  }

  attach(root: THREE.Object3D) {
    this.tubes.length = 0;
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      const pos = mesh.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
      if (!pos || !(pos.array instanceof Float32Array) || pos.count < 24) return;
      const rest = new Float32Array(pos.array);
      const idx = mesh.geometry.getIndex();
      const adj = buildAdj(rest, pos.count, idx ? idx.array : null);
      const along = computeAlong(rest, pos.count, mesh.geometry, adj);
      const rad = computeRadial(rest, along, pos.count, adj);
      pos.setUsage(THREE.DynamicDrawUsage);
      this.tubes.push({ positions: pos.array, along, rad, count: pos.count });
    });
  }

  apply(time: number, amp = 0.3, speed = 0.5) {
    const a = THREE.MathUtils.clamp(amp, 0, 1);
    const s = THREE.MathUtils.clamp(speed, 0, 1);
    for (const tube of this.tubes) {
      const { positions, along, rad, count } = tube;
      for (let i = 0; i < count; i++) {
        const k = pulse(along[i]!, time, a, s);
        const i3 = i * 3;
        positions[i3] -= rad[i3]! * k;
        positions[i3 + 1] -= rad[i3 + 1]! * k;
        positions[i3 + 2] -= rad[i3 + 2]! * k;
      }
    }
  }
}
