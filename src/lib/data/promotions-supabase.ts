/**
 * Cliente para sincronizar promociones con Supabase.
 * Las promociones son COMPARTIDAS entre todos los usuarios.
 */
import { supabase } from "@/lib/supabase";
import type { Promotion } from "@/lib/vigia/types";

interface PromotionRow {
  id: string;
  barcode: string;
  name: string;
  dynamic: string;
  price_before: number | null;
  price_now: number | null;
  price_before_pya: number | null;
  price_now_pya: number | null;
  category: string | null;
  subcategory: string | null;
  start_date: string | null;
  end_date: string | null;
  observations: string | null;
  source_file: string;
  imported_at: string;
}

function toRow(p: Promotion): Omit<PromotionRow, "id"> {
  return {
    barcode: p.barcode,
    name: p.name,
    dynamic: p.dynamic ?? "",
    price_before:
      typeof p.priceBefore === "number" ? p.priceBefore : null,
    price_now: typeof p.priceNow === "number" ? p.priceNow : null,
    price_before_pya:
      typeof p.priceBeforePYA === "number" ? p.priceBeforePYA : null,
    price_now_pya:
      typeof p.priceNowPYA === "number" ? p.priceNowPYA : null,
    category: p.category ?? null,
    subcategory: p.subcategory ?? null,
    start_date: p.startDate ?? null,
    end_date: p.endDate ?? null,
    observations: p.observations ?? null,
    source_file: p.sourceFile,
    imported_at: p.importedAt ?? new Date().toISOString(),
  };
}

function toPromotion(row: PromotionRow): Promotion {
  return {
    id: row.id,
    barcode: row.barcode,
    name: row.name,
    dynamic: row.dynamic ?? "",
    priceBefore:
      typeof row.price_before === "number" ? row.price_before : 0,
    priceNow: typeof row.price_now === "number" ? row.price_now : 0,
    priceBeforePYA:
      typeof row.price_before_pya === "number"
        ? row.price_before_pya
        : undefined,
    priceNowPYA:
      typeof row.price_now_pya === "number" ? row.price_now_pya : undefined,
    category: row.category ?? undefined,
    subcategory: row.subcategory ?? undefined,
    startDate: row.start_date ?? undefined,
    endDate: row.end_date ?? undefined,
    observations: row.observations ?? undefined,
    sourceFile: row.source_file,
    importedAt: row.imported_at,
  };
}

export async function countPromotionsSupabase(): Promise<number> {
  if (!supabase) return 0;
  const { count, error } = await supabase
    .from("promotions")
    .select("*", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function pushPromotionsBatch(
  promotions: Promotion[],
): Promise<number> {
  if (!supabase) throw new Error("Supabase no configurado");
  if (promotions.length === 0) return 0;

  const rows = promotions.map(toRow);
  const { error } = await supabase.from("promotions").insert(rows);
  if (error) throw new Error(error.message);
  return rows.length;
}

export async function pushFullPromotions(
  promotions: Promotion[],
  onProgress?: (subidos: number, total: number) => void,
): Promise<{ subidos: number; errores: number }> {
  // Borrar UNA SOLA VEZ las promociones anteriores del mismo archivo
  const sourceFiles = Array.from(new Set(promotions.map((p) => p.sourceFile)));
  for (const sf of sourceFiles) {
    await deletePromotionsSourceSupabase(sf);
  }

  const BATCH_SIZE = 100;
  let subidos = 0;
  let errores = 0;

  for (let i = 0; i < promotions.length; i += BATCH_SIZE) {
    const batch = promotions.slice(i, i + BATCH_SIZE);
    try {
      await pushPromotionsBatch(batch);
      subidos += batch.length;
      onProgress?.(subidos, promotions.length);
    } catch (err) {
      console.error("[promotions-supabase] error en lote:", err);
      errores += batch.length;
    }
  }

  return { subidos, errores };
}

export async function fetchPromotionsFromSupabase(): Promise<Promotion[]> {
  if (!supabase) throw new Error("Supabase no configurado");

  // Paginación: Supabase devuelve máximo 1000 filas por request.
  const PAGE_SIZE = 1000;
  const allRows: PromotionRow[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from("promotions")
      .select("*")
      .order("imported_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as PromotionRow[];
    allRows.push(...page);
    if (page.length < PAGE_SIZE) {
      hasMore = false;
    } else {
      from += PAGE_SIZE;
    }
  }

  console.info(
    `[vigia] promociones descargadas de Supabase: ${allRows.length}`,
  );

  return allRows.map(toPromotion);
}

export async function deletePromotionsSourceSupabase(
  sourceFile: string,
): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from("promotions")
    .delete()
    .eq("source_file", sourceFile);
  if (error) throw new Error(error.message);
}

export async function clearPromotionsSupabase(): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from("promotions")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) throw new Error(error.message);
}

export async function syncPromotionsFromSupabase(): Promise<{
  count: number;
  error?: string;
}> {
  if (!supabase) return { count: 0, error: "Supabase no configurado" };
  try {
    const promotions = await fetchPromotionsFromSupabase();
    if (promotions.length === 0) {
      return { count: 0 };
    }

    const { getDb, setKv } = await import("@/lib/vigia/db");
    const db = getDb();
    await db.transaction("rw", db.promotions, async () => {
      await db.promotions.clear();
      await db.promotions.bulkPut(promotions);
    });
    await setKv("promotionsLastSync", new Date().toISOString());

    console.info(
      `[vigia] promociones sincronizadas desde Supabase: ${promotions.length}`,
    );
    return { count: promotions.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    console.warn("[vigia] no se pudo sincronizar promociones:", msg);
    return { count: 0, error: msg };
  }
}
