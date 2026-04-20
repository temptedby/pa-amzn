import { describe, expect, it } from "vitest";
import { parseRestockTsv } from "./restock";

describe("parseRestockTsv", () => {
  it("parses a typical US restock report", () => {
    const tsv = [
      "SKU\tProduct Name\tASIN\tCondition\tCurrent Inventory\tUnits you can Ship to Amazon\tRecommended replenishment quantity\tRecommended ship date\tAlert\tDays of supply (by marketplace)",
      "CLIP-1-BLK\tSingle Black Clip\tB0TEST1\tNew\t45\t200\t150\t2026-04-27\tSend more inventory\t12",
      "CLIP-2-BLK\t2-Pack Black Clip\tB0TEST2\tNew\t80\t0\t0\t\t\t40",
    ].join("\n");

    const recs = parseRestockTsv(tsv);
    expect(recs).toHaveLength(2);

    expect(recs[0]).toMatchObject({
      sellerSku: "CLIP-1-BLK",
      productName: "Single Black Clip",
      asin: "B0TEST1",
      recommendedReplenishmentQuantity: 150,
      recommendedShipDate: "2026-04-27",
      alert: "Send more inventory",
      daysOfSupply: 12,
    });

    expect(recs[1].sellerSku).toBe("CLIP-2-BLK");
    expect(recs[1].recommendedReplenishmentQuantity).toBe(0);
    expect(recs[1].alert).toBeUndefined();
  });

  it("handles header variants (Recommended inbound quantity)", () => {
    const tsv = [
      "SKU\tASIN\tRecommended inbound quantity\tRecommended ship date",
      "CLIP-1\tB01\t25\t2026-05-01",
    ].join("\n");
    const recs = parseRestockTsv(tsv);
    expect(recs[0].recommendedReplenishmentQuantity).toBe(25);
  });

  it("skips rows with no SKU", () => {
    const tsv = ["SKU\tASIN", "\tB01", "CLIP\tB02"].join("\n");
    expect(parseRestockTsv(tsv)).toHaveLength(1);
  });

  it("returns [] on empty input", () => {
    expect(parseRestockTsv("")).toEqual([]);
    expect(parseRestockTsv("SKU\tASIN")).toEqual([]);
  });

  it("treats blank/dash cells as undefined for numeric fields", () => {
    const tsv = ["SKU\tDays of supply (by marketplace)", "CLIP-1\t-", "CLIP-2\t"].join("\n");
    const recs = parseRestockTsv(tsv);
    expect(recs[0].daysOfSupply).toBeUndefined();
    expect(recs[1].daysOfSupply).toBeUndefined();
  });
});
