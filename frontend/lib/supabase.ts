import { createBrowserClient } from "@supabase/ssr";

/** True when Supabase env vars are present (optional feature). */
export const isSupabaseConfigured =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Supabase browser client — used in Client Components.
 * Reads public env vars (safe to expose in the browser).
 * Returns null when Supabase is not configured (vars absent).
 */
export function createClient() {
  if (!isSupabaseConfigured) return null;
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
