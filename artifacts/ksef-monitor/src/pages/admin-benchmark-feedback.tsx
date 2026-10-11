import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useClerk } from "@clerk/react";
import { Layout, PageHeader } from "@/components/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { apiUrl } from "@/lib/api-base";
import { plural } from "@/lib/plural";
import { cn } from "@/lib/utils";

// Zgłoszenia „To nie ten produkt” z porównania cen (spec benchmark v2, etap 4).
// ≥ 2 restauracje = wariant już poza grupą rynkową; admin potwierdza albo przywraca.

type Row = {
  canonicalName: string;
  unit: string;
  marketGroupKey: string | null;
  reports: number;
  reasons: string[];
  lastAt: string;
  decision: "excluded" | "restored" | null;
  excludedNow: boolean;
};

const REASON: Record<string, string> = {
  other_product: "inny produkt",
  wrong_pack: "zła gramatura",
  different_quality: "inna jakość",
};

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

export default function AdminBenchmarkFeedback() {
  const { session } = useClerk();
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery<{ items: Row[] }>({
    queryKey: ["admin", "benchmark-feedback"],
    queryFn: async () => {
      const res = await authFetch(session, "/api/admin/benchmarks/feedback");
      if (!res.ok) throw new Error("Błąd pobierania zgłoszeń");
      return res.json() as Promise<{ items: Row[] }>;
    },
    enabled: !!session,
  });
  const decide = useMutation({
    mutationFn: async (v: { canonicalName: string; unit: string; decision: "excluded" | "restored" }) => {
      const res = await authFetch(session, "/api/admin/benchmarks/feedback/decision", { method: "POST", body: JSON.stringify(v) });
      if (!res.ok) throw new Error("Nie udało się zapisać decyzji");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "benchmark-feedback"] }),
  });

  return (
    <Layout>
      <div className="px-4 py-5 md:px-8 md:py-8 max-w-5xl">
        <PageHeader
          title="Zgłoszenia dopasowań"
          subtitle="„To nie ten produkt” z porównania cen. Zgłoszenie od 2 restauracji wyłącza wariant z grupy do czasu Twojej decyzji — zmiana działa od następnego przeliczenia (co 24 h)."
        />
        {isLoading ? (
          <Skeleton className="h-40 w-full mt-4" />
        ) : isError ? (
          <p className="text-sm text-negative mt-4">Nie udało się wczytać zgłoszeń.</p>
        ) : !data?.items.length ? (
          <p className="text-sm text-muted-foreground mt-4">Brak zgłoszeń.</p>
        ) : (
          <div className="bg-card border border-border mt-4 overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="p-3 font-medium">Wariant z faktury</th>
                  <th className="p-3 font-medium">Grupa</th>
                  <th className="p-3 font-medium">Zgłoszenia</th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={`${r.canonicalName}__${r.unit}`} className="border-b border-border last:border-0 align-top">
                    <td className="p-3">
                      {r.canonicalName} <span className="text-muted-foreground">/ {r.unit}</span>
                      <p className="text-xs text-muted-foreground">{r.reasons.map((x) => REASON[x] ?? x).join(", ")}</p>
                    </td>
                    <td className="p-3">{r.marketGroupKey ?? "—"}</td>
                    <td className="p-3 num">{r.reports} {plural(r.reports, ["restauracja", "restauracje", "restauracji"])}</td>
                    <td className="p-3">
                      <span className={cn("text-xs font-semibold px-2 py-0.5", r.excludedNow ? "bg-negative/10 text-negative" : "bg-secondary text-muted-foreground")}>
                        {r.excludedNow ? "wyłączony z grupy" : r.decision === "restored" ? "przywrócony" : "w grupie"}
                      </span>
                    </td>
                    <td className="p-3 whitespace-nowrap text-right space-x-2">
                      <button
                        type="button"
                        disabled={decide.isPending}
                        onClick={() => decide.mutate({ canonicalName: r.canonicalName, unit: r.unit, decision: "excluded" })}
                        className="text-xs font-semibold px-2.5 py-1.5 border border-border hover:bg-secondary"
                      >
                        Potwierdź wyłączenie
                      </button>
                      <button
                        type="button"
                        disabled={decide.isPending}
                        onClick={() => decide.mutate({ canonicalName: r.canonicalName, unit: r.unit, decision: "restored" })}
                        className="text-xs font-semibold px-2.5 py-1.5 border border-border hover:bg-secondary"
                      >
                        Przywróć
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}
