// Seeker
// ======
// The searches of the summary lines in a thread of its own, so however
// long one takes, the screen goes on: the model's (Projects.search) and
// the radar's (Radar.search). Each runs on connections of its own to the
// projects' files (WAL: it reads beside the writes), each closed after it
// (Store.close: its statements finalized, so it closes at once). Asked
// { id, file, $: "search", words, scope } or { id, file, $: "radar", ask },
// file the asking chat's; answers { id, out } (the search's text, the
// radar's lines), or { id, error }.

import { Projects } from "./Projects.ts";
import { Radar, type Ask } from "./Radar.ts";
import { Store, type Store as File } from "./Store.ts";

declare const self: Worker;

self.onmessage = (e: MessageEvent<{ id: number; file: string } & ({ $: "search"; words: string; scope: string } | { $: "radar"; ask: Ask })>) => {
  const msg = e.data;
  let store: File | null = null;
  try {
    store = Store.peek(msg.file);
    self.postMessage({ id: msg.id, out: msg.$ === "radar" ? Radar.search(store, msg.ask) : Projects.search(store, msg.words, msg.scope) });
  } catch (err: any) {
    self.postMessage({ id: msg.id, error: String(err?.message ?? err) });
  } finally {
    if (store !== null) {
      Store.close(store);
    }
  }
};
