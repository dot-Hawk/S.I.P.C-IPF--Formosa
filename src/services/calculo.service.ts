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
import { EngineError, type EngineClient, type EngineParametros, type EngineRequest } from "./engine-client.js";

export const DEFAULT_PARAMETROS: EngineParametros = {
  esperarMeses: 2,
  pesoSuper: 0.25,
  pesoTrad: 0.75,
  omitirGruposCompletos: true,
};

const MAX_SIN_IMPUTAR_DETALLE = 200;
// A run still EJECUTANDO after this long was abandoned (the engine timeout is well below it).
const VENCIDO_MS = 10 * 60 * 1000;

export class CalculoError extends Error {
  constructor(
    readonly status: 409,
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

  async function ejecutarEnSegundoPlano(id: string, request: EngineRequest): Promise<void> {
    try {
      const response = await engine.calcular(request);

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

      await calculos.completar(
        id,
        { motorVersion: response.version, resumen },
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
    } catch (error) {
      // The engine's own reasons are meant for the user; anything else stays in the log.
      const message = error instanceof EngineError ? error.message : "Unexpected error while running the calculation";
      if (!(error instanceof EngineError)) console.error(`Calculo ${id} failed`, error);

      try {
        await calculos.fallar(id, message);
      } catch (recordError) {
        console.error(`Calculo ${id}: could not record the failure`, recordError);
      }
    }
  }

  return {
    async exportar(input: EjecutarCalculoInput): Promise<EntradaMotor> {
      return prepararEntrada(input);
    },

    // Validates and registers the run, then lets the engine work in the background: the caller gets
    // the run as EJECUTANDO right away and reads its outcome later. `terminado` settles when the
    // run has ended (it never rejects; the outcome is recorded on the run), which tests await.
    async iniciar(
      input: EjecutarCalculoInput,
      actor: { userId: string },
    ): Promise<{ calculo: Calculo; terminado: Promise<void> }> {
      const { mesBase, mesObjetivo } = input;
      const excluirOfertas = input.excluirOfertas ?? false;
      const parametros: EngineParametros = { ...DEFAULT_PARAMETROS, ...input.parametros };

      const { observaciones, variedades } = await prepararEntrada(input);
      const request = { mesBase, mesObjetivo, observaciones, variedades, parametros };

      const calculo = await calculos.iniciar(
        {
          mesBase,
          mesObjetivo,
          excluirOfertas,
          parametros,
          entradaHash: createHash("sha256").update(JSON.stringify({ ...request, excluirOfertas })).digest("hex"),
          creadoPor: actor.userId,
        },
        VENCIDO_MS,
      );
      if (!calculo) throw new CalculoError(409, "Ya hay un cálculo en ejecución: espere a que termine");

      return { calculo, terminado: ejecutarEnSegundoPlano(calculo.id, request) };
    },
  };
}
