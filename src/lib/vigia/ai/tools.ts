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
  {
    name: "consultarFS",
    description:
      "Consulta el último conteo de Food Service de un producto por nombre (ej. 'cappuccino', 'mayonesa'). Devuelve los gramos abiertos, sellados, sistema y la diferencia calculada.",
    parameters: {
      type: "object",
      properties: {
        productName: {
          type: "string",
          description: "Nombre o parte del nombre del producto FS",
        },
      },
      required: ["productName"],
    },
  },
  {
    name: "listarFS",
    description:
      "Lista los conteos de Food Service de una fecha (por defecto hoy). Muestra todos los productos que se contaron con sus diferencias.",
    parameters: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description: "Fecha YYYY-MM-DD (opcional, por defecto hoy)",
        },
      },
    },
  },
  {
    name: "guardarFS",
    description:
      "Guarda o actualiza un conteo de Food Service. REQUIERE CONFIRMACIÓN. Úsalo solo si el usuario dice explícitamente los valores (abiertos, sellados, sistema). El sistema pedirá confirmación antes de guardar.",
    parameters: {
      type: "object",
      properties: {
        productName: {
          type: "string",
          description: "Nombre o parte del nombre del producto FS",
        },
        opened: {
          type: "number",
          description: "Gramos abiertos (peso del envase abierto)",
        },
        sealed: {
          type: "number",
          description: "Unidades selladas",
        },
        system: {
          type: "number",
          description: "Cantidad que reporta el sistema POS",
        },
      },
      required: ["productName", "opened", "sealed", "system"],
    },
  },
  {
    name: "compararFS",
    description:
      "Compara los conteos de Food Service de distintos usuarios en una fecha (solo admin). Muestra qué productos tienen diferencias entre usuarios.",
    parameters: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description: "Fecha YYYY-MM-DD (opcional, por defecto hoy)",
        },
        productName: {
          type: "string",
          description: "Filtrar por nombre de producto (opcional)",
        },
      },
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
- Después de llamar una herramienta, NO repitas el resultado.

FOOD SERVICE (módulo adicional):
- Además del inventario normal, tienes acceso al módulo "Food Service" (FS).
- FS sirve para hacer conteos diarios de productos de cafetería/comida.
- Fórmulas de FS (NO las cambies):
  producción = (abiertos - peso_contenedor) / peso_unitario
  inventario = sellados + producción
  diferencia = inventario - sistema
  Si |diferencia| < 0.1 → OK. Si > 0 → Sobra. Si < 0 → Falta.
- Cada producto FS tiene: nombre, categoría, unidad, peso_contenedor, peso_unitario.
- Los conteos FS son POR USUARIO y POR DÍA. Al guardar, se sobrescribe el del mismo día.
- HERRAMIENTAS FS:
  - consultarFS: para preguntar por el último conteo de un producto.
  - listarFS: para ver todos los conteos de un día.
  - guardarFS: para guardar un conteo nuevo (siempre con confirmación).
  - compararFS: solo admin, para comparar usuarios.
- Cuando el usuario te dé valores ("abiertos 2245, sellados 4, sistema 6.4273"), usa guardarFS.
- Si el usuario solo pregunta por un resultado, usa consultarFS.
- El sistema te pasa los datos de FS en el contexto (fsProducts y fsCounts). Úsalos.`;
