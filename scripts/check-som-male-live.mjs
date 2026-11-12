import { registerHooks } from "node:module";
registerHooks({resolve(specifier,context,next) {
 if (context.parentURL?.endsWith("/voice-provider.ts") && specifier === "./fallback") return next("./fallback.ts",context);
 return next(specifier,context);
}});
if (process.env.GEMINI_API_KEY) {
 const {synthesizeSomVoice} = await import("../src/lib/vigia/ai/voice-provider.ts");
 const wav = Buffer.from(await synthesizeSomVoice("Hola, soy Sôm. Estoy aquí para ayudarte.") ?? "", "base64");
 console.log("[som-male-check]", {wav: wav.toString("ascii",0,4) === "RIFF" && wav.toString("ascii",8,12) === "WAVE", seconds: Math.round((wav.length - 44) / 480) / 100});
}
