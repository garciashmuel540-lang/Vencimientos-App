/**
 * Cliente de Supabase.
 * Las variables VITE_* son públicas por diseño (van al bundle del frontend).
 * Seguridad real: Row Level Security en las tablas.
 */
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  console.warn(
    "[vigia] Falta VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY. " +
      "Configúralas en Railway → Variables.",
  );
}

export const supabase =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          storageKey: "vigia-auth",
        },
      })
    : null;

export const supabaseReady = Boolean(supabase);
