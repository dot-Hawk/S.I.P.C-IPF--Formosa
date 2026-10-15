import { and, asc, desc, eq, lt, sql } from "drizzle-orm";
import { type Db } from "../db/client.js";
import {
  calculoImputaciones,
  calculoRelativos,
  calculos,
  comercios,
  precios,
  productos,
  relevamientos,
  type Calculo,
  type CalculoImputacion,
  type CalculoRelativo,
  type NewCalculo,
  type NewCalculoImputacion,
  type NewCalculoRelativo,
} from "../db/schema.js";
import { type PrecioFila } from "../domain/calculo-input.js";
import { type EstadoRelevamiento } from "../domain/enums.js";
import { type Page } from "./precio.repository.js";

export interface RelevamientoDelMes {
  periodo: string;
  estado: EstadoRelevamiento;
}

export interface RelativosFilter {
  variedad?: string;
  mes?: string;
}

export type RelativoInput = Omit<NewCalculoRelativo, "calculo">;
export type ImputacionInput = Omit<NewCalculoImputacion, "calculo" | "id">;

export interface CalculoRepository {
  relevamientosEntre(mesBase: string, mesObjetivo: string): Promise<RelevamientoDelMes[]>;
  preciosEntre(mesBase: string, mesObjetivo: string): Promise<PrecioFila[]>;
  // Registers a run as EJECUTANDO. Only one run executes at a time (the engine recomputes the whole
  // series, so two at once only compete), so it answers null while another is in progress. Runs
  // that were EJECUTANDO for longer than `vencidoMs` were abandoned (crash, restart) and are
  // failed first, so one of them can never block the system for good.
  iniciar(calculo: Omit<NewCalculo, "estado">, vencidoMs: number): Promise<Calculo | null>;
  // The results are written together with the new estado: a run is either complete or not.
  completar(
    id: string,
    resultado: Pick<NewCalculo, "motorVersion" | "resumen">,
    relativos: RelativoInput[],
    imputaciones: ImputacionInput[],
  ): Promise<Calculo | null>;
  fallar(id: string, error: string): Promise<void>;
  // At boot: whatever was running died with the previous process.
  interrumpirEjecutando(): Promise<number>;
  list(page: Page): Promise<Calculo[]>;
  findById(id: string): Promise<Calculo | null>;
  relativos(calculo: string, filter: RelativosFilter): Promise<CalculoRelativo[]>;
  imputaciones(calculo: string, page: Page): Promise<CalculoImputacion[]>;
  // Every imputation of the run, for the planilla download.
  allImputaciones(calculo: string): Promise<CalculoImputacion[]>;
}

const INSERT_BATCH = 2000;
// Serializes the "is another run executing?" check with the insert, across instances.
const INICIAR_LOCK_KEY = 872346001;
export const MENSAJE_INTERRUMPIDO = "The run was interrupted before it finished (the server restarted or the engine never answered)";

export function createCalculoRepository(db: Db): CalculoRepository {
  // The month of a relevamiento is the first 7 characters of its periodo ("2026-10-Q1" -> "2026-10").
  const mesDeRelevamiento = sql<string>`substring(${relevamientos.periodo} from 1 for 7)`;

  return {
    async relevamientosEntre(mesBase, mesObjetivo) {
      return db
        .select({ periodo: relevamientos.periodo, estado: relevamientos.estado })
        .from(relevamientos)
        .where(and(sql`${mesDeRelevamiento} >= ${mesBase}`, sql`${mesDeRelevamiento} <= ${mesObjetivo}`))
        .orderBy(asc(relevamientos.periodo));
    },

    async preciosEntre(mesBase, mesObjetivo) {
      return db
        .select({
          periodo: relevamientos.periodo,
          oferta: precios.oferta,
          valor: precios.valor,
          codigoVariedad: productos.codigoVariedad,
          comercio: precios.comercio,
          tipoComercio: comercios.tipo,
        })
        .from(precios)
        .innerJoin(relevamientos, eq(precios.relevamiento, relevamientos.id))
        .innerJoin(productos, eq(precios.producto, productos.id))
        .innerJoin(comercios, eq(precios.comercio, comercios.id))
        .where(and(sql`${mesDeRelevamiento} >= ${mesBase}`, sql`${mesDeRelevamiento} <= ${mesObjetivo}`));
    },

    async iniciar(calculo, vencidoMs) {
      return db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(${INICIAR_LOCK_KEY})`);

        await tx
          .update(calculos)
          .set({ estado: "FALLIDO", error: MENSAJE_INTERRUMPIDO })
          .where(and(eq(calculos.estado, "EJECUTANDO"), lt(calculos.createdAt, new Date(Date.now() - vencidoMs))));

        const [running] = await tx
          .select({ id: calculos.id })
          .from(calculos)
          .where(eq(calculos.estado, "EJECUTANDO"))
          .limit(1);
        if (running) return null;

        const [row] = await tx
          .insert(calculos)
          .values({ ...calculo, estado: "EJECUTANDO" })
          .returning();
        if (!row) throw new Error("Calculo insert returned no row");
        return row;
      });
    },

    async completar(id, resultado, relativos, imputaciones) {
      return db.transaction(async (tx) => {
        for (let i = 0; i < relativos.length; i += INSERT_BATCH) {
          await tx
            .insert(calculoRelativos)
            .values(relativos.slice(i, i + INSERT_BATCH).map((r) => ({ ...r, calculo: id })));
        }
        for (let i = 0; i < imputaciones.length; i += INSERT_BATCH) {
          await tx
            .insert(calculoImputaciones)
            .values(imputaciones.slice(i, i + INSERT_BATCH).map((m) => ({ ...m, calculo: id })));
        }

        const [row] = await tx
          .update(calculos)
          .set({ ...resultado, estado: "COMPLETADO", error: null })
          .where(eq(calculos.id, id))
          .returning();
        return row ?? null;
      });
    },

    async fallar(id, error) {
      await db.update(calculos).set({ estado: "FALLIDO", error }).where(eq(calculos.id, id));
    },

    async interrumpirEjecutando() {
      const rows = await db
        .update(calculos)
        .set({ estado: "FALLIDO", error: MENSAJE_INTERRUMPIDO })
        .where(eq(calculos.estado, "EJECUTANDO"))
        .returning({ id: calculos.id });
      return rows.length;
    },

    async list(page) {
      return db
        .select()
        .from(calculos)
        .orderBy(desc(calculos.createdAt), desc(calculos.id))
        .limit(page.limit)
        .offset(page.offset);
    },

    async findById(id) {
      const [row] = await db.select().from(calculos).where(eq(calculos.id, id)).limit(1);
      return row ?? null;
    },

    async relativos(calculo, filter) {
      return db
        .select()
        .from(calculoRelativos)
        .where(
          and(
            eq(calculoRelativos.calculo, calculo),
            filter.variedad !== undefined ? eq(calculoRelativos.variedad, filter.variedad) : undefined,
            filter.mes !== undefined ? eq(calculoRelativos.mes, filter.mes) : undefined,
          ),
        )
        .orderBy(asc(calculoRelativos.variedad), asc(calculoRelativos.mes));
    },

    async imputaciones(calculo, page) {
      return db
        .select()
        .from(calculoImputaciones)
        .where(eq(calculoImputaciones.calculo, calculo))
        .orderBy(asc(calculoImputaciones.mes), asc(calculoImputaciones.variedad), asc(calculoImputaciones.id))
        .limit(page.limit)
        .offset(page.offset);
    },

    async allImputaciones(calculo) {
      return db
        .select()
        .from(calculoImputaciones)
        .where(eq(calculoImputaciones.calculo, calculo))
        .orderBy(asc(calculoImputaciones.mes), asc(calculoImputaciones.variedad), asc(calculoImputaciones.id));
    },
  };
}
