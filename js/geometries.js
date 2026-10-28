/**
 * Smooth stand-ins for rounded boxes and soft props.
 * Sphere / capsule / lathe meshes stay smooth because their vertices are shared
 * and normals are recomputed — no flat shading, no hard box edges.
 */
import {
  LatheGeometry,
  SphereGeometry,
  Vector2,
} from "../vendor/three.module.js";

/**
 * Superellipsoid. Exponent 2 is a sphere; 3–4 reads as a soft rounded box.
 * Width / height / depth are full extents.
 */
export function createRoundedBox(width, height, depth, exponent = 3.3, widthSegments = 28, heightSegments = 20) {
  const geo = new SphereGeometry(1, widthSegments, heightSegments);
  const pos = geo.attributes.position;
  const e = 2 / exponent;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const len = Math.hypot(x, y, z) || 1;
    const theta = Math.atan2(z, x);
    const phi = Math.acos(Math.min(1, Math.max(-1, y / len)));
    const ct = Math.cos(theta);
    const st = Math.sin(theta);
    const cp = Math.cos(phi);
    const sp = Math.sin(phi);
    const sx = Math.sign(ct) * Math.abs(ct) ** e * Math.sign(sp || 1) * Math.abs(sp) ** e;
    const sy = Math.sign(cp) * Math.abs(cp) ** e;
    const sz = Math.sign(st) * Math.abs(st) ** e * Math.sign(sp || 1) * Math.abs(sp) ** e;
    pos.setXYZ(i, sx * width * 0.5, sy * height * 0.5, sz * depth * 0.5);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Smooth coat, cloak, or helmet profile rotated around Y. */
export function createLathe(profile, segments = 28) {
  const points = profile.map(([x, y]) => new Vector2(x, y));
  return new LatheGeometry(points, segments);
}

export function tunicProfile(length, hem, waist) {
  return [
    [waist * 0.92, 0],
    [waist, length * 0.08],
    [waist * 0.98, length * 0.35],
    [(waist + hem) * 0.5, length * 0.7],
    [hem, length * 0.92],
    [hem * 0.96, length],
  ];
}

export function cloakProfile() {
  return [
    [0.12, 0.95],
    [0.16, 0.82],
    [0.22, 0.6],
    [0.3, 0.38],
    [0.36, 0.16],
    [0.34, 0.02],
  ];
}

export function helmetProfile() {
  return [
    [0.02, 0.3],
    [0.12, 0.28],
    [0.2, 0.22],
    [0.24, 0.12],
    [0.22, 0.02],
  ];
}
