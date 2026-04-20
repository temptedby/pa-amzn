// Amazon Selling Partner API (SP-API) client.
//
// Auth: LWA refresh token → access token → bearer in x-amz-access-token header.
// No AWS SigV4 request signing required — Amazon removed the IAM requirement
// in 2023. One env + one refresh token is enough.
//
// Access tokens last 1 hour; we cache until 1 minute before expiry.

export type Region = "NA" | "EU" | "FE";

export interface SpApiConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  region: Region;
}

const ENDPOINTS: Record<Region, string> = {
  NA: "https://sellingpartnerapi-na.amazon.com",
  EU: "https://sellingpartnerapi-eu.amazon.com",
  FE: "https://sellingpartnerapi-fe.amazon.com",
};

const LWA_TOKEN_URL = "https://api.amazon.com/auth/o2/token";

// US marketplace ID. Non-US sellers override via env.
export const DEFAULT_MARKETPLACE_ID = "ATVPDKIKX0DER";

interface TokenCache {
  refreshTokenFingerprint: string;
  token: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;

export function configFromEnv(): SpApiConfig | null {
  const clientId = process.env.SP_API_CLIENT_ID;
  const clientSecret = process.env.SP_API_CLIENT_SECRET;
  const refreshToken = process.env.SP_API_REFRESH_TOKEN;
  const region = (process.env.SP_API_REGION ?? "NA") as Region;
  if (!clientId || !clientSecret || !refreshToken) return null;
  return { clientId, clientSecret, refreshToken, region };
}

export function marketplaceIdFromEnv(): string {
  return process.env.SP_API_MARKETPLACE_ID ?? DEFAULT_MARKETPLACE_ID;
}

function fingerprint(s: string): string {
  // Short, stable identifier for cache keying. Not cryptographic — just avoids
  // serving a stale token when the refresh_token env var is rotated mid-process.
  return s.slice(0, 8) + ":" + s.length;
}

export async function getAccessToken(cfg: SpApiConfig): Promise<string> {
  const fp = fingerprint(cfg.refreshToken);
  if (tokenCache && tokenCache.refreshTokenFingerprint === fp && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.token;
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: cfg.refreshToken,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
  });

  const res = await fetch(LWA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LWA token exchange failed: ${res.status} ${text}`);
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = {
    refreshTokenFingerprint: fp,
    token: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  return json.access_token;
}

export class SpApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly path: string,
    public readonly body: string,
  ) {
    super(message);
    this.name = "SpApiError";
  }
}

export async function spRequest<T>(
  cfg: SpApiConfig,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await getAccessToken(cfg);
  const url = `${ENDPOINTS[cfg.region]}${path}`;

  const res = await fetch(url, {
    ...init,
    headers: {
      "x-amz-access-token": token,
      "content-type": "application/json",
      accept: "application/json",
      ...init.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`[sp-api] ${res.status} ${path}: ${text.slice(0, 2000)}`);
    throw new SpApiError(`SP-API ${res.status} ${path}`, res.status, path, text);
  }

  return (await res.json()) as T;
}

// For tests.
export function __resetTokenCache(): void {
  tokenCache = null;
}
