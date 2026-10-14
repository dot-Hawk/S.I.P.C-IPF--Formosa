import { type Document } from "mongoose";

export const TIPOS_COMERCIO = ["SUPERMERCADO", "ALMACEN", "VERDULERIA", "CARNICERIA", "FARMACIA", "OTRO"] as const;
export const ESTADOS_COMERCIO = ["ACTIVO", "INACTIVO"] as const;

type TipoComercio = (typeof TIPOS_COMERCIO)[number];
type EstadoComercio = (typeof ESTADOS_COMERCIO)[number];

export interface IComercio extends Document {
  nombre: string;
  direccion: string;
  zona: string;
  tipo: TipoComercio;
  estado: EstadoComercio;
  createdAt: Date;
  updatedAt: Date;
}
