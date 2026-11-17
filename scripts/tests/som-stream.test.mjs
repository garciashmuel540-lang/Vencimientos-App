import assert from "node:assert/strict";
import test from "node:test";
import { firstModelStream } from "../../src/lib/vigia/ai/fallback.ts";

const text = (content) => ({ type: "text", content });
const action = { type: "action", name: "guardarFS", args: { productName: "Café" }, requiresConfirmation: true };
const valid = (chunk) => chunk.type === "action" || (chunk.type === "text" && !!chunk.content.trim());
const collect = async (stream) => { const all = []; for await (const chunk of stream) all.push(chunk); return all; };

test("text arrives before completion, actions wait for successful completion", async () => {
  let finish;
  const gate = new Promise((resolve) => { finish = resolve; });
  const stream = firstModelStream([{ name: "stream test", run: async function* () {
    yield text("Hola"); yield action; await gate; yield text(" mundo");
  } }], valid);
  assert.deepEqual(await stream.next(), { value: text("Hola"), done: false });
  let settled = false;
  const next = stream.next().then((value) => { settled = true; return value; });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(settled, false);
  finish();
  assert.deepEqual(await next, { value: text(" mundo"), done: false });
  assert.deepEqual(await stream.next(), { value: action, done: false });
  assert.deepEqual(await stream.next(), { value: true, done: true });
});
test("fallback replaces partial text and discards actions from a failed attempt", async () => {
  const output = await collect(firstModelStream([
    { name: "partial test", run: async function* () { yield text("Parcial"); yield action; throw new Error("disconnect"); } },
    { name: "backup test", run: async function* () { yield text("Respuesta completa"); } },
  ], valid));
  assert.deepEqual(output, [text("Parcial"), { type: "reset" }, text("Respuesta completa")]);
});
test("quota cooldown skips the failing model on the next request", async () => {
  let calls = 0;
  const models = [
    { name: "stream quota", run: async function* () {
      calls++; throw Object.assign(new Error("quota"), { status: 429, headers: new Headers({ "retry-after": "45" }) });
    } },
    { name: "stream backup", run: async function* () { yield text("OK"); } },
  ];
  assert.deepEqual(await collect(firstModelStream(models, valid)), [text("OK")]);
  await collect(firstModelStream(models, valid));
  assert.equal(calls, 1);
});
test("empty results fall back, whitespace survives and total failure returns false", async () => {
  const result = await collect(firstModelStream([
    { name: "empty", run: async function* () {} },
    { name: "spaces", run: async function* () { yield text("Hola"); yield text(" "); yield text("Sam"); } },
  ], valid));
  assert.deepEqual(result, [text("Hola"), text(" "), text("Sam")]);
  assert.deepEqual(await firstModelStream([], valid).next(), { value: false, done: true });
});
test("abort never starts a backup or releases pending actions", async () => {
  const abort = new AbortController();
  let backup = false;
  const stream = firstModelStream([
    { name: "abort primary", run: async function* () { yield action; abort.abort(); yield text("stop"); } },
    { name: "abort backup", run: async function* () { backup = true; yield text("bad"); } },
  ], valid, abort.signal);
  assert.deepEqual(await collect(stream), []);
  assert.equal(backup, false);
});
