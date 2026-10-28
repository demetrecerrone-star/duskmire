/**
 * Turn-based combat built on the OSRS melee formulas.
 * Magic and Ranged use the same rolls; only the level and the bonus change.
 * No DOM, no rendering — safe to import from Node.
 *
 * Effective levels (no potions, no prayers):
 *   effective = skillLevel + stanceBonus + 8
 * NPCs have no stance, so they sit at skillLevel + 8.
 *
 * Attack roll  = effectiveAccuracy * (attackBonus + 64)
 * Defence roll = effectiveDefence  * (defenceBonus + 64)
 *
 * Hit chance:
 *   if attack > defence:  1 - (defence + 2) / (2 * (attack + 1))
 *   otherwise:            attack / (2 * (defence + 1))
 *
 * Max hit:
 *   floor( (effectiveStrength * (strengthBonus + 64) + 320) / 640 )
 * which is the integer form of
 *   floor( 0.5 + effectiveStrength * (strengthBonus + 64) / 640 )
 *
 * On a successful accuracy roll, damage is uniform on the integers
 * 0 .. maxHit (inclusive). A 0 is a hit that glances; a failed accuracy
 * roll is a miss. Experience is  the style table times actual HP removed
 * (overkill above the target's remaining HP does not grant XP).
 */

export function emptyStyle() {
  return {
    attack: 0,
    strength: 0,
    defence: 0,
    magicAccuracy: 0,
    magicStrength: 0,
    ranged: 0,
    rangedStrength: 0,
  };
}

export function effectiveAccuracy(fighter) {
  const style = fighter.style || emptyStyle();
  if (fighter.attackType === "magic") {
    return fighter.levels.magic + (style.magicAccuracy || 0) + 8;
  }
  if (fighter.attackType === "ranged") {
    return fighter.levels.ranged + (style.ranged || 0) + 8;
  }
  return fighter.levels.attack + (style.attack || 0) + 8;
}

export function effectiveDamage(fighter) {
  const style = fighter.style || emptyStyle();
  if (fighter.attackType === "magic") {
    return fighter.levels.magic + (style.magicStrength || 0) + 8;
  }
  if (fighter.attackType === "ranged") {
    return fighter.levels.ranged + (style.rangedStrength || 0) + 8;
  }
  return fighter.levels.strength + (style.strength || 0) + 8;
}

export function effectiveDefence(fighter) {
  const style = fighter.style || emptyStyle();
  return fighter.levels.defence + (style.defence || 0) + 8;
}

export function accuracyBonus(fighter) {
  const b = fighter.bonuses || {};
  if (fighter.attackType === "magic") return b.magic || 0;
  if (fighter.attackType === "ranged") return b.ranged || 0;
  return b.attack || 0;
}

export function damageBonus(fighter) {
  const b = fighter.bonuses || {};
  if (fighter.attackType === "magic") return b.magicStrength || 0;
  if (fighter.attackType === "ranged") return b.rangedStrength || 0;
  return b.strength || 0;
}

export function attackRoll(fighter) {
  return effectiveAccuracy(fighter) * (accuracyBonus(fighter) + 64);
}

export function defenceRoll(fighter) {
  return effectiveDefence(fighter) * ((fighter.bonuses?.defence || 0) + 64);
}

export function hitChance(atk, def) {
  if (atk > def) {
    return 1 - (def + 2) / (2 * (atk + 1));
  }
  return atk / (2 * (def + 1));
}

export function maxHit(fighter) {
  const eff = effectiveDamage(fighter);
  const bonus = damageBonus(fighter);
  return Math.floor((eff * (bonus + 64) + 320) / 640);
}

/** Uniform 0..maxHit averages to maxHit / 2. */
export function averageHitDamage(max) {
  return max / 2;
}

export function expectedAttacks(fighter) {
  return (fighter.attacksPerRound || 1) + (fighter.extraAttackChance || 0);
}

export function previewStrike(attacker, defender) {
  const atk = attackRoll(attacker);
  const def = defenceRoll(defender);
  const chance = hitChance(atk, def);
  const max = maxHit(attacker);
  return {
    attackRoll: atk,
    defenceRoll: def,
    hitChance: chance,
    maxHit: max,
    averageDamage: averageHitDamage(max),
    expectedAttacks: expectedAttacks(attacker),
    damagePerRound: chance * averageHitDamage(max) * expectedAttacks(attacker),
  };
}

export function shotCount(fighter, rng) {
  const base = fighter.attacksPerRound || 1;
  const extra = fighter.extraAttackChance || 0;
  if (extra > 0 && rng.next() < extra) return base + 1;
  return base;
}

/**
 * One swing. Does not mutate HP — the caller applies damage.
 * `landed` is the accuracy check. Damage is 0 on a miss, otherwise
 * a uniform integer from 0 through max hit.
 */
export function resolveAttack(attacker, defender, rng) {
  const atk = attackRoll(attacker);
  const def = defenceRoll(defender);
  const chance = hitChance(atk, def);
  const max = maxHit(attacker);
  const accuracyRoll = rng.next();
  const landed = accuracyRoll < chance;
  const damage = landed && max > 0 ? rng.int(0, max) : 0;
  return {
    atkRoll: atk,
    defRoll: def,
    hitChance: chance,
    maxHit: max,
    accuracyRoll,
    landed,
    miss: !landed,
    damage,
  };
}

/**
 * Player attacks (possibly more than once), then the enemy answers
 * if still standing. Damage is capped at remaining HP.
 */
export function exchange(player, enemy, rng, options) {
  const events = [];
  const swing = (attacker, defender, actor) => {
    const shots = shotCount(attacker, rng);
    for (let i = 0; i < shots; i += 1) {
      if (attacker.hp <= 0 || defender.hp <= 0) break;
      const result = resolveAttack(attacker, defender, rng);
      const dealt = Math.min(result.damage, defender.hp);
      defender.hp -= dealt;
      events.push({
        actor,
        followUp: i > 0,
        ...result,
        damageRolled: result.damage,
        damage: dealt,
        targetHp: defender.hp,
      });
    }
  };
  if (!options?.skipPlayer) swing(player, enemy, "player");
  if (enemy.hp > 0 && player.hp > 0) swing(enemy, player, "enemy");
  return events;
}

/**
 * Style XP multiplier. Mixed sets `xpBoost` (see MIXED_XP_BOOST in weapons.js).
 * Every other style leaves it unset, so the multiplier stays 1.
 * The boost covers every skill that style trains, including Hitpoints.
 */
export function xpRateMultiplier(style) {
  const boost = style?.xpBoost || 0;
  return 1 + boost;
}

/**
 * XP table values are "points per 1 damage".
 * `multiplier` scales every skill in the table, Hitpoints included.
 */
export function xpFromDamage(xpTable, damage, multiplier = 1) {
  const gains = {};
  if (!damage || damage <= 0 || !multiplier) return gains;
  for (const [skill, rate] of Object.entries(xpTable || {})) {
    if (rate) gains[skill] = rate * damage * multiplier;
  }
  return gains;
}

/**
 * A victory pool is a neutral amount of style XP — never a skill chosen by the foe.
 * It is shared across the style's non-hitpoints rates in proportion to those rates.
 * Hitpoints then receives pool * (hitpointsRate / combatWeight), the same ratio
 * damage XP uses. Mixed's multiplier applies here too.
 */
export function xpFromVictoryPool(xpTable, pool, multiplier = 1) {
  const gains = {};
  if (!pool || pool <= 0 || !multiplier) return gains;
  let combatWeight = 0;
  let hpRate = 0;
  for (const [skill, rate] of Object.entries(xpTable || {})) {
    if (!rate) continue;
    if (skill === "hitpoints") hpRate += rate;
    else combatWeight += rate;
  }
  if (combatWeight <= 0) return gains;
  for (const [skill, rate] of Object.entries(xpTable || {})) {
    if (!rate || skill === "hitpoints") continue;
    gains[skill] = ((pool * rate) / combatWeight) * multiplier;
  }
  if (hpRate) gains.hitpoints = ((pool * hpRate) / combatWeight) * multiplier;
  return gains;
}

export function xpForHit(style, damage) {
  return xpFromDamage(style?.xp, damage, xpRateMultiplier(style));
}

export function xpForVictory(style, enemy) {
  const pool = enemy?.xpReward?.victoryPool || 0;
  return xpFromVictoryPool(style?.xp, pool, xpRateMultiplier(style));
}

export function addGains(total, gains) {
  for (const [skill, amount] of Object.entries(gains || {})) {
    if (!amount) continue;
    total[skill] = (total[skill] || 0) + amount;
  }
  return total;
}

export function describeSwing(actorName, event) {
  const pct = (event.hitChance * 100).toFixed(1);
  let outcome = "Miss.";
  if (!event.miss) {
    outcome = event.damage > 0 ? `Hit for ${event.damage}.` : "Hit for 0.";
  }
  const extra = event.followUp ? " Follow-up." : "";
  return `${actorName}${extra} Attack roll ${event.atkRoll} vs defence roll ${event.defRoll}. Hit chance ${pct}%. Max hit ${event.maxHit}. ${outcome}`;
}
