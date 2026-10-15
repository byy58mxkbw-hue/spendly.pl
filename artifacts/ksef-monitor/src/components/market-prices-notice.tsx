import { useEffect } from "react";
import { useUser } from "@clerk/react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";

// Wzorem ai-update-notice.tsx: wersja w kluczu, żeby przy kolejnym ogłoszeniu
// notka wróciła bez ruszania starych flag w localStorage.
const NOTICE_VERSION = "2026-10-benchmark";

/**
 * Jednorazowa notka o nowej funkcji „Porównanie cen" (/benchmark) — pokazywana
 * RAZ przy najbliższym zalogowaniu każdemu istniejącemu userowi. Dismiss per
 * user w localStorage, nie wraca przy kolejnych wejściach.
 */
export function MarketPricesNotice() {
  const { user, isSignedIn } = useUser();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!isSignedIn || !user) return;
    const key = `spendly_market_prices_notice_${NOTICE_VERSION}_${user.id}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, "1");
    } catch {
      return;
    }
    toast({
      title: "Nowość: Porównanie cen",
      description: "Sprawdź, czy Twoje ceny zakupu są wyższe, niższe, czy w normie względem innych restauracji. Dane w pełni anonimowe, udział dobrowolny.",
      action: (
        <ToastAction altText="Zobacz porównanie cen" onClick={() => navigate("/benchmark")}>
          Zobacz
        </ToastAction>
      ),
    });
  }, [isSignedIn, user, toast, navigate]);

  return null;
}
