import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { readInventoryDocument } from "./recount-vision-provider";

export const readRecountVisionFn = createServerFn({ method: "POST" })
  .validator((raw: { accessToken: string; photo: string }) => {
    if (
      typeof raw?.accessToken !== "string" ||
      !raw.accessToken ||
      raw.accessToken.length > 12000 ||
      typeof raw.photo !== "string" ||
      raw.photo.length > 2_800_000 ||
      !/^data:image\/jpeg;base64,\/9j\//.test(raw.photo)
    ) {
      throw new Error("No se pudo preparar la foto para la lectura con IA.");
    }
    return raw;
  })
  .handler(async ({ data }) => {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    const auth = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    }).auth;
    const {
      data: { user },
      error,
    } = await auth.getUser(data.accessToken);
    if (error || !user) return null;
    try {
      return await readInventoryDocument(data.photo);
    } catch (error) {
      const status = (error as { status?: unknown } | null)?.status;
      console.warn("[recount-vision]", typeof status === "number" ? status : "no usable response");
      return null;
    }
  });
