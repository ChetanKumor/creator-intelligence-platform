/** Canonical project JSON: recursively sorted UTF-16 keys, ordered arrays, finite numbers.
 * Rejects non-JSON values, accessors, sparse arrays, symbols, and cycles instead of dropping data.
 * This is a versioned project convention, not a claim of full RFC 8785 compliance.
 */
export function canonicalSerialize(value: unknown): string {
  const ancestors = new Set<object>();
  function encode(input: unknown): string {
    if (input === null) return "null";
    if (typeof input === "string" || typeof input === "boolean") return JSON.stringify(input);
    if (typeof input === "number") {
      if (!Number.isFinite(input)) throw new TypeError("Canonical JSON requires finite numbers.");
      return JSON.stringify(input);
    }
    if (typeof input !== "object") throw new TypeError("Value is not JSON data.");
    if (ancestors.has(input)) throw new TypeError("Canonical JSON cannot contain cycles.");
    if (Object.getOwnPropertySymbols(input).length !== 0) throw new TypeError("Symbol properties are not JSON data.");
    ancestors.add(input);
    try {
      if (Array.isArray(input)) {
        if (Object.keys(input).length !== input.length) throw new TypeError("Sparse or extended arrays are not JSON data.");
        return `[${Array.from({ length: input.length }, (_, index) => {
          const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
          if (descriptor === undefined || !("value" in descriptor)) throw new TypeError("Array accessors are not JSON data.");
          return encode(descriptor.value);
        }).join(",")}]`;
      }
      if (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null) throw new TypeError("Canonical JSON requires plain objects.");
      return `{${Object.getOwnPropertyNames(input).sort().map((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(input, key);
        if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) throw new TypeError("Hidden fields and accessors are not JSON data.");
        return `${JSON.stringify(key)}:${encode(descriptor.value)}`;
      }).join(",")}}`;
    } finally {
      ancestors.delete(input);
    }
  }
  return encode(value);
}
