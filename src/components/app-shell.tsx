import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ScanBarcode } from "lucide-react";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Onboarding } from "@/components/onboarding";
import { AppSidebar } from "@/components/app-sidebar";
import { dismissBootSplash } from "@/lib/vigia/boot-splash";
import { ChatIA } from "@/components/chat-ia";
import { useVigiaStore } from "@/lib/vigia/store";
import { useSidebarStore } from "@/lib/vigia/sidebar";

const TOUR_KEY = "vigia-tour-done";


export function AppShell({ children }: { children: React.ReactNode }) {
  const hydrate = useVigiaStore((s) => s.hydrate);
  const ready = useVigiaStore((s) => s.ready);
  const fireOpenAlerts = useVigiaStore((s) => s.fireOpenAlerts);
  const sidebarOpen = useSidebarStore((s) => s.open);
  const setSidebarOpen = useSidebarStore((s) => s.setOpen);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isLoginPage = pathname === "/login";
  // Recuentos tiene su propio acceso a la cámara para mantener la hoja abierta.
  const hideScanFab =
    pathname.startsWith("/escanear") ||
    pathname.startsWith("/precio") ||
    pathname.startsWith("/recuentos");
  const [tour, setTour] = useState(false);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!ready || isLoginPage) return;
    if (!localStorage.getItem(TOUR_KEY)) setTour(true);
    const t = window.setTimeout(() => void fireOpenAlerts(), 600);
    return () => window.clearTimeout(t);
  }, [ready, isLoginPage, fireOpenAlerts]);

  useEffect(() => {
    if (ready && !isLoginPage) dismissBootSplash();
  }, [ready, isLoginPage]);

  // En /login: solo mostrar el contenido, sin menú ni chat
  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <TooltipProvider delayDuration={250}>
      <div className="som-scene min-h-dvh bg-background text-foreground">
        <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col pb-24">
          {children}
        </div>

        {/* FAB: Escanear (abajo derecha) - oculto en pantallas que ya escanean */}
        {!hideScanFab && (
          <Link
            to="/escanear"
            className="no-print fixed bottom-6 right-6 z-30 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95"
            aria-label="Escanear"
          >
            <ScanBarcode className="size-6" />
          </Link>
        )}

        {/* Menú lateral */}
        <AppSidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        <Onboarding
          open={tour}
          onFinish={() => {
            localStorage.setItem(TOUR_KEY, "1");
            setTour(false);
          }}
        />
        <ChatIA />
        <Toaster position="top-center" richColors={false} />
      </div>
    </TooltipProvider>
  );
}
