import { Schema, model } from "mongoose";
import { type IPrecio } from "./interfaces/IPrecio.interface.js";

const precioSchema = new Schema<IPrecio>(
  {
    relevamiento: { type: Schema.Types.ObjectId, ref: "Relevamiento", required: true },
    producto: { type: Schema.Types.ObjectId, ref: "Producto", required: true },
    comercio: { type: Schema.Types.ObjectId, ref: "Comercio", required: true },
    encuestador: { type: Schema.Types.ObjectId, ref: "User", required: true },
    valor: { type: Number, required: true, min: 0 },
    fechaRelevamiento: { type: Date, required: true },
    observacion: { type: String, required: false },
  },
  {
    timestamps: true,
  }
);

precioSchema.index({ relevamiento: 1, producto: 1, comercio: 1 }, { unique: true });

export const Precio = model<IPrecio>("Precio", precioSchema);
