// PDF faktury w układzie wizualizacji KSeF — oficjalny generator Ministerstwa Finansów
// (src/vendor/ksef-pdf, MIT). Ładowany LENIWIE: ~1 MB po kompresji, nie może trafić do
// bundla landingu ani panelu. Generowanie w przeglądarce, XML nie idzie nigdzie dalej.
// Bez kodu QR: format linku weryfikacyjnego środowiska produkcyjnego nie jest tu
// potwierdzony, a zły link byłby gorszy niż brak kodu.

export async function downloadKsefPdf(xml: string, opts: { fileName: string; ksefNumber?: string | null }): Promise<void> {
  const { generateInvoice } = await import("@/vendor/ksef-pdf/ksef-pdf-generator.js");
  const file = new File([xml], "faktura.xml", { type: "text/xml" });
  const blob = await generateInvoice(file, { nrKSeF: opts.ksefNumber ?? "" }, "blob");
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = opts.fileName.replace(/[\\/:*?"<>|]+/g, "-") + ".pdf";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
