// SP-API Fulfillment Inbound API v2024-03-20 — inbound plan creation + operation polling.
// Docs: https://developer-docs.amazon.com/sp-api/docs/fulfillment-inbound-api-v2024-03-20-use-case-guide

import { spRequest, type SpApiConfig } from "./sp-api";

const BASE = "/inbound/fba/2024-03-20";

export interface SourceAddress {
  name: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  stateOrProvinceCode: string;
  postalCode: string;
  countryCode: string;
  companyName?: string;
  email?: string;
  phoneNumber?: string;
}

export interface InboundPlanItem {
  msku: string;
  quantity: number;
  prepOwner?: "SELLER" | "AMAZON" | "NONE";
  labelOwner?: "SELLER" | "AMAZON" | "NONE";
  expiration?: string;
}

export interface CreateInboundPlanRequest {
  name: string;
  sourceAddress: SourceAddress;
  destinationMarketplaces: string[];
  items: InboundPlanItem[];
}

export interface CreateInboundPlanResponse {
  inboundPlanId: string;
  operationId: string;
}

export async function createInboundPlan(
  cfg: SpApiConfig,
  req: CreateInboundPlanRequest,
): Promise<CreateInboundPlanResponse> {
  return spRequest(cfg, `${BASE}/inboundPlans`, {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export interface InboundOperationProblem {
  code?: string;
  message?: string;
  details?: string;
  severity?: string;
}

export interface InboundOperation {
  operationId: string;
  operationStatus: "IN_PROGRESS" | "SUCCESS" | "FAILED";
  operationType?: string;
  operationProblems?: InboundOperationProblem[];
}

export async function getInboundOperation(
  cfg: SpApiConfig,
  operationId: string,
): Promise<InboundOperation> {
  return spRequest(cfg, `${BASE}/operations/${operationId}`);
}

export async function pollInboundOperation(
  cfg: SpApiConfig,
  operationId: string,
  options: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<InboundOperation> {
  const interval = options.intervalMs ?? 3_000;
  const deadline = Date.now() + (options.timeoutMs ?? 3 * 60 * 1000);
  while (Date.now() < deadline) {
    const op = await getInboundOperation(cfg, operationId);
    if (op.operationStatus !== "IN_PROGRESS") return op;
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error(`Inbound operation ${operationId} did not complete within ${options.timeoutMs ?? 180000}ms`);
}

export function summarizeProblems(problems: InboundOperationProblem[] | undefined): string {
  if (!problems || problems.length === 0) return "No details provided";
  return problems
    .map((p) => [p.code, p.message, p.details].filter(Boolean).join(": "))
    .join(" | ")
    .slice(0, 1000);
}
