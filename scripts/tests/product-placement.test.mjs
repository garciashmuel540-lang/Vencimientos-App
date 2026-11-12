import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";

const hook = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "./types" && context.parentURL?.endsWith("/product-placement.ts"))
      return next("./types.ts", context);
    return next(specifier, context);
  },
});
const { suggestProductPlacement } = await import("../../src/lib/vigia/product-placement.ts");
hook.deregister();

const { items } = JSON.parse(
  readFileSync(new URL("../../public/catalogo-precios.json", import.meta.url), "utf8"),
);

test("the store catalog assigns a valid category and logical location", () => {
  for (const [label, expectedCategory, expectedLocation] of [
    ["Yogurt", "lacteo", "nevera"],
    ["Leche Tetrapack", "lacteo", "estante"],
    ["Helados", "congelados", "congelador"],
    ["Gaseosas", "bebida", "nevera"],
    ["Ron", "bebida", "estante"],
    ["Sardinas Enlatadas", "enlatados", "estante"],
    ["Pan Fresco", "panaderia", "mostrador"],
    ["Pan Empacado", "panaderia", "estante"],
    ["Detergentes Ropa", "limpieza", "estante"],
    ["Shampoo", "cuidado", "estante"],
  ]) {
    const item = items.find((p) => p.category === label);
    assert.ok(item, label);
    const { category, location, subcategory } = suggestProductPlacement(item);
    assert.deepEqual(
      { category, location, subcategory },
      {
        category: expectedCategory,
        location: expectedLocation,
        subcategory: label,
      },
      item.name,
    );
  }
});

test("a typed or externally sourced name suggests placement without a catalog category", () => {
  for (const [name, category, location] of [
    ["Leche entera UHT 1 litro", "lacteo", "estante"],
    ["Yogur natural 200 g", "lacteo", "nevera"],
    ["Frozen bread", "congelados", "congelador"],
    ["Tuna in oil", "enlatados", "estante"],
    ["Galletas rellenas de leche", "snack", "estante"],
    ["Shampoo", "cuidado", "estante"],
    ["Coca-Cola", "bebida", "nevera"],
    ["Código desconocido", "otros", "estante"],
  ]) {
    assert.deepEqual(
      suggestProductPlacement({ name }),
      { category, location, subcategory: undefined },
      name,
    );
  }
});
