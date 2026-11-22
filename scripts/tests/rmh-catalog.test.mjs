import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { readSnapshot } from "../../src/lib/vigia/rmh-catalog.ts";

test("el catálogo conserva ceros, diferencias negativas y datos desconocidos", () => {
  const item = { barcode: "001", name: "Producto", price: 0, stock: -1 };
  const snapshot = { captured_at: "2026-11-21T12:00:00Z", products: [item] };
  assert.deepEqual(readSnapshot(snapshot), snapshot);
  assert.doesNotThrow(() =>
    readSnapshot({ ...snapshot, products: [{ ...item, price: null, stock: null }] }),
  );
  for (const products of [[], [item, item], [{ ...item, price: -1 }], [{ ...item, stock: "0" }]])
    assert.throws(() => readSnapshot({ ...snapshot, products }));
});

test("RMH restringe lectura y publicación por tienda y preserva la versión más reciente", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role authenticated; create role anon; create schema auth;
      create function auth.jwt() returns jsonb language sql stable as
      $$select current_setting('request.jwt.claims')::jsonb$$;
      grant usage on schema auth to authenticated;`);
    await db.exec(
      await readFile(
        new URL("../../supabase/migrations/20261122_rmh_catalog.sql", import.meta.url),
        "utf8",
      ),
    );
    await db.exec("set role authenticated");
    async function identify(store, publisher) {
      await db.query("select set_config('request.jwt.claims', $1, false)", [
        JSON.stringify({ app_metadata: { rmh_store: store, rmh_publisher: publisher } }),
      ]);
    }
    const insert = "insert into rmh_catalogs values ('A','2026-11-21','[{}]')";
    await identify("A", false);
    await assert.rejects(db.exec(insert), /row-level security/);
    await identify("B", true);
    await assert.rejects(db.exec(insert), /row-level security/);
    await identify("A", true);
    await db.exec(insert);
    await assert.rejects(
      db.exec("update rmh_catalogs set captured_at='2026-11-20'"),
      /más reciente/,
    );
    await identify("B", false);
    assert.equal((await db.query("select * from rmh_catalogs")).rows.length, 0);
    await identify("A", false);
    assert.equal((await db.query("select * from rmh_catalogs")).rows.length, 1);
    assert.equal(
      (await db.query("update rmh_catalogs set products='[1]' returning *")).rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});
