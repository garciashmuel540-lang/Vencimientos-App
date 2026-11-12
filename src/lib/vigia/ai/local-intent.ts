import { normalize } from "./context";

export const SOM_IDENTITY =
  "Me llamo **Sôm** 🍊. Me creó **Samuel García** y mi nombre viene de **ส้ม** (sôm), que significa **naranja** en tailandés.";
export const SOM_CAPABILITIES =
  "Puedo consultar tus vencimientos e inventario por producto, ubicación o código. También puedo buscar precios y promociones, comparar el físico con el sistema en Recuentos y Food Service, y revisar reportes, historial y ajustes. Probá con **¿Qué vence esta semana?** o **¿Qué faltó en el último recuento?**";

export function localIntent(question: string) {
  const q = normalize(question)
    .replace(/[¿?¡!.,]/g, "")
    .replace(
      /^(?:haz(?:me)?|haceme|dame|mostrame|muestrame|pon(?:me)?) (?:una |la )?tabla (?:de |con |sobre )?/,
      "",
    )
    .replace(/(?: en (?:una )?tabla|,? por favor)$/g, "")
    .trim();
  if (
    /^(?:som )?(?:quien te creo|quien es tu creador[ao]?|quien te hizo|como te llamas|cual es tu nombre|que significa tu nombre|que significa som|de donde viene tu nombre|por que te llamas som)(?: som)?$/.test(
      q,
    )
  ) {
    return { reply: SOM_IDENTITY };
  }
  if (/^(hola|buenas|buenos dias|buenas tardes|buenas noches)( som)?$/.test(q)) {
    return { reply: "¡Hola! 🍊 ¿Qué querés revisar hoy en Vigía?" };
  }
  if (
    /^(som )?(que puedes hacer|que podes hacer|que haces|en que me puedes ayudar|como me podes ayudar)( som| en vigia)?$/.test(
      q,
    )
  ) {
    return { reply: SOM_CAPABILITIES };
  }
  if (
    /^(dame |mostrame |muestrame )?(un |el )?(resumen|estadisticas)( del inventario| de vigia| de vencimientos)?$/.test(
      q,
    )
  ) {
    return { action: "estadisticas", args: {} };
  }
  if (/^(que|cuales productos) (se )?vencen? (hoy|manana|esta semana)$/.test(q)) {
    return {
      action: "listarProductos",
      args: {
        fromDays: q.endsWith("manana") ? 1 : 0,
        toDays: q.endsWith("esta semana") ? 6 : q.endsWith("manana") ? 1 : 0,
      },
    };
  }
  if (/^(?:los )?productos por vencer$/.test(q))
    return { action: "listarProductos", args: { status: "soon" } };
  if (/^(?:el )?(?:inventario|vencimientos)$/.test(q))
    return { action: "listarProductos", args: {} };
  if (
    /^(?:mostrame |muestrame |lista |dame )?(?:los |productos )?vencidos(?: del inventario)?$/.test(
      q,
    )
  ) {
    return { action: "listarProductos", args: { status: "expired" } };
  }
  if (/^(cuantos|cuantos productos|cuantas unidades) (vencidos tengo|estan vencidos)$/.test(q)) {
    return {
      action: "contarProductos",
      args: { status: "expired", countUnits: q.startsWith("cuantas unidades") },
    };
  }
  if (
    /^(que|cuales productos) (falto|faltaron|faltan|sobro|sobraron|sobran) en (mi |el )?ultimo recuento$/.test(
      q,
    )
  ) {
    return {
      action: "consultarRecuentos",
      args: { status: /sobr/.test(q) ? "sobra" : "falta", latest: true },
    };
  }
  if (/^(lista|ver|mostrame|muestrame|dame) (mis |los )?recuentos$/.test(q)) {
    return { action: "consultarRecuentos", args: {} };
  }
  if (/^(que (promos|promociones) hay|promociones activas)$/.test(q)) {
    return { action: "verPromociones", args: { status: "activa" } };
  }
  if (/^(historial|ultimas acciones|que he hecho hoy)$/.test(q)) {
    return { action: "verHistorial", args: q.endsWith("hoy") ? { today: true } : {} };
  }
  if (
    /^(ajustes|configuracion|ver ajustes|cuales son mis ajustes|como estan mis alertas)$/.test(q)
  ) {
    return { action: "verAjustes", args: {} };
  }
  return null;
}
