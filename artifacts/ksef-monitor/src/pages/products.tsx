import { useState, useEffect, useMemo } from "react";
import { Layout, PageHeader } from "@/components/layout";
import { useCostCenter } from "@/contexts/cost-center-context";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListProducts,
  useListProductsPaged,
  listProducts,
  useListSuppliers,
  useCorrectProductCategory,
  useGetCategorySpend,
  useListCategories,
  useBulkVerifyProducts,
  getListProductsQueryKey,
  getListProductsPagedQueryKey,
} from "@workspace/api-client-react";
import { currentMonth } from "@/lib/month";
import { MonthNavigator } from "@/components/month-navigator";
import { categorizeProduct } from "@/lib/categories";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  TrendingUp,
  TrendingDown,
  Package,
  ArrowDownAZ,
  ArrowUpZA,
  TrendingUp as PriceIcon,
  Building2,
  GitCompare,
  ShoppingCart,
  Layers,
  X,
  Download,
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  CheckCheck,
} from "lucide-react";
import { formatPrice, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { exportToCsv, todaySlug } from "@/lib/export-csv";
import { PriceChangeBadge } from "./products/shared";
import { KeywordComparisonModal } from "./products/keyword-comparison-modal";
import { PriceHistoryModal } from "./products/price-history-modal";
import { SupplierComparisonModal } from "./products/supplier-comparison-modal";
import { CategoryBadge } from "./products/category-management";

// Re-eksport: PriceHistoryModal jest używany przez inne strony (dashboard, invoices,
// price-alerts, supplier-detail) przez `from "./products"` — utrzymujemy ścieżkę.
export { PriceHistoryModal };

type SortKey = "name-asc" | "name-desc" | "price-desc" | "price-asc" | "change-desc" | "supplier-asc" | "quantity-desc" | "quantity-asc";
type ModalMode = "history" | "comparison";

export default function Products() {
  const queryClient = useQueryClient();
  const { selectedId: costCenterSelectedId } = useCostCenter();
  const [month, setMonth] = useState(() => currentMonth());
  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  const supplierId = supplierFilter !== "all" ? Number(supplierFilter) : undefined;
  const { data: suppliers } = useListSuppliers();
  const { data: spendItems } = useGetCategorySpend({ month, ...(costCenterSelectedId !== null ? { costCenterId: costCenterSelectedId } : {}) });
  const { data: categories } = useListCategories();
  const [search, setSearch] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("search") || "";
  });
  // Debounce — filtrowanie/paginacja nie odpalają się przy każdym znaku.
  const debouncedSearch = useDebouncedValue(search, 300);
  const [sort, setSort] = useState<SortKey>(() => {
    const params = new URLSearchParams(window.location.search);
    return (params.get("sort") || "name-asc") as SortKey;
  });
  const [categoryFilter, setCategoryFilter] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("category") || "all";
  });
  const [selectedProduct, setSelectedProduct] = useState<{ id: number; name: string } | null>(null);
  const [modalMode, setModalMode] = useState<ModalMode>("history");
  const [autoOpenId] = useState<number | null>(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    return id ? parseInt(id, 10) : null;
  });
  const [showKeywordComparison, setShowKeywordComparison] = useState(false);
  const [showNeedsReview, setShowNeedsReview] = useState(false);
  const [categorySpendOpen, setCategorySpendOpen] = useState(true);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkCategoryModalOpen, setBulkCategoryModalOpen] = useState(false);
  const [bulkCategorySelection, setBulkCategorySelection] = useState<string | null>(null);
  const [csvExporting, setCsvExporting] = useState(false);
  const bulkVerify = useBulkVerifyProducts();
  const bulkAssignCategory = useCorrectProductCategory();

  // Serwerowa paginacja/filtrowanie/sortowanie — backend zwraca tylko bieżącą stronę.
  const pagedParams = {
    month,
    ...(supplierId != null ? { supplierId } : {}),
    ...(costCenterSelectedId !== null ? { costCenterId: costCenterSelectedId } : {}),
    ...(categoryFilter !== "all" ? { category: categoryFilter } : {}),
    ...(showNeedsReview ? { needsReview: true } : {}),
    ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
    sort,
    page,
    limit: PAGE_SIZE,
  };
  const { data: pagedData, isLoading, isError } = useListProductsPaged(pagedParams);
  const items = pagedData?.items ?? [];
  const total = pagedData?.total ?? 0;
  const needsReviewCount = pagedData?.needsReviewCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Pełna lista — potrzebna tylko do „Porównaj po frazie" i deep-linku ?id=. Ładowana leniwie.
  const allProductsParams = { month, ...(supplierId != null ? { supplierId } : {}), ...(costCenterSelectedId !== null ? { costCenterId: costCenterSelectedId } : {}) };
  const { data: allProducts } = useListProducts(
    allProductsParams,
    { query: { enabled: showKeywordComparison || autoOpenId != null, queryKey: getListProductsQueryKey(allProductsParams) } },
  );

  useEffect(() => {
    if (autoOpenId == null || !allProducts) return;
    const product = allProducts.find((p) => p.id === autoOpenId);
    if (product) {
      setSelectedProduct({ id: product.id, name: product.name });
      setModalMode("history");
    }
  }, [autoOpenId, allProducts]);

  // Sync filters to URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (sort !== "name-asc") params.set("sort", sort);
    if (categoryFilter !== "all") params.set("category", categoryFilter);

    const newUrl = params.toString()
      ? `${window.location.pathname}?${params.toString()}`
      : window.location.pathname;

    window.history.replaceState({}, "", newUrl);
  }, [search, sort, categoryFilter]);

  function toggleSelect(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllReviewable() {
    setSelectedIds(new Set(reviewableIds));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  // Reset to first page when filters change
  useEffect(() => { setPage(1); }, [debouncedSearch, categoryFilter, supplierFilter, showNeedsReview, sort, month]);
  // Reset selection when leaving review mode keeps state clean across pages
  useEffect(() => { if (!showNeedsReview) clearSelection(); }, [showNeedsReview]);

  // Select-all działa w obrębie bieżącej strony (paginacja serwerowa).
  const reviewableIds = useMemo(() =>
    items.filter((p) => p.needsReview === true).map((p) => p.id),
    [items]
  );

  function invalidateProducts() {
    queryClient.invalidateQueries({ queryKey: getListProductsPagedQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
  }

  // CSV — pobiera pełny zbiór on-demand (lista jest paginowana serwerowo) i filtruje po stronie klienta.
  async function handleExportCsv() {
    setCsvExporting(true);
    try {
      const all = await listProducts({
        month,
        ...(supplierId != null ? { supplierId } : {}),
        ...(costCenterSelectedId !== null ? { costCenterId: costCenterSelectedId } : {}),
      });
      const q = debouncedSearch.trim().toLowerCase();
      const rows = all
        .filter((p) => {
          const matchesSearch = !q || p.name.toLowerCase().includes(q);
          const effectiveCategory = p.category ?? categorizeProduct(p.name);
          const matchesCategory = categoryFilter === "all" || effectiveCategory === categoryFilter;
          const matchesReview = !showNeedsReview || p.needsReview === true;
          return matchesSearch && matchesCategory && matchesReview;
        })
        .map((p) => {
          const catId = p.category ?? categorizeProduct(p.name);
          const catName = categories?.find((c) => c.id === catId)?.label ?? catId;
          return [
            p.name,
            catName,
            p.supplierName ?? "",
            p.unit,
            p.latestPrice ?? "",
            p.previousPrice ?? "",
            p.priceChangePercent ?? "",
          ];
        });
      exportToCsv(
        [
          ["Produkt", "Kategoria", "Dostawca", "Jednostka", "Ostatnia cena (PLN)", "Poprzednia cena (PLN)", "Zmiana (%)"],
          ...rows,
        ],
        `produkty-${todaySlug()}.csv`,
      );
    } finally {
      setCsvExporting(false);
    }
  }

  async function handleBulkVerify() {
    const ids = Array.from(selectedIds);
    await bulkVerify.mutateAsync({ data: { ids } });
    clearSelection();
    invalidateProducts();
  }

  async function handleBulkCategoryAssign() {
    if (!bulkCategorySelection) return;
    const ids = Array.from(selectedIds);
    try {
      await Promise.all(
        ids.map((id) =>
          bulkAssignCategory.mutateAsync({ id, data: { category: bulkCategorySelection } })
        )
      );
      setBulkCategoryModalOpen(false);
      setBulkCategorySelection(null);
      clearSelection();
      invalidateProducts();
    } catch (error) {
      console.error("Failed to assign category:", error);
    }
  }

  // Liczność per kategoria — z serwera (categoryCounts respektuje search + tryb weryfikacji,
  // ignoruje filtr kategorii). Pigułki i licznik „Wszystkie" są spójne z listą serwerową.
  const categoryCountMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of pagedData?.categoryCounts ?? []) map[c.category] = c.count;
    return map;
  }, [pagedData]);

  const searchFilteredCount = Object.values(categoryCountMap).reduce((sum, count) => sum + count, 0);

  const availableCategories = [
    ...(categories ?? []).filter((c) => c.id !== "inne" && (categoryCountMap[c.id] ?? 0) > 0),
    ...(categoryCountMap["inne"] ? [{ id: "inne", label: "Inne", emoji: "📦", isCustom: false }] : []),
  ];

  // Aggregate spending from API by effective category (explicit from DB or auto-detected by name)
  const categorySpend = useMemo(() => {
    if (!spendItems || spendItems.length === 0) return [];
    const map: Record<string, number> = {};
    for (const item of spendItems) {
      const catId = item.category ?? categorizeProduct(item.productName);
      map[catId] = (map[catId] ?? 0) + item.totalSpend;
    }
    const totalSpend = Object.values(map).reduce((s, v) => s + v, 0);
    const allCatDefs: Record<string, { label: string; emoji: string }> = Object.fromEntries(
      [...(categories ?? []), { id: "inne", label: "Inne", emoji: "📦", isCustom: false }].map((c) => [c.id, c])
    );
    return Object.entries(map)
      .map(([id, spend]) => ({
        id,
        label: allCatDefs[id]?.label ?? "Inne",
        emoji: allCatDefs[id]?.emoji ?? "📦",
        spend,
        pct: totalSpend > 0 ? (spend / totalSpend) * 100 : 0,
      }))
      .sort((a, b) => b.spend - a.spend);
  }, [spendItems, categories]);

  function openHistory(id: number, name: string) {
    setSelectedProduct({ id, name });
    setModalMode("history");
  }

  function openComparison(id: number, name: string, e: React.MouseEvent) {
    e.stopPropagation();
    setSelectedProduct({ id, name });
    setModalMode("comparison");
  }

  return (
    <Layout>
      <div className="px-4 py-5 md:px-8 md:py-8">
        <PageHeader
          title="Produkty"
          subtitle="Ceny surowców i historia zmian"
          action={<MonthNavigator month={month} onChange={setMonth} />}
        />

        {/* Category spend summary */}
        {categorySpend.length > 0 && (
          <div className="mb-6">
            <button
              onClick={() => setCategorySpendOpen((v) => !v)}
              className="flex items-center gap-2 mb-3 group"
            >
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Wydatki według kategorii</p>
              <ChevronDown className={cn(
                "w-3.5 h-3.5 text-muted-foreground/50 transition-transform duration-200",
                categorySpendOpen ? "rotate-0" : "-rotate-90"
              )} />
            </button>
            {categorySpendOpen && (
            <div>
            {/* Mobile: horizontal scroll strip */}
            <div className="md:hidden flex gap-3 overflow-x-auto scrollbar-none pb-1 -mx-4 px-4">
              {categorySpend.map((cat) => (
                <button
                  key={cat.id}
                  className={cn(
                    "text-left rounded-xl border p-3 transition-colors group shrink-0 w-32",
                    categoryFilter === cat.id
                      ? "border-primary/50 bg-primary/5"
                      : "border-border bg-card active:bg-secondary/40"
                  )}
                  onClick={() => setCategoryFilter(categoryFilter === cat.id ? "all" : cat.id)}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-base leading-none">{cat.emoji}</span>
                    <span className={cn(
                      "text-[11px] font-semibold tabular-nums",
                      categoryFilter === cat.id ? "text-primary" : "text-muted-foreground"
                    )}>
                      {cat.pct.toFixed(0)}%
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-tight mb-1 truncate">{cat.label}</p>
                  <p className={cn(
                    "text-sm font-bold tabular-nums leading-tight",
                    categoryFilter === cat.id ? "text-primary" : "text-foreground"
                  )}>
                    {formatPrice(cat.spend)}
                  </p>
                  <div className="mt-2 h-1 rounded-full bg-border overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        categoryFilter === cat.id ? "bg-primary" : "bg-primary/40"
                      )}
                      style={{ width: `${Math.max(cat.pct, 2)}%` }}
                    />
                  </div>
                </button>
              ))}
            </div>
            {/* Desktop: grid */}
            <div className="hidden md:grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {categorySpend.map((cat) => (
                <button
                  key={cat.id}
                  className={cn(
                    "text-left rounded-xl border p-3.5 transition-colors group",
                    categoryFilter === cat.id
                      ? "border-primary/50 bg-primary/5"
                      : "border-border bg-card hover:border-primary/30 hover:bg-primary/5"
                  )}
                  onClick={() => setCategoryFilter(categoryFilter === cat.id ? "all" : cat.id)}
                  title={`Kliknij, aby filtrować po kategorii ${cat.label}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-base leading-none">{cat.emoji}</span>
                    <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                      {cat.pct.toFixed(1)}%
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-tight mb-1 truncate">{cat.label}</p>
                  <p className={cn(
                    "text-sm font-bold tabular-nums",
                    categoryFilter === cat.id ? "text-primary" : "text-foreground"
                  )}>
                    {formatPrice(cat.spend)}
                  </p>
                  <div className="mt-2.5 h-1 rounded-full bg-border overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        categoryFilter === cat.id ? "bg-primary" : "bg-primary/40 group-hover:bg-primary/60"
                      )}
                      style={{ width: `${Math.max(cat.pct, 2)}%` }}
                    />
                  </div>
                </button>
              ))}
            </div>
            </div>
            )}
          </div>
        )}

        {/* Filter bar */}
        <div className="mb-4 space-y-2">
          {/* Row 1: search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Szukaj produktu..."
              className="pl-9 w-full"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-search-products"
            />
          </div>

          {/* Row 2: supplier chips — horizontal scroll */}
          {suppliers && suppliers.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none -mx-4 px-4" data-testid="supplier-chips">
              <button
                onClick={() => setSupplierFilter("all")}
                className={cn(
                  "shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors whitespace-nowrap",
                  supplierFilter === "all"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
                )}
              >
                Wszyscy
              </button>
              {suppliers.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSupplierFilter(supplierFilter === String(s.id) ? "all" : String(s.id))}
                  className={cn(
                    "shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors max-w-[180px]",
                    supplierFilter === String(s.id)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
                  )}
                  title={s.name}
                >
                  <span className="truncate">{s.name}</span>
                </button>
              ))}
            </div>
          )}

          {/* Row 3: sort + review + compare */}
          <div className="flex gap-2 items-center">
            <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <SelectTrigger className="flex-1 min-w-0 md:w-44 md:flex-none" data-testid="select-sort-products">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name-asc">
                  <span className="flex items-center gap-2"><ArrowDownAZ className="w-3.5 h-3.5" />Nazwa A–Z</span>
                </SelectItem>
                <SelectItem value="name-desc">
                  <span className="flex items-center gap-2"><ArrowUpZA className="w-3.5 h-3.5" />Nazwa Z–A</span>
                </SelectItem>
                <SelectItem value="price-desc">
                  <span className="flex items-center gap-2"><PriceIcon className="w-3.5 h-3.5" />Największa cena</span>
                </SelectItem>
                <SelectItem value="price-asc">
                  <span className="flex items-center gap-2"><TrendingDown className="w-3.5 h-3.5" />Najniższa cena</span>
                </SelectItem>
                <SelectItem value="change-desc">
                  <span className="flex items-center gap-2"><TrendingUp className="w-3.5 h-3.5" />Największa zmiana %</span>
                </SelectItem>
                <SelectItem value="supplier-asc">
                  <span className="flex items-center gap-2"><Building2 className="w-3.5 h-3.5" />Dostawca A–Z</span>
                </SelectItem>
                <SelectItem value="quantity-desc">
                  <span className="flex items-center gap-2"><ShoppingCart className="w-3.5 h-3.5" />Ilość — od największej</span>
                </SelectItem>
                <SelectItem value="quantity-asc">
                  <span className="flex items-center gap-2"><ShoppingCart className="w-3.5 h-3.5" />Ilość — od najmniejszej</span>
                </SelectItem>
              </SelectContent>
            </Select>

            {needsReviewCount > 0 && (
              <>
                <Button
                  variant={showNeedsReview ? "default" : "outline"}
                  size="sm"
                  className={cn(
                    "shrink-0 gap-1.5 text-xs",
                    showNeedsReview
                      ? "bg-amber-500 hover:bg-amber-600 border-amber-500 text-white"
                      : "border-amber-300 text-amber-600 hover:bg-amber-50"
                  )}
                  onClick={() => { setShowNeedsReview((v) => !v); clearSelection(); }}
                  title="Produkty wymagające weryfikacji kategorii"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Do weryfikacji
                  <span className={cn(
                    "inline-flex items-center justify-center rounded-full text-[10px] font-bold w-4 h-4",
                    showNeedsReview ? "bg-white/20 text-white" : "bg-amber-100 text-amber-700"
                  )}>
                    {needsReviewCount}
                  </span>
                </Button>
                {showNeedsReview && reviewableIds.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 gap-1.5 text-xs border-amber-300 text-amber-600 hover:bg-amber-50"
                    onClick={selectedIds.size === reviewableIds.length ? clearSelection : selectAllReviewable}
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                    {selectedIds.size === reviewableIds.length ? "Odznacz wszystkie" : "Zaznacz wszystkie"}
                  </Button>
                )}
              </>
            )}

            <Button
              variant="outline"
              size="icon"
              className="shrink-0 text-primary border-primary/30 hover:bg-primary/5 hover:border-primary/50 md:hidden"
              onClick={() => setShowKeywordComparison(true)}
              title="Porównaj po frazie"
            >
              <Layers className="w-4 h-4" />
            </Button>
          </div>

          {/* Desktop only: clear + compare */}
          {(supplierFilter !== "all" || search || categoryFilter !== "all" || showNeedsReview) && (
            <button
              className="hidden md:inline text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
              onClick={() => { setSupplierFilter("all"); setSearch(""); setCategoryFilter("all"); setShowNeedsReview(false); }}
            >
              Wyczyść filtry
            </button>
          )}
          <div className="hidden md:flex ml-auto items-center gap-2">
            {total > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={handleExportCsv}
                disabled={csvExporting}
                data-testid="btn-export-csv-products"
              >
                <Download className="w-3.5 h-3.5" />
                {csvExporting ? "Eksportowanie..." : "Eksportuj CSV"}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-primary border-primary/30 hover:bg-primary/5 hover:border-primary/50"
              onClick={() => setShowKeywordComparison(true)}
            >
              <Layers className="w-3.5 h-3.5" />
              Porównaj po frazie
            </Button>
          </div>
        </div>

        {/* Mobile: active filters strip + clear */}
        {(supplierFilter !== "all" || search || categoryFilter !== "all") && (
          <div className="md:hidden flex items-center gap-2 mb-3">
            <span className="text-xs text-muted-foreground">Aktywne filtry</span>
            <button
              className="text-xs text-primary underline underline-offset-2"
              onClick={() => { setSupplierFilter("all"); setSearch(""); setCategoryFilter("all"); }}
            >
              Wyczyść
            </button>
          </div>
        )}

        {/* Category filter pills — only shown when at least 2 categories exist */}
        {availableCategories.length >= 2 && (
          <div className="mb-4 flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap pb-1 md:pb-0">
            <button
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors shrink-0",
                categoryFilter === "all"
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
              )}
              onClick={() => setCategoryFilter("all")}
            >
              Wszystkie
              <span className={cn(
                "text-xs rounded-full px-1.5 py-0.5 font-semibold",
                categoryFilter === "all" ? "bg-primary-foreground/20 text-primary-foreground" : "bg-border text-muted-foreground"
              )}>
                {searchFilteredCount}
              </span>
            </button>
            {availableCategories.map((cat) => (
              <button
                key={cat.id}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors shrink-0",
                  categoryFilter === cat.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
                )}
                onClick={() => setCategoryFilter(categoryFilter === cat.id ? "all" : cat.id)}
              >
                <span>{cat.emoji}</span>
                <span>{cat.label}</span>
                <span className={cn(
                  "text-xs rounded-full px-1.5 py-0.5 font-semibold",
                  categoryFilter === cat.id ? "bg-primary-foreground/20 text-primary-foreground" : "bg-border text-muted-foreground"
                )}>
                  {categoryCountMap[cat.id] ?? 0}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Mobile card list */}
        <div className="md:hidden glass rounded-xl overflow-hidden">
          {isLoading ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="px-4 py-4 flex items-center gap-3">
                  <Skeleton className="w-8 h-8 rounded-lg shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                  <div className="space-y-1.5 text-right shrink-0">
                    <Skeleton className="h-4 w-20 ml-auto" />
                    <Skeleton className="h-3.5 w-12 ml-auto" />
                  </div>
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="px-4 py-8 text-center text-sm text-destructive">
              Nie udało się załadować produktów.
            </div>
          ) : items.length > 0 ? (
            <div className="divide-y divide-border">
              {items.map((product) => {
                const hasMultipleSuppliers = (product.supplierCount ?? 1) > 1;
                const effectiveCatId = product.category ?? categorizeProduct(product.name);
                const catDef = categories?.find((c) => c.id === effectiveCatId);

                return (
                  <div
                    key={product.id}
                    className="flex items-center gap-3 px-4 py-4 active:bg-secondary/40 cursor-pointer"
                    onClick={(e) => showNeedsReview && product.needsReview ? toggleSelect(product.id, e) : openHistory(product.id, product.name)}
                    data-testid={`product-row-${product.id}`}
                  >
                    {/* Checkbox (only in review mode) */}
                    {showNeedsReview && product.needsReview && (
                      <div
                        className="shrink-0"
                        onClick={(e) => toggleSelect(product.id, e)}
                      >
                        <Checkbox
                          checked={selectedIds.has(product.id)}
                          onCheckedChange={() => {}}
                          className="border-amber-400 data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
                        />
                      </div>
                    )}
                    {/* Category icon */}
                    <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center text-base shrink-0 select-none">
                      {catDef ? catDef.emoji : "📦"}
                    </div>

                    {/* Name + meta */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium text-foreground leading-snug truncate">{product.name}</p>
                        {product.needsReview && (
                          <span className="inline-flex items-center gap-0.5 shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            Do weryfikacji
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <p className="text-xs text-muted-foreground truncate max-w-[140px]">
                          {product.supplierName ?? "Brak dostawcy"}
                        </p>
                        <span className="text-xs text-muted-foreground">·</span>
                        <p className="text-xs text-muted-foreground shrink-0">{product.unit}</p>
                        {product.subcategory && (
                          <span className="text-[10px] text-muted-foreground/70 truncate max-w-[120px]">· {product.subcategory}</span>
                        )}
                        {hasMultipleSuppliers && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded-full shrink-0">
                            <GitCompare className="w-2.5 h-2.5" />
                            {product.supplierCount}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {product.lastPurchaseDate && (
                          <p className="text-[11px] text-muted-foreground/70">
                            {formatDate(product.lastPurchaseDate)}
                          </p>
                        )}
                        {product.totalQuantity != null && product.totalQuantity > 0 && (
                          <>
                            {product.lastPurchaseDate && <span className="text-[11px] text-muted-foreground/50">·</span>}
                            <p className="text-[11px] text-muted-foreground/70">
                              {new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(product.totalQuantity)}{" "}{product.unit}
                            </p>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Price + change + compare action */}
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      <p className="text-sm font-bold text-foreground tabular-nums">
                        {product.latestPrice != null ? formatPrice(product.latestPrice) : "—"}
                      </p>
                      <PriceChangeBadge change={product.priceChangePercent} />
                      {hasMultipleSuppliers && (
                        <button
                          className="mt-0.5 text-[11px] font-medium text-primary flex items-center gap-0.5 active:opacity-70"
                          onClick={(e) => openComparison(product.id, product.name, e)}
                        >
                          <GitCompare className="w-3 h-3" />
                          Porównaj
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-12 text-center px-4">
              <Package className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                {search || supplierFilter !== "all" || categoryFilter !== "all"
                  ? "Nie znaleziono produktów pasujących do filtrów."
                  : "Produkty pojawią się po imporcie pierwszej faktury."}
              </p>
            </div>
          )}
          {!isLoading && total > 0 && (
            <div className="px-4 py-3 border-t border-border bg-secondary/20 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{total} produktów</p>
              <button
                className="text-xs font-medium text-primary flex items-center gap-1 active:opacity-70"
                onClick={() => setShowKeywordComparison(true)}
              >
                <Layers className="w-3.5 h-3.5" />
                Porównaj po frazie
              </button>
            </div>
          )}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block glass rounded-xl overflow-x-auto">
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto] gap-4 px-6 min-w-[860px] py-3 border-b border-border text-xs font-medium text-muted-foreground bg-secondary/30">
            <div>Produkt</div>
            <div className="text-right w-28">Ostatnia cena</div>
            <div className="text-right w-28">Poprzednia</div>
            <div className="text-right w-24">Zmiana</div>
            <div className="text-right w-28">
              <div>Ilość</div>
              <div className="text-[10px] font-normal text-muted-foreground/70">miesiąc</div>
            </div>
            <div className="text-right w-32">Ostatni zakup</div>
            <div className="w-24" />
          </div>

          {isLoading ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto] gap-4 px-6 min-w-[860px] py-4">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="px-6 py-8 text-center text-sm text-destructive">
              Nie udało się załadować produktów. Odśwież stronę lub spróbuj ponownie później.
            </div>
          ) : items.length > 0 ? (
            <div className="divide-y divide-border">
              {items.map((product) => {
                const hasMultipleSuppliers = (product.supplierCount ?? 1) > 1;
                return (
                  <div
                    key={product.id}
                    className={cn(
                      "grid gap-4 px-6 min-w-[860px] py-4 hover:bg-secondary/40 transition-colors items-center cursor-pointer",
                      showNeedsReview && product.needsReview
                        ? "grid-cols-[auto_1fr_auto_auto_auto_auto_auto_auto]"
                        : "grid-cols-[1fr_auto_auto_auto_auto_auto_auto]",
                    )}
                    onClick={(e) => showNeedsReview && product.needsReview ? toggleSelect(product.id, e) : openHistory(product.id, product.name)}
                    data-testid={`product-row-${product.id}`}
                  >
                    {showNeedsReview && product.needsReview && (
                      <div onClick={(e) => toggleSelect(product.id, e)}>
                        <Checkbox
                          checked={selectedIds.has(product.id)}
                          onCheckedChange={() => {}}
                          className="border-amber-400 data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
                        />
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium text-foreground">{product.name}</p>
                        {product.needsReview && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            Do weryfikacji
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <p className="text-xs text-muted-foreground">
                          {product.supplierName ?? "Brak dostawcy"} · {product.unit}
                          {product.subcategory ? ` · ${product.subcategory}` : ""}
                        </p>
                        <CategoryBadge
                          productId={product.id}
                          productName={product.name}
                          category={product.category}
                          categories={categories}
                          onChanged={() => queryClient.invalidateQueries()}
                        />
                        {hasMultipleSuppliers && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                            <GitCompare className="w-2.5 h-2.5" />
                            {product.supplierCount} dostawców
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right w-28">
                      <p className="text-sm font-semibold text-foreground">
                        {product.latestPrice != null ? `${formatPrice(product.latestPrice)}` : "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">/{product.unit}</p>
                    </div>
                    <div className="text-right w-28">
                      <p className="text-sm text-muted-foreground">
                        {product.previousPrice != null ? formatPrice(product.previousPrice) : "—"}
                      </p>
                    </div>
                    <div className="text-right w-24">
                      <PriceChangeBadge change={product.priceChangePercent} />
                    </div>
                    <div className="text-right w-28">
                      {product.totalQuantity != null && product.totalQuantity > 0 ? (
                        <>
                          <p className="text-sm font-semibold text-foreground tabular-nums">
                            {new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(product.totalQuantity)}
                          </p>
                          <p className="text-xs text-muted-foreground">{product.unit}</p>
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">—</p>
                      )}
                    </div>
                    <div className="text-right w-32">
                      <p className="text-xs text-muted-foreground">{formatDate(product.lastPurchaseDate)}</p>
                    </div>
                    <div className="w-24 flex justify-end">
                      <Button
                        variant={hasMultipleSuppliers ? "default" : "ghost"}
                        size="sm"
                        className={cn(
                          "h-7 text-xs gap-1",
                          hasMultipleSuppliers
                            ? "bg-primary/10 text-primary hover:bg-primary/20 border-0 shadow-none"
                            : "text-muted-foreground"
                        )}
                        onClick={(e) => openComparison(product.id, product.name, e)}
                        title="Porównaj dostawców"
                      >
                        <GitCompare className="w-3 h-3" />
                        {hasMultipleSuppliers ? "Porównaj" : "Cennik"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-12 text-center">
              <Package className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                {search || supplierFilter !== "all"
                  ? "Nie znaleziono produktów pasujących do filtrów."
                  : "Produkty pojawią się po imporcie pierwszej faktury."}
              </p>
            </div>
          )}
        </div>

        {/* Pagination (wspólna dla mobile i desktop) */}
        {!isLoading && totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-4">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Poprzednia
            </Button>
            <span className="text-sm text-muted-foreground tabular-nums px-2">
              Strona {page} z {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Następna
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        )}

        {/* Floating bulk action bar */}
        {selectedIds.size > 0 && (
          <div className="fixed z-50 flex flex-wrap items-center justify-center gap-2 md:gap-3 px-4 py-3 rounded-2xl shadow-2xl border border-amber-400/30 bg-background/95 backdrop-blur-sm left-3 right-3 md:left-1/2 md:right-auto md:-translate-x-1/2 bottom-[calc(4.25rem_+_env(safe-area-inset-bottom))] md:bottom-6">
            <span className="text-sm font-medium text-amber-600 dark:text-amber-400 w-full text-center md:w-auto">
              Zaznaczono: {selectedIds.size}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => setBulkCategoryModalOpen(true)}
            >
              <Layers className="w-4 h-4" />
              Przypisz kategorię
            </Button>
            <Button
              size="sm"
              className="gap-1.5 bg-amber-500 hover:bg-amber-600 text-white border-0"
              onClick={handleBulkVerify}
              disabled={bulkVerify.isPending}
            >
              <CheckCheck className="w-4 h-4" />
              Zweryfikuj zaznaczone
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-foreground"
              onClick={clearSelection}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        )}

        {selectedProduct && modalMode === "history" && (
          <PriceHistoryModal
            productId={selectedProduct.id}
            productName={selectedProduct.name}
            onClose={() => setSelectedProduct(null)}
          />
        )}

        {selectedProduct && modalMode === "comparison" && (
          <SupplierComparisonModal
            productId={selectedProduct.id}
            productName={selectedProduct.name}
            onClose={() => setSelectedProduct(null)}
          />
        )}

        {showKeywordComparison && (
          <KeywordComparisonModal
            products={allProducts ?? []}
            onClose={() => setShowKeywordComparison(false)}
          />
        )}

        {/* Bulk category assignment modal */}
        <Dialog open={bulkCategoryModalOpen} onOpenChange={setBulkCategoryModalOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-primary" />
                Przypisz kategorię
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground mb-4">
              Przypisz wybraną kategorię do {selectedIds.size} zaznaczonych produktów
            </p>
            <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
              {(categories ?? []).map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setBulkCategorySelection(cat.id)}
                  className={cn(
                    "p-3 rounded-lg border-2 transition-colors text-left text-sm",
                    bulkCategorySelection === cat.id
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  <span className="text-lg mr-1">{cat.emoji}</span>
                  <span className="font-medium">{cat.label}</span>
                </button>
              ))}
            </div>
            <div className="flex gap-2 justify-end pt-4">
              <Button variant="outline" onClick={() => setBulkCategoryModalOpen(false)}>
                Anuluj
              </Button>
              <Button
                onClick={handleBulkCategoryAssign}
                disabled={!bulkCategorySelection || bulkAssignCategory.isPending}
              >
                Przypisz
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
