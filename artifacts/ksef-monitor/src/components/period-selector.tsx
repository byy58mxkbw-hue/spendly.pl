import { cn } from "@/lib/utils";
import { type Period, PERIOD_LABELS } from "@/hooks/use-period";

const PERIODS: Period[] = ["month", "quarter", "year"];

export function PeriodSelector({
  period,
  onChange,
  className,
}: {
  period: Period;
  onChange: (p: Period) => void;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex items-center rounded-lg border border-border bg-muted/40 p-0.5 gap-0.5", className)}>
      {PERIODS.map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={cn(
            "px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap",
            period === p
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {PERIOD_LABELS[p]}
        </button>
      ))}
    </div>
  );
}
