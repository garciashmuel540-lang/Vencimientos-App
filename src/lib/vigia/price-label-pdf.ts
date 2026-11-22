import { shelfGrid, type ShelfSize } from "./shelf-size";
import { toBlob } from "html-to-image";
import { PDFDocument, type PDFImage, PageSizes } from "pdf-lib";

const MM = 72 / 25.4;
const MARGIN = 10 * MM;
const GAP = 2 * MM;

export async function createPriceLabelPdf(
  labels: { element: HTMLElement; copies: number }[],
  large: boolean,
  size: ShelfSize,
  signal: AbortSignal,
): Promise<File> {
  const pdf = await PDFDocument.create();
  const paper = large ? PageSizes.A4 : PageSizes.Letter;
  const [, pageHeight] = paper;
  const width = (large ? 170 : size.width) * MM;
  const columns = large ? 1 : shelfGrid(size).columns;
  const availableHeight = pageHeight - 2 * MARGIN;
  let page = pdf.addPage(paper);
  let top = pageHeight - MARGIN;
  let row: { image: PDFImage; width: number; height: number }[] = [];

  function drawRow() {
    const height = Math.max(...row.map((label) => label.height));
    if (top - height < MARGIN - 0.01) {
      page = pdf.addPage(paper);
      top = pageHeight - MARGIN;
    }
    row.forEach((label, index) => {
      page.drawImage(label.image, {
        x: MARGIN + index * (width + GAP),
        y: top - label.height,
        width: label.width,
        height: label.height,
      });
    });
    top -= height + GAP;
    row = [];
  }

  for (const { element, copies } of labels) {
    signal.throwIfAborted();
    // Rasterizar una sola vez por producto a 300 ppp, incluso con varias copias.
    const png = await toBlob(element, {
      pixelRatio: 300 / 96,
      skipFonts: true,
      backgroundColor: "#fff",
    });
    if (!png) throw new Error("No se pudo generar la imagen de la etiqueta.");
    signal.throwIfAborted();
    const image = await pdf.embedPng(await png.arrayBuffer());
    const scale = Math.min(width / image.width, availableHeight / image.height);
    const label = large
      ? { image, width: image.width * scale, height: image.height * scale }
      : { image, width, height: size.height * MM };
    for (let i = 0; i < copies; i++) {
      row.push(label);
      if (row.length === columns) drawRow();
    }
  }
  if (row.length) drawRow();
  pdf.setTitle("Etiquetas de precios");
  const bytes = await pdf.save();
  return new File([new Uint8Array(bytes)], "etiquetas-de-precios.pdf", { type: "application/pdf" });
}
