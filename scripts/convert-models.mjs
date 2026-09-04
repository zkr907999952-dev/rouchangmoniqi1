import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { FBXLoader } from "../src/lib/fbx/FBXLoader.js";

const require = createRequire(import.meta.url);

globalThis.window = globalThis;
globalThis.self = globalThis;
globalThis.document = {
  createElementNS: () => ({
    src: "",
    width: 1,
    height: 1,
    addEventListener() {},
    removeEventListener() {},
  }),
  createElement: () => ({
    src: "",
    width: 1,
    height: 1,
    addEventListener() {},
    removeEventListener() {},
  }),
};
globalThis.Image = class {
  addEventListener() {}
  removeEventListener() {}
};

globalThis.FileReader = class FileReader {
  result = null;
  onloadend = null;
  onload = null;
  onerror = null;
  readAsArrayBuffer(blob) {
    const ready = typeof blob?.arrayBuffer === "function" ? blob.arrayBuffer() : Promise.resolve(new ArrayBuffer(0));
    Promise.resolve(ready).then((ab) => {
      this.result = ab;
      this.onload?.({ target: this });
      this.onloadend?.({ target: this });
    });
  }
};

const HIDE =
  /futa|penis|dick|balls|strapon|panty|bikini|thong|garter|stocking|swim|phys_|gun|staff|caduceus|blaster|pistol|weapon|ziegler|glasses|pearls|heels|skirt|lanyard|bangle|shoe|buttonth|lifeguard|dva|pouch|torn|pharah/i;

function hiddenName(name) {
  return HIDE.test(String(name || "").toLowerCase());
}

function shouldDrop(obj) {
  let o = obj;
  while (o) {
    if (hiddenName(o.name)) return true;
    o = o.parent;
  }
  return false;
}

function freeze(source) {
  source.updateMatrixWorld(true);
  const group = new THREE.Group();
  group.name = source.name || "model";
  source.traverse((obj) => {
    const mesh = obj;
    if (!mesh.isMesh || !mesh.visible || !mesh.geometry) return;
    if (shouldDrop(mesh)) return;
    const geo = mesh.geometry.clone();
    geo.applyMatrix4(mesh.matrixWorld);
    if (geo.attributes.skinIndex) geo.deleteAttribute("skinIndex");
    if (geo.attributes.skinWeight) geo.deleteAttribute("skinWeight");
    const color = mesh.material && !Array.isArray(mesh.material) && mesh.material.color
      ? mesh.material.color.clone()
      : new THREE.Color("#cfc6bc");
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.52,
      metalness: 0.04,
      name: mesh.name,
    });
    const out = new THREE.Mesh(geo, mat);
    out.name = mesh.name || mesh.parent?.name || "mesh";
    group.add(out);
  });
  return group;
}

function loadFbx(path) {
  const loader = new FBXLoader();
  loader.manager.setURLModifier((url) => {
    if (/\.(fbx|obj|gltf|glb|bin)$/i.test(url)) return url;
    return "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
  });
  const buf = readFileSync(path);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return loader.parse(ab, path.replace(/[^/]+$/, ""));
}

function exportGlb(object) {
  const exporter = new GLTFExporter();
  return new Promise((resolve, reject) => {
    exporter.parse(
      object,
      (result) => resolve(Buffer.from(result)),
      reject,
      { binary: true, embedImages: false, onlyVisible: true, truncateDrawRange: true },
    );
  });
}

const jobs = [
  { in: "/workspace/public/models/angel/angel.fbx", out: "/workspace/public/models/angel/angel.glb", label: "angel" },
  { in: "/workspace/public/models/organs/intestines.fbx", out: "/workspace/public/models/organs/intestines.glb", label: "organs" },
];

for (const job of jobs) {
  console.log("loading", job.label);
  const parsed = loadFbx(job.in);
  console.log("freezing", job.label, "children", parsed.children?.length);
  const frozen = freeze(parsed);
  let meshes = 0;
  frozen.traverse((o) => {
    if (o.isMesh) meshes += 1;
  });
  console.log("exporting", job.label, "meshes", meshes);
  const glb = await exportGlb(frozen);
  writeFileSync(job.out, glb);
  console.log("wrote", job.out, glb.length);
}
