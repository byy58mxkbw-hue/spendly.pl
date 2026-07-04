import { LegalLayout, LegalSection } from "@/components/legal-layout";

export default function Regulamin() {
  return (
    <LegalLayout title="Regulamin serwisu Spendly" updated="4 lipca 2026">
      {(c) => {
        const B = ({ children }: { children: React.ReactNode }) => (
          <strong style={{ color: c.text, fontWeight: 600 }}>{children}</strong>
        );
        return (
          <>
            <p style={{ marginBottom: 24 }}>
              Niniejszy Regulamin określa zasady korzystania z serwisu internetowego oraz aplikacji
              Spendly, służących do monitorowania cen surowców na podstawie faktur zakupowych,
              w szczególności faktur pobieranych z Krajowego Systemu e-Faktur (KSeF).
            </p>

            <LegalSection n="1" title="Definicje" c={c}>
              <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
                <li><B>Usługodawca</B> — [PEŁNA NAZWA FIRMY], z siedzibą w [ADRES], NIP [NIP], REGON [REGON], e-mail: kontakt@spendly.pl.</li>
                <li><B>Serwis / Aplikacja</B> — oprogramowanie Spendly dostępne przez przeglądarkę oraz jako aplikacja mobilna.</li>
                <li><B>Użytkownik</B> — przedsiębiorca korzystający z Serwisu w związku z prowadzoną działalnością gastronomiczną.</li>
                <li><B>Konto</B> — indywidualny profil Użytkownika zakładany w procesie rejestracji.</li>
                <li><B>KSeF</B> — Krajowy System e-Faktur prowadzony przez Ministerstwo Finansów.</li>
              </ul>
            </LegalSection>

            <LegalSection n="2" title="Rodzaj i zakres usług" c={c}>
              <p>Serwis umożliwia w szczególności: import faktur zakupowych z KSeF oraz ich ręczne dodawanie (w tym z wykorzystaniem rozpoznawania obrazu OCR), monitorowanie cen surowców i historii ich zmian, analizę kosztów per dostawca i per produkt, kontrolę food cost, generowanie raportów, ustawianie alertów cenowych oraz korzystanie z asystenta AI analizującego dane kosztowe Użytkownika.</p>
            </LegalSection>

            <LegalSection n="3" title="Warunki korzystania" c={c}>
              <p style={{ marginBottom: 10 }}>Do korzystania z Serwisu niezbędne są: urządzenie z dostępem do Internetu, aktualna przeglądarka internetowa oraz aktywne konto e-mail. Rejestracja i logowanie odbywają się za pośrednictwem dostawcy uwierzytelniania (Clerk).</p>
              <p>Użytkownik zobowiązuje się do korzystania z Serwisu zgodnie z prawem i Regulaminem, do podawania danych zgodnych ze stanem faktycznym oraz do nieudostępniania danych logowania osobom trzecim.</p>
            </LegalSection>

            <LegalSection n="4" title="Integracja z KSeF" c={c}>
              <p>Import faktur z KSeF wymaga podania numeru NIP oraz tokena autoryzacyjnego wygenerowanego w KSeF. <B>Token jest szyfrowany</B> (AES-256-GCM) przed zapisaniem i przechowywany w postaci zaszyfrowanej. Usługodawca nie odpowiada za dostępność, poprawność ani kompletność danych udostępnianych przez KSeF, ani za przerwy w działaniu tego systemu.</p>
            </LegalSection>

            <LegalSection n="5" title="Płatności i okres testowy" c={c}>
              <p>W okresie testowym korzystanie z Serwisu jest bezpłatne i nie wymaga podania danych karty płatniczej. Docelowa cena abonamentu wynosi <B>200 zł miesięcznie</B> za pełny dostęp. O zmianie warunków oraz rozpoczęciu odpłatności Użytkownik zostanie poinformowany z wyprzedzeniem. Subskrypcję można anulować w dowolnym momencie, bez opłat za rezygnację.</p>
            </LegalSection>

            <LegalSection n="6" title="Sztuczna inteligencja" c={c}>
              <p>Funkcje AI (asystent kosztowy, OCR faktur, kategoryzacja produktów) wykorzystują usługi zewnętrznego dostawcy modeli (OpenAI). Wyniki generowane przez AI mają charakter pomocniczy i <B>nie stanowią porady finansowej, księgowej ani prawnej</B>. Użytkownik powinien we własnym zakresie weryfikować kluczowe decyzje.</p>
            </LegalSection>

            <LegalSection n="7" title="Odpowiedzialność" c={c}>
              <p>Usługodawca dokłada starań, aby Serwis działał w sposób ciągły i poprawny, jednak nie gwarantuje nieprzerwanej dostępności. Usługodawca nie ponosi odpowiedzialności za decyzje biznesowe podjęte na podstawie danych lub analiz prezentowanych w Serwisie, ani za szkody wynikłe z nieprawidłowych danych źródłowych (np. z faktur).</p>
            </LegalSection>

            <LegalSection n="8" title="Reklamacje" c={c}>
              <p>Reklamacje można zgłaszać na adres kontakt@spendly.pl. Zgłoszenie powinno zawierać opis problemu oraz dane umożliwiające identyfikację konta. Reklamacje rozpatrywane są w terminie do 14 dni.</p>
            </LegalSection>

            <LegalSection n="9" title="Rozwiązanie umowy" c={c}>
              <p>Użytkownik może w każdej chwili usunąć konto z poziomu ustawień Serwisu. Usunięcie konta powoduje trwałe usunięcie powiązanych danych Użytkownika zgodnie z Polityką prywatności.</p>
            </LegalSection>

            <LegalSection n="10" title="Postanowienia końcowe" c={c}>
              <p>Usługodawca zastrzega sobie prawo do zmiany Regulaminu z ważnych przyczyn. O zmianach Użytkownik zostanie poinformowany. W sprawach nieuregulowanych zastosowanie mają przepisy prawa polskiego.</p>
            </LegalSection>

            <p style={{ marginTop: 32, fontSize: 13, fontStyle: "italic" }}>
              Uwaga: dokument jest wzorem i wymaga uzupełnienia danych rejestrowych firmy ([...])
              oraz weryfikacji przez radcę prawnego przed publikacją produkcyjną.
            </p>
          </>
        );
      }}
    </LegalLayout>
  );
}
