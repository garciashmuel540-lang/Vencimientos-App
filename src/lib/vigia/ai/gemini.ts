/**
 * Cliente de Gemini. Convierte los tipos internos al formato de Gemini
 * y devuelve chunks en formato interno.
 */
import { GoogleGenAI, Type } from "@google/genai";
import type { ChatContext, ChatChunk, InternalTool } from "./types";
import { buildConfirmationLabel, DESTRUCTIVE_ACTIONS } from "./types";
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

function buildInventorySummary(ctx: ChatContext): string {
  const { products, today } = ctx;
  const fmt = (p: { name: string; quantity: number; expiresAt: string }) => {
    const days = Math.round(
      (new Date(p.expiresAt).getTime() - new Date(today).getTime()) / 86400000,
    );
    const label =
      days < 0
        ? `vencido hace ${-days}d`
        : days === 0
          ? "vence HOY"
          : `vence en ${days}d`;
    return `- ${p.name} (${p.quantity} u., ${label})`;
  };
  const lines: string[] = [];
  lines.push(`Tienda: ${ctx.storeName ?? "Vigía"}`);
  lines.push(`Hoy: ${today}`);
  lines.push(`Total: ${products.length} productos`);
  lines.push("");
  const expired = products.filter((p) => p.status === "expired");
  const soon = products.filter((p) => p.status === "soon");
  const ok = products.filter((p) => p.status === "ok");
  if (expired.length) {
    lines.push(`VENCIDOS (${expired.length}):`);
    expired.forEach((p) => lines.push(fmt(p)));
    lines.push("");
  }
  if (soon.length) {
    lines.push(`POR VENCER (${soon.length}):`);
    soon.forEach((p) => lines.push(fmt(p)));
    lines.push("");
  }
  if (ok.length && ok.length <= 15) {
    lines.push(`VIGENTES (${ok.length}):`);
    ok.forEach((p) => lines.push(fmt(p)));
  } else if (ok.length) {
    lines.push(`VIGENTES: ${ok.length} productos (no listados).`);
  }
  return lines.join("\n");
}

export async function* llamarGemini(
  ctx: ChatContext,
): AsyncGenerator<ChatChunk> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Falta GEMINI_API_KEY en el servidor.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const inventory = buildInventorySummary(ctx);

  const contents = [
    ...ctx.history.map((m) => ({
      role: m.role,
      parts: [{ text: m.text }],
    })),
    {
      role: "user" as const,
      parts: [
        {
          text: `${ctx.question}\n\n--- INVENTARIO ---\n${inventory}${
            ctx.focusedProduct
              ? `\n\n--- PRODUCTO ENFOCADO ---\nNombre: ${ctx.focusedProduct.name}\nCantidad: ${ctx.focusedProduct.quantity}\nVence: ${ctx.focusedProduct.expiresAt}\nEstado: ${ctx.focusedProduct.status}`
              : ""
          }${
            ctx.catalogMatches && ctx.catalogMatches.length > 0
              ? `\n\n--- CATÁLOGO (coincidencias) ---\n${ctx.catalogMatches
                  .map(
                    (c) =>
                      `- ${c.name}${c.brand ? ` | ${c.brand}` : ""} | ${
                        typeof c.price === "number"
                          ? `C$ ${c.price.toFixed(2)}`
                          : "sin precio"
                      }`,
                  )
                  .join("\n")}`
              : ""
          }`,
        },
      ],
    },
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
          confirmationLabel: isDestructive
            ? buildConfirmationLabel(name, args)
            : undefined,
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
