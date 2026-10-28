/**
 * Items, equipment, inventory, drop tables, and save migration.
 * No DOM. Combat reads the resulting bonuses through the existing formulas.
 */
import { getWeapon } from "./weapons.js";

export const INVENTORY_SIZE = 28;

export const EQUIP_SLOTS = ["head", "body", "legs", "shield", "gloves", "boots", "weapon"];

const BONUS_KEYS = ["attack", "strength", "defence", "magic", "magicStrength", "ranged", "rangedStrength"];

function bonuses(partial) {
  return {
    attack: 0,
    strength: 0,
    defence: 0,
    magic: 0,
    magicStrength: 0,
    ranged: 0,
    rangedStrength: 0,
    ...partial,
  };
}

function gear(partial) {
  return {
    kind: "gear",
    stack: false,
    bonuses: bonuses(partial.bonuses),
    requirements: partial.requirements || {},
    ...partial,
  };
}

export const ITEMS = {
  bones: {
    id: "bones",
    name: "Bones",
    kind: "junk",
    stack: false,
    blurb: "Goblin bones. Nothing to equip.",
  },
  coins: {
    id: "coins",
    name: "Coins",
    kind: "currency",
    stack: true,
    blurb: "A small stack of marsh coins.",
  },
  bread: {
    id: "bread",
    name: "Bread",
    kind: "food",
    stack: false,
    heal: 4,
    blurb: "Heals 4 hitpoints. Eating during a fight spends the turn.",
  },
  "cooked-meat": {
    id: "cooked-meat",
    name: "Cooked meat",
    kind: "food",
    stack: false,
    heal: 6,
    blurb: "Heals 6 hitpoints. Eating during a fight spends the turn.",
  },
  trout: {
    id: "trout",
    name: "Trout",
    kind: "food",
    stack: false,
    heal: 8,
    blurb: "Heals 8 hitpoints. Eating during a fight spends the turn.",
  },
  "bronze-sword": gear({
    id: "bronze-sword",
    name: "Bronze sword",
    slot: "weapon",
    weaponId: "sword",
    tier: "bronze",
    bonuses: { attack: 18, strength: 16 },
    requirements: { attack: 1 },
    blurb: "The sword you started with.",
  }),
  "bronze-staff": gear({
    id: "bronze-staff",
    name: "Ash staff",
    slot: "weapon",
    weaponId: "staff",
    tier: "bronze",
    bonuses: { magic: 18, magicStrength: 16 },
    requirements: { magic: 1 },
    blurb: "Magic accuracy and damage.",
  }),
  "bronze-bow": gear({
    id: "bronze-bow",
    name: "Shortbow",
    slot: "weapon",
    weaponId: "bow",
    tier: "bronze",
    bonuses: { ranged: 18, rangedStrength: 10 },
    requirements: { ranged: 1 },
    blurb: "A short hunting bow.",
  }),
  "bronze-helm": gear({
    id: "bronze-helm",
    name: "Bronze helm",
    slot: "head",
    tier: "bronze",
    bonuses: { defence: 3 },
    requirements: { defence: 1 },
    blurb: "A light bronze cap.",
  }),
  "bronze-body": gear({
    id: "bronze-body",
    name: "Bronze platebody",
    slot: "body",
    tier: "bronze",
    bonuses: { defence: 8 },
    requirements: { defence: 1 },
    blurb: "A bronze plate over the tunic.",
  }),
  "bronze-legs": gear({
    id: "bronze-legs",
    name: "Bronze platelegs",
    slot: "legs",
    tier: "bronze",
    bonuses: { defence: 5 },
    requirements: { defence: 1 },
    blurb: "Bronze plates for the legs.",
  }),
  "bronze-shield": gear({
    id: "bronze-shield",
    name: "Bronze shield",
    slot: "shield",
    tier: "bronze",
    bonuses: { defence: 6 },
    requirements: { defence: 1 },
    blurb: "A round bronze shield.",
  }),
  "bronze-gloves": gear({
    id: "bronze-gloves",
    name: "Bronze gloves",
    slot: "gloves",
    tier: "bronze",
    bonuses: { defence: 1 },
    requirements: { defence: 1 },
    blurb: "Stiff bronze gloves.",
  }),
  "bronze-boots": gear({
    id: "bronze-boots",
    name: "Bronze boots",
    slot: "boots",
    tier: "bronze",
    bonuses: { defence: 1 },
    requirements: { defence: 1 },
    blurb: "Bronze-capped boots.",
  }),
  "iron-sword": gear({
    id: "iron-sword",
    name: "Iron sword",
    slot: "weapon",
    weaponId: "iron-sword",
    tier: "iron",
    bonuses: { attack: 30, strength: 26 },
    requirements: { attack: 5 },
    blurb: "Needs Attack 5. Same styles as the bronze sword, Mixed included.",
  }),
  "iron-staff": gear({
    id: "iron-staff",
    name: "Iron staff",
    slot: "weapon",
    weaponId: "iron-staff",
    tier: "iron",
    bonuses: { magic: 30, magicStrength: 26 },
    requirements: { magic: 5 },
    blurb: "Needs Magic 5.",
  }),
  "iron-bow": gear({
    id: "iron-bow",
    name: "Iron shortbow",
    slot: "weapon",
    weaponId: "iron-bow",
    tier: "iron",
    bonuses: { ranged: 30, rangedStrength: 18 },
    requirements: { ranged: 5 },
    blurb: "Needs Ranged 5.",
  }),
  "iron-helm": gear({
    id: "iron-helm",
    name: "Iron helm",
    slot: "head",
    tier: "iron",
    bonuses: { defence: 5 },
    requirements: { defence: 5 },
    blurb: "Needs Defence 5.",
  }),
  "iron-body": gear({
    id: "iron-body",
    name: "Iron platebody",
    slot: "body",
    tier: "iron",
    bonuses: { defence: 12 },
    requirements: { defence: 5 },
    blurb: "Needs Defence 5.",
  }),
  "iron-legs": gear({
    id: "iron-legs",
    name: "Iron platelegs",
    slot: "legs",
    tier: "iron",
    bonuses: { defence: 8 },
    requirements: { defence: 5 },
    blurb: "Needs Defence 5.",
  }),
  "iron-shield": gear({
    id: "iron-shield",
    name: "Iron shield",
    slot: "shield",
    tier: "iron",
    bonuses: { defence: 9 },
    requirements: { defence: 5 },
    blurb: "Needs Defence 5.",
  }),
  "iron-gloves": gear({
    id: "iron-gloves",
    name: "Iron gloves",
    slot: "gloves",
    tier: "iron",
    bonuses: { defence: 2 },
    requirements: { defence: 5 },
    blurb: "Needs Defence 5.",
  }),
  "iron-boots": gear({
    id: "iron-boots",
    name: "Iron boots",
    slot: "boots",
    tier: "iron",
    bonuses: { defence: 2 },
    requirements: { defence: 5 },
    blurb: "Needs Defence 5.",
  }),
  dagger: gear({
    id: "dagger",
    name: "Dagger",
    slot: "weapon",
    weaponId: "dagger",
    tier: "iron",
    bonuses: { attack: 20, strength: 22 },
    requirements: { attack: 1 },
    blurb: "A highwayman's knife. Aggressive sometimes strikes twice.",
  }),
};

const STARTER_WEAPONS = ["bronze-sword", "bronze-staff", "bronze-bow"];

const LEGACY_WEAPON = {
  sword: "bronze-sword",
  staff: "bronze-staff",
  bow: "bronze-bow",
};

/**
 * One common roll every kill, then an independent rare roll.
 * Weights are relative inside the tier. `qty` is an inclusive coin range.
 */
export const DROP_TABLES = {
  goblin: {
    rareChance: 0.12,
    common: [
      { itemId: "bones", weight: 55 },
      { itemId: "coins", weight: 40, qty: [2, 12] },
      { itemId: "bread", weight: 5 },
    ],
    rare: [
      { itemId: "bronze-helm", weight: 16 },
      { itemId: "bronze-gloves", weight: 14 },
      { itemId: "bronze-boots", weight: 14 },
      { itemId: "bronze-legs", weight: 12 },
      { itemId: "bronze-shield", weight: 12 },
      { itemId: "bronze-body", weight: 10 },
      { itemId: "bronze-sword", weight: 8 },
      { itemId: "bronze-staff", weight: 7 },
      { itemId: "bronze-bow", weight: 7 },
    ],
  },
  man: {
    rareChance: 0.08,
    common: [
      { itemId: "coins", weight: 60, qty: [5, 20] },
      { itemId: "bread", weight: 40 },
    ],
    rare: [
      { itemId: "cooked-meat", weight: 70 },
      { itemId: "bronze-shield", weight: 15 },
      { itemId: "bronze-boots", weight: 15 },
    ],
  },
  guard: {
    rareChance: 0.18,
    common: [
      { itemId: "coins", weight: 45, qty: [8, 30] },
      { itemId: "cooked-meat", weight: 30 },
      { itemId: "bread", weight: 25 },
    ],
    rare: [
      { itemId: "iron-helm", weight: 14 },
      { itemId: "iron-legs", weight: 12 },
      { itemId: "iron-shield", weight: 12 },
      { itemId: "trout", weight: 12 },
      { itemId: "iron-sword", weight: 10 },
      { itemId: "iron-body", weight: 10 },
      { itemId: "iron-gloves", weight: 10 },
      { itemId: "iron-boots", weight: 10 },
      { itemId: "cooked-meat", weight: 10 },
    ],
  },
  highwayman: {
    rareChance: 0.22,
    common: [
      { itemId: "coins", weight: 70, qty: [15, 50] },
      { itemId: "cooked-meat", weight: 30 },
    ],
    rare: [
      { itemId: "trout", weight: 40 },
      { itemId: "dagger", weight: 28 },
      { itemId: "iron-boots", weight: 12 },
      { itemId: "iron-gloves", weight: 10 },
      { itemId: "coins", weight: 10, qty: [40, 80] },
    ],
  },
};

export function getItem(id) {
  return ITEMS[id] || null;
}

export function emptyEquipment() {
  return {
    head: null,
    body: null,
    legs: null,
    shield: null,
    gloves: null,
    boots: null,
    weapon: null,
  };
}

export function emptyInventory() {
  return Array.from({ length: INVENTORY_SIZE }, () => null);
}

function slotOf(itemId, qty = 1) {
  const item = getItem(itemId);
  if (!item) return null;
  return { itemId, qty: item.stack ? Math.max(1, Math.floor(qty) || 1) : 1 };
}

export function starterState() {
  const equipment = emptyEquipment();
  equipment.weapon = "bronze-sword";
  const inventory = emptyInventory();
  inventory[0] = slotOf("bronze-staff");
  inventory[1] = slotOf("bronze-bow");
  return { inventory, equipment, loot: [] };
}

export function requirementText(item) {
  const reqs = item?.requirements || {};
  const parts = Object.entries(reqs)
    .filter(([, level]) => level > 1)
    .map(([skill, level]) => `${skill} ${level}`);
  return parts.join(", ");
}

export function meetsRequirements(item, skills) {
  if (!item || item.kind !== "gear") return false;
  const levels = skills || {};
  for (const [skill, level] of Object.entries(item.requirements || {})) {
    if ((levels[skill] || 1) < level) return false;
  }
  return true;
}

export function armourBonuses(equipment) {
  const total = bonuses({});
  for (const slot of EQUIP_SLOTS) {
    if (slot === "weapon") continue;
    const item = getItem(equipment?.[slot]);
    if (!item?.bonuses) continue;
    for (const key of BONUS_KEYS) total[key] += item.bonuses[key] || 0;
  }
  return total;
}

export function bonusTotals(equipment) {
  const total = armourBonuses(equipment);
  const weaponItem = getItem(equipment?.weapon);
  const fromWeapon = weaponItem?.weaponId ? getWeapon(weaponItem.weaponId).bonuses : weaponItem?.bonuses;
  for (const key of BONUS_KEYS) total[key] += fromWeapon?.[key] || 0;
  return total;
}

export function weaponIdFromEquipment(equipment) {
  const item = getItem(equipment?.weapon);
  return item?.weaponId || "sword";
}

function copyInventory(slots) {
  const next = emptyInventory();
  if (!Array.isArray(slots)) return next;
  for (let i = 0; i < INVENTORY_SIZE && i < slots.length; i += 1) {
    const slot = slots[i];
    if (!slot || typeof slot.itemId !== "string") continue;
    const made = slotOf(slot.itemId, slot.qty);
    if (made) next[i] = made;
  }
  return next;
}

export function addItem(inventory, itemId, qty = 1) {
  const item = getItem(itemId);
  const slots = copyInventory(inventory);
  if (!item) return { ok: false, reason: "unknown", slots };
  const amount = Math.max(1, Math.floor(qty) || 1);
  if (item.stack) {
    const existing = slots.find((slot) => slot && slot.itemId === itemId);
    if (existing) {
      existing.qty += amount;
      return { ok: true, slots };
    }
    const index = slots.findIndex((slot) => !slot);
    if (index < 0) return { ok: false, reason: "full", slots: copyInventory(inventory) };
    slots[index] = { itemId, qty: amount };
    return { ok: true, slots };
  }
  let placed = 0;
  for (let n = 0; n < amount; n += 1) {
    const index = slots.findIndex((slot) => !slot);
    if (index < 0) {
      return { ok: false, reason: "full", slots: copyInventory(inventory), placed };
    }
    slots[index] = { itemId, qty: 1 };
    placed += 1;
  }
  return { ok: true, slots };
}

export function removeAt(inventory, index) {
  const slots = copyInventory(inventory);
  const slot = slots[index];
  if (!slot) return { ok: false, reason: "empty", slots };
  slots[index] = null;
  return { ok: true, slots, itemId: slot.itemId, qty: slot.qty };
}

export function tryEquip(inventory, equipment, index, skills) {
  const slots = copyInventory(inventory);
  const worn = { ...emptyEquipment(), ...(equipment || {}) };
  const slot = slots[index];
  if (!slot) return { ok: false, reason: "empty", inventory: slots, equipment: worn };
  const item = getItem(slot.itemId);
  if (!item || item.kind !== "gear") {
    return { ok: false, reason: "not-gear", inventory: slots, equipment: worn };
  }
  if (!meetsRequirements(item, skills)) {
    const need = requirementText(item);
    return {
      ok: false,
      reason: "level",
      hint: need ? `You need ${need} to wear that.` : "You cannot wear that yet.",
      inventory: slots,
      equipment: worn,
    };
  }
  const previous = worn[item.slot];
  worn[item.slot] = item.id;
  slots[index] = previous ? slotOf(previous) : null;
  return { ok: true, inventory: slots, equipment: worn, weaponId: weaponIdFromEquipment(worn) };
}

export function tryUnequip(inventory, equipment, slotName, skills) {
  const worn = { ...emptyEquipment(), ...(equipment || {}) };
  const itemId = worn[slotName];
  if (!itemId || !EQUIP_SLOTS.includes(slotName)) {
    return { ok: false, reason: "empty", inventory: copyInventory(inventory), equipment: worn };
  }
  if (slotName === "weapon") {
    const other = (inventory || []).findIndex((slot) => getItem(slot?.itemId)?.slot === "weapon");
    if (other < 0) {
      return {
        ok: false,
        reason: "last-weapon",
        hint: "Keep a weapon equipped.",
        inventory: copyInventory(inventory),
        equipment: worn,
      };
    }
    return tryEquip(inventory, worn, other, skills);
  }
  const added = addItem(inventory, itemId, 1);
  if (!added.ok) {
    return { ok: false, reason: "full", hint: "Your inventory is full.", inventory: added.slots, equipment: worn };
  }
  worn[slotName] = null;
  return {
    ok: true,
    inventory: added.slots,
    equipment: worn,
    weaponId: weaponIdFromEquipment(worn),
  };
}

export function applyHeal(hp, maxHp, amount) {
  const before = Math.max(0, hp || 0);
  const cap = Math.max(1, maxHp || 1);
  const next = Math.min(cap, before + Math.max(0, amount || 0));
  return { hp: next, healed: next - before };
}

export function eatAt(inventory, index, hp, maxHp) {
  const slots = copyInventory(inventory);
  const slot = slots[index];
  const item = getItem(slot?.itemId);
  if (!item || item.kind !== "food") {
    return { ok: false, reason: "not-food", inventory: slots, hp, healed: 0 };
  }
  const healed = applyHeal(hp, maxHp, item.heal || 0);
  slots[index] = null;
  return { ok: true, inventory: slots, hp: healed.hp, healed: healed.healed, item };
}

function pickWeighted(entries, rng) {
  let total = 0;
  for (const entry of entries) total += entry.weight;
  if (total <= 0) return null;
  let roll = rng.next() * total;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll < 0) return entry;
  }
  return entries[entries.length - 1];
}

function resolveEntry(entry, rng) {
  if (!entry) return null;
  const qty = entry.qty ? rng.int(entry.qty[0], entry.qty[1]) : 1;
  return { itemId: entry.itemId, qty };
}

/** Always one common drop. A second rare drop when the rarity roll lands. */
export function rollDrop(enemyId, rng) {
  const table = DROP_TABLES[enemyId];
  if (!table) return [];
  const drops = [];
  const common = resolveEntry(pickWeighted(table.common, rng), rng);
  if (common) drops.push(common);
  if (rng.next() < table.rareChance) {
    const rare = resolveEntry(pickWeighted(table.rare, rng), rng);
    if (rare) drops.push(rare);
  }
  return drops;
}

export function placeLoot(piles, drops, x, z, now = 0) {
  const next = Array.isArray(piles) ? piles.map((pile) => ({ ...pile })) : [];
  (drops || []).forEach((drop, index) => {
    if (!drop || !getItem(drop.itemId)) return;
    const angle = (index / Math.max(1, drops.length)) * Math.PI * 2;
    next.push({
      id: `pile-${now}-${next.length}-${drop.itemId}`,
      itemId: drop.itemId,
      qty: Math.max(1, Math.floor(drop.qty) || 1),
      x: x + Math.cos(angle) * 0.55,
      z: z + Math.sin(angle) * 0.55,
    });
  });
  return next;
}

export function takePile(piles, id, inventory) {
  const list = Array.isArray(piles) ? piles : [];
  const pile = list.find((entry) => entry && entry.id === id);
  if (!pile) return { ok: false, reason: "missing", piles: list, inventory: copyInventory(inventory) };
  const added = addItem(inventory, pile.itemId, pile.qty || 1);
  if (!added.ok) return { ok: false, reason: added.reason || "full", piles: list, inventory: added.slots };
  return {
    ok: true,
    piles: list.filter((entry) => entry.id !== id),
    inventory: added.slots,
    itemId: pile.itemId,
    qty: pile.qty || 1,
  };
}

function sanitizeEquipment(raw) {
  const worn = emptyEquipment();
  if (!raw || typeof raw !== "object") return worn;
  for (const slot of EQUIP_SLOTS) {
    const item = getItem(raw[slot]);
    if (item && item.kind === "gear" && item.slot === slot) worn[slot] = item.id;
  }
  if (!worn.weapon) worn.weapon = "bronze-sword";
  return worn;
}

function sanitizeLoot(raw) {
  if (!Array.isArray(raw)) return [];
  const piles = [];
  for (const entry of raw) {
    if (!entry || typeof entry.id !== "string" || !getItem(entry.itemId)) continue;
    if (typeof entry.x !== "number" || typeof entry.z !== "number") continue;
    if (!Number.isFinite(entry.x) || !Number.isFinite(entry.z)) continue;
    piles.push({
      id: entry.id,
      itemId: entry.itemId,
      qty: Math.max(1, Math.floor(entry.qty) || 1),
      x: entry.x,
      z: entry.z,
    });
  }
  return piles;
}

function bagBeside(equipment) {
  const inventory = emptyInventory();
  let index = 0;
  for (const id of STARTER_WEAPONS) {
    if (equipment.weapon === id) continue;
    inventory[index] = slotOf(id);
    index += 1;
  }
  return inventory;
}

/**
 * Old saves have xp, defeated, and weaponId only.
 * They keep that progress and receive the bronze sword, staff, and bow.
 */
export function migrateSave(save) {
  const next = {
    ...save,
    xp: { ...(save?.xp || {}) },
    defeated: Array.isArray(save?.defeated) ? save.defeated.slice() : [],
  };
  const hadEquipment = save?.equipment && typeof save.equipment === "object";
  if (!hadEquipment) {
    next.equipment = emptyEquipment();
    next.equipment.weapon = LEGACY_WEAPON[save?.weaponId] || "bronze-sword";
  } else {
    next.equipment = sanitizeEquipment(save.equipment);
  }
  if (!Array.isArray(save?.inventory)) next.inventory = bagBeside(next.equipment);
  else next.inventory = copyInventory(save.inventory);
  next.loot = sanitizeLoot(save?.loot);
  next.weaponId = weaponIdFromEquipment(next.equipment);
  return next;
}

export function gearView(equipment) {
  const worn = sanitizeEquipment(equipment);
  return {
    weaponId: weaponIdFromEquipment(worn),
    head: worn.head,
    body: worn.body,
    legs: worn.legs,
    shield: worn.shield,
    gloves: worn.gloves,
    boots: worn.boots,
  };
}
