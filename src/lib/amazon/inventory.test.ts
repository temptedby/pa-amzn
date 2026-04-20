import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetTokenCache, type SpApiConfig } from "./sp-api";
import { fetchFbaInventory, inboundQuantity, type FbaInventorySummary } from "./inventory";

const cfg: SpApiConfig = {
  clientId: "c",
  clientSecret: "s",
  refreshToken: "Atzr|X",
  region: "NA",
};

const tokenResponse = () =>
  new Response(JSON.stringify({ access_token: "Atza|T", expires_in: 3600 }), { status: 200 });

beforeEach(() => {
  __resetTokenCache();
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("inboundQuantity", () => {
  it("sums working + shipped + receiving", () => {
    const s: FbaInventorySummary = {
      sellerSku: "X",
      inventoryDetails: {
        inboundWorkingQuantity: 10,
        inboundShippedQuantity: 20,
        inboundReceivingQuantity: 5,
      },
    };
    expect(inboundQuantity(s)).toBe(35);
  });

  it("returns 0 when no inventoryDetails", () => {
    expect(inboundQuantity({ sellerSku: "X" })).toBe(0);
  });
});

describe("fetchFbaInventory", () => {
  it("returns all summaries from a single page", async () => {
    const f = fetch as unknown as ReturnType<typeof vi.fn>;
    f.mockResolvedValueOnce(tokenResponse());
    f.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          payload: {
            granularity: { granularityType: "Marketplace", granularityId: "ATVPDKIKX0DER" },
            inventorySummaries: [
              { sellerSku: "CLIP-1-BLK", fnSku: "X001", asin: "B0TEST1", productName: "Single Black Clip", inventoryDetails: { fulfillableQuantity: 120 } },
            ],
          },
        }),
        { status: 200 },
      ),
    );

    const items = await fetchFbaInventory(cfg, "ATVPDKIKX0DER");
    expect(items).toHaveLength(1);
    expect(items[0].sellerSku).toBe("CLIP-1-BLK");
  });

  it("follows pagination nextToken", async () => {
    const f = fetch as unknown as ReturnType<typeof vi.fn>;
    f.mockResolvedValueOnce(tokenResponse());
    f.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          payload: {
            granularity: { granularityType: "Marketplace", granularityId: "ATVPDKIKX0DER" },
            inventorySummaries: [{ sellerSku: "A" }],
          },
          pagination: { nextToken: "NEXT1" },
        }),
        { status: 200 },
      ),
    );
    f.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          payload: {
            granularity: { granularityType: "Marketplace", granularityId: "ATVPDKIKX0DER" },
            inventorySummaries: [{ sellerSku: "B" }],
          },
        }),
        { status: 200 },
      ),
    );

    const items = await fetchFbaInventory(cfg, "ATVPDKIKX0DER");
    expect(items.map((i) => i.sellerSku)).toEqual(["A", "B"]);

    // Confirm nextToken was passed on the 2nd SP-API call (index 2; index 0 is LWA)
    const secondSpUrl = f.mock.calls[2][0] as string;
    expect(secondSpUrl).toContain("nextToken=NEXT1");
  });
});
