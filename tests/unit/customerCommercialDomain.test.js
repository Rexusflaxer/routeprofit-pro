import { describe, expect, it } from "vitest";
import {
  calculateAmounts,
  isDateInRange,
  plusDays,
  rangesOverlap,
  roundQuantity,
  validateTransition,
} from "../../base44/functions/customerPlatformApi/entry.ts";

describe("customer commercial domain", () => {
  it("rekent hoeveelheden, centen en gemengde btw reproduceerbaar af", () => {
    const lines = [
      calculateAmounts(2_500, 3_995, 2_100),
      calculateAmounts(1_000, 1_250, 900),
      calculateAmounts(3_000, 333, 0),
    ];

    expect(lines).toEqual([
      { subtotal_cents: 9_988, tax_cents: 2_097, total_cents: 12_085 },
      { subtotal_cents: 1_250, tax_cents: 113, total_cents: 1_363 },
      { subtotal_cents: 999, tax_cents: 0, total_cents: 999 },
    ]);
    expect(lines.reduce((sum, line) => sum + line.total_cents, 0)).toBe(14_447);
  });

  it("rondt een factureerbare hoeveelheid omhoog met een minimum", () => {
    expect(roundQuantity(1_001, 250, 0)).toBe(1_250);
    expect(roundQuantity(250, 250, 1_000)).toBe(1_000);
    expect(roundQuantity(0, 1, 0)).toBe(0);
  });

  it("behandelt periodegrenzen inclusief en detecteert overlap", () => {
    expect(isDateInRange("2026-07-29", "2026-01-01", "2026-07-29")).toBe(true);
    expect(isDateInRange("2026-07-30", "2026-01-01", "2026-07-29")).toBe(false);
    expect(rangesOverlap("2026-01-01", "2026-06-30", "2026-06-30", null)).toBe(true);
    expect(rangesOverlap("2026-01-01", "2026-06-29", "2026-06-30", null)).toBe(false);
    expect(plusDays("2026-02-28", 1)).toBe("2026-03-01");
  });

  it("weigert ongeldige financiële invoer en lifecycle-overgangen", () => {
    expect(() => calculateAmounts(-1, 100, 2_100)).toThrow(/quantityMinor/);
    expect(() => calculateAmounts(1_000, 100, 10_001)).toThrow(/10000/);
    expect(() => validateTransition({ draft: ["review"] }, "draft", "active", "Contract"))
      .toThrow(/kan niet/);
  });
});
