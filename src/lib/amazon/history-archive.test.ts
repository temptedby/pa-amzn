import { describe, it, expect } from "vitest";
import { archiveWindows } from "./history-archive";

// William 2026-08-23: "make sure we are saving data from this month to go back further once we
// build over time, to not just rely on Amazon's 65 day limit."
describe("archiveWindows — Amazon refuses report windows wider than 31 days", () => {
  const now = new Date("2026-08-23T13:00:00Z");

  it("never asks for more than 31 days at once", () => {
    for (const [a, b] of archiveWindows(95, now)) {
      const span = (new Date(b).getTime() - new Date(a).getTime()) / 864e5 + 1;
      expect(span).toBeLessThanOrEqual(31);
    }
  });

  it("covers the whole range with no gap and no overlap", () => {
    const w = archiveWindows(95, now);
    for (let i = 1; i < w.length; i++) {
      const prevStart = new Date(w[i - 1][0]).getTime();
      const thisEnd = new Date(w[i][1]).getTime();
      expect((prevStart - thisEnd) / 864e5).toBe(1);   // exactly one day apart, back to back
    }
  });

  it("starts at today and never asks for a future date", () => {
    const w = archiveWindows(95, now);
    expect(w[0][1]).toBe("2026-08-23");
    for (const [, end] of w) expect(end <= "2026-08-23").toBe(true);
  });

  it("stops at the floor rather than running past it", () => {
    const w = archiveWindows(95, now);
    const oldest = w[w.length - 1][0];
    expect(oldest >= "2026-05-20").toBe(true);
  });

  it("newest window first, so the most useful data lands before a later chunk can time out", () => {
    const w = archiveWindows(95, now);
    for (let i = 1; i < w.length; i++) expect(w[i][1] < w[i - 1][1]).toBe(true);
  });

  it("handles a short top-up window in one call", () => {
    expect(archiveWindows(10, now)).toHaveLength(1);
  });

  it("a 40-day top-up is wider than the 14-day attribution window, which is the point", () => {
    // A day's sales keep landing for 14 days. Re-reading only yesterday would freeze each day at
    // roughly a third of its eventual sales, which is the error that made 08-19 read as zero.
    const w = archiveWindows(40, now);
    const oldest = new Date(w[w.length - 1][0]).getTime();
    const span = (now.getTime() - oldest) / 864e5;
    expect(span).toBeGreaterThan(14);
  });
});
