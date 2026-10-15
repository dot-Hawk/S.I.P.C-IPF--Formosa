import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { type NextFunction, type Request, type Response } from "express";
import { signToken } from "../auth/token.service.js";
import { createAuthenticate } from "./authenticate.middleware.js";
import { authorize } from "./authorize.middleware.js";

const SECRET = "test-secret";

interface FakeResponse {
  statusCode: number | undefined;
  body: unknown;
  locals: Record<string, unknown>;
  status(code: number): FakeResponse;
  json(payload: unknown): FakeResponse;
}

function fakeResponse(): FakeResponse {
  const res: FakeResponse = {
    statusCode: undefined,
    body: undefined,
    locals: {},
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

async function run(
  middleware: (req: Request, res: Response, next: NextFunction) => void | Promise<void>,
  headers: Record<string, string>,
  res: FakeResponse,
): Promise<boolean> {
  let nextCalled = false;
  await middleware(
    { headers } as unknown as Request,
    res as unknown as Response,
    () => {
      nextCalled = true;
    },
  );
  return nextCalled;
}

describe("authenticate", () => {
  let current: { id: string; role: string; estado: string } | null = {
    id: "u1",
    role: "SUPERVISOR",
    estado: "ACTIVO",
  };
  const authenticate = createAuthenticate(SECRET, { findById: async () => current } as never);
  const token = () => signToken({ userId: "u1", role: "SUPERVISOR" }, SECRET, "1h");

  it("answers 401 without an Authorization header", async () => {
    const res = fakeResponse();

    assert.equal(await run(authenticate, {}, res), false);
    assert.equal(res.statusCode, 401);
  });

  it("answers 401 on a non-Bearer scheme", async () => {
    const res = fakeResponse();

    assert.equal(await run(authenticate, { authorization: "Basic abc" }, res), false);
    assert.equal(res.statusCode, 401);
  });

  it("answers 401 on an invalid token", async () => {
    const res = fakeResponse();

    assert.equal(await run(authenticate, { authorization: "Bearer nope" }, res), false);
    assert.equal(res.statusCode, 401);
  });

  it("stores the identity in res.locals and calls next for a valid token of an active user", async () => {
    current = { id: "u1", role: "SUPERVISOR", estado: "ACTIVO" };
    const res = fakeResponse();

    assert.equal(await run(authenticate, { authorization: `Bearer ${token()}` }, res), true);
    assert.deepEqual(res.locals["auth"], { userId: "u1", role: "SUPERVISOR" });
  });

  it("takes the role from the database, so a role change applies to tokens already issued", async () => {
    current = { id: "u1", role: "ANALISTA", estado: "ACTIVO" };
    const res = fakeResponse();

    assert.equal(await run(authenticate, { authorization: `Bearer ${token()}` }, res), true);
    assert.deepEqual(res.locals["auth"], { userId: "u1", role: "ANALISTA" });
  });

  it("answers 401 when the user was deactivated, put on leave or no longer exists", async () => {
    for (const state of [{ id: "u1", role: "SUPERVISOR", estado: "INACTIVO" }, { id: "u1", role: "SUPERVISOR", estado: "LICENCIA" }, null]) {
      current = state;
      const res = fakeResponse();

      assert.equal(await run(authenticate, { authorization: `Bearer ${token()}` }, res), false);
      assert.equal(res.statusCode, 401);
    }
  });
});

describe("authorize", () => {
  it("answers 401 when there is no authenticated user", async () => {
    const res = fakeResponse();

    assert.equal(await run(authorize("COORDINADOR"), {}, res), false);
    assert.equal(res.statusCode, 401);
  });

  it("answers 403 when the role is not allowed", async () => {
    const res = fakeResponse();
    res.locals["auth"] = { userId: "u1", role: "DIRECCION" };

    assert.equal(await run(authorize("COORDINADOR"), {}, res), false);
    assert.equal(res.statusCode, 403);
  });

  it("calls next when the role is allowed", async () => {
    const res = fakeResponse();
    res.locals["auth"] = { userId: "u1", role: "COORDINADOR" };

    assert.equal(await run(authorize("COORDINADOR", "ANALISTA"), {}, res), true);
  });
});
