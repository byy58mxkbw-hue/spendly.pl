import { useEffect } from "react";

/**
 * Strony marketingowe (home, cennik, ksef, ocr-faktur, food-cost, porownanie-cen,
 * dla-kogo, regulamin, polityka-prywatnosci) to jedna SPA renderowana z JEDNEGO
 * index.html — bez tego hooka WSZYSTKIE trasy dziedziczą ten sam <title>,
 * meta description i `canonical` zapisany na sztywno w index.html (zawsze
 * wskazujący na "/"). Efekt: Google widział na każdej podstronie deklarację
 * "to duplikat strony głównej" i realnie ryzykował jej nie zaindeksować osobno
 * (naprawione 2026-09-27). Każda strona marketingowa wywołuje ten hook raz,
 * asertując WŁASNY tytuł/opis/canonical — łącznie ze stroną główną, żeby
 * powrót do "/" przez klienckie routowanie (wouter) też się resetował.
 *
 * Nie naprawia podglądu przy share'owaniu w social media (Slack/FB/LinkedIn) —
 * te crawlery nie odpalają JS-a i zawsze zobaczą statyczny index.html. To by
 * wymagało pełnego prerenderu per-trasa (większe zadanie, poza tym zakresem).
 */
const SITE = "https://www.spendly.pl";
const DEFAULT_OG_IMAGE = `${SITE}/og/site.png`;

function upsertMetaByName(name: string, content: string) {
  let el = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertMetaByProperty(property: string, content: string) {
  let el = document.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("property", property);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertCanonical(href: string) {
  let el = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

export function usePageMeta({
  title,
  description,
  path,
  image = DEFAULT_OG_IMAGE,
}: {
  /** Pełny <title> strony, np. "Cennik | Spendly". */
  title: string;
  /** Meta description (i og:description / twitter:description). */
  description: string;
  /** Ścieżka trasy zaczynająca się od "/", np. "/cennik" albo "/" dla strony głównej. */
  path: string;
  image?: string;
}) {
  useEffect(() => {
    const url = path === "/" ? `${SITE}/` : `${SITE}${path}`;
    document.title = title;
    upsertMetaByName("description", description);
    upsertCanonical(url);
    upsertMetaByProperty("og:url", url);
    upsertMetaByProperty("og:title", title);
    upsertMetaByProperty("og:description", description);
    upsertMetaByProperty("og:image", image);
    upsertMetaByName("twitter:title", title);
    upsertMetaByName("twitter:description", description);
    upsertMetaByName("twitter:image", image);
  }, [title, description, path, image]);
}
