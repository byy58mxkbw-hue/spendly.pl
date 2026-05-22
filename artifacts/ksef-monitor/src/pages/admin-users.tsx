import { useQuery } from "@tanstack/react-query";
import { Layout, PageHeader } from "@/components/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { useClerk } from "@clerk/react";
import { Users } from "lucide-react";

interface AdminUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  createdAt: number;
  lastSignInAt: number | null;
}

interface AdminUsersResponse {
  users: AdminUser[];
  total: number;
}

function useAdminUsers() {
  const { session } = useClerk();
  return useQuery<AdminUsersResponse>({
    queryKey: ["admin", "users"],
    queryFn: async () => {
      const token = await session?.getToken();
      const res = await fetch("/api/admin/users", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Błąd pobierania listy użytkowników");
      return res.json() as Promise<AdminUsersResponse>;
    },
    enabled: !!session,
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

export default function AdminUsers() {
  const { data, isLoading, isError } = useAdminUsers();

  return (
    <Layout>
      <div className="px-4 py-5 md:px-8 md:py-8 max-w-4xl">
        <PageHeader
          title="Użytkownicy"
          subtitle={
            data ? `Łącznie zarejestrowanych: ${data.total}` : "Lista kont zarejestrowanych w aplikacji"
          }
        />

        {isLoading && (
          <div className="space-y-3 mt-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        )}

        {isError && (
          <p className="mt-6 text-sm text-destructive">
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
          <div className="mt-6 divide-y divide-border rounded-xl border border-border overflow-hidden">
            {data.users.map((u) => (
              <div key={u.id} className="flex items-center gap-4 px-5 py-4 bg-card hover:bg-secondary/40 transition-colors">
                <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold shrink-0">
                  {initials(u)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{displayName(u)}</p>
                  {u.email && (u.firstName || u.lastName) && (
                    <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                  )}
                </div>
                <div className="text-right shrink-0 hidden sm:block">
                  <p className="text-xs text-muted-foreground">Rejestracja</p>
                  <p className="text-xs font-medium text-foreground">
                    {new Date(u.createdAt).toLocaleDateString("pl-PL")}
                  </p>
                </div>
                <div className="text-right shrink-0 hidden md:block w-32">
                  <p className="text-xs text-muted-foreground">Ostatnie logowanie</p>
                  <p className="text-xs font-medium text-foreground">
                    {u.lastSignInAt
                      ? new Date(u.lastSignInAt).toLocaleDateString("pl-PL")
                      : "—"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
