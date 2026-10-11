import { useMemo } from "react";
import { Download, Printer, Share2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { daysLabel, formatDate, productStatus } from "@/lib/vigia/dates";
import { downloadCsv } from "@/lib/vigia/export";
import { buildDailySummary } from "@/lib/vigia/notifications";
import { useVigiaStore } from "@/lib/vigia/store";
import { CATEGORY_LABEL, HistoryEntry } from "@/lib/vigia/types";
import { useSupabaseAuth } from "@/lib/auth/supabase-auth";
import { useUserEmails } from "@/lib/auth/use-user-emails";
import { User } from "lucide-react";
import { toast } from "sonner";

const ACTION_LABEL: Record<HistoryEntry["action"], string> = {
  created: "Registrado",
  updated: "Editado",
  consumed: "Vendido / usado",
  removed: "Quitado",
  expired: "Marcado vencido",
  price_changed: "Precio actualizado",
};

export function ReportsPage() {
  const products = useVigiaStore((s) => s.products);
  const history = useVigiaStore((s) => s.history);
  const settings = useVigiaStore((s) => s.settings);
  const soonWithin = Math.max(...settings.days, 30);
  const { user, isAdmin } = useSupabaseAuth();
  const { emails } = useUserEmails();

  const soon = useMemo(
    () =>
      products.filter((p) => {
        const st = productStatus(p, soonWithin);
        return st === "soon" || st === "expired";
      }),
    [products, soonWithin],
  );

  function shareSummary() {
    const text = buildDailySummary(products, settings.storeName);
    const wa = `https://wa.me/?text=${encodeURIComponent(text)}`;
    const mail = `mailto:?subject=${encodeURIComponent("Resumen Vigía")}&body=${encodeURIComponent(text)}`;
    if (navigator.share) {
      void navigator.share({ title: "Resumen Vigía", text }).catch(() => {
        window.open(wa, "_blank");
      });
    } else {
      window.open(wa, "_blank");
    }
    void mail;
  }

  return (
    <main>
      <PageHeader
        eyebrow="Papelería"
        title="Reportes"
        description="Exporta, imprime o envía el resumen del día."
      />

      <div className="grid gap-2 px-4 sm:grid-cols-3">
        <Button
          variant="outline"
          size="lg"
          onClick={() => {
            downloadCsv(products);
            toast.success("Descargamos el inventario en CSV (se abre en Excel).");
          }}
        >
          <Download className="size-4" />
          Excel / CSV
        </Button>
        <Button
          variant="outline"
          size="lg"
          onClick={() => {
            window.print();
          }}
        >
          <Printer className="size-4" />
          Imprimir / PDF
        </Button>
        <Button variant="outline" size="lg" onClick={shareSummary}>
          <Share2 className="size-4" />
          WhatsApp o correo
        </Button>
      </div>

      <section className="mt-8 px-4" id="print-area">
        <Card className="p-4">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-display text-xl font-medium">Por vencer y vencidos</h2>
            <p className="text-xs text-muted-foreground">
              {format(new Date(), "d MMM yyyy", { locale: es })}
            </p>
          </div>
          <Separator className="my-3" />
          {soon.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay lotes urgentes.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {soon.map((p) => {
                const showOwner =
                  isAdmin && p.userId && user?.id && p.userId !== user.id;
                const ownerEmail = p.userId ? emails.get(p.userId) : null;
                return (
                  <li
                    key={p.id}
                    className="flex items-start justify-between gap-3 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{p.name}</p>
                      <p className="text-muted-foreground">
                        {p.brand} · {CATEGORY_LABEL[p.category]} · {p.quantity} u.
                      </p>
                      {showOwner && (
                        <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                          <User className="size-2.5" />
                          <span className="truncate max-w-[140px]">
                            {ownerEmail ?? "otro usuario"}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="text-right tabular shrink-0">
                      <p>{formatDate(p.expiresAt)}</p>
                      <p className="text-xs text-muted-foreground">
                        {daysLabel(p.expiresAt)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </section>

      <section className="mt-6 px-4 pb-4 no-print">
        <h2 className="mb-3 font-display text-xl font-medium">Historial</h2>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay movimientos.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {history.map((h) => (
              <li key={h.id} className="rounded-lg bg-card px-3 py-3 shadow-[var(--shadow-border)]">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-medium">{h.name}</p>
                  <p className="text-xs tabular text-muted-foreground">
                    {format(new Date(h.at), "d MMM HH:mm", { locale: es })}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground">
                  {ACTION_LABEL[h.action]} · {h.snapshot}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
