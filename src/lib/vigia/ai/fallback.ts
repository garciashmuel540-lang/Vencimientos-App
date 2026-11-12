type Model<T> = { name: string; run: () => Promise<T | null> };

const unavailableUntil = new Map<string, number>();

export async function firstModelResult<T>(models: Model<T>[]): Promise<T | null> {
  for (const model of models) {
    if ((unavailableUntil.get(model.name) ?? 0) > Date.now()) continue;
    try {
      const result = await model.run();
      if (result !== null) return result;
    } catch (error) {
      const { status, headers } = (error ?? {}) as { status?: number; headers?: Headers };
      if (status === 429 || status === 402) {
        const retry = headers?.get("retry-after");
        const seconds = retry ? Number(retry) : NaN;
        const delay = Number.isFinite(seconds)
          ? seconds * 1000
          : retry
            ? Date.parse(retry) - Date.now()
            : NaN;
        unavailableUntil.set(
          model.name,
          Date.now() + Math.min(300_000, Math.max(1000, Number.isFinite(delay) ? delay : 30_000)),
        );
      }
      console.warn("[vigia-ai]", model.name, typeof status === "number" ? status : "sin respuesta");
    }
  }
  return null;
}
