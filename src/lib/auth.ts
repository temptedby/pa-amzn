// HMAC-signed session cookie. Edge-runtime safe (Web Crypto only, no node:crypto).

export const SESSION_COOKIE_NAME = "pa_session";
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

async function getKey(): Promise<CryptoKey> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET env var is not set");
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function toBase64Url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function createSessionValue(): Promise<string> {
  const payload = { exp: Date.now() + SESSION_DURATION_MS };
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const key = await getKey();
  const sig = await crypto.subtle.sign("HMAC", key, payloadBytes);
  return `${toBase64Url(payloadBytes)}.${toBase64Url(sig)}`;
}

export async function verifySessionValue(value: string | undefined): Promise<boolean> {
  if (!value) return false;
  const parts = value.split(".");
  if (parts.length !== 2) return false;
  const [payloadB64, sigB64] = parts;
  try {
    const key = await getKey();
    const payloadBytes = fromBase64Url(payloadB64);
    const ok = await crypto.subtle.verify("HMAC", key, fromBase64Url(sigB64), payloadBytes);
    if (!ok) return false;
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as { exp?: unknown };
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return false;
    return true;
  } catch {
    return false;
  }
}

export const SESSION_COOKIE_MAX_AGE_SECONDS = SESSION_DURATION_MS / 1000;
