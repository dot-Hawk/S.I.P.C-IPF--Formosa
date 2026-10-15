import { Schema, model } from "mongoose";
import { type IComercio } from "./interfaces/IComercio.interface.js";

const comercioSchema = new Schema<IComercio>(
  {
    nombre: { type: String, required: true },
    direccion: { type: String, required: true },
    zona: { type: String, required: true },
    tipo: { type: String, enum: ["SUPERMERCADO", "ALMACEN", "VERDULERIA", "CARNICERIA", "FARMACIA", "OTRO"], required: true },
    estado: { type: String, enum: ["ACTIVO", "INACTIVO"], required: true },
  },
  {
    timestamps: true,
  }
);

export const Comercio = model<IComercio>("Comercio", comercioSchema);
