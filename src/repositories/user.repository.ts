import { and, asc, count, eq, type SQL } from "drizzle-orm";
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

// Thrown by `update` when the change would leave the system without an ACTIVO COORDINADOR.
export class LastCoordinadorError extends Error {
  constructor() {
    super("The system cannot be left without an active coordinador");
    this.name = "LastCoordinadorError";
  }
}

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  hasRole(role: Role): Promise<boolean>;
  create(data: NewUser): Promise<User>;
  touchLastAccess(id: string, at: Date): Promise<void>;
  list(filter: UserFilter, page: Page): Promise<User[]>;
  // Total of users matching the filter, regardless of the page.
  count(filter: UserFilter): Promise<number>;
  // Null when the user does not exist. Throws LastCoordinadorError when the change would remove the
  // last ACTIVO COORDINADOR.
  update(id: string, changes: UserChanges): Promise<User | null>;
}

function filterConditions(filter: UserFilter): SQL | undefined {
  return and(
    filter.role !== undefined ? eq(users.role, filter.role) : undefined,
    filter.estado !== undefined ? eq(users.estado, filter.estado) : undefined,
  );
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
        .where(filterConditions(filter))
        .orderBy(asc(users.apellido), asc(users.nombre), asc(users.id))
        .limit(page.limit)
        .offset(page.offset);
    },

    async count(filter) {
      const [row] = await db.select({ total: count() }).from(users).where(filterConditions(filter));
      return row?.total ?? 0;
    },

    async update(id, changes) {
      if (Object.keys(changes).length === 0) return this.findById(id);

      const reducesCoordinadores =
        (changes.role !== undefined && changes.role !== "COORDINADOR") ||
        (changes.estado !== undefined && changes.estado !== "ACTIVO");
      if (!reducesCoordinadores) {
        const [row] = await db.update(users).set(changes).where(eq(users.id, id)).returning();
        return row ?? null;
      }

      return db.transaction(async (tx) => {
        // Locking every active coordinador (in id order, so two writers cannot deadlock) makes the
        // count and the write one atomic step: a concurrent change waits here and then sees the
        // committed state, so two coordinadores cannot deactivate each other at the same time.
        const active = await tx
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.role, "COORDINADOR"), eq(users.estado, "ACTIVO")))
          .orderBy(asc(users.id))
          .for("update");

        if (active.length === 1 && active[0]?.id === id) throw new LastCoordinadorError();

        const [row] = await tx.update(users).set(changes).where(eq(users.id, id)).returning();
        return row ?? null;
      });
    },
  };
}
