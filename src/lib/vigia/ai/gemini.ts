/**
 * Cliente de Gemini. Convierte los tipos internos al formato de Gemini
 * y devuelve chunks en formato interno.
 */
import { GoogleGenAI } from "@google/genai";
import type { ChatContext, ChatChunk } from "./types";
import { buildConfirmationLabel, DESTRUCTIVE_ACTIONS } from "./types";
import { buildUserMessage } from "./context";
import { INTERNAL_TOOLS, SYSTEM_PROMPT } from "./tools";

const MODEL = "gemini-3.1-flash-lite";

export async function* llamarGemini(ctx: ChatContext): AsyncGenerator<ChatChunk> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Falta GEMINI_API_KEY en el servidor.");
  }

  const ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: 8000 } });
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
      maxOutputTokens: 2048,
      tools: [
        {
          functionDeclarations: INTERNAL_TOOLS.map(({ name, description, parameters }) => ({
            name,
            description,
            parametersJsonSchema: parameters,
          })),
        },
      ],
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
