// Jihoz.uz — Edge Function: foydalanuvchini autentifikatsiya qilish
//
// Authorization: Bearer <access_token> sarlavhasi tekshiriladi.
// Token Supabase Auth API orqali tekshiriladi (JWT ni qo'lda parse qilmaymiz).

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { unauthorized } from "./cors.ts";

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
export const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

/** Service-role bilan klient (faqat serverda) */
export function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type AuthUser = {
  id: string;
  email: string | null;
};

export type AuthResult =
  | { ok: true; user: AuthUser; supabase: SupabaseClient }
  | { ok: false; response: Response };

/** Bearer token'ni olib, foydalanuvchini tekshiradi */
export async function requireUser(req: Request): Promise<AuthResult> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    return { ok: false, response: unauthorized("kirish tokeni kerak") };
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return { ok: false, response: unauthorized("token yaroqsiz yoki muddati o'tgan") };
  }

  return {
    ok: true,
    user: { id: data.user.id, email: data.user.email ?? null },
    supabase,
  };
}
