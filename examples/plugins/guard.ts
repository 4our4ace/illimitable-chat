// guard: a sample plugin. Copy it, with illi.d.ts, into ~/.illi/plugins/
// and start illi again.
//
// It refuses `rm -rf` in a shell command (the model reads why), counts
// the turns at the side, says how long each took, and adds /turns.

import type { Illi } from "./illi.d.ts";

export default function (illi: Illi): void {
  let turns = 0;
  let since = 0;

  illi.on("tool.before", (call) => {
    if (call.tool === "shell" && /\brm\s+-rf\b/.test(String(call.input?.command ?? ""))) {
      return { block: "rm -rf is refused here: move what should go to a trash folder instead." };
    }
  });

  illi.on("turn.start", () => {
    since = Date.now();
  });

  illi.on("turn.end", ({ stopped }) => {
    turns += 1;
    illi.note((stopped === null ? "Turn done" : "Turn stopped") + " in " + Math.round((Date.now() - since) / 1000) + " s.");
    illi.redraw();
  });

  illi.side(() => [[{ text: "Guard", bold: true }], [{ text: "on", tone: "success" }, { text: " · " + turns + " turns", dim: true }]]);

  illi.command("turns", "how many turns this run", () => turns + " turns since illi started.");
}
