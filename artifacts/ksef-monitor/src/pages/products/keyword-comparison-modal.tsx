import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Layers, Search, Trophy, X } from "lucide-react";
import { formatPrice, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { type ProductItem, PriceChangeBadge, SUPPLIER_COLORS } from "./shared";

function normalize(name: string) {
  return name.replace(/^[#\s]+/, "").toLowerCase().trim();
}

function matchesKeyword(productName: string, keyword: string): boolean {
  const norm = normalize(productName);
  const words = keyword.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return words.every((w) => norm.includes(w));
}

export function KeywordComparisonModal({
  products,
  onClose,
}: {
  products: ProductItem[];
  onClose: () => void;
}) {
  const [keyword, setKeyword] = useState("");

  const matched = keyword.trim().length >= 2
    ? products.filter((p) => matchesKeyword(p.name, keyword))
    : [];

  // Group by supplier
  const bySupplier = matched.reduce<Record<string, { supplierName: string; supplierId: number | null; products: ProductItem[] }>>(
    (acc, p) => {
      const key = p.supplierName ?? "Nieznany";
      if (!acc[key]) acc[key] = { supplierName: key, supplierId: p.supplierId ?? null, products: [] };
      acc[key].products.push(p);
      return acc;
    },
    {}
  );

  // Pre-calculate minPrice for each supplier to avoid O(N²) Math.min in sort
  const supplierGroups = Object.values(bySupplier)
    .map(group => ({
      ...group,
      minPrice: Math.min(...group.products.map((p) => p.latestPrice ?? Infinity))
    }))
    .sort((a, b) => a.minPrice - b.minPrice);

  // Find overall cheapest single product
  const allWithPrice = matched.filter((p) => p.latestPrice != null);
  const cheapest = allWithPrice.length
    ? allWithPrice.reduce((best, p) => (p.latestPrice! < best.latestPrice! ? p : best))
    : null;

  const hasMultipleSuppliers = supplierGroups.length > 1;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-primary" />
            Porównaj po frazie
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            autoFocus
            placeholder="Wpisz frazę, np. filet z kurczaka, boczek, pomidor..."
            className="pl-9 pr-9"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          {keyword && (
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setKeyword("")}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {keyword.trim().length >= 2 && matched.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            Brak produktów pasujących do frazy „{keyword}".
          </div>
        )}

        {matched.length > 0 && (
          <div className="space-y-4">
            {/* Summary bar */}
            <div className="flex items-center justify-between text-xs text-muted-foreground bg-secondary/40 rounded-lg px-3 py-2">
              <span>
                Znaleziono <strong className="text-foreground">{matched.length}</strong> produktów u{" "}
                <strong className="text-foreground">{supplierGroups.length}</strong> dostawców
              </span>
              {cheapest && (
                <span className="flex items-center gap-1">
                  <Trophy className="w-3.5 h-3.5 text-primary" />
                  Najtańszy:{" "}
                  <strong className="text-foreground">{formatPrice(cheapest.latestPrice!)}/{cheapest.unit}</strong>
                  {" "}u{" "}
                  <span className="text-foreground">{cheapest.supplierName}</span>
                </span>
              )}
            </div>

            {/* Supplier groups */}
            {supplierGroups.map((group, gi) => {
              const color = SUPPLIER_COLORS[gi % SUPPLIER_COLORS.length];
              const groupMinPrice = (group as any).minPrice;
              const isCheapestSupplier = hasMultipleSuppliers && cheapest?.supplierName === group.supplierName;

              return (
                <div
                  key={group.supplierName}
                  className={cn(
                    "rounded-xl border overflow-hidden",
                    isCheapestSupplier ? "border-primary/40" : "border-border"
                  )}
                >
                  {/* Supplier header */}
                  <div
                    className={cn(
                      "flex items-center justify-between px-4 py-3",
                      isCheapestSupplier ? "bg-primary/5" : "bg-secondary/30"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                      <p className="text-sm font-semibold text-foreground">{group.supplierName}</p>
                      {isCheapestSupplier && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                          <Trophy className="w-3 h-3" />
                          Najtańszy
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {group.products.length} {group.products.length === 1 ? "produkt" : "produktów"}
                    </span>
                  </div>

                  {/* Products in this supplier */}
                  <div className="divide-y divide-border">
                    {group.products
                      .sort((a, b) => (a.latestPrice ?? 0) - (b.latestPrice ?? 0))
                      .map((p) => {
                        const isGroupCheapest = p.latestPrice != null && p.latestPrice === groupMinPrice && group.products.length > 1;
                        const isOverallCheapest = hasMultipleSuppliers && p.id === cheapest?.id;

                        return (
                          <div key={p.id} className="flex items-center gap-4 px-4 py-3">
                            <div className="flex-1 min-w-0">
                              <p className={cn(
                                "text-sm text-foreground truncate",
                                (isGroupCheapest || isOverallCheapest) && "font-medium"
                              )}>
                                {p.name.replace(/^#/, "")}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {p.unit}
                                {p.totalQuantity != null && p.totalQuantity > 0 && (
                                  <> · <span className="text-foreground/70">{new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(p.totalQuantity)} {p.unit}</span></>
                                )}
                                {" · "} ostatni zakup: {formatDate(p.lastPurchaseDate)}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className={cn(
                                "text-sm font-semibold",
                                isOverallCheapest ? "text-primary" : "text-foreground"
                              )}>
                                {p.latestPrice != null ? `${formatPrice(p.latestPrice)}/${p.unit}` : "—"}
                              </p>
                              {p.priceChangePercent != null && (
                                <PriceChangeBadge change={p.priceChangePercent} />
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              );
            })}

            {/* Price spread table — only when multiple suppliers */}
            {hasMultipleSuppliers && allWithPrice.length > 0 && (() => {
              const minP = Math.min(...allWithPrice.map((p) => p.latestPrice!));
              const maxP = Math.max(...allWithPrice.map((p) => p.latestPrice!));
              const spread = maxP - minP;
              const spreadPct = (spread / minP) * 100;
              return (
                <div className="bg-secondary/40 rounded-lg px-4 py-3 flex items-center justify-between gap-4 text-sm">
                  <span className="text-muted-foreground">Rozpiętość cen:</span>
                  <span>
                    <strong className="text-emerald-600">{formatPrice(minP)}</strong>
                    <span className="text-muted-foreground mx-2">—</span>
                    <strong className="text-destructive">{formatPrice(maxP)}</strong>
                    <span className="text-xs text-muted-foreground ml-2">
                      (różnica {spreadPct.toFixed(0)}%)
                    </span>
                  </span>
                </div>
              );
            })()}
          </div>
        )}

        {keyword.trim().length < 2 && (
          <div className="text-center py-6 text-muted-foreground text-sm space-y-1">
            <p>Wpisz co najmniej 2 znaki, aby porównać produkty między dostawcami.</p>
            <p className="text-xs">Przykłady: filet z kurczaka, boczek, pomidor, banan</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

