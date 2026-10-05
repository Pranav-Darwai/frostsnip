/**
 * Confirmation-friendly masking: frost the last 60%, keep the leading 40% readable.
 */

export interface TailMaskPlan {
  preview: string;
  blurCharRanges: Array<{ start: number; end: number }>;
  keepStart: number;
}

export const BLUR_FROM_END_RATIO = 0.6;

export function planTailMask(
  text: string,
  ratio: number = BLUR_FROM_END_RATIO,
): TailMaskPlan {
  if (text.length === 0) {
    return { preview: text, blurCharRanges: [], keepStart: 0 };
  }

  const blurLen = Math.max(1, Math.round(text.length * ratio));
  const keepStart = Math.max(0, text.length - blurLen);
  const blurCharRanges =
    keepStart < text.length ? [{ start: keepStart, end: text.length }] : [];

  let preview = "";
  for (let i = 0; i < text.length; i++) {
    preview += i >= keepStart ? "•" : text[i];
  }

  return { preview, blurCharRanges, keepStart };
}

/**
 * For labeled fields like "Name Jane Rivera" / "Address: 221B Baker…":
 * keep the label visible; apply 60% tail frost only to the value.
 */
export function planLabeledValueMask(
  full: string,
  labelPattern: RegExp,
): TailMaskPlan & { valueStart: number } {
  const m = labelPattern.exec(full);
  if (!m) {
    const plan = planTailMask(full);
    return { ...plan, valueStart: 0 };
  }

  const valueStart = m[0].length;
  const value = full.slice(valueStart);
  if (!value.trim()) {
    return {
      preview: full,
      blurCharRanges: [],
      keepStart: full.length,
      valueStart,
    };
  }

  const valuePlan = planTailMask(value);
  return {
    preview: full.slice(0, valueStart) + valuePlan.preview,
    blurCharRanges: valuePlan.blurCharRanges.map((r) => ({
      start: valueStart + r.start,
      end: valueStart + r.end,
    })),
    keepStart: valueStart + valuePlan.keepStart,
    valueStart,
  };
}

export function regionsFromCharRanges(
  text: string,
  bbox: { x: number; y: number; width: number; height: number },
  ranges: Array<{ start: number; end: number }>,
): Array<{ x: number; y: number; width: number; height: number }> {
  const unit = text.length > 0 ? bbox.width / text.length : 0;
  return ranges
    .map(({ start, end }) => ({
      x: bbox.x + unit * start,
      y: bbox.y,
      width: unit * (end - start),
      height: bbox.height,
    }))
    .filter((r) => r.width > 0.5);
}
