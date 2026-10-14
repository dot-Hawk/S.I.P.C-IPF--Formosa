import { describe, it } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { type Request, type Response } from "express";
import { type Model } from "mongoose";
import { verifyToken } from "../auth/token.service.js";
import { type IUser } from "../models/interfaces/IUser.interface.js";
import { createAuthController } from "./auth.controller.js";

const CONFIG = { secret: "test-secret", expiresIn: "1h" } as const;
const PASSWORD = "correct-horse";
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);

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

function fakeUser(overrides: Record<string, unknown> = {}) {
  const user = {
    _id: "64b000000000000000000001",
    nombre: "Ana",
    apellido: "Perez",
    role: "COORDINADOR",
    estado: "ACTIVO",
    passwordHash: PASSWORD_HASH,
    ultimoAcceso: undefined as Date | undefined,
    saved: false,
    async save() {
      user.saved = true;
    },
    ...overrides,
  };
  return user;
}

function login(user: object | null, body: unknown) {
  let queriedEmail: unknown;
  const model = {
    findOne: async (filter: { email: string }) => {
      queriedEmail = filter.email;
      return user;
    },
  } as unknown as Model<IUser>;
  const res = fakeResponse();

  return createAuthController(model, CONFIG)
    .login({ body } as unknown as Request, res as unknown as Response)
    .then(() => ({ res, queriedEmail }));
}

describe("auth controller login", () => {
  it("answers 400 when email or password are missing", async () => {
    const { res } = await login(null, { email: "a@b.com" });

    assert.equal(res.statusCode, 400);
  });

  it("answers 401 for an unknown email", async () => {
    const { res } = await login(null, { email: "nobody@x.com", password: PASSWORD });

    assert.equal(res.statusCode, 401);
  });

  it("answers 401 for a wrong password", async () => {
    const { res } = await login(fakeUser(), { email: "ana@x.com", password: "wrong" });

    assert.equal(res.statusCode, 401);
  });

  it("answers 401 for a user that is not ACTIVO", async () => {
    const { res } = await login(fakeUser({ estado: "INACTIVO" }), {
      email: "ana@x.com",
      password: PASSWORD,
    });

    assert.equal(res.statusCode, 401);
  });

  it("normalizes the email before querying", async () => {
    const { queriedEmail } = await login(null, { email: "  Ana@X.com ", password: PASSWORD });

    assert.equal(queriedEmail, "ana@x.com");
  });

  it("returns a verifiable token and updates ultimoAcceso on success", async () => {
    const user = fakeUser();

    const { res } = await login(user, { email: "ana@x.com", password: PASSWORD });

    const body = res.body as { token: string; user: Record<string, unknown> };
    assert.equal(res.statusCode, 200);
    assert.deepEqual(verifyToken(body.token, CONFIG.secret), {
      userId: "64b000000000000000000001",
      role: "COORDINADOR",
    });
    assert.equal(user.saved, true);
    assert.ok(user.ultimoAcceso instanceof Date);
    assert.equal("passwordHash" in body.user, false);
  });
});
