import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { SPEECH_SEGMENT_LENGTH } from "./voice-text";
import { synthesizeSomVoice } from "./voice-provider";

export const somVoiceFn = createServerFn({ method: "POST" })
  .validator((input: { accessToken: string; text: string }) => {
    if (
      typeof input?.accessToken !== "string" ||
      input.accessToken.length > 12000 ||
      typeof input.text !== "string" ||
      !input.text.trim() ||
      input.text.length > SPEECH_SEGMENT_LENGTH
    )
      throw new Error("No se pudo preparar la lectura.");
    return input;
  })
  .handler(async ({ data }) => {
    if (!process.env.GEMINI_API_KEY) return null;
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const {
      data: { user },
      error,
    } = await client.auth.getUser(data.accessToken);
    if (error || !user) return null;
    return synthesizeSomVoice(data.text);
  });
