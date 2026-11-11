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
  // An empty OCR code means that no barcode was read. It never identifies a product.
  const products = catalog
    .filter((product) => product.barcode.trim() && product.name.trim())
    .map((product) => ({
      ...product,
      barcode: product.barcode.trim(),
      key: nameKey(product.name),
    }));
  const byCode = new Map(products.map((product) => [product.barcode, product]));
  return items.map((item) => {
    const code = item.code.trim();
    const key = nameKey(item.name);
    const exact = code ? byCode.get(code) : undefined;
    const conflicting =
      exact &&
      key.length >= 10 &&
      1 - distance(key, exact.key) / Math.max(key.length, exact.key.length) < 0.65;
    let match = conflicting ? undefined : exact;
    if (!match) {
      if (key.length >= 10) {
        const scores = products
          .flatMap((product) => {
            if (!code && product.key !== key) return [];
            if (Math.abs(product.key.length - key.length) > key.length * 0.25) return [];
            const codeDifferences =
              /^\d{7,14}$/.test(code) && code.length === product.barcode.length
                ? [...code].filter((digit, i) => digit !== product.barcode[i]).length
                : Infinity;
            const similarCode = codeDifferences === 1;
            const corroboratedCode = codeDifferences === 2 && key.length >= 16;
            const similarity =
              1 - distance(key, product.key) / Math.max(key.length, product.key.length);
            if (similarity < (similarCode ? 0.74 : corroboratedCode ? 0.86 : 0.92)) return [];
            return [
              { product, score: similarity + (similarCode ? 0.14 : corroboratedCode ? 0.07 : 0) },
            ];
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
      : conflicting
        ? { ...item, code: "" }
        : item;
  });
}
