import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Spójny, inline'owy stan błędu dla nieudanych zapytań (React Query `isError`).
 * Zamiast wiecznego spinnera / białego ekranu pokazuje komunikat i „Spróbuj ponownie".
 */
export function ErrorState({
  title = "Nie udało się załadować danych",
  message = "Coś poszło nie tak po naszej stronie. Spróbuj ponownie za chwilę.",
  onRetry,
  className,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 py-12 px-4 text-center ${className ?? ""}`}>
      <div className="w-11 h-11 rounded-full bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
        <AlertTriangle className="w-5 h-5" />
      </div>
      <div className="max-w-sm">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground mt-1">{message}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="gap-2">
          <RefreshCw className="w-3.5 h-3.5" /> Spróbuj ponownie
        </Button>
      )}
    </div>
  );
}
