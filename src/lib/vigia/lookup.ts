/**
 * Fusión de fuentes para un código de barras:
 * 1) catálogo local / caché  2) Open Food Facts  3) UPCitemdb  4) alta manual
 */
import { lookupBarcodeFn } from "./barcode-api";
import { getDb } from "./db";
import type { CatalogEntry, LookupResult, ProductCategory } from "./types";

const CACHE_MS = 1000 * 60 * 60 * 24 * 30;

function emptyResult(barcode: string): LookupResult {
  return {
    barcode,
    name: "",
    brand: "",
    presentation: "",
    category: "otros",
    image: null,
    source: "manual",
    found: false,
    sourcesTried: ["local"],
  };
}

function fromCatalog(entry: CatalogEntry): LookupResult {
  return {
    barcode: entry.barcode,
    name: entry.name,
    brand: entry.brand,
    presentation: entry.presentation,
    category: entry.category,
    image: entry.image,
    source: entry.source,
    found: Boolean(entry.name),
    sourcesTried: ["local"],
  };
}

export async function lookupProduct(barcode: string): Promise<LookupResult> {
  const code = barcode.replace(/\s/g, "");
  const db = getDb();

  const localProduct = await db.products.filter((p) => p.barcode === code).first();
  const catalog = await db.catalog.get(code);
  const cache = await db.apiCache.get(code);

  const localHit = catalog
    ? fromCatalog(catalog)
    : localProduct
      ? fromCatalog({
          barcode: localProduct.barcode,
          name: localProduct.name,
          brand: localProduct.brand,
          presentation: localProduct.presentation,
          category: localProduct.category,
          image: localProduct.image,
          source: localProduct.source,
          fetchedAt: localProduct.updatedAt,
        })
      : null;

  const cacheFresh =
    cache && Date.now() - new Date(cache.fetchedAt).getTime() < CACHE_MS
      ? cache.payload
      : null;

  if (cacheFresh?.found) {
    return {
      ...cacheFresh,
      sourcesTried: ["cache", ...(cacheFresh.sourcesTried ?? [])],
    };
  }
  if (localHit?.found) {
    return localHit;
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

export async function rememberCatalog(entry: {
  barcode: string;
  name: string;
  brand: string;
  presentation: string;
  category: ProductCategory;
  image: string | null;
  source: CatalogEntry["source"];
}): Promise<void> {
  await getDb().catalog.put({
    ...entry,
    fetchedAt: new Date().toISOString(),
  });
}
