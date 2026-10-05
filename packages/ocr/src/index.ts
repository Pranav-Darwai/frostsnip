import type { OcrWord } from "@snapshort/core";
import { createWorker, type Worker } from "tesseract.js";

let workerPromise: Promise<Worker> | null = null;

/** Pre-warm OCR so the first Locate PII click feels instant. */
export function prewarmOcr(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await createWorker("eng", 1, {
        logger: () => undefined,
      });
      return worker;
    })();
  }
  return workerPromise;
}

export async function recognizeWords(
  image: string | HTMLCanvasElement | HTMLImageElement | Blob,
): Promise<OcrWord[]> {
  const worker = await prewarmOcr();
  // Sparse text (PSM 11) helps pick up spaced card digits / form fields
  await worker.setParameters({
    // tesseract.js types only expose enum; "11" is PSM.SPARSE_TEXT
    tessedit_pageseg_mode: 11 as never,
    preserve_interword_spaces: "1",
  });
  const result = await worker.recognize(image);
  const words: OcrWord[] = [];

  const blocks = result.data.blocks ?? [];
  for (const block of blocks) {
    for (const para of block.paragraphs ?? []) {
      for (const line of para.lines ?? []) {
        for (const word of line.words ?? []) {
          const text = word.text?.trim();
          if (!text) continue;
          const b = word.bbox;
          words.push({
            text,
            bbox: {
              x: b.x0,
              y: b.y0,
              width: Math.max(1, b.x1 - b.x0),
              height: Math.max(1, b.y1 - b.y0),
            },
            confidence: word.confidence,
          });
        }
      }
    }
  }

  // Fallback: if hierarchy empty, split lines
  if (words.length === 0 && result.data.words) {
    for (const word of result.data.words) {
      const text = word.text?.trim();
      if (!text) continue;
      const b = word.bbox;
      words.push({
        text,
        bbox: {
          x: b.x0,
          y: b.y0,
          width: Math.max(1, b.x1 - b.x0),
          height: Math.max(1, b.y1 - b.y0),
        },
        confidence: word.confidence,
      });
    }
  }

  return words;
}

export async function terminateOcr(): Promise<void> {
  if (!workerPromise) return;
  const w = await workerPromise;
  await w.terminate();
  workerPromise = null;
}
