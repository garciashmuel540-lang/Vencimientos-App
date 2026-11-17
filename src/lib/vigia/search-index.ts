/** In-memory substring index. Built once per data snapshot, never persisted. */
export const normalizeSearch = (value: string) =>
  value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

type Searchable = { barcode: string; name: string; brand: string };

function grams(value: string): string[] {
  const result = new Set<string>();
  for (let i = 0; i <= value.length - 3; i++) result.add(value.slice(i, i + 3));
  return [...result];
}

export function createSearchIndex<T extends Searchable>(entries: readonly T[]) {
  const rows = entries.map((entry) => ({
    entry,
    name: normalizeSearch(entry.name),
    brand: normalizeSearch(entry.brand),
    barcode: normalizeSearch(entry.barcode),
    text: normalizeSearch(entry.name + " " + entry.brand),
  }));
  const postings = new Map<string, Set<number>>();
  const codes = new Map<string, Set<number>>();
  rows.forEach((row, index) => {
    for (const gram of grams(row.text + " " + row.barcode)) {
      const matches = postings.get(gram) ?? new Set<number>();
      matches.add(index);
      postings.set(gram, matches);
    }
    const matches = codes.get(row.barcode) ?? new Set<number>();
    matches.add(index);
    codes.set(row.barcode, matches);
  });

  function candidates(term: string): number[] {
    if (term.length < 3) return rows.map((_, index) => index);
    const lists = grams(term).map((gram) => postings.get(gram));
    if (lists.some((list) => !list)) return [];
    const sorted = (lists as Set<number>[]).sort((a, b) => a.size - b.size);
    return [...sorted[0]].filter((index) => sorted.every((list) => list.has(index)));
  }

  return {
    search(keywords: string[], limit = 15): T[] {
      const words = [...new Set(keywords.map((word) => normalizeSearch(word).trim()))]
        .filter((word) => word.length >= 3);
      const scores = new Map<number, number>();
      for (const word of words) {
        const ids = new Set([...candidates(word), ...(codes.get(word) ?? [])]);
        for (const id of ids) {
          const row = rows[id];
          const score = row.barcode === word ? 100 + word.length
            : row.text.includes(word) ? word.length : 0;
          if (score) scores.set(id, (scores.get(id) ?? 0) + score);
        }
      }
      return [...scores].sort((a, b) => b[1] - a[1] || a[0] - b[0])
        .slice(0, limit).map(([id]) => rows[id].entry);
    },
    find(query: string, limit = Infinity, partialBarcode = false): T[] {
      const q = normalizeSearch(query).trim();
      if (!q) return [];
      return candidates(q).sort((a, b) => a - b)
        .filter((id) => {
          const row = rows[id];
          return row.name.includes(q) || row.brand.includes(q) ||
            (partialBarcode ? row.barcode.includes(q) : row.barcode === q);
        })
        .slice(0, limit).map((id) => rows[id].entry);
    },
  };
}
