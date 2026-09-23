import { useState } from "react";
import { Bell, LayoutDashboard, ScanBarcode, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const STEPS = [
  {
    icon: ShieldCheck,
    title: "Vigía cuida lo que vence",
    body: "Registra productos de tu tienda y te avisamos antes de que se echen a perder. Todo se guarda en este celular, sin cuentas.",
  },
  {
    icon: ScanBarcode,
    title: "Escanea y listo",
    body: "El botón central abre la cámara. Si reconoce el código, rellenamos el nombre. Si no, lo escribes una vez y la próxima ya lo sabemos.",
  },
  {
    icon: LayoutDashboard,
    title: "Verde, ámbar, rojo",
    body: "Vigente, por vencer y vencido. La lista siempre muestra primero lo más urgente para que sepas qué retirar o ofertar.",
  },
  {
    icon: Bell,
    title: "Alertas a tu medida",
    body: "En Ajustes eliges con cuántos días de anticipación avisar. Al abrir la app verás un resumen; si das permiso, también una notificación.",
  },
];

export function Onboarding({
  open,
  onFinish,
}: {
  open: boolean;
  onFinish: () => void;
}) {
  const [step, setStep] = useState(0);
  const current = STEPS[step]!;
  const Icon = current.icon;
  const last = step === STEPS.length - 1;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onFinish()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mb-3 flex size-12 items-center justify-center rounded-lg bg-accent text-primary">
            <Icon className="size-6" />
          </div>
          <DialogTitle>{current.title}</DialogTitle>
          <DialogDescription>{current.body}</DialogDescription>
        </DialogHeader>
        <div className="flex gap-1.5" aria-hidden>
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={
                i === step ? "h-1 flex-1 rounded-full bg-primary" : "h-1 flex-1 rounded-full bg-muted"
              }
            />
          ))}
        </div>
        <div className="flex justify-between gap-2">
          <Button variant="ghost" onClick={onFinish}>
            Saltar
          </Button>
          <Button
            onClick={() => {
              if (last) onFinish();
              else setStep((s) => s + 1);
            }}
          >
            {last ? "Empezar" : "Siguiente"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
