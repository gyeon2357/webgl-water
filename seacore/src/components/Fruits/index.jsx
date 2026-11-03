import * as THREE from "three"
import { useEffect, useMemo, useRef } from "react"
import { useFrame, useThree } from "@react-three/fiber"

import { useStore } from "../../hooks/useStore"
import { useIsMobile } from "../../hooks/useIsMobile"
import { pointerState } from "../../hooks/pointerState"
import { createFruitObject } from "./fruitFactory"

// Replaces the island (Terrain + Rocks) with a scatter of floating fruit,
// reusing the fruit-generation logic from the vanilla "webgl-bath" pool
// demo (now the "bathcore" sibling project). Radii there were tuned for a
// ~2-unit-wide pool; this scene's water plane and camera work at a much
// larger scale, so everything is scaled up to match.
const SCALE = 9
// Mobile's camera sits noticeably closer (see App.jsx's MOBILE_CAMERA)
// than desktop's, so fruit at the same world-space size as desktop reads
// much bigger on screen - big enough that individual fruit (especially
// the watermelon) could extend past the edge of the frame. Shrinking
// fruit size specifically on mobile keeps them comfortably inside view
// without touching the desktop scale or the world-space area they
// wander/drop within.
const MOBILE_FRUIT_SCALE = 0.65
const COMPOSITION = [
  { type: "watermelon", count: 1, radius: [0.38, 0.38] },
  { type: "orange", count: 3, radius: [0.135, 0.195] },
  { type: "lemon", count: 2, radius: [0.12, 0.165] },
  { type: "lime", count: 2, radius: [0.12, 0.165] },
  { type: "apple", count: 2, radius: [0.135, 0.19] },
  { type: "grape", count: 4, radius: [0.0675, 0.0975] }
]

// How far from the origin fruits spawn - widened so 14 fruits (including
// the much larger watermelon) have real room to land without clipping into
// each other. They're allowed to roam a bit past this (BOUND) before being
// turned back, like bathcore's fruits bouncing gently off the pool walls -
// there's no wall here, just an open stretch of water, so it's a soft
// circular boundary instead of a hard rectangular one.
const SPREAD = 12
// Mobile's narrower portrait frame (and closer/tighter camera - see
// App.jsx's MOBILE_CAMERA) shows much less of the water side-to-side than
// desktop's wide landscape view does, so fruit spawning/wandering out to
// the full desktop-sized SPREAD/BOUND radius kept landing them at or past
// the edge of what's actually visible on a phone. Shrinking both for
// mobile keeps fruit within a radius that's actually on screen.
const MOBILE_SPREAD_SCALE = 0.6
const getSpread = (isMobile) =>
  isMobile ? SPREAD * MOBILE_SPREAD_SCALE : SPREAD
const getBound = (isMobile) => getSpread(isMobile) * 1.25

// Pushes a fruit away from the pointer/finger once it's this close (world
// units). Generous on purpose - this scene's camera sits much farther
// from the water than bathcore's top-down view, so a small radius here
// would need pixel-perfect hovering to ever trigger. Pushed further out
// and made much stronger so the dodge reads clearly even at this camera
// distance.
const POINTER_INFLUENCE_RADIUS = 5.5
const POINTER_PUSH_STRENGTH = 32

// Bounciness for fruit-vs-fruit collisions (ported from bathcore).
const RESTITUTION = 0.55

// A little vertical "boing" layered on top of the water bob whenever a
// fruit gets bumped (by another fruit, the pointer, or landing from its
// intro drop) - a damped spring that snaps back to 0, so a knock reads as
// an actual bounce rather than a silent shove.
const BOUNCE_SPRING_K = 45
const BOUNCE_DAMPING = 5

// Intro drop-in: each fruit starts above the water and falls into place
// one after another instead of simply appearing already floating, mirroring
// bathcore's own intro. Heights/gravity are scaled up by SCALE to match
// this scene's much larger fruit and camera distance - without that, a
// bathcore-sized drop would be over almost before it's visible here. Mobile
// gets extra height on top of that since its closer camera would otherwise
// catch fruit already mid-fall very close to their landing spot.
const FALL_GRAVITY = 1.1 * SCALE
const FALL_SCALE_START = 0.35
const FALL_SCALE_DURATION = 0.4
const DROP_HEIGHT_MIN = 0.9 * SCALE
const DROP_HEIGHT_RANGE = 0.5 * SCALE
const MOBILE_DROP_HEIGHT_BONUS = 1 * SCALE
// Stagger between each fruit's drop so they fall in one at a time in a
// rolling cascade rather than all at once or all frozen mid-air.
const DROP_STAGGER = 0.35

const _cruiseVec = new THREE.Vector2()
const _raycaster = new THREE.Raycaster()
const _waterPlane = new THREE.Plane()
const _ndc = new THREE.Vector2()
const _hit = new THREE.Vector3()

function buildFruits(waterLevel, isMobile) {
  const group = new THREE.Group()
  const props = []
  const placed = []
  // Runs across the whole composition (not reset per fruit type) so the
  // drop-in is one continuous sequential cascade rather than several
  // smaller groups all restarting their stagger from zero.
  let dropIndex = 0

  for (const { type, count, radius } of COMPOSITION) {
    const [minR, maxR] = radius
    for (let i = 0; i < count; i++) {
      const r =
        (minR + Math.random() * (maxR - minR)) *
        SCALE *
        (isMobile ? MOBILE_FRUIT_SCALE : 1)
      const object = createFruitObject(type, r)

      // Rejection sampling so fruits don't spawn (and therefore land)
      // clipped into one another - re-roll a spot if it lands too close to
      // an already-placed fruit. More attempts than before now that
      // there's more fruit sharing the same wider area.
      let x = 0
      let z = 0
      for (let attempt = 0; attempt < 40; attempt++) {
        const spread = getSpread(isMobile)
        x = (Math.random() * 2 - 1) * spread
        z = (Math.random() * 2 - 1) * spread
        const tooClose = placed.some(
          (other) => Math.hypot(x - other.x, z - other.z) < r + other.r + 0.5
        )
        if (!tooClose) break
      }
      placed.push({ x, z, r })

      // Starts above the water - the frame loop drops it in on a stagger.
      // Hidden until it actually starts falling so it doesn't just hang
      // awkwardly in mid-air during its stagger delay.
      const dropStartY =
        waterLevel +
        DROP_HEIGHT_MIN +
        Math.random() * DROP_HEIGHT_RANGE +
        (isMobile ? MOBILE_DROP_HEIGHT_BONUS : 0)
      object.position.set(x, dropStartY, z)
      object.visible = false
      object.rotation.y = Math.random() * Math.PI * 2
      object.rotation.z = (Math.random() - 0.5) * 0.3
      group.add(object)

      // Wander/cruise setup, ported from bathcore's decorative fruits: a
      // lazy drifting direction that slowly turns over time, so fruits
      // amble around the water instead of sitting frozen in place.
      const wanderAngle = Math.random() * Math.PI * 2
      const cruiseSpeed = 0.4 + Math.random() * 0.55

      props.push({
        object,
        type,
        radius: r,
        phase: Math.random() * Math.PI * 2,
        bobSpeed: 0.5 + Math.random() * 0.4,
        bobAmount: (0.15 + Math.random() * 0.15) * (SCALE / 9),
        spinAxis: new THREE.Vector3(
          Math.random() * 2 - 1,
          Math.random() * 2 - 1,
          Math.random() * 2 - 1
        ).normalize(),
        spinSpeed: 0.15 + Math.random() * 0.25,
        wanderAngle,
        wanderSpeed: 0.4 + Math.random() * 0.55,
        cruiseSpeed,
        // .x / .y here are world x / z (matches bathcore's convention).
        velocity: new THREE.Vector2(
          Math.cos(wanderAngle),
          Math.sin(wanderAngle)
        ).multiplyScalar(cruiseSpeed),
        bounceOffset: 0,
        bounceVel: 0,
        dropping: true,
        dropDelay: dropIndex * DROP_STAGGER + Math.random() * 0.15,
        fallVelocityY: 0,
        fallScale: 0
      })
      dropIndex += 1
    }
  }

  return { group, props }
}

// Pushes two overlapping fruits apart and bounces their velocities off
// each other, weighted by mass (~ radius^3) - ported directly from
// bathcore's FloatingFruits.ts fruit-vs-fruit collision.
function resolveCollision(a, b) {
  const dx = b.object.position.x - a.object.position.x
  const dz = b.object.position.z - a.object.position.z
  const dist = Math.sqrt(dx * dx + dz * dz)
  const minDist = a.radius + b.radius
  if (dist >= minDist || dist < 1e-5) return

  const nx = dx / dist
  const nz = dz / dist
  const overlap = minDist - dist

  const massA = a.radius ** 3
  const massB = b.radius ** 3
  const totalMass = massA + massB

  // Blocking: separate them so they don't sit inside one another.
  const pushA = overlap * (massB / totalMass)
  const pushB = overlap * (massA / totalMass)
  a.object.position.x -= nx * pushA
  a.object.position.z -= nz * pushA
  b.object.position.x += nx * pushB
  b.object.position.z += nz * pushB

  // Bounce + inertia: reflect the closing velocity, preserving momentum.
  const rvx = b.velocity.x - a.velocity.x
  const rvz = b.velocity.y - a.velocity.y
  const relVelAlongNormal = rvx * nx + rvz * nz
  if (relVelAlongNormal >= 0) return // already separating

  const impulse =
    (-(1 + RESTITUTION) * relVelAlongNormal) / (1 / massA + 1 / massB)
  const impX = impulse * nx
  const impZ = impulse * nz
  a.velocity.x -= impX / massA
  a.velocity.y -= impZ / massA
  b.velocity.x += impX / massB
  b.velocity.y += impZ / massB

  // A real bump makes both fruits pop up a little, not just slide apart.
  const kick = Math.min(0.6, Math.abs(relVelAlongNormal) * 0.5)
  a.bounceVel -= kick
  b.bounceVel -= kick
}

export function Fruits() {
  const waterLevel = useStore((state) => state.waterLevel)
  const waveSpeed = useStore((state) => state.waveSpeed)
  const waveAmplitude = useStore((state) => state.waveAmplitude)
  const ready = useStore((state) => state.ready)
  const isMobile = useIsMobile()

  const { group, props } = useMemo(() => buildFruits(waterLevel, isMobile), [])
  const elapsed = useRef(0)
  const { camera, gl } = useThree()

  // Track the pointer/finger's world position directly with native
  // browser events + manual raycasting against the water's height plane,
  // the same approach bathcore's InputManager uses - rather than relying
  // on hovering a specific mesh (which can be finicky once CameraControls
  // and other objects are also listening on the same canvas). Mouse
  // updates continuously on hover; touch only updates while a finger is
  // actually down and dragging, since touch devices have no "hover".
  useEffect(() => {
    const dom = gl.domElement
    let touchActive = false

    const updateFromClient = (clientX, clientY) => {
      const rect = dom.getBoundingClientRect()
      _ndc.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      )
      _raycaster.setFromCamera(_ndc, camera)
      _waterPlane.set(new THREE.Vector3(0, 1, 0), -waterLevel)
      if (_raycaster.ray.intersectPlane(_waterPlane, _hit)) {
        pointerState.x = _hit.x
        pointerState.z = _hit.z
      }
    }

    const onPointerMove = (e) => {
      if (e.pointerType === "touch" && !touchActive) return
      updateFromClient(e.clientX, e.clientY)
    }
    const onPointerDown = (e) => {
      if (e.pointerType === "touch") touchActive = true
      updateFromClient(e.clientX, e.clientY)
    }
    const onPointerUp = () => {
      touchActive = false
      pointerState.x = 9999
      pointerState.z = 9999
    }

    window.addEventListener("pointermove", onPointerMove)
    window.addEventListener("pointerdown", onPointerDown)
    window.addEventListener("pointerup", onPointerUp)
    window.addEventListener("pointercancel", onPointerUp)
    return () => {
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("pointerdown", onPointerDown)
      window.removeEventListener("pointerup", onPointerUp)
      window.removeEventListener("pointercancel", onPointerUp)
    }
  }, [camera, gl, waterLevel])

  useFrame((_, rawDelta) => {
    // Nothing here should advance while the intro overlay still hides the
    // scene - otherwise the drop-in stagger and fall/scale-up easing can
    // play out entirely behind the loading screen, so by the time the
    // reveal opens the fruits are already sitting static at full size
    // instead of actually dropping in.
    if (!ready) return

    // Guard against a huge delta (tab was backgrounded, etc.) blowing up
    // the physics in one jump.
    const delta = Math.min(rawDelta, 0.05)
    elapsed.current += delta

    // The water surface itself bobs uniformly up and down (see
    // Water/shaders/vertex.glsl's sineOffset) rather than waving per-point,
    // so matching that exact formula here keeps the fruit genuinely
    // resting on the surface instead of floating independently of it.
    const globalBob = Math.sin(elapsed.current * waveSpeed) * waveAmplitude

    for (const p of props) {
      // Still waiting its turn, or still falling in from above - handled
      // entirely separately from the normal floating behaviour below, the
      // same way bathcore's own intro drop skips straight past wander/
      // pointer-push/collision for anything still on its way down.
      if (p.dropping) {
        if (p.dropDelay > 0) {
          p.dropDelay -= delta
          continue
        }
        if (!p.object.visible) {
          p.object.visible = true
          p.object.scale.setScalar(FALL_SCALE_START)
        }
        // Grow from a small starting scale up to full size over the fall,
        // so the fruit reads as arriving from a distance instead of
        // snapping straight to full size the moment it appears.
        if (p.fallScale < 1) {
          p.fallScale = Math.min(1, p.fallScale + delta / FALL_SCALE_DURATION)
          const eased = 1 - Math.pow(1 - p.fallScale, 3)
          p.object.scale.setScalar(
            FALL_SCALE_START + (1 - FALL_SCALE_START) * eased
          )
        }

        p.fallVelocityY -= FALL_GRAVITY * delta
        p.object.position.y += p.fallVelocityY * delta
        p.object.rotateOnWorldAxis(p.spinAxis, p.spinSpeed * delta * 2.5)

        // Land the instant it reaches the (bobbing) surface - matched to
        // exactly the same height formula the floating branch below uses,
        // so it doesn't overshoot into the water or hover above it.
        const idleBob =
          Math.sin(elapsed.current * p.bobSpeed + p.phase) * p.bobAmount
        const restY = waterLevel + globalBob + idleBob
        if (p.object.position.y <= restY) {
          p.object.position.y = restY
          p.dropping = false
          p.fallScale = 1
          p.object.scale.setScalar(1)
          // No real water sim here to splash into, so the landing's payoff
          // is a "plop" bounce instead, reusing the same spring that
          // handles pointer/collision knocks.
          p.bounceVel = 2.5
        }
        continue
      }

      // Gentle random wander: slowly turn the cruising direction so the
      // fruit ambles around instead of moving in a dead-straight line.
      p.wanderAngle += (Math.random() - 0.5) * p.wanderSpeed * delta
      _cruiseVec.set(
        Math.cos(p.wanderAngle) * p.cruiseSpeed,
        Math.sin(p.wanderAngle) * p.cruiseSpeed
      )

      // Push away from the pointer/finger when it's nearby.
      const dx = p.object.position.x - pointerState.x
      const dz = p.object.position.z - pointerState.z
      const dist = Math.sqrt(dx * dx + dz * dz)
      if (dist < POINTER_INFLUENCE_RADIUS && dist > 1e-4) {
        const pushFactor = 1 - dist / POINTER_INFLUENCE_RADIUS
        const push = POINTER_PUSH_STRENGTH * pushFactor * delta
        p.velocity.x += (dx / dist) * push
        p.velocity.y += (dz / dist) * push
        p.bounceVel = Math.max(p.bounceVel, pushFactor * 6)
      }

      // Relax back towards the lazy cruising velocity over time so a push
      // (from the pointer or a bounce) doesn't linger forever. Slower than
      // bathcore's own relax rate - this scene's camera sits much farther
      // back, so the "fleeing" motion needs to last a bit longer to read
      // clearly instead of snapping back to a lazy drift almost at once.
      p.velocity.lerp(_cruiseVec, Math.min(1, delta * 0.5))

      p.object.position.x += p.velocity.x * delta
      p.object.position.z += p.velocity.y * delta

      // Turn back once past the roaming boundary - a soft bounce off an
      // invisible circular edge rather than a hard pool wall, since this
      // scene is an open expanse of water.
      const distFromCenter = Math.hypot(
        p.object.position.x,
        p.object.position.z
      )
      const bound = getBound(isMobile)
      if (distFromCenter > bound) {
        const nx = p.object.position.x / distFromCenter
        const nz = p.object.position.z / distFromCenter
        const velAlongNormal = p.velocity.x * nx + p.velocity.y * nz
        if (velAlongNormal > 0) {
          // Reflect the outward component and damp it (0.6x back), the
          // same restitution bathcore uses bouncing off its pool walls.
          p.velocity.x -= nx * velAlongNormal * 1.6
          p.velocity.y -= nz * velAlongNormal * 1.6
        }
        p.object.position.x = nx * bound
        p.object.position.z = nz * bound
      }
    }

    // Fruit-vs-fruit collisions: bounce + inertia + can't overlap. Skips
    // anything still dropping in, same as bathcore - and skips the
    // watermelon entirely, since its much larger radius (mass ~ radius^3)
    // meant any small fruit drifting close got flung away by a single
    // oversized shove instead of a natural-looking bump.
    for (let i = 0; i < props.length; i++) {
      for (let j = i + 1; j < props.length; j++) {
        if (props[i].dropping || props[j].dropping) continue
        if (props[i].type === "watermelon" || props[j].type === "watermelon")
          continue
        resolveCollision(props[i], props[j])
      }
    }

    for (const p of props) {
      // Still falling/waiting - its position and rotation were already
      // fully handled above, so leave it alone here.
      if (p.dropping) continue

      // Damped spring: bounceOffset chases back to 0, giving a springy
      // "boing" after a push/collision/landing instead of an instant snap
      // back.
      p.bounceVel -= p.bounceOffset * BOUNCE_SPRING_K * delta
      p.bounceVel *= Math.max(0, 1 - BOUNCE_DAMPING * delta)
      p.bounceOffset += p.bounceVel * delta

      const idleBob =
        Math.sin(elapsed.current * p.bobSpeed + p.phase) * p.bobAmount
      p.object.position.y = waterLevel + globalBob + idleBob + p.bounceOffset
      p.object.rotateOnWorldAxis(p.spinAxis, p.spinSpeed * delta)
    }
  })

  return <primitive object={group} />
}
