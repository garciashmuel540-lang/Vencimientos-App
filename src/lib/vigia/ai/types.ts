/**
 * Tipos compartidos entre providers de IA (Groq, Gemini).
 */

export interface ChatProduct {
  name: string;
  quantity: number;
  expiresAt: string;
  status: "ok" | "soon" | "expired";
  category?: string;
  barcode?: string;
  brand?: string;
  location?: string;
  price?: number;
  priceC?: number;
  notes?: string;
}

export interface ChatHistoryMsg {
  role: "user" | "model";
  text: string;
}

export interface FSProductChat {
  code: string;
  itemCode?: string;
  name: string;
  category: string;
  unit: string;
  containerWeight: number;
  unitWeight: number;
}

export interface FSCountChat {
  product_code: string;
  product_name: string;
  category: string;
  unit: string;
  opened: number | null;
  sealed: number | null;
  system_qty: number | null;
  count_date: string;
  updated_at: string;
  inventory?: number;
  difference?: number;
  status?: string;
}

export interface CatalogMatch {
  barcode: string;
  name: string;
  brand: string;
  price?: number;
  priceC?: number;
  department?: string;
  category?: string;
}

export interface ChatContext {
  storeName?: string;
  today: string;
  products: ChatProduct[];
  history: ChatHistoryMsg[];
  question: string;
  focusedProduct?: ChatProduct & { brand?: string };
  catalogMatches?: CatalogMatch[];
  fsProducts?: FSProductChat[];
  fsCounts?: FSCountChat[];
  // ============ CONTEXTO AMPLIADO ============
  /** Historial de acciones recientes */
  actionHistory?: ChatHistoryEntry[];
  promotions?: ChatPromo[];
  recounts?: ChatRecount[];
  recountTotal?: number;
  fsCountTotal?: number;
  promoTotal?: number;
  unavailable?: string[];
  /** Estadísticas del inventario */
  stats?: ChatStats;
  /** Configuración de la tienda */
  settings?: ChatSettings;
  /** Fecha/hora actual completa */
  nowISO?: string;
  /** Día de la semana en español */
  dayOfWeek?: string;
}

export type ChatChunk =
  | { type: "text"; content: string }
  | {
      type: "action";
      name: string;
      args: Record<string, unknown>;
      requiresConfirmation?: boolean;
      confirmationLabel?: string;
    }
  | { type: "error"; content: string };

export interface InternalTool {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const DESTRUCTIVE_ACTIONS = new Set([
  "eliminarProducto",
  "borrarPromociones",
  "eliminarVarios",
  "guardarFS",
]);

export function buildConfirmationLabel(name: string, args: Record<string, unknown>): string {
  if (name === "eliminarProducto") {
    return `Eliminar "${String(args.name ?? "producto")}"`;
  }
  if (name === "borrarPromociones") {
    return `Borrar promociones de "${String(args.sourceFile ?? "archivo")}"`;
  }
  if (name === "eliminarVarios") {
    const count = Array.isArray(args.productIds) ? args.productIds.length : 0;
    return `Eliminar ${count} producto(s)`;
  }
  if (name === "guardarFS") {
    const pname = String(args.productName ?? args.product_code ?? "producto FS");
    return `Guardar conteo de ${pname}`;
  }
  return `Ejecutar ${name}`;
}

// ============================================
// CONTEXTO AMPLIADO PARA IA MÁS INTELIGENTE
// ============================================

export interface ChatHistoryEntry {
  action: string;
  name: string;
  barcode?: string;
  at: string;
  snapshot?: string;
}

export interface ChatPromo {
  barcode: string;
  name: string;
  priceBefore: number;
  priceNow: number;
  endDate?: string;
  startDate?: string;
  dynamic?: string;
  observations?: string;
  status: "activa" | "próxima" | "vencida";
}

export interface ChatRecount {
  title: string;
  date: string;
  itemCount: number;
  measuredCount: number;
  items: {
    name: string;
    code: string;
    category: string;
    physical: number | null;
    system: number | null;
    difference: number | null;
    status: string;
  }[];
}

export interface ChatStats {
  totalProducts: number;
  totalUnits: number;
  expired: number;
  soon: number;
  ok: number;
  totalValue?: number;
  byCategory?: Record<string, number>;
}

export interface ChatSettings {
  storeName: string;
  days: number[];
  sound: boolean;
  vibration: boolean;
  notifyOnOpen: boolean;
}
