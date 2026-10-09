/**
 * Definición de las tools en formato interno.
 */
import type { InternalTool } from "./types";

export const INTERNAL_TOOLS: InternalTool[] = [
  {
    name: "agregarProducto",
    description:
      "Agrega un producto nuevo al inventario. Úsalo cuando el usuario diga 'agrega una coca', 'registra 5 panes que vencen el 15/10'.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nombre del producto" },
        quantity: { type: "number", description: "Cantidad de unidades" },
        expiresAt: { type: "string", description: "Fecha YYYY-MM-DD" },
        brand: { type: "string", description: "Marca (opcional)" },
        category: { type: "string", description: "Categoría (opcional)" },
      },
      required: ["name", "quantity", "expiresAt"],
    },
  },
  {
    name: "eliminarProducto",
    description:
      "Elimina un producto del inventario. 'borra el yogurt', 'quita la coca'.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nombre del producto" },
      },
      required: ["name"],
    },
  },
  {
    name: "consumirProducto",
    description: "Descuenta unidades de un producto. 'vendí 2 panes'.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nombre del producto" },
        amount: { type: "number", description: "Cuántas unidades" },
      },
      required: ["name", "amount"],
    },
  },
  {
    name: "actualizarVencimiento",
    description: "Cambia la fecha de vencimiento de un producto.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nombre del producto" },
        expiresAt: { type: "string", description: "Nueva fecha YYYY-MM-DD" },
      },
      required: ["name", "expiresAt"],
    },
  },
  {
    name: "actualizarPrecio",
    description:
      "Actualiza el precio de venta, precio C o costo. 'ponle C$ 50 a la Coca-Cola'.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nombre del producto" },
        price: { type: "number", description: "Precio de venta (opcional)" },
        priceC: { type: "number", description: "Precio C (opcional)" },
        cost: { type: "number", description: "Costo interno (opcional)" },
      },
      required: ["name"],
    },
  },
  {
    name: "buscarCatalogo",
    description:
      "Busca productos en el catálogo completo de precios (3189 productos). 'cuánto cuesta la Mirinda'. Solo consulta.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Término de búsqueda" },
      },
      required: ["query"],
    },
  },
];

export const SYSTEM_PROMPT = `Eres el asistente de Vigía, una app para controlar vencimientos en tiendas de conveniencia.

Reglas generales:
- Responde SIEMPRE en español, tono cercano y directo.
- Sé breve: máximo 4 oraciones o una lista corta.
- Cuando te pregunten por productos, usa SOLO el inventario que te paso.
- Si te preguntan por algo que no está, dilo claro.
- Prioriza por urgencia: vencidos > por vencer > vigentes.
- Si no sabes algo, dilo. No inventes.
- No des consejos médicos ni legales.
- Hoy es la fecha que te paso en el contexto.
- Si te paso un PRODUCTO ENFOCADO, prioriza responder sobre ÉL.

REGLAS DE HERRAMIENTAS (MUY IMPORTANTE):
- Cuando el usuario pida una ACCIÓN, SIEMPRE debes LLAMAR A LA HERRAMIENTA.
- NUNCA respondas solo con texto diciendo lo que vas a hacer. Si dices "Listo, elimino" pero no llamas a la herramienta, NADA se ejecuta.
- El sistema se encarga de ejecutar y confirmar. Tú solo llama a la herramienta.
- Antes de llamar, si te falta un dato obligatorio, pregúntale al usuario.
- Si la fecha es relativa ("mañana"), conviértela a YYYY-MM-DD usando la fecha de hoy.
- Si el nombre es ambiguo, pregunta cuál antes de llamar la herramienta.
- Después de llamar una herramienta, NO repitas el resultado.`;
