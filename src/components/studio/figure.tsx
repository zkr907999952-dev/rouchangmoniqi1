import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { SkeletonUtils } from "three-stdlib";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { SoftSkeleton, type SkinBinding } from "@/lib/softbody/soft-skeleton";
import { meshMatKey, nudeBones, nudeMapFor } from "@/lib/softbody/nude-rig";
import { GutPeristalsis } from "@/lib/softbody/peristalsis";
import { BellyStrike } from "@/lib/softbody/belly-strike";
import { GutHealth } from "@/lib/softbody/gut-health";
import { FistPlay } from "@/lib/softbody/fist-play";
import { BayonetPlay } from "@/lib/softbody/bayonet-play";
import { applyNavelMorph, buildNavelMorph } from "@/lib/softbody/navel-morph";
import { useStudio } from "@/lib/studio-store";

const _hit = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _target = new THREE.Vector3();
const _camDir = new THREE.Vector3();
const _n = new THREE.Vector3();
const _plane = new THREE.Plane();
const _ray = new THREE.Ray();
const _ndc = new THREE.Vector2();
const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _center = new THREE.Vector3();
const _local = new THREE.Vector3();

const TORSO_RE = /skin|dress|body|torso|outfit|cloth|top|bottom|nude|mesh/i;
const SKIP_BIND_RE = /charm|wing/i;

type FigureProps = {
  controlsRef: RefObject<OrbitControlsImpl | null>;
  character: THREE.Object3D;
  intestines: THREE.Object3D;
  pelvis: THREE.Object3D;
  arm: THREE.Object3D;
  bayonet: THREE.Object3D;
  bayonetLong: THREE.Object3D;
};

function meshKey(mesh: THREE.Object3D) {
  const mat = (mesh as THREE.Mesh).material;
  const matName = mat && !Array.isArray(mat) ? (mat as THREE.Material).name : "";
  return `${mesh.name} ${mesh.parent?.name ?? ""} ${matName}`.toLowerCase();
}

function isTorsoMesh(mesh: THREE.Object3D) {
  const k = meshKey(mesh);
  if (/hair|eye|mouth|charm|wing|lash|\.001/.test(k) && !/skin|dress|body/.test(k)) return false;
  return TORSO_RE.test(k);
}

function bindHint(mesh: THREE.Object3D) {
  const k = meshKey(mesh);
  if (/hair|\.001/.test(k) && !/skin|dress|head|eye|mouth/.test(k)) return "hair";
  if (/eye/.test(k)) return "eye";
  if (/mouth/.test(k)) return "mouth";
  if (/head/.test(k)) return "face";
  if (/skin/.test(k)) return "legs";
  if (/dress/.test(k)) return "dress";
  if (/gut|intestin/.test(k)) return "organs";
  if (/pelvis|uterus|ovary/.test(k)) return "organs";
  return "body";
}

function shouldBind(mesh: THREE.Object3D) {
  if (mesh.userData.xrayOverlay) return false;
  const k = meshKey(mesh);
  if (SKIP_BIND_RE.test(k)) return false;
  const m = mesh as THREE.Mesh;
  const n = (m.geometry?.getAttribute("position") as THREE.BufferAttribute | undefined)?.count ?? 0;
  return n >= 12;
}

function findCrotch(body: THREE.Object3D, height: number) {
  const y0 = height * 0.49;
  const y1 = height * 0.545;
  const best = new THREE.Vector3(0, height * 0.515, 0.05);
  let bestScore = -Infinity;
  body.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    if (!isTorsoMesh(mesh) && !/skin|dress/.test(meshKey(mesh))) return;
    const pos = mesh.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
    if (!pos) return;
    const step = Math.max(1, Math.floor(pos.count / 9000));
    for (let i = 0; i < pos.count; i += step) {
      _local.fromBufferAttribute(pos, i);
      mesh.localToWorld(_local);
      if (_local.y < y0 || _local.y > y1) continue;
      if (Math.abs(_local.x) > 0.03) continue;
      const score = _local.z * 6 - Math.abs(_local.x) * 10 - (_local.y - y0) * 1.8;
      if (score > bestScore) {
        bestScore = score;
        best.copy(_local);
      }
    }
  });
  return best;
}

function findAnus(body: THREE.Object3D, height: number, crotch: THREE.Vector3) {
  const yTarget = crotch.y - 0.01;
  const y0 = yTarget - 0.03;
  const y1 = yTarget + 0.022;
  let zMin = crotch.z;
  body.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    if (!isTorsoMesh(mesh) && !/skin|dress/.test(meshKey(mesh))) return;
    const pos = mesh.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
    if (!pos) return;
    const step = Math.max(1, Math.floor(pos.count / 9000));
    for (let i = 0; i < pos.count; i += step) {
      _local.fromBufferAttribute(pos, i);
      mesh.localToWorld(_local);
      if (_local.y < y0 || _local.y > y1) continue;
      if (Math.abs(_local.x) > 0.018) continue;
      if (_local.z < zMin) zMin = _local.z;
    }
  });
  const zTarget = zMin + 0.042;
  const best = new THREE.Vector3(0, yTarget, zTarget);
  let bestScore = -Infinity;
  body.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    if (!isTorsoMesh(mesh) && !/skin|dress/.test(meshKey(mesh))) return;
    const pos = mesh.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
    if (!pos) return;
    const step = Math.max(1, Math.floor(pos.count / 9000));
    for (let i = 0; i < pos.count; i += step) {
      _local.fromBufferAttribute(pos, i);
      mesh.localToWorld(_local);
      if (_local.y < y0 || _local.y > y1) continue;
      if (Math.abs(_local.x) > 0.02) continue;
      if (_local.z > crotch.z - 0.012) continue;
      const score =
        -Math.abs(_local.z - zTarget) * 12 - Math.abs(_local.x) * 18 - Math.abs(_local.y - yTarget) * 5;
      if (score > bestScore) {
        bestScore = score;
        best.copy(_local);
      }
    }
  });
  best.x = 0;
  best.z += 0.012;
  void height;
  return best;
}

function liftGutsOffUterus(gut: THREE.Object3D, uterusBox: THREE.Box3) {
  const ucx = (uterusBox.min.x + uterusBox.max.x) * 0.5;
  const ucy = (uterusBox.min.y + uterusBox.max.y) * 0.5;
  const ucz = (uterusBox.min.z + uterusBox.max.z) * 0.5;
  const hx = Math.max(0.02, (uterusBox.max.x - uterusBox.min.x) * 0.5 + 0.012);
  const hy = Math.max(0.02, (uterusBox.max.y - uterusBox.min.y) * 0.5 + 0.01);
  const hz = Math.max(0.02, (uterusBox.max.z - uterusBox.min.z) * 0.5 + 0.01);
  const ySurf = uterusBox.max.y + 0.006;
  gut.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const pos = mesh.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
    if (!pos || !(pos.array instanceof Float32Array)) return;
    const arr = pos.array;
    for (let i = 0; i < pos.count; i++) {
      const i3 = i * 3;
      const nx = (arr[i3]! - ucx) / hx;
      const ny = (arr[i3 + 1]! - ucy) / hy;
      const nz = (arr[i3 + 2]! - ucz) / hz;
      const d2 = nx * nx + ny * ny + nz * nz;
      if (d2 >= 1) continue;
      const d = Math.sqrt(Math.max(d2, 1e-6));
      const s = 1.08 / d;
      arr[i3] = ucx + nx * hx * s;
      arr[i3 + 1] = Math.max(ucy + ny * hy * s, ySurf);
      arr[i3 + 2] = ucz + nz * hz * s;
    }
    pos.needsUpdate = true;
    mesh.geometry.computeBoundingBox();
  });
}

function findNavel(body: THREE.Object3D, height: number) {
  const y0 = height * 0.568;
  const y1 = height * 0.642;
  const pts: THREE.Vector3[] = [];
  let maxZ = -Infinity;
  body.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    if (!isTorsoMesh(mesh)) return;
    const pos = mesh.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
    if (!pos) return;
    for (let i = 0; i < pos.count; i++) {
      _local.fromBufferAttribute(pos, i);
      mesh.localToWorld(_local);
      if (_local.y < y0 || _local.y > y1) continue;
      if (Math.abs(_local.x) > 0.045) continue;
      if (_local.z < 0.04) continue;
      pts.push(_local.clone());
      if (Math.abs(_local.x) < 0.03 && _local.z > maxZ) maxZ = _local.z;
    }
  });
  const fallback = new THREE.Vector3(0, height * 0.6, Math.max(0.08, maxZ));
  if (pts.length < 12 || maxZ < 0.05) return fallback;

  const wall = maxZ - 0.02;
  const cell = 0.008;
  const grid = new Map<string, THREE.Vector3[]>();
  const key = (x: number, y: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
  for (const p of pts) {
    if (p.z < wall) continue;
    const k = key(p.x, p.y);
    const b = grid.get(k);
    if (b) b.push(p);
    else grid.set(k, [p]);
  }
  let best = fallback;
  let bestScore = -Infinity;
  for (const p of pts) {
    if (p.z < wall) continue;
    if (Math.abs(p.x) > 0.016) continue;
    const i0 = Math.floor((p.x - 0.016) / cell);
    const i1 = Math.floor((p.x + 0.016) / cell);
    const j0 = Math.floor((p.y - 0.016) / cell);
    const j1 = Math.floor((p.y + 0.016) / cell);
    let sumZ = 0;
    let n = 0;
    for (let ix = i0; ix <= i1; ix++) {
      for (let iy = j0; iy <= j1; iy++) {
        const bucket = grid.get(`${ix},${iy}`);
        if (!bucket) continue;
        for (const q of bucket) {
          const d2 = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
          if (d2 < 2.6e-4 && d2 > 3e-7) {
            sumZ += q.z;
            n++;
          }
        }
      }
    }
    if (n < 8) continue;
    const inset = sumZ / n - p.z;
    if (inset < 0.0004 || inset > 0.018) continue;
    const score = inset * 22 - Math.abs(p.x) * 10 + (p.z - wall) * 2;
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  if (bestScore < -1) {
    let minZ = Infinity;
    for (const p of pts) {
      if (Math.abs(p.x) > 0.01 || p.z < wall) continue;
      if (p.z < minZ) {
        minZ = p.z;
        best = p;
      }
    }
  }
  return best.clone();
}

function collectSample(root: THREE.Object3D, test: (m: THREE.Mesh) => boolean, cap = 8000) {
  const pts: THREE.Vector3[] = [];
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    if (!test(mesh)) return;
    const pos = mesh.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
    if (!pos) return;
    const step = Math.max(1, Math.floor(pos.count / cap));
    for (let i = 0; i < pos.count; i += step) {
      const v = new THREE.Vector3().fromBufferAttribute(pos, i);
      mesh.localToWorld(v);
      pts.push(v);
    }
  });
  return pts;
}

function pickBest(pts: THREE.Vector3[], pred: (p: THREE.Vector3) => boolean, score: (p: THREE.Vector3) => number, fallback: THREE.Vector3) {
  let best = fallback.clone();
  let bestS = -Infinity;
  for (const p of pts) {
    if (!pred(p)) continue;
    const s = score(p);
    if (s > bestS) {
      bestS = s;
      best.copy(p);
    }
  }
  return best;
}

function sampleLandmarks(body: THREE.Object3D, navel: THREE.Vector3, height: number) {
  const lm: Record<string, THREE.Vector3> = { navel: navel.clone() };
  const dress = collectSample(body, (m) => /dress/.test(meshKey(m)));
  const skin = collectSample(body, (m) => /skin/.test(meshKey(m)));
  const headM = collectSample(body, (m) => /head/.test(meshKey(m)) && !/hair/.test(meshKey(m)));
  const hair = collectSample(body, (m) => bindHint(m) === "hair");
  const eyes = collectSample(body, (m) => /eye/.test(meshKey(m)));
  const mouth = collectSample(body, (m) => /mouth/.test(meshKey(m)));
  const ny = navel.y;

  const avg = (pts: THREE.Vector3[], pred: (p: THREE.Vector3) => boolean, fb: THREE.Vector3) => {
    let x = 0;
    let y = 0;
    let z = 0;
    let n = 0;
    for (const p of pts) {
      if (!pred(p)) continue;
      x += p.x;
      y += p.y;
      z += p.z;
      n++;
    }
    return n ? new THREE.Vector3(x / n, y / n, z / n) : fb;
  };

  lm.head = avg(headM, () => true, new THREE.Vector3(0, height * 0.93, 0.03));
  lm.jaw = avg(mouth, () => true, new THREE.Vector3(0, lm.head.y - 0.04, 0.06));
  lm.eyeL = avg(eyes, (p) => p.x < 0, new THREE.Vector3(-0.03, lm.head.y + 0.005, 0.07));
  lm.eyeR = avg(eyes, (p) => p.x >= 0, new THREE.Vector3(0.03, lm.head.y + 0.005, 0.07));
  lm.neck = avg(headM, (p) => p.y < lm.head.y - 0.04, new THREE.Vector3(0, ny + 0.4, 0.02));
  lm.hips = avg(skin, (p) => p.y > ny - 0.18 && p.y < ny - 0.06 && Math.abs(p.x) < 0.12, new THREE.Vector3(0, ny - 0.12, 0.01));
  lm.spine1 = new THREE.Vector3(0, ny - 0.01, 0.02);
  lm.spine2 = new THREE.Vector3(0, ny + 0.1, 0.02);
  lm.spine3 = avg(dress, (p) => p.y > ny + 0.22 && p.y < ny + 0.32 && Math.abs(p.x) < 0.08, new THREE.Vector3(0, ny + 0.27, 0.02));
  lm.lBreast = pickBest(dress, (p) => p.x < -0.03 && p.x > -0.14 && p.y > ny + 0.22 && p.y < ny + 0.36 && p.z > 0.03, (p) => p.z, new THREE.Vector3(-0.07, ny + 0.28, 0.09));
  lm.rBreast = pickBest(dress, (p) => p.x > 0.03 && p.x < 0.14 && p.y > ny + 0.22 && p.y < ny + 0.36 && p.z > 0.03, (p) => p.z, new THREE.Vector3(0.07, ny + 0.28, 0.09));
  lm.lClav = pickBest(dress, (p) => p.x < -0.04 && p.x > -0.12 && p.y > ny + 0.35 && p.y < ny + 0.44, (p) => -Math.abs(p.z), new THREE.Vector3(-0.07, ny + 0.39, 0.01));
  lm.rClav = pickBest(dress, (p) => p.x > 0.04 && p.x < 0.12 && p.y > ny + 0.35 && p.y < ny + 0.44, (p) => -Math.abs(p.z), new THREE.Vector3(0.07, ny + 0.39, 0.01));
  lm.lUpper = pickBest(dress, (p) => p.x < -0.12 && p.y > ny + 0.3 && p.y < ny + 0.42, (p) => -p.x, new THREE.Vector3(-0.16, ny + 0.36, 0.01));
  lm.rUpper = pickBest(dress, (p) => p.x > 0.12 && p.y > ny + 0.3 && p.y < ny + 0.42, (p) => p.x, new THREE.Vector3(0.16, ny + 0.36, 0.01));
  lm.lFore = pickBest(dress, (p) => p.x < -0.18 && p.y > ny - 0.05 && p.y < ny + 0.18, (p) => -p.x - Math.abs(p.y - (ny + 0.06)), new THREE.Vector3(-0.3, ny + 0.06, 0.02));
  lm.rFore = pickBest(dress, (p) => p.x > 0.18 && p.y > ny - 0.05 && p.y < ny + 0.18, (p) => p.x - Math.abs(p.y - (ny + 0.06)), new THREE.Vector3(0.3, ny + 0.06, 0.02));
  lm.lHand = pickBest(dress, (p) => p.x < -0.25 && p.y < ny - 0.05, (p) => -p.y - p.x * 0.3, new THREE.Vector3(-0.42, ny - 0.18, 0.03));
  lm.rHand = pickBest(dress, (p) => p.x > 0.25 && p.y < ny - 0.05, (p) => -p.y + p.x * 0.3, new THREE.Vector3(0.42, ny - 0.18, 0.03));
  lm.lThigh = avg(skin, (p) => p.x < -0.04 && p.y > ny - 0.28 && p.y < ny - 0.12, new THREE.Vector3(-0.09, ny - 0.2, 0.01));
  lm.rThigh = avg(skin, (p) => p.x > 0.04 && p.y > ny - 0.28 && p.y < ny - 0.12, new THREE.Vector3(0.09, ny - 0.2, 0.01));
  lm.lShin = avg(skin, (p) => p.x < -0.04 && p.y > 0.42 && p.y < 0.55, new THREE.Vector3(-0.09, 0.48, 0.02));
  lm.rShin = avg(skin, (p) => p.x > 0.04 && p.y > 0.42 && p.y < 0.55, new THREE.Vector3(0.09, 0.48, 0.02));
  lm.lAnkle = avg(skin, (p) => p.x < -0.04 && p.y > 0.07 && p.y < 0.16, new THREE.Vector3(-0.09, 0.1, 0.03));
  lm.rAnkle = avg(skin, (p) => p.x > 0.04 && p.y > 0.07 && p.y < 0.16, new THREE.Vector3(0.09, 0.1, 0.03));
  lm.lFoot = avg(skin, (p) => p.x < -0.04 && p.y < 0.07, new THREE.Vector3(-0.09, 0.035, 0.05));
  lm.rFoot = avg(skin, (p) => p.x > 0.04 && p.y < 0.07, new THREE.Vector3(0.09, 0.035, 0.05));
  lm.lToe = pickBest(skin, (p) => p.x < -0.03 && p.y < 0.06, (p) => p.z, new THREE.Vector3(-0.09, 0.025, 0.12));
  lm.rToe = pickBest(skin, (p) => p.x > 0.03 && p.y < 0.06, (p) => p.z, new THREE.Vector3(0.09, 0.025, 0.12));

  const hairTop = pickBest(hair, () => true, (p) => p.y, new THREE.Vector3(0, lm.head.y + 0.04, -0.02));
  const hairBot = pickBest(hair, () => true, (p) => -p.y, new THREE.Vector3(0, lm.head.y - 0.7, -0.02));
  lm.hair1 = hairTop;
  lm.hair5 = hairBot;
  lm.hair2 = new THREE.Vector3(0, hairTop.y * 0.75 + hairBot.y * 0.25, hairTop.z * 0.7 + hairBot.z * 0.3);
  lm.hair3 = new THREE.Vector3(0, hairTop.y * 0.5 + hairBot.y * 0.5, hairTop.z * 0.45 + hairBot.z * 0.55);
  lm.hair4 = new THREE.Vector3(0, hairTop.y * 0.25 + hairBot.y * 0.75, hairTop.z * 0.25 + hairBot.z * 0.75);
  return lm;
}

function stripPelvicVulva(root: THREE.Object3D) {
  const kill: THREE.Object3D[] = [];
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (/vulve|clitoris|corpsetracines|materialcorps|materialbulbes/.test(meshKey(mesh))) {
      kill.push(mesh);
    }
  });
  for (const m of kill) {
    const mesh = m as THREE.Mesh;
    mesh.removeFromParent();
    mesh.geometry?.dispose();
  }
}

function stubVagina(root: THREE.Object3D) {
  const uterus = collectNamedBox(root, /uterus/);
  const ucx = 0;
  const ucy = uterus ? (uterus.min.y + uterus.max.y) * 0.5 - 0.02 : 0.92;
  const ucz = uterus ? (uterus.min.z + uterus.max.z) * 0.5 + 0.008 : 0.05;
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    if (!/vagin/.test(meshKey(mesh))) return;
    const pos = mesh.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
    if (!pos || !(pos.array instanceof Float32Array)) return;
    const arr = pos.array;
    for (let i = 0; i < pos.count; i++) {
      const i3 = i * 3;
      const x = arr[i3]!;
      const y = arr[i3 + 1]!;
      const z = arr[i3 + 2]!;
      const d = Math.hypot(x - ucx, y - ucy, z - ucz);
      const w = THREE.MathUtils.clamp((d - 0.028) / 0.05, 0, 1);
      if (w <= 0) continue;
      arr[i3] = x + (ucx - x) * w;
      arr[i3 + 1] = y + (ucy - y) * w;
      arr[i3 + 2] = z + (ucz - z) * w;
    }
    pos.needsUpdate = true;
    mesh.geometry.computeBoundingBox();
    mesh.geometry.computeBoundingSphere();
  });
}

function bakeIntoVertices(group: THREE.Object3D) {
  group.updateMatrixWorld(true);
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    mesh.updateWorldMatrix(true, false);
    const geo = mesh.geometry.clone();
    geo.applyMatrix4(mesh.matrixWorld);
    mesh.geometry = geo;
    mesh.position.set(0, 0, 0);
    mesh.quaternion.identity();
    mesh.scale.set(1, 1, 1);
    mesh.matrix.identity();
    mesh.matrixWorld.identity();
  });
  group.position.set(0, 0, 0);
  group.quaternion.identity();
  group.scale.set(1, 1, 1);
  group.matrix.identity();
  group.updateMatrixWorld(true);
}

function cloneGraph(source: THREE.Object3D) {
  return SkeletonUtils.clone(source) as THREE.Group;
}

function fitStanding(source: THREE.Object3D, targetHeight: number) {
  const root = cloneGraph(source);
  root.updateMatrixWorld(true);
  _box.setFromObject(root);
  _box.getSize(_size);
  _box.getCenter(_center);

  if (_size.z > _size.x * 1.2) {
    const facePlusX = _center.x < 0.2;
    root.rotation.y += facePlusX ? -Math.PI / 2 : Math.PI / 2;
    root.updateMatrixWorld(true);
    _box.setFromObject(root);
    _box.getSize(_size);
    _box.getCenter(_center);
  }
  if (_size.z > _size.y * 1.25) {
    root.rotation.x += -Math.PI / 2;
    root.updateMatrixWorld(true);
    _box.setFromObject(root);
    _box.getSize(_size);
    _box.getCenter(_center);
  }

  const s = targetHeight / Math.max(_size.y, 0.001);
  root.scale.multiplyScalar(s);
  root.updateMatrixWorld(true);
  _box.setFromObject(root);
  _box.getSize(_size);
  _box.getCenter(_center);
  root.position.x -= _center.x;
  root.position.z -= _center.z;
  root.position.y -= _box.min.y;
  root.updateMatrixWorld(true);
  return root;
}

function flattenToWorld(source: THREE.Object3D) {
  const baked = new THREE.Group();
  source.updateMatrixWorld(true);
  source.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible || !mesh.geometry) return;
    const geo0 = mesh.geometry.clone();
    geo0.applyMatrix4(mesh.matrixWorld);
    if (geo0.attributes.skinIndex) geo0.deleteAttribute("skinIndex");
    if (geo0.attributes.skinWeight) geo0.deleteAttribute("skinWeight");
    const mat = mesh.material;
    const out = new THREE.Mesh(geo0, mat);
    out.name = mesh.name;
    out.userData.parentName = mesh.parent?.name ?? "";
    out.userData.matName = !Array.isArray(mat) ? (mat as THREE.Material).name : "";
    out.frustumCulled = false;
    baked.add(out);
  });
  return baked;
}

function sampleBand(character: THREE.Object3D, y0: number, y1: number, maxAbsX = 0.22) {
  const box = new THREE.Box3();
  box.makeEmpty();
  let count = 0;
  character.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    if (!isTorsoMesh(mesh)) return;
    const pos = mesh.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
    if (!pos) return;
    const step = Math.max(1, Math.floor(pos.count / 6000));
    for (let i = 0; i < pos.count; i += step) {
      _local.fromBufferAttribute(pos, i);
      mesh.localToWorld(_local);
      if (_local.y < y0 || _local.y > y1) continue;
      if (Math.abs(_local.x) > maxAbsX) continue;
      box.expandByPoint(_local);
      count++;
    }
  });
  return { box, count };
}

function sliceWidths(root: THREE.Object3D, y0: number, y1: number, bands = 8) {
  const dy = (y1 - y0) / bands;
  const out = Array.from({ length: bands }, (_, i) => ({ y: y0 + (i + 0.5) * dy, halfX: 0, zF: -1, zB: 1 }));
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const pos = mesh.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
    if (!pos) return;
    for (let i = 0; i < pos.count; i += Math.max(1, Math.floor(pos.count / 12000))) {
      _local.fromBufferAttribute(pos, i);
      mesh.localToWorld(_local);
      if (_local.y < y0 || _local.y > y1) continue;
      const b = Math.min(bands - 1, Math.max(0, Math.floor((_local.y - y0) / dy)));
      const s = out[b]!;
      s.halfX = Math.max(s.halfX, Math.abs(_local.x));
      s.zF = Math.max(s.zF, _local.z);
      s.zB = Math.min(s.zB, _local.z);
    }
  });
  return out.map((s) => ({ y: +s.y.toFixed(3), halfX: +s.halfX.toFixed(3), zF: +s.zF.toFixed(3) }));
}

function collectNamedBox(root: THREE.Object3D, re: RegExp) {
  const box = new THREE.Box3();
  box.makeEmpty();
  let n = 0;
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    if (!re.test(meshKey(mesh))) return;
    box.expandByObject(mesh);
    n++;
  });
  return n > 0 ? box : null;
}

function clampGroupToBox(group: THREE.Object3D, box: THREE.Box3, zPad = 0.012) {
  group.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(group);
  const zLimit = box.max.z - zPad;
  if (b.max.z > zLimit) group.position.z -= b.max.z - zLimit;
  const xMid = (b.min.x + b.max.x) * 0.5;
  const xWant = (box.min.x + box.max.x) * 0.5;
  group.position.x += xWant - xMid;
  group.updateMatrixWorld(true);
}

type TorsoSlice = { y: number; halfX: number; zFront: number; zBack: number };

function sampleTorsoProfile(body: THREE.Object3D, y0: number, y1: number, bands = 20): TorsoSlice[] {
  const dy = (y1 - y0) / bands;
  const slots: TorsoSlice[] = [];
  const n = new Int16Array(bands);
  for (let i = 0; i < bands; i++) {
    slots.push({ y: y0 + (i + 0.5) * dy, halfX: 0.04, zFront: -1, zBack: 1 });
  }
  body.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    if (!isTorsoMesh(mesh)) return;
    const pos = mesh.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
    if (!pos) return;
    const step = Math.max(1, Math.floor(pos.count / 10000));
    for (let i = 0; i < pos.count; i += step) {
      _local.fromBufferAttribute(pos, i);
      mesh.localToWorld(_local);
      if (_local.y < y0 || _local.y > y1) continue;
      if (Math.abs(_local.x) > 0.16) continue;
      if (_local.z < -0.02) continue;
      const b = Math.min(bands - 1, Math.max(0, Math.floor((_local.y - y0) / dy)));
      const s = slots[b]!;
      s.halfX = Math.max(s.halfX, Math.abs(_local.x));
      if (n[b] === 0) {
        s.zFront = _local.z;
        s.zBack = _local.z;
      } else {
        s.zFront = Math.max(s.zFront, _local.z);
        s.zBack = Math.min(s.zBack, _local.z);
      }
      n[b]!++;
    }
  });
  for (let i = 0; i < bands; i++) {
    if (n[i]! > 4) continue;
    const src = slots[i > 0 && n[i - 1]! > 4 ? i - 1 : Math.min(bands - 1, i + 1)]!;
    slots[i]!.halfX = src.halfX;
    slots[i]!.zFront = src.zFront;
    slots[i]!.zBack = src.zBack;
  }
  return slots;
}

function profileAt(profile: TorsoSlice[], y: number): TorsoSlice {
  if (y <= profile[0]!.y) return profile[0]!;
  const last = profile[profile.length - 1]!;
  if (y >= last.y) return last;
  for (let i = 0; i < profile.length - 1; i++) {
    const a = profile[i]!;
    const b = profile[i + 1]!;
    if (y > b.y) continue;
    const t = (y - a.y) / Math.max(1e-5, b.y - a.y);
    return {
      y,
      halfX: a.halfX + (b.halfX - a.halfX) * t,
      zFront: a.zFront + (b.zFront - a.zFront) * t,
      zBack: a.zBack + (b.zBack - a.zBack) * t,
    };
  }
  return last;
}

function placeGuts(source: THREE.Object3D, cavity: THREE.Box3, navel: THREE.Vector3, profile: TorsoSlice[]) {
  const root = cloneGraph(source);
  root.updateMatrixWorld(true);
  const src = new THREE.Box3().setFromObject(root);
  const ss = src.getSize(new THREE.Vector3());
  const ts = cavity.getSize(new THREE.Vector3());
  const s = Math.min(ts.x / Math.max(ss.x, 1e-4), ts.y / Math.max(ss.y, 1e-4)) * 0.9;
  root.scale.set(s, s, s * 1.2);
  root.updateMatrixWorld(true);
  const after = new THREE.Box3().setFromObject(root);
  const ac = after.getCenter(new THREE.Vector3());
  root.position.x += navel.x - ac.x;
  root.position.y += navel.y + 0.016 - ac.y;
  const cz = (cavity.min.z + cavity.max.z) * 0.5;
  root.position.z += cz - ac.z;
  root.updateMatrixWorld(true);
  const baked = flattenToWorld(root);
  bakeIntoVertices(baked);
  liftColonFlexures(baked, navel.y);
  fitGutEnvelope(baked, cavity, profile, navel.y);
  balanceLowerGuts(baked, profile, navel.y);
  tuckColonSides(baked, profile, navel.y);
  centerGutsInCavity(baked, cavity);
  return baked;
}

function balanceLowerGuts(group: THREE.Object3D, profile: TorsoSlice[], navelY: number) {
  const box = new THREE.Box3().setFromObject(group);
  const yLo = box.min.y;
  const yHi = navelY + 0.02;
  if (yHi <= yLo) return;
  let sumX = 0;
  let n = 0;
  let left = 0;
  let right = 0;
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const pos = mesh.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
    if (!pos || !(pos.array instanceof Float32Array)) return;
    const arr = pos.array;
    for (let i = 0; i < pos.count; i++) {
      const y = arr[i * 3 + 1]!;
      if (y > yHi) continue;
      const x = arr[i * 3]!;
      sumX += x;
      n++;
      if (x < 0) left = Math.max(left, -x);
      else right = Math.max(right, x);
    }
  });
  if (n < 20) return;
  const cx = sumX / n;
  const span = Math.max(left, right, 0.03);
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const pos = mesh.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
    if (!pos || !(pos.array instanceof Float32Array)) return;
    const arr = pos.array;
    for (let i = 0; i < pos.count; i++) {
      const i3 = i * 3;
      const y = arr[i3 + 1]!;
      const t = 1 - THREE.MathUtils.smoothstep(y, yLo, yHi);
      if (t <= 0) continue;
      let x = arr[i3]! - cx * t * 0.8;
      const p = profileAt(profile, y);
      const allow = Math.max(0.055, p.halfX * 0.84);
      const sx = 1 + (allow / span - 1) * t * 0.7;
      x *= THREE.MathUtils.clamp(sx, 1, 1.4);
      arr[i3] = x;
    }
    pos.needsUpdate = true;
    mesh.geometry.computeBoundingBox();
    mesh.geometry.computeBoundingSphere();
  });
}

function tuckColonSides(group: THREE.Object3D, profile: TorsoSlice[], navelY: number) {
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const pos = mesh.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
    if (!pos || !(pos.array instanceof Float32Array)) return;
    const arr = pos.array;
    for (let i = 0; i < pos.count; i++) {
      const i3 = i * 3;
      let x = arr[i3]!;
      const ax = Math.abs(x);
      if (ax < 0.004) continue;
      const y = arr[i3 + 1]!;
      const outer = THREE.MathUtils.smoothstep(ax, 0.022, 0.08);
      const band = THREE.MathUtils.smoothstep(y, navelY + 0.02, navelY + 0.16);
      const w = outer * (0.4 + 0.6 * band);
      const sign = Math.sign(x);
      x -= sign * 0.011 * w;
      const p = profileAt(profile, y);
      const zLimit = p.zFront - 0.015;
      let z = arr[i3 + 2]!;
      if (z > zLimit) z -= (z - zLimit) * 0.45 * w;
      arr[i3] = x;
      arr[i3 + 2] = z;
    }
    pos.needsUpdate = true;
    mesh.geometry.computeBoundingBox();
    mesh.geometry.computeBoundingSphere();
  });
}

function centerGutsInCavity(group: THREE.Object3D, cavity: THREE.Box3) {
  const box = new THREE.Box3().setFromObject(group);
  const gz = (box.min.z + box.max.z) * 0.5;
  const cz = (cavity.min.z + cavity.max.z) * 0.5;
  const dz = cz - gz;
  const front = box.max.z + dz;
  const allow = cavity.max.z;
  const halfHave = Math.max(1e-4, front - cz);
  const halfAllow = Math.max(1e-4, allow - cz);
  const sz = halfHave > halfAllow ? halfAllow / halfHave : 1;
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const pos = mesh.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
    if (!pos || !(pos.array instanceof Float32Array)) return;
    const arr = pos.array;
    for (let i = 0; i < pos.count; i++) {
      const z = arr[i * 3 + 2]! + dz;
      arr[i * 3 + 2] = cz + (z - cz) * sz;
    }
    pos.needsUpdate = true;
    mesh.geometry.computeBoundingBox();
    mesh.geometry.computeBoundingSphere();
  });
}

function liftColonFlexures(group: THREE.Object3D, navelY: number) {
  const box = new THREE.Box3().setFromObject(group);
  const y0 = box.min.y;
  const span = Math.max(1e-4, box.max.y - y0);
  const cx = (box.min.x + box.max.x) * 0.5;
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const pos = mesh.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
    if (!pos || !(pos.array instanceof Float32Array)) return;
    const arr = pos.array;
    for (let i = 0; i < pos.count; i++) {
      const i3 = i * 3;
      const x = arr[i3]!;
      const y = arr[i3 + 1]!;
      const t = (y - y0) / span;
      if (t < 0.38) continue;
      const w = (t - 0.38) / 0.62;
      const side = THREE.MathUtils.smoothstep(Math.abs(x - cx), 0.03, 0.075);
      arr[i3 + 1] = y + 0.046 * w * (0.62 + 0.38 * side);
    }
    pos.needsUpdate = true;
    mesh.geometry.computeBoundingBox();
  });
}

function fitGutEnvelope(group: THREE.Object3D, cavity: THREE.Box3, profile: TorsoSlice[], navelY: number) {
  const box = new THREE.Box3().setFromObject(group);
  const y0 = box.min.y;
  const span = Math.max(1e-4, box.max.y - y0);
  const cx = (box.min.x + box.max.x) * 0.5;
  const bands = 16;
  const gHalf = new Float32Array(bands);
  const gZ1 = new Float32Array(bands);
  gZ1.fill(-1e3);
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const pos = mesh.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
    if (!pos || !(pos.array instanceof Float32Array)) return;
    const arr = pos.array;
    for (let i = 0; i < pos.count; i++) {
      const y = arr[i * 3 + 1]!;
      const b = Math.min(bands - 1, Math.max(0, Math.floor(((y - y0) / span) * bands)));
      gHalf[b] = Math.max(gHalf[b]!, Math.abs(arr[i * 3]! - cx));
      gZ1[b] = Math.max(gZ1[b]!, arr[i * 3 + 2]!);
    }
  });
  for (let b = 1; b < bands; b++) {
    if (gHalf[b]! < 0.02) gHalf[b] = gHalf[b - 1]!;
    if (gZ1[b]! < -10) gZ1[b] = gZ1[b - 1]!;
  }
  const sx = new Float32Array(bands);
  const zPull = new Float32Array(bands);
  for (let b = 0; b < bands; b++) {
    const y = y0 + ((b + 0.5) / bands) * span;
    const p = profileAt(profile, y);
    const above = THREE.MathUtils.smoothstep(y, navelY + 0.08, navelY + 0.22);
    const allowX = Math.max(0.05, p.halfX * (0.78 - above * 0.02));
    sx[b] = THREE.MathUtils.clamp(allowX / Math.max(gHalf[b]!, 1e-4), 0.84, 1);
    const allowZ = Math.min(cavity.max.z, p.zFront - 0.012);
    zPull[b] = Math.max(0, (gZ1[b]! - allowZ) * 0.35);
  }
  const lerpB = (arr: Float32Array, t: number) => {
    const x = THREE.MathUtils.clamp(t, 0, 1) * (bands - 1);
    const i = Math.min(bands - 2, Math.max(0, Math.floor(x)));
    const f = x - i;
    return arr[i]! * (1 - f) + arr[i + 1]! * f;
  };
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const pos = mesh.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
    if (!pos || !(pos.array instanceof Float32Array)) return;
    const arr = pos.array;
    for (let i = 0; i < pos.count; i++) {
      const i3 = i * 3;
      const y = arr[i3 + 1]!;
      const t = THREE.MathUtils.clamp((y - y0) / span, 0, 1);
      const s = lerpB(sx, t);
      arr[i3] = cx + (arr[i3]! - cx) * s;
      let z = arr[i3 + 2]! - lerpB(zPull, t);
      const p = profileAt(profile, y);
      const zFront = Math.min(cavity.max.z, p.zFront - 0.01);
      if (z > zFront) z = zFront + (z - zFront) * 0.2;
      arr[i3 + 2] = z;
    }
    pos.needsUpdate = true;
    mesh.geometry.computeBoundingBox();
    mesh.geometry.computeBoundingSphere();
  });
}

function shiftNamedMeshes(root: THREE.Object3D, re: RegExp, dx: number, dy: number, dz: number) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    if (!re.test(meshKey(mesh))) return;
    const pos = mesh.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
    if (!pos || !(pos.array instanceof Float32Array)) return;
    const arr = pos.array;
    for (let i = 0; i < pos.count; i++) {
      arr[i * 3] += dx;
      arr[i * 3 + 1] += dy;
      arr[i * 3 + 2] += dz;
    }
    pos.needsUpdate = true;
    mesh.geometry.computeBoundingBox();
    mesh.geometry.computeBoundingSphere();
  });
}

function scaleNamedMeshes(root: THREE.Object3D, re: RegExp, factor: number) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    if (!re.test(meshKey(mesh))) return;
    const pos = mesh.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
    if (!pos || !(pos.array instanceof Float32Array)) return;
    const arr = pos.array;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (let i = 0; i < pos.count; i++) {
      cx += arr[i * 3]!;
      cy += arr[i * 3 + 1]!;
      cz += arr[i * 3 + 2]!;
    }
    const inv = 1 / Math.max(1, pos.count);
    cx *= inv;
    cy *= inv;
    cz *= inv;
    for (let i = 0; i < pos.count; i++) {
      arr[i * 3] = cx + (arr[i * 3]! - cx) * factor;
      arr[i * 3 + 1] = cy + (arr[i * 3 + 1]! - cy) * factor;
      arr[i * 3 + 2] = cz + (arr[i * 3 + 2]! - cz) * factor;
    }
    pos.needsUpdate = true;
    mesh.geometry.computeBoundingBox();
    mesh.geometry.computeBoundingSphere();
  });
}

function placePelvisPack(source: THREE.Object3D, crotch: THREE.Vector3, navel: THREE.Vector3, frontZ: number) {
  const root = cloneGraph(source);
  stripPelvicVulva(root);
  root.updateMatrixWorld(true);
  const uterusBox = collectNamedBox(root, /uterus/) ?? new THREE.Box3().setFromObject(root);
  const uSize = uterusBox.getSize(new THREE.Vector3());
  root.scale.multiplyScalar(0.058 / Math.max(uSize.y, 1e-4));
  root.updateMatrixWorld(true);
  const u2 = collectNamedBox(root, /uterus/) ?? new THREE.Box3().setFromObject(root);
  const uc = u2.getCenter(new THREE.Vector3());
  root.position.add(new THREE.Vector3(0, navel.y - 0.1, navel.z - 0.055).sub(uc));
  root.updateMatrixWorld(true);
  const baked = flattenToWorld(root);
  bakeIntoVertices(baked);
  stripPelvicVulva(baked);
  scaleNamedMeshes(baked, /uterus/, 1.02);
  scaleNamedMeshes(baked, /vessie|bladder/, 0.7);
  bakeIntoVertices(baked);

  const internals = /uterus|vessie|bladder|ovaire|trompe|ligament|vagin/;
  const ub = collectNamedBox(baked, /uterus/);
  if (ub) {
    const cz = (ub.min.z + ub.max.z) * 0.5;
    const dy = navel.y - 0.06 - ub.max.y;
    const dz = navel.z - 0.07 - cz;
    shiftNamedMeshes(baked, internals, 0, dy, dz);
  }
  stubVagina(baked);
  stripPelvicVulva(baked);
  return baked;
}

function inflateGuts(root: THREE.Object3D, navel: THREE.Vector3, inf: number) {
  if (Math.abs(inf) < 0.004) return;
  const ny = navel.y;
  const nx = navel.x;
  const nz = navel.z;
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const pos = mesh.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
    if (!pos || !(pos.array instanceof Float32Array)) return;
    const arr = pos.array;
    for (let i = 0; i < pos.count; i++) {
      const i3 = i * 3;
      const x = arr[i3]!;
      const y = arr[i3 + 1]!;
      const z = arr[i3 + 2]!;
      const yMask = 1 - THREE.MathUtils.smoothstep(Math.abs(y - ny), 0.02, 0.22);
      const xMask = 1 - THREE.MathUtils.smoothstep(Math.abs(x - nx), 0.02, 0.16);
      const mask = yMask * (0.35 + 0.65 * xMask);
      if (mask < 0.02) continue;
      if (inf > 0) {
        arr[i3] = nx + (x - nx) * (1 + inf * 0.62 * mask);
        arr[i3 + 1] = y - inf * 0.03 * mask;
        arr[i3 + 2] = nz + (z - nz) * (1 + inf * 0.78 * mask) + inf * 0.055 * mask;
      } else {
        const c = -inf;
        arr[i3] = nx + (x - nx) * (1 - c * 0.48 * mask);
        arr[i3 + 2] = nz + (z - nz) * (1 - c * 0.32 * mask);
      }
    }
    pos.needsUpdate = true;
  });
}

function polishFront(mesh: THREE.Mesh, closer: boolean) {
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const raw of mats) {
    const m = raw as THREE.MeshStandardMaterial;
    if (!m) continue;
    m.side = THREE.FrontSide;
    m.polygonOffset = false;
    m.dithering = false;
    m.needsUpdate = true;
  }
  mesh.renderOrder = closer ? 3 : 2;
}

function polishHair(mesh: THREE.Mesh) {
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const next = mats.map((raw) => {
    const src = raw as THREE.MeshStandardMaterial | undefined;
    const m = (src ? src.clone() : new THREE.MeshStandardMaterial()) as THREE.MeshStandardMaterial;
    m.vertexColors = false;
    m.side = THREE.DoubleSide;
    m.forceSinglePass = true;
    m.transparent = false;
    m.opacity = 1;
    m.alphaHash = false;
    m.alphaToCoverage = false;
    m.alphaTest = 0.38;
    m.depthWrite = true;
    m.depthTest = true;
    m.metalness = 0;
    m.roughness = 0.58;
    m.dithering = false;
    m.envMapIntensity = 0.2;
    m.polygonOffset = false;
    m.normalMap = null;
    m.roughnessMap = null;
    m.metalnessMap = null;
    m.aoMap = null;
    if (m.map) {
      m.map.colorSpace = THREE.SRGBColorSpace;
      m.map.anisotropy = 1;
      m.map.generateMipmaps = true;
      m.map.minFilter = THREE.LinearMipmapLinearFilter;
      m.map.magFilter = THREE.LinearFilter;
    }
    m.needsUpdate = true;
    return m;
  });
  mesh.material = next.length === 1 ? next[0]! : next;
  mesh.renderOrder = 4;
}

function polishOrgans(root: THREE.Object3D, kind: "gut" | "pelvis") {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const next = mats.map((raw) => {
      const m = (raw ? raw.clone() : new THREE.MeshStandardMaterial()) as THREE.MeshStandardMaterial;
      m.side = THREE.DoubleSide;
      m.roughness = kind === "gut" ? 0.48 : 0.42;
      m.metalness = 0;
      if (!m.map) {
        m.color.lerp(new THREE.Color(kind === "gut" ? "#b85a4a" : "#c4786a"), 0.12);
      }
      m.emissive = new THREE.Color("#000000");
      m.emissiveIntensity = 0;
      m.transparent = false;
      m.depthWrite = true;
      m.depthTest = true;
      m.needsUpdate = true;
      return m;
    });
    mesh.material = next.length === 1 ? next[0] : next;
    mesh.renderOrder = 1;
    mesh.frustumCulled = false;
    mesh.raycast = () => {};
  });
}

function injectXray(shader: THREE.WebGLProgramParametersWithUniforms, y0: number, y1: number, xMax: number, zFront: number) {
  shader.uniforms.uXray = { value: 0 };
  shader.uniforms.uY0 = { value: y0 };
  shader.uniforms.uY1 = { value: y1 };
  shader.uniforms.uXMax = { value: xMax };
  shader.uniforms.uZFront = { value: zFront };
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", "#include <common>\nvarying vec3 vBodyW;")
    .replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nvBodyW = (modelMatrix * vec4(transformed, 1.0)).xyz;",
    );
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <common>",
    `#include <common>
uniform float uXray; uniform float uY0; uniform float uY1; uniform float uXMax; uniform float uZFront;
varying vec3 vBodyW;
float xrayHole() {
  float band = smoothstep(uY0, uY0 + 0.08, vBodyW.y) * (1.0 - smoothstep(uY1 - 0.04, uY1, vBodyW.y));
  float torso = 1.0 - smoothstep(uXMax * 0.65, uXMax + 0.1, abs(vBodyW.x));
  float front = smoothstep(uZFront - 0.16, uZFront + 0.04, vBodyW.z);
  return clamp(band * torso * front * uXray, 0.0, 1.0);
}`,
  );
}

function attachXray(
  mesh: THREE.Mesh,
  y0: number,
  y1: number,
  xMax: number,
  zFront: number,
  list: THREE.Material[],
  overlays: THREE.Mesh[],
) {
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const punchMats = mats.map((mat) => {
    if (!mat) return mat;
    const punch = mat.clone();
    punch.transparent = false;
    punch.opacity = 1;
    punch.side = THREE.FrontSide;
    punch.depthWrite = true;
    punch.depthTest = true;
    punch.onBeforeCompile = (shader) => {
      injectXray(shader, y0, y1, xMax, zFront);
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <dithering_fragment>",
        `if (!gl_FrontFacing) discard;
         if (xrayHole() > 0.07) discard;
         #include <dithering_fragment>`,
      );
      punch.userData.shader = shader;
    };
    punch.needsUpdate = true;
    list.push(punch);
    return punch;
  });
  mesh.material = punchMats.length === 1 ? punchMats[0] : punchMats;
  mesh.renderOrder = 2;

  const fadeMats = punchMats.map((punch) => {
    if (!punch) return punch;
    const fade = punch.clone();
    fade.transparent = true;
    fade.opacity = 1;
    fade.depthWrite = false;
    fade.depthTest = true;
    fade.side = THREE.FrontSide;
    fade.onBeforeCompile = (shader) => {
      injectXray(shader, y0, y1, xMax, zFront);
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <dithering_fragment>",
        `if (!gl_FrontFacing) discard;
         float hole = xrayHole();
         if (hole < 0.012) discard;
         float fade = smoothstep(0.012, 1.0, hole);
         gl_FragColor.rgb *= mix(1.0, 0.5, fade);
         gl_FragColor.a *= mix(0.96, 0.05, pow(fade, 0.72));
         #include <dithering_fragment>`,
      );
      fade.userData.shader = shader;
    };
    fade.needsUpdate = true;
    list.push(fade);
    return fade;
  });

  const overlay = new THREE.Mesh(mesh.geometry, fadeMats.length === 1 ? fadeMats[0] : fadeMats);
  overlay.name = "__xrayOverlay";
  overlay.userData.xrayOverlay = true;
  overlay.frustumCulled = false;
  overlay.renderOrder = 6;
  overlay.raycast = () => {};
  overlay.visible = false;
  overlays.push(overlay);
  return overlay;
}

export function Figure({ controlsRef, character, intestines, pelvis, arm, bayonet, bayonetLong }: FigureProps) {
  return (
    <FittedFigure
      character={character}
      intestines={intestines}
      pelvis={pelvis}
      arm={arm}
      bayonet={bayonet}
      bayonetLong={bayonetLong}
      controlsRef={controlsRef}
    />
  );
}

function FittedFigure({
  character,
  intestines,
  pelvis,
  arm,
  bayonet,
  bayonetLong,
  controlsRef,
}: {
  character: THREE.Object3D;
  intestines: THREE.Object3D;
  pelvis: THREE.Object3D;
  arm: THREE.Object3D;
  bayonet: THREE.Object3D;
  bayonetLong: THREE.Object3D;
  controlsRef: RefObject<OrbitControlsImpl | null>;
}) {
  const pokeRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const lastShake = useRef(0);
  const lastReset = useRef(0);
  const lastStrike = useRef(0);
  const latticeRef = useRef<THREE.Points>(null);
  const bonesRef = useRef<THREE.LineSegments>(null);
  const exprRef = useRef(useStudio.getState().expression);
  const poseRef = useRef(useStudio.getState().pose);
  const gestLRef = useRef(useStudio.getState().handGestureL);
  const gestRRef = useRef(useStudio.getState().handGestureR);
  const grab = useRef<{
    active: boolean;
    mode: "pose" | "drag" | "fist" | "bayonet";
    poseKind?: "ik" | "rotate" | "move";
    origin: THREE.Vector3;
    planePoint: THREE.Vector3;
    normal: THREE.Vector3;
    bone: number;
    axis?: THREE.Vector3;
  } | null>(null);
  const energyTick = useRef(0);
  const gutExc = useRef(0);
  const lastAz = useRef<number | null>(null);
  const lastPol = useRef<number | null>(null);
  const bayonetPenRef = useRef(0);
  const rmbDown = useRef(false);
  const { camera, gl, raycaster, pointer } = useThree();

  const setup = useMemo(() => {
    const xrayList: THREE.Material[] = [];
    const xrayOverlays: THREE.Mesh[] = [];
    const xrayHosts: THREE.Mesh[] = [];
    const torsoMeshes: THREE.Mesh[] = [];
    const root = new THREE.Group();
    const fitted = fitStanding(character, 1.66);
    const body = flattenToWorld(fitted);
    root.add(body);

    _box.setFromObject(body);
    _box.getSize(_size);
    const height = _size.y;
    const charBox = new THREE.Box3().setFromObject(body);
    const navel = findNavel(body, height);
    const yNavel = navel.y;
    const yAb0 = yNavel - 0.08;
    const yAb1 = yNavel + 0.11;
    const yX0 = yNavel - 0.2;
    const yX1 = yNavel + 0.145;

    const abSample = sampleBand(body, yAb0, yAb1, 0.12);
    const abdomen =
      abSample.count > 40
        ? abSample.box.clone()
        : new THREE.Box3(new THREE.Vector3(-0.11, yAb0, -0.04), new THREE.Vector3(0.11, yAb1, 0.1));
    const abx = Math.max(0.11, Math.min(0.13, (abdomen.max.x - abdomen.min.x) * 0.42));
    const acx = (abdomen.min.x + abdomen.max.x) * 0.5;
    abdomen.min.x = acx - abx;
    abdomen.max.x = acx + abx;
    const skinZ = navel.z;
    abdomen.max.z = skinZ - 0.012;
    abdomen.min.z = skinZ - 0.1;

    const crotch = findCrotch(body, height);
    const anus = findAnus(body, height, crotch);
    const pelvic = placePelvisPack(pelvis, crotch, navel, skinZ - 0.028);
    polishOrgans(pelvic, "pelvis");
    pelvic.visible = false;
    root.add(pelvic);
    const uterusNow = collectNamedBox(pelvic, /uterus/);

    const gutBox = new THREE.Box3(
      new THREE.Vector3(acx - 0.12, yNavel - 0.16, abdomen.min.z),
      new THREE.Vector3(acx + 0.12, yNavel + 0.22, abdomen.max.z),
    );
    const waistProfile = sampleTorsoProfile(body, gutBox.min.y - 0.02, gutBox.max.y + 0.1);
    const gut = placeGuts(intestines, gutBox, navel, waistProfile);
    polishOrgans(gut, "gut");
    if (uterusNow) liftGutsOffUterus(gut, uterusNow);
    gut.visible = false;
    root.add(gut);

    const bellyLight = new THREE.PointLight("#a07060", 0, 0.48);
    bellyLight.position.set(0, yNavel, abdomen.max.z - 0.04);
    root.add(bellyLight);

    const armSpan = Math.max(charBox.max.x, -charBox.min.x);
    const landmarks = sampleLandmarks(body, navel, height);
    landmarks.lHand ??= new THREE.Vector3(-armSpan * 0.85, yNavel - 0.2, 0.03);
    landmarks.rHand ??= new THREE.Vector3(armSpan * 0.85, yNavel - 0.2, 0.03);
    const skeleton = new SoftSkeleton(landmarks, height, nudeBones());
    const boundGeos: THREE.BufferGeometry[] = [];
    const torsoBinds: SkinBinding[] = [];
    const weightViews: { mesh: THREE.Mesh; orig: THREE.Material | THREE.Material[]; weight: THREE.Material }[] = [];

    const bindMesh = (mesh: THREE.Mesh, hint?: string) => {
      let geo = mesh.geometry as THREE.BufferGeometry;
      const pos0 = geo.getAttribute("position") as THREE.BufferAttribute | undefined;
      if (!pos0 || pos0.itemSize !== 3) return;
      mesh.geometry = geo.clone();
      geo = mesh.geometry as THREE.BufferGeometry;
      const pos = geo.getAttribute("position") as THREE.BufferAttribute;
      if (!(pos.array instanceof Float32Array)) return;
      mesh.updateWorldMatrix(true, false);
      const n = pos.count;
      const world = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        _local.fromBufferAttribute(pos, i);
        mesh.localToWorld(_local);
        world[i * 3] = _local.x;
        world[i * 3 + 1] = _local.y;
        world[i * 3 + 2] = _local.z;
      }
      pos.array.set(world);
      pos.needsUpdate = true;
      const hintName = hint ?? bindHint(mesh);
      const nrmAttr = geo.getAttribute("normal") as THREE.BufferAttribute | undefined;
      if (hintName !== "hair" && nrmAttr && nrmAttr.array instanceof Float32Array) {
        const nmat = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
        for (let i = 0; i < n; i++) {
          _normal.fromBufferAttribute(nrmAttr, i).applyMatrix3(nmat).normalize();
          nrmAttr.array[i * 3] = _normal.x;
          nrmAttr.array[i * 3 + 1] = _normal.y;
          nrmAttr.array[i * 3 + 2] = _normal.z;
        }
        nrmAttr.needsUpdate = true;
      }
      const tanAttr = geo.getAttribute("tangent") as THREE.BufferAttribute | undefined;
      if (hintName !== "hair" && tanAttr && tanAttr.array instanceof Float32Array) {
        const step = tanAttr.itemSize;
        for (let i = 0; i < n; i++) {
          _normal.fromBufferAttribute(tanAttr, i).transformDirection(mesh.matrixWorld).normalize();
          tanAttr.array[i * step] = _normal.x;
          tanAttr.array[i * step + 1] = _normal.y;
          tanAttr.array[i * step + 2] = _normal.z;
        }
        tanAttr.needsUpdate = true;
      }
      if ((hintName === "body" || hintName === "dress" || hintName === "legs") && landmarks.head) {
        const seam = landmarks.head.y - 0.1;
        for (let i = 0; i < n; i++) {
          const y = pos.array[i * 3 + 1]!;
          if (y <= seam) continue;
          const t = THREE.MathUtils.clamp((y - seam) / 0.07, 0, 1);
          pos.array[i * 3] *= 1 - 0.055 * t;
          pos.array[i * 3 + 2] = pos.array[i * 3 + 2]! * (1 - 0.04 * t) - 0.007 * t;
        }
        pos.needsUpdate = true;
      }
      const pack = nudeMapFor(meshMatKey(mesh), n);
      const tri = geo.getIndex()?.array as Uint16Array | Uint32Array | undefined;
      const nrmArr =
        hintName !== "hair" && nrmAttr?.array instanceof Float32Array ? nrmAttr.array : undefined;
      const tanArr =
        hintName !== "hair" && tanAttr?.array instanceof Float32Array ? tanAttr.array : undefined;
      const binding =
        pack && pack.count === n
          ? skeleton.bindPrepared(pos.array, pack.index, pack.weight, hintName, tri, nrmArr, tanArr)
          : skeleton.bind(pos.array, hintName, tri, nrmArr, tanArr);
      if (hintName !== "hair") geo.setAttribute("color", new THREE.BufferAttribute(binding.colors, 3));
      if (hintName === "hair") geo.userData.hair = true;
      boundGeos.push(geo);
      if (!hint && isTorsoMesh(mesh)) torsoBinds.push(binding);
      const weightMat = new THREE.MeshLambertMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
      });
      weightViews.push({ mesh, orig: mesh.material, weight: weightMat });
      if (hintName === "hair") polishHair(mesh);
      else if (hintName === "eye") {
        mesh.renderOrder = 1;
      } else if (hintName === "mouth") {
        mesh.renderOrder = 2;
      } else {
        polishFront(mesh, hintName === "face");
      }
      mesh.frustumCulled = false;
    };

    body.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      if (!shouldBind(mesh)) {
        mesh.raycast = () => {};
        return;
      }
      bindMesh(mesh);
      if (isTorsoMesh(mesh)) {
        torsoMeshes.push(mesh);
        const overlay = attachXray(mesh, yX0, yX1, 0.12, skinZ - 0.01, xrayList, xrayOverlays);
        if (overlay) xrayHosts.push(mesh);
      }
    });
    for (let i = 0; i < xrayOverlays.length; i++) xrayHosts[i]?.add(xrayOverlays[i]!);

    gut.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) bindMesh(mesh, "organs");
    });
    const peristalsis = new GutPeristalsis();
    peristalsis.attach(gut);
    const strike = new BellyStrike();
    strike.attach(gut);
    const gutHealth = new GutHealth();
    gutHealth.attach(gut, peristalsis.getTubes());
    root.add(gutHealth.bars);
    const fist = new FistPlay();
    fist.attach(arm, peristalsis.getTubes(), anus);
    fist.setEnvelope(crotch.y + 0.012, navel.y + 0.108, waistProfile);
    fist.setMid(navel);
    root.add(fist.root);
    const knife = new BayonetPlay();
    knife.attach(bayonet, peristalsis.getTubes(), bayonetLong);
    knife.setSkin(torsoMeshes, { y0: yX0, y1: yX1, xMax: 0.12, zFront: skinZ - 0.01 });
    const navelMorph = buildNavelMorph(torsoBinds, navel);
    root.add(knife.root);
    root.add(knife.wounds);
    pelvic.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) bindMesh(mesh, "organs");
    });
    const jointBuf = new Float32Array(skeleton.count * 3);
    const boneVis = new THREE.Group();
    boneVis.visible = false;
    const jointMat = new THREE.MeshBasicMaterial({ color: "#d4b5a0", depthTest: false, transparent: true, opacity: 0.95 });
    const jointSel = new THREE.MeshBasicMaterial({ color: "#7ec8e3", depthTest: false, transparent: true, opacity: 1 });
    const joints: THREE.Mesh[] = [];
    const majorGeo = new THREE.SphereGeometry(0.01, 10, 10);
    const fingerGeo = new THREE.SphereGeometry(0.006, 8, 8);
    const hairGeo = new THREE.SphereGeometry(0.007, 8, 8);
    for (let i = 0; i < skeleton.count; i++) {
      const nm = skeleton.names[i]!;
      const geo = /Hair/i.test(nm) ? hairGeo : /Thumb|Index|Middle|Ring|Pinky/i.test(nm) ? fingerGeo : majorGeo;
      const m = new THREE.Mesh(geo, jointMat);
      m.frustumCulled = false;
      m.renderOrder = 30;
      m.userData.boneIndex = i;
      boneVis.add(m);
      joints.push(m);
    }
    const linePos = new Float32Array(skeleton.boneLineCount() * 6);
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute("position", new THREE.BufferAttribute(linePos, 3));
    const boneLines = new THREE.LineSegments(
      lineGeo,
      new THREE.LineBasicMaterial({ color: "#f2efe9", depthTest: false, transparent: true, opacity: 0.85 }),
    );
    boneLines.frustumCulled = false;
    boneLines.renderOrder = 29;
    boneVis.add(boneLines);

    const gizmo = new THREE.Group();
    gizmo.visible = false;
    const ringGeo = new THREE.TorusGeometry(0.12, 0.009, 8, 56);
    const arrowBody = new THREE.CylinderGeometry(0.006, 0.006, 0.1, 8);
    const arrowHead = new THREE.ConeGeometry(0.016, 0.032, 10);
    const mkMat = (c: string) =>
      new THREE.MeshBasicMaterial({ color: c, depthTest: false, transparent: true, opacity: 0.95 });
    const axisDefs: { key: "x" | "y" | "z"; color: string; eul: THREE.Euler }[] = [
      { key: "x", color: "#e25d5d", eul: new THREE.Euler(0, Math.PI / 2, 0) },
      { key: "y", color: "#5dcc7a", eul: new THREE.Euler(Math.PI / 2, 0, 0) },
      { key: "z", color: "#5da8e2", eul: new THREE.Euler(0, 0, 0) },
    ];
    const rotRings: THREE.Mesh[] = [];
    const moveArrows: THREE.Group[] = [];
    for (const ax of axisDefs) {
      const ring = new THREE.Mesh(ringGeo, mkMat(ax.color));
      ring.rotation.copy(ax.eul);
      ring.userData.gizmo = `r${ax.key}`;
      ring.userData.axis = ax.key;
      ring.frustumCulled = false;
      ring.renderOrder = 41;
      gizmo.add(ring);
      rotRings.push(ring);
      const grp = new THREE.Group();
      grp.userData.gizmo = `m${ax.key}`;
      grp.userData.axis = ax.key;
      const body = new THREE.Mesh(arrowBody, mkMat(ax.color));
      const head = new THREE.Mesh(arrowHead, mkMat(ax.color));
      body.position.y = 0.07;
      head.position.y = 0.13;
      body.userData.gizmo = `m${ax.key}`;
      body.userData.axis = ax.key;
      head.userData.gizmo = `m${ax.key}`;
      head.userData.axis = ax.key;
      grp.add(body);
      grp.add(head);
      if (ax.key === "x") grp.rotation.z = -Math.PI / 2;
      if (ax.key === "z") grp.rotation.x = Math.PI / 2;
      grp.traverse((o) => {
        (o as THREE.Mesh).frustumCulled = false;
        (o as THREE.Mesh).renderOrder = 42;
      });
      gizmo.add(grp);
      moveArrows.push(grp);
    }
    root.add(gizmo);
    root.add(boneVis);
    for (const v of weightViews) v.orig = v.mesh.material;

    const gutBoxNow = new THREE.Box3().setFromObject(gut);
    const pelBoxNow = new THREE.Box3().setFromObject(pelvic);
    if (typeof window !== "undefined") {
      (window as unknown as { __vela?: unknown }).__vela = {
        char: { min: charBox.min.toArray(), max: charBox.max.toArray() },
        abdomen: { min: abdomen.min.toArray(), max: abdomen.max.toArray() },
        pelvis: { min: pelBoxNow.min.toArray(), max: pelBoxNow.max.toArray() },
        uterusBox: (() => {
          const b = collectNamedBox(pelvic, /uterus/);
          return b ? { min: b.min.toArray(), max: b.max.toArray() } : null;
        })(),
        bladderBox: (() => {
          const b = collectNamedBox(pelvic, /vessie|bladder/);
          return b ? { min: b.min.toArray(), max: b.max.toArray() } : null;
        })(),
        vulvaBox: (() => {
          const b = collectNamedBox(pelvic, /vulve|clitoris/);
          return b ? { min: b.min.toArray(), max: b.max.toArray() } : null;
        })(),
        guts: { min: gutBoxNow.min.toArray(), max: gutBoxNow.max.toArray() },
        navel: navel.toArray(),
        nativeSkin: {
          bones: skeleton.count,
          names: skeleton.names.slice(0, 10),
          hip: skeleton.names.includes("C_Hip_a"),
        },
        crotch: crotch.toArray(),
        anus: anus.toArray(),
        bayonet: { hasEntry: false, punctured: false, penetration: 0, squeeze: 0 },
        uterus: uterusNow
          ? [(uterusNow.min.x + uterusNow.max.x) * 0.5, (uterusNow.min.y + uterusNow.max.y) * 0.5, (uterusNow.min.z + uterusNow.max.z) * 0.5]
          : [0, yNavel - 0.1, 0],
        waist: waistProfile.map((s) => ({
          y: +s.y.toFixed(3),
          halfX: +s.halfX.toFixed(3),
          zF: +s.zFront.toFixed(3),
        })),
        gutBands: sliceWidths(gut, gutBoxNow.min.y, gutBoxNow.max.y, 8),
        bones: skeleton.names,
        bound: boundGeos.length,
      };
    }

    return {
      root,
      skeleton,
      y0: yAb0,
      y1: yAb1,
      abdomen,
      xrayList,
      xrayOverlays,
      gutRoot: gut,
      pelvisRoot: pelvic,
      peristalsis,
      strike,
      gutHealth,
      fist,
      knife,
      torsoMeshes,
      navel,
      navelMorph,
      boundGeos,
      bellyLight,
      weightViews,
      boneVis,
      joints,
      jointMat,
      jointSel,
      gizmo,
      rotRings,
      moveArrows,
      boneLines,
      jointBuf,
    };
  }, [character, intestines, pelvis, arm, bayonet, bayonetLong]);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      useStudio.setState({
        loading: false,
        loadProgress: 100,
        loadHint: "就绪",
        loadError: null,
      });
    });
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const el = gl.domElement;
    const onPointerDown = (e: PointerEvent) => {
      if (e.button === 2) rmbDown.current = true;
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.button === 2) rmbDown.current = false;
    };
    const onWheel = (e: WheelEvent) => {
      const s = useStudio.getState();
      if (!rmbDown.current) return;
      if (s.interactMode !== "bayonet" || !setup.knife.hasEntry) return;
      e.preventDefault();
      e.stopPropagation();
      const notches = THREE.MathUtils.clamp(e.deltaY, -180, 180) / 120;
      const next = setup.knife.adjustDepth(notches * 0.055);
      bayonetPenRef.current = next;
      s.setBayonetPen(next);
    };
    el.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    el.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      el.removeEventListener("wheel", onWheel, true);
    };
  }, [gl, setup]);

  useEffect(() => {
    if (controlsRef.current) {
      const c = setup.abdomen.getCenter(new THREE.Vector3());
      controlsRef.current.target.set(c.x, c.y, c.z);
      controlsRef.current.update();
    }
  }, [setup, controlsRef]);

  useEffect(() => {
    const onUp = () => {
      if (grab.current?.mode === "pose") setup.skeleton.commitPose();
      grab.current = null;
      setup.skeleton.clearHold();
      useStudio.getState().setGrabbing(false);
      gl.domElement.style.cursor = "default";
      if (pokeRef.current) pokeRef.current.visible = false;
    };
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("studio-cancel-grab", onUp);
    return () => {
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("studio-cancel-grab", onUp);
    };
  }, [gl, setup]);

  const writeBindings = () => {
    for (const geo of setup.boundGeos) {
      const pos = geo.getAttribute("position");
      if (pos) pos.needsUpdate = true;
    }
  };

  useFrame((state, delta) => {
    const d = Math.min(delta, 0.05);
    const s = useStudio.getState();
    const dt = s.slowMo ? d * 0.38 : d;
    if (s.shakeNonce !== lastShake.current) {
      lastShake.current = s.shakeNonce;
      setup.skeleton.shake(0.08);
    }
    if (s.resetNonce !== lastReset.current) {
      lastReset.current = s.resetNonce;
      setup.skeleton.reset();
      setup.gutHealth.reset();
      setup.fist.reset();
      setup.knife.reset();
      bayonetPenRef.current = 0;
      useStudio.getState().setBayonetHasEntry(false);
      useStudio.getState().setBayonetPen(0);
      gutExc.current = 0;
    }
    if (s.strikeNonce !== lastStrike.current) {
      lastStrike.current = s.strikeNonce;
      const p = s.strikePoint;
      const ox = p ? p[0] : setup.navel.x;
      const oy = p ? p[1] : setup.navel.y;
      const oz = p ? p[2] : setup.navel.z;
      setup.skeleton.impulse(ox, oy, oz, s.strikeForce, s.strikeRange);
      setup.strike.fire(ox, oy, oz, s.strikeForce, s.strikeRange);
      setup.gutHealth.hit(ox, oy, oz, s.strikeForce, s.strikeRange);
      gutExc.current = Math.min(0.35, gutExc.current + 0.08 + s.strikeForce * 0.14);
    }
    if (s.expression !== exprRef.current) {
      exprRef.current = s.expression;
      setup.skeleton.setExpression(s.expression);
    }
    if (s.pose !== poseRef.current) {
      poseRef.current = s.pose;
      setup.skeleton.setPose(s.pose);
    }
    if (s.handGestureL !== gestLRef.current) {
      gestLRef.current = s.handGestureL;
      setup.skeleton.setHandGesture("L", s.handGestureL);
    }
    if (s.handGestureR !== gestRRef.current) {
      gestRRef.current = s.handGestureR;
      setup.skeleton.setHandGesture("R", s.handGestureR);
    }

    const ctrl = controlsRef.current;
    camera.getWorldDirection(_camDir);
    const az = ctrl ? ctrl.getAzimuthalAngle() : Math.atan2(_camDir.x, _camDir.z);
    const pol = ctrl ? ctrl.getPolarAngle() : Math.acos(THREE.MathUtils.clamp(_camDir.y, -1, 1));
    if (lastAz.current === null) {
      lastAz.current = az;
      lastPol.current = pol;
    }
    const invDt = 1 / Math.max(dt, 1e-4);
    setup.skeleton.pushViewSpin(
      THREE.MathUtils.clamp((az - lastAz.current) * invDt, -14, 14),
      THREE.MathUtils.clamp((pol - (lastPol.current ?? pol)) * invDt, -10, 10),
    );
    lastAz.current = az;
    lastPol.current = pol;

    if (grab.current?.active) {
      camera.getWorldDirection(_camDir);
      _plane.setFromNormalAndCoplanarPoint(_camDir, grab.current.planePoint);
      _ndc.copy(pointer);
      raycaster.setFromCamera(_ndc, camera);
      _ray.copy(raycaster.ray);
      const o = grab.current.origin;
      const bone = grab.current.bone;
      if (_ray.intersectPlane(_plane, _target)) {
        if (grab.current.mode === "fist") {
          setup.fist.dragTo(o, _target);
          grab.current.origin.copy(_target);
          grab.current.planePoint.copy(_target);
        } else if (grab.current.mode === "bayonet") {
          _plane.setFromNormalAndCoplanarPoint(_camDir, setup.knife.handle);
          if (_ray.intersectPlane(_plane, _target)) {
            setup.knife.dragTo(_target);
            grab.current.origin.copy(setup.knife.handle);
            grab.current.planePoint.copy(setup.knife.handle);
            const t = setup.knife.pen01();
            bayonetPenRef.current = t;
            s.setBayonetPen(t);
          }
        } else if (grab.current.mode === "pose") {
          const kind = grab.current.poseKind ?? "ik";
          if (kind === "rotate" && grab.current.axis) {
            _plane.setFromNormalAndCoplanarPoint(grab.current.axis, setup.skeleton.bonePos(bone));
            if (_ray.intersectPlane(_plane, _target)) setup.skeleton.updateRotateDrag(_target);
          } else if (kind === "move" && grab.current.axis) {
            if (_ray.intersectPlane(_plane, _target)) setup.skeleton.updateMoveDrag(_target);
          } else {
            setup.skeleton.setPoseDrag(bone, o.x, o.y, o.z, _target.x, _target.y, _target.z);
          }
        } else {
          setup.skeleton.setTissueDrag(o.x, o.y, o.z, _target.x, _target.y, _target.z, 0.16);
        }
        if (pokeRef.current) {
          pokeRef.current.position.copy(_target);
          pokeRef.current.visible = true;
        }
      }
    }

    setup.fist.setEnabled(s.interactMode === "fist");
    setup.fist.setMaxScale(s.fistMaxDepth);
    setup.knife.setEnabled(s.interactMode === "bayonet");
    setup.knife.setKind(s.bayonetKind);
    setup.knife.syncWounds(s.abdomenXray);
    if (controlsRef.current) {
      controlsRef.current.enableZoom = !(
        rmbDown.current &&
        s.interactMode === "bayonet" &&
        setup.knife.hasEntry
      );
    }
    if (!s.bayonetHasEntry && setup.knife.hasEntry) {
      setup.knife.releaseEntry();
    }
    const grabbingKnife = grab.current?.mode === "bayonet";
    const animating = s.bayonetPump || setup.knife.isAuto;
    if (s.interactMode === "bayonet" && setup.knife.hasEntry && !grabbingKnife && !animating) {
      if (Math.abs(s.bayonetPen - bayonetPenRef.current) > 1e-4) {
        bayonetPenRef.current = s.bayonetPen;
        setup.knife.setPen01(s.bayonetPen);
      }
    }
    if (s.interactMode === "bayonet") {
      const sq = setup.knife.squeezeTarget();
      if (sq && grab.current?.mode !== "pose" && grab.current?.mode !== "drag") {
        setup.skeleton.setTissueDrag(sq.gx, sq.gy, sq.gz, sq.tx, sq.ty, sq.tz, sq.radius);
      } else if (!sq && grab.current?.mode !== "pose" && grab.current?.mode !== "drag") {
        setup.skeleton.clearHold();
      }
    }
    const autoFist = s.fistThrust || s.fistStir;
    if (s.gazeFollow) {
      _target.copy(camera.position);
      setup.root.worldToLocal(_target);
      setup.skeleton.setGazeTarget(_target);
    } else {
      setup.skeleton.setGazeTarget(null);
    }
    setup.fist.step(dt, {
      thrust: s.fistThrust,
      stir: s.fistStir,
      thrustSpeed: s.fistThrustSpeed,
      thrustStart: s.fistThrustStart,
      stirSpeed: s.fistStirSpeed,
      stirRadius: s.fistStirRadius,
    });
    const fistBelly = setup.fist.belly();
    setup.skeleton.step(dt, {
      stiffness: s.stiffness,
      damping: s.damping,
      jiggle: s.jiggle,
      gravity: s.gravity,
      wind: s.wind,
      time: state.clock.elapsedTime,
      breathing: s.breathing,
      breathAmp: s.breathAmp,
      breathSpeed: s.breathSpeed,
      breathBoost: setup.fist.arousal,
      rebound: s.strikeRebound,
      inflate: s.bellyInflate,
      fistDepth: fistBelly.depth,
      fistStart: fistBelly.start,
      fistTx: fistBelly.x,
      fistTy: fistBelly.y,
      fistTz: fistBelly.z,
      fistLx: fistBelly.lx,
      fistLz: fistBelly.lz,
      fistBulge: s.fistBulge,
      fistSpread: s.fistSpread,
      fistLever: s.fistLever,
      fistRise: s.fistRise,
      breastSoft: s.breastSoft,
      breastDamp: s.breastDamp,
      hairDamp: s.hairDamp,
      breastInertia: s.breastInertia,
      hairInertia: s.hairInertia,
      blinkEnabled: s.blinkEnabled,
      eyeOpenL: s.eyeOpenL,
      eyeOpenR: s.eyeOpenR,
      blinkRate: s.blinkRate,
      blinkSpeed: s.blinkSpeed,
      mouthOpen: s.mouthOpen,
      mouthAmp: s.mouthAmp,
      mouthChinAmp: s.mouthChinAmp,
      mouthLipAmp: s.mouthLipAmp,
      mouthSmile: s.mouthSmile,
      mouthPucker: s.mouthPucker,
      mouthWidth: s.mouthWidth,
    });
    applyNavelMorph(setup.navelMorph, s.navelDepth, s.navelDiameter);
    gutExc.current += (0 - gutExc.current) * (1 - Math.exp(-0.42 * dt));
    {
      const g = gutExc.current;
      setup.peristalsis.apply(state.clock.elapsedTime, s.gutAmp * (1 + g * 0.38), s.gutSpeed * (1 + g * 0.3));
    }
    inflateGuts(setup.gutRoot, setup.navel, s.bellyInflate);
    setup.strike.step(dt);
    setup.strike.apply(s.strikeRebound);
    setup.fist.apply(s.fistGut, autoFist);
    setup.knife.apply(dt, s.fistGut, setup.gutHealth, {
      pump: s.bayonetPump,
      grabbing: grabbingKnife,
    });
    if (setup.knife.consumeAutoReleased()) {
      bayonetPenRef.current = 0;
      useStudio.setState({ bayonetHasEntry: false, bayonetPen: 0 });
    } else if ((s.bayonetPump || setup.knife.isAuto) && setup.knife.hasEntry) {
      const t = setup.knife.pen01();
      if (Math.abs(t - s.bayonetPen) > 0.012) {
        bayonetPenRef.current = t;
        s.setBayonetPen(t);
      }
    }
    if (setup.knife.consumePunctureEvent()) {
      const e = setup.knife.entry;
      const ddir = setup.knife.dir;
      setup.skeleton.impulse(e.x, e.y, e.z, 0.42, 0.28);
      for (let i = 1; i <= 5; i++) {
        const t = (setup.knife.penetration * i) / 5;
        setup.gutHealth.hit(e.x + ddir.x * t, e.y + ddir.y * t, e.z + ddir.z * t, 0.38, 0.32);
      }
      gutExc.current = Math.min(0.35, gutExc.current + 0.12);
    }
    setup.gutHealth.applyColor();
    setup.gutHealth.updateBars(camera, s.showGutHp);
    const ring = ringRef.current;
    if (ring) {
      if (setup.strike.lastOrigin(_center)) {
        ring.position.copy(_center);
        ring.position.z += 0.012;
        const rr = Math.max(0.02, setup.strike.ringRadius());
        ring.scale.set(rr, rr, 1);
        const mat = ring.material as THREE.MeshBasicMaterial;
        mat.opacity = setup.strike.ringOpacity();
        ring.visible = mat.opacity > 0.02;
      } else {
        ring.visible = false;
      }
    }

    energyTick.current += 1;
    writeBindings();
    if (energyTick.current % 8 === 0) s.setEnergy(setup.skeleton.energy);
    const deforming =
      Boolean(grab.current?.active) ||
      setup.skeleton.hasDents ||
      Math.abs(s.bellyInflate) > 0.04 ||
      s.navelDepth > 0.03 ||
      s.navelDiameter > 0.03;
    if (deforming || energyTick.current % 2 === 0) {
      for (const geo of setup.boundGeos) {
        geo.computeVertexNormals();
      }
    }

    const xray = s.abdomenXray;
    for (const mat of setup.xrayList) {
      const shader = mat.userData.shader as { uniforms?: { uXray?: { value: number } } } | undefined;
      if (shader?.uniforms?.uXray) shader.uniforms.uXray.value = xray;
      if (mat.transparent) {
        mat.depthWrite = false;
        mat.depthTest = true;
        mat.side = THREE.FrontSide;
      } else {
        mat.transparent = false;
        mat.depthWrite = true;
        mat.depthTest = true;
        mat.side = THREE.FrontSide;
      }
    }
    for (const ov of setup.xrayOverlays) ov.visible = xray > 0.03 && !s.showWeights;
    setup.gutRoot.visible = s.showOrgans;
    setup.pelvisRoot.visible = s.showOrgans;
    setup.bellyLight.intensity = s.showOrgans && xray > 0.08 ? 0.05 + xray * 0.06 : 0;
    if (s.showOrgans && energyTick.current % 3 === 0) {
      setup.gutRoot.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh || !mesh.geometry) return;
        mesh.geometry.computeVertexNormals();
      });
    }

    const poseOn = s.interactMode === "pose";
    setup.boneVis.visible = s.showLattice;
    if (s.showLattice) {
      const jp = setup.skeleton.jointPositions(setup.jointBuf);
      const sel = s.selectedBone;
      for (let i = 0; i < setup.joints.length; i++) {
        setup.joints[i]!.position.set(jp[i * 3]!, jp[i * 3 + 1]!, jp[i * 3 + 2]!);
        setup.joints[i]!.material = i === sel ? setup.jointSel : setup.jointMat;
      }
      const lp = setup.boneLines.geometry.getAttribute("position") as THREE.BufferAttribute;
      setup.skeleton.writeBoneLines(lp.array as Float32Array);
      lp.needsUpdate = true;
    }
    const gz = setup.gizmo;
    if (poseOn && s.selectedBone >= 0 && s.poseEditMode !== "ik") {
      gz.visible = true;
      gz.position.copy(setup.skeleton.bonePos(s.selectedBone));
      gz.quaternion.copy(setup.skeleton.boneRot(s.selectedBone));
      const rot = s.poseEditMode === "rotate";
      for (const r of setup.rotRings) r.visible = rot;
      for (const a of setup.moveArrows) a.visible = !rot;
    } else {
      gz.visible = false;
    }
    for (const v of setup.weightViews) {
      v.mesh.material = s.showWeights ? v.weight : v.orig;
    }
    const vela = (window as unknown as { __vela?: Record<string, unknown> }).__vela;
    if (vela) {
      vela.frameFace = () => {
        const head = setup.skeleton.names.indexOf("C_Head_a");
        const p = head >= 0 ? setup.skeleton.bonePos(head).clone() : new THREE.Vector3(0, 1.5, 0.04);
        const target = new THREE.Vector3(p.x, p.y - 0.015, p.z + 0.05);
        const pos = new THREE.Vector3(p.x, p.y + 0.02, p.z + 0.18);
        camera.position.copy(pos);
        camera.lookAt(target);
        const c = controlsRef.current;
        if (c) {
          c.enabled = false;
          c.target.copy(target);
        }
        return { pos: camera.position.toArray(), target: target.toArray(), head: p.toArray() };
      };
      vela.lidDebug = () => setup.skeleton.lidDebug();
      vela.setBlink = (v: number) => {
        setup.skeleton.setBlink(v);
        return v;
      };
      vela.blinkNow = () => setup.skeleton.blinkNow();
      vela.frameBelly = () => {
        camera.position.set(0.12, 1.05, 0.68);
        camera.lookAt(setup.navel.x, setup.navel.y, setup.navel.z);
        if (controlsRef.current) {
          controlsRef.current.target.copy(setup.navel);
          controlsRef.current.update();
        }
      };
      vela.frameNavel = () => {
        const n = setup.navel;
        camera.position.set(n.x + 0.02, n.y + 0.01, n.z + 0.11);
        camera.lookAt(n.x, n.y, n.z);
        if (controlsRef.current) {
          controlsRef.current.target.copy(n);
          controlsRef.current.update();
        }
        return n.toArray();
      };
      vela.setParam = (key: string, value: number) => {
        useStudio.getState().setParam(key as "navelDepth", value);
        return useStudio.getState()[key as "navelDepth"];
      };
      vela.frameBack = () => {
        camera.position.set(-0.08, 1.08, -0.55);
        camera.lookAt(setup.navel.x, setup.navel.y, setup.navel.z);
        if (controlsRef.current) {
          controlsRef.current.target.copy(setup.navel);
          controlsRef.current.update();
        }
      };
      vela.tiltBayonet = (x: number, y: number, z: number) => {
        setup.knife.dragTo(new THREE.Vector3(x, y, z));
        const ang = THREE.MathUtils.radToDeg(setup.knife.dir.angleTo(setup.knife.restAxis));
        return {
          dir: setup.knife.dir.toArray(),
          restAxis: setup.knife.restAxis.toArray(),
          angleDeg: +ang.toFixed(2),
        };
      };
      vela.driveBayonet = (pen: number) => {
        setup.knife.setEnabled(true);
        if (!setup.knife.hasEntry) setup.knife.pick(setup.navel, new THREE.Vector3(0, 0, 1));
        setup.knife.setRawPen(pen);
        const t = setup.knife.pen01();
        bayonetPenRef.current = t;
        useStudio.setState({
          interactMode: "bayonet",
          bayonetHasEntry: true,
          showOrgans: true,
          abdomenXray: Math.max(0.38, useStudio.getState().abdomenXray),
          showGutHp: true,
          bayonetPen: t,
        });
        return {
          hasEntry: setup.knife.hasEntry,
          punctured: setup.knife.punctured,
          penetration: setup.knife.penetration,
          rawPen: setup.knife.rawPen,
          enabled: setup.knife.enabled,
          storePen: t,
          wounds: setup.knife.wounds.children.length,
          kind: setup.knife.kind,
          bladeLen: setup.knife.bladeLen,
          totalLen: setup.knife.totalLen,
          maxPen: setup.knife.maxPen,
        };
      };
      vela.setBayonetKind = (kind: "short" | "long") => {
        setup.knife.setKind(kind);
        useStudio.setState({ bayonetKind: kind, interactMode: "bayonet" });
        return {
          kind: setup.knife.kind,
          bladeLen: setup.knife.bladeLen,
          totalLen: setup.knife.totalLen,
          maxPen: setup.knife.maxPen,
        };
      };
      vela.pickBayonet = (dx: number, dy: number, dz: number) => {
        const p = setup.navel.clone().add(new THREE.Vector3(dx, dy, dz));
        setup.knife.setEnabled(true);
        setup.knife.pick(p, new THREE.Vector3(0, 0, 1));
        bayonetPenRef.current = 0;
        useStudio.setState({
          interactMode: "bayonet",
          bayonetHasEntry: true,
          bayonetPen: 0,
          showOrgans: true,
          abdomenXray: Math.max(0.38, useStudio.getState().abdomenXray),
          showGutHp: true,
        });
        return { entry: setup.knife.entry.toArray(), wounds: setup.knife.wounds.children.length };
      };
      vela.nextStab = () => {
        setup.knife.releaseEntry();
        bayonetPenRef.current = 0;
        useStudio.setState({ bayonetHasEntry: false, bayonetPen: 0 });
        return { wounds: setup.knife.wounds.children.length, hasEntry: setup.knife.hasEntry };
      };
      if (energyTick.current % 2 === 0) {
        let minHp = 1;
        for (let i = 0; i < setup.gutHealth.hp.length; i++) {
          minHp = Math.min(minHp, setup.gutHealth.hp[i]!);
        }
        vela.bayonet = {
          hasEntry: setup.knife.hasEntry,
          punctured: setup.knife.punctured,
          penetration: +setup.knife.penetration.toFixed(3),
          squeeze: +setup.knife.squeeze.toFixed(3),
          rawPen: +setup.knife.rawPen.toFixed(3),
          kind: setup.knife.kind,
          bladeLen: +setup.knife.bladeLen.toFixed(3),
          totalLen: +setup.knife.totalLen.toFixed(3),
          maxPen: +setup.knife.maxPen.toFixed(3),
          entry: setup.knife.entry.toArray(),
          tip: setup.knife.tip.toArray(),
          handle: setup.knife.handle.toArray(),
          dir: setup.knife.dir.toArray(),
          restAxis: setup.knife.restAxis.toArray(),
          edge: setup.knife.edgeWorld.toArray(),
          cone: 30,
          wounds: setup.knife.wounds.children.length,
          wound0: setup.knife.wounds.children[0]
            ? (() => {
                const m = setup.knife.wounds.children[0] as THREE.Mesh;
                const p = m.geometry.getAttribute("position");
                return p ? [p.getX(0), p.getY(0), p.getZ(0)] : m.position.toArray();
              })()
            : null,
          wound1: setup.knife.wounds.children[1]
            ? (() => {
                const m = setup.knife.wounds.children[1] as THREE.Mesh;
                const p = m.geometry.getAttribute("position");
                return p ? [p.getX(0), p.getY(0), p.getZ(0)] : m.position.toArray();
              })()
            : null,
          minHp: +minHp.toFixed(3),
        };
      }
    }
  });

  const latticeGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(setup.skeleton.count * 3), 3));
    return g;
  }, [setup]);

  const boneGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(setup.skeleton.boneLineCount() * 2 * 3), 3),
    );
    return g;
  }, [setup]);

  const beginGrab = (
    point: THREE.Vector3,
    normal: THREE.Vector3,
    mode: "pose" | "drag" | "fist" | "bayonet",
    bone = -1,
    poseKind?: "ik" | "rotate" | "move",
    axis?: THREE.Vector3,
  ) => {
    grab.current = {
      active: true,
      mode,
      poseKind,
      origin: point.clone(),
      planePoint: point.clone(),
      normal: normal.clone().normalize(),
      bone: bone >= 0 ? bone : setup.skeleton.pickBone(point.x, point.y, point.z),
      axis: axis?.clone(),
    };
    useStudio.getState().setGrabbing(true);
    gl.domElement.style.cursor = "grabbing";
    if (pokeRef.current) {
      pokeRef.current.position.copy(point);
      pokeRef.current.lookAt(point.clone().add(normal));
      pokeRef.current.visible = true;
    }
  };

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0 && e.nativeEvent.button !== 0) return;
    e.stopPropagation();
    _hit.copy(e.point);
    const st = useStudio.getState();
    const mode = st.interactMode;
    if (mode === "strike") {
      useStudio.getState().fireStrike([_hit.x, _hit.y, _hit.z]);
      return;
    }
    if (mode === "fist") {
      beginGrab(_hit, _normal.set(0, 0, 1), "fist");
      return;
    }
    if (e.face) {
      _normal.copy(e.face.normal).transformDirection(e.object.matrixWorld).normalize();
    } else {
      _normal.set(0, 0, 1);
    }
    if (mode === "bayonet") {
      if (!setup.knife.hasEntry) {
        camera.getWorldDirection(_camDir);
        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObjects(setup.torsoMeshes, false);
        const hit = hits.find((h) => h.face && h.distance > 0.001);
        if (!hit?.face) return;
        _hit.copy(hit.point);
        _normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld).normalize();
        if (_normal.dot(_camDir) > 0) _normal.negate();
        setup.knife.pick(_hit, _normal, hit.object as THREE.Mesh, hit.faceIndex ?? -1);
        bayonetPenRef.current = 0;
        st.setBayonetHasEntry(true);
        st.setBayonetPen(0);
        if (st.bayonetAuto && !st.bayonetPump) setup.knife.beginAuto();
        if (pokeRef.current) {
          pokeRef.current.position.copy(_hit);
          pokeRef.current.visible = true;
        }
        return;
      }
      beginGrab(setup.knife.handle, _normal, "bayonet");
      return;
    }
    if (mode === "pose") {
      camera.getWorldDirection(_camDir);
      raycaster.setFromCamera(pointer, camera);
      const gizHits = raycaster.intersectObjects([...setup.rotRings, ...setup.moveArrows], true);
      const giz = gizHits.find((h) => h.object.userData.gizmo);
      if (giz && st.selectedBone >= 0) {
        const axisKey = giz.object.userData.axis as "x" | "y" | "z";
        const local =
          axisKey === "x" ? new THREE.Vector3(1, 0, 0) : axisKey === "y" ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
        const world = local.clone().applyQuaternion(setup.skeleton.boneRot(st.selectedBone)).normalize();
        const joint = setup.skeleton.bonePos(st.selectedBone);
        if (String(giz.object.userData.gizmo).startsWith("r")) {
          _plane.setFromNormalAndCoplanarPoint(world, joint);
          const hitp = raycaster.ray.intersectPlane(_plane, new THREE.Vector3()) ?? giz.point;
          const dir = hitp.clone().sub(joint);
          dir.sub(world.clone().multiplyScalar(dir.dot(world)));
          if (dir.lengthSq() < 1e-8) dir.crossVectors(world, _camDir).normalize();
          setup.skeleton.setRotateDrag(st.selectedBone, local, world, dir);
          beginGrab(hitp, world, "pose", st.selectedBone, "rotate", world);
        } else {
          setup.skeleton.setMoveDrag(st.selectedBone, world, giz.point);
          beginGrab(giz.point, _camDir.clone().negate(), "pose", st.selectedBone, "move", world);
        }
        return;
      }
      let bone = setup.skeleton.pickBoneByRay(raycaster.ray.origin, raycaster.ray.direction);
      if (bone < 0) bone = setup.skeleton.pickBoneWorld(_hit.x, _hit.y, _hit.z);
      if (bone < 0) return;
      st.setSelectedBone(bone, setup.skeleton.names[bone]);
      if (st.poseEditMode === "ik") {
        const jp = setup.skeleton.bonePos(bone);
        beginGrab(jp, _camDir.clone().negate(), "pose", bone, "ik");
        setup.skeleton.setPoseDrag(bone, jp.x, jp.y, jp.z, jp.x, jp.y, jp.z);
      }
      return;
    }
    beginGrab(_hit, _normal, "drag");
  };

  const midY = (setup.y0 + setup.y1) * 0.5;
  const ab = setup.abdomen;

  return (
    <group>
      <primitive
        object={setup.root}
        onPointerDown={onPointerDown}
        onPointerOver={() => {
          const m = useStudio.getState().interactMode;
          gl.domElement.style.cursor = m === "strike" || (m === "bayonet" && !setup.knife.hasEntry) ? "crosshair" : "grab";
        }}
        onPointerOut={() => {
          if (!grab.current) gl.domElement.style.cursor = "default";
        }}
      />
      <mesh
        position={[0, midY, ab.max.z + 0.01]}
        onPointerDown={onPointerDown}
        onPointerOver={() => {
          const m = useStudio.getState().interactMode;
          gl.domElement.style.cursor = m === "strike" || (m === "bayonet" && !setup.knife.hasEntry) ? "crosshair" : "grab";
        }}
        onPointerOut={() => {
          if (!grab.current) gl.domElement.style.cursor = "default";
        }}
      >
        <boxGeometry args={[Math.max(0.28, ab.max.x - ab.min.x + 0.12), Math.max(0.55, setup.y1 - setup.y0 + 0.35), 0.14]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <points ref={latticeRef} geometry={latticeGeo} visible={false} renderOrder={20}>
        <pointsMaterial color="#f2efe9" size={0.018} sizeAttenuation depthTest={false} />
      </points>
      <lineSegments ref={bonesRef} geometry={boneGeo} visible={false} renderOrder={19}>
        <lineBasicMaterial color="#d4b5a0" depthTest={false} />
      </lineSegments>
      <mesh ref={pokeRef} visible={false} renderOrder={10}>
        <ringGeometry args={[0.024, 0.036, 28]} />
        <meshBasicMaterial color="#d4b5a0" transparent opacity={0.8} side={THREE.DoubleSide} depthTest={false} />
      </mesh>
      <mesh ref={ringRef} visible={false} renderOrder={12}>
        <ringGeometry args={[0.92, 1, 48]} />
        <meshBasicMaterial color="#f2efe9" transparent opacity={0} side={THREE.DoubleSide} depthTest={false} />
      </mesh>
    </group>
  );
}
