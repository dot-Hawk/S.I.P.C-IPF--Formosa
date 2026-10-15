// Sample data to try the system by hand (a surveyor, a survey, commerces, products and
// assignments), created through the public API as the coordinator would. Idempotent: what already
// exists is found and reused, so it can be run again safely.

export interface DevApiResponse {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
}

export interface DevApi {
  get(path: string): Promise<DevApiResponse>;
  post(path: string, body: unknown): Promise<DevApiResponse>;
}

export interface DevDataOptions {
  encuestador: { email: string; password: string };
  today?: Date;
}

export interface DevDataSummary {
  created: { encuestador: number; relevamiento: number; comercios: number; productos: number; asignaciones: number };
  encuestadorEmail: string;
  periodo: string;
}

const COMERCIOS = [
  { nombre: "Supermercado Dev", direccion: "Av. 25 de Mayo 100", zona: "Centro", tipo: "SUPERMERCADO" },
  { nombre: "Almacén Dev", direccion: "Belgrano 250", zona: "Norte", tipo: "ALMACEN" },
  { nombre: "Verdulería Dev", direccion: "San Martín 480", zona: "Sur", tipo: "VERDULERIA" },
];
const PRODUCTOS_MAX = 5;

async function expect(response: Promise<DevApiResponse>, what: string, accepted: number[]): Promise<DevApiResponse> {
  const result = await response;
  if (!accepted.includes(result.status)) {
    throw new Error(`${what} failed (${result.status}): ${JSON.stringify(result.body)}`);
  }
  return result;
}

function monthRange(today: Date) {
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const pad = (n: number) => String(n).padStart(2, "0");
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return {
    periodo: `${year}-${pad(month + 1)}`,
    fechaInicio: `${year}-${pad(month + 1)}-01`,
    fechaLimite: `${year}-${pad(month + 1)}-${pad(last)}`,
  };
}

export async function bootstrapDevData(api: DevApi, options: DevDataOptions): Promise<DevDataSummary> {
  const created = { encuestador: 0, relevamiento: 0, comercios: 0, productos: 0, asignaciones: 0 };
  const { email, password } = options.encuestador;
  const range = monthRange(options.today ?? new Date());

  // Surveyor
  const user = await expect(
    api.post("/api/users", {
      nombre: "Encuestador",
      apellido: "De Prueba",
      dni: "90000001",
      legajo: "DEV-ENC-1",
      email,
      password,
      role: "ENCUESTADOR",
    }),
    "POST /api/users",
    [201, 409],
  );
  let encuestadorId: string;
  if (user.status === 201) {
    created.encuestador++;
    encuestadorId = user.body.id;
  } else {
    const found = (await expect(api.get("/api/users?role=ENCUESTADOR"), "GET /api/users", [200])).body.find(
      (u: { email: string }) => u.email === email.toLowerCase(),
    );
    if (!found) throw new Error(`A user with the dni or legajo of the test surveyor exists but not with ${email}`);
    encuestadorId = found.id;
  }

  // Relevamiento
  const relevamiento = await expect(
    api.post("/api/relevamientos", { ...range, frecuencia: "MENSUAL" }),
    "POST /api/relevamientos",
    [201, 409],
  );
  let relevamientoId: string;
  if (relevamiento.status === 201) {
    created.relevamiento++;
    relevamientoId = relevamiento.body.id;
  } else {
    const found = (await expect(api.get("/api/relevamientos"), "GET /api/relevamientos", [200])).body.find(
      (r: { periodo: string }) => r.periodo === range.periodo,
    );
    if (!found) throw new Error(`The relevamiento ${range.periodo} exists but could not be found`);
    relevamientoId = found.id;
  }

  // Commerces
  const comercioIds: string[] = [];
  const existing = (await expect(api.get("/api/comercios"), "GET /api/comercios", [200])).body as {
    id: string;
    nombre: string;
  }[];
  for (const comercio of COMERCIOS) {
    const found = existing.find((c) => c.nombre === comercio.nombre);
    if (found) {
      comercioIds.push(found.id);
      continue;
    }
    const result = await expect(api.post("/api/comercios", comercio), "POST /api/comercios", [201]);
    created.comercios++;
    comercioIds.push(result.body.id);
  }

  // Products, one per active variedad of the basket
  const variedades = (await expect(api.get("/api/canasta?nivel=6&estado=ACTIVO"), "GET /api/canasta", [200])).body as {
    codigo: string;
    nombre: string;
  }[];
  for (const variedad of variedades.slice(0, PRODUCTOS_MAX)) {
    const result = await expect(
      api.post("/api/productos", {
        nombre: variedad.nombre,
        categoria: "Dev",
        unidad: "UNIDAD",
        cantidadReferencia: 1,
        codigoVariedad: variedad.codigo,
      }),
      "POST /api/productos",
      [201, 409],
    );
    if (result.status === 201) created.productos++;
  }

  // Assignments: the surveyor visits every commerce
  for (const comercio of comercioIds) {
    const result = await expect(
      api.post("/api/asignaciones", { relevamiento: relevamientoId, encuestador: encuestadorId, comercio }),
      "POST /api/asignaciones",
      [201, 409],
    );
    if (result.status === 201) created.asignaciones++;
  }

  return { created, encuestadorEmail: email, periodo: range.periodo };
}
