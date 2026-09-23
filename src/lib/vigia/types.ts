/** Tipos de dominio de Vigía: inventario y vencimientos. */

export type ProductStatus = "ok" | "soon" | "expired";

export type ProductCategory =
  | "bebida"
  | "lacteo"
  | "snack"
  | "panaderia"
  | "carnes"
  | "limpieza"
  | "cuidado"
  | "congelados"
  | "enlatados"
  | "otros";

export type StoreLocation =
  | "estante"
  | "nevera"
  | "congelador"
  | "bodega"
  | "mostrador";

export interface Product {
  id: string;
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
  source: "openfoodfacts" | "upcitemdb" | "local" | "manual";
  createdAt: string;
  updatedAt: string;
}

export interface CatalogEntry {
  barcode: string;
  name: string;
  brand: string;
  presentation: string;
  category: ProductCategory;
  image: string | null;
  source: Product["source"];
  fetchedAt: string;
}

export interface HistoryEntry {
  id: string;
  productId: string;
  action: "created" | "updated" | "consumed" | "removed" | "expired";
  name: string;
  barcode: string;
  snapshot: string;
  at: string;
}

export interface ApiCacheEntry {
  barcode: string;
  payload: LookupResult;
  fetchedAt: string;
}

export interface LookupResult {
  barcode: string;
  name: string;
  brand: string;
  presentation: string;
  category: ProductCategory;
  image: string | null;
  source: Product["source"];
  found: boolean;
  sourcesTried: string[];
}

export interface AlertSettings {
  days: number[];
  sound: boolean;
  vibration: boolean;
  notifyOnOpen: boolean;
  storeName: string;
}

export const CATEGORY_LABEL: Record<ProductCategory, string> = {
  bebida: "Bebida",
  lacteo: "Lácteo",
  snack: "Snack",
  panaderia: "Panadería",
  carnes: "Carnes frías",
  limpieza: "Limpieza",
  cuidado: "Cuidado personal",
  congelados: "Congelados",
  enlatados: "Enlatados",
  otros: "Otros",
};

export const LOCATION_LABEL: Record<StoreLocation, string> = {
  estante: "Estante",
  nevera: "Nevera",
  congelador: "Congelador",
  bodega: "Bodega",
  mostrador: "Mostrador",
};

export const DEFAULT_SETTINGS: AlertSettings = {
  days: [30, 15, 7, 1],
  sound: true,
  vibration: true,
  notifyOnOpen: true,
  storeName: "Mi tienda",
};

export const SAMPLE_BARCODES: { code: string; label: string }[] = [
  { code: "3017620422003", label: "Nutella" },
  { code: "5449000000996", label: "Coca-Cola" },
  { code: "7622210989927", label: "Milka" },
  { code: "8000500037560", label: "Ferrero" },
  { code: "7501055300079", label: "Lala" },
];
