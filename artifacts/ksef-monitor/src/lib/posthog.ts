/**
 * PostHog (EU) — analityka ruchu + aktywności.
 *
 * Zasady:
 * - Bez VITE_POSTHOG_KEY = no-op (dev/CI), jak Sentry.
 * - LAZY-load: posthog-js ładowany dopiero gdy przeglądarka jest bezczynna,
 *   żeby nie obciążać krytycznego bundla (LCP).
 * - RODO: startujemy OPT-OUT (nie zbieramy nic), a zbieranie włączamy dopiero
 *   po zgodzie `statistics` z Cookiebota (manual mode). Cofnięcie zgody = opt-out.
 * - track()/identifyUser() są bezpieczne: no-op dopóki SDK nie jest gotowe lub
 *   użytkownik nie wyraził zgody (posthog sam pomija zbieranie po opt-out).
 */

const KEY = import.meta.env.VITE_POSTHOG_KEY;
const HOST = import.meta.env.VITE_POSTHOG_HOST || "https://eu.i.posthog.com";

type PostHog = typeof import("posthog-js")["default"];

let ph: PostHog | null = null;
let pendingIdentify: string | null = null;

function wireConsent(posthog: PostHog) {
  const w = window as unknown as { Cookiebot?: { consent?: { statistics?: boolean } } };
  const sync = () => {
    if (w.Cookiebot?.consent?.statistics) posthog.opt_in_capturing();
    else posthog.opt_out_capturing();
  };
  if (w.Cookiebot?.consent) sync();
  window.addEventListener("CookiebotOnConsentReady", sync);
  window.addEventListener("CookiebotOnAccept", sync);
  window.addEventListener("CookiebotOnDecline", sync);
}

export function initAnalytics(): void {
  if (!KEY || typeof window === "undefined") return;

  const start = () => {
    void import("posthog-js").then(({ default: posthog }) => {
      posthog.init(KEY, {
        api_host: HOST,
        ui_host: "https://eu.posthog.com",
        defaults: "2025-05-24", // sensowne domyślne: m.in. pageview na zmianę trasy (SPA)
        person_profiles: "identified_only",
        opt_out_capturing_by_default: true,
      });
      ph = posthog;
      wireConsent(posthog);
      if (pendingIdentify) {
        posthog.identify(pendingIdentify);
        pendingIdentify = null;
      }
    });
  };

  if ("requestIdleCallback" in window) {
    (window as unknown as { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(start);
  } else {
    setTimeout(start, 2000);
  }
}

/** Zdarzenie produktowe (lejek). No-op bez SDK/zgody. */
export function track(event: string, props?: Record<string, unknown>): void {
  ph?.capture(event, props);
}

/** Powiązanie zdarzeń z użytkownikiem (Clerk userId, bez PII). No-op bez SDK. */
export function identifyUser(distinctId: string): void {
  if (ph) ph.identify(distinctId);
  else pendingIdentify = distinctId; // SDK jeszcze się ładuje — zidentyfikuj po init
}

initAnalytics();
