/**
 * Guard de autenticación con Supabase.
 * Si el usuario no tiene sesión, redirige a /login.
 */
import { useEffect, type ReactNode } from "react";
import { Navigate, useRouterState } from "@tanstack/react-router";
import { useSupabaseAuth } from "@/lib/auth/supabase-auth";
import { useVigiaStore } from "@/lib/vigia/store";

import { dismissBootSplash } from "@/lib/vigia/boot-splash";

const LOGIN_PATH = "/login";

export function SupabaseGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useSupabaseAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Conservar el mismo splash hasta que el destino esté listo.
  useEffect(() => {
    if (pathname === LOGIN_PATH && !loading && !user) dismissBootSplash();
  }, [pathname, loading, user]);

  // Sincronizar inventario con Supabase al loguearse
  useEffect(() => {
    if (!user) return;
    // Forzar sync cuando cambia el usuario
    void useVigiaStore.getState().syncInventory();
  }, [user?.id]);

  // Detectar logout y limpiar Dexie (para que el próximo usuario empiece limpio)
  useEffect(() => {
    if (user) return;
    // Sin usuario → limpiar Dexie para no dejar rastros
    void (async () => {
      try {
        const { getDb } = await import("@/lib/vigia/db");
        const db = getDb();
        await db.products.clear();
        await db.history.clear();
      } catch (err) {
        console.warn("[vigia] no se pudo limpiar Dexie al logout:", err);
      }
    })();
  }, [user]);

  // Estamos en /login:
  // - si NO hay sesión, dejamos pasar (mostrar el formulario)
  // - si SÍ hay sesión, redirigimos a la app
  if (pathname === LOGIN_PATH) {
    if (user && !loading) {
      return <Navigate to="/" />;
    }
    return <>{children}</>;
  }

  // La pantalla inicial cubre la comprobación de sesión.
  if (loading) return null;

  // Sin sesión → redirigir a login
  if (!user) {
    return <Navigate to={LOGIN_PATH} />;
  }

  // Con sesión → pasar
  return <>{children}</>;
}
