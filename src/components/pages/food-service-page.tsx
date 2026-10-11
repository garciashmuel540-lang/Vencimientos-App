/**
 * Pantalla principal de Food Service.
 * Muestra el conteo del día por categoría, con cards expandibles.
 */
import { useEffect, useMemo, useState } from "react";
import { Calendar, Search, ChevronDown, Users, User } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSupabaseAuth } from "@/lib/auth/supabase-auth";
import {
  FS_PRODUCTS,
  FS_CATEGORY_LABEL,
  type FSCategory,
  type FSProduct,
} from "@/lib/vigia/food-service-catalog";
import {
  pullFSCountsByDate,
  pushFSCount,
  deleteFSCount,
  todayISO,
  type FSCountRow,
  type FSCountInput,
} from "@/lib/data/food-service-supabase";
import { FSItemCard } from "@/components/food-service/fs-item-card";

export function FoodServicePage() {
  const { user, isAdmin } = useSupabaseAuth();
  const [date, setDate] = useState<string>(todayISO());
  const [rows, setRows] = useState<FSCountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedCats, setExpandedCats] = useState<Set<FSCategory>>(
    () => new Set(["cafe"]),
  );
  const [onlyMine, setOnlyMine] = useState(true);

  // Cargar conteos de la fecha seleccionada
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const data = await pullFSCountsByDate(date);
        if (!cancelled) setRows(data);
      } catch (err) {
        console.error("[food-service-page] pull falló:", err);
        toast.error("No se pudieron cargar los conteos.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [date]);

  // Índice por product_code (para búsqueda rápida)
  const rowsByCode = useMemo(() => {
    const map = new Map<string, FSCountRow>();
    for (const r of rows) {
      // Si es admin y hay varios usuarios, quedarse con el primero del propio
      // (por ahora tomamos el más reciente)
      const existing = map.get(r.product_code);
      if (!existing || r.updated_at > existing.updated_at) {
        map.set(r.product_code, r);
      }
    }
    return map;
  }, [rows]);

  // Filtrar productos por búsqueda
  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return FS_PRODUCTS;
    return FS_PRODUCTS.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q),
    );
  }, [search]);

  // Agrupar por categoría
  const grouped = useMemo(() => {
    const map: Record<FSCategory, FSProduct[]> = {
      cafe: [],
      ingredientes: [],
      desechables: [],
      granitas: [],
      pan: [],
      salsas: [],
    };
    for (const p of filteredProducts) {
      map[p.category].push(p);
    }
    return map;
  }, [filteredProducts]);

  // Al guardar una card
  const handleSave = async (input: FSCountInput) => {
    try {
      const saved = await pushFSCount(input);
      setRows((prev) => {
        const idx = prev.findIndex((r) => r.id === saved.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = saved;
          return next;
        }
        // Si no estaba, y es de otro código con la misma fecha, reemplazar
        const otherIdx = prev.findIndex(
          (r) => r.product_code === saved.product_code && r.count_date === saved.count_date,
        );
        if (otherIdx >= 0) {
          const next = [...prev];
          next[otherIdx] = saved;
          return next;
        }
        return [...prev, saved];
      });
    } catch (err) {
      console.error("[food-service-page] save falló:", err);
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Error al guardar: ${msg}`);
      throw err;
    }
  };

  // Al borrar una card
  const handleDelete = async (id: string) => {
    try {
      await deleteFSCount(id);
      setRows((prev) => prev.filter((r) => r.id !== id));
      toast.success("Conteo eliminado");
    } catch (err) {
      console.error("[food-service-page] delete falló:", err);
      toast.error("No se pudo borrar el conteo.");
    }
  };

  const toggleCategory = (cat: FSCategory) => {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  // Contar cuántos productos tienen datos hoy
  const filledCount = rows.filter((r) => r.count_date === date).length;

  return (
    <main className="pb-24">
      <PageHeader
        eyebrow="Conteo diario"
        title="Food Service"
        description={
          filledCount > 0
            ? `${filledCount} producto${filledCount === 1 ? "" : "s"} con datos`
            : "Ingresa los gramos abiertos, sellados y sistema"
        }
      />

      <div className="px-4 pb-4">
        {/* Fecha */}
        <div className="flex items-center gap-2">
          <Calendar className="size-4 text-muted-foreground" />
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="flex-1"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setDate(todayISO())}
          >
            Hoy
          </Button>
        </div>

        {/* Filtro admin */}
        {isAdmin && (
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              variant={onlyMine ? "default" : "outline"}
              size="sm"
              onClick={() => setOnlyMine(true)}
            >
              <User className="size-4" /> Míos
            </Button>
            <Button
              type="button"
              variant={!onlyMine ? "default" : "outline"}
              size="sm"
              onClick={() => setOnlyMine(false)}
            >
              <Users className="size-4" /> Todos
            </Button>
          </div>
        )}

        {/* Buscador */}
        <div className="mt-3 relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar producto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Lista por categoría */}
      <div className="flex flex-col gap-2 px-4">
        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Cargando...
          </p>
        ) : filteredProducts.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No hay productos que coincidan.
          </p>
        ) : (
          (Object.keys(grouped) as FSCategory[]).map((cat) => {
            const items = grouped[cat];
            if (items.length === 0) return null;
            const isOpen = expandedCats.has(cat);
            const catFilled = items.filter((p) => rowsByCode.has(p.code)).length;

            return (
              <div key={cat} className="rounded-xl border bg-card overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleCategory(cat)}
                  className="w-full flex items-center gap-2 px-4 py-3 hover:bg-muted/40 transition-colors"
                >
                  <ChevronDown
                    className={cn(
                      "size-4 transition-transform text-muted-foreground",
                      !isOpen && "-rotate-90",
                    )}
                  />
                  <h2 className="flex-1 text-left font-medium">
                    {FS_CATEGORY_LABEL[cat]}
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    {catFilled}/{items.length}
                  </span>
                </button>

                {isOpen && (
                  <div className="flex flex-col gap-2 border-t bg-muted/20 p-3">
                    {items.map((product) => (
                      <FSItemCard
                        key={product.code}
                        product={product}
                        existing={rowsByCode.get(product.code) ?? null}
                        date={date}
                        onSave={handleSave}
                        onDelete={handleDelete}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </main>
  );
}
