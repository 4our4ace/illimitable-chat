// When
// ====
// Times as people say them, in the zone illi runs in (the process's own,
// read at each use: TZ, else the system's), never UTC: the dates a model
// gives the date and search tools ("2026-10-21", "2026-10-21 14:00"), the
// time now that opens each call's message (Tools.here), and the times of
// a stretch of the chat as its lines, its head and the screen say them.
// Messages keep their dates as ISO instants (Store.ts, msg); only the
// words here are local. It imports nothing of illi's, so the search's
// thread (Seeker.ts) and the screen (Call.ts) use it as the tools do.
//
// A span is [from, to): a date alone as `from` is its day's start; as
// `to`, its day's end, so a span names its last day; a time as `to` is
// the instant the span stops before. A day is a calendar day, 23 or 25
// hours where the clocks change, never 24 hours added.

// Types
// =====

// a span of time, ms since the epoch: from on, to left out
export type Span = { from: number; to: number };

// Constants
// =========

const WEEK   = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// a local date, or a date and a time to the minute or the second, a
// space or a T between
const LOCAL = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/;

// what a model is told of a date it wrote that isn't one
const FORM = "a local date or date and time, as 2026-10-21 or 2026-10-21 14:00.";

// When
// ====

export namespace When {

  // a local date or date and time as a model writes it: its instant, and
  // whether it is a date alone; null: not one (no such day, hour or
  // minute). A time the clocks skip (spring's lost hour) moves on by the
  // hour skipped: 02:30 is 03:30
  export function parse(text: unknown): { at: number; day: boolean } | null {
    const m = typeof text === "string" ? LOCAL.exec(text.trim()) : null;
    if (m === null) {
      return null;
    }
    const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4] ?? "0", m[5] ?? "0", m[6] ?? "0"].map(Number);
    const day = new Date(y, mo - 1, d);
    if (day.getFullYear() !== y || day.getMonth() !== mo - 1 || day.getDate() !== d || h > 23 || mi > 59 || s > 59) {
      return null;
    }
    return { at: new Date(y, mo - 1, d, h, mi, s).getTime(), day: m[4] === undefined };
  }

  // the span a model asks: from `from` to `to` (left out: to the end of
  // from's day; a date alone: through its day); a string: why there is
  // none (not a date; `to` before `from`, or a day before from's)
  export function span(from: unknown, to: unknown): Span | string {
    const a = When.parse(from);
    const none = to === undefined || to === null || to === "";
    const b = none ? null : When.parse(to);
    if (a === null || (!none && b === null)) {
      return (a === null ? "from: " : "to: ") + FORM;
    }
    const end = b === null ? When.next(a.at) : b.day ? When.next(b.at) : b.at;
    const back = b !== null && (b.day ? b.at < When.start(a.at) : b.at < a.at);
    return back ? "to comes before from." : { from: a.at, to: end };
  }

  // the start of the day an instant is in
  export function start(ms: number): number {
    const at = new Date(ms);
    return new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime();
  }

  // the start of the day after the one an instant is in
  export function next(ms: number): number {
    const at = new Date(ms);
    return new Date(at.getFullYear(), at.getMonth(), at.getDate() + 1).getTime();
  }

  // Words
  // -----

  // a time of day: 14:05
  export function hm(ms: number): string {
    const at = new Date(ms);
    return String(at.getHours()).padStart(2, "0") + ":" + String(at.getMinutes()).padStart(2, "0");
  }

  // a day of the week: Wed
  export function week(ms: number): string {
    return WEEK[new Date(ms).getDay()];
  }

  // a day of a month: 21 Oct
  export function date(ms: number): string {
    const at = new Date(ms);
    return at.getDate() + " " + MONTHS[at.getMonth()];
  }

  // a day whole: Wed 21 Oct 2026
  export function day(ms: number): string {
    return When.week(ms) + " " + When.date(ms) + " " + new Date(ms).getFullYear();
  }

  // a day as a date: 2026-10-21
  export function ymd(ms: number): string {
    const at = new Date(ms);
    return at.getFullYear() + "-" + String(at.getMonth() + 1).padStart(2, "0") + "-" + String(at.getDate()).padStart(2, "0");
  }

  // a day and its time: Wed 21 Oct 2026 14:05
  export function moment(ms: number): string {
    return When.day(ms) + " " + When.hm(ms);
  }

  // the zone's offset from UTC at an instant: UTC-4, UTC+5:30, UTC
  export function zone(ms: number): string {
    const off = -new Date(ms).getTimezoneOffset();
    const abs = Math.abs(off);
    return off === 0 ? "UTC" : "UTC" + (off > 0 ? "+" : "-") + Math.floor(abs / 60) + (abs % 60 === 0 ? "" : ":" + String(abs % 60).padStart(2, "0"));
  }

  // the time now, as each call's message opens with it (Tools.here): Sun
  // 2026-10-25 14:05 UTC-4; short, its date left out (claude-code, whose
  // own prompt gives the day's date alone): Sun 14:05 UTC-4
  export function now(short = false, ms = Date.now()): string {
    return When.week(ms) + (short ? "" : " " + When.ymd(ms)) + " " + When.hm(ms) + " " + When.zone(ms);
  }

  // A span's words
  // --------------

  // whether a span is whole days: from and to each a day's start
  export function whole(span: Span): boolean {
    return span.to > span.from && When.start(span.from) === span.from && When.start(span.to) === span.to;
  }

  // the last instant a span holds (an empty one: its start)
  export function last(span: Span): number {
    return Math.max(span.from, span.to - 1);
  }

  // a span as a head says it, for a model, whole: whole days as days (Wed
  // 21 Oct 2026; Wed 14–Tue 20 Oct 2026; Tue 29 Sep–Mon 5 Oct 2026; Mon 29
  // Dec 2025–Sun 4 Jan 2026), else its two times, the end's day and year
  // only where they differ (Wed 21 Oct 2026 14:00–18:00; Wed 21 Oct 2026
  // 22:00–Thu 22 Oct 02:00)
  export function said(span: Span): string {
    const [a, z] = [new Date(span.from), new Date(When.last(span))];
    if (When.whole(span)) {
      const head = When.week(span.from) + " " + (a.getMonth() === z.getMonth() && a.getFullYear() === z.getFullYear() ? String(a.getDate()) : When.date(span.from));
      return When.start(span.from) === When.start(When.last(span)) ? When.day(span.from) : (a.getFullYear() === z.getFullYear() ? head : head + " " + a.getFullYear()) + "–" + When.day(When.last(span));
    }
    const end = When.start(span.from) === When.start(span.to) ? When.hm(span.to) : When.week(span.to) + " " + When.date(span.to) + (new Date(span.to).getFullYear() === a.getFullYear() ? "" : " " + new Date(span.to).getFullYear()) + " " + When.hm(span.to);
    return When.day(span.from) + " " + When.hm(span.from) + "–" + end;
  }

  // whether a span is one whole day
  export function one(span: Span): boolean {
    return When.whole(span) && When.start(span.from) === When.start(When.last(span));
  }

  // a span with the word before it: on one whole day (on Wed 21 Oct
  // 2026), within any other (within Wed 14–Tue 20 Oct 2026)
  export function on(span: Span): string {
    return (When.one(span) ? "on " : "within ") + When.said(span);
  }

  // a time in a span's lines, with only what its head doesn't say: 14:05
  // on the span's one day; its weekday and day too off it, or in a span
  // of days (Wed 21 14:05); its month too off the span's one month, or in
  // a span of months (Wed 21 Oct 14:05); its year too off the span's
  // first's (Fri 2 Jan 2026 14:05 in a span from 2025)
  export function at(ms: number, span: Span): string {
    const [t, a, z] = [new Date(ms), new Date(span.from), new Date(When.last(span))];
    const month = (x: Date, y: Date) => x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth();
    const days  = !(When.start(span.from) === When.start(When.last(span)) && When.start(ms) === When.start(span.from));
    const months = days && !(month(a, z) && month(t, a));
    const years = months && t.getFullYear() !== a.getFullYear();
    return (days ? When.week(ms) + " " + (months ? When.date(ms) + (years ? " " + t.getFullYear() : "") : String(t.getDate())) + " " : "") + When.hm(ms);
  }

  // the times of a stretch, first to last, in a span's lines (When.at):
  // one if both fall in one minute; the last's day left out if the first's
  // (14:05–16:40, Tue 20 23:10–00:40 in a span of the 21st)
  export function range(first: number, last: number, span: Span): string {
    if (Math.floor(first / 60000) === Math.floor(last / 60000)) {
      return When.at(first, span);
    }
    return When.at(first, span) + "–" + (When.start(first) === When.start(last) ? When.hm(last) : When.at(last, span));
  }

  // a span as the screen says it, for a person, short: its days (Wed 21
  // Oct; 14–20 Oct; 29 Sep–5 Oct), else its times (Wed 21 Oct
  // 14:00–18:00; Wed 21 Oct 22:00–Thu 22 Oct 02:00); a year only off this
  // one (Wed 21 Oct 2026 in 2027; 29 Sep–5 Oct 2025; 29 Dec 2025–4 Jan
  // 2026), never on a time's end
  export function short(span: Span, now = Date.now()): string {
    const [a, z] = [new Date(span.from), new Date(When.last(span))];
    const year = new Date(now).getFullYear();
    const yr = (d: Date) => (a.getFullYear() === year && z.getFullYear() === year ? "" : " " + d.getFullYear());
    if (When.whole(span)) {
      if (When.start(span.from) === When.start(When.last(span))) {
        return When.week(span.from) + " " + When.date(span.from) + yr(a);
      }
      const head = a.getMonth() === z.getMonth() && a.getFullYear() === z.getFullYear() ? String(a.getDate()) : When.date(span.from) + (a.getFullYear() === z.getFullYear() ? "" : yr(a));
      return head + "–" + When.date(When.last(span)) + yr(z);
    }
    const end = When.start(span.from) === When.start(span.to) ? When.hm(span.to) : When.week(span.to) + " " + When.date(span.to) + " " + When.hm(span.to);
    return When.week(span.from) + " " + When.date(span.from) + yr(a) + " " + When.hm(span.from) + "–" + end;
  }

}
