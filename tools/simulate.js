/**
 * Duskmire combat simulation and assertions.
 *   node tools/simulate.js
 *   npm test
 *
 * Prints starting combat level, max hits, hit chances, a 10,000-fight
 * goblin sample, then the full weapon × style × enemy matrix.
 * Exits 1 if a tuning assertion fails.
 */
import { ENEMIES, getEnemy } from "../js/enemies.js";
import {
  MIXED_XP_BOOST,
  WEAPONS,
  WEAPON_ORDER,
  getStyle,
} from "../js/weapons.js";
import {
  SKILLS,
  combatBreakdown,
  combatLevel,
  xpForLevel,
} from "../js/skills.js";
import {
  addGains,
  averageHitDamage,
  exchange,
  expectedAttacks,
  previewStrike,
  xpForHit,
  xpForVictory,
  xpFromDamage,
  xpFromVictoryPool,
  xpRateMultiplier,
} from "../js/combat.js";
import {
  MID_LEVELS,
  STARTING_LEVELS,
  makeEnemyFighter,
  makeSimPlayer,
} from "../js/entities.js";
import { createRng, hashSeed } from "../js/rng.js";

const SEED = 20261027;
const GOBLIN_TRIALS = 10000;
const MATRIX_TRIALS = 4000;

const failures = [];

function assert(condition, message) {
  const ok = Boolean(condition);
  console.log(`${ok ? "PASS" : "FAIL"}  ${message}`);
  if (!ok) failures.push(message);
}

function rngFor(label) {
  return createRng(hashSeed(`${SEED}:${label}`));
}

function pad(value, width) {
  return String(value).padStart(width);
}

function pct(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function num(value, digits = 2) {
  if (value == null || Number.isNaN(value)) return "  —";
  return value.toFixed(digits);
}

function xpBrief(xp) {
  const parts = [];
  for (const skill of SKILLS) {
    const amount = xp[skill] || 0;
    if (amount > 0.05) parts.push(`${skill.slice(0, 3)} ${amount.toFixed(1)}`);
  }
  return parts.join(" ") || "none";
}

function simulateFight(levels, weapon, style, enemy, rng, maxRounds = 400) {
  const player = makeSimPlayer(levels, weapon, style);
  const foe = makeEnemyFighter(enemy);
  let swings = 0;
  let accuracyHits = 0;
  let damagingHits = 0;
  let damageDealt = 0;
  let damageTaken = 0;
  let rounds = 0;
  const xp = {};
  while (player.hp > 0 && foe.hp > 0 && rounds < maxRounds) {
    rounds += 1;
    const events = exchange(player, foe, rng);
    for (const event of events) {
      if (event.actor === "player") {
        swings += 1;
        if (event.landed) accuracyHits += 1;
        if (event.damage > 0) {
          damagingHits += 1;
          damageDealt += event.damage;
          addGains(xp, xpForHit(style, event.damage));
        }
      } else {
        damageTaken += event.damage;
      }
    }
  }
  const victory = foe.hp <= 0 && player.hp > 0;
  if (victory) addGains(xp, xpForVictory(style, enemy));
  return {
    victory,
    rounds,
    swings,
    accuracyHits,
    damagingHits,
    damageDealt,
    damageTaken,
    xp,
    playerHp: player.hp,
  };
}

function runSample(label, levels, weapon, style, enemy, trials) {
  const rng = rngFor(label);
  const totals = {
    fights: 0,
    wins: 0,
    swings: 0,
    accuracyHits: 0,
    damagingHits: 0,
    damageDealt: 0,
    damageTaken: 0,
    rounds: 0,
    xp: {},
    winSwings: 0,
    winAccuracyHits: 0,
    winDamagingHits: 0,
    winDamageTaken: 0,
  };
  for (let i = 0; i < trials; i += 1) {
    const fight = simulateFight(levels, weapon, style, enemy, rng);
    totals.fights += 1;
    totals.swings += fight.swings;
    totals.accuracyHits += fight.accuracyHits;
    totals.damagingHits += fight.damagingHits;
    totals.damageDealt += fight.damageDealt;
    totals.damageTaken += fight.damageTaken;
    totals.rounds += fight.rounds;
    addGains(totals.xp, fight.xp);
    if (fight.victory) {
      totals.wins += 1;
      totals.winSwings += fight.swings;
      totals.winAccuracyHits += fight.accuracyHits;
      totals.winDamagingHits += fight.damagingHits;
      totals.winDamageTaken += fight.damageTaken;
    }
  }
  const n = totals.fights;
  const w = totals.wins;
  const meanXp = {};
  for (const skill of SKILLS) meanXp[skill] = (totals.xp[skill] || 0) / n;
  return {
    trials: n,
    winRate: w / n,
    avgSwings: totals.swings / n,
    avgAccuracyHits: totals.accuracyHits / n,
    avgDamagingHits: totals.damagingHits / n,
    avgDamageDealt: totals.damageDealt / n,
    avgDamageTaken: totals.damageTaken / n,
    avgRounds: totals.rounds / n,
    avgXp: meanXp,
    killSwings: w ? totals.winSwings / w : null,
    killAccuracyHits: w ? totals.winAccuracyHits / w : null,
    killDamagingHits: w ? totals.winDamagingHits / w : null,
    killDamageTaken: w ? totals.winDamageTaken / w : null,
  };
}

function pressure(levels, weapon, style, enemy) {
  const player = makeSimPlayer(levels, weapon, style);
  const foe = makeEnemyFighter(enemy);
  const offense = previewStrike(player, foe);
  const defense = previewStrike(foe, player);
  const roundsToKill = foe.maxHp / offense.damagePerRound;
  const roundsToDie = player.maxHp / defense.damagePerRound;
  return {
    playerHit: offense.hitChance,
    playerMax: offense.maxHit,
    playerDps: offense.damagePerRound,
    enemyHit: defense.hitChance,
    enemyMax: defense.maxHit,
    enemyDps: defense.damagePerRound,
    roundsToKill,
    roundsToDie,
    pressure: roundsToKill / roundsToDie,
    attackRoll: offense.attackRoll,
    defenceRoll: offense.defenceRoll,
  };
}

function printHeader(title) {
  console.log(`\n=== ${title} ===`);
}

const starter = { ...STARTING_LEVELS };
const breakdown = combatBreakdown(starter);
const goblin = getEnemy("goblin");

console.log("Duskmire combat simulation");
console.log(`Seed base ${SEED}. Goblin sample ${GOBLIN_TRIALS} fights. Matrix ${MATRIX_TRIALS} fights.`);
console.log(
  `Starting player  Attack ${starter.attack}  Strength ${starter.strength}  Defence ${starter.defence}  Hitpoints ${starter.hitpoints}  Magic ${starter.magic}  Ranged ${starter.ranged}`,
);
console.log(
  `Combat level ${combatLevel(starter)}   base ${breakdown.base.toFixed(3)}  melee ${breakdown.melee.toFixed(3)}  ranged ${breakdown.ranged.toFixed(3)}  magic ${breakdown.magic.toFixed(3)}  style ${breakdown.style}`,
);

printHeader("Enemy roster");
console.log(
  `${"Enemy".padEnd(12)} ${"CL".padStart(3)} ${"HP".padStart(4)} ${"Atk".padStart(4)} ${"Str".padStart(4)} ${"Def".padStart(4)} ${"Bon A/S/D".padEnd(14)} ${"Spd".padStart(3)}  Emphasis`,
);
for (const enemy of ENEMIES) {
  const lv = enemy.levels;
  const b = enemy.bonuses;
  console.log(
    `${enemy.name.padEnd(12)} ${pad(enemy.combatLevel, 3)} ${pad(lv.hitpoints, 4)} ${pad(lv.attack, 4)} ${pad(lv.strength, 4)} ${pad(lv.defence, 4)} ${`+${b.attack}/+${b.strength}/+${b.defence}`.padEnd(14)} ${pad(enemy.attacksPerRound, 3)}  ${enemy.training.emphasis.join(", ")}`,
  );
}

printHeader("Weapons");
for (const id of WEAPON_ORDER) {
  const weapon = WEAPONS[id];
  const b = weapon.bonuses;
  console.log(
    `${weapon.name.padEnd(14)} ${weapon.attackType.padEnd(7)} atkBonus ${b.attack || b.magic || b.ranged}  dmgBonus ${b.strength || b.magicStrength || b.rangedStrength}`,
  );
  for (const style of weapon.styles) {
    const xp = Object.entries(style.xp)
      .map(([skill, rate]) => `${skill} ${(rate * xpRateMultiplier(style)).toFixed(2)}`)
      .join(", ");
    const boost = style.xpBoost ? `  boost ×${xpRateMultiplier(style).toFixed(2)}` : "";
    console.log(`  ${style.name.padEnd(12)} ${style.summary.padEnd(28)} xp/dmg: ${xp}${boost}`);
  }
}

printHeader("Starting player vs Goblin — analytical");
console.log(
  `${"Weapon".padEnd(14)} ${"Style".padEnd(12)} ${"Max".padStart(4)} ${"Hit%".padStart(8)} ${"AtkRoll".padStart(8)} ${"DefRoll".padStart(8)}`,
);
const sword = WEAPONS.sword;
for (const id of WEAPON_ORDER) {
  const weapon = WEAPONS[id];
  for (const style of weapon.styles) {
    const view = pressure(starter, weapon, style, goblin);
    console.log(
      `${weapon.name.padEnd(14)} ${style.name.padEnd(12)} ${pad(view.playerMax, 4)} ${pad(pct(view.playerHit), 8)} ${pad(view.attackRoll, 8)} ${pad(view.defenceRoll, 8)}`,
    );
  }
}

printHeader(`Monte Carlo — Bronze Sword / Accurate vs Goblin (${GOBLIN_TRIALS})`);
const goblinAccurate = runSample(
  "goblin-sword-accurate",
  starter,
  sword,
  getStyle(sword, "accurate"),
  goblin,
  GOBLIN_TRIALS,
);
const goblinAggressive = runSample(
  "goblin-sword-aggressive",
  starter,
  sword,
  getStyle(sword, "aggressive"),
  goblin,
  GOBLIN_TRIALS,
);
const goblinDefensive = runSample(
  "goblin-sword-defensive",
  starter,
  sword,
  getStyle(sword, "defensive"),
  goblin,
  GOBLIN_TRIALS,
);

function printSample(name, sample) {
  console.log(`--- ${name} ---`);
  console.log(`Win rate                 ${pct(sample.winRate)}`);
  console.log(`Average swings           ${num(sample.avgSwings)}`);
  console.log(`Average accuracy hits    ${num(sample.avgAccuracyHits)}   (includes 0-damage hits)`);
  console.log(`Average damaging hits    ${num(sample.avgDamagingHits)}   (all fights)`);
  console.log(`Damaging hits to kill    ${num(sample.killDamagingHits)}   (victories only)`);
  console.log(`Accuracy hits to kill    ${num(sample.killAccuracyHits)}`);
  console.log(`Swings to kill           ${num(sample.killSwings)}`);
  console.log(`Average damage taken     ${num(sample.avgDamageTaken)}`);
  console.log(`Average XP / fight       ${xpBrief(sample.avgXp)}`);
}

printSample("Sword Accurate", goblinAccurate);
printSample("Sword Aggressive", goblinAggressive);
printSample("Sword Defensive", goblinDefensive);

printHeader("Progression pressure — starting player, Bronze Sword / Accurate");
console.log(
  `${"Enemy".padEnd(12)} ${"CL".padStart(3)} ${"Hit%".padStart(8)} ${"Max".padStart(4)} ${"eHit%".padStart(8)} ${"eMax".padStart(5)} ${"pDps".padStart(7)} ${"eDps".padStart(7)} ${"TTK".padStart(7)} ${"TTD".padStart(7)} ${"Press".padStart(7)}`,
);
const pressures = ENEMIES.map((enemy) => {
  const view = pressure(starter, sword, getStyle(sword, "accurate"), enemy);
  console.log(
    `${enemy.name.padEnd(12)} ${pad(enemy.combatLevel, 3)} ${pad(pct(view.playerHit), 8)} ${pad(view.playerMax, 4)} ${pad(pct(view.enemyHit), 8)} ${pad(view.enemyMax, 5)} ${pad(num(view.playerDps), 7)} ${pad(num(view.enemyDps), 7)} ${pad(num(view.roundsToKill), 7)} ${pad(num(view.roundsToDie), 7)} ${pad(num(view.pressure), 7)}`,
  );
  return { enemy, view };
});

printHeader(`Progression fights — starting player, Bronze Sword / Accurate (${MATRIX_TRIALS})`);
console.log(
  `${"Enemy".padEnd(12)} ${"Win%".padStart(8)} ${"Rounds".padStart(8)} ${"Swings".padStart(8)} ${"DmgHits".padStart(8)} ${"KillHits".padStart(8)} ${"DmgIn".padStart(8)}  XP`,
);
const startProg = {};
for (const enemy of ENEMIES) {
  const sample = runSample(
    `start-${enemy.id}-sword-accurate`,
    starter,
    sword,
    getStyle(sword, "accurate"),
    enemy,
    MATRIX_TRIALS,
  );
  startProg[enemy.id] = sample;
  console.log(
    `${enemy.name.padEnd(12)} ${pad(pct(sample.winRate), 8)} ${pad(num(sample.avgRounds), 8)} ${pad(num(sample.avgSwings), 8)} ${pad(num(sample.avgDamagingHits), 8)} ${pad(num(sample.killDamagingHits), 8)} ${pad(num(sample.avgDamageTaken), 8)}  ${xpBrief(sample.avgXp)}`,
  );
}

printHeader(`Mid-level 10/10/10/15 — Bronze Sword / Accurate vs each enemy (${MATRIX_TRIALS})`);
const mid = { ...MID_LEVELS };
console.log(`Mid combat level ${combatLevel(mid)}`);
console.log(
  `${"Enemy".padEnd(12)} ${"Hit%".padStart(8)} ${"Max".padStart(4)} ${"Win%".padStart(8)} ${"KillHits".padStart(8)} ${"DmgIn".padStart(8)}  XP`,
);
const midProg = {};
for (const enemy of ENEMIES) {
  const view = pressure(mid, sword, getStyle(sword, "accurate"), enemy);
  const sample = runSample(
    `mid-${enemy.id}-sword-accurate`,
    mid,
    sword,
    getStyle(sword, "accurate"),
    enemy,
    MATRIX_TRIALS,
  );
  midProg[enemy.id] = { view, sample };
  console.log(
    `${enemy.name.padEnd(12)} ${pad(pct(view.playerHit), 8)} ${pad(view.playerMax, 4)} ${pad(pct(sample.winRate), 8)} ${pad(num(sample.killDamagingHits), 8)} ${pad(num(sample.avgDamageTaken), 8)}  ${xpBrief(sample.avgXp)}`,
  );
}

printHeader("Guard — Defence 1 vs Defence 10 (Attack 10, Strength 10, Hitpoints 15, Sword)");
const guard = getEnemy("guard");
const lowDef = { attack: 10, strength: 10, defence: 1, hitpoints: 15, magic: 1, ranged: 1 };
const highDef = { attack: 10, strength: 10, defence: 10, hitpoints: 15, magic: 1, ranged: 1 };
console.log(
  `${"Setup".padEnd(28)} ${"eHit%".padStart(8)} ${"eMax".padStart(5)} ${"eDps".padStart(7)} ${"Win%".padStart(8)} ${"DmgIn".padStart(8)} ${"KillHits".padStart(8)}`,
);
const guardRows = [];
for (const [label, levels, styleId] of [
  ["Def 1 Accurate", lowDef, "accurate"],
  ["Def 1 Defensive style", lowDef, "defensive"],
  ["Def 10 Accurate", highDef, "accurate"],
  ["Def 10 Defensive style", highDef, "defensive"],
]) {
  const style = getStyle(sword, styleId);
  const view = pressure(levels, sword, style, guard);
  const sample = runSample(`guard-${label}`, levels, sword, style, guard, MATRIX_TRIALS);
  guardRows.push({ label, levels, styleId, view, sample });
  console.log(
    `${label.padEnd(28)} ${pad(pct(view.enemyHit), 8)} ${pad(view.enemyMax, 5)} ${pad(num(view.enemyDps), 7)} ${pad(pct(sample.winRate), 8)} ${pad(num(sample.avgDamageTaken), 8)} ${pad(num(sample.killDamagingHits), 8)}`,
  );
}

printHeader("Highwayman — mid Sword Accurate vs Aggressive");
const highwayman = getEnemy("highwayman");
for (const styleId of ["accurate", "aggressive", "defensive"]) {
  const style = getStyle(sword, styleId);
  const view = pressure(mid, sword, style, highwayman);
  const sample = runSample(`mid-highway-${styleId}`, mid, sword, style, highwayman, MATRIX_TRIALS);
  console.log(
    `${style.name.padEnd(12)} hit ${pct(view.playerHit)}  max ${view.playerMax}  dps ${num(view.playerDps)}  win ${pct(sample.winRate)}  swings ${num(sample.avgSwings)}  killHits ${num(sample.killDamagingHits)}  dmgIn ${num(sample.avgDamageTaken)}  ${xpBrief(sample.avgXp)}`,
  );
}

printHeader(`Per weapon and style vs each enemy — starting player (${MATRIX_TRIALS})`);
console.log(
  `${"Enemy".padEnd(12)} ${"Weapon".padEnd(14)} ${"Style".padEnd(12)} ${"Hit%".padStart(8)} ${"Max".padStart(4)} ${"Win%".padStart(8)} ${"KillHits".padStart(8)} ${"DmgIn".padStart(8)}  XP`,
);
const matrix = [];
for (const enemy of ENEMIES) {
  for (const weaponId of WEAPON_ORDER) {
    const weapon = WEAPONS[weaponId];
    for (const style of weapon.styles) {
      const view = pressure(starter, weapon, style, enemy);
      const sample = runSample(
        `matrix-${enemy.id}-${weapon.id}-${style.id}`,
        starter,
        weapon,
        style,
        enemy,
        MATRIX_TRIALS,
      );
      matrix.push({ enemy, weapon, style, view, sample });
      console.log(
        `${enemy.name.padEnd(12)} ${weapon.name.padEnd(14)} ${style.name.padEnd(12)} ${pad(pct(view.playerHit), 8)} ${pad(view.playerMax, 4)} ${pad(pct(sample.winRate), 8)} ${pad(num(sample.killDamagingHits), 8)} ${pad(num(sample.avgDamageTaken), 8)}  ${xpBrief(sample.avgXp)}`,
      );
    }
  }
}

printHeader("Victory XP by enemy and style");
console.log("Pool is neutral. It is split by the style rates, then Hitpoints is added at the damage-XP ratio.");
console.log("Mixed multiplies every skill in that split by 1.12, including Hitpoints. Other styles are not boosted.");
console.log(
  `${"Enemy".padEnd(12)} ${"Pool".padStart(5)} ${"Weapon".padEnd(14)} ${"Style".padEnd(12)} ${"Atk".padStart(7)} ${"Str".padStart(7)} ${"Def".padStart(7)} ${"Mag".padStart(7)} ${"Rng".padStart(7)} ${"HP".padStart(7)}`,
);
for (const enemy of ENEMIES) {
  for (const weaponId of WEAPON_ORDER) {
    const weapon = WEAPONS[weaponId];
    for (const style of weapon.styles) {
      const gained = xpForVictory(style, enemy);
      const cell = (skill) => pad((gained[skill] || 0).toFixed(2), 7);
      console.log(
        `${enemy.name.padEnd(12)} ${pad(enemy.xpReward.victoryPool, 5)} ${weapon.name.padEnd(14)} ${style.name.padEnd(12)} ${cell("attack")} ${cell("strength")} ${cell("defence")} ${cell("magic")} ${cell("ranged")} ${cell("hitpoints")}`,
      );
    }
  }
}

printHeader("Assertions");

assert(xpForLevel(1) === 0, "XP level 1 is 0");
assert(xpForLevel(2) === 83, `XP level 2 is 83 (got ${xpForLevel(2)})`);
assert(xpForLevel(10) === 1154, `XP level 10 is 1154 (got ${xpForLevel(10)})`);
assert(xpForLevel(99) === 13034431, `XP level 99 is 13034431 (got ${xpForLevel(99)})`);

assert(combatLevel(starter) === 3, `Starting combat level is 3 (got ${combatLevel(starter)})`);
assert(
  combatLevel({ attack: 99, strength: 99, defence: 99, hitpoints: 99, prayer: 99, ranged: 99, magic: 99 }) === 126,
  "99 all stats including Prayer is combat level 126",
);
const pureMage = combatLevel({ attack: 1, strength: 1, defence: 1, hitpoints: 10, magic: 99, ranged: 1 });
const pureRanger = combatLevel({ attack: 1, strength: 1, defence: 1, hitpoints: 10, magic: 1, ranged: 99 });
assert(pureMage === 50, `Magic 99 pure is combat level 50 (got ${pureMage})`);
assert(pureRanger === 50, `Ranged 99 pure is combat level 50 (got ${pureRanger})`);
assert(pureMage > combatLevel(starter) && pureRanger > combatLevel(starter), "Magic and Ranged feed combat level");

assert(goblin.combatLevel >= 2 && goblin.combatLevel <= 5, `Goblin combat level is 2–5 (got ${goblin.combatLevel})`);
for (let i = 1; i < ENEMIES.length; i += 1) {
  assert(
    ENEMIES[i].combatLevel > ENEMIES[i - 1].combatLevel,
    `${ENEMIES[i].name} CL ${ENEMIES[i].combatLevel} > ${ENEMIES[i - 1].name} CL ${ENEMIES[i - 1].combatLevel}`,
  );
}

const covered = new Set();
for (const weapon of Object.values(WEAPONS)) {
  for (const style of weapon.styles) {
    for (const skill of Object.keys(style.xp)) covered.add(skill);
  }
}
for (const skill of SKILLS) {
  assert(covered.has(skill), `${skill} is trained by at least one weapon style`);
}

for (const style of sword.styles) {
  const view = pressure(starter, sword, style, goblin);
  assert(view.playerMax >= 1 && view.playerMax <= 2, `Sword ${style.name} max hit is 1–2 (got ${view.playerMax})`);
  assert(
    view.playerHit >= 0.6 && view.playerHit <= 0.75,
    `Sword ${style.name} hit chance vs goblin is 0.60–0.75 (got ${view.playerHit.toFixed(4)})`,
  );
}

assert(
  goblinAccurate.killDamagingHits >= 4 && goblinAccurate.killDamagingHits <= 5.05,
  `Sword accurate damaging hits to kill the goblin is 4–5 (got ${goblinAccurate.killDamagingHits?.toFixed(3)})`,
);
assert(goblinAccurate.winRate > 0.9, `Sword accurate beats the goblin most of the time (got ${pct(goblinAccurate.winRate)})`);

const accurateViews = WEAPON_ORDER.map((id) => pressure(starter, WEAPONS[id], getStyle(WEAPONS[id], "accurate"), goblin));
for (const view of accurateViews) {
  assert(view.playerMax >= 1 && view.playerMax <= 2, `Accurate max hit stays in 1–2 (got ${view.playerMax})`);
}
const hitSpread = Math.max(...accurateViews.map((v) => v.playerHit)) - Math.min(...accurateViews.map((v) => v.playerHit));
assert(hitSpread < 0.02, `Accurate hit chances agree across weapons (spread ${hitSpread.toFixed(4)})`);

for (let i = 1; i < pressures.length; i += 1) {
  assert(
    pressures[i].view.pressure > pressures[i - 1].view.pressure,
    `Pressure rises ${pressures[i - 1].enemy.name} ${pressures[i - 1].view.pressure.toFixed(3)} < ${pressures[i].enemy.name} ${pressures[i].view.pressure.toFixed(3)}`,
  );
}

assert(
  startProg.goblin.winRate > startProg.man.winRate + 0.03,
  `Starting win rate Goblin ${pct(startProg.goblin.winRate)} > Man ${pct(startProg.man.winRate)}`,
);
assert(
  startProg.man.winRate > startProg.guard.winRate + 0.05,
  `Starting win rate Man ${pct(startProg.man.winRate)} > Guard ${pct(startProg.guard.winRate)}`,
);
assert(
  startProg.highwayman.winRate <= startProg.guard.winRate + 0.02,
  `Highwayman win rate ${pct(startProg.highwayman.winRate)} does not exceed Guard ${pct(startProg.guard.winRate)}`,
);
assert(
  pressures[3].view.roundsToDie < pressures[2].view.roundsToDie,
  `Highwayman drops a level 3 faster (TTD ${num(pressures[3].view.roundsToDie)} < guard ${num(pressures[2].view.roundsToDie)})`,
);
assert(
  midProg.guard.sample.winRate > midProg.highwayman.sample.winRate + 0.05,
  `Mid-level Guard win ${pct(midProg.guard.sample.winRate)} > Highwayman ${pct(midProg.highwayman.sample.winRate)}`,
);

const lowRow = guardRows.find((row) => row.label === "Def 1 Accurate");
const highRow = guardRows.find((row) => row.label === "Def 10 Accurate");
const winGap = highRow.sample.winRate - lowRow.sample.winRate;
const damageImproved = lowRow.sample.avgDamageTaken >= highRow.sample.avgDamageTaken * 1.2;
assert(
  winGap >= 0.1 || damageImproved,
  `Defence 10 improves the guard fight (win gap ${pct(winGap)}, dmg ${num(lowRow.sample.avgDamageTaken)} vs ${num(highRow.sample.avgDamageTaken)})`,
);
assert(
  lowRow.view.enemyHit > highRow.view.enemyHit + 0.08,
  `Guard hits Defence 1 more often than Defence 10 (${pct(lowRow.view.enemyHit)} vs ${pct(highRow.view.enemyHit)})`,
);

const midAcc = pressure(mid, sword, getStyle(sword, "accurate"), highwayman);
const midAgg = pressure(mid, sword, getStyle(sword, "aggressive"), highwayman);
assert(midAgg.playerMax > midAcc.playerMax, `Aggressive max hit ${midAgg.playerMax} > accurate ${midAcc.playerMax} at 10 Strength vs highwayman`);
assert(
  midAgg.roundsToKill < midAcc.roundsToKill,
  `Aggressive kills the highwayman in fewer expected rounds (${num(midAgg.roundsToKill)} < ${num(midAcc.roundsToKill)})`,
);

const staffDef = getStyle(WEAPONS.staff, "defensive");
const staffXp = xpFromDamage(staffDef.xp, 3);
assert(staffXp.magic === 6 && staffXp.defence === 6, "Defensive staff splits 3 damage into 6 Magic and 6 Defence XP");
const bowLong = getStyle(WEAPONS.bow, "longrange");
const bowXp = xpFromDamage(bowLong.xp, 2);
assert(bowXp.ranged === 4 && bowXp.defence === 4, "Longrange splits XP between Ranged and Defence");

assert(MIXED_XP_BOOST === 0.12, `MIXED_XP_BOOST is 0.12 (got ${MIXED_XP_BOOST})`);
const mixed = getStyle(sword, "mixed");
assert(sword.styles.length === 4 && mixed.id === "mixed", "Sword has a fourth Mixed style");
assert(!WEAPONS.staff.styles.some((style) => style.id === "mixed"), "Staff has no Mixed style");
assert(!WEAPONS.bow.styles.some((style) => style.id === "mixed"), "Bow has no Mixed style");
assert(
  mixed.bonuses.attack === 1 && mixed.bonuses.strength === 1 && mixed.bonuses.defence === 1,
  "Mixed grants +1 Attack, Strength, and Defence",
);
assert(mixed.xpBoost === MIXED_XP_BOOST, "Mixed is the only style carrying the boost constant");

const mixedPlain = xpFromDamage(mixed.xp, 3, 1);
const mixedBoosted = xpForHit(mixed, 3);
for (const skill of ["attack", "strength", "defence", "hitpoints"]) {
  assert(
    Math.abs(mixedPlain[skill] - mixed.xp[skill] * 3) < 1e-9,
    `Mixed ${skill} base split is 4/3 per damage (got ${mixedPlain[skill]})`,
  );
  assert(
    Math.abs(mixedBoosted[skill] - mixedPlain[skill] * (1 + MIXED_XP_BOOST)) < 1e-9,
    `Mixed ${skill} is the normal split × 1.12 (got ${mixedBoosted[skill]}, expected ${mixedPlain[skill] * (1 + MIXED_XP_BOOST)})`,
  );
}
assert(
  Math.abs(mixedPlain.attack - mixedPlain.strength) < 1e-12 &&
    Math.abs(mixedPlain.strength - mixedPlain.defence) < 1e-12 &&
    Math.abs(mixedPlain.defence - mixedPlain.hitpoints) < 1e-12,
  "Mixed splits Attack, Strength, Defence, and Hitpoints evenly before the boost",
);

const mixedVictory = xpForVictory(mixed, getEnemy("man"));
const mixedVictoryPlain = xpFromVictoryPool(mixed.xp, 15, 1);
for (const skill of ["attack", "strength", "defence", "hitpoints"]) {
  assert(
    Math.abs(mixedVictory[skill] - mixedVictoryPlain[skill] * (1 + MIXED_XP_BOOST)) < 1e-9,
    `Mixed victory ${skill} on the man is the style split × 1.12`,
  );
}

for (const weaponId of WEAPON_ORDER) {
  for (const style of WEAPONS[weaponId].styles) {
    if (style.id === "mixed") continue;
    assert(!style.xpBoost, `${weaponId} ${style.id} has no XP boost`);
    assert(xpRateMultiplier(style) === 1, `${weaponId} ${style.id} multiplier is 1`);
    const plain = xpFromDamage(style.xp, 4, 1);
    const paid = xpForHit(style, 4);
    for (const skill of Object.keys(plain)) {
      assert(paid[skill] === plain[skill], `${weaponId} ${style.id} ${skill} is not boosted`);
    }
  }
}

for (const enemy of ENEMIES) {
  assert(typeof enemy.xpReward?.victoryPool === "number", `${enemy.name} keeps a neutral victory pool`);
  assert(!enemy.xpReward.victory, `${enemy.name} has no skill-keyed victory map`);
  for (const skill of SKILLS) {
    assert(enemy.xpReward[skill] == null, `${enemy.name} does not hardcode ${skill} XP`);
  }
  for (const weaponId of WEAPON_ORDER) {
    const weapon = WEAPONS[weaponId];
    for (const style of weapon.styles) {
      const xp = {};
      addGains(xp, xpForHit(style, 4));
      addGains(xp, xpForVictory(style, enemy));
      const allowed = new Set(Object.keys(style.xp));
      for (const skill of SKILLS) {
        const amount = xp[skill] || 0;
        if (amount > 0) {
          assert(allowed.has(skill), `${enemy.id} ${weapon.id} ${style.id} pays ${skill} only because that style trains it`);
        }
        if (!allowed.has(skill)) {
          assert(!xp[skill], `${enemy.id} ${weapon.id} ${style.id} pays no ${skill}`);
        }
      }
    }
  }
}

for (const row of matrix) {
  const allowed = new Set(Object.keys(row.style.xp));
  for (const skill of SKILLS) {
    if ((row.sample.avgXp[skill] || 0) > 0.0001) {
      assert(
        allowed.has(skill),
        `Simulated ${row.enemy.id} ${row.weapon.id} ${row.style.id} keeps ${skill} inside the style`,
      );
    }
  }
}

console.log("");
if (failures.length) {
  console.error(`${failures.length} assertion(s) failed.`);
  process.exit(1);
}
console.log("All assertions passed.");
