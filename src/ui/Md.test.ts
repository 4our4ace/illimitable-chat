// Md test
// =======
// `bun test Md.test.ts`. A message typed keeps its blank lines; a
// command's exit names its result; a note or a thought draws as a reply
// does, in its look; the answers to illi's questions as the user's words.
// Italics and a bare url read as a reply reads them.

import { expect, test } from "bun:test";
import * as Md from "./Md.ts";
import * as Paint from "./Paint.ts";
import * as View from "./View.ts";

// a thought: markdown drawn as a reply's (its list's bullet), all of it
// dim and italic; with no text, nothing
test("a thought draws as a reply does, dim and italic", () => {
  const lines = Paint.rows_lines(View.entry_rows(1, "mind", "**Plan**\n\n- one\n- two"), 40);
  const text  = lines.map((l) => l.map((r) => r.x).join("").trim()).filter((x) => x !== "");
  expect(text).toEqual(["Plan", "• one", "• two"]);
  expect(lines.flat().filter((r) => r.x.trim() !== "").every((r) => r.s.d && r.s.i)).toBe(true);
  expect(View.entry_rows(1, "mind", "  ")).toEqual([]);
});

// a message typed (a short paste is typed too) shows as it was: each
// blank line kept, those at its ends dropped; a long paste's too
test("a message typed keeps its blank lines", () => {
  const lines = (b: Md.Block[]) => b.flatMap((x) => (x.$ === "Para" ? x.x.map((l) => l.map((s) => s.x).join("")) : []));
  expect(lines(Md.md_plain("\na\n\n\n\nb\n\n"))).toEqual(["a", "", "", "", "b"]);
  expect(lines(Md.md_plain('see <pasted n="1">\nx\n\n\ny\n</pasted>'))).toEqual(["see ", "x", "", "", "y"]);
});

// a shell's "(exit 0 in 0.4 s)" is in its result's name, never a
// numbered line; with no output, a result of its own still says it
test("a command's exit and time name its result, unnumbered", () => {
  const shown = (text: string) => Paint.rows_lines(View.entry_rows(1, "echo", text), 50).map((l) => l.map((r) => r.x).join("").trimEnd());
  expect(Md.md_output("a\nb\n(exit 0 in 0.4 s)")).toEqual([{ $: "File", k: "result · exit 0 · 0.4 s", n: 1, x: ["a", "b"] }]);
  expect(Md.md_output("(killed by SIGTERM in 2.0 s)")).toEqual([{ $: "File", k: "result · killed by SIGTERM · 2.0 s", n: 1, x: [] }]);
  expect(shown("a\n(exit 1 in 0.0 s)")).toEqual(["╭─ result · exit 1 · 0.0 s ──────────────────────╮", "│ 1 a                                            │", "╰────────────────────────────────────────────────╯"]);
});

// the answers to illi's questions: the user's words, framed blue and
// named, outside the work folded away; skipped, they stay work
test("the answers to illi's questions show as the user's, not as work", () => {
  const v = View.view_new();
  const rows = View.view_acts(v, [...View.entry_rows(1, "tool", "ask {}"), ...View.entry_rows(2, "echo", View.ANSWERED + "Which database?\npicked: SQLite")]);
  expect(rows.map((r) => r.$)).toEqual(["Act", "Msg"]);
  expect(rows[1]).toMatchObject({ kind: "user", who: "your answers", text: "Which database?\npicked: SQLite" });
  const text = Paint.rows_lines([rows[1]], 40).map((l) => l.map((r) => r.x).join(""));
  expect(text[0]).toStartWith("╭─ your answers ─");
  expect(text.slice(1, 3).map((l) => l.replace(/ +│$/, "").trim())).toEqual(["│ Which database?", "│ picked: SQLite"]);
  expect(View.view_acts(v, View.entry_rows(3, "echo", "The user skipped the questions: decide yourself, or ask in your reply.")).map((r) => r.$)).toEqual(["Act"]);
});

// *x* italic only with no word or star either side and no space after
// its first star, on one line; a bare url as a reply's (Markdown.ts),
// its trailing stop or bracket left out
test("italics and a bare url, as a reply reads them", () => {
  expect(Md.span_parse("an *important* word")).toEqual([Md.Text("an "), { $: "Ital", x: "important" }, Md.Text(" word")]);
  expect(Md.span_parse("**bold** and *it*")).toEqual([{ $: "Bold", x: "bold" }, Md.Text(" and "), { $: "Ital", x: "it" }]);
  for (const plain of ["2*3*4", "* a*", "a*b*", "*a*b", "*a\nb*", "*a**", "https://a"]) {
    expect(Md.span_parse(plain)).toEqual([Md.Text(plain)]);
  }
  expect(Md.span_parse("see https://x.co/a.")).toEqual([Md.Text("see "), { $: "Link", x: "https://x.co/a", k: "https://x.co/a" }, Md.Text(".")]);
  expect(Md.span_parse("(https://x.co/a?b=1)")).toEqual([Md.Text("("), { $: "Link", x: "https://x.co/a?b=1", k: "https://x.co/a?b=1" }, Md.Text(")")]);
  expect(Md.span_parse("\"https://x.co\"")).toEqual([Md.Text("\""), { $: "Link", x: "https://x.co", k: "https://x.co" }, Md.Text("\"")]);
  expect(Md.md_flat("*a* at https://ab")).toBe("a at https://ab");
});
