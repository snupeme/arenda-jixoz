import { Camera, ChefHat, GraduationCap, Hammer, PartyPopper, Scissors, Baby, Package } from "lucide-react";

const icons: Record<string, typeof Camera> = {
  toy: PartyPopper,
  qurilish: Hammer,
  oshxona: ChefHat,
  foto: Camera,
  trening: GraduationCap,
  gozallik: Scissors,
  bolalar: Baby,
};

export function CategoryIcon({ id, className }: { id: string; className?: string }) {
  const I = icons[id] ?? Package;
  return <I className={className} />;
}
