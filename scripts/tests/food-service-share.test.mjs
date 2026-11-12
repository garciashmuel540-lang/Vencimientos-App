import test from "node:test";
import assert from "node:assert/strict";
import { calcFSItem, roundFSQuantity } from "../../src/lib/vigia/food-service-calc.ts";
import { FS_PRODUCTS } from "../../src/lib/vigia/food-service-catalog.ts";
import { hasFSShareData } from "../../src/lib/vigia/food-service-share.ts";

test("share excludes empty rows but preserves explicit zero and partial measurements", () => {
  for (const row of [undefined, null, { opened: null, sealed: null, system_qty: null }])
    assert.equal(hasFSShareData(row), false);
  for (const field of ["opened", "sealed", "system_qty"]) {
    assert.equal(
      hasFSShareData({ opened: null, sealed: null, system_qty: null, [field]: 0 }),
      true,
    );
  }
});

const cappuccino = FS_PRODUCTS.find(({ itemCode }) => itemCode === "AMPMFSI0326");
const count = { opened: 1613, sealed: 3, system_qty: 4.13 };

test("rounded physical and system quantities that match are correct, including positive and negative residues", () => {
  for (const system_qty of [4.126, 4.13, 4.134]) {
    const result = calcFSItem(cappuccino, { ...count, system_qty });
    assert.equal(result.inventory, 4.13);
    assert.equal(roundFSQuantity(system_qty), 4.13);
    assert.equal(result.difference, 0);
    assert.equal(result.status, "ok");
    assert.equal(result.label, "Correcto");
  }
});

test("differences follow the visible quantities on either side of a rounding boundary", () => {
  for (const [system_qty, difference, status] of [
    [4.135, -0.01, "falta"],
    [4.1249, 0.01, "sobra"],
  ]) {
    const result = calcFSItem(cappuccino, { ...count, system_qty });
    assert.equal(result.difference, difference);
    assert.equal(result.status, status);
    assert.equal(result.label, `${status === "falta" ? "Falta" : "Sobra"} 0.01`);
  }
  assert.equal(calcFSItem(cappuccino, { ...count, system_qty: null }).status, "incompleto");
  assert.equal(calcFSItem(cappuccino, { opened: 0, sealed: 0, system_qty: 0 }).status, "ok");
});
