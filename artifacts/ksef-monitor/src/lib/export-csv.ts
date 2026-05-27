export function exportToCsv(rows: (string | number | null | undefined)[][], filename: string) {
  const BOM = "\uFEFF";
  const csv =
    BOM +
    rows
      .map((row) =>
        row
          .map((cell) => {
            const str = String(cell ?? "");
            if (str.includes(",") || str.includes("\n") || str.includes('"')) {
              return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
          })
          .join(","),
      )
      .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function todaySlug() {
  return new Date().toISOString().slice(0, 10);
}
