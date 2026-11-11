import type { FSProduct } from "./food-service-catalog";
import type { FSCalcResult } from "./food-service-calc";

export const FS_SHARE_WIDTH = 640;
export const FS_SHARE_PAGE_SIZE = 6;

export function hasFSShareData(count: ShareRow["count"] | undefined): boolean {
  return Boolean(count && [count.opened, count.sealed, count.system_qty]
    .some((value) => typeof value === "number" && Number.isFinite(value)));
}


export type ShareRow = {
  product: FSProduct;
  calc: FSCalcResult | null;
  count: { opened: number | null; sealed: number | null; system_qty: number | null } | null;
};

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]!);

const states = {
  ok: { label: "Correcto", ink: "#166044", background: "#EAF5EF" },
  sobra: { label: "Sobra", ink: "#805000", background: "#FFF3D6" },
  falta: { label: "Falta", ink: "#AB2727", background: "#FDECEC" },
  incompleto: { label: "Sin completar", ink: "#475569", background: "#EEF2F6" },
};

/** Standalone, light-theme report; no app CSS or remote assets required. */
export function buildFSShareHtml(category: string, date: string, rows: ShareRow[], labels: Record<string, string> = {}, page = 1, pages = 1): string {
  const completed = rows.filter(({ calc }) => calc && calc.status !== "incompleto");
  const correct = completed.filter(({ calc }) => calc?.status === "ok").length;
  const pending = rows.length - completed.length;
  const number = (value: number) => Number.isFinite(value)
    ? value.toLocaleString("es-NI", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "—";
  const metric = (label: string, value: string, ink = "#172B27", background = "#F3F6F5") => `
    <div style="min-width:0;padding:12px 10px;background:${background};border-radius:10px">
      <div style="font-size:17px;font-weight:600;color:${ink};margin-bottom:4px">${label}</div>
      <div style="font-size:26px;line-height:1.2;font-weight:750;font-variant-numeric:tabular-nums;overflow-wrap:anywhere;color:${ink}">${value}</div>
    </div>`;
  const cards = rows.map(({ product, calc, count }, index) => {
    const ready = calc && calc.status !== "incompleto";
    const state = states[ready ? calc.status : "incompleto"];
    const difference = ready ? `${calc.difference > 0 ? "+" : ""}${number(calc.difference)}` : "—";
    const heading = index === 0 || rows[index - 1].product.category !== product.category
      ? `<h2 style="margin:20px 0 8px;padding:10px 14px;border-radius:8px;background:#DCE9E1;font-size:23px;color:#173F33">${escapeHtml(labels[product.category] ?? product.category)}</h2>` : "";
    return `${heading}<section style="margin-top:14px;padding:20px;background:#FFFFFF;border:1px solid #D8E2DD;border-left:5px solid ${state.ink};border-radius:14px;break-inside:avoid">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px">
        <span style="font-size:16px;font-weight:600;color:#53645E">PRODUCTO ${String(index + 1).padStart(2, "0")}</span>
        <span style="font-size:17px;line-height:1.3;font-weight:700;padding:5px 12px;border-radius:8px;background:${state.background};color:${state.ink}">${state.label}</span>
      </div>
      <div style="font-size:24px;line-height:1.3;font-weight:700;color:#172B27;overflow-wrap:anywhere">${escapeHtml(product.name.replace(/^FSI\s+/, ""))}</div>
      <div style="margin-top:6px;font-size:18px;line-height:1.4;color:#475A52;overflow-wrap:anywhere">${product.itemCode ? `Código: <span style="font-family:monospace;font-weight:600">${escapeHtml(product.itemCode)}</span>` : "Código pendiente"}</div>
      <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:16px">
        ${metric("Físico", ready ? number(calc.inventory) : "—")}
        ${metric("Sistema", count?.system_qty != null ? number(count.system_qty) : "—")}
        ${metric("Diferencia", difference, state.ink, state.background)}
      </div>
      <div style="margin-top:10px;font-size:17px;color:#475A52">Abiertos: ${count?.opened != null ? number(count.opened) : "—"} ${escapeHtml(product.unit)} · Sellados: ${count?.sealed != null ? number(count.sealed) : "—"}</div>
    </section>`;
  }).join("");
  return `<div style="box-sizing:border-box;width:${FS_SHARE_WIDTH}px;padding:24px;background:#F1F5F2;color:#172B27;font-family:Arial,Helvetica,sans-serif;line-height:1.4;text-align:left;color-scheme:light">
    <header style="padding:24px;border-radius:16px;background:#173F33;color:#FFFFFF">
      <div style="font-size:17px;letter-spacing:2px;font-weight:700;color:#D6E8DE">VIGÍA · INVENTARIO</div>
      <div style="font-size:34px;line-height:1.2;font-weight:750;margin-top:10px">${escapeHtml(category)}</div>
      <div style="font-size:20px;margin-top:12px;color:#E3EFE8">${escapeHtml(date)}${pages > 1 ? ` · Parte ${page} de ${pages}` : ""}</div>
    </header>
    <div style="padding:18px 2px 4px;font-size:19px;color:#344D42">
      <strong>${rows.length} ítems en esta imagen</strong> · ${completed.length} completos<br>
      ${correct} correctos · ${completed.length - correct} con diferencia · ${pending} sin completar
    </div>
    ${cards}
    <footer style="padding:20px 4px 0;font-size:17px;color:#475A52;line-height:1.5">
      Diferencia = físico − sistema.<br>
      Cantidades en unidades de inventario de cada producto.<br>
      <span style="font-weight:700">Generado con Vigía</span>
    </footer>
  </div>`;
}
