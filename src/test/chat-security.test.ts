import { describe, expect, it } from "vitest";

import { REPORT_REASONS, chatErrorText } from "@/lib/chat";
import { adminErrorText } from "@/lib/admin";
import {
  PHONE_RE,
  TELEGRAM_RE,
  formatSum,
  normalizeTelegram,
  telegramLink,
} from "@/lib/types";

// ─────────────────────────────────────────────────────────────
// Xabar va shikoyat qoidalari
// ─────────────────────────────────────────────────────────────

describe("Chat xatolarini insonga o'girish", () => {
  it("Supabase xatosidan faqat xabar qismini oladi", () => {
    expect(chatErrorText({ message: "23514: new row violates row-level security policy" })).toBe(
      "new row violates row-level security policy",
    );
  });

  it("oddiy xatoni o'zgartirmaydi", () => {
    expect(chatErrorText({ message: "Juda tez xabar yuborilmoqda." })).toBe(
      "Juda tez xabar yuborilmoqda.",
    );
  });

  it("string xatoni qaytaradi", () => {
    expect(chatErrorText("Xabar bo'sh bo'lmasligi kerak.")).toBe(
      "Xabar bo'sh bo'lmasligi kerak.",
    );
  });

  it("noma'lum xatoga umumiy matn qaytaradi", () => {
    expect(chatErrorText(null)).toBe("Xabar yuborishda xatolik yuz berdi.");
    expect(chatErrorText(undefined)).toBe("Xabar yuborishda xatolik yuz berdi.");
    expect(chatErrorText({})).toBe("Xabar yuborishda xatolik yuz berdi.");
  });
});

describe("Shikoyat sabablari", () => {
  it("to'rtta sabab bor (spam, firibgarlik, haqorat, boshqa)", () => {
    expect(REPORT_REASONS.map((r) => r.value)).toEqual(["spam", "fraud", "abuse", "other"]);
  });

  it("har bir sababda o'zbekcha nom bor", () => {
    for (const reason of REPORT_REASONS) {
      expect(reason.label.length).toBeGreaterThan(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────
// Admin xatolarini insonga o'girish
// ─────────────────────────────────────────────────────────────

describe("Admin xatolari", () => {
  it("SQL xatosidan foydali qismni oladi", () => {
    expect(adminErrorText({ message: "P0001: Ruxsat yo'q." })).toBe("Ruxsat yo'q.");
  });

  it("noma'lum xatoga umumiy matn qaytaradi", () => {
    expect(adminErrorText(undefined)).toBe("Amalni bajarishda xatolik yuz berdi.");
  });
});

// ─────────────────────────────────────────────────────────────
// Forma validatsiyasi (serverda ham tekshiriladi)
// ─────────────────────────────────────────────────────────────

describe("Telefon raqami formati", () => {
  it("to'g'ri formatni qabul qiladi", () => {
    expect(PHONE_RE.test("+998 90 123 45 67")).toBe(true);
  });

  it("noto'g'ri formatni rad etadi", () => {
    expect(PHONE_RE.test("901234567")).toBe(false);
    expect(PHONE_RE.test("+998901234567")).toBe(false);
    expect(PHONE_RE.test("+998 90 123 45 6")).toBe(false);
  });
});

describe("Telegram username formati", () => {
  it("5–32 ta lotin harf, raqam va pastki chiziq", () => {
    expect(TELEGRAM_RE.test("akmal_rahimov")).toBe(true);
    expect(TELEGRAM_RE.test("user123")).toBe(true);
    expect(TELEGRAM_RE.test("ab")).toBe(false);
    expect(TELEGRAM_RE.test("bad name")).toBe(false);
    expect(TELEGRAM_RE.test("@akmal")).toBe(false);
    expect(TELEGRAM_RE.test("a".repeat(33))).toBe(false);
  });

  it("@ belgisini va bo'sh joylarni olib tashlaydi", () => {
    expect(normalizeTelegram("  @akmal_rahimov ")).toBe("akmal_rahimov");
    expect(normalizeTelegram("@@akmal")).toBe("akmal");
  });

  it("t.me havolasini to'g'ri yasaydi", () => {
    expect(telegramLink("akmal_rahimov")).toBe("https://t.me/akmal_rahimov");
    expect(telegramLink("@akmal")).toBe("https://t.me/akmal");
  });
});

describe("Summa formatlash", () => {
  it("mingliklarni ajratadi va so'm qo'shadi", () => {
    // toLocaleString "uzilmaydigan bo'sh joy" (U+00A0) ishlatadi
    const plain = (n: number) => formatSum(n).replace(/ /g, " ");
    expect(plain(25000)).toBe("25 000 so'm");
    expect(plain(1000000)).toBe("1 000 000 so'm");
    expect(formatSum(25000)).toMatch(/^\d+ \d{3} so'm$/);
  });
});
