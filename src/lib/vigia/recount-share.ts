import { createElement } from "react";
import { Mascot } from "@/components/mascot";
import { compareRecount, quantity, type Recount } from "./recounts";

const width = 1000;
const margin = 32;
const right = width - margin;
const paperHeight = Math.round((width * 297) / 210);
const font = "Arial, sans-serif";
const numeric = new Intl.NumberFormat("es-NI", { maximumFractionDigits: 6 });
const format = (value: number | null) => (value === null ? "—" : numeric.format(value));
const colors = {
  ok: { label: "Correcto", ink: "#166044" },
  sobra: { label: "Sobra", ink: "#805000" },
  falta: { label: "Falta", ink: "#AB2727" },
  pending: { label: "Pendiente", ink: "#475569" },
};

function wrap(ctx: CanvasRenderingContext2D, value: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of value.split(/\s+/)) {
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
  const markup = renderToStaticMarkup(createElement(Mascot, { mood: "wave", size: 96 }));
  const template = document.createElement("template");
  template.innerHTML = markup;
  const svg = template.content.querySelector("svg")!;
  svg.querySelector(".som-wave")?.setAttribute("d", "M20 58C12 59 5 47 5 36c0-4 4-5 6-2l3 8 7 5Z");
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
  await img.decode();
  return img;
}

export async function makeRecountImage(doc: Recount): Promise<File> {
  const groups = new Map<string, Recount["items"]>();
  for (const item of doc.items) {
    if (quantity(item.physical) === null) continue;
    const category = item.category || "Documento";
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category)!.push(item);
  }
  if (!groups.size) throw new Error("Ingresá al menos un conteo físico.");

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo preparar la imagen del conteo.");
  const mascot = await loadMascot();
  ctx.font = `bold 24px ${font}`;
  const sections = [...groups].map(([category, items]) => ({
    category,
    rows: items.map((item) => ({
      item,
      lines: wrap(ctx, item.name, 420),
      result: compareRecount(item),
    })),
  }));
  ctx.font = `bold 36px ${font}`;
  const title = wrap(ctx, doc.title || "Recuento diario", 790);
  const headerHeight = 105 + title.length * 42;
  const rowHeight = (lines: string[]) => lines.length * 28 + 31;
  const bodyHeight = sections.reduce(
    (sum, section) =>
      sum + 34 + section.rows.reduce((total, row) => total + rowHeight(row.lines), 0),
    0,
  );
  const height = Math.max(paperHeight, headerHeight + 44 + bodyHeight + 88);
  const scale = Math.min(2, 8192 / height, Math.sqrt(10_000_000 / (width * height)));
  canvas.width = Math.floor(width * scale);
  canvas.height = Math.floor(height * scale);
  ctx.scale(canvas.width / width, canvas.height / height);
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
    maxWidth?: number,
  ) => {
    ctx.font = `${bold ? "bold " : ""}${size}px ${font}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillText(value, x, y, maxWidth ?? width);
  };
  box("#FFFFFF", 0, 0, width, height);
  text("VIGÍA / REPORTE DE INVENTARIO", margin, 40, 20, "#42564C", true);
  title.forEach((line, index) => text(line, margin, 83 + index * 42, 36, "#173F33", true));
  text(doc.date, margin, headerHeight - 27, 22, "#42564C");
  ctx.drawImage(mascot, right - 100, 25, 100, 100);
  let y = headerHeight;
  box("#173F33", margin, y, right - margin, 44);
  const columns = [528, 648, 771, 897];
  text("PRODUCTO / CÓDIGO", margin + 12, y + 22, 20, "#FFFFFF", true);
  ["FÍSICO", "SISTEMA", "DIFERENCIA", "ESTADO"].forEach((label, i) =>
    text(label, columns[i], y + 22, 18, "#FFFFFF", true, "center"),
  );
  y += 44;
  let counted = 0;
  for (const section of sections) {
    box("#E7EEE9", margin, y, right - margin, 34);
    text(section.category, margin + 12, y + 17, 20, "#254C3E", true, "left", right - margin - 24);
    y += 34;
    for (const { item, lines, result } of section.rows) {
      const h = rowHeight(lines);
      if (counted % 2 === 1) box("#F6F9F7", margin, y, right - margin, h);
      lines.forEach((line, index) =>
        text(line, margin + 12, y + 18 + index * 28, 24, "#172B27", true),
      );
      text(
        item.code ? `Código: ${item.code}` : "Sin código",
        margin + 12,
        y + h - 15,
        19,
        "#42564C",
        false,
        "left",
        420,
      );
      const state = colors[result.status];
      text(
        format(quantity(item.physical)),
        columns[0],
        y + h / 2,
        25,
        "#172B27",
        true,
        "center",
        104,
      );
      text(
        format(quantity(item.system)),
        columns[1],
        y + h / 2,
        25,
        "#172B27",
        true,
        "center",
        104,
      );
      text(
        `${(result.difference ?? 0) > 0 ? "+" : ""}${format(result.difference)}`,
        columns[2],
        y + h / 2,
        25,
        state.ink,
        true,
        "center",
        112,
      );
      text(state.label, columns[3], y + h / 2, 20, state.ink, true, "center", 124);
      box("#DBE4DE", margin, y + h - 1, right - margin, 1);
      y += h;
      counted++;
    }
  }
  text(
    `${counted} ${counted === 1 ? "ítem contado" : "ítems contados"}`,
    margin,
    height - 35,
    20,
    "#42564C",
    true,
  );
  text("Diferencia = físico − sistema", right, height - 35, 19, "#42564C", false, "right");
  try {
    const png = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(new Error("No se pudo crear la imagen del conteo.")),
        "image/png",
      ),
    );
    return new File([png], `recuento-${doc.date}.png`, { type: "image/png" });
  } finally {
    canvas.width = canvas.height = 0;
  }
}
