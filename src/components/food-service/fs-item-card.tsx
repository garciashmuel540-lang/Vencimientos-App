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
import { FS_UNIT_LABEL, convertUnit, getCompatibleUnits } from "@/lib/vigia/food-service-catalog";
import { calcFSItem, formatFSNumber } from "@/lib/vigia/food-service-calc";
import type { FSCountRow, FSCountInput } from "@/lib/data/food-service-supabase";

function parseCount(raw: string) {
  return raw === "" ? null : Number(raw.replace(",", "."));
}

const countDraft = /^\d*(?:[.,]\d*)?$/;

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
  const [abiertosUnit, setAbiertosUnit] = useState<FSUnit>(product.unit as FSUnit);

  const localEdit = useRef(false);
  const writeQueue = useRef(Promise.resolve());
  const previousId = useRef(existing?.id);

  // Cuando cambia el existing (por pull), actualizar los inputs
  // IMPORTANTE: NO reseteamos abiertosUnit para no perder la elección del usuario
  useEffect(() => {
    const deleted = previousId.current && !existing;
    previousId.current = existing?.id;
    if (localEdit.current && !deleted) return;
    localEdit.current = false;
    setAbiertosUnit(product.unit as FSUnit);
    setOpened(existing?.opened != null ? String(existing.opened) : "");
    setSealed(existing?.sealed != null ? String(existing.sealed) : "");
    setSystemQty(existing?.system_qty != null ? String(existing.system_qty) : "");
    setParciales([]);
    setParcialInput("");
  }, [existing?.id, existing?.opened, existing?.sealed, existing?.system_qty, product.unit]);

  // Cálculo en vivo
  const numOpenedRaw = parseCount(opened);
  // Convertir el valor ingresado a la unidad de la fórmula (product.unit)
  const numOpened =
    numOpenedRaw != null && Number.isFinite(numOpenedRaw)
      ? convertUnit(numOpenedRaw, abiertosUnit, product.unit as FSUnit)
      : null;
  const numSealed = parseCount(sealed);
  const numSystem = parseCount(systemQty);

  const result = calcFSItem(product, {
    opened: Number.isFinite(numOpened) ? numOpened : null,
    sealed: Number.isFinite(numSealed) ? numSealed : null,
    system_qty: Number.isFinite(numSystem) ? numSystem : null,
  });

  // Cada guardado lleva los valores de la edición que lo originó.
  const scheduleSave = (
    next: Partial<{ opened: string; sealed: string; system: string; unit: FSUnit }>,
  ) => {
    if (readOnly) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    localEdit.current = true;
    setSaved(false);
    const raw = next.opened ?? opened;
    const closed = next.sealed ?? sealed;
    const system = next.system ?? systemQty;
    const amount = parseCount(raw);
    const numbers = [amount, parseCount(closed), parseCount(system)];
    if (numbers.some((v) => v !== null && !Number.isFinite(v))) return;
    debounceRef.current = window.setTimeout(() => {
      writeQueue.current = writeQueue.current.then(async () => {
        setSaving(true);
        try {
          await onSave({
            product_code: product.code,
            product_name: product.name,
            category: product.category,
            unit: product.unit,
            container_weight: product.containerWeight,
            unit_weight: product.unitWeight,
            opened:
              amount === null
                ? null
                : convertUnit(amount, next.unit ?? abiertosUnit, product.unit as FSUnit),
            sealed: parseCount(closed),
            system_qty: parseCount(system),
            count_date: date,
          });
          setSaved(true);
          window.setTimeout(() => setSaved(false), 1500);
        } catch (err) {
          console.error("[fs-item-card] save falló:", err);
        } finally {
          setSaving(false);
        }
      });
    }, 500);
  };

  // ============ SUMADORA DE PARCIALES (SIMPLE) ============

  const sumaParciales = parciales.reduce((a, b) => a + b, 0);

  // Agrega el valor del input a la suma
  const addParcial = () => {
    const n = Number((parciales.length ? parcialInput : opened).replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return;
    const next = [...parciales, n];
    setParciales(next);
    setParcialInput("");
    const suma = next.reduce((a, b) => a + b, 0);
    setOpened(String(suma));
    scheduleSave({ opened: String(suma) });
    window.setTimeout(() => parcialInputRef.current?.focus(), 0);
  };

  // Limpia todos los parciales
  const clearParciales = () => {
    setParciales([]);
    setParcialInput("");
    setOpened("");
    scheduleSave({ opened: "" });
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
          <p className="font-medium text-sm break-words">{product.name}</p>
          {product.category === "cafe" && (
            <p className="mt-1 text-xs font-medium text-foreground break-all">
              {product.itemCode ? (
                <>Código: <span className="font-mono">{product.itemCode}</span></>
              ) : (
                <span className="text-muted-foreground">Código pendiente</span>
              )}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {product.unitWeight}
            {product.unit === "gramo" ? "g" : ""} · {product.unit}
          </p>
        </div>
        {hasData && (
          <div className="flex items-center gap-2 shrink-0">
            {statusIcon}
            <span className={cn("text-xs font-medium", statusColor)}>{result.label}</span>
          </div>
        )}
        {saving && <span className="text-xs text-muted-foreground shrink-0">…</span>}
        {saved && !saving && <Save className="size-3.5 text-emerald-600 shrink-0" />}
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
                  type="text"
                  inputMode="decimal"
                  value={parciales.length > 0 ? parcialInput : opened}
                  aria-label="Abiertos"
                  onChange={(e) => {
                    if (!countDraft.test(e.target.value)) return;
                    if (parciales.length > 0) {
                      setParcialInput(e.target.value);
                    } else {
                      setOpened(e.target.value);
                      scheduleSave({ opened: e.target.value });
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addParcial();
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
                    onClick={addParcial}
                    disabled={parciales.length > 0 ? !parcialInput.trim() : !opened.trim()}
                    aria-label="Sumar"
                  >
                    <Plus className="size-4" />
                  </Button>
                )}
                <select
                  value={abiertosUnit}
                  onChange={(e) => {
                    setAbiertosUnit(e.target.value as FSUnit);
                    scheduleSave({ unit: e.target.value as FSUnit });
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
                numOpened != null && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    ≈ {numOpened.toFixed(2)}{" "}
                    {FS_UNIT_LABEL[product.unit as FSUnit]}
                  </p>
                )}
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Sellados</label>
              <Input
                type="text"
                inputMode="decimal"
                value={sealed}
                aria-label="Sellados"
                onChange={(e) => {
                  if (!countDraft.test(e.target.value)) return;
                  setSealed(e.target.value);
                  scheduleSave({ sealed: e.target.value });
                }}
                placeholder="0"
                className="mt-1"
                disabled={readOnly}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Sistema</label>
              <Input
                type="text"
                inputMode="decimal"
                value={systemQty}
                aria-label="Sistema"
                onChange={(e) => {
                  if (!countDraft.test(e.target.value)) return;
                  setSystemQty(e.target.value);
                  scheduleSave({ system: e.target.value });
                }}
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
                onClick={async () => {
                  if (debounceRef.current) window.clearTimeout(debounceRef.current);
                  await writeQueue.current;
                  await onDelete(existing.id);
                }}
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
