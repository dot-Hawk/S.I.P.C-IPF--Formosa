import { type EstadoAsignacion } from "./enums.js";

// CANCELADA is a terminal state reached only through the coordinator's cancellation.
const TRANSITIONS: Record<EstadoAsignacion, EstadoAsignacion[]> = {
  PENDIENTE: ["EN_CURSO", "CANCELADA"],
  EN_CURSO: ["COMPLETADA", "CANCELADA"],
  COMPLETADA: [],
  CANCELADA: [],
};

export function canTransition(from: EstadoAsignacion, to: EstadoAsignacion): boolean {
  return TRANSITIONS[from].includes(to);
}

export function canCancel(from: EstadoAsignacion): boolean {
  return canTransition(from, "CANCELADA");
}
