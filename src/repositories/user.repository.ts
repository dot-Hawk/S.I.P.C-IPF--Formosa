import { eq } from "drizzle-orm";
import { type Db } from "../db/client.js";
import { users, type NewUser, type User } from "../db/schema.js";
import { type Role } from "../domain/enums.js";

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  hasRole(role: Role): Promise<boolean>;
  create(data: NewUser): Promise<User>;
  touchLastAccess(id: string, at: Date): Promise<void>;
}

export function createUserRepository(db: Db): UserRepository {
  return {
    async findById(id) {
      const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      return row ?? null;
    },

    async findByEmail(email) {
      const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      return row ?? null;
    },

    async hasRole(role) {
      const [row] = await db.select({ id: users.id }).from(users).where(eq(users.role, role)).limit(1);
      return row !== undefined;
    },

    async create(data) {
      const [row] = await db.insert(users).values(data).returning();
      if (!row) throw new Error("User insert returned no row");
      return row;
    },

    async touchLastAccess(id, at) {
      await db.update(users).set({ ultimoAcceso: at }).where(eq(users.id, id));
    },
  };
}
