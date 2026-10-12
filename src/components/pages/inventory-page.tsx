import { useMemo, useState } from "react";
import { Plus, Search, User, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { useSidebarStore } from "@/lib/vigia/sidebar";
import { ProductCard } from "@/components/product-card";
import { ProductSheet } from "@/components/product-sheet";
import { ProductForm, emptyDraft } from "@/components/product-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { productStatus } from "@/lib/vigia/dates";
import { useSupabaseAuth } from "@/lib/auth/supabase-auth";
import { useUserEmails } from "@/lib/auth/use-user-emails";
import { useVigiaStore } from "@/lib/vigia/store";
import {
  CATEGORY_LABEL,
  LOCATION_LABEL,
  type Product,
  type ProductCategory,
  type ProductStatus,
  type StoreLocation,
} from "@/lib/vigia/types";
import { toast } from "sonner";

export function InventoryPage() {
  const products = useVigiaStore((s) => s.products);
  const settings = useVigiaStore((s) => s.settings);
  const setSidebarOpen = useSidebarStore((s) => s.setOpen);
  const upsert = useVigiaStore((s) => s.upsertProduct);
  const soonWithin = Math.max(...settings.days, 30);
  const { user, isAdmin } = useSupabaseAuth();
  const { emails } = useUserEmails();
  const [q, setQ] = useState("");
  const [ownerFilter, setOwnerFilter] = useState<"all" | "mine" | string>("all");
  const [status, setStatus] = useState<"all" | ProductStatus>("all");
  const [category, setCategory] = useState<"all" | ProductCategory>("all");
  const [subcategory, setSubcategory] = useState<"all" | string>("all");
  const [location, setLocation] = useState<"all" | StoreLocation>("all");
  const [selected, setSelected] = useState<Product | null>(null);

  const [creating, setCreating] = useState(false);

  // Usuarios que tienen productos en el inventario (para el filtro de admin)
  const ownersInInventory = useMemo(() => {
    const ids = new Set<string>();
    for (const p of products) {
      if (p.userId) ids.add(p.userId);
    }
    return Array.from(ids);
  }, [products]);

  const availableSubcategories = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      if (category !== "all" && p.category !== category) continue;
      if (p.subcategory) set.add(p.subcategory);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [products, category]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return products.filter((p) => {
      // Filtro de dueño (solo admin)
      if (isAdmin && ownerFilter !== "all") {
        if (ownerFilter === "mine") {
          if (p.userId && p.userId !== user?.id) return false;
        } else {
          // ownerFilter es un userId específico
          if (p.userId !== ownerFilter) return false;
        }
      }
      if (status !== "all" && productStatus(p, soonWithin) !== status) return false;
      if (category !== "all" && p.category !== category) return false;
      if (subcategory !== "all" && p.subcategory !== subcategory) return false;
      if (location !== "all" && p.location !== location) return false;
      if (!needle) return true;
      return (
        p.name.toLowerCase().includes(needle) ||
        p.brand.toLowerCase().includes(needle) ||
        p.barcode.includes(needle)
      );
    });
  }, [products, q, status, category, subcategory, location, soonWithin, isAdmin, ownerFilter, user?.id]);

  return (
    <main>
      <PageHeader onMenuClick={() => setSidebarOpen(true)}
        eyebrow="Control"
        title="Vencimientos"
        description={`${filtered.length} de ${products.length} productos en control`}
        action={
          <Button size="icon" aria-label="Alta manual" onClick={() => setCreating(true)}>
            <Plus className="size-5" />
          </Button>
        }
      />

      <div className="flex flex-col gap-2 px-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-10"
            placeholder="Buscar por nombre, marca o código"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Buscar productos"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {isAdmin && ownersInInventory.length > 0 && (
            <Select
              value={ownerFilter}
              onValueChange={(v) => setOwnerFilter(v)}
            >
              <SelectTrigger aria-label="Filtrar por dueño">
                <SelectValue placeholder="Dueño" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  <span className="inline-flex items-center gap-2">
                    <Users className="size-3.5" />
                    Todos
                  </span>
                </SelectItem>
                <SelectItem value="mine">
                  <span className="inline-flex items-center gap-2">
                    <User className="size-3.5" />
                    Míos
                  </span>
                </SelectItem>
                {ownersInInventory
                  .filter((uid) => uid !== user?.id)
                  .map((uid) => {
                    const email = emails.get(uid) ?? "usuario";
                    const short = email.split("@")[0];
                    return (
                      <SelectItem key={uid} value={uid}>
                        <span className="inline-flex items-center gap-2">
                          <User className="size-3.5" />
                          {short}
                        </span>
                      </SelectItem>
                    );
                  })}
              </SelectContent>
            </Select>
          )}
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger aria-label="Estado">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="ok">Vigentes</SelectItem>
              <SelectItem value="soon">Por vencer</SelectItem>
              <SelectItem value="expired">Vencidos</SelectItem>
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={(v) => setCategory(v as typeof category)}>
            <SelectTrigger aria-label="Categoría">
              <SelectValue placeholder="Categoría" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Categoría</SelectItem>
              {(Object.keys(CATEGORY_LABEL) as ProductCategory[]).map((c) => (
                <SelectItem key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {availableSubcategories.length > 0 ? (
            <Select
              value={subcategory}
              onValueChange={(v) => setSubcategory(v as typeof subcategory)}
            >
              <SelectTrigger aria-label="Subcategoría">
                <SelectValue placeholder="Subcategoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Subcategoría</SelectItem>
                {availableSubcategories.map((sc) => (
                  <SelectItem key={sc} value={sc}>
                    {sc}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}

          <Select value={location} onValueChange={(v) => setLocation(v as typeof location)}>
            <SelectTrigger aria-label="Ubicación">
              <SelectValue placeholder="Ubicación" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Ubicación</SelectItem>
              {(Object.keys(LOCATION_LABEL) as StoreLocation[]).map((c) => (
                <SelectItem key={c} value={c}>
                  {LOCATION_LABEL[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 px-4">
        {filtered.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            No hay productos con esos filtros. Prueba otra búsqueda o registra uno nuevo.
          </Card>
        ) : (
          filtered.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              soonWithin={soonWithin}
              onClick={() => setSelected(p)}
            />
          ))
        )}
      </div>

      <ProductSheet
        product={selected}
        open={Boolean(selected)}
        onOpenChange={(o) => !o && setSelected(null)}
      />

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alta manual</DialogTitle>
            <DialogDescription>
              Úsalo si el código no aparece en los catálogos. La próxima vez lo
              reconoceremos al instante.
            </DialogDescription>
          </DialogHeader>
          <ProductForm
            initial={emptyDraft()}
            submitLabel="Guardar producto"
            onCancel={() => setCreating(false)}
            onSubmit={async (draft) => {
              await upsert(draft);
              toast.success("Listo. Ya guardamos este producto.");
              setCreating(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </main>
  );
}
