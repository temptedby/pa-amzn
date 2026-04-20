import { Topbar } from "@/components/Topbar";
import { logout } from "@/app/login/actions";
import {
  saveSpApiCredentials,
  savePrepContact,
  deletePrepContact,
  setDefaultPrepContact,
} from "./actions";
import { maskSecret } from "@/lib/env-file";
import { configFromEnv } from "@/lib/amazon/sp-api";
import { listPrepContacts, type PrepContact } from "@/lib/db/queries/prep-contacts";

function StatusRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "ok" | "pending" | "off";
}) {
  const toneClass =
    tone === "ok" ? "text-success" : tone === "pending" ? "text-warning" : "text-muted";
  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-b-0">
      <span className="text-sm text-muted">{label}</span>
      <span className={`text-sm font-medium ${toneClass}`}>{value}</span>
    </div>
  );
}

function KVRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-b-0 text-sm">
      <span className="text-muted">{label}</span>
      <span className="font-mono text-xs text-foreground">{value}</span>
    </div>
  );
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string }>;
}) {
  const isDev = process.env.NODE_ENV !== "production";
  const spCfg = configFromEnv();
  const spOk = spCfg !== null;
  const [prepContacts, sp] = await Promise.all([listPrepContacts(), searchParams]);

  return (
    <>
      <Topbar title="Settings" subtitle="Integrations + engine thresholds" />
      <main className="flex-1 p-6 bg-surface space-y-6">
        {sp.msg && (
          <div className="rounded-md border border-success/30 bg-success/10 text-success px-4 py-3 text-sm">
            ✓ {sp.msg}
          </div>
        )}
        <section className="rounded-lg border border-border bg-background p-5">
          <h2 className="text-sm font-semibold text-foreground mb-3">Integrations</h2>
          <StatusRow
            label="Amazon SP-API"
            value={spOk ? "Connected" : "Not configured"}
            tone={spOk ? "ok" : "pending"}
          />
          <StatusRow label="Amazon Ads API" value="Pending registration" tone="pending" />
          <StatusRow label="Amazon Marketing Stream" value="Not configured" tone="off" />
          <StatusRow label="Resend (email)" value="Not configured" tone="off" />
          <StatusRow label="Turso (production DB)" value="Not configured" tone="off" />
        </section>

        <section className="rounded-lg border border-border bg-background p-5">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold text-foreground">Amazon SP-API credentials</h2>
            {isDev && <span className="text-xs text-muted">dev only — prod uses Vercel env</span>}
          </div>
          <p className="text-xs text-muted mb-4">
            Find these in Seller Central → Apps &amp; Services → Develop Apps → your app → LWA credentials.
          </p>

          <div className="mb-4">
            <KVRow label="Client ID" value={maskSecret(process.env.SP_API_CLIENT_ID)} />
            <KVRow label="Client Secret" value={maskSecret(process.env.SP_API_CLIENT_SECRET)} />
            <KVRow label="Refresh Token" value={maskSecret(process.env.SP_API_REFRESH_TOKEN)} />
            <KVRow label="Solution ID" value={maskSecret(process.env.SP_API_SOLUTION_ID, 24)} />
            <KVRow label="Marketplace" value={process.env.SP_API_MARKETPLACE_ID ?? "ATVPDKIKX0DER (US)"} />
          </div>

          {isDev ? (
            <details className="mt-4 border-t border-border pt-4">
              <summary className="cursor-pointer text-sm text-primary font-medium select-none">
                Update credentials
              </summary>
              <form action={saveSpApiCredentials} className="mt-4 space-y-3">
                <CredField
                  name="SP_API_CLIENT_ID"
                  label="Client ID"
                  placeholder="amzn1.application-oa2-client.…"
                />
                <CredField
                  name="SP_API_CLIENT_SECRET"
                  label="Client Secret"
                  placeholder="amzn1.oa2-cs.v1.…"
                  secret
                />
                <CredField
                  name="SP_API_REFRESH_TOKEN"
                  label="Refresh Token"
                  placeholder="Atzr|…"
                  secret
                />
                <p className="text-xs text-muted">
                  Values are written to <code className="text-foreground">.env.local</code> and never leave this machine.
                  Leave blank to keep the existing value.
                </p>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary-hover transition-colors"
                >
                  Save
                </button>
              </form>
            </details>
          ) : (
            <p className="text-xs text-muted">Set these in Vercel → Project Settings → Environment Variables.</p>
          )}
        </section>

        <section className="rounded-lg border border-border bg-background p-5">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold text-foreground">Prep contacts</h2>
            <span className="text-xs text-muted">{prepContacts.length} saved</span>
          </div>
          <p className="text-xs text-muted mb-4">
            People who prep + ship your inventory into Amazon FBA. Their address is used as the <em>ship-from</em> on inbound plans.
          </p>

          {prepContacts.length === 0 && (
            <p className="text-sm text-muted italic mb-4">No prep contacts yet — add your California person below.</p>
          )}

          <div className="space-y-2 mb-4">
            {prepContacts.map((c) => (
              <PrepContactCard key={c.id} c={c} />
            ))}
          </div>

          <details className="border-t border-border pt-4">
            <summary className="cursor-pointer text-sm text-primary font-medium select-none">
              + Add prep contact
            </summary>
            <PrepContactForm />
          </details>
        </section>

        <section className="rounded-lg border border-border bg-background p-5">
          <h2 className="text-sm font-semibold text-foreground mb-1">Bid engine defaults</h2>
          <p className="text-xs text-muted mb-4">Single-pack $9.49 — multi-packs scale from these</p>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted">Kill switch spend</dt>
            <dd className="text-foreground font-medium tabular-nums">$4.00 / 7d</dd>
            <dt className="text-muted">Soft cap (single-pack)</dt>
            <dd className="text-foreground font-medium tabular-nums">$2.00</dd>
            <dt className="text-muted">Aspirational ACOS</dt>
            <dd className="text-foreground font-medium tabular-nums">10%</dd>
            <dt className="text-muted">Dead-keyword pause</dt>
            <dd className="text-foreground font-medium tabular-nums">$2.00 / 0 impressions</dd>
            <dt className="text-muted">Min hours between changes</dt>
            <dd className="text-foreground font-medium tabular-nums">6h</dd>
            <dt className="text-muted">Increment / slow growth</dt>
            <dd className="text-foreground font-medium tabular-nums">10% / 5%</dd>
          </dl>
        </section>

        <section className="rounded-lg border border-border bg-background p-5">
          <h2 className="text-sm font-semibold text-foreground mb-3">Session</h2>
          <form action={logout}>
            <button
              type="submit"
              className="px-4 py-2 rounded-md border border-border text-sm text-foreground hover:bg-surface-hover transition-colors"
            >
              Sign out
            </button>
          </form>
        </section>
      </main>
    </>
  );
}

function CredField({
  name,
  label,
  placeholder,
  secret = false,
}: {
  name: string;
  label: string;
  placeholder?: string;
  secret?: boolean;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-xs font-medium text-muted mb-1">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={secret ? "password" : "text"}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className="w-full px-3 py-2 border border-border rounded-md text-sm font-mono bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
      />
    </div>
  );
}

function PrepContactCard({ c }: { c: PrepContact }) {
  const addrLine = [c.city, c.state, c.postal_code].filter(Boolean).join(", ");
  return (
    <details className="border border-border rounded-md">
      <summary className="flex items-center justify-between px-4 py-3 cursor-pointer select-none">
        <div>
          <div className="text-sm font-medium text-foreground">
            {c.name}
            {c.is_default === 1 && (
              <span className="ml-2 text-xs font-normal text-primary">(default)</span>
            )}
          </div>
          <div className="text-xs text-muted">
            {c.email}
            {addrLine && <> · {addrLine}</>}
          </div>
        </div>
        <span className="text-xs text-muted">edit ▾</span>
      </summary>
      <div className="border-t border-border px-4 py-4 space-y-3 bg-surface">
        <PrepContactForm c={c} />
        <div className="flex items-center gap-2">
          {c.is_default === 0 && (
            <form action={setDefaultPrepContact}>
              <input type="hidden" name="id" value={c.id} />
              <button
                type="submit"
                className="text-xs text-primary hover:underline"
              >
                Set as default
              </button>
            </form>
          )}
          <form action={deletePrepContact}>
            <input type="hidden" name="id" value={c.id} />
            <button type="submit" className="text-xs text-danger hover:underline">
              Delete
            </button>
          </form>
        </div>
      </div>
    </details>
  );
}

function PrepContactForm({ c }: { c?: PrepContact }) {
  return (
    <form action={savePrepContact} className="space-y-3 mt-3">
      {c && <input type="hidden" name="id" value={c.id} />}
      <div className="grid grid-cols-2 gap-3">
        <TextField name="name" label="Name" defaultValue={c?.name} required />
        <TextField name="email" label="Email" type="email" defaultValue={c?.email} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TextField name="phone" label="Phone (optional)" defaultValue={c?.phone ?? ""} />
        <TextField name="country" label="Country" defaultValue={c?.country ?? "US"} />
      </div>
      <TextField name="address_line1" label="Address line 1" defaultValue={c?.address_line1 ?? ""} />
      <TextField name="address_line2" label="Address line 2 (optional)" defaultValue={c?.address_line2 ?? ""} />
      <div className="grid grid-cols-3 gap-3">
        <TextField name="city" label="City" defaultValue={c?.city ?? ""} />
        <TextField name="state" label="State" defaultValue={c?.state ?? ""} />
        <TextField name="postal_code" label="ZIP" defaultValue={c?.postal_code ?? ""} />
      </div>
      <TextField name="notes" label="Notes (optional)" defaultValue={c?.notes ?? ""} />
      <button
        type="submit"
        className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary-hover transition-colors"
      >
        {c ? "Save changes" : "Add contact"}
      </button>
    </form>
  );
}

function TextField({
  name,
  label,
  type = "text",
  defaultValue,
  required,
}: {
  name: string;
  label: string;
  type?: string;
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-xs font-medium text-muted mb-1">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        className="w-full px-3 py-2 border border-border rounded-md text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
      />
    </div>
  );
}
