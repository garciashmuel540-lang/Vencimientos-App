/**
 * Cliente de Gemini. Convierte los tipos internos al formato de Gemini
 * y devuelve chunks en formato interno.
 */
import { GoogleGenAI, Type } from "@google/genai";
import type { ChatContext, ChatChunk, InternalTool } from "./types";
import { buildConfirmationLabel, DESTRUCTIVE_ACTIONS } from "./types";
import { buildUserMessage } from "./context";
import { INTERNAL_TOOLS, SYSTEM_PROMPT } from "./tools";

const MODEL = "gemini-2.0-flash-exp";

interface GeminiSchema {
  type: Type;
  description?: string;
}

function convertToolsToGemini(tools: InternalTool[]) {
  return tools.map((t) => {
    const props: Record<string, GeminiSchema> = {};
    for (const [key, val] of Object.entries(t.parameters.properties)) {
      const v = val as { type?: string; description?: string };
      props[key] = {
        type: v.type === "number" ? Type.NUMBER : Type.STRING,
        description: v.description,
      };
    }
    return {
      name: t.name,
      description: t.description,
      parameters: {
        type: Type.OBJECT,
        properties: props,
        required: t.parameters.required,
      },
    };
  });
}

export async function* llamarGemini(ctx: ChatContext): AsyncGenerator<ChatChunk> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Falta GEMINI_API_KEY en el servidor.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const contents = [
    ...ctx.history.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
    { role: "user", parts: [{ text: buildUserMessage(ctx) }] },
  ];

  const stream = await ai.models.generateContentStream({
    model: MODEL,
    contents,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      temperature: 0.3,
      maxOutputTokens: 1024,
      thinkingConfig: { thinkingBudget: 0 },
      tools: [{ functionDeclarations: convertToolsToGemini(INTERNAL_TOOLS) }],
    },
  });

  for await (const chunk of stream) {
    const fnCalls = chunk.functionCalls;
    if (fnCalls && fnCalls.length > 0) {
      for (const fc of fnCalls) {
        const name = fc.name ?? "";
        const args = (fc.args ?? {}) as Record<string, unknown>;
        const isDestructive = DESTRUCTIVE_ACTIONS.has(name);
        yield {
          type: "action",
          name,
          args,
          requiresConfirmation: isDestructive,
          confirmationLabel: isDestructive ? buildConfirmationLabel(name, args) : undefined,
        };
      }
      continue;
    }
    const text = chunk.text;
    if (text) {
      yield { type: "text", content: text };
    }
  }
}
