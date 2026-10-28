/**
 * Wires the marsh road, the clearing, and the shared combat modules.
 */
import { applyPalette } from "./palette.js";
import { createRng, hashSeed } from "./rng.js";
import { addGains, describeSwing, exchange, previewStrike, xpForHit, xpForVictory } from "./combat.js";
import { getEnemy, isUnlocked, nextEnemyId } from "./enemies.js";
import { grantXp, makeEnemyFighter, makePlayerFighter, rest } from "./entities.js";
import { clearSave, loadSave, playerFromSave, writeSave } from "./save.js";
import { loadGraphics, saveGraphics } from "./graphics.js";
import { getStyle, getWeapon } from "./weapons.js";
import { mountScene } from "./scene.js";
import { formatPreview, mountUi } from "./ui.js";
import {
  START,
  ZONES,
  applyDown,
  createSpawns,
  readWorldSave,
  stepRegen,
} from "./nav.js";
import { mountOverworld } from "./overworld.js";
import {
  armourBonuses,
  bonusTotals,
  eatAt,
  gearView,
  migrateSave,
  placeLoot,
  removeAt,
  rollDrop,
  starterState,
  takePile,
  tryEquip,
  tryUnequip,
  weaponIdFromEquipment,
  getItem,
} from "./items.js";

applyPalette();

const params = new URLSearchParams(location.search);
const seedParam = params.get("seed");
const seedNumber = seedParam != null && seedParam !== "" ? Number(seedParam) : NaN;
const rng = createRng(Number.isFinite(seedNumber) ? seedNumber >>> 0 : undefined);
const lootRng = createRng(
  Number.isFinite(seedNumber) ? hashSeed(`loot:${seedNumber >>> 0}`) : hashSeed(`loot:${rng.next()}`),
);

const save = migrateSave(loadSave());
const placed = readWorldSave(save);
const kit = starterState();
const state = {
  save,
  player: playerFromSave(save),
  inventory: save.inventory || kit.inventory,
  equipment: save.equipment || kit.equipment,
  selectedIndex: null,
  weaponId: weaponIdFromEquipment(save.equipment),
  styleId: "accurate",
  enemyId: "goblin",
  spawnId: null,
  screen: "world",
  busy: false,
  fight: null,
  graphics: loadGraphics(),
  compare: false,
  worldReady: false,
  regenAcc: 0,
  saveTick: 0,
};

if (placed.hp == null || placed.hp < 1) state.player.hp = state.player.maxHp;
else state.player.hp = Math.min(state.player.maxHp, placed.hp);

let scene = null;
let world = null;

const ui = mountUi({
  onWeapon: (id) => {
    if (state.busy) return;
    state.weaponId = id;
    ensureStyle();
    state.save.weaponId = id;
    scene?.setWeapon(id);
    world?.setWeapon(id);
    persist();
    refresh();
  },
  onStyle: (id) => {
    if (state.busy) return;
    state.styleId = id;
    refresh();
  },
  onSelectItem: (index) => {
    if (state.busy) return;
    state.selectedIndex = index;
    refresh();
  },
  onEquip: (index) => {
    if (state.busy) return;
    const result = tryEquip(state.inventory, state.equipment, index, state.player.skills);
    if (!applyKit(result)) return;
    state.selectedIndex = null;
    refresh();
  },
  onUnequip: (slot) => {
    if (state.busy) return;
    const result = tryUnequip(state.inventory, state.equipment, slot, state.player.skills);
    if (!applyKit(result)) return;
    refresh();
  },
  onEat: (index) => {
    if (state.busy) return;
    if (state.screen === "fight" && state.fight && !state.fight.over) {
      eatInFight(index);
      return;
    }
    const eaten = eatAt(state.inventory, index, state.player.hp, state.player.maxHp);
    if (!eaten.ok) return;
    state.inventory = eaten.inventory;
    state.player.hp = eaten.hp;
    state.selectedIndex = null;
    ui.showHint(
      eaten.healed
        ? `The ${eaten.item.name.toLowerCase()} restores ${eaten.healed} hitpoints.`
        : `You eat the ${eaten.item.name.toLowerCase()}. Nothing more to heal.`,
    );
    persist();
    refresh();
  },
  onDrop: (index) => {
    if (state.busy) return;
    const removed = removeAt(state.inventory, index);
    if (!removed.ok) return;
    state.inventory = removed.slots;
    state.selectedIndex = null;
    if (world) {
      const pos = world.getPosition();
      world.setLoot(placeLoot(world.getLoot(), [{ itemId: removed.itemId, qty: removed.qty }], pos.x, pos.z + 0.4, Date.now()));
    }
    persist();
    refresh();
  },
  onEnemy: (id) => {
    const enemy = getEnemy(id);
    if (!isUnlocked(enemy, state.save.defeated)) return;
    state.enemyId = id;
    scene?.setEnemy(id);
    refresh();
  },
  onZone: (id) => {
    state.enemyId = id;
    world?.walkToZone(id);
    refresh();
  },
  onFight: () => startFight(),
  onAttack: () => attack(),
  onLeave: () => leaveFight(),
  onAgain: () => startFight(),
  onNext: () => {
    const next = nextEnemyId(state.enemyId);
    if (!next) return leaveFight();
    state.enemyId = next;
    if (state.worldReady) {
      leaveFight();
      world.walkToZone(next);
      return;
    }
    scene?.setEnemy(next);
    leaveFight();
  },
  onGraphics: (id) => {
    state.graphics = saveGraphics(id);
    scene?.setQuality(state.graphics);
    world?.setQuality(state.graphics);
    ui.setGraphics(state.graphics, state.compare);
  },
  onCompare: () => {
    state.compare = !state.compare;
    scene?.setCompare(state.compare);
    world?.setCompare(state.compare);
    ui.setGraphics(state.graphics, state.compare);
  },
  onReset: () => {
    clearSave();
    const fresh = loadSave();
    state.save = fresh;
    state.player = playerFromSave(fresh);
    state.weaponId = "sword";
    state.styleId = "accurate";
    state.enemyId = "goblin";
    state.spawnId = null;
    state.selectedIndex = null;
    state.fight = null;
    state.busy = false;
    state.regenAcc = 0;
    const freshKit = starterState();
    state.inventory = freshKit.inventory;
    state.equipment = freshKit.equipment;
    state.screen = state.worldReady ? "world" : "select";
    for (const spawn of world?.getSpawns() || []) {
      spawn.downUntil = 0;
      spawn.x = spawn.homeX;
      spawn.z = spawn.homeZ;
      spawn.goal = null;
    }
    world?.setPosition(START.x, START.z);
    world?.setGear(gearView(state.equipment));
    world?.setLoot([]);
    if (state.worldReady) {
      scene?.setPaused(true);
      world?.setActive(true);
    } else {
      scene?.setEnemy("goblin");
      scene?.setGear(gearView(state.equipment));
    }
    ui.hideResult();
    ui.showHint("");
    ui.showNameplate(null);
    refresh();
  },
});

function ensureStyle() {
  const weapon = getWeapon(state.weaponId);
  if (!weapon.styles.some((style) => style.id === state.styleId)) {
    state.styleId = weapon.styles[0].id;
  }
}

function applyKit(result) {
  if (!result?.ok) {
    if (result?.hint) ui.showHint(result.hint);
    return false;
  }
  state.inventory = result.inventory;
  state.equipment = result.equipment;
  state.weaponId = result.weaponId || weaponIdFromEquipment(result.equipment);
  ensureStyle();
  syncGear();
  persist();
  return true;
}

function syncGear() {
  const view = gearView(state.equipment);
  scene?.setGear?.(view);
  world?.setGear?.(view);
  if (state.fight && !state.fight.over) syncFighter();
}

function currentLoadout() {
  const weapon = getWeapon(state.weaponId);
  const style = getStyle(weapon, state.styleId);
  return { weapon, style };
}

function previewText() {
  const { weapon, style } = currentLoadout();
  const strike = previewStrike(
    makePlayerFighter(state.player, weapon, style, armourBonuses(state.equipment)),
    makeEnemyFighter(getEnemy(state.enemyId)),
  );
  return formatPreview(weapon, style, strike);
}

function zoneModel() {
  const here = world?.nearestZone()?.id;
  const now = Date.now();
  return ZONES.map((zone) => {
    const enemy = getEnemy(zone.enemyId);
    const alive = (world?.getSpawns() || []).filter(
      (spawn) => spawn.enemyId === zone.enemyId && !(spawn.downUntil && now < spawn.downUntil),
    ).length;
    return {
      enemyId: zone.enemyId,
      name: zone.name,
      foe: enemy.name,
      combatLevel: enemy.combatLevel,
      unlockAfter: enemy.unlockAfter ? getEnemy(enemy.unlockAfter).name.toLowerCase() : "",
      unlocked: isUnlocked(enemy, state.save.defeated),
      alive,
      here: here === zone.id,
    };
  });
}

function plates() {
  const enemy = getEnemy(state.enemyId);
  if (state.screen === "fight" && state.fight) {
    return {
      player: {
        name: "You",
        hp: state.fight.player.hp,
        max: state.fight.player.maxHp,
        detail: `${state.fight.player.hp} / ${state.fight.player.maxHp}`,
      },
      enemy: {
        name: enemy.name,
        hp: state.fight.enemy.hp,
        max: state.fight.enemy.maxHp,
        detail: `CL ${enemy.combatLevel}`,
      },
    };
  }
  if (state.screen === "world" && world) {
    const zone = world.nearestZone();
    const foe = getEnemy(zone.enemyId);
    const open = isUnlocked(foe, state.save.defeated);
    const hp = Math.max(0, Math.floor(state.player.hp));
    return {
      player: {
        name: "You",
        hp: state.player.hp,
        max: state.player.maxHp,
        detail: `${hp} / ${state.player.maxHp}`,
      },
      enemy: {
        name: zone.name,
        hp: open ? 1 : 0,
        max: 1,
        detail: open ? `${foe.name} · CL ${foe.combatLevel}` : "Locked",
      },
    };
  }
  return {
    player: {
      name: "You",
      hp: state.player.maxHp,
      max: state.player.maxHp,
      detail: `${state.player.maxHp} / ${state.player.maxHp}`,
    },
    enemy: {
      name: enemy.name,
      hp: enemy.levels.hitpoints,
      max: enemy.levels.hitpoints,
      detail: `CL ${enemy.combatLevel}`,
    },
  };
}

function stampWorld() {
  state.save.weaponId = state.weaponId;
  state.save.xp = { ...state.player.xp };
  state.save.inventory = state.inventory;
  state.save.equipment = state.equipment;
  if (!state.worldReady || !world) return;
  const pos = world.getPosition();
  state.save.x = Math.round(pos.x * 100) / 100;
  state.save.z = Math.round(pos.z * 100) / 100;
  state.save.hp = state.player.hp;
  state.save.loot = world.getLoot();
  const now = Date.now();
  state.save.down = world
    .getSpawns()
    .filter((spawn) => spawn.downUntil && spawn.downUntil > now)
    .map((spawn) => ({ id: spawn.id, until: spawn.downUntil }));
}

function persist() {
  state.save.inventory = state.inventory;
  state.save.equipment = state.equipment;
  state.save.weaponId = state.weaponId;
  if (state.screen !== "fight") stampWorld();
  else state.save.xp = { ...state.player.xp };
  writeSave(state.save);
}

function refresh() {
  ensureStyle();
  ui.renderSkills(state.player);
  ui.setScreen(state.screen);
  const model = {
    weaponId: state.weaponId,
    styleId: state.styleId,
    enemyId: state.enemyId,
    defeated: state.save.defeated,
    preview: previewText(),
    busy: state.busy,
    over: Boolean(state.fight?.over),
    enemyName: getEnemy(state.enemyId).name,
    zones: state.screen === "world" ? zoneModel() : [],
    inventory: state.inventory,
    equipment: state.equipment,
    bonuses: bonusTotals(state.equipment),
    skills: state.player.skills,
    selectedIndex: state.selectedIndex,
    screen: state.screen,
  };
  ui.renderPack(model);
  if (state.screen === "world") ui.renderWorld(model);
  else if (state.screen === "select") ui.renderSelect(model);
  else ui.renderFightChrome(model);
  const shown = plates();
  ui.setPlates(shown.player, shown.enemy);
}

function openClearing() {
  scene?.setEnemy(state.enemyId);
  scene?.setGear(gearView(state.equipment));
  scene?.setPaused(false);
  scene?.setQuality(state.graphics);
  scene?.setCompare(state.compare);
  world?.setActive(false);
}

function startFight(options = {}) {
  const enemy = getEnemy(state.enemyId);
  if (!isUnlocked(enemy, state.save.defeated)) return;
  const fromRoad = Boolean(options.fromRoad) && state.worldReady;
  if (!fromRoad) rest(state.player);
  const { weapon, style } = currentLoadout();
  state.fight = {
    player: makePlayerFighter(state.player, weapon, style, armourBonuses(state.equipment)),
    enemy: makeEnemyFighter(enemy),
    xp: {},
    over: false,
  };
  state.screen = "fight";
  state.busy = false;
  openClearing();
  ui.hideResult();
  ui.showNameplate(null);
  ui.clearLog();
  ui.appendLog(`${enemy.name} steps into the clearing. Combat level ${enemy.combatLevel}.`, "info");
  refresh();
}

function leaveFight() {
  if (!state.worldReady) {
    state.fight = null;
    state.screen = "select";
    state.busy = false;
    rest(state.player);
    ui.hideResult();
    refresh();
    return;
  }
  if (state.fight && !state.fight.over) {
    state.player.hp = Math.max(1, state.fight.player.hp);
  }
  state.fight = null;
  state.busy = false;
  state.screen = "world";
  ui.hideResult();
  ui.showNameplate(null);
  scene?.setPaused(true);
  world?.setActive(true);
  stampWorld();
  writeSave(state.save);
  refresh();
}

function syncFighter() {
  const { weapon, style } = currentLoadout();
  const hp = state.fight.player.hp;
  const maxHp = state.fight.player.maxHp;
  state.fight.player = makePlayerFighter(state.player, weapon, style, armourBonuses(state.equipment));
  state.fight.player.hp = hp;
  state.fight.player.maxHp = maxHp;
  return style;
}

async function eatInFight(index) {
  if (state.busy || state.screen !== "fight" || !state.fight || state.fight.over) return;
  const eaten = eatAt(state.inventory, index, state.fight.player.hp, state.fight.player.maxHp);
  if (!eaten.ok) return;
  state.busy = true;
  state.inventory = eaten.inventory;
  state.selectedIndex = null;
  state.fight.player.hp = eaten.hp;
  state.player.hp = Math.min(state.player.maxHp, eaten.hp);
  ui.appendLog(
    eaten.healed
      ? `You eat the ${eaten.item.name.toLowerCase()} and heal ${eaten.healed}.`
      : `You eat the ${eaten.item.name.toLowerCase()}.`,
    "info",
  );
  refresh();
  const events = exchange(state.fight.player, state.fight.enemy, rng, { skipPlayer: true });
  const enemyName = state.fight.enemy.name;
  for (const event of events) {
    await scene?.playAttack("enemy");
    const kind = event.miss ? "miss" : "hurt";
    if (!event.miss && event.damage > 0) scene?.react("player", "hit");
    scene?.splat("player", event.miss ? "Miss" : String(event.damage), kind);
    ui.appendLog(describeSwing(enemyName, event), kind);
    const shown = plates();
    ui.setPlates(shown.player, shown.enemy);
  }
  if (state.fight.enemy.hp <= 0 || state.fight.player.hp <= 0) finishFight();
  state.busy = false;
  refresh();
}

async function attack() {
  if (state.busy || state.screen !== "fight" || !state.fight || state.fight.over) return;
  state.busy = true;
  refresh();
  const style = syncFighter();
  const events = exchange(state.fight.player, state.fight.enemy, rng);
  const enemyName = state.fight.enemy.name;
  for (const event of events) {
    const playerSwing = event.actor === "player";
    if (playerSwing && event.damage > 0) {
      addGains(state.fight.xp, xpForHit(style, event.damage));
    }
    await scene?.playAttack(playerSwing ? "player" : "enemy");
    const target = playerSwing ? "enemy" : "player";
    const kind = event.miss ? "miss" : playerSwing ? "hit" : "hurt";
    if (!event.miss && event.damage > 0) scene?.react(target, "hit");
    scene?.splat(target, event.miss ? "Miss" : String(event.damage), kind);
    const actorName = playerSwing ? `You (${style.name})` : enemyName;
    ui.appendLog(describeSwing(actorName, event), kind);
    const shown = plates();
    ui.setPlates(shown.player, shown.enemy);
  }
  if (state.fight.enemy.hp <= 0 || state.fight.player.hp <= 0) finishFight();
  state.busy = false;
  refresh();
}

function finishFight() {
  const enemy = getEnemy(state.enemyId);
  const { weapon, style } = currentLoadout();
  const victory = state.fight.enemy.hp <= 0 && state.fight.player.hp > 0;
  state.fight.over = true;
  let levelUps = [];
  if (victory) {
    addGains(state.fight.xp, xpForVictory(style, enemy));
    const beforeMax = state.player.maxHp;
    const remain = state.fight.player.hp;
    levelUps = grantXp(state.player, state.fight.xp);
    const gained = state.player.maxHp - beforeMax;
    state.player.hp = Math.min(state.player.maxHp, Math.max(1, remain + gained));
    if (!state.save.defeated.includes(enemy.id)) state.save.defeated.push(enemy.id);
    if (state.spawnId) world?.defeat(state.spawnId, Date.now());
    if (world) {
      const spawn = world.getSpawns().find((entry) => entry.id === state.spawnId);
      const pos = spawn ? { x: spawn.x, z: spawn.z } : world.getPosition();
      const drops = rollDrop(enemy.id, lootRng);
      world.setLoot(placeLoot(world.getLoot(), drops, pos.x, pos.z, Date.now()));
    }
  } else if (state.worldReady) {
    rest(state.player);
    world?.setPosition(START.x, START.z);
    state.spawnId = null;
  }
  state.save.xp = { ...state.player.xp };
  state.save.weaponId = state.weaponId;
  if (state.save.defeated) state.save.defeated = state.save.defeated.slice();
  stampWorld();
  writeSave(state.save);
  const next = nextEnemyId(enemy.id);
  ui.showResult({
    victory,
    enemy,
    weapon,
    style,
    xp: state.fight.xp,
    levelUps,
    hp: victory ? Math.floor(state.player.hp) : 0,
    nextId: next,
    nextUnlocked: next ? isUnlocked(getEnemy(next), state.save.defeated) : false,
    road: state.worldReady,
  });
}

function onRoadStep(dt) {
  if (state.screen !== "world") return;
  const next = stepRegen(state.player.hp, state.player.maxHp, dt, state.regenAcc);
  state.regenAcc = next.acc;
  if (next.hp !== state.player.hp) {
    state.player.hp = next.hp;
    const shown = plates();
    ui.setPlates(shown.player, shown.enemy);
  }
  state.saveTick += dt;
  if (state.saveTick >= 1.2) {
    state.saveTick = 0;
    stampWorld();
    writeSave(state.save);
  }
}

window.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  if (state.screen !== "fight" || state.fight?.over) return;
  if (event.code === "Space") {
    event.preventDefault();
    attack();
  }
  if (/^Digit[1-9]$/.test(event.code)) {
    const weapon = getWeapon(state.weaponId);
    const index = Number(event.code.slice(-1)) - 1;
    const style = weapon.styles[index];
    if (style) {
      state.styleId = style.id;
      refresh();
    }
  }
});

window.addEventListener("pagehide", () => {
  if (state.screen === "fight") return;
  stampWorld();
  writeSave(state.save);
});

const canvas = document.getElementById("view");
try {
  scene = mountScene(canvas, document.getElementById("splats"), {
    paused: true,
    quality: state.graphics,
  });
  const spawns = createSpawns();
  applyDown(spawns, placed.down, Date.now());
  world = mountOverworld(canvas, scene.renderer, {
    quality: state.graphics,
    weaponId: state.weaponId,
    x: placed.x,
    z: placed.z,
    seed: Number.isFinite(seedNumber) ? seedNumber >>> 0 : 11,
    spawns,
    loot: save.loot || [],
    gear: gearView(state.equipment),
    minimap: document.getElementById("minimap"),
    getDefeated: () => state.save.defeated,
    onEngage: (spawn) => {
      if (state.screen !== "world" || state.busy) return;
      state.spawnId = spawn.id;
      state.enemyId = spawn.enemyId;
      startFight({ fromRoad: true });
    },
    onHint: (text) => ui.showHint(text),
    onHover: (info) => ui.showNameplate(info),
    onPickup: (pile) => {
      if (state.screen !== "world") return;
      const taken = takePile(world.getLoot(), pile.id, state.inventory);
      if (!taken.ok) {
        ui.showHint(taken.reason === "full" ? "Your inventory is full." : "That pile is already gone.");
        return;
      }
      state.inventory = taken.inventory;
      world.setLoot(taken.piles);
      const name = getItem(taken.itemId)?.name || "loot";
      ui.showHint(taken.qty > 1 ? `You pick up ${taken.qty} ${name.toLowerCase()}.` : `You pick up the ${name.toLowerCase()}.`);
      persist();
      refresh();
    },
    onStep: onRoadStep,
  });
  state.worldReady = true;
  state.screen = "world";
} catch (error) {
  state.worldReady = false;
  state.screen = "select";
  ui.setError(error instanceof Error ? error.message : "The marsh road could not be drawn.");
  if (!scene) {
    try {
      scene = mountScene(canvas, document.getElementById("splats"), { quality: state.graphics });
    } catch {
      scene = {
        setEnemy() {},
        setWeapon() {},
        setGear() {},
        setQuality() {},
        setCompare() {},
        setPaused() {},
        splat() {},
        react() {},
        playAttack: () => Promise.resolve(),
        resize() {},
      };
    }
  } else {
    scene.setPaused(false);
  }
}

ui.setGraphics(state.graphics, false);
refresh();
