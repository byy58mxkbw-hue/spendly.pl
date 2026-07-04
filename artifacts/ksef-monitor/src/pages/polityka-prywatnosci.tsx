import { LegalLayout, LegalSection } from "@/components/legal-layout";

export default function PolitykaPrywatnosci() {
  return (
    <LegalLayout title="Polityka prywatności" updated="4 lipca 2026">
      {(c) => {
        const B = ({ children }: { children: React.ReactNode }) => (
          <strong style={{ color: c.text, fontWeight: 600 }}>{children}</strong>
        );
        return (
          <>
            <p style={{ marginBottom: 24 }}>
              Niniejsza Polityka prywatności opisuje, w jaki sposób w serwisie Spendly przetwarzane są
              dane osobowe oraz dane firmowe Użytkowników, zgodnie z Rozporządzeniem (UE) 2016/679 (RODO).
            </p>

            <LegalSection n="1" title="Administrator danych" c={c}>
              <p>Administratorem danych jest <B>[PEŁNA NAZWA FIRMY]</B>, z siedzibą w [ADRES], NIP [NIP],
              kontakt: kontakt@spendly.pl. We wszelkich sprawach dotyczących danych osobowych można
              kontaktować się pod tym adresem.</p>
            </LegalSection>

            <LegalSection n="2" title="Jakie dane przetwarzamy" c={c}>
              <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
                <li><B>Dane konta</B> — adres e-mail, imię i nazwisko, identyfikator konta (obsługiwane przez dostawcę uwierzytelniania Clerk).</li>
                <li><B>Dane firmowe i księgowe</B> — NIP, faktury zakupowe, dane dostawców, pozycje faktur, ceny, płatności.</li>
                <li><B>Token KSeF</B> — przechowywany wyłącznie w postaci zaszyfrowanej (AES-256-GCM).</li>
                <li><B>Dane techniczne</B> — logi żądań, adres IP, informacje o urządzeniu i przeglądarce (w celach bezpieczeństwa i diagnostyki).</li>
              </ul>
            </LegalSection>

            <LegalSection n="3" title="Cele i podstawy przetwarzania" c={c}>
              <p>Dane przetwarzamy w celu: świadczenia usługi (art. 6 ust. 1 lit. b RODO — wykonanie umowy),
              zapewnienia bezpieczeństwa i rozwoju Serwisu (lit. f — prawnie uzasadniony interes) oraz
              wypełnienia obowiązków prawnych (lit. c). Dane z faktur są przetwarzane wyłącznie w celu
              świadczenia funkcji analitycznych na rzecz danego Użytkownika.</p>
            </LegalSection>

            <LegalSection n="4" title="Podmioty przetwarzające" c={c}>
              <p style={{ marginBottom: 10 }}>Korzystamy z zaufanych dostawców, którzy przetwarzają dane w naszym imieniu:</p>
              <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
                <li><B>Clerk</B> — uwierzytelnianie i zarządzanie kontami.</li>
                <li><B>OpenAI</B> — funkcje AI (asystent, OCR faktur, kategoryzacja). Do modeli przekazywany jest wyłącznie zakres danych niezbędny do wykonania zapytania.</li>
                <li><B>Railway</B> — hosting aplikacji i bazy danych.</li>
                <li><B>KSeF (Ministerstwo Finansów)</B> — źródło faktur pobieranych na żądanie Użytkownika.</li>
              </ul>
            </LegalSection>

            <LegalSection n="5" title="Bezpieczeństwo" c={c}>
              <p>Stosujemy środki techniczne i organizacyjne chroniące dane: szyfrowaną transmisję (HTTPS),
              <B> szyfrowanie tokenów KSeF (AES-256-GCM)</B>, ścisłą izolację danych między kontami
              (każdy Użytkownik ma dostęp wyłącznie do własnych danych) oraz ograniczenie liczby zapytań
              chroniące przed nadużyciami.</p>
            </LegalSection>

            <LegalSection n="6" title="Okres przechowywania" c={c}>
              <p>Dane przechowujemy przez czas korzystania z Serwisu. Po usunięciu konta powiązane dane
              (faktury, dostawcy, produkty, konfiguracja KSeF wraz z zaszyfrowanym tokenem) są
              <B> trwale usuwane</B> z bazy danych.</p>
            </LegalSection>

            <LegalSection n="7" title="Prawa Użytkownika" c={c}>
              <p>Przysługuje Ci prawo dostępu do danych, ich sprostowania, usunięcia, ograniczenia
              przetwarzania, przenoszenia danych oraz wniesienia sprzeciwu. Masz również prawo wniesienia
              skargi do Prezesa Urzędu Ochrony Danych Osobowych. W celu realizacji praw skontaktuj się:
              kontakt@spendly.pl.</p>
            </LegalSection>

            <LegalSection n="8" title="Pliki cookies i pamięć lokalna" c={c}>
              <p>Serwis wykorzystuje pliki cookies oraz pamięć lokalną przeglądarki w celu utrzymania sesji
              logowania i zapamiętania preferencji (np. wybranego motywu kolorystycznego). Cookies dostawcy
              uwierzytelniania są niezbędne do działania Serwisu.</p>
            </LegalSection>

            <LegalSection n="9" title="Zmiany polityki" c={c}>
              <p>Polityka może być aktualizowana. O istotnych zmianach poinformujemy Użytkowników. Aktualna
              wersja jest zawsze dostępna w Serwisie.</p>
            </LegalSection>

            <p style={{ marginTop: 32, fontSize: 13, fontStyle: "italic" }}>
              Uwaga: dokument jest wzorem i wymaga uzupełnienia danych administratora ([...])
              oraz weryfikacji przez radcę prawnego / IOD przed publikacją produkcyjną.
            </p>
          </>
        );
      }}
    </LegalLayout>
  );
}
