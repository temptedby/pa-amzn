import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetTokenCache, getAccessToken, spRequest, type SpApiConfig } from "./sp-api";

const cfg: SpApiConfig = {
  clientId: "amzn-client",
  clientSecret: "amzn-secret",
  refreshToken: "Atzr|TESTTOKEN1234567890",
  region: "NA",
};

beforeEach(() => {
  __resetTokenCache();
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getAccessToken", () => {
  it("exchanges refresh token for access token via LWA", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: "Atza|ACCESS1", expires_in: 3600 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const token = await getAccessToken(cfg);
    expect(token).toBe("Atza|ACCESS1");

    const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("https://api.amazon.com/auth/o2/token");
    const body = call[1].body as URLSearchParams;
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe(cfg.refreshToken);
    expect(body.get("client_id")).toBe(cfg.clientId);
    expect(body.get("client_secret")).toBe(cfg.clientSecret);
  });

  it("caches the access token across calls", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: "Atza|ACCESS1", expires_in: 3600 }), { status: 200 }),
    );
    await getAccessToken(cfg);
    await getAccessToken(cfg);
    expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it("throws when LWA returns an error", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }),
    );
    await expect(getAccessToken(cfg)).rejects.toThrow(/LWA token exchange failed: 400/);
  });
});

describe("spRequest", () => {
  it("sends access token in x-amz-access-token header", async () => {
    const f = fetch as unknown as ReturnType<typeof vi.fn>;
    f.mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: "Atza|ACCESS1", expires_in: 3600 }), { status: 200 }),
    );
    f.mockResolvedValueOnce(
      new Response(JSON.stringify({ payload: { hello: "world" } }), { status: 200 }),
    );

    const data = await spRequest<{ payload: { hello: string } }>(cfg, "/fba/inventory/v1/summaries?x=1");
    expect(data.payload.hello).toBe("world");

    const spCall = f.mock.calls[1];
    expect(spCall[0]).toBe("https://sellingpartnerapi-na.amazon.com/fba/inventory/v1/summaries?x=1");
    expect(spCall[1].headers["x-amz-access-token"]).toBe("Atza|ACCESS1");
  });

  it("throws SpApiError with status + body on non-2xx", async () => {
    const f = fetch as unknown as ReturnType<typeof vi.fn>;
    f.mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: "Atza|ACCESS1", expires_in: 3600 }), { status: 200 }),
    );
    f.mockResolvedValueOnce(
      new Response(`{"errors":[{"code":"InvalidInput","message":"bad"}]}`, { status: 400 }),
    );

    await expect(spRequest(cfg, "/fba/inventory/v1/summaries")).rejects.toMatchObject({
      name: "SpApiError",
      status: 400,
      path: "/fba/inventory/v1/summaries",
    });
  });
});
