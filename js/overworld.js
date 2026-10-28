/**
 * Walkable marsh road. Shares the combat renderer's WebGL context.
 * Spawn rules and pathfinding live in nav.js; this file only draws and samples input.
 */
import {
  CapsuleGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  BackSide,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Fog,
  Group,
  HemisphereLight,
  InstancedMesh,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from "../vendor/three.module.js";
import { palette } from "./palette.js";
import { createAdventurer, createCharacter, createWeapon, dressAdventurer } from "./models.js";
import { createLathe, createRoundedBox } from "./geometries.js";
import { isDetailed, isNarrowScreen, pixelRatioCap, profile, setBuildQuality, shadowMapSize } from "./quality.js";
import { applyMaps, stampAoUv } from "./textures.js";
import { getItem } from "./items.js";
import { getEnemy, isUnlocked } from "./enemies.js";
import { createRng } from "./rng.js";
import {
  BOUNDS,
  ENCOUNTER_RANGE,
  OBSTACLES,
  START,
  WALK_SPEED,
  ZONES,
  approachPoint,
  canEngage,
  createSpawns,
  createWorldGrid,
  defeatSpawn,
  distanceToRoad,
  findPath,
  layoutProps,
  moveWithCollision,
  nearestZone,
  reviveSpawns,
  roadPoints,
  stepWander,
  zoneByEnemy,
} from "./nav.js";

const dummy = new Object3D();
const pointerNdc = new Vector2();
const raycaster = new Raycaster();
const aim = new Vector3();

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function groundY(x, z) {
  const road = smoothstep(0.25, 2.8, distanceToRoad(x, z));
  const wave = Math.sin(x * 0.16) * Math.cos(z * 0.21) * 0.4 + Math.sin((x + z) * 0.08) * 0.16;
  return wave * road;
}

function disposeObject(object) {
  object.traverse((node) => {
    if (node.geometry) node.geometry.dispose();
    if (node.material) {
      const list = Array.isArray(node.material) ? node.material : [node.material];
      for (const mat of list) mat.dispose();
    }
  });
}

/** Camera limits keep the angled RS3-style view: never flat to the ground, never straight down. */
export const CAMERA = { pitch: 0.72, minPitch: 0.42, maxPitch: 1.12, minDistance: 9, maxDistance: 40 };
const clampDistance = (value) => Math.min(CAMERA.maxDistance, Math.max(CAMERA.minDistance, value));
const clampPitch = (value) => Math.min(CAMERA.maxPitch, Math.max(CAMERA.minPitch, value));
/** How far (CSS px) from a foe's body a finger may land and still pick them. */
const TOUCH_PICK_SLOP = 34;

export function mountOverworld(canvas, renderer, options = {}) {
  const grid = createWorldGrid();
  const props = layoutProps(11);
  const spawns = options.spawns || createSpawns();
  const wanderRng = createRng(options.seed ?? 11);
  let quality = options.quality === "detailed" ? "detailed" : "standard";
  let compare = false;
  let active = true;
  let weaponId = options.weaponId || "sword";
  let gear = options.gear || null;
  let loot = Array.isArray(options.loot) ? options.loot.map((pile) => ({ ...pile })) : [];
  let pos = { x: options.x ?? START.x, z: options.z ?? START.z };
  let facing = Math.PI / 2;
  let yaw = Math.PI / 2;
  let distance = 22;
  let pitch = CAMERA.pitch;
  let path = [];
  let pendingEngage = null;
  let pendingLoot = null;
  let repathAt = 0;
  let hoverId = null;
  let hoverLootId = null;
  let moving = false;
  const keys = new Set();
  const pointers = new Map();
  let pinch = null;
  const views = new Map();
  let layoutRects = [];
  let running = true;
  let last = performance.now();

  const minimap = options.minimap || null;
  const getDefeated = options.getDefeated || (() => []);

  function ensureViews() {
    const narrow = isNarrowScreen();
    const ids = compare ? ["standard", "detailed"] : [quality];
    for (const [id, view] of views) {
      if (!ids.includes(id) || view.builtNarrow !== narrow) {
        view.dispose();
        views.delete(id);
      }
    }
    for (const id of ids) {
      if (!views.has(id)) views.set(id, buildView(id, spawns, props, weaponId, gear));
    }
  }

  function layout(width, height) {
    if (!compare) return [{ quality, x: 0, y: 0, w: width, h: height }];
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

  function resize() {
    if (!active) return;
    const width = canvas.clientWidth || canvas.parentElement?.clientWidth || 800;
    const height = canvas.clientHeight || canvas.parentElement?.clientHeight || 480;
    ensureViews();
    const caps = (compare ? ["standard", "detailed"] : [quality]).map((id) => {
      setBuildQuality(id);
      return pixelRatioCap();
    });
    setBuildQuality(quality);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Math.max(...caps, 1)));
    renderer.setSize(width, height, false);
    const stage = canvas.parentElement;
    if (stage) {
      stage.classList.toggle("compare-on", compare);
      stage.classList.toggle("compare-stacked", compare && width < 720);
      stage.dataset.graphics = compare ? "compare" : quality;
    }
    layoutRects = layout(width, height);
    for (const rect of layoutRects) views.get(rect.quality)?.resize(rect.w, rect.h);
  }

  function spawnById(id) {
    return spawns.find((spawn) => spawn.id === id) || null;
  }

  function simulate(dt, now) {
    reviveSpawns(spawns, now);
    for (const spawn of spawns) stepWander(spawn, dt, wanderRng, now);

    let stepX = 0;
    let stepZ = 0;
    const forwardX = Math.sin(yaw);
    const forwardZ = Math.cos(yaw);
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    if (keys.has("KeyW") || keys.has("ArrowUp")) {
      stepX += forwardX;
      stepZ += forwardZ;
    }
    if (keys.has("KeyS") || keys.has("ArrowDown")) {
      stepX -= forwardX;
      stepZ -= forwardZ;
    }
    if (keys.has("KeyD") || keys.has("ArrowRight")) {
      stepX += rightX;
      stepZ += rightZ;
    }
    if (keys.has("KeyA") || keys.has("ArrowLeft")) {
      stepX -= rightX;
      stepZ -= rightZ;
    }
    if (keys.has("KeyQ")) yaw += dt * 1.4;
    if (keys.has("KeyE")) yaw -= dt * 1.4;

    const keying = Math.hypot(stepX, stepZ) > 0;
    if (keying) {
      path = [];
      pendingEngage = null;
      pendingLoot = null;
      const len = Math.hypot(stepX, stepZ);
      const scale = (WALK_SPEED * dt) / len;
      const next = moveWithCollision(grid, pos.x, pos.z, stepX * scale, stepZ * scale);
      if (Math.hypot(next.x - pos.x, next.z - pos.z) > 0.0001) facing = Math.atan2(next.x - pos.x, next.z - pos.z);
      pos = next;
      moving = true;
    } else if (path.length) {
      const point = path[0];
      const dx = point.x - pos.x;
      const dz = point.z - pos.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.22) {
        path.shift();
        moving = path.length > 0;
      } else {
        const scale = Math.min(len, WALK_SPEED * dt) / len;
        const next = moveWithCollision(grid, pos.x, pos.z, dx * scale, dz * scale);
        if (Math.hypot(next.x - pos.x, next.z - pos.z) > 0.0001) facing = Math.atan2(dx, dz);
        pos = next;
        moving = true;
      }
    } else if (pendingEngage && now >= repathAt) {
      const spawn = spawnById(pendingEngage);
      const dist = spawn ? Math.hypot(spawn.x - pos.x, spawn.z - pos.z) : Infinity;
      if (spawn && dist > ENCOUNTER_RANGE) {
        const goal = approachPoint(pos, spawn, ENCOUNTER_RANGE * 0.72);
        path = findPath(grid, pos, goal);
        repathAt = now + 450;
      }
      moving = path.length > 0;
    } else {
      moving = false;
    }

    if (pendingEngage) {
      const spawn = spawnById(pendingEngage);
      const gate = canEngage(spawn, getDefeated(), now);
      const dist = spawn ? Math.hypot(spawn.x - pos.x, spawn.z - pos.z) : Infinity;
      if (!spawn || !gate.ok) {
        if (gate.hint) options.onHint?.(gate.hint);
        pendingEngage = null;
        path = [];
      } else if (dist <= ENCOUNTER_RANGE) {
        pendingEngage = null;
        path = [];
        moving = false;
        options.onEngage?.(spawn);
      }
    }
    if (pendingLoot) {
      const pile = loot.find((entry) => entry.id === pendingLoot);
      if (!pile) pendingLoot = null;
      else {
        const dist = Math.hypot(pile.x - pos.x, pile.z - pos.z);
        if (dist <= 1.25) {
          pendingLoot = null;
          path = [];
          moving = false;
          options.onPickup?.(pile);
        } else if (!path.length && now >= repathAt) {
          path = findPath(grid, pos, pile);
          repathAt = now + 450;
        }
      }
    }
    options.onStep?.(dt);
  }

  function project(view, x, y, z, rect) {
    aim.set(x, y, z);
    aim.project(view.camera);
    const height = canvas.clientHeight || 1;
    const cssY = height - rect.y - rect.h;
    return {
      x: rect.x + (aim.x * 0.5 + 0.5) * rect.w,
      y: cssY + (-aim.y * 0.5 + 0.5) * rect.h,
    };
  }

  function render(now) {
    const width = canvas.clientWidth || 800;
    const height = canvas.clientHeight || 480;
    layoutRects = layout(width, height);
    for (const rect of layoutRects) views.get(rect.quality)?.resize(rect.w, rect.h);
    const ratio = renderer.getPixelRatio();
    renderer.setScissorTest(layoutRects.length > 1);
    for (const rect of layoutRects) {
      const view = views.get(rect.quality);
      if (!view) continue;
      view.sync(pos, facing, spawns, getDefeated(), now, moving, path, loot);
      view.frameCamera(pos, yaw, distance, pitch);
      renderer.setViewport(rect.x * ratio, rect.y * ratio, rect.w * ratio, rect.h * ratio);
      renderer.setScissor(rect.x * ratio, rect.y * ratio, rect.w * ratio, rect.h * ratio);
      renderer.toneMappingExposure = view.exposure;
      renderer.render(view.scene, view.camera);
    }
    drawMinimap();
    const hoverPile = loot.find((entry) => entry.id === hoverLootId);
    if (hoverPile) {
      const primary = layoutRects[0];
      const view = views.get(primary.quality);
      if (!view) return;
      const spot = project(view, hoverPile.x, groundY(hoverPile.x, hoverPile.z) + 0.7, hoverPile.z, primary);
      const item = getItem(hoverPile.itemId);
      const qty = hoverPile.qty > 1 ? ` × ${hoverPile.qty}` : "";
      options.onHover?.({ text: `${item?.name || "Loot"}${qty}`, x: spot.x, y: spot.y });
      return;
    }
    const hover = spawnById(hoverId);
    if (!hover || (hover.downUntil && Date.now() < hover.downUntil)) {
      options.onHover?.(null);
      return;
    }
    const primary = layoutRects[0];
    const view = views.get(primary.quality);
    if (!view) return;
    const spot = project(view, hover.x, groundY(hover.x, hover.z) + 2.1, hover.z, primary);
    const enemy = getEnemy(hover.enemyId);
    const locked = !isUnlocked(enemy, getDefeated());
    options.onHover?.({
      text: `${enemy.name} · combat ${enemy.combatLevel}${locked ? " · locked" : ""}`,
      x: spot.x,
      y: spot.y,
    });
  }

  function frame(ts) {
    if (!running) return;
    requestAnimationFrame(frame);
    if (!active) return;
    const dt = Math.min(0.05, (ts - last) / 1000);
    last = ts;
    const now = Date.now();
    simulate(dt, now);
    render(now);
  }

  function pick(event, slop = 0) {
    const bounds = canvas.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    const width = bounds.width || 1;
    const height = bounds.height || 1;
    const rects = layout(width, height);
    let chosen = rects[0];
    for (const rect of rects) {
      const cssY = height - rect.y - rect.h;
      if (x >= rect.x && x <= rect.x + rect.w && y >= cssY && y <= cssY + rect.h) chosen = rect;
    }
    const view = views.get(chosen.quality) || views.values().next().value;
    if (!view) return null;
    const cssY = height - chosen.y - chosen.h;
    pointerNdc.x = ((x - chosen.x) / chosen.w) * 2 - 1;
    pointerNdc.y = -((y - cssY) / chosen.h) * 2 + 1;
    raycaster.setFromCamera(pointerNdc, view.camera);
    const lootHits = raycaster.intersectObjects(view.lootPicks || [], true);
    const lootId = lootIdFrom(lootHits[0]?.object);
    if (lootId) {
      const pile = loot.find((entry) => entry.id === lootId);
      if (pile) return { loot: pile };
    }
    const enemyHits = raycaster.intersectObjects(view.picks, false);
    if (enemyHits[0]?.object?.userData?.spawnId) {
      return { spawn: spawnById(enemyHits[0].object.userData.spawnId) };
    }
    if (slop > 0) {
      // A fingertip is wider than a far-off goblin: take the nearest standing foe under it.
      let best = null;
      let bestDist = slop;
      const now = Date.now();
      for (const spawn of spawns) {
        if (spawn.downUntil && now < spawn.downUntil) continue;
        const baseY = groundY(spawn.x, spawn.z);
        for (const lift of [0.3, 1.0, 1.7]) {
          const spot = project(view, spawn.x, baseY + lift, spawn.z, chosen);
          if (aim.z > 1) continue;
          const d = Math.hypot(spot.x - x, spot.y - y);
          if (d < bestDist) {
            bestDist = d;
            best = spawn;
          }
        }
      }
      if (best) return { spawn: best };
    }
    const groundHits = raycaster.intersectObject(view.ground, false);
    if (groundHits[0]) return { point: { x: groundHits[0].point.x, z: groundHits[0].point.z } };
    return null;
  }

  function walkToLoot(pile) {
    pendingEngage = null;
    if (Math.hypot(pile.x - pos.x, pile.z - pos.z) <= 1.25) {
      pendingLoot = null;
      path = [];
      options.onPickup?.(pile);
      return;
    }
    pendingLoot = pile.id;
    const goal = approachPoint(pos, pile, 0.9);
    path = findPath(grid, pos, goal);
  }

  function walkTo(x, z, engageId) {
    const goal = engageId ? approachPoint(pos, { x, z }, ENCOUNTER_RANGE * 0.75) : { x, z };
    if (engageId && Math.hypot(x - pos.x, z - pos.z) <= ENCOUNTER_RANGE) {
      const spawn = spawnById(engageId);
      const gate = canEngage(spawn, getDefeated(), Date.now());
      pendingEngage = null;
      path = [];
      if (gate.ok) options.onEngage?.(spawn);
      else if (gate.hint) options.onHint?.(gate.hint);
      return;
    }
    path = findPath(grid, pos, goal);
    pendingEngage = engageId || null;
    if (!path.length && !pendingEngage) options.onHint?.("The marsh will not let you through there.");
  }

  function drawMinimap() {
    if (!minimap || minimap.hidden) return;
    const ctx = minimap.getContext("2d");
    const w = minimap.width;
    const h = minimap.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(26, 21, 17, 0.82)";
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(0, 0, w, h, 16);
    else ctx.rect(0, 0, w, h);
    ctx.fill();
    const pad = 12;
    const mapX = (x) => pad + ((x - BOUNDS.minX) / (BOUNDS.maxX - BOUNDS.minX)) * (w - pad * 2);
    const mapZ = (z) => pad + ((z - BOUNDS.minZ) / (BOUNDS.maxZ - BOUNDS.minZ)) * (h - pad * 2);
    ctx.strokeStyle = "#c4a15a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    roadPoints().forEach((point, index) => {
      const px = mapX(point.x);
      const py = mapZ(point.z);
      if (index === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
    for (const zone of ZONES) {
      ctx.fillStyle = isUnlocked(getEnemy(zone.enemyId), getDefeated()) ? "#8ea06e" : "#7d776c";
      ctx.beginPath();
      ctx.arc(mapX(zone.x), mapZ(zone.z), 4, 0, Math.PI * 2);
      ctx.fill();
    }
    const now = Date.now();
    for (const spawn of spawns) {
      if (spawn.downUntil && now < spawn.downUntil) continue;
      const open = isUnlocked(getEnemy(spawn.enemyId), getDefeated());
      ctx.fillStyle = open ? "#e7b394" : "#5e5952";
      ctx.fillRect(mapX(spawn.x) - 1.5, mapZ(spawn.z) - 1.5, 3, 3);
    }
    ctx.fillStyle = "#e6c56a";
    for (const pile of loot) {
      ctx.beginPath();
      ctx.arc(mapX(pile.x), mapZ(pile.z), 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.save();
    ctx.translate(mapX(pos.x), mapZ(pos.z));
    ctx.rotate(yaw);
    ctx.fillStyle = "#f1e6d0";
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4, 5);
    ctx.lineTo(-4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#c4a15a";
    ctx.font = "11px Palatino, Georgia, serif";
    ctx.fillText("N", w / 2 - 4, 11);
  }

  const resizeObserver = new ResizeObserver(() => resize());
  resizeObserver.observe(canvas.parentElement || canvas);
  resize();
  requestAnimationFrame(frame);

  function onKeyDown(event) {
    if (!active) return;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) event.preventDefault();
    keys.add(event.code);
  }
  function onKeyUp(event) {
    keys.delete(event.code);
  }
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", () => keys.clear());

  let gesture = null;
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  canvas.addEventListener(
    "wheel",
    (event) => {
      if (!active) return;
      event.preventDefault();
      distance = clampDistance(distance * (1 + event.deltaY * 0.001));
    },
    { passive: false },
  );
  canvas.addEventListener("pointerdown", (event) => {
    if (!active) return;
    try {
      canvas.setPointerCapture?.(event.pointerId);
    } catch {
      /* the pointer can already be gone on a very fast tap */
    }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, button: event.button });
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: 0, button: event.button, look: event.button === 2 };
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), angle: Math.atan2(b.y - a.y, b.x - a.x), midY: (a.y + b.y) / 2 };
      if (gesture) gesture.look = true;
    }
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!active) return;
    if (pointers.has(event.pointerId)) {
      const prev = pointers.get(event.pointerId);
      const dx = event.clientX - prev.x;
      const dy = event.clientY - prev.y;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, button: prev.button });
      if (gesture && gesture.id === event.pointerId) gesture.moved += Math.hypot(dx, dy);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const angle = Math.atan2(b.y - a.y, b.x - a.x);
        const midY = (a.y + b.y) / 2;
        if (pinch) {
          // Pinch zooms, twisting turns the camera, and sliding both fingers up or down tilts it.
          if (pinch.dist > 0 && dist > 0) distance = clampDistance(distance * (pinch.dist / dist));
          let turn = angle - pinch.angle;
          if (turn > Math.PI) turn -= Math.PI * 2;
          if (turn < -Math.PI) turn += Math.PI * 2;
          yaw += turn;
          pitch = clampPitch(pitch + (midY - pinch.midY) * 0.006);
        }
        pinch = { dist, angle, midY };
        if (gesture) gesture.look = true;
        return;
      }
      if (event.pointerType !== "mouse" && gesture && (gesture.look || gesture.moved > 14)) {
        // One finger dragged past the tap threshold: swing around the player and tilt.
        yaw -= dx * 0.009;
        pitch = clampPitch(pitch + dy * 0.005);
        gesture.look = true;
        return;
      }
      if (gesture?.look) {
        yaw -= dx * 0.008;
        distance = clampDistance(distance + dy * 0.03);
        return;
      }
    }
    const hit = pick(event);
    hoverId = hit?.spawn?.id || null;
    hoverLootId = hit?.loot?.id || null;
  });
  function endPointer(event) {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!gesture || gesture.id !== event.pointerId) return;
    const tap = gesture.button === 0 && !gesture.look && gesture.moved < (event.pointerType === "mouse" ? 8 : 16);
    gesture = null;
    if (!active || !tap) return;
    const hit = pick(event, event.pointerType === "mouse" ? 0 : TOUCH_PICK_SLOP);
    if (hit?.loot) {
      walkToLoot(hit.loot);
      return;
    }
    if (hit?.spawn) {
      const gate = canEngage(hit.spawn, getDefeated(), Date.now());
      if (!gate.ok && gate.hint) options.onHint?.(gate.hint);
      if (gate.reason === "down") {
        options.onHint?.("They are still picking themselves up.");
        return;
      }
      walkTo(hit.spawn.x, hit.spawn.z, gate.ok ? hit.spawn.id : null);
      return;
    }
    if (hit?.point) walkTo(hit.point.x, hit.point.z, null);
  }
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);

  return {
    setActive(on) {
      active = Boolean(on);
      if (!active) {
        keys.clear();
        path = [];
        pendingEngage = null;
        pendingLoot = null;
        options.onHover?.(null);
      } else {
        last = performance.now();
        resize();
      }
    },
    setQuality(id) {
      quality = id === "detailed" ? "detailed" : "standard";
      if (active) resize();
    },
    setCompare(on) {
      compare = Boolean(on);
      if (active) resize();
    },
    setWeapon(id) {
      weaponId = id || "sword";
      for (const view of views.values()) view.setWeapon(weaponId);
    },
    setGear(spec) {
      gear = spec || null;
      if (spec?.weaponId) weaponId = spec.weaponId;
      for (const view of views.values()) view.setGear(gear);
    },
    getLoot() {
      return loot.map((pile) => ({ ...pile }));
    },
    setLoot(next) {
      loot = Array.isArray(next) ? next.map((pile) => ({ ...pile })) : [];
    },
    setPosition(x, z) {
      pos = { x, z };
      path = [];
      pendingEngage = null;
      pendingLoot = null;
    },
    getPosition() {
      return { x: pos.x, z: pos.z };
    },
    getSpawns() {
      return spawns;
    },
    defeat(id, now) {
      const spawn = spawnById(id);
      if (spawn) defeatSpawn(spawn, now);
    },
    walkToZone(enemyId) {
      const zone = zoneByEnemy(enemyId);
      const enemy = getEnemy(enemyId);
      if (!isUnlocked(enemy, getDefeated())) options.onHint?.(canEngage({ enemyId, downUntil: 0 }, getDefeated(), 0).hint);
      const live = spawns.find((spawn) => spawn.enemyId === enemyId && !(spawn.downUntil && Date.now() < spawn.downUntil));
      if (live && isUnlocked(enemy, getDefeated())) walkTo(live.x, live.z, live.id);
      else walkTo(zone.x, zone.z, null);
    },
    nearestZone() {
      return nearestZone(pos.x, pos.z);
    },
    /** Where a foe stands on screen, in page CSS pixels (used by the touch tests). */
    screenOf(spawnId) {
      const spawn = spawnById(spawnId);
      const primary = layoutRects[0];
      const view = primary && views.get(primary.quality);
      if (!spawn || !view) return null;
      const bounds = canvas.getBoundingClientRect();
      const spot = project(view, spawn.x, groundY(spawn.x, spawn.z) + 1.0, spawn.z, primary);
      return { x: bounds.left + spot.x, y: bounds.top + spot.y, inside: spot.x >= 0 && spot.y >= 0 && spot.x <= bounds.width && spot.y <= bounds.height };
    },
    getCamera() {
      return { yaw, pitch, distance };
    },
    resize,
    dispose() {
      running = false;
      resizeObserver.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      for (const view of views.values()) view.dispose();
      views.clear();
    },
  };
}

function buildView(qualityId, spawns, props, weaponId, gearSpec) {
  setBuildQuality(qualityId);
  const spec = profile();
  const detailed = isDetailed();
  const narrow = isNarrowScreen();
  const scene = new Scene();
  scene.background = new Color(palette.sky);
  scene.fog = new Fog(palette.fog, detailed ? 28 : 34, 150);
  const camera = new PerspectiveCamera(46, 1, 0.1, 180);

  scene.add(new HemisphereLight(palette.skyFill, palette.groundFill, spec.hemi));
  const sun = new DirectionalLight(palette.sun, spec.sun);
  sun.position.set(18, 24, 10);
  sun.castShadow = true;
  const shadowSize = shadowMapSize();
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  sun.shadow.radius = spec.shadowRadius;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  const span = 16;
  sun.shadow.camera.left = -span;
  sun.shadow.camera.right = span;
  sun.shadow.camera.top = span;
  sun.shadow.camera.bottom = -span;
  sun.shadow.camera.near = 2;
  sun.shadow.camera.far = 50;
  scene.add(sun);
  scene.add(sun.target);
  const rim = new DirectionalLight(palette.rim, spec.rim);
  rim.position.set(-10, 12, -6);
  scene.add(rim);
  if (spec.fill) {
    const fill = new DirectionalLight(0xd7e2cc, spec.fill);
    fill.position.set(-8, 10, 12);
    scene.add(fill);
  }

  scene.add(buildSky(detailed));
  const ground = buildGround(detailed);
  scene.add(ground);
  const dressing = new Group();
  dressing.add(buildTrees(props.trees, detailed));
  dressing.add(buildRocks(props.rocks, detailed));
  if (detailed) dressing.add(buildGrass(props.grass.slice(0, narrow ? 70 : 150), detailed));
  dressing.add(buildFences(props.fences));
  for (const ob of OBSTACLES) {
    if (ob.kind !== "rock") dressing.add(buildStructure(ob, detailed));
  }
  dressing.add(buildCampfire());
  dressing.add(buildPuddles());
  scene.add(dressing);

  const player = createAdventurer();
  scene.add(player.group);
  const actors = [];
  const picks = [];
  const pickMat = new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  for (const spawn of spawns) {
    const actor = createCharacter(spawn.enemyId);
    actor.group.userData.spawnId = spawn.id;
    const pick = new Mesh(new CylinderGeometry(0.72, 0.72, 1.8, 10), pickMat);
    pick.position.y = 0.9;
    pick.userData.spawnId = spawn.id;
    actor.group.add(pick);
    picks.push(pick);
    const ring = new Mesh(
      new TorusGeometry(0.38, 0.035, 8, 18),
      new MeshStandardMaterial({ color: palette.stone, roughness: 0.6, metalness: 0.2 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 2.05;
    actor.group.add(ring);
    actor.group.userData.lockRing = ring;
    scene.add(actor.group);
    actors.push({ spawn, actor, ring });
  }

  const lootGroup = new Group();
  scene.add(lootGroup);
  const lootPicks = [];
  let lootKey = "";

  function syncLoot(piles) {
    const key = (piles || []).map((pile) => pile.id).join("|");
    if (key === lootKey) return;
    lootKey = key;
    while (lootGroup.children.length) {
      const child = lootGroup.children[0];
      lootGroup.remove(child);
      disposeObject(child);
    }
    lootPicks.length = 0;
    for (const pile of piles || []) {
      const mesh = buildPile(pile);
      lootGroup.add(mesh);
      lootPicks.push(mesh);
    }
  }
  const marker = new Mesh(
    new TorusGeometry(0.42, 0.045, 8, 24),
    new MeshStandardMaterial({ color: palette.ochre, roughness: 0.45, metalness: 0.15, emissive: palette.ochre, emissiveIntensity: 0.15 }),
  );
  marker.rotation.x = Math.PI / 2;
  marker.visible = false;
  scene.add(marker);

  let worn = gearSpec || null;

  function setWeapon(id) {
    const hand = player.hand;
    while (hand.children.length) {
      const child = hand.children[0];
      hand.remove(child);
      disposeObject(child);
    }
    const weapon = createWeapon(id);
    weapon.group.rotation.x = Math.PI;
    hand.add(weapon.group);
    dressAdventurer(player, worn);
  }

  function setGear(spec) {
    worn = spec || null;
    setWeapon(spec?.weaponId || weaponId);
  }
  setWeapon(weaponId);

  return {
    scene,
    camera,
    ground,
    picks,
    lootPicks,
    exposure: spec.exposure,
    builtNarrow: narrow,
    setWeapon,
    setGear,
    resize(width, height) {
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    },
    frameCamera(at, yaw, dist, tilt = CAMERA.pitch) {
      const y = groundY(at.x, at.z);
      const horizontal = dist * Math.cos(tilt);
      camera.position.set(at.x - Math.sin(yaw) * horizontal, y + 1.4 + dist * Math.sin(tilt), at.z - Math.cos(yaw) * horizontal);
      camera.lookAt(at.x, y + 1.15, at.z);
      sun.position.set(at.x + 14, 22, at.z + 8);
      sun.target.position.set(at.x, 0, at.z);
      sun.target.updateMatrixWorld();
    },
    sync(at, facing, roster, defeated, now, moving, path, piles) {
      syncLoot(piles);
      const y = groundY(at.x, at.z);
      const bob = Math.sin(now * (moving ? 0.012 : 0.0022)) * (moving ? 0.06 : 0.025);
      player.group.position.set(at.x, y + bob, at.z);
      player.group.rotation.y = facing;
      const arm = player.group.userData.arm;
      if (arm) arm.rotation.x = -0.7 - (moving ? Math.sin(now * 0.012) * 0.45 : 0);
      for (const entry of actors) {
        const spawn = entry.spawn;
        const down = spawn.downUntil && now < spawn.downUntil;
        entry.actor.group.visible = !down;
        if (down) continue;
        const gy = groundY(spawn.x, spawn.z);
        const sway = Math.sin(now * 0.002 + spawn.homeX) * 0.03;
        entry.actor.group.position.set(spawn.x, gy + sway, spawn.z);
        if (spawn.goal) entry.actor.group.rotation.y = Math.atan2(spawn.goal.x - spawn.x, spawn.goal.z - spawn.z);
        const enemy = getEnemy(spawn.enemyId);
        entry.ring.visible = !isUnlocked(enemy, defeated);
      }
      const end = path[path.length - 1];
      marker.visible = Boolean(end);
      if (end) marker.position.set(end.x, groundY(end.x, end.z) + 0.08, end.z);
    },
    dispose() {
      disposeObject(scene);
    },
  };
}

function lootIdFrom(object) {
  let node = object;
  while (node) {
    if (node.userData?.lootId) return node.userData.lootId;
    node = node.parent;
  }
  return null;
}

function buildPile(pile) {
  const group = new Group();
  group.userData.lootId = pile.id;
  const item = getItem(pile.itemId);
  const y = groundY(pile.x, pile.z);
  group.position.set(pile.x, y, pile.z);
  const ringMat = new MeshStandardMaterial({ color: palette.ochre, roughness: 0.4, metalness: 0.2, emissive: palette.ochre, emissiveIntensity: 0.25 });
  const ring = new Mesh(new TorusGeometry(0.28, 0.035, 6, 18), ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.05;
  group.add(ring);
  const pick = new Mesh(
    new CylinderGeometry(0.85, 0.85, 1.4, 10),
    new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  pick.position.y = 0.7;
  pick.userData.lootId = pile.id;
  group.add(pick);
  const kind = item?.kind;
  const tier = item?.tier;
  const color = kind === "currency" ? palette.ochre : kind === "food" ? palette.leather : tier === "iron" ? palette.iron : kind === "junk" ? palette.stone : palette.bronze;
  const mat = new MeshStandardMaterial({ color, roughness: kind === "currency" ? 0.35 : 0.6, metalness: kind === "gear" || kind === "currency" ? 0.45 : 0.05 });
  if (kind === "currency") {
    const coin = new Mesh(new CylinderGeometry(0.12, 0.12, 0.04, 12), mat);
    coin.position.y = 0.06;
    group.add(coin);
    const coin2 = new Mesh(new CylinderGeometry(0.09, 0.09, 0.04, 12), mat);
    coin2.position.set(0.08, 0.1, 0.04);
    group.add(coin2);
  } else if (kind === "junk") {
    const bone = new Mesh(new CapsuleGeometry(0.03, 0.16, 3, 6), mat);
    bone.rotation.z = 0.6;
    bone.position.y = 0.06;
    group.add(bone);
  } else if (kind === "food") {
    const loaf = new Mesh(new SphereGeometry(0.12, 10, 8), mat);
    loaf.scale.set(1.3, 0.7, 0.9);
    loaf.position.y = 0.08;
    group.add(loaf);
  } else {
    const lump = new Mesh(new SphereGeometry(0.1, 10, 8), mat);
    lump.scale.set(1.1, 0.55, 0.8);
    lump.position.y = 0.06;
    group.add(lump);
    const shard = new Mesh(new CapsuleGeometry(0.025, 0.14, 3, 6), mat);
    shard.rotation.z = -0.4;
    shard.position.set(0.04, 0.12, 0);
    group.add(shard);
  }
  group.traverse((node) => {
    node.castShadow = true;
    node.userData.lootId = pile.id;
  });
  return group;
}

function buildSky(detailed) {
  const geo = new SphereGeometry(120, detailed ? 28 : 20, detailed ? 18 : 12);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const top = new Color(0xd5d0bc);
  const mid = new Color(palette.sky);
  const low = new Color(detailed ? 0x5d684c : 0x667056);
  for (let i = 0; i < pos.count; i += 1) {
    const y = pos.getY(i) / 120;
    const tint = low.clone().lerp(mid, MathUtils.smoothstep(y, -0.2, 0.25));
    tint.lerp(top, MathUtils.smoothstep(y, 0.05, 0.8));
    colors[i * 3] = tint.r;
    colors[i * 3 + 1] = tint.g;
    colors[i * 3 + 2] = tint.b;
  }
  geo.setAttribute("color", new Float32BufferAttribute(colors, 3));
  return new Mesh(geo, new MeshBasicMaterial({ vertexColors: true, side: BackSide, depthWrite: false }));
}

function buildGround(detailed) {
  const width = BOUNDS.maxX - BOUNDS.minX;
  const depth = BOUNDS.maxZ - BOUNDS.minZ;
  const segX = detailed ? 90 : 48;
  const segZ = detailed ? 42 : 24;
  const geo = new PlaneGeometry(width, depth, segX, segZ);
  geo.rotateX(-Math.PI / 2);
  geo.translate(BOUNDS.minX + width / 2, 0, BOUNDS.minZ + depth / 2);
  const pos = geo.attributes.position;
  const color = new Float32Array(pos.count * 3);
  const moss = new Color(palette.moss);
  const mossDeep = new Color(palette.mossDeep);
  const dirt = new Color(palette.dirt);
  const ochre = new Color(palette.ochre);
  const stone = new Color(palette.stone);
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, groundY(x, z));
    const zone = nearestZone(x, z);
    const tint = dirt.clone();
    if (zone.enemyId === "goblin") tint.lerp(moss, 0.55);
    else if (zone.enemyId === "man") tint.lerp(ochre, 0.28);
    else if (zone.enemyId === "guard") tint.lerp(stone, 0.35);
    else tint.lerp(mossDeep, 0.62);
    const road = 1 - smoothstep(0.2, 2.2, distanceToRoad(x, z));
    tint.lerp(ochre, road * 0.55);
    tint.lerp(dirt, road * 0.25);
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
  mesh.userData.ground = true;
  return mesh;
}

function instanceMesh(geometry, material, spots, yOffset, cast) {
  stampAoUv(geometry);
  const mesh = new InstancedMesh(geometry, material, Math.max(1, spots.length));
  mesh.count = spots.length;
  spots.forEach((spot, index) => {
    const scale = spot.scale || 1;
    dummy.position.set(spot.x, groundY(spot.x, spot.z) + yOffset * scale, spot.z);
    dummy.rotation.set(0, spot.rot || 0, 0);
    dummy.scale.set(scale, scale, scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  return mesh;
}

function buildTrees(spots, detailed) {
  const group = new Group();
  const segs = detailed ? [8, 14] : [5, 10];
  const bark = new MeshStandardMaterial({ color: palette.bark, roughness: 0.86 });
  const leaf = new MeshStandardMaterial({ color: palette.moss, roughness: 0.9 });
  if (detailed) {
    applyMaps(bark, "wood");
    applyMaps(leaf, "cloth");
  }
  const trunk = new CapsuleGeometry(0.12, 0.9, segs[0], segs[1]);
  const crown = new SphereGeometry(0.5, detailed ? 18 : 12, detailed ? 14 : 10);
  group.add(instanceMesh(trunk, bark, spots, 0.62, !isNarrowScreen()));
  group.add(instanceMesh(crown, leaf, spots, 1.25, false));
  return group;
}

function buildRocks(spots, detailed) {
  const stone = new MeshStandardMaterial({ color: palette.stone, roughness: 0.94 });
  if (detailed) applyMaps(stone, "ground");
  const geo = new SphereGeometry(0.38, detailed ? 16 : 12, detailed ? 12 : 8);
  return instanceMesh(geo, stone, spots, 0.16, false);
}

function buildGrass(spots) {
  const mat = new MeshStandardMaterial({ color: palette.mossBright, roughness: 0.84 });
  applyMaps(mat, "cloth");
  const geo = new CapsuleGeometry(0.025, 0.22, 2, 5);
  return instanceMesh(geo, mat, spots, 0.16, false);
}

function buildFences(spots) {
  const wood = new MeshStandardMaterial({ color: palette.barkDark, roughness: 0.8 });
  const geo = new CapsuleGeometry(0.05, 0.55, 4, 8);
  return instanceMesh(geo, wood, spots, 0.32, false);
}

function buildStructure(ob, detailed) {
  const group = new Group();
  group.position.set(ob.x, groundY(ob.x, ob.z), ob.z);
  const wall = new MeshStandardMaterial({ color: palette.manShirt, roughness: 0.86 });
  const roofMat = new MeshStandardMaterial({ color: palette.barkDark, roughness: 0.8 });
  const stone = new MeshStandardMaterial({ color: palette.stone, roughness: 0.7, metalness: 0.08 });
  const cloth = new MeshStandardMaterial({ color: palette.goblinDeep, roughness: 0.9 });
  if (detailed) {
    applyMaps(wall, "cloth");
    applyMaps(roofMat, "wood");
    applyMaps(stone, "ground");
    applyMaps(cloth, "cloth");
  }
  const add = (geo, mat, x, y, z) => {
    const mesh = new Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  if (ob.kind === "tent") {
    add(createLathe([[0.05, 1.15], [0.7, 0.15], [0.85, 0]], detailed ? 28 : 18), cloth, 0, 0, 0);
  } else if (ob.kind === "cottage") {
    add(createRoundedBox(2.3, 1.5, 1.7, 3.2, detailed ? 28 : 18, detailed ? 16 : 12), wall, 0, 0.85, 0);
    const roof = add(createLathe([[0.15, 1.15], [1.45, 0.1], [1.55, 0]], detailed ? 28 : 16), roofMat, 0, 1.45, 0);
    roof.scale.set(1, 0.7, 0.85);
    add(createRoundedBox(0.45, 0.7, 0.08, 3, 12, 8), roofMat, 0, 0.55, 0.86);
  } else if (ob.kind === "shed") {
    add(createRoundedBox(1.3, 1.05, 1.1, 3.2, 16, 12), wall, 0, 0.55, 0);
    add(createLathe([[0.1, 0.55], [0.85, 0]], 16), roofMat, 0, 1.05, 0);
  } else if (ob.kind === "tower") {
    add(new CapsuleGeometry(0.7, 2.4, detailed ? 8 : 5, detailed ? 16 : 10), stone, 0, 1.7, 0);
    add(new TorusGeometry(0.85, 0.08, 8, 20), stone, 0, 2.7, 0).rotation.x = Math.PI / 2;
    add(new SphereGeometry(0.45, 14, 10), roofMat, 0, 3.15, 0);
  } else if (ob.kind === "pillar") {
    add(new CapsuleGeometry(0.28, 1.8, 5, 12), stone, 0, 1.15, 0);
  } else if (ob.kind === "log") {
    const log = add(new CapsuleGeometry(0.16, 1.1, 5, 10), roofMat, 0, 0.2, 0);
    log.rotation.z = Math.PI / 2;
  }
  return group;
}

function buildCampfire() {
  const group = new Group();
  group.position.set(6.4, groundY(6.4, 16.7), 16.7);
  const stone = new MeshStandardMaterial({ color: palette.stoneDark, roughness: 0.9 });
  for (let i = 0; i < 6; i += 1) {
    const rock = new Mesh(new SphereGeometry(0.16, 10, 8), stone);
    const angle = (i / 6) * Math.PI * 2;
    rock.position.set(Math.cos(angle) * 0.42, 0.08, Math.sin(angle) * 0.42);
    group.add(rock);
  }
  const flame = new Mesh(
    new SphereGeometry(0.16, 12, 10),
    new MeshStandardMaterial({ color: 0xd97840, emissive: 0xff9a45, emissiveIntensity: 0.7, roughness: 0.45 }),
  );
  flame.position.y = 0.22;
  group.add(flame);
  return group;
}

function buildPuddles() {
  const group = new Group();
  const mat = new MeshStandardMaterial({
    color: palette.puddle,
    roughness: 0.18,
    metalness: 0.08,
    transparent: true,
    opacity: 0.55,
    side: DoubleSide,
  });
  for (const [x, z, sx] of [
    [9.5, 13.2, 1.4],
    [14.8, 12.4, 1.1],
  ]) {
    const puddle = new Mesh(new CircleGeometry(0.7, 20), mat);
    puddle.rotation.x = -Math.PI / 2;
    puddle.position.set(x, groundY(x, z) + 0.03, z);
    puddle.scale.set(sx, 1, 0.75);
    group.add(puddle);
  }
  return group;
}
