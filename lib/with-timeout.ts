/** Resolve with fallback if promise does not settle within ms. */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  fallback: T,
  label?: string,
): Promise<T> {
  if (!Number.isFinite(ms) || ms <= 0) return promise;
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      setTimeout(() => {
        if (label) console.warn(`[timeout] ${label} after ${ms}ms`);
        resolve(fallback);
      }, ms);
    }),
  ]);
}
