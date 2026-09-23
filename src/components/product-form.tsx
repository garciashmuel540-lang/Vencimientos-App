import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Camera, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CATEGORY_LABEL,
  LOCATION_LABEL,
  type ProductCategory,
  type StoreLocation,
} from "@/lib/vigia/types";
import type { ProductDraft } from "@/lib/vigia/store";
import { isoDate, todayStart } from "@/lib/vigia/dates";
import { cn } from "@/lib/utils";

const CATEGORIES = Object.keys(CATEGORY_LABEL) as ProductCategory[];
const LOCATIONS = Object.keys(LOCATION_LABEL) as StoreLocation[];

async function compressImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const max = 480;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.72);
}

export function emptyDraft(barcode = ""): ProductDraft {
  return {
    barcode,
    name: "",
    brand: "",
    presentation: "",
    category: "otros",
    expiresAt: isoDate(todayStart()),
    quantity: 1,
    location: "estante",
    notes: "",
    image: null,
    source: "manual",
  };
}

export function ProductForm({
  initial,
  lookingUp,
  foundFromApi,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: ProductDraft;
  lookingUp?: boolean;
  foundFromApi?: boolean;
  submitLabel: string;
  onSubmit: (draft: ProductDraft) => Promise<void> | void;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState<ProductDraft>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(initial);
  }, [initial]);

  function patch<K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function handleImage(file: File | undefined) {
    if (!file) return;
    try {
      patch("image", await compressImage(file));
    } catch {
      setError("No se pudo leer la foto. Prueba con otra.");
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!draft.barcode.trim()) {
      setError("Escribe el código de barras.");
      return;
    }
    if (!draft.name.trim()) {
      setError("Escribe el nombre del producto.");
      return;
    }
    if (!draft.expiresAt) {
      setError("Elige la fecha de vencimiento.");
      return;
    }
    setSaving(true);
    try {
      await onSubmit(draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {foundFromApi ? (
        <p className="rounded-md bg-ok-soft px-3 py-2 text-sm text-ok">
          Encontramos este producto. Revisa los datos y agrega la fecha de vencimiento.
        </p>
      ) : lookingUp ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          Buscando el código en catálogos…
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Código de barras" htmlFor="barcode">
          <Input
            id="barcode"
            inputMode="numeric"
            autoComplete="off"
            value={draft.barcode}
            onChange={(e) => patch("barcode", e.target.value.replace(/\D/g, ""))}
            required
          />
        </Field>
        <Field label="Nombre" htmlFor="name">
          <Input
            id="name"
            value={draft.name}
            onChange={(e) => patch("name", e.target.value)}
            placeholder="Ej. Leche entera"
            required
          />
        </Field>
        <Field label="Marca" htmlFor="brand">
          <Input
            id="brand"
            value={draft.brand}
            onChange={(e) => patch("brand", e.target.value)}
            placeholder="Opcional"
          />
        </Field>
        <Field label="Presentación" htmlFor="presentation">
          <Input
            id="presentation"
            value={draft.presentation}
            onChange={(e) => patch("presentation", e.target.value)}
            placeholder="Ej. 500 ml, 1 kg"
          />
        </Field>
        <Field label="Categoría">
          <Select
            value={draft.category}
            onValueChange={(v) => patch("category", v as ProductCategory)}
          >
            <SelectTrigger aria-label="Categoría">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Ubicación">
          <Select
            value={draft.location}
            onValueChange={(v) => patch("location", v as StoreLocation)}
          >
            <SelectTrigger aria-label="Ubicación">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LOCATIONS.map((c) => (
                <SelectItem key={c} value={c}>
                  {LOCATION_LABEL[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Fecha de vencimiento" htmlFor="expiresAt">
          <Input
            id="expiresAt"
            type="date"
            value={draft.expiresAt}
            onChange={(e) => patch("expiresAt", e.target.value)}
            required
          />
        </Field>
        <Field label="Cantidad" htmlFor="quantity">
          <Input
            id="quantity"
            type="number"
            min={1}
            inputMode="numeric"
            value={draft.quantity}
            onChange={(e) => patch("quantity", Number(e.target.value))}
            required
          />
        </Field>
      </div>

      <Field label="Notas" htmlFor="notes">
        <Textarea
          id="notes"
          value={draft.notes}
          onChange={(e) => patch("notes", e.target.value)}
          placeholder="Lote, proveedor, o lo que quieras recordar"
        />
      </Field>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className={cn(
            "flex size-16 items-center justify-center overflow-hidden rounded-md border border-dashed border-border bg-muted text-muted-foreground",
          )}
          aria-label="Tomar o elegir foto del producto"
        >
          {draft.image ? (
            <img src={draft.image} alt="" className="size-full object-cover" />
          ) : (
            <Camera className="size-5" />
          )}
        </button>
        <div className="text-sm text-muted-foreground">
          Foto opcional. Puedes usar la cámara del celular.
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => void handleImage(e.target.files?.[0])}
        />
      </div>

      {error ? <p className="text-sm text-bad">{error}</p> : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        ) : null}
        <Button type="submit" disabled={saving || lookingUp} size="lg">
          {saving ? "Guardando…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
