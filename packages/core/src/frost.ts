/**
 * Pixelate redaction - mosaic blocks sampled from the original image.
 * Every region uses the same block size so patches look consistent.
 */

export const FROST_UNIFORM_INTENSITY = 0.85;

/** Mosaic cell size in pixels (image space). */
export const PIXELATE_BLOCK = 12;

export type FrostRegion = { x: number; y: number; width: number; height: number };

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Pixelate one region from the original buffer into `out`.
 * Uses average color per block so text becomes an unreadable mosaic.
 */
function pixelateOneRegionFromOriginal(
  out: Uint8ClampedArray,
  original: Uint8ClampedArray,
  imgW: number,
  imgH: number,
  region: FrostRegion,
  blockSize: number,
): void {
  const fx0 = clamp(Math.floor(region.x), 0, imgW);
  const fy0 = clamp(Math.floor(region.y), 0, imgH);
  const fx1 = clamp(Math.ceil(region.x + region.width), 0, imgW);
  const fy1 = clamp(Math.ceil(region.y + region.height), 0, imgH);
  if (fx1 - fx0 < 1 || fy1 - fy0 < 1) return;

  const block = Math.max(4, Math.round(blockSize));

  // Snap blocks to a global grid so adjacent patches align
  const startBX = Math.floor(fx0 / block) * block;
  const startBY = Math.floor(fy0 / block) * block;

  for (let by = startBY; by < fy1; by += block) {
    for (let bx = startBX; bx < fx1; bx += block) {
      const x0 = Math.max(bx, fx0);
      const y0 = Math.max(by, fy0);
      const x1 = Math.min(bx + block, fx1);
      const y1 = Math.min(by + block, fy1);
      if (x1 <= x0 || y1 <= y0) continue;

      // Sample average from the full block footprint (clamped to image)
      const sx0 = clamp(bx, 0, imgW);
      const sy0 = clamp(by, 0, imgH);
      const sx1 = clamp(bx + block, 0, imgW);
      const sy1 = clamp(by + block, 0, imgH);
      if (sx1 <= sx0 || sy1 <= sy0) continue;

      let sr = 0;
      let sg = 0;
      let sb = 0;
      let sa = 0;
      let n = 0;
      for (let y = sy0; y < sy1; y++) {
        for (let x = sx0; x < sx1; x++) {
          const i = (y * imgW + x) * 4;
          sr += original[i]!;
          sg += original[i + 1]!;
          sb += original[i + 2]!;
          sa += original[i + 3]!;
          n++;
        }
      }
      if (n === 0) continue;

      const r = Math.round(sr / n);
      const g = Math.round(sg / n);
      const b = Math.round(sb / n);
      const a = Math.round(sa / n);

      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const di = (y * imgW + x) * 4;
          out[di] = r;
          out[di + 1] = g;
          out[di + 2] = b;
          out[di + 3] = a;
        }
      }
    }
  }
}

/**
 * Apply pixelate frost to many regions with identical block size.
 * Always samples from the original pixels so overlapping patches stay consistent.
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
    pixelateOneRegionFromOriginal(
      imageData.data,
      original,
      width,
      height,
      region,
      PIXELATE_BLOCK,
    );
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
