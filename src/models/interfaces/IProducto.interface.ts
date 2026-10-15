import { type Document } from "mongoose";

type UnidadProducto = "KG" | "G" | "LT" | "ML" | "UNIDAD";
type EstadoProducto = "ACTIVO" | "INACTIVO";

export interface IProducto extends Document {
  nombre: string;
  categoria: string;
  unidad: UnidadProducto;
  cantidadReferencia: number;
  marca?: string;
  estado: EstadoProducto;
  createdAt: Date;
  updatedAt: Date;
}
