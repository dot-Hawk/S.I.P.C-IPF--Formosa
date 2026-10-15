import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { type Request, type Response } from "express";
import { type Model } from "mongoose";
import { type IPrecioAuditoria } from "../models/interfaces/IPrecioAuditoria.interface.js";
import { createAuditoriaController } from "./auditoria.controller.js";

const ID = "507f1f77bcf86cd799439011";

function fakeResponse() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res;
}

function setup() {
  const captured: { filter?: unknown; sort?: unknown; skip?: number; limit?: number } = {};
  const query = {
    sort: (s: unknown) => {
      captured.sort = s;
      return query;
    },
    skip: (n: number) => {
      captured.skip = n;
      return query;
    },
    limit: async (n: number) => {
      captured.limit = n;
      return [{ accion: "CREACION" }];
    },
  };
  const model = {
    find: (filter: unknown) => {
      captured.filter = filter;
      return query;
    },
  };
  return { controller: createAuditoriaController(model as unknown as Model<IPrecioAuditoria>), captured };
}

describe("auditoria controller", () => {
  it("answers 400 on invalid filters", async () => {
    const { controller } = setup();
    const res = fakeResponse();

    await controller.listPrecios({ query: { precio: "x" } } as unknown as Request, res as unknown as Response);

    assert.equal(res.statusCode, 400);
  });

  it("filters, sorts newest first and paginates", async () => {
    const { controller, captured } = setup();
    const res = fakeResponse();

    await controller.listPrecios(
      { query: { precio: ID, accion: "ELIMINACION", page: "2", limit: "20", junk: "x" } } as unknown as Request,
      res as unknown as Response,
    );

    assert.deepEqual(captured.filter, { precio: ID, accion: "ELIMINACION" });
    assert.deepEqual(captured.sort, { createdAt: -1, _id: -1 });
    assert.equal(captured.skip, 20);
    assert.equal(captured.limit, 20);
    assert.equal(res.statusCode, 200);
  });

  it("uses the default page size", async () => {
    const { controller, captured } = setup();

    await controller.listPrecios({ query: {} } as unknown as Request, fakeResponse() as unknown as Response);

    assert.equal(captured.limit, 50);
    assert.equal(captured.skip, 0);
  });
});
