import { useState } from "react";
import { Pencil, Plus, RefreshCw, Tag } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Scanner } from "@/components/scanner";
import { ProductForm, emptyDraft } from "@/components/product-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import type { LookupResult, Product, Promotion } from "@/lib/vigia/types";
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
  const [editingPrice, setEditingPrice] = useState(false);
  const [priceForm, setPriceForm] = useState({ price: 0, priceC: 0, cost: 0 });
  const [promotion, setPromotion] = useState<Promotion | null>(null);

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

      const promo = await useVigiaStore.getState().getActivePromotion(c);
      setPromotion(promo);
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
    setPromotion(null);
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

                {promotion ? (
                  <div className="mt-5 rounded-lg bg-gradient-to-br from-amber-50 to-orange-100 p-4 dark:from-amber-950/40 dark:to-orange-950/40">
                    <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                      🎉 Promoción activa
                    </p>
                    <p className="mt-1 font-display text-4xl font-semibold text-amber-900 dark:text-amber-200">
                      {fmtPrice(promotion.priceNow)}
                    </p>
                    {promotion.priceBefore > 0 &&
                    promotion.priceBefore !== promotion.priceNow ? (
                      <p className="text-sm text-amber-700 dark:text-amber-400">
                        Antes:{" "}
                        <span className="line-through">
                          {fmtPrice(promotion.priceBefore)}
                        </span>
                      </p>
                    ) : null}
                    {promotion.dynamic ? (
                      <p className="mt-2 inline-block rounded-full bg-amber-200/70 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-700/40 dark:text-amber-100">
                        {promotion.dynamic}
                      </p>
                    ) : null}
                    {promotion.endDate ? (
                      <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                        Válido hasta {formatDate(promotion.endDate)}
                      </p>
                    ) : null}
                    {promotion.subcategory ? (
                      <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                        {promotion.subcategory}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <div className="mt-5 rounded-lg bg-primary/10 px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {promotion ? "Precio normal" : "Precio de venta"}
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
                  <Button
                    size="lg"
                    variant="secondary"
                    onClick={() => {
                      setPriceForm({
                        price: result.price ?? 0,
                        priceC: result.priceC ?? 0,
                        cost: result.cost ?? 0,
                      });
                      setEditingPrice(true);
                    }}
                  >
                    <Pencil className="size-4" />
                    Actualizar precio
                  </Button>
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
                showPrices={true}
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

      <Sheet
        open={editingPrice}
        onOpenChange={(v) => {
          if (!v) setEditingPrice(false);
        }}
      >
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Actualizar precio</SheetTitle>
            <SheetDescription>
              {result?.name ?? "Producto"}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-5 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="price-edit">Precio de venta (C$)</Label>
              <Input
                id="price-edit"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={priceForm.price}
                onChange={(e) =>
                  setPriceForm((p) => ({ ...p, price: Number(e.target.value) }))
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="priceC-edit">Precio C / mayoreo (C$)</Label>
              <Input
                id="priceC-edit"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={priceForm.priceC}
                onChange={(e) =>
                  setPriceForm((p) => ({ ...p, priceC: Number(e.target.value) }))
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cost-edit">Costo interno (C$)</Label>
              <Input
                id="cost-edit"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={priceForm.cost}
                onChange={(e) =>
                  setPriceForm((p) => ({ ...p, cost: Number(e.target.value) }))
                }
              />
            </div>
            <div className="mt-2 flex flex-col gap-2">
              <Button
                size="lg"
                onClick={async () => {
                  if (!result) return;
                  await useVigiaStore.getState().updatePrices(
                    result.barcode,
                    priceForm,
                    {
                      name: result.name,
                      brand: result.brand,
                      category: result.category,
                      presentation: result.presentation,
                    },
                  );
                  toast.success("Precio actualizado");
                  setEditingPrice(false);
                  const fresh = await lookupProduct(result.barcode);
                  setResult(fresh);
                }}
              >
                Guardar precio
              </Button>
              <Button
                variant="ghost"
                size="lg"
                onClick={() => setEditingPrice(false)}
              >
                Cancelar
              </Button>
            </div>
          </div>
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
