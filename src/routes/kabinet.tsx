import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ListingCard } from "@/components/ListingCard";
import { TelegramVerification } from "@/components/TelegramVerification";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { useStore } from "@/lib/store";
import { useChat } from "@/lib/chat";
import { PHONE_RE, TELEGRAM_RE, formatSum, normalizeTelegram } from "@/lib/types";

export const Route = createFileRoute("/kabinet")({
  validateSearch: (search: Record<string, unknown>): { tab?: string; c?: string } => {
    const out: { tab?: string; c?: string } = {};
    if (typeof search["tab"] === "string") out.tab = search["tab"];
    if (typeof search["c"] === "string") out.c = search["c"];
    return out;
  },
  head: () => ({
    meta: [
      { title: "Kabinet — Jihoz.uz" },
      { name: "description", content: "Buyurtmalaringiz va e'lonlaringiz." },
      { property: "og:title", content: "Kabinet — Jihoz.uz" },
      { property: "og:description", content: "Buyurtmalar va e'lonlarni boshqaring." },
    ],
  }),
  component: Cabinet,
});

const fmt = (s: string) => new Date(s).toLocaleDateString("uz-UZ", { day: "2-digit", month: "2-digit", year: "numeric" });

function Cabinet() {
  const { orders, listings } = useStore();
  const { unreadCount } = useChat();
  const search = Route.useSearch();
  const mine = listings.filter((l) => l.mine);
  const [tab, setTab] = useState(search.tab || "orders");

  useEffect(() => {
    if (search.tab) setTab(search.tab);
  }, [search.tab]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold">Kabinet</h1>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4 grid h-11 w-full grid-cols-4">
          <TabsTrigger value="orders">Buyurtmalar ({orders.length})</TabsTrigger>
          <TabsTrigger value="listings">E&apos;lonlar ({mine.length})</TabsTrigger>
          <TabsTrigger value="messages">
            Xabarlar
            {unreadCount > 0 && (
              <span className="ml-1.5 inline-grid min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-bold leading-5 text-primary-foreground">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="profile">Profil</TabsTrigger>
        </TabsList>
        <TabsContent value="orders" className="space-y-3">
          {orders.length === 0 && <Empty text="Hozircha buyurtma yo'q." to="/katalog" cta="Jihoz tanlash" />}
          {orders.map((o) => {
            const l = listings.find((x) => x.id === o.listingId);
            return (
              <div key={o.id} className="flex gap-4 rounded-2xl border border-border bg-card p-4">
                <img src={l?.image} alt="" className="h-20 w-24 rounded-xl object-cover" />
                <div className="min-w-0 flex-1 text-sm">
                  <div className="flex justify-between gap-2"><p className="truncate font-semibold">{l?.title}</p><span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">{o.id}</span></div>
                  <p className="text-muted-foreground">{fmt(o.from)} – {fmt(o.to)} · {o.days} kun · {o.qty} dona{o.delivery ? " · yetkazish" : ""}</p>
                  <p className="mt-1"><b className="text-primary">{formatSum(o.total)}</b> <span className="text-muted-foreground">+ zalog {formatSum(o.deposit)}</span></p>
                </div>
              </div>
            );
          })}
        </TabsContent>
        <TabsContent value="listings">
          {mine.length === 0 ? <Empty text="Siz hali e'lon joylamagansiz." to="/qoshish" cta="Jihoz qo'shish" /> : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">{mine.map((l) => <ListingCard key={l.id} item={l} />)}</div>
          )}
        </TabsContent>
        <TabsContent value="messages">
          <ChatPanel initialConversationId={search.c || null} />
        </TabsContent>
        <TabsContent value="profile">
          <ProfilePanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ProfilePanel() {
  const { profile, updateProfile } = useStore();
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone);
  const [tg, setTg] = useState(profile.telegramUsername);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(false);

  // Profil brauzerdan yuklanganda maydonlarni to'ldiramiz
  useEffect(() => {
    setName((v) => v || profile.name);
    setPhone((v) => (v.trim() === "+998" ? profile.phone || v : v));
    setTg((v) => v || profile.telegramUsername);
  }, [profile]);

  const onTg = (e: { target: { value: string } }) => {
    setTg(normalizeTelegram(e.target.value));
    setSaved(false);
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return setErr("Ismingizni kiriting");
    if (!PHONE_RE.test(phone)) return setErr("Telefon formati: +998 XX XXX XX XX");
    if (tg && !TELEGRAM_RE.test(tg)) return setErr("Telegram username: lotin harflar, raqam va pastki chiziq, 5–32 belgi");
    setErr("");
    updateProfile({ name: name.trim(), phone, telegramUsername: tg });
    setSaved(true);
  };

  return (
    <div className="space-y-4">
      <form onSubmit={save} className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <div>
          <h2 className="font-semibold">Profil ma&apos;lumotlari</h2>
          <p className="text-sm text-muted-foreground">
            Bu ma&apos;lumotlar e&apos;lon qo&apos;shayotganda avtomatik taklif qilinadi.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label>Ism</Label><Input className="mt-1 h-11" value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} placeholder="Ismingiz" /></div>
          <div><Label>Telefon</Label><Input className="mt-1 h-11" value={phone} onChange={(e) => { setPhone(e.target.value); setSaved(false); }} placeholder="+998 90 000 00 00" /></div>
        </div>
        <div>
          <Label>Telegram username (@ bilan)</Label>
          <Input className="mt-1 h-11 max-w-sm" placeholder="@username" value={tg} onChange={onTg} autoComplete="off" />
          <p className="mt-1 text-xs text-muted-foreground">
            Lotin harflar, raqam va pastki chiziq, 5–32 belgi.
          </p>
        </div>
        {err && <p className="text-sm text-destructive">{err}</p>}
        {saved && <p className="text-sm text-primary">Profil saqlandi.</p>}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="lg">Saqlash</Button>
        </div>
      </form>
      <TelegramVerification />
    </div>
  );
}

function Empty({ text, to, cta }: { text: string; to: "/katalog" | "/qoshish"; cta: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-10 text-center">
      <p className="mb-4 text-muted-foreground">{text}</p>
      <Button asChild><Link to={to}>{cta}</Link></Button>
    </div>
  );
}
