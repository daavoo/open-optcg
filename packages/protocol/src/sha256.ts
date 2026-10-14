import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

// One encoder for every hash: `utf8ToBytes` constructs a `TextEncoder` per
// call, and the engine hashes a whole game state on every observation.
const utf8 = new TextEncoder();

/**
 * Node's own SHA-256 when this runs under Node, for the engine's per-observation
 * state hash: the native digest is several times faster than a JavaScript one
 * on a state-sized input, and the two agree byte for byte. Read through
 * `process.getBuiltinModule` rather than an import so the browser bundle -- one
 * file, built for `platform: "browser"` -- never sees a `node:` specifier.
 *
 * Taken only once it has reproduced a known digest: workerd also exposes a
 * `process` with Node's shape under its Node compatibility layer, and a
 * runtime that offers the function but not a working `createHash` behind it
 * -- or none at all, as in the browser -- takes the JavaScript path.
 */
const nativeCrypto = ((): typeof import("node:crypto") | undefined => {
  try {
    if (
      typeof process === "undefined" ||
      typeof process.getBuiltinModule !== "function"
    )
      return undefined;
    const candidate = process.getBuiltinModule("node:crypto");
    const digest = candidate.createHash("sha256").update("abc", "utf8");
    return digest.digest("hex") ===
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
      ? candidate
      : undefined;
  } catch {
    return undefined;
  }
})();

export function sha256Bytes(value: string): Uint8Array {
  if (nativeCrypto)
    return new Uint8Array(
      nativeCrypto.createHash("sha256").update(value, "utf8").digest(),
    );
  return sha256(utf8.encode(value));
}

export function sha256Hex(value: string): string {
  if (nativeCrypto)
    return nativeCrypto
      .createHash("sha256")
      .update(value, "utf8")
      .digest("hex");
  return bytesToHex(sha256(utf8.encode(value)));
}

/** The JavaScript digest, for holding the native one to it in a test. */
export function sha256HexPortable(value: string): string {
  return bytesToHex(sha256(utf8.encode(value)));
}
