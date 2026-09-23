/** Tienda de demostración para el primer arranque. */
import type { CatalogEntry, HistoryEntry, Product } from "./types";
import { shiftIso } from "./dates";

function p(
  partial: Omit<Product, "id" | "createdAt" | "updatedAt" | "image" | "notes"> & {
    notes?: string;
    image?: string | null;
  },
): Product {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    image: partial.image ?? null,
    notes: partial.notes ?? "",
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

export function buildDemoProducts(): Product[] {
  return [
    p({
      barcode: "7501020510104",
      name: "Leche entera",
      brand: "Lala",
      presentation: "1 L",
      category: "lacteo",
      expiresAt: shiftIso(4),
      quantity: 8,
      location: "nevera",
      source: "local",
    }),
    p({
      barcode: "7501040090075",
      name: "Yogurt natural",
      brand: "Danone",
      presentation: "1 kg",
      category: "lacteo",
      expiresAt: shiftIso(12),
      quantity: 6,
      location: "nevera",
      source: "local",
    }),
    p({
      barcode: "5449000000996",
      name: "Refresco de cola",
      brand: "Coca-Cola",
      presentation: "600 ml",
      category: "bebida",
      expiresAt: shiftIso(180),
      quantity: 24,
      location: "estante",
      source: "openfoodfacts",
    }),
    p({
      barcode: "7501040092208",
      name: "Queso panela",
      brand: "Noche Buena",
      presentation: "400 g",
      category: "lacteo",
      expiresAt: shiftIso(-3),
      quantity: 2,
      location: "nevera",
      source: "local",
      notes: "Retirar del piso de venta",
    }),
    p({
      barcode: "7501000115903",
      name: "Jamón de pavo",
      brand: "San Rafael",
      presentation: "250 g",
      category: "carnes",
      expiresAt: shiftIso(8),
      quantity: 4,
      location: "nevera",
      source: "local",
    }),
    p({
      barcode: "7501030426204",
      name: "Pan de caja",
      brand: "Bimbo",
      presentation: "680 g",
      category: "panaderia",
      expiresAt: shiftIso(2),
      quantity: 5,
      location: "estante",
      source: "local",
    }),
    p({
      barcode: "7501020541634",
      name: "Huevo blanco",
      brand: "San Juan",
      presentation: "18 pzas",
      category: "lacteo",
      expiresAt: shiftIso(20),
      quantity: 7,
      location: "estante",
      source: "local",
    }),
    p({
      barcode: "7501055301014",
      name: "Jugo de mango",
      brand: "Jumex",
      presentation: "355 ml",
      category: "bebida",
      expiresAt: shiftIso(45),
      quantity: 18,
      location: "nevera",
      source: "local",
    }),
    p({
      barcode: "7501011150108",
      name: "Papas adobadas",
      brand: "Sabritas",
      presentation: "45 g",
      category: "snack",
      expiresAt: shiftIso(90),
      quantity: 30,
      location: "estante",
      source: "local",
    }),
    p({
      barcode: "7501020513112",
      name: "Yogurt griego",
      brand: "Chobani",
      presentation: "150 g",
      category: "lacteo",
      expiresAt: shiftIso(0),
      quantity: 3,
      location: "nevera",
      source: "local",
      notes: "Ofertar hoy",
    }),
    p({
      barcode: "7501064191112",
      name: "Crema para batir",
      brand: "Alpura",
      presentation: "250 ml",
      category: "lacteo",
      expiresAt: shiftIso(15),
      quantity: 5,
      location: "nevera",
      source: "local",
    }),
    p({
      barcode: "7501055360059",
      name: "Agua natural",
      brand: "Ciel",
      presentation: "1 L",
      category: "bebida",
      expiresAt: shiftIso(300),
      quantity: 40,
      location: "bodega",
      source: "local",
    }),
    p({
      barcode: "7501035901508",
      name: "Jabón líquido",
      brand: "Pinol",
      presentation: "2 L",
      category: "limpieza",
      expiresAt: shiftIso(400),
      quantity: 9,
      location: "bodega",
      source: "local",
    }),
    p({
      barcode: "7501020549999",
      name: "Salchicha viena",
      brand: "FUD",
      presentation: "500 g",
      category: "carnes",
      expiresAt: shiftIso(-12),
      quantity: 1,
      location: "nevera",
      source: "local",
    }),
  ];
}

export function buildDemoCatalog(products: Product[]): CatalogEntry[] {
  const now = new Date().toISOString();
  return products.map((item) => ({
    barcode: item.barcode,
    name: item.name,
    brand: item.brand,
    presentation: item.presentation,
    category: item.category,
    image: item.image,
    source: item.source,
    fetchedAt: now,
  }));
}

export function buildDemoHistory(products: Product[]): HistoryEntry[] {
  const expired = products.filter((item) => item.expiresAt < shiftIso(0));
  return expired.map((item) => ({
    id: crypto.randomUUID(),
    productId: item.id,
    action: "expired" as const,
    name: item.name,
    barcode: item.barcode,
    snapshot: `${item.brand} · ${item.quantity} pzas · ${item.expiresAt}`,
    at: new Date(Date.now() - 36 * 3600 * 1000).toISOString(),
  }));
}
