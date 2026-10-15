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

function run(
  middleware: (req: Request, res: Response, next: NextFunction) => void,
  headers: Record<string, string>,
  res: FakeResponse,
): boolean {
  let nextCalled = false;
  middleware(
    { headers } as unknown as Request,
    res as unknown as Response,
    () => {
      nextCalled = true;
    },
  );
  return nextCalled;
}

describe("authenticate", () => {
  const authenticate = createAuthenticate(SECRET);

  it("answers 401 without an Authorization header", () => {
    const res = fakeResponse();

    assert.equal(run(authenticate, {}, res), false);
    assert.equal(res.statusCode, 401);
  });

  it("answers 401 on a non-Bearer scheme", () => {
    const res = fakeResponse();

    assert.equal(run(authenticate, { authorization: "Basic abc" }, res), false);
    assert.equal(res.statusCode, 401);
  });

  it("answers 401 on an invalid token", () => {
    const res = fakeResponse();

    assert.equal(run(authenticate, { authorization: "Bearer nope" }, res), false);
    assert.equal(res.statusCode, 401);
  });

  it("stores the payload in res.locals and calls next on a valid token", () => {
    const res = fakeResponse();
    const token = signToken({ userId: "u1", role: "SUPERVISOR" }, SECRET, "1h");

    assert.equal(run(authenticate, { authorization: `Bearer ${token}` }, res), true);
    assert.deepEqual(res.locals["auth"], { userId: "u1", role: "SUPERVISOR" });
  });
});

describe("authorize", () => {
  it("answers 401 when there is no authenticated user", () => {
    const res = fakeResponse();

    assert.equal(run(authorize("COORDINADOR"), {}, res), false);
    assert.equal(res.statusCode, 401);
  });

  it("answers 403 when the role is not allowed", () => {
    const res = fakeResponse();
    res.locals["auth"] = { userId: "u1", role: "DIRECCION" };

    assert.equal(run(authorize("COORDINADOR"), {}, res), false);
    assert.equal(res.statusCode, 403);
  });

  it("calls next when the role is allowed", () => {
    const res = fakeResponse();
    res.locals["auth"] = { userId: "u1", role: "COORDINADOR" };

    assert.equal(run(authorize("COORDINADOR", "ANALISTA"), {}, res), true);
  });
});
