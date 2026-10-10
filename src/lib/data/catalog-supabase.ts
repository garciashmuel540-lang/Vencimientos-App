/**
 * Cliente para sincronizar el catálogo con Supabase.
 * El catálogo es COMPARTIDO entre todos los usuarios.
 */
import { supabase } from "@/lib/supabase";
import type { CatalogEntry } from "@/lib/vigia/types";

interface CatalogRow {
  barcode: string;
  name: string;
  brand: string;
  presentation: string;
  category: string;
  department: string | null;
  supplier: string | null;
  price: number | null;
  price_c: number | null;
  cost: number | null;
  qty_snapshot: number | null;
  inactive: boolean;
  image: string | null;
  source: string;
  fetched_at: string;
  updated_at: string;
}

/**
 * Cuenta cuántos productos hay en Supabase.
 */
export async function countCatalogSupabase(): Promise<number> {
  if (!supabase) return 0;
  const { count, error } = await supabase
    .from("catalog")
    .select("*", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * Sube un lote de productos a Supabase.
 * Devuelve cuántos se subieron.
 */
export async function pushCatalogBatch(
  entries: CatalogEntry[],
): Promise<number> {
  if (!supabase) throw new Error("Supabase no configurado");
  if (entries.length === 0) return 0;

  const rows: CatalogRow[] = entries.map((e) => ({
    barcode: e.barcode,
    name: e.name,
    brand: e.brand ?? "",
    presentation: e.presentation ?? "",
    category: e.category ?? "otros",
    department: e.department ?? null,
    supplier: e.supplier ?? null,
    price: typeof e.price === "number" ? e.price : null,
    price_c: typeof e.priceC === "number" ? e.priceC : null,
    cost: typeof e.cost === "number" ? e.cost : null,
    qty_snapshot: typeof e.qtySnapshot === "number" ? e.qtySnapshot : null,
    inactive: Boolean(e.inactive),
    image: e.image ?? null,
    source: e.source ?? "manual",
    fetched_at: e.fetchedAt ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("catalog")
    .upsert(rows, { onConflict: "barcode" });

  if (error) throw new Error(error.message);
  return rows.length;
}

/**
 * Migra TODO el catálogo local a Supabase.
 * Divide en lotes de 100 para no saturar la API.
 */
export async function pushFullCatalog(
  entries: CatalogEntry[],
  onProgress?: (subidos: number, total: number) => void,
): Promise<{ subidos: number; errores: number }> {
  const BATCH_SIZE = 100;
  let subidos = 0;
  let errores = 0;

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    try {
      await pushCatalogBatch(batch);
      subidos += batch.length;
      onProgress?.(subidos, entries.length);
    } catch (err) {
      console.error("[catalog-supabase] error en lote:", err);
      errores += batch.length;
    }
  }

  return { subidos, errores };
}

/**
 * Lee el catálogo completo desde Supabase.
 * (Para uso futuro, cuando la app lea directamente de la nube.)
 */
export async function fetchCatalogFromSupabase(): Promise<CatalogEntry[]> {
  if (!supabase) throw new Error("Supabase no configurado");

  // Paginación: Supabase devuelve máximo 1000 filas por request.
  // Traemos de a 1000 hasta agotar todas las páginas.
  const PAGE_SIZE = 1000;
  const allRows: CatalogRow[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from("catalog")
      .select("*")
      .order("name")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as CatalogRow[];
    allRows.push(...page);
    if (page.length < PAGE_SIZE) {
      hasMore = false;
    } else {
      from += PAGE_SIZE;
    }
  }

  console.info(
    `[vigia] catálogo descargado de Supabase: ${allRows.length} productos`,
  );

  return allRows.map((row) => ({
    barcode: row.barcode,
    name: row.name,
    brand: row.brand ?? "",
    presentation: row.presentation ?? "",
    category: (row.category ?? "otros") as CatalogEntry["category"],
    department: row.department ?? undefined,
    supplier: row.supplier ?? undefined,
    price: typeof row.price === "number" ? row.price : undefined,
    priceC: typeof row.price_c === "number" ? row.price_c : undefined,
    cost: typeof row.cost === "number" ? row.cost : undefined,
    qtySnapshot:
      typeof row.qty_snapshot === "number" ? row.qty_snapshot : undefined,
    inactive: Boolean(row.inactive),
    image: row.image ?? null,
    source: (row.source ?? "manual") as CatalogEntry["source"],
    fetchedAt: row.fetched_at ?? new Date().toISOString(),
  }));
}

/**
 * Sincroniza el catálogo desde Supabase hacia IndexedDB (caché local).
 * Se llama en background al abrir la app.
 * Devuelve cuántos productos se sincronizaron.
 */
export async function syncCatalogFromSupabase(): Promise<{
  count: number;
  error?: string;
}> {
  if (!supabase) {
    return { count: 0, error: "Supabase no configurado" };
  }
  try {
    const entries = await fetchCatalogFromSupabase();
    if (entries.length === 0) {
      return { count: 0, error: "Supabase devolvió 0 productos" };
    }

    const { getDb, setKv } = await import("@/lib/vigia/db");
    const db = getDb();

    // Reemplazar el catálogo local con el de Supabase
    await db.transaction("rw", db.catalog, async () => {
      await db.catalog.clear();
      await db.catalog.bulkPut(entries);
    });
    await setKv("catalogLastSync", new Date().toISOString());

    console.info(
      `[vigia] catálogo sincronizado desde Supabase: ${entries.length} productos`,
    );
    return { count: entries.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    console.warn("[vigia] no se pudo sincronizar catálogo:", msg);
    return { count: 0, error: msg };
  }
}
