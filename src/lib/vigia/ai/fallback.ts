import type { ChatChunk } from "./types";

type Model<T> = { name: string; run: () => Promise<T | null> };
type StreamModel = { name: string; run: () => AsyncIterable<ChatChunk> };

const unavailableUntil = new Map<string, number>();
const available = (name: string) => (unavailableUntil.get(name) ?? 0) <= Date.now();

function recordFailure(name: string, error: unknown) {
  const { status, headers } = (error ?? {}) as { status?: number; headers?: Headers };
  if (status === 429 || status === 402) {
    const retry = headers?.get("retry-after");
    const seconds = retry ? Number(retry) : NaN;
    const delay = Number.isFinite(seconds) ? seconds * 1000
      : retry ? Date.parse(retry) - Date.now() : NaN;
    unavailableUntil.set(name, Date.now() +
      Math.min(300_000, Math.max(1000, Number.isFinite(delay) ? delay : 30_000)));
  }
  console.warn("[vigia-ai]", name, typeof status === "number" ? status : "sin respuesta");
}

export async function firstModelResult<T>(models: Model<T>[]): Promise<T | null> {
  for (const model of models) {
    if (!available(model.name)) continue;
    try {
      const result = await model.run();
      if (result !== null) return result;
    } catch (error) {
      recordFailure(model.name, error);
    }
  }
  return null;
}

/** Stream text immediately, but commit actions only after a complete valid answer. */
export async function* firstModelStream(
  models: StreamModel[],
  valid: (chunk: ChatChunk) => boolean,
  signal?: AbortSignal,
): AsyncGenerator<ChatChunk, boolean> {
  for (const model of models) {
    if (signal?.aborted) return false;
    if (!available(model.name)) continue;
    let hasText = false;
    const actions: ChatChunk[] = [];
    try {
      for await (const chunk of model.run()) {
        if (signal?.aborted) return false;
        if (chunk.type === "text") {
          if (valid(chunk) || hasText) {
            hasText = hasText || Boolean(chunk.content.trim());
            yield chunk;
          }
        } else if (chunk.type === "action" && valid(chunk)) {
          actions.push(chunk);
        } else {
          throw new Error("Respuesta inválida del proveedor");
        }
      }
      if (hasText || actions.length) {
        yield* actions;
        return true;
      }
    } catch (error) {
      if (signal?.aborted) return false;
      recordFailure(model.name, error);
    }
    // A failed attempt must not be mixed with its replacement or execute actions.
    if (hasText) yield { type: "reset" };
  }
  return false;
}
