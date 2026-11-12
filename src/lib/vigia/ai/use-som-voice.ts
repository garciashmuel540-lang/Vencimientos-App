import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { selectSpanishMaleVoice, speechText, splitSpeech } from "./voice-text";

type VoiceStatus = "preparing" | "playing" | "ready";
type Playback = {
  index: number;
  controller: AbortController;
  resume?: () => void;
};

const autoKey = "vigia-som-auto-voice";

function playWav(
  wav: string,
  signal: AbortSignal,
  update: (status: VoiceStatus) => void,
  session: Playback,
) {
  return new Promise<boolean>((resolve) => {
    const bytes = Uint8Array.from(atob(wav), (character) => character.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
    const audio = new Audio(url);
    let finished = false;
    const finish = (played: boolean) => {
      if (finished) return;
      finished = true;
      signal.removeEventListener("abort", abort);
      session.resume = undefined;
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.removeAttribute("src");
      URL.revokeObjectURL(url);
      resolve(played);
    };
    const abort = () => finish(false);
    const play = () => {
      if (finished || signal.aborted) return;
      void audio
        .play()
        .then(() => {
          if (!finished && !signal.aborted) update("playing");
        })
        .catch((error) => {
          if (finished || signal.aborted) return;
          if (error instanceof Error && error.name === "NotAllowedError") {
            session.resume = play;
            update("ready");
          } else finish(false);
        });
    };
    audio.onended = () => finish(true);
    audio.onerror = () => finish(false);
    signal.addEventListener("abort", abort, { once: true });
    play();
  });
}

function playOnDevice(text: string, signal: AbortSignal, update: (status: VoiceStatus) => void) {
  return new Promise<boolean>((resolve) => {
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
      resolve(false);
      return;
    }
    const engine = window.speechSynthesis;
    const voice = selectSpanishMaleVoice(engine.getVoices());
    if (!voice) {
      resolve(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.rate = 0.94;
    utterance.pitch = 1.1;
    const finish = (played: boolean) => {
      signal.removeEventListener("abort", abort);
      utterance.onstart = null;
      utterance.onend = null;
      utterance.onerror = null;
      resolve(played);
    };
    const abort = () => {
      finish(false);
      engine.cancel();
    };
    utterance.onstart = () => update("playing");
    utterance.onend = () => finish(true);
    utterance.onerror = () => finish(false);
    signal.addEventListener("abort", abort, { once: true });
    engine.speak(utterance);
  });
}

export function useSomVoice(open: boolean) {
  const [auto, setAuto] = useState(false);
  const [active, setActive] = useState<{ index: number; status: VoiceStatus } | null>(null);
  const playback = useRef<Playback | null>(null);

  useEffect(() => {
    try {
      setAuto(localStorage.getItem(autoKey) === "1");
    } catch {
      /* unavailable storage */
    }
  }, []);

  const stop = useCallback(() => {
    const current = playback.current;
    playback.current = null;
    current?.controller.abort();
    setActive(null);
  }, []);

  useEffect(() => {
    if (!open) stop();
    return () => playback.current?.controller.abort();
  }, [open, stop]);

  const toggleAuto = () => {
    const next = !auto;
    setAuto(next);
    try {
      localStorage.setItem(autoKey, next ? "1" : "0");
    } catch {
      /* unavailable storage */
    }
  };

  const play = useCallback(
    async (index: number, element: HTMLElement) => {
      if (playback.current?.index === index && playback.current.resume) {
        playback.current.resume();
        return;
      }
      stop();
      const segments = splitSpeech(speechText(element));
      if (!segments.length) return;
      const current: Playback = { index, controller: new AbortController() };
      playback.current = current;
      const signal = current.controller.signal;
      const update = (status: VoiceStatus) => {
        if (playback.current === current) setActive({ index, status });
      };
      update("preparing");
      try {
        const token = (await supabase?.auth.getSession().catch(() => null))?.data.session
          ?.access_token;
        const api = token ? await import("./voice-api").catch(() => null) : null;
        let cloud = api?.somVoiceFn ?? null;
        for (const text of segments) {
          if (signal.aborted) return;
          update("preparing");
          if (cloud && token) {
            const wav = await cloud({ data: { accessToken: token, text }, signal }).catch(
              () => null,
            );
            if (signal.aborted) return;
            if (wav && (await playWav(wav, signal, update, current))) continue;
            cloud = null;
          }
          if (signal.aborted) return;
          if (!(await playOnDevice(text, signal, update))) {
            if (!signal.aborted)
              toast.info("No se pudo reproducir la voz. Tocá «Escuchar» para volver a intentar.");
            return;
          }
        }
      } catch {
        if (!signal.aborted) toast.info("No se pudo reproducir la voz en este momento.");
      } finally {
        if (playback.current === current) {
          playback.current = null;
          setActive(null);
        }
      }
    },
    [stop],
  );

  return { auto, active, play, stop, toggleAuto };
}
