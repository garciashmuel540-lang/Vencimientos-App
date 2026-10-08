import { createServerFn } from "@tanstack/react-start";
import { GoogleGenAI, Type } from "@google/genai";

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

export interface CatalogMatch {
  barcode: string;
  name: string;
  brand: string;
  price?: number;
  priceC?: number;
  department?: string;
  category?: string;
}

export interface ChatContext {
  storeName?: string;
  today: string;
  products: ChatProduct[];
  history: ChatHistoryMsg[];
  question: string;
  focusedProduct?: ChatProduct & { brand?: string };
  catalogMatches?: CatalogMatch[];
}

export interface ChatReply {
  text: string;
  error?: string;
}

const SYSTEM_PROMPT = `Eres el asistente de Vigía, una app para controlar vencimientos en tiendas de conveniencia.

Reglas generales:
- Responde SIEMPRE en español, tono cercano y directo, como un empleado experto.
- Sé breve: máximo 4 oraciones o una lista corta.
- Cuando te pregunten por productos, usa SOLO el inventario que te paso. No inventes nombres ni fechas.
- Si te preguntan por algo que no está, dilo claro: "No veo ese producto en tu inventario".
- Cuando sugieras acciones, prioriza por urgencia: vencidos > por vencer > vigentes.
- Si no sabes algo, dilo. No inventes.
- No des consejos médicos ni legales.
- Hoy es la fecha que te paso en el contexto.
- Si te paso un PRODUCTO ENFOCADO al final, prioriza responder sobre ÉL. Ignora el resto del inventario a menos que el usuario lo pida explícitamente.
- Para consultar precios: PRIMERO revisa el bloque CATÁLOGO que te paso al final del mensaje. Si el producto está ahí, responde con esos datos.
- Si el producto NO está en el bloque CATÁLOGO, LLAMA A LA HERRAMIENTA buscarCatalogo con el nombre o marca. Esa tool busca en los 3189 productos del catálogo completo.

REGLAS DE HERRAMIENTAS (MUY IMPORTANTE):
- Tienes herramientas para AGREGAR, ELIMINAR, CONSUMIR, ACTUALIZAR VENCIMIENTOS y ACTUALIZAR PRECIOS.
- Cuando el usuario pida una ACCIÓN, SIEMPRE debes LLAMAR A LA HERRAMIENTA.
- NUNCA respondas solo con texto diciendo lo que vas a hacer. Si dices "Listo, elimino el producto" pero no llamas a la herramienta, NADA se ejecuta. Eso es un error grave.
- El sistema se encarga de ejecutar la acción y de confirmar al usuario. Tú solo llama a la herramienta.
- Ejemplo BIEN: el usuario dice "borra el maní pro" → llamas a la herramienta eliminarProducto con { name: "maní pro" }. Ya no escribes texto. El sistema confirma al usuario.
- Ejemplo MAL: responder "Listo, elimino el maní pro" sin llamar a la herramienta. Eso NO funciona.
- Antes de llamar la herramienta, si te falta un dato obligatorio (fecha, cantidad), pregúntale al usuario. Si tienes todos los datos, LLAMA la herramienta YA.
- Si la fecha es relativa ("mañana", "en 2 semanas"), conviértela a YYYY-MM-DD usando la fecha de hoy.
- Si el nombre del producto es ambiguo y hay varios candidatos en el inventario, pregúntale al usuario cuál antes de llamar la herramienta.
- Después de llamar una herramienta, NO repitas el resultado con otro texto. El sistema ya lo muestra.
`;

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

export type ChatChunk =
  | { type: "text"; content: string }
  | {
      type: "action";
      name: string;
      args: Record<string, unknown>;
      requiresConfirmation?: boolean;
      confirmationLabel?: string;
    }
  | { type: "error"; content: string };

// Acciones que requieren confirmación del usuario antes de ejecutarse
const DESTRUCTIVE_ACTIONS = new Set(["eliminarProducto", "borrarPromociones", "eliminarVarios"]);

const tools = [
  {
    functionDeclarations: [
      {
        name: "agregarProducto",
        description:
          "Agrega un producto nuevo al inventario. Úsalo cuando el usuario diga cosas como 'agrega una coca', 'registra 5 panes que vencen el 15/10', 'añade leche'.",
        parametersJsonSchema: {
          type: Type.OBJECT,
          properties: {
            name: {
              type: Type.STRING,
              description: "Nombre del producto, ej: 'Coca-Cola', 'Pan de caja'",
            },
            quantity: {
              type: Type.NUMBER,
              description: "Cantidad de unidades (entero positivo)",
            },
            expiresAt: {
              type: Type.STRING,
              description: "Fecha de vencimiento en formato YYYY-MM-DD",
            },
            brand: { type: Type.STRING, description: "Marca del producto (opcional)" },
            category: {
              type: Type.STRING,
              description:
                "Categoría: bebida, lacteo, snack, panaderia, carnes, limpieza, cuidado, congelados, enlatados, otros",
            },
          },
          required: ["name", "quantity", "expiresAt"],
        },
      },
      {
        name: "eliminarProducto",
        description:
          "Elimina un producto del inventario. Úsalo cuando el usuario diga 'borra el yogurt', 'quita la coca', 'elimina el pan'.",
        parametersJsonSchema: {
          type: Type.OBJECT,
          properties: {
            name: {
              type: Type.STRING,
              description: "Nombre (o parte del nombre) del producto a eliminar",
            },
          },
          required: ["name"],
        },
      },
      {
        name: "consumirProducto",
        description:
          "Descuenta unidades de un producto (por venta o consumo). Úsalo cuando el usuario diga 'vendí 2 panes', 'quita 3 cocas', 'consumí 1 yogurt'.",
        parametersJsonSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING, description: "Nombre del producto" },
            amount: {
              type: Type.NUMBER,
              description: "Cuántas unidades descontar",
            },
          },
          required: ["name", "amount"],
        },
      },
      {
        name: "actualizarVencimiento",
        description:
          "Cambia la fecha de vencimiento de un producto existente. Úsalo cuando el usuario diga 'cambia la fecha del pan al 20/10', 'el yogurt vence el 5/11'.",
        parametersJsonSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING, description: "Nombre del producto" },
            expiresAt: {
              type: Type.STRING,
              description: "Nueva fecha YYYY-MM-DD",
            },
          },
          required: ["name", "expiresAt"],
        },
      },
      {
        name: "actualizarPrecio",
        description:
          "Actualiza el precio de venta, precio C (mayoreo) o costo de un producto. Úsalo cuando el usuario diga 'ponle C$ 50 a la Coca-Cola', 'el Red Bull ahora cuesta 120', 'sube el precio del pan a 85', 'actualiza el costo de la leche a 40'. Solo actualiza los precios que el usuario especifique.",
        parametersJsonSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING, description: "Nombre del producto" },
            price: { type: Type.NUMBER, description: "Nuevo precio de venta (opcional)" },
            priceC: { type: Type.NUMBER, description: "Nuevo precio C / mayoreo (opcional)" },
            cost: { type: Type.NUMBER, description: "Nuevo costo interno (opcional)" },
          },
          required: ["name"],
        },
      },
      {
        name: "buscarCatalogo",
        description:
          "Busca productos en el catálogo de precios completo de la tienda (3189 productos). Úsalo cuando el usuario pregunte por el precio de un producto que NO está en el bloque CATÁLOGO ni en el inventario. Ej: 'cuánto cuesta la Mirinda', 'precio del agua Alpina de 2 litros'. Esta tool SOLO consulta, no modifica nada.",
        parametersJsonSchema: {
          type: Type.OBJECT,
          properties: {
            query: {
              type: Type.STRING,
              description: "Término de búsqueda (nombre o marca). Ej: 'alpina 2 litros', 'mirinda', 'red bull'",
            },
          },
          required: ["query"],
        },
      },
    ],
  },
];

function buildConfirmationLabel(
  name: string,
  args: Record<string, unknown>,
): string {
  if (name === "eliminarProducto") {
    return `Eliminar "${String(args.name ?? "producto")}"`;
  }
  if (name === "borrarPromociones") {
    return `Borrar promociones de "${String(args.sourceFile ?? "archivo")}"`;
  }
  if (name === "eliminarVarios") {
    const count = Array.isArray(args.productIds) ? args.productIds.length : 0;
    return `Eliminar ${count} producto(s)`;
  }
  return `Ejecutar ${name}`;
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
  .handler(async ({ data }): Promise<ReadableStream<string>> => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return new ReadableStream<string>({
        start(controller) {
          controller.enqueue(
            JSON.stringify({
              type: "error",
              content: "Falta GEMINI_API_KEY en el servidor.",
            }) + "\n",
          );
          controller.close();
        },
      });
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
          {
            text: `${data.question}\n\n--- INVENTARIO ---\n${inventory}${
              data.focusedProduct
                ? `\n\n--- PRODUCTO ENFOCADO ---\nNombre: ${data.focusedProduct.name}\nMarca: ${data.focusedProduct.brand ?? "-"}\nCantidad: ${data.focusedProduct.quantity}\nVence: ${data.focusedProduct.expiresAt}\nEstado: ${data.focusedProduct.status}`
                : ""
            }${
              data.catalogMatches && data.catalogMatches.length > 0
                ? `\n\n--- CATÁLOGO (coincidencias de precios) ---\n${data.catalogMatches
                    .map(
                      (c) =>
                        `- ${c.name}${c.brand ? ` | ${c.brand}` : ""} | ${
                          typeof c.price === "number"
                            ? `C$ ${c.price.toFixed(2)}`
                            : "sin precio"
                        }${c.priceC ? ` | P. C: C$ ${c.priceC.toFixed(2)}` : ""}${
                          c.department ? ` | ${c.department}` : ""
                        }`,
                    )
                    .join("\n")}`
                : ""
            }`,
          },
        ],
      },
    ];

    return new ReadableStream<string>({
      async start(controller) {
        try {
          const stream = await ai.models.generateContentStream({
            model: "gemini-3.6-flash",
            contents,
            config: {
              systemInstruction: SYSTEM_PROMPT,
              temperature: 0.3,
              maxOutputTokens: 2048,
              thinkingConfig: { thinkingBudget: 0 },
              tools,
            },
          });

          for await (const chunk of stream) {
            // 1. ¿Llamada a función?
            const fnCalls = chunk.functionCalls;
            if (fnCalls && fnCalls.length > 0) {
              for (const fc of fnCalls) {
                const name = fc.name ?? "";
                const isDestructive = DESTRUCTIVE_ACTIONS.has(name);
                controller.enqueue(
                  JSON.stringify({
                    type: "action",
                    name,
                    args: fc.args ?? {},
                    requiresConfirmation: isDestructive,
                    confirmationLabel: isDestructive
                      ? buildConfirmationLabel(name, fc.args ?? {})
                      : undefined,
                  }) + "\n",
                );
              }
              continue;
            }

            // 2. Texto normal
            const text = chunk.text;
            if (text) {
              controller.enqueue(
                JSON.stringify({ type: "text", content: text }) + "\n",
              );
            }
          }
          controller.close();
        } catch (err) {
          console.error("[ai-chat] Gemini error:", err);
          const msg = err instanceof Error ? err.message : "Error desconocido";
          controller.enqueue(
            JSON.stringify({
              type: "error",
              content: `Error al consultar Gemini: ${msg}`,
            }) + "\n",
          );
          controller.close();
        }
      },
    });
  });
