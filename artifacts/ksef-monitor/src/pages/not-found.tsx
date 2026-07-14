import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Home, LayoutDashboard } from "lucide-react";

export default function NotFound() {
  return (
    <main className="min-h-[100dvh] w-full flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md text-center">
        <p className="text-7xl font-bold text-muted-foreground/30 mb-6">404</p>
        <h1 className="text-2xl font-bold mb-3">Nie znaleziono strony</h1>
        <p className="text-muted-foreground mb-8">
          Strona, której szukasz, nie istnieje lub została przeniesiona.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild>
            <Link href="/dashboard">
              <LayoutDashboard className="w-4 h-4" />
              Wróć do dashboardu
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/">
              <Home className="w-4 h-4" />
              Strona główna
            </Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
