import { emailBlurRegions, findEmails, planEmailMask } from "./emailMask.js";
import { phoneBlurRegions, planPhoneMask } from "./phoneMask.js";
import { detectCardsFromOcrWords } from "./cardOcr.js";
import {
  API_KEY_RE,
  CREDIT_CARD_RE,
  EXTRA_PATTERNS,
  luhnOk,
  normalizeDigits,
  type PatternDef,
} from "./patterns.js";
import { planLabeledValueMask, planTailMask, regionsFromCharRanges } from "./tailMask.js";
import { expandBlurRegion, uid, unionBBoxes } from "./geometry.js";
import { FROST_UNIFORM_INTENSITY } from "./frost.js";
import type { BBox, OcrWord, PiiHit, PiiKind } from "./types.js";

const PHONE_RE =
  /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{3,4}[\s.-]?\d{3,4}(?:[\s.-]?\d{1,4})?/g;

export type DetectHit = {
  kind: PiiKind;
  match: string;
  index: number;
  preview: string;
  blurCharRanges: Array<{ start: number; end: number }>;
};

export function maskPartial(text: string, keepStart = 2, keepEnd = 2): string {
  if (text.length <= keepStart + keepEnd) return "•".repeat(text.length);
  return (
    text.slice(0, keepStart) +
    "•".repeat(Math.max(1, text.length - keepStart - keepEnd)) +
    text.slice(text.length - keepEnd)
  );
}

export function stitchOcrWords(words: OcrWord[]): {
  text: string;
  charToWord: number[];
} {
  const parts: string[] = [];
  const charToWord: number[] = [];
  words.forEach((w, wi) => {
    if (parts.length > 0) {
      parts.push(" ");
      charToWord.push(-1);
    }
    parts.push(w.text);
    for (let i = 0; i < w.text.length; i++) charToWord.push(wi);
  });
  return { text: parts.join(""), charToWord };
}

function bboxForCharRange(
  words: OcrWord[],
  charToWord: number[],
  start: number,
  end: number,
): BBox {
  const indices = new Set<number>();
  for (let i = start; i < end; i++) {
    const wi = charToWord[i];
    if (wi !== undefined && wi >= 0) indices.add(wi);
  }
  if (indices.size === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  return unionBBoxes([...indices].map((i) => words[i]!.bbox));
}

function hitFromRange(
  kind: PiiKind,
  text: string,
  words: OcrWord[],
  charToWord: number[],
  start: number,
  end: number,
  blurRegions?: BBox[],
  preview?: string,
): PiiHit {
  const bbox = bboxForCharRange(words, charToWord, start, end);
  return {
    id: uid("pii"),
    kind,
    text,
    bbox,
    blurRegions: blurRegions ?? [bbox],
    preview: preview ?? maskPartial(text),
  };
}

function planForPattern(pat: PatternDef, match: string): {
  preview: string;
  blurCharRanges: Array<{ start: number; end: number }>;
} {
  const mode = pat.mask ?? "partial";
  if (mode === "tail60") {
    return planTailMask(match);
  }
  if (mode === "labeled_tail60") {
    const labelRe = pat.labelRe ?? /^/;
    return planLabeledValueMask(match, new RegExp(labelRe.source, labelRe.flags));
  }
  const keepStart = pat.keepStart ?? 0;
  const keepEnd = pat.keepEnd ?? 0;
  const blurStart = keepStart;
  const blurEnd = Math.max(blurStart, match.length - keepEnd);
  return {
    preview: maskPartial(match, keepStart, keepEnd),
    blurCharRanges:
      blurStart < blurEnd ? [{ start: blurStart, end: blurEnd }] : [{ start: 0, end: match.length }],
  };
}

function pushPatternHits(text: string, results: DetectHit[]) {
  for (const pat of EXTRA_PATTERNS) {
    const re = new RegExp(pat.re.source, pat.re.flags.includes("g") ? pat.re.flags : `${pat.re.flags}g`);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const match = m[0];
      if (pat.validate && !pat.validate(match)) continue;
      const plan = planForPattern(pat, match);
      results.push({
        kind: pat.kind,
        match,
        index: m.index,
        preview: plan.preview,
        blurCharRanges: plan.blurCharRanges.map((r) => ({
          start: m!.index + r.start,
          end: m!.index + r.end,
        })),
      });
    }
  }
}

export function detectPiiInText(text: string): DetectHit[] {
  const results: DetectHit[] = [];

  for (const { match, index } of findEmails(text)) {
    const plan = planEmailMask(match);
    results.push({
      kind: "email",
      match,
      index,
      preview: plan.preview,
      blurCharRanges: plan.blurCharRanges.map((r) => ({
        start: index + r.start,
        end: index + r.end,
      })),
    });
  }

  const phoneRe = new RegExp(PHONE_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = phoneRe.exec(text)) !== null) {
    const digits = normalizeDigits(m[0]);
    if (digits.length < 10 || digits.length > 15) continue;
    if (/^\d{4}[\s-]?\d{4}[\s-]?\d{4}$/.test(m[0].trim())) continue;
    if (/^\d{3}[-\s]?\d{2}[-\s]?\d{4}$/.test(m[0].trim())) continue;
    // Skip card-length digit runs (handled as credit_card)
    if (digits.length >= 13 && digits.length <= 19) continue;
    const plan = planPhoneMask(m[0]);
    results.push({
      kind: "phone",
      match: m[0],
      index: m.index,
      preview: plan.preview,
      blurCharRanges: plan.blurCharRanges.map((r) => ({
        start: m!.index + r.start,
        end: m!.index + r.end,
      })),
    });
  }

  // Labeled cards first (EXTRA_PATTERNS), then bare Luhn cards with 60% tail frost
  const ccRe = new RegExp(CREDIT_CARD_RE.source, "g");
  while ((m = ccRe.exec(text)) !== null) {
    const digits = normalizeDigits(m[0]);
    if (digits.length < 13 || digits.length > 19) continue;
    if (!luhnOk(digits)) continue;
    const plan = planTailMask(m[0]);
    results.push({
      kind: "credit_card",
      match: m[0],
      index: m.index,
      preview: plan.preview,
      blurCharRanges: plan.blurCharRanges.map((r) => ({
        start: m!.index + r.start,
        end: m!.index + r.end,
      })),
    });
  }

  const keyRe = new RegExp(API_KEY_RE.source, "g");
  while ((m = keyRe.exec(text)) !== null) {
    if (m[0].includes("@")) continue;
    const plan = planTailMask(m[0]);
    results.push({
      kind: "api_key",
      match: m[0],
      index: m.index,
      preview: plan.preview,
      blurCharRanges: plan.blurCharRanges.map((r) => ({
        start: m!.index + r.start,
        end: m!.index + r.end,
      })),
    });
  }

  pushPatternHits(text, results);

  // Prefer longer / earlier; when equal length prefer credit_card / labeled over phone
  const priority = (k: PiiKind) =>
    k === "credit_card" ||
    k === "cvv" ||
    k === "bank_account" ||
    k === "labeled_name" ||
    k === "labeled_address" ||
    k === "upi_id" ||
    k === "invoice_id" ||
    k === "tax_id" ||
    k === "policy_number" ||
    k === "medical_id"
      ? 1
      : 0;

  results.sort(
    (a, b) =>
      a.index - b.index || b.match.length - a.match.length || priority(b.kind) - priority(a.kind),
  );
  const filtered: DetectHit[] = [];
  for (const r of results) {
    // Drop Aadhaar that sits inside a credit-card span
    if (r.kind === "aadhaar") {
      const insideCard = results.some(
        (c) =>
          c.kind === "credit_card" &&
          r.index >= c.index &&
          r.index + r.match.length <= c.index + c.match.length,
      );
      if (insideCard) continue;
      const after = text.slice(r.index + r.match.length, r.index + r.match.length + 6);
      if (/^[\s-]?\d{4}\b/.test(after)) continue;
    }
    const overlapIdx = filtered.findIndex(
      (f) => !(r.index + r.match.length <= f.index || f.index + f.match.length <= r.index),
    );
    if (overlapIdx >= 0) {
      const existing = filtered[overlapIdx]!;
      // Prefer credit_card over aadhaar/phone when spans collide
      if (
        (r.kind === "credit_card" &&
          (existing.kind === "aadhaar" ||
            existing.kind === "phone" ||
            r.match.length > existing.match.length)) ||
        (r.kind === "bank_account" &&
          (existing.kind === "aadhaar" || existing.kind === "phone"))
      ) {
        filtered[overlapIdx] = r;
      }
      continue;
    }
    filtered.push(r);
  }
  return filtered;
}

function glyphHeightForRange(
  words: OcrWord[],
  charToWord: number[],
  start: number,
  end: number,
  fallback: number,
): number {
  const heights: number[] = [];
  for (let i = start; i < end; i++) {
    const wi = charToWord[i];
    if (wi !== undefined && wi >= 0) {
      const h = words[wi]!.bbox.height;
      if (h > 0) heights.push(h);
    }
  }
  if (heights.length === 0) return Math.max(1, fallback);
  heights.sort((a, b) => a - b);
  return Math.max(1, heights[Math.floor(heights.length / 2)]!);
}

function blurRegionsForHit(
  f: DetectHit,
  words: OcrWord[],
  charToWord: number[],
): BBox[] {
  const fullBBox = bboxForCharRange(words, charToWord, f.index, f.index + f.match.length);
  const glyphH = glyphHeightForRange(
    words,
    charToWord,
    f.index,
    f.index + f.match.length,
    fullBBox.height,
  );
  // Center a tight band on the union box so OCR outliers don't inflate frost
  const y = fullBBox.y + (fullBBox.height - glyphH) / 2;

  const localRanges = f.blurCharRanges.map((r) => ({
    start: Math.max(0, r.start - f.index),
    end: Math.min(f.match.length, r.end - f.index),
  }));
  let regions = regionsFromCharRanges(f.match, fullBBox, localRanges);
  if (regions.length === 0) {
    regions = f.blurCharRanges.map((r) =>
      bboxForCharRange(words, charToWord, r.start, r.end),
    );
  }
  return regions.map((r) =>
    expandBlurRegion({
      x: r.x,
      y,
      width: Math.max(r.width, 4),
      height: glyphH,
    }),
  );
}

function mergeCardHits(existing: PiiHit[], cards: PiiHit[]): PiiHit[] {
  const out = [...existing];
  for (const c of cards) {
    const overlapIdx = out.findIndex((h) => {
      if (h.kind !== "credit_card" && h.kind !== "aadhaar" && h.kind !== "phone") return false;
      return !(
        c.bbox.x + c.bbox.width < h.bbox.x ||
        h.bbox.x + h.bbox.width < c.bbox.x ||
        c.bbox.y + c.bbox.height < h.bbox.y ||
        h.bbox.y + h.bbox.height < c.bbox.y
      );
    });
    if (overlapIdx >= 0) {
      const prev = out[overlapIdx]!;
      if (prev.kind !== "credit_card" || c.text.length >= prev.text.length) {
        out[overlapIdx] = c;
      }
    } else {
      out.push(c);
    }
  }
  return out;
}

export function detectPiiFromOcr(words: OcrWord[]): PiiHit[] {
  if (words.length === 0) return [];
  const { text, charToWord } = stitchOcrWords(words);
  const found = detectPiiInText(text);
  const hits: PiiHit[] = [];

  for (const f of found) {
    if (f.kind === "email") {
      const bbox = bboxForCharRange(words, charToWord, f.index, f.index + f.match.length);
      const glyphH = glyphHeightForRange(
        words,
        charToWord,
        f.index,
        f.index + f.match.length,
        bbox.height,
      );
      const y = bbox.y + (bbox.height - glyphH) / 2;
      const regions = emailBlurRegions(f.match, bbox).map((r) =>
        expandBlurRegion({ x: r.x, y, width: r.width, height: glyphH }),
      );
      hits.push({
        id: uid("pii"),
        kind: "email",
        text: f.match,
        bbox,
        blurRegions:
          regions.length > 0
            ? regions
            : [expandBlurRegion({ x: bbox.x, y, width: bbox.width, height: glyphH })],
        preview: f.preview,
      });
      continue;
    }

    if (f.kind === "phone") {
      const bbox = bboxForCharRange(words, charToWord, f.index, f.index + f.match.length);
      const glyphH = glyphHeightForRange(
        words,
        charToWord,
        f.index,
        f.index + f.match.length,
        bbox.height,
      );
      const y = bbox.y + (bbox.height - glyphH) / 2;
      const regions = phoneBlurRegions(f.match, bbox).map((r) =>
        expandBlurRegion({ x: r.x, y, width: r.width, height: glyphH }),
      );
      hits.push({
        id: uid("pii"),
        kind: "phone",
        text: f.match,
        bbox,
        blurRegions:
          regions.length > 0
            ? regions
            : [expandBlurRegion({ x: bbox.x, y, width: bbox.width, height: glyphH })],
        preview: f.preview,
      });
      continue;
    }

    hits.push(
      hitFromRange(
        f.kind,
        f.match,
        words,
        charToWord,
        f.index,
        f.index + f.match.length,
        blurRegionsForHit(f, words, charToWord),
        f.preview,
      ),
    );
  }

  return mergeCardHits(hits, detectCardsFromOcrWords(words));
}

export function frostAnnotationsFromHits(
  hits: PiiHit[],
  color: import("./types.js").AnnotationColor = "#00C7BE",
): import("./types.js").FrostAnnotation[] {
  return hits.flatMap((hit) =>
    hit.blurRegions.map((r) => ({
      id: uid("frost"),
      tool: "frost" as const,
      color,
      strokeWidth: 0,
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      intensity: FROST_UNIFORM_INTENSITY,
      piiId: hit.id,
    })),
  );
}

export const PII_KIND_LABELS: Record<PiiKind, string> = {
  email: "Email",
  phone: "Phone",
  credit_card: "Card",
  api_key: "API key",
  ssn: "SSN",
  aadhaar: "Aadhaar",
  pan: "PAN",
  passport: "Passport",
  iban: "IBAN",
  ifsc: "IFSC",
  gstin: "GSTIN",
  bank_account: "Bank acct",
  ipv4: "IPv4",
  ipv6: "IPv6",
  mac_address: "MAC",
  dob: "DOB",
  postal_code: "Postal",
  jwt: "JWT",
  aws_key: "AWS key",
  private_key: "Private key",
  cvv: "CVV",
  vehicle_reg: "Vehicle",
  labeled_name: "Name",
  labeled_address: "Address",
  upi_id: "UPI",
  swift_bic: "SWIFT",
  micr: "MICR",
  routing_number: "Routing",
  sort_code: "Sort code",
  customer_id: "Customer ID",
  cif: "CIF",
  folio: "Folio",
  demat: "Demat",
  cheque: "Cheque",
  invoice_id: "Invoice",
  tax_id: "Tax ID",
  driver_license: "DL",
  voter_id: "Voter ID",
  policy_number: "Policy",
  employee_id: "Employee ID",
  medical_id: "Medical ID",
  labeled_amount: "Amount",
  labeled_balance: "Balance",
  nominee: "Nominee",
  father_name: "Relative",
  branch_code: "Branch",
  passbook_no: "Passbook",
};
