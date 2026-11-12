import { useMemo, useRef, useState } from "react";
import { Download, Printer, Share2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { PageHeader } from "@/components/page-header";
import { useSidebarStore } from "@/lib/vigia/sidebar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { daysLabel, formatDate, productStatus } from "@/lib/vigia/dates";
import { downloadCsv } from "@/lib/vigia/export";
import { expiryReportRows } from "@/lib/vigia/expiry-report";
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
  const setSidebarOpen = useSidebarStore((s) => s.setOpen);
  const soonWithin = Math.max(...settings.days, 30);
  const { user, isAdmin } = useSupabaseAuth();
  const { emails } = useUserEmails();

  const [preparing, setPreparing] = useState(false);
  const [ready, setReady] = useState<{ files: File[]; products: typeof products } | null>(null);
  const shareLock = useRef(false);
  const canShare = ready?.products === products ? ready.files : null;
  const ordered = useMemo(
    () => [...products].sort((a, b) => a.expiresAt.localeCompare(b.expiresAt)),
    [products],
  );

  async function sendImages(files: File[]) {
    if (navigator.share && navigator.canShare?.({ files })) {
      await navigator.share({ files, title: "Inventario completo · Vigía" });
      return;
    }
    for (const file of files) {
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
    toast.success(
      files.length === 1 ? "Imagen descargada" : `${files.length} imágenes descargadas`,
    );
  }

  async function shareReport() {
    if (shareLock.current || !products.length) return;
    shareLock.current = true;
    try {
      if (canShare) {
        await sendImages(canShare);
        return;
      }
      setPreparing(true);
      const { makeInventoryImages } = await import("@/lib/vigia/inventory-share");
      const now = new Date();
      const date = format(now, "d 'de' MMMM 'de' yyyy", { locale: es });
      const files = await makeInventoryImages({
        kind: "expiry",
        title: "Inventario completo",
        date: `${settings.storeName} · ${date}`,
        fileStem: `vigia-inventario-${format(now, "yyyy-MM-dd")}`,
        rows: expiryReportRows(ordered, soonWithin, now),
      });
      setReady({ files, products });
      await sendImages(files);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      if (error instanceof Error && error.name === "NotAllowedError") {
        toast.info("Imágenes listas. Tocá «Compartir imágenes» para enviarlas.");
        return;
      }
      toast.error("No se pudo preparar o compartir el reporte.");
    } finally {
      shareLock.current = false;
      setPreparing(false);
    }
  }

  return (
    <main>
      <PageHeader
        mood="thinking"
        onMenuClick={() => setSidebarOpen(true)}
        eyebrow="Papelería"
        title="Reportes"
        description="Compartí, exportá o imprimí todos los productos registrados."
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
        <Button
          variant="outline"
          size="lg"
          className="no-print"
          onClick={() => void shareReport()}
          disabled={preparing || !products.length}
        >
          <Share2 className="size-4" />
          {preparing ? "Preparando…" : canShare ? "Compartir imágenes" : "Compartir reporte"}
        </Button>
      </div>

      <section className="mt-8 px-4" id="print-area">
        <Card className="p-4">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-display text-xl font-medium">Inventario completo</h2>
            <p className="text-xs text-muted-foreground">
              {format(new Date(), "d MMM yyyy", { locale: es })}
            </p>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {products.length} registros ·{" "}
            {products.reduce((total, item) => total + item.quantity, 0)} unidades
          </p>
          <Separator className="my-3" />
          {ordered.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no hay productos registrados.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {ordered.map((p) => {
                const showOwner = isAdmin && p.userId && user?.id && p.userId !== user.id;
                const ownerEmail = p.userId ? emails.get(p.userId) : null;
                return (
                  <li key={p.id} className="flex items-start justify-between gap-3 text-sm">
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
                        {p.expiresAt
                          ? productStatus(p, soonWithin) === "ok"
                            ? "Vigente"
                            : daysLabel(p.expiresAt)
                          : "Sin fecha"}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </section>

      <section id="movimientos" className="mt-6 scroll-mt-4 px-4 pb-4 no-print">
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
