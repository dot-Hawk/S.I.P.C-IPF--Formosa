import { type Document } from "mongoose";

export const UNIDADES_PRODUCTO = ["KG", "G", "LT", "ML", "UNIDAD"] as const;
export const ESTADOS_PRODUCTO = ["ACTIVO", "INACTIVO"] as const;

type UnidadProducto = (typeof UNIDADES_PRODUCTO)[number];
type EstadoProducto = (typeof ESTADOS_PRODUCTO)[number];

export interface IProducto extends Document {
  nombre: string;
  categoria: string;
  unidad: UnidadProducto;
  cantidadReferencia: number;
  marca?: string;
  // 7 digit codigo of the variedad of the canasta this producto is a sample of.
  codigoVariedad: string;
  estado: EstadoProducto;
  createdAt: Date;
  updatedAt: Date;
}
