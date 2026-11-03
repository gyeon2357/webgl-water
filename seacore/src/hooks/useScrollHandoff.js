import { useCallback, useEffect, useRef } from "react"

// Ported from bathcore's own hero scroll hand-off. Mouse wheel now scrolls
// the page natively - CameraControls' wheel-zoom was turned off (see
// Experience.jsx's mouseButtons prop) specifically so wheel input isn't
// fought over, and with it off camera-controls no longer calls
// preventDefault() on wheel events, so normal page scroll just works.
// Touch still needs a manual hand-off though: a touch drag on the canvas
// is deliberately kept from ever starting a native scroll gesture
// (touch-action: none - see index.css) so it can be used for the
// fruit/water push interaction, so this watches the accumulated drag
// distance instead and, once it passes the threshold, hands off with one
// explicit smooth scroll into the section below. Scrolling back to the
// very top re-arms it, so revisiting the hero behaves the same way again.
const THRESHOLD_RATIO = 0.4

export function useScrollHandoff(ready, nextSectionId) {
  const firedRef = useRef(false)
  const accumRef = useRef(0)
  const lastTouchYRef = useRef(0)

  // Page can't scroll at all until the intro is actually done, mirroring
  // bathcore's own intro-done lock.
  useEffect(() => {
    document.documentElement.classList.toggle("intro-done", ready)
    document.body.classList.toggle("intro-done", ready)
  }, [ready])

  const scrollToNext = useCallback(() => {
    if (firedRef.current) return
    firedRef.current = true
    document
      .getElementById(nextSectionId)
      ?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [nextSectionId])

  useEffect(() => {
    const threshold = () => window.innerHeight * THRESHOLD_RATIO

    const onTouchStart = (e) => {
      lastTouchYRef.current = e.touches[0]?.clientY ?? 0
    }
    const onTouchMove = (e) => {
      if (firedRef.current) return
      const y = e.touches[0]?.clientY ?? lastTouchYRef.current
      accumRef.current += Math.abs(y - lastTouchYRef.current)
      lastTouchYRef.current = y
      if (accumRef.current >= threshold()) scrollToNext()
    }
    // Scrolling back to the very top re-engages the hand-off so the hero
    // can be "swiped past" again on a return visit.
    const onScroll = () => {
      if (window.scrollY < 4) {
        firedRef.current = false
        accumRef.current = 0
      }
    }
    // Some browsers (notably Safari's back-forward cache) can restore a
    // previous scroll position after the page has already loaded, past
    // the point main.jsx's own scrollRestoration fix runs - snapping back
    // to the top here too covers that case.
    const onPageShow = (e) => {
      if (e.persisted) window.scrollTo(0, 0)
    }

    window.addEventListener("touchstart", onTouchStart, { passive: true })
    window.addEventListener("touchmove", onTouchMove, { passive: true })
    window.addEventListener("scroll", onScroll)
    window.addEventListener("pageshow", onPageShow)
    return () => {
      window.removeEventListener("touchstart", onTouchStart)
      window.removeEventListener("touchmove", onTouchMove)
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("pageshow", onPageShow)
    }
  }, [scrollToNext])

  return { scrollToNext }
}
