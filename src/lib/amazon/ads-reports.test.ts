import { describe, it, expect } from "vitest";
import {
  reportKey, hoursBetween, isStaleJob, isFreshData, duplicateReportId,
  JOB_STALE_HOURS, DATA_STALE_HOURS, type ReportSpec, type ReportJob,
} from "./ads-reports";

// Deferred report jobs (measured 2026-08-02): Amazon's queue takes ~9 minutes on this account,
// the engine allowed 140s, so the report step was failing routinely. These are the pure pieces of
// the create-now / collect-later design.

const spec = (o: Partial<ReportSpec> = {}): ReportSpec => ({
  purpose: "engine-mtd", adProduct: "SPONSORED_PRODUCTS", reportTypeId: "spTargeting",
  groupBy: ["targeting"], columns: ["keywordId", "cost", "sales14d"],
  startDate: "2026-08-01", endDate: "2026-08-02", ...o,
});

describe("reportKey", () => {
  it("is stable across runs for the same request", () => {
    expect(reportKey(spec())).toBe(reportKey(spec()));
  });
  it("ignores column ORDER so a harmless reshuffle does not orphan a live job", () => {
    expect(reportKey(spec({ columns: ["sales14d", "cost", "keywordId"] }))).toBe(reportKey(spec()));
  });
  it("changes when the date range changes", () => {
    expect(reportKey(spec({ endDate: "2026-08-03" }))).not.toBe(reportKey(spec()));
  });
  it("changes when the purpose changes, so two consumers never share a job", () => {
    expect(reportKey(spec({ purpose: "reintro-history-1" }))).not.toBe(reportKey(spec()));
  });
  it("changes when the ad product changes", () => {
    expect(reportKey(spec({ adProduct: "SPONSORED_BRANDS" }))).not.toBe(reportKey(spec()));
  });
});

describe("hoursBetween", () => {
  it("measures elapsed hours", () => {
    expect(hoursBetween("2026-08-02T00:00:00Z", "2026-08-02T06:00:00Z")).toBe(6);
  });
  it("is negative when the order is reversed", () => {
    expect(hoursBetween("2026-08-02T06:00:00Z", "2026-08-02T00:00:00Z")).toBe(-6);
  });
});

const job = (o: Partial<ReportJob> = {}): ReportJob => ({
  key: "k", reportId: "r", status: "REQUESTED",
  requestedAt: "2026-08-02T00:00:00Z", collectedAt: null, ...o,
});

describe("isStaleJob", () => {
  it("keeps polling a young job", () => {
    expect(isStaleJob(job(), "2026-08-02T09:00:00Z")).toBe(false);
  });
  it("abandons a job that never completed within the stale window", () => {
    expect(isStaleJob(job(), "2026-08-03T00:00:00Z")).toBe(true);   // exactly 24h
    expect(isStaleJob(job(), "2026-08-04T00:00:00Z")).toBe(true);
  });
  it("never calls a COMPLETED job stale", () => {
    expect(isStaleJob(job({ status: "COMPLETED" }), "2026-08-09T00:00:00Z")).toBe(false);
  });
  it("honours a custom window", () => {
    expect(isStaleJob(job(), "2026-08-02T02:00:00Z", 1)).toBe(true);
  });
  it("uses a 24h default", () => expect(JOB_STALE_HOURS).toBe(24));
});

describe("isFreshData", () => {
  it("acts on data collected inside the freshness window", () => {
    expect(isFreshData("2026-08-02T00:00:00Z", "2026-08-02T01:00:00Z")).toBe(true); // 1h
  });
  it("refuses data past the window, so the engine re-requests instead of acting on stale numbers", () => {
    expect(isFreshData("2026-08-02T00:00:00Z", "2026-08-02T02:00:00Z")).toBe(false); // exactly 2h
  });
  // Was "outlives the 6-hourly cron by design". That was the bug, not the design: reportKey ends
  // with the report's END DATE, which only changes at UTC midnight, so a window longer than a day
  // could never expire and all four runs re-read one snapshot. On 2026-08-16 the 06Z, 12Z and 18Z
  // runs each read $199.91 against a live $320.99. The window must now be SHORTER than the cron so
  // every run re-requests, which is affordable because getReport waits inline for the result.
  it("expires inside the 6-hourly cron, so every run gets its own reading", () => {
    expect(DATA_STALE_HOURS).toBeLessThan(6);
  });
});

describe("duplicateReportId", () => {
  it("adopts the existing report from Amazon's 425 duplicate detail", () => {
    expect(duplicateReportId("The Request is a duplicate of : d0bc21ef-f60b-45cf-8be1-9ef2f8288f9e"))
      .toBe("d0bc21ef-f60b-45cf-8be1-9ef2f8288f9e");
  });
  it("returns null when there is no uuid to adopt", () => {
    expect(duplicateReportId("Throttled")).toBeNull();
    expect(duplicateReportId(null)).toBeNull();
    expect(duplicateReportId(undefined)).toBeNull();
  });
  it("does not mistake a short hex run for a report id", () => {
    expect(duplicateReportId("error code deadbeef")).toBeNull();
  });
});
