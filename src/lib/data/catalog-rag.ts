/**
 * Cliente para la búsqueda semántica (RAG) en el catálogo.
 * Llama a la Edge Function search-catalog.
 */

const FUNCTIONS_URL =
  "https://mmmidsrtuilctckqzrij.supabase.co/functions/v1/hyper-responder";

export interface CatalogRAGProduct {
  barcode: string;
  name: string;
  brand: string;
  presentation: string;
  category: string;
  price: number | null;
  price_c: number | null;
  cost: number | null;
}

export interface CatalogRAGMatch {
  barcode: string;
  similarity: number;
}

export interface CatalogRAGResponse {
  results: CatalogRAGProduct[];
  matches: CatalogRAGMatch[];
}

/**
 * Busca productos en el catálogo por similitud semántica.
 */
export async function searchCatalogRAG(
  query: string,
  limit = 10,
): Promise<CatalogRAGResponse> {
  if (!query.trim()) return { results: [], matches: [] };

  try {
    const res = await fetch(FUNCTIONS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit }),
    });

    if (!res.ok) {
      console.warn("[catalog-rag] error", res.status);
      return { results: [], matches: [] };
    }

    const json = (await res.json()) as CatalogRAGResponse;
    return {
      results: json.results ?? [],
      matches: json.matches ?? [],
    };
  } catch (err) {
    console.warn("[catalog-rag] excepción:", err);
    return { results: [], matches: [] };
  }
}
