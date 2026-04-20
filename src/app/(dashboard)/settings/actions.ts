"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { join } from "node:path";
import { updateEnvFile } from "@/lib/env-file";
import { db, migrate } from "@/lib/db/client";

const SP_API_KEYS = ["SP_API_CLIENT_ID", "SP_API_CLIENT_SECRET", "SP_API_REFRESH_TOKEN"] as const;

function s(v: FormDataEntryValue | null): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

export async function savePrepContact(formData: FormData) {
  const idRaw = formData.get("id");
  const name = s(formData.get("name"));
  const email = s(formData.get("email"));

  if (!name || !email) {
    const fields = Array.from(formData.entries()).map(([k, v]) => `${k}=${typeof v === "string" ? v.slice(0, 60) : "[file]"}`);
    console.warn(`[savePrepContact] rejected — missing name/email. id=${idRaw}. All fields: ${fields.join(" | ")}`);
    return;
  }

  const args = [
    name,
    email,
    s(formData.get("phone")),
    s(formData.get("address_line1")),
    s(formData.get("address_line2")),
    s(formData.get("city")),
    s(formData.get("state")),
    s(formData.get("postal_code")),
    s(formData.get("country")) ?? "US",
    s(formData.get("notes")),
  ];

  await migrate();
  let action: "saved" | "added";
  if (typeof idRaw === "string" && idRaw.trim().length > 0) {
    await db().execute({
      sql: `UPDATE prep_contacts
            SET name = ?, email = ?, phone = ?,
                address_line1 = ?, address_line2 = ?, city = ?, state = ?,
                postal_code = ?, country = ?, notes = ?,
                updated_at = datetime('now')
            WHERE id = ?`,
      args: [...args, Number(idRaw)],
    });
    action = "saved";
  } else {
    await db().execute({
      sql: `INSERT INTO prep_contacts
            (name, email, phone, address_line1, address_line2, city, state,
             postal_code, country, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args,
    });
    action = "added";
  }
  revalidatePath("/settings");
  revalidatePath("/inventory");
  redirect(`/settings?msg=${encodeURIComponent(`${action === "saved" ? "Saved" : "Added"} ${name}`)}`);
}

export async function deletePrepContact(formData: FormData) {
  const id = formData.get("id");
  if (typeof id !== "string") return;
  await migrate();
  const r = await db().execute({
    sql: "SELECT name FROM prep_contacts WHERE id = ?",
    args: [Number(id)],
  });
  const name = (r.rows[0] as unknown as { name?: string } | undefined)?.name ?? "contact";
  await db().execute({ sql: "DELETE FROM prep_contacts WHERE id = ?", args: [Number(id)] });
  revalidatePath("/settings");
  revalidatePath("/inventory");
  redirect(`/settings?msg=${encodeURIComponent(`Deleted ${name}`)}`);
}

export async function setDefaultPrepContact(formData: FormData) {
  const id = formData.get("id");
  if (typeof id !== "string") return;
  await migrate();
  await db().execute("UPDATE prep_contacts SET is_default = 0");
  await db().execute({
    sql: "UPDATE prep_contacts SET is_default = 1 WHERE id = ?",
    args: [Number(id)],
  });
  const r = await db().execute({
    sql: "SELECT name FROM prep_contacts WHERE id = ?",
    args: [Number(id)],
  });
  const name = (r.rows[0] as unknown as { name?: string } | undefined)?.name ?? "contact";
  revalidatePath("/settings");
  revalidatePath("/inventory");
  redirect(`/settings?msg=${encodeURIComponent(`${name} is now the default`)}`);
}

export async function saveSpApiCredentials(formData: FormData) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Credential editing is disabled in production. Set env vars in Vercel project settings instead.",
    );
  }

  const updates: Record<string, string> = {};
  for (const key of SP_API_KEYS) {
    const v = formData.get(key);
    if (typeof v === "string" && v.trim().length > 0) {
      updates[key] = v.trim();
    }
  }

  if (Object.keys(updates).length === 0) return;

  updateEnvFile(join(process.cwd(), ".env.local"), updates);
  revalidatePath("/settings");
  revalidatePath("/inventory");
  const changed = Object.keys(updates).length;
  redirect(`/settings?msg=${encodeURIComponent(`Saved ${changed} credential${changed === 1 ? "" : "s"}`)}`);
}
