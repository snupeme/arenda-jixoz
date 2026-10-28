import { BadgeCheck } from "lucide-react";

/** "Tasdiqlangan" belgisi — profil va e'lonlarda */
export function VerifiedBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary ${className}`}
    >
      <BadgeCheck className="h-3.5 w-3.5" />
      Tasdiqlangan
    </span>
  );
}
