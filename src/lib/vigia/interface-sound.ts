import { useChatFocus } from "./chat-focus";
import { useVigiaStore } from "./store";

export const interfaceCues = {
  tap: { label: "Tocar un botón", file: "key", pulse: 12 },
  open: { label: "Abrir un panel", file: "open", pulse: 12 },
  close: { label: "Cerrar un panel", file: "close", pulse: 12 },
  navigate: { label: "Cambiar de pantalla", file: "navigate", pulse: 12 },
  on: { label: "Activar", file: "switch", pulse: 18 },
  off: { label: "Desactivar", file: "off", pulse: 18 },
  scan: { label: "Leer un código", file: "scan", pulse: 16 },
  saved: { label: "Guardar un producto", file: "saved", pulse: [12, 36, 16] },
  removed: { label: "Quitar un registro", file: "removed", pulse: 16 },
};
export type Cue = keyof typeof interfaceCues;

function fileUrl(cue: Cue) {
  return `/audio/${interfaceCues[cue].file}.wav?v=2`;
}

function controlCue(control: HTMLElement): Cue {
  const action = control.dataset.uiSound;
  if (action && Object.hasOwn(interfaceCues, action)) return action as Cue;
  if (control.matches('[role="switch"]')) return control.getAttribute("aria-checked") === "true" ? "off" : "on";
  if (control.hasAttribute("aria-expanded")) return control.getAttribute("aria-expanded") === "true" ? "close" : "open";
  if (control.matches('[aria-haspopup="dialog"]')) return "open";
  if (control.hasAttribute("aria-pressed")) return control.getAttribute("aria-pressed") === "true" ? "off" : "on";
  if (control.matches('a[href]')) return "navigate";
  return "tap";
}

const buffers = new Map<Cue, AudioBuffer>();
const players = new Map<Cue, HTMLAudioElement>();
let context: AudioContext | undefined;
let lastTouch = -Infinity;
let lastScan = -Infinity;

function player(cue: Cue) {
  let audio = players.get(cue);
  if (!audio) {
    audio = new Audio(fileUrl(cue));
    audio.preload = "auto";
    players.set(cue, audio);
  }
  return audio;
}

function primeAudio() {
  if (!useVigiaStore.getState().settings.interfaceSounds || !window.AudioContext) return;
  try {
    if (!context) {
      const audio = new AudioContext({ latencyHint: "interactive" });
      context = audio;
      for (const cue of Object.keys(interfaceCues) as Cue[]) {
        void fetch(fileUrl(cue))
          .then(response => response.arrayBuffer())
          .then(bytes => audio.decodeAudioData(bytes))
          .then(buffer => buffers.set(cue, buffer))
          .catch(() => {}); // The media element can still play the file directly.
      }
    }
    if (context.state !== "running") void context.resume().catch(() => {});
  } catch {
    // Some embedded browsers only allow playback through a media element.
  }
}

export async function playInterfaceSound(cue: Cue, preview = false) {
  const { ready, settings } = useVigiaStore.getState();
  if (typeof window === "undefined" || !ready || document.hidden || useChatFocus.getState().autoOpen) return;
  const now = performance.now();
  if (cue === "scan") {
    if (!preview && now - lastScan < 850) return;
    lastScan = now;
  } else if (cue !== "saved" && cue !== "removed" && !preview) {
    if (now - lastTouch < 105) return;
    lastTouch = now;
  }
  if (settings.touchVibration) {
    try { navigator.vibrate?.(interfaceCues[cue].pulse); } catch { /* Some webviews disable haptics. */ }
  }
  if (!settings.interfaceSounds) return;
  const level = Math.max(0, Math.min(1, settings.effectVolume / 100));
  try {
    const buffer = buffers.get(cue);
    if (context?.state === "running" && buffer) {
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffer;
      source.playbackRate.value = 0.97 + Math.random() * 0.06;
      gain.gain.value = level;
      source.connect(gain).connect(context.destination);
      source.onended = () => { source.disconnect(); gain.disconnect(); };
      source.start();
      return true;
    }
  } catch {
    // An interrupted context may reject a source even while it reports running.
  }
  try {
    // Start inside the original click even if Web Audio is still waking up.
    const audio = player(cue);
    audio.currentTime = 0;
    audio.volume = level;
    await audio.play();
    return true;
  } catch {
    return false;
  }
}

export function installTouchFeedback() {
  const selector = 'button, a[href], [role="button"], [role="switch"], [role="option"]';
  function handle(event: Event) {
    if (!event.isTrusted || !(event.target instanceof Element)) return;
    const control = event.target.closest<HTMLElement>(selector);
    if (!control || control.matches(':disabled, [aria-disabled="true"]') || control.closest(".som-panel")) return;
    primeAudio();
    if (event.type !== "click" || control.closest("[data-own-feedback]")) return;
    void playInterfaceSound(controlCue(control));
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
      control.animate?.([
        { translate: "0 2px", scale: ".975" },
        { translate: "0 -.35px", scale: "1.003", offset: .7 },
        { translate: "0 0", scale: "1" },
      ], { duration: 150, easing: "ease-out" });
    }
  }
  function pauseWhenHidden() {
    if (!document.hidden) return;
    if (context?.state === "running") void context.suspend().catch(() => {});
    players.forEach(audio => audio.pause());
  }
  document.addEventListener("pointerup", handle, true);
  document.addEventListener("click", handle, true);
  document.addEventListener("visibilitychange", pauseWhenHidden);
  return () => {
    document.removeEventListener("pointerup", handle, true);
    document.removeEventListener("click", handle, true);
    document.removeEventListener("visibilitychange", pauseWhenHidden);
  };
}
