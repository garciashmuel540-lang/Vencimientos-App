/** Orquesta la respuesta de Sôm y su proveedor de respaldo. */
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { ChatContext, ChatChunk } from "./ai/types";
import { streamSom } from "./ai/providers";

export type { ChatContext, ChatChunk, ChatProduct, ChatHistoryMsg, CatalogMatch } from "./ai/types";

function bounded<T>(value: T[] | undefined, limit: number): T[] {
  return Array.isArray(value) ? value.slice(0, limit) : [];
}

export const askVigiaFn = createServerFn({ method: "POST" })
  .validator((raw: unknown): { accessToken: string; context: ChatContext } => {
    const input = raw as { accessToken?: unknown; context?: ChatContext } | null;
    const ctx = input?.context;
    if (!ctx || typeof ctx.question !== "string" || !ctx.question.trim()) {
      throw new Error("Falta la pregunta.");
    }
    if (typeof input.accessToken !== "string" || !input.accessToken) {
      throw new Error("Iniciá sesión para consultar a Sôm.");
    }
    return {
      accessToken: input.accessToken,
      context: {
        storeName: ctx.storeName,
        today: ctx.today ?? new Date().toISOString().slice(0, 10),
        nowISO: ctx.nowISO,
        dayOfWeek: ctx.dayOfWeek,
        question: ctx.question.trim().slice(0, 1000),
        products: bounded(ctx.products, 30),
        history: (Array.isArray(ctx.history) ? ctx.history.slice(-8) : [])
          .filter((m) => (m?.role === "user" || m?.role === "model") && typeof m.text === "string")
          .map(({ role, text }) => ({ role, text: text.slice(0, 2000) })),
        focusedProduct: ctx.focusedProduct,
        catalogMatches: bounded(ctx.catalogMatches, 12),
        fsProducts: bounded(ctx.fsProducts, 60),
        fsCounts: bounded(ctx.fsCounts, 25),
        fsCountTotal: ctx.fsCountTotal,
        recounts: bounded(ctx.recounts, 6)
          .filter(Boolean)
          .map((r) => ({
            title: r.title,
            date: r.date,
            itemCount: r.itemCount,
            measuredCount: r.measuredCount,
            items: bounded(r.items, 18),
          })),
        recountTotal: ctx.recountTotal,
        promotions: bounded(ctx.promotions, 15),
        promoTotal: ctx.promoTotal,
        actionHistory: bounded(ctx.actionHistory, 12),
        settings: ctx.settings,
        stats: ctx.stats,
        unavailable: bounded(ctx.unavailable, 8),
      },
    };
  })
  .handler(async ({ data }): Promise<ReadableStream<string>> => {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error("La conexión de Sôm no está configurada.");
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(data.accessToken);
    if (error || !user) throw new Error("Volvé a iniciar sesión para consultar a Sôm.");

    return new ReadableStream<string>({
      async start(controller) {
        for await (const chunk of streamSom(data.context)) {
          controller.enqueue(JSON.stringify(chunk) + "\n");
        }
        controller.close();
      },
    });
  });
