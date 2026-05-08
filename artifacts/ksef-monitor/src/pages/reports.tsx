import { useState, useMemo } from "react";
import { Layout, PageHeader } from "@/components/layout";
import { useGetMonthlyReport } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  ChevronLeft, ChevronRight, ShoppingCart, FileText, Package, TrendingUp, ChevronDown, ChevronUp,
} from "lucide-react";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

function monthLabel(month: string) {
  const [year, m] = month.split("-");
  const names = ["Styczeń","Luty","Marzec","Kwiecień","Maj","Czerwiec","Lipiec","Sierpień","Wrzesień","Październik","Listopad","Grudzień"];
  return `${names[parseInt(m) - 1]} ${year}`;
}

function prevMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function nextMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

const COLORS = [
  "hsl(173, 80%, 40%)",
  "hsl(200, 70%, 50%)",
  "hsl(220, 60%, 55%)",
  "hsl(250, 60%, 60%)",
  "hsl(280, 55%, 55%)",
];

function StatCard({ label, value, sub, icon: Icon }: { label: string; value: string; sub?: string; icon: React.ElementType }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 flex items-start gap-4">
      <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
        <p className="text-xl font-bold text-foreground">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function SupplierCard({ supplier, rank }: { supplier: { supplierId: number; supplierName: string; totalSpend: number; invoiceCount: number; productCount: number; topProducts: Array<{ productName: string; unit: string; totalQuantity: number; avgPrice: number; totalCost: number }> }; rank: number }) {
  const [expanded, setExpanded] = useState(rank === 0);
  const topProducts = supplier.topProducts.slice(0, expanded ? 15 : 5);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 text-white"
            style={{ background: COLORS[rank % COLORS.length] }}
          >
            {rank + 1}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{supplier.supplierName}</p>
            <p className="text-xs text-muted-foreground">
              {supplier.invoiceCount} {supplier.invoiceCount === 1 ? "faktura" : supplier.invoiceCount < 5 ? "faktury" : "faktur"} · {supplier.productCount} produktów
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-lg font-bold text-foreground">{formatPrice(supplier.totalSpend)}</p>
        </div>
      </div>

      {/* Products table */}
      <div className="border-t border-border">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-6 py-2 text-xs font-medium text-muted-foreground bg-secondary/30">
          <div>Produkt</div>
          <div className="text-right w-20">Ilość</div>
          <div className="text-right w-28">Śr. cena</div>
          <div className="text-right w-28">Łącznie</div>
        </div>
        <div className="divide-y divide-border">
          {topProducts.map((p, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-6 py-2.5 items-center">
              <p className="text-sm text-foreground truncate pr-2">{p.productName}</p>
              <p className="text-sm text-muted-foreground text-right w-20">
                {p.totalQuantity % 1 === 0 ? p.totalQuantity : p.totalQuantity.toFixed(2)} {p.unit}
              </p>
              <p className="text-sm text-foreground text-right w-28">{formatPrice(p.avgPrice)}/{p.unit}</p>
              <p className="text-sm font-semibold text-foreground text-right w-28">{formatPrice(p.totalCost)}</p>
            </div>
          ))}
        </div>
        {supplier.topProducts.length > 5 && (
          <button
            className="w-full py-2.5 text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1 border-t border-border hover:bg-secondary/30 transition-colors"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <><ChevronUp className="w-3.5 h-3.5" />Zwiń</> : <><ChevronDown className="w-3.5 h-3.5" />Pokaż wszystkie ({supplier.topProducts.length})</>}
          </button>
        )}
      </div>
    </div>
  );
}

export default function Reports() {
  const [month, setMonth] = useState(currentMonth());
  const isCurrentMonth = month === currentMonth();

  const { data, isLoading } = useGetMonthlyReport(
    { month },
    { query: { queryKey: ["reports-monthly", month] } }
  );

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.suppliers
      .slice(0, 8)
      .map((s) => ({ name: s.supplierName.split(" ")[0], value: s.totalSpend, full: s.supplierName }));
  }, [data]);

  return (
    <Layout>
      <div className="px-8 py-8">
        <PageHeader
          title="Raporty"
          subtitle="Miesięczne podsumowanie zakupów i analiza dostawców"
          action={
            <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-1 py-1">
              <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => setMonth(prevMonth(month))}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm font-medium min-w-36 text-center px-2">{monthLabel(month)}</span>
              <Button
                variant="ghost" size="icon" className="w-8 h-8"
                onClick={() => setMonth(nextMonth(month))}
                disabled={isCurrentMonth}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          }
        />

        {/* Summary cards */}
        {isLoading ? (
          <div className="grid grid-cols-3 gap-4 mb-8">
            {[0,1,2].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        ) : data ? (
          <div className="grid grid-cols-3 gap-4 mb-8">
            <StatCard label="Łączne wydatki" value={formatPrice(data.totalSpend)} sub={`${data.invoiceCount} faktur`} icon={ShoppingCart} />
            <StatCard label="Śledzonych produktów" value={String(data.productCount)} sub="unikalnych pozycji" icon={Package} />
            <StatCard label="Liczba faktur" value={String(data.invoiceCount)} sub={`od ${data.suppliers.length} dostawców`} icon={FileText} />
          </div>
        ) : null}

        {/* Supplier spend chart */}
        {!isLoading && data && data.suppliers.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-6 mb-8">
            <p className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              Wydatki wg dostawcy
            </p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                  formatter={(v: number, _, props) => [formatPrice(v), props.payload?.full]}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Top products across all suppliers */}
        {!isLoading && data && data.topProducts.length > 0 && (
          <div className="bg-card border border-border rounded-xl overflow-hidden mb-8">
            <div className="px-6 py-4 border-b border-border flex items-center gap-2">
              <Package className="w-4 h-4 text-primary" />
              <p className="text-sm font-semibold text-foreground">Top produkty miesiąca</p>
              <span className="ml-auto text-xs text-muted-foreground">wg kosztu łącznego</span>
            </div>
            <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-6 py-2 text-xs font-medium text-muted-foreground bg-secondary/30">
              <div>Produkt</div>
              <div className="text-right w-32">Dostawca</div>
              <div className="text-right w-20">Ilość</div>
              <div className="text-right w-28">Śr. cena</div>
              <div className="text-right w-28">Łącznie</div>
            </div>
            <div className="divide-y divide-border">
              {data.topProducts.slice(0, 10).map((p, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-6 py-3 items-center">
                  <p className="text-sm font-medium text-foreground truncate pr-2">{p.productName}</p>
                  <p className="text-xs text-muted-foreground text-right w-32 truncate">{p.supplierName ?? "—"}</p>
                  <p className="text-sm text-muted-foreground text-right w-20">
                    {(p.totalQuantity % 1 === 0 ? p.totalQuantity : p.totalQuantity.toFixed(2))} {p.unit}
                  </p>
                  <p className="text-sm text-foreground text-right w-28">{formatPrice(p.avgPrice)}/{p.unit}</p>
                  <p className="text-sm font-bold text-foreground text-right w-28">{formatPrice(p.totalCost)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Per-supplier reports */}
        {isLoading ? (
          <div className="space-y-4">
            {[0, 1, 2].map(i => <Skeleton key={i} className="h-64 rounded-xl" />)}
          </div>
        ) : data && data.suppliers.length > 0 ? (
          <div className="space-y-4">
            <p className="text-sm font-semibold text-foreground">Raport per dostawca</p>
            {data.suppliers.map((supplier, i) => (
              <SupplierCard key={supplier.supplierId} supplier={supplier} rank={i} />
            ))}
          </div>
        ) : !isLoading ? (
          <div className="bg-card border border-border rounded-xl py-16 text-center">
            <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-foreground font-medium mb-1">Brak danych za {monthLabel(month)}</p>
            <p className="text-sm text-muted-foreground">Zaimportuj faktury z tego miesiąca, aby zobaczyć raport.</p>
          </div>
        ) : null}
      </div>
    </Layout>
  );
}
