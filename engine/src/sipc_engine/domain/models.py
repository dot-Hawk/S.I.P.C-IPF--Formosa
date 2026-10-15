from __future__ import annotations

from dataclasses import dataclass

TIPO_SUPER = "SUPER"
TIPO_TRAD = "TRAD"
TIPOS = (TIPO_SUPER, TIPO_TRAD)


@dataclass(frozen=True)
class Observacion:
    """One observed price: a variedad priced by an informant in a month."""

    variedad: str
    informante: str
    tipo: str
    mes: str  # YYYY-MM
    precio: float


@dataclass(frozen=True)
class Variedad:
    codigo: str
    # Imputation hierarchy, from the finest group to the coarsest one. A missing price is estimated
    # from the variedad itself, then from each of these groups in order, and finally from everything.
    grupos: tuple[str, ...] = ()
    # Variedades with a methodology of their own: never imputed and no relative is computed.
    tratamiento_especial: bool = False


@dataclass(frozen=True)
class Parametros:
    # Consecutive observed months an informant needs before its prices enter the calculation.
    esperar_meses: int = 2
    # Weights of the informant types when a variedad is priced by both.
    peso_super: float = 0.25
    peso_trad: float = 0.75
    # The original scripts do not use a group (above the variedad) to impute when every one of its
    # rows with an observed previous price also has an observed variation: whoever is left is
    # estimated by the next, broader group. On by default so the results match the historical series.
    omitir_grupos_completos: bool = True


@dataclass(frozen=True)
class Imputacion:
    variedad: str
    informante: str
    mes: str
    precio: float
    # 0 = the variedad itself, 1..n = the n-th group of its hierarchy, n+1 = everything.
    nivel: int
    grupo: str
    # Geometric mean of the observed variations that produced the price.
    factor: float


@dataclass(frozen=True)
class SinImputar:
    variedad: str
    informante: str
    mes: str


@dataclass(frozen=True)
class Relativo:
    variedad: str
    mes: str
    valor: float | None
    n_super: int
    n_trad: int


@dataclass
class Resultado:
    meses: list[str]
    # (variedad, informante) -> {mes: precio}
    observados: dict[tuple[str, str], dict[str, float]]
    imputados: dict[tuple[str, str], dict[str, float]]
    utilizados: dict[tuple[str, str], dict[str, float]]
    tipos: dict[str, str]  # informante -> tipo
    relativos: list[Relativo]
    imputaciones: list[Imputacion]
    sin_imputar: list[SinImputar]
    especiales: list[str]
