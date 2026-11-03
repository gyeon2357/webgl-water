import { PositionalAudio } from "@react-three/drei"
import { useStore } from "../hooks/useStore"

export const Audio = () => {
  const audioEnabled = useStore((state) => state.audioEnabled)

  // Prefixed with the app's base path (import.meta.env.BASE_URL) instead of
  // a hardcoded leading "/" - this project is now served from
  // /webgl-water/seacore/ rather than the site root, so a raw "/sounds/..."
  // path was 404ing the moment sound got turned on. That failed audio load
  // was what froze the page on a white screen when the Sound button was
  // pressed.
  const base = import.meta.env.BASE_URL

  return (
    audioEnabled && (
      <>
        <group position={[0, 0, 0]}>
          <PositionalAudio
            autoplay
            loop
            url={`${base}sounds/waves.mp3`}
            distance={50}
          />
        </group>

        <group position={[-65, 35, -55]}>
          <PositionalAudio
            autoplay
            loop
            url={`${base}sounds/birds.mp3`}
            distance={30}
          />
        </group>
      </>
    )
  )
}
