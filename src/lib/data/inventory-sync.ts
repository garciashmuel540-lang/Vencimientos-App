/**
 * Orquestador de sincronización entre Dexie (local) y Supabase (nube).
 *
 * Estrategia:
 *  - Dexie es siempre la fuente de verdad local (rápida, offline).
 *  - Supabase es la copia de respaldo y el punto de sync entre dispositivos.
 *  - Los productos se marcan con `pendingSync: true` cuando no se pudo subir.
 *  - Al hacer login, se hace un merge bidireccional.
 */
import { getDb } from "@/lib/vigia/db";
import type { Product } from "@/lib/vigia/types";
import {
  mapProductToInput,
  mapRowToProduct,
  pullMyInventory,
  pushInventoryItem,
  deleteInventoryItem,
  type InventoryRow,
} from "@/lib/data/inventory-supabase";

/**
 * Resultado del merge inicial.
 */
export interface SyncResult {
  pulled: number;       // items traídos de Supabase
  pushed: number;       // items subidos a Supabase
  merged: number;       // items que existían en ambos y se resolvieron
  errors: string[];
}

/**
 * Al hacer login: trae todo de Supabase, y hace merge con Dexie local.
 *
 * Reglas del merge:
 *  1. Si existe solo en Supabase → se agrega a Dexie.
 *  2. Si existe solo en Dexie y pendingSync=true → se sube a Supabase.
 *  3. Si existe en ambos:
 *     - Si el de Supabase es más nuevo (updated_at > updatedAt) → gana Supabase.
 *     - Si el local es más nuevo → se sube.
 *     - Si son iguales → se queda Dexie como está.
 */
export async function syncOnLogin(): Promise<SyncResult> {
  const result: SyncResult = { pulled: 0, pushed: 0, merged: 0, errors: [] };
  const db = getDb();

  // 0) Detectar cambio de usuario y limpiar datos locales del usuario anterior
  const { supabase } = await import("@/lib/supabase");
  let currentUserId: string | null = null;
  if (supabase) {
    const { data } = await supabase.auth.getUser();
    currentUserId = data.user?.id ?? null;
  }

  const lastUserIdRow = await db.kv.get("lastUserId");
  const lastUserId = (lastUserIdRow?.value as string | undefined) ?? null;

  // Limpiar si:
  //  - Hay un usuario logueado Y
  //  - (no había lastUserId guardado, O el usuario cambió)
  const shouldClear =
    currentUserId !== null &&
    (lastUserId === null || currentUserId !== lastUserId);

  if (shouldClear) {
    const localCount = await db.products.count();
    if (localCount > 0) {
      console.info(
        `[inventory-sync] limpieza por cambio/primera sesión (${lastUserId ?? "null"} → ${currentUserId}). ${localCount} productos locales borrados.`,
      );
      await db.products.clear();
      await db.history.clear();
      result.errors.push("cleared_on_user_change");
    }
  }

  // Guardar el userId actual para la próxima
  if (currentUserId) {
    await db.kv.put({ key: "lastUserId", value: currentUserId });
  }

  // 1) Traer todo de Supabase
  let remoteRows: InventoryRow[] = [];
  try {
    remoteRows = await pullMyInventory();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    console.warn("[inventory-sync] no se pudo traer de Supabase:", msg);
    result.errors.push(`pull: ${msg}`);
    // Sin conexión → intentamos subir pendientes locales (por si acaso)
    const pushed = await flushPending();
    result.pushed = pushed;
    return result;
  }

  // 2) Leer todo lo local
  const localProducts = await db.products.toArray();
  const localById = new Map<string, Product>();
  for (const p of localProducts) localById.set(p.id, p);

  // 3) Mapear remotos por id
  const remoteById = new Map<string, InventoryRow>();
  for (const r of remoteRows) remoteById.set(r.id, r);

  const now = new Date().toISOString();

  // 4) Recorrer remotos: agregar o resolver conflicto
  for (const row of remoteRows) {
    const local = localById.get(row.id);
    if (!local) {
      // Solo en Supabase → agregar a Dexie
      const product = mapRowToProduct(row);
      await db.products.put(product);
      result.pulled++;
    } else {
      // Existe en ambos → comparar updatedAt
      const remoteUpdated = row.updated_at;
      const localUpdated = local.updatedAt ?? "";

      if (remoteUpdated > localUpdated && !local.pendingSync) {
        // Supabase es más nuevo → gana la nube
        const product = mapRowToProduct(row);
        await db.products.put(product);
        result.merged++;
      } else if (local.pendingSync) {
        // Local tiene cambios sin subir → se queda local, se sube abajo
        // (no hacemos nada aquí, se maneja en flushPending)
      }
      // si localUpdated >= remoteUpdated → se queda local tal cual
    }
  }

  // 5) NO marcamos automáticamente los locales como pendientes.
  //    Solo se suben a Supabase los que tienen pendingSync=true explícito
  //    (porque el usuario los agregó/editó/consumió en esta sesión).
  //    Los locales huérfanos (sin pendingSync) se quedan solo en Dexie.
  //    Si el usuario quiere subirlos, tendrá que editar algo o usar un botón.

  // 6) Subir pendientes
  const pushed = await flushPending();
  result.pushed = pushed;

  // 7) Actualizar timestamp del último sync
  await db.kv.put({ key: "inventoryLastSync", value: now });

  console.info(
    `[inventory-sync] login sync: pulled=${result.pulled} pushed=${result.pushed} merged=${result.merged}`,
  );
  return result;
}

/**
 * Marca un producto local como pendiente de subir.
 */
export async function markPending(id: string): Promise<void> {
  const db = getDb();
  await db.products.update(id, { pendingSync: true });
}

/**
 * Sube a Supabase todos los productos marcados como pendingSync.
 * Devuelve cuántos se subieron exitosamente.
 */
export async function flushPending(): Promise<number> {
  const db = getDb();
  const pending = await db.products.filter((p) => p.pendingSync === true).toArray();

  if (pending.length === 0) return 0;

  let subidos = 0;
  for (const product of pending) {
    try {
      const input = mapProductToInput(product);
      await pushInventoryItem(input);
      // Quitar la marca de pendiente
      await db.products.update(product.id, { pendingSync: false });
      subidos++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      console.warn(`[inventory-sync] no se pudo subir ${product.id}:`, msg);
      // Se queda pendiente para el próximo intento
    }
  }

  return subidos;
}

/**
 * Sube un producto puntual a Supabase (después de agregar o editar localmente).
 * Si falla, lo deja marcado como pendingSync.
 */
export async function syncPush(product: Product): Promise<void> {
  const db = getDb();
  try {
    const input = mapProductToInput(product);
    await pushInventoryItem(input);
    // Marcar como sincronizado
    await db.products.update(product.id, { pendingSync: false });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    console.warn(`[inventory-sync] syncPush falló para ${product.id}:`, msg);
    // Marcar como pendiente para reintentar después
    await db.products.update(product.id, { pendingSync: true });
  }
}

/**
 * Borra un producto en Supabase. Si falla, lo intentaremos después.
 */
export async function syncDelete(id: string): Promise<void> {
  try {
    await deleteInventoryItem(id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    console.warn(`[inventory-sync] syncDelete falló para ${id}:`, msg);
    // TODO: implementar cola de borrados pendientes
  }
}
