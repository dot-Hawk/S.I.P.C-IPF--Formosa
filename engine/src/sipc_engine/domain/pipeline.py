from __future__ import annotations

import math
import re
from collections import defaultdict
from collections.abc import Iterable, Sequence

from .models import (
    TIPO_SUPER,
    TIPO_TRAD,
    TIPOS,
    Imputacion,
    Observacion,
    Parametros,
    Relativo,
    Resultado,
    SinImputar,
    Variedad,
)

_MES = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")

Key = tuple[str, str]


def rango_meses(mes_base: str, mes_objetivo: str) -> list[str]:
    """Every calendar month from mes_base to mes_objetivo, both included."""
    for mes in (mes_base, mes_objetivo):
        if not _MES.match(mes):
            raise ValueError(f"mes inválido: {mes!r}, se esperaba AAAA-MM")
    if mes_objetivo < mes_base:
        raise ValueError(f"el mes objetivo {mes_objetivo} es anterior al mes base {mes_base}")

    year, month = int(mes_base[:4]), int(mes_base[5:])
    meses: list[str] = []
    while f"{year:04d}-{month:02d}" <= mes_objetivo:
        meses.append(f"{year:04d}-{month:02d}")
        month += 1
        if month > 12:
            year, month = year + 1, 1
    return meses


def _geomean(values: Sequence[float]) -> float:
    return math.exp(sum(math.log(v) for v in values) / len(values))


def _validate(
    observaciones: Sequence[Observacion],
    variedades: dict[str, Variedad],
    meses: list[str],
    parametros: Parametros,
) -> dict[str, str]:
    if parametros.esperar_meses < 0:
        raise ValueError("esperar_meses no puede ser negativo")
    if parametros.peso_super < 0 or parametros.peso_trad < 0:
        raise ValueError("los pesos de los tipos de informante no pueden ser negativos")

    rango = set(meses)
    vistos: set[tuple[str, str, str]] = set()
    tipos: dict[str, str] = {}
    con_datos: set[str] = set()

    for o in observaciones:
        if o.mes not in rango:
            raise ValueError(f"la observación de {o.variedad}/{o.informante} es del mes {o.mes}, fuera del rango")
        if o.variedad not in variedades:
            raise ValueError(f"variedad desconocida: {o.variedad}")
        if o.tipo not in TIPOS:
            raise ValueError(f"tipo inválido {o.tipo!r} para el informante {o.informante}")
        if not (isinstance(o.precio, (int, float)) and math.isfinite(o.precio) and o.precio > 0):
            raise ValueError(f"precio inválido para {o.variedad}/{o.informante} en {o.mes}: debe ser mayor a 0")

        clave = (o.variedad, o.informante, o.mes)
        if clave in vistos:
            raise ValueError(f"observación duplicada: {o.variedad}/{o.informante} en {o.mes}")
        vistos.add(clave)

        if tipos.setdefault(o.informante, o.tipo) != o.tipo:
            raise ValueError(f"el informante {o.informante} aparece con más de un tipo")
        con_datos.add(o.mes)

    for mes in meses:
        if mes not in con_datos:
            raise ValueError(f"no hay precios para el mes {mes}")

    return tipos


class _Panel:
    """Dense working copy of the observed prices: one row per (variedad, informante)."""

    def __init__(self, keys: list[Key], meses: list[str], observados: dict[Key, dict[str, float]]):
        self.keys = keys
        self.n = len(keys)
        self.observed: list[list[float | None]] = [
            [observados.get(key, {}).get(mes) for key in keys] for mes in meses
        ]


def _impute(
    panel: _Panel,
    meses: list[str],
    variedades: dict[str, Variedad],
    parametros: Parametros,
) -> tuple[list[list[float | None]], list[Imputacion], list[SinImputar]]:
    n = panel.n
    n_grupos = max((len(variedades[key[0]].grupos) for key in panel.keys), default=0)
    general_level = n_grupos + 1

    def group_key(row: int, level: int) -> str:
        variedad = variedades[panel.keys[row][0]]
        if level == 0:
            return variedad.codigo
        if level == general_level:
            return ""
        if not variedad.grupos:
            return f"~{variedad.codigo}"
        return variedad.grupos[min(level - 1, len(variedad.grupos) - 1)]

    # Rows grouped once per level: the keys do not change between months.
    groups_by_level: list[dict[str, list[int]]] = []
    for level in range(general_level + 1):
        groups: dict[str, list[int]] = defaultdict(list)
        for row in range(n):
            groups[group_key(row, level)].append(row)
        groups_by_level.append(groups)

    imputed: list[list[float | None]] = [list(panel.observed[0])]
    imputaciones: list[Imputacion] = []
    sin_imputar: list[SinImputar] = []

    for t in range(1, len(meses)):
        obs_prev, obs_cur = panel.observed[t - 1], panel.observed[t]
        prev = imputed[t - 1]
        cur = list(obs_cur)

        # Variation of the informants observed in both months. Imputed prices never feed it.
        variation: list[float | None] = [None] * n
        for row in range(n):
            if obs_prev[row] is not None and obs_cur[row] is not None:
                variation[row] = obs_cur[row] / obs_prev[row]  # type: ignore[operator]

        def pending() -> list[int]:
            return [r for r in range(n) if prev[r] is not None and cur[r] is None]

        for level in range(general_level + 1):
            if not pending():
                break

            for grupo, members in groups_by_level[level].items():
                with_previous = [r for r in members if obs_prev[r] is not None]
                observed_variations = [variation[r] for r in with_previous if variation[r] is not None]
                if not observed_variations:
                    continue
                if (
                    level > 0
                    and parametros.omitir_grupos_completos
                    and len(observed_variations) == len(with_previous)
                ):
                    continue

                factor = _geomean(observed_variations)  # type: ignore[arg-type]
                for r in members:
                    if cur[r] is None and prev[r] is not None:
                        cur[r] = factor * prev[r]  # type: ignore[operator]
                        imputaciones.append(
                            Imputacion(
                                variedad=panel.keys[r][0],
                                informante=panel.keys[r][1],
                                mes=meses[t],
                                precio=cur[r],  # type: ignore[arg-type]
                                nivel=level,
                                grupo=grupo,
                                factor=factor,
                            )
                        )

        for r in pending():
            sin_imputar.append(SinImputar(panel.keys[r][0], panel.keys[r][1], meses[t]))

        imputed.append(cur)

    return imputed, imputaciones, sin_imputar


def _utilizados(
    panel: _Panel,
    meses: list[str],
    imputed: list[list[float | None]],
    parametros: Parametros,
) -> dict[Key, dict[str, float]]:
    """Prices that enter the variation: the base-month informants, plus new ones once they have
    been observed in `esperar_meses + 1` consecutive months."""
    used: dict[int, dict[str, float]] = {}

    for row in range(panel.n):
        if imputed[0][row] is not None:
            used[row] = {meses[0]: imputed[0][row]}  # type: ignore[dict-item]

    for t in range(1, len(meses)):
        for row, values in used.items():
            value = imputed[t][row]
            if value is not None:
                values[meses[t]] = value

        if t < parametros.esperar_meses + 1:
            continue

        window = range(t - parametros.esperar_meses, t + 1)
        for row in range(panel.n):
            if row not in used and all(panel.observed[i][row] is not None for i in window):
                used[row] = {meses[t]: panel.observed[t][row]}  # type: ignore[dict-item]

    return {panel.keys[row]: values for row, values in used.items()}


def _relativos(
    meses: list[str],
    variedades: list[str],
    utilizados: dict[Key, dict[str, float]],
    tipos: dict[str, str],
    parametros: Parametros,
) -> list[Relativo]:
    por_variedad: dict[str, list[tuple[str, dict[str, float]]]] = defaultdict(list)
    for (variedad, informante), values in utilizados.items():
        por_variedad[variedad].append((tipos[informante], values))

    weights = {TIPO_SUPER: parametros.peso_super, TIPO_TRAD: parametros.peso_trad}
    relativos: list[Relativo] = []

    for variedad in variedades:
        for t in range(1, len(meses)):
            prev_mes, mes = meses[t - 1], meses[t]
            prev_logs: dict[str, list[float]] = defaultdict(list)
            cur_logs: dict[str, list[float]] = defaultdict(list)

            for tipo, values in por_variedad.get(variedad, []):
                if prev_mes in values and mes in values:
                    prev_logs[tipo].append(math.log(values[prev_mes]))
                    cur_logs[tipo].append(math.log(values[mes]))

            tipos_presentes = [t_ for t_ in TIPOS if prev_logs[t_]]
            if not tipos_presentes:
                relativos.append(Relativo(variedad, mes, None, 0, 0))
                continue

            # Weights only apply when both types price the variedad; a single type counts fully.
            log_prev = log_cur = 0.0
            for tipo in tipos_presentes:
                w = weights[tipo] if len(tipos_presentes) == 2 else 1.0
                log_prev += w * sum(prev_logs[tipo]) / len(prev_logs[tipo])
                log_cur += w * sum(cur_logs[tipo]) / len(cur_logs[tipo])

            relativos.append(
                Relativo(
                    variedad=variedad,
                    mes=mes,
                    valor=math.exp(log_cur - log_prev),
                    n_super=len(prev_logs[TIPO_SUPER]),
                    n_trad=len(prev_logs[TIPO_TRAD]),
                )
            )

    return relativos


def calcular(
    observaciones: Iterable[Observacion],
    variedades: Iterable[Variedad],
    mes_base: str,
    mes_objetivo: str,
    parametros: Parametros = Parametros(),
) -> Resultado:
    """Runs the whole calculation from the base month up to the target month.

    The result is a pure function of the arguments: nothing is kept between calls, so a month can
    always be recalculated, or the parameters changed, from the observed prices alone.
    """
    meses = rango_meses(mes_base, mes_objetivo)
    observaciones = list(observaciones)
    por_codigo = {v.codigo: v for v in variedades}

    tipos = _validate(observaciones, por_codigo, meses, parametros)

    especiales = sorted(v.codigo for v in por_codigo.values() if v.tratamiento_especial)

    # Only the varieties priced in the base month take part; special ones follow their own methodology.
    base = {
        o.variedad
        for o in observaciones
        if o.mes == mes_base and not por_codigo[o.variedad].tratamiento_especial
    }
    observaciones = [o for o in observaciones if o.variedad in base]

    observados: dict[Key, dict[str, float]] = defaultdict(dict)
    for o in observaciones:
        observados[(o.variedad, o.informante)][o.mes] = o.precio

    keys = sorted(observados)
    panel = _Panel(keys, meses, observados)
    imputed, imputaciones, sin_imputar = _impute(panel, meses, por_codigo, parametros)

    imputados: dict[Key, dict[str, float]] = {}
    for row, key in enumerate(keys):
        values = {meses[t]: imputed[t][row] for t in range(len(meses)) if imputed[t][row] is not None}
        if values:
            imputados[key] = values  # type: ignore[assignment]

    utilizados = _utilizados(panel, meses, imputed, parametros)
    relativos = _relativos(meses, sorted(base), utilizados, tipos, parametros)

    return Resultado(
        meses=meses,
        observados=dict(observados),
        imputados=imputados,
        utilizados=utilizados,
        tipos=tipos,
        relativos=relativos,
        imputaciones=imputaciones,
        sin_imputar=sin_imputar,
        especiales=especiales,
    )
