/**
 * Build profile for the clearing. Models and the scene read this while
 * they construct meshes, so setBuildQuality() before creating a world.
 * No DOM imports — safe if a test ever loads a model module.
 */

const PROFILES = {
  standard: {
    id: "standard",
    label: "Standard",
    capsule: [8, 24],
    sphere: [32, 24],
    lathe: 28,
    boxW: 26,
    boxH: 18,
    tubeSegments: 12,
    ringSegments: 24,
    terrain: 56,
    sky: [28, 18],
    shadow: 1024,
    shadowMobile: 512,
    textureSize: 0,
    fogNear: 16,
    fogFar: 34,
    pixelRatio: 1.5,
    pixelRatioMobile: 1.25,
    exposure: 1.12,
    hemi: 0.72,
    sun: 1.55,
    rim: 0.42,
    shadowRadius: 2.5,
  },
  detailed: {
    id: "detailed",
    label: "Detailed",
    capsule: [14, 36],
    sphere: [48, 36],
    lathe: 48,
    boxW: 40,
    boxH: 28,
    tubeSegments: 16,
    ringSegments: 48,
    terrain: 96,
    sky: [48, 32],
    shadow: 2048,
    shadowMobile: 1024,
    textureSize: 256,
    textureSizeMobile: 192,
    fogNear: 11,
    fogFar: 26,
    pixelRatio: 1.75,
    pixelRatioMobile: 1.25,
    exposure: 1.06,
    hemi: 0.58,
    sun: 1.68,
    rim: 0.5,
    fill: 0.32,
    shadowRadius: 3.5,
  },
};

let current = "standard";

export function setBuildQuality(id) {
  current = id === "detailed" ? "detailed" : "standard";
  return current;
}

export function buildQuality() {
  return current;
}

export function profile() {
  return PROFILES[current];
}

export function isDetailed() {
  return current === "detailed";
}

export function isNarrowScreen() {
  return typeof matchMedia === "function" && matchMedia("(max-width: 800px)").matches;
}

export function textureSize() {
  const spec = profile();
  if (!spec.textureSize) return 0;
  return isNarrowScreen() ? spec.textureSizeMobile || 256 : spec.textureSize;
}

export function shadowMapSize() {
  const spec = profile();
  return isNarrowScreen() ? spec.shadowMobile : spec.shadow;
}

export function pixelRatioCap() {
  const spec = profile();
  return isNarrowScreen() ? spec.pixelRatioMobile : spec.pixelRatio;
}
