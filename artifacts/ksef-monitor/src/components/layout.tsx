import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Users,
  Package,
  FileText,
  Bell,
  LogOut,
  BarChart2,
  Inbox,
  Settings,
  Sparkles,
  Menu,
  X,
  ShieldCheck,
} from "lucide-react";
import { useUser, useClerk, useAuth } from "@clerk/react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useListKsefPending, useGetDashboardActiveAlerts } from "@workspace/api-client-react";

type NavItem = { path: string; label: string; icon: React.ElementType };

const coreNavItems: NavItem[] = [
  { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/invoices", label: "Faktury", icon: FileText },
  { path: "/pending-invoices", label: "Do przeglądu", icon: Inbox },
  { path: "/suppliers", label: "Dostawcy", icon: Users },
  { path: "/products", label: "Produkty", icon: Package },
];

const analyticsNavItems: NavItem[] = [
  { path: "/reports", label: "Raporty", icon: BarChart2 },
  { path: "/price-alerts", label: "Alerty cenowe", icon: Bell },
  { path: "/ai-cfo", label: "AI CFO", icon: Sparkles },
];

const navItems: NavItem[] = [...coreNavItems, ...analyticsNavItems];

const bottomNavItems: NavItem[] = [
  { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/invoices", label: "Faktury", icon: FileText },
  { path: "/pending-invoices", label: "Do przeglądu", icon: Inbox },
  { path: "/products", label: "Produkty", icon: Package },
  { path: "/suppliers", label: "Dostawcy", icon: Users },
];

function NavLink({
  path,
  label,
  icon: Icon,
  badgeCount,
  location,
  onNavigate,
}: NavItem & { badgeCount?: number; location: string; onNavigate?: () => void }) {
  const active = location === path || location.startsWith(path + "/");
  const showBadge = (badgeCount ?? 0) > 0;
  return (
    <Link
      href={path}
      onClick={onNavigate}
      data-testid={`nav-${path.replace("/", "").replace("/", "-")}`}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150",
        active
          ? "bg-primary/[0.10] text-primary"
          : "text-sidebar-foreground/60 hover:bg-white/[0.04] hover:text-sidebar-foreground",
      )}
      style={active ? { boxShadow: "0 0 16px rgba(74,222,179,0.06)" } : undefined}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span className="flex-1">{label}</span>
      {showBadge && (
        <span
          className={cn(
            "text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none min-w-[18px] text-center",
            active
              ? "bg-primary/20 text-primary"
              : "bg-destructive/90 text-destructive-foreground",
          )}
        >
          {(badgeCount ?? 0) > 99 ? "99+" : (badgeCount ?? 0) > 9 ? "9+" : badgeCount}
        </span>
      )}
    </Link>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <p className="px-3 pt-5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/30 select-none">
      {label}
    </p>
  );
}

function SidebarContent({
  location,
  onNavigate,
  user,
  onSignOut,
  alertCount,
  pendingCount,
  isAdmin,
}: {
  location: string;
  onNavigate?: () => void;
  user: ReturnType<typeof useUser>["user"];
  onSignOut: () => void;
  alertCount: number;
  pendingCount: number;
  isAdmin: boolean;
}) {
  return (
    <>
      {/* Logo */}
      <div className="px-5 pt-6 pb-5">
        <span className="text-xl tracking-tighter font-black text-primary">
          SPENDLY<span className="text-sidebar-foreground/40">.</span>
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 overflow-y-auto">
        {coreNavItems.map((item) => (
          <NavLink
            key={item.path}
            {...item}
            badgeCount={item.path === "/pending-invoices" ? pendingCount : 0}
            location={location}
            onNavigate={onNavigate}
          />
        ))}

        <SectionLabel label="Analityka" />

        {analyticsNavItems.map((item) => (
          <NavLink
            key={item.path}
            {...item}
            badgeCount={item.path === "/price-alerts" ? alertCount : 0}
            location={location}
            onNavigate={onNavigate}
          />
        ))}

        {isAdmin && (
          <>
            <SectionLabel label="Admin" />
            <NavLink
              path="/admin/users"
              label="Użytkownicy"
              icon={ShieldCheck}
              location={location}
              onNavigate={onNavigate}
            />
          </>
        )}
      </nav>

      {/* Settings */}
      <div className="px-3 pb-2 pt-2">
        <NavLink
          path="/settings/ksef"
          label="Ustawienia KSeF"
          icon={Settings}
          location={location}
          onNavigate={onNavigate}
        />
      </div>

      {/* User */}
      <div
        className="mx-3 mb-4 mt-1 rounded-xl bg-white/[0.03] border border-white/[0.05] p-3"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center gap-3 mb-2.5">
          <div className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center text-sm font-bold ring-1 ring-primary/20">
            {user?.firstName?.[0] ??
              user?.emailAddresses?.[0]?.emailAddress?.[0]?.toUpperCase() ??
              "U"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sidebar-foreground truncate">
              {user?.firstName ??
                user?.emailAddresses?.[0]?.emailAddress ??
                "Użytkownik"}
            </p>
            <p className="text-xs text-sidebar-foreground/40 truncate">
              {user?.emailAddresses?.[0]?.emailAddress}
            </p>
          </div>
        </div>
        <button
          data-testid="btn-logout"
          onClick={onSignOut}
          className="flex items-center gap-2.5 px-2.5 py-2 w-full rounded-lg text-xs text-sidebar-foreground/50 hover:bg-white/[0.05] hover:text-sidebar-foreground/80 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5 shrink-0" />
          Wyloguj się
        </button>
      </div>
    </>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user } = useUser();
  const { signOut } = useClerk();
  const { getToken } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: pendingList } = useListKsefPending({ status: "pending" });
  const pendingCount = pendingList?.length ?? 0;
  const { data: activeAlerts } = useGetDashboardActiveAlerts();
  const alertCount = activeAlerts?.length ?? 0;
  const { data: adminCheck } = useQuery({
    queryKey: ["admin-check"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch("/api/admin/check", {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.ok;
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const isAdmin = adminCheck === true;

  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

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
      <aside
        className="hidden md:flex w-[260px] shrink-0 flex-col border-r"
        style={{
          background: "hsl(var(--sidebar))",
          borderColor: "rgba(255,255,255,0.05)",
        }}
      >
        <SidebarContent
          location={location}
          user={user}
          onSignOut={() => signOut()}
          alertCount={alertCount}
          pendingCount={pendingCount}
          isAdmin={isAdmin}
        />
      </aside>

      {/* Mobile top bar */}
      <header
        className="md:hidden fixed top-0 inset-x-0 z-40 backdrop-blur-xl border-b"
        style={{
          background: "rgba(11,15,20,0.92)",
          borderColor: "rgba(255,255,255,0.06)",
          paddingTop: "env(safe-area-inset-top)",
        }}
      >
        <div className="h-14 px-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Otwórz menu"
            className="p-2.5 -ml-1 rounded-xl text-foreground hover:bg-white/[0.06] active:bg-white/[0.08] transition-colors"
            data-testid="btn-mobile-menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-black tracking-tighter text-primary text-sm shrink-0">
              SPENDLY<span className="text-foreground/30">.</span>
            </span>
            {activeItem && (
              <>
                <span className="text-foreground/20 text-sm shrink-0">/</span>
                <span className="text-sm font-semibold text-foreground/80 truncate">
                  {activeItem.label}
                </span>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 backdrop-blur-sm"
            style={{ background: "rgba(0,0,0,0.7)" }}
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside
            className="absolute left-0 top-0 bottom-0 w-[82%] max-w-[300px] flex flex-col shadow-2xl animate-in slide-in-from-left duration-200"
            style={{
              background: "hsl(var(--sidebar))",
              borderRight: "1px solid rgba(255,255,255,0.05)",
              paddingTop: "env(safe-area-inset-top)",
            }}
          >
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Zamknij menu"
              className="absolute top-4 right-3 p-1.5 rounded-lg text-foreground/40 hover:bg-white/[0.06] z-10 transition-colors"
              style={{ marginTop: "env(safe-area-inset-top)" }}
            >
              <X className="w-4 h-4" />
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
              pendingCount={pendingCount}
              isAdmin={isAdmin}
            />
          </aside>
        </div>
      )}

      {/* Main content */}
      <main
        className="flex-1 min-w-0 overflow-y-auto pt-14 md:pt-0"
        style={{ paddingBottom: "calc(4rem + env(safe-area-inset-bottom))" }}
      >
        {children}
      </main>

      {/* Mobile bottom navigation */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 backdrop-blur-xl border-t"
        style={{
          background: "rgba(11,15,20,0.94)",
          borderColor: "rgba(255,255,255,0.06)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
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
                  "flex-1 flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-semibold transition-colors relative",
                  active ? "text-primary" : "text-foreground/35",
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
                <span className="truncate max-w-[56px] text-center leading-tight">
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
    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 md:gap-6 mb-8 md:mb-10">
      <div className="min-w-0">
        <h1 className="text-2xl md:text-[2rem] font-bold text-foreground tracking-[-0.03em] leading-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-muted-foreground mt-1.5">{subtitle}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
