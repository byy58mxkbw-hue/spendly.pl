import { lazy, Suspense, useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import KsefPage from "@/pages/ksef";
const FoodCostPage = lazy(() => import("@/pages/food-cost"));
import OcrFakturPage from "@/pages/ocr-faktur";
import CennikPage from "@/pages/cennik";

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
const AiCfoPage = lazy(() => import("@/pages/ai-cfo"));
const AdminUsers = lazy(() => import("@/pages/admin-users"));
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

const clerkPubKey = publishableKeyFromHost(
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
    colorPrimary: "#4ADEB3",
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
    footerActionLink: "!text-[#4ADEB3] font-medium",
    footerActionText: "!text-[#9AA4B2]",
    dividerText: "!text-[#9AA4B2]",
    identityPreviewEditButton: "!text-[#4ADEB3]",
    formFieldSuccessText: "text-emerald-400",
    alertText: "!text-[#F5F7FA]",
    logoBox: "mx-auto",
    logoImage: "w-10 h-10 rounded-xl",
    socialButtonsBlockButton: "!border !border-white/[0.08] !bg-white/[0.04] hover:!bg-white/[0.08] transition-colors",
    formButtonPrimary: "!bg-[#4ADEB3] hover:!bg-[#3dcba3] !text-[#0B0F14] font-semibold transition-colors",
    formFieldInput: "!border !border-white/[0.08] !bg-[#1D2A37] !text-[#F5F7FA] rounded-lg focus:!ring-2 focus:!ring-[#4ADEB3]/40",
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
      style={{ background: "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(74,222,179,0.08) 0%, transparent 60%), #0B0F14" }}
    >
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div
      className="flex min-h-[100dvh] items-center justify-center px-4"
      style={{ background: "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(74,222,179,0.08) 0%, transparent 60%), #0B0F14" }}
    >
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function HomeRedirect() {
  return (
    <>
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

function ClerkQueryClientCacheInvalidator() {
  const clerk = useClerk();
  const { addListener } = clerk;
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  // Wire the API client's auth token getter to Clerk's active session.
  // Re-registers when `clerk` is ready so every API call gets a fresh bearer.
  useEffect(() => {
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
          <Suspense fallback={null}>
            <Switch>
              <Route path="/" component={HomeRedirect} />
              <Route path="/ksef" component={KsefPage} />
              <Route path="/food-cost">
                <ProtectedRoute><FoodCostPage /></ProtectedRoute>
              </Route>
              <Route path="/ocr-faktur" component={OcrFakturPage} />
              <Route path="/cennik" component={CennikPage} />
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
              <Route path="/ai-cfo">
                <ProtectedRoute><AiCfoPage /></ProtectedRoute>
              </Route>
              <Route path="/settings/ksef">
                <ProtectedRoute><SettingsKsef /></ProtectedRoute>
              </Route>
              <Route path="/settings/cost-centers">
                <ProtectedRoute><SettingsCostCenters /></ProtectedRoute>
              </Route>
              <Route path="/admin/users">
                <ProtectedRoute><AdminUsers /></ProtectedRoute>
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
    <WouterRouter base={basePath}>
      <AppRouter />
    </WouterRouter>
  );
}

export default App;
