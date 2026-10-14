import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { type Model } from "mongoose";
import { type CanastaNodoData } from "../domain/canasta.js";
import { type ICanastaNodo } from "../models/interfaces/ICanastaNodo.interface.js";
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

type Op = { updateOne: { filter: unknown; update: Record<string, Record<string, unknown>>; upsert: boolean } };

function fakeModel(existing: object[] = []) {
  const calls: Op[][] = [];
  const model = {
    find: () => ({ lean: async () => existing }),
    bulkWrite: async (ops: Op[]) => {
      calls.push(ops);
      return {};
    },
  };
  return { model: model as unknown as Model<ICanastaNodo>, calls };
}

describe("importCanasta", () => {
  it("upserts every new node by codigo in one bulk write", async () => {
    const { model, calls } = fakeModel();

    const result = await importCanasta(model, [root, variedad]);

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.length, 2);
    assert.deepEqual(calls[0]?.[0]?.updateOne.filter, { codigo: "0" });
    assert.equal(calls[0]?.[0]?.updateOne.upsert, true);
    assert.deepEqual(result, { created: 2, updated: 0, unchanged: 0 });
  });

  it("never overwrites estado, so a deactivated variedad survives a re-import", async () => {
    const { model, calls } = fakeModel();

    await importCanasta(model, [variedad]);

    const update = calls[0]?.[0]?.updateOne.update;
    assert.equal("estado" in (update?.["$set"] ?? {}), false);
    assert.deepEqual(update?.["$setOnInsert"], { estado: "ACTIVO" });
  });

  it("sets only the defined fields", async () => {
    const { model, calls } = fakeModel();

    await importCanasta(model, [root]);

    assert.deepEqual(calls[0]?.[0]?.updateOne.update["$set"], {
      codigo: "0",
      nombre: "NIVEL GENERAL",
      nivel: 0,
      padre: null,
      ponderador: 1,
      derivado: false,
    });
  });

  it("skips nodes that are already identical, even if estado was changed by hand", async () => {
    const { model, calls } = fakeModel([{ ...variedad, estado: "INACTIVO" }]);

    const result = await importCanasta(model, [variedad]);

    assert.equal(calls.length, 0);
    assert.deepEqual(result, { created: 0, updated: 0, unchanged: 1 });
  });

  it("updates only the nodes whose data changed", async () => {
    const { model, calls } = fakeModel([root, { ...variedad, ponderador: 0.5 }]);

    const result = await importCanasta(model, [root, variedad]);

    assert.equal(calls[0]?.length, 1);
    assert.deepEqual(calls[0]?.[0]?.updateOne.filter, { codigo: "1111101" });
    assert.deepEqual(result, { created: 0, updated: 1, unchanged: 1 });
  });

  it("treats a missing optional field as equal to an undefined one", async () => {
    const { model, calls } = fakeModel([{ ...root, padre: undefined }]);

    const result = await importCanasta(model, [root]);

    assert.equal(calls.length, 0);
    assert.deepEqual(result, { created: 0, updated: 0, unchanged: 1 });
  });

  it("does nothing for an empty list", async () => {
    const { model, calls } = fakeModel();

    const result = await importCanasta(model, []);

    assert.equal(calls.length, 0);
    assert.deepEqual(result, { created: 0, updated: 0, unchanged: 0 });
  });
});
