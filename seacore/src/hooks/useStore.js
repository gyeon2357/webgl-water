import { create } from "zustand"

export const useStore = create((set) => ({
  ready: false,
  // Raised from 0.9 per the new default.
  waterLevel: 1.4,
  // Bumped up again (was 2.2) for a noticeably faster-moving sea by
  // default - still tunable live from the Water panel (max 3.5).
  waveSpeed: 3.0,
  // Raised from 0.1 per the new default.
  waveAmplitude: 0.25,
  // Bumped up (was 0.05) - this used to be a dead control (captured
  // into the store but never actually wired into the water shader), now
  // fixed (see Water/index.jsx + fragment.glsl's uFoamDepth) so raising
  // the default here genuinely widens the foam speckle coverage for a
  // splashier-looking surface out of the box. Still tunable 0.01-0.5 from
  // the Water panel.
  foamDepth: 0.18,
  audioEnabled: false,

  setAudioEnabled: (enabled) => set(() => ({ audioEnabled: enabled })),
  setReady: (ready) => set(() => ({ ready: ready }))
}))
