import { makeInventoryImages, type InventoryImageRow } from "./inventory-share";
import { compareRecount, quantity, type Recount } from "./recounts";

export function makeRecountImages(doc: Recount): Promise<File[]> {
  const groups = new Map<string, InventoryImageRow[]>();
  for (const item of doc.items) {
    const physical = quantity(item.physical);
    if (physical === null || physical < 0) continue;
    const category = item.category || "Documento";
    const result = compareRecount(item);
    if (!groups.has(category)) groups.set(category, []);
    groups
      .get(category)!
      .push({
        name: item.name,
        code: item.code,
        category,
        physical,
        system: quantity(item.system),
        ...result,
      });
  }
  return makeInventoryImages({
    title: doc.title || "Recuento diario",
    date: doc.date,
    fileStem: `recuento-${doc.date}`,
    rows: [...groups.values()].flat(),
  });
}
