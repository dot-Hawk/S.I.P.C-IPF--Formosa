import { createHash, randomUUID } from "node:crypto";
import { type Request, type Response } from "express";
import { type PrecioAdjunto } from "../db/schema.js";
import { detectTipoAdjunto, MAX_ADJUNTOS_POR_PRECIO } from "../domain/adjunto.js";
import { type AdjuntoRepository } from "../repositories/adjunto.repository.js";
import { type Actor } from "../repositories/precio.repository.js";
import { type AttachmentStorage } from "../storage/attachment-storage.js";
import { isUuid } from "../utils/uuid.js";
import { createPrecioAccess, type PrecioAccessRepositories } from "./precio-access.js";

export interface AdjuntoControllerDeps extends PrecioAccessRepositories {
  adjuntos: AdjuntoRepository;
  storage: AttachmentStorage;
}

// The storage key is an internal detail: clients refer to an attachment by its id.
function toView(adjunto: PrecioAdjunto) {
  const { clave: _clave, ...view } = adjunto;
  return view;
}

export function createAdjuntoController(deps: AdjuntoControllerDeps) {
  const access = createPrecioAccess(deps);

  // The file is already recorded (or gone) by now: a stuck file on disk is not worth failing for.
  async function discard(key: string): Promise<void> {
    try {
      await deps.storage.remove(key);
    } catch (error) {
      console.error(`Could not remove stored file ${key}`, error);
    }
  }

  // Responds 404 and returns null unless the attachment exists and belongs to the precio.
  async function findOf(req: Request, res: Response, precioId: string): Promise<PrecioAdjunto | null> {
    const adjuntoId = req.params["adjuntoId"];
    if (!isUuid(adjuntoId)) {
      res.status(400).json({ message: "Invalid adjunto id" });
      return null;
    }

    const adjunto = await deps.adjuntos.findById(adjuntoId);
    if (!adjunto || adjunto.precio !== precioId) {
      res.status(404).json({ message: "Adjunto not found" });
      return null;
    }
    return adjunto;
  }

  return {
    // The file travels as the raw request body (see the route), not as multipart.
    async create(req: Request, res: Response): Promise<void> {
      const loaded = await access.loadEditable(req, res);
      if (!loaded) return;

      const body: unknown = req.body;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        res.status(400).json({
          message: "Send the file as the raw request body (image/jpeg, image/png, image/webp or application/pdf)",
        });
        return;
      }

      const tipo = detectTipoAdjunto(body);
      if (!tipo) {
        res.status(415).json({ message: "Unsupported file type: only JPEG, PNG, WebP and PDF are accepted" });
        return;
      }

      const actor: Actor = { userId: loaded.auth.userId, role: loaded.auth.role };
      const clave = `${randomUUID()}.${tipo.extension}`;
      const sha256 = createHash("sha256").update(body).digest("hex");

      await deps.storage.put(clave, body);

      let result;
      try {
        result = await deps.adjuntos.create(
          { precio: loaded.precio.id, clave, mime: tipo.mime, bytes: body.length, sha256 },
          actor,
          MAX_ADJUNTOS_POR_PRECIO,
        );
      } catch (error) {
        await discard(clave);
        throw error;
      }

      if (result === null) {
        await discard(clave);
        res.status(404).json({ message: "Precio not found" });
        return;
      }
      if ("limite" in result) {
        await discard(clave);
        res.status(409).json({ message: `A precio can have at most ${MAX_ADJUNTOS_POR_PRECIO} attachments` });
        return;
      }

      res.status(201).json(toView(result.adjunto));
    },

    async list(req: Request, res: Response): Promise<void> {
      const loaded = await access.loadVisible(req, res);
      if (!loaded) return;

      const adjuntos = await deps.adjuntos.listByPrecio(loaded.precio.id);
      res.json(adjuntos.map(toView));
    },

    async download(req: Request, res: Response): Promise<void> {
      const loaded = await access.loadVisible(req, res);
      if (!loaded) return;

      const adjunto = await findOf(req, res, loaded.precio.id);
      if (!adjunto) return;

      const data = await deps.storage.get(adjunto.clave);
      if (!data) {
        res.status(404).json({ message: "The file of this adjunto is not available" });
        return;
      }

      // Receipts are personal data: never cached, never interpreted by the browser as anything
      // other than the stored type, and always offered as a download.
      res.setHeader("Content-Type", adjunto.mime);
      res.setHeader("Content-Length", String(data.length));
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("Content-Disposition", `attachment; filename="${adjunto.clave}"`);
      res.status(200).end(data);
    },

    async remove(req: Request, res: Response): Promise<void> {
      const loaded = await access.loadEditable(req, res);
      if (!loaded) return;

      const adjunto = await findOf(req, res, loaded.precio.id);
      if (!adjunto) return;

      const actor: Actor = { userId: loaded.auth.userId, role: loaded.auth.role };
      const removed = await deps.adjuntos.remove(adjunto.id, actor);
      if (!removed) {
        res.status(404).json({ message: "Adjunto not found" });
        return;
      }

      await discard(removed.clave);
      res.status(204).end();
    },
  };
}
