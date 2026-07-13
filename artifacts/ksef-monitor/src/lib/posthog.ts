/**
 * PostHog (EU) — analityka ruchu + aktywności.
 *
 * Zasady:
 * - Bez VITE_POSTHOG_KEY = no-op (dev/CI), jak Sentry.
 * - LAZY-load: posthog-js ładowany dopiero gdy przeglądarka jest bezczynna,
 *   żeby nie obciążać krytycznego bundla (LCP).
 * - RODO: startujemy OPT-OUT (nie zbieramy nic), a zbieranie włączamy dopiero
 *   po zgodzie `statistics` z Cookiebota (manual mode). Cofnięcie zgody = opt-out.
 */

const KEY = import.meta.env.VITE_POSTHOG_KEY;
const HOST = import.meta.env.VITE_POSTHOG_HOST || "https://eu.i.posthog.com";

type PostHog = typeof import("posthog-js")["default"];

function wireConsent(posthog: PostHog) {
  const w = window as unknown as { Cookiebot?: { consent?: { statistics?: boolean } } };
  const sync = () => {
    if (w.Cookiebot?.consent?.statistics) posthog.opt_in_capturing();
    else posthog.opt_out_capturing();
  };
  // Jeśli Cookiebot już ma stan zgody — zsynchronizuj od razu.
  if (w.Cookiebot?.consent) sync();
  // Cookiebot ładuje się async — łapiemy jego zdarzenia zgody.
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
        // Nie zbieraj dopóki nie ma zgody — Cookiebot steruje opt-in.
        opt_out_capturing_by_default: true,
      });
      wireConsent(posthog);
    });
  };

  // Odłóż do bezczynności, żeby nie konkurować z pierwszym renderem.
  if ("requestIdleCallback" in window) {
    (window as unknown as { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(start);
  } else {
    setTimeout(start, 2000);
  }
}

initAnalytics();
