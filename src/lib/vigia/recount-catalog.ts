import type { RecountItem } from "./recounts";

type CatalogMatch = { barcode: string; name: string; category?: string };
const nameKey = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
function distance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const row = [i + 1];
    for (let j = 0; j < b.length; j++)
      row.push(Math.min(row[j] + 1, previous[j + 1] + 1, previous[j] + Number(a[i] !== b[j])));
    previous = row;
  }
  return previous[b.length];
}
export function reconcileRecountCatalog(
  items: RecountItem[],
  catalog: CatalogMatch[],
): RecountItem[] {
  const byCode = new Map(catalog.map((p) => [p.barcode, p]));
  const products = catalog.map((p) => ({ ...p, key: nameKey(p.name) }));
  return items.map((item) => {
    let match = byCode.get(item.code);
    if (!match) {
      const key = nameKey(item.name);
      if (key.length >= 10) {
        const scores = products
          .flatMap((product) => {
            if (Math.abs(product.key.length - key.length) > key.length * 0.25) return [];
            const similarCode =
              /^\d{7,14}$/.test(item.code) &&
              item.code.length === product.barcode.length &&
              [...item.code].filter((digit, i) => digit !== product.barcode[i]).length === 1;
            const similarity =
              1 - distance(key, product.key) / Math.max(key.length, product.key.length);
            if (similarity < (similarCode ? 0.74 : 0.92)) return [];
            return [{ product, score: similarity + (similarCode ? 0.14 : 0) }];
          })
          .sort((a, b) => b.score - a.score);
        const [best, runner] = scores;
        if (best && (!runner || best.score - runner.score >= 0.07)) match = best.product;
      }
    }
    return match
      ? {
          ...item,
          code: match.barcode,
          name: match.name,
          category: match.category || item.category,
        }
      : item;
  });
}
