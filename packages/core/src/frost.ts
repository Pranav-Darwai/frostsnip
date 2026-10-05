/**
 * Uniform frosted-glass redaction.
 * Every region uses the same blur kernel, tint, and opacity (sampled from the original image).
 */

export const FROST_UNIFORM_INTENSITY = 0.85;

const FIXED_RADIUS = 18;
const FIXED_PASSES = 4;
/** Fixed milky overlay — not scaled per annotation intensity (keeps patches matching). */
const FROST_TINT = 0.58;
const FROST_R = 236;
const FROST_G = 242;
const FROST_B = 248;
/** 1px soft edge only; interior is full-strength frost. */
const EDGE_PX = 1;

export type FrostRegion = { x: number; y: number; width: number; height: number };

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

/** Horizontal then vertical box blur — same kernel everywhere. */
function separableBoxBlur(
  src: Float32Array,
  w: number,
  h: number,
  radius: number,
): Float32Array {
  const dest = new Float32Array(src.length);
  const tmp = new Float32Array(src.length);
  const r = Math.max(1, Math.round(radius));
  const diam = r * 2 + 1;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sr = 0,
        sg = 0,
        sb = 0,
        sa = 0;
      for (let k = -r; k <= r; k++) {
        const xx = clamp(x + k, 0, w - 1);
        const i = (y * w + xx) * 4;
        sr += src[i]!;
        sg += src[i + 1]!;
        sb += src[i + 2]!;
        sa += src[i + 3]!;
      }
      const o = (y * w + x) * 4;
      tmp[o] = sr / diam;
      tmp[o + 1] = sg / diam;
      tmp[o + 2] = sb / diam;
      tmp[o + 3] = sa / diam;
    }
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sr = 0,
        sg = 0,
        sb = 0,
        sa = 0;
      for (let k = -r; k <= r; k++) {
        const yy = clamp(y + k, 0, h - 1);
        const i = (yy * w + x) * 4;
        sr += tmp[i]!;
        sg += tmp[i + 1]!;
        sb += tmp[i + 2]!;
        sa += tmp[i + 3]!;
      }
      const o = (y * w + x) * 4;
      dest[o] = sr / diam;
      dest[o + 1] = sg / diam;
      dest[o + 2] = sb / diam;
      dest[o + 3] = sa / diam;
    }
  }

  return dest;
}

function frostOneRegionFromOriginal(
  out: Uint8ClampedArray,
  original: Uint8ClampedArray,
  imgW: number,
  imgH: number,
  region: FrostRegion,
): void {
  const pad = FIXED_RADIUS * FIXED_PASSES + EDGE_PX + 2;

  const rx0 = Math.floor(region.x);
  const ry0 = Math.floor(region.y);
  const rx1 = Math.ceil(region.x + region.width);
  const ry1 = Math.ceil(region.y + region.height);

  const x0 = clamp(rx0 - pad, 0, imgW);
  const y0 = clamp(ry0 - pad, 0, imgH);
  const x1 = clamp(rx1 + pad, 0, imgW);
  const y1 = clamp(ry1 + pad, 0, imgH);
  const rw = x1 - x0;
  const rh = y1 - y0;
  if (rw <= 2 || rh <= 2) return;

  let buf: Float32Array = new Float32Array(rw * rh * 4);
  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      const si = ((y0 + y) * imgW + (x0 + x)) * 4;
      const di = (y * rw + x) * 4;
      buf[di] = original[si]!;
      buf[di + 1] = original[si + 1]!;
      buf[di + 2] = original[si + 2]!;
      buf[di + 3] = original[si + 3]!;
    }
  }

  for (let p = 0; p < FIXED_PASSES; p++) {
    const next = separableBoxBlur(buf, rw, rh, FIXED_RADIUS);
    buf = next;
  }

  const fx0 = clamp(rx0, 0, imgW);
  const fy0 = clamp(ry0, 0, imgH);
  const fx1 = clamp(rx1, 0, imgW);
  const fy1 = clamp(ry1, 0, imgH);

  for (let y = fy0; y < fy1; y++) {
    for (let x = fx0; x < fx1; x++) {
      const lx = x - x0;
      const ly = y - y0;
      const bi = (ly * rw + lx) * 4;
      const di = (y * imgW + x) * 4;

      const distEdge = Math.min(x - fx0, fx1 - 1 - x, y - fy0, fy1 - 1 - y);
      const edge =
        EDGE_PX <= 0 ? 1 : clamp(distEdge / EDGE_PX, 0, 1);
      if (edge <= 0) continue;

      const br = buf[bi]!;
      const bg = buf[bi + 1]!;
      const bb = buf[bi + 2]!;

      const frostedR = br * (1 - FROST_TINT) + FROST_R * FROST_TINT;
      const frostedG = bg * (1 - FROST_TINT) + FROST_G * FROST_TINT;
      const frostedB = bb * (1 - FROST_TINT) + FROST_B * FROST_TINT;

      out[di] = out[di]! * (1 - edge) + frostedR * edge;
      out[di + 1] = out[di + 1]! * (1 - edge) + frostedG * edge;
      out[di + 2] = out[di + 2]! * (1 - edge) + frostedB * edge;
    }
  }
}

/**
 * Apply frost to many regions with identical strength.
 * Always blurs from the original pixels (not prior frosts) so every patch matches.
 */
export function applyFrostsToImageData(
  imageData: ImageData,
  regions: FrostRegion[],
  _intensity = FROST_UNIFORM_INTENSITY,
): void {
  if (regions.length === 0) return;
  const original = new Uint8ClampedArray(imageData.data);
  const { width, height } = imageData;
  for (const region of regions) {
    if (region.width <= 0 || region.height <= 0) continue;
    frostOneRegionFromOriginal(imageData.data, original, width, height, region);
  }
}

/** Single-region helper (same pipeline as batch). */
export function applyFrostToImageData(
  imageData: ImageData,
  region: FrostRegion,
  intensity = FROST_UNIFORM_INTENSITY,
): void {
  applyFrostsToImageData(imageData, [region], intensity);
}

/** Apply frost on an offscreen canvas and return a data URL of the full image. */
export async function renderFrostedImage(
  image: CanvasImageSource,
  width: number,
  height: number,
  regions: Array<FrostRegion & { intensity?: number }>,
): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2d context unavailable");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, 0, 0, width, height);
  if (regions.length === 0) return canvas.toDataURL("image/png");

  const imageData = ctx.getImageData(0, 0, width, height);
  applyFrostsToImageData(imageData, regions);
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}
