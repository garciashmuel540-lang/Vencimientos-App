/** Estado de inventario en el cliente, respaldado por IndexedDB. */
import { create } from "zustand";
import { addHistory, getDb, getKv, getSettings, saveSettings, setKv } from "./db";
import { rememberCatalog } from "./lookup";
import { parsePromotionsFile } from "./promotions-parser";
import { parseCatalogFile } from "./catalog-parser";
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
  type Promotion,
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
  price?: number;
  priceC?: number;
  cost?: number;
  subcategory?: string;
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
  updatePrices: (
    barcode: string,
    prices: { price?: number; priceC?: number; cost?: number },
    context?: {
      name?: string;
      brand?: string;
      category?: string;
      presentation?: string;
    },
  ) => Promise<void>;
  findCatalogMatches: (query: string) => Promise<
    {
      barcode: string;
      name: string;
      brand: string;
      price?: number;
      priceC?: number;
      cost?: number;
    }[]
  >;
  consume: (id: string, amount?: number) => Promise<void>;
  remove: (id: string) => Promise<void>;
  updateSettings: (patch: Partial<AlertSettings>) => Promise<void>;
  importPromotions: (file: File) => Promise<{ count: number; warnings: string[] }>;
  removePromotionSource: (sourceFile: string) => Promise<void>;
  clearAllPromotions: () => Promise<void>;
  listPromotionSources: () => Promise<
    { sourceFile: string; count: number; importedAt: string }[]
  >;
  getActivePromotion: (barcode: string) => Promise<Promotion | null>;
  previewCatalogUpdate: (file: File) => Promise<{
    totalInExcel: number;
    newProducts: number;
    updates: number;
    unchanged: number;
    warnings: string[];
    parsedEntries: import("./types").CatalogEntry[];
    sourceFile: string;
  }>;
  applyCatalogUpdate: (entries: import("./types").CatalogEntry[]) => Promise<{
    added: number;
    updated: number;
  }>;
  catalogStats: () => Promise<{ total: number; lastUpdate: string | null }>;
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

    // Cargar catálogo de precios la primera vez (background, no bloquea)
    void (async () => {
      try {
        const loaded = await getKv("catalogPricesLoaded", false);
        if (loaded) return;
        const res = await fetch("/catalogo-precios.json");
        if (!res.ok) return;
        const data = (await res.json()) as {
          version: number;
          count: number;
          items: Array<{
            barcode: string;
            name: string;
            brand: string;
            presentation?: string;
            category?: string;
            department?: string;
            supplier?: string;
            price?: number;
            priceC?: number;
            cost?: number;
            qtySnapshot?: number;
            inactive?: boolean;
          }>;
        };
        if (!data?.items?.length) return;
        const entries = data.items.map((item) => ({
          barcode: String(item.barcode).trim(),
          name: String(item.name).trim(),
          brand: String(item.brand ?? "").trim(),
          presentation: String(item.presentation ?? "").trim(),
          category: (item.category ?? "otros") as ProductCategory,
          image: null,
          source: "manual" as const,
          fetchedAt: new Date().toISOString(),
          department: item.department,
          supplier: item.supplier,
          price: typeof item.price === "number" ? item.price : undefined,
          priceC: typeof item.priceC === "number" ? item.priceC : undefined,
          cost: typeof item.cost === "number" ? item.cost : undefined,
          qtySnapshot:
            typeof item.qtySnapshot === "number" ? item.qtySnapshot : undefined,
          inactive: Boolean(item.inactive),
        }));
        await db.catalog.bulkPut(entries);
        await setKv("catalogPricesLoaded", true);
        console.info(`[vigia] catálogo cargado: ${entries.length} productos`);
      } catch (err) {
        console.warn("[vigia] no se pudo cargar catálogo de precios:", err);
      }
    })();
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
      price: typeof draft.price === "number" ? draft.price : existing?.price,
      priceC: typeof draft.priceC === "number" ? draft.priceC : existing?.priceC,
      subcategory:
        draft.subcategory?.trim() || existing?.subcategory,
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

  updatePrices: async (barcode, prices, context) => {
    const db = getDb();
    const code = barcode.replace(/\s/g, "");

    // 1. Actualizar catálogo global (o crear si no existe)
    const entry = await db.catalog.get(code);
    if (entry) {
      await db.catalog.put({
        ...entry,
        price:
          typeof prices.price === "number" ? prices.price : entry.price,
        priceC:
          typeof prices.priceC === "number" ? prices.priceC : entry.priceC,
        cost: typeof prices.cost === "number" ? prices.cost : entry.cost,
        name: context?.name?.trim() || entry.name,
        brand: context?.brand?.trim() ?? entry.brand,
        presentation: context?.presentation?.trim() ?? entry.presentation,
      });
    } else {
      const product = await db.products
        .filter((p) => p.barcode === code)
        .first();
      const finalName =
        context?.name?.trim() || product?.name?.trim() || `Producto ${code}`;
      await db.catalog.put({
        barcode: code,
        name: finalName,
        brand: context?.brand?.trim() ?? product?.brand ?? "",
        presentation:
          context?.presentation?.trim() ?? product?.presentation ?? "",
        category: (context?.category || product?.category || "otros") as ProductCategory,
        image: product?.image ?? null,
        source: "manual",
        fetchedAt: new Date().toISOString(),
        price: typeof prices.price === "number" ? prices.price : undefined,
        priceC: typeof prices.priceC === "number" ? prices.priceC : undefined,
        cost: typeof prices.cost === "number" ? prices.cost : undefined,
      });
    }

    // 2. Actualizar producto en inventario si existe
    const product = await db.products
      .filter((p) => p.barcode === code)
      .first();
    if (product) {
      const before = product.price;
      await db.products.update(product.id, {
        price:
          typeof prices.price === "number" ? prices.price : product.price,
        priceC:
          typeof prices.priceC === "number" ? prices.priceC : product.priceC,
        updatedAt: new Date().toISOString(),
      });
      // 3. Guardar historial
      await addHistory({
        productId: product.id,
        action: "price_changed",
        name: product.name,
        barcode: product.barcode,
        snapshot: `Precio: C$ ${before ?? "—"} → C$ ${prices.price ?? "—"}`,
      });
    }

    await get().refresh();
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

  importPromotions: async (file) => {
    const { promotions, warnings } = await parsePromotionsFile(file);
    if (promotions.length === 0) {
      return { count: 0, warnings: [...warnings, "No se encontraron promociones válidas."] };
    }
    // Eliminar cualquier promo anterior del mismo archivo
    await getDb()
      .promotions.where("sourceFile")
      .equals(file.name)
      .delete();
    await getDb().promotions.bulkPut(promotions);
    return { count: promotions.length, warnings };
  },

  removePromotionSource: async (sourceFile) => {
    await getDb().promotions.where("sourceFile").equals(sourceFile).delete();
  },

  clearAllPromotions: async () => {
    await getDb().promotions.clear();
  },

  listPromotionSources: async () => {
    const all = await getDb().promotions.toArray();
    const map = new Map<
      string,
      { sourceFile: string; count: number; importedAt: string }
    >();
    for (const p of all) {
      const prev = map.get(p.sourceFile);
      if (prev) {
        prev.count += 1;
        if (p.importedAt > prev.importedAt) prev.importedAt = p.importedAt;
      } else {
        map.set(p.sourceFile, {
          sourceFile: p.sourceFile,
          count: 1,
          importedAt: p.importedAt,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      b.importedAt.localeCompare(a.importedAt),
    );
  },

  getActivePromotion: async (barcode) => {
    const code = barcode.replace(/\s/g, "");
    const all = await getDb()
      .promotions.where("barcode")
      .equals(code)
      .toArray();
    if (all.length === 0) return null;
    const today = new Date().toISOString().slice(0, 10);
    const active = all.filter(
      (p) => !p.endDate || p.endDate >= today,
    );
    if (active.length === 0) return null;
    // Elegir la más reciente
    return active.sort((a, b) =>
      (b.importedAt ?? "").localeCompare(a.importedAt ?? ""),
    )[0];
  },

  previewCatalogUpdate: async (file) => {
    const { entries, sourceFile, warnings } = await parseCatalogFile(file);
    const fetchedAt = new Date().toISOString();
    const withDate: import("./types").CatalogEntry[] = entries.map((e) => ({
      ...e,
      fetchedAt,
    }));

    const db = getDb();
    let newProducts = 0;
    let updates = 0;
    let unchanged = 0;

    // Batch de lecturas para eficiencia
    const codes = withDate.map((e) => e.barcode);
    const existing = await db.catalog.bulkGet(codes);

    withDate.forEach((entry, i) => {
      const prev = existing[i];
      if (!prev) {
        newProducts++;
      } else {
        const priceChanged =
          typeof entry.price === "number" &&
          entry.price !== prev.price;
        const costChanged =
          typeof entry.cost === "number" && entry.cost !== prev.cost;
        const priceCChanged =
          typeof entry.priceC === "number" && entry.priceC !== prev.priceC;
        if (priceChanged || costChanged || priceCChanged) updates++;
        else unchanged++;
      }
    });

    return {
      totalInExcel: withDate.length,
      newProducts,
      updates,
      unchanged,
      warnings,
      parsedEntries: withDate,
      sourceFile,
    };
  },

  applyCatalogUpdate: async (entries) => {
    const db = getDb();
    let added = 0;
    let updated = 0;

    // Insertar/actualizar en bulk
    await db.transaction("rw", db.catalog, db.products, async () => {
      for (const entry of entries) {
        const prev = await db.catalog.get(entry.barcode);
        if (!prev) {
          added++;
        } else if (
          prev.price !== entry.price ||
          prev.cost !== entry.cost ||
          prev.priceC !== entry.priceC
        ) {
          updated++;
        }
        // Mantener nombre/marca/categoría si ya existían (no pisar)
        const finalEntry = prev
          ? {
              ...entry,
              name: prev.name || entry.name,
              brand: prev.brand || entry.brand,
              category: prev.category || entry.category,
              department: prev.department || entry.department,
              supplier: prev.supplier || entry.supplier,
            }
          : entry;
        await db.catalog.put(finalEntry);

        // Actualizar el producto del inventario si existe
        const product = await db.products
          .filter((p) => p.barcode === entry.barcode)
          .first();
        if (product && typeof entry.price === "number") {
          await db.products.update(product.id, {
            price: entry.price,
            priceC: entry.priceC ?? product.priceC,
            updatedAt: new Date().toISOString(),
          });
        }
      }
    });

    // Invalidar caché de API y marcar fecha de actualización
    await setKv("lastCatalogUpdate", new Date().toISOString());

    await get().refresh();
    return { added, updated };
  },

  catalogStats: async () => {
    const db = getDb();
    const total = await db.catalog.count();
    const lastUpdate = await getKv<string | null>("lastCatalogUpdate", null);
    return { total, lastUpdate };
  },

  findCatalogMatches: async (query) => {
    const q = query.toLowerCase().trim();
    if (!q) return [];
    const db = getDb();
    const all = await db.catalog.toArray();
    return all
      .filter(
        (e) =>
          e.barcode === q ||
          e.name.toLowerCase().includes(q) ||
          e.brand.toLowerCase().includes(q),
      )
      .slice(0, 10)
      .map((e) => ({
        barcode: e.barcode,
        name: e.name,
        brand: e.brand,
        price: e.price,
        priceC: e.priceC,
        cost: e.cost,
      }));
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
