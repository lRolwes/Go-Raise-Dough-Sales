"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function safeNext(next: FormDataEntryValue | null): string {
  const n = typeof next === "string" ? next : "";
  return n.startsWith("/") && !n.startsWith("//") ? n : "/followups";
}

export async function signIn(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email") || "").trim(),
    password: String(formData.get("password") || ""),
  });
  if (error) redirect(`/login?error=${encodeURIComponent("That email and password didn't match. Try again.")}`);
  redirect(safeNext(formData.get("next")));
}

export async function signUp(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  if (password.length < 8) redirect(`/signup?error=${encodeURIComponent("Use a password of at least 8 characters.")}`);
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) {
    const msg = /database error|not on the/i.test(error.message)
      ? "That email isn't on the Go Raise Dough sales team list. Ask Lou to add it."
      : error.message;
    redirect(`/signup?error=${encodeURIComponent(msg)}`);
  }
  redirect(`/login?notice=${encodeURIComponent("Account created. Sign in with your new password.")}`);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
