import { type Document } from "mongoose";

type EstadoRelevamiento = "ABIERTO" | "CERRADO";

export interface IRelevamiento extends Document {
  periodo: string;
  fechaInicio: Date;
  fechaLimite: Date;
  estado: EstadoRelevamiento;
  createdAt: Date;
  updatedAt: Date;
}
