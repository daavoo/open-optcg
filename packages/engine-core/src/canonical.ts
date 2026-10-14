import { sha256Hex } from "./sha256.js";

/**
 * Canonical JSON: the same value always serializes to the same text, whatever
 * order its keys were inserted in. `hashState` is built on it, and every trace,
 * fixture and online session compares those hashes.
 *
 * This used to rebuild the value as a key-sorted copy and hand it to
 * `JSON.stringify`, which allocated a second object graph the size of the game
 * state on every `observe()` -- the single most expensive thing in a
 * simulated transition once the rules themselves were fast. This writes the
 * text directly. The output is byte-for-byte what the copy-then-stringify
 * path produced; `test/canonical.test.ts` holds it to that reference, including
 * the two things `JSON.stringify` does that are easy to forget:
 *
 * - a key whose value is `undefined` (or a function) is omitted, but the same
 *   value inside an array is written as `null`;
 * - an object's array-index-like keys ("0", "17") come first, in numeric order,
 *   before the rest of the keys in their sorted order -- because that is how
 *   the copy `Object.fromEntries` built was enumerated.
 *
 * Keys sort with `localeCompare`, as before: the ordering is part of the hash.
 */
const MAX_ARRAY_INDEX = 4294967294; // 2^32 - 2, the last valid array index.

function isArrayIndexKey(key: string): boolean {
  if (key.length === 0 || key.length > 10) return false;
  if (key === "0") return true;
  if (key.charCodeAt(0) === 48) return false; // a leading zero is a string key
  for (let index = 0; index < key.length; index += 1) {
    const code = key.charCodeAt(index);
    if (code < 48 || code > 57) return false;
  }
  return Number(key) <= MAX_ARRAY_INDEX;
}

/**
 * The order an object's keys serialize in, by the keys as enumerated.
 *
 * A game state holds hundreds of objects of a few dozen shapes -- every card
 * instance has the same keys in the same order -- and `localeCompare` is the
 * expensive part of ordering them. The order depends only on the key list, so
 * it is worked out once per distinct list and looked up by the list joined on
 * a character no key contains. Bounded by the number of distinct shapes, which
 * is a property of the state's type, not of how many games are played.
 */
interface OrderedKey {
  key: string;
  /** `JSON.stringify(key) + ":"`, written ahead of the value. */
  prefix: string;
}

const keyOrders = new Map<string, readonly OrderedKey[]>();

function orderedKeys(record: Record<string, unknown>): readonly OrderedKey[] {
  const enumerated = Object.keys(record);
  const signature = enumerated.join("\u0000");
  const cached = keyOrders.get(signature);
  if (cached) return cached;
  const keys = [...enumerated].sort((left, right) => left.localeCompare(right));
  const indexKeys: string[] = [];
  const namedKeys: string[] = [];
  for (const key of keys) {
    (isArrayIndexKey(key) ? indexKeys : namedKeys).push(key);
  }
  indexKeys.sort((left, right) => Number(left) - Number(right));
  const ordered = [...indexKeys, ...namedKeys].map((key) => ({
    key,
    prefix: JSON.stringify(key) + ":",
  }));
  keyOrders.set(signature, ordered);
  return ordered;
}

/** The JSON text for `value`, or `undefined` when JSON has no text for it. */
function serialize(value: unknown): string | undefined {
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "number":
      return Number.isFinite(value) ? String(value) : "null";
    case "boolean":
      return value ? "true" : "false";
    case "object":
      break;
    default:
      // `undefined`, functions and symbols have no JSON text; a bigint throws,
      // exactly as it did through `JSON.stringify`.
      return JSON.stringify(value);
  }
  if (value === null) return "null";
  if (Array.isArray(value)) {
    let text = "[";
    for (let index = 0; index < value.length; index += 1) {
      if (index > 0) text += ",";
      text += serialize(value[index]) ?? "null";
    }
    return text + "]";
  }
  let text = "{";
  let first = true;
  const record = value as Record<string, unknown>;
  for (const { key, prefix } of orderedKeys(record)) {
    const childText = serialize(record[key]);
    if (childText === undefined) continue;
    if (!first) text += ",";
    first = false;
    text += prefix + childText;
  }
  return text + "}";
}

export function canonicalJson(value: unknown): string {
  // The reference implementation returned `JSON.stringify`'s `undefined` for a
  // value with no JSON text; the declared type never admitted it, and no caller
  // passes one, so the cast keeps the signature rather than widening it.
  return serialize(value) as string;
}

export function hashState(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}
