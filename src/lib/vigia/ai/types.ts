/**
 * Tipos compartidos entre providers de IA (Groq, Gemini).
 */

export interface ChatProduct {
  name: string;
  quantity: number;
  expiresAt: string;
  status: "ok" | "soon" | "expired";
  category?: string;
}

export interface ChatHistoryMsg {
  role: "user" | "model";
  text: string;
}

export interface FSProductChat {
  code: string;
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
  /** Catálogo completo de Food Service */
  fsProducts?: FSProductChat[];
  /** Conteos de FS del usuario (últimos 30 días o los que se hayan cargado) */
  fsCounts?: FSCountChat[];
  /** Si el usuario actual es admin (para ver consolidados) */
  fsIsAdmin?: boolean;
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

export function buildConfirmationLabel(
  name: string,
  args: Record<string, unknown>,
): string {
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
