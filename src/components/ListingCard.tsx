import { Link } from "@tanstack/react-router";
import { MapPin, Star, Truck } from "lucide-react";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { formatSum, type Listing } from "@/lib/types";

export function ListingCard({ item }: { item: Listing }) {
  return (
    <Link
      to="/jihoz/$id"
      params={{ id: String(item.id) }}
      className="group block overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-foreground/25"
    >
      <div className="relative aspect-[3/2] overflow-hidden bg-muted">
        <img src={item.image} alt={item.title} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
        {item.delivery && (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-primary">
            <Truck className="h-3.5 w-3.5" /> Yetkazish
          </span>
        )}
        {item.ownerVerified && (
          <span className="absolute right-3 top-3">
            <VerifiedBadge />
          </span>
        )}
      </div>
      <div className="space-y-1.5 p-4">
        <h3 className="line-clamp-2 min-h-[2.5rem] font-semibold leading-tight text-card-foreground">{item.title}</h3>
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{item.city}</span>
          <span className="inline-flex items-center gap-1 font-medium text-foreground">
            <Star className="h-3.5 w-3.5 fill-highlight text-highlight" />
            {item.reviews ? item.rating.toFixed(1) : "Yangi"}
          </span>
        </div>
        <p className="pt-1 text-lg font-bold text-primary">
          {formatSum(item.pricePerDay)} <span className="text-sm font-normal text-muted-foreground">/ kun</span>
        </p>
      </div>
    </Link>
  );
}
