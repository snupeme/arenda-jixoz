import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { seedListings } from "@/data/seed";
import { normalizeTelegram, type Listing, type Order, type Profile } from "./types";

type Store = {
  listings: Listing[];
  orders: Order[];
  profile: Profile;
  addListing: (l: Omit<Listing, "id" | "rating" | "reviews">) => Listing;
  addOrder: (o: Omit<Order, "id" | "createdAt">) => Order;
  updateProfile: (p: Partial<Profile>) => void;
};

const Ctx = createContext<Store | null>(null);

const PROFILE_KEY = "jihoz.profile.v1";

export const DEFAULT_PROFILE: Profile = {
  name: "",
  phone: "+998 ",
  telegramUsername: "",
  telegramId: null,
  telegramVerified: false,
};

function loadProfile(): Profile {
  if (typeof window === "undefined") return DEFAULT_PROFILE;
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    if (!raw) return DEFAULT_PROFILE;
    const parsed = JSON.parse(raw) as Partial<Profile>;
    return {
      ...DEFAULT_PROFILE,
      ...parsed,
      telegramUsername: normalizeTelegram(parsed.telegramUsername ?? ""),
    };
  } catch {
    return DEFAULT_PROFILE;
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [listings, setListings] = useState<Listing[]>(seedListings);
  const [orders, setOrders] = useState<Order[]>([]);
  // SSR bilan mos kelishi uchun profil avval default, keyin brauzerdan yuklanadi
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [profileLoaded, setProfileLoaded] = useState(false);

  useEffect(() => {
    setProfile(loadProfile());
    setProfileLoaded(true);
  }, []);

  useEffect(() => {
    if (!profileLoaded || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    } catch {
      /* localStorage ishlamasa jim qolamiz */
    }
  }, [profile, profileLoaded]);

  const addListing: Store["addListing"] = useCallback((l) => {
    const item: Listing = { ...l, id: Date.now(), rating: 0, reviews: 0, mine: true };
    setListings((p) => [item, ...p]);
    return item;
  }, []);
  const addOrder: Store["addOrder"] = useCallback((o) => {
    const item: Order = {
      ...o,
      id: "JZ-" + Math.floor(1000 + Math.random() * 9000),
      createdAt: new Date().toISOString(),
    };
    setOrders((p) => [item, ...p]);
    return item;
  }, []);
  const updateProfile: Store["updateProfile"] = useCallback(
    (p) => setProfile((prev) => ({ ...prev, ...p })),
    [],
  );

  return (
    <Ctx.Provider
      value={{ listings, orders, profile, addListing, addOrder, updateProfile }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useStore() {
  const c = useContext(Ctx);
  if (!c) throw new Error("StoreProvider missing");
  return c;
}

/** Booked quantity per ISO day for a listing */
export function bookedByDay(orders: Order[], listingId: number) {
  const map = new Map<string, number>();
  for (const o of orders.filter((x) => x.listingId === listingId)) {
    const d = new Date(o.from);
    const end = new Date(o.to);
    while (d <= end) {
      const k = d.toDateString();
      map.set(k, (map.get(k) ?? 0) + o.qty);
      d.setDate(d.getDate() + 1);
    }
  }
  return map;
}
