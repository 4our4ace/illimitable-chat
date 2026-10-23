// Wire test
// =========
// `bun test Wire.test.ts`. A frame is ASCII and round-trips any text; cut
// out of a stream, it is found once wherever the stream's chunks split
// it, the bytes around it kept in order; one of another nonce, or with no
// end past CAP, passes as bytes; ILLI_WINDOW reads back as written.

import { expect, test } from "bun:test";
import { CAP, wire_cut, wire_env, wire_env_parse, wire_frame, wire_nonce, wire_take, type Up } from "./Wire.ts";

const NONCE = wire_nonce();

// a stream's chunks cut: its bytes joined, its messages
const cut = (chunks: string[], nonce = NONCE) => {
  let carry = "";
  const bytes: string[] = [];
  const msgs: object[] = [];
  for (const chunk of chunks) {
    const got = wire_cut(carry, chunk, nonce);
    carry = got.carry;
    for (const part of got.parts) {
      if (typeof part === "string") {
        bytes.push(part);
      } else {
        msgs.push(part);
      }
    }
  }
  return { bytes: bytes.join(""), msgs, carry };
};

test("a frame is ASCII and round-trips text with control characters and unicode", () => {
  const msg: Up = { $: "say", text: "illi: crashed: ∞ “quoted” \x1b[31m\n\t😀" };
  const frame = wire_frame(msg, NONCE);
  expect(/^[\x1b\x20-\x7e]*$/.test(frame)).toBe(true);
  expect(frame.startsWith("\x1b_illi:" + NONCE + ":") && frame.endsWith("\x1b\\")).toBe(true);
  expect(cut(["before" + frame + "after"])).toEqual({ bytes: "beforeafter", msgs: [msg], carry: "" });
  expect(Buffer.from(Buffer.from(frame, "latin1").toString("utf8"), "utf8").toString("latin1")).toBe(frame);
});

test("a frame split at every offset across two chunks is found once, the bytes around it in order", () => {
  const stream = "\x1b[1;1Hpaint\x1b[?2026l" + wire_frame({ $: "hide", to: "work" }, NONCE) + "\x1b[2J" + wire_frame({ $: "up" }, NONCE);
  for (let k = 0; k <= stream.length; k++) {
    const got = cut([stream.slice(0, k), stream.slice(k)]);
    expect(got).toEqual({ bytes: "\x1b[1;1Hpaint\x1b[?2026l\x1b[2J", msgs: [{ $: "hide", to: "work" }, { $: "up" }], carry: "" });
  }
});

test("a frame of another nonce passes as bytes; so does one with no end past CAP; an unreadable one is dropped", () => {
  const other = wire_frame({ $: "quit" }, wire_nonce());
  expect(cut(["a" + other + "b"])).toEqual({ bytes: "a" + other + "b", msgs: [], carry: "" });
  const open = "\x1b_illi:" + NONCE + ":{\"$\":\"say\",\"text\":\"" + "x".repeat(CAP);
  expect(cut([open, "more"])).toEqual({ bytes: open + "more", msgs: [], carry: "" });
  expect(cut(["\x1b_illi:" + NONCE + ":{nope\x1b\\after"])).toEqual({ bytes: "after", msgs: [], carry: "" });
  expect(cut(["\x1b_other\x1b\\"]).bytes).toBe("\x1b_other\x1b\\");
});

test("a frame's start at a chunk's end waits for the rest; a lone ESC too, which then passes on", () => {
  expect(cut(["text\x1b"])).toEqual({ bytes: "text", msgs: [], carry: "\x1b" });
  expect(cut(["text\x1b", "[0m"])).toEqual({ bytes: "text\x1b[0m", msgs: [], carry: "" });
  expect(cut(["\x1b_ill"]).carry).toBe("\x1b_ill");
  expect(wire_take("\x1b_illi:" + NONCE.slice(0, 5), NONCE)).toBe(0);
  expect(wire_take("\x1b_illi:" + NONCE + ":{}", NONCE)).toBe(0);
  expect(wire_take("\x1b_x", NONCE)).toBeNull();
  expect(wire_take(wire_frame({ $: "up" }, NONCE) + "rest", NONCE)).toEqual({ msg: { $: "up" }, n: wire_frame({ $: "up" }, NONCE).length });
});

test("ILLI_WINDOW reads back as written; another shape is none", () => {
  expect(wire_env_parse(wire_env(NONCE, "switch"))).toEqual({ v: 1, nonce: NONCE, how: "switch" });
  expect(wire_env_parse("2:" + NONCE + ":hidden")).toEqual({ v: 2, nonce: NONCE, how: "hidden" });
  expect([wire_env_parse(undefined), wire_env_parse(""), wire_env_parse("1:abc:shown"), wire_env_parse("1:" + NONCE + ":other")]).toEqual([null, null, null, null]);
});
