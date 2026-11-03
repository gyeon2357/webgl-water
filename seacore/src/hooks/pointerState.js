// Mutable, non-reactive pointer/touch world position on the water plane.
// Written by the Water component's pointer handlers, read every frame by
// Fruits for the push-away interaction. Deliberately NOT zustand state -
// updating that store on every pointermove would re-render the whole
// React tree on every mouse move, which we don't want for something this
// high-frequency.
//
// Starts far off in the distance so nothing is "pushed" before the
// pointer has actually touched the water.
export const pointerState = {
  x: 9999,
  z: 9999,
}
