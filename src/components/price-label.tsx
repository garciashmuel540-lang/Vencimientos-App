import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import JsBarcode from "jsbarcode";
import { ArrowLeft, Download, Minus, Plus, Printer, Share2, Trash2 } from "lucide-react";
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

function ShelfLabel({ item, large }: { item: PriceLabelItem; large: boolean }) {
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
    <article data-compact={!large} className="shelf-label" aria-label="Etiqueta de precio">
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
          style={{ fontSize: `min(var(--price-cap, 35cqw), ${168 / (price.length + 0.8)}cqw)` }}
        >
          <span>C$</span> {price}
        </p>
      </div>
    </article>
  );
}

type PrintJob = { items: PriceLabelItem[]; large: boolean };

function PrintDestinations({ job, onBack }: { job: PrintJob; onBack: () => void }) {
  const source = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<{ file: File; url: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let url: string | undefined;
    const elements = Array.from(source.current!.querySelectorAll<HTMLElement>(".shelf-label"));
    const labels = job.items.map((item, i) => ({ element: elements[i], copies: item.copies }));
    async function preparePdf() {
      try {
        const { createPriceLabelPdf } = await import("@/lib/vigia/price-label-pdf");
        const file = await createPriceLabelPdf(labels, job.large, controller.signal);
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(file);
        setPdf({ file, url });
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      }
    }
    void preparePdf();
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [job, attempt]);

  const canShare =
    pdf && typeof navigator.share === "function" && navigator.canShare?.({ files: [pdf.file] });

  async function chooseApp() {
    if (!pdf || !canShare || sharing) return;
    try {
      setSharing(true);
      await navigator.share({ files: [pdf.file] });
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) {
        toast.error("Podés descargar el PDF y abrirlo desde tu app de impresión.");
      }
    } finally {
      setSharing(false);
    }
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>Elegí cómo imprimir</SheetTitle>
        <SheetDescription>
          Usá el servicio de impresión del teléfono o abrí las etiquetas en otra aplicación.
        </SheetDescription>
      </SheetHeader>
      <Button
        size="lg"
        onClick={() => {
          try {
            window.print();
          } catch {
            toast.error("Probá con otra app de impresión o descargá el PDF.");
          }
        }}
      >
        <Printer />
        Elegir impresora
      </Button>
      <p className="text-sm text-muted-foreground">
        En la vista de impresión, tocá el nombre de la impresora para ver las disponibles.
      </p>
      <Button size="lg" variant="secondary" disabled={!canShare || sharing} onClick={chooseApp}>
        <Share2 />
        Elegir otra app
      </Button>
      {pdf && !canShare && (
        <p className="text-sm text-muted-foreground">
          Para usar otra app en este navegador, descargá el PDF y abrilo desde esa aplicación.
        </p>
      )}
      {pdf && (
        <Button asChild size="lg" variant="outline">
          <a href={pdf.url} download={pdf.file.name}>
            <Download />
            Descargar PDF
          </a>
        </Button>
      )}
      {!pdf &&
        (failed ? (
          <>
            <p role="alert" className="text-sm">
              No se pudo preparar el PDF.
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setFailed(false);
                setAttempt((n) => n + 1);
              }}
            >
              Reintentar PDF
            </Button>
          </>
        ) : (
          <p role="status" className="text-sm text-muted-foreground">
            Preparando PDF…
          </p>
        ))}
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeft />
        Volver a las etiquetas
      </Button>
      <div
        ref={source}
        aria-hidden="true"
        className="price-pdf-source"
        style={{ width: job.large ? "170mm" : "40mm" }}
      >
        {job.items.map((item) => (
          <ShelfLabel large={job.large} key={item.barcode} item={item} />
        ))}
      </div>
    </>
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
  const [job, setJob] = useState<PrintJob | null>(null);
  const count = items.reduce((total, item) => total + item.copies, 0);
  const title = onCopies ? `Revisar e imprimir (${count})` : "Imprimir precio";

  function changeOpen(value: boolean) {
    if (!value) setJob(null);
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
        {job ? (
          <PrintDestinations job={job} onBack={() => setJob(null)} />
        ) : (
          <>
            <SheetHeader>
              <SheetTitle>{onCopies ? "Etiquetas para imprimir" : title}</SheetTitle>
              <SheetDescription>
                Revisá las etiquetas antes de elegir una impresora o una app de impresión.
              </SheetDescription>
            </SheetHeader>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Tamaño de impresión
              <select
                className="h-11 rounded-md border bg-card px-3"
                value={large ? "sign" : "shelf"}
                onChange={(e) => setLarge(e.target.value === "sign")}
              >
                <option value="shelf">Etiqueta compacta · 4 × 3 cm</option>
                <option value="sign">Cartel grande · 17 cm de ancho</option>
              </select>
            </label>
            {!large && <p className="text-sm text-muted-foreground">Hasta 32 etiquetas por hoja A4 a escala 100 %.</p>}
            {items.map((item) => (
              <div key={item.barcode} className="rounded-lg bg-muted p-3">
                <ShelfLabel large={large} item={item} />
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
              onClick={() => setJob({ items, large })}
            >
              <Printer />
              {onCopies
                ? `Imprimir ${count} ${count === 1 ? "etiqueta" : "etiquetas"}`
                : "Imprimir"}
            </Button>
          </>
        )}
      </SheetContent>
      {open &&
        createPortal(
          <div className="price-print-sheet" data-large={job?.large ?? large}>
            {(job?.items ?? items).flatMap((item) =>
              Array.from({ length: item.copies }, (_, i) => (
                <ShelfLabel large={job?.large ?? large} key={`${item.barcode}-${i}`} item={item} />
              )),
            )}
          </div>,
          document.body,
        )}
    </Sheet>
  );
}
