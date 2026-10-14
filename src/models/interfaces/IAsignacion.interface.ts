import { type Document, type Types } from "mongoose";

export const ESTADOS_ASIGNACION = ["PENDIENTE", "EN_CURSO", "COMPLETADA"] as const;

export type EstadoAsignacion = (typeof ESTADOS_ASIGNACION)[number];

export interface IAsignacion extends Document {
  relevamiento: Types.ObjectId;
  encuestador: Types.ObjectId;
  comercio: Types.ObjectId;
  estado: EstadoAsignacion;
  createdAt: Date;
  updatedAt: Date;
}
