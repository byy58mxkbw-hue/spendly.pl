/**
 * Sentry (frontend) — LAZY-load, żeby @sentry/react NIE trafiał do entry chunku
 * i nie blokował pierwszego paintu (LCP) na landingu. Wzorzec jak PostHog:
 * - Bez VITE_SENTRY_DSN = no-op (dev/CI).
 * - SDK ładowany dynamicznie dopiero gdy przeglądarka jest bezczynna (init),
 *   albo na żądanie przy pierwszym błędzie (captureException).
 */

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;

let mod: typeof import("@sentry/react") | null = null;
let loading: Promise<typeof import("@sentry/react")> | null = null;

function load(): Promise<typeof import("@sentry/react")> {
  if (!loading) loading = import("@sentry/react").then((m) => (mod = m));
  return loading;
}

export function initSentry(): void {
  if (!dsn || typeof window === "undefined") return;
  const start = () => {
    void load().then((S) =>
      S.init({
        dsn,
        environment: import.meta.env.MODE,
        tracesSampleRate: 0.1,
        sendDefaultPii: false,
      }),
    );
  };
  if ("requestIdleCallback" in window) {
    (window as unknown as { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(start);
  } else {
    setTimeout(start, 2000);
  }
}

/** Raportuje wyjątek do Sentry. No-op bez DSN. Doładowuje SDK, jeśli trzeba. */
export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (!dsn) return;
  if (mod) {
    mod.captureException(error, context ? { extra: context } : undefined);
    return;
  }
  void load().then((S) => S.captureException(error, context ? { extra: context } : undefined));
}

initSentry();
