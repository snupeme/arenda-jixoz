// Jihoz.uz — Edge Function: server tomonidagi rate limit
//
// Limit bazadagi `public.check_rate_limit(bucket, subject, limit, window_seconds)`
// funksiyasi orqali hisoblanadi (service_role bilan chaqiriladi).
// Natija: { allowed: boolean, remaining: number, reset_at: string }

import { serviceClient } from "./auth.ts";

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  /** Qayta urinishgacha kutish (soniya) */
  retryAfter: number;
};

export type RateLimitRule = {
  /** Limit turi (masalan "listing_create") */
  bucket: string;
  /** Necha marta */
  limit: number;
  /** Qancha sekund ichida */
  windowSeconds: number;
};

/** Foydalanuvchi (yoki IP) bo'yicha limitni tekshiradi */
export async function checkRateLimit(
  rule: RateLimitRule,
  subject: string,
): Promise<RateLimitResult> {
  const supabase = serviceClient();

  const { data, error } = await supabase.rpc("check_rate_limit", {
    p_bucket: rule.bucket,
    p_subject: subject,
    p_limit: rule.limit,
    p_window_seconds: rule.windowSeconds,
  });

  if (error) {
    // Limit tekshirilmasa xavfsizlik uchun rad etamiz
    console.error("check_rate_limit xatosi:", error);
    return { allowed: false, remaining: 0, retryAfter: rule.windowSeconds };
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | { allowed?: boolean; remaining?: number; retry_after?: number }
    | null;

  return {
    allowed: row?.allowed === true,
    remaining: typeof row?.remaining === "number" ? row.remaining : 0,
    retryAfter: typeof row?.retry_after === "number" ? row.retry_after : rule.windowSeconds,
  };
}

/** So'rovdan IP manzilini oladi (Cloudflare/Supabase proxy orqali) */
export function clientIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}
