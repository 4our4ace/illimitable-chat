// Clip
// ====
// CAP characters: the most text a model gets in one piece (Claude Code
// keeps a command's output to 30,000 too). A command's output is clipped
// to its head and tail as it streams (Machine.ts); any text kept is never
// cut, but goes in pages (a message logged, a zoom, a read). It imports
// nothing of illi's, so any file may use what it holds: a stream's lines
// and events, a file's JSON, the <history> line recall appends to a
// result (history_block, history_bare: the radar's thread reads results
// through it too). A clip is a copy (a slice would keep its source
// alive).

import * as fs from "node:fs";

// Constants
// =========

export const CAP = 30000;

// the <history> line at a result's end, as history_block writes it: a
// blank line, then the tag round one line, a line's id first (#1234+16:
// View.block_name) and " · " after it
const HISTORY = /\n\n<history>#\d+(?:\+\d+)? · [^\n]*<\/history>$/;

// Clip
// ====

// a text taken in pieces
export function clip(): { add: (str: string) => void; text: () => string } {
  const half = CAP / 2;
  const keep = half - 64;
  let head = "";
  let tail = "";
  let gone = 0;
  const add = (str: string) => {
    const n = half - head.length;
    head += str.slice(0, n);
    tail += str.slice(n);
    if (tail.length > CAP) {
      gone += tail.length - keep;
      tail  = tail.slice(-keep);
    }
  };
  const text = () => {
    if (gone === 0 && head.length + tail.length <= CAP) {
      return head + tail;
    }
    const cut  = tail.length - keep;
    const text = head + "\n[... " + (gone + cut) + " characters cut ...]\n" + tail.slice(cut);
    return new TextDecoder().decode(new TextEncoder().encode(text));
  };
  return { add, text };
}

// where the page of a text from `at` ends: CAP characters on, after its
// last newline if it has one, else where a character ends
export function clip_end(str: string, at: number): number {
  if (str.length - at <= CAP) {
    return str.length;
  }
  const nl  = str.lastIndexOf("\n", at + CAP - 1);
  const low = str.charCodeAt(at + CAP) >> 10 === 0x37;
  return nl >= at ? nl + 1 : at + CAP - (low ? 1 : 0);
}

// a text in pages
export function clip_pages(str: string): string[] {
  const pages: string[] = [];
  let at = 0;
  do {
    const end = clip_end(str, at);
    pages.push(str.slice(at, end));
    at = end;
  } while (at < str.length);
  return pages;
}

// a text's page from `at`, and past it where to go on
export function clip_page(str: string, at: number): string {
  const end = clip_end(str, at);
  const on  = "\n[characters " + (at + 1) + "-" + end + " of " + str.length + "; go on with at " + end + "]";
  return str.slice(at, end) + (end < str.length ? on : "");
}

// a byte stream's lines, those of each read whole (one cut short waits
// for the next read; the stream's last comes last, "" if it ends one);
// left early, the stream is cancelled
export async function* stream_lines(stream: ReadableStream<Uint8Array>): AsyncGenerator<string[]> {
  const reader = stream.pipeThrough(new TextDecoderStream() as TransformStream<Uint8Array, string>).getReader();
  let rest = "";
  try {
    for (let got = await reader.read(); !got.done; got = await reader.read()) {
      const nl = got.value.lastIndexOf("\n");
      if (nl >= 0) {
        yield (rest + got.value.slice(0, nl)).split("\n");
        rest = "";
      }
      rest += got.value.slice(nl + 1);
    }
    yield [rest];
  } finally {
    reader.cancel().catch(() => {});
  }
}

// each event's data in a server-sent event stream (its data: lines,
// joined), as it comes
export async function* stream_events(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  let data: string[] = [];
  for await (const lines of stream_lines(stream)) {
    for (const line of lines.map((l) => l.replace(/\r$/, ""))) {
      if (line === "" && data.length > 0) {
        yield data.join("\n");
        data = [];
      } else if (line.startsWith("data:")) {
        data.push(line.slice(5).trimStart());
      }
    }
  }
  if (data.length > 0) {
    yield data.join("\n");
  }
}

// a file's JSON object; null: no file, not JSON, or not an object
export function json_object(file: string): any {
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return typeof data === "object" && data !== null && !Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

// History
// =======
// Recall (Recall.ts) may append one line from illi's memory to a tool's
// result: a summary line of a past episode the radar (Radar.ts) found
// strongly related, as the model zooms it. It is logged with its result,
// as the model read it (a later turn's call reads the same bytes, so the
// cache holds), but never read as the result's own: whatever reads a
// result's text reads it through history_bare (its leaf in the memory
// tree, Memory.source, so it is never summarized, indexed and found
// again; the radar's query and its failure, Radar.said; how a call
// ended, Call.call_outcome; a result's lines, Md.md_output; the views,
// View.ts). It has no newline, so a page (clip_end) never splits it.

// a line as appended to a result: a blank line, then the line between
// <history> tags, on one line (control characters and newlines as
// spaces, the tags taken out of it, so nothing in it closes or opens
// one)
export function history_block(line: string): string {
  return "\n\n<history>" + line.replace(/<\/?history>/g, "").replace(/[\x00-\x1f\x7f-\x9f]+/g, " ").trim() + "</history>";
}

// a result's text without the <history> line recall appended (its own,
// as it ran); only that line, in that form, at the very end: a result
// holding the tag anywhere else (a file that speaks of it, read) is left
// as it is
export function history_bare(text: string): string {
  return text.endsWith("</history>") ? text.replace(HISTORY, "") : text;
}
