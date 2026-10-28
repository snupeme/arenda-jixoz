/**
 * Telegram bot — server tomoni (faqat serverda ishlaydi).
 *
 * Ikki rejim bor:
 *  1) "database" — Supabase sozlanganda: token DB da yaratiladi,
 *     webhook (Supabase Edge Function) orqali /start qabul qilinadi.
 *  2) "local" — Supabase yo'q bo'lsa: shu modul bot bilan to'g'ridan-to'g'ri
 *     ishlaydi (long polling) va tasdiqlash holatini server xotirasida saqlaydi.
 *
 * Bot tokeni HECH QAYERDA kodda yozilmaydi — faqat server muhiti
 * (TELEGRAM_BOT_TOKEN) orqali olinadi.
 */

const TOKEN_TTL_MS = 10 * 60 * 1000; // 10 daqiqa

export type LocalSession = {
  userKey: string;
  telegramId: number | null;
  telegramUsername: string | null;
  verified: boolean;
  verifiedAt: number | null;
};

type LocalToken = {
  token: string;
  userKey: string;
  expiresAt: number;
  usedAt: number | null;
};

type BotState = {
  tokens: Map<string, LocalToken>;
  sessions: Map<string, LocalSession>;
  /** telegramId -> userKey (bitta Telegram = bitta akkaunt) */
  owners: Map<number, string>;
  polling: boolean;
  offset: number;
};

const g = globalThis as typeof globalThis & { __jihozBotState?: BotState };

const state: BotState = (g.__jihozBotState ??= {
  tokens: new Map(),
  sessions: new Map(),
  owners: new Map(),
  polling: false,
  offset: 0,
});

/** 48 ta tasodifiy belgi (>= 32 talab qilinadi) */
function randomToken(): string {
  const rnd = () => Math.random().toString(36).slice(2, 12);
  return `${rnd()}${rnd()}${rnd()}${rnd()}`;
}

function purgeExpired() {
  const now = Date.now();
  for (const [key, t] of state.tokens) {
    if (t.expiresAt + 60_000 < now) state.tokens.delete(key);
  }
}

/** Bir martalik token yaratadi (10 daqiqa, bir marta ishlatiladi) */
export function createLocalToken(userKey: string): { token: string; expiresAt: number } {
  purgeExpired();
  const token = randomToken();
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  state.tokens.set(token, { token, userKey, expiresAt, usedAt: null });
  return { token, expiresAt };
}

export type ConsumeResult =
  | { status: "ok"; userKey: string }
  | { status: "expired" }
  | { status: "used" }
  | { status: "invalid" };

/** Tokenni "ishlatish" — bir martalik */
export function consumeLocalToken(token: string): ConsumeResult {
  const row = state.tokens.get(token);
  if (!row) return { status: "invalid" };
  if (row.usedAt) return { status: "used" };
  if (row.expiresAt <= Date.now()) {
    state.tokens.delete(token);
    return { status: "expired" };
  }
  row.usedAt = Date.now();
  state.tokens.delete(token);
  return { status: "ok", userKey: row.userKey };
}

export function getLocalSession(userKey: string): LocalSession | null {
  return state.sessions.get(userKey) ?? null;
}

export function markLocalVerified(
  userKey: string,
  telegramId: number | null,
  telegramUsername: string | null,
): LocalSession {
  const prev = state.sessions.get(userKey);
  const next: LocalSession = {
    userKey,
    telegramId,
    telegramUsername: telegramUsername ? `@${telegramUsername.replace(/^@/, "")}` : prev?.telegramUsername ?? null,
    verified: true,
    verifiedAt: Date.now(),
  };
  state.sessions.set(userKey, next);
  if (telegramId) state.owners.set(telegramId, userKey);
  return next;
}

/** Telegram orqali xabar yuborish */
export async function sendTelegramMessage(
  botToken: string,
  chatId: number,
  text: string,
): Promise<void> {
  if (!botToken || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
  } catch (err) {
    console.error("[telegram] xabar yuborishda xatolik:", err);
  }
}

type TelegramUpdate = {
  update_id?: number;
  message?: {
    text?: string;
    chat?: { id?: number };
    from?: { id?: number; username?: string; first_name?: string };
  };
  edited_message?: TelegramUpdate["message"];
};

/** Botga yuborilgan update'ni qayta ishlaydi (webhook yoki long polling) */
export async function handleTelegramUpdate(
  botToken: string,
  botUsername: string,
  update: TelegramUpdate,
): Promise<void> {
  const message = update.message ?? update.edited_message;
  if (!message) return;

  const chatId = message.chat?.id;
  const text = (message.text ?? "").trim();
  const [rawCommand = "", ...rest] = text.split(/\s+/);
  // "/start" yoki "/start@Jihoz_uz_bot" -> "start"
  const command = (rawCommand.replace(/^\//, "").split("@")[0] ?? "").toLowerCase();
  const payload = rest.join(" ").trim();

  if (command !== "start") {
    if (chatId && (command === "help" || command === "")) {
      await sendTelegramMessage(
        botToken,
        chatId,
        "Jihoz.uz akkauntini tasdiqlash uchun saytning Kabinet > Profil qismida " +
          "'Telegram'ni tasdiqlash' tugmasini bosing va ochilgan havolani oching.\n\n" +
          `Bot: @${botUsername}`,
      );
    }
    return;
  }

  if (!chatId) return;

  if (!payload) {
    await sendTelegramMessage(
      botToken,
      chatId,
      "Token topilmadi. Saytda 'Telegram'ni tasdiqlash' tugmasini bosib, " +
        "ochilgan havolani bosing.",
    );
    return;
  }

  const result = consumeLocalToken(payload);

  if (result.status === "expired") {
    await sendTelegramMessage(
      botToken,
      chatId,
      "Token muddati o'tgan (10 daqiqa). Saytda qayta 'Telegram'ni tasdiqlash' " +
        "tugmasini bosing.",
    );
    return;
  }

  if (result.status === "used") {
    await sendTelegramMessage(
      botToken,
      chatId,
      "Bu token allaqachon ishlatilgan. Saytda qayta 'Telegram'ni tasdiqlash' " +
        "tugmasini bosing.",
    );
    return;
  }

  if (result.status === "invalid") {
    await sendTelegramMessage(
      botToken,
      chatId,
      "Token topilmadi yoki muddati o'tgan. Saytda qayta 'Telegram'ni tasdiqlash' " +
        "tugmasini bosing.",
    );
    return;
  }

  // Bitta Telegram ID faqat bitta akkauntga bog'lanishi mumkin
  const telegramId = message.from?.id ?? null;
  if (telegramId) {
    const owner = state.owners.get(telegramId);
    if (owner && owner !== result.userKey) {
      await sendTelegramMessage(
        botToken,
        chatId,
        "Bu Telegram akkaunti allaqachon boshqa Jihoz.uz akkauntiga bog'langan.",
      );
      return;
    }
  }

  markLocalVerified(result.userKey, telegramId, message.from?.username ?? null);

  await sendTelegramMessage(
    botToken,
    chatId,
    "Akkaunt tasdiqlandi! Jihoz.uz saytiga qaytib, Kabinet > Profil qismida " +
      "'Tasdiqlangan' belgisini ko'rasiz.",
  );
}

/** Long pollingni ishga tushiradi (webhook o'rnatilmagan holat uchun) */
export function startBotPolling(botToken: string, botUsername: string): void {
  if (!botToken || state.polling) return;
  state.polling = true;

  const loop = async (): Promise<void> => {
    while (state.polling) {
      try {
        const res = await fetch(
          `https://api.telegram.org/bot${botToken}/getUpdates?offset=${state.offset}&timeout=15`,
        );
        const data = (await res.json()) as {
          ok?: boolean;
          result?: TelegramUpdate[];
          error_code?: number;
          description?: string;
        };

        if (!res.ok || data.ok !== true) {
          if (data?.error_code === 409) {
            console.error(
              "[telegram] Botga webhook o'rnatilgan — long polling to'xtatildi. " +
                "Webhook'ni olib tashlash: /deleteWebhook",
            );
            state.polling = false;
            return;
          }
          throw new Error(data?.description ?? `getUpdates xatosi (${res.status})`);
        }

        for (const update of data.result ?? []) {
          if (typeof update.update_id === "number") state.offset = update.update_id + 1;
          await handleTelegramUpdate(botToken, botUsername, update);
        }
      } catch (err) {
        console.error("[telegram] poll xatosi:", err);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  };

  void loop();
}
