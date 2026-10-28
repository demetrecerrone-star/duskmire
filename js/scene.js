/**
 * Isometric marsh clearing. Browser only — the simulation never imports this.
 * Standard and Detailed are two builds of the same smooth scene. Comparison
 * draws both with one renderer, split by scissor, without touching fight state.
 */
import {
  ACESFilmicToneMapping,
  BackSide,
  CapsuleGeometry,
  CircleGeometry,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  Fog,
  Group,
  HemisphereLight,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "../vendor/three.module.js";
import { palette } from "./palette.js";
import { createAdventurer, createCharacter, createWeapon, dressAdventurer } from "./models.js";
import { isDetailed, isNarrowScreen, pixelRatioCap, profile, setBuildQuality, shadowMapSize } from "./quality.js";
import { applyMaps, stampAoUv } from "./textures.js";

const reducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

function disposeObject(object) {
  object.traverse((node) => {
    if (node.geometry) node.geometry.dispose();
    if (node.material) {
      const list = Array.isArray(node.material) ? node.material : [node.material];
      for (const mat of list) mat.dispose();
    }
  });
}

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function mountScene(canvas, splatLayer, options = {}) {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  if (!renderer.getContext()) {
    throw new Error("WebGL is unavailable in this browser.");
  }
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;

  let activeQuality = options.quality === "detailed" ? "detailed" : "standard";
  let compare = false;
  let paused = Boolean(options.paused);
  let shownEnemy = "goblin";
  let shownWeapon = "sword";
  let shownGear = null;
  const worlds = new Map();
  let layoutRects = [];

  const worldsVisible = () => (compare ? ["standard", "detailed"] : [activeQuality]);

  function ensure(id) {
    const existing = worlds.get(id);
    if (existing && existing.builtNarrow === isNarrowScreen()) return existing;
    if (existing) {
      existing.dispose();
      worlds.delete(id);
    }
    const world = createWorld(id, shownEnemy, shownWeapon, shownGear);
    worlds.set(id, world);
    return world;
  }

  function retain() {
    const keep = new Set(worldsVisible());
    for (const [id, world] of worlds) {
      if (!keep.has(id)) {
        world.dispose();
        worlds.delete(id);
      }
    }
  }

  if (!paused) ensure(activeQuality);

  let running = true;
  let last = performance.now();
  const pending = [];

  function layout(width, height) {
    if (!compare) return [{ quality: activeQuality, x: 0, y: 0, w: width, h: height }];
    if (width < 720) {
      const half = Math.floor(height / 2);
      return [
        { quality: "standard", x: 0, y: half, w: width, h: height - half },
        { quality: "detailed", x: 0, y: 0, w: width, h: half },
      ];
    }
    const half = Math.floor(width / 2);
    return [
      { quality: "standard", x: 0, y: 0, w: half, h: height },
      { quality: "detailed", x: half, y: 0, w: width - half, h: height },
    ];
  }

  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    if (paused) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    for (let i = pending.length - 1; i >= 0; i -= 1) {
      if (!pending[i].update(now)) pending.splice(i, 1);
    }
    const width = canvas.clientWidth || canvas.parentElement?.clientWidth || 800;
    const height = canvas.clientHeight || canvas.parentElement?.clientHeight || 480;
    layoutRects = layout(width, height);
    const ratio = renderer.getPixelRatio();
    renderer.setScissorTest(layoutRects.length > 1);
    for (const rect of layoutRects) {
      const world = worlds.get(rect.quality);
      if (!world) continue;
      world.pose(now, dt);
      world.fit(rect.w, rect.h);
      renderer.setViewport(rect.x * ratio, rect.y * ratio, rect.w * ratio, rect.h * ratio);
      renderer.setScissor(rect.x * ratio, rect.y * ratio, rect.w * ratio, rect.h * ratio);
      renderer.toneMappingExposure = world.exposure;
      renderer.render(world.scene, world.camera);
    }
  }

  function resize() {
    if (paused) return;
    const width = canvas.clientWidth || canvas.parentElement?.clientWidth || 800;
    const height = canvas.clientHeight || canvas.parentElement?.clientHeight || 480;
    for (const id of worldsVisible()) ensure(id);
    const caps = worldsVisible().map((id) => {
      setBuildQuality(id);
      return pixelRatioCap();
    });
    setBuildQuality(activeQuality);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Math.max(...caps)));
    renderer.setSize(width, height, false);
    const stage = canvas.parentElement;
    if (stage) {
      stage.classList.toggle("compare-on", compare);
      stage.classList.toggle("compare-stacked", compare && width < 720);
      stage.dataset.graphics = compare ? "compare" : activeQuality;
    }
  }

  const resizeObserver = new ResizeObserver(() => resize());
  resizeObserver.observe(canvas.parentElement || canvas);
  resize();
  requestAnimationFrame(frame);

  function splat(who, text, kind) {
    if (!splatLayer) return;
    const width = canvas.clientWidth || splatLayer.clientWidth || 1;
    const height = canvas.clientHeight || splatLayer.clientHeight || 1;
    const rects = layoutRects.length ? layoutRects : layout(width, height);
    for (const rect of rects) {
      const world = worlds.get(rect.quality);
      if (!world) continue;
      const ndc = world.project(who);
      const cssY = height - rect.y - rect.h;
      const x = Number.isFinite(ndc?.x) ? rect.x + (ndc.x * 0.5 + 0.5) * rect.w : rect.x + rect.w * 0.5;
      const y = Number.isFinite(ndc?.y) ? cssY + (-ndc.y * 0.5 + 0.5) * rect.h : cssY + rect.h * 0.38;
      const el = document.createElement("span");
      el.className = `splat splat-${kind}`;
      el.textContent = text;
      el.style.left = `${Math.min(rect.x + rect.w - 28, Math.max(rect.x + 28, x))}px`;
      el.style.top = `${Math.min(cssY + rect.h - 28, Math.max(cssY + 28, y))}px`;
      splatLayer.appendChild(el);
      window.setTimeout(() => el.remove(), 1250);
    }
  }

  function forVisible(fn) {
    for (const id of worldsVisible()) {
      const world = worlds.get(id);
      if (world) fn(world);
    }
  }

  return {
    setEnemy(id) {
      shownEnemy = id;
      for (const world of worlds.values()) world.setEnemy(id);
    },
    setWeapon(id) {
      shownWeapon = id;
      for (const world of worlds.values()) world.setWeapon(id);
    },
    setGear(spec) {
      shownGear = spec || null;
      if (spec?.weaponId) shownWeapon = spec.weaponId;
      for (const world of worlds.values()) world.setGear(shownGear);
    },
    renderer,
    setPaused(on) {
      const next = Boolean(on);
      if (next === paused) return;
      paused = next;
      if (!paused) resize();
    },
    setQuality(id) {
      activeQuality = id === "detailed" ? "detailed" : "standard";
      if (paused) return;
      ensure(activeQuality);
      retain();
      resize();
    },
    setCompare(on) {
      compare = Boolean(on);
      if (paused) return;
      if (compare) {
        ensure("standard");
        ensure("detailed");
      }
      retain();
      resize();
    },
    splat,
    react(who, kind) {
      if (kind !== "hit") return;
      forVisible((world) => world.react(who));
    },
    playAttack(who) {
      const jobs = [];
      forVisible((world) => jobs.push(world.playAttack(who, pending)));
      return Promise.all(jobs).then(() => undefined);
    },
    resize,
    dispose() {
      running = false;
      resizeObserver.disconnect();
      for (const world of worlds.values()) world.dispose();
      worlds.clear();
      renderer.dispose();
    },
  };
}

function createWorld(qualityId, enemyStart, weaponStart, gearStart) {
  setBuildQuality(qualityId);
  const spec = profile();
  const scene = new Scene();
  scene.background = new Color(palette.sky);
  scene.fog = new Fog(palette.fog, spec.fogNear, spec.fogFar);
  const camera = new PerspectiveCamera(32, 1, 0.1, 90);
  scene.add(new HemisphereLight(palette.skyFill, palette.groundFill, spec.hemi));

  const sun = new DirectionalLight(palette.sun, spec.sun);
  sun.position.set(7, 12, 5);
  sun.castShadow = true;
  const shadowSize = shadowMapSize();
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  sun.shadow.radius = spec.shadowRadius;
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.035;
  const span = 9;
  sun.shadow.camera.left = -span;
  sun.shadow.camera.right = span;
  sun.shadow.camera.top = span;
  sun.shadow.camera.bottom = -span;
  sun.shadow.camera.near = 2;
  sun.shadow.camera.far = 28;
  scene.add(sun);
  scene.add(sun.target);

  const rim = new DirectionalLight(palette.rim, spec.rim);
  rim.position.set(-6, 7, -4);
  scene.add(rim);
  if (spec.fill) {
    const fill = new DirectionalLight(0xd7e2cc, spec.fill);
    fill.position.set(-4, 6, 7);
    scene.add(fill);
  }

  const sky = buildSky();
  const terrain = buildTerrain();
  const dressing = buildDressing();
  scene.add(sky, terrain, dressing);

  const player = createAdventurer();
  const playerBase = new Vector3(-1.2, 0.02, 0.28);
  player.group.position.copy(playerBase);
  player.group.rotation.y = 1.15;
  scene.add(player.group);

  let enemy = null;
  let enemyId = null;
  let weaponId = null;
  const enemyBase = new Vector3(1.28, 0.02, -0.22);
  const playerDir = new Vector3(1, 0, 0.12).normalize();
  const enemyDir = new Vector3(-1, 0, -0.08).normalize();
  const ndc = new Vector3();

  function setEnemy(id) {
    if (id === enemyId && enemy) return;
    setBuildQuality(qualityId);
    if (enemy) {
      scene.remove(enemy.group);
      disposeObject(enemy.group);
    }
    enemy = createCharacter(id);
    enemy.group.position.copy(enemyBase);
    enemy.group.rotation.y = -1.02;
    scene.add(enemy.group);
    enemyId = id;
  }

  let gearSpec = gearStart || null;

  function setWeapon(id) {
    setBuildQuality(qualityId);
    const hand = player.hand;
    const removed = new Set();
    while (hand.children.length) {
      const child = hand.children[0];
      child.traverse((node) => {
        if (!node.material) return;
        const list = Array.isArray(node.material) ? node.material : [node.material];
        for (const mat of list) removed.add(mat);
      });
      hand.remove(child);
      disposeObject(child);
    }
    player.materials = player.materials.filter((mat) => !removed.has(mat));
    const weapon = createWeapon(id);
    weapon.group.rotation.x = Math.PI;
    hand.add(weapon.group);
    for (const mat of weapon.materials) player.materials.push(mat);
    weaponId = id;
    dressAdventurer(player, gearSpec);
  }

  function setGear(spec) {
    gearSpec = spec || null;
    setWeapon(spec?.weaponId || weaponId);
  }

  setEnemy(enemyStart);
  setWeapon(gearSpec?.weaponId || weaponStart);

  function decayFlash(materials, dt) {
    for (const mat of materials) {
      if (!mat?.userData || mat.userData.flash == null) continue;
      mat.userData.flash = Math.max(0, mat.userData.flash - dt * 2.4);
      mat.emissiveIntensity = (mat.userData.baseIntensity || 0) + mat.userData.flash;
      if (mat.userData.flash === 0 && mat.userData.baseEmissive) {
        mat.emissive.copy(mat.userData.baseEmissive);
      }
    }
  }

  function poseActor(actor, base, dir, phase, now, dt) {
    const group = actor.group;
    const bob = reducedMotion() ? 0 : Math.sin(now * 0.0021 + phase) * 0.028;
    const amount = group.userData.lunge || 0;
    const knock = group.userData.knock || 0;
    group.userData.knock = knock * Math.exp(-dt * 7);
    group.position.copy(base);
    group.position.addScaledVector(dir, amount - knock);
    group.position.y = base.y + bob;
    decayFlash(actor.materials, dt);
  }

  return {
    qualityId,
    scene,
    camera,
    exposure: spec.exposure,
    builtNarrow: isNarrowScreen(),
    enemyId: () => enemyId,
    weaponId: () => weaponId,
    setEnemy,
    setWeapon,
    setGear,
    pose(now, dt) {
      poseActor(player, playerBase, playerDir, 0, now, dt);
      if (enemy) poseActor(enemy, enemyBase, enemyDir, 1.4, now, dt);
    },
    fit(viewWidth, viewHeight) {
      camera.aspect = viewWidth / Math.max(1, viewHeight);
      const distance = viewWidth < 420 ? 14.4 : viewWidth < 720 ? 12.6 : 11.3;
      camera.position.set(distance * 0.62, distance * 0.76, distance * 0.8);
      camera.lookAt(0, 0.85, 0);
      camera.updateProjectionMatrix();
    },
    project(who) {
      const actor = who === "player" ? player : enemy;
      if (!actor) return null;
      actor.group.getWorldPosition(ndc);
      ndc.y += (actor.height || 1.6) * 0.72;
      ndc.project(camera);
      return { x: ndc.x, y: ndc.y };
    },
    react(who) {
      const actor = who === "player" ? player : enemy;
      if (!actor) return;
      for (const mat of actor.materials) {
        mat.emissive.setHex(0xfff3dd);
        mat.userData.flash = 0.62;
      }
      actor.group.userData.knock = 0.18;
    },
    playAttack(who, pending) {
      const actor = who === "player" ? player : enemy;
      if (!actor) return Promise.resolve();
      const group = actor.group;
      const arm = group.userData.arm;
      const rest = arm ? arm.rotation.x : 0;
      if (reducedMotion()) return Promise.resolve();
      return new Promise((resolve) => {
        const t0 = performance.now();
        const dur = 360;
        pending.push({
          update(now) {
            const p = Math.min(1, (now - t0) / dur);
            const k = Math.sin(p * Math.PI);
            group.userData.lunge = k * 0.46;
            if (arm) arm.rotation.x = rest - k * 0.65;
            if (p >= 1) {
              group.userData.lunge = 0;
              if (arm) arm.rotation.x = rest;
              resolve();
              return false;
            }
            return true;
          },
        });
      });
    },
    dispose() {
      scene.remove(player.group);
      disposeObject(player.group);
      if (enemy) disposeObject(enemy.group);
      disposeObject(sky);
      disposeObject(terrain);
      disposeObject(dressing);
      scene.clear();
    },
  };
}

function buildTerrain() {
  const spec = profile();
  const detailed = isDetailed();
  const geo = new PlaneGeometry(36, 36, spec.terrain, spec.terrain);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const color = new Float32Array(pos.count * 3);
  const moss = new Color(palette.moss);
  const mossDeep = new Color(palette.mossDeep);
  const dirt = new Color(palette.dirt);
  const ochre = new Color(palette.ochre);
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const dist = Math.hypot(x, z);
    const edge = smoothstep(3.4, 8.5, dist);
    const wave = Math.sin(x * 0.38) * Math.cos(z * 0.31) * 0.22 + Math.sin((x + z) * 0.62) * 0.05;
    const fine = detailed ? Math.sin(x * 1.15 + 0.4) * Math.cos(z * 1.05) * 0.03 * edge : 0;
    pos.setY(i, wave * edge + fine);
    const tint = dirt.clone();
    tint.lerp(moss, smoothstep(1.4, 4.8, dist));
    tint.lerp(mossDeep, smoothstep(7, 14, dist));
    if (Math.sin(x * 0.85) * Math.cos(z * 0.7) > 0.55 && dist > 2.2 && dist < 7) {
      tint.lerp(ochre, 0.28);
    }
    color[i * 3] = tint.r;
    color[i * 3 + 1] = tint.g;
    color[i * 3 + 2] = tint.b;
  }
  geo.setAttribute("color", new Float32BufferAttribute(color, 3));
  geo.computeVertexNormals();
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0 });
  if (detailed) {
    stampAoUv(geo);
    applyMaps(material, "ground");
  }
  const mesh = new Mesh(geo, material);
  mesh.receiveShadow = true;
  return mesh;
}

function buildSky() {
  const spec = profile();
  const geo = new SphereGeometry(42, spec.sky[0], spec.sky[1]);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const top = new Color(0xd5d0bc);
  const mid = new Color(palette.sky);
  const low = new Color(isDetailed() ? 0x5d684c : 0x667056);
  for (let i = 0; i < pos.count; i += 1) {
    const y = pos.getY(i) / 42;
    const tint = low.clone().lerp(mid, MathUtils.smoothstep(y, -0.15, 0.2));
    tint.lerp(top, MathUtils.smoothstep(y, 0.05, 0.75));
    colors[i * 3] = tint.r;
    colors[i * 3 + 1] = tint.g;
    colors[i * 3 + 2] = tint.b;
  }
  geo.setAttribute("color", new Float32BufferAttribute(colors, 3));
  return new Mesh(
    geo,
    new MeshBasicMaterial({
      vertexColors: true,
      side: BackSide,
      depthWrite: false,
    }),
  );
}

function buildDressing() {
  const detailed = isDetailed();
  const narrow = isNarrowScreen();
  const root = new Group();
  const bark = new MeshStandardMaterial({ color: palette.bark, roughness: 0.86 });
  const barkDark = new MeshStandardMaterial({ color: palette.barkDark, roughness: 0.9 });
  const leaf = new MeshStandardMaterial({ color: palette.moss, roughness: 0.9 });
  const leafDeep = new MeshStandardMaterial({ color: palette.mossDeep, roughness: 0.92 });
  const stone = new MeshStandardMaterial({ color: palette.stone, roughness: 0.94 });
  const stoneDark = new MeshStandardMaterial({ color: palette.stoneDark, roughness: 0.9 });
  const reedMat = new MeshStandardMaterial({ color: palette.reed, roughness: 0.8 });
  const puddleMat = new MeshStandardMaterial({
    color: palette.puddle,
    roughness: 0.18,
    metalness: 0.08,
    transparent: true,
    opacity: 0.55,
  });
  if (detailed) {
    applyMaps(bark, "wood");
    applyMaps(barkDark, "wood");
    applyMaps(leaf, "cloth");
    applyMaps(leafDeep, "cloth");
    applyMaps(stone, "ground");
    applyMaps(stoneDark, "ground");
    applyMaps(reedMat, "cloth");
  }

  const spots = [
    [-4.4, -3.1, 1.15],
    [0.2, -4.6, 1.35],
    [4.1, -2.4, 0.95],
    [-3.8, 3.6, 0.8],
  ];
  if (detailed) spots.push([5.2, 1.4, 0.7], [-5.1, 0.4, 0.85]);
  for (const [x, z, scale] of spots) root.add(makeTree(x, z, scale, bark, leaf, leafDeep));

  root.add(makeRock(2.7, 1.7, 0.55, stone, stoneDark));
  root.add(makeRock(-2.5, 1.9, 0.38, stoneDark, stone));
  if (detailed) {
    root.add(makeRock(3.4, -1.2, 0.28, stone, stoneDark));
    root.add(makeRock(-3.3, -0.4, 0.22, stoneDark, stone));
    root.add(makeRock(0.8, -3.2, 0.32, stone, stoneDark));
    root.add(makeBush(-3.6, -2.2, leaf, leafDeep));
    root.add(makeBush(3.8, 2.6, leafDeep, leaf));
    root.add(makeBush(-1.2, 3.3, leaf, bark));
  }

  const logGeo = new CapsuleGeometry(0.09, 0.85, detailed ? 8 : 6, detailed ? 20 : 16);
  if (detailed) stampAoUv(logGeo);
  const log = new Mesh(logGeo, barkDark);
  log.position.set(-2.2, 0.1, -1.5);
  log.rotation.z = Math.PI / 2;
  log.rotation.y = 0.4;
  log.castShadow = true;
  root.add(log);

  const reeds = [
    [1.8, 1.15, 0.55],
    [1.95, 1.28, 0.4],
    [2.05, 1.05, 0.48],
    [-1.7, -1.7, 0.5],
    [-1.85, -1.55, 0.36],
  ];
  if (detailed) {
    reeds.push([2.2, 1.4, 0.42], [1.65, 0.95, 0.33], [-1.55, -1.85, 0.46]);
  }
  for (const [x, z, h] of reeds) {
    const reedGeo = new CapsuleGeometry(0.018, h, detailed ? 5 : 4, detailed ? 10 : 8);
    if (detailed) stampAoUv(reedGeo);
    const reed = new Mesh(reedGeo, reedMat);
    reed.position.set(x, h * 0.55, z);
    root.add(reed);
  }

  if (detailed) {
    const grass = new MeshStandardMaterial({ color: palette.mossBright, roughness: 0.82 });
    applyMaps(grass, "cloth");
    const count = narrow ? 14 : 32;
    for (let i = 0; i < count; i += 1) {
      const angle = i * 2.399963;
      const radius = 2.15 + ((i * 47) % 100) / 100 * 3.4;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      if (Math.hypot(x + 1.2, z - 0.28) < 0.85 || Math.hypot(x - 1.28, z + 0.22) < 0.85) continue;
      root.add(makeTuft(x, z, grass, detailed));
    }
  }

  const puddle = new Mesh(new CircleGeometry(0.7, detailed ? 48 : 40), puddleMat);
  puddle.rotation.x = -Math.PI / 2;
  puddle.position.set(0.15, 0.03, 1.15);
  puddle.scale.set(1.3, 1, 0.8);
  puddle.receiveShadow = true;
  root.add(puddle);
  return root;
}

function makeTuft(x, z, mat) {
  const root = new Group();
  const blades = 4;
  for (let i = 0; i < blades; i += 1) {
    const height = 0.14 + (i % 3) * 0.045;
    const bladeGeo = new CapsuleGeometry(0.011, height, 3, 7);
    stampAoUv(bladeGeo);
    const blade = new Mesh(bladeGeo, mat);
    blade.position.set((i - 1.5) * 0.028, height * 0.5, (i % 2) * 0.02);
    blade.rotation.z = (i - 1.5) * 0.2;
    blade.rotation.y = i * 0.7;
    root.add(blade);
  }
  root.position.set(x, 0, z);
  return root;
}

function makeBush(x, z, leaf, leafDeep) {
  const root = new Group();
  const puffs = [
    [0, 0.22, 0, 0.28, leaf],
    [0.16, 0.18, 0.06, 0.18, leafDeep],
    [-0.14, 0.16, -0.05, 0.16, leaf],
  ];
  for (const [px, py, pz, radius, mat] of puffs) {
    const puffGeo = new SphereGeometry(radius, 22, 16);
    stampAoUv(puffGeo);
    const puff = new Mesh(puffGeo, mat);
    puff.position.set(px, py, pz);
    puff.castShadow = true;
    root.add(puff);
  }
  root.position.set(x, 0, z);
  return root;
}

function makeTree(x, z, scale, bark, leaf, leafDeep) {
  const detailed = isDetailed();
  const root = new Group();
  const trunkGeo = new CapsuleGeometry(0.11 * scale, 0.85 * scale, detailed ? 8 : 6, detailed ? 22 : 18);
  if (detailed) stampAoUv(trunkGeo);
  const trunk = new Mesh(trunkGeo, bark);
  trunk.position.y = 0.55 * scale;
  trunk.castShadow = true;
  root.add(trunk);
  const crowns = [
    [0, 1.15 * scale, 0, 0.52 * scale, leaf],
    [0.26 * scale, 1.32 * scale, 0.08 * scale, 0.36 * scale, leafDeep],
    [-0.22 * scale, 1.28 * scale, -0.1 * scale, 0.32 * scale, leaf],
  ];
  const seg = detailed ? [36, 24] : [26, 18];
  for (const [cx, cy, cz, r, mat] of crowns) {
    const crownGeo = new SphereGeometry(r, seg[0], seg[1]);
    if (detailed) stampAoUv(crownGeo);
    const crown = new Mesh(crownGeo, mat);
    crown.position.set(cx, cy, cz);
    crown.castShadow = true;
    root.add(crown);
  }
  root.position.set(x, 0, z);
  return root;
}

function makeRock(x, z, scale, mat, mat2) {
  const detailed = isDetailed();
  const root = new Group();
  const rockA = new SphereGeometry(0.38 * scale, detailed ? 36 : 28, detailed ? 26 : 20);
  if (detailed) stampAoUv(rockA);
  const a = new Mesh(rockA, mat);
  a.scale.set(1.3, 0.72, 1.05);
  a.position.y = 0.18 * scale;
  a.castShadow = true;
  a.receiveShadow = true;
  const rockB = new SphereGeometry(0.22 * scale, detailed ? 28 : 24, detailed ? 20 : 16);
  if (detailed) stampAoUv(rockB);
  const b = new Mesh(rockB, mat2);
  b.position.set(0.22 * scale, 0.12 * scale, 0.12 * scale);
  b.scale.set(1.1, 0.7, 0.9);
  b.castShadow = true;
  root.add(a, b);
  if (detailed) {
    const rockC = new SphereGeometry(0.12 * scale, 20, 14);
    stampAoUv(rockC);
    const c = new Mesh(rockC, mat);
    c.position.set(-0.16 * scale, 0.08 * scale, 0.1 * scale);
    c.scale.set(1.2, 0.6, 0.9);
    root.add(c);
  }
  root.position.set(x, 0, z);
  return root;
}
