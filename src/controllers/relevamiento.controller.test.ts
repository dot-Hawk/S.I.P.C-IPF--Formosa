import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { type Request, type Response } from "express";
import { type Model } from "mongoose";
import { type IRelevamiento } from "../models/interfaces/IRelevamiento.interface.js";
import { createRelevamientoController } from "./relevamiento.controller.js";

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

function asModel(fake: object): Model<IRelevamiento> {
  return fake as unknown as Model<IRelevamiento>;
}

function asRequest(fake: object): Request {
  return fake as unknown as Request;
}

function asResponse(fake: FakeResponse): Response {
  return fake as unknown as Response;
}

const VALID_ID = "507f1f77bcf86cd799439011";

describe("relevamiento controller", () => {
  describe("create", () => {
    it("creates the relevamiento as ABIERTO and answers 201", async () => {
      let received: Record<string, unknown> | undefined;
      const model = asModel({
        create: async (data: Record<string, unknown>) => {
          received = data;
          return data;
        },
      });
      const res = fakeResponse();
      const body = {
        periodo: "2026-10",
        frecuencia: "MENSUAL",
        fechaInicio: "2026-10-01",
        fechaLimite: "2026-10-31",
        estado: "CERRADO",
      };

      await createRelevamientoController(model).create(asRequest({ body }), asResponse(res));

      assert.equal(res.statusCode, 201);
      assert.equal(received?.["estado"], "ABIERTO");
    });

    it("answers 409 on duplicate periodo and frecuencia", async () => {
      const model = asModel({
        create: async () => {
          throw Object.assign(new Error("duplicate"), { code: 11000 });
        },
      });
      const res = fakeResponse();

      await createRelevamientoController(model).create(asRequest({ body: {} }), asResponse(res));

      assert.equal(res.statusCode, 409);
    });

    it("answers 400 on a mongoose validation error", async () => {
      const model = asModel({
        create: async () => {
          throw Object.assign(new Error("fechaInicio is required"), { name: "ValidationError" });
        },
      });
      const res = fakeResponse();

      await createRelevamientoController(model).create(asRequest({ body: {} }), asResponse(res));

      assert.equal(res.statusCode, 400);
    });

    it("rethrows unexpected errors", async () => {
      const model = asModel({
        create: async () => {
          throw new Error("connection lost");
        },
      });

      await assert.rejects(
        createRelevamientoController(model).create(asRequest({ body: {} }), asResponse(fakeResponse())),
        /connection lost/,
      );
    });
  });

  describe("list", () => {
    it("returns the relevamientos sorted by fechaInicio desc", async () => {
      let sortArg: unknown;
      const items = [{ periodo: "2026-10" }];
      const model = asModel({
        find: () => ({
          sort: async (arg: unknown) => {
            sortArg = arg;
            return items;
          },
        }),
      });
      const res = fakeResponse();

      await createRelevamientoController(model).list(asRequest({}), asResponse(res));

      assert.deepEqual(sortArg, { fechaInicio: -1 });
      assert.deepEqual(res.body, items);
    });
  });

  describe("getById", () => {
    it("answers 400 on an invalid id", async () => {
      const res = fakeResponse();

      await createRelevamientoController(asModel({})).getById(
        asRequest({ params: { id: "not-an-id" } }),
        asResponse(res),
      );

      assert.equal(res.statusCode, 400);
    });

    it("answers 404 when it does not exist", async () => {
      const model = asModel({ findById: async () => null });
      const res = fakeResponse();

      await createRelevamientoController(model).getById(
        asRequest({ params: { id: VALID_ID } }),
        asResponse(res),
      );

      assert.equal(res.statusCode, 404);
    });

    it("returns the relevamiento when it exists", async () => {
      const found = { periodo: "2026-10" };
      const model = asModel({ findById: async () => found });
      const res = fakeResponse();

      await createRelevamientoController(model).getById(
        asRequest({ params: { id: VALID_ID } }),
        asResponse(res),
      );

      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body, found);
    });
  });
});
