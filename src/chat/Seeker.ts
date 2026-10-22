// Seeker
// ======
// The search of the summary lines (Projects.search) in a thread of its
// own, so however long one takes, the screen goes on. Each runs on
// connections of its own to the projects' files (WAL: it reads beside the
// writes), each closed after it (Store.close: its statements finalized,
// so it closes at once). Asked { id, file, words, scope }, file the
// asking chat's; answers { id, text }, or { id, error }.

import { Projects } from "./Projects.ts";
import { Store, type Store as File } from "./Store.ts";

declare const self: Worker;

self.onmessage = (e: MessageEvent<{ id: number; file: string; words: string; scope: string }>) => {
  const { id, file, words, scope } = e.data;
  let store: File | null = null;
  try {
    store = Store.peek(file);
    self.postMessage({ id, text: Projects.search(store, words, scope) });
  } catch (err: any) {
    self.postMessage({ id, error: String(err?.message ?? err) });
  } finally {
    if (store !== null) {
      Store.close(store);
    }
  }
};
