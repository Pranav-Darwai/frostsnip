import type { BBox, OcrWord, PiiHit } from "./types.js";
import { expandBlurRegion, tailOfBBox, uid, unionBBoxes } from "./geometry.js";
import { planTailMask } from "./tailMask.js";
import { luhnOk, normalizeDigits } from "./patterns.js";

function looksLikeCardBin(digits: string): boolean {
  return /^[3-6]/.test(digits);
}

function isCardLabel(text: string): boolean {
  return /^(card|cc|credit|debit)[:.#]?$/i.test(text.trim());
}

function groupWordsByLine(words: OcrWord[]): OcrWord[][] {
  if (words.length === 0) return [];
  const sorted = [...words].sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x);
  const lines: OcrWord[][] = [];
  let current: OcrWord[] = [];
  let lineY = 0;
  let lineH = 0;

  for (const w of sorted) {
    const cy = w.bbox.y + w.bbox.height / 2;
    if (current.length === 0) {
      current = [w];
      lineY = cy;
      lineH = w.bbox.height;
      continue;
    }
    const thresh = Math.max(lineH, w.bbox.height) * 0.75;
    if (Math.abs(cy - lineY) <= thresh) {
      current.push(w);
      lineY = (lineY * (current.length - 1) + cy) / current.length;
      lineH = Math.max(lineH, w.bbox.height);
    } else {
      lines.push(current.sort((a, b) => a.bbox.x - b.bbox.x));
      current = [w];
      lineY = cy;
      lineH = w.bbox.height;
    }
  }
  if (current.length) lines.push(current.sort((a, b) => a.bbox.x - b.bbox.x));
  return lines;
}

function digitRuns(text: string): string {
  // Keep digits only; OCR often mixes punctuation into tokens
  return normalizeDigits(text);
}

function cardHitFromBoxes(text: string, boxes: BBox[], labeled: boolean): PiiHit | null {
  const digits = digitRuns(text);
  if (digits.length < 13 || digits.length > 19) return null;

  const ok =
    labeled ||
    luhnOk(digits) ||
    (looksLikeCardBin(digits) && digits.length === 16);

  if (!ok) return null;

  const bbox = unionBBoxes(boxes);
  const plan = planTailMask(digits.length === text.replace(/\D/g, "").length ? text : digits);
  // Tight frost over the last 60% of the digit strip - pad scales with glyph height
  const blur = expandBlurRegion(tailOfBBox(bbox, 0.6));

  return {
    id: uid("pii"),
    kind: "credit_card",
    text: digits.replace(/(\d{4})(?=\d)/g, "$1 ").trim(),
    bbox,
    blurRegions: [blur],
    preview: plan.preview,
  };
}

/**
 * Geometry-aware card finder - survives OCR splitting "4111 1111 1111 1111"
 * into separate words (common failure mode for text-only detectors).
 */
export function detectCardsFromOcrWords(words: OcrWord[]): PiiHit[] {
  const hits: PiiHit[] = [];
  const lines = groupWordsByLine(words);

  const scanLine = (line: OcrWord[], hasCardLabel: boolean, labelIdx: number) => {
    // Single token with 13-19 digits
    for (const w of line) {
      const d = digitRuns(w.text);
      if (d.length >= 13 && d.length <= 19) {
        const hit = cardHitFromBoxes(w.text, [w.bbox], hasCardLabel);
        if (hit) hits.push(hit);
      }
    }

    // Strict 4×4 groups
    for (let i = 0; i + 3 < line.length; i++) {
      const group = line.slice(i, i + 4);
      const digitGroups = group.map((w) => digitRuns(w.text));
      if (!digitGroups.every((d) => d.length === 4)) continue;
      const labeled = hasCardLabel || (i > 0 && isCardLabel(line[i - 1]!.text));
      const hit = cardHitFromBoxes(
        digitGroups.join(" "),
        group.map((w) => w.bbox),
        labeled,
      );
      if (hit) hits.push(hit);
    }

    // Sliding window of consecutive digit tokens
    for (let i = 0; i < line.length; i++) {
      let digits = "";
      const boxes: BBox[] = [];
      for (let j = i; j < line.length; j++) {
        const d = digitRuns(line[j]!.text);
        if (d.length === 0) {
          if (boxes.length === 0 && /^[:.\-#]+$/.test(line[j]!.text.trim())) continue;
          break;
        }
        digits += d;
        boxes.push(line[j]!.bbox);
        if (digits.length > 19) break;
        if (digits.length >= 13 && digits.length <= 19) {
          const hit = cardHitFromBoxes(digits, boxes, hasCardLabel);
          if (hit) hits.push(hit);
        }
      }
    }

    // Labeled line: all digit tokens after Card
    if (hasCardLabel) {
      const after = line.slice(Math.max(0, labelIdx + 1));
      const digitWords = after.filter((w) => digitRuns(w.text).length > 0);
      if (digitWords.length > 0) {
        const digits = digitWords.map((w) => digitRuns(w.text)).join("");
        if (digits.length >= 13 && digits.length <= 19) {
          const hit = cardHitFromBoxes(
            digits,
            digitWords.map((w) => w.bbox),
            true,
          );
          if (hit) hits.push(hit);
        }
      }
    }
  };

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]!;
    const labelIdx = line.findIndex((w) => isCardLabel(w.text));
    const hasCardLabel = labelIdx >= 0;
    scanLine(line, hasCardLabel, labelIdx);

    // Cross-line: 3×4-digit on this line + 1 on next (OCR wraps the last group)
    const fours = line.filter((w) => digitRuns(w.text).length === 4);
    const next = lines[li + 1];
    if (fours.length >= 3 && next) {
      const nextFour = next.find((w) => digitRuns(w.text).length === 4);
      if (nextFour) {
        const group = [...fours.slice(0, 3), nextFour];
        const labeled =
          hasCardLabel ||
          lines
            .slice(Math.max(0, li - 1), li + 1)
            .some((ln) => ln.some((w) => isCardLabel(w.text)));
        const hit = cardHitFromBoxes(
          group.map((w) => digitRuns(w.text)).join(" "),
          group.map((w) => w.bbox),
          labeled,
        );
        if (hit) hits.push(hit);
      }
    }

    // Labeled line with only 12 digits + next-line 4 digits
    if (hasCardLabel && next) {
      const afterDigits = line
        .slice(labelIdx + 1)
        .filter((w) => digitRuns(w.text).length > 0);
      const nextDigits = next.filter((w) => digitRuns(w.text).length > 0);
      const all = [...afterDigits, ...nextDigits.slice(0, 2)];
      const digits = all.map((w) => digitRuns(w.text)).join("");
      if (digits.length >= 13 && digits.length <= 19) {
        const hit = cardHitFromBoxes(
          digits,
          all.map((w) => w.bbox),
          true,
        );
        if (hit) hits.push(hit);
      }
    }
  }

  // Dedupe overlapping card hits - keep longest digit run
  hits.sort((a, b) => normalizeDigits(b.text).length - normalizeDigits(a.text).length);
  const out: PiiHit[] = [];
  for (const h of hits) {
    const overlaps = out.some(
      (o) =>
        !(
          h.bbox.x + h.bbox.width < o.bbox.x ||
          o.bbox.x + o.bbox.width < h.bbox.x ||
          h.bbox.y + h.bbox.height < o.bbox.y ||
          o.bbox.y + o.bbox.height < h.bbox.y
        ),
    );
    if (!overlaps) out.push(h);
  }
  return out;
}
