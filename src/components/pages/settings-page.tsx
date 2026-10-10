import { useEffect, useRef, useState, type ReactNode } from "react";
import { Bell, FileSpreadsheet, LogOut, Mail, Moon, Package, RotateCcw, Smartphone, Sun, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useVigiaStore } from "@/lib/vigia/store";
import { useSupabaseAuth, signOutSupabase } from "@/lib/auth/supabase-auth";
import {
  countCatalogSupabase,
  pushFullCatalog,
} from "@/lib/data/catalog-supabase";
import { getDb } from "@/lib/vigia/db";
import {
  requestNotifyPermission,
  buildDailySummary,
} from "@/lib/vigia/notifications";
import { cn } from "@/lib/utils";

const DAY_OPTIONS = [60, 30, 15, 7, 3, 1];

export function SettingsPage() {
  const settings = useVigiaStore((s) => s.settings);
  const update = useVigiaStore((s) => s.updateSettings);
  const products = useVigiaStore((s) => s.products);
  const clearDemo = useVigiaStore((s) => s.clearDemo);
  const resetAll = useVigiaStore((s) => s.resetAll);
  const demo = useVigiaStore((s) => s.demo);
  const { user: authUser } = useSupabaseAuth();
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("denied");
  const [signingOut, setSigningOut] = useState(false);
  const [supabaseCount, setSupabaseCount] = useState<number | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [migrationProgress, setMigrationProgress] = useState<{
    subidos: number;
    total: number;
  } | null>(null);
  const [promoSources, setPromoSources] = useState<
    { sourceFile: string; count: number; importedAt: string }[]
  >([]);
  const [importing, setImporting] = useState(false);
  const promoFileRef = useRef<HTMLInputElement>(null);
  const catalogFileRef = useRef<HTMLInputElement>(null);
  const [catalogStats, setCatalogStats] = useState<{ total: number; lastUpdate: string | null }>({
    total: 0,
    lastUpdate: null,
  });
  const [importingCatalog, setImportingCatalog] = useState(false);
  const [preview, setPreview] = useState<{
    totalInExcel: number;
    newProducts: number;
    updates: number;
    unchanged: number;
    warnings: string[];
    parsedEntries: import("@/lib/vigia/types").CatalogEntry[];
    sourceFile: string;
  } | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("vigia-theme");
    if (stored === "light" || stored === "dark") setTheme(stored);
    else setTheme("system");
    if (typeof Notification === "undefined") setPerm("unsupported");
    else setPerm(Notification.permission);
    void useVigiaStore.getState().listPromotionSources().then(setPromoSources);
    void useVigiaStore.getState().catalogStats().then(setCatalogStats);
    void countCatalogSupabase()
      .then(setSupabaseCount)
      .catch(() => setSupabaseCount(null));
  }, []);

  async function handleMigration() {
    setMigrating(true);
    setMigrationProgress({ subidos: 0, total: 0 });
    try {
      const localEntries = await getDb().catalog.toArray();
      if (localEntries.length === 0) {
        toast.error("No hay productos en el catálogo local.");
        return;
      }
      setMigrationProgress({ subidos: 0, total: localEntries.length });
      const result = await pushFullCatalog(localEntries, (subidos, total) => {
        setMigrationProgress({ subidos, total });
      });
      if (result.errores > 0) {
        toast.error(
          `Migración con errores: ${result.subidos} subidos, ${result.errores} fallaron.`,
        );
      } else {
        toast.success(`✅ ${result.subidos} productos migrados a la nube`);
      }
      const newCount = await countCatalogSupabase();
      setSupabaseCount(newCount);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al migrar";
      toast.error(msg);
    } finally {
      setMigrating(false);
      setMigrationProgress(null);
    }
  }

  async function handleCatalogPreview(file: File) {
    setImportingCatalog(true);
    try {
      const result = await useVigiaStore.getState().previewCatalogUpdate(file);
      if (result.totalInExcel === 0) {
        toast.error("No se encontraron productos en el archivo.");
        return;
      }
      setPreview(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al leer el archivo");
    } finally {
      setImportingCatalog(false);
      if (catalogFileRef.current) catalogFileRef.current.value = "";
    }
  }

  async function confirmCatalogUpdate() {
    if (!preview) return;
    try {
      const { added, updated } = await useVigiaStore
        .getState()
        .applyCatalogUpdate(preview.parsedEntries);
      toast.success(`Catálogo actualizado: ${added} nuevos, ${updated} precios cambiados`);
      const stats = await useVigiaStore.getState().catalogStats();
      setCatalogStats(stats);
      setPreview(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar");
    }
  }

  async function handleImportPromos(file: File) {
    setImporting(true);
    try {
      const { count, warnings } = await useVigiaStore
        .getState()
        .importPromotions(file);
      if (count === 0) {
        toast.error(warnings[0] ?? "No se encontraron promociones válidas.");
      } else {
        toast.success(`${count} promociones importadas`);
        if (warnings.length > 0) {
          toast.message(`${warnings.length} aviso(s)`, {
            description: warnings.slice(0, 3).join("\n"),
          });
        }
      }
      const list = await useVigiaStore.getState().listPromotionSources();
      setPromoSources(list);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al importar");
    } finally {
      setImporting(false);
      if (promoFileRef.current) promoFileRef.current.value = "";
    }
  }

  async function handleRemovePromoSource(sourceFile: string) {
    await useVigiaStore.getState().removePromotionSource(sourceFile);
    const list = await useVigiaStore.getState().listPromotionSources();
    setPromoSources(list);
    toast.success("Archivo eliminado");
  }

  function applyTheme(next: "light" | "dark" | "system") {
    setTheme(next);
    if (next === "system") localStorage.removeItem("vigia-theme");
    else localStorage.setItem("vigia-theme", next);
    const dark =
      next === "dark" ||
      (next === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
  }

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOutSupabase();
      toast.success("Sesión cerrada");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "No se pudo cerrar sesión";
      toast.error(msg);
      setSigningOut(false);
    }
  }

  function toggleDay(day: number) {
    const has = settings.days.includes(day);
    const days = has
      ? settings.days.filter((d) => d !== day)
      : [...settings.days, day].sort((a, b) => b - a);
    void update({ days: days.length ? days : [7] });
  }

  return (
    <main>
      <PageHeader
        eyebrow="Preferencias"
        title="Ajustes"
        description="Alertas, apariencia y datos de esta tienda."
      />

      <div className="flex flex-col gap-4 px-4 pb-4">
        <Card className="p-4">
          <Label htmlFor="store">Nombre de la tienda</Label>
          <Input
            id="store"
            className="mt-2"
            value={settings.storeName}
            onChange={(e) => void update({ storeName: e.target.value })}
          />
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2">
            <Bell className="size-4" />
            <h2 className="font-medium">Alertas de vencimiento</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Avisamos con estos días de anticipación, el día del vencimiento y si ya venció.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {DAY_OPTIONS.map((d) => {
              const on = settings.days.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDay(d)}
                  className={cn(
                    "h-10 rounded-full px-3 text-sm font-medium",
                    on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                  )}
                >
                  {d === 1 ? "1 día" : `${d} días`}
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex flex-col gap-3">
            <Row
              icon={<Smartphone className="size-4" />}
              label="Aviso al abrir la app"
              checked={settings.notifyOnOpen}
              onChange={(v) => void update({ notifyOnOpen: v })}
            />
            <Row
              icon={<Bell className="size-4" />}
              label="Sonido"
              checked={settings.sound}
              onChange={(v) => void update({ sound: v })}
            />
            <Row
              icon={<Smartphone className="size-4" />}
              label="Vibración"
              checked={settings.vibration}
              onChange={(v) => void update({ vibration: v })}
            />
          </div>
          <Button
            className="mt-4"
            variant="secondary"
            onClick={async () => {
              const p = await requestNotifyPermission();
              setPerm(p);
              if (p === "granted") toast.success("Notificaciones activadas en este navegador.");
              else
                toast.message(
                  "El navegador no concedió permiso. Igual verás el aviso dentro de la app.",
                );
            }}
          >
            {perm === "granted" ? "Permiso concedido" : "Activar notificaciones del sistema"}
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            Con la app cerrada, las alertas automáticas solo funcionan si instalas Vigía en el
            celular y el navegador permite sincronización periódica. Si no, el resumen aparece
            cada vez que abres la app.
          </p>
        </Card>

        <Card className="p-4">
          <h2 className="font-medium">Apariencia</h2>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <ThemeBtn icon={Sun} label="Claro" active={theme === "light"} onClick={() => applyTheme("light")} />
            <ThemeBtn icon={Moon} label="Oscuro" active={theme === "dark"} onClick={() => applyTheme("dark")} />
            <ThemeBtn
              icon={Smartphone}
              label="Sistema"
              active={theme === "system"}
              onClick={() => applyTheme("system")}
            />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2">
            <Mail className="size-4" />
            <h2 className="font-medium">Resumen diario</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Sin servidores de correo ni Twilio: se abre WhatsApp o tu app de correo con el texto listo.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => {
                const text = buildDailySummary(products, settings.storeName);
                window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
              }}
            >
              Enviar por WhatsApp
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const text = buildDailySummary(products, settings.storeName);
                window.location.href = `mailto:?subject=${encodeURIComponent("Resumen Vigía")}&body=${encodeURIComponent(text)}`;
              }}
            >
              Enviar por correo
            </Button>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2">
            <Package className="size-4 text-muted-foreground" />
            <h2 className="font-medium">Catálogo de precios</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Sube el Excel completo del sistema para actualizar precios, costos y agregar productos nuevos.
          </p>

          <div className="mt-3 flex flex-col gap-1 rounded-md bg-muted px-3 py-2">
            <p className="text-sm">
              <strong>{catalogStats.total.toLocaleString("es")}</strong> productos en catálogo
            </p>
            {catalogStats.lastUpdate ? (
              <p className="text-xs text-muted-foreground">
                Última actualización:{" "}
                {new Date(catalogStats.lastUpdate).toLocaleDateString("es")}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Sin actualizaciones desde la app
              </p>
            )}
          </div>

          <input
            ref={catalogFileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleCatalogPreview(f);
            }}
          />

          <div className="mt-3 flex flex-col gap-2">
            <Button
              variant="outline"
              onClick={() => catalogFileRef.current?.click()}
              disabled={importingCatalog}
            >
              <Upload className="size-4" />
              {importingCatalog ? "Leyendo…" : "Cargar Excel de catálogo"}
            </Button>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="size-4 text-muted-foreground" />
            <h2 className="font-medium">Promociones</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Carga los Excel de promociones del mes. Se aplican al escanear en el verificador de precios.
          </p>

          {promoSources.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-2">
              {promoSources.map((s) => (
                <li
                  key={s.sourceFile}
                  className="flex items-center justify-between gap-2 rounded-md bg-muted px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{s.sourceFile}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.count} promos ·{" "}
                      {new Date(s.importedAt).toLocaleDateString("es")}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => void handleRemovePromoSource(s.sourceFile)}
                    aria-label="Eliminar archivo"
                  >
                    <X className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
              No hay promociones cargadas.
            </p>
          )}

          <input
            ref={promoFileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleImportPromos(f);
            }}
          />

          <div className="mt-3 flex flex-col gap-2">
            <Button
              variant="outline"
              onClick={() => promoFileRef.current?.click()}
              disabled={importing}
            >
              <Upload className="size-4" />
              {importing ? "Importando…" : "Cargar archivo Excel"}
            </Button>
            {promoSources.length > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-bad"
                onClick={async () => {
                  await useVigiaStore.getState().clearAllPromotions();
                  setPromoSources([]);
                  toast.success("Todas las promociones eliminadas");
                }}
              >
                Borrar todas
              </Button>
            ) : null}
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2">
            <Upload className="size-4 text-muted-foreground" />
            <h2 className="font-medium">Migración a la nube</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Sube el catálogo local de 3189 productos a Supabase para que todos los empleados lo vean.
          </p>
          <div className="mt-3 flex flex-col gap-1 rounded-md bg-muted px-3 py-2 text-sm">
            <p>
              Local: <strong>{catalogStats.total.toLocaleString("es")}</strong> productos
            </p>
            <p>
              En la nube:{" "}
              <strong>
                {supabaseCount === null
                  ? "—"
                  : supabaseCount.toLocaleString("es")}
              </strong>{" "}
              productos
            </p>
          </div>
          {migrationProgress ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Subiendo {migrationProgress.subidos} /{" "}
              {migrationProgress.total}…
            </p>
          ) : null}
          <Button
            variant="outline"
            className="mt-3 w-full"
            onClick={() => void handleMigration()}
            disabled={migrating}
          >
            {migrating ? "Migrando…" : "Migrar catálogo a la nube"}
          </Button>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2">
            <LogOut className="size-4 text-muted-foreground" />
            <h2 className="font-medium">Sesión</h2>
          </div>
          {authUser ? (
            <>
              <p className="mt-2 text-sm">
                Estás conectado como{" "}
                <strong>{authUser.email ?? "usuario"}</strong>
              </p>
              <Button
                variant="outline"
                className="mt-3 w-full"
                onClick={() => void handleSignOut()}
                disabled={signingOut}
              >
                {signingOut ? "Cerrando…" : "Cerrar sesión"}
              </Button>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              No hay sesión activa
            </p>
          )}
        </Card>

        <Card className="p-4">
          <h2 className="font-medium">Datos en este dispositivo</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            El inventario vive en IndexedDB. Borrar el sitio en el navegador también borra los productos.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {demo ? (
              <Button
                variant="outline"
                onClick={async () => {
                  await clearDemo();
                  toast.success("Tienda de ejemplo vaciada. Empieza con tu inventario.");
                }}
              >
                <Trash2 className="size-4" />
                Vaciar tienda de ejemplo
              </Button>
            ) : null}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost">
                  <RotateCcw className="size-4" />
                  Restaurar tienda de ejemplo
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Restaurar el ejemplo?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Se reemplaza el inventario actual por la tienda de demostración.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={async () => {
                      await resetAll();
                      toast.success("Volvimos a cargar la tienda de ejemplo.");
                    }}
                  >
                    Restaurar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </Card>
      </div>
      <Dialog
        open={Boolean(preview)}
        onOpenChange={(v) => {
          if (!v) setPreview(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resumen de cambios</DialogTitle>
            <DialogDescription>
              {preview?.sourceFile} · {preview?.totalInExcel.toLocaleString("es")} productos en el archivo
            </DialogDescription>
          </DialogHeader>

          {preview ? (
            <div className="mt-2 flex flex-col gap-2 text-sm">
              <div className="flex items-center justify-between rounded-md bg-ok/10 px-3 py-2">
                <span>Nuevos productos</span>
                <strong className="text-ok">{preview.newProducts}</strong>
              </div>
              <div className="flex items-center justify-between rounded-md bg-warn-soft px-3 py-2">
                <span>Precios que cambian</span>
                <strong className="text-warn">{preview.updates}</strong>
              </div>
              <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2">
                <span>Sin cambios</span>
                <strong>{preview.unchanged}</strong>
              </div>

              {preview.warnings.length > 0 ? (
                <p className="text-xs text-warn">
                  {preview.warnings.length} aviso(s). Revisa la consola si algo no cuadra.
                </p>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setPreview(null)}>
              Cancelar
            </Button>
            <Button onClick={() => void confirmCatalogUpdate()}>
              Confirmar actualización
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function Row({
  icon,
  label,
  checked,
  onChange,
}: {
  icon: ReactNode;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-sm">
        {icon}
        {label}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function ThemeBtn({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: typeof Sun;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-16 flex-col items-center justify-center gap-1 rounded-md text-xs font-medium",
        active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
      )}
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
}
