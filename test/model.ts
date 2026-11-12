// A tiny model
// ============
// A model of the shape illi reads (Embed.load: BERT's WordPiece tokenizer
// and an F16 table in safetensors), written to a folder, of a few words
// and four dimensions, so a test searches by meaning without the real
// one's download: each word its row as given, every other piece unknown.

import * as fs from "node:fs";
import * as path from "node:path";

// the model's files in `dir`: a vocabulary of [PAD], [UNK] and the words
// given (in that order), each its row
export function tiny_model(dir: string, rows: Record<string, number[]>): void {
  const words = Object.keys(rows);
  const dim   = rows[words[0]].length;
  const vocab = Object.fromEntries(["[PAD]", "[UNK]", ...words].map((w, k) => [w, k]));
  const table = new Float16Array([...new Array(dim * 2).fill(0), ...words.flatMap((w) => rows[w])]);
  const head  = Buffer.from(JSON.stringify({ embeddings: { dtype: "F16", shape: [words.length + 2, dim], data_offsets: [0, table.byteLength] } }));
  const size  = Buffer.alloc(8);
  size.writeBigUInt64LE(BigInt(head.length));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ normalize: true, embedding_dtype: "float16" }));
  fs.writeFileSync(path.join(dir, "tokenizer.json"), JSON.stringify({
    normalizer: { type: "BertNormalizer", clean_text: true, handle_chinese_chars: true, strip_accents: null, lowercase: true },
    pre_tokenizer: { type: "BertPreTokenizer" },
    model: { type: "WordPiece", unk_token: "[UNK]", continuing_subword_prefix: "##", max_input_chars_per_word: 100, vocab },
  }));
  fs.writeFileSync(path.join(dir, "model.safetensors"), Buffer.concat([size, head, Buffer.from(table.buffer)]));
}
