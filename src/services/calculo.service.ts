import { createHash } from "node:crypto";
import { type Calculo } from "../db/schema.js";
import {
  buildObservaciones,
  buildVariedades,
  nodosVariedad,
  rangoMeses,
} from "../domain/calculo-input.js";
import { type EngineObservacion, type EngineVariedad } from "../domain/calculo-input.js";
import { type CalculoRepository } from "../repositories/calculo.repository.js";
import { type CanastaRepository } from "../repositories/canasta.repository.js";
import { EngineError, type EngineClient, type EngineParametros } from "./engine-client.js";

export const DEFAULT_PARAMETROS: EngineParametros = {
  esperarMeses: 2,
  pesoSuper: 0.25,
  pesoTrad: 0.75,
  omitirGruposCompletos: true,
};

const MAX_SIN_IMPUTAR_DETALLE = 200;

export class CalculoError extends Error {
  constructor(
    readonly status: 409 | 422 | 502,
    message: string,
  ) {
    super(message);
    this.name = "CalculoError";
  }
}

export interface EjecutarCalculoInput {
  mesBase: string;
  mesObjetivo: string;
  excluirOfertas?: boolean;
  parametros?: Partial<EngineParametros>;
}

export interface EntradaMotor {
  observaciones: EngineObservacion[];
  variedades: EngineVariedad[];
}

export interface CalculoServiceDeps {
  calculos: CalculoRepository;
  canasta: CanastaRepository;
  engine: EngineClient;
}

export function createCalculoService({ calculos, canasta, engine }: CalculoServiceDeps) {
  // Every month of the range must be fully surveyed and closed: closed relevamientos are frozen,
  // so a run is reproducible from its inputs.
  async function assertRangoCerrado(mesBase: string, mesObjetivo: string): Promise<void> {
    const relevamientos = await calculos.relevamientosEntre(mesBase, mesObjetivo);

    for (const mes of rangoMeses(mesBase, mesObjetivo)) {
      const delMes = relevamientos.filter((r) => r.periodo.startsWith(mes));
      if (delMes.length === 0) {
        throw new CalculoError(409, `No hay relevamientos para el mes ${mes}`);
      }
      const abiertos = delMes.filter((r) => r.estado !== "CERRADO").map((r) => r.periodo);
      if (abiertos.length > 0) {
        throw new CalculoError(409, `Hay relevamientos abiertos: ${abiertos.join(", ")}`);
      }
    }
  }

  // What the engine takes: the observations of the range and the variedades with their groups.
  // Shared by the run and by the export, so the file is exactly what a run would be fed.
  async function prepararEntrada(input: EjecutarCalculoInput): Promise<EntradaMotor> {
    const { mesBase, mesObjetivo } = input;

    await assertRangoCerrado(mesBase, mesObjetivo);

    const observaciones = buildObservaciones(await calculos.preciosEntre(mesBase, mesObjetivo), {
      excluirOfertas: input.excluirOfertas ?? false,
    });
    if (observaciones.length === 0) {
      throw new CalculoError(409, "No hay precios cargados en el rango indicado");
    }

    const variedades = buildVariedades(nodosVariedad(await canasta.findAll()));
    return { observaciones, variedades };
  }

  return {
    async exportar(input: EjecutarCalculoInput): Promise<EntradaMotor> {
      return prepararEntrada(input);
    },

    async ejecutar(input: EjecutarCalculoInput, actor: { userId: string }): Promise<Calculo> {
      const { mesBase, mesObjetivo } = input;
      const excluirOfertas = input.excluirOfertas ?? false;
      const parametros: EngineParametros = { ...DEFAULT_PARAMETROS, ...input.parametros };

      const { observaciones, variedades } = await prepararEntrada(input);
      const request = { mesBase, mesObjetivo, observaciones, variedades, parametros };

      const base = {
        mesBase,
        mesObjetivo,
        excluirOfertas,
        parametros,
        entradaHash: createHash("sha256").update(JSON.stringify({ ...request, excluirOfertas })).digest("hex"),
        creadoPor: actor.userId,
      };

      let response;
      try {
        response = await engine.calcular(request);
      } catch (error) {
        if (!(error instanceof EngineError)) throw error;

        await calculos.guardar({ ...base, estado: "FALLIDO", error: error.message }, [], []);
        throw new CalculoError(error.kind === "rejected" ? 422 : 502, error.message);
      }

      const resumen = {
        ...response.resumen,
        ...(response.sinImputar.length > 0
          ? {
              sinImputarDetalle: response.sinImputar.slice(0, MAX_SIN_IMPUTAR_DETALLE).map((s) => ({
                variedad: s.variedad,
                comercio: s.informante,
                mes: s.mes,
              })),
            }
          : {}),
      };

      return calculos.guardar(
        { ...base, estado: "COMPLETADO", motorVersion: response.version, resumen },
        response.relativos.map((r) => ({
          variedad: r.variedad,
          mes: r.mes,
          valor: r.valor,
          nSuper: r.nSuper,
          nTrad: r.nTrad,
        })),
        response.imputaciones.map((i) => ({
          variedad: i.variedad,
          comercio: i.informante,
          mes: i.mes,
          precio: i.precio,
          nivel: i.nivel,
          grupo: i.grupo,
          factor: i.factor,
        })),
      );
    },
  };
}
