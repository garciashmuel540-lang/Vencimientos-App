export interface StoreProduct {
  barcode: string;
  name: string;
  price: number | null;
  stock: number | null;
}
export interface StoreSnapshot {
  captured_at: string;
  products: StoreProduct[];
}

export function readSnapshot(raw: unknown): StoreSnapshot {
  const row = raw as Partial<StoreSnapshot> | null;
  if (
    !row ||
    typeof row.captured_at !== "string" ||
    !Number.isFinite(Date.parse(row.captured_at)) ||
    !Array.isArray(row.products) ||
    !row.products.length
  )
    throw new Error("El catálogo de la tienda está incompleto.");
  const codes = new Set<string>();
  for (const item of row.products) {
    if (
      !item ||
      typeof item.barcode !== "string" ||
      !item.barcode.trim() ||
      typeof item.name !== "string" ||
      !item.name.trim() ||
      codes.has(item.barcode) ||
      !(item.price === null || (Number.isFinite(item.price) && item.price >= 0)) ||
      !(item.stock === null || Number.isFinite(item.stock))
    )
      throw new Error("La tienda publicó un producto inválido.");
    codes.add(item.barcode);
  }
  return { captured_at: row.captured_at, products: row.products };
}
