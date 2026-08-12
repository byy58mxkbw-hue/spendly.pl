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

// Odcień (H) i nasycenie (S) per kategoria. JASNOŚĆ celowo NIE jest tutaj —
// bierze się z tokenu `--cat-l` (38% w motywie jasnym, 62% w ciemnym), więc
// jeden token przestawia całą paletę między motywami zamiast 18 par kolorów.
//
// Nasycenie trzymane nisko (12–55%) — barwa ma podpowiadać kategorię, a nie
// krzyczeć. Odcienie z tej samej ziemistej rodziny co wykresy (CHART_COLORS),
// żeby aplikacja czytała się jako jeden system.
type CategoryStyle = { icon: IconType; h: number; s: number };

const CATEGORY_STYLES: Record<string, CategoryStyle> = {
  koszty_stale:      { icon: Receipt,     h: 210, s: 12 }, // atrament — to nie żywność
  miesa:             { icon: Cow,         h: 8,   s: 45 }, // terakota
  warzywa:           { icon: Carrot,      h: 95,  s: 30 }, // zieleń przygaszona
  alkohole:          { icon: Wine,        h: 320, s: 22 }, // śliwka
  przyprawy:         { icon: Drop,        h: 20,  s: 40 }, // papryka / olej
  napoje:            { icon: PintGlass,   h: 190, s: 30 }, // woda
  "nabiał":          { icon: Egg,         h: 45,  s: 30 }, // kremowy
  pieczywo:          { icon: Bread,       h: 32,  s: 40 }, // skórka chleba
  sprzet:            { icon: Toolbox,     h: 220, s: 12 }, // stal
  mrozonki:          { icon: Snowflake,   h: 205, s: 35 }, // chłód
  sery:              { icon: Cheese,      h: 42,  s: 55 }, // żółty sera
  konserwy:          { icon: Jar,         h: 25,  s: 35 }, // puszka
  srodki_czystosci:  { icon: SprayBottle, h: 195, s: 25 }, // chłodny błękit
  ryby:              { icon: Fish,        h: 200, s: 30 }, // morski
  slodycze:          { icon: Cake,        h: 340, s: 30 }, // róż przygaszony
  opakowania:        { icon: ShoppingBag, h: 30,  s: 20 }, // karton
  orzechy:           { icon: Acorn,       h: 28,  s: 32 }, // brąz orzecha
  inne:              { icon: Package,     h: 38,  s: 8  }, // ciepła szarość
};

const FALLBACK: CategoryStyle = { icon: Cube, h: 38, s: 8 };

function styleFor(categoryId: string | null | undefined): CategoryStyle {
  if (!categoryId) return FALLBACK;
  return CATEGORY_STYLES[categoryId] ?? FALLBACK;
}

export function categoryIcon(categoryId: string | null | undefined): IconType {
  return styleFor(categoryId).icon;
}

/** Kolor kategorii (CSS). Przydatny, gdy sam element nie jest ikoną. */
export function categoryColor(categoryId: string | null | undefined): string {
  const { h, s } = styleFor(categoryId);
  return `hsl(${h} ${s}% var(--cat-l))`;
}

/**
 * Ikona kategorii. Rozmiar ustaw klasą; kolor przychodzi z palety kategorii.
 * `inheritColor` wyłącza barwę i oddaje ikonę pod currentColor — do miejsc,
 * gdzie kolor niesie już co innego (np. zaznaczona pozycja listy).
 */
export function CategoryIcon({
  categoryId,
  className = "w-4 h-4 shrink-0",
  inheritColor = false,
}: {
  categoryId: string | null | undefined;
  className?: string;
  inheritColor?: boolean;
}) {
  const { icon: Icon } = styleFor(categoryId);
  return (
    <Icon
      className={className}
      style={inheritColor ? undefined : { color: categoryColor(categoryId) }}
      aria-hidden
    />
  );
}
