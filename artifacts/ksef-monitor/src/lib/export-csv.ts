// Eksport CSV zoptymalizowany pod polski Excel/Arkusze Google:
// - BOM UTF-8 → poprawne polskie znaki (ł, ż, ą…),
// - separator ';' → kolumny rozdzielają się poprawnie (w PL Excelu ',' to separator
//   dziesiętny, więc przecinek jako delimiter rozwalał układ do jednej kolumny),
// - liczby z przecinkiem dziesiętnym → Excel PL traktuje je jako liczby (nie tekst),
// - CRLF + rozszerzenie .csv → plik od razu otwiera się jako arkusz.
const DELIM = ";";

function formatCell(cell: string | number | null | undefined): string {
  if (cell === null || cell === undefined) return "";
  if (typeof cell === "number") {
    return Number.isFinite(cell) ? String(cell).replace(".", ",") : "";
  }
  const str = String(cell);
  if (str.includes(DELIM) || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportToCsv(rows: (string | number | null | undefined)[][], filename: string) {
  const BOM = "﻿";
  const csv = BOM + rows.map((row) => row.map(formatCell).join(DELIM)).join("\r\n");

  const name = filename.toLowerCase().endsWith(".csv") ? filename : `${filename}.csv`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function todaySlug() {
  return new Date().toISOString().slice(0, 10);
}
