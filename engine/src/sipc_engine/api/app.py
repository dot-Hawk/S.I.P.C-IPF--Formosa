from __future__ import annotations

import hmac
from typing import Annotated

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Query, UploadFile
from fastapi.responses import Response

from .. import __version__
from ..domain.pipeline import calcular
from ..excel import escribir_salida, leer_entrada
from .schemas import CalculoIn, CalculoOut, ParametrosIn, to_out

MAX_UPLOAD_BYTES = 20 * 1024 * 1024
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def create_app(api_key: str | None) -> FastAPI:
    app = FastAPI(title="SIPC-IPF calculation engine", version=__version__)

    def require_key(x_api_key: Annotated[str | None, Header()] = None) -> None:
        if not api_key:
            # Never run open: an engine without a key is a misconfiguration, not a development mode.
            raise HTTPException(status_code=503, detail="El motor no tiene ENGINE_API_KEY configurada")
        if x_api_key is None or not hmac.compare_digest(x_api_key, api_key):
            raise HTTPException(status_code=401, detail="Clave inválida")

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "version": __version__}

    @app.post("/v1/calculo", response_model=CalculoOut, dependencies=[Depends(require_key)])
    def calculo(body: CalculoIn) -> CalculoOut:
        try:
            resultado = calcular(
                body.observaciones_domain(),
                body.variedades_domain(),
                body.mes_base,
                body.mes_objetivo,
                body.parametros.to_domain(),
            )
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from None
        return to_out(resultado, __version__)

    @app.post("/v1/calculo/excel", dependencies=[Depends(require_key)], response_model=None)
    async def calculo_excel(
        file: Annotated[UploadFile, File()],
        mes_base: Annotated[str, Form(alias="mesBase")],
        mes_objetivo: Annotated[str | None, Form(alias="mesObjetivo")] = None,
        esperar_meses: Annotated[int, Form(alias="esperarMeses", ge=0)] = 2,
        peso_super: Annotated[float, Form(alias="pesoSuper", ge=0)] = 0.25,
        peso_trad: Annotated[float, Form(alias="pesoTrad", ge=0)] = 0.75,
        omitir_grupos_completos: Annotated[bool, Form(alias="omitirGruposCompletos")] = True,
        formato: Annotated[str, Query(pattern="^(json|xlsx)$")] = "json",
    ) -> CalculoOut | Response:
        contenido = await file.read(MAX_UPLOAD_BYTES + 1)
        if len(contenido) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="El archivo supera el máximo de 20 MB")

        try:
            observaciones, variedades = leer_entrada(contenido)
            objetivo = mes_objetivo or max((o.mes for o in observaciones), default=mes_base)
            parametros = ParametrosIn(
                esperar_meses=esperar_meses,
                peso_super=peso_super,
                peso_trad=peso_trad,
                omitir_grupos_completos=omitir_grupos_completos,
            ).to_domain()
            resultado = calcular(observaciones, variedades, mes_base, objetivo, parametros)
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from None

        if formato == "xlsx":
            return Response(
                content=escribir_salida(resultado),
                media_type=XLSX,
                headers={"Content-Disposition": f'attachment; filename="calculo_{mes_base}_{objetivo}.xlsx"'},
            )
        return to_out(resultado, __version__)

    return app
