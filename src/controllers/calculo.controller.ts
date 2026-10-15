import { type Request, type Response } from "express";
import { type AuthPayload } from "../auth/token.service.js";
import { AUTH_LOCALS_KEY } from "../middlewares/authenticate.middleware.js";
import { type CalculoRepository, type RelativosFilter } from "../repositories/calculo.repository.js";
import { CalculoError, type createCalculoService } from "../services/calculo.service.js";
import { isUuid } from "../utils/uuid.js";
import { validateRelativosFilters } from "../validators/calculo.validator.js";
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
