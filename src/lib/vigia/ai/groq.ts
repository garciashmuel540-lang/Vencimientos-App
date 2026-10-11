/**
 * Cliente de Groq. Convierte los tipos internos al formato de Groq (OpenAI-compatible)
 * y devuelve chunks en formato interno.
 */
import Groq from "groq-sdk";
import type {
  ChatContext,
  ChatChunk,
  InternalTool,
} from "./types";
import { buildConfirmationLabel, DESTRUCTIVE_ACTIONS } from "./types";
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

function buildUserMessage(ctx: ChatContext): string {
  const inventory = buildInventorySummary(ctx);
  const fsBlock = buildFSSummary(ctx);
  return `${ctx.question}\n\n--- INVENTARIO ---\n${inventory}${fsBlock}${
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
  }`;
}

function buildFSSummary(ctx: ChatContext): string {
  const products = ctx.fsProducts ?? [];
  const counts = ctx.fsCounts ?? [];
  if (products.length === 0 && counts.length === 0) return "";

  const lines: string[] = [];
  lines.push("");
  lines.push("--- FOOD SERVICE ---");
  lines.push(`Catálogo FS: ${products.length} productos`);
  lines.push(`Conteos cargados: ${counts.length}${ctx.fsIsAdmin ? " (admin: incluye todos los usuarios)" : ""}`);

  // Agrupar productos por categoría
  if (products.length > 0) {
    lines.push("");
    lines.push("Productos FS (código | nombre | unidad | peso contenedor | peso unitario):");
    // Limitar a 40 para no inflar el contexto
    const limit = products.slice(0, 40);
    for (const p of limit) {
      lines.push(
        `- ${p.code} | ${p.name} | ${p.unit} | cont=${p.containerWeight} | unit=${p.unitWeight}`,
      );
    }
    if (products.length > 40) {
      lines.push(`  ... y ${products.length - 40} más`);
    }
  }

  // Conteos recientes
  if (counts.length > 0) {
    lines.push("");
    lines.push("Últimos conteos FS (nombre | abiertos | sellados | sistema | fecha):");
    // Ordenar por updated_at desc, limitar a 30
    const sorted = [...counts].sort((a, b) =>
      (b.updated_at ?? "").localeCompare(a.updated_at ?? ""),
    );
    const limit = sorted.slice(0, 30);
    for (const c of limit) {
      lines.push(
        `- ${c.product_name} | ab=${c.opened ?? "-"} | se=${c.sealed ?? "-"} | sis=${c.system_qty ?? "-"} | ${c.count_date}`,
      );
    }
    if (sorted.length > 30) {
      lines.push(`  ... y ${sorted.length - 30} más`);
    }
  }

  return lines.join("\n");
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

export async function* llamarGroq(
  ctx: ChatContext,
): AsyncGenerator<ChatChunk> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("Falta GROQ_API_KEY en el servidor.");
  }

  const groq = new Groq({ apiKey });

  const messages: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...ctx.history.map((m) => ({
      role: (m.role === "model" ? "assistant" : "user") as "assistant" | "user",
      content: m.text,
    })),
    { role: "user", content: buildUserMessage(ctx) },
  ];

  const stream = await groq.chat.completions.create({
    model: MODEL,
    messages,
    tools: convertToolsToGroq(INTERNAL_TOOLS) as never,
    tool_choice: "auto",
    temperature: 0.3,
    max_tokens: 1024,
    stream: true,
  });

  // Acumulador de tool calls (Groq las envía por partes)
  const toolCallsAccum: Map<
    number,
    { name: string; args: string }
  > = new Map();
  let hasEmittedAction = false;

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta;

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

  // Emitir las acciones acumuladas
  for (const tc of toolCallsAccum.values()) {
    if (!tc.name) continue;
    let args: Record<string, unknown> = {};
    try {
      args = tc.args ? (JSON.parse(tc.args) as Record<string, unknown>) : {};
    } catch {
      // Si los args no son JSON válido, los dejamos vacíos
    }
    const isDestructive = DESTRUCTIVE_ACTIONS.has(tc.name);
    hasEmittedAction = true;
    yield {
      type: "action",
      name: tc.name,
      args,
      requiresConfirmation: isDestructive,
      confirmationLabel: isDestructive
        ? buildConfirmationLabel(tc.name, args)
        : undefined,
    };
  }

  // Si no emitió ni texto ni acción, avisamos
  if (!hasEmittedAction && toolCallsAccum.size === 0) {
    // Si no hay texto ni tool calls, no hacemos nada
  }
}
