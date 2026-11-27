import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { RefreshCw, Store } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Scanner } from "@/components/scanner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PrintPriceLabels, type PriceLabelItem } from "@/components/price-label";
import { useSupabaseAuth } from "@/lib/auth/supabase-auth";
import { supabase } from "@/lib/supabase";
import { getDb, getKv } from "@/lib/vigia/db";
import { readSnapshot, type StoreSnapshot } from "@/lib/vigia/rmh-catalog";
import { useSidebarStore } from "@/lib/vigia/sidebar";

import { StoreLive } from "./store-live";

const liveOrigin = import.meta.env.VITE_RMH_LAN_ORIGIN;

export function StorePage() {
  const { user, loading } = useSupabaseAuth();
  const setOpen = useSidebarStore((s) => s.setOpen);
  return (
    <main>
      <PageHeader
        title="Mi tienda"
        description="Precios y existencias del catálogo RMH."
        onMenuClick={() => setOpen(true)}
      />
      <div className="grid gap-4 px-4">
        {user?.rmhStore ? (
          <StoreViews
            key={JSON.stringify([user.id, user.rmhStore])}
            owner={user.id}
            store={user.rmhStore}
          />
        ) : (
          <Card className="grid gap-2 p-5">
            <Store className="size-6 text-primary" />
            <h2 className="font-semibold">
              {loading
                ? "Cargando tienda…"
                : !supabase
                  ? "Sesión de Vigía sin configurar"
                  : user
                    ? "Tienda sin asignar"
                    : "Ingresá a tu cuenta de Vigía"}
            </h2>
            {!loading && (
              <p className="text-sm text-muted-foreground">
                {!supabase ? (
                  "Falta configurar el acceso a cuentas en este despliegue."
                ) : user ? (
                  "El administrador de la tienda puede vincular tu cuenta con RMH."
                ) : (
                  <Link to="/login" className="text-primary underline">
                    Iniciar sesión
                  </Link>
                )}
              </p>
            )}
            <Link to="/precio" className="text-sm font-medium text-primary">
              Abrir el verificador de Vigía
            </Link>
          </Card>
        )}
      </div>
    </main>
  );
}

function StoreViews({ owner, store }: { owner: string; store: string }) {
  const [live, setLive] = useState(Boolean(liveOrigin));
  return (
    <>
      {!liveOrigin && (
        <Card className="p-4 text-sm" role="status">
          La consulta en vivo está pendiente de configuración. Falta la dirección HTTPS del conector
          de la tienda en Vigía.
        </Card>
      )}
      {liveOrigin && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Fuente del inventario">
          <Button
            variant={live ? "default" : "outline"}
            aria-pressed={live}
            onClick={() => setLive(true)}
          >
            En vivo por Wi-Fi
          </Button>
          <Button
            variant={live ? "outline" : "default"}
            aria-pressed={!live}
            onClick={() => setLive(false)}
          >
            Catálogo guardado
          </Button>
        </div>
      )}
      {live && liveOrigin ? (
        <StoreLive store={store} origin={liveOrigin} />
      ) : (
        <StoreCatalog owner={owner} store={store} />
      )}
    </>
  );
}

function StoreCatalog({ owner, store }: { owner: string; store: string }) {
  const [snapshot, setSnapshot] = useState<StoreSnapshot | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [code, setCode] = useState("");
  const [batch, setBatch] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  const [copies, setCopies] = useState<Map<string, number>>(new Map());
  const cacheKey = JSON.stringify(["rmh", owner, store]);

  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    async function refresh() {
      setBusy(true);
      setMessage("");
      let local: StoreSnapshot | null = null;
      try {
        const saved = await getKv<unknown>(cacheKey, null);
        if (saved) local = readSnapshot(saved);
      } catch {
        /* La descarga también funciona sin almacenamiento local. */
      }
      if (signal.aborted) return;
      if (local) setSnapshot(local);
      try {
        if (!supabase) throw new Error();
        const { data, error } = await supabase
          .from("rmh_catalogs")
          .select("captured_at,products")
          .eq("store_id", store)
          .abortSignal(AbortSignal.any([signal, AbortSignal.timeout(20000)]))
          .maybeSingle();
        if (signal.aborted) return;
        if (error) throw error;
        if (!data) {
          setSnapshot(null);
          setMessage("Todavía no hay un catálogo publicado para esta tienda.");
          await getDb().kv.delete(cacheKey);
          return;
        }
        const fresh = readSnapshot(data);
        setSnapshot(fresh);
        try {
          const db = getDb();
          await db.transaction("rw", db.kv, async () => {
            const previous = await getKv<StoreSnapshot | null>(cacheKey, null);
            if (!previous || Date.parse(previous.captured_at) <= Date.parse(fresh.captured_at))
              await db.kv.put({ key: cacheKey, value: fresh });
          });
          if (!signal.aborted) setMessage("Catálogo disponible en este teléfono.");
        } catch {
          if (!signal.aborted) setMessage("Catálogo abierto. No se pudo guardar en este teléfono.");
        }
      } catch {
        if (!signal.aborted)
          setMessage(
            local
              ? "Sin actualizar. Estás consultando la copia del teléfono."
              : "No se pudo descargar el catálogo. Revisá la conexión y volvé a intentar.",
          );
      } finally {
        if (!signal.aborted) setBusy(false);
      }
    }
    void refresh();
    return () => controller.abort();
  }, [cacheKey, store, attempt]);

  const products = useMemo(
    () => new Map(snapshot?.products.map((p) => [p.barcode, p])),
    [snapshot],
  );
  const selected = products.get(code);
  const labels: PriceLabelItem[] = [];
  for (const [barcode, count] of copies) {
    const p = products.get(barcode);
    if (p && p.price !== null)
      labels.push({
        barcode,
        name: p.name,
        amount: p.price,
        copies: count,
        presentation: "",
        brand: "",
        promotion: null,
      });
  }
  function changeCopies(barcode: string, count: number) {
    setCopies((previous) => {
      const next = new Map(previous);
      if (count) next.set(barcode, count);
      else next.delete(barcode);
      return next;
    });
  }

  return (
    <>
      <Card className="grid gap-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold">
            <Store className="mr-2 inline size-5 text-primary" />
            Tienda {store}
          </h2>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => setAttempt((a) => a + 1)}
          >
            <RefreshCw className={busy ? "size-4 animate-spin" : "size-4"} /> Actualizar
          </Button>
        </div>
        {snapshot && (
          <p className="text-sm">
            {products.size} artículos · Datos de RMH del{" "}
            {new Date(snapshot.captured_at).toLocaleString("es-NI")}
          </p>
        )}
        <p role="status" className="text-sm text-muted-foreground">
          {busy ? "Consultando catálogo…" : message}
        </p>
      </Card>
      {snapshot && (
        <>
          <Scanner
            showSamples={false}
            paused={reviewing || (!batch && Boolean(code))}
            continuous={batch}
            onContinuousChange={setBatch}
            onDetect={(value) => {
              setCode(value);
              if (batch && products.get(value)?.price != null)
                setCopies((previous) =>
                  previous.has(value) ? previous : new Map(previous).set(value, 1),
                );
            }}
          />
          <div aria-live="polite">
            {selected ? (
              <Card className="grid gap-2 p-4">
                <h2 className="font-display text-lg font-semibold">{selected.name}</h2>
                <span className="text-sm text-muted-foreground">{selected.barcode}</span>
                <strong className="text-2xl">
                  {selected.price === null ? "Sin precio" : "C$ " + selected.price.toFixed(2)}
                </strong>
                <p>
                  {selected.stock === null
                    ? "Existencia sin registrar"
                    : "Existencia: " + selected.stock}
                </p>
                {selected.price !== null && !copies.has(code) && (
                  <Button variant="outline" onClick={() => changeCopies(code, 1)}>
                    Agregar a etiquetas
                  </Button>
                )}
              </Card>
            ) : (
              code && <p>No se encontró {code} en esta tienda.</p>
            )}
          </div>
          {code && !batch && (
            <Button variant="outline" onClick={() => setCode("")}>
              Escanear otro artículo
            </Button>
          )}
          {labels.length > 0 && (
            <PrintPriceLabels
              items={labels}
              pending={false}
              onOpenChange={setReviewing}
              onCopies={changeCopies}
            />
          )}
        </>
      )}
    </>
  );
}
