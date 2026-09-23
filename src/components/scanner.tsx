import { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, ScanBarcode, SwitchCamera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { SAMPLE_BARCODES } from "@/lib/vigia/types";
import { cn } from "@/lib/utils";

interface ScannerProps {
  onDetect: (code: string) => void;
  paused?: boolean;
}

export function Scanner({ onDetect, paused }: ScannerProps) {
  const hostId = "vigia-reader";
  const scannerRef = useRef<{
    isScanning: boolean;
    start: (...args: never[]) => Promise<void>;
    stop: () => Promise<void>;
    clear: () => Promise<void>;
  } | null>(null);
  const lastCode = useRef("");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [manual, setManual] = useState("");
  const [batch, setBatch] = useState(false);
  const batchRef = useRef(false);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const onDetectRef = useRef(onDetect);
  onDetectRef.current = onDetect;
  batchRef.current = batch;

  const stop = useCallback(async () => {
    const s = scannerRef.current;
    if (!s) return;
    try {
      if (s.isScanning) await s.stop();
    } catch {
      /* already stopped */
    }
    setRunning(false);
  }, []);

  const start = useCallback(async () => {
    setCameraError(null);
    const el = document.getElementById(hostId);
    if (!el) return;
    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode(hostId, {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.QR_CODE,
          ],
          verbose: false,
        }) as unknown as NonNullable<typeof scannerRef.current>;
      }
      await scannerRef.current.start(
        { facingMode: facing } as never,
        { fps: 8, qrbox: { width: 280, height: 140 } } as never,
        ((decoded: string) => {
          const code = decoded.replace(/\s/g, "");
          if (!code || code === lastCode.current) return;
          lastCode.current = code;
          if (navigator.vibrate) navigator.vibrate(30);
          onDetectRef.current(code);
          if (!batchRef.current) {
            void stop();
          } else {
            window.setTimeout(() => {
              lastCode.current = "";
            }, 1500);
          }
        }) as never,
        (() => undefined) as never,
      );
      setRunning(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "No se pudo abrir la cámara.";
      setCameraError(
        /permission|notallowed|denied/i.test(msg)
          ? "Necesitamos permiso de cámara. También puedes escribir el código a mano."
          : "La cámara no está disponible aquí. Escribe el código o usa un ejemplo.",
      );
      setRunning(false);
    }
  }, [facing, stop]);

  useEffect(() => {
    if (paused) {
      void stop();
      return;
    }
    void start();
    return () => {
      void stop();
    };
  }, [start, stop, paused]);

  function submitManual(code: string) {
    const clean = code.replace(/\D/g, "");
    if (clean.length < 6) return;
    lastCode.current = clean;
    onDetect(clean);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative overflow-hidden rounded-xl bg-foreground">
        <div
          id={hostId}
          className="min-h-56 w-full overflow-hidden [&_video]:h-full [&_video]:w-full [&_video]:object-cover"
        />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative h-28 w-[80%] max-w-72">
            <span className="absolute left-0 top-0 size-6 rounded-tl-md border-l-2 border-t-2 border-primary-foreground" />
            <span className="absolute right-0 top-0 size-6 rounded-tr-md border-r-2 border-t-2 border-primary-foreground" />
            <span className="absolute bottom-0 left-0 size-6 rounded-bl-md border-b-2 border-l-2 border-primary-foreground" />
            <span className="absolute bottom-0 right-0 size-6 rounded-br-md border-b-2 border-r-2 border-primary-foreground" />
          </div>
        </div>
        {running ? (
          <span className="absolute left-3 top-3 rounded-full bg-ok px-2 py-0.5 text-[11px] font-medium text-ok-fg">
            Cámara lista
          </span>
        ) : null}
      </div>

      {cameraError ? (
        <p className="rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">{cameraError}</p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Apunta al código de barras. Al reconocerlo se detiene solo.
        </p>
      )}

      <div className="flex items-center justify-between gap-3 rounded-lg bg-card px-3 py-2 shadow-[var(--shadow-border)]">
        <div className="flex items-center gap-2">
          <Switch id="batch" checked={batch} onCheckedChange={setBatch} />
          <Label htmlFor="batch">Escanear varios seguidos</Label>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Cambiar cámara"
          onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
        >
          <SwitchCamera className="size-4" />
        </Button>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submitManual(manual);
        }}
      >
        <div className="relative flex-1">
          <Keyboard className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-10"
            inputMode="numeric"
            placeholder="Escribe el código"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            aria-label="Código de barras manual"
          />
        </div>
        <Button type="submit" variant="secondary">
          Buscar
        </Button>
      </form>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Probar con un código conocido
        </p>
        <div className="flex flex-wrap gap-2">
          {SAMPLE_BARCODES.map((s) => (
            <button
              key={s.code}
              type="button"
              onClick={() => submitManual(s.code)}
              className={cn(
                "inline-flex h-10 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-sm",
              )}
            >
              <ScanBarcode className="size-3.5" />
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
