import { useState } from "react";
import { Plus, RefreshCw, Tag } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Scanner } from "@/components/scanner";
import { ProductForm, emptyDraft } from "@/components/product-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { lookupProduct } from "@/lib/vigia/lookup";
import { useVigiaStore } from "@/lib/vigia/store";
import type { ProductDraft } from "@/lib/vigia/store";
import { daysLabel, formatDate, productStatus } from "@/lib/vigia/dates";
import type { LookupResult, Product } from "@/lib/vigia/types";
import { CATEGORY_LABEL, LOCATION_LABEL } from "@/lib/vigia/types";

function fmtPrice(n?: number): string {
  if (typeof n !== "number" || Number.isNaN(n)) return "—";
  return `C$ ${n.toFixed(2)}`;
}

export function PriceCheckPage() {
  const products = useVigiaStore((s) => s.products);
  const upsert = useVigiaStore((s) => s.upsertProduct);

  const [code, setCode] = useState<string | null>(null);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [inInventory, setInInventory] = useState<Product | null>(null);
  const [looking, setLooking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<ProductDraft | null>(null);

  async function handleCode(c: string) {
    setPaused(true);
    setLooking(true);
    setCode(c);
    setResult(null);
    setInInventory(null);

    try {
      const r = await lookupProduct(c);
      setResult(r);

      const codeNorm = c.replace(/\s/g, "");
      const found =
        products.find((p) => p.barcode === codeNorm) ??
        products.find((p) => p.barcode.replace(/^0+/, "") === codeNorm.replace(/^0+/, "")) ??
        null;
      setInInventory(found);
    } catch {
      toast.error("No se pudo consultar el código. Intenta de nuevo.");
    } finally {
      setLooking(false);
    }
  }

  function reset() {
    setCode(null);
    setResult(null);
    setInInventory(null);
    setPaused(false);
    setDraft(null);
  }

  function startAdd() {
    const base = emptyDraft(code ?? "");
    const r = result;
    setDraft({
      ...base,
      barcode: code ?? base.barcode,
      name: r?.name ?? base.name,
      brand: r?.brand ?? base.brand,
      presentation: r?.presentation ?? base.presentation,
      category: r?.category ?? base.category,
      image: r?.image ?? base.image,
      source: r?.source ?? "manual",
    });
    setAdding(true);
  }

  return (
    <main>
      <PageHeader
        eyebrow="Cámara"
        title="Precios"
        description="Escanea un código para ver la información y el precio."
      />

      <div className="px-4">
        <Scanner onDetect={(c) => void handleCode(c)} paused={paused} />
      </div>

      {looking ? (
        <p className="mt-6 px-4 text-sm text-muted-foreground">Consultando…</p>
      ) : null}

      {!looking && result ? (
        <section className="mt-6 px-4 pb-6">
          <Card className="p-5">
            {result.found ? (
              <>
                <div className="flex items-start gap-3">
                  {result.image ? (
                    <img
                      src={result.image}
                      alt=""
                      className="size-16 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="flex size-16 items-center justify-center rounded-lg bg-muted">
                      <Tag className="size-6 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-lg font-medium leading-tight">
                      {result.name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {[result.brand, result.presentation].filter(Boolean).join(" · ") ||
                        "Sin marca"}
                    </p>
                  </div>
                </div>

                <div className="mt-5 rounded-lg bg-primary/10 px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Precio de venta
                  </p>
                  <p className="font-display text-3xl font-semibold text-primary">
                    {fmtPrice(result.price ?? result.priceC)}
                  </p>
                  {result.priceC && result.price !== result.priceC ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Precio C: {fmtPrice(result.priceC)}
                    </p>
                  ) : null}
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  {result.department ? (
                    <Info label="Departamento" value={result.department} />
                  ) : null}
                  {result.category ? (
                    <Info label="Categoría" value={CATEGORY_LABEL[result.category]} />
                  ) : null}
                  {result.supplier ? (
                    <Info label="Proveedor" value={result.supplier} />
                  ) : null}
                  {typeof result.cost === "number" ? (
                    <Info label="Costo" value={fmtPrice(result.cost)} />
                  ) : null}
                  {typeof result.qtySnapshot === "number" ? (
                    <Info label="Sistema (histórico)" value={`${result.qtySnapshot} u.`} />
                  ) : null}
                  <Info label="Código" value={result.barcode} />
                </dl>

                {inInventory ? (
                  <div className="mt-5 rounded-lg bg-ok/10 px-4 py-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-ok">
                      En tu inventario Vigía
                    </p>
                    <p className="mt-1 text-sm">
                      <strong>{inInventory.quantity} unidades</strong> ·{" "}
                      {formatDate(inInventory.expiresAt)} ·{" "}
                      {daysLabel(inInventory.expiresAt)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Ubicación: {LOCATION_LABEL[inInventory.location]} ·{" "}
                      Estado: {productStatus(inInventory, 30)}
                    </p>
                  </div>
                ) : (
                  <div className="mt-5 rounded-lg bg-warn-soft px-4 py-3">
                    <p className="text-sm text-warn">
                      Este producto no está registrado en tu inventario Vigía.
                    </p>
                  </div>
                )}

                <div className="mt-5 flex flex-col gap-2">
                  {!inInventory ? (
                    <Button size="lg" onClick={startAdd}>
                      <Plus className="size-4" />
                      Agregar a mi inventario
                    </Button>
                  ) : null}
                  <Button variant="outline" size="lg" onClick={reset}>
                    <RefreshCw className="size-4" />
                    Escanear otro
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="font-display text-lg font-medium">
                  No está en el catálogo
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Código: <strong>{result.barcode}</strong>. Puedes registrarlo
                  manualmente.
                </p>
                <div className="mt-5 flex flex-col gap-2">
                  <Button size="lg" onClick={startAdd}>
                    <Plus className="size-4" />
                    Registrar producto
                  </Button>
                  <Button variant="outline" size="lg" onClick={reset}>
                    <RefreshCw className="size-4" />
                    Escanear otro
                  </Button>
                </div>
              </>
            )}
          </Card>
        </section>
      ) : null}

      <Sheet
        open={adding}
        onOpenChange={(v) => {
          if (!v) setDraft(null);
          setAdding(v);
        }}
      >
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Agregar producto</SheetTitle>
            <SheetDescription>
              Completa los datos para agregarlo a tu inventario.
            </SheetDescription>
          </SheetHeader>
          {draft ? (
            <div className="mt-4">
              <ProductForm
                initial={draft}
                submitLabel="Guardar en inventario"
                onCancel={() => {
                  setDraft(null);
                  setAdding(false);
                }}
                onSubmit={async (next) => {
                  await upsert(next);
                  toast.success("Producto agregado al inventario");
                  setDraft(null);
                  setAdding(false);
                  reset();
                }}
              />
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
