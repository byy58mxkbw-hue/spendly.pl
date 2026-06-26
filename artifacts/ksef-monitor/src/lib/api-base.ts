/**
 * Resolves a full API URL for raw `fetch` calls that bypass the generated
 * Orval client (e.g. SSE streaming, admin checks).
 *
 * The Orval client prepends `VITE_API_BASE_URL` via `setBaseUrl` in App.tsx,
 * so those calls hit the right backend in production. Hand-written `fetch`
 * calls don't go through that layer, so without this helper they resolve
 * against the frontend's own origin — which in production is a different
 * domain than the API server, causing the request to hit the static-site
 * server instead of the backend.
 *
 * `path` must already include the `/api` prefix (matching the Orval route
 * convention, e.g. "/api/ksef/sync"). When `VITE_API_BASE_URL` is unset
 * (local dev) the path is returned unchanged so the Vite dev proxy handles it.
 */
export function apiUrl(path: string): string {
  const base = import.meta.env.VITE_API_BASE_URL;
  if (!base || base === "/api") return path;
  // Trim trailing slashes so we don't emit a double slash before the path.
  return `${base.replace(/\/+$/, "")}${path}`;
}
