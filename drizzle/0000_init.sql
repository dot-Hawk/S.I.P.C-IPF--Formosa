CREATE TYPE "public"."accion_auditoria" AS ENUM('CREACION', 'MODIFICACION', 'ELIMINACION');--> statement-breakpoint
CREATE TYPE "public"."categoria_canasta" AS ENUM('NUCLEO', 'ESTACIONAL', 'REGULADO');--> statement-breakpoint
CREATE TYPE "public"."estado_asignacion" AS ENUM('PENDIENTE', 'EN_CURSO', 'COMPLETADA');--> statement-breakpoint
CREATE TYPE "public"."estado_canasta" AS ENUM('ACTIVO', 'INACTIVO');--> statement-breakpoint
CREATE TYPE "public"."estado_comercio" AS ENUM('ACTIVO', 'INACTIVO');--> statement-breakpoint
CREATE TYPE "public"."estado_producto" AS ENUM('ACTIVO', 'INACTIVO');--> statement-breakpoint
CREATE TYPE "public"."estado_relevamiento" AS ENUM('ABIERTO', 'CERRADO');--> statement-breakpoint
CREATE TYPE "public"."estado_usuario" AS ENUM('ACTIVO', 'INACTIVO', 'LICENCIA');--> statement-breakpoint
CREATE TYPE "public"."frecuencia_relevamiento" AS ENUM('QUINCENAL', 'MENSUAL');--> statement-breakpoint
CREATE TYPE "public"."rol" AS ENUM('ENCUESTADOR', 'SUPERVISOR', 'ANALISTA', 'COORDINADOR', 'DIRECCION');--> statement-breakpoint
CREATE TYPE "public"."tipo_comercio" AS ENUM('SUPERMERCADO', 'ALMACEN', 'VERDULERIA', 'CARNICERIA', 'FARMACIA', 'OTRO');--> statement-breakpoint
CREATE TYPE "public"."unidad_producto" AS ENUM('KG', 'G', 'LT', 'ML', 'UNIDAD');--> statement-breakpoint
CREATE TABLE "asignaciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"relevamiento_id" uuid NOT NULL,
	"encuestador_id" uuid NOT NULL,
	"comercio_id" uuid NOT NULL,
	"estado" "estado_asignacion" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asignaciones_relevamiento_comercio_uq" UNIQUE("relevamiento_id","comercio_id")
);
--> statement-breakpoint
CREATE TABLE "canasta_nodos" (
	"codigo" text PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"nivel" smallint NOT NULL,
	"padre" text,
	"ponderador" double precision DEFAULT 0 NOT NULL,
	"derivado" boolean DEFAULT false NOT NULL,
	"estado" "estado_canasta" NOT NULL,
	"categoria" "categoria_canasta",
	"codigo_variedad_12" text,
	"tratamiento_especial" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "canasta_nodos_nivel_ck" CHECK ("canasta_nodos"."nivel" between 0 and 6),
	CONSTRAINT "canasta_nodos_ponderador_ck" CHECK ("canasta_nodos"."ponderador" >= 0)
);
--> statement-breakpoint
CREATE TABLE "comercios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"direccion" text NOT NULL,
	"zona" text NOT NULL,
	"tipo" "tipo_comercio" NOT NULL,
	"estado" "estado_comercio" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "precio_auditoria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"precio_id" uuid NOT NULL,
	"relevamiento_id" uuid NOT NULL,
	"comercio_id" uuid NOT NULL,
	"producto_id" uuid NOT NULL,
	"accion" "accion_auditoria" NOT NULL,
	"usuario_id" uuid NOT NULL,
	"rol" text NOT NULL,
	"anterior" jsonb,
	"posterior" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "precios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"relevamiento_id" uuid NOT NULL,
	"producto_id" uuid NOT NULL,
	"comercio_id" uuid NOT NULL,
	"encuestador_id" uuid NOT NULL,
	"valor" numeric(14, 4) NOT NULL,
	"oferta" boolean DEFAULT false NOT NULL,
	"fecha_relevamiento" timestamp with time zone NOT NULL,
	"observacion" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "precios_relevamiento_producto_comercio_uq" UNIQUE("relevamiento_id","producto_id","comercio_id"),
	CONSTRAINT "precios_valor_ck" CHECK ("precios"."valor" > 0)
);
--> statement-breakpoint
CREATE TABLE "productos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"categoria" text NOT NULL,
	"unidad" "unidad_producto" NOT NULL,
	"cantidad_referencia" numeric(14, 4) NOT NULL,
	"marca" text,
	"codigo_variedad" text NOT NULL,
	"estado" "estado_producto" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "productos_cantidad_ck" CHECK ("productos"."cantidad_referencia" > 0)
);
--> statement-breakpoint
CREATE TABLE "relevamientos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"periodo" text NOT NULL,
	"frecuencia" "frecuencia_relevamiento" NOT NULL,
	"fecha_inicio" timestamp with time zone NOT NULL,
	"fecha_limite" timestamp with time zone NOT NULL,
	"estado" "estado_relevamiento" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "relevamientos_periodo_frecuencia_uq" UNIQUE("periodo","frecuencia")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"apellido" text NOT NULL,
	"dni" text NOT NULL,
	"legajo" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "rol" NOT NULL,
	"estado" "estado_usuario" NOT NULL,
	"ultimo_acceso" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_dni_unique" UNIQUE("dni"),
	CONSTRAINT "users_legajo_unique" UNIQUE("legajo"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "asignaciones" ADD CONSTRAINT "asignaciones_relevamiento_id_relevamientos_id_fk" FOREIGN KEY ("relevamiento_id") REFERENCES "public"."relevamientos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asignaciones" ADD CONSTRAINT "asignaciones_encuestador_id_users_id_fk" FOREIGN KEY ("encuestador_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asignaciones" ADD CONSTRAINT "asignaciones_comercio_id_comercios_id_fk" FOREIGN KEY ("comercio_id") REFERENCES "public"."comercios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canasta_nodos" ADD CONSTRAINT "canasta_nodos_padre_fk" FOREIGN KEY ("padre") REFERENCES "public"."canasta_nodos"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "precio_auditoria" ADD CONSTRAINT "precio_auditoria_usuario_id_users_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "precios" ADD CONSTRAINT "precios_relevamiento_id_relevamientos_id_fk" FOREIGN KEY ("relevamiento_id") REFERENCES "public"."relevamientos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "precios" ADD CONSTRAINT "precios_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "precios" ADD CONSTRAINT "precios_comercio_id_comercios_id_fk" FOREIGN KEY ("comercio_id") REFERENCES "public"."comercios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "precios" ADD CONSTRAINT "precios_encuestador_id_users_id_fk" FOREIGN KEY ("encuestador_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productos" ADD CONSTRAINT "productos_codigo_variedad_canasta_nodos_codigo_fk" FOREIGN KEY ("codigo_variedad") REFERENCES "public"."canasta_nodos"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asignaciones_encuestador_idx" ON "asignaciones" USING btree ("encuestador_id");--> statement-breakpoint
CREATE INDEX "canasta_nodos_padre_idx" ON "canasta_nodos" USING btree ("padre");--> statement-breakpoint
CREATE INDEX "canasta_nodos_nivel_estado_idx" ON "canasta_nodos" USING btree ("nivel","estado");--> statement-breakpoint
CREATE INDEX "precio_auditoria_precio_idx" ON "precio_auditoria" USING btree ("precio_id");--> statement-breakpoint
CREATE INDEX "precio_auditoria_usuario_idx" ON "precio_auditoria" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "precio_auditoria_created_idx" ON "precio_auditoria" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "precios_encuestador_idx" ON "precios" USING btree ("encuestador_id");--> statement-breakpoint
CREATE INDEX "precios_fecha_idx" ON "precios" USING btree ("fecha_relevamiento");--> statement-breakpoint
CREATE UNIQUE INDEX "productos_identidad_uq" ON "productos" USING btree (lower("nombre"),coalesce(lower("marca"), ''),"unidad","cantidad_referencia");--> statement-breakpoint
CREATE INDEX "productos_codigo_variedad_idx" ON "productos" USING btree ("codigo_variedad");