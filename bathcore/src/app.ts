import * as THREE from "three";
import { Water } from "./core/Water";
import { Renderer } from "./core/Renderer";
import { PhysicsEngine } from "./core/Physics";
import { InputManager } from "./core/InputManager";
import { FloatingFruits } from "./core/FloatingFruits";
import { createFruitObject, MAIN_FLOAT_RADIUS } from "./core/Fruits";

export class Application {
  sceneRenderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;

  water: Water;
  renderer: Renderer;
  physics: PhysicsEngine;
  inputManager: InputManager;
  floatingFruits: FloatingFruits;

  skyTexture: THREE.Texture | null = null;

  // Slow-moving average of the main float's target height, used to
  // damp out the buoyancy oscillation so it doesn't bounce so hard.
  private mainFloatRestY = -0.1;

  // Gates the physics/fruit-drop update loop until the intro splash is
  // actually finishing, so the drop-in animation plays out visibly
  // afterwards instead of running (unseen) underneath the intro.
  private simulationStarted = false;

  // Countdown to the next ambient "raindrop" - a small ripple that appears
  // on its own, unrelated to any fruit or the main float, so the water
  // isn't ever perfectly still for long. Sparse and irregularly spaced on
  // purpose (a wide random range, re-rolled each time) rather than a
  // steady rhythm, so it reads as occasional drips rather than a pattern.
  private nextRainDropTime = 2 + Math.random() * 3;

  // Fixed random axis the main float tumbles around - gives it a free 3D
  // roll (like the decorative fruits) instead of only ever yawing to face
  // its direction of travel, which never let it tip/roll to the side.
  private mainFloatSpinAxis: THREE.Vector3 = new THREE.Vector3(
    Math.random() * 2 - 1,
    Math.random() * 2 - 1,
    Math.random() * 2 - 1
  ).normalize();

  // App Config
  containerHeight = 1.4;
  waterFillRatio = 0.7;
  dist = 4;

  constructor() {
    this.sceneRenderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    this.sceneRenderer.setClearColor(new THREE.Color(0, 0, 0));

    this.camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.01,
      100
    );

    // Check capabilities
    this.checkCapabilities();
    const textureType = this.getTextureType();

    // Initialize Modules
    this.water = new Water(textureType);
    this.renderer = new Renderer(textureType);
    this.physics = new PhysicsEngine();
    this.inputManager = new InputManager(
      this.camera,
      this.sceneRenderer.domElement
    );

    // Wire up events
    this.setupEvents();

    // Initial Setup
    this.renderer.setMainFloat(
      createFruitObject("watermelon", MAIN_FLOAT_RADIUS)
    );
    const heroPin = document.getElementById("hero-pin");
    (heroPin ?? document.body).appendChild(this.sceneRenderer.domElement);

    this.loadSkyTexture();
    this.setupScrollHandoff();

    this.updatePoolDimensions();
    this.onResize(); // Initial resize - establishes the real pool footprint

    // These need the real pool footprint (set by onResize above): the main
    // float's drop-in spot is randomized within it, and fruits spawn
    // spread across the whole surface instead of a small fixed patch.
    this.setupDropIn();
    // Pass the main float's just-chosen drop spot so decorative fruits
    // also avoid spawning on top of / right next to it, not just each
    // other. Composition (how many of each fruit type) differs on mobile,
    // where the pool covers less screen space - fewer fruits overall so
    // they don't feel cramped/overlapping.
    // Only the counts of the requested fruits change here - lime keeps
    // spawning too, at its previous small share, untouched by this.
    const isMobile = window.innerWidth < 768;
    const fruitComposition = isMobile
      ? { grape: 3, apple: 1, lemon: 2, orange: 2, lime: 1 }
      : { grape: 4, apple: 2, lemon: 2, orange: 3, lime: 1 };
    this.floatingFruits = new FloatingFruits(
      this.renderer.scene,
      fruitComposition,
      this.physics.poolWidth,
      this.physics.poolLength,
      { position: this.physics.center, radius: MAIN_FLOAT_RADIUS }
    );

    // Provide context to InputManager
    this.inputManager.getContext = () => ({
      center: this.physics.center,
      radius: this.physics.radius,
      poolWidth: this.physics.poolWidth,
      poolLength: this.physics.poolLength,
    });
  }

  private checkCapabilities() {
    if (
      !this.sceneRenderer.capabilities.isWebGL2 &&
      !this.sceneRenderer.extensions.get("OES_texture_float")
    ) {
      throw new Error(
        "Rendering to floating-point textures is required but not supported"
      );
    }

    // Explicitly enable EXT_float_blend to suppress warning and ensure portability
    this.sceneRenderer.extensions.get("EXT_float_blend");
  }

  private getTextureType(): THREE.TextureDataType {
    let textureType: THREE.TextureDataType = THREE.FloatType;
    if (!this.sceneRenderer.extensions.get("OES_texture_float_linear")) {
      textureType = THREE.HalfFloatType;
    }
    return textureType;
  }

  private loadSkyTexture() {
    const skyImg = document.getElementById("sky") as HTMLImageElement;
    if (skyImg) {
      this.skyTexture = new THREE.Texture(skyImg);
      // RepeatWrapping on S so the slow horizontal cloud-drift offset
      // wraps seamlessly instead of smearing the edge pixel.
      this.skyTexture.wrapS = THREE.RepeatWrapping;
      this.skyTexture.wrapT = THREE.ClampToEdgeWrapping;
      this.skyTexture.minFilter = THREE.LinearFilter;
      this.skyTexture.needsUpdate = true;
    }
  }

  private setupEvents() {
    window.addEventListener("resize", this.onResize.bind(this));
    window.addEventListener("resize", this.updateScrollUnlockThreshold.bind(this));

    // Input -> Physics/Water interaction
    this.inputManager.onAddDrop = (x, z) => {
      this.water.addDrop(this.sceneRenderer, x, z, 0.03, 0.02);
    };

    this.inputManager.onMoveSphere = (delta) => {
      this.physics.center.add(delta);
      // Clamp
      this.physics.center.x = Math.max(
        this.physics.radius - this.physics.poolWidth / 2,
        Math.min(
          this.physics.poolWidth / 2 - this.physics.radius,
          this.physics.center.x
        )
      );
      this.physics.center.y = Math.max(
        this.physics.radius - this.physics.poolDepth,
        Math.min(10, this.physics.center.y)
      );
      this.physics.center.z = Math.max(
        this.physics.radius - this.physics.poolLength / 2,
        Math.min(
          this.physics.poolLength / 2 - this.physics.radius,
          this.physics.center.z
        )
      );
    };
  }

  private updateScrollUnlockThreshold() {
    // "40svh" worth of accumulated swipe distance before we hand off to
    // native page scroll. innerHeight is a close enough stand-in for svh
    // for this purpose.
    this.inputManager.scrollUnlockThresholdPx = window.innerHeight * 0.4;
  }

  private setupDropIn() {
    // Start the main float above the water - off-center (not the exact
    // middle of the pool every time) - so it falls in under normal physics
    // instead of the water starting pre-rippled. oldCenter is set to match
    // so the very first frame doesn't register as a teleport.
    const dropStartY = 1.1;
    const dropX = (Math.random() * 2 - 1) * this.physics.poolWidth * 0.22;
    const dropZ = (Math.random() * 2 - 1) * this.physics.poolLength * 0.22;
    this.physics.center.set(dropX, dropStartY, dropZ);
    this.physics.oldCenter.copy(this.physics.center);
    this.mainFloatRestY = dropStartY - 0.1;
    this.renderer.duckPosition.set(dropX, dropStartY, dropZ);
  }

  private setupScrollHandoff() {
    this.updateScrollUnlockThreshold();

    const skipButton = document.getElementById("skip-intro");
    const nextSection = document.getElementById("brand-intro");
    skipButton?.addEventListener("click", () => {
      this.inputManager.forceUnlockScroll();
      nextSection?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    // Scrolling back to the very top re-engages the touch water interaction.
    window.addEventListener("scroll", () => {
      if (window.scrollY < 4) {
        this.inputManager.resetScrollLock();
      }
    });
  }

  private updatePoolDimensions() {
    const waterDepth = this.containerHeight * this.waterFillRatio;
    const wallHeight = this.containerHeight * (1 - this.waterFillRatio);

    this.physics.poolDepth = waterDepth;
    this.renderer.updateDimensions(
      this.physics.poolWidth,
      this.physics.poolLength,
      waterDepth,
      wallHeight
    );
    this.water.updateDimensions(
      this.physics.poolWidth,
      this.physics.poolLength
    );
  }

  private onResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.sceneRenderer.setSize(width, height);
    this.sceneRenderer.setPixelRatio(window.devicePixelRatio || 1);

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    // Auto-resize pool to fill screen (top-down view)
    const visibleHeight = 2 * this.dist * Math.tan((45 * Math.PI) / 360);
    const visibleWidth = visibleHeight * this.camera.aspect;

    this.physics.poolWidth = visibleWidth;
    this.physics.poolLength = visibleHeight;
    this.updatePoolDimensions();
  }

  // Opens a growing circular "hole" at the center of `el` (via a CSS
  // mask), expanding until it covers the whole element - like an iris/
  // portal opening - instead of a plain fade. Driven frame-by-frame in JS
  // rather than a CSS transition on the mask, since browsers don't
  // reliably interpolate gradient stops through a transition.
  private playCircleReveal(
    el: HTMLElement | null,
    durationMs: number
  ): Promise<void> {
    if (!el) return Promise.resolve();
    return new Promise((resolve) => {
      const start = performance.now();
      // Ease-out: opens quickly at first, then eases into the final reveal.
      const ease = (t: number) => 1 - Math.pow(1 - t, 3);
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / durationMs);
        const p = ease(t) * 100;
        // A ~1.5%-wide soft edge between the open hole (transparent, i.e.
        // masked away) and the still-solid overlay (kept) - a hard cutoff
        // here would look like a jagged circular cutout. Uses `white`
        // rather than `black` for the "kept" stops deliberately: browsers
        // disagree on whether a CSS mask-image is read by alpha or by
        // luminance, and opaque black is fully visible under alpha-mode
        // but fully MASKED OUT under luminance-mode (luminance 0). White
        // is full alpha and full luminance, so it reads as "fully kept"
        // either way; transparent reads as "fully hidden" either way too
        // (alpha 0 zeroes out both formulas).
        const mask = `radial-gradient(circle at 50% 50%, transparent 0%, transparent ${p}%, white ${Math.min(
          100,
          p + 1.5
        )}%, white 100%)`;
        el.style.setProperty("-webkit-mask-image", mask);
        el.style.setProperty("mask-image", mask);
        if (t < 1) {
          requestAnimationFrame(step);
        } else {
          resolve();
        }
      };
      requestAnimationFrame(step);
    });
  }

  // Shows the "usana" intro wordmark briefly, then opens a circular
  // reveal from the center to clear the overlay (matching the reference
  // intro). The physics/fruit-drop update loop is gated on
  // simulationStarted (flipped below), so the drop-in animation only
  // begins once the intro is actually finishing, not hidden underneath it.
  private playIntro() {
    const loading = document.getElementById("loading");
    const introLogo = document.getElementById("intro-logo");
    const skipButton = document.getElementById("skip-intro");

    requestAnimationFrame(() => {
      introLogo?.classList.add("intro-logo-show");
    });

    const holdMs = 1500;
    const textFadeMs = 500;
    const revealMs = 1100;
    setTimeout(() => {
      introLogo?.classList.remove("intro-logo-show");
      setTimeout(async () => {
        // Only now - once the intro is actually finishing, not hidden
        // underneath it - do the main float/fruits start falling in, and
        // the skip button becomes visible/clickable. Page scroll (wheel,
        // touch, keyboard) was locked from first paint (see index.html)
        // specifically so it couldn't be used to skip past the intro;
        // lift that lock here, at the same moment everything else unlocks.
        this.simulationStarted = true;
        skipButton?.classList.add("skip-visible");
        document.documentElement.classList.add("intro-done");
        document.body.classList.add("intro-done");

        await this.playCircleReveal(loading, revealMs);
        if (loading) {
          loading.style.pointerEvents = "none";
          loading.innerHTML = "";
        }
      }, textFadeMs);
    }, holdMs);
  }

  start() {
    this.playIntro();

    let prevTime = new Date().getTime();

    const animate = () => {
      const nextTime = new Date().getTime();
      this.update((nextTime - prevTime) / 1000);
      this.draw();
      prevTime = nextTime;
      requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }

  private update(rawSeconds: number) {
    if (rawSeconds > 1) return;
    if (!this.simulationStarted) return;
    // Cap the step size (mobile in particular can have occasional long/
    // janky frames, e.g. right as the intro hands off into the drop-in
    // sequence). Without this, a single oversized frame can push several
    // fruits' staggered drop delays past zero at once, so they end up
    // falling together instead of one at a time.
    const seconds = Math.min(rawSeconds, 0.05);

    // Physics
    this.physics.update(
      seconds,
      this.water,
      this.inputManager,
      this.sceneRenderer
    );

    // Sync Visuals - damp the vertical bounce so the main float doesn't
    // "pong" up and down; horizontal position still follows physics exactly.
    const rawTargetY = this.physics.center.y - 0.1;
    this.mainFloatRestY +=
      (rawTargetY - this.mainFloatRestY) * Math.min(1, seconds * 1.5);
    const bounceAmount = 0.17; // fraction of the raw buoyancy motion kept
    const targetY =
      this.mainFloatRestY + (rawTargetY - this.mainFloatRestY) * bounceAmount;

    this.renderer.duckPosition.x = this.physics.center.x;
    this.renderer.duckPosition.z = this.physics.center.z;
    this.renderer.duckPosition.y +=
      (targetY - this.renderer.duckPosition.y) * Math.min(1, seconds * 8);

    // Free tumble in 3D (like the decorative fruits) instead of the old
    // logic, which only ever yawed the float to face its direction of
    // travel around a fixed world-up axis - so it could turn left/right
    // but never actually roll/tip to the side. Tumble speed picks up a
    // bit with how fast it's moving, plus a small base rate so it's not
    // perfectly frozen while calm.
    const horizontalSpeed = Math.hypot(
      this.physics.velocity.x,
      this.physics.velocity.z
    );
    const spinRate = 0.35 + horizontalSpeed * 2.0;
    const spinDelta = new THREE.Quaternion().setFromAxisAngle(
      this.mainFloatSpinAxis,
      spinRate * seconds
    );
    this.renderer.duckQuaternion.premultiply(spinDelta).normalize();

    // Slowly drift the sky reflection so the clouds aren't a frozen photo.
    this.renderer.updateSkyDrift(seconds);

    // Occasional ambient raindrop-style ripple, independent of the fruits.
    this.updateRainDrops(seconds);

    // Decorative floating fruits - they also react to the mouse/touch
    // point (not just the main float) and collide with each other and
    // with the main float instead of passing through.
    this.floatingFruits.update(
      seconds,
      this.water,
      this.sceneRenderer,
      this.physics.poolWidth,
      this.physics.poolLength,
      this.inputManager.mousePoint,
      { position: this.physics.center, radius: MAIN_FLOAT_RADIUS }
    );

    // Water Simulation Steps
    for (let i = 0; i < 4; i++) {
      this.water.stepSimulation(this.sceneRenderer);
    }
    this.water.updateNormals(this.sceneRenderer);
    this.renderer.updateCaustics(this.sceneRenderer, this.water);
  }

  // Every so often, drop a small ripple at a random spot on the pool on
  // its own - like an occasional drip landing in the water - so there's
  // always a little bit of life on the surface even when nothing else is
  // happening. Kept sparse (a wide, re-rolled random gap between drops)
  // and gentle (a small, soft dip rather than a splash) so it reads as a
  // subtle ambient touch, not an event competing with the fruits. (A
  // visible droplet mesh was tried here too, but its shape read as odd/
  // wrong, so this stays ripple-only.)
  private updateRainDrops(seconds: number) {
    this.nextRainDropTime -= seconds;
    if (this.nextRainDropTime > 0) return;

    const x = (Math.random() * 2 - 1) * this.physics.poolWidth * 0.4;
    const z = (Math.random() * 2 - 1) * this.physics.poolLength * 0.4;
    const radius = 0.022 + Math.random() * 0.018;
    const strength = -(0.005 + Math.random() * 0.006);
    this.water.addDrop(this.sceneRenderer, x, z, radius, strength);

    this.nextRainDropTime = 2.5 + Math.random() * 4.5;
  }

  private draw() {
    // Camera Orbit
    const radX = (this.inputManager.angleX * Math.PI) / 180;
    const radY = (this.inputManager.angleY * Math.PI) / 180;

    this.camera.position.x = Math.sin(radY) * this.dist * Math.cos(radX);
    this.camera.position.y = Math.sin(radX) * this.dist;
    this.camera.position.z = Math.cos(radY) * this.dist * Math.cos(radX);
    this.camera.lookAt(new THREE.Vector3(0, 0.5, 0));

    // Render
    this.renderer.sphereCenter = this.physics.center;
    this.renderer.sphereRadius = this.physics.radius;
    if (this.skyTexture) {
      this.renderer.render(
        this.sceneRenderer,
        this.camera,
        this.water,
        this.skyTexture
      );
    }
  }
}
