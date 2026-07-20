import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { formatPrice } from "@/lib/format";

// Wykres wydatków miesięcznych wydzielony do OSOBNEGO chunku (recharts ~110KB gzip),
// ładowanego leniwie — dzięki temu szkielet dashboardu i KPI malują się od razu,
// bez czekania na pobranie/parsowanie recharts. Fallback ma tę samą wysokość (240px),
// więc nie ma skoku layoutu.

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-lg text-xs">
      <p className="text-muted-foreground mb-1 font-medium">{label}</p>
      <p className="text-foreground font-bold">{formatPrice(payload[0]?.value ?? 0)}</p>
    </div>
  );
}

export default function SpendAreaChart({
  chartData,
  avgSpend,
}: {
  chartData: Array<{ label: string; totalAmount: number }>;
  avgSpend: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={chartData} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
        />
        <Tooltip content={<ChartTooltip />} />
        {avgSpend > 0 && (
          <ReferenceLine
            y={avgSpend}
            stroke="hsl(var(--muted-foreground))"
            strokeDasharray="4 4"
            strokeOpacity={0.5}
          />
        )}
        <Area
          type="monotone"
          dataKey="totalAmount"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          fill="url(#spendGrad)"
          dot={false}
          activeDot={{ r: 4, fill: "hsl(var(--primary))", strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
