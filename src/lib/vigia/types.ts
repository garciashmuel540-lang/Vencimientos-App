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
  source: "openfoodfacts" | "upcitemdb" | "local" | "manual" | "openbeautyfacts" | "openproductsfacts";
  createdAt: string;
  updatedAt: string;
  price?: number;
  priceC?: number;
  subcategory?: string;
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
  department?: string;
  supplier?: string;
  price?: number;
  priceC?: number;
  cost?: number;
  qtySnapshot?: number;
  inactive?: boolean;
}

export interface HistoryEntry {
  id: string;
  productId: string;
  action: "created" | "updated" | "consumed" | "removed" | "expired" | "price_changed";
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
  department?: string;
  supplier?: string;
  price?: number;
  priceC?: number;
  cost?: number;
  qtySnapshot?: number;
  inactive?: boolean;
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

export interface Promotion {
  id: string;
  barcode: string;
  name: string;
  dynamic: string;
  priceBefore: number;
  priceNow: number;
  priceBeforePYA?: number;
  priceNowPYA?: number;
  category?: string;
  subcategory?: string;
  startDate?: string;
  endDate?: string;
  observations?: string;
  sourceFile: string;
  importedAt: string;
}

/**
 * Mapa de subcategorías del catálogo PRDA74 → categorías genéricas.
 * Permite autodetectar la categoría al escanear un producto.
 */
export const SUBCATEGORY_TO_CATEGORY: Record<string, ProductCategory> = {
  // Bebidas
  "Agua": "bebida",
  "Agua Gasificada": "bebida",
  "Gaseosas": "bebida",
  "Bebida Energizante": "bebida",
  "Bebida Isotonica": "bebida",
  "Bebidas Saludables": "bebida",
  "Cervezas Nacionales": "bebida",
  "Cervezas Importadas": "bebida",
  "Cervezas Artesanales": "bebida",
  "Hard Seltzer": "bebida",
  "Ready to Drink": "bebida",
  "Jugos": "bebida",
  "Te frio": "bebida",
  "Leche Saborizada": "bebida",
  "Leche en Bolsa": "bebida",
  "Leche Tetrapack": "bebida",
  "Bebidas Caliente FS": "bebida",
  "Bebidas Heladas FS": "bebida",
  "Mix de Licores": "bebida",
  "Ron": "bebida",
  "Vodka": "bebida",
  "Tequila": "bebida",
  "Whisky": "bebida",
  "Vinos y Champagne": "bebida",
  "Otros Licores": "bebida",
  // Lácteos
  "Yogurt": "lacteo",
  "Quesos procesados": "lacteo",
  "Leche Culinarias": "lacteo",
  "Margarinas y Mantequillas": "lacteo",
  // Snacks y dulces
  "Boquitas": "snack",
  "Gomitas": "snack",
  "Chocolates": "snack",
  "Galletas": "snack",
  "Pastillas de Dulce": "snack",
  "Gomas de Mascar": "snack",
  "Dulces paletas": "snack",
  "Dulces de Leche": "snack",
  "Semillas": "snack",
  "Barras Nutritivas": "snack",
  "Helados": "snack",
  "Cajetas": "snack",
  "Pudines": "snack",
  // Panadería
  "Pan Empacado": "panaderia",
  "Pan Fresco": "panaderia",
  "Tortillas": "panaderia",
  "Donas": "panaderia",
  "Reposteria Dulce": "panaderia",
  "Pudines AMPM": "panaderia",
  // Carnes y embutidos
  "Embutidos": "carnes",
  "Atun": "carnes",
  "Sardinas Enlatadas": "carnes",
  "Matahambrita": "carnes",
  "Hamburguesas": "carnes",
  "Hot Dog": "carnes",
  // Limpieza
  "Desechables": "limpieza",
  "Detergentes Ropa": "limpieza",
  "Detergente trastes": "limpieza",
  "Cloro y blanqueador": "limpieza",
  "Jabon en barra para ropa": "limpieza",
  "Suavizante": "limpieza",
  "Bolsas de basura": "limpieza",
  "Bolsas cierre hermentico": "limpieza",
  "Aromatizantes del ambiente": "limpieza",
  "Insecticidas": "limpieza",
  "Limpiadores liquidos": "limpieza",
  "Papel Higiénico": "limpieza",
  "Papel Toalla": "limpieza",
  "Servilletas": "limpieza",
  "Utencilios": "limpieza",
  "Pilas/Baterias": "limpieza",
  "Carbon": "limpieza",
  "Limpieza de Baños": "limpieza",
  "Limpieza de Zapatos": "limpieza",
  "Limpieza FSI": "limpieza",
  "Bolsas para Empacar": "limpieza",
  "Cajillas para Despacho": "limpieza",
  // Cuidado personal
  "Cuidado Oral": "cuidado",
  "Shampoo": "cuidado",
  "Jabon de tocador": "cuidado",
  "Desodorante": "cuidado",
  "Crema para la piel": "cuidado",
  "Proteccion Sanitaria": "cuidado",
  "Pañales Desechables": "cuidado",
  "Condones Preservativos": "cuidado",
  "Hojas de rasurar y rasuradoras": "cuidado",
  "Cuidado del Bebe": "cuidado",
  "Antibacteriales": "cuidado",
  "Algodones": "cuidado",
  "Proteccion Solar": "cuidado",
  "Gel Cabello": "cuidado",
  "Proteccion Labial": "cuidado",
  // Congelados
  "Congelados": "congelados",
  "Hielo": "congelados",
  // Enlatados
  "Enlatados": "enlatados",
  "Frijoles Procesados": "enlatados",
  "Miel Pancake": "enlatados",
};

/**
 * Dado un subcategory (del catálogo PRDA74), infiere la categoría genérica.
 */
export function inferCategory(subcategory?: string): ProductCategory {
  if (!subcategory) return "otros";
  return SUBCATEGORY_TO_CATEGORY[subcategory] ?? "otros";
}

