import * as THREE from "three"

// Ported from the vanilla Three.js "webgl-bath" project's Fruits.ts (same
// pool/fruit demo, different codebase) - identical fruit-generation logic,
// just stripped of TypeScript syntax since this project is plain JSX.

export const FRUIT_TYPES = [
  "watermelon",
  "orange",
  "lemon",
  "lime",
  "apple",
  "grape",
]

export const DECORATIVE_FRUIT_TYPES = FRUIT_TYPES.filter(
  (t) => t !== "watermelon"
)

function createCanvas(w, h) {
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")
  return { canvas, ctx }
}

// All skins are painted as an equirectangular strip (u = around the fruit,
// v = pole to pole) so they wrap cleanly around a sphere geometry instead
// of looking like a flat printed disc.

function paintWatermelonSkin(ctx, w, h) {
  ctx.fillStyle = "#4caa4f"
  ctx.fillRect(0, 0, w, h)

  const stripes = 10
  ctx.strokeStyle = "#2f7a3a"
  for (let i = 0; i < stripes; i++) {
    const baseX = (i / stripes) * w
    ctx.lineWidth = w * 0.022
    ctx.beginPath()
    for (let y = 0; y <= h; y += 4) {
      const wobble = Math.sin(y * 0.06 + i * 1.7) * w * 0.015
      const x = baseX + wobble
      if (y === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }

  ctx.fillStyle = "rgba(255,255,255,0.08)"
  for (let i = 0; i < 200; i++) {
    const x = Math.random() * w
    const y = Math.random() * h
    ctx.beginPath()
    ctx.arc(x, y, Math.random() * 2, 0, Math.PI * 2)
    ctx.fill()
  }
}

function paintCitrusSkin(ctx, w, h, base, dimple) {
  ctx.fillStyle = base
  ctx.fillRect(0, 0, w, h)

  ctx.fillStyle = dimple
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * w
    const y = Math.random() * h
    const r = Math.random() * 1.6 + 0.4
    ctx.globalAlpha = 0.12 + Math.random() * 0.18
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

// Grayscale height map (mid-gray = neutral) used as a bump map so citrus
// peel actually catches light unevenly instead of just looking painted-on.
function createCitrusBumpTexture() {
  const w = 512
  const h = 256
  const { canvas, ctx } = createCanvas(w, h)
  ctx.fillStyle = "#808080"
  ctx.fillRect(0, 0, w, h)
  for (let i = 0; i < 3200; i++) {
    const x = Math.random() * w
    const y = Math.random() * h
    const r = 1.4 + Math.random() * 2.6
    const raised = Math.random() < 0.55
    const shade = raised ? 255 : 0
    ctx.fillStyle = `rgba(${shade},${shade},${shade},${
      0.45 + Math.random() * 0.35
    })`
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.needsUpdate = true
  return texture
}

function paintAppleSkin(ctx, w, h) {
  // Blush varies going AROUND the fruit (more red on one side, more
  // green/yellow on the other), with soft irregular mottled patches -
  // a pole-to-pole gradient plus vertical stripes reads as an onion, not
  // an apple.
  const gradient = ctx.createLinearGradient(0, 0, w, 0)
  gradient.addColorStop(0.0, "#9ec244")
  gradient.addColorStop(0.32, "#d94a3a")
  gradient.addColorStop(0.55, "#b81f28")
  gradient.addColorStop(0.78, "#d94a3a")
  gradient.addColorStop(1.0, "#9ec244")
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, w, h)

  for (let i = 0; i < 100; i++) {
    const x = Math.random() * w
    const y = Math.random() * h
    const r = w * (0.015 + Math.random() * 0.05)
    const darker = Math.random() < 0.55
    ctx.fillStyle = darker
      ? `rgba(100,15,20,${0.05 + Math.random() * 0.12})`
      : `rgba(255,190,110,${0.04 + Math.random() * 0.1})`
    ctx.beginPath()
    ctx.ellipse(
      x,
      y,
      r,
      r * (0.55 + Math.random() * 0.5),
      Math.random() * Math.PI,
      0,
      Math.PI * 2
    )
    ctx.fill()
  }

  ctx.fillStyle = "rgba(255,240,210,0.35)"
  for (let i = 0; i < 220; i++) {
    const x = Math.random() * w
    const y = Math.random() * h
    ctx.beginPath()
    ctx.arc(x, y, Math.random() * 1.4 + 0.3, 0, Math.PI * 2)
    ctx.fill()
  }

  const highlight = ctx.createLinearGradient(0, 0, 0, h * 0.3)
  highlight.addColorStop(0, "rgba(255,255,255,0.18)")
  highlight.addColorStop(1, "rgba(255,255,255,0)")
  ctx.fillStyle = highlight
  ctx.fillRect(0, 0, w, h * 0.3)
}

function paintGrapeSkin(ctx, w, h) {
  ctx.fillStyle = "#4a1f6b"
  ctx.fillRect(0, 0, w, h)

  const highlight = ctx.createLinearGradient(0, 0, 0, h * 0.45)
  highlight.addColorStop(0, "rgba(255,255,255,0.1)")
  highlight.addColorStop(1, "rgba(255,255,255,0)")
  ctx.fillStyle = highlight
  ctx.fillRect(0, 0, w, h * 0.45)

  ctx.fillStyle = "rgba(30,10,45,0.25)"
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * w
    const y = h * 0.4 + Math.random() * h * 0.6
    const r = 3 + Math.random() * 6
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
}

function createSkinTexture(type) {
  const w = 512
  const h = 256
  const { canvas, ctx } = createCanvas(w, h)
  switch (type) {
    case "watermelon":
      paintWatermelonSkin(ctx, w, h)
      break
    case "orange":
      paintCitrusSkin(ctx, w, h, "#f2941c", "#c9740f")
      break
    case "lemon":
      paintCitrusSkin(ctx, w, h, "#f4e04d", "#d8bf2c")
      break
    case "lime":
      paintCitrusSkin(ctx, w, h, "#8fd14f", "#5da52c")
      break
    case "apple":
      paintAppleSkin(ctx, w, h)
      break
    case "grape":
      paintGrapeSkin(ctx, w, h)
      break
  }
  ctx.filter = "brightness(1.25) saturate(1.08)"
  ctx.drawImage(canvas, 0, 0)
  ctx.filter = "none"
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.needsUpdate = true
  return texture
}

// Displaces a sphere's vertices with a few overlapping sine waves in
// spherical coordinates, producing gentle organic lumps/dents instead of a
// perfectly round ball - used for the lime's squashed, irregular shape.
function deformSphere(geometry, amount) {
  const pos = geometry.attributes.position
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const len = v.length()
    if (len < 1e-6) continue
    const dir = v.clone().divideScalar(len)
    const theta = Math.atan2(dir.z, dir.x)
    const phi = Math.acos(THREE.MathUtils.clamp(dir.y, -1, 1))
    let n = 0
    n += Math.sin(theta * 2.3 + phi * 3.1) * 0.5
    n += Math.sin(theta * 4.1 - phi * 2.4 + 1.3) * 0.3
    n += Math.cos(theta * 1.6 + phi * 5.2) * 0.25
    const displacement = 1 + n * amount
    v.copy(dir).multiplyScalar(len * displacement)
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  pos.needsUpdate = true
  geometry.computeVertexNormals()
}

// A short woody stem poking out of a round fruit's top pole.
function createStem(radius, color) {
  const height = radius * 0.3
  const geometry = new THREE.CylinderGeometry(
    radius * 0.05,
    radius * 0.08,
    height,
    8
  )
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.75 })
  const stem = new THREE.Mesh(geometry, material)
  stem.castShadow = true
  stem.userData.stemHeight = height
  return stem
}

function createRoundFruit(
  type,
  radius,
  scaleXZ,
  scaleY,
  roughness = 0.55,
  options = {}
) {
  const texture = createSkinTexture(type)
  const geometry = new THREE.SphereGeometry(radius, 32, 24)
  geometry.scale(scaleXZ, scaleY, scaleXZ)
  if (options.lumpy) {
    deformSphere(geometry, options.lumpy)
  }
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    roughness,
    metalness: 0.02,
  })
  if (options.bumpScale) {
    material.bumpMap = createCitrusBumpTexture()
    material.bumpScale = options.bumpScale
  }
  const mesh = new THREE.Mesh(geometry, material)
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.userData.fruitType = type

  if (!options.stemColor) {
    return mesh
  }

  const group = new THREE.Group()
  group.add(mesh)

  const stem = createStem(radius, options.stemColor)
  const stemHeight = stem.userData.stemHeight
  const topY = radius * scaleY
  stem.position.y = topY + stemHeight / 2 - radius * 0.08
  stem.rotation.z = (Math.random() - 0.5) * 0.35
  stem.rotation.x = (Math.random() - 0.5) * 0.35
  group.add(stem)

  group.userData.fruitType = type
  return group
}

// Creates a volumetric fruit (sphere based, not a flat printed disc), sized
// so its overall radius is roughly `radius`.
export function createFruitObject(type, radius = 0.2) {
  switch (type) {
    case "watermelon":
      return createRoundFruit(type, radius, 1, 0.92)
    case "lemon":
      return createRoundFruit(type, radius, 0.88, 1.12, 0.6, {
        bumpScale: 0.012,
        stemColor: 0x6b5a35,
      })
    case "lime":
      return createRoundFruit(type, radius, 0.95, 0.9, 0.6, {
        lumpy: 0.035,
        bumpScale: 0.035,
        stemColor: 0x4a7c3f,
      })
    case "orange":
      return createRoundFruit(type, radius, 1, 1, 0.65, {
        bumpScale: 0.04,
        stemColor: 0x5a3d24,
      })
    case "grape":
      return createRoundFruit(type, radius, 1, 1.05, 0.65, {
        stemColor: 0x5a3d24,
      })
    case "apple":
      return createRoundFruit(type, radius, 1, 0.9, 0.45, {
        stemColor: 0x5a3d24,
      })
    default:
      return createRoundFruit(type, radius, 1, 1, 0.6, {
        stemColor: 0x5a3d24,
      })
  }
}
