// Darmowe kalkulatory dla gastronomii — statyczne strony /kalkulatory/<slug>
// generowane razem z blogiem (build-blog.mjs). Narzędzia lepiej się pozycjonują
// niż same artykuły i zbierają linki (konkurencja na „jak obliczyć food cost” ma
// kalkulator, my nie mieliśmy — analiza SEO 2026-10-05).
//
// CSP: skrypt każdej strony jest INLINE i trafia do hashy automatycznie
// (collectInlineScriptHashes w vite.config.ts skanuje wszystkie *.html z builda).
// Zero inline event-handlerów (onclick=...) — wymuszone CSP by je zablokowało
// (reguła 28), więc wszystko przez addEventListener.

// Wspólny kawałek JS: parsowanie liczb z przecinkiem i formatowanie pl-PL.
const JS_COMMON = `
var num=function(id){var v=document.getElementById(id).value.replace(/\\s/g,"").replace(",",".");var n=parseFloat(v);return isFinite(n)?n:NaN;};
var zl=function(n){return isFinite(n)?n.toLocaleString("pl-PL",{minimumFractionDigits:2,maximumFractionDigits:2})+" zł":"—";};
var pct=function(n){return isFinite(n)?n.toLocaleString("pl-PL",{minimumFractionDigits:1,maximumFractionDigits:1})+"%":"—";};
var out=function(id,t){document.getElementById(id).textContent=t;};
var bind=function(f){var el=document.querySelectorAll(".calc input,.calc select");for(var i=0;i<el.length;i++){el[i].addEventListener("input",f);}f();};`;

const field = (id, label, value, suffix, hint) => `
        <label class="f" for="${id}"><span class="fl">${label}</span>
          <span class="fi"><input id="${id}" inputmode="decimal" value="${value}" autocomplete="off" />${suffix ? `<span class="fs">${suffix}</span>` : ""}</span>
          ${hint ? `<span class="fh">${hint}</span>` : ""}
        </label>`;
const result = (id, label, big = false) => `<div class="r${big ? " big" : ""}"><span>${label}</span><b id="${id}" class="num">—</b></div>`;

export const TOOLS = [
  {
    slug: "kalkulator-food-cost",
    title: "Kalkulator food cost — oblicz food cost dania online",
    h1: "Kalkulator food cost",
    description: "Darmowy kalkulator food cost: wpisz koszt składników i cenę z karty, a policzymy food cost netto, marżę i cenę dla Twojego docelowego food costu.",
    lead: "Wpisz koszt składników porcji i cenę dania z karty. Kalkulator sprowadzi cenę do netto, policzy food cost i marżę oraz podpowie cenę dla docelowego food costu.",
    keywords: "kalkulator food cost, jak obliczyć food cost, food cost dania, food cost kalkulator online",
    article: "jak-liczyc-food-cost",
    // Anchor = fraza z Search Console, nie ogólnik (patrz START_HERE w build-blog).
    articleAnchor: "jak obliczyć food cost",
    form: [
      field("cost", "Koszt składników porcji (netto)", "12,50", "zł", "Suma z receptury, z ceną zakupu bez VAT."),
      field("price", "Cena dania w karcie (brutto)", "42", "zł", ""),
      field("vat", "Stawka VAT na danie", "8", "%", "Dla jedzenia zwykle 8%."),
      field("target", "Docelowy food cost", "30", "%", "Typowo 28–35%."),
    ].join(""),
    results: [result("fc", "Food cost dania", true), result("net", "Cena netto"), result("mz", "Marża na porcji (netto)"), result("mp", "Marża %"), result("sug", "Cena w karcie dla docelowego food costu")].join(""),
    script: `bind(function(){var c=num("cost"),p=num("price"),v=num("vat"),t=num("target");var net=p/(1+v/100);var fc=c/net*100;
out("fc",pct(fc));out("net",zl(net));out("mz",zl(net-c));out("mp",pct((net-c)/net*100));out("sug",zl(c/(t/100)*(1+v/100)));
document.getElementById("fc").className="num "+(fc>35?"bad":fc<=30?"ok":"");});`,
    body: `## Jak działa kalkulator food cost

Food cost dania to udział kosztu składników w cenie sprzedaży **netto**. Cena w karcie zawiera VAT, który nie jest Twoim przychodem, dlatego kalkulator najpierw ją do netto sprowadza:

\`\`\`
Cena netto = cena w karcie / (1 + VAT)
Food cost % = koszt składników / cena netto × 100
Cena dla celu = koszt składników / docelowy food cost × (1 + VAT)
\`\`\`

Przykład: koszt składników 12,50 zł, danie za 42 zł brutto przy VAT 8%. Cena netto to 38,89 zł, a food cost wynosi 32,1%. Żeby zejść do 30%, cena w karcie powinna wynosić 45 zł.

## Skąd wziąć koszt składników

Z receptury, czyli [karty technologicznej dania](/blog/karta-technologiczna-dania): każdy składnik z gramaturą brutto i ceną zakupu netto z ostatniej faktury. Dolicz 3–8% na straty i drobne dodatki, takie jak olej czy przyprawy.

Ręczne pilnowanie cen ma jedną wadę: wynik jest aktualny tylko do następnej dostawy. [Spendly](/food-cost) pobiera ceny z faktur w KSeF i przelicza food cost dań sam, gdy któryś surowiec podrożeje.

## Najczęstsze pytania

### Ile powinien wynosić food cost dania?

Dla większości restauracji zdrowy food cost mieści się w przedziale 28–35%. Pizzerie i kawiarnie zwykle mają niższy, a fine dining i bary szybkiej obsługi wyższy. Szczegóły w artykule [ile powinien wynosić food cost](/blog/ile-powinien-wynosic-food-cost).

### Dlaczego kalkulator liczy od ceny netto?

Bo VAT ze sprzedaży oddajesz do urzędu. Liczenie food costu od ceny brutto zaniża wynik o wartość VAT, na przykład przy 8% food cost wychodzi o kilka procent niższy, niż jest naprawdę.

### Czy koszt składników też ma być netto?

Tak, jeśli odliczasz VAT od zakupów. Kosztem surowca jest wtedy kwota netto z faktury.

### Co zrobić, gdy food cost dania jest za wysoki?

Sprawdź ceny zakupu i porównaj dostawców, ustandaryzuj gramaturę porcji, a dopiero potem rozważ zmianę ceny w karcie. Często wystarczy tańszy dostawca jednego składnika.

### Jak liczyć food cost całej restauracji?

Food cost lokalu = (stan początkowy + zakupy − stan końcowy) / przychód netto ze sprzedaży jedzenia × 100. Stany pochodzą z inwentaryzacji, a zakupy z faktur.`,
  },
  {
    slug: "kalkulator-marzy-i-narzutu",
    title: "Kalkulator marży i narzutu dla gastronomii",
    h1: "Kalkulator marży i narzutu",
    description: "Darmowy kalkulator marży i narzutu: wpisz koszt i cenę netto albo przelicz narzut na marżę. Wzory i przykłady dla restauracji.",
    lead: "Wpisz koszt i cenę sprzedaży netto, a policzymy marżę, narzut i zysk na sztuce. Niżej przeliczysz narzut na marżę i odwrotnie.",
    keywords: "kalkulator marży, kalkulator narzutu, marża a narzut, jak obliczyć marżę, przeliczanie narzutu na marżę",
    article: "marza-a-narzut-gastronomia",
    // Anchor = fraza z Search Console, nie ogólnik (patrz START_HERE w build-blog).
    articleAnchor: "marża a narzut w gastronomii",
    form: [
      field("cost", "Koszt (netto)", "10", "zł", ""),
      field("price", "Cena sprzedaży (netto)", "30", "zł", ""),
      field("conv", "Przelicz narzut na marżę", "200", "%", "Wpisz narzut, a pokażemy odpowiadającą mu marżę."),
    ].join(""),
    results: [result("mp", "Marża", true), result("np", "Narzut", true), result("zysk", "Zysk na sztuce"), result("convm", "Marża dla wpisanego narzutu")].join(""),
    script: `bind(function(){var c=num("cost"),p=num("price"),n=num("conv");out("mp",pct((p-c)/p*100));out("np",pct((p-c)/c*100));out("zysk",zl(p-c));out("convm",pct(n/(100+n)*100));});`,
    body: `## Marża a narzut — wzory

\`\`\`
Marża % = (cena − koszt) / cena × 100
Narzut % = (cena − koszt) / koszt × 100
Marża = narzut / (100 + narzut) × 100
\`\`\`

Danie za 30 zł netto o koszcie 10 zł ma narzut 200% i marżę 66,7%. To ta sama transakcja i ten sam zysk 20 zł. Różni się tylko podstawa procentu. Więcej przykładów w artykule [marża a narzut w gastronomii](/blog/marza-a-narzut-gastronomia).

## Którą miarę stosować

Do wyceny dania wygodniejszy jest narzut, bo mnożysz koszt składników. Do oceny rentowności lepsza jest marża, bo od razu widać, jaka część utargu zostaje. Dla samych surowców marża + food cost = 100%.

## Najczęstsze pytania

### Czym różni się marża od narzutu?

Narzut liczy się od kosztu, a marżę od ceny sprzedaży. Zysk w złotówkach jest ten sam.

### Czy marża może przekroczyć 100%?

Nie. Marża jest częścią ceny, więc nie przekracza 100%. Narzut może być dowolnie wysoki.

### Jak przeliczyć narzut na marżę?

Marża = narzut / (100 + narzut) × 100. Narzut 100% to marża 50%, narzut 200% to marża 66,7%, a narzut 300% to marża 75%.

### Czy marżę liczyć od ceny brutto?

Nie. W gastronomii marżę i food cost liczy się od ceny netto, bo VAT nie jest przychodem restauracji.

### Jaki narzut stosuje się w restauracji?

To zależy od docelowego food costu. Przy food coście 30% narzut na składniki wynosi około 233%, a przy 25% równe 300%.`,
  },
  {
    slug: "kalkulator-beverage-cost",
    title: "Kalkulator beverage cost — koszt porcji drinka i napoju",
    h1: "Kalkulator beverage cost",
    description: "Darmowy kalkulator beverage cost: policz koszt porcji z butelki, uwzględnij straty i sprawdź beverage cost drinka, piwa albo wina.",
    lead: "Wpisz cenę butelki, jej pojemność i wielkość porcji. Kalkulator policzy koszt porcji z uwzględnieniem strat i beverage cost przy Twojej cenie.",
    keywords: "kalkulator beverage cost, beverage cost, koszt drinka, koszt porcji alkoholu, jak liczyć beverage cost",
    article: "beverage-cost-restauracja",
    // Anchor = fraza z Search Console, nie ogólnik (patrz START_HERE w build-blog).
    articleAnchor: "czym jest beverage cost",
    form: [
      field("bottle", "Cena butelki (netto)", "62", "zł", ""),
      field("vol", "Pojemność butelki", "700", "ml", ""),
      field("portion", "Porcja", "40", "ml", ""),
      field("loss", "Straty (rozlewanie, piana)", "3", "%", "Przy piwie z beczki normą jest 3–5%."),
      field("price", "Cena porcji w karcie (brutto)", "16", "zł", ""),
      field("vat", "Stawka VAT", "23", "%", "Napoje alkoholowe zwykle 23%."),
    ].join(""),
    results: [result("bc", "Beverage cost porcji", true), result("pc", "Koszt porcji"), result("np", "Cena netto"), result("por", "Porcji z butelki")].join(""),
    script: `bind(function(){var b=num("bottle"),v=num("vol"),po=num("portion"),l=num("loss"),p=num("price"),vat=num("vat");var cost=b/v*po/(1-l/100);var net=p/(1+vat/100);var bc=cost/net*100;
out("bc",pct(bc));out("pc",zl(cost));out("np",zl(net));out("por",isFinite(v/po)?(Math.floor(v/po*(1-l/100)*10)/10).toLocaleString("pl-PL"):"—");
document.getElementById("bc").className="num "+(bc>28?"bad":bc<=24?"ok":"");});`,
    body: `## Jak liczy się beverage cost porcji

\`\`\`
Koszt porcji = cena butelki / pojemność × porcja / (1 − straty)
Beverage cost % = koszt porcji / cena netto porcji × 100
\`\`\`

Przykład: butelka 0,7 l za 62 zł netto, porcja 40 ml, straty 3%. Koszt porcji to około 3,65 zł. Przy cenie 16 zł brutto i VAT 23% cena netto wynosi 13,01 zł, a beverage cost 28,1%.

## Normy beverage cost

Łącznie beverage cost mieści się zwykle w 18–24%. Kategorie różnią się jednak mocno: alkohole mocne 15–20%, piwo beczkowe 18–24%, piwo butelkowe 22–28%, wino 25–35%, napoje bezalkoholowe 10–15%. Więcej w artykule [czym jest beverage cost](/blog/beverage-cost-restauracja).

## Najczęstsze pytania

### Co to jest beverage cost?

To koszt napojów wyrażony jako procent przychodu z ich sprzedaży. To odpowiednik food costu liczony osobno dla baru.

### Dlaczego uwzględniać straty?

Bo nalewanie na oko, piana i pierwsze kufle po wymianie beczki zużywają towar, który nie trafia na rachunek. Różnica między 40 a 50 ml to aż 25% surowca.

### Jaki VAT przyjąć dla napojów?

Napoje alkoholowe zwykle mają 23%. Stawki dla innych napojów potwierdź z księgowym.

### Jak obniżyć beverage cost?

Używaj miarek, pilnuj strat przy nalewaniu piwa, porównuj ceny dostawców i licz beverage cost osobno dla kategorii, bo zmiana struktury sprzedaży potrafi zmienić wynik bez zmiany cen.

### Jak liczyć beverage cost całego baru?

Koszt zużytych napojów (stan początkowy + zakupy − stan końcowy) dzielisz przez przychód netto ze sprzedaży napojów i mnożysz przez 100.`,
  },
  {
    slug: "kalkulator-progu-rentownosci",
    title: "Kalkulator progu rentowności restauracji",
    h1: "Kalkulator progu rentowności restauracji",
    description: "Darmowy kalkulator progu rentowności: wpisz koszty stałe i udział kosztów zmiennych, a policzymy, ile restauracja musi sprzedać miesięcznie i dziennie.",
    lead: "Wpisz miesięczne koszty stałe i udział kosztów zmiennych w sprzedaży. Kalkulator pokaże, ile musisz sprzedać, żeby wyjść na zero, w skali miesiąca i dnia.",
    keywords: "próg rentowności restauracji, kalkulator progu rentowności, ile musi zarobić restauracja, koszty stałe i zmienne restauracja",
    article: "koszty-stale-i-zmienne-w-restauracji",
    // Anchor = fraza z Search Console, nie ogólnik (patrz START_HERE w build-blog).
    articleAnchor: "koszty stałe i zmienne w restauracji",
    form: [
      field("fixed", "Koszty stałe miesięcznie", "48000", "zł", "Czynsz, stałe pensje, media, leasingi, księgowość."),
      field("var", "Koszty zmienne", "42", "% sprzedaży", "Surowce, opakowania, prowizje."),
      field("days", "Dni otwarcia w miesiącu", "30", "", ""),
      field("check", "Średni rachunek (netto)", "65", "zł", "Do przeliczenia na liczbę gości."),
    ].join(""),
    results: [result("be", "Próg rentowności miesięcznie", true), result("bed", "Sprzedaż dziennie"), result("guests", "Gości dziennie"), result("cm", "Wskaźnik marży pokrycia")].join(""),
    script: `bind(function(){var f=num("fixed"),v=num("var"),d=num("days"),c=num("check");var cm=1-v/100;var be=f/cm;out("be",zl(be));out("bed",zl(be/d));out("guests",isFinite(be/d/c)?Math.ceil(be/d/c).toLocaleString("pl-PL"):"—");out("cm",pct(cm*100));});`,
    body: `## Jak liczy się próg rentowności

\`\`\`
Wskaźnik marży pokrycia = 1 − udział kosztów zmiennych
Próg rentowności = koszty stałe / wskaźnik marży pokrycia
\`\`\`

Przykład: koszty stałe 48 000 zł, koszty zmienne 42% sprzedaży. Wskaźnik marży pokrycia to 0,58, a próg rentowności wynosi około 82 759 zł sprzedaży netto miesięcznie, czyli około 2 759 zł dziennie przy 30 dniach otwarcia.

## Skąd wziąć dane

Koszty stałe uśrednij z ostatnich trzech miesięcy. Koszty zmienne zsumuj za ten sam okres: [surowce z faktur](/blog/jak-liczyc-food-cost), opakowania, prowizje i dodatkowe zmiany, a potem podziel przez przychód netto. Więcej w artykule [koszty stałe i zmienne w restauracji](/blog/koszty-stale-i-zmienne-w-restauracji).

## Najczęstsze pytania

### Co to jest próg rentowności restauracji?

To poziom sprzedaży, przy którym przychody pokrywają wszystkie koszty, a zysk wynosi zero. Każda złotówka powyżej progu to zysk.

### Co zaliczyć do kosztów stałych?

Koszty, które nie zależą od sprzedaży: czynsz, stałe pensje, część mediów, leasingi, księgowość i oprogramowanie.

### Co zaliczyć do kosztów zmiennych?

Koszty rosnące razem ze sprzedażą: surowce, opakowania na wynos, prowizje od płatności i platform oraz dodatkowe zmiany w szczycie.

### Jak obniżyć próg rentowności?

Obniżając koszty stałe albo udział kosztów zmiennych. Najszybciej działa zwykle pilnowanie cen surowców, bo spadek kosztów zmiennych o kilka punktów mocno obniża próg.

### Czy liczyć próg od sprzedaży netto?

Tak. VAT ze sprzedaży oddajesz do urzędu, więc porównuj próg ze sprzedażą netto.`,
  },
];

export const TOOL_STYLE = `
      .calc{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:20px;margin:24px 0 8px}
      @media(max-width:720px){.calc{grid-template-columns:1fr}}
      .calc-more{font-size:14px;color:#8A7C63;margin:6px 0 0}
      .calc-more a{color:#A8431F;font-weight:600}
      .calc .box{background:#FBF7EF;border:1px solid #E2D8C6;border-radius:4px;padding:20px}
      .calc .f{display:block;margin:0 0 14px}
      .calc .fl{display:block;font-size:13px;font-weight:600;color:#211B12;margin-bottom:6px}
      .calc .fi{display:flex;align-items:center;border:1px solid #E2D8C6;border-radius:3px;background:#FFFFFF}
      .calc .fi:focus-within{border-color:#A8431F;outline:2px solid rgba(168,67,31,.15)}
      .calc input{flex:1;min-width:0;border:0;background:transparent;padding:10px 12px;font:inherit;font-size:16px;color:#211B12;outline:none;font-variant-numeric:tabular-nums}
      .calc .fs{padding:0 12px;color:#8A7C63;font-size:13px;white-space:nowrap}
      .calc .fh{display:block;font-size:12px;color:#8A7C63;margin-top:4px}
      .calc .r{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:12px 0;border-bottom:1px solid #E2D8C6;font-size:14px;color:#5C5340}
      .calc .r:last-child{border-bottom:0}
      .calc .r b{font-size:17px;color:#211B12;font-variant-numeric:tabular-nums}
      .calc .r.big b{font-size:28px;font-weight:700;letter-spacing:-0.02em}
      .calc b.ok{color:#6B7A3A} .calc b.bad{color:#A8431F}
      .calc .rh{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#8A7C63;margin:0 0 4px}
      .tool-cards{max-width:1200px;margin:0 auto;padding:24px;display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:20px}`;

export function renderToolPage(tool, h) {
  const url = `${h.SITE}/kalkulatory/${tool.slug}`;
  const faq = h.extractFaq(tool.body);
  const appLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: tool.h1,
    url,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Any",
    inLanguage: "pl-PL",
    offers: { "@type": "Offer", price: "0", priceCurrency: "PLN" },
    description: tool.description,
  };
  const faqLd = faq.length
    ? { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map((x) => ({ "@type": "Question", name: x.q, acceptedAnswer: { "@type": "Answer", text: x.a } })) }
    : null;
  const crumbsLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Strona główna", item: `${h.SITE}/` },
      { "@type": "ListItem", position: 2, name: "Kalkulatory", item: `${h.SITE}/kalkulatory` },
      { "@type": "ListItem", position: 3, name: tool.h1, item: url },
    ],
  };
  const others = TOOLS.filter((t) => t.slug !== tool.slug);
  return `<!DOCTYPE html>
<html lang="pl" class="light">
  <head>${h.HEAD_COMMON}
    <title>${h.esc(tool.title)} | Spendly</title>
    <meta name="description" content="${h.escAttr(tool.description)}" />
    <meta name="keywords" content="${h.escAttr(tool.keywords)}" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="${url}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${url}" />
    <meta property="og:title" content="${h.escAttr(tool.title)}" />
    <meta property="og:description" content="${h.escAttr(tool.description)}" />
    <meta property="og:site_name" content="Spendly.pl | kontrola kosztów w gastronomii" />
    <meta property="og:locale" content="pl_PL" />
    <meta property="og:image" content="${h.SITE}/blog/og/_index.png" />
    <script type="application/ld+json">
${h.jsonLd(appLd)}
    </script>
    <script type="application/ld+json">
${h.jsonLd(crumbsLd)}
    </script>${faqLd ? `
    <script type="application/ld+json">
${h.jsonLd(faqLd)}
    </script>` : ""}${h.STYLE.replace("</style>", `${TOOL_STYLE}\n    </style>`)}
  </head>
  <body>
${h.nav()}
    <main>
      <div class="wrap crumbs"><a href="/">Strona główna</a> › <a href="/kalkulatory">Kalkulatory</a> › ${h.esc(tool.h1)}</div>
      <article class="post">
        <h1>${h.esc(tool.h1)}</h1>
        <p class="lead">${h.esc(tool.lead)}</p>
        <form class="calc" novalidate>
          <div class="box">${tool.form}
          </div>
          <div class="box" aria-live="polite">
            <p class="rh">Wynik</p>
            ${tool.results}
          </div>
        </form>${tool.article ? `
        <p class="calc-more">Wzór i przykład krok po kroku: <a href="/blog/${tool.article}">${h.esc(tool.articleAnchor || tool.h1)}</a>.</p>` : ""}
        <div class="post-body">
${h.mdToHtml(tool.body)}
        </div>
      </article>
      <div class="cta-box"><div class="cta-inner">
        <h2>Niech liczy się samo, z Twoich faktur</h2>
        <p>Spendly pobiera faktury z KSeF, pilnuje cen dostawców i przelicza food cost dań przy każdej dostawie. Okres testowy bezpłatnie.</p>
        <a class="btn" href="/sign-up">Rozpocznij za darmo</a>
      </div></div>
      <section class="related"><h2>Inne kalkulatory</h2><div class="related-grid">${others
        .map((t) => `<a href="/kalkulatory/${t.slug}"><span class="t">${h.esc(t.h1)}</span><span class="d">${h.esc(t.lead.split(".")[0])}.</span></a>`)
        .join("")}</div></section>
    </main>
${h.footer()}
    <script>${JS_COMMON}
${tool.script}</script>
  </body>
</html>
`;
}

export function renderToolsIndex(h) {
  const url = `${h.SITE}/kalkulatory`;
  return `<!DOCTYPE html>
<html lang="pl" class="light">
  <head>${h.HEAD_COMMON}
    <title>Kalkulatory dla gastronomii — food cost, marża, beverage cost | Spendly</title>
    <meta name="description" content="Darmowe kalkulatory dla restauracji: food cost dania, marża i narzut, beverage cost porcji oraz próg rentowności. Bez rejestracji." />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="${url}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${url}" />
    <meta property="og:title" content="Kalkulatory dla gastronomii | Spendly" />
    <meta property="og:description" content="Darmowe kalkulatory dla restauracji: food cost, marża i narzut, beverage cost, próg rentowności." />
    <meta property="og:image" content="${h.SITE}/blog/og/_index.png" />${h.STYLE.replace("</style>", `${TOOL_STYLE}\n    </style>`)}
  </head>
  <body>
${h.nav()}
    <main>
      <div class="wrap crumbs"><a href="/">Strona główna</a> › Kalkulatory</div>
      <section class="hero">
        <h1>Kalkulatory dla gastronomii</h1>
        <p>Darmowe narzędzia do szybkiego policzenia food costu, marży, kosztu drinka i progu rentowności. Bez rejestracji, wynik od razu.</p>
      </section>
      <section class="tool-cards">${TOOLS.map(
        (t) => `
        <a class="card" href="/kalkulatory/${t.slug}">
          <span class="k">Kalkulator</span>
          <h2>${h.esc(t.h1)}</h2>
          <p>${h.esc(t.description)}</p>
        </a>`,
      ).join("")}
        <a class="card" href="/podglad-faktury-ksef">
          <span class="k">Narzędzie</span>
          <h2>Podgląd faktury KSeF</h2>
          <p>Otwórz fakturę z pliku XML z KSeF, pobierz czytelny PDF i sprawdź, czy nie przepłacasz za produkty. Darmowe konto, bez karty.</p>
        </a>
        <a class="card" href="/ceny-rynkowe">
          <span class="k">Ceny rynkowe</span>
          <h2>Ile za warzywa płacą inne restauracje</h2>
          <p>Mediana cen netto cytryn, pomidorów, schabu i innych produktów z faktur restauracji. Aktualizowana codziennie.</p>
        </a>
      </section>
    </main>
${h.footer()}
  </body>
</html>
`;
}
