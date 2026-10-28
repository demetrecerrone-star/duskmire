/**
 * DOM for the camp screen, the fight panel, and the result card.
 * Combat numbers arrive already computed; this file does not roll dice.
 */
import { SKILLS, SKILL_LABELS, SKILL_SHORT, combatBreakdown, xpProgress } from "./skills.js";
import { ENEMIES, isUnlocked } from "./enemies.js";
import { getWeapon } from "./weapons.js";
import { isLowEndScreen } from "./graphics.js";
import { EQUIP_SLOTS, getItem, meetsRequirements, requirementText } from "./items.js";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function plate(node, name, hp, max, detail) {
  node.replaceChildren();
  const head = el("header");
  head.append(el("strong", null, name), el("span", null, detail));
  const bar = el("div", hp / max <= 0.35 ? "hp low" : "hp");
  const fill = el("span");
  fill.style.width = `${Math.max(0, Math.min(100, (hp / Math.max(1, max)) * 100))}%`;
  bar.append(fill);
  node.append(head, bar);
}

export function mountUi(handlers) {
  const skillsRoot = document.getElementById("skills");
  const badge = document.getElementById("combat-badge");
  const packRoot = document.getElementById("pack");
  const zonesRoot = document.getElementById("zones");
  const selectScreen = document.getElementById("select-screen");
  const fightScreen = document.getElementById("fight-screen");
  const result = document.getElementById("result");
  const platePlayer = document.getElementById("plate-player");
  const plateEnemy = document.getElementById("plate-enemy");
  const stageError = document.getElementById("stage-error");
  const settingsPanel = document.getElementById("settings-panel");
  const settingsToggle = document.getElementById("settings-toggle");
  const compareChrome = document.getElementById("compare-chrome");
  const compareClose = document.getElementById("compare-close");
  let graphicsState = { graphics: "standard", compare: false };
  let hintTimer = 0;
  const app = document.getElementById("app");
  const tabbar = document.getElementById("tabbar");
  const panelBody = document.getElementById("panel-body");
  let currentScreen = null;

  /** Phone layout: one panel at a time under the view. Desktop CSS ignores the tab. */
  function setTab(name) {
    if (!app) return;
    app.dataset.tab = name;
    for (const button of tabbar?.querySelectorAll("[data-tab]") || []) {
      button.setAttribute("aria-selected", button.dataset.tab === name ? "true" : "false");
    }
    if (panelBody) panelBody.scrollTop = 0;
  }
  for (const button of tabbar?.querySelectorAll("[data-tab]") || []) {
    button.addEventListener("click", () => setTab(button.dataset.tab));
  }

  const fight = {
    weapons: el("div", "weapon-row"),
    styles: el("div", "style-row"),
    preview: el("p", "preview"),
    attack: el("button", "attack", "Attack"),
    hint: el("p", "key-hint", "Space attacks. Keys 1–3 change style."),
    leave: el("button", "ghost", "Step back"),
    log: el("div", "log"),
  };
  fight.attack.type = "button";
  fight.leave.type = "button";
  const actions = el("div", "id-unused");
  actions.id = "fight-actions";
  actions.append(fight.leave);
  fightScreen.append(fight.weapons, fight.styles, fight.preview, fight.attack, fight.hint, actions, fight.log);

  fight.attack.addEventListener("click", () => handlers.onAttack());
  fight.leave.addEventListener("click", () => handlers.onLeave());

  function renderSkills(player) {
    skillsRoot.replaceChildren();
    for (const skill of SKILLS) {
      const progress = xpProgress(player.xp[skill] || 0);
      const chip = el("div", "skill");
      chip.append(el("small", null, SKILL_SHORT[skill]), el("b", null, String(player.skills[skill])));
      const track = document.createElement("i");
      const fill = el("span");
      fill.style.width = `${Math.round(progress.ratio * 100)}%`;
      track.append(fill);
      chip.append(track);
      chip.title = `${SKILL_LABELS[skill]} ${player.skills[skill]} — ${Math.floor(player.xp[skill] || 0)} XP`;
      skillsRoot.append(chip);
    }
    const breakdown = combatBreakdown(player.skills);
    badge.replaceChildren(el("strong", null, String(breakdown.combat)), el("span", null, breakdown.style));
  }

  function renderSelect(model) {
    selectScreen.replaceChildren();
    selectScreen.append(
      el(
        "p",
        "lede",
        "The road is closed, so the clearing will have to do. Equip a weapon from the pack, then choose a foe.",
      ),
    );
    const weapon = getWeapon(model.weaponId);
    const styles = el("div", "style-row");
    for (const style of weapon.styles) {
      const button = el("button");
      button.type = "button";
      button.append(el("strong", null, style.name), el("small", null, style.summary));
      button.setAttribute("aria-pressed", style.id === model.styleId ? "true" : "false");
      button.addEventListener("click", () => handlers.onStyle(style.id));
      styles.append(button);
    }
    const fightButton = el("button", "attack", `Fight the ${model.enemyName || "Goblin"}`);
    fightButton.type = "button";
    fightButton.addEventListener("click", () => handlers.onFight());
    selectScreen.append(styles, el("p", "preview", model.preview), fightButton);

    const list = el("div", "enemy-list");
    for (const enemy of ENEMIES) {
      const unlocked = isUnlocked(enemy, model.defeated);
      const card = el("button", "enemy-card");
      card.type = "button";
      if (enemy.id === model.enemyId) card.classList.add("selected");
      if (!unlocked) card.classList.add("locked");
      card.disabled = !unlocked;
      const title = el("h2", null, enemy.name);
      const meta = el(
        "p",
        "meta",
        `Combat ${enemy.combatLevel} · ${enemy.levels.hitpoints} HP · Atk ${enemy.levels.attack} Str ${enemy.levels.strength} Def ${enemy.levels.defence}`,
      );
      const flavor = el("p", "flavor", enemy.flavor);
      const lesson = el("p", "lesson", enemy.training.summary);
      card.append(title, meta, flavor, lesson);
      const foot = el("div", "card-foot");
      const beaten = model.defeated.includes(enemy.id);
      foot.append(
        el(
          "span",
          "tag",
          !unlocked ? `Locked · defeat the ${enemy.unlockAfter}` : beaten ? "Defeated" : `Suggested level ${enemy.training.recommendedCombatLevel}`,
        ),
      );
      card.append(foot);
      card.addEventListener("click", () => {
        if (unlocked) handlers.onEnemy(enemy.id);
      });
      list.append(card);
    }
    const reset = el("button", "linkish", "Abandon saved progress");
    reset.type = "button";
    reset.addEventListener("click", () => handlers.onReset());
    selectScreen.append(list, reset);
  }

  function renderWorld(model) {
    selectScreen.replaceChildren();
    selectScreen.append(
      el(
        "p",
        "lede",
        "The marsh road runs east: goblin camp, a farm, the town gate, then the wood. Tap the ground to walk, or tap a foe to fight. Drag to turn the view, scroll or pinch to zoom.",
      ),
    );
    const weapon = getWeapon(model.weaponId);
    const styles = el("div", "style-row");
    for (const style of weapon.styles) {
      const button = el("button");
      button.type = "button";
      button.append(el("strong", null, style.name), el("small", null, style.summary));
      button.setAttribute("aria-pressed", style.id === model.styleId ? "true" : "false");
      button.addEventListener("click", () => handlers.onStyle(style.id));
      styles.append(button);
    }
    selectScreen.append(el("p", "equipped", `Wielding ${weapon.name}.`), styles, el("p", "preview", model.preview));
    const list = el("div", "zone-list");
    zonesRoot?.replaceChildren(el("h2", "zones-title", "Zones · tap one to travel"), list);
    for (const zone of model.zones || []) {
      const card = el("button", "zone-card");
      card.type = "button";
      if (zone.here) card.classList.add("here");
      if (!zone.unlocked) card.classList.add("locked");
      card.append(el("strong", null, zone.name));
      const status = !zone.unlocked
        ? `Locked · defeat the ${zone.unlockAfter}`
        : zone.alive
          ? `${zone.foe} · combat ${zone.combatLevel} · ${zone.alive} on the road`
          : `${zone.foe} · combat ${zone.combatLevel} · catching their breath`;
      card.append(el("small", null, status));
      card.addEventListener("click", () => handlers.onZone?.(zone.enemyId));
      list.append(card);
    }
    const reset = el("button", "linkish", "Abandon saved progress");
    reset.type = "button";
    reset.addEventListener("click", () => handlers.onReset());
    const touch = el("p", "key-hint touch-hint", "On a phone: tap the ground to walk, tap a foe to fight. Drag one finger to turn and tilt, pinch to zoom, twist two fingers to turn.");
    const keys = el("p", "key-hint", "WASD or arrows walk. Q and E turn the camera. Right-drag looks. Click a foe to approach.");
    if (!zonesRoot) selectScreen.append(list);
    selectScreen.append(touch, keys, reset);
  }

  function renderFightChrome(model) {
    const weapon = getWeapon(model.weaponId);
    fight.weapons.replaceChildren(el("p", "equipped", `Wielding ${weapon.name}.`));
    fight.styles.replaceChildren();
    weapon.styles.forEach((style, index) => {
      const button = el("button");
      button.type = "button";
      button.append(el("strong", null, style.name), el("small", null, style.summary));
      button.setAttribute("aria-pressed", style.id === model.styleId ? "true" : "false");
      button.disabled = model.busy;
      button.addEventListener("click", () => handlers.onStyle(style.id));
      button.dataset.key = String(index + 1);
      fight.styles.append(button);
    });
    fight.preview.textContent = model.preview;
    fight.attack.disabled = model.busy || model.over;
    fight.attack.textContent = model.busy ? "Swinging…" : "Attack";
    fight.hint.textContent = `Space attacks. Keys 1–${weapon.styles.length} change style. Eat from the pack to spend the turn healing.`;
  }

  const SLOT_LABEL = {
    head: "Head",
    body: "Body",
    legs: "Legs",
    shield: "Shield",
    gloves: "Gloves",
    boots: "Boots",
    weapon: "Weapon",
  };

  function renderPack(model) {
    if (!packRoot) return;
    packRoot.replaceChildren();
    packRoot.append(el("h2", "pack-title", "Pack"));
    const board = el("div", "equip-board");
    const figure = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    figure.setAttribute("viewBox", "0 0 120 200");
    figure.setAttribute("class", "silhouette");
    figure.setAttribute("aria-hidden", "true");
    figure.innerHTML =
      '<path fill="currentColor" d="M60 18c12 0 20 10 20 22s-8 20-20 20-20-8-20-20 8-22 20-22zm-22 48c-8 6-16 18-16 32v28c0 4 4 8 8 8h8l4 48h12l4-36h4l4 36h12l4-48h8c4 0 8-4 8-8v-28c0-14-8-26-16-32-6 8-16 12-24 12s-18-4-24-12z"/>';
    board.append(figure);
    const slots = el("div", "equip-slots");
    for (const slot of EQUIP_SLOTS) {
      const button = el("button", `equip-slot slot-${slot}`);
      button.type = "button";
      const worn = getItem(model.equipment?.[slot]);
      button.append(el("small", null, SLOT_LABEL[slot]), el("strong", null, worn ? worn.name : "Empty"));
      button.addEventListener("click", () => handlers.onUnequip?.(slot));
      slots.append(button);
    }
    board.append(slots);
    const totals = model.bonuses || {};
    const bits = [
      ["Atk", totals.attack],
      ["Str", totals.strength],
      ["Def", totals.defence],
      ["Mag", totals.magic],
      ["Rng", totals.ranged],
    ]
      .filter(([, value]) => value)
      .map(([label, value]) => `${label} +${value}`);
    const gearPart = el("div", "pack-gear");
    gearPart.append(board, el("p", "bonus-line", bits.length ? bits.join(" · ") : "No gear bonuses yet."));
    const invPart = el("div", "pack-inv");
    packRoot.append(gearPart, invPart);

    const grid = el("div", "inv-grid");
    const slotsModel = model.inventory || [];
    for (let index = 0; index < 28; index += 1) {
      const raw = slotsModel[index];
      const item = raw ? getItem(raw.itemId) : null;
      const button = el("button", "inv-slot");
      button.type = "button";
      if (index === model.selectedIndex) button.classList.add("selected");
      if (!item) {
        button.append(el("span", "inv-empty", ""));
        button.disabled = true;
      } else {
        const qty = raw.qty > 1 ? ` ×${raw.qty}` : "";
        const note = item.kind === "gear" && !meetsRequirements(item, model.skills) ? `Needs ${requirementText(item)}` : item.blurb;
        button.append(el("strong", null, `${item.name}${qty}`));
        button.title = note || item.name;
        button.addEventListener("click", () => handlers.onSelectItem?.(index));
      }
      grid.append(button);
    }
    invPart.append(grid);
    const actions = el("div", "pack-actions");
    const selectedRaw = model.selectedIndex != null ? slotsModel[model.selectedIndex] : null;
    const selected = selectedRaw ? getItem(selectedRaw.itemId) : null;
    if (selected) {
      const canEquip = selected.kind === "gear" && meetsRequirements(selected, model.skills);
      if (selected.kind === "gear") {
        const equip = el("button", null, canEquip ? "Equip" : "Too soon");
        equip.type = "button";
        equip.disabled = !canEquip || model.busy;
        equip.addEventListener("click", () => handlers.onEquip?.(model.selectedIndex));
        actions.append(equip);
      }
      if (selected.kind === "food") {
        const eat = el("button", null, model.screen === "fight" ? `Eat (${selected.heal} HP, spends the turn)` : `Eat (+${selected.heal} HP)`);
        eat.type = "button";
        eat.disabled = model.busy;
        eat.addEventListener("click", () => handlers.onEat?.(model.selectedIndex));
        actions.append(eat);
      }
      const drop = el("button", "ghost", "Drop");
      drop.type = "button";
      drop.disabled = model.busy;
      drop.addEventListener("click", () => handlers.onDrop?.(model.selectedIndex));
      actions.append(drop);
      const note = selected.kind === "gear" && !canEquip ? `Needs ${requirementText(selected)}.` : selected.blurb;
      if (note) actions.append(el("p", "pack-note", note));
    } else {
      actions.append(el("p", "pack-note", "Tap a slot to equip, eat, or drop it. Coins stack."));
    }
    invPart.append(actions);
  }

  function setPlates(playerPlate, enemyPlate) {
    plate(platePlayer, playerPlate.name, playerPlate.hp, playerPlate.max, playerPlate.detail);
    plate(plateEnemy, enemyPlate.name, enemyPlate.hp, enemyPlate.max, enemyPlate.detail);
  }

  function appendLog(text, kind) {
    const line = el("p", kind || "info", text);
    fight.log.append(line);
    while (fight.log.children.length > 80) fight.log.firstChild.remove();
    fight.log.scrollTop = fight.log.scrollHeight;
  }

  function showResult(payload) {
    result.hidden = false;
    result.replaceChildren();
    const card = el("div", "result-card");
    const styleLine = payload.weapon && payload.style ? `${payload.weapon.name} · ${payload.style.name}. ` : "";
    card.append(
      el("h2", null, payload.victory ? `${payload.enemy.name} goes down.` : "You drop into the grass."),
      el(
        "p",
        null,
        payload.victory
          ? `${styleLine}You keep ${payload.hp} hitpoints. Experience follows the style you fought with, not the foe.`
          : payload.road
            ? "No experience from a loss. You wake at the campfire with your hitpoints restored."
            : "No experience from a loss. Catch your breath and try the exchange again.",
      ),
    );
    if (payload.victory && payload.style?.xpBoost) {
      const percent = Math.round(payload.style.xpBoost * 100);
      card.append(
        el(
          "p",
          "boost-note",
          `Mixed bonus +${percent}% on every skill that style trains, including Hitpoints.`,
        ),
      );
    }
    if (payload.victory) {
      const gains = el("ul", "xp-list");
      for (const skill of SKILLS) {
        const amount = payload.xp[skill] || 0;
        if (amount <= 0) continue;
        gains.append(el("li", null, `${SKILL_LABELS[skill]} +${amount.toFixed(1)} XP`));
      }
      if (!gains.childElementCount) gains.append(el("li", null, "No experience this exchange."));
      card.append(gains);
      if (payload.levelUps.length) {
        const ups = el("ul", "level-list");
        for (const up of payload.levelUps) {
          ups.append(el("li", null, `Your ${SKILL_LABELS[up.skill]} level is now ${up.to}.`));
        }
        card.append(ups);
      }
    }
    const row = el("div", "row-actions");
    const again = el("button", "attack", "Fight again");
    again.type = "button";
    again.addEventListener("click", () => handlers.onAgain());
    row.append(again);
    if (payload.victory && payload.nextId && payload.nextUnlocked) {
      const next = el("button", null, "Next foe");
      next.type = "button";
      next.addEventListener("click", () => handlers.onNext());
      row.append(next);
    }
    const back = el("button", null, payload.road ? "Back to the road" : "Choose a foe");
    back.type = "button";
    back.addEventListener("click", () => handlers.onLeave());
    row.append(back);
    card.append(row);
    result.append(card);
  }

  function setSettingsOpen(open) {
    settingsPanel.hidden = !open;
    settingsToggle.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) renderSettings();
  }

  function renderSettings() {
    settingsPanel.replaceChildren();
    settingsPanel.append(
      el("h2", null, "Graphics"),
      el(
        "p",
        null,
        "Standard is the smooth marsh. Detailed keeps those same rounded shapes and adds finer curves, cloth and metal grain, grass, armour trim, and softer light. It costs more, so a narrow or low-core screen starts on Standard. Side by side shows both at once; the choice here is what you return to.",
      ),
    );
    if (isLowEndScreen() && graphicsState.graphics === "standard") {
      settingsPanel.append(el("p", "settings-note", "This screen is on Standard so the fight stays smooth."));
    }
    const row = el("div", "graphics-row");
    for (const mode of [
      ["standard", "Standard"],
      ["detailed", "Detailed"],
    ]) {
      const button = el("button", null, mode[1]);
      button.type = "button";
      button.setAttribute("aria-pressed", graphicsState.graphics === mode[0] ? "true" : "false");
      button.addEventListener("click", () => handlers.onGraphics(mode[0]));
      row.append(button);
    }
    const compare = el("button", null, graphicsState.compare ? "Close side-by-side" : "Compare side by side");
    compare.type = "button";
    compare.addEventListener("click", () => handlers.onCompare());
    const close = el("button", "ghost", "Close");
    close.type = "button";
    close.addEventListener("click", () => setSettingsOpen(false));
    settingsPanel.append(row, compare, close);
  }

  settingsToggle.addEventListener("click", () => setSettingsOpen(settingsPanel.hidden));
  compareClose.addEventListener("click", () => {
    if (graphicsState.compare) handlers.onCompare();
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !settingsPanel.hidden) setSettingsOpen(false);
  });

  function setGraphics(graphics, compare) {
    graphicsState = { graphics, compare: Boolean(compare) };
    compareChrome.hidden = !graphicsState.compare;
    document.body.dataset.graphics = graphicsState.compare ? "compare" : graphicsState.graphics;
    if (graphicsState.compare) settingsPanel.hidden = true;
    settingsToggle.setAttribute("aria-expanded", settingsPanel.hidden ? "false" : "true");
    if (!settingsPanel.hidden) renderSettings();
  }

  return {
    renderSkills,
    renderSelect,
    renderWorld,
    renderFightChrome,
    renderPack,
    setGraphics,
    setPlates,
    appendLog,
    clearLog() {
      fight.log.replaceChildren();
    },
    showResult,
    hideResult() {
      result.hidden = true;
      result.replaceChildren();
    },
    showHint(text) {
      const node = document.getElementById("road-hint");
      if (!node) return;
      window.clearTimeout(hintTimer);
      if (!text) {
        node.hidden = true;
        return;
      }
      node.hidden = false;
      node.textContent = text;
      hintTimer = window.setTimeout(() => {
        node.hidden = true;
      }, 3400);
    },
    showNameplate(info) {
      const node = document.getElementById("nameplate");
      if (!node) return;
      if (!info) {
        node.hidden = true;
        return;
      }
      node.hidden = false;
      node.textContent = info.text;
      node.style.left = `${info.x}px`;
      node.style.top = `${info.y}px`;
    },
    setScreen(name) {
      if (name !== currentScreen) {
        if (name === "fight") setTab("play");
        currentScreen = name;
      }
      const playTab = document.getElementById("tab-play");
      if (playTab) playTab.textContent = name === "fight" ? "Fight" : name === "world" ? "Road" : "Foes";
      selectScreen.hidden = name === "fight";
      if (zonesRoot) zonesRoot.hidden = name !== "world";
      fightScreen.hidden = name !== "fight";
      const layout = document.getElementById("layout");
      layout.classList.toggle("fighting", name === "fight");
      layout.classList.toggle("world", name === "world");
      const minimap = document.getElementById("minimap");
      if (minimap) minimap.hidden = name === "fight";
      if (name === "fight") {
        document.getElementById("road-hint").hidden = true;
        document.getElementById("nameplate").hidden = true;
      }
    },
    setError(message) {
      if (!message) {
        stageError.hidden = true;
        return;
      }
      stageError.hidden = false;
      stageError.textContent = message;
    },
    styleCount() {
      return fight.styles.children.length;
    },
  };
}

export function formatPreview(weapon, style, strike) {
  const pct = (strike.hitChance * 100).toFixed(1);
  return `${weapon.name} · ${style.name} — ${pct}% chance to hit, max hit ${strike.maxHit}.`;
}
