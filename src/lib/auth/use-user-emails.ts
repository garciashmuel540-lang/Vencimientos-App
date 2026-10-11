/**
 * Hook que carga el mapa user_id → email.
 * - Admin: recibe todos los emails.
 * - Empleado: solo el suyo.
 * Se cachea durante la sesión.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

let cachedMap: Map<string, string> | null = null;
let cachedAt = 0;
const CACHE_MS = 5 * 60 * 1000; // 5 minutos

export function useUserEmails() {
  const [emails, setEmails] = useState<Map<string, string>>(
    () => cachedMap ?? new Map(),
  );
  const [loading, setLoading] = useState(!cachedMap);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Si el caché está fresco, usarlo
    if (cachedMap && Date.now() - cachedAt < CACHE_MS) {
      setEmails(cachedMap);
      setLoading(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        if (!supabase) return;
        const { data, error } = await supabase.rpc("get_user_emails");
        if (error || !Array.isArray(data)) {
          if (error) {
            console.warn("[use-user-emails] RPC falló:", error.message);
          }
          return;
        }
        const map = new Map<string, string>();
        for (const row of data as { user_id: string; email: string }[]) {
          map.set(row.user_id, row.email);
        }
        cachedMap = map;
        cachedAt = Date.now();
        if (!cancelled) setEmails(map);
      } catch (err) {
        console.warn("[use-user-emails] error:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { emails, loading };
}
