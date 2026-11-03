import { useEffect, useState } from "react"

// react-three-fiber's <Canvas> sizes itself by measuring its own DOM
// wrapper via ResizeObserver, which inherits its box from whatever CSS
// ancestor chain it sits in - here that's heroWrapper (140vh/140svh) >
// heroPin (position: sticky, 100vh/100svh) > transition (position:
// absolute, inset: 0). bathcore's vanilla renderer sidesteps all of that
// entirely by sizing itself straight from window.innerWidth/innerHeight
// instead of any CSS box, and that's the one concrete implementation
// difference between the two once this project also runs its scene
// through a sticky/absolute chain rather than a plain full-viewport
// fixed overlay - a mismatch there (mobile browsers resizing vh/svh as
// the address bar shows/hides, sticky's own box being measured before
// layout has fully settled, etc.) would show up exactly as "the whole
// scene renders at the wrong aspect ratio", i.e. everything looking
// zoomed/cropped. Mirroring bathcore's approach - driving the canvas's
// box from the real viewport dimensions instead of trusting the CSS
// chain - removes that whole category of mismatch regardless of which
// specific browser quirk was causing it.
function getSize() {
  if (typeof window === "undefined") return { width: 0, height: 0 }
  const vv = window.visualViewport
  return {
    width: vv ? vv.width : window.innerWidth,
    height: vv ? vv.height : window.innerHeight
  }
}

export function useViewportSize() {
  const [size, setSize] = useState(getSize)

  useEffect(() => {
    const update = () => setSize(getSize())
    update()

    window.addEventListener("resize", update)
    window.addEventListener("orientationchange", update)
    window.visualViewport?.addEventListener("resize", update)
    return () => {
      window.removeEventListener("resize", update)
      window.removeEventListener("orientationchange", update)
      window.visualViewport?.removeEventListener("resize", update)
    }
  }, [])

  return size
}
