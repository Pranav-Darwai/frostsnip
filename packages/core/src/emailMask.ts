/**
 * Smart partial email masking.
 * Frosts only the middle of the local-part. Keeps prefix + @ + full domain visible.
 * Example: abcdefghsdbfksbdf@snkfbsdkbf.com → ab•••••••••••••••@snkfbsdkbf.com
 */

export interface EmailMaskPlan {
  /** Masked preview string */
  preview: string;
  /** Character ranges [start, end) within the full email that should be blurred */
  blurCharRanges: Array<{ start: number; end: number }>;
  localKeep: number;
  /** Full domain length kept visible (never frosted). */
  domainKeepEnd: number;
}

const EMAIL_RE =
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+/g;

export function findEmails(text: string): Array<{ match: string; index: number }> {
  const out: Array<{ match: string; index: number }> = [];
  const re = new RegExp(EMAIL_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({ match: m[0], index: m.index });
  }
  return out;
}

/**
 * Plan which characters to blur for an email.
 * - Keep first 2 chars of local-part (or 1 if very short)
 * - Keep "@" and the entire domain unfrosted (needed for context)
 * - Frost only the middle of the local-part
 */
export function planEmailMask(email: string): EmailMaskPlan {
  const at = email.indexOf("@");
  if (at < 0) {
    return {
      preview: email,
      blurCharRanges: [],
      localKeep: 0,
      domainKeepEnd: 0,
    };
  }

  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const localKeep = local.length <= 2 ? Math.min(1, local.length) : 2;

  const blurCharRanges: Array<{ start: number; end: number }> = [];

  // Blur middle of local-part only — never frost @ or domain
  if (localKeep < local.length) {
    blurCharRanges.push({ start: localKeep, end: at });
  }

  let preview = "";
  for (let i = 0; i < email.length; i++) {
    const inBlur = blurCharRanges.some((r) => i >= r.start && i < r.end);
    preview += inBlur ? "•" : email[i];
  }

  return {
    preview,
    blurCharRanges,
    localKeep,
    domainKeepEnd: domain.length,
  };
}

/** Convert blur char ranges to pixel regions using proportional character widths. */
export function emailBlurRegions(
  email: string,
  bbox: { x: number; y: number; width: number; height: number },
): Array<{ x: number; y: number; width: number; height: number }> {
  const plan = planEmailMask(email);
  const unit = email.length > 0 ? bbox.width / email.length : 0;
  return plan.blurCharRanges
    .map(({ start, end }) => ({
      x: bbox.x + unit * start,
      y: bbox.y,
      width: unit * (end - start),
      height: bbox.height,
    }))
    .filter((r) => r.width > 0.5);
}
