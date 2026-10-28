/**
 * Jihoz.uz Telegram boti — bitta manba (single source of truth).
 * Botning Telegram'dagi username'i: @Jihoz_uz_bot
 *
 * Eslatma: bu FAQAT username. Bot tokeni hech qaerda kodda saqlanmaydi —
 * u faqat Supabase Edge Function secret'larida (TELEGRAM_BOT_TOKEN) turadi.
 */

/** Bot username'i (@ belgisiz) */
export const BOT_USERNAME = "Jihoz_uz_bot";

/** Botning ochiq havolasi */
export const BOT_LINK = `https://t.me/${BOT_USERNAME}`;

/** Bot havolasi + bir martalik start token (deep link) */
export function botStartLink(token: string): string {
  return `${BOT_LINK}?start=${encodeURIComponent(token)}`;
}
