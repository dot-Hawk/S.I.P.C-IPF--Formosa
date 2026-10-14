import { type Document } from "mongoose";

// Level 0 is the whole basket and level 6 is the variedad, the lowest level that is priced.
export const NIVELES_CANASTA = [
  "NIVEL_GENERAL",
  "DIVISION",
  "GRUPO",
  "CLASE",
  "SUBCLASE",
  "PRODUCTO",
  "VARIEDAD",
] as const;

// Not hierarchical: every variedad belongs to exactly one of these.
export const CATEGORIAS_CANASTA = ["NUCLEO", "ESTACIONAL", "REGULADO"] as const;
export const ESTADOS_CANASTA = ["ACTIVO", "INACTIVO"] as const;

export type CategoriaCanasta = (typeof CATEGORIAS_CANASTA)[number];
export type EstadoCanasta = (typeof ESTADOS_CANASTA)[number];

export const NIVEL_VARIEDAD = 6;

export interface ICanastaNodo extends Document {
  codigo: string;
  nombre: string;
  nivel: number;
  padre: string | null;
  ponderador: number;
  // Rebuilt from its variedades because the official spreadsheets have no row for it.
  derivado: boolean;
  estado: EstadoCanasta;
  categoria?: CategoriaCanasta;
  codigoVariedad12?: string;
  tratamientoEspecial?: boolean;
  createdAt: Date;
  updatedAt: Date;
}
