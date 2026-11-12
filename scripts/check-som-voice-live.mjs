import { registerHooks } from "node:module";
registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.includes("/src/lib/vigia/ai/") && /^\.\/[a-z-]+$/.test(specifier))
      return next(specifier + ".ts", context);
    return next(specifier, context);
  },
});
if (process.env.GEMINI_API_KEY) {
  const { synthesizeSomVoice } = await import("../src/lib/vigia/ai/voice-provider.ts");
  const start = Date.now();
  const sample = await synthesizeSomVoice("Hola, soy Sôm. Hay tres productos por vencer.");
  const wav = Buffer.from(sample ?? "", "base64");
  console.log("[som-voice-check]", { wav: wav.toString("ascii",0,4) === "RIFF" && wav.toString("ascii",8,12) === "WAVE",
    bytes: wav.length, milliseconds: Date.now() - start });
}
