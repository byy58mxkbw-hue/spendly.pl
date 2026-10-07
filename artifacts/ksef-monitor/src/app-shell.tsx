import { lazy, Suspense, useEffect, useRef, useState, type ComponentProps } from "react";
import { readPendingInvoice } from "@/lib/pending-invoice";
import { readInvoiceXml } from "@/lib/ksef-viewer";
import { PendingInvoiceAside } from "@/components/pending-invoice-aside";
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useAuth } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { plPL } from "@clerk/localizations";
import { Switch, Route, useLocation, Redirect } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient, useQuery } from "@tanstack/react-query";
import { apiUrl } from "@/lib/api-base";
import { track, identifyUser, setPersonProperties, setGroup } from "@/lib/posthog";
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
const Benchmark = lazy(() => import("@/pages/benchmark"));
const Reports = lazy(() => import("@/pages/reports"));
const Predictive = lazy(() => import("@/pages/predictive"));
const PendingInvoices = lazy(() => import("@/pages/pending-invoices"));
const SettingsKsef = lazy(() => import("@/pages/settings-ksef"));
const AdminUsers = lazy(() => import("@/pages/admin-users"));
const AdminAnalytics = lazy(() => import("@/pages/admin-analytics"));
const SettingsCostCenters = lazy(() => import("@/pages/settings-cost-centers"));
const SettingsGopos = lazy(() => import("@/pages/settings-gopos"));
const Sprzedaz = lazy(() => import("@/pages/sprzedaz"));
const StartImport = lazy(() => import("@/pages/start-import"));

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
  // Paleta „edytorski gastro" (ciemny papier + terakota) — te same wartości co
  // tokeny w index.css, tylko Clerk nie czyta CSS variables apki.
  variables: {
    colorPrimary: "#E06A3C",
    colorForeground: "#F0E9DB",
    colorMutedForeground: "#9C8F79",
    colorDanger: "hsl(4, 68%, 58%)",
    colorBackground: "#17130E",
    colorInput: "#2A2318",
    colorInputForeground: "#F0E9DB",
    colorNeutral: "#2A2318",
    fontFamily: "'Space Grotesk Variable', system-ui, sans-serif",
    borderRadius: "0.25rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-[#201A13] border border-[#392F22] rounded w-[440px] max-w-full overflow-hidden",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-[#1A150F] !rounded-none",
    headerTitle: "!text-[#F0E9DB] font-bold !tracking-tight",
    headerSubtitle: "!text-[#9C8F79]",
    socialButtonsBlockButtonText: "!text-[#F0E9DB]",
    formFieldLabel: "!text-[#9C8F79] text-sm font-medium",
    footerActionLink: "!text-[#E06A3C] font-medium",
    footerActionText: "!text-[#9C8F79]",
    dividerText: "!text-[#9C8F79]",
    identityPreviewEditButton: "!text-[#E06A3C]",
    formFieldSuccessText: "!text-[#9DB05A]",
    alertText: "!text-[#F0E9DB]",
    logoBox: "mx-auto",
    logoImage: "w-10 h-10 rounded",
    socialButtonsBlockButton: "!border !border-[#392F22] !bg-[#2A2318] hover:!bg-[#33251A] transition-colors",
    formButtonPrimary: "!bg-[#E06A3C] hover:!bg-[#C4562F] !text-[#17130E] font-semibold transition-colors",
    formFieldInput: "!border !border-[#392F22] !bg-[#2A2318] !text-[#F0E9DB] rounded focus:!ring-2 focus:!ring-[#E06A3C]/40",
    footerAction: "border-t border-[#392F22]",
    dividerLine: "!bg-[#392F22]",
    alert: "!border !border-[#392F22] !rounded !bg-[#2A2318]",
    otpCodeFieldInput: "!border !border-[#392F22] !bg-[#2A2318] !rounded",
    formFieldRow: "gap-3",
    main: "gap-4",
  },
};

// Faktura z publicznego podglądu XML czekająca na rejestrację/logowanie (lib/pending-invoice).
// Gdy jest: obok formularza Clerka lewa kolumna „Twoja faktura czeka”, a po zalogowaniu
// przekierowanie na /start (import) zamiast /dashboard. Bez niej — wszystko jak dotąd.
function usePendingInvoice() {
  const [pending] = useState(() => {
    const p = readPendingInvoice();
    if (!p) return null;
    const r = readInvoiceXml(p.xml, p.fileName);
    return r.ok ? r.invoice : null;
  });
  return pending;
}

function AuthLayout({ mode, children }: { mode: "sign-up" | "sign-in"; children: React.ReactNode }) {
  const pending = usePendingInvoice();
  if (!pending) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center px-4" style={{ background: "#17130E" }}>
        {children}
      </div>
    );
  }
  return (
    <div className="min-h-[100dvh] grid md:grid-cols-2" style={{ background: "#17130E" }}>
      <PendingInvoiceAside invoice={pending} mode={mode} />
      <div className="flex flex-col items-center justify-center px-4 py-10">
        {children}
        <p className="mt-4 max-w-[440px] text-xs leading-relaxed" style={{ color: "#9C8F79" }}>
          {mode === "sign-up" ? "Masz już konto? " : "Nie masz konta? "}
          <a href={`${basePath}/${mode === "sign-up" ? "sign-in" : "sign-up"}`} style={{ color: "#E06A3C" }}>
            {mode === "sign-up" ? "Zaloguj się" : "Załóż darmowe konto"}
          </a>
          {" — faktura też się zaimportuje. Ceny z Twoich faktur zasilają anonimową medianę rynku; możesz to wyłączyć w aplikacji. "}
          <a href={`${basePath}/polityka-prywatnosci`} style={{ color: "#E06A3C" }}>Polityka prywatności</a>.
        </p>
      </div>
    </div>
  );
}

function SignInPage() {
  const pending = usePendingInvoice();
  const after = pending ? "/start?z=podglad" : "/dashboard";
  return (
    <>
      {/* Zalogowany user na /sign-in nie może utknąć na ekranie Clerka "jesteś już
          zalogowany" — od razu wpuszczamy go do apki. Niezalogowany widzi formularz. */}
      <Show when="signed-in"><Redirect to={after} /></Show>
      <Show when="signed-out">
        <AuthLayout mode="sign-in">
          <SignIn
            routing="path"
            path={`${basePath}/sign-in`}
            signUpUrl={`${basePath}/sign-up`}
            fallbackRedirectUrl={`${basePath}/dashboard`}
            {...(pending ? { forceRedirectUrl: `${basePath}${after}` } : {})}
          />
        </AuthLayout>
      </Show>
    </>
  );
}

function SignUpPage() {
  const pending = usePendingInvoice();
  const after = pending ? "/start?z=podglad" : "/dashboard";
  return (
    <>
      <Show when="signed-in"><Redirect to={after} /></Show>
      <Show when="signed-out">
        <AuthLayout mode="sign-up">
          <SignUp
            routing="path"
            path={`${basePath}/sign-up`}
            signInUrl={`${basePath}/sign-in`}
            fallbackRedirectUrl={`${basePath}/dashboard`}
            {...(pending ? { forceRedirectUrl: `${basePath}${after}` } : {})}
          />
        </AuthLayout>
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
  const prevPlanRef = useRef<string | undefined>(undefined);

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
      // Grupa "organization" (Spendly nie ma multi-user org — kluczem jest sam
      // userId) + property `plan` na osobie i grupie. Odpala się też przy samej
      // zmianie planu w tej samej sesji (np. admin podniósł plan), nie tylko przy
      // logowaniu — inaczej retencja "wg planu" widziałaby tylko plan z dnia
      // pierwszej wizyty. `industry`/`role` — pomijamy: brak dziś pola
      // onboardingowego, które by je zbierało (patrz specyfikacja trackingu).
      const plan = (user?.publicMetadata as { plan?: string } | undefined)?.plan ?? "free";
      if (userId && (prevUserIdRef.current !== userId || prevPlanRef.current !== plan)) {
        const propsOnce = user?.createdAt ? { signup_date: new Date(user.createdAt).toISOString().slice(0, 10) } : undefined;
        setPersonProperties({ plan, organization_id: userId }, propsOnce);
        setGroup(userId, { plan });
        prevPlanRef.current = plan;
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
      // Oficjalne polskie tłumaczenie Clerka (pola, przyciski, błędy) + nasze nagłówki.
      // Wcześniej tylko nagłówki były po polsku, a formularz po angielsku. Rzutowanie:
      // @clerk/localizations ciągnie nowszy @clerk/shared niż @clerk/react 6.10 i typy
      // kluczy minimalnie się rozjeżdżają; w runtime to zwykłe teksty.
      localization={{
        ...plPL,
        signIn: {
          ...plPL.signIn,
          start: {
            ...plPL.signIn?.start,
            title: "Witaj ponownie",
            subtitle: "Zaloguj się do swojego konta",
          },
        },
        signUp: {
          ...plPL.signUp,
          start: {
            ...plPL.signUp?.start,
            title: "Utwórz konto",
            subtitle: "Zacznij monitorować ceny surowców",
          },
        },
      } as unknown as ComponentProps<typeof ClerkProvider>["localization"]}
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
              <Route path="/start">
                <ProtectedRoute><StartImport /></ProtectedRoute>
              </Route>
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
              <Route path="/benchmark">
                <ProtectedRoute><Benchmark /></ProtectedRoute>
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
              <Route path="/admin/gopos">
                <AdminRoute><SettingsGopos /></AdminRoute>
              </Route>
              <Route path="/sprzedaz">
                <AdminRoute><Sprzedaz /></AdminRoute>
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
