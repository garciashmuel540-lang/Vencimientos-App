import type { ChatContext } from "./types";

const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

export function relevance(terms: string[], ...fields: (string | undefined)[]): number {
  const words = new Set(
    normalize(fields.filter(Boolean).join(" "))
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );
  return terms.reduce((score, term) => score + (words.has(normalize(term)) ? 1 : 0), 0);
}

export function ranked<T>(rows: T[], score: (row: T) => number, limit: number): T[] {
  return rows
    .map((row) => ({ row, score: score(row) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ row }) => row);
}

export function buildUserMessage({ question, history: _history, ...data }: ChatContext): string {
  return `Pregunta de la persona: ${question}\n\nDatos de Vigía (JSON):\n${JSON.stringify(data)}`;
}
