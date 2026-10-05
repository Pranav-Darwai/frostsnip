import type { PiiKind } from "./types.js";

export interface PatternDef {
  kind: PiiKind;
  re: RegExp;
  /**
   * - partial: keepStart/keepEnd char counts
   * - tail60: blur last 60% of whole match
   * - labeled_tail60: keep label visible; blur last 60% of value only
   */
  mask?: "partial" | "tail60" | "labeled_tail60";
  /** For labeled_tail60 — matches the label prefix including separators */
  labelRe?: RegExp;
  keepStart?: number;
  keepEnd?: number;
  validate?: (match: string) => boolean;
}

function normalizeDigits(s: string): string {
  return s.replace(/\D/g, "");
}

function luhnOk(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function aadhaarOk(raw: string): boolean {
  const d = normalizeDigits(raw);
  if (d.length !== 12) return false;
  if (/^(\d)\1{11}$/.test(d)) return false;
  return true;
}

/** Bare / spaced card numbers including classic 4x4 groups */
export const CREDIT_CARD_RE =
  /\b(?:\d{4}[ -]?){3}\d{4}\b|\b(?:\d[ -]*?){13,19}\b/g;

/** Labeled card line — works even when OCR is imperfect / Luhn fails */
export const LABELED_CARD_RE =
  /\b(?:card|cc|credit\s*card|debit\s*card)[\s:.#-]*\s*(?:\d{4}[\s-]?){3}\d{4}\b|\b(?:card|cc|credit\s*card|debit\s*card)[\s:.#-]*\s*(?:\d[ -]*?){12,19}\d\b/gi;

export const EXTRA_PATTERNS: PatternDef[] = [
  {
    kind: "ssn",
    re: /\b(?!000|666|9\d{2})\d{3}[-\s]?(?!00)\d{2}[-\s]?(?!0000)\d{4}\b/g,
    mask: "tail60",
  },
  {
    kind: "aadhaar",
    re: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
    mask: "tail60",
    validate: (raw) => {
      if (!aadhaarOk(raw)) return false;
      // Don't steal the first 12 digits of a 16-digit card (4-4-4-4)
      return true;
    },
  },
  {
    kind: "pan",
    re: /\b[A-Z]{5}\d{4}[A-Z]\b/g,
    mask: "tail60",
  },
  {
    kind: "passport",
    re: /\b(?:[A-Z]\d{7,8}|[A-Z]{2}\d{7})\b/g,
    mask: "tail60",
  },
  {
    kind: "iban",
    re: /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g,
    mask: "tail60",
    validate: (m) => m.length >= 15 && m.length <= 34,
  },
  {
    kind: "ifsc",
    re: /\b[A-Z]{4}0[A-Z0-9]{6}\b/g,
    mask: "tail60",
  },
  {
    kind: "gstin",
    re: /\b\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]\b/g,
    mask: "tail60",
  },
  {
    kind: "bank_account",
    // Passbook / statement / cheque leaf account numbers
    re: /\b(?:account(?:\s*(?:no\.?|number|#))?|acct(?:\s*(?:no\.?|number|#))?|a\/c(?:\s*(?:no\.?|number))?|ac(?:\s*(?:no\.?|number|#))|sb\s*a\/?c|savings\s*(?:a\/?c|account)|current\s*(?:a\/?c|account)|bank\s*account)[\s.:#-]*\d{9,18}\b/gi,
    mask: "labeled_tail60",
    labelRe:
      /^(?:account(?:\s*(?:no\.?|number|#))?|acct(?:\s*(?:no\.?|number|#))?|a\/c(?:\s*(?:no\.?|number))?|ac(?:\s*(?:no\.?|number|#))|sb\s*a\/?c|savings\s*(?:a\/?c|account)|current\s*(?:a\/?c|account)|bank\s*account)[\s.:#-]*/i,
  },
  {
    kind: "bank_account",
    re: /\b(?:account\s*(?:no\.?|number|#)|a\/c\s*(?:no\.?|number))[\s:.-]*\d{9,18}\b/gi,
    mask: "labeled_tail60",
    labelRe: /^(?:account\s*(?:no\.?|number|#)|a\/c\s*(?:no\.?|number))[\s:.-]*/i,
  },  {
    kind: "ipv4",
    re: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g,
    mask: "tail60",
  },
  {
    kind: "ipv6",
    re: /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b|\b(?:[0-9a-fA-F]{1,4}:){1,7}:\b|\b(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}\b/g,
    mask: "tail60",
  },
  {
    kind: "mac_address",
    re: /\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b/g,
    mask: "tail60",
  },
  {
    kind: "dob",
    re: /\b(?:dob|date\s*of\s*birth|born|birthday)[\s:.-]*\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}\b/gi,
    mask: "labeled_tail60",
    labelRe: /^(?:dob|date\s*of\s*birth|born|birthday)[\s:.-]*/i,
  },
  {
    kind: "dob",
    re: /\b(?:0?[1-9]|[12]\d|3[01])[\/.\-](?:0?[1-9]|1[0-2])[\/.\-](?:19|20)\d{2}\b/g,
    mask: "tail60",
  },
  {
    kind: "postal_code",
    re: /\b(?:zip|postal|pin\s*code|pincode)[\s:.-]*(?:\d{5}(?:-\d{4})?|\d{6})\b/gi,
    mask: "labeled_tail60",
    labelRe: /^(?:zip|postal|pin\s*code|pincode)[\s:.-]*/i,
  },
  {
    kind: "jwt",
    re: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
    mask: "tail60",
  },
  {
    kind: "aws_key",
    re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
    mask: "tail60",
  },
  {
    kind: "private_key",
    re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
    mask: "tail60",
  },
  {
    kind: "cvv",
    re: /\b(?:cvv|cvc|cid|security\s*code)[\s:.-]*\d{3,4}\b/gi,
    mask: "labeled_tail60",
    labelRe: /^(?:cvv|cvc|cid|security\s*code)[\s:.-]*/i,
  },
  {
    kind: "vehicle_reg",
    re: /\b[A-Z]{2}[-\s]?\d{1,2}[-\s]?[A-Z]{1,3}[-\s]?\d{1,4}\b/g,
    mask: "tail60",
    validate: (m) => normalizeDigits(m).length >= 3,
  },
  {
    kind: "labeled_name",
    // Value only after label — still matched as full line for bbox, mask skips label
    re: /\b(?:full\s*name|customer\s*name|patient\s*name|account\s*holder|beneficiary|payee|bill\s*to|sold\s*to|ship\s*to|name)[\s:.-]+[A-Z][a-zA-Z.'-]+(?:[ \t]+[A-Z][a-zA-Z.'-]+){0,4}\b/gi,
    mask: "labeled_tail60",
    labelRe:
      /^(?:full\s*name|customer\s*name|patient\s*name|account\s*holder|beneficiary|payee|bill\s*to|sold\s*to|ship\s*to|name)[\s:.-]*/i,
  },
  {
    kind: "labeled_address",
    re: /\b(?:address|addr|residence|shipping\s*address|billing\s*address|permanent\s*address|correspondence)[\s:.-]+[^\n]{8,140}/gi,
    mask: "labeled_tail60",
    labelRe:
      /^(?:address|addr|residence|shipping\s*address|billing\s*address|permanent\s*address|correspondence)[\s:.-]*/i,
  },
  {
    kind: "credit_card",
    re: LABELED_CARD_RE,
    mask: "labeled_tail60",
    labelRe: /^(?:card|cc|credit\s*card|debit\s*card)[\s:.-]*/i,
    validate: (m) => {
      const d = normalizeDigits(m);
      return d.length >= 13 && d.length <= 19;
    },
  },

  // ——— UPI / bank rails (invoices, passbooks, payment slips) ———
  {
    kind: "upi_id",
    re: /\b[a-zA-Z0-9._-]{2,256}@(?:oksbi|okhdfcbank|okicici|okaxis|ybl|ibl|axl|paytm|apl|upi|waaxis|wapaytm|nsdl|pthdfc|pz|icici|sbi|axisbank|yesbankltd|kotak|barb|cnrb|mahb)\b/gi,
    mask: "tail60",
  },
  {
    kind: "upi_id",
    re: /\b(?:upi(?:\s*id)?|vpa)[\s:.-]*[a-zA-Z0-9._-]{2,64}@[a-zA-Z0-9]{2,32}\b/gi,
    mask: "labeled_tail60",
    labelRe: /^(?:upi(?:\s*id)?|vpa)[\s:.-]*/i,
  },
  {
    kind: "swift_bic",
    re: /\b(?:swift|bic|swift\s*code|bic\s*code)[\s:.-]*[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b/gi,
    mask: "labeled_tail60",
    labelRe: /^(?:swift|bic|swift\s*code|bic\s*code)[\s:.-]*/i,
  },  {
    kind: "micr",
    re: /\b(?:micr(?:\s*code)?)[\s:.-]*\d{9}\b/gi,
    mask: "labeled_tail60",
    labelRe: /^(?:micr(?:\s*code)?)[\s:.-]*/i,
  },
  {
    kind: "routing_number",
    re: /\b(?:routing(?:\s*(?:no|number|#))?|aba(?:\s*(?:no|number)?)?|transit(?:\s*(?:no|number)?)?)[\s:.-]*\d{9}\b/gi,
    mask: "labeled_tail60",
    labelRe:
      /^(?:routing(?:\s*(?:no|number|#))?|aba(?:\s*(?:no|number)?)?|transit(?:\s*(?:no|number)?)?)[\s:.-]*/i,
  },
  {
    kind: "sort_code",
    re: /\b(?:sort\s*code)[\s:.-]*\d{2}[- ]?\d{2}[- ]?\d{2}\b/gi,
    mask: "labeled_tail60",
    labelRe: /^(?:sort\s*code)[\s:.-]*/i,
  },

  // ——— Passbook / mutual fund / demat ———
  {
    kind: "customer_id",
    re: /\b(?:customer\s*(?:id|no|number|#)|cust(?:omer)?\s*id|client\s*(?:id|code)|customer\s*code)[\s:.-]*[A-Z0-9-]{4,20}\b/gi,
    mask: "labeled_tail60",
    labelRe:
      /^(?:customer\s*(?:id|no|number|#)|cust(?:omer)?\s*id|client\s*(?:id|code)|customer\s*code)[\s:.-]*/i,
  },
  {
    kind: "cif",
    re: /\b(?:cif(?:\s*(?:no|number|id|#))?)[\s:.-]*\d{4,16}\b/gi,
    mask: "labeled_tail60",
    labelRe: /^(?:cif(?:\s*(?:no|number|id|#))?)[\s:.-]*/i,
  },
  {
    kind: "folio",
    re: /\b(?:folio(?:\s*(?:no|number|#))?)[\s:.-]*[A-Z0-9\/-]{5,24}\b/gi,
    mask: "labeled_tail60",
    labelRe: /^(?:folio(?:\s*(?:no|number|#))?)[\s:.-]*/i,
  },
  {
    kind: "demat",
    re: /\b(?:demat|dp\s*id|bo\s*id|depository)[\s:.-]*[A-Z0-9]{8,16}\b/gi,
    mask: "labeled_tail60",
    labelRe: /^(?:demat|dp\s*id|bo\s*id|depository)[\s:.-]*/i,
  },
  {
    kind: "cheque",
    re: /\b(?:cheque(?:\s*(?:no|number|#))?|check(?:\s*(?:no|number|#))?)[\s:.-]*\d{4,10}\b/gi,
    mask: "labeled_tail60",
    labelRe: /^(?:cheque(?:\s*(?:no|number|#))?|check(?:\s*(?:no|number|#))?)[\s:.-]*/i,
  },
  {
    kind: "branch_code",
    re: /\b(?:branch(?:\s*(?:code|no|number|#))?|br(?:anch)?\s*code)[\s:.-]*[A-Z0-9-]{3,12}\b/gi,
    mask: "labeled_tail60",
    labelRe: /^(?:branch(?:\s*(?:code|no|number|#))?|br(?:anch)?\s*code)[\s:.-]*/i,
  },
  {
    kind: "passbook_no",
    re: /\b(?:pass\s*book(?:\s*(?:no|number|#))?|passbook(?:\s*(?:no|number|#))?)[\s:.-]*[A-Z0-9-]{4,20}\b/gi,
    mask: "labeled_tail60",
    labelRe: /^(?:pass\s*book(?:\s*(?:no|number|#))?|passbook(?:\s*(?:no|number|#))?)[\s:.-]*/i,
  },
  {
    kind: "nominee",
    re: /\b(?:nominee(?:\s*name)?)[\s:.-]+[A-Z][a-zA-Z.'-]+(?:[ \t]+[A-Z][a-zA-Z.'-]+){0,4}\b/gi,
    mask: "labeled_tail60",
    labelRe: /^(?:nominee(?:\s*name)?)[\s:.-]*/i,
  },
  {
    kind: "father_name",
    re: /\b(?:father'?s?\s*name|mother'?s?\s*name|guardian(?:\s*name)?|s\/o|d\/o|w\/o|c\/o)[\s:.-]+[A-Z][a-zA-Z.'-]+(?:[ \t]+[A-Z][a-zA-Z.'-]+){0,4}\b/gi,
    mask: "labeled_tail60",
    labelRe:
      /^(?:father'?s?\s*name|mother'?s?\s*name|guardian(?:\s*name)?|s\/o|d\/o|w\/o|c\/o)[\s:.-]*/i,
  },
  {
    kind: "labeled_balance",
    re: /\b(?:balance|avail(?:able)?\s*bal(?:ance)?|closing\s*balance|opening\s*balance|ledger\s*balance)[\s:.-]*(?:(?:rs\.?|inr|usd|\$|€|£)\s*)?[\d,]+\.?\d{0,2}\b/gi,
    mask: "labeled_tail60",
    labelRe:
      /^(?:balance|avail(?:able)?\s*bal(?:ance)?|closing\s*balance|opening\s*balance|ledger\s*balance)[\s:.-]*/i,
  },
  {
    kind: "labeled_amount",
    re: /\b(?:amount(?:\s*due)?|total(?:\s*due)?|net\s*(?:pay|amount)|grand\s*total|invoice\s*total|payable|salary|wage)[\s:.-]*(?:(?:rs\.?|inr|usd|\$|€|£)\s*)?[\d,]+\.?\d{0,2}\b/gi,
    mask: "labeled_tail60",
    labelRe:
      /^(?:amount(?:\s*due)?|total(?:\s*due)?|net\s*(?:pay|amount)|grand\s*total|invoice\s*total|payable|salary|wage)[\s:.-]*/i,
  },

  // ——— Invoices / tax / insurance / HR / medical ———
  {
    kind: "invoice_id",
    re: /\b(?:invoice(?:\s*(?:no|number|#|id))?|inv(?:oice)?\s*(?:no|number|#)|bill\s*(?:no|number|#)|po\s*(?:no|number|#)|purchase\s*order|receipt\s*(?:no|number|#))[\s:.-]*[A-Z0-9\/-]{4,28}\b/gi,
    mask: "labeled_tail60",
    labelRe:
      /^(?:invoice(?:\s*(?:no|number|#|id))?|inv(?:oice)?\s*(?:no|number|#)|bill\s*(?:no|number|#)|po\s*(?:no|number|#)|purchase\s*order|receipt\s*(?:no|number|#))[\s:.-]*/i,
  },
  {
    kind: "tax_id",
    re: /\b(?:tin|ein|vat(?:\s*(?:no|number|id))?|tax\s*(?:id|no|number)|itin|nin|national\s*id|sin)[\s:.-]*[A-Z0-9-]{5,20}\b/gi,
    mask: "labeled_tail60",
    labelRe:
      /^(?:tin|ein|vat(?:\s*(?:no|number|id))?|tax\s*(?:id|no|number)|itin|nin|national\s*id|sin)[\s:.-]*/i,
  },
  {
    kind: "driver_license",
    re: /\b(?:dl(?:\s*(?:no|number|#))?|driver'?s?\s*licen[cs]e(?:\s*(?:no|number)?)?|driving\s*licen[cs]e(?:\s*(?:no|number)?)?)[\s:.-]*[A-Z0-9][A-Z0-9\s-]{4,22}[A-Z0-9]\b/gi,
    mask: "labeled_tail60",
    labelRe:
      /^(?:dl(?:\s*(?:no|number|#))?|driver'?s?\s*licen[cs]e(?:\s*(?:no|number)?)?|driving\s*licen[cs]e(?:\s*(?:no|number)?)?)[\s:.-]*/i,
  },
  {
    kind: "voter_id",
    re: /\b(?:voter(?:\s*(?:id|no|number))?|epic(?:\s*(?:no|number)?)?|election\s*id)[\s:.-]*[A-Z]{3}[0-9]{7}\b/gi,
    mask: "labeled_tail60",
    labelRe: /^(?:voter(?:\s*(?:id|no|number))?|epic(?:\s*(?:no|number)?)?|election\s*id)[\s:.-]*/i,
  },
  {
    kind: "voter_id",
    re: /\b[A-Z]{3}[0-9]{7}\b/g,
    mask: "tail60",
    validate: (m) => /^[A-Z]{3}\d{7}$/.test(m),
  },
  {
    kind: "policy_number",
    re: /\b(?:policy(?:\s*(?:no|number|#))?|claim(?:\s*(?:no|number|#))?|insurance(?:\s*(?:no|id))?)[\s:.-]*[A-Z0-9\/-]{5,28}\b/gi,
    mask: "labeled_tail60",
    labelRe:
      /^(?:policy(?:\s*(?:no|number|#))?|claim(?:\s*(?:no|number|#))?|insurance(?:\s*(?:no|id))?)[\s:.-]*/i,
  },
  {
    kind: "employee_id",
    re: /\b(?:employee(?:\s*(?:id|no|number|#))?|emp(?:\s*(?:id|no|code))?|staff(?:\s*(?:id|no|number))?)[\s:.-]*[A-Z0-9-]{3,20}\b/gi,
    mask: "labeled_tail60",
    labelRe:
      /^(?:employee(?:\s*(?:id|no|number|#))?|emp(?:\s*(?:id|no|code))?|staff(?:\s*(?:id|no|number))?)[\s:.-]*/i,
  },
  {
    kind: "medical_id",
    re: /\b(?:mrn|medical\s*record(?:\s*(?:no|number|#))?|patient\s*(?:id|no)|uhid|health\s*id|abha)[\s:.-]*[A-Z0-9-]{4,24}\b/gi,
    mask: "labeled_tail60",
    labelRe:
      /^(?:mrn|medical\s*record(?:\s*(?:no|number|#))?|patient\s*(?:id|no)|uhid|health\s*id|abha)[\s:.-]*/i,
  },
];

export const API_KEY_RE =
  /\b(?:sk|pk|rk)-(?:live|test)?[_-]?[A-Za-z0-9]{16,}\b|\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b|\bxox[baprs]-[A-Za-z0-9-]{10,}\b|\bAIza[0-9A-Za-z\-_]{20,}\b/g;

export { normalizeDigits, luhnOk };
