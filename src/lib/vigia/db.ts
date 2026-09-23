/**
 * Persistencia local con IndexedDB (Dexie).
 * Todo el inventario vive en el dispositivo: funciona sin conexión.
 */
import Dexie, { type Table } from "dexie";
import type {
  AlertSettings,
  ApiCacheEntry,
  CatalogEntry,
  HistoryEntry,
  Product,
} from "./types";
import { DEFAULT_SETTINGS } from "./types";

export class VigiaDB extends Dexie {
  products!: Table<Product, string>;
  catalog!: Table<CatalogEntry, string>;
  history!: Table<HistoryEntry, string>;
  apiCache!: Table<ApiCacheEntry, string>;
  kv!: Table<{ key: string; value: unknown }, string>;

  constructor() {
    super("VigiaDB");
    this.version(1).stores({
      products: "id, barcode, name, category, location, expiresAt, updatedAt",
      catalog: "barcode, name, fetchedAt",
      history: "id, productId, action, at",
      apiCache: "barcode, fetchedAt",
      kv: "key",
    });
  }
}

let _db: VigiaDB | null = null;

export function getDb(): VigiaDB {
  if (typeof window === "undefined") {
    throw new Error("IndexedDB solo está disponible en el navegador");
  }
  if (!_db) _db = new VigiaDB();
  return _db;
}

export async function getSettings(): Promise<AlertSettings> {
  const row = await getDb().kv.get("settings");
  if (!row) return { ...DEFAULT_SETTINGS };
  return { ...DEFAULT_SETTINGS, ...(row.value as AlertSettings) };
}

export async function saveSettings(settings: AlertSettings): Promise<void> {
  await getDb().kv.put({ key: "settings", value: settings });
}

export async function getKv<T>(key: string, fallback: T): Promise<T> {
  const row = await getDb().kv.get(key);
  return row ? (row.value as T) : fallback;
}

export async function setKv(key: string, value: unknown): Promise<void> {
  await getDb().kv.put({ key, value });
}

export async function addHistory(
  entry: Omit<HistoryEntry, "id" | "at"> & { id?: string; at?: string },
): Promise<void> {
  await getDb().history.add({
    id: entry.id ?? crypto.randomUUID(),
    at: entry.at ?? new Date().toISOString(),
    productId: entry.productId,
    action: entry.action,
    name: entry.name,
    barcode: entry.barcode,
    snapshot: entry.snapshot,
  });
}
