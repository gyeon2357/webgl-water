import * as THREE from "three";
import type { Water } from "./Water";

// A small pool of falling raindrop meshes: not a full physics system like
// the fruits, just enough to spawn a droplet above the water, let it fall
// a short distance, and remove it (with a small ripple) the moment it
// touches the surface.
interface ActiveDrop {
  mesh: THREE.Mesh;
  velocityY: number;
  x: number;
  z: number;
}

// A vertically-symmetric "raindrop" silhouette (rounded bulb at the
// bottom, tapering to a point at the top) built the same way the round
// fruits are - a lathe revolved around the Y axis - so it reads as a
// teardrop shape when the camera is tilted, even though a purely top-down
// view sees only its circular outline like any other round object here.
function createDropletGeometry(radius: number): THREE.BufferGeometry {
  const segments = 14;
  const points: THREE.Vector2[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments; // 0 = bottom tip of the bulb, 1 = top point
    let r: number;
    let y: number;
    if (t < 0.55) {
      // Rounded bulb: quarter-sine, like the bottom half of a sphere.
      const tt = t / 0.55;
      r = Math.sin(tt * (Math.PI / 2));
      y = -1 + tt * 0.9;
    } else {
      // Taper smoothly up to a point.
      const tt = (t - 0.55) / 0.45;
      r = Math.cos(tt * (Math.PI / 2));
      y = -0.1 + tt * 1.1;
    }
    points.push(new THREE.Vector2(Math.max(r, 0.0001) * radius, y * radius));
  }
  const geometry = new THREE.LatheGeometry(points, 10);
  geometry.computeVertexNormals();
  return geometry;
}

export class RainDrops {
  private scene: THREE.Scene;
  private geometry: THREE.BufferGeometry;
  private material: THREE.Material;
  private active: ActiveDrop[] = [];

  constructor(scene: THREE.Scene, radius = 0.05) {
    this.scene = scene;
    this.geometry = createDropletGeometry(radius);
    // Deliberately NOT transparent: the water surface mesh is also flagged
    // transparent (for its own reflection/refraction blending), and two
    // transparent objects this close together depend on THREE's automatic
    // back-to-front sort to draw in the right order - which was silently
    // getting it wrong here and made the droplet invisible behind the
    // water. An opaque material renders in the normal opaque pass (the
    // same one the fruits use), so it's simply depth-tested against the
    // water like everything else and reliably shows up in front of it.
    this.material = new THREE.MeshStandardMaterial({
      color: 0x8fd0ea,
      emissive: 0x2a5a6e,
      emissiveIntensity: 0.25,
      roughness: 0.08,
      metalness: 0.1,
    });
  }

  // Spawns one droplet at (x, z), a short distance above the given start
  // height, falling straight down.
  spawn(x: number, z: number, startHeight: number) {
    const mesh = new THREE.Mesh(this.geometry, this.material);
    mesh.position.set(x, startHeight, z);
    this.scene.add(mesh);
    this.active.push({ mesh, velocityY: 0, x, z });
  }

  update(seconds: number, water: Water, renderer: THREE.WebGLRenderer) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const drop = this.active[i];
      // A bit heavier than the decorative fruits - a raindrop should fall
      // noticeably quicker/lighter-looking, not drift down slowly - but
      // not so fast it's gone before it registers either.
      drop.velocityY -= 1.7 * seconds;
      drop.mesh.position.y += drop.velocityY * seconds;

      const info = water.getWaterAt(renderer, drop.x, drop.z);
      if (drop.mesh.position.y <= info.height) {
        water.addDrop(
          renderer,
          drop.x,
          drop.z,
          0.02 + Math.random() * 0.015,
          -(0.005 + Math.random() * 0.006)
        );
        this.scene.remove(drop.mesh);
        this.active.splice(i, 1);
      }
    }
  }
}
