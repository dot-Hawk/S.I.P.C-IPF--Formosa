import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { type AdjuntoRepository } from "../repositories/adjunto.repository.js";
import { type AsignacionRepository } from "../repositories/asignacion.repository.js";
import { type PrecioRepository } from "../repositories/precio.repository.js";
import { type RelevamientoRepository } from "../repositories/relevamiento.repository.js";
import { type AttachmentStorage } from "../storage/attachment-storage.js";
import { authLocals, invoke } from "../testing/http.js";
import { createAdjuntoController } from "./adjunto.controller.js";

const PRECIO_ID = "00000000-0000-4000-8000-000000000011";
const ADJUNTO_ID = "00000000-0000-4000-8000-000000000021";
const ME = "00000000-0000-4000-8000-000000000012";
const OTHER = "00000000-0000-4000-8000-000000000013";
const ENCUESTADOR = authLocals(ME, "ENCUESTADOR");
const SUPERVISOR = authLocals("sup-1", "SUPERVISOR");

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

const precio = { id: PRECIO_ID, encuestador: ME, relevamiento: PRECIO_ID, comercio: PRECIO_ID };
const adjunto = {
  id: ADJUNTO_ID,
  precio: PRECIO_ID,
  clave: "stored-key.jpg",
  mime: "image/jpeg",
  bytes: JPEG.length,
  sha256: "abc",
  subidoPor: ME,
  createdAt: new Date("2026-10-14T12:00:00Z"),
};

interface Overrides {
  precios?: object;
  relevamientos?: object;
  asignaciones?: object;
  adjuntos?: object;
  storage?: object;
}

function controller(overrides: Overrides = {}) {
  return createAdjuntoController({
    precios: { findById: async () => precio, ...overrides.precios } as unknown as PrecioRepository,
    relevamientos: {
      findById: async () => ({ estado: "ABIERTO" }),
      ...overrides.relevamientos,
    } as unknown as RelevamientoRepository,
    asignaciones: { hasEnCurso: async () => true, ...overrides.asignaciones } as unknown as AsignacionRepository,
    adjuntos: {
      listByPrecio: async () => [],
      findById: async () => adjunto,
      create: async () => ({ adjunto }),
      remove: async () => adjunto,
      ...overrides.adjuntos,
    } as unknown as AdjuntoRepository,
    storage: {
      put: async () => undefined,
      get: async () => JPEG,
      remove: async () => undefined,
      ...overrides.storage,
    } as unknown as AttachmentStorage,
  });
}

describe("adjunto controller", () => {
  describe("create", () => {
    it("stores the file, records it with the actor and answers 201 without exposing the storage key", async () => {
      const stored: { key: string; data: Buffer }[] = [];
      let created: unknown[] = [];
      const c = controller({
        storage: { put: async (key: string, data: Buffer) => void stored.push({ key, data }) },
        adjuntos: {
          create: async (...a: unknown[]) => {
            created = a;
            return { adjunto };
          },
        },
      });

      const res = await invoke(c.create, { params: { id: PRECIO_ID }, body: JPEG }, ENCUESTADOR);

      assert.equal(res.statusCode, 201);
      assert.equal(stored.length, 1);
      assert.match(stored[0]?.key ?? "", /^[0-9a-f-]{36}\.jpg$/);
      assert.deepEqual(stored[0]?.data, JPEG);
      const [input, actor] = created as [Record<string, unknown>, unknown];
      assert.equal(input["precio"], PRECIO_ID);
      assert.equal(input["clave"], stored[0]?.key);
      assert.equal(input["mime"], "image/jpeg");
      assert.equal(input["bytes"], JPEG.length);
      assert.match(String(input["sha256"]), /^[0-9a-f]{64}$/);
      assert.deepEqual(actor, { userId: ME, role: "ENCUESTADOR" });
      assert.equal((res.body as Record<string, unknown>)["clave"], undefined);
      assert.equal((res.body as Record<string, unknown>)["id"], ADJUNTO_ID);
    });

    it("answers 400 when the body is not a raw file, and 415 when its bytes are not an accepted type", async () => {
      const c = controller();

      const json = await invoke(c.create, { params: { id: PRECIO_ID }, body: { a: 1 } }, ENCUESTADOR);
      const empty = await invoke(c.create, { params: { id: PRECIO_ID }, body: Buffer.alloc(0) }, ENCUESTADOR);
      const html = await invoke(
        c.create,
        { params: { id: PRECIO_ID }, body: Buffer.from("<script>alert(1)</script>") },
        ENCUESTADOR,
      );

      assert.equal(json.statusCode, 400);
      assert.equal(empty.statusCode, 400);
      assert.equal(html.statusCode, 415);
    });

    it("answers 404 for someone else's precio and 409 when the relevamiento is closed or the asignacion is over", async () => {
      const foreign = controller({ precios: { findById: async () => ({ ...precio, encuestador: OTHER }) } });
      const closed = controller({ relevamientos: { findById: async () => ({ estado: "CERRADO" }) } });
      const over = controller({ asignaciones: { hasEnCurso: async () => false } });

      assert.equal((await invoke(foreign.create, { params: { id: PRECIO_ID }, body: JPEG }, ENCUESTADOR)).statusCode, 404);
      assert.equal((await invoke(closed.create, { params: { id: PRECIO_ID }, body: JPEG }, ENCUESTADOR)).statusCode, 409);
      assert.equal((await invoke(over.create, { params: { id: PRECIO_ID }, body: JPEG }, ENCUESTADOR)).statusCode, 409);
    });

    it("does not let a supervisor attach files: the receipt comes from the surveyor", async () => {
      const res = await invoke(controller().create, { params: { id: PRECIO_ID }, body: JPEG }, SUPERVISOR);

      assert.equal(res.statusCode, 404);
    });

    it("answers 409 and discards the stored file when the precio already has the maximum", async () => {
      const removed: string[] = [];
      const c = controller({
        adjuntos: { create: async () => ({ limite: true }) },
        storage: { remove: async (key: string) => void removed.push(key) },
      });

      const res = await invoke(c.create, { params: { id: PRECIO_ID }, body: JPEG }, ENCUESTADOR);

      assert.equal(res.statusCode, 409);
      assert.equal(removed.length, 1);
    });

    it("discards the stored file and rethrows when recording it fails", async () => {
      const removed: string[] = [];
      const c = controller({
        adjuntos: {
          create: async () => {
            throw new Error("db down");
          },
        },
        storage: { remove: async (key: string) => void removed.push(key) },
      });

      await assert.rejects(() => invoke(c.create, { params: { id: PRECIO_ID }, body: JPEG }, ENCUESTADOR), /db down/);
      assert.equal(removed.length, 1);
    });
  });

  describe("list", () => {
    it("lists the attachments of a visible precio without the storage key", async () => {
      const c = controller({ adjuntos: { listByPrecio: async () => [adjunto] } });

      const res = await invoke(c.list, { params: { id: PRECIO_ID } }, SUPERVISOR);

      assert.equal(res.statusCode, 200);
      assert.equal((res.body as Record<string, unknown>[]).length, 1);
      assert.equal((res.body as Record<string, unknown>[])[0]?.["clave"], undefined);
    });

    it("hides another surveyor's precio with 404", async () => {
      const c = controller({ precios: { findById: async () => ({ ...precio, encuestador: OTHER }) } });

      assert.equal((await invoke(c.list, { params: { id: PRECIO_ID } }, ENCUESTADOR)).statusCode, 404);
    });
  });

  describe("download", () => {
    const params = { id: PRECIO_ID, adjuntoId: ADJUNTO_ID };

    it("sends the bytes with its type, as a download that browsers must not sniff or cache", async () => {
      const res = await invoke(controller().download, { params }, SUPERVISOR);

      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body, JPEG);
      assert.equal(res.headers["content-type"], "image/jpeg");
      assert.equal(res.headers["content-length"], String(JPEG.length));
      assert.equal(res.headers["x-content-type-options"], "nosniff");
      assert.equal(res.headers["cache-control"], "private, no-store");
      assert.match(res.headers["content-disposition"] ?? "", /^attachment; filename="[\w.-]+"$/);
    });

    it("answers 404 for an invalid id, an attachment of another precio, or a missing file", async () => {
      const wrongPrecio = controller({ adjuntos: { findById: async () => ({ ...adjunto, precio: OTHER }) } });
      const missing = controller({ storage: { get: async () => null } });

      assert.equal((await invoke(controller().download, { params: { ...params, adjuntoId: "x" } }, SUPERVISOR)).statusCode, 400);
      assert.equal((await invoke(wrongPrecio.download, { params }, SUPERVISOR)).statusCode, 404);
      assert.equal((await invoke(missing.download, { params }, SUPERVISOR)).statusCode, 404);
    });
  });

  describe("remove", () => {
    const params = { id: PRECIO_ID, adjuntoId: ADJUNTO_ID };

    it("deletes the record with the actor and then the stored file, answering 204", async () => {
      let args: unknown[] = [];
      const removed: string[] = [];
      const c = controller({
        adjuntos: {
          remove: async (...a: unknown[]) => {
            args = a;
            return adjunto;
          },
        },
        storage: { remove: async (key: string) => void removed.push(key) },
      });

      const res = await invoke(c.remove, { params }, ENCUESTADOR);

      assert.equal(res.statusCode, 204);
      assert.deepEqual(args, [ADJUNTO_ID, { userId: ME, role: "ENCUESTADOR" }]);
      assert.deepEqual(removed, ["stored-key.jpg"]);
    });

    it("answers 404 for an attachment that belongs to another precio and 409 once the relevamiento is closed", async () => {
      const wrongPrecio = controller({ adjuntos: { findById: async () => ({ ...adjunto, precio: OTHER }) } });
      const closed = controller({ relevamientos: { findById: async () => ({ estado: "CERRADO" }) } });

      assert.equal((await invoke(wrongPrecio.remove, { params }, ENCUESTADOR)).statusCode, 404);
      assert.equal((await invoke(closed.remove, { params }, ENCUESTADOR)).statusCode, 409);
    });
  });
});
