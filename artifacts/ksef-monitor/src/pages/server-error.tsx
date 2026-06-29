import { Button } from "@/components/ui/button";
import { AlertTriangle, RotateCcw } from "lucide-react";

/**
 * Ekran błędu serwera/aplikacji (500). Renderowany przez ErrorBoundary,
 * dlatego nie korzysta z routera ani hooków — tylko prosty reset/odświeżenie.
 */
export default function ServerError({ onReset }: { onReset?: () => void }) {
  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="h-7 w-7 text-destructive" />
        </div>
        <p className="text-7xl font-bold text-muted-foreground/30 mb-6">500</p>
        <h1 className="text-2xl font-bold mb-3">Coś poszło nie tak</h1>
        <p className="text-muted-foreground mb-8">
          Wystąpił nieoczekiwany błąd aplikacji. Odśwież stronę lub spróbuj ponownie.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button onClick={() => window.location.reload()}>
            <RotateCcw className="w-4 h-4" />
            Odśwież stronę
          </Button>
          {onReset && (
            <Button variant="outline" onClick={onReset}>
              Spróbuj ponownie
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
