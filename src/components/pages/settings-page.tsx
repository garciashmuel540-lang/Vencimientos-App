import { useEffect, useState, type ReactNode } from "react";
import { Bell, Mail, Moon, RotateCcw, Smartphone, Sun, Trash2 } from "lucide-react";
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
import { useVigiaStore } from "@/lib/vigia/store";
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
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("denied");

  useEffect(() => {
    const stored = localStorage.getItem("vigia-theme");
    if (stored === "light" || stored === "dark") setTheme(stored);
    else setTheme("system");
    if (typeof Notification === "undefined") setPerm("unsupported");
    else setPerm(Notification.permission);
  }, []);

  function applyTheme(next: "light" | "dark" | "system") {
    setTheme(next);
    if (next === "system") localStorage.removeItem("vigia-theme");
    else localStorage.setItem("vigia-theme", next);
    const dark =
      next === "dark" ||
      (next === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
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
