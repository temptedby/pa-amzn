import { describe, it, expect } from "vitest";
import { clampBidStep } from "./ad-engine";

// C1 regression (confabulator/ad-engine-audit-2026-06-25.md): the ±25%/run cap was breached by
// cent-rounding because round() ran AFTER the clamp. 22/80 logged rebids exceeded 25%. clampBidStep
// rounds the band edges inward so the final whole-cent bid never violates the cap.

const FLOOR = 0.1, CAP = 2.5, MAX_STEP = 0.25;

describe("clampBidStep — C1 cap-rounding fix", () => {
  it("never lets a small-bid INCREASE exceed +25% (the 0.10->0.13 / +30% case)", () => {
    const out = clampBidStep(0.1, 0.13);
    expect(out).toBeLessThanOrEqual(0.12);              // 0.10 * 1.25 = 0.125 -> floor 0.12
    expect((out - 0.1) / 0.1).toBeLessThanOrEqual(0.25 + 1e-9);
  });

  it("never lets a small-bid DECREASE exceed -25% (the 0.30->0.22 / -26.7% case)", () => {
    const out = clampBidStep(0.3, 0.22);
    expect(out).toBeGreaterThanOrEqual(0.23);            // 0.30 * 0.75 = 0.225 -> ceil 0.23
    expect((0.3 - out) / 0.3).toBeLessThanOrEqual(0.25 + 1e-9);
  });

  it("fixes the 0.11->0.14 / +27.3% case", () => {
    const out = clampBidStep(0.11, 0.14);
    expect(out).toBeLessThanOrEqual(0.13);              // 0.11 * 1.25 = 0.1375 -> floor 0.13
    expect((out - 0.11) / 0.11).toBeLessThanOrEqual(0.25 + 1e-9);
  });

  it("passes a raw target through unchanged when it sits inside the band", () => {
    expect(clampBidStep(1.0, 1.1)).toBe(1.1);            // +10%, within ±25%, whole cents
  });

  it("respects the global FLOOR and CAP", () => {
    expect(clampBidStep(0.1, 0.05)).toBeGreaterThanOrEqual(FLOOR); // can't go below $0.10
    expect(clampBidStep(2.5, 5.0)).toBeLessThanOrEqual(CAP);       // can't exceed $2.50
  });

  it("always returns whole cents", () => {
    for (let b = 0.1; b <= 2.5; b = +(b + 0.07).toFixed(2)) {
      const out = clampBidStep(b, b * 1.4);
      expect(+(out * 100).toFixed(6) % 1).toBe(0);
    }
  });

  it("PROPERTY: across the bid range, no clamped result ever breaches ±25%/run", () => {
    const cases: number[] = [];
    for (let b = 0.1; b <= 2.5; b = +(b + 0.01).toFixed(2)) cases.push(b);
    for (const base of cases) {
      for (const factor of [0.3, 0.5, 0.7, 0.76, 0.9, 1.1, 1.24, 1.5, 3]) {
        const out = clampBidStep(base, base * factor);
        const moved = Math.abs(out - base) / base;
        // inward rounding guarantees a STRICT cap: result stays inside [base*0.75, base*1.25]
        expect(moved).toBeLessThanOrEqual(MAX_STEP + 1e-9);
        expect(out).toBeGreaterThanOrEqual(FLOOR - 1e-9);
        expect(out).toBeLessThanOrEqual(CAP + 1e-9);
      }
    }
  });
});
