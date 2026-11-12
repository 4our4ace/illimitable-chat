// Embed test
// ==========
// `bun test Embed.test.ts`. BERT's normalizer as model2vec reads a text:
// control characters out, whitespace a space, CJK spaced, accents off,
// each character lower case on its own (no final sigma); split at
// whitespace and around punctuation (ASCII's symbols too); each word into
// its longest pieces, ## within, one too long or that won't split
// unknown; 512 tokens at most, the unknown dropped; the mean of the rows,
// of length 1 (none: all 0). A vector kept as bytes keeps its angle; a
// line's kind tags are no part of it. A model is read from its folder
// (one of another shape refused); a download is checked against its
// sha256, redirects followed, and one that doesn't match is refused; a
// model there already isn't downloaded again. With ILLI_EMBED_LIVE (a
// folder the real model is downloaded to once), the real model's tokens
// and vectors are MinishLab's own, as their Python gives them.

import { afterAll, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Embed, MODEL, VECTORS, type Model } from "./Embed.ts";
import { tiny_model } from "../../test/model.ts";

const DIR = fs.mkdtempSync(os.tmpdir() + "/illi-embed-");
afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

// a model in memory: these pieces, each its row (dim 2), [UNK] 0
function model(pieces: Record<string, number[]>): Model {
  const all = { "[UNK]": [0, 0], ...pieces };
  return { vocab: new Map(Object.keys(all).map((p, k) => [p, k])), unk: 0, most: 100, cut: 3584, dim: 2, rows: new Uint16Array(new Float16Array(Object.values(all).flat()).buffer) };
}

test("BERT's normalizer: control characters out, whitespace a space, CJK spaced, accents off, each character lower case on its own", () => {
  expect(Embed.normal("Café\tÜber\u0000\u200b ok\r\nX")).toBe("cafe uber ok  x");
  expect(Embed.normal("ΣΟΦΟΣ")).toBe("σοφοσ");
  expect(Embed.normal("中文")).toBe(" 中  文 ");
  expect(Embed.normal("İstanbul")).toBe("istanbul");
  expect(Embed.normal("Plain ASCII\tLine")).toBe("plain ascii line");
});

test("split at whitespace and around each punctuation mark, ASCII's symbols too", () => {
  expect(Embed.words("a.b(c)  d$e|f — g")).toEqual(["a", ".", "b", "(", "c", ")", "d", "$", "e", "|", "f", "—", "g"]);
});

test("each word into its longest pieces, ## within; one too long or that won't split, unknown; 512 tokens at most, the unknown dropped", () => {
  const m = model({ un: [1, 0], "##aff": [0, 1], "##able": [1, 1], a: [1, 0] });
  expect(Embed.pieces(m, "unaffable")).toEqual([1, 2, 3]);
  expect(Embed.pieces(m, "unxable")).toEqual([0]);
  expect(Embed.pieces(m, "a".repeat(101))).toEqual([0]);
  expect(Embed.tokens(m, "Unaffable zzz unaffable")).toEqual([1, 2, 3, 1, 2, 3]);
  expect(Embed.tokens(m, "a ".repeat(600)).length).toBe(512);
});

test("a text's vector: the mean of its tokens' rows, of length 1; none known: all 0", () => {
  const m = model({ x: [3, 0], y: [0, 1] });
  const v = Embed.vector(m, "x y y");
  expect([...v].map((n) => Math.round(n * 1e6) / 1e6)).toEqual([0.83205, 0.5547]);
  expect([...Embed.vector(m, "nothing known")]).toEqual([0, 0]);
});

test("a vector kept as bytes keeps its angle; all 0, or another length, is 0", () => {
  const v = Float32Array.from([0.6, -0.8, 0, 0]);
  const w = Float32Array.from([0, 0, 1, 0]);
  expect(Embed.cosine(v, Embed.pack(v))).toBeGreaterThan(0.9999);
  expect(Math.abs(Embed.cosine(v, Embed.pack(w)))).toBeLessThan(1e-9);
  expect(Embed.cosine(v, Embed.pack(new Float32Array(4)))).toBe(0);
  expect(Embed.cosine(v, Embed.pack(Float32Array.from([1, 0])))).toBe(0);
});

test("a line's kind tags are no part of its vector's words", () => {
  expect(Embed.line("user: the cache; illi: fixed it (tool: edit a.ts)\necho: done")).toBe("the cache; fixed it (edit a.ts)\ndone");
});

test("a model is read from its folder (its tokenizer and F16 table); one of another shape is refused", () => {
  const dir = DIR + "/tiny";
  tiny_model(dir, { cache: [1, 0, 0, 0], bug: [0, 1, 0, 0], cake: [0, 0, 0, 1] });
  const m = Embed.load(dir);
  expect([m.dim, m.unk, m.vocab.get("cake")]).toEqual([4, 1, 4]);
  expect([...Embed.vector(m, "Cache BUG!")].map((n) => Math.round(n * 1e4) / 1e4)).toEqual([0.7071, 0.7071, 0, 0]);
  const tok = JSON.parse(fs.readFileSync(dir + "/tokenizer.json", "utf8"));
  fs.writeFileSync(dir + "/tokenizer.json", JSON.stringify({ ...tok, model: { ...tok.model, type: "BPE" } }));
  expect(() => Embed.load(dir)).toThrow("isn't BERT's WordPiece");
});

test("a download is checked against its sha256 as it comes, redirects followed, stopped past its size; one that doesn't match is refused", async () => {
  const body = "the model's bytes";
  const server = Bun.serve({ port: 0, fetch: (req) => (new URL(req.url).pathname === "/moved" ? Response.redirect("/file", 302) : new Response(body)) });
  const sha = new Bun.CryptoHasher("sha256").update(body).digest("hex");
  try {
    await Embed.get(server.url + "moved", DIR + "/got", sha);
    expect(fs.readFileSync(DIR + "/got", "utf8")).toBe(body);
    expect(Embed.get(server.url + "file", DIR + "/bad", "0".repeat(64))).rejects.toThrow("didn't match the checksum");
    expect(Embed.get(server.url + "file", DIR + "/big", sha, undefined, body.length - 1)).rejects.toThrow("didn't match the checksum");
  } finally {
    server.stop(true);
  }
});

test("the model made ready: each file there checked, one not as pinned downloaded, then marked ready and an earlier revision's folder removed; ready, none is fetched; one found not to read, all are checked again", async () => {
  const body = "the model's bytes";
  let asked = 0;
  const server = Bun.serve({ port: 0, fetch: () => (asked++, new Response(body)) });
  const files = MODEL.files;
  const root  = DIR + "/root";
  const dir   = Embed.folder(root);
  const file  = path.join(dir, "config.json");
  try {
    (MODEL as any).files = [{ name: "config.json", bytes: body.length, sha256: new Bun.CryptoHasher("sha256").update(body).digest("hex") }];
    fs.mkdirSync(root + "/models/" + MODEL.name, { recursive: true });
    fs.mkdirSync(root + "/models/" + MODEL.name + "@000000000000", { recursive: true });
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file + ".999999999.part", "an ended illi's");
    expect([Embed.ready(root), await Embed.fetch(root, undefined, server.url.origin), Embed.ready(root), asked]).toEqual([false, true, true, 1]);
    expect([fs.readdirSync(root + "/models"), fs.readdirSync(dir).sort()]).toEqual([[VECTORS], ["config.json", "ok"]]);
    expect([await Embed.fetch(root, undefined, server.url.origin), asked]).toEqual([false, 1]);
    Embed.spoilt(dir);
    expect([Embed.ready(root), await Embed.fetch(root, undefined, server.url.origin), asked]).toEqual([false, true, 1]);
    fs.writeFileSync(file, "x".repeat(body.length));
    Embed.spoilt(dir);
    expect([await Embed.fetch(root, undefined, server.url.origin), asked, fs.readFileSync(file, "utf8")]).toEqual([true, 2, body]);
    (MODEL as any).files = [{ name: "config.json", bytes: body.length, sha256: "0".repeat(64) }];
    Embed.spoilt(dir);
    expect(Embed.fetch(root, undefined, server.url.origin)).rejects.toThrow("didn't match the checksum");
    await Bun.sleep(50);
    expect([Embed.ready(root), fs.readdirSync(dir)]).toEqual([false, ["config.json"]]);
  } finally {
    (MODEL as any).files = files;
    server.stop(true);
  }
});

// the real model's tokens and first values, as MinishLab's model2vec
// gives them (its Python, checked against sgrep's to a millionth)
const GOLDEN: Array<[string, number[], number[]]> = [
  ["the search thread dies when two illis open one file", [999, 2948, 10692, 7292, 1046, 1051, 4668, 1486, 1333, 1031, 4374], [-0.0452856, -0.0830706, 0.0483395, 0.0606143, -0.0189774, 0.0360905, 0.0470751, 0.176839]],
  ["error: SQLITE_BUSY: database is locked (exit 1 in 2.0 s)", [6564, 27, 31280, 38, 4700, 27, 6812, 1006, 4302, 9, 5167, 18, 1002, 19, 15, 17, 58, 10], [-0.0321306, 0.0363847, -0.0281552, 0.0931392, 0.1097449, -0.1018694, 0.1003412, 0.1042232]],
  ["export function term_side_drawn(t: Term, w: number): Side { return x.getParameterTypes(); }", [8170, 2856, 1747, 38, 1220, 38, 3570, 9, 59, 27, 1747, 13, 62, 27, 1196, 10, 27, 1220, 66, 1712, 63, 15, 63456, 9, 10, 28, 68], [-0.0789738, 0.033726, 0.1681196, 0.0308689, -0.0804173, -0.0267758, -0.1198598, 0.0215527]],
  ["Caf\u00e9 \u00dcber na\u00efve fa\u00e7ade \u2014 r\u00e9sum\u00e9", [6671, 18172, 14746, 7511, 520, 12749], [0.0262292, 0.1172104, -0.0999818, 0.2542923, -0.0876263, 0.1440041, 0.0067939, 0.0802529]],
  ["\u03a3\u039f\u03a6\u0399\u0391 \u03c3\u03bf\u03c6\u03af\u03b1\u03c2 \u039f\u0394\u039f\u03a3", [176, 28733, 28739, 26435, 176, 28733, 28739, 26435, 18582, 172, 28725, 28733, 28736], [0.21729, -0.2195647, -0.1466408, 0.1638386, -0.2629911, 0.0978951, 0.0806362, 0.151431]],
  ["\u0130stanbul \u0131l\u0131k \u015eEH\u0130R", [8963, 107, 1143, 10725, 1246, 6370, 10964], [0.248297, -0.0807051, 0.0635649, -0.2398858, 0.1637751, 0.2966414, 0.0609152, 0.146017]],
  ["\u7f13\u5b58\u9519\u8bef \u30ad\u30e3\u30c3\u30b7\u30e5 \uce90\uc2dc", [55527, 32617, 37095, 38404, 704, 29257, 29240, 29235, 29258, 469, 29010, 29000, 29022], [0.553651, -0.5619926, -0.0433821, -0.0182798, -0.0999464, 0.137244, 0.1650842, 0.0674846]],
  ["Fix the cache bug in src/chat/Store.ts: ENOENT, no such file 'a\tb'\u0000\u200b", [7084, 999, 16056, 10832, 1002, 29562, 16, 10837, 16, 2576, 15, 23532, 27, 36791, 13, 1056, 1110, 4374, 8, 40, 41, 8], [0.0771824, -0.2245219, 0.0472296, 0.0029539, 0.0251966, 0.0440965, 0.0890729, -0.0617083]],
  ["!!! ??? ...", [2, 2, 2, 32, 32, 32, 15, 15, 15], [0.2106131, -0.0276655, 0.0211711, -0.0285376, -0.0474228, -0.0367065, 0.0363189, 0.0625328]]
];

test.skipIf(!process.env.ILLI_EMBED_LIVE)("the real model (ILLI_EMBED_LIVE): its tokens and vectors are MinishLab's own", async () => {
  const root = process.env.ILLI_EMBED_LIVE!;
  await Embed.fetch(root);
  const m = Embed.load(Embed.folder(root));
  for (const [text, ids, head] of GOLDEN) {
    expect(Embed.tokens(m, text)).toEqual(ids);
    const v = Embed.vector(m, text);
    head.forEach((x, k) => expect(Math.abs(v[k] - x)).toBeLessThan(1e-6));
  }
}, 300000);
