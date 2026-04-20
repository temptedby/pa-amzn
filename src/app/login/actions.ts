"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  createSessionValue,
  SESSION_COOKIE_MAX_AGE_SECONDS,
  SESSION_COOKIE_NAME,
} from "@/lib/auth";

export async function login(formData: FormData) {
  const password = formData.get("password");
  const expected = process.env.DASHBOARD_PASSWORD;

  if (!expected) {
    throw new Error("DASHBOARD_PASSWORD env var is not set");
  }
  if (typeof password !== "string" || password !== expected) {
    redirect("/login?error=1");
  }

  const session = await createSessionValue();
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
  });
  redirect("/");
}

export async function logout() {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
  redirect("/login");
}
