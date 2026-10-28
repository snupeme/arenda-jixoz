import { getSupabase } from "./supabase";

export type VerificationMode = "local" | "database" | "none";

export type TelegramVerificationStatus = {
  configured: boolean;
  mode?: VerificationMode;
  botUsername?: string;
  verificationRequired: boolean;
  signedIn?: boolean;
  verified: boolean;
  telegramUsername?: string | null;
  message?: string;
};

export type VerificationLink = {
  url: string;
  expiresAt: string | null;
  ttlMinutes?: number;
};

const LOCAL_USER_KEY = "jihoz.local-user.v1";

/**
 * Supabase'siz (lokal) rejimda foydalanuvchini aniqlash uchun
 * brauzerda saqlanadigan barqaror kalit. Bu shaxsga oid ma'lumot
 * emas — shunchaki shu qurilmaning kaliti.
 */
export function getLocalUserKey(): string {
  if (typeof window === "undefined") return "";
  try {
    const existing = window.localStorage.getItem(LOCAL_USER_KEY);
    if (existing && /^[A-Za-z0-9_-]{8,64}$/.test(existing)) return existing;
    const key =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID().replace(/-/g, "")
        : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    window.localStorage.setItem(LOCAL_USER_KEY, key);
    return key;
  } catch {
    return "";
  }
}

/** Supabase sessiyasidan access token (faqat serverga yuboriladi) */
export async function getAccessToken(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) return null;
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const localKey = getLocalUserKey();
  if (localKey) headers["x-jihoz-user"] = localKey;
  return headers;
}

/** Tasdiqlash holatini oladi (polling uchun) */
export async function fetchVerificationStatus(): Promise<TelegramVerificationStatus> {
  try {
    const res = await fetch("/api/telegram/verify", { headers: await authHeaders() });
    const body = (await res.json().catch(() => null)) as TelegramVerificationStatus | null;
    if (!body) {
      return { configured: false, mode: "none", verificationRequired: false, verified: false };
    }
    return body;
  } catch {
    return { configured: false, mode: "none", verificationRequired: false, verified: false };
  }
}

/** Bir martalik token yaratib, Telegram deep link oladi */
export async function requestVerificationLink(): Promise<VerificationLink> {
  const res = await fetch("/api/telegram/verify", {
    method: "POST",
    headers: await authHeaders(),
  });
  const body = (await res.json().catch(() => null)) as
    | (VerificationLink & { error?: string; message?: string })
    | null;

  if (!res.ok) {
    throw new Error(body?.message ?? body?.error ?? "Telegram havolasini olishda xatolik yuz berdi");
  }
  if (!body?.url) throw new Error("Telegram havolasini olishda xatolik yuz berdi");
  return body;
}
