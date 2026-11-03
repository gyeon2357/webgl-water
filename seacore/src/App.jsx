import clsx from "clsx"
import { Suspense } from "react"
import { Canvas } from "@react-three/fiber"
import { AdaptiveDpr } from "@react-three/drei"
import { Leva } from "leva"

import { Experience } from "./components/Experience"
import { UI } from "./ui"
import { Loading } from "./ui/Loading"
import { Skip } from "./ui/Skip"

import { useStore } from "./hooks/useStore"
import { useIsMobile } from "./hooks/useIsMobile"
import { useScrollHandoff } from "./hooks/useScrollHandoff"
import { useViewportSize } from "./hooks/useViewportSize"

import s from "./ui/ui.module.scss"
import app from "./App.module.scss"

// Slightly-from-above starting angle instead of the old near-flat view.
// Mobile gets a noticeably narrower/closer framing - the desktop distance
// and field of view left far too much open water visible around the fruit
// cluster on a phone screen.
const DESKTOP_CAMERA = { position: [26, 24, -26], fov: 35 }
const MOBILE_CAMERA = { position: [21, 20, -21], fov: 36 }

// White/light control panel instead of Leva's default dark theme.
const LEVA_COLORS = {
  elevation1: "#f4f4f4",
  elevation2: "#ffffff",
  elevation3: "#e8e8e8",
  accent1: "#4f46e5",
  accent2: "#4338ca",
  accent3: "#3730a3",
  highlight1: "#9a9a9a",
  highlight2: "#4b4b4b",
  highlight3: "#111111",
  vivid1: "#f59e0b",
  folderWidgetColor: "#111111",
  folderTextColor: "#111111",
  toolTipBackground: "#111111",
  toolTipText: "#ffffff"
}

// Leva's default panel width (rootWidth, ~280px) is comfortable on
// desktop but eats a large share of a phone's screen width - narrowed
// specifically on mobile via Leva's own theme.sizes API.
const LEVA_DESKTOP_WIDTH = "280px"
const LEVA_MOBILE_WIDTH = "180px"

const BRAND_SECTION_ID = "brand-intro"

function App() {
  const ready = useStore((state) => state.ready)
  const isMobile = useIsMobile()
  const { scrollToNext } = useScrollHandoff(ready, BRAND_SECTION_ID)
  const viewportSize = useViewportSize()

  const levaTheme = {
    colors: LEVA_COLORS,
    sizes: { rootWidth: isMobile ? LEVA_MOBILE_WIDTH : LEVA_DESKTOP_WIDTH }
  }

  return (
    <>
      <Loading />
      <Suspense>
        {/* heroWrapper/heroPin: the 3D scene stays pinned (position:
            sticky) for a bit of extra scroll before it's allowed to
            scroll away and reveal the section below - see
            App.module.scss and useScrollHandoff for the rest of the
            mechanics (wheel/touch hand-off, the Skip button). */}
        <div className={app.heroWrapper}>
          <div className={app.heroPin}>
            <div className={clsx(s.transition, { [s.show]: ready })}>
              <Leva theme={levaTheme} hidden={!ready} collapsed />

              {/* Explicit pixel size from useViewportSize instead of
                  letting Canvas measure this element's own CSS box - see
                  that hook for why: it keeps the render aspect ratio tied
                  to the real viewport instead of whatever the
                  heroWrapper/heroPin/transition chain reports on a given
                  mobile browser. */}
              <div
                className={app.canvasFrame}
                style={{
                  width: viewportSize.width,
                  height: viewportSize.height
                }}
              >
                <Canvas
                  camera={isMobile ? MOBILE_CAMERA : DESKTOP_CAMERA}
                  shadows
                >
                  <Experience isMobile={isMobile} />
                  <AdaptiveDpr pixelated />
                </Canvas>
              </div>

              <UI />
              <Skip visible={ready} onClick={scrollToNext} />
            </div>
          </div>
        </div>
      </Suspense>

      {/* Placeholder next section - real brand/reservation content comes
          later. */}
      <section id={BRAND_SECTION_ID} className={app.brandIntro}>
        <h2>브랜드 소개</h2>
        <p>여기에 실제 브랜드/예약 안내 콘텐츠가 들어갈 예정입니다.</p>
      </section>
    </>
  )
}

export default App
