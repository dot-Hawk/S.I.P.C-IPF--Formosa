# SIPC-IPF Backend

REST API for SIPC-IPF (Formosa): price survey management (relevamientos, commerces, products, assignments, prices) with role-based access.

Stack: Node.js, TypeScript, Express 5, PostgreSQL with Drizzle ORM (versioned SQL migrations), `tsx`, `node:test`.

## Requirements

- Node.js (a version that supports ESM and `node:test`)
- PostgreSQL 14 or newer (`docker compose up -d db` starts one for development)

## Getting started

```bash
npm install
docker compose up -d db          # PostgreSQL on localhost:5432 (user, password and database: sipc)
cp .env.example .env             # then fill in the values
npm run db:migrate               # create the tables
npm run dev
```

## Environment variables

See `.env.example` for the full list.

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection string, e.g. `postgres://sipc:sipc@localhost:5432/sipc`. The server exits on startup if it cannot connect. |
| `PORT` | no | HTTP port. |
| `JWT_SECRET` | yes | Secret used to sign tokens (HS256). |
| `JWT_EXPIRES_IN` | no | Token lifetime. Defaults to `8h`. |
| `TRUST_PROXY` | no | Number of proxy hops to trust. Set it when running behind a reverse proxy so rate limiting sees the real client IP. |
| `SEED_NOMBRE`, `SEED_APELLIDO`, `SEED_DNI`, `SEED_LEGAJO`, `SEED_EMAIL`, `SEED_PASSWORD` | seed only | Data for the first coordinator user. |
| `DATABASE_TEST_URL` | integration tests only | Throwaway database for `test:integration`. Its schema is dropped. |

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start the server in watch mode. |
| `npm run db:migrate` | Apply the pending SQL migrations (`drizzle/`). |
| `npm run db:generate` | Generate a new migration after editing `src/db/schema.ts`. |
| `npm run seed:coordinador` | Create the first `COORDINADOR` user. |
| `npm run import:canasta -- <dir>` | Import the basket from the official workbooks (see below). |
| `npm test` | Unit tests. No database needed. |
| `npm run test:integration` | Full API flow against a real PostgreSQL. |
| `npm run typecheck` | Type-check without emitting. |

## First user (seed)

No endpoint can create the first user, because user creation requires a `COORDINADOR`. Seed it once:

1. Set the `SEED_*` variables in `.env`.
2. Run `npm run seed:coordinador`.
3. Remove `SEED_PASSWORD` from `.env`.

The script is idempotent: it does nothing if a `COORDINADOR` already exists.

## Tests

Unit tests are colocated with the code (`src/**/*.test.ts`) and use fake repositories instead of a database:

```bash
npm test
```

The integration test (`test/integration/api-flow.test.ts`) applies the migrations and exercises the whole business flow against a real PostgreSQL:

```bash
docker run -d --rm --name sipc-pg-test -p 5433:5432 -e POSTGRES_PASSWORD=test -e POSTGRES_DB=sipc_integration_test postgres:16
DATABASE_TEST_URL=postgres://postgres:test@127.0.0.1:5433/sipc_integration_test npm run test:integration
docker stop sipc-pg-test
```

- It is skipped when `DATABASE_TEST_URL` is unset.
- The schema is **dropped before and after** the run, so the test refuses to run unless the database name contains `test`.
- Tests are sequential and share state on purpose: they model one business flow, so a failure early on cascades.

## Basket (canasta)

The basket is a fixed 7-level tree: `NIVEL_GENERAL` (0) → `DIVISION` → `GRUPO` → `CLASE` → `SUBCLASE` → `PRODUCTO` → `VARIEDAD` (6, the level that is priced). Every variedad also belongs to one non-hierarchical `categoria`: `NUCLEO`, `ESTACIONAL` or `REGULADO`.

Import it once from the official workbooks (`PONDERADORES.xlsx`, `DICCIONARIO_VARIEDADES.xlsx`, `TRATAMIENTO_ESPECIAL.xlsx`):

```bash
npm run import:canasta -- /path/to/Recursos   # or set CANASTA_RECURSOS_DIR
```

- It is idempotent: it only writes what is new or changed, and never reactivates a deactivated variedad.
- The spreadsheets have holes in the intermediate levels; those nodes are rebuilt from their variedades and flagged `derivado: true`.
- Every `Producto` must point to an active variedad through `codigoVariedad` (7 digits).

## API overview

All routes are under `/api`. Errors are JSON and never include stack traces. Resources are identified by UUIDs (field `id`); basket nodes by their `codigo`.

| Prefix | Purpose |
| --- | --- |
| `/api/auth` | Login (JWT). |
| `/api/users` | User creation. |
| `/api/relevamientos` | Survey cycles, close with `PATCH /:id/cerrar`. |
| `/api/comercios` | Commerce catalog. |
| `/api/canasta` | Basket tree (7 levels): read, add a variedad, deactivate a variedad. |
| `/api/productos` | Product catalog. |
| `/api/asignaciones` | Surveyor assignments and state transitions. |
| `/api/precios` | Price capture and queries (`oferta=true\|false` filter). |
| `/api/auditoria/precios` | Audit trail of prices (not available to `ENCUESTADOR`). |

### Roles

`ENCUESTADOR`, `SUPERVISOR`, `ANALISTA`, `COORDINADOR`, `DIRECCION`.

- Writes to users, relevamientos, catalogs and assignments: `COORDINADOR` only.
- Reads: any authenticated role (`DIRECCION` is effectively read-only).
- Prices are created by `ENCUESTADOR` only, for their own `EN_CURSO` assignments; `SUPERVISOR` corrects them.
- An `ENCUESTADOR` only sees their own data; other people's resources respond `404`, not `403`.

### Business rules worth knowing

- **Relevamiento:** always created `ABIERTO`; unique per period + frequency (`2026-10` monthly, `2026-10-Q1`/`Q2` biweekly); closing is atomic and returns `409` if already closed.
- **Comercio / Producto:** no `DELETE`; deactivate through `PATCH /:id/estado`. A producto is unique by `nombre` + `marca` + `unidad` + `cantidadReferencia` (case-insensitive; a missing `marca` counts as one value), otherwise `409`.
- **Asignación:** `PENDIENTE` → `EN_CURSO` → `COMPLETADA` only; reassignment only while `PENDIENTE`; requires an open relevamiento and an active commerce and surveyor.
- **Precio:** `valor > 0`, date not in the future nor before the relevamiento start; edit/delete only by the owner while the relevamiento is open and the assignment is `EN_CURSO`. `oferta` marks a promotional price: it is stored as registered and only used to filter. A `SUPERVISOR` can correct (`PATCH`, not delete) any price, even after the assignment is `COMPLETADA`, but only while the relevamiento is open.
- **Login rate limit:** only failed attempts count; 5 per IP+email and 30 per IP every 15 minutes, then `429` with `Retry-After`. Counters live in memory, so they reset on restart and are not shared between instances.

## Project layout

```
src/
  app.ts            Express app (routes, error handlers)
  server.ts         Entry point (DB connection, listen)
  config/           Auth configuration
  db/               Drizzle schema, connection, migration runner
  repositories/     Data access behind interfaces (the only code that talks SQL)
  auth/             Token service, seed logic
  services/         Import of the basket
  controllers/      Factories that receive repositories (testable with fakes)
  domain/           Pure business rules and the shared enums
  middlewares/      authenticate, authorize, validateBody, rate limit
  routes/           Routers
  validators/       Hand-written input validators
  utils/            SQL error mapping, uuid checks
  scripts/          CLI scripts (seed, basket import)
drizzle/            Versioned SQL migrations
test/integration/   End-to-end flow against PostgreSQL
```

## Known limitations

- Rate limiting is per process; use a shared store (e.g. Redis) before running multiple instances.
- No `helmet` or CORS configuration yet (add when the frontend exists).
- The price calculation engine (Python service) is not implemented yet.
