// Kanoniczna logika kategoryzacji (lista kategorii, słowa kluczowe, fold diakrytyków,
// silnik dopasowania po granicy słowa) żyje teraz w @workspace/category-rules —
// współdzielona z frontendem ksef-monitor (artifacts/ksef-monitor/src/lib/categories.ts),
// żeby front i backend liczyły kategorię DOKŁADNIE tą samą funkcją. Wcześniej były to
// dwie niezależne kopie: backend miał poprawną granicę słowa, frontend robił goły
// `includes()`, więc UI potrafiło pokazać inną kategorię niż backend faktycznie zapisał.
//
// Ten plik zostaje jako cienki re-eksport, żeby nie trzeba było zmieniać importów
// w categorize-ai.ts, services/backfill-categories.ts i innych miejscach w backendzie.
export * from "@workspace/category-rules";
