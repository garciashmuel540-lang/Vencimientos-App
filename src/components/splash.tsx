import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

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

  // Si por alguna razón no se monta el splash de React, igual ocultamos el boot
  useEffect(() => {
    if (!show) hideBootSplash();
  }, [show]);

  if (!mounted) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#23483C] transition-opacity duration-400 ease-out",
        visible ? "opacity-100" : "opacity-0",
      )}
      aria-hidden={!show}
    >
      <div
        className={cn(
          "flex flex-col items-center gap-4 transition-all duration-500 ease-out",
          visible ? "scale-100 opacity-100" : "scale-90 opacity-0",
        )}
      >
        <img
          src="/icon-192.png"
          alt=""
          width={96}
          height={96}
          className="size-24 rounded-2xl shadow-lg"
          draggable={false}
        />
        <p
          className="font-semibold tracking-tight text-[#F3EFE6]"
          style={{ fontFamily: "Fraunces, serif", fontSize: "1.75rem" }}
        >
          Vigía
        </p>
        <div className="mt-2 h-1 w-16 overflow-hidden rounded-full bg-white/20">
          <div className="h-full w-full origin-left animate-[splash-bar_1.2s_ease-in-out_infinite] rounded-full bg-[#F3EFE6]/80" />
        </div>
      </div>
    </div>
  );
}
