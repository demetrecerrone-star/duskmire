/**
 * Weapon definitions. Bonuses feed the shared hit-chance and max-hit formulas.
 *
 * MIXED_XP_BOOST is the only place the Mixed +12% is defined. Combat reads
 * `style.xpBoost` and multiplies every skill that style trains, Hitpoints included.
 *
 * Tuning (level 1, +8 invisible bonus, vs a defence roll of 576):
 *   accuracy bonus +18 → accurate hit chance ~0.707, other styles ~0.609
 *   melee/magic strength bonus +16 → accurate max hit 1, aggressive max hit 2
 *   ranged strength bonus +10 → every bow style max hit 1 at level 1
 *     (accurate's +3 ranged strength still stays under the next threshold)
 * Rapid adds a 50% chance of a second shot before the enemy answers,
 * about a third more attacks rather than a full extra attack every round.
 *
 * XP: 4 points per damage to the style skill, 4/3 to Hitpoints.
 * Shared styles split the 4 points in half (2 and 2) and still grant 4/3 HP.
 * Mixed splits that 4 across Attack, Strength, and Defence (4/3 each) and
 * then multiplies every trained skill, Hitpoints included, by 1.12.
 */
export const MIXED_XP_BOOST = 0.12;

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

const HP = 4 / 3;

export const WEAPONS = {
  sword: {
    id: "sword",
    name: "Bronze Sword",
    attackType: "melee",
    blurb: "Melee. Accurate trains Attack, aggressive trains Strength, defensive trains Defence. Mixed trains all three, with a 12% bonus.",
    bonuses: bonuses({ attack: 18, strength: 16 }),
    styles: [
      {
        id: "accurate",
        name: "Accurate",
        summary: "+3 Attack",
        bonuses: { attack: 3 },
        xp: { attack: 4, hitpoints: HP },
      },
      {
        id: "aggressive",
        name: "Aggressive",
        summary: "+3 Strength",
        bonuses: { strength: 3 },
        xp: { strength: 4, hitpoints: HP },
      },
      {
        id: "defensive",
        name: "Defensive",
        summary: "+3 Defence",
        bonuses: { defence: 3 },
        xp: { defence: 4, hitpoints: HP },
      },
      {
        id: "mixed",
        name: "Mixed",
        summary: "+1 Atk, Str, Def · +12% XP",
        bonuses: { attack: 1, strength: 1, defence: 1 },
        xpBoost: MIXED_XP_BOOST,
        xp: { attack: HP, strength: HP, defence: HP, hitpoints: HP },
      },
    ],
  },
  staff: {
    id: "staff",
    name: "Ash Staff",
    attackType: "magic",
    blurb: "Magic. Accuracy and damage both use your Magic level. Defensive also trains Defence.",
    bonuses: bonuses({ magic: 18, magicStrength: 16 }),
    styles: [
      {
        id: "accurate",
        name: "Accurate",
        summary: "+3 Magic accuracy",
        bonuses: { magicAccuracy: 3 },
        xp: { magic: 4, hitpoints: HP },
      },
      {
        id: "aggressive",
        name: "Aggressive",
        summary: "+3 Magic damage",
        bonuses: { magicStrength: 3 },
        xp: { magic: 4, hitpoints: HP },
      },
      {
        id: "defensive",
        name: "Defensive",
        summary: "+3 Defence",
        bonuses: { defence: 3 },
        xp: { magic: 2, defence: 2, hitpoints: HP },
      },
    ],
  },
  bow: {
    id: "bow",
    name: "Shortbow",
    attackType: "ranged",
    blurb: "Ranged. Rapid may shoot twice. Longrange trains Defence alongside Ranged.",
    bonuses: bonuses({ ranged: 18, rangedStrength: 10 }),
    styles: [
      {
        id: "accurate",
        name: "Accurate",
        summary: "+3 Ranged",
        bonuses: { ranged: 3, rangedStrength: 3 },
        xp: { ranged: 4, hitpoints: HP },
      },
      {
        id: "rapid",
        name: "Rapid",
        summary: "50% extra shot",
        bonuses: {},
        extraAttackChance: 0.5,
        xp: { ranged: 4, hitpoints: HP },
      },
      {
        id: "longrange",
        name: "Longrange",
        summary: "+3 Defence",
        bonuses: { defence: 3 },
        xp: { ranged: 2, defence: 2, hitpoints: HP },
      },
    ],
  },
};

function copyStyles(styles) {
  return styles.map((style) => ({
    ...style,
    bonuses: { ...(style.bonuses || {}) },
    xp: { ...style.xp },
  }));
}

WEAPONS["iron-sword"] = {
  id: "iron-sword",
  name: "Iron Sword",
  attackType: "melee",
  blurb: "A heavier blade. Same four sword styles, including Mixed. Needs Attack 5.",
  bonuses: bonuses({ attack: 30, strength: 26 }),
  styles: copyStyles(WEAPONS.sword.styles),
};

WEAPONS["iron-staff"] = {
  id: "iron-staff",
  name: "Iron Staff",
  attackType: "magic",
  blurb: "Iron-shod ash. Same staff styles. Needs Magic 5.",
  bonuses: bonuses({ magic: 30, magicStrength: 26 }),
  styles: copyStyles(WEAPONS.staff.styles),
};

WEAPONS["iron-bow"] = {
  id: "iron-bow",
  name: "Iron Shortbow",
  attackType: "ranged",
  blurb: "A stiffer bow. Same bow styles. Needs Ranged 5.",
  bonuses: bonuses({ ranged: 30, rangedStrength: 18 }),
  styles: copyStyles(WEAPONS.bow.styles),
};

WEAPONS.dagger = {
  id: "dagger",
  name: "Dagger",
  attackType: "melee",
  blurb: "The highwayman's knife. Aggressive sometimes strikes twice. No Mixed style.",
  bonuses: bonuses({ attack: 20, strength: 22 }),
  styles: copyStyles(WEAPONS.sword.styles.filter((style) => style.id !== "mixed")).map((style) =>
    style.id === "aggressive" ? { ...style, extraAttackChance: 0.25, summary: "+3 Strength, sometimes twice" } : style,
  ),
};

export const WEAPON_ORDER = ["sword", "staff", "bow"];

export function getWeapon(id) {
  return WEAPONS[id] || WEAPONS.sword;
}

export function getStyle(weapon, styleId) {
  return weapon.styles.find((style) => style.id === styleId) || weapon.styles[0];
}
