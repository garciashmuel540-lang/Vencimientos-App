import test from "node:test";
import assert from "node:assert/strict";
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
