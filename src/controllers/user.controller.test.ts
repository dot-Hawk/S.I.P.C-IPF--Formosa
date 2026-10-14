import { describe, it } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { type Request, type Response } from "express";
import { type Model } from "mongoose";
import { type IUser } from "../models/interfaces/IUser.interface.js";
import { createUserController } from "./user.controller.js";

interface FakeResponse {
  statusCode: number;
  body: unknown;
  status(code: number): FakeResponse;
  json(payload: unknown): FakeResponse;
}

function fakeResponse(): FakeResponse {
  const res: FakeResponse = {
    statusCode: 200,
    body: undefined,
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(payload) {
      res.body = payload;
      return res;
    },
  };
  return res;
}

const BODY = {
  nombre: "Ana",
  apellido: "Perez",
  dni: "30123456",
  legajo: "L-100",
  email: "ana@example.com",
  password: "long-enough-password",
  role: "ANALISTA",
};

function create(model: object, body: Record<string, unknown> = BODY) {
  const res = fakeResponse();
  return createUserController(model as unknown as Model<IUser>)
    .create({ body } as unknown as Request, res as unknown as Response)
    .then(() => res);
}

describe("user controller create", () => {
  it("hashes the password, forces ACTIVO and never returns the hash", async () => {
    let received: Record<string, unknown> | undefined;
    const model = {
      create: async (data: Record<string, unknown>) => {
        received = data;
        return { _id: "64b000000000000000000001", ...data };
      },
    };

    const res = await create(model, { ...BODY, estado: "INACTIVO" });

    assert.equal(res.statusCode, 201);
    assert.equal(received?.["estado"], "ACTIVO");
    assert.notEqual(received?.["passwordHash"], BODY.password);
    assert.ok(await bcrypt.compare(BODY.password, String(received?.["passwordHash"])));
    assert.equal("passwordHash" in (res.body as object), false);
    assert.equal("password" in (res.body as object), false);
  });

  it("answers 409 on duplicate dni, legajo or email", async () => {
    const model = {
      create: async () => {
        throw Object.assign(new Error("duplicate"), { code: 11000 });
      },
    };

    assert.equal((await create(model)).statusCode, 409);
  });

  it("answers 400 on a mongoose validation error", async () => {
    const model = {
      create: async () => {
        throw Object.assign(new Error("invalid"), { name: "ValidationError" });
      },
    };

    assert.equal((await create(model)).statusCode, 400);
  });

  it("rethrows unexpected errors", async () => {
    const model = {
      create: async () => {
        throw new Error("connection lost");
      },
    };

    await assert.rejects(create(model), /connection lost/);
  });
});
