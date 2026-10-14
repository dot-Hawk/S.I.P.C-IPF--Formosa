import { and, desc, eq, type SQL } from "drizzle-orm";
import { type Db } from "../db/client.js";
import {
  precioAuditoria,
  precios,
  type NewPrecio,
  type Precio,
  type PrecioSnapshot,
} from "../db/schema.js";
import { type AccionAuditoria, type Role } from "../domain/enums.js";

export interface Actor {
  userId: string;
  role: Role;
}

export interface PrecioFilter {
  relevamiento?: string;
  comercio?: string;
  producto?: string;
  encuestador?: string;
  oferta?: boolean;
}

export interface Page {
  limit: number;
  offset: number;
}

export type PrecioInput = Pick<
  NewPrecio,
  "relevamiento" | "producto" | "comercio" | "encuestador" | "valor" | "oferta" | "fechaRelevamiento" | "observacion"
>;

export type PrecioChanges = Partial<Pick<NewPrecio, "valor" | "observacion" | "oferta">>;

// Every write also leaves its audit entry, in the same transaction: either both happen or neither.
export interface PrecioRepository {
  create(data: PrecioInput, actor: Actor): Promise<Precio>;
  list(filter: PrecioFilter, page: Page): Promise<Precio[]>;
  findById(id: string): Promise<Precio | null>;
  update(id: string, changes: PrecioChanges, actor: Actor): Promise<Precio | null>;
  remove(id: string, actor: Actor): Promise<Precio | null>;
}

function snapshot(precio: Precio): PrecioSnapshot {
  return {
    valor: precio.valor,
    oferta: precio.oferta,
    observacion: precio.observacion ?? null,
    fechaRelevamiento: precio.fechaRelevamiento.toISOString(),
  };
}

export function createPrecioRepository(db: Db): PrecioRepository {
  function auditEntry(
    accion: AccionAuditoria,
    actor: Actor,
    precio: Precio,
    anterior: PrecioSnapshot | null,
    posterior: PrecioSnapshot | null,
  ) {
    return {
      precio: precio.id,
      relevamiento: precio.relevamiento,
      comercio: precio.comercio,
      producto: precio.producto,
      accion,
      usuario: actor.userId,
      rol: actor.role,
      anterior,
      posterior,
    };
  }

  return {
    async create(data, actor) {
      return db.transaction(async (tx) => {
        const [row] = await tx.insert(precios).values(data).returning();
        if (!row) throw new Error("Precio insert returned no row");

        await tx.insert(precioAuditoria).values(auditEntry("CREACION", actor, row, null, snapshot(row)));
        return row;
      });
    },

    async list(filter, page) {
      const conditions: (SQL | undefined)[] = [
        filter.relevamiento !== undefined ? eq(precios.relevamiento, filter.relevamiento) : undefined,
        filter.comercio !== undefined ? eq(precios.comercio, filter.comercio) : undefined,
        filter.producto !== undefined ? eq(precios.producto, filter.producto) : undefined,
        filter.encuestador !== undefined ? eq(precios.encuestador, filter.encuestador) : undefined,
        filter.oferta !== undefined ? eq(precios.oferta, filter.oferta) : undefined,
      ];

      return db
        .select()
        .from(precios)
        .where(and(...conditions))
        .orderBy(desc(precios.fechaRelevamiento), desc(precios.createdAt), desc(precios.id))
        .limit(page.limit)
        .offset(page.offset);
    },

    async findById(id) {
      const [row] = await db.select().from(precios).where(eq(precios.id, id)).limit(1);
      return row ?? null;
    },

    async update(id, changes, actor) {
      return db.transaction(async (tx) => {
        // Locked, so the "previous values" of the audit entry are the ones really replaced.
        const [before] = await tx.select().from(precios).where(eq(precios.id, id)).for("update");
        if (!before) return null;

        const [after] =
          Object.keys(changes).length === 0
            ? [before]
            : await tx.update(precios).set(changes).where(eq(precios.id, id)).returning();
        if (!after) return null;

        await tx
          .insert(precioAuditoria)
          .values(auditEntry("MODIFICACION", actor, after, snapshot(before), snapshot(after)));
        return after;
      });
    },

    async remove(id, actor) {
      return db.transaction(async (tx) => {
        const [deleted] = await tx.delete(precios).where(eq(precios.id, id)).returning();
        if (!deleted) return null;

        await tx
          .insert(precioAuditoria)
          .values(auditEntry("ELIMINACION", actor, deleted, snapshot(deleted), null));
        return deleted;
      });
    },
  };
}
