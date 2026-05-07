import { Link } from "wouter";
import { TrendingDown, ShieldCheck, FileBarChart2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/logo.svg" alt="CennikPro" className="w-8 h-8 rounded-lg" />
            <span className="font-semibold text-foreground text-lg tracking-tight">CennikPro</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/sign-in">
              <Button variant="ghost" size="sm" data-testid="btn-signin">Zaloguj</Button>
            </Link>
            <Link href="/sign-up">
              <Button size="sm" data-testid="btn-signup">Zacznij za darmo</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 py-24 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-6">
          <ShieldCheck className="w-3.5 h-3.5" />
          Integracja z KSeF
        </div>
        <h1 className="text-5xl font-bold text-foreground tracking-tight mb-5 leading-tight">
          Monitoruj ceny surowców<br />
          <span className="text-primary">z faktur KSeF</span>
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
          Automatycznie importuj faktury od swoich stałych dostawców, śledź zmiany cen
          składników i reaguj na podwyżki zanim uderzą w Twój food cost.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link href="/sign-up">
            <Button size="lg" className="gap-2" data-testid="btn-cta-signup">
              Zacznij bezpłatnie <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
          <Link href="/sign-in">
            <Button size="lg" variant="outline" data-testid="btn-cta-signin">Zaloguj się</Button>
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              icon: FileBarChart2,
              title: "Import faktur XML",
              desc: "Importuj faktury bezpośrednio z systemu KSeF. Parser automatycznie wyodrębnia pozycje i ceny.",
            },
            {
              icon: TrendingDown,
              title: "Historia cen",
              desc: "Śledź zmiany cen każdego składnika w czasie. Wykresy pokazują trendy i anomalie.",
            },
            {
              icon: ShieldCheck,
              title: "Alerty cenowe",
              desc: "Ustaw progi dla ważnych produktów i otrzymuj powiadomienia gdy cena wzrośnie powyżej normy.",
            },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="bg-card border border-border rounded-xl p-6">
              <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-4">
                <Icon className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">{title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border mt-16">
        <div className="max-w-6xl mx-auto px-6 py-8 text-center text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} CennikPro &mdash; narzędzie do monitorowania food cost
        </div>
      </footer>
    </div>
  );
}
