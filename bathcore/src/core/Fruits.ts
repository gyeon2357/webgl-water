import * as THREE from "three";

// All fruit types the app knows how to build. "watermelon" is reserved for
// the single main draggable float and is intentionally excluded from the
// decorative pool below.
export const FRUIT_TYPES = [
  "watermelon",
  "orange",
  "lemon",
  "lime",
  "apple",
  "grape",
] as const;

export type FruitType = (typeof FRUIT_TYPES)[number];

// Fruits used for the small decorative floaters that drift around the pool.
export const DECORATIVE_FRUIT_TYPES = FRUIT_TYPES.filter(
  (t) => t !== "watermelon"
) as FruitType[];

// The main draggable float's radius, shared with collision code in
// FloatingFruits so decorative fruit can't clip through it.
export const MAIN_FLOAT_RADIUS = 0.38;

// [min, max] world-unit radius each fruit type is randomly sized within.
export const FRUIT_SIZE_RANGE: Record<FruitType, [number, number]> = {
  watermelon: [MAIN_FLOAT_RADIUS, MAIN_FLOAT_RADIUS],
  orange: [0.135, 0.195],
  lemon: [0.12, 0.165],
  lime: [0.12, 0.165],
  apple: [0.135, 0.19],
  grape: [0.0675, 0.0975],
};

// How far below the sampled water height each fruit's center rests,
// expressed as a multiple of its own radius (bigger = sits lower/heavier).
export const FRUIT_SUBMERGE: Record<FruitType, number> = {
  watermelon: 0.45,
  orange: 0.3,
  lemon: 0.28,
  lime: 0.28,
  apple: 0.3,
  grape: 0.28,
};

function createCanvas(w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  return { canvas, ctx };
}

// All skins are painted as an equirectangular strip (u = around the fruit,
// v = pole to pole) so they wrap cleanly around a sphere/lathe geometry
// instead of looking like a flat printed disc.

function paintWatermelonSkin(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number
) {
  ctx.fillStyle = "#4caa4f";
  ctx.fillRect(0, 0, w, h);

  const stripes = 10;
  ctx.strokeStyle = "#2f7a3a";
  for (let i = 0; i < stripes; i++) {
    const baseX = (i / stripes) * w;
    ctx.lineWidth = w * 0.022;
    ctx.beginPath();
    for (let y = 0; y <= h; y += 4) {
      const wobble = Math.sin(y * 0.06 + i * 1.7) * w * 0.015;
      const x = baseX + wobble;
      if (y === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(255,255,255,0.08)";
  for (let i = 0; i < 200; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    ctx.beginPath();
    ctx.arc(x, y, Math.random() * 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintCitrusSkin(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  base: string,
  dimple: string
) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = dimple;
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = Math.random() * 1.6 + 0.4;
    ctx.globalAlpha = 0.12 + Math.random() * 0.18;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// Grayscale height map (mid-gray = neutral) used as a bump map so citrus
// peel actually catches light unevenly instead of just looking painted-on.
function createCitrusBumpTexture(): THREE.CanvasTexture {
  const w = 512;
  const h = 256;
  const { canvas, ctx } = createCanvas(w, h);
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 3200; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = 1.4 + Math.random() * 2.6;
    const raised = Math.random() < 0.55;
    const shade = raised ? 255 : 0;
    ctx.fillStyle = `rgba(${shade},${shade},${shade},${
      0.45 + Math.random() * 0.35
    })`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

function paintAppleSkin(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // The previous version varied color from pole to pole (dark red middle,
  // yellow-brown at both ends) plus thin vertical pole-to-pole streaks -
  // which is exactly what reads as an onion's papery husk, not an apple.
  // Real apple skin instead has a "blush" that varies going AROUND the
  // fruit (more red on one side, more green/yellow on the other, not
  // symmetric top-to-bottom), with soft irregular mottled patches rather
  // than ordered stripes.
  const gradient = ctx.createLinearGradient(0, 0, w, 0);
  gradient.addColorStop(0.0, "#9ec244");
  gradient.addColorStop(0.32, "#d94a3a");
  gradient.addColorStop(0.55, "#b81f28");
  gradient.addColorStop(0.78, "#d94a3a");
  gradient.addColorStop(1.0, "#9ec244");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  // Soft, irregular mottled blotches (not stripes) - some darker red,
  // some warmer/lighter - for an uneven natural blush.
  for (let i = 0; i < 100; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = w * (0.015 + Math.random() * 0.05);
    const darker = Math.random() < 0.55;
    ctx.fillStyle = darker
      ? `rgba(100,15,20,${0.05 + Math.random() * 0.12})`
      : `rgba(255,190,110,${0.04 + Math.random() * 0.1})`;
    ctx.beginPath();
    ctx.ellipse(
      x,
      y,
      r,
      r * (0.55 + Math.random() * 0.5),
      Math.random() * Math.PI,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }

  // Pale lenticel dots scattered across the skin.
  ctx.fillStyle = "rgba(255,240,210,0.35)";
  for (let i = 0; i < 220; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    ctx.beginPath();
    ctx.arc(x, y, Math.random() * 1.4 + 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  // A soft highlight band near the top suggesting a shiny apple skin.
  const highlight = ctx.createLinearGradient(0, 0, 0, h * 0.3);
  highlight.addColorStop(0, "rgba(255,255,255,0.18)");
  highlight.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = highlight;
  ctx.fillRect(0, 0, w, h * 0.3);
}

function paintGrapeSkin(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = "#4a1f6b";
  ctx.fillRect(0, 0, w, h);

  const highlight = ctx.createLinearGradient(0, 0, 0, h * 0.45);
  highlight.addColorStop(0, "rgba(255,255,255,0.1)");
  highlight.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = highlight;
  ctx.fillRect(0, 0, w, h * 0.45);

  ctx.fillStyle = "rgba(30,10,45,0.25)";
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * w;
    const y = h * 0.4 + Math.random() * h * 0.6;
    const r = 3 + Math.random() * 6;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function createSkinTexture(type: FruitType): THREE.CanvasTexture {
  const w = 512;
  const h = 256;
  const { canvas, ctx } = createCanvas(w, h);
  switch (type) {
    case "watermelon":
      paintWatermelonSkin(ctx, w, h);
      break;
    case "orange":
      paintCitrusSkin(ctx, w, h, "#f2941c", "#c9740f");
      break;
    case "lemon":
      paintCitrusSkin(ctx, w, h, "#f4e04d", "#d8bf2c");
      break;
    case "lime":
      paintCitrusSkin(ctx, w, h, "#8fd14f", "#5da52c");
      break;
    case "apple":
      paintAppleSkin(ctx, w, h);
      break;
    case "grape":
      paintGrapeSkin(ctx, w, h);
      break;
  }
  // Brighten the painted skin overall (fruits were reading a bit dark/
  // muted) by re-compositing the canvas over itself through a brightness
  // filter, rather than tweaking every paint function's individual colors.
  ctx.filter = "brightness(1.25) saturate(1.08)";
  ctx.drawImage(canvas, 0, 0);
  ctx.filter = "none";
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

// Displaces a sphere's vertices with a few overlapping sine waves in
// spherical coordinates, producing gentle organic lumps/dents instead of a
// perfectly round ball - used for the lime's squashed, irregular shape.
function deformSphere(geometry: THREE.BufferGeometry, amount: number) {
  const pos = geometry.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const len = v.length();
    if (len < 1e-6) continue;
    const dir = v.clone().divideScalar(len);
    const theta = Math.atan2(dir.z, dir.x);
    const phi = Math.acos(THREE.MathUtils.clamp(dir.y, -1, 1));
    let n = 0;
    n += Math.sin(theta * 2.3 + phi * 3.1) * 0.5;
    n += Math.sin(theta * 4.1 - phi * 2.4 + 1.3) * 0.3;
    n += Math.cos(theta * 1.6 + phi * 5.2) * 0.25;
    const displacement = 1 + n * amount;
    v.copy(dir).multiplyScalar(len * displacement);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
}

// A short woody stem poking out of a round fruit's top pole.
function createStem(radius: number, color: number): THREE.Mesh {
  const height = radius * 0.3;
  const geometry = new THREE.CylinderGeometry(
    radius * 0.05,
    radius * 0.08,
    height,
    8
  );
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.75 });
  const stem = new THREE.Mesh(geometry, material);
  stem.castShadow = true;
  stem.userData.stemHeight = height;
  return stem;
}

function createRoundFruit(
  type: FruitType,
  radius: number,
  scaleXZ: number,
  scaleY: number,
  roughness = 0.55,
  options: { bumpScale?: number; lumpy?: number; stemColor?: number } = {}
): THREE.Object3D {
  const texture = createSkinTexture(type);
  const geometry = new THREE.SphereGeometry(radius, 32, 24);
  geometry.scale(scaleXZ, scaleY, scaleXZ);
  if (options.lumpy) {
    deformSphere(geometry, options.lumpy);
  }
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    roughness,
    metalness: 0.02,
  });
  if (options.bumpScale) {
    material.bumpMap = createCitrusBumpTexture();
    material.bumpScale = options.bumpScale;
  }
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.fruitType = type;

  if (!options.stemColor) {
    return mesh;
  }

  // Wrap in a group so the fruit + its stem move/rotate together.
  const group = new THREE.Group();
  group.add(mesh);

  const stem = createStem(radius, options.stemColor);
  const stemHeight = stem.userData.stemHeight as number;
  const topY = radius * scaleY; // north pole of the (possibly squashed) sphere
  // Sit mostly on top, embedded slightly so it looks attached rather than
  // stuck on top of the surface.
  stem.position.y = topY + stemHeight / 2 - radius * 0.08;
  stem.rotation.z = (Math.random() - 0.5) * 0.35;
  stem.rotation.x = (Math.random() - 0.5) * 0.35;
  group.add(stem);

  group.userData.fruitType = type;
  return group;
}


// Creates a volumetric fruit (sphere/lathe based, not a flat printed disc),
// sized so its overall radius is roughly `radius`.
export function createFruitObject(
  type: FruitType,
  radius = 0.2
): THREE.Object3D {
  switch (type) {
    case "watermelon":
      return createRoundFruit(type, radius, 1, 0.92);
    case "lemon":
      // A bit less elongated than before (was reading as a rugby ball) -
      // still recognizably lemon-shaped, just closer to round.
      return createRoundFruit(type, radius, 0.88, 1.12, 0.6, {
        bumpScale: 0.012,
        stemColor: 0x6b5a35,
      });
    case "lime":
      // Subtly irregular (not a perfect sphere) but still round enough to
      // read as a lime rather than a pleated dumpling, plus a dimpled
      // citrus peel like the orange/lemon.
      return createRoundFruit(type, radius, 0.95, 0.9, 0.6, {
        lumpy: 0.035,
        bumpScale: 0.035,
        stemColor: 0x4a7c3f,
      });
    case "orange":
      // More pronounced dimpled peel than lemon.
      return createRoundFruit(type, radius, 1, 1, 0.65, {
        bumpScale: 0.04,
        stemColor: 0x5a3d24,
      });
    case "grape":
      // Matte-ish, not glossy.
      return createRoundFruit(type, radius, 1, 1.05, 0.65, {
        stemColor: 0x5a3d24,
      });
    case "apple":
      // Slightly flattened top/bottom (real apples aren't perfectly round)
      // with a woody stem on top, built from the same round-fruit pipeline
      // as the citrus fruits.
      return createRoundFruit(type, radius, 1, 0.9, 0.45, {
        stemColor: 0x5a3d24,
      });
  }
}
