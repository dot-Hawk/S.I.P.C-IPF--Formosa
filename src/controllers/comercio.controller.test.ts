import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { type ComercioRepository } from "../repositories/comercio.repository.js";
import { invoke } from "../testing/http.js";
import { createComercioController } from "./comercio.controller.js";

const VALID_ID = "00000000-0000-4000-8000-000000000011";

function controller(repo: object) {
  return createComercioController(repo as ComercioRepository);
}

describe("comercio controller", () => {
  describe("create", () => {
    it("trims text, forces ACTIVO and drops unknown fields", async () => {
      let received: Record<string, unknown> | undefined;
      const repo = {
        create: async (data: Record<string, unknown>) => {
          received = data;
          return data;
        },
      };

      const res = await invoke(controller(repo).create, {
        body: {
          nombre: " Super ",
          direccion: " Calle 1 ",
          zona: " Centro ",
          tipo: "SUPERMERCADO",
          estado: "INACTIVO",
          id: "hack",
        },
      });

      assert.equal(res.statusCode, 201);
      assert.deepEqual(received, {
        nombre: "Super",
        direccion: "Calle 1",
        zona: "Centro",
        tipo: "SUPERMERCADO",
        estado: "ACTIVO",
      });
    });
  });

  describe("list", () => {
    it("answers 400 on invalid filters", async () => {
      const res = await invoke(controller({}).list, { query: { tipo: "X" } });

      assert.equal(res.statusCode, 400);
    });

    it("passes only the provided filters, trimmed", async () => {
      let filter: unknown;
      const repo = {
        list: async (f: unknown) => {
          filter = f;
          return [];
        },
      };

      await invoke(controller(repo).list, { query: { zona: " Centro ", estado: "ACTIVO", junk: "x" } });

      assert.deepEqual(filter, { zona: "Centro", estado: "ACTIVO" });
    });
  });

  describe("getById", () => {
    it("answers 400, 404 and 200 appropriately", async () => {
      const found = controller({ findById: async () => ({ nombre: "x" }) });
      const missing = controller({ findById: async () => null });

      assert.equal((await invoke(found.getById, { params: { id: "x" } })).statusCode, 400);
      assert.equal((await invoke(missing.getById, { params: { id: VALID_ID } })).statusCode, 404);
      assert.equal((await invoke(found.getById, { params: { id: VALID_ID } })).statusCode, 200);
    });
  });

  describe("update", () => {
    it("only sets whitelisted fields, ignoring estado and unknown fields", async () => {
      let changes: unknown;
      const repo = {
        update: async (_id: string, c: unknown) => {
          changes = c;
          return { nombre: "Nuevo" };
        },
      };

      const res = await invoke(controller(repo).update, {
        params: { id: VALID_ID },
        body: { nombre: " Nuevo ", zona: "Norte", estado: "INACTIVO", id: "hack" },
      });

      assert.equal(res.statusCode, 200);
      assert.deepEqual(changes, { nombre: "Nuevo", zona: "Norte" });
    });

    it("answers 404 when the comercio does not exist and 400 on an invalid id", async () => {
      const missing = controller({ update: async () => null });

      assert.equal(
        (await invoke(missing.update, { params: { id: VALID_ID }, body: { nombre: "x" } })).statusCode,
        404,
      );
      assert.equal((await invoke(missing.update, { params: { id: "x" }, body: { nombre: "x" } })).statusCode, 400);
    });
  });

  describe("setEstado", () => {
    it("sets only the estado", async () => {
      let changes: unknown;
      const repo = {
        update: async (_id: string, c: unknown) => {
          changes = c;
          return { estado: "INACTIVO" };
        },
      };

      const res = await invoke(controller(repo).setEstado, {
        params: { id: VALID_ID },
        body: { estado: "INACTIVO", nombre: "hack" },
      });

      assert.equal(res.statusCode, 200);
      assert.deepEqual(changes, { estado: "INACTIVO" });
    });
  });
});
