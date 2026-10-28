import { Link } from "@tanstack/react-router";
import { Home, LayoutGrid, PlusCircle, User } from "lucide-react";
import type { ReactNode } from "react";
import { useChat } from "@/lib/chat";

const nav = [
  { to: "/", label: "Bosh sahifa", icon: Home },
  { to: "/katalog", label: "Katalog", icon: LayoutGrid },
  { to: "/qoshish", label: "Qo'shish", icon: PlusCircle },
  { to: "/kabinet", label: "Kabinet", icon: User },
] as const;

function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="ml-1.5 inline-grid min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-bold leading-5 text-primary-foreground">
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function SiteShell({ children }: { children: ReactNode }) {
  const { unreadCount, enabled, signedIn } = useChat();
  const badge = enabled && signedIn ? unreadCount : 0;

  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <header className="sticky top-0 z-40 border-b bg-card">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="text-xl font-extrabold tracking-tight text-primary">
            Jihoz<span className="text-highlight">.uz</span>
          </Link>
          <nav className="hidden gap-1 md:flex">
            {nav.map((n) => (
              <Link key={n.to} to={n.to} activeOptions={{ exact: n.to === "/" }}
                className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                activeProps={{ className: "bg-secondary text-secondary-foreground" }}>
                {n.label}
                {n.to === "/kabinet" && <UnreadBadge count={badge} />}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main>{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t bg-card md:hidden">
        {nav.map((n) => (
          <Link key={n.to} to={n.to} activeOptions={{ exact: n.to === "/" }}
            className="relative flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium text-muted-foreground"
            activeProps={{ className: "text-primary" }}>
            <n.icon className="h-5 w-5" />
            {n.label}
            {n.to === "/kabinet" && badge > 0 && (
              <span className="absolute right-[22%] top-1 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold leading-4 text-primary-foreground">
                {badge > 99 ? "99+" : badge}
              </span>
            )}
          </Link>
        ))}
      </nav>
    </div>
  );
}
