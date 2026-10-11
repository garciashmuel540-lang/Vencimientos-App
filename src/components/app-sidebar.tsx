/**
 * Menú lateral (sidebar) con navegación principal.
 * Se abre desde el botón hamburguesa o desde el borde izquierdo.
 */
import { Link, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  LayoutGrid,
  LogOut,
  Package,
  ScanBarcode,
  Settings,
  Tag,
  UtensilsCrossed,
} from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useSupabaseAuth, signOutSupabase } from "@/lib/auth/supabase-auth";
import { toast } from "sonner";
import { useState } from "react";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Inicio", icon: LayoutGrid },
  { to: "/inventario", label: "Inventario", icon: Package },
  { to: "/food-service", label: "Food Service", icon: UtensilsCrossed },
  { to: "/escanear", label: "Escanear", icon: ScanBarcode },
  { to: "/precio", label: "Verificador de precios", icon: Tag },
  { to: "/reportes", label: "Reportes", icon: BarChart3 },
  { to: "/ajustes", label: "Ajustes", icon: Settings },
] as const;

interface Props {
  open: boolean;
  onClose: () => void;
}

export function AppSidebar({ open, onClose }: Props) {
  const { user } = useSupabaseAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOutSupabase();
      toast.success("Sesión cerrada");
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "No se pudo cerrar sesión";
      toast.error(msg);
      setSigningOut(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="left" className="flex flex-col p-0">
        {/* Header */}
        <div className="border-b px-5 py-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Vigía
          </p>
          <h2 className="mt-1 font-serif text-2xl font-semibold">
            Menú
          </h2>
        </div>

        {/* Nav links */}
        <nav className="flex-1 overflow-y-auto py-2">
          <ul className="flex flex-col">
            {NAV.map((item) => {
              const active =
                item.to === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.to);
              const Icon = item.icon;
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    onClick={onClose}
                    className={cn(
                      "flex items-center gap-3 px-5 py-3 text-sm font-medium transition-colors",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-foreground hover:bg-muted/60",
                    )}
                  >
                    <Icon className="size-5 shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Footer: usuario + cerrar sesión */}
        <div className="border-t px-5 py-4">
          {user && (
            <div className="mb-3">
              <p className="text-xs text-muted-foreground">Conectado como</p>
              <p className="truncate text-sm font-medium">
                {user.email ?? "usuario"}
              </p>
              {user.isAdmin && (
                <span className="mt-1 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase text-primary">
                  Admin
                </span>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={() => void handleSignOut()}
            disabled={signingOut}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            <LogOut className="size-4" />
            {signingOut ? "Cerrando…" : "Cerrar sesión"}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
