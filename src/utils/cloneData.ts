/** Clone game records even in browsers without the native structured-clone API. */
export function cloneData<T>(value: T): T {
  if (typeof globalThis.structuredClone === 'function') return globalThis.structuredClone(value);
  const seen = new WeakMap<object, unknown>();
  const copy = (input: unknown): any => {
    if (typeof input === 'function' || typeof input === 'symbol') throw new TypeError('Unsupported game data');
    if (input === null || typeof input !== 'object') return input;
    if (seen.has(input)) return seen.get(input);
    if (input instanceof Date) {
      const result = new Date(input.getTime()); seen.set(input, result); return result;
    }
    if (input instanceof Map) {
      const result = new Map(); seen.set(input, result);
      input.forEach((v, k) => result.set(copy(k), copy(v))); return result;
    }
    if (input instanceof Set) {
      const result = new Set(); seen.set(input, result);
      input.forEach(v => result.add(copy(v))); return result;
    }
    const prototype = Object.getPrototypeOf(input);
    if (!Array.isArray(input) && prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('Expected a plain game record');
    }
    const result = Array.isArray(input) ? new Array(input.length) : {};
    seen.set(input, result);
    for (const key of Object.keys(input)) {
      Object.defineProperty(result, key, {
        value: copy((input as Record<string, unknown>)[key]),
        enumerable: true, configurable: true, writable: true,
      });
    }
    return result;
  };
  return copy(value);
}
