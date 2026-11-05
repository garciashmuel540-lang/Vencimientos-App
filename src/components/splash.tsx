import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Mascot } from "@/components/mascot";

function hideBootSplash() {
  const el = document.getElementById("vigia-boot");
  if (!el) return;
  el.classList.add("done");
  window.setTimeout(() => el.remove(), 400);
}

export function Splash({ show }: { show: boolean }) {
  const [mounted, setMounted] = useState(show);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (show) {
      setMounted(true);
      const id = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(id);
    }
    setVisible(false);
    hideBootSplash();
    const t = window.setTimeout(() => setMounted(false), 450);
    return () => window.clearTimeout(t);
  }, [show]);

  useEffect(() => {
    if (!show) hideBootSplash();
  }, [show]);

  if (!mounted) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] flex items-center justify-center bg-background/90 px-6 backdrop-blur-xl transition-[opacity,transform] duration-500 ease-out",
        visible ? "opacity-100" : "pointer-events-none scale-[1.02] opacity-0",
      )}
      aria-hidden={!show}
    >
      <div className="liquid-glass flex w-full max-w-xs flex-col items-center rounded-[2rem] px-7 py-8 text-center">
        <Mascot mood="wave" size={142} showBubble bubbleText="¡Hola! Soy Som 🍊" />
        <p className="mt-4 font-display text-3xl font-semibold tracking-tight text-foreground">
          Vigía
        </p>
        <p className="mt-1 text-sm text-muted-foreground">Tu inventario, bajo control</p>
        <div
          className="mt-7 h-1.5 w-32 overflow-hidden rounded-full bg-secondary"
          role="progressbar"
          aria-label="Cargando Vigía"
        >
          <div className="h-full w-full origin-left animate-[splash-bar_1.2s_ease-in-out_infinite] rounded-full bg-primary" />
        </div>
      </div>
    </div>
  );
}
