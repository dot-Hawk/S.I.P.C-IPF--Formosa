import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { type Server } from "node:http";
import { type AddressInfo } from "node:net";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Integration test: boots the real Express app against a real PostgreSQL and walks the whole flow.
//
//   DATABASE_TEST_URL=postgres://postgres:test@127.0.0.1:5433/sipc_integration_test npm run test:integration
//
// The schema is DROPPED before and after the run, so the database name must contain "test".

const DATABASE_TEST_URL = process.env["DATABASE_TEST_URL"];

function databaseName(uri: string): string {
  return new URL(uri).pathname.replace(/^\//, "");
}

const skipReason = !DATABASE_TEST_URL
  ? "DATABASE_TEST_URL is not set"
  : !/test/i.test(databaseName(DATABASE_TEST_URL))
    ? 'DATABASE_TEST_URL database name must contain "test" because its schema is dropped'
    : false;

interface ApiResponse {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
}

const COORDINADOR_EMAIL = "coord@integration.test";
const COORDINADOR_PASSWORD = "coordinador-pass-1";
const PASSWORD = "password-largo-1";

describe("API flow (real PostgreSQL)", { skip: skipReason }, () => {
  let server: Server;
  let baseUrl: string;
  let db: typeof import("../../src/db/index.js") | undefined;

  // Drops everything the app created, including drizzle's migrations bookkeeping.
  async function resetSchema(): Promise<void> {
    const { pool } = (db as NonNullable<typeof db>).getDbHandle();
    await pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
    await pool.query("DROP SCHEMA public CASCADE");
    await pool.query("CREATE SCHEMA public");
  }

  async function api(
    method: string,
    path: string,
    options: { token?: string | undefined; body?: unknown } = {},
  ): Promise<ApiResponse> {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : undefined };
  }

  async function login(email: string, password: string) {
    const r = await api("POST", "/api/auth/login", { body: { email, password } });
    return { status: r.status, token: r.body?.token as string, id: r.body?.user?.id as string };
  }

  let uploadsDir = "";

  async function upload(precioId: string, token: string, data: Buffer, type = "image/jpeg"): Promise<ApiResponse> {
    const response = await fetch(`${baseUrl}/api/precios/${precioId}/adjuntos`, {
      method: "POST",
      headers: { "content-type": type, authorization: `Bearer ${token}` },
      body: new Uint8Array(data),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : undefined };
  }

  const state = {} as {
    coord: { token: string; id: string };
    a: { token: string; id: string };
    b: { token: string; id: string };
    analista: { token: string; id: string };
    comercioId: string;
    productoId: string;
    producto2Id: string;
    relevamientoId: string;
    asignacionId: string;
    precioId: string;
  };

  before(async () => {
    process.env["JWT_SECRET"] = "integration-test-secret";
    process.env["DATABASE_URL"] = DATABASE_TEST_URL as string;
    uploadsDir = await mkdtemp(path.join(os.tmpdir(), "sipc-uploads-"));
    process.env["UPLOADS_DIR"] = uploadsDir;

    const dbModule = await import("../../src/db/index.js");
    db = dbModule;
    await resetSchema();
    const { runMigrations } = await import("../../src/db/migrate.js");
    await runMigrations();

    const [{ default: app }, { seedCoordinador }, { createUserRepository }] = await Promise.all([
      import("../../src/app.js"),
      import("../../src/auth/seed-coordinador.service.js"),
      import("../../src/repositories/user.repository.js"),
    ]);

    const seeded = await seedCoordinador(createUserRepository(dbModule.getDb()), {
      nombre: "Coord",
      apellido: "Uno",
      dni: "10000001",
      legajo: "L-1",
      email: COORDINADOR_EMAIL,
      password: COORDINADOR_PASSWORD,
    });
    assert.deepEqual(seeded, { created: true });

    // A tiny basket (one subtree with two variedades) built with the real import code.
    const [{ buildCanasta }, { importCanasta }, { createCanastaRepository }] = await Promise.all([
      import("../../src/domain/canasta.js"),
      import("../../src/services/canasta-import.service.js"),
      import("../../src/repositories/canasta.repository.js"),
    ]);
    const chain = { producto: "11111", subclase: "1111", clase: "111", grupo: "11", division: "1" };
    const basket = buildCanasta({
      nodos: [
        { codigo: "0", nombre: "NIVEL GENERAL", nivel: 0, ponderador: 1 },
        { codigo: "1", nombre: "ALIMENTOS", nivel: 1, ponderador: 1 },
        { codigo: "11", nombre: "EN EL HOGAR", nivel: 2, ponderador: 1 },
        { codigo: "111", nombre: "PANIFICACION", nivel: 3, ponderador: 1 },
        { codigo: "1111", nombre: "PANIFICACION", nivel: 4, ponderador: 1 },
        { codigo: "11111", nombre: "Pan fresco", nivel: 5, ponderador: 1 },
        { codigo: "1111101", nombre: "Arroz", nivel: 6, ponderador: 0.6, ...chain },
        { codigo: "1111102", nombre: "Fideos", nivel: 6, ponderador: 0.4, ...chain },
      ],
      categorias: { NUCLEO: ["1111101", "1111102"], ESTACIONAL: [], REGULADO: [] },
      codigos12: {},
      tratamientoEspecial: [],
    });
    await importCanasta(createCanastaRepository(dbModule.getDb()), basket.nodos);

    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    server?.close();
    if (db) {
      await resetSchema();
      await db.closeDb();
    }
    if (uploadsDir) await rm(uploadsDir, { recursive: true, force: true });
  });

  it("seed is idempotent", async () => {
    const { seedCoordinador } = await import("../../src/auth/seed-coordinador.service.js");
    const { createUserRepository } = await import("../../src/repositories/user.repository.js");

    const again = await seedCoordinador(createUserRepository((db as NonNullable<typeof db>).getDb()), {
      nombre: "Otro",
      apellido: "Coord",
      dni: "10000002",
      legajo: "L-2",
      email: "otro@integration.test",
      password: COORDINADOR_PASSWORD,
    });

    assert.equal(again.created, false);
  });

  it("authenticates and rejects bad credentials and tokens", async () => {
    const coord = await login(COORDINADOR_EMAIL, COORDINADOR_PASSWORD);
    assert.equal(coord.status, 200);
    state.coord = { token: coord.token, id: coord.id };

    assert.equal((await login(COORDINADOR_EMAIL, "wrong")).status, 401);
    assert.equal((await login("ghost@integration.test", "x")).status, 401);
    assert.equal((await api("GET", "/api/relevamientos")).status, 401);
    assert.equal((await api("GET", "/api/relevamientos", { token: "abc.def.ghi" })).status, 401);
  });

  it("returns safe JSON for malformed bodies and unknown routes", async () => {
    const malformed = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{bad",
    });
    const text = await malformed.text();

    assert.equal(malformed.status, 400);
    assert.deepEqual(JSON.parse(text), { message: "Malformed JSON body" });
    assert.equal(text.includes("node_modules"), false);
    assert.equal((await api("GET", "/api/nope")).status, 404);
  });

  it("creates users with roles, without exposing hashes", async () => {
    const make = (nombre: string, n: number, role: string) => ({
      nombre,
      apellido: "Integration",
      dni: `2000000${n}`,
      legajo: `L-${nombre}`,
      email: `${nombre.toLowerCase()}@integration.test`,
      password: PASSWORD,
      role,
    });
    const encA = make("EncA", 1, "ENCUESTADOR");
    const encB = make("EncB", 2, "ENCUESTADOR");
    const analista = make("Analista", 3, "ANALISTA");

    for (const user of [encA, encB, analista]) {
      const r = await api("POST", "/api/users", { token: state.coord.token, body: user });
      assert.equal(r.status, 201);
      assert.equal("passwordHash" in r.body, false);
    }

    assert.equal((await api("POST", "/api/users", { token: state.coord.token, body: encA })).status, 409);

    const a = await login(encA.email, PASSWORD);
    const b = await login(encB.email, PASSWORD);
    const an = await login(analista.email, PASSWORD);
    state.a = { token: a.token, id: a.id };
    state.b = { token: b.token, id: b.id };
    state.analista = { token: an.token, id: an.id };

    const forbidden = await api("POST", "/api/users", { token: state.a.token, body: make("X", 4, "ANALISTA") });
    assert.equal(forbidden.status, 403);
  });

  it("manages catalogs with role restrictions", async () => {
    const { coord, analista } = state;

    const comercio = await api("POST", "/api/comercios", {
      token: coord.token,
      body: { nombre: "Super Integration", direccion: "Calle 1", zona: "Centro", tipo: "SUPERMERCADO" },
    });
    assert.equal(comercio.status, 201);
    state.comercioId = comercio.body.id;

    const producto = await api("POST", "/api/productos", {
      token: coord.token,
      body: {
        nombre: "Arroz",
        categoria: "Almacen",
        unidad: "KG",
        cantidadReferencia: 1,
        marca: "Gallo",
        codigoVariedad: "1111101",
      },
    });
    const producto2 = await api("POST", "/api/productos", {
      token: coord.token,
      body: { nombre: "Fideos", categoria: "Almacen", unidad: "G", cantidadReferencia: 500, codigoVariedad: "1111102" },
    });
    assert.equal(producto.status, 201);
    assert.equal(producto2.status, 201);
    state.productoId = producto.body.id;
    state.producto2Id = producto2.body.id;

    const sameButCase = await api("POST", "/api/productos", {
      token: coord.token,
      body: {
        nombre: "arroz",
        categoria: "Otra",
        unidad: "KG",
        cantidadReferencia: 1,
        marca: "GALLO",
        codigoVariedad: "1111101",
      },
    });
    const sameWithoutMarca = await api("POST", "/api/productos", {
      token: coord.token,
      body: { nombre: "Fideos", categoria: "Almacen", unidad: "G", cantidadReferencia: 500, codigoVariedad: "1111102" },
    });
    assert.equal(sameButCase.status, 409);
    assert.equal(sameWithoutMarca.status, 409);

    const unknownVariedad = await api("POST", "/api/productos", {
      token: coord.token,
      body: { nombre: "Otro", categoria: "x", unidad: "KG", cantidadReferencia: 1, codigoVariedad: "9999999" },
    });
    assert.equal(unknownVariedad.status, 400);

    // The basket: readable by any role, extended and deactivated only by the coordinator.
    const variedades = await api("GET", "/api/canasta?nivel=6", { token: analista.token });
    assert.equal(variedades.body.length, 2);
    const newVariedad = { codigo: "1111103", nombre: "Pan integral", padre: "11111", categoria: "NUCLEO" };
    assert.equal((await api("POST", "/api/canasta", { token: analista.token, body: newVariedad })).status, 403);
    assert.equal((await api("POST", "/api/canasta", { token: coord.token, body: newVariedad })).status, 201);
    assert.equal((await api("POST", "/api/canasta", { token: coord.token, body: newVariedad })).status, 409);
    assert.equal(
      (await api("PATCH", "/api/canasta/1111103/estado", { token: coord.token, body: { estado: "INACTIVO" } }))
        .status,
      200,
    );
    const inactiveVariedad = await api("POST", "/api/productos", {
      token: coord.token,
      body: { nombre: "Pan", categoria: "x", unidad: "KG", cantidadReferencia: 1, codigoVariedad: "1111103" },
    });
    assert.equal(inactiveVariedad.status, 400);

    const denied = await api("POST", "/api/comercios", {
      token: analista.token,
      body: { nombre: "x", direccion: "y", zona: "z", tipo: "OTRO" },
    });
    assert.equal(denied.status, 403);
    assert.equal((await api("GET", "/api/comercios?zona=Centro", { token: analista.token })).body.length, 1);
    assert.equal(
      (await api("PATCH", `/api/productos/${state.productoId}`, { token: coord.token, body: { estado: "INACTIVO" } }))
        .status,
      400,
    );
  });

  it("creates relevamientos and enforces uniqueness and format", async () => {
    const body = { periodo: "2026-10", frecuencia: "MENSUAL", fechaInicio: "2026-10-01", fechaLimite: "2026-10-31" };

    const created = await api("POST", "/api/relevamientos", { token: state.coord.token, body });
    assert.equal(created.status, 201);
    assert.equal(created.body.estado, "ABIERTO");
    state.relevamientoId = created.body.id;

    assert.equal((await api("POST", "/api/relevamientos", { token: state.coord.token, body })).status, 409);
    const badFormat = await api("POST", "/api/relevamientos", {
      token: state.coord.token,
      body: { ...body, periodo: "2026-10-Q1" },
    });
    assert.equal(badFormat.status, 400);
    const asAnalista = await api("POST", "/api/relevamientos", {
      token: state.analista.token,
      body: { ...body, periodo: "2026-11" },
    });
    assert.equal(asAnalista.status, 403);
  });

  it("assigns comercios and isolates encuestadores", async () => {
    const { coord, a, b, analista } = state;
    const body = { relevamiento: state.relevamientoId, encuestador: a.id, comercio: state.comercioId };

    const created = await api("POST", "/api/asignaciones", { token: coord.token, body });
    assert.equal(created.status, 201);
    assert.equal(created.body.estado, "PENDIENTE");
    state.asignacionId = created.body.id;

    const duplicate = await api("POST", "/api/asignaciones", { token: coord.token, body: { ...body, encuestador: b.id } });
    assert.equal(duplicate.status, 409);
    const notEncuestador = await api("POST", "/api/asignaciones", {
      token: coord.token,
      body: { ...body, encuestador: analista.id },
    });
    assert.equal(notEncuestador.status, 400);

    assert.equal((await api("GET", "/api/asignaciones", { token: a.token })).body.length, 1);
    assert.equal((await api("GET", "/api/asignaciones", { token: b.token })).body.length, 0);
    assert.equal((await api("GET", `/api/asignaciones/${state.asignacionId}`, { token: b.token })).status, 404);
    assert.equal(
      (await api("GET", `/api/asignaciones?encuestador=${a.id}`, { token: b.token })).body.length,
      0,
    );
  });

  it("only lets the assigned encuestador load prices while EN_CURSO", async () => {
    const { coord, a, b } = state;
    const precio = {
      relevamiento: state.relevamientoId,
      comercio: state.comercioId,
      producto: state.productoId,
      valor: 1250.5,
    };
    const asignacionUrl = `/api/asignaciones/${state.asignacionId}`;

    assert.equal((await api("POST", "/api/precios", { token: a.token, body: precio })).status, 403);
    assert.equal(
      (await api("PATCH", `${asignacionUrl}/estado`, { token: a.token, body: { estado: "COMPLETADA" } })).status,
      409,
    );
    assert.equal(
      (await api("PATCH", `${asignacionUrl}/estado`, { token: b.token, body: { estado: "EN_CURSO" } })).status,
      404,
    );
    assert.equal(
      (await api("PATCH", `${asignacionUrl}/estado`, { token: a.token, body: { estado: "EN_CURSO" } })).status,
      200,
    );
    assert.equal(
      (await api("PATCH", `${asignacionUrl}/encuestador`, { token: coord.token, body: { encuestador: b.id } })).status,
      409,
    );

    assert.equal((await api("POST", "/api/precios", { token: coord.token, body: precio })).status, 403);
    assert.equal((await api("POST", "/api/precios", { token: b.token, body: precio })).status, 403);

    const created = await api("POST", "/api/precios", { token: a.token, body: { ...precio, encuestador: b.id } });
    assert.equal(created.status, 201);
    assert.equal(created.body.encuestador, a.id);
    state.precioId = created.body.id;

    assert.equal((await api("POST", "/api/precios", { token: a.token, body: precio })).status, 409);
    const second = { ...precio, producto: state.producto2Id };
    assert.equal((await api("POST", "/api/precios", { token: a.token, body: { ...second, valor: 0 } })).status, 400);
    const future = await api("POST", "/api/precios", {
      token: a.token,
      body: { ...second, fechaRelevamiento: "2099-01-01" },
    });
    assert.equal(future.status, 400);
    assert.equal((await api("POST", "/api/precios", { token: a.token, body: { ...second, valor: 800 } })).status, 201);
  });

  it("edits, lists and paginates prices respecting ownership", async () => {
    const { a, b, analista } = state;

    const edited = await api("PATCH", `/api/precios/${state.precioId}`, { token: a.token, body: { valor: 1300 } });
    assert.equal(edited.body.valor, 1300);
    assert.equal(
      (await api("PATCH", `/api/precios/${state.precioId}`, { token: b.token, body: { valor: 1 } })).status,
      404,
    );

    assert.equal((await api("GET", "/api/precios", { token: a.token })).body.length, 2);
    assert.equal((await api("GET", "/api/precios", { token: b.token })).body.length, 0);
    const byRelevamiento = await api("GET", `/api/precios?relevamiento=${state.relevamientoId}&limit=10`, {
      token: analista.token,
    });
    assert.equal(byRelevamiento.body.length, 2);
    assert.equal((await api("GET", "/api/precios?limit=1", { token: analista.token })).body.length, 1);
    assert.equal((await api("GET", "/api/precios?limit=9999", { token: analista.token })).status, 400);
  });

  it("attaches receipts to a precio with validation, ownership and audit", async () => {
    const { coord, a, b, analista } = state;
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.from("JFIF-receipt")]);

    const created = await upload(state.precioId, a.token, jpeg);
    assert.equal(created.status, 201);
    assert.equal(created.body.mime, "image/jpeg");
    assert.equal(created.body.bytes, jpeg.length);
    assert.equal(created.body.clave, undefined);
    const adjuntoUrl = `/api/precios/${state.precioId}/adjuntos/${created.body.id}`;

    assert.equal((await upload(state.precioId, b.token, jpeg)).status, 404);
    assert.equal((await upload(state.precioId, coord.token, jpeg)).status, 403);
    assert.equal((await upload(state.precioId, a.token, Buffer.from("<script>1</script>"))).status, 415);
    assert.equal((await upload(state.precioId, a.token, Buffer.alloc(6 * 1024 * 1024, 0xff))).status, 413);

    assert.equal((await api("GET", `/api/precios/${state.precioId}/adjuntos`, { token: a.token })).body.length, 1);
    assert.equal((await api("GET", `/api/precios/${state.precioId}/adjuntos`, { token: b.token })).status, 404);

    const download = await fetch(`${baseUrl}${adjuntoUrl}`, { headers: { authorization: `Bearer ${analista.token}` } });
    assert.equal(download.status, 200);
    assert.equal(download.headers.get("content-type"), "image/jpeg");
    assert.equal(download.headers.get("x-content-type-options"), "nosniff");
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), jpeg);
    assert.equal((await readdir(uploadsDir)).length, 1);

    assert.equal((await api("DELETE", adjuntoUrl, { token: b.token })).status, 404);
    assert.equal((await api("DELETE", adjuntoUrl, { token: a.token })).status, 204);
    assert.equal((await api("GET", adjuntoUrl, { token: a.token })).status, 404);
    assert.deepEqual(await readdir(uploadsDir), []);

    const history = await api("GET", `/api/auditoria/precios?precio=${state.precioId}`, { token: analista.token });
    const attachmentEvents = history.body.filter((e: { accion: string }) => e.accion.startsWith("ADJUNTO_"));
    assert.deepEqual(
      attachmentEvents.map((e: { accion: string }) => e.accion),
      ["ADJUNTO_ELIMINADO", "ADJUNTO_AGREGADO"],
    );
    assert.equal(attachmentEvents[1].detalle.adjunto, created.body.id);
    assert.equal(attachmentEvents[1].detalle.bytes, jpeg.length);
    assert.equal(attachmentEvents[1].usuario, a.id);
  });

  it("freezes data after completion and closing", async () => {
    const { coord, a, b } = state;

    const completed = await api("PATCH", `/api/asignaciones/${state.asignacionId}/estado`, {
      token: a.token,
      body: { estado: "COMPLETADA" },
    });
    assert.equal(completed.status, 200);
    assert.equal(
      (await api("PATCH", `/api/precios/${state.precioId}`, { token: a.token, body: { valor: 1 } })).status,
      409,
    );

    // Once completed, only a supervisor can correct, and every change leaves an audit entry.
    const supervisorUser = {
      nombre: "Super",
      apellido: "Integration",
      dni: "20000009",
      legajo: "L-Super",
      email: "super@integration.test",
      password: PASSWORD,
      role: "SUPERVISOR",
    };
    assert.equal((await api("POST", "/api/users", { token: coord.token, body: supervisorUser })).status, 201);
    const sup = await login(supervisorUser.email, PASSWORD);

    const corrected = await api("PATCH", `/api/precios/${state.precioId}`, {
      token: sup.token,
      body: { valor: 1250, oferta: true },
    });
    assert.equal(corrected.status, 200);
    assert.equal(corrected.body.oferta, true);

    const full = await api("GET", `/api/auditoria/precios?precio=${state.precioId}`, { token: sup.token });
    // Attachment events are covered by their own test; here only changes to the price itself.
    const history = {
      body: full.body.filter((entry: { accion: string }) => !entry.accion.startsWith("ADJUNTO_")),
    };
    assert.deepEqual(
      history.body.map((entry: { accion: string }) => entry.accion),
      ["MODIFICACION", "MODIFICACION", "CREACION"],
    );
    assert.equal(history.body[0].rol, "SUPERVISOR");
    assert.equal(history.body[0].anterior.valor, 1300);
    assert.equal(history.body[0].posterior.valor, 1250);
    assert.equal(history.body[2].anterior, null);
    assert.equal((await api("GET", "/api/auditoria/precios", { token: a.token })).status, 403);

    // The analista corrects too (but cannot delete: removal stays with the owner).
    const byAnalista = await api("PATCH", `/api/precios/${state.precioId}`, {
      token: state.analista.token,
      body: { valor: 1250, oferta: true, observacion: "revisado" },
    });
    assert.equal(byAnalista.status, 200);
    assert.equal((await api("DELETE", `/api/precios/${state.precioId}`, { token: state.analista.token })).status, 403);

    assert.equal((await api("GET", "/api/precios?oferta=true", { token: sup.token })).body.length, 1);
    assert.equal((await api("GET", "/api/precios?oferta=false", { token: sup.token })).body.length, 1);

    const closeUrl = `/api/relevamientos/${state.relevamientoId}/cerrar`;
    assert.equal((await api("PATCH", closeUrl, { token: a.token })).status, 403);
    assert.equal((await api("PATCH", closeUrl, { token: coord.token })).body.estado, "CERRADO");
    assert.equal((await api("PATCH", closeUrl, { token: coord.token })).status, 409);

    const lateAssignment = await api("POST", "/api/asignaciones", {
      token: coord.token,
      body: { relevamiento: state.relevamientoId, encuestador: b.id, comercio: state.comercioId },
    });
    assert.equal(lateAssignment.status, 409);
    const missing = await api("PATCH", "/api/relevamientos/00000000-0000-4000-8000-000000000099/cerrar", { token: coord.token });
    assert.equal(missing.status, 404);
  });

  it("rate limits repeated failed logins without blocking other accounts", async () => {
    for (let i = 0; i < 5; i++) {
      assert.equal((await login("target@integration.test", "wrong")).status, 401);
    }

    assert.equal((await login("target@integration.test", "wrong")).status, 429);
    assert.equal((await login("someone-else@integration.test", "wrong")).status, 401);
    assert.equal((await login(COORDINADOR_EMAIL, COORDINADOR_PASSWORD)).status, 200);
  });
});
