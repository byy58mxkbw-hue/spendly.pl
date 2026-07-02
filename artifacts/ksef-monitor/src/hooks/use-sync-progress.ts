import { useState, useCallback } from "react";
import { useClerk } from "@clerk/react";
import type { KsefSyncResult } from "@workspace/api-client-react";
import { apiUrl } from "@/lib/api-base";

export type SyncPhase =
  | { type: "idle" }
  | { type: "connecting" }
  | { type: "scanning"; windowsDone: number; windowsTotal: number }
  | { type: "fetching"; fetched: number; total: number }
  | { type: "done"; result: KsefSyncResult }
  | { type: "error"; message: string; status?: number };

export function useSyncKsefProgress() {
  const { session } = useClerk();
  const [phase, setPhase] = useState<SyncPhase>({ type: "idle" });

  const startSync = useCallback(
    async (fromBeginning?: boolean): Promise<KsefSyncResult> => {
      setPhase({ type: "connecting" });
      let syncError: string | null = null;

      try {
        const token = await session?.getToken();
        const response = await fetch(apiUrl("/api/ksef/sync"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ fromBeginning: fromBeginning ?? false }),
        });

        if (!response.ok || !response.body) {
          let message = "Błąd synchronizacji KSeF.";
          try {
            const data = (await response.json()) as { error?: string };
            if (data.error) message = data.error;
          } catch {
            /* ignore */
          }
          setPhase({ type: "error", message, status: response.status });
          throw new Error(message);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let result: KsefSyncResult | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            let event: Record<string, unknown>;
            try {
              event = JSON.parse(line.slice(6)) as Record<string, unknown>;
            } catch {
              continue;
            }
            if (event.type === "scanning") {
              setPhase({
                type: "scanning",
                windowsDone: event.windowsDone as number,
                windowsTotal: event.windowsTotal as number,
              });
            } else if (event.type === "fetching") {
              setPhase({
                type: "fetching",
                fetched: event.fetched as number,
                total: event.total as number,
              });
            } else if (event.type === "done") {
              result = event as unknown as KsefSyncResult;
              setPhase({ type: "done", result });
            } else if (event.type === "error") {
              syncError =
                (event.message as string) ?? "Nieznany błąd synchronizacji.";
              setPhase({
                type: "error",
                message: syncError,
                status: event.status as number | undefined,
              });
            }
          }
        }

        if (syncError) throw new Error(syncError);
        if (!result) throw new Error("Synchronizacja nie zwróciła wyniku.");
        return result;
      } catch (err) {
        if (!(err instanceof Error && syncError)) {
          const message =
            err instanceof Error ? err.message : "Nieznany błąd połączenia.";
          setPhase((prev) =>
            prev.type === "error" ? prev : { type: "error", message },
          );
        }
        throw err;
      }
    },
    [session],
  );

  const reset = useCallback(() => setPhase({ type: "idle" }), []);

  const isPending =
    phase.type !== "idle" && phase.type !== "done" && phase.type !== "error";

  return { phase, startSync, reset, isPending };
}

// Polska odmiana rzeczownika przez liczbę.
function plPlural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (n === 1) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/**
 * Jednolity, czytelny opis wyniku synchronizacji KSeF — używany w toastach na
 * dashboardzie, w fakturach i ustawieniach. Zawsze mówi ILE faktur wpadło,
 * ile czeka na przegląd, ile się nie udało i pokazuje ewentualne ostrzeżenia
 * (przekroczony limit KSeF, ucięte okno itd.).
 */
export function describeSyncResult(res: KsefSyncResult): {
  title: string;
  description: string;
  variant?: "destructive";
  duration?: number;
} {
  const imported = res.imported ?? 0;
  const pending = res.pending ?? 0;
  const failed = res.failed ?? 0;
  const errors = res.errors ?? [];

  const nothing = imported === 0 && pending === 0 && failed === 0;
  if (nothing && errors.length === 0) {
    return { title: "Wszystko aktualne", description: "Brak nowych faktur do zaimportowania." };
  }

  // Same faktury do przeglądu (brak importu i błędów) — jasna instrukcja.
  if (pending > 0 && imported === 0 && failed === 0 && errors.length === 0) {
    return {
      title: "Faktury wymagają przypisania",
      description: `${pending} ${plPlural(pending, "faktura trafiła", "faktury trafiły", "faktur trafiło")} do „Do przeglądu" — dodaj lub przypisz dostawców w sekcji „Do przeglądu".`,
      duration: 8000,
    };
  }

  const parts: string[] = [];
  if (imported > 0) parts.push(`${imported} ${plPlural(imported, "nowa faktura", "nowe faktury", "nowych faktur")}`);
  if (pending > 0) parts.push(`${pending} do przeglądu`);
  if (failed > 0) parts.push(`${failed} ${plPlural(failed, "nieudana", "nieudane", "nieudanych")}`);

  let description = parts.length > 0
    ? `Zsynchronizowano: ${parts.join(", ")}.`
    : "Nie zaimportowano żadnych faktur.";

  if (errors.length > 0) {
    description += ` Uwaga: ${errors[0]}`;
    if (errors.length > 1) description += ` (+${errors.length - 1} ${plPlural(errors.length - 1, "inne", "inne", "innych")})`;
  }

  // Nic nie wpadło, ale były problemy → traktuj jako błąd.
  const variant = imported === 0 && pending === 0 ? ("destructive" as const) : undefined;

  return {
    title: variant ? "Synchronizacja nieudana" : "Synchronizacja zakończona",
    description,
    ...(variant ? { variant } : {}),
    duration: errors.length > 0 || failed > 0 ? 8000 : 5000,
  };
}

export function syncPhaseProgress(phase: SyncPhase): number | null {
  switch (phase.type) {
    case "connecting":
      return 0;
    case "scanning":
      return phase.windowsTotal > 0
        ? (phase.windowsDone / phase.windowsTotal) * 50
        : 0;
    case "fetching":
      return phase.total > 0
        ? 50 + (phase.fetched / phase.total) * 50
        : 50;
    case "done":
      return 100;
    default:
      return null;
  }
}
