import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { type RelevamientoRepository } from "../repositories/relevamiento.repository.js";
import { invoke } from "../testing/http.js";
import { createRelevamientoController } from "./relevamiento.controller.js";

const VALID_ID = "00000000-0000-4000-8000-000000000011";

function controller(repo: object) {
  return createRelevamientoController(repo as RelevamientoRepository);
}

describe("relevamiento controller", () => {
  describe("create", () => {
    it("creates the relevamiento as ABIERTO with real dates and answers 201", async () => {
      let received: Record<string, unknown> | undefined;
      const repo = {
        create: async (data: Record<string, unknown>) => {
          received = data;
          return data;
        },
      };
      const body = {
        periodo: "2026-10",
        frecuencia: "MENSUAL",
        fechaInicio: "2026-10-01",
        fechaLimite: "2026-10-31",
        estado: "CERRADO",
      };

      const res = await invoke(controller(repo).create, { body });

      assert.equal(res.statusCode, 201);
      assert.equal(received?.["estado"], "ABIERTO");
      assert.ok(received?.["fechaInicio"] instanceof Date);
      assert.equal((received?.["fechaLimite"] as Date).toISOString().slice(0, 10), "2026-10-31");
    });

    it("answers 409 on duplicate periodo and frecuencia", async () => {
      const repo = {
        create: async () => {
          throw Object.assign(new Error("Failed query"), { cause: { code: "23505" } });
        },
      };

      const res = await invoke(controller(repo).create, { body: { fechaInicio: "2026-10-01", fechaLimite: "2026-10-31" } });

      assert.equal(res.statusCode, 409);
    });

    it("rethrows unexpected errors", async () => {
      const repo = {
        create: async () => {
          throw new Error("connection lost");
        },
      };

      await assert.rejects(
        invoke(controller(repo).create, { body: { fechaInicio: "2026-10-01", fechaLimite: "2026-10-31" } }),
        /connection lost/,
      );
    });
  });

  describe("list", () => {
    it("returns what the repository lists", async () => {
      const items = [{ periodo: "2026-10" }];

      const res = await invoke(controller({ list: async () => items }).list, {});

      assert.deepEqual(res.body, items);
    });
  });

  describe("getById", () => {
    it("answers 400 on an invalid id", async () => {
      const res = await invoke(controller({}).getById, { params: { id: "not-an-id" } });

      assert.equal(res.statusCode, 400);
    });

    it("answers 404 when it does not exist and 200 when it does", async () => {
      const missing = await invoke(controller({ findById: async () => null }).getById, {
        params: { id: VALID_ID },
      });
      const found = await invoke(controller({ findById: async () => ({ periodo: "2026-10" }) }).getById, {
        params: { id: VALID_ID },
      });

      assert.equal(missing.statusCode, 404);
      assert.equal(found.statusCode, 200);
      assert.deepEqual(found.body, { periodo: "2026-10" });
    });
  });

  describe("close", () => {
    it("answers 400 on an invalid id", async () => {
      const res = await invoke(controller({}).close, { params: { id: "not-an-id" } });

      assert.equal(res.statusCode, 400);
    });

    it("returns the closed relevamiento", async () => {
      const closed = { periodo: "2026-10", estado: "CERRADO" };

      const res = await invoke(controller({ closeIfOpen: async () => closed }).close, {
        params: { id: VALID_ID },
      });

      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body, closed);
    });

    it("answers 409 when it exists but was already closed", async () => {
      const repo = { closeIfOpen: async () => null, findById: async () => ({ estado: "CERRADO" }) };

      const res = await invoke(controller(repo).close, { params: { id: VALID_ID } });

      assert.equal(res.statusCode, 409);
    });

    it("answers 404 when it does not exist", async () => {
      const repo = { closeIfOpen: async () => null, findById: async () => null };

      const res = await invoke(controller(repo).close, { params: { id: VALID_ID } });

      assert.equal(res.statusCode, 404);
    });
  });
});
