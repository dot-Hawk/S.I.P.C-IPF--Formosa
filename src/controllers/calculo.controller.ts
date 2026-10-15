import { type Request, type Response } from "express";
import { type AuthPayload } from "../auth/token.service.js";
import { preciosCsv } from "../domain/calculo-export.js";
import { relativosCsv } from "../domain/calculo-resultados.js";
import { AUTH_LOCALS_KEY } from "../middlewares/authenticate.middleware.js";
import { type CalculoRepository, type RelativosFilter } from "../repositories/calculo.repository.js";
import { CalculoError, type createCalculoService } from "../services/calculo.service.js";
import { buildExportWorkbook } from "../services/calculo-export.service.js";
import { buildResultadosWorkbook } from "../services/calculo-resultados.service.js";
import { isUuid } from "../utils/uuid.js";
import { validateCalculoExportQuery, validateRelativosFilters } from "../validators/calculo.validator.js";
import { parsePage, validatePagination } from "../validators/pagination.js";

type CalculoService = ReturnType<typeof createCalculoService>;

function getAuth(res: Response): AuthPayload | undefined {
  return res.locals[AUTH_LOCALS_KEY] as AuthPayload | undefined;
}

export function createCalculoController(service: CalculoService, calculos: CalculoRepository) {
  async function loadCalculo(req: Request, res: Response) {
    const id = req.params["id"];
    if (!isUuid(id)) {
      res.status(400).json({ message: "Invalid calculo id" });
      return null;
    }

    const calculo = await calculos.findById(id);
    if (!calculo) {
      res.status(404).json({ message: "Calculo not found" });
      return null;
    }
    return calculo;
  }

  return {
    async create(req: Request, res: Response): Promise<void> {
      const auth = getAuth(res);
      if (!auth) {
        res.status(401).json({ message: "Authentication required" });
        return;
      }

      try {
        const calculo = await service.ejecutar(req.body, { userId: auth.userId });
        res.status(201).json(calculo);
      } catch (error) {
        if (error instanceof CalculoError) {
          res.status(error.status).json({ message: error.message });
          return;
        }
        throw error;
      }
    },

    // The file the analyst sends to the engine (or reviews): same input a run would use.
    async exportar(req: Request, res: Response): Promise<void> {
      const validation = validateCalculoExportQuery(req.query);
      if (!validation.valid) {
        res.status(400).json({ errors: validation.errors });
        return;
      }

      const mesBase = String(req.query["mesBase"]);
      const mesObjetivo = String(req.query["mesObjetivo"]);
      const formato = req.query["formato"] === "csv" ? "csv" : "xlsx";

      let entrada;
      try {
        entrada = await service.exportar({
          mesBase,
          mesObjetivo,
          ...(req.query["excluirOfertas"] === undefined ? {} : { excluirOfertas: req.query["excluirOfertas"] === "true" }),
        });
      } catch (error) {
        if (error instanceof CalculoError) {
          res.status(error.status).json({ message: error.message });
          return;
        }
        throw error;
      }

      const data =
        formato === "csv"
          ? Buffer.from(preciosCsv(entrada.observaciones), "utf8")
          : await buildExportWorkbook(entrada.observaciones, entrada.variedades);

      res.setHeader(
        "Content-Type",
        formato === "csv"
          ? "text/csv; charset=utf-8"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader("Content-Disposition", `attachment; filename="precios_${mesBase}_${mesObjetivo}.${formato}"`);
      res.setHeader("Cache-Control", "private, no-store");
      res.status(200).end(data);
    },

    async list(req: Request, res: Response): Promise<void> {
      const errors = validatePagination(req.query);
      if (errors.length > 0) {
        res.status(400).json({ errors });
        return;
      }

      res.json(await calculos.list(parsePage(req.query)));
    },

    async getById(req: Request, res: Response): Promise<void> {
      const calculo = await loadCalculo(req, res);
      if (calculo) res.json(calculo);
    },

    async relativos(req: Request, res: Response): Promise<void> {
      const validation = validateRelativosFilters(req.query);
      if (!validation.valid) {
        res.status(400).json({ errors: validation.errors });
        return;
      }

      const calculo = await loadCalculo(req, res);
      if (!calculo) return;

      const filter: RelativosFilter = {};
      if (typeof req.query["variedad"] === "string") filter.variedad = req.query["variedad"];
      if (typeof req.query["mes"] === "string") filter.mes = req.query["mes"];

      res.json(await calculos.relativos(calculo.id, filter));
    },

    // The planilla of a finished run: relatives pivoted by month, imputations and the run's data.
    async resultados(req: Request, res: Response): Promise<void> {
      const formato = req.query["formato"] ?? "xlsx";
      if (formato !== "xlsx" && formato !== "csv") {
        res.status(400).json({ errors: [{ field: "formato", message: "formato must be xlsx or csv" }] });
        return;
      }

      const calculo = await loadCalculo(req, res);
      if (!calculo) return;

      if (calculo.estado !== "COMPLETADO") {
        res.status(409).json({ message: "The run has no results: it did not complete" });
        return;
      }

      const relativos = await calculos.relativos(calculo.id, {});
      const data =
        formato === "csv"
          ? Buffer.from(relativosCsv(relativos), "utf8")
          : await buildResultadosWorkbook({
              calculo,
              relativos,
              imputaciones: await calculos.allImputaciones(calculo.id),
            });

      res.setHeader(
        "Content-Type",
        formato === "csv"
          ? "text/csv; charset=utf-8"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader("Content-Disposition", `attachment; filename="resultados_${calculo.id}.${formato}"`);
      res.setHeader("Cache-Control", "private, no-store");
      res.status(200).end(data);
    },

    async imputaciones(req: Request, res: Response): Promise<void> {
      const errors = validatePagination(req.query);
      if (errors.length > 0) {
        res.status(400).json({ errors });
        return;
      }

      const calculo = await loadCalculo(req, res);
      if (!calculo) return;

      res.json(await calculos.imputaciones(calculo.id, parsePage(req.query)));
    },
  };
}
