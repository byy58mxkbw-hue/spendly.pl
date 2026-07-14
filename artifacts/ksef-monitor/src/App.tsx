import { lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { ErrorBoundary } from "@/components/error-boundary";
import { ThemeProvider } from "@/hooks/use-theme";
import { PageLoading } from "@/components/page-loading";
import { basePath } from "@/lib/base-path";
import Home from "@/pages/home";

// Ciężki „app shell" (Clerk + react-query + trasy aplikacji/auth/admin) ładowany
// LENIWIE — dzięki temu landing i strony marketingowe startują bez Clerka i
// react-query (mniej JS na krytycznej ścieżce, lepsze LCP/TBT mobile).
const AppShell = lazy(() => import("./app-shell"));

// Publiczne strony marketingowo-SEO — leniwe, bez żadnych providerów.
const KsefPage = lazy(() => import("@/pages/ksef"));
const OcrFakturPage = lazy(() => import("@/pages/ocr-faktur"));
const CennikPage = lazy(() => import("@/pages/cennik"));
const RegulaminPage = lazy(() => import("@/pages/regulamin"));
const PolitykaPrywatnosciPage = lazy(() => import("@/pages/polityka-prywatnosci"));

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <WouterRouter base={basePath}>
          <Suspense fallback={<PageLoading />}>
            <Switch>
              <Route path="/" component={Home} />
              <Route path="/ksef" component={KsefPage} />
              <Route path="/ocr-faktur" component={OcrFakturPage} />
              <Route path="/cennik" component={CennikPage} />
              <Route path="/regulamin" component={RegulaminPage} />
              <Route path="/polityka-prywatnosci" component={PolitykaPrywatnosciPage} />
              {/* Wszystko inne (app / sign-in / sign-up / admin / 404) → leniwy
                  app shell z Clerk + react-query. */}
              <Route component={AppShell} />
            </Switch>
          </Suspense>
        </WouterRouter>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
