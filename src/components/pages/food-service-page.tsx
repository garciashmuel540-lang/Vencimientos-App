/**
 * Pantalla principal de Food Service.
 * - Modo "Míos": edita tus propios conteos.
 * - Modo "Todos" (admin): lista de usuarios, y al tocar uno se ven sus conteos (solo lectura).
 */
import { useEffect, useMemo, useState } from "react";
import { Calendar, Search, ChevronDown, Users, User, ArrowLeft, ChevronRight, Coffee, Utensils, Package, CupSoda, Sandwich, Share2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { useSidebarStore } from "@/lib/vigia/sidebar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { domToPng } from "modern-screenshot";
import { useSupabaseAuth } from "@/lib/auth/supabase-auth";
import { useUserEmails } from "@/lib/auth/use-user-emails";
import { toShortEmail } from "@/lib/auth/user-utils";
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
import { calcFSItem } from "@/lib/vigia/food-service-calc";
import { FSItemCard } from "@/components/food-service/fs-item-card";

/**
 * Configuración visual de cada categoría de Food Service.
 */
const CATEGORY_META: Record<FSCategory, {
  icon: typeof Coffee;
  bg: string;
  iconColor: string;
  subtitle: string;
}> = {
  cafe: {
    icon: Coffee,
    bg: "bg-amber-50 dark:bg-amber-950/30",
    iconColor: "text-amber-700 dark:text-amber-400",
    subtitle: "Cappuccino, Nescafé, KIT KAT",
  },
  ingredientes: {
    icon: Utensils,
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
    iconColor: "text-emerald-700 dark:text-emerald-400",
    subtitle: "Salsas, pan, salchichas",
  },
  desechables: {
    icon: Package,
    bg: "bg-blue-50 dark:bg-blue-950/30",
    iconColor: "text-blue-700 dark:text-blue-400",
    subtitle: "Vasos, tapas, servilletas",
  },
  granitas: {
    icon: CupSoda,
    bg: "bg-pink-50 dark:bg-pink-950/30",
    iconColor: "text-pink-700 dark:text-pink-400",
    subtitle: "Vasos, pajillas, tapas",
  },
  pan: {
    icon: Sandwich,
    bg: "bg-orange-50 dark:bg-orange-950/30",
    iconColor: "text-orange-700 dark:text-orange-400",
    subtitle: "Pan hot dog, salchichas",
  },
  salsas: {
    icon: Utensils,
    bg: "bg-red-50 dark:bg-red-950/30",
    iconColor: "text-red-700 dark:text-red-400",
    subtitle: "Salsas y aderezos",
  },
};

export function FoodServicePage() {
  const { user, isAdmin } = useSupabaseAuth();
  const setSidebarOpen = useSidebarStore((s) => s.setOpen);
  const { emails } = useUserEmails();

  const [date, setDate] = useState<string>(todayISO());
  const [rows, setRows] = useState<FSCountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedCats, setExpandedCats] = useState<Set<FSCategory>>(
    () => new Set(["cafe"]),
  );
  const [onlyMine, setOnlyMine] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

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

  // Al cambiar de modo, resetear el usuario seleccionado
  useEffect(() => {
    setSelectedUserId(null);
  }, [onlyMine, date]);

  // Filtrar filas según el modo
  const visibleRows = useMemo(() => {
    if (onlyMine) {
      return rows.filter((r) => r.user_id === user?.id);
    }
    if (selectedUserId) {
      return rows.filter((r) => r.user_id === selectedUserId);
    }
    return rows;
  }, [rows, onlyMine, user?.id, selectedUserId]);

  // Índice por product_code
  const rowsByCode = useMemo(() => {
    const map = new Map<string, FSCountRow>();
    for (const r of visibleRows) {
      const existing = map.get(r.product_code);
      if (!existing || r.updated_at > existing.updated_at) {
        map.set(r.product_code, r);
      }
    }
    return map;
  }, [visibleRows]);

  // Agrupar por usuario (para modo "Todos")
  const usersWithCounts = useMemo(() => {
    const map = new Map<string, FSCountRow[]>();
    for (const r of rows) {
      const arr = map.get(r.user_id) ?? [];
      arr.push(r);
      map.set(r.user_id, arr);
    }
    const list: {
      userId: string;
      email: string;
      count: number;
      diffs: number;
    }[] = [];
    for (const [uid, list2] of map.entries()) {
      let diffs = 0;
      for (const c of list2) {
        const product = FS_PRODUCTS.find((p) => p.code === c.product_code);
        if (!product) continue;
        const calc = calcFSItem(product, {
          opened: c.opened,
          sealed: c.sealed,
          system_qty: c.system_qty,
        });
        if (calc.status !== "ok" && calc.status !== "incompleto") diffs++;
      }
      list.push({
        userId: uid,
        email: emails.get(uid) ?? uid,
        count: list2.length,
        diffs,
      });
    }
    return list.sort((a, b) => a.email.localeCompare(b.email));
  }, [rows, emails]);

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
        const otherIdx = prev.findIndex(
          (r) =>
            r.product_code === saved.product_code &&
            r.count_date === saved.count_date &&
            r.user_id === saved.user_id,
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

  const filledCount = visibleRows.filter((r) => r.count_date === date).length;
  const selectedEmail = selectedUserId
    ? emails.get(selectedUserId) ?? selectedUserId
    : null;

  // ========== MODO "TODOS" SIN USUARIO SELECCIONADO ==========
  const showUsersList = isAdmin && !onlyMine && !selectedUserId;
  // ========== MODO DETALLE DE UN USUARIO ==========
  const showUserDetail = isAdmin && !onlyMine && Boolean(selectedUserId);

  // Compartir tabla de resultados de una categoría
  const shareCategoryTable = async (cat: FSCategory) => {
    const items = grouped[cat];
    if (!items || items.length === 0) {
      toast.error("No hay productos en esta categoría");
      return;
    }

    // Preparar las filas
    const rowsData = items.map((product) => {
      const count = rowsByCode.get(product.code) ?? null;
      const hasData =
        count &&
        count.opened != null &&
        count.sealed != null &&
        count.system_qty != null;
      const calc = hasData
        ? calcFSItem(product, {
            opened: count.opened,
            sealed: count.sealed,
            system_qty: count.system_qty,
          })
        : null;
      return { product, calc, hasData, count };
    });

    // Construir HTML temporal (oculto)
    const container = document.createElement("div");
    container.style.position = "fixed";
    container.style.top = "0";
    container.style.left = "0";
    container.style.width = "720px";
    container.style.padding = "24px";
    container.style.background = "#F7F5F1";
    container.style.zIndex = "-1";
    container.style.opacity = "0.01";
    container.style.fontFamily =
      "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

    const dateFormatted = new Date(date + "T12:00:00").toLocaleDateString(
      "es",
      { day: "numeric", month: "long", year: "numeric" },
    );

    const rowsHtml = rowsData
      .map(({ product, calc, hasData, count }) => {
        const name = product.name
          .replace(/^FSI /, "")
          .replace(/\s+/g, " ")
          .slice(0, 40);
        if (!hasData || !calc) {
          return `
            <tr style="border-bottom:1px solid #E5E1D8">
              <td style="padding:10px 12px;font-size:13px;color:#6b6b6b">${name}</td>
              <td style="padding:10px 12px;text-align:center;color:#a8a5a0">—</td>
              <td style="padding:10px 12px;text-align:center;color:#a8a5a0">—</td>
              <td style="padding:10px 12px;text-align:center;color:#a8a5a0">—</td>
              <td style="padding:10px 12px;text-align:right;font-size:12px;color:#a8a5a0">Sin datos</td>
            </tr>`;
        }
        const diff = calc.difference;
        const diffText =
          diff === 0
            ? "0.00"
            : diff > 0
              ? `+${diff.toFixed(2)}`
              : diff.toFixed(2);
        const statusColor =
          calc.status === "ok"
            ? "#2A5547"
            : calc.status === "sobra"
              ? "#B8860B"
              : "#B04A3C";
        const statusBg =
          calc.status === "ok"
            ? "#E3EBE6"
            : calc.status === "sobra"
              ? "#F5EBD8"
              : "#F5DAD6";
        const systemQty = count?.system_qty ?? 0;
        return `
            <tr style="border-bottom:1px solid #E5E1D8">
              <td style="padding:10px 12px;font-size:13px;color:#1a1a1a;font-weight:500">${name}</td>
              <td style="padding:10px 12px;text-align:center;font-size:13px;color:#1a1a1a;font-variant-numeric:tabular-nums">${calc.inventory.toFixed(2)}</td>
              <td style="padding:10px 12px;text-align:center;font-size:13px;color:#1a1a1a;font-variant-numeric:tabular-nums">${systemQty.toFixed(2)}</td>
              <td style="padding:10px 12px;text-align:center;font-size:13px;color:${statusColor};font-weight:600;font-variant-numeric:tabular-nums">${diffText}</td>
              <td style="padding:10px 12px;text-align:right">
                <span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;color:${statusColor};background:${statusBg}">
                  ${calc.status === "ok" ? "OK" : calc.status === "sobra" ? "Sobra" : "Falta"}
                </span>
              </td>
            </tr>`;
      })
      .join("");

    const okCount = rowsData.filter((r) => r.calc?.status === "ok").length;
    const diffCount = rowsData.filter(
      (r) => r.calc && r.calc.status !== "ok" && r.calc.status !== "incompleto",
    ).length;

    container.innerHTML = `
      <div style="background:#FFFFFF;border-radius:20px;padding:28px;box-shadow:0 2px 12px rgba(26,26,26,0.06)">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
          <div style="width:44px;height:44px;border-radius:12px;background:#2A5547;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:18px">V</div>
          <div>
            <div style="font-size:11px;letter-spacing:2px;color:#6b6b6b;text-transform:uppercase">Food Service</div>
            <div style="font-size:20px;font-weight:600;color:#1a1a1a">${FS_CATEGORY_LABEL[cat]}</div>
          </div>
        </div>

        <div style="font-size:12px;color:#6b6b6b;margin-bottom:16px">${dateFormatted}</div>

        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="border-bottom:2px solid #1a1a1a">
              <th style="padding:10px 12px;text-align:left;font-size:11px;color:#6b6b6b;text-transform:uppercase;letter-spacing:1px;font-weight:600">Producto</th>
              <th style="padding:10px 12px;text-align:center;font-size:11px;color:#6b6b6b;text-transform:uppercase;letter-spacing:1px;font-weight:600">Físico</th>
              <th style="padding:10px 12px;text-align:center;font-size:11px;color:#6b6b6b;text-transform:uppercase;letter-spacing:1px;font-weight:600">Sistema</th>
              <th style="padding:10px 12px;text-align:center;font-size:11px;color:#6b6b6b;text-transform:uppercase;letter-spacing:1px;font-weight:600">Diferencia</th>
              <th style="padding:10px 12px;text-align:right;font-size:11px;color:#6b6b6b;text-transform:uppercase;letter-spacing:1px;font-weight:600">Estado</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <div style="margin-top:20px;padding-top:16px;border-top:1px solid #E5E1D8;display:flex;justify-content:space-between;font-size:12px;color:#6b6b6b">
          <span>${rowsData.length} producto${rowsData.length === 1 ? "" : "s"}</span>
          <span>${okCount} OK · ${diffCount} con diferencia</span>
        </div>

        <div style="margin-top:14px;text-align:center;font-size:11px;color:#a8a5a0">
          Generado con Vigía
        </div>
      </div>
    `;

    document.body.appendChild(container);

    try {
      // Toast con info del HTML
      const htmlLen = container.innerHTML.length;
      const rect = container.getBoundingClientRect();
      console.info(`[share] html=${htmlLen}px, w=${rect.width}, h=${rect.height}`);

      // Esperar un momento para que el navegador renderice todo
      await new Promise((r) => setTimeout(r, 300));

      // Intentar esperar las fuentes (si están disponibles)
      try {
        await document.fonts.ready;
      } catch {
        /* silencioso */
      }

      console.info("[share] antes de domToPng");
      const dataUrl = await domToPng(container, {
        quality: 1,
        scale: 2,
        backgroundColor: "#F7F5F1",
        debug: false,
      });
      console.info(
        `[share] dataUrl length=${dataUrl.length}, prefix=${dataUrl.slice(0, 30)}`,
      );

      // Verificar si es una imagen en blanco
      const { toast } = await import("sonner");
      if (dataUrl.length < 5000) {
        toast.error(`Imagen vacía (${dataUrl.length} chars)`);
      } else {
        toast.success(`Imagen OK (${Math.round(dataUrl.length / 1024)}KB)`);
      }

      // Convertir a Blob
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], `vigia-${cat}.png`, {
        type: "image/png",
      });

      // Compartir
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Vigía - ${FS_CATEGORY_LABEL[cat]}`,
          text: `Resultados de ${FS_CATEGORY_LABEL[cat]} - ${dateFormatted}`,
        });
      } else {
        // Fallback: descargar la imagen
        const link = document.createElement("a");
        link.download = `vigia-${cat}.png`;
        link.href = dataUrl;
        link.click();
        toast.success("Imagen descargada");
      }
    } catch (err) {
      console.error("[share] error:", err);
      toast.error("No se pudo compartir la imagen");
    } finally {
      document.body.removeChild(container);
    }
  };

  return (
    <main className="pb-24">
      <PageHeader
        onMenuClick={() => setSidebarOpen(true)}
        eyebrow="Conteo diario"
        title="Food Service"
        description={
          showUsersList
            ? `${usersWithCounts.length} usuario${usersWithCounts.length === 1 ? "" : "s"} con conteos`
            : filledCount > 0
              ? `${filledCount} producto${filledCount === 1 ? "" : "s"} con datos`
              : "Ingresa los gramos abiertos, sellados y sistema"
        }
      />

      <div className="px-4 pb-4">
        {/* Fecha */}
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="flex-1 h-10 rounded-xl"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl h-10"
            onClick={() => setDate(todayISO())}
          >
            Hoy
          </Button>
        </div>

        {/* Filtro admin: Míos / Todos */}
        {isAdmin && (
          <div className="mt-4 flex gap-2">
            <Button
              type="button"
              variant={onlyMine ? "default" : "outline"}
              size="sm"
              className="flex-1 rounded-xl h-10 transition-all duration-200"
              onClick={() => setOnlyMine(true)}
            >
              <User className="size-4" /> Míos
            </Button>
            <Button
              type="button"
              variant={!onlyMine ? "default" : "outline"}
              size="sm"
              className="flex-1 rounded-xl h-10 transition-all duration-200"
              onClick={() => setOnlyMine(false)}
            >
              <Users className="size-4" /> Todos
            </Button>
          </div>
        )}

        {/* Si estamos en detalle de usuario: botón volver */}
        {showUserDetail && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-4 -ml-2 rounded-xl transition-colors"
            onClick={() => setSelectedUserId(null)}
          >
            <ArrowLeft className="size-4" /> Volver a la lista
          </Button>
        )}

        {/* Si estamos en "Míos" o "detalle de un usuario": mostrar buscador */}
        {!showUsersList && (
          <div className="mt-3 relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar producto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        )}
      </div>

      {/* ========== LISTA DE USUARIOS (modo "Todos" sin selección) ========== */}
      {showUsersList && (
        <div className="flex flex-col gap-2 px-4">
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Cargando...
            </p>
          ) : usersWithCounts.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No hay conteos de usuarios para esta fecha.
            </p>
          ) : (
            usersWithCounts.map((u) => (
              <button
                key={u.userId}
                type="button"
                onClick={() => setSelectedUserId(u.userId)}
                className="group flex items-center gap-3 rounded-2xl border bg-card p-4 text-left transition-all duration-200 hover:bg-muted/40 hover:border-primary/30 active:scale-[0.99]"
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <User className="size-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {toShortEmail(u.email)}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {u.email}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {u.count} producto{u.count === 1 ? "" : "s"}
                    {u.diffs > 0 ? (
                      <>
                        {" · "}
                        <span className="text-red-600 font-medium">
                          {u.diffs} con diferencia{u.diffs === 1 ? "" : "s"}
                        </span>
                      </>
                    ) : (
                      <> · sin diferencias</>
                    )}
                  </p>
                </div>
                <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary" />
              </button>
            ))
          )}
        </div>
      )}

      {/* ========== DETALLE DE UN USUARIO O "MÍOS" ========== */}
      {!showUsersList && (
        <>
          {showUserDetail && selectedEmail && (
            <div className="mb-3 px-4">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary backdrop-blur-sm">
                <User className="size-3.5" />
                <span className="max-w-[200px] truncate">{selectedEmail}</span>
              </div>
            </div>
          )}

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
                const catFilled = items.filter((p) =>
                  rowsByCode.has(p.code),
                ).length;

                return (
                  <div
                    key={cat}
                    className="rounded-2xl border bg-card overflow-hidden transition-all duration-200"
                  >
                    <button
                      type="button"
                      onClick={() => toggleCategory(cat)}
                      className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted/40 transition-colors duration-200"
                    >
                      {/* Ícono de la categoría */}
                      <div
                        className={cn(
                          "flex size-11 shrink-0 items-center justify-center rounded-xl transition-colors",
                          CATEGORY_META[cat].bg,
                        )}
                      >
                        {(() => {
                          const Icon = CATEGORY_META[cat].icon;
                          return (
                            <Icon
                              className={cn(
                                "size-5",
                                CATEGORY_META[cat].iconColor,
                              )}
                            />
                          );
                        })()}
                      </div>

                      {/* Nombre y subtítulo */}
                      <div className="min-w-0 flex-1 text-left">
                        <h2 className="font-medium leading-tight">
                          {FS_CATEGORY_LABEL[cat]}
                        </h2>
                        <p className="truncate text-xs text-muted-foreground mt-0.5">
                          {CATEGORY_META[cat].subtitle}
                        </p>
                      </div>

                      {/* Botón compartir */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void shareCategoryTable(cat);
                        }}
                        className="shrink-0 flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                        aria-label="Compartir tabla"
                        title="Compartir tabla"
                      >
                        <Share2 className="size-3.5" />
                      </button>

                      {/* Contador */}
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium tabular",
                          catFilled > 0
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {catFilled}/{items.length}
                      </span>

                      {/* Chevron */}
                      <ChevronDown
                        className={cn(
                          "size-4 shrink-0 transition-transform duration-200 text-muted-foreground",
                          !isOpen && "-rotate-90",
                        )}
                      />
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
                            readOnly={showUserDetail}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </main>
  );
}
