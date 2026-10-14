/**
 * `bpe.ts` against the reference tokenizer, piece by piece.
 *
 *   .venv/bin/python -c ...   # writes data/bpe-reference.json (see README)
 *   pnpm exec tsx research/system1/bridge/bpe-parity.ts research/system1/data/bpe-reference.json
 */
import { readFileSync } from "node:fs";
import { BpeTokenizer } from "./bpe.js";

const reference = JSON.parse(readFileSync(process.argv[2]!, "utf8")) as {
  pieces: string[];
  ids: number[][];
  tokenizer: string;
};
const tokenizer = new BpeTokenizer(reference.tokenizer);
let mismatches = 0;
const started = performance.now();
reference.pieces.forEach((piece, index) => {
  const got = tokenizer.encode(piece);
  const want = reference.ids[index]!;
  if (got.length !== want.length || got.some((id, i) => id !== want[i])) {
    if (mismatches < 5)
      console.log("mismatch:", JSON.stringify(piece), got, want);
    mismatches += 1;
  }
});
console.log(
  `${reference.pieces.length} pieces, ${mismatches} mismatches, ${((performance.now() - started) / 1000).toFixed(1)}s`,
);
process.exitCode = mismatches > 0 ? 1 : 0;
