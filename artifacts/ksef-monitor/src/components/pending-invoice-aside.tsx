import { FileText } from "@/lib/icons";
import { Logo } from "@/components/logo";
import type { ParsedFa3 } from "@workspace/ksef-xml";

const zl = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(n);
const date = (d: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" }) : "");

/**
 * Lewa kolumna rejestracji/logowania, gdy w przeglądarce czeka faktura z publicznego
 * podglądu XML (ekran 03 specyfikacji). Bez faktury strona logowania wygląda jak dotąd.
 * Kolory na sztywno = ten sam ciemny papier co tło formularza Clerka (app-shell.tsx).
 */
export function PendingInvoiceAside({ invoice, mode }: { invoice: ParsedFa3; mode: "sign-up" | "sign-in" }) {
  const h = invoice.header;
  const steps =
    mode === "sign-up"
      ? ["Zakładasz konto — bez karty, plan Start jest darmowy", "Faktura importuje się sama, nic nie wgrywasz drugi raz", "Widzisz swoje ceny na tle mediany innych restauracji"]
      : ["Logujesz się na swoje konto", "Faktura importuje się sama, nic nie wgrywasz drugi raz", "Widzisz swoje ceny na tle mediany innych restauracji"];
  return (
    <aside className="px-6 py-10 md:px-14 md:py-12" style={{ background: "#211B12", color: "#F0E9DB" }}>
      <Logo size={18} accentColor="#E06A3C" textColor="#F0E9DB" />
      <p className="label-caps mt-10 mb-3" style={{ color: "#E06A3C", fontSize: 11, letterSpacing: "0.1em" }}>Twoja faktura czeka</p>
      <h1 className="font-bold leading-tight" style={{ fontSize: "clamp(1.7rem, 4vw, 2.6rem)", letterSpacing: "-0.02em" }}>
        Jeszcze minuta i zobaczysz, gdzie przepłacasz.
      </h1>
      <div className="mt-8" style={{ border: "1px solid #392F22", background: "#2A2318" }}>
        <div className="flex gap-3 items-start p-4">
          <div className="w-10 h-10 grid place-items-center shrink-0" style={{ border: "1px solid #392F22" }}>
            <FileText className="w-4 h-4" style={{ color: "#E06A3C" }} />
          </div>
          <div className="min-w-0">
            <p className="font-semibold truncate">{[h.invoiceNumber, h.sellerName].filter(Boolean).join(" · ")}</p>
            <p className="text-sm num" style={{ color: "#9C8F79" }}>
              {[date(h.invoiceDate), `${invoice.items.length} pozycji`, h.totalGross != null ? `${zl(h.totalGross)} brutto` : null].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
      </div>
      <ol className="mt-8" style={{ borderTop: "1px solid #392F22" }}>
        {steps.map((s, i) => (
          <li key={s} className="flex gap-5 py-4" style={{ borderBottom: "1px solid #392F22" }}>
            <span className="num font-bold" style={{ color: "#E06A3C" }}>{String(i + 1).padStart(2, "0")}</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
    </aside>
  );
}
