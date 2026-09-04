import { lazy, Suspense, useEffect, useState } from "react";
import { Overlay } from "./overlay";
import { useModelAssets } from "@/lib/load-models";

const Scene = lazy(() => import("./scene"));

export function StudioApp() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const scenes = useModelAssets(mounted);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-bg text-fg">
      {mounted && scenes ? (
        <Suspense fallback={null}>
          <Scene
            character={scenes.character}
            intestines={scenes.intestines}
            pelvis={scenes.pelvis}
            arm={scenes.arm}
            bayonet={scenes.bayonet}
            bayonetLong={scenes.bayonetLong}
            room={scenes.room}
          />
        </Suspense>
      ) : null}
      <Overlay />
    </main>
  );
}
