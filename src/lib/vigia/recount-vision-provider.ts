import Groq from "groq-sdk";
import { documentPrompt, parseDocumentVision } from "./recount-vision";

export async function readInventoryDocument(photo: string) {
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
