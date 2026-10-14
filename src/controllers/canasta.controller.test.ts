import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { type CanastaRepository } from "../repositories/canasta.repository.js";
import { invoke } from "../testing/http.js";
import { createCanastaController } from "./canasta.controller.js";

function controller(repo: object) {
  return createCanastaController(repo as CanastaRepository);
}

const PRODUCTO = { codigo: "11111", nivel: 5, estado: "ACTIVO" };
const BODY = { codigo: "1111199", nombre: " Pan nuevo ", padre: "11111", categoria: "NUCLEO" };

describe("canasta controller", () => {
  describe("list", () => {
    it("answers 400 on invalid filters", async () => {
      const res = await invoke(controller({}).list, { query: { nivel: "9" } });

      assert.equal(res.statusCode, 400);
    });

    it("passes the provided filters (nivel as number) and ignores the rest", async () => {
      let filter: unknown;
      const repo = {
        list: async (f: unknown) => {
          filter = f;
          return [];
        },
      };

      await invoke(controller(repo).list, {
        query: { nivel: "6", padre: " 11111 ", categoria: "NUCLEO", estado: "ACTIVO", junk: "x" },
      });

      assert.deepEqual(filter, { nivel: 6, padre: "11111", categoria: "NUCLEO", estado: "ACTIVO" });
    });
  });

  describe("getByCodigo", () => {
    it("answers 400, 404 and 200 appropriately", async () => {
      const found = controller({ findByCodigo: async () => ({ codigo: "11111" }) });
      const missing = controller({ findByCodigo: async () => null });

      assert.equal((await invoke(found.getByCodigo, { params: { codigo: "abc" } })).statusCode, 400);
      assert.equal((await invoke(missing.getByCodigo, { params: { codigo: "11111" } })).statusCode, 404);
      assert.equal((await invoke(found.getByCodigo, { params: { codigo: "11111" } })).statusCode, 200);
    });
  });

  describe("createVariedad", () => {
    it("creates a nivel 6 ACTIVO variedad under an active producto, trimming and ignoring extras", async () => {
      let created: Record<string, unknown> | undefined;
      const repo = {
        findByCodigo: async () => PRODUCTO,
        create: async (data: Record<string, unknown>) => {
          created = data;
          return data;
        },
      };

      const res = await invoke(controller(repo).createVariedad, {
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
      const missing = controller({ findByCodigo: async () => null });
      const wrongLevel = controller({ findByCodigo: async () => ({ ...PRODUCTO, nivel: 4 }) });
      const inactive = controller({ findByCodigo: async () => ({ ...PRODUCTO, estado: "INACTIVO" }) });

      for (const c of [missing, wrongLevel, inactive]) {
        const res = await invoke(c.createVariedad, { body: BODY });
        assert.equal(res.statusCode, 400);
      }
    });

    it("answers 409 when the codigo already exists", async () => {
      const repo = {
        findByCodigo: async () => PRODUCTO,
        create: async () => {
          throw Object.assign(new Error("Failed query"), { cause: { code: "23505" } });
        },
      };

      const res = await invoke(controller(repo).createVariedad, { body: BODY });

      assert.equal(res.statusCode, 409);
    });
  });

  describe("setEstado", () => {
    it("deactivates a variedad and answers 404 when there is none", async () => {
      let args: unknown[] = [];
      const ok = controller({
        setVariedadEstado: async (...a: unknown[]) => {
          args = a;
          return { codigo: "1111101", estado: "INACTIVO" };
        },
      });
      const missing = controller({ setVariedadEstado: async () => null });

      const res = await invoke(ok.setEstado, {
        params: { codigo: "1111101" },
        body: { estado: "INACTIVO", nombre: "hack" },
      });
      const notFound = await invoke(missing.setEstado, {
        params: { codigo: "1111101" },
        body: { estado: "INACTIVO" },
      });

      assert.equal(res.statusCode, 200);
      assert.deepEqual(args, ["1111101", "INACTIVO"]);
      assert.equal(notFound.statusCode, 404);
    });

    it("answers 400 on an invalid codigo", async () => {
      const res = await invoke(controller({}).setEstado, { params: { codigo: "x" }, body: { estado: "ACTIVO" } });

      assert.equal(res.statusCode, 400);
    });
  });
});
