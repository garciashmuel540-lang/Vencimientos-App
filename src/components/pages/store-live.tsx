import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Scanner } from "@/components/scanner";
import { supabase } from "@/lib/supabase";
import { readSnapshot, type StoreProduct } from "@/lib/vigia/rmh-catalog";

export function StoreLive({ store, origin }: { store: string; origin: string }) {
  const [name, setName] = useState("");
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [rows, setRows] = useState<StoreProduct[]>([]);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);

  async function lookup(mode: "name" | "barcode" | "connection", query = "") {
    active.current?.abort();
    const request = new AbortController();
    active.current = request;
    setBusy(true);
    setRows([]);
    setMessage("Consultando RMH…");
    setScanning(false);
    try {
      const endpoint = new URL(mode === "connection" ? "/connection" : "/products", origin);
      if (endpoint.protocol !== "https:") throw new Error();
      const session = await supabase?.auth.getSession();
      const token = session?.data.session?.access_token;
      if (!token) {
        if (!request.signal.aborted) setMessage("Iniciá sesión para consultar la tienda.");
        return;
      }
      const result = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: mode === "connection" ? undefined : JSON.stringify({ mode, query: query.trim() }),
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(25000)]),
        cache: "no-store",
        redirect: "error",
        credentials: "omit",
        referrerPolicy: "no-referrer",
      });
      if (request.signal.aborted) return;
      const statusMessages: Record<number, string> = {
        401: "Tu sesión venció. Volvé a iniciar sesión en Vigía.",
        403: "Esta cuenta no tiene permiso para consultar RMH en esta sucursal.",
        502: "El conector no pudo validar tu sesión con el servicio de cuentas.",
        503: "El conector respondió, pero no pudo completar la consulta. Revisá su conexión con RMH.",
      };
      if (mode === "connection" && result.status === 404) {
        setMessage(
          "El servicio en esa dirección no ofrece la prueba de conexión. Verificá la dirección y la versión del conector.",
        );
        return;
      }
      if (statusMessages[result.status]) {
        setMessage(statusMessages[result.status]);
        return;
      }
      if (!result.ok) throw new Error();
      const data = await result.json();
      if (request.signal.aborted) return;
      if (data.store !== store) throw new Error();
      if (mode === "connection") {
        if (data.connected !== true) throw new Error();
        setMessage("Conexión comprobada. RMH permite leer el catálogo de esta tienda.");
        return;
      }
      if (!Array.isArray(data.products)) throw new Error();
      if (!data.products.length) {
        setMessage("No se encontraron productos para esa búsqueda.");
        return;
      }
      const snapshot = readSnapshot(data);
      setRows(snapshot.products);
      setMessage(
        "Consultado a las " +
          new Date(snapshot.captured_at).toLocaleTimeString("es-NI") +
          (data.more ? " · Primeros 25 resultados. Afiná la búsqueda." : ""),
      );
    } catch {
      if (!request.signal.aborted)
        setMessage("No se pudo consultar RMH. Revisá el Wi-Fi de la tienda y el servicio local.");
    } finally {
      if (!request.signal.aborted) setBusy(false);
    }
  }

  return (
    <Card className="grid gap-3 p-4">
      <h2 className="font-display text-lg font-semibold">Inventario en vivo · {store}</h2>
      <Button variant="outline" disabled={busy} onClick={() => void lookup("connection")}>
        Probar conexión con RMH
      </Button>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim().length >= 2) void lookup("name", name);
        }}
      >
        <Input
          aria-label="Nombre del producto"
          placeholder="Nombre del producto"
          value={name}
          maxLength={128}
          onChange={(event) => setName(event.target.value)}
        />
        <Button type="submit" disabled={busy || name.trim().length < 2}>
          Buscar
        </Button>
      </form>
      <Button variant="outline" onClick={() => setScanning(!scanning)}>
        {scanning ? "Cerrar escáner" : "Escanear o escribir código"}
      </Button>
      {scanning && (
        <Scanner recount showSamples={false} onDetect={(code) => void lookup("barcode", code)} />
      )}
      <p role="status" className="text-sm text-muted-foreground">
        {message}
      </p>
      {rows.map((item) => (
        <article className="grid gap-1 border-t py-2" key={item.barcode}>
          <strong>{item.name}</strong>
          <span className="text-sm text-muted-foreground">{item.barcode}</span>
          <span>{item.price === null ? "Sin precio" : "C$ " + item.price.toFixed(2)}</span>
          <span>
            {item.stock === null ? "Existencia sin registrar" : "Existencia: " + item.stock}
          </span>
        </article>
      ))}
    </Card>
  );
}
