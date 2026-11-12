type Cell = string | number | null | undefined;

function tableCell(value: Cell): string {
  return String(value ?? "—")
    .replace(/[\r\n]+/g, " ")
    .replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[char]!)
    .replace(/[\\|`*_\[\]~]/g, "\\$&");
}

export function markdownTable(headers: string[], rows: Cell[][]): string {
  const line = (cells: Cell[]) => `| ${cells.map(tableCell).join(" | ")} |`;
  return [line(headers), line(headers.map(() => "---")), ...rows.map(line)].join("\n");
}
