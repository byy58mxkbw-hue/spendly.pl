import { useEffect, useState } from "react";
import { useClerk } from "@clerk/react";
import { apiUrl } from "@/lib/api-base";
import { Layout, PageHeader } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, Save, Plug } from "@/lib/icons";

type GoposConfig = {
  clientId: string;
  clientSecretMasked: string;
  locationId: string | null;
  baseUrl: string | null;
  lastSyncedAt: string | null;
} | null;

async function authFetch(session: ReturnType<typeof useClerk>["session"], url: string, options?: RequestInit) {
  const token = await session?.getToken();
  return fetch(apiUrl(url), {
    ...options,
    headers: {
      ...(options?.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.body ? { "Content-Type": "application/json" } : {}),
    },
  });
}

export default function SettingsGopos() {
  const { session } = useClerk();
  const { toast } = useToast();

  const [cfg, setCfg] = useState<GoposConfig>(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [locationId, setLocationId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await authFetch(session, "/api/gopos/config");
        if (res.ok) {
          const data = (await res.json()) as GoposConfig;
          if (data) {
            setCfg(data);
            setClientId(data.clientId ?? "");
            setLocationId(data.locationId ?? "");
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [session]);

  async function save() {
    if (!clientId.trim()) { toast({ variant: "destructive", title: "Podaj Client ID" }); return; }
    if (!clientSecret.trim() && !cfg) { toast({ variant: "destructive", title: "Podaj Client Secret" }); return; }
    setSaving(true);
    try {
      const res = await authFetch(session, "/api/gopos/config", {
        method: "PUT",
        body: JSON.stringify({ clientId: clientId.trim(), clientSecret: clientSecret.trim(), locationId: locationId.trim() }),
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(e.error || `HTTP ${res.status}`);
      }
      toast({ title: "Zapisano konfigurację GoPOS" });
      setClientSecret("");
      setCfg((c) => ({
        clientId: clientId.trim(),
        clientSecretMasked: clientSecret ? `••••${clientSecret.trim().slice(-4)}` : (c?.clientSecretMasked ?? ""),
        locationId: locationId.trim() || null,
        baseUrl: c?.baseUrl ?? null,
        lastSyncedAt: c?.lastSyncedAt ?? null,
      }));
    } catch (err) {
      toast({ variant: "destructive", title: "Nie udało się zapisać", description: err instanceof Error ? err.message : "" });
    } finally {
      setSaving(false);
    }
  }

  async function sync() {
    setSyncing(true);
    try {
      const res = await authFetch(session, "/api/gopos/sync", { method: "POST", body: JSON.stringify({ months: 3 }) });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; months?: number; revenueUpserts?: number; itemUpserts?: number; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      toast({ title: "Synchronizacja GoPOS zakończona", description: `${data.months} mies. · przychód: ${data.revenueUpserts} · pozycji: ${data.itemUpserts}` });
      setCfg((c) => (c ? { ...c, lastSyncedAt: new Date().toISOString() } : c));
    } catch (err) {
      toast({ variant: "destructive", title: "Synchronizacja nie powiodła się", description: err instanceof Error ? err.message : "" });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 md:px-6 py-5 md:py-7">
        <PageHeader title="GoPOS (integracja)" />
        <p className="text-xs text-muted-foreground mt-0.5 mb-5">
          Widoczne tylko dla administratora. Pobiera obrót i sprzedaż per pozycję z GoPOS → liczy realny food cost %.
        </p>

        {loading ? (
          <div className="glass rounded-xl p-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="glass rounded-xl p-5 md:p-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cid">Client ID</Label>
              <Input id="cid" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="np. 39b25186-…" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="csec">Client Secret {cfg?.clientSecretMasked && <span className="text-muted-foreground font-normal">(zapisany: {cfg.clientSecretMasked} — zostaw puste, by nie zmieniać)</span>}</Label>
              <Input id="csec" type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder={cfg ? "•••• (bez zmian)" : "wklej secret"} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="org">Organization ID <span className="text-muted-foreground font-normal">(liczba, np. 3130)</span></Label>
              <Input id="org" value={locationId} onChange={(e) => setLocationId(e.target.value)} placeholder="np. 3130" />
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button onClick={save} disabled={saving} className="gap-1.5">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Zapisz
              </Button>
              <Button onClick={sync} disabled={syncing || !cfg} variant="outline" className="gap-1.5" title={!cfg ? "Najpierw zapisz konfigurację" : "Pobierz sprzedaż z GoPOS"}>
                {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Synchronizuj (3 mies.)
              </Button>
              {cfg?.lastSyncedAt && (
                <span className="text-xs text-muted-foreground ml-1">Ostatni sync: {new Date(cfg.lastSyncedAt).toLocaleString("pl-PL")}</span>
              )}
            </div>

            <div className="text-[11px] text-muted-foreground border-t border-border pt-3 flex items-start gap-1.5">
              <Plug className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>Klucze generujesz w GoPOS: Ustawienia → Dostępy do API. Secret przechowujemy zaszyfrowany (AES-256). Sync jest read-only po stronie GoPOS.</span>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
