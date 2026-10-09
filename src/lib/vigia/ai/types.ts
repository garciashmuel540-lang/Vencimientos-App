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
  return `Ejecutar ${name}`;
}
