import test from "node:test";
import assert from "node:assert/strict";
import { quantity, compareRecount, readDocumentRows } from "../../src/lib/vigia/recounts.ts";
const word = (text, x, y) => ({
  text,
  bbox: { x0: x, x1: x + text.length * 10, y0: y, y1: y + 20 },
});
test("zero is counted, missing and invalid counts are pending, differences are accurate", () => {
  assert.equal(compareRecount({ system: "5", physical: "" }).status, "pending");
  assert.equal(compareRecount({ system: "", physical: "0" }).status, "pending");
  assert.equal(compareRecount({ system: "5", physical: "0" }).difference, -5);
  assert.equal(compareRecount({ system: "5", physical: "5" }).status, "ok");
  assert.equal(compareRecount({ system: "5", physical: "6.5" }).difference, 1.5);
  assert.equal(compareRecount({ system: "5", physical: "-1" }).status, "pending");
  assert.equal(quantity("1,234.50"), 1234.5);
  assert.equal(quantity("1.234,50"), 1234.5);
  assert.equal(quantity("0,5"), 0.5);
  assert.equal(quantity("12abc"), null);
});
test("OCR uses system column, keeps leading zeros and does not use product size or price", () => {
  const words = [
    word("Código", 0, 0),
    word("Producto", 200, 0),
    word("Sistema", 800, 0),
    word("Precio", 1000, 0),
    word("050000122424", 0, 40),
    word("Cocoa", 200, 40),
    word("680gr", 300, 40),
    word("4", 830, 40),
    word("98.50", 1000, 40),
  ];
  const rows = readDocumentRows(words, [
    { barcode: "050000122424", name: "Cocoa Mix 680gr", category: "Café" },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].code, "050000122424");
  assert.equal(rows[0].system, "4");
  assert.equal(rows[0].physical, "");
});
test("unknown columns require review instead of guessing a quantity", () => {
  const rows = readDocumentRows(
    [word("1234567", 0, 20), word("Producto", 200, 20), word("3", 800, 20), word("50", 1000, 20)],
    [],
  );
  assert.equal(rows[0].system, "");
  assert.deepEqual(rows[0].candidates, ["3", "50"]);
});
test("Cantidad Disponible excludes a weight misread as a number in Descripción", () => {
  const header = [
    word("Código", 0, 0),
    word("Descripción", 350, 0),
    word("Cantidad", 700, 0),
    word("Disponible", 800, 0),
  ];
  const product = [word("022000018465", 0, 40), word("Skittles", 350, 40), word("61.59", 480, 40)];
  assert.equal(readDocumentRows([...header, ...product], [])[0].system, "");
  assert.equal(readDocumentRows([...header, ...product, word("9", 704, 40)], [])[0].system, "9");
});
