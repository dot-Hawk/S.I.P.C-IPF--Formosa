import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bootstrapDevData, type DevApi } from "./dev-data.js";

interface Stored {
  id: string;
  [key: string]: unknown;
}

// An in-memory stand-in for the API that answers 409 on duplicates, like the real one.
function fakeApi() {
  const store: Record<string, Stored[]> = {};
  const calls: { method: string; path: string; body?: unknown }[] = [];
  let seq = 0;

  const uniqueKey: Record<string, string[]> = {
    "/api/users": ["email"],
    "/api/relevamientos": ["periodo"],
    "/api/comercios": ["nombre"],
    "/api/productos": ["codigoVariedad"],
    "/api/asignaciones": ["relevamiento", "comercio"],
  };

  const variedades = [
    { codigo: "1111101", nombre: "Arroz", categoria: "NUCLEO" },
    { codigo: "1111102", nombre: "Fideos", categoria: "NUCLEO" },
  ];

  const api: DevApi = {
    async get(path) {
      calls.push({ method: "GET", path });
      const base = path.split("?")[0] as string;
      if (base === "/api/canasta") return { status: 200, body: variedades };
      return { status: 200, body: store[base] ?? [] };
    },
    async post(path, body) {
      calls.push({ method: "POST", path, body });
      const list = (store[path] ??= []);
      const keys = uniqueKey[path] ?? [];
      const record = body as Record<string, unknown>;
      if (list.some((row) => keys.every((k) => row[k] === record[k]))) {
        return { status: 409, body: { message: "exists" } };
      }
      const row = { ...record, id: `id-${++seq}` };
      list.push(row);
      return { status: 201, body: row };
    },
  };

  return { api, store, calls };
}

const OPTIONS = {
  encuestador: { email: "enc@dev.local", password: "enc-password-1" },
  today: new Date("2026-10-14T12:00:00Z"),
};

describe("bootstrapDevData", () => {
  it("creates the surveyor, the relevamiento, the commerces, the products and one assignment per commerce", async () => {
    const { api, store } = fakeApi();

    const summary = await bootstrapDevData(api, OPTIONS);

    assert.equal(store["/api/users"]?.[0]?.["role"], "ENCUESTADOR");
    assert.equal(store["/api/users"]?.[0]?.["email"], "enc@dev.local");
    assert.equal(store["/api/relevamientos"]?.[0]?.["periodo"], "2026-10");
    assert.equal(store["/api/relevamientos"]?.[0]?.["fechaInicio"], "2026-10-01");
    assert.equal(store["/api/relevamientos"]?.[0]?.["fechaLimite"], "2026-10-31");
    assert.equal(store["/api/comercios"]?.length, 3);
    assert.deepEqual(
      store["/api/productos"]?.map((p) => p["codigoVariedad"]),
      ["1111101", "1111102"],
    );
    assert.equal(store["/api/asignaciones"]?.length, 3);
    for (const asignacion of store["/api/asignaciones"] ?? []) {
      assert.equal(asignacion["encuestador"], store["/api/users"]?.[0]?.id);
      assert.equal(asignacion["relevamiento"], store["/api/relevamientos"]?.[0]?.id);
    }
    assert.deepEqual(summary.created, { encuestador: 1, relevamiento: 1, comercios: 3, productos: 2, asignaciones: 3 });
  });

  it("is idempotent: a second run finds everything and creates nothing", async () => {
    const { api, store } = fakeApi();
    await bootstrapDevData(api, OPTIONS);

    const again = await bootstrapDevData(api, OPTIONS);

    assert.deepEqual(again.created, { encuestador: 0, relevamiento: 0, comercios: 0, productos: 0, asignaciones: 0 });
    assert.equal(store["/api/asignaciones"]?.length, 3);
    assert.equal(store["/api/comercios"]?.length, 3);
  });

  it("fails with the API's answer when something cannot be created", async () => {
    const { api } = fakeApi();
    const failing: DevApi = {
      get: api.get,
      post: async (path, body) =>
        path === "/api/comercios" ? { status: 400, body: { errors: [{ field: "zona" }] } } : api.post(path, body),
    };

    await assert.rejects(() => bootstrapDevData(failing, OPTIONS), /POST \/api\/comercios.*400/);
  });
});
