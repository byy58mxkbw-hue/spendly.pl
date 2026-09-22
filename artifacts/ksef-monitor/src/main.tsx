import "./lib/sentry"; // init Sentry przed renderem (no-op bez VITE_SENTRY_DSN)
import "./lib/posthog"; // analityka PostHog (no-op bez VITE_POSTHOG_KEY; lazy + za zgodą)
import { createRoot } from "react-dom/client";
import App from "./App";
// Jeden font w PANELU (po zalogowaniu): Space Grotesk (OFL, self-hosted). `wght` =
// tylko oś grubości (mniejszy plik), subsety latin + latin-ext (polskie znaki)
// ładowane po unicode-range.
import "@fontsource-variable/space-grotesk/wght.css";
// Baloo 2 (OFL, self-hosted) — WYŁĄCZNIE nagłówki na publicznej stronie marketingowej
// (audyt brandingowy 2026-09: zgodność z Instagramem @spendly.pl). Zakres pilnowany
// przez CSS-owy scope `.spendly-site h1/h2`, nie przez zmianę globalnego fontu —
// panel (dashboard, tabele liczb) zostaje przy Space Grotesk, patrz komentarz wyżej
// i reguła projektowa „jeden font na wszystko" w index.css.
import "@fontsource-variable/baloo-2/wght.css";
// Inter (OFL, self-hosted) — body/UI text na publicznej stronie marketingowej, ten
// sam font co posty na Instagramie. Statyczne pliki inter-*.woff2 w public/fonts to
// osobny, martwy leftover (nic ich nie używa — /blog ma WŁASNE kopie Space Grotesk,
// nie Inter) — ta paczka npm (rodzina CSS "Inter Variable") jest niezależna od nich.
import "@fontsource-variable/inter/wght.css";
import "./index.css";
import { reloadOnceForStaleChunks } from "./lib/stale-chunk";

// Vite emituje `vite:preloadError` przy nieudanym dynamicznym imporcie (stary chunk
// po deployu) — zamiast błędu przeładowujemy stronę raz, po świeży index.html.
window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  reloadOnceForStaleChunks();
});

createRoot(document.getElementById("root")!).render(<App />);
