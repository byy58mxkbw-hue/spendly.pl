import { useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useImportMenu, useSaveMenuDishes, useGetGoposMenu, useImportMenuFromGopos } from "@workspace/api-client-react";
import type { MenuImportPreview, GoposMenuItem } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { Upload, Loader2, Trash2, Sparkles, FileText, ImageIcon, Plug, Search } from "@/lib/icons";

const MAX_PDF_PAGES = 5;

const fmt = (v: number | null | undefined) =>
  v == null ? "—" : new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(v);

function foodCostColor(pct: number): string {
  if (pct <= 35) return "#059669";
  if (pct <= 50) return "#d97706";
  return "#dc2626";
}

// PDF/obraz → tablica data-URL PNG. PDF rasteryzowany w przeglądarce (pdfjs, lazy).
async function fileToImages(file: File): Promise<string[]> {
  if (file.type === "application/pdf") {
    const pdfjs = await import("pdfjs-dist");
    const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
    const data = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data }).promise;
    const pages = Math.min(pdf.numPages, MAX_PDF_PAGES);
    const out: string[] = [];
    for (let i = 1; i <= pages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1.6 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      out.push(canvas.toDataURL("image/jpeg", 0.85));
    }
    return out;
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("read error"));
    r.readAsDataURL(file);
  });
  return [dataUrl];
}

type EditIng = {
  key: string;
  name: string;
  grams: number;
  baseGrams: number;
  baseCost: number | null;
  matchedProductId: number | null;
  matchedName: string | null;
  estPricePerKg: number | null;
  estPieceGrams: number | null;
  source: "invoice" | "manual" | "estimate" | null;
};
type EditDish = {
  key: string;
  selected: boolean;
  name: string;
  sellPrice: number | null;
  category: string | null;
  posProductName: string | null;
  confidencePct: number;
  ingredients: EditIng[];
};

function toEditDishes(preview: MenuImportPreview): EditDish[] {
  return preview.dishes.map((d, di) => ({
    key: `d${di}`,
    selected: true,
    name: d.name,
    sellPrice: d.sellPrice ?? null,
    category: d.category ?? null,
    posProductName: d.posProductName ?? null,
    confidencePct: d.confidencePct,
    ingredients: d.ingredients.map((ing, ii) => ({
      key: `d${di}i${ii}`,
      name: ing.name,
      grams: ing.grams,
      baseGrams: ing.grams,
      baseCost: ing.ingredientCost ?? null,
      matchedProductId: ing.matchedProductId ?? null,
      matchedName: ing.matchedName ?? null,
      estPricePerKg: ing.estPricePerKg ?? null,
      estPieceGrams: ing.estPieceGrams ?? null,
      source: ing.priceSource ?? null,
    })),
  }));
}

// Koszt składnika skaluje się liniowo z gramaturą względem wartości policzonej na serwerze.
function liveIngredientCost(ing: EditIng): number | null {
  if (ing.baseCost == null || ing.baseGrams <= 0) return null;
  return ing.baseCost * (ing.grams / ing.baseGrams);
}

export default function MenuImportDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const importMenu = useImportMenu();
  const saveDishes = useSaveMenuDishes();
  const fileRef = useRef<HTMLInputElement>(null);

  const importFromGopos = useImportMenuFromGopos();
  // Aktualne menu z GoPOS (pobierane na żywo). Brak konfiguracji GoPOS = zostaje
  // tylko import ze zdjęcia karty.
  const { data: goposMenu, isLoading: goposLoading } = useGetGoposMenu();
  const goposItems = useMemo(() => goposMenu?.items ?? [], [goposMenu]);
  const goposMax = goposMenu?.maxDishes ?? 80;

  const [step, setStep] = useState<"upload" | "gopos" | "loading" | "preview">("upload");
  const [source, setSource] = useState<"file" | "gopos">("file");
  const [dishes, setDishes] = useState<EditDish[]>([]);
  const [fileName, setFileName] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [goposQuery, setGoposQuery] = useState("");

  function openGopos() {
    // Domyślnie zaznaczone wszystko, czego jeszcze nie ma w Food Cost (do limitu).
    const fresh = goposItems.filter((i) => !i.alreadyImported).slice(0, goposMax);
    setPicked(new Set(fresh.map((i) => i.posProductName)));
    setGoposQuery("");
    setStep("gopos");
  }

  const goposByCategory = useMemo(() => {
    const q = goposQuery.trim().toLowerCase();
    const map = new Map<string, GoposMenuItem[]>();
    for (const it of goposItems) {
      if (q && !it.name.toLowerCase().includes(q)) continue;
      const key = it.category ?? "Bez kategorii";
      const list = map.get(key) ?? [];
      list.push(it);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [goposItems, goposQuery]);

  function togglePick(names: string[], on: boolean) {
    setPicked((prev) => {
      const next = new Set(prev);
      for (const n of names) {
        if (on) next.add(n);
        else next.delete(n);
      }
      return next;
    });
  }

  async function handleGoposEstimate() {
    const chosen = goposItems.filter((i) => picked.has(i.posProductName));
    if (chosen.length === 0) return;
    setSource("gopos");
    setFileName("");
    setStep("loading");
    try {
      const preview = await importFromGopos.mutateAsync({
        data: {
          dishes: chosen.map((i) => ({ posProductName: i.posProductName, name: i.name, category: i.category ?? null, sellPrice: i.sellPrice ?? null })),
        },
      });
      // Pozycje bez składników (opłaty, opakowania) od razu odznaczone.
      setDishes(toEditDishes(preview).map((d) => ({ ...d, selected: d.ingredients.length > 0 })));
      setStep("preview");
    } catch (err) {
      const status = (err as { status?: number })?.status;
      toast({
        variant: "destructive",
        title: status === 429 ? "Wyczerpano limit AI" : "Nie udało się oszacować składników",
        description: status === 429 ? "Miesięczny limit zapytań AI został osiągnięty." : err instanceof Error ? err.message : "",
      });
      setStep("gopos");
    }
  }

  async function handleFile(file: File) {
    setSource("file");
    setFileName(file.name);
    setStep("loading");
    try {
      const images = await fileToImages(file);
      if (images.length === 0) throw new Error("Nie udało się odczytać pliku.");
      const preview = await importMenu.mutateAsync({ data: { images } });
      const edit = toEditDishes(preview);
      if (edit.length === 0) {
        toast({ variant: "destructive", title: "Nie wykryto dań", description: "Spróbuj wyraźniejsze zdjęcie karty menu." });
        setStep("upload");
        return;
      }
      setDishes(edit);
      setStep("preview");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      const status = (err as { status?: number })?.status;
      toast({
        variant: "destructive",
        title: status === 429 ? "Wyczerpano limit AI" : "Nie udało się odczytać menu",
        description: status === 429 ? "Miesięczny limit zapytań AI został osiągnięty." : msg,
      });
      setStep("upload");
    }
  }

  function updateDish(key: string, patch: Partial<EditDish>) {
    setDishes((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }
  function updateIng(dishKey: string, ingKey: string, patch: Partial<EditIng>) {
    setDishes((prev) =>
      prev.map((d) =>
        d.key === dishKey ? { ...d, ingredients: d.ingredients.map((i) => (i.key === ingKey ? { ...i, ...patch } : i)) } : d,
      ),
    );
  }
  function removeIng(dishKey: string, ingKey: string) {
    setDishes((prev) => prev.map((d) => (d.key === dishKey ? { ...d, ingredients: d.ingredients.filter((i) => i.key !== ingKey) } : d)));
  }

  const selectedCount = useMemo(() => dishes.filter((d) => d.selected).length, [dishes]);

  async function handleSave() {
    const payload = dishes
      .filter((d) => d.selected && d.name.trim() && d.ingredients.length > 0)
      .map((d) => ({
        name: d.name.trim(),
        sellPrice: d.sellPrice,
        category: d.category,
        posProductName: d.posProductName,
        ingredients: d.ingredients
          .filter((i) => i.name.trim() && i.grams > 0)
          .map((i) => ({ name: i.name.trim(), grams: i.grams, productId: i.matchedProductId, estPricePerKg: i.estPricePerKg, estPieceGrams: i.estPieceGrams })),
      }))
      .filter((d) => d.ingredients.length > 0);

    if (payload.length === 0) {
      toast({ variant: "destructive", title: "Nic do zapisania", description: "Zaznacz przynajmniej jedno danie ze składnikami." });
      return;
    }
    try {
      const res = await saveDishes.mutateAsync({ data: { dishes: payload } });
      toast({ title: "Zapisano dania", description:
          source === "gopos"
            ? `Dodano ${res.createdIds.length} dań z GoPOS. Są od razu powiązane ze sprzedażą.`
            : `Dodano ${res.createdIds.length} dań z karty menu.`, });
      onSaved();
      onClose();
    } catch (err) {
      toast({ variant: "destructive", title: "Błąd zapisu", description: err instanceof Error ? err.message : "" });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[88vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" /> Importuj menu
          </DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4 py-2">
            {goposItems.length > 0 && (
              <>
                <button
                  onClick={openGopos}
                  className="w-full text-left rounded-md border border-border hover:border-primary/60 hover:bg-secondary/40 transition-colors p-4 flex items-start gap-3"
                >
                  <Plug className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span className="space-y-1">
                    <span className="block text-sm font-semibold text-foreground">Z aktualnego menu GoPOS, bez zdjęcia</span>
                    <span className="block text-xs text-muted-foreground">
                      <span className="num">{goposItems.length}</span> pozycji w aktualnym menu
                      {goposItems.some((i) => i.alreadyImported) && (
                        <> (<span className="num">{goposItems.filter((i) => i.alreadyImported).length}</span> już w Food Cost)</>
                      )}
                      . AI oszacuje składniki, a dania od razu połączą się ze sprzedażą.
                    </span>
                  </span>
                </button>
                <p className="label-caps text-[10px] text-muted-foreground text-center">albo ze zdjęcia karty</p>
              </>
            )}
            {goposLoading && (
              <p className="text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Pobieram aktualne menu z GoPOS…
              </p>
            )}
            {!goposLoading && goposMenu?.configured && goposMenu.error && (
              <p className="text-xs text-warning">{goposMenu.error}</p>
            )}
            {!goposLoading && goposMenu?.configured && !goposMenu.error && goposItems.length === 0 && (
              <p className="text-xs text-muted-foreground">W GoPOS nie ma aktywnego menu z pozycjami do zaimportowania.</p>
            )}
            <p className="text-sm text-muted-foreground">
              Wgraj zdjęcie lub PDF karty menu. AI odczyta dania, oszacuje składniki i gramatury oraz policzy wstępny food cost.
              Gramatury to szacunek — poprawisz je w każdej chwili.
            </p>
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full rounded-xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-secondary/40 transition-colors py-10 flex flex-col items-center gap-2"
            >
              <Upload className="w-6 h-6 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">Kliknij, aby wybrać plik</span>
              <span className="text-xs text-muted-foreground flex items-center gap-2">
                <ImageIcon className="w-3.5 h-3.5" /> JPG / PNG / WebP
                <FileText className="w-3.5 h-3.5 ml-1" /> PDF (do {MAX_PDF_PAGES} stron)
              </span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ""; }}
            />
          </div>
        )}

        {step === "gopos" && (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex items-center gap-2 mb-3">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={goposQuery} onChange={(e) => setGoposQuery(e.target.value)} placeholder="Szukaj pozycji…" className="h-8 text-sm pl-8" />
              </div>
              <span className={cn("text-xs shrink-0 num", picked.size > goposMax ? "text-negative font-semibold" : "text-muted-foreground")}>
                {picked.size} / {goposMax}
              </span>
            </div>
            <div className="overflow-y-auto flex-1 min-h-0 pr-1 space-y-4">
              {goposByCategory.map(([cat, items]) => {
                const names = items.map((i) => i.posProductName);
                const allOn = names.every((n) => picked.has(n));
                return (
                  <div key={cat}>
                    <label className="flex items-center gap-2 pb-1 mb-1 border-b border-border cursor-pointer">
                      <input type="checkbox" checked={allOn} onChange={(e) => togglePick(names, e.target.checked)} className="accent-primary" />
                      <span className="label-caps text-[11px] text-foreground">{cat}</span>
                      <span className="text-[11px] text-muted-foreground num">
                        {names.filter((n) => picked.has(n)).length}/{names.length}
                      </span>
                    </label>
                    <div className="rule-list">
                      {items.map((it) => (
                        <label key={it.posProductName} className="flex items-center gap-2 py-1.5 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={picked.has(it.posProductName)}
                            onChange={(e) => togglePick([it.posProductName], e.target.checked)}
                            className="accent-primary"
                          />
                          <span className={cn("flex-1 min-w-0 truncate", it.alreadyImported && "text-muted-foreground")}>{it.name}</span>
                          {it.alreadyImported && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground shrink-0">już w Food Cost</span>
                          )}
                          <span
                            className="text-[11px] text-muted-foreground num w-24 text-right shrink-0"
                            title={`Sprzedano w ostatnich ${goposMenu?.months ?? 6} miesiącach`}
                          >
                            {it.qty > 0 ? `${it.qty.toLocaleString("pl-PL")} szt.` : "bez sprzedaży"}
                          </span>
                          <span className="text-[11px] num w-20 text-right shrink-0">{fmt(it.sellPrice)}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
              {goposByCategory.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">Brak pozycji pasujących do wyszukiwania.</p>}
            </div>
            <p className="text-[11px] text-muted-foreground pt-2">
              Ceny z karty GoPOS. Liczba sztuk to sprzedaż z ostatnich {goposMenu?.months ?? 6} miesięcy.
            </p>
            <div className="flex items-center justify-between gap-2 pt-3 mt-1 border-t border-border">
              <Button variant="ghost" onClick={() => setStep("upload")}>Wstecz</Button>
              <Button onClick={handleGoposEstimate} disabled={picked.size === 0 || picked.size > goposMax}>
                <Sparkles className="w-4 h-4 mr-1" /> Oszacuj składniki ({picked.size})
              </Button>
            </div>
          </div>
        )}

        {step === "loading" && (
          <div className="py-16 flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin" />
            <p className="text-sm">
              {source === "gopos" ? "Szacuję składniki dań z GoPOS… przy dużym menu to może potrwać do minuty." : <>Czytam kartę menu{fileName ? ` (${fileName})` : ""}…</>}
            </p>
          </div>
        )}

        {step === "preview" && (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-muted-foreground">
                Wykryto {dishes.length} dań · zaznaczono {selectedCount}. Popraw gramatury, jeśli trzeba.
              </p>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">~ szacunek AI</span>
            </div>

            <div className="space-y-3 overflow-y-auto flex-1 min-h-0 pr-1">
              {dishes.map((d) => {
                const costs = d.ingredients.map(liveIngredientCost);
                const known = costs.filter((c) => c != null) as number[];
                const portionCost = known.length > 0 ? known.reduce((s, c) => s + c, 0) : null;
                const foodCostPct = portionCost != null && d.sellPrice ? (portionCost / d.sellPrice) * 100 : null;
                // Wiarygodność: jaki % kosztu z realnych faktur (reszta = prognoza AI).
                const invoiceCost = d.ingredients.reduce((s, i) => (i.source === "invoice" ? s + (liveIngredientCost(i) ?? 0) : s), 0);
                const invoiceShare = portionCost != null && portionCost > 0 ? Math.round((invoiceCost / portionCost) * 100) : 0;
                return (
                  <div key={d.key} className={cn("rounded-xl border p-3 space-y-2.5", d.selected ? "border-border" : "border-border/40 opacity-55")}>
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={d.selected}
                        onChange={(e) => updateDish(d.key, { selected: e.target.checked })}
                        className="mt-1.5 accent-primary"
                      />
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <Input
                            value={d.name}
                            onChange={(e) => updateDish(d.key, { name: e.target.value })}
                            className="h-8 text-sm font-medium flex-1"
                          />
                          <div className="flex items-center gap-1 shrink-0">
                            <Input
                              type="number"
                              value={d.sellPrice ?? ""}
                              placeholder="cena"
                              onChange={(e) => updateDish(d.key, { sellPrice: e.target.value === "" ? null : parseFloat(e.target.value) })}
                              className="h-8 text-sm w-20 text-right"
                            />
                            <span className="text-xs text-muted-foreground">zł</span>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-[11px]">
                          {d.category && <span className="px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{d.category}</span>}
                          {d.posProductName && (
                            <span className="px-1.5 py-0.5 rounded bg-secondary text-primary" title={`Powiązane ze sprzedażą GoPOS: ${d.posProductName}`}>GoPOS</span>
                          )}
                          <span className="text-muted-foreground">Koszt porcji: <b className="text-foreground">{fmt(portionCost)}</b></span>
                          {foodCostPct != null && (
                            <span className="font-semibold" style={{ color: foodCostColor(foodCostPct) }}>food cost {foodCostPct.toFixed(0)}%</span>
                          )}
                          <span className="text-muted-foreground">· {invoiceShare > 0 ? `${invoiceShare}% z faktur` : "wg prognozy AI"}</span>
                        </div>
                      </div>
                    </div>

                    <div className="pl-6 space-y-1">
                      {d.ingredients.map((ing) => (
                        <div key={ing.key} className="flex items-center gap-2">
                          <Input
                            value={ing.name}
                            onChange={(e) => updateIng(d.key, ing.key, { name: e.target.value })}
                            className="h-7 text-xs flex-1"
                          />
                          {ing.source === "estimate" && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-soft text-primary shrink-0" title="Cena z prognozy AI (brak faktury dla tego surowca)">szac.</span>
                          )}
                          <Input
                            type="number"
                            value={ing.grams}
                            onChange={(e) => updateIng(d.key, ing.key, { grams: e.target.value === "" ? 0 : parseFloat(e.target.value) })}
                            className="h-7 text-xs w-16 text-right"
                          />
                          <span className="text-[11px] text-muted-foreground w-4">g</span>
                          <span className="text-[11px] text-muted-foreground w-14 text-right tabular-nums">{fmt(liveIngredientCost(ing))}</span>
                          <button onClick={() => removeIng(d.key, ing.key)} className="text-muted-foreground hover:text-destructive shrink-0" aria-label="Usuń składnik">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                      {d.ingredients.length === 0 && <p className="text-[11px] text-muted-foreground italic">Brak składników — danie zostanie pominięte.</p>}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-2 pt-3 mt-1 border-t border-border">
              <Button variant="ghost" onClick={() => setStep(source === "gopos" ? "gopos" : "upload")} disabled={saveDishes.isPending}>Wstecz</Button>
              <Button onClick={handleSave} disabled={saveDishes.isPending || selectedCount === 0}>
                {saveDishes.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                Zapisz {selectedCount} dań
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
