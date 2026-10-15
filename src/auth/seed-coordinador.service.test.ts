import { describe, it } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { type UserRepository } from "../repositories/user.repository.js";
import { seedCoordinador } from "./seed-coordinador.service.js";

const INPUT = {
  nombre: "Ana",
  apellido: "Perez",
  dni: "30123456",
  legajo: "L-100",
  email: "ana@example.com",
  password: "long-enough-password",
};

function fakeModel(coordinadorExists: boolean) {
  const created: Record<string, unknown>[] = [];
  const model = {
    hasRole: async () => coordinadorExists,
    create: async (data: Record<string, unknown>) => {
      created.push(data);
      return data;
    },
  };
  return { model: model as unknown as UserRepository, created };
}

describe("seedCoordinador", () => {
  it("creates an ACTIVO COORDINADOR with a hashed password", async () => {
    const { model, created } = fakeModel(false);

    const result = await seedCoordinador(model, INPUT);

    assert.deepEqual(result, { created: true });
    assert.equal(created.length, 1);
    assert.equal(created[0]?.["role"], "COORDINADOR");
    assert.equal(created[0]?.["estado"], "ACTIVO");
    assert.notEqual(created[0]?.["passwordHash"], INPUT.password);
    assert.ok(await bcrypt.compare(INPUT.password, String(created[0]?.["passwordHash"])));
  });

  it("does nothing when a COORDINADOR already exists", async () => {
    const { model, created } = fakeModel(true);

    const result = await seedCoordinador(model, INPUT);

    assert.equal(result.created, false);
    assert.equal(created.length, 0);
  });

  it("throws on invalid input without touching the database", async () => {
    const { model, created } = fakeModel(false);

    await assert.rejects(
      seedCoordinador(model, { ...INPUT, email: undefined, password: "short" }),
      /email.*password|password.*email/s,
    );
    assert.equal(created.length, 0);
  });
});
