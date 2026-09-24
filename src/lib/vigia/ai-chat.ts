import { createServerFn } from "@tanstack/react-start";
import { GoogleGenAI } from "@google/genai";

/**
 * Chat con IA de Vigía.
 * Corre SOLO en el servidor → la API key nunca llega al navegador.
 */

export interface ChatProduct {
  name: string;
  quantity: number;
  expiresAt: string;
  status: "ok" | "soon" | "expired";
  category?: string;
}

export interface ChatHistoryMsg {
  role: "user" | "model";
  text: string;
}

export interface ChatContext {
  storeName?: string;
  today: string;
  products: ChatProduct[];
  history: ChatHistoryMsg[];
  question: string;
}

export interface ChatReply {
  text: string;
  error?: string;
}

const SYSTEM_PROMPT = `Eres el asistente de Vigía, una app para controlar vencimientos en tiendas de conveniencia.

Reglas:
- Responde SIEMPRE en español, tono cercano y directo, como un empleado experto.
- Sé breve: máximo 4 oraciones o una lista corta.
- Cuando te pregunten por productos, usa SOLO el inventario que te paso. No inventes nombres ni fechas.
- Si te preguntan por algo que no está, dilo claro: "No veo ese producto en tu inventario".
- Cuando sugieras acciones, prioriza por urgencia: vencidos > por vencer > vigentes.
- Si no sabes algo, dilo. No inventes.
- No des consejos médicos ni legales.
- Hoy es la fecha que te paso en el contexto.`;

function buildInventorySummary(ctx: ChatContext): string {
  const { products, today, storeName } = ctx;

  const expired = products.filter((p) => p.status === "expired");
  const soon = products.filter((p) => p.status === "soon");
  const ok = products.filter((p) => p.status === "ok");

  const fmt = (p: ChatProduct) => {
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
  lines.push(`Tienda: ${storeName ?? "Vigía"}`);
  lines.push(`Hoy: ${today}`);
  lines.push(`Total: ${products.length} productos`);
  lines.push("");

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

export const askVigiaFn = createServerFn({ method: "POST" })
  .validator((raw: unknown): ChatContext => {
    const input = raw as ChatContext;
    if (!input || typeof input.question !== "string" || !input.question.trim()) {
      throw new Error("Falta la pregunta.");
    }
    return {
      storeName: input.storeName,
      today: input.today ?? new Date().toISOString().slice(0, 10),
      products: Array.isArray(input.products) ? input.products : [],
      history: Array.isArray(input.history) ? input.history : [],
      question: input.question.trim().slice(0, 500),
    };
  })
  .handler(async ({ data }): Promise<ChatReply> => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return {
        text: "",
        error:
          "Falta GEMINI_API_KEY en el servidor. Configúrala en Railway → Variables.",
      };
    }

    const ai = new GoogleGenAI({ apiKey });
    const inventory = buildInventorySummary(data);

    const contents = [
      ...data.history.map((m) => ({
        role: m.role,
        parts: [{ text: m.text }],
      })),
      {
        role: "user" as const,
        parts: [
          { text: `${data.question}\n\n--- INVENTARIO ---\n${inventory}` },
        ],
      },
    ];

    try {
      const res = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          temperature: 0.4,
          maxOutputTokens: 500,
        },
      });

      const text = res.text?.trim() ?? "";
      if (!text) {
        return { text: "", error: "Gemini no devolvió respuesta." };
      }
      return { text };
    } catch (err) {
      console.error("[ai-chat] Gemini error:", err);
      const msg = err instanceof Error ? err.message : "Error desconocido";
      return { text: "", error: `Error al consultar Gemini: ${msg}` };
    }
  });
