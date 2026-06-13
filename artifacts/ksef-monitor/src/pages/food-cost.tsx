import { useState, useMemo } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListDishes,
  useCreateDish,
  useGetDish,
  useUpdateDish,
  useDeleteDish,
  useListProducts,
  getListDishesQueryKey,
  getGetDishQueryKey,
  getListProductsQueryKey,
} from "@workspace/api-client-react";
import type { DishIngredientInput } from "@workspace/api-client-react";
import { Plus, Trash2, X, ChevronRight, Search, AlertTriangle, Edit2 } from "lucide-react";
import { cn } from "@/lib/utils";

const formatPrice = (v: number | null | undefined) =>
  v == null ? "—" : new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(v);

const UNITS = ["g", "kg", "dag", "ml", "l", "szt", "opak", "por"];

function MarginBadge({ pct, size = "sm" }: { pct: number | null | undefined; size?: "sm" | "lg" }) {
  if (pct == null) return <span className="text-white/30 text-xs">—</span>;
  const color = pct >= 65 ? "#34d399" : pct >= 40 ? "#facc15" : "#f87171";
  const bg = pct >= 65 ? "rgba(52,211,153,0.12)" : pct >= 40 ? "rgba(250,204,21,0.12)" : "rgba(248,113,113,0.12)";
  return (
    <span
      className={cn("font-semibold tabular-nums", size === "lg" ? "text-2xl" : "text-xs px-2 py-0.5 rounded-full")}
      style={{ color, background: size === "sm" ? bg : undefined }}
    >
      {pct.toFixed(1)}%
    </span>
  );
}

function ConfidenceDot({ pct }: { pct: number }) {
  const color = pct >= 80 ? "#34d399" : pct >= 50 ? "#facc15" : "#f87171";
  return (
    <span className="flex items-center gap-1.5">
      <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ background: color }} />
      <span className="text-xs text-white/40">{pct}%</span>
    </span>
  );
}

type IngredientRow = DishIngredientInput & { _key: string; productName?: string };

function IngredientItem({
  ingredient,
  onChange,
  onRemove,
}: {
  ingredient: IngredientRow;
  onChange: (updated: IngredientRow) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-sm text-white/80 flex-1 truncate">{ingredient.productName ?? `Produkt #${ingredient.productId}`}</span>
      <Input
        type="number"
        min={0}
        step="any"
        value={ingredient.quantity}
        onChange={(e) => onChange({ ...ingredient, quantity: parseFloat(e.target.value) || 0 })}
        className="w-20 h-7 text-xs text-right bg-white/5 border-white/10"
      />
      <select
        value={ingredient.unit}
        onChange={(e) => onChange({ ...ingredient, unit: e.target.value })}
        className="h-7 px-1 text-xs rounded-md bg-white/5 border border-white/10 text-white/80"
      >
        {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
      </select>
      <button onClick={onRemove} className="text-white/30 hover:text-red-400 transition-colors">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function DishFormDialog({
  open,
  onClose,
  editId,
}: {
  open: boolean;
  onClose: () => void;
  editId?: number;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createDish = useCreateDish();
  const updateDish = useUpdateDish();
  const { data: detail } = useGetDish(editId ?? 0, { query: { queryKey: getGetDishQueryKey(editId ?? 0), enabled: !!editId } });
  const { data: products = [] } = useListProducts({}, { query: { queryKey: getListProductsQueryKey({}), enabled: open } });

  const [name, setName] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [category, setCategory] = useState("");
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [initialized, setInitialized] = useState(false);

  if (detail && !initialized) {
    setInitialized(true);
    setName(detail.name);
    setSellPrice(String(detail.sellPrice));
    setCategory(detail.category ?? "");
    setIngredients(
      detail.ingredients.map((ing) => ({
        _key: String(ing.id),
        productId: ing.productId,
        productName: ing.productName,
        quantity: ing.quantity,
        unit: ing.unit,
      })),
    );
  }

  const filteredProducts = useMemo(
    () => products.filter((p) => p.name.toLowerCase().includes(productSearch.toLowerCase())).slice(0, 12),
    [products, productSearch],
  );

  function addIngredient(productId: number, productName: string, productUnit: string) {
    if (ingredients.find((i) => i.productId === productId)) return;
    const defaultUnit = ["kg", "g", "dag"].includes(productUnit) ? "g" : productUnit;
    setIngredients((prev) => [
      ...prev,
      { _key: String(Date.now()), productId, productName, quantity: 100, unit: defaultUnit },
    ]);
    setProductSearch("");
    setShowProductPicker(false);
  }

  async function handleSave() {
    if (!name.trim()) { toast({ variant: "destructive", title: "Podaj nazwę dania" }); return; }
    const price = parseFloat(sellPrice);
    if (isNaN(price) || price < 0) { toast({ variant: "destructive", title: "Podaj poprawną cenę sprzedaży" }); return; }
    if (ingredients.length === 0) { toast({ variant: "destructive", title: "Dodaj co najmniej jeden składnik" }); return; }

    const payload = {
      name: name.trim(),
      sellPrice: price,
      category: category.trim() || null,
      ingredients: ingredients.map((i) => ({ productId: i.productId, quantity: i.quantity, unit: i.unit })),
    };

    try {
      if (editId) {
        await updateDish.mutateAsync({ id: editId, data: payload });
        toast({ title: "Danie zaktualizowane" });
      } else {
        await createDish.mutateAsync({ data: payload });
        toast({ title: "Danie dodane" });
      }
      queryClient.invalidateQueries({ queryKey: getListDishesQueryKey() });
      onClose();
    } catch {
      toast({ variant: "destructive", title: "Błąd", description: "Spróbuj ponownie" });
    }
  }

  const isSaving = createDish.isPending || updateDish.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg bg-[#131A22] border-white/10 text-white">
        <DialogHeader>
          <DialogTitle>{editId ? "Edytuj danie" : "Dodaj danie"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/50 mb-1 block">Nazwa dania *</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="np. Burger BBQ" className="bg-white/5 border-white/10" />
            </div>
            <div>
              <label className="text-xs text-white/50 mb-1 block">Cena sprzedaży (zł) *</label>
              <Input type="number" min={0} step="0.01" value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} placeholder="42.00" className="bg-white/5 border-white/10" />
            </div>
          </div>

          <div>
            <label className="text-xs text-white/50 mb-1 block">Kategoria (opcjonalnie)</label>
            <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="np. Dania główne" className="bg-white/5 border-white/10" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-white/50">Składniki ({ingredients.length})</label>
              <button
                onClick={() => setShowProductPicker((s) => !s)}
                className="flex items-center gap-1 text-[11px] font-medium text-primary hover:text-primary/80 transition-colors"
                style={{ color: "#14B8A6" }}
              >
                <Plus className="w-3 h-3" /> Dodaj składnik
              </button>
            </div>

            {showProductPicker && (
              <div className="rounded-xl border border-white/10 bg-white/5 p-3 mb-3 space-y-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-white/30" />
                  <Input
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Szukaj produktu..."
                    className="pl-7 h-8 text-sm bg-white/5 border-white/10"
                    autoFocus
                  />
                </div>
                <div className="max-h-36 overflow-y-auto space-y-0.5">
                  {filteredProducts.length === 0 ? (
                    <p className="text-xs text-white/30 py-2 text-center">Brak produktów</p>
                  ) : filteredProducts.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => addIngredient(p.id, p.name, p.unit ?? "g")}
                      disabled={!!ingredients.find((i) => i.productId === p.id)}
                      className="w-full text-left px-2 py-1 rounded text-sm text-white/70 hover:bg-white/[0.06] hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      {p.name}
                      <span className="text-white/30 text-xs ml-1">({p.unit})</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-0.5 max-h-52 overflow-y-auto">
              {ingredients.length === 0 ? (
                <p className="text-xs text-white/30 py-3 text-center">
                  Brak składników — dodaj z listy produktów powyżej
                </p>
              ) : ingredients.map((ing) => (
                <IngredientItem
                  key={ing._key}
                  ingredient={ing}
                  onChange={(updated) => setIngredients((prev) => prev.map((i) => i._key === updated._key ? updated : i))}
                  onRemove={() => setIngredients((prev) => prev.filter((i) => i._key !== ing._key))}
                />
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" onClick={onClose} className="flex-1 border-white/10 text-white/70 hover:bg-white/5">
              Anuluj
            </Button>
            <Button onClick={handleSave} disabled={isSaving} className="flex-1 text-white" style={{ background: "#14B8A6" }}>
              {isSaving ? "Zapisuję..." : editId ? "Zapisz zmiany" : "Dodaj danie"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DishDetailDialog({
  dishId,
  onClose,
  onEdit,
  onDelete,
}: {
  dishId: number;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { data: dish, isLoading } = useGetDish(dishId);

  if (isLoading || !dish) {
    return (
      <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="max-w-md bg-[#131A22] border-white/10 text-white">
          <div className="py-12 text-center text-white/30 text-sm">Ładowanie...</div>
        </DialogContent>
      </Dialog>
    );
  }

  const costPct = dish.portionCost != null && dish.sellPrice > 0
    ? (dish.portionCost / dish.sellPrice) * 100
    : null;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md bg-[#131A22] border-white/10 text-white overflow-y-auto max-h-[90vh]">
        <DialogHeader>
          <div className="flex items-start justify-between gap-2">
            <DialogTitle className="text-lg font-bold">{dish.name}</DialogTitle>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={onEdit} className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors">
                <Edit2 className="w-3.5 h-3.5" />
              </button>
              <button onClick={onDelete} className="p-1.5 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-400/10 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          {dish.category && <p className="text-xs text-white/40 mt-0.5">{dish.category}</p>}
        </DialogHeader>

        <div className="mt-3 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Cena sprzedaży", value: formatPrice(dish.sellPrice) },
              { label: "Koszt porcji", value: formatPrice(dish.portionCost) },
              { label: "Marża", value: dish.marginPct != null ? `${dish.marginPct.toFixed(1)}%` : "—" },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl p-3 text-center" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <p className="text-[10px] text-white/40 mb-1">{label}</p>
                <p className="text-sm font-bold text-white">{value}</p>
              </div>
            ))}
          </div>

          {costPct != null && (
            <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="flex justify-between text-xs text-white/50 mb-1.5">
                <span>Food cost %</span>
                <span className={costPct <= 35 ? "text-emerald-400" : costPct <= 50 ? "text-yellow-400" : "text-red-400"}>
                  {costPct.toFixed(1)}%{" "}
                  {costPct <= 35 ? "(optymalny)" : costPct <= 50 ? "(do kontroli)" : "(za wysoki)"}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(costPct, 100)}%`,
                    background: costPct <= 35 ? "#34d399" : costPct <= 50 ? "#facc15" : "#f87171",
                  }}
                />
              </div>
              <p className="text-[10px] text-white/30 mt-1">Cel branżowy: 25–35%</p>
            </div>
          )}

          <div className="flex items-center justify-between text-xs">
            <span className="text-white/40">Pewność kalkulacji</span>
            <ConfidenceDot pct={dish.confidencePct} />
          </div>

          <div>
            <p className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">Składniki</p>
            <div className="space-y-1.5">
              {dish.ingredients.map((ing) => (
                <div key={ing.id} className="flex items-center gap-2 py-1.5 px-3 rounded-lg" style={{ background: "rgba(255,255,255,0.03)" }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white/80 truncate">{ing.productName}</p>
                    <p className="text-[11px] text-white/40">
                      {ing.quantity} {ing.unit}
                      {ing.unitPrice != null && ` · ${formatPrice(ing.unitPrice)}/${ing.productUnit}`}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    {ing.ingredientCost != null ? (
                      <>
                        <p className="text-xs font-medium text-white/70">{formatPrice(ing.ingredientCost)}</p>
                        {dish.portionCost != null && dish.portionCost > 0 && (
                          <p className="text-[10px] text-white/30">
                            {((ing.ingredientCost / dish.portionCost) * 100).toFixed(0)}%
                          </p>
                        )}
                      </>
                    ) : (
                      <span className="text-[10px] text-white/30 flex items-center gap-0.5">
                        <AlertTriangle className="w-3 h-3 text-yellow-500/60" /> brak ceny
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function FoodCostPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const deleteDish = useDeleteDish();

  const { data: dishes = [], isLoading } = useListDishes();

  const [showCreate, setShowCreate] = useState(false);
  const [viewDishId, setViewDishId] = useState<number | null>(null);
  const [editDishId, setEditDishId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const categories = useMemo(
    () => [...new Set(dishes.map((d) => d.category).filter(Boolean) as string[])].sort(),
    [dishes],
  );

  const filtered = useMemo(() => {
    let list = dishes;
    if (search) list = list.filter((d) => d.name.toLowerCase().includes(search.toLowerCase()));
    if (categoryFilter) list = list.filter((d) => d.category === categoryFilter);
    return list;
  }, [dishes, search, categoryFilter]);

  const withMargin = dishes.filter((d) => d.marginPct != null);
  const avgMargin = withMargin.length > 0
    ? withMargin.reduce((s, d) => s + d.marginPct!, 0) / withMargin.length
    : null;
  const lowMarginCount = dishes.filter((d) => d.marginPct != null && d.marginPct < 40).length;
  const missingPrices = dishes.filter((d) => d.confidencePct < 100).length;

  async function handleDelete(id: number) {
    try {
      await deleteDish.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getListDishesQueryKey() });
      toast({ title: "Danie usunięte" });
      setViewDishId(null);
    } catch {
      toast({ variant: "destructive", title: "Błąd usuwania" });
    }
  }

  return (
    <Layout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Food Cost</h1>
            <p className="text-sm text-white/40 mt-0.5">Receptury, koszty porcji i analiza marż</p>
          </div>
          <Button
            onClick={() => setShowCreate(true)}
            className="shrink-0 text-white"
            style={{ background: "#14B8A6" }}
          >
            <Plus className="w-4 h-4 mr-1.5" /> Dodaj danie
          </Button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Dań w menu", value: String(dishes.length), sub: "łącznie", warn: false },
            { label: "Średnia marża", value: avgMargin != null ? `${avgMargin.toFixed(1)}%` : "—", sub: "na wszystkich daniach", warn: false },
            { label: "Niska marża (<40%)", value: String(lowMarginCount), sub: lowMarginCount > 0 ? "wymaga uwagi" : "wszystko OK", warn: lowMarginCount > 0 },
            { label: "Brak cen", value: String(missingPrices), sub: missingPrices > 0 ? "niepełne dane" : "dane kompletne", warn: missingPrices > 0 },
          ].map(({ label, value, sub, warn }) => (
            <div key={label} className="rounded-2xl p-4" style={{ background: "#131A22", border: "1px solid rgba(255,255,255,0.07)" }}>
              <p className="text-[11px] text-white/40 font-medium">{label}</p>
              <p className={cn("text-xl font-bold mt-1", warn ? "text-yellow-400" : "text-white")}>{value}</p>
              <p className="text-[10px] text-white/30 mt-0.5">{sub}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-48 max-w-72">
            <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-white/30" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Szukaj dania..."
              className="pl-8 h-9 bg-white/5 border-white/10 text-sm"
            />
          </div>
          <button
            onClick={() => setCategoryFilter(null)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
              !categoryFilter ? "text-white bg-white/10" : "text-white/40 hover:text-white/70 hover:bg-white/5",
            )}
          >
            Wszystkie
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat === categoryFilter ? null : cat)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                categoryFilter === cat ? "text-white bg-white/10" : "text-white/40 hover:text-white/70 hover:bg-white/5",
              )}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="rounded-2xl overflow-hidden" style={{ background: "#131A22", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div
            className="grid gap-2 px-5 py-3 text-[11px] font-semibold text-white/30 uppercase tracking-wider border-b border-white/[0.06]"
            style={{ gridTemplateColumns: "1fr 90px 90px 80px 70px 24px" }}
          >
            <span>Danie</span>
            <span className="text-right">Cena</span>
            <span className="text-right">Koszt</span>
            <span className="text-right">Marża</span>
            <span className="text-center">Pewność</span>
            <span />
          </div>

          {isLoading ? (
            <div className="py-16 text-center text-white/30 text-sm">Ładowanie...</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center space-y-2">
              <p className="text-white/30 text-sm">
                {dishes.length === 0 ? "Brak dań — dodaj pierwsze danie." : "Brak wyników dla tego filtra."}
              </p>
              {dishes.length === 0 && (
                <button onClick={() => setShowCreate(true)} className="text-sm hover:underline" style={{ color: "#14B8A6" }}>
                  + Dodaj pierwsze danie
                </button>
              )}
            </div>
          ) : (
            filtered.map((dish) => (
              <div
                key={dish.id}
                onClick={() => setViewDishId(dish.id)}
                className="grid gap-2 px-5 py-3.5 cursor-pointer hover:bg-white/[0.03] transition-colors border-b border-white/[0.04] last:border-b-0 items-center"
                style={{ gridTemplateColumns: "1fr 90px 90px 80px 70px 24px" }}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{dish.name}</p>
                  {dish.category && <p className="text-[11px] text-white/40">{dish.category}</p>}
                </div>
                <p className="text-sm text-white/60 tabular-nums text-right">{formatPrice(dish.sellPrice)}</p>
                <p className="text-sm text-white/60 tabular-nums text-right">{formatPrice(dish.portionCost)}</p>
                <div className="flex justify-end">
                  <MarginBadge pct={dish.marginPct} />
                </div>
                <div className="flex justify-center">
                  <ConfidenceDot pct={dish.confidencePct} />
                </div>
                <ChevronRight className="w-4 h-4 text-white/20" />
              </div>
            ))
          )}
        </div>
      </div>

      {showCreate && (
        <DishFormDialog open onClose={() => setShowCreate(false)} />
      )}
      {editDishId != null && (
        <DishFormDialog
          open
          editId={editDishId}
          onClose={() => {
            const prev = editDishId;
            setEditDishId(null);
            setViewDishId(prev);
          }}
        />
      )}
      {viewDishId != null && editDishId == null && (
        <DishDetailDialog
          dishId={viewDishId}
          onClose={() => setViewDishId(null)}
          onEdit={() => {
            const id = viewDishId;
            setViewDishId(null);
            setEditDishId(id);
          }}
          onDelete={() => handleDelete(viewDishId)}
        />
      )}
    </Layout>
  );
}
