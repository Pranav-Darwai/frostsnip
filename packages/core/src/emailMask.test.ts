import { describe, expect, it } from "vitest";
import { detectPiiFromOcr, detectPiiInText } from "../src/detectPii";
import { emailBlurRegions, planEmailMask } from "../src/emailMask";
import { planPhoneMask } from "../src/phoneMask";

describe("planEmailMask", () => {
  it("frosts local middle but keeps full domain visible", () => {
    const email = "abcdefghsdbfksbdf@snkfbsdkbf.com";
    const plan = planEmailMask(email);
    expect(plan.preview.startsWith("ab")).toBe(true);
    expect(plan.preview).toBe("ab•••••••••••••••@snkfbsdkbf.com");
    expect(plan.preview).toContain("@snkfbsdkbf.com");
    expect(plan.blurCharRanges).toHaveLength(1);
    expect(plan.blurCharRanges[0]).toEqual({ start: 2, end: email.indexOf("@") });
  });
});

describe("planPhoneMask", () => {
  it("blurs the last 60% and keeps the start visible", () => {
    const phone = "+1 415-555-2671";
    const plan = planPhoneMask(phone);
    const blurLen = Math.round(phone.length * 0.6);
    const keepStart = phone.length - blurLen;
    expect(plan.keepStart).toBe(keepStart);
    expect(plan.preview.slice(0, keepStart)).toBe(phone.slice(0, keepStart));
    expect(plan.preview.slice(keepStart)).toBe("•".repeat(blurLen));
  });
});

describe("emailBlurRegions", () => {
  it("returns non-empty pixel regions for long emails", () => {
    const email = "abcdefghsdbfksbdf@snkfbsdkbf.com";
    const regions = emailBlurRegions(email, { x: 10, y: 20, width: 300, height: 16 });
    expect(regions.length).toBeGreaterThan(0);
  });
});

describe("detectPiiInText", () => {
  it("finds emails with domain kept in preview", () => {
    const hits = detectPiiInText("Contact abcdefghsdbfksbdf@snkfbsdkbf.com please");
    expect(hits.some((h) => h.kind === "email")).toBe(true);
  });

  it("finds phones and blurs only the last 60%", () => {
    const hits = detectPiiInText("Call +1 415-555-2671 now");
    const phone = hits.find((h) => h.kind === "phone");
    expect(phone).toBeTruthy();
    const match = phone!.match;
    const keepStart = match.length - Math.round(match.length * 0.6);
    expect(phone!.preview.startsWith(match.slice(0, keepStart))).toBe(true);
  });

  it("finds luhn-valid cards", () => {
    const hits = detectPiiInText("Card 4111 1111 1111 1111 expires");
    expect(hits.some((h) => h.kind === "credit_card")).toBe(true);
  });

  it("finds expanded PII/CII kinds", () => {
    const sample = [
      "SSN 078-05-1120",
      "Aadhaar 2345 6789 0123",
      "PAN ABCDE1234F",
      "IFSC HDFC0001234",
      "GSTIN 22AAAAA0000A1Z5",
      "Account 123456789012",
      "IP 192.168.1.42",
      "MAC aa:bb:cc:dd:ee:ff",
      "DOB 15/08/1990",
      "AKIAIOSFODNN7EXAMPLE",
      "sk-live-abcdefghijklmnopqrstuvwxyz",
      "CVV 123",
      "Name John Doe",
      "Passport A1234567",
      "IBAN DE89370400440532013000",
      "Vehicle KA01AB1234",
      "PIN code 560001",
    ].join("\n");

    const hits = detectPiiInText(sample);
    const kinds = new Set(hits.map((h) => h.kind));
    expect(kinds.has("ssn")).toBe(true);
    expect(kinds.has("aadhaar")).toBe(true);
    expect(kinds.has("pan")).toBe(true);
    expect(kinds.has("ifsc")).toBe(true);
    expect(kinds.has("gstin")).toBe(true);
    expect(kinds.has("bank_account")).toBe(true);
    expect(kinds.has("ipv4")).toBe(true);
    expect(kinds.has("mac_address")).toBe(true);
    expect(kinds.has("dob")).toBe(true);
    expect(kinds.has("aws_key")).toBe(true);
    expect(kinds.has("api_key")).toBe(true);
    expect(kinds.has("cvv")).toBe(true);
    expect(kinds.has("labeled_name")).toBe(true);
    expect(kinds.has("passport")).toBe(true);
    expect(kinds.has("iban")).toBe(true);
    expect(kinds.has("vehicle_reg")).toBe(true);
    expect(kinds.has("postal_code")).toBe(true);
  });
});

describe("detectPiiFromOcr", () => {
  it("maps email to blur regions from word boxes", () => {
    const email = "abcdefghsdbfksbdf@snkfbsdkbf.com";
    const hits = detectPiiFromOcr([
      { text: email, bbox: { x: 0, y: 0, width: email.length * 8, height: 14 } },
    ]);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.kind).toBe("email");
    expect(hits[0]!.preview).toContain("@snkfbsdkbf.com");
  });
});
