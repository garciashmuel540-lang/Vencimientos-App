/**
 * Cliente para sincronizar el inventario con Supabase.
 * El inventario es PRIVADO: cada usuario ve solo el suyo (RLS).
 * El admin (role=admin) ve TODAS las filas.
 */
import { supabase } from "@/lib/supabase";
import type { Product, ProductCategory, StoreLocation } from "@/lib/vigia/types";

/**
 * Representa una fila de inventory_items tal como está en Supabase.
 * Incluye campos desnormalizados del catálogo (name, brand, etc.) para
 * evitar joins al renderizar.
 */
export interface InventoryRow {
  id: string;
  user_id: string;
  barcode: string;
  name: string | null;
  brand: string | null;
  presentation: string | null;
  category: string | null;
  location: string | null;
  expires_at: string;
  stock: number;
  notes: string | null;
  image: string | null;
  source: string | null;
  price: number | null;
  price_c: number | null;
  subcategory: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Payload para insertar/actualizar un item.
 * NO incluye user_id porque el RLS lo llena automáticamente.
 */
export interface InventoryItemInput {
  id?: string;
  barcode: string;
  name?: string | null;
  brand?: string | null;
  presentation?: string | null;
  category?: string | null;
  location?: string | null;
  expires_at: string;
  stock: number;
  notes?: string | null;
  image?: string | null;
  source?: string | null;
  price?: number | null;
  price_c?: number | null;
  subcategory?: string | null;
}

/**
 * Convierte un Product (Dexie) a un payload de Supabase.
 */
export function mapProductToInput(p: Product): InventoryItemInput {
  return {
    id: p.id,
    barcode: p.barcode,
    name: p.name,
    brand: p.brand,
    presentation: p.presentation,
    category: p.category,
    location: p.location,
    expires_at: p.expiresAt,
    stock: p.quantity,
    notes: p.notes,
    image: p.image,
    source: p.source,
    price: typeof p.price === "number" ? p.price : null,
    price_c: typeof p.priceC === "number" ? p.priceC : null,
    subcategory: p.subcategory ?? null,
  };
}

/**
 * Convierte una fila de Supabase a un Product (Dexie).
 */
export function mapRowToProduct(row: InventoryRow): Product {
  return {
    id: row.id,
    barcode: row.barcode,
    name: row.name ?? "",
    brand: row.brand ?? "",
    presentation: row.presentation ?? "",
    category: (row.category ?? "otros") as ProductCategory,
    expiresAt: row.expires_at,
    quantity: row.stock,
    location: (row.location ?? "estante") as StoreLocation,
    notes: row.notes ?? "",
    image: row.image ?? null,
    source: (row.source ?? "manual") as Product["source"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    price: typeof row.price === "number" ? row.price : undefined,
    priceC: typeof row.price_c === "number" ? row.price_c : undefined,
    subcategory: row.subcategory ?? undefined,
  };
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
 * Inserta (o actualiza) un item en el inventario del usuario actual.
 * onConflict: user_id + barcode + expires_at.
 */
export async function pushInventoryItem(
  item: InventoryItemInput,
): Promise<InventoryRow> {
  if (!supabase) throw new Error("Supabase no configurado");

  const payload: Record<string, unknown> = {
    barcode: item.barcode,
    expires_at: item.expires_at,
    stock: item.stock,
    notes: item.notes ?? null,
    name: item.name ?? null,
    brand: item.brand ?? null,
    presentation: item.presentation ?? null,
    category: item.category ?? null,
    location: item.location ?? null,
    image: item.image ?? null,
    source: item.source ?? null,
    price: item.price ?? null,
    price_c: item.price_c ?? null,
    subcategory: item.subcategory ?? null,
  };
  // Solo mandamos id si viene (si no, Supabase lo genera)
  if (item.id) payload.id = item.id;

  const { data, error } = await supabase
    .from("inventory_items")
    .upsert(payload, { onConflict: "user_id,barcode,expires_at" })
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

  const rows = items.map((it) => {
    const row: Record<string, unknown> = {
      barcode: it.barcode,
      expires_at: it.expires_at,
      stock: it.stock,
      notes: it.notes ?? null,
      name: it.name ?? null,
      brand: it.brand ?? null,
      presentation: it.presentation ?? null,
      category: it.category ?? null,
      location: it.location ?? null,
      image: it.image ?? null,
      source: it.source ?? null,
      price: it.price ?? null,
      price_c: it.price_c ?? null,
      subcategory: it.subcategory ?? null,
    };
    if (it.id) row.id = it.id;
    return row;
  });

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

  const payload: Record<string, unknown> = {};
  if (patch.barcode !== undefined) payload.barcode = patch.barcode;
  if (patch.expires_at !== undefined) payload.expires_at = patch.expires_at;
  if (patch.stock !== undefined) payload.stock = patch.stock;
  if (patch.notes !== undefined) payload.notes = patch.notes;
  if (patch.name !== undefined) payload.name = patch.name;
  if (patch.brand !== undefined) payload.brand = patch.brand;
  if (patch.presentation !== undefined) payload.presentation = patch.presentation;
  if (patch.category !== undefined) payload.category = patch.category;
  if (patch.location !== undefined) payload.location = patch.location;
  if (patch.image !== undefined) payload.image = patch.image;
  if (patch.source !== undefined) payload.source = patch.source;
  if (patch.price !== undefined) payload.price = patch.price;
  if (patch.price_c !== undefined) payload.price_c = patch.price_c;
  if (patch.subcategory !== undefined) payload.subcategory = patch.subcategory;

  const { data, error } = await supabase
    .from("inventory_items")
    .update(payload)
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
