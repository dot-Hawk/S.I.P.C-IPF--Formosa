# SIPC-IPF Backend

REST API for SIPC-IPF (Formosa): price survey management (relevamientos, commerces, products, assignments, prices) with role-based access.

Stack: Node.js, TypeScript, Express 5, Mongoose 9 (MongoDB), `tsx`, `node:test`.

## Requirements

- Node.js (a version that supports ESM and `node:test`)
- A running MongoDB instance

## Getting started

```bash
npm install
cp .env.example .env   # then fill in the values
npm run dev
```

## Environment variables

See `.env.example` for the full list.

| Variable | Required | Description |
| --- | --- | --- |
| `MONGO_URI` | yes | MongoDB connection string. The server exits on startup if it cannot connect. |
| `PORT` | no | HTTP port. |
| `JWT_SECRET` | yes | Secret used to sign tokens (HS256). |
| `JWT_EXPIRES_IN` | no | Token lifetime. Defaults to `8h`. |
| `TRUST_PROXY` | no | Number of proxy hops to trust. Set it when running behind a reverse proxy so rate limiting sees the real client IP. |
| `SEED_NOMBRE`, `SEED_APELLIDO`, `SEED_DNI`, `SEED_LEGAJO`, `SEED_EMAIL`, `SEED_PASSWORD` | seed only | Data for the first coordinator user. |
| `MONGO_TEST_URI` | integration tests only | Throwaway database for `test:integration`. |

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start the server in watch mode. |
| `npm run seed:coordinador` | Create the first `COORDINADOR` user. |
| `npm test` | Unit tests. No database needed. |
| `npm run test:integration` | Full API flow against a real MongoDB. |
| `npm run typecheck` | Type-check without emitting. |

## First user (seed)

No endpoint can create the first user, because user creation requires a `COORDINADOR`. Seed it once:

1. Set the `SEED_*` variables in `.env`.
2. Run `npm run seed:coordinador`.
3. Remove `SEED_PASSWORD` from `.env`.

The script is idempotent: it does nothing if a `COORDINADOR` already exists.

## Tests

Unit tests are colocated with the code (`src/**/*.test.ts`) and use fakes instead of a database:

```bash
npm test
```

The integration test (`test/integration/api-flow.test.ts`) exercises the whole business flow against a real MongoDB:

```bash
MONGO_TEST_URI=mongodb://127.0.0.1:27017/sipc_integration_test npm run test:integration
```

- It is skipped when `MONGO_TEST_URI` is unset.
- The database is **dropped before and after** the run, so the test refuses to run unless the database name contains `test`.
- Tests are sequential and share state on purpose: they model one business flow, so a failure early on cascades.

## API overview

All routes are under `/api`. Errors are JSON and never include stack traces.

| Prefix | Purpose |
| --- | --- |
| `/api/auth` | Login (JWT). |
| `/api/users` | User creation. |
| `/api/relevamientos` | Survey cycles, close with `PATCH /:id/cerrar`. |
| `/api/comercios` | Commerce catalog. |
| `/api/productos` | Product catalog. |
| `/api/asignaciones` | Surveyor assignments and state transitions. |
| `/api/precios` | Price capture and queries. |

### Roles

`ENCUESTADOR`, `SUPERVISOR`, `ANALISTA`, `COORDINADOR`, `DIRECCION`.

- Writes to users, relevamientos, catalogs and assignments: `COORDINADOR` only.
- Reads: any authenticated role (`DIRECCION` is effectively read-only).
- Prices are created by `ENCUESTADOR` only, for their own `EN_CURSO` assignments.
- An `ENCUESTADOR` only sees their own data; other people's resources respond `404`, not `403`.

### Business rules worth knowing

- **Relevamiento:** always created `ABIERTO`; unique per period + frequency (`2026-10` monthly, `2026-10-Q1`/`Q2` biweekly); closing is atomic and returns `409` if already closed.
- **Comercio / Producto:** no `DELETE`; deactivate through `PATCH /:id/estado`.
- **Asignación:** `PENDIENTE` → `EN_CURSO` → `COMPLETADA` only; reassignment only while `PENDIENTE`; requires an open relevamiento and an active commerce and surveyor.
- **Precio:** `valor > 0`, date not in the future nor before the relevamiento start; edit/delete only by the owner while the relevamiento is open and the assignment is `EN_CURSO`.
- **Login rate limit:** only failed attempts count; 5 per IP+email and 30 per IP every 15 minutes, then `429` with `Retry-After`. Counters live in memory, so they reset on restart and are not shared between instances.

## Project layout

```
src/
  app.ts            Express app (routes, error handlers)
  server.ts         Entry point (DB connection, listen)
  config/           Database and auth configuration
  auth/             Token service, seed logic
  controllers/      Factories that receive models (testable with fakes)
  domain/           Pure business rules
  middlewares/      authenticate, authorize, validateBody, rate limit
  models/           Mongoose models
  routes/           Routers
  validators/       Hand-written input validators
  utils/            Mongo error mapping, ObjectId checks
  scripts/          CLI scripts (seed)
test/integration/   End-to-end flow against MongoDB
```

## Known limitations

- Rate limiting is per process; use a shared store (e.g. Redis) before running multiple instances.
- No `helmet` or CORS configuration yet (add when the frontend exists).
- The price calculation engine (Python service) is not implemented yet.
