/**
 * Experience and combat level.
 *
 * OSRS experience for a target level L (level 1 is 0 XP):
 *   xp(L) = floor( sum_{i=1}^{L-1} floor(i + 300 * 2^(i/7)) / 4 )
 *
 * OSRS combat level (Prayer defaults to 0; Duskmire has no Prayer skill yet):
 *   base   = 0.25 * (Defence + Hitpoints + floor(Prayer / 2))
 *   melee  = 0.325 * (Attack + Strength)
 *   ranged = 0.325 * floor(Ranged * 3 / 2)
 *   magic  = 0.325 * floor(Magic * 3 / 2)
 *   level  = floor(base + max(melee, ranged, magic))
 *
 * Only the highest of melee, ranged, and magic is added, so a pure
 * mage or ranger is not punished for ignoring the other styles.
 */

export const SKILLS = ["attack", "strength", "defence", "hitpoints", "magic", "ranged"];

export const SKILL_LABELS = {
  attack: "Attack",
  strength: "Strength",
  defence: "Defence",
  hitpoints: "Hitpoints",
  magic: "Magic",
  ranged: "Ranged",
};

export const SKILL_SHORT = {
  attack: "Atk",
  strength: "Str",
  defence: "Def",
  hitpoints: "HP",
  magic: "Mag",
  ranged: "Rng",
};

export const MAX_LEVEL = 99;

export function xpForLevel(level) {
  if (level <= 1) return 0;
  let points = 0;
  const cap = Math.min(level, MAX_LEVEL + 1);
  for (let i = 1; i < cap; i += 1) {
    points += Math.floor(i + 300 * Math.pow(2, i / 7));
  }
  return Math.floor(points / 4);
}

export function levelForXp(xp) {
  const amount = Math.max(0, xp || 0);
  let level = 1;
  while (level < MAX_LEVEL && xpForLevel(level + 1) <= amount) {
    level += 1;
  }
  return level;
}

export function xpProgress(xp) {
  const level = levelForXp(xp);
  if (level >= MAX_LEVEL) {
    return { level, into: 0, span: 1, ratio: 1 };
  }
  const base = xpForLevel(level);
  const next = xpForLevel(level + 1);
  const span = Math.max(1, next - base);
  return { level, into: xp - base, span, ratio: (xp - base) / span };
}

export function combatBreakdown(stats = {}) {
  const defence = stats.defence ?? 1;
  const hitpoints = stats.hitpoints ?? 10;
  const prayer = stats.prayer ?? 0;
  const attack = stats.attack ?? 1;
  const strength = stats.strength ?? 1;
  const ranged = stats.ranged ?? 1;
  const magic = stats.magic ?? 1;

  const base = 0.25 * (defence + hitpoints + Math.floor(prayer / 2));
  const melee = 0.325 * (attack + strength);
  const rangedPart = 0.325 * Math.floor((ranged * 3) / 2);
  const magicPart = 0.325 * Math.floor((magic * 3) / 2);
  const best = Math.max(melee, rangedPart, magicPart);
  let style = "melee";
  if (magicPart === best && magicPart > melee && magicPart >= rangedPart) style = "magic";
  else if (rangedPart === best && rangedPart > melee) style = "ranged";
  return {
    base,
    melee,
    ranged: rangedPart,
    magic: magicPart,
    style,
    combat: Math.floor(base + best),
  };
}

export function combatLevel(stats) {
  return combatBreakdown(stats).combat;
}
