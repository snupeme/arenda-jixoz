import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { CalendarDays, MapPin, Search, MousePointerClick, CalendarCheck, Truck, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListingCard } from "@/components/ListingCard";
import { CategoryIcon } from "@/components/CategoryIcon";
import { categories } from "@/data/seed";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Jihoz.uz — To'y, tadbir va ish uchun jihozlar arendasi" },
      { name: "description", content: "Kerakli jihozni sotib olmasdan, kerakli kunga arendaga oling. Stol, stul, shatr, proyektor va boshqalar." },
      { property: "og:title", content: "Jihoz.uz — Jihozlar arendasi" },
      { property: "og:description", content: "To'y, tadbir va kasb egalari uchun jihozlarni kunlik ijaraga oling." },
    ],
  }),
  component: Index,
});

const cities = ["Toshkent", "Samarqand", "Buxoro", "Andijon", "Farg'ona", "Namangan"];

function Index() {
  const { listings } = useStore();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [city, setCity] = useState("");
  const [date, setDate] = useState("");
  const popular = [...listings].sort((a, b) => b.reviews - a.reviews).slice(0, 4);
  const fresh = [...listings].sort((a, b) => b.id - a.id).slice(0, 4);

  return (
    <>
      <section className="bg-foreground text-background">
        <div className="mx-auto max-w-6xl px-4 pb-16 pt-10 md:pb-24 md:pt-16">
          <h1 className="max-w-2xl text-3xl font-extrabold leading-tight md:text-5xl">
            Sotib olmang — <span className="text-highlight-inverse">kerakli kunga</span> arendaga oling
          </h1>
          <p className="mt-3 max-w-xl text-background/80 md:text-lg">
            To'y, tadbir va ish uchun minglab jihozlar bir joyda.
          </p>
        </div>
      </section>

      <div className="mx-auto -mt-10 max-w-6xl px-4 md:-mt-14">
        <form
          onSubmit={(e) => { e.preventDefault(); navigate({ to: "/katalog", search: { q: q || undefined, city: city || undefined } }); }}
          className="grid gap-2 rounded-2xl border border-border bg-card p-3 md:grid-cols-[2fr_1fr_1fr_auto]"
        >
          <label className="relative"><Search className="absolute left-3 top-3.5 h-5 w-5 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Jihoz nomi" className="h-12 pl-10" /></label>
          <label className="relative"><MapPin className="absolute left-3 top-3.5 h-5 w-5 text-muted-foreground" />
            <select value={city} onChange={(e) => setCity(e.target.value)} className="h-12 w-full rounded-md border border-input bg-card pl-10 pr-3 text-sm">
              <option value="">Barcha shaharlar</option>
              {cities.map((c) => <option key={c}>{c}</option>)}
            </select></label>
          <label className="relative"><CalendarDays className="absolute left-3 top-3.5 h-5 w-5 text-muted-foreground" />
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-12 pl-10" /></label>
          <Button type="submit" variant="default" size="lg" className="h-12">Qidirish</Button>
        </form>
      </div>

      <div className="mx-auto max-w-6xl space-y-12 px-4 py-10">
        <section>
          <h2 className="mb-4 text-xl font-bold md:text-2xl">Kategoriyalar</h2>
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-7 md:px-0">
            {categories.map((c) => (
              <Link key={c.id} to="/katalog" search={{ cat: c.id }}
                className="flex min-w-[104px] flex-col items-center gap-2 rounded-2xl border border-border bg-card p-4 text-center transition-colors hover:border-foreground/25">
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-secondary text-primary"><CategoryIcon id={c.id} className="h-6 w-6" /></span>
                <span className="text-xs font-medium leading-tight">{c.name}</span>
              </Link>
            ))}
          </div>
        </section>

        <Grid title="Mashhur jihozlar" items={popular} />
        <Grid title="Yangi qo'shilganlar" items={fresh} />

        <section>
          <h2 className="mb-4 text-xl font-bold md:text-2xl">Qanday ishlaydi</h2>
          <div className="grid gap-3 md:grid-cols-3">
            {[
              { i: MousePointerClick, t: "Tanlang", d: "Katalogdan kerakli jihozni toping." },
              { i: CalendarCheck, t: "Band qiling", d: "Sana va miqdorni belgilang." },
              { i: Truck, t: "Oling yoki yetkazib berishsin", d: "O'zingiz oling yoki eshigingizgacha." },
            ].map((s, n) => (
              <div key={s.t} className="flex gap-4 rounded-2xl border border-border bg-card p-5">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-highlight text-highlight-foreground"><s.i className="h-6 w-6" /></span>
                <div><p className="font-semibold">{n + 1}. {s.t}</p><p className="text-sm text-muted-foreground">{s.d}</p></div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function Grid({ title, items }: { title: string; items: ReturnType<typeof useStore>["listings"] }) {
  return (
    <section>
      <div className="mb-4 flex items-end justify-between">
        <h2 className="text-xl font-bold md:text-2xl">{title}</h2>
        <Link to="/katalog" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          Barchasi <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-5">
        {items.map((l) => <ListingCard key={l.id} item={l} />)}
      </div>
    </section>
  );
}
