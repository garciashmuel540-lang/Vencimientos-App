import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "./context" && context.parentURL?.endsWith("/ai/local-intent.ts")) {
      return next("./context.ts", context);
    }
    return next(specifier, context);
  },
});
const { localIntent } = await import("../../src/lib/vigia/ai/local-intent.ts");
hooks.deregister();

test("Som responde los saludos y explica sus funciones con o sin tildes", () => {
  assert.match(localIntent("Hola").reply, /¡Hola!/);
  assert.match(localIntent("Que puedes hacer").reply, /Recuentos y Food Service/);
  assert.match(localIntent("¿Qué podés hacer?").reply, /vencimientos/);
});

test("Som consulta fechas y faltantes con filtros explícitos", () => {
  assert.deepEqual(localIntent("¿Qué se vence esta semana?"), {
    action: "listarProductos", args: { fromDays: 0, toDays: 6 },
  });
  assert.deepEqual(localIntent("¿Qué faltó en el último recuento?"), {
    action: "consultarRecuentos", args: { status: "falta", latest: true },
  });
  assert.equal(localIntent("Mostrame promociones del café y comparalas con los precios"), null);
});
