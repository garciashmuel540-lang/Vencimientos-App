/**
 * Cliente Supabase para conteos de Food Service.
 * Cada usuario ve solo sus conteos; admin ve todos (RLS).
 */
import { supabase } from "@/lib/supabase";

/**
 * Fila de food_service_counts en Supabase.
 */
export interface FSCountRow {
  id: string;
  user_id: string;
  product_code: string;
  product_name: string;
  category: string;
  unit: string;
  container_weight: number | null;
  unit_weight: number | null;
  opened: number | null;
  sealed: number | null;
  system_qty: number | null;
  notes: string | null;
  count_date: string; // "YYYY-MM-DD"
  created_at: string;
  updated_at: string;
}

/**
 * Payload para insertar/actualizar un conteo.
 * NO incluye user_id (RLS lo llena).
 */
export interface FSCountInput {
  product_code: string;
  product_name: string;
  category: string;
  unit: string;
  container_weight: number | null;
  unit_weight: number | null;
  opened: number | null;
  sealed: number | null;
  system_qty: number | null;
  notes?: string | null;
  count_date: string; // "YYYY-MM-DD"
}

/**
 * Fecha de hoy en formato YYYY-MM-DD (zona local).
 */
export function todayISO(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Trae TODOS los conteos del usuario actual.
 * El admin recibe los de todos (RLS).
 */
export async function pullAllFSCounts(): Promise<FSCountRow[]> {
  if (!supabase) throw new Error("Supabase no configurado");

  const PAGE_SIZE = 1000;
  const allRows: FSCountRow[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from("food_service_counts")
      .select("*")
      .order("count_date", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);
    const page = (data ?? []) as FSCountRow[];
    allRows.push(...page);

    if (page.length < PAGE_SIZE) {
      hasMore = false;
    } else {
      from += PAGE_SIZE;
    }
  }

  console.info(
    `[food-service-supabase] conteos descargados: ${allRows.length}`,
  );
  return allRows;
}

/**
 * Trae los conteos de una fecha específica (YYYY-MM-DD).
 */
export async function pullFSCountsByDate(date: string): Promise<FSCountRow[]> {
  if (!supabase) throw new Error("Supabase no configurado");

  const { data, error } = await supabase
    .from("food_service_counts")
    .select("*")
    .eq("count_date", date)
    .order("product_name");

  if (error) throw new Error(error.message);
  return (data ?? []) as FSCountRow[];
}

/**
 * Guarda (o actualiza) un conteo.
 * Si ya existe uno con (user_id, product_code, count_date), lo actualiza.
 */
export async function pushFSCount(
  input: FSCountInput,
): Promise<FSCountRow> {
  if (!supabase) throw new Error("Supabase no configurado");

  const payload = {
    product_code: input.product_code,
    product_name: input.product_name,
    category: input.category,
    unit: input.unit,
    container_weight: input.container_weight,
    unit_weight: input.unit_weight,
    opened: input.opened,
    sealed: input.sealed,
    system_qty: input.system_qty,
    notes: input.notes ?? null,
    count_date: input.count_date,
  };

  const { data, error } = await supabase
    .from("food_service_counts")
    .upsert(payload, {
      onConflict: "user_id,product_code,count_date",
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as FSCountRow;
}

/**
 * Borra un conteo por id.
 */
export async function deleteFSCount(id: string): Promise<void> {
  if (!supabase) throw new Error("Supabase no configurado");

  const { error } = await supabase
    .from("food_service_counts")
    .delete()
    .eq("id", id);

  if (error) throw new Error(error.message);
}

/**
 * Cuenta cuántos conteos tiene el usuario actual.
 */
export async function countMyFSCounts(): Promise<number> {
  if (!supabase) return 0;
  const { count, error } = await supabase
    .from("food_service_counts")
    .select("*", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return count ?? 0;
}
