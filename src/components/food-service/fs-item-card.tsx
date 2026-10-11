/**
 * Card expandible para un producto de Food Service.
 * Muestra los inputs (abiertos, sellados, sistema) y el resultado calculado.
 */
import { useState, useEffect, useRef } from "react";
import { ChevronDown, Check, AlertTriangle, X, Save, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FSProduct } from "@/lib/vigia/food-service-catalog";
import { calcFSItem, formatFSNumber } from "@/lib/vigia/food-service-calc";
import type { FSCountRow, FSCountInput } from "@/lib/data/food-service-supabase";

interface Props {
  product: FSProduct;
  /** Conteo existente en Supabase (si hay) */
  existing: FSCountRow | null;
  /** Fecha del conteo (YYYY-MM-DD) */
  date: string;
  /** Se llama cuando el usuario guarda */
  onSave: (input: FSCountInput) => Promise<void>;
  /** Se llama cuando el usuario borra el conteo */
  onDelete?: (id: string) => Promise<void>;
  /** Si true, no permite editar (solo lectura) */
  readOnly?: boolean;
}

export function FSItemCard({ product, existing, date, onSave, onDelete, readOnly = false }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [opened, setOpened] = useState<string>(
    existing?.opened != null ? String(existing.opened) : "",
  );
  const [sealed, setSealed] = useState<string>(
    existing?.sealed != null ? String(existing.sealed) : "",
  );
  const [systemQty, setSystemQty] = useState<string>(
    existing?.system_qty != null ? String(existing.system_qty) : "",
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const debounceRef = useRef<number | null>(null);
  const parcialInputRef = useRef<HTMLInputElement | null>(null);

  // Parciales para "Abiertos" (sumadora)
  const [parciales, setParciales] = useState<number[]>([]);
  const [parcialInput, setParcialInput] = useState("");
  const [addingParcial, setAddingParcial] = useState(false);

  // Cuando cambia el existing (por pull), actualizar los inputs
  useEffect(() => {
    setOpened(existing?.opened != null ? String(existing.opened) : "");
    setSealed(existing?.sealed != null ? String(existing.sealed) : "");
    setSystemQty(existing?.system_qty != null ? String(existing.system_qty) : "");
    setParciales([]);
    setParcialInput("");
    setAddingParcial(false);
  }, [existing?.id]);

  // Cálculo en vivo
  const numOpened = opened === "" ? null : Number(opened);
  const numSealed = sealed === "" ? null : Number(sealed);
  const numSystem = systemQty === "" ? null : Number(systemQty);

  const result = calcFSItem(product, {
    opened: Number.isFinite(numOpened) ? numOpened : null,
    sealed: Number.isFinite(numSealed) ? numSealed : null,
    system_qty: Number.isFinite(numSystem) ? numSystem : null,
  });

  // Auto-save con debounce de 800ms
  const scheduleSave = () => {
    if (readOnly) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      // Solo guardar si hay al menos un valor
      if (opened === "" && sealed === "" && systemQty === "") return;
      setSaving(true);
      try {
        await onSave({
          product_code: product.code,
          product_name: product.name,
          category: product.category,
          unit: product.unit,
          container_weight: product.containerWeight,
          unit_weight: product.unitWeight,
          opened: Number.isFinite(numOpened) ? numOpened : null,
          sealed: Number.isFinite(numSealed) ? numSealed : null,
          system_qty: Number.isFinite(numSystem) ? numSystem : null,
          count_date: date,
        });
        setSaved(true);
        window.setTimeout(() => setSaved(false), 1500);
      } catch (err) {
        console.error("[fs-item-card] save falló:", err);
      } finally {
        setSaving(false);
      }
    }, 800);
  };

  const handleChange = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    scheduleSave();
  };

  // ============ SUMADORA DE PARCIALES ============

  const sumaParciales = parciales.reduce((a, b) => a + b, 0);

  const addParcial = () => {
    const n = Number(parcialInput);
    if (!Number.isFinite(n) || n <= 0) return;
    const next = [...parciales, n];
    setParciales(next);
    setParcialInput("");
    // Asegurar que el input siga abierto
    setAddingParcial(true);
    const suma = next.reduce((a, b) => a + b, 0);
    setOpened(String(suma));
    scheduleSave();
    // Devolver el foco al input (útil en móvil para no cerrar el teclado)
    window.setTimeout(() => {
      parcialInputRef.current?.focus();
    }, 0);
  };

  const removeParcial = (idx: number) => {
    const next = parciales.filter((_, i) => i !== idx);
    setParciales(next);
    if (next.length === 0) {
      setOpened("");
    } else {
      const suma = next.reduce((a, b) => a + b, 0);
      setOpened(String(suma));
    }
    scheduleSave();
  };

  const clearParciales = () => {
    setParciales([]);
    setParcialInput("");
    setAddingParcial(false);
    setOpened("");
    scheduleSave();
  };

  const statusIcon = {
    ok: <Check className="size-4 text-emerald-600" />,
    sobra: <AlertTriangle className="size-4 text-amber-600" />,
    falta: <X className="size-4 text-red-600" />,
    incompleto: null,
  }[result.status];

  const statusColor = {
    ok: "text-emerald-700",
    sobra: "text-amber-700",
    falta: "text-red-700",
    incompleto: "text-muted-foreground",
  }[result.status];

  const hasData = opened !== "" || sealed !== "" || systemQty !== "";

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
      >
        <ChevronDown
          className={cn(
            "size-4 shrink-0 transition-transform text-muted-foreground",
            expanded && "rotate-180",
          )}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-sm">{product.name}</p>
          <p className="text-xs text-muted-foreground">
            {product.unitWeight}
            {product.unit === "gramo" ? "g" : ""} · {product.unit}
          </p>
        </div>
        {hasData && (
          <div className="flex items-center gap-2 shrink-0">
            {statusIcon}
            <span className={cn("text-xs font-medium", statusColor)}>
              {result.label}
            </span>
          </div>
        )}
        {saving && (
          <span className="text-xs text-muted-foreground shrink-0">…</span>
        )}
        {saved && !saving && (
          <Save className="size-3.5 text-emerald-600 shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="border-t bg-muted/20 px-4 py-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-3">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Abiertos ({product.unit})
                </label>
                {!readOnly && parciales.length === 0 && (
                  <button
                    type="button"
                    onClick={() => setAddingParcial((v) => !v)}
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20"
                  >
                    <Plus className="size-3" />
                    Sumar parciales
                  </button>
                )}
                {!readOnly && parciales.length > 0 && (
                  <button
                    type="button"
                    onClick={clearParciales}
                    className="inline-flex items-center gap-1 rounded-full bg-bad-soft px-2 py-1 text-[11px] font-medium text-bad transition-colors hover:bg-bad-soft/70"
                  >
                    <Trash2 className="size-3" />
                    Limpiar
                  </button>
                )}
              </div>
              <Input
                type="number"
                inputMode="decimal"
                value={opened}
                onChange={(e) => handleChange(setOpened)(e.target.value)}
                placeholder="0"
                className="mt-1"
                disabled={readOnly || parciales.length > 0}
              />

              {/* Sumadora de parciales */}
              {parciales.length > 0 && (
                <div className="mt-2 rounded-lg bg-background/60 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Parciales ({parciales.length})
                    </p>
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => setAddingParcial((v) => !v)}
                        className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20"
                      >
                        <Plus className="size-3" />
                        {addingParcial ? "Cerrar" : "Añadir"}
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {parciales.map((p, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => !readOnly && removeParcial(i)}
                        disabled={readOnly}
                        className="group inline-flex items-center gap-1 rounded-full bg-card px-2.5 py-1 text-xs font-medium tabular transition-colors hover:bg-bad-soft disabled:cursor-default"
                        title={readOnly ? "" : "Toca para quitar"}
                      >
                        {formatFSNumber(p)}
                        {!readOnly && (
                          <X className="size-3 opacity-40 group-hover:opacity-100" />
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Total destacado */}
                  <div className="mt-3 flex items-center justify-between rounded-lg bg-primary/10 px-3 py-2">
                    <span className="text-xs font-medium text-primary">
                      Total
                    </span>
                    <span className="text-base font-semibold tabular text-primary">
                      {formatFSNumber(sumaParciales)}
                    </span>
                  </div>
                </div>
              )}

              {/* Input para agregar parcial */}
              {addingParcial && !readOnly && (
                <div className="mt-2 flex gap-2">
                  <Input
                    ref={parcialInputRef}
                    type="number"
                    inputMode="decimal"
                    value={parcialInput}
                    onChange={(e) => setParcialInput(e.target.value)}
                    placeholder="Ej. 356"
                    className="flex-1 h-9"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addParcial();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="h-9"
                    onClick={addParcial}
                    disabled={!parcialInput.trim()}
                  >
                    Añadir
                  </Button>
                </div>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Sellados
              </label>
              <Input
                type="number"
                inputMode="decimal"
                value={sealed}
                onChange={(e) => handleChange(setSealed)(e.target.value)}
                placeholder="0"
                className="mt-1"
                disabled={readOnly}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Sistema
              </label>
              <Input
                type="number"
                inputMode="decimal"
                value={systemQty}
                onChange={(e) => handleChange(setSystemQty)(e.target.value)}
                placeholder="0"
                className="mt-1"
                disabled={readOnly}
              />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3 rounded-md bg-background/60 p-3 text-center">
            <div>
              <p className="text-xs text-muted-foreground">Producción</p>
              <p className="text-sm font-semibold">
                {hasData ? formatFSNumber(result.production) : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Inventario</p>
              <p className="text-sm font-semibold">
                {hasData ? formatFSNumber(result.inventory) : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Diferencia</p>
              <p className={cn("text-sm font-semibold", statusColor)}>
                {hasData ? result.label : "—"}
              </p>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Contenedor: {product.containerWeight} · Unitario: {product.unitWeight}
            </span>
            {existing && onDelete && !readOnly && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-red-600 hover:text-red-700"
                onClick={() => void onDelete(existing.id)}
              >
                Borrar
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
