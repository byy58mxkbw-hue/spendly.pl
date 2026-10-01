import { useState, useMemo, useEffect, lazy, Suspense, type MouseEvent } from "react";
import { Layout } from "@/components/layout";
import { ErrorState } from "@/components/error-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListDishes,
  useCreateDish,
  useGetDish,
  useUpdateDish,
  useDeleteDish,
  useListProducts,
  useGetDishesSales,
  useRepriceDish,
  useSetProductPackage,
  useSetProductManualPrice,
  useGetPosItems,
  useSetDishPosLink,
  getGetDishesSalesQueryKey,
  getGetGoposMenuQueryKey,
  getListDishesQueryKey,
  getGetDishQueryKey,
  getListProductsQueryKey,
} from "@workspace/api-client-react";
import type { DishIngredientInput, DishDetail } from "@workspace/api-client-react";
import { Plus, Trash2, X, ChevronRight, Search, AlertTriangle, Edit2, Sparkles, ChevronLeft, ShoppingBag, RefreshCw } from "@/lib/icons";
import { cn } from "@/lib/utils";

import { Combobox } from "@/components/ui/combobox";

const MenuImportDialog = lazy(() => import("./menu-import-dialog"));
const ResetMenuDialog = lazy(() => import("./food-cost-reset-dialog"));

const MONTHS = ["styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec", "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień"];
function currentMonth(): string { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`; }
function monthLabel(m: string): string { const [y, mm] = m.split("-").map(Number); return `${MONTHS[mm - 1]} ${y}`; }
function shiftMonth(m: string, d: number): string { const [y, mm] = m.split("-").map(Number); const dt = new Date(Date.UTC(y, mm - 1 + d, 1)); return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (v: number | null | undefined) =>
  v == null ? "—" : new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(v);

function marginColor(pct: number | null | undefined): string {
  if (pct == null) return "#6b7280";
  if (pct >= 65) return "#059669";
  if (pct >= 40) return "#d97706";
  return "#dc2626";
}

function foodCostColor(pct: number): string {
  if (pct <= 35) return "#059669";
  if (pct <= 50) return "#d97706";
  return "#dc2626";
}

// Wiarygodność wyceny: im więcej kosztu z realnych faktur, tym pewniej.
function reliabilityColor(pct: number): string {
  if (pct >= 67) return "#059669";
  if (pct >= 34) return "#d97706";
  return "#6b7280";
}

// Client-side unit conversion (mirrors backend logic)
function toBase(qty: number, unit: string): { value: number; base: string } {
  const u = unit.toLowerCase().trim();
  if (u === "kg") return { value: qty * 1000, base: "g" };
  if (u === "g") return { value: qty, base: "g" };
  if (u === "dag") return { value: qty * 10, base: "g" };
  if (u === "l" || u === "litr") return { value: qty * 1000, base: "ml" };
  if (u === "ml") return { value: qty, base: "ml" };
  return { value: qty, base: u };
}

function parsePackageSize(name: string): { valueInBase: number; base: string } | null {
  const re = /(\d+[.,]\d+|\d+)\s*(ml|l|litr|g|kg|dag)\b/gi;
  let best: { valueInBase: number; base: string } | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(name)) !== null) {
    const num = parseFloat(m[1].replace(",", "."));
    const conv = toBase(num, m[2]);
    if (!best || conv.value > best.valueInBase) best = { valueInBase: conv.value, base: conv.base };
  }
  return best;
}

function calcIngredientCost(
  qty: number,
  recipeUnit: string,
  invoiceUnit: string,
  unitPrice: number,
  productName: string,
): number | null {
  if (!unitPrice) return null;
  const recipe = toBase(qty, recipeUnit);
  const invoice = toBase(1, invoiceUnit);
  const massVol = (b: string) => b === "g" || b === "ml";
  // Ta sama baza LUB masa↔objętość (gęstość ~1 g/ml).
  if (recipe.base === invoice.base || (massVol(recipe.base) && massVol(invoice.base))) {
    return (recipe.value / invoice.value) * unitPrice;
  }
  // Faktura za szt/opak, receptura w g/ml → potrzebna gramatura opakowania z nazwy.
  if (!massVol(invoice.base) && massVol(recipe.base)) {
    const pkg = parsePackageSize(productName);
    if (pkg && massVol(pkg.base)) return (recipe.value / pkg.valueInBase) * unitPrice;
    return null; // nieznana gramatura opakowania — nie mnóż gramów × cena/szt
  }
  if (massVol(invoice.base) && !massVol(recipe.base)) return null;
  return qty * unitPrice;
}

const UNITS = ["g", "kg", "dag", "ml", "l", "szt", "opak", "por"];

// ─── Ingredient row (edit form) ────────────────────────────────────────────────

type IngredientRow = DishIngredientInput & {
  _key: string;
  productName?: string;
  unitPrice?: number | null;
  invoiceUnit?: string;
  // Koszt policzony przez backend (z fallbackiem do szacunku AI + poprawną konwersją
  // jednostek) dla wyjściowej gramatury — skalowany proporcjonalnie przy edycji.
  baseCost?: number | null;
  baseQty?: number;
  baseUnit?: string;
  // Metadane wyceny produktu — umożliwiają ustawienie ceny/wagi z poziomu edytora.
  canSetPrice?: boolean;
  needsPackage?: boolean;
  manualPrice?: number | null;
  packageQty?: number | null;
};

// Koszt składnika w edytorze: preferuj koszt z backendu skalowany po gramaturze;
// dla nowo dodanych składników policz z ceny faktury (fix jednostek jak w calcIngredientCost).
function rowLiveCost(ing: IngredientRow): number | null {
  if (ing.baseCost != null && ing.baseQty && ing.baseQty > 0) {
    const b = toBase(ing.baseQty, ing.baseUnit || ing.unit);
    const c = toBase(ing.quantity, ing.unit);
    if (b.base === c.base && b.value > 0) return ing.baseCost * (c.value / b.value);
  }
  if (ing.unitPrice && ing.invoiceUnit) return calcIngredientCost(ing.quantity, ing.unit, ing.invoiceUnit, ing.unitPrice, ing.productName ?? "");
  return null;
}

function EditIngredientRow({
  ing,
  onChange,
  onRemove,
  onProductUpdated,
}: {
  ing: IngredientRow;
  onChange: (u: IngredientRow) => void;
  onRemove: () => void;
  onProductUpdated: () => void;
}) {
  const [raw, setRaw] = useState(String(ing.quantity));
  const { toast } = useToast();
  const setManual = useSetProductManualPrice();
  const setPkg = useSetProductPackage();
  const [priceVal, setPriceVal] = useState(ing.manualPrice != null ? String(ing.manualPrice) : "");
  const [priceUnit, setPriceUnit] = useState("kg");
  const [pkgVal, setPkgVal] = useState(ing.packageQty != null ? String(ing.packageQty) : "");
  const [pkgUnitSel, setPkgUnitSel] = useState("g");

  // Sync raw when parent resets (e.g. on load)
  useEffect(() => {
    setRaw((prev) => {
      const parsed = parseFloat(prev.replace(",", "."));
      return parsed === ing.quantity ? prev : String(ing.quantity);
    });
  }, [ing.quantity]);

  const liveCost = rowLiveCost(ing);

  async function savePrice() {
    const n = parseFloat(priceVal.replace(",", "."));
    if (!(n > 0)) { toast({ variant: "destructive", title: "Podaj cenę większą od zera" }); return; }
    try {
      await setManual.mutateAsync({ id: ing.productId, data: { manualPrice: n, manualUnit: priceUnit } });
      const newCost = calcIngredientCost(ing.quantity, ing.unit, priceUnit, n, "");
      onChange({ ...ing, manualPrice: n, baseCost: newCost, baseQty: ing.quantity, baseUnit: ing.unit });
      onProductUpdated();
      toast({ title: "Zapisano cenę", description: `${ing.productName}: ${n} zł/${priceUnit}` });
    } catch { toast({ variant: "destructive", title: "Nie udało się zapisać ceny" }); }
  }

  async function savePkg() {
    const n = parseFloat(pkgVal.replace(",", "."));
    if (!(n > 0)) { toast({ variant: "destructive", title: "Podaj wagę większą od zera" }); return; }
    try {
      await setPkg.mutateAsync({ id: ing.productId, data: { packageQty: n, packageUnit: pkgUnitSel } });
      const rb = toBase(ing.quantity, ing.unit);
      const pb = toBase(n, pkgUnitSel);
      const mv = (b: string) => b === "g" || b === "ml";
      const newCost = ing.unitPrice != null && mv(rb.base) && mv(pb.base) && pb.value > 0 ? (rb.value / pb.value) * ing.unitPrice : null;
      onChange({ ...ing, packageQty: n, needsPackage: false, baseCost: newCost, baseQty: ing.quantity, baseUnit: ing.unit });
      onProductUpdated();
      toast({ title: "Zapisano wagę opakowania", description: `1 ${ing.invoiceUnit ?? "szt"} ≈ ${n} ${pkgUnitSel}` });
    } catch { toast({ variant: "destructive", title: "Nie udało się zapisać" }); }
  }

  return (
    <div className="rounded-xl p-3 space-y-2 bg-secondary/40 border border-border">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground truncate pr-2">{ing.productName ?? `Produkt #${ing.productId}`}</span>
        <button onClick={onRemove} className="text-muted-foreground/50 hover:text-destructive transition-colors shrink-0">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="text"
          inputMode="decimal"
          value={raw}
          onChange={(e) => {
            const val = e.target.value;
            setRaw(val);
            const parsed = parseFloat(val.replace(",", "."));
            if (!isNaN(parsed) && parsed >= 0) onChange({ ...ing, quantity: parsed });
          }}
          onBlur={() => {
            const parsed = parseFloat(raw.replace(",", "."));
            const final = isNaN(parsed) || parsed < 0 ? 0 : parsed;
            setRaw(String(final));
            onChange({ ...ing, quantity: final });
          }}
          className="w-24 h-8 text-sm text-right"
        />
        <select
          value={ing.unit}
          onChange={(e) => onChange({ ...ing, unit: e.target.value })}
          className="h-8 px-2 text-sm rounded-md bg-background border border-input text-foreground flex-1"
        >
          {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
        {liveCost != null ? (
          <span className="text-xs text-muted-foreground shrink-0 tabular-nums">{fmt(liveCost)}</span>
        ) : (
          <span className="text-[10px] text-warning shrink-0">brak ceny</span>
        )}
      </div>

      {/* Ustawienie wagi opakowania (cena „za szt" z faktury) */}
      {ing.needsPackage && (
        <div className="flex items-center gap-1.5 pt-1">
          <span className="text-[11px] text-muted-foreground">Waga 1 {ing.invoiceUnit}:</span>
          <Input value={pkgVal} onChange={(e) => setPkgVal(e.target.value)} inputMode="decimal" placeholder="np. 300" className="h-7 w-16 text-xs" />
          <select value={pkgUnitSel} onChange={(e) => setPkgUnitSel(e.target.value)} className="h-7 px-1 text-xs rounded-md bg-background border border-input">
            {["g", "kg", "ml", "l"].map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <Button size="sm" onClick={savePkg} disabled={setPkg.isPending} className="h-7 text-xs ml-auto">{setPkg.isPending ? "…" : "Zapisz"}</Button>
        </div>
      )}

      {/* Ręczne przypisanie ceny (wyrób własny / brak faktury) */}
      {!ing.needsPackage && ing.canSetPrice && (
        <div className="flex items-center gap-1.5 pt-1">
          <span className="text-[11px] text-muted-foreground">Cena:</span>
          <Input value={priceVal} onChange={(e) => setPriceVal(e.target.value)} inputMode="decimal" placeholder="np. 80" className="h-7 w-16 text-xs" />
          <span className="text-[11px] text-muted-foreground">zł/</span>
          <select value={priceUnit} onChange={(e) => setPriceUnit(e.target.value)} className="h-7 px-1 text-xs rounded-md bg-background border border-input">
            {["kg", "l", "szt", "g", "ml"].map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <Button size="sm" onClick={savePrice} disabled={setManual.isPending} className="h-7 text-xs ml-auto">{setManual.isPending ? "…" : "Zapisz"}</Button>
        </div>
      )}
    </div>
  );
}

// ─── Dish form (create / edit) ─────────────────────────────────────────────────

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
        unitPrice: ing.unitPrice ?? null,
        invoiceUnit: ing.invoiceUnit ?? ing.productUnit ?? undefined,
        baseCost: ing.ingredientCost ?? null,
        baseQty: ing.quantity,
        baseUnit: ing.unit,
        canSetPrice: ing.canSetPrice,
        needsPackage: ing.needsPackage,
        manualPrice: ing.manualPrice ?? null,
        packageQty: ing.packageQty ?? null,
      })),
    );
  }

  const filteredProducts = useMemo(
    () => products.filter((p) => p.name.toLowerCase().includes(productSearch.toLowerCase())).slice(0, 15),
    [products, productSearch],
  );

  // Nowy składnik od razu dostaje ostatnią cenę z faktury (z listy produktów).
  // Wcześniej szła tylko nazwa — edytor pokazywał „brak ceny" aż do zapisu dania,
  // mimo że produkt pochodzi z faktur i cenę ma.
  function addIngredient(productId: number, productName: string, productUnit: string, latestPrice?: number | null) {
    if (ingredients.find((i) => i.productId === productId)) return;
    const u = (productUnit ?? "").toLowerCase().trim();
    const defaultUnit = (u === "ml" || u === "l" || u === "litr") ? "ml" : "g";
    const unitPrice = latestPrice != null && latestPrice > 0 ? latestPrice : null;
    const row: IngredientRow = {
      _key: String(Date.now()),
      productId,
      productName,
      quantity: 100,
      unit: defaultUnit,
      unitPrice,
      invoiceUnit: unitPrice != null ? productUnit || "szt" : undefined,
    };
    const cost = unitPrice != null ? calcIngredientCost(100, defaultUnit, row.invoiceUnit!, unitPrice, productName) : null;
    // Cena jest, ale faktura liczy „za szt", a z nazwy nie da się odczytać wagi →
    // od razu prośba o wagę 1 szt. Brak ceny w ogóle → ręczna cena.
    row.needsPackage = unitPrice != null && cost == null;
    row.canSetPrice = unitPrice == null;
    setIngredients((prev) => [...prev, row]);
    setProductSearch("");
  }

  // Live total cost preview
  const liveTotal = useMemo(() => {
    let total = 0;
    let known = 0;
    for (const ing of ingredients) {
      const c = rowLiveCost(ing);
      if (c != null) { total += c; known++; }
    }
    return known > 0 ? total : null;
  }, [ingredients]);

  const liveMargin = useMemo(() => {
    const sp = parseFloat(sellPrice);
    if (!liveTotal || !sp || sp <= 0) return null;
    return ((sp - liveTotal) / sp) * 100;
  }, [liveTotal, sellPrice]);

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
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{editId ? "Edytuj danie" : "Nowe danie"}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 mt-2 pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Nazwa *</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="np. Burger BBQ" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Cena sprzedaży (zł) *</label>
              <Input type="number" min={0} step="0.01" value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} placeholder="42.00" />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Kategoria</label>
            <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="np. Dania główne" />
          </div>

          {/* Live cost preview */}
          {(liveTotal != null || liveMargin != null) && (
            <div className="rounded-xl p-3 flex items-center justify-between bg-primary/5 border border-primary/20">
              <div className="text-xs text-muted-foreground">Szacowany koszt porcji</div>
              <div className="flex items-center gap-3">
                {liveTotal != null && <span className="text-sm font-bold text-foreground">{fmt(liveTotal)}</span>}
                {liveMargin != null && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-secondary" style={{ color: marginColor(liveMargin) }}>
                    {liveMargin.toFixed(1)}% marży
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Ingredient search */}
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Składniki ({ingredients.length})</label>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="+ Dodaj produkt ze Spendly..."
                className="pl-8 text-sm"
              />
            </div>
            {productSearch && (
              <div className="rounded-xl border border-border bg-card shadow-sm mb-3 overflow-hidden">
                {filteredProducts.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-3 text-center">Brak wyników</p>
                ) : filteredProducts.map((p) => {
                  const added = !!ingredients.find((i) => i.productId === p.id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => addIngredient(p.id, p.name, p.unit ?? "g", p.latestPrice)}
                      disabled={added}
                      className="w-full text-left px-3 py-2 text-sm border-b border-border last:border-0 hover:bg-secondary/50 transition-colors disabled:opacity-40"
                    >
                      <span className="text-foreground">{p.name}</span>
                      <span className="text-muted-foreground text-xs ml-1.5">{p.unit}</span>
                      {added && <span className="text-[10px] text-primary ml-1.5">dodany</span>}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {ingredients.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">Wyszukaj produkt ze Spendly i dodaj go do receptury</p>
              ) : ingredients.map((ing) => (
                <EditIngredientRow
                  key={ing._key}
                  ing={ing}
                  onChange={(u) => setIngredients((prev) => prev.map((i) => i._key === u._key ? u : i))}
                  onRemove={() => setIngredients((prev) => prev.filter((i) => i._key !== ing._key))}
                  onProductUpdated={() => {
                    queryClient.invalidateQueries({ queryKey: getGetDishQueryKey(editId ?? 0) });
                    queryClient.invalidateQueries({ queryKey: getListDishesQueryKey() });
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-2 pt-3 border-t border-border">
          <Button variant="outline" onClick={onClose} className="flex-1">Anuluj</Button>
          <Button onClick={handleSave} disabled={isSaving} className="flex-1">
            {isSaving ? "Zapisuję..." : editId ? "Zapisz zmiany" : "Dodaj danie"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Ingredient row in detail view ────────────────────────────────────────────
// Wiersz tabeli (nie osobna karta): nazwa + źródło ceny, ilość, koszt, udział.
// Klik rozwija szczegóły i formularze (waga opakowania, cena ręczna).

function IngredientDetailRow({
  ing,
  totalCost,
  onPackageSaved,
}: {
  ing: DishDetail["ingredients"][number];
  totalCost: number | null;
  onPackageSaved: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { toast } = useToast();
  const setPkg = useSetProductPackage();
  const setManual = useSetProductManualPrice();
  const [pkgQty, setPkgQty] = useState(ing.packageQty != null ? String(ing.packageQty) : "");
  const [pkgUnit, setPkgUnit] = useState("g");
  const [manualVal, setManualVal] = useState(ing.manualPrice != null ? String(ing.manualPrice) : "");
  const [manualUnit, setManualUnit] = useState("kg");
  const sharePct = ing.ingredientCost != null && totalCost ? (ing.ingredientCost / totalCost) * 100 : null;
  // Formularz ceny pokazujemy od razu, gdy składnik nie ma żadnej ceny.
  const showPriceForm = ing.canSetPrice && (ing.ingredientCost == null || expanded);
  const showPackageForm = !!ing.needsPackage;

  async function savePrice() {
    const n = parseFloat(manualVal.replace(",", "."));
    if (!(n > 0)) { toast({ variant: "destructive", title: "Podaj cenę większą od zera" }); return; }
    try {
      await setManual.mutateAsync({ id: ing.productId, data: { manualPrice: n, manualUnit } });
      toast({ title: "Zapisano cenę", description: `${ing.productName}: ${n} zł/${manualUnit}` });
      onPackageSaved();
    } catch {
      toast({ variant: "destructive", title: "Nie udało się zapisać ceny" });
    }
  }

  async function savePackage() {
    const n = parseFloat(pkgQty.replace(",", "."));
    if (!(n > 0)) { toast({ variant: "destructive", title: "Podaj wagę większą od zera" }); return; }
    try {
      await setPkg.mutateAsync({ id: ing.productId, data: { packageQty: n, packageUnit: pkgUnit } });
      toast({ title: "Zapisano wagę opakowania", description: `1 ${ing.invoiceUnit ?? "szt"} ≈ ${n} ${pkgUnit}. Liczę z faktury.` });
      onPackageSaved();
    } catch {
      toast({ variant: "destructive", title: "Nie udało się zapisać" });
    }
  }

  const priceMeta =
    ing.unitPrice != null
      ? `${fmt(ing.unitPrice)}/${ing.productUnit}`
      : ing.priceSource === "estimate" && ing.estUnitPrice != null
        ? `~${fmt(ing.estUnitPrice)}/kg`
        : null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((s) => !s)}
        aria-expanded={expanded}
        className="w-full grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 py-2.5 text-left hover:bg-secondary/40 transition-colors px-1 -mx-1 rounded-sm"
      >
        <span className="min-w-0">
          <span className="block text-sm text-foreground truncate" title={ing.productName}>{ing.productName}</span>
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            {ing.priceSource === "estimate" && <span className="text-warning" title="Prognoza ceny AI, brak faktury">szacunek</span>}
            {ing.priceSource === "manual" && <span title="Cena przypisana ręcznie">ręczna</span>}
            {ing.priceSource === "invoice" && <span title="Cena z faktury">faktura</span>}
            {priceMeta && <span className="num">{priceMeta}</span>}
          </span>
        </span>
        <span className="text-xs text-muted-foreground num text-right w-16">
          {ing.quantity} {ing.unit}
        </span>
        <span className="text-sm num text-right w-20">
          {ing.ingredientCost != null ? (
            fmt(ing.ingredientCost)
          ) : (
            <span className="text-[11px] text-warning inline-flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> brak
            </span>
          )}
        </span>
        <span className="w-14 text-right">
          <span className="block text-[11px] text-muted-foreground num">{sharePct != null ? `${sharePct.toFixed(0)}%` : ""}</span>
          {sharePct != null && (
            <span className="block h-0.5 bg-border mt-0.5">
              <span className="block h-full bg-primary" style={{ width: `${Math.min(sharePct, 100)}%` }} />
            </span>
          )}
        </span>
      </button>

      {(expanded || showPackageForm || showPriceForm) && (
        <div className="pb-3 pl-1 space-y-2.5">
          {expanded && ing.unitPrice != null && (
            <p className="text-[11px] text-muted-foreground">
              Aktualna cena z faktury: <span className="num text-foreground">{fmt(ing.unitPrice)} / {ing.productUnit}</span>
            </p>
          )}

          {showPackageForm && (
            <div>
              <p className="text-[11px] text-muted-foreground mb-1.5">
                Cena z faktury to {fmt(ing.unitPrice)}/{ing.invoiceUnit}, ale nie znamy wagi 1 {ing.invoiceUnit}. Podaj ją, a policzymy koszt z faktury:
              </p>
              <div className="flex items-center gap-1.5">
                <Input value={pkgQty} onChange={(e) => setPkgQty(e.target.value)} inputMode="decimal" placeholder="np. 300" className="h-7 w-20 text-xs" />
                <select
                  value={pkgUnit}
                  onChange={(e) => setPkgUnit(e.target.value)}
                  className="h-7 px-1.5 text-xs rounded-sm bg-background border border-input text-foreground"
                >
                  {["g", "kg", "ml", "l"].map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
                <span className="text-[11px] text-muted-foreground">= 1 {ing.invoiceUnit}</span>
                <Button size="sm" onClick={savePackage} disabled={setPkg.isPending} className="h-7 text-xs ml-auto">
                  {setPkg.isPending ? "…" : "Zapisz"}
                </Button>
              </div>
            </div>
          )}

          {showPriceForm && (
            <div>
              <p className="text-[11px] text-muted-foreground mb-1.5">
                {ing.priceSource === "estimate" ? "Cena z prognozy AI. Możesz przypisać własną:" : "Brak ceny z faktury (np. wyrób własny). Przypisz cenę ręcznie:"}
              </p>
              <div className="flex items-center gap-1.5">
                <Input value={manualVal} onChange={(e) => setManualVal(e.target.value)} inputMode="decimal" placeholder="np. 30" className="h-7 w-20 text-xs" />
                <span className="text-[11px] text-muted-foreground">zł /</span>
                <select
                  value={manualUnit}
                  onChange={(e) => setManualUnit(e.target.value)}
                  className="h-7 px-1.5 text-xs rounded-sm bg-background border border-input text-foreground"
                >
                  {["kg", "l", "szt", "g", "ml"].map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
                <Button size="sm" onClick={savePrice} disabled={setManual.isPending} className="h-7 text-xs ml-auto">
                  {setManual.isPending ? "…" : "Zapisz"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Powiązanie dania z pozycją sprzedaży GoPOS (ręczna korekta) ──────────────
function PosLinkSection({ dishId, currentLink, onChanged }: { dishId: number; currentLink: string | null; onChanged: () => void }) {
  const { toast } = useToast();
  const { data: posData } = useGetPosItems({ month: currentMonth() });
  const setLink = useSetDishPosLink();
  const items = posData?.items ?? [];
  if (items.length === 0) return null; // brak danych GoPOS → nie pokazuj

  async function pick(name: string | null) {
    try {
      await setLink.mutateAsync({ id: dishId, data: { posProductName: name } });
      onChanged();
      toast({ title: name ? "Powiązano z GoPOS" : "Przywrócono auto-dopasowanie", description: name ?? undefined });
    } catch { toast({ variant: "destructive", title: "Nie udało się zapisać powiązania" }); }
  }

  const fmtQty = (v: number) => new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 1 }).format(v);
  const options = [
    { value: "__auto__", label: "Automatyczne (po nazwie dania)" },
    ...items.map((it) => ({ value: it.name, label: `${it.variant ? "· " : ""}${it.name} — ${fmtQty(it.qty)} szt` })),
  ];

  return (
    <div>
      <p className="label-caps text-[10px] text-muted-foreground mb-1.5">Powiązanie ze sprzedażą (GoPOS)</p>
      <Combobox
        options={options}
        value={currentLink ?? "__auto__"}
        onChange={(v) => pick(v === "__auto__" ? null : v)}
        disabled={setLink.isPending}
        className="w-full h-9"
        placeholder="Automatyczne (po nazwie dania)"
        searchPlaceholder="Szukaj pozycji GoPOS…"
      />
      <p className="text-[10px] text-muted-foreground mt-1">
        {currentLink
          ? `Ręcznie powiązane z: ${currentLink}.`
          : "Grupa zbiorcza łączy warianty (np. wysmażenia steka). Pojedynczy wariant (z kropką) wybierz, gdy każdy ma inny koszt (np. smaki herbaty)."}
      </p>
    </div>
  );
}

// ─── Dish detail panel ────────────────────────────────────────────────────────
// Desktop: panel z prawej o stałej szerokości (wcześniej dolny arkusz na całą
// szerokość ekranu — wiersze „etykieta … wartość" rozjeżdżały się na 2000 px).
// Telefon: dolny arkusz jak dotąd.

type FcTone = "positive" | "warning" | "negative";
function foodCostTone(pct: number): FcTone {
  if (pct <= 35) return "positive";
  if (pct <= 50) return "warning";
  return "negative";
}
const TONE_TEXT: Record<FcTone, string> = { positive: "text-positive", warning: "text-warning", negative: "text-negative" };
const TONE_BG: Record<FcTone, string> = { positive: "bg-positive", warning: "bg-warning", negative: "bg-negative" };
const TONE_LABEL: Record<FcTone, string> = { positive: "w normie", warning: "do kontroli", negative: "za wysoki" };

// Skala paska food cost: 0–60%. Strefa celu branżowego 25–35% zaznaczona tłem.
const FC_SCALE = 60;

function DishDetailSheet({
  dishId,
  sales,
  monthLabelText,
  onClose,
  onEdit,
  onDelete,
}: {
  dishId: number;
  sales?: { soldQty: number; monthlyCost?: number | null } | null;
  monthLabelText?: string;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { data: dish, isLoading } = useGetDish(dishId);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const reprice = useRepriceDish();
  const isMobile = useIsMobile();
  const costPct = dish?.portionCost != null && dish.sellPrice > 0 ? (dish.portionCost / dish.sellPrice) * 100 : null;
  const tone = costPct != null ? foodCostTone(costPct) : null;
  const ingredients = useMemo(
    () => [...(dish?.ingredients ?? [])].sort((a, b) => (b.ingredientCost ?? -1) - (a.ingredientCost ?? -1)),
    [dish],
  );

  async function handleReprice() {
    try {
      const res = await reprice.mutateAsync({ id: dishId });
      queryClient.invalidateQueries({ queryKey: getGetDishQueryKey(dishId) });
      queryClient.invalidateQueries({ queryKey: getListDishesQueryKey() });
      toast({
        title: res.repriced > 0 ? "Przeliczono z faktur" : "Brak zmian",
        description:
          res.repriced > 0
            ? `${res.repriced} składnik(i) dostały realną cenę z KSeF.`
            : "Nie znaleziono nowych dopasowań do kupionych produktów.",
      });
    } catch {
      toast({ variant: "destructive", title: "Nie udało się przeliczyć" });
    }
  }

  const refreshDish = () => {
    queryClient.invalidateQueries({ queryKey: getGetDishQueryKey(dishId) });
    queryClient.invalidateQueries({ queryKey: getListDishesQueryKey() });
  };

  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={cn(
          "p-0 flex flex-col gap-0",
          isMobile ? "max-h-[88vh] rounded-t-md" : "w-full sm:max-w-[560px]",
        )}
      >
        {isLoading || !dish ? (
          <div className="py-16 text-center text-muted-foreground text-sm">Ładowanie…</div>
        ) : (
          <>
            {/* Nagłówek — poza scrollem, akcje zawsze pod ręką */}
            <div className="flex-shrink-0 px-5 pt-5 pb-4 pr-12 border-b border-border flex items-start justify-between gap-3">
              <div className="min-w-0">
                {dish.category && <p className="label-caps text-[10px] text-muted-foreground mb-1">{dish.category}</p>}
                <h2 className="head-display text-lg font-bold text-foreground leading-tight">{dish.name}</h2>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  onClick={handleReprice}
                  disabled={reprice.isPending}
                  title="Przelicz z aktualnych faktur"
                  aria-label="Przelicz z aktualnych faktur"
                  className="p-2 rounded-sm text-muted-foreground hover:text-primary hover:bg-secondary transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={cn("w-4 h-4", reprice.isPending && "animate-spin")} />
                </button>
                <button onClick={onEdit} title="Edytuj" aria-label="Edytuj danie" className="p-2 rounded-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                  <Edit2 className="w-4 h-4" />
                </button>
                <button onClick={onDelete} title="Usuń" aria-label="Usuń danie" className="p-2 rounded-sm text-muted-foreground hover:text-negative hover:bg-secondary transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
              {/* KPI — cztery liczby w jednym rzędzie */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border border border-border">
                {[
                  { label: "Cena", value: fmt(dish.sellPrice), cls: "" },
                  { label: "Koszt porcji", value: fmt(dish.portionCost), cls: "" },
                  { label: "Food cost", value: costPct != null ? `${costPct.toFixed(1)}%` : "—", cls: tone ? TONE_TEXT[tone] : "" },
                  { label: "Marża", value: dish.marginPct != null ? `${dish.marginPct.toFixed(1)}%` : "—", cls: "" },
                ].map((k) => (
                  <div key={k.label} className="bg-card px-3 py-2.5">
                    <p className="label-caps text-[10px] text-muted-foreground">{k.label}</p>
                    <p className={cn("num-lg text-lg mt-0.5", k.cls)}>{k.value}</p>
                  </div>
                ))}
              </div>

              {/* Pasek food cost ze strefą celu */}
              {costPct != null && tone && (
                <div>
                  <div className="relative h-2 bg-border">
                    <div
                      className="absolute inset-y-0 bg-positive/25"
                      style={{ left: `${(25 / FC_SCALE) * 100}%`, width: `${(10 / FC_SCALE) * 100}%` }}
                      title="Cel branżowy 25–35%"
                    />
                    <div className={cn("absolute inset-y-0 left-0", TONE_BG[tone])} style={{ width: `${Math.min(costPct / FC_SCALE, 1) * 100}%` }} />
                  </div>
                  <div className="flex justify-between text-[11px] text-muted-foreground mt-1">
                    <span>
                      Food cost <span className={cn("font-semibold", TONE_TEXT[tone])}>{TONE_LABEL[tone]}</span>
                    </span>
                    <span>cel 25–35%</span>
                  </div>
                </div>
              )}

              {/* Sprzedaż w miesiącu + wiarygodność wyceny */}
              <div className="rule-list border-y border-border text-xs">
                {monthLabelText && (
                  <div className="flex items-center justify-between py-2">
                    <span className="text-muted-foreground">Sprzedaż, {monthLabelText}</span>
                    <span className="num">
                      {sales && sales.soldQty > 0 ? (
                        <>
                          {sales.soldQty.toLocaleString("pl-PL")} szt.
                          {sales.monthlyCost != null && <span className="text-muted-foreground"> · surowiec {fmt(sales.monthlyCost)}</span>}
                        </>
                      ) : (
                        <span className="text-muted-foreground">brak sprzedaży</span>
                      )}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between py-2">
                  <span className="text-muted-foreground">Wycena</span>
                  <span className="num">
                    {dish.confidencePct}% składników z ceną
                    {dish.invoiceCostPct != null && <span className="text-muted-foreground"> · {dish.invoiceCostPct}% kosztu z faktur</span>}
                  </span>
                </div>
              </div>
              {dish.invoiceCostPct != null && dish.invoiceCostPct < 100 && (
                <p className="text-[11px] text-muted-foreground -mt-3">
                  Reszta kosztu to prognoza AI. Ceny uściślą się, gdy te surowce pojawią się na fakturach z KSeF.
                </p>
              )}

              {/* Powiązanie ze sprzedażą GoPOS (ręczna korekta) */}
              <PosLinkSection
                dishId={dishId}
                currentLink={dish.posProductName ?? null}
                onChanged={() => {
                  refreshDish();
                  queryClient.invalidateQueries({ queryKey: getGetDishesSalesQueryKey() });
                }}
              />

              {/* Składniki — tabela, najdroższe na górze */}
              <div>
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 pb-1.5 border-b border-border label-caps text-[10px] text-muted-foreground">
                  <span>Składniki ({ingredients.length})</span>
                  <span className="w-16 text-right">Ilość</span>
                  <span className="w-20 text-right">Koszt</span>
                  <span className="w-14 text-right">Udział</span>
                </div>
                <div className="rule-list">
                  {ingredients.map((ing) => (
                    <IngredientDetailRow key={ing.id} ing={ing} totalCost={dish.portionCost ?? null} onPackageSaved={refreshDish} />
                  ))}
                </div>
                {ingredients.length === 0 && <p className="text-xs text-muted-foreground py-4">Brak składników. Dodaj je w edycji dania.</p>}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Dish card ────────────────────────────────────────────────────────────────

function DishCard({
  dish,
  sales,
  monthLabelText,
  onClick,
}: {
  dish: { id: number; name: string; category?: string | null; sellPrice: number; portionCost?: number | null; marginPct?: number | null; confidencePct: number; invoiceCostPct?: number | null };
  sales?: { soldQty: number; monthlyCost?: number | null } | null;
  monthLabelText?: string;
  onClick: () => void;
}) {
  const foodCostPct = dish.portionCost != null && dish.sellPrice > 0
    ? (dish.portionCost / dish.sellPrice) * 100 : null;
  const mc = marginColor(dish.marginPct);
  const sold = sales?.soldQty ?? 0;

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-2xl p-4 transition-colors glass hover:border-primary/30 hover:bg-primary/5 group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground truncate">{dish.name}</p>
          {dish.category && <p className="text-[11px] text-muted-foreground mt-0.5">{dish.category}</p>}
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-primary transition-colors shrink-0 mt-0.5" />
      </div>

      <div className="grid grid-cols-2 gap-3 mt-3">
        <div>
          <p className="text-[10px] text-muted-foreground mb-0.5">Sprzedaż</p>
          <p className="text-sm font-bold text-foreground tabular-nums">{fmt(dish.sellPrice)}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground mb-0.5">Koszt porcji</p>
          <p className="text-sm font-bold text-foreground tabular-nums">{fmt(dish.portionCost)}</p>
        </div>
      </div>

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
        <span className="text-xs font-semibold" style={{ color: mc }}>
          Marża {dish.marginPct != null ? `${dish.marginPct.toFixed(1)}%` : "—"}
        </span>
        {foodCostPct != null && (
          <span className="text-xs font-medium" style={{ color: foodCostColor(foodCostPct) }}>
            Food Cost {foodCostPct.toFixed(1)}%
          </span>
        )}
        {dish.portionCost != null && dish.invoiceCostPct != null && dish.invoiceCostPct < 100 && (
          <span className="text-[10px] font-medium" style={{ color: reliabilityColor(dish.invoiceCostPct) }} title="Udział kosztu z realnych faktur (reszta to prognoza AI)">
            {dish.invoiceCostPct}% z faktur
          </span>
        )}
        {dish.portionCost == null && dish.confidencePct < 100 && (
          <span className="text-[10px] text-warning flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> niekompletne
          </span>
        )}
      </div>

      {sold > 0 && (
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-dashed border-border text-[11px]">
          <span className="text-muted-foreground">Sprzedano <b className="text-foreground tabular-nums">{new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 1 }).format(sold)}</b>{monthLabelText ? ` w ${monthLabelText}` : " w okresie"}</span>
          {sales?.monthlyCost != null && (
            <span className="text-muted-foreground">koszt <b className="text-foreground tabular-nums">{fmt(sales.monthlyCost)}</b></span>
          )}
        </div>
      )}
    </button>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function FoodCostPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const deleteDish = useDeleteDish();

  const { data: dishes = [], isLoading, isError, refetch } = useListDishes();

  const [month, setMonth] = useState(currentMonth());
  const { data: salesData } = useGetDishesSales({ month });
  const salesById = useMemo(
    () => new Map((salesData?.dishes ?? []).map((d) => [d.id, { soldQty: d.soldQty, monthlyCost: d.monthlyCost ?? null }])),
    [salesData],
  );
  const [hasGopos, setHasGopos] = useState(false);
  useEffect(() => {
    const w = salesData?.weighted;
    if (w && ((w.revenue ?? 0) > 0 || w.dishesSold > 0)) setHasGopos(true);
  }, [salesData]);

  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [viewDishId, setViewDishId] = useState<number | null>(null);
  const [editDishId, setEditDishId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [onlyUnmatched, setOnlyUnmatched] = useState(false);

  const categories = useMemo(
    () => [...new Set(dishes.map((d) => d.category).filter(Boolean) as string[])].sort(),
    [dishes],
  );

  // Ile dań ma dopasowaną sprzedaż z GoPOS (do licznika/filtra „niepowiązane").
  const matchedCount = useMemo(
    () => dishes.filter((d) => (salesById.get(d.id)?.soldQty ?? 0) > 0).length,
    [dishes, salesById],
  );

  const filtered = useMemo(() => {
    let list = dishes;
    if (search) list = list.filter((d) => d.name.toLowerCase().includes(search.toLowerCase()));
    if (categoryFilter) list = list.filter((d) => d.category === categoryFilter);
    if (onlyUnmatched) list = list.filter((d) => (salesById.get(d.id)?.soldQty ?? 0) === 0);
    return list;
  }, [dishes, search, categoryFilter, onlyUnmatched, salesById]);

  // KPIs
  const withMargin = dishes.filter((d) => d.marginPct != null);
  const avgMargin = withMargin.length > 0 ? withMargin.reduce((s, d) => s + d.marginPct!, 0) / withMargin.length : null;
  const withCost = dishes.filter((d) => d.portionCost != null && d.sellPrice > 0);
  const avgFoodCost = withCost.length > 0
    ? withCost.reduce((s, d) => s + (d.portionCost! / d.sellPrice) * 100, 0) / withCost.length
    : null;
  const lowMarginCount = dishes.filter((d) => d.marginPct != null && d.marginPct < 40).length;

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
      <div className="p-5 md:p-7 space-y-5 max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">Food Cost</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Receptury i analiza marż</p>
          </div>
          <div className="grid grid-cols-2 gap-2 md:flex md:shrink-0">
            {dishes.length > 0 && (
              <Button
                variant="ghost"
                onClick={() => setShowReset(true)}
                className="h-9 text-sm w-full md:w-auto col-span-2 md:col-span-1 text-muted-foreground hover:text-negative"
              >
                <Trash2 className="w-4 h-4 mr-1" /> Wyzeruj menu
              </Button>
            )}
            <Button variant="outline" onClick={() => setShowImport(true)} className="h-9 text-sm w-full md:w-auto">
              <Sparkles className="w-4 h-4 mr-1" /> Importuj z menu
            </Button>
            <Button onClick={() => setShowCreate(true)} className="h-9 text-sm w-full md:w-auto">
              <Plus className="w-4 h-4 mr-1" /> Dodaj danie
            </Button>
          </div>
        </div>

        {/* Compact KPIs */}
        {dishes.length > 0 && (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {[
              { label: `${dishes.length} dań`, sub: "w menu" },
              { label: avgMargin != null ? `${avgMargin.toFixed(1)}%` : "—", sub: "śr. marża", color: marginColor(avgMargin) },
              { label: lowMarginCount > 0 ? String(lowMarginCount) : "0", sub: "do uwagi", warn: lowMarginCount > 0 },
              { label: avgFoodCost != null ? `${avgFoodCost.toFixed(1)}%` : "—", sub: "śr. food cost", color: avgFoodCost != null ? foodCostColor(avgFoodCost) : undefined },
            ].map(({ label, sub, warn, color }) => (
              <div key={sub} className="rounded-xl px-4 py-3 flex items-center justify-between glass">
                <span className="text-xs text-muted-foreground">{sub}</span>
                <span className={cn("text-sm font-bold", !color && !warn && "text-foreground")} style={color || warn ? { color: color ?? "#d97706" } : undefined}>{label}</span>
              </div>
            ))}
          </div>
        )}

        {/* GoPOS: prawdziwy food cost % ważony sprzedażą */}
        {hasGopos && salesData && (
          <div className="glass p-4">
            <div className="flex flex-col gap-2 mb-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-1.5">
                <ShoppingBag className="w-4 h-4 text-primary shrink-0" />
                <span className="text-sm font-semibold text-foreground">Realny food cost — GoPOS</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => setMonth(shiftMonth(month, -1))} className="p-1 rounded-lg border border-border hover:bg-secondary/50" aria-label="Poprzedni miesiąc"><ChevronLeft className="w-4 h-4" /></button>
                <span className="text-xs font-medium px-1.5 min-w-[100px] text-center capitalize">{monthLabel(month)}</span>
                <button onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= currentMonth()} className="p-1 rounded-lg border border-border hover:bg-secondary/50 disabled:opacity-40" aria-label="Następny miesiąc"><ChevronRight className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-3 md:grid-cols-4">
              <div>
                <p className="text-[10px] text-muted-foreground mb-0.5">Prawdziwy food cost</p>
                <p className="text-xl font-bold tabular-nums" style={{ color: salesData.weighted.foodCostPct != null ? foodCostColor(salesData.weighted.foodCostPct) : undefined }}>
                  {salesData.weighted.foodCostPct != null ? `${salesData.weighted.foodCostPct.toFixed(1)}%` : "—"}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground mb-0.5">Dań ze sprzedażą</p>
                <p className="text-xl font-bold text-foreground tabular-nums">{salesData.weighted.dishesSold}</p>
              </div>
              <div className="col-span-2 pt-2 border-t border-border/60 md:pt-0 md:border-t-0">
                <p className="text-[10px] text-muted-foreground mb-0.5">Koszt / przychód dań (brutto)</p>
                <p className="text-sm font-semibold text-foreground tabular-nums md:mt-1">
                  {fmt(salesData.weighted.costTotal)} <span className="text-muted-foreground font-normal">/</span> {fmt(salesData.weighted.revenue)}
                </p>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">
              Σ(koszt porcji × ilość) / przychód brutto <b>tych dań</b> (cena z menu × ilość). „Dań ze sprzedażą" = ile pozycji menu ma dopasowaną sprzedaż (nie liczba porcji).
              {(salesData.weighted.totalRevenue ?? 0) > 0 && <> Cały obrót GoPOS w okresie: {fmt(salesData.weighted.totalRevenue ?? 0)}.</>}
            </p>
            <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-3 border-t border-border">
              <span className="text-[11px] text-muted-foreground">
                Powiązane: <b className="text-foreground">{matchedCount}</b>/{dishes.length} dań
                {dishes.length - matchedCount > 0 && <> · <b className="text-warning">{dishes.length - matchedCount}</b> bez sprzedaży</>}
              </span>
              <button
                onClick={() => setOnlyUnmatched((v) => !v)}
                className={cn("text-[11px] font-medium px-2.5 py-1 rounded-lg border transition-colors", onlyUnmatched ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground hover:bg-secondary")}
              >
                {onlyUnmatched ? "Pokaż wszystkie" : "Pokaż niepowiązane"}
              </button>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-40 max-w-60">
            <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Szukaj..." className="pl-8 h-9 text-sm" />
          </div>
          {[null, ...categories].map((cat) => (
            <button
              key={cat ?? "__all__"}
              onClick={() => setCategoryFilter(cat)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                categoryFilter === cat ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary",
              )}
            >
              {cat ?? "Wszystkie"}
            </button>
          ))}
        </div>

        {/* Dish list */}
        {isLoading ? (
          <div className="py-16 text-center text-muted-foreground text-sm">Ładowanie...</div>
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <p className="text-muted-foreground text-sm">{dishes.length === 0 ? "Brak dań — zacznij od dodania pierwszego." : "Brak wyników."}</p>
            {dishes.length === 0 && (
              <button onClick={() => setShowCreate(true)} className="text-sm font-medium hover:underline text-primary">
                + Dodaj pierwsze danie
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((dish) => (
              <DishCard key={dish.id} dish={dish} sales={salesById.get(dish.id)} monthLabelText={hasGopos ? monthLabel(month) : undefined} onClick={() => setViewDishId(dish.id)} />
            ))}
          </div>
        )}
      </div>

      {/* Dialogs / Sheets */}
      {showReset && (
        <Suspense fallback={null}>
          <ResetMenuDialog
            dishCount={dishes.length}
            onClose={() => setShowReset(false)}
            onDone={() => {
              setShowReset(false);
              // Od razu do importu — po to się zeruje menu.
              setShowImport(true);
            }}
          />
        </Suspense>
      )}

      {showImport && (
        <Suspense fallback={null}>
          <MenuImportDialog
            onClose={() => setShowImport(false)}
            onSaved={() => {
              queryClient.invalidateQueries({ queryKey: getListDishesQueryKey() });
              queryClient.invalidateQueries({ queryKey: getGetDishesSalesQueryKey() });
              queryClient.invalidateQueries({ queryKey: getGetGoposMenuQueryKey() });
            }}
          />
        </Suspense>
      )}

      {showCreate && <DishFormDialog open onClose={() => setShowCreate(false)} />}

      {editDishId != null && (
        <DishFormDialog
          open
          editId={editDishId}
          onClose={() => { const prev = editDishId; setEditDishId(null); setViewDishId(prev); }}
        />
      )}

      {viewDishId != null && editDishId == null && (
        <DishDetailSheet
          dishId={viewDishId}
          sales={salesById.get(viewDishId)}
          monthLabelText={hasGopos ? monthLabel(month) : undefined}
          onClose={() => setViewDishId(null)}
          onEdit={() => { const id = viewDishId; setViewDishId(null); setEditDishId(id); }}
          onDelete={() => handleDelete(viewDishId)}
        />
      )}
    </Layout>
  );
}
