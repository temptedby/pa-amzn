import { gunzipSync } from "node:zlib";
import { spRequest, type SpApiConfig } from "./sp-api";

// SP-API Reports API v2021-06-30.
// Flow: createReport → poll until processingStatus terminal → getReportDocument →
// fetch pre-signed S3 URL → (optionally) gunzip → return text.

const BASE = "/reports/2021-06-30";

export const REPORT_TYPES = {
  RESTOCK_RECOMMENDATIONS: "GET_RESTOCK_INVENTORY_RECOMMENDATIONS_REPORT",
  FBA_INVENTORY_PLANNING: "GET_FBA_INVENTORY_PLANNING_DATA",
  FBA_INVENTORY: "GET_FBA_MYI_ALL_INVENTORY_DATA",
} as const;

export type ProcessingStatus = "IN_QUEUE" | "IN_PROGRESS" | "DONE" | "FATAL" | "CANCELLED";

export interface Report {
  reportId: string;
  reportType: string;
  marketplaceIds?: string[];
  processingStatus: ProcessingStatus;
  createdTime?: string;
  processingStartTime?: string;
  processingEndTime?: string;
  reportDocumentId?: string;
}

export interface ReportDocument {
  reportDocumentId: string;
  url: string;
  compressionAlgorithm?: "GZIP";
}

export async function createReport(
  cfg: SpApiConfig,
  reportType: string,
  marketplaceIds: string[],
): Promise<string> {
  const res = await spRequest<{ reportId: string }>(cfg, `${BASE}/reports`, {
    method: "POST",
    body: JSON.stringify({ reportType, marketplaceIds }),
  });
  return res.reportId;
}

export async function getReport(cfg: SpApiConfig, reportId: string): Promise<Report> {
  return spRequest<Report>(cfg, `${BASE}/reports/${reportId}`);
}

export async function getReportDocument(
  cfg: SpApiConfig,
  reportDocumentId: string,
): Promise<ReportDocument> {
  return spRequest<ReportDocument>(cfg, `${BASE}/documents/${reportDocumentId}`);
}

export interface PollOptions {
  intervalMs?: number;
  timeoutMs?: number;
  onStatus?: (status: ProcessingStatus) => void;
}

export async function pollReport(
  cfg: SpApiConfig,
  reportId: string,
  options: PollOptions = {},
): Promise<Report> {
  const interval = options.intervalMs ?? 5_000;
  const deadline = Date.now() + (options.timeoutMs ?? 5 * 60 * 1000);

  while (Date.now() < deadline) {
    const r = await getReport(cfg, reportId);
    options.onStatus?.(r.processingStatus);
    if (r.processingStatus === "DONE" || r.processingStatus === "FATAL" || r.processingStatus === "CANCELLED") {
      return r;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error(`Report ${reportId} did not finish within ${options.timeoutMs ?? 300000}ms`);
}

export async function downloadReportText(doc: ReportDocument): Promise<string> {
  const res = await fetch(doc.url);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Report document download failed: ${res.status} ${text}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (doc.compressionAlgorithm === "GZIP") {
    return gunzipSync(buf).toString("utf-8");
  }
  return buf.toString("utf-8");
}

// Convenience: run the whole dance end-to-end.
export async function runReport(
  cfg: SpApiConfig,
  reportType: string,
  marketplaceIds: string[],
  options: PollOptions = {},
): Promise<string> {
  const reportId = await createReport(cfg, reportType, marketplaceIds);
  const report = await pollReport(cfg, reportId, options);
  if (report.processingStatus !== "DONE") {
    throw new Error(`Report ${reportId} ended with status ${report.processingStatus}`);
  }
  if (!report.reportDocumentId) {
    throw new Error(`Report ${reportId} DONE but no reportDocumentId`);
  }
  const doc = await getReportDocument(cfg, report.reportDocumentId);
  return downloadReportText(doc);
}
