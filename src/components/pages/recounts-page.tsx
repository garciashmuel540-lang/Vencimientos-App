import { useEffect, useRef, useState } from "react";
import {
  Camera,
  Upload,
  Plus,
  Share2,
  ArrowLeft,
  ClipboardList,
  Trash2,
  ScanBarcode,
} from "lucide-react";
import { toast } from "sonner";
import { Scanner } from "@/components/scanner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  listCloudRecounts,
  openCloudRecount,
  saveCloudRecount,
  importCloudRecount,
  deleteCloudRecount,
  summarizeRecount,
  type RecountSummary,
} from "@/lib/data/recounts-supabase";
import { reconcileRecountCatalog } from "@/lib/vigia/recount-catalog";
import { RecountCounter } from "@/components/recount-counter";
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
  const [history, setHistory] = useState<RecountSummary[]>([]),
    [doc, setDoc] = useState<Recount | null>(null);
  const current = useRef<Recount | null>(null),
    writeQueue = useRef(Promise.resolve());
  const pending = useRef<Recount | null>(null);
  const writing = useRef(false);
  const resumeKey = `vigia-recuento-abierto:${userId}`;
  const [busy, setBusy] = useState(""),
    [search, setSearch] = useState(""),
    [saved, setSaved] = useState("");
  const [readyImage, setReadyImage] = useState<File | null>(null),
    [sources, setSources] = useState(false);
  const camera = useRef<HTMLInputElement>(null),
    upload = useRef<HTMLInputElement>(null);
  const scanController = useRef<AbortController | null>(null);
  const mounted = useRef(true),
    lock = useRef(false);
  const storage = useRef<"cloud" | "legacy" | null>(null);
  const versions = useRef(new Map<string, string>());
  const syncedPhotos = useRef<{ id: string; photos: string[] } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [localOnly, setLocalOnly] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [scanCode, setScanCode] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saveError, setSaveError] = useState(false);

  async function loadDocument(id: string) {
    return storage.current === "cloud" ? openCloudRecount(id, userId) : getDb().recounts.get(id);
  }
  function selectDocument(next: Recount) {
    current.current = next;
    sessionStorage.setItem(resumeKey, next.id);
    if (storage.current === "cloud") {
      versions.current.set(next.id, next.updatedAt);
      syncedPhotos.current = { id: next.id, photos: next.images };
    }
    setDoc(next);
    setSearch("");
    setSelectedId(null);
    setSources(false);
    setReadyImage(null);
    setSaveError(false);
  }
  useEffect(() => {
    mounted.current = true;
    let active = true;
    setLoaded(false);
    setLoadError(false);
    void (async () => {
      try {
        let remote = await listCloudRecounts(userId);
        if (!active) return;
        const local = await getDb().recounts.where("userId").equals(userId).toArray();
        if (remote !== null) {
          storage.current = "cloud";
          for (const old of local) {
            if (!active) return;
            try {
              await importCloudRecount(old);
              await getDb().recounts.delete(old.id);
            } catch {
              if (active)
                toast.error(
                  "Quedó un recuento local pendiente de transferir. Se reintentará al volver a abrir.",
                );
            }
          }
          if (local.length) remote = (await listCloudRecounts(userId)) ?? remote;
        } else {
          storage.current = "legacy";
        }
        if (!active) return;
        setLocalOnly(storage.current === "legacy");
        const entries =
          remote ??
          local.map(summarizeRecount).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        setHistory(entries);
        const resumed = entries.find((row) => row.id === sessionStorage.getItem(resumeKey));
        if (resumed && !current.current) {
          const next = await loadDocument(resumed.id);
          if (active && next) selectDocument(next);
        }
      } catch {
        if (active) setLoadError(true);
      } finally {
        if (active) setLoaded(true);
      }
    })();
    return () => {
      active = false;
      mounted.current = false;
      scanController.current?.abort();
    };
  }, [userId, resumeKey, loadAttempt]);
  function persist(next: Recount) {
    next = { ...next, updatedAt: new Date().toISOString() };
    current.current = next;
    setDoc(next);
    setReadyImage(null);
    setSaved("Guardando…");
    setSaveError(false);
    setHistory((old) => [summarizeRecount(next), ...old.filter((d) => d.id !== next.id)]);
    sessionStorage.setItem(resumeKey, next.id);
    pending.current = next;
    if (writing.current) return;
    writing.current = true;
    writeQueue.current = (async () => {
      try {
        while (pending.current) {
          const latest = pending.current;
          pending.current = null;
          if (storage.current === "cloud") {
            const last = syncedPhotos.current;
            const sendPhotos = last?.id !== latest.id || last.photos !== latest.images;
            versions.current.set(
              latest.id,
              await saveCloudRecount(latest, versions.current.get(latest.id), sendPhotos),
            );
            syncedPhotos.current = { id: latest.id, photos: latest.images };
          } else await getDb().recounts.put(latest);
        }
        if (mounted.current)
          setSaved(
            storage.current === "cloud" ? "Guardado en Supabase" : "Guardado en este dispositivo",
          );
      } catch (error) {
        if (mounted.current) {
          setSaveError(true);
          setSaved("No se pudo guardar");
          toast.error(
            error instanceof Error
              ? error.message
              : "No se pudo guardar. Revisá tu conexión y reintentá.",
          );
        }
      } finally {
        writing.current = false;
      }
    })();
  }

  async function openRecount(id: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy("Abriendo recuento…");
    try {
      await writeQueue.current;
      const next = await loadDocument(id);
      if (next && mounted.current) selectDocument(next);
      else if (!next) {
        setHistory((old) => old.filter((row) => row.id !== id));
        toast.info("Este recuento ya no está disponible.");
      }
    } catch {
      toast.error("No se pudo abrir el recuento. Revisá tu conexión.");
    } finally {
      lock.current = false;
      if (mounted.current) setBusy("");
    }
  }
  function closeRecount() {
    current.current = null;
    syncedPhotos.current = null;
    setDoc(null);
    setReadyImage(null);
    setSelectedId(null);
    sessionStorage.removeItem(resumeKey);
  }
  async function removeRecount() {
    const target = current.current;
    if (!target || lock.current) return;
    lock.current = true;
    setBusy("Borrando recuento…");
    setConfirmDelete(false);
    try {
      await writeQueue.current;
      pending.current = null;
      if (storage.current === "cloud") await deleteCloudRecount(target.id, userId);
      await getDb().recounts.delete(target.id);
      versions.current.delete(target.id);
      setHistory((old) => old.filter((row) => row.id !== target.id));
      closeRecount();
      toast.success("Recuento borrado.");
    } catch {
      toast.error("No se pudo borrar. Reintentá cuando tengas conexión.");
    } finally {
      lock.current = false;
      if (mounted.current) setBusy("");
    }
  }
  function matchScannedCode(code: string) {
    const rows = current.current?.items ?? [];
    const normalize = (value: string) => value.trim().toUpperCase().replace(/\s/g, "");
    const exact = rows.filter((item) => normalize(item.code) === normalize(code));
    const numeric = /^\d+$/.test(code)
      ? rows.filter(
          (item) =>
            /^\d+$/.test(item.code) && item.code.replace(/^0+/, "") === code.replace(/^0+/, ""),
        )
      : [];
    const matches = exact.length ? exact : numeric;
    setScanCode(false);
    if (matches.length === 1) {
      setSelectedId(matches[0].id);
      setSearch("");
    } else if (matches.length > 1) {
      setSelectedId(null);
      setSearch(matches[0].code);
      toast.info("El código aparece varias veces en la hoja.");
    } else toast.info("Este código no aparece en el recuento abierto.");
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
  async function scan(files: FileList | null, reread = false) {
    const original = current.current;
    if (!original || lock.current || (!reread && !files?.length)) return;
    if ((files?.length ?? 0) > 5) {
      toast.error("Agregá hasta cinco fotografías a la vez.");
      return;
    }
    lock.current = true;
    const controller = new AbortController();
    scanController.current = controller;
    setBusy("Preparando fotografías…");
    try {
      const { prepareRecountPhoto, readRecountPhotos } = await import("@/lib/vigia/recount-ocr");
      let catalog = await getDb().catalog.toArray();
      if (!catalog.length) {
        try {
          const response = await fetch("/catalogo-precios.json");
          if (response.ok) catalog = (await response.json()).items;
        } catch {
          /* keep names from document */
        }
      }
      const images = reread ? original.images : [];
      if (!reread)
        for (const file of Array.from(files ?? [])) images.push(await prepareRecountPhoto(file));
      let scanned = 0;
      const recovered: RecountItem[] = [];
      await readRecountPhotos(
        images,
        (message) => {
          if (mounted.current) setBusy(message);
        },
        async (page, index) => {
          if (!mounted.current) return;
          const items = reconcileRecountCatalog(
            page.items ?? readDocumentRows(page.words, catalog),
            catalog,
          );
          scanned += items.length;
          if (reread) {
            recovered.push(...items);
            return;
          }
          const latest = current.current ?? original;
          persist({
            ...latest,
            reviewed: false,
            items: [...latest.items, ...items],
            images: [...latest.images, images[index]],
            rawText: [latest.rawText, page.text].filter(Boolean).join("\n\n"),
          });
          await writeQueue.current;
        },
        controller.signal,
      );
      if (!mounted.current) return;
      if (reread && recovered.length) {
        const matched = new Set<string>();
        const items = recovered.map((item) => {
          const remaining = original.items.filter((old) => !matched.has(old.id));
          const rawMatches = item.raw.trim()
            ? remaining.filter((old) => old.raw.trim() === item.raw.trim())
            : [];
          const previous =
            remaining.find((old) => item.code && old.code === item.code) ??
            (rawMatches.length === 1 ? rawMatches[0] : undefined) ??
            remaining.find((old) => item.name === old.name);
          if (!previous) return item;
          matched.add(previous.id);
          return { ...item, id: previous.id, physical: previous.physical };
        });
        const preserved = original.items.filter(
          (item) => !matched.has(item.id) && (item.physical !== "" || !item.raw),
        );
        persist({ ...original, reviewed: false, items: [...items, ...preserved] });
      }
      toast.info(
        scanned
          ? `${scanned} ítems reconocidos. Revisá las cantidades pendientes.`
          : "No se identificaron filas. Revisá la foto o tomá una más recta y nítida.",
      );
    } catch {
      if (!controller.signal.aborted)
        toast.error(
          "La lectura se interrumpió. Las páginas que ya se guardaron siguen en el recuento.",
        );
    } finally {
      lock.current = false;
      if (mounted.current) setBusy("");
      scanController.current = null;
      if (camera.current) camera.current.value = "";
      if (upload.current) upload.current.value = "";
    }
  }
  async function prepareShare() {
    if (!doc || lock.current) return;
    lock.current = true;
    setBusy("Preparando imagen del conteo…");
    try {
      const { makeRecountImage } = await import("@/lib/vigia/recount-share");
      const file = await makeRecountImage(doc);
      if (mounted.current) {
        setReadyImage(file);
        toast.success("Imagen lista para compartir.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo preparar el reporte.");
    } finally {
      lock.current = false;
      if (mounted.current) setBusy("");
    }
  }
  async function sendFiles() {
    if (!readyImage) return;
    try {
      const files = [readyImage];
      if (navigator.canShare?.({ files })) {
        await navigator.share({ files, title: doc?.title ?? "Recuento" });
      } else {
        const url = URL.createObjectURL(readyImage);
        const link = document.createElement("a");
        link.href = url;
        link.download = readyImage.name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        toast.success("Reporte descargado.");
      }
    } catch (e) {
      if (!(e instanceof Error && e.name === "AbortError"))
        toast.error("No se pudo compartir el reporte.");
    }
  }
  const measured = doc?.items.filter((i) => quantity(i.physical) !== null).length ?? 0;
  const visible =
    doc?.items.filter((i) =>
      selectedId
        ? i.id === selectedId
        : `${i.name} ${i.code}`.toLowerCase().includes(search.toLowerCase()),
    ) ?? [];
  const canConfirm = Boolean(doc?.items.length) && doc!.items.every((i) => i.name.trim());
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
            <Button
              className="w-full min-h-12 gap-2"
              onClick={start}
              disabled={!loaded || loadError || !!busy}
            >
              <Plus className="size-4" />
              Nuevo recuento
            </Button>
            <p className="text-sm text-muted-foreground">
              {localOnly
                ? "Supabase aún no está disponible para recuentos. El historial permanece en este dispositivo."
                : "Tus recuentos se guardan en Supabase para abrirlos con tu cuenta."}
            </p>
            {!loaded && <p role="status">Cargando recuentos…</p>}
            {loadError && (
              <Button variant="outline" onClick={() => setLoadAttempt((n) => n + 1)}>
                Reintentar conexión
              </Button>
            )}
            {loaded && !loadError && history.length === 0 ? (
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
                  disabled={!!busy}
                  onClick={() => void openRecount(d.id)}
                >
                  <span className="block font-semibold">{d.title}</span>
                  <span className="text-sm text-muted-foreground">
                    {d.date} · {d.measuredCount}/{d.itemCount} contados ·{" "}
                    {d.reviewed ? "En conteo" : "Por revisar"}
                  </span>
                </button>
              ))
            )}
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={!!busy || saveError}
                onClick={closeRecount}
              >
                <ArrowLeft className="mr-2 size-4" />
                Mis recuentos
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="text-destructive"
                disabled={!!busy}
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="mr-2 size-4" />
                Borrar recuento
              </Button>
            </div>
            <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
              <DialogContent>
                <DialogTitle>¿Borrar todo el recuento?</DialogTitle>
                <DialogDescription>
                  Se eliminarán los ítems, los conteos y las fotos de «{doc.title}».
                </DialogDescription>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="outline" onClick={() => setConfirmDelete(false)}>
                    Cancelar
                  </Button>
                  <Button variant="destructive" onClick={() => void removeRecount()}>
                    Borrar recuento
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={scanCode} onOpenChange={setScanCode}>
              <DialogContent className="max-h-[90dvh] overflow-auto sm:max-w-md">
                <DialogTitle>Escanear artículo del recuento</DialogTitle>
                <DialogDescription>
                  Apuntá al código de barras del producto para abrir su conteo.
                </DialogDescription>
                <Scanner onDetect={matchScannedCode} recount />
              </DialogContent>
            </Dialog>
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
              {!doc.reviewed && doc.images.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => void scan(null, true)}
                >
                  Volver a leer fotos guardadas
                </Button>
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
              {doc.reviewed && (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 w-full gap-2"
                  onClick={() => setScanCode(true)}
                >
                  <ScanBarcode className="size-5" />
                  Escanear artículo
                </Button>
              )}
              {selectedId && (
                <Button type="button" variant="ghost" onClick={() => setSelectedId(null)}>
                  Ver todos los ítems
                </Button>
              )}
              <Input
                placeholder="Buscar producto o código"
                aria-label="Buscar en el recuento"
                value={search}
                onChange={(e) => {
                  setSelectedId(null);
                  setSearch(e.target.value);
                }}
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
                    <div>
                      <label className="text-sm">
                        Sistema
                        {doc.reviewed ? (
                          <p className="py-2 text-xl font-semibold tabular-nums">
                            {quantity(item.system) === null ? "Pendiente de revisión" : item.system}
                          </p>
                        ) : (
                          <Input
                            aria-label={`Sistema ${item.name}`}
                            inputMode="decimal"
                            value={item.system}
                            onChange={(e) => updateItem(item.id, { system: e.target.value })}
                          />
                        )}
                      </label>
                    </div>
                    {doc.reviewed && (
                      <RecountCounter
                        name={item.name}
                        physical={item.physical}
                        onChange={(value, add) => {
                          const latest = current.current?.items.find((row) => row.id === item.id);
                          const number = quantity(value);
                          if (number === null) return;
                          const total = add
                            ? (quantity(latest?.physical ?? "") ?? 0) + number
                            : number;
                          updateItem(item.id, {
                            physical: String(Math.max(0, Math.round(total * 1e6) / 1e6)),
                          });
                        }}
                      />
                    )}
                    {!doc.reviewed && !item.system && item.stockPreview && (
                      <div className="flex items-center gap-3 rounded-lg bg-muted p-2">
                        <img
                          src={item.stockPreview}
                          alt="Recorte de Cantidad Disponible"
                          loading="lazy"
                          className="h-14 w-28 rounded border object-contain bg-white"
                        />
                        <span className="text-xs text-muted-foreground">
                          Verificá esta cantidad en la hoja.
                        </span>
                      </div>
                    )}
                    {!doc.reviewed && item.candidates.length > 0 && !item.system && (
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
                      {quantity(item.system) === null ? "Sistema pendiente" : result.label}
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
                      setReadyImage(null);
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
            {readyImage && (
              <div className="rounded-xl border border-primary p-4">
                <p className="mb-3 text-sm">Una imagen tipo A4 con todos los ítems contados.</p>
                <Button className="w-full" onClick={() => void sendFiles()}>
                  Enviar imagen
                </Button>
              </div>
            )}
            <p role="status" className="text-xs text-muted-foreground">
              {saved || (localOnly ? "Guardado en este dispositivo" : "Guardado en Supabase")}
            </p>
            {saveError && (
              <Button
                variant="outline"
                onClick={() => {
                  if (current.current) persist(current.current);
                }}
              >
                Reintentar guardado
              </Button>
            )}
          </>
        )}
      </div>
    </main>
  );
}
