import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (
      specifier === "./context" &&
      /\/ai\/(local-intent|chat-sources)\.ts$/.test(context.parentURL ?? "")
    ) {
      return next("./context.ts", context);
    }
    return next(specifier, context);
  },
});
const { chooseChatSources } = await import("../../src/lib/vigia/ai/chat-sources.ts");
const { markdownTable } = await import("../../src/lib/vigia/ai/markdown-table.ts");
const { localIntent } = await import("../../src/lib/vigia/ai/local-intent.ts");
hooks.deregister();

test("Som responde los saludos y explica sus funciones con o sin tildes", () => {
  assert.match(localIntent("Hola").reply, /¡Hola!/);
  assert.match(localIntent("Que puedes hacer").reply, /Recuentos y Food Service/);
  assert.match(localIntent("¿Qué podés hacer?").reply, /vencimientos/);
});

test("Som consulta fechas y faltantes con filtros explícitos", () => {
  assert.deepEqual(localIntent("¿Qué se vence esta semana?"), {
    action: "listarProductos",
    args: { fromDays: 0, toDays: 6 },
  });
  assert.deepEqual(localIntent("¿Qué faltó en el último recuento?"), {
    action: "consultarRecuentos",
    args: { status: "falta", latest: true },
  });
  assert.equal(localIntent("Mostrame promociones del café y comparalas con los precios"), null);
});

test("Sôm responde localmente sobre su nombre y creador", () => {
  for (const question of ["¿Quién te creó?", "¿Cómo te llamás?", "¿Qué significa Sôm?"]) {
    const reply = localIntent(question).reply;
    assert.match(reply, /Sôm/);
    assert.match(reply, /Samuel García/);
    assert.match(reply, /ส้ม.*naranja.*tailandés/);
  }
});

test("las solicitudes de tabla mantienen el filtro de consulta", () => {
  assert.deepEqual(localIntent("Dame una tabla de los vencidos"), {
    action: "listarProductos",
    args: { status: "expired" },
  });
  assert.deepEqual(localIntent("Dame un resumen del inventario en una tabla"), {
    action: "estadisticas",
    args: {},
  });
});

test("una tabla mantiene el cero, separa las celdas y escapa datos del catálogo", () => {
  const table = markdownTable(["Producto", "Físico", "Sistema"], [["A|B\n<c>", 0, null]]);
  assert.equal(
    table,
    "| Producto | Físico | Sistema |\n| --- | --- | --- |\n| A\\|B &lt;c&gt; | 0 | — |",
  );
});

test("las consultas concretas evitan cargas ajenas y las comparaciones conservan el contexto", () => {
  assert.deepEqual(chooseChatSources("¿Cuáles están por vencer?"), {
    foodService: false,
    recounts: false,
    catalog: false,
  });
  assert.deepEqual(chooseChatSources("¿Cuál es el precio del champú?"), {
    foodService: false,
    recounts: false,
    catalog: true,
  });
  assert.deepEqual(chooseChatSources("Compará también el recuento", "Revisá Food Service"), {
    foodService: true,
    recounts: true,
    catalog: false,
  });
  assert.deepEqual(chooseChatSources("¿Y qué pasó después?"), {
    foodService: true,
    recounts: true,
    catalog: true,
  });
});
