import { useUser } from "@clerk/react";
import { useGetSubscriptionStatus, getGetSubscriptionStatusQueryKey } from "@workspace/api-client-react";

// Pasek informujący o trwającym okresie próbnym (Faza A płatności — patrz
// services/subscriptions.ts). Znika automatycznie, gdy trial się skończy
// (backend leniwie przełącza status przy tym samym odczycie) albo gdy user
// ma inny plan bez triala. Bez CTA/linku do cennika — cennik jeszcze nie istnieje.
export function TrialBanner() {
  const { isSignedIn } = useUser();
  const { data } = useGetSubscriptionStatus({ query: { enabled: !!isSignedIn, queryKey: getGetSubscriptionStatusQueryKey() } });

  if (!data || data.status !== "trialing" || data.daysLeft == null) return null;

  const dayLabel = data.daysLeft === 1 ? "dzień" : "dni";

  return (
    <div className="bg-accent-soft text-primary text-xs px-4 py-2 text-center border-b border-border">
      Okres próbny planu Pro: zostało {data.daysLeft} {dayLabel}.
    </div>
  );
}
