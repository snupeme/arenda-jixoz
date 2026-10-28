// Jihoz.uz — Edge Function: kirish ma'lumotlarini tekshirish (validatsiya)
//
// Barcha kirish maydonlari shu yerda tekshiriladi — klientga ishonilmaydi.

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

const PHONE_RE = /^\+998 \d{2} \d{3} \d{2} \d{2}$/;
const TELEGRAM_RE = /^[A-Za-z0-9_]{5,32}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function requireString(
  value: unknown,
  field: string,
  { min = 1, max = 500 }: { min?: number; max?: number } = {},
): ValidationResult<string> {
  const v = str(value);
  if (v.length < min) return { ok: false, error: `${field} to'ldirilishi shart` };
  if (v.length > max) return { ok: false, error: `${field} ${max} belgidan uzun bo'lishi mumkin emas` };
  return { ok: true, value: v };
}

export function optionalString(
  value: unknown,
  field: string,
  { max = 500 }: { max?: number } = {},
): ValidationResult<string> {
  const v = str(value);
  if (v.length > max) return { ok: false, error: `${field} ${max} belgidan uzun bo'lishi mumkin emas` };
  return { ok: true, value: v };
}

export function requireInt(
  value: unknown,
  field: string,
  { min = 0, max = 100_000_000 }: { min?: number; max?: number } = {},
): ValidationResult<number> {
  const n = typeof value === "number" ? value : Number(str(value));
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    return { ok: false, error: `${field} butun son bo'lishi kerak` };
  }
  if (n < min) return { ok: false, error: `${field} ${min} dan kichik bo'lmasligi kerak` };
  if (n > max) return { ok: false, error: `${field} ${max} dan katta bo'lmasligi kerak` };
  return { ok: true, value: n };
}

export function requireBoolean(value: unknown, field: string): ValidationResult<boolean> {
  if (typeof value === "boolean") return { ok: true, value };
  if (value === "true") return { ok: true, value: true };
  if (value === "false") return { ok: true, value: false };
  return { ok: false, error: `${field} true/false bo'lishi kerak` };
}

export function requireUuid(value: unknown, field: string): ValidationResult<string> {
  const v = str(value);
  if (!UUID_RE.test(v)) return { ok: false, error: `${field} noto'g'ri formatda` };
  return { ok: true, value: v };
}

export function requireDate(value: unknown, field: string): ValidationResult<string> {
  const v = str(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return { ok: false, error: `${field} sana formatida bo'lishi kerak` };
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return { ok: false, error: `${field} noto'g'ri sana` };
  return { ok: true, value: v };
}

export function requirePhone(value: unknown): ValidationResult<string> {
  const v = str(value);
  if (!PHONE_RE.test(v)) {
    return { ok: false, error: "Telefon formati: +998 XX XXX XX XX" };
  }
  return { ok: true, value: v };
}

export function requireTelegram(value: unknown): ValidationResult<string> {
  const v = str(value).replace(/^@+/, "");
  if (!TELEGRAM_RE.test(v)) {
    return { ok: false, error: "Telegram username: lotin harflar, raqam va pastki chiziq, 5–32 belgi" };
  }
  return { ok: true, value: v };
}

/** Havolalar faqat http/https bo'lishi kerak (javascript:, data: rad etiladi) */
export function optionalUrl(
  value: unknown,
  field: string,
  { max = 500 }: { max?: number } = {},
): ValidationResult<string> {
  const v = str(value);
  if (!v) return { ok: true, value: "" };
  if (v.length > max) return { ok: false, error: `${field} juda uzun` };
  let parsed: URL;
  try {
    parsed = new URL(v);
  } catch {
    return { ok: false, error: `${field} noto'g'ri havola` };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: `${field} faqat http/https bo'lishi mumkin` };
  }
  return { ok: true, value: v };
}
