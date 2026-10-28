import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const rawUrl = import.meta.env["VITE_SUPABASE_URL"] as string | undefined;
const rawAnonKey = import.meta.env["VITE_SUPABASE_ANON_KEY"] as string | undefined;

const url = rawUrl && rawUrl.trim() && !rawUrl.includes("<") ? rawUrl.trim() : undefined;
const anonKey = rawAnonKey && rawAnonKey.trim() && !rawAnonKey.includes("<") ? rawAnonKey.trim() : undefined;

/** Supabase frontend'da sozlanganmi? */
export const isSupabaseConfigured = Boolean(url && anonKey && url.startsWith("http"));

let client: SupabaseClient | null = null;

/** Lazy singleton — SSR vaqtida localStorage'ga tegilmaydi */
export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured || !url || !anonKey) return null;
  try {
    if (!client) {
      client = createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      });
    }
    return client;
  } catch {
    return null;
  }
}
