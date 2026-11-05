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
        role="img"
        aria-label="Nari, la naranja de Vigía"
      >
        <title>Nari, la naranja de Vigía</title>
        <ellipse cx="50" cy="92" rx="29" ry="4" fill="#a66a49" opacity=".16" />
        <g stroke="#653922" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round">
          <ellipse cx="36" cy="85" rx="8" ry="5" fill="#ee9550" />
          <ellipse cx="65" cy="85" rx="8" ry="5" fill="#ee9550" />
          <path
            d="M49 23C28 16 12 33 12 56c0 20 16 31 38 31s39-11 39-31c0-23-18-40-40-33Z"
            fill="#ffa339"
          />
          <path d="M45 24Q40 15 45 10" fill="none" />
          <path d="M47 20Q50 4 74 8Q66 26 47 20Z" fill="#91b96d" />
          <path d="M49 19Q57 14 65 12" stroke="#527647" strokeWidth="1.4" />
          <path
            d={mood === "wave" ? "M16 60Q4 59 5 46Q9 41 13 51" : "M16 60Q5 64 9 70Q14 73 19 65"}
            fill="#ffb354"
          />
          <path d="M83 61Q95 61 92 69Q88 73 82 66" fill="#ffb354" />
        </g>
        <path
          d="M23 40Q27 32 34 31"
          fill="none"
          stroke="#ffdda1"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <g fill="#df7952">
          <circle cx="70" cy="36" r="1.4" />
          <circle cx="75" cy="40" r="1" />
          <circle cx="70" cy="42" r=".9" />
        </g>
        <g fill="#f48277">
          <ellipse cx="29" cy="63" rx="7" ry="4" />
          <ellipse cx="72" cy="63" rx="7" ry="4" />
        </g>
        {mood === "sleeping" ? (
          <path
            d="M31 55q5 5 10 0m17 0q5 5 10 0"
            fill="none"
            stroke="#503224"
            strokeWidth="3"
            strokeLinecap="round"
          />
        ) : (
          <g className="nari-eyes">
            <g fill="#503224">
              <ellipse cx="36" cy="54" rx="4.5" ry="5.5" />
              <ellipse cx="64" cy="54" rx="4.5" ry="5.5" />
            </g>
            <g fill="white">
              <circle cx="35" cy="52" r="1.5" />
              <circle cx="63" cy="52" r="1.5" />
            </g>
          </g>
        )}
        <path
          d={mood === "thinking" ? "M47 66q3-3 6-1" : "M44 63q3 6 6 1q3 5 6-1"}
          fill="none"
          stroke="#613621"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
