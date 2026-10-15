import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { type Server } from "node:http";
import { type AddressInfo } from "node:net";

// Integration test of the calculation: real Express app, real PostgreSQL and the real engine.
//
//   DATABASE_TEST_URL=postgres://postgres:test@127.0.0.1:5433/sipc_integration_test \
//   ENGINE_TEST_URL=http://127.0.0.1:8765 ENGINE_TEST_API_KEY=smoke-key \
//   npm run test:integration
//
// The schema is DROPPED before and after the run, so the database name must contain "test".

const DATABASE_TEST_URL = process.env["DATABASE_TEST_URL"];
const ENGINE_TEST_URL = process.env["ENGINE_TEST_URL"];
const ENGINE_TEST_API_KEY = process.env["ENGINE_TEST_API_KEY"];

const skipReason = !DATABASE_TEST_URL
  ? "DATABASE_TEST_URL is not set"
  : !/test/i.test(new URL(DATABASE_TEST_URL).pathname)
    ? 'the database name must contain "test"'
    : !ENGINE_TEST_URL || !ENGINE_TEST_API_KEY
      ? "ENGINE_TEST_URL and ENGINE_TEST_API_KEY are not set"
      : false;

const PASSWORD = "password-largo-1";

describe("Calculation flow (real PostgreSQL and engine)", { skip: skipReason }, () => {
  let server: Server;
  let baseUrl: string;
  let db: typeof import("../../src/db/index.js") | undefined;
  const tokens = {} as { coord: string; analista: string; encuestador: string };
  let calculoId: string;

  async function api(method: string, path: string, options: { token?: string; body?: unknown } = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
    const text = await response.text();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { status: response.status, body: (text ? JSON.parse(text) : undefined) as any };
  }

  before(async () => {
    process.env["JWT_SECRET"] = "integration-test-secret";
    process.env["DATABASE_URL"] = DATABASE_TEST_URL as string;
    process.env["ENGINE_URL"] = ENGINE_TEST_URL as string;
    process.env["ENGINE_API_KEY"] = ENGINE_TEST_API_KEY as string;

    db = await import("../../src/db/index.js");
    const { pool } = db.getDbHandle();
    await pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
    await pool.query("DROP SCHEMA public CASCADE");
    await pool.query("CREATE SCHEMA public");
    await (await import("../../src/db/migrate.js")).runMigrations();

    const [{ default: app }, schema, { buildCanasta }, { importCanasta }, { createCanastaRepository }, bcrypt] =
      await Promise.all([
        import("../../src/app.js"),
        import("../../src/db/schema.js"),
        import("../../src/domain/canasta.js"),
        import("../../src/services/canasta-import.service.js"),
        import("../../src/repositories/canasta.repository.js"),
        import("bcryptjs"),
      ]);
    const drizzle = db.getDb();

    const chain = { producto: "11111", subclase: "1111", clase: "111", grupo: "11", division: "1" };
    const basket = buildCanasta({
      nodos: [
        { codigo: "0", nombre: "NIVEL GENERAL", nivel: 0, ponderador: 1 },
        { codigo: "1", nombre: "ALIMENTOS", nivel: 1, ponderador: 1 },
        { codigo: "11", nombre: "EN EL HOGAR", nivel: 2, ponderador: 1 },
        { codigo: "111", nombre: "PANIFICACION", nivel: 3, ponderador: 1 },
        { codigo: "1111", nombre: "PANIFICACION", nivel: 4, ponderador: 1 },
        { codigo: "11111", nombre: "Pan fresco", nivel: 5, ponderador: 1 },
        { codigo: "1111101", nombre: "Arroz", nivel: 6, ponderador: 1, ...chain },
      ],
      categorias: { NUCLEO: ["1111101"], ESTACIONAL: [], REGULADO: [] },
      codigos12: { "1111101": "A0111111" },
      tratamientoEspecial: [],
    });
    await importCanasta(createCanastaRepository(drizzle), basket.nodos);

    const passwordHash = await bcrypt.default.hash(PASSWORD, 4);
    const [coord, analista, encuestador] = await drizzle
      .insert(schema.users)
      .values(
        (["COORDINADOR", "ANALISTA", "ENCUESTADOR"] as const).map((role, i) => ({
          nombre: role,
          apellido: "Test",
          dni: `3000000${i}`,
          legajo: `T-${i}`,
          email: `${role.toLowerCase()}@calc.test`,
          passwordHash,
          role,
          estado: "ACTIVO" as const,
        })),
      )
      .returning();
    assert.ok(coord && analista && encuestador);

    const [almacen1, almacen2, super1] = await drizzle
      .insert(schema.comercios)
      .values([
        { nombre: "Almacen 1", direccion: "x", zona: "Centro", tipo: "ALMACEN", estado: "ACTIVO" },
        { nombre: "Almacen 2", direccion: "x", zona: "Centro", tipo: "ALMACEN", estado: "ACTIVO" },
        { nombre: "Super 1", direccion: "x", zona: "Centro", tipo: "SUPERMERCADO", estado: "ACTIVO" },
      ])
      .returning();
    const [producto] = await drizzle
      .insert(schema.productos)
      .values({
        nombre: "Arroz",
        categoria: "Almacen",
        unidad: "KG",
        cantidadReferencia: 1,
        codigoVariedad: "1111101",
        estado: "ACTIVO",
      })
      .returning();
    assert.ok(almacen1 && almacen2 && super1 && producto);

    const periodos = ["2026-01", "2026-02", "2026-03"];
    const relevamientos = await drizzle
      .insert(schema.relevamientos)
      .values(
        periodos.map((periodo, i) => ({
          periodo,
          frecuencia: "MENSUAL" as const,
          fechaInicio: new Date(`2026-0${i + 1}-01T00:00:00Z`),
          fechaLimite: new Date(`2026-0${i + 1}-28T00:00:00Z`),
          estado: "CERRADO" as const,
        })),
      )
      .returning();

    // Almacen 1: 100, 110, 132. Almacen 2: 100, 100, 110. Super 1: 200, 220 and no price in March.
    const valores: Record<string, (number | null)[]> = {
      [almacen1.id]: [100, 110, 132],
      [almacen2.id]: [100, 100, 110],
      [super1.id]: [200, 220, null],
    };
    const rows = relevamientos.flatMap((relevamiento, mes) =>
      Object.entries(valores).flatMap(([comercio, precios]) => {
        const valor = precios[mes];
        return valor === null || valor === undefined
          ? []
          : [
              {
                relevamiento: relevamiento.id,
                producto: producto.id,
                comercio,
                encuestador: encuestador.id,
                valor,
                fechaRelevamiento: relevamiento.fechaInicio,
              },
            ];
      }),
    );
    await drizzle.insert(schema.precios).values(rows);

    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    for (const [key, email] of [
      ["coord", "coordinador@calc.test"],
      ["analista", "analista@calc.test"],
      ["encuestador", "encuestador@calc.test"],
    ] as const) {
      const login = await api("POST", "/api/auth/login", { body: { email, password: PASSWORD } });
      assert.equal(login.status, 200);
      tokens[key] = login.body.token;
    }
  });

  after(async () => {
    server?.close();
    if (db) {
      const { pool } = db.getDbHandle();
      await pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
      await pool.query("DROP SCHEMA public CASCADE");
      await pool.query("CREATE SCHEMA public");
      await db.closeDb();
    }
  });

  it("only analysts and coordinators can run a calculation", async () => {
    const body = { mesBase: "2026-01", mesObjetivo: "2026-03" };

    assert.equal((await api("POST", "/api/calculos", { token: tokens.encuestador, body })).status, 403);
    assert.equal((await api("POST", "/api/calculos", { body })).status, 401);
    assert.equal(
      (await api("POST", "/api/calculos", { token: tokens.analista, body: { mesBase: "x" } })).status,
      400,
    );
  });

  it("runs the engine over closed relevamientos, imputes and stores the results", async () => {
    const created = await api("POST", "/api/calculos", {
      token: tokens.analista,
      body: { mesBase: "2026-01", mesObjetivo: "2026-03" },
    });

    assert.equal(created.status, 201);
    assert.equal(created.body.estado, "COMPLETADO");
    assert.equal(created.body.motorVersion.length > 0, true);
    assert.equal(created.body.resumen.imputaciones, 1);
    assert.equal(created.body.resumen.sinImputar, 0);
    assert.match(created.body.entradaHash, /^[0-9a-f]{64}$/);
    calculoId = created.body.id;

    const relativos = await api("GET", `/api/calculos/${calculoId}/relativos`, { token: tokens.analista });
    assert.equal(relativos.status, 200);
    assert.equal(relativos.body.length, 2);

    // February: Almacen 1 +10%, Almacen 2 0%, Super 1 +10%.
    // TRAD = geometric mean of 110/100 and 100/100; SUPER = 220/200. Weights 0.75 / 0.25.
    const trad = Math.sqrt(1.1 * 1.0);
    const february = relativos.body.find((r: { mes: string }) => r.mes === "2026-02");
    assert.ok(Math.abs(february.valor - Math.pow(1.1, 0.25) * Math.pow(trad, 0.75)) < 1e-9);
    assert.equal(february.nSuper, 1);
    assert.equal(february.nTrad, 2);

    const imputaciones = await api("GET", `/api/calculos/${calculoId}/imputaciones`, { token: tokens.analista });
    assert.equal(imputaciones.body.length, 1);
    assert.equal(imputaciones.body[0].mes, "2026-03");
    assert.equal(imputaciones.body[0].nivel, 0);
    // The missing March price is February's 220 times the geometric mean of 132/110 and 110/100.
    assert.ok(Math.abs(imputaciones.body[0].precio - 220 * Math.sqrt(1.2 * 1.1)) < 1e-6);
  });

  it("lists and reads runs, and filters the relatives", async () => {
    const list = await api("GET", "/api/calculos", { token: tokens.coord });
    assert.equal(list.body.length, 1);

    const one = await api("GET", `/api/calculos/${calculoId}`, { token: tokens.coord });
    assert.equal(one.body.id, calculoId);

    const filtered = await api("GET", `/api/calculos/${calculoId}/relativos?mes=2026-03`, { token: tokens.coord });
    assert.equal(filtered.body.length, 1);

    assert.equal((await api("GET", `/api/calculos/${calculoId}`, { token: tokens.encuestador })).status, 403);
    assert.equal(
      (await api("GET", "/api/calculos/00000000-0000-4000-8000-000000000099", { token: tokens.coord })).status,
      404,
    );
  });

  it("leaves out promotional prices when asked, producing a different input", async () => {
    const { pool } = (db as NonNullable<typeof db>).getDbHandle();
    await pool.query("UPDATE precios SET oferta = true WHERE valor = 132");

    const withOffers = await api("POST", "/api/calculos", {
      token: tokens.coord,
      body: { mesBase: "2026-01", mesObjetivo: "2026-03" },
    });
    const withoutOffers = await api("POST", "/api/calculos", {
      token: tokens.coord,
      body: { mesBase: "2026-01", mesObjetivo: "2026-03", excluirOfertas: true },
    });

    assert.equal(withOffers.status, 201);
    assert.equal(withoutOffers.status, 201);
    assert.notEqual(withOffers.body.entradaHash, withoutOffers.body.entradaHash);
    assert.equal(withoutOffers.body.excluirOfertas, true);
  });

  it("downloads the planilla of a run for every reading role", async () => {
    const url = `${baseUrl}/api/calculos/${calculoId}/resultados`;

    const csv = await fetch(`${url}?formato=csv`, { headers: { authorization: `Bearer ${tokens.coord}` } });
    assert.equal(csv.status, 200);
    const lines = (await csv.text()).trim().split("\r\n");
    assert.equal(lines[0], "VARIEDAD,2026-02,2026-03");
    assert.equal(lines.length, 1 + new Set((await api("GET", `/api/calculos/${calculoId}/relativos`, { token: tokens.coord })).body.map((r: { variedad: string }) => r.variedad)).size);

    const xlsx = await fetch(url, { headers: { authorization: `Bearer ${tokens.analista}` } });
    assert.equal(xlsx.status, 200);
    assert.equal((await xlsx.arrayBuffer()).byteLength > 0, true);

    assert.equal((await fetch(url, { headers: { authorization: `Bearer ${tokens.encuestador}` } })).status, 403);
  });

  it("exports the engine input as a file the engine accepts, with the same result as the run", async () => {
    const query = "mesBase=2026-01&mesObjetivo=2026-03";
    const url = (formato: string) => `${baseUrl}/api/calculos/exportacion?${query}&formato=${formato}`;
    const headers = (token: string) => ({ authorization: `Bearer ${token}` });

    assert.equal((await fetch(url("xlsx"), { headers: headers(tokens.encuestador) })).status, 403);

    const csv = await fetch(url("csv"), { headers: headers(tokens.analista) });
    assert.equal(csv.status, 200);
    const lines = (await csv.text()).trim().split("\r\n");
    assert.equal(lines[0], "VARIEDAD,INFORMANTE,TIPO,MES,PRECIO");
    assert.ok(lines.length > 1);

    const xlsx = await fetch(url("xlsx"), { headers: headers(tokens.analista) });
    assert.equal(xlsx.status, 200);
    const file = await xlsx.arrayBuffer();

    const form = new FormData();
    form.set("file", new Blob([file]), "precios.xlsx");
    form.set("mesBase", "2026-01");
    form.set("mesObjetivo", "2026-03");
    const engineResponse = await fetch(`${ENGINE_TEST_URL}/v1/calculo/excel`, {
      method: "POST",
      headers: { "x-api-key": ENGINE_TEST_API_KEY as string },
      body: form,
    });
    assert.equal(engineResponse.status, 200);
    const fromFile = (await engineResponse.json()) as { relativos: { variedad: string; mes: string; valor: number }[] };

    const stored = await api("GET", `/api/calculos/${calculoId}/relativos`, { token: tokens.analista });
    const key = (r: { variedad: string; mes: string }) => `${r.variedad}|${r.mes}`;
    const expected = new Map<string, number>(stored.body.map((r: { variedad: string; mes: string; valor: number }) => [key(r), r.valor]));
    for (const relativo of fromFile.relativos.filter((r) => r.valor !== null)) {
      assert.ok(Math.abs((expected.get(key(relativo)) ?? NaN) - relativo.valor) < 1e-9);
    }
    assert.equal(fromFile.relativos.filter((r) => r.valor !== null).length, stored.body.length);
  });

  it("refuses to run while a relevamiento of the range is open", async () => {
    const { pool } = (db as NonNullable<typeof db>).getDbHandle();
    await pool.query("UPDATE relevamientos SET estado = 'ABIERTO' WHERE periodo = '2026-02'");

    const res = await api("POST", "/api/calculos", {
      token: tokens.coord,
      body: { mesBase: "2026-01", mesObjetivo: "2026-03" },
    });

    assert.equal(res.status, 409);
    assert.match(res.body.message, /2026-02/);
  });

  it("warns when a new price is far from the history of the producto in that commerce", async () => {
    const { pool } = (db as NonNullable<typeof db>).getDbHandle();
    await pool.query("UPDATE relevamientos SET estado = 'CERRADO'");
    // An earlier test marked a price as a promotion, and promotions are not part of the history.
    await pool.query("UPDATE precios SET oferta = false");

    const rel = await pool.query(
      `INSERT INTO relevamientos (periodo, frecuencia, fecha_inicio, fecha_limite, estado)
       VALUES ('2026-04', 'MENSUAL', '2026-04-01', '2026-04-28', 'ABIERTO') RETURNING id`,
    );
    const comercio = await pool.query("SELECT id FROM comercios WHERE nombre = 'Almacen 1'");
    const encuestador = await pool.query("SELECT id FROM users WHERE role = 'ENCUESTADOR'");
    const producto = await pool.query("SELECT id FROM productos LIMIT 1");
    await pool.query(
      `INSERT INTO asignaciones (relevamiento_id, encuestador_id, comercio_id, estado)
       VALUES ($1, $2, $3, 'EN_CURSO')`,
      [rel.rows[0].id, encuestador.rows[0].id, comercio.rows[0].id],
    );

    const body = {
      relevamiento: rel.rows[0].id,
      comercio: comercio.rows[0].id,
      producto: producto.rows[0].id,
      valor: 5000,
    };

    // History of this producto at Almacen 1: 100, 110, 132.
    const warned = await api("POST", "/api/precios", { token: tokens.encuestador, body });
    assert.equal(warned.status, 409);
    assert.equal(warned.body.requiereConfirmacion, true);
    assert.equal(warned.body.alerta.n, 3);
    assert.ok(Math.abs(warned.body.alerta.media - 114) < 1e-9);

    const confirmed = await api("POST", "/api/precios", {
      token: tokens.encuestador,
      body: { ...body, confirmarDesvio: true },
    });
    assert.equal(confirmed.status, 201);
    assert.equal(confirmed.body.alerta.n, 3);

    const flagged = await api("GET", "/api/precios?conAlerta=true", { token: tokens.analista });
    assert.equal(flagged.body.length, 1);
    assert.equal(flagged.body[0].id, confirmed.body.id);

    // A usual value on a new price is saved without any alert.
    const usual = await api("PATCH", `/api/precios/${confirmed.body.id}`, {
      token: tokens.encuestador,
      body: { valor: 120 },
    });
    assert.equal(usual.status, 200);
    assert.equal(usual.body.alerta, null);
  });
});
