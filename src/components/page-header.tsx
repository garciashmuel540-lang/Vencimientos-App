import { Menu } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Mascot, type MascotMood } from "@/components/mascot";
import { useChatFocus } from "@/lib/vigia/chat-focus";

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
  onMenuClick,
  mood = "happy",
  thought,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  onMenuClick?: () => void;
  mood?: MascotMood;
  thought?: string;
}) {
  const open = useChatFocus((s) => s.autoOpen);
  const openChat = useChatFocus((s) => s.openChat);
  const [greeting, setGreeting] = useState(true);
  useEffect(() => {
    setGreeting(true);
    const hello = window.setTimeout(() => setGreeting(false), 1800);
    return () => clearTimeout(hello);
  }, [title]);
  return (
    <header className="som-page-header">
      <div className="flex min-w-0 items-start gap-3">
        {onMenuClick ? (
          <button
            type="button"
            onClick={onMenuClick}
            className="no-print mt-1 flex size-9 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted active:scale-95"
            aria-label="Abrir menú"
          >
            <Menu className="size-5" />
          </button>
        ) : null}
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="font-display text-3xl font-medium tracking-tight text-foreground">
            {title}
          </h1>
          {description ? (
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      <div className="som-header-tools">
        <button
          type="button"
          id="som-page-trigger"
          aria-label="Chat con Sôm"
          aria-haspopup="dialog"
          aria-expanded={open}
          style={{ visibility: open ? "hidden" : undefined }}
          className="som-header-trigger no-print"
          onClick={openChat}
        >
          <Mascot
            mood={greeting && !thought ? "wave" : mood}
            size={80}
            showBubble
            thought={thought}
          />
          <span>Chat</span>
        </button>
        {action}
      </div>
    </header>
  );
}
