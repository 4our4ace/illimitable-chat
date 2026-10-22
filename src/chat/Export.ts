// Export
// ======
// A chat's memory (Memory.ts) written out whole, a piece at a time:
// /export's JSON (its messages, summaries, agents' logs and the images
// its messages name, base64), and /tree's page (the view, the messages
// and each level of the tree, one section each).

import { Memory, PIECE, type Part } from "./Memory.ts";
import { Store } from "./Store.ts";

// Export
// ======

export namespace Export {

  // the tree's levels: as many as the count's bits
  export function levels(mem: Memory): number[] {
    return Array.from({ length: mem.count.toString(2).length }, (_, l) => l);
  }

  // level l's nodes built, in order
  export function* level(mem: Memory, l: number): Generator<[Part, string]> {
    for (let i = 0; (i + 1) * 2 ** l <= mem.count; i++) {
      const text = Memory.node(mem, { l, i });
      if (text !== null) {
        yield [{ l, i }, text];
      }
    }
  }

  // /export: the chat's messages, summaries and agents' logs, then each
  // image its messages name, its base64 read a PIECE at a time
  export function* dump(mem: Memory): Generator<string> {
    const pics = new Set<string>();
    let sep = "\n";
    yield '{"messages": [';
    for (let i = 0; i < mem.count; i++) {
      const { kind, text, date, images, more } = Memory.message(mem, i)!;
      images?.forEach((name) => pics.add(name));
      yield (i === 0 ? "\n" : ",\n") + JSON.stringify({ id: i, kind, text, date, images, more });
    }
    yield '],\n"summaries": [';
    for (const l of Export.levels(mem)) {
      for (const [part, text] of Export.level(mem, l)) {
        yield sep + JSON.stringify({ id: Memory.span(part)[0], n: 2 ** l, text });
        sep = ",\n";
      }
    }
    yield '],\n"agents": {';
    sep = "\n";
    for (const log of Store.logs(mem.store)) {
      const entries = Store.work(mem.store, log)!.map(({ i, kind, text, date }) => ({ id: i, kind, text, date }));
      yield sep + JSON.stringify(log) + ": " + JSON.stringify(entries);
      sep = ",\n";
    }
    yield '},\n"images": {';
    sep = "\n";
    for (const name of [...pics].sort()) {
      const img = Store.image(mem.store, name);
      if (img === null) {
        continue;
      }
      const data = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength);
      yield sep + JSON.stringify(name) + ': "';
      for (let at = 0; at < data.length; at += 3 * PIECE) {
        yield data.subarray(at, at + 3 * PIECE).toString("base64");
      }
      yield '"';
      sep = ",\n";
    }
    yield "}}\n";
  }

  // /tree: a section for the view, the messages and each level
  export function* page(mem: Memory): Generator<string> {
    const esc  = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const item = (head: string[], text: string) => "<h4>" + esc(head.join(" · ")) + "</h4><pre>" + esc(text) + "</pre>";
    const date = (id: number) => new Date(Memory.message(mem, id)!.date).toLocaleString("sv-SE");
    const when = (a: number, b: number) => date(a) + (a === b ? "" : " – " + date(b));
    const node = (part: Part, text: string) => {
      const [a, b] = Memory.span(part);
      const head = ["LVL" + part.l + " #" + a + "-" + b, when(a, b), Memory.bytes(text) + " B"];
      return item(head, text);
    };
    const levels = Export.levels(mem);
    const menu = ["VIEW", "ROOT", ...levels.map((l) => "LVL" + l)].map((name) => `<a href="#${name}">${name}</a>`);
    yield `<!doctype html><meta charset="utf-8"><title>illimitable memory</title>
<style>
body { font: 13px/1.4 ui-monospace, monospace; margin: 2em; } nav a { margin-right: 1em; }
section { display: none; } section:target { display: block; }
h4 { margin: .8em 0 .2em; color: #888; font-weight: normal; } pre { margin: 0; white-space: pre-wrap; font: inherit; }
</style>
<script>location.hash = location.hash || "VIEW";</script>
<nav>${menu.join("")}</nav>
<section id="VIEW">`;
    yield mem.view.parts.map((part) => node(part, Memory.text(mem, part))).join("");
    yield '</section>\n<section id="ROOT">';
    for (let i = 0; i < mem.count; i++) {
      const r = Memory.message(mem, i)!;
      yield item(["ROOT #" + i, when(i, i), r.kind, r.size + " B"], r.text);
    }
    for (const l of levels) {
      yield '</section>\n<section id="LVL' + l + '">';
      for (const [part, text] of Export.level(mem, l)) {
        yield node(part, text);
      }
    }
    yield "</section>\n";
  }
}
