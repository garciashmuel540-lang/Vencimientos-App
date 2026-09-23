/** Estado de inventario en el cliente, respaldado por IndexedDB. */
import { create } from "zustand";
import { addHistory, getDb, getSettings, saveSettings, setKv } from "./db";
import { rememberCatalog } from "./lookup";
import {
  persistAlertSnapshot,
  computeAlerts,
  dispatchAlerts,
  ensureServiceWorker,
  registerPeriodicSync,
} from "./notifications";
import { daysUntil } from "./dates";
import { buildDemoCatalog, buildDemoHistory, buildDemoProducts } from "./seed";
import {
  DEFAULT_SETTINGS,
  type AlertSettings,
  type HistoryEntry,
  type Product,
  type ProductCategory,
  type StoreLocation,
} from "./types";

export interface ProductDraft {
  barcode: string;
  name: string;
  brand: string;
  presentation: string;
  category: ProductCategory;
  expiresAt: string;
  quantity: number;
  location: StoreLocation;
  notes: string;
  image: string | null;
  source: Product["source"];
}

interface VigiaState {
  ready: boolean;
  products: Product[];
  history: HistoryEntry[];
  settings: AlertSettings;
  demo: boolean;
  hydrate: () => Promise<void>;
  refresh: () => Promise<void>;
  upsertProduct: (draft: ProductDraft, id?: string) => Promise<Product>;
  consume: (id: string, amount?: number) => Promise<void>;
  remove: (id: string) => Promise<void>;
  updateSettings: (patch: Partial<AlertSettings>) => Promise<void>;
  clearDemo: () => Promise<void>;
  resetAll: () => Promise<void>;
  fireOpenAlerts: () => Promise<void>;
}

async function readAll() {
  const db = getDb();
  const [products, history, settings, seeded] = await Promise.all([
    db.products.toArray(),
    db.history.orderBy("at").reverse().limit(200).toArray(),
    getSettings(),
    db.kv.get("seeded"),
  ]);
  products.sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
  return {
    products,
    history,
    settings,
    demo: Boolean(seeded?.value),
  };
}

export const useVigiaStore = create<VigiaState>((set, get) => ({
  ready: false,
  products: [],
  history: [],
  settings: DEFAULT_SETTINGS,
  demo: false,

  hydrate: async () => {
    if (typeof window === "undefined") return;
    const db = getDb();
    const count = await db.products.count();
    if (count === 0) {
      const products = buildDemoProducts();
      const catalog = buildDemoCatalog(products);
      const history = buildDemoHistory(products);
      await db.products.bulkAdd(products);
      await db.catalog.bulkPut(catalog);
      await db.history.bulkAdd(history);
      await setKv("seeded", true);
    }
    const data = await readAll();
    set({ ...data, ready: true });
    void persistAlertSnapshot(computeAlerts(data.products, data.settings));
    void ensureServiceWorker().then(() => registerPeriodicSync());
  },

  refresh: async () => {
    const data = await readAll();
    set(data);
    void persistAlertSnapshot(computeAlerts(data.products, data.settings));
  },

  upsertProduct: async (draft, id) => {
    const now = new Date().toISOString();
    const existing = id
      ? await getDb().products.get(id)
      : undefined;
    const product: Product = {
      id: existing?.id ?? crypto.randomUUID(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      barcode: draft.barcode.trim(),
      name: draft.name.trim(),
      brand: draft.brand.trim(),
      presentation: draft.presentation.trim(),
      category: draft.category,
      expiresAt: draft.expiresAt,
      quantity: Math.max(1, Math.round(draft.quantity) || 1),
      location: draft.location,
      notes: draft.notes.trim(),
      image: draft.image,
      source: draft.source,
    };
    await getDb().products.put(product);
    await rememberCatalog({
      barcode: product.barcode,
      name: product.name,
      brand: product.brand,
      presentation: product.presentation,
      category: product.category,
      image: product.image,
      source: product.source,
    });
    await addHistory({
      productId: product.id,
      action: existing ? "updated" : "created",
      name: product.name,
      barcode: product.barcode,
      snapshot: `${product.brand} · ${product.quantity} pzas · vence ${product.expiresAt}`,
    });
    await get().refresh();
    return product;
  },

  consume: async (id, amount = 1) => {
    const product = await getDb().products.get(id);
    if (!product) return;
    const nextQty = product.quantity - amount;
    if (nextQty <= 0) {
      await getDb().products.delete(id);
      await addHistory({
        productId: id,
        action: "consumed",
        name: product.name,
        barcode: product.barcode,
        snapshot: "Se agotó / se vendió el lote",
      });
    } else {
      await getDb().products.update(id, {
        quantity: nextQty,
        updatedAt: new Date().toISOString(),
      });
      await addHistory({
        productId: id,
        action: "consumed",
        name: product.name,
        barcode: product.barcode,
        snapshot: `Quedan ${nextQty} unidades`,
      });
    }
    await get().refresh();
  },

  remove: async (id) => {
    const product = await getDb().products.get(id);
    if (!product) return;
    await getDb().products.delete(id);
    const expired = daysUntil(product.expiresAt) < 0;
    await addHistory({
      productId: id,
      action: expired ? "expired" : "removed",
      name: product.name,
      barcode: product.barcode,
      snapshot: `${product.brand} · ${product.quantity} pzas`,
    });
    await get().refresh();
  },

  updateSettings: async (patch) => {
    const next = { ...get().settings, ...patch };
    await saveSettings(next);
    set({ settings: next });
    void persistAlertSnapshot(computeAlerts(get().products, next));
  },

  clearDemo: async () => {
    const db = getDb();
    await db.products.clear();
    await db.history.clear();
    await setKv("seeded", false);
    await get().refresh();
    set({ demo: false });
  },

  resetAll: async () => {
    const db = getDb();
    await db.products.clear();
    await db.catalog.clear();
    await db.history.clear();
    await db.apiCache.clear();
    const products = buildDemoProducts();
    await db.products.bulkAdd(products);
    await db.catalog.bulkPut(buildDemoCatalog(products));
    await db.history.bulkAdd(buildDemoHistory(products));
    await setKv("seeded", true);
    await saveSettings(DEFAULT_SETTINGS);
    await get().refresh();
    set({ demo: true, settings: DEFAULT_SETTINGS });
  },

  fireOpenAlerts: async () => {
    const { products, settings } = get();
    if (!settings.notifyOnOpen) return;
    const alerts = computeAlerts(products, settings);
    const urgent = alerts.filter((a) => a.level === "expired" || a.level === "today");
    if (!urgent.length) return;
    await dispatchAlerts(urgent, settings, { viaNotification: true });
  },
}));
