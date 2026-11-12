// Seeker
// ======
// The searches of the chats' indexes in a thread of their own, so however
// long one takes, the screen goes on: the model's (Projects.search) in
// one, the radar's (Radar.search) in another of this module, recall's
// (Radar.recall) in a third, so none waits on another (Projects.thread);
// and in a fourth, the messages put in their chat's index of words and
// the summary lines given their vectors, a slice at a time (Projects.fill:
// Projects.index), and the searches by meaning (Projects.near), where the
// model is read, once (Projects.model). Each runs on
// connections of its own to the projects' files (WAL: it reads beside the
// writes), each closed after it (Store.close: its statements finalized,
// so it closes at once). Asked
// { id, file, $: "search", words, scope, span }, { id, file, $: "radar", ask },
// { id, file, $: "recall", ask }, { id, file, $: "index", most, model } or
// { id, file, $: "near", words, scope, span, model }, file the asking
// chat's (an index's: the file indexed), span a search's time
// (When.Span; null: any), model the model's folder (null: none);
// answers { id, out } (the search's places: Projects.look, the radar's
// lines, recall's line or null, the slice's left: Projects.fill, the
// lines near in meaning), or { id, error }.

import { Projects } from "./Projects.ts";
import { Radar, type Ask, type Recall } from "./Radar.ts";
import { Store, type Store as File } from "./Store.ts";
import type { Span } from "./When.ts";

declare const self: Worker;

type Asked = { id: number; file: string } & ({ $: "search"; words: string; scope: string; span?: Span | null } | { $: "radar"; ask: Ask } | { $: "recall"; ask: Recall } | { $: "index"; most: number; model: string | null } | { $: "near"; words: string; scope: string; span: Span | null; model: string });

self.onmessage = (e: MessageEvent<Asked>) => {
  const msg = e.data;
  let store: File | null = null;
  try {
    store = Store.peek(msg.file);
    const out = msg.$ === "radar" ? Radar.search(store, msg.ask) : msg.$ === "recall" ? Radar.recall(store, msg.ask) : msg.$ === "index" ? Projects.fill(store, msg.most, msg.model) : msg.$ === "near" ? Projects.near(store, msg.words, msg.scope, msg.span, msg.model) : Projects.look(store, msg.words, msg.scope, msg.span ?? null);
    self.postMessage({ id: msg.id, out });
  } catch (err: any) {
    self.postMessage({ id: msg.id, error: String(err?.message ?? err) });
  } finally {
    if (store !== null) {
      Store.close(store);
    }
  }
};
