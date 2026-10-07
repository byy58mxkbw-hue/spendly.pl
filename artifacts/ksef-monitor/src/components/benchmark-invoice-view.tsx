import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useCreatePriceAlert, getListPriceAlertsQueryKey, type BenchmarkItem } from "@workspace/api-client-react";
import { ArrowUp, ArrowDown, Check } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

type Priced = BenchmarkItem & { medianPrice: number; deltaPercent: number };

const isPriced = (i: BenchmarkItem): i is Priced => !i.insufficientData && i.medianPrice != null && i.deltaPercent != null;
const listNames = (rows: BenchmarkItem[]) => rows.map((r) => r.productName.toLowerCase()).join(", ");
const pct = (n: number) => `${Math.abs(n).toLocaleString("pl-PL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

/** Pasek „gdzie jesteś na tle rynku”: pas p25–p75, kreska mediany, kropka = Twoja cena. */
function MarketBar({ item }: { item: Priced }) {
  const lo = item.p25Price ?? item.medianPrice * 0.9;
  const hi = item.p75Price ?? item.medianPrice * 1.1;
  const min = Math.min(lo, item.yourPrice) * 0.85;
  const max = Math.max(hi, item.yourPrice) * 1.15;
  const x = (v: number) => `${Math.max(0, Math.min(100, ((v - min) / (max - min || 1)) * 100))}%`;
  const over = item.yourPrice > item.medianPrice;
  return (
    <div className="relative h-4 min-w-[160px]" aria-hidden>
      <div className="absolute left-0 right-0 top-1/2 h-px bg-border" />
      <div className="absolute top-1 bottom-1 bg-secondary" style={{ left: x(lo), right: `calc(100% - ${x(hi)})` }} />
      <div className="absolute top-0 bottom-0 w-0.5 bg-foreground/70" style={{ left: x(item.medianPrice) }} />
      <div className={cn("absolute top-1/2 w-3 h-3 -translate-x-1/2 -translate-y-1/2 rounded-full", over ? "bg-negative" : "bg-positive")} style={{ left: x(item.yourPrice) }} />
    </div>
  );
}

/**
 * Porównanie cen pozycji z JEDNEJ faktury (ekran 05 specyfikacji podglądu faktury KSeF).
 * Dane z GET /benchmarks?invoiceId= — ilości są z tej faktury, więc „do odzyskania”
 * liczy się na tej dostawie. Ceny NETTO (unit_price) — analiza kosztów, reguła 29.
 */
export function BenchmarkInvoiceView({ items }: { items: BenchmarkItem[] }) {
  const priced = items.filter(isPriced).sort((a, b) => b.deltaPercent - a.deltaPercent);
  const missing = items.filter((i) => !isPriced(i));
  const over = priced.filter((i) => i.deltaPercent > 0);
  const ok = priced.filter((i) => i.deltaPercent <= 0);
  const recoverable = over.reduce((s, i) => s + (i.savingsPerMonth ?? 0), 0);
  const worst = over[0];

  const qc = useQueryClient();
  const { toast } = useToast();
  const createAlert = useCreatePriceAlert();
  function addAlert(name: string) {
    createAlert.mutate(
      { data: { productName: name, thresholdPercent: 5 } },
      {
        onSuccess: () => {
          void qc.invalidateQueries({ queryKey: getListPriceAlertsQueryKey() });
          toast({ title: "Alert ustawiony", description: `Damy znać, gdy cena „${name}” wzrośnie o ponad 5%.` });
        },
        onError: () => toast({ title: "Nie udało się ustawić alertu", variant: "destructive" }),
      },
    );
  }

  return (
    <div>
      {priced.length > 0 && (
        <div className="grid md:grid-cols-3 gap-px bg-border border border-border mb-6">
          <div className="bg-card p-5 card-emphasis">
            <p className="label-caps text-muted-foreground">Drożej niż rynek</p>
            <p className="mt-2"><span className="num-lg text-4xl text-negative">{over.length}</span> <span className="text-muted-foreground num">z {priced.length}</span></p>
            <p className="text-sm text-muted-foreground mt-2">{over.length ? listNames(over) : "żaden produkt"}</p>
          </div>
          <div className="bg-card p-5">
            <p className="label-caps text-muted-foreground">Do odzyskania na tej dostawie</p>
            <p className="num-lg text-4xl mt-2">{formatPrice(recoverable)}</p>
            <p className="text-sm text-muted-foreground mt-2">
              {over.length ? (over.length === 1 ? "gdyby ten produkt kosztował tyle, ile mediana" : `gdyby te ${over.length} produkty kosztowały tyle, ile mediana`) : "płacisz nie więcej niż rynek"}
            </p>
          </div>
          <div className="bg-card p-5">
            <p className="label-caps text-muted-foreground">W normie lub taniej</p>
            <p className="mt-2"><span className="num-lg text-4xl text-positive">{ok.length}</span> <span className="text-muted-foreground num">z {priced.length}</span></p>
            <p className="text-sm text-muted-foreground mt-2">{ok.length ? listNames(ok) : "—"}</p>
          </div>
        </div>
      )}

      {priced.length > 0 && (
        <div className="border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="label-caps text-muted-foreground border-b border-border">
                <th className="text-left font-semibold px-5 py-3">Produkt</th>
                <th className="text-right font-semibold px-3 py-3">Twoja cena</th>
                <th className="text-right font-semibold px-3 py-3">Mediana</th>
                <th className="text-left font-semibold px-5 py-3 w-[34%]">Gdzie jesteś na tle rynku</th>
                <th className="text-right font-semibold px-5 py-3">Różnica</th>
              </tr>
            </thead>
            <tbody>
              {priced.map((i) => {
                const up = i.deltaPercent > 0;
                return (
                  <tr key={`${i.productName}__${i.unit}`} className="border-b border-border last:border-0">
                    <td className="px-5 py-3.5">
                      <p className="font-semibold">{i.productName}</p>
                      <p className="text-xs text-muted-foreground num">
                        za {i.unit}{i.p25Price != null && i.p75Price != null ? ` · rynek: ${formatPrice(i.p25Price)}–${formatPrice(i.p75Price)}` : ""}
                      </p>
                    </td>
                    <td className="px-3 py-3.5 text-right num font-semibold">{formatPrice(i.yourPrice)}</td>
                    <td className="px-3 py-3.5 text-right num text-muted-foreground">{formatPrice(i.medianPrice)}</td>
                    <td className="px-5 py-3.5"><MarketBar item={i} /></td>
                    <td className={cn("px-5 py-3.5 text-right num font-semibold whitespace-nowrap", up ? "text-negative" : "text-positive")}>
                      {up ? <ArrowUp className="inline w-3.5 h-3.5 -mt-0.5" /> : <ArrowDown className="inline w-3.5 h-3.5 -mt-0.5" />} {pct(i.deltaPercent)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex flex-wrap gap-x-5 gap-y-1 px-5 py-3 border-t border-border text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-negative" /> Twoja cena — drożej</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-positive" /> Twoja cena — w normie lub taniej</span>
            <span className="flex items-center gap-1.5"><span className="w-0.5 h-3 bg-foreground/70" /> mediana</span>
            <span className="flex items-center gap-1.5"><span className="w-4 h-2.5 bg-secondary" /> środkowa połowa cen rynku</span>
          </div>
        </div>
      )}

      {missing.length > 0 && (
        <div className="mt-6 border border-dashed border-border px-5 py-4">
          <p className="font-semibold text-sm">{missing.map((m) => m.productName).join(", ")} — jeszcze bez mediany</p>
          <p className="text-sm text-muted-foreground mt-1">
            Pokażemy porównanie, gdy ceny tych produktów poda co najmniej kilka restauracji. Dzięki temu nikt nie zobaczy cen konkretnego lokalu.
          </p>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4 mt-8">
        <div className="p-6 border border-[#392F22]" style={{ background: "#211B12", color: "#F0E9DB" }}>
          <p className="label-caps" style={{ color: "#E06A3C" }}>Następny krok</p>
          <p className="text-xl font-bold mt-3">Podłącz KSeF, a porównanie będzie aktualne po każdej dostawie</p>
          <p className="text-sm mt-3" style={{ color: "#C9BEA9" }}>Spendly pobierze faktury od wszystkich dostawców, bez wgrywania plików.</p>
          <Link href="/settings/ksef"><Button className="mt-5">Podłącz KSeF</Button></Link>
        </div>
        {worst && (
          <div className="p-6 border border-border bg-card">
            <p className="label-caps text-muted-foreground">Alert cenowy</p>
            <p className="text-xl font-bold mt-3">Daj znać, gdy cena „{worst.productName}” znowu wzrośnie</p>
            <p className="text-sm text-muted-foreground mt-3">
              Już teraz płacisz {pct(worst.deltaPercent)} więcej niż mediana rynku. Powiadomimy Cię, gdy cena wzrośnie o ponad 5% względem poprzedniej faktury.
            </p>
            <Button variant="outline" className="mt-5" onClick={() => addAlert(worst.productName)} disabled={createAlert.isPending || createAlert.isSuccess}>
              {createAlert.isSuccess ? <><Check className="w-4 h-4 mr-1" /> Alert ustawiony</> : "Ustaw alert"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
