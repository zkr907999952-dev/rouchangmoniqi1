/** Rewrite FBX texture URLs so they resolve to files we actually host. */

const ANGEL_TEX = new Set([
  "BOD-default-eye-GLS.png",
  "Mercy_Classic_D.jpg",
  "Mercy_D.jpg",
  "Mercy_Eye_D.jpg",
  "Mercy_Gun_D.jpg",
  "Mercy_Hair_D.jpg",
  "Mercy_Staff_D.jpg",
  "Mercy_Ziegler_D.jpg",
  "Mercy_Ziegler_D2.jpg",
  "Mercy_Ziegler_Hair_D.jpg",
]);

const HIDE_RE =
  /futa|penis|dick|balls|strapon|panty|bikini|thong|garter|stocking|swim|phys_|gun|staff|caduceus|blaster|pistol|weapon|ziegler|glasses|pearls|heels|skirt|lanyard|bangle|shoe|buttonth|lifeguard|dva|pouch|torn|pharah/;

export function rewriteModelUrl(url: string) {
  const cleaned = url.replace(/\\/g, "/").split("?")[0];
  let name = cleaned.split("/").pop() || cleaned;
  try {
    name = decodeURIComponent(name);
  } catch {
    /* keep raw */
  }

  if (/\.(fbx|obj|gltf|glb|bin)$/i.test(name)) return url;

  if (/futa|thong|swim|white_fabric|leather_pouch|shoes1|tornshirt|dva_body|ziegler_n|horizon\.exr/i.test(name)) {
    return "/models/angel/Mercy_D.jpg";
  }
  if (/\.(jpe?g|png|webp|tif|tiff|exr|tga|bmp)$/i.test(name) && (/Mercy_|BOD-/i.test(name) || /\/angel\//i.test(cleaned))) {
    const file = name.replace(/\.jpeg$/i, ".jpg");
    if (ANGEL_TEX.has(file)) return `/models/angel/${file}`;
    return "/models/angel/Mercy_D.jpg";
  }
  if (/Tjocktarm/i.test(cleaned)) {
    return `/models/organs/Tjocktarm_normal/${name.replace(/\.tiff?$/i, ".jpg")}`;
  }
  if (/Tunntarm/i.test(cleaned)) {
    return `/models/organs/Tunntarm_normal/${name.replace(/\.tiff?$/i, ".jpg")}`;
  }
  if (/\.tiff?$/i.test(name) || /Channel_Default/i.test(name)) {
    const file = name.replace(/\.tiff?$/i, ".jpg");
    if (/normal/i.test(file)) {
      return `/models/organs/Tjocktarm_normal/${file}`;
    }
    return `/models/organs/Tjocktarm_normal/${file}`;
  }
  return url;
}

export function isHiddenMesh(name: string) {
  return HIDE_RE.test(name.toLowerCase());
}

function textureBlob(mat: {
  name?: string;
  map?: { name?: string; image?: { src?: string; currentSrc?: string } } | null;
}) {
  const img = mat.map?.image;
  return `${mat.name ?? ""} ${mat.map?.name ?? ""} ${img?.src ?? ""} ${img?.currentSrc ?? ""}`;
}

export function objectIsHidden(obj: {
  name: string;
  parent?: unknown;
  isMesh?: boolean;
  material?: unknown;
}): boolean {
  let o: { name: string; parent?: unknown } | null = obj;
  while (o) {
    if (isHiddenMesh(o.name)) return true;
    o = (o.parent as { name: string; parent?: unknown } | null) ?? null;
  }
  const mesh = obj as { isMesh?: boolean; material?: unknown };
  if (!mesh.isMesh || !mesh.material) return false;
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const raw of mats) {
    if (!raw) continue;
    if (isHiddenMesh(textureBlob(raw as { name?: string; map?: { name?: string; image?: { src?: string } } }))) {
      return true;
    }
  }
  return false;
}
