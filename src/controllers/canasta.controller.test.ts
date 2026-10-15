import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { type Request, type Response } from "express";
import { type Model } from "mongoose";
import { type ICanastaNodo } from "../models/interfaces/ICanastaNodo.interface.js";
import { createCanastaController } from "./canasta.controller.js";

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

function controller(model: object) {
  return createCanastaController(model as unknown as Model<ICanastaNodo>);
}

async function call(
  handler: (req: Request, res: Response) => Promise<void>,
  req: object,
): Promise<FakeResponse> {
  const res = fakeResponse();
  await handler(req as Request, res as unknown as Response);
  return res;
}

const PRODUCTO = { codigo: "11111", nivel: 5, estado: "ACTIVO" };
const BODY = { codigo: "1111199", nombre: " Pan nuevo ", padre: "11111", categoria: "NUCLEO" };

describe("canasta controller", () => {
  describe("list", () => {
    it("answers 400 on invalid filters", async () => {
      const res = await call(controller({}).list, { query: { nivel: "9" } });

      assert.equal(res.statusCode, 400);
    });

    it("applies the provided filters (nivel as number) and sorts by codigo", async () => {
      let filter: unknown;
      let sort: unknown;
      const model = {
        find: (f: unknown) => {
          filter = f;
          return {
            sort: async (s: unknown) => {
              sort = s;
              return [];
            },
          };
        },
      };

      await call(controller(model).list, {
        query: { nivel: "6", padre: " 11111 ", categoria: "NUCLEO", estado: "ACTIVO", junk: "x" },
      });

      assert.deepEqual(filter, { nivel: 6, padre: "11111", categoria: "NUCLEO", estado: "ACTIVO" });
      assert.deepEqual(sort, { codigo: 1 });
    });
  });

  describe("getByCodigo", () => {
    it("answers 400, 404 and 200 appropriately", async () => {
      const found = controller({ findOne: async () => ({ codigo: "11111" }) });
      const missing = controller({ findOne: async () => null });

      assert.equal((await call(found.getByCodigo, { params: { codigo: "abc" } })).statusCode, 400);
      assert.equal((await call(missing.getByCodigo, { params: { codigo: "11111" } })).statusCode, 404);
      assert.equal((await call(found.getByCodigo, { params: { codigo: "11111" } })).statusCode, 200);
    });
  });

  describe("createVariedad", () => {
    it("creates a nivel 6 ACTIVO variedad under an active producto, trimming and ignoring extras", async () => {
      let created: Record<string, unknown> | undefined;
      const model = {
        findOne: async () => PRODUCTO,
        create: async (data: Record<string, unknown>) => {
          created = data;
          return data;
        },
      };

      const res = await call(controller(model).createVariedad, {
        body: { ...BODY, ponderador: 0.02, derivado: true, nivel: 2, estado: "INACTIVO" },
      });

      assert.equal(res.statusCode, 201);
      assert.deepEqual(created, {
        codigo: "1111199",
        nombre: "Pan nuevo",
        nivel: 6,
        padre: "11111",
        ponderador: 0.02,
        derivado: false,
        estado: "ACTIVO",
        categoria: "NUCLEO",
      });
    });

    it("answers 400 when the padre is not an active producto", async () => {
      const missing = controller({ findOne: async () => null });
      const wrongLevel = controller({ findOne: async () => ({ ...PRODUCTO, nivel: 4 }) });
      const inactive = controller({ findOne: async () => ({ ...PRODUCTO, estado: "INACTIVO" }) });

      for (const c of [missing, wrongLevel, inactive]) {
        const res = await call(c.createVariedad, { body: BODY });
        assert.equal(res.statusCode, 400);
      }
    });

    it("answers 409 when the codigo already exists", async () => {
      const model = {
        findOne: async () => PRODUCTO,
        create: async () => {
          throw Object.assign(new Error("E11000"), { code: 11000 });
        },
      };

      const res = await call(controller(model).createVariedad, { body: BODY });

      assert.equal(res.statusCode, 409);
    });
  });

  describe("setEstado", () => {
    it("updates only variedades and answers 404 otherwise", async () => {
      let filter: unknown;
      let update: unknown;
      const model = {
        findOneAndUpdate: async (f: unknown, u: unknown) => {
          filter = f;
          update = u;
          return { codigo: "1111101", estado: "INACTIVO" };
        },
      };

      const ok = await call(controller(model).setEstado, {
        params: { codigo: "1111101" },
        body: { estado: "INACTIVO", nombre: "hack" },
      });
      const missing = await call(controller({ findOneAndUpdate: async () => null }).setEstado, {
        params: { codigo: "1111101" },
        body: { estado: "INACTIVO" },
      });

      assert.equal(ok.statusCode, 200);
      assert.deepEqual(filter, { codigo: "1111101", nivel: 6 });
      assert.deepEqual(update, { $set: { estado: "INACTIVO" } });
      assert.equal(missing.statusCode, 404);
    });

    it("answers 400 on an invalid codigo", async () => {
      const res = await call(controller({}).setEstado, { params: { codigo: "x" }, body: { estado: "ACTIVO" } });

      assert.equal(res.statusCode, 400);
    });
  });
});
