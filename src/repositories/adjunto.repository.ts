import { asc, count, eq } from "drizzle-orm";
import { type Db } from "../db/client.js";
import { precioAdjuntos, precioAuditoria, precios, type PrecioAdjunto, type Precio } from "../db/schema.js";
import { type AccionAuditoria } from "../domain/enums.js";
import { type Actor } from "./precio.repository.js";

export interface AdjuntoInput {
  precio: string;
  clave: string;
  mime: string;
  bytes: number;
  sha256: string;
}

// `null` when the precio does not exist; `limite` when it already holds the maximum.
export type CreateAdjuntoResult = { adjunto: PrecioAdjunto } | { limite: true } | null;

// Like the precio itself, every write leaves its audit entry in the same transaction.
export interface AdjuntoRepository {
  create(data: AdjuntoInput, actor: Actor, maxPorPrecio: number): Promise<CreateAdjuntoResult>;
  listByPrecio(precio: string): Promise<PrecioAdjunto[]>;
  findById(id: string): Promise<PrecioAdjunto | null>;
  remove(id: string, actor: Actor): Promise<PrecioAdjunto | null>;
}

export function createAdjuntoRepository(db: Db): AdjuntoRepository {
  function auditEntry(accion: AccionAuditoria, actor: Actor, precio: Precio, adjunto: PrecioAdjunto) {
    return {
      precio: precio.id,
      relevamiento: precio.relevamiento,
      comercio: precio.comercio,
      producto: precio.producto,
      accion,
      usuario: actor.userId,
      rol: actor.role,
      detalle: { adjunto: adjunto.id, mime: adjunto.mime, bytes: adjunto.bytes, sha256: adjunto.sha256 },
    };
  }

  return {
    async create(data, actor, maxPorPrecio) {
      return db.transaction(async (tx) => {
        // Locking the precio serializes concurrent uploads, so the limit cannot be overshot.
        const [precio] = await tx.select().from(precios).where(eq(precios.id, data.precio)).for("update");
        if (!precio) return null;

        const [current] = await tx
          .select({ total: count() })
          .from(precioAdjuntos)
          .where(eq(precioAdjuntos.precio, data.precio));
        if ((current?.total ?? 0) >= maxPorPrecio) return { limite: true as const };

        const [adjunto] = await tx
          .insert(precioAdjuntos)
          .values({ ...data, subidoPor: actor.userId })
          .returning();
        if (!adjunto) throw new Error("Adjunto insert returned no row");

        await tx.insert(precioAuditoria).values(auditEntry("ADJUNTO_AGREGADO", actor, precio, adjunto));
        return { adjunto };
      });
    },

    async listByPrecio(precio) {
      return db
        .select()
        .from(precioAdjuntos)
        .where(eq(precioAdjuntos.precio, precio))
        .orderBy(asc(precioAdjuntos.createdAt), asc(precioAdjuntos.id));
    },

    async findById(id) {
      const [row] = await db.select().from(precioAdjuntos).where(eq(precioAdjuntos.id, id)).limit(1);
      return row ?? null;
    },

    async remove(id, actor) {
      return db.transaction(async (tx) => {
        const [adjunto] = await tx.delete(precioAdjuntos).where(eq(precioAdjuntos.id, id)).returning();
        if (!adjunto) return null;

        const [precio] = await tx.select().from(precios).where(eq(precios.id, adjunto.precio));
        if (precio) {
          await tx.insert(precioAuditoria).values(auditEntry("ADJUNTO_ELIMINADO", actor, precio, adjunto));
        }
        return adjunto;
      });
    },
  };
}
