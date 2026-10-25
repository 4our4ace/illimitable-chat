// Radar
// =====
// While the AI works, the summary lines of past topics that may be
// related, for the user's eye (the side's Related section: Related.ts);
// nothing of it reaches the model. No model call: the chat's own index
// of its summary lines (find_<chat>, Store.ts), searched in the search
// thread (Seeker.ts) after each step of a turn.
//
// The query (Radar.units): the run's user message, then the AI's latest
// words, tool calls (their paths, commands, names) and failed results
// (their errors' names), each a unit: a phrase of the index's words, so
// `src/chat/Memory.ts` asks for "memory ts" (the two words side by side),
// never the bare word memory, and `term_side_drawn` for "term side
// drawn". What every chat holds drops out: stop words, the kinds a
// summary tags its items with, tool names, their arguments' keys, file
// endings and folders like src, shell commands and flags, numbers and
// hashes. Each unit weighs by what it is (a path or an error's name
// most), by where it came from and by how recent it is.
//
// The search (Radar.search): each unit's lines before the messages left
// out at the chat's end (Ask's end), counted by episode (each EPISODE
// messages of the chat, those left out among them too); a unit in
// more than a tenth of them (two at least) is too common here to tell
// anything, as one found nowhere is: both dropped (so is one in more than
// LINES lines, however big the chat); the UNITS weighing most of the
// rest. Each line found is widened to the summary node over it of up to
// EPISODE messages (the highest built that leaves out what is left out),
// so a line says what the episode was, not one message of it; the index
// holds every level of the tree, so the lines of one episode meet in it.
// An episode scores the sum of weight × rarity (idf, by episodes) over the
// units it holds, each once: comparable from one query to the next, as
// bm25 is not. One with a single unit shows only if it is a path or an
// error's name.
//
// Left out: the messages in the view at message detail, those from the
// view's turn on (recent), and the lines the user dismissed: never found,
// nor widened into.
//
// Kept still while read (Radar.merge): a line found again keeps its
// place, its score the new one; one not found fades; new lines join at
// the foot while there is room; a line leaves once faded under FLOOR, or
// from a full list for one FAR stronger, one a step; a line the user
// opened or pinned stays.

import { Store, type Store as File } from "./Store.ts";

// Types
// =====

// what a unit is: a file's path, an error's name, a name in code, a word
export type Kind = "path" | "error" | "name" | "word";

// a unit of a query: a phrase of the index's words (Radar.words), a space
// between; its weight; what it is
export type Unit = { q: string; w: number; k: Kind };

// a message of the run, as the query reads it: its kind, its text
export type Said = { kind: string; text: string };

// a search asked of the search thread: the chat, its units, the first
// message left out with all after it (end), the other messages left out,
// each [a, b)
export type Ask = { chat: number; units: Unit[]; end: number; out: Array<[number, number]> };

// a line found: the messages it covers (first, n), its text, its score,
// how many units it holds, whether a path or an error's name is among
// them (anchored), the date of its last message
export type Found = { first: number; n: number; text: string; score: number; units: number; anchored: boolean; date: string };

// a line shown: as found, its best score yet (peak), whether the user
// opened or pinned it (touched: it stays)
export type Shown = Found & { peak: number; touched: boolean };

// Constants
// =========

// what each kind weighs; what each source multiplies it by (the user's
// message, a tool call, a failed result, the AI's words, an agent's
// report); how much each newer message of the run fades an older one's,
// and how many of the latest are read; a unit said again adds AGAIN of
// its weight each time, RISE times it at most
const WEIGHT: Record<Kind, number> = { path: 3, error: 3, name: 2, word: 1 };
const SOURCE: Record<string, number> = { user: 1, tool: 1, echo: 1, illi: 0.8, work: 0.8 };
const FADE_BY = 0.85;
const LATEST  = 16;
const AGAIN   = 0.2;
const RISE    = 1.6;

// the most units a query sends, and searches; a unit in more than this
// share of the chat's episodes (LEAST at least), or in more than LINES
// lines, is too common to search
const ASKED  = 24;
const UNITS  = 12;
const COMMON = 0.1;
const LEAST  = 2;
const LINES  = 4000;

// the most messages a line covers, as widened; the episodes looked into
// whole, by the units they hold; the lines a search gives; the least
// score a line shows at
const EPISODE = 16;
const LOOKED  = 24;
const FOUND   = 8;
const FLOOR   = 5;

// the lines shown at most; a line not found again keeps this much of its
// score, each step (under FLOOR, it leaves); a full list lets its
// weakest go only for one this many times stronger
export const SHOWN = 4;
const FADE = 0.85;
const FAR  = 3;

// a value of a tool call longer than this is code, or a file's text:
// only its NAMES longest names are read, at half weight; the head of a
// failed result read for its errors
const CODE  = 200;
const NAMES = 3;
const HEAD  = 4000;

// words read as a word, not a unit: English's commonest, the kinds a
// summary tags its items with, tool names, their arguments' keys, shell
// commands and their subcommands, code's keywords, and words a path holds
// in every project (folders, file endings)
const STOP = new Set(`
about above after again against also always another anything around because been before being below between both cannot could does doing done down during each either else enough even ever every first from further gets give given goes going gone good have having here hers herself himself however into itself just keep kept last later least less like made make makes making many maybe might mine more most much must myself need needs never next none nothing often once only onto other ours ourselves over own perhaps please quite rather really same seem seems shall should show shows shown since some something still such sure take than thank thanks that their theirs them themselves then there these they thing things think this those though through thus together too toward under unless until upon used uses using very want wants well were what whatever when where whether which while whom whose will with within without would your yours yourself okay yeah already instead went come came look looks looked find found work works worked working change changes changed try tried trying call calls called line lines file files code part parts point right left time times today yesterday
user illi tool echo mind note work recap error errors
shell read write edit zoom date projects search spawn tell todo skill approve bash grep glob webfetch websearch fetch
command commands query path paths file_path filepath old new old_string new_string old_text new_text content contents pattern patterns words project name names tasks task agent agents effort message messages items item text status timeout description limit offset replace_all edits input output args cwd prompt type value values true false null undefined
src lib libs test tests spec specs dist build node modules node_modules home usr tmp var etc bin opt docs doc app apps packages pkg internal cmd scripts script assets public static vendor github workflows index main
cd ls cat rg sed awk git bun bunx npm npx pnpm yarn deno python python3 pip echo printf head tail wc find xargs sort uniq mkdir rm cp mv touch chmod chown ln diff tee curl wget make cargo tsc jq env export sudo kill ps exit set source which sleep tmux ssh docker
status log show add commit push pull fetch checkout branch merge rebase stash reset worktree run install check
const let var function return import class interface async await this void string number boolean object switch case break continue default throw catch finally typeof instanceof extends implements public private static readonly def self none print elif lambda pass impl struct enum match crate
ts tsx js jsx mjs cjs json jsonl md txt py rs go rb java kt swift cpp hpp cs sh zsh fish toml yaml yml lock html htm css scss sql sqlite db log xml svg png jpg jpeg gif webp pdf cfg ini conf
`.split(/\s+/).filter((w) => w !== ""));

// the file endings a path without a slash is known by
const ENDS = new Set("ts tsx js jsx mjs cjs json jsonl md txt py rs go rb java kt swift c h cpp hpp cs sh zsh fish toml yaml yml lock html htm css scss sql sqlite db log xml svg png jpg jpeg gif webp pdf cfg ini conf env".split(" "));

// an error's name: TypeError, an errno (ENOENT), SQLITE_BUSY, Node's
// ERR_MODULE_NOT_FOUND; a word that is one, whole
const ERROR  = /\b(?:[A-Z][A-Za-z]*(?:Error|Exception)|E[A-Z]{3,}|SQLITE_[A-Z_]+|ERR_[A-Z0-9_]+)\b/g;
const ERRORS = new RegExp("^(?:" + ERROR.source.slice(2, -2) + ")$");

// a tool call as logged: its name, a space, its input's JSON
const CALL = /^(\S+) (\{[\s\S]*)$/;

// Radar
// =====

export namespace Radar {

  // a text's words as the index splits them (unicode61): runs of letters,
  // marks and digits, in lower case
  export function words(text: string): string[] {
    return text.toLowerCase().split(/[^\p{L}\p{M}\p{N}\p{Co}]+/u).filter((w) => w !== "");
  }

  // Query
  // -----

  // the units of a run, weighing most first, ASKED at most: its user
  // message (null: none), then its latest messages (oldest first), each
  // newer one fading those before it
  export function units(user: string | null, run: Said[]): Unit[] {
    const out    = new Map<string, Unit & { n: number; top: number }>();
    const latest = run.filter((m) => SOURCE[m.kind] !== undefined).slice(-LATEST);
    const add    = (u: Unit) => {
      const was = out.get(u.q);
      out.set(u.q, { q: u.q, k: was !== undefined && WEIGHT[was.k] > WEIGHT[u.k] ? was.k : u.k, n: (was?.n ?? 0) + 1, top: Math.max(was?.top ?? 0, u.w), w: 0 });
    };
    if (user !== null) {
      Radar.read(user, SOURCE.user).forEach(add);
    }
    latest.forEach((m, k) => Radar.said(m, SOURCE[m.kind] * FADE_BY ** (latest.length - 1 - k)).forEach(add));
    const weighed = [...out.values()].map(({ q, k, n, top }) => ({ q, k, w: Math.min(top * RISE, top * (1 + AGAIN * (n - 1))) }));
    return weighed.sort((a, b) => b.w - a.w || (a.q < b.q ? -1 : 1)).slice(0, ASKED).map((u) => ({ ...u, w: Math.round(u.w * 1000) / 1000 }));
  }

  // a message's units, its source's weight `w`: a tool call's values (its
  // keys left out), a failed result's errors' names, any other's text
  export function said(m: Said, w: number): Unit[] {
    if (m.kind === "tool") {
      return Radar.call(m.text, w);
    }
    if (m.kind === "echo") {
      return Radar.failed(m.text) ? Radar.errors(m.text.slice(0, HEAD) + "\n" + m.text.slice(-HEAD), w) : [];
    }
    return Radar.read(m.text, w);
  }

  // a tool call's units: each string its input holds, read as text, its
  // keys left out; a long one (code, a file's text) gives its longest
  // names alone, at half weight; a call that won't parse, its text
  export function call(text: string, w: number): Unit[] {
    const m = CALL.exec(text);
    let input: unknown = null;
    try {
      input = m === null ? null : JSON.parse(m[2]);
    } catch {}
    if (input === null || typeof input !== "object") {
      return Radar.read(text, w);
    }
    const strings: string[] = [];
    const walk = (x: unknown) => (typeof x === "string" ? strings.push(x) : Array.isArray(x) ? x.forEach(walk) : x !== null && typeof x === "object" ? Object.values(x).forEach(walk) : undefined);
    walk(input);
    const names = (s: string) => [...new Map(Radar.read(s, w / 2).filter((u) => u.k === "name").map((u) => [u.q, u])).values()].sort((a, b) => b.q.length - a.q.length).slice(0, NAMES);
    return strings.flatMap((s) => (s.length <= CODE ? Radar.read(s, w) : names(s)));
  }

  // whether a result failed: logged with View.FAILED's "error: ", or a
  // command's that exited other than 0 (Machine.ts's last line)
  export function failed(text: string): boolean {
    return text.startsWith("error: ") || /\(exit [1-9]\d* in [^)]*\)\s*$/.test(text);
  }

  // the errors' names a text holds
  export function errors(text: string, w: number): Unit[] {
    return [...new Set(text.match(ERROR) ?? [])].flatMap((name) => Radar.unit(name, "error", w));
  }

  // a text's units, weight `w` each: its errors' names; then, word by
  // word (a link left out), a path (a slash, or a known ending) as its
  // file's name with its ending ("memory ts"), a folder's as a name; a
  // name in code (snake_case, camelCase, a.b, CAPS) as its words; a flag
  // left out; any other a word, of four letters or more
  export function read(text: string, w: number): Unit[] {
    const out = Radar.errors(text, w);
    for (const raw of text.replace(/\bhttps?:\/\/\S+/g, " ").split(/\s+/)) {
      const bare = raw.replace(/\(\)/g, "").replace(/^[\s"'`([{<*_~,;]+|[\s"'`()\]}>*_~,;:.!?]+$/g, "").replace(/['’]s$/, "").replace(/:\d+(?:[-:]\d+)*$/, "");
      if (bare === "" || bare.startsWith("-") || ERRORS.test(bare)) {
        continue;
      }
      const end  = /\.([A-Za-z0-9]+)$/.exec(bare)?.[1]?.toLowerCase();
      const base = bare.replace(/\/+$/, "").split("/").pop() ?? "";
      if (bare.includes("/") || (end !== undefined && ENDS.has(end))) {
        out.push(...(/\.[A-Za-z0-9]+$/.test(base) ? Radar.unit(base, "path", w) : Radar.unit(base, "name", w * 0.75)));
      } else if (/^[A-Za-z_$][\w$]*(?:[.:#][A-Za-z_$][\w$]*)*$/.test(bare) && (/[a-z][A-Z]|[A-Za-z0-9]_[A-Za-z0-9]|[.:#]/.test(bare) || /^[A-Z][A-Z0-9]{3,}$/.test(bare))) {
        out.push(...Radar.unit(bare, "name", w));
      } else {
        out.push(...Radar.words(bare).flatMap((x) => Radar.unit(x, "word", w)));
      }
    }
    return out;
  }

  // a unit of `text`'s words, of a kind, weight `w` × the kind's; none if
  // it says nothing: no word but a number, a hash, one under three letters
  // or a stop word (a file's name may be one: index.ts, new.ts; a word is
  // four letters at least, and letters only)
  export function unit(text: string, k: Kind, w: number): Unit[] {
    const ws   = Radar.words(text);
    const real = (x: string) => x.length >= (k === "word" ? 4 : 3) && (k === "path" || !STOP.has(x)) && !/^\d+$/.test(x) && !(/\d/.test(x) && /^[0-9a-f]{7,}$/.test(x)) && (k !== "word" || /^\p{L}+$/u.test(x));
    return ws.length === 0 || ws.length > 6 || !ws.some(real) ? [] : [{ q: ws.join(" "), w: w * WEIGHT[k], k }];
  }

  // Search
  // ------

  // a search, run where the index is read (the search thread): the lines
  // the units find, best first (Radar ahead of this file says how), as
  // the file was when it began (one read transaction)
  export function search(file: File, ask: Ask): Found[] {
    const store = { ...file, chat: ask.chat };
    return store.db.transaction(() => Radar.seek(store, ask))();
  }

  // the search, in its read transaction (Radar.search)
  export function seek(store: File, ask: Ask): Found[] {
    const all   = Math.max(1, Math.ceil(ask.end / EPISODE));
    const most  = Math.max(LEAST, Math.floor(all * COMMON));
    const left  = (first: number, n: number) => ask.out.some(([a, b]) => first < b && first + n > a);
    const held  = ask.units.map((u) => {
      const at = Store.held(store, u.q, ask.end, LINES + 1);
      return { u, at, in: new Set(at.filter(({ n }) => n <= EPISODE).map(({ first }) => Math.floor(first / EPISODE))).size };
    }).filter((h) => h.in > 0 && h.at.length <= LINES && h.in <= most);
    const used  = held.map((h) => ({ ...h, idf: Math.log(1 + (all - h.in + 0.5) / (h.in + 0.5)) })).sort((a, b) => b.u.w * b.idf - a.u.w * a.idf).slice(0, UNITS);
    // each line found, by the unit that found it, under its episode's top
    // node (EPISODE messages), so the levels of one episode meet
    const tops = new Map<number, Array<{ unit: number; first: number; n: number }>>();
    used.forEach(({ at }, unit) => {
      for (const { first, n } of at.filter(({ first, n }) => n <= EPISODE && !left(first, n))) {
        const top = Math.floor(first / EPISODE) * EPISODE;
        tops.set(top, [...(tops.get(top) ?? []), { unit, first, n }]);
      }
    });
    const worth = (hits: Array<{ unit: number }>) => [...new Set(hits.map((h) => h.unit))].reduce((s, k) => s + used[k].u.w * used[k].idf, 0);
    const looked = [...tops].sort((a, b) => worth(b[1]) - worth(a[1]) || b[0] - a[0]).slice(0, LOOKED);
    // an episode: the node over the hits, if built and nothing in it is
    // left out; else each half over its own hits (a hit's own node is in
    // the index, so built, and never left out)
    const episodes: Array<{ first: number; n: number; text: string; hits: Array<{ unit: number }> }> = [];
    const widen = (first: number, n: number, hits: Array<{ unit: number; first: number; n: number }>): void => {
      const text = first + n <= ask.end && !left(first, n) ? Store.node(store, first, n) : null;
      if (text !== null || n === 1) {
        return void (text !== null && episodes.push({ first, n, text, hits }));
      }
      const half = n / 2;
      const low  = hits.filter((h) => h.first < first + half);
      const high = hits.filter((h) => h.first >= first + half);
      if (low.length > 0) {
        widen(first, half, low);
      }
      if (high.length > 0) {
        widen(first + half, half, high);
      }
    };
    looked.forEach(([top, hits]) => widen(top, EPISODE, hits));
    const found = episodes.map((e) => {
      const units = [...new Set(e.hits.map((h) => h.unit))];
      const anchored = units.some((k) => used[k].u.k === "path" || used[k].u.k === "error");
      return { first: e.first, n: e.n, text: e.text, score: Math.round(worth(e.hits) * 100) / 100, units: units.length, anchored };
    });
    return found.filter((f) => f.score >= FLOOR && (f.units >= 2 || f.anchored)).sort((a, b) => b.score - a.score || b.first - a.first).slice(0, FOUND)
      .map((f) => ({ ...f, date: Store.date(store, f.first + f.n - 1) ?? "" }));
  }

  // Shown
  // -----

  // the lines shown after a search found `found` (best first; none of
  // them overlapping what is left out), `most` at most: each line shown
  // found again (it, or a node in or over it) keeps its place, its score
  // the new one; one not found fades (FADE); at most one leaves a step
  // (one opened or pinned never): the weakest, once faded under FLOOR,
  // else, from a full list, for the best new one if that is FAR stronger;
  // new ones join at the foot while there is room. Never two lines over
  // the same messages
  export function merge(shown: Shown[], found: Found[], most = SHOWN): Shown[] {
    const over = (a: { first: number; n: number }, b: { first: number; n: number }) => a.first < b.first + b.n && b.first < a.first + a.n;
    const kept = shown.map((s): Shown => {
      const f = found.find((x) => over(x, s));
      return f === undefined ? { ...s, score: Math.round(s.score * FADE * 100) / 100 } : { ...s, score: f.score, peak: Math.max(s.peak, f.score) };
    });
    const fresh = found.filter((f) => !kept.some((s) => over(f, s))).filter((f, k, all) => !all.slice(0, k).some((g) => over(f, g)));
    const join  = (f: Found): Shown => ({ ...f, peak: f.score, touched: false });
    const weak  = kept.filter((s) => !s.touched).sort((a, b) => a.score - b.score)[0];
    const stay  = weak !== undefined && weak.score < FLOOR ? kept.filter((s) => s !== weak) : kept;
    const room  = fresh.slice(0, Math.max(0, most - stay.length)).map(join);
    if (stay !== kept || room.length > 0 || fresh.length === 0) {
      return [...stay, ...room];
    }
    return weak !== undefined && fresh[0].score >= FAR * weak.score ? [...kept.filter((s) => s !== weak), join(fresh[0])] : kept;
  }

  // the lines shown, those over messages now left out gone (the view
  // holds them at message detail, or the user dismissed them)
  export function prune(shown: Shown[], end: number, out: Array<[number, number]>): Shown[] {
    return shown.filter((s) => s.first + s.n <= end && !out.some(([a, b]) => s.first < b && s.first + s.n > a));
  }

  // what a view leaves out, from its parts ([id, n]) and its turn (the
  // first message shown whole; Infinity: none yet): each message at
  // message detail (n 1) or from the turn on, and the spans dismissed,
  // as the first message left out with all after it (end: the count, if
  // none) and the rest, [a, b) each
  export function left(parts: Array<[number, number]>, turn: number, gone: Array<[number, number]>): { end: number; out: Array<[number, number]> } {
    const count  = parts.reduce((m, [id, n]) => Math.max(m, id + n), 0);
    const ranges = [...parts.filter(([id, n]) => n === 1 || id >= turn).map(([id, n]): [number, number] => [id, id + n]), ...(turn < count ? [[turn, count] as [number, number]] : []), ...gone].sort((a, b) => a[0] - b[0]);
    const out: Array<[number, number]> = [];
    for (const [a, b] of ranges) {
      const last = out[out.length - 1];
      if (last !== undefined && a <= last[1]) {
        last[1] = Math.max(last[1], b);
      } else {
        out.push([a, b]);
      }
    }
    const tail = out[out.length - 1];
    return tail !== undefined && tail[1] >= count ? { end: Math.min(tail[0], count), out: out.slice(0, -1) } : { end: count, out };
  }

}
