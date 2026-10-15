import { and, asc, eq } from "drizzle-orm";
import { type Db } from "../db/client.js";
import { comercios, type Comercio, type NewComercio } from "../db/schema.js";
import { type EstadoComercio, type TipoComercio } from "../domain/enums.js";

export interface ComercioFilter {
  zona?: string;
  tipo?: TipoComercio;
  estado?: EstadoComercio;
}

export type ComercioChanges = Partial<
  Pick<NewComercio, "nombre" | "direccion" | "zona" | "tipo" | "estado">
>;

export interface ComercioRepository {
  create(data: Pick<NewComercio, "nombre" | "direccion" | "zona" | "tipo" | "estado">): Promise<Comercio>;
  list(filter: ComercioFilter): Promise<Comercio[]>;
  findById(id: string): Promise<Comercio | null>;
  update(id: string, changes: ComercioChanges): Promise<Comercio | null>;
}

export function createComercioRepository(db: Db): ComercioRepository {
  return {
    async create(data) {
      const [row] = await db.insert(comercios).values(data).returning();
      if (!row) throw new Error("Comercio insert returned no row");
      return row;
    },

    async list(filter) {
      return db
        .select()
        .from(comercios)
        .where(
          and(
            filter.zona !== undefined ? eq(comercios.zona, filter.zona) : undefined,
            filter.tipo !== undefined ? eq(comercios.tipo, filter.tipo) : undefined,
            filter.estado !== undefined ? eq(comercios.estado, filter.estado) : undefined,
          ),
        )
        .orderBy(asc(comercios.nombre));
    },

    async findById(id) {
      const [row] = await db.select().from(comercios).where(eq(comercios.id, id)).limit(1);
      return row ?? null;
    },

    async update(id, changes) {
      if (Object.keys(changes).length === 0) return this.findById(id);

      const [row] = await db.update(comercios).set(changes).where(eq(comercios.id, id)).returning();
      return row ?? null;
    },
  };
}
