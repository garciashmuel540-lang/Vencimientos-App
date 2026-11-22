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

export function shelfGrid({ width, height }: ShelfSize) {
  // Carta con márgenes de 10 mm y separación de 2 mm.
  const columns = Math.floor((215.9 - 20 + 2) / (width + 2));
  const rows = Math.floor((279.4 - 20 + 2) / (height + 2));
  return { columns, perPage: columns * rows };
}
