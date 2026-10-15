// A price is checked against the history of the same producto in the same commerce. The result is
// a warning for the surveyor, never a rejection: prices do change, and the person on site knows.

export interface Alerta {
  media: number;
  desvio: number;
  n: number;
  limiteInferior: number;
  limiteSuperior: number;
}

export interface OpcionesDesvio {
  // Width of the usual range, in standard deviations.
  desviosEstandar?: number;
  // The range is never narrower than this fraction of the mean, so a flat history (standard
  // deviation 0) does not turn every small change into an alarm.
  toleranciaMinima?: number;
  // Fewer observations than this are not enough to judge.
  historiaMinima?: number;
}

export const DESVIOS_ESTANDAR = 3;
export const TOLERANCIA_MINIMA = 0.1;
export const HISTORIA_MINIMA = 3;

export function evaluarDesvio(
  historial: number[],
  valor: number,
  opciones: OpcionesDesvio = {},
): Alerta | null {
  const { desviosEstandar = DESVIOS_ESTANDAR, toleranciaMinima = TOLERANCIA_MINIMA, historiaMinima = HISTORIA_MINIMA } =
    opciones;
  const n = historial.length;
  if (n < historiaMinima) return null;

  const media = historial.reduce((sum, v) => sum + v, 0) / n;
  const varianza = historial.reduce((sum, v) => sum + (v - media) ** 2, 0) / (n - 1);
  const desvio = Math.sqrt(varianza);

  const tolerancia = Math.max(desviosEstandar * desvio, toleranciaMinima * media);
  if (Math.abs(valor - media) <= tolerancia) return null;

  return {
    media,
    desvio,
    n,
    limiteInferior: Math.max(media - tolerancia, 0),
    limiteSuperior: media + tolerancia,
  };
}
