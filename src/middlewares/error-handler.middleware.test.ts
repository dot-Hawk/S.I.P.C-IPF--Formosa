import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { type NextFunction, type Request, type Response } from "express";
import { errorHandler, notFoundHandler } from "./error-handler.middleware.js";

interface FakeResponse {
  statusCode: number | undefined;
  body: unknown;
  headersSent: boolean;
  status(code: number): FakeResponse;
  json(payload: unknown): FakeResponse;
}

function fakeResponse(headersSent = false): FakeResponse {
  const res: FakeResponse = {
    statusCode: undefined,
    body: undefined,
    headersSent,
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

function handle(error: unknown, res = fakeResponse()) {
  let forwarded: unknown;
  errorHandler(error, {} as Request, res as unknown as Response, ((e?: unknown) => {
    forwarded = e;
  }) as NextFunction);
  return { res, forwarded };
}

describe("errorHandler", () => {
  it("answers 400 with a safe message for malformed JSON, without leaking details", () => {
    const error = Object.assign(new SyntaxError("Unexpected token at /home/user/app/secret.js"), {
      status: 400,
      type: "entity.parse.failed",
      stack: "at /home/user/app/node_modules/body-parser",
    });

    const { res } = handle(error);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { message: "Malformed JSON body" });
  });

  it("keeps other 4xx statuses with a generic message", () => {
    const { res } = handle(Object.assign(new Error("secret detail"), { status: 413, type: "entity.too.large" }));

    assert.equal(res.statusCode, 413);
    assert.deepEqual(res.body, { message: "Request body is too large" });
  });

  it("answers 500 with a generic message for unexpected errors and logs them", () => {
    const log = mock.method(console, "error", () => {});

    const { res } = handle(new Error("connection string mongodb://user:pass@host"));

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { message: "Internal server error" });
    assert.equal(log.mock.callCount(), 1);
    log.mock.restore();
  });

  it("does not turn a 5xx status into a client error", () => {
    const log = mock.method(console, "error", () => {});

    const { res } = handle(Object.assign(new Error("boom"), { status: 503 }));

    assert.equal(res.statusCode, 500);
    log.mock.restore();
  });

  it("delegates to Express when headers were already sent", () => {
    const error = new Error("late");

    const { res, forwarded } = handle(error, fakeResponse(true));

    assert.equal(res.statusCode, undefined);
    assert.equal(forwarded, error);
  });
});

describe("notFoundHandler", () => {
  it("answers 404 with JSON", () => {
    const res = fakeResponse();

    notFoundHandler({} as Request, res as unknown as Response);

    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { message: "Route not found" });
  });
});
