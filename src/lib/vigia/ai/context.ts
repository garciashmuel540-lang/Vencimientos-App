import type { ChatContext } from "./types";

export const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

export function relevance(terms: string[], ...fields: (string | undefined)[]): number {
  const words = new Set(
    normalize(fields.filter(Boolean).join(" "))
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );
  return terms.reduce((score, term) => score + (words.has(normalize(term)) ? 1 : 0), 0);
}

export function ranked<T>(rows: T[], score: (row: T) => number, limit: number): T[] {
  return rows
    .map((row) => ({ row, score: score(row) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ row }) => row);
}

function table<T>(rows: T[] | undefined, columns: (keyof T)[]) {
  if (!rows?.length) return undefined;
  return { columns, rows: rows.map((row) => columns.map((column) => row?.[column])) };
}

export function buildUserMessage({ question, history: _history, ...data }: ChatContext): string {
  const compact = {
    ...data,
    products: table(data.products, [
      "name",
      "barcode",
      "brand",
      "category",
      "location",
      "quantity",
      "expiresAt",
      "status",
      "price",
      "priceC",
      "notes",
    ]),
    fsProducts: table(data.fsProducts, [
      "code",
      "itemCode",
      "name",
      "category",
      "unit",
      "containerWeight",
      "unitWeight",
    ]),
    fsCounts: table(data.fsCounts, [
      "product_name",
      "product_code",
      "count_date",
      "unit",
      "opened",
      "sealed",
      "system_qty",
      "inventory",
      "difference",
      "status",
    ]),
    recounts: data.recounts?.map(({ items, ...doc }) => ({
      ...doc,
      items: table(items, [
        "name",
        "code",
        "category",
        "physical",
        "system",
        "difference",
        "status",
      ]),
    })),
  };
  return `Pregunta de la persona: ${question}\n\nDatos de Vigía (JSON; en las tablas, columns indica el orden de los valores de cada fila):\n${JSON.stringify(compact)}`;
}
