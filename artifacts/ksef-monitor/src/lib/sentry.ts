import * as Sentry from "@sentry/react";

// Inicjalizacja Sentry na froncie. Bez VITE_SENTRY_DSN = no-op (dev/CI).
// Importowane jako pierwsze w main.tsx, przed renderem Aplikacji.
const dsn = import.meta.env.VITE_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  });
}
