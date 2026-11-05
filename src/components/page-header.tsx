import { Menu } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Mascot, type MascotMood } from "@/components/mascot";
import { useChatFocus } from "@/lib/vigia/chat-focus";

const seenTips = new Set<string>();
let lastTip = 0;

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
  onMenuClick,
  tip,
  mood = "happy",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  onMenuClick?: () => void;
  tip: string;
  mood?: MascotMood;
}) {
  const open = useChatFocus((s) => s.autoOpen);
  const openChat = useChatFocus((s) => s.openChat);
  const [greeting, setGreeting] = useState(true);
  const [comment, setComment] = useState(false);
  useEffect(() => {
    setGreeting(true);
    setComment(false);
    const hello = window.setTimeout(() => setGreeting(false), 1800);
    const show = window.setTimeout(() => {
      if (useChatFocus.getState().autoOpen || seenTips.has(title) || Date.now() - lastTip < 45000)
        return;
      seenTips.add(title);
      lastTip = Date.now();
      setComment(true);
    }, 700);
    const hide = window.setTimeout(() => setComment(false), 4700);
    return () => {
      clearTimeout(hello);
      clearTimeout(show);
      clearTimeout(hide);
    };
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
          aria-label="Chat con Som"
          aria-haspopup="dialog"
          aria-expanded={open}
          style={{ visibility: open ? "hidden" : undefined }}
          className="som-header-trigger no-print"
          onClick={openChat}
        >
          <Mascot mood={greeting ? "wave" : mood} size={80} />
          <span>Chat</span>
        </button>
        {action}
      </div>
      {comment && !open && <p className="som-page-tip no-print">{tip}</p>}
    </header>
  );
}
