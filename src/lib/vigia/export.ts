/** Exportación CSV / impresión de reportes. */
import { daysUntil, formatDate, statusLabel, statusOf } from "./dates";
import {
  CATEGORY_LABEL,
  LOCATION_LABEL,
  type Product,
} from "./types";

export function toCsv(products: Product[]): string {
  const header = [
    "Codigo",
    "Nombre",
    "Marca",
    "Presentacion",
    "Categoria",
    "Vencimiento",
    "Dias",
    "Estado",
    "Cantidad",
    "Ubicacion",
    "Notas",
  ];
  const rows = products.map((p) => [
    p.barcode,
    p.name,
    p.brand,
    p.presentation,
    CATEGORY_LABEL[p.category],
    p.expiresAt,
    String(daysUntil(p.expiresAt)),
    statusLabel(statusOf(p.expiresAt)),
    String(p.quantity),
    LOCATION_LABEL[p.location],
    p.notes,
  ]);
  const esc = (v: string) => `"${v.replaceAll('"', '""')}"`;
  return "\uFEFF" + [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
}

export function downloadText(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadCsv(products: Product[]) {
  const stamp = new Date().toISOString().slice(0, 10);
  downloadText(`vigia-inventario-${stamp}.csv`, toCsv(products), "text/csv;charset=utf-8");
}

export function printReport() {
  window.print();
}
