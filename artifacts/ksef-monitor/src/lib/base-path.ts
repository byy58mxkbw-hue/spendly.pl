// Współdzielone przez lekki router publiczny (App.tsx) i leniwy app-shell.
// Osobny plik, żeby uniknąć cyklicznego importu App ↔ app-shell.
export const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}
