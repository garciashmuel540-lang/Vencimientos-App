import { createElement } from "react";
import { Mascot } from "@/components/mascot";
import {
  buildFSShareHtml,
  FS_SHARE_HEIGHT,
  FS_SHARE_WIDTH,
  FS_SHARE_PAGE_SIZE,
  type ShareRow,
} from "./food-service-share";
import { compareRecount, quantity, type Recount } from "./recounts";
export async function makeRecountImages(doc: Recount): Promise<File[]> {
  const [{ domToPng }, { renderToStaticMarkup }] = await Promise.all([
    import("modern-screenshot"),
    import("react-dom/server"),
  ]);
  const measured = doc.items.filter((i) => quantity(i.physical) !== null);
  if (!measured.length) throw new Error("Ingresá al menos un conteo físico.");
  const groups = new Map<string, typeof measured>();
  for (const item of measured) {
    const group = item.category || "Documento";
    groups.set(group, [...(groups.get(group) ?? []), item]);
  }
  const items = [...groups.values()].flat();
  const rows: ShareRow[] = items.map((i) => {
    const result = compareRecount(i),
      physical = quantity(i.physical)!;
    return {
      product: {
        code: i.id,
        itemCode: i.code,
        name: i.name,
        category: i.category || "Documento",
        unit: "unidad",
        containerWeight: 0,
        unitWeight: 1,
      },
      detail: "Conteo físico en unidades",
      count: { opened: null, sealed: null, system_qty: quantity(i.system) },
      calc:
        result.difference === null
          ? null
          : {
              production: 0,
              inventory: physical,
              difference: result.difference,
              status: result.status,
              label: result.label,
            },
    };
  });
  const labels = Object.fromEntries([...groups.keys()].map((k) => [k, k]));
  const container = document.createElement("div");
  Object.assign(container.style, {
    position: "fixed",
    left: "0",
    top: "0",
    zIndex: "-1000",
    width: `${FS_SHARE_WIDTH}px`,
    height: `${FS_SHARE_HEIGHT}px`,
    pointerEvents: "none",
  });
  container.setAttribute("aria-hidden", "true");
  document.body.appendChild(container);
  try {
    await document.fonts.ready;
    const mascot = renderToStaticMarkup(createElement(Mascot, { mood: "wave", size: 160 }));
    const pages = Math.ceil(rows.length / FS_SHARE_PAGE_SIZE),
      files: File[] = [];
    for (let page = 0; page < pages; page++) {
      container.innerHTML = buildFSShareHtml(
        doc.title || "Recuento diario",
        doc.date,
        rows.slice(page * FS_SHARE_PAGE_SIZE, (page + 1) * FS_SHARE_PAGE_SIZE),
        labels,
        page + 1,
        pages,
        mascot,
      );
      container.querySelectorAll("svg *").forEach((node) => {
        if (node instanceof SVGElement) node.style.animation = "none";
      });
      container
        .querySelector(".som-wave")
        ?.setAttribute("d", "M20 58C12 59 5 47 5 36c0-4 4-5 6-2l3 8 7 5Z");
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      const url = await domToPng(container, {
        width: FS_SHARE_WIDTH,
        height: FS_SHARE_HEIGHT,
        scale: 1,
        backgroundColor: "#FFFFFF",
      });
      files.push(
        new File([await (await fetch(url)).blob()], `recuento-${doc.date}-${page + 1}.png`, {
          type: "image/png",
        }),
      );
    }
    return files;
  } finally {
    container.remove();
  }
}
