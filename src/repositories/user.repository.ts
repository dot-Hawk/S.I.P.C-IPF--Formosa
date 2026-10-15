import { and, asc, eq } from "drizzle-orm";
import { type Db } from "../db/client.js";
import { users, type NewUser, type User } from "../db/schema.js";
import { type EstadoUsuario, type Role } from "../domain/enums.js";
import { type Page } from "./precio.repository.js";

export interface UserFilter {
  role?: Role;
  estado?: EstadoUsuario;
}

export type UserChanges = Partial<
  Pick<NewUser, "nombre" | "apellido" | "dni" | "legajo" | "email" | "role" | "estado" | "passwordHash">
>;

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  hasRole(role: Role): Promise<boolean>;
  create(data: NewUser): Promise<User>;
  touchLastAccess(id: string, at: Date): Promise<void>;
  list(filter: UserFilter, page: Page): Promise<User[]>;
  // Null when the user does not exist.
  update(id: string, changes: UserChanges): Promise<User | null>;
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

    async list(filter, page) {
      return db
        .select()
        .from(users)
        .where(
          and(
            filter.role !== undefined ? eq(users.role, filter.role) : undefined,
            filter.estado !== undefined ? eq(users.estado, filter.estado) : undefined,
          ),
        )
        .orderBy(asc(users.apellido), asc(users.nombre), asc(users.id))
        .limit(page.limit)
        .offset(page.offset);
    },

    async update(id, changes) {
      if (Object.keys(changes).length === 0) return this.findById(id);

      const [row] = await db.update(users).set(changes).where(eq(users.id, id)).returning();
      return row ?? null;
    },
  };
}
