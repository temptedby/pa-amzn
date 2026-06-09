// Amazon Advertising API client (SEPARATE OAuth from SP-API — one LWA refresh
// token does NOT work for both). Auth: LWA refresh → access token; every call
// sends Amazon-Advertising-API-ClientId + (for scoped calls) Amazon-Advertising-
// API-Scope = profileId.
//
// Env: ADS_CLIENT_ID, ADS_CLIENT_SECRET, ADS_REFRESH_TOKEN, ADS_PROFILE_ID,
//      ADS_REGION (NA default). Scope for the refresh token: cpc_advertising:campaign_management.

export type AdsRegion = "NA" | "EU" | "FE";

const ENDPOINTS: Record<AdsRegion, string> = {
  NA: "https://advertising-api.amazon.com",
  EU: "https://advertising-api-eu.amazon.com",
  FE: "https://advertising-api-fe.amazon.com",
};
const LWA_TOKEN_URL = "https://api.amazon.com/auth/o2/token";

export interface AdsConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  profileId?: string; // optional for /v2/profiles (unscoped) calls
  region: AdsRegion;
}

export function adsConfigFromEnv(): AdsConfig | null {
  const clientId = process.env.ADS_CLIENT_ID;
  const clientSecret = process.env.ADS_CLIENT_SECRET;
  const refreshToken = process.env.ADS_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;
  return {
    clientId,
    clientSecret,
    refreshToken,
    profileId: process.env.ADS_PROFILE_ID,
    region: (process.env.ADS_REGION as AdsRegion) ?? "NA",
  };
}

let tokenCache: { fp: string; token: string; expiresAt: number } | null = null;

export async function getAdsAccessToken(cfg: AdsConfig): Promise<string> {
  const fp = cfg.refreshToken.slice(0, 8) + ":" + cfg.refreshToken.length;
  if (tokenCache && tokenCache.fp === fp && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;
  const res = await fetch(LWA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: cfg.refreshToken,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
    }).toString(),
  });
  const j = (await res.json()) as { access_token: string; expires_in: number };
  if (!res.ok) throw new Error(`Ads LWA token failed: ${JSON.stringify(j)}`);
  tokenCache = { fp, token: j.access_token, expiresAt: Date.now() + j.expires_in * 1000 };
  return j.access_token;
}

export class AdsApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly path: string, public readonly body: string) {
    super(message);
    this.name = "AdsApiError";
  }
}

/** Scoped request (needs profileId). For /v2/profiles use adsRequestUnscoped. */
export async function adsRequest<T>(cfg: AdsConfig, path: string, init: RequestInit = {}, contentType?: string): Promise<T> {
  if (!cfg.profileId) throw new Error("ADS_PROFILE_ID required for scoped Ads calls");
  return doAds<T>(cfg, path, init, { "Amazon-Advertising-API-Scope": cfg.profileId }, contentType);
}

/** Unscoped request — only for GET /v2/profiles (to discover the profileId). */
export async function adsRequestUnscoped<T>(cfg: AdsConfig, path: string, init: RequestInit = {}): Promise<T> {
  return doAds<T>(cfg, path, init, {});
}

async function doAds<T>(cfg: AdsConfig, path: string, init: RequestInit, extraHeaders: Record<string, string>, contentType?: string): Promise<T> {
  const token = await getAdsAccessToken(cfg);
  const res = await fetch(`${ENDPOINTS[cfg.region]}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Amazon-Advertising-API-ClientId": cfg.clientId,
      "Content-Type": contentType ?? "application/json",
      Accept: contentType ?? "application/json",
      ...extraHeaders,
      ...init.headers,
    },
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    console.error(`[ads-api] ${res.status} ${path}: ${text.slice(0, 1500)}`);
    throw new AdsApiError(`Ads API ${res.status} ${path}`, res.status, path, text);
  }
  return (text ? JSON.parse(text) : undefined) as T;
}

export interface AdsProfile {
  profileId: number;
  countryCode: string;
  currencyCode: string;
  accountInfo?: { type?: string; name?: string; marketplaceStringId?: string };
}

/** List advertising profiles for the account — use this to find your Profile ID. */
export function listProfiles(cfg: AdsConfig): Promise<AdsProfile[]> {
  return adsRequestUnscoped<AdsProfile[]>(cfg, "/v2/profiles");
}
