import { type Document, type Types } from "mongoose";

type EstadoAsignacion = "PENDIENTE" | "EN_CURSO" | "COMPLETADA";

export interface IAsignacion extends Document {
  relevamiento: Types.ObjectId;
  encuestador: Types.ObjectId;
  comercio: Types.ObjectId;
  estado: EstadoAsignacion;
  createdAt: Date;
  updatedAt: Date;
}
