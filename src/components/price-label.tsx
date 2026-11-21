import { useState } from "react";
import { createPortal } from "react-dom";
import { Printer } from "lucide-react";
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

export function PrintPriceLabel({
  product,
  promotion,
}: {
  product: LookupResult;
  promotion: Promotion | null;
}) {
  const [open, setOpen] = useState(false);
  const [large, setLarge] = useState(false);
  const amount = promotion?.priceNow ?? product.priceC;

  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Agregá el precio al consumidor para imprimir la etiqueta.
      </p>
    );
  }

  const price = amount.toFixed(2);
  const label = (
    <article className="shelf-label" aria-label="Etiqueta de precio">
      <div className="shelf-label-content">
        <strong className="shelf-label-name">{product.name || product.barcode}</strong>
        {product.presentation && <p>{product.presentation}</p>}
        {promotion && (
          <p className="shelf-label-offer">
            Promoción{promotion.dynamic && ` · ${promotion.dynamic}`}
          </p>
        )}
        <p
          className="shelf-label-amount"
          style={{ fontSize: `min(27cqw, ${135 / (price.length + 1)}cqw)` }}
        >
          <span>C$</span> {price}
        </p>
        {promotion?.startDate && <p>Desde el {formatDate(promotion.startDate)}</p>}
        {promotion?.endDate && <p>Hasta el {formatDate(promotion.endDate)}</p>}
        <p className="shelf-label-code">Código {product.barcode}</p>
      </div>
    </article>
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="lg">
          <Printer />
          Imprimir precio
        </Button>
      </SheetTrigger>
      <SheetContent className="gap-4 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Imprimir precio</SheetTitle>
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
        <div className="rounded-lg bg-muted p-3">{label}</div>
        <Button
          size="lg"
          onClick={() => {
            try {
              window.print();
            } catch {
              toast.error("Abrí Vigía en el navegador para usar la impresión del dispositivo.");
            }
          }}
        >
          <Printer />
          Imprimir
        </Button>
      </SheetContent>
      {open &&
        createPortal(
          <div className="price-print-sheet" data-large={large}>
            {label}
          </div>,
          document.body,
        )}
    </Sheet>
  );
}
