export type Category = { id: string; name: string };
export type Listing = {
  id: number;
  title: string;
  category: string;
  pricePerDay: number;
  deposit: number;
  quantity: number;
  city: string;
  delivery: boolean;
  rating: number;
  reviews: number;
  image: string;
  description: string;
  owner: { name: string; phone: string };
  /** Egasining telefon raqami e'londa ko'rsatiladimi */
  showPhone: boolean;
  /** E'londa Telegram tugmasi ko'rsatiladimi */
  showTelegram: boolean;
  /** Telegram username ( @ belgisiz ) */
  telegramUsername: string;
  /** Egasining Telegram akkaunti bot orqali tasdiqlanganmi */
  ownerVerified?: boolean;
  mine?: boolean;
};
export type Order = {
  id: string;
  listingId: number;
  from: string; // ISO date
  to: string;
  days: number;
  qty: number;
  delivery: boolean;
  name: string;
  phone: string;
  total: number;
  deposit: number;
  createdAt: string;
};

/** Foydalanuvchi profili (Kabinet > Profil) */
export type Profile = {
  name: string;
  phone: string;
  telegramUsername: string;
  /** Bot orqali tasdiqlangan Telegram ID */
  telegramId?: number | null;
  /** Telegram orqali tasdiqlanganmi */
  telegramVerified: boolean;
};

export const DELIVERY_FEE = 50000;
export const formatSum = (n: number) => n.toLocaleString("ru-RU").replace(/,/g, " ") + " so'm";
export const PHONE_RE = /^\+998 \d{2} \d{3} \d{2} \d{2}$/;

/** Telegram username: lotin harflar, raqam va pastki chiziq, 5–32 belgi */
export const TELEGRAM_RE = /^[A-Za-z0-9_]{5,32}$/;

/** "@" va bo'sh joylarni olib tashlaydi */
export function normalizeTelegram(raw: string): string {
  return raw.trim().replace(/^@+/, "").replace(/\s+/g, "");
}

/** t.me havolasi (username @ belgisiz bo'lishi kerak) */
export function telegramLink(username: string): string {
  return `https://t.me/${username.replace(/^@/, "")}`;
}
