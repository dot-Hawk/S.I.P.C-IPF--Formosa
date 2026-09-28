import { Schema, model } from "mongoose";
import {type IRelevamiento } from "./interfaces/IRelevamiento.interface.js";

const relevamientoSchema = new Schema<IRelevamiento>(
  {
    periodo: { type: String, required: true },
    fechhaInicio: { type: Date, required: true },
    fechaLimite: { type: Date, required: true },
    estado: { type: String, required: true },
  },
  {
    timestamps: true,
  }
);

export const Relevamiento = model<IRelevamiento>("Relevamiento", relevamientoSchema);
