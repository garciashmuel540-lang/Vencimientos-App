import { editPrices, readPrices } from "@/lib/vigia/price-input";
import { useRef, useState } from "react";
import { Pencil, Plus, RefreshCw, Tag } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { useSidebarStore } from "@/lib/vigia/sidebar";
import { makePriceLabel, PrintPriceLabels, type PriceLabelItem } from "@/components/price-label";
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
  const setSidebarOpen = useSidebarStore((s) => s.setOpen);
  const products = useVigiaStore((s) => s.products);
  const upsert = useVigiaStore((s) => s.upsertProduct);

  const [code, setCode] = useState<string | null>(null);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [inInventory, setInInventory] = useState<Product | null>(null);
  const [looking, setLooking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<ProductDraft | null>(null);
  const [savingPrice, setSavingPrice] = useState(false);
  const [editingPrice, setEditingPrice] = useState(false);
  const [priceForm, setPriceForm] = useState(() => editPrices({}));
  const [promotion, setPromotion] = useState<Promotion | null>(null);

  const [continuous, setContinuous] = useState(true);
  const [labels, setLabels] = useState<(PriceLabelItem & { order: number })[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const [pending, setPending] = useState(0);
  const pendingCodes = useRef(new Set<string>());
  const lookupVersion = useRef(0);
  const currentLabel = result && makePriceLabel(result, promotion);

  function recordLabel(
    product: LookupResult,
    promo: Promotion | null,
    add: boolean,
    order: number,
  ) {
    const item = makePriceLabel(product, promo);
    setLabels((previous) => {
      const existing = previous.find((row) => row.barcode === product.barcode);
      if (!item) return existing ? previous.filter((row) => row !== existing) : previous;
      if (existing) return previous.map((row) => (row === existing ? { ...row, ...item } : row));
      return add
        ? [...previous, { ...item, copies: 1, order }].sort((a, b) => a.order - b.order)
        : previous;
    });
    return item;
  }

  async function handleCode(c: string) {
    if (reviewing || adding || editingPrice || pendingCodes.current.has(c)) return;
    const version = ++lookupVersion.current;
    pendingCodes.current.add(c);
    setPending(pendingCodes.current.size);
    setPaused(!continuous);
    setLooking(true);
    setPromotion(null);
    setCode(c);
    setResult(null);
    setInInventory(null);

    try {
      const [r, promo] = await Promise.all([
        lookupProduct(c),
        useVigiaStore.getState().getActivePromotion(c),
      ]);
      const item = recordLabel(r, promo, continuous, version);
      if (continuous && !item)
        toast.message(`${r.name || c}: sin precio al consumidor para imprimir.`);
      if (version !== lookupVersion.current) return;
      setResult(r);

      const codeNorm = c.replace(/\s/g, "");
      const found =
        products.find((p) => p.barcode === codeNorm) ??
        products.find((p) => p.barcode.replace(/^0+/, "") === codeNorm.replace(/^0+/, "")) ??
        null;
      setInInventory(found);

      setPromotion(promo);
    } catch {
      if (version === lookupVersion.current) setPaused(false);
      toast.error(`No se pudo consultar ${c}. Volvé a escanearlo.`);
    } finally {
      pendingCodes.current.delete(c);
      setPending(pendingCodes.current.size);
      if (version === lookupVersion.current) setLooking(false);
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
      subcategory: r?.subcategory ?? "",
      location: r?.location ?? base.location,
      image: r?.image ?? base.image,
      source: r?.source ?? "manual",
    });
    setAdding(true);
  }

  return (
    <main>
      <PageHeader
        mood="thinking"
        onMenuClick={() => setSidebarOpen(true)}
        eyebrow="Cámara"
        title="Precios"
        description="Escaneá un código o escribilo para consultar e imprimir el precio."
      />

      <div className="px-4">
        {(continuous || labels.length > 0) && (
          <section
            className="neu-panel mb-4 grid gap-3 rounded-lg p-3"
            aria-label="Lista de impresión"
          >
            <div className="flex items-center justify-between gap-2">
              <div role="status" className="min-w-0">
                <h2 className="font-semibold">Lista de impresión</h2>
                <p className="text-sm text-muted-foreground">
                  {pending
                    ? "Consultando códigos…"
                    : labels.length
                      ? `${labels.length} ${labels.length === 1 ? "producto listo" : "productos listos"}`
                      : "Escaneá los productos que querés imprimir."}
                </p>
              </div>
              {labels.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending > 0}
                  onClick={() => setLabels([])}
                >
                  Vaciar lista
                </Button>
              )}
            </div>
            <PrintPriceLabels
              items={labels}
              pending={pending > 0}
              onOpenChange={setReviewing}
              onCopies={(barcode, copies) =>
                setLabels((rows) =>
                  copies
                    ? rows.map((row) => (row.barcode === barcode ? { ...row, copies } : row))
                    : rows.filter((row) => row.barcode !== barcode),
                )
              }
            />
          </section>
        )}
        <Scanner
          onDetect={(c) => void handleCode(c)}
          paused={paused || reviewing || adding || editingPrice}
          continuous={continuous}
          onContinuousChange={(enabled) => {
            setContinuous(enabled);
            setPaused(false);
          }}
        />
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
                  <div className="mt-5 rounded-lg neu-well bg-warn-soft p-4">
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
                    {promotion.startDate || promotion.endDate ? (
                      <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                        📅 Vigente:{" "}
                        {promotion.startDate
                          ? formatDate(promotion.startDate)
                          : "hoy"}{" "}
                        →{" "}
                        {promotion.endDate
                          ? formatDate(promotion.endDate)
                          : "hasta agotar"}
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
                    Precio al consumidor
                  </p>
                  <p className="font-display text-3xl font-semibold text-primary">
                    {fmtPrice(result.priceC)}
                  </p>
                  {typeof result.price === "number" && result.priceC !== result.price ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Precio interno (sin IVA): {fmtPrice(result.price)}
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
                  {!continuous && currentLabel && (
                    <PrintPriceLabels items={[{ ...currentLabel, copies: 1 }]} onOpenChange={setReviewing} />
                  )}
                  {!currentLabel && (
                    <p className="text-sm text-muted-foreground">Agregá el precio al consumidor para imprimir la etiqueta.</p>
                  )}
                  <Button
                    size="lg"
                    variant="secondary"
                    onClick={() => {
                      setPriceForm(editPrices(result));
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
                scanPlacement
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
              <Label htmlFor="price-edit">Precio interno (sin IVA)</Label>
              <Input
                id="price-edit"
                type="text"
                inputMode="decimal"
                value={priceForm.price}
                onChange={(e) =>
                  setPriceForm({ ...priceForm, price: e.target.value })
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="priceC-edit">Precio al consumidor (con IVA)</Label>
              <Input
                id="priceC-edit"
                type="text"
                inputMode="decimal"
                value={priceForm.priceC}
                onChange={(e) =>
                  setPriceForm({ ...priceForm, priceC: e.target.value })
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cost-edit">Costo interno (C$)</Label>
              <Input
                id="cost-edit"
                type="text"
                inputMode="decimal"
                value={priceForm.cost}
                onChange={(e) =>
                  setPriceForm({ ...priceForm, cost: e.target.value })
                }
              />
            </div>
            <div className="mt-2 flex flex-col gap-2">
              <Button
                size="lg"
                disabled={savingPrice}
                onClick={async () => {
                  if (!result || savingPrice) return;
                  setSavingPrice(true);
                  try {
                    const values = readPrices(priceForm);
                    await useVigiaStore.getState().updatePrices(result.barcode, values, {
                      name: result.name,
                      brand: result.brand,
                      category: result.category,
                      presentation: result.presentation,
                    });
                    const updated = { ...result, ...values };
                    recordLabel(updated, promotion, continuous, lookupVersion.current);
                    setResult(updated);
                    setEditingPrice(false);
                    toast.success("Precio actualizado");
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "No se pudo guardar el precio.");
                  } finally {
                    setSavingPrice(false);
                  }
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
