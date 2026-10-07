// Wspólne parsery faktur KSeF (regexowe, bez DOM — XXE-safe, reguła 23).
// Jedno źródło prawdy dla API (import ręczny + synchronizacja KSeF) i frontu
// (publiczny podgląd faktury XML parsowany w przeglądarce, bez wysyłania pliku).
export * from "./errors";
export * from "./fa3";
export * from "./import-parse";
