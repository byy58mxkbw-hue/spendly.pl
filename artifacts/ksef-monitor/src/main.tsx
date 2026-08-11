import "./lib/sentry"; // init Sentry przed renderem (no-op bez VITE_SENTRY_DSN)
import "./lib/posthog"; // analityka PostHog (no-op bez VITE_POSTHOG_KEY; lazy + za zgodą)
import { createRoot } from "react-dom/client";
import App from "./App";
// Fonty self-hosted (OFL): Space Grotesk = UI/body, Fraunces = liczby i nagłówki.
// `wght` / `standard` = tylko potrzebne osie zmienne (mniejsze pliki), subsety
// latin + latin-ext (polskie znaki) ładowane po unicode-range.
import "@fontsource-variable/space-grotesk/wght.css";
import "@fontsource-variable/fraunces/standard.css";
import "./index.css";
import { reloadOnceForStaleChunks } from "./lib/stale-chunk";

// Vite emituje `vite:preloadError` przy nieudanym dynamicznym imporcie (stary chunk
// po deployu) — zamiast błędu przeładowujemy stronę raz, po świeży index.html.
window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  reloadOnceForStaleChunks();
});

createRoot(document.getElementById("root")!).render(<App />);
