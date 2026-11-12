export const SPEECH_SEGMENT_LENGTH = 360;

export function splitSpeech(text: string, limit = SPEECH_SEGMENT_LENGTH): string[] {
  const segments: string[] = [];
  let remaining = text.trim();
  while (remaining.length > limit) {
    const window = remaining.slice(0, limit + 1);
    const sentenceEnd = [...window.matchAll(/[.!?;](?=\s)/g)].at(-1)?.index;
    const boundary =
      sentenceEnd !== undefined && sentenceEnd >= limit / 2
        ? sentenceEnd + 1
        : window.lastIndexOf(" ");
    const cut = boundary > 0 ? Math.min(boundary, limit) : limit;
    segments.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining) segments.push(remaining);
  return segments;
}

export function speechText(root: HTMLElement): string {
  function read(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    if (!(node instanceof HTMLElement)) return "";
    if (node.tagName === "TABLE") {
      const table = node as HTMLTableElement;
      const headers = Array.from(
        table.tHead?.rows[0]?.cells ?? [],
        (cell) => cell.textContent?.trim() ?? "",
      );
      const rows = Array.from(table.tBodies).flatMap((body) => Array.from(body.rows));
      return rows
        .map(
          (row) =>
            Array.from(row.cells, (cell, i) => {
              const value = cell.textContent?.trim();
              return `${headers[i] ? headers[i] + ": " : ""}${value && value !== "—" ? value : "sin dato"}`;
            }).join(". ") + ".",
        )
        .join(" ");
    }
    if (node.tagName === "BR") return " ";
    const text = Array.from(node.childNodes, read).join("");
    if (/^(?:P|LI|H[1-6]|BLOCKQUOTE|PRE)$/.test(node.tagName)) {
      return `${text.trim().replace(/([^.!?…:])$/, "$1.")} `;
    }
    return text;
  }
  return read(root)
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D]/gu, "")
    .replace(/C\$\s*(\d+(?:[.,]\d+)*)/g, "$1 córdobas")
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function selectSpanishVoice<
  T extends { lang: string; name: string; localService?: boolean },
>(voices: T[]): T | undefined {
  const score = (voice: T) => {
    const lang = voice.lang.toLowerCase().replace("_", "-");
    const regional =
      lang === "es-ni" ? 40 : /^(es-us|es-mx|es-419)$/.test(lang) ? 30 : lang === "es-es" ? 10 : 20;
    return (
      regional +
      (/natural|premium|enhanced|google|paulina|m[oó]nica|sabra|marisol/i.test(voice.name) ? 7 : 0)
    );
  };
  return voices
    .filter((voice) => /^es(?:[-_]|$)/i.test(voice.lang))
    .sort((a, b) => score(b) - score(a))[0];
}
