export interface RecountItem {
  id: string;
  code: string;
  name: string;
  category: string;
  system: string;
  physical: string;
  raw: string;
  candidates: string[];
  stockPreview?: string;
}
export interface Recount {
  id: string;
  userId: string;
  title: string;
  date: string;
  updatedAt: string;
  reviewed: boolean;
  items: RecountItem[];
  images: string[];
  rawText: string;
}
export type OCRWord = { text: string; bbox: { x0: number; x1: number; y0: number; y1: number } };
export function quantity(raw: string): number | null {
  let text = raw.trim().replace(/\s/g, "");
  if (!text) return null;
  if (text.includes(",") && text.includes(".")) {
    text =
      text.lastIndexOf(",") > text.lastIndexOf(".")
        ? text.replace(/\./g, "").replace(",", ".")
        : text.replace(/,/g, "");
  } else if (text.includes(",")) text = text.replace(",", ".");
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}
export function compareRecount(item: Pick<RecountItem, "system" | "physical">) {
  const system = quantity(item.system),
    physical = quantity(item.physical);
  if (system === null || physical === null || physical < 0)
    return { status: "pending" as const, difference: null, label: "Pendiente" };
  const difference = Math.round((physical - system) * 1e6) / 1e6;
  return {
    status:
      difference === 0 ? ("ok" as const) : difference > 0 ? ("sobra" as const) : ("falta" as const),
    difference,
    label:
      difference === 0
        ? "Correcto"
        : `${difference > 0 ? "Sobra" : "Falta"} ${Math.abs(difference).toLocaleString("es-NI")}`,
  };
}
const normal = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
/** Group words geometrically so separate OCR blocks preserve the printed table rows. */
export function readDocumentRows(
  words: OCRWord[],
  catalog: { barcode: string; name: string; category?: string }[],
): RecountItem[] {
  const lines: { words: OCRWord[]; y: number; height: number }[] = [];
  for (const word of [...words].sort((a, b) => a.bbox.y0 - b.bbox.y0)) {
    if (!word.text.trim()) continue;
    const y = (word.bbox.y0 + word.bbox.y1) / 2,
      height = word.bbox.y1 - word.bbox.y0;
    const line = lines.find(
      (l) => Math.abs(l.y - y) < Math.max(6, Math.min(l.height, height) * 0.55),
    );
    if (line) line.words.push(word);
    else lines.push({ words: [word], y, height });
  }
  const byCode = new Map(catalog.map((p) => [p.barcode, p]));
  let systemX: number | null = null;
  let nameX: number | null = null;
  const result: RecountItem[] = [];
  for (const line of lines.sort((a, b) => a.y - b.y)) {
    const ws = line.words.sort((a, b) => a.bbox.x0 - b.bbox.x0);
    const raw = ws.map((w) => w.text).join(" ");
    const header = ws.find((w) =>
      /^(sistema|existencias?|stock|saldo|disponible)$/i.test(
        normal(w.text.replace(/[^\wáéíóú]/gi, "")),
      ),
    );
    const nameHeader = ws.find((w) =>
      /^(descripcion|producto|articulo|nombre)$/i.test(normal(w.text.replace(/:$/, ""))),
    );
    if (header && (nameHeader || /codigo|cantidad/i.test(normal(raw)))) {
      const label =
        ws.find((w) => /^cantidad$/i.test(w.text) && w.bbox.x0 < header.bbox.x0) ?? header;
      systemX = label.bbox.x0;
      nameX = nameHeader?.bbox.x0 ?? null;
      continue;
    }
    if (/^(total|subtotal|pagina|fecha|impreso|usuario|tienda|reporte)\b/i.test(normal(raw)))
      continue;
    const codeIndex = ws.findIndex((w) =>
      /^(?:\d{5,18}|[A-Z]{2,}\d{3,})$/i.test(w.text.replace(/[|]/g, "")),
    );
    if (codeIndex < 0 && nameX === null) continue;
    const code = codeIndex < 0 ? "" : ws[codeIndex].text.replace(/[|]/g, "");
    const after =
      codeIndex < 0 ? ws.filter((w) => w.bbox.x0 >= nameX! - 30) : ws.slice(codeIndex + 1);
    let firstNumeric = after.length;
    while (firstNumeric > 0 && quantity(after[firstNumeric - 1].text) !== null) firstNumeric--;
    const name = after
      .slice(0, firstNumeric)
      .map((w) => w.text)
      .join(" ")
      .trim();
    const match = byCode.get(code);
    if (!match && (!name || !/[a-záéíóú]/i.test(name))) continue;
    const numeric = after
      .slice(firstNumeric)
      .filter((w) => quantity(w.text) !== null && (systemX === null || w.bbox.x0 >= systemX - 18));
    const aligned =
      systemX === null
        ? null
        : numeric.reduce<OCRWord | null>(
            (best, w) =>
              !best ||
              Math.abs((w.bbox.x0 + w.bbox.x1) / 2 - systemX!) <
                Math.abs((best.bbox.x0 + best.bbox.x1) / 2 - systemX!)
                ? w
                : best,
            null,
          );
    const selected =
      aligned && Math.abs((aligned.bbox.x0 + aligned.bbox.x1) / 2 - systemX!) < 150
        ? aligned
        : null;
    if (!code && !selected) continue;
    result.push({
      id: crypto.randomUUID(),
      code,
      name: match?.name ?? name,
      category: match?.category ?? "Documento",
      system: selected ? String(quantity(selected.text)) : "",
      physical: "",
      raw,
      candidates: numeric.map((w) => String(quantity(w.text))),
    });
  }
  return result;
}
