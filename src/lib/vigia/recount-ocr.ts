import { createWorker, PSM, type Worker } from "tesseract.js";
import { detectInventoryGrid, sampleInventoryCell } from "./recount-grid";
import {
  readPrintNumber,
  printNumberExamples,
  wholeStockShape,
  type StockGlyph,
} from "./recount-glyphs";
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
  const rowIndices: number[] = [];
  const shapes: StockGlyph[][] = [];
  const stockParts: [StockGlyph, StockGlyph][][] = [];
  const observed: { value: string; confidence: number }[][] = [];
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
    const match = raw.match(/^\W*((?:\d[\d ]{4,18}\d|[A-Z]{2,}\d{3,}))(?:\s+|[^\w]+)\s*(.*)$/i);
    if (grid.stockRight && !/[a-z0-9]{3}/i.test(raw)) continue;
    const code = match?.[1].replace(/\s/g, "") ?? "";
    rowIndices.push(row);
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
  for (let index = 0; index < items.length; index++) {
    const row = rowIndices[index];
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
      if (grid.stockRight && (inkThreshold === 10 || inkThreshold === 7)) {
        shapes[index] ??= [];
        for (const threshold of [85, 128, 175, 210]) {
          const shape = wholeStockShape(cell, threshold);
          if (shape) shapes[index].push(shape);
          const left = wholeStockShape(cell, threshold, "left"),
            right = wholeStockShape(cell, threshold, "right");
          if (left && right) {
            (stockParts[index] ??= []).push([left, right]);
          }
        }
      }
      const { data } = await worker.recognize(cell);
      cell.width = cell.height = 0;
      const value = data.text.trim();
      if (/^-?\d{1,7}(?:[.,]\d{1,3})?$/.test(value))
        readings.push({ value, confidence: data.confidence });
    }
    if (grid.stockRight) {
      for (const mode of [PSM.SINGLE_WORD, PSM.SINGLE_CHAR]) {
        await worker.setParameters({ tessedit_pageseg_mode: mode });
        const cell = sampleInventoryCell(image, grid, row, "stock", 13, true);
        const { data } = await worker.recognize(cell);
        cell.width = cell.height = 0;
        const value = data.text.trim();
        if (/^-?\d{1,7}(?:[.,]\d{1,3})?$/.test(value))
          readings.push({ value, confidence: data.confidence });
      }
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE });
    }
    observed[index] = readings;
    const ranked = [...readings].sort((a, b) => b.confidence - a.confidence);
    const best = ranked[0];
    items[index].candidates = [
      ...new Set(ranked.filter((r) => r.confidence >= 30).map((r) => r.value)),
    ];
    const agreed = ranked.filter((r) => r.value === best?.value && r.confidence >= 65).length >= 2;
    const conflicting = ranked.some((r) => r.value !== best?.value && r.confidence >= 80);
    if (best && !conflicting && (agreed || best.confidence >= 92)) items[index].system = best.value;
    if (!items[index].system) {
      const preview = sampleInventoryCell(image, grid, row, "stock", 14, true);
      items[index].stockPreview = preview.toDataURL("image/jpeg", 0.78);
      preview.width = preview.height = 0;
    }
  }
  if (grid.stockRight) {
    const examples = [
      ...printNumberExamples(),
      ...items.flatMap((item, index) =>
        item.system && shapes[index]
          ? shapes[index].map((shape) => ({ value: item.system, shape }))
          : [],
      ),
    ];
    for (let i = 0; i < items.length; i++) {
      if (items[i].system || !shapes[i]) continue;
      const results = shapes[i].map((shape) => readPrintNumber(shape, examples));
      const supported = results.filter(
        (r) => r.score < 0.33 && observed[i].some((o) => o.value === r.value && o.confidence >= 12),
      );
      const strongMatch = results.filter(
        (r) => r.score < 0.18 && r.margin > 0.035 && items.some((item) => item.system === r.value),
      );
      const combined =
        supported.length >= 3 ? supported : strongMatch.length >= 2 ? strongMatch : [];
      if (combined.length && combined.every((r) => r.value === combined[0].value)) {
        items[i].system = combined[0].value;
        items[i].stockPreview = undefined;
      }
    }
    const digitExamples = examples.filter((e) => /^\d$/.test(e.value));
    for (let i = 0; i < items.length; i++)
      if (/^\d$/.test(items[i].system))
        for (const shape of shapes[i] ?? []) digitExamples.push({ value: items[i].system, shape });
    for (let i = 0; i < items.length; i++) {
      if (items[i].system || !stockParts[i]) continue;
      const votes = stockParts[i].map((pair) =>
        pair.map((part) => readPrintNumber(part, digitExamples)),
      );
      const coherent = votes.filter((pair) =>
        pair.every((r) => r.score < 0.23 && r.margin >= 0.04),
      );
      const values = coherent.map((pair) => pair.map((r) => r.value).join(""));
      if (values.length >= 3 && values.every((v) => v === values[0])) {
        items[i].system = values[0];
        items[i].stockPreview = undefined;
      } else {
        const repeats = stockParts[i].flatMap(([left, right], index) => {
          const [first, second] = votes[index];
          const distance =
            left.mask.reduce((total, bit, pos) => total + Number(bit !== right.mask[pos]), 0) /
            left.mask.length;
          return distance < 0.16 &&
            first.score < 0.22 &&
            first.margin > 0.04 &&
            (second.value === first.value || second.margin < 0.035) &&
            observed[i].some((o) => o.value === first.value)
            ? [first.value.repeat(2)]
            : [];
        });
        if (repeats.length >= 3 && repeats.every((value) => value === repeats[0])) {
          items[i].system = repeats[0];
          items[i].stockPreview = undefined;
        }
      }
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
