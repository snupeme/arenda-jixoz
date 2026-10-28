import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ListingCard } from "@/components/ListingCard";
import { categories } from "@/data/seed";
import { useStore } from "@/lib/store";

type S = { q?: string | undefined; city?: string | undefined; cat?: string | undefined };

export const Route = createFileRoute("/katalog")({
  validateSearch: (s: Record<string, unknown>): S => ({
    q: typeof s["q"] === "string" ? s["q"] : undefined,
    city: typeof s["city"] === "string" ? s["city"] : undefined,
    cat: typeof s["cat"] === "string" ? s["cat"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Katalog — Jihoz.uz" },
      { name: "description", content: "Barcha arenda jihozlari: kategoriya, shahar va narx bo'yicha filtrlang." },
      { property: "og:title", content: "Jihozlar katalogi — Jihoz.uz" },
      { property: "og:description", content: "Kategoriya, shahar va narx bo'yicha jihozlarni toping." },
    ],
  }),
  component: Catalog,
});

const sel = "h-11 w-full rounded-md border border-input bg-card px-3 text-sm";

function Catalog() {
  const init = Route.useSearch();
  const { listings } = useStore();
  const [q, setQ] = useState(init.q ?? "");
  const [cat, setCat] = useState(init.cat ?? "");
  const [city, setCity] = useState(init.city ?? "");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [avail, setAvail] = useState(false);
  const [deliv, setDeliv] = useState(false);
  const [sort, setSort] = useState("mashhur");
  const cities = [...new Set(listings.map((l) => l.city))];

  const result = useMemo(() => {
    const r = listings.filter((l) =>
      (!q || l.title.toLowerCase().includes(q.toLowerCase())) &&
      (!cat || l.category === cat) && (!city || l.city === city) &&
      (!min || l.pricePerDay >= +min) && (!max || l.pricePerDay <= +max) &&
      (!avail || l.quantity > 0) && (!deliv || l.delivery));
    return r.sort((a, b) => sort === "arzon" ? a.pricePerDay - b.pricePerDay : sort === "yangi" ? b.id - a.id : b.reviews - a.reviews);
  }, [listings, q, cat, city, min, max, avail, deliv, sort]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold">Katalog</h1>
      <div className="grid gap-6 md:grid-cols-[260px_1fr]">
        <aside className="space-y-3 rounded-2xl border border-border bg-card p-4 md:sticky md:top-20 md:self-start">
          <label className="relative block"><Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Qidirish" className="h-11 pl-10" /></label>
          <select className={sel} value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">Barcha kategoriyalar</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className={sel} value={city} onChange={(e) => setCity(e.target.value)}>
            <option value="">Barcha shaharlar</option>
            {cities.map((c) => <option key={c}>{c}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <Input type="number" placeholder="Narx dan" value={min} onChange={(e) => setMin(e.target.value)} className="h-11" />
            <Input type="number" placeholder="gacha" value={max} onChange={(e) => setMax(e.target.value)} className="h-11" />
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={avail} onChange={(e) => setAvail(e.target.checked)} className="h-4 w-4 accent-primary" /> Faqat mavjudlari</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={deliv} onChange={(e) => setDeliv(e.target.checked)} className="h-4 w-4 accent-primary" /> Yetkazib berish bor</label>
        </aside>
        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{result.length} ta jihoz</p>
            <select className="h-10 rounded-md border border-input bg-card px-3 text-sm" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="mashhur">Mashhur</option>
              <option value="arzon">Arzon</option>
              <option value="yangi">Yangi</option>
            </select>
          </div>
          {result.length ? (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 md:gap-5">
              {result.map((l) => <ListingCard key={l.id} item={l} />)}
            </div>
          ) : <p className="rounded-2xl border border-border bg-card p-10 text-center text-muted-foreground">Hech narsa topilmadi.</p>}
        </div>
      </div>
    </div>
  );
}
