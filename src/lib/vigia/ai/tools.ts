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
  // ============ TOOLS NUEVAS PARA IA MÁS INTELIGENTE ============
  {
    name: "listarProductos",
    description:
      "Lista productos del inventario con filtros opcionales. Úsalo para responder '¿qué tengo?', 'muéstrame los vencidos', 'qué hay en la nevera', etc.",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description: "Filtro de estado: ok, soon, expired, all",
        },
        category: {
          type: "string",
          description: "Filtro de categoría (bebida, lacteo, snack, etc.)",
        },
        location: {
          type: "string",
          description: "Filtro de ubicación (estante, nevera, congelador, bodega, mostrador)",
        },
        search: {
          type: "string",
          description: "Búsqueda por nombre, marca o código",
        },
        limit: {
          type: "number",
          description: "Máximo de productos a mostrar (por defecto 20)",
        },
      },
    },
  },
  {
    name: "contarProductos",
    description:
      "Cuenta productos según filtros. Úsalo para '¿cuántos vencidos tengo?', 'cuántas bebidas hay', 'cuántas unidades en total'.",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description: "Filtro de estado: ok, soon, expired, all",
        },
        category: {
          type: "string",
          description: "Filtro de categoría",
        },
        location: {
          type: "string",
          description: "Filtro de ubicación",
        },
        countUnits: {
          type: "boolean",
          description: "Si true, cuenta unidades totales; si false, cuenta productos",
        },
      },
    },
  },
  {
    name: "estadisticas",
    description:
      "Devuelve estadísticas generales del inventario: totales, promedios, valor estimado. Úsalo para 'dame un resumen', 'cómo está el inventario', 'cuánto vale todo'.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "buscarProducto",
    description:
      "Busca un producto por nombre en el inventario local (no en catálogo). Devuelve detalles completos. Úsalo para 'dónde está X', 'cuántos X tengo'.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Nombre o parte del nombre",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "verPromociones",
    description:
      "Muestra promociones activas de un producto o de todas. Úsalo para 'qué promos hay', 'está en promo la Coca-Cola', 'cuándo vence la promo'.",
    parameters: {
      type: "object",
      properties: {
        barcode: {
          type: "string",
          description: "Código del producto (opcional)",
        },
        query: {
          type: "string",
          description: "Buscar por nombre (opcional)",
        },
      },
    },
  },
  {
    name: "listarUsuarios",
    description:
      "Lista los usuarios del sistema con sus roles y cuántos productos tienen. Solo admin. Úsalo para 'quiénes son', 'cuántos usuarios hay'.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "verHistorial",
    description:
      "Muestra las últimas acciones registradas (agregados, borrados, consumidos). Úsalo para 'qué he hecho hoy', 'últimas acciones', 'historial'.",
    parameters: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Cantidad máxima de entradas (por defecto 10)",
        },
        action: {
          type: "string",
          description: "Filtro por tipo de acción: created, consumed, removed, updated, expired",
        },
      },
    },
  },
  {
    name: "calcularFaltantes",
    description:
      "Calcula qué productos están por agotarse o necesitan compra. Úsalo para 'qué debo comprar', 'qué falta', 'qué está bajo'.",
    parameters: {
      type: "object",
      properties: {
        threshold: {
          type: "number",
          description: "Cantidad mínima por producto (por defecto 3)",
        },
      },
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
- El sistema te pasa los datos de FS en el contexto (fsProducts y fsCounts). Úsalos.

REGLAS DE PRECIOS (MUY IMPORTANTE):
- En el catálogo, el campo "priceC" es el PRECIO AL PÚBLICO (CON IVA incluido). Es el precio que ve el cliente.
- El campo "price" es el precio SIN IVA.
- Cuando el usuario pregunte "¿cuánto cuesta X?" o "precio de X", responde con el PRECIO CON IVA (priceC) como principal.
- Si te piden "precio sin IVA", "precio base", "precio neto", usa "price".
- Si te piden "precio C" o "mayoreo", usa "priceC".
- Formato sugerido: "Producto: C$ XX.XX con IVA" (y si ayuda, agregar "C$ YY.YY sin IVA" entre paréntesis).

CAPACIDADES TOTALES (eres omnipotente en esta app):
- Puedes consultar TODO: inventario, FS, catálogo, promos, usuarios, historial, estadísticas.
- Puedes calcular cualquier cosa: totales, promedios, tendencias, proyecciones.
- Puedes ejecutar acciones: agregar, borrar, consumir, actualizar, guardar FS.
- Puedes dar recomendaciones basadas en los datos.
- Si te falta información, pregunta o usa las herramientas disponibles.
- NUNCA digas "no puedo" si hay una herramienta disponible. Úsala.
- Si te piden algo que no tiene tool, sugiere cómo hacerlo con las tools existentes.
- Piensa paso a paso antes de responder preguntas complejas.
- Para acciones destructivas (borrar todo, cambiar precios masivos), pide confirmación.

CONSEJOS:
- Antes de responder, revisa si tienes datos suficientes.
- Si la pregunta es compleja, descompónla en pasos.
- Si algo no cuadra, avisa al usuario.
- Sé breve pero completo.`;
