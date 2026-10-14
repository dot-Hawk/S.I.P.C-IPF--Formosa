import {type Document } from "mongoose";

export const ROLES = ["ENCUESTADOR", "SUPERVISOR", "ANALISTA", "COORDINADOR", "DIRECCION"] as const;
export type Role = (typeof ROLES)[number];
type EstadoUsuario = "ACTIVO" | "INACTIVO" | "LICENCIA";

export interface IUser extends Document {
  nombre: string;
  apellido: string;
  dni: string;
  legajo: string;
  email: string;
  passwordHash: string;
  role: Role;
  estado: EstadoUsuario;
  createdAt: Date;
  updatedAt: Date;
  ultimoAcceso?: Date;
}
