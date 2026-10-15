import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { type Request, type Response } from "express";
import { type Model } from "mongoose";
import { type IProducto } from "../models/interfaces/IProducto.interface.js";
import { type ICanastaNodo } from "../models/interfaces/ICanastaNodo.interface.js";
import { createProductoController } from "./producto.controller.js";

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

const VALID_ID = "507f1f77bcf86cd799439011";

const EXISTING_VARIEDAD = { exists: async () => ({ _id: "v" }) };
const MISSING_VARIEDAD = { exists: async () => null };

function controller(model: object, canasta: object = EXISTING_VARIEDAD) {
  return createProductoController(
    model as unknown as Model<IProducto>,
    canasta as unknown as Model<ICanastaNodo>,
  );
}

async function call(
  handler: (req: Request, res: Response) => Promise<void>,
  req: object,
): Promise<FakeResponse> {
  const res = fakeResponse();
  await handler(req as Request, res as unknown as Response);
  return res;
}

describe("producto controller", () => {
  describe("create", () => {
    it("trims text, forces ACTIVO and drops unknown fields", async () => {
      let received: Record<string, unknown> | undefined;
      const model = {
        create: async (data: Record<string, unknown>) => {
          received = data;
          return data;
        },
      };

      const res = await call(controller(model).create, {
        body: {
          nombre: " Arroz ",
          categoria: "Almacen ",
          unidad: "KG",
          cantidadReferencia: 1,
          marca: " Gallo",
          codigoVariedad: " 1111101 ",
          estado: "INACTIVO",
          _id: "hack",
        },
      });

      assert.equal(res.statusCode, 201);
      assert.deepEqual(received, {
        nombre: "Arroz",
        categoria: "Almacen",
        unidad: "KG",
        cantidadReferencia: 1,
        marca: "Gallo",
        codigoVariedad: "1111101",
        estado: "ACTIVO",
      });
    });

    it("checks the variedad is an active nivel 6 node of the canasta", async () => {
      let filter: unknown;
      const canasta = {
        exists: async (f: unknown) => {
          filter = f;
          return { _id: "v" };
        },
      };
      const model = { create: async (data: object) => data };

      await call(controller(model, canasta).create, {
        body: { nombre: "a", categoria: "b", unidad: "KG", cantidadReferencia: 1, codigoVariedad: "1111101" },
      });

      assert.deepEqual(filter, { codigo: "1111101", nivel: 6, estado: "ACTIVO" });
    });

    it("answers 400 when the variedad does not exist or is inactive", async () => {
      let created = false;
      const model = {
        create: async () => {
          created = true;
        },
      };

      const res = await call(controller(model, MISSING_VARIEDAD).create, {
        body: { nombre: "a", categoria: "b", unidad: "KG", cantidadReferencia: 1, codigoVariedad: "9999999" },
      });

      assert.equal(res.statusCode, 400);
      assert.equal(created, false);
    });

    it("omits marca when it is not provided", async () => {
      let received: Record<string, unknown> | undefined;
      const model = {
        create: async (data: Record<string, unknown>) => {
          received = data;
          return data;
        },
      };

      await call(controller(model).create, {
        body: { nombre: "Arroz", categoria: "Almacen", unidad: "KG", cantidadReferencia: 1 },
      });

      assert.equal(received !== undefined && "marca" in received, false);
    });

    it("answers 409 when an equal producto already exists", async () => {
      const model = {
        create: async () => {
          throw Object.assign(new Error("E11000 duplicate key"), { code: 11000 });
        },
      };

      const res = await call(controller(model).create, {
        body: { nombre: "Leche", categoria: "Lacteos", unidad: "LT", cantidadReferencia: 1, codigoVariedad: "1111101" },
      });

      assert.equal(res.statusCode, 409);
      assert.deepEqual(res.body, { message: "A producto with the same nombre, marca, unidad and cantidadReferencia already exists" });
    });

    it("answers 400 on a mongoose validation error", async () => {
      const model = {
        create: async () => {
          throw Object.assign(new Error("invalid"), { name: "ValidationError" });
        },
      };

      const res = await call(controller(model).create, { body: {} });

      assert.equal(res.statusCode, 400);
    });
  });

  describe("list", () => {
    it("answers 400 on invalid filters", async () => {
      const res = await call(controller({}).list, { query: { unidad: "TON" } });

      assert.equal(res.statusCode, 400);
    });

    it("applies only the provided filters and sorts by nombre", async () => {
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

      await call(controller(model).list, { query: { categoria: "Almacen", estado: "ACTIVO" } });

      assert.deepEqual(filter, { categoria: "Almacen", estado: "ACTIVO" });
      assert.deepEqual(sort, { nombre: 1 });
    });
  });

  describe("getById", () => {
    it("answers 400, 404 and 200 appropriately", async () => {
      assert.equal((await call(controller({}).getById, { params: { id: "x" } })).statusCode, 400);

      const missing = { findById: async () => null };
      assert.equal((await call(controller(missing).getById, { params: { id: VALID_ID } })).statusCode, 404);

      const found = { findById: async () => ({ nombre: "Arroz" }) };
      assert.equal((await call(controller(found).getById, { params: { id: VALID_ID } })).statusCode, 200);
    });
  });

  describe("update", () => {
    it("only sets whitelisted fields, ignoring estado and unknown fields", async () => {
      let update: unknown;
      let options: unknown;
      const model = {
        findByIdAndUpdate: async (_id: unknown, u: unknown, o: unknown) => {
          update = u;
          options = o;
          return { nombre: "Nuevo" };
        },
      };

      const res = await call(controller(model).update, {
        params: { id: VALID_ID },
        body: { nombre: " Nuevo ", cantidadReferencia: 500, estado: "INACTIVO", _id: "hack" },
      });

      assert.equal(res.statusCode, 200);
      assert.deepEqual(update, { $set: { nombre: "Nuevo", cantidadReferencia: 500 } });
      assert.deepEqual(options, { new: true, runValidators: true });
    });

    it("answers 404 when the producto does not exist", async () => {
      const model = { findByIdAndUpdate: async () => null };

      const res = await call(controller(model).update, { params: { id: VALID_ID }, body: { nombre: "x" } });

      assert.equal(res.statusCode, 404);
    });

    it("validates the variedad only when codigoVariedad is being changed", async () => {
      let lookups = 0;
      const canasta = {
        exists: async () => {
          lookups++;
          return { _id: "v" };
        },
      };
      const model = { findByIdAndUpdate: async () => ({}) };

      await call(controller(model, canasta).update, { params: { id: VALID_ID }, body: { nombre: "x" } });
      assert.equal(lookups, 0);

      await call(controller(model, canasta).update, {
        params: { id: VALID_ID },
        body: { codigoVariedad: "1111102" },
      });
      assert.equal(lookups, 1);
    });

    it("answers 400 when the new variedad does not exist", async () => {
      const model = { findByIdAndUpdate: async () => ({}) };

      const res = await call(controller(model, MISSING_VARIEDAD).update, {
        params: { id: VALID_ID },
        body: { codigoVariedad: "9999999" },
      });

      assert.equal(res.statusCode, 400);
    });

    it("answers 409 when the change collides with another producto", async () => {
      const model = {
        findByIdAndUpdate: async () => {
          throw Object.assign(new Error("E11000 duplicate key"), { code: 11000 });
        },
      };

      const res = await call(controller(model).update, { params: { id: VALID_ID }, body: { nombre: "x" } });

      assert.equal(res.statusCode, 409);
    });

    it("answers 400 on an invalid id", async () => {
      const res = await call(controller({}).update, { params: { id: "x" }, body: { nombre: "x" } });

      assert.equal(res.statusCode, 400);
    });
  });

  describe("setEstado", () => {
    it("sets only the estado", async () => {
      let update: unknown;
      const model = {
        findByIdAndUpdate: async (_id: unknown, u: unknown) => {
          update = u;
          return { estado: "INACTIVO" };
        },
      };

      const res = await call(controller(model).setEstado, {
        params: { id: VALID_ID },
        body: { estado: "INACTIVO", nombre: "ignored" },
      });

      assert.equal(res.statusCode, 200);
      assert.deepEqual(update, { $set: { estado: "INACTIVO" } });
    });
  });
});
