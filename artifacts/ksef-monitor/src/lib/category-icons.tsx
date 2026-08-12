// Ikony kategorii produktów — kreskowe ikony Phosphora zamiast emoji.
//
// Emoji renderują się fontem systemowym (kolorowe, pełne, każdy system inaczej),
// więc odstawały od reszty interfejsu i ciągnęły „look AI". Ikony czytają
// currentColor i mają tę samą kreskę co cała aplikacja.
//
// Mapowanie idzie po ID kategorii z `lib/categories.ts`. Kategorie własne
// użytkownika (tworzone w aplikacji) nie mają wpisu i dostają `Cube` — to
// świadomy fallback, nie brak.
import {
  Acorn, Bread, Cake, Carrot, Cheese, Cow, Cube, Drop, Egg, Fish, Jar, Package,
  PintGlass, Receipt, Snowflake, SprayBottle, ShoppingBag, Toolbox, Wine,
} from "@/lib/icons";

type IconType = typeof Cube;

const CATEGORY_ICONS: Record<string, IconType> = {
  koszty_stale: Receipt,
  alkohole: Wine,
  srodki_czystosci: SprayBottle,
  opakowania: ShoppingBag,
  mrozonki: Snowflake,
  konserwy: Jar,
  ryby: Fish,
  miesa: Cow,
  sery: Cheese,
  "nabiał": Egg,
  warzywa: Carrot,
  napoje: PintGlass,
  slodycze: Cake,
  pieczywo: Bread,
  przyprawy: Drop,
  sprzet: Toolbox,
  orzechy: Acorn,
  inne: Package,
};

export function categoryIcon(categoryId: string | null | undefined): IconType {
  if (!categoryId) return Cube;
  return CATEGORY_ICONS[categoryId] ?? Cube;
}

/** Ikona kategorii gotowa do wstawienia. Rozmiar i kolor ustaw klasą. */
export function CategoryIcon({
  categoryId,
  className = "w-4 h-4 shrink-0",
}: {
  categoryId: string | null | undefined;
  className?: string;
}) {
  const Icon = categoryIcon(categoryId);
  return <Icon className={className} aria-hidden />;
}
