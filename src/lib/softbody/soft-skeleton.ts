import * as THREE from "three";
import type { NativeBone } from "./native-types";

export type SkelParams = {
  stiffness: number;
  damping: number;
  jiggle: number;
  gravity: number;
  wind: number;
  time: number;
  breathing: boolean;
  breathAmp: number;
  breathSpeed: number;
  breathBoost: number;
  rebound: number;
  inflate: number;
  fistDepth: number;
  fistStart: number;
  fistTx: number;
  fistTy: number;
  fistTz: number;
  fistLx: number;
  fistLz: number;
  fistBulge: number;
  fistSpread: number;
  fistLever: number;
  fistRise: number;
  breastSoft: number;
  breastDamp: number;
  hairDamp: number;
  breastInertia: number;
  hairInertia: number;
  blinkEnabled: boolean;
  eyeOpenL: number;
  eyeOpenR: number;
  blinkRate: number;
  blinkSpeed: number;
  mouthOpen: number;
  mouthSmile: number;
  mouthPucker: number;
  mouthWidth: number;
};

export type ExpressionId = "rest" | "smile" | "surprise" | "open";
export type PoseId = "idle" | "armsUp" | "bow" | "legLift" | "twist" | "sway";

export const EXPRESSIONS: { id: ExpressionId; label: string }[] = [
  { id: "rest", label: "平静" },
  { id: "smile", label: "微笑" },
  { id: "surprise", label: "惊讶" },
  { id: "open", label: "开口" },
];

export const POSES: { id: PoseId; label: string }[] = [
  { id: "idle", label: "站立" },
  { id: "armsUp", label: "举手" },
  { id: "bow", label: "鞠躬" },
  { id: "legLift", label: "抬腿" },
  { id: "twist", label: "扭腰" },
  { id: "sway", label: "摇摆" },
];

export type SkinBinding = {
  positions: Float32Array;
  rest: Float32Array;
  count: number;
  index: Uint16Array;
  weight: Float32Array;
  colors: Float32Array;
  softness: Float32Array;
  delta: Float32Array;
  dprev: Float32Array;
  hair?: boolean;
  lash?: Uint8Array;
  normals?: Float32Array;
  restN?: Float32Array;
  tangents?: Float32Array;
  restT?: Float32Array;
};

type Hold =
  | { kind: "pose"; bone: number; tx: number; ty: number; tz: number }
  | { kind: "rotate"; bone: number; axisLocal: THREE.Vector3; axisWorld: THREE.Vector3; startQ: THREE.Quaternion; startDir: THREE.Vector3 }
  | { kind: "move"; bone: number; axisWorld: THREE.Vector3; startOff: THREE.Vector3; startHit: THREE.Vector3 }
  | { kind: "tissue"; gx: number; gy: number; gz: number; tx: number; ty: number; tz: number; radius: number };

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _v = new THREE.Vector3();
const _nml = new THREE.Vector3();
const _e = new THREE.Euler();
const IDENTITY = new THREE.Quaternion();
const _c = new THREE.Color();

type Group = "body" | "face" | "hair" | "foot";

type BoneDef = {
  name: string;
  parent: string | null;
  x: number;
  y: number;
  z: number;
  radius: number;
  maxAng: number;
  group: Group;
};

function distToSeg(px: number, py: number, pz: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const apx = px - ax;
  const apy = py - ay;
  const apz = pz - az;
  const ab2 = abx * abx + aby * aby + abz * abz || 1e-8;
  let t = (apx * abx + apy * aby + apz * abz) / ab2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const dx = apx - abx * t;
  const dy = apy - aby * t;
  const dz = apz - abz * t;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function smoother(d: number, r: number) {
  const t = d / Math.max(r, 1e-4);
  if (t >= 1) return 0;
  const u = 1 - t;
  return u * u * u * (u * (u * 6 - 15) + 10);
}

function hueColor(i: number, out: THREE.Color) {
  return out.setHSL((i * 0.17) % 1, 0.62, 0.55);
}

function pt(lm: Record<string, THREE.Vector3>, name: string, fb: THREE.Vector3) {
  return lm[name] ?? fb;
}

export class SoftSkeleton {
  readonly names: string[] = [];
  readonly parent: Int16Array;
  readonly rest: Float32Array;
  readonly radius: Float32Array;
  readonly maxAng: Float32Array;
  readonly group: Group[] = [];
  readonly count: number;
  energy = 0;
  expression: ExpressionId = "rest";
  pose: PoseId = "idle";

  private readonly q: THREE.Quaternion[] = [];
  private readonly qv: THREE.Vector3[] = [];
  private readonly wpos: THREE.Vector3[] = [];
  private readonly wrot: THREE.Quaternion[] = [];
  private readonly poseQ: THREE.Quaternion[] = [];
  private readonly poseOff: THREE.Vector3[] = [];
  private readonly exprQ: THREE.Quaternion[] = [];
  private readonly exprOff: THREE.Vector3[] = [];
  private readonly off: THREE.Vector3[] = [];
  private hold: Hold | null = null;
  private dents: { x: number; y: number; z: number; t: number; force: number; range: number }[] = [];
  private rebound = 0.58;
  private yawVel = 0;
  private pitchVel = 0;
  private yawF = 0;
  private pitchF = 0;
  private gazeWant = false;
  private gazeBlend = 0;
  private gazeEyeBlend = 0;
  private gazeNeckBlend = 0;
  private readonly gazeTarget = new THREE.Vector3();
  private readonly gazeNeckQ = new THREE.Quaternion();
  private readonly gazeHeadQ = new THREE.Quaternion();
  private readonly gazeEyeLQ = new THREE.Quaternion();
  private readonly gazeEyeRQ = new THREE.Quaternion();
  private iNeck = -1;
  private iHead = -1;
  private iSpine = -1;
  private iEyeL = -1;
  private iEyeR = -1;
  private iFace = -1;
  private readonly lidW: Float32Array;
  private readonly lidKind: Int8Array;
  private closeAmtL = 0;
  private closeAmtR = 0;
  private blinkT = -1;
  private blinkDur = 0.28;
  private nextBlink = 0.8;
  private blinkAmt = 0;
  private debugBlink = -1;
  private blinkOn = true;
  private eyeOpenL = 1;
  private eyeOpenR = 1;
  private blinkRate = 38;
  private blinkSpeed = 1;
  private mouthOpen = 0;
  private mouthU = 0;
  private mouthSmileU = 0;
  private mouthPuckerU = 0;
  private mouthWidthU = 0;
  private readonly mouthKind: Int8Array;
  private readonly mouthQ: THREE.Quaternion[] = [];
  private readonly mouthOff: THREE.Vector3[] = [];
  private readonly mouthSmileOff: THREE.Vector3[] = [];
  private readonly mouthPuckerOff: THREE.Vector3[] = [];
  private readonly mouthWidthOff: THREE.Vector3[] = [];
  private readonly brL = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, sx: 0, sy: 0, sz: 0, svx: 0, svy: 0, svz: 0 };
  private readonly brR = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, sx: 0, sy: 0, sz: 0, svx: 0, svy: 0, svz: 0 };
  private readonly bindings: SkinBinding[] = [];
  private readonly headY: number;
  private readonly bustY: number;
  private neckY = 0;
  private navelY: number;
  private breathT = 0;
  private readonly hairDepth: Float32Array;
  private readonly hairIds: number[] = [];
  private hairLash: Uint8Array | undefined;
  private readonly hairP: THREE.Vector3[] = [];
  private readonly hairPrev: THREE.Vector3[] = [];
  private hairLen = new Float32Array(0);
  private readonly chestPos = new THREE.Vector3();
  private readonly chestVel = new THREE.Vector3();
  private readonly byName: Record<string, number> = {};

  constructor(lm: Record<string, THREE.Vector3>, height: number, native?: NativeBone[]) {
    const navel = pt(lm, "navel", new THREE.Vector3(0, height * 0.62, 0.1));
    const ny = navel.y;
    this.navelY = ny;
    this.headY = pt(lm, "head", new THREE.Vector3(0, height * 0.93, 0.02)).y;
    this.bustY = pt(lm, "lBreast", new THREE.Vector3(-0.07, ny + 0.28, 0.08)).y;

    const defs: BoneDef[] =
      native && native.length > 20
        ? native.map((b) => ({
            name: b.name,
            parent: b.parent,
            x: b.x,
            y: b.y,
            z: b.z,
            radius: b.radius,
            maxAng: b.maxAng,
            group: b.group,
          }))
        : [{ name: "hips", parent: null, x: 0, y: ny, z: 0, radius: 0.12, maxAng: 0.4, group: "body" }];

    this.count = defs.length;
    this.parent = new Int16Array(this.count);
    this.rest = new Float32Array(this.count * 3);
    this.radius = new Float32Array(this.count);
    this.maxAng = new Float32Array(this.count);
    this.hairDepth = new Float32Array(this.count);

    defs.forEach((d, i) => {
      this.byName[d.name] = i;
    });
    for (let i = 0; i < this.count; i++) {
      const b = defs[i]!;
      this.names.push(b.name);
      this.group.push(b.group);
      this.parent[i] = b.parent ? (this.byName[b.parent] ?? -1) : -1;
      this.rest[i * 3] = b.x;
      this.rest[i * 3 + 1] = b.y;
      this.rest[i * 3 + 2] = b.z;
      this.radius[i] = b.radius;
      this.maxAng[i] = b.maxAng;
      this.q.push(new THREE.Quaternion());
      this.qv.push(new THREE.Vector3());
      this.off.push(new THREE.Vector3());
      this.wpos.push(new THREE.Vector3(b.x, b.y, b.z));
      this.wrot.push(new THREE.Quaternion());
      this.poseQ.push(new THREE.Quaternion());
      this.poseOff.push(new THREE.Vector3());
      this.exprQ.push(new THREE.Quaternion());
      this.exprOff.push(new THREE.Vector3());
    }
    const neckI = this.byName["C_Neck_a"];
    this.neckY = neckI !== undefined ? this.rest[neckI * 3 + 1]! : this.headY - 0.08;
    this.iNeck = this.byName["C_Neck_a"] ?? -1;
    this.iHead = this.byName["C_Head_a"] ?? -1;
    this.iSpine = this.byName["C_Spine_d"] ?? -1;
    this.iEyeL = this.byName["L_Eye"] ?? -1;
    this.iEyeR = this.byName["R_Eye"] ?? -1;
    this.iFace = this.byName["C_FaceBase_a"] ?? this.iHead;
    this.lidW = new Float32Array(this.count);
    this.lidKind = new Int8Array(this.count);
    for (let i = 0; i < this.count; i++) {
      const nm = this.names[i]!;
      const m = /^(L|R)_(U|D)lid_([A-E])$/.exec(nm);
      if (!m) continue;
      const letter = m[3]!;
      const w = letter === "C" ? 1 : letter === "B" ? 0.92 : letter === "D" ? 0.8 : letter === "A" ? 0.66 : 0.52;
      this.lidW[i] = w;
      this.lidKind[i] = m[2] === "U" ? 1 : -1;
    }
    this.mouthKind = new Int8Array(this.count);
    const faceI = this.iFace >= 0 ? this.iFace : 0;
    const hy = this.rest[faceI * 3 + 1]! - 0.01;
    const hz = this.rest[faceI * 3 + 2]! + 0.006;
    const jawT = 0.32;
    const add = (arr: THREE.Vector3[], i: number, x: number, y: number, z: number) => {
      arr[i]!.x += x;
      arr[i]!.y += y;
      arr[i]!.z += z;
      this.mouthKind[i] = 1;
    };
    for (let i = 0; i < this.count; i++) {
      this.mouthQ.push(new THREE.Quaternion());
      this.mouthOff.push(new THREE.Vector3());
      this.mouthSmileOff.push(new THREE.Vector3());
      this.mouthPuckerOff.push(new THREE.Vector3());
      this.mouthWidthOff.push(new THREE.Vector3());
      const nm = this.names[i]!;
      let w = 0;
      if (nm === "C_Chin" || /Dteeth/.test(nm)) w = 1;
      else if (/Tongroot/.test(nm)) w = 0.78;
      else if (/Tongtip/.test(nm)) w = 0.62;
      else if (nm === "C_Dlip" || nm === "C_Dlipin") w = 0.94;
      else if (nm === "C_Dlipout") w = 0.88;
      else if (/^(L|R)_Dlip_A$/.test(nm)) w = 0.9;
      else if (/^(L|R)_Dlip/.test(nm)) w = 0.82;
      else if (nm === "C_Ulip") w = -0.03;
      else if (nm === "C_Ulipout" || /^(L|R)_Ulip_A$/.test(nm)) w = -0.018;
      if (w) {
        this.mouthKind[i] = 1;
        const y = this.rest[i * 3 + 1]!;
        const z = this.rest[i * 3 + 2]!;
        const dy = y - hy;
        const dz = z - hz;
        const th = jawT * w;
        const c = Math.cos(th);
        const s = Math.sin(th);
        this.mouthOff[i]!.set(0, hy + dy * c - dz * s - y, hz + dy * s + dz * c - z);
      }
      const sx = this.rest[i * 3]! >= 0 ? 1 : -1;
      if (/^(L|R)_Ucor$/.test(nm)) {
        add(this.mouthSmileOff, i, sx * 0.0055, 0.005, 0.0015);
        add(this.mouthPuckerOff, i, -sx * 0.0045, 0, 0.004);
        add(this.mouthWidthOff, i, sx * 0.006, 0, 0);
      } else if (/^(L|R)_Dcor$/.test(nm)) {
        add(this.mouthSmileOff, i, sx * 0.0045, 0.003, 0.001);
        add(this.mouthPuckerOff, i, -sx * 0.004, -0.001, 0.0035);
        add(this.mouthWidthOff, i, sx * 0.0055, 0, 0);
      } else if (/Ucorin|Dcorin/.test(nm)) {
        add(this.mouthSmileOff, i, sx * 0.003, 0.002, 0.001);
        add(this.mouthPuckerOff, i, -sx * 0.003, 0, 0.003);
        add(this.mouthWidthOff, i, sx * 0.004, 0, 0);
      } else if (/^(L|R)_Dlipout_B$/.test(nm)) {
        add(this.mouthSmileOff, i, sx * 0.0035, 0.0035, 0);
        add(this.mouthPuckerOff, i, -sx * 0.003, 0, 0.002);
        add(this.mouthWidthOff, i, sx * 0.0045, 0, 0);
      } else if (nm === "C_Ulip" || nm === "C_Ulipout") {
        add(this.mouthSmileOff, i, 0, 0.002, 0);
        add(this.mouthPuckerOff, i, 0, 0.0015, 0.005);
      } else if (nm === "C_Dlip" || nm === "C_Dlipout") {
        add(this.mouthSmileOff, i, 0, 0.001, 0);
        add(this.mouthPuckerOff, i, 0, -0.0015, 0.005);
      } else if (/Cheek_C/.test(nm)) {
        add(this.mouthSmileOff, i, sx * 0.0025, 0.002, 0);
        add(this.mouthWidthOff, i, sx * 0.003, 0, 0);
      }
    }
    for (let i = 0; i < this.count; i++) {
      if (this.group[i] !== "hair") continue;
      let d = 0;
      let p = i;
      while (this.parent[p] >= 0 && this.group[this.parent[p]] === "hair") {
        d++;
        p = this.parent[p];
      }
      this.hairDepth[i] = Math.min(1, d / 8);
    }
    for (let i = 0; i < this.count; i++) if (this.group[i] === "hair") this.hairIds.push(i);
    this.hairLen = new Float32Array(this.hairIds.length);
    for (let k = 0; k < this.hairIds.length; k++) {
      const i = this.hairIds[k]!;
      this.hairP.push(new THREE.Vector3(this.rest[i * 3]!, this.rest[i * 3 + 1]!, this.rest[i * 3 + 2]!));
      this.hairPrev.push(new THREE.Vector3(this.rest[i * 3]!, this.rest[i * 3 + 1]!, this.rest[i * 3 + 2]!));
      if (k === 0) this.hairLen[0] = 0;
      else {
        const p = this.hairIds[k - 1]!;
        this.hairLen[k] = Math.hypot(
          this.rest[i * 3]! - this.rest[p * 3]!,
          this.rest[i * 3 + 1]! - this.rest[p * 3 + 1]!,
          this.rest[i * 3 + 2]! - this.rest[p * 3 + 2]!,
        );
      }
    }
    this.updateFK();
  }

  bind(positions: Float32Array, hint = "body", tris?: ArrayLike<number>, normals?: Float32Array, tangents?: Float32Array): SkinBinding {
    const n = positions.length / 3;
    const index = new Uint16Array(n * 4);
    const weight = new Float32Array(n * 4);
    const rest = new Float32Array(positions);
    const colors = new Float32Array(n * 3);
    const softness = new Float32Array(n);
    const delta = new Float32Array(n * 3);
    const dprev = new Float32Array(n * 3);
    const scores = new Float32Array(this.count);
    const allow = this.allowedBones(hint);
    const hy = this.headY;
    const by = this.bustY;
    const ny = this.navelY;

    for (let i = 0; i < n; i++) {
      const x = positions[i * 3]!;
      const y = positions[i * 3 + 1]!;
      const z = positions[i * 3 + 2]!;
      scores.fill(0);
      for (let a = 0; a < allow.length; a++) {
        const b = allow[a]!;
        const p = this.parent[b];
        const bx = this.rest[b * 3]!;
        const byy = this.rest[b * 3 + 1]!;
        const bz = this.rest[b * 3 + 2]!;
        const d =
          p < 0
            ? Math.hypot(x - bx, y - byy, z - bz)
            : distToSeg(x, y, z, this.rest[p * 3]!, this.rest[p * 3 + 1]!, this.rest[p * 3 + 2]!, bx, byy, bz);
        scores[b] = smoother(d, this.radius[b]! * 1.35);
      }
      const bi = [0, 0, 0, 0];
      const bw = [-1, -1, -1, -1];
      for (let b = 0; b < this.count; b++) {
        const s = scores[b]!;
        if (s > bw[0]!) {
          bw[3] = bw[2];
          bi[3] = bi[2];
          bw[2] = bw[1];
          bi[2] = bi[1];
          bw[1] = bw[0];
          bi[1] = bi[0];
          bw[0] = s;
          bi[0] = b;
        } else if (s > bw[1]!) {
          bw[3] = bw[2];
          bi[3] = bi[2];
          bw[2] = bw[1];
          bi[2] = bi[1];
          bw[1] = s;
          bi[1] = b;
        } else if (s > bw[2]!) {
          bw[3] = bw[2];
          bi[3] = bi[2];
          bw[2] = s;
          bi[2] = b;
        } else if (s > bw[3]!) {
          bw[3] = s;
          bi[3] = b;
        }
      }
      let sum = bw[0]! + bw[1]! + bw[2]! + bw[3]!;
      if (sum < 1e-6) {
        bi[0] = allow[0] ?? 0;
        bw[0] = 1;
        bw[1] = 0;
        bw[2] = 0;
        bw[3] = 0;
        sum = 1;
      }
      const o = i * 4;
      index[o] = bi[0]!;
      index[o + 1] = bi[1]!;
      index[o + 2] = bi[2]!;
      index[o + 3] = bi[3]!;
      weight[o] = bw[0]! / sum;
      weight[o + 1] = bw[1]! / sum;
      weight[o + 2] = bw[2]! / sum;
      weight[o + 3] = bw[3]! / sum;
      hueColor(bi[0]!, _c);
      colors[i * 3] = _c.r;
      colors[i * 3 + 1] = _c.g;
      colors[i * 3 + 2] = _c.b;

      const front = THREE.MathUtils.clamp((z + 0.02) / 0.12, 0, 1);
      const belly =
        smoother(Math.abs(y - ny), 0.11) * smoother(Math.abs(x), 0.13) * front;
      const chest =
        (y < by + 0.035 ? smoother(Math.abs(y - by + 0.012), 0.078) : 0) *
        smoother(Math.abs(Math.abs(x) - 0.09), 0.052) *
        THREE.MathUtils.clamp((z - 0.03) / 0.09, 0, 1);
      const cheek = hint === "face" || hint === "mouth" ? smoother(Math.abs(y - (hy - 0.03)), 0.04) : 0;
      let soft = 0.12;
      if (hint === "dress") soft = 0.22 + belly * 0.7 + chest * 0.78;
      else if (hint === "organs") soft = 0.82;
      else if (hint === "hair") soft = 0;
      else if (hint === "legs") soft = y < 0.2 ? 0.2 : 0.35;
      else if (hint === "face" || hint === "mouth" || hint === "eye") soft = 0.2 + cheek * 0.4;
      softness[i] = Math.min(1, soft);
    }
    if (hint === "hair") this.reskinHair(index, weight, rest, softness, n, tris);
    const binding: SkinBinding = { positions, rest, count: n, index, weight, colors, softness, delta, dprev, hair: hint === "hair", lash: hint === "hair" ? this.hairLash : undefined };
    this.attachFrame(binding, n, normals, tangents);
    this.bindings.push(binding);
    return binding;
  }

  bindPrepared(positions: Float32Array, index: Uint16Array, weight: Float32Array, hint = "body", tris?: ArrayLike<number>, normals?: Float32Array, tangents?: Float32Array): SkinBinding {
    const n = positions.length / 3;
    const rest = new Float32Array(positions);
    const colors = new Float32Array(n * 3);
    const softness = new Float32Array(n);
    const delta = new Float32Array(n * 3);
    const dprev = new Float32Array(n * 3);
    const hy = this.headY;
    const by = this.bustY;
    const ny = this.navelY;
    for (let i = 0; i < n; i++) {
      const x = positions[i * 3]!;
      const y = positions[i * 3 + 1]!;
      const z = positions[i * 3 + 2]!;
      hueColor(index[i * 4]!, _c);
      colors[i * 3] = _c.r;
      colors[i * 3 + 1] = _c.g;
      colors[i * 3 + 2] = _c.b;
      const front = THREE.MathUtils.clamp((z + 0.02) / 0.12, 0, 1);
      const belly = smoother(Math.abs(y - ny), 0.11) * smoother(Math.abs(x), 0.13) * front;
      const chest =
        (y < by + 0.035 ? smoother(Math.abs(y - by + 0.012), 0.078) : 0) *
        smoother(Math.abs(Math.abs(x) - 0.09), 0.052) *
        THREE.MathUtils.clamp((z - 0.03) / 0.09, 0, 1);
      const cheek = hint === "face" || hint === "mouth" ? smoother(Math.abs(y - (hy - 0.03)), 0.04) : 0;
      let soft = 0.12;
      if (hint === "dress") soft = 0.22 + belly * 0.7 + chest * 0.78;
      else if (hint === "organs") soft = 0.82;
      else if (hint === "hair") soft = 0;
      else if (hint === "legs") soft = y < 0.2 ? 0.2 : 0.35;
      else if (hint === "face" || hint === "mouth" || hint === "eye") soft = 0.2 + cheek * 0.4;
      else soft = 0.16 + belly * 0.55 + chest * 0.82;
      softness[i] = Math.min(1, soft);
    }
    if (hint === "hair") this.reskinHair(index, weight, rest, softness, n, tris);
    const binding: SkinBinding = { positions, rest, count: n, index, weight, colors, softness, delta, dprev, hair: hint === "hair", lash: hint === "hair" ? this.hairLash : undefined };
    this.attachFrame(binding, n, normals, tangents);
    this.bindings.push(binding);
    return binding;
  }

  private attachFrame(binding: SkinBinding, n: number, normals?: Float32Array, tangents?: Float32Array) {
    if (normals && normals.length >= n * 3) {
      binding.normals = normals;
      binding.restN = new Float32Array(n * 3);
      binding.restN.set(normals.subarray(0, n * 3));
    }
    if (tangents && tangents.length >= n * 4) {
      binding.tangents = tangents;
      binding.restT = new Float32Array(n * 4);
      binding.restT.set(tangents.subarray(0, n * 4));
    }
  }

  private reskinHair(index: Uint16Array, weight: Float32Array, rest: Float32Array, softness: Float32Array, n: number, tris?: ArrayLike<number>) {
    const head = this.byName["C_Head_a"] ?? 0;
    const hx = this.rest[head * 3]!;
    const hy = this.rest[head * 3 + 1]!;
    const hz = this.rest[head * 3 + 2]!;
    const phys = this.hairIds.slice(2);
    const crownY = this.hairIds[1] !== undefined ? this.rest[this.hairIds[1]! * 3 + 1]! - 0.02 : this.headY - 0.04;
    const setBone = (i: number, a: number, wa: number, b: number, wb: number) => {
      const o = i * 4;
      index[o] = a;
      weight[o] = wa;
      index[o + 1] = b;
      weight[o + 1] = wb;
      index[o + 2] = a;
      weight[o + 2] = 0;
      index[o + 3] = a;
      weight[o + 3] = 0;
      softness[i] = 0;
    };
    const isLash = new Uint8Array(n);
    const lidBones: number[] = [];
    const browBones: number[] = [];
    for (let b = 0; b < this.count; b++) {
      if (this.lidKind[b]) lidBones.push(b);
      else if (/Brow/.test(this.names[b]!)) browBones.push(b);
    }
    const parent = new Int32Array(n);
    for (let i = 0; i < n; i++) parent[i] = i;
    const find = (a: number) => {
      let x = a;
      while (parent[x] !== x) {
        parent[x] = parent[parent[x]!]!;
        x = parent[x]!;
      }
      return x;
    };
    const uni = (a: number, b: number) => {
      a = find(a);
      b = find(b);
      if (a !== b) parent[b] = a;
    };
    const thresh = 0.0022 * 0.0022;
    if (tris && tris.length >= 3) {
      for (let t = 0; t + 2 < tris.length; t += 3) {
        const a = tris[t]!;
        const b = tris[t + 1]!;
        const c = tris[t + 2]!;
        if (a < n && b < n) uni(a, b);
        if (b < n && c < n) uni(b, c);
        if (a < n && c < n) uni(a, c);
      }
    } else {
    const cell = 0.003;
    const grid = new Map<string, number[]>();
    for (let i = 0; i < n; i++) {
      const kx = Math.floor(rest[i * 3]! / cell);
      const ky = Math.floor(rest[i * 3 + 1]! / cell);
      const kz = Math.floor(rest[i * 3 + 2]! / cell);
      const k = `${kx},${ky},${kz}`;
      let list = grid.get(k);
      if (!list) {
        list = [];
        grid.set(k, list);
      }
      list.push(i);
    }
    for (const [k, list] of grid) {
      const [sx, sy, sz] = k.split(",").map(Number) as [number, number, number];
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          for (let oz = -1; oz <= 1; oz++) {
            const other = ox === 0 && oy === 0 && oz === 0 ? list : grid.get(`${sx + ox},${sy + oy},${sz + oz}`);
            if (!other) continue;
            for (const i of list) {
              const ix = rest[i * 3]!;
              const iy = rest[i * 3 + 1]!;
              const iz = rest[i * 3 + 2]!;
              for (const j of other) {
                if (j <= i) continue;
                const dx = ix - rest[j * 3]!;
                const dy = iy - rest[j * 3 + 1]!;
                const dz = iz - rest[j * 3 + 2]!;
                if (dx * dx + dy * dy + dz * dz < thresh) uni(i, j);
              }
            }
          }
        }
      }
    }
    }
    const clusters = new Map<number, number[]>();
    for (let i = 0; i < n; i++) {
      const r = find(i);
      let ids = clusters.get(r);
      if (!ids) {
        ids = [];
        clusters.set(r, ids);
      }
      ids.push(i);
    }
    const nearest = (x: number, y: number, z: number, bones: number[]) => {
      let best = -1;
      let bestD = 1e9;
      for (const b of bones) {
        const d = Math.hypot(x - this.rest[b * 3]!, y - this.rest[b * 3 + 1]!, z - this.rest[b * 3 + 2]!);
        if (d < bestD) {
          bestD = d;
          best = b;
        }
      }
      return { b: best, d: bestD };
    };
    for (const ids of clusters.values()) {
      if (ids.length < 3 || ids.length > 360) continue;
      let cx = 0;
      let cy = 0;
      let cz = 0;
      let minx = 1e9;
      let miny = 1e9;
      let minz = 1e9;
      let maxx = -1e9;
      let maxy = -1e9;
      let maxz = -1e9;
      let touch = 1e9;
      let touchB = -1;
      for (const i of ids) {
        const x = rest[i * 3]!;
        const y = rest[i * 3 + 1]!;
        const z = rest[i * 3 + 2]!;
        cx += x;
        cy += y;
        cz += z;
        minx = Math.min(minx, x);
        miny = Math.min(miny, y);
        minz = Math.min(minz, z);
        maxx = Math.max(maxx, x);
        maxy = Math.max(maxy, y);
        maxz = Math.max(maxz, z);
        const hit = nearest(x, y, z, lidBones);
        if (hit.d < touch) {
          touch = hit.d;
          touchB = hit.b;
        }
      }
      const inv = 1 / ids.length;
      cx *= inv;
      cy *= inv;
      cz *= inv;
      const span = Math.hypot(maxx - minx, maxy - miny, maxz - minz);
      if (span > 0.05 || touchB < 0 || touch > 0.016) continue;
      const brow = nearest(cx, cy, cz, browBones);
      if (touch + 0.004 >= brow.d) continue;
      const upper = this.lidKind[touchB]! > 0;
      const side = cx >= 0 ? "L" : "R";
      const key = `${side}_${upper ? "Ulid_C" : "Dlid_B"}`;
      const bone = this.byName[key] ?? touchB;
      for (const i of ids) {
        setBone(i, bone, 1, bone, 0);
        isLash[i] = 1;
      }
    }
    this.hairLash = isLash;
    for (let i = 0; i < n; i++) {
      if (isLash[i]) continue;
      const x = rest[i * 3]!;
      const y = rest[i * 3 + 1]!;
      const z = rest[i * 3 + 2]!;
      const dist = Math.hypot(x - hx, y - hy, z - hz);
      const isFront = z > -0.03;
      const onCrown = y >= crownY || (dist < 0.11 && z > -0.05);
      if (isFront || onCrown || phys.length < 1) {
        setBone(i, head, 1, head, 0);
        continue;
      }
      let k = 0;
      while (k < phys.length - 1 && y < this.rest[phys[k]! * 3 + 1]!) k++;
      if (k === 0) {
        const yTop = this.rest[phys[0]! * 3 + 1]!;
        const t = THREE.MathUtils.clamp((crownY - y) / Math.max(0.04, crownY - yTop), 0, 1);
        if (t < 0.12) setBone(i, head, 1, head, 0);
        else setBone(i, head, 1 - t * 0.45, phys[0]!, t * 0.45);
        continue;
      }
      const a = phys[k - 1]!;
      const b = phys[k]!;
      const ya = this.rest[a * 3 + 1]!;
      const yb = this.rest[b * 3 + 1]!;
      const t = THREE.MathUtils.clamp((ya - y) / Math.max(0.02, ya - yb), 0, 1);
      setBone(i, a, 1 - t, b, t);
    }
  }

  private findIndex(re: RegExp) {
    for (let i = 0; i < this.count; i++) if (re.test(this.names[i]!)) return i;
    return -1;
  }

  private allowedBones(hint: string) {
    const out: number[] = [];
    for (let i = 0; i < this.count; i++) {
      const g = this.group[i];
      const nm = this.names[i]!;
      let ok = false;
      if (hint === "hair") ok = g === "hair" || /Head|Neck/.test(nm);
      else if (hint === "eye") ok = /Eye|Head/.test(nm);
      else if (hint === "mouth") ok = /Chin|Lip|Tong|Head|Jaw/.test(nm);
      else if (hint === "face") ok = g === "face" || /Head|Neck/.test(nm);
      else if (hint === "legs") ok = g === "foot" || /Hip|UpperLeg|Foreleg/.test(nm);
      else if (hint === "dress") ok = g === "body";
      else if (hint === "organs") ok = /Spine|Hip/.test(nm) && !/Breast/.test(nm);
      else ok = g !== "hair" && g !== "face";
      if (ok) out.push(i);
    }
    return out.length ? out : [0];
  }

  pickBone(x: number, y: number, z: number) {
    return this.pickBoneWorld(x, y, z);
  }

  pickBoneWorld(x: number, y: number, z: number) {
    let best = -1;
    let bestS = Infinity;
    for (let b = 0; b < this.count; b++) {
      if (/C_Hip_a|^hips$|_Phy|_Spo/.test(this.names[b]!)) continue;
      const p = this.parent[b];
      const bx = this.wpos[b]!.x;
      const by = this.wpos[b]!.y;
      const bz = this.wpos[b]!.z;
      let d = Math.hypot(x - bx, y - by, z - bz);
      if (p >= 0) {
        d = Math.min(
          d,
          distToSeg(x, y, z, this.wpos[p]!.x, this.wpos[p]!.y, this.wpos[p]!.z, bx, by, bz),
        );
      }
      const rad = Math.max(0.022, this.radius[b]! * 1.8);
      const s = d / rad;
      if (s < bestS) {
        bestS = s;
        best = b;
      }
    }
    return bestS < 2.4 ? best : -1;
  }

  pickBoneByRay(origin: THREE.Vector3, dir: THREE.Vector3) {
    const d = dir.clone().normalize();
    let best = -1;
    let bestS = 0.036;
    for (let b = 0; b < this.count; b++) {
      if (/C_Hip_a|^hips$|_Phy|_Spo/.test(this.names[b]!)) continue;
      const px = this.wpos[b]!.x - origin.x;
      const py = this.wpos[b]!.y - origin.y;
      const pz = this.wpos[b]!.z - origin.z;
      const t = px * d.x + py * d.y + pz * d.z;
      if (t < 0.02) continue;
      const lx = origin.x + d.x * t - this.wpos[b]!.x;
      const ly = origin.y + d.y * t - this.wpos[b]!.y;
      const lz = origin.z + d.z * t - this.wpos[b]!.z;
      const dist = Math.hypot(lx, ly, lz);
      const rad = /Thumb|Index|Middle|Ring|Pinky|hair/i.test(this.names[b]!) ? 0.018 : 0.032;
      if (dist < rad && dist < bestS) {
        bestS = dist;
        best = b;
      }
    }
    return best;
  }

  setPoseDrag(bone: number, _gx: number, _gy: number, _gz: number, tx: number, ty: number, tz: number) {
    this.hold = { kind: "pose", bone, tx, ty, tz };
  }

  setRotateDrag(bone: number, axisLocal: THREE.Vector3, axisWorld: THREE.Vector3, startDir: THREE.Vector3) {
    this.hold = {
      kind: "rotate",
      bone,
      axisLocal: axisLocal.clone(),
      axisWorld: axisWorld.clone().normalize(),
      startQ: this.q[bone]!.clone(),
      startDir: startDir.clone().normalize(),
    };
  }

  updateRotateDrag(hit: THREE.Vector3) {
    const h = this.hold;
    if (!h || h.kind !== "rotate") return;
    const p = this.wpos[h.bone]!;
    _to.copy(hit).sub(p);
    _to.sub(_axis.copy(h.axisWorld).multiplyScalar(_to.dot(h.axisWorld)));
    if (_to.lengthSq() < 1e-8) return;
    _to.normalize();
    _from.copy(h.startDir);
    const sign = _axis.copy(_from).cross(_to).dot(h.axisWorld) < 0 ? -1 : 1;
    const ang = sign * _from.angleTo(_to);
    this.q[h.bone]!.copy(h.startQ).multiply(_q2.setFromAxisAngle(h.axisLocal, ang));
    this.q[h.bone]!.normalize();
  }

  setMoveDrag(bone: number, axisWorld: THREE.Vector3, startHit: THREE.Vector3) {
    this.hold = {
      kind: "move",
      bone,
      axisWorld: axisWorld.clone().normalize(),
      startOff: this.off[bone]!.clone(),
      startHit: startHit.clone(),
    };
  }

  updateMoveDrag(hit: THREE.Vector3) {
    const h = this.hold;
    if (!h || h.kind !== "move") return;
    _to.copy(hit).sub(h.startHit);
    const dist = _to.dot(h.axisWorld);
    const p = this.parent[h.bone];
    _v.copy(h.axisWorld).multiplyScalar(dist);
    if (p >= 0) _v.applyQuaternion(_q.copy(this.wrot[p]!).invert());
    this.off[h.bone]!.copy(h.startOff).add(_v);
  }

  bonePos(i: number) {
    return this.wpos[i]!;
  }

  boneRot(i: number) {
    return this.wrot[i]!;
  }

  setTissueDrag(gx: number, gy: number, gz: number, tx: number, ty: number, tz: number, radius = 0.14) {
    this.hold = { kind: "tissue", gx, gy, gz, tx, ty, tz, radius };
  }

  clearHold() {
    this.hold = null;
  }

  pushViewSpin(yawVel: number, pitchVel: number) {
    this.yawVel = THREE.MathUtils.clamp(yawVel, -12, 12);
    this.pitchVel = THREE.MathUtils.clamp(pitchVel, -8, 8);
  }

  setGazeTarget(point: THREE.Vector3 | null) {
    this.gazeWant = Boolean(point);
    if (point) this.gazeTarget.copy(point);
  }

  setBlink(amount: number) {
    this.debugBlink = amount;
    if (amount < 0) return;
    this.blinkAmt = THREE.MathUtils.clamp(amount, 0, 1);
  }

  blinkNow() {
    this.debugBlink = -1;
    this.blinkT = 0;
    this.blinkDur = 0.28;
    this.nextBlink = 0;
  }

  lidDebug() {
    const i = this.byName["L_Ulid_C"] ?? -1;
    return {
      blinkAmt: this.blinkAmt,
      eyeOpenL: this.eyeOpenL,
      eyeOpenR: this.eyeOpenR,
      closedL: this.closeAmtL,
      closedR: this.closeAmtR,
      off: i >= 0 ? this.off[i]!.toArray() : null,
    };
  }

  private closeLidPos(x: number, y: number, z: number, upper: boolean, t: number, out: THREE.Vector3) {
    const ei = x >= 0 ? this.iEyeL : this.iEyeR;
    if (ei < 0 || t <= 0) {
      out.set(x, y, z);
      return;
    }
    const ex = this.rest[ei * 3]!;
    const ey = this.rest[ei * 3 + 1]!;
    const ez = this.rest[ei * 3 + 2]!;
    const dx = x - ex;
    const dy = y - ey;
    const dz = z - ez;
    const r = Math.hypot(dy, dz);
    if (r < 0.002) {
      out.set(x, y, z);
      return;
    }
    const phi = Math.atan2(dy, dz);
    const nx = dx / 0.018;
    const tCorner = THREE.MathUtils.clamp(Math.abs(nx), 0, 1);
    const tUse = (upper ? Math.min(1, t) : t * 0.2) * (1 - 0.48 * tCorner * tCorner);
    const slit = upper ? -0.62 : -0.4;
    const phi2 = phi + (slit - phi) * tUse;
    const wrap = r + 0.0024 * tUse;
    out.set(ex + dx, ey + wrap * Math.sin(phi2), ez + wrap * Math.cos(phi2) + 0.002 * tUse);
  }

  private updateGaze(d: number) {
    const neck = this.iNeck;
    const head = this.iHead;
    const spine = this.iSpine;
    if (neck < 0 || head < 0 || spine < 0) {
      this.gazeBlend += (0 - this.gazeBlend) * (1 - Math.exp(-8 * d));
      return;
    }
    _from.copy(this.gazeTarget).sub(this.wpos[head]!);
    const dist = _from.length();
    if (dist < 0.02) {
      this.gazeBlend += (0 - this.gazeBlend) * (1 - Math.exp(-8 * d));
      return;
    }
    _from.multiplyScalar(1 / dist);
    _axis.set(0, 0, 1).applyQuaternion(this.wrot[spine]!);
    _to.set(1, 0, 0).applyQuaternion(this.wrot[spine]!);
    _v.set(0, 1, 0).applyQuaternion(this.wrot[spine]!);
    const fwd = _from.dot(_axis);
    const right = _from.dot(_to);
    const up = _from.dot(_v);
    const yaw = Math.atan2(right, fwd);
    const pitch = -Math.atan2(up, Math.hypot(right, fwd) || 1e-6);
    const inRange =
      this.gazeWant && Math.abs(yaw) < 1.78 && pitch > -1.32 && pitch < 1.12;
    const want = inRange ? 1 : 0;
    this.gazeBlend += (want - this.gazeBlend) * (1 - Math.exp(-6.5 * d));
    this.gazeEyeBlend += (want - this.gazeEyeBlend) * (1 - Math.exp(-16 * d));
    this.gazeNeckBlend += (want - this.gazeNeckBlend) * (1 - Math.exp(-3.4 * d));
    if (this.gazeBlend < 0.002) this.gazeBlend = 0;
    if (this.gazeEyeBlend < 0.002) this.gazeEyeBlend = 0;
    if (this.gazeNeckBlend < 0.002) this.gazeNeckBlend = 0;
    const neckYaw = THREE.MathUtils.clamp(yaw * 0.64, -1.22, 1.22);
    let restYaw = yaw - neckYaw;
    const headYaw = THREE.MathUtils.clamp(restYaw * 0.55, -0.55, 0.55);
    const eyeYaw = THREE.MathUtils.clamp(restYaw - headYaw, -0.52, 0.52);
    const neckPitch = THREE.MathUtils.clamp(pitch * 0.72, -0.88, 1.18);
    let restPitch = pitch - neckPitch;
    const headPitch = THREE.MathUtils.clamp(restPitch * 0.55, -0.45, 0.55);
    const eyePitch = THREE.MathUtils.clamp(restPitch - headPitch, -0.42, 0.48);
    this.gazeNeckQ.setFromEuler(_e.set(neckPitch, neckYaw, 0, "YXZ"));
    this.gazeHeadQ.setFromEuler(_e.set(headPitch, headYaw, 0, "YXZ"));
    this.gazeEyeLQ.setFromEuler(_e.set(eyePitch, eyeYaw, 0, "YXZ"));
    this.gazeEyeRQ.setFromEuler(_e.set(eyePitch, eyeYaw, 0, "YXZ"));
  }

  private updateBlink(d: number) {
    if (this.debugBlink >= 0) {
      this.blinkAmt = THREE.MathUtils.clamp(this.debugBlink, 0, 1);
      return;
    }
    if (!this.blinkOn) {
      this.blinkAmt = Math.max(0, this.blinkAmt - d * 14);
      this.blinkT = -1;
      return;
    }
    if (this.blinkT < 0) {
      this.nextBlink -= d;
      if (this.blinkAmt > 0) this.blinkAmt = Math.max(0, this.blinkAmt - d * 18);
      if (this.nextBlink > 0) return;
      this.blinkT = 0;
      const dur = THREE.MathUtils.lerp(0.48, 0.14, THREE.MathUtils.clamp(this.blinkSpeed, 0, 1));
      this.blinkDur = dur * (0.92 + Math.random() * 0.16);
      return;
    }
    this.blinkT += d;
    const u = this.blinkT / Math.max(0.12, this.blinkDur);
    if (u >= 1) {
      this.blinkT = -1;
      this.blinkAmt = 0;
      const gap = 60 / Math.max(4, this.blinkRate);
      this.nextBlink = Math.random() < 0.13 ? 0.12 + Math.random() * 0.12 : gap * (0.7 + Math.random() * 0.6);
      return;
    }
    if (u < 0.22) {
      const x = u / 0.22;
      this.blinkAmt = x * x * (3 - 2 * x);
    } else if (u < 0.34) {
      this.blinkAmt = 1;
    } else {
      const x = (u - 0.34) / 0.66;
      this.blinkAmt = 1 - x * x * (3 - 2 * x);
    }
  }

  commitPose() {
    for (let i = 0; i < this.count; i++) {
      this.poseQ[i]!.copy(this.q[i]!);
      this.poseOff[i]!.copy(this.off[i]!);
    }
  }

  setExpression(id: ExpressionId) {
    this.expression = id;
    for (let i = 0; i < this.count; i++) {
      this.exprQ[i]!.identity();
      this.exprOff[i]!.set(0, 0, 0);
    }
    const set = (name: string | RegExp, ex: number, ey: number, ez: number, ox = 0, oy = 0, oz = 0) => {
      const i = typeof name === "string" ? this.byName[name] : this.findIndex(name);
      if (i === undefined || i < 0) return;
      this.exprQ[i]!.setFromEuler(_e.set(ex, ey, ez, "XYZ"));
      this.exprOff[i]!.set(ox, oy, oz);
    };
    if (id === "smile") {
      set(/L_Ucor/, 0, 0, -0.28, -0.004, 0.006, 0.004);
      set(/R_Ucor/, 0, 0, 0.28, 0.004, 0.006, 0.004);
      set(/L_Cheek_A/, 0, 0.08, 0, -0.005, 0.005, 0.004);
      set(/R_Cheek_A/, 0, -0.08, 0, 0.005, 0.005, 0.004);
      set(/L_Eye/, 0.16, 0, 0);
      set(/R_Eye/, 0.16, 0, 0);
      set(/L_Brow_B/, -0.12, 0, 0, 0, 0.003, 0);
      set(/R_Brow_B/, -0.12, 0, 0, 0, 0.003, 0);
      set(/C_Chin/, -0.05, 0, 0);
    } else if (id === "surprise") {
      set(/L_Brow_B/, -0.4, 0.08, 0, -0.003, 0.012, 0);
      set(/R_Brow_B/, -0.4, -0.08, 0, 0.003, 0.012, 0);
      set(/C_Chin/, 0.5, 0, 0, 0, -0.012, 0.008);
      set(/L_Eye/, -0.16, 0, 0);
      set(/R_Eye/, -0.16, 0, 0);
    } else if (id === "open") {
      set(/C_Chin/, 0.62, 0, 0, 0, -0.016, 0.01);
      set(/C_Dlip/, 0.2, 0, 0);
      set(/C_Ulip/, -0.08, 0, 0);
      set(/C_Tong/, 0.18, 0, 0, 0, -0.006, 0.008);
    }
  }

  setPose(id: PoseId) {
    this.pose = id;
    for (let i = 0; i < this.count; i++) {
      this.poseQ[i]!.identity();
      this.poseOff[i]!.set(0, 0, 0);
      this.off[i]!.set(0, 0, 0);
    }
    const set = (name: string | RegExp, ex: number, ey: number, ez: number) => {
      const i = typeof name === "string" ? this.byName[name] : this.findIndex(name);
      if (i === undefined || i < 0) return;
      this.poseQ[i]!.setFromEuler(_e.set(ex, ey, ez, "XYZ"));
    };
    if (id === "armsUp") {
      set(/L_Shoulder_a/, 0, 0, 0.55);
      set(/L_UpperArm_a/, -0.2, 0.25, 1.45);
      set(/L_Forearm_a/, 0.4, 0, 0.2);
      set(/R_Shoulder_a/, 0, 0, -0.55);
      set(/R_UpperArm_a/, -0.2, -0.25, -1.45);
      set(/R_Forearm_a/, 0.4, 0, -0.2);
      set(/C_Spine_c/, -0.08, 0, 0);
    } else if (id === "bow") {
      set(/C_Spine_a/, 0.32, 0, 0);
      set(/C_Spine_b/, 0.38, 0, 0);
      set(/C_Spine_c/, 0.28, 0, 0);
      set(/C_Neck_a/, 0.16, 0, 0);
      set(/C_Head_a/, 0.1, 0, 0);
    } else if (id === "legLift") {
      set(/L_UpperLeg_a/, -1.05, 0.04, 0.06);
      set(/L_Foreleg_a/, 0.8, 0, 0);
      set(/L_Foot_a/, 0.18, 0, 0);
      set(/C_Spine_a/, -0.05, 0, 0.03);
    } else if (id === "twist") {
      set(/C_Hip_a/, 0, 0.12, 0);
      set(/C_Spine_a/, 0, 0.28, 0);
      set(/C_Spine_b/, 0, 0.34, 0);
      set(/C_Spine_c/, 0, 0.22, 0);
      set(/C_Neck_a/, 0, -0.16, 0);
      set(/L_UpperArm_a/, 0.12, 0.2, 0.18);
      set(/R_UpperArm_a/, 0.12, -0.2, -0.18);
    } else if (id === "sway") {
      set(/C_Hip_a/, 0, 0, 0.2);
      set(/C_Spine_a/, 0, 0.16, -0.1);
      set(/C_Spine_b/, 0, 0.2, 0.08);
      set(/C_Spine_c/, 0.06, 0.1, -0.05);
      set(/L_UpperArm_a/, 0.16, 0.25, 0.3);
      set(/R_UpperArm_a/, 0.16, -0.25, -0.3);
      set(/L_UpperLeg_a/, 0.07, 0, 0.1);
      set(/R_UpperLeg_a/, -0.1, 0, -0.07);
    }
  }

  reset() {
    for (let i = 0; i < this.count; i++) {
      this.q[i]!.identity();
      this.qv[i]!.set(0, 0, 0);
      this.off[i]!.set(0, 0, 0);
      this.poseQ[i]!.identity();
      this.poseOff[i]!.set(0, 0, 0);
    }
    for (const b of this.bindings) {
      b.delta.fill(0);
      b.dprev.fill(0);
    }
    this.brL.x = this.brL.y = this.brL.z = this.brL.vx = this.brL.vy = this.brL.vz = 0;
    this.brL.sx = this.brL.sy = this.brL.sz = this.brL.svx = this.brL.svy = this.brL.svz = 0;
    this.brR.x = this.brR.y = this.brR.z = this.brR.vx = this.brR.vy = this.brR.vz = 0;
    this.brR.sx = this.brR.sy = this.brR.sz = this.brR.svx = this.brR.svy = this.brR.svz = 0;
    this.chestPos.set(0, 0, 0);
    this.chestVel.set(0, 0, 0);
    for (let k = 0; k < this.hairIds.length; k++) {
      const i = this.hairIds[k]!;
      this.hairP[k]!.set(this.rest[i * 3]!, this.rest[i * 3 + 1]!, this.rest[i * 3 + 2]!);
      this.hairPrev[k]!.set(this.rest[i * 3]!, this.rest[i * 3 + 1]!, this.rest[i * 3 + 2]!);
    }
    this.yawF = this.pitchF = this.yawVel = this.pitchVel = 0;
    this.hold = null;
    this.dents.length = 0;
    this.setPose(this.pose);
    this.setExpression(this.expression);
    this.updateFK();
    this.applyAll();
  }

  shake(strength = 0.08) {
    for (const b of this.bindings) {
      for (let i = 0; i < b.count; i++) {
        const s = b.softness[i]! * strength;
        if (s < 0.002) continue;
        b.dprev[i * 3]! += (Math.random() - 0.5) * s * 0.8;
        b.dprev[i * 3 + 1]! += (Math.random() - 0.5) * s * 0.5;
        b.dprev[i * 3 + 2]! += (Math.random() - 0.5) * s;
      }
    }
  }

  impulse(x: number, y: number, z: number, force: number, range: number) {
    const f = THREE.MathUtils.clamp(force, 0.08, 1.15);
    const rg = THREE.MathUtils.clamp(range, 0.08, 1);
    const sig = 0.04 + rg * 0.1;
    const sig2 = sig * sig;
    const depth = 0.018 + f * 0.042;
    this.dents.push({ x, y, z, t: 0, force: f, range: rg });
    if (this.dents.length > 3) this.dents.shift();
    for (const bind of this.bindings) {
      const { count, rest, softness, delta, dprev } = bind;
      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        const dx = rest[i3]! - x;
        const dy = rest[i3 + 1]! - y;
        const dz = rest[i3 + 2]! - z;
        const r2 = dx * dx + dy * dy;
        const crater = Math.exp(-r2 / sig2);
        if (crater < 0.02) continue;
        const front = THREE.MathUtils.clamp((rest[i3 + 2]! + 0.02) / 0.12, 0.15, 1);
        const wall = THREE.MathUtils.clamp(softness[i]! * 2.8 + 0.4, 0.4, 1);
        const sink = crater * depth * front * wall;
        const inv = 1 / Math.max(1e-4, Math.hypot(dx, dy));
        delta[i3] += dx * inv * sink * 0.35;
        delta[i3 + 1] += dy * inv * sink * 0.28;
        delta[i3 + 2] -= sink;
        dprev[i3] += dx * inv * sink * 1.1;
        dprev[i3 + 1] += dy * inv * sink * 0.85;
        dprev[i3 + 2] -= sink * 2.4;
      }
    }
    for (let b = 0; b < this.count; b++) {
      if (this.names[b] !== "belly" && this.names[b] !== "spine1") continue;
      this.qv[b]!.z += f * (this.names[b] === "belly" ? 2.4 : 0.7);
    }
  }

  step(dt: number, params: SkelParams) {
    const d = Math.min(dt, 0.04);
    this.rebound = THREE.MathUtils.clamp(params.rebound, 0, 1);
    const follow = 1 - Math.exp(-7 * d);
    this.yawF += (this.yawVel - this.yawF) * follow;
    this.pitchF += (this.pitchVel - this.pitchF) * follow;
    this.applyHoldPose();
    this.blinkOn = params.blinkEnabled;
    this.eyeOpenL = THREE.MathUtils.clamp(params.eyeOpenL, 0, 1);
    this.eyeOpenR = THREE.MathUtils.clamp(params.eyeOpenR, 0, 1);
    this.blinkRate = THREE.MathUtils.clamp(params.blinkRate, 4, 40);
    this.blinkSpeed = THREE.MathUtils.clamp(params.blinkSpeed, 0, 1);
    this.mouthOpen = THREE.MathUtils.clamp(params.mouthOpen, 0, 1);
    const mouthT = this.mouthOpen * this.mouthOpen * (3 - 2 * this.mouthOpen);
    const followM = 1 - Math.exp(-9 * d);
    this.mouthU += (mouthT - this.mouthU) * followM;
    this.mouthSmileU += (THREE.MathUtils.clamp(params.mouthSmile, -1, 1) - this.mouthSmileU) * followM;
    this.mouthPuckerU += (THREE.MathUtils.clamp(params.mouthPucker, 0, 1) - this.mouthPuckerU) * followM;
    this.mouthWidthU += (THREE.MathUtils.clamp(params.mouthWidth, -1, 1) - this.mouthWidthU) * followM;
    if (this.mouthU < 0.0008) this.mouthU = 0;
    this.updateGaze(d);
    this.updateBlink(d);
    this.closeAmtL = THREE.MathUtils.clamp(1 - this.eyeOpenL * (1 - this.blinkAmt), 0, 1);
    this.closeAmtR = THREE.MathUtils.clamp(1 - this.eyeOpenR * (1 - this.blinkAmt), 0, 1);
    const h = this.hold;
    const held = h && h.kind !== "tissue" ? h.bone : -1;
    const heldParent = held >= 0 ? this.parent[held] : -1;
    const heldGrand = heldParent >= 0 ? this.parent[heldParent] : -1;
    const stiff = 14 + params.stiffness * 18;
    const damp = 6 + params.damping * 7;
    const jiggle = 0.4 + params.jiggle * 0.85;
    const gb = this.gazeBlend;

    for (let i = 0; i < this.count; i++) {
      const g = this.group[i];
      const locked = i === held || i === heldParent || i === heldGrand;
      const q = this.q[i]!;
      const qv = this.qv[i]!;
      const isFace = g === "face";
      if (g === "hair" || /Breast_[ab]_Phy/.test(this.names[i]!)) continue;
      if (this.lidKind[i]) {
        const t = (this.rest[i * 3]! >= 0 ? this.closeAmtL : this.closeAmtR) * this.lidW[i]!;
        this.closeLidPos(this.rest[i * 3]!, this.rest[i * 3 + 1]!, this.rest[i * 3 + 2]!, this.lidKind[i]! > 0, t, _from);
        const ex = this.rest[i * 3]!;
        const ey = this.rest[i * 3 + 1]!;
        const ez = this.rest[i * 3 + 2]!;
        this.off[i]!.set(_from.x - ex, _from.y - ey, _from.z - ez);
        const ei = ex >= 0 ? this.iEyeL : this.iEyeR;
        if (ei >= 0) {
          const iy = this.rest[ei * 3 + 1]!;
          const iz = this.rest[ei * 3 + 2]!;
          const phi0 = Math.atan2(ey - iy, ez - iz);
          const phi1 = Math.atan2(_from.y - iy, _from.z - iz);
          q.setFromEuler(_e.set(phi1 - phi0, 0, 0, "YXZ"));
        }
        qv.set(0, 0, 0);
        continue;
      }
      let targetQ = isFace && this.expression !== "rest" ? this.exprQ[i]! : this.poseQ[i]!;
      if (!locked && this.mouthU > 0.001 && this.mouthKind[i]) {
        _q.slerpQuaternions(IDENTITY, this.mouthQ[i]!, this.mouthU);
        _q2.copy(targetQ).multiply(_q);
        targetQ = _q2;
      }
      if (!locked && (this.gazeEyeBlend > 0.01 || this.gazeNeckBlend > 0.01 || gb > 0.01)) {
        if (i === this.iNeck) {
          _q2.copy(this.poseQ[i]!).slerp(this.gazeNeckQ, this.gazeNeckBlend);
          targetQ = _q2;
        } else if (i === this.iHead) {
          _q2.copy(this.poseQ[i]!).slerp(this.gazeHeadQ, this.gazeBlend);
          targetQ = _q2;
        } else if (i === this.iEyeL) {
          _q2.copy(targetQ).slerp(this.gazeEyeLQ, this.gazeEyeBlend);
          targetQ = _q2;
        } else if (i === this.iEyeR) {
          _q2.copy(targetQ).slerp(this.gazeEyeRQ, this.gazeEyeBlend);
          targetQ = _q2;
        }
      }
      if (
        !locked &&
        ((i === this.iEyeL || i === this.iEyeR) && this.gazeEyeBlend > 0.08 ||
          i === this.iHead && gb > 0.12 ||
          i === this.iNeck && this.gazeNeckBlend > 0.12)
      ) {
        const k = i === this.iEyeL || i === this.iEyeR ? 22 : i === this.iHead ? 7.2 : 3.4;
        q.slerp(targetQ, 1 - Math.exp(-k * d));
        qv.set(0, 0, 0);
        continue;
      }
      if (!locked && this.mouthKind[i]) {
        q.slerp(targetQ, 1 - Math.exp(-16 * d));
        qv.set(0, 0, 0);
        continue;
      }
      if (!locked) {
        _q.copy(q).invert().multiply(targetQ);
        const ang = 2 * Math.acos(Math.min(1, Math.abs(_q.w)));
        if (ang > 1e-5) {
          const s = Math.sqrt(1 - _q.w * _q.w) || 1e-6;
          const sign = _q.w < 0 ? -1 : 1;
          const k = isFace ? stiff * 1.5 : stiff;
          qv.x += sign * (_q.x / s) * ang * k * d;
          qv.y += sign * (_q.y / s) * ang * k * d;
          qv.z += sign * (_q.z / s) * ang * k * d;
        }
      }
      qv.multiplyScalar(Math.exp(-damp * d));
      const spin = qv.length() * d * 0.55;
      if (spin > 1e-8) {
        _axis.copy(qv).normalize();
        _q.setFromAxisAngle(_axis, spin);
        q.premultiply(_q);
        q.normalize();
      }
      const maxA = locked ? 2.8 : this.maxAng[i]!;
      const aNow = 2 * Math.acos(Math.min(1, Math.abs(q.w)));
      if (aNow > maxA && aNow > 1e-5) q.slerp(IDENTITY, 1 - maxA / aNow);
    }

    this.updateFK();
    this.stepHair(d, params);
    this.stepDents(d);
    this.stepTissue(d, params);
    this.stepBreasts(d, params);
    this.updateFK();
    this.applyAll();

    let e = 0;
    for (let i = 0; i < this.count; i++) {
      const a = 2 * Math.acos(Math.min(1, Math.abs(this.q[i]!.w)));
      e += a * a;
    }
    this.energy = e;
  }

  jointPositions(out: Float32Array) {
    for (let i = 0; i < this.count; i++) {
      out[i * 3] = this.wpos[i]!.x;
      out[i * 3 + 1] = this.wpos[i]!.y;
      out[i * 3 + 2] = this.wpos[i]!.z;
    }
    return out;
  }

  boneLineCount() {
    let n = 0;
    for (let i = 0; i < this.count; i++) if (this.parent[i] >= 0) n++;
    return n;
  }

  writeBoneLines(out: Float32Array) {
    let o = 0;
    for (let i = 0; i < this.count; i++) {
      const p = this.parent[i];
      if (p < 0) continue;
      out[o] = this.wpos[p]!.x;
      out[o + 1] = this.wpos[p]!.y;
      out[o + 2] = this.wpos[p]!.z;
      out[o + 3] = this.wpos[i]!.x;
      out[o + 4] = this.wpos[i]!.y;
      out[o + 5] = this.wpos[i]!.z;
      o += 6;
    }
    return out;
  }

  private applyHoldPose() {
    const h = this.hold;
    if (!h || h.kind === "tissue" || h.kind === "rotate" || h.kind === "move") return;
    const end = h.bone;
    if (end < 0) return;
    const target = _to.set(h.tx, h.ty, h.tz);
    const rotators: number[] = [];
    let p = this.parent[end];
    for (let i = 0; i < 3 && p >= 0; i++) {
      if (/C_Hip_a|^hips$/.test(this.names[p]!)) break;
      rotators.push(p);
      p = this.parent[p];
    }
    if (!rotators.length && !/C_Hip_a|^hips$/.test(this.names[end]!)) rotators.push(end);
    for (let pass = 0; pass < 2; pass++) {
      for (const pivot of rotators) {
        this.updateFK();
        _from.copy(this.wpos[end]!).sub(this.wpos[pivot]!);
        _v.copy(target).sub(this.wpos[pivot]!);
        if (_from.lengthSq() < 1e-8 || _v.lengthSq() < 1e-8) continue;
        _from.normalize();
        _v.normalize();
        _q.setFromUnitVectors(_from, _v);
        const pp = this.parent[pivot];
        if (pp >= 0) {
          _q2.copy(this.wrot[pp]!).invert();
          _q.premultiply(_q2);
          _q.multiply(this.wrot[pp]!);
        }
        this.q[pivot]!.premultiply(_q);
        this.q[pivot]!.normalize();
      }
    }
    this.updateFK();
  }

  get hasDents() {
    return this.dents.length > 0;
  }

  private stepHair(d: number, params: SkelParams) {
    const n = this.hairIds.length;
    if (n < 2) return;
    const root = this.hairIds[0]!;
    const rp = this.wpos[root]!;
    const neckCut = this.neckY;
    const pinned = (k: number) => k <= 1;
    this.hairP[0]!.copy(rp);
    this.hairPrev[0]!.copy(rp);
    const dt2 = d * d;
    const g = params.gravity * 1.8;
    const hd = THREE.MathUtils.clamp(params.hairDamp, 0, 1);
    const hi = THREE.MathUtils.clamp(params.hairInertia, 0, 1);
    const keep = 0.92 + hi * 0.07 - hd * 0.16;
    const shape = 0.05 + hd * 0.07 - hi * 0.035;
    const yaw = this.yawF;
    const pitch = this.pitchF;
    const maxStep = 0.02 + hi * 0.04;
    for (let k = 1; k < n; k++) {
      const p = this.hairP[k]!;
      const prev = this.hairPrev[k]!;
      const i = this.hairIds[k]!;
      const rx = this.rest[i * 3]!;
      const ry = this.rest[i * 3 + 1]!;
      const rz = this.rest[i * 3 + 2]!;
      if (pinned(k)) {
        p.copy(this.wpos[i]!);
        prev.copy(p);
        this.q[i]!.identity();
        this.off[i]!.set(0, 0, 0);
        continue;
      }
      let vx = (p.x - prev.x) * keep;
      let vy = (p.y - prev.y) * keep;
      let vz = (p.z - prev.z) * keep;
      const spd = Math.hypot(vx, vy, vz);
      if (spd > maxStep) {
        const s = maxStep / spd;
        vx *= s;
        vy *= s;
        vz *= s;
      }
      if (spd < 0.00018) {
        vx = 0;
        vy = 0;
        vz = 0;
      }
      const u = Math.max(0, (k - 1) / Math.max(1, n - 2));
      prev.copy(p);
      p.x += vx + (-yaw * 0.22 * u * hi + params.wind * 0.5 * u) * dt2 * 60;
      p.y += vy + g * dt2;
      p.z += vz + pitch * 0.12 * u * hi * dt2 * 60;
      p.x += (rx - p.x) * shape;
      p.y += (ry - p.y) * shape * 0.75;
      p.z += (rz - p.z) * shape;
      if (p.y < ry - 0.1) p.y = ry - 0.1;
      if (p.z > rz + 0.03) p.z = rz + 0.03;
      if (p.y < neckCut) {
        const cx = p.x;
        const cz = p.z - 0.03;
        const rad = Math.hypot(cx, cz);
        if (rad < 0.118) {
          const s = 0.118 / (rad || 1e-6);
          p.x = cx * s;
          p.z = 0.03 + cz * s;
          if (p.z > rz) p.z = rz;
        }
      }
    }
    for (let iter = 0; iter < 3; iter++) {
      this.hairP[0]!.copy(rp);
      for (let k = 1; k < n; k++) {
        const i = this.hairIds[k]!;
        if (pinned(k)) {
          this.hairP[k]!.copy(this.wpos[i]!);
          continue;
        }
        const a = this.hairP[k - 1]!;
        const b = this.hairP[k]!;
        _from.copy(b).sub(a);
        const len = _from.length() || 1e-8;
        const restL = this.hairLen[k]! || len;
        const corr = (len - restL) / len;
        b.addScaledVector(_from, -corr * 0.85);
      }
    }
    for (let k = 0; k < n; k++) {
      const i = this.hairIds[k]!;
      if (pinned(k)) {
        this.q[i]!.identity();
        this.off[i]!.set(0, 0, 0);
        continue;
      }
      const par = this.parent[i];
      if (par >= 0 && k > 0 && pinned(k - 1)) {
        _v.set(
          this.rest[i * 3]! - this.rest[par * 3]!,
          this.rest[i * 3 + 1]! - this.rest[par * 3 + 1]!,
          this.rest[i * 3 + 2]! - this.rest[par * 3 + 2]!,
        );
        _to.copy(this.hairP[k]!).sub(this.wpos[par]!);
        _q2.copy(this.wrot[par]!).invert();
        _to.applyQuaternion(_q2);
        this.off[i]!.set(_to.x - _v.x, _to.y - _v.y, _to.z - _v.z);
      } else {
        this.off[i]!.set(0, 0, 0);
      }
      if (k >= n - 1) {
        this.q[i]!.slerp(IDENTITY, 0.3);
        continue;
      }
      const c = this.hairIds[k + 1]!;
      _from.set(
        this.rest[c * 3]! - this.rest[i * 3]!,
        this.rest[c * 3 + 1]! - this.rest[i * 3 + 1]!,
        this.rest[c * 3 + 2]! - this.rest[i * 3 + 2]!,
      );
      _to.copy(this.hairP[k + 1]!).sub(this.hairP[k]!);
      if (_from.lengthSq() < 1e-10 || _to.lengthSq() < 1e-10) {
        this.q[i]!.slerp(IDENTITY, 0.3);
        continue;
      }
      _from.normalize();
      _to.normalize();
      if (par >= 0) {
        _q2.copy(this.wrot[par]!).invert();
        _to.applyQuaternion(_q2);
      }
      if (_from.dot(_to) > 0.9995) {
        this.q[i]!.slerp(IDENTITY, 0.22);
        continue;
      }
      _q.setFromUnitVectors(_from, _to);
      this.q[i]!.slerp(_q, 0.4);
    }
  }

  private stepDents(d: number) {
    const rec = 0.5 + (1 - this.rebound) * 3.4;
    const hold = 0.18 + (1 - this.rebound) * 0.28;
    for (const dent of this.dents) dent.t += d;
    this.dents = this.dents.filter((dent) => dent.t < hold + rec + 0.15);
  }

  private dentGain(t: number) {
    const hold = 0.18 + (1 - this.rebound) * 0.28;
    const rec = 0.5 + (1 - this.rebound) * 3.4;
    if (t < 0.055) {
      const u = t / 0.055;
      return u * u;
    }
    if (t < hold) return 1;
    const u = Math.min(1, (t - hold) / rec);
    const s = 1 - u;
    return s * s * (3 - 2 * s);
  }

  private stepTissue(d: number, params: SkelParams) {
    const boost = THREE.MathUtils.clamp(params.breathBoost, 0, 1);
    const freq = (0.85 + params.breathSpeed * 1.9) * (1 + boost * 0.55);
    const amp = (0.006 + params.breathAmp * 0.012) * (1 + boost * 0.4);
    this.breathT += d * freq;
    const breath = params.breathing ? Math.sin(this.breathT) * amp : 0;
    const grab = this.hold?.kind === "tissue" ? this.hold : null;
    const k = 18 + params.stiffness * 26;
    const damp = Math.exp(-(4 + params.damping * 6) * d);
    const g = params.gravity * 0.0009;
    const ny = this.navelY;
    const by = this.bustY;

    for (const bind of this.bindings) {
      const { count, rest, softness, delta, dprev } = bind;
      for (let i = 0; i < count; i++) {
        const s = softness[i]!;
        if (s < 0.02) {
          delta[i * 3] = 0;
          delta[i * 3 + 1] = 0;
          delta[i * 3 + 2] = 0;
          continue;
        }
        const i3 = i * 3;
        const x = rest[i3]!;
        const y = rest[i3 + 1]!;
        const z = rest[i3 + 2]!;
        let tx = 0;
        let ty = 0;
        let tz = 0;
        const belly = smoother(Math.abs(y - ny), 0.12) * smoother(Math.abs(x), 0.14);
        const chest =
          (y < by + 0.035 ? smoother(Math.abs(y - by + 0.012), 0.078) : 0) *
          smoother(Math.abs(Math.abs(x) - 0.09), 0.052);
        const front = THREE.MathUtils.clamp((z + 0.01) / 0.11, 0, 1);
        tz += breath * 0.72 * belly * front;
        if (params.fistDepth > 0.002) {
          const over = params.fistDepth;
          const bAmp = params.fistBulge;
          const spread = Math.max(0.2, params.fistSpread);
          const dx = x - params.fistTx;
          const dy = y - params.fistTy;
          const bulge = smoother(Math.hypot(dx, dy), 0.16 * spread) * front;
          const rise = params.fistRise;
          tz += over * 0.9 * bAmp * rise * bulge;
          ty += over * 0.26 * bAmp * rise * bulge;
          tx += params.fistLx * 0.07 * over * bulge * 6 * params.fistLever * rise;
          tz += params.fistLz * 0.05 * over * bulge * 6 * params.fistLever * rise;
        }
        const inf = params.inflate;
        if (Math.abs(inf) > 0.004) {
          const yMask = smoother(Math.abs(y - ny), 0.2);
          const xMask = smoother(Math.abs(x), 0.22);
          const zMask = THREE.MathUtils.clamp((z + 0.04) / 0.14, 0, 1);
          const mask = yMask * xMask * (0.28 + 0.72 * zMask);
          if (mask > 0.01) {
            if (inf > 0) {
              tz += inf * 0.24 * mask;
              tx += Math.sign(x) * inf * 0.15 * mask * Math.min(1, Math.abs(x) / 0.035);
              ty -= inf * 0.045 * mask * zMask;
            } else {
              const c = -inf;
              tx += -x * c * 0.9 * yMask * xMask;
              tz -= c * 0.08 * mask;
              ty += c * 0.02 * mask;
            }
          }
        }
        if (this.dents.length) {
          for (const dent of this.dents) {
            const gain = this.dentGain(dent.t);
            if (gain < 0.01) continue;
            const dx = x - dent.x;
            const dy = y - dent.y;
            const r2 = dx * dx + dy * dy;
            const sig = 0.04 + dent.range * 0.1;
            const crater = Math.exp(-r2 / (sig * sig));
            const r = Math.sqrt(r2);
            const rim = Math.exp(-((r - sig * 1.12) / (sig * 0.42)) * ((r - sig * 1.12) / (sig * 0.42)));
            const depth = (0.016 + dent.force * 0.042) * gain;
            const wall = THREE.MathUtils.clamp(s * 2.6 + 0.45, 0.45, 1) * front;
            const sink = crater * depth * wall;
            tz -= sink;
            tz += rim * depth * 0.22 * wall;
            const inv = r < 1e-4 ? 0 : 1 / r;
            tx += dx * inv * sink * 0.32;
            ty += dy * inv * sink * 0.26;
          }
        }
        if (grab) {
          const dx = x - grab.gx;
          const dy = y - grab.gy;
          const dz = z - grab.gz;
          const w = s * Math.exp(-(dx * dx + dy * dy + dz * dz) / (grab.radius * grab.radius));
          tx += (grab.tx - grab.gx) * w;
          ty += (grab.ty - grab.gy) * w;
          tz += (grab.tz - grab.gz) * w;
        }
        let vx = (delta[i3]! - dprev[i3]!) * damp;
        let vy = (delta[i3 + 1]! - dprev[i3 + 1]!) * damp;
        let vz = (delta[i3 + 2]! - dprev[i3 + 2]!) * damp;
        vy += g * s * belly * 0.2;
        const bounce = 0.62 + chest * -0.08;
        vx += (tx - delta[i3]!) * k * d * bounce;
        vy += (ty - delta[i3 + 1]!) * k * d * bounce;
        vz += (tz - delta[i3 + 2]!) * k * d * bounce;
        dprev[i3] = delta[i3]!;
        dprev[i3 + 1] = delta[i3 + 1]!;
        dprev[i3 + 2] = delta[i3 + 2]!;
        delta[i3] = delta[i3]! + vx;
        delta[i3 + 1] = delta[i3 + 1]! + vy;
        delta[i3 + 2] = delta[i3 + 2]! + vz;
        const over = params.fistDepth;
        const lim = 0.12 + s * 0.04 + Math.abs(params.inflate) * 0.18 + Math.min(0.22, over * 0.85 * params.fistBulge * params.fistRise);
        const len = Math.hypot(delta[i3]!, delta[i3 + 1]!, delta[i3 + 2]!);
        if (len > lim) {
          const m = lim / len;
          delta[i3]! *= m;
          delta[i3 + 1]! *= m;
          delta[i3 + 2]! *= m;
        }
      }
    }
  }

  private stepBreasts(d: number, params: SkelParams) {
    const j = 0.55 + params.jiggle * 0.65;
    const soft = THREE.MathUtils.clamp(params.breastSoft, 0, 1);
    const bd = THREE.MathUtils.clamp(params.breastDamp, 0, 1);
    const bi = THREE.MathUtils.clamp(params.breastInertia, 0, 1);
    const ci = this.findIndex(/C_Spine_d/);
    if (ci >= 0) {
      const p = this.wpos[ci]!;
      const inv = 1 / Math.max(d, 1 / 120);
      const vx = (p.x - this.chestPos.x) * inv;
      const vy = (p.y - this.chestPos.y) * inv;
      const vz = (p.z - this.chestPos.z) * inv;
      let ax = (vx - this.chestVel.x) * inv;
      let ay = (vy - this.chestVel.y) * inv;
      let az = (vz - this.chestVel.z) * inv;
      const alen = Math.hypot(ax, ay, az);
      if (alen > 18) {
        const s = 18 / alen;
        ax *= s;
        ay *= s;
        az *= s;
      }
      this.chestPos.copy(p);
      this.chestVel.set(vx, vy, vz);
      const mass = 0.0048 * (0.5 + soft) * (0.25 + bi * 1.5);
      const tX = (-ax * mass * 0.55 * j - this.yawF * 0.022 * j - this.yawVel * 0.004 * j) * bi;
      const drop = (Math.abs(tX) * 0.28 + Math.abs(this.yawF) * 0.004 * j) * bi;
      const tY =
        (-ay * mass * 0.72 * j - this.pitchF * 0.012 * j - this.pitchVel * 0.003 * j) * bi -
        drop -
        0.006 * (0.3 + soft) +
        Math.sin(this.breathT) * 0.004 * (0.4 + soft);
      const tZ = (-az * mass * 0.5 * j + Math.abs(this.yawF) * 0.006 * j + Math.max(0, -ay) * mass * 0.28) * bi;
      const w1 = 11.2 - soft * 3.4;
      const z1 = 0.2 + bd * 0.32;
      const k1 = w1 * w1;
      const c1 = 2 * z1 * w1;
      const wY = 9.4 - soft * 2.2;
      const zY = 0.18 + bd * 0.28;
      const kY = wY * wY;
      const cY = 2 * zY * wY;
      const w2 = 20 - soft * 7;
      const z2 = 0.26 + bd * 0.28;
      const k2 = w2 * w2;
      const c2 = 2 * z2 * w2;
      const limX = 0.032 + soft * 0.09;
      const limY = 0.026 + soft * 0.07;
      const limZ = 0.028 + soft * 0.08;
      const step = (
        m: {
          x: number; y: number; z: number; vx: number; vy: number; vz: number;
          sx: number; sy: number; sz: number; svx: number; svy: number; svz: number;
        },
        lag: number,
      ) => {
        m.vx += (-k1 * (m.x - tX * lag) - c1 * m.vx) * d;
        m.vy += (-kY * (m.y - tY * lag) - cY * m.vy) * d;
        m.vz += (-k1 * (m.z - tZ * lag) - c1 * m.vz) * d;
        m.x += m.vx * d;
        m.y += m.vy * d;
        m.z += m.vz * d;
        m.svx += (-k2 * (m.sx - m.x) - c2 * (m.svx - m.vx)) * d;
        m.svy += (-kY * 1.15 * (m.sy - m.y) - cY * 0.9 * (m.svy - m.vy)) * d;
        m.svz += (-k2 * (m.sz - m.z) - c2 * (m.svz - m.vz)) * d;
        m.sx += m.svx * d;
        m.sy += m.svy * d;
        m.sz += m.svz * d;
        const nx = m.sx / limX;
        const ny = m.sy / limY;
        const nz = m.sz / limZ;
        const nlen = Math.hypot(nx, ny, nz);
        if (nlen > 1) {
          const s = 1 / nlen;
          m.sx *= s;
          m.sy *= s;
          m.sz *= s;
        }
      };
      step(this.brL, 1);
      step(this.brR, 1.12);
    }
    const spin = 10.5 + soft * 9;
    const li = this.findIndex(/L_Breast_b_Phy/);
    const ri = this.findIndex(/R_Breast_b_Phy/);
    const la = this.findIndex(/L_Breast_a_Phy/);
    const ra = this.findIndex(/R_Breast_a_Phy/);
    if (li >= 0) this.q[li]!.setFromEuler(_e.set(this.brL.sy * spin * 0.62, this.brL.sx * spin * 0.58, this.brL.sz * spin * 0.22));
    if (ri >= 0) this.q[ri]!.setFromEuler(_e.set(this.brR.sy * spin * 0.62, this.brR.sx * spin * 0.58, this.brR.sz * spin * 0.22));
    if (la >= 0) this.q[la]!.setFromEuler(_e.set(this.brL.sy * spin * 0.22, this.brL.sx * spin * 0.2, 0));
    if (ra >= 0) this.q[ra]!.setFromEuler(_e.set(this.brR.sy * spin * 0.22, this.brR.sx * spin * 0.2, 0));
  }

  private updateFK() {
    for (let i = 0; i < this.count; i++) {
      const p = this.parent[i];
      const ox =
        this.exprOff[i]!.x +
        this.off[i]!.x +
        this.mouthOff[i]!.x * this.mouthU +
        this.mouthSmileOff[i]!.x * this.mouthSmileU +
        this.mouthPuckerOff[i]!.x * this.mouthPuckerU +
        this.mouthWidthOff[i]!.x * this.mouthWidthU;
      const oy =
        this.exprOff[i]!.y +
        this.off[i]!.y +
        this.mouthOff[i]!.y * this.mouthU +
        this.mouthSmileOff[i]!.y * this.mouthSmileU +
        this.mouthPuckerOff[i]!.y * this.mouthPuckerU +
        this.mouthWidthOff[i]!.y * this.mouthWidthU;
      const oz =
        this.exprOff[i]!.z +
        this.off[i]!.z +
        this.mouthOff[i]!.z * this.mouthU +
        this.mouthSmileOff[i]!.z * this.mouthSmileU +
        this.mouthPuckerOff[i]!.z * this.mouthPuckerU +
        this.mouthWidthOff[i]!.z * this.mouthWidthU;
      if (p < 0) {
        this.wrot[i]!.copy(this.q[i]!);
        this.wpos[i]!.set(this.rest[i * 3]! + ox, this.rest[i * 3 + 1]! + oy, this.rest[i * 3 + 2]! + oz);
        continue;
      }
      this.wrot[i]!.copy(this.wrot[p]!).multiply(this.q[i]!);
      _v.set(
        this.rest[i * 3]! - this.rest[p * 3]! + ox,
        this.rest[i * 3 + 1]! - this.rest[p * 3 + 1]! + oy,
        this.rest[i * 3 + 2]! - this.rest[p * 3 + 2]! + oz,
      );
      _v.applyQuaternion(this.wrot[p]!);
      this.wpos[i]!.copy(this.wpos[p]!).add(_v);
    }
  }

  private applyAll() {
    for (const b of this.bindings) {
      if (b.hair) this.applyHair(b);
      else this.apply(b);
    }
  }

  private applyHair(binding: SkinBinding) {
    const { positions, rest, count, index, weight, lash } = binding;
    const closing = this.closeAmtL > 0.002 || this.closeAmtR > 0.002;
    const fi = this.iFace >= 0 ? this.iFace : this.iHead;
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const o = i * 4;
      const rx = rest[i3]!;
      const ry = rest[i3 + 1]!;
      const rz = rest[i3 + 2]!;
      const w1 = weight[o + 1]!;
      const bi0 = index[o]!;
      if (w1 < 0.02) {
        _v.set(rx - this.rest[bi0 * 3]!, ry - this.rest[bi0 * 3 + 1]!, rz - this.rest[bi0 * 3 + 2]!);
        _v.applyQuaternion(this.wrot[bi0]!);
        _v.add(this.wpos[bi0]!);
        positions[i3] = _v.x;
        positions[i3 + 1] = _v.y;
        positions[i3 + 2] = _v.z;
      } else {
        let ox = 0;
        let oy = 0;
        let oz = 0;
        for (let k = 0; k < 4; k++) {
          const w = weight[o + k]!;
          if (w < 0.0008) continue;
          const bi = index[o + k]!;
          _v.set(rx - this.rest[bi * 3]!, ry - this.rest[bi * 3 + 1]!, rz - this.rest[bi * 3 + 2]!);
          _v.applyQuaternion(this.wrot[bi]!);
          _v.add(this.wpos[bi]!);
          ox += _v.x * w;
          oy += _v.y * w;
          oz += _v.z * w;
        }
        positions[i3] = ox;
        positions[i3 + 1] = oy;
        positions[i3 + 2] = oz;
      }
      if (!closing || fi < 0) continue;
      const onLid = Boolean(lash?.[i]) || this.lidKind[bi0] !== 0;
      if (!onLid) continue;
      const close = rx >= 0 ? this.closeAmtL : this.closeAmtR;
      if (close < 0.002) continue;
      const upper = this.lidKind[bi0] >= 0;
      this.closeLidPos(rx, ry, rz, upper, close, _from);
      _to.set(_from.x - this.rest[fi * 3]!, _from.y - this.rest[fi * 3 + 1]!, _from.z - this.rest[fi * 3 + 2]!);
      _to.applyQuaternion(this.wrot[fi]!);
      _to.add(this.wpos[fi]!);
      const u = THREE.MathUtils.clamp(close * 1.1, 0, 1);
      positions[i3] += (_to.x - positions[i3]) * u;
      positions[i3 + 1] += (_to.y - positions[i3 + 1]) * u;
      positions[i3 + 2] += (_to.z - positions[i3 + 2]) * u;
    }
  }

  apply(binding: SkinBinding) {
    const { positions, rest, count, index, weight, delta } = binding;
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const rx = rest[i3]!;
      const ry = rest[i3 + 1]!;
      const rz = rest[i3 + 2]!;
      let ox = 0;
      let oy = 0;
      let oz = 0;
      const o = i * 4;
      for (let k = 0; k < 4; k++) {
        const w = weight[o + k]!;
        if (w < 0.0008) continue;
        const bi = index[o + k]!;
        _v.set(rx - this.rest[bi * 3]!, ry - this.rest[bi * 3 + 1]!, rz - this.rest[bi * 3 + 2]!);
        _v.applyQuaternion(this.wrot[bi]!);
        _v.add(this.wpos[bi]!);
        ox += _v.x * w;
        oy += _v.y * w;
        oz += _v.z * w;
      }
      positions[i3] = ox + delta[i3]!;
      positions[i3 + 1] = oy + delta[i3 + 1]!;
      positions[i3 + 2] = oz + delta[i3 + 2]!;
      if (this.closeAmtL > 0.002 || this.closeAmtR > 0.002) {
        let inf = 0;
        let signed = 0;
        let brow = 0;
        for (let k = 0; k < 4; k++) {
          const w = weight[o + k]!;
          if (w < 0.02) continue;
          const bi = index[o + k]!;
          if (/Brow/.test(this.names[bi]!)) brow += w;
          const kind = this.lidKind[bi]!;
          if (!kind) continue;
          inf += w;
          signed += kind * w;
        }
        const ey = rx >= 0
          ? (this.iEyeL >= 0 ? this.rest[this.iEyeL * 3 + 1]! : ry)
          : (this.iEyeR >= 0 ? this.rest[this.iEyeR * 3 + 1]! : ry);
        if (inf > 0.28 && brow < 0.1 && ry < ey + 0.011) {
          const close = rx >= 0 ? this.closeAmtL : this.closeAmtR;
          this.closeLidPos(rx, ry, rz, signed >= 0, close * Math.min(1, inf * 1.15), _from);
          const fi = this.iFace >= 0 ? this.iFace : this.iHead;
          if (fi >= 0) {
            _to.set(_from.x - this.rest[fi * 3]!, _from.y - this.rest[fi * 3 + 1]!, _from.z - this.rest[fi * 3 + 2]!);
            _to.applyQuaternion(this.wrot[fi]!);
            _to.add(this.wpos[fi]!);
            const u = THREE.MathUtils.clamp(inf * 1.2, 0, 1);
            positions[i3] += (_to.x - positions[i3]) * u;
            positions[i3 + 1] += (_to.y - positions[i3 + 1]) * u;
            positions[i3 + 2] += (_to.z - positions[i3 + 2]) * u;
          }
        }
      }
      const dy = ry - this.bustY;
      const chest =
        dy < 0.038
          ? smoother(Math.abs(dy + 0.016), 0.085) *
            smoother(Math.abs(Math.abs(rx) - 0.09), 0.055) *
            THREE.MathUtils.clamp((rz - 0.038) / 0.085, 0, 1)
          : 0;
      if (chest > 0.06) {
        const br = rx < 0 ? this.brL : this.brR;
        const w = chest * 0.92;
        const cx = Math.sign(rx || 1) * 0.09;
        const cy = this.bustY - 0.016;
        const cz = 0.082;
        const lx = rx - cx;
        const ly = ry - cy;
        const lz = rz - cz;
        const r = Math.hypot(lx, ly, lz) || 1;
        const plump = Math.abs(br.sy) * 0.22 + Math.abs(br.sx) * 0.1;
        positions[i3] += br.sx * 0.82 * w + (lx / r) * plump * w;
        positions[i3 + 1] += br.sy * 0.78 * w + (ly / r) * plump * 0.35 * w;
        positions[i3 + 2] += br.sz * 0.8 * w + (lz / r) * plump * w;
      }
    }
  }
}
