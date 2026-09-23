import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Scanner } from "@/components/scanner";
import { ProductForm, emptyDraft } from "@/components/product-form";
import { lookupProduct } from "@/lib/vigia/lookup";
import { useVigiaStore } from "@/lib/vigia/store";
import type { ProductDraft } from "@/lib/vigia/store";
import { isoDate, todayStart } from "@/lib/vigia/dates";

export function ScanPage() {
  const upsert = useVigiaStore((s) => s.upsertProduct);
  const [lookingUp, setLookingUp] = useState(false);
  const [foundFromApi, setFoundFromApi] = useState(false);
  const [draft, setDraft] = useState<ProductDraft | null>(null);
  const [paused, setPaused] = useState(false);

  async function handleCode(code: string) {
    setPaused(true);
    setLookingUp(true);
    setFoundFromApi(false);
    setDraft({ ...emptyDraft(code), barcode: code });
    try {
      const result = await lookupProduct(code);
      setDraft({
        barcode: result.barcode,
        name: result.name,
        brand: result.brand,
        presentation: result.presentation,
        category: result.category,
        expiresAt: isoDate(todayStart()),
        quantity: 1,
        location: "estante",
        notes: "",
        image: result.image,
        source: result.source,
      });
      setFoundFromApi(result.found);
      if (!result.found) {
        toast.message("No estaba en los catálogos. Complétalo una vez y queda guardado.");
      }
    } catch {
      toast.error("Sin conexión a los catálogos. Puedes registrarlo a mano.");
    } finally {
      setLookingUp(false);
    }
  }

  return (
    <main>
      <PageHeader
        eyebrow="Cámara"
        title="Escanear"
        description="Apunta al código o escríbelo. Luego solo falta la fecha de vencimiento."
      />
      <div className="px-4">
        <Scanner onDetect={(c) => void handleCode(c)} paused={paused && Boolean(draft)} />
      </div>
      {draft ? (
        <section className="mt-6 px-4 pb-4">
          <h2 className="mb-3 font-display text-xl font-medium">Registrar lote</h2>
          <ProductForm
            initial={draft}
            lookingUp={lookingUp}
            foundFromApi={foundFromApi}
            submitLabel="Guardar en inventario"
            onCancel={() => {
              setDraft(null);
              setPaused(false);
              setFoundFromApi(false);
            }}
            onSubmit={async (next) => {
              await upsert(next);
              toast.success("Listo. Ya guardamos este producto; la próxima vez lo reconoceremos al instante.");
              setDraft(null);
              setFoundFromApi(false);
              setPaused(false);
            }}
          />
        </section>
      ) : null}
    </main>
  );
}
