import "dotenv/config";
import mongoose from "mongoose";
import { seedCoordinador } from "../auth/seed-coordinador.service.js";
import { connectDB } from "../config/database.js";
import { User } from "../models/user.model.js";

async function main(): Promise<void> {
  await connectDB();

  const result = await seedCoordinador(User, {
    nombre: process.env["SEED_NOMBRE"],
    apellido: process.env["SEED_APELLIDO"],
    dni: process.env["SEED_DNI"],
    legajo: process.env["SEED_LEGAJO"],
    email: process.env["SEED_EMAIL"],
    password: process.env["SEED_PASSWORD"],
  });

  console.log(result.created ? "COORDINADOR user created" : `Seed skipped: ${result.reason}`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
