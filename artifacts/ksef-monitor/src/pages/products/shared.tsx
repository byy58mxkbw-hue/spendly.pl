// Współdzielone typy/komponenty widoku produktów (products.tsx + modale).
import { cn } from "@/lib/utils";
import { formatPercent } from "@/lib/format";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

export const SUPPLIER_COLORS = [
  "hsl(173, 80%, 40%)",
  "hsl(220, 70%, 55%)",
  "hsl(350, 70%, 55%)",
  "hsl(40, 80%, 50%)",
  "hsl(280, 60%, 55%)",
];

export type ProductItem = {
  id: number;
  name: string;
  unit: string;
  category?: string | null;
  subcategory?: string | null;
  classificationConfidence?: number | null;
  needsReview?: boolean | null;
  latestPrice?: number | null;
  supplierName?: string | null;
  supplierId?: number | null;
  lastPurchaseDate?: string | null;
  priceChangePercent?: number | null;
  supplierCount?: number;
  totalQuantity?: number | null;
};

export function PriceChangeBadge({ change }: { change: number | null | undefined }) {
  if (change == null) return <span className="text-muted-foreground text-sm">—</span>;
  const up = change > 0;
  const down = change < 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full",
        up && "bg-destructive/10 text-destructive",
        down && "bg-emerald-500/10 text-emerald-600",
        !up && !down && "bg-muted text-muted-foreground"
      )}
      data-testid="price-change-badge"
    >
      {up ? <TrendingUp className="w-3 h-3" /> : down ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
      {formatPercent(change)}
    </span>
  );
}
