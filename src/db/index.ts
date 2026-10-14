import { createDb, type DbHandle } from "./client.js";

let handle: DbHandle | undefined;

// Lazy so that importing a module never needs the database; the first use does.
export function getDbHandle(): DbHandle {
  if (!handle) {
    const url = process.env["DATABASE_URL"];
    if (!url) throw new Error("DATABASE_URL is not defined in the environment");
    handle = createDb(url);
  }
  return handle;
}

export function getDb() {
  return getDbHandle().db;
}

// Fails fast at startup instead of on the first request.
export async function connectDb(): Promise<void> {
  await getDbHandle().pool.query("select 1");
  console.log("Connected to PostgreSQL");
}

export async function closeDb(): Promise<void> {
  if (handle) {
    await handle.pool.end();
    handle = undefined;
  }
}
