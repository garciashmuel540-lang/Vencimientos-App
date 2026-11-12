import { registerHooks } from "node:module";
registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.includes("/src/lib/vigia/ai/") && /^\.\/[a-z/-]+$/.test(specifier))
      return next(specifier + ".ts", context);
    return next(specifier, context);
  },
});
if (process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY) {
  const { streamSom } = await import("../src/lib/vigia/ai/providers.ts");
  let text = "";
  const start = performance.now();
  for await (const chunk of streamSom({
    today: "2026-11-12",
    question: "En una tabla Markdown compara las cantidades del Café de prueba y la Leche de prueba que aparecen en los datos adjuntos. Incluí ambos productos.",
    history: [],
    products: [
      { name: "Café de prueba", quantity: 17, expiresAt: "2026-11-20", status: "soon" },
      { name: "Leche de prueba", quantity: 42, expiresAt: "2026-12-30", status: "ok" },
    ],
  })) if (chunk.type === "text") text += chunk.content;
  console.log("[som-table-check]", {
    table: /\|.*---.*\|/.test(text),
    correct: /Caf[eé].*\b17\b/i.test(text) && /Leche.*\b42\b/i.test(text),
    milliseconds: Math.round(performance.now() - start),
  });
}
