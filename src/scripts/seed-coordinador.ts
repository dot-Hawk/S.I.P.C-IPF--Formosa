import "dotenv/config";
import { seedCoordinador } from "../auth/seed-coordinador.service.js";
import { closeDb, connectDb, getDb } from "../db/index.js";
import { createUserRepository } from "../repositories/user.repository.js";

async function main(): Promise<void> {
  await connectDb();

  const result = await seedCoordinador(createUserRepository(getDb()), {
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
  .finally(() => closeDb());
