/**
 * Player records and the fighter snapshots combat actually rolls against.
 */
import { SKILLS, combatLevel, levelForXp, xpForLevel } from "./skills.js";
import { emptyStyle } from "./combat.js";

export const STARTING_LEVELS = Object.freeze({
  attack: 1,
  strength: 1,
  defence: 1,
  hitpoints: 10,
  magic: 1,
  ranged: 1,
});

/** Attack 10, Strength 10, Defence 10, Hitpoints 15. Magic and Ranged stay 1. */
export const MID_LEVELS = Object.freeze({
  attack: 10,
  strength: 10,
  defence: 10,
  hitpoints: 15,
  magic: 1,
  ranged: 1,
});

export function createPlayerFromXp(xpMap) {
  const xp = {};
  const skills = {};
  for (const skill of SKILLS) {
    xp[skill] = Math.max(0, Number(xpMap?.[skill]) || 0);
    skills[skill] = levelForXp(xp[skill]);
  }
  return {
    skills,
    xp,
    hp: skills.hitpoints,
    maxHp: skills.hitpoints,
  };
}

export function createPlayer(levels = STARTING_LEVELS) {
  const xp = {};
  for (const skill of SKILLS) {
    xp[skill] = xpForLevel(levels[skill] ?? 1);
  }
  return createPlayerFromXp(xp);
}

export function playerCombatLevel(player) {
  return combatLevel(player.skills);
}

/**
 * Apply XP and return level-ups in skill order.
 * Hitpoints level-ups raise max HP and heal the difference.
 */
export function grantXp(player, gains) {
  const before = { ...player.skills };
  for (const [skill, amount] of Object.entries(gains || {})) {
    if (!SKILLS.includes(skill) || !amount) continue;
    player.xp[skill] = (player.xp[skill] || 0) + amount;
  }
  const levelUps = [];
  for (const skill of SKILLS) {
    const next = levelForXp(player.xp[skill] || 0);
    if (next > before[skill]) {
      player.skills[skill] = next;
      if (skill === "hitpoints") {
        const gained = next - before.hitpoints;
        player.maxHp = next;
        player.hp = Math.min(player.maxHp, player.hp + gained);
      }
      levelUps.push({ skill, from: before[skill], to: next });
    }
  }
  return levelUps;
}

export function rest(player) {
  player.hp = player.maxHp;
}

function styleBonuses(style) {
  const bonuses = style?.bonuses || {};
  return {
    ...emptyStyle(),
    attack: bonuses.attack || 0,
    strength: bonuses.strength || 0,
    defence: bonuses.defence || 0,
    magicAccuracy: bonuses.magicAccuracy || 0,
    magicStrength: bonuses.magicStrength || 0,
    ranged: bonuses.ranged || 0,
    rangedStrength: bonuses.rangedStrength || 0,
  };
}

export function makePlayerFighter(player, weapon, style, gearBonuses) {
  const bonuses = { ...weapon.bonuses };
  if (gearBonuses) {
    for (const key of Object.keys(bonuses)) bonuses[key] += gearBonuses[key] || 0;
  }
  return {
    name: "You",
    attackType: weapon.attackType,
    levels: { ...player.skills },
    bonuses,
    style: styleBonuses(style),
    attacksPerRound: style.attacksPerRound || 1,
    extraAttackChance: style.extraAttackChance || 0,
    hp: player.hp,
    maxHp: player.maxHp,
    weaponId: weapon.id,
    weaponName: weapon.name,
    styleId: style.id,
    styleName: style.name,
    xpTable: style.xp,
  };
}

export function makeEnemyFighter(enemy) {
  return {
    name: enemy.name,
    attackType: enemy.attackType || "melee",
    levels: { ...enemy.levels },
    bonuses: { ...enemy.bonuses },
    style: emptyStyle(),
    attacksPerRound: enemy.attacksPerRound || 1,
    extraAttackChance: enemy.extraAttackChance || 0,
    hp: enemy.levels.hitpoints,
    maxHp: enemy.levels.hitpoints,
  };
}

/** Build a fighter from raw levels for simulations that are not a saved player. */
export function makeSimPlayer(levels, weapon, style, gearBonuses) {
  const player = createPlayer(levels);
  return makePlayerFighter(player, weapon, style, gearBonuses);
}
