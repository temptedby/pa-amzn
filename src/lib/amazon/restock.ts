// Parser for GET_RESTOCK_INVENTORY_RECOMMENDATIONS_REPORT.
// Amazon returns a TSV with slightly varying column names per marketplace/region,
// so we normalize headers and read by a lookup table.

export interface RestockRecommendation {
  sellerSku: string;
  asin?: string;
  productName?: string;
  condition?: string;
  currentInventory?: number;
  unitsYouCanShip?: number;
  recommendedReplenishmentQuantity?: number;
  recommendedShipDate?: string;
  alert?: string;
  daysOfSupply?: number;
}

// Map a raw TSV header to one of our canonical keys.
// Headers seen across marketplaces: "SKU", "Product Name", "Condition", "ASIN",
// "Current Inventory", "Units you can Ship to Amazon", "Recommended replenishment quantity",
// "Recommended ship date", "Alert", "Days of supply (by marketplace)"
function canonicalize(header: string): keyof RestockRecommendation | null {
  const h = header.trim().toLowerCase();
  if (h === "sku" || h === "merchant sku" || h === "seller sku") return "sellerSku";
  if (h === "asin") return "asin";
  if (h === "product name") return "productName";
  if (h === "condition") return "condition";
  if (h === "current inventory" || h === "available") return "currentInventory";
  if (h === "units you can ship to amazon" || h === "units you can ship") return "unitsYouCanShip";
  if (h === "recommended replenishment quantity" || h === "recommended inbound quantity")
    return "recommendedReplenishmentQuantity";
  if (h === "recommended ship date") return "recommendedShipDate";
  if (h === "alert") return "alert";
  if (h.startsWith("days of supply")) return "daysOfSupply";
  return null;
}

function toInt(v: string | undefined): number | undefined {
  if (v === undefined || v.trim() === "" || v.trim() === "-") return undefined;
  const n = parseInt(v.replace(/,/g, ""), 10);
  return Number.isFinite(n) ? n : undefined;
}

export function parseRestockTsv(tsv: string): RestockRecommendation[] {
  const lines = tsv.replace(/\r\n/g, "\n").split("\n").filter((l) => l.length > 0);
  if (lines.length < 2) return [];

  const rawHeaders = lines[0].split("\t");
  const keys: (keyof RestockRecommendation | null)[] = rawHeaders.map(canonicalize);

  const out: RestockRecommendation[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split("\t");
    const rec: Partial<RestockRecommendation> = {};
    for (let j = 0; j < keys.length; j++) {
      const key = keys[j];
      if (!key) continue;
      const raw = (cells[j] ?? "").trim();
      if (key === "currentInventory" || key === "unitsYouCanShip" || key === "recommendedReplenishmentQuantity" || key === "daysOfSupply") {
        rec[key] = toInt(raw);
      } else if (raw) {
        rec[key] = raw;
      }
    }
    if (rec.sellerSku) out.push(rec as RestockRecommendation);
  }
  return out;
}
