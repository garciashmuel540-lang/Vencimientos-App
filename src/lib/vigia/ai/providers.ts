import { llamarGroq } from "./groq";
import { INTERNAL_TOOLS, SYSTEM_PROMPT } from "./tools";
import { firstModelStream } from "./fallback";
import { geminiJson } from "./gemini";
import { buildUserMessage } from "./context";
import { buildConfirmationLabel, DESTRUCTIVE_ACTIONS } from "./types";
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

async function geminiAnswer(context: ChatContext, signal?: AbortSignal): Promise<ChatChunk[] | null> {
  const output = await geminiJson(
    [
      ...context.history.map(({ role, text }) => ({ role, parts: [{ text }] })),
      { role: "user", parts: [{ text: buildUserMessage(context) }] },
    ],
    2400,
    `${SYSTEM_PROMPT}
Respondé exclusivamente con un JSON: {"text":"tu respuesta","action":null} o {"text":"","action":{"name":"nombre","args":{}}}. Solo una acción por respuesta. Herramientas: ${JSON.stringify(INTERNAL_TOOLS)}`,
    signal,
  );
  if (!output) return null;
  const parsed = JSON.parse(output) as {
    text?: unknown;
    action?: { name?: unknown; args?: unknown } | null;
  };
  if (
    parsed.action &&
    typeof parsed.action.name === "string" &&
    parsed.action.args &&
    typeof parsed.action.args === "object" &&
    !Array.isArray(parsed.action.args)
  ) {
    const name = parsed.action.name;
    const args = parsed.action.args as Record<string, unknown>;
    const requiresConfirmation = DESTRUCTIVE_ACTIONS.has(name);
    const chunk: ChatChunk = {
      type: "action",
      name,
      args,
      requiresConfirmation,
      confirmationLabel: requiresConfirmation ? buildConfirmationLabel(name, args) : undefined,
    };
    return validChunk(chunk) ? [chunk] : null;
  }
  return typeof parsed.text === "string" && parsed.text.trim()
    ? [{ type: "text", content: parsed.text }]
    : null;
}

export async function* streamSom(context: ChatContext, signal?: AbortSignal): AsyncGenerator<ChatChunk> {
  const complete = yield* firstModelStream([
    ...(process.env.GROQ_API_KEY
      ? [{ name: "Groq 120B", run: () => llamarGroq(context, undefined, signal) }] : []),
    ...(process.env.GEMINI_API_KEY
      ? [{
          name: "Gemini 3.1 Flash-Lite",
          run: async function* () {
            const chunks = await geminiAnswer(context, signal);
            if (chunks) yield* chunks;
          },
        }] : []),
    ...(process.env.GROQ_API_KEY
      ? [{ name: "Groq 20B", run: () => llamarGroq(context, "openai/gpt-oss-20b", signal) }] : []),
  ], validChunk, signal);
  if (!complete && !signal?.aborted) {
    yield {
      type: "error",
      content:
        "La IA de Sôm no está disponible en este momento. Podés consultar directamente los vencimientos de hoy, el resumen del inventario o qué faltó en el último recuento.",
    };
  }
}
