import { playInterfaceSound } from "@/lib/vigia/interface-sound";
import { useEffect, useRef, useState } from "react";
import { Keyboard, ScanBarcode, SwitchCamera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { SAMPLE_BARCODES } from "@/lib/vigia/types";
import { cn } from "@/lib/utils";

interface Html5QrcodeLike {
  isScanning: boolean;
  start: (...args: never[]) => Promise<void>;
  stop: () => Promise<void>;
  clear: () => Promise<void>;
}

interface ScannerProps {
  onDetect: (code: string) => void;
  paused?: boolean;
  recount?: boolean;
  showSamples?: boolean;
  continuous?: boolean;
  onContinuousChange?: (enabled: boolean) => void;
}

export function Scanner({
  onDetect,
  paused,
  recount = false,
  showSamples = true,
  continuous,
  onContinuousChange,
}: ScannerProps) {
  const hostId = "vigia-reader";
  const cameraTask = useRef(Promise.resolve());
  const lastCode = useRef("");
  const scanFrame = useRef<HTMLDivElement>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [manual, setManual] = useState("");
  const [localBatch, setLocalBatch] = useState(false);
  const batch = continuous ?? localBatch;
  const batchRef = useRef(false);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const onDetectRef = useRef(onDetect);
  onDetectRef.current = onDetect;
  batchRef.current = batch;

  function signalRead() {
    void playInterfaceSound("scan");
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    scanFrame.current?.animate(
      [{ opacity: 1, transform: "scale(.97)" }, { opacity: 0, transform: "scale(1)" }],
      { duration: 230, easing: "ease-out" },
    );
  }

  useEffect(() => {
    let active = true;
    let scanner: Html5QrcodeLike | undefined;
    let singleRead = false;
    let lastSeenAt = 0;
    lastCode.current = "";

    async function releaseCamera() {
      const owned = scanner;
      scanner = undefined;
      if (!owned) return;
      try {
        if (owned.isScanning) await owned.stop();
        await owned.clear();
      } catch {
        /* La cámara puede haberse desconectado. */
      }
    }

    // Serializar el cierre y la apertura evita compartir la cámara con una sesión anterior.
    cameraTask.current = cameraTask.current.then(async () => {
      if (!active) return;
      setRunning(false);
      if (paused) return;
      setCameraError(null);
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats: Format } = await import("html5-qrcode");
        if (!active) return;
        scanner = new Html5Qrcode(hostId, {
          formatsToSupport: [
            Format.EAN_13,
            Format.EAN_8,
            Format.UPC_A,
            Format.UPC_E,
            Format.CODE_128,
            Format.QR_CODE,
          ],
          verbose: false,
        }) as unknown as Html5QrcodeLike;
        await scanner.start(
          { facingMode: facing } as never,
          { fps: 8, qrbox: { width: 280, height: 140 } } as never,
          ((decoded: string) => {
            const code = decoded.replace(/\s/g, "");
            if (!active || singleRead || !code) return;
            const now = performance.now();
            const heldInView = code === lastCode.current && now - lastSeenAt < 1500;
            lastSeenAt = now;
            if (heldInView) return;
            lastCode.current = code;
            singleRead = !batchRef.current;
            signalRead();
            onDetectRef.current(code);
            if (singleRead) {
              cameraTask.current = cameraTask.current.then(releaseCamera);
              setRunning(false);
            }
          }) as never,
          (() => undefined) as never,
        );
        if (active && !singleRead) setRunning(true);
      } catch (err) {
        if (!active) return;
        const message = err instanceof Error ? err.message : String(err);
        setCameraError(
          /permission|notallowed|denied/i.test(message)
            ? "Necesitamos permiso de cámara. También puedes escribir el código a mano."
            : "La cámara no está disponible aquí. Escribe el código o usa un ejemplo.",
        );
      }
    });
    return () => {
      active = false;
      cameraTask.current = cameraTask.current.then(releaseCamera);
    };
  }, [facing, paused]);

  function submitManual(code: string) {
    const clean =
      recount || continuous !== undefined
        ? code.trim().replace(/\s/g, "")
        : code.replace(/\D/g, "");
    if (clean.length < (recount || continuous !== undefined ? 1 : 6)) return;
    lastCode.current = clean;
    signalRead();
    onDetect(clean);
    if (continuous) setManual("");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative overflow-hidden rounded-xl bg-foreground">
        <div
          id={hostId}
          className="aspect-[4/3] w-full overflow-hidden [&_video]:h-full [&_video]:w-full [&_video]:object-cover"
        />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative h-28 w-[80%] max-w-72">
            <div ref={scanFrame} aria-hidden="true" className="absolute inset-0 rounded-lg border-2 border-primary bg-primary/10 opacity-0" />
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
          {batch
            ? "Apuntá a cada código de barras, uno tras otro."
            : "Apunta al código de barras. Al reconocerlo se detiene solo."}
        </p>
      )}

      <div className="flex items-center justify-between gap-3 rounded-lg bg-card px-3 py-2 shadow-[var(--shadow-border)]">
        {!recount && (
          <div className="flex items-center gap-2">
            <Switch
              id="batch"
              checked={batch}
              onCheckedChange={onContinuousChange ?? setLocalBatch}
            />
            <Label htmlFor="batch">Escanear varios seguidos</Label>
          </div>
        )}
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
            inputMode={recount || continuous !== undefined ? "text" : "numeric"}
            placeholder="Escribe el código"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            aria-label="Código de barras manual"
          />
        </div>
        <Button data-own-feedback type="submit" variant="secondary">
          Buscar
        </Button>
      </form>

      {!recount && showSamples && (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Probar con un código conocido
          </p>
          <div className="flex flex-wrap gap-2">
            {SAMPLE_BARCODES.map((s) => (
              <button
                data-own-feedback
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
      )}
    </div>
  );
}
