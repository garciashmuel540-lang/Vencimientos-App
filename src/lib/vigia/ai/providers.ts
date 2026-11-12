import { llamarGemini } from "./gemini";
import { llamarGroq } from "./groq";
import { INTERNAL_TOOLS } from "./tools";
import type { ChatChunk, ChatContext } from "./types";

const tools = new Map(INTERNAL_TOOLS.map((tool) => [tool.name, tool]));

function validChunk(chunk: ChatChunk): boolean {
  if (chunk.type === "text") return Boolean(chunk.content.trim());
  if (chunk.type !== "action" || !chunk.args || typeof chunk.args !== "object") return false;
  const params = tools.get(chunk.name)?.parameters;
  if (!params) return false;
  return (params.required ?? []).every((key) => {
    const expected = (params.properties[key] as { type: string }).type;
    const value = chunk.args[key];
    return (
      typeof value === expected &&
      (typeof value !== "string" || Boolean(value.trim())) &&
      (typeof value !== "number" || Number.isFinite(value))
    );
  });
}

export async function* streamSom(context: ChatContext): AsyncGenerator<ChatChunk> {
  const providers = [
    { name: "Groq", enabled: process.env.GROQ_API_KEY, ask: llamarGroq },
    { name: "Gemini", enabled: process.env.GEMINI_API_KEY, ask: llamarGemini },
  ];
  for (const provider of providers) {
    if (!provider.enabled) continue;
    let started = false;
    try {
      for await (const chunk of provider.ask(context)) {
        if ((chunk.type !== "text" || !started) && !validChunk(chunk)) continue;
        yield chunk;
        started = true;
      }
      if (started) return;
      console.warn(`[ai-chat] ${provider.name}: respuesta vacía`);
    } catch (err) {
      const status = (err as { status?: unknown } | null)?.status;
      console.warn(
        `[ai-chat] ${provider.name}: ${typeof status === "number" ? `HTTP ${status}` : "error de conexión"}`,
      );
      if (started) break;
    }
  }
  yield {
    type: "error",
    content:
      "La IA de Som no está disponible en este momento. Podés consultar directamente los vencimientos de hoy, el resumen del inventario o qué faltó en el último recuento.",
  };
}
