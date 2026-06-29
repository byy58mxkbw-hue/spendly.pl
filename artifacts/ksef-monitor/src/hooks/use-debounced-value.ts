import { useEffect, useState } from "react";

/**
 * Zwraca wartość opóźnioną o `delayMs` od ostatniej zmiany `value`.
 * Używane do wyszukiwarek/filtrów, żeby nie filtrować przy każdym znaku.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}
