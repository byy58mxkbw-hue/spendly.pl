import { useEffect, useState } from "react";
import { useUser } from "@clerk/react";
import { Link } from "wouter";
import { RefreshCw, FileText, Bell, ArrowRight, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const STEPS = [
  {
    icon: RefreshCw,
    title: "Połącz KSeF",
    desc: "Wpisz NIP i token, a Spendly sam pobierze faktury zakupowe. Możesz też dodać fakturę ręcznie albo ze zdjęcia.",
    href: "/settings/ksef",
    cta: "Skonfiguruj KSeF",
  },
  {
    icon: FileText,
    title: "Zaimportuj pierwszą fakturę",
    desc: "Każda pozycja trafia do bazy — od razu widzisz ceny surowców, dostawców i historię zmian.",
    href: "/invoices",
    cta: "Przejdź do faktur",
  },
  {
    icon: Bell,
    title: "Ustaw alerty cenowe",
    desc: "Wybierz progi dla kluczowych składników. Damy Ci znać, zanim podwyżka uderzy w marżę.",
    href: "/price-alerts",
    cta: "Ustaw alerty",
  },
] as const;

/**
 * Powitalny samouczek pokazywany RAZ przy pierwszej wizycie nowego użytkownika
 * (brak konfiguracji KSeF i brak danych). Dismiss zapisywany w localStorage per userId,
 * więc nie wraca przy kolejnych wejściach ani na innym koncie w tej samej przeglądarce.
 */
export function WelcomeOnboarding({ ready, hasData }: { ready: boolean; hasData: boolean }) {
  const { user } = useUser();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!ready || hasData || !user) return;
    const key = `spendly_welcome_${user.id}`;
    try {
      if (localStorage.getItem(key)) return;
    } catch {
      // localStorage niedostępny (tryb prywatny) — pokaż i tak, nie blokuj.
    }
    setOpen(true);
  }, [ready, hasData, user]);

  function dismiss() {
    if (user) {
      try {
        localStorage.setItem(`spendly_welcome_${user.id}`, "1");
      } catch {
        // ignore
      }
    }
    setOpen(false);
  }

  const firstName = user?.firstName?.trim();

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) dismiss(); }}>
      <DialogContent className="max-w-lg" data-testid="welcome-onboarding">
        <DialogHeader>
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-1">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <DialogTitle className="text-xl">
            {firstName ? `Witaj w Spendly, ${firstName}!` : "Witaj w Spendly!"}
          </DialogTitle>
          <p className="text-sm text-muted-foreground pt-1">
            Trzymaj koszty restauracji pod kontrolą. Oto trzy kroki, żeby zacząć — zajmą kilka minut.
          </p>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <div key={i} className="flex items-start gap-3 rounded-xl border border-border p-3">
                <div className="relative shrink-0">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                  <span className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[11px] font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{step.title}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{step.desc}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-between sm:items-center pt-1">
          <button
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 self-center sm:self-auto"
            onClick={dismiss}
          >
            Pominę na razie
          </button>
          <Link href={STEPS[0].href}>
            <Button className="w-full sm:w-auto gap-2" onClick={dismiss} data-testid="welcome-cta">
              {STEPS[0].cta}
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
