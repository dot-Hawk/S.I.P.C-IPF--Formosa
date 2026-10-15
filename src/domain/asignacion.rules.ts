import { type EstadoAsignacion } from "./enums.js";

const TRANSITIONS: Record<EstadoAsignacion, EstadoAsignacion[]> = {
  PENDIENTE: ["EN_CURSO"],
  EN_CURSO: ["COMPLETADA"],
  COMPLETADA: [],
};

export function canTransition(from: EstadoAsignacion, to: EstadoAsignacion): boolean {
  return TRANSITIONS[from].includes(to);
}
