import * as THREE from "three";
import type { Water } from "./Water";
import {
  DECORATIVE_FRUIT_TYPES,
  FRUIT_SIZE_RANGE,
  FRUIT_SUBMERGE,
  createFruitObject,
  type FruitType,
} from "./Fruits";

// How many of each decorative fruit type to spawn. Any type left out (or
// set to 0) simply doesn't appear - this is how "lime" dropped out of the
// rotation without deleting its geometry/texture code.
export type FruitComposition = Partial<Record<FruitType, number>>;

interface FloatProp {
  object: THREE.Object3D;
  radius: number;
  submerge: number;
  phase: number;
  bobSpeed: number;
  bobAmount: number;
  spinAxis: THREE.Vector3;
  spinSpeed: number;
  wanderAngle: number;
  wanderSpeed: number;
  cruiseSpeed: number;
  velocity: THREE.Vector2;
  // Intro drop-in state: the fruit starts above the water and falls into
  // place instead of simply appearing already floating.
  dropping: boolean;
  dropDelay: number;
  fallVelocityY: number;
  // A one-shot ripple queued by a mouse/touch push or a collision this
  // frame (rather than the water rippling continuously on every idle
  // frame, which looked too busy).
  pendingSplash: number;
  // Countdown to this fruit's next ambient "just floating" ripple. Each
  // fruit pings on its own random cadence instead of all of them
  // rippling every frame, so ripples show up one at a time and stay
  // subtle rather than turning into constant overlapping noise.
  ambientRippleTimer: number;
  // 0..1 scale-in progress used while falling, so the fruit grows from
  // small to full size as it drops instead of popping in abruptly at full
  // size the instant it becomes visible.
  fallScale: number;
}

export interface MainFloatObstacle {
  position: THREE.Vector3;
  radius: number;
}

// How close the pointer needs to be (world units) before it starts pushing
// a fruit out of the way, and how strong that push is.
const MOUSE_INFLUENCE_RADIUS = 0.55;
const MOUSE_PUSH_STRENGTH = 1.4;

// Bounciness used for fruit-vs-fruit and fruit-vs-main-float collisions.
const RESTITUTION = 0.55;

// Scale-in animation for a fruit's fall: it appears at this fraction of its
// full size and grows to 1 over this many seconds, so it reads as arriving
// from above rather than popping straight to full size.
const FALL_SCALE_START = 0.35;
const FALL_SCALE_DURATION = 0.4;

export class FloatingFruits {
  props: FloatProp[] = [];
  private elapsed = 0;

  constructor(
    scene: THREE.Scene,
    composition: FruitComposition,
    poolWidth = 2,
    poolLength = 2,
    mainFloat?: MainFloatObstacle
  ) {
    // Flatten the requested composition (e.g. { grape: 4, apple: 2, ... })
    // into a fixed, ordered list of types - one spawn per entry - instead
    // of cycling through every known decorative fruit type by index. Only
    // where each one lands is randomized (below), not which types appear
    // or how many of each.
    const types: FruitType[] = [];
    for (const type of DECORATIVE_FRUIT_TYPES) {
      const n = composition[type] ?? 0;
      for (let i = 0; i < n; i++) types.push(type);
    }
    const count = types.length;
    // Spread spawn points across the whole pool footprint (minus a small
    // margin from the walls) instead of a small fixed patch in the middle,
    // so the fruits land spread out over the whole surface rather than
    // clustered in the center.
    const spreadX = (poolWidth / 2) * 0.82;
    const spreadZ = (poolLength / 2) * 0.82;
    // Purely independent random (x, z) per fruit can land two of them
    // close together by chance - more likely on mobile, where the pool
    // covers a narrower world-space area, so the same spread has less
    // room to work with. Track what's already been placed and re-roll a
    // candidate spot a few times if it would land too close to one of
    // them, so fruits don't touch down clipped together and immediately
    // have to shove apart.
    // Seed with the main float's own spawn spot (if given) so decorative
    // fruits also avoid landing on top of - or right next to - it, not
    // just each other. Without this, a fruit landing right where the
    // watermelon is about to touch down immediately gets shoved aside on
    // its very first "landed" frame.
    const placed: { x: number; z: number; radius: number }[] = mainFloat
      ? [
          {
            x: mainFloat.position.x,
            z: mainFloat.position.z,
            radius: mainFloat.radius,
          },
        ]
      : [];
    for (let i = 0; i < count; i++) {
      const type = types[i];
      const [minR, maxR] = FRUIT_SIZE_RANGE[type];
      const radius = minR + Math.random() * (maxR - minR);
      const object = createFruitObject(type, radius);
      // Start above the water - the update loop drops it in on a stagger
      // instead of having every fruit simply appear already floating.
      // Hidden until it actually starts falling so it doesn't just hang
      // awkwardly in mid-air during its stagger delay.
      const dropStartY = 0.9 + Math.random() * 0.5;

      const minGap = 0.14;
      let spawnX = 0;
      let spawnZ = 0;
      for (let attempt = 0; attempt < 24; attempt++) {
        spawnX = (Math.random() * 2 - 1) * spreadX;
        spawnZ = (Math.random() * 2 - 1) * spreadZ;
        const tooClose = placed.some((other) => {
          const dx = spawnX - other.x;
          const dz = spawnZ - other.z;
          return Math.hypot(dx, dz) < radius + other.radius + minGap;
        });
        if (!tooClose) break;
      }
      placed.push({ x: spawnX, z: spawnZ, radius });

      object.position.set(spawnX, dropStartY, spawnZ);
      object.visible = false;
      object.rotation.y = Math.random() * Math.PI * 2;
      object.rotation.z = (Math.random() - 0.5) * 0.3;

      // A random tumble axis so fruits roll freely in 3D as they drift,
      // like the old duck did, instead of only spinning flat on the spot.
      const spinAxis = new THREE.Vector3(
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
        Math.random() * 2 - 1
      ).normalize();
      scene.add(object);

      const wanderAngle = Math.random() * Math.PI * 2;
      // More ambient motion than before (was reading as too still while
      // just floating) - a livelier bob and a noticeably faster cruise.
      const cruiseSpeed = 0.045 + Math.random() * 0.06;

      this.props.push({
        object,
        radius,
        submerge: FRUIT_SUBMERGE[type],
        phase: Math.random() * Math.PI * 2,
        bobSpeed: 0.9 + Math.random() * 0.6,
        bobAmount: 0.008 + Math.random() * 0.006,
        spinAxis,
        spinSpeed: 0.4 + Math.random() * 0.6,
        wanderAngle,
        wanderSpeed: 0.4 + Math.random() * 0.55,
        cruiseSpeed,
        velocity: new THREE.Vector2(
          Math.cos(wanderAngle),
          Math.sin(wanderAngle)
        ).multiplyScalar(cruiseSpeed),
        dropping: true,
        // Staggered so fruits fall in one at a time rather than all at once.
        // Slower stagger between fruits than before, so each one's fall
        // is a distinct, easy-to-follow moment instead of a quick burst.
        dropDelay: i * 0.9 + Math.random() * 0.3,
        fallVelocityY: 0,
        pendingSplash: 0,
        // Staggered start so all 6 don't happen to line up.
        ambientRippleTimer: 1 + Math.random() * 3,
        fallScale: 0,
      });
    }
  }

  // Pushes two overlapping fruits apart and bounces their velocities off
  // each other, weighted by mass (~ radius^3), so a big fruit barely moves
  // a small one out of the way while a small one bounces off harder.
  private resolvePropCollision(a: FloatProp, b: FloatProp) {
    if (a.dropping || b.dropping) return;
    const dx = b.object.position.x - a.object.position.x;
    const dz = b.object.position.z - a.object.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const minDist = a.radius + b.radius;
    if (dist >= minDist || dist < 1e-5) return;

    const nx = dx / dist;
    const nz = dz / dist;
    const overlap = minDist - dist;

    const massA = a.radius ** 3;
    const massB = b.radius ** 3;
    const totalMass = massA + massB;

    // Blocking: separate them so they don't sit inside one another.
    const pushA = overlap * (massB / totalMass);
    const pushB = overlap * (massA / totalMass);
    a.object.position.x -= nx * pushA;
    a.object.position.z -= nz * pushA;
    b.object.position.x += nx * pushB;
    b.object.position.z += nz * pushB;

    // Bounce + inertia: reflect the closing velocity, preserving momentum.
    const rvx = b.velocity.x - a.velocity.x;
    const rvz = b.velocity.y - a.velocity.y;
    const relVelAlongNormal = rvx * nx + rvz * nz;
    if (relVelAlongNormal >= 0) return; // already separating

    const impulse =
      (-(1 + RESTITUTION) * relVelAlongNormal) / (1 / massA + 1 / massB);
    const impX = impulse * nx;
    const impZ = impulse * nz;
    a.velocity.x -= impX / massA;
    a.velocity.y -= impZ / massA;
    b.velocity.x += impX / massB;
    b.velocity.y += impZ / massB;

    // Queue a splash proportional to how hard they hit, so a real bump
    // makes a visible ripple instead of just bouncing silently.
    const splash = Math.min(0.06, Math.abs(relVelAlongNormal) * 0.05);
    a.pendingSplash = Math.max(a.pendingSplash, splash);
    b.pendingSplash = Math.max(b.pendingSplash, splash);
  }

  // Same idea, but against the (much heavier) main float - treated as
  // immovable from the decorative fruits' point of view.
  private resolveMainObstacle(a: FloatProp, obstacle: MainFloatObstacle) {
    if (a.dropping) return;
    const dx = a.object.position.x - obstacle.position.x;
    const dz = a.object.position.z - obstacle.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const minDist = a.radius + obstacle.radius;
    if (dist >= minDist || dist < 1e-5) return;

    const nx = dx / dist;
    const nz = dz / dist;
    const overlap = minDist - dist;

    a.object.position.x += nx * overlap;
    a.object.position.z += nz * overlap;

    const velAlongNormal = a.velocity.x * nx + a.velocity.y * nz;
    if (velAlongNormal >= 0) return;
    const j = -(1 + RESTITUTION) * velAlongNormal;
    a.velocity.x += nx * j;
    a.velocity.y += nz * j;

    // Bumping into the (much bigger) main float makes a bigger splash than
    // a fruit-vs-fruit tap.
    a.pendingSplash = Math.max(
      a.pendingSplash,
      Math.min(0.08, Math.abs(velAlongNormal) * 0.07)
    );
  }

  // Advances a fruit that's still falling in from above; once it reaches
  // the water it lands (settles onto the surface and splashes) and hands
  // back to the normal per-frame update.
  private updateDrop(
    p: FloatProp,
    seconds: number,
    water: Water,
    renderer: THREE.WebGLRenderer
  ) {
    const { object } = p;
    if (p.dropDelay > 0) {
      p.dropDelay -= seconds;
      return;
    }
    if (!object.visible) {
      // Only appear the moment it actually starts falling, instead of
      // sitting visibly in mid-air for the whole staggered delay. It still
      // pops into existence here (there's no way around that with a
      // top-down camera - "off-screen" isn't a direction), but starting
      // small and growing to full size as it falls (below) reads as
      // "arriving from above/far away" rather than a flat-out appear.
      object.visible = true;
      object.scale.setScalar(FALL_SCALE_START);
    }

    // Grow from a small starting scale up to full size over the fall, so
    // the fruit reads as approaching from a distance instead of snapping
    // straight to full size the moment it appears.
    if (p.fallScale < 1) {
      p.fallScale = Math.min(1, p.fallScale + seconds / FALL_SCALE_DURATION);
      // Ease-out: fast growth at first, settling in gently near full size.
      const eased = 1 - Math.pow(1 - p.fallScale, 3);
      const scale = FALL_SCALE_START + (1 - FALL_SCALE_START) * eased;
      object.scale.setScalar(scale);
    }

    // Slower fall (lighter gravity) than before - a gentler, more
    // floaty descent instead of dropping in quickly.
    p.fallVelocityY -= 1.1 * seconds;
    object.position.y += p.fallVelocityY * seconds;
    object.rotateOnWorldAxis(p.spinAxis, p.spinSpeed * seconds * 2.5);

    const info = water.getWaterAt(renderer, object.position.x, object.position.z);
    const restY = info.height - p.submerge * p.radius;
    if (object.position.y <= restY) {
      object.position.y = restY;
      p.dropping = false;
      // Make sure it's settled at exactly full size once landed, even if
      // it hit the water slightly before the scale-in animation finished.
      p.fallScale = 1;
      object.scale.setScalar(1);
      // A little splash where it lands, roughly scaled to its size.
      water.addDrop(
        renderer,
        object.position.x,
        object.position.z,
        0.03 + p.radius * 0.3,
        -0.018
      );
    }
  }

  update(
    seconds: number,
    water: Water,
    renderer: THREE.WebGLRenderer,
    poolWidth: number,
    poolLength: number,
    mousePoint: THREE.Vector3,
    mainObstacle?: MainFloatObstacle
  ) {
    if (seconds <= 0 || seconds > 1) return;
    this.elapsed += seconds;

    const halfW = poolWidth / 2 - 0.15;
    const halfL = poolLength / 2 - 0.15;

    for (const p of this.props) {
      const { object } = p;

      if (p.dropping) {
        this.updateDrop(p, seconds, water, renderer);
        continue;
      }

      // Gentle random wander: slowly turn a cruising direction so the
      // fruit ambles around instead of moving in a dead-straight line.
      p.wanderAngle += (Math.random() - 0.5) * p.wanderSpeed * seconds;
      const cruise = new THREE.Vector2(
        Math.cos(p.wanderAngle),
        Math.sin(p.wanderAngle)
      ).multiplyScalar(p.cruiseSpeed);

      // Push away from the pointer/finger when it's nearby.
      const dx = object.position.x - mousePoint.x;
      const dz = object.position.z - mousePoint.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < MOUSE_INFLUENCE_RADIUS && dist > 1e-4) {
        const pushFactor = 1 - dist / MOUSE_INFLUENCE_RADIUS;
        const push = MOUSE_PUSH_STRENGTH * pushFactor * seconds;
        p.velocity.x += (dx / dist) * push;
        p.velocity.y += (dz / dist) * push;
        // Small ripple only while actually being pushed by the pointer,
        // not on every idle frame.
        p.pendingSplash = Math.max(p.pendingSplash, pushFactor * 0.015);
      }

      // Relax back towards the lazy cruising velocity over time so a push
      // (from the mouse or a bounce) doesn't linger forever.
      p.velocity.lerp(cruise, Math.min(1, seconds * 1.2));

      object.position.x += p.velocity.x * seconds;
      object.position.z += p.velocity.y * seconds;

      // Bounce gently off the pool walls.
      if (object.position.x < -halfW || object.position.x > halfW) {
        p.velocity.x *= -0.6;
        p.wanderAngle = Math.PI - p.wanderAngle;
      }
      if (object.position.z < -halfL || object.position.z > halfL) {
        p.velocity.y *= -0.6;
        p.wanderAngle = -p.wanderAngle;
      }
      object.position.x = THREE.MathUtils.clamp(
        object.position.x,
        -halfW,
        halfW
      );
      object.position.z = THREE.MathUtils.clamp(
        object.position.z,
        -halfL,
        halfL
      );
    }

    // Fruit-vs-fruit collisions: bounce + inertia + can't overlap.
    for (let i = 0; i < this.props.length; i++) {
      for (let j = i + 1; j < this.props.length; j++) {
        this.resolvePropCollision(this.props[i], this.props[j]);
      }
    }

    // Fruit-vs-main-float collisions.
    if (mainObstacle) {
      for (const p of this.props) {
        this.resolveMainObstacle(p, mainObstacle);
      }
    }

    for (const p of this.props) {
      if (p.dropping) continue;
      const { object } = p;

      // Re-clamp in case a collision pushed a fruit past the wall.
      object.position.x = THREE.MathUtils.clamp(
        object.position.x,
        -halfW,
        halfW
      );
      object.position.z = THREE.MathUtils.clamp(
        object.position.z,
        -halfL,
        halfL
      );

      // Sit on (and slightly in) the real water surface, with a small sine
      // bob layered on top for life.
      const info = water.getWaterAt(
        renderer,
        object.position.x,
        object.position.z
      );
      const bob = Math.sin(this.elapsed * p.bobSpeed + p.phase) * p.bobAmount;
      object.position.y = info.height - p.submerge * p.radius + bob;

      // Free tumble around its own random axis (not just a flat Y spin).
      object.rotateOnWorldAxis(p.spinAxis, p.spinSpeed * seconds);

      // Gentle ambient ripple from just floating around, on its own
      // timer rather than every single frame - so with several fruits on
      // screen they naturally take turns instead of all rippling in a
      // constant overlapping chorus.
      p.ambientRippleTimer -= seconds;
      if (p.ambientRippleTimer <= 0) {
        water.addDrop(
          renderer,
          object.position.x,
          object.position.z,
          0.025 + p.radius * 0.3,
          -0.01
        );
        p.ambientRippleTimer = 2.5 + Math.random() * 3.5;
      }

      // A push from the pointer or a collision this frame queued a splash.
      if (p.pendingSplash > 0) {
        water.addDrop(
          renderer,
          object.position.x,
          object.position.z,
          0.03 + p.radius * 0.4,
          -p.pendingSplash
        );
        p.pendingSplash = 0;
      }
    }
  }
}
