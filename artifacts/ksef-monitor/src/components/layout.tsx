import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Users,
  Package,
  FileText,
  Bell,
  LogOut,
  ChevronRight,
  BarChart2,
  Inbox,
  Settings,
  Sparkles,
  Menu,
  X,
  ShieldCheck,
} from "lucide-react";
import { useUser, useClerk } from "@clerk/react";
import { cn } from "@/lib/utils";
import { useListKsefPending, useGetDashboardActiveAlerts } from "@workspace/api-client-react";

const navItems = [
  { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/suppliers", label: "Dostawcy", icon: Users },
  { path: "/products", label: "Produkty", icon: Package },
  { path: "/invoices", label: "Faktury", icon: FileText },
  { path: "/pending-invoices", label: "Do przeglądu", icon: Inbox },
  { path: "/price-alerts", label: "Alerty cenowe", icon: Bell },
  { path: "/reports", label: "Raporty", icon: BarChart2 },
  { path: "/ai-cfo", label: "AI CFO", icon: Sparkles },
  { path: "/settings/ksef", label: "Ustawienia KSeF", icon: Settings },
  { path: "/admin/users", label: "Użytkownicy", icon: ShieldCheck },
];

const bottomNavItems = [
  { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/invoices", label: "Faktury", icon: FileText },
  { path: "/pending-invoices", label: "Do przeglądu", icon: Inbox },
  { path: "/products", label: "Produkty", icon: Package },
  { path: "/suppliers", label: "Dostawcy", icon: Users },
];

function SidebarContent({
  location,
  onNavigate,
  user,
  onSignOut,
  alertCount,
}: {
  location: string;
  onNavigate?: () => void;
  user: ReturnType<typeof useUser>["user"];
  onSignOut: () => void;
  alertCount: number;
}) {
  return (
    <>
      <div className="px-5 py-5 border-b border-border">
        <div className="flex items-center gap-2.5">
          <img src="/logo.svg" alt="CheckIT" className="w-8 h-8 rounded-lg" />
          <span className="text-foreground text-lg tracking-tight font-extrabold">CheckIT</span>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map(({ path, label, icon: Icon }) => {
          const active = location === path || location.startsWith(path + "/");
          const isAlerts = path === "/price-alerts";
          const showBadge = isAlerts && alertCount > 0;
          return (
            <Link
              key={path}
              href={path}
              onClick={onNavigate}
              data-testid={`nav-${path.replace("/", "")}`}
              className={cn(
                "flex items-center gap-3 px-3 py-3.5 md:py-2.5 rounded-lg text-base md:text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground/80 hover:bg-secondary hover:text-foreground active:bg-secondary",
              )}
            >
              <Icon className="w-5 h-5 md:w-4 md:h-4 shrink-0" />
              {label}
              {showBadge && (
                <span className={cn(
                  "ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none min-w-[18px] text-center",
                  active
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-destructive text-destructive-foreground"
                )}>
                  {alertCount > 9 ? "9+" : alertCount}
                </span>
              )}
              {active && !showBadge && <ChevronRight className="w-3 h-3 ml-auto opacity-60" />}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-border" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
        <div className="flex items-center gap-3 px-3 py-2 mb-1">
          <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold">
            {user?.firstName?.[0] ?? user?.emailAddresses?.[0]?.emailAddress?.[0]?.toUpperCase() ?? "U"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {user?.firstName ?? user?.emailAddresses?.[0]?.emailAddress ?? "Użytkownik"}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {user?.emailAddresses?.[0]?.emailAddress}
            </p>
          </div>
        </div>
        <button
          data-testid="btn-logout"
          onClick={onSignOut}
          className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-sm text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Wyloguj
        </button>
      </div>
    </>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user } = useUser();
  const { signOut } = useClerk();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: pendingList } = useListKsefPending({ status: "pending" });
  const pendingCount = pendingList?.length ?? 0;
  const { data: activeAlerts } = useGetDashboardActiveAlerts();
  const alertCount = activeAlerts?.length ?? 0;

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  // Lock body scroll while drawer is open
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  const activeItem = navItems.find(
    (n) => location === n.path || location.startsWith(n.path + "/"),
  );

  return (
    <div className="min-h-screen flex bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 bg-card border-r border-border flex-col">
        <SidebarContent
          location={location}
          user={user}
          onSignOut={() => signOut()}
          alertCount={alertCount}
        />
      </aside>
      {/* Mobile top bar */}
      <header
        className="md:hidden fixed top-0 inset-x-0 z-40 bg-card/95 backdrop-blur border-b border-border"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="h-14 px-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Otwórz menu"
            className="p-2.5 -ml-1 rounded-lg text-foreground hover:bg-secondary active:bg-secondary"
            data-testid="btn-mobile-menu"
          >
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <img src="/logo.svg" alt="CheckIT" className="w-7 h-7 rounded-lg shrink-0" />
            <span className="text-base font-extrabold tracking-tight text-foreground truncate">
              {activeItem?.label ?? "CheckIT"}
            </span>
          </div>
        </div>
      </header>
      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside
            className="absolute left-0 top-0 bottom-0 w-[82%] max-w-[320px] bg-card border-r border-border flex flex-col shadow-xl animate-in slide-in-from-left duration-200"
            style={{ paddingTop: "env(safe-area-inset-top)" }}
          >
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Zamknij menu"
              className="absolute top-2 right-2 p-2 rounded-lg text-muted-foreground hover:bg-secondary z-10"
              style={{ marginTop: "env(safe-area-inset-top)" }}
            >
              <X className="w-5 h-5" />
            </button>
            <SidebarContent
              location={location}
              onNavigate={() => setMobileOpen(false)}
              user={user}
              onSignOut={() => {
                setMobileOpen(false);
                signOut();
              }}
              alertCount={alertCount}
            />
          </aside>
        </div>
      )}
      {/* Main content */}
      <main
        className="flex-1 min-w-0 overflow-y-auto pt-14 md:pt-0 pb-16 md:pb-0"
        style={{ paddingBottom: "calc(4rem + env(safe-area-inset-bottom))" }}
      >
        {children}
      </main>
      {/* Mobile bottom navigation */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-card/95 backdrop-blur border-t border-border"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex">
          {bottomNavItems.map(({ path, label, icon: Icon }) => {
            const active = location === path || location.startsWith(path + "/");
            const isPending = path === "/pending-invoices";
            return (
              <Link
                key={path}
                href={path}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-medium transition-colors relative",
                  active ? "text-primary" : "text-muted-foreground"
                )}
                aria-label={label}
              >
                <div className="relative">
                  <Icon className={cn("w-5 h-5", active && "stroke-[2.5]")} />
                  {isPending && pendingCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center leading-none">
                      {pendingCount > 9 ? "9+" : pendingCount}
                    </span>
                  )}
                </div>
                <span className="truncate max-w-[56px] text-center leading-tight font-extrabold">
                  {label === "Do przeglądu" ? "Przegląd" : label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 md:gap-4 mb-6 md:mb-8">
      <div className="min-w-0">
        <h1 className="text-xl md:text-2xl font-semibold text-foreground tracking-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
        )}
      </div>
      {action && (
        <div className="shrink-0">
          {action}
        </div>
      )}
    </div>
  );
}
