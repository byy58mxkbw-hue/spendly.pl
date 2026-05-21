import { Link } from "wouter";
import { TrendingDown, ShieldCheck, FileBarChart2, ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="border-b border-border bg-background/90 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/logo.svg" alt="CheckIT" className="w-8 h-8 rounded-lg" />
            <span className="font-semibold text-foreground text-lg tracking-tight">CheckIT</span>
          </div>
          <div className="flex items-center gap-2">
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
      <section className="max-w-5xl mx-auto px-6 pt-28 pb-20 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-secondary text-xs font-medium text-muted-foreground mb-8">
          <ShieldCheck className="w-3.5 h-3.5 text-primary" />
          Integracja z KSeF
        </div>
        <h1 className="text-5xl font-bold text-foreground tracking-tight mb-5 leading-[1.1]">
          Kontroluj food cost<br />
          <span className="text-primary">zanim wzrośnie</span>
        </h1>
        <p className="text-lg text-muted-foreground max-w-xl mx-auto mb-10 leading-relaxed">
          Importuj faktury z KSeF, śledź zmiany cen surowców i reaguj na podwyżki
          od dostawców w jednym miejscu.
        </p>
        <div className="flex items-center justify-center gap-3">
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
      <section className="max-w-5xl mx-auto px-6 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              icon: FileBarChart2,
              title: "Import faktur XML",
              desc: "Faktury pobierane automatycznie z KSeF. Parser wyodrębnia pozycje i ceny bez ręcznego wpisywania.",
            },
            {
              icon: TrendingDown,
              title: "Historia cen",
              desc: "Wykresy trendów dla każdego składnika. Widzisz od razu kiedy i o ile zmieniła się cena.",
            },
            {
              icon: ShieldCheck,
              title: "Alerty cenowe",
              desc: "Ustaw progi dla kluczowych produktów i dowiedz się gdy cena przekroczy normę.",
            },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="border border-border rounded-xl p-6 bg-card">
              <div className="w-9 h-9 rounded-lg bg-primary/8 text-primary flex items-center justify-center mb-4">
                <Icon className="w-4.5 h-4.5" />
              </div>
              <h3 className="font-semibold text-foreground mb-1.5">{title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Social proof strip */}
      <section className="border-t border-border bg-secondary/40">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
            {[
              "Faktury z KSeF w sekundy",
              "Historia cen każdego surowca",
              "Alerty o podwyżkach",
              "Raporty miesięczne",
            ].map((item) => (
              <div key={item} className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="max-w-5xl mx-auto px-6 py-6 text-center text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} CheckIT &mdash; monitoring cen surowców dla restauracji
        </div>
      </footer>
    </div>
  );
}
