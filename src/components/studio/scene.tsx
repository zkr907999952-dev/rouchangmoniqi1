import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { Figure } from "./figure";
import { useStudio } from "@/lib/studio-store";

export default function Scene({
  character,
  intestines,
  pelvis,
  arm,
  bayonet,
  bayonetLong,
  room,
}: {
  character: THREE.Object3D;
  intestines: THREE.Object3D;
  pelvis: THREE.Object3D;
  arm: THREE.Object3D;
  bayonet: THREE.Object3D;
  bayonetLong: THREE.Object3D;
  room: THREE.Object3D;
}) {
  const controlsRef = useRef<OrbitControlsImpl>(null);

  return (
    <div
      className="absolute inset-0 touch-none"
      onContextMenu={(e) => e.preventDefault()}
    >
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [0.28, 1.18, 2.35], fov: 34, near: 0.05, far: 40 }}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.05,
          alpha: false,
          powerPreference: "high-performance",
          preserveDrawingBuffer: true,
        }}
        onCreated={({ gl, scene }) => {
          gl.setClearColor("#1a1614");
          scene.background = new THREE.Color("#1a1614");
          gl.domElement.style.touchAction = "none";
        }}
      >
        <Suspense fallback={null}>
          <Bedroom room={room} />
          <StudioLights />
          <Figure
            controlsRef={controlsRef}
            character={character}
            intestines={intestines}
            pelvis={pelvis}
            arm={arm}
            bayonet={bayonet}
            bayonetLong={bayonetLong}
          />
          <ControlsBridge controlsRef={controlsRef} />
        </Suspense>
      </Canvas>
    </div>
  );
}

const ROOM_S = 0.7;
const BED_FOOT_Z = 0.347;
const BED_CENTER_Z = 1.288;
const MATTRESS_Y = 0.57;
const PILLOW_Z = 2.64;
const FLOOR_Y = -0.016;
const _standQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0));
const _lieQ = new THREE.Quaternion().setFromRotationMatrix(
  new THREE.Matrix4().set(-1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1),
);

function applyBedStance(room: THREE.Object3D, stance: "front" | "on" | "lie") {
  const S = ROOM_S;
  room.scale.setScalar(S);
  if (stance === "on") {
    room.quaternion.copy(_standQ);
    room.position.set(0, -MATTRESS_Y * S, BED_CENTER_Z * S);
    return;
  }
  if (stance === "lie") {
    room.quaternion.copy(_lieQ);
    room.position.set(0, 1.98 - PILLOW_Z * S, -0.1 - 0.5 * S);
    return;
  }
  room.quaternion.copy(_standQ);
  room.position.set(0, -FLOOR_Y * S, -0.82 - BED_FOOT_Z * S);
}

function Bedroom({ room }: { room: THREE.Object3D }) {
  const stance = useStudio((s) => s.bedStance);
  useMemo(() => {
    room.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        const std = mat as THREE.MeshStandardMaterial;
        if ("envMapIntensity" in std) std.envMapIntensity = 0.35;
        if (std.opacity >= 0.98 && !std.alphaMap) {
          std.transparent = false;
          std.depthWrite = true;
          std.depthTest = true;
        }
      }
    });
  }, [room]);
  applyBedStance(room, stance);
  return <primitive object={room} />;
}

function ControlsBridge({
  controlsRef,
}: {
  controlsRef: RefObject<OrbitControlsImpl | null>;
}) {
  const autoRotate = useStudio((s) => s.autoRotate);
  const grabbing = useStudio((s) => s.grabbing);
  const { gl, camera } = useThree();

  useEffect(() => {
    const canvas = gl.domElement;
    const host = canvas.parentElement ?? canvas;
    const TAP_MS = 340;
    const TAP_PX = 38;
    const HOLD_MS = 280;
    const sph = new THREE.Spherical();
    const offset = new THREE.Vector3();
    let pressT = 0;
    let pressX = 0;
    let pressY = 0;
    let pressId = -1;
    let lastTapT = 0;
    let lastTapX = 0;
    let lastTapY = 0;
    let rotating = false;
    let rotId = -1;
    let px = 0;
    let py = 0;

    const setRotateFlag = (on: boolean) => {
      const c = controlsRef.current as (OrbitControlsImpl & { _touchRotate?: boolean }) | null;
      if (c) c._touchRotate = on;
    };

    const rotateBy = (x: number, y: number) => {
      const c = controlsRef.current;
      if (!c) return;
      const dx = x - px;
      const dy = y - py;
      px = x;
      py = y;
      offset.copy(camera.position).sub(c.target);
      sph.setFromVector3(offset);
      sph.theta -= dx * 0.0055;
      sph.phi = THREE.MathUtils.clamp(sph.phi - dy * 0.0055, c.minPolarAngle, c.maxPolarAngle);
      sph.makeSafe();
      offset.setFromSpherical(sph);
      camera.position.copy(c.target).add(offset);
      camera.lookAt(c.target);
      c.update();
    };

    const down = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      const now = performance.now();
      const dx = e.clientX - lastTapX;
      const dy = e.clientY - lastTapY;
      const isDouble =
        e.isPrimary && now - lastTapT < TAP_MS && dx * dx + dy * dy < TAP_PX * TAP_PX;
      if (isDouble) {
        rotating = true;
        rotId = e.pointerId;
        px = e.clientX;
        py = e.clientY;
        lastTapT = 0;
        setRotateFlag(true);
        window.dispatchEvent(new Event("studio-cancel-grab"));
        e.stopPropagation();
        e.preventDefault();
        return;
      }
      pressT = now;
      pressX = e.clientX;
      pressY = e.clientY;
      pressId = e.pointerId;
    };

    const move = (e: PointerEvent) => {
      if (!rotating || e.pointerId !== rotId) return;
      rotateBy(e.clientX, e.clientY);
      e.stopPropagation();
      e.preventDefault();
    };

    const up = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      if (rotating && e.pointerId === rotId) {
        rotating = false;
        rotId = -1;
        setRotateFlag(false);
        return;
      }
      if (e.pointerId !== pressId) return;
      const dt = performance.now() - pressT;
      const dx = e.clientX - pressX;
      const dy = e.clientY - pressY;
      if (dt < HOLD_MS && dx * dx + dy * dy < TAP_PX * TAP_PX) {
        lastTapT = performance.now();
        lastTapX = e.clientX;
        lastTapY = e.clientY;
      } else {
        lastTapT = 0;
      }
      pressId = -1;
    };

    const touchStart = (e: TouchEvent) => {
      if (e.touches.length < 2) return;
      rotating = false;
      rotId = -1;
      setRotateFlag(false);
      window.dispatchEvent(new Event("studio-cancel-grab"));
      const c = controlsRef.current;
      if (c) {
        c.enablePan = true;
        c.enableRotate = false;
      }
    };

    host.addEventListener("pointerdown", down, true);
    host.addEventListener("pointermove", move, true);
    host.addEventListener("pointerup", up, true);
    host.addEventListener("pointercancel", up, true);
    host.addEventListener("touchstart", touchStart, { capture: true, passive: true });
    return () => {
      host.removeEventListener("pointerdown", down, true);
      host.removeEventListener("pointermove", move, true);
      host.removeEventListener("pointerup", up, true);
      host.removeEventListener("pointercancel", up, true);
      host.removeEventListener("touchstart", touchStart, true);
    };
  }, [gl, camera, controlsRef]);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableRotate={!grabbing}
      enablePan={!grabbing}
      enableDamping
      dampingFactor={0.08}
      autoRotate={autoRotate && !grabbing}
      autoRotateSpeed={0.45}
      minDistance={0.45}
      maxDistance={5.4}
      minPolarAngle={Math.PI * 0.08}
      maxPolarAngle={Math.PI * 0.9}
      target={[0, 0.95, 0.02]}
      mouseButtons={{
        LEFT: -1 as unknown as THREE.MOUSE,
        MIDDLE: THREE.MOUSE.PAN,
        RIGHT: THREE.MOUSE.ROTATE,
      }}
      touches={{
        ONE: -1 as unknown as THREE.TOUCH,
        TWO: THREE.TOUCH.DOLLY_PAN,
      }}
    />
  );
}

function StudioLights() {
  return (
    <>
      <ambientLight intensity={0.28} color="#e6d8c8" />
      <hemisphereLight args={["#f2ebe3", "#3a322c", 0.42]} />
      <directionalLight position={[1.8, 3.2, 2.4]} intensity={1.15} color="#fff1e0" />
      <directionalLight position={[-2.6, 2.4, 0.6]} intensity={0.35} color="#c8d0dc" />
      <pointLight position={[0, 1.78, -0.77]} intensity={4.8} distance={6.5} decay={2} color="#ffd7b0" />
      <pointLight position={[1.26, 0.95, -1.68]} intensity={1.8} distance={3.6} decay={2} color="#ffc98a" />
    </>
  );
}
