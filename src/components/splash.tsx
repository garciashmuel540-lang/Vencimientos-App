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

  useEffect(() => {
    if (!show) hideBootSplash();
  }, [show]);

  if (!mounted) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#23483C] transition-all duration-500 ease-out",
        visible ? "opacity-100" : "opacity-0 scale-110 pointer-events-none",
      )}
      aria-hidden={!show}
    >
      <div className="flex flex-col items-center gap-4">
        {/* Logo animado con SVG */}
        <svg
          viewBox="0 0 200 200"
          width="140"
          height="140"
          className="drop-shadow-xl"
          aria-hidden="true"
        >
          <defs>
            <style>
              {`
                @keyframes vigia-pop {
                  0% { transform: scale(0); opacity: 0; }
                  60% { transform: scale(1.08); opacity: 1; }
                  100% { transform: scale(1); opacity: 1; }
                }
                @keyframes vigia-leaf {
                  0% { transform: scale(0) rotate(-45deg); opacity: 0; }
                  60% { transform: scale(1.15) rotate(5deg); opacity: 1; }
                  100% { transform: scale(1) rotate(0deg); opacity: 1; }
                }
                @keyframes vigia-stem {
                  0% { transform: scaleY(0); opacity: 0; }
                  100% { transform: scaleY(1); opacity: 1; }
                }
                @keyframes vigia-check {
                  0% { stroke-dashoffset: 200; opacity: 0; }
                  100% { stroke-dashoffset: 0; opacity: 1; }
                }
                @keyframes vigia-circle-dot {
                  0% { transform: scale(0); opacity: 0; }
                  70% { transform: scale(1.2); opacity: 1; }
                  100% { transform: scale(1); opacity: 1; }
                }
                .vigia-circle {
                  transform-origin: 100px 115px;
                  animation: vigia-pop 0.9s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s both;
                }
                .vigia-leaf {
                  transform-origin: 108px 45px;
                  animation: vigia-leaf 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) 0.9s both;
                }
                .vigia-stem {
                  transform-origin: 100px 50px;
                  animation: vigia-stem 0.5s ease-out 1.5s both;
                }
                .vigia-check {
                  stroke-dasharray: 200;
                  animation: vigia-check 0.8s ease-out 1.8s both;
                }
                .vigia-circle-dot {
                  transform-origin: 100px 115px;
                  animation: vigia-circle-dot 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) 2.4s both;
                }
              `}
            </style>
          </defs>

          {/* Círculo naranja (cuerpo) */}
          <circle
            className="vigia-circle"
            cx="100"
            cy="115"
            r="70"
            fill="#F57C1F"
          />

          {/* Check blanco (dentro del círculo) */}
          <path
            className="vigia-check"
            d="M 65 115 L 90 140 L 135 90"
            stroke="#FFFFFF"
            strokeWidth="14"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />

          {/* Punto blanco (dentro del check) */}
          <circle
            className="vigia-circle-dot"
            cx="100"
            cy="115"
            r="8"
            fill="#FFFFFF"
          />

          {/* Tallo oscuro */}
          <path
            className="vigia-stem"
            d="M 100 50 Q 95 35 105 25"
            stroke="#3D2817"
            strokeWidth="7"
            strokeLinecap="round"
            fill="none"
          />

          {/* Hoja verde */}
          <path
            className="vigia-leaf"
            d="M 108 45 Q 145 30 160 50 Q 135 65 108 55 Z"
            fill="#6BBE45"
          />
        </svg>

        {/* Texto Vigía */}
        <p
          className="font-semibold tracking-tight text-[#F3EFE6] animate-[vigia-fade-up_0.6s_ease-out_2.6s_both]"
          style={{
            fontFamily: "Fraunces, serif",
            fontSize: "2rem",
          }}
        >
          Vigía
        </p>

        {/* Barra de progreso */}
        <div className="mt-2 h-1 w-24 overflow-hidden rounded-full bg-white/20">
          <div className="h-full w-full origin-left rounded-full bg-[#F3EFE6]/80 animate-[splash-bar_1.2s_ease-in-out_infinite]" />
        </div>
      </div>

      <style>{`
        @keyframes vigia-fade-up {
          0% { opacity: 0; transform: translateY(8px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
