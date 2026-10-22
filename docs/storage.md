The chat files
==============

Everything illi remembers lives in SQLite files, one per project. This
page covers exactly how a file is laid out, who opens it, how a write
reaches the disk, how version upgrades work, how the chats of an older
illi's single file are moved out, how search and forgetting work, and
what each costs. Each part names the function that does the work. If
this page and the code disagree, the code is right and this page needs
fixing.

- [Where they are](#where-they-are)
- [What is in a file](#what-is-in-a-file)
- [A file's settings](#a-files-settings)
- [Who opens them](#who-opens-them)
- [Opening, step by step](#opening-step-by-step)
- [Versions and upgrades](#versions-and-upgrades)
- [Moving from the one file](#moving-from-the-one-file)
- [Writing and durability](#writing-and-durability)
- [Project locks](#project-locks)
- [The projects table](#the-projects-table)
- [Search](#search)
- [Forgetting a project](#forgetting-a-project)
- [Usage counts](#usage-counts)
- [Known limits](#known-limits)

Where they are
--------------

| Profile         | Folder                                         |
| --------------- | ---------------------------------------------- |
| default         | `~/.illi/chat/projects/`                       |
| any other       | `~/.illi/profiles/<name>/chat/projects/`       |

`ILLI_DIR` moves `~/.illi`. The folder holds one file per project: one
for each git repo illi ran in, plus `home` for everywhere outside a repo
(`Projects.place`). A file is named after its project, such as
`app-k3f9x2.sqlite` (the repo folder's name plus a 6-character code from
its path) or `home.sqlite`.

While a file is open, SQLite keeps two more files beside it:
`app-k3f9x2.sqlite-wal` (new writes, see
[Writing](#writing-and-durability)) and `app-k3f9x2.sqlite-shm` (an index
into the WAL that the open connections share). When the last connection
closes cleanly, SQLite copies the WAL into the file and deletes both, so
only the `.sqlite` file is left. (A bun:sqlite connection only really
closes once every statement it prepared is finalized; `Store.close` sees
to that: [Close](#one-write).)

`~/.illi/chat/memory.sqlite`, if there, is an older illi's single file,
left as a small stub once its chats are moved out ([Moving from the one
file](#moving-from-the-one-file)). A profile made by this illi never has
one.

What is in a file
-----------------

### Tables

Every project file has the same schema, created by `STEPS` in
`src/chat/Store.ts`.

| Table      | One row is                                      | Key                     | Written                        |
| ---------- | ----------------------------------------------- | ----------------------- | ------------------------------ |
| `meta`     | a fact about the file (today only `compat`)     | `key`                   | by upgrades                    |
| `project`  | the place illi ran in (one row per file)        | `id`                    | once, at the first run there   |
| `chat`     | the project's chat (one today, room for more)   | `id`                    | once, with its project         |
| `msg`      | a message, or one page of a long message        | `(chat, i)`             | once; never changed            |
| `node`     | a summary line over a run of messages           | `(chat, first, n)`      | once; never changed            |
| `state`    | a chat's saved view, pick, goal, cut…           | `chat`                  | written over                   |
| `log`      | an agent's log (a subagent's name and tag)      | `id`, unique `(chat, log)` | once                        |
| `work`     | one entry of an agent's log                     | `(log, i)`              | once; never changed            |
| `image`    | an image a message names (its bytes, its smaller copy for models) | `id`, unique `(chat, name)` | once (the name is its hash) |
| `todo`     | a chat's to-do list, whole                      | `chat`                  | written over                   |
| `find_<chat>` | one chat's search index (FTS5)               | `rowid`                 | one row with each new `node`   |

The columns, by table:

- **project**: `id` (1 in a new file; a project moved from the one file
  keeps its old number), `uid` (a random UUID), `key` (`git:<repo's top
  folder>` or `home`), `name` (the file's name without `.sqlite`),
  `path` (`""` for home), `made` (ISO date), `extra` (a JSON object, `{}`,
  for later use).
- **chat**: `id`, `uid`, `project` (references `project`), `made`,
  `extra`.
- **msg**: `chat`, `i` (its index in the chat: 0, 1, 2…), `kind` (`user`,
  `illi`, `tool`…), `text`, `date`, `size` (bytes as models read it),
  `images` (a JSON list of image names, or null), `line` (its summary line
  if it was written with one), `more` (1 if the next row is the same
  message continued), `cwd` (the folder illi ran in). A message longer
  than 30,000 characters (`Clip.ts CAP`), or with more than 20 images
  (`Memory.ts PICS`), is stored as several rows, its pages. Only the last
  page has `more` null. A partial index `msg_page` on `(chat) where more
  is not null` lists the continued pages, so a chat's count of whole
  messages costs nothing.
- **node**: `chat`, `first`, `n`, `text`. A line covers messages
  `first … first + n - 1`. The memory tree (`Memory.ts`) is binary: node
  (level `l`, index `i`) has `first = i · 2^l` and `n = 2^l`. The table
  doesn't depend on that shape: any `(first, n)` fits. A line built twice
  keeps the first one (`on conflict do nothing`), because a view may
  already show it. The index `node_end` on `(chat, first + n)` finds a
  chat's latest line at once.
- **state**: `chat`, `saved` (JSON: the chat's view, `seen` (the
  compactions' view), the pick, the goal, the suggested reply (so it
  shows again after a restart), the main agent, what ran, the
  cut, `show` and `top`). It is never rebuilt from the facts,
  because the model's prompt cache depends on the saved view.
- **log**: `id`, `chat`, `log`, `name`. **work**: `log` (references
  `log`), `i`, `kind`, `text`, `date`.
- **image**: `id`, `chat`, `name` (its hash, so an image pasted twice is
  kept once), `data` (bytes), `fit` (a smaller copy for models, or null).
- **todo**: `chat`, `list` (JSON).
- **find_\<chat\>**: an FTS5 table with `text` (the line), `first` and `n`
  (stored but not indexed). Its tokenizer is `unicode61 remove_diacritics
  2`; see [Search](#search). FTS5 keeps each index in five more real
  tables, `find_<chat>_data`, `_idx`, `_content`, `_docsize` and
  `_config`.

```mermaid
erDiagram
  project ||--o{ chat : ""
  chat ||--o{ msg : ""
  chat ||--o{ node : ""
  chat ||--o| state : ""
  chat ||--o{ log : ""
  log ||--o{ work : ""
  chat ||--o{ image : ""
  chat ||--o| todo : ""
  chat ||--|| find_chat : "made with it"
```

### The rules the tables follow

1. **Facts are added, never changed.** `msg`, `node`, `work` and `image`
   rows are only inserted. Only `state` and `todo` are written over.
2. **Nothing deletes a row.** Forgetting a project deletes its whole
   file ([Forgetting](#forgetting-a-project)); no code deletes a message,
   a line or an image.
3. **A search index never loses a line.** So a chat's line count is its
   highest `rowid`, which [search](#search) relies on.
4. **A file holds one project.** `Store.place` adds a project row only to
   an empty file.

A file's settings
-----------------

| Setting (pragma)  | Value                     | Kept in             | Why |
| ----------------- | ------------------------- | ------------------- | --- |
| `application_id`  | `0x696c6c69` ("illi")     | the file            | marks the file as illi's |
| `user_version`    | `3`                       | the file            | the schema's version ([upgrades](#versions-and-upgrades)) |
| `journal_mode`    | `wal`                     | the file            | readers and the writer don't block each other |
| `synchronous`     | `normal`                  | each connection     | a commit doesn't wait for the disk; Disk.ts flushes |
| `foreign_keys`    | `on`                      | each connection     | a row can't name a chat or log that isn't there |
| `busy_timeout`    | `10000` ms                | each connection     | wait for another process's write instead of failing |

Defaults left as SQLite ships them: a page is 4,096 bytes, and
`wal_autocheckpoint` is 1,000 pages (about 4 MB). Nothing is ever deleted
inside a file, so it needs no `auto_vacuum` or `secure_delete`.

Who opens them
--------------

Several processes and threads can have a file open at once. SQLite
allows any number of readers and one writer at a time. A writer that
finds another writing waits up to `busy_timeout` (10 s) and then fails.
A write that fails so, or for a full disk, is told on the screen: a
command's (`/clear`, `/goal`...) as its answer; a save of the chat's
state as a turn starts or ends (what ran, the suggested reply) as a
note, illi going on.

| Who | Connection | When | Code |
| --- | --- | --- | --- |
| **The holder**: the illi that holds a project's lock and runs its chat | read-write to its project's file, kept open until illi quits | always, one per project being used | `Memory.load` → `Store.open(dir, place)` |
| **A view**: a second terminal in the same project | read-write to the same file | to read exports, the tree and the projects list; the chat itself comes from the holder over a socket | `Term.ts term_reader` |
| **A look at other projects**: the projects list, a zoom or date into another project, an export of one, the image count before a forget | read-write to that project's file, opened for the read and closed right after | each time | `Store.visit` → `Store.peek` |
| **The search thread** (`Seeker.ts`) | its own connections, to each file a search covers, each closed after | each `search` the model calls | `Projects.seek` |
| **A profile export** | read-write to each file, for a snapshot | `/profile` export | `Profiles.ts profile_snapshot` |

Other projects' files are opened read-write even just to read, because
SQLite only deletes a WAL and `-shm` that a read-write connection closes
last: a read-only open of a closed file would leave both behind.

Each write is small (0.16 ms measured on a 2-million-message chat), so
another process rarely waits long.

Opening, step by step
---------------------

`Store.open(dir, place)` does this, in order:

1. **`Store.move(dir)`:** if an older illi's `memory.sqlite` is there and
   not moved yet, moves its chats out first
   ([below](#moving-from-the-one-file)).
2. Creates the `projects` folder if needed.
3. Picks the file: `projects/<place's name>.sqlite`.
4. **`Store.connect(file)`** opens or creates it, then sets
   `busy_timeout = 10000`, `foreign_keys = on` and `synchronous =
   normal`; `Store.wal` sets `journal_mode = wal` before anything is
   written, so a new file is in WAL mode from its first page (switching
   ignores `busy_timeout`, so it is retried every 10 ms for up to 10 s
   while another illi opening the file at the same moment holds it);
   `Store.schema` brings the schema up to date
   ([below](#versions-and-upgrades)).
5. **`Store.place`**, in one write transaction: an empty file gets the
   project's row, named after the file. A file holding this place's key
   is the project's own. A file holding another place's key (two paths
   whose 6-character codes collide, a 1 in 2 billion chance) is someone
   else's: the file is closed and step 3 tries `<name>-2.sqlite`, then
   `-3`, and so on. Then it finds the project's first chat, or creates it
   with an empty `find_<chat>`.

A file that won't open (not an SQLite file, say) stops illi at start
with one line naming it: *illi: chat: app-k3f9x2.sqlite won't open: file
is not a database*. Every error a chat file raises reads *chat: …*, and
`main.ts` prints it so, never as a crash.

Opening an existing file costs about 0.6 ms; making a new one about
30–45 ms, nearly all of it the fsyncs of its first commits and close.

Another project's file is opened with `Store.peek(file)`: the same
`Store.connect`, but never creating the file (a file forgotten meanwhile
fails to open), and its project and first chat read instead of placed.
`Store.visit(store, file, read)` wraps that: it passes the store's own
connection when the file is its own, else peeks, reads and closes, even
when the read throws.

Versions and upgrades
---------------------

### What "the format" means

A file's format is its schema: which tables exist and what they hold.
`user_version` says how many of the `STEPS` in `Store.ts` the file has
been through. Every illi knows its own number (`STEPS.length`, now 3).

| Step | Brings the file to | What it does | Sets `compat` |
| ---- | ------------------ | ------------ | ------------- |
| 1    | version 1 | creates everything: `meta`, `project`, `chat`, `msg`, `node`, `state`, `log`, `work`, and one shared search index `find` for every chat | 1 |
| 2    | version 2 | adds `image` and `todo` (images and the to-do list used to be separate files) | 2 |
| 3    | version 3 | gives each chat its own search index `find_<chat>`, copies every line into it from `find` in its original order, then drops `find` | 3 |

A new project file runs all three at once. Steps 2 and 3 move real data
only in an older illi's single file, during [the move](#moving-from-the-one-file).

### When an upgrade runs

At every connect, `Store.schema` compares the file's `user_version` with
its own `STEPS.length`:

- **The file is older:** each missing step runs in its own write
  transaction (`begin immediate`), which also sets the new
  `user_version`. Inside the transaction it checks the version again,
  because another illi may have just run the same step. A crash
  mid-step rolls the step back whole, and it runs again at the next open.
- **The file is the same:** nothing happens.
- **The file is newer:** illi reads `meta.compat`. If compat is at most
  its own number, the newer illi only *added* things, and this illi
  opens the file as it is. If compat is higher, illi refuses it: at
  start it stops with *illi: chat: app-k3f9x2.sqlite is of a newer illi:
  update illi to open it.*; the projects list leaves that project out
  and logs why.

`compat` is the lowest version that can still use the file safely. A
step that only adds (a table, an index, a column with a default) leaves
it alone, so an older illi keeps working. A step that moves where facts
live raises it, because an older illi would look for them in the old
place.

### Step 3 in detail

1. It reads the ids of all chats.
2. It creates an empty `find_<chat>` for each (`Store.words`).
3. It reads every row of the old `find`, oldest first (rowid order), and
   inserts it into its chat's new table. Rows of a chat that no longer
   exists are skipped.
4. It drops `find` and sets `compat` to 3.

All of that is one transaction. It takes time linear in the number of
summary lines: about 13.6 s for 400,000 lines, and milliseconds for files
of a few MB.

### Rules for later steps

- A step only adds, or it raises `compat`.
- A table made for each chat (as `find_<chat>` is) has to be made by
  everything that makes a chat (`Store.place` calls `Store.words`). A
  step adding another such table must create it when a chat is first
  used, because an older illi may still be creating chats without it, or
  else raise `compat`.
- [The move](#moving-from-the-one-file) copies rows with `select *`
  between an older file and a new one at the same version, so a step
  must give both the same columns in the same order (any step does, as
  both run the same `STEPS`).

Moving from the one file
------------------------

An older illi kept every project in one file, `chat/memory.sqlite`. The
first start of this illi moves each project out to its own file
(`Store.move`), then leaves the old file as a stub. It prints one line
before the screen comes up, which stays in the terminal after illi quits:
*illi: moving the chats to a file per project (once)*.

```mermaid
flowchart TD
  A["Store.open"] --> B{"memory.sqlite there?"}
  B -- no --> Z["open the project's file"]
  B -- yes --> G["Store.gate: locks/move.lock, wait for another illi's move"]
  G --> M{"meta says moved?"}
  M -- yes --> Z
  M -- no --> L["Store.alone: out of WAL mode, locked"]
  L -- "another illi has it open" --> X["stop: quit it, then start illi again"]
  L --> S["Store.schema, Store.mark"]
  S --> P["Store.split, each project: projects/name.sqlite"]
  P --> F["fsync the folder"]
  F --> T["Store.stub: drop all but meta, mark moved, vacuum"]
  T --> Z
```

### Step by step

1. **`Store.gate`:** takes `move.lock` in the profile's `locks` folder
   (beside the project locks, [below](#project-locks)): `begin
   exclusive` on that empty file, which is never written, so it never
   has a journal. Two illis starting at once both get here. The first
   try waits 50 ms (`GLANCE`), as two trying at the same instant with no
   wait could both be turned away. If another illi still holds the gate,
   illi says *illi: another illi is moving the chats to a file per
   project: waiting for it* and waits up to 10 minutes (`MOVING`), then
   finds the move done. Past the 10 minutes it stops with *illi: chat:
   another illi is still moving the chats to a file per project: start
   illi again once it's done.* The OS releases the gate however the
   process ends. The lock file is kept, like the project locks: one
   deleted while another illi waits on it would leave that illi holding a
   file that won't read. Every start whose chat folder has
   `memory.sqlite` takes the gate (a fraction of a millisecond), because
   nothing else may open the old file while a move might be running: any
   other connection makes the move's step 3 refuse.
2. **`Store.moved`:** `meta` has a `moved` row once the move is done.
   Then the gate is let go and the project's file opened.
3. **`Store.alone`:** sets `locking_mode = exclusive` on the old file,
   then switches it out of WAL mode (`journal_mode = delete`). SQLite
   refuses that switch while any other connection has the file open, so
   an older illi still running makes illi stop with *illi: chat: the
   chats move to a file per project once, but another illi has them
   open: quit it, then start illi again.*, nothing done. Otherwise the
   switch takes an exclusive lock, which exclusive locking keeps till the
   connection closes (`begin exclusive`, `commit` takes it if the file
   was out of WAL mode already): no other process can read or write the
   old file during the move. Writes an older illi left in the WAL (it
   crashed, say) are copied into the file by the switch.
4. **`Store.schema`** brings the old file to version 3 if it isn't.
   **`Store.mark`** reads this move's mark from the old file's `meta`
   (`moving`), or writes a new random one at the move's first try. Every
   project file the move copies bears it (`moved_from` in its `meta`).
5. **`Store.split`, for each project** (oldest first):
   1. Picks the file: `projects/<name>.sqlite`. One there already that
      bears this move's mark is the move's own copy from before a crash:
      it is made again, because an older illi may have written to the old
      file since. Any other file there (a project file in use, after the
      old file was put back from a backup, say) is kept, and the copy goes
      to the next free number, `<name>-2.sqlite`, then `-3`, as
      `Store.open` numbers a file another place's. Nothing the old file
      holds is ever dropped without being copied.
   2. Deletes any `<file>-new` (with its `-wal` and `-shm`), the half of a
      crashed copy.
   3. Makes `<file>-new`: WAL mode first, `synchronous = off`, the
      schema (`STEPS`), an empty `find_<chat>` for each of the project's
      chats; closes it.
   4. Attaches it to the old file's connection as `p`, with
      `p.synchronous = off`, and copies in one transaction: the project's
      row (its `name` set to the file's), its chats, and their `msg`,
      `node`, `state`, `log`, `work`, `image` and `todo` rows (`COPY`, each
      `insert into p.<table> select * …`), the move's mark, then each
      chat's search index (`insert into p.find_<chat> (rowid, text, first,
      n) select …`, which keeps every line's rowid, so the line count stays
      right). Every number stays as it was.
   5. Detaches it. That closes its last connection, which checkpoints the
      WAL into the file and deletes it. If the WAL is still there, the
      move stops with an error rather than leave its writes behind.
   6. fsyncs the file, then renames it into place, over a crash's copy if
      there was one. Nothing was synced while it was made aside, so this
      one fsync is all it costs; the rename is atomic, so a project's file
      is either whole or not there.
6. **fsync the `projects` folder:** the renames are on disk before any
   old row goes.
7. **`Store.stub`:** in one transaction, drops every table but `meta`
   (the search indexes first, their own tables with them), sets `compat`
   and `user_version` to 4 (`MOVED`), drops the mark and adds `moved`
   (the date) to `meta`; then `vacuum`, which cuts the file to 8 KB.
8. Closes the old file, which leaves only `memory.sqlite`, then lets the
   gate go.

Any error on the way stops illi with one line naming the move: *illi:
chat: memory.sqlite couldn't move to a file per project: …* (a damaged
old file says *file is not a database*). Nothing is dropped before step
7, so starting again after fixing the cause goes on.

An older illi that opens the stub refuses it (its version and `compat`
are past any it knows) with its own message: *the chat (memory.sqlite)
is of a newer illi: update illi to open it*. So a downgrade can't write
to a file this illi no longer reads. This illi knows the stub by the
`moved` row, not by its version, so a later step needn't raise `MOVED`.
Keep the stub while an older illi might still run: without it, that
illi would make a fresh `memory.sqlite`, which this illi would move at
its next start, numbered beside the files already there (step 5.1).

### If it stops partway

| illi stops… | Result |
| ----------- | ------ |
| before the switch out of WAL mode | nothing changed; the next start moves |
| during a project's copy | its `-new` file is deleted and made again at the next start |
| between projects, or after the copies | the next start makes the move's copies again (they bear its mark) and copies the rest |
| during the stub | its transaction rolls back; the next start makes it |

### An old file put back

Put an older illi's `memory.sqlite` back after its move (from a backup,
or from another machine), and the next start moves it again, with a new
mark. Every project whose file is there already is copied beside it,
numbered (`app-k3f9x2-2.sqlite`), so both stay: the file in use and the
copy from the old file. `/projects` lists both; the place keeps opening
its own file (the first by number with its key), and the copy can be
searched, zoomed into or forgotten like any project.

### What it costs

Measured on WSL2, ext4:

| Old file | Move |
| -------- | ---- |
| 6 projects × 100,000 messages and 150,000 lines, 524 MB | 4.9 s |
| 100 projects × 200 messages, 38 MB | 2.4 s, about 24 ms a project, mostly making its file |

The project files take about the space the old file did; the old file
becomes 8 KB.

Writing and durability
----------------------

### One write

Every write is one SQLite transaction (`Store.push`, `Store.nodes`,
`Store.save`…): a message's pages together, a batch of summary lines
with their index entries together. A transaction is all or nothing.

```mermaid
sequenceDiagram
  participant M as main thread
  participant S as SQLite
  participant W as name.sqlite-wal
  participant D as Disk.ts
  participant F as name.sqlite
  M->>S: commit (one transaction)
  S->>W: append changed pages (OS cache)
  M->>D: Store.wrote: WAL is dirty
  D-->>W: fsync (a thread, never the screen)
  D-->>M: the person's act is answered
  Note over S,F: past 1,000 pages in the WAL, at a commit:
  S->>F: checkpoint: copy pages into the file (fsync)
```

1. **Commit.** SQLite appends every page the transaction changed to the
   WAL. In `synchronous = normal` the commit does not wait for the disk:
   the pages are in the OS's cache, and the screen goes on.
2. **Flush (Disk.ts).** `Store.wrote` marks the WAL dirty. One flush
   runs at a time: it fsyncs every file marked since the last flush
   began, off the main thread (`FileHandle.sync`). Writes that arrive
   during a flush wait for the next one, so a burst of writes costs one
   or two fsyncs (group commit). A file gone since (`ENOENT`) needs none.
3. **Answer.** An act of the person's (a message sent, a pick, a
   setting) is answered only once the flush covering it is done. Quitting
   waits for it too (`Disk.synced` in `term_leave`).
4. **Checkpoint.** When the WAL passes 1,000 pages, the commit that
   crosses that mark also copies the WAL's pages into the file. SQLite
   fsyncs the WAL before copying and the file after. The WAL is then
   reused from its start. A checkpoint can't copy pages that a reader's
   snapshot still needs, so a long search can delay it.
5. **Close.** `Store.close` finalizes every statement the connection
   prepared, then closes it; the last connection to close checkpoints
   everything and deletes the WAL. Store prepares its statements itself
   (one per SQL text, kept for the connection's life) instead of using
   bun:sqlite's `db.query`, whose cache keeps only 20: a statement past
   those is left to the garbage collector, and until it's collected
   `close()` leaves the connection open, so it never checkpoints and the
   WAL stays beside the file.

What this guarantees:

- **illi crashes, or is killed:** nothing is lost. The OS already holds
  every committed write.
- **The machine crashes, or loses power:** at most the writes since the
  last finished flush are lost, and an act that was answered is never
  lost. A file is never left half-written.
- **Disk wear:** each write is the few 4 KB pages it touches, written to
  the WAL and later once into the file.

Project locks
-------------

One process at a time holds a project's chat. The lock lives in
`~/.illi/locks/` (a folder only you can open, mode 0700):

| File | Is |
| ---- | -- |
| `<code>.lock` | the lock. `<code>` is a 12-character hash of the project's folder, or `home` (`Projects.lock`) |
| `<code>.sock` | the holder's socket (mode 0600), where a second terminal's view connects |
| `move.lock` | the gate of the move from an older illi's one file ([Moving](#moving-from-the-one-file), step 1), made only in a profile that had that file |

**Taking it** (`Chat.claim`, `Chat.grip`): illi opens the lock file as an
SQLite database, sets `busy_timeout = 50` ms (`GRIP`) and `journal_mode
= memory` (no journal file is left behind), and runs `begin exclusive`.
If that succeeds, the transaction stays open as long as the process
lives. The OS releases it however the process ends, so a crash never
leaves a stale lock.

**Why wait 50 ms:** without a wait, several illis starting at the same
moment each took a shared lock and then all failed to take it
exclusively, so nobody won. With a short wait, SQLite's deadlock
avoidance lets exactly one through. On a very busy machine the window
can be missed. Then every illi becomes a view, waits 15 s for a holder
that isn't there (`Remote.ts MUTE`), and runs again.

**If another illi holds it:** this one becomes a view of that chat
(`Remote.ts`), connected over the socket.

**Forgetting another project** takes that project's lock (without a
socket) while it deletes the file, so no illi starts that project
meanwhile. If an illi already has it open, illi refuses the forget.

The projects table
------------------

`Store.projects` builds what `/projects` shows and what the model's
`projects` tool returns: each project's name, folder, first and last
message dates, message count, and latest summary line, the one used last
first.

It lists the `.sqlite` files in the folder and reads each one
(`Store.visit`, so other projects' files are opened and closed again;
`Store.about`). A file that won't read is left out and logged (*illi:
the chat in … won't read: …*); one deleted meanwhile is left out
quietly.

For each chat it runs four small queries, all by index: the first
message, the last message, the count of continued pages (subtracted to
count whole messages), and the latest line. Two of them name their index
(`indexed by msg_page`, `indexed by node_end`). The files keep no table
statistics, and without them SQLite's planner picked a full scan of the
chat's rows: 161 ms for one query on a 2-million-line chat, against
0.0 ms by index.

With 100 projects, the list takes 39 ms.

Search
------

The model's `search` tool finds summary lines by their words, in this
project, in another one by name, or in `all`. Every line ever written can
be found, however old: nothing is capped by age.

```mermaid
flowchart TD
  T["model calls search(words, project)"] --> S["Projects.seek: post to the search thread"]
  S --> W["Seeker.ts: open this project's file"]
  W --> P["Projects.search: split words, pick the files"]
  P --> R["Store.search: each file in turn (Store.lines)"]
  R --> C["each chat of it, in one read transaction: Store.seek, best 20 by bm25"]
  C --> M["merge: each chat's best, then each one's second…; first 20"]
  M --> E{"nothing, and several words?"}
  E -- yes --> O["again with any word (OR)"]
  E -- no --> X["lines back to the model"]
  O --> X
  S -. "thread failed" .-> I["Projects.here: same search on the main thread"]
```

### The thread

`Projects.seek` sends each search to one worker thread
(`src/chat/Seeker.ts`), started at the first search and never keeping
illi from quitting (`ref: false`). For each search the worker:

1. opens this project's file (`Store.peek`);
2. runs `Projects.search`, the same code the main thread would run,
   which opens every other file the search covers and closes each after;
3. sends back the text, or the error;
4. closes its connection (`Store.close`, so it really closes at once).

The main thread never waits: during a 2.9 s search on a 2-million-line
chat it kept drawing the screen (its longest gap was 14 ms). If the
worker can't start, or a message can't be posted, the search runs on the
main thread instead (`Projects.here`). If the worker dies, every search
still waiting on it runs on the main thread, and the next search starts
a new worker. In the compiled binary, the worker's code is a second
entry of the build (`src/chat/Seeker.ts` in `package.json`'s `build`,
`install.sh` and the release workflow), found at `./chat/Seeker.ts`.

### Projects.search

1. Splits the words on whitespace.
2. Picks the files: `""` means this project's; a name means that
   project's (`Store.lookup`, which only matches a file in the folder, so
   a name can't point anywhere else; an unknown name answers *No project
   X: projects lists them.*); `all` means every project's.
3. Calls `Store.search`, then writes each line as `project first+n|text`,
   its newlines flattened to spaces. With nothing found it says so,
   naming the scope.
4. In `all`, if lines were left out (step 4 of `Store.search` keeps 20),
   it adds a last line naming the projects they're in, the most first,
   with how many: *More lines in: app-k3f9x2 (12+), site-7q2m0d (3);
   search with project to see them.* A `+` means a chat of that project
   gave its most (20), so it may hold more still. The model can then
   search that project alone.

### Store.search

1. **Words to terms.** It keeps only words with at least one letter,
   digit or private-use character (Unicode `\p{L}`, `\p{N}`, `\p{Co}`).
   These are the characters the tokenizer indexes; a word like `—` would
   match nothing. With no term left, it returns nothing.
2. **Each file** (`Store.lines`): its chats are read inside one read
   transaction, so the file is seen as it was when its first read began.
   Another project's file that won't open (forgotten meanwhile) gives no
   lines; an error in this project's own file is thrown.
3. **Each chat** gives up to 20 lines from its own index (`Store.seek`),
   ranked by bm25.
4. **Merge.** Sorted by rank within its chat first, then by score: every
   chat's best line, best first; then every chat's second; and so on.
   The first 20 are kept; the rest are counted by project (`cut`), for
   the *More lines in* line above. A chat's bm25 scores weigh each word
   by how rare it is *in that chat*, so scores from a big chat and a
   small one can't be compared. Sorted by raw score, one big chat's
   matches would fill all 20 places and hide every small project's. With
   many projects, though, each gets only a line or two: 20 projects with
   matches give one line each.
5. **AND, then OR.** First a line must hold *all* the terms. If nothing
   matches and there was more than one term, it searches again for
   lines holding *any* of them.

### Store.seek: one chat

1. **Quoting.** Each term goes in double quotes (a `"` inside is
   doubled), so words like `AND`, `NOT`, `NEAR` or `ab*` are plain words,
   never FTS5 operators. Terms are joined by a space (AND) or by ` OR `.
2. **Tokenizing.** FTS5's `unicode61` tokenizer, with
   `remove_diacritics 2`, lowercases everything, strips accents
   (`café` matches `cafe`, `Über` matches `uber`), and splits on anything
   that isn't a letter or digit. A quoted word with punctuation becomes a
   phrase: `e-mail` matches the two tokens `e mail` side by side.
3. **The chat's size.** `lines` is the chat's highest rowid, its number
   of lines, since no line is ever deleted.
4. **Common words, in big chats only.** With more than `LARGE` (20,000)
   lines, each term is checked in three stretches of `SAMPLE` (1,000)
   lines: the newest, the middle and the oldest. Each check is one count
   query bounded by rowid. A term found in more than half the lines of
   *all three* stretches counts as common, and is left out of the query,
   as long as at least one term isn't common.
   - *Why it is safe:* FTS5's bm25 gives a word in more than half the
     lines a weight of almost nothing (its IDF is clamped to 0.000001),
     so leaving it out doesn't change the ranking.
   - *Why it matters:* matching such a word means reading its whole
     posting list, millions of entries in a big chat, which took
     seconds.
   - *The one effect:* with AND, a line no longer has to contain the
     common word. Searching `the sqlite` in a big chat finds the lines
     with `sqlite`.
   - *A word common only lately* (in the newest stretch but not the
     oldest) is kept, because it is still rare across the chat.
   - *If every term is common,* all are kept and the search reads them
     all. That is the slow case, and it runs in the worker.
5. **The query.** `select first, n, text, bm25(...) ... where ... match
   ? order by score limit 20`. A lower bm25 score is a better match.

### What search costs

Measured on a 2-million-message chat (8.6 GB, in RAM):

| Search | Time |
| ------ | ---- |
| a rare word | 0.4 ms |
| a word in 1 of 1,000 lines | 6 ms |
| a common word next to a rare one | 6.6 ms |
| a few common words | 245–454 ms |
| only the most common word (`the`) | 2.9 s, in the worker, the screen unaffected |

Across projects, each file is opened anew for each search (about 0.4 ms
a file). Measured on WSL2, ext4: an `all` search of 100 small projects
took 47–107 ms, and of 6 projects of 150,000 lines each 172–181 ms.

Forgetting a project
--------------------

### What you do

1. `/projects`, pick a project, press Delete.
2. Choose **Cancel** (lit at first), **Export a copy first, then
   forget**, or **Forget**. The export writes
   `./illi-project-<name>.json` in the current folder, and refuses if
   that file exists.

### What illi does

**Another project** (`project_forget`, `project_held`):

1. It takes that project's lock. If another illi has the project open,
   it stops: *open in another terminal: quit illi there first*.
2. It deletes the project's file (`Store.forget`).
3. It lets the lock go and says what was forgotten: *Forgot app-k3f9x2:
   1,204 messages and 3 images.*

**The project you're in** (only from the illi that holds it; a view is
told to forget it in the holder's terminal):

1. It closes the chat but keeps the lock, so no other illi can open the
   project meanwhile.
2. It deletes the project's file (`Store.forget`).
3. It runs illi again in the same terminal, which starts this project
   fresh in a new file.

A project already gone (forgotten in another terminal meanwhile) is
said so: *app-k3f9x2 is forgotten already.*

### Store.forget

It deletes `<name>.sqlite`, then its `-wal` and `-shm` if there (a
crash's, or another connection's still open), then fsyncs the folder, so
a power cut right after can't bring the file back. The file goes first,
so no connection opens it after. It takes no time, whatever the project's
size, and all of the project goes at once: its messages, summary lines,
images, logs and search index, and its space. A crash between the three
deletes leaves a `-wal` (and `-shm`) with no file beside them; the next
start in that project makes an empty file, and SQLite deletes a WAL it
finds beside an empty file instead of replaying it, so nothing of the
forgotten chat comes back.

Another illi may have the file open at that moment (a search, the
projects list, a zoom). That is safe:

- A connection that had read from the file goes on reading it as it
  was: on Linux and macOS a deleted file lives on until its last open
  descriptor closes.
- A connection that had opened the file but not read yet fails its first
  read, so that project is left out (a search gives none of its lines).
- When such a connection closes, SQLite first checks the file is still
  the one it opened, and since it isn't, it neither checkpoints nor
  deletes a WAL. So a new file made meanwhile at the same name (the
  project started again) keeps its WAL. The test *a project forgotten is
  gone, its file deleted…* checks exactly that.

### What "gone" means, exactly

The file is deleted: no illi can read the project again, and its space
goes back to the file system. Like any deleted file, its bytes stay on
the disk until the file system reuses those blocks; illi doesn't
overwrite them. Neither illi nor the file system can reach:

- **SSDs**, which move and erase blocks on their own schedule.
- **Snapshots and backups** made before the forget (Time Machine, btrfs
  snapshots, a VM's or WSL's disk image snapshots).
- **The export** you asked for, if you picked *Export a copy first*.

Usage counts
------------

`~/.illi/used.json` (the commands you type) and `~/.illi/picked.json`
(the rows you pick in Ctrl+P) each map a name to a weight
(`Commands.ts term_tally_one`):

1. Each use multiplies every weight by `0.5^(1/100)` (about 0.9931), so a
   use counts half as much 100 uses later.
2. A weight under 0.1, or one that isn't a number, is deleted. A name
   used once and never again disappears after 333 other uses.
3. The used name gets +1. A name used every single time levels off near
   145, so no weight grows without end.
4. Each illi reads the file once, at its first use, and counts in
   memory from then on. Its uses are also queued.
5. 2 s after the last use (a timer that never holds illi open,
   `term_tally_keep`), it reads the file again, as another illi may have
   written it meanwhile, and replays its queued uses over it (fade, +1,
   each in order). It writes the result, each weight rounded to three
   decimals, to `used.json.<pid>` beside it, then renames that over the
   file, so no reader ever sees half a file. The result becomes its
   counts in memory too. Two illis writing in the same instant can still
   lose one's batch; a failure to write is silent and keeps nothing.
   Uses queued when illi quits within those 2 s are not kept.

Fading counts uses, not days: a month away from illi changes nothing.

Known limits
------------

- **An `all` search gives 20 lines in all,** shared out across the
  projects with matches, so with many projects each gets a line or two.
  The rest are named, not shown (*More lines in: …*).
- **Each search opens every file it covers anew,** about 0.4 ms a file.
  A worker that kept its connections open would avoid that.
- **A search keeps a snapshot of a file for as long as it reads it,** so
  a checkpoint can't finish behind it.
- **The move from the one file runs at the first start,** before the
  screen: about 5 s for 500 MB, or 24 ms a project. An older illi still
  running keeps it from starting at all, till it's quit. An illi started
  while another moves says so and waits for it (up to 10 minutes).
- **An illi started in a project just as another illi forgets it** finds
  the project's lock held, joins as a view, finds no chat to join and
  runs again on its own (`Term.ts term_gone`), as it does after a
  holder quits; once the forget is done it starts the project fresh.
- **Two illis starting at the same moment on a very busy machine** can
  both miss the 50 ms lock window; both then wait 15 s and run again.
