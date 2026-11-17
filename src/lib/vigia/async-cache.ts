/** Share concurrent reads; an invalidated in-flight read can never republish stale data. */
export function createAsyncCache<T>(load: () => Promise<T>) {
  let version = 0;
  let cached: { value: T } | undefined;
  let pending: { version: number; promise: Promise<T> } | undefined;
  const invalidate = () => {
    version++;
    cached = undefined;
    pending = undefined;
  };
  async function get(): Promise<T> {
    if (cached) return cached.value;
    if (pending?.version === version) return pending.promise;
    const started = version;
    const promise = Promise.resolve().then(load).then(
      (value) => {
        if (started !== version) return get();
        cached = { value };
        pending = undefined;
        return value;
      },
      (error: unknown) => {
        if (started !== version) return get();
        pending = undefined;
        throw error;
      },
    );
    pending = { version: started, promise };
    return promise;
  }
  return { get, invalidate };
}
