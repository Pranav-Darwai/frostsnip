import { describe, expect, it } from "vitest";
import { detectCardsFromOcrWords } from "../src/cardOcr";
import { detectPiiFromOcr, detectPiiInText } from "../src/detectPii";

describe("card detection", () => {
  it("detects labeled and bare cards in text", () => {
    expect(
      detectPiiInText("Card: 4111 1111 1111 1111").some((h) => h.kind === "credit_card"),
    ).toBe(true);
    expect(detectPiiInText("4111 1111 1111 1111").some((h) => h.kind === "credit_card")).toBe(
      true,
    );
  });

  it("detects OCR-split 4-digit card groups", () => {
    const hits = detectCardsFromOcrWords([
      { text: "Card:", bbox: { x: 0, y: 100, width: 48, height: 16 } },
      { text: "4111", bbox: { x: 55, y: 100, width: 40, height: 16 } },
      { text: "1111", bbox: { x: 100, y: 100, width: 40, height: 16 } },
      { text: "1111", bbox: { x: 145, y: 100, width: 40, height: 16 } },
      { text: "1111", bbox: { x: 190, y: 100, width: 40, height: 16 } },
    ]);
    expect(hits.some((h) => h.kind === "credit_card")).toBe(true);
    expect(hits[0]!.blurRegions[0]!.height).toBeLessThan(30);
  });

  it("detectPiiFromOcr merges geometry card pass", () => {
    const hits = detectPiiFromOcr([
      { text: "Card:", bbox: { x: 0, y: 100, width: 48, height: 16 } },
      { text: "4111", bbox: { x: 55, y: 100, width: 40, height: 16 } },
      { text: "1111", bbox: { x: 100, y: 100, width: 40, height: 16 } },
      { text: "1111", bbox: { x: 145, y: 100, width: 40, height: 16 } },
      { text: "1111", bbox: { x: 190, y: 100, width: 40, height: 16 } },
    ]);
    expect(hits.some((h) => h.kind === "credit_card" && h.text.includes("4111"))).toBe(true);
  });
});
