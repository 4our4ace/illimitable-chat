// Seeker
// ======
// The search of the summary lines (Projects.search) in a thread of its
// own, so however long one takes, the screen goes on. Each runs on a
// connection of its own to the file, read-only (WAL: it reads beside the
// writes), closed after it (Store.close: its statements finalized, so it
// closes at once). Asked { id, file, project, words, scope };
// answers { id, text }, or { id, error }.

import { Database } from "bun:sqlite";
import { Projects } from "./Projects.ts";
import { Store, WAIT } from "./Store.ts";

declare const self: Worker;

self.onmessage = (e: MessageEvent<{ id: number; file: string; project: number; words: string; scope: string }>) => {
  const { id, file, project, words, scope } = e.data;
  let db: Database | null = null;
  try {
    db = new Database(file, { readonly: true });
    db.run("pragma busy_timeout = " + WAIT);
    self.postMessage({ id, text: Projects.search({ file, db, project, chat: 0 }, words, scope) });
  } catch (err: any) {
    self.postMessage({ id, error: String(err?.message ?? err) });
  } finally {
    if (db !== null) {
      Store.close({ file, db, project, chat: 0 });
    }
  }
};
