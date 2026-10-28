import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { DateRange } from "react-day-picker";
import { CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { bookedByDay, useStore } from "@/lib/store";
import { DELIVERY_FEE, PHONE_RE, formatSum, type Listing, type Order } from "@/lib/types";

function formatPhone(raw: string) {
  let d = raw.replace(/\D/g, "");
  if (!d.startsWith("998")) d = "998" + d;
  d = d.slice(0, 12);
  const p = [d.slice(0, 3), d.slice(3, 5), d.slice(5, 8), d.slice(8, 10), d.slice(10, 12)].filter(Boolean);
  return "+" + p.join(" ");
}

export function BookingDialog({
  item,
  open,
  onOpenChange,
  range,
  onRangeChange,
}: {
  item: Listing;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  range?: DateRange | undefined;
  onRangeChange: (r: DateRange | undefined) => void;
}) {
  const { orders, addOrder } = useStore();
  const [qty, setQty] = useState(1);
  const [delivery, setDelivery] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("+998 ");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<Order | null>(null);

  const booked = useMemo(() => bookedByDay(orders, item.id), [orders, item.id]);
  // To'liq band qilingan kunlar — kalendarda chizilgan va bosib bo'lmaydi
  const bookedDays = useMemo(
    () =>
      [...booked.entries()]
        .filter(([, q]) => q >= item.quantity)
        .map(([k]) => new Date(k)),
    [booked, item.quantity],
  );
  const days = range?.from ? Math.round(((range.to ?? range.from).getTime() - range.from.getTime()) / 864e5) + 1 : 0;
  const maxAvail = useMemo(() => {
    if (!range?.from) return item.quantity;
    let m = item.quantity;
    const d = new Date(range.from);
    const end = range.to ?? range.from;
    while (d <= end) {
      m = Math.min(m, item.quantity - (booked.get(d.toDateString()) ?? 0));
      d.setDate(d.getDate() + 1);
    }
    return m;
  }, [range, booked, item.quantity]);
  const total = item.pricePerDay * days * qty + (delivery ? DELIVERY_FEE : 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const submit = () => {
    const e: Record<string, string> = {};
    if (!range?.from) e["range"] = "Sanani tanlang";
    if (qty < 1) e["qty"] = "Kamida 1 dona";
    if (qty > maxAvail) e["qty"] = `Mavjud soni: ${maxAvail} dona`;
    if (name.trim().length < 2) e["name"] = "Ismingizni kiriting";
    if (!PHONE_RE.test(phone)) e["phone"] = "Format: +998 XX XXX XX XX";
    setErrors(e);
    if (Object.keys(e).length || !range?.from) return;
    const o = addOrder({
      listingId: item.id,
      from: range.from.toISOString(),
      to: (range.to ?? range.from).toISOString(),
      days, qty, delivery, name: name.trim(), phone, total, deposit: item.deposit * qty,
    });
    setDone(o);
  };

  const close = (o: boolean) => {
    onOpenChange(o);
    if (!o) { setDone(null); onRangeChange(undefined); setQty(1); setErrors({}); }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-2xl sm:max-w-lg">
        {done ? (
          <div className="space-y-4 py-4 text-center">
            <CheckCircle2 className="mx-auto h-16 w-16 text-primary" />
            <DialogTitle className="text-2xl">Buyurtma qabul qilindi!</DialogTitle>
            <p className="text-muted-foreground">Buyurtma raqami <b className="text-foreground">{done.id}</b>. Jihoz egasi tez orada siz bilan bog'lanadi.</p>
            <div className="rounded-xl bg-muted p-4 text-left text-sm">
              <Row k="Jami" v={formatSum(done.total)} bold />
              <Row k="Zalog (qaytariladi)" v={formatSum(done.deposit)} />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="lg" className="flex-1" onClick={() => close(false)}>Yopish</Button>
              <Button asChild size="lg" className="flex-1"><Link to="/kabinet">Kabinetga o'tish</Link></Button>
            </div>
          </div>
        ) : (
          <>
            <DialogHeader><DialogTitle>Band qilish</DialogTitle></DialogHeader>
            <p className="-mt-2 text-sm text-muted-foreground">{item.title}</p>
            <div className="space-y-4">
              <div>
                <Label>Sana oralig'i</Label>
                <div className="mt-1 flex justify-center rounded-xl border">
                  <Calendar mode="range" selected={range} onSelect={onRangeChange}
                    modifiers={{ booked: bookedDays }}
                    disabled={(d) => d < today || (booked.get(d.toDateString()) ?? 0) >= item.quantity} />
                </div>
                {errors["range"] && <Err t={errors["range"]} />}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="qty">Miqdor (max {maxAvail})</Label>
                  <Input id="qty" type="number" min={1} max={maxAvail} value={qty} onChange={(e) => setQty(Number(e.target.value))} className="mt-1 h-11" />
                  {errors["qty"] && <Err t={errors["qty"]} />}
                </div>
                <div>
                  <Label>Yetkazib berish</Label>
                  <div className="mt-1 flex h-11 items-center gap-2 rounded-md border px-3">
                    <Switch checked={delivery} disabled={!item.delivery} onCheckedChange={setDelivery} />
                    <span className="text-sm">{item.delivery ? (delivery ? "Ha (+50 000)" : "Yo'q") : "Mavjud emas"}</span>
                  </div>
                </div>
              </div>
              <div>
                <Label htmlFor="name">Ism</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-11" placeholder="Ismingiz" />
                {errors["name"] && <Err t={errors["name"]} />}
              </div>
              <div>
                <Label htmlFor="phone">Telefon</Label>
                <Input id="phone" inputMode="tel" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} className="mt-1 h-11" placeholder="+998 90 123 45 67" />
                {errors["phone"] && <Err t={errors["phone"]} />}
              </div>
              <div className="space-y-1 rounded-xl bg-muted p-4 text-sm">
                <Row k={`${formatSum(item.pricePerDay)} × ${days} kun × ${qty} dona`} v={formatSum(item.pricePerDay * days * qty)} />
                {delivery && <Row k="Yetkazib berish" v={formatSum(DELIVERY_FEE)} />}
                <div className="my-2 border-t" />
                <Row k="Jami" v={formatSum(total)} bold />
                <Row k="Zalog (alohida, qaytariladi)" v={formatSum(item.deposit * qty)} />
              </div>
              <Button size="lg" variant="default" className="h-12 w-full text-base" onClick={submit}>Band qilish</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

const Err = ({ t }: { t: string }) => <p className="mt-1 text-xs text-destructive">{t}</p>;
const Row = ({ k, v, bold }: { k: string; v: string; bold?: boolean }) => (
  <div className={`flex justify-between gap-3 ${bold ? "text-base font-bold text-foreground" : "text-muted-foreground"}`}>
    <span>{k}</span><span className="whitespace-nowrap">{v}</span>
  </div>
);
