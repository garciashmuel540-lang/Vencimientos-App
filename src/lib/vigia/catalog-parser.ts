/**
 * Parser del Excel de catálogo completo (PRDA74).
 * Extrae: código, nombre, marca, presentación, categoría, departamento,
 * proveedor, precio, precio C, costo, existencia.
 * Reutiliza la lógica de resolución de fórmulas del parser de promociones.
 */
import * as XLSX from "xlsx";
import type { CatalogEntry, ProductCategory } from "./types";

export interface ParsedCatalogResult {
  entries: Omit<CatalogEntry, "fetchedAt">[];
  sourceFile: string;
  warnings: string[];
}

type Row = (string | number | null | undefined)[];

const HEADERS = {
  barcode: ["item lookup code", "itemlookupcode", "codigo de barra", "codigo de barras", "código de barras", "barcode"],
  name: ["description", "descripcion", "descripción"],
  department: ["department", "departamento"],
  category: ["category", "categoria", "categoría"],
  supplier: ["supplier", "proveedor"],
  brand: ["marca", "brand"],
  qty: ["qty", "cantidad", "existencia"],
  cost: ["cost", "costo"],
  price: ["price", "precio"],
  priceC: ["price c", "precio c"],
  inactive: ["inactive", "inactivo"],
};

function norm(s: unknown): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function findHeaderIndex(header: Row, keys: string[]): number {
  for (let i = 0; i < header.length; i++) {
    const h = norm(header[i]);
    if (keys.some((k) => h === norm(k))) return i;
  }
  // Segundo intento: startsWith
  for (let i = 0; i < header.length; i++) {
    const h = norm(header[i]);
    if (keys.some((k) => h.startsWith(norm(k)))) return i;
  }
  return -1;
}

function looksLikeBarcode(v: unknown): boolean {
  if (v == null) return false;
  const s = String(v).trim();
  if (!s) return false;
  if (s.startsWith("=")) return false;
  return /^[A-Z0-9]{3,20}$/i.test(s);
}

function toNumber(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  const s = String(v).trim();
  if (s.startsWith("=")) return undefined;
  const n = Number(s.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

function resolveFormula(formula: string, sheet: Row[]): number | undefined {
  if (!formula.startsWith("=")) return undefined;
  const clean = formula.slice(1).trim();

  // SUM(Fx:Fy)
  const sumMatch = clean.match(/^SUM\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)$/i);
  if (sumMatch) {
    const [, col1, r1, , r2] = sumMatch;
    let total = 0;
    for (let r = parseInt(r1); r <= parseInt(r2); r++) {
      const v = toNumber(sheet[r - 1]?.[XLSX.utils.decode_col(col1)]);
      if (v != null) total += v;
    }
    return total;
  }

  // ROUNDUP(expr, 0)
  const roundMatch = clean.match(/^ROUNDUP\((.*?),?\s*\d*\)$/i);
  if (roundMatch) {
    const inner = resolveFormula("=" + roundMatch[1], sheet);
    if (inner == null) return undefined;
    return Math.ceil(inner);
  }

  // Reemplazar referencias a celdas
  let expr = clean.replace(/([A-Z]+)(\d+)/gi, (_m, col, row) => {
    const c = XLSX.utils.decode_col(col);
    const r = parseInt(row) - 1;
    const v = toNumber(sheet[r]?.[c]);
    return v != null ? String(v) : "0";
  });

  if (!/^[\d\s+\-*/().]+$/.test(expr)) return undefined;

  try {
    const result = Function(`"use strict"; return (${expr});`)();
    return Number.isFinite(result) ? Math.round(result * 100) / 100 : undefined;
  } catch {
    return undefined;
  }
}

function resolveValue(
  v: unknown,
  sheet: Row[],
): number | undefined {
  if (v == null || v === "") return undefined;
  if (typeof v === "number") return v;
  const s = String(v).trim();
  if (s.startsWith("=")) return resolveFormula(s, sheet);
  return toNumber(s);
}

export async function parseCatalogFile(file: File): Promise<ParsedCatalogResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const warnings: string[] = [];
  const entries: Omit<CatalogEntry, "fetchedAt">[] = [];
  const sourceFile = file.name;

  for (const sheetName of wb.SheetNames) {
    const sheet = XLSX.utils.sheet_to_json<Row>(wb.Sheets[sheetName], {
      header: 1,
      raw: false,
      defval: "",
    });

    // Detectar encabezado
    let headerRowIdx = -1;
    let hIdx: Record<string, number> = {};
    for (let i = 0; i < Math.min(sheet.length, 30); i++) {
      const row = sheet[i];
      if (!row) continue;
      const b = findHeaderIndex(row, HEADERS.barcode);
      if (b >= 0) {
        headerRowIdx = i;
        hIdx = {
          barcode: b,
          name: findHeaderIndex(row, HEADERS.name),
          department: findHeaderIndex(row, HEADERS.department),
          category: findHeaderIndex(row, HEADERS.category),
          supplier: findHeaderIndex(row, HEADERS.supplier),
          brand: findHeaderIndex(row, HEADERS.brand),
          qty: findHeaderIndex(row, HEADERS.qty),
          cost: findHeaderIndex(row, HEADERS.cost),
          price: findHeaderIndex(row, HEADERS.price),
          priceC: findHeaderIndex(row, HEADERS.priceC),
          inactive: findHeaderIndex(row, HEADERS.inactive),
        };
        break;
      }
    }

    if (headerRowIdx < 0) {
      warnings.push(`Hoja "${sheetName}": sin encabezado reconocible, se omite.`);
      continue;
    }

    for (let i = headerRowIdx + 1; i < sheet.length; i++) {
      const row = sheet[i];
      if (!row) continue;

      const barcode = String(row[hIdx.barcode] ?? "").trim();
      if (!barcode || !looksLikeBarcode(barcode)) continue;

      const name = String(
        hIdx.name >= 0 ? row[hIdx.name] ?? "" : "",
      ).trim();
      if (!name) continue;
      if (name.toLowerCase().includes("grand summaries")) continue;

      const inactiveVal = hIdx.inactive >= 0 ? String(row[hIdx.inactive] ?? "") : "";
      const inactive = inactiveVal.toLowerCase() === "true";

      const categoryRaw = String(
        hIdx.category >= 0 ? row[hIdx.category] ?? "" : "",
      ).trim();
      const department = String(
        hIdx.department >= 0 ? row[hIdx.department] ?? "" : "",
      ).trim();
      const supplier = String(
        hIdx.supplier >= 0 ? row[hIdx.supplier] ?? "" : "",
      ).trim();
      const brand = String(
        hIdx.brand >= 0 ? row[hIdx.brand] ?? "" : "",
      ).trim();

      const price = hIdx.price >= 0 ? resolveValue(row[hIdx.price], sheet) : undefined;
      const priceC = hIdx.priceC >= 0 ? resolveValue(row[hIdx.priceC], sheet) : undefined;
      const cost = hIdx.cost >= 0 ? resolveValue(row[hIdx.cost], sheet) : undefined;
      const qty = hIdx.qty >= 0 ? resolveValue(row[hIdx.qty], sheet) : undefined;

      entries.push({
        barcode,
        name,
        brand,
        presentation: "",
        category: categoryRaw as ProductCategory,
        image: null,
        source: "manual",
        department: department || undefined,
        supplier: supplier || undefined,
        price,
        priceC,
        cost,
        qtySnapshot: qty,
        inactive,
      });
    }
  }

  return { entries, sourceFile, warnings };
}
