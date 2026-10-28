import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import { MapPin, MessageSquare, Phone, Send, Star, Truck, ShieldCheck, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { BookingDialog } from "@/components/BookingDialog";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { LoginDialog } from "@/components/chat/LoginDialog";
import { categories } from "@/data/seed";
import { bookedByDay, useStore } from "@/lib/store";
import { chatErrorText, useChat } from "@/lib/chat";
import { formatSum, telegramLink } from "@/lib/types";

export const Route = createFileRoute("/jihoz/$id")({
  head: () => ({
    meta: [
      { title: "Jihoz tafsilotlari — Jihoz.uz" },
      { name: "description", content: "Jihoz narxi, zalog, egasi va bandlik kalendari. Onlayn band qiling." },
      { property: "og:title", content: "Jihoz tafsilotlari — Jihoz.uz" },
      { property: "og:description", content: "Jihozni kerakli kunga band qiling." },
    ],
  }),
  component: ListingPage,
});

function ListingPage() {
  const { id } = Route.useParams();
  const { listings, orders } = useStore();
  const item = listings.find((l) => String(l.id) === id);
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<DateRange | undefined>();
  const booked = useMemo(() => (item ? bookedByDay(orders, item.id) : new Map()), [orders, item]);

  // Chat
  const navigate = useNavigate();
  const { enabled, signedIn, openConversation } = useChat();
  const [loginOpen, setLoginOpen] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState("");

  const startChat = async () => {
    if (!enabled) {
      setChatError("Chat tizimi uchun Supabase sozlanishi kerak.");
      return;
    }
    if (!signedIn) {
      setLoginOpen(true);
      return;
    }
    setChatBusy(true);
    setChatError("");
    try {
      const conversationId = await openConversation(String(item?.id ?? id));
      await navigate({ to: "/kabinet", search: { tab: "messages", c: conversationId } });
    } catch (err) {
      setChatError(chatErrorText(err));
    } finally {
      setChatBusy(false);
    }
  };

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // To'liq band qilingan kunlar (soni tugagan) — chiziladi va bosib bo'lmaydi
  const isFullyBooked = (d: Date) => (booked.get(d.toDateString()) ?? 0) >= (item?.quantity ?? 1);
  const bookedDays = useMemo(
    () =>
      [...booked.entries()]
        .filter(([, q]) => q >= (item?.quantity ?? 1))
        .map(([k]) => new Date(k)),
    [booked, item?.quantity],
  );

  // Kalendardan sana tanlanganda Band qilish oynasi avtomatik to'ladi
  const onCalendarSelect = (r: DateRange | undefined) => {
    setRange(r);
    if (r?.from && r?.to) setOpen(true);
  };

  if (!item) return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <p className="mb-4 text-lg">Jihoz topilmadi.</p>
      <Button asChild><Link to="/katalog">Katalogga qaytish</Link></Button>
    </div>
  );
  const cat = categories.find((c) => c.id === item.category);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="grid gap-6 md:grid-cols-[3fr_2fr]">
        <div className="space-y-4">
          <img src={item.image} alt={item.title} className="aspect-[3/2] w-full rounded-2xl border border-border object-cover" />
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((i) => <img key={i} src={item.image} alt="" className="aspect-[3/2] rounded-xl border border-border object-cover opacity-80" />)}
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="mb-2 font-semibold">Tavsif</h2>
            <p className="text-muted-foreground">{item.description}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="mb-4 font-semibold">Bandlik kalendari</h2>
            <Calendar
              mode="range"
              selected={range}
              onSelect={onCalendarSelect}
              disabled={[(d: Date) => d < today, (d: Date) => isFullyBooked(d)]}
              modifiers={{ booked: bookedDays }}
            />
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <span className="relative block h-3.5 w-3.5 rounded-[4px] border border-border">
                  <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-muted-foreground" />
                </span>
                Band
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="block h-3.5 w-3.5 rounded-[4px] border border-border" />
                Bo&apos;sh
              </span>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Sanani tanlang — Band qilish oynasi avtomatik to&apos;ladi.
            </p>
          </div>
        </div>

        <div className="space-y-4 md:sticky md:top-20 md:self-start">
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-primary">{cat?.name}</p>
            <h1 className="mt-1 text-2xl font-bold leading-tight">{item.title}</h1>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1"><Star className="h-4 w-4 fill-highlight text-highlight" />{item.reviews ? `${item.rating.toFixed(1)} (${item.reviews} sharh)` : "Yangi"}</span>
              <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" />{item.city}</span>
            </div>
            <p className="mt-4 text-3xl font-extrabold text-primary">{formatSum(item.pricePerDay)}<span className="text-base font-normal text-muted-foreground"> / kun</span></p>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
              <Info icon={ShieldCheck} label="Zalog" value={formatSum(item.deposit)} />
              <Info icon={Package} label="Mavjud" value={`${item.quantity} dona`} />
              <Info icon={Truck} label="Yetkazish" value={item.delivery ? "Bor" : "Yo'q"} />
            </div>
            <Button variant="default" size="lg" className="mt-5 h-12 w-full text-base" onClick={() => setOpen(true)}>Band qilish</Button>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground">Jihoz egasi</p>
            <div className="mt-2 flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-secondary font-bold text-primary">{item.owner.name[0]}</span>
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {item.owner.name}
                  {item.ownerVerified && <VerifiedBadge />}
                </p>
                {item.showPhone && item.owner.phone && (
                  <p className="text-sm text-muted-foreground">{item.owner.phone}</p>
                )}
              </div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {!item.mine && (
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full"
                  disabled={chatBusy}
                  onClick={() => void startChat()}
                >
                  <MessageSquare /> Yozish
                </Button>
              )}
              {item.showPhone && item.owner.phone && (
                <Button asChild variant="outline" size="lg" className="w-full">
                  <a href={`tel:${item.owner.phone.replace(/\s/g, "")}`}><Phone /> Qo&apos;ng&apos;iroq qilish</a>
                </Button>
              )}
              {item.showTelegram && item.telegramUsername && (
                <Button asChild variant="outline" size="lg" className="w-full">
                  <a
                    href={telegramLink(item.telegramUsername)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Send /> Telegram
                  </a>
                </Button>
              )}
            </div>
            {chatError && <p className="mt-2 text-sm text-destructive">{chatError}</p>}
            {item.mine && (
              <p className="mt-3 text-xs text-muted-foreground">
                Bu — sizning e&apos;loningiz. Mijozlarga Telegram orqali yozishingiz mumkin.
              </p>
            )}
          </div>
        </div>
      </div>
      <BookingDialog
        item={item}
        open={open}
        onOpenChange={setOpen}
        range={range}
        onRangeChange={setRange}
      />
      <LoginDialog
        open={loginOpen}
        onOpenChange={setLoginOpen}
        onSignedIn={() => void startChat()}
      />
    </div>
  );
}

function Info({ icon: I, label, value }: { icon: typeof Star; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted p-2.5">
      <I className="mx-auto mb-1 h-4 w-4 text-primary" />
      <p className="text-muted-foreground">{label}</p>
      <p className="font-semibold text-foreground">{value}</p>
    </div>
  );
}
