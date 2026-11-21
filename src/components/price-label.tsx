import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import JsBarcode from "jsbarcode";
import { Minus, Plus, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { formatDate } from "@/lib/vigia/dates";
import type { LookupResult, Promotion } from "@/lib/vigia/types";

export function makePriceLabel(product: LookupResult, promotion: Promotion | null) {
  const amount = promotion?.priceNow ?? product.priceC;
  if (!product.found || typeof amount !== "number" || !Number.isFinite(amount) || amount < 0)
    return null;
  const { barcode, name, brand, presentation } = product;
  return { barcode, name, brand, presentation, amount, promotion };
}

export type PriceLabelItem = NonNullable<ReturnType<typeof makePriceLabel>> & { copies: number };

function ShelfLabel({ item }: { item: PriceLabelItem }) {
  const { barcode, name, brand, presentation, amount, promotion } = item;
  const price = amount.toFixed(2);
  const drawBarcode = useCallback(
    (svg: SVGSVGElement | null) => {
      if (!svg) return;
      JsBarcode(svg, barcode, {
        format: "CODE128",
        width: 2,
        height: 42,
        margin: 0,
        marginLeft: 24,
        marginRight: 24,
        displayValue: false,
      });
    },
    [barcode],
  );

  return (
    <article className="shelf-label" aria-label="Etiqueta de precio">
      <div className="shelf-label-content">
        <strong className="shelf-label-name">
          {name || barcode}
          {presentation &&
            !name?.toLowerCase().includes(presentation.toLowerCase()) &&
            ` · ${presentation}`}
        </strong>
        <div className="shelf-label-meta">
          <span>{brand}</span>
          <span>{barcode}</span>
        </div>
        {/^[ -~]+$/.test(barcode) && (
          <svg
            className="shelf-barcode"
            ref={drawBarcode}
            role="img"
            aria-label={`Código de barras ${barcode}`}
            preserveAspectRatio="none"
          />
        )}
        {promotion && (
          <p className="shelf-label-offer">
            Promoción{promotion.dynamic && ` · ${promotion.dynamic}`}
          </p>
        )}
        {promotion?.startDate && <p>Desde el {formatDate(promotion.startDate)}</p>}
        {promotion?.endDate && <p>Hasta el {formatDate(promotion.endDate)}</p>}
        <p
          className="shelf-label-amount"
          style={{ fontSize: `min(35cqw, ${168 / (price.length + 0.8)}cqw)` }}
        >
          <span>C$</span> {price}
        </p>
      </div>
    </article>
  );
}

export function PrintPriceLabels({
  items,
  pending = false,
  onCopies,
  onOpenChange,
}: {
  items: PriceLabelItem[];
  pending?: boolean;
  onCopies?: (barcode: string, copies: number) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [large, setLarge] = useState(false);
  const count = items.reduce((total, item) => total + item.copies, 0);
  const title = onCopies ? `Revisar e imprimir (${count})` : "Imprimir precio";

  function changeOpen(value: boolean) {
    setOpen(value);
    onOpenChange(value);
  }

  return (
    <Sheet open={open} onOpenChange={changeOpen}>
      <SheetTrigger asChild>
        <Button size="lg" disabled={!count || pending}>
          <Printer />
          {title}
        </Button>
      </SheetTrigger>
      <SheetContent className="gap-4 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{onCopies ? "Etiquetas para imprimir" : title}</SheetTitle>
          <SheetDescription>
            Conectá el celular y la impresora a la misma red Wi-Fi. Al imprimir, elegí tu impresora
            en la lista.
          </SheetDescription>
        </SheetHeader>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Tamaño de impresión
          <select
            className="h-11 rounded-md border bg-card px-3"
            value={large ? "sign" : "shelf"}
            onChange={(e) => setLarge(e.target.value === "sign")}
          >
            <option value="shelf">Etiqueta de estante · 9 cm de ancho</option>
            <option value="sign">Cartel grande · 17 cm de ancho</option>
          </select>
        </label>
        {items.map((item) => (
          <div key={item.barcode} className="rounded-lg bg-muted p-3">
            <ShelfLabel item={item} />
            {onCopies && (
              <div className="mt-2 flex items-center gap-2">
                <Button
                  size="icon"
                  variant="outline"
                  disabled={item.copies <= 1}
                  aria-label={`Menos copias de ${item.name}`}
                  onClick={() => onCopies(item.barcode, item.copies - 1)}
                >
                  <Minus />
                </Button>
                <span className="text-sm">
                  {item.copies} {item.copies === 1 ? "copia" : "copias"}
                </span>
                <Button
                  size="icon"
                  variant="outline"
                  aria-label={`Más copias de ${item.name}`}
                  onClick={() => onCopies(item.barcode, item.copies + 1)}
                >
                  <Plus />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="ml-auto"
                  aria-label={`Quitar ${item.name}`}
                  onClick={() => {
                    if (items.length === 1) changeOpen(false);
                    onCopies(item.barcode, 0);
                  }}
                >
                  <Trash2 />
                </Button>
              </div>
            )}
          </div>
        ))}
        <Button
          size="lg"
          className="sticky bottom-0 shrink-0"
          disabled={!count || pending}
          onClick={() => {
            try {
              window.print();
            } catch {
              toast.error("Abrí Vigía en el navegador para usar la impresión del dispositivo.");
            }
          }}
        >
          <Printer />
          {onCopies ? `Imprimir ${count} ${count === 1 ? "etiqueta" : "etiquetas"}` : "Imprimir"}
        </Button>
      </SheetContent>
      {open &&
        createPortal(
          <div className="price-print-sheet" data-large={large}>
            {items.flatMap((item) =>
              Array.from({ length: item.copies }, (_, i) => (
                <ShelfLabel key={`${item.barcode}-${i}`} item={item} />
              )),
            )}
          </div>,
          document.body,
        )}
    </Sheet>
  );
}
