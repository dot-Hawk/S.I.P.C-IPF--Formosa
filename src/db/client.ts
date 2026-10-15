import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

export type Db = NodePgDatabase<typeof schema>;

export interface DbHandle {
  db: Db;
  pool: Pool;
}

export function createDb(connectionString: string): DbHandle {
  const pool = new Pool({ connectionString });
  return { db: drizzle(pool, { schema }), pool };
}
