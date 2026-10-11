/**
 * Catálogo de productos Food Service (FSI).
 *
 * IMPORTANTE: este catálogo está hardcodeado en el código.
 * Los usuarios NO pueden editarlo desde la app.
 * Si algún peso o unidad cambia, hay que modificar este archivo y pushear.
 *
 * Las fórmulas de cálculo también son fijas (ver food-service-calc.ts).
 */

export type FSCategory =
  | "cafe"
  | "ingredientes"
  | "desechables"
  | "granitas"
  | "pan"
  | "salsas";

export interface FSProduct {
  /** Código único interno (ej. "FSI_CAPP_ORIG_750") */
  code: string;
  /** Nombre visible (ej. "FSI Bolsa Cappuccino Orig 750G") */
  name: string;
  /** Categoría para agrupar en la UI */
  category: FSCategory;
  /** Unidad de medida del conteo */
  unit: "gramo" | "unidad" | "libra" | "onza";
  /**
   * Peso del contenedor vacío (en la unidad del producto).
   * Ej: bolsa de cappuccino pesa 485g vacía.
   * Puede ser 0 si no aplica (ej. productos contables como vasos).
   */
  containerWeight: number;
  /**
   * Peso de 1 unidad de venta (en la unidad del producto).
   * Ej: 750 (bolsa de 750g), 1000 (kilo), 2000 (2 kilos).
   * Es el divisor en la fórmula: Producción = (abiertos - cont) / unitWeight
   */
  unitWeight: number;
  /** Notas opcionales para mostrar al usuario */
  notes?: string;
}

export const FS_CATEGORY_LABEL: Record<FSCategory, string> = {
  cafe: "Café / Nescafé",
  ingredientes: "Ingredientes",
  desechables: "Desechables",
  granitas: "Granitas",
  pan: "Pan y Salchichas",
  salsas: "Salsas",
};

// ============================================
// CATÁLOGO
// ============================================

export const FS_PRODUCTS: FSProduct[] = [
  // ========== CAFÉ / NESCAFÉ ==========
  {
    code: "FSI_CAPP_ORIG_750",
    name: "FSI Bolsa Cappuccino Orig 750G",
    category: "cafe",
    unit: "gramo",
    containerWeight: 485,
    unitWeight: 750,
  },
  {
    code: "FSI_CAPP_VAIN_750",
    name: "FSI Bolsa Cappuccino Vain 750G",
    category: "cafe",
    unit: "gramo",
    containerWeight: 485,
    unitWeight: 750,
  },
  {
    code: "FSI_CAPP_ORIG_1K",
    name: "FSI CapuccOriginal S/Azúcar 1Kg",
    category: "cafe",
    unit: "gramo",
    containerWeight: 485,
    unitWeight: 1000,
  },
  {
    code: "FSI_KITKAT_1300",
    name: "FSI KIT KAT Chocolate Polvo 1.3Kg",
    category: "cafe",
    unit: "gramo",
    containerWeight: 485,
    unitWeight: 1300,
  },
  {
    code: "FSI_COCOA_680",
    name: "FSI Nestle Cocoa Mix 680gr",
    category: "cafe",
    unit: "gramo",
    containerWeight: 485,
    unitWeight: 680,
  },
  {
    code: "FSI_NESCAFE_CLASICO_1K",
    name: "FSI Nescafe Clasico Grano 1K",
    category: "cafe",
    unit: "gramo",
    containerWeight: 708,
    unitWeight: 1000,
  },
  {
    code: "FSI_MEZCLA_BASE_1K",
    name: "FSI Mezcla base Neutra+vainilla",
    category: "cafe",
    unit: "gramo",
    containerWeight: 485,
    unitWeight: 1000,
  },

  // ========== INGREDIENTES ==========
  {
    code: "FSI_AZUCAR_2000",
    name: "FSI AZUCAR REFINADA 2000 UND",
    category: "ingredientes",
    unit: "libra",
    containerWeight: 0,
    unitWeight: 2000,
    notes: "Fórmula especial: (67/0.5)/2000",
  },
  {
    code: "FSI_CHILE_JALAPENO",
    name: "FSI Chile jalapeño en rodaja",
    category: "ingredientes",
    unit: "libra",
    containerWeight: 0.11,
    unitWeight: 8.34,
  },
  {
    code: "FSI_SALSA_TOMATE_114",
    name: "FSI Galón SalsaDeTomate 114oz",
    category: "ingredientes",
    unit: "libra",
    containerWeight: 2.42,
    unitWeight: 9.69,
  },
  {
    code: "FSI_MAYONESA_3500",
    name: "FSI Mayonesa Regia Galon 3500g",
    category: "ingredientes",
    unit: "libra",
    containerWeight: 2.42,
    unitWeight: 7.71,
  },
  {
    code: "FSI_MOSTAZA_3500",
    name: "FSI Mostaza Regia Galon 3500g",
    category: "ingredientes",
    unit: "libra",
    containerWeight: 2.42,
    unitWeight: 7.71,
  },
  {
    code: "FSI_RELISH_128",
    name: "FSI RELISH 128 ONZ",
    category: "ingredientes",
    unit: "libra",
    containerWeight: 0.22,
    unitWeight: 8.65,
  },
  {
    code: "FSI_SALSA_PICANTE_DJ",
    name: "FSI Salsa Picante Don Julio Ga",
    category: "ingredientes",
    unit: "libra",
    containerWeight: 0.11,
    unitWeight: 9.05,
  },
  {
    code: "FSI_SPLENDA_700",
    name: "FSI Splenda Endulzante 700 sobres",
    category: "ingredientes",
    unit: "libra",
    containerWeight: 0,
    unitWeight: 700,
    notes: "Fórmula especial: (150/0.4)/700",
  },

  // ========== PAN Y SALCHICHAS ==========
  {
    code: "FSI_PAN_HOTDOG_AURAMI_6",
    name: "FSI PAN HOT DOG 6 UN AURAMI",
    category: "pan",
    unit: "unidad",
    containerWeight: 0,
    unitWeight: 6,
  },
  {
    code: "FSI_PAN_HOTDOG_BIMBO_12",
    name: "FSI PAN HOTDOG BIMBO 12 UND",
    category: "pan",
    unit: "unidad",
    containerWeight: 0,
    unitWeight: 12,
  },
  {
    code: "FSI_SALCHICHA_DELMOR_15",
    name: "FSI Salchicha delmor 15 uni",
    category: "pan",
    unit: "unidad",
    containerWeight: 0,
    unitWeight: 15,
  },

  // ========== SALSAS (ya incluidas en ingredientes) ==========

  // ========== DESECHABLES ==========
  {
    code: "FSI_BANDEJA_HOTDOG",
    name: "FSI BANDEJA DE HOT DOG POR UN",
    category: "desechables",
    unit: "unidad",
    containerWeight: 0,
    unitWeight: 1,
  },
  {
    code: "FSI_BANDEJA_NACHO_125",
    name: "FSI BANDEJA DE NACHO 125 UN",
    category: "desechables",
    unit: "unidad",
    containerWeight: 0,
    unitWeight: 1.75,
  },
  {
    code: "FSI_BOTELLON_AGUA",
    name: "FSI BOTELLON DE AGUA",
    category: "desechables",
    unit: "unidad",
    containerWeight: 0,
    unitWeight: 10,
  },
  {
    code: "FSI_CUCHARAS_12",
    name: "FSI Cucharas Medianas 12 und",
    category: "desechables",
    unit: "unidad",
    containerWeight: 0,
    unitWeight: 12,
  },
  {
    code: "FSI_CUCHILLOS_12",
    name: "FSI Cuchillos x paquete d 12 und",
    category: "desechables",
    unit: "unidad",
    containerWeight: 0,
    unitWeight: 12,
  },
  {
    code: "FSI_CONO_SIMPLE_13",
    name: "FSI Cono Simple 13 unidades",
    category: "desechables",
    unit: "unidad",
    containerWeight: 0,
    unitWeight: 1,
  },
  {
    code: "FSI_GUANTES_FS",
    name: "FSI Guantes Food Service",
    category: "desechables",
    unit: "unidad",
    containerWeight: 0,
    unitWeight: 1,
  },
  {
    code: "FSI_HIELO_10LB",
    name: "FSI Hielo 10 lbs",
    category: "desechables",
    unit: "libra",
    containerWeight: 0,
    unitWeight: 10,
  },
  {
    code: "FSI_NACHOS_3OZ",
    name: "FSI NACHOS 3 OZ",
    category: "desechables",
    unit: "unidad",
    containerWeight: 0,
    unitWeight: 1,
  },
  {
    code: "FSI_PAPEL_DELI_500",
    name: "FSI Papel para Deli x caja 500",
    category: "desechables",
    unit: "libra",
    containerWeight: 0,
    unitWeight: 2.63,
  },
  {
    code: "FSI_PLASTIC_WRAP",
    name: "FSI Plastic wrap",
    category: "desechables",
    unit: "libra",
    containerWeight: 0,
    unitWeight: 4.63,
  },
  {
    code: "FSI_PLASTIC_WRAP_ELASTIK_12",
    name: "FSI Plastic wrap Elastik 12\"",
    category: "desechables",
    unit: "libra",
    containerWeight: 0,
    unitWeight: 3.9,
  },
  {
    code: "FSI_PLASTIC_WRAP_ELASTIK_15",
    name: "FSI Plastic wrap Elastik 15\"",
    category: "desechables",
    unit: "libra",
    containerWeight: 0,
    unitWeight: 4.77,
  },
  {
    code: "FSI_PLATOS_REPOSTERIA_25",
    name: "FSI PLATOS REPOSTERIA 25 UND",
    category: "desechables",
    unit: "unidad",
    containerWeight: 0,
    unitWeight: 25,
  },
  {
    code: "FSI_PORTA_VASOS_NESCAFE",
    name: "FSI Porta Vasos Nescafe",
    category: "desechables",
    unit: "unidad",
    containerWeight: 0,
    unitWeight: 1,
  },
  {
    code: "FSI_REMOVEDOR_CAFE_500",
    name: "FSI REMOVEDOR DE CAFE 500 UND",
    category: "desechables",
    unit: "onza",
    containerWeight: 0,
    unitWeight: 8.25,
  },
  {
    code: "FSI_SERVILLETAS_100",
    name: "FSI SERVILLETAS 100 UN",
    category: "desechables",
    unit: "onza",
    containerWeight: 0,
    unitWeight: 3.5,
  },
  {
    code: "FSI_TAPA_CAFE_14",
    name: "FSI Tapa Café 14 onz Und",
    category: "desechables",
    unit: "unidad",
    containerWeight: 0,
    unitWeight: 1,
  },
  {
    code: "FSI_TAPAS_8OZ_100",
    name: "FSI TAPAS 8 onz 100 UND",
    category: "desechables",
    unit: "unidad",
    containerWeight: 0,
    unitWeight: 100,
  },
  {
    code: "FSI_TENEDORES_12",
    name: "FSI Tenedores 12 und",
    category: "desechables",
    unit: "unidad",
    containerWeight: 0,
    unitWeight: 12,
  },
  {
    code: "FSI_VASOS_8OZ_100",
    name: "FSI VASOS 8 onz 100 UND",
    category: "desechables",
    unit: "unidad",
    containerWeight: 0,
    unitWeight: 100,
  },
  {
    code: "FSI_VASOS_CAFE_14",
    name: "FSI Vasos Café 14 onz Und",
    category: "desechables",
    unit: "unidad",
    containerWeight: 0,
    unitWeight: 1,
  },

  // ========== GRANITAS ==========
  {
    code: "FSI_PAJILLAS_500",
    name: "FSI PAJILLAS 500 UND",
    category: "granitas",
    unit: "onza",
    containerWeight: 0,
    unitWeight: 12.8,
  },
  {
    code: "FSI_TAPA_VASO_GRANITA_50",
    name: "FSI Tapa Vaso de granita 50 und",
    category: "granitas",
    unit: "unidad",
    containerWeight: 0,
    unitWeight: 50,
  },
  {
    code: "FSI_VASOS_GRANITA_12OZ_50",
    name: "FSI Vasos granita 12oz 50und",
    category: "granitas",
    unit: "unidad",
    containerWeight: 0,
    unitWeight: 50,
  },
];

/**
 * Busca un producto por código.
 */
export function findFSProduct(code: string): FSProduct | undefined {
  return FS_PRODUCTS.find((p) => p.code === code);
}

/**
 * Agrupa los productos por categoría.
 */
export function groupFSProductsByCategory(): Record<FSCategory, FSProduct[]> {
  const grouped: Record<FSCategory, FSProduct[]> = {
    cafe: [],
    ingredientes: [],
    desechables: [],
    granitas: [],
    pan: [],
    salsas: [],
  };
  for (const p of FS_PRODUCTS) {
    grouped[p.category].push(p);
  }
  return grouped;
}
