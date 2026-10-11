import type { ReactNode } from "react";
import { Menu } from "lucide-react";

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
  onMenuClick,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  onMenuClick?: () => void;
}) {
  return (
    <header className="flex items-start justify-between gap-3 px-4 pt-6 pb-4">
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
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {action}
    </header>
  );
}
