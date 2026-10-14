import { type Document } from "mongoose";

type EstadoRelevamiento = "ABIERTO" | "CERRADO";
type FrecuenciaRelevamiento = "QUINCENAL" | "MENSUAL";

export interface IRelevamiento extends Document {
  periodo: string;
  frecuencia: FrecuenciaRelevamiento;
  fechaInicio: Date;
  fechaLimite: Date;
  estado: EstadoRelevamiento;
  createdAt: Date;
  updatedAt: Date;
}
