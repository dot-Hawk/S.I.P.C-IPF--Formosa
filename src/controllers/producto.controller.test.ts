import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { type CanastaRepository } from "../repositories/canasta.repository.js";
import { type ProductoRepository } from "../repositories/producto.repository.js";
import { invoke } from "../testing/http.js";
import { createProductoController } from "./producto.controller.js";

const VALID_ID = "00000000-0000-4000-8000-000000000011";

const ACTIVE_VARIEDAD = { isActiveVariedad: async () => true };
const MISSING_VARIEDAD = { isActiveVariedad: async () => false };

const duplicate = () => Object.assign(new Error("Failed query"), { cause: { code: "23505" } });

function controller(repo: object, canasta: object = ACTIVE_VARIEDAD) {
  return createProductoController(repo as ProductoRepository, canasta as CanastaRepository);
}

const VALID_BODY = {
  nombre: "Arroz",
  categoria: "Almacen",
  unidad: "KG",
  cantidadReferencia: 1,
  codigoVariedad: "1111101",
};

describe("producto controller", () => {
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
          nombre: " Arroz ",
          categoria: "Almacen ",
          unidad: "KG",
          cantidadReferencia: 1,
          marca: " Gallo",
          codigoVariedad: " 1111101 ",
          estado: "INACTIVO",
          id: "hack",
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

    it("omits marca when it is not provided", async () => {
      let received: Record<string, unknown> | undefined;
      const repo = {
        create: async (data: Record<string, unknown>) => {
          received = data;
          return data;
        },
      };

      await invoke(controller(repo).create, { body: VALID_BODY });

      assert.equal(received !== undefined && "marca" in received, false);
    });

    it("checks the variedad against the canasta", async () => {
      let checked: unknown;
      const canasta = {
        isActiveVariedad: async (codigo: string) => {
          checked = codigo;
          return true;
        },
      };

      await invoke(controller({ create: async (d: object) => d }, canasta).create, {
        body: { ...VALID_BODY, codigoVariedad: " 1111101 " },
      });

      assert.equal(checked, "1111101");
    });

    it("answers 400 when the variedad does not exist or is inactive", async () => {
      let created = false;
      const repo = {
        create: async () => {
          created = true;
        },
      };

      const res = await invoke(controller(repo, MISSING_VARIEDAD).create, {
        body: { ...VALID_BODY, codigoVariedad: "9999999" },
      });

      assert.equal(res.statusCode, 400);
      assert.equal(created, false);
    });

    it("answers 409 when an equal producto already exists", async () => {
      const repo = {
        create: async () => {
          throw duplicate();
        },
      };

      const res = await invoke(controller(repo).create, { body: VALID_BODY });

      assert.equal(res.statusCode, 409);
      assert.deepEqual(res.body, {
        message: "A producto with the same nombre, marca, unidad and cantidadReferencia already exists",
      });
    });

    it("rethrows unexpected errors", async () => {
      const repo = {
        create: async () => {
          throw new Error("connection lost");
        },
      };

      await assert.rejects(invoke(controller(repo).create, { body: VALID_BODY }), /connection lost/);
    });
  });

  describe("list", () => {
    it("answers 400 on invalid filters", async () => {
      const res = await invoke(controller({}).list, { query: { unidad: "TON" } });

      assert.equal(res.statusCode, 400);
    });

    it("passes only the provided filters", async () => {
      let filter: unknown;
      const repo = {
        list: async (f: unknown) => {
          filter = f;
          return [];
        },
      };

      await invoke(controller(repo).list, {
        query: { categoria: " Almacen ", unidad: "KG", codigoVariedad: "1111101", junk: "x" },
      });

      assert.deepEqual(filter, { categoria: "Almacen", unidad: "KG", codigoVariedad: "1111101" });
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
        body: { nombre: " Nuevo ", cantidadReferencia: 500, estado: "INACTIVO", id: "hack" },
      });

      assert.equal(res.statusCode, 200);
      assert.deepEqual(changes, { nombre: "Nuevo", cantidadReferencia: 500 });
    });

    it("validates the variedad only when codigoVariedad is being changed", async () => {
      let lookups = 0;
      const canasta = {
        isActiveVariedad: async () => {
          lookups++;
          return true;
        },
      };
      const c = controller({ update: async () => ({}) }, canasta);

      await invoke(c.update, { params: { id: VALID_ID }, body: { nombre: "x" } });
      assert.equal(lookups, 0);

      await invoke(c.update, { params: { id: VALID_ID }, body: { codigoVariedad: "1111102" } });
      assert.equal(lookups, 1);
    });

    it("answers 400 when the new variedad does not exist", async () => {
      const res = await invoke(controller({ update: async () => ({}) }, MISSING_VARIEDAD).update, {
        params: { id: VALID_ID },
        body: { codigoVariedad: "9999999" },
      });

      assert.equal(res.statusCode, 400);
    });

    it("answers 409 when the change collides with another producto", async () => {
      const repo = {
        update: async () => {
          throw duplicate();
        },
      };

      const res = await invoke(controller(repo).update, { params: { id: VALID_ID }, body: { nombre: "x" } });

      assert.equal(res.statusCode, 409);
    });

    it("answers 404 when the producto does not exist and 400 on an invalid id", async () => {
      const c = controller({ update: async () => null });

      assert.equal((await invoke(c.update, { params: { id: VALID_ID }, body: { nombre: "x" } })).statusCode, 404);
      assert.equal((await invoke(c.update, { params: { id: "x" }, body: { nombre: "x" } })).statusCode, 400);
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
