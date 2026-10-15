import { type EngineObservacion, type EngineVariedad } from "../domain/calculo-input.js";

export interface EngineParametros {
  esperarMeses: number;
  pesoSuper: number;
  pesoTrad: number;
  omitirGruposCompletos: boolean;
}

export interface EngineRequest {
  mesBase: string;
  mesObjetivo: string;
  observaciones: EngineObservacion[];
  variedades: EngineVariedad[];
  parametros: EngineParametros;
}

export interface EngineRelativo {
  variedad: string;
  mes: string;
  valor: number | null;
  nSuper: number;
  nTrad: number;
}

export interface EngineImputacion {
  variedad: string;
  informante: string;
  mes: string;
  precio: number;
  nivel: number;
  grupo: string;
  factor: number;
}

export interface EngineResponse {
  version: string;
  meses: string[];
  relativos: EngineRelativo[];
  imputaciones: EngineImputacion[];
  sinImputar: { variedad: string; informante: string; mes: string }[];
  especiales: string[];
  resumen: {
    observaciones: number;
    variedades: number;
    informantes: number;
    imputaciones: number;
    sinImputar: number;
  };
}

// "rejected": the engine understood the request and refused it (the data is wrong).
// "unavailable": it could not be reached or did not answer properly.
export class EngineError extends Error {
  constructor(
    readonly kind: "rejected" | "unavailable",
    message: string,
  ) {
    super(message);
    this.name = "EngineError";
  }
}

export interface EngineClient {
  calcular(request: EngineRequest): Promise<EngineResponse>;
}

export interface HttpEngineClientOptions {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
}

function isEngineResponse(value: unknown): value is EngineResponse {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v["version"] === "string" &&
    Array.isArray(v["meses"]) &&
    Array.isArray(v["relativos"]) &&
    Array.isArray(v["imputaciones"]) &&
    Array.isArray(v["sinImputar"]) &&
    typeof v["resumen"] === "object" &&
    v["resumen"] !== null
  );
}

export function createHttpEngineClient(options: HttpEngineClientOptions): EngineClient {
  const timeoutMs = options.timeoutMs ?? 120_000;

  return {
    async calcular(request) {
      let response: Response;
      try {
        response = await fetch(`${options.baseUrl.replace(/\/$/, "")}/v1/calculo`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-api-key": options.apiKey },
          body: JSON.stringify(request),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        const reason = error instanceof Error ? error.name : "unknown error";
        throw new EngineError("unavailable", `The calculation engine could not be reached (${reason})`);
      }

      if (response.status === 422) {
        const body = (await response.json().catch(() => ({}))) as { detail?: unknown };
        throw new EngineError("rejected", typeof body.detail === "string" ? body.detail : "The engine rejected the data");
      }
      if (!response.ok) {
        throw new EngineError("unavailable", `The calculation engine answered ${response.status}`);
      }

      const body: unknown = await response.json().catch(() => undefined);
      if (!isEngineResponse(body)) {
        throw new EngineError("unavailable", "The calculation engine answered an unexpected body");
      }
      return body;
    },
  };
}
