import assert from "node:assert/strict";
import test from "node:test";
import { createSearchIndex, normalizeSearch } from "../../src/lib/vigia/search-index.ts";
import { createAsyncCache } from "../../src/lib/vigia/async-cache.ts";

const rows = [
  { barcode: "001234", name: "Café molido", brand: "Presto", price: 12 },
  { barcode: "001235", name: "Café instantáneo", brand: "Sol", price: 20 },
  { barcode: "789012", name: "Leche", brand: "Café", price: 30 },
  { barcode: "001234", name: "Café molido", brand: "Presto", price: 40 },
  { barcode: "987654", name: "Champú niño", brand: "", price: 0 },
];
test("accent-insensitive substrings, short terms, code priority and duplicate lots", () => {
  const index = createSearchIndex(rows);
  assert.deepEqual(index.find("CAFE"), rows.slice(0, 4));
  assert.deepEqual(index.find("niño"), [rows[4]]);
  assert.deepEqual(index.find("ch"), [rows[2], rows[4]]);
  assert.deepEqual(index.find("001234"), [rows[0], rows[3]]);
  assert.deepEqual(index.find("001", Infinity, true), [rows[0], rows[1], rows[3]]);
  assert.deepEqual(index.find("001"), []);
  assert.deepEqual(index.search(["789012", "cafe"])[0], rows[2]);
  assert.deepEqual(index.find("not present"), []);
  assert.deepEqual(index.find(""), []);
  assert.deepEqual(index.search([]), []);
});
test("index returns the same matches and stable ranking as a full scan", () => {
  const catalog = Array.from({ length: 3210 }, (_, n) => ({
    barcode: String(n).padStart(8, "0"),
    name: ["Café molido", "Leche descremada", "Champú niño", "Pan integral"][n % 4] + " " + n,
    brand: ["Sol", "Presto", "Dos pinos"][n % 3],
  }));
  const index = createSearchIndex(catalog);
  for (const terms of [["cafe"], ["integral", "presto"], ["00000019"], ["zzzz"], ["molido", "café", "sol"]]) {
    const words = [...new Set(terms.map(normalizeSearch))];
    const expected = catalog.map((entry, id) => ({
      entry, id, score: words.reduce((score, w) => score +
        (entry.barcode === w ? 100 + w.length
          : normalizeSearch(entry.name + " " + entry.brand).includes(w) ? w.length : 0), 0),
    })).filter((r) => r.score).sort((a, b) => b.score - a.score || a.id - b.id)
      .slice(0, 15).map((r) => r.entry);
    assert.deepEqual(index.search(terms), expected);
  }
});
test("cache shares reads and refreshes after a catalog edit", async () => {
  let reads = 0;
  let price = 10;
  const cache = createAsyncCache(async () => { reads++; return price; });
  assert.deepEqual(await Promise.all([cache.get(), cache.get(), cache.get()]), [10, 10, 10]);
  assert.equal(reads, 1);
  price = 20;
  cache.invalidate();
  assert.equal(await cache.get(), 20);
  assert.equal(reads, 2);
});
test("an in-flight stale read cannot overwrite a new snapshot", async () => {
  let release;
  let reads = 0;
  const cache = createAsyncCache(() => {
    reads++;
    return reads === 1 ? new Promise((resolve) => { release = resolve; }) : Promise.resolve("new");
  });
  const old = cache.get();
  await Promise.resolve();
  cache.invalidate();
  assert.equal(await cache.get(), "new");
  release("old");
  assert.equal(await old, "new");
  assert.equal(await cache.get(), "new");
});
test("failed reads can be retried", async () => {
  let attempts = 0;
  const cache = createAsyncCache(async () => {
    if (++attempts === 1) throw new Error("database busy");
    return "ok";
  });
  await assert.rejects(cache.get(), /database busy/);
  assert.equal(await cache.get(), "ok");
});
