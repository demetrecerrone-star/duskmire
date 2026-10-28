/**
 * Procedural canvas textures. Nothing is loaded from disk.
 * Detail maps stay near white so the palette color still shows through.
 * Roughness, normal, and ambient-occlusion maps add grain without facets.
 */
import {
  CanvasTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  LinearSRGBColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
} from "../vendor/three.module.js";
import { isDetailed, textureSize } from "./quality.js";

const cache = new Map();

function hash(ix, iy, seed) {
  let n = Math.imul(ix + seed * 13, 374761393) + Math.imul(iy + seed * 7, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function fade(t) {
  return t * t * (3 - 2 * t);
}

function valueNoise(x, y, period, seed) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = fade(x - x0);
  const ty = fade(y - y0);
  const wrap = (v) => ((v % period) + period) % period;
  const v00 = hash(wrap(x0), wrap(y0), seed);
  const v10 = hash(wrap(x0 + 1), wrap(y0), seed);
  const v01 = hash(wrap(x0), wrap(y0 + 1), seed);
  const v11 = hash(wrap(x0 + 1), wrap(y0 + 1), seed);
  return v00 + (v10 - v00) * tx + (v01 - v00) * ty + (v00 - v10 - v01 + v11) * tx * ty;
}

function fbm(x, y, period, seed) {
  let sum = 0;
  let amp = 0.56;
  let freq = 1;
  let total = 0;
  for (let octave = 0; octave < 3; octave += 1) {
    sum += valueNoise(x * freq, y * freq, period * freq, seed + octave * 17) * amp;
    total += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / total;
}

function sample(kind, u, v, size) {
  const grain = fbm(u * 8, v * 8, 8, kind.length * 3 + 2);
  if (kind === "wood") {
    const ring = Math.sin((u * 18 + grain * 2.2) * Math.PI * 2);
    return { detail: 0.74 + grain * 0.2 + ring * 0.07, rough: 0.55 + (1 - grain) * 0.32, height: grain * 0.6 + ring * 0.3, ao: 0.78 + grain * 0.2 };
  }
  if (kind === "cloth") {
    const weave = Math.sin(u * size * 0.5) * Math.sin(v * size * 0.5);
    return { detail: 0.84 + grain * 0.12 + weave * 0.04, rough: 0.7 + grain * 0.22, height: grain * 0.4 + weave * 0.22, ao: 0.76 + grain * 0.18 };
  }
  if (kind === "metal") {
    const scratch = Math.abs(Math.sin(v * 80 + grain * 5)) > 0.94 ? 0.12 : 0;
    return { detail: 0.88 + grain * 0.1 + scratch, rough: 0.3 + grain * 0.32 - scratch, height: grain * 0.3 + scratch, ao: 0.82 + grain * 0.14 };
  }
  if (kind === "leather") {
    return { detail: 0.8 + grain * 0.16, rough: 0.6 + grain * 0.28, height: grain * 0.65, ao: 0.72 + grain * 0.22 };
  }
  if (kind === "ground") {
    const mottled = fbm(u * 4, v * 4, 4, 11);
    return { detail: 0.8 + mottled * 0.2, rough: 0.78 + grain * 0.18, height: mottled * 0.75 + grain * 0.2, ao: 0.64 + mottled * 0.3 };
  }
  if (kind === "hair") {
    const strand = Math.sin((u * 36 + v * 6) * Math.PI);
    return { detail: 0.82 + grain * 0.1 + strand * 0.04, rough: 0.68 + grain * 0.2, height: strand * 0.25 + grain * 0.25, ao: 0.7 + grain * 0.22 };
  }
  return { detail: 0.92 + grain * 0.06, rough: 0.5 + grain * 0.18, height: grain * 0.3, ao: 0.84 + grain * 0.14 };
}

function paint(size, fill) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const image = ctx.createImageData(size, size);
  fill(image.data, size);
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function channel(canvas, colorSpace) {
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = colorSpace;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function buildSet(kind, size) {
  const heights = new Float32Array(size * size);
  const detail = paint(size, (data) => {
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const texel = sample(kind, x / size, y / size, size);
        const i = (y * size + x) * 4;
        const c = Math.max(0, Math.min(255, Math.round(texel.detail * 255)));
        data[i] = c;
        data[i + 1] = c;
        data[i + 2] = c;
        data[i + 3] = 255;
        heights[y * size + x] = texel.height;
      }
    }
  });
  const rough = paint(size, (data) => {
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const texel = sample(kind, x / size, y / size, size);
        const i = (y * size + x) * 4;
        const c = Math.max(0, Math.min(255, Math.round(texel.rough * 255)));
        data[i] = c;
        data[i + 1] = c;
        data[i + 2] = c;
        data[i + 3] = 255;
      }
    }
  });
  const ao = paint(size, (data) => {
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const texel = sample(kind, x / size, y / size, size);
        const i = (y * size + x) * 4;
        const c = Math.max(0, Math.min(255, Math.round(texel.ao * 255)));
        data[i] = c;
        data[i + 1] = c;
        data[i + 2] = c;
        data[i + 3] = 255;
      }
    }
  });
  const normal = paint(size, (data) => {
    const strength = kind === "metal" ? 1.4 : kind === "ground" ? 2.2 : 1.8;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const left = heights[y * size + ((x + size - 1) % size)];
        const right = heights[y * size + ((x + 1) % size)];
        const down = heights[((y + size - 1) % size) * size + x];
        const up = heights[((y + 1) % size) * size + x];
        let nx = (left - right) * strength;
        let ny = (down - up) * strength;
        let nz = 1;
        const len = Math.hypot(nx, ny, nz) || 1;
        nx /= len;
        ny /= len;
        nz /= len;
        const i = (y * size + x) * 4;
        data[i] = Math.round((nx * 0.5 + 0.5) * 255);
        data[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
        data[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
        data[i + 3] = 255;
      }
    }
  });
  const repeat = kind === "ground" ? 10 : kind === "cloth" ? 2.4 : 1.7;
  const maps = {
    detail: channel(detail, SRGBColorSpace),
    roughness: channel(rough, LinearSRGBColorSpace),
    ao: channel(ao, LinearSRGBColorSpace),
    normal: channel(normal, LinearSRGBColorSpace),
    normalStrength: kind === "metal" ? 0.28 : kind === "skin" ? 0.16 : kind === "ground" ? 0.5 : 0.36,
  };
  for (const texture of [maps.detail, maps.roughness, maps.ao, maps.normal]) {
    texture.repeat.set(repeat, kind === "wood" ? repeat * 0.45 : repeat);
  }
  return maps;
}

export function textureSet(kind) {
  if (!isDetailed() || typeof document === "undefined") return null;
  const size = textureSize();
  const key = `${kind}:${size}`;
  if (cache.has(key)) return cache.get(key);
  const maps = buildSet(kind, size);
  cache.set(key, maps);
  return maps;
}

export function applyMaps(material, kind) {
  const maps = textureSet(kind);
  if (!maps || !material) return material;
  material.map = maps.detail;
  material.roughnessMap = maps.roughness;
  material.normalMap = maps.normal;
  if (material.normalScale) material.normalScale.set(maps.normalStrength, maps.normalStrength);
  material.aoMap = maps.ao;
  material.aoMapIntensity = kind === "ground" ? 1 : 0.75;
  material.needsUpdate = true;
  return material;
}

export function stampAoUv(geometry) {
  if (!geometry || geometry.getAttribute("uv2") || !geometry.getAttribute("uv")) return geometry;
  geometry.setAttribute("uv2", geometry.getAttribute("uv").clone());
  return geometry;
}
