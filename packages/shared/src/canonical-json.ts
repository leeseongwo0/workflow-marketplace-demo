export type CanonicalJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalJsonValue[]
  | { readonly [key: string]: CanonicalJsonValue };

function serializeCanonical(value: unknown, ancestors: Set<object>): string {
  if (value === null) return "null";

  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number": {
      if (!Number.isFinite(value)) {
        throw new TypeError("Canonical JSON numbers must be finite");
      }
      return Object.is(value, -0) ? "0" : JSON.stringify(value);
    }
    case "string":
      return JSON.stringify(value);
    case "object":
      break;
    default:
      throw new TypeError("Value is not representable as canonical JSON");
  }

  if (ancestors.has(value)) {
    throw new TypeError("Canonical JSON cannot contain cycles");
  }
  ancestors.add(value);

  try {
    if (Array.isArray(value)) {
      const entries: string[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) {
          throw new TypeError("Canonical JSON arrays cannot contain holes");
        }
        entries.push(serializeCanonical(value[index], ancestors));
      }
      return `[${entries.join(",")}]`;
    }

    const prototype = Object.getPrototypeOf(value) as object | null;
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Canonical JSON objects must be plain objects");
    }
    if (Reflect.ownKeys(value).some((key) => typeof key === "symbol")) {
      throw new TypeError("Canonical JSON objects cannot have symbol keys");
    }

    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${serializeCanonical(record[key], ancestors)}`);
    return `{${entries.join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

export function canonicalJson(value: unknown): string {
  return serializeCanonical(value, new Set<object>());
}

export function canonicalJsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalJson(value));
}
