import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  LayoutGrid,
  Package,
  ScanBarcode,
  Settings,
} from "lucide-react";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Onboarding } from "@/components/onboarding";
import { Splash } from "@/components/splash";
import { ChatIA } from "@/components/chat-ia";
import { useVigiaStore } from "@/lib/vigia/store";
import { cn } from "@/lib/utils";

const TOUR_KEY = "vigia-tour-done";
const SPLASH_MIN_MS = 1400;

const NAV = [
  { to: "/", label: "Inicio", icon: LayoutGrid },
  { to: "/inventario", label: "Inventario", icon: Package },
  { to: "/escanear", label: "Escanear", icon: ScanBarcode, fab: true },
  { to: "/reportes", label: "Reportes", icon: BarChart3 },
  { to: "/ajustes", label: "Ajustes", icon: Settings },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const hydrate = useVigiaStore((s) => s.hydrate);
  const ready = useVigiaStore((s) => s.ready);
  const fireOpenAlerts = useVigiaStore((s) => s.fireOpenAlerts);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
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

  return (
    <TooltipProvider delayDuration={250}>
      <div className="min-h-dvh bg-background text-foreground">
        <Splash show={splash} />
        <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
          {children}
        </div>
        <nav
          className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur-sm"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          aria-label="Principal"
        >
          <ul className="mx-auto grid max-w-3xl grid-cols-5 px-2 py-1.5">
            {NAV.map((item) => {
              const active =
                item.to === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.to);
              const Icon = item.icon;
              if ("fab" in item && item.fab) {
                return (
                  <li key={item.to} className="relative flex justify-center">
                    <Link
                      to={item.to}
                      aria-label={item.label}
                      className="absolute -top-7 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-transform duration-150 active:scale-[0.96]"
                    >
                      <Icon className="size-6" />
                    </Link>
                  </li>
                );
              }
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    className={cn(
                      "flex h-12 flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
                      active ? "text-primary" : "text-muted-foreground",
                    )}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon className="size-5" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
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
