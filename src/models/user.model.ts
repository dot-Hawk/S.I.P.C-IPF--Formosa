import { Schema, model } from "mongoose";
import {type IUser } from "./interfaces/IUser.interface.js";

export const UserModel = new Schema<IUser>(
  {
    nombre: { type: String, required: true },
    apellido: { type: String, required: true },
    dni: { type: String, required: true },
    legajo: { type: String, required: true },
    email: { type: String, required: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["ENCUESTADOR", "SUPERVISOR", "ANALISTA"], required: true },
    estado: { type: String, enum: ["ACTIVO", "INACTIVO", "LICENCIA"], required: true },
    ultimoAcceso: { type: Date, required: false },
  },
  { timestamps: true },
);

export const User = model<IUser>("User", UserModel);
