import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CategoryIcon } from "@/lib/category-icons";
import { formatPrice } from "@/lib/format";
import { ArrowRight, Check, X } from "@/lib/icons";
import { apiUrl } from "@/lib/api-base";
import { CATEGORIES } from "@/lib/categories";

type ReviewItem = {
  id: number;
  name: string;
  currentCategory: string | null;
  suggestedCategory: string;
  spend: number;
  confidence: number | null;
};

type ReviewData = { items: ReviewItem[]; total: number };

function useCategoryReview() {
  const { getToken } = useAuth();
  return useQuery<ReviewData>({
    queryKey: ["category-review"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(apiUrl("/api/products/category-review"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Błąd ładowania przeglądu kategorii");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}

function useApplyCategory() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, category }: { id: number; category: string }) => {
      const token = await getToken();
      const res = await fetch(apiUrl(`/api/products/${id}/correct-category`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ category }),
      });
      if (!res.ok) throw new Error("Błąd zapisu kategorii");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["category-review"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

// Odrzucenie sugestii = potwierdź obecną kategorię (confidence=1) → znika z kolejki na stałe.
function useRejectSuggestion() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, currentCategory }: { id: number; currentCategory: string | null }) => {
      if (!currentCategory) return;
      const token = await getToken();
      const res = await fetch(apiUrl(`/api/products/${id}/correct-category`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ category: currentCategory }),
      });
      if (!res.ok) throw new Error("Błąd zapisu");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["category-review"] });
    },
  });
}

function categoryLabel(id: string | null) {
  if (!id) return "Brak";
  const cats = Object.values(CATEGORIES);
  const cat = cats.find((c) => c.id === id);
  return cat?.label ?? id;
}

function ReviewRow({ item, onAccept, onSkip, isPending }: {
  item: ReviewItem;
  onAccept: () => void;
  onSkip: () => void;
  isPending: boolean;
}) {
  return (
    <div className="py-2 border-b border-border last:border-0">
      <div className="flex items-center gap-2">
        {/* kategoria: ikona current → ikona suggested */}
        <div className="flex items-center gap-1 shrink-0 w-[72px] justify-center">
          <CategoryIcon categoryId={item.currentCategory} className="w-4 h-4 text-muted-foreground" />
          <ArrowRight className="w-3 h-3 text-muted-foreground" />
          <CategoryIcon categoryId={item.suggestedCategory} className="w-4 h-4" />
        </div>
        {/* nazwa produktu */}
        <span className="text-sm truncate flex-1 min-w-0 text-foreground" title={item.name}>
          {item.name}
        </span>
        <span className="num text-sm text-right shrink-0 w-20">{formatPrice(item.spend)}</span>
        <div className="flex gap-1 shrink-0">
          <Button size="sm" variant="outline" className="h-7 px-2 gap-1" onClick={onAccept} disabled={isPending}>
            <Check className="w-3 h-3" />
            <span className="text-xs">Akceptuj</span>
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={onSkip} disabled={isPending}>
            <X className="w-3 h-3" />
          </Button>
        </div>
      </div>
      {/* etykiety kategorii pod spodem */}
      <div className="flex items-center gap-1 mt-0.5 ml-[80px]">
        <span className="text-[11px] text-muted-foreground">{categoryLabel(item.currentCategory)}</span>
        <ArrowRight className="w-2.5 h-2.5 text-muted-foreground/50" />
        <span className="text-[11px] font-medium text-foreground">{categoryLabel(item.suggestedCategory)}</span>
      </div>
    </div>
  );
}

export function CategoryReviewModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, isLoading } = useCategoryReview();
  const applyMutation = useApplyCategory();
  const rejectMutation = useRejectSuggestion();
  const [skipped, setSkipped] = useState<Set<number>>(() => new Set());

  const visible = (data?.items ?? []).filter((i) => !skipped.has(i.id));
  const totalSpend = visible.reduce((s, i) => s + i.spend, 0);

  async function acceptAll() {
    for (const item of visible) {
      await applyMutation.mutateAsync({ id: item.id, category: item.suggestedCategory });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Przegląd kategorii</DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="py-8 text-center text-sm text-muted-foreground">Analizowanie produktów…</div>
        )}

        {!isLoading && visible.length === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Wszystkie kategorie są aktualne.
          </div>
        )}

        {!isLoading && visible.length > 0 && (
          <>
            <div className="flex items-center justify-between pb-2 border-b border-border text-sm text-muted-foreground">
              <span>{visible.length} produktów · {formatPrice(totalSpend)} spend</span>
              <Button
                size="sm" variant="outline"
                onClick={acceptAll}
                disabled={applyMutation.isPending}
              >
                <Check className="w-3 h-3 mr-1" />
                Akceptuj wszystkie
              </Button>
            </div>
            <div className="overflow-y-auto flex-1 pr-1">
              {visible.map((item) => (
                <ReviewRow
                  key={item.id}
                  item={item}
                  isPending={applyMutation.isPending}
                  onAccept={() => applyMutation.mutate({ id: item.id, category: item.suggestedCategory })}
                  onSkip={() => {
                    setSkipped((s) => new Set([...s, item.id]));
                    rejectMutation.mutate({ id: item.id, currentCategory: item.currentCategory });
                  }}
                />
              ))}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Baner z przyciskiem przeglądu — pokazuje się gdy są produkty do korekty kategorii.
 * Osadzony w nagłówku strony Produkty.
 */
export function CategoryReviewBanner() {
  const [open, setOpen] = useState(false);
  const { data } = useCategoryReview();

  const count = data?.total ?? 0;
  if (count === 0) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded px-3 py-1.5 text-sm bg-warning/10 border border-warning/30 text-warning hover:bg-warning/15 transition-colors"
      >
        <Badge variant="outline" className="text-warning border-warning/40 font-num text-xs px-1.5 h-5">
          {count}
        </Badge>
        kategorii do weryfikacji
      </button>
      <CategoryReviewModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
