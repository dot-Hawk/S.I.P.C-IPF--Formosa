import { describe, it } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { verifyToken } from "../auth/token.service.js";
import { type UserRepository } from "../repositories/user.repository.js";
import { invoke } from "../testing/http.js";
import { createAuthController } from "./auth.controller.js";

const CONFIG = { secret: "test-secret", expiresIn: "1h" } as const;
const PASSWORD = "correct-horse";
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);
const USER_ID = "00000000-0000-4000-8000-000000000001";

function fakeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    nombre: "Ana",
    apellido: "Perez",
    role: "COORDINADOR",
    estado: "ACTIVO",
    passwordHash: PASSWORD_HASH,
    ...overrides,
  };
}

async function login(user: object | null, body: unknown) {
  const calls = { email: undefined as unknown, touched: [] as [string, Date][] };
  const repo = {
    findByEmail: async (email: string) => {
      calls.email = email;
      return user;
    },
    touchLastAccess: async (id: string, at: Date) => {
      calls.touched.push([id, at]);
    },
  } as unknown as UserRepository;

  const res = await invoke(createAuthController(repo, CONFIG).login, { body });
  return { res, calls };
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

  it("answers 401 for a user that is not ACTIVO and does not touch ultimoAcceso", async () => {
    const { res, calls } = await login(fakeUser({ estado: "INACTIVO" }), {
      email: "ana@x.com",
      password: PASSWORD,
    });

    assert.equal(res.statusCode, 401);
    assert.equal(calls.touched.length, 0);
  });

  it("normalizes the email before querying", async () => {
    const { calls } = await login(null, { email: "  Ana@X.com ", password: PASSWORD });

    assert.equal(calls.email, "ana@x.com");
  });

  it("returns a verifiable token and updates ultimoAcceso on success", async () => {
    const { res, calls } = await login(fakeUser(), { email: "ana@x.com", password: PASSWORD });

    const body = res.body as { token: string; user: Record<string, unknown> };
    assert.equal(res.statusCode, 200);
    assert.deepEqual(verifyToken(body.token, CONFIG.secret), { userId: USER_ID, role: "COORDINADOR" });
    assert.equal(calls.touched.length, 1);
    assert.equal(calls.touched[0]?.[0], USER_ID);
    assert.ok(calls.touched[0]?.[1] instanceof Date);
    assert.equal("passwordHash" in body.user, false);
  });
});
