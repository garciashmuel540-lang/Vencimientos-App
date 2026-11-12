type VoiceQueue = {
  signal: AbortSignal;
  generate: (text: string) => Promise<string | null>;
  playAudio: (audio: string) => Promise<boolean>;
  playOnDevice: (text: string) => Promise<boolean>;
  prepare: () => void;
};

export async function playVoiceQueue(
  segments: string[],
  queue: VoiceQueue,
  startIndex = 0,
): Promise<number> {
  const { signal, generate, playAudio, playOnDevice, prepare } = queue;
  let nextAudio =
    !signal.aborted && startIndex < segments.length ? generate(segments[startIndex]) : undefined;

  for (let index = startIndex; index < segments.length; index++) {
    if (signal.aborted) return index;
    prepare();
    const audio = await nextAudio;
    if (signal.aborted) return index;

    // Keep at most one segment ahead so generation overlaps playback.
    nextAudio = index + 1 < segments.length ? generate(segments[index + 1]) : undefined;
    if (audio && (await playAudio(audio))) continue;
    if (signal.aborted || !(await playOnDevice(segments[index]))) return index;
  }
  return segments.length;
}
