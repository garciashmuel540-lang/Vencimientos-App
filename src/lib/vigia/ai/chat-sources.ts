import { normalize } from "./context";

export function chooseChatSources(question: string, previous = "") {
  const text = normalize(question);
  const related = /\b(compar\w*|cruz\w*|contrast\w*|junto|tambien|ademas)\b/.test(text)
    ? `${text} ${normalize(previous)}`
    : text;
  const foodService =
    /\b(food service|conteos? de cafe|cafe|cappuccino|gramos? abiertos?|sellad[oa]s?)\b/.test(
      related,
    );
  const recounts = /\b(recuentos?|conteo fisico|inventario fisico|documento de conteo)\b/.test(
    related,
  );
  const catalog =
    /\b(precios?|catalogo|codigos?|promociones?|promos?|costo|cuesta|vale|iva)\b/.test(related);
  const inventory =
    /\b(vencimientos?|vencid[oa]s?|por vencer|se vence|inventario|historial|ajustes|reportes?)\b/.test(
      related,
    );
  const broad =
    /\b(toda la tienda|todos los modulos|todos los apartados|todo vigia|resumen general)\b/.test(
      related,
    );
  const ambiguousCount =
    /\b(faltantes?|sobrantes?|falto|faltaron|sobro|sobraron)\b/.test(related) &&
    !foodService &&
    !recounts;
  if (broad || ambiguousCount || !(foodService || recounts || catalog || inventory)) {
    return { foodService: true, recounts: true, catalog: true };
  }
  return { foodService, recounts, catalog };
}
