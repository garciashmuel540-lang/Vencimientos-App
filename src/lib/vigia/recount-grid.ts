import type { OCRWord } from "./recounts";

type Rule = { y: number; slope: number };
type Column = { x: number; slope: number };
export type InventoryGrid = {
  rules: Rule[];
  rail: number;
  code: Column;
  description: Column;
  stock: Column;
  stockRight?: Column;
  headerY: number;
};
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/** Locate printed rules on the unused right side of the stock column. */
export function detectInventoryGrid(image: ImageData, words: OCRWord[]): InventoryGrid | null {
  const { width, height, data } = image;
  const stock = words.find(
    (w) =>
      /^cantidad\b/.test(normalize(w.text)) &&
      words.some(
        (other) =>
          /^disponible\b/.test(normalize(other.text)) &&
          Math.abs(other.bbox.y0 - w.bbox.y0) < w.bbox.y1 - w.bbox.y0 &&
          other.bbox.x0 > w.bbox.x0,
      ),
  );
  if (!stock) return detectUntitledGrid(image, words);
  const font = stock.bbox.y1 - stock.bbox.y0;
  const headerY = (stock.bbox.y0 + stock.bbox.y1) / 2;
  const sameHeader = (word: OCRWord) =>
    Math.abs(word.bbox.y0 - stock.bbox.y0) < font * 1.3 && word.bbox.x0 < stock.bbox.x0;
  const code = words.find((w) => sameHeader(w) && /^(c.digo|[ií]tem)\b/.test(normalize(w.text)));
  const description = words.find(
    (w) =>
      sameHeader(w) &&
      /^(descr|producto|art.culo)/.test(normalize(w.text)) &&
      w.bbox.x0 > (code?.bbox.x0 ?? 0) + width * 0.18,
  );
  if (!code || !description || font < 5) return null;
  const rail = Math.round(Math.min(width - font * 4, stock.bbox.x0 + font * 10.5));
  const pixel = (x: number, y: number) => data[(Math.round(y) * width + Math.round(x)) * 4] ?? 255;
  const verticalContrast = (x: number, y: number) =>
    (pixel(x, y - 4) + pixel(x, y + 4)) / 2 - pixel(x, y);
  const score = new Float32Array(height);
  for (let y = stock.bbox.y1 + 1; y < height - 5; y++) {
    const samples = [];
    for (let x = rail - font * 2.6; x <= rail + font * 2.6; x += 4)
      samples.push(verticalContrast(x, y));
    samples.sort((a, b) => a - b);
    score[y] = samples[Math.floor(samples.length / 2)];
  }
  const peak = (start: number, end: number) => {
    let y = Math.max(5, Math.round(start));
    for (let j = y + 1; j <= Math.min(height - 5, end); j++) if (score[j] > score[y]) y = j;
    return score[y] >= 5 ? y : null;
  };
  const first = peak(stock.bbox.y1 + 2, stock.bbox.y1 + font * 1.25);
  if (first === null) return null;
  const next = peak(first + font * 1.55, first + font * 3.1);
  if (next === null) return null;
  const boundaries = [first, next];
  let step = next - first;
  while (boundaries.length < 101) {
    const y = boundaries.at(-1)!;
    const following = peak(y + step * 0.77, y + step * 1.24);
    if (following === null || following <= y) break;
    step = step * 0.72 + (following - y) * 0.28;
    boundaries.push(following);
  }
  if (boundaries.length < 5) return null;
  const rules = boundaries.map((y) => {
    let best = -Infinity,
      result = { y, slope: 0 };
    for (let slope = -0.075; slope <= 0.035; slope += 0.002)
      for (let offset = -1; offset <= 1; offset++) {
        let total = 0;
        for (let x = code.bbox.x0; x < rail + font * 4; x += 6)
          total += Math.max(
            -15,
            Math.min(32, verticalContrast(x, y + offset + (x - rail) * slope)),
          );
        if (total > best) {
          best = total;
          result = { y: y + offset, slope };
        }
      }
    return result;
  });
  const column = (word: OCRWord): Column => {
    let best = -Infinity,
      result = { x: word.bbox.x0 - 5, slope: 0 };
    for (let x = word.bbox.x0 - font * 1.25; x <= word.bbox.x0 + font * 0.25; x += 1)
      for (let slope = -0.035; slope <= 0.115; slope += 0.002) {
        let total = 0;
        for (let y = first + 5; y < boundaries.at(-1)!; y += 6) {
          const sample = x + (y - headerY) * slope;
          total += Math.max(
            -15,
            Math.min(32, (pixel(sample - 4, y) + pixel(sample + 4, y)) / 2 - pixel(sample, y)),
          );
        }
        if (total > best) {
          best = total;
          result = { x, slope };
        }
      }
    return result;
  };
  return {
    rules,
    rail,
    headerY,
    code: column(code),
    description: column(description),
    stock: column(stock),
  };
}

/** Rectify one row while staying inside the printed boundaries. */
export function sampleInventoryCell(
  image: ImageData,
  grid: InventoryGrid,
  row: number,
  field: "identity" | "stock",
  inkThreshold = 13,
  wide = false,
): HTMLCanvasElement {
  const upper = grid.rules[row],
    lower = grid.rules[row + 1];
  const lineHeight = lower.y - upper.y;
  const column = field === "identity" ? grid.code : grid.stock;
  const stockRight = grid.stockRight;
  const left =
    column.x +
    (upper.y - grid.headerY) * column.slope +
    (field === "identity" || stockRight ? 3 : -lineHeight * (wide ? 0.43 : 0.24));
  const right =
    field === "identity"
      ? grid.stock.x + (upper.y - grid.headerY) * grid.stock.slope - 5
      : stockRight
        ? stockRight.x + (upper.y - grid.headerY) * stockRight.slope - 3
        : left + lineHeight * (wide ? 1.7 : 1.1);
  const scale = field === "identity" ? 2 : 4;
  const width = Math.max(1, Math.round((right - left) * scale));
  const height = Math.max(1, Math.round((lineHeight - 5) * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width + 24;
  canvas.height = height + 24;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "white";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const output = context.createImageData(width, height),
    sample = new Uint8Array(width * height),
    histogram = new Uint32Array(256);
  for (let x = 0; x < width; x++) {
    const sx = left + x / scale;
    const top = upper.y + (sx - grid.rail) * upper.slope + 2.5;
    const bottom = lower.y + (sx - grid.rail) * lower.slope - 2.5;
    for (let y = 0; y < height; y++) {
      const sy = top + ((bottom - top) * y) / height;
      const i = (Math.round(sy) * image.width + Math.round(sx)) * 4;
      const r = image.data[i] ?? 255,
        b = image.data[i + 2] ?? 255;
      const value = Math.min(
        255,
        r +
          (field === "stock" && !stockRight
            ? Math.max(0, b - r - inkThreshold) * (wide ? 7 : 10)
            : 0),
      );
      sample[y * width + x] = value;
      histogram[r]++;
    }
  }
  let background = 0,
    accumulated = 0;
  for (; background < 255; background++) {
    accumulated += histogram[background];
    if (accumulated >= sample.length * 0.72) break;
  }
  for (let i = 0; i < sample.length; i++) {
    const value = Math.max(
      0,
      Math.min(255, 255 + (sample[i] - background + (wide ? 8 : 18)) * (wide ? 5 : 7)),
    );
    output.data[i * 4] = value;
    output.data[i * 4 + 1] = value;
    output.data[i * 4 + 2] = value;
    output.data[i * 4 + 3] = 255;
  }
  context.putImageData(output, 12, 12);
  return canvas;
}

/** Item sheets often leave the stock header blank. Require a repeated barcode column,
 * a narrow ruled numeric column, and regularly spaced horizontal rules. */
function detectUntitledGrid(image: ImageData, words: OCRWord[]): InventoryGrid | null {
  const { width, height, data } = image;
  const middle = (w: OCRWord) => (w.bbox.x0 + w.bbox.x1) / 2;
  const median = (values: number[]) =>
    [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const codes = words
    .filter((w) => w.bbox.x0 < width * 0.32 && /^\d{7,14}$/.test(w.text.replace(/\D/g, "")))
    .sort((a, b) => a.bbox.y0 - b.bbox.y0);
  if (codes.length < 5) return null;
  const font = median(codes.map((w) => w.bbox.y1 - w.bbox.y0));
  const gaps = codes
    .slice(1)
    .map((w, i) => w.bbox.y0 - codes[i].bbox.y0)
    .filter((gap) => gap >= font * 1.4 && gap <= font * 3.6);
  if (gaps.length < 4) return null;
  const step = median(gaps);
  const headerY = codes[0].bbox.y0 - font;
  const minY = codes[0].bbox.y0,
    maxY = codes.at(-1)!.bbox.y1;
  const pixel = (x: number, y: number) => data[(Math.round(y) * width + Math.round(x)) * 4] ?? 255;
  const v = (x: number, y: number) => (pixel(x - 4, y) + pixel(x + 4, y)) / 2 - pixel(x, y);
  const h = (x: number, y: number) => (pixel(x, y - 3) + pixel(x, y + 3)) / 2 - pixel(x, y);
  const clip = (x: number) => Math.max(-20, Math.min(36, x));
  const fitVertical = (from: number, to: number) => {
    let best = { x: 0, slope: 0, strength: -Infinity };
    for (let x = from; x <= to; x += 1)
      for (let slope = -0.075; slope <= 0.105; slope += 0.003) {
        let score = 0,
          n = 0;
        for (let y = minY; y < maxY; y += 7) {
          score += clip(v(x + (y - headerY) * slope, y));
          n++;
        }
        if (score / n > best.strength) best = { x, slope, strength: score / n };
      }
    return best;
  };
  const candidates = words.filter(
    (w) =>
      middle(w) > width * 0.32 &&
      middle(w) < width * 0.86 &&
      w.bbox.y0 >= minY - font &&
      w.bbox.y1 <= maxY + font &&
      /^\d{1,5}(?:[.,]\d{1,3})?$/.test(w.text),
  );
  const centers = candidates
    .map(middle)
    .filter((x, i, a) => a.findIndex((y) => Math.abs(y - x) < font) === i)
    .map((x) => ({ x, neighbors: candidates.filter((w) => Math.abs(middle(w) - x) < font * 1.4) }))
    .filter((c) => c.neighbors.length >= Math.max(4, codes.length * 0.23))
    .sort((a, b) => a.x - b.x);
  for (const candidate of centers) {
    const center = median(candidate.neighbors.map(middle));
    const stock = fitVertical(center - width * 0.105, center - font * 0.55);
    const stockRight = fitVertical(center + font * 0.65, center + width * 0.11);
    const cellWidth = stockRight.x - stock.x;
    if (
      stock.strength < 8 ||
      stockRight.strength < 8 ||
      cellWidth > width * 0.16 ||
      cellWidth < font * 1.5
    )
      continue;
    const code = fitVertical(codes[0].bbox.x0 - font * 1.6, codes[0].bbox.x0 + font * 0.45);
    if (code.strength < 5 || stock.x - code.x < width * 0.22) continue;
    const rail = Math.round(Math.min(width - font * 2.5, stockRight.x + font * 2.1));
    const score = new Float32Array(height);
    for (let y = Math.max(4, Math.floor(minY - step * 1.4)); y < height - 4; y++) {
      const samples = [];
      for (let x = rail - font; x <= rail + font; x += 2) samples.push(h(x, y));
      score[y] = median(samples);
    }
    const peak = (from: number, to: number) => {
      let best = Math.max(4, Math.round(from));
      for (let y = best + 1; y <= Math.min(height - 4, to); y++)
        if (score[y] > score[best]) best = y;
      return score[best] >= 7 ? best : null;
    };
    const first = peak(minY - step * 0.65, minY + font * 0.35);
    if (first === null) continue;
    const lines = [first];
    let currentStep = step;
    while (lines.length < 101) {
      const last = lines.at(-1)!;
      const next = peak(last + currentStep * 0.76, last + currentStep * 1.25);
      if (next === null || next <= last) break;
      currentStep = currentStep * 0.65 + (next - last) * 0.35;
      lines.push(next);
    }
    if (lines.length < codes.length * 0.8) continue;
    const rules = lines.map((y) => {
      let best = -Infinity,
        result = { y, slope: 0 };
      for (let slope = -0.075; slope <= 0.075; slope += 0.0025)
        for (let offset = -1; offset <= 1; offset++) {
          let value = 0;
          for (let x = code.x + font; x < rail + font; x += 5)
            value += clip(h(x, y + offset + (x - rail) * slope));
          if (value > best) {
            best = value;
            result = { y: y + offset, slope };
          }
        }
      return result;
    });
    return {
      rules,
      rail,
      code,
      description: { x: code.x, slope: code.slope },
      stock,
      stockRight,
      headerY,
    };
  }
  return null;
}
