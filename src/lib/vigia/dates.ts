/** Cálculo de estados de vencimiento a partir de fechas locales. */

import {
  addDays,
  differenceInCalendarDays,
  format,
  isValid,
  parseISO,
  startOfDay,
} from "date-fns";
import { es } from "date-fns/locale";
import type { Product, ProductStatus } from "./types";

export function todayStart(): Date {
  return startOfDay(new Date());
}

export function parseDate(value: string): Date | null {
  if (!value) return null;
  const d = parseISO(value.length > 10 ? value : `${value}T00:00:00`);
  return isValid(d) ? startOfDay(d) : null;
}

export function daysUntil(expiresAt: string, from = todayStart()): number {
  const d = parseDate(expiresAt);
  if (!d) return 0;
  return differenceInCalendarDays(d, from);
}

export function statusOf(
  expiresAt: string,
  soonWithin = 30,
  from = todayStart(),
): ProductStatus {
  const days = daysUntil(expiresAt, from);
  if (days < 0) return "expired";
  if (days <= soonWithin) return "soon";
  return "ok";
}

export function statusLabel(status: ProductStatus): string {
  if (status === "ok") return "Vigente";
  if (status === "soon") return "Por vencer";
  return "Vencido";
}

export function daysLabel(expiresAt: string): string {
  const days = daysUntil(expiresAt);
  if (days < 0) {
    const n = Math.abs(days);
    return n === 1 ? "Venció ayer" : `Venció hace ${n} días`;
  }
  if (days === 0) return "Vence hoy";
  if (days === 1) return "Vence mañana";
  if (days <= 30) return `Vence en ${days} días`;
  return formatDate(expiresAt);
}

export function formatDate(value: string): string {
  const d = parseDate(value);
  if (!d) return "Sin fecha";
  return format(d, "d MMM yyyy", { locale: es });
}

export function formatLongDate(value: string): string {
  const d = parseDate(value);
  if (!d) return "Sin fecha";
  return format(d, "EEEE d 'de' MMMM", { locale: es });
}

export function isoDate(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function shiftIso(days: number, from = todayStart()): string {
  return isoDate(addDays(from, days));
}

export function productStatus(product: Product, soonWithin = 30): ProductStatus {
  return statusOf(product.expiresAt, soonWithin);
}
