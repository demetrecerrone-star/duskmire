/**
 * Early-road bestiary, in the order the player is allowed to fight them.
 * Combat level is computed with the same formula as the player.
 *
 * Each foe nudges a different lesson. Experience always follows the player's
 * style, never the foe. `victoryPool` is a neutral amount of style XP awarded
 * on a win and split by that style's rates (plus Hitpoints). `emphasis` is
 * only a suggested lesson, not a skill the enemy pays.
 *   Goblin      — the numbers. Any style works; Hitpoints always gain. No victory pool.
 *   Man         — a longer accurate grind. Suggested lesson is Sword Accurate.
 *   Guard       — armour and a heavy sword. Low Defence loses; defensive stance helps.
 *   Highwayman  — two fast knife strikes, thin armour. Aggressive Strength shortens the race.
 *
 * Bonuses below were tuned in tools/simulate.js. See README for the measured targets.
 */
import { combatLevel } from "./skills.js";

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

function defineEnemy(data) {
  return {
    attackType: "melee",
    attacksPerRound: 1,
    extraAttackChance: 0,
    ...data,
    combatLevel: combatLevel(data.levels),
  };
}

export const ENEMIES = [
  defineEnemy({
    id: "goblin",
    name: "Goblin",
    flavor: "Small, mean, and convinced the clearing is his.",
    levels: { attack: 1, strength: 1, defence: 1, hitpoints: 5, magic: 1, ranged: 1 },
    bonuses: bonuses({}),
    unlockAfter: null,
    training: {
      recommendedCombatLevel: 3,
      suggestedWeapon: "sword",
      suggestedStyle: "accurate",
      emphasis: ["attack", "strength", "defence", "hitpoints"],
      summary:
        "First exchange. Accurate trains Attack, aggressive trains Strength, defensive trains Defence. Every point of damage also trains Hitpoints.",
    },
    xpReward: {
      victoryPool: 0,
      note: "Damage XP only. It follows the style you swung with, plus Hitpoints. No victory bonus.",
    },
  }),
  defineEnemy({
    id: "man",
    name: "Man",
    flavor: "A traveller in a brown shirt. He would rather be left alone.",
    levels: { attack: 4, strength: 3, defence: 2, hitpoints: 8, magic: 1, ranged: 1 },
    bonuses: bonuses({ attack: 6, strength: 2, defence: 3 }),
    unlockAfter: "goblin",
    training: {
      recommendedCombatLevel: 5,
      suggestedWeapon: "sword",
      suggestedStyle: "accurate",
      emphasis: ["attack"],
      summary:
        "More health and a sturdier swing than the goblin. Suggested lesson: Sword, Accurate. A win pays 15 style XP into whatever style you used, plus Hitpoints.",
    },
    xpReward: {
      victoryPool: 15,
      note: "Damage XP as usual, plus 15 style XP on a win, split by the style you have selected. The man does not choose the skill.",
    },
  }),
  defineEnemy({
    id: "guard",
    name: "Guard",
    flavor: "Plate, shield, and a sword that punishes an open guard.",
    levels: { attack: 7, strength: 7, defence: 6, hitpoints: 10, magic: 1, ranged: 1 },
    bonuses: bonuses({ attack: 10, strength: 12, defence: 16 }),
    unlockAfter: "man",
    training: {
      recommendedCombatLevel: 8,
      suggestedWeapon: "sword",
      suggestedStyle: "defensive",
      emphasis: ["defence"],
      summary:
        "Mail and a heavy sword. A level 3 loses this almost every time. Train Defence on the goblin and the man, then come back: at Attack 10 and Strength 10, Defence 1 still takes far more damage than Defence 10. Defence XP comes from the defensive style (or Mixed, or a shared style), not from the guard.",
    },
    xpReward: {
      victoryPool: 25,
      note: "Damage XP as usual, plus 25 style XP on a win, routed through the style you have selected.",
    },
  }),
  defineEnemy({
    id: "highwayman",
    name: "Highwayman",
    flavor: "Two knife strokes a breath. He folds if you hit hard.",
    levels: { attack: 16, strength: 14, defence: 4, hitpoints: 9, magic: 1, ranged: 1 },
    bonuses: bonuses({ attack: 22, strength: 12, defence: 0 }),
    attacksPerRound: 2,
    unlockAfter: "guard",
    training: {
      recommendedCombatLevel: 18,
      suggestedWeapon: "sword",
      suggestedStyle: "aggressive",
      emphasis: ["strength"],
      summary:
        "Fragile and fast. He strikes twice each round. Aggressive raises your max hit so the race is shorter. A win pays 25 style XP into the style you used, not into Strength unless that was your style.",
    },
    xpReward: {
      victoryPool: 25,
      note: "Damage XP as usual, plus 25 style XP on a win, routed through the style you have selected. He attacks twice per round.",
    },
  }),
];

export const ENEMY_ORDER = ENEMIES.map((enemy) => enemy.id);

export function getEnemy(id) {
  return ENEMIES.find((enemy) => enemy.id === id) || ENEMIES[0];
}

export function isUnlocked(enemy, defeatedIds) {
  if (!enemy.unlockAfter) return true;
  return defeatedIds.includes(enemy.unlockAfter);
}

export function nextEnemyId(id) {
  const index = ENEMY_ORDER.indexOf(id);
  if (index < 0 || index >= ENEMY_ORDER.length - 1) return null;
  return ENEMY_ORDER[index + 1];
}
