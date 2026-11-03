import { CameraControls, Environment } from "@react-three/drei"
import { useControls } from "leva"
import CameraControlsImpl from "camera-controls"

import { Scene } from "./Scene"
import { Audio } from "./Audio"

// Mouse-wheel zoom turned off (kept for drag-to-orbit/pan) so the wheel is
// free to scroll the page instead of always zooming the camera first -
// this also means camera-controls stops calling preventDefault() on wheel
// events, so native page scroll just works without any hand-off logic.
const MOUSE_BUTTONS = {
  left: CameraControlsImpl.ACTION.ROTATE,
  right: CameraControlsImpl.ACTION.TRUCK,
  middle: CameraControlsImpl.ACTION.DOLLY,
  wheel: CameraControlsImpl.ACTION.NONE
}

export const Experience = ({ isMobile }) => {
  // Interactive color parameters
  const { BACKGROUND } = useControls("Sky", {
    BACKGROUND: { value: "#fcffdc", label: "Background" }
  })

  return (
    <>
      <Environment preset="forest" environmentIntensity={0.5} />
      <ambientLight intensity={1.0} />

      <directionalLight
        position={[13, 5, 5]}
        castShadow
        intensity={2.5}
        shadow-mapSize={[1024, 1024]}
      >
        <orthographicCamera
          attach="shadow-camera"
          left={-30}
          right={30}
          top={30}
          bottom={-30}
        />
      </directionalLight>

      <Audio />

      <CameraControls
        maxPolarAngle={Math.PI / 2.2}
        maxDistance={isMobile ? 45 : 80}
        minDistance={isMobile ? 9 : 15}
        mouseButtons={MOUSE_BUTTONS}
      />

      <color attach="background" args={[BACKGROUND]} />
      <fog attach="fog" args={[BACKGROUND, 120, 150]} />

      <Scene />
    </>
  )
}
