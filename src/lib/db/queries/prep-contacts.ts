import { db, migrate } from "@/lib/db/client";

export interface PrepContact {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string;
  is_default: number;
  notes: string | null;
}

export async function listPrepContacts(): Promise<PrepContact[]> {
  await migrate();
  const r = await db().execute(
    `SELECT id, name, email, phone, address_line1, address_line2, city, state,
            postal_code, country, is_default, notes
     FROM prep_contacts
     ORDER BY is_default DESC, name`,
  );
  return r.rows as unknown as PrepContact[];
}

export async function getDefaultPrepContact(): Promise<PrepContact | null> {
  await migrate();
  const r = await db().execute(
    `SELECT id, name, email, phone, address_line1, address_line2, city, state,
            postal_code, country, is_default, notes
     FROM prep_contacts WHERE is_default = 1 LIMIT 1`,
  );
  return (r.rows[0] as unknown as PrepContact) ?? null;
}
