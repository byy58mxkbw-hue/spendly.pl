import { useEffect } from "react";
import { useUser } from "@clerk/react";
import { useToast } from "@/hooks/use-toast";

// Wersja notki w kluczu — przy kolejnym istotnym ulepszeniu AI zmień wersję,
// żeby notka pokazała się raz na nowo, bez ruszania starych flag w localStorage.
const NOTICE_VERSION = "2026-09-fn-calling";

/**
 * Krótka, jednorazowa notka o ulepszeniach AI Asystenta — pokazywana RAZ przy
 * najbliższym zalogowaniu KAŻDEMU istniejącemu użytkownikowi z kontem (w
 * odróżnieniu od WelcomeOnboarding, który celuje w NOWYCH userów bez danych).
 * Dismiss = per user w localStorage, więc nie wraca przy kolejnych wejściach.
 */
export function AiUpdateNotice() {
  const { user, isSignedIn } = useUser();
  const { toast } = useToast();

  useEffect(() => {
    if (!isSignedIn || !user) return;
    const key = `spendly_ai_update_notice_${NOTICE_VERSION}_${user.id}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, "1");
    } catch {
      // localStorage niedostępny (tryb prywatny) — nie pokazuj, żeby nie wracało przy każdym wejściu
      return;
    }
    toast({
      title: "Ulepszyliśmy AI Asystenta",
      description: "Rozumie teraz więcej o Twoich fakturach — szuka dostawców po NIP, wykrywa nietypowe ceny i ilości zakupów, a przy podwyżce może zaproponować alert cenowy prosto z rozmowy.",
    });
  }, [isSignedIn, user, toast]);

  return null;
}
