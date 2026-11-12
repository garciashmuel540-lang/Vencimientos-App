import { format } from "date-fns";
import { parseDate, statusOf } from "./dates";
import { CATEGORY_LABEL, LOCATION_LABEL, type Product } from "./types";
import type { ExpiryImageRow } from "./inventory-share";

export function expiryReportRows(
  products: Product[],
  threshold: number,
  today: Date,
): ExpiryImageRow[] {
  return products
    .map((product): ExpiryImageRow => {
      const date = parseDate(product.expiresAt);
      const status = date ? statusOf(product.expiresAt, threshold, today) : null;
      return {
        name: product.name,
        code: product.barcode,
        category: CATEGORY_LABEL[product.category] ?? "Sin categoría",
        detail: [product.brand, product.presentation, product.notes].filter(Boolean).join(" · "),
        quantity: product.quantity,
        expires: date ? format(date, "dd/MM/yyyy") : "—",
        location: LOCATION_LABEL[product.location] ?? "—",
        status: status === "ok" ? "current" : (status ?? "undated"),
      };
    })
    .sort((a, b) => a.category.localeCompare(b.category, "es"));
}
