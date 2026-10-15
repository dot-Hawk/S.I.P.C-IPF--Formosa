import { Schema, model } from "mongoose";
import { type IAsignacion } from "./interfaces/IAsignacion.interface.js";

const asignacionSchema = new Schema<IAsignacion>(
  {
    relevamiento: { type: Schema.Types.ObjectId, ref: "Relevamiento", required: true },
    encuestador: { type: Schema.Types.ObjectId, ref: "User", required: true },
    comercio: { type: Schema.Types.ObjectId, ref: "Comercio", required: true },
    estado: { type: String, enum: ["PENDIENTE", "EN_CURSO", "COMPLETADA"], required: true },
  },
  {
    timestamps: true,
  }
);

asignacionSchema.index({ relevamiento: 1, comercio: 1 }, { unique: true });

export const Asignacion = model<IAsignacion>("Asignacion", asignacionSchema);
