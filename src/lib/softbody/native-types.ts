export type NativeBone = {
  name: string;
  parent: string | null;
  x: number;
  y: number;
  z: number;
  radius: number;
  maxAng: number;
  group: "body" | "face" | "hair" | "foot";
};

export type NativeWeightMap = {
  count: number;
  index: Uint16Array;
  weight: Float32Array;
  bones: string[];
};
