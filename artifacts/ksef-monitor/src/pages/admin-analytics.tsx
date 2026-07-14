import { useAuth } from "@clerk/react";
import { useQuery } from "@tanstack/react-query";
import { Layout, PageHeader } from "@/components/layout";
import { apiUrl } from "@/lib/api-base";
import { Loader2, ShieldAlert, BarChart3, ExternalLink } from "lucide-react";

// URL osadzenia dashboardu PostHog (Dashboard → Share → "Share externally" → Embed).
// Publiczny embed, więc trzymamy domyślny w kodzie; env VITE_POSTHOG_DASHBOARD_URL
// może go nadpisać (np. gdy zmienisz dashboard) bez zmiany kodu.
const DASHBOARD_URL =
  (import.meta.env.VITE_POSTHOG_DASHBOARD_URL as string | undefined) ||
  "https://eu.posthog.com/embedded/e_fJTDhkadyqrpd9xNFnQg4N_70Owg";

function useIsAdmin() {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ["admin-check"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(apiUrl("/api/admin/check"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.ok;
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export default function AdminAnalytics() {
  const { data: isAdmin, isLoading } = useIsAdmin();

  return (
    <Layout>
      <div className="px-4 py-5 md:px-8 md:py-8 max-w-6xl">
        <PageHeader
          title="Analityka"
          subtitle="Ruch i aktywność na stronie (PostHog)"
        />

        {isLoading ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : !isAdmin ? (
          <div className="glass flex flex-col items-center gap-3 rounded-xl border border-border px-6 py-16 text-center">
            <ShieldAlert className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Brak dostępu. Ta strona jest dostępna tylko dla administratorów.
            </p>
          </div>
        ) : !DASHBOARD_URL ? (
          <div className="glass rounded-xl border border-border px-6 py-12">
            <div className="mx-auto flex max-w-lg flex-col items-center gap-4 text-center">
              <BarChart3 className="h-8 w-8 text-primary" />
              <p className="text-sm font-medium">Dashboard PostHog nie jest jeszcze podłączony</p>
              <ol className="space-y-1.5 text-left text-sm text-muted-foreground">
                <li>1. W PostHog otwórz swój dashboard → <b>Share</b>.</li>
                <li>2. Włącz <b>„Share externally"</b> i skopiuj adres <b>Embed</b> (https://eu.posthog.com/embedded/…).</li>
                <li>3. Na Railway (frontend) ustaw <code>VITE_POSTHOG_DASHBOARD_URL</code> na ten adres i zrób redeploy.</li>
              </ol>
              <a
                href="https://eu.posthog.com"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                Otwórz PostHog <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        ) : (
          <div className="glass overflow-hidden rounded-xl border border-border">
            <iframe
              title="PostHog — analityka"
              src={DASHBOARD_URL}
              className="h-[80vh] w-full border-0"
              loading="lazy"
              allowFullScreen
              sandbox="allow-scripts allow-same-origin allow-popups"
            />
          </div>
        )}
      </div>
    </Layout>
  );
}
