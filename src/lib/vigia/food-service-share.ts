import type { FSProduct } from "./food-service-catalog";
import type { FSCalcResult } from "./food-service-calc";

export const FS_SHARE_WIDTH = 1920;
export const FS_SHARE_HEIGHT = 1080;
export const FS_SHARE_PAGE_SIZE = 5;

export function hasFSShareData(count: ShareRow["count"] | undefined): boolean {
  return Boolean(count && [count.opened, count.sealed, count.system_qty]
    .some((value) => typeof value === "number" && Number.isFinite(value)));
}


export type ShareRow = {
  product: Omit<FSProduct, "category"> & { category: string };
  detail?: string;
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

/** Fixed FHD landscape sheet, independent of the app's cards and screen size. */
export function buildFSShareHtml(category: string, date: string, rows: ShareRow[], labels: Record<string, string> = {}, page = 1, pages = 1, mascot = ""): string {
  const number = (value: number | null | undefined) => typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString("es-NI", { maximumFractionDigits: 2, minimumFractionDigits: 2 }) : "—";
  const complete = rows.filter(r => r.calc && r.calc.status !== "incompleto").length;
  const body = rows.map(({ product, calc, count, detail }, index) => {
    const ready = calc && calc.status !== "incompleto";
    const state = states[ready ? calc.status : "incompleto"];
    const heading = index === 0 || rows[index - 1].product.category !== product.category
      ? `<tr><td colspan="5" style="padding:8px 16px;background:#E7EEE9;color:#254C3E;font-size:25px;font-weight:700;border-bottom:1px solid #CCD9D0">${escapeHtml(labels[product.category] ?? product.category)}</td></tr>` : "";
    const diff = ready ? `${calc.difference > 0 ? "+" : ""}${number(calc.difference)}` : "—";
    const cell = "padding:12px 16px;border-bottom:1px solid #DCE3DE;vertical-align:middle;";
    return `${heading}<tr style="background:${index % 2 === 0 ? "#FFFFFF" : "#F8FAF8"}">
      <td style="${cell}">
        <div style="font-size:29px;line-height:1.15;font-weight:700;overflow-wrap:anywhere">${escapeHtml(product.name.replace(/^FSI\s+/, ""))}</div>
        <div style="font-size:23px;line-height:1.35;margin-top:4px;color:#42564C">${product.itemCode ? `Código: <strong>${escapeHtml(product.itemCode)}</strong>` : "Código pendiente"}${detail !== undefined ? ` · ${escapeHtml(detail)}` : ` · Abiertos: ${number(count?.opened)} ${escapeHtml(product.unit)} · Sellados: ${number(count?.sealed)}`}</div>
      </td>
      <td style="${cell}text-align:right;font-size:33px;font-weight:700">${ready ? number(calc.inventory) : "—"}</td>
      <td style="${cell}text-align:right;font-size:33px;font-weight:700">${number(count?.system_qty)}</td>
      <td style="${cell}text-align:right;font-size:33px;font-weight:700;color:${state.ink}">${diff}</td>
      <td style="${cell}text-align:center"><span style="font-size:25px;font-weight:700;color:${state.ink};background:${state.background};padding:8px 12px;display:inline-block">${state.label}</span></td>
    </tr>`;
  }).join("");
  const th = "padding:12px 16px;font-size:24px;font-weight:700;letter-spacing:1px;background:#173F33;color:#FFFFFF;";
  return `<div style="box-sizing:border-box;width:1920px;height:1080px;padding:40px 56px;background:#FFFFFF;color:#172B27;font-family:Arial,Helvetica,sans-serif;line-height:1.25;text-align:left;color-scheme:light;position:relative">
    <header style="height:155px;display:flex;align-items:center;justify-content:space-between;border-bottom:4px solid #173F33;margin-bottom:20px">
      <div><div style="font-size:23px;letter-spacing:4px;font-weight:700;color:#52705F">VIGÍA / REPORTE DE INVENTARIO</div>
        <div style="font-size:49px;font-weight:700;margin-top:8px">${escapeHtml(category)}</div>
        <div style="font-size:27px;color:#42564C;margin-top:8px">${escapeHtml(date)} · Parte ${page} de ${pages}</div>
      </div>
      <div style="display:flex;align-items:center;gap:16px">
        <div style="text-align:right;font-size:25px;color:#42564C"><strong style="font-size:29px;color:#173F33">¡Conteo listo!</strong><br>Som te saluda</div>
        <div style="width:160px;height:160px">${mascot}</div>
      </div>
    </header>
    <table style="width:100%;border-collapse:collapse;table-layout:fixed;font-variant-numeric:tabular-nums">
      <colgroup><col style="width:46%"><col style="width:13%"><col style="width:13%"><col style="width:13%"><col style="width:15%"></colgroup>
      <thead><tr><th style="${th}text-align:left">PRODUCTO / CÓDIGO</th><th style="${th}text-align:right">FÍSICO</th><th style="${th}text-align:right">SISTEMA</th><th style="${th}text-align:right">DIFERENCIA</th><th style="${th}text-align:center">ESTADO</th></tr></thead>
      <tbody>${body}</tbody>
    </table>
    <footer style="position:absolute;bottom:30px;left:56px;right:56px;border-top:1px solid #CCD9D0;padding-top:14px;display:flex;justify-content:space-between;font-size:23px;color:#42564C">
      <span>${rows.length} ítems en esta imagen · ${complete} completos · ${rows.length - complete} sin completar</span>
      <span>Diferencia = físico − sistema · Unidades de inventario</span>
    </footer>
  </div>`;
}
