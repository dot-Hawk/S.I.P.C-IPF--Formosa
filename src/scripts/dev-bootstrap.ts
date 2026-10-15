import "dotenv/config";
import { randomBytes } from "node:crypto";
import { type AddressInfo } from "node:net";
import { seedCoordinador } from "../auth/seed-coordinador.service.js";
import { closeDb, connectDb, getDb } from "../db/index.js";
import { bootstrapDevData, type DevApi } from "../dev/dev-data.js";
import { createUserRepository } from "../repositories/user.repository.js";

// Prepares a local database to try the system by hand: the coordinator (from SEED_* env vars) and
// sample data created through the API. Run it once per database; running it again is harmless.
//
//   SEED_EMAIL=you@example.com SEED_PASSWORD=... npm run dev:bootstrap

const DEFAULT_ENCUESTADOR_PASSWORD = "encuestador-dev-1";
const ENCUESTADOR_EMAIL = "encuestador.dev@sipc.local";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required (set it in the environment, not in a file)`);
  return value;
}

async function main(): Promise<void> {
  const email = required("SEED_EMAIL");
  const password = required("SEED_PASSWORD");

  // Only this process uses the tokens it issues, so a throwaway secret is fine when none is set.
  process.env["JWT_SECRET"] ||= randomBytes(32).toString("hex");

  await connectDb();

  const seeded = await seedCoordinador(createUserRepository(getDb()), {
    nombre: process.env["SEED_NOMBRE"] ?? "Coordinador",
    apellido: process.env["SEED_APELLIDO"] ?? "Dev",
    dni: process.env["SEED_DNI"] ?? "90000000",
    legajo: process.env["SEED_LEGAJO"] ?? "DEV-COORD-1",
    email,
    password,
  });
  console.log(seeded.created ? "COORDINADOR user created" : `Coordinator seed skipped: ${seeded.reason}`);

  // The app is loaded after the environment is settled: its routes read the config on import.
  const { default: app } = await import("../app.js");
  const server = await new Promise<import("node:http").Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!login.ok) {
      throw new Error(
        `Could not log in as ${email} (${login.status}). If a coordinator already existed with another email or password, use those credentials.`,
      );
    }
    const { token } = (await login.json()) as { token: string };

    const call = async (method: string, path: string, body?: unknown) => {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const text = await response.text();
      return { status: response.status, body: text ? JSON.parse(text) : undefined };
    };
    const api: DevApi = { get: (path) => call("GET", path), post: (path, body) => call("POST", path, body) };

    const encuestadorPassword = process.env["DEV_ENCUESTADOR_PASSWORD"] ?? DEFAULT_ENCUESTADOR_PASSWORD;
    const summary = await bootstrapDevData(api, {
      encuestador: { email: ENCUESTADOR_EMAIL, password: encuestadorPassword },
    });

    console.log(`Relevamiento ${summary.periodo}`);
    console.log(
      `Created: ${summary.created.encuestador} surveyor, ${summary.created.relevamiento} relevamiento, ` +
        `${summary.created.comercios} comercios, ${summary.created.productos} productos, ` +
        `${summary.created.asignaciones} asignaciones`,
    );
    console.log(`Test surveyor: ${summary.encuestadorEmail} (password from DEV_ENCUESTADOR_PASSWORD, default "${DEFAULT_ENCUESTADOR_PASSWORD}")`);
  } finally {
    server.close();
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
