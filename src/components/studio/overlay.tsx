import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import {
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Camera,
  ChevronsUpDown,
  Crosshair,
  Eye,
  EyeOff,
  GripHorizontal,
  Grid3x3,
  Hand,
  Grab,
  Heart,
  MousePointerClick,
  Pause,
  Repeat,
  RotateCcw,
  RotateCw,
  Rotate3d,
  Move,
  Bone,
  Scan,
  Settings2,
  Sword,
  Wrench,
  Wind,
  Zap,
} from "lucide-react";
import * as Slider from "@radix-ui/react-slider";
import { cn } from "@/lib/utils";
import { PRESETS, useStudio, type CamFocus, type PresetId, type StudioParams } from "@/lib/studio-store";
import { EXPRESSIONS, HAND_GESTURES, POSES } from "@/lib/softbody/soft-skeleton";

const SLIDERS: {
  id: keyof Pick<
    StudioParams,
    "stiffness" | "damping" | "gravity" | "pressure" | "jiggle" | "wind" | "breathAmp" | "breathSpeed" | "bellyInflate" | "navelDepth" | "navelDiameter" | "gutAmp" | "gutSpeed" | "breastSoft" | "breastDamp" | "breastInertia" | "hairDamp" | "hairInertia" | "fistBulge" | "fistSpread" | "fistGut" | "fistLever" | "fistMaxDepth" | "fistRise"
  >;
  label: string;
  min: number;
  max: number;
  step: number;
}[] = [
  { id: "stiffness", label: "刚度", min: 0.08, max: 1, step: 0.01 },
  { id: "damping", label: "阻尼", min: 0.82, max: 0.995, step: 0.001 },
  { id: "gravity", label: "重力", min: -4, max: 2, step: 0.05 },
  { id: "pressure", label: "体积", min: 0.1, max: 1, step: 0.01 },
  { id: "jiggle", label: "柔度", min: 0.2, max: 1, step: 0.01 },
  { id: "wind", label: "风力", min: 0, max: 1, step: 0.01 },
  { id: "breathAmp", label: "呼吸幅度", min: 0, max: 1, step: 0.01 },
  { id: "breathSpeed", label: "呼吸速度", min: 0.05, max: 1, step: 0.01 },
  { id: "bellyInflate", label: "彭腹", min: -1, max: 1, step: 0.01 },
  { id: "navelDepth", label: "肚脐深度", min: 0, max: 1, step: 0.01 },
  { id: "navelDiameter", label: "肚脐直径", min: 0, max: 2, step: 0.01 },
  { id: "gutAmp", label: "蠕动幅度", min: 0, max: 1, step: 0.01 },
  { id: "gutSpeed", label: "蠕动速度", min: 0, max: 1, step: 0.01 },
  { id: "breastSoft", label: "胸部柔软", min: 0, max: 1, step: 0.01 },
  { id: "breastDamp", label: "胸部阻尼", min: 0, max: 1, step: 0.01 },
  { id: "breastInertia", label: "胸部惯性", min: 0, max: 1, step: 0.01 },
  { id: "hairDamp", label: "头发阻尼", min: 0, max: 1, step: 0.01 },
  { id: "hairInertia", label: "头发惯性", min: 0, max: 1, step: 0.01 },
  { id: "fistBulge", label: "拳头鼓起", min: 0, max: 2, step: 0.01 },
  { id: "fistSpread", label: "鼓起范围", min: 0.2, max: 2, step: 0.01 },
  { id: "fistGut", label: "肠子撑开", min: 0, max: 2, step: 0.01 },
  { id: "fistLever", label: "杠杆搅动", min: 0, max: 2, step: 0.01 },
  { id: "fistMaxDepth", label: "最大插入深度", min: 0.5, max: 1.5, step: 0.01 },
  { id: "fistRise", label: "隆起叠加速度", min: 0.2, max: 3, step: 0.01 },
];

type PanelId = "settings" | "interact" | "pose" | "tools" | "weapons";

const PANELS: { id: PanelId; label: string; icon: typeof Settings2 }[] = [
  { id: "settings", label: "设置", icon: Settings2 },
  { id: "interact", label: "互动", icon: Hand },
  { id: "pose", label: "姿势", icon: Bone },
  { id: "tools", label: "工具", icon: Wrench },
  { id: "weapons", label: "武器", icon: Sword },
];

const STRIKE_LEVELS: { id: string; label: string; force: number }[] = [
  { id: "light", label: "轻", force: 0.28 },
  { id: "mid", label: "中", force: 0.52 },
  { id: "heavy", label: "重", force: 0.78 },
  { id: "max", label: "极重", force: 1 },
];

export function Overlay() {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<PanelId>("settings");
  const [camOpen, setCamOpen] = useState(false);
  const preset = useStudio((s) => s.preset);
  const breathing = useStudio((s) => s.breathing);
  const slowMo = useStudio((s) => s.slowMo);
  const showLattice = useStudio((s) => s.showLattice);
  const showWeights = useStudio((s) => s.showWeights);
  const expression = useStudio((s) => s.expression);
  const pose = useStudio((s) => s.pose);
  const setExpression = useStudio((s) => s.setExpression);
  const setPose = useStudio((s) => s.setPose);
  const handSide = useStudio((s) => s.handSide);
  const setHandSide = useStudio((s) => s.setHandSide);
  const handGestureL = useStudio((s) => s.handGestureL);
  const handGestureR = useStudio((s) => s.handGestureR);
  const setHandGesture = useStudio((s) => s.setHandGesture);
  const autoRotate = useStudio((s) => s.autoRotate);
  const showOrgans = useStudio((s) => s.showOrgans);
  const showGutHp = useStudio((s) => s.showGutHp);
  const uiHidden = useStudio((s) => s.uiHidden);
  const abdomenXray = useStudio((s) => s.abdomenXray);
  const bedStance = useStudio((s) => s.bedStance);
  const interactMode = useStudio((s) => s.interactMode);
  const poseEditMode = useStudio((s) => s.poseEditMode);
  const selectedBoneName = useStudio((s) => s.selectedBoneName);
  const setInteractMode = useStudio((s) => s.setInteractMode);
  const setPoseEditMode = useStudio((s) => s.setPoseEditMode);
  const gazeFollow = useStudio((s) => s.gazeFollow);
  const setGazeFollow = useStudio((s) => s.setGazeFollow);
  const blinkEnabled = useStudio((s) => s.blinkEnabled);
  const setBlinkEnabled = useStudio((s) => s.setBlinkEnabled);
  const eyeOpenL = useStudio((s) => s.eyeOpenL);
  const eyeOpenR = useStudio((s) => s.eyeOpenR);
  const setEyeOpenL = useStudio((s) => s.setEyeOpenL);
  const setEyeOpenR = useStudio((s) => s.setEyeOpenR);
  const blinkRate = useStudio((s) => s.blinkRate);
  const blinkSpeed = useStudio((s) => s.blinkSpeed);
  const setBlinkRate = useStudio((s) => s.setBlinkRate);
  const setBlinkSpeed = useStudio((s) => s.setBlinkSpeed);
  const mouthOpen = useStudio((s) => s.mouthOpen);
  const setMouthOpen = useStudio((s) => s.setMouthOpen);
  const mouthAmp = useStudio((s) => s.mouthAmp);
  const setMouthAmp = useStudio((s) => s.setMouthAmp);
  const mouthChinAmp = useStudio((s) => s.mouthChinAmp);
  const setMouthChinAmp = useStudio((s) => s.setMouthChinAmp);
  const mouthLipAmp = useStudio((s) => s.mouthLipAmp);
  const setMouthLipAmp = useStudio((s) => s.setMouthLipAmp);
  const mouthSmile = useStudio((s) => s.mouthSmile);
  const setMouthSmile = useStudio((s) => s.setMouthSmile);
  const mouthPucker = useStudio((s) => s.mouthPucker);
  const setMouthPucker = useStudio((s) => s.setMouthPucker);
  const mouthWidth = useStudio((s) => s.mouthWidth);
  const setMouthWidth = useStudio((s) => s.setMouthWidth);
  const grabbing = useStudio((s) => s.grabbing);
  const loading = useStudio((s) => s.loading);
  const loadProgress = useStudio((s) => s.loadProgress);
  const loadHint = useStudio((s) => s.loadHint);
  const loadError = useStudio((s) => s.loadError);
  const retryLoad = useStudio((s) => s.retryLoad);
  const applyPreset = useStudio((s) => s.applyPreset);
  const setParam = useStudio((s) => s.setParam);
  const resetSim = useStudio((s) => s.resetSim);
  const fireStrike = useStudio((s) => s.fireStrike);
  const strikeForce = useStudio((s) => s.strikeForce);
  const strikeRange = useStudio((s) => s.strikeRange);
  const strikeRebound = useStudio((s) => s.strikeRebound);
  const fistMaxDepth = useStudio((s) => s.fistMaxDepth);
  const fistThrust = useStudio((s) => s.fistThrust);
  const fistStir = useStudio((s) => s.fistStir);
  const fistThrustSpeed = useStudio((s) => s.fistThrustSpeed);
  const fistThrustStart = useStudio((s) => s.fistThrustStart);
  const fistStirSpeed = useStudio((s) => s.fistStirSpeed);
  const fistStirRadius = useStudio((s) => s.fistStirRadius);
  const bayonetHasEntry = useStudio((s) => s.bayonetHasEntry);
  const bayonetPen = useStudio((s) => s.bayonetPen);
  const bayonetAuto = useStudio((s) => s.bayonetAuto);
  const bayonetPump = useStudio((s) => s.bayonetPump);
  const bayonetKind = useStudio((s) => s.bayonetKind);
  const setBayonetPen = useStudio((s) => s.setBayonetPen);
  const setBayonetAuto = useStudio((s) => s.setBayonetAuto);
  const setBayonetPump = useStudio((s) => s.setBayonetPump);
  const setBayonetKind = useStudio((s) => s.setBayonetKind);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "r" || e.key === "R") resetSim();
      if (e.key === "b" || e.key === "B") setParam("breathing", !useStudio.getState().breathing);
      if (e.key === "h" || e.key === "H") setParam("uiHidden", !useStudio.getState().uiHidden);
      if (e.key === "t" || e.key === "T") {
        const order = ["drag", "pose", "strike", "fist", "bayonet"] as const;
        const cur = useStudio.getState().interactMode;
        const i = order.indexOf(cur);
        setInteractMode(order[(i + 1) % order.length]!);
      }
      if (e.key === "x" || e.key === "X") {
        const cur = useStudio.getState().abdomenXray;
        setParam("abdomenXray", cur > 0.05 ? 0 : 0.38);
      }
      if (e.key === "k" || e.key === "K") setParam("showLattice", !useStudio.getState().showLattice);
      if (e.key === "w" || e.key === "W") setParam("showWeights", !useStudio.getState().showWeights);
      const exprKeys: Record<string, (typeof EXPRESSIONS)[number]["id"]> = {
        "1": "rest",
        "2": "smile",
        "3": "surprise",
        "4": "open",
      };
      if (exprKeys[e.key]) setExpression(exprKeys[e.key]);
      const poseKeys: Record<string, (typeof POSES)[number]["id"]> = {
        "5": "idle",
        "6": "armsUp",
        "7": "bow",
        "8": "legLift",
        "9": "twist",
        "0": "sway",
      };
      if (poseKeys[e.key]) setPose(poseKeys[e.key]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [resetSim, setParam, setInteractMode, setExpression, setPose]);

  const hideUi = () => setParam("uiHidden", true);
  const showUi = () => setParam("uiHidden", false);

  return (
    <div className="pointer-events-none absolute inset-0 z-10 text-fg">
      {loading ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-bg/70">
          <div className="w-64 rounded-xl border border-border bg-surface px-6 py-5 text-center">
            <p className="font-display text-xl tracking-display">
              {loadError ? "载入失败" : "载入模型"}
            </p>
            {loadError ? (
              <>
                <p className="mt-2 text-xs leading-relaxed text-muted text-pretty">{loadError}</p>
                <button
                  type="button"
                  onClick={retryLoad}
                  className="pointer-events-auto mt-4 inline-flex h-11 w-full items-center justify-center rounded-md bg-accent text-sm font-medium text-accent-fg"
                >
                  重试
                </button>
              </>
            ) : (
              <>
                <div className="mt-3 h-1 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full bg-accent transition-[width] duration-fast ease-smooth-out"
                    style={{ width: `${Math.max(3, Math.round(loadProgress))}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-muted tabular-nums">{Math.round(loadProgress)}%</p>
                <p className="mt-1 text-xs text-muted">{loadHint}</p>
              </>
            )}
          </div>
        </div>
      ) : null}

      <div className="pointer-events-auto absolute top-4 right-4 z-20 flex gap-2 sm:top-6 sm:right-6">
        <button
          type="button"
          onClick={() => setCamOpen((v) => !v)}
          className={cn(
            "inline-flex h-11 w-11 items-center justify-center rounded-full border transition-colors duration-fast ease-smooth-out",
            camOpen ? "border-accent bg-accent text-accent-fg" : "border-border bg-surface text-fg",
          )}
          aria-label="摄像机"
        >
          <Camera className="size-4" />
        </button>
        <button
          type="button"
          onClick={uiHidden ? showUi : hideUi}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface text-fg"
          aria-label={uiHidden ? "显示菜单" : "隐藏菜单"}
        >
          {uiHidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
        </button>
      </div>
      {camOpen ? <CameraMenu onClose={() => setCamOpen(false)} /> : null}

      {uiHidden ? null : (
        <>
      <header className="pointer-events-none absolute top-0 right-0 left-0 flex items-start justify-between gap-4 p-4 pr-28 sm:p-6 sm:pr-32">
        <div className="max-w-[16rem]">
          <p className="font-display text-2xl leading-none tracking-display text-fg sm:text-3xl">柔肠模拟器</p>
          <p className="mt-1.5 text-[11px] leading-snug text-muted sm:hidden">双指拖动平移 · 双击后拖动旋转</p>
        </div>
      </header>

      <aside
        className={cn(
          "pointer-events-auto absolute right-3 bottom-3 left-3 flex max-h-[calc(100dvh-5.25rem)] flex-col overflow-hidden rounded-xl border border-border bg-surface sm:right-6 sm:bottom-auto sm:left-auto sm:top-24 sm:max-h-[calc(100dvh-8rem)] sm:w-80",
        )}
      >
        <div className="grid shrink-0 grid-cols-5 border-b border-border">
          {PANELS.map((item) => {
            const Icon = item.icon;
            const on = panel === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setPanel(item.id);
                  setOpen(true);
                }}
                className={cn(
                  "inline-flex h-11 flex-col items-center justify-center gap-0.5 text-[10px] font-medium sm:h-12 sm:text-[11px]",
                  on ? "bg-surface-2 text-fg" : "text-muted hover:text-fg",
                )}
              >
                <Icon className="size-3.5" />
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 px-3 pt-2 sm:hidden">
          <p className="text-sm font-medium">{PANELS.find((p) => p.id === panel)?.label}</p>
          <button type="button" className="text-xs text-muted" onClick={() => setOpen((v) => !v)}>
            {open ? "收起" : "展开"}
          </button>
        </div>

        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-3 sm:block sm:p-4",
            open ? "block" : "hidden",
          )}
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {panel === "settings" ? (
            <>
              <div className="mb-3 flex gap-1 overflow-x-auto">
                {(Object.keys(PRESETS) as PresetId[]).map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => applyPreset(id)}
                    className={cn(
                      "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium",
                      preset === id
                        ? "border-accent bg-accent text-accent-fg"
                        : "border-border bg-surface-2 text-muted",
                    )}
                  >
                    {PRESETS[id].label}
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-3">
                {SLIDERS.map((item) => (
                  <SliderRow key={item.id} {...item} />
                ))}
                <label className="block">
                  <span className="mb-1.5 flex items-center justify-between text-xs text-muted">
                    <span>眨眼频率</span>
                    <span className="tabular-nums text-fg">{Math.round(blinkRate)} 次/分</span>
                  </span>
                  <Slider.Root
                    value={[blinkRate]}
                    min={4}
                    max={40}
                    step={1}
                    onValueChange={([v]) => {
                      if (typeof v === "number") setBlinkRate(v);
                    }}
                    className="relative flex h-5 w-full touch-none items-center"
                  >
                    <Slider.Track className="relative h-1 grow rounded-full bg-surface-2">
                      <Slider.Range className="absolute h-full rounded-full bg-accent" />
                    </Slider.Track>
                    <Slider.Thumb className="block size-3.5 rounded-full bg-fg shadow-sm outline-none ring-2 ring-transparent focus-visible:ring-accent" />
                  </Slider.Root>
                </label>
                <label className="block">
                  <span className="mb-1.5 flex items-center justify-between text-xs text-muted">
                    <span>眨眼速度</span>
                    <span className="tabular-nums text-fg">{blinkSpeed.toFixed(2)}</span>
                  </span>
                  <Slider.Root
                    value={[blinkSpeed]}
                    min={0}
                    max={1}
                    step={0.01}
                    onValueChange={([v]) => {
                      if (typeof v === "number") setBlinkSpeed(v);
                    }}
                    className="relative flex h-5 w-full touch-none items-center"
                  >
                    <Slider.Track className="relative h-1 grow rounded-full bg-surface-2">
                      <Slider.Range className="absolute h-full rounded-full bg-accent" />
                    </Slider.Track>
                    <Slider.Thumb className="block size-3.5 rounded-full bg-fg shadow-sm outline-none ring-2 ring-transparent focus-visible:ring-accent" />
                  </Slider.Root>
                </label>
              </div>
              <div className="mt-4">
                <p className="mb-1.5 text-xs text-muted">站位</p>
                <div className="grid grid-cols-3 gap-1">
                  {(
                    [
                      { id: "front" as const, label: "站在床前" },
                      { id: "on" as const, label: "站在床上" },
                      { id: "lie" as const, label: "躺在床上" },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setParam("bedStance", item.id)}
                      className={cn(
                        "h-9 rounded-md border px-1 text-[11px] font-medium",
                        bedStance === item.id
                          ? "border-accent bg-accent text-accent-fg"
                          : "border-border bg-surface-2 text-muted hover:text-fg",
                      )}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Toggle
                  active={breathing}
                  onClick={() => setParam("breathing", !breathing)}
                  icon={<Wind className="size-3.5" />}
                  label="呼吸"
                />
                <Toggle
                  active={slowMo}
                  onClick={() => setParam("slowMo", !slowMo)}
                  icon={<Pause className="size-3.5" />}
                  label="慢动作"
                />
                <Toggle
                  active={showLattice}
                  onClick={() => setParam("showLattice", !showLattice)}
                  icon={<Grid3x3 className="size-3.5" />}
                  label="显示骨骼"
                />
                <Toggle
                  active={showWeights}
                  onClick={() => setParam("showWeights", !showWeights)}
                  icon={<Scan className="size-3.5" />}
                  label="显示绑定"
                />
                <Toggle
                  active={autoRotate}
                  onClick={() => setParam("autoRotate", !autoRotate)}
                  icon={<RotateCw className="size-3.5" />}
                  label="旋转"
                />
                <Toggle
                  active={showOrgans}
                  onClick={() => setParam("showOrgans", !showOrgans)}
                  icon={<Scan className="size-3.5" />}
                  label="脏器"
                />
                <Toggle
                  active={showGutHp}
                  onClick={() => setParam("showGutHp", !showGutHp)}
                  icon={<Heart className="size-3.5" />}
                  label="显示生命值"
                />
              </div>
            </>
          ) : null}

          {panel === "interact" ? (
            <>
              <p className="mb-3 text-xs leading-relaxed text-muted">
                左键点身体操作。拖拽捏软组织，击腹点击释放环状冲击，拳交拖动手臂沿大肠插入，刺刀点腹壁后拖角度与深度。姿势编辑请到姿势页。
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setInteractMode("drag")}
                  className={cn(
                    "inline-flex h-11 items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors duration-fast",
                    interactMode === "drag"
                      ? "bg-accent text-accent-fg"
                      : "border border-border bg-surface-2 text-muted hover:text-fg",
                  )}
                >
                  <Hand className="size-4" />
                  拖拽
                </button>
                <button
                  type="button"
                  onClick={() => setInteractMode("strike")}
                  className={cn(
                    "inline-flex h-11 items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors duration-fast",
                    interactMode === "strike"
                      ? "bg-accent text-accent-fg"
                      : "border border-border bg-surface-2 text-muted hover:text-fg",
                  )}
                >
                  <Zap className="size-4" />
                  击腹
                </button>
                <button
                  type="button"
                  onClick={() => setInteractMode("fist")}
                  className={cn(
                    "inline-flex h-11 items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors duration-fast",
                    interactMode === "fist"
                      ? "bg-accent text-accent-fg"
                      : "border border-border bg-surface-2 text-muted hover:text-fg",
                  )}
                >
                  <Grab className="size-4" />
                  拳交
                </button>
                <button
                  type="button"
                  onClick={() => setBayonetKind("short")}
                  className={cn(
                    "inline-flex h-11 items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors duration-fast",
                    interactMode === "bayonet" && bayonetKind === "short"
                      ? "bg-accent text-accent-fg"
                      : "border border-border bg-surface-2 text-muted hover:text-fg",
                  )}
                >
                  <Sword className="size-4" />
                  刺刀
                </button>
                <button
                  type="button"
                  onClick={() => setBayonetKind("long")}
                  className={cn(
                    "inline-flex h-11 items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors duration-fast",
                    interactMode === "bayonet" && bayonetKind === "long"
                      ? "bg-accent text-accent-fg"
                      : "border border-border bg-surface-2 text-muted hover:text-fg",
                  )}
                >
                  <Sword className="size-4" />
                  长刺刀
                </button>
              </div>

              {interactMode === "fist" ? (
                <div className="mt-3">
                  <p className="text-xs leading-relaxed text-muted">
                    左键拖拳头。肛门是支点，体外的手臂会跟着转，手臂本身是刚体不会弯折。
                  </p>
                  <label className="mt-3 block">
                    <span className="mb-1.5 flex items-center justify-between text-xs text-muted">
                      <span>最大插入深度</span>
                      <span className="tabular-nums text-fg">{fistMaxDepth.toFixed(2)}</span>
                    </span>
                    <Slider.Root
                      value={[fistMaxDepth]}
                      min={0.5}
                      max={1.5}
                      step={0.01}
                      onValueChange={([v]) => {
                        if (typeof v === "number") setParam("fistMaxDepth", v);
                      }}
                      className="relative flex h-5 w-full touch-none items-center"
                    >
                      <Slider.Track className="relative h-1 grow rounded-full bg-surface-2">
                        <Slider.Range className="absolute h-full rounded-full bg-accent" />
                      </Slider.Track>
                      <Slider.Thumb className="block size-3.5 rounded-full bg-fg shadow-sm outline-none ring-2 ring-transparent focus-visible:ring-accent" />
                    </Slider.Root>
                  </label>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Toggle
                      active={fistThrust}
                      onClick={() => setParam("fistThrust", !fistThrust)}
                      icon={<Activity className="size-3.5" />}
                      label="抽插"
                    />
                    <Toggle
                      active={fistStir}
                      onClick={() => setParam("fistStir", !fistStir)}
                      icon={<RotateCw className="size-3.5" />}
                      label="搅动"
                    />
                  </div>
                  <div className="mt-3 flex flex-col gap-3">
                    <label className="block">
                      <span className="mb-1.5 flex items-center justify-between text-xs text-muted">
                        <span>抽插速度</span>
                        <span className="tabular-nums text-fg">{fistThrustSpeed.toFixed(2)}</span>
                      </span>
                      <Slider.Root
                        value={[fistThrustSpeed]}
                        min={0.05}
                        max={1}
                        step={0.01}
                        onValueChange={([v]) => {
                          if (typeof v === "number") setParam("fistThrustSpeed", v);
                        }}
                        className="relative flex h-5 w-full touch-none items-center"
                      >
                        <Slider.Track className="relative h-1 grow rounded-full bg-surface-2">
                          <Slider.Range className="absolute h-full rounded-full bg-accent" />
                        </Slider.Track>
                        <Slider.Thumb className="block size-3.5 rounded-full bg-fg shadow-sm outline-none ring-2 ring-transparent focus-visible:ring-accent" />
                      </Slider.Root>
                    </label>
                    <label className="block">
                      <span className="mb-1.5 flex items-center justify-between text-xs text-muted">
                        <span>抽插起始深度</span>
                        <span className="tabular-nums text-fg">{fistThrustStart.toFixed(2)}</span>
                      </span>
                      <Slider.Root
                        value={[fistThrustStart]}
                        min={0.012}
                        max={0.12}
                        step={0.001}
                        onValueChange={([v]) => {
                          if (typeof v === "number") setParam("fistThrustStart", v);
                        }}
                        className="relative flex h-5 w-full touch-none items-center"
                      >
                        <Slider.Track className="relative h-1 grow rounded-full bg-surface-2">
                          <Slider.Range className="absolute h-full rounded-full bg-accent" />
                        </Slider.Track>
                        <Slider.Thumb className="block size-3.5 rounded-full bg-fg shadow-sm outline-none ring-2 ring-transparent focus-visible:ring-accent" />
                      </Slider.Root>
                    </label>
                    <label className="block">
                      <span className="mb-1.5 flex items-center justify-between text-xs text-muted">
                        <span>搅动速度</span>
                        <span className="tabular-nums text-fg">{fistStirSpeed.toFixed(2)}</span>
                      </span>
                      <Slider.Root
                        value={[fistStirSpeed]}
                        min={0.05}
                        max={1}
                        step={0.01}
                        onValueChange={([v]) => {
                          if (typeof v === "number") setParam("fistStirSpeed", v);
                        }}
                        className="relative flex h-5 w-full touch-none items-center"
                      >
                        <Slider.Track className="relative h-1 grow rounded-full bg-surface-2">
                          <Slider.Range className="absolute h-full rounded-full bg-accent" />
                        </Slider.Track>
                        <Slider.Thumb className="block size-3.5 rounded-full bg-fg shadow-sm outline-none ring-2 ring-transparent focus-visible:ring-accent" />
                      </Slider.Root>
                    </label>
                    <label className="block">
                      <span className="mb-1.5 flex items-center justify-between text-xs text-muted">
                        <span>搅动半径</span>
                        <span className="tabular-nums text-fg">{fistStirRadius.toFixed(2)}</span>
                      </span>
                      <Slider.Root
                        value={[fistStirRadius]}
                        min={0.05}
                        max={1}
                        step={0.01}
                        onValueChange={([v]) => {
                          if (typeof v === "number") setParam("fistStirRadius", v);
                        }}
                        className="relative flex h-5 w-full touch-none items-center"
                      >
                        <Slider.Track className="relative h-1 grow rounded-full bg-surface-2">
                          <Slider.Range className="absolute h-full rounded-full bg-accent" />
                        </Slider.Track>
                        <Slider.Thumb className="block size-3.5 rounded-full bg-fg shadow-sm outline-none ring-2 ring-transparent focus-visible:ring-accent" />
                      </Slider.Root>
                    </label>
                  </div>
                </div>
              ) : null}

              {interactMode === "bayonet" ? (
                <div className="mt-3">
                  <p className="text-xs leading-relaxed text-muted">
                    {bayonetHasEntry
                      ? `${bayonetKind === "long" ? "长刺刀" : "刺刀"}已锁定刺入点。拖动改角度和深度。刀刃可全部没入，刀柄停在体外。`
                      : "点击腹壁选择刺入点。刀伤会一直留着，直到点复位。"}
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        useStudio.getState().setBayonetHasEntry(false);
                        useStudio.getState().setBayonetPen(0);
                      }}
                      disabled={!bayonetHasEntry}
                      className={cn(
                        "inline-flex h-10 items-center justify-center gap-1.5 rounded-md border text-xs font-medium",
                        bayonetHasEntry
                          ? "border-border bg-surface-2 text-fg hover:text-fg"
                          : "border-border bg-bg text-muted opacity-50",
                      )}
                    >
                      <Repeat className="size-3.5" />
                      再次刺入
                    </button>
                    <Toggle
                      active={bayonetAuto}
                      onClick={() => setBayonetAuto(!bayonetAuto)}
                      icon={<Zap className="size-3.5" />}
                      label="自动刺入"
                    />
                    <Toggle
                      active={bayonetPump}
                      onClick={() => setBayonetPump(!bayonetPump)}
                      icon={<ChevronsUpDown className="size-3.5" />}
                      label="抽插"
                    />
                  </div>
                  {bayonetHasEntry ? (
                    <label className="mt-3 block">
                      <span className="mb-1.5 flex items-center justify-between text-xs text-muted">
                        <span>刺入深度</span>
                        <span className="tabular-nums text-fg">{bayonetPen.toFixed(2)}</span>
                      </span>
                      <Slider.Root
                        value={[bayonetPen]}
                        min={0}
                        max={1}
                        step={0.01}
                        onValueChange={(v) => {
                          const n = v[0];
                          if (typeof n === "number") setBayonetPen(n);
                        }}
                        className="relative flex h-5 w-full touch-none items-center"
                      >
                        <Slider.Track className="relative h-1 grow rounded-full bg-surface-2">
                          <Slider.Range className="absolute h-full rounded-full bg-accent" />
                        </Slider.Track>
                        <Slider.Thumb className="block size-3.5 rounded-full bg-fg shadow-sm outline-none ring-2 ring-transparent focus-visible:ring-accent" />
                      </Slider.Root>
                    </label>
                  ) : null}
                </div>
              ) : null}

              {interactMode === "strike" ? (
                <div className="mt-3">
                  <p className="mb-1.5 text-xs text-muted">力度档位</p>
                  <div className="grid grid-cols-4 gap-1">
                    {STRIKE_LEVELS.map((lv) => (
                      <button
                        key={lv.id}
                        type="button"
                        onClick={() => setParam("strikeForce", lv.force)}
                        className={cn(
                          "h-9 rounded-md border text-[11px] font-medium",
                          Math.abs(strikeForce - lv.force) < 0.06
                            ? "border-accent bg-accent text-accent-fg"
                            : "border-border bg-surface-2 text-muted hover:text-fg",
                        )}
                      >
                        {lv.label}
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-col gap-3">
                    <label className="block">
                      <span className="mb-1.5 flex items-center justify-between text-xs text-muted">
                        <span>力度</span>
                        <span className="tabular-nums text-fg">{strikeForce.toFixed(2)}</span>
                      </span>
                      <Slider.Root
                        value={[strikeForce]}
                        min={0.1}
                        max={1}
                        step={0.01}
                        onValueChange={([v]) => {
                          if (typeof v === "number") setParam("strikeForce", v);
                        }}
                        className="relative flex h-5 w-full touch-none items-center"
                      >
                        <Slider.Track className="relative h-1 grow rounded-full bg-surface-2">
                          <Slider.Range className="absolute h-full rounded-full bg-accent" />
                        </Slider.Track>
                        <Slider.Thumb className="block size-3.5 rounded-full bg-fg shadow-sm outline-none ring-2 ring-transparent focus-visible:ring-accent" />
                      </Slider.Root>
                    </label>
                    <label className="block">
                      <span className="mb-1.5 flex items-center justify-between text-xs text-muted">
                        <span>范围</span>
                        <span className="tabular-nums text-fg">{strikeRange.toFixed(2)}</span>
                      </span>
                      <Slider.Root
                        value={[strikeRange]}
                        min={0.1}
                        max={1}
                        step={0.01}
                        onValueChange={([v]) => {
                          if (typeof v === "number") setParam("strikeRange", v);
                        }}
                        className="relative flex h-5 w-full touch-none items-center"
                      >
                        <Slider.Track className="relative h-1 grow rounded-full bg-surface-2">
                          <Slider.Range className="absolute h-full rounded-full bg-accent" />
                        </Slider.Track>
                        <Slider.Thumb className="block size-3.5 rounded-full bg-fg shadow-sm outline-none ring-2 ring-transparent focus-visible:ring-accent" />
                      </Slider.Root>
                    </label>
                    <label className="block">
                      <span className="mb-1.5 flex items-center justify-between text-xs text-muted">
                        <span>回弹速度</span>
                        <span className="tabular-nums text-fg">{strikeRebound.toFixed(2)}</span>
                      </span>
                      <Slider.Root
                        value={[strikeRebound]}
                        min={0}
                        max={1}
                        step={0.01}
                        onValueChange={([v]) => {
                          if (typeof v === "number") setParam("strikeRebound", v);
                        }}
                        className="relative flex h-5 w-full touch-none items-center"
                      >
                        <Slider.Track className="relative h-1 grow rounded-full bg-surface-2">
                          <Slider.Range className="absolute h-full rounded-full bg-accent" />
                        </Slider.Track>
                        <Slider.Thumb className="block size-3.5 rounded-full bg-fg shadow-sm outline-none ring-2 ring-transparent focus-visible:ring-accent" />
                      </Slider.Root>
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={() => fireStrike(null)}
                    className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-accent text-sm font-medium text-accent-fg transition-transform duration-quick ease-smooth-out active:scale-[0.98]"
                  >
                    <Zap className="size-4" />
                    释放冲击
                  </button>
                </div>
              ) : null}

              <button
                type="button"
                onClick={resetSim}
                className="mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-border bg-surface-2 text-sm font-medium text-fg transition-transform duration-quick ease-smooth-out active:scale-[0.98]"
              >
                <RotateCcw className="size-4" />
                复位
              </button>
              <p className="mt-3 text-xs text-muted">
                {grabbing
                  ? interactMode === "pose"
                    ? poseEditMode === "rotate"
                      ? "旋转关节"
                      : poseEditMode === "move"
                        ? "移动节点"
                        : "调姿中"
                    : interactMode === "bayonet"
                      ? "拖刀中"
                      : "拖拽中"
                  : interactMode === "strike"
                    ? "击腹就绪"
                    : interactMode === "fist"
                      ? "拳交：拖动手臂插入"
                      : interactMode === "bayonet"
                        ? bayonetHasEntry
                          ? "刺刀：拖动刺入"
                          : "刺刀：点击选择刺入点"
                        : "待机"}
              </p>
            </>
          ) : null}

          {panel === "pose" ? (
            <>
              <p className="mb-3 text-xs leading-relaxed text-muted">
                选择编辑方式后在角色上点骨骼。不会自动打开骨骼显示，需要时可在设置里打开。
              </p>
              <p className="mb-1.5 text-xs text-muted">姿势编辑</p>
              <div className="grid grid-cols-3 gap-1">
                {(
                  [
                    { id: "ik" as const, label: "拖动", icon: <Hand className="size-3.5" /> },
                    { id: "rotate" as const, label: "关节旋转", icon: <Rotate3d className="size-3.5" /> },
                    { id: "move" as const, label: "节点移动", icon: <Move className="size-3.5" /> },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setInteractMode("pose");
                      setPoseEditMode(item.id);
                    }}
                    className={cn(
                      "inline-flex h-10 items-center justify-center gap-1 rounded-md text-[11px] font-medium",
                      interactMode === "pose" && poseEditMode === item.id
                        ? "bg-accent text-accent-fg"
                        : "border border-border bg-surface-2 text-muted hover:text-fg",
                    )}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                {poseEditMode === "ik"
                  ? "点关节或骨骼，拖末端位置。骨骼会跟着摆。"
                  : poseEditMode === "rotate"
                    ? "点关节后拖红/绿/蓝环，绕该轴旋转。"
                    : "点关节后拖坐标轴，移动该节点。"}
                {selectedBoneName ? ` 当前：${selectedBoneName}` : ""}
              </p>
              <button
                type="button"
                onClick={() => setGazeFollow(!gazeFollow)}
                className={cn(
                  "mt-3 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-md text-[12px] font-medium",
                  gazeFollow ? "bg-accent text-accent-fg" : "border border-border bg-surface-2 text-muted hover:text-fg",
                )}
              >
                <Eye className="size-3.5" />
                视线跟随
              </button>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">
                开启后眼睛和脖子在人类活动范围内看向镜头。转到背后超出范围时会停止注视。
              </p>
              <button
                type="button"
                onClick={() => setBlinkEnabled(!blinkEnabled)}
                className={cn(
                  "mt-3 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-md text-[12px] font-medium",
                  blinkEnabled ? "bg-accent text-accent-fg" : "border border-border bg-surface-2 text-muted hover:text-fg",
                )}
              >
                <Eye className="size-3.5" />
                眨眼
              </button>
              <label className="mt-3 block">
                <span className="mb-1.5 flex items-center justify-between text-xs text-muted">
                  <span>左眼睁开</span>
                  <span className="tabular-nums text-fg">{eyeOpenL.toFixed(2)}</span>
                </span>
                <Slider.Root
                  value={[eyeOpenL]}
                  min={0}
                  max={1}
                  step={0.01}
                  onValueChange={([v]) => {
                    if (typeof v === "number") setEyeOpenL(v);
                  }}
                  className="relative flex h-5 w-full touch-none items-center"
                >
                  <Slider.Track className="relative h-1 grow rounded-full bg-surface-2">
                    <Slider.Range className="absolute h-full rounded-full bg-accent" />
                  </Slider.Track>
                  <Slider.Thumb className="block size-3.5 rounded-full bg-fg shadow-sm outline-none ring-2 ring-transparent focus-visible:ring-accent" />
                </Slider.Root>
              </label>
              <label className="mt-3 block">
                <span className="mb-1.5 flex items-center justify-between text-xs text-muted">
                  <span>右眼睁开</span>
                  <span className="tabular-nums text-fg">{eyeOpenR.toFixed(2)}</span>
                </span>
                <Slider.Root
                  value={[eyeOpenR]}
                  min={0}
                  max={1}
                  step={0.01}
                  onValueChange={([v]) => {
                    if (typeof v === "number") setEyeOpenR(v);
                  }}
                  className="relative flex h-5 w-full touch-none items-center"
                >
                  <Slider.Track className="relative h-1 grow rounded-full bg-surface-2">
                    <Slider.Range className="absolute h-full rounded-full bg-accent" />
                  </Slider.Track>
                  <Slider.Thumb className="block size-3.5 rounded-full bg-fg shadow-sm outline-none ring-2 ring-transparent focus-visible:ring-accent" />
                </Slider.Root>
              </label>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">
                左右眼可单独闭。滑块 1 全睁，0 全闭。眨眼频率和速度在设置里调。
              </p>
              <label className="mt-3 block">
                <span className="mb-1.5 flex items-center justify-between text-xs text-muted">
                  <span>张嘴</span>
                  <span className="tabular-nums text-fg">{mouthOpen.toFixed(2)}</span>
                </span>
                <Slider.Root
                  value={[mouthOpen]}
                  min={0}
                  max={1}
                  step={0.01}
                  onValueChange={([v]) => {
                    if (typeof v === "number") setMouthOpen(v);
                  }}
                  className="relative flex h-5 w-full touch-none items-center"
                >
                  <Slider.Track className="relative h-1 grow rounded-full bg-surface-2">
                    <Slider.Range className="absolute h-full rounded-full bg-accent" />
                  </Slider.Track>
                  <Slider.Thumb className="block size-3.5 rounded-full bg-fg shadow-sm outline-none ring-2 ring-transparent focus-visible:ring-accent" />
                </Slider.Root>
              </label>
              {(
                [
                  { label: "嘴唇幅度", value: mouthLipAmp, min: 0.3, max: 2, set: setMouthLipAmp },
                  { label: "张嘴幅度", value: mouthAmp, min: 0.3, max: 2, set: setMouthAmp },
                  { label: "下巴幅度", value: mouthChinAmp, min: 0, max: 2, set: setMouthChinAmp },
                ] as const
              ).map((item) => (
                <label key={item.label} className="mt-3 block">
                  <span className="mb-1.5 flex items-center justify-between text-xs text-muted">
                    <span>{item.label}</span>
                    <span className="tabular-nums text-fg">{item.value.toFixed(2)}</span>
                  </span>
                  <Slider.Root
                    value={[item.value]}
                    min={item.min}
                    max={item.max}
                    step={0.01}
                    onValueChange={([v]) => {
                      if (typeof v === "number") item.set(v);
                    }}
                    className="relative flex h-5 w-full touch-none items-center"
                  >
                    <Slider.Track className="relative h-1 grow rounded-full bg-surface-2">
                      <Slider.Range className="absolute h-full rounded-full bg-accent" />
                    </Slider.Track>
                    <Slider.Thumb className="block size-3.5 rounded-full bg-fg shadow-sm outline-none ring-2 ring-transparent focus-visible:ring-accent" />
                  </Slider.Root>
                </label>
              ))}
              <p className="mt-1.5 text-xs leading-relaxed text-muted">
                下巴幅度只调下巴开合。下牙随张嘴绕关节打开，不受下巴幅度影响。
              </p>
              {(
                [
                  { label: "嘴角", value: mouthSmile, min: -1, max: 1, set: setMouthSmile },
                  { label: "嘟嘴", value: mouthPucker, min: 0, max: 1, set: setMouthPucker },
                  { label: "嘴宽", value: mouthWidth, min: -1, max: 1, set: setMouthWidth },
                ] as const
              ).map((item) => (
                <label key={item.label} className="mt-3 block">
                  <span className="mb-1.5 flex items-center justify-between text-xs text-muted">
                    <span>{item.label}</span>
                    <span className="tabular-nums text-fg">{item.value.toFixed(2)}</span>
                  </span>
                  <Slider.Root
                    value={[item.value]}
                    min={item.min}
                    max={item.max}
                    step={0.01}
                    onValueChange={([v]) => {
                      if (typeof v === "number") item.set(v);
                    }}
                    className="relative flex h-5 w-full touch-none items-center"
                  >
                    <Slider.Track className="relative h-1 grow rounded-full bg-surface-2">
                      <Slider.Range className="absolute h-full rounded-full bg-accent" />
                    </Slider.Track>
                    <Slider.Thumb className="block size-3.5 rounded-full bg-fg shadow-sm outline-none ring-2 ring-transparent focus-visible:ring-accent" />
                  </Slider.Root>
                </label>
              ))}
              <p className="mt-4 mb-1.5 text-xs text-muted">表情</p>
              <div className="grid grid-cols-4 gap-1">
                {EXPRESSIONS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setExpression(item.id)}
                    className={cn(
                      "h-9 rounded-md border text-[11px] font-medium",
                      expression === item.id
                        ? "border-accent bg-accent text-accent-fg"
                        : "border-border bg-surface-2 text-muted hover:text-fg",
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <p className="mt-3 mb-1.5 text-xs text-muted">动作</p>
              <div className="grid grid-cols-3 gap-1">
                {POSES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setPose(item.id)}
                    className={cn(
                      "h-9 rounded-md border text-[11px] font-medium",
                      pose === item.id
                        ? "border-accent bg-accent text-accent-fg"
                        : "border-border bg-surface-2 text-muted hover:text-fg",
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <p className="mt-3 mb-1.5 text-xs text-muted">手势</p>
              <div className="grid grid-cols-2 gap-1">
                {(
                  [
                    { id: "L" as const, label: "左手" },
                    { id: "R" as const, label: "右手" },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setHandSide(item.id)}
                    className={cn(
                      "h-9 rounded-md border text-[11px] font-medium",
                      handSide === item.id
                        ? "border-accent bg-accent text-accent-fg"
                        : "border-border bg-surface-2 text-muted hover:text-fg",
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="mt-1.5 grid grid-cols-3 gap-1">
                {HAND_GESTURES.map((item) => {
                  const current = handSide === "L" ? handGestureL : handGestureR;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setHandGesture(item.id)}
                      className={cn(
                        "h-9 rounded-md border px-1 text-[11px] font-medium",
                        current === item.id
                          ? "border-accent bg-accent text-accent-fg"
                          : "border-border bg-surface-2 text-muted hover:text-fg",
                      )}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">
                先选左右手，再选手势。两只手可分别设定。
              </p>
            </>
          ) : null}

          {panel === "tools" ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
              <Wrench className="size-6 text-muted" />
              <p className="text-sm text-fg">工具</p>
              <p className="text-xs text-muted">测量、截图等工具稍后加入</p>
            </div>
          ) : null}

          {panel === "weapons" ? (
            <div className="flex flex-col gap-3">
              <p className="text-xs leading-relaxed text-muted">
                点腹壁确定刺入点。拖动改角度和深度；按住右键时滚轮调深度。刀伤保留到复位。
              </p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setBayonetKind("short")}
                  className={cn(
                    "flex aspect-square flex-col items-center justify-center gap-1 rounded-md border text-[11px] font-medium",
                    interactMode === "bayonet" && bayonetKind === "short"
                      ? "border-accent bg-accent text-accent-fg"
                      : "border-border bg-surface-2 text-muted hover:text-fg",
                  )}
                >
                  <Sword className="size-5" />
                  刺刀
                </button>
                <button
                  type="button"
                  onClick={() => setBayonetKind("long")}
                  className={cn(
                    "flex aspect-square flex-col items-center justify-center gap-1 rounded-md border text-[11px] font-medium",
                    interactMode === "bayonet" && bayonetKind === "long"
                      ? "border-accent bg-accent text-accent-fg"
                      : "border-border bg-surface-2 text-muted hover:text-fg",
                  )}
                >
                  <Sword className="size-5" />
                  长刺刀
                </button>
                {Array.from({ length: 4 }, (_, i) => (
                  <div
                    key={i}
                    className="flex aspect-square items-center justify-center rounded-md border border-dashed border-border bg-surface-2/50 text-muted"
                  >
                    <Crosshair className="size-4 opacity-40" />
                  </div>
                ))}
              </div>
              {interactMode === "bayonet" ? (
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-muted">
                    {bayonetHasEntry
                      ? `${bayonetKind === "long" ? "长刺刀" : "刺刀"}刺入点已锁定。刀刃可全部没入，刀柄停在体外。`
                      : bayonetAuto
                        ? "自动刺入已开：点腹壁后会垂直刺入，再等待下一次。"
                        : "装备中 · 点击腹壁选择刺入点。"}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        useStudio.getState().setBayonetHasEntry(false);
                        useStudio.getState().setBayonetPen(0);
                      }}
                      disabled={!bayonetHasEntry}
                      className={cn(
                        "inline-flex h-10 items-center justify-center gap-1.5 rounded-md border text-xs font-medium",
                        bayonetHasEntry
                          ? "border-border bg-surface-2 text-fg"
                          : "border-border bg-bg text-muted opacity-50",
                      )}
                    >
                      <Repeat className="size-3.5" />
                      再次刺入
                    </button>
                    <Toggle
                      active={bayonetAuto}
                      onClick={() => setBayonetAuto(!bayonetAuto)}
                      icon={<Zap className="size-3.5" />}
                      label="自动刺入"
                    />
                    <Toggle
                      active={bayonetPump}
                      onClick={() => setBayonetPump(!bayonetPump)}
                      icon={<ChevronsUpDown className="size-3.5" />}
                      label="抽插"
                    />
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted">点击刺刀装备。</p>
              )}
            </div>
          ) : null}
        </div>
      </aside>

      <div className="pointer-events-none absolute bottom-auto left-4 hidden items-center gap-2 text-xs text-muted sm:bottom-6 sm:flex">
        <Hand className="size-3.5" />
        <span>
          {interactMode === "pose"
            ? poseEditMode === "rotate"
              ? "关节旋转"
              : poseEditMode === "move"
                ? "节点移动"
                : "姿势拖动"
            : interactMode === "strike"
              ? "击腹"
              : interactMode === "fist"
                ? "拳交"
                : interactMode === "bayonet"
                  ? bayonetKind === "long"
                    ? "长刺刀"
                    : "刺刀"
                  : "拖拽"}
        </span>
        <span className="text-border">/</span>
        <Activity className="size-3.5" />
        <span>右键旋转 · 左键点身体 · 按住右键滚轮调刺入深度 · T 切换互动 · X 透视</span>
      </div>
        </>
      )}
    </div>
  );
}

function CameraMenu({ onClose }: { onClose: () => void }) {
  const live = useStudio((s) => s.cameraLive);
  const presets = useStudio((s) => s.cameraPresets);
  const presetIndex = useStudio((s) => s.cameraPresetIndex);
  const camFocus = useStudio((s) => s.camFocus);
  const saveCameraPreset = useStudio((s) => s.saveCameraPreset);
  const applyCameraPreset = useStudio((s) => s.applyCameraPreset);
  const setCamFocus = useStudio((s) => s.setCamFocus);
  const setCameraZoom = useStudio((s) => s.setCameraZoom);
  const panCamera = useStudio((s) => s.panCamera);
  const abdomenXray = useStudio((s) => s.abdomenXray);
  const setParam = useStudio((s) => s.setParam);
  const dist = Math.hypot(live.px - live.tx, live.py - live.ty, live.pz - live.tz);
  const focuses: { id: CamFocus; label: string }[] = [
    { id: "face", label: "面部" },
    { id: "chest", label: "胸部" },
    { id: "belly", label: "腹部" },
    { id: "groin", label: "阴部" },
  ];
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const onDragStart = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button")) return;
    const el = panelRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    dragRef.current = { px: e.clientX, py: e.clientY, x: r.left, y: r.top };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onDragMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    if ((e.buttons & 1) === 0) {
      dragRef.current = null;
      return;
    }
    const el = panelRef.current;
    const w = el?.offsetWidth ?? 256;
    const h = el?.offsetHeight ?? 240;
    const x = Math.max(8, Math.min(window.innerWidth - w - 8, d.x + e.clientX - d.px));
    const y = Math.max(8, Math.min(window.innerHeight - Math.min(h, 80) - 8, d.y + e.clientY - d.py));
    setPos({ x, y });
  };
  const onDragEnd = (e: PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const pad =
    "inline-flex size-9 items-center justify-center rounded-md border border-border/40 bg-surface/30 text-muted hover:bg-surface/55 hover:text-fg";

  return (
    <div
      ref={panelRef}
      className={cn(
        "pointer-events-auto absolute z-30 flex max-h-[calc(100dvh-5rem)] w-64 flex-col overflow-hidden rounded-xl border border-border/40 bg-surface/40 backdrop-blur-[2px]",
        pos ? "" : "top-16 right-4 sm:top-6 sm:right-28",
      )}
      style={pos ? { left: pos.x, top: pos.y, right: "auto" } : undefined}
    >
      <div
        className="flex shrink-0 cursor-grab items-center justify-between border-b border-border/40 px-3 py-1.5 active:cursor-grabbing"
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
      >
        <span className="inline-flex items-center gap-1.5 text-sm font-medium">
          <GripHorizontal className="size-3.5 text-muted" />
          摄像机
        </span>
        <button type="button" className="text-xs text-muted hover:text-fg" onClick={onClose}>
          关闭
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-3" style={{ WebkitOverflowScrolling: "touch" }}>
        <p className="mb-1.5 text-xs text-muted">视角预设</p>
        <div className="flex flex-col gap-1">
          {presets.map((snap, i) => (
            <div key={i} className="flex gap-1">
              <button
                type="button"
                disabled={!snap}
                onClick={() => applyCameraPreset(i)}
                className={cn(
                  "h-8 flex-1 rounded-md border text-[11px] font-medium",
                  presetIndex === i
                    ? "border-accent bg-accent/80 text-accent-fg"
                    : snap
                      ? "border-border/40 bg-surface/30 text-fg"
                      : "border-border/40 bg-surface/20 text-muted",
                )}
              >
                预设{i + 1}
                {snap ? "" : " · 空"}
              </button>
              <button
                type="button"
                onClick={() => saveCameraPreset(i)}
                className="h-8 shrink-0 rounded-md border border-border/40 bg-surface/30 px-2.5 text-[11px] font-medium text-muted hover:text-fg"
              >
                保存
              </button>
            </div>
          ))}
        </div>

        <p className="mt-3 mb-1.5 text-xs text-muted">视觉中心</p>
        <div className="grid grid-cols-4 gap-1">
          {focuses.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setCamFocus(item.id)}
              className={cn(
                "h-8 rounded-md border text-[11px] font-medium",
                camFocus === item.id
                  ? "border-accent bg-accent/80 text-accent-fg"
                  : "border-border/40 bg-surface/30 text-muted hover:text-fg",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <p className="mt-3 mb-1.5 text-xs text-muted">摄像机控制</p>
        <label className="block">
          <span className="mb-1.5 flex items-center justify-between text-xs text-muted">
            <span>缩放</span>
            <span className="tabular-nums text-fg">{dist.toFixed(2)}</span>
          </span>
          <Slider.Root
            value={[dist]}
            min={0.12}
            max={4}
            step={0.01}
            onValueChange={([v]) => {
              if (typeof v === "number") setCameraZoom(v);
            }}
            className="relative flex h-5 w-full touch-none items-center"
          >
            <Slider.Track className="relative h-1 grow rounded-full bg-surface-2/50">
              <Slider.Range className="absolute h-full rounded-full bg-accent" />
            </Slider.Track>
            <Slider.Thumb className="block size-3.5 rounded-full bg-fg shadow-sm outline-none ring-2 ring-transparent focus-visible:ring-accent" />
          </Slider.Root>
        </label>
        <div className="mt-3 flex items-center justify-center gap-4">
          <div className="grid grid-cols-3 gap-1">
            <span className="size-9" />
            <button type="button" aria-label="上" className={pad} onClick={() => panCamera(0, 0.08, 0)}>
              <ArrowUp className="size-4" />
            </button>
            <span className="size-9" />
            <button type="button" aria-label="左" className={pad} onClick={() => panCamera(-0.08, 0, 0)}>
              <ArrowLeft className="size-4" />
            </button>
            <span className="size-9" />
            <button type="button" aria-label="右" className={pad} onClick={() => panCamera(0.08, 0, 0)}>
              <ArrowRight className="size-4" />
            </button>
            <span className="size-9" />
            <button type="button" aria-label="下" className={pad} onClick={() => panCamera(0, -0.08, 0)}>
              <ArrowDown className="size-4" />
            </button>
            <span className="size-9" />
          </div>
          <div className="flex flex-col gap-1">
            <button type="button" className={cn(pad, "w-10 text-[11px]")} onClick={() => panCamera(0, 0, 0.08)}>
              前
            </button>
            <button type="button" className={cn(pad, "w-10 text-[11px]")} onClick={() => panCamera(0, 0, -0.08)}>
              后
            </button>
          </div>
        </div>

        <p className="mt-3 mb-1.5 text-xs text-muted">透视</p>
        <button
          type="button"
          onClick={() => setParam("abdomenXray", abdomenXray > 0.05 ? 0 : 0.38)}
          className={cn(
            "mb-2 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border text-[11px] font-medium",
            abdomenXray > 0.05
              ? "border-accent bg-accent/80 text-accent-fg"
              : "border-border/40 bg-surface/30 text-muted hover:text-fg",
          )}
        >
          <Scan className="size-3.5" />
          {abdomenXray > 0.05 ? "透视开" : "透视关"}
        </button>
        <label className="block">
          <span className="mb-1.5 flex items-center justify-between text-xs text-muted">
            <span>腹部半透明</span>
            <span className="tabular-nums text-fg">{abdomenXray.toFixed(2)}</span>
          </span>
          <Slider.Root
            value={[abdomenXray]}
            min={0}
            max={1}
            step={0.01}
            onValueChange={([v]) => {
              if (typeof v === "number") setParam("abdomenXray", v);
            }}
            className="relative flex h-5 w-full touch-none items-center"
          >
            <Slider.Track className="relative h-1 grow rounded-full bg-surface-2/50">
              <Slider.Range className="absolute h-full rounded-full bg-accent" />
            </Slider.Track>
            <Slider.Thumb className="block size-3.5 rounded-full bg-fg shadow-sm outline-none ring-2 ring-transparent focus-visible:ring-accent" />
          </Slider.Root>
        </label>
      </div>
    </div>
  );
}

function SliderRow(item: (typeof SLIDERS)[number]) {
  const value = useStudio((s) => s[item.id]) as number;
  const setParam = useStudio((s) => s.setParam);
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between text-xs text-muted">
        <span>{item.label}</span>
        <span className="tabular-nums text-fg">{value.toFixed(item.step < 0.01 ? 3 : 2)}</span>
      </span>
      <Slider.Root
        value={[value]}
        min={item.min}
        max={item.max}
        step={item.step}
        onValueChange={([v]) => {
          if (typeof v === "number") setParam(item.id, v);
        }}
        className="relative flex h-5 w-full touch-none items-center"
      >
        <Slider.Track className="relative h-1 grow rounded-full bg-surface-2">
          <Slider.Range className="absolute h-full rounded-full bg-accent" />
        </Slider.Track>
        <Slider.Thumb className="block size-3.5 rounded-full bg-fg shadow-sm outline-none ring-2 ring-transparent focus-visible:ring-accent" />
      </Slider.Root>
    </label>
  );
}

function Toggle({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-10 items-center justify-center gap-1.5 rounded-md border text-xs font-medium transition-colors duration-fast",
        active
          ? "border-accent/40 bg-surface-2 text-fg"
          : "border-border bg-bg text-muted hover:text-fg",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
