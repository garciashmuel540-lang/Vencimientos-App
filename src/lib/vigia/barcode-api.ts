/**
 * Consulta paralela a Open Food Facts y UPCitemdb.
 * createServerFn corre en el servidor (User-Agent + sin CORS) y se llama
 * desde el cliente por RPC.
 */
import { createServerFn } from "@tanstack/react-start";
import type { LookupResult } from "./types";
import { suggestProductPlacement } from "./product-placement";

const UA = "VigiaExpiryApp/1.0 (web; control-de-vencimientos; contacto: vigia-app)";

interface OffProduct {
  product_name?: string;
  product_name_es?: string;
  generic_name?: string;
  brands?: string;
  quantity?: string;
  image_front_small_url?: string;
  image_url?: string;
  categories?: string;
}

async function fetchOpenFoodFacts(barcode: string): Promise<LookupResult | null> {
  const res = await fetch(
    `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(barcode)}.json`,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": UA,
      },
    },
  );
  if (!res.ok) return null;
  const json = (await res.json()) as { status?: number; product?: OffProduct };
  if (json.status !== 1 || !json.product) return null;
  const p = json.product;
  const name = p.product_name_es?.trim() || p.product_name?.trim() || p.generic_name?.trim() || "";
  if (!name) return null;
  const placement = suggestProductPlacement({ name, description: p.categories });
  return {
    barcode,
    name,
    brand: (p.brands ?? "").split(",")[0]?.trim() ?? "",
    presentation: p.quantity ?? "",
    ...placement,
    image: p.image_front_small_url || p.image_url || null,
    source: "openfoodfacts",
    found: true,
    sourcesTried: ["openfoodfacts"],
  };
}

interface UpcItem {
  title?: string;
  brand?: string;
  description?: string;
  images?: string[];
  size?: string;
}

async function fetchUpcItemDb(barcode: string): Promise<LookupResult | null> {
  const res = await fetch(
    `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`,
    { headers: { Accept: "application/json" } },
  );
  if (!res.ok) return null;
  const json = (await res.json()) as { code?: string; items?: UpcItem[] };
  const item = json.items?.[0];
  if (!item?.title) return null;
  const placement = suggestProductPlacement({ name: item.title, description: item.description });
  return {
    barcode,
    name: item.title,
    brand: item.brand ?? "",
    presentation: item.size ?? "",
    ...placement,
    image: item.images?.[0] ?? null,
    source: "upcitemdb",
    found: true,
    sourcesTried: ["upcitemdb"],
  };
}

async function fetchOpenBeautyFacts(barcode: string): Promise<LookupResult | null> {
  const res = await fetch(
    `https://world.openbeautyfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": UA,
      },
    },
  );
  if (!res.ok) return null;
  const json = (await res.json()) as { status?: number; product?: OffProduct };
  if (json.status !== 1 || !json.product) return null;
  const p = json.product;
  const name = p.product_name_es?.trim() || p.product_name?.trim() || p.generic_name?.trim() || "";
  if (!name) return null;
  const placement = suggestProductPlacement({
    name,
    category: "cuidado",
    description: p.categories,
  });
  return {
    barcode,
    name,
    brand: (p.brands ?? "").split(",")[0]?.trim() ?? "",
    presentation: p.quantity ?? "",
    ...placement,
    image: p.image_front_small_url || p.image_url || null,
    source: "openbeautyfacts",
    found: true,
    sourcesTried: ["openbeautyfacts"],
  };
}

async function fetchOpenProductsFacts(barcode: string): Promise<LookupResult | null> {
  const res = await fetch(
    `https://world.openproductsfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": UA,
      },
    },
  );
  if (!res.ok) return null;
  const json = (await res.json()) as { status?: number; product?: OffProduct };
  if (json.status !== 1 || !json.product) return null;
  const p = json.product;
  const name = p.product_name_es?.trim() || p.product_name?.trim() || p.generic_name?.trim() || "";
  if (!name) return null;
  const placement = suggestProductPlacement({ name, description: p.categories });
  return {
    barcode,
    name,
    brand: (p.brands ?? "").split(",")[0]?.trim() ?? "",
    presentation: p.quantity ?? "",
    ...placement,
    image: p.image_front_small_url || p.image_url || null,
    source: "openproductsfacts",
    found: true,
    sourcesTried: ["openproductsfacts"],
  };
}

/**
 * Envuelve una promesa con timeout. Si excede los ms, devuelve null.
 */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

export const lookupBarcodeFn = createServerFn({ method: "POST" })
  .validator((raw: unknown) => {
    const barcode =
      typeof raw === "object" && raw && "barcode" in raw
        ? String((raw as { barcode: unknown }).barcode).replace(/\s/g, "")
        : "";
    if (!/^\d{6,14}$/.test(barcode)) {
      throw new Error("El código debe tener entre 6 y 14 dígitos");
    }
    return { barcode };
  })
  .handler(async ({ data }): Promise<LookupResult> => {
    const { barcode } = data;
    const TIMEOUT_MS = 5000;
    const settled = await Promise.allSettled([
      withTimeout(fetchOpenFoodFacts(barcode), TIMEOUT_MS),
      withTimeout(fetchUpcItemDb(barcode), TIMEOUT_MS),
      withTimeout(fetchOpenBeautyFacts(barcode), TIMEOUT_MS),
      withTimeout(fetchOpenProductsFacts(barcode), TIMEOUT_MS),
    ]);
    const off = settled[0].status === "fulfilled" ? settled[0].value : null;
    const upc = settled[1].status === "fulfilled" ? settled[1].value : null;
    const sourcesTried = ["openfoodfacts", "upcitemdb", "openbeautyfacts", "openproductsfacts"];

    const beauty = settled[2].status === "fulfilled" ? settled[2].value : null;
    const products = settled[3].status === "fulfilled" ? settled[3].value : null;
    const picked = off ?? upc ?? beauty ?? products;
    if (picked) {
      return { ...picked, sourcesTried };
    }
    return {
      barcode,
      name: "",
      brand: "",
      presentation: "",
      category: "otros",
      image: null,
      source: "manual",
      found: false,
      sourcesTried,
    };
  });
