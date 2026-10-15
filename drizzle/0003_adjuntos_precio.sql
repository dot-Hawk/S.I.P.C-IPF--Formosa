ALTER TYPE "public"."accion_auditoria" ADD VALUE 'ADJUNTO_AGREGADO';--> statement-breakpoint
ALTER TYPE "public"."accion_auditoria" ADD VALUE 'ADJUNTO_ELIMINADO';--> statement-breakpoint
CREATE TABLE "precio_adjuntos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"precio_id" uuid NOT NULL,
	"clave" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"subido_por_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "precio_adjuntos_clave_unique" UNIQUE("clave")
);
--> statement-breakpoint
ALTER TABLE "precio_auditoria" ADD COLUMN "detalle" jsonb;--> statement-breakpoint
ALTER TABLE "precio_adjuntos" ADD CONSTRAINT "precio_adjuntos_precio_id_precios_id_fk" FOREIGN KEY ("precio_id") REFERENCES "public"."precios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "precio_adjuntos" ADD CONSTRAINT "precio_adjuntos_subido_por_id_users_id_fk" FOREIGN KEY ("subido_por_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "precio_adjuntos_precio_idx" ON "precio_adjuntos" USING btree ("precio_id");