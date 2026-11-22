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

const usableWidth = 215.9 - 20;
const usableHeight = 279.4 - 20;
const gap = 2;

export function shelfGrid({ width, height }: ShelfSize) {
  // Carta con márgenes de 10 mm y separación de 2 mm.
  const columns = Math.floor((usableWidth + gap) / (width + gap));
  const rows = Math.floor((usableHeight + gap) / (height + gap));
  return { columns, perPage: columns * rows };
}

export function fitShelfSheet(size: ShelfSize, count: number): ShelfSize {
  if (count < 1) return size;
  const grid = shelfGrid(size);
  const columns = Math.min(count, grid.columns);
  const rows = Math.ceil(Math.min(count, grid.perPage) / columns);
  return {
    width: Math.min(shelfLimits.width[1], Math.floor((usableWidth + gap) / columns - gap)),
    height: Math.min(shelfLimits.height[1], Math.floor((usableHeight + gap) / rows - gap)),
  };
}
