import type { CSSProperties, ReactElement } from "react";
import { fitShelfSheet, defaultShelfSize, isShelfSize, shelfGrid, shelfLimits, type ShelfSize } from "@/lib/vigia/shelf-size";
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

function ShelfLabel({ item, large, size }: { item: PriceLabelItem; large: boolean; size: ShelfSize }) {
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

  const details = [brand, presentation]
    .filter((value) => value && !name?.toLowerCase().includes(value.toLowerCase()))
    .join(" · ");
  const dimensions = large ? undefined : {
    width: `${size.width}mm`,
    height: `${size.height}mm`,
    "--label-unit": `${Math.min(size.width, size.height * 40 / 24) / 100}mm`,
  } as CSSProperties;

  return (
    <article className="shelf-label" style={dimensions} data-compact={!large} aria-label="Etiqueta de precio">
      <div className="shelf-label-content">
        <div className="shelf-label-info">
          <div className="shelf-label-name">{name || barcode}</div>
          {details && <div className="shelf-label-detail">{details}</div>}
          {promotion && (
            <div className="shelf-label-promotion">
              <strong>Promoción{promotion.dynamic && ` · ${promotion.dynamic}`}</strong>
              {promotion.startDate && <div>Desde el {formatDate(promotion.startDate)}</div>}
              {promotion.endDate && <div>Hasta el {formatDate(promotion.endDate)}</div>}
            </div>
          )}
          <div className="shelf-label-code">
            {/^[ -~]+$/.test(barcode) && (
              <svg className="shelf-barcode" ref={drawBarcode} aria-hidden="true" preserveAspectRatio="none" />
            )}
            <div>{barcode}</div>
          </div>
        </div>
        <div className="shelf-label-price">
          <svg viewBox={`0 0 ${35 + price.length * 25} 58`} role="img" aria-label={`Precio C$ ${price}`}>
            <text x="0" y="45" fontSize="54" fontWeight="700" textLength={35 + price.length * 25} lengthAdjust="spacingAndGlyphs">
              <tspan fontSize="31" dy="-8">C$</tspan><tspan dy="8">{price}</tspan>
            </text>
          </svg>
        </div>
      </div>
    </article>
  );
}

type PrintJob = { items: PriceLabelItem[]; large: boolean; size: ShelfSize };

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
        const file = await createPriceLabelPdf(labels, job.large, job.size, controller.signal);
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
        style={{ width: job.large ? "170mm" : `${job.size.width}mm` }}
      >
        {job.items.map((item) => (
          <ShelfLabel size={job.size} large={job.large} key={item.barcode} item={item} />
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
  const [manualSize, setSize] = useState(defaultShelfSize);
  const [autoFit, setAutoFit] = useState(true);
  useEffect(() => {
    if (!open) return;
    try {
      setAutoFit(localStorage.getItem("vigia.labelLayout") !== "manual");
      const saved: unknown = JSON.parse(localStorage.getItem("vigia.shelfSize") ?? "null");
      if (isShelfSize(saved)) setSize(saved);
    } catch { /* Usar la medida inicial si el almacenamiento está bloqueado. */ }
  }, [open]);

  function changeSize(next: ShelfSize) {
    setSize(next);
    try { localStorage.setItem("vigia.shelfSize", JSON.stringify(next)); } catch { /* Solo esta sesión. */ }
  }

  const count = items.reduce((total, item) => total + item.copies, 0);
  const size = autoFit ? fitShelfSheet(count) : manualSize;
  const grid = shelfGrid(job?.size ?? size);
  const title = onCopies ? `Revisar e imprimir (${count})` : "Imprimir precio";

  const printPages: ReactElement[][] = [];
  if (open) {
    const printLarge = job?.large ?? large;
    for (const item of job?.items ?? items) {
      for (let copy = 0; copy < item.copies; copy++) {
        let page = printPages[printPages.length - 1];
        if (!page || (!printLarge && page.length === grid.perPage)) {
          page = [];
          printPages.push(page);
        }
        page.push(<ShelfLabel key={`${item.barcode}-${copy}`} item={item} large={printLarge} size={job?.size ?? size} />);
      }
    }
  }

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
                <option value="shelf">Etiqueta de estante ajustable</option>
                <option value="sign">Cartel grande · 17 cm de ancho</option>
              </select>
            </label>
            {!large && (
              <div className="grid gap-3">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={autoFit} onChange={(event) => {
                    const enabled = event.target.checked;
                    setAutoFit(enabled);
                    try { localStorage.setItem("vigia.labelLayout", enabled ? "auto" : "manual"); } catch { /* Solo esta sesión. */ }
                  }} />
                  Ajustar automáticamente a hoja Carta
                </label>
                {autoFit && <p className="text-sm">3 columnas · {(size.width / 10).toLocaleString("es-NI")} × {(size.height / 10).toLocaleString("es-NI")} cm</p>}
                {!autoFit && (["width", "height"] as const).map((axis) => (
                  <label key={axis} className="grid gap-1 text-sm">
                    {axis === "width" ? "Ancho" : "Alto"} · {(size[axis] / 10).toLocaleString("es-NI")} cm
                    <input type="range" min={shelfLimits[axis][0]} max={shelfLimits[axis][1]}
                      step={1} value={size[axis]}
                      onChange={(e) => changeSize({ ...size, [axis]: Number(e.target.value) })} />
                  </label>
                ))}
                <p className="text-sm text-muted-foreground">Hasta {grid.perPage} etiquetas por hoja Carta al 100 %.</p>
                {!autoFit && <Button variant="ghost" onClick={() => changeSize(defaultShelfSize)}>Restablecer 4 × 2,4 cm</Button>}
              </div>
            )}
            {items.map((item) => (
              <div key={item.barcode} className="overflow-x-auto rounded-lg bg-muted p-3">
                <ShelfLabel size={size} large={large} item={item} />
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
              onClick={() => setJob({ items, large, size })}
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
            {printPages.map((page, index) => (
              <div key={index} className="price-print-page" style={{ gridTemplateColumns: `repeat(${grid.columns}, ${(job?.size ?? size).width}mm)` }}>
                {page}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </Sheet>
  );
}
