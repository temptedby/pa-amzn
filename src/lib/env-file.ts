import { readFileSync, writeFileSync, existsSync } from "node:fs";

// Dev-only helpers for reading/updating .env.local from a server action.
// Production deployments use platform env var management (Vercel dashboard),
// not file writes.

export function updateEnvFile(path: string, updates: Record<string, string>): void {
  const content = existsSync(path) ? readFileSync(path, "utf-8") : "";
  const lines = content.split("\n");
  const pending = new Set(Object.keys(updates));

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*([A-Z_][A-Z0-9_]*)\s*=/);
    if (m && pending.has(m[1])) {
      lines[i] = `${m[1]}=${updates[m[1]]}`;
      pending.delete(m[1]);
    }
  }

  for (const key of pending) {
    if (lines.length > 0 && lines[lines.length - 1].trim() !== "") lines.push("");
    lines.push(`${key}=${updates[key]}`);
  }

  writeFileSync(path, lines.join("\n"), { encoding: "utf-8", mode: 0o600 });
}

export function maskSecret(value: string | undefined, showLeading = 12): string {
  if (!value) return "(not set)";
  if (value.length <= showLeading + 4) return "•".repeat(Math.max(8, value.length));
  return value.slice(0, showLeading) + "…" + value.slice(-4);
}
