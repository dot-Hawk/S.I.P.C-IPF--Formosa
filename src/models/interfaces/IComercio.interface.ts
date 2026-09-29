import { type Document } from "mongoose";

type TipoComercio = "SUPERMERCADO" | "ALMACEN" | "VERDULERIA" | "CARNICERIA" | "FARMACIA" | "OTRO";
type EstadoComercio = "ACTIVO" | "INACTIVO";

export interface IComercio extends Document {
  nombre: string;
  direccion: string;
  zona: string;
  tipo: TipoComercio;
  estado: EstadoComercio;
  createdAt: Date;
  updatedAt: Date;
}
