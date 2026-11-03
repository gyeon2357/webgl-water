import { clsx } from "clsx"
import { useEffect, useRef, useState } from "react"
import { useProgress } from "@react-three/drei"

import { useStore } from "../../hooks/useStore"

import s from "./loading.module.scss"

// On a cached reload, the network side of loading ("active" from
// useProgress) can finish almost instantly - but the renderer itself
// (shader compilation, the environment map's PMREM convolution) still
// needs real wall-clock time to actually finish, independent of how fast
// the assets came back. Firing the reveal the instant "active" goes false
// let that still-warming-up first frame show through as a flash/darkened
// frame right as the intro opened, specifically on fast/cached reloads
// where this race used to be safely hidden by ordinary network latency.
// Holding for a guaranteed minimum keeps the intro's pacing consistent
// and gives the renderer time to actually be ready before it's revealed.
const MIN_LOADING_MS = 1200

const now = () =>
  typeof performance !== "undefined" ? performance.now() : Date.now()

export const Loading = () => {
  const { active } = useProgress()
  const [showLoader, setShowLoader] = useState(true)
  const [logoVisible, setLogoVisible] = useState(false)

  const ready = useStore((state) => state.ready)
  const setReady = useStore((state) => state.setReady)
  const mountTimeRef = useRef(now())

  // Fades the wordmark in on mount, mirroring bathcore's own intro-logo -
  // deferred a frame so the browser actually paints the opacity:0 starting
  // state first and the CSS transition has something to animate from,
  // instead of the logo just appearing at opacity:1 with no fade.
  useEffect(() => {
    const raf = requestAnimationFrame(() => setLogoVisible(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => {
    if (active) return

    const elapsed = now() - mountTimeRef.current
    const remaining = Math.max(0, MIN_LOADING_MS - elapsed)
    const readyTimer = setTimeout(() => setReady(true), remaining)

    return () => clearTimeout(readyTimer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  // Set a delay time to hide loader, starting once the intro is actually
  // revealed rather than the instant loading finished.
  useEffect(() => {
    if (!ready) return
    const delayHide = setTimeout(() => setShowLoader(false), 5000)
    return () => clearTimeout(delayHide)
  }, [ready])

  return (
    showLoader && (
      <div
        className={clsx(
          s.wrapper,
          { [s.loaded]: !active },
          { [s.hide]: ready }
        )}
      >
        <div className={s.loading}>
          <img
            className={clsx(s.logo, { [s.logoShow]: logoVisible })}
            src={`${import.meta.env.BASE_URL}logo.png`}
            alt="usana"
          />
        </div>
      </div>
    )
  )
}
