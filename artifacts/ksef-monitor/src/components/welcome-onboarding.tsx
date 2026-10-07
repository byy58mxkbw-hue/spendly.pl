import { useEffect, useState } from "react";
import { useUser } from "@clerk/react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetWelcomeStatus,
  useMarkWelcomeSeen,
  useGetSubscriptionStatus,
  getGetWelcomeStatusQueryKey,
} from "@workspace/api-client-react";
import {
  Download, LineChart, Bell, Scales, UtensilsCrossed, BarChart3, ScanLine, Bot, Check, ArrowRight,
} from "@/lib/icons";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { readViewerImport } from "@/lib/viewer-import";
import { track } from "@/lib/posthog";

const GAINS = [
  ["Wiesz, kiedy dostawca podnosi cenę", "Alert przychodzi po fakturze, a nie po miesiącu przy zamknięciu ksiąg."],
  ["Znasz prawdziwy koszt każdego dania", "Food cost liczy się z aktualnych cen z faktur, nie z cennika sprzed pół roku."],
  ["Widzisz, gdzie przepłacasz względem rynku", "Twoje ceny na tle anonimowej mediany innych restauracji."],
] as const;

const FEATURES = [
  { Icon: Download, t: "Import z KSeF", s: "Faktury od wszystkich dostawców, także automatycznie, gdy włączysz synchronizację." },
  { Icon: LineChart, t: "Historia cen produktów", s: "Każdy produkt z wykresem ceny u każdego dostawcy." },
  { Icon: Bell, t: "Alerty cenowe", s: "Powiadomienie, gdy cena przekroczy ustalony próg." },
  { Icon: Scales, t: "Porównanie z rynkiem", s: "Twoja cena na tle mediany innych restauracji." },
  { Icon: UtensilsCrossed, t: "Food cost i receptury", s: "Koszt i marża każdego dania z aktualnych cen." },
  { Icon: BarChart3, t: "Raporty i centra kosztów", s: "Wydatki per kategoria, lokal, kuchnia lub bar. Eksport do Excela." },
  { Icon: ScanLine, t: "Skan faktur i paragonów", s: "Zdjęcie albo PDF spoza KSeF zamieniamy na pozycje." },
  { Icon: Bot, t: "AI CFO", s: "Zapytaj po polsku: ile wydałem na nabiał w tym kwartale?" },
] as const;

const LEGACY_KEY = (userId: string) => `spendly_welcome_${userId}`;

/**
 * Powitanie po założeniu konta (ekran 04 specyfikacji podglądu faktury KSeF).
 * Pokazywane RAZ NA KONTO — flaga w user_settings.welcome_seen_at (GET/POST
 * /onboarding/welcome), nie w localStorage, żeby nie wracało na nowym urządzeniu.
 * Dawny klucz localStorage (sprzed 2026-10-07) traktujemy jak „widziane” i dosyłamy
 * na serwer. Kiedy: nowe konto bez danych albo wejście z podglądu XML (?z=podglad).
 * Dostępność: Radix Dialog = role="dialog", aria-modal, pułapka fokusu, Esc, X z etykietą.
 */
export function WelcomeOnboarding({ ready, hasData }: { ready: boolean; hasData: boolean }) {
  const { user } = useUser();
  const qc = useQueryClient();
  const { data: status } = useGetWelcomeStatus();
  const { data: sub } = useGetSubscriptionStatus();
  const markSeen = useMarkWelcomeSeen();
  const [open, setOpen] = useState(false);
  const fromViewer = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("z") === "podglad";
  const viewerImport = fromViewer ? readViewerImport() : null;

  useEffect(() => {
    if (!user || !status || status.seen) return;
    let legacySeen = false;
    try {
      legacySeen = !!localStorage.getItem(LEGACY_KEY(user.id));
    } catch {
      /* tryb prywatny */
    }
    if (legacySeen) {
      markSeen.mutate(undefined, { onSuccess: () => qc.invalidateQueries({ queryKey: getGetWelcomeStatusQueryKey() }) });
      return;
    }
    if (fromViewer || (ready && !hasData)) setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, status, ready, hasData, fromViewer]);

  function close(target?: "benchmark" | "ksef") {
    if (target) track("welcome_cta", { target });
    setOpen(false);
    markSeen.mutate(undefined, { onSuccess: () => qc.invalidateQueries({ queryKey: getGetWelcomeStatusQueryKey() }) });
  }

  const firstName = user?.firstName?.trim();
  const onTrial = sub?.status === "trialing";
  const steps = [
    {
      done: !!viewerImport,
      label: "Zaimportuj pierwszą fakturę",
      meta: viewerImport ? `${viewerImport.invoiceNumber} · ${viewerImport.itemsCount} pozycji` : null,
      href: "/invoices",
      time: "1 min",
    },
    { done: false, label: "Podłącz KSeF — faktury będą spływać same", meta: null, href: "/settings/ksef", time: "2 min" },
    { done: false, label: "Ustaw pierwszy alert cenowy", meta: null, href: "/price-alerts", time: "1 min" },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) close(); }}>
      <DialogContent
        className="max-w-5xl w-[calc(100%-2rem)] max-h-[92dvh] overflow-y-auto p-0 gap-0 border-border [&>button]:text-[#F0E9DB] [&>button]:opacity-80"
        data-testid="welcome-onboarding"
      >
        <div className="px-6 py-8 md:px-11 md:py-10" style={{ background: "#211B12", color: "#F0E9DB" }}>
          <p className="label-caps" style={{ color: "#E06A3C", fontSize: 11, letterSpacing: "0.1em" }}>Konto gotowe</p>
          <DialogTitle className="mt-4 font-bold leading-[1.08] text-[#F0E9DB]" style={{ fontSize: "clamp(1.6rem, 4vw, 2.7rem)", letterSpacing: "-0.02em", maxWidth: 760 }}>
            {firstName ? `Witaj w Spendly, ${firstName}.` : "Witaj w Spendly."} Od dziś wiesz, ile naprawdę kosztują Twoje zakupy.
          </DialogTitle>
          <DialogDescription className="mt-4 text-base leading-relaxed" style={{ color: "#C9BEA9", maxWidth: 720 }}>
            Spendly to kontrola kosztów zakupów dla restauracji. Czytamy Twoje faktury z KSeF, rozpisujemy ceny każdego produktu i pokazujemy, gdzie tracisz pieniądze — zanim zje to marżę.
          </DialogDescription>
        </div>

        <div className="px-6 py-7 md:px-11 md:py-8 bg-card">
          <p className="label-caps text-muted-foreground mb-3">Co zyskujesz</p>
          <div className="grid md:grid-cols-3 gap-px bg-border border border-border">
            {GAINS.map(([h, p], i) => (
              <div key={h} className="bg-card p-5">
                <div className="num font-bold text-3xl text-primary">{String(i + 1).padStart(2, "0")}</div>
                <p className="mt-3 font-semibold leading-snug">{h}</p>
                <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{p}</p>
              </div>
            ))}
          </div>

          <p className="label-caps text-muted-foreground mt-8 mb-1">Co masz w Spendly</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-7">
            {FEATURES.map(({ Icon, t, s }) => (
              <div key={t} className="flex gap-3.5 py-3.5 border-t border-border">
                <div className="w-9 h-9 shrink-0 grid place-items-center bg-primary/10 rounded">
                  <Icon className="w-4 h-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm">{t}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{s}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 grid lg:grid-cols-[1fr_360px] gap-7 items-end">
            <div>
              <p className="label-caps text-muted-foreground mb-1">Twój start</p>
              <ul className="rule-list">
                {steps.map((st) => (
                  <li key={st.label} className="flex items-center gap-3 py-3 border-t border-border last:border-b">
                    <span className={`w-6 h-6 shrink-0 rounded-full grid place-items-center border ${st.done ? "bg-positive border-positive text-white" : "border-border"}`}>
                      {st.done && <Check className="w-3.5 h-3.5" />}
                    </span>
                    <span className={`flex-1 text-sm ${st.done ? "line-through text-muted-foreground" : ""}`}>{st.label}</span>
                    {st.done && st.meta ? (
                      <span className="text-xs font-semibold text-positive num">{st.meta}</span>
                    ) : (
                      <Link href={st.href} onClick={() => close()}>
                        <span className="text-xs font-semibold text-primary cursor-pointer inline-flex items-center gap-1">{st.time} <ArrowRight className="w-3 h-3" /></span>
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col gap-2.5">
              {viewerImport ? (
                <>
                  <Link href={`/benchmark?z=podglad&inv=${viewerImport.invoiceId}`} onClick={() => close("benchmark")}>
                    <Button className="w-full h-11" data-testid="welcome-cta">Zobacz porównanie cen z faktury</Button>
                  </Link>
                  <Link href="/settings/ksef" onClick={() => close("ksef")}>
                    <Button variant="outline" className="w-full h-11">Najpierw podłączę KSeF</Button>
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/settings/ksef" onClick={() => close("ksef")}>
                    <Button className="w-full h-11" data-testid="welcome-cta">Podłącz KSeF</Button>
                  </Link>
                  <Button variant="outline" className="w-full h-11" onClick={() => close()}>Pominę na razie</Button>
                </>
              )}
              {onTrial && (
                <p className="text-xs text-muted-foreground text-center leading-relaxed mt-1">
                  Masz {sub?.daysLeft ?? 30} dni planu Pro za darmo, bez karty. Potem zostajesz na darmowym planie Start.
                </p>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
