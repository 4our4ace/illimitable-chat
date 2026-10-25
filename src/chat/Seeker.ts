// Seeker
// ======
// The searches of the summary lines in a thread of their own, so however
// long one takes, the screen goes on: the model's (Projects.search) in
// one, the radar's (Radar.search) in another of this module, recall's
// (Radar.recall) in a third, so none waits on another (Projects.thread).
// Each runs on connections of its own to the projects' files (WAL: it
// reads beside the writes), each closed after it (Store.close: its
// statements finalized, so it closes at once). Asked
// { id, file, $: "search", words, scope }, { id, file, $: "radar", ask }
// or { id, file, $: "recall", ask }, file the asking chat's; answers
// { id, out } (the search's text, the radar's lines, recall's line or
// null), or { id, error }.

import { Projects } from "./Projects.ts";
import { Radar, type Ask, type Recall } from "./Radar.ts";
import { Store, type Store as File } from "./Store.ts";

declare const self: Worker;

self.onmessage = (e: MessageEvent<{ id: number; file: string } & ({ $: "search"; words: string; scope: string } | { $: "radar"; ask: Ask } | { $: "recall"; ask: Recall })>) => {
  const msg = e.data;
  let store: File | null = null;
  try {
    store = Store.peek(msg.file);
    self.postMessage({ id: msg.id, out: msg.$ === "radar" ? Radar.search(store, msg.ask) : msg.$ === "recall" ? Radar.recall(store, msg.ask) : Projects.search(store, msg.words, msg.scope) });
  } catch (err: any) {
    self.postMessage({ id: msg.id, error: String(err?.message ?? err) });
  } finally {
    if (store !== null) {
      Store.close(store);
    }
  }
};
