// shortcut: one JSON file, read and written whole per request; fine for a single-studio demo, move to SQLite/Postgres for real use.
import fs from "node:fs";
import path from "node:path";
import { seed } from "./seed.ts";
import type { Db } from "./types.ts";

const file = path.join(process.cwd(), "data", "db.json");

export function load(): Db {
  if (!fs.existsSync(file)) save(seed());
  return JSON.parse(fs.readFileSync(file, "utf8")) as Db;
}

export function save(db: Db) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, file); // atomic swap so a crash never leaves half a ledger
}

export function reset() {
  save(seed());
}
