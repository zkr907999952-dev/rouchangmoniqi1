import { create } from "zustand";
import type { ExpressionId, PoseId } from "@/lib/softbody/soft-skeleton";

export type PresetId = "soft" | "firm" | "jelly" | "athletic";
export type InteractMode = "drag" | "pose" | "strike" | "fist" | "bayonet";
export type PoseEditMode = "ik" | "rotate" | "move";
export type BayonetKind = "short" | "long";
export type BedStance = "front" | "on" | "lie";

export type StudioParams = {
  stiffness: number;
  damping: number;
  gravity: number;
  pressure: number;
  jiggle: number;
  wind: number;
  breathing: boolean;
  breathAmp: number;
  breathSpeed: number;
  slowMo: boolean;
  showLattice: boolean;
  showWeights: boolean;
  autoRotate: boolean;
  abdomenXray: number;
  bellyInflate: number;
  navelDepth: number;
  navelDiameter: number;
  showOrgans: boolean;
  showGutHp: boolean;
  gutAmp: number;
  gutSpeed: number;
  strikeForce: number;
  strikeRange: number;
  strikeRebound: number;
  fistBulge: number;
  fistSpread: number;
  fistGut: number;
  fistLever: number;
  fistMaxDepth: number;
  fistRise: number;
  fistThrust: boolean;
  fistStir: boolean;
  fistThrustSpeed: number;
  fistThrustStart: number;
  fistStirSpeed: number;
  fistStirRadius: number;
  breastSoft: number;
  breastDamp: number;
  hairDamp: number;
  breastInertia: number;
  hairInertia: number;
  bedStance: BedStance;
  uiHidden: boolean;
};

export const PRESETS: Record<
  PresetId,
  { label: string; hint: string } & StudioParams
> = {
  soft: {
    label: "柔软",
    hint: "松弛回弹",
    stiffness: 0.28,
    damping: 0.94,
    gravity: -1.4,
    pressure: 0.55,
    jiggle: 1,
    wind: 0,
    breathing: true,
    breathAmp: 0.4,
    breathSpeed: 0.3,
    slowMo: false,
    showLattice: false,
    showWeights: false,
    autoRotate: false,
    abdomenXray: 0.38,
    bellyInflate: 0,
    navelDepth: 0,
    navelDiameter: 0,
    showOrgans: true,
    showGutHp: false,
    gutAmp: 0.3,
    gutSpeed: 0.5,
    strikeForce: 0.52,
    strikeRange: 0.32,
    strikeRebound: 0.72,
    fistBulge: 1.4,
    fistSpread: 1,
    fistGut: 1,
    fistLever: 1,
    fistMaxDepth: 1,
    fistRise: 0.7,
    fistThrust: false,
    fistStir: false,
    fistThrustSpeed: 0.45,
    fistThrustStart: 0.025,
    fistStirSpeed: 0.55,
    fistStirRadius: 0.4,
    breastSoft: 0.02,
    breastDamp: 0.12,
    hairDamp: 0.01,
    breastInertia: 0.55,
    hairInertia: 0.55,
    bedStance: "front",
    uiHidden: false,
  },
  firm: {
    label: "紧致",
    hint: "快速复位",
    stiffness: 0.82,
    damping: 0.9,
    gravity: -0.4,
    pressure: 0.85,
    jiggle: 0.55,
    wind: 0,
    breathing: true,
    breathAmp: 0.4,
    breathSpeed: 0.3,
    slowMo: false,
    showLattice: false,
    showWeights: false,
    autoRotate: false,
    abdomenXray: 0.38,
    bellyInflate: 0,
    navelDepth: 0,
    navelDiameter: 0,
    showOrgans: true,
    showGutHp: false,
    gutAmp: 0.3,
    gutSpeed: 0.5,
    strikeForce: 0.52,
    strikeRange: 0.32,
    strikeRebound: 0.72,
    fistBulge: 1.4,
    fistSpread: 1,
    fistGut: 1,
    fistLever: 1,
    fistMaxDepth: 1,
    fistRise: 0.7,
    fistThrust: false,
    fistStir: false,
    fistThrustSpeed: 0.45,
    fistThrustStart: 0.025,
    fistStirSpeed: 0.55,
    fistStirRadius: 0.4,
    breastSoft: 0.02,
    breastDamp: 0.12,
    hairDamp: 0.01,
    breastInertia: 0.55,
    hairInertia: 0.55,
    bedStance: "front",
    uiHidden: false,
  },
  jelly: {
    label: "果冻",
    hint: "长时间晃动",
    stiffness: 0.16,
    damping: 0.985,
    gravity: -0.2,
    pressure: 0.7,
    jiggle: 1,
    wind: 0.15,
    breathing: false,
    breathAmp: 0.4,
    breathSpeed: 0.3,
    slowMo: false,
    showLattice: false,
    showWeights: false,
    autoRotate: false,
    abdomenXray: 0.38,
    bellyInflate: 0,
    navelDepth: 0,
    navelDiameter: 0,
    showOrgans: true,
    showGutHp: false,
    gutAmp: 0.3,
    gutSpeed: 0.5,
    strikeForce: 0.52,
    strikeRange: 0.32,
    strikeRebound: 0.72,
    fistBulge: 1.4,
    fistSpread: 1,
    fistGut: 1,
    fistLever: 1,
    fistMaxDepth: 1,
    fistRise: 0.7,
    fistThrust: false,
    fistStir: false,
    fistThrustSpeed: 0.45,
    fistThrustStart: 0.025,
    fistStirSpeed: 0.55,
    fistStirRadius: 0.4,
    breastSoft: 0.02,
    breastDamp: 0.12,
    hairDamp: 0.01,
    breastInertia: 0.55,
    hairInertia: 0.55,
    bedStance: "front",
    uiHidden: false,
  },
  athletic: {
    label: "运动",
    hint: "弹性支撑",
    stiffness: 0.58,
    damping: 0.92,
    gravity: -0.8,
    pressure: 0.72,
    jiggle: 0.78,
    wind: 0,
    breathing: true,
    breathAmp: 0.4,
    breathSpeed: 0.3,
    slowMo: false,
    showLattice: false,
    showWeights: false,
    autoRotate: false,
    abdomenXray: 0.38,
    bellyInflate: 0,
    navelDepth: 0,
    navelDiameter: 0,
    showOrgans: true,
    showGutHp: false,
    gutAmp: 0.3,
    gutSpeed: 0.5,
    strikeForce: 0.52,
    strikeRange: 0.32,
    strikeRebound: 0.72,
    fistBulge: 1.4,
    fistSpread: 1,
    fistGut: 1,
    fistLever: 1,
    fistMaxDepth: 1,
    fistRise: 0.7,
    fistThrust: false,
    fistStir: false,
    fistThrustSpeed: 0.45,
    fistThrustStart: 0.025,
    fistStirSpeed: 0.55,
    fistStirRadius: 0.4,
    breastSoft: 0.02,
    breastDamp: 0.12,
    hairDamp: 0.01,
    breastInertia: 0.55,
    hairInertia: 0.55,
    bedStance: "front",
    uiHidden: false,
  },
};

type StudioState = StudioParams & {
  preset: PresetId;
  interactMode: InteractMode;
  poseEditMode: PoseEditMode;
  selectedBone: number;
  selectedBoneName: string;
  expression: ExpressionId;
  pose: PoseId;
  energy: number;
  grabbing: boolean;
  shakeNonce: number;
  resetNonce: number;
  strikeNonce: number;
  strikePoint: [number, number, number] | null;
  loading: boolean;
  loadProgress: number;
  loadHint: string;
  loadError: string | null;
  retryNonce: number;
  bayonetHasEntry: boolean;
  bayonetPen: number;
  bayonetAuto: boolean;
  bayonetPump: boolean;
  bayonetKind: BayonetKind;
  gazeFollow: boolean;
  blinkEnabled: boolean;
  eyeOpenL: number;
  eyeOpenR: number;
  blinkRate: number;
  blinkSpeed: number;
  mouthOpen: number;
  setParam: <K extends keyof StudioParams>(key: K, value: StudioParams[K]) => void;
  applyPreset: (id: PresetId) => void;
  setInteractMode: (mode: InteractMode) => void;
  setPoseEditMode: (mode: PoseEditMode) => void;
  setSelectedBone: (i: number, name?: string) => void;
  setExpression: (id: ExpressionId) => void;
  setPose: (id: PoseId) => void;
  setEnergy: (v: number) => void;
  setGrabbing: (v: boolean) => void;
  setBayonetHasEntry: (v: boolean) => void;
  setBayonetPen: (v: number) => void;
  setBayonetAuto: (v: boolean) => void;
  setBayonetPump: (v: boolean) => void;
  setBayonetKind: (kind: BayonetKind) => void;
  setGazeFollow: (v: boolean) => void;
  setBlinkEnabled: (v: boolean) => void;
  setEyeOpenL: (v: number) => void;
  setEyeOpenR: (v: number) => void;
  setBlinkRate: (v: number) => void;
  setBlinkSpeed: (v: number) => void;
  setMouthOpen: (v: number) => void;
  shake: () => void;
  fireStrike: (point?: [number, number, number] | null) => void;
  resetSim: () => void;
  retryLoad: () => void;
};

export const useStudio = create<StudioState>((set) => ({
  ...PRESETS.soft,
  preset: "soft",
  interactMode: "drag",
  poseEditMode: "ik" as PoseEditMode,
  selectedBone: -1,
  selectedBoneName: "",
  expression: "rest",
  pose: "idle",
  energy: 0,
  grabbing: false,
  shakeNonce: 0,
  resetNonce: 0,
  strikeNonce: 0,
  strikePoint: null,
  loading: true,
  loadProgress: 0,
  loadHint: "准备下载",
  loadError: null,
  retryNonce: 0,
  bayonetHasEntry: false,
  bayonetPen: 0,
  bayonetAuto: false,
  bayonetPump: false,
  bayonetKind: "short",
  gazeFollow: true,
  blinkEnabled: true,
  eyeOpenL: 1,
  eyeOpenR: 1,
  blinkRate: 38,
  blinkSpeed: 1,
  mouthOpen: 0,
  setParam: (key, value) =>
    set((s) => ({
      ...s,
      [key]: value,
      preset: s.preset,
    })),
  applyPreset: (id) =>
    set((s) => ({
      ...PRESETS[id],
      preset: id,
      abdomenXray: s.abdomenXray,
      bellyInflate: s.bellyInflate,
      navelDepth: s.navelDepth,
      navelDiameter: s.navelDiameter,
      breastSoft: s.breastSoft,
      breastDamp: s.breastDamp,
      hairDamp: s.hairDamp,
      breastInertia: s.breastInertia,
      hairInertia: s.hairInertia,
      breathAmp: s.breathAmp,
      breathSpeed: s.breathSpeed,
      showOrgans: s.showOrgans,
      showGutHp: s.showGutHp,
      gutAmp: s.gutAmp,
      gutSpeed: s.gutSpeed,
      strikeForce: s.strikeForce,
      strikeRange: s.strikeRange,
      strikeRebound: s.strikeRebound,
      fistBulge: s.fistBulge,
      fistSpread: s.fistSpread,
      fistGut: s.fistGut,
      fistLever: s.fistLever,
      fistMaxDepth: s.fistMaxDepth,
      fistRise: s.fistRise,
      fistThrust: s.fistThrust,
      fistStir: s.fistStir,
      fistThrustSpeed: s.fistThrustSpeed,
      fistThrustStart: s.fistThrustStart,
      fistStirSpeed: s.fistStirSpeed,
      fistStirRadius: s.fistStirRadius,
      bedStance: s.bedStance,
      showLattice: s.showLattice,
      showWeights: s.showWeights,
      uiHidden: s.uiHidden,
      interactMode: s.interactMode,
      expression: s.expression,
      pose: s.pose,
    })),
  setInteractMode: (interactMode) =>
    set((s) => ({
      interactMode,
      selectedBone: interactMode === "pose" ? s.selectedBone : -1,
    })),
  setPoseEditMode: (poseEditMode) => set({ poseEditMode }),
  setSelectedBone: (selectedBone, name) => set({ selectedBone, selectedBoneName: name ?? "" }),
  setExpression: (expression) => set({ expression }),
  setPose: (pose) => set({ pose }),
  setEnergy: (energy) => set({ energy }),
  setGrabbing: (grabbing) => set({ grabbing }),
  setBayonetHasEntry: (bayonetHasEntry) => set({ bayonetHasEntry }),
  setBayonetPen: (bayonetPen) => set({ bayonetPen: Math.max(0, Math.min(1, bayonetPen)) }),
  setBayonetAuto: (bayonetAuto) => set((s) => ({ bayonetAuto, bayonetPump: bayonetAuto ? false : s.bayonetPump })),
  setBayonetPump: (bayonetPump) => set((s) => ({ bayonetPump, bayonetAuto: bayonetPump ? false : s.bayonetAuto })),
  setBayonetKind: (bayonetKind) => set({ bayonetKind, interactMode: "bayonet" }),
  setGazeFollow: (gazeFollow) => set({ gazeFollow }),
  setBlinkEnabled: (blinkEnabled) => set({ blinkEnabled }),
  setEyeOpenL: (eyeOpenL) => set({ eyeOpenL: Math.max(0, Math.min(1, eyeOpenL)) }),
  setEyeOpenR: (eyeOpenR) => set({ eyeOpenR: Math.max(0, Math.min(1, eyeOpenR)) }),
  setBlinkRate: (blinkRate) => set({ blinkRate: Math.max(4, Math.min(40, blinkRate)) }),
  setBlinkSpeed: (blinkSpeed) => set({ blinkSpeed: Math.max(0, Math.min(1, blinkSpeed)) }),
  setMouthOpen: (mouthOpen) => set({ mouthOpen: Math.max(0, Math.min(1, mouthOpen)) }),
  shake: () => set((s) => ({ shakeNonce: s.shakeNonce + 1 })),
  fireStrike: (point = null) =>
    set((s) => ({ strikeNonce: s.strikeNonce + 1, strikePoint: point ?? null })),
  resetSim: () =>
    set((s) => ({
      resetNonce: s.resetNonce + 1,
      energy: 0,
      bayonetHasEntry: false,
      bayonetPen: 0,
    })),
  retryLoad: () =>
    set((s) => ({
      loading: true,
      loadProgress: 0,
      loadHint: "重新下载",
      loadError: null,
      retryNonce: s.retryNonce + 1,
    })),
}));
