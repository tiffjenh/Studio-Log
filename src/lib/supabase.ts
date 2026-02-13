import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase =
  url && anonKey
    ? createClient(url, anonKey, { auth: { detectSessionInUrl: true } })
    : null;

/** True if the current URL looks like a Supabase auth callback (e.g. email change or recovery). */
export function isAuthCallbackUrl(): boolean {
  if (typeof window === "undefined") return false;
  const hash = window.location.hash || "";
  return (
    hash.includes("access_token=") ||
    hash.includes("type=email_change") ||
    hash.includes("type=recovery")
  );
}

/** Remove auth callback params from the URL (hash) so the session isn’t re-processed. */
export function clearAuthCallbackHash(): void {
  if (typeof window === "undefined") return;
  const hash = window.location.hash || "";
  if (
    hash.includes("access_token=") ||
    hash.includes("type=email_change") ||
    hash.includes("type=recovery")
  ) {
    const url = new URL(window.location.href);
    url.hash = "";
    window.history.replaceState(window.history.state, "", url.toString());
  }
}

export const hasSupabase = (): boolean => !!supabase;
