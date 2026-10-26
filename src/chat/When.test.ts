// When test
// =========
// `bun test When.test.ts`. In one zone set for the test (New York, whose
// clocks go back an hour on 1 Nov 2026), whatever the machine's: a
// model's local date or date and time read as that zone's (a year, a
// month, today and yesterday too; an ISO time with its zone as it
// says), a day being its calendar day (25 hours as the clocks go back),
// a span to the end of what from names when to is left out (or sent as
// null or blank), through to's day (month, year) when it is a date, from
// the first message on when only to is given; what isn't a date
// refused, saying why. The
// time now in one short line (on claude-code without the date its prompt
// gives). A span's words: its head, the times its lines show (only what
// the head doesn't), the screen's short form.

import { afterAll, expect, test } from "bun:test";

const ZONE = process.env.TZ;
process.env.TZ = "America/New_York";
afterAll(() => {
  if (ZONE === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = ZONE;
  }
});

const { When } = await import("./When.ts");

// a local time in the test's zone
const at = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();

test("a local date or date and time, read in the zone illi runs in, a year or a month too; an ISO time with its zone, as it says; today, yesterday and now; what isn't one, refused", () => {
  const now = at(2026, 10, 21, 14, 5);
  expect(When.parse("2026-10-21")).toEqual({ at: Date.UTC(2026, 9, 21, 4), end: Date.UTC(2026, 9, 22, 4) });
  expect(When.parse("2026-10-21 14:05")).toEqual({ at: Date.UTC(2026, 9, 21, 18, 5), end: null });
  expect(When.parse("2026-10-21T14:05:30")).toEqual({ at: Date.UTC(2026, 9, 21, 18, 5, 30), end: null });
  expect(When.parse(" 2026-11-02 ")).toEqual({ at: Date.UTC(2026, 10, 2, 5), end: Date.UTC(2026, 10, 3, 5) });
  expect(When.parse("2026-10")).toEqual({ at: at(2026, 10, 1), end: at(2026, 11, 1) });
  expect(When.parse("2026")).toEqual({ at: at(2026, 1, 1), end: at(2027, 1, 1) });
  expect(When.parse("2026-10-21T14:05:00Z")).toEqual({ at: Date.UTC(2026, 9, 21, 14, 5), end: null });
  expect(When.parse("2026-10-21T14:05:00.250z")).toEqual({ at: Date.UTC(2026, 9, 21, 14, 5, 0, 250), end: null });
  expect(When.parse("2026-10-21 14:05+0200")).toEqual({ at: Date.UTC(2026, 9, 21, 12, 5), end: null });
  expect(When.parse("2026-10-21T14:05-04:00")).toEqual({ at: Date.UTC(2026, 9, 21, 18, 5), end: null });
  expect(When.parse("Today", now)).toEqual({ at: at(2026, 10, 21), end: at(2026, 10, 22) });
  expect(When.parse("yesterday", at(2026, 11, 2, 0, 30))).toEqual({ at: at(2026, 11, 1), end: at(2026, 11, 2) });
  expect(When.parse(" now ", now)).toEqual({ at: now, end: null });
  for (const bad of ["2026-02-30", "2026-13-01", "2026-13", "2026-10-21 24:00", "2026-10-21 14:60", "21 Oct", "2026-10-21Z", "2026-10-32T10:00Z", "", "last week", 20261021, null]) {
    expect(When.parse(bad)).toBeNull();
  }
});

test("a span: to left out, the rest of from's day (all of a month or a year); a date as to, through its day (a month, a year, through it); a time as to, the instant it stops before; to alone, from the first message on; one ending before it starts, refused", () => {
  expect(When.span("2026-10-21", undefined)).toEqual({ from: at(2026, 10, 21), to: at(2026, 10, 22) });
  expect(When.span("2026-10-21 14:00", "")).toEqual({ from: at(2026, 10, 21, 14), to: at(2026, 10, 22) });
  expect(When.span("2026-10-14", "2026-10-20")).toEqual({ from: at(2026, 10, 14), to: at(2026, 10, 21) });
  expect(When.span("2026-10-21 14:00", "2026-10-21 18:00")).toEqual({ from: at(2026, 10, 21, 14), to: at(2026, 10, 21, 18) });
  const form = "a local date or date and time, as 2026-10-21 or 2026-10-21 14:00 (or a month, 2026-10; a year, 2026; today, yesterday or now).";
  expect(When.span("last week", undefined)).toBe("from: " + form);
  expect(When.span("2026-10-21", "soon")).toBe("to: " + form);
  expect(When.span("2026-10", undefined)).toEqual({ from: at(2026, 10, 1), to: at(2026, 11, 1) });
  expect(When.span("2026-09-15", "2026-10")).toEqual({ from: at(2026, 9, 15), to: at(2026, 11, 1) });
  expect(When.span(undefined, "2026-10-20")).toEqual({ from: 0, to: at(2026, 10, 21) });
  expect(When.span(" ", "2026-10-20 12:00")).toEqual({ from: 0, to: at(2026, 10, 20, 12) });
  expect(When.span("yesterday", "now", at(2026, 10, 21, 14, 5))).toEqual({ from: at(2026, 10, 20), to: at(2026, 10, 21, 14, 5) });
  expect(When.span("2026-10", "2026-09")).toBe("to comes before from.");
  expect(When.span("2026-10-21", "2026-10-20 23:00")).toBe("to comes before from.");
  expect(When.span("2026-10-22", "2026-10-21")).toBe("to comes before from.");
  expect(When.span("2026-10-22 14:00", "2026-10-22")).toEqual({ from: at(2026, 10, 22, 14), to: at(2026, 10, 23) });
  expect(When.span("2026-10-21", null)).toEqual({ from: at(2026, 10, 21), to: at(2026, 10, 22) });
  expect([undefined, null, "", "  ", "2026-10-21", 0].map(When.given)).toEqual([false, false, false, false, true, true]);
});

test("a day is a calendar day: 25 hours as the clocks go back, 23 as they go on", () => {
  const back = When.span("2026-11-01", undefined) as { from: number; to: number };
  expect(back.to - back.from).toBe(25 * 3600e3);
  const on = When.span("2026-03-08", undefined) as { from: number; to: number };
  expect(on.to - on.from).toBe(23 * 3600e3);
  expect(When.next(at(2026, 11, 1, 23, 30))).toBe(at(2026, 11, 2));
  expect(When.start(at(2026, 11, 1, 23, 30))).toBe(at(2026, 11, 1));
});

test("the time now: weekday, date, time and the offset from UTC, in about ten tokens; on claude-code, its date left out", () => {
  expect(When.now(false, at(2026, 10, 25, 14, 5))).toBe("Sun 2026-10-25 14:05 UTC-4");
  expect(When.now(false, at(2026, 11, 2, 9, 0))).toBe("Mon 2026-11-02 09:00 UTC-5");
  expect(When.now(true, at(2026, 10, 25, 14, 5))).toBe("Sun 14:05 UTC-4");
  process.env.TZ = "Asia/Kolkata";
  try {
    expect(When.zone(Date.UTC(2026, 0, 1))).toBe("UTC+5:30");
    process.env.TZ = "UTC";
    expect(When.zone(Date.UTC(2026, 0, 1))).toBe("UTC");
  } finally {
    process.env.TZ = "America/New_York";
  }
});

test("a span's head says it whole; its lines' times only what the head doesn't; the screen's, short", () => {
  const day   = When.span("2026-10-21", undefined) as { from: number; to: number };
  const week  = When.span("2026-10-14", "2026-10-20") as { from: number; to: number };
  const over  = When.span("2026-09-29", "2026-10-05") as { from: number; to: number };
  const years = When.span("2025-12-29", "2026-01-04") as { from: number; to: number };
  const hours = When.span("2026-10-21 14:00", "2026-10-21 18:00") as { from: number; to: number };
  const night = When.span("2026-10-21 22:00", "2026-10-22 02:00") as { from: number; to: number };
  expect([day, week, over, years, hours, night].map(When.said)).toEqual([
    "Wed 21 Oct 2026", "Wed 14–Tue 20 Oct 2026", "Tue 29 Sep–Mon 5 Oct 2026", "Mon 29 Dec 2025–Sun 4 Jan 2026", "Wed 21 Oct 2026 14:00–18:00", "Wed 21 Oct 2026 22:00–Thu 22 Oct 02:00",
  ]);
  expect([When.on(day), When.on(week), When.on(hours)]).toEqual(["on Wed 21 Oct 2026", "within Wed 14–Tue 20 Oct 2026", "within Wed 21 Oct 2026 14:00–18:00"]);
  expect(When.range(at(2026, 10, 21, 14, 5), at(2026, 10, 21, 16, 40), day)).toBe("14:05–16:40");
  expect(When.range(at(2026, 10, 21, 14, 5), at(2026, 10, 21, 14, 5), day)).toBe("14:05");
  expect(When.range(at(2026, 10, 20, 23, 10), at(2026, 10, 21, 0, 40), day)).toBe("Tue 20 23:10–00:40");
  expect(When.range(at(2026, 10, 21, 23, 40), at(2026, 10, 22, 0, 15), day)).toBe("23:40–Thu 22 00:15");
  expect(When.range(at(2026, 10, 16, 9, 0), at(2026, 10, 16, 11, 0), week)).toBe("Fri 16 09:00–11:00");
  expect(When.range(at(2026, 9, 30, 9, 0), at(2026, 10, 1, 11, 0), over)).toBe("Wed 30 Sep 09:00–Thu 1 Oct 11:00");
  expect(When.at(at(2025, 12, 31, 9, 0), years)).toBe("Wed 31 Dec 09:00");
  expect(When.at(at(2026, 1, 2, 9, 0), years)).toBe("Fri 2 Jan 2026 09:00");
  expect(When.at(at(2026, 9, 30, 9, 0), day)).toBe("Wed 30 Sep 09:00");
  expect(When.moment(at(2026, 10, 21, 14, 5))).toBe("Wed 21 Oct 2026 14:05");
  expect(When.ymd(Date.UTC(2026, 9, 2, 2))).toBe("2026-10-01");
  const now = at(2026, 10, 25, 14, 5);
  expect([day, week, over, years, hours, night].map((s) => When.short(s, now))).toEqual([
    "Wed 21 Oct", "14–20 Oct", "29 Sep–5 Oct", "29 Dec 2025–4 Jan 2026", "Wed 21 Oct 14:00–18:00", "Wed 21 Oct 22:00–Thu 22 Oct 02:00",
  ]);
  expect(When.short(day, at(2027, 1, 2))).toBe("Wed 21 Oct 2026");
  expect(When.short(over, at(2027, 1, 2))).toBe("29 Sep–5 Oct 2026");
  expect(When.parse("2026-03-08 02:30")).toEqual({ at: at(2026, 3, 8, 3, 30), end: null });
});
