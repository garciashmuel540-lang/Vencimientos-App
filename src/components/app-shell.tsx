import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ScanBarcode } from "lucide-react";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Onboarding } from "@/components/onboarding";
import { AppSidebar } from "@/components/app-sidebar";
import { Splash } from "@/components/splash";
import { ChatIA } from "@/components/chat-ia";
import { useVigiaStore } from "@/lib/vigia/store";
import { useSidebarStore } from "@/lib/vigia/sidebar";

const TOUR_KEY = "vigia-tour-done";
const SPLASH_MIN_MS = 1400;

export function AppShell({ children }: { children: React.ReactNode }) {
  const hydrate = useVigiaStore((s) => s.hydrate);
  const ready = useVigiaStore((s) => s.ready);
  const fireOpenAlerts = useVigiaStore((s) => s.fireOpenAlerts);
  const sidebarOpen = useSidebarStore((s) => s.open);
  const setSidebarOpen = useSidebarStore((s) => s.setOpen);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isLoginPage = pathname === "/login";
  const [tour, setTour] = useState(false);
  const [splash, setSplash] = useState(true);
  const [minTimeDone, setMinTimeDone] = useState(false);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    const t = window.setTimeout(() => setMinTimeDone(true), SPLASH_MIN_MS);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (ready && minTimeDone) setSplash(false);
  }, [ready, minTimeDone]);

  useEffect(() => {
    if (!ready || splash) return;
    if (!localStorage.getItem(TOUR_KEY)) setTour(true);
    const t = window.setTimeout(() => void fireOpenAlerts(), 600);
    return () => window.clearTimeout(t);
  }, [ready, splash, fireOpenAlerts]);

  // En /login: solo mostrar el contenido, sin menú ni chat
  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <TooltipProvider delayDuration={250}>
      <div className="min-h-dvh bg-background text-foreground">
        <Splash show={splash} />

        <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col pb-24">
          {children}
        </div>

        {/* FAB: Escanear (abajo derecha) */}
        <Link
          to="/escanear"
          className="no-print fixed bottom-6 right-6 z-30 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95"
          aria-label="Escanear"
        >
          <ScanBarcode className="size-6" />
        </Link>

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
