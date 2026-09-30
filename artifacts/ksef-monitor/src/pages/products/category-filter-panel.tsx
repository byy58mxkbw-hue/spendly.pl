import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { ChevronDown } from "@/lib/icons";
import { CategoryIcon } from "@/lib/category-icons";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface CategoryFilterRow {
  id: string;
  label: string;
  /** Liczba produktów — respektuje szukajkę i dostawcę, ignoruje sam filtr kategorii. */
  count: number;
  /** Wydatek w PLN — tylko wybrany miesiąc i centrum kosztów. */
  spend: number;
  pct: number;
}

interface CategoryFilterPanelProps {
  /** Posortowane po `spend` malejąco, bez wiersza "Wszystkie kategorie". */
  rows: CategoryFilterRow[];
  totalCount: number;
  totalSpend: number;
  value: string;
  onChange: (id: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Jeden panel zastępujący dawne dwa osobne miejsca z kategoriami (karty "Wydatki
 * wg kategorii" u góry + pigułki filtra niżej) — patrz plan
 * iridescent-swimming-phoenix.md. `count` i `spend` liczą się z różnych zakresów
 * (patrz opisy pól wyżej) — to świadomie zachowane, nie naprawiane tutaj.
 */
export function CategoryFilterPanel({
  rows,
  totalCount,
  totalSpend,
  value,
  onChange,
  open,
  onOpenChange,
}: CategoryFilterPanelProps) {
  if (rows.length === 0) return null;

  return (
    <div className="mb-4">
      <Collapsible open={open} onOpenChange={onOpenChange}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-2 mb-2 group"
            data-testid="btn-toggle-category-panel"
          >
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Wydatki według kategorii
            </p>
            <ChevronDown
              className={cn(
                "w-3.5 h-3.5 text-muted-foreground/50 transition-transform duration-200",
                open ? "rotate-0" : "-rotate-90",
              )}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <p className="text-[11px] text-muted-foreground mb-2">
            Kwoty dot. całego miesiąca · liczby uwzględniają wyszukiwanie i dostawcę
          </p>
          <div className="rule-list max-h-[340px] overflow-y-auto md:max-h-none">
            <CategoryRow
              label="Wszystkie kategorie"
              count={totalCount}
              spend={totalSpend}
              active={value === "all"}
              onClick={() => onChange("all")}
            />
            {rows.map((row) => (
              <CategoryRow
                key={row.id}
                categoryId={row.id}
                label={row.label}
                count={row.count}
                spend={row.spend}
                active={value === row.id}
                onClick={() => onChange(value === row.id ? "all" : row.id)}
              />
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function CategoryRow({
  categoryId,
  label,
  count,
  spend,
  active,
  onClick,
}: {
  categoryId?: string;
  label: string;
  count: number;
  spend: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left text-sm transition-colors",
        active ? "bg-primary/5" : "hover:bg-secondary/60",
      )}
      data-testid={`category-filter-row-${categoryId ?? "all"}`}
    >
      <span className="flex items-center gap-2 min-w-0">
        {categoryId && <CategoryIcon categoryId={categoryId} className="w-4 h-4 shrink-0 text-muted-foreground" />}
        <span className={cn("truncate", active ? "text-primary font-medium" : "text-foreground")}>{label}</span>
      </span>
      <span className="flex items-center gap-3 shrink-0">
        <span
          className={cn(
            "text-xs rounded-full px-1.5 py-0.5 font-semibold tabular-nums",
            active ? "bg-primary/15 text-primary" : "bg-border text-muted-foreground",
          )}
        >
          {count}
        </span>
        <span className={cn("text-sm font-bold tabular-nums w-24 text-right", active ? "text-primary" : "text-foreground")}>
          {formatPrice(spend)}
        </span>
      </span>
    </button>
  );
}
