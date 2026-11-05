import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

export type MascotMood = "happy" | "thinking" | "sleeping" | "wave";

interface MascotProps {
  mood?: MascotMood;
  className?: string;
  size?: number;
  showBubble?: boolean;
  bubbleText?: string;
}

const MASCOT_MESSAGES: Record<MascotMood, string> = {
  happy: "¡Hola! ¿Qué revisamos hoy? 🍊",
  thinking: "Mmm, déjame pensar… 🤔",
  sleeping: "Zzz… 💤",
  wave: "¡Bienvenido a Vigía! 👋",
};

export function Mascot({
  mood = "happy",
  className,
  size = 120,
  showBubble = false,
  bubbleText,
}: MascotProps) {
  const [blink, setBlink] = useState(false);

  // Parpadeo aleatorio
  useEffect(() => {
    const id = window.setInterval(() => {
      setBlink(true);
      window.setTimeout(() => setBlink(false), 150);
    }, 3500 + Math.random() * 2000);
    return () => window.clearInterval(id);
  }, []);

  const text = bubbleText ?? MASCOT_MESSAGES[mood];

  return (
    <div className={cn("relative inline-flex flex-col items-center gap-2", className)}>
      {showBubble && (
        <div className="naranja-bubble animate-naranja-in max-w-[200px] px-3 py-2 text-center text-xs font-medium text-foreground">
          {text}
        </div>
      )}
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        className="animate-naranja-bounce select-none"
        aria-hidden
      >
        {/* Hojita */}
        <path
          d="M52 18 Q 58 8 70 10 Q 66 20 54 22 Z"
          fill="#4caf7a"
          stroke="#2f6a4a"
          strokeWidth="1.2"
        />
        <path d="M52 18 Q 50 12 50 8" stroke="#2f6a4a" strokeWidth="1.2" fill="none" />
        {/* Cuerpo de la naranja */}
        <circle cx="50" cy="55" r="34" fill="#ff8c42" stroke="#d96a2c" strokeWidth="1.5" />
        {/* Brillo */}
        <ellipse cx="40" cy="42" rx="10" ry="6" fill="#ffb27a" opacity="0.7" />
        {/* Cachetes */}
        <circle cx="34" cy="62" r="5" fill="#ffb27a" opacity="0.6" />
        <circle cx="66" cy="62" r="5" fill="#ffb27a" opacity="0.6" />
        {/* Ojitos */}
        <g className={blink ? "" : ""}>
          {blink ? (
            <>
              <line x1="36" y1="52" x2="42" y2="52" stroke="#3a2415" strokeWidth="2" strokeLinecap="round" />
              <line x1="58" y1="52" x2="64" y2="52" stroke="#3a2415" strokeWidth="2" strokeLinecap="round" />
            </>
          ) : (
            <>
              <circle cx="39" cy="52" r="3" fill="#3a2415" />
              <circle cx="61" cy="52" r="3" fill="#3a2415" />
              <circle cx="40" cy="51" r="1" fill="#fff" />
              <circle cx="62" cy="51" r="1" fill="#fff" />
            </>
          )}
        </g>
        {/* Sonrisa */}
        {mood === "thinking" ? (
          <path d="M44 68 Q 50 64 56 68" stroke="#3a2415" strokeWidth="2" fill="none" strokeLinecap="round" />
        ) : (
          <path d="M42 66 Q 50 74 58 66" stroke="#3a2415" strokeWidth="2" fill="none" strokeLinecap="round" />
        )}
        {/* Brazos */}
        <g className={mood === "wave" ? "animate-naranja-wave" : ""} style={{ transformOrigin: "18px 60px" }}>
          <path d="M16 58 Q 8 52 6 46" stroke="#d96a2c" strokeWidth="2" fill="none" strokeLinecap="round" />
        </g>
        <path d="M84 58 Q 92 62 94 68" stroke="#d96a2c" strokeWidth="2" fill="none" strokeLinecap="round" />
      </svg>
    </div>
  );
}
