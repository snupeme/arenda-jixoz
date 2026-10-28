import { createFileRoute } from "@tanstack/react-router";
import { BOT_USERNAME as DEFAULT_BOT_USERNAME } from "@/lib/telegram-bot";
import {
  createLocalToken,
  getLocalSession,
  startBotPolling,
} from "@/lib/server/telegram-bot";

/**
 * Telegram tasdiqlash uchun server API.
 *
 * POST /api/telegram/verify  — bir martalik token yaratadi va deep link qaytaradi.
 * GET  /api/telegram/verify  — tasdiqlash holatini qaytaradi (frontend polling uchun).
 *
 * Bot tokeni va webhook maxfiy kaliti HECH QAYERDA bu faylda yo'q —
 * ular faqat server muhitida (Edge Function secrets) saqlanadi.
 */

type Env = Record<string, string | undefined>;

function env(): Env {
  const p = (globalThis as { process?: { env?: Env } }).process?.env;
  return p ?? {};
}

/** Bot username'i — markaziy bitta manbadan (src/lib/telegram-bot.ts) */
const TOKEN_TTL_MINUTES = 10;

function bearer(request: Request): string | null {
  const h = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m?.[1]?.trim() ?? null;
}

function json(data: unknown, init?: { status?: number; headers?: Record<string, string> }) {
  return new Response(JSON.stringify(data), {
    status: init?.status ?? 200,
    headers: { "content-type": "application/json", ...init?.headers },
  });
}

function isRequired(e: Env): boolean {
  const v = (e["TELEGRAM_VERIFICATION_REQUIRED"] ?? "").toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/** Bot username (env bilan almashtirilishi mumkin) */
function botUsernameOf(e: Env): string {
  return (e["TELEGRAM_BOT_USERNAME"] ?? DEFAULT_BOT_USERNAME).replace(/^@/, "");
}

/** Bot tokeni serverda bormi? */
function botTokenOf(e: Env): string {
  return (e["TELEGRAM_BOT_TOKEN"] ?? "").trim();
}

/** Lokal (Supabase'siz) rejimda foydalanuvchi kaliti — brauzer tomondan keladi */
function localUserKey(request: Request): string {
  const raw = request.headers.get("x-jihoz-user") ?? "";
  return /^[A-Za-z0-9_-]{8,64}$/.test(raw) ? raw : "";
}

/** Supabase Auth orqali foydalanuvchini tekshirish (access token -> user id) */
async function resolveUser(
  supabaseUrl: string,
  apiKey: string,
  accessToken: string,
): Promise<{ id: string } | null> {
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: apiKey, Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const user = (await res.json()) as { id?: string };
    return user?.id ? { id: user.id } : null;
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/api/telegram/verify")({
  server: {
    handlers: {
      /** Tasdiqlash holati (polling uchun) */
      GET: async ({ request }) => {
        const e = env();
        const supabaseUrl = e["SUPABASE_URL"] ?? e["VITE_SUPABASE_URL"];
        const serviceKey = e["SUPABASE_SERVICE_ROLE_KEY"];
        const apiKey = e["SUPABASE_ANON_KEY"] ?? e["VITE_SUPABASE_ANON_KEY"] ?? serviceKey;
        const required = isRequired(e);
        const botToken = botTokenOf(e);

        // ── Lokal rejim: Supabase yo'q, lekin bot tokeni bor ──
        if (!supabaseUrl || !serviceKey) {
          if (!botToken) {
            return json({
              configured: false,
              mode: "none",
              botUsername: botUsernameOf(e),
              verificationRequired: required,
              verified: false,
              signedIn: false,
              message: `Telegram boti (@${botUsernameOf(e)}) uchun serverda TELEGRAM_BOT_TOKEN o'rnlanmagan.`,
            });
          }

          startBotPolling(botToken, botUsernameOf(e));

          const userKey = localUserKey(request);
          const session = userKey ? getLocalSession(userKey) : null;

          return json({
            configured: true,
            mode: "local",
            botUsername: botUsernameOf(e),
            verificationRequired: required,
            signedIn: true,
            verified: session?.verified === true,
            telegramUsername: session?.telegramUsername ?? null,
          });
        }

        const token = bearer(request);
        if (!token) {
          return json({
            configured: true,
            mode: "database",
            botUsername: botUsernameOf(e),
            verificationRequired: required,
            verified: false,
            signedIn: false,
          });
        }

        const user = await resolveUser(supabaseUrl, apiKey ?? "", token);
        if (!user) {
          return json(
            {
              configured: true,
              mode: "database",
              botUsername: botUsernameOf(e),
              verificationRequired: required,
              verified: false,
              signedIn: false,
            },
            { status: 401 },
          );
        }

        const res = await fetch(
          `${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}&select=telegram_verified,telegram_username`,
          { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
        );
        if (!res.ok) {
          return json({ error: "profile_read_failed" }, { status: 502 });
        }
        const rows = (await res.json()) as Array<{
          telegram_verified?: boolean;
          telegram_username?: string | null;
        }>;
        const profile = rows[0];

        return json({
          configured: true,
          mode: "database",
          botUsername: botUsernameOf(e),
          verificationRequired: required,
          signedIn: true,
          verified: profile?.telegram_verified === true,
          telegramUsername: profile?.telegram_username ?? null,
        });
      },

      /** Bir martalik token yaratish va deep link qaytarish */
      POST: async ({ request }) => {
        const e = env();
        const supabaseUrl = e["SUPABASE_URL"] ?? e["VITE_SUPABASE_URL"];
        const serviceKey = e["SUPABASE_SERVICE_ROLE_KEY"];
        const apiKey = e["SUPABASE_ANON_KEY"] ?? e["VITE_SUPABASE_ANON_KEY"] ?? serviceKey;
        const botToken = botTokenOf(e);
        const botUsername = botUsernameOf(e);

        // ── Lokal rejim: bot bilan to'g'ridan-to'g'ri ishlaydi ──
        if (!supabaseUrl || !serviceKey) {
          if (!botToken) {
            return json(
              {
                error: "server_not_configured",
                message: `Telegram boti (@${botUsername}) uchun serverda TELEGRAM_BOT_TOKEN o'rnlanmagan.`,
              },
              { status: 503 },
            );
          }

          const userKey = localUserKey(request);
          if (!userKey) {
            return json({ error: "missing_user_key" }, { status: 400 });
          }

          startBotPolling(botToken, botUsername);

          const { token, expiresAt } = createLocalToken(userKey);
          return json({
            url: `https://t.me/${botUsername}?start=${encodeURIComponent(token)}`,
            expiresAt: new Date(expiresAt).toISOString(),
            ttlMinutes: TOKEN_TTL_MINUTES,
            mode: "local",
          });
        }

        const token = bearer(request);
        if (!token) {
          return json({ error: "unauthorized" }, { status: 401 });
        }

        const user = await resolveUser(supabaseUrl, apiKey ?? "", token);
        if (!user) {
          return json({ error: "unauthorized" }, { status: 401 });
        }

        // Token yaratish va rate limit (soatiga 5 marta) — bazadagi funksiya ichida
        const res = await fetch(`${supabaseUrl}/rest/v1/rpc/create_telegram_token`, {
          method: "POST",
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ p_user_id: user.id, p_ttl_minutes: TOKEN_TTL_MINUTES }),
        });

        if (!res.ok) {
          const text = await res.text();
          if (text.includes("rate_limit_exceeded")) {
            return json(
              {
                error: "rate_limited",
                message: "Soatiga 5 marta so'rash mumkin. Birozdan keyin qayta urinib ko'ring.",
              },
              { status: 429, headers: { "retry-after": "3600" } },
            );
          }
          console.error("create_telegram_token xatosi:", text);
          return json({ error: "token_create_failed" }, { status: 502 });
        }

        const rows = (await res.json()) as Array<{ token?: string; expires_at?: string }>;
        const row = rows[0];
        if (!row?.token) return json({ error: "token_create_failed" }, { status: 502 });

        return json({
          url: `https://t.me/${botUsername}?start=${encodeURIComponent(row.token)}`,
          expiresAt: row.expires_at ?? null,
          ttlMinutes: TOKEN_TTL_MINUTES,
          mode: "database",
        });
      },
    },
  },
});
