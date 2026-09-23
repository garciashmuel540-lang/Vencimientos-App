import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, PackageCheck, ScanBarcode, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ProductCard } from "@/components/product-card";
import { ProductSheet } from "@/components/product-sheet";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { productStatus } from "@/lib/vigia/dates";
import { computeAlerts } from "@/lib/vigia/notifications";
import { useVigiaStore } from "@/lib/vigia/store";
import type { Product } from "@/lib/vigia/types";
import { cn } from "@/lib/utils";

export function DashboardPage() {
  const products = useVigiaStore((s) => s.products);
  const settings = useVigiaStore((s) => s.settings);
  const demo = useVigiaStore((s) => s.demo);
  const soonWithin = Math.max(...settings.days, 30);
  const [selected, setSelected] = useState<Product | null>(null);

  const stats = useMemo(() => {
    const live = products.filter((p) => p.quantity > 0);
    let ok = 0;
    let soon = 0;
    let expired = 0;
    let units = 0;
    for (const p of live) {
      units += p.quantity;
      const st = productStatus(p, soonWithin);
      if (st === "ok") ok += 1;
      else if (st === "soon") soon += 1;
      else expired += 1;
    }
    return { ok, soon, expired, total: live.length, units };
  }, [products, soonWithin]);

  const alerts = useMemo(
    () => computeAlerts(products, settings),
    [products, settings],
  );
  const urgent = products
    .filter((p) => {
      const st = productStatus(p, soonWithin);
      return st !== "ok";
    })
    .slice(0, 8);

  const headline =
    stats.expired > 0
      ? `Hoy hay ${stats.expired} producto${stats.expired === 1 ? "" : "s"} vencido${stats.expired === 1 ? "" : "s"}`
      : stats.soon > 0
        ? `${stats.soon} producto${stats.soon === 1 ? "" : "s"} por revisar esta quincena`
        : "Todo el inventario está vigente";

  return (
    <main>
      <PageHeader
        eyebrow={settings.storeName}
        title="Vigía"
        description={headline}
        action={
          <Link
            to="/escanear"
            className="inline-flex size-11 items-center justify-center rounded-md bg-primary text-primary-foreground"
            aria-label="Escanear producto"
          >
            <ScanBarcode className="size-5" />
          </Link>
        }
      />

      {demo ? (
        <p className="mx-4 mb-4 rounded-md bg-accent px-3 py-2 text-sm text-accent-foreground">
          Estás viendo una tienda de ejemplo. Puedes vaciarla o seguir practicando.
        </p>
      ) : null}

      {alerts.length > 0 ? (
        <div className="mx-4 mb-4 flex items-start gap-3 rounded-lg bg-bad-soft px-3 py-3 text-sm text-bad">
          <Bell className="mt-0.5 size-4 shrink-0" />
          <p>
            {alerts.filter((a) => a.level === "expired").length} vencidos y{" "}
            {alerts.filter((a) => a.level !== "expired").length} por vencer. Revisa la
            lista de abajo o abre Reportes.
          </p>
        </div>
      ) : null}

      <section className="grid grid-cols-2 gap-3 px-4">
        <Stat
          label="Vigentes"
          value={stats.ok}
          tone="ok"
          delay="vigia-enter-delay-1"
        />
        <Stat
          label="Por vencer"
          value={stats.soon}
          tone="soon"
          delay="vigia-enter-delay-2"
        />
        <Stat
          label="Vencidos"
          value={stats.expired}
          tone="expired"
          delay="vigia-enter-delay-3"
        />
        <Stat
          label="En inventario"
          value={stats.total}
          hint={`${stats.units} unidades`}
          tone="neutral"
          delay="vigia-enter-delay-4"
        />
      </section>

      <section className="mt-8 px-4">
        <div className="mb-3 flex items-end justify-between">
          <h2 className="font-display text-xl font-medium">Lo urgente</h2>
          <Link to="/inventario" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
            Ver todo
          </Link>
        </div>
        {urgent.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 p-8 text-center">
            <PackageCheck className="size-8 text-ok" />
            <p className="font-medium">Nada urgente hoy</p>
            <p className="text-sm text-muted-foreground">
              Cuando un producto se acerque a su fecha, aparecerá aquí.
            </p>
            <Button asChild>
              <Link to="/escanear">Registrar producto</Link>
            </Button>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {urgent.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                soonWithin={soonWithin}
                onClick={() => setSelected(p)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="mt-8 px-4">
        <Card className="flex items-start gap-3 p-4">
          <TriangleAlert className="mt-0.5 size-5 text-warn" />
          <div>
            <p className="font-medium">Consejo rápido</p>
            <p className="text-sm text-muted-foreground">
              Escanea al recibir mercadería y anota la fecha del empaque. Toma menos
              de quince segundos por producto.
            </p>
          </div>
        </Card>
      </section>

      <ProductSheet
        product={selected}
        open={Boolean(selected)}
        onOpenChange={(o) => !o && setSelected(null)}
      />
    </main>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
  delay,
}: {
  label: string;
  value: number;
  hint?: string;
  tone: "ok" | "soon" | "expired" | "neutral";
  delay: string;
}) {
  const toneClass =
    tone === "ok"
      ? "text-ok"
      : tone === "soon"
        ? "text-warn"
        : tone === "expired"
          ? "text-bad"
          : "text-foreground";
  return (
    <Card className={cn("vigia-enter p-4", delay)}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={cn("mt-2 font-display text-4xl tabular leading-none", toneClass)}>
        {value}
      </p>
      {hint ? <p className="mt-2 text-xs text-muted-foreground">{hint}</p> : null}
    </Card>
  );
}
