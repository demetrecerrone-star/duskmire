/**
 * Browser progress. The simulation never imports this module.
 */
import { SKILLS, xpForLevel } from "./skills.js";
import { createPlayer, createPlayerFromXp } from "./entities.js";
import { migrateSave, starterState } from "./items.js";

const KEY = "duskmire-save-v1";

export function freshSave() {
  const player = createPlayer();
  const kit = starterState();
  return {
    version: 1,
    xp: player.xp,
    defeated: [],
    weaponId: "sword",
    inventory: kit.inventory,
    equipment: kit.equipment,
    loot: [],
  };
}

function valid(data) {
  if (!data || data.version !== 1 || !data.xp) return false;
  for (const skill of SKILLS) {
    if (typeof data.xp[skill] !== "number" || !Number.isFinite(data.xp[skill]) || data.xp[skill] < 0) {
      return false;
    }
  }
  if (!Array.isArray(data.defeated)) return false;
  return true;
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return freshSave();
    const data = JSON.parse(raw);
    if (!valid(data)) return freshSave();
    if (data.xp.hitpoints < xpForLevel(10)) data.xp.hitpoints = xpForLevel(10);
    return migrateSave(data);
  } catch {
    return freshSave();
  }
}

export function writeSave(save) {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    /* private mode or a full disk — the fight still resolves in memory */
  }
}

export function playerFromSave(save) {
  return createPlayerFromXp(save.xp);
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
