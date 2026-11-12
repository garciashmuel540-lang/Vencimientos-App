import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const hook = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "./recounts" && context.parentURL?.endsWith("/recount-vision.ts"))
      return next("./recounts.ts", context);
    return next(specifier, context);
  },
});
const { parseDocumentVision } = await import("../../src/lib/vigia/recount-vision.ts");
hook.deregister();

test("document reader separates printed stock, notes and proposed physical counts", () => {
  const rows = parseDocumentVision(JSON.stringify({ rows: [
    { code: "070330905191", name: "Ejemplo 350 ml", system: "4", notes: "10-4=6" },
    { code: "AMPM1007", name: "Envase 375 ml", system: "0", notes: "12 + 62" },
    { name: "Producto sin código", system: "24", physical: "0" },
    { code: "001233", name: "Otro", system: "18+4", notes: "18+4=25" },
    { code: "001234", name: null, system: null },
    { name: "Total", system: "200" },
  ] }));
  assert.equal(rows.length, 5);
  assert.deepEqual(rows.map((r) => [r.code, r.system, r.physical, r.suggestedPhysical]), [
    ["070330905191", "4", "", undefined],
    ["AMPM1007", "0", "", "74"],
    ["", "24", "", "0"],
    ["001233", "", "", undefined],
    ["001234", "", "", undefined],
  ]);
  assert.equal(rows[0].notes, "10-4=6");
  assert.equal(rows[4].name, "Descripción pendiente");
  assert.throws(() => parseDocumentVision('{"rows":[{"code":70330905191}]}'));
});
