import { supabase } from "@/lib/supabase";
import { quantity, type Recount } from "@/lib/vigia/recounts";

const table = "vigia_recounts";
const fields = "id,user_id,title,count_date,updated_at,reviewed,item_count,measured_count";
export type RecountSummary = Pick<
  Recount,
  "id" | "userId" | "title" | "date" | "updatedAt" | "reviewed"
> & { itemCount: number; measuredCount: number };
type SummaryRow = {
  id: string;
  user_id: string;
  title: string;
  count_date: string;
  updated_at: string;
  reviewed: boolean;
  item_count: number;
  measured_count: number;
};
type RecountRow = SummaryRow & { photos: string[]; payload: Pick<Recount, "items" | "rawText"> };
const summary = (r: SummaryRow): RecountSummary => ({
  id: r.id,
  userId: r.user_id,
  title: r.title,
  date: r.count_date,
  updatedAt: r.updated_at,
  reviewed: r.reviewed,
  itemCount: r.item_count,
  measuredCount: r.measured_count,
});
export const summarizeRecount = (d: Recount): RecountSummary => ({
  id: d.id,
  userId: d.userId,
  title: d.title,
  date: d.date,
  updatedAt: d.updatedAt,
  reviewed: d.reviewed,
  itemCount: d.items.length,
  measuredCount: d.items.filter((i) => quantity(i.physical) !== null).length,
});
function payload(d: Recount, includePhotos = true) {
  const row = summarizeRecount(d);
  return {
    id: d.id,
    user_id: d.userId,
    title: d.title,
    count_date: d.date,
    updated_at: d.updatedAt,
    reviewed: d.reviewed,
    item_count: row.itemCount,
    measured_count: row.measuredCount,
    ...(includePhotos ? { photos: d.images } : {}),
    payload: { items: d.items, rawText: d.rawText },
  };
}
export async function listCloudRecounts(userId: string): Promise<RecountSummary[] | null> {
  if (!supabase) return null;
  const result: RecountSummary[] = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await supabase
      .from(table)
      .select(fields)
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .order("id")
      .range(start, start + 499);
    if (error) {
      if (error.code === "PGRST205" || error.code === "42P01") return null;
      throw error;
    }
    result.push(...(data as SummaryRow[]).map(summary));
    if (data.length < 500) return result;
  }
}
export async function openCloudRecount(id: string, userId: string): Promise<Recount | null> {
  if (!supabase) throw new Error("Supabase no configurado");
  const { data, error } = await supabase
    .from(table)
    .select(`${fields},payload,photos`)
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as RecountRow;
  return { ...summary(row), ...row.payload, images: row.photos };
}
export async function importCloudRecount(doc: Recount): Promise<void> {
  if (!supabase) throw new Error("Supabase no configurado");
  const { error } = await supabase
    .from(table)
    .upsert(payload(doc), { onConflict: "id", ignoreDuplicates: true });
  if (error) throw error;
  // Confirm access before deleting the legacy copy, including on an ID conflict.
  const { data, error: readError } = await supabase
    .from(table)
    .select("id")
    .eq("id", doc.id)
    .eq("user_id", doc.userId)
    .maybeSingle();
  if (readError || !data) throw readError ?? new Error("No se confirmó el recuento en Supabase");
}
export async function saveCloudRecount(
  doc: Recount,
  previous?: string,
  includePhotos = true,
): Promise<string> {
  if (!supabase) throw new Error("Supabase no configurado");
  const query = previous
    ? supabase
        .from(table)
        .update(payload(doc, includePhotos))
        .eq("id", doc.id)
        .eq("user_id", doc.userId)
        .eq("updated_at", previous)
    : supabase.from(table).insert(payload(doc));
  const { data, error } = await query.select("updated_at").maybeSingle();
  if (error) throw error;
  if (!data)
    throw new Error(
      "El recuento cambió en otro dispositivo. Volvé a abrirlo para ver la versión actual.",
    );
  return data.updated_at as string;
}
export async function deleteCloudRecount(id: string, userId: string): Promise<void> {
  if (!supabase) throw new Error("Supabase no configurado");
  const { error } = await supabase.from(table).delete().eq("id", id).eq("user_id", userId);
  if (error) throw error;
}
