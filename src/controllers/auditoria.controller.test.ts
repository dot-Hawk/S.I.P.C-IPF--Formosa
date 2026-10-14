import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { type AuditoriaRepository } from "../repositories/auditoria.repository.js";
import { invoke } from "../testing/http.js";
import { createAuditoriaController } from "./auditoria.controller.js";

const ID = "00000000-0000-4000-8000-000000000011";

function setup() {
  const captured: { filter?: unknown; page?: unknown } = {};
  const repo = {
    listPrecios: async (filter: unknown, page: unknown) => {
      captured.filter = filter;
      captured.page = page;
      return [{ accion: "CREACION" }];
    },
  };
  return { controller: createAuditoriaController(repo as unknown as AuditoriaRepository), captured };
}

describe("auditoria controller", () => {
  it("answers 400 on invalid filters", async () => {
    const { controller } = setup();

    const res = await invoke(controller.listPrecios, { query: { precio: "x" } });

    assert.equal(res.statusCode, 400);
  });

  it("filters and paginates", async () => {
    const { controller, captured } = setup();

    const res = await invoke(controller.listPrecios, {
      query: { precio: ID, accion: "ELIMINACION", page: "2", limit: "20", junk: "x" },
    });

    assert.deepEqual(captured.filter, { precio: ID, accion: "ELIMINACION" });
    assert.deepEqual(captured.page, { limit: 20, offset: 20 });
    assert.equal(res.statusCode, 200);
  });

  it("uses the default page size", async () => {
    const { controller, captured } = setup();

    await invoke(controller.listPrecios, { query: {} });

    assert.deepEqual(captured.page, { limit: 50, offset: 0 });
  });
});
