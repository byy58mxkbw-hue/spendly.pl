import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { Layout, PageHeader } from "@/components/layout";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetProductGroupDetail,
  useUpdateProductGroup,
  useDeleteProductGroup,
  useAddProductsToGroup,
  useRemoveProductFromGroup,
  useListProducts,
  getGetProductGroupDetailQueryKey,
  getListProductGroupsQueryKey,
  getListProductsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ArrowLeft, Bell, Layers, Pencil, Plus, Search, Trash2, TrendingDown, TrendingUp, Minus } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatPrice, formatPercent, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

function ChangeBadge({ change }: { change: number | null | undefined }) {
  if (change == null) return <span className="text-muted-foreground text-xs">—</span>;
  const up = change > 0;
  const down = change < 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full",
        up && "bg-destructive/10 text-destructive",
        down && "bg-emerald-500/10 text-emerald-600",
        !up && !down && "bg-muted text-muted-foreground",
      )}
    >
      {up ? <TrendingUp className="w-3 h-3" /> : down ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
      {formatPercent(change)}
    </span>
  );
}

export default function ProductGroupDetail({ params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10);
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const { data: group, isLoading } = useGetProductGroupDetail(id);
  const { data: allProducts } = useListProducts();
  const updateGroup = useUpdateProductGroup();
  const deleteGroup = useDeleteProductGroup();
  const addProducts = useAddProductsToGroup();
  const removeProduct = useRemoveProductFromGroup();

  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const [addSelected, setAddSelected] = useState<Set<number>>(new Set());

  function invalidate() {
    qc.invalidateQueries({ queryKey: getGetProductGroupDetailQueryKey(id) });
    qc.invalidateQueries({ queryKey: getListProductGroupsQueryKey() });
    qc.invalidateQueries({ queryKey: getListProductsQueryKey() });
  }

  function startRename() {
    setNewName(group?.name ?? "");
    setRenaming(true);
  }

  function saveRename() {
    if (!newName.trim() || !group) return;
    updateGroup.mutate(
      { id, data: { name: newName.trim() } },
      { onSuccess: () => { invalidate(); setRenaming(false); } },
    );
  }

  function handleRemove(productId: number) {
    removeProduct.mutate({ id, productId }, { onSuccess: () => invalidate() });
  }

  function handleAddProducts() {
    if (addSelected.size === 0) return;
    addProducts.mutate(
      { id, data: { productIds: Array.from(addSelected) } },
      { onSuccess: () => { invalidate(); setShowAdd(false); setAddSelected(new Set()); setAddSearch(""); } },
    );
  }

  function handleDelete() {
    deleteGroup.mutate({ id }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListProductGroupsQueryKey() });
        qc.invalidateQueries({ queryKey: getListProductsQueryKey() });
        setLocation("/product-groups");
      },
    });
  }

  const groupedIds = useMemo(() => new Set(group?.variants.map((v) => v.productId) ?? []), [group]);
  const candidateProducts = useMemo(() => {
    if (!allProducts) return [];
    const filtered = allProducts.filter((p) => !groupedIds.has(p.id));
    const q = addSearch.trim().toLowerCase();
    if (!q) return filtered.slice(0, 50);
    return filtered.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 50);
  }, [allProducts, groupedIds, addSearch]);

  const chartData = group?.avgPriceHistory.map((p) => ({
    date: formatDate(p.date),
    price: p.avgPrice,
  })) ?? [];

  const avgLatest = useMemo(() => {
    if (!group) return null;
    const variants = group.variants.filter((v) => !group.unitsMixed || v.unit === group.primaryUnit);
    const prices = variants.map((v) => v.latestPrice).filter((p): p is number => p != null);
    return prices.length ? prices.reduce((s, p) => s + p, 0) / prices.length : null;
  }, [group]);

  const avgPrev = useMemo(() => {
    if (!group) return null;
    const variants = group.variants.filter((v) => !group.unitsMixed || v.unit === group.primaryUnit);
    const prices = variants.map((v) => v.previousPrice).filter((p): p is number => p != null);
    return prices.length ? prices.reduce((s, p) => s + p, 0) / prices.length : null;
  }, [group]);

  const changePct = avgLatest != null && avgPrev != null && avgPrev !== 0
    ? ((avgLatest - avgPrev) / avgPrev) * 100
    : null;

  return (
    <Layout>
      <div className="px-4 py-5 md:px-8 md:py-8">
        <Link
          href="/product-groups"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> Wszystkie grupy
        </Link>

        {isLoading || !group ? (
          <>
            <Skeleton className="h-9 w-72 mb-2" />
            <Skeleton className="h-4 w-48 mb-8" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
            </div>
            <Skeleton className="h-56 rounded-xl mb-6" />
            <Skeleton className="h-80 rounded-xl" />
          </>
        ) : (
          <>
            <PageHeader
              title={group.name}
              subtitle={`${group.variants.length} wariantów${group.unitsMixed ? " (różne jednostki)" : group.primaryUnit ? ` · ${group.primaryUnit}` : ""}`}
              action={
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" className="gap-2" onClick={startRename}>
                    <Pencil className="w-4 h-4" /> Zmień nazwę
                  </Button>
                  <Link href="/price-alerts">
                    <Button variant="outline" className="gap-2">
                      <Bell className="w-4 h-4" /> Alert dla grupy
                    </Button>
                  </Link>
                  <Button variant="outline" className="gap-2 text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}>
                    <Trash2 className="w-4 h-4" /> Usuń
                  </Button>
                </div>
              }
            />

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">Średnia cena (ostatnia)</p>
                <p className="text-2xl font-bold text-foreground">
                  {avgLatest != null ? formatPrice(avgLatest) : "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  / {group.primaryUnit ?? ""}
                </p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">Zmiana vs. poprzedni zakup</p>
                <div className="flex items-center gap-2">
                  <p className="text-2xl font-bold text-foreground">
                    {avgPrev != null ? formatPrice(avgPrev) : "—"}
                  </p>
                  <ChangeBadge change={changePct} />
                </div>
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">Warianty</p>
                <p className="text-2xl font-bold text-foreground">{group.variants.length}</p>
                <p className="text-xs text-muted-foreground">
                  {new Set(group.variants.map((v) => v.supplierId).filter(Boolean)).size} dostawców
                </p>
              </div>
            </div>

            {/* Chart */}
            {chartData.length > 1 && (
              <div className="bg-card border border-border rounded-xl p-4 mb-6">
                <p className="text-sm font-medium text-foreground mb-3">Średnia cena w czasie</p>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v} zł`} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                      formatter={(v: number) => formatPrice(v)}
                    />
                    <Line type="monotone" dataKey="price" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ fill: "hsl(var(--primary))", r: 4 }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Variants */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                <h2 className="font-semibold text-foreground flex items-center gap-2">
                  <Layers className="w-4 h-4 text-muted-foreground" /> Warianty
                </h2>
                <Button size="sm" className="gap-1.5" onClick={() => setShowAdd(true)} data-testid="btn-add-variant">
                  <Plus className="w-3.5 h-3.5" /> Dodaj produkt
                </Button>
              </div>

              {group.variants.length === 0 ? (
                <div className="py-14 text-center">
                  <Layers className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-foreground font-medium mb-1">Pusta grupa</p>
                  <p className="text-sm text-muted-foreground">Dodaj produkty, by zacząć śledzić uśrednioną cenę.</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {group.variants.map((v) => (
                    <div key={v.productId} className="px-6 py-3 flex items-center gap-4 group">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{v.productName.replace(/^#/, "")}</p>
                        <p className="text-xs text-muted-foreground">
                          {v.supplierName ?? "Brak dostawcy"}{v.lastPurchaseDate ? ` · ${formatDate(v.lastPurchaseDate)}` : ""}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-foreground">
                          {v.latestPrice != null ? `${formatPrice(v.latestPrice)}/${v.unit}` : "—"}
                        </p>
                        <ChangeBadge change={v.priceChangePercent} />
                      </div>
                      <button
                        className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all"
                        onClick={() => handleRemove(v.productId)}
                        title="Usuń z grupy"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Rename dialog */}
        <Dialog open={renaming} onOpenChange={setRenaming}>
          <DialogContent>
            <DialogHeader><DialogTitle>Zmień nazwę grupy</DialogTitle></DialogHeader>
            <Input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setRenaming(false)}>Anuluj</Button>
              <Button onClick={saveRename} disabled={!newName.trim() || updateGroup.isPending}>Zapisz</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add products dialog */}
        <Dialog open={showAdd} onOpenChange={(o) => { setShowAdd(o); if (!o) { setAddSelected(new Set()); setAddSearch(""); } }}>
          <DialogContent className="max-w-xl">
            <DialogHeader><DialogTitle>Dodaj produkty do grupy</DialogTitle></DialogHeader>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Szukaj produktu..." value={addSearch} onChange={(e) => setAddSearch(e.target.value)} />
            </div>
            <div className="max-h-80 overflow-y-auto border border-border rounded-lg divide-y divide-border">
              {candidateProducts.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  Brak dostępnych produktów. Wszystkie są już przypisane lub niezgodne z wyszukiwaniem.
                </div>
              ) : (
                candidateProducts.map((p) => {
                  const checked = addSelected.has(p.id);
                  return (
                    <label key={p.id} className="px-3 py-2.5 flex items-center gap-3 hover:bg-secondary/40 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const next = new Set(addSelected);
                          if (e.target.checked) next.add(p.id); else next.delete(p.id);
                          setAddSelected(next);
                        }}
                        className="rounded"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground truncate">{p.name.replace(/^#/, "")}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.unit}{p.supplierName ? ` · ${p.supplierName}` : ""}
                        </p>
                      </div>
                      {p.latestPrice != null && (
                        <span className="text-xs text-muted-foreground shrink-0">{formatPrice(p.latestPrice)}/{p.unit}</span>
                      )}
                    </label>
                  );
                })
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAdd(false)}>Anuluj</Button>
              <Button disabled={addSelected.size === 0 || addProducts.isPending} onClick={handleAddProducts}>
                Dodaj ({addSelected.size})
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Confirm delete */}
        <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <DialogContent>
            <DialogHeader><DialogTitle>Usunąć grupę?</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">
              Produkty przypisane do grupy nie zostaną usunięte — staną się znów nieprzypisane.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmDelete(false)}>Anuluj</Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleteGroup.isPending}>
                Usuń grupę
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
