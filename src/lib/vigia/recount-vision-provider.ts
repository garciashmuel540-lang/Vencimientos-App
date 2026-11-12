import Groq from "groq-sdk";
import { firstModelResult } from "./ai/fallback";
import { geminiJson } from "./ai/gemini";
import { documentPrompt, parseDocumentVision } from "./recount-vision";

async function groqDocument(photo: string) {
  if (!process.env.GROQ_API_KEY) return null;
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY, timeout: 24000, maxRetries: 0 });
  const response = await groq.chat.completions.create({
    model: "qwen/qwen3.8-27b",
    temperature: 0,
    reasoning_effort: "none",
    max_completion_tokens: 8000,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: documentPrompt },
          { type: "image_url", image_url: { url: photo } },
        ],
      },
    ],
  });
  const choice = response.choices[0];
  if (!choice?.message.content || choice.finish_reason !== "stop") return null;
  const rows = parseDocumentVision(choice.message.content);
  return rows.length ? rows : null;
}

export async function readInventoryDocument(photo: string) {
  return firstModelResult([
    ...(process.env.GROQ_API_KEY ? [{ name: "Groq visión", run: () => groqDocument(photo) }] : []),
    ...(process.env.GEMINI_API_KEY
      ? [
          {
            name: "Gemini 3.1 Flash-Lite",
            run: async () => {
              const data = photo.slice(photo.indexOf(",") + 1);
              const output = await geminiJson(
                [
                  {
                    role: "user",
                    parts: [
                      { text: documentPrompt },
                      { inlineData: { mimeType: "image/jpeg", data } },
                    ],
                  },
                ],
                8000,
              );
              if (!output) return null;
              const rows = parseDocumentVision(output);
              return rows.length ? rows : null;
            },
          },
        ]
      : []),
  ]);
}
