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
  Menu,
  X,
  ShieldCheck,
  BarChart3,
  Layers,
  ChevronDown,
  Check,
  Plus,
  UtensilsCrossed,
  Search,
  Sun,
  Moon,
} from "lucide-react";
import { useUser, useClerk, useAuth } from "@clerk/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { apiUrl } from "@/lib/api-base";
import { useListKsefPending, useGetDashboardActiveAlerts, useCreateCostCenter, getListCostCentersQueryKey, useGlobalSearch, getGlobalSearchQueryKey } from "@workspace/api-client-react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useCostCenter } from "@/contexts/cost-center-context";
import { AiAssistant } from "@/components/ai-assistant";
import { useTheme } from "@/hooks/use-theme";

type NavItem = { path: string; label: string; icon: React.ElementType };

const coreNavItems: NavItem[] = [
  { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/invoices", label: "Faktury", icon: FileText },
  { path: "/pending-invoices", label: "Do przeglądu", icon: Inbox },
  { path: "/suppliers", label: "Dostawcy", icon: Users },
  { path: "/products", label: "Produkty", icon: Package },
];

const analyticsNavItems: NavItem[] = [
  { path: "/koszty-dania", label: "Food Cost", icon: UtensilsCrossed },
  { path: "/reports", label: "Raporty", icon: BarChart2 },
  { path: "/price-alerts", label: "Alerty cenowe", icon: Bell },
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
          : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground",
      )}
      style={active ? { boxShadow: "0 0 16px rgba(61,220,151,0.08)" } : undefined}
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

// ─── Cost Center Onboarding Modal ─────────────────────────────────────────────
const CC_ONBOARDING_KEY = "cc-onboarding-v1-dismissed";
const ONBOARDING_PRESETS = [
  { name: "Restauracja", color: "#14B8A6" },
  { name: "Bar", color: "#6366F1" },
  { name: "Catering", color: "#F59E0B" },
  { name: "Ogródek", color: "#22C55E" },
  { name: "Kuchnia", color: "#EF4444" },
  { name: "Dostawa", color: "#8B5CF6" },
];

function CostCenterOnboardingModal({ userSignedIn }: { userSignedIn: boolean }) {
  const { costCenters, isLoading } = useCostCenter();
  const create = useCreateCostCenter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [dismissed, setDismissed] = useState(
    () => typeof localStorage !== "undefined" && !!localStorage.getItem(CC_ONBOARDING_KEY),
  );
  const [step, setStep] = useState<"question" | "pick">("question");
  const [creating, setCreating] = useState<string | null>(null);
  const [addedNames, setAddedNames] = useState<string[]>([]);
  // flowStarted: set once when we confirm 0 centers; keeps modal open
  // while user adds 2-3 centers even though costCenters.length grows
  const [flowStarted, setFlowStarted] = useState(false);

  useEffect(() => {
    if (!isLoading && userSignedIn && !dismissed && costCenters.length === 0 && !flowStarted) {
      setFlowStarted(true);
    }
  }, [isLoading, userSignedIn, dismissed, costCenters.length, flowStarted]);

  const open = flowStarted && !dismissed;

  function dismiss() {
    localStorage.setItem(CC_ONBOARDING_KEY, "1");
    setDismissed(true);
    setFlowStarted(false);
  }

  function handlePreset(name: string, color: string) {
    setCreating(name);
    create.mutate(
      { data: { name, color } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCostCentersQueryKey() });
          setAddedNames((prev) => [...prev, name]);
          setCreating(null);
          toast({ title: `Centrum "${name}" dodane` });
        },
        onSettled: () => setCreating(null),
      },
    );
  }

  const remainingPresets = ONBOARDING_PRESETS.filter((p) => !addedNames.includes(p.name));
  const canAddMore = remainingPresets.length > 0 && addedNames.length < 3;

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) dismiss(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Centra kosztów</DialogTitle>
          <DialogDescription>
            {step === "question"
              ? "Czy prowadzisz więcej niż jeden punkt sprzedaży lub rodzaj działalności?"
              : addedNames.length === 0
                ? "Wybierz 2–3 centra kosztów dla swojej restauracji."
                : addedNames.length < 2
                  ? "Dodaj jeszcze jedno lub dwa centra dla pełnej analizy kosztów."
                  : "Świetnie! Możesz dodać jeszcze jedno lub zakończyć."}
          </DialogDescription>
        </DialogHeader>

        {step === "question" && (
          <div className="flex flex-col gap-3 pt-2">
            <button
              onClick={() => setStep("pick")}
              className="w-full px-4 py-3 rounded-xl border border-border text-left hover:border-primary/50 hover:bg-primary/5 transition-colors"
            >
              <p className="font-medium text-foreground text-sm">Tak, kilka punktów</p>
              <p className="text-xs text-muted-foreground mt-0.5">Skonfiguruj centra kosztów dla każdego punktu</p>
            </button>
            <button
              onClick={dismiss}
              className="w-full px-4 py-3 rounded-xl border border-border text-left hover:border-border/70 hover:bg-muted/30 transition-colors"
            >
              <p className="font-medium text-foreground text-sm">Nie, jeden punkt</p>
              <p className="text-xs text-muted-foreground mt-0.5">Pomiń konfigurację centrów kosztów</p>
            </button>
          </div>
        )}

        {step === "pick" && (
          <div className="pt-2 space-y-4">
            {/* Added centers */}
            {addedNames.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Dodane ({addedNames.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {addedNames.map((name) => {
                    const preset = ONBOARDING_PRESETS.find((p) => p.name === name);
                    return (
                      <span
                        key={name}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-xs font-medium"
                      >
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: preset?.color ?? "#14B8A6" }} />
                        {name}
                        <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="2,6 5,9 10,3" />
                        </svg>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Remaining presets */}
            {canAddMore && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  {addedNames.length === 0 ? "Wybierz centra" : "Dodaj kolejne"}
                </p>
                <div className="flex flex-wrap gap-2">
                  {remainingPresets.map((p) => (
                    <button
                      key={p.name}
                      onClick={() => handlePreset(p.name, p.color)}
                      disabled={creating !== null}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm font-medium hover:border-primary/50 hover:bg-primary/5 transition-colors disabled:opacity-50"
                    >
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.color }} />
                      {creating === p.name ? "Dodawanie..." : p.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-1 border-t border-border">
              {addedNames.length > 0 ? (
                <button
                  onClick={dismiss}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
                  style={{ background: "#14b8a6" }}
                >
                  Zakończ konfigurację
                </button>
              ) : (
                <button onClick={dismiss} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Pomiń na razie
                </button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Cost Center Selector ──────────────────────────────────────────────────────
function CostCenterSelector({ compact = false }: { compact?: boolean }) {
  const { selectedId, setSelectedId, costCenters, selectedCenter } = useCostCenter();
  const [open, setOpen] = useState(false);

  if (costCenters.length === 0) return null;

  return (
    <div className={cn("relative", compact ? "shrink-0 max-w-[42vw]" : "px-3 mb-1")}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150",
          "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
          open && "bg-sidebar-accent",
        )}
      >
        <div
          className="w-3 h-3 rounded-full shrink-0"
          style={{ background: selectedCenter?.color ?? "hsl(var(--muted-foreground))" }}
        />
        <span className="flex-1 text-left truncate text-xs">
          {selectedCenter ? selectedCenter.name : compact ? "Wszystkie" : "Wszystkie centra"}
        </span>
        <ChevronDown className={cn("w-3.5 h-3.5 shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div
          className={cn(
            "absolute top-full mt-1 rounded-xl overflow-hidden shadow-2xl z-50",
            compact ? "right-0 w-60 max-w-[80vw]" : "left-3 right-3",
          )}
          style={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--popover-border))" }}
        >
          {/* All centers option */}
          <button
            onClick={() => { setSelectedId(null); setOpen(false); }}
            className={cn(
              "w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors",
              selectedId === null
                ? "text-primary bg-primary/[0.08]"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
            )}
          >
            <div className="w-3 h-3 rounded-full shrink-0" style={{ background: "hsl(var(--muted-foreground))" }} />
            <span className="flex-1 text-left">Wszystkie centra</span>
            {selectedId === null && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
          </button>
          {/* Individual centers */}
          {costCenters.map((c) => (
            <button
              key={c.id}
              onClick={() => { setSelectedId(c.id); setOpen(false); }}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors",
                selectedId === c.id
                  ? "text-primary bg-primary/[0.08]"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
              )}
            >
              <div className="w-3 h-3 rounded-full shrink-0" style={{ background: c.color }} />
              <span className="flex-1 text-left truncate">{c.name}</span>
              {selectedId === c.id && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
            </button>
          ))}
          {/* Link to manage */}
          <div style={{ borderTop: "1px solid hsl(var(--sidebar-border))" }}>
            <Link
              href="/settings/cost-centers"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2.5 text-xs text-sidebar-foreground/40 hover:text-sidebar-foreground/70 transition-colors"
            >
              <Plus className="w-3 h-3" />
              Zarządzaj centrami
            </Link>
          </div>
        </div>
      )}
    </div>
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
  onOpenSearch,
}: {
  location: string;
  onNavigate?: () => void;
  user: ReturnType<typeof useUser>["user"];
  onSignOut: () => void;
  alertCount: number;
  pendingCount: number;
  isAdmin: boolean;
  onOpenSearch?: () => void;
}) {
  const { theme, toggle } = useTheme();
  return (
    <>
      {/* Logo */}
      <div className="px-5 pt-6 pb-3">
        <span className="text-xl font-black" style={{ letterSpacing: "-0.045em" }}>
          <span className="text-sidebar-foreground">spend</span><span className="text-primary">ly.</span>
        </span>
      </div>

      {/* Search trigger */}
      {onOpenSearch && (
        <div className="px-3 pb-2">
          <button
            onClick={() => { onOpenSearch(); onNavigate?.(); }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-sidebar-foreground/50 bg-sidebar-accent/40 hover:bg-sidebar-accent transition-colors"
          >
            <Search className="w-4 h-4" />
            <span className="flex-1 text-left">Szukaj…</span>
            <kbd className="hidden md:inline text-[10px] font-mono px-1.5 py-0.5 rounded bg-sidebar-foreground/10 text-sidebar-foreground/50">⌘K</kbd>
          </button>
        </div>
      )}

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
            <NavLink
              path="/admin/analytics"
              label="Analityka"
              icon={BarChart3}
              location={location}
              onNavigate={onNavigate}
            />
          </>
        )}
      </nav>

      {/* Settings */}
      <div className="px-3 pb-1 pt-2">
        <NavLink
          path="/settings/cost-centers"
          label="Centra kosztów"
          icon={Layers}
          location={location}
          onNavigate={onNavigate}
        />
        <NavLink
          path="/settings/ksef"
          label="Ustawienia KSeF"
          icon={Settings}
          location={location}
          onNavigate={onNavigate}
        />
      </div>

      {/* Cost Center Selector */}
      <CostCenterSelector />

      {/* User */}
      <div
        className="mx-3 mb-4 mt-1 rounded-xl bg-sidebar-accent/40 border border-sidebar-border p-3"
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
        {/* Przełącznik motywu — podpisany, pełna szerokość, żeby był widoczny */}
        <button
          onClick={toggle}
          aria-label={theme === "light" ? "Włącz tryb ciemny" : "Włącz tryb jasny"}
          className="w-full flex items-center gap-2.5 px-2.5 py-2 mb-1 rounded-lg text-xs text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground/80 transition-colors"
        >
          {theme === "light" ? <Moon className="w-3.5 h-3.5 shrink-0" /> : <Sun className="w-3.5 h-3.5 shrink-0" />}
          <span className="flex-1 text-left">{theme === "light" ? "Tryb ciemny" : "Tryb jasny"}</span>
        </button>
        <button
          data-testid="btn-logout"
          onClick={onSignOut}
          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground/80 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5 shrink-0" />
          Wyloguj się
        </button>
      </div>
    </>
  );
}

function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open, onOpenChange]);

  // Wyszukiwanie po stronie serwera (dostawcy + produkty + faktury) z debounce.
  // Nie ładujemy już wszystkich produktów do przeglądarki.
  const debounced = useDebouncedValue(search.trim(), 250);
  const { data: results, isFetching } = useGlobalSearch(
    { q: debounced },
    { query: { queryKey: getGlobalSearchQueryKey({ q: debounced }), enabled: open && debounced.length >= 2 } },
  );

  const supplierMatches = results?.suppliers ?? [];
  const productMatches = results?.products ?? [];
  const invoiceMatches = results?.invoices ?? [];

  const go = (path: string) => { onOpenChange(false); setSearch(""); navigate(path); };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Szukaj stron, produktów, dostawców, faktur…"
        value={search}
        onValueChange={setSearch}
      />
      {/* shouldFilter=false: filtrowanie robi serwer, cmdk nie ma chować wyników */}
      <CommandList>
        <CommandEmpty>
          {debounced.length < 2
            ? "Wpisz min. 2 znaki…"
            : isFetching
              ? "Szukam…"
              : "Brak wyników."}
        </CommandEmpty>
        <CommandGroup heading="Nawigacja">
          {navItems
            .filter((item) => !debounced || item.label.toLowerCase().includes(debounced.toLowerCase()))
            .map((item) => (
              <CommandItem key={item.path} value={`nav ${item.label}`} onSelect={() => go(item.path)}>
                <item.icon className="mr-2 h-4 w-4" />
                {item.label}
              </CommandItem>
            ))}
        </CommandGroup>
        {supplierMatches.length > 0 && (
          <CommandGroup heading="Dostawcy">
            {supplierMatches.map((s) => (
              <CommandItem key={`s-${s.id}`} value={`supplier-${s.id}`} onSelect={() => go(`/suppliers/${s.id}`)}>
                <Users className="mr-2 h-4 w-4" />
                <span className="truncate">{s.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {productMatches.length > 0 && (
          <CommandGroup heading="Produkty">
            {productMatches.map((p) => (
              <CommandItem key={`p-${p.id}`} value={`product-${p.id}`} onSelect={() => go(`/products?id=${p.id}`)}>
                <Package className="mr-2 h-4 w-4" />
                <span className="truncate">{p.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {invoiceMatches.length > 0 && (
          <CommandGroup heading="Faktury">
            {invoiceMatches.map((i) => (
              <CommandItem key={`i-${i.id}`} value={`invoice-${i.id}`} onSelect={() => go(`/invoices?id=${i.id}`)}>
                <FileText className="mr-2 h-4 w-4" />
                <span className="truncate">{i.invoiceNumber}</span>
                {i.supplierName && <span className="ml-2 truncate text-xs text-muted-foreground">{i.supplierName}</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { theme, toggle } = useTheme();
  const [cmdOpen, setCmdOpen] = useState(false);
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
      const res = await fetch(apiUrl("/api/admin/check"), {
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
    <div className="min-h-screen flex bg-background relative">
      {/* Aurora — subtelne poświaty tła, spójne z landingiem */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute rounded-full" style={{ width: 620, height: 620, left: -180, top: -240, background: "radial-gradient(circle at 30% 30%, var(--au1), transparent 70%)", filter: "blur(110px)", opacity: "var(--au-alpha)" }} />
        <div className="absolute rounded-full" style={{ width: 640, height: 640, right: -240, top: -140, background: "radial-gradient(circle at 60% 40%, var(--au2), transparent 70%)", filter: "blur(110px)", opacity: "var(--au-alpha)" }} />
        <div className="absolute rounded-full" style={{ width: 560, height: 560, left: "42%", top: 620, background: "radial-gradient(circle at 50% 50%, var(--au3), transparent 70%)", filter: "blur(110px)", opacity: "var(--au-alpha)" }} />
      </div>

      {/* Desktop sidebar */}
      <aside
        className="hidden md:flex w-[260px] shrink-0 flex-col border-r relative z-10 backdrop-blur-xl"
        style={{
          background: "hsl(var(--sidebar) / 0.72)",
          borderColor: "hsl(var(--sidebar-border))",
        }}
      >
        <SidebarContent
          location={location}
          user={user}
          onSignOut={() => signOut()}
          alertCount={alertCount}
          pendingCount={pendingCount}
          isAdmin={isAdmin}
          onOpenSearch={() => setCmdOpen(true)}
        />
      </aside>

      {/* Mobile top bar */}
      <header
        className="md:hidden fixed top-0 inset-x-0 z-40 backdrop-blur-xl border-b border-border bg-background/90"
        style={{
          paddingTop: "env(safe-area-inset-top)",
        }}
      >
        <div className="h-14 px-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Otwórz menu"
            className="p-2.5 -ml-1 rounded-xl text-foreground hover:bg-secondary active:bg-muted transition-colors"
            data-testid="btn-mobile-menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="font-black text-sm shrink-0" style={{ letterSpacing: "-0.045em" }}>
              <span className="text-foreground">spend</span><span className="text-primary">ly.</span>
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
          <button
            type="button"
            onClick={toggle}
            aria-label={theme === "light" ? "Włącz tryb ciemny" : "Włącz tryb jasny"}
            className="p-2 rounded-xl text-foreground/70 hover:bg-secondary transition-colors shrink-0"
          >
            {theme === "light" ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
          </button>
          <CostCenterSelector compact />
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
              borderRight: "1px solid hsl(var(--sidebar-border))",
              paddingTop: "env(safe-area-inset-top)",
            }}
          >
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Zamknij menu"
              className="absolute top-4 right-3 p-1.5 rounded-lg text-foreground/40 hover:bg-secondary z-10 transition-colors"
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
              onOpenSearch={() => setCmdOpen(true)}
            />
          </aside>
        </div>
      )}

      {/* Main content */}
      <main
        className="flex-1 min-w-0 overflow-y-auto pt-14 md:pt-0 relative z-10"
        style={{ paddingBottom: "calc(4rem + env(safe-area-inset-bottom))" }}
      >
        {children}
      </main>

      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />

      <CostCenterOnboardingModal userSignedIn={!!user} />

      {/* Rozwijany czat-asystent AI — dostępny na każdej stronie aplikacji */}
      <AiAssistant />

      {/* Mobile bottom navigation */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 backdrop-blur-xl border-t"
        style={{
          background: "hsl(var(--sidebar))",
          borderColor: "hsl(var(--sidebar-border))",
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
  subtitleClassName,
  action,
}: {
  title: string;
  subtitle?: string;
  subtitleClassName?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 md:gap-6 mb-5 md:mb-10">
      <div className="min-w-0">
        <h1 className="text-xl md:text-[2rem] font-bold text-foreground tracking-[-0.03em] leading-tight">
          {title}
        </h1>
        {subtitle && (
          <p className={cn("text-sm text-muted-foreground mt-1.5", subtitleClassName)}>{subtitle}</p>
        )}
      </div>
      {action && <div className="shrink-0 w-full md:w-auto">{action}</div>}
    </div>
  );
}
