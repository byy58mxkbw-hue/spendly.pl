// Loader pokazywany podczas ładowania leniwych tras / app-shella (zamiast pustego
// ekranu). Współdzielony przez App.tsx (Suspense publiczny) i app-shell.tsx.
export function PageLoading() {
  return (
    <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", background: "hsl(var(--background))" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
        <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.045em", color: "hsl(var(--foreground))" }}>
          spend<span style={{ color: "hsl(var(--primary))" }}>ly.</span>
        </span>
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: "50%",
            border: "2.5px solid hsl(var(--muted-foreground) / 0.25)",
            borderTopColor: "hsl(var(--primary))",
            animation: "sp-spin 0.7s linear infinite",
          }}
        />
      </div>
      <style>{`@keyframes sp-spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
