import { shelfGap, shelfMargin, shelfGrid, type ShelfSize } from "./shelf-size";
import { toBlob } from "html-to-image";
import { PDFDocument, type PDFImage, PageSizes } from "pdf-lib";

const MM = 72 / 25.4;

export async function createPriceLabelPdf(
  labels: { element: HTMLElement; copies: number }[],
  large: boolean,
  size: ShelfSize,
  signal: AbortSignal,
): Promise<File> {
  const margin = (large ? 10 : shelfMargin) * MM;
  const gap = (large ? 2 : shelfGap) * MM;
  const pdf = await PDFDocument.create();
  const paper = large ? PageSizes.A4 : PageSizes.Letter;
  const [, pageHeight] = paper;
  const width = (large ? 170 : size.width) * MM;
  const columns = large ? 1 : shelfGrid(size).columns;
  const availableHeight = pageHeight - 2 * margin;
  let page = pdf.addPage(paper);
  let top = pageHeight - margin;
  let row: { image: PDFImage; width: number; height: number }[] = [];

  function drawRow() {
    const height = Math.max(...row.map((label) => label.height));
    if (top - height < margin - 0.01) {
      page = pdf.addPage(paper);
      top = pageHeight - margin;
    }
    row.forEach((label, index) => {
      page.drawImage(label.image, {
        x: margin + index * (width + gap),
        y: top - label.height,
        width: label.width,
        height: label.height,
      });
    });
    top -= height + gap;
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
