import { lazy, Suspense, useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useAuth } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Switch, Route, useLocation, Redirect } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient, useQuery } from "@tanstack/react-query";
import { apiUrl } from "@/lib/api-base";
import { track, identifyUser } from "@/lib/posthog";
import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CostCenterProvider } from "@/contexts/cost-center-context";
import { PageLoading } from "@/components/page-loading";
import { basePath, stripBase } from "@/lib/base-path";
import NotFound from "@/pages/not-found";

// Strony aplikacji (za logowaniem) — leniwe, w tym samym „app-shell" chunku granicy.
const FoodCostPage = lazy(() => import("@/pages/food-cost"));
const Dashboard = lazy(() => import("@/pages/dashboard"));
const Suppliers = lazy(() => import("@/pages/suppliers"));
const SupplierDetail = lazy(() => import("@/pages/supplier-detail"));
const Products = lazy(() => import("@/pages/products"));
const Invoices = lazy(() => import("@/pages/invoices"));
const PriceAlerts = lazy(() => import("@/pages/price-alerts"));
const Reports = lazy(() => import("@/pages/reports"));
const Predictive = lazy(() => import("@/pages/predictive"));
const PendingInvoices = lazy(() => import("@/pages/pending-invoices"));
const SettingsKsef = lazy(() => import("@/pages/settings-ksef"));
const AdminUsers = lazy(() => import("@/pages/admin-users"));
const AdminAnalytics = lazy(() => import("@/pages/admin-analytics"));
const SettingsCostCenters = lazy(() => import("@/pages/settings-cost-centers"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Always refetch when a component mounts / page is revisited so that
      // dashboard, reports etc. reflect the latest invoices after import or
      // delete on other pages.
      refetchOnMount: "always",
      refetchOnWindowFocus: true,
      staleTime: 30_000,
    },
  },
});

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "#3DDC97",
    colorForeground: "#F5F7FA",
    colorMutedForeground: "#9AA4B2",
    colorDanger: "hsl(0, 84%, 60%)",
    colorBackground: "#0B0F14",
    colorInput: "#1D2A37",
    colorInputForeground: "#F5F7FA",
    colorNeutral: "#1D2A37",
    fontFamily: "Inter, system-ui, sans-serif",
    borderRadius: "0.75rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-[#131A22] border border-white/[0.06] rounded-2xl w-[440px] max-w-full overflow-hidden shadow-2xl",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-[#0F1720] !rounded-none",
    headerTitle: "!text-[#F5F7FA] font-bold !tracking-tight",
    headerSubtitle: "!text-[#9AA4B2]",
    socialButtonsBlockButtonText: "!text-[#F5F7FA]",
    formFieldLabel: "!text-[#9AA4B2] text-sm font-medium",
    footerActionLink: "!text-[#3DDC97] font-medium",
    footerActionText: "!text-[#9AA4B2]",
    dividerText: "!text-[#9AA4B2]",
    identityPreviewEditButton: "!text-[#3DDC97]",
    formFieldSuccessText: "text-emerald-400",
    alertText: "!text-[#F5F7FA]",
    logoBox: "mx-auto",
    logoImage: "w-10 h-10 rounded-xl",
    socialButtonsBlockButton: "!border !border-white/[0.08] !bg-white/[0.04] hover:!bg-white/[0.08] transition-colors",
    formButtonPrimary: "!bg-[#3DDC97] hover:!bg-[#35c486] !text-[#06231a] font-semibold transition-colors",
    formFieldInput: "!border !border-white/[0.08] !bg-[#1D2A37] !text-[#F5F7FA] rounded-lg focus:!ring-2 focus:!ring-[#3DDC97]/40",
    footerAction: "border-t border-white/[0.06]",
    dividerLine: "!bg-white/[0.06]",
    alert: "!border !border-white/[0.08] !rounded-lg !bg-white/[0.04]",
    otpCodeFieldInput: "!border !border-white/[0.08] !bg-[#1D2A37] !rounded-lg",
    formFieldRow: "gap-3",
    main: "gap-4",
  },
};

function SignInPage() {
  return (
    <>
      {/* Zalogowany user na /sign-in nie może utknąć na ekranie Clerka "jesteś już
          zalogowany" — od razu wpuszczamy go do apki. Niezalogowany widzi formularz. */}
      <Show when="signed-in"><Redirect to="/dashboard" /></Show>
      <Show when="signed-out">
        <div
          className="flex min-h-[100dvh] items-center justify-center px-4"
          style={{ background: "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(61,220,151,0.08) 0%, transparent 60%), #0B0F14" }}
        >
          <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} fallbackRedirectUrl={`${basePath}/dashboard`} />
        </div>
      </Show>
    </>
  );
}

function SignUpPage() {
  return (
    <>
      <Show when="signed-in"><Redirect to="/dashboard" /></Show>
      <Show when="signed-out">
        <div
          className="flex min-h-[100dvh] items-center justify-center px-4"
          style={{ background: "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(61,220,151,0.08) 0%, transparent 60%), #0B0F14" }}
        >
          <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} fallbackRedirectUrl={`${basePath}/dashboard`} />
        </div>
      </Show>
    </>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Show when="signed-in">{children}</Show>
      <Show when="signed-out"><Redirect to="/" /></Show>
    </>
  );
}

// Bramka admina: wymaga zalogowania ORAZ pozytywnego /api/admin/check (backend
// zezwala tylko userId z ADMIN_USER_IDS). Nie-admin nie zobaczy nawet szkieletu
// stron admina — jest przekierowany. Dane i tak chroni backend (403), to warstwa UX.
function AdminGate({ children }: { children: React.ReactNode }) {
  const { getToken } = useAuth();
  const { data, isLoading } = useQuery({
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
  if (isLoading) return <PageLoading />;
  if (data !== true) return <Redirect to="/dashboard" />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Show when="signed-in"><AdminGate>{children}</AdminGate></Show>
      <Show when="signed-out"><Redirect to="/" /></Show>
    </>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const clerk = useClerk();
  const { addListener } = clerk;
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  // Wire the API client's auth token getter to Clerk's active session.
  // Re-registers when `clerk` is ready so every API call gets a fresh bearer.
  useEffect(() => {
    const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "/api";
    setBaseUrl(baseUrl);
    setAuthTokenGetter(async () => {
      try {
        return (await clerk.session?.getToken()) ?? null;
      } catch {
        return null;
      }
    });
    return () => setAuthTokenGetter(null);
  }, [clerk]);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        qc.clear();
      }
      // PostHog: powiąż zdarzenia z użytkownikiem (Clerk userId, bez PII).
      // Na przejściu na zalogowanego — identyfikacja + jednorazowy sign_up dla
      // świeżo utworzonego konta (createdAt < 5 min, guard w localStorage).
      if (userId && prevUserIdRef.current !== userId) {
        identifyUser(userId);
        const createdAt = user?.createdAt ? new Date(user.createdAt).getTime() : 0;
        const key = `ph_signup_${userId}`;
        if (createdAt && Date.now() - createdAt < 5 * 60 * 1000 && !localStorage.getItem(key)) {
          track("sign_up");
          try { localStorage.setItem(key, "1"); } catch { /* ignore */ }
        }
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

// Ciężki „app shell": Clerk + react-query + trasy aplikacji/auth/admin. Ładowany
// LENIWIE z App.tsx (catch-all), więc landing i strony marketingowe nie ciągną
// Clerka ani react-query do krytycznego bundla.
export default function AppShell() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      signInFallbackRedirectUrl={`${basePath}/dashboard`}
      signUpFallbackRedirectUrl={`${basePath}/dashboard`}
      localization={{
        signIn: {
          start: {
            title: "Witaj ponownie",
            subtitle: "Zaloguj się do swojego konta",
          },
        },
        signUp: {
          start: {
            title: "Utwórz konto",
            subtitle: "Zacznij monitorować ceny surowców",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <CostCenterProvider>
        <TooltipProvider>
          <ClerkQueryClientCacheInvalidator />
          <Suspense fallback={<PageLoading />}>
            <Switch>
              {/* Funkcja app „Food Cost" żyje pod /koszty-dania. /food-cost jest
                  PUBLICZNĄ stroną marketingową (SEO) obsługiwaną w App.tsx. */}
              <Route path="/koszty-dania">
                <ProtectedRoute><FoodCostPage /></ProtectedRoute>
              </Route>
              <Route path="/sign-in/*?" component={SignInPage} />
              <Route path="/sign-up/*?" component={SignUpPage} />
              <Route path="/dashboard">
                <ProtectedRoute><Dashboard /></ProtectedRoute>
              </Route>
              <Route path="/suppliers">
                <ProtectedRoute><Suppliers /></ProtectedRoute>
              </Route>
              <Route path="/suppliers/:id">
                {(params) => <ProtectedRoute><SupplierDetail params={params} /></ProtectedRoute>}
              </Route>
              <Route path="/products">
                <ProtectedRoute><Products /></ProtectedRoute>
              </Route>
              <Route path="/invoices">
                <ProtectedRoute><Invoices /></ProtectedRoute>
              </Route>
              <Route path="/price-alerts">
                <ProtectedRoute><PriceAlerts /></ProtectedRoute>
              </Route>
              <Route path="/reports">
                <ProtectedRoute><Reports /></ProtectedRoute>
              </Route>
              <Route path="/predictive">
                <ProtectedRoute><Predictive /></ProtectedRoute>
              </Route>
              <Route path="/pending-invoices">
                <ProtectedRoute><PendingInvoices /></ProtectedRoute>
              </Route>
              {/* Stara zakładka AI CFO — zastąpiona czatem-asystentem; stare linki kierujemy na dashboard */}
              <Route path="/ai-cfo">
                <Redirect to="/dashboard" />
              </Route>
              <Route path="/settings/ksef">
                <ProtectedRoute><SettingsKsef /></ProtectedRoute>
              </Route>
              <Route path="/settings/cost-centers">
                <ProtectedRoute><SettingsCostCenters /></ProtectedRoute>
              </Route>
              <Route path="/admin/analytics">
                <AdminRoute><AdminAnalytics /></AdminRoute>
              </Route>
              <Route path="/admin/users">
                <AdminRoute><AdminUsers /></AdminRoute>
              </Route>
              <Route component={NotFound} />
            </Switch>
          </Suspense>
          <Toaster />
        </TooltipProvider>
        </CostCenterProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}
