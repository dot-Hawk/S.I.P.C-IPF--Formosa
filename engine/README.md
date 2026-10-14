# SIPC-IPF calculation engine

Stateless FastAPI service that, from the observed prices of a base month up to a target month,
imputes the missing prices, decides which prices enter the calculation and computes the monthly
relatives of every variedad.

It keeps nothing between calls: the whole series is recalculated every time, so any month can be
recomputed (or a parameter changed) from the observed prices alone. Storage belongs to the backend.

## Run

```bash
uv sync
ENGINE_API_KEY=change-me uv run uvicorn --app-dir src sipc_engine.main:app --port 8000
uv run pytest
```

Without `ENGINE_API_KEY` the calculation endpoints answer `503`: the engine never runs open.
Callers send the key in the `X-API-Key` header. Docker: `docker build -t sipc-engine .`.

## Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/health` | Liveness, public. |
| `POST` | `/v1/calculo` | JSON in, JSON out. |
| `POST` | `/v1/calculo/excel` | Multipart Excel in; JSON out, or an Excel with `?formato=xlsx`. |

Errors: `401` bad key, `422` invalid input (the `detail` says what and where, e.g. `fila 7: ...`),
`413` upload larger than 20 MB.

### JSON request

```json
{
  "mesBase": "2026-01",
  "mesObjetivo": "2026-03",
  "variedades": [
    { "codigo": "1111101", "grupos": ["A0111111", "A01111", "A0111", "A011", "A01", "A"], "tratamientoEspecial": false }
  ],
  "observaciones": [
    { "variedad": "1111101", "informante": "c-1", "tipo": "SUPER", "mes": "2026-01", "precio": 1250.5 }
  ],
  "parametros": { "esperarMeses": 2, "pesoSuper": 0.25, "pesoTrad": 0.75, "omitirGruposCompletos": true }
}
```

- `grupos` is the imputation hierarchy of the variedad, from the finest group to the coarsest. A
  missing price is estimated from its own variedad, then from each group in order, and finally from
  everything. The engine does not know any classification: the caller decides it.
- `tipo` is `SUPER` or `TRAD`. A variedad priced by both uses `pesoSuper` and `pesoTrad`.
- Every month between `mesBase` and `mesObjetivo` must have prices.

### Excel input

Sheet `Precios` (long format): `VARIEDAD`, `INFORMANTE`, `TIPO`, `MES` (`AAAA-MM` or a date), `PRECIO`.

Optional sheet `Variedades`: `VARIEDAD`, plus either `VARIEDAD_12` (the hierarchy is its prefixes) or
`GRUPO_1`, `GRUPO_2`, ..., plus `TRATAMIENTO_ESPECIAL` (`SI`/`1`/`X`). Without it every variedad is
imputed only from itself and from the whole set.

## What it computes

1. **Observed prices**: a variedad priced by an informant in a month.
2. **Imputation** (INDEC method 22): for each month, a price that is missing but has a previous price
   is `previous × geometric mean of the observed variations` of the finest group that has any.
   Imputed prices chain forward, but never feed a variation.
3. **Used prices**: the informants of the base month, plus new ones once they have been observed in
   `esperarMeses + 1` consecutive months.
4. **Relatives**: per variedad and month, the ratio of the geometric means of the used prices of the
   informants that have both months; with both types, `SUPER^0.25 × TRAD^0.75`.

Variedades flagged `tratamientoEspecial` follow their own methodology: they are neither imputed nor
given a relative. Prices that no level could impute are reported in `sinImputar`.

## Fidelity with the original scripts

The domain is a port of the scripts that produced the historical series (`SEPTIEMBRE_2020`,
8,355 series, 15 months). `tests/test_golden_legacy.py` compares it against them (set
`SIPC_GOLDEN_DIR`; the data is not in the repository):

- imputed prices, used prices and relatives match **exactly** for every row whose imputation chain
  is free of quality changes;
- the original scripts also replaced prices with the `Camb.Calidad` values of the INDEC export.
  This system has no such data yet, so those rows differ by design (about 9% of the cells).

`omitirGruposCompletos` reproduces a quirk of the original scripts: a group above the variedad is
not used when every one of its rows that has an observed previous price also has an observed
variation. Turn it off to let the finest group with data decide. It is on by default so the results
match the historical series.

## Not covered yet

- Quality changes (`Camb.Calidad`).
- Aggregation above the variedad (the weighted relatives of products, classes, groups...): the
  original scripts do not compute it and its formula must be confirmed with the statisticians.
