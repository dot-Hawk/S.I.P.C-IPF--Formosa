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

// A producto is identified by nombre + marca + unidad + cantidadReferencia. Case-insensitive
// (collation strength 2) so "Leche" and "leche" collide. A missing marca counts as one value.
productoSchema.index(
  { nombre: 1, marca: 1, unidad: 1, cantidadReferencia: 1 },
  { unique: true, collation: { locale: "es", strength: 2 } },
);

export const Producto = model<IProducto>("Producto", productoSchema);
