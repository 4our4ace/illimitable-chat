// Embed
// =====
// Search by meaning, beside search by words: a small model run here, no
// model call. MinishLab's potion-code-16M-v2 (Model2Vec, MIT licence): a
// static model, a token's vector a row of one table, a text's the mean
// of its tokens' rows, normalized, so texts close in meaning point close
// in angle (cosine). Trained on what people ask against code and docs, it
// reads prose, code, paths and errors alike; English and code first: a
// text in another script (Cyrillic, CJK) gets a vector that tells little,
// and is found by its words alone (Store.search).
//
// The model is three files from Hugging Face at one revision (MODEL),
// each checked against its sha256 as it comes, then moved into place
// whole, into models/<name> in illi's root (every profile's), downloaded
// once in the background while `meaning` is on (Embed.fetch). It is read
// where vectors are made and compared (the index thread: Seeker.ts), once
// (Embed.load): its tokenizer's vocabulary and its table (F16 rows).
//
// A text's vector is model2vec's encode, step by step (checked against
// MinishLab's Python and sgrep's to a millionth): BERT's normalizer
// (control characters out, a space for whitespace, a space around each
// CJK ideograph, accents off, then each character lower case on its own,
// as Rust does: no final sigma), split at whitespace and around each
// punctuation mark, each word into the longest pieces the vocabulary
// holds (## before a piece within a word; a word of more than 100
// characters, or one that won't split, unknown), 512 tokens at most, the
// unknown then dropped; the mean of their rows, divided by its length.
// The text is cut first to 512 tokens' worth of characters (the
// vocabulary's median length each). Literal [PAD] and [UNK] in a text are
// read as their characters, not as those tokens.
//
// Kept small (Embed.pack): each value a signed byte, the vector scaled so
// its largest is 127; a quarter of the floats' room, the angle between
// two the same to about a hundredth (Embed.cosine reads it so).

import * as fs from "node:fs";
import * as path from "node:path";

// Types
// =====

// a model as read: its vocabulary (a piece's id), the unknown's id, the
// most characters a word may have, the characters a text is cut to, its
// vectors' length, their table (a row a piece, each value a half float's
// bits: HALF reads them, far quicker than a Float16Array's)
export type Model = { vocab: Map<string, number>; unk: number; most: number; cut: number; dim: number; rows: Uint16Array };

// Constants
// =========

// the model: its name, where it's from, at which revision, and its files
// (each its size and sha256, checked as it comes)
export const MODEL = {
  name : "potion-code-16M-v2",
  repo : "minishlab/potion-code-16M-v2",
  rev  : "e9d2a44ca6a05ac6685f3b23709ea57eb7352d5b",
  files: [
    { name: "config.json", bytes: 59, sha256: "148e5691a6fcc553437156859701fba017a1ba5d340b170f17e0f3668fb861a7" },
    { name: "tokenizer.json", bytes: 1024340, sha256: "107bbdcbad4bff1d299b7a4c3a2fb17c52890688b7dd0e4c9deab79d3c4f3d45" },
    { name: "model.safetensors", bytes: 32490072, sha256: "75cf7a6c2171b230ad19b1e7d8e0b1aee86da5a02af8e7cacedd9921d227623c" },
  ],
};

// the vectors as stored are this model's (a file's meta says so: a model
// changed, its vectors are made anew)
export const VECTORS = MODEL.name + "@" + MODEL.rev.slice(0, 12);

// the most tokens a text is read by
const TOKENS = 512;

// each half float's value, by its bits (made at the first use)
let HALF: Float32Array | null = null;

// the CJK ideographs BERT puts a space around
const CJK: Array<[number, number]> = [[0x4e00, 0x9fff], [0x3400, 0x4dbf], [0x20000, 0x2a6df], [0x2a700, 0x2b73f], [0x2b740, 0x2b81f], [0x2b920, 0x2ceaf], [0xf900, 0xfaff], [0x2f800, 0x2fa1f]];

// whitespace as Rust has it (White_Space), but the control characters,
// gone before
const SPACE = /^[\t\n\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]$/;

// a punctuation mark as BERT's pre-tokenizer splits around it: ASCII's
// (symbols too: $ + < = > ^ ` | ~) and every Unicode P; ASCII's by its
// code, at once
const PUNCT = /^(?:[!-/:-@[-`{-~]|\p{P})$/u;
const ASCII_PUNCT = Array.from({ length: 128 }, (_, cp) => PUNCT.test(String.fromCharCode(cp)));

// a summary line's kind tags ("user: ", "illi: "...), which every line
// has: no part of what it's about
const TAGS = /(^|[\s;,(])(?:user|illi|tool|echo|mind|note|work|recap): /g;

// how long a download may go without a byte
const STALL = 60000;

// the file in the model's folder that says its files are all there,
// each checked (Embed.fetch): its revision's name (VECTORS)
const OK = "ok";

// Embed
// =====

export namespace Embed {

  // the model's folder in illi's root, of its revision (VECTORS), so a
  // later illi's never reads an earlier one's files
  export function folder(root: string): string {
    return path.join(root, "models", VECTORS);
  }

  // whether the model's files are all there, each checked (in illi's
  // root; in a folder: present): OK written once they are (Embed.fetch),
  // gone once one won't read (Embed.spoilt)
  export function ready(root: string): boolean {
    return Embed.present(Embed.folder(root));
  }

  export function present(dir: string): boolean {
    return fs.existsSync(path.join(dir, OK));
  }

  // the model's files in a folder found not to read (a file cut short,
  // changed on disk): not ready, so the next start checks each again
  // and downloads the one that isn't as pinned
  export function spoilt(dir: string): void {
    fs.rmSync(path.join(dir, OK), { force: true });
  }

  // the model's folder to search by meaning with: while `meaning` is on
  // (on) and the model is there; else null (by words alone)
  export function use(root: string, on: boolean): string | null {
    return on && Embed.ready(root) ? Embed.folder(root) : null;
  }

  // the model made ready (Embed.ready): each file there checked against
  // its sha256, one not there or not as pinned downloaded from Hugging
  // Face (host: the tests' own), checked as it comes and moved into place
  // whole (one illi's part file its own, so two at once never mix; one an
  // ended illi left goes first); then OK written, and an earlier
  // revision's folder removed; whether it was made ready now (false: it
  // was already). Thrown: no connection, a refusal, a file not as pinned,
  // a stall, a stop
  export async function fetch(root: string, stop?: AbortSignal, host = "https://huggingface.co"): Promise<boolean> {
    const dir = Embed.folder(root);
    if (Embed.ready(root)) {
      return false;
    }
    // a part file of an illi that ended mid-download (killed) goes
    for (const name of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
      const pid = Number(/\.(\d+)\.part$/.exec(name)?.[1]);
      if (pid > 0 && !Embed.lives(pid)) {
        fs.rmSync(path.join(dir, name), { force: true });
      }
    }
    for (const f of MODEL.files) {
      const file = path.join(dir, f.name);
      if (fs.existsSync(file) && fs.statSync(file).size === f.bytes && new Bun.CryptoHasher("sha256").update(fs.readFileSync(file)).digest("hex") === f.sha256) {
        continue;
      }
      fs.mkdirSync(dir, { recursive: true });
      const part = file + "." + process.pid + ".part";
      try {
        await Embed.get(host + "/" + MODEL.repo + "/resolve/" + MODEL.rev + "/" + f.name, part, f.sha256, stop, f.bytes);
        fs.renameSync(part, file);
      } finally {
        fs.rmSync(part, { force: true });
      }
    }
    fs.writeFileSync(path.join(dir, OK), VECTORS + "\n");
    for (const name of fs.readdirSync(path.dirname(dir))) {
      if (name !== VECTORS && (name === MODEL.name || name.startsWith(MODEL.name + "@"))) {
        fs.rmSync(path.join(path.dirname(dir), name), { recursive: true, force: true });
      }
    }
    return true;
  }

  // whether a process runs (one of another user's: it does)
  export function lives(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch (err: any) {
      return err?.code === "EPERM";
    }
  }

  // a file downloaded to `file`, its sha256 reckoned as it comes and
  // checked (redirects followed: Hugging Face's go to its CDN), stopped
  // once past its bytes
  export async function get(url: string, file: string, sha256: string, stop?: AbortSignal, bytes = Infinity): Promise<void> {
    const quiet = new AbortController();
    let timer = setTimeout(() => quiet.abort(), STALL);
    const signal = stop === undefined ? quiet.signal : AbortSignal.any([stop, quiet.signal]);
    try {
      let res: Response;
      try {
        res = await globalThis.fetch(url, { headers: { "user-agent": "illi" }, signal });
      } catch (err) {
        throw signal.aborted ? err : new Error("Hugging Face can't be reached: check your connection");
      }
      if (!res.ok || res.body === null) {
        throw new Error("Hugging Face answered " + res.status + " for " + path.basename(url));
      }
      const hash = new Bun.CryptoHasher("sha256");
      const out  = fs.openSync(file, "w", 0o600);
      let came   = 0;
      try {
        for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
          clearTimeout(timer);
          timer = setTimeout(() => quiet.abort(), STALL);
          came += chunk.length;
          if (came > bytes) {
            break;
          }
          hash.update(chunk);
          fs.writeSync(out, chunk);
        }
      } finally {
        fs.closeSync(out);
      }
      if (came > bytes || hash.digest("hex") !== sha256) {
        throw new Error(path.basename(url) + " didn't match the checksum illi takes it by, so illi didn't keep it");
      }
    } finally {
      clearTimeout(timer);
    }
  }

  // the model read from its folder; thrown: a file missing, or not of
  // the shape illi reads (another tokenizer, another table)
  export function load(dir: string): Model {
    const tok  = JSON.parse(fs.readFileSync(path.join(dir, "tokenizer.json"), "utf8"));
    const norm = tok?.normalizer;
    if (tok?.model?.type !== "WordPiece" || tok?.pre_tokenizer?.type !== "BertPreTokenizer" || norm?.type !== "BertNormalizer" || norm.lowercase !== true || norm.clean_text !== true || norm.handle_chinese_chars !== true || (norm.strip_accents ?? true) !== true) {
      throw new Error("the search model's tokenizer isn't BERT's WordPiece");
    }
    const vocab = new Map<string, number>(Object.entries(tok.model.vocab as Record<string, number>));
    const unk   = vocab.get(String(tok.model.unk_token));
    const buf   = fs.readFileSync(path.join(dir, "model.safetensors"));
    const size  = Number(buf.readBigUInt64LE(0));
    const head  = JSON.parse(buf.subarray(8, 8 + size).toString("utf8"));
    const table = head?.embeddings;
    const [rows, dim] = Array.isArray(table?.shape) ? table.shape : [0, 0];
    const [a, b] = Array.isArray(table?.data_offsets) ? table.data_offsets : [0, 0];
    if (unk === undefined || table?.dtype !== "F16" || rows !== vocab.size || b - a !== rows * dim * 2 || 8 + size + b > buf.length) {
      throw new Error("the search model's table isn't as illi reads it");
    }
    const at   = buf.byteOffset + 8 + size + a;
    const data = at % 2 === 0 ? new Uint16Array(buf.buffer, at, rows * dim) : new Uint16Array(buf.buffer.slice(at, at + rows * dim * 2));
    const lens = [...vocab.keys()].map((k) => [...k].length).sort((x, y) => x - y);
    return { vocab, unk, most: Number(tok.model.max_input_chars_per_word) || 100, cut: TOKENS * lens[lens.length >> 1], dim, rows: data };
  }

  // a text as BERT's normalizer leaves it (Embed ahead says how); one of
  // printable ASCII alone, at once (nothing in it changes but its case)
  export function normal(text: string): string {
    if (/^[\x20-\x7e\t\n\r]*$/.test(text)) {
      return text.replace(/[\t\n\r]/g, " ").toLowerCase();
    }
    let out = "";
    for (const ch of text) {
      const cp = ch.codePointAt(0)!;
      if (cp < 0x80) {
        out += cp === 9 || cp === 10 || cp === 13 ? " " : cp < 32 || cp === 127 ? "" : ch;
        continue;
      }
      if (cp === 0xfffd || /^\p{C}$/u.test(ch)) {
        continue;
      }
      const c = SPACE.test(ch) ? " " : ch;
      out += CJK.some(([lo, hi]) => cp >= lo && cp <= hi) ? " " + c + " " : c;
    }
    // each character lower case on its own (a run of ASCII at once)
    return out.normalize("NFD").replace(/\p{Mn}/gu, "").replace(/[\x00-\x7f]+|[^\x00-\x7f]/gu, (run) => run.toLowerCase());
  }

  // a normalized text's words: split at whitespace, each punctuation mark
  // a word of its own
  export function words(text: string): string[] {
    const out: string[] = [];
    let word = "";
    for (const ch of text) {
      const cp = ch.charCodeAt(0);
      if (cp < 0x80 && cp !== 32 && !ASCII_PUNCT[cp]) {
        word += ch;
      } else if (ch === " " || SPACE.test(ch)) {
        if (word !== "") {
          out.push(word);
          word = "";
        }
      } else if (PUNCT.test(ch)) {
        if (word !== "") {
          out.push(word);
          word = "";
        }
        out.push(ch);
      } else {
        word += ch;
      }
    }
    if (word !== "") {
      out.push(word);
    }
    return out;
  }

  // a word's pieces, the longest first from its start (## before one
  // within it); one too long, or that won't split, the unknown alone
  export function pieces(model: Model, word: string): number[] {
    const chars = /^[\x00-\x7f]*$/.test(word) ? null : [...word];
    const size  = chars?.length ?? word.length;
    const part  = (a: number, z: number) => (chars === null ? word.slice(a, z) : chars.slice(a, z).join(""));
    if (size > model.most) {
      return [model.unk];
    }
    const ids: number[] = [];
    for (let a = 0; a < size; ) {
      let id: number | undefined;
      let z = size;
      for (; z > a; z--) {
        id = model.vocab.get((a > 0 ? "##" : "") + part(a, z));
        if (id !== undefined) {
          break;
        }
      }
      if (id === undefined) {
        return [model.unk];
      }
      ids.push(id);
      a = z;
    }
    return ids;
  }

  // a text's tokens: cut to the model's characters, normalized, split,
  // pieced, TOKENS at most, the unknown dropped
  export function tokens(model: Model, text: string): number[] {
    const cut = [...text].length > model.cut ? [...text].slice(0, model.cut).join("") : text;
    return Embed.words(Embed.normal(cut)).flatMap((w) => Embed.pieces(model, w)).slice(0, TOKENS).filter((id) => id !== model.unk);
  }

  // a text's vector: its tokens' rows' mean, of length 1 (no token: all 0)
  export function vector(model: Model, text: string): Float32Array {
    const ids  = Embed.tokens(model, text);
    const sum  = new Float64Array(model.dim);
    const half = (HALF ??= new Float32Array(new Float16Array(new Uint16Array(65536).map((_, k) => k).buffer)));
    for (const id of ids) {
      const row = id * model.dim;
      for (let k = 0; k < model.dim; k++) {
        sum[k] += half[model.rows[row + k]];
      }
    }
    let norm = 0;
    for (let k = 0; k < model.dim; k++) {
      sum[k] /= Math.max(1, ids.length);
      norm += sum[k] * sum[k];
    }
    norm = Math.sqrt(norm) + 1e-32;
    return Float32Array.from(sum, (x) => x / norm);
  }

  // a summary line's words as its vector reads them: its kind tags out
  export function line(text: string): string {
    return text.replace(TAGS, "$1");
  }

  // a vector kept small: each value a signed byte, scaled so its largest
  // is 127 (all 0: all 0)
  export function pack(v: Float32Array): Uint8Array {
    const top = v.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
    const out = new Int8Array(v.length);
    for (let k = 0; k < v.length; k++) {
      out[k] = top === 0 ? 0 : Math.round((v[k] * 127) / top);
    }
    return new Uint8Array(out.buffer);
  }

  // the cosine between a vector (of length 1) and one kept small (0:
  // either all 0, or not of its length)
  export function cosine(q: Float32Array, kept: Uint8Array): number {
    if (kept.length !== q.length) {
      return 0;
    }
    const x = new Int8Array(kept.buffer, kept.byteOffset, kept.length);
    let [dot, norm] = [0, 0];
    for (let k = 0; k < q.length; k++) {
      dot += q[k] * x[k];
      norm += x[k] * x[k];
    }
    return norm === 0 ? 0 : dot / Math.sqrt(norm);
  }

}
