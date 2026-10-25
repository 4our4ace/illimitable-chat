// Radar
// =====
// While the AI works, the summary lines of past topics that may be
// related: for the user's eye first (the side's Related section,
// Related.ts), searched after each step of a turn; the strong ones for
// the model too (Radar.recall, searched as each of its tool calls runs:
// Recall.ts appends one to the call's result). No model call: the chat's
// own index of its summary lines (find_<chat>, Store.ts), searched in a
// thread of its own (Seeker.ts: one for the side's, one for recall's).
//
// The query (Radar.units): the run's user message, then the AI's latest
// words, tool calls (their paths, commands, names) and failed results
// (their errors' names), each a unit: a phrase of the index's words, so
// `src/chat/Memory.ts` asks for "memory ts" (the two words side by side),
// never the bare word memory, and `term_side_drawn` for "term side
// drawn"; a short name counts too (MCP, db.ts). What every chat holds
// drops out: stop words, the kinds a summary tags its items with, tool
// names, their arguments' keys, file endings and folders like src, shell
// commands and flags, numbers and hashes. Each unit weighs by what it is
// (a path or an error's name most), by where it came from and by how
// recent it is. All are sent (ASKED at most, far more than are used):
// the search, which knows how rare each is, chooses.
//
// The search (Radar.search): each unit counted by the lines holding it
// (the index's lists of where each word is: no line read); one in none,
// or in more than LINES (however big the chat), dropped; of the rest,
// the CHOSEN weighing most by that count (weight × idf, by lines) have
// their lines before the messages left out at the chat's end (Ask's end)
// read, and counted by episode (each EPISODE messages of the chat, those
// left out among them too); a unit in more than a tenth of them (LEAST
// at least) is too common here to tell anything, as one found in none
// is: both dropped; the UNITS weighing most of the rest are used (weight
// × idf, by episodes). Each line found is widened to the summary node
// over it of up to EPISODE messages (the highest built that leaves out
// what is left out), so a line says what the episode was, not one
// message of it; the index holds every level of the tree, so the lines
// of one episode meet in it.
// An episode scores the sum of weight × rarity (idf, by episodes) over the
// units it holds, each once: comparable from one query to the next, as
// bm25 is not. One with a single unit shows only if it is a path or an
// error's name.
//
// Left out: the messages in the view at message detail, those from the
// view's turn on (recent), and the lines the user dismissed: never found,
// nor widened into. A result's <history> line (what recall gave the
// model) is never read as the result's (history_bare), nor indexed: never
// found again as if it had happened.
//
// Strong (Radar.strong): anchored (a path or an error's name among the
// units it holds), two units at least, its score the bar's at least
// (Radar.bar: STRONG, then where the lines the user opened and pinned at
// the side score). Only such a line goes to the model, and only one
// nothing it holds whole names yet (Radar.named), nor one its view holds
// at an episode's detail or finer (its lines of EPISODE messages or
// fewer left out too, as those at message detail: Radar.left `fine`; a
// line found there would tell it no more than its view does).
//
// Kept still while read (Radar.merge): a line found again keeps its
// place, its score the new one; one not found fades; new lines join at
// the foot while there is room; a line leaves once faded under FLOOR, or
// from a full list for one FAR stronger, one a step; a line the user
// opened or pinned stays through that turn (touched: Related.ts lets it
// go at the user's next message, and it fades and leaves as any other).

import { history_bare } from "../tools/Clip.ts";
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

// a recall asked of the search thread (Recall.ts): the chat; whose run it
// is (log: a subagent's log; null: the chat's own agent); the call now,
// as it will be logged (`name {input}`); what its caller's view leaves out
// (end, out, as an Ask's); the first message it holds whole (from: the
// chat's agent's recent messages; a subagent holds its whole log); the
// score a line must reach (bar: Radar.bar)
export type Recall = { chat: number; log: string | null; call: string; end: number; out: Array<[number, number]>; from: number; bar: number };

// a line found: the messages it covers (first, n), its text, its score,
// how many units it holds, whether a path or an error's name is among
// them (anchored), the date of its last message
export type Found = { first: number; n: number; text: string; score: number; units: number; anchored: boolean; date: string };

// a line shown: as found, its best score yet (peak), whether the user
// opened or pinned it this turn (touched: it stays)
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

// the most units a query sends (a bound for a pasted log: a run's own
// say far fewer), whose lines a search reads, and that it uses; a
// unit in more than this share of the chat's episodes (LEAST at least:
// a topic come back twice is still told in a young chat), or in more
// than LINES lines, is too common to search
const ASKED  = 200;
const CHOSEN = 24;
const UNITS  = 12;
const COMMON = 0.1;
const LEAST  = 3;
const LINES  = 4000;

// the most messages a line covers, as widened; the episodes looked into
// whole, by the units they hold; the lines a search gives; the least
// score a line shows at
export const EPISODE = 16;
const LOOKED  = 24;
const FOUND   = 8;
const FLOOR   = 5;

// the lines shown at most; a line not found again keeps this much of its
// score, each step (under FLOOR, it leaves); a full list lets its
// weakest go only for one this many times stronger
export const SHOWN = 4;
const FADE = 0.85;
const FAR  = 3;

// the score a line must reach to be given to the model (Radar.strong), as
// the side shows every line past FLOOR. STRONG, three times FLOOR, till
// the user's choices say where: in a chat of 100 episodes a unit in one of
// them weighs idf ln(1 + 99.5/1.5) ≈ 4.2, so a path the call now names
// scores about 12.6 alone and STRONG asks for about that and a rare word
// or a name besides (16.8; a name, 21); words alone, a path said only some
// messages back (each newer one fades it to 0.85) or one common in the
// chat stay under it, and so does a young chat's line (a unit's rarity
// is smaller there). Once ENOUGH lines matching a path or an error's
// name (anchored, as a line given must be) were opened or pinned at the
// side (related.json), the bar is where their lower QUARTILE starts (a
// count's best score, rounded down), up or down, never under LOWEST
// (twice FLOOR: a path and a rare word in a chat of a few dozen
// episodes, about 12, clears it; one of them alone never)
export const STRONG   = 15;
export const LOWEST   = 10;
export const ENOUGH   = 20;
const QUARTILE = 0.25;

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
cd ls cat rg sed awk git bun bunx npm npx pnpm yarn deno python python3 pip echo printf head tail wc find xargs sort uniq mkdir rm cp mv touch chmod chown ln diff tee curl wget make cargo tsc jq env export sudo kill ps exit set source which sleep tmux docker
status log show add commit push pull fetch checkout branch merge rebase stash reset worktree run install check
const let var function return import class interface async await this void string number boolean object switch case break continue default throw catch finally typeof instanceof extends implements public private static readonly def self none print elif lambda pass impl struct enum match crate
ts tsx js jsx mjs cjs json jsonl md txt py rs go rb java kt swift cpp hpp cs sh zsh fish toml yaml yml lock html htm css scss sql sqlite db log xml svg png jpg jpeg gif webp pdf cfg ini conf
`.split(/\s+/).filter((w) => w !== ""));

// the file endings a path without a slash is known by
const ENDS = new Set("ts tsx js jsx mjs cjs json jsonl md txt py rs go rb java kt swift c h cpp hpp cs sh zsh fish toml yaml yml lock html htm css scss sql sqlite db log xml svg png jpg jpeg gif webp pdf cfg ini conf env".split(" "));

// a word in capitals that is said loud, or a label, never a name: three
// letters of English, and what heads a note
const LOUD = new Set(`
the and for not but you all are can get has had its now any our off put top end fix bug wip fyi imo btw lol omg eta yes why how who one two out use was did may too see way day let got try ask own new old etc
fixme important warning asap tldr imho
`.split(/\s+/).filter((w) => w !== ""));

// the errnos a failed system call is known by (Node's err.code): by
// name, as a word in capitals (ENTER, EMPTY) is none
const ERRNO = `
ENOENT EACCES EPERM EEXIST EISDIR ENOTDIR EMFILE ENFILE ECONNREFUSED ECONNRESET ETIMEDOUT EADDRINUSE EPIPE EAGAIN EBADF EBUSY ENOMEM ENOSPC
EINVAL EINTR EHOSTUNREACH ENETUNREACH ENOTEMPTY EXDEV EROFS ELOOP ENAMETOOLONG ESRCH ECHILD ENOTSUP EOPNOTSUPP ENOEXEC E2BIG ENOTCONN ECONNABORTED EPROTO
`.split(/\s+/).filter((w) => w !== "");

// an error's name: TypeError, an errno (ENOENT), SQLITE_BUSY, Node's
// ERR_MODULE_NOT_FOUND; a word that is one, whole
const ERROR  = new RegExp("\\b(?:[A-Z][A-Za-z]*(?:Error|Exception)|" + ERRNO.join("|") + "|SQLITE_[A-Z_]+|ERR_[A-Z0-9_]+)\\b", "g");
const ERRORS = new RegExp("^(?:" + ERROR.source.slice(2, -2) + ")$");

// a tool call as logged: its name, a space, its input's JSON
const CALL = /^(\S+) (\{[\s\S]*)$/;

// a line named in a message: #16+16 or #16 (as the side pins it and
// recall gives it: View.block_name), or 16+8| (as the view, a zoom and a
// search write it: Memory.line; a zoom of one message, 16+0|)
const NAMED = /#(\d+)(?:\+(\d+))?(?![\d+])|(?<![\w+#])(\d+)\+(\d+)\|/g;

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
  // keys left out), a failed result's errors' names (the result's own:
  // the <history> line recall appended to it never counts, history_bare),
  // any other's text
  export function said(m: Said, w: number): Unit[] {
    if (m.kind === "tool") {
      return Radar.call(m.text, w);
    }
    if (m.kind === "echo") {
      const text = history_bare(m.text);
      return Radar.failed(text) ? Radar.errors(text.slice(0, HEAD) + "\n" + text.slice(-HEAD), w) : [];
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
  // command's that exited other than 0 (Machine.ts's last line, before
  // the <history> line recall may have appended: history_bare)
  export function failed(text: string): boolean {
    return text.startsWith("error: ") || /\(exit [1-9]\d* in [^)]*\)\s*$/.test(history_bare(text));
  }

  // the errors' names a text holds
  export function errors(text: string, w: number): Unit[] {
    return [...new Set(text.match(ERROR) ?? [])].flatMap((name) => Radar.unit(name, "error", w));
  }

  // a text's units, weight `w` each: its errors' names; then, word by
  // word (a link left out), a path (a slash, or a known ending) as its
  // file's name with its ending ("memory ts"), a folder's as a name; a
  // name in code (snake_case, camelCase, a.b, CAPS of three or more, not
  // LOUD: MCP, SIDE_WIDTH) as its words; a flag left out; any other a
  // word, of four letters or more
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
      } else if (/^[A-Za-z_$][\w$]*(?:[.:#][A-Za-z_$][\w$]*)*$/.test(bare) && (/[a-z][A-Z]|[A-Za-z0-9]_[A-Za-z0-9]|[.:#]/.test(bare) || (/^[A-Z][A-Z0-9]{2,}$/.test(bare) && !LOUD.has(bare.toLowerCase())))) {
        out.push(...Radar.unit(bare, "name", w));
      } else {
        out.push(...Radar.words(bare).flatMap((x) => Radar.unit(x, "word", w)));
      }
    }
    return out;
  }

  // a unit of `text`'s words, of a kind, weight `w` × the kind's; none if
  // it says nothing: no word but a number, a hash, one under three letters
  // or a stop word (a word is four letters at least, and letters only). A
  // file's name is judged by its name without its ending, where two
  // letters say enough (db.ts), and a stop word too (index.ts, new.ts)
  export function unit(text: string, k: Kind, w: number): Unit[] {
    const ws   = Radar.words(text);
    const said = (x: string) => !/^\d+$/.test(x) && !(/\d/.test(x) && /^[0-9a-f]{7,}$/.test(x));
    const real = (x: string) => x.length >= (k === "word" ? 4 : 3) && !STOP.has(x) && said(x) && (k !== "word" || /^\p{L}+$/u.test(x));
    const some = k === "path" ? Radar.words(text.replace(/\.[A-Za-z0-9]+$/, "")).some((x) => x.length >= 2 && said(x)) : ws.some(real);
    return ws.length === 0 || ws.length > 6 || !some ? [] : [{ q: ws.join(" "), w: w * WEIGHT[k], k }];
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
    const total = Math.max(1, Store.indexed(store));
    const idf   = (n: number, of: number) => Math.log(1 + (of - n + 0.5) / (n + 0.5));
    const left  = (first: number, n: number) => ask.out.some(([a, b]) => first < b && first + n > a);
    // each unit counted by its lines, anywhere (no line read); those
    // read, the CHOSEN weighing most by that count
    const chosen = ask.units.map((u) => ({ u, lines: Store.hits(store, u.q, LINES + 1) })).filter((c) => c.lines > 0 && c.lines <= LINES)
      .map((c) => ({ u: c.u, guess: c.u.w * idf(c.lines, total) })).sort((a, b) => b.guess - a.guess).slice(0, CHOSEN);
    const held  = chosen.map(({ u }) => {
      const at = Store.held(store, u.q, ask.end, LINES);
      return { u, at, in: new Set(at.filter(({ n }) => n <= EPISODE).map(({ first }) => Math.floor(first / EPISODE))).size };
    }).filter((h) => h.in > 0 && h.in <= most);
    const used  = held.map((h) => ({ ...h, idf: idf(h.in, all) })).sort((a, b) => b.u.w * b.idf - a.u.w * a.idf).slice(0, UNITS);
    // each line found, by the unit that found it, under its episode's top
    // node (EPISODE messages), so the levels of one episode meet
    const tops = new Map<number, Array<{ unit: number; first: number; n: number }>>();
    used.forEach(({ at }, unit) => {
      for (const { first, n } of at) {
        if (n > EPISODE || left(first, n)) {
          continue;
        }
        const top  = Math.floor(first / EPISODE) * EPISODE;
        const hits = tops.get(top);
        if (hits === undefined) {
          tops.set(top, [{ unit, first, n }]);
        } else {
          hits.push({ unit, first, n });
        }
      }
    });
    const worth = (hits: Array<{ unit: number }>) => [...new Set(hits.map((h) => h.unit))].reduce((s, k) => s + used[k].u.w * used[k].idf, 0);
    const looked = [...tops].map(([top, hits]) => ({ top, hits, worth: worth(hits) })).sort((a, b) => b.worth - a.worth || b.top - a.top).slice(0, LOOKED);
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
    looked.forEach(({ top, hits }) => widen(top, EPISODE, hits));
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
  // (one opened or pinned this turn never: touched): the weakest, once
  // faded under FLOOR, else, from a full list, for the best new one if
  // that is FAR stronger; new ones join at the foot while there is room.
  // Never two lines over the same messages
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

  // the lines shown, or found, those over messages now left out gone (the
  // view holds them at message detail, or the user dismissed them)
  export function prune<T extends { first: number; n: number }>(lines: T[], end: number, out: Array<[number, number]>): T[] {
    return lines.filter((s) => s.first + s.n <= end && !out.some(([a, b]) => s.first < b && s.first + s.n > a));
  }

  // what a view leaves out, from its parts ([id, n]) and its turn (the
  // first message shown whole; Infinity: none yet): each message at
  // message detail (n 1; `fine`, each part of that many messages or
  // fewer: recall's, Recall.ask) or from the turn on, and the spans
  // dismissed, as the first message left out with all after it (end: the
  // count, if none) and the rest, [a, b) each
  export function left(parts: Array<[number, number]>, turn: number, gone: Array<[number, number]>, fine = 1): { end: number; out: Array<[number, number]> } {
    const count  = parts.reduce((m, [id, n]) => Math.max(m, id + n), 0);
    const ranges = [...parts.filter(([id, n]) => n <= fine || id >= turn).map(([id, n]): [number, number] => [id, id + n]), ...(turn < count ? [[turn, count] as [number, number]] : []), ...gone].sort((a, b) => a[0] - b[0]);
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


  // Recall
  // ------

  // a recall, run where the index is read (the search thread): of the
  // lines the caller's run and its call find (Radar.seek, as the side's
  // search, the call the newest of the run), the best strong one
  // (Radar.strong) that nothing the caller holds whole names yet
  // (Radar.named: a pin, a recall before, a zoom); null: none. As the file
  // was when it began (one read transaction)
  export function recall(file: File, ask: Recall): Found | null {
    const store = { ...file, chat: ask.chat };
    return store.db.transaction(() => {
      const { user, run } = Radar.ran(store, ask.log);
      const units  = Radar.units(user, [...run, { kind: "tool", text: ask.call }]);
      const strong = units.length === 0 ? [] : Radar.seek(store, { chat: ask.chat, units, end: ask.end, out: ask.out }).filter((f) => Radar.strong(f, ask.bar));
      const named  = strong.length === 0 ? [] : Radar.named(ask.log === null ? Store.naming(store, ask.from) : Store.work_naming(store, ask.log));
      return strong.find((f) => !named.some(([a, b]) => f.first < b && a < f.first + f.n)) ?? null;
    })();
  }

  // a run as the query reads it, from the file: its user message (null:
  // none), then its latest LATEST messages of the kinds read, oldest
  // first; the chat's agent's from the chat, a subagent's from its log
  // (log: its task, or the latest message it was told, as its user's)
  export function ran(store: File, log: string | null): { user: string | null; run: Said[] } {
    const kinds = Object.keys(SOURCE);
    if (log === null) {
      const at = Store.last(store, "user", Store.count(store));
      return { user: at < 0 ? null : Store.msg(store, at)?.text ?? null, run: Store.latest(store, at, kinds, LATEST) };
    }
    const at = Store.work_last(store, log, "user");
    return { user: at < 0 ? null : Store.work_text(store, log, at), run: Store.work_latest(store, log, at, kinds, LATEST) };
  }

  // the spans of the chat the texts name, [a, b) each (NAMED: #a+n, #a,
  // a+n|; a+0|, one message)
  export function named(texts: string[]): Array<[number, number]> {
    return texts.flatMap((text) => [...text.matchAll(NAMED)].map((m): [number, number] => {
      const a = Number(m[1] ?? m[3]);
      return [a, a + Math.max(1, Number(m[2] ?? m[4] ?? 1))];
    }));
  }

  // whether a line is strong enough to give the model: anchored (a path or
  // an error's name among its units), two units at least, its score the
  // bar's at least (STRONG, or where the user's choices put it: Radar.bar)
  export function strong(f: Found, bar: number): boolean {
    return f.anchored && f.units >= 2 && f.score >= bar;
  }

  // the bar a strong line reaches, from the counts kept of the side's
  // lines (related.json, as Related.ts keeps it; anything else: none):
  // STRONG while fewer than ENOUGH lines matching a path or an error's
  // name were opened or pinned; then where their lower QUARTILE starts,
  // LOWEST at least
  export function bar(counts: unknown): number {
    const of    = (e: string): Array<[string, unknown]> => Object.entries((counts as any)?.[e]?.anchored ?? {});
    const peaks = [...of("opened"), ...of("pinned")].flatMap(([at, n]): Array<[number, number]> => (Number.isFinite(Number(at)) && Number.isInteger(n) && (n as number) > 0 ? [[Number(at), n as number]] : [])).sort((a, b) => a[0] - b[0]);
    const all   = peaks.reduce((sum, [, n]) => sum + n, 0);
    let seen    = 0;
    const at    = all < ENOUGH ? undefined : peaks.find(([, n]) => (seen += n) >= all * QUARTILE)?.[0];
    return at === undefined ? STRONG : Math.max(LOWEST, at);
  }

  // Lines
  // -----

  // a line's summary on one line, as the side and recall show it: its
  // control characters out (a tab two spaces, a newline one), its spaces
  // folded, its first item's kind ("user: ") left out
  export function text(line: string): string {
    const flat = line.replace(/\t/g, "  ").replace(/\n/g, " ").replace(/[\x00-\x1f\x7f-\x9f]/g, "").replace(/\s+/g, " ").trim();
    return flat.replace(/^(user|illi|tool|echo|mind|note|work|recap): /, "").trim();
  }

  // how long ago a line's episode ended, by its last message's date, in
  // its largest unit (as the side says a duration: Side.ts term_age):
  // <1m, 12m, 3h, 2d; "": not known
  export function age(date: string, now = Date.now()): string {
    const at = Date.parse(date);
    const m  = Math.floor((now - at) / 60000);
    return Number.isNaN(at) ? "" : m < 1 ? "<1m" : m < 60 ? m + "m" : m < 1440 ? Math.floor(m / 60) + "h" : Math.floor(m / 1440) + "d";
  }

}
