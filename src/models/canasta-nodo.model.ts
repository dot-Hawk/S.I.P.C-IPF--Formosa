import { Schema, model } from "mongoose";
import {
  CATEGORIAS_CANASTA,
  ESTADOS_CANASTA,
  type ICanastaNodo,
} from "./interfaces/ICanastaNodo.interface.js";

const canastaNodoSchema = new Schema<ICanastaNodo>(
  {
    codigo: { type: String, required: true, unique: true },
    nombre: { type: String, required: true },
    nivel: { type: Number, required: true, min: 0, max: 6 },
    padre: { type: String, default: null },
    ponderador: { type: Number, required: true, min: 0, default: 0 },
    derivado: { type: Boolean, required: true, default: false },
    estado: { type: String, enum: ESTADOS_CANASTA, required: true },
    categoria: { type: String, enum: CATEGORIAS_CANASTA, required: false },
    codigoVariedad12: { type: String, required: false },
    tratamientoEspecial: { type: Boolean, required: false },
  },
  {
    timestamps: true,
  },
);

canastaNodoSchema.index({ padre: 1 });
canastaNodoSchema.index({ nivel: 1, estado: 1 });

export const CanastaNodo = model<ICanastaNodo>("CanastaNodo", canastaNodoSchema);
