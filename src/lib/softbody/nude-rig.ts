import type { NativeBone, NativeWeightMap } from "./native-types";
import data from "./nude-rig-data.json";

export type { NativeBone, NativeWeightMap };

type JsonMap = {
  count: number;
  key: string;
  index: number[];
  weight: number[];
};

const bones = data.bones as NativeBone[];
const rawMaps = data.maps as Record<string, JsonMap>;

const unpacked = new Map<string, NativeWeightMap>();
for (const [k, rec] of Object.entries(rawMaps)) {
  unpacked.set(k, {
    count: rec.count,
    index: Uint16Array.from(rec.index),
    weight: Float32Array.from(rec.weight),
    bones: bones.map((b) => b.name),
  });
}

export function nudeBones(): NativeBone[] {
  return bones;
}

export function nudeMapFor(matKey: string, count: number): NativeWeightMap | null {
  const direct = unpacked.get(`${matKey}:${count}`);
  if (direct && direct.count === count) return direct;
  for (const rec of unpacked.values()) {
    if (rec.count === count) return rec;
  }
  return null;
}

export function meshMatKey(mesh: { material: unknown; name: string }) {
  const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  return (((mat as { name?: string } | undefined)?.name ?? mesh.name) || "").toLowerCase();
}
