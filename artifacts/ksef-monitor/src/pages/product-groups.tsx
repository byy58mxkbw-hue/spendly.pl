import { useState } from "react";
import { Link } from "wouter";
import { Layout, PageHeader } from "@/components/layout";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListProductGroups,
  useGetProductGroupSuggestions,
  useAcceptProductGroupSuggestion,
  useRejectProductGroupSuggestion,
  useCreateProductGroup,
  getListProductGroupsQueryKey,
  getGetProductGroupSuggestionsQueryKey,
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
import { Layers, Plus, Sparkles, X, Check, ChevronRight, TrendingUp, TrendingDown, Minus } from "lucide-react";
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

export default function ProductGroups() {
  const qc = useQueryClient();
  const { data: groups, isLoading: groupsLoading } = useListProductGroups();
  const { data: suggestions, isLoading: suggestionsLoading } = useGetProductGroupSuggestions();
  const accept = useAcceptProductGroupSuggestion();
  const reject = useRejectProductGroupSuggestion();
  const createGroup = useCreateProductGroup();

  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");

  function invalidateAll() {
    qc.invalidateQueries({ queryKey: getListProductGroupsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetProductGroupSuggestionsQueryKey() });
  }

  function handleAccept(key: string, name: string, productIds: number[]) {
    accept.mutate(
      { data: { normalizedKey: key, name, productIds } },
      { onSuccess: () => { invalidateAll(); setEditing(null); } },
    );
  }

  function handleReject(key: string) {
    reject.mutate({ data: { normalizedKey: key } }, { onSuccess: () => invalidateAll() });
  }

  function handleCreate() {
    if (!newName.trim()) return;
    createGroup.mutate(
      { data: { name: newName.trim() } },
      { onSuccess: () => { invalidateAll(); setNewName(""); setShowCreate(false); } },
    );
  }

  return (
    <Layout>
      <div className="px-4 py-5 md:px-8 md:py-8">
        <PageHeader
          title="Grupy produktów"
          subtitle="Łącz warianty tego samego składnika, by śledzić uśrednioną cenę i otrzymywać alerty na całą grupę"
          action={
            <Button onClick={() => setShowCreate(true)} className="gap-2" data-testid="btn-create-group">
              <Plus className="w-4 h-4" /> Nowa grupa
            </Button>
          }
        />

        {/* Suggestions */}
        <section className="mb-8">
          <h2 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            Propozycje grup
          </h2>

          {suggestionsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-40 rounded-xl" />
              ))}
            </div>
          ) : suggestions && suggestions.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {suggestions.map((s) => {
                const isEditing = editing === s.normalizedKey;
                return (
                  <div
                    key={s.normalizedKey}
                    className="bg-card border border-border rounded-xl p-4 flex flex-col"
                    data-testid={`suggestion-${s.normalizedKey}`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-3">
                      {isEditing ? (
                        <Input
                          autoFocus
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="h-8 text-sm"
                        />
                      ) : (
                        <h3 className="font-semibold text-foreground text-base leading-tight">
                          {s.suggestedName}
                        </h3>
                      )}
                      <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full shrink-0">
                        {s.productIds.length} wariantów
                      </span>
                    </div>
                    <ul className="text-xs text-muted-foreground space-y-1 mb-4 flex-1">
                      {s.productNames.slice(0, 4).map((n, i) => (
                        <li key={i} className="truncate">• {n.replace(/^#/, "")}</li>
                      ))}
                      {s.productNames.length > 4 && (
                        <li className="text-foreground/60">+ {s.productNames.length - 4} więcej</li>
                      )}
                    </ul>
                    <div className="flex items-center gap-2">
                      {isEditing ? (
                        <>
                          <Button
                            size="sm"
                            className="flex-1 gap-1.5"
                            disabled={accept.isPending || !editName.trim()}
                            onClick={() => handleAccept(s.normalizedKey, editName.trim(), s.productIds)}
                          >
                            <Check className="w-3.5 h-3.5" /> Zapisz
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditing(null)}>
                            Anuluj
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            className="flex-1 gap-1.5"
                            disabled={accept.isPending}
                            onClick={() => handleAccept(s.normalizedKey, s.suggestedName, s.productIds)}
                            data-testid={`btn-accept-${s.normalizedKey}`}
                          >
                            <Check className="w-3.5 h-3.5" /> Utwórz
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { setEditing(s.normalizedKey); setEditName(s.suggestedName); }}
                          >
                            Zmień nazwę
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={reject.isPending}
                            onClick={() => handleReject(s.normalizedKey)}
                            data-testid={`btn-reject-${s.normalizedKey}`}
                            title="Odrzuć propozycję"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-secondary/30 rounded-xl py-10 text-center">
              <Sparkles className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Brak nowych propozycji. Importuj kolejne faktury, aby pojawiły się sugestie.
              </p>
            </div>
          )}
        </section>

        {/* My groups */}
        <section>
          <h2 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
            <Layers className="w-4 h-4" />
            Moje grupy
          </h2>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            {groupsLoading ? (
              <div className="divide-y divide-border">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="px-6 py-4 flex items-center gap-4">
                    <Skeleton className="w-8 h-8 rounded-lg" />
                    <div className="flex-1">
                      <Skeleton className="h-4 w-40 mb-2" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-6 w-20 rounded-full" />
                  </div>
                ))}
              </div>
            ) : groups && groups.length > 0 ? (
              <div className="divide-y divide-border">
                {groups.map((g) => (
                  <Link
                    key={g.id}
                    href={`/product-groups/${g.id}`}
                    className="px-6 py-4 flex items-center gap-4 hover:bg-secondary/40 transition-colors"
                    data-testid={`group-row-${g.id}`}
                  >
                    <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <Layers className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">{g.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {g.variantCount} {g.variantCount === 1 ? "wariant" : "wariantów"}
                        {g.lastPurchaseDate && ` · ostatni zakup ${formatDate(g.lastPurchaseDate)}`}
                        {g.unitsMixed && " · różne jednostki"}
                      </p>
                    </div>
                    <div className="text-right hidden sm:block">
                      <p className="text-sm font-semibold text-foreground">
                        {g.avgLatestPrice != null ? `${formatPrice(g.avgLatestPrice)}/${g.primaryUnit ?? ""}` : "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">średnia cena</p>
                    </div>
                    <div className="w-20 text-right shrink-0">
                      <ChangeBadge change={g.priceChangePercent} />
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </Link>
                ))}
              </div>
            ) : (
              <div className="py-14 text-center">
                <Layers className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-foreground font-medium mb-1">Nie masz jeszcze grup</p>
                <p className="text-sm text-muted-foreground mb-4">
                  Akceptuj propozycje powyżej albo utwórz grupę ręcznie.
                </p>
              </div>
            )}
          </div>
        </section>

        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nowa grupa produktów</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Nazwa grupy</label>
              <Input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="np. Pomidor"
              />
              <p className="text-xs text-muted-foreground">
                Produkty dodasz potem na stronie szczegółów grupy.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreate(false)}>Anuluj</Button>
              <Button onClick={handleCreate} disabled={!newName.trim() || createGroup.isPending}>
                {createGroup.isPending ? "Zapisuję..." : "Utwórz"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
