import { Schema, model } from "mongoose";
import { type IProducto } from "./interfaces/IProducto.interface.js";

const productoSchema = new Schema<IProducto>(
  {
    nombre: { type: String, required: true },
    categoria: { type: String, required: true },
    unidad: { type: String, enum: ["KG", "G", "LT", "ML", "UNIDAD"], required: true },
    cantidadReferencia: { type: Number, required: true, min: 0 },
    marca: { type: String, required: false },
    estado: { type: String, enum: ["ACTIVO", "INACTIVO"], required: true },
  },
  {
    timestamps: true,
  }
);

export const Producto = model<IProducto>("Producto", productoSchema);
