import { useState } from "react";
import { Layout, PageHeader } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useGetKsefConfig,
  useUpdateKsefConfig,
  useUpdateKsefSyncFromDate,
} from "@workspace/api-client-react";
import { useSyncKsefProgress, syncPhaseProgress, type SyncPhase } from "@/hooks/use-sync-progress";
import { Progress } from "@/components/ui/progress";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, ExternalLink, RefreshCw, RotateCcw } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function syncPhaseLabel(phase: SyncPhase): string {
  switch (phase.type) {
    case "connecting": return "Łączę z KSeF...";
    case "scanning": return `Skanuję ${phase.windowsDone}/${phase.windowsTotal} okien`;
    case "fetching":
      return phase.total > 0 ? `Pobieranie ${phase.fetched} z ${phase.total}` : "Pobieranie...";
    default: return "Synchronizuj od początku";
  }
}

export default function SettingsKsef() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: config, isLoading, isError } = useGetKsefConfig();
  const updateConfig = useUpdateKsefConfig();
  const { phase: syncPhase, startSync, isPending: syncPending } = useSyncKsefProgress();

  const updateSyncFromDate = useUpdateKsefSyncFromDate();

  const [nip, setNip] = useState("");
  const [token, setToken] = useState("");
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [syncFromDate, setSyncFromDate] = useState("");

  function onSave(e: React.FormEvent) {
    e.preventDefault();
    const finalNip = nip || config?.nip || "";
    if (!finalNip) {
      toast({ variant: "destructive", title: "Brak NIP", description: "Podaj NIP firmy." });
      return;
    }
    if (!token) {
      toast({ variant: "destructive", title: "Brak tokena", description: "Wklej token wygenerowany w aplikacji KSeF." });
      return;
    }
    updateConfig.mutate(
      { data: { nip: finalNip, token } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries();
          setToken("");
          setNip("");
          toast({ title: "Zapisano", description: "Konfiguracja KSeF została zaktualizowana." });
        },
        onError: (err: unknown) => {
          const e = err as { response?: { data?: { error?: string } }; message?: string };
          toast({
            variant: "destructive",
            title: "Błąd zapisu",
            description: e?.response?.data?.error ?? e?.message ?? "Nie udało się zapisać konfiguracji.",
          });
        },
      },
    );
  }

  async function handleSyncFromBeginning() {
    setShowResetConfirm(false);
    try {
      const res = await startSync(true);
      queryClient.invalidateQueries();
      const hasPending = (res.pending ?? 0) > 0;
      const hasImported = (res.imported ?? 0) > 0;

      if (hasPending && !hasImported) {
        toast({
          title: "Faktury wymagają przypisania",
          description: `${res.pending} faktur trafiło do "Do przeglądu" — dostawcy nie są jeszcze dodani w systemie. Otwórz "Do przeglądu" i przypisz je ręcznie lub najpierw dodaj dostawców w sekcji Dostawcy.`,
          duration: 8000,
        });
      } else if (hasPending) {
        toast({
          title: "Synchronizacja zakończona",
          description: `Zaimportowano ${res.imported} faktur. Kolejne ${res.pending} czeka w "Do przeglądu" — wymaga przypisania dostawców.`,
          duration: 6000,
        });
      } else {
        toast({
          title: "Synchronizacja zakończona",
          description: hasImported
            ? `Zaimportowano ${res.imported} nowych faktur.`
            : "Wszystkie faktury są aktualne.",
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Nie udało się zsynchronizować z KSeF.";
      toast({ variant: "destructive", title: "Błąd synchronizacji", description: msg });
    }
  }

  return (
    <Layout>
      <div className="px-4 py-5 md:px-8 md:py-8 max-w-3xl">
        <PageHeader
          title="Ustawienia KSeF"
          subtitle="Skonfiguruj integrację z Krajowym Systemem e-Faktur (Produkcja)"
        />

        <div className="bg-card border border-border rounded-xl p-6 mb-6">
          <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" />
            Aktualna konfiguracja
          </h2>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          ) : isError ? (
            <p className="text-sm text-destructive">
              Nie udało się załadować konfiguracji. Odśwież stronę lub spróbuj ponownie później.
            </p>
          ) : config ? (
            <>
              <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-sm mb-6">
                <dt className="text-muted-foreground">NIP</dt>
                <dd className="font-medium text-foreground" data-testid="text-ksef-nip">{config.nip}</dd>
                <dt className="text-muted-foreground">Token</dt>
                <dd className="font-mono text-foreground" data-testid="text-ksef-token">{config.tokenMasked}</dd>
                <dt className="text-muted-foreground">Środowisko</dt>
                <dd className="text-foreground">{config.environment === "production" ? "Produkcja" : config.environment}</dd>
                <dt className="text-muted-foreground">Ostatnia synchronizacja</dt>
                <dd className="text-foreground">
                  {config.lastSyncedAt
                    ? new Date(config.lastSyncedAt).toLocaleString("pl-PL")
                    : "—"}
                </dd>
              </dl>

              <div className="border-t border-border pt-4">
                <h3 className="text-sm font-medium text-foreground mb-1">Synchronizacja historii</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Ustaw datę, od której ma być pobierana historia faktur. Domyślnie synchronizacja zaczyna się od 1 lutego 2026 (start obowiązkowego KSeF).
                </p>

                <div className="mb-4">
                  <label className="text-xs font-medium text-foreground mb-1.5 block">
                    Data startowa synchronizacji
                  </label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="date"
                      min="2025-01-01"
                      max={new Date().toISOString().slice(0, 10)}
                      value={syncFromDate || config?.syncFromDate || "2026-02-01"}
                      onChange={(e) => setSyncFromDate(e.target.value)}
                      className="w-44 text-sm"
                      data-testid="input-sync-from-date"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={updateSyncFromDate.isPending}
                      onClick={() => {
                        const date = syncFromDate || config?.syncFromDate || "2026-02-01";
                        updateSyncFromDate.mutate(
                          { data: { syncFromDate: date } },
                          {
                            onSuccess: () => {
                              queryClient.invalidateQueries();
                              toast({ title: "Zapisano", description: "Data startowa synchronizacji została zaktualizowana." });
                            },
                            onError: (err: unknown) => {
                              const e = err as { response?: { data?: { error?: string } }; message?: string };
                              toast({
                                variant: "destructive",
                                title: "Błąd",
                                description: e?.response?.data?.error ?? e?.message ?? "Nie udało się zapisać daty.",
                              });
                            },
                          }
                        );
                      }}
                      data-testid="btn-save-sync-from-date"
                    >
                      {updateSyncFromDate.isPending ? "Zapisuję..." : "Zapisz datę"}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Aktualna wartość: <strong>{config?.syncFromDate ? new Date(config.syncFromDate).toLocaleDateString("pl-PL") : "1 lutego 2026 (domyślna)"}</strong>
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowResetConfirm(true)}
                    disabled={syncPending}
                    className="gap-2 self-start"
                    data-testid="btn-sync-from-beginning"
                  >
                    {syncPending ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <RotateCcw className="w-4 h-4" />
                    )}
                    {syncPending ? syncPhaseLabel(syncPhase) : "Synchronizuj od początku"}
                  </Button>
                  {syncPending && (
                    <Progress
                      value={syncPhaseProgress(syncPhase) ?? 0}
                      className="h-1 max-w-xs"
                      data-testid="sync-progress-bar"
                    />
                  )}
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Brak konfiguracji. Wpisz NIP i token poniżej, aby uruchomić synchronizację z KSeF.
            </p>
          )}
        </div>

        <form onSubmit={onSave} className="bg-card border border-border rounded-xl p-6 space-y-4">
          <h2 className="text-sm font-semibold text-foreground">
            {config ? "Zaktualizuj token" : "Skonfiguruj integrację"}
          </h2>

          <div>
            <label className="text-sm text-foreground font-medium mb-1.5 block">NIP firmy</label>
            <Input
              type="text"
              inputMode="numeric"
              placeholder={config?.nip ?? "10 cyfr, np. 1234567890"}
              value={nip}
              onChange={(e) => setNip(e.target.value)}
              maxLength={13}
              data-testid="input-ksef-nip"
            />
            <p className="text-xs text-muted-foreground mt-1">
              NIP nabywcy, dla którego będą pobierane faktury zakupowe.
            </p>
          </div>

          <div>
            <label className="text-sm text-foreground font-medium mb-1.5 block">Token autoryzacyjny KSeF</label>
            <Input
              type="password"
              placeholder="Wklej tutaj nowy token..."
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="off"
              data-testid="input-ksef-token"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Token jest szyfrowany przed zapisem. Po zapisaniu nie można go ponownie odczytać —
              zachowaj go w bezpiecznym miejscu.
            </p>
          </div>

          <div className="flex items-center justify-between pt-2">
            <a
              href="https://ksef.mf.gov.pl/web/pomoc"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-primary hover:underline inline-flex items-center gap-1"
            >
              Jak wygenerować token w aplikacji KSeF
              <ExternalLink className="w-3 h-3" />
            </a>
            <Button type="submit" disabled={updateConfig.isPending} data-testid="btn-save-ksef-config">
              {updateConfig.isPending ? "Zapisuję..." : "Zapisz"}
            </Button>
          </div>
        </form>

        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-medium mb-1">Bezpieczeństwo</p>
          <p className="text-xs">
            Token nie jest nigdy przesyłany z powrotem na frontend w pełnej postaci. Maskujemy go
            do ostatnich 4 znaków. Aby usunąć token z systemu, zapisz nowy lub skontaktuj się z
            administratorem.
          </p>
        </div>
      </div>

      <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Synchronizuj od początku?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  Ta opcja kasuje punkt startowy i pobiera faktury <strong>od {config?.syncFromDate ? new Date(config.syncFromDate).toLocaleDateString("pl-PL") : "1 lutego 2026"}</strong>{!config?.syncFromDate && " (start obowiązkowego KSeF)"}.
                </p>
                <p className="text-amber-700 font-medium">
                  KSeF ogranicza liczbę zapytań. Jeśli limit zostanie przekroczony, synchronizacja zostanie wstrzymana na ok. 1 godzinę.
                </p>
                <p>
                  Jeśli po ostatniej synchronizacji pojawiły się nowe faktury, użyj zwykłego przycisku <strong>"Synchronizuj z KSeF"</strong> na stronie Faktury — jest szybszy i nie ryzykuje blokady.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            <AlertDialogAction onClick={handleSyncFromBeginning}>
              Rozumiem — synchronizuj od początku
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
