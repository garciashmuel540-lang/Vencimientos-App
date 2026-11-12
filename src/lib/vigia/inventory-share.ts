import { createElement } from "react";
import { Mascot } from "@/components/mascot";

const width = 1000;
const height = Math.round((width * 297) / 210);
const margin = 30;
const right = width - margin;
// On A4 at this logical width, 20 px and 23.5 px correspond to 12 pt and 14 pt.
const font = '"Bell MT", Georgia, "Times New Roman", serif';
const numeric = new Intl.NumberFormat("es-NI", { maximumFractionDigits: 6 });
const format = (value: number | null) => (value === null ? "—" : numeric.format(value));
const colors = {
  ok: { label: "Correcto", ink: "#166044" },
  sobra: { label: "Sobra", ink: "#805000" },
  falta: { label: "Falta", ink: "#AB2727" },
  pending: { label: "Pendiente", ink: "#475569" },
};
export type InventoryImageRow = {
  name: string;
  code?: string;
  category: string;
  detail?: string;
  physical: number | null;
  system: number | null;
  difference: number | null;
  status: keyof typeof colors;
};

type RowLayout = {
  row: InventoryImageRow;
  names: string[];
  details: string[];
  codes: string[];
  height: number;
};
type PageRow = RowLayout & { heading: boolean };
function paginate(rows: RowLayout[], available: number): PageRow[][] {
  const pages: PageRow[][] = [];
  let page: PageRow[] = [],
    remaining = available;
  for (const row of rows) {
    let heading = page.at(-1)?.row.category !== row.row.category;
    if (page.length && row.height + (heading ? 31 : 0) > remaining) {
      pages.push(page);
      page = [];
      remaining = available;
      heading = true;
    }
    page.push({ ...row, heading });
    remaining -= row.height + (heading ? 31 : 0);
  }
  if (page.length) pages.push(page);
  return pages;
}

function wrap(ctx: CanvasRenderingContext2D, value: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of value.trim().split(/\s+/)) {
    if (line && ctx.measureText(`${line} ${word}`).width <= maxWidth) {
      line += ` ${word}`;
      continue;
    }
    if (line) lines.push(line);
    line = "";
    for (const character of word) {
      if (line && ctx.measureText(line + character).width > maxWidth) {
        lines.push(line);
        line = "";
      }
      line += character;
    }
  }
  return [...lines, line];
}

async function loadMascot(): Promise<HTMLImageElement> {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const template = document.createElement("template");
  template.innerHTML = renderToStaticMarkup(createElement(Mascot, { mood: "wave", size: 96 }));
  const svg = template.content.querySelector("svg")!;
  svg.querySelector(".som-wave")?.setAttribute("d", "M20 58C12 59 5 47 5 36c0-4 4-5 6-2l3 8 7 5Z");
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
  await img.decode();
  return img;
}

export async function makeInventoryImages({
  title,
  date,
  fileStem,
  rows,
}: {
  title: string;
  date: string;
  fileStem: string;
  rows: InventoryImageRow[];
}): Promise<File[]> {
  if (!rows.length) throw new Error("No hay ítems con información para compartir.");
  await document.fonts.ready;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo preparar el reporte.");
  const mascot = await loadMascot();
  ctx.font = `bold 35px ${font}`;
  const titleLines = wrap(ctx, title, 790);
  const headerHeight = 88 + titleLines.length * 40;
  const available = height - headerHeight - 40 - 58;
  const measure = (compact: boolean) =>
    rows.map((row) => {
      ctx.font = `bold ${compact ? 20 : 23.5}px ${font}`;
      const names = wrap(ctx, row.name, compact ? 277 : 424);
      ctx.font = `20px ${font}`;
      const metadata = [compact ? undefined : row.code, row.detail].filter(Boolean).join(" · ");
      const details = metadata ? wrap(ctx, metadata, 424) : [];
      const codes = compact && row.code ? wrap(ctx, row.code, 153) : [];
      return {
        row,
        names,
        details,
        codes,
        height: compact
          ? Math.max(31, Math.max(names.length, codes.length) * 22 + details.length * 22 + 8)
          : Math.max(44, names.length * 26 + details.length * 21 + 9),
      };
    });
  let compact = false;
  let pages = paginate(measure(false), available);
  if (pages.length > 1) {
    const compactPages = paginate(measure(true), available);
    if (compactPages.length < pages.length) {
      pages = compactPages;
      compact = true;
    }
  }
  const files: File[] = [];
  canvas.width = width * 2;
  canvas.height = height * 2;
  ctx.scale(2, 2);
  const box = (color: string, x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  };
  const text = (
    value: string,
    x: number,
    y: number,
    size: number,
    color = "#172B27",
    bold = false,
    align: CanvasTextAlign = "left",
    maxWidth = width,
  ) => {
    ctx.font = `${bold ? "bold " : ""}${size}px ${font}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillText(value, x, y, maxWidth);
  };
  const columns = [527, 643, 764, 895];
  try {
    for (let index = 0; index < pages.length; index++) {
      box("#FFFFFF", 0, 0, width, height);
      text("VIGÍA / REPORTE DE INVENTARIO", margin, 32, 20, "#42564C", true);
      titleLines.forEach((line, i) => text(line, margin, 69 + i * 40, 35, "#173F33", true));
      text(date, margin, headerHeight - 22, 20, "#42564C");
      ctx.drawImage(mascot, right - 90, 18, 90, 90);
      let y = headerHeight;
      box("#173F33", margin, y, right - margin, 40);
      text(compact ? "PRODUCTO" : "PRODUCTO / CÓDIGO", margin + 10, y + 20, 20, "#FFFFFF", true);
      if (compact) text("CÓDIGO", 324, y + 20, 20, "#FFFFFF", true);
      ["FÍSICO", "SISTEMA", "DIFERENCIA", "ESTADO"].forEach((label, i) =>
        text(label, columns[i], y + 20, 20, "#FFFFFF", true, "center", 124),
      );
      y += 40;
      for (const [i, entry] of pages[index].entries()) {
        const { row, names, details, codes, height: h, heading } = entry;
        if (heading) {
          box("#E7EEE9", margin, y, right - margin, 31);
          text(
            row.category,
            margin + 10,
            y + 15.5,
            20,
            "#254C3E",
            true,
            "left",
            right - margin - 20,
          );
          y += 31;
        }
        if (i % 2 === 1) box("#F6F9F7", margin, y, right - margin, h);
        const nameLineHeight = compact ? 22 : 26;
        const detailY = y + Math.max(names.length, codes.length) * nameLineHeight + 13;
        names.forEach((line, n) =>
          text(
            line,
            margin + 10,
            y + 16 + n * nameLineHeight,
            compact ? 20 : 23.5,
            "#172B27",
            true,
          ),
        );
        codes.forEach((line, n) => text(line, 324, y + 16 + n * nameLineHeight, 20, "#42564C"));
        details.forEach((line, n) => text(line, margin + 10, detailY + n * 21, 20, "#42564C"));
        const state = colors[row.status];
        const values = [
          format(row.physical),
          format(row.system),
          `${(row.difference ?? 0) > 0 ? "+" : ""}${format(row.difference)}`,
          state.label,
        ];
        values.forEach((value, n) =>
          text(
            value,
            columns[n],
            y + h / 2,
            n === 3 || compact ? 20 : 23.5,
            n >= 2 ? state.ink : "#172B27",
            true,
            "center",
            n === 3 ? 124 : 106,
          ),
        );
        box("#DBE4DE", margin, y + h - 1, right - margin, 1);
        y += h;
      }
      text(
        `${rows.length} ${rows.length === 1 ? "ítem" : "ítems"}`,
        margin,
        height - 31,
        20,
        "#42564C",
        true,
      );
      if (pages.length > 1)
        text(
          `Hoja ${index + 1} de ${pages.length}`,
          right,
          height - 31,
          20,
          "#42564C",
          false,
          "right",
        );
      const png = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("No se pudo crear la imagen."))),
          "image/png",
        ),
      );
      files.push(
        new File([png], `${fileStem}${pages.length > 1 ? `-${index + 1}` : ""}.png`, {
          type: "image/png",
        }),
      );
    }
    return files;
  } finally {
    canvas.width = canvas.height = 0;
  }
}
