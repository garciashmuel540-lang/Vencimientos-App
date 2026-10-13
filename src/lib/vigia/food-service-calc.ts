/**
 * Fórmulas de cálculo para Food Service.
 *
 * REPLICAN LAS FÓRMULAS DEL EXCEL ORIGINAL.
 *
 * Fórmula estándar:
 *   Producción = (Abiertos - PesoContenedor) / PesoUnitario
 *   Inventario = Sellados + Producción
 *   Diferencia = Inventario - Sistema
 *
 * Resultado:
 *   - Diferencia > 0 → Sobra
 *   - Diferencia < 0 → Falta
 *   - |Diferencia| < tolerancia → OK
 */
import type { FSProduct } from "./food-service-catalog";

export const DEFAULT_TOLERANCE = 0;

export interface FSInput {
  opened: number | null;
  sealed: number | null;
  system_qty: number | null;
}

export interface FSCalcResult {
  /** Producción (bolsas calculadas a partir de lo abierto) */
  production: number;
  /** Inventario total (sellados + producción) */
  inventory: number;
  /** Diferencia = inventario - sistema */
  difference: number;
  /** Estado: "ok" | "sobra" | "falta" | "incompleto" */
  status: "ok" | "sobra" | "falta" | "incompleto";
  /** Texto corto para mostrar */
  label: string;
}

/**
 * Calcula los valores a partir de los inputs del usuario.
 * No modifica nada; solo devuelve el resultado.
 */
export function calcFSItem(
  product: FSProduct,
  input: FSInput,
  tolerance: number = DEFAULT_TOLERANCE,
): FSCalcResult {
  const opened = typeof input.opened === "number" ? input.opened : null;
  const sealed = typeof input.sealed === "number" ? input.sealed : null;
  const system = typeof input.system_qty === "number" ? input.system_qty : null;

  // Si faltan datos, no podemos calcular
  if (opened === null || sealed === null || system === null) {
    return {
      production: 0,
      inventory: 0,
      difference: 0,
      status: "incompleto",
      label: "Faltan datos",
    };
  }

  // Fórmula: (abiertos - contenedor) / unitario
  const netWeight = Math.max(0, opened - product.containerWeight);
  const production = product.unitWeight > 0 ? netWeight / product.unitWeight : 0;
  const inventory = sealed + production;
  const difference = inventory - system;

  let status: FSCalcResult["status"];
  let label: string;

  // OK solo si la diferencia es EXACTAMENTE 0 (o dentro de tolerancia)
  if (Math.abs(difference) <= tolerance) {
    status = "ok";
    label = "OK";
  } else if (difference > 0) {
    status = "sobra";
    label = `Sobra ${difference.toFixed(2)}`;
  } else {
    status = "falta";
    label = `Falta ${Math.abs(difference).toFixed(2)}`;
  }

  return {
    production: round2(production),
    inventory: round2(inventory),
    difference: round2(difference),
    status,
    label,
  };
}

/**
 * Redondea a 2 decimales.
 */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Formatea un número para mostrar en la UI.
 */
export function formatFSNumber(n: number | null | undefined): string {
  if (typeof n !== "number") return "—";
  return n.toLocaleString("es-MX", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}
