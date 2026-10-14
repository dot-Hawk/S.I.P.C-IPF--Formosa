import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { type CanastaNodoData } from "../domain/canasta.js";
import { type CanastaRepository } from "../repositories/canasta.repository.js";
import { importCanasta } from "./canasta-import.service.js";

const variedad: CanastaNodoData = {
  codigo: "1111101",
  nombre: "Pan francés",
  nivel: 6,
  padre: "11111",
  ponderador: 0.01,
  derivado: false,
  estado: "ACTIVO",
  categoria: "NUCLEO",
  codigoVariedad12: "A0111111",
  tratamientoEspecial: false,
};

const root: CanastaNodoData = {
  codigo: "0",
  nombre: "NIVEL GENERAL",
  nivel: 0,
  padre: null,
  ponderador: 1,
  derivado: false,
  estado: "ACTIVO",
};

function fakeRepo(existing: object[] = []) {
  const writes: CanastaNodoData[][] = [];
  const repo = {
    findAll: async () => existing,
    upsertMany: async (nodos: CanastaNodoData[]) => {
      writes.push(nodos);
    },
  };
  return { repo: repo as unknown as CanastaRepository, writes };
}

describe("importCanasta", () => {
  it("writes every new node in one batch", async () => {
    const { repo, writes } = fakeRepo();

    const result = await importCanasta(repo, [root, variedad]);

    assert.equal(writes.length, 1);
    assert.deepEqual(writes[0]?.map((n) => n.codigo), ["0", "1111101"]);
    assert.deepEqual(result, { created: 2, updated: 0, unchanged: 0 });
  });

  it("skips nodes that are already identical, even if estado was changed by hand", async () => {
    const { repo, writes } = fakeRepo([{ ...variedad, estado: "INACTIVO" }]);

    const result = await importCanasta(repo, [variedad]);

    assert.equal(writes.length, 0);
    assert.deepEqual(result, { created: 0, updated: 0, unchanged: 1 });
  });

  it("writes only the nodes whose data changed", async () => {
    const { repo, writes } = fakeRepo([root, { ...variedad, ponderador: 0.5 }]);

    const result = await importCanasta(repo, [root, variedad]);

    assert.deepEqual(writes[0]?.map((n) => n.codigo), ["1111101"]);
    assert.deepEqual(result, { created: 0, updated: 1, unchanged: 1 });
  });

  it("treats a missing optional field as equal to an undefined one", async () => {
    const { repo, writes } = fakeRepo([{ ...root, categoria: null }]);

    const result = await importCanasta(repo, [root]);

    assert.equal(writes.length, 0);
    assert.deepEqual(result, { created: 0, updated: 0, unchanged: 1 });
  });

  it("does nothing for an empty list", async () => {
    const { repo, writes } = fakeRepo();

    const result = await importCanasta(repo, []);

    assert.equal(writes.length, 0);
    assert.deepEqual(result, { created: 0, updated: 0, unchanged: 0 });
  });
});
