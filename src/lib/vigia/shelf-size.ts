export type ShelfSize = { width: number; height: number }; // milímetros
export const defaultShelfSize: ShelfSize = { width: 40, height: 24 };
export const shelfLimits = { width: [35, 90], height: [20, 60] } as const;

export function isShelfSize(value: unknown): value is ShelfSize {
  if (!value || typeof value !== "object") return false;
  return (["width", "height"] as const).every((axis) => {
    const n = (value as Partial<ShelfSize>)[axis];
    const [min, max] = shelfLimits[axis];
    return typeof n === "number" && Number.isInteger(n) && n >= min && n <= max;
  });
}

export const shelfMargin = 5;
export const shelfGap = 0.5;
const usableWidth = 215.9 - 2 * shelfMargin;
const usableHeight = 279.4 - 2 * shelfMargin;

export function shelfGrid({ width, height }: ShelfSize) {
  const columns = Math.floor((usableWidth + shelfGap) / (width + shelfGap));
  const rows = Math.floor((usableHeight + shelfGap) / (height + shelfGap));
  return { columns, perPage: columns * rows };
}

export function fitShelfSheet(count: number): ShelfSize {
  const columns = 3;
  const maxRows = Math.floor((usableHeight + shelfGap) / (shelfLimits.height[0] + shelfGap));
  const rows = Math.max(1, Math.min(maxRows, Math.ceil(count / columns)));
  // Redondear hacia abajo deja espacio para el redondeo de la impresora.
  const fit = (space: number, slots: number) =>
    Math.floor(((space + shelfGap) / slots - shelfGap) * 10) / 10;
  return {
    width: fit(usableWidth, columns),
    height: Math.min(shelfLimits.height[1], fit(usableHeight, rows)),
  };
}
