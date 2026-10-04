// Plik → obrazy stron jako data-URL. PDF rasteryzowany w przeglądarce (pdfjs, ładowany
// leniwie), zdjęcie zwracane bez zmian. Wspólne dla importu karty menu i skanu
// faktur (wielostronicowe faktury hurtowni).
export async function fileToImages(file: File, maxPages: number): Promise<string[]> {
  if (file.type === "application/pdf") {
    const pdfjs = await import("pdfjs-dist");
    const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
    const data = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data }).promise;
    const pages = Math.min(pdf.numPages, maxPages);
    const out: string[] = [];
    for (let i = 1; i <= pages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1.6 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      out.push(canvas.toDataURL("image/jpeg", 0.85));
    }
    return out;
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("read error"));
    r.readAsDataURL(file);
  });
  return [dataUrl];
}
