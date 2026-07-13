import "./lib/sentry"; // init Sentry przed renderem (no-op bez VITE_SENTRY_DSN)
import "./lib/posthog"; // analityka PostHog (no-op bez VITE_POSTHOG_KEY; lazy + za zgodą)
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { reloadOnceForStaleChunks } from "./lib/stale-chunk";

// Vite emituje `vite:preloadError` przy nieudanym dynamicznym imporcie (stary chunk
// po deployu) — zamiast błędu przeładowujemy stronę raz, po świeży index.html.
window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  reloadOnceForStaleChunks();
});

createRoot(document.getElementById("root")!).render(<App />);
