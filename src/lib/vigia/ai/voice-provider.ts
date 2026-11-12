import { firstModelResult } from "./fallback";

const somVoice = "Puck";
const style =
  "Leé únicamente el texto en español latinoamericano con voz masculina de adulto joven, ligera, tierna y natural. Soná como si sonrieras un poquito, con calidez, alegría suave y un ritmo conversado. Pronunciá los números con claridad. Sôm se pronuncia som.";

type AudioPart = { type?: string; data?: string; mime_type?: string };

export function wavFromAudio(data: string, mime = ""): string | null {
  const pcm = Buffer.from(data, "base64");
  if (!pcm.length || pcm.length > 2_500_000) return null;
  if (pcm.toString("ascii", 0, 4) === "RIFF" && pcm.toString("ascii", 8, 12) === "WAVE")
    return data;
  if (!/^audio\/(?:l16|pcm)(?:;|$)/i.test(mime) || pcm.length % 2 !== 0) return null;
  const rate = Number(mime.match(/rate=(\d+)/i)?.[1] ?? 24000);
  if (rate < 8000 || rate > 48000) return null;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]).toString("base64");
}

async function requestVoice(key: string, path: string, payload: unknown, timeoutMs: number) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    void response.body?.cancel().catch(() => {});
    throw Object.assign(new Error("Speech provider failed"), {
      status: response.status,
      headers: response.headers,
    });
  }
  return response.json();
}

export async function synthesizeSomVoice(text: string): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  return firstModelResult([
    {
      name: "Gemini Flash-Lite TTS",
      run: async () => {
        const result = (await requestVoice(
          key,
          "interactions",
          {
            model: "gemini-3.8-flash-lite-tts",
            store: false,
            input: [
              {
                type: "user_input",
                content: [
                  { type: "text", text, annotations: [{ type: "speech_metadata", style }] },
                ],
              },
            ],
            response_format: { type: "audio", mime_type: "audio/wav" },
            generation_config: { speech_config: [{ voice: somVoice }] },
          },
          9_000,
        )) as { steps?: { type?: string; content?: AudioPart[] }[] };
        const part = result.steps
          ?.filter((step) => step.type === "model_output")
          .flatMap((step) => step.content ?? [])
          .find((part) => part.type === "audio" && part.data);
        return part?.data ? wavFromAudio(part.data, part.mime_type) : null;
      },
    },
    {
      name: "Gemini 3.1 TTS",
      run: async () => {
        const result = (await requestVoice(
          key,
          "models/gemini-3.1-flash-tts-preview:generateContent",
          {
            contents: [
              { role: "user", parts: [{ text: `${style}\n\nTexto para leer:\n${text}` }] },
            ],
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: somVoice } } },
            },
          },
          // This fallback needs more time to render long segments.
          25_000,
        )) as {
          candidates?: {
            content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] };
          }[];
        };
        const audio = result.candidates?.[0]?.content?.parts?.find(
          (part) => part.inlineData?.data,
        )?.inlineData;
        return audio?.data ? wavFromAudio(audio.data, audio.mimeType) : null;
      },
    },
  ]);
}
