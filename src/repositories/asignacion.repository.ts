import { and, count, desc, eq, ne, type SQL } from "drizzle-orm";
import { type Db } from "../db/client.js";
import { asignaciones, type Asignacion, type NewAsignacion } from "../db/schema.js";
import { type EstadoAsignacion } from "../domain/enums.js";
import { type Page } from "./precio.repository.js";

export interface AsignacionFilter {
  relevamiento?: string;
  encuestador?: string;
  comercio?: string;
  estado?: EstadoAsignacion;
  // Rows in this estado are left out (a surveyor never sees CANCELADA visits).
  excludeEstado?: EstadoAsignacion;
}

export interface AsignacionRepository {
  create(data: Pick<NewAsignacion, "relevamiento" | "encuestador" | "comercio" | "estado">): Promise<Asignacion>;
  // Every row when no page is given.
  list(filter: AsignacionFilter, page?: Page): Promise<Asignacion[]>;
  count(filter: AsignacionFilter): Promise<number>;
  findById(id: string): Promise<Asignacion | null>;
  // Conditional on the estado the caller read, so a concurrent change cannot be overwritten.
  transitionEstado(id: string, from: EstadoAsignacion, to: EstadoAsignacion): Promise<Asignacion | null>;
  // Only a PENDIENTE asignacion can change hands, enforced atomically.
  reassignIfPendiente(id: string, encuestador: string): Promise<Asignacion | null>;
  hasEnCurso(relevamiento: string, comercio: string, encuestador: string): Promise<boolean>;
}

function filterConditions(filter: AsignacionFilter): SQL | undefined {
  return and(
    filter.relevamiento !== undefined ? eq(asignaciones.relevamiento, filter.relevamiento) : undefined,
    filter.encuestador !== undefined ? eq(asignaciones.encuestador, filter.encuestador) : undefined,
    filter.comercio !== undefined ? eq(asignaciones.comercio, filter.comercio) : undefined,
    filter.estado !== undefined ? eq(asignaciones.estado, filter.estado) : undefined,
    filter.excludeEstado !== undefined ? ne(asignaciones.estado, filter.excludeEstado) : undefined,
  );
}

export function createAsignacionRepository(db: Db): AsignacionRepository {
  return {
    async create(data) {
      const [row] = await db.insert(asignaciones).values(data).returning();
      if (!row) throw new Error("Asignacion insert returned no row");
      return row;
    },

    async list(filter, page) {
      const query = db
        .select()
        .from(asignaciones)
        .where(filterConditions(filter))
        .orderBy(desc(asignaciones.createdAt), desc(asignaciones.id));
      return page ? query.limit(page.limit).offset(page.offset) : query;
    },

    async count(filter) {
      const [row] = await db.select({ total: count() }).from(asignaciones).where(filterConditions(filter));
      return row?.total ?? 0;
    },

    async findById(id) {
      const [row] = await db.select().from(asignaciones).where(eq(asignaciones.id, id)).limit(1);
      return row ?? null;
    },

    async transitionEstado(id, from, to) {
      const [row] = await db
        .update(asignaciones)
        .set({ estado: to })
        .where(and(eq(asignaciones.id, id), eq(asignaciones.estado, from)))
        .returning();
      return row ?? null;
    },

    async reassignIfPendiente(id, encuestador) {
      const [row] = await db
        .update(asignaciones)
        .set({ encuestador })
        .where(and(eq(asignaciones.id, id), eq(asignaciones.estado, "PENDIENTE")))
        .returning();
      return row ?? null;
    },

    async hasEnCurso(relevamiento, comercio, encuestador) {
      const [row] = await db
        .select({ id: asignaciones.id })
        .from(asignaciones)
        .where(
          and(
            eq(asignaciones.relevamiento, relevamiento),
            eq(asignaciones.comercio, comercio),
            eq(asignaciones.encuestador, encuestador),
            eq(asignaciones.estado, "EN_CURSO"),
          ),
        )
        .limit(1);
      return row !== undefined;
    },
  };
}
