import {
  CATEGORY_LABEL,
  SUBCATEGORY_TO_CATEGORY,
  type ProductCategory,
  type StoreLocation,
} from "./types";

type PlacementInput = {
  name: string;
  category?: string;
  subcategory?: string;
  department?: string;
  description?: string;
};

export const CATEGORY_EMOJI: Record<ProductCategory, string> = {
  bebida: "🥤",
  lacteo: "🥛",
  snack: "🍪",
  panaderia: "🥐",
  carnes: "🥩",
  limpieza: "🫧",
  cuidado: "🧴",
  congelados: "🧊",
  enlatados: "🥫",
  otros: "📦",
};

export const LOCATION_EMOJI: Record<StoreLocation, string> = {
  estante: "🗄️",
  nevera: "❄️",
  congelador: "🧊",
  bodega: "📦",
  mostrador: "🛎️",
};

const normalize = (value = "") =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const categoryByName = new Map(
  Object.entries({
    ...SUBCATEGORY_TO_CATEGORY,
    Helados: "congelados",
    Atun: "enlatados",
    "Sardinas Enlatadas": "enlatados",
    "Leche Saborizada": "lacteo",
    "Leche en Bolsa": "lacteo",
    "Leche Tetrapack": "lacteo",
    "Cervezas Artesanales": "bebida",
    Cafe: "bebida",
    "Te Caliente": "bebida",
    "Pan Fresco Produccion": "panaderia",
    "Reposteria Produccion": "panaderia",
  } satisfies Record<string, ProductCategory>).map(([key, value]) => [normalize(key), value]),
);
const departmentCategory: Record<string, ProductCategory> = {
  bebidas: "bebida",
  beer: "bebida",
  nonbeer: "bebida",
  licores: "bebida",
  confiteria: "snack",
  panaderia: "panaderia",
  "aseo personal": "cuidado",
  "cuidado del hogar": "limpieza",
};

const frozen =
  /\b(congelad[oa]s?|ultracongelad[oa]s?|frozen|helados?|ice cream|hielo|paletas de hielo)\b/;
const canned = /\b(enlatad[oa]s?|conservas?|atun|sardinas?|canned|tuna|sardines)\b/;
const dairy =
  /\b(leche|milk|yogur|yogurt|yoghurt|quesos?|cheese|lacteos?|mantequilla|margarina|butter)\b/;
const meat = /\b(jamon|ham|salchichas?|sausage|embutidos?|mortadela|tocino|bacon|carnes frias)\b/;
const beverage =
  /\b(gaseosas?|soda|cola|coca cola|pepsi|fanta|refrescos?|bebidas?|jugos?|juice|agua|water|cervezas?|beer|seltzer|electrolit|gatorade|powerade|energizantes?|red bull|te frio|licores?|ron|vodka|tequila|whisky|whiskey|vinos?)\b/;
const shelfStable =
  /\b(uht|tetrapack|tetra pack|larga vida|en polvo|powdered|evaporada|condensada|esterilizad[oa]|temperatura ambiente|no requiere refrigeracion|refrigerar despues de abrir)\b/;

export function suggestProductPlacement(input: PlacementInput): {
  category: ProductCategory;
  location: StoreLocation;
  subcategory?: string;
} {
  const rawCategory = input.category?.trim() ?? "";
  const generic = Object.hasOwn(CATEGORY_LABEL, rawCategory)
    ? (rawCategory as ProductCategory)
    : undefined;
  const subcategory = input.subcategory?.trim() || (!generic ? rawCategory : "") || undefined;
  const name = normalize(input.name);
  const sub = normalize(subcategory);
  const description = normalize(input.description);
  const text = [name, sub, description].filter(Boolean).join(" ");
  const mapped = categoryByName.get(sub);

  let category: ProductCategory | undefined = mapped ?? (generic !== "otros" ? generic : undefined);
  if (frozen.test(name) || frozen.test(sub)) category = "congelados";
  else if (
    mapped === undefined &&
    /\b(atun|sardinas?|tuna|sardines)\b/.test(name) &&
    (canned.test(sub) || /\b(lata|enlatad[oa]|aceite|agua|conserva|trozos)\b/.test(name))
  )
    category = "enlatados";

  if (!category) {
    if (frozen.test(text)) category = "congelados";
    else if (
      /\b(shampoo|champu|condones?|preservativos?|crema dental|pasta dental|desodorantes?|toallas sanitarias|panales|sunscreen|toothpaste|razors?)\b/.test(
        text,
      )
    )
      category = "cuidado";
    else if (
      /\b(detergentes?|cloro|limpiadores?|lejia|bleach|suavizante|bolsas de basura)\b/.test(text)
    )
      category = "limpieza";
    else if (canned.test(text)) category = "enlatados";
    else if (
      dairy.test(text) &&
      !/\b(galletas?|chocolate|caramelos?|dulce de leche|papas|chips|semillas)\b/.test(name)
    )
      category = "lacteo";
    else if (meat.test(text)) category = "carnes";
    else if (
      /\b(galletas?|cookies?|gomitas|chocolate|caramelos?|candy|dulces?|chips|boquitas|snacks?|papas fritas|semillas|palomitas)\b/.test(
        text,
      )
    )
      category = "snack";
    else if (
      /\b(pan|bread|donas?|doughnuts?|tortillas?|reposteria|croissants?|bolillos?)\b/.test(text)
    )
      category = "panaderia";
    else if (beverage.test(text)) category = "bebida";
    else category = departmentCategory[normalize(input.department)] ?? "otros";
  }

  let location: StoreLocation = "estante";
  if (category === "congelados") location = "congelador";
  else if (
    /\b(mantener refrigerado|mantener refrigerada|refrigerados?|refrigeradas?|chilled|keep refrigerated)\b/.test(
      text,
    ) &&
    !shelfStable.test(text)
  )
    location = "nevera";
  else if (category === "lacteo" || category === "carnes") {
    if (!shelfStable.test(text)) location = "nevera";
  } else if (category === "bebida") {
    const ambient =
      shelfStable.test(text) ||
      /\b(cafe molido|cafe en grano|cafe instantaneo|te caliente|bebidas? calientes?|ron|vodka|tequila|whisky|whiskey|ginebra|licores?|vinos?|galon|bidon)\b/.test(
        text,
      );
    if (!ambient && sub !== "cafe") location = "nevera";
  } else if (
    (category === "panaderia" &&
      /\b(pan fresco|donas?|reposteria fresca|reposteria produccion)\b/.test(text)) ||
    /\b(cigarrillos?|encendedores?)\b/.test(text)
  )
    location = "mostrador";

  return { category, location, subcategory };
}
