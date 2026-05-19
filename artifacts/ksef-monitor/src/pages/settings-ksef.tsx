import { useState } from "react";
import { Layout, PageHeader } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useGetKsefConfig, useUpdateKsefConfig } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, ExternalLink } from "lucide-react";

export default function SettingsKsef() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: config, isLoading } = useGetKsefConfig();
  const updateConfig = useUpdateKsefConfig();

  const [nip, setNip] = useState("");
  const [token, setToken] = useState("");

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

  return (
    <Layout>
      <div className="px-8 py-8 max-w-3xl">
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
          ) : config ? (
            <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
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
    </Layout>
  );
}
