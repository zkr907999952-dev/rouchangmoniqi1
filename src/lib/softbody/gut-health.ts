import * as THREE from "three";
import type { TubeAlong } from "@/lib/softbody/peristalsis";

export const SMALL_SEGS = 30;
export const COLON_SEGS = 10;
export const GUT_SEGS = SMALL_SEGS + COLON_SEGS;

type Part = {
  positions: Float32Array;
  along: Float32Array;
  colors: Float32Array;
  colorAttr: THREE.BufferAttribute;
  seg: Uint8Array;
  count: number;
};

export class GutHealth {
  readonly hp = new Float32Array(GUT_SEGS).fill(1);
  readonly cx = new Float32Array(GUT_SEGS);
  readonly cy = new Float32Array(GUT_SEGS);
  readonly cz = new Float32Array(GUT_SEGS);
  readonly bars: THREE.Group;
  private parts: Part[] = [];
  private fills: THREE.Mesh[] = [];
  private dirty = true;
  private readonly n = new Float32Array(GUT_SEGS);

  constructor() {
    this.bars = new THREE.Group();
    this.bars.visible = false;
    const trackMat = new THREE.MeshBasicMaterial({
      color: "#1a1f1c",
      depthTest: false,
      transparent: true,
      opacity: 0.7,
    });
    const fillMat = new THREE.MeshBasicMaterial({
      color: "#3dcc6e",
      depthTest: false,
      transparent: true,
      opacity: 0.95,
    });
    const trackGeo = new THREE.PlaneGeometry(1, 1);
    const fillGeo = new THREE.PlaneGeometry(1, 1);
    fillGeo.translate(0.5, 0, 0);
    for (let i = 0; i < GUT_SEGS; i++) {
      const g = new THREE.Group();
      const track = new THREE.Mesh(trackGeo, trackMat);
      track.scale.set(0.05, 0.007, 1);
      track.renderOrder = 40;
      track.frustumCulled = false;
      const fill = new THREE.Mesh(fillGeo, fillMat);
      fill.position.x = -0.025;
      fill.scale.set(0.05, 0.0055, 1);
      fill.renderOrder = 41;
      fill.frustumCulled = false;
      g.add(track);
      g.add(fill);
      this.fills.push(fill);
      this.bars.add(g);
    }
  }

  attach(root: THREE.Object3D, tubes: TubeAlong[]) {
    this.parts.length = 0;
    let k = 0;
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      const pos = mesh.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
      if (!pos || !(pos.array instanceof Float32Array) || pos.count < 24) return;
      const tube = tubes[k++];
      if (!tube) return;
      let color = mesh.geometry.getAttribute("color") as THREE.BufferAttribute | undefined;
      if (!color || !(color.array instanceof Float32Array) || color.count !== pos.count) {
        color = new THREE.BufferAttribute(new Float32Array(pos.count * 3).fill(1), 3);
        mesh.geometry.setAttribute("color", color);
      }
      color.setUsage(THREE.DynamicDrawUsage);
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const raw of mats) {
        const m = raw as THREE.MeshStandardMaterial;
        if (m) {
          m.vertexColors = true;
          m.needsUpdate = true;
        }
      }
      const seg = new Uint8Array(pos.count);
      this.parts.push({
        positions: pos.array,
        along: tube.along,
        colors: color.array as Float32Array,
        colorAttr: color,
        seg,
        count: pos.count,
      });
    });
    this.assignSegments();
    this.recomputeCenters();
    this.dirty = true;
    this.applyColor();
  }

  private assignSegments() {
    if (this.parts.length >= 2) {
      const order = this.parts.map((p, i) => ({ i, n: p.count })).sort((a, b) => b.n - a.n);
      const small = this.parts[order[0]!.i]!;
      const colon = this.parts[order[1]!.i]!;
      fillSeg(small.seg, small.along, 0, SMALL_SEGS);
      fillSeg(colon.seg, colon.along, SMALL_SEGS, COLON_SEGS);
      for (let i = 2; i < order.length; i++) {
        fillSeg(this.parts[order[i]!.i]!.seg, this.parts[order[i]!.i]!.along, SMALL_SEGS, COLON_SEGS);
      }
      return;
    }
    for (const p of this.parts) {
      for (let i = 0; i < p.count; i++) {
        const u = p.along[i]!;
        if (u < 0.75) p.seg[i] = Math.min(SMALL_SEGS - 1, (u / 0.75) * SMALL_SEGS) | 0;
        else p.seg[i] = SMALL_SEGS + Math.min(COLON_SEGS - 1, ((u - 0.75) / 0.25) * COLON_SEGS) | 0;
      }
    }
  }

  private recomputeCenters() {
    this.cx.fill(0);
    this.cy.fill(0);
    this.cz.fill(0);
    this.n.fill(0);
    for (const p of this.parts) {
      for (let i = 0; i < p.count; i++) {
        const s = p.seg[i]!;
        const i3 = i * 3;
        this.cx[s] += p.positions[i3]!;
        this.cy[s] += p.positions[i3 + 1]!;
        this.cz[s] += p.positions[i3 + 2]!;
        this.n[s] += 1;
      }
    }
    for (let s = 0; s < GUT_SEGS; s++) {
      const n = Math.max(1, this.n[s]!);
      this.cx[s] /= n;
      this.cy[s] /= n;
      this.cz[s] /= n;
    }
  }

  hit(x: number, y: number, z: number, force: number, range: number) {
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < GUT_SEGS; i++) {
      if (this.n[i]! < 1) continue;
      const d = Math.hypot(this.cx[i]! - x, this.cy[i]! - y, this.cz[i]! - z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    const rad = 0.035 + range * 0.07;
    const dmg = 0.16 + force * 0.48;
    for (let i = 0; i < GUT_SEGS; i++) {
      if (this.n[i]! < 1) continue;
      const d = Math.hypot(this.cx[i]! - x, this.cy[i]! - y, this.cz[i]! - z);
      const adj = (i === best - 1 || i === best + 1) && sameOrgan(i, best) ? 0.4 : 0;
      const fall = i === best ? 1 : Math.max(adj, Math.exp(-(d * d) / (rad * rad)) * 0.45);
      if (fall < 0.08) continue;
      this.hp[i] = Math.max(0, this.hp[i]! - dmg * fall);
    }
    this.dirty = true;
  }

  reset() {
    this.hp.fill(1);
    this.dirty = true;
  }

  applyColor() {
    if (!this.dirty) return;
    for (const p of this.parts) {
      for (let i = 0; i < p.count; i++) {
        const hurt = 1 - this.hp[p.seg[i]!]!;
        const i3 = i * 3;
        p.colors[i3] = 1;
        p.colors[i3 + 1] = 1 - hurt * 0.88;
        p.colors[i3 + 2] = 1 - hurt * 0.9;
      }
      p.colorAttr.needsUpdate = true;
    }
    this.dirty = false;
  }

  updateBars(camera: THREE.Camera, visible: boolean) {
    this.bars.visible = visible;
    if (!visible) return;
    this.recomputeCenters();
    camera.getWorldDirection(_dir);
    for (let i = 0; i < GUT_SEGS; i++) {
      const g = this.bars.children[i] as THREE.Group;
      if (this.n[i]! < 4) {
        g.visible = false;
        continue;
      }
      g.visible = true;
      g.position.set(this.cx[i]!, this.cy[i]!, this.cz[i]!);
      g.position.addScaledVector(_dir, -0.03);
      g.lookAt(camera.position);
      this.fills[i]!.scale.x = 0.05 * Math.max(0.02, this.hp[i]!);
    }
  }
}

const _dir = new THREE.Vector3();

function fillSeg(seg: Uint8Array, along: Float32Array, offset: number, n: number) {
  for (let i = 0; i < seg.length; i++) {
    seg[i] = offset + Math.min(n - 1, along[i]! * n) | 0;
  }
}

function sameOrgan(a: number, b: number) {
  return (a < SMALL_SEGS) === (b < SMALL_SEGS);
}
