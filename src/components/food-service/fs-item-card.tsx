/**
 * Card expandible para un producto de Food Service.
 * Muestra los inputs (abiertos, sellados, sistema) y el resultado calculado.
 */
import { useState, useEffect, useRef } from "react";
import { ChevronDown, Check, AlertTriangle, X, Save, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FSProduct, FSUnit } from "@/lib/vigia/food-service-catalog";
import {
  FS_UNIT_LABEL,
  FS_UNIT_SHORT,
  convertUnit,
  getCompatibleUnits,
} from "@/lib/vigia/food-service-catalog";
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

  // Parciales para "Abiertos" (sumadora simple)
  const [parciales, setParciales] = useState<number[]>([]);
  const [parcialInput, setParcialInput] = useState("");
  // Unidad en la que el usuario ingresa los valores de "Abiertos"
  const [abiertosUnit, setAbiertosUnit] = useState<FSUnit>(
    product.unit as FSUnit,
  );

  // Cuando cambia el existing (por pull), actualizar los inputs
  // IMPORTANTE: NO reseteamos abiertosUnit para no perder la elección del usuario
  useEffect(() => {
    setOpened(existing?.opened != null ? String(existing.opened) : "");
    setSealed(existing?.sealed != null ? String(existing.sealed) : "");
    setSystemQty(existing?.system_qty != null ? String(existing.system_qty) : "");
    setParciales([]);
    setParcialInput("");
  }, [existing?.id]);

  // Cálculo en vivo
  const numOpenedRaw = opened === "" ? null : Number(opened);
  // Convertir el valor ingresado a la unidad de la fórmula (product.unit)
  const numOpened =
    numOpenedRaw != null && Number.isFinite(numOpenedRaw)
      ? convertUnit(numOpenedRaw, abiertosUnit, product.unit as FSUnit)
      : null;
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

  // ============ SUMADORA DE PARCIALES (SIMPLE) ============

  const sumaParciales = parciales.reduce((a, b) => a + b, 0);

  // Agrega el valor del input a la suma
  const addParcial = () => {
    const n = Number(parcialInput);
    if (!Number.isFinite(n) || n <= 0) return;
    const next = [...parciales, n];
    setParciales(next);
    setParcialInput("");
    const suma = next.reduce((a, b) => a + b, 0);
    setOpened(String(suma));
    scheduleSave();
    window.setTimeout(() => parcialInputRef.current?.focus(), 0);
  };

  // Limpia todos los parciales
  const clearParciales = () => {
    setParciales([]);
    setParcialInput("");
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

              <div className="mt-1 flex gap-2">
                <Input
                  ref={parcialInputRef}
                  type="number"
                  inputMode="decimal"
                  value={parciales.length > 0 ? parcialInput : opened}
                  onChange={(e) => {
                    if (parciales.length > 0) {
                      setParcialInput(e.target.value);
                    } else {
                      handleChange(setOpened)(e.target.value);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      parciales.length > 0 &&
                      parcialInput.trim()
                    ) {
                      e.preventDefault();
                      const valor = e.currentTarget.value.trim();
                      const n = Number(valor);
                      if (Number.isFinite(n) && n > 0) {
                        const next = [...parciales, n];
                        setParciales(next);
                        setParcialInput("");
                        const suma = next.reduce((a, b) => a + b, 0);
                        setOpened(String(suma));
                        scheduleSave();
                        window.setTimeout(
                          () => parcialInputRef.current?.focus(),
                          0,
                        );
                      }
                    }
                  }}
                  placeholder="0"
                  className="flex-1"
                  disabled={readOnly}
                />
                {!readOnly && (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 rounded-xl px-3"
                    onClick={() => {
                      // Primer click: activar modo sumar (agrega el valor actual)
                      const valor = parciales.length > 0 ? parcialInput : opened;
                      const n = Number(valor);
                      if (!Number.isFinite(n) || n <= 0) return;
                      const next = [...parciales, n];
                      setParciales(next);
                      setParcialInput("");
                      const suma = next.reduce((a, b) => a + b, 0);
                      setOpened(String(suma));
                      scheduleSave();
                      window.setTimeout(
                        () => parcialInputRef.current?.focus(),
                        0,
                      );
                    }}
                    disabled={
                      parciales.length > 0
                        ? !parcialInput.trim()
                        : !opened.trim()
                    }
                    aria-label="Sumar"
                  >
                    <Plus className="size-4" />
                  </Button>
                )}
                <select
                  value={abiertosUnit}
                  onChange={(e) => {
                    setAbiertosUnit(e.target.value as FSUnit);
                    scheduleSave();
                  }}
                  disabled={readOnly}
                  className="h-11 rounded-xl border border-transparent bg-muted/50 px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus:bg-card focus:border-input focus:ring-2 focus:ring-ring/20 disabled:opacity-50"
                >
                  {getCompatibleUnits(product).map((u) => (
                    <option key={u} value={u}>
                      {FS_UNIT_LABEL[u]}
                    </option>
                  ))}
                </select>
              </div>

              {/* Suma acumulada (si hay parciales) */}
              {parciales.length > 0 && (
                <div className="mt-2 flex items-center justify-between rounded-lg bg-primary/10 px-3 py-2">
                  <span className="text-xs font-medium text-primary">
                    Suma acumulada ({parciales.length})
                  </span>
                  <span className="text-base font-semibold tabular text-primary">
                    {sumaParciales}
                  </span>
                </div>
              )}

              {/* Conversión automática si la unidad elegida ≠ unidad de la fórmula */}
              {abiertosUnit !== product.unit &&
                opened !== "" &&
                Number.isFinite(Number(opened)) && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    ≈ {convertUnit(Number(opened), abiertosUnit, product.unit as FSUnit).toFixed(2)}{" "}
                    {FS_UNIT_LABEL[product.unit as FSUnit]}
                  </p>
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
