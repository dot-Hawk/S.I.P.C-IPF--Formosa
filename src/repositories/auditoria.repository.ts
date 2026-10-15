import { and, desc, eq } from "drizzle-orm";
import { type Db } from "../db/client.js";
import { precioAuditoria, type PrecioAuditoria } from "../db/schema.js";
import { type AccionAuditoria } from "../domain/enums.js";
import { type Page } from "./precio.repository.js";

export interface AuditoriaFilter {
  precio?: string;
  usuario?: string;
  relevamiento?: string;
  accion?: AccionAuditoria;
}

export interface AuditoriaRepository {
  listPrecios(filter: AuditoriaFilter, page: Page): Promise<PrecioAuditoria[]>;
}

export function createAuditoriaRepository(db: Db): AuditoriaRepository {
  return {
    async listPrecios(filter, page) {
      return db
        .select()
        .from(precioAuditoria)
        .where(
          and(
            filter.precio !== undefined ? eq(precioAuditoria.precio, filter.precio) : undefined,
            filter.usuario !== undefined ? eq(precioAuditoria.usuario, filter.usuario) : undefined,
            filter.relevamiento !== undefined
              ? eq(precioAuditoria.relevamiento, filter.relevamiento)
              : undefined,
            filter.accion !== undefined ? eq(precioAuditoria.accion, filter.accion) : undefined,
          ),
        )
        .orderBy(desc(precioAuditoria.createdAt), desc(precioAuditoria.id))
        .limit(page.limit)
        .offset(page.offset);
    },
  };
}
