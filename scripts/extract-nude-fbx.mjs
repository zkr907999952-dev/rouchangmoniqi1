import { readFileSync, writeFileSync } from "fs";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

globalThis.self = globalThis;
if (!globalThis.URL.createObjectURL) {
  globalThis.URL.createObjectURL = () => "blob:fake";
  globalThis.URL.revokeObjectURL = () => {};
}

function loadFbx(path) {
  const buf = readFileSync(path);
  return new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "");
}

function loadGltf(path) {
  const buf = readFileSync(path);
  return new Promise((res, rej) => {
    new GLTFLoader().parse(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      "",
      (g) => res(g.scene),
      rej,
    );
  });
}

function standingMatrix(root, targetHeight) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const eul = new THREE.Euler(0, 0, 0);
  if (size.z > size.x * 1.2) eul.y += center.x < 0.2 ? -Math.PI / 2 : Math.PI / 2;
  const R = new THREE.Matrix4().makeRotationFromEuler(eul);
  const corners = [
    new THREE.Vector3(box.min.x, box.min.y, box.min.z),
    new THREE.Vector3(box.min.x, box.min.y, box.max.z),
    new THREE.Vector3(box.min.x, box.max.y, box.min.z),
    new THREE.Vector3(box.min.x, box.max.y, box.max.z),
    new THREE.Vector3(box.max.x, box.min.y, box.min.z),
    new THREE.Vector3(box.max.x, box.min.y, box.max.z),
    new THREE.Vector3(box.max.x, box.max.y, box.min.z),
    new THREE.Vector3(box.max.x, box.max.y, box.max.z),
  ];
  const tmp = new THREE.Box3();
  tmp.makeEmpty();
  for (const c of corners) tmp.expandByPoint(c.clone().applyMatrix4(R));
  const size2 = tmp.getSize(new THREE.Vector3());
  if (size2.z > size2.y * 1.25) {
    eul.x += -Math.PI / 2;
    R.makeRotationFromEuler(eul);
    tmp.makeEmpty();
    for (const c of corners) tmp.expandByPoint(c.clone().applyMatrix4(R));
  }
  const size3 = tmp.getSize(new THREE.Vector3());
  const s = targetHeight / Math.max(size3.y, 0.001);
  const S = new THREE.Matrix4().makeScale(s, s, s);
  const RS = new THREE.Matrix4().multiplyMatrices(S, R);
  tmp.makeEmpty();
  for (const c of corners) tmp.expandByPoint(c.clone().applyMatrix4(RS));
  const c4 = tmp.getCenter(new THREE.Vector3());
  const T = new THREE.Matrix4().makeTranslation(-c4.x, -tmp.min.y, -c4.z);
  return T.multiply(RS);
}

function fitStanding(root, targetHeight) {
  const M = standingMatrix(root, targetHeight);
  root.applyMatrix4(M);
  root.updateMatrixWorld(true);
}

function isClothes(name) {
  return /Prpl|Suspender|Weapon|KDI|^Trans$|^C_CharaA|Earring/.test(name);
}

function classify(name) {
  if (/Foot|Toe/.test(name)) return "foot";
  if (/Hair|hair/.test(name)) return "hair";
  if (
    /Face|Lip|Eye|Brow|Cheek|Nose|Chin|Tong|Forehead|Fold|Laugh|Glabella|Zygoma|Gonion|Eyebag|Dcor|Ucor|teeth|Teeth|Ulid|Dlid|Ulash|Throat|Ulip|Dlip|Ex_/.test(
      name,
    )
  )
    return "face";
  return "body";
}

function radius(name) {
  if (/Hip|Spine_a|Spine_b/.test(name)) return 0.09;
  if (/Spine|Head/.test(name)) return 0.07;
  if (/UpperArm|UpperLeg|Foreleg|Forearm/.test(name)) return 0.055;
  if (/Hand|Foot|Shoulder/.test(name)) return 0.04;
  if (/Breast/.test(name)) return 0.05;
  if (/Thumb|Index|Middle|Ring|Pinky/.test(name)) return 0.018;
  if (/hair/i.test(name)) return 0.11;
  return 0.03;
}

function maxAng(name) {
  if (/UpperArm|Forearm|Hand|UpperLeg|Foreleg|Thumb|Index|Middle|Ring|Pinky/.test(name)) return 1.45;
  if (/Spine|Hip|Neck|Head|Shoulder/.test(name)) return 0.85;
  if (/hair/i.test(name)) return 1.1;
  return 0.55;
}

function keepBone(name) {
  if (isClothes(name)) return false;
  if (/_End$/.test(name)) return false;
  if (/W_Spo|W_End/.test(name)) return false;
  if (/Deltoid|Forearmroll|Wrist_Spo|Elbow_Spo|Knee_Spo|Femoris|Calf|Hip_Spo|ShoulderSub|Bust_Spo/.test(name))
    return false;
  if (/Hair[BCD]_/.test(name)) return false;
  if (/L_Hair|R_Hair/.test(name)) return false;
  return true;
}

const fbx = loadFbx("/workspace/attachments/Tifa_4K_Nude_Base.fbx");
const tifa = await loadGltf("/workspace/public/models/tifa.glb");
fbx.updateMatrixWorld(true);
const Mf = standingMatrix(fbx, 1.66);
fitStanding(tifa, 1.66);

let skinned = null;
fbx.traverse((o) => {
  if (!skinned && o.isSkinnedMesh && o.skeleton) skinned = o;
});
if (!skinned) throw new Error("no skinned mesh");
const skel = skinned.skeleton;

const parentOf = {};
const rawPos = {};
const wp = new THREE.Vector3();
for (const b of skel.bones) {
  parentOf[b.name] = b.parent && b.parent.isBone ? b.parent.name : null;
  b.getWorldPosition(wp);
  wp.applyMatrix4(Mf);
  rawPos[b.name] = wp.clone();
}

const keep = [];
for (const b of skel.bones) {
  if (!keepBone(b.name)) continue;
  const wp2 = rawPos[b.name];
  let p = parentOf[b.name];
  while (p && !keepBone(p)) p = parentOf[p];
  keep.push({
    name: b.name,
    parent: p && keepBone(p) ? p : b.name === "C_Hip_a" ? null : "C_Hip_a",
    x: +wp2.x.toFixed(5),
    y: +wp2.y.toFixed(5),
    z: +wp2.z.toFixed(5),
    radius: radius(b.name),
    maxAng: maxAng(b.name),
    group: classify(b.name),
  });
}
if (keep[0]) keep[0].parent = null;
const keepIndex = {};
keep.forEach((b, i) => {
  keepIndex[b.name] = i;
});
for (const b of keep) {
  if (b.parent && keepIndex[b.parent] === undefined) b.parent = "C_Hip_a";
  if (b.name === "C_Hip_a") b.parent = null;
}

const fullToKeep = new Int16Array(skel.bones.length);
for (let i = 0; i < skel.bones.length; i++) {
  let n = skel.bones[i].name;
  while (n && keepIndex[n] === undefined) n = parentOf[n];
  fullToKeep[i] = n && keepIndex[n] !== undefined ? keepIndex[n] : 0;
}

const fbxPos = skinned.geometry.getAttribute("position");
const fbxSi = skinned.geometry.getAttribute("skinIndex");
const fbxSw = skinned.geometry.getAttribute("skinWeight");
const nF = fbxPos.count;
const srcP = new Float32Array(nF * 3);
const srcI = new Uint16Array(nF * 4);
const srcW = new Float32Array(nF * 4);
const v = new THREE.Vector3();
skinned.updateWorldMatrix(true, false);
for (let i = 0; i < nF; i++) {
  v.fromBufferAttribute(fbxPos, i);
  skinned.localToWorld(v);
  v.applyMatrix4(Mf);
  srcP[i * 3] = v.x;
  srcP[i * 3 + 1] = v.y;
  srcP[i * 3 + 2] = v.z;
  const acc = new Map();
  for (let k = 0; k < 4; k++) {
    const w = fbxSw.getComponent(i, k);
    if (w < 1e-4) continue;
    const ki = fullToKeep[fbxSi.getComponent(i, k)];
    acc.set(ki, (acc.get(ki) || 0) + w);
  }
  const entries = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  let sum = 0;
  for (const e of entries) sum += e[1];
  if (sum < 1e-6) {
    srcI[i * 4] = 0;
    srcW[i * 4] = 1;
    continue;
  }
  for (let k = 0; k < 4; k++) {
    srcI[i * 4 + k] = entries[k] ? entries[k][0] : 0;
    srcW[i * 4 + k] = entries[k] ? entries[k][1] / sum : 0;
  }
}

const cell = 0.03;
const hash = new Map();
const key = (x, y, z) => `${Math.floor(x / cell)}_${Math.floor(y / cell)}_${Math.floor(z / cell)}`;
for (let i = 0; i < nF; i++) {
  const k = key(srcP[i * 3], srcP[i * 3 + 1], srcP[i * 3 + 2]);
  const arr = hash.get(k);
  if (arr) arr.push(i);
  else hash.set(k, [i]);
}

function nearest(x, y, z) {
  const cx = Math.floor(x / cell);
  const cy = Math.floor(y / cell);
  const cz = Math.floor(z / cell);
  let best = -1;
  let bestD = Infinity;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        const bucket = hash.get(`${cx + dx}_${cy + dy}_${cz + dz}`);
        if (!bucket) continue;
        for (const id of bucket) {
          const d =
            (srcP[id * 3] - x) ** 2 + (srcP[id * 3 + 1] - y) ** 2 + (srcP[id * 3 + 2] - z) ** 2;
          if (d < bestD) {
            bestD = d;
            best = id;
          }
        }
      }
    }
  }
  return best;
}

const maps = {};
tifa.traverse((o) => {
  if (!o.isMesh || !o.geometry) return;
  const pos = o.geometry.getAttribute("position");
  if (!pos) return;
  const mat = Array.isArray(o.material) ? o.material[0] : o.material;
  const matName = (mat?.name || o.name || "").toLowerCase();
  if (matName.startsWith(".")) return;
  const n = pos.count;
  const index = new Array(n * 4);
  const weight = new Array(n * 4);
  o.updateWorldMatrix(true, false);
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i);
    o.localToWorld(v);
    const id = nearest(v.x, v.y, v.z);
    const o4 = i * 4;
    if (id < 0) {
      index[o4] = 0;
      weight[o4] = 1;
      index[o4 + 1] = index[o4 + 2] = index[o4 + 3] = 0;
      weight[o4 + 1] = weight[o4 + 2] = weight[o4 + 3] = 0;
      continue;
    }
    index[o4] = srcI[id * 4];
    index[o4 + 1] = srcI[id * 4 + 1];
    index[o4 + 2] = srcI[id * 4 + 2];
    index[o4 + 3] = srcI[id * 4 + 3];
    weight[o4] = +srcW[id * 4].toFixed(5);
    weight[o4 + 1] = +srcW[id * 4 + 1].toFixed(5);
    weight[o4 + 2] = +srcW[id * 4 + 2].toFixed(5);
    weight[o4 + 3] = +srcW[id * 4 + 3].toFixed(5);
  }
  maps[`${matName}:${n}`] = { count: n, key: matName, index, weight };
});

console.log("bones", keep.length);
console.log("maps", Object.keys(maps));
console.log("hip", keep.find((b) => b.name === "C_Hip_a"));
console.log("head", keep.find((b) => b.name === "C_Head_a"));
console.log("lArm", keep.find((b) => b.name === "L_UpperArm_a"));
console.log("rArm", keep.find((b) => b.name === "R_UpperArm_a"));
writeFileSync("/workspace/src/lib/softbody/nude-rig-data.json", JSON.stringify({ bones: keep, maps }));
console.log("wrote");
