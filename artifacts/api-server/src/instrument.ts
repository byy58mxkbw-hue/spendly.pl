import * as Sentry from "@sentry/node";

// Inicjalizacja Sentry MUSI nastąpić przed importem app/route'ów — dlatego ten plik
// jest importowany jako PIERWSZY w index.ts. Bez SENTRY_DSN = no-op (dev/test/CI).
const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "production",
    tracesSampleRate: 0.1,
    // Bez PII: nie dołączamy ciał żądań, IP, danych użytkownika.
    sendDefaultPii: false,
    beforeSend(event) {
      // Scrubbing danych wrażliwych — nigdy nie wysyłamy tokenów ani nagłówków auth.
      const headers = event.request?.headers;
      if (headers) {
        for (const k of Object.keys(headers)) {
          if (/^(authorization|cookie|x-.*token.*)$/i.test(k)) delete headers[k];
        }
      }
      if (event.request) delete event.request.cookies;
      return event;
    },
  });
}
