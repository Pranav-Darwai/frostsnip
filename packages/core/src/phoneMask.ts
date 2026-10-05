/**
 * Phone masking: frost the last 60%; keep the leading 40% readable.
 */
import { planTailMask, regionsFromCharRanges, type TailMaskPlan } from "./tailMask.js";

export type PhoneMaskPlan = TailMaskPlan;

export function planPhoneMask(phone: string): PhoneMaskPlan {
  return planTailMask(phone);
}

export function phoneBlurRegions(
  phone: string,
  bbox: { x: number; y: number; width: number; height: number },
): Array<{ x: number; y: number; width: number; height: number }> {
  const plan = planPhoneMask(phone);
  return regionsFromCharRanges(phone, bbox, plan.blurCharRanges);
}
