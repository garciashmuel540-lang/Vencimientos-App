import { useId } from "react";
import { cn } from "@/lib/utils";

export type MascotMood = "happy" | "thinking" | "sleeping" | "wave";

interface MascotProps {
  mood?: MascotMood;
  className?: string;
  size?: number;
  showBubble?: boolean;
}

const expressions: Record<MascotMood, string> = {
  happy: "😋",
  thinking: "🤔",
  sleeping: "💤",
  wave: "👋",
};

export function Mascot({ mood = "happy", className, size = 120, showBubble = false }: MascotProps) {
  const id = useId();
  const paint = (part: string) => "url(#" + id + "-" + part + ")";

  return (
    <div className={cn("relative inline-flex flex-col items-center gap-2", className)}>
      {showBubble && (
        <span className="som-thought" aria-hidden="true">
          {expressions[mood]}
        </span>
      )}
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        className="som-figure select-none"
        role="img"
        aria-label="Som, la naranja de Vigía"
      >
        <title>Som, la naranja de Vigía</title>
        <defs>
          <radialGradient id={id + "-peel"} cx=".32" cy=".27" r=".76">
            <stop stopColor="#fff4ad" />
            <stop offset=".22" stopColor="#ffc65a" />
            <stop offset=".54" stopColor="#ff9b28" />
            <stop offset=".81" stopColor="#f17519" />
            <stop offset=".95" stopColor="#ce5120" />
            <stop offset="1" stopColor="#ee8944" />
          </radialGradient>
          <linearGradient id={id + "-leaf"} x2=".8" y2="1">
            <stop stopColor="#effa96" />
            <stop offset=".42" stopColor="#9ed160" />
            <stop offset="1" stopColor="#46804f" />
          </linearGradient>
          <radialGradient id={id + "-cheek"}>
            <stop stopColor="#f15e72" />
            <stop offset="1" stopColor="#ff9b6a" stopOpacity=".1" />
          </radialGradient>
          <radialGradient id={id + "-shadow"}>
            <stop stopColor="#954528" stopOpacity=".32" />
            <stop offset="1" stopColor="#954528" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={id + "-glint"} x2=".6" y2="1">
            <stop stopColor="white" stopOpacity=".94" />
            <stop offset="1" stopColor="#fffad8" stopOpacity=".12" />
          </linearGradient>
        </defs>
        <ellipse cx="50" cy="92" rx="33" ry="6" fill={paint("shadow")} />
        <g className="som-body">
          <g fill={paint("peel")} stroke="#d06c2b" strokeWidth="1">
            <ellipse cx="36" cy="84" rx="8" ry="6" />
            <ellipse cx="65" cy="84" rx="8" ry="6" />
            <path
              className={mood === "wave" ? "som-wave" : undefined}
              d="M20 65C10 71 2 57 5 50c2-5 7-2 8 3l9 4Z"
            />
            <path d="M82 57c12-1 15 9 10 13-5 4-10-2-13-5Z" />
            <path d="M50 23C31 16 13 30 12 53 10 74 25 87 49 88c24 1 41-13 40-34-1-23-17-38-39-31Z" />
          </g>
          <path
            d="M47 25q-6-7-3-15"
            fill="none"
            stroke="#845732"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          <g className="som-leaf">
            <path
              d="M47 22C44 11 57 2 77 7 71 20 59 27 47 22Z"
              fill={paint("leaf")}
              stroke="#659656"
              strokeWidth="1"
            />
            <path d="M49 21q10-8 20-11" fill="none" stroke="#e2f392" strokeWidth="1.3" />
          </g>
          <ellipse
            cx="32"
            cy="35"
            rx="10"
            ry="4.2"
            transform="rotate(-32 32 35)"
            fill={paint("glint")}
          />
          <ellipse cx="21" cy="44" rx="2" ry="2.8" fill="#fff3bc" />
          <path
            d="M66 78q10-3 15-11"
            fill="none"
            stroke="#ffc782"
            strokeWidth="2"
            strokeLinecap="round"
            opacity=".65"
          />
          <g fill="#e98123">
            <circle cx="71" cy="34" r="1" />
            <circle cx="75" cy="38" r=".8" />
            <circle cx="70" cy="40" r=".7" />
          </g>
          <g fill={paint("cheek")}>
            <ellipse cx="29" cy="62" rx="9" ry="6" />
            <ellipse cx="72" cy="62" rx="9" ry="6" />
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
            <g className="som-eyes">
              <g className="som-pupils" fill="#503224">
                <ellipse cx="36" cy="54" rx="4.5" ry="5.5" />
                <ellipse cx="64" cy="54" rx="4.5" ry="5.5" />
              </g>
              <g className="som-pupils" fill="white">
                <circle cx="35" cy="52" r="1.5" />
                <circle cx="63" cy="52" r="1.5" />
              </g>
            </g>
          )}
          <g fill="none" stroke="#392a24" strokeWidth="2.7" strokeLinecap="round">
            <rect x="23" y="44" width="25" height="20" rx="8" />
            <rect x="52" y="44" width="25" height="20" rx="8" />
            <path d="M48 52q2-4 4 0M23 49l-6-2m60 2 6-2" />
          </g>
          <path
            className={mood === "sleeping" ? undefined : "som-smile"}
            d={mood === "thinking" ? "M47 69q3-3 7-1" : "M43 68q7 8 14 0"}
            fill="none"
            stroke="#613621"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          {mood !== "sleeping" && (
            <path
              className="som-silly-face"
              opacity="0"
              d="M43 68q7 4 14 0q-2 11-7 10q-6-1-7-10Z"
              fill="#613621"
            />
          )}
          <path
            d="M48 79l-9-4v10l9-3m4-3 9-4v10l-9-3"
            fill="#176157"
            stroke="#104a43"
            strokeWidth="1"
            strokeLinejoin="round"
          />
          <rect
            x="47"
            y="77"
            width="6"
            height="7"
            rx="2"
            fill="#268275"
            stroke="#104a43"
            strokeWidth="1"
          />
        </g>
      </svg>
    </div>
  );
}
