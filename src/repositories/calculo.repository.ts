import { and, asc, desc, eq, sql } from "drizzle-orm";
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
  // The run and its results are written together: a run is either complete or absent.
  guardar(
    calculo: NewCalculo,
    relativos: RelativoInput[],
    imputaciones: ImputacionInput[],
  ): Promise<Calculo>;
  list(page: Page): Promise<Calculo[]>;
  findById(id: string): Promise<Calculo | null>;
  relativos(calculo: string, filter: RelativosFilter): Promise<CalculoRelativo[]>;
  imputaciones(calculo: string, page: Page): Promise<CalculoImputacion[]>;
}

const INSERT_BATCH = 2000;

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

    async guardar(calculo, relativos, imputaciones) {
      return db.transaction(async (tx) => {
        const [row] = await tx.insert(calculos).values(calculo).returning();
        if (!row) throw new Error("Calculo insert returned no row");

        for (let i = 0; i < relativos.length; i += INSERT_BATCH) {
          await tx
            .insert(calculoRelativos)
            .values(relativos.slice(i, i + INSERT_BATCH).map((r) => ({ ...r, calculo: row.id })));
        }
        for (let i = 0; i < imputaciones.length; i += INSERT_BATCH) {
          await tx
            .insert(calculoImputaciones)
            .values(imputaciones.slice(i, i + INSERT_BATCH).map((m) => ({ ...m, calculo: row.id })));
        }

        return row;
      });
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
  };
}
