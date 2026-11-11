import { useEffect, useRef, useState } from "react";
import { Camera, Upload, Plus, Share2, ArrowLeft, ClipboardList, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSidebarStore } from "@/lib/vigia/sidebar";
import { useSupabaseAuth } from "@/lib/auth/supabase-auth";
import { getDb } from "@/lib/vigia/db";
import {
  quantity,
  compareRecount,
  readDocumentRows,
  type Recount,
  type RecountItem,
} from "@/lib/vigia/recounts";

export function RecountsPage() {
  const { user, loading } = useSupabaseAuth();
  if (loading) return <p className="p-6">Cargando…</p>;
  if (!user) return <p className="p-6">Iniciá sesión para ver tus recuentos.</p>;
  return <RecountsWorkspace key={user.id} userId={user.id} />;
}
const today = () => new Date().toLocaleDateString("en-CA");
const newItem = (): RecountItem => ({
  id: crypto.randomUUID(),
  name: "",
  code: "",
  category: "Documento",
  system: "",
  physical: "",
  raw: "",
  candidates: [],
});
export function RecountsWorkspace({ userId }: { userId: string }) {
  const openMenu = useSidebarStore((s) => s.setOpen);
  const [history, setHistory] = useState<Recount[]>([]),
    [doc, setDoc] = useState<Recount | null>(null);
  const current = useRef<Recount | null>(null),
    writeQueue = useRef(Promise.resolve());
  const [busy, setBusy] = useState(""),
    [search, setSearch] = useState(""),
    [saved, setSaved] = useState("");
  const [readyFiles, setReadyFiles] = useState<File[]>([]),
    [sources, setSources] = useState(false);
  const camera = useRef<HTMLInputElement>(null),
    upload = useRef<HTMLInputElement>(null);
  const mounted = useRef(true),
    lock = useRef(false);
  useEffect(() => {
    mounted.current = true;
    void getDb()
      .recounts.where("userId")
      .equals(userId)
      .toArray()
      .then((rows) => {
        if (mounted.current)
          setHistory(rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
      })
      .catch(() => toast.error("No se pudo abrir el historial."));
    return () => {
      mounted.current = false;
    };
  }, [userId]);
  function persist(next: Recount) {
    next = { ...next, updatedAt: new Date().toISOString() };
    current.current = next;
    setDoc(next);
    setReadyFiles([]);
    setSaved("Guardando…");
    setHistory((old) => [next, ...old.filter((d) => d.id !== next.id)]);
    writeQueue.current = writeQueue.current
      .catch(() => {})
      .then(async () => {
        await getDb().recounts.put(next);
        if (mounted.current) setSaved("Guardado en este dispositivo");
      })
      .catch(() => {
        if (mounted.current) {
          setSaved("No se pudo guardar");
          toast.error("No se pudo guardar. Revisá el espacio disponible.");
        }
      });
  }
  function updateItem(id: string, patch: Partial<RecountItem>) {
    const d = current.current;
    if (d) persist({ ...d, items: d.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
  }
  function start() {
    const d: Recount = {
      id: crypto.randomUUID(),
      userId,
      title: "Recuento diario",
      date: today(),
      updatedAt: new Date().toISOString(),
      reviewed: false,
      items: [],
      images: [],
      rawText: "",
    };
    persist(d);
    setSearch("");
  }
  async function scan(files: FileList | null) {
    if (!files?.length || lock.current || !current.current) return;
    if (files.length > 5) {
      toast.error("Agregá hasta cinco fotografías a la vez.");
      return;
    }
    lock.current = true;
    setBusy("Preparando fotografías…");
    const original = current.current;
    try {
      const { prepareRecountPhoto, readRecountPhotos } = await import("@/lib/vigia/recount-ocr");
      const images: string[] = [];
      for (const file of Array.from(files)) images.push(await prepareRecountPhoto(file));
      const pages = await readRecountPhotos(images, (m) => {
        if (mounted.current) setBusy(m);
      });
      let catalog = await getDb().catalog.toArray();
      if (!catalog.length) {
        try {
          const response = await fetch("/catalogo-precios.json");
          if (response.ok) catalog = (await response.json()).items;
        } catch {
          /* names from the sheet remain editable */
        }
      }
      const items = pages.flatMap((p) => readDocumentRows(p.words, catalog));
      if (!mounted.current) return;
      persist({
        ...original,
        reviewed: false,
        items: [...original.items, ...items],
        images: [...original.images, ...images],
        rawText: [original.rawText, ...pages.map((p) => p.text)].filter(Boolean).join("\n\n"),
      });
      setSources(true);
      toast.info(
        items.length
          ? `${items.length} ítems reconocidos. Revisá la lectura antes de contar.`
          : "No se identificaron filas. Revisá el texto leído o tomá una foto más recta y nítida.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo leer el documento. Intentá con otra foto.",
      );
    } finally {
      lock.current = false;
      if (mounted.current) setBusy("");
      if (camera.current) camera.current.value = "";
      if (upload.current) upload.current.value = "";
    }
  }
  async function prepareShare() {
    if (!doc || lock.current) return;
    lock.current = true;
    setBusy("Preparando imágenes Full HD…");
    try {
      const { makeRecountImages } = await import("@/lib/vigia/recount-share");
      const files = await makeRecountImages(doc);
      if (mounted.current) {
        setReadyFiles(files);
        toast.success("Imágenes listas para compartir.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo preparar el reporte.");
    } finally {
      lock.current = false;
      if (mounted.current) setBusy("");
    }
  }
  async function sendFiles() {
    try {
      if (navigator.canShare?.({ files: readyFiles })) {
        await navigator.share({ files: readyFiles, title: doc?.title ?? "Recuento" });
      } else {
        for (const file of readyFiles) {
          const url = URL.createObjectURL(file),
            a = document.createElement("a");
          a.href = url;
          a.download = file.name;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 60000);
        }
        toast.success("Reporte descargado.");
      }
    } catch (e) {
      if (!(e instanceof Error && e.name === "AbortError"))
        toast.error("No se pudo compartir el reporte.");
    }
  }
  const measured = doc?.items.filter((i) => quantity(i.physical) !== null).length ?? 0;
  const visible =
    doc?.items.filter((i) => `${i.name} ${i.code}`.toLowerCase().includes(search.toLowerCase())) ??
    [];
  const canConfirm =
    Boolean(doc?.items.length) &&
    doc!.items.every((i) => i.name.trim() && quantity(i.system) !== null);
  return (
    <main className="pb-28">
      <PageHeader
        title="Recuentos"
        eyebrow="Inventario diario"
        description="De la hoja impresa al conteo físico."
        tip="Fotografiá la hoja completa, recta y con buena luz."
        onMenuClick={() => openMenu(true)}
      />
      <div className="mx-auto max-w-3xl space-y-4 px-4">
        {!doc ? (
          <>
            <Button className="w-full min-h-12 gap-2" onClick={start}>
              <Plus className="size-4" />
              Nuevo recuento
            </Button>
            <p className="text-sm text-muted-foreground">
              Escaneá tu hoja, revisá la lectura y completá el físico. El historial se guarda en
              este dispositivo, separado para tu cuenta.
            </p>
            {history.length === 0 ? (
              <div className="rounded-2xl border bg-card p-8 text-center">
                <ClipboardList className="mx-auto mb-3 size-9 text-primary" />
                <h2 className="font-semibold">Tu primer recuento</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Creá uno para escanear la hoja de hoy.
                </p>
              </div>
            ) : (
              history.map((d) => (
                <button
                  key={d.id}
                  className="w-full rounded-xl border bg-card p-4 text-left"
                  onClick={() => {
                    current.current = d;
                    setDoc(d);
                    setSearch("");
                    setSources(false);
                    setReadyFiles([]);
                  }}
                >
                  <span className="block font-semibold">{d.title}</span>
                  <span className="text-sm text-muted-foreground">
                    {d.date} · {d.items.filter((i) => quantity(i.physical) !== null).length}/
                    {d.items.length} contados · {d.reviewed ? "En conteo" : "Por revisar"}
                  </span>
                </button>
              ))
            )}
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              disabled={!!busy}
              onClick={() => {
                setDoc(null);
                current.current = null;
                setReadyFiles([]);
              }}
            >
              <ArrowLeft className="mr-2 size-4" />
              Mis recuentos
            </Button>
            <fieldset disabled={!!busy} className="space-y-4 disabled:opacity-70">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-medium">
                  Nombre
                  <Input
                    value={doc.title}
                    maxLength={60}
                    onChange={(e) => persist({ ...doc, title: e.target.value })}
                  />
                </label>
                <label className="text-sm font-medium">
                  Fecha
                  <Input
                    type="date"
                    value={doc.date}
                    onChange={(e) => persist({ ...doc, date: e.target.value })}
                  />
                </label>
              </div>
              {!doc.reviewed && (
                <div className="rounded-2xl border bg-card p-4 space-y-3">
                  <h2 className="font-semibold">Escanear documento</h2>
                  <p className="text-sm text-muted-foreground">
                    Fotografiá todas las columnas, especialmente código y existencias del sistema.
                    Podés agregar varias páginas.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button className="gap-2" onClick={() => camera.current?.click()}>
                      <Camera className="size-4" />
                      Escanear documento
                    </Button>
                    <Button
                      variant="outline"
                      className="gap-2"
                      onClick={() => upload.current?.click()}
                    >
                      <Upload className="size-4" />
                      Subir fotos
                    </Button>
                  </div>
                  <input
                    ref={camera}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => void scan(e.target.files)}
                  />
                  <input
                    ref={upload}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    className="hidden"
                    onChange={(e) => void scan(e.target.files)}
                  />
                </div>
              )}
              {(doc.images.length > 0 || doc.rawText) && (
                <div className="rounded-xl border p-3">
                  <button
                    type="button"
                    className="text-sm font-medium text-primary"
                    onClick={() => setSources(!sources)}
                  >
                    {sources ? "Ocultar" : "Ver"} documento original y texto reconocido
                  </button>
                  {sources && (
                    <div className="mt-3 space-y-3">
                      {doc.images.map((src, i) => (
                        <a key={i} href={src} target="_blank" rel="noreferrer">
                          <img
                            src={src}
                            alt={`Hoja escaneada ${i + 1}`}
                            className="mb-2 max-h-80 w-full rounded-lg border object-contain"
                          />
                        </a>
                      ))}
                      <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-xs">
                        {doc.rawText}
                      </pre>
                    </div>
                  )}
                </div>
              )}
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold">
                  {doc.reviewed ? "Ingresar físico" : "Revisar lectura"}
                </h2>
                <span className="text-sm text-muted-foreground">
                  {measured}/{doc.items.length} contados
                </span>
              </div>
              <Input
                placeholder="Buscar producto o código"
                aria-label="Buscar en el recuento"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {doc.reviewed && (
                <p className="text-sm text-muted-foreground">
                  Las existencias del sistema vienen de tu hoja. Ingresá solo lo que contaste; cero
                  también es un conteo.
                </p>
              )}
              {visible.map((item) => {
                const result = compareRecount(item);
                return (
                  <section key={item.id} className="rounded-2xl border bg-card p-4 space-y-3">
                    {!doc.reviewed ? (
                      <>
                        <div className="flex gap-2">
                          <label className="min-w-0 flex-1 text-xs">
                            Producto
                            <Input
                              aria-label="Producto reconocido"
                              value={item.name}
                              onChange={(e) => updateItem(item.id, { name: e.target.value })}
                            />
                          </label>
                          <Button
                            variant="ghost"
                            aria-label={`Quitar ${item.name || "fila"}`}
                            onClick={() =>
                              persist({ ...doc, items: doc.items.filter((i) => i.id !== item.id) })
                            }
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="text-xs">
                            Código
                            <Input
                              value={item.code}
                              onChange={(e) => updateItem(item.id, { code: e.target.value })}
                            />
                          </label>
                          <label className="text-xs">
                            Apartado
                            <Input
                              value={item.category}
                              onChange={(e) => updateItem(item.id, { category: e.target.value })}
                            />
                          </label>
                        </div>
                        {item.raw && (
                          <p className="break-words rounded bg-muted p-2 text-xs text-muted-foreground">
                            Lectura: {item.raw}
                          </p>
                        )}
                      </>
                    ) : (
                      <div>
                        <h3 className="break-words font-semibold">{item.name}</h3>
                        <p className="break-all text-xs text-muted-foreground">
                          {item.code || "Sin código"} · {item.category}
                        </p>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <label className="text-sm">
                        Sistema
                        {doc.reviewed ? (
                          <p className="py-2 text-xl font-semibold tabular-nums">{item.system}</p>
                        ) : (
                          <Input
                            aria-label={`Sistema ${item.name}`}
                            inputMode="decimal"
                            value={item.system}
                            onChange={(e) => updateItem(item.id, { system: e.target.value })}
                          />
                        )}
                      </label>
                      <label className="text-sm">
                        Físico
                        <Input
                          aria-label={`Físico ${item.name}`}
                          inputMode="decimal"
                          placeholder="Sin contar"
                          disabled={!doc.reviewed}
                          value={item.physical}
                          onChange={(e) => updateItem(item.id, { physical: e.target.value })}
                        />
                      </label>
                    </div>
                    {!doc.reviewed && item.candidates.length > 1 && (
                      <div className="flex flex-wrap gap-2">
                        <span className="w-full text-xs text-muted-foreground">
                          Números detectados: elegí el que corresponde al sistema.
                        </span>
                        {[...new Set(item.candidates)].map((n, i) => (
                          <Button
                            key={i}
                            size="sm"
                            variant="outline"
                            onClick={() => updateItem(item.id, { system: n })}
                          >
                            {n}
                          </Button>
                        ))}
                      </div>
                    )}
                    {item.physical.trim() &&
                      (quantity(item.physical) === null || quantity(item.physical)! < 0) && (
                        <p className="text-sm text-red-700">
                          Ingresá un físico válido, mayor o igual a cero.
                        </p>
                      )}
                    <p
                      className={`rounded-lg px-3 py-2 text-sm font-semibold ${result.status === "ok" ? "bg-emerald-50 text-emerald-800" : result.status === "falta" ? "bg-red-50 text-red-800" : result.status === "sobra" ? "bg-amber-50 text-amber-800" : "bg-muted text-muted-foreground"}`}
                    >
                      {result.label}
                    </p>
                  </section>
                );
              })}
              {!doc.reviewed ? (
                <>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => persist({ ...doc, items: [...doc.items, newItem()] })}
                  >
                    <Plus className="mr-2 size-4" />
                    Agregar ítem
                  </Button>
                  <p className="text-sm text-muted-foreground">
                    Compará la lectura con la hoja. Corregí filas omitidas, códigos y cantidades
                    antes de empezar.
                  </p>
                  <Button
                    className="w-full min-h-12"
                    disabled={!canConfirm}
                    onClick={() => {
                      persist({ ...doc, reviewed: true });
                      setSources(false);
                    }}
                  >
                    Confirmar lectura y empezar conteo
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      persist({ ...doc, reviewed: false });
                      setReadyFiles([]);
                    }}
                  >
                    Revisar documento o agregar páginas
                  </Button>
                  <Button
                    className="w-full min-h-12 gap-2"
                    disabled={
                      !measured ||
                      doc.items.some(
                        (i) =>
                          i.physical.trim() &&
                          (quantity(i.physical) === null || quantity(i.physical)! < 0),
                      )
                    }
                    onClick={() => void prepareShare()}
                  >
                    <Share2 className="size-4" />
                    Compartir conteo
                  </Button>
                </>
              )}
            </fieldset>
            {busy && (
              <p
                role="status"
                aria-live="polite"
                className="rounded-xl bg-primary/10 p-4 text-sm font-medium"
              >
                {busy}
              </p>
            )}
            {readyFiles.length > 0 && (
              <div className="rounded-xl border border-primary p-4">
                <p className="mb-3 text-sm">
                  {readyFiles.length === 1
                    ? "1 imagen horizontal"
                    : `${readyFiles.length} imágenes horizontales`}{" "}
                  Full HD con los ítems contados.
                </p>
                <Button className="w-full" onClick={() => void sendFiles()}>
                  Enviar imágenes
                </Button>
              </div>
            )}
            <p role="status" className="text-xs text-muted-foreground">
              {saved || "Guardado en este dispositivo"}
            </p>
          </>
        )}
      </div>
    </main>
  );
}
