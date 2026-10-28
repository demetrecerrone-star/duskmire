/**
 * Overworld rules. Run with the combat suite:
 *   node tools/nav.test.js
 */
import {
  BOUNDS,
  START,
  ZONES,
  RESPAWN_MS,
  approachPoint,
  applyDown,
  canEngage,
  cellBlocked,
  createSpawns,
  createWorldGrid,
  defeatSpawn,
  distanceToRoad,
  findPath,
  layoutProps,
  moveWithCollision,
  nearestZone,
  readWorldSave,
  resolveReturn,
  reviveSpawns,
  stepRegen,
  stepWander,
  zoneByEnemy,
} from "../js/nav.js";
import { createRng } from "../js/rng.js";

const failures = [];

function assert(condition, message) {
  const ok = Boolean(condition);
  console.log(`${ok ? "PASS" : "FAIL"}  ${message}`);
  if (!ok) failures.push(message);
}

console.log("Duskmire overworld rules");

const grid = createWorldGrid();
assert(grid.cols === 60 && grid.rows === 24, `World grid is 60 by 24 (got ${grid.cols} by ${grid.rows})`);

const wall = {
  cols: 11,
  rows: 7,
  cell: 1,
  originX: 0,
  originZ: 0,
  blocked: new Uint8Array(11 * 7),
};
for (let z = 0; z < 7; z += 1) wall.blocked[z * 11 + 5] = 1;
wall.blocked[6 * 11 + 5] = 0;
const around = findPath(wall, { x: 1.2, z: 1.2 }, { x: 8.2, z: 1.2 });
assert(around.length >= 2, "A path exists around a wall with one gap");
assert(
  around.some((point) => Math.abs(point.z - 6.5) < 0.6),
  "The path uses the gap at the bottom of the wall",
);
const straight = findPath(wall, { x: 1.2, z: 1.2 }, { x: 3.2, z: 1.2 });
assert(straight.length >= 2, "An open run still returns a path");
assert(
  straight.every((point) => point.x < 5),
  "A short open path does not detour through the wall",
);

for (const zone of ZONES) {
  const path = findPath(grid, START, { x: zone.x, z: zone.z });
  assert(path.length >= 2, `The road reaches ${zone.name}`);
  const end = path[path.length - 1];
  assert(Math.hypot(end.x - zone.x, end.z - zone.z) < 2.2, `${zone.name} path ends at the zone`);
}

for (let i = 1; i < ZONES.length; i += 1) {
  assert(ZONES[i].x > ZONES[i - 1].x, `${ZONES[i].name} sits further along the road than ${ZONES[i - 1].name}`);
}
assert(nearestZone(START.x, START.z).enemyId === "goblin", "The campfire is nearest the goblin camp");
assert(zoneByEnemy("highwayman").id === "woods", "Highwaymen belong to the wooded road");

const cottage = { x: 26.2, z: 7.4 };
assert(distanceToRoad(cottage.x, cottage.z) > 1.55, "The cottage sits off the road");
const props = layoutProps(11);
assert(props.trees.length >= 20, `Trees were scattered (got ${props.trees.length})`);
assert(
  props.trees.every((tree) => distanceToRoad(tree.x, tree.z) >= 2.15),
  "Trees stay off the walking road",
);
assert(
  props.rocks.every((rock) => distanceToRoad(rock.x, rock.z) >= 1.7),
  "Rocks stay off the walking road",
);

const moved = moveWithCollision(grid, 26.2, 8.8, 0, -2.2);
assert(moved.z > 8.2, `Collision stops short of the cottage (z ${moved.z.toFixed(2)})`);
assert(cellBlocked(grid, 0, -1), "Cells outside the map are blocked");

const stop = approachPoint({ x: 0, z: 0 }, { x: 10, z: 0 }, 1.45);
assert(Math.abs(stop.x - 8.55) < 0.05, `Approach stops short of an enemy (got ${stop.x.toFixed(2)})`);

const spawns = createSpawns();
assert(spawns.filter((spawn) => spawn.enemyId === "goblin").length === 3, "Three goblins wander the camp");
assert(spawns.filter((spawn) => spawn.enemyId === "man").length === 2, "Two men stand at the farm");
assert(spawns.filter((spawn) => spawn.enemyId === "guard").length === 2, "Two guards hold the gate");
assert(spawns.filter((spawn) => spawn.enemyId === "highwayman").length === 2, "Two highwaymen lurk in the woods");

const goblin = spawns.find((spawn) => spawn.id === "goblin-1");
const man = spawns.find((spawn) => spawn.id === "man-1");
const guard = spawns.find((spawn) => spawn.id === "guard-1");
const bandit = spawns.find((spawn) => spawn.id === "highwayman-1");
assert(canEngage(goblin, [], 0).ok, "A goblin can be fought from a fresh save");
assert(canEngage(man, [], 0).reason === "locked", "A man is locked until a goblin falls");
assert(canEngage(man, ["goblin"], 0).ok, "Beating a goblin unlocks the men");
assert(canEngage(guard, ["goblin"], 0).reason === "locked", "A guard stays locked until a man falls");
assert(canEngage(guard, ["goblin", "man"], 0).ok, "Beating a man unlocks the guards");
assert(canEngage(bandit, ["goblin", "man"], 0).reason === "locked", "A highwayman waits on the guard");
assert(canEngage(bandit, ["goblin", "man", "guard"], 0).ok, "Beating a guard unlocks the highwaymen");
assert(
  canEngage(man, [], 0).hint.includes("goblin"),
  "The lock hint names the goblin",
);

defeatSpawn(goblin, 1000);
assert(canEngage(goblin, [], 1000 + RESPAWN_MS - 1).reason === "down", "A defeated goblin stays down until the timer");
assert(!reviveSpawns(spawns, 1000 + RESPAWN_MS - 1), "Respawn does not fire early");
assert(reviveSpawns(spawns, 1000 + RESPAWN_MS), "Respawn fires when the delay elapses");
assert(goblin.downUntil === 0 && goblin.x === goblin.homeX, "A revived goblin returns home");

const fresh = createSpawns();
applyDown(fresh, [{ id: "man-1", until: 5000 }], 1000);
const savedMan = fresh.find((spawn) => spawn.id === "man-1");
assert(savedMan.downUntil === 5000, "A saved respawn timer is restored");
assert(fresh.find((spawn) => spawn.id === "man-2").downUntil === 0, "Other spawns stay up");

const rng = createRng(3);
const wanderer = createSpawns().find((spawn) => spawn.id === "goblin-2");
for (let step = 0; step < 40; step += 1) stepWander(wanderer, 0.5, rng, step * 500);
const wandered = Math.hypot(wanderer.x - wanderer.homeX, wanderer.z - wanderer.homeZ);
assert(wandered <= wanderer.leash + 0.001, `Wander stays inside the zone (dist ${wandered.toFixed(2)})`);

let regen = stepRegen(6, 10, 3, 0);
assert(regen.hp === 7 && regen.acc === 0, "One regen interval restores 1 hitpoint");
regen = stepRegen(6, 10, 1, 0);
assert(regen.hp === 6 && Math.abs(regen.acc - 1) < 1e-9, "A partial second is banked");
regen = stepRegen(10, 10, 9, 0);
assert(regen.hp === 10 && regen.acc === 0, "Regen stops at full health");

const lived = resolveReturn({ victory: true, x: 14, z: 16, hp: 4, maxHp: 10 });
assert(lived.respawn === false && lived.x === 14 && lived.hp === 4, "A win keeps the spot and the remaining health");
const died = resolveReturn({ victory: false, x: 50, z: 12, hp: 0, maxHp: 10 });
assert(died.respawn === true && died.x === START.x && died.z === START.z && died.hp === 10, "A loss returns to the campfire at full health");

const loaded = readWorldSave({ x: 99, z: 3, hp: 4, down: [{ id: "guard-1", until: 9 }, { id: 3 }] });
assert(loaded.x === BOUNDS.maxX - 0.8 && loaded.z === 3 && loaded.hp === 4, "A saved position is clamped and health is kept");
assert(loaded.down.length === 1 && loaded.down[0].id === "guard-1", "Only well-formed respawn records load");
const blank = readWorldSave({});
assert(blank.x === START.x && blank.z === START.z && blank.hp == null, "A legacy save starts at the campfire");

console.log("");
if (failures.length) {
  console.error(`${failures.length} overworld assertion(s) failed.`);
  process.exit(1);
}
console.log("All overworld assertions passed.");
