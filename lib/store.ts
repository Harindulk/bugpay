// shortcut: one JSON file, read and written whole; fine for a single-studio demo, move to SQLite/Postgres for real use.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { seed } from "./seed.ts";
import type { Db } from "./types.ts";

const file = () => path.join(process.cwd(), "data", "db.json");

export function load(): Db {
  if (!fs.existsSync(file())) save(seed());
  const db = JSON.parse(fs.readFileSync(file(), "utf8")) as Db;
  if (!db.ledgerId) {
    db.ledgerId = crypto.randomUUID().slice(0, 8);
    save(db);
  }
  return db;
}

export function save(db: Db) {
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  const tmp = `${file()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, file()); // atomic swap so a crash never leaves half a ledger
}

// Every read-modify-write runs through this queue, so a slow PayPal call can't let another
// request's save be overwritten by a stale copy. Slow Claude calls happen outside it.
let queue: Promise<unknown> = Promise.resolve();
export function locked<T>(fn: (db: Db) => T | Promise<T>): Promise<T> {
  const run = queue.then(() => fn(load()));
  queue = run.catch(() => undefined);
  return run;
}
