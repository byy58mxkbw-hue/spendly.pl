import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { monthLabel, currentMonth } from "@/lib/month";

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function MonthNavigator({
  month,
  onChange,
  className,
}: {
  month: string;
  onChange: (m: string) => void;
  className?: string;
}) {
  const isThisMonth = month === currentMonth();

  return (
    <div className={cn("inline-flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-0.5", className)}>
      <button
        onClick={() => onChange(shiftMonth(month, -1))}
        className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
        title="Poprzedni miesiąc"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="px-2 text-xs font-medium text-foreground whitespace-nowrap min-w-[96px] text-center">
        {monthLabel(month)}
      </span>
      <button
        onClick={() => onChange(shiftMonth(month, 1))}
        disabled={isThisMonth}
        className={cn(
          "w-7 h-7 rounded-md flex items-center justify-center transition-colors",
          isThisMonth
            ? "text-muted-foreground/30 cursor-not-allowed"
            : "text-muted-foreground hover:text-foreground hover:bg-background"
        )}
        title="Następny miesiąc"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
