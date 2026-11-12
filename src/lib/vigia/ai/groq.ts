/**
 * Cliente de Groq. Convierte los tipos internos al formato de Groq (OpenAI-compatible)
 * y devuelve chunks en formato interno.
 */
import Groq from "groq-sdk";
import type { ChatContext, ChatChunk, InternalTool } from "./types";
import { buildConfirmationLabel, DESTRUCTIVE_ACTIONS } from "./types";
import { buildUserMessage } from "./context";
import { INTERNAL_TOOLS, SYSTEM_PROMPT } from "./tools";

const MODEL = "openai/gpt-oss-120b";

function convertToolsToGroq(tools: InternalTool[]) {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

export async function* llamarGroq(ctx: ChatContext, model = MODEL): AsyncGenerator<ChatChunk> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("Falta GROQ_API_KEY en el servidor.");
  }

  const groq = new Groq({ apiKey, timeout: 8000, maxRetries: 0 });

  const messages: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...ctx.history.map((m) => ({
      role: (m.role === "model" ? "assistant" : "user") as "assistant" | "user",
      content: m.text,
    })),
    { role: "user", content: buildUserMessage(ctx) },
  ];

  const stream = await groq.chat.completions.create(
    {
      model,
      messages,
      tools: convertToolsToGroq(INTERNAL_TOOLS),
      tool_choice: "auto",
      temperature: 0.3,
      max_completion_tokens: /\b(tabla|comparar|comparativo|analiz[aá])\b/i.test(ctx.question)
        ? 3072
        : 2048,
      reasoning_effort: "low",
      include_reasoning: false,
      stream: true,
    },
    { signal: AbortSignal.timeout(12000) },
  );

  // Acumulador de tool calls (Groq las envía por partes)
  const toolCallsAccum: Map<number, { name: string; args: string }> = new Map();

  let finishReason: string | null = null;
  for await (const chunk of stream) {
    const choice = chunk.choices[0];
    if (choice?.finish_reason) finishReason = choice.finish_reason;
    const delta = choice?.delta;

    // Texto
    if (delta?.content) {
      yield { type: "text", content: delta.content };
    }

    // Tool calls (por partes)
    if (delta?.tool_calls) {
      for (const tc of delta.tool_calls) {
        const idx = tc.index ?? 0;
        const prev = toolCallsAccum.get(idx) ?? { name: "", args: "" };
        if (tc.function?.name) prev.name = tc.function.name;
        if (tc.function?.arguments) prev.args += tc.function.arguments;
        toolCallsAccum.set(idx, prev);
      }
    }
  }

  if (finishReason !== "stop" && finishReason !== "tool_calls" && finishReason !== "function_call")
    throw new Error("Respuesta incompleta de Groq");

  // Emitir las acciones acumuladas
  for (const tc of toolCallsAccum.values()) {
    if (!tc.name) continue;
    let args: Record<string, unknown> = {};
    try {
      args = tc.args ? (JSON.parse(tc.args) as Record<string, unknown>) : {};
    } catch {
      continue;
    }
    const isDestructive = DESTRUCTIVE_ACTIONS.has(tc.name);
    yield {
      type: "action",
      name: tc.name,
      args,
      requiresConfirmation: isDestructive,
      confirmationLabel: isDestructive ? buildConfirmationLabel(tc.name, args) : undefined,
    };
  }
}
