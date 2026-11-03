import { useEffect, useState } from "react"

// Shared viewport-width breakpoint so the camera framing, zoom limits, and
// fruit drop height can all agree on what counts as "mobile" - re-evaluates
// on resize/orientation change so rotating a tablet mid-session still gets
// the right answer.
const BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth <= BREAKPOINT : false
  )

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${BREAKPOINT}px)`)
    const handleChange = (e) => setIsMobile(e.matches)
    mq.addEventListener("change", handleChange)
    return () => mq.removeEventListener("change", handleChange)
  }, [])

  return isMobile
}
