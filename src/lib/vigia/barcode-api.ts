/**
 * Consulta paralela a Open Food Facts y UPCitemdb.
 * createServerFn corre en el servidor (User-Agent + sin CORS) y se llama
 * desde el cliente por RPC.
 */
import { createServerFn } from "@tanstack/react-start";
import type { LookupResult, ProductCategory } from "./types";

const UA = "VigiaExpiryApp/1.0 (web; control-de-vencimientos; contacto: vigia-app)";

function guessCategory(text: string): ProductCategory {
  const t = text.toLowerCase();
  if (/(milk|leche|yogurt|yoghurt|queso|cheese|crema|lácteo|lacteo)/.test(t))
    return "lacteo";
  if (/(soda|cola|jugo|juice|agua|water|beer|cerveza|refresco|bebida)/.test(t))
    return "bebida";
  if (/(chip|papa|galleta|cookie|snack|chocolate|dulce|candy)/.test(t)) return "snack";
  if (/(bread|pan|tortilla|bolillo)/.test(t)) return "panaderia";
  if (/(jamon|jamón|ham|salchicha|pavo|turkey|carne)/.test(t)) return "carnes";
  if (/(soap|jabon|jabón|cloro|detergent|limpieza|pinol)/.test(t)) return "limpieza";
  if (/(shampoo|crema dental|desodorante|cuidado)/.test(t)) return "cuidado";
  if (/(frozen|congelad)/.test(t)) return "congelados";
  if (/(can|lata|enlat)/.test(t)) return "enlatados";
  return "otros";
}

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
  const name =
    p.product_name_es?.trim() ||
    p.product_name?.trim() ||
    p.generic_name?.trim() ||
    "";
  if (!name) return null;
  const blob = `${name} ${p.brands ?? ""} ${p.categories ?? ""}`;
  return {
    barcode,
    name,
    brand: (p.brands ?? "").split(",")[0]?.trim() ?? "",
    presentation: p.quantity ?? "",
    category: guessCategory(blob),
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
  const blob = `${item.title} ${item.brand ?? ""} ${item.description ?? ""}`;
  return {
    barcode,
    name: item.title,
    brand: item.brand ?? "",
    presentation: item.size ?? "",
    category: guessCategory(blob),
    image: item.images?.[0] ?? null,
    source: "upcitemdb",
    found: true,
    sourcesTried: ["upcitemdb"],
  };
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
    const settled = await Promise.allSettled([
      fetchOpenFoodFacts(barcode),
      fetchUpcItemDb(barcode),
    ]);
    const off = settled[0].status === "fulfilled" ? settled[0].value : null;
    const upc = settled[1].status === "fulfilled" ? settled[1].value : null;
    const sourcesTried = ["openfoodfacts", "upcitemdb"];

    const picked = off ?? upc;
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
