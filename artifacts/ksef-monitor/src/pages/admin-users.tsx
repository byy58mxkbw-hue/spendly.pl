import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout, PageHeader } from "@/components/layout";
import { apiUrl } from "@/lib/api-base";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useClerk } from "@clerk/react";
import {
  Users,
  MoreHorizontal,
  ShieldOff,
  ShieldCheck,
  Trash2,
  FileText,
  Package,
  Building2,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  RefreshCw,
  RotateCcw,
  Copy,
  Mail,
  Clock,
} from "@/lib/icons";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useToast } from "@/hooks/use-toast";

interface AdminUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  createdAt: number;
  lastSignInAt: number | null;
  blocked: boolean;
  plan: "free" | "pro" | "business";
  aiUsage: number;
  aiLimit: number | null;
  invoiceCount: number;
  supplierCount: number;
  productCount: number;
}

interface AdminUsersResponse {
  users: AdminUser[];
  total: number;
}

interface AdminStatsResponse {
  totalUsers: number;
  totalInvoices: number;
  totalSuppliers: number;
  totalProducts: number;
  registrationsChart: { month: string; count: number }[];
}

interface AdminUserDetails {
  suppliers: { id: number; name: string; taxId: string; isActive: boolean }[];
  recentInvoices: { id: number; invoiceNumber: string; invoiceDate: string; totalAmount: string; supplierName: string }[];
  topProducts: { productName: string; totalSpend: string }[];
}

async function authFetch(session: ReturnType<typeof useClerk>["session"], url: string, options?: RequestInit) {
  const token = await session?.getToken();
  return fetch(apiUrl(url), {
    ...options,
    headers: {
      ...(options?.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.body ? { "Content-Type": "application/json" } : {}),
    },
  });
}

function useAdminUsers() {
  const { session } = useClerk();
  return useQuery<AdminUsersResponse>({
    queryKey: ["admin", "users"],
    queryFn: async () => {
      const res = await authFetch(session, "/api/admin/users");
      if (!res.ok) throw new Error("Błąd pobierania listy użytkowników");
      return res.json() as Promise<AdminUsersResponse>;
    },
    enabled: !!session,
  });
}

function useAdminStats() {
  const { session } = useClerk();
  return useQuery<AdminStatsResponse>({
    queryKey: ["admin", "stats"],
    queryFn: async () => {
      const res = await authFetch(session, "/api/admin/stats");
      if (!res.ok) throw new Error("Błąd pobierania statystyk");
      return res.json() as Promise<AdminStatsResponse>;
    },
    enabled: !!session,
  });
}

function useAdminUserDetails(userId: string | null) {
  const { session } = useClerk();
  return useQuery<AdminUserDetails>({
    queryKey: ["admin", "user-details", userId],
    queryFn: async () => {
      const res = await authFetch(session, `/api/admin/users/${userId}/details`);
      if (!res.ok) throw new Error("Błąd pobierania danych użytkownika");
      return res.json() as Promise<AdminUserDetails>;
    },
    enabled: !!session && !!userId,
  });
}

function useBlockUser() {
  const { session } = useClerk();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, blocked }: { userId: string; blocked: boolean }) => {
      const res = await authFetch(session, `/api/admin/users/${userId}/block`, {
        method: "PATCH",
        body: JSON.stringify({ blocked }),
      });
      if (!res.ok) throw new Error("Błąd zmiany statusu konta");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users"] }),
  });
}

function useSetPlan() {
  const { session } = useClerk();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, plan }: { userId: string; plan: "free" | "pro" | "business" }) => {
      const res = await authFetch(session, `/api/admin/users/${userId}/plan`, {
        method: "PATCH",
        body: JSON.stringify({ plan }),
      });
      if (!res.ok) throw new Error("Błąd zmiany planu");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users"] }),
  });
}

function useDeleteUser() {
  const { session } = useClerk();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const res = await authFetch(session, `/api/admin/users/${userId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Błąd usuwania konta");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users"] }),
  });
}

type FeedbackBroadcastResult = { totalUsers: number; sent: number; skipped: number; failed: number };
type TrialBackfillResult = { totalUsers: number; started: number; alreadyHadSubscription: number };

function useSendFeedbackBroadcast() {
  const { session } = useClerk();
  return useMutation({
    mutationFn: async () => {
      const res = await authFetch(session, "/api/admin/send-feedback-email", { method: "POST" });
      if (!res.ok) throw new Error("Błąd wysyłki maili z prośbą o opinię");
      return res.json() as Promise<FeedbackBroadcastResult>;
    },
  });
}

function useBackfillTrial() {
  const { session } = useClerk();
  return useMutation({
    mutationFn: async () => {
      const res = await authFetch(session, "/api/admin/backfill-trial", { method: "POST" });
      if (!res.ok) throw new Error("Błąd nadawania triala");
      return res.json() as Promise<TrialBackfillResult>;
    },
  });
}

function useAnnounceTrial() {
  const { session } = useClerk();
  return useMutation({
    mutationFn: async () => {
      const res = await authFetch(session, "/api/admin/announce-trial", { method: "POST" });
      if (!res.ok) throw new Error("Błąd wysyłki ogłoszenia o trialu");
      return res.json() as Promise<FeedbackBroadcastResult>;
    },
  });
}

function useAnnounceAiUpdate() {
  const { session } = useClerk();
  return useMutation({
    mutationFn: async () => {
      const res = await authFetch(session, "/api/admin/announce-ai-update", { method: "POST" });
      if (!res.ok) throw new Error("Błąd wysyłki ogłoszenia o AI");
      return res.json() as Promise<FeedbackBroadcastResult>;
    },
  });
}

type ClerkResyncResult = { totalSubscriptions: number; synced: number; failed: number };

function useResyncClerkPlan() {
  const { session } = useClerk();
  return useMutation({
    mutationFn: async () => {
      const res = await authFetch(session, "/api/admin/resync-clerk-plan", { method: "POST" });
      if (!res.ok) throw new Error("Błąd synchronizacji planów");
      return res.json() as Promise<ClerkResyncResult>;
    },
  });
}

function initials(u: AdminUser): string {
  const f = u.firstName?.[0] ?? "";
  const l = u.lastName?.[0] ?? "";
  if (f || l) return (f + l).toUpperCase();
  return (u.email?.[0] ?? "U").toUpperCase();
}

function displayName(u: AdminUser): string {
  const parts = [u.firstName, u.lastName].filter(Boolean).join(" ");
  return parts || u.email || u.id;
}

function formatMonthLabel(month: string): string {
  const [year, m] = month.split("-");
  const date = new Date(Number(year), Number(m) - 1, 1);
  return date.toLocaleDateString("pl-PL", { month: "short", year: "2-digit" });
}

function formatCurrency(value: string | number): string {
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(Number(value));
}

function StatCard({ label, value, icon: Icon }: { label: string; value: number | string; icon: React.ElementType }) {
  return (
    <div className="glass px-5 py-4 flex items-center gap-4">
      <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground tabular-nums">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function UserDetailsSheet({
  user,
  open,
  onClose,
}: {
  user: AdminUser | null;
  open: boolean;
  onClose: () => void;
}) {
  const { data, isLoading } = useAdminUserDetails(user?.id ?? null);
  const { toast } = useToast();

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col">
        {user && (
          <>
            <SheetHeader className="mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold shrink-0">
                  {initials(user)}
                </div>
                <div className="min-w-0">
                  <SheetTitle className="text-base truncate">{displayName(user)}</SheetTitle>
                  {user.email && (
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard?.writeText(user.id);
                      toast({ description: "Skopiowano Clerk ID — wklej do ADMIN_USER_IDS (Railway) aby nadać admina." });
                    }}
                    className="mt-1 flex items-center gap-1 font-mono text-[10px] text-muted-foreground hover:text-foreground max-w-full"
                    title="Kopiuj Clerk ID (do nadania admina w ADMIN_USER_IDS)"
                  >
                    <span className="truncate">{user.id}</span>
                    <Copy className="h-3 w-3 shrink-0" />
                  </button>
                </div>
                {user.blocked && (
                  <Badge variant="destructive" className="ml-auto shrink-0">Zablokowany</Badge>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2 mt-4">
                <div className="bg-secondary rounded-lg px-3 py-2 text-center">
                  <p className="text-lg font-bold text-foreground">{user.invoiceCount}</p>
                  <p className="text-[10px] text-muted-foreground">Faktury</p>
                </div>
                <div className="bg-secondary rounded-lg px-3 py-2 text-center">
                  <p className="text-lg font-bold text-foreground">{user.supplierCount}</p>
                  <p className="text-[10px] text-muted-foreground">Dostawcy</p>
                </div>
                <div className="bg-secondary rounded-lg px-3 py-2 text-center">
                  <p className="text-lg font-bold text-foreground">{user.productCount}</p>
                  <p className="text-[10px] text-muted-foreground">Produkty</p>
                </div>
              </div>
              <div className="flex gap-4 text-xs text-muted-foreground mt-2">
                <span>Rejestracja: {new Date(user.createdAt).toLocaleDateString("pl-PL")}</span>
                {user.lastSignInAt && (
                  <span>Ostatnie logowanie: {new Date(user.lastSignInAt).toLocaleDateString("pl-PL")}</span>
                )}
              </div>
            </SheetHeader>

            <div className="overflow-y-auto flex-1 min-h-0 pr-1">

            {isLoading && (
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full rounded-lg" />
                ))}
              </div>
            )}

            {data && (
              <div className="space-y-6">
                <section>
                  <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-primary" />
                    Dostawcy ({data.suppliers.length})
                  </h3>
                  {data.suppliers.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Brak dostawców.</p>
                  ) : (
                    <div className="space-y-1">
                      {data.suppliers.map((s) => (
                        <div key={s.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-secondary/50 text-sm">
                          <span className="font-medium truncate">{s.name}</span>
                          <span className="text-xs text-muted-foreground ml-2 shrink-0">{s.taxId}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section>
                  <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary" />
                    Ostatnie faktury
                  </h3>
                  {data.recentInvoices.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Brak faktur.</p>
                  ) : (
                    <div className="space-y-1">
                      {data.recentInvoices.map((inv) => (
                        <div key={inv.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-secondary/50 text-sm">
                          <div className="min-w-0">
                            <p className="font-medium truncate">{inv.invoiceNumber}</p>
                            <p className="text-xs text-muted-foreground">{inv.supplierName} · {inv.invoiceDate}</p>
                          </div>
                          <span className="text-xs font-semibold tabular-nums ml-2 shrink-0">{formatCurrency(inv.totalAmount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section>
                  <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                    <Package className="w-4 h-4 text-primary" />
                    Top produkty (wydatki)
                  </h3>
                  {data.topProducts.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Brak produktów.</p>
                  ) : (
                    <div className="space-y-1">
                      {data.topProducts.map((p, i) => (
                        <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg bg-secondary/50 text-sm">
                          <span className="font-medium truncate">{p.productName}</span>
                          <span className="text-xs font-semibold tabular-nums ml-2 shrink-0">{formatCurrency(p.totalSpend)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

type SortColumn = "name" | "createdAt" | "lastSignInAt" | "invoiceCount";
type SortDir = "asc" | "desc";

function SortIcon({ column, sortCol, sortDir }: { column: SortColumn; sortCol: SortColumn; sortDir: SortDir }) {
  if (column !== sortCol) return <ChevronsUpDown className="w-3 h-3 ml-1 opacity-40" />;
  return sortDir === "asc" ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />;
}

function sortUsers(users: AdminUser[], col: SortColumn, dir: SortDir): AdminUser[] {
  return [...users].sort((a, b) => {
    let cmp = 0;
    if (col === "name") {
      cmp = displayName(a).localeCompare(displayName(b), "pl");
    } else if (col === "createdAt") {
      cmp = a.createdAt - b.createdAt;
    } else if (col === "lastSignInAt") {
      cmp = (a.lastSignInAt ?? 0) - (b.lastSignInAt ?? 0);
    } else if (col === "invoiceCount") {
      cmp = a.invoiceCount - b.invoiceCount;
    }
    return dir === "asc" ? cmp : -cmp;
  });
}

export default function AdminUsers() {
  const { data, isLoading, isError, refetch, isFetching, dataUpdatedAt } = useAdminUsers();
  const { data: stats, isLoading: statsLoading, refetch: refetchStats, isFetching: isStatsFetching } = useAdminStats();
  const blockUser = useBlockUser();
  const setPlan = useSetPlan();
  const deleteUser = useDeleteUser();
  const sendFeedbackBroadcast = useSendFeedbackBroadcast();
  const backfillTrial = useBackfillTrial();
  const announceTrial = useAnnounceTrial();
  const announceAiUpdate = useAnnounceAiUpdate();
  const resyncClerkPlan = useResyncClerkPlan();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [feedbackConfirmOpen, setFeedbackConfirmOpen] = useState(false);
  const [backfillTrialConfirmOpen, setBackfillTrialConfirmOpen] = useState(false);
  const [announceTrialConfirmOpen, setAnnounceTrialConfirmOpen] = useState(false);
  const [announceAiUpdateConfirmOpen, setAnnounceAiUpdateConfirmOpen] = useState(false);
  const [sortCol, setSortCol] = useState<SortColumn>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function handleRefresh() {
    void refetch();
    void refetchStats();
  }

  async function handleSetPlan(u: AdminUser, plan: "free" | "pro" | "business") {
    if (u.plan === plan) return;
    try {
      await setPlan.mutateAsync({ userId: u.id, plan });
      toast({ title: `Plan zmieniony na ${plan.toUpperCase()}` });
    } catch {
      toast({ variant: "destructive", title: "Błąd", description: "Nie udało się zmienić planu" });
    }
  }

  const planLabel: Record<AdminUser["plan"], string> = { free: "Free", pro: "Pro", business: "Business" };

  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt) : null;
  const isRefreshing = isFetching || isStatsFetching;

  function handleSort(col: SortColumn) {
    if (col === sortCol) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("desc");
    }
  }

  async function handleBlock(user: AdminUser) {
    try {
      await blockUser.mutateAsync({ userId: user.id, blocked: !user.blocked });
      toast({ title: user.blocked ? "Konto odblokowane" : "Konto zablokowane" });
    } catch {
      toast({ title: "Błąd", description: "Nie udało się zmienić statusu konta.", variant: "destructive" });
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteUser.mutateAsync(deleteTarget.id);
      toast({ title: "Konto usunięte", description: `Konto ${displayName(deleteTarget)} zostało trwale usunięte.` });
      setDeleteTarget(null);
      if (selectedUser?.id === deleteTarget.id) {
        setSheetOpen(false);
        setSelectedUser(null);
      }
      void qc.invalidateQueries({ queryKey: ["admin", "stats"] });
    } catch {
      toast({ title: "Błąd", description: "Nie udało się usunąć konta.", variant: "destructive" });
    }
  }

  async function handleSendFeedbackBroadcast() {
    setFeedbackConfirmOpen(false);
    try {
      const result = await sendFeedbackBroadcast.mutateAsync();
      toast({
        title: "Wysłano prośby o opinię",
        description: `Wysłano: ${result.sent}, pominięto (już otrzymali): ${result.skipped}, błędów: ${result.failed}.`,
      });
    } catch {
      toast({ title: "Błąd", description: "Nie udało się wysłać maili z prośbą o opinię.", variant: "destructive" });
    }
  }

  async function handleBackfillTrial() {
    setBackfillTrialConfirmOpen(false);
    try {
      const result = await backfillTrial.mutateAsync();
      toast({
        title: "Trial nadany",
        description: `Nadano: ${result.started}, mieli już subskrypcję: ${result.alreadyHadSubscription}.`,
      });
      void qc.invalidateQueries({ queryKey: ["admin", "users"] });
    } catch {
      toast({ title: "Błąd", description: "Nie udało się nadać triala.", variant: "destructive" });
    }
  }

  async function handleAnnounceTrial() {
    setAnnounceTrialConfirmOpen(false);
    try {
      const result = await announceTrial.mutateAsync();
      toast({
        title: "Wysłano ogłoszenie o trialu",
        description: `Wysłano: ${result.sent}, pominięto (już otrzymali): ${result.skipped}, błędów: ${result.failed}.`,
      });
    } catch {
      toast({ title: "Błąd", description: "Nie udało się wysłać ogłoszenia o trialu.", variant: "destructive" });
    }
  }

  async function handleAnnounceAiUpdate() {
    setAnnounceAiUpdateConfirmOpen(false);
    try {
      const result = await announceAiUpdate.mutateAsync();
      toast({
        title: "Wysłano ogłoszenie o AI",
        description: `Wysłano: ${result.sent}, pominięto (już otrzymali): ${result.skipped}, błędów: ${result.failed}.`,
      });
    } catch {
      toast({ title: "Błąd", description: "Nie udało się wysłać ogłoszenia o ulepszeniach AI.", variant: "destructive" });
    }
  }

  // Naprawcze — bez potwierdzenia, bo to bezpieczna, idempotentna synchronizacja
  // (tylko ustawia Clerk.publicMetadata.plan zgodnie z tym, co już jest w bazie).
  async function handleResyncClerkPlan() {
    try {
      const result = await resyncClerkPlan.mutateAsync();
      toast({
        title: "Zsynchronizowano plany",
        description: `Zsynchronizowano: ${result.synced}/${result.totalSubscriptions}, błędów: ${result.failed}.`,
      });
      void qc.invalidateQueries({ queryKey: ["admin", "users"] });
    } catch {
      toast({ title: "Błąd", description: "Nie udało się zsynchronizować planów.", variant: "destructive" });
    }
  }

  return (
    <Layout>
      <div className="px-4 py-5 md:px-8 md:py-8 max-w-6xl">
        <PageHeader
          title="Panel administracyjny"
          subtitle="Zarządzanie kontami użytkowników platformy"
          action={
            <div className="flex items-center gap-3">
              {lastUpdated && (
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  Odświeżono: {lastUpdated.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBackfillTrialConfirmOpen(true)}
                disabled={backfillTrial.isPending}
                className="gap-2"
              >
                <Clock className="w-3.5 h-3.5" />
                Nadaj trial wszystkim
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAnnounceTrialConfirmOpen(true)}
                disabled={announceTrial.isPending}
                className="gap-2"
              >
                <Mail className="w-3.5 h-3.5" />
                Wyślij ogłoszenie o trialu
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAnnounceAiUpdateConfirmOpen(true)}
                disabled={announceAiUpdate.isPending}
                className="gap-2"
              >
                <Mail className="w-3.5 h-3.5" />
                Wyślij ogłoszenie o AI
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleResyncClerkPlan}
                disabled={resyncClerkPlan.isPending}
                className="gap-2"
                title="Naprawcze: wymusza ponowny sync planu do Clerk dla wszystkich userów z subskrypcją"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Zsynchronizuj plany
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFeedbackConfirmOpen(true)}
                disabled={sendFeedbackBroadcast.isPending}
                className="gap-2"
              >
                <Mail className="w-3.5 h-3.5" />
                Wyślij prośbę o opinię
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="gap-2"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
                Odśwież
              </Button>
            </div>
          }
        />

        <Tabs defaultValue="users">
          <TabsList className="mb-6">
            <TabsTrigger value="users">Użytkownicy</TabsTrigger>
            <TabsTrigger value="stats">Statystyki platformy</TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            {isLoading && (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-xl" />
                ))}
              </div>
            )}

            {isError && (
              <p className="mt-4 text-sm text-destructive">
                Brak dostępu lub błąd pobierania listy użytkowników.
              </p>
            )}

            {data && data.users.length === 0 && (
              <div className="mt-12 flex flex-col items-center gap-3 text-muted-foreground">
                <Users className="w-10 h-10 opacity-30" />
                <p className="text-sm">Brak zarejestrowanych użytkowników.</p>
              </div>
            )}

            {data && data.users.length > 0 && (
              <>
                <p className="text-sm text-muted-foreground mb-4">
                  Łącznie zarejestrowanych: <span className="font-semibold text-foreground">{data.total}</span>
                </p>
                <div className="rounded-xl border border-border overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-secondary/50 border-b border-border">
                          <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">
                            <button
                              onClick={() => handleSort("name")}
                              className="flex items-center hover:text-foreground transition-colors"
                            >
                              Użytkownik
                              <SortIcon column="name" sortCol={sortCol} sortDir={sortDir} />
                            </button>
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground hidden sm:table-cell">
                            <button
                              onClick={() => handleSort("createdAt")}
                              className="flex items-center hover:text-foreground transition-colors"
                            >
                              Rejestracja
                              <SortIcon column="createdAt" sortCol={sortCol} sortDir={sortDir} />
                            </button>
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground hidden md:table-cell">
                            <button
                              onClick={() => handleSort("lastSignInAt")}
                              className="flex items-center hover:text-foreground transition-colors"
                            >
                              Ostatnie logowanie
                              <SortIcon column="lastSignInAt" sortCol={sortCol} sortDir={sortDir} />
                            </button>
                          </th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground hidden lg:table-cell">
                            <button
                              onClick={() => handleSort("invoiceCount")}
                              className="flex items-center mx-auto hover:text-foreground transition-colors"
                            >
                              Faktury
                              <SortIcon column="invoiceCount" sortCol={sortCol} sortDir={sortDir} />
                            </button>
                          </th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground hidden lg:table-cell">Dostawcy</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground hidden lg:table-cell">Produkty</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Status</th>
                          <th className="px-4 py-3 w-10"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border bg-card">
                        {sortUsers(data.users, sortCol, sortDir).map((u) => (
                          <tr
                            key={u.id}
                            className="hover:bg-secondary/30 transition-colors cursor-pointer"
                            onClick={() => { setSelectedUser(u); setSheetOpen(true); }}
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${u.blocked ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
                                  {initials(u)}
                                </div>
                                <div className="min-w-0">
                                  <p className="font-medium text-foreground truncate">{displayName(u)}</p>
                                  {u.email && (u.firstName || u.lastName) && (
                                    <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground hidden sm:table-cell whitespace-nowrap">
                              {new Date(u.createdAt).toLocaleDateString("pl-PL")}
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell whitespace-nowrap">
                              {u.lastSignInAt ? new Date(u.lastSignInAt).toLocaleDateString("pl-PL") : "—"}
                            </td>
                            <td className="px-4 py-3 text-center text-xs font-medium hidden lg:table-cell">{u.invoiceCount}</td>
                            <td className="px-4 py-3 text-center text-xs font-medium hidden lg:table-cell">{u.supplierCount}</td>
                            <td className="px-4 py-3 text-center text-xs font-medium hidden lg:table-cell">{u.productCount}</td>
                            <td className="px-4 py-3">
                              <div className="flex flex-col gap-1 items-start">
                                {u.blocked ? (
                                  <Badge variant="destructive" className="text-[10px]">Zablokowany</Badge>
                                ) : (
                                  <Badge variant="outline" className="text-[10px] text-positive border-positive/40 bg-positive/10">Aktywny</Badge>
                                )}
                                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                  {planLabel[u.plan]} · AI {u.aiUsage}{u.aiLimit != null ? `/${u.aiLimit}` : " (∞)"}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7">
                                    <MoreHorizontal className="w-4 h-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => handleBlock(u)}>
                                    {u.blocked ? (
                                      <><ShieldCheck className="w-4 h-4 mr-2" />Odblokuj konto</>
                                    ) : (
                                      <><ShieldOff className="w-4 h-4 mr-2" />Zablokuj konto</>
                                    )}
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuLabel className="text-[10px] text-muted-foreground">Plan (limit AI/mies.)</DropdownMenuLabel>
                                  {(["free", "pro", "business"] as const).map((p) => (
                                    <DropdownMenuItem
                                      key={p}
                                      onClick={() => handleSetPlan(u, p)}
                                      disabled={u.plan === p || setPlan.isPending}
                                    >
                                      <span className="w-4 h-4 mr-2 inline-flex items-center justify-center text-primary">{u.plan === p ? "✓" : ""}</span>
                                      {planLabel[p]}
                                    </DropdownMenuItem>
                                  ))}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => setDeleteTarget(u)}
                                  >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Usuń konto
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="stats">
            {statsLoading && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-20 rounded-xl" />
                  ))}
                </div>
                <Skeleton className="h-64 w-full rounded-xl" />
              </div>
            )}

            {stats && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard label="Użytkownicy" value={stats.totalUsers} icon={Users} />
                  <StatCard label="Faktury" value={stats.totalInvoices} icon={FileText} />
                  <StatCard label="Dostawcy" value={stats.totalSuppliers} icon={Building2} />
                  <StatCard label="Produkty" value={stats.totalProducts} icon={Package} />
                </div>

                <div className="glass p-5">
                  <h3 className="text-sm font-semibold text-foreground mb-4">
                    Nowe rejestracje — ostatnie 12 miesięcy
                  </h3>
                  {stats.registrationsChart.every((p) => p.count === 0) ? (
                    <p className="text-sm text-muted-foreground text-center py-10">Brak danych o rejestracjach.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={stats.registrationsChart} margin={{ top: 0, right: 4, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis
                          dataKey="month"
                          tickFormatter={formatMonthLabel}
                          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          allowDecimals={false}
                          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          formatter={(v: number) => [v, "Rejestracje"]}
                          labelFormatter={formatMonthLabel}
                          contentStyle={{
                            background: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "0.5rem",
                            fontSize: 12,
                          }}
                        />
                        <Bar dataKey="count" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <UserDetailsSheet
        user={selectedUser}
        open={sheetOpen}
        onClose={() => { setSheetOpen(false); setSelectedUser(null); }}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Usunąć konto?</AlertDialogTitle>
            <AlertDialogDescription>
              Konto <strong>{deleteTarget ? displayName(deleteTarget) : ""}</strong> zostanie trwale usunięte. Tej operacji nie można cofnąć.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Usuń konto
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={feedbackConfirmOpen} onOpenChange={setFeedbackConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Wysłać prośbę o opinię?</AlertDialogTitle>
            <AlertDialogDescription>
              Mail z prośbą o opinię i informację o ewentualnych błędach trafi do wszystkich zarejestrowanych
              użytkowników (poza kontami administratorów), którzy jeszcze go nie dostali. Tej operacji nie można cofnąć.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            <AlertDialogAction onClick={handleSendFeedbackBroadcast}>
              Wyślij
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={backfillTrialConfirmOpen} onOpenChange={setBackfillTrialConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Nadać trial wszystkim?</AlertDialogTitle>
            <AlertDialogDescription>
              Każdy zarejestrowany użytkownik (poza kontami administratorów), który jeszcze nie ma subskrypcji,
              dostanie 30-dniowy trial planu Pro — bez podawania karty. Tej operacji nie można cofnąć. Zrób to
              PRZED wysłaniem ogłoszenia o trialu.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            <AlertDialogAction onClick={handleBackfillTrial}>
              Nadaj trial
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={announceTrialConfirmOpen} onOpenChange={setAnnounceTrialConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Wysłać ogłoszenie o trialu?</AlertDialogTitle>
            <AlertDialogDescription>
              Mail ogłaszający 30-dniowy trial planu Pro trafi do wszystkich zarejestrowanych użytkowników (poza
              kontami administratorów), którzy jeszcze go nie dostali. Upewnij się, że najpierw kliknąłeś „Nadaj
              trial wszystkim" — inaczej mail będzie odnosił się do triala, którego user jeszcze nie ma. Tej
              operacji nie można cofnąć.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            <AlertDialogAction onClick={handleAnnounceTrial}>
              Wyślij
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={announceAiUpdateConfirmOpen} onOpenChange={setAnnounceAiUpdateConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Wysłać ogłoszenie o ulepszeniach AI?</AlertDialogTitle>
            <AlertDialogDescription>
              Mail o ulepszeniach AI Asystenta (wyszukiwanie po NIP, anomalie cen/ilości, propozycja alertu z
              rozmowy) trafi do wszystkich zarejestrowanych użytkowników (poza kontami administratorów), którzy
              jeszcze go nie dostali. Tej operacji nie można cofnąć.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            <AlertDialogAction onClick={handleAnnounceAiUpdate}>
              Wyślij
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
