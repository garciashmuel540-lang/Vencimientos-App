import { createWorker, PSM, type Worker } from "tesseract.js";
import { detectInventoryGrid, sampleInventoryCell } from "./recount-grid";
import type { OCRWord, RecountItem } from "./recounts";

export type ScannedPage = { text: string; words: OCRWord[]; items?: RecountItem[] };

async function readGrid(
  worker: Worker,
  image: ImageData,
  words: OCRWord[],
  onProgress: (message: string) => void,
  signal?: AbortSignal,
) {
  const grid = detectInventoryGrid(image, words);
  if (!grid) return undefined;
  const items: RecountItem[] = [];
  const rows = grid.rules.length - 1;
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SINGLE_LINE,
    tessedit_char_whitelist: "",
  });
  for (let row = 0; row < rows; row++) {
    signal?.throwIfAborted();
    onProgress(`Leyendo productos ${row + 1} de ${rows}…`);
    const cell = sampleInventoryCell(image, grid, row, "identity");
    const { data } = await worker.recognize(cell);
    cell.width = cell.height = 0;
    const raw = data.text.trim().replace(/\s+/g, " ");
    const match = raw.match(/^\W*((?:\d[\d ]{4,18}\d|[A-Z]{2,}\d{3,}))(?:\s+|[|])\s*(.*)$/i);
    const code = match?.[1].replace(/\s/g, "") ?? "";
    items.push({
      id: crypto.randomUUID(),
      code,
      name: match?.[2].trim() || raw || `Fila ${row + 1}`,
      category: "Documento",
      system: "",
      physical: "",
      raw,
      candidates: [],
    });
  }
  await worker.setParameters({ tessedit_char_whitelist: "0123456789.,-" });
  for (let row = 0; row < rows; row++) {
    signal?.throwIfAborted();
    onProgress(`Leyendo cantidades ${row + 1} de ${rows}…`);
    const readings: { value: string; confidence: number }[] = [];
    for (const [inkThreshold, wide] of [
      [7, false],
      [13, false],
      [10, true],
      [16, true],
    ] as const) {
      const cell = sampleInventoryCell(image, grid, row, "stock", inkThreshold, wide);
      const { data } = await worker.recognize(cell);
      cell.width = cell.height = 0;
      const value = data.text.trim();
      if (/^-?\d{1,7}(?:[.,]\d{1,3})?$/.test(value))
        readings.push({ value, confidence: data.confidence });
    }
    const ranked = [...readings].sort((a, b) => b.confidence - a.confidence);
    const best = ranked[0];
    items[row].candidates = [
      ...new Set(ranked.filter((r) => r.confidence >= 30).map((r) => r.value)),
    ];
    const agreed = ranked.filter((r) => r.value === best?.value && r.confidence >= 65).length >= 2;
    const conflicting = ranked.some((r) => r.value !== best?.value && r.confidence >= 80);
    if (best && !conflicting && (agreed || best.confidence >= 92)) items[row].system = best.value;
    if (!items[row].system) {
      const preview = sampleInventoryCell(image, grid, row, "stock", 14, true);
      items[row].stockPreview = preview.toDataURL("image/jpeg", 0.78);
      preview.width = preview.height = 0;
    }
  }
  return items;
}

export async function readRecountPhotos(
  images: string[],
  onProgress: (message: string) => void,
  onPage: (page: ScannedPage, index: number) => Promise<void>,
  signal?: AbortSignal,
) {
  const base = new URL("/ocr/", window.location.origin).href;
  const worker = await createWorker("spa", 1, {
    workerPath: base + "worker.min.js",
    corePath: base,
    langPath: base,
  });
  try {
    for (let i = 0; i < images.length; i++) {
      signal?.throwIfAborted();
      onProgress(`Leyendo página ${i + 1} de ${images.length}…`);
      const bitmap = await createImageBitmap(await (await fetch(images[i])).blob());
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      try {
        await worker.setParameters({
          tessedit_pageseg_mode: PSM.SPARSE_TEXT,
          tessedit_char_whitelist: "",
          preserve_interword_spaces: "1",
        });
        const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true });
        const words =
          data.blocks?.flatMap((b) =>
            b.paragraphs.flatMap((p) =>
              p.lines.flatMap((l) => l.words.map((w) => ({ text: w.text, bbox: w.bbox }))),
            ),
          ) ?? [];
        const items = await readGrid(
          worker,
          ctx.getImageData(0, 0, canvas.width, canvas.height),
          words,
          onProgress,
          signal,
        );
        await onPage({ text: data.text, words, items }, i);
      } finally {
        canvas.width = canvas.height = 0;
      }
    }
  } finally {
    await worker.terminate();
  }
}

export async function prepareRecountPhoto(file: Blob): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("Usá una foto JPG, PNG o WebP.");
  if (file.size > 25 * 1024 * 1024)
    throw new Error("La foto supera 25 MB. Elegí una imagen más pequeña.");
  const image = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  try {
    const ratio = Math.min(1, 1800 / Math.max(image.width, image.height));
    canvas.width = Math.round(image.width * ratio);
    canvas.height = Math.round(image.height * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No se pudo preparar la fotografía.");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.9);
  } finally {
    image.close();
    canvas.width = canvas.height = 0;
  }
}
