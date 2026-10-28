import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { categories } from "@/data/seed";
import { useStore } from "@/lib/store";
import { fetchVerificationStatus } from "@/lib/telegram-verify";
import { TELEGRAM_RE, normalizeTelegram } from "@/lib/types";

export const Route = createFileRoute("/qoshish")({
  head: () => ({
    meta: [
      { title: "Jihoz qo'shish — Jihoz.uz" },
      { name: "description", content: "Jihozingizni arendaga bering va daromad oling." },
      { property: "og:title", content: "Jihoz qo'shish — Jihoz.uz" },
      { property: "og:description", content: "Jihozingizni e'lon qiling va ijaraga bering." },
    ],
  }),
  component: AddListing,
});

const sel = "mt-1 h-11 w-full rounded-md border border-input bg-card px-3 text-sm";

function AddListing() {
  const { addListing, profile } = useStore();
  const navigate = useNavigate();
  const [f, setF] = useState({ title: "", category: "toy", pricePerDay: "", deposit: "", quantity: "1", image: "", city: "Toshkent", description: "", ownerName: "", ownerPhone: "+998 ", telegramUsername: "" });
  const [delivery, setDelivery] = useState(false);
  const [showPhone, setShowPhone] = useState(true);
  const [showTelegram, setShowTelegram] = useState(false);
  const [err, setErr] = useState("");
  // Tasdiq majburiy rejimi (server sozlamasi)
  const [verifyRequired, setVerifyRequired] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  useEffect(() => {
    let alive = true;
    void fetchVerificationStatus().then((s) => {
      if (alive) setVerifyRequired(s.verificationRequired === true);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Profil ma'lumotlari avtomatik taklif qilinadi (foydalanuvchi tanloviga bog'liq qoladi)
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current) return;
    setF((p) => ({
      ...p,
      ownerName: p.ownerName || profile.name,
      ownerPhone: p.ownerPhone.trim() === "+998" ? profile.phone || p.ownerPhone : p.ownerPhone,
      telegramUsername: p.telegramUsername || profile.telegramUsername,
    }));
    if (profile.name || profile.telegramUsername) prefilled.current = true;
  }, [profile]);

  // Username yozilayotganda "@" va bo'sh joylar olib tashlanadi
  const setTg = (e: { target: { value: string } }) => {
    const v = normalizeTelegram(e.target.value);
    setF((p) => ({ ...p, telegramUsername: v }));
    if (!v) setShowTelegram(false);
  };

  const onFile = (file?: File) => {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => setF((p) => ({ ...p, image: String(r.result) }));
    r.readAsDataURL(file);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (verifyRequired && !profile.telegramVerified)
      return setErr("Telegram orqali tasdiqlanishingiz kerak (Kabinet > Profil)");
    if (!f.title.trim() || !+f.pricePerDay || !+f.quantity) return setErr("Nomi, narx va sonini to'ldiring");
    if (f.telegramUsername && !TELEGRAM_RE.test(f.telegramUsername))
      return setErr("Telegram username: lotin harflar, raqam va pastki chiziq, 5–32 belgi");
    if (showTelegram && !f.telegramUsername) return setErr("Telegramni chiqarish uchun username kiriting");
    const item = addListing({
      title: f.title.trim(), category: f.category, pricePerDay: +f.pricePerDay, deposit: +f.deposit || 0,
      quantity: +f.quantity, city: f.city, delivery, description: f.description,
      image: f.image || `https://placehold.co/600x400?text=${encodeURIComponent(f.title.slice(0, 12))}`,
      owner: { name: f.ownerName || "Siz", phone: f.ownerPhone },
      showPhone,
      showTelegram: showTelegram && !!f.telegramUsername,
      telegramUsername: f.telegramUsername,
      ownerVerified: profile.telegramVerified,
    });
    navigate({ to: "/jihoz/$id", params: { id: String(item.id) } });
  };

  const tgEmpty = !f.telegramUsername;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold">Jihoz qo'shish</h1>
      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <div><Label>Nomi</Label><Input className="mt-1 h-11" value={f.title} onChange={set("title")} placeholder="Masalan: Banket stollari" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Kategoriya</Label>
            <select className={sel} value={f.category} onChange={set("category")}>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div><Label>Shahar</Label>
            <select className={sel} value={f.city} onChange={set("city")}>{["Toshkent", "Samarqand", "Buxoro", "Andijon", "Farg'ona", "Namangan"].map((c) => <option key={c}>{c}</option>)}</select></div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div><Label>Kunlik narx</Label><Input className="mt-1 h-11" type="number" value={f.pricePerDay} onChange={set("pricePerDay")} /></div>
          <div><Label>Zalog</Label><Input className="mt-1 h-11" type="number" value={f.deposit} onChange={set("deposit")} /></div>
          <div><Label>Soni</Label><Input className="mt-1 h-11" type="number" min={1} value={f.quantity} onChange={set("quantity")} /></div>
        </div>
        <div><Label>Rasm</Label><Input className="mt-1 h-11" type="file" accept="image/*" onChange={(e) => onFile(e.target.files?.[0])} />
          {f.image && <img src={f.image} alt="" className="mt-2 h-32 rounded-xl object-cover" />}</div>
        <label className="flex items-center gap-3"><Switch checked={delivery} onCheckedChange={setDelivery} /> Yetkazib berish bor</label>
        <div><Label>Tavsif</Label><Textarea className="mt-1" rows={4} value={f.description} onChange={set("description")} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Ismingiz</Label><Input className="mt-1 h-11" value={f.ownerName} onChange={set("ownerName")} /></div>
          <div>
            <Label>Telefon</Label>
            <Input className="mt-1 h-11" value={f.ownerPhone} onChange={set("ownerPhone")} />
            <label className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Switch checked={showPhone} onCheckedChange={setShowPhone} />
              Telefonni ko&apos;rsatish
            </label>
          </div>
        </div>
        <div className="rounded-xl border border-border p-3">
          <Label>Telegram username (@ bilan)</Label>
          <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Input
              className="h-11 sm:max-w-[15rem]"
              placeholder="@username"
              value={f.telegramUsername}
              onChange={setTg}
              autoComplete="off"
            />
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={showTelegram}
                onCheckedChange={setShowTelegram}
                disabled={tgEmpty}
              />
              E&apos;lonna Telegramni chiqarish
            </label>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {tgEmpty
              ? "Username kiritilganda ko'rsatish tanlovi yoqiladi. Format: lotin harflar, raqam va pastki chiziq, 5–32 belgi."
              : "E'londa faqat Telegram havolasi ko'rsatiladi."}
          </p>
        </div>
        {err && <p className="text-sm text-destructive">{err}</p>}
        {verifyRequired && !profile.telegramVerified && (
          <p className="rounded-lg border border-border bg-secondary/40 p-3 text-sm">
            Telegram orqali tasdiqlash majburiy. Kabinet &gt; Profil bo&apos;limida
            &quot;Telegram&apos;ni tasdiqlash&quot; tugmasini bosing.
          </p>
        )}
        <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={verifyRequired && !profile.telegramVerified}>
          E&apos;lonni joylash
        </Button>
      </form>
    </div>
  );
}
