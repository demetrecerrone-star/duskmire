/**
 * Overworld rules: road, obstacles, pathfinding, spawns, locks, respawn, regen.
 * No DOM and no rendering. The browser and the Node tests both import this.
 */
import { createRng } from "./rng.js";
import { getEnemy, isUnlocked } from "./enemies.js";

export const BOUNDS = Object.freeze({
  minX: 0,
  minZ: 2,
  maxX: 60,
  maxZ: 26,
  cell: 1,
});

export const START = Object.freeze({ x: 4, z: 14 });
export const ROAD_HALF = 1.55;
export const RESPAWN_MS = 18000;
export const REGEN_INTERVAL = 3;
export const WANDER_SPEED = 0.85;
export const WALK_SPEED = 5.4;
export const ENCOUNTER_RANGE = 1.45;
export const BODY_RADIUS = 0.34;

export const ZONES = Object.freeze([
  { id: "goblin-camp", enemyId: "goblin", name: "Goblin camp", x: 12, z: 15, leash: 3.6 },
  { id: "village", enemyId: "man", name: "The farm", x: 26, z: 13.2, leash: 3.4 },
  { id: "gate", enemyId: "guard", name: "The gate", x: 40, z: 12.2, leash: 3.1 },
  { id: "woods", enemyId: "highwayman", name: "The wooded road", x: 52, z: 11.2, leash: 3.5 },
]);

/** Buildings and stones. The road carve keeps a walking corridor through them. */
export const OBSTACLES = Object.freeze([
  { id: "tent-a", kind: "tent", x: 10.2, z: 19.4, r: 1.15 },
  { id: "tent-b", kind: "tent", x: 15.4, z: 19.1, r: 1.05 },
  { id: "camp-rock", kind: "rock", x: 8.2, z: 18.6, r: 0.7 },
  { id: "cottage", kind: "cottage", x: 26.2, z: 7.4, r: 1.7 },
  { id: "shed", kind: "shed", x: 30.4, z: 8.1, r: 0.9 },
  { id: "tower", kind: "tower", x: 43.2, z: 7.1, r: 1.45 },
  { id: "pillar-n", kind: "pillar", x: 37.6, z: 9.4, r: 0.55 },
  { id: "pillar-s", kind: "pillar", x: 37.6, z: 15.1, r: 0.55 },
  { id: "log", kind: "log", x: 48.5, z: 15.6, r: 0.8 },
]);

const ROAD = Object.freeze([
  [3, 14],
  [12, 15],
  [26, 13.2],
  [40, 12.2],
  [52, 11.2],
  [57, 11.2],
]);

const SPAWN_OFFSETS = Object.freeze({
  goblin: [
    [-1.6, 1.1],
    [1.7, 0.8],
    [0.4, -1.5],
  ],
  man: [
    [-1.5, 1.2],
    [1.6, -0.7],
  ],
  guard: [
    [-1.3, 0.9],
    [1.4, -1.0],
  ],
  highwayman: [
    [-1.6, 1.0],
    [1.5, -1.1],
  ],
});

export function roadPoints() {
  return ROAD.map(([x, z]) => ({ x, z }));
}

export function distanceToPolyline(x, z, points = ROAD) {
  let best = Infinity;
  for (let i = 0; i < points.length - 1; i += 1) {
    const ax = points[i][0];
    const az = points[i][1];
    const bx = points[i + 1][0];
    const bz = points[i + 1][1];
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz || 1;
    let t = ((x - ax) * dx + (z - az) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = ax + dx * t;
    const pz = az + dz * t;
    const dist = Math.hypot(x - px, z - pz);
    if (dist < best) best = dist;
  }
  return best;
}

export function distanceToRoad(x, z) {
  return distanceToPolyline(x, z, ROAD);
}

export function nearestZone(x, z) {
  let best = ZONES[0];
  let bestDist = Infinity;
  for (const zone of ZONES) {
    const dist = Math.hypot(zone.x - x, zone.z - z);
    if (dist < bestDist) {
      best = zone;
      bestDist = dist;
    }
  }
  return best;
}

export function zoneByEnemy(enemyId) {
  return ZONES.find((zone) => zone.enemyId === enemyId) || ZONES[0];
}

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

export function clampToBounds(x, z) {
  const inset = 0.8;
  return {
    x: Math.min(BOUNDS.maxX - inset, Math.max(BOUNDS.minX + inset, x)),
    z: Math.min(BOUNDS.maxZ - inset, Math.max(BOUNDS.minZ + inset, z)),
  };
}

export function createWorldGrid() {
  const { minX, minZ, maxX, maxZ, cell } = BOUNDS;
  const cols = Math.round((maxX - minX) / cell);
  const rows = Math.round((maxZ - minZ) / cell);
  const blocked = new Uint8Array(cols * rows);
  for (let iz = 0; iz < rows; iz += 1) {
    for (let ix = 0; ix < cols; ix += 1) {
      const x = minX + (ix + 0.5) * cell;
      const z = minZ + (iz + 0.5) * cell;
      let hit = false;
      for (const ob of OBSTACLES) {
        if (Math.hypot(ob.x - x, ob.z - z) <= ob.r + 0.15) {
          hit = true;
          break;
        }
      }
      if (hit && distanceToRoad(x, z) >= ROAD_HALF) blocked[iz * cols + ix] = 1;
    }
  }
  return { cols, rows, blocked, cell, originX: minX, originZ: minZ };
}

export function worldToCell(grid, x, z) {
  const ix = Math.floor((x - grid.originX) / grid.cell);
  const iz = Math.floor((z - grid.originZ) / grid.cell);
  return { ix, iz };
}

export function cellCenter(grid, ix, iz) {
  return {
    x: grid.originX + (ix + 0.5) * grid.cell,
    z: grid.originZ + (iz + 0.5) * grid.cell,
  };
}

export function inGrid(grid, ix, iz) {
  return ix >= 0 && iz >= 0 && ix < grid.cols && iz < grid.rows;
}

export function cellBlocked(grid, ix, iz) {
  if (!inGrid(grid, ix, iz)) return true;
  return grid.blocked[iz * grid.cols + ix] === 1;
}

export function nearestWalkable(grid, x, z) {
  const seed = worldToCell(grid, x, z);
  if (inGrid(grid, seed.ix, seed.iz) && !cellBlocked(grid, seed.ix, seed.iz)) {
    return cellCenter(grid, seed.ix, seed.iz);
  }
  for (let radius = 1; radius <= 8; radius += 1) {
    for (let dz = -radius; dz <= radius; dz += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
        const ix = seed.ix + dx;
        const iz = seed.iz + dz;
        if (!cellBlocked(grid, ix, iz)) return cellCenter(grid, ix, iz);
      }
    }
  }
  return null;
}

const DIRS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

function heuristic(ax, az, bx, bz) {
  const dx = Math.abs(ax - bx);
  const dz = Math.abs(az - bz);
  const diagonal = Math.min(dx, dz);
  const straight = Math.max(dx, dz) - diagonal;
  return diagonal * Math.SQRT2 + straight;
}

/**
 * A* on a walkable grid. Returns world-space waypoints, or [] if there is no route.
 * Diagonal steps are refused when they would clip a blocked corner.
 */
export function findPath(grid, from, to) {
  const start = nearestWalkable(grid, from.x, from.z);
  const goal = nearestWalkable(grid, to.x, to.z);
  if (!start || !goal) return [];
  const sCell = worldToCell(grid, start.x, start.z);
  const gCell = worldToCell(grid, goal.x, goal.z);
  const startKey = sCell.iz * grid.cols + sCell.ix;
  const goalKey = gCell.iz * grid.cols + gCell.ix;
  const open = [startKey];
  const gScore = new Map([[startKey, 0]]);
  const fScore = new Map([[startKey, heuristic(sCell.ix, sCell.iz, gCell.ix, gCell.iz)]]);
  const came = new Map();
  const seen = new Uint8Array(grid.cols * grid.rows);

  while (open.length) {
    let bestIndex = 0;
    for (let i = 1; i < open.length; i += 1) {
      if ((fScore.get(open[i]) ?? Infinity) < (fScore.get(open[bestIndex]) ?? Infinity)) bestIndex = i;
    }
    const current = open.splice(bestIndex, 1)[0];
    if (current === goalKey) {
      const cells = [current];
      let walk = current;
      while (came.has(walk)) {
        walk = came.get(walk);
        cells.push(walk);
      }
      cells.reverse();
      const points = cells.map((key) => cellCenter(grid, key % grid.cols, Math.floor(key / grid.cols)));
      points[0] = { x: from.x, z: from.z };
      points[points.length - 1] = { x: goal.x, z: goal.z };
      return simplifyPath(points);
    }
    if (seen[current]) continue;
    seen[current] = 1;
    const ix = current % grid.cols;
    const iz = Math.floor(current / grid.cols);
    for (const [dx, dz, cost] of DIRS) {
      const nx = ix + dx;
      const nz = iz + dz;
      if (cellBlocked(grid, nx, nz)) continue;
      if (dx !== 0 && dz !== 0 && (cellBlocked(grid, ix + dx, iz) || cellBlocked(grid, ix, iz + dz))) continue;
      const key = nz * grid.cols + nx;
      const nextG = (gScore.get(current) ?? Infinity) + cost;
      if (nextG >= (gScore.get(key) ?? Infinity)) continue;
      came.set(key, current);
      gScore.set(key, nextG);
      fScore.set(key, nextG + heuristic(nx, nz, gCell.ix, gCell.iz));
      if (!open.includes(key)) open.push(key);
    }
  }
  return [];
}

function simplifyPath(points) {
  if (points.length <= 2) return points;
  const out = [points[0]];
  for (let i = 1; i < points.length - 1; i += 1) {
    const a = out[out.length - 1];
    const b = points[i];
    const c = points[i + 1];
    const cross = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
    if (Math.abs(cross) > 0.05) out.push(b);
  }
  out.push(points[points.length - 1]);
  return out;
}

export function circleBlocked(grid, x, z, radius = BODY_RADIUS) {
  const samples = [
    [0, 0],
    [radius, 0],
    [-radius, 0],
    [0, radius],
    [0, -radius],
  ];
  for (const [dx, dz] of samples) {
    const cell = worldToCell(grid, x + dx, z + dz);
    if (cellBlocked(grid, cell.ix, cell.iz)) return true;
  }
  return false;
}

export function moveWithCollision(grid, x, z, dx, dz, radius = BODY_RADIUS) {
  let nextX = x;
  let nextZ = z;
  if (!circleBlocked(grid, x + dx, z, radius)) nextX = x + dx;
  if (!circleBlocked(grid, nextX, z + dz, radius)) nextZ = z + dz;
  return clampToBounds(nextX, nextZ);
}

export function approachPoint(from, target, stopDistance) {
  const dx = target.x - from.x;
  const dz = target.z - from.z;
  const len = Math.hypot(dx, dz);
  if (len <= stopDistance) return { x: from.x, z: from.z };
  const scale = (len - stopDistance) / len;
  return { x: from.x + dx * scale, z: from.z + dz * scale };
}

export function createSpawns() {
  const spawns = [];
  for (const zone of ZONES) {
    const offsets = SPAWN_OFFSETS[zone.enemyId] || [[0, 0]];
    offsets.forEach(([ox, oz], index) => {
      const homeX = zone.x + ox;
      const homeZ = zone.z + oz;
      spawns.push({
        id: `${zone.enemyId}-${index + 1}`,
        enemyId: zone.enemyId,
        zoneId: zone.id,
        homeX,
        homeZ,
        x: homeX,
        z: homeZ,
        leash: zone.leash,
        downUntil: 0,
        goal: null,
        nextPick: 0,
      });
    });
  }
  return spawns;
}

export function lockHint(enemyId) {
  const enemy = getEnemy(enemyId);
  if (!enemy.unlockAfter) return "";
  const prior = getEnemy(enemy.unlockAfter);
  return `Defeat the ${prior.name.toLowerCase()} before a ${enemy.name.toLowerCase()} will fight.`;
}

export function canEngage(spawn, defeatedIds, now) {
  if (!spawn) return { ok: false, reason: "missing" };
  if (spawn.downUntil && now < spawn.downUntil) return { ok: false, reason: "down" };
  const enemy = getEnemy(spawn.enemyId);
  if (!isUnlocked(enemy, defeatedIds || [])) {
    return { ok: false, reason: "locked", hint: lockHint(spawn.enemyId) };
  }
  return { ok: true, enemy };
}

export function reviveSpawns(spawns, now) {
  let changed = false;
  for (const spawn of spawns) {
    if (spawn.downUntil && now >= spawn.downUntil) {
      spawn.downUntil = 0;
      spawn.x = spawn.homeX;
      spawn.z = spawn.homeZ;
      spawn.goal = null;
      changed = true;
    }
  }
  return changed;
}

export function defeatSpawn(spawn, now, delay = RESPAWN_MS) {
  spawn.downUntil = now + delay;
  spawn.goal = null;
  return spawn;
}

export function stepWander(spawn, dt, rng, now) {
  if (!spawn || (spawn.downUntil && now < spawn.downUntil)) return spawn;
  if (!spawn.goal || now >= spawn.nextPick) {
    const angle = rng.next() * Math.PI * 2;
    const dist = rng.next() * spawn.leash * 0.85;
    spawn.goal = {
      x: spawn.homeX + Math.cos(angle) * dist,
      z: spawn.homeZ + Math.sin(angle) * dist,
    };
    spawn.nextPick = now + 1800 + rng.next() * 2200;
  }
  const dx = spawn.goal.x - spawn.x;
  const dz = spawn.goal.z - spawn.z;
  const len = Math.hypot(dx, dz);
  if (len > 0.04) {
    const step = Math.min(len, WANDER_SPEED * dt);
    spawn.x += (dx / len) * step;
    spawn.z += (dz / len) * step;
  }
  const hx = spawn.x - spawn.homeX;
  const hz = spawn.z - spawn.homeZ;
  const homeDist = Math.hypot(hx, hz);
  if (homeDist > spawn.leash) {
    spawn.x = spawn.homeX + (hx / homeDist) * spawn.leash;
    spawn.z = spawn.homeZ + (hz / homeDist) * spawn.leash;
  }
  return spawn;
}

export function stepRegen(hp, maxHp, dt, acc, interval = REGEN_INTERVAL) {
  const cap = Math.max(1, maxHp || 1);
  let next = Math.max(0, hp || 0);
  let bank = (acc || 0) + Math.max(0, dt || 0);
  if (next >= cap) return { hp: cap, acc: 0 };
  while (bank >= interval && next < cap) {
    bank -= interval;
    next += 1;
  }
  if (next >= cap) return { hp: cap, acc: 0 };
  return { hp: next, acc: bank };
}

export function resolveReturn({ victory, x, z, hp, maxHp }) {
  if (victory) {
    return {
      x,
      z,
      hp: Math.min(maxHp, Math.max(0, hp)),
      respawn: false,
    };
  }
  return { x: START.x, z: START.z, hp: maxHp, respawn: true };
}

export function readWorldSave(save) {
  const rawX = finite(save?.x) ? save.x : START.x;
  const rawZ = finite(save?.z) ? save.z : START.z;
  const pos = clampToBounds(rawX, rawZ);
  const hp = finite(save?.hp) ? save.hp : null;
  const down = [];
  if (Array.isArray(save?.down)) {
    for (const entry of save.down) {
      if (!entry || typeof entry.id !== "string" || !finite(entry.until)) continue;
      down.push({ id: entry.id, until: entry.until });
    }
  }
  return { x: pos.x, z: pos.z, hp, down };
}

export function applyDown(spawns, records, now) {
  const byId = new Map((records || []).map((entry) => [entry.id, entry.until]));
  for (const spawn of spawns) {
    const until = byId.get(spawn.id);
    if (!until || until <= now) continue;
    spawn.downUntil = until;
  }
  return spawns;
}

export function layoutProps(seed = 11) {
  const rng = createRng(seed);
  const trees = [];
  const rocks = [];
  const grass = [];
  const taken = OBSTACLES.map((ob) => ({ x: ob.x, z: ob.z }));
  const place = (list, count, minRoad, sep, scale) => {
    for (let n = 0; n < count; n += 1) {
      let spot = null;
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const x = BOUNDS.minX + 1 + rng.next() * (BOUNDS.maxX - BOUNDS.minX - 2);
        const z = BOUNDS.minZ + 1 + rng.next() * (BOUNDS.maxZ - BOUNDS.minZ - 2);
        if (distanceToRoad(x, z) < minRoad) continue;
        if (taken.some((p) => Math.hypot(p.x - x, p.z - z) < sep)) continue;
        spot = { x, z, scale: scale[0] + rng.next() * (scale[1] - scale[0]), rot: rng.next() * Math.PI * 2 };
        break;
      }
      if (!spot) continue;
      taken.push(spot);
      list.push(spot);
    }
  };
  place(trees, 34, 2.15, 2.4, [0.85, 1.35]);
  place(rocks, 12, 1.7, 2.2, [0.45, 0.9]);
  place(grass, 200, 0.85, 0.7, [0.7, 1.15]);
  const fences = [];
  for (let x = 22.2; x <= 32.4; x += 1.15) {
    fences.push({ x, z: 8.35, scale: 1, rot: 0 });
  }
  return { trees, rocks, grass, fences };
}
