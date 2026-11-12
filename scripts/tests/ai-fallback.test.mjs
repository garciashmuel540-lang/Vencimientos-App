import assert from "node:assert/strict";
import test from "node:test";
import { firstModelResult } from "../../src/lib/vigia/ai/fallback.ts";

test("a quota error advances to the next model with the original conversation", async () => {
  const history = [{ role: "user", text: "El producto era Café" }];
  let primaryAttempts = 0;
  let backupAttempts = 0;
  const models = [
    {
      name: "test quota",
      run: async () => {
        primaryAttempts++;
        throw Object.assign(new Error("quota"), {
          status: 429,
          headers: new Headers({ "Retry-After": "45" }),
        });
      },
    },
    {
      name: "test backup",
      run: async () => {
        backupAttempts++;
        return history;
      },
    },
  ];
  assert.equal(await firstModelResult(models), history);
  assert.equal(await firstModelResult(models), history);
  assert.equal(primaryAttempts, 1);
  assert.equal(backupAttempts, 2);
});

test("an unusable result advances and total failure returns null", async () => {
  assert.equal(
    await firstModelResult([
      { name: "test invalid", run: async () => null },
      { name: "test valid", run: async () => "complete answer" },
    ]),
    "complete answer",
  );
  assert.equal(await firstModelResult([]), null);
});
