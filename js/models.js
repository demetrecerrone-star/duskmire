/**
 * Smooth low-poly characters and weapons built from capsules, spheres,
 * lathes, and superellipsoids. No external meshes.
 */
import {
  CapsuleGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
  CylinderGeometry,
} from "../vendor/three.module.js";
import { cloakProfile, createLathe, createRoundedBox, helmetProfile, tunicProfile } from "./geometries.js";
import { palette as colors } from "./palette.js";
import { isDetailed, profile } from "./quality.js";
import { applyMaps, stampAoUv } from "./textures.js";

function material(color, params = {}) {
  const mat = new MeshStandardMaterial({
    color,
    roughness: params.roughness ?? 0.78,
    metalness: params.metalness ?? 0.03,
    emissive: params.emissive ?? 0x000000,
    emissiveIntensity: params.emissiveIntensity ?? 0,
  });
  if (isDetailed()) {
    const kind =
      params.texture || ((params.metalness ?? 0) >= 0.25 ? "metal" : (params.roughness ?? 0.8) < 0.65 ? "skin" : "cloth");
    applyMaps(mat, kind);
  }
  mat.userData.baseEmissive = mat.emissive.clone();
  mat.userData.baseIntensity = mat.emissiveIntensity;
  return mat;
}

function capsule(radius, length) {
  const [cap, radial] = profile().capsule;
  return new CapsuleGeometry(radius, length, cap, radial);
}

function sphere(radius) {
  const [width, height] = profile().sphere;
  return new SphereGeometry(radius, width, height);
}

function rounded(width, height, depth, exponent = 3.4) {
  const spec = profile();
  return createRoundedBox(width, height, depth, exponent, spec.boxW, spec.boxH);
}

function lathe(points) {
  return createLathe(points, profile().lathe);
}

function torus(radius, tube, arc) {
  const spec = profile();
  return new TorusGeometry(radius, tube, spec.tubeSegments, spec.ringSegments, arc);
}

function add(group, geometry, mat, x, y, z, materials) {
  if (isDetailed()) stampAoUv(geometry);
  const mesh = new Mesh(geometry, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  if (materials && !materials.includes(mat)) materials.push(mat);
  return mesh;
}

function addFingers(hand, skin, materials, scale = 1) {
  if (!isDetailed()) return;
  for (let i = 0; i < 4; i += 1) {
    const finger = add(
      hand,
      capsule(0.012 * scale, 0.05 * scale),
      skin,
      (i - 1.5) * 0.018 * scale,
      -0.045 * scale,
      0.02 * scale,
      materials,
    );
    finger.rotation.x = 0.55;
  }
}

function armPivot(group, side, skin, shoulderY, reach, materials) {
  const pivot = new Group();
  pivot.position.set(side * 0.28, shoulderY, 0);
  const limb = add(pivot, capsule(0.06, 0.26), skin, 0, -0.2, 0, materials);
  limb.castShadow = true;
  const hand = new Group();
  hand.position.set(0, -0.38, 0);
  addFingers(hand, skin, materials, 1);
  pivot.add(hand);
  group.add(pivot);
  return { pivot, hand };
}

/**
 * Shared smooth body. Feet sit on y = 0. Face points toward +Z.
 */
function createBody(options) {
  const group = new Group();
  const materials = [];
  const mat = (color, params) => {
    const made = material(color, params);
    materials.push(made);
    return made;
  };

  const skin = mat(options.skin, { roughness: 0.58, texture: "skin" });
  const cloth = mat(options.tunic, { roughness: 0.86, texture: "cloth" });
  const pantsMat = mat(options.pants, { roughness: 0.88, texture: "cloth" });
  const bootMat = mat(options.boots, { roughness: 0.8, texture: "leather" });
  const hairMat = options.hair == null ? null : mat(options.hair, { roughness: 0.72, texture: "hair" });

  const hip = options.hip ?? 0.52;
  add(group, capsule(0.085, 0.28), pantsMat, -0.1, hip * 0.48, 0, materials);
  add(group, capsule(0.085, 0.28), pantsMat, 0.1, hip * 0.48, 0, materials);
  add(group, sphere(0.09), bootMat, -0.1, 0.07, 0.03, materials).scale.set(1, 0.72, 1.25);
  add(group, sphere(0.09), bootMat, 0.1, 0.07, 0.03, materials).scale.set(1, 0.72, 1.25);

  const chestY = hip + 0.34;
  add(group, capsule(options.chest ?? 0.2, 0.32), cloth, 0, chestY, 0, materials);
  const skirt = add(
    group,
    lathe(tunicProfile(0.42, options.hem ?? 0.26, options.waist ?? 0.16)),
    cloth,
    0,
    hip - 0.02,
    0,
    materials,
  );
  skirt.castShadow = true;

  const headY = chestY + 0.46;
  const head = add(group, sphere(options.head ?? 0.2), skin, 0, headY, 0, materials);
  if (hairMat) {
    const hair = add(group, sphere((options.head ?? 0.2) * 1.05), hairMat, 0, headY + 0.05, -0.02, materials);
    hair.scale.set(1.02, 0.72, 1.02);
  }

  const eyeMat = mat(options.eye ?? colors.eye, { roughness: 0.35 });
  const eyeY = headY + 0.02;
  const eyeZ = (options.head ?? 0.2) * 0.78;
  add(group, sphere(0.028), eyeMat, -0.07, eyeY, eyeZ, materials);
  add(group, sphere(0.028), eyeMat, 0.07, eyeY, eyeZ, materials);

  if (isDetailed()) {
    const headRadius = options.head ?? 0.2;
    for (const side of [-1, 1]) {
      const ear = add(group, sphere(headRadius * 0.28), skin, side * headRadius * 0.98, headY - 0.01, 0, materials);
      ear.scale.set(0.42, 0.72, 0.38);
    }
    if (hairMat) {
      add(group, sphere(headRadius * 0.62), hairMat, -0.08, headY + 0.1, -0.04, materials);
      add(group, sphere(headRadius * 0.48), hairMat, 0.09, headY + 0.08, -0.02, materials);
    }
    if (options.belt !== false) {
      const beltMat = mat(colors.leather, { roughness: 0.68, texture: "leather" });
      const belt = add(group, torus((options.waist ?? 0.16) + 0.015, 0.016), beltMat, 0, hip + 0.05, 0, materials);
      belt.rotation.x = Math.PI / 2;
    }
  }

  const right = armPivot(group, 1, skin, chestY + 0.18, 0.4, materials);
  const left = armPivot(group, -1, skin, chestY + 0.18, 0.4, materials);
  right.pivot.rotation.x = -0.7;
  right.pivot.rotation.z = -0.18;
  left.pivot.rotation.x = -0.35;
  left.pivot.rotation.z = 0.18;

  group.userData.arm = right.pivot;
  group.userData.armLeft = left.pivot;
  group.userData.materials = materials;
  group.userData.height = headY + (options.head ?? 0.2) + 0.08;
  group.userData.head = head;

  return { group, hand: right.hand, offHand: left.hand, materials, height: group.userData.height };
}

export function createAdventurer() {
  const body = createBody({
    skin: colors.skin,
    tunic: colors.tunic,
    pants: colors.pants,
    boots: colors.boots,
    hair: colors.hair,
    head: 0.2,
    hem: 0.24,
  });
  const scarf = material(colors.scarf, { roughness: 0.7 });
  body.materials.push(scarf);
  const wrap = add(body.group, torus(0.13, 0.028), scarf, 0, 1.18, 0, body.materials);
  wrap.rotation.x = Math.PI / 2;
  return body;
}

export function createGoblin() {
  const group = new Group();
  const materials = [];
  const mat = (color, params) => {
    const made = material(color, params);
    materials.push(made);
    return made;
  };
  const skin = mat(colors.goblin, { roughness: 0.62, texture: "skin" });
  const deep = mat(colors.goblinDeep, { roughness: 0.8, texture: "cloth" });
  const earMat = mat(colors.goblinEar, { roughness: 0.6, texture: "skin" });
  const eyeMat = mat(colors.goblinEye, { roughness: 0.32, emissive: colors.goblinEye, emissiveIntensity: 0.18 });
  const wood = mat(colors.wood, { roughness: 0.84, texture: "wood" });

  add(group, capsule(0.07, 0.16), deep, -0.09, 0.2, 0, materials);
  add(group, capsule(0.07, 0.16), deep, 0.09, 0.2, 0, materials);
  add(group, sphere(0.075), deep, -0.09, 0.06, 0.02, materials).scale.set(1, 0.65, 1.2);
  add(group, sphere(0.075), deep, 0.09, 0.06, 0.02, materials).scale.set(1, 0.65, 1.2);

  const belly = add(group, sphere(0.2), skin, 0, 0.5, 0.02, materials);
  belly.scale.set(1.05, 0.92, 0.9);
  const cloth = add(group, lathe(tunicProfile(0.22, 0.2, 0.12)), deep, 0, 0.32, 0, materials);
  cloth.castShadow = true;

  const head = add(group, sphere(0.2), skin, 0, 0.86, 0.02, materials);
  head.scale.set(1.05, 0.95, 0.98);
  for (const side of [-1, 1]) {
    const ear = add(group, sphere(0.13), earMat, side * 0.23, 0.93, -0.01, materials);
    ear.scale.set(0.42, 1.55, 0.3);
    ear.rotation.z = side * -0.55;
  }
  add(group, sphere(0.035), eyeMat, -0.07, 0.9, 0.16, materials);
  add(group, sphere(0.035), eyeMat, 0.07, 0.9, 0.16, materials);
  const nose = add(group, sphere(0.045), skin, 0, 0.84, 0.18, materials);
  nose.scale.set(0.8, 0.7, 1.3);

  const arm = new Group();
  arm.position.set(0.2, 0.62, 0);
  add(arm, capsule(0.045, 0.16), skin, 0, -0.12, 0, materials);
  const hand = new Group();
  hand.position.set(0, -0.24, 0);
  addFingers(hand, skin, materials, 0.72);
  arm.add(hand);
  arm.rotation.x = -0.85;
  arm.rotation.z = -0.3;
  group.add(arm);

  const club = new Group();
  add(club, capsule(0.028, 0.22), wood, 0, 0.12, 0, materials);
  const knob = add(club, sphere(0.07), wood, 0, 0.26, 0, materials);
  knob.scale.set(1.1, 0.85, 1.1);
  hand.add(club);
  club.rotation.x = Math.PI;

  if (isDetailed()) {
    const teeth = mat(colors.string, { roughness: 0.45, texture: "cloth" });
    add(group, sphere(0.018), teeth, -0.025, 0.78, 0.18, materials);
    add(group, sphere(0.018), teeth, 0.025, 0.78, 0.18, materials);
    const rag = add(group, torus(0.16, 0.012), deep, 0, 0.4, 0, materials);
    rag.rotation.x = Math.PI / 2;
    for (const side of [-1, 1]) {
      const inner = add(group, sphere(0.05), earMat, side * 0.28, 0.98, 0, materials);
      inner.scale.set(0.28, 0.9, 0.18);
    }
  }

  group.userData.arm = arm;
  group.userData.materials = materials;
  group.userData.height = 1.12;
  return { group, hand, materials, height: 1.12 };
}

export function createMan() {
  const body = createBody({
    skin: colors.skinDeep,
    tunic: colors.manShirt,
    pants: colors.manPants,
    boots: colors.boots,
    hair: colors.hairMan,
    head: 0.195,
    hem: 0.22,
    waist: 0.15,
    belt: false,
  });
  const beard = material(colors.hairMan, { roughness: 0.75, texture: "hair" });
  body.materials.push(beard);
  const chin = add(body.group, sphere(0.09), beard, 0, 1.28, 0.08, body.materials);
  chin.scale.set(0.85, 0.7, 0.7);
  const belt = material(colors.manBelt, { roughness: 0.7, texture: "leather" });
  body.materials.push(belt);
  const band = add(body.group, torus(0.16, 0.022), belt, 0, 0.58, 0, body.materials);
  band.rotation.x = Math.PI / 2;
  const pouch = add(body.group, sphere(0.07), belt, 0.16, 0.5, 0.06, body.materials);
  pouch.scale.set(0.8, 1, 0.7);
  body.group.userData.arm.rotation.x = -0.25;
  return body;
}

export function createGuard() {
  const body = createBody({
    skin: colors.skin,
    tunic: colors.guardCloth,
    pants: colors.pants,
    boots: colors.boots,
    hair: null,
    head: 0.19,
    chest: 0.22,
    hem: 0.28,
    waist: 0.18,
  });
  const metal = material(colors.metal, { roughness: 0.38, metalness: 0.62 });
  const trim = material(colors.metalTrim, { roughness: 0.42, metalness: 0.48 });
  const dark = material(colors.metalDark, { roughness: 0.45, metalness: 0.55 });
  body.materials.push(metal, trim, dark);

  const helm = add(body.group, lathe(helmetProfile()), metal, 0, 1.42, 0, body.materials);
  helm.castShadow = true;
  const brim = add(body.group, torus(0.2, 0.025), dark, 0, 1.44, 0, body.materials);
  brim.rotation.x = Math.PI / 2.15;

  const plate = add(body.group, rounded(0.42, 0.4, 0.28, 3.4), metal, 0, 1.02, 0.04, body.materials);
  plate.castShadow = true;
  add(body.group, rounded(0.16, 0.08, 0.06, 3.2), trim, 0, 1.02, 0.16, body.materials);
  if (isDetailed()) {
    for (const [x, y] of [
      [-0.12, 1.14],
      [0.12, 1.14],
      [-0.12, 0.9],
      [0.12, 0.9],
    ]) {
      add(body.group, sphere(0.018), trim, x, y, 0.16, body.materials);
    }
    const plume = add(body.group, capsule(0.03, 0.16), trim, 0, 1.72, -0.04, body.materials);
    plume.rotation.x = 0.4;
    const waist = add(body.group, torus(0.2, 0.018), trim, 0, 0.78, 0, body.materials);
    waist.rotation.x = Math.PI / 2;
  }

  add(body.group, sphere(0.09), metal, 0.28, 1.22, 0, body.materials).scale.set(1.1, 0.7, 0.9);
  add(body.group, sphere(0.09), metal, -0.28, 1.22, 0, body.materials).scale.set(1.1, 0.7, 0.9);

  const shield = new Group();
  const board = add(shield, rounded(0.34, 0.46, 0.08, 3.6), dark, 0, 0, 0, body.materials);
  board.castShadow = true;
  add(shield, rounded(0.12, 0.12, 0.04, 3), trim, 0, 0, 0.05, body.materials);
  shield.position.set(-0.08, -0.05, 0.08);
  body.offHand.add(shield);

  const sword = createWeapon("sword");
  sword.group.rotation.x = Math.PI;
  body.hand.add(sword.group);
  for (const mat of sword.materials) {
    if (!body.materials.includes(mat)) body.materials.push(mat);
  }
  body.group.userData.arm.rotation.x = -0.85;
  return body;
}

export function createHighwayman() {
  const body = createBody({
    skin: colors.skinDeep,
    tunic: colors.cloakInner,
    pants: colors.cloak,
    boots: colors.boots,
    hair: null,
    head: 0.185,
    chest: 0.18,
    hem: 0.2,
    waist: 0.14,
  });
  const cloakMat = material(colors.cloak, { roughness: 0.9 });
  const hoodMat = material(colors.hood, { roughness: 0.88 });
  const maskMat = material(colors.mask, { roughness: 0.7 });
  body.materials.push(cloakMat, hoodMat, maskMat);

  const cloak = add(body.group, lathe(cloakProfile()), cloakMat, 0, 0.42, -0.02, body.materials);
  cloak.scale.set(1.05, 1.15, 0.85);
  cloak.castShadow = true;

  const hood = add(body.group, sphere(0.22), hoodMat, 0, 1.58, -0.02, body.materials);
  hood.scale.set(1.05, 0.78, 1.05);
  const mask = add(body.group, rounded(0.2, 0.06, 0.08, 3.2), maskMat, 0, 1.48, 0.12, body.materials);
  if (isDetailed()) {
    const strapMat = material(colors.leather, { roughness: 0.7, texture: "leather" });
    body.materials.push(strapMat);
    const strap = add(body.group, capsule(0.015, 0.7), strapMat, 0.08, 1.05, 0.08, body.materials);
    strap.rotation.z = 0.7;
    strap.rotation.x = 0.15;
  }
  mask.castShadow = true;

  const knife = createWeapon("knife");
  knife.group.rotation.x = Math.PI * 0.85;
  body.hand.add(knife.group);
  for (const mat of knife.materials) {
    if (!body.materials.includes(mat)) body.materials.push(mat);
  }
  body.group.userData.arm.rotation.x = -1.05;
  body.group.userData.arm.rotation.z = -0.4;
  return body;
}

export function createWeapon(id) {
  const group = new Group();
  const materials = [];
  const mat = (color, params) => {
    const made = material(color, params);
    materials.push(made);
    return made;
  };

  if (id === "staff" || id === "iron-staff") {
    const shaft = mat(colors.wood, { roughness: 0.62, texture: "wood" });
    const orbMat = mat(colors.orb, { roughness: 0.28, metalness: 0.08, emissive: colors.orb, emissiveIntensity: 0.22, texture: "metal" });
    const capColor = id === "iron-staff" ? colors.iron : colors.bronzeDark;
    const cap = mat(capColor, { roughness: 0.4, metalness: 0.45, texture: "metal" });
    add(group, capsule(0.028, 0.92), shaft, 0, 0.42, 0, materials);
    add(group, torus(0.07, 0.012), cap, 0, 0.9, 0, materials).rotation.x = Math.PI / 2;
    add(group, sphere(0.075), orbMat, 0, 1.02, 0, materials);
    add(group, sphere(0.04), cap, 0, -0.08, 0, materials);
  } else if (id === "bow" || id === "iron-bow") {
    const woodColor = id === "iron-bow" ? colors.barkDark : colors.bow;
    const wood = mat(woodColor, { roughness: 0.55, texture: "wood" });
    const string = mat(colors.string, { roughness: 0.4, texture: "cloth" });
    const spec = profile();
    const limb = add(
      group,
      new TorusGeometry(0.34, 0.02, spec.tubeSegments, isDetailed() ? 56 : 40, Math.PI * 1.15),
      wood,
      0,
      0.34,
      0,
      materials,
    );
    limb.rotation.y = Math.PI / 2;
    limb.rotation.z = Math.PI * 0.92;
    add(group, new CylinderGeometry(0.004, 0.004, 0.62, isDetailed() ? 12 : 8), string, 0.02, 0.36, 0, materials);
  } else if (id === "knife" || id === "dagger") {
    const blade = mat(colors.knife, { roughness: 0.32, metalness: 0.7, texture: "metal" });
    const grip = mat(colors.grip, { roughness: 0.7, texture: "leather" });
    add(group, rounded(0.035, 0.22, 0.012, 3.4), blade, 0, 0.16, 0, materials);
    add(group, capsule(0.016, 0.08), grip, 0, -0.02, 0, materials);
  } else {
    const iron = id === "iron-sword";
    const blade = mat(iron ? colors.iron : colors.bronze, { roughness: 0.34, metalness: iron ? 0.62 : 0.58, texture: "metal" });
    const edge = mat(iron ? colors.ironDark : colors.bronzeDark, { roughness: 0.4, metalness: 0.5, texture: "metal" });
    const grip = mat(colors.grip, { roughness: 0.72, texture: "leather" });
    add(group, rounded(0.07, 0.58, 0.018, 3.6), blade, 0, 0.42, 0, materials);
    const guard = add(group, capsule(0.022, 0.16), edge, 0, 0.12, 0, materials);
    guard.rotation.z = Math.PI / 2;
    add(group, capsule(0.02, 0.12), grip, 0, 0.02, 0, materials);
    add(group, sphere(0.028), edge, 0, -0.06, 0, materials);
  }

  group.userData.materials = materials;
  return { group, materials };
}

export function createCharacter(id) {
  switch (id) {
    case "goblin":
      return createGoblin();
    case "man":
      return createMan();
    case "guard":
      return createGuard();
    case "highwayman":
      return createHighwayman();
    default:
      return createAdventurer();
  }
}

function disposeMesh(object) {
  object.traverse((node) => {
    if (node.geometry) node.geometry.dispose();
    if (!node.material) return;
    const list = Array.isArray(node.material) ? node.material : [node.material];
    for (const mat of list) mat.dispose();
  });
}

/**
 * Armour overlays for the adventurer. Standard and Detailed share the same
 * silhouette; Detailed adds rivets and a thicker helm brim.
 */
export function dressAdventurer(body, gear) {
  if (!body?.group) return;
  const previous = body.group.userData.outfit;
  if (previous) {
    body.group.remove(previous);
    disposeMesh(previous);
  }
  for (const hand of [body.hand, body.offHand]) {
    if (!hand) continue;
    for (const child of [...hand.children]) {
      if (!child.userData?.gearPiece) continue;
      hand.remove(child);
      disposeMesh(child);
    }
  }
  const outfit = new Group();
  outfit.name = "outfit";
  body.group.add(outfit);
  body.group.userData.outfit = outfit;
  if (!gear) return;

  const iron = (id) => typeof id === "string" && id.startsWith("iron");
  const metalFor = (id) => {
    const color = iron(id) ? colors.iron : colors.bronze;
    const dark = iron(id) ? colors.ironDark : colors.bronzeDark;
    const plate = material(color, { roughness: 0.38, metalness: 0.62, texture: "metal" });
    const trim = material(dark, { roughness: 0.42, metalness: 0.5, texture: "metal" });
    body.materials.push(plate, trim);
    return { plate, trim };
  };
  const detailed = isDetailed();

  if (gear.head) {
    const { plate, trim } = metalFor(gear.head);
    const helm = add(outfit, lathe(helmetProfile()), plate, 0, 1.48, 0, body.materials);
    helm.scale.set(0.82, 0.72, 0.82);
    const brim = add(outfit, torus(0.16, 0.018), trim, 0, 1.4, 0, body.materials);
    brim.rotation.x = Math.PI / 2.2;
    if (detailed) add(outfit, sphere(0.02), trim, 0, 1.62, 0.02, body.materials);
  }
  if (gear.body) {
    const { plate, trim } = metalFor(gear.body);
    add(outfit, rounded(0.48, 0.46, 0.36, 3.2), plate, 0, 0.98, 0, body.materials);
    if (detailed) {
      add(outfit, sphere(0.018), trim, -0.12, 1.1, 0.16, body.materials);
      add(outfit, sphere(0.018), trim, 0.12, 1.1, 0.16, body.materials);
      add(outfit, sphere(0.018), trim, 0, 1.12, -0.16, body.materials);
    }
  }
  if (gear.legs) {
    const { plate } = metalFor(gear.legs);
    add(outfit, capsule(0.07, 0.22), plate, -0.1, 0.32, 0.02, body.materials);
    add(outfit, capsule(0.07, 0.22), plate, 0.1, 0.32, 0.02, body.materials);
  }
  if (gear.boots) {
    const { plate } = metalFor(gear.boots);
    const left = add(outfit, sphere(0.08), plate, -0.1, 0.08, 0.05, body.materials);
    const right = add(outfit, sphere(0.08), plate, 0.1, 0.08, 0.05, body.materials);
    left.scale.set(1.05, 0.55, 1.3);
    right.scale.set(1.05, 0.55, 1.3);
  }
  if (gear.gloves && body.hand && body.offHand) {
    const { plate } = metalFor(gear.gloves);
    for (const hand of [body.hand, body.offHand]) {
      const glove = add(hand, sphere(0.045), plate, 0, -0.02, 0, body.materials);
      glove.userData.gearPiece = true;
    }
  }
  if (gear.shield && body.offHand) {
    const { plate, trim } = metalFor(gear.shield);
    const shield = new Group();
    shield.userData.gearPiece = true;
    const board = add(shield, rounded(0.28, 0.36, 0.06, 3.4), plate, 0, 0, 0, body.materials);
    board.castShadow = true;
    add(shield, rounded(0.1, 0.1, 0.03, 3), trim, 0, 0, 0.04, body.materials);
    if (detailed) add(shield, sphere(0.02), trim, 0, 0.08, 0.05, body.materials);
    shield.position.set(-0.16, 0.08, 0.12);
    shield.rotation.y = -0.5;
    body.offHand.add(shield);
  }
}
