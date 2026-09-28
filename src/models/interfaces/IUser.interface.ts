import {type Document } from "mongoose";

type Role = "ENCUESTADOR" | "SUPERVISOR" | "ANALÍSTA";
type EstadoUsuario = "ACTIVO" | "INACTIVO" | "LICENCIA";

export interface IUser extends Document {
  name: string;
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
