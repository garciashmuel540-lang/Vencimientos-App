export type StockGlyph = { mask: Uint8Array; aspect: number };

export function wholeStockShape(
  canvas: HTMLCanvasElement,
  threshold = 128,
  half?: "left" | "right",
): StockGlyph | null {
  const { width, height } = canvas;
  const data = canvas.getContext("2d")!.getImageData(0, 0, width, height).data;
  const ink = (x: number, y: number) => data[(y * width + x) * 4] < threshold;
  let left = width,
    right = 0,
    top = height,
    bottom = 0;
  for (let x = 0; x < width; x++) {
    let dark = 0;
    for (let y = 0; y < height; y++) if (ink(x, y)) dark++;
    if (dark < 3) continue;
    left = Math.min(left, x);
    right = Math.max(right, x);
    for (let y = 0; y < height; y++)
      if (ink(x, y)) {
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
  }
  if (right <= left || bottom <= top) return null;
  if (half) {
    if ((right - left) / (bottom - top) < 0.7) return null;
    const mid = Math.round((right + left) / 2);
    let split = mid,
      least = Infinity;
    for (let x = mid - 4; x <= mid + 4; x++) {
      let n = 0;
      for (let y = top; y <= bottom; y++) if (ink(x, y)) n++;
      const score = n + Math.abs(x - mid) * 0.3;
      if (score < least) {
        split = x;
        least = score;
      }
    }
    if (half === "left") right = split - 1;
    else left = split;
    let x0 = width,
      x1 = 0,
      y0 = height,
      y1 = 0;
    for (let x = left; x <= right; x++)
      for (let y = top; y <= bottom; y++)
        if (ink(x, y)) {
          x0 = Math.min(x0, x);
          x1 = Math.max(x1, x);
          y0 = Math.min(y0, y);
          y1 = Math.max(y1, y);
        }
    left = x0;
    right = x1;
    top = y0;
    bottom = y1;
    if (right <= left || bottom <= top) return null;
  }
  const w = right - left + 1,
    h = bottom - top + 1,
    mask = new Uint8Array(32 * 32);
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++)
      mask[y * 32 + x] = Number(
        ink(left + Math.floor(((x + 0.5) * w) / 32), top + Math.floor(((y + 0.5) * h) / 32)),
      );
  return { mask, aspect: w / h };
}
export function printNumberExamples() {
  const canvas = document.createElement("canvas");
  canvas.width = 130;
  canvas.height = 70;
  const ctx = canvas.getContext("2d")!;
  const examples: { value: string; shape: StockGlyph }[] = [];
  for (const style of ["normal", "bold"])
    for (let n = 0; n < 100; n++) {
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, 130, 70);
      ctx.fillStyle = "black";
      ctx.font = `${style} 48px Arial`;
      ctx.fillText(String(n), 16, 53);
      const shape = wholeStockShape(canvas);
      if (shape) examples.push({ value: String(n), shape });
    }
  canvas.width = canvas.height = 0;
  return examples;
}
export function readPrintNumber(
  shape: StockGlyph,
  examples: ReturnType<typeof printNumberExamples>,
) {
  const scores = new Map<string, number>();
  for (const example of examples) {
    let misses = 0;
    for (let i = 0; i < shape.mask.length; i++)
      misses += Number(shape.mask[i] !== example.shape.mask[i]);
    const score = misses / shape.mask.length + 0.22 * Math.abs(shape.aspect - example.shape.aspect);
    scores.set(example.value, Math.min(scores.get(example.value) ?? Infinity, score));
  }
  const [best, runner] = [...scores].sort((a, b) => a[1] - b[1]);
  return { value: best[0], score: best[1], margin: runner[1] - best[1] };
}
