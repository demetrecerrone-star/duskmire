# Duskmire

A solo fight on a dusk marsh road. One adventurer, four foes, three weapons, and the Old School RuneScape combat formulas — hit rolls, max hits, combat level, and the experience curve — played out in a smooth low-poly clearing.

There is no build step. The browser and the Node simulation import the same modules. Nothing under `js/` that the simulation imports touches the DOM.

## Run the fight in a browser

ES modules will not load from a `file://` URL in Chrome or Firefox, so serve the folder:

```bash
python3 -m http.server 8741
```

Then open [http://127.0.0.1:8741/](http://127.0.0.1:8741/).

`npm start` runs that same server. Any static file server works (`npx serve .`, and so on).

You start at a campfire on the marsh road. Click or tap the ground to walk (the path steps around tents, the cottage, and the gate). WASD or the arrow keys walk too. The camera follows from above: drag with the right mouse button, or drag a finger, to turn it; the wheel or a pinch zooms. Q and E turn it from the keyboard. Enemies wander inside their stretch of road. Hover or tap one to see its name and combat level. Click it and you walk up and enter the same turn-based fight as before — weapon, style, then Attack. A win puts you back on that spot with the hitpoints you had left. A loss wakes you at the campfire, healed. Hitpoints tick back by 1 every few seconds while you are walking. A foe you have not unlocked yet will not fight; the road says who to beat first. A beaten foe stands up again after a short rest. The corner map shows the road, north, and where you face. Combat level, hitpoints, and skills stay in the top bar. Position, experience, unlocked foes, and who is resting are stored in `localStorage` (`duskmire-save-v1`). Add `?seed=1` to the URL for a repeatable fight.

The layout stacks on a phone: the road on top, weapon, style, and the four places underneath. Tap to walk, drag to look, pinch to zoom.

## The road

West to east, in the order the foes unlock:

| Place | Foes | Combat level |
| --- | --- | --- |
| Campfire, then the goblin camp | 3 goblins | 2 |
| The farm, cottage and shed | 2 men | 4 |
| The town gate and watchtower | 2 guards | 8 |
| The wooded road | 2 highwaymen | 13 |

Trees, rocks, and fence posts sit off the path. The road itself stays walkable. Standard and Detailed both draw this same road; Detailed adds finer ground, grass tufts, and the same cloth and bark grain used in the clearing. Side by side works on the road and in a fight. Settings still live on the gear in the top bar.

## Run the simulation

```bash
node tools/simulate.js
node tools/nav.test.js
```

or:

```bash
npm test
```

`simulate.js` prints the starting combat level, max hit and hit chance for every weapon and style against the goblin, a 10,000-fight goblin sample, then the full enemy progression. `nav.test.js` checks the road grid, pathfinding around obstacles, zone order, locks, respawn timers, and hitpoint regen. Either script exits 1 if an assertion fails. The base seed is `20261027` (mulberry32, hashed per scenario).

## Formulas

Prayer is in the combat-level formula and defaults to 0. Duskmire has no Prayer skill yet.

**Experience** for a target level L (level 1 is 0 XP), capped at 99:

```
xp(L) = floor( sum_{i=1}^{L-1} floor(i + 300 * 2^(i/7)) / 4 )
```

**Combat level:**

```
base   = 0.25 * (Defence + Hitpoints + floor(Prayer / 2))
melee  = 0.325 * (Attack + Strength)
ranged = 0.325 * floor(Ranged * 3 / 2)
magic  = 0.325 * floor(Magic * 3 / 2)
level  = floor(base + max(melee, ranged, magic))
```

Only the highest style is added, so a pure mage or ranger is not punished for empty melee stats. The starter (Attack 1, Strength 1, Defence 1, Hitpoints 10, Magic 1, Ranged 1) is combat level 3: base 2.75, melee 0.65, magic and ranged 0.325, `floor(3.4) = 3`. A 99-all character including Prayer is 126. Magic 99 or Ranged 99 with melee 1s is combat level 50.

**Effective levels** (no potions, no prayers). Every fighter gets +8. Players add a stance bonus. NPCs have no stance.

```
effectiveAccuracy = accuracySkill + stance + 8
effectiveStrength = damageSkill   + stance + 8
effectiveDefence  = Defence       + stance + 8
```

The accuracy skill is Attack, Magic, or Ranged, matching the weapon. The damage skill is Strength, Magic, or Ranged. Defence is the only defensive stat — there is no separate Magic defence — so training Defence helps against every foe.

**Rolls:**

```
attackRoll  = effectiveAccuracy * (attackBonus + 64)
defenceRoll = effectiveDefence  * (defenceBonus + 64)
```

Magic uses the staff's magic attack bonus. Ranged uses the bow's ranged attack bonus. The matching damage bonus is the sword's strength, the staff's magic strength, or the bow's ranged strength.

**Hit chance:**

```
if attackRoll > defenceRoll:
  1 - (defenceRoll + 2) / (2 * (attackRoll + 1))
else:
  attackRoll / (2 * (defenceRoll + 1))
```

**Max hit:**

```
floor( (effectiveStrength * (strengthBonus + 64) + 320) / 640 )
```

That is the integer form of `floor(0.5 + effectiveStrength * (strengthBonus + 64) / 640)`.

On a successful accuracy roll, damage is a uniform integer from 0 through the max hit. A 0 is a glance. A failed accuracy roll is a miss. Damage is capped at the target's remaining hitpoints, and experience uses that actual damage (no overkill XP).

**Experience per point of damage:** 4 to the style skill, or 2 and 2 when a style shares, and 4/3 to Hitpoints. Sword Mixed divides that 4 evenly into Attack, Strength, and Defence (4/3 each), still grants 4/3 Hitpoints, then multiplies every skill it trains — Hitpoints included — by 1.12. The only definition of that bonus is `MIXED_XP_BOOST` in `js/weapons.js`. No other style is boosted.

A win also grants the foe's **victory pool**, a neutral number with no skill attached. It is split by the same style rates: each combat skill receives `pool * rate / combatWeight`, and Hitpoints receives `pool * hitpointsRate / combatWeight`. Mixed multiplies that bonus by 1.12 as well. Overkill still grants nothing. A loss grants nothing. The foe never chooses the skill.

One round is the player's swing (Rapid may add a second shot) and then the foe's reply if they are still up. The highwayman replies twice.

## Tuning

Bonuses are chosen so a level-3 adventurer meets the goblin targets. They are not copied from Old School item tables; real bronze is less accurate than this sword, and a level 1 would miss too often for the lesson.

Goblin: Attack 1, Strength 1, Defence 1, Hitpoints 5, all bonuses 0. Effective defence 9, defence roll 576. Combat level **2**.

Bronze sword: attack bonus +18, strength bonus +16.

| Style | Effective attack | Attack roll | Hit chance | Max hit |
| --- | --- | --- | --- | --- |
| Accurate (+3 Attack) | 12 | 984 | 70.7% | 1 |
| Aggressive (+3 Strength) | 9 | 738 | 60.9% | 2 |
| Defensive (+3 Defence) | 9 | 738 | 60.9% | 1 |

Accurate damage is only 0 or 1, and the goblin has 5 hitpoints, so a kill is exactly 5 damaging hits. In 10,000 fights (seed base 20261027) Sword / Accurate won **99.2%**, in **5.00** damaging hits, **14.08** swings, taking **3.27** damage, for **20.0 Attack** and **6.7 Hitpoints** XP.

The staff uses the same +18 / +16 numbers on Magic, so at level 1 it matches the sword. The bow uses +18 ranged attack and +10 ranged strength, so every bow style also maxes at 1. Accurate hit chance is 70.7% on all three weapons. Rapid is a 50% chance of a second shot before the foe answers (expected 1.5 shots), which is the extra attack speed rather than a full double round.

## Weapons

| Weapon | Type | Accuracy bonus | Damage bonus | Styles | XP per damage |
| --- | --- | --- | --- | --- | --- |
| Bronze Sword | Melee | attack +18 | strength +16 | Accurate +3 Attack; Aggressive +3 Strength; Defensive +3 Defence; Mixed +1 Attack, Strength, and Defence | 4 Attack, or 4 Strength, or 4 Defence, or 4/3 of each, plus 4/3 Hitpoints. Mixed then ×1.12 on all four |
| Ash Staff | Magic | magic +18 | magic strength +16 | Accurate +3 Magic accuracy; Aggressive +3 Magic damage; Defensive +3 Defence | 4 Magic, or 4 Magic, or 2 Magic and 2 Defence, plus 4/3 Hitpoints |
| Shortbow | Ranged | ranged +18 | ranged strength +10 | Accurate +3 Ranged (accuracy and damage); Rapid 50% extra shot; Longrange +3 Defence | 4 Ranged, or 4 Ranged, or 2 Ranged and 2 Defence, plus 4/3 Hitpoints |

Attack is Sword Accurate. Strength is Sword Aggressive. Defence is Sword Defensive, and also the shared half of Staff Defensive and Bow Longrange, and a third of Mixed. Magic is any staff style. Ranged is any bow style. Hitpoints comes from every point of damage, and from a victory pool. Mixed is sword-only.

## Enemies

Order is fixed. Beating one unlocks the next. Combat level uses the same formula. The victory pool is on top of damage XP and only if you win. It is not a skill reward: Sword Accurate on the man pays Attack, Sword Aggressive on the same man pays Strength, Staff Accurate pays Magic, Mixed pays Attack, Strength, and Defence.

| Order | Foe | Levels Atk/Str/Def/HP | Bonuses Atk/Str/Def | Speed | CL | Suggested lesson | Victory pool |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Goblin | 1/1/1/5 | +0/+0/+0 | 1 | 2 | CL 3, any style | 0 |
| 2 | Man | 4/3/2/8 | +6/+2/+3 | 1 | 4 | CL 5, Sword Accurate | 15 |
| 3 | Guard | 7/7/6/10 | +10/+12/+16 | 1 | 8 | CL 8, train Defence first | 25 |
| 4 | Highwayman | 16/14/4/9 | +22/+12/+0 | 2 | 13 | CL 18, Sword Aggressive | 25 |

Victory pool, after the style split. Hitpoints is included. Mixed figures already include the 12% bonus.

| Foe | Sword Accurate | Sword Aggressive | Sword Defensive | Sword Mixed | Staff Defensive | Bow Longrange |
| --- | --- | --- | --- | --- | --- | --- |
| Goblin | none | none | none | none | none | none |
| Man | 15 Attack, 5 HP | 15 Strength, 5 HP | 15 Defence, 5 HP | 5.60 each of Attack, Strength, Defence, HP | 7.5 Magic, 7.5 Defence, 5 HP | 7.5 Ranged, 7.5 Defence, 5 HP |
| Guard | 25 Attack, 8.33 HP | 25 Strength, 8.33 HP | 25 Defence, 8.33 HP | 9.33 each of Attack, Strength, Defence, HP | 12.5 Magic, 12.5 Defence, 8.33 HP | 12.5 Ranged, 12.5 Defence, 8.33 HP |
| Highwayman | 25 Attack, 8.33 HP | 25 Strength, 8.33 HP | 25 Defence, 8.33 HP | 9.33 each of Attack, Strength, Defence, HP | 12.5 Magic, 12.5 Defence, 8.33 HP | 12.5 Ranged, 12.5 Defence, 8.33 HP |

Staff Accurate and Aggressive pay the same single-skill split as Sword Accurate, into Magic. Bow Accurate and Rapid pay it into Ranged. `node tools/simulate.js` prints the full matrix.

Pressure for a level-3 Sword Accurate fighter (rounds to kill divided by rounds to die) rises 0.35 → 0.80 → 3.37 → 7.62. Win rates in 4,000 fights: Goblin 99.2%, Man 74.0%, Guard 0.2%, Highwayman 0.0%. The highwayman does not win more often; he simply ends it sooner (expected time-to-die 3.88 rounds versus the guard's 13.52).

The guard is the Defence lesson. Same Attack 10, Strength 10, Hitpoints 15, Sword Accurate, 4,000 fights:

| Defence | Guard's hit chance | Guard damage / round | Win rate | Damage taken |
| --- | --- | --- | --- | --- |
| 1 | 74.0% | 0.74 | 81.9% | 9.97 |
| 10 | 48.1% | 0.48 | 96.1% | 6.91 |

A mid-level Sword fighter (10/10/10/15, combat level 12) wins the guard 96.9% of the time and the highwayman 15.8%. Aggressive at that level maxes at 3 instead of 2 and is expected to kill the highwayman in 8.12 rounds rather than 11.59, winning 45.0% against Accurate's 16.6%.

## Gear and loot

The pack is 28 slots. You start with a bronze sword equipped and an ash staff and shortbow in the bag. Equip a weapon from the pack and its styles follow it, including Mixed on swords. Iron weapons need level 5 in the matching skill. Iron armour needs Defence 5. Bread, cooked meat, and trout heal 4, 6, and 8. Eating in a fight spends the turn and the foe still answers. Coins stack. A win leaves a pile on the road; click it to pick it up. Old saves gain the bronze weapons and keep their experience. Gear bonuses are added to the weapon bonuses the combat formulas already use. `node tools/items.test.js` checks drops, requirements, and a bronze-versus-iron report.

## Graphics

The **Settings** button (gear) sits in the top bar. Standard and Detailed apply immediately: the clearing rebuilds in place and the fight, weapon, and hitpoints stay put. The choice is stored in `localStorage` under `duskmire-graphics-v1`, separate from the combat save. A first visit uses Standard. Narrow screens and machines with few cores stay on Standard until you opt in, and the panel says so.

**Compare side by side** splits the same clearing into Standard and Detailed (left/right, or top/bottom when the stage is narrow). Close it from the stage or from Settings. The fight underneath does not reset.

Detailed is still smooth and rounded. It adds finer capsules, spheres, lathes, and terrain; ears, hair, belts, fingers, goblin teeth, guard rivets and a plume, a highwayman strap; grass tufts, extra rocks and bushes; procedural canvas textures for ground, wood, cloth, metal, leather, skin, and hair (detail, roughness, normal, and an ambient-occlusion tint — nothing loaded from disk); a larger soft shadow map (2048, or 1024 on a narrow screen); a closer fog; and a fill light. Standard keeps the lighter meshes and the 1024/512 shadow map.

## Art

Smooth RuneScape 3-style models, not flat-shaded blocks. Bodies are capsules and spheres with enough segments to read as round. Armour, shields, blades, and the highwayman's mask are superellipsoids (`createRoundedBox` in `js/geometries.js`). Coats, the cloak, and the guard's helm are lathes. Terrain is a 56×56 plane with a smoothstep falloff so the clearing stays flat and the ground only rolls at the edges; normals are recomputed, so the shading stays soft.

Lighting is a hemisphere light, a warm directional sun with a soft shadow map, and a cool rim light. The renderer uses antialiasing, ACES filmic tone mapping, and a pixel ratio cap of 1.5 (1.25 on narrow screens). Shadow maps are 1024, or 512 on small screens.

| Concern | File |
| --- | --- |
| Palette (CSS variables and Three colors) | `js/palette.js`, applied at startup; `css/style.css` repeats the same hex values |
| Character and weapon meshes | `js/models.js` |
| Rounded-box and lathe geometry | `js/geometries.js` |
| Clearing, camera, lights, hit animation, splats | `js/scene.js` |
| Road grid, pathfinding, spawns, locks, respawn, regen | `js/nav.js` |
| Overworld meshes, click-to-move, follow camera, minimap | `js/overworld.js` |
| Panels, hitpoints, log | `css/style.css`, `js/ui.js` |

Three.js **r170** (MIT) is vendored at `vendor/three.module.js` and imported by relative path. No CDN and no import map. License: `vendor/THREE-LICENSE.txt`.

## Layout

```
index.html
package.json
css/style.css
js/palette.js
js/rng.js
js/skills.js
js/combat.js
js/weapons.js
js/enemies.js
js/entities.js
js/save.js
js/graphics.js
js/quality.js
js/textures.js
js/geometries.js
js/models.js
js/scene.js
js/nav.js
js/items.js
js/overworld.js
js/ui.js
js/main.js
tools/simulate.js
tools/nav.test.js
tools/items.test.js
vendor/three.module.js
vendor/THREE-LICENSE.txt
```
