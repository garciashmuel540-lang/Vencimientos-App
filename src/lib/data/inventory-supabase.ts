/**
 * Cliente para sincronizar el inventario con Supabase.
 * El inventario es PRIVADO: cada usuario ve solo el suyo (RLS).
 * El admin (role=admin) ve TODAS las filas.
 */
import { supabase } from "@/lib/supabase";

/**
 * Representa una fila de inventory_items tal como está en Supabase.
 */
export interface InventoryRow {
  id: string;
  user_id: string;
  barcode: string;
  expires_at: string; // ISO date "YYYY-MM-DD"
  stock: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Payload para insertar/actualizar un item.
 * NO incluye user_id porque el RLS lo llena automáticamente.
 */
export interface InventoryItemInput {
  barcode: string;
  expires_at: string;
  stock: number;
  notes?: string | null;
}

/**
 * Cuenta cuántos items tiene el usuario actual.
 */
export async function countMyInventory(): Promise<number> {
  if (!supabase) return 0;
  const { count, error } = await supabase
    .from("inventory_items")
    .select("*", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * Trae TODO el inventario del usuario actual.
 * Para admin, trae el de todos (por la política "Admins see all inventory").
 */
export async function pullMyInventory(): Promise<InventoryRow[]> {
  if (!supabase) throw new Error("Supabase no configurado");

  const PAGE_SIZE = 1000;
  const allRows: InventoryRow[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from("inventory_items")
      .select("*")
      .order("expires_at")
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);
    const page = (data ?? []) as InventoryRow[];
    allRows.push(...page);

    if (page.length < PAGE_SIZE) {
      hasMore = false;
    } else {
      from += PAGE_SIZE;
    }
  }

  console.info(
    `[vigia] inventario descargado de Supabase: ${allRows.length} items`,
  );
  return allRows;
}

/**
 * Inserta un item nuevo en el inventario del usuario actual.
 * Si ya existe (mismo user_id + barcode + expires_at), lo actualiza (upsert).
 */
export async function pushInventoryItem(
  item: InventoryItemInput,
): Promise<InventoryRow> {
  if (!supabase) throw new Error("Supabase no configurado");

  const { data, error } = await supabase
    .from("inventory_items")
    .upsert(
      {
        barcode: item.barcode,
        expires_at: item.expires_at,
        stock: item.stock,
        notes: item.notes ?? null,
      },
      { onConflict: "user_id,barcode,expires_at" },
    )
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as InventoryRow;
}

/**
 * Sube un lote de items (para migración inicial o sync masiva).
 * Usa upsert para no duplicar si ya existen.
 */
export async function pushInventoryBatch(
  items: InventoryItemInput[],
): Promise<number> {
  if (!supabase) throw new Error("Supabase no configurado");
  if (items.length === 0) return 0;

  const rows = items.map((it) => ({
    barcode: it.barcode,
    expires_at: it.expires_at,
    stock: it.stock,
    notes: it.notes ?? null,
  }));

  const { error } = await supabase
    .from("inventory_items")
    .upsert(rows, { onConflict: "user_id,barcode,expires_at" });

  if (error) throw new Error(error.message);
  return rows.length;
}

/**
 * Migra TODO el inventario local a Supabase, en lotes.
 */
export async function pushFullInventory(
  items: InventoryItemInput[],
  onProgress?: (subidos: number, total: number) => void,
): Promise<{ subidos: number; errores: number }> {
  const BATCH_SIZE = 100;
  let subidos = 0;
  let errores = 0;

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    try {
      await pushInventoryBatch(batch);
      subidos += batch.length;
      onProgress?.(subidos, items.length);
    } catch (err) {
      console.error("[inventory-supabase] error en lote:", err);
      errores += batch.length;
    }
  }

  return { subidos, errores };
}

/**
 * Actualiza un item existente por id.
 */
export async function updateInventoryItem(
  id: string,
  patch: Partial<InventoryItemInput>,
): Promise<InventoryRow> {
  if (!supabase) throw new Error("Supabase no configurado");

  const { data, error } = await supabase
    .from("inventory_items")
    .update({
      ...(patch.barcode !== undefined ? { barcode: patch.barcode } : {}),
      ...(patch.expires_at !== undefined ? { expires_at: patch.expires_at } : {}),
      ...(patch.stock !== undefined ? { stock: patch.stock } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as InventoryRow;
}

/**
 * Borra un item por id.
 */
export async function deleteInventoryItem(id: string): Promise<void> {
  if (!supabase) throw new Error("Supabase no configurado");

  const { error } = await supabase
    .from("inventory_items")
    .delete()
    .eq("id", id);

  if (error) throw new Error(error.message);
}
