/**
 * Orquestador del chat con IA.
 * Estrategia: Groq primero, Gemini de respaldo.
 * Si Groq falla con error de cuota, se reintenta con Gemini.
 */
import { createServerFn } from "@tanstack/react-start";
import type { ChatContext, ChatChunk } from "./ai/types";
import { llamarGroq } from "./ai/groq";
import { llamarGemini } from "./ai/gemini";

// Re-exportar tipos para el cliente
export type { ChatContext, ChatChunk, ChatProduct, ChatHistoryMsg, CatalogMatch } from "./ai/types";

function esErrorDeCuota(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("429") ||
    msg.includes("rate_limit") ||
    msg.includes("RESOURCE_EXHAUSTED") ||
    msg.includes("Quota exceeded") ||
    msg.includes("rate limit")
  );
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
      focusedProduct: input.focusedProduct,
      catalogMatches: input.catalogMatches,
    };
  })
  .handler(async ({ data }): Promise<ReadableStream<string>> => {
    const hasGroq = Boolean(process.env.GROQ_API_KEY);
    const hasGemini = Boolean(process.env.GEMINI_API_KEY);

    if (!hasGroq && !hasGemini) {
      return new ReadableStream<string>({
        start(controller) {
          controller.enqueue(
            JSON.stringify({
              type: "error",
              content:
                "Falta configurar GROQ_API_KEY o GEMINI_API_KEY en el servidor.",
            }) + "\n",
          );
          controller.close();
        },
      });
    }

    return new ReadableStream<string>({
      async start(controller) {
        const providers: Array<{
          name: string;
          fn: (ctx: ChatContext) => AsyncGenerator<ChatChunk>;
        }> = [];

        // Groq primero (mejor cuota)
        if (hasGroq) {
          providers.push({ name: "Groq", fn: llamarGroq });
        }
        // Gemini de respaldo
        if (hasGemini) {
          providers.push({ name: "Gemini", fn: llamarGemini });
        }

        let lastError: unknown = null;
        let yieldedAny = false;

        for (const provider of providers) {
          try {
            for await (const chunk of provider.fn(data)) {
              yieldedAny = true;
              controller.enqueue(JSON.stringify(chunk) + "\n");
            }
            // Si terminó sin errores, salimos
            controller.close();
            return;
          } catch (err) {
            lastError = err;
            // Si ya emitimos algo, no podemos reintentar (rompería el stream)
            if (yieldedAny) {
              console.error(
                `[ai-chat] ${provider.name} falló a mitad del stream:`,
                err,
              );
              const msg = err instanceof Error ? err.message : "Error desconocido";
              controller.enqueue(
                JSON.stringify({
                  type: "error",
                  content: `Error con ${provider.name}: ${msg}`,
                }) + "\n",
              );
              controller.close();
              return;
            }
            // Si es error de cuota, intentamos con el siguiente provider
            if (esErrorDeCuota(err)) {
              console.warn(
                `[ai-chat] ${provider.name} sin cuota, cambiando al siguiente...`,
              );
              continue;
            }
            // Otro error: no reintentamos
            console.error(`[ai-chat] ${provider.name} error:`, err);
            const msg = err instanceof Error ? err.message : "Error desconocido";
            controller.enqueue(
              JSON.stringify({
                type: "error",
                content: `Error con ${provider.name}: ${msg}`,
              }) + "\n",
            );
            controller.close();
            return;
          }
        }

        // Si llegamos aquí, todos los providers fallaron
        const msg =
          lastError instanceof Error ? lastError.message : "Sin respuesta";
        controller.enqueue(
          JSON.stringify({
            type: "error",
            content: `Todas las IAs están saturadas. Intenta en unos minutos. (${msg})`,
          }) + "\n",
        );
        controller.close();
      },
    });
  });
