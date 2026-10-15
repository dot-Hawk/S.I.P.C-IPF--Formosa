import { describe, it } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { type UserRepository } from "../repositories/user.repository.js";
import { invoke } from "../testing/http.js";
import { createUserController } from "./user.controller.js";

const BODY = {
  nombre: "Ana",
  apellido: "Perez",
  dni: "30123456",
  legajo: "L-100",
  email: "ana@example.com",
  password: "long-enough-password",
  role: "ANALISTA",
};

function create(repo: Partial<UserRepository>, body: Record<string, unknown> = BODY) {
  return invoke(createUserController(repo as UserRepository).create, { body });
}

describe("user controller create", () => {
  it("hashes the password, forces ACTIVO and never returns the hash", async () => {
    let received: Record<string, unknown> | undefined;
    const repo = {
      create: async (data: Record<string, unknown>) => {
        received = data;
        return { id: "u-1", ...data };
      },
    };

    const res = await create(repo as unknown as Partial<UserRepository>, { ...BODY, estado: "INACTIVO" });

    assert.equal(res.statusCode, 201);
    assert.equal(received?.["estado"], "ACTIVO");
    assert.notEqual(received?.["passwordHash"], BODY.password);
    assert.ok(await bcrypt.compare(BODY.password, String(received?.["passwordHash"])));
    assert.equal((res.body as { id: string }).id, "u-1");
    assert.equal("passwordHash" in (res.body as object), false);
    assert.equal("password" in (res.body as object), false);
  });

  it("stores the email trimmed and lowercase", async () => {
    let received: Record<string, unknown> | undefined;
    const repo = {
      create: async (data: Record<string, unknown>) => {
        received = data;
        return { id: "u-1", ...data };
      },
    };

    await create(repo as unknown as Partial<UserRepository>, { ...BODY, email: "  Ana@Example.COM " });

    assert.equal(received?.["email"], "ana@example.com");
  });

  it("answers 409 on duplicate dni, legajo or email", async () => {
    const repo = {
      create: async () => {
        throw Object.assign(new Error("Failed query"), { cause: { code: "23505" } });
      },
    };

    assert.equal((await create(repo as unknown as Partial<UserRepository>)).statusCode, 409);
  });

  it("rethrows unexpected errors", async () => {
    const repo = {
      create: async () => {
        throw new Error("connection lost");
      },
    };

    await assert.rejects(create(repo as unknown as Partial<UserRepository>), /connection lost/);
  });
});
