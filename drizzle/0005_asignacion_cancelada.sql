ALTER TYPE "public"."estado_asignacion" ADD VALUE 'CANCELADA';--> statement-breakpoint
ALTER TABLE "asignaciones" DROP CONSTRAINT "asignaciones_relevamiento_comercio_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "asignaciones_relevamiento_comercio_uq" ON "asignaciones" USING btree ("relevamiento_id","comercio_id") WHERE "asignaciones"."estado" in ('PENDIENTE', 'EN_CURSO', 'COMPLETADA');