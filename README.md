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
| `CORS_ORIGINS` | for a browser frontend | Comma separated origins allowed to call the API (e.g. `http://localhost:5173`). Empty means no cross-origin access. |
| `UPLOADS_DIR` | no | Directory where receipt attachments are stored. Defaults to `./uploads` (git-ignored). Back it up together with the database. |
| `ENGINE_URL` | for calculations | Base URL of the calculation engine (`engine/`). The API boots without it; `POST /api/calculos` answers `502` until it is set. |
| `ENGINE_API_KEY` | for calculations | Key sent to the engine in `X-API-Key`. Must be the engine's own `ENGINE_API_KEY`. |
| `ENGINE_TIMEOUT_MS` | no | How long to wait for the engine. Defaults to 120000. |
| `DATABASE_TEST_URL` | integration tests only | Throwaway database for `test:integration`. Its schema is dropped. |
| `ENGINE_TEST_URL`, `ENGINE_TEST_API_KEY` | calculation integration test | A running engine for `test/integration/calculo-flow.test.ts`; skipped without them. |

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start the server in watch mode. |
| `npm run db:migrate` | Apply the pending SQL migrations (`drizzle/`). |
| `npm run db:generate` | Generate a new migration after editing `src/db/schema.ts`. |
| `npm run seed:coordinador` | Create the first `COORDINADOR` user. |
| `npm run import:canasta -- <dir>` | Import the basket from the official workbooks (see below). |
| `npm run dev:bootstrap` | Local only: create the coordinator (`SEED_EMAIL`, `SEED_PASSWORD`) and sample data through the API (a test surveyor, the current month's relevamiento, 3 comercios, 5 productos and their asignaciones). Idempotent. |
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
| `/api/auth` | Login (JWT), `GET /me`, `POST /password` (change your own). |
| `/api/users` | User management (`COORDINADOR`): create, list, read, edit, `PATCH /:id/estado`, `PUT /:id/password`. |
| `/api/relevamientos` | Survey cycles, close with `PATCH /:id/cerrar`. |
| `/api/comercios` | Commerce catalog. |
| `/api/canasta` | Basket tree (7 levels): read, add a variedad, deactivate a variedad. |
| `/api/productos` | Product catalog. |
| `/api/asignaciones` | Surveyor assignments and state transitions. |
| `/api/precios` | Price capture and queries (`oferta=true\|false` filter). |
| `/api/precios/:id/adjuntos` | Receipt photos/scans of a price: upload (raw body), list, download, delete. |
| `/api/auditoria/precios` | Audit trail of prices (not available to `ENCUESTADOR`). |
| `/api/calculos` | Run the calculation engine over closed relevamientos; read runs, relatives and imputations; export the engine's input as Excel/CSV (`GET /exportacion`); download the planilla of a run (`GET /:id/resultados`). |

### Roles

`ENCUESTADOR`, `SUPERVISOR`, `ANALISTA`, `COORDINADOR`, `DIRECCION`.

- Writes to users, relevamientos, catalogs and assignments: `COORDINADOR` only.
- Reads: any authenticated role (`DIRECCION` is effectively read-only).
- Prices are created by `ENCUESTADOR` only, for their own `EN_CURSO` assignments; `SUPERVISOR` and `ANALISTA` correct them.
- An `ENCUESTADOR` only sees their own data; other people's resources respond `404`, not `403`.

### Business rules worth knowing

- **Relevamiento:** always created `ABIERTO`; unique per period + frequency (`2026-10` monthly, `2026-10-Q1`/`Q2` biweekly); closing is atomic and returns `409` if already closed.
- **Comercio / Producto:** no `DELETE`; deactivate through `PATCH /:id/estado`. A producto is unique by `nombre` + `marca` + `unidad` + `cantidadReferencia` (case-insensitive; a missing `marca` counts as one value), otherwise `409`.
- **Asignación:** `PENDIENTE` → `EN_CURSO` → `COMPLETADA` only; reassignment only while `PENDIENTE`; requires an open relevamiento and an active commerce and surveyor.
- **Precio:** `valor > 0`, date not in the future nor before the relevamiento start; edit/delete only by the owner while the relevamiento is open and the assignment is `EN_CURSO`. `oferta` marks a promotional price: it is stored as registered and only used to filter. A `SUPERVISOR` or an `ANALISTA` can correct (`PATCH`, not delete) any price, even after the assignment is `COMPLETADA`, but only while the relevamiento is open.
- **Price warning:** a new price (or a new value) is compared with the history of the same producto in the same commerce in earlier relevamientos, promotions excluded. With at least 3 observations, it is flagged when it is farther from the mean than 3 standard deviations, and never for less than 10% of the mean. The flag is a warning, not a rejection: `POST`/`PATCH /api/precios` answers `409` with `requiereConfirmacion` and the `alerta` (mean, deviation, usual range); resend it with `confirmarDesvio: true` to save it, and it is stored with its `alerta`. Promotional prices are not judged. `GET /api/precios?conAlerta=true` lists the confirmed ones for review.
- **Calculation:** `POST /api/calculos` (`ANALISTA`, `COORDINADOR`) takes `mesBase` and `mesObjetivo` and recalculates the whole series between them. Every month of the range must have relevamientos and all of them must be `CERRADO` (`409` otherwise), so a run can be reproduced from its inputs. Prices of one variedad in one commerce and month are averaged; `excluirOfertas` leaves promotional prices out. Each run is stored with its parameters, a hash of the input, the engine version, the relatives and the imputations; it is never edited. Reads (`GET /api/calculos`, `/:id`, `/:id/relativos`, `/:id/imputaciones`) are open to `SUPERVISOR`, `ANALISTA`, `COORDINADOR` and `DIRECCION`.
- **Calculation is asynchronous:** `POST /api/calculos` validates the range (`409` if it is not closed or has no prices) and answers `202` with the run in state `EJECUTANDO`; the engine works in the background (about 15 s for a year of real data). Read the outcome with `GET /api/calculos/:id` until it is `COMPLETADO` (relatives and imputations available) or `FALLIDO` (the `error` field says why: the engine rejected the data or was unavailable). Only one run executes at a time (`409` otherwise); a run stuck as `EJECUTANDO` for more than 10 minutes is considered abandoned and failed by the next start.
- **Export for the engine:** `GET /api/calculos/exportacion?mesBase=AAAA-MM&mesObjetivo=AAAA-MM[&excluirOfertas=true][&formato=xlsx|csv]` (`ANALISTA`, `COORDINADOR`) downloads exactly the input a run would use, under the same rules (whole range `CERRADO`, with prices). `xlsx` (default) is the workbook the engine's `POST /v1/calculo/excel` reads: sheet `Precios` (`VARIEDAD`, `INFORMANTE`, `TIPO`, `MES`, `PRECIO`) and sheet `Variedades` (`GRUPO_1`..`GRUPO_n`, `TRATAMIENTO_ESPECIAL`). `csv` is the `Precios` sheet only, for review. `INFORMANTE` is the commerce id.
- **Results planilla:** `GET /api/calculos/:id/resultados[?formato=xlsx|csv]` (`SUPERVISOR`, `ANALISTA`, `COORDINADOR`, `DIRECCION`) downloads a completed run. `xlsx` (default) has the sheets `Relativos` (one row per variedad, one column per month), `Imputaciones` and `Corrida` (month range, parameters, engine version and input hash, so the file explains itself); `csv` is the relatives pivot only. A run that failed answers `409`. The system does not compute the final index: this is the relatives up to variedad level.
- **Sessions follow the database:** on every request the user is read from the database, so deactivating a user (`INACTIVO` or `LICENCIA`) or changing their role applies on their next request, not when their token expires. A coordinator cannot change their own role or estado (so the system is never left without one). A password reset or change does not revoke tokens already issued; deactivate the user if that matters.
- **Login rate limit:** only failed attempts count; 5 per IP+email and 30 per IP every 15 minutes, then `429` with `Retry-After`. Counters live in memory, so they reset on restart and are not shared between instances.
- **Attachments:** a price can carry up to 5 receipt files (JPEG, PNG, WebP or PDF, 5 MB each). `POST /api/precios/:id/adjuntos` takes the file as the raw request body; the type is decided from the bytes, not from the declared `Content-Type` (`415` otherwise, `413` over the limit). Only the owner surveyor can add or remove them, under the same conditions as editing the price (relevamiento `ABIERTO`, asignacion `EN_CURSO`). Reading follows the price's visibility, and downloads are sent as `attachment`, `nosniff` and uncached. Adding and removing leave `ADJUNTO_AGREGADO` / `ADJUNTO_ELIMINADO` entries in the audit trail (with file size and SHA-256). Files live on local disk behind the `AttachmentStorage` interface (`src/storage/`); moving to an object store means another implementation of it.

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
engine/             Calculation engine (Python, FastAPI): see engine/README.md
test/integration/   End-to-end flow against PostgreSQL
```

## Known limitations

- Rate limiting is per process; use a shared store (e.g. Redis) before running multiple instances.
- Quality changes (`Camb.Calidad`) are not modelled: the original scripts took them from the INDEC export and this system has no equivalent yet. See `engine/README.md`.
- The relatives are per variedad. Aggregation to products, classes and groups needs the formula confirmed with the statisticians.
- Attachments are stored on the server's local disk: with several backend instances they need a shared volume or an object-store implementation of `AttachmentStorage`.
- The calculation runs in the API process, in the background of the request. It is meant for a single instance: a run in progress dies with the process (it is marked `FALLIDO` at the next boot) and only one run executes at a time.
