/**
 * Graphics preference. Separate from the combat save so abandoning
 * progress does not forget Standard vs Detailed.
 * The simulation never imports this module.
 */
const KEY = "duskmire-graphics-v1";

export function isLowEndScreen() {
  const narrow = typeof matchMedia === "function" && matchMedia("(max-width: 800px)").matches;
  const cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 8 : 8;
  const memory = typeof navigator !== "undefined" && navigator.deviceMemory ? navigator.deviceMemory : 8;
  return Boolean(narrow || cores <= 4 || memory <= 4);
}

/** First visit uses Standard. Narrow and low-core machines stay there until the player opts in. */
export function defaultGraphics() {
  return "standard";
}

export function loadGraphics() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === "standard" || raw === "detailed") return raw;
  } catch {
    /* private mode */
  }
  return defaultGraphics();
}

export function saveGraphics(id) {
  const value = id === "detailed" ? "detailed" : "standard";
  try {
    localStorage.setItem(KEY, value);
  } catch {
    /* the choice still applies for this visit */
  }
  return value;
}
