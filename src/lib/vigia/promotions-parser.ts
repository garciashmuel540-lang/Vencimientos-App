/**
 * Parser de archivos Excel/CSV de promociones.
 * Lee el archivo, detecta encabezados, resuelve fórmulas simples
 * y devuelve un array de Promotion.
 */
import * as XLSX from "xlsx";
import type { Promotion } from "./types";

interface ParsedResult {
  promotions: Promotion[];
  sourceFile: string;
  warnings: string[];
}

type Row = (string | number | null | undefined)[];

const HEADER_KEYS = {
  barcode: ["código de barra", "codigo de barra", "codigo", "código", "barcode"],
  name: [
    "descripción según sistema",
    "descripcion segun sistema",
    "descripción del producto según sistema",
    "descripcion del producto segun sistema",
    "descripción",
    "descripcion",
  ],
  dynamic: ["dinámica", "dinamica"],
  startDate: ["fecha de inicio", "fecha inicio"],
  endDate: ["fecha de finalización", "fecha finalizacion", "fecha de finalizacion"],
  priceBefore: ["precio antes", "precio antes pya", "precio_antes"],
  priceNow: ["precio ahora", "precio ahora pya"],
  priceBeforePYA: ["precio antes pya"],
  priceNowPYA: ["precio ahora pya"],
  observations: ["observaciones", "observacion"],
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
    if (keys.some((k) => h === norm(k) || h.startsWith(norm(k)))) return i;
  }
  return -1;
}

function looksLikeBarcode(v: unknown): boolean {
  if (v == null) return false;
  const s = String(v).trim();
  if (!s) return false;
  if (s.startsWith("=")) return false;
  // Códigos alfanuméricos tipo AMPM... o numéricos de 6-14 dígitos
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

function toDate(v: unknown): string | undefined {
  if (v == null || v === "") return undefined;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  // "2026-09-11 00:00:00" → "2026-09-11"
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return undefined;
}

/**
 * Resuelve fórmulas simples tipo:
 *  =+F3*0.858   → valor de F3 * 0.858
 *  =ROUNDUP(F3*1.03,0)
 *  =30*2
 *  =SUM(F34:F35)
 *  =71*3
 */
function resolveFormula(
  formula: string,
  currentRow: number,
  sheet: Row[],
): number | undefined {
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

  // ROUNDUP(expr, 0) o ROUNDUP(expr)
  const roundMatch = clean.match(/^ROUNDUP\((.*?),?\s*\d*\)$/i);
  if (roundMatch) {
    const inner = resolveFormula("=" + roundMatch[1], currentRow, sheet);
    if (inner == null) return undefined;
    return Math.ceil(inner);
  }

  // Reemplazar referencias a celdas tipo F3, H3, por valores
  let expr = clean;
  expr = expr.replace(/([A-Z]+)(\d+)/gi, (_m, col, row) => {
    const c = XLSX.utils.decode_col(col);
    const r = parseInt(row) - 1;
    const v = toNumber(sheet[r]?.[c]);
    return v != null ? String(v) : "0";
  });

  // Solo números, espacios y operadores
  if (!/^[\d\s+\-*/().]+$/.test(expr)) return undefined;

  try {
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${expr});`)();
    return Number.isFinite(result) ? Math.round(result * 100) / 100 : undefined;
  } catch {
    return undefined;
  }
}

function resolveValue(
  v: unknown,
  currentRow: number,
  sheet: Row[],
): number | undefined {
  if (v == null || v === "") return undefined;
  if (typeof v === "number") return v;
  const s = String(v).trim();
  if (s.startsWith("=")) return resolveFormula(s, currentRow, sheet);
  return toNumber(s);
}

export async function parsePromotionsFile(file: File): Promise<ParsedResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const warnings: string[] = [];
  const promotions: Promotion[] = [];
  const sourceFile = file.name;
  const importedAt = new Date().toISOString();
  let nextId = 1;

  for (const sheetName of wb.SheetNames) {
    const sheet = XLSX.utils.sheet_to_json<Row>(wb.Sheets[sheetName], {
      header: 1,
      raw: false,
      defval: "",
    });

    // Detectar encabezados: buscamos la primera fila con "código de barra"
    let headerRowIdx = -1;
    let headerIdx: Record<string, number> = {};
    for (let i = 0; i < Math.min(sheet.length, 30); i++) {
      const row = sheet[i];
      if (!row) continue;
      const b = findHeaderIndex(row, HEADER_KEYS.barcode);
      if (b >= 0) {
        headerRowIdx = i;
        headerIdx = {
          barcode: b,
          name: findHeaderIndex(row, HEADER_KEYS.name),
          dynamic: findHeaderIndex(row, HEADER_KEYS.dynamic),
          startDate: findHeaderIndex(row, HEADER_KEYS.startDate),
          endDate: findHeaderIndex(row, HEADER_KEYS.endDate),
          priceBefore: findHeaderIndex(row, HEADER_KEYS.priceBefore),
          priceNow: findHeaderIndex(row, HEADER_KEYS.priceNow),
          priceBeforePYA: findHeaderIndex(row, HEADER_KEYS.priceBeforePYA),
          priceNowPYA: findHeaderIndex(row, HEADER_KEYS.priceNowPYA),
          observations: findHeaderIndex(row, HEADER_KEYS.observations),
        };
        break;
      }
    }

    if (headerRowIdx < 0) {
      warnings.push(`Hoja "${sheetName}": sin encabezado reconocible, se omite.`);
      continue;
    }

    let currentCategory = "";

    for (let i = headerRowIdx + 1; i < sheet.length; i++) {
      const row = sheet[i];
      if (!row) continue;

      const barcodeRaw = row[headerIdx.barcode];
      const barcode = String(barcodeRaw ?? "").trim();

      // Detectar fila de "categoría" (una sola celda con texto, resto vacío)
      const nonEmpty = row.filter((c) => String(c ?? "").trim() !== "");
      if (nonEmpty.length === 1) {
        currentCategory = String(nonEmpty[0]).trim();
        continue;
      }

      // Ignorar filas que no tengan código válido
      if (!barcode || !looksLikeBarcode(barcode)) continue;
      if (!/^(AMPM|[A-Z0-9]{6,20})/i.test(barcode)) continue;

      const name = String(row[headerIdx.name] ?? "").trim();
      const dynamic = String(row[headerIdx.dynamic] ?? "").trim();
      const observations =
        headerIdx.observations >= 0
          ? String(row[headerIdx.observations] ?? "").trim()
          : "";

      const priceBefore = resolveValue(
        row[headerIdx.priceBefore],
        i + 1,
        sheet,
      );
      const priceNow = resolveValue(row[headerIdx.priceNow], i + 1, sheet);
      const priceBeforePYA =
        headerIdx.priceBeforePYA >= 0
          ? resolveValue(row[headerIdx.priceBeforePYA], i + 1, sheet)
          : undefined;
      const priceNowPYA =
        headerIdx.priceNowPYA >= 0
          ? resolveValue(row[headerIdx.priceNowPYA], i + 1, sheet)
          : undefined;

      // Ignorar filas sin precio actual resoluble
      if (priceNow == null && priceBefore == null) continue;

      promotions.push({
        id: `${sourceFile}#${sheetName}#${nextId++}`,
        barcode,
        name,
        dynamic,
        priceBefore: priceBefore ?? 0,
        priceNow: priceNow ?? priceBefore ?? 0,
        priceBeforePYA,
        priceNowPYA,
        category: sheetName,
        subcategory: currentCategory || undefined,
        startDate: toDate(row[headerIdx.startDate]),
        endDate: toDate(row[headerIdx.endDate]),
        observations: observations || undefined,
        sourceFile,
        importedAt,
      });
    }
  }

  return { promotions, sourceFile, warnings };
}
