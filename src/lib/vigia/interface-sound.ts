import { useChatFocus } from "./chat-focus";
import { useVigiaStore } from "./store";

// A short, damped tap for controls and a softer rising tone for a completed action.
const tones = {
  tap: { from: 380, to: 220, duration: 0.065, gain: 0.035 },
  scan: { from: 530, to: 660, duration: 0.10, gain: 0.031 },
  saved: { from: 392, to: 587, duration: 0.16, gain: 0.043 },
} as const;

let context: AudioContext | undefined;
let lastCue = -Infinity;
let lastScan = -Infinity;
let idleTimer: number | undefined;

function enabled() {
  const { ready, settings } = useVigiaStore.getState();
  return ready && settings.interfaceSounds && !document.hidden && !useChatFocus.getState().autoOpen;
}

export async function playInterfaceSound(cue: keyof typeof tones) {
  if (typeof window === "undefined" || !enabled() || !window.AudioContext) return;
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;

  const requested = performance.now();
  if (requested - lastCue < 220 || (cue === "scan" && requested - lastScan < 900)) return;
  lastCue = requested;
  if (cue === "scan") lastScan = requested;

  try {
    const audio = context ??= new AudioContext();
    window.clearTimeout(idleTimer);
    if (audio.state !== "running") await audio.resume();
    if (lastCue !== requested) return;
    idleTimer = window.setTimeout(() => { void audio.suspend().catch(() => {}); }, 1600);
    // Browser permission or an interrupted audio session may delay resume.
    if (!enabled() || performance.now() - requested > 200) return;

    const tone = tones[cue];
    const start = audio.currentTime;
    const end = start + tone.duration;
    const oscillator = audio.createOscillator();
    const envelope = audio.createGain();
    oscillator.frequency.setValueAtTime(tone.from, start);
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(tone.gain, start + 0.009);
    if (cue === "saved") {
      const second = start + 0.072;
      envelope.gain.exponentialRampToValueAtTime(0.0001, second);
      oscillator.frequency.setValueAtTime(tone.to, second);
      envelope.gain.linearRampToValueAtTime(tone.gain * 0.72, second + 0.009);
    } else {
      oscillator.frequency.exponentialRampToValueAtTime(tone.to, end);
    }
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);
    oscillator.connect(envelope).connect(audio.destination);
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
    oscillator.start(start);
    oscillator.stop(end);
  } catch {
    // Audio is optional when the device is muted or playback is unavailable.
  }
}
