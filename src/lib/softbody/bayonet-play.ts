import * as THREE from "three";
import type { TubeAlong } from "@/lib/softbody/peristalsis";
import type { GutHealth } from "@/lib/softbody/gut-health";

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _side = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _axisY = new THREE.Vector3(0, 1, 0);
const _look = new THREE.Vector3();
const _down = new THREE.Vector3(0, -1, 0);
const _xA = new THREE.Vector3();
const _zA = new THREE.Vector3();
const _mat = new THREE.Matrix4();
const _ray = new THREE.Raycaster();
const _origin = new THREE.Vector3();
const _t = new THREE.Vector3();
const _b = new THREE.Vector3();

type WoundPatch = {
  mesh: THREE.Mesh;
  src: THREE.BufferAttribute;
  map: Int32Array;
  pos: THREE.BufferAttribute;
};

const SHORT_TOTAL = 0.248;
const LONG_TOTAL = 0.42;
const HOVER = 0.075;
const SQUEEZE_MAX = 0.013;
const BLADE_RAD = 0.016;
const HIT_EVERY = 0.2;
const MAX_CONE = THREE.MathUtils.degToRad(30);

export type BayonetKind = "short" | "long";

export class BayonetPlay {
  readonly root = new THREE.Group();
  readonly wounds = new THREE.Group();
  hasEntry = false;
  punctured = false;
  enabled = false;
  squeeze = 0;
  penetration = 0;
  rawPen = 0;
  punctureEvent = false;
  kind: BayonetKind = "short";
  bladeLen = SHORT_TOTAL * 0.6;
  totalLen = SHORT_TOTAL;
  maxPen = SHORT_TOTAL * 0.6;
  readonly entry = new THREE.Vector3();
  readonly entryNormal = new THREE.Vector3(0, 0, 1);
  readonly restAxis = new THREE.Vector3(0, 0, -1);
  readonly handle = new THREE.Vector3();
  readonly tip = new THREE.Vector3();
  readonly dir = new THREE.Vector3(0, 0, -1);
  readonly edgeWorld = new THREE.Vector3(0, -1, 0);
  private tubes: TubeAlong[] = [];
  private knife: THREE.Object3D | null = null;
  private knifeShort: THREE.Object3D | null = null;
  private knifeLong: THREE.Object3D | null = null;
  private shortStats = { totalLen: SHORT_TOTAL, bladeLen: SHORT_TOTAL * 0.6 };
  private longStats = { totalLen: LONG_TOTAL, bladeLen: LONG_TOTAL * 0.75 };
  private marker: THREE.Mesh | null = null;
  private woundTex: THREE.CanvasTexture | null = null;
  private patches: WoundPatch[] = [];
  private skinMeshes: THREE.Mesh[] = [];
  private xray = { y0: 0.92, y1: 1.18, xMax: 0.12, zFront: 0.1 };
  private skinHit: THREE.Mesh | null = null;
  private skinFace = -1;
  private xrayValue = 0;
  private backSpawned = false;
  private exitHit: {
    point: THREE.Vector3;
    normal: THREE.Vector3;
    mesh: THREE.Mesh;
    face: number;
    dist: number;
  } | null = null;
  private hitAcc = 0;
  private autoPhase: "idle" | "in" | "hold" | "out" = "idle";
  private holdT = 0;
  private pumpT = 0;
  autoReleased = false;

  attach(shortSrc: THREE.Object3D, tubes: TubeAlong[], longSrc?: THREE.Object3D) {
    this.root.clear();
    this.wounds.clear();
    this.patches = [];
    this.skinHit = null;
    this.skinFace = -1;
    this.tubes = tubes;
    const preparedShort = prepareBayonet(shortSrc, SHORT_TOTAL);
    this.knifeShort = preparedShort.root;
    this.shortStats = { totalLen: preparedShort.totalLen, bladeLen: preparedShort.bladeLen };
    this.root.add(preparedShort.root);
    if (longSrc) {
      const preparedLong = prepareBayonet(longSrc, LONG_TOTAL);
      this.knifeLong = preparedLong.root;
      this.longStats = { totalLen: preparedLong.totalLen, bladeLen: preparedLong.bladeLen };
      preparedLong.root.visible = false;
      this.root.add(preparedLong.root);
    } else {
      this.knifeLong = null;
    }
    this.knife = this.knifeShort;
    this.kind = "short";
    this.totalLen = this.shortStats.totalLen;
    this.bladeLen = this.shortStats.bladeLen;
    this.maxPen = this.bladeLen * 0.97;

    const markerGeo = new THREE.RingGeometry(0.012, 0.02, 28);
    const markerMat = new THREE.MeshBasicMaterial({
      color: "#c45a4a",
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: false,
    });
    this.marker = new THREE.Mesh(markerGeo, markerMat);
    this.marker.frustumCulled = false;
    this.marker.renderOrder = 14;
    this.marker.raycast = () => {};
    this.marker.visible = false;
    this.root.add(this.marker);

    this.root.visible = false;
    this.loadWoundAtlas();
    this.reset();
  }

  setSkin(meshes: THREE.Mesh[], xray: { y0: number; y1: number; xMax: number; zFront: number }) {
    this.skinMeshes = meshes;
    this.xray = xray;
  }

  setKind(kind: BayonetKind) {
    if (kind === this.kind && this.knife) return;
    if (kind === "long" && !this.knifeLong) kind = "short";
    this.kind = kind;
    const stats = kind === "long" ? this.longStats : this.shortStats;
    this.totalLen = stats.totalLen;
    this.bladeLen = stats.bladeLen;
    this.maxPen = this.bladeLen * 0.97;
    if (this.knifeShort) this.knifeShort.visible = kind === "short";
    if (this.knifeLong) this.knifeLong.visible = kind === "long";
    this.knife = kind === "long" ? this.knifeLong : this.knifeShort;
    if (this.hasEntry) {
      this.rawPen = THREE.MathUtils.clamp(this.rawPen, -HOVER, this.maxPen);
      this.handle.copy(this.entry).addScaledVector(this.dir, -(this.totalLen - this.rawPen));
      this.layout();
      this.updateContact();
    }
  }

  private loadWoundAtlas() {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height);
      const p = data.data;
      for (let i = 0; i < p.length; i += 4) {
        const m = Math.max(p[i]!, p[i + 1]!, p[i + 2]!);
        p[i + 3] = m < 10 ? 0 : m < 40 ? ((m - 10) / 30) * 255 : 255;
      }
      const tw = Math.floor(c.width / 2);
      const th = Math.floor(c.height / 2);
      const padX = Math.max(8, tw * 0.2);
      const padY = Math.max(8, th * 0.2);
      for (let ty = 0; ty < 2; ty++) {
        for (let tx = 0; tx < 2; tx++) {
          for (let y = 0; y < th; y++) {
            for (let x = 0; x < tw; x++) {
              const fx = Math.min(x, tw - 1 - x) / padX;
              const fy = Math.min(y, th - 1 - y) / padY;
              const ex = fx <= 0 ? 0 : fx >= 1 ? 1 : fx * fx * (3 - 2 * fx);
              const ey = fy <= 0 ? 0 : fy >= 1 ? 1 : fy * fy * (3 - 2 * fy);
              const nx = (x + 0.5) / tw - 0.5;
              const ny = (y + 0.5) / th - 0.5;
              const r = Math.hypot(nx, ny) * 2.05;
              const rad = r <= 0.32 ? 1 : r >= 0.78 ? 0 : 1 - (r - 0.32) / 0.46;
              const srad = rad * rad * (3 - 2 * rad);
              const i = ((ty * th + y) * c.width + (tx * tw + x)) * 4;
              p[i + 3] = p[i + 3]! * ex * ey * srad;
            }
          }
        }
      }
      ctx.putImageData(data, 0, 0);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.needsUpdate = true;
      this.woundTex = tex;
    };
    img.src = "/textures/wounds.png";
  }

  pick(point: THREE.Vector3, normal: THREE.Vector3, mesh?: THREE.Mesh, faceIndex?: number) {
    this.hasEntry = true;
    this.punctured = false;
    this.punctureEvent = false;
    this.squeeze = 0;
    this.penetration = 0;
    this.rawPen = -HOVER;
    this.hitAcc = 0;
    this.autoPhase = "idle";
    this.holdT = 0;
    this.pumpT = 0;
    this.autoReleased = false;
    this.entry.copy(point);
    this.entryNormal.copy(normal).normalize();
    if (this.entryNormal.lengthSq() < 1e-6) this.entryNormal.set(0, 0, 1);
    this.restAxis.copy(this.entryNormal).multiplyScalar(-1);
    this.dir.copy(this.restAxis);
    this.skinHit = mesh ?? null;
    this.skinFace = faceIndex ?? -1;
    this.backSpawned = false;
    this.exitHit = null;
    const dist = this.totalLen - this.rawPen;
    this.handle.copy(this.entry).addScaledVector(this.dir, -dist);
    this.layout();
    this.updateContact();
    this.root.visible = this.enabled;
  }

  beginAuto() {
    if (!this.hasEntry) return;
    this.autoPhase = "in";
    this.holdT = 0;
    this.autoReleased = false;
  }

  releaseEntry() {
    this.hasEntry = false;
    this.punctured = false;
    this.punctureEvent = false;
    this.squeeze = 0;
    this.penetration = 0;
    this.rawPen = -HOVER;
    this.hitAcc = 0;
    this.autoPhase = "idle";
    this.root.visible = false;
    if (this.marker) this.marker.visible = false;
  }

  get isAuto() {
    return this.autoPhase !== "idle";
  }

  dragTo(to: THREE.Vector3) {
    if (!this.enabled || !this.hasEntry) return;
    this.autoPhase = "idle";
    _v.copy(this.entry).sub(to);
    const len = _v.length();
    if (len < 1e-5) return;
    _v.normalize();
    clampDirToCone(_v, this.restAxis, MAX_CONE);
    this.dir.copy(_v);
    const intended = this.totalLen - len;
    if (!this.punctured && intended >= SQUEEZE_MAX * 0.92) {
      this.punctured = true;
      this.punctureEvent = true;
      this.spawnWound();
    }
    const maxPen = this.punctured ? this.maxPen : SQUEEZE_MAX;
    const minDist = Math.max(0.04, this.totalLen - maxPen);
    const maxDist = this.totalLen + HOVER + 0.08;
    const d = THREE.MathUtils.clamp(len, minDist, maxDist);
    this.handle.copy(this.entry).addScaledVector(this.dir, -d);
    this.layout();
    this.updateContact();
  }

  pen01() {
    return THREE.MathUtils.clamp((this.rawPen + HOVER) / (this.maxPen + HOVER), 0, 1);
  }

  setPen01(t: number) {
    if (!this.hasEntry) return;
    const u = THREE.MathUtils.clamp(t, 0, 1);
    this.rawPen = -HOVER + u * (this.maxPen + HOVER);
    this.handle.copy(this.entry).addScaledVector(this.dir, -(this.totalLen - this.rawPen));
    this.layout();
    this.updateContact();
  }

  setRawPen(pen: number) {
    this.setPen01((THREE.MathUtils.clamp(pen, -HOVER, this.maxPen) + HOVER) / (this.maxPen + HOVER));
  }

  adjustDepth(delta01: number) {
    this.setPen01(this.pen01() + delta01);
    return this.pen01();
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    this.root.visible = on && this.hasEntry;
    if (!on) {
      this.hitAcc = 0;
    }
  }

  reset() {
    this.releaseEntry();
    this.autoReleased = false;
    this.pumpT = 0;
    this.clearWounds();
  }

  private clearWounds() {
    this.patches = [];
    while (this.wounds.children.length) {
      const ch = this.wounds.children[0]!;
      this.wounds.remove(ch);
      const mesh = ch as THREE.Mesh;
      mesh.geometry?.dispose();
      const mat = mesh.material;
      if (mat && !Array.isArray(mat)) (mat as THREE.Material).dispose();
    }
  }

  consumeAutoReleased() {
    if (!this.autoReleased) return false;
    this.autoReleased = false;
    return true;
  }

  consumePunctureEvent() {
    if (!this.punctureEvent) return false;
    this.punctureEvent = false;
    return true;
  }

  squeezeTarget() {
    if (!this.enabled || !this.hasEntry || this.rawPen <= 0.0008) return null;
    const depth = this.punctured
      ? Math.min(0.018, 0.008 + this.penetration * 0.04)
      : Math.min(SQUEEZE_MAX, this.rawPen);
    _n.copy(this.entry).addScaledVector(this.dir, depth);
    return {
      gx: this.entry.x,
      gy: this.entry.y,
      gz: this.entry.z,
      tx: _n.x,
      ty: _n.y,
      tz: _n.z,
      radius: this.punctured ? 0.055 : 0.07,
    };
  }

  apply(dt: number, gut: number, health: GutHealth, opts?: { auto?: boolean; pump?: boolean; grabbing?: boolean }) {
    if (!this.enabled) return;
    const grabbing = opts?.grabbing ?? false;
    const pump = opts?.pump ?? false;
    if (this.hasEntry && !grabbing) {
      if (pump) {
        this.autoPhase = "idle";
        this.pumpT += dt * 2.35;
        const u = 0.5 - 0.5 * Math.cos(this.pumpT);
        this.setPen01(0.16 + 0.8 * u);
      } else if (this.autoPhase === "in") {
        const t = Math.min(1, this.pen01() + dt * 1.7);
        this.setPen01(t);
        if (t >= 0.94) {
          this.autoPhase = "hold";
          this.holdT = 0;
        }
      } else if (this.autoPhase === "hold") {
        this.holdT += dt;
        if (this.holdT > 0.16) this.autoPhase = "out";
      } else if (this.autoPhase === "out") {
        const t = Math.max(0, this.pen01() - dt * 1.5);
        this.setPen01(t);
        if (t <= 0.02) {
          this.releaseEntry();
          this.autoReleased = true;
        }
      }
    }
    if (!this.hasEntry) return;
    this.updateContact();
    this.layout();
    if (this.punctured && this.penetration > 0.012) {
      this.deformGuts(gut);
      this.hitAcc += dt;
      if (this.hitAcc >= HIT_EVERY) {
        this.hitAcc = 0;
        this.cutGuts(health);
      }
    }
  }

  private updateContact() {
    const dist = this.handle.distanceTo(this.entry);
    this.rawPen = this.totalLen - dist;
    this.squeeze = THREE.MathUtils.clamp(this.rawPen / SQUEEZE_MAX, 0, 1);
    if (!this.punctured && this.rawPen >= SQUEEZE_MAX * 0.92) {
      this.punctured = true;
      this.punctureEvent = true;
      this.spawnWound();
    }
    this.penetration = this.punctured ? Math.max(0, this.rawPen) : 0;
    if (this.kind === "long" && this.punctured && !this.backSpawned) {
      this.trySpawnExitWound();
    }
  }

  private layout() {
    this.tip.copy(this.handle).addScaledVector(this.dir, this.totalLen);
    if (this.knife) {
      this.knife.position.copy(this.handle);
      this.orientBladeDown();
    }
    if (this.marker) {
      this.marker.visible = this.hasEntry && !this.punctured;
      this.marker.position.copy(this.entry).addScaledVector(this.entryNormal, 0.002);
      _look.copy(this.entry).add(this.entryNormal);
      this.marker.lookAt(_look);
    }
    this.layoutWounds();
  }

  private orientBladeDown() {
    if (!this.knife) return;
    _xA.crossVectors(this.dir, _down);
    if (_xA.lengthSq() < 1e-8) _xA.set(1, 0, 0);
    else _xA.normalize();
    _zA.crossVectors(_xA, this.dir).normalize();
    if (_zA.y > 0) {
      _xA.negate();
      _zA.negate();
    }
    this.edgeWorld.copy(_zA);
    _mat.makeBasis(_xA, this.dir, _zA);
    this.knife.quaternion.setFromRotationMatrix(_mat);
  }

  private layoutWounds() {
    this.syncWounds(this.xrayValue);
  }

  syncWounds(xray: number) {
    this.xrayValue = xray;
    for (const patch of this.patches) {
      const src = patch.src.array as Float32Array;
      const dst = patch.pos.array as Float32Array;
      for (let i = 0; i < patch.map.length; i++) {
        const s = patch.map[i]! * 3;
        const d = i * 3;
        dst[d] = src[s]!;
        dst[d + 1] = src[s + 1]!;
        dst[d + 2] = src[s + 2]!;
      }
      patch.pos.needsUpdate = true;
      const shader = (patch.mesh.material as THREE.Material).userData.shader as
        | { uniforms?: { uXray?: { value: number } } }
        | undefined;
      if (shader?.uniforms?.uXray) shader.uniforms.uXray.value = xray;
    }
  }

  private spawnWound() {
    const long = this.kind === "long";
    this.spawnWoundAt(
      this.entry,
      this.entryNormal,
      this.skinHit,
      this.skinFace,
      long ? 0.038 : 0.05,
      long ? 0.054 : 0.082,
    );
  }

  private trySpawnExitWound() {
    if (!this.exitHit) this.exitHit = findSkinExit(this.skinMeshes, this.entry, this.entryNormal, this.dir);
    const hit = this.exitHit;
    if (!hit) return;
    if (this.rawPen < hit.dist - 0.005) return;
    this.backSpawned = true;
    this.spawnWoundAt(hit.point, hit.normal, hit.mesh, hit.face, 0.03, 0.042);
  }

  private spawnWoundAt(
    center: THREE.Vector3,
    normal: THREE.Vector3,
    mesh: THREE.Mesh | null,
    faceIndex: number,
    stampW: number,
    stampH: number,
  ) {
    const host = mesh ?? nearestSkin(this.skinMeshes, center);
    if (!host) return;
    const srcPos = host.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
    if (!srcPos || !(srcPos.array instanceof Float32Array)) return;
    const patch = buildSkinPatch(host, center, normal, this.dir, faceIndex, stampW, stampH);
    if (!patch) return;

    const tile = (Math.random() * 4) | 0;
    const col = tile & 1;
    const row = tile >> 1;
    const u0 = col * 0.5 + 0.02;
    const v0 = (1 - row) * 0.5 + 0.02;
    const uSpan = 0.46;
    const vSpan = 0.46;
    const twist = (Math.random() - 0.5) * 0.5;
    const cs = Math.cos(twist);
    const sn = Math.sin(twist);
    const uv = patch.geo.getAttribute("uv") as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) {
      const lx = uv.getX(i);
      const ly = uv.getY(i);
      uv.setXY(i, lx * cs - ly * sn + 0.5, lx * sn + ly * cs + 0.5);
    }
    uv.needsUpdate = true;

    const mat = new THREE.MeshBasicMaterial({
      map: this.woundTex,
      color: this.woundTex ? "#ffd4cc" : "#b42318",
      transparent: true,
      opacity: 1,
      depthWrite: false,
      depthTest: true,
      polygonOffset: true,
      polygonOffsetFactor: -8,
      polygonOffsetUnits: -8,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    const { y0, y1, xMax, zFront } = this.xray;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uXray = { value: this.xrayValue };
      shader.uniforms.uY0 = { value: y0 };
      shader.uniforms.uY1 = { value: y1 };
      shader.uniforms.uXMax = { value: xMax };
      shader.uniforms.uZFront = { value: zFront };
      shader.uniforms.uTile = { value: new THREE.Vector4(u0, v0, uSpan, vSpan) };
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vBodyW;")
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nvBodyW = (modelMatrix * vec4(transformed, 1.0)).xyz;",
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
uniform float uXray; uniform float uY0; uniform float uY1; uniform float uXMax; uniform float uZFront;
uniform vec4 uTile;
varying vec3 vBodyW;
float xrayHole() {
  float band = smoothstep(uY0, uY0 + 0.08, vBodyW.y) * (1.0 - smoothstep(uY1 - 0.04, uY1, vBodyW.y));
  float torso = 1.0 - smoothstep(uXMax * 0.65, uXMax + 0.1, abs(vBodyW.x));
  float front = smoothstep(uZFront - 0.16, uZFront + 0.04, vBodyW.z);
  return clamp(band * torso * front * uXray, 0.0, 1.0);
}`,
        )
        .replace(
          "#include <map_fragment>",
          `#ifdef USE_MAP
           if (vMapUv.x < 0.0 || vMapUv.x > 1.0 || vMapUv.y < 0.0 || vMapUv.y > 1.0) discard;
           vec4 sampledDiffuseColor = texture2D(map, uTile.xy + vMapUv * uTile.zw);
           float fx = smoothstep(0.0, 0.22, vMapUv.x) * smoothstep(0.0, 0.22, 1.0 - vMapUv.x);
           float fy = smoothstep(0.0, 0.22, vMapUv.y) * smoothstep(0.0, 0.22, 1.0 - vMapUv.y);
           float rad = 1.0 - smoothstep(0.28, 0.7, length(vMapUv - vec2(0.5)) * 1.95);
           sampledDiffuseColor.a *= fx * fy * rad;
           if (sampledDiffuseColor.a < 0.04) discard;
           diffuseColor *= sampledDiffuseColor;
           #endif`,
        )
        .replace(
          "#include <dithering_fragment>",
          `float hole = xrayHole();
           gl_FragColor.a *= mix(1.0, 0.06, pow(hole, 0.68));
           if (gl_FragColor.a < 0.04) discard;
           #include <dithering_fragment>`,
        );
      mat.userData.shader = shader;
    };
    mat.needsUpdate = true;

    const woundMesh = new THREE.Mesh(patch.geo, mat);
    woundMesh.frustumCulled = false;
    woundMesh.renderOrder = 8;
    woundMesh.raycast = () => {};
    this.wounds.add(woundMesh);
    this.patches.push({ mesh: woundMesh, src: srcPos, map: patch.map, pos: patch.pos });
    this.syncWounds(this.xrayValue);
  }

  private deformGuts(gut = 1) {
    const reach = this.penetration + 0.012;
    if (reach < 0.01) return;
    const ax = this.entry.x;
    const ay = this.entry.y;
    const az = this.entry.z;
    const dx = this.dir.x;
    const dy = this.dir.y;
    const dz = this.dir.z;
    const rad = BLADE_RAD * (0.7 + gut * 0.55);
    const mix = 0.88 * THREE.MathUtils.clamp(gut, 0.2, 2);
    for (const tube of this.tubes) {
      const { positions, count } = tube;
      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        const px = positions[i3]!;
        const py = positions[i3 + 1]!;
        const pz = positions[i3 + 2]!;
        const vx = px - ax;
        const vy = py - ay;
        const vz = pz - az;
        const s = THREE.MathUtils.clamp(vx * dx + vy * dy + vz * dz, -0.012, reach);
        const w = 1 - THREE.MathUtils.smoothstep(reach - 0.008, reach + 0.04, s);
        if (w < 0.02) continue;
        const cx = ax + dx * s;
        const cy = ay + dy * s;
        const cz = az + dz * s;
        let ox = px - cx;
        let oy = py - cy;
        let oz = pz - cz;
        const len = Math.hypot(ox, oy, oz);
        const want = rad + 0.006 * w;
        if (len > 1e-5) {
          if (len >= want) continue;
          const k = want / len;
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

  private cutGuts(health: GutHealth) {
    const n = 3;
    for (let i = 1; i <= n; i++) {
      const t = (this.penetration * i) / (n + 0.2);
      _v.copy(this.entry).addScaledVector(this.dir, t);
      health.hit(_v.x, _v.y, _v.z, 0.22 + this.penetration * 0.4, 0.22);
    }
  }
}

function findSkinExit(
  meshes: THREE.Mesh[],
  entry: THREE.Vector3,
  entryNormal: THREE.Vector3,
  dir: THREE.Vector3,
) {
  if (!meshes.length) return null;
  _origin.copy(entry).addScaledVector(entryNormal, 0.004);
  _ray.set(_origin, dir);
  _ray.near = 0.002;
  _ray.far = 0.55;
  const saved: { mat: THREE.Material; side: THREE.Side }[] = [];
  for (const mesh of meshes) {
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      if (!mat) continue;
      saved.push({ mat, side: mat.side });
      mat.side = THREE.DoubleSide;
    }
  }
  const hits = _ray.intersectObjects(meshes, false);
  for (const s of saved) s.mat.side = s.side;
  if (hits.length < 2) return null;
  const last = hits[hits.length - 1]!;
  if (last.distance < 0.07 || !last.face) return null;
  const n = last.face.normal.clone().transformDirection(last.object.matrixWorld).normalize();
  if (n.dot(dir) < 0) n.negate();
  return {
    point: last.point.clone(),
    normal: n,
    mesh: last.object as THREE.Mesh,
    face: last.faceIndex ?? -1,
    dist: last.distance,
  };
}

function nearestSkin(meshes: THREE.Mesh[], point: THREE.Vector3) {
  let best: THREE.Mesh | null = null;
  let bestD = 1e9;
  for (const mesh of meshes) {
    const pos = mesh.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
    if (!pos) continue;
    const arr = pos.array as Float32Array;
    const step = Math.max(1, Math.floor(pos.count / 4000));
    for (let i = 0; i < pos.count; i += step) {
      const dx = arr[i * 3]! - point.x;
      const dy = arr[i * 3 + 1]! - point.y;
      const dz = arr[i * 3 + 2]! - point.z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = mesh;
      }
    }
  }
  return best;
}

function buildSkinPatch(
  mesh: THREE.Mesh,
  center: THREE.Vector3,
  normal: THREE.Vector3,
  dir: THREE.Vector3,
  faceIndex: number,
  stampW: number,
  stampH: number,
) {
  const geo = mesh.geometry as THREE.BufferGeometry;
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const arr = pos.array as Float32Array;
  const index = geo.getIndex();
  const triCount = index ? index.count / 3 : Math.floor(pos.count / 3);
  const rad = Math.max(stampW, stampH) * 0.92 + 0.01;
  const r2 = rad * rad;
  const faces: number[] = [];
  const vertAt = (f: number, k: number) => {
    if (index) return index.getX(f * 3 + k);
    return f * 3 + k;
  };
  const near = (vi: number) => {
    const d0 = arr[vi * 3]! - center.x;
    const d1 = arr[vi * 3 + 1]! - center.y;
    const d2 = arr[vi * 3 + 2]! - center.z;
    return d0 * d0 + d1 * d1 + d2 * d2 <= r2;
  };
  if (faceIndex >= 0 && faceIndex < triCount) faces.push(faceIndex);
  for (let f = 0; f < triCount; f++) {
    if (f === faceIndex) continue;
    if (near(vertAt(f, 0)) || near(vertAt(f, 1)) || near(vertAt(f, 2))) faces.push(f);
  }
  if (faces.length < 1) return null;

  const remap = new Map<number, number>();
  const map: number[] = [];
  const positions: number[] = [];
  const uvs: number[] = [];
  _t.crossVectors(normal, dir);
  if (_t.lengthSq() < 1e-8) _t.crossVectors(normal, _down);
  if (_t.lengthSq() < 1e-8) _t.set(1, 0, 0);
  _t.normalize();
  _b.crossVectors(normal, _t).normalize();
  const take = (vi: number) => {
    let id = remap.get(vi);
    if (id !== undefined) return id;
    id = map.length;
    remap.set(vi, id);
    map.push(vi);
    const x = arr[vi * 3]!;
    const y = arr[vi * 3 + 1]!;
    const z = arr[vi * 3 + 2]!;
    positions.push(x, y, z);
    const dx = x - center.x;
    const dy = y - center.y;
    const dz = z - center.z;
    uvs.push((dx * _t.x + dy * _t.y + dz * _t.z) / stampW, (dx * _b.x + dy * _b.y + dz * _b.z) / stampH);
    return id;
  };
  const idx: number[] = [];
  for (const f of faces) {
    idx.push(take(vertAt(f, 0)), take(vertAt(f, 1)), take(vertAt(f, 2)));
  }
  const out = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(new Float32Array(positions), 3);
  posAttr.setUsage(THREE.DynamicDrawUsage);
  out.setAttribute("position", posAttr);
  out.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(uvs), 2));
  out.setIndex(idx);
  out.computeVertexNormals();
  return { geo: out, map: new Int32Array(map), pos: posAttr };
}

function clampDirToCone(dir: THREE.Vector3, axis: THREE.Vector3, maxAng: number) {
  _side.copy(axis).normalize();
  dir.normalize();
  const dot = THREE.MathUtils.clamp(_side.dot(dir), -1, 1);
  const ang = Math.acos(dot);
  if (ang <= maxAng || ang < 1e-6) return dir;
  _n.copy(_side).cross(dir);
  if (_n.lengthSq() < 1e-10) {
    dir.copy(_side);
    return dir;
  }
  _n.normalize();
  _q.setFromAxisAngle(_n, maxAng);
  dir.copy(_side).applyQuaternion(_q);
  return dir;
}

function prepareBayonet(src: THREE.Object3D, totalLen: number) {
  const holder = new THREE.Group();
  const clone = src.clone(true);
  clone.updateMatrixWorld(true);
  let srcMesh: THREE.Mesh | null = null;
  clone.traverse((obj) => {
    const m = obj as THREE.Mesh;
    if (m.isMesh && m.geometry && !srcMesh) srcMesh = m;
  });
  if (!srcMesh) {
    return { root: holder, totalLen, bladeLen: totalLen * 0.62 };
  }
  const srcM = srcMesh as THREE.Mesh;
  srcM.updateWorldMatrix(true, false);
  const geo = srcM.geometry.clone();
  geo.applyMatrix4(srcM.matrixWorld);
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const arr = pos.array as Float32Array;
  const count = pos.count;

  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (let i = 0; i < count; i++) {
    const x = arr[i * 3]!;
    const y = arr[i * 3 + 1]!;
    const z = arr[i * 3 + 2]!;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  const sx = maxX - minX;
  const sy = maxY - minY;
  const sz = maxZ - minZ;
  const axis = sy >= sx && sy >= sz ? 1 : sz >= sx ? 2 : 0;
  const minA = axis === 0 ? minX : axis === 1 ? minY : minZ;
  const maxA = axis === 0 ? maxX : axis === 1 ? maxY : maxZ;
  const span = Math.max(1e-4, maxA - minA);

  const dens = (end: "lo" | "hi") => {
    const lo = end === "lo" ? minA : maxA - span * 0.18;
    const hi = end === "lo" ? minA + span * 0.18 : maxA;
    let n = 0;
    for (let i = 0; i < count; i++) {
      const a = axis === 0 ? arr[i * 3]! : axis === 1 ? arr[i * 3 + 1]! : arr[i * 3 + 2]!;
      if (a >= lo && a <= hi) n++;
    }
    return n;
  };
  const tipAtMax = dens("hi") < dens("lo");
  const tipA = tipAtMax ? maxA : minA;
  const hdlA = tipAtMax ? minA : maxA;
  const mid = (t: number) => {
    let x = 0,
      y = 0,
      z = 0,
      n = 0;
    const lo = t - span * 0.06;
    const hi = t + span * 0.06;
    for (let i = 0; i < count; i++) {
      const px = arr[i * 3]!;
      const py = arr[i * 3 + 1]!;
      const pz = arr[i * 3 + 2]!;
      const a = axis === 0 ? px : axis === 1 ? py : pz;
      if (a < lo || a > hi) continue;
      x += px;
      y += py;
      z += pz;
      n++;
    }
    if (n < 1) {
      if (axis === 0) return new THREE.Vector3(t, (minY + maxY) * 0.5, (minZ + maxZ) * 0.5);
      if (axis === 1) return new THREE.Vector3((minX + maxX) * 0.5, t, (minZ + maxZ) * 0.5);
      return new THREE.Vector3((minX + maxX) * 0.5, (minY + maxY) * 0.5, t);
    }
    return new THREE.Vector3(x / n, y / n, z / n);
  };
  const tip = mid(tipA);
  const hdl = mid(hdlA);
  _v.copy(tip).sub(hdl);
  if (_v.lengthSq() < 1e-10) _v.set(0, 1, 0);
  _q.setFromUnitVectors(_v.normalize(), _axisY);
  const rawLen = tip.distanceTo(hdl) || span;
  const scl = totalLen / rawLen;
  for (let i = 0; i < count; i++) {
    _v.set(arr[i * 3]! - hdl.x, arr[i * 3 + 1]! - hdl.y, arr[i * 3 + 2]! - hdl.z);
    _v.applyQuaternion(_q).multiplyScalar(scl);
    arr[i * 3] = _v.x;
    arr[i * 3 + 1] = _v.y;
    arr[i * 3 + 2] = _v.z;
  }
  const nrm = geo.getAttribute("normal") as THREE.BufferAttribute | undefined;
  if (nrm) {
    const na = nrm.array as Float32Array;
    for (let i = 0; i < nrm.count; i++) {
      _v.set(na[i * 3]!, na[i * 3 + 1]!, na[i * 3 + 2]!).applyQuaternion(_q);
      _v.normalize();
      na[i * 3] = _v.x;
      na[i * 3 + 1] = _v.y;
      na[i * 3 + 2] = _v.z;
    }
    nrm.needsUpdate = true;
  } else {
    geo.computeVertexNormals();
  }
  const nrmNow = geo.getAttribute("normal") as THREE.BufferAttribute | undefined;
  rollEdgeToZ(arr, count, nrmNow ? (nrmNow.array as Float32Array) : undefined, totalLen);
  if (nrmNow) nrmNow.needsUpdate = true;
  pos.needsUpdate = true;
  geo.computeBoundingBox();
  geo.computeBoundingSphere();

  const matSrc = srcM.material;
  const mat = Array.isArray(matSrc) ? matSrc.map((m) => m.clone()) : matSrc.clone();
  const mats = Array.isArray(mat) ? mat : [mat];
  for (const m of mats) {
    const std = m as THREE.MeshStandardMaterial;
    if ("metalness" in std) {
      std.metalness = Math.max(std.metalness ?? 0.4, 0.35);
      std.roughness = Math.min(std.roughness ?? 0.4, 0.45);
      std.envMapIntensity = 0.85;
      std.side = THREE.DoubleSide;
    }
  }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 8;
  mesh.name = "bayonet";
  holder.add(mesh);
  return { root: holder, totalLen, bladeLen: detectBladeLen(arr, count, totalLen) };
}

function rollEdgeToZ(arr: Float32Array, count: number, nrm: Float32Array | undefined, totalLen: number) {
  const y0 = totalLen * 0.58;
  const y1 = totalLen * 0.92;
  let mx = 0;
  let mz = 0;
  let n = 0;
  for (let i = 0; i < count; i++) {
    const y = arr[i * 3 + 1]!;
    if (y < y0 || y > y1) continue;
    mx += arr[i * 3]!;
    mz += arr[i * 3 + 2]!;
    n++;
  }
  if (n < 12) return;
  mx /= n;
  mz /= n;
  let cxx = 0;
  let czz = 0;
  let cxz = 0;
  for (let i = 0; i < count; i++) {
    const y = arr[i * 3 + 1]!;
    if (y < y0 || y > y1) continue;
    const dx = arr[i * 3]! - mx;
    const dz = arr[i * 3 + 2]! - mz;
    cxx += dx * dx;
    czz += dz * dz;
    cxz += dx * dz;
  }
  const ang = 0.5 * Math.atan2(2 * cxz, cxx - czz);
  applyYaw(arr, count, nrm, Math.PI / 2 - ang);
  let maxXPos = 0;
  let maxXNeg = 0;
  for (let i = 0; i < count; i++) {
    const y = arr[i * 3 + 1]!;
    if (y < y0 || y > y1) continue;
    const ax = Math.abs(arr[i * 3]! - mx);
    if (arr[i * 3 + 2]! >= mz) maxXPos = Math.max(maxXPos, ax);
    else maxXNeg = Math.max(maxXNeg, ax);
  }
  if (maxXPos > maxXNeg + 1e-5) applyYaw(arr, count, nrm, Math.PI);
}

function applyYaw(arr: Float32Array, count: number, nrm: Float32Array | undefined, rot: number) {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  for (let i = 0; i < count; i++) {
    const x = arr[i * 3]!;
    const z = arr[i * 3 + 2]!;
    arr[i * 3] = c * x - s * z;
    arr[i * 3 + 2] = s * x + c * z;
  }
  if (!nrm) return;
  for (let i = 0; i < nrm.length / 3; i++) {
    const x = nrm[i * 3]!;
    const z = nrm[i * 3 + 2]!;
    nrm[i * 3] = c * x - s * z;
    nrm[i * 3 + 2] = s * x + c * z;
  }
}

function detectBladeLen(arr: Float32Array, count: number, totalLen: number) {
  const bins = 40;
  const ext = new Float32Array(bins);
  const ns = new Int32Array(bins);
  for (let i = 0; i < count; i++) {
    const y = arr[i * 3 + 1]!;
    const b = Math.min(bins - 1, Math.max(0, Math.floor((y / Math.max(1e-4, totalLen)) * bins)));
    const r = Math.hypot(arr[i * 3]!, arr[i * 3 + 2]!);
    if (r > ext[b]!) ext[b] = r;
    ns[b]!++;
  }
  const samples: number[] = [];
  for (let i = bins - 1; i >= Math.floor(bins * 0.55); i--) {
    if (ns[i]! > 3) samples.push(ext[i]!);
  }
  samples.sort((a, b) => a - b);
  const bladeExt = samples.length ? samples[samples.length >> 1]! : 0.012;
  let guardBin = Math.floor(bins * 0.38);
  for (let i = bins - 2; i >= 2; i--) {
    if (ns[i]! < 3) continue;
    if (ext[i]! > bladeExt * 1.7 && ext[i]! > bladeExt + 0.005) {
      guardBin = i;
      break;
    }
  }
  const guardY = ((guardBin + 0.2) / bins) * totalLen;
  const bladeLen = totalLen - guardY;
  return THREE.MathUtils.clamp(bladeLen, totalLen * 0.48, totalLen * 0.84);
}

