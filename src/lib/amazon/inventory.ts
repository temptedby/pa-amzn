import { spRequest, type SpApiConfig } from "./sp-api";

// FBA Inventory API v1 — /fba/inventory/v1/summaries.
// Docs: https://developer-docs.amazon.com/sp-api/docs/fba-inventory-api-v1-reference

export interface FbaInventorySummary {
  asin?: string;
  fnSku?: string;
  sellerSku: string;
  productName?: string;
  condition?: string;
  totalQuantity?: number;
  inventoryDetails?: {
    fulfillableQuantity?: number;
    inboundWorkingQuantity?: number;
    inboundShippedQuantity?: number;
    inboundReceivingQuantity?: number;
    reservedQuantity?: {
      totalReservedQuantity?: number;
      pendingCustomerOrderQuantity?: number;
      pendingTransshipmentQuantity?: number;
      fcProcessingQuantity?: number;
    };
    unfulfillableQuantity?: {
      totalUnfulfillableQuantity?: number;
      customerDamagedQuantity?: number;
      warehouseDamagedQuantity?: number;
      distributorDamagedQuantity?: number;
      carrierDamagedQuantity?: number;
      defectiveQuantity?: number;
      expiredQuantity?: number;
    };
    researchingQuantity?: {
      totalResearchingQuantity?: number;
    };
  };
  lastUpdatedTime?: string;
}

interface SummariesResponse {
  payload: {
    granularity: { granularityType: string; granularityId: string };
    inventorySummaries: FbaInventorySummary[];
  };
  pagination?: { nextToken?: string };
}

export async function fetchFbaInventory(
  cfg: SpApiConfig,
  marketplaceId: string,
): Promise<FbaInventorySummary[]> {
  const all: FbaInventorySummary[] = [];
  let nextToken: string | undefined;

  do {
    const qs = new URLSearchParams({
      details: "true",
      granularityType: "Marketplace",
      granularityId: marketplaceId,
      marketplaceIds: marketplaceId,
    });
    if (nextToken) qs.set("nextToken", nextToken);

    const path = `/fba/inventory/v1/summaries?${qs.toString()}`;
    const data = await spRequest<SummariesResponse>(cfg, path);

    all.push(...data.payload.inventorySummaries);
    nextToken = data.pagination?.nextToken;
  } while (nextToken);

  return all;
}

export function inboundQuantity(summary: FbaInventorySummary): number {
  const d = summary.inventoryDetails;
  if (!d) return 0;
  return (
    (d.inboundWorkingQuantity ?? 0) +
    (d.inboundShippedQuantity ?? 0) +
    (d.inboundReceivingQuantity ?? 0)
  );
}
