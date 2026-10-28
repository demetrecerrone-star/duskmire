/**
 * Loot, equipment, inventory, and a gear upgrade report.
 * The 472 combat checks stay in simulate.js. This file only adds coverage.
 */
import { createRng, hashSeed } from "../js/rng.js";
import { attackRoll, defenceRoll, exchange, maxHit } from "../js/combat.js";
import { getEnemy } from "../js/enemies.js";
import { makeEnemyFighter, makePlayerFighter, makeSimPlayer } from "../js/entities.js";
import { WEAPONS, getStyle, getWeapon } from "../js/weapons.js";
import { xpForLevel } from "../js/skills.js";
import {
  DROP_TABLES,
  INVENTORY_SIZE,
  addItem,
  applyHeal,
  armourBonuses,
  bonusTotals,
  eatAt,
  emptyInventory,
  meetsRequirements,
  migrateSave,
  placeLoot,
  rollDrop,
  starterState,
  takePile,
  tryEquip,
  tryUnequip,
  getItem,
} from "../js/items.js";

const failures = [];
function assert(cond, message) {
  if (!cond) failures.push(message);
  console.log(`${cond ? "PASS" : "FAIL"}  ${message}`);
}

const level1 = { attack: 1, strength: 1, defence: 1, hitpoints: 10, magic: 1, ranged: 1 };
const level5 = { attack: 5, strength: 5, defence: 5, hitpoints: 10, magic: 5, ranged: 5 };
const mid = { attack: 10, strength: 10, defence: 10, hitpoints: 15, magic: 1, ranged: 1 };

assert(getItem("bronze-sword").bonuses.attack === WEAPONS.sword.bonuses.attack, "Bronze sword item matches the sword attack bonus");
assert(getItem("bronze-sword").bonuses.strength === WEAPONS.sword.bonuses.strength, "Bronze sword item matches the sword strength bonus");
assert(getItem("bronze-staff").weaponId === "staff", "Ash staff still uses the staff combat entry");
assert(getItem("bronze-bow").weaponId === "bow", "Shortbow still uses the bow combat entry");
assert(!WEAPONS.dagger.styles.some((style) => style.id === "mixed"), "Dagger has no Mixed style");
assert(WEAPONS["iron-sword"].styles.some((style) => style.id === "mixed" && style.xpBoost === 0.12), "Iron sword keeps Mixed at +12%");

assert(!meetsRequirements(getItem("iron-sword"), level1), "Attack 1 cannot equip an iron sword");
assert(meetsRequirements(getItem("iron-sword"), level5), "Attack 5 can equip an iron sword");
assert(!meetsRequirements(getItem("iron-body"), level1), "Defence 1 cannot equip an iron platebody");
assert(meetsRequirements(getItem("iron-helm"), { ...level1, defence: 5 }), "Defence 5 can equip an iron helm");
assert(meetsRequirements(getItem("bronze-sword"), level1), "The bronze sword fits a new adventurer");

const naked = bonusTotals({ ...starterState().equipment });
assert(naked.attack === 18 && naked.strength === 16 && naked.defence === 0, "Starter bonuses are the bronze sword alone");
const withShield = bonusTotals({ ...starterState().equipment, shield: "bronze-shield" });
assert(withShield.defence === 6 && withShield.attack === 18, "A bronze shield adds defence and leaves the sword bonus");
const ironSet = {
  weapon: "iron-sword",
  head: "iron-helm",
  body: "iron-body",
  legs: "iron-legs",
  shield: "iron-shield",
  gloves: "iron-gloves",
  boots: "iron-boots",
};
const ironTotals = bonusTotals(ironSet);
assert(ironTotals.attack === 30 && ironTotals.strength === 26, "Iron sword bonuses are the weapon entry");
assert(ironTotals.defence === 5 + 12 + 8 + 9 + 2 + 2, "Full iron armour defence is the sum of the six pieces");
const bronzeSet = {
  weapon: "bronze-sword",
  head: "bronze-helm",
  body: "bronze-body",
  legs: "bronze-legs",
  shield: "bronze-shield",
  gloves: "bronze-gloves",
  boots: "bronze-boots",
};
assert(bonusTotals(bronzeSet).defence === 3 + 8 + 5 + 6 + 1 + 1, "Full bronze armour defence is the sum of the six pieces");

const bare = makePlayerFighter({ skills: level1, hp: 10, maxHp: 10 }, getWeapon("sword"), getStyle(getWeapon("sword"), "accurate"));
assert(bare.bonuses.attack === 18 && bare.bonuses.defence === 0, "A fighter without gear keeps the weapon bonuses only");
const dressed = makeSimPlayer(mid, getWeapon("sword"), getStyle(getWeapon("sword"), "accurate"), armourBonuses(bronzeSet));
const ironDressed = makeSimPlayer(mid, getWeapon("iron-sword"), getStyle(getWeapon("iron-sword"), "accurate"), armourBonuses(ironSet));
const guard = makeEnemyFighter(getEnemy("guard"));
assert(attackRoll(ironDressed) > attackRoll(dressed), "Iron sword attack roll beats bronze at the same level");
assert(defenceRoll(ironDressed) > defenceRoll(dressed) && defenceRoll(dressed) > defenceRoll(bare), "Iron armour defends harder than bronze, which defends harder than none");
assert(maxHit(ironDressed) >= maxHit(dressed), "Iron sword max hit is at least the bronze sword");

const healed = applyHeal(6, 10, 4);
assert(healed.hp === 10 && healed.healed === 4, "Bread heals 4 and stops at full hitpoints");
assert(applyHeal(10, 10, 8).healed === 0, "Food does not heal past the maximum");
const bag = emptyInventory();
bag[0] = { itemId: "bread", qty: 1 };
const eaten = eatAt(bag, 0, 3, 10);
assert(eaten.ok && eaten.hp === 7 && eaten.inventory[0] == null, "Eating bread removes it and heals");

let pack = emptyInventory();
for (let i = 0; i < INVENTORY_SIZE; i += 1) {
  const added = addItem(pack, "bones");
  assert(added.ok, `Bones fit in slot ${i + 1}`);
  pack = added.slots;
}
const overflow = addItem(pack, "bones");
assert(!overflow.ok && overflow.reason === "full", "The 29th item does not fit");
const coinsFirst = addItem(emptyInventory(), "coins", 5);
const coinsMore = addItem(coinsFirst.slots, "coins", 7);
assert(coinsMore.ok && coinsMore.slots.filter(Boolean).length === 1 && coinsMore.slots[0].qty === 12, "Coins stack in one slot");
const stuffed = addItem(pack, "coins", 3);
assert(stuffed.reason === "full", "Coins need a free slot when none are stacked yet");

const kit = starterState();
const equipped = tryEquip(kit.inventory, kit.equipment, 0, level1);
assert(equipped.ok && equipped.equipment.weapon === "bronze-staff", "Equipping the staff from the pack wields it");
assert(equipped.inventory.some((slot) => slot?.itemId === "bronze-sword"), "The bronze sword returns to the pack");
const blocked = tryEquip([{ itemId: "iron-sword", qty: 1 }], kit.equipment, 0, level1);
assert(!blocked.ok && blocked.reason === "level" && blocked.hint.includes("attack 5"), "Iron sword requirement names Attack 5");
const allowed = tryEquip([{ itemId: "iron-helm", qty: 1 }], kit.equipment, 0, level5);
assert(allowed.ok && allowed.equipment.head === "iron-helm", "Defence 5 equips an iron helm");
const back = tryUnequip(allowed.inventory, allowed.equipment, "head", level5);
assert(back.ok && back.equipment.head == null && back.inventory.some((slot) => slot?.itemId === "iron-helm"), "Unequipping the helm returns it to the pack");
const lastWeapon = tryUnequip(emptyInventory(), kit.equipment, "weapon", level1);
assert(!lastWeapon.ok && lastWeapon.reason === "last-weapon", "The last weapon stays in hand");

const legacy = migrateSave({
  version: 1,
  xp: { attack: 0, strength: 0, defence: 0, hitpoints: xpForLevel(10), magic: 0, ranged: 0 },
  defeated: ["goblin"],
  weaponId: "staff",
});
assert(legacy.defeated[0] === "goblin", "Migration keeps defeated foes");
assert(legacy.equipment.weapon === "bronze-staff" && legacy.weaponId === "staff", "A legacy staff stays equipped");
assert(legacy.inventory.some((slot) => slot?.itemId === "bronze-sword"), "Migration gives the bronze sword");
assert(legacy.inventory.some((slot) => slot?.itemId === "bronze-bow"), "Migration gives the shortbow");
assert(Array.isArray(legacy.loot) && legacy.loot.length === 0, "A legacy save has no ground loot yet");
const kept = migrateSave({
  ...legacy,
  inventory: [{ itemId: "trout", qty: 1 }],
  loot: [
    { id: "pile-1", itemId: "bones", x: 4, z: 14, qty: 1 },
    { id: "bad", itemId: "nope", x: 1, z: 1, qty: 1 },
    { id: "nan", itemId: "coins", x: NaN, z: 2, qty: 3 },
  ],
});
assert(kept.inventory[0].itemId === "trout", "An existing pack is not replaced");
assert(kept.loot.length === 1 && kept.loot[0].id === "pile-1", "Only well-formed piles survive migration");

const seedRng = createRng(hashSeed("drops"));
const once = rollDrop("goblin", seedRng);
const again = rollDrop("goblin", createRng(hashSeed("drops")));
assert(JSON.stringify(once) === JSON.stringify(again), "The same seed rolls the same goblin drop");

function sample(enemyId, trials, salt) {
  const table = DROP_TABLES[enemyId];
  const rng = createRng(hashSeed(`drop:${enemyId}:${salt}`));
  let rares = 0;
  const commonCounts = {};
  const rareCounts = {};
  for (let i = 0; i < trials; i += 1) {
    const drops = rollDrop(enemyId, rng);
    const first = drops[0];
    commonCounts[first.itemId] = (commonCounts[first.itemId] || 0) + 1;
    if (drops.length > 1) {
      rares += 1;
      rareCounts[drops[1].itemId] = (rareCounts[drops[1].itemId] || 0) + 1;
    }
  }
  return { rares, commonCounts, rareCounts };
}

const trials = 8000;
for (const enemyId of ["goblin", "man", "guard", "highwayman"]) {
  const table = DROP_TABLES[enemyId];
  const { rares, commonCounts } = sample(enemyId, trials, "rates");
  const rate = rares / trials;
  assert(Math.abs(rate - table.rareChance) < 0.02, `${enemyId} rare rate ${rate.toFixed(3)} is within 0.02 of ${table.rareChance}`);
  const commonWeight = table.common.reduce((sum, entry) => sum + entry.weight, 0);
  for (const entry of table.common) {
    const share = (commonCounts[entry.itemId] || 0) / trials;
    const expected = entry.weight / commonWeight;
    assert(Math.abs(share - expected) < 0.03, `${enemyId} ${entry.itemId} share ${share.toFixed(3)} near ${expected.toFixed(3)}`);
  }
}
const goblinRare = sample("goblin", trials, "rare-items").rareCounts;
assert(Object.keys(goblinRare).some((id) => id.startsWith("bronze-")), "Goblin rare drops include bronze gear");
const guardRare = sample("guard", trials, "rare-items").rareCounts;
assert(guardRare["iron-sword"] > 0 && guardRare["iron-body"] > 0, "Guards can drop iron weapons and armour");
const roadRare = sample("highwayman", trials, "rare-items").rareCounts;
assert(roadRare.dagger > 0 && roadRare.trout > 0, "Highwaymen drop the dagger and trout");

const piles = placeLoot([], [{ itemId: "bones", qty: 1 }, { itemId: "coins", qty: 4 }], 12, 15, 5);
assert(piles.length === 2 && piles[0].id !== piles[1].id, "A kill can leave more than one pile");
const picked = takePile(piles, piles[1].id, emptyInventory());
assert(picked.ok && picked.inventory.some((slot) => slot?.itemId === "coins" && slot.qty === 4), "Picking up coins keeps the quantity");
assert(picked.piles.length === 1, "The picked pile leaves the ground");
const full = takePile(piles, piles[0].id, pack);
assert(!full.ok && full.reason === "full" && full.piles.length === piles.length, "A full pack leaves the pile on the ground");

function fightSample(levels, weaponId, styleId, armour, enemyId, n, salt) {
  const weapon = getWeapon(weaponId);
  const style = getStyle(weapon, styleId);
  const gear = armourBonuses(armour);
  const rng = createRng(hashSeed(salt));
  let wins = 0;
  let taken = 0;
  for (let i = 0; i < n; i += 1) {
    const player = makeSimPlayer(levels, weapon, style, gear);
    const foe = makeEnemyFighter(getEnemy(enemyId));
    let rounds = 0;
    while (player.hp > 0 && foe.hp > 0 && rounds < 80) {
      exchange(player, foe, rng);
      rounds += 1;
    }
    if (foe.hp <= 0 && player.hp > 0) wins += 1;
    taken += levels.hitpoints - Math.max(0, player.hp);
  }
  return { winRate: wins / n, taken: taken / n };
}

const N = 700;
const rows = [
  ["Guard", "accurate", "naked bronze", fightSample(mid, "sword", "accurate", { weapon: "bronze-sword" }, "guard", N, "g-naked")],
  ["Guard", "accurate", "bronze armour", fightSample(mid, "sword", "accurate", bronzeSet, "guard", N, "g-bronze")],
  ["Guard", "accurate", "iron sword", fightSample(mid, "iron-sword", "accurate", { weapon: "iron-sword" }, "guard", N, "g-iron-w")],
  ["Guard", "accurate", "iron sword and armour", fightSample(mid, "iron-sword", "accurate", ironSet, "guard", N, "g-iron")],
  ["Highwayman", "aggressive", "naked bronze", fightSample(mid, "sword", "aggressive", { weapon: "bronze-sword" }, "highwayman", N, "h-naked")],
  ["Highwayman", "aggressive", "bronze armour", fightSample(mid, "sword", "aggressive", bronzeSet, "highwayman", N, "h-bronze")],
  ["Highwayman", "aggressive", "iron sword", fightSample(mid, "iron-sword", "aggressive", { weapon: "iron-sword" }, "highwayman", N, "h-iron-w")],
  ["Highwayman", "aggressive", "iron sword and armour", fightSample(mid, "iron-sword", "aggressive", ironSet, "highwayman", N, "h-iron")],
];
console.log("\nGear at Attack 10, Strength 10, Defence 10, Hitpoints 15");
console.log("Foe          Style        Kit                      Win rate   HP lost");
for (const [foe, style, kitName, result] of rows) {
  console.log(
    `${foe.padEnd(12)} ${style.padEnd(12)} ${kitName.padEnd(24)} ${(result.winRate * 100).toFixed(1).padStart(7)}%   ${result.taken.toFixed(2)}`,
  );
}
const byName = Object.fromEntries(rows.map((row) => [`${row[0]}:${row[2]}`, row[3]]));
assert(byName["Guard:bronze armour"].taken + 0.35 < byName["Guard:naked bronze"].taken, "Bronze armour reduces damage taken from the guard");
assert(byName["Guard:iron sword and armour"].taken + 0.35 < byName["Guard:bronze armour"].taken, "Iron armour reduces guard damage below bronze armour");
assert(byName["Highwayman:iron sword and armour"].taken + 0.25 < byName["Highwayman:naked bronze"].taken, "Iron gear reduces damage taken from the highwayman");
assert(byName["Guard:iron sword"].winRate + 0.01 >= byName["Guard:naked bronze"].winRate, "An iron sword does not lose the guard fight more often than bronze");
assert(byName["Highwayman:iron sword"].winRate + 0.02 >= byName["Highwayman:naked bronze"].winRate, "An iron sword does not lose the highwayman fight more often than bronze");

const eatEvents = exchange(
  makeSimPlayer(level1, getWeapon("sword"), getStyle(getWeapon("sword"), "accurate")),
  makeEnemyFighter(getEnemy("goblin")),
  createRng(1),
  { skipPlayer: true },
);
assert(eatEvents.every((event) => event.actor === "enemy"), "Eating spends the turn: only the foe swings");

if (failures.length) {
  console.error(`\n${failures.length} item assertion(s) failed.`);
  process.exit(1);
}
console.log("\nAll item assertions passed.");
