import bcrypt from "bcryptjs";
import { type Model } from "mongoose";
import { type IUser } from "../models/interfaces/IUser.interface.js";
import { validateUserInput } from "../validators/user.validator.js";

const BCRYPT_ROUNDS = 10;

export interface SeedCoordinadorInput {
  nombre: string | undefined;
  apellido: string | undefined;
  dni: string | undefined;
  legajo: string | undefined;
  email: string | undefined;
  password: string | undefined;
}

export type SeedCoordinadorResult = { created: true } | { created: false; reason: string };

export async function seedCoordinador(
  userModel: Model<IUser>,
  input: SeedCoordinadorInput,
): Promise<SeedCoordinadorResult> {
  const validation = validateUserInput({ ...input, role: "COORDINADOR" });
  if (!validation.valid) {
    const details = validation.errors.map((e) => `${e.field}: ${e.message}`).join("; ");
    throw new Error(`Invalid seed input - ${details}`);
  }

  if (await userModel.exists({ role: "COORDINADOR" })) {
    return { created: false, reason: "a COORDINADOR user already exists" };
  }

  // validateUserInput above guarantees every field is a non-empty string
  const { nombre, apellido, dni, legajo, email, password } = input as Record<keyof SeedCoordinadorInput, string>;
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  await userModel.create({
    nombre,
    apellido,
    dni,
    legajo,
    email,
    passwordHash,
    role: "COORDINADOR",
    estado: "ACTIVO",
  });

  return { created: true };
}
