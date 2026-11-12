import type { FSInput } from "./food-service-calc";

export function hasFSShareData(count: FSInput | null | undefined): boolean {
  return Boolean(
    count &&
    [count.opened, count.sealed, count.system_qty].some(
      (value) => typeof value === "number" && Number.isFinite(value),
    ),
  );
}
