import { useState } from "react";
import { Minus, Pencil, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ProductForm } from "@/components/product-form";
import { StatusBadge } from "@/components/status-badge";
import { daysLabel, formatDate, productStatus } from "@/lib/vigia/dates";
import { CATEGORY_LABEL, LOCATION_LABEL, type Product } from "@/lib/vigia/types";
import { useVigiaStore } from "@/lib/vigia/store";
import { useChatFocus } from "@/lib/vigia/chat-focus";

export function ProductSheet({
  product,
  open,
  onOpenChange,
}: {
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const soonWithin = Math.max(...useVigiaStore((s) => s.settings.days), 30);
  const consume = useVigiaStore((s) => s.consume);
  const remove = useVigiaStore((s) => s.remove);
  const upsert = useVigiaStore((s) => s.upsertProduct);
  const focusOn = useChatFocus((s) => s.focusOn);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);

  if (!product) return null;
  const status = productStatus(product, soonWithin);

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(v) => {
          if (!v) setEditing(false);
          onOpenChange(v);
        }}
      >
        <SheetContent className="overflow-y-auto">
          {editing ? (
            <>
              <SheetHeader>
                <SheetTitle>Editar producto</SheetTitle>
                <SheetDescription>Los cambios se guardan solo en este dispositivo.</SheetDescription>
              </SheetHeader>
              <div className="mt-4">
                <ProductForm
                  initial={{
                    barcode: product.barcode,
                    name: product.name,
                    brand: product.brand,
                    presentation: product.presentation,
                    category: product.category,
                    expiresAt: product.expiresAt,
                    quantity: product.quantity,
                    location: product.location,
                    notes: product.notes,
                    image: product.image,
                    source: product.source,
                  }}
                  submitLabel="Guardar cambios"
                  onCancel={() => setEditing(false)}
                  onSubmit={async (draft) => {
                    await upsert(draft, product.id);
                    toast.success("Producto actualizado");
                    setEditing(false);
                  }}
                />
              </div>
            </>
          ) : (
            <>
              <SheetHeader>
                <div className="flex items-center gap-2">
                  <StatusBadge status={status} />
                </div>
                <SheetTitle>{product.name}</SheetTitle>
                <SheetDescription>
                  {product.brand || "Sin marca"}
                  {product.presentation ? ` · ${product.presentation}` : ""}
                </SheetDescription>
              </SheetHeader>
              {product.image ? (
                <img
                  src={product.image}
                  alt=""
                  className="mt-4 h-40 w-full rounded-lg object-cover"
                />
              ) : null}
              <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <Info label="Vencimiento" value={`${formatDate(product.expiresAt)} · ${daysLabel(product.expiresAt)}`} />
                <Info label="Cantidad" value={`${product.quantity} unidades`} />
                <Info label="Categoría" value={CATEGORY_LABEL[product.category]} />
                <Info label="Ubicación" value={LOCATION_LABEL[product.location]} />
                <Info label="Código" value={product.barcode} />
                <Info label="Origen" value={sourceLabel(product.source)} />
              </dl>
              {product.notes ? (
                <p className="mt-4 rounded-md bg-muted px-3 py-2 text-sm">{product.notes}</p>
              ) : null}
              <div className="mt-6 flex flex-col gap-2">
                <Button
                  size="lg"
                  variant="secondary"
                  onClick={() => {
                    focusOn(product);
                    onOpenChange(false);
                  }}
                >
                  <Sparkles className="size-4" />
                  Preguntar a la IA
                </Button>
                <Button
                  size="lg"
                  onClick={async () => {
                    await consume(product.id, 1);
                    toast.success(
                      product.quantity <= 1
                        ? "Lote agotado. Lo pasamos al historial."
                        : "Listo, descontamos una unidad.",
                    );
                    if (product.quantity <= 1) onOpenChange(false);
                  }}
                >
                  <Minus className="size-4" />
                  Marcar 1 vendida
                </Button>
                <Button variant="outline" size="lg" onClick={() => setEditing(true)}>
                  <Pencil className="size-4" />
                  Editar
                </Button>
                <Button variant="ghost" size="lg" className="text-bad" onClick={() => setConfirm(true)}>
                  <Trash2 className="size-4" />
                  Quitar del inventario
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar {product.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Se mueve al historial. No se borra de este dispositivo del todo: podrás verlo en Reportes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={async () => {
                await remove(product.id);
                toast.success("Producto enviado al historial");
                onOpenChange(false);
              }}
            >
              Quitar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function sourceLabel(source: Product["source"]): string {
  if (source === "openfoodfacts") return "Open Food Facts";
  if (source === "upcitemdb") return "UPCitemdb";
  if (source === "local") return "Catálogo local";
  return "Registro manual";
}
