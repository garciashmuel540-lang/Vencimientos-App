/**
 * Fusión de fuentes para un código de barras:
 * 1) catálogo local / caché  2) Open Food Facts  3) UPCitemdb  4) alta manual
 */
import { lookupBarcodeFn } from "./barcode-api";
import { getDb } from "./db";
import {
  CATEGORY_LABEL,
  LOCATION_LABEL,
  type CatalogEntry,
  type LookupResult,
  type ProductCategory,
} from "./types";
import { suggestProductPlacement } from "./product-placement";

const CACHE_MS = 1000 * 60 * 60 * 24 * 30;

function emptyResult(barcode: string): LookupResult {
  return {
    barcode,
    name: "",
    brand: "",
    presentation: "",
    category: "otros",
    location: "estante",
    image: null,
    source: "manual",
    found: false,
    sourcesTried: ["local"],
  };
}

function fromCatalog(entry: CatalogEntry): LookupResult {
  const placement = suggestProductPlacement(entry);
  const remembered = entry.location && Object.hasOwn(LOCATION_LABEL, entry.location);
  return {
    barcode: entry.barcode,
    name: entry.name,
    brand: entry.brand,
    presentation: entry.presentation,
    ...placement,
    category:
      remembered && Object.hasOwn(CATEGORY_LABEL, entry.category)
        ? (entry.category as ProductCategory)
        : placement.category,
    location: remembered ? entry.location : placement.location,
    image: entry.image,
    source: entry.source,
    found:
      Boolean(entry.name) || typeof entry.price === "number" || typeof entry.priceC === "number",
    sourcesTried: ["local"],
    department: entry.department,
    supplier: entry.supplier,
    price: entry.price,
    priceC: entry.priceC,
    cost: entry.cost,
    qtySnapshot: entry.qtySnapshot,
    inactive: entry.inactive,
  };
}

export async function lookupProduct(barcode: string): Promise<LookupResult> {
  const code = barcode.replace(/\s/g, "");
  const db = getDb();

  const [lots, catalog, cache] = await Promise.all([
    db.products.where("barcode").equals(code).toArray(),
    db.catalog.get(code),
    db.apiCache.get(code),
  ]);
  const localProduct = lots.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];

  const localHit = catalog
    ? fromCatalog(catalog)
    : localProduct
      ? fromCatalog({
          barcode: localProduct.barcode,
          name: localProduct.name,
          brand: localProduct.brand,
          presentation: localProduct.presentation,
          category: localProduct.category,
          subcategory: localProduct.subcategory,
          location: localProduct.location !== "estante" ? localProduct.location : undefined,
          image: localProduct.image,
          source: localProduct.source,
          fetchedAt: localProduct.updatedAt,
        })
      : null;

  const cacheFresh =
    cache && Date.now() - new Date(cache.fetchedAt).getTime() < CACHE_MS ? cache.payload : null;

  if (localHit) {
    // Older lots used Estante by default. Reuse a different saved location, or
    // let catalog/name metadata suggest one when no explicit choice was saved.
    if (
      !catalog?.location &&
      localProduct?.location &&
      localProduct.location !== "estante" &&
      Object.hasOwn(LOCATION_LABEL, localProduct.location)
    ) {
      return {
        ...localHit,
        location: localProduct.location,
        category:
          Object.hasOwn(CATEGORY_LABEL, localProduct.category) && localProduct.category !== "otros"
            ? localProduct.category
            : localHit.category,
      };
    }
    return localHit;
  }

  if (cacheFresh?.found) {
    return {
      ...cacheFresh,
      ...(!cacheFresh.location ? suggestProductPlacement(cacheFresh) : {}),
      sourcesTried: ["cache", ...(cacheFresh.sourcesTried ?? [])],
    };
  }

  try {
    const remote = await lookupBarcodeFn({ data: { barcode: code } });
    await db.apiCache.put({
      barcode: code,
      payload: remote,
      fetchedAt: new Date().toISOString(),
    });
    if (remote.found) {
      await db.catalog.put({
        barcode: code,
        name: remote.name,
        brand: remote.brand,
        presentation: remote.presentation,
        category: remote.category,
        subcategory: remote.subcategory,
        image: remote.image,
        source: remote.source,
        fetchedAt: new Date().toISOString(),
      });
      return remote;
    }
    return localHit ?? remote;
  } catch {
    return localHit ?? cacheFresh ?? emptyResult(code);
  }
}

export async function rememberCatalog(
  entry: Pick<
    CatalogEntry,
    | "barcode"
    | "name"
    | "brand"
    | "presentation"
    | "category"
    | "image"
    | "source"
    | "subcategory"
    | "location"
  >,
): Promise<void> {
  const db = getDb();
  await db.transaction("rw", db.catalog, async () => {
    const previous = await db.catalog.get(entry.barcode);
    const subcategory =
      entry.subcategory ||
      previous?.subcategory ||
      (previous && !Object.hasOwn(CATEGORY_LABEL, previous.category)
        ? previous.category
        : undefined);
    await db.catalog.put({
      ...previous,
      ...entry,
      subcategory,
      fetchedAt: new Date().toISOString(),
    });
  });
}
