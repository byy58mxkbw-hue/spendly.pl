// Kanoniczna logika kategoryzacji żyje teraz w @workspace/category-rules, współdzielona
// z backendem (artifacts/api-server/src/lib/categorize.ts). Wcześniej ten plik miał
// WŁASNĄ kopię listy kategorii i WŁASNĄ (gorszą — bez granicy słowa) implementację
// categorizeProduct(), więc front potrafił pokazać inną kategorię niż backend
// faktycznie zapisał w bazie (np. "koneser" błędnie łapane jako "ser" tylko na ekranie).
// Ten plik zostaje jako re-eksport, żeby nie trzeba było zmieniać importów w
// pages/products.tsx, pages/reports/*, pages/dashboard.tsx, pages/products/category-management.tsx.
export { CATEGORY_DEFS as CATEGORIES, categorizeProduct } from "@workspace/category-rules";
export type { CategoryDef as Category } from "@workspace/category-rules";
