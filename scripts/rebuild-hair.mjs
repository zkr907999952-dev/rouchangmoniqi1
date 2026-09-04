import { readFileSync, writeFileSync } from "fs";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

globalThis.self = globalThis;
if (!globalThis.URL.createObjectURL) {
  globalThis.URL.createObjectURL = () => "blob:fake";
  globalThis.URL.revokeObjectURL = () => {};
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

function fitStanding(root, targetHeight) {
  root.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(root);
  let size = box.getSize(new THREE.Vector3());
  let center = box.getCenter(new THREE.Vector3());
  if (size.z > size.x * 1.2) {
    root.rotation.y += center.x < 0.2 ? -Math.PI / 2 : Math.PI / 2;
    root.updateMatrixWorld(true);
  }
  box = new THREE.Box3().setFromObject(root);
  size = box.getSize(new THREE.Vector3());
  if (size.z > size.y * 1.25) {
    root.rotation.x += -Math.PI / 2;
    root.updateMatrixWorld(true);
  }
  box = new THREE.Box3().setFromObject(root);
  size = box.getSize(new THREE.Vector3());
  const s = targetHeight / Math.max(size.y, 0.001);
  root.scale.multiplyScalar(s);
  root.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(root);
  center = box.getCenter(new THREE.Vector3());
  root.position.x -= center.x;
  root.position.z -= center.z;
  root.position.y -= box.min.y;
  root.updateMatrixWorld(true);
}

const data = JSON.parse(readFileSync("/workspace/src/lib/softbody/nude-rig-data.json", "utf8"));
const oldBones = data.bones;
const keep = oldBones.filter((b) => !/Hair/i.test(b.name));
const nameToNew = {};
keep.forEach((b, i) => {
  nameToNew[b.name] = i;
});
const headI = nameToNew["C_Head_a"] ?? 0;
const head = keep[headI];

const tifa = await loadGltf("/workspace/public/models/tifa.glb");
fitStanding(tifa, 1.66);
let hairMesh = null;
tifa.traverse((o) => {
  if (!o.isMesh) return;
  const mat = Array.isArray(o.material) ? o.material[0] : o.material;
  const n = (mat?.name || o.name || "").toLowerCase();
  if (n === ".001" || (n.includes("hair") && !n.includes("head"))) hairMesh = o;
});
if (!hairMesh) throw new Error("no hair mesh");
const pos = hairMesh.geometry.getAttribute("position");
hairMesh.updateWorldMatrix(true, false);
const v = new THREE.Vector3();
const pts = [];
for (let i = 0; i < pos.count; i++) {
  v.fromBufferAttribute(pos, i);
  hairMesh.localToWorld(v);
  pts.push({ x: v.x, y: v.y, z: v.z });
}

const back = pts.filter((p) => p.z <= 0.01 && p.y < head.y + 0.06);
let miny = Infinity;
let maxy = -Infinity;
for (const p of back) {
  miny = Math.min(miny, p.y);
  maxy = Math.max(maxy, p.y);
}

const N = 8;
const chain = [{ x: head.x, y: head.y + 0.028, z: head.z - 0.018 }];
for (let b = 0; b < N; b++) {
  const y1 = maxy - (b / N) * (maxy - miny);
  const y0 = maxy - ((b + 1) / N) * (maxy - miny);
  const band = back.filter((p) => p.y >= y0 && p.y <= y1);
  const use = band.length > 20 ? band : pts.filter((p) => p.y >= y0 && p.y <= y1 && p.z < 0.04);
  let x = 0;
  let y = 0;
  let z = 0;
  for (const p of use) {
    x += p.x;
    y += p.y;
    z += p.z;
  }
  const n = Math.max(1, use.length);
  chain.push({ x: x / n, y: y / n, z: z / n });
}
for (let i = 1; i < chain.length; i++) {
  chain[i].x = chain[i].x * 0.4 + chain[i - 1].x * 0.6;
  if (i === 1) chain[i].z = Math.min(chain[i].z, head.z - 0.02);
}

const hairBones = chain.map((p, i) => ({
  name: i === 0 ? "HairRoot" : `Hair_${i}`,
  parent: i === 0 ? "C_Head_a" : i === 1 ? "HairRoot" : `Hair_${i - 1}`,
  x: +p.x.toFixed(5),
  y: +p.y.toFixed(5),
  z: +p.z.toFixed(5),
  radius: i === 0 ? 0.035 : Math.max(0.022, 0.04 - i * 0.002),
  maxAng: i === 0 ? 0.12 : 0.22 + i * 0.06,
  group: "hair",
}));

const bones = keep.concat(hairBones);
const hairStart = keep.length;

function remapIndex(oldI) {
  const name = oldBones[oldI]?.name;
  if (!name) return headI;
  if (nameToNew[name] !== undefined) return nameToNew[name];
  return headI;
}

const maps = {};
for (const [key, rec] of Object.entries(data.maps)) {
  if (String(key).startsWith(".001:")) continue;
  maps[key] = {
    count: rec.count,
    key: rec.key,
    index: rec.index.map((i) => remapIndex(i)),
    weight: rec.weight,
  };
}

const hairIndex = new Array(pos.count * 4);
const hairWeight = new Array(pos.count * 4);
for (let i = 0; i < pos.count; i++) {
  const p = pts[i];
  const scores = [];
  const onScalp = p.y > head.y - 0.02 && p.z > -0.04;
  if (onScalp) {
    const dHead = Math.hypot(p.x - head.x, (p.y - head.y) * 0.8, p.z - head.z);
    scores.push([headI, 3.2 / Math.max(0.01, dHead)]);
  }
  for (let k = 0; k < hairBones.length; k++) {
    const b = hairBones[k];
    const d = Math.hypot(p.x - b.x, (p.y - b.y) * 0.65, p.z - b.z);
    const w = k === 0 && onScalp ? 0.15 : 1;
    scores.push([hairStart + k, w / Math.max(0.012, d)]);
  }
  scores.sort((a, b) => b[1] - a[1]);
  const top = scores.slice(0, 4);
  let sum = 0;
  for (const s of top) sum += s[1];
  const o = i * 4;
  for (let k = 0; k < 4; k++) {
    hairIndex[o + k] = top[k] ? top[k][0] : hairStart;
    hairWeight[o + k] = top[k] ? +(top[k][1] / sum).toFixed(5) : 0;
  }
}
maps[`.001:${pos.count}`] = { count: pos.count, key: ".001", index: hairIndex, weight: hairWeight };

writeFileSync("/workspace/src/lib/softbody/nude-rig-data.json", JSON.stringify({ bones, maps }));
console.log("bones", bones.length, "hair", hairBones.length);
for (const b of hairBones) console.log(b.name, b.parent, b.x.toFixed(3), b.y.toFixed(3), b.z.toFixed(3));
