from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from ..domain.models import Observacion, Parametros, Resultado, Variedad


class _Model(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ObservacionIn(_Model):
    variedad: str = Field(min_length=1)
    informante: str = Field(min_length=1)
    tipo: str
    mes: str
    precio: float


class VariedadIn(_Model):
    codigo: str = Field(min_length=1)
    grupos: list[str] = []
    tratamiento_especial: bool = False


class ParametrosIn(_Model):
    esperar_meses: int = Field(default=2, ge=0)
    peso_super: float = Field(default=0.25, ge=0)
    peso_trad: float = Field(default=0.75, ge=0)
    omitir_grupos_completos: bool = True

    def to_domain(self) -> Parametros:
        return Parametros(
            esperar_meses=self.esperar_meses,
            peso_super=self.peso_super,
            peso_trad=self.peso_trad,
            omitir_grupos_completos=self.omitir_grupos_completos,
        )


class CalculoIn(_Model):
    mes_base: str
    mes_objetivo: str
    observaciones: list[ObservacionIn]
    variedades: list[VariedadIn]
    parametros: ParametrosIn = ParametrosIn()

    def observaciones_domain(self) -> list[Observacion]:
        return [Observacion(o.variedad, o.informante, o.tipo, o.mes, o.precio) for o in self.observaciones]

    def variedades_domain(self) -> list[Variedad]:
        return [Variedad(v.codigo, tuple(v.grupos), v.tratamiento_especial) for v in self.variedades]


class RelativoOut(_Model):
    variedad: str
    mes: str
    valor: float | None
    n_super: int
    n_trad: int


class PrecioOut(_Model):
    variedad: str
    informante: str
    tipo: str
    mes: str
    observado: float | None
    imputado: float | None
    utilizado: float | None


class ImputacionOut(_Model):
    variedad: str
    informante: str
    mes: str
    precio: float
    nivel: int
    grupo: str
    factor: float


class SinImputarOut(_Model):
    variedad: str
    informante: str
    mes: str


class ResumenOut(_Model):
    observaciones: int
    variedades: int
    informantes: int
    imputaciones: int
    sin_imputar: int


class CalculoOut(_Model):
    version: str
    meses: list[str]
    relativos: list[RelativoOut]
    precios: list[PrecioOut]
    imputaciones: list[ImputacionOut]
    sin_imputar: list[SinImputarOut]
    especiales: list[str]
    resumen: ResumenOut


def to_out(resultado: Resultado, version: str) -> CalculoOut:
    precios: list[PrecioOut] = []
    keys = sorted(set(resultado.observados) | set(resultado.imputados) | set(resultado.utilizados))
    for variedad, informante in keys:
        for mes in resultado.meses:
            observado = resultado.observados.get((variedad, informante), {}).get(mes)
            imputado = resultado.imputados.get((variedad, informante), {}).get(mes)
            utilizado = resultado.utilizados.get((variedad, informante), {}).get(mes)
            if observado is None and imputado is None and utilizado is None:
                continue
            precios.append(
                PrecioOut(
                    variedad=variedad,
                    informante=informante,
                    tipo=resultado.tipos[informante],
                    mes=mes,
                    observado=observado,
                    imputado=imputado,
                    utilizado=utilizado,
                )
            )

    return CalculoOut(
        version=version,
        meses=resultado.meses,
        relativos=[
            RelativoOut(variedad=r.variedad, mes=r.mes, valor=r.valor, n_super=r.n_super, n_trad=r.n_trad)
            for r in resultado.relativos
        ],
        precios=precios,
        imputaciones=[
            ImputacionOut(
                variedad=i.variedad, informante=i.informante, mes=i.mes,
                precio=i.precio, nivel=i.nivel, grupo=i.grupo, factor=i.factor,
            )
            for i in resultado.imputaciones
        ],
        sin_imputar=[SinImputarOut(variedad=s.variedad, informante=s.informante, mes=s.mes) for s in resultado.sin_imputar],
        especiales=resultado.especiales,
        resumen=ResumenOut(
            observaciones=sum(len(v) for v in resultado.observados.values()),
            variedades=len({k[0] for k in resultado.observados}),
            informantes=len({k[1] for k in resultado.observados}),
            imputaciones=len(resultado.imputaciones),
            sin_imputar=len(resultado.sin_imputar),
        ),
    )
