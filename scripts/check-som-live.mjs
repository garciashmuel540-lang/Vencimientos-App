import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith("./") && context.parentURL?.includes("/src/lib/vigia/ai/")) {
      const candidate = new URL(specifier + ".ts", context.parentURL);
      if (existsSync(fileURLToPath(candidate))) return next(candidate.href, context);
    }
    return next(specifier, context);
  },
});

const { llamarGroq } = await import("../src/lib/vigia/ai/groq.ts");
const { llamarGemini } = await import("../src/lib/vigia/ai/gemini.ts");
const today = "2026-11-12";
const context = {
  question: "En el recuento de prueba, ¿cuántas unidades faltan de Producto de prueba? Usá la diferencia de la fila y respondé en una frase.",
  history: [],
  today,
  products: [],
  recounts: [{
    title: "Recuento de prueba", date: today, itemCount: 1, measuredCount: 1,
    items: [{
      name: "Producto de prueba", code: "01234", category: "Prueba",
      physical: 5, system: 12, difference: -7, status: "falta",
    }],
  }],
};

await Promise.all([
  ["Groq", process.env.GROQ_API_KEY, llamarGroq],
  ["Gemini", process.env.GEMINI_API_KEY, llamarGemini],
].map(async ([name, enabled, ask]) => {
  if (!enabled) return console.log(`[som-check] ${name} sin configuración`);
  try {
    const chunks = [];
    for await (const chunk of ask(context)) chunks.push(chunk);
    const reply = chunks.filter((chunk) => chunk.type === "text").map((chunk) => chunk.content).join("");
    const correct = /\b(?:7|siete)\b/i.test(reply);
    console.log(`[som-check] ${name}: ${correct ? "recuento correcto (faltan 7)" : reply.trim() ? "respondió sin el dato esperado" : chunks.length ? "emitió una herramienta" : "respuesta vacía"}`);
  } catch (err) {
    const status = typeof err?.status === "number" ? err.status : "sin respuesta HTTP";
    const code = typeof err?.code === "string" && /^[a-z0-9_-]{1,50}$/i.test(err.code) ? err.code : "";
    console.log(`[som-check] ${name}: ${status} ${code}`);
  }
}));
