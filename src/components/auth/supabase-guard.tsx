/**
 * Guard de autenticación con Supabase.
 * Si el usuario no tiene sesión, redirige a /login.
 */
import { useEffect, type ReactNode } from "react";
import { Navigate, useRouterState } from "@tanstack/react-router";
import { useSupabaseAuth } from "@/lib/auth/supabase-auth";
import { useVigiaStore } from "@/lib/vigia/store";

const LOGIN_PATH = "/login";

function hideBootSplash() {
  const el = document.getElementById("vigia-boot");
  if (!el) return;
  el.classList.add("done");
  window.setTimeout(() => el.remove(), 400);
}

export function SupabaseGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useSupabaseAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Ocultar el splash HTML de boot en cuanto el guard se monta
  useEffect(() => {
    hideBootSplash();
  }, []);

  // Sincronizar inventario con Supabase al loguearse
  useEffect(() => {
    if (!user) return;
    void useVigiaStore.getState().syncInventory();
  }, [user?.id]);

  // Estamos en /login:
  // - si NO hay sesión, dejamos pasar (mostrar el formulario)
  // - si SÍ hay sesión, redirigimos a la app
  if (pathname === LOGIN_PATH) {
    if (user && !loading) {
      return <Navigate to="/" />;
    }
    return <>{children}</>;
  }

  // Sesión cargando → pantalla vacía mientras decide
  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#23483C]">
        <div className="size-10 animate-spin rounded-full border-4 border-[#F3EFE6]/30 border-t-[#F3EFE6]" />
      </div>
    );
  }

  // Sin sesión → redirigir a login
  if (!user) {
    return <Navigate to={LOGIN_PATH} />;
  }

  // Con sesión → pasar
  return <>{children}</>;
}
