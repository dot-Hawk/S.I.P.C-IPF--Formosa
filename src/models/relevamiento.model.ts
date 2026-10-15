import { Schema, model } from "mongoose";
import {type IRelevamiento } from "./interfaces/IRelevamiento.interface.js";

const relevamientoSchema = new Schema<IRelevamiento>(
  {
    periodo: { type: String, required: true },
    frecuencia: { type: String, enum: ["QUINCENAL", "MENSUAL"], required: true },
    fechaInicio: { type: Date, required: true },
    fechaLimite: { type: Date, required: true },
    estado: { type: String, enum: ["ABIERTO", "CERRADO"], required: true },
  },
  {
    timestamps: true,
  }
);

relevamientoSchema.index({ periodo: 1, frecuencia: 1 }, { unique: true });

export const Relevamiento = model<IRelevamiento>("Relevamiento", relevamientoSchema);
