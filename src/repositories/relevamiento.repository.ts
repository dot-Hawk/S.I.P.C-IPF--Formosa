import { and, desc, eq } from "drizzle-orm";
import { type Db } from "../db/client.js";
import { relevamientos, type NewRelevamiento, type Relevamiento } from "../db/schema.js";

export type RelevamientoInput = Pick<
  NewRelevamiento,
  "periodo" | "frecuencia" | "fechaInicio" | "fechaLimite" | "estado"
>;

export interface RelevamientoRepository {
  create(data: RelevamientoInput): Promise<Relevamiento>;
  list(): Promise<Relevamiento[]>;
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

    async list() {
      return db.select().from(relevamientos).orderBy(desc(relevamientos.fechaInicio));
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
