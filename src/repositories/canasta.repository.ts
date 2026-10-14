import { and, asc, eq, sql } from "drizzle-orm";
import { type Db } from "../db/client.js";
import { canastaNodos, type CanastaNodo, type NewCanastaNodo } from "../db/schema.js";
import { NIVEL_VARIEDAD, type CategoriaCanasta, type EstadoCanasta } from "../domain/enums.js";

export interface CanastaFilter {
  nivel?: number;
  padre?: string;
  categoria?: CategoriaCanasta;
  estado?: EstadoCanasta;
}

export interface CanastaRepository {
  list(filter: CanastaFilter): Promise<CanastaNodo[]>;
  findByCodigo(codigo: string): Promise<CanastaNodo | null>;
  isActiveVariedad(codigo: string): Promise<boolean>;
  create(data: NewCanastaNodo): Promise<CanastaNodo>;
  // "Removing" a variedad is deactivating it. Only nivel 6 nodes can be changed this way.
  setVariedadEstado(codigo: string, estado: EstadoCanasta): Promise<CanastaNodo | null>;
  findAll(): Promise<CanastaNodo[]>;
  // Inserts new nodes and refreshes the data of existing ones. estado is never overwritten, so a
  // variedad deactivated through the API stays inactive after a re-import.
  upsertMany(nodos: NewCanastaNodo[]): Promise<void>;
}

const UPSERT_BATCH = 500;

export function createCanastaRepository(db: Db): CanastaRepository {
  return {
    async list(filter) {
      return db
        .select()
        .from(canastaNodos)
        .where(
          and(
            filter.nivel !== undefined ? eq(canastaNodos.nivel, filter.nivel) : undefined,
            filter.padre !== undefined ? eq(canastaNodos.padre, filter.padre) : undefined,
            filter.categoria !== undefined ? eq(canastaNodos.categoria, filter.categoria) : undefined,
            filter.estado !== undefined ? eq(canastaNodos.estado, filter.estado) : undefined,
          ),
        )
        .orderBy(asc(canastaNodos.codigo));
    },

    async findByCodigo(codigo) {
      const [row] = await db.select().from(canastaNodos).where(eq(canastaNodos.codigo, codigo)).limit(1);
      return row ?? null;
    },

    async isActiveVariedad(codigo) {
      const [row] = await db
        .select({ codigo: canastaNodos.codigo })
        .from(canastaNodos)
        .where(
          and(
            eq(canastaNodos.codigo, codigo),
            eq(canastaNodos.nivel, NIVEL_VARIEDAD),
            eq(canastaNodos.estado, "ACTIVO"),
          ),
        )
        .limit(1);
      return row !== undefined;
    },

    async create(data) {
      const [row] = await db.insert(canastaNodos).values(data).returning();
      if (!row) throw new Error("Canasta node insert returned no row");
      return row;
    },

    async setVariedadEstado(codigo, estado) {
      const [row] = await db
        .update(canastaNodos)
        .set({ estado })
        .where(and(eq(canastaNodos.codigo, codigo), eq(canastaNodos.nivel, NIVEL_VARIEDAD)))
        .returning();
      return row ?? null;
    },

    async findAll() {
      return db.select().from(canastaNodos);
    },

    async upsertMany(nodos) {
      // Parents first, so a batch never references a node that is not inserted yet.
      const ordered = [...nodos].sort((a, b) => a.nivel - b.nivel);

      for (let start = 0; start < ordered.length; start += UPSERT_BATCH) {
        await db
          .insert(canastaNodos)
          .values(ordered.slice(start, start + UPSERT_BATCH))
          .onConflictDoUpdate({
            target: canastaNodos.codigo,
            set: {
              nombre: sql`excluded.nombre`,
              nivel: sql`excluded.nivel`,
              padre: sql`excluded.padre`,
              ponderador: sql`excluded.ponderador`,
              derivado: sql`excluded.derivado`,
              categoria: sql`excluded.categoria`,
              codigoVariedad12: sql`excluded.codigo_variedad_12`,
              tratamientoEspecial: sql`excluded.tratamiento_especial`,
            },
          });
      }
    },
  };
}
