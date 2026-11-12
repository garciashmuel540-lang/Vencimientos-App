type VoiceQueue = {
  signal: AbortSignal;
  generate: ((text: string) => Promise<string | null>) | null;
  playAudio: (audio: string) => Promise<boolean>;
  playOnDevice: (text: string) => Promise<boolean>;
  prepare: () => void;
};

export async function playVoiceQueue(segments: string[], queue: VoiceQueue): Promise<boolean> {
  const { signal, playAudio, playOnDevice, prepare } = queue;
  let generate = queue.generate;
  let nextAudio = !signal.aborted && segments.length ? generate?.(segments[0]) : undefined;

  for (let index = 0; index < segments.length; index++) {
    if (signal.aborted) return false;
    prepare();
    const audio = await nextAudio;
    if (signal.aborted) return false;

    if (audio) {
      // Keep at most one segment ahead so generation overlaps playback.
      nextAudio = index + 1 < segments.length ? generate?.(segments[index + 1]) : undefined;
      if (await playAudio(audio)) continue;
    }

    if (signal.aborted) return false;
    generate = null;
    nextAudio = undefined;
    if (!(await playOnDevice(segments[index]))) return false;
  }
  return true;
}
