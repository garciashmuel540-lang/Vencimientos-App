import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import { playVoiceQueue } from "../../src/lib/vigia/ai/voice-queue.ts";
import {
  selectSpanishMaleVoice,
  speechText,
  splitSpeech,
} from "../../src/lib/vigia/ai/voice-text.ts";
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "./fallback" && context.parentURL?.endsWith("/voice-provider.ts"))
      return next("./fallback.ts", context);
    return next(specifier, context);
  },
});
const { wavFromAudio } = await import("../../src/lib/vigia/ai/voice-provider.ts");
hooks.deregister();

test("a long response is divided into playable segments without dropping words", () => {
  const text = "Café, doce unidades. Leche, siete unidades. ".repeat(40).trim();
  const segments = splitSpeech(text);
  assert.ok(segments.length > 1);
  assert.ok(segments.every((segment) => segment.length <= 360));
  assert.equal(segments.join(" "), text);
});

test("device fallback prefers identified Latin American male voices", () => {
  const mexico = { lang: "es-MX", name: "Juan" };
  assert.equal(
    selectSpanishMaleVoice([
      { lang: "en-US", name: "Male Natural" },
      { lang: "es-NI", name: "Español Natural" },
      { lang: "es-ES", name: "Jorge" },
      { lang: "es-MX", name: "Dalia" },
      mexico,
    ]),
    mexico,
  );
  assert.equal(
    selectSpanishMaleVoice([
      { lang: "en-US", name: "Male" },
      { lang: "es-ES", name: "Mónica" },
      { lang: "es-MX", name: "Spanish Female" },
      { lang: "es-NI", name: "Español" },
    ]),
    undefined,
  );
});

test("tables are narrated by row with headers, zeros and missing values", () => {
  class Element {
    nodeType = 1;
    constructor(tagName, childNodes = []) {
      this.tagName = tagName;
      this.childNodes = childNodes;
    }
  }
  globalThis.HTMLElement = Element;
  globalThis.Node = { TEXT_NODE: 3 };
  const cell = (textContent) => ({ textContent });
  const table = Object.assign(new Element("TABLE"), {
    tHead: { rows: [{ cells: [cell("Producto"), cell("Unidades"), cell("Precio")] }] },
    tBodies: [
      {
        rows: [
          { cells: [cell("Café"), cell("0"), cell("C$ 42.50")] },
          { cells: [cell("Leche"), cell("—"), cell("—")] },
        ],
      },
    ],
  });
  const intro = new Element("P", [{ nodeType: 3, textContent: "🍊 Inventario" }]);
  assert.equal(
    speechText(new Element("DIV", [intro, new Element("DIV", [table])])),
    "Inventario. Producto: Café. Unidades: 0. Precio: 42.50 córdobas. Producto: Leche. Unidades: sin dato. Precio: sin dato.",
  );
});

test("the voice backend preserves WAV and wraps raw speech PCM correctly", () => {
  const pcm = Buffer.from([0, 0, 1, 0]);
  const wav = wavFromAudio(pcm.toString("base64"), "audio/L16;codec=pcm;rate=24000");
  const decoded = Buffer.from(wav, "base64");
  assert.equal(decoded.toString("ascii", 0, 4), "RIFF");
  assert.equal(decoded.toString("ascii", 8, 12), "WAVE");
  assert.equal(decoded.readUInt32LE(24), 24000);
  assert.deepEqual(decoded.subarray(44), pcm);
  assert.equal(wavFromAudio(wav, "audio/wav"), wav);
  assert.equal(wavFromAudio(pcm.toString("base64"), "text/plain"), null);
});

test("a short opening clip preserves every word of a long reply", () => {
  const text = "Café, doce unidades. Leche, siete unidades. ".repeat(8).trim();
  const parts = splitSpeech(text, 360, 130);
  assert.ok(parts[0].length <= 130);
  assert.equal(parts.join(" "), text);
  assert.deepEqual(splitSpeech("Hola, soy Sôm.", 360, 130), ["Hola, soy Sôm."]);
});

test("the next clip is requested while the current one plays, in order", async () => {
  const events = [];
  const generated = [];
  const signal = new AbortController().signal;
  const played = await playVoiceQueue(["uno", "dos", "tres"], {
    signal,
    prepare: () => {},
    generate: async (part) => {
      generated.push(part);
      events.push("generar " + part);
      return part;
    },
    playAudio: async (part) => {
      events.push("leer " + part);
      if (part === "uno") assert.deepEqual(generated, ["uno", "dos"]);
      return true;
    },
    playOnDevice: async () => assert.fail("unexpected fallback"),
  });
  assert.equal(played, true);
  assert.deepEqual(events, [
    "generar uno",
    "generar dos",
    "leer uno",
    "generar tres",
    "leer dos",
    "leer tres",
  ]);
});

test("stopping playback prevents prefetched clips from playing", async () => {
  const controller = new AbortController();
  const played = [];
  const completed = await playVoiceQueue(["uno", "dos"], {
    signal: controller.signal,
    prepare: () => {},
    generate: async (part) => part,
    playAudio: async (part) => {
      played.push(part);
      controller.abort();
      return false;
    },
    playOnDevice: async () => assert.fail("unexpected fallback"),
  });
  assert.equal(completed, false);
  assert.deepEqual(played, ["uno"]);
});
