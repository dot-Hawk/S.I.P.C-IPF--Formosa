import { and, count, desc, eq } from "drizzle-orm";
import { type Db } from "../db/client.js";
import { relevamientos, type NewRelevamiento, type Relevamiento } from "../db/schema.js";
import { type Page } from "./precio.repository.js";

export type RelevamientoInput = Pick<
  NewRelevamiento,
  "periodo" | "frecuencia" | "fechaInicio" | "fechaLimite" | "estado"
>;

export interface RelevamientoRepository {
  create(data: RelevamientoInput): Promise<Relevamiento>;
  // Every row when no page is given.
  list(page?: Page): Promise<Relevamiento[]>;
  count(): Promise<number>;
  findById(id: string): Promise<Relevamiento | null>;
  // Single atomic update: only an ABIERTO relevamiento can transition, even under concurrent requests.
  closeIfOpen(id: string): Promise<Relevamiento | null>;
}

export function createRelevamientoRepository(db: Db): RelevamientoRepository {
  return {
    async create(data) {
      const [row] = await db.insert(relevamientos).values(data).returning();
      if (!row) throw new Error("Relevamiento insert returned no row");
      return row;
    },

    async list(page) {
      const query = db
        .select()
        .from(relevamientos)
        .orderBy(desc(relevamientos.fechaInicio), desc(relevamientos.id));
      return page ? query.limit(page.limit).offset(page.offset) : query;
    },

    async count() {
      const [row] = await db.select({ total: count() }).from(relevamientos);
      return row?.total ?? 0;
    },

    async findById(id) {
      const [row] = await db.select().from(relevamientos).where(eq(relevamientos.id, id)).limit(1);
      return row ?? null;
    },

    async closeIfOpen(id) {
      const [row] = await db
        .update(relevamientos)
        .set({ estado: "CERRADO" })
        .where(and(eq(relevamientos.id, id), eq(relevamientos.estado, "ABIERTO")))
        .returning();
      return row ?? null;
    },
  };
}
