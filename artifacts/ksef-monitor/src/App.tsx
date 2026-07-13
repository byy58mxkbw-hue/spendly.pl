import { lazy, Suspense, useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, ClerkLoading, useClerk, useAuth } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient, useQuery } from "@tanstack/react-query";
import { apiUrl } from "@/lib/api-base";
import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/error-boundary";
import { ThemeProvider } from "@/hooks/use-theme";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
// Strony drugorzędne (linki ze stopki/marketing) ładowane leniwie — nie obciążają
// głównego bundla, przez co panel i landing startują szybciej. Home zostaje eager.
const FoodCostPage = lazy(() => import("@/pages/food-cost"));
const KsefPage = lazy(() => import("@/pages/ksef"));
const OcrFakturPage = lazy(() => import("@/pages/ocr-faktur"));
const CennikPage = lazy(() => import("@/pages/cennik"));
const RegulaminPage = lazy(() => import("@/pages/regulamin"));
const PolitykaPrywatnosciPage = lazy(() => import("@/pages/polityka-prywatnosci"));

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
import { CostCenterProvider } from "@/contexts/cost-center-context";

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
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

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
    <div
      className="flex min-h-[100dvh] items-center justify-center px-4"
      style={{ background: "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(61,220,151,0.08) 0%, transparent 60%), #0B0F14" }}
    >
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div
      className="flex min-h-[100dvh] items-center justify-center px-4"
      style={{ background: "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(61,220,151,0.08) 0%, transparent 60%), #0B0F14" }}
    >
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function HomeRedirect() {
  return (
    <>
      {/* Póki Clerk się inicjalizuje, pokaż landing zamiast czarnego ekranu —
          płynne przejście ze statycznego prerenderu w index.html. */}
      <ClerkLoading>
        <Home />
      </ClerkLoading>
      <Show when="signed-in">
        <Redirect to="/dashboard" />
      </Show>
      <Show when="signed-out">
        <Home />
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
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

// Loader pokazywany podczas ładowania leniwych tras (zamiast pustego ekranu).
function PageLoading() {
  return (
    <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", background: "hsl(var(--background))" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
        <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.045em", color: "hsl(var(--foreground))" }}>
          spend<span style={{ color: "hsl(var(--primary))" }}>ly.</span>
        </span>
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: "50%",
            border: "2.5px solid hsl(var(--muted-foreground) / 0.25)",
            borderTopColor: "hsl(var(--primary))",
            animation: "sp-spin 0.7s linear infinite",
          }}
        />
      </div>
      <style>{`@keyframes sp-spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function AppRouter() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
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
              <Route path="/" component={HomeRedirect} />
              <Route path="/ksef" component={KsefPage} />
              <Route path="/food-cost">
                <ProtectedRoute><FoodCostPage /></ProtectedRoute>
              </Route>
              <Route path="/ocr-faktur" component={OcrFakturPage} />
              <Route path="/cennik" component={CennikPage} />
              <Route path="/regulamin" component={RegulaminPage} />
              <Route path="/polityka-prywatnosci" component={PolitykaPrywatnosciPage} />
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

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <WouterRouter base={basePath}>
          <AppRouter />
        </WouterRouter>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
