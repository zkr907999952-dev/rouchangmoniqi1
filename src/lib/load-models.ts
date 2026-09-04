import { useEffect, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three-stdlib";
import { useStudio } from "@/lib/studio-store";

THREE.Cache.enabled = true;

export const MODEL_FILES = [
  { id: "character" as const, url: "/models/tifa.glb", bytes: 16_115_192, path: "/models/", hint: "角色", core: true },
  { id: "intestines" as const, url: "/models/intestines.glb", bytes: 15_629_192, path: "/models/", hint: "大小肠", core: true },
  { id: "pelvis" as const, url: "/models/pelvis.glb", bytes: 760_380, path: "/models/", hint: "盆腔", core: true },
  { id: "arm" as const, url: "/models/arm.glb", bytes: 139_896, path: "/models/", hint: "手臂", core: true },
  { id: "bayonet" as const, url: "/models/bayonet.glb", bytes: 3_873_372, path: "/models/", hint: "刺刀", core: true },
  { id: "bayonetLong" as const, url: "/models/bayonet-long.glb", bytes: 158_192, path: "/models/", hint: "长刺刀", core: true },
  { id: "room" as const, url: "/models/room.glb", bytes: 16_153_124, path: "/models/", hint: "房间", core: false },
];

const TOTAL_BYTES = MODEL_FILES.reduce((s, f) => s + f.bytes, 0);
const CORE_BYTES = MODEL_FILES.filter((f) => f.core).reduce((s, f) => s + f.bytes, 0);
const CACHE_NAME = "vela-glb-v2";

export type LoadedScenes = {
  character: THREE.Group;
  intestines: THREE.Group;
  pelvis: THREE.Group;
  arm: THREE.Group;
  bayonet: THREE.Group;
  bayonetLong: THREE.Group;
  room: THREE.Group;
};

const memBuf = new Map<string, ArrayBuffer>();
let memScenes: LoadedScenes | null = null;

function formatMb(n: number) {
  return `${(n / 1_048_576).toFixed(1)} MB`;
}

function emptyGroup() {
  const g = new THREE.Group();
  g.name = "__placeholder";
  return g;
}

async function fromCache(url: string): Promise<ArrayBuffer | null> {
  const ram = memBuf.get(url);
  if (ram && ram.byteLength > 1024) return ram;
  if (!("caches" in window)) return null;
  try {
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(url);
    if (!hit) return null;
    const buf = await hit.arrayBuffer();
    if (buf.byteLength < 1024) return null;
    memBuf.set(url, buf);
    return buf;
  } catch {
    return null;
  }
}

async function toCache(url: string, buf: ArrayBuffer) {
  memBuf.set(url, buf);
  if (!("caches" in window)) return;
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(
      url,
      new Response(buf, {
        headers: {
          "content-type": "model/gltf-binary",
          "cache-control": "public, max-age=31536000, immutable",
        },
      }),
    );
  } catch {
    /* quota */
  }
}

async function fetchBuffer(
  url: string,
  expected: number,
  onBytes: (loaded: number) => void,
  bustCache: boolean,
) {
  if (!bustCache) {
    const cached = await fromCache(url);
    if (cached) {
      onBytes(cached.byteLength);
      return cached;
    }
  }
  const res = await fetch(bustCache ? `${url}?r=${Date.now()}` : url, {
    cache: bustCache ? "reload" : "force-cache",
  });
  if (!res.ok) throw new Error(`下载失败 (${res.status})`);
  const body = res.body;
  if (!body) {
    const buf = await res.arrayBuffer();
    onBytes(buf.byteLength);
    await toCache(url, buf);
    return buf;
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      got += value.byteLength;
      onBytes(Math.min(expected, got));
    }
  }
  const buf = new Uint8Array(got);
  let o = 0;
  for (const c of chunks) {
    buf.set(c, o);
    o += c.byteLength;
  }
  const out = buf.buffer;
  onBytes(out.byteLength);
  await toCache(url, out);
  return out;
}

function parseGlb(data: ArrayBuffer, resourcePath: string) {
  return new Promise<THREE.Group>((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.parse(
      data,
      resourcePath,
      (gltf) => resolve(gltf.scene),
      (err) => reject(err instanceof Error ? err : new Error("模型解析失败")),
    );
  });
}

export function useModelAssets(enabled: boolean): LoadedScenes | null {
  const [scenes, setScenes] = useState<LoadedScenes | null>(() => memScenes);
  const retryNonce = useStudio((s) => s.retryNonce);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const received = MODEL_FILES.map(() => 0);

    const bump = (hint: string, parseBoost = 0) => {
      const got = received.reduce((a, n) => a + n, 0);
      const pct = Math.min(82, Math.round((got / TOTAL_BYTES) * 82) + parseBoost);
      useStudio.setState({
        loading: true,
        loadError: null,
        loadProgress: pct,
        loadHint: hint,
      });
    };

    (async () => {
      try {
        if (memScenes && !retryNonce) {
          useStudio.setState({ loading: true, loadError: null, loadProgress: 99, loadHint: "已缓存，正在组装" });
          setScenes(memScenes);
          return;
        }
        useStudio.setState({
          loading: true,
          loadError: null,
          loadProgress: 2,
          loadHint: "读取本地缓存 / 下载模型",
        });

        const groups: Partial<Record<(typeof MODEL_FILES)[number]["id"], THREE.Group>> = {};
        let coreEmitted = false;

        const emitIfCore = () => {
          if (coreEmitted || cancelled) return;
          const missing = MODEL_FILES.filter((f) => f.core && !groups[f.id]);
          if (missing.length) return;
          coreEmitted = true;
          const next: LoadedScenes = {
            character: groups.character!,
            intestines: groups.intestines!,
            pelvis: groups.pelvis!,
            arm: groups.arm!,
            bayonet: groups.bayonet!,
            bayonetLong: groups.bayonetLong!,
            room: groups.room ?? emptyGroup(),
          };
          memScenes = next;
          setScenes(next);
          useStudio.setState({ loadProgress: 92, loadHint: groups.room ? "组装柔体" : "角色就绪，房间后台载入" });
        };

        await Promise.all(
          MODEL_FILES.map(async (file, i) => {
            const buf = await fetchBuffer(
              file.url,
              file.bytes,
              (n) => {
                if (cancelled) return;
                received[i] = n;
                const got = received.reduce((a, x) => a + x, 0);
                const src = memBuf.get(file.url) && n >= file.bytes ? "缓存" : "下载";
                bump(`${src} ${file.hint} ${formatMb(got)} / ${formatMb(CORE_BYTES)}`);
              },
              Boolean(retryNonce),
            );
            if (cancelled) return;
            bump(`解析 ${file.hint}`, file.core ? 6 : 0);
            const scene = await parseGlb(buf, file.path);
            if (cancelled) return;
            groups[file.id] = scene;
            if (file.id === "room" && coreEmitted && memScenes) {
              const next = { ...memScenes, room: scene };
              memScenes = next;
              setScenes(next);
              useStudio.setState({ loadProgress: 99, loadHint: "房间已载入" });
            } else {
              emitIfCore();
            }
          }),
        );
        if (cancelled) return;
        emitIfCore();
        if (groups.room && memScenes && memScenes.room !== groups.room) {
          const next = { ...memScenes, room: groups.room };
          memScenes = next;
          setScenes(next);
        }
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "模型加载失败";
        useStudio.setState({
          loading: true,
          loadError: message,
          loadHint: "加载失败",
        });
        setScenes(null);
        memScenes = null;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, retryNonce]);

  return scenes;
}
